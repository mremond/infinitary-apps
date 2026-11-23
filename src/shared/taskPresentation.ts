import { answerWaitWords } from "./cardLeave.ts";
import { formatDate, formatTime } from "./i18n/format.ts";
import * as m from "./i18n/messages.generated.ts";
import type { TaskView } from "./tasks";
import { workPostureLabel } from "./workPosture";

export type TaskStatus =
  | "backlog"
  | "queued"
  | "starting"
  | "working"
  | "idle"
  | "interrupted"
  | "waiting"
  | "done"
  | "dropped";
export type TaskStatusReading = {
  mark: TaskStatus;
  word: string;
  reason: string;
  /**
   * Its computer is out of reach: the mark keeps its shape in `--warn`
   * (docs/helper.md, "Runs on"). A computer connecting, or connected and
   * catching up, leaves the mark as it was.
   */
  outOfReach?: true;
  /**
   * Working that is a background wait (posture active, reason checks or
   * job): the same word and reason, drawn as the stage draws it (INF-676,
   * INF-1777) - a dot in a dashed accent ring, never Waiting on you's full
   * one; the dot is the accent for checks and ember for local work.
   * A pending batch replaces the dashes with two still accent arcs.
   */
  wait?: "checks" | "job" | "batch";
  /**
   * When the one wait it stands idle on was recorded (INF-38), when known:
   * the tile's second line and the summary's Blocked by name it. Absent for
   * several waits, an unknown time, and every other reading.
   */
  since?: number;
  /**
   * The tasks a started crewmate stands idle on (posture dependency), so the
   * Tasks row names them without reading the reason's words (INF-38).
   */
  waitsOn?: readonly string[];
};
/**
 * What a task's reading needs: a board row of the app's own, or the one a
 * panel reads (`PanelTaskRow`, whose closed reason is a plain string).
 */
export type TaskStatusInput = Pick<
  TaskView,
  | "status"
  | "activity"
  | "workPosture"
  | "startPolicy"
  | "flags"
  | "waitingCardId"
  | "captainWait"
  | "requiredAction"
  | "children"
  | "startAttempt"
  | "startNotice"
  | "place"
> &
  Partial<
    Pick<
      TaskView,
      | "blockedBy"
      | "blockedSince"
      | "waitChain"
      | "waitingCardMerges"
      | "queueWait"
      | "backlogSince"
      | "answerNoteId"
      | "answerSince"
    >
  > & {
    closedReason: string | null;
  };

/** The reason beside Backlog on started work that went back there (INF-2062). */
export const STARTED_BACKLOG_REASON = "Started · its work waits for your Start";

const words: Record<TaskStatus, string> = {
  backlog: "Backlog",
  queued: "Queued",
  starting: "Starting",
  working: "Working",
  idle: "Idle",
  interrupted: "Interrupted",
  waiting: "Waiting on you",
  done: "Done",
  dropped: "Dropped",
};

/**
 * Presentation only. Lifecycle and ready decisions take precedence over stale
 * activity. Open work reads by its start policy, the Tasks panel's Backlog
 * and Queued groups (src/shared/nowPanel.ts): Backlog waits for the
 * captain's word, Queued starts by itself; a blocker, a hold or a parent's
 * parts is the reason beside the word, never a different word. Open,
 * working or idle work whose computer is out of reach says so: its mark in
 * `--warn`, and its reason ("Mac mini is out of reach", or "Mac mini takes no new work" while it
 * is connected on an older Firstmate; "Mac mini is updating", with the mark as it was, while the
 * home follows its update; "Mac mini is connecting", with the mark as it was, while its
 * connection is being made; "Catching up with Mac mini since 12:57 PM", with the mark as it was,
 * while it is connected and this Mac has not yet caught up with the task) unless a blocker, a
 * hold or its parts already give one. An interruption, a start and a ready
 * decision keep their own reading.
 */
export function taskStatusOf(task: TaskStatusInput, now = Date.now()): TaskStatusReading {
  const reading = (mark: TaskStatus, reason: string): TaskStatusReading => ({
    mark,
    word: words[mark],
    reason: reason === words[mark] ? "" : reason,
  });
  const connecting = task.place?.reach === "connecting";
  // Its computer being updated reads updating whatever its reach (`computer-updating.md`).
  const updating = task.place?.reach !== undefined && task.place.updating === true;
  // Connected and catching up is in reach, not away from it (INF-1810 finding 7).
  const catchingUpSince =
    task.place?.reach === "in-reach" && !updating ? task.place.catchingUpSince : undefined;
  const away =
    task.place?.reach !== undefined &&
    (task.place.reach !== "in-reach" || catchingUpSince !== undefined || updating)
      ? task.place.name
      : null;
  const awayWords = updating
    ? m.taskStatusComputerUpdating({ computer: away ?? "" })
    : catchingUpSince !== undefined
      ? `Catching up with ${away} since ${waitRecordedTime(catchingUpSince, now)}`
      : connecting
        ? `${away} is connecting`
        : task.place?.noNewWork
          ? `${away} takes no new work`
          : `${away} is out of reach`;
  // Updating, connecting and catching up keep the mark as it was: only out of reach draws it in warn.
  const awayReading = (mark: TaskStatus, reason: string | null): TaskStatusReading => ({
    ...reading(mark, reason ?? awayWords),
    ...(updating || connecting || catchingUpSince !== undefined
      ? {}
      : { outOfReach: true as const }),
  });
  if (task.status === "done") {
    return reading(
      "done",
      task.requiredAction?.result ?? (task.closedReason === "answered" ? "Answered" : ""),
    );
  }
  if (task.status === "dropped") {
    return reading(
      "dropped",
      task.requiredAction?.result ?? (task.closedReason === "failed" ? "Failed" : ""),
    );
  }
  if (task.requiredAction)
    return reading(
      "waiting",
      task.requiredAction.state === "blocked" ? "Waiting for prerequisites" : "",
    );
  if (task.answerNoteId)
    return {
      ...reading(
        "waiting",
        task.answerSince !== undefined ? answerWaitWords(task.answerSince, now) : "Answer ready",
      ),
      ...(task.answerSince !== undefined ? { since: task.answerSince } : {}),
    };
  if (task.waitingCardId) {
    // Only the typed fact that the card settles with a merge names the merge.
    return reading(
      "waiting",
      task.waitingCardMerges ? "Waiting for your merge" : "A decision card is ready",
    );
  }
  // Preparation is not Working and not Idle. A ready decision above still wins.
  if (
    task.startAttempt?.phase === "preparing" ||
    task.startAttempt?.phase === "checking" ||
    (task.status === "active" && task.activity === "starting")
  ) {
    return reading("starting", "");
  }
  // Started work back in the backlog (INF-2062): Backlog, marked started, since it went.
  if (task.status === "active" && task.backlogSince !== undefined) {
    return { ...reading("backlog", STARTED_BACKLOG_REASON), since: task.backlogSince };
  }
  if (task.startNotice && (task.status === "open" || task.status === "active")) {
    const mark = task.startPolicy === "on-request" ? "backlog" : "queued";
    return reading(mark, "Could not start");
  }
  if (task.status === "open") {
    const mark = task.startPolicy === "on-request" ? "backlog" : "queued";
    if (task.queueWait) return reading(mark, task.queueWait.line);
    const parts = task.children.total;
    const holds = task.flags.blocked
      ? "Blocked by another task"
      : task.flags.held
        ? "Held"
        : parts > 0
          ? `Its ${parts} ${parts === 1 ? "part does" : "parts do"} the work`
          : null;
    if (away) return awayReading(mark, holds);
    return reading(
      mark,
      holds ?? (mark === "backlog" ? "Starts when you press Start" : "Starts by itself when ready"),
    );
  }
  const waits = task.blockedBy ?? [];
  const dependency = task.workPosture?.reason === "dependency" && waits.length > 0;
  // Where its wait stops, on a row that waits on work or reads as doing nothing (INF-5578 finding 4).
  const chain =
    task.status === "active" &&
    task.waitChain &&
    (dependency
      ? waits.length === 1 && waits[0] === task.waitChain.on
      : task.workPosture?.reason === "inactive" && !task.workPosture.atProvider)
      ? task.waitChain
      : undefined;
  const reason = chain
    ? waitChainWords(chain, now)
    : dependency
      ? dependencyWaitWords(waits)
      : task.workPosture
        ? workPostureLabel(task.workPosture)
        : task.activity === "running" || task.activity === "starting"
          ? "Working"
          : task.activity === "interrupted"
            ? "Work was interrupted"
            : "No continuing work";
  if (
    task.workPosture?.state === "active" ||
    (!task.workPosture && (task.activity === "running" || task.activity === "starting"))
  ) {
    if (away) return awayReading("working", null);
    const wait = task.workPosture?.state === "active" ? task.workPosture.reason : undefined;
    if (wait === "checks" && task.workPosture?.batch)
      return { ...reading("working", reason), wait: "batch" };
    return wait === "checks" || wait === "job"
      ? { ...reading("working", reason), wait }
      : reading("working", reason);
  }
  if (task.activity === "interrupted") return reading("interrupted", reason);
  if (away) return awayReading("idle", null);
  if (!dependency) return reading("idle", reason);
  const since = waits.length === 1 ? task.blockedSince?.[waits[0] ?? ""] : undefined;
  return { ...reading("idle", reason), waitsOn: waits, ...(since === undefined ? {} : { since }) };
}

/**
 * What a started task waits on, in one place for the tile, the crew summary
 * and the record (INF-38): the one task by its key, or how many. No one key
 * stands for several; the summary lists each.
 */
export function dependencyWaitWords(blockedBy: readonly string[]): string {
  return blockedBy.length === 1
    ? `Waiting on ${blockedBy[0]}`
    : `Waiting on ${blockedBy.length} tasks`;
}

/**
 * Where a started task's wait stops (INF-5578 finding 4): the task it waits
 * on, the last task in that line when it is another, and that task's hold -
 * the app update it waits for, or when it ends.
 */
export function waitChainWords(
  chain: NonNullable<TaskView["waitChain"]>,
  now = Date.now(),
): string {
  const { on, end } = chain;
  if (chain.update) return end ? m.taskWaitChainUpdate({ on, end }) : m.taskWaitOnUpdate({ on });
  if (chain.until !== undefined) {
    const time = waitRecordedTime(chain.until, now);
    return end ? m.taskWaitChainUntil({ on, end, time }) : m.taskWaitOnUntil({ on, time });
  }
  return end ? m.taskWaitChainVia({ on, end }) : m.taskWaitOn({ on });
}

/**
 * When a wait was recorded, in the person's local time: the time of day,
 * with the date in front when it was not today. Never when work stopped.
 */
export function waitRecordedTime(at: number, now: number): string {
  const date = new Date(at);
  const time = formatTime(date, { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date(now).toDateString()) return time;
  return `${formatDate(date, { month: "short", day: "numeric" })}, ${time}`;
}

export function taskStatusLabel(reading: TaskStatusReading): string {
  return reading.reason ? `${reading.word} · ${reading.reason}` : reading.word;
}
