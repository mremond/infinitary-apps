import type { BatchChange } from "@shared/batches";
import { describe, expect, it } from "vitest";
import {
  EVERY_WAY,
  passed,
  REPO,
  type StandInPull,
  setup,
} from "../../../tests/helpers/batchesHarness";
import { BATCH_WORDS } from "./batches";
import { LEFT_OUT_WORDS } from "./combine";

// Intent: INF-6147's accepted plan, piece 1, from the captain's ask that batches stop paying
// again and again to bring a large change up to date that never gets in: a change that
// clashes with the open batch has its crewmate told at once, with the batch's version, and
// the version rebuilt on it waits right behind that batch and goes first in the next one.
// The project and its host are `batchesHarness.ts`.

const PARSER: BatchChange = {
  taskId: "t-parser",
  branch: "fm/task-parser",
  head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
  title: "fix(parser): read dates with a time zone",
  body: "- Dates with a time zone are read as written.",
  at: 1_000,
};
const EXPORT: BatchChange = {
  taskId: "t-export",
  branch: "fm/task-export",
  head: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  title: "feat(export): add a CSV export",
  body: "- A report exports as CSV.",
  at: 2_000,
};
const LEGEND: BatchChange = {
  taskId: "t-legend",
  branch: "fm/task-legend",
  head: "0f9e8d7c6b5a49382716f5e4d3c2b1a009182736",
  title: "fix(chart): keep the legend inside the chart",
  body: "- The legend no longer overlaps the bars.",
  at: 3_000,
};

const AXIS: BatchChange = {
  taskId: "t-axis",
  branch: "fm/task-axis",
  head: "7e6d5c4b3a2918070f6e5d4c3b2a190817263544",
  title: "fix(chart): label the time axis in local time",
  body: "- The time axis reads in the viewer's own time.",
  at: 4_000,
};

describe("a change that clashes with the open batch", () => {
  it("tells a change left out for a clash with the open batch to rebuild on its version once, then carries the rebuilt version first in the next batch", async () => {
    const home = setup(EVERY_WAY, { rebuilding: true });
    home.clashing.set("t-export", "t-parser");
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    const reason = LEFT_OUT_WORDS.ahead(PARSER.title);
    const open = home.open();
    expect(home.members()).toEqual(["t-parser"]);
    expect(home.place(EXPORT)).toEqual({
      state: "left-out",
      reason,
      ahead: "t-parser",
      rebuild: { head: open.head, branch: open.branch },
    });
    expect(home.heard.rebuilds).toEqual([
      { taskId: "t-export", head: EXPORT.head, on: open.head, reason },
    ]);
    expect(home.heard.taskNotes).toEqual([
      { taskId: "t-export", text: BATCH_WORDS.rebuild(reason, open.head) },
    ]);
    expect(home.heard.settled).toEqual([["t-export"]]);
    await home.pass();
    expect(home.heard.rebuilds).toHaveLength(1);

    // Approved before the rebuilt version, a later change still goes behind it.
    home.approve(LEGEND);
    home.clashing.delete("t-export");
    const rebuilt = { ...EXPORT, head: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7", at: 6_000 };
    home.builtOn.set(rebuilt.head, open.head);
    await home.approve(rebuilt);
    await home.pass();
    expect(home.place(rebuilt)).toEqual({ state: "waiting", place: "line" });
    expect(home.record().line.map((entry) => entry.taskId)).toEqual(["t-legend", "t-export"]);

    // The batch merges: the next batch carries the rebuilt version first, and its crewmate
    // hears no clash note on top of what it was told.
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges.map((merge) => merge.number)).toEqual([31]);
    expect(home.members()).toEqual(["t-export", "t-legend"]);
    expect(home.heard.taskNotes).toHaveLength(1);
    expect(home.heard.rebuilds).toHaveLength(1);
  });

  it("tries each change waiting in line against the open batch once, and tells only one that no longer combines with it", async () => {
    const home = setup(EVERY_WAY, { rebuilding: true });
    home.approve(PARSER);
    await home.pass();
    const open = home.open();
    home.clashingOpen.add(LEGEND.head);
    home.approve(EXPORT);
    home.approve(LEGEND);
    await home.pass();
    await home.pass();
    expect(home.heard.tried).toEqual([
      { head: EXPORT.head, batch: open.head },
      { head: LEGEND.head, batch: open.head },
    ]);
    expect(home.heard.rebuilds).toEqual([
      { taskId: "t-legend", head: LEGEND.head, on: open.head, reason: LEFT_OUT_WORDS.clashesBatch },
    ]);
    expect(home.heard.taskNotes).toEqual([
      { taskId: "t-legend", text: BATCH_WORDS.rebuild(LEFT_OUT_WORDS.clashesBatch, open.head) },
    ]);
    // It keeps its place in line: the next batch's combine judges the version it has then.
    expect(home.place(LEGEND)).toEqual({ state: "waiting", place: "line" });
  });
  // The independent review's findings on this change: a version rebuilt on a batch hears
  // again when a change that batch carried leaves it, and a told change's merge reads its
  // place again whenever that batch ends, merged or not.
  it("tells a rebuilt version once to rebuild again when a change its batch version carried leaves the batch", async () => {
    const home = setup(EVERY_WAY, { rebuilding: true });
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    const first = home.open();
    // Built on the batch's version, whatever repair was declared: git's history says so.
    home.builtOn.set(LEGEND.head, first.head);
    await home.approve(LEGEND);
    await home.pass();
    expect(home.record().line.map((entry) => entry.onBatch?.head)).toEqual([first.head]);
    expect(home.heard.rebuilds).toEqual([]);

    home.approvals.delete("t-export");
    await home.batches.withdraw(REPO, "t-export");
    await home.pass();
    await home.pass();
    const now = home.open();
    expect(home.members()).toEqual(["t-parser"]);
    const reason = LEFT_OUT_WORDS.batchChanged(first.head);
    expect(home.heard.rebuilds).toEqual([
      { taskId: "t-legend", head: LEGEND.head, on: now.head, reason },
    ]);
    expect(home.heard.taskNotes).toEqual([
      { taskId: "t-legend", text: BATCH_WORDS.rebuild(reason, now.head) },
    ]);
  });

  it("reads a told change's place again when its batch is closed unmerged", async () => {
    const home = setup(EVERY_WAY, { rebuilding: true });
    home.clashing.set("t-export", "t-parser");
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    expect(home.heard.settled).toEqual([["t-export"]]);
    (home.host.pulls.get(31) as StandInPull).state = "closed";
    await home.pass();
    expect(home.heard.settled[1]).toEqual(["t-export"]);
    expect(home.place(EXPORT)).toMatchObject({ state: "left-out" });
    expect(home.place(EXPORT)).not.toHaveProperty("rebuild");
  });
  // The captain's answer to the review's question (let the first rebuild stand, so the change
  // goes first next batch): a batch that merges before the rebuilt version is declared asks
  // for no second bring-up-to-date.
  it("keeps the first rebuild standing when the batch merges before the rebuilt version arrives, then carries that version first", async () => {
    const home = setup(EVERY_WAY, { rebuilding: true });
    home.approve(PARSER);
    await home.pass();
    const open = home.open();
    home.clashingOpen.add(LEGEND.head);
    home.approve(LEGEND);
    await home.pass();
    expect(home.heard.rebuilds).toHaveLength(1);

    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    await home.pass();
    expect(home.host.merges.map((merge) => merge.number)).toEqual([31]);
    // The clashing version stays out of the next batch, and nothing tells it again.
    expect(home.record().open).toBeUndefined();
    expect(home.place(LEGEND)).toEqual({ state: "waiting", place: "line" });
    expect(home.heard.rebuilds).toHaveLength(1);
    expect(home.heard.taskNotes).toHaveLength(1);

    // Approved before the rebuilt version arrives, a later change still goes behind it.
    home.approve(AXIS);
    const rebuilt = { ...LEGEND, head: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708", at: 9_000 };
    home.builtOn.set(rebuilt.head, open.head);
    await home.approve(rebuilt);
    await home.pass();
    expect(home.members()).toEqual(["t-legend", "t-axis"]);
    expect(home.record().line).toEqual([]);
  });

  it("keeps a told left-out change waiting for its rebuilt version once that batch merged", async () => {
    const home = setup(EVERY_WAY, { rebuilding: true });
    home.clashing.set("t-export", "t-parser");
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    const open = home.open();
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges.map((merge) => merge.number)).toEqual([31]);
    expect(home.place(EXPORT)).toMatchObject({
      state: "left-out",
      rebuild: { head: open.head, branch: open.branch },
    });
    // Only the merged change reads its place again; the told one waits, with no new note.
    expect(home.heard.settled).toEqual([["t-export"], ["t-parser"]]);
    expect(home.heard.taskNotes).toHaveLength(1);
  });
});
