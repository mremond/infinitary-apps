import { createHash } from "node:crypto";
import { Batches, type BatchHeld } from "../../src/core/batches/batches";
import { type Combined, type CombineInput, LEFT_OUT_WORDS } from "../../src/core/batches/combine";
import type {
  Forge,
  ForgeChange,
  ForgeCheck,
  ForgePull,
  ForgeReadiness,
} from "../../src/core/forge";
import {
  ForgeError,
  ForgeMergeUnconfirmed,
  ForgeWriteError,
  presentationBodyLimit,
  presentationCommentLimit,
} from "../../src/core/forge";
import { openInMemoryDatabase } from "../../src/core/storage/db";
import { RepoRegistry } from "../../src/core/workspace/repoRegistry";
import { seedProject } from "../../src/core/workspace/seedProject";
import type { BatchChange, BatchMember, MergeWay, MergeWays } from "../../src/shared/batches";
import type { Said } from "../../src/shared/i18n/said";
import type { NamingRule } from "../../src/shared/runbooks";
import { BUNDLED_NAMING } from "./namingRunbook";

/**
 * The project and host the tests of `Batches` run on (`src/core/batches/`).
 * A real project registry on an in-memory database keeps the record, so every
 * step goes through its one writer and its saved form. The stand-in is the
 * host: a project whose pull requests, branches, checks, allowed merges and
 * comments answer as GitHub's do, with the combine and the push writing to it
 * in place of git (`combine.test.ts` owns git).
 */

export const REPO = "repo-meter";
export const MAIN_AT_START = "9d1c7e2a4b6f8091a3c5e7d9f1b3a5c7e9d1f3b5";
/** The merges a GitHub project allows by default, as its settings read answers them. */
export const EVERY_WAY: MergeWays = { squash: true, rebase: true, merge: true };

export const id = (words: string) => createHash("sha1").update(words).digest("hex");
export const passed = (name: string): ForgeCheck => ({ name, state: "success" });
export const failed = (name: string): ForgeCheck => ({ name, state: "failure" });
export const running = (name: string): ForgeCheck => ({ name, state: "pending" });

export type StandInPull = {
  number: number;
  branch: string;
  head: string;
  title: string;
  body: string;
  state: "open" | "closed";
  merged: boolean;
  mergedSha?: string;
  readiness: ForgeReadiness;
};
type Commit = { sha: string; title: string };
/** A conversation comment on a pull request, and the account that wrote it. */
export type StandInComment = { id: number; body: string; author: string };

/** The account the app writes with: the captain's own sign-in. */
export const APP_ACCOUNT = "captain";

/**
 * GitHub's refusal of a description or a comment past its limit, in the words
 * the forge passes on from GitHub's answer (`GitHubForge`'s write errors).
 */
function refuseTooLong(body: string, limit: number, operation: string): void {
  if (Array.from(body).length <= limit) return;
  throw new ForgeWriteError(
    "failed",
    "refused",
    `GitHub answered 422 when ${operation}. Nothing was written. Validation Failed body is too long (maximum is ${limit} characters)`,
  );
}

/**
 * A story grown to `length` characters as a long one grows: the checks its
 * change ran, one line each.
 */
function told(region: string, length?: number): string {
  if (length === undefined) return region;
  const lines = [region, "## Checked"];
  for (let check = 1; lines.join("\n").length < length; check++)
    lines.push(`- Check ${check} ran on the change's version and passed.`);
  return lines.join("\n").slice(0, length);
}

/** A project where it lives: what GitHub holds and answers for one repository. */
function standInHost(ways: MergeWays) {
  const host = {
    ways,
    branches: new Map<string, string>([["main", MAIN_AT_START]]),
    /** What each pushed version carries above the default branch: its commits, in order. */
    carried: new Map<string, Commit[]>(),
    /** The default branch's commits as merges wrote or kept them. */
    main: [] as Commit[],
    pulls: new Map<number, StandInPull>(),
    checks: new Map<string, ForgeCheck[]>(),
    /** The host's words when it could not list every check, as a partial reading carries them. */
    checksProblem: undefined as string | undefined,
    merges: [] as { number: number; head: string; way?: MergeWay; title?: string; body?: string }[],
    notes: [] as { number: number; note: string }[],
    /** The host's own words for refusing the next merges. */
    refusal: undefined as string | undefined,
    /** The default branch has GitHub's merge queue: a merge request is taken into it, never merged at once. */
    mergeQueue: false,
    /** The pull requests that queue holds now. */
    queued: new Set<number>(),
    /** How many times that queue was read. */
    queueReads: 0,
    /** The host's merge names no version, as Bitbucket's does (`Forge.mergeNamesNoVersion`). */
    noVersion: false,
    /**
     * The next merge request leaves and its outcome is not known, as when
     * Bitbucket answers 202 or the answer is lost: nothing merges until the
     * test lands it, and `task` is the host's reference to that merge.
     */
    unconfirmNext: undefined as { task?: string } | undefined,
    /** The merge references whose merge the host says failed. */
    refusedTasks: new Set<string>(),
    /** The host's words for refusing to close a pull request, as Bitbucket may while it merges one. */
    closeRefusal: undefined as string | undefined,
    /** Something that happens as the host is asked to close a pull request. */
    duringClose: undefined as (() => void) | undefined,
    /** The connection drops as the next pull request opens: its answer is lost, and so is every read after. */
    loseNextOpen: false,
    offline: false,
    /** The host does not answer for the merges the project allows. */
    waysUnreadable: false,
    /** Something that happens between a pass's first look and its merge. */
    beforeChecks: undefined as (() => void) | undefined,
    /** Something that happens while the app reads a branch's version where the project lives. */
    duringBranchRead: undefined as (() => void) | undefined,
    /** The pull request has yet to follow its pushed branch, as a host's can for a moment. */
    trails: false,
    /** Every rewrite of a pull request's title and description the host took. */
    rewrites: [] as { number: number; title?: string }[],
    /** Someone edits the pull request between the app's read and its next rewrite. */
    editBeforeRewrite: undefined as string | undefined,
    /** Each pull request's conversation comments, oldest first. */
    comments: new Map<number, StandInComment[]>(),
    /** The last id the host gave a comment. */
    commentId: 900,
    /** A comment's id, as the host gives it to one it keeps. */
    nextCommentId(): number {
      host.commentId += 1;
      return host.commentId;
    },
    /** The connection drops as the next comment posts: the host keeps it, and its answer is lost. */
    loseNextComment: false,
    /** A person comments on the pull request. */
    comment(number: number, author: string, body: string): void {
      host.comments.set(number, [
        ...(host.comments.get(number) ?? []),
        { id: host.nextCommentId(), body, author },
      ]);
    },
    /** Merge a pull request as the host does it: by the app's request or by hand on its page. */
    land(number: number, way: MergeWay, words?: { title?: string }): string {
      const pull = host.pulls.get(number) as StandInPull;
      const commits = host.carried.get(pull.head) ?? [];
      let mergedSha: string;
      if (way === "squash") {
        mergedSha = id(`squash of #${number}`);
        host.main.push({ sha: mergedSha, title: words?.title ?? pull.title });
      } else if (way === "rebase") {
        // A rebase merge writes each commit again, so none keeps the id the batch gave it.
        for (const commit of commits)
          host.main.push({ sha: id(`rebased ${commit.sha}`), title: commit.title });
        mergedSha = (host.main.at(-1) as Commit).sha;
      } else {
        host.main.push(...commits);
        mergedSha = id(`merge of #${number}`);
      }
      host.branches.set("main", mergedSha);
      Object.assign(pull, { state: "closed", merged: true, mergedSha });
      return mergedSha;
    },
    /** The checks the host reports on the open batch's version. */
    report(checks: ForgeCheck[]): void {
      host.checks.set(host.batchHead(), checks);
    },
    batchHead(): string {
      const open = [...host.pulls.values()].find((pull) => pull.state === "open");
      return (open && host.branches.get(open.branch)) ?? "";
    },
    ready(readiness: ForgeReadiness): void {
      for (const pull of host.pulls.values()) if (pull.state === "open") pull.readiness = readiness;
    },
  };
  /** The pull request's version: its branch's, unless it has yet to follow a push. */
  const synced = (pull: StandInPull): StandInPull => {
    if (!host.trails) pull.head = host.branches.get(pull.branch) ?? pull.head;
    return pull;
  };
  const asChange = (pull: StandInPull): ForgeChange => ({
    number: pull.number,
    url: `https://github.com/acme/meter/pull/${pull.number}`,
    branch: pull.branch,
    headSha: synced(pull).head,
    title: pull.title,
    body: pull.body,
  });
  const close = (number: number | undefined) => {
    const pull = number === undefined ? undefined : host.pulls.get(number);
    if (pull) pull.state = "closed";
  };
  const forge = {
    kind: "github",
    host: "github.com",
    place: "GitHub",
    hasChecks: true,
    get mergeNamesNoVersion() {
      return host.noVersion ? (true as const) : undefined;
    },
    defaultBranch: async () => "main",
    changeFor: async (branch: string) => {
      if (host.offline) throw new ForgeError("transient", "GitHub could not be reached.");
      const pull = [...host.pulls.values()].find(
        (entry) => entry.branch === branch && entry.state === "open",
      );
      return pull ? asChange(pull) : null;
    },
    openChange: async (input: { branch: string; title: string; body: string }) => {
      refuseTooLong(input.body, presentationBodyLimit("github.com"), "opening the pull request");
      const pull: StandInPull = {
        number: 31 + host.pulls.size,
        branch: input.branch,
        head: host.branches.get(input.branch) as string,
        title: input.title,
        body: input.body,
        state: "open",
        merged: false,
        readiness: "blocked",
      };
      host.pulls.set(pull.number, pull);
      if (host.loseNextOpen) {
        host.loseNextOpen = false;
        host.offline = true;
        throw new ForgeError("transient", "GitHub did not answer in time.");
      }
      return asChange(pull);
    },
    branchHead: async (branch: string) => {
      const during = host.duringBranchRead;
      host.duringBranchRead = undefined;
      during?.();
      const head = host.branches.get(branch);
      if (!head) throw new ForgeError("refused", `GitHub has no branch ${branch}.`);
      return head;
    },
    updateChangeBody: async (change: ForgeChange, body: string, title?: string) => {
      const pull = synced(host.pulls.get(change.number as number) as StandInPull);
      if (host.editBeforeRewrite !== undefined) {
        pull.body = host.editBeforeRewrite;
        host.editBeforeRewrite = undefined;
      }
      // The host replaces a description only at the version, words and title just read.
      if (
        pull.state !== "open" ||
        pull.head !== change.headSha ||
        pull.body !== (change.body ?? "") ||
        (title !== undefined && pull.title !== change.title)
      )
        throw new ForgeWriteError(
          "failed",
          "refused",
          "The pull request changed after it was read, so its description was not replaced. Read it again before updating.",
        );
      refuseTooLong(body, presentationBodyLimit("github.com"), "replacing the description");
      Object.assign(pull, { body, ...(title ? { title } : {}) });
      host.rewrites.push({ number: pull.number, ...(title ? { title } : {}) });
    },
    pull: async (number: number): Promise<ForgePull> => {
      const pull = synced(host.pulls.get(number) as StandInPull);
      return {
        number,
        state: pull.state,
        merged: pull.merged,
        ...(pull.mergedSha ? { mergedSha: pull.mergedSha } : {}),
        headSha: pull.head,
        base: "main",
        branch: pull.branch,
        title: pull.title,
        readiness: pull.readiness,
      };
    },
    checks: async (change: ForgeChange) => {
      host.beforeChecks?.();
      const items = host.checks.get(change.headSha) ?? [];
      return host.checksProblem
        ? { complete: false, problem: host.checksProblem, items }
        : { complete: true, items };
    },
    putIn: async (change: ForgeChange, headSha: string, way?: MergeWay) => {
      const number = change.number as number;
      host.merges.push({
        number,
        head: headSha,
        ...(way ? { way } : {}),
        ...(change.title ? { title: change.title } : {}),
        ...(change.squashMessage ? { body: change.squashMessage } : {}),
      });
      if (host.refusal) throw new ForgeError("refused", host.refusal);
      const unconfirmed = host.unconfirmNext;
      if (unconfirmed) {
        host.unconfirmNext = undefined;
        throw new ForgeMergeUnconfirmed(
          `GitHub was asked to merge #${number} and has not finished it.`,
          unconfirmed.task,
        );
      }
      if (host.mergeQueue) {
        host.queued.add(number);
        return { queued: true as const };
      }
      return { sha: host.land(number, way ?? "squash", { title: change.title }) };
    },
    mergeTaskRefused: async (_number: number, task: string) => host.refusedTasks.has(task),
    inHostQueue: async (number: number) => {
      host.queueReads += 1;
      return host.queued.has(number);
    },
    mergeWays: async () => {
      if (host.waysUnreadable) throw new ForgeError("transient", "GitHub could not be reached.");
      return host.ways;
    },
    deleteBranch: async (branch: string) => {
      host.branches.delete(branch);
    },
    ownComments: async (number: number, marker: string) =>
      (host.comments.get(number) ?? [])
        .filter((comment) => comment.author === APP_ACCOUNT && comment.body.startsWith(marker))
        .map(({ id, body }) => ({ id, body })),
    writeComment: async (number: number, body: string, id?: number) => {
      refuseTooLong(
        body,
        presentationCommentLimit("github.com"),
        id === undefined ? "creating the comment" : "updating the comment",
      );
      const comments = host.comments.get(number) ?? [];
      const kept = comments.find((comment) => comment.id === id);
      if (id !== undefined && !kept)
        throw new ForgeError("not-found", "GitHub has no such comment.");
      if (kept) kept.body = body;
      else
        host.comments.set(number, [
          ...comments,
          { id: host.nextCommentId(), body, author: APP_ACCOUNT },
        ]);
      if (host.loseNextComment) {
        host.loseNextComment = false;
        throw new ForgeError("transient", "GitHub did not answer in time.");
      }
    },
    deleteComment: async (number: number, id: number) => {
      host.comments.set(
        number,
        (host.comments.get(number) ?? []).filter((comment) => comment.id !== id),
      );
    },
    closeWithNote: async (change: ForgeChange, note: string) => {
      host.notes.push({ number: change.number as number, note });
      close(change.number);
    },
    close: async (change: ForgeChange) => {
      const during = host.duringClose;
      host.duringClose = undefined;
      during?.();
      if (host.closeRefusal) throw new ForgeError("refused", host.closeRefusal);
      close(change.number);
    },
    label: (change: ForgeChange) => `#${change.number}`,
    url: (change: ForgeChange) => `https://github.com/acme/meter/pull/${change.number}`,
  };
  return { host, forge: forge as unknown as Forge };
}

export function setup(
  ways: MergeWays = EVERY_WAY,
  /** Whether a crewmate is told to rebuild a change that clashes with the open batch, as the app does. */
  opts: { rebuilding?: boolean } = {},
) {
  const db = openInMemoryDatabase();
  const repos = new RepoRegistry(db, "/fleet");
  seedProject(db, {
    id: REPO,
    name: "meter",
    path: "/code/meter",
    origin: "https://github.com/acme/meter.git",
    delivery: "queue-pr",
  });
  const { host, forge } = standInHost(ways);
  /** Each task's standing merge approval: the version the captain approved. */
  const approvals = new Map<string, string>();
  const approvedOrigins = new Map<string, string | null>();
  const closedTasks = new Set<string>();
  const declaredNoChecks = new Set<string>();
  /** Changes whose branch no longer combines with what is ahead of it. */
  const conflicting = new Set<string>();
  /** Changes that combine with the default branch but clash with the named change, when it is ahead of them. */
  const clashing = new Map<string, string>();
  /** Changes whose story cannot be written into a description now, as a picture edited since it was looked at. */
  const unwritable = new Set<string>();
  /** A change's story as its crewmate revised it: what its Why says now. */
  const retold = new Map<string, string>();
  /** A change's story at the length its crewmate wrote it, in characters. */
  const storyLengths = new Map<string, number>();
  /** A later part's version built on, where the part it was built on closed without merging. */
  const unmergedBases = new Map<string, string>();
  /** The versions whose branch still carries the work they were built on. */
  const carryingBase = new Set<string>();
  /** A version and the held or open batch version its branch builds on, as git reads its history. */
  const builtOn = new Map<string, string>();
  /** Versions waiting in line whose branch no longer combines with the open batch's version, as `merge-tree` reads it. */
  const clashingOpen = new Set<string>();
  /** Whether a push leaves the app and never comes back, as when it stops or the network drops. */
  let pushesStop = false;
  const heard = {
    settled: [] as string[][],
    sentBack: [] as { taskId: string; reason: string }[],
    addressMoved: [] as { taskId: string; reason: string }[],
    held: [] as BatchHeld[],
    notes: [] as Said[],
    taskNotes: [] as { taskId: string; text: string }[],
    pushes: [] as { branch: string; head: string; expected: string | null }[],
    /** The held versions each combine was given (`CombineInput.held`). */
    combinedOn: [] as (readonly string[] | undefined)[],
    excludedHeads: [] as (readonly string[] | undefined)[],
    landedReads: 0,
    /** Each time the open batch's checks reading changed (`BatchesOptions.checksRead`). */
    checksRead: [] as string[],
    /** Each crewmate told to rebuild on the open batch: its task, version and the batch version. */
    rebuilds: [] as { taskId: string; head: string; on: string; reason: string }[],
    /** Each change tried against the open batch's version. */
    tried: [] as { head: string; batch: string }[],
  };
  const names = ["infinitary-batch/3fa9c1d2", "infinitary-batch/8be04a67"];
  let clock = 10_000;
  /** Something that happens while the app combines a batch at home. */
  let duringCombine: (() => void) | undefined;
  /** The active naming runbook's rule: the built-in one, unless a test names another or none. */
  let naming: NamingRule | null = BUNDLED_NAMING;
  /** A change's story as the app reads it for the batch's description. */
  const storyOf = (member: Pick<BatchChange, "taskId" | "title">) => {
    if (unwritable.has(member.taskId))
      throw new Error("The retained media changed after inspection.");
    const region = `<!-- story of ${member.taskId} -->\n## Why\n${retold.get(member.taskId) ?? member.title}`;
    return {
      region: told(region, storyLengths.get(member.taskId)),
      projectText: `Part of the ${member.taskId} work.`,
    };
  };
  /** The app as it starts: a new owner over the same saved record and the same host. */
  const start = () =>
    new Batches({
      repos,
      forgeFor: () => forge,
      now: () => (clock += 1),
      naming: () => naming,
      approved: (taskId, head, repo) =>
        approvals.get(taskId) !== head
          ? false
          : approvedOrigins.has(taskId) && approvedOrigins.get(taskId) !== repo.origin
            ? "former-address"
            : true,
      runsNoChecks: (taskId) => declaredNoChecks.has(taskId),
      live: (taskId) => !closedTasks.has(taskId),
      unmergedBase: (change) => {
        const version = unmergedBases.get(change.taskId);
        return version ? [version] : undefined;
      },
      story: async (member) => storyOf(member),
      settle: (taskIds) => heard.settled.push(taskIds),
      // As the app does it: a change sent back keeps its approval, and its crewmate hears why.
      sentBack: (change, sent) =>
        heard.sentBack.push({ taskId: change.taskId, reason: sent.reason }),
      // A former address's change leaves the line with its approval ended, and no send-back.
      addressMoved: (change, reason) => heard.addressMoved.push({ taskId: change.taskId, reason }),
      held: (held) => heard.held.push(held),
      note: (fact) => heard.notes.push(fact),
      checksRead: (repoId) => heard.checksRead.push(repoId),
      taskNote: (taskId, text) => heard.taskNotes.push({ taskId, text }),
      // As git reads it (combine.test.ts): the open batch version a change's branch builds on.
      builtOnVersion: async (input) =>
        input.versions.find((version) => builtOn.get(input.head) === version),
      ...(opts.rebuilding
        ? {
            rebuild: ({ change, reason, told }) =>
              heard.rebuilds.push({
                taskId: change.taskId,
                head: change.head,
                on: told.on,
                reason,
              }),
            clashes: async (input) => {
              heard.tried.push({ head: input.head, batch: input.batch });
              return clashingOpen.has(input.head);
            },
          }
        : {}),
      combine: async (input: CombineInput): Promise<Combined> => {
        duringCombine?.();
        duringCombine = undefined;
        heard.combinedOn.push(input.held);
        heard.excludedHeads.push(input.excludeHeads);
        const base = host.branches.get(input.defaultBranch) as string;
        let head = base;
        const members: BatchMember[] = [];
        const commits: Commit[] = [];
        const leftOut: Combined["leftOut"] = [];
        const waiting: BatchChange[] = [];
        for (let change of input.changes) {
          // As git answers it (combine.test.ts): a change built on another's approved version.
          if (change.after && !members.some((member) => member.taskId === change.after)) {
            const unmerged = input.unmergedBase?.(change)?.[0];
            if (!unmerged && !input.merged?.(change.after)) {
              waiting.push(change);
              continue;
            }
            if (unmerged && carryingBase.has(change.head)) {
              leftOut.push({ change, reason: LEFT_OUT_WORDS.baseClosed(unmerged) });
              continue;
            }
          }
          if (conflicting.has(change.taskId)) {
            leftOut.push({ change, reason: LEFT_OUT_WORDS.conflict, clash: true });
            continue;
          }
          const ahead = members.find((member) => member.taskId === clashing.get(change.taskId));
          if (ahead) {
            leftOut.push({
              change,
              reason: LEFT_OUT_WORDS.ahead(ahead.title),
              ahead: ahead.taskId,
              clash: true,
            });
            continue;
          }
          // As git answers it (combine.test.ts): a fix carries its difference from the held
          // version its branch builds on, and a branch that lost a verified one is left out.
          if (change.fix || change.heldBase) {
            const on = builtOn.get(change.head);
            if (change.heldBase && on !== change.heldBase) {
              leftOut.push({ change, reason: LEFT_OUT_WORDS.fixBaseLost(change.heldBase) });
              continue;
            }
            if (on && input.held?.includes(on)) change = { ...change, heldBase: on };
          }
          // The commit's date is the combine's, so each combine writes new commits.
          head = id(`${head} ${change.head} ${input.at}`);
          commits.push({ sha: head, title: change.title });
          members.push({ ...change, commit: head });
        }
        host.carried.set(head, commits);
        return { base, head, members, leftOut, ...(waiting.length ? { waiting } : {}) };
      },
      push: async (input) => {
        if (pushesStop) throw new Error("the push did not come back");
        // The lease: a branch that is not where the app last pushed it is refused.
        if ((host.branches.get(input.branch) ?? null) !== input.expected)
          throw new Error(`stale info: ${input.branch} is not at ${input.expected}`);
        host.branches.set(input.branch, input.head);
        heard.pushes.push({ branch: input.branch, head: input.head, expected: input.expected });
      },
      landed: async (input) => {
        heard.landedReads += 1;
        return new Map(
          input.members.map((member) => [
            member.taskId,
            [...host.main].reverse().find((commit) => commit.title === member.title)?.sha,
          ]),
        );
      },
      branchName: () => names.shift() as string,
    });
  let batches = start();
  return {
    host,
    repos,
    heard,
    approvals,
    closedTasks,
    declaredNoChecks,
    conflicting,
    clashing,
    clashingOpen,
    unwritable,
    retold,
    storyLengths,
    storyOf,
    unmergedBases,
    carryingBase,
    builtOn,
    /** Pushes from now on never come back, or come back again. */
    stopPushes(stop: boolean) {
      pushesStop = stop;
    },
    get batches() {
      return batches;
    },
    /** The captain approves a change at its version: it goes in line, in turn with any pass at work. */
    approve(change: BatchChange): Promise<void> {
      approvals.set(change.taskId, change.head);
      approvedOrigins.set(change.taskId, repos.get(REPO)?.origin ?? null);
      return batches.enqueue(REPO, change);
    },
    /** The captain turns on a naming runbook of their own, or turns naming off. */
    nameBy(rule: NamingRule | null) {
      naming = rule;
    },
    /** What the captain does while the next batch is being combined. */
    whileCombining(run: () => void) {
      duringCombine = run;
    },
    /** One more pass, after every pass already asked for. */
    pass: () => batches.pass(REPO),
    /** Time passes on the app's clock. */
    advance(ms: number) {
      clock += ms;
    },
    /** The app closes and opens again: nothing but the saved record and the host carries over. */
    async restart() {
      batches = start();
      await batches.sweep();
    },
    record: () => batches.record(REPO),
    open: () => {
      const open = batches.record(REPO).open;
      if (!open) throw new Error("no batch is open");
      return open;
    },
    members: () => (batches.record(REPO).open?.members ?? []).map((member) => member.taskId),
    place: (change: BatchChange) => batches.standing(REPO, change.taskId, change.head),
  };
}
