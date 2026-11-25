import { nowCountGroupOf, nowGroupOf } from "@shared/nowPanel";
import { projectPillsOf } from "@shared/projectFocus";
import { expect, it } from "vitest";
import {
  quietContributionFacts,
  seedPublishedContribution,
} from "../../../tests/helpers/publishedContribution";
import { taskProtocolFixture } from "../../../tests/helpers/taskProtocol";
import { deriveWorkPosture } from "../orchestrator/workPosture";

// Counts may exclude the quiet wait, but its lifecycle grouping must continue to expose the task.
it.each([
  ["quiet maintainer wait", {}, 0],
  ["queued author work", { deliverable: true }, 1],
  ["ordinary idle work", { checksWatched: false }, 1],
] as const)(
  "keeps project counts consistent with the shared count rule for %s",
  (_name, patch, expected) => {
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
      const pills = projectPillsOf(board);
      expect(pills.working).toBe(expected);
      expect(pills.projects.find((project) => project.id === row.projectId)?.working).toBe(
        expected,
      );
    } finally {
      at.protocol.dispose();
      at.db.close();
    }
  },
);
