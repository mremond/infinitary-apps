import { createHash, randomUUID } from "node:crypto";
import type { BatchCheckFact, BatchSendBackFact } from "@shared/batches";
import {
  advisoryCheckWords,
  CHECK_FAILURE_ALLOWED_WORDS,
  CHECK_WAITING_TO_START_WORDS,
  checkSnapshotSummary,
  checksStillRunning,
  checksThatRan,
  checksWaitingToStart,
  currentCheckStatus,
  type MainCheckEvidence,
  noCheckRan,
} from "@shared/checkSnapshot";
import { checksTimes } from "@shared/checksSpan";
import { type ContributionState, contributesUpstream } from "@shared/contributions";
import { forgeOf, hasChangeRequests, sameRequestLink } from "@shared/forge";
import { changePageUrl } from "@shared/forgeKinds";
import { inLanguage } from "@shared/i18n/current";
import { SOURCE_LANGUAGE } from "@shared/i18n/languages";
import type { RepoView } from "@shared/repos";
import {
  allowanceResetOf,
  BATCH_CHECK,
  describeCheckState,
  type Forge,
  type ForgeChange,
  type ForgeCheck,
  type ForgeCheckState,
  type ForgePull,
  isRedCheckState,
  isSignInForgeFailure,
  isTransientForgeFailure,
} from "../forge";
import { currentChange } from "../storage/changeProjection";
import type { CiWatch, TaskDelivery, TaskRecord } from "../storage/taskRecords";
import type { TaskService } from "../tasks/taskService";
import {
  type ChangeContext,
  type ChangeDeliveryOptions,
  type CheckedChange,
  changeWords,
  crewSignInText,
  numberLabel,
  placeWords,
  projectOf,
  type SignInFact,
} from "./changeContext";
import { observeCheckRepair } from "./checkRepair";
import { armWatch, type WatchedCheck, type WatchedReading } from "./checkWatch";
import { manualHoldWords } from "./deliveryWakes";
import type { DraftReadiness } from "./draftReadiness";
import type { MainBranchReading } from "./mainCheckWake";
import { approvalClosesOn } from "./mergeAuthorization";
import { type MergedStory, mergedStoryOf } from "./mergedStory";
import { told as toldOfComments } from "./pullComments";

/**
 * `merged`: no open change for the branch, and the pull request the task
 * names reads merged by its number - put in where the project lives
 * outside the app (FI3-213). Nothing is left to check or to merge.
 */
export type PrCiOverall = "green" | "red" | "pending" | "no-pr" | "merged";

/**
 * One check_pr_ci run: its text, whether it recorded a reading, and any raw
 * failure - with whether the forge typed it transient, the one kind a
 * put-in retries. `checked` is the change this run read and recorded, and
 * `merged` the task's pull request it found merged outside the app: the
 * put-in that follows acts on this run's reading alone.
 */
export type CheckRun = {
  text: string;
  recorded: boolean;
  problem?: string;
  transient?: boolean;
  signIn?: SignInFact;
  checked?: CheckedChange;
  merged?: { pull: ForgePull; forge: Forge };
};

/**
 * Who reads a check's text: the Firstmate's check_pr_ci, the crewmate's
 * check_change, or the host's own check watch (`./checkWatch.ts`).
 */
type Audience = "firstmate" | "crewmate" | "watch";

/**
 * The checks on a task's change where the project lives: read, recorded on
 * the task's delivery facts, and said to whoever asked.
 */
/**
 * The checks as the project's host reads them, without any of the batch
 * check's name. The app adds that check to a batched change's reading
 * itself and writes it nowhere the project lives, so one the host carries
 * was left by the team queue an earlier Infinitary shipped and says nothing
 * about the change.
 */
export function hostChecks<T extends { items: ForgeCheck[] }>(reading: T): T {
  const left = (check: ForgeCheck) =>
    check.name === BATCH_CHECK || check.name.startsWith(`${BATCH_CHECK} [`);
  if (!reading.items.some(left)) return reading;
  return { ...reading, items: reading.items.filter((check) => !left(check)) };
}

export class ChangeChecks {
  private readonly options: ChangeDeliveryOptions;

  constructor(
    private readonly context: ChangeContext,
    private readonly readiness: DraftReadiness,
  ) {
    this.options = context.options;
  }

  /**
   * Exact-version check status at the last reading's time, not a separate
   * judgment of the work. The crew expresses that by making its merge offer.
   */
  reading(taskId: string): { overall: PrCiOverall; at: number } | undefined {
    const delivery = this.options.tasks.get(taskId)?.delivery;
    if (!delivery || delivery.ciAt === undefined) return undefined;
    const overall = currentCheckStatus(delivery);
    return overall ? { overall, at: delivery.ciAt } : undefined;
  }

  /**
   * check_pr_ci's verdict alone, for a caller that only needs the overall
   * reading rather than the tool's descriptive text - the crewmate
   * completion-card CI gate (`CrewmateCards.pendingCiGate`), which must
   * not let a stale or never-checked reading read as green. Answers
   * "pending" unless THIS call recorded a reading: an early return or a
   * failed forge call leaves an earlier reading on the record, and that
   * reading says nothing about the head the card is about now.
   */
  async checkOverall(taskId: string): Promise<PrCiOverall> {
    return (await this.readForOffer(taskId)).overall;
  }

  /** Whether this lookup obtained the proposed change, not a judgment of its readiness. */
  async readForOffer(taskId: string): Promise<{
    overall: PrCiOverall;
    recorded: boolean;
    problem?: string;
  }> {
    const run = await this.run(taskId);
    return {
      overall: run.recorded ? (this.reading(taskId)?.overall ?? "pending") : "pending",
      recorded: run.recorded,
      ...(run.problem ? { problem: run.problem } : {}),
    };
  }

  /**
   * The check watch's read (`./checkWatch.ts`): the forge calls a reading
   * makes, answered as a typed fact rather than tool text. A reading
   * records pending as well as settled checks, so every surface follows a
   * new head immediately. Pending readings spend no repair round.
   */
  async readWatched(taskId: string): Promise<WatchedReading> {
    const located = this.context.locate(taskId);
    if ("said" in located) return { kind: "failed", transient: false, problem: located.said };
    const { record, forge } = located;
    const project = projectOf(located);
    const current = currentChange(record.delivery, located.branch);
    const branch = current.branch;
    try {
      let change = await this.checkChange(record, branch, forge, located.repo);
      if (!change && branch === record.branch && this.context.ownBatch(taskId))
        change = await this.context.pushedBranch(forge, branch, record.delivery);
      if (!change) {
        const pull = await this.namedPull(forge, current.number);
        this.assertCheckTarget(record);
        if (pull) this.observeContribution(record, forge, pull);
        this.record(record.id, pull?.merged ? "merged" : "no-pr");
        if (pull?.merged)
          this.options.tasks.delivery.recordChangeEvidence(record.id, { headSha: pull.headSha });
        return { kind: "gone" };
      }
      change = await this.readiness.readyPrerequisite(taskId, forge, change);
      const batched = branch === record.branch ? this.context.ownBatch(taskId) : undefined;
      const read = hostChecks(await forge.checks(change));
      const checks = batched ? this.withBatchCheck(taskId, batched, change.headSha, read) : read;
      const main = await this.mainEvidence(record, forge, change, checks);
      this.assertCheckTarget(record);
      if (
        contributesUpstream(record.delivery?.contribution) &&
        change.number !== undefined &&
        forge.pull
      ) {
        const pull = await forge.pull(change.number);
        this.assertCheckTarget(record);
        this.observeContribution(record, forge, pull);
      }
      const observationId = this.observeChecks(taskId, change.headSha, checks, false);
      const words = changeWords(forge, change);
      // The watch's own reading leaves the watch as it is (`watchAfter`),
      // whether its checks still run or not.
      this.record(
        record.id,
        "pending",
        { change, forge, ...project },
        "watch",
        false,
        checks.items,
        checks.complete,
        checks.problem,
        main,
      );
      if (checks.problem)
        return {
          kind: "failed",
          transient: false,
          problem: checks.problem,
          observationId,
          recorded: true,
        };
      if (this.checksPending(record, { change, forge, ...project }, checks)) {
        const failing = named(checks.items.filter((check) => isRedCheckState(check.state)));
        const batch = this.batchWake(taskId, change.headSha);
        return {
          kind: "pending",
          observationId,
          head: change.headSha,
          change: words,
          pending: named(checks.items.filter((check) => check.state === "pending")),
          ...(noneStarted(checks) ? { noneStarted: true } : {}),
          ...(failing.length > 0 ? { failing } : {}),
          ...(batch ? { batch } : {}),
        };
      }
      return {
        kind: "finished",
        observationId,
        head: change.headSha,
        change: words,
        checks: named(checks.items),
      };
    } catch (caught) {
      if (isSignInForgeFailure(caught)) {
        return {
          kind: "failed",
          transient: false,
          problem: crewSignInText(
            this.context.signInFact(forge, located.repo?.id ?? record.repoId),
          ),
          signIn: true,
        };
      }
      // A spent allowance is a wait until the host's reset (INF-2149).
      const retryAt = allowanceResetOf(caught);
      return {
        kind: "failed",
        transient: isTransientForgeFailure(caught) || retryAt !== undefined,
        problem: caught instanceof Error ? caught.message : String(caught),
        ...(retryAt !== undefined ? { retryAt } : {}),
      };
    }
  }

  /**
   * The default branch's newest run of each check a reading of the task's
   * own pull request found red (INF-1915 fix 1): evidence about the
   * failure's cause for the crew's diagnosis and the completion card, never
   * a merge input, though the card's checks hold reads it (a failure that
   * branch fails too lets the card up at once, stated from this fact). Kept
   * from the last reading while the same checks fail at
   * the same version; absent for a selected pull request, where the host
   * cannot read a branch's checks apart from a proposed change, when nothing
   * failed, or when that read itself failed.
   */
  private async mainEvidence(
    record: TaskRecord,
    forge: Forge,
    change: ForgeChange,
    checks: { items: readonly ForgeCheck[] },
  ): Promise<(MainCheckEvidence & { head: string }) | undefined> {
    if (record.delivery?.checkTarget || !forge.branchChecks) return undefined;
    const failedNames = (items: readonly Pick<ForgeCheck, "name" | "state">[]): string[] =>
      items.filter((check) => isRedCheckState(check.state)).map((check) => check.name);
    const failed = failedNames(checks.items);
    if (failed.length === 0) return undefined;
    const before = record.delivery;
    const kept = before?.mainChecks;
    if (
      kept?.head === change.headSha &&
      before?.checks?.headSha === change.headSha &&
      JSON.stringify([...failedNames(before.checks.items)].sort()) ===
        JSON.stringify([...failed].sort())
    )
      return kept;
    try {
      const main = await forge.branchChecks();
      return {
        head: change.headSha,
        sha: main.sha,
        at: this.context.now(),
        items: main.checks.items
          .filter((check) => failed.includes(check.name))
          .map(({ name, state }) => ({ name, state })),
      };
    } catch (caught) {
      console.warn("[crew] could not read the default branch's run of a failed check:", caught);
      return undefined;
    }
  }

  /**
   * The default branch's own checks (INF-833 Fix 4): the commit they were
   * read on, and each check as `checks()` names it. A host that cannot read
   * a branch's checks apart from a proposed change is unsupported, and the
   * named task's close remains the resume.
   */
  async readDefaultBranchChecks(repoId: string): Promise<MainBranchReading> {
    const repo = this.options.repos.get(repoId);
    if (!repo) return { kind: "unsupported" };
    const forge = this.options.forgeFor(repo);
    if (!forge.hasChecks || !forge.branchChecks) return { kind: "unsupported" };
    try {
      const read = await forge.branchChecks();
      return {
        kind: "read",
        sha: read.sha,
        items: read.checks.items,
        complete: read.checks.complete,
        problem: read.checks.problem,
      };
    } catch (caught) {
      console.warn("[crew] could not read the default branch's checks:", caught);
      const retryAt = allowanceResetOf(caught);
      return {
        kind: "failed",
        problem: caught instanceof Error ? caught.message : String(caught),
        ...(retryAt !== undefined ? { retryAt } : {}),
      };
    }
  }

  private assertCheckTarget(record: NonNullable<ReturnType<TaskService["get"]>>): void {
    if (
      this.options.tasks.get(record.id)?.delivery?.checkTarget?.id !==
      record.delivery?.checkTarget?.id
    )
      throw new Error("A newer pull request selection superseded this check reading.");
  }

  private async checkChange(
    record: NonNullable<ReturnType<TaskService["get"]>>,
    branch: string,
    forge: Forge,
    /** The project the change is in, as `locate` found it (INF-2510). */
    repo: RepoView | undefined,
  ): Promise<ForgeChange | null> {
    const target = record.delivery?.checkTarget;
    if (!target) return forge.changeFor(branch);
    const origin = forgeOf(repo?.origin);
    if (
      origin.host !== target.host ||
      origin.owner !== target.owner ||
      origin.name !== target.name
    ) {
      throw new Error(
        "The project no longer names the selected pull request's host and repository.",
      );
    }
    // A selected request is read by number, never by a same-named project
    // branch. Fork commits have their own checks at their exact version.
    if (
      target.headRepo &&
      target.headRepo.toLowerCase() !== `${target.owner}/${target.name}`.toLowerCase()
    ) {
      const pull = await this.context.pullOf(forge, target.number);
      if (
        pull.headRepo?.toLowerCase() !== target.headRepo.toLowerCase() ||
        (target.headRepoId !== undefined && pull.headRepoId !== target.headRepoId) ||
        pull.branch !== target.branch ||
        pull.base !== target.base
      )
        throw new Error("The selected pull request's source changed; prepare a new review.");
      if (pull.merged || pull.state !== "open") return null;
      return {
        number: pull.number,
        branch: target.branch,
        headSha: pull.headSha,
        title: pull.title,
        base: pull.base,
        url:
          pull.url ??
          changePageUrl(target.kind, target.host, `${target.owner}/${target.name}`, target.number),
      };
    }
    const change = await forge.changeFor(target.branch);
    if (change && (change.number !== target.number || change.branch !== target.branch)) {
      throw new Error(
        "The selected branch now names a different pull request; select the intended pull request again.",
      );
    }
    return change;
  }

  /**
   * A change that merges in this person's batch reads its place there as
   * the batch check (docs/forge.md, "Batches of your own"): the status name
   * the merge card's Batch check cell reads, kept on the task and written
   * nowhere the project lives. A version with no place reads as it is.
   */
  private withBatchCheck<T extends { items: ForgeCheck[] }>(
    taskId: string,
    repo: RepoView,
    head: string,
    checks: T,
  ): T {
    const batches = this.context.batches;
    const status = batches?.status(repo.id, taskId, head);
    // Every send-back of the change, at any version (INF-5097 piece 1): a
    // repaired version not in line yet still carries how often it went back.
    const sentBack = (batches?.sentBack(repo.id, taskId) ?? []).map(
      (entry): BatchSendBackFact => ({
        head: entry.head,
        reason: entry.reason,
        at: entry.at,
        ...(entry.notRun ? { notRun: entry.notRun } : {}),
        ...(entry.number !== undefined
          ? {
              change: this.options
                .forgeFor(repo)
                .label({ number: entry.number, branch: "", headSha: "", url: null }),
            }
          : {}),
        ...(entry.url ? { link: entry.url } : {}),
      }),
    );
    const kept = this.options.tasks.get(taskId)?.delivery?.queueStatus;
    if (!status && sentBack.length === 0) {
      if (kept)
        this.options.tasks.delivery.recordChangeEvidence(taskId, { queueStatus: undefined });
      return checks;
    }
    const fact: BatchCheckFact = {
      head,
      ...(status
        ? { kind: status.kind, words: status.words, ...(status.link ? { link: status.link } : {}) }
        : {}),
      ...(sentBack.length ? { sentBack } : {}),
    };
    if (JSON.stringify(kept) !== JSON.stringify(fact))
      this.options.tasks.delivery.recordChangeEvidence(taskId, { queueStatus: fact });
    if (!status) return checks;
    return {
      ...checks,
      items: [
        ...checks.items,
        {
          name: BATCH_CHECK,
          state:
            status.kind === "passed" ? "success" : status.kind === "failed" ? "failure" : "pending",
          detail: status.words,
          ...(status.link ? { link: status.link } : {}),
        },
      ],
    };
  }

  async run(taskId: string, audience: Audience = "firstmate"): Promise<CheckRun> {
    const located = this.context.locate(taskId);
    if ("said" in located) return { text: located.said, recorded: false };
    const { record, forge } = located;
    const project = projectOf(located);
    const current = currentChange(record.delivery, located.branch);
    const branch = current.branch;
    try {
      let change = await this.checkChange(record, branch, forge, located.repo);
      // A change of a project that gets batches of its own is a pushed branch
      // with no pull request of its own: its checks are read on that branch's
      // commit (docs/forge.md, "Batches of your own").
      if (!change && branch === record.branch && this.context.ownBatch(taskId))
        change = await this.context.pushedBranch(forge, branch, record.delivery);
      if (!change) {
        // The pull request the task names may have been merged or closed
        // outside the app: read it by its number, never guessed from its
        // absence among the open ones (FI3-213).
        const pull = await this.namedPull(forge, current.number);
        this.assertCheckTarget(record);
        if (pull) this.observeContribution(record, forge, pull);
        if (pull?.merged) {
          this.record(record.id, "merged");
          this.options.tasks.delivery.recordChangeEvidence(record.id, { headSha: pull.headSha });
          return {
            text: contributesUpstream(record.delivery?.contribution)
              ? `The maintainers merged ${numberLabel(forge, pull.number)}. Update the contribution note without a merge action and report the confirmed outcome; continue any remaining work.`
              : mergedWords(
                  forge,
                  pull,
                  audience,
                  approvalClosesOn(this.options.tasks.get(record.id)?.delivery, pull.number),
                  mergedStoryOf(this.options.tasks, record.id, forge, branch, pull),
                ),
            recorded: true,
            merged: { pull, forge },
          };
        }
        this.record(record.id, "no-pr");
        return {
          text: hasChangeRequests(forge.kind)
            ? `overall: no-pr\nNo open PR found for branch ${branch}.${pull ? ` ${numberLabel(forge, pull.number)} was closed without merging.` : ""}`
            : `overall: no-pr\nNothing pushed for branch ${branch}${forge.place ? ` on ${forge.place}` : ""} yet.`,
          recorded: true,
        };
      }
      change = await this.readiness.readyPrerequisite(taskId, forge, change);
      const batched = branch === record.branch ? this.context.ownBatch(taskId) : undefined;
      const read = hostChecks(await forge.checks(change));
      const checks = batched ? this.withBatchCheck(taskId, batched, change.headSha, read) : read;
      const main = await this.mainEvidence(record, forge, change, checks);
      const mergeability =
        change.number !== undefined && forge.pull ? await forge.pull(change.number) : undefined;
      this.assertCheckTarget(record);
      if (mergeability) this.observeContribution(record, forge, mergeability);
      this.observeChecks(taskId, change.headSha, checks, audience === "crewmate");
      const checked: CheckedChange = { change, forge, ...project };
      const stillRunning = this.checksPending(record, checked, checks);
      this.record(
        record.id,
        "pending",
        checked,
        audience,
        stillRunning,
        checks.items,
        checks.complete,
        checks.problem,
        main,
      );
      const lines = checks.items.map((check) => `- ${check.name}: ${describeCheckState(check)}`);
      const after = this.options.tasks.get(record.id)?.delivery;
      const watched = stillRunning && after?.ciWatch?.head === change.headSha;
      const earlyOwed = watched && after?.ciWatch?.failureSeen !== true;
      const empty = watched && noneStarted(checks);
      const held = this.readiness.readinessProblem(taskId, change);
      return {
        text: [
          `${changeWords(forge, change)} head ${change.headSha}`,
          `facts: ${JSON.stringify({
            // Passing the id back to check_change selects this same change (INF-2490).
            change: {
              id: this.context.changeRecordOf(record, change)?.id ?? null,
              base: mergeability?.base ?? change.base ?? null,
            },
            headSha: change.headSha,
            currentHead: mergeability?.headSha ?? change.headSha,
            moved:
              (record.delivery?.headSha !== undefined &&
                record.delivery.headSha !== change.headSha) ||
              (mergeability !== undefined && mergeability.headSha !== change.headSha),
            mergeable: mergeability?.mergeable ?? null,
            readiness: mergeability?.readiness ?? null,
            mergeableState: mergeability?.mergeableState ?? null,
            complete: checks.complete ?? null,
            problem: checks.problem ?? null,
            repairChecksNotInReading: (after?.ciRepair?.repairs ?? [])
              .filter(
                (repair) =>
                  !repair.outcome && !checks.items.some((check) => check.name === repair.check),
              )
              .map((repair) => ({ id: repair.id, headSha: repair.headSha, check: repair.check })),
            checks: checks.items.map((check) => ({
              ...check,
              run: check.run ?? null,
              workflow: check.workflow ?? null,
              event: check.event ?? null,
            })),
            // The default branch's newest run of each failed check: evidence
            // about the cause, never a merge input (INF-1915 fix 1).
            main: main ? { sha: main.sha, items: main.items } : null,
          })}`,
          ...(held ? [held] : []),
          ...(checks.items.length > 0 ? lines : ["- no checks reported on the head SHA"]),
          ...(noCheckRan(checks.items) && this.projectRunsNoChecks(checked)
            ? [PROJECT_NO_CHECKS_WORDS]
            : []),
          ...(empty ? emptyWords(audience) : watchWords(forge, audience, watched, earlyOwed)),
          ...(audience === "crewmate" && !stillRunning && checksWaitingToStart(checks.items).length
            ? [manualHoldWords(checksWaitingToStart(checks.items))]
            : []),
        ].join("\n"),
        recorded: true,
        checked,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return {
        text: `Could not check CI for task ${record.id}: ${message}`,
        recorded: false,
        problem: message,
        transient: isTransientForgeFailure(caught),
        ...(isSignInForgeFailure(caught)
          ? { signIn: this.context.signInFact(forge, located.repo?.id ?? record.repoId) }
          : {}),
      };
    }
  }

  /** Keep the latest maintainer reading; only a known change wakes the author. */
  private observeContribution(record: TaskRecord, forge: Forge, pull: ForgePull): void {
    if (!contributesUpstream(record.delivery?.contribution)) return;
    const next: ContributionState = {
      number: pull.number,
      state: pull.merged ? "merged" : pull.state,
      ...(pull.updatedAt ? { updatedAt: pull.updatedAt } : {}),
    };
    const before = this.options.tasks.get(record.id)?.delivery?.contributionState;
    if (
      before?.number === next.number &&
      before.state === next.state &&
      before.updatedAt === next.updatedAt
    )
      return;
    this.options.tasks.delivery.recordChangeEvidence(record.id, { contributionState: next });
    // While comments are read for this crewmate, the comment wake says what a
    // comment changed: only a new state wakes here, so one comment never wakes twice.
    const comments =
      this.options.commentsWatched?.() === true &&
      forge.pullComments !== undefined &&
      toldOfComments(record);
    if (
      before &&
      (before.state !== next.state ||
        (!comments && before.updatedAt && next.updatedAt && before.updatedAt !== next.updatedAt))
    )
      this.options.steer?.(record.id, {
        facts: {
          kind: "contribution-updated",
          change: numberLabel(forge, pull.number),
          state: next.state,
        },
        once: `contribution:${pull.number}:${next.state}:${next.updatedAt ?? pull.headSha}`,
      });
  }

  /**
   * The pull request the task names, read by its number when the branch has
   * no open one. Undefined where there is no number, the host has no pull
   * requests, or the read fails: then the reading stays "no open change".
   */
  private async namedPull(
    forge: Forge,
    prNumber: number | undefined,
  ): Promise<ForgePull | undefined> {
    if (prNumber === undefined || !forge.pull) return undefined;
    try {
      const pull = await forge.pull(prNumber);
      return pull.number === prNumber ? pull : undefined;
    } catch {
      return undefined;
    }
  }

  private checksPending(
    record: TaskRecord,
    checked: CheckedChange,
    checks: Awaited<ReturnType<Forge["checks"]>>,
  ): boolean {
    return (
      !checks.problem &&
      (checks.complete === false ||
        running(checks.items) ||
        (noCheckRan(checks.items) && !this.absenceDeclared(record, checked)))
    );
  }

  /**
   * Whether the task's crew declared that its own change at `head` runs no
   * checks at all: what its batch reads before it calls no checks green
   * (docs/forge.md, "Batches of your own").
   */
  declaredAbsent(taskId: string, head: string): boolean {
    const located = this.context.locate(taskId);
    if ("said" in located) return false;
    const { record, forge, branch } = located;
    const number = currentChange(record.delivery, branch).number;
    return this.absenceDeclared(record, {
      forge,
      change: { ...(number !== undefined ? { number } : {}), branch, headSha: head, url: null },
      ...projectOf(located),
    });
  }

  /**
   * Positive absence evidence, never inferred from an empty result or
   * history: a host with no checks, the change's project's record that it
   * runs none (docs/forge.md, "A project with no checks"), or the crew's
   * declaration for this exact version.
   */
  absenceDeclared(record: TaskRecord, checked: CheckedChange): boolean {
    if (!checked.forge.hasChecks) return true;
    if (this.projectRunsNoChecks(checked)) return true;
    const change = checked.change;
    // A pushed branch with no pull request of its own: the declaration is the task's own.
    if (change.number === undefined) {
      const own = record.delivery?.branchAbsence;
      return own?.branch === change.branch && own.headSha === change.headSha;
    }
    const reviews = [
      ...(record.delivery?.mergeReviews ?? []),
      ...(record.delivery?.mergeAuthorization?.review
        ? [record.delivery.mergeAuthorization.review]
        : []),
    ];
    // Each review is matched against the project it is in (INF-2510).
    const originOf = (repoId: string | null | undefined) =>
      forgeOf(repoId ? this.options.repos.get(repoId)?.origin : undefined);
    return reviews.some((review) => {
      const origin = originOf(review.repoId ?? record.repoId);
      return (
        review.kind === checked.forge.kind &&
        review.host === origin.host &&
        review.owner === origin.owner &&
        review.name === origin.name &&
        review.number === change.number &&
        review.branch === change.branch &&
        review.headSha === change.headSha &&
        review.absentChecks?.headSha === change.headSha
      );
    });
  }

  /**
   * Whether the checked change's project keeps the record that it runs no
   * checks (docs/forge.md, "A project with no checks"): Require pull request
   * checks is off in Settings → Projects.
   */
  projectRunsNoChecks(checked: Pick<CheckedChange, "project">): boolean {
    return (
      checked.project !== undefined &&
      this.options.repos.get(checked.project)?.noChecks !== undefined
    );
  }

  /**
   * A reading where a check ran on a change of a project recorded as running
   * none ends that record (docs/forge.md, "A project with no checks"): its
   * checks hold the merge again, and one Activity line names the check. Every
   * reading of the change's checks calls it, a merge's own reading included.
   */
  endNoChecks(
    checked: Pick<CheckedChange, "project" | "forge" | "change">,
    checks: readonly ForgeCheck[],
  ): void {
    if (!checked.project || !this.projectRunsNoChecks(checked)) return;
    const [ran] = checksThatRan(checks);
    if (ran)
      this.options.repos.endNoChecks(checked.project, {
        check: ran.name,
        change: checked.forge.label(checked.change),
      });
  }

  /**
   * Store raw check facts. The merge offer carries the crew's judgment. Changed facts
   * create a ci event; an unchanged reading only refreshes its time. Raw
   * readings do not judge readiness or settle declared repairs.
   */
  private record(
    taskId: string,
    overall: PrCiOverall,
    checked?: CheckedChange,
    audience: Audience = "firstmate",
    stillRunning = false,
    checks: ForgeCheck[] = [],
    complete?: boolean,
    problem?: string,
    main?: MainCheckEvidence & { head: string },
  ): void {
    const at = this.context.now();
    const task = this.options.tasks.get(taskId);
    if (!task) return;
    const change = checked?.change;
    const label = checked ? checked.forge.label(checked.change) : undefined;
    if (checked) {
      this.noteChange(taskId, checked);
      this.endNoChecks(checked, checks);
    }
    const round = change ? observeCheckRepair(task.delivery, change.headSha, checks, at) : {};
    // The reading names the pull request it is of: the change record binds
    // it by that number, never by its head alone (INF-1873).
    const snapshot = checked
      ? {
          headSha: checked.change.headSha,
          ...(checked.change.number !== undefined ? { prNumber: checked.change.number } : {}),
          items: checks.map(({ name, state, manual, failureAllowed, advisory }) => ({
            name,
            state,
            ...(manual ? { manual } : {}),
            ...(failureAllowed ? { failureAllowed } : {}),
            ...(advisory ? { advisory } : {}),
          })),
          absenceDeclared: this.absenceDeclared(task, checked),
          ...(complete !== undefined ? { complete } : {}),
          ...(problem ? { problem } : {}),
        }
      : undefined;
    const actual = snapshot ? checkSnapshotSummary(snapshot).overall : overall;
    const where = change
      ? ` on ${change.number !== undefined ? "PR " : ""}${label} head ${change.headSha}`
      : "";

    // The head the reading saw rides beside it: a reviewer is briefed at
    // that head, and a review verdict names the head it read.
    const watch = watchAfter(
      task.delivery?.ciWatch,
      checked,
      audience,
      stillRunning,
      at,
      checks.some((check) => isRedCheckState(check.state)),
    );
    this.options.tasks.delivery.recordChangeEvidence(
      taskId,
      {
        ci: actual === "none" ? undefined : actual,
        ciAt: at,
        checks: snapshot,
        // An advisory check's times would move the pass time of checks it does not decide.
        ...checksTimes(
          actual,
          checks.filter((check) => check.advisory === undefined),
        ),
        ...(change ? { headSha: change.headSha } : {}),
        ...(change?.base ? { prBase: change.base } : {}),
        mainChecks: main,
        ...round,
        ...watch,
      },
      changesCheckState(
        task.delivery,
        actual === "none" ? undefined : actual,
        change?.headSha,
        round,
      ) || JSON.stringify(task.delivery?.checks) !== JSON.stringify(snapshot)
        ? {
            kind: "ci",
            text: `CI ${actual}${where}`,
            data: { checks: snapshot },
            feed: false,
          }
        : undefined,
    );
  }

  /**
   * A change the record has not named yet: its label from the forge, its
   * number and link where the host has them, and one `pr_opened` event. The
   * slot's head and the checks read at it were the change it named before -
   * its own, or a selected pull request (`docs/forge.md`, "A requested
   * merge") - so the same write names the new change's head and drops that
   * reading; the number and the head never name two changes (INF-1884 R2).
   */
  noteChange(taskId: string, checked: CheckedChange): void {
    const task = this.options.tasks.get(taskId);
    if (!task) return;
    const { change, forge } = checked;
    const label = forge.label(change);
    const url = forge.url(change);
    const known =
      task.delivery?.changeLabel ??
      (task.delivery?.prNumber !== undefined ? `#${task.delivery.prNumber}` : undefined);
    const oldURL = task.delivery?.prUrl;
    const replaced =
      change.number !== undefined && !!url && url !== oldURL && !sameRequestLink(url, oldURL);
    const resetChecks = {
      checks: undefined,
      ci: undefined,
      ciAt: undefined,
      ciStartedAt: undefined,
      ciFinishedAt: undefined,
      mainChecks: undefined,
    };
    if (known === label && !replaced) {
      const headMoved = task.delivery?.headSha !== change.headSha;
      const baseMoved = change.base !== undefined && task.delivery?.prBase !== change.base;
      // A refresh keeps the opening event and only drops checks from a different head.
      if (headMoved || baseMoved || (url && oldURL !== url) || task.delivery?.changeLabel !== label)
        this.options.tasks.delivery.recordChangeEvidence(taskId, {
          changeLabel: label,
          ...(url ? { prUrl: url } : {}),
          ...(change.base !== undefined ? { prBase: change.base } : {}),
          ...(headMoved ? { headSha: change.headSha, ...resetChecks } : {}),
        });
      return;
    }
    this.options.tasks.delivery.recordChangeEvidence(
      taskId,
      {
        changeLabel: label,
        prUrl: url ?? undefined,
        prNumber: change.number,
        prBase: change.base,
        headSha: change.headSha,
        ...resetChecks,
      },
      {
        kind: "pr_opened",
        text:
          change.number !== undefined
            ? `PR ${label}${url ? ` ${url}` : ""}`
            : `Pushed the branch ${label}${forge.place ? ` to ${forge.place}` : ""}`,
        feed: true,
      },
    );
  }

  /** An unread observation survives a restart until it reaches the crew's durable inbox. */
  /**
   * What the check watch's wake says about a change still waiting in this
   * person's batch: undefined for any other change, or once its batch failed.
   */
  private batchWake(taskId: string, head: string): string | undefined {
    const own = this.context.ownBatch(taskId);
    const status = own ? this.context.batches?.status(own.id, taskId, head) : undefined;
    return status && status.kind !== "failed"
      ? `The change waits in this project's batch of approved changes (${status.words}). The app merges the batch once its checks pass, so nothing is needed from you.`
      : undefined;
  }

  private observeChecks(
    taskId: string,
    head: string,
    checks: { items: readonly ForgeCheck[]; complete?: boolean; problem?: string },
    forwarded: boolean,
  ): string {
    const previous = this.options.tasks.get(taskId)?.delivery?.ciObservation;
    const signature = createHash("sha256").update(JSON.stringify({ head, checks })).digest("hex");
    let observation =
      previous?.signature === signature
        ? previous
        : { id: randomUUID(), signature, forwarded: false };
    if (forwarded && !observation.forwarded) observation = { ...observation, forwarded: true };
    if (observation !== previous)
      this.options.tasks.delivery.recordChangeEvidence(taskId, { ciObservation: observation });
    return observation.id;
  }
}

/**
 * Whether a reading changes the check state the record already holds: its
 * reported result, the head it read, or durable repair observations.
 * Comparing a reading never settles a declared repair. The quiet
 * refresh reads an open pull request every five minutes, and a reading
 * that changes none of these writes no `ci` event (INF-721 friction 6:
 * 239 identical rows a day for one idle pull request).
 */
function changesCheckState(
  before: TaskDelivery | null | undefined,
  overall: PrCiOverall | undefined,
  headSha: string | undefined,
  round: Partial<TaskDelivery>,
): boolean {
  if (!before || before.ci !== overall) return true;
  if (headSha !== undefined && before.headSha !== headSha) return true;
  return (
    ("ciRounds" in round && round.ciRounds !== before.ciRounds) ||
    ("ciCapAt" in round && round.ciCapAt !== before.ciCapAt) ||
    ("ciRepair" in round && JSON.stringify(round.ciRepair) !== JSON.stringify(before.ciRepair))
  );
}

/**
 * A complete reading where no check that holds ran - none reported, or
 * every one skipped or advisory. It stays pending until the crew declares absence (docs/forge.md),
 * but nothing is running for a wake to report on.
 */
function noneStarted(checks: { items: { state: ForgeCheckState }[]; complete?: boolean }): boolean {
  return checks.complete !== false && noCheckRan(checks.items);
}

/**
 * What a watched reading with no check started says (INF-4215): checks may
 * still be on their way, so the watch stands, but if this pull request runs
 * none, only an absentChecks declaration or a report ends the wait.
 */
function emptyWords(audience: Audience): string[] {
  if (audience === "crewmate") {
    return [
      "No check that holds the merge has started at this version (a skipped or advisory check holds nothing), and nothing declares that it has none. If checks are still to start, end your turn: the app is watching and wakes you when they finish, or when its watch ends with none started. If this pull request runs no checks, declare that now with check_change absentChecks (its version, the evidence and the local gate run at it), and the reading then says no checks; add project true when the evidence shows the project's default branch runs none, so its later changes need no declaration. If you have no such evidence, report that this pull request has no checks and nothing to declare instead of waiting; such a reading alone stays pending.",
    ];
  }
  return [
    "No check that holds the merge has started at this version (a skipped or advisory check holds nothing), and nothing declares that it has none. The host is watching in case checks start, and wakes the crewmate when they finish or when its watch ends with none started. If this pull request runs no checks, the crewmate ends the wait by declaring that with check_change absentChecks, for the whole project when its default branch runs none, or by reporting that it has no evidence to declare; such a reading alone stays pending. On the captain's word, project-settings requireChecks false records the same for the project's later changes.",
  ];
}

/** Some check is still queued or running: the only reading a watch waits on. */
function running(items: { state: ForgeCheckState }[]): boolean {
  return checksStillRunning({ items });
}

/**
 * The checks a wake names; one waiting for a person to start it says so,
 * and so do one that failed where its project allows it and an advisory one.
 */
function named(
  items: {
    name: string;
    state: ForgeCheckState;
    manual?: boolean;
    failureAllowed?: boolean;
    advisory?: ForgeCheckState;
  }[],
): WatchedCheck[] {
  return items.map(({ advisory, ...item }) =>
    advisory
      ? // A wake is served to the crew's model, which reads English.
        { name: item.name, state: inLanguage(SOURCE_LANGUAGE, () => advisoryCheckWords(advisory)) }
      : item.manual
        ? { name: item.name, state: CHECK_WAITING_TO_START_WORDS, manual: true }
        : item.failureAllowed
          ? { name: item.name, state: CHECK_FAILURE_ALLOWED_WORDS }
          : { name: item.name, state: item.state },
  );
}

/**
 * What a reading does to the check watch (docs/forge.md, "The check
 * watch"): checks still running on a host that has them arm it at the head
 * read; the crewmate's own reading of anything else ends it, since the
 * crewmate already knows; every other reading - the Firstmate's, the
 * watch's own - leaves it, so the crewmate is still woken.
 */
function watchAfter(
  existing: CiWatch | undefined,
  checked: CheckedChange | undefined,
  audience: Audience,
  stillRunning: boolean,
  at: number,
  sawRed = false,
): { ciWatch?: CiWatch } {
  if (!checked || audience === "watch") return {};
  if (stillRunning && checked.forge.hasChecks) {
    const armed = armWatch(existing, checked.change.headSha, at);
    // The crewmate already read the red check, so the early wake is dropped.
    if (audience === "crewmate" && sawRed) return { ciWatch: { ...armed, failureSeen: true } };
    return { ciWatch: armed };
  }
  return audience === "crewmate" && existing ? { ciWatch: undefined } : {};
}

/**
 * What a reading where no check ran says in a project recorded as running
 * none (docs/forge.md, "A project with no checks").
 */
export const PROJECT_NO_CHECKS_WORDS =
  "This project is recorded as running no checks (Require pull request checks is off in its settings), so this reading counts as no checks: nothing is watched and no wake will come. The first check that runs on any of its changes ends the record, and checks hold the merge again.";

function watchWords(
  forge: Forge,
  audience: Audience,
  watched: boolean,
  earlyOwed = false,
): string[] {
  if (audience === "crewmate" && !forge.hasChecks) {
    return [
      `${forge.place ?? "This project's host"} runs no checks the app can watch, so no wake will come: the local gate you ran is the evidence.`,
    ];
  }
  if (!watched) return [];
  if (audience !== "crewmate") {
    return [
      "The host is watching these checks and will wake the crewmate when the first check fails and when they finish.",
    ];
  }
  return earlyOwed
    ? [
        "The app is watching these checks and will wake you once when the first check fails, and once when they finish. End your turn now and wait for that message; do not call check_change again until it comes.",
      ]
    : [
        "The app is watching these checks and will wake you once when they finish. You already read a failed check, so that early wake will not come. End your turn now and wait; do not call check_change again until it comes.",
      ];
}

/**
 * A reading that found the task's pull request merged outside the app, in
 * its reader's words (INF-3799). `closes`: the captain's kept approval
 * already says this merge closes the task, so the host closes it without a
 * merge card. `story`: the merge card its published story can show, or why
 * it has none, the verdict show_merge_card and emit_card read too.
 */
function mergedWords(
  forge: Forge,
  pull: ForgePull,
  audience: Audience,
  closes: boolean,
  story: MergedStory | undefined,
): string {
  const next =
    audience !== "crewmate"
      ? "Nothing is left to merge. Read the task's remaining work before closing it; a merged PR alone does not mean its work is complete."
      : closes
        ? "Nothing is left to merge, and the captain's kept merge approval already says this merge closes the task: put up no merge card. Finish any remaining work; once your turn ends with nothing else open on the task, the app closes it as merged."
        : story && "refused" in story
          ? `Nothing is left to merge. ${story.refused}`
          : "Nothing is left to merge. Continue any remaining work; when this merge finished all of it, put up your merge card for this pull request with after close, and the app closes the task as merged without merging again.";
  return [
    "overall: merged",
    `${numberLabel(forge, pull.number)} was merged ${placeWords(forge)} outside the app${pull.mergedSha ? ` as ${pull.mergedSha}` : ""}.`,
    `head: ${pull.headSha}`,
    next,
  ].join("\n");
}
