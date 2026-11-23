import type { BatchChange, BatchMember } from "@shared/batches";
import { git, gitFailure, REMOTE_TIMEOUT_MS } from "../workspace/git";

/**
 * The combine of batches of your own (docs/forge.md, "Batches of your
 * own"): approved changes, in approval order, onto the freshly fetched
 * default branch, one commit per change. It runs in the project's own
 * folder with git's plumbing alone, so no file of that folder moves and
 * no branch of it changes; the fetched and written commits are kept under
 * `refs/infinitary/batch/`.
 */

const BASE_REF = "refs/infinitary/batch/base";
const CHANGE_REF = "refs/infinitary/batch/change";
const HEAD_REF = "refs/infinitary/batch/head";
const STACK_REF = "refs/infinitary/batch/stack";
const BUILT_REF = "refs/infinitary/batch/built-on";

/** Git's exit code for a merge it could not finish cleanly. */
const CONFLICT = 1;

/**
 * How a fetch or push goes where the project lives: git never waits on a
 * terminal nobody sees, and a remote that stops answering ends the call,
 * because every writer of the project's batch waits behind it.
 */
const network = (timeoutMs = REMOTE_TIMEOUT_MS) => ({
  env: { GIT_TERMINAL_PROMPT: "0" },
  timeoutMs,
});

/**
 * A branch that cannot be fetched reads as gone. A fetch the time limit
 * ended says nothing about the branch, so it fails the call instead: the
 * next pass reads again, and no change is left out for a slow remote.
 */
function unread(caught: unknown): null {
  if ((caught as { killed?: unknown }).killed === true) throw caught;
  return null;
}

export type CombineInput = {
  /** The project's folder at home. */
  repoDir: string;
  defaultBranch: string;
  /** The changes to combine, in approval order. */
  changes: readonly BatchChange[];
  /** The commits' date (epoch ms). */
  at: number;
  /** Versions a requested retry must not reuse. */
  excludeHeads?: readonly string[];
  remote?: string;
  /** Bound on each fetch; a test shortens it. */
  timeoutMs?: number;
  /** The approved version a task's work merged at; absent while it has not merged. */
  merged?: (taskId: string) => string | undefined;
  /**
   * The versions of the task a change was built on, when that task closed
   * without merging: the one the change was built on and the newest its
   * approval covered, which the change may have been brought onto.
   */
  unmergedBase?: (change: BatchChange) => readonly string[] | undefined;
  /**
   * The project's batch versions that held, newest first (`BatchRecord.held`). A
   * declared fix built on one of them combines as its own difference from
   * that version, so it can change lines a member added or changed.
   */
  held?: readonly string[];
  /**
   * The approved version of a task's change that merged, with a batch or
   * otherwise; absent while it has not. A change rebuilt on an open batch's
   * version (`onBatch`) goes once each change that version carries is ahead
   * of it at the same version or merged at it.
   */
  mergedWith?: (taskId: string) => string | undefined;
};

export type Combined = {
  /** The default branch's commit the batch was combined onto. */
  base: string;
  /** The batch's version: the last member's commit, or `base` when nothing combined. */
  head: string;
  members: BatchMember[];
  /**
   * The changes that did not combine, each with why. `ahead` names the task
   * of the approved change ahead of it in the batch that it clashes with,
   * where it still combines with the default branch alone.
   */
  leftOut: {
    change: BatchChange;
    reason: string;
    ahead?: string;
    /**
     * It no longer combines with the batch, or the batch version it was
     * rebuilt on no longer stands: rebuilding it on the open batch's version
     * answers it (docs/forge.md, "A change rebuilt on an open batch").
     */
    clash?: true;
  }[];
  /**
   * The changes built on another change's approved version (`after`) whose
   * base did not combine: they go back in line behind it, with no note.
   */
  waiting?: BatchChange[];
};

/** Why a change was left out, in words its crewmate reads. */
export const LEFT_OUT_WORDS = {
  moved:
    "its pushed branch is no longer at the approved version, so the batch could not carry what was approved",
  conflict: "it no longer combines with the default branch as it is now",
  unrelated:
    "its branch has no history in common with this project's default branch; rebuild it on the current default branch and show a new version",
  ahead: (title: string) =>
    `it combines with the default branch but clashes with "${title}", an approved change ahead of it in the batch that is not merged yet`,
  nothing: "it changes nothing on the default branch as it is now",
  fixClash: (held: string) =>
    `it is the held batch's fix, built on its version ${held}, and what it changes no longer combines with the batch as it is now; change the fix on a branch that still builds on ${held}, the version this repair stays measured from, or leave the batch to a new repair built on its current version`,
  fixBaseLost: (held: string) =>
    `it is the held batch's fix, built on its version ${held}, and its pushed branch no longer builds on that version, so the batch would carry work that was not approved with it; build the fix again on ${held}, the version this repair stays measured from, or leave the batch to a new repair built on its current version`,
  fixBaseUnread: (held: string) =>
    `it is the held batch's fix, and the batch's version ${held} it may be built on can no longer be read, so the batch could carry work that was not approved with it; this repair is measured from that version alone, so once it can be read here again push a new version of the fix on it and approve that version, or leave the batch to a new repair built on its current version`,
  stacked: (base: string) =>
    `it builds on ${base}, whose work is not merged or ahead of it in the batch, so the batch would carry work that was not approved with it`,
  baseClosed: (head: string) =>
    `it builds on ${head}, the approved version of a change that closed without merging, so the batch would carry that change's work that never merged; rebuild your branch on the default branch without that work`,
  // i18n-exempt: a left-out reason is English the crewmate reads, carried in the batch check's English words beside its siblings
  batchChanged: (head: string) =>
    `it was rebuilt on ${head}, a version of the open batch, and the batch's changes it was built on are no longer all ahead of it at their versions, so the batch would carry work that was not approved with it; rebuild your branch on the batch's version as it is now and show a new version`,
  // i18n-exempt: a left-out reason is English the crewmate reads, carried in the batch check's English words beside its siblings
  batchLost: (head: string) =>
    `it was declared rebuilt on ${head}, a version of the open batch, and its pushed branch does not build on that version; rebuild your branch on the batch's version as it is now and show a new version`,
  // i18n-exempt: a left-out reason is English the crewmate reads, carried in the batch check's English words beside its siblings
  batchClash: (head: string) =>
    `it was rebuilt on ${head}, a version of the open batch, and what it changes since that version no longer combines with the batch as it is now; rebuild your branch on the batch's version as it is now and show a new version`,
  // i18n-exempt: a left-out reason is English the crewmate reads, carried in the batch check's English words beside its siblings
  clashesBatch:
    "it no longer combines with the changes of the open batch ahead of it, which are not merged yet",
  // i18n-exempt: a left-out reason is English the crewmate reads, carried in the batch check's English words beside its siblings
  batchMerged: (head: string) =>
    `it clashed with a batch that has since merged, and waits for its version rebuilt on that batch's version ${head}, which goes first in the next batch`,
  behindBase: (head: string) =>
    `it does not build on ${head}, the approved version of the change it was built on that the batch carries or merged, so the batch would carry that change's earlier work that was not approved with it; bring your branch onto ${head} and show a new version`,
} as const;

/**
 * Fetch the default branch and each change's pushed branch, then write one
 * commit per change on top: the change's title as its subject and its
 * story's words as its body. A change that does not combine is left out
 * with its reason, and the rest go on.
 */
export async function combine(input: CombineInput): Promise<Combined> {
  const origin = input.remote ?? "origin";
  const fetch = (from: string, to: string) =>
    git(
      input.repoDir,
      ["fetch", "--quiet", "--no-tags", origin, `+refs/heads/${from}:${to}`],
      network(input.timeoutMs),
    );
  await fetch(input.defaultBranch, BASE_REF);
  const base = await git(input.repoDir, ["rev-parse", "--verify", `${BASE_REF}^{commit}`]);
  let head = base;
  const members: BatchMember[] = [];
  const leftOut: Combined["leftOut"] = [];
  const waiting: BatchChange[] = [];
  for (let change of input.changes) {
    // A change built on another's approved version comes right behind it, or waits in line for it.
    const ahead = change.after
      ? members.find((member) => member.taskId === change.after)
      : undefined;
    const builtOn = ahead?.head ?? (change.after ? input.merged?.(change.after) : undefined);
    const unmerged = change.after && !builtOn ? input.unmergedBase?.(change) : undefined;
    if (change.after && !builtOn && !unmerged?.length) {
      waiting.push(change);
      continue;
    }
    const fetched = await fetch(change.branch, CHANGE_REF)
      .then(() => git(input.repoDir, ["rev-parse", "--verify", `${CHANGE_REF}^{commit}`]))
      .catch(unread);
    if (fetched !== change.head) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.moved });
      continue;
    }
    if (!(await sharesHistory(input.repoDir, base, change.head))) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.unrelated });
      continue;
    }
    // Its base closed without merging: it goes only once its branch no longer carries that work.
    let carriedBase: string | undefined;
    for (const version of unmerged ?? [])
      if (await contains(input.repoDir, change.head, version)) {
        carriedBase = version;
        break;
      }
    if (carriedBase) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.baseClosed(carriedBase) });
      continue;
    }
    // Rebuilt on an open batch's version: it goes right behind the changes that version
    // carries, as its own difference from it, and never with work that is not approved.
    const onBatch = change.onBatch;
    if (onBatch) {
      const standsAhead = (carried: { taskId: string; head: string }) =>
        members.some(
          (member) => member.taskId === carried.taskId && member.head === carried.head,
        ) || input.mergedWith?.(carried.taskId) === carried.head;
      if (!onBatch.members.every(standsAhead)) {
        leftOut.push({ change, reason: LEFT_OUT_WORDS.batchChanged(onBatch.head), clash: true });
        continue;
      }
      if (!(await contains(input.repoDir, change.head, onBatch.head))) {
        leftOut.push({ change, reason: LEFT_OUT_WORDS.batchLost(onBatch.head), clash: true });
        continue;
      }
      const own = await mergedTree(
        input.repoDir,
        await rebased(input.repoDir, head, onBatch.head),
        change.head,
      );
      if (own === null) {
        leftOut.push({ change, reason: LEFT_OUT_WORDS.batchClash(onBatch.head), clash: true });
        continue;
      }
      if (own === (await git(input.repoDir, ["rev-parse", `${head}^{tree}`]))) {
        leftOut.push({ change, reason: LEFT_OUT_WORDS.nothing });
        continue;
      }
      head = await commit(input.repoDir, own, head, change, input.at);
      members.push({ ...change, commit: head });
      continue;
    }
    if (builtOn && !(await contains(input.repoDir, change.head, builtOn))) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.behindBase(builtOn) });
      continue;
    }
    if (!change.after && change.base && !(await carries(input.repoDir, head, change.base, fetch))) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.stacked(change.base) });
      continue;
    }
    // A fix built on a version of the held batch carries only its own difference from it,
    // and once verified that version goes with it: a branch that lost it, or a version that
    // can no longer be read, is never carried whole.
    const found =
      change.fix || change.heldBase
        ? await fixBase(input.repoDir, change.head, change.heldBase, input.held)
        : undefined;
    if (found && "lost" in found) {
      const words = found.unread ? LEFT_OUT_WORDS.fixBaseUnread : LEFT_OUT_WORDS.fixBaseLost;
      leftOut.push({ change, reason: words(found.lost) });
      continue;
    }
    const heldOn = found?.held;
    // The version is verified now, whether its difference applies or not: it goes with the
    // fix, left out or joined, so its repair keeps it (`fixBases`).
    if (heldOn) change = { ...change, heldBase: heldOn };
    const tree = heldOn
      ? await mergedTree(input.repoDir, await rebased(input.repoDir, head, heldOn), change.head)
      : await mergedTree(input.repoDir, head, change.head);
    if (tree === null && heldOn) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.fixClash(heldOn) });
      continue;
    }
    if (tree === null) {
      const clash = await clashAhead(input.repoDir, base, members, change.head);
      leftOut.push(
        clash
          ? {
              change,
              reason: LEFT_OUT_WORDS.ahead(clash.title),
              ahead: clash.taskId,
              clash: true,
            }
          : { change, reason: LEFT_OUT_WORDS.conflict, clash: true },
      );
      continue;
    }
    if (tree === (await git(input.repoDir, ["rev-parse", `${head}^{tree}`]))) {
      leftOut.push({ change, reason: LEFT_OUT_WORDS.nothing });
      continue;
    }
    head = await commit(input.repoDir, tree, head, change, input.at);
    members.push({ ...change, commit: head });
  }
  const last = members.at(-1);
  if (last && input.excludeHeads?.includes(head)) {
    // Identical work in the same Git second yields the same head. Change only the tip's
    // committer date, leaving the tree, parent, author and story words as they were.
    const excluded = new Set(input.excludeHeads);
    const tree = await git(input.repoDir, ["rev-parse", `${head}^{tree}`]);
    const parent = members.at(-2)?.commit ?? base;
    let committedAt = input.at;
    do {
      committedAt += 1_000;
      head = await commit(input.repoDir, tree, parent, last, input.at, committedAt);
    } while (excluded.has(head));
    last.commit = head;
  }
  // Kept until the next combine, so the written commits outlive a cleanup before their push.
  await git(input.repoDir, ["update-ref", HEAD_REF, head]);
  return { base, head, members, leftOut, ...(waiting.length ? { waiting } : {}) };
}

/**
 * Whether a change waiting in line no longer combines with the open batch's
 * version `batch` (docs/forge.md, "A change rebuilt on an open batch"),
 * read with `merge-tree`, which writes no ref a person sees. Undefined when
 * it cannot be told here: the branch is not at `head` where the project
 * lives, or the batch's version is not in this clone; the next combine
 * decides then.
 */
export async function clashesWithBatch(input: {
  repoDir: string;
  branch: string;
  head: string;
  batch: string;
  remote?: string;
  timeoutMs?: number;
}): Promise<boolean | undefined> {
  if (!(await readable(input.repoDir, input.batch))) return undefined;
  const fetched = await git(
    input.repoDir,
    [
      "fetch",
      "--quiet",
      "--no-tags",
      input.remote ?? "origin",
      `+refs/heads/${input.branch}:${CHANGE_REF}`,
    ],
    network(input.timeoutMs),
  )
    .then(() => git(input.repoDir, ["rev-parse", "--verify", `${CHANGE_REF}^{commit}`]))
    .catch(unread);
  if (fetched !== input.head || !(await sharesHistory(input.repoDir, input.batch, input.head)))
    return undefined;
  return (await mergedTree(input.repoDir, input.batch, input.head)) === null;
}

/**
 * The first of `versions`, open batch versions, that a change's branch at
 * `head` builds on (docs/forge.md, "A change rebuilt on an open batch"),
 * read from git's history whatever repair was declared: undefined when it
 * builds on none it can read; null when its branch could not be read at
 * `head`, so a later pass reads again. A head this clone does not hold yet
 * is fetched from its branch first.
 */
export async function batchVersionIn(input: {
  repoDir: string;
  branch: string;
  head: string;
  versions: readonly string[];
  remote?: string;
  timeoutMs?: number;
}): Promise<string | undefined | null> {
  if (!(await readable(input.repoDir, input.head))) {
    const fetched = await git(
      input.repoDir,
      [
        "fetch",
        "--quiet",
        "--no-tags",
        input.remote ?? "origin",
        `+refs/heads/${input.branch}:${BUILT_REF}`,
      ],
      network(input.timeoutMs),
    )
      .then(() => git(input.repoDir, ["rev-parse", "--verify", `${BUILT_REF}^{commit}`]))
      .catch(unread);
    if (fetched !== input.head) return null;
  }
  for (const version of input.versions)
    if (
      version !== input.head &&
      (await readable(input.repoDir, version)) &&
      (await contains(input.repoDir, input.head, version))
    )
      return version;
  return undefined;
}

/** A missing merge base is an expected Git result, unlike an unreadable commit. */
async function sharesHistory(repoDir: string, first: string, second: string): Promise<boolean> {
  try {
    await git(repoDir, ["merge-base", first, second]);
    return true;
  } catch (caught) {
    if ((caught as { code?: unknown }).code === 1) return false;
    throw caught;
  }
}

/** Whether `head` builds on `ancestor`. */
async function contains(repoDir: string, head: string, ancestor: string): Promise<boolean> {
  return git(repoDir, ["merge-base", "--is-ancestor", ancestor, head]).then(
    () => true,
    () => false,
  );
}

/**
 * Where a held batch's declared fix at `head` is carried from: `held`, the
 * version it builds on, as its own difference from it; `lost`, a version it
 * must build on that it no longer does or that can no longer be read, so it
 * is never carried whole; undefined, built on the default branch, carried the
 * ordinary way. The version a combine verified (`verified`) binds it; until
 * then it is the newest of the batch's held versions its branch builds on.
 * The combine and the commit-name check of the fix both read it, so the same
 * commits are the fix's own in each.
 */
export async function fixBase(
  repoDir: string,
  head: string,
  verified: string | undefined,
  held: readonly string[] | undefined,
): Promise<{ held: string } | { lost: string; unread?: true } | undefined> {
  if (verified) {
    if (!(await readable(repoDir, verified))) return { lost: verified, unread: true };
    return (await contains(repoDir, head, verified)) ? { held: verified } : { lost: verified };
  }
  // A version this clone cannot read is no ancestor of a branch it holds: it is passed over.
  for (const version of held ?? [])
    if ((await readable(repoDir, version)) && (await contains(repoDir, head, version)))
      return { held: version };
  return undefined;
}

/** Whether this clone holds `version` as a commit. */
async function readable(repoDir: string, version: string): Promise<boolean> {
  return git(repoDir, ["cat-file", "-e", `${version}^{commit}`]).then(
    () => true,
    () => false,
  );
}

/**
 * A commit with `ours`'s tree whose only parent is `base`, so merging a
 * branch built on `base` onto it applies just that branch's difference from
 * `base`, as a cherry-pick does: their merge base is `base` itself. It needs
 * no newer git than `merge-tree --write-tree` does.
 */
async function rebased(repoDir: string, ours: string, base: string): Promise<string> {
  return git(repoDir, ["commit-tree", `${ours}^{tree}`, "-p", base, "-m", "batch"], {
    env: {
      GIT_AUTHOR_NAME: "Infinitary",
      GIT_AUTHOR_EMAIL: "batch@infinitary.invalid",
      GIT_COMMITTER_NAME: "Infinitary",
      GIT_COMMITTER_EMAIL: "batch@infinitary.invalid",
    },
  });
}

/**
 * Whether `head` already holds everything `branch` carries where the
 * project lives: merging the branch onto it changes nothing. A branch that
 * cannot be read is not known to be carried.
 */
async function carries(
  repoDir: string,
  head: string,
  branch: string,
  fetch: (from: string, to: string) => Promise<unknown>,
): Promise<boolean> {
  const base = await fetch(branch, STACK_REF)
    .then(() => git(repoDir, ["rev-parse", "--verify", `${STACK_REF}^{commit}`]))
    .catch(unread);
  if (base === null || !(await sharesHistory(repoDir, head, base))) return false;
  const tree = await mergedTree(repoDir, head, base);
  return tree !== null && tree === (await git(repoDir, ["rev-parse", `${head}^{tree}`]));
}

/**
 * The approved change ahead in the batch that a change clashes with, where
 * the change still combines with the default branch alone: the first member
 * whose commit, carrying every member before it, it no longer combines with.
 * Undefined when it clashes with the default branch itself, so bringing it
 * up to date is what answers it.
 */
async function clashAhead(
  repoDir: string,
  base: string,
  members: readonly BatchMember[],
  theirs: string,
): Promise<BatchMember | undefined> {
  if (members.length === 0 || (await mergedTree(repoDir, base, theirs)) === null) return undefined;
  for (const member of members)
    if ((await mergedTree(repoDir, member.commit, theirs)) === null) return member;
  return undefined;
}

/** The tree of `theirs` merged onto `ours`; null when they do not combine. */
async function mergedTree(repoDir: string, ours: string, theirs: string): Promise<string | null> {
  try {
    return await git(repoDir, ["merge-tree", "--write-tree", "--no-messages", ours, theirs]);
  } catch (caught) {
    if ((caught as { code?: unknown }).code === CONFLICT) return null;
    throw caught;
  }
}

/** One commit for a change, under the name its own last commit carries. */
async function commit(
  repoDir: string,
  tree: string,
  parent: string,
  change: BatchChange,
  at: number,
  committedAt = at,
): Promise<string> {
  const [name = "", email = ""] = (
    await git(repoDir, ["log", "-1", "--format=%an%n%ae", change.head])
  ).split("\n");
  const date = `${Math.floor(at / 1000)} +0000`;
  const message = change.body.trim() ? `${change.title}\n\n${change.body.trim()}\n` : change.title;
  return git(repoDir, ["commit-tree", tree, "-p", parent, "-m", message], {
    env: {
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
      GIT_COMMITTER_DATE: `${Math.floor(committedAt / 1000)} +0000`,
    },
  });
}

/**
 * Push the combined version to the batch branch the app owns. `expected`
 * is the version the branch is at where the project lives, as the app last
 * pushed it or just read it, or null for a new branch: a branch that moved
 * since then is refused, and the next pass reads it again.
 */
export async function pushBatch(input: {
  repoDir: string;
  branch: string;
  head: string;
  expected: string | null;
  remote?: string;
  /** Bound on the push; a test shortens it. */
  timeoutMs?: number;
}): Promise<void> {
  await git(
    input.repoDir,
    [
      "push",
      "--quiet",
      `--force-with-lease=refs/heads/${input.branch}:${input.expected ?? ""}`,
      input.remote ?? "origin",
      `${input.head}:refs/heads/${input.branch}`,
    ],
    network(input.timeoutMs),
  );
}

/**
 * The rewritten commits ending at `end`, one per member in order, matched
 * by subject: each member whose commit's words name it.
 */
async function matchRewritten(
  repoDir: string,
  end: string,
  members: readonly BatchMember[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const rewritten = (
    await git(repoDir, ["rev-list", "--first-parent", "-n", String(members.length), end])
  )
    .split("\n")
    .filter(Boolean)
    .reverse();
  if (rewritten.length !== members.length) return found;
  for (const [index, member] of members.entries()) {
    const sha = rewritten[index] as string;
    const subject = await git(repoDir, ["log", "-1", "--format=%s", sha]);
    if (subject === member.title) found.set(member.taskId, sha);
  }
  return found;
}

/**
 * Each member's own commit on the default branch after its batch merged.
 * A merge that kept the batch's commits answers them as they were written;
 * a rebase merge wrote new ones, read as the last commits of the default
 * branch up to the merge, in the batch's order, each matched by its title;
 * a rebase that ends in a merge commit is read under that commit's second
 * parent.
 * A commit that cannot be read stays undefined, never guessed.
 */
export async function landedCommits(input: {
  repoDir: string;
  defaultBranch: string;
  members: readonly BatchMember[];
  /** The commit the host says the merge wrote. */
  merged?: string;
  remote?: string;
  /** Bound on the fetch; a test shortens it. */
  timeoutMs?: number;
}): Promise<Map<string, string | undefined>> {
  const landed = new Map<string, string | undefined>();
  for (const member of input.members) landed.set(member.taskId, undefined);
  try {
    await git(
      input.repoDir,
      [
        "fetch",
        "--quiet",
        "--no-tags",
        input.remote ?? "origin",
        `+refs/heads/${input.defaultBranch}:${BASE_REF}`,
      ],
      network(input.timeoutMs),
    );
    const tip = await git(input.repoDir, ["rev-parse", "--verify", `${BASE_REF}^{commit}`]);
    const kept = await Promise.all(
      input.members.map((member) =>
        git(input.repoDir, ["merge-base", "--is-ancestor", member.commit, tip]).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (kept.every(Boolean)) {
      for (const member of input.members) landed.set(member.taskId, member.commit);
      return landed;
    }
    const end = input.merged ?? tip;
    const matched = await matchRewritten(input.repoDir, end, input.members);
    // A rebase that ends in a merge commit, as Bitbucket's rebase merge
    // makes, keeps the rewritten commits under its second parent.
    const found =
      matched.size === 0 &&
      (await git(input.repoDir, ["rev-parse", "--verify", "--quiet", `${end}^2`]).then(
        () => true,
        () => false,
      ))
        ? await matchRewritten(input.repoDir, `${end}^2`, input.members)
        : matched;
    for (const [taskId, sha] of found) landed.set(taskId, sha);
  } catch (caught) {
    console.warn(`[batches] reading the merged commits: ${gitFailure(caught)}`);
  }
  return landed;
}
