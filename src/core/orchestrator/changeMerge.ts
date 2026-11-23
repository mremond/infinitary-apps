import { CONTRIBUTION_MERGE_REFUSAL } from "@shared/contributions";
import { forgeOf, hasChangeRequests } from "@shared/forge";
import { fixedHoldWords, overridePasses, softHoldWords } from "@shared/holds";
import { englishOf, type Said, said } from "@shared/i18n/said";
import { isForkReview, mergeRuleWords, type SkippedRule } from "@shared/mergeReview";
import { isMergeConflict } from "@shared/plainProblem";
import {
  assertBranchStoryAddress,
  hostedPresentation,
  samePresentationDestination,
} from "@shared/presentationDestination";
import { deliveryForRecord, opensPullRequest, type RepoView } from "@shared/repos";
import {
  BATCH_WAITING_WORDS,
  type Forge,
  ForgeBaseMoved,
  type ForgeChange,
  ForgeError,
  ForgeMergeUnconfirmed,
  type ForgePull,
  type ForgeReadiness,
  type ForgeRuleset,
  forkStoryForge,
  isRedCheckState,
  isSignInForgeFailure,
  isTransientForgeFailure,
  messageWithoutPresentation,
} from "../forge";
import { wayToSend } from "../forge/mergeWays";
import { currentChange } from "../storage/changeProjection";
import type { QueueApprovalRemoval, TaskRecord } from "../storage/taskRecords";
import { requireNamed } from "../workspace/naming";
import type { ChangeChecks } from "./changeChecks";
import {
  type ChangeContext,
  type ChangeDeliveryOptions,
  numberLabel,
  placeWords,
  projectOf,
  type SignInFact,
} from "./changeContext";
import {
  candidateHead,
  MERGE_CHECKS_HOLD_REASON,
  standingAuthorization,
} from "./mergeAuthorization";
import { type MergedStory, mergedStoryOf } from "./mergedStory";
import {
  pinnedRequestRepo,
  publicationRepo,
  requestAtRepo,
  savedRequestAtRepo,
} from "./publicationRepo";
import { carryPassedReview } from "./reviewCarry";
import { taskContributesUpstream } from "./workShape";

/**
 * A merge or close outcome. `text` is the tool text the Firstmate reads;
 * `problem`, when set, is the raw failure it quotes (the host's or the
 * network's words), so a feed line can say what it means through
 * `plainProblem` while the raw words stay on the record; `plain`, when set,
 * is the reason in the app's own words where `text` carries the raw check
 * list.
 */
export type PrOutcome = {
  ok: boolean;
  text: string;
  problem?: string;
  plain?: string;
  /** The merge was refused because current readiness was not established (no sign-in or forge failure). */
  notGreen?: boolean;
  /**
   * Why a guarded merge stopped, as a typed fact (FI3-304): the settle path
   * keeps or ends the captain's approval on it, never on the words.
   */
  stop?: MergeStop;
  /** The merge GitHub confirmed, at the head it merged. */
  receipt?: { head: string; sha?: string; already?: boolean };
  /**
   * A merge's line in Activity: the result without its address or closing
   * period ("Merged #709 on GitHub", INF-1845).
   */
  line?: string;
  /** The merge's line as a fact, worded where it is shown; `line` is its English (docs/i18n.md, "Saved facts"). */
  lineSaid?: Said;
  /**
   * The host refused who the app is (git integration PR 1.2): not signed
   * in to it here, or a sign-in it no longer accepts. The settle path
   * turns this into the not-signed-in refusal and its two ways.
   */
  signIn?: SignInFact;
  /**
   * On a stop for GitHub's branch rules (INF-4360): whether this sign-in may
   * skip every rule set holding the merge, with squash allowed, read once
   * with the reading a merge past the rules makes - the rules it would skip,
   * or the host's words on why it may not. Absent when that reading could
   * not tell.
   */
  skip?: { may: true; rules: SkippedRule[] } | { may: false; why: string };
  /**
   * The host's own reference to a merge it took and has not confirmed
   * (`ForgeMergeUnconfirmed.mergeTask`): kept on the approval's attempt, so
   * a later read asks the host how it ended.
   */
  mergeTask?: string;
};

/**
 * Why a merge under the captain's kept approval stopped (FI3-304):
 * `conflict` / `behind` need the change brought up to date; `moved` is a
 * head the approval does not cover; `checks` the checks on the head;
 * `protected` GitHub's branch rules; `computing` GitHub not knowing yet;
 * `draft` a draft; `closed` a pull request no longer open; `identity` a
 * different pull request for the branch; `withdrawn` the approval ended
 * before the request went out; `sign-in` the app's sign-in; `transient` a
 * hiccup before anything was sent; `outcome` a request whose answer never
 * came and whose result could not be read back; `guidance` the captain's
 * newer words still wait for the crewmate's declaration (FI3-662);
 * `refused` a cause that needs fixing before merging can proceed.
 */
export type MergeStop =
  | "conflict"
  | "behind"
  | "moved"
  | "checks"
  | "protected"
  | "computing"
  | "draft"
  | "closed"
  | "identity"
  | "withdrawn"
  | "sign-in"
  | "transient"
  | "outcome"
  | "guidance"
  | "queue"
  /** The host's own merge queue took the change and has not merged it yet. */
  | "host-queue"
  /** The host removed the change from its own merge queue without merging it. */
  | "host-removed"
  /** The review's questions wait on the captain's answers (INF-5396's audit, finding 2). */
  | "questions"
  | "refused";

/**
 * What a merge under the captain's kept approval holds to (FI3-304): the one
 * head and pull request it covers, whether the host runs it unattended
 * (GitHub must say the change may merge before anything is sent), and the
 * last look right before the request goes out - a refusal there stops it.
 */
export type MergeBoundary = {
  /**
   * `mark` true is the same look before a queue-pr version is put in line
   * for the project's batch: nothing is recorded, since no merge request goes out.
   */
  beforeDispatch: (head: string, mark?: boolean) => string | undefined;
  unattended: boolean;
};

export type MergeGuard = {
  head: string;
  /** Absent for a pushed branch that merges in this person's batch. */
  prNumber?: number;
  unattended: boolean;
  /** When the approval was given: its change's place in the line of a batch. */
  approvedAt?: number;
  /** A hold on the approval right now: the merge waits on it and the approval stands. */
  held?: () => string | undefined;
  /**
   * This version already went to the host's own merge queue under this
   * approval: its place there is read before anything is sent. `answered`
   * is its crewmate's answer to the host removing it, which sends that
   * version once more; without one only the captain's own click does.
   */
  handed?: () => { answered: boolean } | undefined;
  /**
   * A merge of this pull request sent earlier, from this task or another,
   * whose outcome was never read back: nothing is sent until it is, and the
   * merge waits on that outcome (`stop: "outcome"`).
   */
  unresolved?: () => string | undefined;
  /** Where the approved pull request lives: what a read-back reads, never the selected project. */
  place?: { host: string; owner: string; name: string };
  beforeDispatch: (head: string, mark?: boolean) => string | undefined;
};

/**
 * Backoff between put-in attempts retried for a transient host/network
 * failure, or for a refusal because the main branch moved while it merged.
 */
export const MERGE_RETRY_DELAYS_MS = [300, 900];

/**
 * The gaps between reads of a pull request while GitHub has not decided
 * whether it can merge (INF-457): after the captain's click on a pull
 * request the task did not open, and before a merge GitHub refused because
 * the main branch moved is sent again. GitHub answers `mergeable: null`
 * while a check it has just started works out a test merge, often just
 * after the default branch moved, and asks to be read again shortly. Half a
 * minute in all; still undecided after the last read, nothing is sent.
 */
export const UNDECIDED_REREAD_MS = [1_000, 2_000, 3_000, 5_000, 8_000, 11_000];

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A merge attempt with what decides whether it is tried again: `transient`
 * a hiccup, `dispatched` a request that went out, `baseMoved` a refusal
 * because the main branch moved while it merged, with nothing else read
 * that stops it. None of them leaves the merge.
 */
export type MergeAttempt = PrOutcome & {
  transient?: boolean;
  dispatched?: boolean;
  baseMoved?: boolean;
  /** A merge request whose answer never came on a host whose merge names no version: never sent again. */
  noResend?: boolean;
};

/**
 * An approval that ended, newer guidance that held it (`guidance`), or a
 * merge sent earlier whose outcome is unread (`outcome`), at its last check
 * before the merge request left: nothing was sent.
 */
export class MergeWithdrawn extends ForgeError {
  constructor(
    why: string,
    readonly stop: "withdrawn" | "guidance" | "outcome" = "withdrawn",
  ) {
    super("refused", why, true);
    this.name = "MergeWithdrawn";
  }
}

/**
 * The approval's last checks before a merge, and the attempt it records
 * (`held`, `check`, then `onSent`), at the moment the request leaves: on a
 * host whose merge names no version they run inside the merge as the request
 * leaves, after every read before it, and the hook is returned for
 * `Forge.putIn`; elsewhere they run now. Newer guidance (`held`) or a check
 * that answers why stops the merge (`MergeWithdrawn`), and so does a merge
 * of the pull request sent earlier whose outcome is unread (`unresolved`). On a
 * host whose merge names no version only a kept approval's merge (`guard`) is
 * sent: its attempt record is what reads back a merge whose outcome is unknown.
 */
export function atDispatch(
  forge: Forge,
  guard: Pick<MergeGuard, "held" | "unresolved"> | undefined,
  check: () => string | undefined,
  onSent: () => void,
): (() => void) | undefined {
  const run = () => {
    if (!guard && forge.mergeNamesNoVersion)
      // i18n-exempt: served to the first mate in the merge answer, stays English
      throw new MergeWithdrawn(
        `${forge.place} merges whatever version the branch is at when it takes the merge, so the app sends it only under the captain's merge approval from the merge card, or the app's under autonomy, which reads back a merge whose outcome is unknown before sending again`,
      );
    const earlier = guard?.unresolved?.();
    if (earlier) throw new MergeWithdrawn(earlier, "outcome");
    const hold = guard?.held?.();
    if (hold) throw new MergeWithdrawn(hold, "guidance");
    const why = check();
    if (why) throw new MergeWithdrawn(why);
    onSent();
  };
  if (forge.mergeNamesNoVersion) return run;
  run();
  return undefined;
}

/** What a merge says of a change that joins this person's batch. */
export const BATCH_MERGE_WORDS = {
  needsCard:
    "Cannot merge yet: this project merges approved changes together, as one batch pull request. A change joins the batch from its merge card at its current version: its crewmate puts the card up, and the captain's click on it, his own words recorded as passing asking first while it is up at that version, or the task's autonomy approves that version.",
} as const;

/** A merge's refusal on the saved story names the soft hold the captain's words pass (INF-1365). */
function storyHeld(caught: unknown): never {
  const message = caught instanceof Error ? caught.message : String(caught);
  throw new Error(`${message} ${softHoldWords("story", "firstmate")}`);
}

/**
 * The task's change merged, or closed, where the project lives: with this
 * person's batch where the project is batched, under the captain's kept
 * approval when the host runs it.
 */
export class ChangeMerge {
  private readonly options: ChangeDeliveryOptions;
  /** The story changes after a click already noted on their task's record. */
  private readonly storyNoted = new Set<string>();

  constructor(
    private readonly context: ChangeContext,
    private readonly checks: ChangeChecks,
  ) {
    this.options = context.options;
  }

  /**
   * Put the task's change in where the project lives. Re-check the complete
   * head check suite at the moment of the click, then ask the forge to put
   * in that exact change at that exact head: an explicit squash with the
   * checked title on GitHub, a fast-forward on a plain Git host.
   *
   * A network/host hiccup on either the recheck or the put-in itself is not
   * a verdict about the change - it is retried a couple of times with a
   * short backoff before giving up. So is a refusal because the main branch
   * moved while the host merged: each try after it reads the pull request
   * until the host has decided, and sends only where it says the change may
   * merge. A durable refusal (checks actually failed, a stale head, branch
   * protection, a conflict) is never retried here: it returns straight away
   * so the captain's own retry - after fixing whatever is wrong - is the one
   * that runs next.
   */
  async merge(taskId: string, guard?: MergeGuard, boundary?: MergeBoundary): Promise<PrOutcome> {
    const record = this.options.tasks.get(taskId);
    if (
      taskContributesUpstream(
        record,
        record?.repoId ? this.options.repos.get(record.repoId) : undefined,
      )
    )
      return {
        ok: false,
        text: CONTRIBUTION_MERGE_REFUSAL,
      };
    let attempt: MergeAttempt = { ok: false, text: "" };
    let settle = false;
    for (let i = 0; i < MERGE_RETRY_DELAYS_MS.length + 1; i++) {
      attempt = await this.mergeOnce(taskId, guard, boundary, settle);
      if (attempt.ok || !(attempt.transient || attempt.baseMoved)) break;
      settle ||= attempt.baseMoved === true;
      // A request that went out and whose answer never came may have merged:
      // read the pull request back before anything is sent again (FI3-304).
      if (guard && attempt.dispatched && attempt.transient) {
        const after = await this.readBack(taskId, guard);
        if (after.merged) return after.merged;
        if (after.closed) return after.closed;
        if (after.open !== true || attempt.noResend) {
          return {
            ...stripAttempt(attempt),
            // A send whose host names no version may still go in: never "moved".
            stop: after.open === false && !attempt.noResend ? "moved" : "outcome",
          };
        }
      }
      if (attempt.noResend) break;
      const delay = MERGE_RETRY_DELAYS_MS[i];
      if (delay === undefined) break;
      await sleep(delay);
    }
    const outcome = stripAttempt(attempt);
    if (guard && !outcome.ok && attempt.transient && !outcome.stop) {
      return { ...outcome, stop: attempt.dispatched ? "outcome" : "transient" };
    }
    return this.withSkip(taskId, guard, outcome, "current");
  }

  /**
   * One try. `settle` follows a refusal because the main branch moved: the
   * pull request is read until the host decides, and only a change it says
   * may merge is sent, the captain's own click included.
   */
  private async mergeOnce(
    taskId: string,
    guard?: MergeGuard,
    boundary?: MergeBoundary,
    settle = false,
  ): Promise<MergeAttempt> {
    const batched = await this.mergeInBatch(taskId, guard);
    if (batched) return batched;
    // The change this re-check read, never an earlier one: a stale earlier
    // success must never survive a failed re-check.
    const status = await this.checks.run(taskId);
    const reading = this.checks.reading(taskId);
    const checked = status.checked;
    if (status.problem) {
      return {
        ok: false,
        text: `Cannot merge yet - the checks could not be read. ${status.text}`,
        problem: status.problem,
        ...(status.transient ? { transient: true } : {}),
        ...(status.signIn ? { signIn: status.signIn } : {}),
        ...(guard && status.signIn ? { stop: "sign-in" as const } : {}),
      };
    }
    // The pull request the task names was merged outside the app: nothing
    // is sent, and the merge is the one already made (FI3-213).
    const merged = status.merged;
    if (reading?.overall === "merged" && merged)
      return alreadyMerged(merged.forge, merged.pull, guard?.head);
    // The approval pins one pull request: no open one for the branch is
    // read back by its number, merged or closed, never taken as either.
    if (guard && reading?.overall === "no-pr") {
      const after = await this.readBack(taskId, guard);
      if (after.merged) return after.merged;
      if (after.closed) return after.closed;
    }
    if (guard && checked) {
      if (checked.change.number !== guard.prNumber) {
        return {
          ok: false,
          text: `Cannot merge: the branch's open pull request is ${checked.forge.label(checked.change)}, not the ${guard.prNumber === undefined ? "pushed branch" : numberLabel(checked.forge, guard.prNumber)} the captain approved.`,
          plain: "its pull request is not the one you approved",
          stop: "identity",
        };
      }
      if (checked.change.headSha !== guard.head) {
        return {
          ok: false,
          text: `Cannot merge yet: the pull request is at ${checked.change.headSha}, and the captain's approval covers ${guard.head}. A repair of the approved change is declared with check_change conflictRepair.`,
          plain: "it changed after the version you approved",
          stop: "moved",
        };
      }
    }
    // The host's own merge queue took this version: its place there is read
    // before any gate, since the checks and the branch's rules are the
    // queue's to hold now (docs/forge.md, "The host's merge queue").
    const handed =
      guard && checked ? await this.handedOver(checked.forge, checked.change, guard) : undefined;
    if (handed) return handed;
    // Actual check results are a soft hold: the captain's override on
    // the checks passes them at the version it covers. GitHub's own rules
    // still decide whether it merges.
    const unfinished = reading?.overall === "red" || reading?.overall === "pending";
    const checksPassed =
      unfinished &&
      status.recorded &&
      checked !== undefined &&
      overridePasses(
        this.options.tasks.get(taskId)?.delivery,
        "checks",
        checked.change.headSha,
        checked.change.number === undefined
          ? undefined
          : (checked.forge.url(checked.change) ?? null),
      );
    if (!checked || (!checksPassed && (!status.recorded || reading?.overall !== "green"))) {
      const problem = this.options.tasks.get(taskId)?.delivery?.checks?.problem;
      const reason = problem
        ? `the checks cannot be read: ${problem}`
        : reading?.overall === "red"
          ? "the checks failed"
          : reading?.overall === "no-pr"
            ? "no open pull request was found for it"
            : MERGE_CHECKS_HOLD_REASON;
      return {
        ok: false,
        text: `Cannot merge yet - ${reason}. ${status.text}${unfinished ? ` ${softHoldWords("checks", "firstmate")}` : ""}`,
        notGreen: true,
        ...(guard ? { stop: "checks" as const } : {}),
        plain: reason,
      };
    }
    const { change, forge } = checked;
    let dispatched = false;
    try {
      const record = this.options.tasks.get(taskId);
      const target = record?.delivery?.checkTarget;
      const fork = target && isForkReview(target) ? target : undefined;
      // The task's own branch is checked where it was made, commit by
      // commit. Any other change the task names was opened elsewhere or
      // checked when the task opened it; its title is checked below.
      const own = !fork && change.branch === record?.branch;
      if (own && record && !record.delivery?.presentation) await this.context.branchHome(record);
      // Another change is read in the project it is in (INF-2510).
      const elsewhere =
        !own && record && change.number !== undefined
          ? this.projectOfNumber(record, change.number)
          : undefined;
      const repo =
        elsewhere ?? (record?.repoId ? this.options.repos.get(record.repoId) : undefined);
      const dir = own
        ? await this.context.validateRange(record, change.branch, forge, change.headSha)
        : (repo?.path ?? record?.repoDir ?? "");
      if (!fork && hasChangeRequests(forge.kind))
        requireNamed(change.title ?? "", "pull request title", this.options.namingRule?.() ?? null);
      const fresh = this.options.tasks.get(taskId) ?? record;
      if (fresh && !fork) {
        await carryPassedReview({
          tasks: this.options.tasks,
          taskId,
          record: fresh,
          repoDir: dir,
          head: change.headSha,
        });
      }
      // A merge the host runs on the captain's kept approval goes only where
      // the host itself says the change may merge now: the app never leans on
      // a sign-in that could bypass the branch's rules (FI3-304 section 4).
      // Guidance is read after the carry, so a newer word during that wait
      // still stops the merge.
      // A host whose merge names no version is read this way on every merge,
      // the captain's own click included: its merge would not hold to the
      // version or, for an owner's sign-in, to the branch's rules.
      if (
        hasChangeRequests(forge.kind) &&
        (guard?.unattended || boundary?.unattended || settle || forge.mergeNamesNoVersion)
      ) {
        if (change.number === undefined)
          return { ok: false, text: "Cannot merge: the pull request identity is missing." };
        const number = guard?.prNumber ?? change.number;
        const head = guard?.head ?? change.headSha;
        const { pull } = await readDecided(
          () => this.context.pullOf(forge, number),
          head,
          settle ? UNDECIDED_REREAD_MS : [],
        );
        // The host's own merge queue merges whenever its checks pass: a merge
        // made since the checks were read is the merge, never a closed pull request.
        if (pull.merged) return alreadyMerged(forge, pull, head);
        const held = readinessStop(forge, pull, { head });
        if (held) return held;
      }
      // The change's saved story, the same way a continuing merge reads it.
      // A saved-story card names no review: its ordinary merge still reads
      // the selected fork by number and uses the crew's title, not the
      // contributor's title or a same-named project branch.
      const storyForge = fork ? forkStoryForge(forge, fork, taskId) : forge;
      const storied = await this.withPublishedStory(taskId, storyForge, change, guard);
      if ("held" in storied)
        return { ok: false, text: `Cannot merge yet: ${storied.held}.`, stop: "guidance" };
      const publishedChange = storied.change;
      if (fork) {
        // Recheck the reviewed source/version after the story's awaits,
        // including when no story exists, before the merge.
        if (!(await storyForge.changeFor(change.branch)))
          return {
            ok: false,
            text: "Cannot merge: the contributor's request is no longer open.",
            stop: "closed",
          };
      }
      if (!hasChangeRequests(forge.kind) && repo) {
        const destination = this.options.tasks.delivery
          .changePresentation(taskId, change.branch)
          ?.revisions.at(-1)?.destination;
        if (destination && !hostedPresentation(destination) && destination.kind === "branch") {
          const actual = await forge.storyDestination?.();
          if (!actual || !samePresentationDestination(destination, actual))
            throw new Error("The story's destination or audience changed.");
          assertBranchStoryAddress(destination, this.context.approvedOrigin(taskId));
        }
      }
      // The merge the project allows, read where it lives before anything is sent.
      const way = await wayToSend(forge, publishedChange);
      const held = guard?.held?.();
      if (held) return { ok: false, text: `Cannot merge yet: ${held}.`, stop: "guidance" };
      const leaving = atDispatch(
        forge,
        guard,
        () => guard?.beforeDispatch(change.headSha) ?? boundary?.beforeDispatch(change.headSha),
        () => {
          dispatched = true;
        },
      );
      const receipt = leaving
        ? await forge.putIn(publishedChange, publishedChange.headSha, way, leaving)
        : await forge.putIn(publishedChange, publishedChange.headSha, way);
      if (receipt?.queued) return hostQueued(forge, change);
      // A host whose merge names no version says which one it merged: a
      // push between the app's read and the merge went in too, is told, and
      // the receipt names the version that merged.
      const newer = otherMerged(change.headSha, receipt?.mergedHead);
      return {
        ok: true,
        ...this.putInText(taskId, forge, change, newer),
        ...(guard
          ? {
              receipt: {
                head: newer ?? change.headSha,
                ...(receipt?.sha ? { sha: receipt.sha } : {}),
              },
            }
          : {}),
      };
    } catch (caught) {
      if (caught instanceof MergeWithdrawn) {
        if (caught.stop !== "withdrawn")
          // i18n-exempt: served to the crewmate in the merge answer, stays English
          return { ok: false, text: `Cannot merge yet: ${caught.message}.`, stop: caught.stop };
        return {
          ok: false,
          text: `Cannot merge: ${caught.message}${caught.message.endsWith(".") ? "" : "."}`,
          stop: "withdrawn",
        };
      }
      const message = caught instanceof Error ? caught.message : String(caught);
      const repoId = this.options.tasks.get(taskId)?.repoId;
      const stop = guard ? await this.refusalStop(forge, guard, caught, message) : undefined;
      // The main branch moved while the host merged: tried again unless the
      // pull request's own state already says why it cannot merge.
      const baseMoved =
        caught instanceof ForgeBaseMoved && (stop === undefined || stop === "computing");
      // A request the host says never left sent nothing, whatever was marked.
      const sent = dispatched && !(caught instanceof ForgeError && caught.beforeSend);
      return {
        ok: false,
        text: `Cannot merge: ${message}`,
        problem: message,
        ...(isTransientForgeFailure(caught) ? { transient: true } : {}),
        ...(sent ? { dispatched: true } : {}),
        ...(sent && forge.mergeNamesNoVersion && isTransientForgeFailure(caught)
          ? { noResend: true }
          : {}),
        ...(caught instanceof ForgeMergeUnconfirmed && caught.mergeTask
          ? { mergeTask: caught.mergeTask }
          : {}),
        ...(baseMoved ? { baseMoved: true } : {}),
        ...(stop ? { stop } : {}),
        ...(isSignInForgeFailure(caught) ? { signIn: this.context.signInFact(forge, repoId) } : {}),
      };
    }
  }

  /**
   * The merge of a change that joins this person's batch (docs/forge.md,
   * "Batches of your own"); undefined for every other task, which merges
   * as its own pull request. The approval is kept at its version: the
   * first run reads the pushed branch's checks, range, title, review and
   * story as any merge does, then puts the change in line and sends
   * nothing. Each later run reads the change's place: waiting, left out,
   * sent back, the only change of a failed batch, or merged with the batch, whose
   * receipt names the change's own commit on the default branch.
   */
  private async mergeInBatch(
    taskId: string,
    guard: MergeGuard | undefined,
  ): Promise<MergeAttempt | undefined> {
    const batches = this.context.batches;
    const repo = batches ? this.context.ownBatch(taskId) : undefined;
    const located = repo ? this.context.locate(taskId) : undefined;
    if (!batches || !repo || !located || "said" in located) return undefined;
    const { forge } = located;
    if (!guard)
      return {
        ok: false,
        text: BATCH_MERGE_WORDS.needsCard,
        plain: "it joins its batch from its merge card",
      };
    const place = batches.standing(repo.id, taskId, guard.head);
    if (place?.state === "merged") {
      const label = numberLabel(forge, place.receipt.number);
      const lineSaid = forge.place
        ? said("mergedWithBatchOn", { change: label, place: forge.place })
        : said("mergedWithBatchWhereItLives", { change: label });
      const line = englishOf(lineSaid);
      return {
        ok: true,
        text: `${line}.${place.receipt.url ? ` ${place.receipt.url}` : ""}`,
        line,
        lineSaid,
        receipt: {
          head: guard.head,
          ...(place.receipt.sha ? { sha: place.receipt.sha } : {}),
        },
      };
    }
    if (place?.state === "waiting")
      return {
        ok: false,
        text:
          place.place === "line"
            ? `Cannot merge yet - ${BATCH_WAITING_WORDS}: the change is approved and in line for this project's next batch.`
            : `Cannot merge yet - ${BATCH_WAITING_WORDS}: the change is in batch ${place.number === undefined ? "being opened" : numberLabel(forge, place.number)}${place.place !== "held" ? ", whose checks have not passed yet" : place.hold === "rules" ? `, which ${forge.place ?? "the project's host"} holds for a required review or another rule on the main branch` : place.hold === "merge-way" ? ", which is held because it could not be merged where the project lives" : ", which is held until its failed checks are answered"}.`,
        plain: BATCH_WAITING_WORDS.toLowerCase(),
        stop: "queue",
      };
    // Its crewmate was told to rebuild it on the open batch's version now: the
    // rebuilt version goes in line behind that batch once declared, so nothing
    // else is asked (docs/forge.md, "A change rebuilt on an open batch").
    if (place?.state === "left-out" && place.rebuild)
      return {
        ok: false,
        text: `Cannot merge yet: the change was left out of its batch because ${place.reason}. Its crewmate was told to rebuild it on the open batch's version ${place.rebuild.head} (branch ${place.rebuild.branch}) and declare that push with check_change conflictRepair, giving ${place.rebuild.head} as newBase; the rebuilt version then goes in line right behind that batch's changes and first in the next batch.`,
        plain: place.reason,
        stop: "queue",
      };
    // A clash only with a change ahead that is not merged yet: nothing can be
    // done until that batch merges or that change leaves it, and the batch
    // runs this merge again then.
    if (place?.state === "left-out" && place.ahead)
      return {
        ok: false,
        text: `Cannot merge yet: the change was left out of its batch because ${place.reason}. Nothing can be done yet, since the default branch does not hold that change; the merge goes on once that batch merges or that change leaves it.`,
        plain: place.reason,
        stop: "queue",
      };
    if (place?.state === "left-out")
      return {
        ok: false,
        text: `Cannot merge: the change was left out of its batch because ${place.reason}.`,
        plain: place.reason,
        stop: "conflict",
      };
    // Sent back from its batch at this version: its approval waits for a declared repair, as a failed batch of one's does.
    if (place?.state === "sent-back")
      return {
        ok: false,
        text: `Cannot merge yet - the change was sent back from its batch${place.number === undefined ? "" : ` ${numberLabel(forge, place.number)}`}: ${place.reason.trim()}${/[.!?]$/.test(place.reason.trim()) ? "" : "."} Its crewmate repairs it in a new version.`,
        plain: "it was sent back from its batch",
        notGreen: true,
        stop: "checks",
      };
    if (place?.state === "failed")
      return {
        ok: false,
        text: `Cannot merge yet - the checks of its batch${place.number === undefined ? "" : `, ${numberLabel(forge, place.number)},`} failed${place.checks.length ? `: ${place.checks.join(", ")}` : ""}. Its crewmate reads them there and repairs the change in a new version.`,
        plain: "the checks of its batch failed",
        notGreen: true,
        stop: "checks",
      };
    const status = await this.checks.run(taskId);
    const reading = this.checks.reading(taskId);
    const checked = status.checked;
    if (status.problem)
      return {
        ok: false,
        text: `Cannot merge yet - the checks could not be read. ${status.text}`,
        problem: status.problem,
        ...(status.transient ? { transient: true } : {}),
        ...(status.signIn ? { signIn: status.signIn, stop: "sign-in" as const } : {}),
      };
    if (checked && checked.change.number !== guard.prNumber)
      return {
        ok: false,
        text: `Cannot merge: the branch's change is ${checked.forge.label(checked.change)}, not the ${guard.prNumber === undefined ? "pushed branch" : numberLabel(checked.forge, guard.prNumber)} the captain approved.`,
        plain: "its change is not the one you approved",
        stop: "identity",
      };
    if (checked && checked.change.headSha !== guard.head)
      return {
        ok: false,
        text: `Cannot merge yet: the branch is at ${checked.change.headSha}, and the captain's approval covers ${guard.head}. A repair of the approved change is declared with check_change conflictRepair.`,
        plain: "it changed after the version you approved",
        stop: "moved",
      };
    const unfinished = reading?.overall === "red" || reading?.overall === "pending";
    const passed =
      unfinished &&
      status.recorded &&
      checked !== undefined &&
      overridePasses(
        this.options.tasks.get(taskId)?.delivery,
        "checks",
        checked.change.headSha,
        checked.change.number === undefined
          ? undefined
          : (checked.forge.url(checked.change) ?? null),
      );
    if (!checked || (!passed && (!status.recorded || reading?.overall !== "green"))) {
      const reason =
        reading?.overall === "red"
          ? "the checks failed"
          : reading?.overall === "no-pr"
            ? "nothing is pushed for its branch"
            : MERGE_CHECKS_HOLD_REASON;
      return {
        ok: false,
        text: `Cannot merge yet - ${reason}. ${status.text}${unfinished ? ` ${softHoldWords("checks", "firstmate")}` : ""}`,
        notGreen: true,
        stop: "checks",
        plain: reason,
      };
    }
    const { change } = checked;
    try {
      const record = this.options.tasks.get(taskId);
      if (record && !record.delivery?.presentation) await this.context.branchHome(record);
      const { dir, heldBase } = await this.context.checkRange(
        record,
        change.branch,
        forge,
        change.headSha,
        // Only the batch applies a held batch's fix as its own difference from the held version.
        record && change.branch === record.branch ? taskId : undefined,
      );
      // A change that still has a pull request of its own carries that
      // pull request's story; a pushed branch carries the one confirmed on it.
      let commit: { title: string; body: string };
      if (change.number !== undefined) {
        const storied = await this.withPublishedStory(taskId, forge, change, guard);
        if ("held" in storied)
          return { ok: false, text: `Cannot merge yet: ${storied.held}.`, stop: "guidance" };
        commit = { title: change.title ?? "", body: storied.change.squashMessage ?? "" };
      } else {
        if (!this.options.presentations)
          throw new Error("The current story cannot be checked for complete evidence.");
        try {
          // A repair the app accepted under the kept approval moved the branch
          // past its confirmed story: the story is confirmed again at the
          // repaired version, words unchanged, as a pull request's story is
          // republished (docs/forge.md, "Batches of your own").
          const kept = standingAuthorization(this.options.tasks.get(taskId)?.delivery);
          if (kept && kept.lineage.length > 0 && candidateHead(kept) === change.headSha)
            await this.options.presentations.confirmRepairedBranch(
              taskId,
              change.branch,
              (head) =>
                head === kept.approvedHead || kept.lineage.some((step) => step.toHead === head),
              change.headSha,
              forge,
            );
          commit = this.options.presentations.batchCommit(taskId, change.branch, change.headSha);
        } catch (caught) {
          storyHeld(caught);
        }
      }
      requireNamed(commit.title, "change title", this.options.namingRule?.() ?? null);
      const fresh = this.options.tasks.get(taskId) ?? record;
      if (fresh)
        await carryPassedReview({
          tasks: this.options.tasks,
          taskId,
          record: fresh,
          repoDir: dir,
          head: change.headSha,
        });
      // A pull request stacked on another branch: the combine carries it
      // only once that branch's work is already in.
      const stacked =
        change.number !== undefined && change.base && change.base !== (await forge.defaultBranch())
          ? change.base
          : undefined;
      // A part built on an earlier part's approved version waits in line
      // behind it until that work is in (docs/task-graph.md, "A part that
      // starts at approval").
      const builtOn = stacked ? undefined : this.options.tasks.graph.unmergedBuiltOn(fresh);
      const held = guard.held?.();
      if (held) return { ok: false, text: `Cannot merge yet: ${held}.`, stop: "guidance" };
      const withdrawn = guard.beforeDispatch(change.headSha, true);
      if (withdrawn)
        return {
          ok: false,
          text: `Cannot merge: ${withdrawn}${withdrawn.endsWith(".") ? "" : "."}`,
          stop: "withdrawn",
        };
      await batches.enqueue(repo.id, {
        taskId,
        branch: change.branch,
        head: change.headSha,
        title: commit.title,
        body: commit.body,
        // The line keeps the order of the approvals, not of the runs that carry them here.
        at: guard.approvedAt ?? this.context.now(),
        ...(change.number !== undefined ? { number: change.number } : {}),
        ...(stacked ? { base: stacked } : {}),
        ...(builtOn ? { base: builtOn.branch, after: builtOn.task.id } : {}),
        // The held version this approval verified the fix on goes with its repair as it enters the line.
        ...(heldBase ? { heldBase } : {}),
      });
      // The reading now carries the change's place in the batch, so the
      // check watch follows it and wakes its crewmate if the batch fails it.
      await this.checks.run(taskId).catch(() => {});
      return {
        ok: false,
        text: `Approved and in line: ${BATCH_WAITING_WORDS.toLowerCase()}. The change merges with this project's next batch, as one commit of its own.`,
        plain: BATCH_WAITING_WORDS.toLowerCase(),
        stop: "queue",
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return {
        ok: false,
        text: `Cannot merge: ${message}`,
        problem: message,
        ...(isTransientForgeFailure(caught) ? { transient: true } : {}),
        ...(isSignInForgeFailure(caught)
          ? { signIn: this.context.signInFact(forge, repo.id), stop: "sign-in" as const }
          : {}),
      };
    }
  }

  /**
   * The pull request as it merges with its change's saved story - each
   * change keeps its own (INF-2490) - for both merges, the finishing one and
   * a continuing one: the published story at this version, or the
   * description's own words under the captain's override on the story
   * (INF-1365). A pull request with no story of this task merges as it is.
   * On the captain's kept approval of a merge card's offer the newest story
   * merges, even one revised after the click: approval follows the code
   * (INF-3623). A pull request that moved past the published version
   * has the story republished at its version first, words unchanged
   * (INF-2509): on a kept approval only at the version it covers, and a
   * repair the host accepted keeps its own words (FI3-304). The captain's
   * guidance that holds the merge is answered instead, read before that
   * refresh.
   */
  async withPublishedStory(
    taskId: string,
    forge: Forge,
    change: ForgeChange,
    guard?: MergeGuard,
  ): Promise<{ change: ForgeChange } | { held: string }> {
    const ledger = this.options.tasks.delivery.changePresentation(
      taskId,
      change.branch,
      change.number,
    );
    const published = ledger?.published ?? ledger?.publication;
    // A publication names the pull request it went to.
    if (!ledger || (published?.number !== undefined && published.number !== change.number))
      return { change };
    const read = await forge.changeFor(change.branch);
    if (
      !read ||
      read.number !== change.number ||
      read.headSha !== change.headSha ||
      !this.options.presentations
    )
      throw new Error("The current story cannot be checked for complete evidence.");
    const record = this.options.tasks.get(taskId);
    // INF-1365: the captain's override on the saved story passes its publication at this
    // version: nothing is marked published, uploaded or refreshed, and the squash carries the
    // description's own words, not an older story's. It is read after the last wait before the
    // send, so a withdrawn override holds this merge.
    if (overridePasses(record?.delivery, "story", change.headSha))
      return {
        change: { ...read, squashMessage: messageWithoutPresentation(read.body ?? "", taskId) },
      };
    const authorization = guard ? standingAuthorization(record?.delivery) : undefined;
    // Approval follows the code, never the story's words (INF-3623): a story
    // revised after the click merges as the newest one, noted once.
    if (authorization && !authorization.review) {
      const offered = record?.delivery?.completionOffers?.find(
        (offer) =>
          offer.cardId === authorization.card.id && offer.offerId === authorization.card.offerId,
      );
      const now = ledger.published?.contentHash;
      const seen = `${taskId}:${offered?.offerId}:${now}`;
      if (offered && now && offered.presentationContentHash !== now && !this.storyNoted.has(seen)) {
        this.storyNoted.add(seen);
        this.options.tasks.note(
          taskId,
          "The story changed after the merge click; the merge carries the newest story.",
          { news: false, data: { storyChangedAfterClick: now } },
        );
      }
    }
    const held = guard?.held?.();
    if (held) return { held };
    let current = read;
    const publishedHead = ledger.published?.head;
    const moved =
      publishedHead !== undefined &&
      publishedHead !== change.headSha &&
      (!authorization || candidateHead(authorization) === change.headSha);
    const repaired =
      moved &&
      authorization !== undefined &&
      authorization.lineage.length > 0 &&
      (publishedHead === authorization.approvedHead ||
        authorization.lineage.some((step) => step.toHead === publishedHead));
    if (moved) {
      // INF-2509: any other move past the published story republishes it
      // too, words unchanged; a newer story its author prepared stays theirs.
      if (repaired)
        await this.options.presentations.refreshConflictOnly(
          taskId,
          publishedHead,
          change.headSha,
          forge,
          change.branch,
          change.title ?? "",
          this.context.attestsAt(taskId),
        );
      else
        await this.options.presentations.republishMoved(
          taskId,
          change,
          forge,
          this.context.attestsAt(taskId),
        );
      const refreshed = await forge.changeFor(change.branch);
      if (!refreshed || refreshed.number !== change.number || refreshed.headSha !== change.headSha)
        throw new Error("The pull request changed during the story refresh.");
      current = refreshed;
    }
    return {
      change: await this.options.presentations
        .assertPublished(taskId, current, forge)
        .catch(storyHeld),
    };
  }

  /**
   * The approval of a version ended: its change leaves this person's line
   * and open batch, which combines again without it (docs/forge.md,
   * "Batches of your own"). A change that merges as its own pull request
   * holds no place to remove, and a merge already sent cannot be undone.
   */
  async removeQueuedApproval(taskId: string, removal: QueueApprovalRemoval): Promise<void> {
    const record = this.options.tasks.get(taskId);
    const own = record ? this.context.ownBatch(taskId) : undefined;
    if (own && removal.target.branch === record?.branch)
      await this.context.batches?.withdraw(own.id, taskId);
  }

  /**
   * The pinned pull request read by its number (FI3-304): what a kept
   * approval's reconcile asks after a restart or an answer that never came.
   * Undefined where the host has no pull requests or the task no change.
   */
  async pullState(
    taskId: string,
    prNumber: number,
    mergeTask?: string,
    place?: { host: string; owner: string; name: string },
  ): Promise<ForgePull | undefined> {
    const record = this.options.tasks.get(taskId);
    if (!record) return undefined;
    // A kept approval's read names the repository it pinned (`place`): it is
    // read there, whatever the task's own project delivers now or whether it
    // is still managed, so a merge sent earlier is always read back, and a
    // number another project shares never answers it.
    const pinned = place ? this.pinnedRepo(record, place) : undefined;
    if (place && !pinned) return undefined;
    const repo = record.repoId ? this.options.repos.get(record.repoId) : undefined;
    if (!pinned && (!repo || !opensPullRequest(deliveryForRecord(record, repo.delivery))))
      return undefined;
    // Reading a named pull request needs the project's saved host identity,
    // not a local branch or folder (nor an in-reach work computer): the
    // task's own project, or the other managed one the task opened that
    // number in (INF-2510).
    const elsewhere = pinned ? undefined : this.projectOfNumber(record, prNumber);
    if (elsewhere === null) return undefined;
    const own = pinned ?? elsewhere ?? (repo ? publicationRepo(record, repo) : undefined);
    if (!own) return undefined;
    const forge = this.options.forgeFor(own);
    if (!forge.pull) return undefined;
    const pull = await this.context.pullOf(forge, prNumber);
    // A merge the host took and had not confirmed, still open: the host's
    // own word on that merge says whether it failed.
    if (mergeTask && forge.mergeTaskRefused && pull.state === "open" && !pull.merged) {
      if (await forge.mergeTaskRefused(prNumber, mergeTask))
        return { ...pull, mergeTaskRefused: true };
    }
    return pull;
  }

  /**
   * The merge card a pull request read merged outside the app can show, or
   * why it has none (INF-3799), from the project `pullState` read it in: the
   * verdict check_change and the merge card read, for the merge's wake.
   */
  mergedStory(taskId: string, pull: ForgePull): MergedStory | undefined {
    const record = this.options.tasks.get(taskId);
    const repo = record?.repoId ? this.options.repos.get(record.repoId) : undefined;
    if (!record?.branch || !repo) return undefined;
    const elsewhere = this.projectOfNumber(record, pull.number);
    if (elsewhere === null) return undefined;
    return mergedStoryOf(
      this.options.tasks,
      taskId,
      this.options.forgeFor(elsewhere ?? publicationRepo(record, repo)),
      currentChange(record.delivery, record.branch).branch,
      pull,
    );
  }

  /**
   * The other managed project a pull request number of this task is in
   * (INF-2510): the one its current change, its approved review, a kept
   * review or a change record names for that number, in that order.
   * Undefined for the task's own project; null when that project is no
   * longer managed.
   */
  private projectOfNumber(record: TaskRecord, number: number): RepoView | undefined | null {
    const delivery = record.delivery;
    const reviews = [
      delivery?.checkTarget,
      delivery?.mergeAuthorization?.review,
      ...[...(delivery?.mergeReviews ?? [])].sort((a, b) => b.at - a.at),
    ];
    const review = reviews.find((item) => item?.number === number);
    const change = this.options.tasks
      .changesFor(record.id)
      .find(
        (change) =>
          change.handle?.number === number &&
          (!review || change.repoId === (review.repoId ?? record.repoId)),
      );
    const repoId = review ? (review.repoId ?? record.repoId) : (change?.repoId ?? record.repoId);
    if (!repoId) return undefined;
    const repo = this.options.repos.get(repoId);
    if (!repo) return null;
    const destination = publicationRepo(record, repo);
    const link =
      (delivery?.prNumber === number ? delivery.prUrl : undefined) ?? change?.handle?.url;
    if (
      review
        ? !requestAtRepo(destination, review)
        : !savedRequestAtRepo(
            record,
            destination,
            number,
            change?.head.branch ?? record.branch,
            link,
          )
    )
      return null;
    return repoId === record.repoId ? undefined : repo;
  }

  /**
   * A version the host's own merge queue took under this approval
   * (docs/forge.md, "The host's merge queue"), read where it stands before
   * anything is sent: still queued waits on; merged is the merge; out of
   * the queue and open, the host removed it, and it is sent again only on
   * its crewmate's answer to that removal or the captain's own click.
   * Undefined when nothing was handed over, or it is to be sent again.
   */
  async handedOver(
    forge: Forge,
    change: ForgeChange,
    guard: MergeGuard,
  ): Promise<PrOutcome | undefined> {
    const handed = guard.handed?.();
    if (!handed || !forge.inHostQueue || change.number === undefined) return undefined;
    if (await forge.inHostQueue(change.number)) return hostQueued(forge, change);
    // The host may have merged it between the two reads.
    const pull = await this.context.pullOf(forge, change.number);
    if (pull.merged) return alreadyMerged(forge, pull, guard.head);
    if (pull.state !== "open") return closedUnmerged(forge, pull);
    return guard.unattended && !handed.answered ? hostRemoved(forge, change) : undefined;
  }

  /** The managed repository a kept approval pinned its pull request in (`pinnedRequestRepo`). */
  private pinnedRepo(
    record: TaskRecord,
    place: { host: string; owner: string; name: string },
  ): RepoView | undefined {
    return pinnedRequestRepo(record, this.options.repos, place);
  }

  /**
   * The forge a read-back reads: the repository the approval pinned when it
   * names one, so a number another project shares never answers it, and the
   * task's located project otherwise.
   */
  private pinnedForge(
    taskId: string,
    place: { host: string; owner: string; name: string } | undefined,
  ): Forge | undefined {
    if (!place) {
      const located = this.context.locate(taskId);
      return "said" in located ? undefined : located.forge;
    }
    const record = this.options.tasks.get(taskId);
    const pinned = record ? this.pinnedRepo(record, place) : undefined;
    return pinned ? this.options.forgeFor(pinned) : undefined;
  }

  /**
   * After a request whose answer never came, or with no open pull request
   * for the branch: the pinned pull request as the host holds it now. A
   * merge at the approved head is the merge; a closed one ends the approval;
   * an open one at the approved head may be tried again.
   */
  private async readBack(
    taskId: string,
    guard: MergeGuard,
  ): Promise<{ merged?: PrOutcome; closed?: PrOutcome; open?: boolean }> {
    const forge = this.pinnedForge(taskId, guard.place);
    if (!forge || guard.prNumber === undefined) return {};
    let pull: ForgePull;
    try {
      pull = await this.context.pullOf(forge, guard.prNumber);
    } catch {
      return {};
    }
    if (pull.merged) return { merged: alreadyMerged(forge, pull, guard.head) };
    if (pull.state !== "open") return { closed: closedUnmerged(forge, pull) };
    return { open: pull.headSha === guard.head };
  }

  /**
   * What a merge past the rules would skip, read fresh: the pull request
   * must be able to merge but for its rules and checks, every check must
   * have finished, and GitHub must say this sign-in may skip every rule set
   * holding the default branch, with squash allowed. Undefined text when it
   * may; otherwise why not, in the host's words.
   */
  async skipState(
    taskId: string,
    forge: Forge,
    pull: ForgePull,
    project: { project?: string },
  ): Promise<
    | { ok: true; rules: SkippedRule[]; failedChecks: string[] }
    | { ok: false; text: string; stop?: MergeStop }
  > {
    const place = forge.place ?? "GitHub";
    const destination = await forge.defaultBranch().catch(() => undefined);
    if (!destination || pull.base !== destination) {
      return {
        ok: false,
        text: `pull request ${pull.number} merges into ${pull.base}, not this project's default branch.`,
        stop: "identity",
      };
    }
    if (
      pull.readiness === "conflict" ||
      pull.readiness === "draft" ||
      pull.readiness === "computing"
    ) {
      const { stop, plain } = readinessStops(place)[pull.readiness];
      return { ok: false, text: `${plain}. Skipping rules does not change that.`, stop };
    }
    const change: ForgeChange = {
      number: pull.number,
      url: null,
      branch: pull.branch ?? "",
      headSha: pull.headSha,
      title: pull.title ?? "",
      body: "",
    };
    let checks: Awaited<ReturnType<Forge["checks"]>>;
    let sets: ForgeRuleset[];
    try {
      checks = await forge.checks(change);
      sets = forge.branchRules ? await forge.branchRules(pull.base) : [];
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return {
        ok: false,
        text: `the checks or the branch rules could not be read. ${message}`,
        stop: isSignInForgeFailure(caught) ? "sign-in" : "checks",
      };
    }
    this.checks.endNoChecks({ forge, change, ...project }, checks.items);
    // Captain F4: final results precede both bypass preparation and sending.
    if (checks.problem)
      return { ok: false, text: `The checks cannot be read. ${checks.problem}`, stop: "checks" };
    const record = this.options.tasks.get(taskId);
    const absent = record && this.checks.absenceDeclared(record, { forge, change, ...project });
    const items = checks.items;
    if (
      checks.complete === false ||
      items.some((item) => item.state === "pending") ||
      (items.length === 0 && !absent)
    )
      return {
        ok: false,
        text: "The checks have not finished. Wait for their final results before preparing or sending a rule-bypass review.",
        stop: "checks",
      };
    const failedChecks = items
      .filter((item) => isRedCheckState(item.state))
      .map((item) => item.name);
    const holding = sets.filter((set) => set.rules.some((rule) => mergeRuleWords(rule)));
    const locked = holding.filter((set) => set.bypass === null || set.bypass === "never");
    if (locked.length) {
      return {
        ok: false,
        text: `${place} says your sign-in may not skip ${locked.map((set) => `the rule set ${set.name}`).join(", ")}.`,
        stop: "protected",
      };
    }
    const noSquash = holding.find(
      (set) => set.mergeMethods && !set.mergeMethods.includes("squash"),
    );
    if (noSquash) {
      return {
        ok: false,
        text: `the rule set ${noSquash.name} allows no squash merge, the one method the app sends.`,
        stop: "protected",
      };
    }
    if ((pull.readiness === "blocked" || pull.readiness === "behind") && holding.length === 0) {
      return {
        ok: false,
        text: `${place} holds it by a rule outside its rule sets, such as classic branch protection, which the app cannot skip.`,
        stop: "protected",
      };
    }
    const rules = holding.flatMap((set) =>
      set.rules.flatMap((rule) => {
        const words = mergeRuleWords(rule);
        return words ? [{ ruleset: set.name, rule: words }] : [];
      }),
    );
    return { ok: true, rules, failedChecks };
  }

  /**
   * A guarded merge stopped for GitHub's branch rules carries whether this
   * sign-in may skip them (INF-4360, `PrOutcome.skip`); every other outcome
   * comes back as it is. `on` locates the pull request the guard names.
   */
  async withSkip(
    taskId: string,
    guard: MergeGuard | undefined,
    outcome: PrOutcome,
    on: "current" | { repoId?: string },
  ): Promise<PrOutcome> {
    if (outcome.ok || outcome.stop !== "protected" || guard?.prNumber === undefined) return outcome;
    const skip = await this.protectedSkip(taskId, guard.prNumber, guard.head, on);
    return skip ? { ...outcome, skip } : outcome;
  }

  /**
   * Whether this sign-in may skip what holds pull request `number` at
   * `head` (INF-4360): the reading `skipState` makes for a merge past the
   * rules. Undefined when it cannot tell - not GitHub, the pull request past
   * that version, unfinished checks, or a failed read.
   */
  private async protectedSkip(
    taskId: string,
    number: number,
    head: string,
    on: "current" | { repoId?: string },
  ): Promise<PrOutcome["skip"]> {
    const located = this.context.locate(taskId, "check", on);
    // Only what check_change skipRules can prepare: the task's own project.
    if ("said" in located || located.elsewhere) return undefined;
    const { forge } = located;
    const origin = forgeOf(located.repo?.origin);
    if (
      forge.kind !== "github" ||
      !forge.pull ||
      !forge.branchRules ||
      !forge.putInSkippingRules ||
      !origin.owner ||
      !origin.name
    )
      return undefined;
    try {
      const pull = await forge.pull(number);
      if (pull.state !== "open" || pull.merged || pull.headSha !== head) return undefined;
      if (!branchInProject(pull, `${origin.owner}/${origin.name}`)) return undefined;
      const state = await this.skipState(taskId, forge, pull, projectOf(located));
      if (state.ok) return state.rules.length ? { may: true, rules: state.rules } : undefined;
      return state.stop === "protected" ? { may: false, why: state.text } : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Why GitHub refused a guarded merge request, read from its typed answer
   * and the pull request's own state - never from the words, but for the
   * merge endpoint's conflict refusal the feed already recognizes. A refusal
   * because the main branch moved, with nothing in the pull request's state
   * that stops it, waits on the host: the app reads it again on its own.
   */
  async refusalStop(
    forge: Forge,
    guard: MergeGuard,
    caught: unknown,
    message: string,
  ): Promise<MergeStop | undefined> {
    if (isSignInForgeFailure(caught)) return "sign-in";
    if (isTransientForgeFailure(caught)) return undefined;
    if (!(caught instanceof ForgeError) || caught.failure !== "refused") return undefined;
    if (
      /^GitHub (?:answered 409 to PUT \S+\/merge(?:-async)?|did not merge \S+): Head branch was modified/i.test(
        message,
      )
    ) {
      return "moved";
    }
    try {
      if (guard.prNumber !== undefined) {
        const pull = await this.context.pullOf(forge, guard.prNumber);
        const held = readinessStop(forge, pull, guard);
        if (held?.stop && held.stop !== "computing") return held.stop;
      }
    } catch {
      // The read is evidence only; the refusal itself still speaks.
    }
    if (caught instanceof ForgeBaseMoved) return "computing";
    return isMergeConflict(message) ? "conflict" : undefined;
  }

  /**
   * The merge result and its Activity line: GitHub's change by its number
   * ("Merged #N on GitHub"), a pushed branch by the task's title and the
   * host's name - the provider's name is the person's word, a host's
   * address is the thing itself. Only the result carries the change's
   * address; the line sits beside the task's key (INF-1845).
   */
  private putInText(
    taskId: string,
    forge: Forge,
    change: ForgeChange,
    /** The newer version the host merged instead of the approved one, when it said so. */
    newer?: string,
  ): { text: string; line: string; lineSaid: Said } {
    const url = forge.url(change);
    const where = forge.place ? `on ${forge.place}` : "where the project lives";
    const place = forge.place;
    if (change.number !== undefined) {
      const label = forge.label(change);
      const lineSaid =
        place && newer
          ? said("mergedChangeNewerOn", { change: label, place })
          : place
            ? said("mergedChangeOn", { change: label, place })
            : said("mergedChangeWhereItLives", { change: label });
      const line = englishOf(lineSaid);
      const { told } = otherMergedFacts(place, label, newer, change.headSha);
      return { text: `${line}.${url ? ` ${url}` : ""}${told}`, line, lineSaid };
    }
    const title = this.options.tasks.get(taskId)?.title ?? forge.label(change);
    const lineSaid = place ? said("mergedOn", { place }) : said("mergedWhereItLives");
    return { text: `Merged "${title}" ${where}.`, line: englishOf(lineSaid), lineSaid };
  }

  /**
   * Discard's counterpart to merge: best-effort close of the task's open
   * change where the project lives without putting it in, so an abandoned
   * task never leaves one open behind it. Every "nothing to do" edge (no
   * branch, no change on the record, local-only, the folder already gone,
   * no open change) is silent success; only a forge failure once a change
   * is found is reported. A task that never opened a change asks the host
   * nothing at all: its record is where the host learns of one
   * (`pr_opened`), and a discard of one that has none must not fail on a
   * host it never needed.
   */
  async close(taskId: string): Promise<PrOutcome> {
    const record = this.options.tasks.get(taskId.trim());
    if (!record?.branch) return { ok: true, text: "" };
    const delivery = record.delivery;
    if (delivery?.prNumber === undefined && delivery?.changeLabel === undefined) {
      return { ok: true, text: "" };
    }
    // The task's own branch: a change it opened elsewhere stays as it is.
    const located = this.context.locate(record.id, "check", "own");
    if ("said" in located) return { ok: true, text: "" };
    const { forge, branch } = located;
    try {
      const change = await forge.changeFor(branch);
      if (!change) return { ok: true, text: "" };
      await forge.close(change);
      const url = forge.url(change);
      return {
        ok: true,
        text:
          change.number !== undefined
            ? `Closed PR ${forge.label(change)}${forge.place ? ` on ${forge.place}` : ""}.${url ? ` ${url}` : ""}`
            : `Deleted the pushed branch${forge.place ? ` on ${forge.place}` : ""}.`,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return { ok: false, text: `Could not close PR: ${message}`, problem: message };
    }
  }
}

/** The merge already made: the outcome a put-in answers when nothing is left to send. */
/** What a merge handed to the host's own merge queue says while the host holds it there. */
export const HOST_QUEUE_WAITING_WORDS = "waiting for the merge queue";

/** The host's own merge queue took the change: nothing merged yet, and the host merges or removes it. */
export function hostQueued(forge: Forge, change: ForgeChange): PrOutcome {
  const place = forge.place ?? "the project's host";
  return {
    ok: false,
    text: `Cannot merge yet - ${HOST_QUEUE_WAITING_WORDS}: ${place} took ${forge.label(change)} into the branch's merge queue at ${change.headSha}. It is queued, not merged: ${place} merges it once the queue's own checks pass, or removes it.`,
    plain: HOST_QUEUE_WAITING_WORDS,
    stop: "host-queue",
  };
}

/** The host removed the change from its own merge queue without merging it: nothing is sent again unasked. */
export function hostRemoved(forge: Forge, change: ForgeChange): PrOutcome {
  const place = forge.place ?? "the project's host";
  return {
    ok: false,
    text: `Cannot merge: ${place} removed ${forge.label(change)} from the branch's merge queue without merging it, and its page there says why. Nothing is sent again at ${change.headSha} unasked: a new version goes to the queue once its repair is declared with check_change conflictRepair, and this one goes once more on its crewmate's answer to the removal (check_change's answered verdict at this version) when nothing in it is left to change.`,
    plain: "it was removed from the merge queue without merging",
    stop: "host-removed",
  };
}

function closedUnmerged(forge: Forge, pull: ForgePull): PrOutcome {
  return {
    ok: false,
    text: `Cannot merge: ${numberLabel(forge, pull.number)} was closed without merging.`,
    plain: "its pull request was closed without merging",
    stop: "closed",
  };
}

function alreadyMerged(forge: Forge, pull: ForgePull, approved?: string): PrOutcome {
  const other = otherMergedFacts(
    forge.place,
    numberLabel(forge, pull.number),
    pull.headSha,
    approved,
  );
  return {
    ok: true,
    text: `${numberLabel(forge, pull.number)} is already merged ${placeWords(forge)}.${other.told}`,
    ...other.line,
    receipt: mergedReceipt(pull),
  };
}

/** The version a merge went in at, when the host names one other than the approved version. */
export function otherMerged(approved: string, merged: string | undefined): string | undefined {
  return merged !== undefined && merged !== approved ? merged : undefined;
}

/**
 * Every merged result's one reading of the version that went in against the
 * approved one: when they differ, the words the crewmate hears (`told`, with
 * its leading space) and the merge's Activity line saying a push made after
 * the approved version went in too, which the captain sees. Empty when they
 * match or either is unknown.
 */
export function otherMergedFacts(
  place: string | null,
  change: string,
  merged: string | undefined,
  approved: string | undefined,
): { told: string; line?: { line: string; lineSaid: Said } } {
  const newer = approved === undefined ? undefined : otherMerged(approved, merged);
  if (!newer) return { told: "" };
  const lineSaid = place ? said("mergedChangeNewerOn", { change, place }) : undefined;
  return {
    // i18n-exempt: served to the crewmate in the merge answer, stays English
    told: ` ${place ?? "The host"} merged version ${newer}, not the approved version ${approved}: a push landed after the merge was approved, and its work is merged without approval. The task's merge line tells the captain.`,
    ...(lineSaid ? { line: { line: englishOf(lineSaid), lineSaid } } : {}),
  };
}

/** The receipt of a pull request found already merged: the head it merged at, and its commit. */
export function mergedReceipt(pull: ForgePull): NonNullable<PrOutcome["receipt"]> {
  return {
    head: pull.headSha,
    ...(pull.mergedSha ? { sha: pull.mergedSha } : {}),
    already: true,
  };
}

export function stripAttempt(attempt: MergeAttempt): PrOutcome {
  const {
    transient: _transient,
    dispatched: _dispatched,
    baseMoved: _baseMoved,
    ...outcome
  } = attempt;
  return outcome;
}

/**
 * A pull request read until GitHub decides whether it can merge `head`: while
 * it reads computing at that head and stays open, it is read again after each
 * of `gaps` in turn (INF-457). The last read comes back with how long the
 * gaps took, and the caller checks it as it would a single read, so a moved
 * head or a closed pull request still stops the merge. Throws as a read does.
 */
export async function readDecided(
  read: () => Promise<ForgePull>,
  head: string,
  gaps: readonly number[],
): Promise<{ pull: ForgePull; waited: number }> {
  let pull = await read();
  let waited = 0;
  for (const gap of gaps) {
    if (
      pull.readiness !== "computing" ||
      pull.state !== "open" ||
      pull.merged ||
      pull.headSha !== head
    )
      break;
    await sleep(gap);
    waited += gap;
    pull = await read();
  }
  return { pull, waited };
}

/**
 * Whether a pull request's branch lives in `project` (owner/name) itself: a
 * merge past the branch rules is never prepared for a fork's branch.
 */
export function branchInProject(pull: ForgePull, project: string): boolean {
  return pull.headRepo?.toLowerCase() === project.toLowerCase();
}

/** Why a readiness holds a merge, with where the project lives in the host's words. */
export function readinessStops(
  place: string,
): Record<Exclude<ForgeReadiness, "clean">, { stop: MergeStop; plain: string }> {
  return {
    conflict: { stop: "conflict", plain: "it conflicts with newer work in the project" },
    behind: {
      stop: "behind",
      plain: "it is behind the main branch and must be brought up to date",
    },
    blocked: {
      stop: "protected",
      plain: `${place} holds it for a required review or another rule on the main branch`,
    },
    computing: { stop: "computing", plain: `${place} has not worked out whether it can merge yet` },
    draft: { stop: "draft", plain: "its pull request is a draft" },
  };
}

/** What the pinned pull request's own state says about merging it now; undefined when it may. */
export function readinessStop(
  forge: Forge,
  pull: ForgePull,
  guard: Pick<MergeGuard, "head">,
): PrOutcome | undefined {
  const label = numberLabel(forge, pull.number);
  const place = forge.place ?? "the project's host";
  if (pull.merged || pull.state !== "open") {
    return {
      ok: false,
      text: `Cannot merge: ${label} is no longer open.`,
      plain: "its pull request is no longer open",
      stop: "closed",
    };
  }
  if (pull.headSha !== guard.head) {
    return {
      ok: false,
      text: `Cannot merge yet: ${label} moved to ${pull.headSha}; the approval covers ${guard.head}.`,
      plain: "it changed after the version you approved",
      stop: "moved",
    };
  }
  if (pull.readiness === "clean") return undefined;
  const { stop, plain } = readinessStops(place)[pull.readiness];
  return {
    ok: false,
    text: `Cannot merge yet: ${place} reads ${label} as ${pull.readiness}. ${fixedHoldWords("host-rules")}`,
    plain,
    stop,
  };
}
