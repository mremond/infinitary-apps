import { allowanceResetOf, BATCH_CHECK, isRedCheckState } from "../forge";
import type { InboxStore } from "../storage/inboxStore";
import type { CiWatch, TaskRecord } from "../storage/taskRecords";
import { TaskService } from "../tasks/taskService";
import {
  type CoveredFailure,
  coveredNextStep,
  coveringApproval,
  keptApprovalLine,
} from "./mergeAuthorization";
import type { TypedWake, WakeFacts } from "./wakes";

/**
 * The check watch (docs/forge.md, "The check watch"): the host reads a
 * change's checks for the crewmate with plain forge calls - no model turn -
 * and wakes it once when they finish. It replaces a crewmate re-reading
 * `check_change` until its checks settle, a full-context model turn per read.
 *
 * - Armed by a reading that finds the checks running (`ChangeChecks`), on a
 *   host whose forge has checks (`Forge.hasChecks`); a host without them is
 *   never watched, and the crewmate is told so.
 * - Durable: the watch is a delivery fact on the task (`ciWatch`), so it
 *   outlives a restart and ends with the task.
 * - Bound to the change's head: a new push the watch sees re-arms it for
 *   the new head, and only the head it last saw is ever woken about.
 * - A standing watch has two notices: the first red check while others still
 *   run, then the end - passed, failed with the red checks named, still
 *   running at the bound, the change gone, or the checks unreadable.
 *   Each is named by the watch (`once`), so the inbox never queues it
 *   twice, even across a restart between the wake and the clear. A read
 *   that first sees a failure and also sees the checks finished sends
 *   only the end wake.
 * - Bounded: it reads on the shared tick, every minute for ten minutes
 *   and then every two, and stops at `CHECK_WATCH_BOUND_MS`.
 * - Finished checks on live pull requests refresh quietly every five minutes
 *   through the same reader, and on the first tick after the crewmate's
 *   turn ends, since that turn may have pushed a new version.
 *   Changed observations reach the crew for judgment.
 *   Only a running new head arms another watch.
 *   A task idle behind another task is not refreshed while it waits.
 *
 * While a watch stands the crewmate is waiting on the host, so the idle
 * ladder reads the task as moving (`Witnesses.checksWatched`).
 */

/** How long a watch reads one head before it wakes the crewmate that its checks are still running. */
export const CHECK_WATCH_BOUND_MS = 2 * 60 * 60 * 1000;

/** How long finished checks on a live pull request stand before the quiet refresh reads them again. */
export const CHECK_REFRESH_MS = 5 * 60_000;

/** How many reads stay one minute apart before the watch slows to every two minutes. */
export const CHECK_WATCH_FAST_READS = 10;

/** The pause before each of the first `CHECK_WATCH_FAST_READS` reads. */
export const CHECK_WATCH_FAST_MS = 60_000;

/** The pause before each later read, through the two-hour bound. */
export const CHECK_WATCH_SLOW_MS = 2 * 60_000;

export function checkWatchDelay(tries: number): number {
  return tries < CHECK_WATCH_FAST_READS ? CHECK_WATCH_FAST_MS : CHECK_WATCH_SLOW_MS;
}

/**
 * The watch a reading of running checks at `head` leaves: the one already
 * standing on that head keeps its start (its bound counts from the first
 * reading), and any other head starts a new watch.
 */
export function armWatch(existing: CiWatch | undefined, head: string, now: number): CiWatch {
  if (existing?.head === head) return existing;
  return { head, since: now, nextAt: now + checkWatchDelay(0), tries: 0 };
}

/** The name one watch event goes out under: the head, when it began there, and which wake. */
export function checkWatchOnce(watch: CiWatch, event: "failure" | "end" = "end"): string {
  return `check-watch:${watch.head}:${watch.since}:${event}`;
}

/** The end-wake name a build before the early wake used, so a restart does not send it twice. */
function legacyEndOnce(watch: CiWatch): string {
  return `check-watch:${watch.head}:${watch.since}`;
}

/** A check a wake names; `manual` waits for a person to start it and holds. */
export type WatchedCheck = { name: string; state: string; manual?: boolean };

/**
 * What one read of a watched change found (`ChangeChecks.readWatched`).
 * Every reading but a failed read is already recorded on the task; a
 * failed read says so when it was (`recorded`).
 */
export type WatchedReading =
  | {
      kind: "pending";
      observationId?: string;
      head: string;
      change: string;
      pending: WatchedCheck[];
      /**
       * A complete reading where no check that holds ran: none reported, or
       * every one skipped or advisory.
       */
      noneStarted?: boolean;
      /** Red checks seen while others still run. Absent when none are red. */
      failing?: WatchedCheck[];
      /**
       * The version still waits in the project's batch: what the app knows
       * of that batch, for the bound's wake.
       */
      batch?: string;
    }
  | {
      kind: "finished";
      observationId?: string;
      head: string;
      change: string;
      checks: WatchedCheck[];
    }
  | { kind: "gone" }
  | {
      kind: "failed";
      transient: boolean;
      problem: string;
      signIn?: boolean;
      /**
       * The host's allowance is spent and comes back at this time (epoch
       * ms): the watch keeps standing and reads again then (INF-2149).
       */
      retryAt?: number;
      observationId?: string;
      /** The reading was recorded on the task before its checks proved unreadable. */
      recorded?: boolean;
    };

export type CheckWatcherHost = {
  tasks: TaskService;
  inbox: Pick<InboxStore, "woken">;
  /** Read the watched change's checks where the project lives. */
  read(taskId: string): Promise<WatchedReading>;
  /**
   * The task stands idle behind another task, nothing else moving it or
   * before the captain (`WorkPostures.workPosture`'s `dependency`): its
   * finished checks are not refreshed while it waits. Absent = never.
   */
  idleBehindOtherWork?(record: TaskRecord): boolean;
  /**
   * Read new comments on the task's pull request and wake its crewmate once
   * about them (docs/forge.md, "Comments on a pull request"). Absent = none.
   */
  readComments?(taskId: string): Promise<void>;
  /** Read the task's named pull request and close it only on a confirmed external merge. */
  reconcileMerged?(taskId: string): Promise<boolean>;
  /** The supervisor's own steer on the task's durable lane. */
  steer(taskId: string, wake: TypedWake): Promise<unknown>;
  /**
   * Run the task's kept merge approval (INF-4018): the passed checks at a
   * version it covers send the crewmate no wake, so no turn's end runs it.
   */
  runKept?(taskId: string): void;
  /**
   * The task's change is its own pushed branch with no pull request, in a
   * project that merges in batches of its own (INF-6241): the watch reads it
   * after a turn, when a run watch starts and while its merge card waits on
   * the version. Absent = no branch-only change is read.
   */
  readsBranch?(record: TaskRecord): boolean;
  /**
   * A merge card of the task's own change waits under a captain's reply or
   * is held for its new version's checks (INF-6241): its branch is read on
   * every tick. Absent = none waits.
   */
  versionAwaited?(record: TaskRecord): boolean;
  /**
   * The crewmate's turn or one of its background jobs runs (INF-6241): a
   * read taken then can miss a push that work still makes, so the read
   * after that work ends is owed again. Absent = never working.
   */
  working?(record: TaskRecord): boolean;
};

type SettledWakeFacts = Extract<WakeFacts, { kind: "checks-settled" }>;
type SettledFacts = Omit<SettledWakeFacts, "kind">;

export class CheckWatcher {
  /** Tasks whose read is out now: a slow read is never doubled by the next tick. */
  private readonly reading = new Set<string>();
  /**
   * When a pass last read a task without recording a reading: a failed
   * read, an allowance wait or a merge confirmation alone backs off here,
   * and a restart may try again on its first tick. A pass whose read
   * recorded a reading drops its mark, so that reading's own time is the
   * one clock the quiet refresh counts from.
   */
  private readonly refreshAfter = new Map<string, number>();
  /**
   * Tasks whose newest read started while their crewmate still worked
   * (`working`): that read settles nothing about a push, so one is owed
   * once the work ends. In memory: a restart ends every job and turn.
   */
  private readonly readWhileWorking = new Set<string>();

  constructor(private readonly host: CheckWatcherHost) {}

  /** One pass on the shared tick: every watch that is due reads once. */
  async poll(now: number): Promise<void> {
    const due = this.host.tasks.listLive().filter((record) => this.due(record, now));
    await Promise.all(due.map((record) => this.pollGuarded(record, now)));
  }

  /**
   * Read the task now when the read after its crewmate's turn is still owed
   * (`afterTurnReadOwed`): a merge card held for that read (INF-6241) then
   * waits for one forge read, not for the next tick. Answers whether this
   * call read: a read already out answers false at once, and the pass that
   * started it rechecks when it ends, so a caller that rechecks on true
   * never loops on a read that has not come back.
   */
  async readAfterTurn(taskId: string, now: number): Promise<boolean> {
    const record = this.host.tasks.get(taskId);
    if (!record || TaskService.isClosed(record) || this.reading.has(taskId)) return false;
    if (!this.afterTurnReadOwed(record)) return false;
    await this.pollGuarded(record, now);
    return true;
  }

  /**
   * Whether the read after the crewmate's newest turn has not finished
   * (INF-3092, INF-6241): that turn may have pushed a new version from its
   * shell, which tells the app nothing until the change is read. A read
   * that failed counts as done, so a failure holds nothing.
   */
  afterTurnReadOwed(record: TaskRecord): boolean {
    if (this.reading.has(record.id)) return true;
    if (!this.watchesChange(record) || !this.refreshesChecks(record)) return false;
    return this.turnSince(record);
  }

  private due(record: TaskRecord, now: number): boolean {
    if (this.reading.has(record.id)) return false;
    const delivery = record.delivery;
    // A standing watch also reads at once after a turn, which may have
    // pushed past the head it watches.
    if (delivery?.ciWatch)
      return (
        delivery.ciWatch.nextAt <= now || (this.turnSince(record) && this.refreshesChecks(record))
      );
    if (delivery?.prNumber === undefined) {
      // A branch-only change has no merge to confirm and no quiet refresh:
      // it is read when a turn ends, when a run starts on it, and each tick
      // while its merge card waits on the version.
      if (!this.watchesChange(record) || !this.refreshesChecks(record)) return false;
      const lastRead = this.lastRead(record);
      return (
        this.turnSince(record) ||
        (delivery?.runWatches ?? []).some((watch) => watch.since > lastRead) ||
        (this.host.versionAwaited?.(record) === true && now >= lastRead + CHECK_WATCH_FAST_MS)
      );
    }
    // A named pull request stays monitored until the task closes. Only
    // its checks skip refresh behind another task (INF-721 friction 6);
    // its merge can still be confirmed without starting a model turn.
    // A crewmate's turn that ended after the last read is read on the next
    // tick (INF-3092), so an open merge card never stands on the earlier
    // version's checks until the quiet refresh comes due.
    return (
      (this.turnSince(record) || now >= this.lastRead(record) + CHECK_REFRESH_MS) &&
      (this.host.reconcileMerged !== undefined || this.refreshesChecks(record))
    );
  }

  /** A named pull request, or a branch-only change the app reads (`readsBranch`). */
  private watchesChange(record: TaskRecord): boolean {
    const delivery = record.delivery;
    if (delivery?.ciWatch || delivery?.prNumber !== undefined) return true;
    return this.host.readsBranch?.(record) === true;
  }

  private lastRead(record: TaskRecord): number {
    return Math.max(record.delivery?.ciAt ?? 0, this.refreshAfter.get(record.id) ?? 0);
  }

  /** The crewmate's turn ended, or its work ended, after the newest read. */
  private turnSince(record: TaskRecord): boolean {
    if (record.idleSince != null && record.idleSince > this.lastRead(record)) return true;
    return this.readWhileWorking.has(record.id) && this.host.working?.(record) !== true;
  }

  private pollGuarded(record: TaskRecord, now: number): Promise<void> {
    return this.pollRecord(record, now).catch((caught: unknown) => {
      // One task's bookkeeping failing never stops the others' reads.
      console.warn("[crew] check watch could not read a task:", caught);
    });
  }

  private refreshesChecks(record: TaskRecord): boolean {
    return (
      record.delivery?.ci !== "merged" &&
      record.delivery?.ci !== "no-pr" &&
      this.host.idleBehindOtherWork?.(record) !== true
    );
  }

  /** Merge facts outlive check watches, captain choices, dependencies and app restarts. */
  private async pollRecord(record: TaskRecord, now: number): Promise<void> {
    this.reading.add(record.id);
    this.refreshAfter.set(record.id, now);
    if (this.host.working?.(record) === true) this.readWhileWorking.add(record.id);
    else this.readWhileWorking.delete(record.id);
    try {
      if (record.delivery?.prNumber !== undefined && this.host.reconcileMerged) {
        try {
          if (await this.host.reconcileMerged(record.id)) return;
        } catch (caught) {
          // A spent allowance: every read waits for the host's reset (INF-2149).
          const resetAt = allowanceResetOf(caught);
          if (resetAt === undefined) throw caught;
          this.waitForAllowance(record.id, resetAt, now);
          return;
        }
      }
      const after = this.host.tasks.get(record.id);
      if (!after || TaskService.isClosed(after)) return;
      // A comment reading that fails, a spent allowance included, waits for a later pass.
      if (after.delivery?.prNumber !== undefined)
        await this.host.readComments?.(record.id).catch((caught: unknown) => {
          console.warn("[crew] could not read a pull request's comments:", caught);
        });
      if (after.delivery?.ciWatch) await this.pollTask(record.id, now);
      else if (this.refreshesChecks(after)) await this.refreshTask(record.id, now);
    } finally {
      this.reading.delete(record.id);
    }
  }

  private async refreshTask(taskId: string, now: number): Promise<void> {
    const head = this.host.tasks.get(taskId)?.delivery?.headSha;
    const read = await this.host.read(taskId);
    this.readRecorded(taskId, read);
    const after = this.host.tasks.get(taskId);
    if (!after || TaskService.isClosed(after) || after.delivery?.ciWatch) return;
    if (read.kind === "failed" && read.retryAt !== undefined) {
      this.waitForAllowance(taskId, read.retryAt, now);
      return;
    }
    // A new push whose checks are running gets the existing bounded watch.
    // On a branch-only change a reading with nothing running - no check
    // started, or each waiting for a person - arms none (INF-6241): nothing
    // would end it but its bound.
    if (
      read.kind === "pending" &&
      read.head !== head &&
      (after.delivery?.prNumber !== undefined || runningCheck(read))
    ) {
      this.host.tasks.delivery.recordChangeEvidence(taskId, {
        ciWatch: armWatch(undefined, read.head, now),
      });
      // Its armed watch owns the next failure/finish notice, not a second initial wake.
      return;
    }
    const observation = after.delivery?.ciObservation;
    if (
      (read.kind === "finished" || read.kind === "pending" || read.kind === "failed") &&
      observation &&
      observation.id === read.observationId &&
      !observation.forwarded
    ) {
      const once = observation.notice ?? `check-observation:${observation.id}`;
      this.notifyObservation(
        taskId,
        {
          facts:
            read.kind === "failed"
              ? { kind: "checks-settled", outcome: "unreadable", problem: read.problem }
              : {
                  kind: "checks-settled",
                  outcome: "observed",
                  head: read.head,
                  change: read.change,
                  checks:
                    read.kind === "finished"
                      ? read.checks
                      : [...read.pending, ...(read.failing ?? [])],
                },
          once,
        },
        observation.id,
      );
    }
  }

  /**
   * A read that recorded its reading on the task needs no back-off of its
   * own: the reading's time, written as it was read, is never earlier than
   * this pass's mark, and a later write to it is what the next pass reads.
   */
  private readRecorded(taskId: string, read: WatchedReading): void {
    if (read.kind !== "failed" || read.recorded === true) this.refreshAfter.delete(taskId);
  }

  private forwardedObservation(taskId: string, id: string | undefined): void {
    const current = this.host.tasks.get(taskId)?.delivery?.ciObservation;
    if (id && current?.id === id && !current.forwarded)
      this.host.tasks.delivery.recordChangeEvidence(taskId, {
        ciObservation: { ...current, forwarded: true },
      });
  }

  /**
   * A notice about a version the captain's standing approval covers
   * (INF-4018): with every check passed nothing is left for the crewmate to
   * do, so none goes out (undefined) and the caller runs the approval in its
   * place; any other notice carries the approval's line and what clears it,
   * the words its merge card refusal gives, so the crewmate never asks for
   * a merge it already has.
   */
  private withApproval(taskId: string, facts: SettledWakeFacts): SettledWakeFacts | undefined {
    const record = this.host.tasks.get(taskId);
    const kept = coveringApproval(record, facts.head ?? record?.delivery?.headSha);
    // A pull request merged outside the app leaves nothing for the approval
    // to merge or repair (INF-4161): the notice stays as it is, and the
    // crewmate's check_change reads the merge.
    if (!kept || record?.delivery?.ci === "merged") return facts;
    const passed =
      (facts.outcome === "finished" || facts.outcome === "observed") &&
      (facts.checks ?? []).every(
        (check) =>
          check.state !== "pending" &&
          check.manual !== true &&
          !isRedCheckState(check.state as Parameters<typeof isRedCheckState>[0]),
      );
    if (passed) return undefined;
    const red = (facts.checks ?? []).filter((check) =>
      isRedCheckState(check.state as Parameters<typeof isRedCheckState>[0]),
    );
    const failure: CoveredFailure =
      red.length === 0
        ? "none"
        : red.some((check) => check.name === BATCH_CHECK)
          ? "batch"
          : "checks";
    return { ...facts, approval: `${keptApprovalLine(kept)} ${coveredNextStep(kept, failure)}` };
  }

  /** Persist the notice identity before enqueue; a restart reads its inbox receipt. */
  private notifyObservation(taskId: string, given: TypedWake, id: string | undefined): void {
    const facts =
      given.facts?.kind === "checks-settled" ? this.withApproval(taskId, given.facts) : given.facts;
    if (!facts) {
      this.forwardedObservation(taskId, id);
      this.host.runKept?.(taskId);
      return;
    }
    const wake = { ...given, facts };
    const current = this.host.tasks.get(taskId)?.delivery?.ciObservation;
    if (id && current?.id === id && wake.once && current.notice !== wake.once)
      this.host.tasks.delivery.recordChangeEvidence(taskId, {
        ciObservation: { ...current, notice: wake.once, forwarded: false },
      });
    if (wake.once && this.host.inbox.woken(taskId, wake.once)) {
      this.forwardedObservation(taskId, id);
      return;
    }
    void this.host
      .steer(taskId, wake)
      .then(() => {
        if (wake.once && this.host.inbox.woken(taskId, wake.once))
          this.forwardedObservation(taskId, id);
      })
      .catch((caught: unknown) => console.warn("[crew] check observation not forwarded:", caught));
  }

  private async pollTask(taskId: string, now: number): Promise<void> {
    const watch = this.watchOf(taskId);
    if (!watch) return;
    // Its wake already went out - the app stopped between the wake and the
    // clear: the watch is over.
    if (
      this.host.inbox.woken(taskId, checkWatchOnce(watch, "end")) ||
      this.host.inbox.woken(taskId, legacyEndOnce(watch))
    ) {
      this.clear(taskId);
      return;
    }
    let read: WatchedReading;
    try {
      read = await this.host.read(taskId);
      this.readRecorded(taskId, read);
    } catch (caught) {
      const retryAt = allowanceResetOf(caught);
      read = {
        kind: "failed",
        transient: true,
        problem: caught instanceof Error ? caught.message : String(caught),
        ...(retryAt !== undefined ? { retryAt } : {}),
      };
    }
    // The task closed while the read was out: nothing wakes a closed task.
    const after = this.host.tasks.get(taskId);
    if (!after || TaskService.isClosed(after)) return;
    // A reading taken meanwhile re-armed or ended the watch: that one is in charge.
    if (!sameWatch(after.delivery?.ciWatch, watch)) return;
    // A new push re-arms the watch for the new head.
    const current =
      (read.kind === "pending" || read.kind === "finished") && read.head !== watch.head
        ? { head: read.head, since: now, nextAt: now, tries: 0 }
        : watch;
    const inBound = now - current.since < CHECK_WATCH_BOUND_MS;
    switch (read.kind) {
      case "pending": {
        if (!inBound) {
          return this.end(
            taskId,
            current,
            {
              outcome: "timed-out",
              change: read.change,
              head: read.head,
              checks: read.pending,
              waitedMs: now - current.since,
              ...(read.noneStarted ? { noneStarted: true } : {}),
              ...(read.batch ? { batch: read.batch } : {}),
            },
            read.observationId,
          );
        }
        const next = await this.noteFailure(taskId, watch, current, read);
        if (!next) return;
        return this.readAgain(taskId, watch, next, now);
      }
      case "finished":
        return this.end(
          taskId,
          current,
          {
            outcome: "finished",
            change: read.change,
            head: read.head,
            checks: read.checks,
          },
          read.observationId,
        );
      case "gone":
        return this.end(taskId, current, { outcome: "gone" });
      case "failed":
        // A host hiccup is not a verdict: read again, inside the bound.
        if (read.transient && inBound)
          return this.readAgain(taskId, watch, current, now, read.retryAt);
        return this.end(
          taskId,
          current,
          {
            outcome: "unreadable",
            problem: read.problem,
            ...(read.signIn ? { signIn: true } : {}),
          },
          read.observationId,
        );
    }
  }

  /**
   * The first red check on this head, while others still run: one steer,
   * then the watch keeps reading. A turn that already replaced the watch
   * keeps that replacement.
   */
  private async noteFailure(
    taskId: string,
    started: CiWatch,
    watch: CiWatch,
    read: Extract<WatchedReading, { kind: "pending" }>,
  ): Promise<CiWatch | undefined> {
    const failing = read.failing ?? [];
    if (watch.failureSeen || failing.length === 0) return watch;
    const once = checkWatchOnce(watch, "failure");
    if (!this.host.inbox.woken(taskId, once)) {
      try {
        const facts = this.withApproval(taskId, {
          kind: "checks-settled",
          outcome: "first-failure",
          change: read.change,
          head: read.head,
          checks: failing,
        });
        if (facts) await this.host.steer(taskId, { facts, once });
      } catch (caught) {
        console.warn("[crew] check watch's early steer not delivered:", caught);
      }
    }
    const standing = this.watchOf(taskId);
    if (!standing) return undefined;
    const same = (candidate: CiWatch) =>
      candidate.head === standing.head && candidate.since === standing.since;
    if (!same(started) && !same(watch)) return undefined;
    return { ...watch, failureSeen: true };
  }

  /**
   * Schedule the next read. `started` is the watch this poll began with;
   * a replacement that is neither that watch nor the one being written
   * keeps the replacement.
   */
  private readAgain(
    taskId: string,
    started: CiWatch,
    watch: CiWatch,
    now: number,
    notBefore = 0,
  ): void {
    const standing = this.watchOf(taskId);
    if (!standing) return;
    const same = (a: CiWatch) => a.head === standing.head && a.since === standing.since;
    if (!same(started) && !same(watch)) return;
    const sameHead = standing.head === watch.head && standing.since === watch.since;
    this.host.tasks.delivery.recordChangeEvidence(taskId, {
      ciWatch: {
        ...watch,
        ...(watch.failureSeen || (sameHead && standing.failureSeen) ? { failureSeen: true } : {}),
        tries: watch.tries + 1,
        nextAt: Math.max(now + checkWatchDelay(watch.tries + 1), notBefore),
      },
    });
  }

  /**
   * The host's allowance is spent until `resetAt`: a standing watch keeps
   * standing and its next read waits for the reset; a quiet refresh waits
   * the same. Nothing wakes the crewmate for a wait (INF-2149).
   */
  private waitForAllowance(taskId: string, resetAt: number, now: number): void {
    const watch = this.watchOf(taskId);
    if (watch) {
      this.host.tasks.delivery.recordChangeEvidence(taskId, {
        ciWatch: { ...watch, nextAt: Math.max(watch.nextAt, resetAt) },
      });
      return;
    }
    this.refreshAfter.set(taskId, Math.max(now, resetAt - CHECK_REFRESH_MS));
  }

  /**
   * The watch is over: one steer on the crewmate's lane, named by the watch
   * so the inbox queues it once, then the watch clears. The wait's end
   * opens a new idle episode, as a timed wait's does.
   */
  private end(taskId: string, watch: CiWatch, facts: SettledFacts, observationId?: string): void {
    const once = checkWatchOnce(watch);
    if (!this.host.inbox.woken(taskId, once)) this.host.tasks.turns.endIdle(taskId);
    this.notifyObservation(
      taskId,
      { facts: { kind: "checks-settled", ...facts }, once },
      observationId,
    );
    this.clear(taskId);
  }

  private clear(taskId: string): void {
    this.host.tasks.delivery.recordChangeEvidence(taskId, { ciWatch: undefined });
  }

  private watchOf(taskId: string): CiWatch | undefined {
    return this.host.tasks.get(taskId)?.delivery?.ciWatch;
  }
}

/** A check the reading saw running or queued, not one waiting for a person to start it. */
function runningCheck(read: Extract<WatchedReading, { kind: "pending" }>): boolean {
  return !read.noneStarted && read.pending.some((check) => check.manual !== true);
}

function sameWatch(a: CiWatch | undefined, b: CiWatch): boolean {
  return a?.head === b.head && a.since === b.since;
}
