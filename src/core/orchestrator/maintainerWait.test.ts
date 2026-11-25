import { BATCH_CHECK } from "@shared/batches";
import { workPostureLabel } from "@shared/workPosture";
import { describe, expect, it } from "vitest";
import { seedPublishedContribution } from "../../../tests/helpers/publishedContribution";
import { original, repaired } from "../../../tests/helpers/savedStory";
import { openInMemoryDatabase } from "../storage/db";
import { TaskService } from "../tasks/taskService";
import { crewTally } from "../tasks/workPresentation";
import { deriveWorkPosture, type PostureFacts } from "./workPosture";

const quietFacts = {
  threadAwaitingAuthor: false,
  decisionCardOpen: false,
  captainGateOwed: false,
  deliverable: false,
  jobsRunning: false,
  pendingSettle: false,
  timedWait: false,
  checksWatched: true,
  accountHeld: false,
  waitsOnUnstarted: false,
  turnRunning: false,
  liveJobs: false,
  clientJobs: 0,
  observable: true,
  blocked: false,
} satisfies PostureFacts;

function contribution() {
  const db = openInMemoryDatabase();
  const tasks = new TaskService({ db });
  const record = seedPublishedContribution(tasks);
  return { db, tasks, record };
}

describe("quiet published upstream contributions", () => {
  it("keeps the task open and its maintainer label while counting it as idle", () => {
    const at = contribution();
    try {
      const posture = deriveWorkPosture(at.record, () => quietFacts);
      expect(posture).toEqual({ state: "idle", reason: "checks", maintainers: true });
      expect(workPostureLabel(posture)).toBe("Waiting for the maintainers");
      const tally = crewTally();
      tally.see(at.record, () => posture);
      expect(tally.counts(at.tasks)).toEqual({ working: 0, idle: 1, queued: 0 });
      expect(at.tasks.get(at.record.id)).toEqual(at.record);
    } finally {
      at.db.close();
    }
  });

  it.each([
    [{ turnRunning: true }, "turn"],
    [{ liveJobs: true }, "job"],
    [{ clientJobs: 1 }, "job"],
    [{ pendingSettle: true }, "settlement"],
    [{ deliverable: true }, "guidance"],
    [{ threadAwaitingAuthor: true }, "guidance"],
  ] as const)("keeps actionable %j ahead of the external wait", (facts, reason) => {
    const at = contribution();
    try {
      expect(deriveWorkPosture(at.record, () => ({ ...quietFacts, ...facts }))).toEqual({
        state: "active",
        reason,
      });
    } finally {
      at.db.close();
    }
  });

  it("does not substitute an external wait for access, batch or actual check watches", () => {
    const at = contribution();
    try {
      expect(deriveWorkPosture(at.record, () => ({ ...quietFacts, accountHeld: true }))).toEqual({
        state: "paused",
        reason: "access",
      });
      const delivery = at.record.delivery;
      expect(
        deriveWorkPosture(
          {
            ...at.record,
            delivery: {
              ...delivery,
              checks: {
                headSha: original,
                items: [{ name: BATCH_CHECK, state: "pending" }],
                absenceDeclared: false,
              },
            },
          },
          () => quietFacts,
        ),
      ).toEqual({ state: "active", reason: "checks", batch: "waiting" });
      for (const watch of [
        { ciWatch: { head: original, since: 1, nextAt: 2, tries: 0 } },
        {
          runWatches: [{ runId: 1, name: "Branch checks", attempt: 1, since: 1, nextAt: 2 }],
        },
      ]) {
        expect(
          deriveWorkPosture(
            { ...at.record, delivery: { ...delivery, ...watch } },
            () => quietFacts,
          ),
        ).toEqual({ state: "active", reason: "checks" });
      }
    } finally {
      at.db.close();
    }
  });

  it("requires the same upstream request and current confirmed publication", () => {
    const at = contribution();
    try {
      const delivery = at.record.delivery;
      const presentation = delivery?.presentation;
      if (!presentation?.published || !delivery?.contribution)
        throw new Error("Missing published upstream fixture");
      const notPublished = { ...delivery, presentation: undefined };
      const stale = { ...delivery, headSha: repaired };
      const otherPublication = {
        ...delivery,
        presentation: {
          ...presentation,
          published: { ...presentation.published, number: 24 },
        },
      };
      const sending = {
        ...delivery,
        presentation: {
          ...presentation,
          publication: { ...presentation.published, state: "sending" as const },
        },
      };
      const destination = presentation.revisions.at(-1)?.destination;
      if (!destination || !("projectId" in destination)) throw new Error("Missing hosted story");
      const otherProject = {
        ...delivery,
        presentation: {
          ...presentation,
          revisions: presentation.revisions.map((story) => ({
            ...story,
            destination: { ...destination, projectId: 2 },
          })),
        },
      };
      for (const patch of [notPublished, stale, otherPublication, sending, otherProject]) {
        expect(deriveWorkPosture({ ...at.record, delivery: patch }, () => quietFacts)).toEqual({
          state: "active",
          reason: "checks",
          maintainers: true,
        });
      }
      for (const patch of [
        { ...delivery, contributionState: { number: 24, state: "open" as const } },
        {
          ...delivery,
          contribution: { ...delivery.contribution, destination: "fork" as const },
        },
      ]) {
        expect(deriveWorkPosture({ ...at.record, delivery: patch }, () => quietFacts)).toEqual({
          state: "active",
          reason: "checks",
        });
      }
      expect(
        deriveWorkPosture(
          {
            ...at.record,
            delivery: null,
            gate: { kind: "at-time", until: 100 },
          },
          () => ({ ...quietFacts, checksWatched: false, timedWait: true }),
        ),
      ).toEqual({ state: "active", reason: "timed-wait" });
    } finally {
      at.db.close();
    }
  });
});
