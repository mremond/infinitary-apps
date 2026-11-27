import { randomBytes } from "node:crypto";
import {
  BATCH_BRANCH_PREFIX,
  BATCH_STATUS_WORDS,
  type BatchAnswer,
  type BatchChange,
  type BatchChecksReading,
  type BatchMember,
  type BatchRebuild,
  type BatchRecord,
  type BatchSendBack,
  type BatchStatus,
  type BatchTrial,
  EMPTY_BATCH_RECORD,
  keepsCommits,
  type MergeWays,
  mergeWait,
  mergeWayFor,
  type OpenBatch,
  SQUASH_ONLY_WORDS,
} from "@shared/batches";
import {
  batchCounts,
  type CheckItem,
  checkSnapshotSummary,
  checksThatRan,
  isRedCheckState,
} from "@shared/checkSnapshot";
import { formatTime } from "@shared/i18n/format";
import { englishOf, type Said, wordSaid } from "@shared/i18n/said";
import type { RepoView } from "@shared/repos";
import type { NamingRule } from "@shared/runbooks";
import {
  BATCH_STORIES_MARKER,
  type Forge,
  ForgeAllowanceSpent,
  type ForgeChange,
  type ForgeCheck,
  type ForgeChecks,
  ForgeError,
  ForgeMergeUnconfirmed,
  type ForgePull,
  ForgeWriteError,
  isSignInForgeFailure,
  isTransientForgeFailure,
  presentationBodyLimit,
  presentationCommentLimit,
  requestLinkAtRepo,
} from "../forge";
import { gitFailure } from "../workspace/git";
import { composedName } from "../workspace/naming";
import type { RepoRegistry } from "../workspace/repoRegistry";
import {
  batchVersionIn,
  type Combined,
  type CombineInput,
  clashesWithBatch,
  combine as combineChanges,
  generatedOnTop,
  LEFT_OUT_WORDS,
  landedCommits,
  pushBatch,
} from "./combine";
import { type BatchLimits, batchDescription, batchList } from "./description";
import {
  abandoned,
  awaitedJoins,
  batchStatus,
  builtOnBatch,
  carried,
  clashesEnded,
  combined,
  declarationsOf,
  declared,
  enqueue,
  fixWaits,
  forms,
  heldVersions,
  hold,
  merged,
  nextBatchAt,
  pruned,
  rebuildStands,
  rebuildTold,
  release,
  reopened,
  repaired,
  reworded,
  type Standing,
  sendBack,
  sentBackOf,
  standing,
  toldRebuild,
  unfixed,
  withBases,
  withdraw,
} from "./line";
import {
  approvedFixInLine,
  type ConfirmedFix,
  followTrial,
  mergedAtTrial,
  startTrial,
  type TrialOwner,
} from "./trial";
import { BATCH_WORDS } from "./words";

export { BATCH_WORDS };

/** A host on which the app can read, write and delete its own comments, to keep a batch's stories there. */
type CommentingForge = Forge &
  Required<Pick<Forge, "ownComments" | "writeComment" | "deleteComment">>;
const keepsComments = (forge: Forge): forge is CommentingForge =>
  Boolean(forge.ownComments && forge.writeComment && forge.deleteComment);

const TIME_OF_DAY: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * The checks of a held batch's reading that never ran to an end on its
 * changes, each name once: cancelled, skipped or not finished yet, a manual
 * job nobody started, and a job its project allows to fail that was
 * cancelled. A row that sums up a whole run (`ForgeCheck.summary`) names no
 * check: its jobs are the checks. Undefined when the reading is incomplete,
 * so which checks never ran is not known.
 */
function notRun(checks: ForgeChecks): string[] | undefined {
  if (checks.complete === false || checks.problem || checks.notStarted) return undefined;
  const unfinished = (item: ForgeCheck) =>
    item.summary !== true &&
    (item.state === "cancelled" ||
      item.state === "skipped" ||
      item.state === "pending" ||
      (item.state === "neutral" &&
        (item.manual === true ||
          (item.failureAllowed === true && /^cancell?ed$/.test(item.status ?? "")))));
  return [...new Set(checks.items.filter(unfinished).map((item) => item.name))];
}

/**
 * The batch pull request's title. A batch of one carries its change's own.
 * A batch of several says how many it carries in the app's plain words, in
 * the form the active naming runbook gives a name the app writes itself; the
 * app holds no naming form of its own (docs/runbooks.md, "Built-ins").
 */
export function batchTitle(
  members: readonly Pick<BatchChange, "title">[],
  naming: NamingRule | null,
): string {
  return members.length === 1
    ? (members[0] as Pick<BatchChange, "title">).title
    : composedName(`merge ${members.length} approved changes`, naming);
}

/** Why a repair's judgment that the held version passed on a rerun was refused (`declarePassed`). */
export type BatchPassedRefusal = "not-held" | "other-version" | "not-checks" | "sent-back";

export type BatchHeld = {
  repo: RepoView;
  batch: OpenBatch;
  /** Every earlier send-back of the batch's changes, oldest first. */
  sentBack: BatchSendBack[];
};

export type BatchesOptions = {
  repos: Pick<RepoRegistry, "get" | "list" | "recordBatch" | "endNoChecks">;
  forgeFor: (repo: RepoView) => Forge;
  now: () => number;
  /** The active naming runbook's rule, read at each use; null when no naming runbook is on. */
  naming: () => NamingRule | null;
  /** Whether a task's approval still stands at this version: only approved work merges. */
  approved: (taskId: string, head: string, repo: RepoView) => boolean | "former-address";
  /** Whether the task's crew declared that this version runs no checks at all. */
  runsNoChecks: (taskId: string, head: string) => boolean;
  /** Whether a task is still open: a closed task's receipts and notes are dropped. */
  live: (taskId: string) => boolean;
  /**
   * The approved version a task's work merged at, once it closed done. A
   * change built on its approved version then joins with no base left to
   * wait for, checked against that version. Absent, none is merged.
   */
  merged?: (taskId: string) => string | undefined;
  /**
   * For a change built on another task's approved version (`after`) whose
   * task closed without merging: the version it was built on and the newest
   * version that task's approval covered, which the batch must not carry.
   * Absent, none is.
   */
  unmergedBase?: (change: BatchChange) => readonly string[] | undefined;
  /** A member's story as the batch's pull request shows it, with the words around it. */
  story: (
    member: BatchChange,
    forge: Forge,
  ) => Promise<{ region: string; projectText: string } | undefined>;
  /**
   * These tasks' standing changed (merged, left out, sent back, the only
   * change of a failed batch): each one's kept merge runs again and reads it.
   */
  settle: (taskIds: string[]) => void;
  /**
   * A change was sent back with a reason (`sent`): its crewmate hears why,
   * with every earlier send-back of the same change, oldest first.
   */
  sentBack: (change: BatchMember, sent: BatchSendBack, earlier: BatchSendBack[]) => void;
  /**
   * A change leaves the line because its approval or its batch belongs to
   * the project's former address: unlike a send-back, its approval ends and
   * its crewmate hears why, to ask for fresh approval at the new address.
   */
  addressMoved: (change: BatchChange, reason: string) => void;
  /**
   * A change that clashes with the open batch, left out of it or waiting in
   * line (`reason`), and its crewmate rebuilds it on that batch's version
   * now (docs/forge.md, "A change rebuilt on an open batch"): it hears so
   * once per version of the change and set of changes in the batch, with
   * the batch's branch, version and changes. Absent, nobody hears it.
   */
  rebuild?: (facts: {
    change: Pick<BatchChange, "taskId" | "head">;
    reason: string;
    told: BatchRebuild;
    open: OpenBatch;
  }) => void;
  /** A batch of several is held: the first mate hears it once. */
  held: (held: BatchHeld) => void;
  /**
   * A held batch's early run with its declared fix failed (`OpenBatch.trial`): the fix's
   * crewmate and the batch's repair hear it once. Absent, nobody hears it.
   */
  trialFailed?: (failed: { repo: RepoView; open: OpenBatch; trial: BatchTrial }) => void;
  /** A line for the Activity feed, as a fact so it follows the language. */
  note: (fact: Said) => void;
  /**
   * The open batch's checks reading changed (`checksReading`): the Batches
   * panel reads the project again. Absent, nobody hears it.
   */
  checksRead?: (repoId: string) => void;
  taskNote: (taskId: string, text: string) => void;
  combine?: (input: CombineInput) => Promise<Combined>;
  /** Whether a change in line clashes with the open batch's version; injectable for a test. */
  clashes?: typeof clashesWithBatch;
  /** Which open batch version a change's branch builds on; injectable for a test. */
  builtOnVersion?: typeof batchVersionIn;
  push?: typeof pushBatch;
  landed?: typeof landedCommits;
  generated?: typeof generatedOnTop;
  /** A new batch branch's name; injectable for a test. */
  branchName?: () => string;
  /**
   * Read new comments on the open batch's pull request and hand each to the
   * changes it is about (docs/forge.md, "Comments on a pull request").
   * Absent, or with no runbook asking for the comment wake, nothing is read.
   */
  comments?: (input: {
    repo: RepoView;
    open: OpenBatch;
    pull: ForgePull;
    forge: Forge;
  }) => Promise<void>;
};

/**
 * The described mark for an early run's words at its commit (`followTrial`): that commit becomes
 * the batch's version once promoted, and its words then name the fix as not approved yet, so
 * the batch's own mark differs and the promoted batch is described again before it merges.
 */
function trialMark(head: string): string {
  return `trial ${head}`;
}

/**
 * Batches of your own (docs/forge.md, "Batches of your own"): the one
 * writer of a project's line of approved changes and its one open batch.
 * An approved change is a pushed branch with no pull request of its own.
 * When the line holds a change and no batch of this home's is open, the
 * whole line is combined at home, one commit per change, pushed to a
 * branch the app owns and opened as one pull request with the captain's
 * sign-in. The host's own reading decides what happens next: checks passed
 * and mergeable merges it; behind or conflicting combines it again; failed
 * checks hold it until a change is sent back, a declared fix is approved,
 * or its checks run again. The app reruns nothing and files nothing.
 */
export class Batches {
  /** One pass per project at a time; a pass asked for meanwhile runs after it. */
  private readonly passes = new Map<string, Promise<void>>();
  /**
   * The version of each project's open batch whose pull request this run
   * read carrying the batch's own title and description, or an early run's
   * commit carrying the run's words (`trialMark`). Nothing is kept
   * across a restart, so the first pass after one reads it again.
   */
  private readonly described = new Map<string, string>();
  /** The changes of each project whose missing story this run already said, by task and version. */
  private readonly storyless = new Map<string, Set<string>>();
  /**
   * Each project's open batch's checks as the last pass read them, by
   * project, kept in memory alone: after a restart the next pass reads them.
   */
  private readonly readings = new Map<string, BatchChecksReading>();
  /**
   * The changes in line each project's passes already tried against its
   * open batch's version, by task, version and batch version, kept in
   * memory alone: after a restart each is tried once again.
   */
  private readonly tried = new Map<string, { at: string; keys: Set<string> }>();

  /** The keys tried for a project's open batch version `at`; a new version starts afresh. */
  private triedAt(repoId: string, at: string): Set<string> {
    const kept = this.tried.get(repoId);
    if (kept?.at === at) return kept.keys;
    const keys = new Set<string>();
    this.tried.set(repoId, { at, keys });
    return keys;
  }

  constructor(private readonly options: BatchesOptions) {}

  /** The open batch's checks as last read at its version; undefined before the first reading. */
  checksReading(repoId: string): BatchChecksReading | undefined {
    const reading = this.readings.get(repoId);
    const open = this.record(repoId).open;
    // An early run with a held batch's fix is read at its own commit (`OpenBatch.trial`).
    return reading && (reading.head === open?.head || reading.head === open?.trial?.head)
      ? reading
      : undefined;
  }

  /** Keeps a pass's reading of the open batch's checks, and says so only when it changed. */
  private read(repoId: string, head: string, items: readonly CheckItem[]): void {
    const reading: BatchChecksReading = { head, at: this.options.now(), ...batchCounts(items) };
    const before = this.readings.get(repoId);
    this.readings.set(repoId, reading);
    const { at: _at, ...now } = reading;
    if (before) {
      const { at: _then, ...then } = before;
      if (JSON.stringify(then) === JSON.stringify(now)) return;
    }
    this.options.checksRead?.(repoId);
  }

  record(repoId: string): BatchRecord {
    return this.options.repos.get(repoId)?.batch ?? EMPTY_BATCH_RECORD;
  }

  /** What a change's own merge reads of its place; undefined when it has none at that version. */
  standing(repoId: string, taskId: string, head: string): Standing | undefined {
    return standing(this.record(repoId), taskId, head);
  }

  /** Every send-back of a task's change, at any version, oldest first. */
  sentBack(repoId: string, taskId: string): BatchSendBack[] {
    return sentBackOf(this.record(repoId), taskId);
  }

  /** A change's place as its batch check says it; undefined when it has none at that version. */
  status(repoId: string, taskId: string, head: string): BatchStatus | undefined {
    const place = this.standing(repoId, taskId, head);
    if (!place) return undefined;
    // In line while the project's batch gap runs: it says when the next batch starts.
    const record = this.record(repoId);
    const next =
      place.state === "waiting" && place.place === "line" && !record.open
        ? nextBatchAt(record, this.options.repos.get(repoId)?.batchGap)
        : undefined;
    return next !== undefined && next > this.options.now()
      ? { kind: "waiting", words: BATCH_STATUS_WORDS.waitingUntil(formatTime(next, TIME_OF_DAY)) }
      : batchStatus(place);
  }

  /**
   * Put an approved change in line and start a pass. A change that carries a
   * repair's declaration of the held batch's fix is marked so, whichever came first.
   */
  async enqueue(repoId: string, change: BatchChange): Promise<void> {
    await this.write(repoId, (record) => {
      // Still a fix after its batch was closed and put back in line, until a batch merges or ends.
      const fix = declarationsOf(record, change).length > 0;
      return enqueue(record, fix ? { ...change, fix: true } : change);
    });
    void this.pass(repoId);
  }

  /** A task's approval ended, or the task closed: its change leaves the line and the batch. */
  async withdraw(repoId: string, taskId: string): Promise<void> {
    const changed = await this.write(repoId, (record) => {
      const next = withdraw(record, taskId);
      return JSON.stringify(next) === JSON.stringify(record) ? record : next;
    });
    if (changed) void this.pass(repoId);
  }

  /**
   * A change's story was confirmed on its pushed branch at `head`, as a
   * story revised under a kept approval is. The version already waiting
   * keeps its place and takes the story's title and words, and the pull
   * request that carries it is described again from the story as it reads
   * now; any other version of the task leaves the line and the batch.
   */
  async revise(
    repoId: string,
    change: Omit<ConfirmedFix, "branch"> & Partial<Pick<ConfirmedFix, "branch">>,
  ): Promise<void> {
    let member = false;
    const changed = await this.write(repoId, (record) => {
      const next = reworded(record, change);
      member = Boolean(next.open?.members.some((entry) => entry.taskId === change.taskId));
      // A story can read differently under the same title and words.
      if (member) this.described.delete(repoId);
      return JSON.stringify(next) === JSON.stringify(record) ? record : next;
    });
    // A held batch's declared fix starts the batch's own checks with it (`startTrial`).
    const { branch } = change;
    if (branch)
      void this.serial(repoId, () => startTrial(this.trials, repoId, { ...change, branch })).catch(
        (caught: unknown) => console.warn(`[batches] ${repoId}: ${gitFailure(caught)}`),
      );
    if (changed || member) void this.pass(repoId);
  }

  /** What an early run with a held batch's fix reaches of this owner (`TrialOwner`). */
  private get trials(): TrialOwner {
    return {
      options: this.options,
      record: (repoId) => this.record(repoId),
      save: (repoId, record) => this.save(repoId, record),
      recombine: (repo, record, join) => this.recombine(repo, record, join),
      follow: (repo, record) => this.follow(repo, record),
      pushedHead: (forge, branch) => this.pushedHead(forge, branch),
      read: (repoId, head, items) => this.read(repoId, head, items),
      label: (repo, open) => this.label(repo, open),
      atBatchAddress: (repo, open) => this.atBatchAddress(repo, open),
      stillAt: (repo) => this.stillAt(repo),
      generated: (repo, branch, head, pushed) => this.writeGenerated(repo, branch, head, pushed),
      describe: async (repo, open, forge) => {
        if (this.described.get(repo.id) !== trialMark(open.head))
          await this.describe(repo, open, forge, true);
      },
    };
  }

  /**
   * A repair declares its own change the held batch's fix: approved, it joins that batch with
   * the changes waiting in line and ends the hold. One already waiting in line is marked now
   * and joins on this pass; one approved later, as it goes in line (`at`: its commit as
   * declared). Refused in words when no batch is held, or not at the version its task read.
   */
  async declareFix(
    repoId: string,
    taskId: string,
    at?: string,
    held?: string,
  ): Promise<string | undefined> {
    let refused: string | undefined;
    await this.write(repoId, (record) => {
      const hold = record.open?.hold;
      if (!hold) refused = "No batch of this project is held, so there is nothing to fix.";
      else if (held && hold.head !== held) refused = BATCH_WORDS.ended;
      // The task that declared the fix is the hold's repair (`OpenBatch.repair`).
      return refused ? record : repaired(declared(record, taskId, at), taskId);
    });
    if (!refused) void this.pass(repoId);
    return refused;
  }

  /**
   * The task repairing the project's held batch (`OpenBatch.repair`): the
   * one the first mate started with the `repairs_batch` mark, or one whose
   * batch declaration answered the hold. It stays recorded while that task
   * is open and the batch is, and the Batches panel and Settings name it.
   * Refused in words when no batch of this project is held.
   */
  async markRepair(repoId: string, taskId: string): Promise<string | undefined> {
    let refused: string | undefined;
    await this.write(repoId, (record) => {
      if (!record.open?.hold) {
        refused = BATCH_WORDS.noRepairHeld;
        return record;
      }
      return repaired(record, taskId);
    });
    return refused;
  }

  /**
   * A repair judged that the held batch's version `head` passed on a rerun
   * of its failed checks: those checks are answered at that version, and the
   * batch merges once every other check passed, before any declared fix,
   * which goes to the next batch; `fix` declares the repair's own change
   * that fix in the same write. Refused, by why, when the batch is not
   * held for its checks at that version, or when it waits for a fix after a
   * send-back, since its version still carries the changes sent back.
   */
  async declarePassed(
    repoId: string,
    head: string,
    /** The repair's own task, when it declares its change the fix in the same answer. */
    fix?: string,
    /** The task that declared it, recorded as the hold's repair (`OpenBatch.repair`). */
    by?: string,
    /** The commit `fix` had committed as it declared it (`fixHeads`). */
    at?: string,
  ): Promise<BatchPassedRefusal | undefined> {
    let refused: BatchPassedRefusal | undefined;
    await this.write(repoId, (record) => {
      const open = record.open;
      if (!open?.hold) refused = "not-held";
      else if (open.hold.head !== head || open.head !== head) refused = "other-version";
      else if (open.hold.reason !== "checks") refused = "not-checks";
      else if (open.awaits !== undefined) refused = "sent-back";
      if (refused || !open?.hold) return record;
      const passed = { ...record, open: { ...open, passed: { head, checks: open.hold.checks } } };
      const next = by ? repaired(passed, by) : passed;
      return fix ? declared(next, fix, at) : next;
    });
    if (!refused) void this.pass(repoId);
    return refused;
  }

  /**
   * A by-hand answer to a held batch, or Try again on a batch waiting on a
   * merge its host still reads as running (`mergeWait`), from Settings, the
   * first mate or a repair. Try again on a hold combines the batch again at
   * a new version on the same pull request with every change waiting in
   * line, so its checks run again; on a wait it closes that pull request
   * first and combines on a new one (`replaceWaited`). A send-back, on a
   * hold only, takes each named change out with its reason, and the rest
   * combine again with the line. Answers the refusal in English words, as
   * the first mate and a repair read it, or nothing.
   *
   * A repair that sends changes back and declares its own change the fix in one declaration
   * names that task as `fix`, at the commit `at` it had committed (`fixHeads`): the named
   * changes leave, and the batch stays held at its version, combining nothing, until the fix
   * is approved and joins with the rest and every change waiting in line.
   */
  async answer(
    repoId: string,
    answer: BatchAnswer,
    fix?: string,
    /** A repair's own task, when its declaration sent changes back: recorded as the hold's repair. */
    by?: string,
    at?: string,
  ): Promise<string | undefined> {
    const refused = await this.answered(repoId, answer, fix, by, at);
    return refused === undefined || typeof refused === "string" ? refused : englishOf(refused);
  }

  /** The same answer for Settings, where a refusal fails the request with its words, in the captain's language where it has them. */
  async answerOrThrow(repoId: string, answer: BatchAnswer): Promise<{ ok: true }> {
    const refused = await this.answered(repoId, answer);
    if (refused)
      throw new Error(
        typeof refused === "string" ? refused : (wordSaid(refused) ?? englishOf(refused)),
      );
    return { ok: true };
  }

  /** An answer's refusal as its owner words it: English words, or a fact worded where it is shown. */
  private async answered(
    repoId: string,
    answer: BatchAnswer,
    fix?: string,
    by?: string,
    at?: string,
  ): Promise<string | Said | undefined> {
    const refused = await this.serial(repoId, async (): Promise<string | Said | undefined> => {
      const repo = this.options.repos.get(repoId);
      let record = this.record(repoId);
      const open = record.open;
      // A merge the host still reads as running takes Try again alone (`mergeWait`).
      const waiting = answer.action === "try-again" && mergeWait(open)?.head === answer.head;
      if (!repo || !open || (!waiting && open.hold?.head !== answer.head)) return BATCH_WORDS.ended;
      if (!this.atBatchAddress(repo, open)) return BATCH_WORDS.ended;
      const inLine = approvedFixInLine(this.options, repo, record);
      if (inLine !== record) record = this.save(repoId, inLine);
      const label = this.label(repo, open);
      if (answer.action === "try-again") {
        if (waiting) {
          // The pass's own reading first: a merge that finished or was queued meanwhile is
          // followed as it is, and the first merge is never sent again. One the host says
          // failed meanwhile holds the batch at this version, so Try again goes on below
          // as on any hold, on the same pull request.
          record = await this.follow(repo, record);
          const now = record.open;
          // The reading itself moved a batch whose changes left or changed (`settleUnconfirmed`).
          if (now && now.branch !== open.branch) return undefined;
          if (now && mergeWait(now)?.head === answer.head) {
            const refusal = await this.replaceWaited(repo, record);
            if (refusal) return refusal;
            this.clashesEnded(repoId);
            // The new pull request's own line on the feed says what happened; the retried
            // line would say the closed one's checks run again.
            return undefined;
          }
          if (now?.hold?.head !== answer.head) return BATCH_WORDS.ended;
        }
        await this.recombine(repo, release(record), "retry");
        this.clashesEnded(repoId);
        this.options.note(BATCH_WORDS.retried(repo.name, label));
        return undefined;
      }
      const missing = answer.changes.find(
        (change) => !open.members.some((member) => member.taskId === change.taskId),
      );
      if (missing) return BATCH_WORDS.notMember(missing.taskId);
      // One send-back per change: a change named twice, by its key and its id or by a repeated
      // row, would count one removal as two.
      const twice = answer.changes.find(
        (change, at) => answer.changes.findIndex((each) => each.taskId === change.taskId) !== at,
      );
      if (twice) return BATCH_WORDS.namedTwice(twice.taskId);
      // The repair whose declaration this is stays the batch's repair through the combine.
      let next = by ? repaired(record, by) : record;
      const sent: { member: BatchMember; entry: BatchSendBack; earlier: BatchSendBack[] }[] = [];
      for (const change of answer.changes) {
        const member = open.members.find((entry) => entry.taskId === change.taskId) as BatchMember;
        const earlier = sentBackOf(next, change.taskId);
        const done = sendBack(next, change.taskId, member, change.reason, this.options.now());
        next = done.record;
        sent.push({ member, entry: done.sent, earlier });
      }
      // Held for the fix: the next pass combines once it is approved (`follow`).
      this.save(
        repoId,
        fix
          ? declared({ ...next, open: { ...(next.open as OpenBatch), awaits: fix } }, fix, at)
          : next,
      );
      for (const { member, entry, earlier } of sent) {
        this.options.note(BATCH_WORDS.sentBack(repo.name, member.title, entry.reason));
        this.options.taskNote(member.taskId, BATCH_WORDS.sentBackTask(entry.reason));
        this.options.sentBack(member, entry, earlier);
      }
      // Each kept approval reads its version sent back, as a failed batch of one's does.
      this.options.settle(sent.map(({ member }) => member.taskId));
      if (fix) return undefined;
      await this.recombine(repo, next, "line");
      this.clashesEnded(repoId);
      return undefined;
    });
    if (!refused && fix) void this.pass(repoId);
    return refused;
  }

  /** Every project with a line, a batch or receipts takes one pass. */
  async sweep(): Promise<void> {
    await Promise.all(
      this.options.repos
        .list()
        .filter((repo) => repo.batch !== undefined)
        .map((repo) => this.pass(repo.id)),
    );
  }

  /** One step of a project's line and batch, from what the host reads now. */
  pass(repoId: string): Promise<void> {
    return this.serial(repoId, () => this.step(repoId)).catch((caught: unknown) => {
      // A sign-in, the network or a busy host: the next pass reads again.
      if (!isSignInForgeFailure(caught) && !isTransientForgeFailure(caught))
        console.warn(
          `[batches] ${repoId}: ${caught instanceof ForgeError ? caught.message : gitFailure(caught)}`,
        );
    });
  }

  /**
   * One change to a project's record, in turn with its passes. A pass
   * carries the record it read through its work where the project lives
   * and saves what it derived, so a change written beside a running pass
   * would be lost at that save: every writer takes its turn instead.
   * Answers whether the record changed.
   */
  private write(repoId: string, change: (record: BatchRecord) => BatchRecord): Promise<boolean> {
    return this.serial(repoId, async () => {
      const record = this.record(repoId);
      const next = change(record);
      if (next === record) return false;
      this.save(repoId, next);
      return true;
    });
  }

  private async serial<T>(repoId: string, run: () => Promise<T>): Promise<T> {
    const prior = this.passes.get(repoId) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(run);
    const settled = next.then(
      () => {},
      () => {},
    );
    this.passes.set(repoId, settled);
    try {
      return await next;
    } finally {
      if (this.passes.get(repoId) === settled) this.passes.delete(repoId);
    }
  }

  private async step(repoId: string): Promise<void> {
    const repo = this.options.repos.get(repoId);
    if (!repo) return;
    let record = this.record(repoId);
    const former = record.open;
    if (former && !this.atBatchAddress(repo, former)) {
      const { open: _former, formed: _formed, ...next } = unfixed(record, record.fixes ?? []);
      record = this.save(repoId, next);
      const reason =
        "the batch belongs to a former or unverified project address; confirm the change at the approved address and request fresh approval";
      for (const member of former.members) {
        this.options.taskNote(member.taskId, BATCH_WORDS.sentBackTask(reason));
        this.options.addressMoved(member, reason);
      }
    }
    const before = record;
    record = pruned(record, this.options.live);
    if (record.open?.hold && record.open.awaits === "" && before.open?.awaits)
      this.options.note(BATCH_WORDS.fixClosed(repo.name, this.label(repo, record.open)));
    record = this.withCurrentApprovals(repo, record);
    this.save(repoId, record);
    // Only a line with an ordinary change and a batch version to build on waits on git here.
    if (
      ((record.open?.members.length && !record.open.hold) || record.rebuilds?.length) &&
      record.line.some((entry) => !entry.onBatch && !entry.fix && !entry.after && !entry.base)
    )
      record = await this.markRebuilt(repo, record);
    if (record.open) record = await this.follow(repo, record);
    if (forms(record, repo.batchGap, this.options.now()))
      record = await this.recombine(repo, record, "none");
    await this.tryLine(repo);
    this.clashesEnded(repoId);
  }

  /**
   * Each ordinary change in line whose branch builds on an open batch
   * version, the one its crewmate was told to rebuild on or the open batch's
   * version now, read from git's history whatever repair was declared, is
   * marked as built on it (`onBatch`, docs/forge.md, "A change rebuilt on an
   * open batch"), so it goes behind that batch's changes and is carried as
   * its own difference from that version. Each version is read once per set
   * of batch versions; one that cannot be read now is read again next pass.
   */
  private async markRebuilt(repo: RepoView, record: BatchRecord): Promise<BatchRecord> {
    // A held batch's version is its repair's to build on: a version built on it is a fix,
    // carried from the held version, never a change rebuilt on the batch.
    const open = record.open?.members.length && !record.open.hold ? record.open.head : undefined;
    const tried = this.triedAt(repo.id, record.open?.head ?? "");
    let next = record;
    for (const change of record.line) {
      if (change.onBatch || change.fix || change.after || change.base) continue;
      if (declarationsOf(record, change).length) continue;
      const told = record.rebuilds?.find((entry) => entry.taskId === change.taskId)?.on;
      const versions = [...new Set([told, open].filter((version) => version !== undefined))];
      if (versions.length === 0) continue;
      const key = `built:${change.taskId}:${change.head}:${versions.join(",")}`;
      if (tried.has(key)) continue;
      const on = await (this.options.builtOnVersion ?? batchVersionIn)({
        repoDir: repo.path,
        ...(repo.origin ? { remote: repo.origin } : {}),
        branch: change.branch,
        head: change.head,
        versions,
      }).catch(() => null);
      if (on === null) continue;
      tried.add(key);
      const onBatch = on ? builtOnBatch(next, change.taskId, on) : undefined;
      if (!onBatch) continue;
      next = {
        ...next,
        line: next.line.map((entry) =>
          entry.taskId === change.taskId && entry.head === change.head
            ? { ...entry, onBatch }
            : entry,
        ),
      };
    }
    return next === record || !this.stillAt(repo) ? record : this.save(repo.id, next);
  }

  /**
   * While a batch is open and checked, each change waiting in line is tried
   * once against its version with `merge-tree`, which writes no ref a
   * person sees (docs/forge.md, "A change rebuilt on an open batch"): one
   * that no longer combines with it has its crewmate told to rebuild it on
   * that version now, once per version of the change and set of changes in
   * the batch, rather than when the next batch leaves it out.
   */
  private async tryLine(repo: RepoView): Promise<void> {
    const record = this.record(repo.id);
    const open = record.open;
    if (!open || open.hold || open.stale || open.members.length === 0 || !this.options.rebuild)
      return;
    const tried = this.triedAt(repo.id, open.head);
    for (const change of record.line) {
      // A version rebuilt on a batch whose changes no longer stand in the open batch at their
      // versions, nor merged at them, is told once to rebuild on the open batch as it is now.
      if (change.onBatch && !change.fix) {
        if (!this.batchStands(record, change.onBatch) && !rebuildTold(record, change))
          this.tellRebuild(repo.id, change, LEFT_OUT_WORDS.batchChanged(change.onBatch.head));
        continue;
      }
      // A fix, a part built on another's version and a stacked change each have their own
      // place; the combine judges them.
      if (change.fix || change.after || change.base) continue;
      const key = `${change.taskId}:${change.head}:${open.head}`;
      if (tried.has(key) || rebuildTold(record, change) || rebuildStands(record, change)) continue;
      const clashes = await (this.options.clashes ?? clashesWithBatch)({
        repoDir: repo.path,
        ...(repo.origin ? { remote: repo.origin } : {}),
        branch: change.branch,
        head: change.head,
        batch: open.head,
      });
      // One that cannot be read at this version, as a moved branch, is tried again only once
      // the batch's version or the change's version moves.
      tried.add(key);
      if (!clashes || !this.stillAt(repo)) continue;
      this.tellRebuild(repo.id, change, LEFT_OUT_WORDS.clashesBatch);
    }
  }

  /**
   * Whether every change a rebuilt version was built on still stands where
   * the combine carries it: in the open batch at that version, or merged at it.
   */
  private batchStands(record: BatchRecord, onBatch: NonNullable<BatchChange["onBatch"]>): boolean {
    return onBatch.members.every(
      (carried) =>
        record.open?.members.some(
          (member) => member.taskId === carried.taskId && member.head === carried.head,
        ) ||
        record.receipts.some(
          (receipt) => receipt.taskId === carried.taskId && receipt.head === carried.head,
        ),
    );
  }

  /**
   * The left-out changes whose crewmate was told to rebuild on the batch on
   * `branch`, which just ended, merged or not: their merge reads their place
   * again, which no longer asks them to rebuild on it.
   */
  private toldOn(record: BatchRecord, branch: string): string[] {
    return record.leftOut
      .filter((entry) => entry.rebuild?.branch === branch)
      .map((entry) => entry.taskId);
  }

  /** Settle the left-out changes told to rebuild on the batch on `branch`, which ended unmerged. */
  private settleTold(record: BatchRecord, branch: string): void {
    const told = this.toldOn(record, branch);
    if (told.length) this.options.settle(told);
  }

  /**
   * Tell a change's crewmate to rebuild it on the open batch's version, once
   * per version of the change and set of changes in the batch, and keep
   * that on the record (`toldRebuild`).
   */
  private tellRebuild(
    repoId: string,
    change: Pick<BatchChange, "taskId" | "head">,
    reason: string,
  ): void {
    const told = toldRebuild(this.record(repoId), change, this.options.now());
    if (!told.told) return;
    const saved = this.save(repoId, told.record);
    if (!told.fresh || !saved.open) return;
    this.options.taskNote(change.taskId, BATCH_WORDS.rebuild(reason, told.told.on));
    this.options.rebuild?.({ change, reason, told: told.told, open: saved.open });
  }

  /** A kept approval covers a version only at its approved repository. */
  private withCurrentApprovals(repo: RepoView, record: BatchRecord): BatchRecord {
    let next = record;
    for (const entry of [...record.line, ...(record.open?.members ?? [])]) {
      const approved = this.options.approved(entry.taskId, entry.head, repo);
      if (approved === true) continue;
      next = withdraw(next, entry.taskId);
      if (approved === "former-address") {
        const reason =
          "its approval belongs to the project's former address; confirm the change at the approved address and request fresh approval";
        this.options.taskNote(entry.taskId, BATCH_WORDS.sentBackTask(reason));
        this.options.addressMoved(entry, reason);
      }
    }
    return next;
  }

  /**
   * A change left out only for a clash with a change ahead of it hears once
   * when that clash ends: the change ahead merged, so the left-out one can
   * be brought up to date now, or it left, so the same version goes back
   * in line. Its kept merge runs again and reads which.
   */
  private clashesEnded(repoId: string): void {
    const { record, ended } = clashesEnded(this.record(repoId), LEFT_OUT_WORDS.conflict);
    if (ended.length === 0) return;
    this.save(repoId, record);
    for (const entry of ended) {
      // Its crewmate was told to rebuild on the batch that merged, and that rebuild stands.
      if (entry.how === "merged" && entry.rebuilt) continue;
      this.options.taskNote(
        entry.taskId,
        entry.how === "merged" ? BATCH_WORDS.clashMerged : BATCH_WORDS.clashLeft,
      );
    }
    // One whose rebuild stands since that batch merged keeps waiting for its rebuilt version.
    const read = ended.filter((entry) => !(entry.how === "merged" && entry.rebuilt));
    if (read.length) this.options.settle(read.map((entry) => entry.taskId));
  }

  private stillAt(repo: RepoView): boolean {
    return this.options.repos.get(repo.id)?.origin === repo.origin;
  }

  /** Never reuse a batch number or branch in another repository. */
  private atBatchAddress(repo: RepoView, open: OpenBatch): boolean {
    const current = this.options.repos.get(repo.id);
    return (
      !!current &&
      current.origin === repo.origin &&
      (open.origin !== undefined
        ? open.origin === current.origin
        : !!open.url && requestLinkAtRepo(current, open.url))
    );
  }

  /** The open batch, from the host's reading of its pull request and checks. */
  private async follow(repo: RepoView, record: BatchRecord): Promise<BatchRecord> {
    const forge = this.options.forgeFor(repo);
    let open = record.open as OpenBatch;
    if (!this.atBatchAddress(repo, open)) return record;
    // A merge that may still finish takes whatever the branch holds then (`settleUnconfirmed`).
    const sent = open.unconfirmed?.head === open.head;
    // Every member left: the line takes the batch's branch and pull request, or it ends,
    // unless the batch waits for its repair's fix, which it takes the same way once approved.
    if (open.members.length === 0 && !sent && !(open.hold && open.awaits !== undefined))
      return record.line.length
        ? this.recombine(repo, record, "line")
        : this.abandon(repo, record, forge);
    if (open.number === undefined) {
      // A crash between the push and the pull request's confirmation: read before writing.
      const found = await forge.changeFor(open.branch);
      const opened = found ? undefined : await this.openRequest(open, forge);
      const change = found ?? (opened as { change: ForgeChange }).change;
      if (change.number === undefined) return record;
      open = { ...open, number: change.number, url: forge.url(change) };
      record = this.save(repo.id, { ...record, open });
      this.options.note(BATCH_WORDS.formed(repo.name, this.label(repo, open), open.members.length));
      // A pull request this pass opened carries the batch's words as sent, and the stories
      // past its description follow in comments.
      if (opened && (await this.continueIn(forge, change.number, opened.comments, true)))
        this.wrote(repo, open, opened.missing);
    }
    if (!forge.pull) return record;
    const pull = await forge.pull(open.number as number);
    if (
      !this.atBatchAddress(repo, open) ||
      pull.number !== open.number ||
      (pull.branch && pull.branch !== open.branch)
    )
      return record;
    if (pull.merged) {
      // Merged by hand where the project lives at the early run's commit: it carried the fix.
      const ran = mergedAtTrial(record, pull.headSha);
      if (ran) return this.finish(repo, this.save(repo.id, ran), forge, pull.mergedSha);
      return pull.headSha === open.head ? this.finish(repo, record, forge, pull.mergedSha) : record;
    }
    if (pull.state === "closed") {
      // Closed where the project lives without a merge: the changes go back in line.
      await forge.deleteBranch?.(open.branch).catch(() => {});
      const saved = this.save(repo.id, reopened(record, this.options.now()));
      this.settleTold(saved, open.branch);
      return saved;
    }
    // A comment reading that fails is read again on a later pass; the batch goes on.
    await this.options.comments?.({ repo, open, pull, forge }).catch((caught: unknown) => {
      console.warn("[batches] could not read the batch's comments:", caught);
    });
    // An early run with the held batch's fix decides first, while it still answers the batch.
    if (open.trial) {
      const tried = await followTrial(this.trials, repo, record, forge, pull);
      if (tried) return tried;
      record = this.record(repo.id);
      open = record.open as OpenBatch;
    }
    // A held batch whose repair sent changes back beside its own fix waits for that fix,
    // so it is combined once, with the fix, and never merges what was sent back meanwhile.
    if (open.hold && open.awaits !== undefined) {
      if (!awaitedJoins(record)) return record;
      return this.recombine(repo, record, "line");
    }
    if (sent) return this.settleUnconfirmed(repo, record, forge, open);
    if (open.stale) return this.recombine(repo, record, "none");
    if (pull.headSha !== open.head) {
      // A pull request can trail its branch for a moment after a push: the
      // next pass reads on. A branch that itself is elsewhere carries a
      // version this record never kept (a push whose record was lost, or a
      // commit that is no approved change), so the batch is combined again
      // over what the host holds now.
      const pushed = await this.pushedHead(forge, open.branch);
      if (pushed === open.head) return record;
      // The project's own checks may add one commit of generated files on top: it stands
      // as the batch's version, and the checks run on it (docs/forge.md, "A generated commit").
      const taken = pushed ? await this.takeGenerated(repo, record, pushed) : undefined;
      if (taken) return taken;
      return this.recombine(repo, record, "none", pushed);
    }
    if (open.queued === open.head && forge.inHostQueue) {
      // The host's own merge queue took this version: it is read there, never sent again.
      if (await forge.inHostQueue(open.number as number)) return record;
      // The host may have merged or closed it between the two reads.
      const after = await forge.pull(open.number as number);
      if (after.merged)
        return after.number === open.number &&
          after.headSha === open.head &&
          (!after.branch || after.branch === open.branch)
          ? this.finish(repo, record, forge, after.mergedSha)
          : record;
      if (after.state !== "open") return record;
      // Removed without a merge: held with the host's verdict until a person answers.
      const { queued: _queued, ...left } = open;
      const detail = BATCH_WORDS.removed(forge.place ?? BATCH_WORDS.host);
      const held = hold(
        { ...record, open: left },
        { at: this.options.now(), head: open.head, reason: "merge-way", checks: [], detail },
      );
      this.save(repo.id, held.record);
      if (held.fresh)
        this.options.note(BATCH_WORDS.removedHeld(repo.name, this.label(repo, open), forge.place));
      return held.record;
    }
    // A held batch's approved fix joins it, and the changes waiting in line join with it.
    // A batch held for its checks reads them first: a version that passes on a rerun
    // merges as it is, and the fix goes to the next batch.
    if (fixWaits(record) && open.hold?.reason !== "checks")
      return this.recombine(repo, record, "line");
    if (this.described.get(repo.id) !== open.head) await this.describe(repo, open, forge);
    const change: ForgeChange = {
      number: pull.number,
      url: open.url ?? null,
      branch: open.branch,
      headSha: open.head,
      title: pull.title ?? this.title(open.members),
    };
    const checks = await forge.checks(change);
    // A check that ran on the batch pull request ends the project's record
    // that it runs none, as on a change's own pull request.
    const [ran] = repo.noChecks ? checksThatRan(checks.items) : [];
    if (ran)
      this.options.repos.endNoChecks(repo.id, { check: ran.name, change: forge.label(change) });
    // The same reading a change's own pull request takes: every check that
    // holds passed or skipped is green, an advisory one holding nothing in
    // any state, and a reading where no check ran - none at all, or only
    // skipped or advisory ones - is green only where every member's own
    // version was declared to run none. The failed checks the repair judged passed on a
    // rerun are answered at this version; any other check, one that fails
    // later included, still counts.
    const answered = open.passed?.head === open.head ? open.passed.checks : [];
    const items = checks.items.map((item) =>
      isRedCheckState(item.state) && answered.includes(item.name)
        ? { ...item, state: "success" as const }
        : item,
    );
    const summary = checkSnapshotSummary({
      headSha: open.head,
      items,
      ...(checks.complete !== undefined ? { complete: checks.complete } : {}),
      ...(checks.problem ? { problem: checks.problem } : {}),
      absenceDeclared: open.members.every((member) =>
        this.options.runsNoChecks(member.taskId, member.head),
      ),
    });
    const failed = items.filter((item) => isRedCheckState(item.state));
    this.read(repo.id, open.head, items);
    if (summary.overall === "red") {
      const never = notRun(checks);
      const held = hold(record, {
        at: this.options.now(),
        head: open.head,
        reason: "checks",
        checks: failed.map((item) => item.name),
        ...(never ? { notRun: never } : {}),
      });
      // Failed again with its approved fix waiting: the fix joins now, and no repair is woken.
      if (fixWaits(held.record))
        return this.recombine(repo, this.save(repo.id, held.record), "line");
      if (held.fresh) this.heldNow(repo, this.save(repo.id, held.record));
      else if (held.record !== record) this.save(repo.id, held.record);
      return held.record;
    }
    // Checks that run again end a hold of failed checks: the repair judged a flake.
    if (open.hold?.reason === "checks") record = this.save(repo.id, release(record));
    if (summary.overall === "pending") return record;
    // The host's own reading of a moved default branch, with no rule of the app's.
    if (pull.readiness === "behind" || pull.readiness === "conflict")
      return this.recombine(repo, record, "none");
    // A merge the host refused at this version is never sent again: Try again makes a new one.
    if (open.hold?.reason === "merge-way" && open.hold.head === open.head && open.hold.detail)
      return record;
    // A rule of the default branch holds it, such as a required review or
    // signed commits: nothing is sent, and the batch says so once.
    if (pull.readiness === "blocked") {
      const held = hold(record, {
        at: this.options.now(),
        head: open.head,
        reason: "rules",
        checks: [],
      });
      if (held.fresh) {
        this.save(repo.id, held.record);
        this.options.note(BATCH_WORDS.blocked(repo.name, this.label(repo, open), forge.place));
      }
      return held.record;
    }
    // The host lets it through again: a hold of its rules ends by itself.
    if (open.hold?.reason === "rules") record = this.save(repo.id, release(record));
    if (pull.readiness !== "clean") return record;
    return this.merge(repo, record, forge, change);
  }

  /**
   * A merge sent at this version whose outcome the host did not confirm,
   * the pull request still open: never sent again. The host's merge queue
   * holding it reads as queued; the host's own word that the merge failed,
   * or no word at all, holds the batch with nothing sent until Try again;
   * a merge the host still reports as running waits, shown from the first
   * such reading with Try again (`mergeWait`). A batch whose changes left,
   * or whose words changed, while that merge runs moves to a new pull
   * request as Try again does, or keeps waiting where the host did not
   * close it, since its merge could take a new version whose checks never ran.
   */
  private async settleUnconfirmed(
    repo: RepoView,
    record: BatchRecord,
    forge: Forge,
    open: OpenBatch,
  ): Promise<BatchRecord> {
    const { unconfirmed, ...rest } = open;
    const number = open.number as number;
    if (forge.inHostQueue && (await forge.inHostQueue(number))) {
      const next = this.save(repo.id, { ...record, open: { ...rest, queued: open.head } });
      this.options.note(BATCH_WORDS.queued(repo.name, this.label(repo, open), forge.place));
      return next;
    }
    const task = unconfirmed?.mergeTask;
    const refused =
      task && forge.mergeTaskRefused ? await forge.mergeTaskRefused(number, task) : !task;
    // The host's own merge is still running: the next pass reads it again. From the first
    // such reading Settings shows the wait with Try again, and the feed says it once, since a
    // host can read a merge that never ends as running too.
    if (!refused) {
      if (open.stale || open.members.length === 0) {
        await this.replaceWaited(repo, record);
        const now = this.record(repo.id);
        if (now.open?.branch !== open.branch) return now;
      }
      if (unconfirmed?.pending !== undefined) return record;
      const waiting = this.save(repo.id, {
        ...record,
        open: {
          ...open,
          unconfirmed: { head: open.head, ...unconfirmed, pending: this.options.now() },
        },
      });
      this.options.note(BATCH_WORDS.mergeRunning(repo.name, this.label(repo, open), forge.place));
      return waiting;
    }
    const place = forge.place ?? BATCH_WORDS.host;
    const detail = task ? BATCH_WORDS.notMerged(place) : BATCH_WORDS.unconfirmed(place);
    const held = hold(
      { ...record, open: rest },
      { at: this.options.now(), head: open.head, reason: "merge-way", checks: [], detail },
    );
    this.save(repo.id, held.record);
    if (held.fresh)
      this.options.note(
        task
          ? BATCH_WORDS.refused(repo.name, this.label(repo, open), detail)
          : BATCH_WORDS.unanswered(repo.name, this.label(repo, open), forge.place),
      );
    return held.record;
  }

  /**
   * Try again, or a pass whose batch's changes left or changed, on a merge
   * the host still reads as running (`mergeWait`): that merge may still
   * finish, and a host whose merge names no version would merge whatever its
   * branch holds then, so no new version goes on its pull request. The pull
   * request is closed first and read again; once it reads closed, it is kept
   * as closed, its branch goes and its changes combine with the line on a
   * new branch and pull request. A close the host refused or did not take keeps
   * the wait and answers so; a merge that finished meanwhile is recorded as
   * merged. Answers the refusal, or nothing once the new batch is combined.
   */
  private async replaceWaited(
    repo: RepoView,
    record: BatchRecord,
  ): Promise<string | Said | undefined> {
    const forge = this.options.forgeFor(repo);
    const open = record.open as OpenBatch;
    const number = open.number as number;
    if (!forge.pull) return BATCH_WORDS.ended;
    // A refused or failed close is answered by the reading below: the pull request
    // says what became of it and of its merge.
    await forge
      .close({ number, branch: open.branch, headSha: open.head, url: open.url ?? null })
      .catch(() => {});
    const pull = await forge.pull(number);
    if (
      !this.atBatchAddress(repo, open) ||
      pull.number !== number ||
      (pull.branch && pull.branch !== open.branch)
    )
      return BATCH_WORDS.ended;
    if (pull.merged) {
      if (pull.headSha === open.head) await this.finish(repo, record, forge, pull.mergedSha);
      return BATCH_WORDS.ended;
    }
    if (pull.state !== "closed") return BATCH_WORDS.stillOpen(this.label(repo, open), forge.place);
    await forge.deleteBranch?.(open.branch).catch(() => {});
    const saved = this.save(repo.id, reopened(record, this.options.now()));
    this.settleTold(saved, open.branch);
    await this.recombine(repo, saved, "line");
    return undefined;
  }

  /** Merge at the batch's version, keeping one commit per change. */
  private async merge(
    repo: RepoView,
    followed: BatchRecord,
    forge: Forge,
    change: ForgeChange,
  ): Promise<BatchRecord> {
    const open = followed.open as OpenBatch;
    const ways = await this.ways(repo, forge);
    // The read keeps the allowed merges on the saved record; this pass's copy carries them too.
    const record = ways ? { ...followed, ways } : followed;
    const way = ways ? mergeWayFor(ways, open.members.length) : undefined;
    if (!way) {
      const held = hold(record, {
        at: this.options.now(),
        head: open.head,
        reason: "merge-way",
        checks: [],
      });
      if (held.fresh) {
        this.save(repo.id, held.record);
        this.options.note(BATCH_WORDS.noWay(repo.name, this.label(repo, open)));
      }
      return held.record;
    }
    // The last look: every member is still approved at the version the batch carries.
    if (
      open.members.some(
        (member) => this.options.approved(member.taskId, member.head, repo) !== true,
      )
    )
      return this.recombine(
        repo,
        this.save(repo.id, this.withCurrentApprovals(repo, record)),
        "none",
      );
    const only = open.members.length === 1 ? (open.members[0] as BatchMember) : undefined;
    let sha: string | undefined;
    try {
      if (!this.atBatchAddress(repo, open)) return record;
      const answer = await forge.putIn(
        {
          ...change,
          title: only ? only.title : this.title(open.members),
          squashMessage: only ? only.body : batchList(open.members),
        },
        open.head,
        way,
      );
      if (answer?.queued) {
        // The branch's own merge queue took it: the host merges or removes it, and the passes read which.
        const { hold: _hold, ...waiting } = open;
        const next = this.save(repo.id, { ...record, open: { ...waiting, queued: open.head } });
        this.options.note(BATCH_WORDS.queued(repo.name, this.label(repo, open), forge.place));
        return next;
      }
      sha = answer?.sha;
    } catch (caught) {
      // A merge that left on a host whose merge names no version, with its
      // outcome unknown: kept, read on later passes, and never sent again.
      if (
        forge.mergeNamesNoVersion &&
        caught instanceof ForgeError &&
        !caught.beforeSend &&
        !(caught instanceof ForgeAllowanceSpent) &&
        isTransientForgeFailure(caught)
      ) {
        const { hold: _hold, ...waiting } = open;
        return this.save(repo.id, {
          ...record,
          open: {
            ...waiting,
            unconfirmed: {
              head: open.head,
              ...(caught instanceof ForgeMergeUnconfirmed && caught.mergeTask
                ? { mergeTask: caught.mergeTask }
                : {}),
            },
          },
        });
      }
      if (!(caught instanceof ForgeError) || caught.failure !== "refused") throw caught;
      // The host's verdict on the merge itself: held with its own words, never sent again.
      const held = hold(record, {
        at: this.options.now(),
        head: open.head,
        reason: "merge-way",
        checks: [],
        detail: caught.message,
      });
      if (held.fresh) {
        this.save(repo.id, held.record);
        this.options.note(BATCH_WORDS.refused(repo.name, this.label(repo, open), caught.message));
      }
      return held.record;
    }
    return this.finish(repo, record, forge, sha, way === "squash" ? sha : undefined);
  }

  /** The batch merged: receipts, superseded pull requests, the batch branch, then the tasks. */
  private async finish(
    repo: RepoView,
    record: BatchRecord,
    forge: Forge,
    mergedSha: string | undefined,
    squashed?: string,
  ): Promise<BatchRecord> {
    const open = record.open as OpenBatch;
    if (!this.atBatchAddress(repo, open)) return record;
    const landed =
      squashed && open.members.length === 1
        ? new Map([[(open.members[0] as BatchMember).taskId, squashed]])
        : await (this.options.landed ?? landedCommits)({
            repoDir: repo.path,
            ...(repo.origin ? { remote: repo.origin } : {}),
            defaultBranch: await forge.defaultBranch(),
            members: open.members,
            ...(mergedSha ? { merged: mergedSha } : {}),
            ...(open.generated ? { generated: open.generated } : {}),
          });
    if (!this.atBatchAddress(repo, open)) return record;
    const label = this.label(repo, open);
    const saved = this.save(
      repo.id,
      unfixed(
        merged(record, landed, this.options.now()),
        open.members.flatMap((member) => declarationsOf(record, member)),
      ),
    );
    this.options.note(BATCH_WORDS.merged(repo.name, label, open.members.length));
    for (const member of open.members) {
      if (member.number === undefined || !forge.closeWithNote) continue;
      // The change's own pull request carries commits the batch rewrote, so the host leaves it open.
      await forge
        .closeWithNote(
          { number: member.number, branch: member.branch, headSha: member.head, url: null },
          BATCH_WORDS.superseded(label, open.url ?? null),
        )
        .catch((caught: unknown) =>
          console.warn(`[batches] closing ${member.branch}'s pull request: ${String(caught)}`),
        );
    }
    await forge.deleteBranch?.(open.branch).catch(() => {});
    // A change left out of this batch whose crewmate was told to rebuild on it, and whose
    // rebuild does not stand since the batch merged without a change it was told about, reads
    // its place again: its left-out reason stands alone.
    this.options.settle([
      ...open.members.map((member) => member.taskId),
      ...this.toldOn(saved, open.branch).filter(
        (taskId) =>
          !saved.leftOut.some((left) => left.taskId === taskId && rebuildStands(saved, left)),
      ),
    ]);
    return saved;
  }

  /** Every member was withdrawn: close the pull request and drop the branch. */
  private async abandon(repo: RepoView, record: BatchRecord, forge: Forge): Promise<BatchRecord> {
    const open = record.open as OpenBatch;
    if (!this.atBatchAddress(repo, open)) return record;
    if (open.number !== undefined)
      await forge.close({
        number: open.number,
        branch: open.branch,
        headSha: open.head,
        url: open.url ?? null,
      });
    await forge.deleteBranch?.(open.branch).catch(() => {});
    const saved = this.save(repo.id, abandoned(unfixed(record, []), this.options.now()));
    this.settleTold(saved, open.branch);
    return saved;
  }

  /**
   * Combine onto the freshly fetched default branch and push the batch
   * branch: a new batch from the whole line, or the open batch again, alone
   * or with the line behind it. A declared fix that did not join stays
   * declared, so it joins once approved or once the batch holds again.
   */
  private async recombine(
    repo: RepoView,
    record: BatchRecord,
    join: "none" | "line" | "retry",
    /** The batch branch's version as the host holds it now, where that is not the recorded one. */
    pushed?: string,
  ): Promise<BatchRecord> {
    const forge = this.options.forgeFor(repo);
    if (record.open && !this.atBatchAddress(repo, record.open)) return record;
    const current = this.withCurrentApprovals(repo, record);
    if (current !== record) record = this.save(repo.id, current);
    const { merged, unmergedBase } = this.options;
    // A change waits for its base while that task is live; once it closed, merged or not, the combine decides.
    const changes = carried(
      record,
      join === "retry" ? "line" : join,
      (taskId) => !this.options.live(taskId),
    );
    if (changes.length === 0) return record.open ? this.abandon(repo, record, forge) : record;
    const at = this.options.now();
    const held = heldVersions(record);
    const retry = join === "retry" ? record.open : undefined;
    const retryHead = retry ? ((await this.moved(forge, retry)) ?? retry.head) : undefined;
    const result = await (this.options.combine ?? combineChanges)({
      repoDir: repo.path,
      defaultBranch: await forge.defaultBranch(),
      ...(repo.origin ? { remote: repo.origin } : {}),
      changes,
      at,
      ...(merged ? { merged } : {}),
      ...(unmergedBase ? { unmergedBase } : {}),
      held,
      ...(retry && retryHead ? { excludeHeads: [retry.head, retryHead, ...held] } : {}),
      mergedWith: (taskId) =>
        record.receipts.find((entry) => entry.taskId === taskId)?.head ?? merged?.(taskId),
    });
    const branch =
      record.open?.branch ??
      (
        this.options.branchName ?? (() => `${BATCH_BRANCH_PREFIX}${randomBytes(4).toString("hex")}`)
      )();
    // A push whose record was lost moved the branch: every combine, the automatic ones
    // and Try again or a send-back alike, goes over what the host holds.
    const expected = !result.members.length
      ? null
      : (pushed ??
        retryHead ??
        (record.open ? ((await this.moved(forge, record.open)) ?? record.open.head) : null));
    // The project may have moved during any read above: nothing goes to a former address.
    if (!this.stillAt(repo)) return record;
    // The base this combine verified for a declared fix is kept before the push, which may
    // never come back: it joins the saved record alone, whose hold and version stay as they were.
    const { fixBases } = this.save(repo.id, withBases(this.record(repo.id), result));
    if (result.members.length)
      await (this.options.push ?? pushBatch)({
        repoDir: repo.path,
        branch,
        ...(repo.origin ? { remote: repo.origin } : {}),
        head: result.head,
        expected,
      });
    // Moved while the push ran: its result belongs to the former address, not the project now.
    if (!this.stillAt(repo)) return record;
    // A declared fix stays declared once it joins, until a batch merges with it or its task
    // closes. Its base is the one kept above, where the batch still said which fix it awaited.
    let next = this.save(repo.id, {
      ...combined(release(record), result, { branch, at, origin: repo.origin }),
      ...(fixBases ? { fixBases } : {}),
    });
    for (const left of result.leftOut) {
      // A clash while a batch stays open is answered now: its crewmate rebuilds on that batch.
      if (left.clash && next.open && this.options.rebuild) {
        this.tellRebuild(repo.id, left.change, left.reason);
        continue;
      }
      this.options.taskNote(
        left.change.taskId,
        (left.ahead ? BATCH_WORDS.leftOutAhead : BATCH_WORDS.leftOut)(left.reason),
      );
    }
    next = this.record(repo.id);
    if (result.leftOut.length)
      this.options.settle(result.leftOut.map((left) => left.change.taskId));
    if (!next.open) {
      // Nothing combined: an open batch has nothing left to carry.
      if (record.open)
        next = await this.abandon(repo, { ...next, open: { ...record.open, members: [] } }, forge);
      return next;
    }
    return this.follow(repo, next);
  }

  private async openRequest(
    open: OpenBatch,
    forge: Forge,
  ): Promise<{ change: ForgeChange; comments: string[]; missing: BatchMember[] }> {
    const { body, comments, missing } = await this.body(open, forge);
    const change = await forge.openChange({
      branch: open.branch,
      title: this.title(open.members),
      body,
    });
    return { change, comments, missing };
  }

  /**
   * The batch branch's version where the project lives when a push whose
   * record was lost moved it from the recorded one, so a combine pushes over
   * what the host holds instead of failing its lease on every pass; undefined
   * when it is where the record says.
   */
  private async moved(forge: Forge, open: OpenBatch): Promise<string | undefined> {
    const pushed = await this.pushedHead(forge, open.branch);
    return pushed === open.head ? undefined : pushed;
  }

  /**
   * The project's own checks pushed one commit on top of the batch that
   * changes only files the project marks generated (`generatedOnTop`): the
   * app writes it again on the batch's version and pushes it over theirs,
   * so the host starts every check on it, as a push by the checks cannot,
   * and it stands as the batch's version. Taken once per combine, and never
   * on a held batch; undefined when `pushed` is no such commit.
   */
  private async takeGenerated(
    repo: RepoView,
    record: BatchRecord,
    pushed: string,
  ): Promise<BatchRecord | undefined> {
    const open = record.open as OpenBatch;
    if (open.generated !== undefined || open.hold) return undefined;
    const written = await this.writeGenerated(repo, open.branch, open.head, pushed);
    if (written === null) return record;
    if (!written) return undefined;
    const { passed: _passed, ...kept } = open;
    return this.save(repo.id, { ...record, open: { ...kept, head: written, generated: written } });
  }

  /**
   * The generated commit `pushed` written again on `head` and pushed over it to `branch`
   * (`takeGenerated`, and the early run's in `followTrial`); undefined when `pushed` is no
   * such commit, null when the project moved meanwhile, so nothing goes to a former address.
   */
  private async writeGenerated(
    repo: RepoView,
    branch: string,
    head: string,
    pushed: string,
  ): Promise<string | null | undefined> {
    const written = await (this.options.generated ?? generatedOnTop)({
      repoDir: repo.path,
      branch,
      head,
      pushed,
      at: this.options.now(),
      ...(repo.origin ? { remote: repo.origin } : {}),
    });
    if (!written) return undefined;
    if (!this.stillAt(repo)) return null;
    await (this.options.push ?? pushBatch)({
      repoDir: repo.path,
      branch,
      ...(repo.origin ? { remote: repo.origin } : {}),
      head: written,
      expected: pushed,
    });
    return this.stillAt(repo) ? written : null;
  }

  /** The batch branch's version where the project lives; undefined when it is not there. */
  private async pushedHead(forge: Forge, branch: string): Promise<string | undefined> {
    if (!forge.branchHead) return undefined;
    try {
      return await forge.branchHead(branch);
    } catch (caught) {
      // The host's refusal is its answer for a branch that is gone.
      if (caught instanceof ForgeError && caught.failure === "refused") return undefined;
      throw caught;
    }
  }

  /**
   * Give the open pull request the batch's own title and description once
   * its members changed, and the comments that carry the stories past it.
   * A host replaces a description only at the version, words and title just
   * read, so the pull request is read first; a rewrite the host did not take
   * is sent again on the next pass.
   */
  private async describe(
    repo: RepoView,
    open: OpenBatch,
    forge: Forge,
    /** `open` is the early run with the held batch's fix (`followTrial`), its last member the fix. */
    trial = false,
  ): Promise<void> {
    if (!forge.updateChangeBody || open.number === undefined) return;
    const held = await forge.changeFor(open.branch);
    if (!held || held.number !== open.number || held.headSha !== open.head) return;
    const { body, comments, missing } = await this.body(open, forge, trial);
    const title = this.title(open.members);
    if ((held.body ?? "") !== body || held.title !== title) {
      try {
        await forge.updateChangeBody(held, body, title);
      } catch (caught) {
        // The pull request changed between the read and the write: the next pass reads it again.
        if (
          caught instanceof ForgeWriteError &&
          caught.outcome === "failed" &&
          caught.failure === "refused"
        )
          return;
        throw caught;
      }
    }
    if (await this.continueIn(forge, open.number, comments, false))
      this.wrote(repo, open, missing, trial ? trialMark(open.head) : open.head);
  }

  /**
   * Keep the app's own comments that carry the stories past the batch's
   * description equal to `comments`, in order: a changed one is rewritten,
   * a missing one posted and one left over deleted, so none still carries a
   * story the batch no longer holds. A pull request just opened has none to
   * read. Answers whether they are in step: one the host refused is tried
   * again on a later pass, from a fresh reading, and the batch goes on.
   */
  private async continueIn(
    forge: Forge,
    number: number,
    comments: readonly string[],
    opened: boolean,
  ): Promise<boolean> {
    if (!keepsComments(forge)) return true;
    if (opened && comments.length === 0) return true;
    try {
      const held = opened ? [] : await forge.ownComments(number, BATCH_STORIES_MARKER);
      for (const [index, body] of comments.entries()) {
        const kept = held[index];
        if (kept?.body !== body) await forge.writeComment(number, body, kept?.id);
      }
      for (const left of held.slice(comments.length)) await forge.deleteComment(number, left.id);
      return true;
    } catch (caught) {
      // A sign-in, the network or a busy host: the pass reads again.
      if (isSignInForgeFailure(caught) || isTransientForgeFailure(caught)) throw caught;
      console.warn(
        "[batches] could not write the comments that carry the batch's stories:",
        caught instanceof Error ? caught.message : caught,
      );
      return false;
    }
  }

  /**
   * The pull request holds the batch's words at this version. With every
   * story in them, nothing is written again until the batch changes. A story
   * that could not be written is said once for that version of its change,
   * and the description is written again on each pass until it is there.
   */
  private wrote(
    repo: RepoView,
    open: OpenBatch,
    missing: readonly BatchMember[],
    mark: string = open.head,
  ): void {
    if (missing.length === 0) {
      this.described.set(repo.id, mark);
      this.storyless.delete(repo.id);
      return;
    }
    const told = this.storyless.get(repo.id) ?? new Set<string>();
    const fresh = missing.filter((member) => !told.has(`${member.taskId} ${member.head}`));
    if (fresh.length === 0) return;
    for (const member of fresh) told.add(`${member.taskId} ${member.head}`);
    this.storyless.set(repo.id, told);
    this.options.note(
      BATCH_WORDS.noStory(
        repo.name,
        this.label(repo, open),
        fresh.map((member) => member.title),
      ),
    );
  }

  /**
   * The pull request's description, the comments that carry the stories it
   * cannot hold, and the changes whose story could not be written into
   * either this time. A batch of one reads as that change's own pull request
   * does: the words around its story, then the story. A batch of several
   * lists its changes, then carries each one's story under its title, within
   * the host's limits (`batchDescription`).
   */
  private async body(
    open: OpenBatch,
    forge: Forge,
    trial = false,
  ): Promise<{ body: string; comments: string[]; missing: BatchMember[] }> {
    const stories = await Promise.all(
      open.members.map((member) => this.options.story(member, forge).catch(() => undefined)),
    );
    if (open.members.length === 1)
      return {
        body: [stories[0]?.projectText, stories[0]?.region].filter(Boolean).join("\n\n"),
        comments: [],
        missing: stories[0] ? [] : open.members,
      };
    const { body, comments, unplaced } = batchDescription(
      open.members.map((member, index) => ({
        title: member.title,
        region: stories[index]?.region,
      })),
      this.limits(forge),
      trial ? open.members.at(-1)?.title : undefined,
    );
    return {
      body,
      comments,
      missing: open.members.filter((_member, index) => !stories[index] || unplaced.includes(index)),
    };
  }

  /** What the project's host keeps: a description, and a comment where the app can write one. */
  private limits(forge: Forge): BatchLimits {
    return {
      description: presentationBodyLimit(forge.kind),
      comment: keepsComments(forge) ? presentationCommentLimit(forge.kind) : 0,
    };
  }

  private title(members: readonly BatchMember[]): string {
    return batchTitle(members, this.options.naming());
  }

  /** The merges the project allows, read now within a pass and kept for Settings. */
  private async ways(repo: RepoView, forge: Forge): Promise<MergeWays | undefined> {
    if (!forge.mergeWays) return undefined;
    const ways = await forge.mergeWays();
    const record = this.record(repo.id);
    if (JSON.stringify(record.ways) !== JSON.stringify(ways))
      this.save(repo.id, { ...record, ways });
    return ways;
  }

  /** Read a project's allowed merges where it lives and keep them, for the choice in Settings. */
  async readWays(repoId: string): Promise<MergeWays | undefined> {
    const repo = this.options.repos.get(repoId);
    const forge = repo ? this.options.forgeFor(repo) : undefined;
    if (!forge?.mergeWays) return undefined;
    const ways = await forge.mergeWays();
    await this.write(repoId, (record) =>
      JSON.stringify(record.ways) === JSON.stringify(ways) ? record : { ...record, ways },
    );
    return ways;
  }

  /**
   * Refuses the choice of batched pull requests for a project that allows
   * only squash merges, with its reason: a batch keeps one commit for each
   * change. A project whose merges cannot be read is not refused here.
   */
  async refuseSquashOnly(repoId: string): Promise<void> {
    const ways = await this.readWays(repoId).catch(() => undefined);
    if (ways && !keepsCommits(ways)) throw new Error(SQUASH_ONLY_WORDS);
  }

  /** A fresh hold of failed checks: its one change's own crewmate, or the first mate once. */
  private heldNow(repo: RepoView, record: BatchRecord): void {
    const open = record.open as OpenBatch;
    this.options.note(BATCH_WORDS.held(repo.name, this.label(repo, open), open.hold?.checks ?? []));
    if (open.members.length === 1) this.options.settle([(open.members[0] as BatchMember).taskId]);
    else
      this.options.held({
        repo,
        batch: open,
        sentBack: (record.sentBack ?? []).filter((entry) =>
          open.members.some((member) => member.taskId === entry.taskId),
        ),
      });
  }

  private label(repo: RepoView, open: OpenBatch): string {
    const forge = this.options.forgeFor(repo);
    return open.number === undefined
      ? "a batch"
      : forge.label({ number: open.number, branch: open.branch, headSha: open.head, url: null });
  }

  private save(repoId: string, record: BatchRecord): BatchRecord {
    // A batch that ended takes its checks reading with it.
    if (!record.open && this.readings.delete(repoId)) this.options.checksRead?.(repoId);
    this.options.repos.recordBatch(repoId, record);
    return record;
  }
}
