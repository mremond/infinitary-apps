import { createHash } from "node:crypto";
import { presentationContentHash, presentationMarkdown } from "../../src/core/forge";
import type { PostureFacts } from "../../src/core/orchestrator/workPosture";
import { seedTask } from "../../src/core/tasks/seedTask";
import type { TaskService } from "../../src/core/tasks/taskService";
import { original, storyFixture } from "./savedStory";

export const quietContributionFacts = {
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

/** Both posture and admission cases share the saved-story fixture's publication shape. */
export function seedPublishedContribution(
  tasks: TaskService,
  id = storyFixture().taskId,
  number = 23,
) {
  const story = { ...storyFixture(), taskId: id };
  if (!("projectId" in story.destination)) throw new Error("Expected a hosted story fixture");
  seedTask(tasks, {
    id: story.taskId,
    title: "Contribute a correction",
    status: "idle",
    worktreeDir: `/scratch/contribution/${id}`,
  });
  tasks.delivery.recordChangeEvidence(story.taskId, {
    headSha: original,
    prNumber: number,
    prUrl: `https://${story.destination.host}/${story.destination.fullName}/pull/${number}`,
    contribution: {
      destination: "upstream",
      upstream: {
        id: story.destination.projectId,
        fullName: story.destination.fullName,
        origin: `https://${story.destination.host}/${story.destination.fullName}.git`,
      },
      fork: {
        id: 2,
        fullName: "contributor/evidence-sample",
        origin: "https://github.com/contributor/evidence-sample.git",
      },
    },
    contributionState: { number, state: "open" },
  });
  const region = presentationMarkdown(story, new Map(), "passed");
  const published = {
    revision: story.revision,
    head: story.head,
    state: "confirmed" as const,
    region,
    regionHash: createHash("sha256").update(region).digest("hex"),
    contentHash: presentationContentHash(story),
    number,
  };
  tasks.delivery.updateChangePresentation(story.taskId, () => ({
    revisions: [story],
    receipts: [],
    publication: published,
    published,
  }));
  const record = tasks.get(story.taskId);
  if (!record?.delivery) throw new Error("Missing stored contribution");
  return { ...record, delivery: record.delivery };
}
