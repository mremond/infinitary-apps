import type { PanelProject, PanelTaskBoard, PanelTaskRow } from "@infinitary/contracts";
import { describe, expect, it } from "vitest";
import { RECORD_NEXT_LABELS } from "../../shared/recordBar";
import { taskMovesOf } from "../../shared/taskMoves";
import {
  earlierRowsOf,
  foldRows,
  hasSingleRegisteredRepoProject,
  isPinned,
  leftOutDone,
  type NowRow,
  newestListedWrite,
  newFilingCount,
  onRail,
  partsBarOf,
  partsCountOf,
  projectChipsOf,
  projectNameOf,
  rowStartOf,
  rowsOf,
  rowTrailing,
  summaryOf,
  wordOf,
} from "./rows";

/**
 * What the Tasks panel lists and how each row reads (./rows.ts), driven
 * through the functions the panel renders from, on the board a panel
 * reads. The panel's DOM - the key before the title, the project name at
 * the right, the open row - is read off the real frame by
 * tests/e2e/now-panel.spec.ts.
 */

function task(overrides: Partial<PanelTaskRow> = {}): PanelTaskRow {
  return {
    id: "t1",
    key: "FI3-12",
    projectId: "proj-r1",
    parentId: null,
    kind: "work",
    title: "Ship the row chrome",
    goal: null,
    priority: 2,
    status: "active",
    activity: "idle",
    closedReason: null,
    startPolicy: "when-ready",
    flags: { blocked: false, held: false, needsYou: false, ready: true },
    blockedBy: [],
    children: { total: 0, closed: 0 },
    assignee: null,
    model: null,
    repo: null,
    outcomeSummary: null,
    waitingCardId: null,
    createdAt: 0,
    updatedAt: 1,
    startedAt: null,
    closedAt: null,
    ...overrides,
  };
}

function project(overrides: Partial<PanelProject> = {}): PanelProject {
  return {
    id: "proj-r1",
    key: "FI3",
    name: "firstmate-3000",
    repo: { name: "firstmate-3000" },
    archived: false,
    counts: { needsYou: 0, waitingOnYou: 0, open: 0, active: 1, doneRecent: 0 },
    ...overrides,
  };
}

function board(overrides: Partial<PanelTaskBoard> = {}): PanelTaskBoard {
  return { seq: 1, at: 1, projects: [project()], tasks: [task()], ...overrides };
}

const scratch = project({
  id: "scratch",
  key: "SCR",
  name: "Scratch",
  repo: null,
  counts: { needsYou: 0, waitingOnYou: 0, open: 0, active: 1, doneRecent: 0 },
});

const noFilter = { query: "", projectId: null };

describe("the Tasks panel's rows", () => {
  it("counts one registered, non-archived repo project from the full board", () => {
    expect(hasSingleRegisteredRepoProject(board())).toBe(true);
    expect(hasSingleRegisteredRepoProject(board({ projects: [project(), scratch] }))).toBe(true);
    expect(
      hasSingleRegisteredRepoProject(
        board({ projects: [project(), project({ id: "proj-r2", archived: true })] }),
      ),
    ).toBe(true);
    expect(
      hasSingleRegisteredRepoProject(board({ projects: [project(), project({ id: "proj-r2" })] })),
    ).toBe(false);
    expect(hasSingleRegisteredRepoProject(board({ projects: [scratch] }))).toBe(false);
  });

  it("keeps a parent tree together under working when any child is working", () => {
    const parent = task({ id: "parent", key: "FI3-20", status: "open", activity: null });
    const child = task({
      id: "child",
      key: "FI3-21",
      parentId: "parent",
      status: "active",
      activity: "running",
    });
    const sibling = task({
      id: "sibling",
      key: "FI3-22",
      parentId: "parent",
      status: "open",
      activity: null,
    });
    const rows = rowsOf(board({ tasks: [parent, child, sibling] }), noFilter);
    expect([...rows.keys()]).toEqual(["working"]);
    expect(rows.get("working")?.map((row) => [row.task.key, row.depth])).toEqual([
      ["FI3-20", 0],
      ["FI3-21", 1],
      ["FI3-22", 1],
    ]);
  });

  it("sorts by priority then age, and lists done work newest first", () => {
    const rows = rowsOf(
      board({
        tasks: [
          task({ id: "a", key: "FI3-1", priority: 2, createdAt: 5 }),
          task({ id: "b", key: "FI3-2", priority: 1, createdAt: 9 }),
          task({ id: "c", key: "FI3-3", priority: 2, createdAt: 1 }),
          task({ id: "d", key: "FI3-4", status: "done", activity: null, closedAt: 10 }),
          task({ id: "e", key: "FI3-5", status: "done", activity: null, closedAt: 20 }),
          // Closed chit-chat never lists.
          task({ id: "f", key: "FI3-6", kind: "question", status: "done", activity: null }),
        ],
      }),
      noFilter,
    );
    expect(rows.get("working")?.map((row) => row.task.key)).toEqual(["FI3-2", "FI3-3", "FI3-1"]);
    expect(rows.get("landed")?.map((row) => row.task.key)).toEqual(["FI3-5", "FI3-4"]);
    expect([...rows.keys()].sort()).toEqual(["landed", "working"]);
  });

  it("splits open work into queued and backlog by its start policy, blocked or held included", () => {
    const open = { status: "open" as const, activity: null };
    const rows = rowsOf(
      board({
        tasks: [
          task({ ...open, id: "q", key: "FI3-30" }),
          task({ ...open, id: "qb", key: "FI3-31", flags: { ...task().flags, blocked: true } }),
          task({ ...open, id: "qh", key: "FI3-32", flags: { ...task().flags, held: true } }),
          task({ ...open, id: "b", key: "FI3-33", startPolicy: "on-request" }),
          task({
            ...open,
            id: "bb",
            key: "FI3-34",
            startPolicy: "on-request",
            flags: { ...task().flags, blocked: true },
          }),
        ],
      }),
      noFilter,
    );
    expect(rows.get("queued")?.map((row) => row.task.key)).toEqual(["FI3-30", "FI3-31", "FI3-32"]);
    expect(rows.get("backlog")?.map((row) => row.task.key)).toEqual(["FI3-33", "FI3-34"]);
  });

  it("filters by key or title and by project, and offers chips only for two projects with rows", () => {
    const current = board({
      projects: [project(), scratch],
      tasks: [task(), task({ id: "t2", key: "SCR-4", projectId: "scratch", title: "A note" })],
    });
    const keys = (filter: { query: string; projectId: string | null }) =>
      [...rowsOf(current, filter).values()].flat().map((row) => row.task.key);
    expect(keys(noFilter)).toEqual(["FI3-12", "SCR-4"]);
    expect(keys({ query: "scr-", projectId: null })).toEqual(["SCR-4"]);
    expect(keys({ query: "row chrome", projectId: null })).toEqual(["FI3-12"]);
    expect(keys({ query: "", projectId: "scratch" })).toEqual(["SCR-4"]);
    expect(projectChipsOf(current)).toEqual([
      { id: null, key: "all" },
      { id: "proj-r1", key: "FI3" },
      { id: "scratch", key: "SCR" },
    ]);
    expect(projectChipsOf(board({ projects: [project(), scratch] }))).toEqual([]);
  });

  it("finds a title with a curly apostrophe or quote from the plain one typed (FI3-930)", () => {
    const current = board({
      projects: [project()],
      tasks: [
        task({ title: "Keep the captain’s “Later” group" }),
        task({ id: "t2", key: "FI3-13", title: "Don't rename it" }),
      ],
    });
    const keys = (query: string) =>
      [...rowsOf(current, { query, projectId: null }).values()].flat().map((row) => row.task.key);
    expect(keys("captain's")).toEqual(["FI3-12"]);
    expect(keys('"later"')).toEqual(["FI3-12"]);
    expect(keys("don’t")).toEqual(["FI3-13"]);
  });

  it("reads the trailing chrome as the project's name, never the task key", () => {
    const current = board({ projects: [project(), scratch] });
    expect(projectNameOf(current, task())).toBe("firstmate-3000");
    expect(projectNameOf(current, task({ projectId: "scratch" }))).toBe("Scratch");
    expect(projectNameOf(current, task({ projectId: "gone" }))).toBe("");
  });

  it("carries one dim word for an open row", () => {
    const open = { status: "open" as const, activity: null };
    expect(wordOf(task({ ...open, flags: { ...task().flags, blocked: true } }))).toBe("blocked");
    expect(wordOf(task({ ...open, flags: { ...task().flags, held: true } }))).toBe("held");
    expect(wordOf(task({ flags: { ...task().flags, blocked: true } }))).toBe("");
    // INF-676: the row shows no reason, so the checks watch carries its own word.
    const active = { status: "active" as const, activity: "idle" as const };
    expect(
      wordOf(
        task({
          ...active,
          workPosture: { state: "active", reason: "checks" },
        } as Partial<PanelTaskRow>),
      ),
    ).toBe("checks");
    expect(
      wordOf(
        task({
          ...active,
          workPosture: { state: "active", reason: "turn" },
        } as Partial<PanelTaskRow>),
      ),
    ).toBe("");
    // INF-38: a started crewmate idle on the tasks it waits on says so.
    expect(
      wordOf(
        task({
          ...active,
          blockedBy: ["FI3-12"],
          workPosture: { state: "idle", reason: "dependency" },
        } as Partial<PanelTaskRow>),
      ),
    ).toBe("waiting");
    const filed = task({
      ...open,
      foundOn: "FI3-12",
      filingNew: true,
    });
    expect(wordOf(filed)).toBe("found on FI3-12");
    expect(
      wordOf(task({ ...open, foundOn: "FI3-12", flags: { ...task().flags, blocked: true } })),
    ).toBe("blocked");
    expect(newFilingCount([{ task: filed, group: "backlog", depth: 0 }])).toBe(1);
    expect(
      newFilingCount([
        {
          task: task({ ...open, foundOn: "FI3-12", filingNew: false }),
          group: "backlog",
          depth: 0,
        },
      ]),
    ).toBe(0);
  });

  it("measures the lag from the newest listed write only", () => {
    expect(
      newestListedWrite(
        board({
          tasks: [
            task({ updatedAt: 5 }),
            task({ id: "q", kind: "question", status: "done", activity: null, updatedAt: 99 }),
          ],
        }),
      ),
    ).toBe(5);
  });
});

describe("the earlier group (FI3-579 piece 3)", () => {
  const old = task({
    id: "old",
    key: "FI3-81",
    status: "done",
    closedAt: 5,
    title: "Idle cleanup",
  });
  const dropped = task({
    id: "dropped",
    key: "FI3-80",
    status: "dropped",
    closedAt: 9,
    projectId: "proj-r2",
  });
  const listed = rowsOf(board({ tasks: [task({ id: "live", status: "active" })] }), noFilter);

  it("lists nothing without typed text, whatever the core found", () => {
    expect(earlierRowsOf([old, dropped], listed, noFilter)).toEqual([]);
    expect(earlierRowsOf([old, dropped], listed, { query: "  ", projectId: null })).toEqual([]);
  });

  it("lists what was found, newest closed first, under the earlier group", () => {
    const rows = earlierRowsOf([old, dropped], listed, { query: "fi3", projectId: null });
    expect(rows.map((row) => [row.task.id, row.group, row.depth])).toEqual([
      ["dropped", "earlier", 0],
      ["old", "earlier", 0],
    ]);
  });

  it("skips rows the panel already lists and honours the project chip", () => {
    const withOld = rowsOf(board({ tasks: [{ ...old, closedAt: Date.now() }] }), noFilter);
    expect(withOld.get("landed")?.map((row) => row.task.id)).toEqual(["old"]);
    expect(earlierRowsOf([old, dropped], withOld, { query: "x", projectId: null })).toHaveLength(1);
    expect(
      earlierRowsOf([old, dropped], listed, { query: "x", projectId: "proj-r2" }).map(
        (row) => row.task.id,
      ),
    ).toEqual(["dropped"]);
  });
});

/**
 * The captain's words (INF-3127): "when a task is pinned, it always show in a
 * "pinned" section in the tasks panel at the top, no matter what state it's
 * in"; and on the plan card, listed in Pinned alone, in pin order, newest last.
 */
describe("the Pinned group (INF-3127)", () => {
  const working = task({ id: "w", key: "FI3-30", status: "active", pinnedAt: 30 });
  const backlog = task({
    id: "b",
    key: "FI3-31",
    status: "open",
    activity: null,
    startPolicy: "on-request",
    pinnedAt: 10,
  });
  // Closed long ago: the board lists it for its pin alone.
  const oldDone = task({
    id: "d",
    key: "FI3-32",
    status: "done",
    activity: null,
    closedAt: 1,
    title: "Retire the old page",
    pinnedAt: 20,
  });
  const unpinned = task({ id: "u", key: "FI3-33", status: "active" });

  it("lists every pinned task first and alone, in the order it was pinned", () => {
    const rows = rowsOf(board({ tasks: [working, backlog, oldDone, unpinned] }), noFilter);
    expect([...rows.keys()][0]).toBe("pinned");
    expect(rows.get("pinned")?.map((row) => [row.task.key, row.group, row.depth])).toEqual([
      ["FI3-31", "pinned", 0],
      ["FI3-32", "pinned", 0],
      ["FI3-30", "pinned", 0],
    ]);
    // Each keeps where it would list unpinned, which its Start and wait line follow.
    expect(rows.get("pinned")?.map((row) => row.home)).toEqual(["backlog", "landed", "working"]);
    expect(rows.get("working")?.map((row) => row.task.key)).toEqual(["FI3-33"]);
    expect(rows.has("backlog")).toBe(false);
    expect(rows.has("landed")).toBe(false);
  });

  it("narrows by a search like any group, and lists none when nothing is pinned", () => {
    const rows = rowsOf(board({ tasks: [working, backlog, oldDone] }), {
      query: "retire",
      projectId: null,
    });
    expect(rows.get("pinned")?.map((row) => row.task.key)).toEqual(["FI3-32"]);
    expect(rowsOf(board({ tasks: [unpinned] }), noFilter).has("pinned")).toBe(false);
  });

  it("docks the panel and offers a project chip for a pinned task alone", () => {
    const elsewhere = { ...oldDone, projectId: "scratch" };
    const pinnedOnly = board({ projects: [project(), scratch], tasks: [unpinned, elsewhere] });
    expect(onRail(board({ tasks: [{ ...oldDone, kind: "operation" }] }))).toBe(true);
    expect(projectChipsOf(pinnedOnly).map((chip) => chip.key)).toContain("SCR");
  });
});

/**
 * The captain's words (INF-3512): "when pinning a parent task, i think all
 * child tasks should move with it into the pinned section (only at
 * presentation layer, child tasks aren't really "pinned" in their data)".
 * The board is the captain's own case: a working parent, pinned, whose
 * parts were listing at the top level of Working beside unrelated work.
 */
describe("a pinned task's parts in Pinned (INF-3512)", () => {
  const parent = task({
    id: "p",
    key: "FI3-1354",
    title: "Every window reaches its frame",
    createdAt: 10,
    pinnedAt: 500,
  });
  const devices = task({
    id: "c1",
    key: "FI3-1357",
    title: "Devices, phones and the home window",
    parentId: "p",
    activity: "running",
    createdAt: 11,
  });
  const home = task({
    id: "c2",
    key: "FI3-1359",
    title: "The home window becomes the frame",
    parentId: "p",
    createdAt: 12,
  });
  const beside = task({
    id: "c3",
    key: "FI3-1360",
    title: "Opening Infinitary beside a window",
    parentId: "p",
    priority: 1,
    createdAt: 13,
  });
  // A part of a part, and parts in other states: one not started, one done this week, one dropped.
  const deep = task({
    id: "g1",
    key: "FI3-1362",
    title: "Measure the frame",
    parentId: "c2",
    activity: "running",
    createdAt: 14,
  });
  const later = task({
    id: "c4",
    key: "FI3-1361",
    title: "The window starts the companion",
    parentId: "p",
    status: "open",
    activity: null,
    startPolicy: "on-request",
    createdAt: 15,
  });
  const done = task({
    id: "c5",
    key: "FI3-1363",
    title: "Name the frame",
    parentId: "p",
    status: "done",
    activity: null,
    closedAt: 400,
    createdAt: 16,
  });
  const dropped = task({
    id: "c6",
    key: "FI3-1364",
    title: "Draw a second frame",
    parentId: "p",
    status: "dropped",
    activity: null,
    closedAt: 450,
    createdAt: 17,
  });
  const other = task({ id: "o", key: "FI3-1400", title: "Survey the reef", createdAt: 20 });
  const tasks = [parent, devices, home, beside, deep, later, done, dropped, other];
  const listed = (rows: Map<string, NowRow[]>, group: string) =>
    rows.get(group as never)?.map((row) => [row.task.key, row.depth]);

  it("lists them under it in Pinned, by priority then age, and in no other group", () => {
    const rows = rowsOf(board({ tasks }), noFilter);
    expect(listed(rows, "pinned")).toEqual([
      ["FI3-1354", 0],
      ["FI3-1360", 1],
      ["FI3-1357", 1],
      ["FI3-1359", 1],
      ["FI3-1362", 2],
      ["FI3-1361", 1],
    ]);
    // Only the unrelated work stays in Working; the dropped part lists nowhere, as it never did.
    expect(listed(rows, "working")).toEqual([["FI3-1400", 0]]);
    expect(rows.has("backlog")).toBe(false);
    const listedKeys = [...rows.values()].flat().map((row) => row.task.key);
    expect(listedKeys).not.toContain("FI3-1364");
    expect(new Set(listedKeys).size).toBe(listedKeys.length);
  });

  it("keeps each part unpinned, reading where it would list otherwise", () => {
    const pinned = rowsOf(board({ tasks }), noFilter).get("pinned") ?? [];
    expect(pinned.filter((row) => isPinned(row.task)).map((row) => row.task.key)).toEqual([
      "FI3-1354",
    ]);
    expect(pinned.map((row) => [row.task.key, row.home])).toEqual([
      ["FI3-1354", "working"],
      ["FI3-1360", "working"],
      ["FI3-1357", "working"],
      ["FI3-1359", "working"],
      ["FI3-1362", "working"],
      ["FI3-1361", "working"],
    ]);
  });

  it("sends them back under their parent in their own groups once it is unpinned", () => {
    const unpinned = tasks.map((row) =>
      row === parent ? { ...parent, pinnedAt: undefined } : row,
    );
    const rows = rowsOf(board({ tasks: unpinned }), noFilter);
    expect(rows.has("pinned")).toBe(false);
    expect(listed(rows, "working")).toEqual([
      ["FI3-1354", 0],
      ["FI3-1360", 1],
      ["FI3-1357", 1],
      ["FI3-1359", 1],
      ["FI3-1362", 2],
      ["FI3-1361", 1],
      ["FI3-1400", 0],
    ]);
    expect(listed(rows, "landed")).toEqual([["FI3-1363", 0]]);
  });

  it("lists a part pinned itself once, under its parent, and at the top alone once its parent is unpinned", () => {
    const pinnedPart = { ...home, pinnedAt: 100 };
    const both = rowsOf(board({ tasks: [parent, pinnedPart, deep, other] }), noFilter);
    expect(listed(both, "pinned")).toEqual([
      ["FI3-1354", 0],
      ["FI3-1359", 1],
      ["FI3-1362", 2],
    ]);
    const partAlone = rowsOf(
      board({ tasks: [{ ...parent, pinnedAt: undefined }, pinnedPart, deep, other] }),
      noFilter,
    );
    expect(listed(partAlone, "pinned")).toEqual([
      ["FI3-1359", 0],
      ["FI3-1362", 1],
    ]);
    expect(listed(partAlone, "working")).toEqual([
      ["FI3-1354", 0],
      ["FI3-1400", 0],
    ]);
  });

  it("narrows by a search like any group, a part moving up where its parent is hidden", () => {
    const rows = rowsOf(board({ tasks }), { query: "frame", projectId: null });
    expect(listed(rows, "pinned")).toEqual([
      ["FI3-1354", 0],
      ["FI3-1359", 1],
      ["FI3-1362", 2],
    ]);
    const parts = rowsOf(board({ tasks }), { query: "measure", projectId: null });
    expect(listed(parts, "pinned")).toEqual([["FI3-1362", 0]]);
    expect(parts.has("working")).toBe(false);
  });

  // The captain's words: "in the pinned section of the tasks panel, we should
  // not show already completed children that aren't pinned themselves".
  it("leaves a finished part in Done unless it is pinned itself, its open parts moving up in its place", () => {
    // A part the finished one kept open when it was settled.
    const keptOpen = task({
      id: "g2",
      key: "FI3-1365",
      title: "Word the frame's name",
      parentId: "c5",
      status: "open",
      activity: null,
      startPolicy: "on-request",
      createdAt: 18,
    });
    const rows = rowsOf(board({ tasks: [...tasks, keptOpen] }), noFilter);
    expect(listed(rows, "pinned")).toEqual([
      ["FI3-1354", 0],
      ["FI3-1360", 1],
      ["FI3-1357", 1],
      ["FI3-1359", 1],
      ["FI3-1362", 2],
      ["FI3-1361", 1],
      ["FI3-1365", 1],
    ]);
    expect(listed(rows, "landed")).toEqual([["FI3-1363", 0]]);
    const pinnedDone = tasks.map((row) => (row === done ? { ...done, pinnedAt: 600 } : row));
    const both = rowsOf(board({ tasks: pinnedDone }), noFilter);
    expect(listed(both, "pinned")?.at(-1)).toEqual(["FI3-1363", 1]);
    expect(both.has("landed")).toBe(false);
  });
});

// INF-3750's option B, which the captain chose to start: the first board read
// leaves out the week's closed rows, and Done counts them until it reads them.
describe("a board read without its closed rows", () => {
  const lesser = board({
    tasks: [],
    closedLeftOut: { done: { "proj-r1": ["d1", "d2"], scratch: ["d3"] } },
  });

  it("counts the Done rows it left out, in all projects or the one in focus", () => {
    expect(leftOutDone(lesser)).toBe(3);
    expect(leftOutDone(lesser, "scratch")).toBe(1);
    expect(leftOutDone(lesser, "elsewhere")).toBe(0);
    expect(leftOutDone(board())).toBe(0);
  });

  it("keeps the panel on its rail when Done work is all it holds", () => {
    expect(onRail(lesser)).toBe(true);
  });
});

describe("what the collapsed panel says it holds", () => {
  it("is on its rail once the board holds an ask's record or a row it lists", () => {
    expect(onRail(board({ tasks: [] }))).toBe(false);
    // The trail of an app change alone, closed, docks nothing.
    expect(onRail(board({ tasks: [task({ kind: "operation", status: "done" })] }))).toBe(false);
    // An answered ask's record - the welcome's on a new profile - docks it, though no row lists it.
    expect(onRail(board({ tasks: [task({ kind: "question", status: "done" })] }))).toBe(true);
    expect(onRail(board({ tasks: [task({ status: "dropped", activity: null })] }))).toBe(true);
    expect(onRail(board())).toBe(true);
  });

  it("says how many wait and how many work, the waiting part strong while any do", () => {
    expect(summaryOf(board({ tasks: [] }))).toEqual([{ text: "0 waiting" }, { text: "0 working" }]);
    expect(
      summaryOf(
        board({
          tasks: [
            task({ id: "a", waitingCardId: "card-a" }),
            task({ id: "b", status: "open", activity: null, waitingCardId: "card-b" }),
            task({ id: "c" }),
          ],
        }),
      ),
    ).toEqual([{ text: "2 waiting", strong: true }, { text: "1 working" }]);
  });

  it("counts working by each task's own state, not the tree the Working group shows (FI3-1049)", () => {
    const parent = task({ id: "p", key: "FI3-20", status: "open", activity: null });
    const child = task({ id: "c", key: "FI3-21", parentId: "p", activity: "running" });
    const sibling = task({ id: "s", key: "FI3-22", parentId: "p", status: "open", activity: null });
    const done = task({ id: "d", key: "FI3-23", parentId: "p", status: "done", activity: null });
    const current = board({ tasks: [parent, child, sibling, done] });
    // The Working group shows the live tree beside its working child...
    expect(
      rowsOf(current, noFilter)
        .get("working")
        ?.map((row) => row.task.key),
    ).toEqual(["FI3-20", "FI3-21", "FI3-22"]);
    // ...and the summary counts only the one task that is working.
    expect(summaryOf(current)).toEqual([{ text: "0 waiting" }, { text: "1 working" }]);
  });

  it("counts own states across nested trees, waiting relatives and several workers", () => {
    const tasks = [
      task({ id: "root", status: "open", activity: null, startPolicy: "on-request" }),
      task({ id: "middle", parentId: "root", status: "open", activity: null }),
      task({ id: "leaf", parentId: "middle" }),
      task({ id: "done", parentId: "middle", status: "done", activity: null }),
      task({ id: "waits", parentId: "root", waitingCardId: "card-w" }),
      task({ id: "dropped", parentId: "root", status: "dropped", activity: null }),
    ];
    expect(summaryOf(board({ tasks }))).toEqual([
      { text: "1 waiting", strong: true },
      { text: "1 working" },
    ]);
    tasks.push(task({ id: "worker2", parentId: "root", activity: "running" }));
    expect(summaryOf(board({ tasks }))).toEqual([
      { text: "1 waiting", strong: true },
      { text: "2 working" },
    ]);
  });

  it("counts only the focused project's tasks while the window is focused on one (INF-1091)", () => {
    const current = board({
      projects: [project(), scratch],
      tasks: [
        task({ id: "a", waitingCardId: "card-a" }),
        task({ id: "b" }),
        task({ id: "c", projectId: "scratch", waitingCardId: "card-c" }),
        task({ id: "d", projectId: "scratch" }),
        task({ id: "e", projectId: "scratch" }),
      ],
    });
    expect(summaryOf(current, "scratch")).toEqual([
      { text: "1 waiting", strong: true },
      { text: "2 working" },
    ]);
    expect(summaryOf(current, null)).toEqual([
      { text: "2 waiting", strong: true },
      { text: "3 working" },
    ]);
  });
});

describe("what a row says after its title about its computer", () => {
  it("says connecting while its computer's connection is being made, out of reach otherwise", () => {
    const place = { name: "Mac mini", where: "on Mac mini" };
    const reach = rowTrailing;
    expect(reach(task({ place: { ...place, reach: "out-of-reach" } }))).toMatchObject({
      outOfReach: true,
      connecting: false,
      reach: "out of reach",
    });
    expect(reach(task({ place: { ...place, reach: "connecting" } }))).toMatchObject({
      outOfReach: true,
      connecting: true,
      reach: "connecting",
    });
    expect(reach(task({ place }))).toMatchObject({ outOfReach: false, connecting: false });
  });

  // The captain's ask: an updating work computer reads updating, never the scary out of reach.
  it("says updating, in the quiet color, while its computer is being updated, whatever its reach", () => {
    const place = { name: "Mac mini", where: "on Mac mini" };
    for (const reach of ["out-of-reach", "in-reach", "connecting"] as const)
      expect(rowTrailing(task({ place: { ...place, reach, updating: true } }))).toEqual({
        outOfReach: true,
        connecting: true,
        reach: "updating",
      });
    expect(rowTrailing(task({ place: { ...place, reach: "out-of-reach" } }))).toMatchObject({
      connecting: false,
      reach: "out of reach",
    });
  });

  // INF-1810 finding 7: connected and catching up is not out of reach.
  it("says catching up, in the quiet color, while its connected computer is catching up", () => {
    const place = { name: "Mac mini", where: "on Mac mini", reach: "in-reach" as const };
    const catching = rowTrailing(task({ place: { ...place, catchingUpSince: 1_000 } }));
    // The row names no computer: it says only why its computer cannot take work now.
    expect(catching).toEqual({
      outOfReach: true,
      connecting: false,
      catchingUp: true,
      reach: "catching up",
    });
    // Caught up: the row says nothing about its computer.
    const caught = rowTrailing(task({ place }));
    expect(caught).toMatchObject({ outOfReach: false });
    expect(caught).not.toHaveProperty("catchingUp");
  });
});

describe("a backlog row's Start (INF-1663)", () => {
  // Backlog work as the board lists it, with the moves the host derives from
  // the record's own rule, as `tasks.board` carries them.
  const backlog = (
    overrides: Partial<PanelTaskRow> & { startNotice?: { reason: string } } = {},
  ) => {
    const row = task({ status: "open", activity: null, startPolicy: "on-request", ...overrides });
    return { ...row, moves: taskMovesOf(row) } as PanelTaskRow;
  };

  it("starts what the record's Start would, in the record's words", () => {
    expect(rowStartOf(backlog())).toEqual({ label: RECORD_NEXT_LABELS.start, reason: null });
    // Held work on request still starts from its record.
    expect(
      rowStartOf(backlog({ flags: { blocked: false, held: true, needsYou: false, ready: false } })),
    ).toEqual({ label: RECORD_NEXT_LABELS.start, reason: null });
  });

  it("reads Try again on a row whose start failed", () => {
    expect(rowStartOf(backlog({ startNotice: { reason: "no working copy" } }))).toEqual({
      label: RECORD_NEXT_LABELS["try-again"],
      reason: null,
    });
  });

  it("says why it cannot start: what it waits on, or its parts", () => {
    const blocked = backlog({
      blockedBy: ["FI3-3"],
      flags: { blocked: true, held: false, needsYou: false, ready: false },
    });
    expect(rowStartOf(blocked)).toEqual({
      label: RECORD_NEXT_LABELS.start,
      reason: blocked.moves?.["start-task"].ok === false ? blocked.moves["start-task"].text : "",
    });
    expect(rowStartOf(blocked)?.reason).toContain("FI3-3");
    const parent = backlog({ children: { total: 2, closed: 0 } });
    expect(rowStartOf(parent)?.reason).toBeTruthy();
  });

  it("offers nothing on a row with no moves", () => {
    expect(rowStartOf(task({ kind: "decision", status: "open" }))).toBeNull();
  });
});

// Approved batch gate: the existing Working group keeps the row and the dim word is batch, never Queued.
it("names each pending batch state without moving it to the Queued group", () => {
  for (const batch of ["waiting", "in-batch", "paused"] as const) {
    const member = {
      ...task(),
      workPosture: { state: "active" as const, reason: "checks" as const, batch },
    };
    expect(wordOf(member)).toBe("batch");
    expect(
      rowsOf(board({ tasks: [member] }), { query: "", projectId: null })
        .get("working")
        ?.map((row) => row.task.id),
    ).toEqual([member.id]);
  }
});

/**
 * A parent's progress and its collapse (INF-3823's plan, direction B, with
 * the captain's answers: "None. Everything starts expanded as today, and a
 * task stays collapsed once you collapse it." and "Every task filed under
 * it, reviews and dropped ones included, as the app counts today.").
 */
describe("a task with parts (INF-3823)", () => {
  const parent = task({
    id: "plan",
    key: "FI3-1",
    title: "Translate the app",
    status: "active",
    activity: "idle",
    children: { total: 5, closed: 2 },
  });
  const working = task({
    id: "ship",
    key: "FI3-4",
    parentId: "plan",
    status: "active",
    activity: "running",
    createdAt: 4,
  });
  const decision = task({
    id: "ask",
    key: "FI3-5",
    parentId: "plan",
    status: "active",
    activity: "idle",
    waitingCardId: "card-1",
    createdAt: 5,
  });
  const queued = task({
    id: "iphone",
    key: "FI3-6",
    parentId: "plan",
    status: "open",
    activity: "idle",
    createdAt: 6,
  });
  const review = task({
    id: "review",
    key: "FI3-7",
    parentId: "iphone",
    status: "open",
    activity: "idle",
    createdAt: 7,
  });
  const solo = task({
    id: "solo",
    key: "FI3-9",
    status: "active",
    activity: "running",
    createdAt: 9,
  });
  const tree = board({ tasks: [parent, working, decision, queued, review, solo] });
  const workingFolded = (collapsed: string[] = []) =>
    foldRows(rowsOf(tree, { query: "", projectId: null }).get("working") ?? [], new Set(collapsed));

  it("counts every task filed under it, finished and dropped ones as finished, from the row's own counts", () => {
    expect(partsCountOf(parent)).toEqual({ closed: 2, total: 5 });
    expect(partsCountOf(solo)).toBeNull();
  });

  it("draws one bar segment per part: finished first, then each open part by its state, in order", () => {
    const states = (at: PanelTaskBoard, row: PanelTaskRow) =>
      partsBarOf(at, row).map((segment) => segment.state);
    expect(states(tree, parent)).toEqual(["done", "done", "working", "waiting", "rest"]);
    // A part the board does not list reads not finished, never a made-up state.
    const sparse = board({ tasks: [{ ...parent, children: { total: 4, closed: 1 } }] });
    expect(states(sparse, sparse.tasks[0] as PanelTaskRow)).toEqual([
      "done",
      "rest",
      "rest",
      "rest",
    ]);
  });

  // INF-4147's plan, direction B (the captain's answer "Every segment,
  // finished ones too"): a rest on a segment opens the part it names.
  it("names each segment's part: finished ones in the order they closed, then the open ones", () => {
    const named = { ...parent, children: { total: 5, closed: 2, closedIds: ["first", "second"] } };
    const at = board({ tasks: [named, working, decision, queued, review, solo] });
    expect(partsBarOf(at, named).map((segment) => segment.id)).toEqual([
      "first",
      "second",
      "ship",
      "ask",
      "iphone",
    ]);
    // An older home sends no ids: its finished segments, and padding the
    // board cannot match, name no part, so their rest keeps the parent's.
    const sparse = board({ tasks: [{ ...parent, children: { total: 4, closed: 1 } }] });
    expect(partsBarOf(sparse, sparse.tasks[0] as PanelTaskRow).map((s) => s.id)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("lists everything while nothing is collapsed, offering the control on each row with rows under it", () => {
    const folded = workingFolded();
    expect(folded.shown.map((row) => row.task.id)).toEqual([
      "plan",
      "ship",
      "iphone",
      "review",
      "solo",
    ]);
    expect([...folded.parents].sort()).toEqual(["iphone", "plan"]);
    expect(folded.hiddenUnder.size).toBe(0);
    expect(folded.parentRowOf.get("review")).toBe("iphone");
  });

  it("leaves out every row under a collapsed task, at any depth, each under the drawn task", () => {
    const folded = workingFolded(["plan"]);
    expect(folded.shown.map((row) => row.task.id)).toEqual(["plan", "solo"]);
    expect(folded.hiddenUnder.get("ship")).toBe("plan");
    expect(folded.hiddenUnder.get("review")).toBe("plan");
    // It still offers the control, so it can be expanded again.
    expect(folded.parents.has("plan")).toBe(true);
    // A collapse under a collapsed task keeps its own state, and hides only its own rows once expanded.
    expect(workingFolded(["iphone"]).shown.map((row) => row.task.id)).toEqual([
      "plan",
      "ship",
      "iphone",
      "solo",
    ]);
  });

  it("never hides a part that waits on you, as in Pinned where it lists under its parent", () => {
    const pinned = board({
      tasks: [{ ...parent, pinnedAt: 10 }, working, decision, queued, solo],
    });
    const rows = rowsOf(pinned, { query: "", projectId: null }).get("pinned") ?? [];
    const folded = foldRows(rows, new Set(["plan"]));
    expect(folded.shown.map((row) => row.task.id)).toEqual(["plan", "ask"]);
    expect(folded.parentRowOf.get("ask")).toBe("plan");
  });
});
