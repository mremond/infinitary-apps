import type { MergeWay, MergeWays } from "@shared/batches";
import type { ForgeCheckState } from "@shared/checkSnapshot";
import type { ForgeKind } from "@shared/forge";
import { changeRequestHost } from "@shared/forgeKinds";
import type { ForgeProject } from "@shared/forges";
import type { PresentationDestination } from "@shared/presentationDestination";
import type { ForgeApi } from "./api";
import type { ForgeAttachments } from "./attachments";
import type { ForgeContributions } from "./contributions";
import type { ForgeWorkflows } from "./workflows";

/**
 * The forge seam (git integration PR 1.1, `docs/forge.md`): what the app
 * asks of the place a project lives - list the person's projects there,
 * read its default branch, open a proposed change, find the open one for a
 * branch, read its checks, put it in, close it, and name it - without the
 * rest of the core knowing which host answers. One `Forge` per repository;
 * `forgeFor` in `./index.ts` picks the implementation from the repository's
 * kind. The provider files live under `./providers/` and are fenced: only
 * this directory, its home wiring (`homeForges.ts`) among it, may import
 * one.
 *
 * The kinds answer:
 * - `github`: a pull request, its check runs and commit statuses, a merge at
 *   the checked head, over GitHub's REST API with the app's own GitHub
 *   sign-in (PR 1.2, `./signIns.ts`).
 * - `gitlab`: a merge request, the pipelines and jobs GitLab ran for its
 *   head, a squash merge at the checked head, over GitLab's REST API with
 *   the key the person made there.
 * - `bitbucket`: a pull request on Bitbucket Cloud, the build statuses on
 *   its head, a squash merge after reading the branch is still at the
 *   checked head, over Bitbucket's REST API with the person's API token.
 * - `git`: the
 *   working copy is SENT UP as its own branch; it has no checks, so it reads
 *   green with zero of them; putting it in fast-forwards the default branch
 *   onto the checked head and sends that up.
 * - `none`: nothing leaves this Mac. Putting work in is the local land that
 *   already exists (`WorkspaceService.landTaskWork`, reached through the
 *   local-only posture); this forge answers that there is nowhere to send a
 *   change.
 */

export type ForgeLocation = {
  kind: ForgeKind;
  /** Lower-case host name; null for a project on this Mac or a remote on its disk. */
  host: string | null;
  owner?: string;
  name?: string;
  /** The repository's working folder on this Mac: where git runs for it. */
  dir: string;
  /** A verified fork that supplies task branches while requests target this location. */
  source?: { id: number; fullName: string };
  /**
   * The project's advisory workflow files (`RepoView.advisoryWorkflows`):
   * a host that names each check's workflow file marks their checks
   * `advisory` (docs/forge.md, "Advisory workflows").
   */
  advisoryWorkflows?: readonly string[];
};

export type ForgeChange = {
  /** The host's own number for it (`#N` on GitHub, `!N` on GitLab); absent for a sent-up working copy. */
  number?: number;
  /** Where the person can open it; null where the host has no page for it. */
  url: string | null;
  branch: string;
  headSha: string;
  /** Request title; at a contributor merge, the verified story supplies the squash title. */
  title?: string;
  /** A prerequisite publication remains a draft until final proof is reviewed. */
  draft?: boolean;
  /** Host body, retained for legacy delivery and breaking-change footers. */
  body?: string;
  /** Plain text from the verified saved story, never its rendered description. */
  squashMessage?: string;
  /** The branch the change targets, where the host names one (INF-1873). */
  base?: string;
};

/**
 * The events a pull request's own runs carry on GitHub (INF-1891): the ones
 * the host starts for the pull request itself. A run a person or a tool
 * started on the branch by hand, or a schedule, is not the change's check.
 */
const CHANGE_RUN_EVENTS = new Set(["pull_request", "pull_request_target"]);

/**
 * The checks that are a proposed change's own (INF-1891, the captain: "for
 * merge we only care about the PR checks"): a check whose run the host named
 * an event for stays only when that event is the change's own, while one
 * with no event - a commit status, a check an app posted - stays as read.
 * A branch's own checks, such as the default branch's, are never read
 * through this: their runs carry the push that made them.
 *
 * `pushed` is a batch's pull request (docs/forge.md, "Batches of your own"):
 * its branch is one the app itself pushed, so the run the host started for
 * that push is the batch's check as much as one its pull request started.
 * A project that checks every pushed branch starts no other run for it.
 */
export function ownChecksOf(items: ForgeCheck[], pushed = false): ForgeCheck[] {
  return items.filter(
    (check) =>
      check.event === undefined ||
      CHANGE_RUN_EVENTS.has(check.event) ||
      (pushed && check.event === "push"),
  );
}

/**
 * A check from one of the project's advisory workflows (docs/forge.md,
 * "Advisory workflows"): it reads `neutral`, which holds nothing anywhere a
 * reading is judged, and keeps the state the host reported in `advisory`.
 * Matched by the workflow run it belongs to, never by a check's name, so a
 * check of another workflow that shares its name still holds.
 */
export function asAdvisory(check: ForgeCheck): ForgeCheck {
  return { ...check, state: "neutral", advisory: check.advisory ?? check.state };
}

/** A check in the state the host reported, an advisory one's included. */
export function asReported({ advisory, ...check }: ForgeCheck): ForgeCheck {
  return advisory ? { ...check, state: advisory } : check;
}

/**
 * One check's state, normalised: `success`, `skipped` and a finished
 * `neutral` permit green, as GitHub's required checks pass on them; terminal
 * failures are red; anything still queued or running is `pending`. A check
 * a person must start (`ForgeCheck.manual`) holds green without being red; a
 * failure the project allows (`ForgeCheck.failureAllowed`) is `neutral`.
 */
export type { ForgeCheckState } from "@shared/checkSnapshot";
export { isRedCheckState } from "@shared/checkSnapshot";

/**
 * One check, with when the host says it started and finished (epoch ms),
 * where it says so: the checks cell counts from them (INF-587).
 */
export type ForgeCheck = {
  name: string;
  state: ForgeCheckState;
  startedAt?: number;
  finishedAt?: number;
  run?: number;
  workflow?: number;
  event?: string;
  status?: string;
  conclusion?: string | null;
  allowFailure?: boolean;
  /**
   * A check that waits for a person to start it, such as a GitLab manual job
   * that blocks its pipeline: it holds the change, and nothing finishes on
   * its own (`@shared/checkSnapshot`'s `checkItemSchema`).
   */
  manual?: boolean;
  /**
   * A `neutral` check that failed or was cancelled where its project allows
   * it to fail, such as a GitLab job with `allow_failure`: it holds nothing,
   * as the host's own pipeline passes with it (`@shared/checkSnapshot`).
   */
  failureAllowed?: boolean;
  /**
   * The state the host reported for a check from one of the project's
   * advisory workflows (`ForgeLocation.advisoryWorkflows`), whose own
   * `state` then reads `neutral`: it holds nothing, whether it is still
   * running, failed or never finished (`asAdvisory`).
   */
  advisory?: ForgeCheckState;
  /**
   * A row that sums up a whole run rather than one check of its own, such as
   * GitHub's unfinished workflow run or a GitLab pipeline beside its jobs:
   * its jobs are the checks, so nothing re-runs it by its name.
   */
  summary?: boolean;
  ref?: string;
  /** A commit status's description, as the host keeps it; the batch check's words. */
  detail?: string;
  /** A commit status's link; the batch check's is its batch's pull request. */
  link?: string;
};

/** A check's start and finish from the host's ISO times, leaving out any it lacks or garbles. */
export function checkTimes(
  started: string | null | undefined,
  finished: string | null | undefined,
): { startedAt?: number; finishedAt?: number } {
  const startedAt = started ? Date.parse(started) : Number.NaN;
  const finishedAt = finished ? Date.parse(finished) : Number.NaN;
  return {
    ...(Number.isFinite(startedAt) ? { startedAt } : {}),
    ...(Number.isFinite(finishedAt) ? { finishedAt } : {}),
  };
}

export type ForgeOverall = "green" | "red" | "pending";

export type ForgeChecks = {
  complete?: boolean;
  /** A known read refusal, preserved with partial facts rather than hidden as running. */
  problem?: string;
  /** Legacy readers may supply this; the host never uses it as a verdict. */
  overall?: ForgeOverall;
  items: ForgeCheck[];
  /**
   * The host added its own "checks have not started yet" marker, not a real
   * check: the list was empty, or a pull request's own workflow runs are
   * not on the version yet. A head-bound absence declaration may waive only
   * this marker, never a check beside it that has not passed.
   */
  notStarted?: boolean;
};

/**
 * Whether the host would let a change merge now, in typed terms (GitHub's
 * `mergeable_state`, GitLab's `detailed_merge_status`): `clean` may merge; `conflict` is in conflict with
 * newer work; `behind` must be brought up to date first; `blocked` is held
 * by the branch's rules - a required review, a required check, another
 * protection; `computing` is the host still working it out; `draft` is a
 * draft. Anything the app cannot place reads `computing`, never `clean`.
 */
export type ForgeReadiness = "clean" | "conflict" | "behind" | "blocked" | "computing" | "draft";

/**
 * One comment on a pull request as the host lists it (docs/forge.md,
 * "Comments on a pull request"): who wrote it and where, never its words.
 * `story` marks the app's own story comment and `empty` a review with no
 * words of its own, such as a bare approval; neither wakes anyone.
 */
export type ForgePullComment = import("@shared/pullComments").PullCommentFact & {
  /** The review a line comment was sent in, when it was. */
  reviewId?: number;
  story?: true;
  empty?: true;
};

/** One of the app's own comments on a pull request, with its words: an id to rewrite or delete it by. */
export type ForgeComment = { id: number; body: string };

/** One pull request (a merge request on GitLab) read by its number, whatever its state (FI3-304). */
export type ForgePull = {
  url?: string;
  number: number;
  state: "open" | "closed";
  merged: boolean;
  mergedSha?: string;
  /** The host's last change time, including review activity, never a local guess. */
  updatedAt?: string;
  headSha: string;
  base: string;
  branch?: string;
  title?: string;
  /**
   * The source repository (`owner/name`, or GitLab's immutable project identity). Absent when
   * the host did not say, which a referenced merge treats as unproven.
   */
  headRepo?: string;
  /** Immutable host repository id, when supplied. */
  headRepoId?: number;
  /**
   * A contributor's pull request whose author allows the project's
   * maintainers to push to its branch (GitHub's `maintainer_can_modify`).
   */
  maintainerCanModify?: true;
  readiness: ForgeReadiness;
  mergeable?: boolean | null;
  mergeableState?: string;
  /**
   * Its host's merge names no version (`Forge.mergeNamesNoVersion`): an open
   * read after a merge was sent cannot show that nothing went in.
   */
  mergeNamesNoVersion?: true;
  /**
   * The host refused the read of the merge it took (`ForgeMergeUnconfirmed.mergeTask`)
   * in a way that may mean the merge failed or that the task is not this
   * pull request's: it does not confirm either, so nothing is sent again.
   */
  mergeTaskRefused?: true;
};

/**
 * Whether the signed-in person may skip a rule set, as GitHub says it
 * (`current_user_can_bypass`); null when GitHub did not say.
 */
export type ForgeBypass = "always" | "pull_requests_only" | "exempt" | "never" | null;

/** One active rule set holding a branch, read for this sign-in (FI3-1571 piece 2). */
export type ForgeRuleset = {
  id: number;
  name: string;
  bypass: ForgeBypass;
  /** The rule types it holds the branch to, in GitHub's names: `pull_request`, `required_status_checks`. */
  rules: string[];
  /** The merge methods its pull request rule allows, when it names any. */
  mergeMethods?: string[];
};

/**
 * A host's answer to a merge it accepted: the commit it made where it says
 * one, or `queued` when the branch's own merge queue took the change and has
 * not merged it yet.
 */
export type MergeAnswer = {
  sha?: string;
  queued?: true;
  /**
   * The full version the host says it merged, where its merge takes no
   * version to hold it to (`Forge.mergeNamesNoVersion`): when it is not the
   * one asked for, a push landed between the app's read and the merge.
   */
  mergedHead?: string;
};

/**
 * A merge past the rules as the host reports it: merged, failed (nothing
 * merged), or not finished when the app stopped reading - an outcome the
 * app does not know and never sends again.
 */
export type ForgeSkipMerge =
  | { status: "merged"; sha?: string }
  | { status: "failed"; message: string }
  | { status: "unknown"; message: string };

export type { ForgeProject } from "@shared/forges";

/**
 * Why a forge call failed, as a typed fact rather than words to match:
 * `transient` is a network or host hiccup worth a quiet retry; `sign-in` is
 * the host refusing who the app is (a 401); `permission` is the host
 * refusing what was asked (a 403); `not-found` and `refused` are the host's
 * verdict on the thing itself (a stale head, a change that cannot go in);
 * `unsupported` is a kind that has no such thing.
 */
export type ForgeFailure =
  | "transient"
  | "sign-in"
  | "permission"
  | "not-found"
  | "refused"
  | "unsupported";

export class ForgeError extends Error {
  constructor(
    readonly failure: ForgeFailure,
    message: string,
    /** True when nothing was sent: the ask records refused, not unknown. */
    readonly beforeSend = false,
  ) {
    super(message);
    this.name = "ForgeError";
  }
}

/**
 * GitHub answered a read with a redirect to a repository by its number,
 * which is how it answers an address a repository moved or was renamed
 * from. The gateway follows no redirect; `path` is where it pointed,
 * relative to the API, for a caller that may read there itself.
 */
export class ForgeMovedError extends ForgeError {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super("refused", message);
    this.name = "ForgeMovedError";
  }
}

/** A write's owner distinguishes a definite refusal from a response lost after sending. */
export class ForgeWriteError extends ForgeError {
  constructor(
    readonly outcome: "failed" | "uncertain",
    failure: ForgeFailure,
    message: string,
  ) {
    super(failure, message);
    this.name = "ForgeWriteError";
  }
}

/**
 * The host refused because the sign-in's hourly allowance is spent (a 403
 * or 429 with no calls left), with the time the host said it resets: a wait
 * on a fact the host gave, not a verdict on what was asked. Its failure
 * stays `permission`, so a write is never retried as if nothing happened;
 * a timed read waits until `resetAt` and reads again (INF-2149).
 */
export class ForgeAllowanceSpent extends ForgeError {
  constructor(
    /** When the host said the allowance comes back, in epoch milliseconds. */
    readonly resetAt: number,
    message: string,
  ) {
    super("permission", message);
    this.name = "ForgeAllowanceSpent";
  }
}

/**
 * The host refused a merge because the branch it merges into moved while it
 * merged (GitHub's 405 "Base branch was modified"): a fact about when the
 * request went out, not a verdict on the change. Its failure stays
 * `refused`, so nothing treats it as a hiccup; the merge reads the pull
 * request again and sends once more only where the host says it may merge.
 */
export class ForgeBaseMoved extends ForgeError {
  constructor(message: string) {
    super("refused", message);
    this.name = "ForgeBaseMoved";
  }
}

/**
 * A merge the host took and has not confirmed, on a host whose merge names
 * no version: an outcome not yet known, never sent again. `mergeTask` is
 * the host's own reference to that merge, when it gave one, which a later
 * read asks how it ended (`Forge.mergeTaskRefused`).
 */
export class ForgeMergeUnconfirmed extends ForgeError {
  constructor(
    message: string,
    readonly mergeTask?: string,
  ) {
    super("transient", message);
    this.name = "ForgeMergeUnconfirmed";
  }
}

export function allowanceResetOf(caught: unknown): number | undefined {
  return caught instanceof ForgeAllowanceSpent ? caught.resetAt : undefined;
}

/** A change's own title, without the marker a host such as GitLab keeps in a draft's title (`Draft: `). */
export function changeTitle(kind: ForgeKind, change: ForgeChange): string | undefined {
  const prefix = changeRequestHost(kind)?.draftTitlePrefix;
  return prefix && change.draft && change.title?.startsWith(prefix)
    ? change.title.slice(prefix.length)
    : change.title;
}

export function isSignInForgeFailure(caught: unknown): boolean {
  return caught instanceof ForgeError && caught.failure === "sign-in";
}

/** A failure the caller may retry quietly: only a typed transient one. */
export function isTransientForgeFailure(caught: unknown): boolean {
  return caught instanceof ForgeError && caught.failure === "transient";
}

/**
 * The team queue's files a project still carries, by their paths, and the
 * default branch's rule that still requires the queue's status, in the
 * host's own name for it.
 */
export type TeamQueueLeftovers = { files: string[]; rule?: string };

export interface Forge {
  readonly kind: ForgeKind;
  readonly host: string | null;
  /** The person's word for where the project lives ("GitHub", a host's address), or null. */
  readonly place: string | null;
  /**
   * Whether the host runs checks on a change that the app can read, and so
   * watch (`docs/forge.md`, "The check watch"). A kind without them reads
   * green with zero checks; the app watches nothing there and says so.
   */
  readonly hasChecks: boolean;
  /**
   * The host's merge takes no version to hold it to (Bitbucket Cloud), and
   * an owner's sign-in may merge past its rules. Every merge then reads the
   * pull request's own readiness first, and a merge request whose answer
   * never came is never sent again: only a read says how it ended.
   */
  readonly mergeNamesNoVersion?: true;
  /**
   * Whether the host refused the read of a merge it took and had not
   * confirmed (`ForgeMergeUnconfirmed.mergeTask`); false while it runs or
   * once it merged. A refusal is not proof the merge failed.
   */
  mergeTaskRefused?(number: number, task: string): Promise<boolean>;
  /** The selected contributor change publishes its saved story in a comment. */
  readonly storyInComment?: boolean;
  /**
   * The line that opens a contributor change's story comment, from its
   * project's setting (docs/forge.md, "Disclosing AI assistance");
   * undefined posts none.
   */
  readonly storyDisclosure?: string;
  readonly workflows?: ForgeWorkflows;
  /**
   * The host's own words for why it has no runs, logs or release files,
   * where it keeps none of its own (Bitbucket Data Center, whose checks are
   * build statuses another service posts); said to a crewmate that asks
   * for one in place of the general refusal.
   */
  readonly noRunsWords?: string;
  /** Native evidence attachments, offered only on hosts qualified for publication. */
  readonly attachments?: ForgeAttachments;
  readonly contributions?: ForgeContributions;
  readonly api?: ForgeApi;
  /** Saved-story identity, also on hosts without native media or a description. */
  storyDestination?(): Promise<PresentationDestination>;
  /** The person's projects on this host, newest first. */
  listProjects(): Promise<ForgeProject[]>;
  /** Every project the sign-in lists, and whether that was all; absent where the host pages none. */
  listProjectsPaged?(): Promise<{ projects: ForgeProject[]; complete: boolean }>;
  /** One project by its exact owner/name, or null; absent where the host cannot look one up. */
  findProject?(fullName: string): Promise<ForgeProject | null>;
  defaultBranch(): Promise<string>;
  /**
   * Offer the branch as a proposed change; on a plain host this sends it up.
   * `base` names the branch it targets where the host takes one (INF-1873);
   * absent, the default branch. `source` names the ref this Mac holds the
   * branch at when not under its own name (INF-2490), for a host that is
   * sent the branch from here.
   */
  openChange(input: {
    branch: string;
    title: string;
    body: string;
    draft?: boolean;
    base?: string;
    source?: string;
  }): Promise<ForgeChange>;
  /**
   * Replace the description, a saved story or legacy words, only if its just-read body and code
   * version still match. A `title` goes in the same write, only if the just-read title still
   * matches too; it is the change's own title, and GitLab keeps a draft's marker before it.
   */
  updateChangeBody?(change: ForgeChange, body: string, title?: string): Promise<void>;
  /** Read the pushed branch before opening a story-bound change. */
  branchHead?(branch: string): Promise<string>;
  /**
   * The page that shows what the pushed branch adds to the default branch,
   * for a change with no pull request of its own (INF-4196); absent where
   * the host has no such page.
   */
  branchPage?(branch: string): Promise<string | null>;
  /**
   * The default branch's own checks, and the commit they were read on
   * (INF-833 Fix 4). Absent where the host cannot read a branch's checks
   * apart from a proposed change; the close of the named task remains the
   * resume there.
   */
  branchChecks?(): Promise<{ sha: string; checks: ForgeChecks }>;
  /** The open proposed change for a branch, or null when there is none. */
  changeFor(branch: string): Promise<ForgeChange | null>;
  /** Host-owned readiness transition for this version, never the public write gateway. */
  markReady?(change: ForgeChange, beforeSend: () => void): Promise<ForgeChange>;
  /**
   * The checks on `change.headSha`, the change's head version, read by the one
   * green rule; or, given `movedPast`, on another version an open repair was
   * declared at (INF-685). The change's own checks never start on a version it
   * has moved past, so that reading carries no marker of them not having
   * started (INF-988); a run on a branch still at that version may start there
   * yet (`branchesAt`, INF-1185).
   */
  checks(change: ForgeChange, movedPast?: string): Promise<ForgeChecks>;
  /**
   * The branches whose head is `sha` (INF-1185): the host starts a run - on a
   * push, or one dispatched on a branch - only at a branch's head, so a
   * version no branch is at gets no new check. Throws when it cannot say.
   * Absent where the host cannot list them.
   */
  branchesAt?(sha: string): Promise<string[]>;
  /**
   * Whether the host holds `sha` as that exact full commit id (INF-1184):
   * false when it holds no such commit, as for a mistyped, shortened or
   * unpushed id; throws when it cannot say. Absent where the host cannot
   * look a commit up.
   */
  holdsCommit?(sha: string): Promise<boolean>;
  /**
   * Put the change in, only while its head is still `headSha`. A host that
   * confirms the merge answers its commit; one that cannot says nothing.
   * `queued` is a host whose branch has a merge queue of its own taking the
   * change into it instead (docs/forge.md, "The host's merge queue"): the
   * change is not merged, and the host merges or removes it later.
   */
  putIn(
    change: ForgeChange,
    headSha: string,
    /**
     * The merge the project allows, as read from where it lives right before
     * this call (`wayToSend` for a merge card's click, `mergeWayFor` for a
     * batch; docs/forge.md, "Batches of your own"): `rebase` and `merge` keep
     * each commit. Never assumed: undefined only where the host has no
     * `mergeWays` to read, and a host that has them refuses it.
     */
    way: MergeWay | undefined,
    /**
     * On a host whose merge names no version (`mergeNamesNoVersion`), runs
     * once as the merge request leaves, after every read before it; a throw
     * stops the request with nothing sent. Other hosts never run it, so
     * their caller runs its check before the call.
     */
    beforeSend?: () => void,
  ): Promise<MergeAnswer | undefined>;
  /**
   * Whether the host's own merge queue holds this change now. Read, never
   * written: a change the host removed from its queue is not sent again by
   * a retry. Absent on a host whose branches have no merge queue of their own.
   */
  inHostQueue?(number: number): Promise<boolean>;
  /**
   * The merges the project allows, from its own settings and its default
   * branch's rules, as the host answers them now.
   */
  mergeWays?(): Promise<MergeWays>;
  /**
   * What the project still carries of the team queue the app once shipped,
   * read on its default branch (docs/forge.md, "A project that still
   * carries the team queue's files"). Nothing in the app reads those files
   * now: the answer is for the one offer to remove them.
   */
  teamQueueLeftovers?(): Promise<TeamQueueLeftovers>;
  /** Delete a branch the app pushed; one already gone is not an error. */
  deleteBranch?(branch: string): Promise<void>;
  /** Close a change with a note saying where its work went. */
  closeWithNote?(change: ForgeChange, note: string): Promise<void>;
  /**
   * The pull request by its number, open or not, with whether it may merge
   * now: the pinned read a kept merge approval runs on. Absent on a kind
   * with no pull requests.
   */
  pull?(number: number): Promise<ForgePull>;
  /**
   * The pull request's comments, line comments and reviews changed at or
   * after `since` (the host's own time), or every one without it (docs/forge.md,
   * "Comments on a pull request"). Absent on a host the app reads no comments on.
   * A comment in `seen`, already read by an earlier reading, may be left out.
   */
  pullComments?(
    number: number,
    since?: string,
    seen?: ReadonlySet<number>,
  ): Promise<ForgePullComment[]>;
  /** The files one commit changes, for handing a batch's line comment to its change. */
  commitFiles?(sha: string): Promise<string[]>;
  /**
   * The comments on the pull request that the signed-in account wrote and
   * whose words open with `marker`, oldest first: the app's own comments
   * that carry a batch's stories past its description (docs/forge.md,
   * "Batches of your own"). Absent, with `writeComment` and
   * `deleteComment`, on a host the app writes no comments on.
   */
  ownComments?(number: number, marker: string): Promise<ForgeComment[]>;
  /** Post a comment on the pull request, or with `id` replace that comment's words. */
  writeComment?(number: number, body: string, id?: number): Promise<void>;
  /** Delete a comment on the pull request; one already gone is not an error. */
  deleteComment?(number: number, id: number): Promise<void>;
  /**
   * The active rule sets that hold `branch`, each with whether this sign-in
   * may skip it. GitHub only (FI3-1571 piece 2); absent elsewhere.
   */
  branchRules?(branch: string): Promise<ForgeRuleset[]>;
  /**
   * Merge the change with squash past the rules this sign-in may skip, only
   * while its head is still `headSha`, and read the result. Sent once and
   * never retried; only the captain's click on its card calls it.
   */
  putInSkippingRules?(change: ForgeChange, headSha: string): Promise<ForgeSkipMerge>;
  close(change: ForgeChange): Promise<void>;
  /** How the change is named on a surface: `#N`, `!N`, or the branch where it has no number. */
  label(change: ForgeChange): string;
  url(change: ForgeChange): string | null;
}

export { BATCH_CHECK, BATCH_WAITING_WORDS } from "@shared/batches";

/** A full commit id: 40 hexadecimal characters, or 64 in a SHA-256 repository. */
export function isFullCommitId(sha: string): boolean {
  return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha);
}

/** A check state in a tool's words: `completed / <conclusion>`, or still running. */
export function describeCheckState(
  check: Pick<ForgeCheck, "state" | "manual" | "failureAllowed" | "status" | "advisory">,
): string {
  if (check.advisory)
    // i18n-exempt: a check fact served to the crew's model
    return `${check.advisory === "pending" ? "in_progress / -" : `completed / ${check.advisory}`}, advisory, so it holds nothing here; a GitHub branch rule that requires it still holds the merge on GitHub`;
  if (check.manual) return "manual / waiting for a person to start it";
  if (check.failureAllowed) {
    const ended = check.status ? `${check.status}, ` : "";
    return `completed / ${ended}allowed to fail, so it holds nothing`;
  }
  return check.state === "pending" ? "in_progress / -" : `completed / ${check.state}`;
}
