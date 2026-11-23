import {
  BATCH_STATUS_WORDS,
  type BatchChange,
  type BatchHold,
  type BatchMember,
  type BatchRebuild,
  type BatchReceipt,
  type BatchRecord,
  type BatchSendBack,
  type BatchStatus,
  FINISHED_BATCH_KEPT_MS,
  type FinishedBatch,
  type OpenBatch,
} from "@shared/batches";
import { BATCH_WAITING_WORDS } from "../forge";
import type { Combined } from "./combine";

/**
 * The rules of a project's line and its one open batch (docs/forge.md,
 * "Batches of your own"), as pure steps over the saved record. `Batches`
 * decides when each runs and does the work where the project lives;
 * nothing here reads a clock, a host or a folder.
 */

/** What a change's own merge reads of its place in the line and the batch. */
export type Standing =
  | { state: "merged"; receipt: BatchReceipt }
  /**
   * In line, in the open batch while it is checked (`batch`), or in a batch
   * of several that holds (`held`): the batch's repair answers that hold.
   */
  | {
      state: "waiting";
      place: "line" | "batch" | "held";
      /** Why its batch holds, where it does. */
      hold?: BatchHold["reason"];
      number?: number;
      url?: string | null;
    }
  /** The only change of a batch whose checks failed: its own crewmate repairs it. */
  | { state: "failed"; checks: string[]; number?: number; url?: string | null }
  /**
   * Left out; `ahead` names the task of the unmerged change ahead it clashes
   * with; `rebuild`, the open batch's version its crewmate was told to
   * rebuild it on, while that batch is open.
   */
  | {
      state: "left-out";
      reason: string;
      ahead?: string;
      rebuild?: { head: string; branch: string };
    }
  /**
   * Sent back from its batch at this version (INF-5097 piece 1): like the
   * only change of a failed batch, its crewmate repairs it in a new version.
   */
  | { state: "sent-back"; reason: string; number?: number; url?: string | null };

/** A change's place at `head`; undefined when the record holds none for that version. */
export function standing(record: BatchRecord, taskId: string, head: string): Standing | undefined {
  const receipt = record.receipts.find((entry) => entry.taskId === taskId && entry.head === head);
  if (receipt) return { state: "merged", receipt };
  const member = record.open?.members.find(
    (entry) => entry.taskId === taskId && entry.head === head,
  );
  if (member && record.open) {
    const hold = record.open.hold;
    const request = {
      ...(record.open.number !== undefined ? { number: record.open.number } : {}),
      ...(record.open.url !== undefined ? { url: record.open.url } : {}),
    };
    return hold?.reason === "checks" && record.open.members.length === 1
      ? { state: "failed", checks: hold.checks, ...request }
      : hold
        ? { state: "waiting", place: "held", hold: hold.reason, ...request }
        : { state: "waiting", place: "batch", ...request };
  }
  if (record.line.some((entry) => entry.taskId === taskId && entry.head === head))
    return { state: "waiting", place: "line" };
  const left = record.leftOut.find((entry) => entry.taskId === taskId && entry.head === head);
  if (left)
    return {
      state: "left-out",
      reason: left.reason,
      ...(left.ahead ? { ahead: left.ahead } : {}),
      // The rebuild it was told stands while the batch it names is open, and after it merged.
      ...(left.rebuild &&
      (record.open?.branch === left.rebuild.branch || rebuildStands(record, left))
        ? { rebuild: left.rebuild }
        : {}),
    };
  const sent = sentBackOf(record, taskId).findLast((entry) => entry.head === head);
  if (!sent) return undefined;
  return {
    state: "sent-back",
    reason: sent.reason,
    ...(sent.number !== undefined ? { number: sent.number } : {}),
    ...(sent.url !== undefined ? { url: sent.url } : {}),
  };
}

/** Every send-back of a task's change, at any version, oldest first. */
export function sentBackOf(record: BatchRecord, taskId: string): BatchSendBack[] {
  return (record.sentBack ?? []).filter((entry) => entry.taskId === taskId);
}

/**
 * The record after the open batch, held at `hold`, sent `taskId` back with
 * its reason: the send-back is kept with the batch's pull request, its
 * failed checks and the checks that never ran, and the change leaves the
 * batch as a withdrawn one does.
 */
export function sendBack(
  record: BatchRecord,
  taskId: string,
  member: Pick<BatchMember, "head">,
  reason: string,
  at: number,
): { record: BatchRecord; sent: BatchSendBack } {
  const open = record.open;
  const notRun = open?.hold?.notRun;
  const sent: BatchSendBack = {
    taskId,
    head: member.head,
    reason,
    at,
    ...(open?.number !== undefined ? { number: open.number } : {}),
    ...(open?.url !== undefined ? { url: open.url } : {}),
    failed: (open?.hold?.checks ?? []).filter((name) => !notRun?.includes(name)),
    ...(notRun ? { notRun } : {}),
  };
  const without = withdraw(record, taskId);
  return { record: { ...without, sentBack: [...(without.sentBack ?? []), sent] }, sent };
}

/** A change's place as its batch check says it (`BatchStatus`). */
export function batchStatus(place: Standing): BatchStatus {
  const link = (url: string | null | undefined) => (url ? { link: url } : {});
  switch (place.state) {
    case "merged":
      return { kind: "passed", words: BATCH_STATUS_WORDS.merged, ...link(place.receipt.url) };
    case "failed":
      return { kind: "failed", words: BATCH_STATUS_WORDS.failed(place.checks), ...link(place.url) };
    case "sent-back":
      return {
        kind: "failed",
        words: BATCH_STATUS_WORDS.sentBack(place.reason),
        ...link(place.url),
      };
    case "left-out":
      // A clash with a change ahead that is not merged yet, or one its crewmate is rebuilding
      // on the open batch, asks nothing more of the change itself.
      return {
        kind: place.ahead || place.rebuild ? "paused" : "failed",
        words: BATCH_STATUS_WORDS.leftOut(place.reason),
      };
    case "waiting":
      return place.place === "line"
        ? { kind: "waiting", words: BATCH_WAITING_WORDS }
        : place.place === "held"
          ? {
              kind: "paused",
              words: BATCH_STATUS_WORDS.held(place.hold ?? "checks"),
              ...link(place.url),
            }
          : { kind: "in-batch", words: BATCH_STATUS_WORDS.batch, ...link(place.url) };
  }
}

/**
 * Put an approved change in line, in approval order. An earlier version of
 * the same task leaves the line and the open batch: only the approved
 * version is carried. `fix` marks the change the held batch's declared fix,
 * also when that version already waits in line: a fix may be declared after
 * its approval, and the same approval may come again.
 */
export function enqueue(record: BatchRecord, approved: BatchChange): BatchRecord {
  // The held version an approval verified a declared fix on goes with its repair as it enters
  // the line, before any combine, so a version approved in its place is carried from it too.
  const { heldBase, ...change } = approved;
  const bound =
    change.fix &&
    heldBase &&
    record.fixes?.includes(change.taskId) &&
    !record.fixBases?.[change.taskId]
      ? { ...record, fixBases: { ...record.fixBases, [change.taskId]: heldBase } }
      : record;
  if (standing(bound, change.taskId, change.head)?.state === "waiting")
    return change.fix ? markFix(bound, change.taskId) : bound;
  const without = withdraw(bound, change.taskId);
  return {
    ...without,
    line: [...without.line, change].sort((a, b) => a.at - b.at),
    leftOut: without.leftOut.filter((entry) => entry.taskId !== change.taskId),
  };
}

/**
 * Take a task's change out of the line and the open batch: its approval was
 * withdrawn, or it was sent back. An open batch that carried it combines
 * again without it (`stale`).
 */
export function withdraw(record: BatchRecord, taskId: string): BatchRecord {
  const open = record.open;
  const member = open?.members.some((entry) => entry.taskId === taskId);
  // A member built on the withdrawn change goes back in line and waits for it.
  const behind = open?.members.filter((entry) => entry.after === taskId) ?? [];
  const leaving = new Set([taskId, ...behind.map((entry) => entry.taskId)]);
  return {
    ...record,
    line: [...record.line.filter((entry) => entry.taskId !== taskId), ...behind.map(asChange)].sort(
      (a, b) => a.at - b.at,
    ),
    ...(open && member
      ? {
          open: {
            ...open,
            members: open.members.filter((entry) => !leaving.has(entry.taskId)),
            stale: true,
          },
        }
      : {}),
  };
}

/**
 * A change's story was confirmed on its pushed branch at `head`. The version
 * already in line or in the open batch keeps its place and takes the story's
 * title and words; an open batch whose member's words changed combines again
 * so that change's commit says them (`stale`). Any other version of the task
 * leaves, as a withdrawn one does: only the approved version is carried.
 */
export function reworded(
  record: BatchRecord,
  change: Pick<BatchChange, "taskId" | "head" | "title" | "body">,
): BatchRecord {
  const waits = (entry: BatchChange) =>
    entry.taskId === change.taskId && entry.head === change.head;
  const open = record.open;
  if (!record.line.some(waits) && !open?.members.some(waits))
    return withdraw(record, change.taskId);
  const says = (entry: BatchChange) =>
    !waits(entry) || (entry.title === change.title && entry.body === change.body);
  const worded = <Entry extends BatchChange>(entry: Entry): Entry =>
    says(entry) ? entry : { ...entry, title: change.title, body: change.body };
  return {
    ...record,
    line: record.line.map(worded),
    ...(open && !open.members.every(says)
      ? { open: { ...open, members: open.members.map(worded), stale: true } }
      : {}),
  };
}

/**
 * The formation rule: at least one change in line, no open batch of this
 * home's, and the project's batch gap (`gap`, in minutes) passed since its
 * last batch formed (docs/forge.md, "The batch gap"). With no gap, or no
 * batch formed yet, a batch forms at once. `now` is the pass's own clock.
 */
export function forms(record: BatchRecord, gap?: number, now?: number): boolean {
  if (record.open || record.line.length === 0) return false;
  const next = nextBatchAt(record, gap);
  return next === undefined || (now !== undefined && now >= next);
}

/**
 * When the project's next batch may form under its gap (epoch ms), or
 * undefined when one may form at once: no gap, or no batch formed yet.
 * A held batch's repair never reads it: it answers the open batch.
 */
export function nextBatchAt(record: BatchRecord, gap?: number): number | undefined {
  return gap && record.formed !== undefined ? record.formed + gap * 60_000 : undefined;
}

/**
 * Mark the change a task has waiting in line as the held batch's declared
 * fix. The same record when it has none there, or it is marked already.
 */
export function markFix(record: BatchRecord, taskId: string): BatchRecord {
  if (!record.line.some((entry) => entry.taskId === taskId && !entry.fix)) return record;
  return {
    ...record,
    line: record.line.map((entry) =>
      entry.taskId === taskId ? { ...entry, fix: true as const } : entry,
    ),
  };
}

/**
 * The record after its batch merged with the fixes in `joined`, or ended:
 * those declarations and their marks answer nothing now. A declared fix that
 * has not merged stays declared, with the versions that held, so it is still
 * carried as its own difference and never with the work of a change sent
 * back; once no fix is left, the versions that held go too.
 */
export function unfixed(record: BatchRecord, joined: readonly string[]): BatchRecord {
  const left = (record.fixes ?? []).filter((taskId) => !joined.includes(taskId));
  const { fixes: _fixes, held, fixBases, ...rest } = record;
  const bases = Object.entries(fixBases ?? {}).filter(([taskId]) => left.includes(taskId));
  return {
    ...rest,
    ...(left.length ? { fixes: left, ...(held ? { held } : {}) } : {}),
    ...(bases.length ? { fixBases: Object.fromEntries(bases) } : {}),
    line: record.line.map(({ fix, ...entry }) =>
      fix && left.includes(entry.taskId) ? { ...entry, fix } : entry,
    ),
  };
}

/**
 * The record with `taskId` declared the held batch's fix: the declaration,
 * the mark on its change in line, and the held version kept among those that
 * held, so the repair's base outlives the hold until the repair merges or
 * its task closes.
 */
export function declared(record: BatchRecord, taskId: string): BatchRecord {
  const fixes = record.fixes ?? [];
  const head = record.open?.hold?.head;
  const held = record.held ?? [];
  return markFix(
    {
      ...record,
      fixes: fixes.includes(taskId) ? fixes : [...fixes, taskId],
      ...(head && !held.includes(head) ? { held: [head, ...held] } : {}),
    },
    taskId,
  );
}

/**
 * The versions of the project's batch that held, newest first, with the
 * open batch's own held version for a record saved before they were kept.
 */
export function heldVersions(record: BatchRecord): string[] {
  const held = record.held ?? [];
  const head = record.open?.hold?.head;
  return head && !held.includes(head) ? [head, ...held] : held;
}

/**
 * Whether the held batch's wait for its repair's fix ends now: the awaited
 * change is approved, or, once that repair's task closed (`awaits` empty),
 * any declared fix is.
 */
export function awaitedJoins(record: BatchRecord): boolean {
  const awaits = record.open?.awaits;
  return awaits ? record.line.some((entry) => entry.taskId === awaits) : fixWaits(record);
}

/** Whether an approved fix waits in line for the held batch. */
export function fixWaits(record: BatchRecord): boolean {
  return Boolean(record.open?.hold) && record.line.some((entry) => entry.fix);
}

/**
 * The changes the next combine carries, in order. A new batch takes the
 * whole line. An open batch combines its own members again; `line` adds
 * every change waiting behind them, as a held batch's answer does (a fix
 * joining, Try again, a send-back): the declared fixes first, so the change
 * that ends the hold sits right behind the members, then the rest of the
 * line in approval order.
 */
export function carried(
  record: BatchRecord,
  join: "none" | "line" = "none",
  /** Whether a task closed, merged or not; absent, none has. */
  closed: (taskId: string) => boolean = () => false,
): BatchChange[] {
  // A declared fix goes with the base its repair was verified on, whichever version of it this is.
  const based = (change: BatchChange): BatchChange => {
    const heldBase = record.fixBases?.[change.taskId];
    return heldBase ? { ...change, heldBase } : change;
  };
  // A change rebuilt on an open batch goes right behind the changes it was built on: first
  // in a new batch, behind the declared fixes when the line joins a held batch, and, when the
  // open batch is combined again with those changes still in it, right behind them then too.
  // A clashing version whose rebuild stands waits for the rebuilt version, in no batch.
  const line = record.line.filter((entry) => !rebuildStands(record, entry));
  const rebuilt = line.filter((entry) => entry.onBatch && !entry.fix);
  const rest = line.filter((entry) => !entry.onBatch && !entry.fix);
  if (!record.open)
    return inTurn(
      [...rebuilt, ...line.filter((entry) => !rebuilt.includes(entry))],
      new Set(),
      closed,
    ).map(based);
  const open = record.open;
  const behindOpen = (entry: BatchChange) =>
    (entry.onBatch?.members ?? []).every((carried) =>
      open.members.some(
        (member) => member.taskId === carried.taskId && member.head === carried.head,
      ),
    );
  const joining =
    join === "line"
      ? [...line.filter((entry) => entry.fix), ...rebuilt, ...rest]
      : rebuilt.filter(behindOpen);
  const members = record.open.members.map(asChange);
  return [
    ...members,
    ...inTurn(joining, new Set(members.map((entry) => entry.taskId)), closed),
  ].map(based);
}

/**
 * The changes of `changes` whose turn has come, in order (docs/forge.md,
 * "Batches of your own"): a change built on another task's approved
 * version (`after`) comes once that task's change is carried ahead of it,
 * whatever order the approvals came in, or once that task closed; the
 * combine checks it builds on the version that merged, or leaves it out
 * while it carries the work of a task that closed without merging. The
 * rest wait in line, with no left-out note, since nothing is wrong with them.
 */
function inTurn(
  changes: readonly BatchChange[],
  ahead: ReadonlySet<string>,
  closed: (taskId: string) => boolean,
): BatchChange[] {
  const carriedIds = new Set(ahead);
  const coming = new Set(changes.map((change) => change.taskId));
  // Rebuilt on an open batch: behind each change that version carries that is still to come.
  // One that is not coming, left or merged, is the combine's to judge.
  const waitsOn = (change: BatchChange) =>
    (change.onBatch?.members ?? []).some(
      (carried) =>
        carried.taskId !== change.taskId &&
        coming.has(carried.taskId) &&
        !carriedIds.has(carried.taskId),
    );
  const waits = (change: BatchChange) =>
    (change.after !== undefined && !carriedIds.has(change.after) && !closed(change.after)) ||
    waitsOn(change);
  const turn: BatchChange[] = [];
  const taken = new Set<BatchChange>();
  const take = (change: BatchChange) => {
    turn.push(change);
    taken.add(change);
    carriedIds.add(change.taskId);
    // A rebuilt change whose last change still to come just went goes right behind it.
    for (const next of changes)
      if (!taken.has(next) && next.onBatch && !waits(next)) {
        const behind = next.onBatch.members.some((carried) => carried.taskId === change.taskId);
        if (behind) take(next);
      }
  };
  for (let moved = true; moved; ) {
    moved = false;
    for (const change of changes) {
      if (taken.has(change) || waits(change)) continue;
      take(change);
      moved = true;
    }
  }
  return turn;
}

function asChange(member: BatchMember): BatchChange {
  const { commit: _commit, ...change } = member;
  return change;
}

/**
 * The record with the base each combine verified for a declared fix, whether
 * the fix joined or was left out. It is saved before the batch is pushed, so
 * a push that never comes back still keeps the base the repair was checked on.
 */
export function withBases<T extends Pick<BatchRecord, "fixes" | "fixBases">>(
  record: T,
  result: Combined,
): T {
  const verified = [...result.members, ...result.leftOut.map((entry) => entry.change)].flatMap(
    (change) =>
      change.heldBase && record.fixes?.includes(change.taskId)
        ? [[change.taskId, change.heldBase]]
        : [],
  );
  return verified.length
    ? { ...record, fixBases: { ...record.fixBases, ...Object.fromEntries(verified) } }
    : record;
}

/**
 * The record after a combine was pushed to `branch`: its members are the
 * open batch, any hold has ended, and each carried change has left the
 * line. A change left out is kept with its reason until its branch moves.
 * A combine that carried nothing leaves no open batch.
 */
export function combined(
  record: BatchRecord,
  result: Combined,
  batch: { branch: string; at: number; origin?: string | null },
): BatchRecord {
  const carriedIds = new Set([
    ...result.members.map((member) => member.taskId),
    ...result.leftOut.map((entry) => entry.change.taskId),
  ]);
  const { open: previous, ...rest } = record;
  const open: OpenBatch | undefined = result.members.length
    ? {
        branch: batch.branch,
        ...(batch.origin !== undefined ? { origin: batch.origin } : {}),
        head: result.head,
        base: result.base,
        ...(previous?.number !== undefined ? { number: previous.number } : {}),
        ...(previous?.url !== undefined ? { url: previous.url } : {}),
        // The holds it had before its repair combined it again stay counted.
        ...(previous?.holds !== undefined ? { holds: previous.holds } : {}),
        // Its repair stays its repair while the same pull request carries it.
        ...(previous?.repair !== undefined ? { repair: previous.repair } : {}),
        members: result.members,
        since: previous?.since ?? batch.at,
      }
    : undefined;
  // A new batch from the line starts the project's gap; the open batch combined again does not.
  const formed = open && !previous ? batch.at : record.formed;
  return {
    ...rest,
    ...withBases(rest, result),
    ...(formed !== undefined ? { formed } : {}),
    // A change whose base did not combine goes back in line, in approval order.
    line: [
      ...record.line.filter(
        (entry) =>
          !carriedIds.has(entry.taskId) &&
          !result.waiting?.some((change) => change.taskId === entry.taskId),
      ),
      ...(result.waiting ?? []),
    ].sort((a, b) => a.at - b.at),
    ...(open ? { open } : {}),
    leftOut: [
      ...record.leftOut.filter((entry) => !carriedIds.has(entry.taskId)),
      ...result.leftOut.map((entry) => ({
        taskId: entry.change.taskId,
        head: entry.change.head,
        reason: entry.reason,
        at: batch.at,
        ...(entry.ahead ? { ahead: entry.ahead } : {}),
      })),
    ],
  };
}

/**
 * Hold the open batch at its version, kept among the record's versions that
 * held so a fix built on it can join (`combine`'s `held`). Answers `fresh` only for
 * a hold this version did not already carry, so its owner hears of it once.
 */
export function hold(
  record: BatchRecord,
  next: BatchHold,
): { record: BatchRecord; fresh: boolean } {
  const open = record.open;
  if (!open) return { record, fresh: false };
  if (open.hold?.head === next.head && open.hold.reason === next.reason) {
    // A later reading of the same held version names its checks as they
    // stand now: what failed, and what was cancelled or never finished.
    const same =
      JSON.stringify([open.hold.checks, open.hold.notRun ?? null]) ===
      JSON.stringify([next.checks, next.notRun ?? null]);
    if (same || next.reason !== "checks") return { record, fresh: false };
    const { at: _at, ...now } = next;
    return {
      // The hold keeps when it began; the rest is the newer reading's, an unknown list included.
      record: { ...record, open: { ...open, hold: { at: open.hold.at, ...now } } },
      fresh: false,
    };
  }
  const held = [next.head, ...(record.held ?? []).filter((head) => head !== next.head)];
  return {
    record: { ...record, held, open: { ...open, hold: next, holds: (open.holds ?? 0) + 1 } },
    fresh: true,
  };
}

/** End the open batch's hold, and any wait for a fix: its checks run again, or it was combined again. */
export function release(record: BatchRecord): BatchRecord {
  if (!record.open?.hold) return record;
  const { hold: _hold, awaits: _awaits, ...open } = record.open;
  return { ...record, open };
}

/**
 * The record after the open batch merged: each member's receipt, naming its
 * own commit on the default branch where one was read, and no open batch.
 */
export function merged(
  record: BatchRecord,
  landed: ReadonlyMap<string, string | undefined>,
  at: number,
): BatchRecord {
  const { open, finished: _finished, ...rest } = record;
  if (!open || open.number === undefined) return record;
  const number = open.number;
  // A rebuild told on this batch stands once it merged carrying each change the crewmate was
  // told about, at that version: the version rebuilt on it goes first in the next batch.
  const carriedAll = (told: BatchRebuild) =>
    told.members.every((carried) =>
      open.members.some(
        (member) => member.taskId === carried.taskId && member.head === carried.head,
      ),
    );
  const rebuilds = record.rebuilds?.map((told) =>
    told.branch === open.branch && carriedAll(told) ? { ...told, merged: true as const } : told,
  );
  return {
    ...rest,
    ...(rebuilds ? { rebuilds } : {}),
    ...finishedWith(record, open, "merged", at),
    receipts: [
      ...record.receipts.filter(
        (entry) => !open.members.some((member) => member.taskId === entry.taskId),
      ),
      ...open.members.map((member) => {
        const sha = landed.get(member.taskId);
        return {
          taskId: member.taskId,
          head: member.head,
          ...(sha ? { sha } : {}),
          number,
          ...(open.url !== undefined ? { url: open.url } : {}),
          at,
        };
      }),
    ],
  };
}

/**
 * The record after its open batch's pull request was closed without a
 * merge where the project lives: the members go back to the front of the
 * line, in their order, and the next batch forms from it.
 */
export function reopened(record: BatchRecord, at?: number): BatchRecord {
  const { open, finished, ...rest } = record;
  if (!open) return record;
  return {
    ...rest,
    ...(at !== undefined ? finishedWith(record, open, "closed", at) : finished ? { finished } : {}),
    line: [...open.members.map(asChange), ...record.line],
  };
}

/**
 * The record after every member of its open batch was withdrawn and its
 * pull request closed: no open batch, and the batch kept as closed.
 */
export function abandoned(record: BatchRecord, at: number): BatchRecord {
  const { open, finished: _finished, ...rest } = record;
  if (!open) return record;
  return { ...rest, ...finishedWith(record, open, "closed", at) };
}

/**
 * The record's batches that ended, with `open` ended at `at` as `outcome`,
 * and none that ended longer ago than `FINISHED_BATCH_KEPT_MS`. A batch
 * whose pull request was never confirmed ended nothing anyone could see.
 */
function finishedWith(
  record: BatchRecord,
  open: OpenBatch,
  outcome: FinishedBatch["outcome"],
  at: number,
): Pick<BatchRecord, "finished"> {
  const kept = finishedWithin(record.finished ?? [], at);
  const ended: FinishedBatch[] =
    open.number === undefined
      ? []
      : [
          {
            number: open.number,
            ...(open.url !== undefined ? { url: open.url } : {}),
            formed: open.since,
            ended: at,
            outcome,
            members: open.members.map(({ taskId, title }) => ({ taskId, title })),
            holds: open.holds ?? 0,
          },
        ];
  const finished = [...kept, ...ended];
  return finished.length ? { finished } : {};
}

/** The batches of `finished` that ended within `FINISHED_BATCH_KEPT_MS` of `now`. */
export function finishedWithin(finished: readonly FinishedBatch[], now: number): FinishedBatch[] {
  return finished.filter((batch) => now - batch.ended < FINISHED_BATCH_KEPT_MS);
}

/**
 * A left-out change's clash with a change ahead that ended; `rebuilt` when
 * its crewmate was told to rebuild it on the batch that merged, and that
 * rebuild stands (`rebuildStands`).
 */
export type EndedClash = {
  taskId: string;
  head: string;
  ahead: string;
  how: "merged" | "left";
  rebuilt?: true;
};

/**
 * The left-out changes whose clash with a change ahead ended: that change
 * merged with its batch (`merged`), or it is in neither the open batch nor
 * the line any more (`left`). A merged clash is now one with the default
 * branch, so the entry keeps its place under that reason and its crewmate
 * brings the branch up to date (`conflict`, the combine's words for it); a
 * clash that left drops the entry, so the change's kept approval puts the
 * same version back in line.
 */
export function clashesEnded(
  record: BatchRecord,
  conflict: string,
): {
  record: BatchRecord;
  ended: EndedClash[];
} {
  const ended: EndedClash[] = [];
  const leftOut = record.leftOut.flatMap((entry) => {
    const ahead = entry.ahead;
    if (!ahead) return [entry];
    if (record.receipts.some((receipt) => receipt.taskId === ahead)) {
      ended.push({
        taskId: entry.taskId,
        head: entry.head,
        ahead,
        how: "merged",
        ...(rebuildStands(record, entry) ? { rebuilt: true as const } : {}),
      });
      const { ahead: _ahead, ...rest } = entry;
      return [{ ...rest, reason: conflict }];
    }
    const waits =
      record.open?.members.some((member) => member.taskId === ahead) ||
      record.line.some((change) => change.taskId === ahead);
    if (waits) return [entry];
    ended.push({ taskId: entry.taskId, head: entry.head, ahead, how: "left" });
    return [];
  });
  return ended.length ? { record: { ...record, leftOut }, ended } : { record, ended };
}

/** The changes, by task and approved version, the open batch's version carries. */
function carriedBy(open: OpenBatch): BatchRebuild["members"] {
  return open.members.map(({ taskId, head }) => ({ taskId, head }));
}

/**
 * The record after a change that clashes with the open batch, left out of
 * it or waiting in line, had its crewmate told to rebuild it on the batch's
 * version (docs/forge.md, "A change rebuilt on an open batch"). `fresh` is
 * true only when the crewmate has not heard it for this version of the
 * change and the same changes in the batch, so it hears once; a left-out
 * entry at that version names the version it was told. The same record
 * with no open batch to rebuild on.
 */
export function toldRebuild(
  record: BatchRecord,
  change: Pick<BatchChange, "taskId" | "head">,
  at: number,
): { record: BatchRecord; fresh: boolean; told?: BatchRebuild } {
  const open = record.open;
  if (!open || open.members.length === 0) return { record, fresh: false };
  const members = carriedBy(open);
  const earlier = record.rebuilds?.find((entry) => entry.taskId === change.taskId);
  const same =
    earlier?.head === change.head &&
    earlier.branch === open.branch &&
    JSON.stringify(earlier.members) === JSON.stringify(members);
  const told: BatchRebuild =
    same && earlier
      ? earlier
      : {
          taskId: change.taskId,
          head: change.head,
          on: open.head,
          branch: open.branch,
          members,
          at,
        };
  const rebuild = { head: told.on, branch: told.branch };
  return {
    record: {
      ...record,
      rebuilds: [
        ...(record.rebuilds ?? []).filter((entry) => entry.taskId !== change.taskId),
        told,
      ],
      leftOut: record.leftOut.map((entry) =>
        entry.taskId === change.taskId && entry.head === change.head
          ? { ...entry, rebuild }
          : entry,
      ),
    },
    fresh: !same,
    told,
  };
}

/**
 * Whether the crewmate of `change` was already told to rebuild it on the
 * open batch as that batch stands now, so a pass need not try it again.
 */
export function rebuildTold(record: BatchRecord, change: Pick<BatchChange, "taskId" | "head">) {
  const open = record.open;
  const earlier = record.rebuilds?.find((entry) => entry.taskId === change.taskId);
  return (
    !!open &&
    earlier?.head === change.head &&
    earlier.branch === open.branch &&
    JSON.stringify(earlier.members) === JSON.stringify(carriedBy(open))
  );
}

/**
 * The rebuild told for `change` at its version, once the batch it named
 * merged carrying each change the crewmate was told about (`merged`): the
 * clashing version waits for the version rebuilt on it, in no batch, until
 * the task closes or a new version takes its place.
 */
export function rebuildStands(
  record: BatchRecord,
  change: Pick<BatchChange, "taskId" | "head">,
): boolean {
  const told = record.rebuilds?.find((entry) => entry.taskId === change.taskId);
  return told?.merged === true && told.head === change.head;
}

/**
 * The batch version a repair declared as its new base, as the line carries
 * it (`BatchChange.onBatch`): the version its crewmate was told to rebuild
 * on, or the open batch's version as it is now, with the changes that
 * version carries other than the task's own. Undefined for any other
 * version, such as a commit of the default branch.
 */
export function builtOnBatch(
  record: BatchRecord,
  taskId: string,
  on: string,
): BatchChange["onBatch"] | undefined {
  const told = record.rebuilds?.find((entry) => entry.taskId === taskId && entry.on === on);
  const members = told?.members ?? (record.open?.head === on ? carriedBy(record.open) : undefined);
  const others = members?.filter((entry) => entry.taskId !== taskId);
  return others?.length ? { head: on, members: others } : undefined;
}

/**
 * The record with `taskId` recorded as the repair of its held batch
 * (`OpenBatch.repair`); the same record when no batch is held or that task
 * is recorded already.
 */
export function repaired(record: BatchRecord, taskId: string): BatchRecord {
  const open = record.open;
  if (!open?.hold || open.repair === taskId) return record;
  return { ...record, open: { ...open, repair: taskId } };
}

/**
 * Drop what only closed tasks still hold: a merged receipt once read, a
 * left-out note, a send-back, a declared fix, and the repair of the open
 * batch (`OpenBatch.repair`). A held batch that waited
 * for a repair whose task closed stays held with no owner of the wait
 * (`awaits` empty), until another repair's fix is approved or Try again.
 */
export function pruned(record: BatchRecord, live: (taskId: string) => boolean): BatchRecord {
  const receipts = record.receipts.filter((entry) => live(entry.taskId));
  const leftOut = record.leftOut.filter((entry) => live(entry.taskId));
  const sentBack = record.sentBack?.filter((entry) => live(entry.taskId));
  const rebuilds = record.rebuilds?.filter((entry) => live(entry.taskId));
  const fixes = record.fixes?.filter(live);
  const open = record.open;
  const orphaned = Boolean(open?.awaits) && !live(open?.awaits as string);
  const unrepaired = open?.repair !== undefined && !live(open.repair);
  if (
    receipts.length === record.receipts.length &&
    leftOut.length === record.leftOut.length &&
    sentBack?.length === record.sentBack?.length &&
    rebuilds?.length === record.rebuilds?.length &&
    fixes?.length === record.fixes?.length &&
    !orphaned &&
    !unrepaired
  )
    return record;
  const { sentBack: _sentBack, rebuilds: _rebuilds, ...rest } = record;
  let kept = open;
  if (kept && orphaned) kept = { ...kept, awaits: "" };
  if (kept && unrepaired) {
    const { repair: _repair, ...without } = kept;
    kept = without;
  }
  const next = {
    ...rest,
    receipts,
    leftOut,
    ...(sentBack?.length ? { sentBack } : {}),
    ...(rebuilds?.length ? { rebuilds } : {}),
    ...(kept && kept !== open ? { open: kept } : {}),
  };
  return fixes?.length === record.fixes?.length
    ? next
    : unfixed({ ...next, fixes: fixes ?? [] }, []);
}
