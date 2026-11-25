import { expect, it } from "vitest";
import {
  quietContributionFacts,
  seedPublishedContribution,
} from "../../tests/helpers/publishedContribution";
import { taskProtocolFixture } from "../../tests/helpers/taskProtocol";
import { deriveWorkPosture } from "../core/orchestrator/workPosture";
import * as m from "../panels/now/messages.generated";
import { summaryOf } from "../panels/now/rows";
import { nowCountGroupOf, nowGroupOf } from "./nowPanel";
import { projectPillsOf } from "./projectFocus";

// Counts may exclude the quiet wait, but its lifecycle grouping must continue to expose the task.
it.each([
  ["quiet maintainer wait", {}, 0],
  ["queued author work", { deliverable: true }, 1],
  ["ordinary idle work", { checksWatched: false }, 1],
] as const)("keeps all working summaries consistent for %s", (_name, patch, expected) => {
  const at = taskProtocolFixture({
    workPosture: (record) =>
      deriveWorkPosture(record, () => ({ ...quietContributionFacts, ...patch })),
  });
  try {
    const stored = seedPublishedContribution(at.tasks);
    const board = at.fresh();
    const row = board.tasks.find((task) => task.id === stored.id);
    if (!row) throw new Error("The published contribution must remain listed");
    expect(nowGroupOf(row)).toBe("working");
    expect(nowCountGroupOf(row)).toBe(expected === 0 ? null : "working");
    expect(summaryOf(board)[1]?.text).toBe(m.nowPanelSummaryWorking({ count: expected }));
    const pills = projectPillsOf(board);
    expect(pills.working).toBe(expected);
    expect(pills.projects.find((project) => project.id === row.projectId)?.working).toBe(expected);
  } finally {
    at.protocol.dispose();
    at.db.close();
  }
});
