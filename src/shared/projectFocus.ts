import { type NowGroupInput, nowCountGroupOf, nowGroupOf } from "./nowPanel";
import { closedLeftOutDone, type ProjectView, type TaskBoard, type TaskView } from "./tasks";

/**
 * The project focus (docs/project-focus.md): which projects get a pill in
 * the top bar, what each pill counts, and which saved focus still holds.
 * Pure, so the top bar, the stage and the tests read one rule.
 *
 * Waiting and working mean what the collapsed Tasks panel says: each task
 * counts once, by its own state (`nowCountGroupOf`), so a pill and the panel's
 * summary narrowed to its project always agree. A parent the Working group
 * lists only beside a working part is not working itself (FI3-1049).
 */

export type FocusProjectInput = Pick<ProjectView, "id" | "key" | "name" | "repo" | "archived">;

export type FocusTaskInput = NowGroupInput & Pick<TaskView, "projectId">;

/** One pill: a project, and how many of its tasks wait on the captain and work. */
export type ProjectPill = {
  id: string;
  key: string;
  name: string;
  waiting: number;
  working: number;
};

/** The pills and the totals the All projects pill shows. */
export type ProjectPills = {
  projects: ProjectPill[];
  waiting: number;
  working: number;
};

/**
 * Every project set up in Settings, in the task board's order, plus Scratch
 * (the project with no repository) and the app's own workspace (its repo of
 * kind `personal`) while each has a task the Tasks panel lists, counting the
 * Done rows a board read without its closed rows left out; an archived
 * project gets none (the captain's answer to INF-1091's question 8, and to
 * INF-1292's: one project of yours and an idle workspace leave nothing to
 * choose).
 */
export function projectPillsOf(board: {
  projects: readonly FocusProjectInput[];
  tasks: readonly FocusTaskInput[];
  closedLeftOut?: TaskBoard["closedLeftOut"];
}): ProjectPills {
  const counts = new Map<string, { waiting: number; working: number; listed: number }>();
  let waiting = 0;
  let working = 0;
  for (const task of board.tasks) {
    const group = nowGroupOf(task);
    if (group === null) continue;
    const entry = counts.get(task.projectId) ?? { waiting: 0, working: 0, listed: 0 };
    entry.listed += 1;
    const counted = nowCountGroupOf(task);
    if (counted === "waiting") {
      entry.waiting += 1;
      waiting += 1;
    } else if (counted === "working") {
      entry.working += 1;
      working += 1;
    }
    counts.set(task.projectId, entry);
  }
  const projects = board.projects
    .filter(
      (project) =>
        !project.archived &&
        ((project.repo !== null && project.repo.kind !== "personal") ||
          (counts.get(project.id)?.listed ?? 0) + closedLeftOutDone(board, project.id) > 0),
    )
    .map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      waiting: counts.get(project.id)?.waiting ?? 0,
      working: counts.get(project.id)?.working ?? 0,
    }));
  return { projects, waiting, working };
}

/** The pill shows only while there is a choice: two projects or more. */
export function pillShown(pills: ProjectPills): boolean {
  return pills.projects.length >= 2;
}

/**
 * The focus that holds: the saved one while its project still has a pill
 * and the pill shows; otherwise All projects (null). A removed or archived
 * project lets go of focus without anyone writing it.
 */
export function heldFocus(saved: string | null, pills: ProjectPills): string | null {
  if (saved === null || !pillShown(pills)) return null;
  return pills.projects.some((project) => project.id === saved) ? saved : null;
}

/** Tasks waiting on the captain in projects other than the focused one: the pill's tail. */
export function waitingElsewhere(pills: ProjectPills, focus: string | null): number {
  if (focus === null) return 0;
  const focused = pills.projects.find((project) => project.id === focus);
  return pills.waiting - (focused?.waiting ?? 0);
}

/** The pill's tail while focused: the captain's mono tail on INF-1091 (question 7). */
export function elsewhereWords(waiting: number): string {
  return `${waiting} waiting elsewhere`;
}

/**
 * Whether the focus holds a card back off the stack (the captain's answer to
 * INF-1091's question 2, "Hold other projects' cards back until focus
 * changes"): a card about another project's task. A card about no task -
 * the first mate's own, a sign-in, a notice - stays, and so does one whose
 * task the board does not place: before the board is read (`taskProjects`
 * null) nothing is held back, as Activity hides nothing then, so a board
 * that cannot be read never hides a card behind a pill that is not shown.
 */
export function holdsBack(
  card: { taskId?: string },
  focus: string | null,
  taskProjects: ReadonlyMap<string, string> | null,
): boolean {
  if (focus === null || card.taskId === undefined || taskProjects === null) return false;
  const project = taskProjects.get(card.taskId);
  return project !== undefined && project !== focus;
}
