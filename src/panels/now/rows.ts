import type { PanelSummaryPart, PanelTaskBoard, PanelTaskRow } from "@infinitary/contracts";
import {
  foldForSearch,
  NOW_GROUP_TITLES,
  NOW_GROUPS,
  type NowGroup,
  nowGroupOf,
  nowGroupsOf,
  taskStatusOf,
} from "@infinitary/ui";
import * as m from "./messages.generated";
import {
  foundOnWords,
  ROW_CATCHING_UP,
  ROW_REACH_WORDS,
  ROW_START_LABEL,
  ROW_TRY_AGAIN_LABEL,
  ROW_WORDS,
} from "./words";

/**
 * What the Tasks panel lists, and how each row reads (task-system design
 * section 10, P4; the design skill's NowPanel). Pure, so the panel
 * (./panel.tsx) renders it and a unit test reads it. Which group a row is
 * in is the app's shared rule, from the panel library (`nowGroupsOf`): the
 * same one the task board names its lanes by.
 */

export { NOW_GROUPS, type NowGroup };

/**
 * `earlier` is the search's own group (FI3-579 piece 3): closed work the
 * board does not list, found only by typed words. `pinned` is the panel's
 * own group at its top (INF-3127): every task the captain pinned, whatever
 * its state, with its parts under it. Neither is a board group, so the
 * shared rule the board and the phone read (`nowGroupOf`) keeps its five.
 */
export type PanelGroup = "pinned" | NowGroup | "earlier";

/** Every group the panel paints, in its order: Pinned first, Earlier last. */
export const PANEL_GROUPS: readonly PanelGroup[] = ["pinned", ...NOW_GROUPS, "earlier"];

export const PANEL_GROUP_LABELS: Readonly<Record<PanelGroup, string>> = {
  get pinned() {
    return m.nowPanelGroupPinned();
  },
  get waiting() {
    return NOW_GROUP_TITLES.waiting;
  },
  get working() {
    return NOW_GROUP_TITLES.working;
  },
  get queued() {
    return NOW_GROUP_TITLES.queued;
  },
  get backlog() {
    return NOW_GROUP_TITLES.backlog;
  },
  get landed() {
    return NOW_GROUP_TITLES.landed;
  },
  get earlier() {
    return m.nowPanelGroupEarlier();
  },
};

/** Groups whose rows show without a click. */
export const OPEN_BY_DEFAULT: ReadonlySet<PanelGroup> = new Set([
  "pinned",
  "waiting",
  "working",
  "queued",
  "earlier",
]);

/** How deep a child row indents at most. */
export const MAX_DEPTH = 3;

export type NowRow = {
  task: PanelTaskRow;
  group: PanelGroup;
  depth: number;
  /** Where a row in Pinned would list otherwise (INF-3127): its Start and wait line follow it. */
  home?: NowGroup | null;
};

export type NowFilter = { query: string; projectId: string | null };

type StartMarks = {
  startAttempt?: { phase: "preparing" | "checking" };
  startNotice?: { reason: string };
};

function startMarks(task: PanelTaskRow): StartMarks {
  return task as PanelTaskRow & StartMarks;
}

/**
 * The one dim word a row may carry. A crew filing reads "found on X"; work
 * waiting on its checks reads "checks", or "batch" for a pending batch status.
 */
export function wordOf(task: PanelTaskRow): string {
  const marks = startMarks(task);
  if (
    marks.startAttempt?.phase === "preparing" ||
    marks.startAttempt?.phase === "checking" ||
    task.activity === "starting"
  ) {
    return ROW_WORDS.starting;
  }
  if (marks.startNotice) return ROW_WORDS.couldNotStart;
  // The row shows no reason, so the checks watch says itself (INF-676), and
  // so does a started crewmate idle on the tasks it waits on (INF-38): the
  // row's margin arrow points at them and its summary names each one.
  const reading = task.status === "active" ? taskStatusOf(task) : null;
  if (reading?.wait === "batch") return ROW_WORDS.batch;
  if (reading?.wait === "checks") return ROW_WORDS.checks;
  if (reading?.waitsOn) return ROW_WORDS.waiting;
  if (task.status !== "open") return "";
  if (task.flags.blocked) return ROW_WORDS.blocked;
  if (task.flags.held) return ROW_WORDS.held;
  if (task.foundOn) return foundOnWords(task.foundOn);
  return "";
}

/** A backlog row's Start: its words, and why it cannot start now, or null when it can. */
export type RowStart = { label: string; reason: string | null };

/**
 * The Start a backlog row offers on rest (INF-1663, the captain's direction
 * A on INF-1662): the record's own Start, read from the move the row already
 * carries (`moves`, the record's rule), so the row starts exactly what the
 * record would, and says the record's reason where it cannot. Null on a row
 * with no moves: a decision, a question, or an older home.
 */
export function rowStartOf(task: PanelTaskRow): RowStart | null {
  const allowance = task.moves?.["start-task"];
  if (!allowance) return null;
  return {
    label: startMarks(task).startNotice ? ROW_TRY_AGAIN_LABEL : ROW_START_LABEL,
    reason: allowance.ok ? null : allowance.text,
  };
}

/** Crew-filed rows in this group the captain has not opened. */
export function newFilingCount(rows: readonly NowRow[]): number {
  return rows.filter((row) => row.task.filingNew).length;
}

/** The project's display name, for a row's label. */
export function projectNameOf(board: Pick<PanelTaskBoard, "projects">, task: PanelTaskRow): string {
  return board.projects.find((project) => project.id === task.projectId)?.name ?? "";
}

/**
 * What a row says after its title about its computer: nothing while it can
 * take work; otherwise why not - updating, out of reach, connecting, taking no new
 * work, or connected and still catching up with the task. The row names
 * neither its project nor its computer: the summary and the record do.
 */
export type RowTrailing = {
  /** The row says its reach word: updating, out of reach, connecting or catching up. */
  outOfReach: boolean;
  connecting: boolean;
  /** Its computer is connected and this Mac is still catching up with the task; absent otherwise. */
  catchingUp?: true;
  reach: string;
};

/** The words a row ends with: what a row's paint reads, so a row paints again only when the task changed. */
export function rowTrailing(task: PanelTaskRow): RowTrailing {
  // Its computer being updated reads updating, muted as connecting is (`computer-updating.md`).
  const updating = task.place?.reach !== undefined && task.place.updating === true;
  const connecting = updating || task.place?.reach === "connecting";
  // Connected and catching up is in reach: the row says catching up, never out of reach.
  const catchingUp =
    !updating && task.place?.reach === "in-reach" && task.place.catchingUpSince !== undefined;
  return {
    // The row says why its computer cannot take work now: updating, out of reach, connecting or catching up.
    outOfReach:
      updating ||
      catchingUp ||
      (task.place?.reach !== undefined && task.place.reach !== "in-reach"),
    connecting,
    ...(catchingUp ? { catchingUp: true as const } : {}),
    reach: updating
      ? ROW_REACH_WORDS.updating
      : catchingUp
        ? ROW_CATCHING_UP
        : connecting
          ? ROW_REACH_WORDS.connecting
          : task.place?.noNewWork
            ? ROW_REACH_WORDS.noNewWork
            : ROW_REACH_WORDS.away,
  };
}

/**
 * The groups of a board, read once per board: the panel reads them for its
 * rows, its project chips and the newest listed write on every push, and
 * a push's board holds its identity until the next change (INF-2105).
 */
const groupsByBoard = new WeakMap<PanelTaskBoard, ReadonlyMap<string, NowGroup | null>>();

function groupsOf(board: PanelTaskBoard): ReadonlyMap<string, NowGroup | null> {
  let groups = groupsByBoard.get(board);
  if (!groups) {
    groups = nowGroupsOf(board);
    groupsByBoard.set(board, groups);
  }
  return groups;
}

function matches(task: PanelTaskRow, filter: NowFilter): boolean {
  if (filter.projectId && task.projectId !== filter.projectId) return false;
  const q = foldForSearch(filter.query.trim());
  if (!q) return true;
  return foldForSearch(task.title).includes(q) || foldForSearch(task.key).includes(q);
}

/** Whether the captain pinned this task to the top of Tasks. */
export function isPinned(task: PanelTaskRow): boolean {
  return task.pinnedAt !== undefined;
}

/**
 * Whether the row stands for a task at all: a minimized card with no task
 * behind it lists among the tasks, but there is nothing to pin, open or
 * move - only its card to show.
 */
export function isCardOnly(task: PanelTaskRow): boolean {
  return !task.key && Boolean(task.minimizedCardId);
}

/** What a row offers while the pointer or the keyboard rests on it: its Start, and Pin or Unpin. */
export type RowControls = { start: RowStart | null; pin: "pin" | "unpin" | null };

/**
 * The controls a row of a panel that moves tasks shows on rest: a backlog
 * row's Start (INF-1663), a pinned task's too when it would list in the
 * backlog (INF-3127), then the pin on every row with a task behind it,
 * whatever its state: Pin, or Unpin on a pinned task. The phone's long press
 * offers each of them (scripts/generate-phone-scene.ts records them).
 */
export function rowControlsOf(
  task: PanelTaskRow,
  group: PanelGroup,
  home?: NowGroup | null,
): RowControls {
  return {
    start: group === "backlog" || home === "backlog" ? rowStartOf(task) : null,
    pin: isCardOnly(task) ? null : isPinned(task) ? "unpin" : "pin",
  };
}

/**
 * Rows per group: sorted by priority then age (landed newest first), a
 * child placed under its parent when both are in the same group. A pinned
 * task lists in Pinned, whatever its state or age, in the order it was
 * pinned, newest last (INF-3127), and its parts move there with it, under
 * it (INF-3512, `pinnedRowsOf`); each task lists once.
 */
export function rowsOf(board: PanelTaskBoard, filter: NowFilter): Map<PanelGroup, NowRow[]> {
  const taskGroups = groupsOf(board);
  const pinned = pinnedRowsOf(board, taskGroups, filter);
  const byGroup = new Map<NowGroup, PanelTaskRow[]>();
  const groupById = new Map<string, NowGroup>();
  for (const task of board.tasks) {
    if (pinned.held.has(task.id)) continue;
    const group = taskGroups.get(task.id) ?? null;
    if (!group || !matches(task, filter)) continue;
    groupById.set(task.id, group);
    const list = byGroup.get(group) ?? [];
    list.push(task);
    byGroup.set(group, list);
  }
  const rows = new Map<PanelGroup, NowRow[]>();
  if (pinned.rows.length > 0) rows.set("pinned", pinned.rows);
  for (const [group, tasks] of byGroup) {
    tasks.sort((a, b) =>
      group === "landed"
        ? (b.closedAt ?? 0) - (a.closedAt ?? 0)
        : a.priority - b.priority || a.createdAt - b.createdAt,
    );
    const childrenOf = new Map<string, PanelTaskRow[]>();
    const roots: PanelTaskRow[] = [];
    for (const task of tasks) {
      if (task.parentId !== null && groupById.get(task.parentId) === group) {
        const siblings = childrenOf.get(task.parentId) ?? [];
        siblings.push(task);
        childrenOf.set(task.parentId, siblings);
      } else {
        roots.push(task);
      }
    }
    const ordered: NowRow[] = [];
    const place = (task: PanelTaskRow, depth: number) => {
      ordered.push({ task, group, depth: Math.min(depth, MAX_DEPTH) });
      for (const child of childrenOf.get(task.id) ?? []) place(child, depth + 1);
    };
    for (const root of roots) place(root, 0);
    rows.set(group, ordered);
  }
  return rows;
}

/**
 * The Pinned rows, and every task they hold, which lists in no other group.
 * The captain's words (INF-3512): "when pinning a parent task, i think all child tasks
 * should move with it into the pinned section (only at presentation layer,
 * child tasks aren't really "pinned" in their data)". So a pinned task's
 * parts, and theirs, list under it here, by priority then age, and leave
 * their own groups, each still reading as unpinned; only parts some group
 * would list come along. A part pinned itself lists once, under its pinned
 * parent. A search narrows Pinned like any group: a part whose parent it
 * hides moves up in its place. A finished part stays in Done (the captain's
 * words: "in the pinned section of the tasks panel, we should not show
 * already completed children that aren't pinned themselves"), as a working
 * tree's finished parts do.
 */
function pinnedRowsOf(
  board: PanelTaskBoard,
  groups: ReadonlyMap<string, NowGroup | null>,
  filter: NowFilter,
): { rows: NowRow[]; held: ReadonlySet<string> } {
  const pins = board.tasks.filter(isPinned);
  if (pins.length === 0) return { rows: [], held: new Set() };
  pins.sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0));
  const byId = new Map(board.tasks.map((task) => [task.id, task]));
  const partsOf = new Map<string, PanelTaskRow[]>();
  for (const task of board.tasks) {
    if (task.parentId === null) continue;
    const parts = partsOf.get(task.parentId) ?? [];
    parts.push(task);
    partsOf.set(task.parentId, parts);
  }
  for (const parts of partsOf.values())
    parts.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  // Whether a parent, or one of its own parents, is pinned: then the task lists under it.
  const pinnedAbove = (task: PanelTaskRow) => {
    const seen = new Set([task.id]);
    for (let up = task.parentId; up !== null && !seen.has(up); ) {
      seen.add(up);
      const parent = byId.get(up);
      if (!parent) return false;
      if (isPinned(parent)) return true;
      up = parent.parentId;
    }
    return false;
  };
  const rows: NowRow[] = [];
  const held = new Set<string>();
  const placed = new Set<string>();
  const place = (task: PanelTaskRow, depth: number) => {
    if (placed.has(task.id)) return;
    placed.add(task.id);
    const home = groups.get(task.id) ?? null;
    // A finished part lists in Done; its own parts move up in its place.
    const finished = home === "landed" && !isPinned(task);
    if (!finished) held.add(task.id);
    const shown = !finished && (isPinned(task) || home !== null) && matches(task, filter);
    if (shown) rows.push({ task, group: "pinned", depth: Math.min(depth, MAX_DEPTH), home });
    for (const part of partsOf.get(task.id) ?? []) place(part, shown ? depth + 1 : depth);
  };
  for (const task of pins) if (!pinnedAbove(task)) place(task, 0);
  // Pinned tasks whose parents only name each other have no top; they still list.
  for (const task of pins) place(task, 0);
  return { rows, held };
}

/**
 * The `earlier` rows for typed words: what the app found (closed beyond the
 * board's window, or dropped), minus any row the panel already lists,
 * narrowed by the project chip, newest closed first. Nothing without words.
 */
export function earlierRowsOf(
  found: readonly PanelTaskRow[],
  listed: ReadonlyMap<PanelGroup, NowRow[]>,
  filter: NowFilter,
): NowRow[] {
  if (!filter.query.trim()) return [];
  const shown = new Set([...listed.values()].flatMap((rows) => rows.map((row) => row.task.id)));
  return found
    .filter(
      (task) => !shown.has(task.id) && (!filter.projectId || task.projectId === filter.projectId),
    )
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    .map((task) => ({ task, group: "earlier" as const, depth: 0 }));
}

export function hasSingleRegisteredRepoProject(board: PanelTaskBoard): boolean {
  return (
    board.projects.filter((project) => project.repo !== null && !project.archived).length === 1
  );
}

export type ProjectChip = { id: string | null; key: string };

/**
 * The project chips: the project key as the filter handle, only for
 * projects with rows, and only when more than one has any.
 */
export function projectChipsOf(board: PanelTaskBoard): ProjectChip[] {
  const groups = groupsOf(board);
  const withRows = new Set(
    board.tasks
      .filter((task) => groups.get(task.id) != null || isPinned(task))
      .map((task) => task.projectId),
  );
  const projects = board.projects.filter((project) => withRows.has(project.id));
  if (projects.length < 2) return [];
  return [{ id: null, key: "all" }, ...projects.map((p) => ({ id: p.id, key: p.key }))];
}

/** The newest write among the rows the panel lists, for the lag measure. */
export function newestListedWrite(board: PanelTaskBoard): number {
  const groups = groupsOf(board);
  let newest = 0;
  for (const task of board.tasks) {
    if ((groups.get(task.id) != null || isPinned(task)) && task.updatedAt > newest)
      newest = task.updatedAt;
  }
  return newest;
}

/**
 * Whether the panel is on its rail: while the board has a row it lists, or
 * the record of an ask - the welcome's, on a new profile, so the words "Every
 * ask gets a record here" point at something from the welcome on (FI3-1164).
 * An `operation` row alone, the trail of an app change, docks nothing.
 */
export function onRail(board: PanelTaskBoard): boolean {
  return (
    leftOutDone(board) > 0 ||
    board.tasks.some(
      (task) => nowGroupOf(task) !== null || task.kind !== "operation" || isPinned(task),
    )
  );
}

/**
 * How many Done rows a board read without its closed rows left out
 * (`closedLeftOut`), in one project or in all: the Done group counts them
 * before the panel reads them, and reads them when it opens.
 */
export function leftOutDone(board: PanelTaskBoard, projectId: string | null = null): number {
  const done = board.closedLeftOut?.done;
  if (!done) return 0;
  if (projectId !== null) return done[projectId]?.length ?? 0;
  return Object.values(done).reduce((count, ids) => count + ids.length, 0);
}

/**
 * What the collapsed panel says it holds: how many tasks wait on the
 * captain, the part that matters while any do, and how many are working.
 * Each task counts by its own state (`nowGroupOf`): a parent the Working
 * group shows only beside a working child is not working itself (FI3-1049).
 * Focused on a project, only its tasks count, as the top bar's pill counts
 * them (src/shared/projectFocus.ts).
 */
export function failedStartCount(tasks: readonly PanelTaskRow[]): number {
  return tasks.filter((task) => startMarks(task).startNotice != null).length;
}

export function summaryOf(
  board: PanelTaskBoard,
  projectId: string | null = null,
): PanelSummaryPart[] {
  let waiting = 0;
  let working = 0;
  const tasks =
    projectId === null ? board.tasks : board.tasks.filter((task) => task.projectId === projectId);
  for (const task of tasks) {
    const group = nowGroupOf(task);
    if (group === "waiting") waiting += 1;
    else if (group === "working") working += 1;
  }
  const failed = failedStartCount(tasks);
  return [
    {
      text: m.nowPanelSummaryWaiting({ count: waiting }),
      ...(waiting > 0 ? { strong: true } : {}),
    },
    { text: m.nowPanelSummaryWorking({ count: working }) },
    ...(failed > 0 ? [{ text: m.nowPanelSummaryFailed({ count: failed }) }] : []),
  ];
}

/**
 * How far a task's parts are along (INF-3823's plan, direction B, the
 * captain's choice "Every task filed under it, reviews and dropped ones
 * included, as the app counts today"): every task filed under it, finished
 * or dropped ones counted as finished, from the row's own counts. Null on a
 * task with no parts.
 */
export function partsCountOf(task: PanelTaskRow): { closed: number; total: number } | null {
  const { closed, total } = task.children;
  return total > 0 ? { closed, total } : null;
}

/** What one part reads as on a collapsed parent's bar: the row marks' own states. */
export type PartState = "done" | "waiting" | "working" | "rest";

/** The open parts of each task the board holds, by priority then age, read once per board. */
const openPartsByBoard = new WeakMap<PanelTaskBoard, ReadonlyMap<string, PanelTaskRow[]>>();

function openPartsOf(board: PanelTaskBoard): ReadonlyMap<string, PanelTaskRow[]> {
  let parts = openPartsByBoard.get(board);
  if (!parts) {
    const next = new Map<string, PanelTaskRow[]>();
    for (const task of board.tasks) {
      if (task.parentId === null || task.status === "done" || task.status === "dropped") continue;
      const list = next.get(task.parentId) ?? [];
      list.push(task);
      next.set(task.parentId, list);
    }
    for (const list of next.values())
      list.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    parts = next;
    openPartsByBoard.set(board, parts);
  }
  return parts;
}

/** One segment of a collapsed parent's bar: its part's state, and the part it names. */
export type PartSegment = {
  state: PartState;
  /** The part's task id; null where the row cannot name it, and its rest keeps the parent's. */
  id: string | null;
};

/**
 * A collapsed parent's bar: one segment per part, the finished ones first,
 * in the order they closed, then each open part in its order - waiting on
 * you, working now, or not finished. The board lists every open task, so a
 * part the board does not hold is finished; a count the board cannot match
 * reads not finished. Each segment names its part (INF-4147's plan,
 * direction B), so a rest on it opens that part's summary: a finished part
 * from the row's `closedIds`, an open one from the board; a segment with no
 * name to give (an older home's finished parts, or padding) names none.
 */
export function partsBarOf(board: PanelTaskBoard, task: PanelTaskRow): PartSegment[] {
  const count = partsCountOf(task);
  if (!count) return [];
  const closedIds = task.children.closedIds ?? [];
  const bar: PartSegment[] = Array.from({ length: count.closed }, (_, index) => ({
    state: "done" as const,
    id: closedIds[index] ?? null,
  }));
  for (const part of openPartsOf(board).get(task.id) ?? []) {
    if (bar.length >= count.total) break;
    const group = nowGroupOf(part);
    const state = group === "waiting" ? "waiting" : group === "working" ? "working" : "rest";
    bar.push({ state, id: part.id });
  }
  while (bar.length < count.total) bar.push({ state: "rest", id: null });
  return bar;
}

/** One group's rows with the collapsed tasks' parts left out. */
export type FoldedRows = {
  /** The rows the group draws. */
  shown: NowRow[];
  /** Tasks with rows listed under them in this group: each offers the collapse control. */
  parents: ReadonlySet<string>;
  /** A part left out, by the collapsed task it is under: the outermost, which is drawn. */
  hiddenUnder: ReadonlyMap<string, string>;
  /** A row's nearest drawn row above it in its tree: ← from a part goes there. */
  parentRowOf: ReadonlyMap<string, string>;
};

/**
 * Leaves out the parts of collapsed tasks (INF-3823's plan): every row
 * listed under a collapsed task, at any depth, except a part that waits on
 * you, which is never hidden. A row's tree is the list's own indentation,
 * so it agrees with what the group draws.
 */
export function foldRows(rows: readonly NowRow[], collapsed: ReadonlySet<string>): FoldedRows {
  const shown: NowRow[] = [];
  const parents = new Set<string>();
  const hiddenUnder = new Map<string, string>();
  const parentRowOf = new Map<string, string>();
  // The rows above this one in its tree, outermost first.
  const above: NowRow[] = [];
  rows.forEach((row, index) => {
    while (above.length > 0 && (above.at(-1)?.depth ?? 0) >= row.depth) above.pop();
    const next = rows[index + 1];
    if (next && next.depth > row.depth) parents.add(row.task.id);
    const folder = above.find((up) => collapsed.has(up.task.id) && !hiddenUnder.has(up.task.id));
    if (folder && nowGroupOf(row.task) !== "waiting") hiddenUnder.set(row.task.id, folder.task.id);
    else shown.push(row);
    const up = [...above].reverse().find((candidate) => !hiddenUnder.has(candidate.task.id));
    if (up) parentRowOf.set(row.task.id, up.task.id);
    above.push(row);
  });
  return { shown, parents, hiddenUnder, parentRowOf };
}

/** Where the panel keeps the tasks the captain collapsed, in its own store slice. */
export const COLLAPSED_KEY = "collapsed";

/** The collapsed tasks a stored value names: task ids, anything else ignored. */
export function collapsedIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}
