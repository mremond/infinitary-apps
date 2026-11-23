import type { BatchChange } from "@shared/batches";
import { describe, expect, it } from "vitest";
import { EVERY_WAY, passed, setup } from "../../../tests/helpers/batchesHarness";
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
    await home.approveRebuilt(rebuilt, open.head);
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
});
