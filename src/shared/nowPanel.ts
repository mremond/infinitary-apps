import * as m from "./i18n/messages.generated.ts";
import { taskStatusOf } from "./taskPresentation";
import type { TaskView } from "./tasks";

/**
 * The now panel's one rule (task-system design section 10, P4): which
 * board rows the panel shows and under which group. The Tasks panel, an
 * ordinary panel folder (src/panels/now/), reads it from the panel library
 * (`@infinitary/ui`), as its board's lanes do and as any panel that draws
 * tasks may; the record card's meta line names a row's state in the same
 * words.
 *
 * Five groups, in the order the panel lists them - nearest to happening
 * first. The kanban board (FI3-979) names its row and columns with the same
 * five words.
 *
 * - `waiting` - a live task with a reachable ready decision. Rows shown by default.
 * - `working` - active, whether still working or idle with unmerged work.
 *               Rows shown by default. A task still starting is not here.
 *               The panel lists a working task's live tree beside it
 *               (`nowGroupsOf`); its finished parts stay under `landed`.
 * - `queued`  - open work that starts by itself when nothing holds it (start
 *               policy when-ready), blocked or held included, and a task
 *               that is starting until its crewmate begins.
 * - `backlog` - open work that waits for the captain's word (start policy
 *               on-request), blocked or held included, and started work
 *               that went back to the backlog (INF-2062) with its work kept.
 * - `landed`  - done work within the board's recent window.
 *
 * Deliberately outside the panel: dropped rows (history, one detail read
 * away), and closed question/operation rows - an answered question or a
 * finished fleet operation is not landed work, and every plain captain turn
 * files one (P1), so listing them would bury the rail in chit-chat.
 *
 * The panel itself (src/panels/now/panel.tsx) imports this rule rather
 * than restating it, and tests/e2e/now-panel.spec.ts pins that what it
 * paints agrees with the board the window holds.
 */

export const NOW_GROUPS = ["waiting", "working", "queued", "backlog", "landed"] as const;
export type NowGroup = (typeof NOW_GROUPS)[number];

/** The group's label as the panel prints it. */
export const NOW_GROUP_LABELS: Record<NowGroup, string> = {
  waiting: "waiting on you",
  working: "working",
  queued: "queued",
  backlog: "backlog",
  landed: "done · 7d",
};

/**
 * Each group's name as a person reads it, in the process's language: the panel's headers and the phone's.
 * `NOW_GROUP_LABELS` keeps the English the app's own commands answer.
 */
export const NOW_GROUP_TITLES: Readonly<Record<NowGroup, string>> = {
  get waiting() {
    return m.taskGroupWaiting();
  },
  get working() {
    return m.taskGroupWorking();
  },
  get queued() {
    return m.taskGroupQueued();
  },
  get backlog() {
    return m.taskGroupBacklog();
  },
  get landed() {
    return m.taskGroupLanded();
  },
};

/**
 * What the grouping reads of a task: a board row of the app's own, or the
 * one a panel reads (`PanelTaskRow`).
 */
export type NowGroupInput = Pick<
  TaskView,
  | "kind"
  | "status"
  | "requiredAction"
  | "waitingCardId"
  | "minimizedCardId"
  | "answerNoteId"
  | "captainWait"
  | "startPolicy"
  | "startAttempt"
  | "activity"
> &
  Partial<Pick<TaskView, "backlogSince" | "workPosture">>;

export function nowCountGroupOf(task: NowGroupInput): NowGroup | null {
  const group = nowGroupOf(task);
  // Quiet contributions stay in their existing list without inflating its working count.
  return group === "working" && task.workPosture?.state === "idle" && task.workPosture.maintainers
    ? null
    : group;
}

export function nowGroupOf(task: NowGroupInput): NowGroup | null {
  if (task.answerNoteId || task.minimizedCardId) return "waiting";
  if (task.requiredAction && (task.status === "open" || task.status === "active")) return "waiting";
  // A task that is starting (a start attempt preparing or checking, or a
  // claimed row whose crewmate has not begun) is queued until it begins; a
  // ready decision still outranks that.
  if (
    (task.startAttempt?.phase === "preparing" ||
      task.startAttempt?.phase === "checking" ||
      (task.status === "active" && task.activity === "starting")) &&
    task.status !== "done" &&
    task.status !== "dropped" &&
    !task.waitingCardId
  ) {
    return "queued";
  }
  switch (task.status) {
    case "dropped":
      return null;
    case "done":
      return task.kind === "work" || task.requiredAction ? "landed" : null;
    case "active":
      return task.waitingCardId
        ? "waiting"
        : task.backlogSince !== undefined
          ? "backlog"
          : "working";
    case "open":
      if (task.waitingCardId) return "waiting";
      return task.startPolicy === "on-request" ? "backlog" : "queued";
  }
}

type PlacedTask = NowGroupInput & Pick<TaskView, "id" | "parentId">;

/**
 * Resolve each task's visible group, keeping a working parent tree together.
 * The tree is live work only: a closed task - a finished review, plan or part
 * - keeps its own group and does not hold the tree together, so Working never
 * lists finished work (the captain: "remove already-done tasks from the
 * 'working' section").
 */
export function nowGroupsOf(board: { tasks: readonly PlacedTask[] }): Map<string, NowGroup | null> {
  const byId = new Map(board.tasks.map((task) => [task.id, task]));
  const live = (task: PlacedTask | undefined) =>
    task && task.status !== "done" && task.status !== "dropped" ? task : undefined;
  const liveParentOf = (task: PlacedTask) =>
    task.parentId ? live(byId.get(task.parentId)) : undefined;
  const workingTrees = new Set<string>();
  for (const task of board.tasks) {
    if (nowGroupOf(task) !== "working") continue;
    for (let member = live(task); member; member = liveParentOf(member)) {
      workingTrees.add(member.id);
    }
  }
  for (const task of board.tasks) {
    if (!live(task)) continue;
    for (let member = liveParentOf(task); member; member = liveParentOf(member)) {
      if (workingTrees.has(member.id)) {
        workingTrees.add(task.id);
        break;
      }
    }
  }
  return new Map(
    board.tasks.map((task) => {
      const group = nowGroupOf(task);
      return [
        task.id,
        workingTrees.has(task.id) && group !== null && group !== "waiting" ? "working" : group,
      ];
    }),
  );
}

/**
 * A row's state in one or two words, for the record card's meta line.
 * Delegates to the shared lifecycle reading; grouping is not a status.
 */
export function taskStatusWord(task: TaskView): string {
  return taskStatusOf(task).word;
}

/** Tasks whose last manual start failed and still shows that notice. */
export function couldNotStart(task: Pick<TaskView, "startNotice">): boolean {
  return task.startNotice != null;
}
