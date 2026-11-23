import { type AfterMergeStep, afterMergeShownListSchema } from "@shared/afterMerge";
import { RISK_DIMENSIONS } from "@shared/cards";
import { type ChangePresentation, changePresentationSchema } from "@shared/changePresentation";
import { describe, expect, it } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import { presentationContentHash } from "../forge/presentation";
import { AskEnding } from "../orchestrator/askEnding";
import { afterMergeWords } from "../orchestrator/deliveryWakes";
import { renderAfterMergeFacts } from "../orchestrator/intentBrief";
import type { ProjectRecord } from "../storage/projectStore";
import type { MergeAuthorization } from "../storage/taskRecords";
import { seedProject } from "../workspace/seedProject";
import { alreadyAllowed } from "./alreadyAllowed";
import { seedTask } from "./seedTask";
import { TaskService } from "./taskService";

// INF-2796, the captain's Approve and build of direction A: a crewmate
// lists after-merge steps on its merge card and the app files them as
// tasks that start on their own once the merge goes through - with the
// captain's written-in rule, "we should not mandate these follow up tasks
// though. a merge can totally end without anything to continue".

const HEAD = "4f1c0d2b9e8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d";
const REPAIRED = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b";

/**
 * DOP-299's own story at its merge, with the step its report left as text:
 * "Then INF-2779's owner sets MAC_QUEUES split/release_split".
 */
function dop299Story(
  taskId: string,
  afterMerge?: ChangePresentation["afterMerge"],
  at: Partial<Pick<ChangePresentation, "revision" | "head" | "destination">> = {},
) {
  return changePresentationSchema.parse({
    version: 1,
    taskId,
    revision: at.revision ?? 2,
    title: "feat(runners): place the split Mac jobs on the small Macs",
    destination: at.destination ?? { kind: "local", project: "dotfiles-private" },
    base: HEAD,
    head: at.head ?? HEAD,
    why: ["The split Mac check's three jobs should run on the 5-core Macs."],
    whatChanged: ["The Mac runners take the split and release_split queue labels."],
    before: ["Every Mac job waited for the one large runner."],
    after: ["The split jobs run side by side on the small Macs."],
    views: [],
    noPicture: "This changes runner labels, not a screen.",
    verification: ["Read the runner labels on each small Mac."],
    risk: Object.fromEntries(
      RISK_DIMENSIONS.map((dimension) => [dimension, { level: "low", why: "Runner labels only." }]),
    ),
    requiredActions: [],
    ...(afterMerge ? { afterMerge } : {}),
    unfinished: [],
    projectText: "",
    assets: [],
    pictures: [],
  });
}

function setup(afterMerge?: ChangePresentation["afterMerge"]) {
  const db = freshDatabase();
  const tasks = new TaskService({ db, strict: true });
  // DOP-299's own project, and the app's, where the work it waited for ran.
  seedProject(db, {
    id: "dotfiles",
    name: "dotfiles-private",
    path: "/fleet/dotfiles",
    key: "DOP",
  });
  seedProject(db, { id: "infinitary", name: "Infinitary", path: "/fleet/infinitary", key: "INF" });
  const app = tasks.projects.forRepo("infinitary") as ProjectRecord;
  const origin = seedTask(tasks, {
    id: "dop29900",
    title: "Place the split Mac jobs",
    repoId: "dotfiles",
    status: "idle",
    branch: "fm/task-dop29900",
  });
  // INF-2779, still running when DOP-299 merged.
  const split = seedTask(tasks, {
    id: "inf27790",
    title: "Split the Mac check into three jobs",
    repoId: "infinitary",
    status: "idle",
  });
  declare(tasks, origin, afterMerge);
  return { db, tasks, origin, split, app };
}

function declare(
  tasks: TaskService,
  origin: { id: string },
  afterMerge?: ChangePresentation["afterMerge"],
) {
  const story = dop299Story(origin.id, afterMerge);
  tasks.delivery.updateChangePresentation(origin.id, () => ({
    revisions: [story],
    receipts: [],
    completion: {
      revision: story.revision,
      head: HEAD,
      contentHash: presentationContentHash(story),
    },
  }));
}

const DOP299_STEP = [
  {
    title: "Pull the split setup onto the Mac mini, set MAC_QUEUES",
    goal: "The Mac mini runs the split runner setup and MAC_QUEUES names split and release_split.",
    why: "INF-2779 split the Mac check into three jobs; the queue variable still names only the old journeys size, so the split jobs wait for a runner that never takes them.",
  },
];

const continueTasks = (tasks: TaskService) =>
  tasks.list().filter((record) => record.title.startsWith("Continue: "));

describe("after-merge steps at the merge", () => {
  // INF-3282, approved from the weekly reach audit: eleven authorized steps
  // and eleven dependencies must survive admission, display and activation.
  // Extend DOP-299's split-runner rollout to a fleet of work computers.
  it("keeps every step and dependency beyond ten through a merged close", () => {
    const { tasks, origin } = setup();
    const blockers = Array.from({ length: 11 }, (_, index) =>
      seedTask(tasks, {
        id: `runner-${index + 1}`,
        title: `Prepare split runner on work computer ${index + 1}`,
        repoId: "dotfiles",
        status: "idle",
      }),
    );
    const steps = blockers.map((_, index) => ({
      ...DOP299_STEP[0],
      title: `Set split queues on work computer ${index + 1}`,
      blockedBy: blockers.map((blocker) => blocker.key),
    }));
    expect(tasks.delivery.afterMergeRefusal(origin.id, steps)).toBeUndefined();
    declare(tasks, origin, steps);
    const shown = afterMergeShownListSchema.parse(tasks.delivery.afterMergeShown(steps));
    expect(shown.map((step) => step.title)).toEqual(steps.map((step) => `Continue: ${step.title}`));
    for (const step of shown) expect(step.waitsFor).toEqual(blockers.map((task) => task.key));

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });
    tasks.delivery.activateAfterMergeSteps(origin.id);
    const filed = continueTasks(tasks);
    expect(filed.map((task) => task.title).sort()).toEqual(shown.map((step) => step.title).sort());
    for (const task of filed) {
      expect(task.startPolicy).toBe("when-ready");
      expect(
        tasks.graph
          .blockers(task.id)
          .map((blocker) => blocker.id)
          .sort(),
      ).toEqual(blockers.map((blocker) => blocker.id).sort());
      expect(tasks.graph.listReady().map((ready) => ready.id)).not.toContain(task.id);
    }
  });

  // INF-3282 also retains actual payload protection with an explained way on.
  it("refuses oversized story JSON without dropping work and accepts task references instead", () => {
    const { origin } = setup();
    const longSteps = Array.from({ length: 16 }, () => ({
      ...DOP299_STEP[0],
      why: "The split runner setup must be installed before the queue labels change. ".repeat(55),
    }));
    const result = changePresentationSchema.safeParse({
      ...dop299Story(origin.id),
      afterMerge: longSteps,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message).join(" ")).toContain(
      "60,000 UTF-16 code units of JSON",
    );
    expect(result.error.issues.map((issue) => issue.message).join(" ")).toContain(
      "list their keys instead; keep every authorized task and dependency",
    );
    const references = longSteps.map((_, index) => ({ task: `DOP-${300 + index}` }));
    expect(dop299Story(origin.id, references).afterMerge).toEqual(references);
  });
  it("files each declared step as a Continue task that starts on its own once merged", () => {
    const { tasks, origin } = setup(DOP299_STEP);
    expect(continueTasks(tasks)).toEqual([]);

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const [filed] = continueTasks(tasks);
    expect(filed).toMatchObject({
      title: "Continue: Pull the split setup onto the Mac mini, set MAC_QUEUES",
      goal: DOP299_STEP[0]?.goal,
      kind: "work",
      status: "open",
      startPolicy: "when-ready",
      projectId: origin.projectId,
    });
    expect(filed?.prompt).toContain(DOP299_STEP[0]?.why);
    expect(tasks.graph.discoveredOrigins(filed?.id ?? "").map((row) => row.id)).toEqual([
      origin.id,
    ]);
    // Nothing else holds it: the ready sweep after the close starts it.
    expect(tasks.graph.listReady().map((row) => row.id)).toContain(filed?.id);
    expect(tasks.delivery.filedAfterMergeSteps(origin.id)).toEqual([
      { key: filed?.key, title: filed?.title },
    ]);
  });

  it("files a step once, however often the merge is activated again", () => {
    const { tasks, origin } = setup(DOP299_STEP);
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });
    tasks.delivery.activateAfterMergeSteps(origin.id);
    expect(continueTasks(tasks)).toHaveLength(1);
  });

  it("files nothing for a story that lists no steps", () => {
    const { tasks, origin } = setup();
    const before = tasks.list().length;
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });
    expect(tasks.list()).toHaveLength(before);
    expect(tasks.delivery.filedAfterMergeSteps(origin.id)).toEqual([]);
  });

  it("files the steps of a GitHub pull request's story the host republished at a later version", () => {
    const { tasks, origin } = setup();
    // The author's revision 2 was published on the pull request; a repair
    // pushed a later version and the host republished the same words as
    // revision 3 (INF-2509's refresh, which copies the whole story).
    const github = {
      host: "github.com",
      projectId: 1421542804,
      fullName: "example/dotfiles-private",
      visibility: "private" as const,
    };
    const authored = dop299Story(origin.id, DOP299_STEP, { destination: github });
    const refreshed = dop299Story(origin.id, DOP299_STEP, {
      destination: github,
      revision: 3,
      head: REPAIRED,
    });
    const publication = {
      revision: 3,
      head: REPAIRED,
      state: "confirmed" as const,
      region: "",
      regionHash: "",
      contentHash: presentationContentHash(authored),
      refreshOf: 2,
      number: 41,
    };
    tasks.delivery.updateChangePresentation(origin.id, () => ({
      revisions: [authored, refreshed],
      receipts: [],
      publication,
      published: publication,
    }));

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    expect(continueTasks(tasks).map((record) => record.title)).toEqual([
      "Continue: Pull the split setup onto the Mac mini, set MAC_QUEUES",
    ]);
  });

  // INF-3623, the captain's answer "Keep the card's lists; new ones need a new merge card":
  // a story revised after the click merges, but its follow-ups stay the clicked card's.
  it.each([false, true])(
    "files the clicked merge card's steps when the story was revised after the click (approval ended another way: %s)",
    (ended) => {
      const { tasks, origin } = setup();
      const github = {
        host: "github.com",
        projectId: 1421542804,
        fullName: "example/dotfiles-private",
        visibility: "private" as const,
      };
      const clicked = dop299Story(origin.id, DOP299_STEP, { destination: github });
      const revised = dop299Story(
        origin.id,
        [{ ...DOP299_STEP[0], title: "Retire the old journeys queue label" } as AfterMergeStep],
        { destination: github, revision: 3 },
      );
      const publication = {
        revision: 3,
        head: HEAD,
        state: "confirmed" as const,
        region: "",
        regionHash: "",
        contentHash: presentationContentHash(revised),
        number: 41,
      };
      tasks.delivery.updateChangePresentation(origin.id, () => ({
        revisions: [clicked, revised],
        receipts: [],
        publication,
        published: publication,
      }));
      seedDelivery(tasks, origin.id, {
        completionOffers: [
          {
            cardId: "merge-card",
            offerId: "offer-1",
            headSha: HEAD,
            prNumber: 41,
            at: 1,
            presentationRevision: 2,
          },
        ],
        mergeAuthorization: {
          version: 1,
          id: "approval",
          generation: 1,
          issuer: "captain",
          at: 1,
          card: { id: "merge-card", offerId: "offer-1", actionId: "merge" },
          target: {
            repoId: "dotfiles",
            host: "github.com",
            owner: "example",
            name: "dotfiles-private",
            prNumber: 41,
            branch: "fm/task-dop29900",
            delivery: "direct-pr",
            method: "squash",
          },
          approvedHead: HEAD,
          proceedWithOpen: false,
          status: "standing",
          lineage: [],
        },
      });

      if (ended) {
        const approval = tasks.get(origin.id)?.delivery?.mergeAuthorization;
        seedDelivery(tasks, origin.id, {
          mergeAuthorization: approval && { ...approval, status: "superseded" },
        });
      }
      tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

      // An approval that ended another way (INF-3630's review) names no card the task merged by:
      // the merged story's own steps are filed.
      expect(continueTasks(tasks).map((record) => record.title)).toEqual([
        ended
          ? "Continue: Retire the old journeys queue label"
          : "Continue: Pull the split setup onto the Mac mini, set MAC_QUEUES",
      ]);
    },
  );

  it("files a step in the project it names, held until the work it waits for merges", () => {
    // DOP-299's step belonged to the app's project and could only run once
    // INF-2779 merged as well (captain's "Build them in this change").
    const { tasks, origin, split, app } = setup([
      { ...DOP299_STEP[0], project: "INF", blockedBy: ["INF-1"] } as AfterMergeStep,
    ]);
    expect(split.key).toBe("INF-1");

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const [filed] = continueTasks(tasks);
    expect(filed).toMatchObject({ projectId: app.id, repoId: "infinitary", status: "open" });
    expect(filed?.key).toMatch(/^INF-/);
    expect(tasks.graph.listReady().map((row) => row.id)).not.toContain(filed?.id);

    tasks.close(split.id, { status: "done", reason: "merged", actor: "host" });
    expect(tasks.graph.listReady().map((row) => row.id)).toContain(filed?.id);
  });

  // INF-4220 piece 1: a step filed in another project that holds several
  // repositories names the one it works in, so nothing is guessed.
  it("files a step in the repository it names when its project holds several, and refuses one that names none", () => {
    const step = { ...DOP299_STEP[0], project: "INF" } as AfterMergeStep;
    const { db, tasks, origin, app } = setup([{ ...step, repository: "infinitary-infra" }]);
    seedProject(db, {
      id: "infinitary-infra",
      name: "infinitary-infra",
      path: "/fleet/infinitary-infra",
      project: app.id,
    });
    const refusal = (one: AfterMergeStep) => tasks.delivery.afterMergeRefusal(origin.id, [one]);
    expect(refusal(step)).toBe(
      "afterMerge step 1 is filed in Infinitary, which holds several repositories (Infinitary, infinitary-infra): name the one it works in with repository.",
    );
    expect(refusal({ ...step, repository: "website" })).toBe(
      'afterMerge step 1 names no repository "website" in Infinitary; its repositories are Infinitary, infinitary-infra.',
    );
    expect(refusal({ ...step, repository: "infinitary-infra" })).toBeUndefined();
    // In the origin's own project, the origin's repository, as before.
    expect(refusal(DOP299_STEP[0] as AfterMergeStep)).toBeUndefined();

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });
    const [filed] = continueTasks(tasks);
    expect(filed).toMatchObject({ projectId: app.id, repoId: "infinitary-infra" });
    expect(filed?.key).toMatch(/^INF-/);
  });

  it("starts an existing unstarted task the step names, once the work it waits for merges", () => {
    const { tasks, origin, split } = setup();
    const queues = seedTask(tasks, {
      id: "dop30000",
      title: "Set MAC_QUEUES to the split queue labels",
      repoId: "dotfiles",
      status: "queued",
      startPolicy: "on-request",
    });
    const step = { task: queues.key, blockedBy: [split.key] } as AfterMergeStep;
    expect(tasks.delivery.afterMergeRefusal(origin.id, [step])).toBeUndefined();
    expect(tasks.delivery.afterMergeShown([step])).toEqual([
      { key: queues.key, title: queues.title, waitsFor: [split.key] },
    ]);
    declare(tasks, origin, [step]);

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    expect(continueTasks(tasks)).toEqual([]);
    expect(tasks.get(queues.id)).toMatchObject({ status: "open", startPolicy: "when-ready" });
    expect(tasks.graph.listReady().map((row) => row.id)).not.toContain(queues.id);
    expect(tasks.delivery.filedAfterMergeSteps(origin.id)).toEqual([
      { key: queues.key, title: queues.title },
    ]);
    tasks.close(split.id, { status: "done", reason: "merged", actor: "host" });
    expect(tasks.graph.listReady().map((row) => row.id)).toContain(queues.id);
  });

  it("refuses a step naming a running or closed task, an unknown project or an unknown wait", () => {
    const { tasks, origin, split } = setup();
    const closed = seedTask(tasks, {
      id: "dop29800",
      title: "Label the small Macs",
      repoId: "dotfiles",
      status: "idle",
    });
    tasks.close(closed.id, { status: "done", reason: "merged", actor: "host" });
    const refusal = (step: AfterMergeStep) => tasks.delivery.afterMergeRefusal(origin.id, [step]);

    expect(refusal({ task: split.key })).toContain("already running");
    expect(refusal({ task: closed.key })).toContain("closed");
    expect(refusal({ task: origin.key })).toContain("this task itself");
    expect(refusal({ ...DOP299_STEP[0], project: "NOPE" } as AfterMergeStep)).toContain(
      'no project "NOPE"',
    );
    expect(refusal({ ...DOP299_STEP[0], blockedBy: ["INF-404"] } as AfterMergeStep)).toContain(
      'no task "INF-404"',
    );
    expect(refusal({ title: "Set MAC_QUEUES" })).toContain("needs a title, a goal and why");
  });

  // Re-review of INF-2812: a wait that would close a cycle, and a named task
  // that could start before the merge, are refused when the story is prepared.
  it("refuses a named task already set to start on its own, or a wait that would close a cycle", () => {
    const { tasks, origin, split } = setup();
    const queues = seedTask(tasks, {
      id: "dop30000",
      title: "Set MAC_QUEUES to the split queue labels",
      repoId: "dotfiles",
      status: "queued",
      startPolicy: "when-ready",
    });
    const refusal = (step: AfterMergeStep) => tasks.delivery.afterMergeRefusal(origin.id, [step]);
    expect(refusal({ task: queues.key })).toContain("already set to start on its own");
    // Waiting on the origin already, it cannot start before the merge.
    tasks.graph.insertLink(origin.id, queues.id, "blocks", "host", 1);
    expect(refusal({ task: queues.key })).toBeUndefined();

    // INF-1 waits for the named task, so the named task cannot wait for INF-1.
    tasks.graph.insertLink(queues.id, split.id, "blocks", "host", 1);
    expect(refusal({ task: queues.key, blockedBy: [split.key] })).toContain(
      "nothing could ever start",
    );
  });

  it("records the merge and notes a wait that closed a cycle after the card was shown", () => {
    const { tasks, origin, split } = setup();
    const queues = seedTask(tasks, {
      id: "dop30000",
      title: "Set MAC_QUEUES to the split queue labels",
      repoId: "dotfiles",
      status: "queued",
      startPolicy: "on-request",
    });
    declare(tasks, origin, [{ task: queues.key, blockedBy: [split.key] }]);
    // After the card was shown, INF-1 came to wait for the named task.
    tasks.graph.insertLink(queues.id, split.id, "blocks", "host", 1);

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    expect(tasks.get(origin.id)?.status).toBe("done");
    expect(tasks.get(queues.id)?.startPolicy).toBe("when-ready");
    expect(tasks.graph.blockers(queues.id)).toEqual([]);
    expect(
      tasks.timeline(queues.id).some((event) => event.text.startsWith("could not wait for")),
    ).toBe(true);
  });

  it("leaves a wait on closed work off the merge card", () => {
    const { tasks, split } = setup();
    tasks.close(split.id, { status: "done", reason: "merged", actor: "host" });
    expect(
      tasks.delivery.afterMergeShown([
        { ...DOP299_STEP[0], blockedBy: [split.key] } as AfterMergeStep,
      ]),
    ).toEqual([{ title: `Continue: ${DOP299_STEP[0]?.title}`, goal: DOP299_STEP[0]?.goal }]);
  });

  it("starts nothing for a named task that closed between the card and the merge", () => {
    const { tasks, origin } = setup();
    const queues = seedTask(tasks, {
      id: "dop30000",
      title: "Set MAC_QUEUES to the split queue labels",
      repoId: "dotfiles",
      status: "queued",
      startPolicy: "on-request",
    });
    declare(tasks, origin, [{ task: queues.key }]);
    tasks.close(queues.id, { status: "dropped", reason: "cancelled", actor: "captain" });

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    expect(tasks.get(queues.id)?.status).toBe("dropped");
    expect(tasks.delivery.filedAfterMergeSteps(origin.id)).toEqual([
      { key: queues.key, title: queues.title, skipped: "closed" },
    ]);
    // The first mate's settled wake says so instead of claiming it started.
    expect(afterMergeWords(tasks.delivery.filedAfterMergeSteps(origin.id))).toBe(
      `It started nothing for ${queues.key} "${queues.title}", closed before the merge; decide whether its work still needs a task.`,
    );
  });

  // INF-3060's finding 4, the captain's "an after-merge step names its
  // doer, and app changes go to the first mate": INF-2959's merge card
  // listed deleting an Automation rule, which started a crewmate (INF-3014)
  // that could only report it had no access to Automation.
  const INF2959_RULE_STEP = {
    doer: "firstmate",
    title: "Delete the Automation rule that repaired batches",
    goal: "Automation no longer has the rule that started a repair when a merge batch failed.",
    why: "The shipped queue now starts its own repair, so the old rule would start a second one.",
  } satisfies AfterMergeStep;

  it("files no task for the first mate's app change and hands it over in the settled wake", () => {
    const { tasks, origin } = setup([INF2959_RULE_STEP, ...DOP299_STEP]);
    expect(tasks.delivery.afterMergeRefusal(origin.id, [INF2959_RULE_STEP])).toBeUndefined();
    expect(tasks.delivery.afterMergeShown([INF2959_RULE_STEP])).toEqual([
      { title: INF2959_RULE_STEP.title, goal: INF2959_RULE_STEP.goal, doer: "firstmate" },
    ]);

    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    // Only the crewmate's step is filed; nothing holds the rule's deletion.
    const filed = continueTasks(tasks);
    expect(filed.map((record) => record.title)).toEqual([
      "Continue: Pull the split setup onto the Mac mini, set MAC_QUEUES",
    ]);
    expect(tasks.list().some((record) => record.title.includes(INF2959_RULE_STEP.title))).toBe(
      false,
    );
    const crew = tasks.delivery.filedAfterMergeSteps(origin.id);
    const firstmate = tasks.delivery.firstmateAfterMergeSteps(origin.id);
    expect(firstmate).toEqual([
      { title: INF2959_RULE_STEP.title, goal: INF2959_RULE_STEP.goal, why: INF2959_RULE_STEP.why },
    ]);
    const words = afterMergeWords(crew, firstmate);
    expect(words).toContain(`${filed[0]?.key} "${filed[0]?.title}"`);
    expect(words).toContain(`"${INF2959_RULE_STEP.title}": ${INF2959_RULE_STEP.goal}`);
    expect(words).toContain("no task was filed for them");
  });

  it("refuses a first mate's step that names a task, a project or a wait", () => {
    const { tasks, origin, split } = setup();
    const refusal = (step: AfterMergeStep) => tasks.delivery.afterMergeRefusal(origin.id, [step]);
    const firstMates = "is the first mate's change in the app";
    expect(refusal({ doer: "firstmate", task: split.key })).toContain(firstMates);
    expect(refusal({ ...INF2959_RULE_STEP, project: "INF" })).toContain(firstMates);
    expect(refusal({ ...INF2959_RULE_STEP, blockedBy: [split.key] })).toContain(firstMates);
    expect(refusal({ doer: "firstmate", title: INF2959_RULE_STEP.title })).toContain(
      "needs a title, a goal and why",
    );
  });

  it("files nothing when the change is discarded", () => {
    const { tasks, origin } = setup(DOP299_STEP);
    tasks.close(origin.id, { status: "dropped", reason: "discarded", actor: "host" });
    expect(continueTasks(tasks)).toEqual([]);
  });
});

// INF-3846 piece 4, the captain's Approve and build of direction A ("Waits
// follow the work"): the secrets work shipped in slices, and each slice's
// merge told the part waiting for the storage to carry on before the storage
// existed. A slice's after-merge step names the waiters the rest still holds,
// and they keep waiting for that step.
describe("after-merge steps that hold the rest's waiters", () => {
  const STORAGE_STEP = {
    title: "Turn protected storage on",
    goal: "Integration secrets are written to the secret manager's protected storage.",
    why: "This change adds the secret manager with storage left off; moving the secrets needs storage on.",
  };

  function secrets(
    steps: (waiters: { move: string; cleanup: string }) => AfterMergeStep[],
    now?: () => number,
  ) {
    const tasks = new TaskService({ db: freshDatabase(), strict: true, ...(now ? { now } : {}) });
    tasks.projects.ensureForRepo({ id: "infinitary", name: "Infinitary" }, "INF");
    const slice = seedTask(tasks, {
      id: "inf11090",
      title: "Add the secrets settings and secret manager",
      repoId: "infinitary",
      status: "idle",
      branch: "fm/task-inf11090",
    });
    // Started, then told to wait for the secret manager.
    const move = seedTask(tasks, {
      id: "inf07850",
      title: "Move integration secrets into the secret manager",
      repoId: "infinitary",
      status: "idle",
    });
    // Waits for the settings alone, and should start at this merge.
    const cleanup = seedTask(tasks, {
      id: "inf16430",
      title: "Show the secrets settings in Settings",
      repoId: "infinitary",
      status: "queued",
      startPolicy: "when-ready",
    });
    tasks.graph.insertLink(slice.id, move.id, "blocks", "firstmate", 1);
    tasks.graph.insertLink(slice.id, cleanup.id, "blocks", "firstmate", 1);
    const declared = steps({ move: move.key, cleanup: cleanup.key });
    return { tasks, slice, move, cleanup, declared };
  }

  it("keeps a held waiter waiting for the step that does the rest, and frees the others", () => {
    const { tasks, slice, move, cleanup, declared } = secrets(({ move }) => [
      { ...STORAGE_STEP, holds: [move] },
    ]);
    expect(tasks.delivery.afterMergeRefusal(slice.id, declared)).toBeUndefined();
    declare(tasks, slice, declared);

    tasks.close(slice.id, { status: "done", reason: "merged", actor: "host" });

    const [storage] = continueTasks(tasks);
    expect(storage?.title).toBe(`Continue: ${STORAGE_STEP.title}`);
    expect(tasks.graph.waitingOn(move.id).map((task) => task.id)).toEqual([storage?.id]);
    expect(tasks.graph.waitingOn(cleanup.id)).toEqual([]);
    expect(tasks.graph.listReady().map((row) => row.id)).toContain(cleanup.id);
    // The move names the slice, so the step's close tells the waiter whose work it took over.
    expect(
      tasks
        .timeline(move.id)
        .some(
          (event) =>
            event.kind === "unlinked" &&
            event.data?.fromId === slice.id &&
            event.data?.movedTo === storage?.id,
        ),
    ).toBe(true);
    const filed = tasks.delivery.filedAfterMergeSteps(slice.id);
    expect(filed).toEqual([{ key: storage?.key, title: storage?.title, holds: [move.key] }]);
    expect(afterMergeWords(filed)).toContain(
      `${storage?.key} "${storage?.title}" (${move.key} keeps waiting for it)`,
    );
    // A second activation of the merge moves nothing twice.
    tasks.delivery.activateAfterMergeSteps(slice.id);
    expect(tasks.graph.waitingOn(move.id).map((task) => task.id)).toEqual([storage?.id]);

    tasks.close(storage?.id as string, { status: "done", reason: "merged", actor: "host" });
    expect(tasks.graph.waitingOn(move.id)).toEqual([]);
  });

  it("keeps a held waiter waiting for an existing task the step names", () => {
    const { tasks, slice, move } = secrets(() => []);
    const storage = seedTask(tasks, {
      id: "inf16590",
      title: "Turn protected storage on",
      repoId: "infinitary",
      status: "queued",
      startPolicy: "on-request",
    });
    const declared = [{ task: storage.key, holds: [move.key] }];
    expect(tasks.delivery.afterMergeRefusal(slice.id, declared)).toBeUndefined();
    declare(tasks, slice, declared);

    tasks.close(slice.id, { status: "done", reason: "merged", actor: "host" });

    expect(tasks.get(storage.id)?.startPolicy).toBe("when-ready");
    expect(tasks.graph.waitingOn(move.id).map((task) => task.id)).toEqual([storage.id]);
  });

  it("keeps the Continue task in the coverage of the message the slice served", () => {
    const { tasks, slice, move, declared } = secrets(({ move }) => [
      { ...STORAGE_STEP, holds: [move] },
    ]);
    declare(tasks, slice, declared);
    tasks.capture.openAsk({
      id: "ask",
      text: "Move the integration secrets into the secret manager.",
    });
    tasks.capture.attachAsk("ask", slice.id, "tool:spawn_crewmate");

    tasks.close(slice.id, { status: "done", reason: "merged", actor: "host" });

    const [storage] = continueTasks(tasks);
    const covered = tasks.capture.askCoverage(["ask"]).work.map((task) => task.id);
    expect(covered).toContain(storage?.id);
    expect(tasks.capture.asksAbove(storage?.id as string).map((ask) => ask.id)).toEqual(["ask"]);
    // The waiter it holds is not the slice's work, so the message does not take it in.
    expect(covered).not.toContain(move.id);
  });

  // Review finding named-step-outside-coverage, the captain's "keep the
  // request open until an already-filed follow-on task is done too":
  // INF-1659, turning storage on, was filed from another task's report
  // before the secrets settings merged.
  it("covers an existing task a step starts, keeping the line of where its work came from", () => {
    // A frozen clock: the merge links the task in the millisecond it was
    // filed, which a fast run on any machine can reach (INF-5647).
    const { tasks, slice, move } = secrets(
      () => [],
      () => 5_000,
    );
    const reporter = seedTask(tasks, {
      id: "inf07830",
      title: "Plan the secret manager",
      repoId: "infinitary",
      status: "idle",
    });
    tasks.capture.openAsk({ id: "plan-ask", text: "Plan where integration secrets live." });
    tasks.capture.attachAsk("plan-ask", reporter.id, "tool:spawn_crewmate");
    const storage = seedTask(tasks, {
      id: "inf16590",
      title: "Turn protected storage on",
      repoId: "infinitary",
      status: "queued",
      startPolicy: "on-request",
    });
    tasks.capture.saveOrigin(storage.id, { kind: "report", taskId: reporter.id });
    const line = tasks.capture.originAbout(storage.id);
    expect(line).toMatchObject({ kind: "asked", text: "Plan where integration secrets live." });
    tasks.capture.openAsk({
      id: "ask",
      text: "Move the integration secrets into the secret manager.",
    });
    tasks.capture.attachAsk("ask", slice.id, "tool:spawn_crewmate");
    declare(tasks, slice, [{ task: storage.key, holds: [move.key] }]);

    tasks.close(slice.id, { status: "done", reason: "merged", actor: "host" });

    expect(tasks.capture.askCoverage(["ask"]).work.map((task) => task.id)).toContain(storage.id);
    expect(tasks.capture.asksAbove(storage.id).map((ask) => ask.id)).toContain("ask");
    expect(tasks.graph.discoveredOrigins(storage.id).map((task) => task.id)).toEqual([slice.id]);
    expect(tasks.capture.originAbout(storage.id)).toEqual(line);
  });

  // Review finding named-step-joins-late: a task filed before the message
  // joins its work only when the merge links it, and a wait can hold its
  // start, so the message stays underway until that task is done.
  it("keeps the request underway while an existing task the step starts waits for other work", () => {
    let clock = 1_000;
    const { tasks, slice } = secrets(
      () => [],
      () => ++clock,
    );
    const storage = seedTask(tasks, {
      id: "inf16590",
      title: "Turn protected storage on",
      repoId: "infinitary",
      status: "queued",
      startPolicy: "on-request",
    });
    const keychain = seedTask(tasks, {
      id: "inf17060",
      title: "Let the app reach the protected storage",
      repoId: "infinitary",
      status: "idle",
    });
    tasks.capture.openAsk({
      id: "ask",
      text: "Move the integration secrets into the secret manager.",
    });
    tasks.capture.attachAsk("ask", slice.id, "tool:spawn_crewmate");
    tasks.capture.closeAsk("ask", "closed");
    declare(tasks, slice, [{ task: storage.key, blockedBy: [keychain.key] }]);
    const ending = new AskEnding({
      tasks,
      openCards: () => [],
      storedCard: () => undefined,
      shownAt: () => 0,
      seenCards: () => [],
    });
    const state = () =>
      ending.state(ending.thread("ask") as NonNullable<ReturnType<AskEnding["thread"]>>);

    tasks.close(slice.id, { status: "done", reason: "merged", actor: "host" });

    expect(tasks.get(storage.id)).toMatchObject({ status: "open", startedAt: null });
    expect(state()).toEqual({ kind: "working" });
    tasks.close(keychain.id, { status: "done", reason: "merged", actor: "host" });
    expect(state()).toEqual({ kind: "working" });
    tasks.close(storage.id, { status: "done", reason: "merged", actor: "host" });
    expect(state()).not.toEqual({ kind: "working" });
  });

  it("refuses holds that name no waiter of this task, or a wait that could never clear", () => {
    const { tasks, slice, move } = secrets(() => []);
    const unrelated = seedTask(tasks, {
      id: "inf34330",
      title: "Sign the company build",
      repoId: "infinitary",
      status: "queued",
      startPolicy: "on-request",
    });
    const refusal = (...steps: AfterMergeStep[]) =>
      tasks.delivery.afterMergeRefusal(slice.id, steps);

    expect(refusal({ ...STORAGE_STEP, holds: ["INF-404"] })).toContain('holds no task "INF-404"');
    expect(refusal({ ...STORAGE_STEP, holds: [slice.key] })).toContain("this task itself");
    expect(refusal({ ...STORAGE_STEP, holds: [unrelated.key] })).toContain(
      "does not wait for this task",
    );
    expect(
      refusal({ ...STORAGE_STEP, holds: [move.key] }, { ...STORAGE_STEP, holds: [move.key] }),
    ).toContain("another step already holds");
    expect(refusal({ ...STORAGE_STEP, blockedBy: [move.key], holds: [move.key] })).toContain(
      "nothing could ever start",
    );
    expect(refusal({ doer: "firstmate", ...STORAGE_STEP, holds: [move.key] })).toContain(
      "is the first mate's change in the app",
    );
  });
});

// INF-4574, the captain's Approve and build of direction B with "Yes. A step
// stops asking again for what its merge card named.": a step the app files
// at a merge is the crew's own work, told what the app knows of that merge,
// and the captain's own merge click allows what the step said it would use.
describe("a step the app files at a merge", () => {
  // DOP-415's ask, which its merge card had listed: pull the Mac mini's
  // checkout and restart its job runner.
  const PULL_STEP = {
    ...DOP299_STEP[0],
    uses: "The Mac mini's checkout of dotfiles-private: a git pull and a restart of its job runner, which stops the jobs running there for about a minute.",
  };
  const CLEANUP_STEP = {
    title: "Delete the old Linux guest images on the Mac mini",
    goal: "The Mac mini keeps only the Linux guest image the split runners use.",
    why: "The split runners boot the new image; the two old ones take 60 GB on the Mac mini.",
  };

  function mergedBy(issuer: MergeAuthorization["issuer"]): MergeAuthorization {
    return {
      version: 1,
      id: "approval",
      generation: 2,
      issuer,
      at: 1,
      card: { id: "merge-dop299", offerId: "offer-1", actionId: "merge" },
      target: {
        repoId: "dotfiles",
        host: "github.com",
        owner: "example",
        name: "dotfiles-private",
        branch: "fm/task-dop29900",
        delivery: "direct-pr",
        method: "squash",
      },
      approvedHead: HEAD,
      proceedWithOpen: false,
      status: "consumed",
      lineage: [],
      endedAt: 2,
      receipt: { head: HEAD, at: 2 },
    };
  }

  it("marks the step as the crew's own and briefs it with its merge and that merge's other steps", () => {
    const { tasks, origin, split } = setup();
    declare(tasks, origin, [{ ...PULL_STEP, blockedBy: [split.key] }, CLEANUP_STEP]);
    tasks.close(split.id, { status: "done", reason: "merged", actor: "host" });
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const filed = continueTasks(tasks);
    const pull = filed.find((task) => task.title.includes("MAC_QUEUES"));
    const cleanup = filed.find((task) => task.title.includes("guest images"));
    // The captain did not ask for its result: the typed mark the first
    // mate's own work carries, which serves the crew-started words.
    expect(pull?.shape?.internal_step).toBe(true);
    expect(cleanup?.shape?.internal_step).toBe(true);
    expect(pull?.prompt).toContain(
      renderAfterMergeFacts(origin.key, {
        siblings: [`"Continue: ${CLEANUP_STEP.title}"`],
        waitsFor: [`${split.key} "${split.title}"`],
      }).join("\n"),
    );
    expect(cleanup?.prompt).toContain(`"Continue: ${PULL_STEP.title}"`);
  });

  it("keeps the line of the message that asked for the merged change", () => {
    const { tasks, origin } = setup(DOP299_STEP);
    tasks.capture.openAsk({ id: "ask", text: "Place the split Mac jobs on the small Macs." });
    tasks.capture.attachAsk("ask", origin.id, "tool:spawn_crewmate");
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const [filed] = continueTasks(tasks);
    expect(filed?.shape?.internal_step).toBe(true);
    expect(tasks.capture.originAbout(filed?.id as string)).toMatchObject({
      kind: "asked",
      text: "Place the split Mac jobs on the small Macs.",
      through: 1,
    });
  });

  /** The merge card the captain clicked showed the story's revision 2, the one `setup` declares. */
  const shownOffer = {
    cardId: "merge-dop299",
    offerId: "offer-1",
    headSha: HEAD,
    at: 1,
    presentationRevision: 2,
  };

  it("records the captain's own merge click as a yes for what the step said it would use", () => {
    const { tasks, origin } = setup([PULL_STEP, CLEANUP_STEP]);
    seedDelivery(tasks, origin.id, {
      completionOffers: [shownOffer],
      mergeAuthorization: mergedBy("captain"),
    });
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const pull = continueTasks(tasks).find((task) => task.title.includes("MAC_QUEUES"));
    const cleanup = continueTasks(tasks).find((task) => task.title.includes("guest images"));
    expect(alreadyAllowed(tasks, pull as NonNullable<typeof pull>).allowances).toEqual([
      expect.objectContaining({ card: "merge-dop299", covers: PULL_STEP.uses }),
    ]);
    // A step that named nothing it would use is allowed nothing.
    expect(alreadyAllowed(tasks, cleanup as NonNullable<typeof cleanup>).allowances).toEqual([]);
  });

  it("records nothing when the app merged on its own", () => {
    const { tasks, origin } = setup([PULL_STEP]);
    seedDelivery(tasks, origin.id, {
      completionOffers: [shownOffer],
      mergeAuthorization: mergedBy("autonomy"),
    });
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const [filed] = continueTasks(tasks);
    expect(alreadyAllowed(tasks, filed as NonNullable<typeof filed>).allowances).toEqual([]);
  });

  it("records nothing when the steps were not read from the card the captain clicked", () => {
    // No offer recorded for the clicked card: the steps come from the kept
    // completion instead, words the captain may never have seen on that card.
    const { tasks, origin } = setup([PULL_STEP]);
    seedDelivery(tasks, origin.id, { mergeAuthorization: mergedBy("captain") });
    tasks.close(origin.id, { status: "done", reason: "merged", actor: "host" });

    const [filed] = continueTasks(tasks);
    expect(filed?.title).toContain("MAC_QUEUES");
    expect(alreadyAllowed(tasks, filed as NonNullable<typeof filed>).allowances).toEqual([]);
  });

  // INF-4574's proof: a local branch or a host with no checks keeps no
  // approval, so the merge card the captain's own click recorded says it.
  it("records the captain's own click on a merge with no kept approval, and only theirs", () => {
    const click = { cardId: shownOffer.cardId, offerId: shownOffer.offerId, at: 1 };
    const merge = (actor: "captain" | "host" | "firstmate", offer = shownOffer) => {
      const { tasks, origin } = setup([PULL_STEP]);
      seedDelivery(tasks, origin.id, { completionOffers: [offer], mergeClick: click });
      tasks.close(origin.id, { status: "done", reason: "landed", actor });
      const [filed] = continueTasks(tasks);
      return alreadyAllowed(tasks, filed as NonNullable<typeof filed>).allowances;
    };
    expect(merge("captain")).toEqual([
      expect.objectContaining({ card: "merge-dop299", covers: PULL_STEP.uses }),
    ]);
    // The app or the first mate settled it: an earlier click of the captain's
    // that did not merge allows nothing.
    expect(merge("host")).toEqual([]);
    expect(merge("firstmate")).toEqual([]);
    // The clicked card showed an earlier story than the one whose steps merged.
    expect(merge("captain", { ...shownOffer, presentationRevision: 1 })).toEqual([]);
  });

  it("draws what a step will use on its merge card, and refuses it on the first mate's step", () => {
    const { tasks, origin } = setup();
    const [shown] = afterMergeShownListSchema.parse(tasks.delivery.afterMergeShown([PULL_STEP]));
    expect(shown?.uses).toBe(PULL_STEP.uses);
    expect(
      tasks.delivery.afterMergeRefusal(origin.id, [
        { doer: "firstmate", ...CLEANUP_STEP, uses: PULL_STEP.uses },
      ]),
    ).toContain("is the first mate's change in the app");
  });
});
