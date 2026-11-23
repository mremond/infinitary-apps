/**
 * The one close as done (INF-3169's plan, piece 2; docs/task-record.md,
 * "One close as done"). The captain chose the delivery proof as the hold
 * their words pass: "One hold your words pass: its crewmate has not
 * reported, or its own pull request is still open, or its commits are not
 * merged and the close names nowhere else the work went", and for the
 * task's own pull request: "Leave it open where the project lives, and say
 * so on the record".
 */
import type { Card } from "@shared/cards";
import { deliveryFactsOf } from "@shared/deliveryFacts";
import { describe, expect, it } from "vitest";
import {
  HEAD,
  PR,
  type SettleWorld,
  settleWorld,
  TASK,
} from "../../../tests/helpers/settleHarness";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import type { ForgePull } from "../forge";
import { seedTask } from "../tasks/seedTask";

const EVIDENCE = "The meter reads on time on the bench.";
const WORDS = "Close the meter task, the pull request can stay.";

/** The facts the close recorded on its close event. */
function recorded(world: SettleWorld) {
  const close = world.tasks.timeline(TASK).find((event) => event.data?.deliveryFacts);
  return { data: close?.data ?? undefined, facts: deliveryFactsOf(close?.data ?? undefined) };
}

/** A reproduce step the first mate declared (`internal_step`), its answer reported. */
const STEP = "meter-step";
function answerStep(world: SettleWorld, status: "idle" | "queued" = "idle"): void {
  world.live.deliverable = "answer";
  seedTask(world.tasks, {
    id: STEP,
    title: "Reproduce the slow meter",
    status,
    repoId: "project",
    repoDir: "/not-mounted/project",
    ...(status === "idle"
      ? { worktreeDir: "/not-mounted/step", branch: "fm/task-step", outcome: "It reproduces." }
      : {}),
    shape: { kind: "research", deliverable: "answer", internal_step: true },
  });
}

function merged(number: number): ForgePull {
  return {
    number,
    state: "closed",
    merged: true,
    mergedSha: "b".repeat(40),
    headSha: "c".repeat(40),
    base: "main",
    readiness: "clean",
  };
}

describe("the task's own pull request", () => {
  it("holds the first mate's own close while it reads open, and the captain's words leave it open and say so", async () => {
    const world = settleWorld();
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain(`its own pull request #${PR} is still open`);
    expect(held.text).toContain("Soft hold proof");
    expect(world.tasks.get(TASK)?.status).toBe("active");

    const closed = await world.done.close(TASK, {
      why: "finished",
      evidence: EVIDENCE,
      captainWords: WORDS,
    });
    expect(closed).toMatchObject({ ok: true });
    expect(closed.text).toContain("as finished on the captain's word");
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "finished" });
    // Left open where the project lives: the close sends nothing to it.
    expect(world.log).not.toContain("close pull request: active/none");
    const { data, facts } = recorded(world);
    expect(data).toMatchObject({ captainWords: WORDS, onWord: true, why: "finished" });
    expect(facts).toContainEqual({
      kind: "pull-request",
      basis: "checked",
      text: `Its own pull request #${PR} is still open`,
    });
  });

  it("closes over one it cannot read, recording it unread", async () => {
    const world = settleWorld();
    world.live.pull = undefined;
    const closed = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(closed).toMatchObject({ ok: true });
    expect(recorded(world).facts).toContainEqual({
      kind: "pull-request",
      basis: "unread",
      text: `Its own pull request #${PR} could not be read`,
    });
  });
});

describe("the captain's words pass every soft hold", () => {
  it.each([
    {
      hold: "decisions",
      arrange: (world: SettleWorld) =>
        world.cards.put({
          id: "card-meter-question",
          taskId: TASK,
          author: "crewmate",
          priority: 1,
          title: "Which meter reads first?",
          meta: TASK,
          body: "<p>Which meter reads first?</p>",
          actions: [
            { id: "left", label: "The left one", default: true },
            { id: "right", label: "The right one" },
          ],
          status: "ready",
          createdAt: 1_000,
        }),
    },
    {
      hold: "parts",
      arrange: (world: SettleWorld) =>
        seedTask(world.tasks, {
          id: "meter-part",
          title: "Label the meter",
          parentId: TASK,
          status: "queued",
        }),
    },
    {
      hold: "waits",
      arrange: (world: SettleWorld) => {
        seedTask(world.tasks, { id: "meter-check", title: "Check the meter", status: "idle" });
        world.tasks.graph.link("meter-check", TASK, "blocks", "firstmate", true);
      },
    },
    {
      hold: "proof",
      // Its crewmate has not reported.
      arrange: (world: SettleWorld) =>
        world.db.prepare("UPDATE tasks SET outcome = NULL WHERE id = ?").run(TASK),
    },
  ])("$hold", async ({ hold, arrange }) => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    arrange(world);
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain(`Soft hold ${hold}`);
    expect(world.tasks.get(TASK)?.status).toBe("active");

    const closed = await world.done.close(TASK, {
      why: "finished",
      evidence: EVIDENCE,
      captainWords: WORDS,
    });
    expect(closed).toMatchObject({ ok: true });
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "finished" });
  });

  it("records an answer the captain's words closed with no report as reported none", async () => {
    // Review finding: the close's text and data must agree with its fact.
    const world = settleWorld();
    world.live.pull = merged(PR);
    world.db.prepare("UPDATE tasks SET outcome = NULL WHERE id = ?").run(TASK);
    const closed = await world.done.close(TASK, { why: "answered", captainWords: WORDS });
    expect(closed).toMatchObject({ ok: true });
    const close = world.tasks
      .timeline(TASK)
      .find((event) => event.data?.deliveryFacts && event.text?.startsWith("answered"));
    expect(close?.text).toBe("answered - its crewmate reported no answer");
    expect(close?.data).toMatchObject({ reported: false });
    expect(recorded(world).facts).toContainEqual(
      expect.objectContaining({ kind: "answer", text: "Its crewmate reported no answer" }),
    );
  });

  it("honours a recorded override on the parts hold, keeping the part planned", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    seedTask(world.tasks, {
      id: "meter-part",
      title: "Label the meter",
      parentId: TASK,
      status: "queued",
    });
    seedDelivery(world.tasks, TASK, {
      override: { words: WORDS, holds: ["parts"], until: "task", at: 1_000 },
    });
    const closed = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(closed).toMatchObject({ ok: true });
    expect(world.tasks.get("meter-part")?.status).toBe("open");
    expect(recorded(world).facts.map((fact) => fact.kind)).toContain("parts");
  });
});

describe("why the work is done", () => {
  it("merged names any merged pull request in its project, and holds one that does not read merged", async () => {
    const world = settleWorld();
    seedDelivery(world.tasks, TASK, { prNumber: undefined, headSha: undefined });
    world.live.pull = { ...merged(65), state: "open", merged: false };
    const held = await world.done.close(TASK, {
      why: "merged",
      deliveredIn: "#65",
      evidence: EVIDENCE,
    });
    expect(held.text).toContain("does not read merged");
    expect(world.tasks.get(TASK)?.status).toBe("active");

    world.live.pull = merged(65);
    const closed = await world.done.close(TASK, { why: "merged", deliveredIn: "#65" });
    expect(closed).toMatchObject({ ok: true });
    expect(closed.text).toContain("Merged in pull request #65");
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "merged" });
    expect(recorded(world).facts).toContainEqual(
      expect.objectContaining({ kind: "pull-request", basis: "checked" }),
    );
  });

  it("merged names a commit on the main branch, and holds one that is not on it", async () => {
    // Proof read finding: a commit on main, not only a pull request, is where the work went.
    const world = settleWorld();
    const commit = "d".repeat(40);
    // Its own pull request closed unmerged; its commits went in another way.
    world.live.pull = { ...merged(PR), merged: false, headSha: HEAD };
    world.live.work = { dirty: false, unlandedCommits: 2 };
    world.live.onMain = false;
    const held = await world.done.close(TASK, { why: "merged", deliveredIn: commit });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain("does not read merged");
    expect(world.tasks.get(TASK)?.status).toBe("active");

    world.live.onMain = true;
    const closed = await world.done.close(TASK, { why: "merged", deliveredIn: commit });
    expect(closed).toMatchObject({ ok: true });
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "merged" });
    expect(recorded(world).facts).toContainEqual(
      expect.objectContaining({ kind: "commit", basis: "checked" }),
    );
  });

  it("refuses what no words change: missing evidence, a missing carrier and an unreadable name", async () => {
    const world = settleWorld();
    for (const [input, refusal] of [
      [{ why: "released" as const }, "released needs evidence"],
      [{ why: "finished" as const }, "finished needs evidence"],
      [{ why: "carried_on" as const }, "carried_on needs carried_by"],
    ] as const) {
      const answer = await world.done.close(TASK, { ...input, captainWords: WORDS });
      expect(answer).toMatchObject({ ok: false });
      expect(answer.text).toContain(refusal);
    }
    expect(world.tasks.get(TASK)?.status).toBe("active");
  });

  it("carried_on by a part of its own closes it, keeps the part planned and closes its own pull request", async () => {
    const world = settleWorld();
    seedTask(world.tasks, {
      id: "meter-part",
      title: "Label the meter",
      parentId: TASK,
      status: "queued",
    });
    const closed = await world.done.close(TASK, { why: "carried_on", carriedBy: "meter-part" });
    expect(closed).toMatchObject({ ok: true });
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "superseded" });
    expect(world.tasks.get("meter-part")?.status).toBe("open");
    expect(world.tasks.graph.replacementOf(TASK)).toBe(world.tasks.get("meter-part")?.key);
    expect(world.log).toContain("close pull request: active/none");
    expect(recorded(world).facts).toContainEqual(
      expect.objectContaining({
        kind: "pull-request",
        text: `Its own pull request #${PR} was open`,
      }),
    );
  });

  it("carried_on by a part of its own still holds for an open sibling part, wherever the carrier sits under it", async () => {
    // Review finding on the plan's own part rule: the carrier holds nothing,
    // and every other open part still holds the first mate's own close.
    const world = settleWorld();
    seedTask(world.tasks, {
      id: "meter-group",
      title: "Meter parts",
      parentId: TASK,
      status: "queued",
    });
    seedTask(world.tasks, {
      id: "meter-part",
      title: "Label the meter",
      parentId: "meter-group",
      status: "queued",
    });
    seedTask(world.tasks, {
      id: "meter-box",
      title: "Box the meter",
      parentId: TASK,
      status: "queued",
    });
    const held = await world.done.close(TASK, { why: "carried_on", carriedBy: "meter-part" });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain("Box the meter");
    expect(held.text).not.toContain("Meter parts");
    expect(held.text).toContain("Soft hold parts");
    expect(world.tasks.get(TASK)?.status).toBe("active");

    world.tasks.dropWithChildren("meter-box", { reason: "superseded", actor: "captain" });
    const closed = await world.done.close(TASK, { why: "carried_on", carriedBy: "meter-part" });
    expect(closed).toMatchObject({ ok: true });
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "superseded" });
  });

  it("holds unmerged work the close names nowhere else, and closes it once a release names where it went", async () => {
    const world = settleWorld();
    // Its own pull request closed without merging, so the work went nowhere yet.
    world.live.pull = { ...merged(PR), merged: false, headSha: HEAD };
    world.live.work = { dirty: true, unlandedCommits: 2 };
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held.text).toContain("the close names nowhere else it went");
    const closed = await world.done.close(TASK, { why: "released", evidence: "Version 1.2.3" });
    expect(closed).toMatchObject({ ok: true });
    expect(recorded(world).facts).toContainEqual({
      kind: "work",
      basis: "checked",
      text: "2 commits not on the main branch and uncommitted edits, saved",
    });
  });

  // The captain on the review finding: "Yes: the task built on it counts as
  // where the work went" - a step that wrote its failing check closes answered.
  it.each([
    {
      to: "builds on it",
      arrange: (world: SettleWorld) =>
        seedTask(world.tasks, {
          id: "meter-fix",
          title: "Fix the meter",
          status: "queued",
          shape: { kind: "fix", basis: world.tasks.get(STEP)?.key ?? STEP },
        }),
    },
    {
      to: "waits on it",
      arrange: (world: SettleWorld) => {
        seedTask(world.tasks, { id: "meter-fix", title: "Fix the meter", status: "queued" });
        world.tasks.graph.link(STEP, "meter-fix", "blocks", "firstmate");
      },
    },
  ])(
    "closes an answer step whose working copy holds work when a live task $to, saving the copy",
    async ({ arrange }) => {
      const world = settleWorld();
      answerStep(world);
      // The step's copy holds the failing check it wrote.
      world.live.work = { dirty: true, unlandedCommits: 1 };
      const held = await world.done.close(STEP, { why: "answered" });
      expect(held.text).toContain("the close names nowhere else it went");

      arrange(world);
      const closed = await world.done.close(STEP, { why: "answered" });
      expect(closed).toMatchObject({ ok: true });
      expect(world.tasks.get(STEP)).toMatchObject({ status: "done", closedReason: "answered" });
      const close = world.tasks.timeline(STEP).find((event) => event.data?.deliveryFacts);
      expect(deliveryFactsOf(close?.data ?? undefined)).toContainEqual({
        kind: "work",
        basis: "checked",
        text: "1 commit not on the main branch and uncommitted edits, saved",
      });
    },
  );

  // Re-review finding: the ruling covers a started answer step only, never
  // an unstarted task or a change task that a live task waits on.
  it.each([
    {
      task: "an unstarted task",
      arrange: (world: SettleWorld) => {
        answerStep(world, "queued");
        return {
          id: STEP,
          words: "it has not started, and the close names nowhere else its work went",
        };
      },
    },
    {
      task: "a change task with unmerged commits and no open pull request",
      arrange: (world: SettleWorld) => {
        // Its own pull request closed unmerged, so it holds none open.
        world.live.pull = { ...merged(PR), merged: false, headSha: HEAD };
        world.live.work = { dirty: false, unlandedCommits: 2 };
        return {
          id: TASK,
          words:
            "its working copy holds work that is not merged, and the close names nowhere else it went",
        };
      },
    },
  ])("holds an answered close alone of $task a live task waits on", async ({ arrange }) => {
    const world = settleWorld();
    const { id, words } = arrange(world);
    seedTask(world.tasks, { id: "meter-fix", title: "Fix the meter", status: "queued" });
    world.tasks.graph.link(id, "meter-fix", "blocks", "firstmate");
    const held = await world.done.close(id, { why: "answered" });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain(words);
    expect(held.text).toContain("Soft hold proof");
    expect(world.tasks.get(id)?.status).not.toBe("done");
  });
});

describe("guidance its crewmate never took", () => {
  it("INF-3307 audit: a steer set aside after three refusals no longer holds the first mate's close", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    const id = world.inbox.enqueue(TASK, "Re-run the meter bench with the new clock.");
    // Three refused deliveries spend the ladder, and the crew watch sets it aside.
    for (let attempt = 0; attempt < 3; attempt++) {
      world.inbox.markDelivered([id]);
      world.inbox.release([id]);
    }
    world.inbox.markEscalated(id);
    const closed = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(closed.text).not.toContain("guidance is still queued");
    expect(closed).toMatchObject({ ok: true });
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "finished" });
  });

  it("INF-3307 audit: guidance still waiting to be delivered holds the close", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    world.inbox.enqueue(TASK, "Re-run the meter bench with the new clock.");
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain("guidance is still queued for its crewmate");
    expect(world.tasks.get(TASK)?.status).toBe("active");
  });

  // INF-4072, finding 4 (the captain started "a refused close names the
  // waiting message and lets the first mate drop it"): INF-3807's close
  // was refused for guidance its idle crewmate would never take.
  it("INF-4072: a refused close names the waiting message, and dropping it lets the close through", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    const id = world.inbox.enqueue(TASK, "Re-run the meter bench with the new clock.");
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain(
      `drop_waiting [${id}], which drops it as the close goes through. Waiting: message ${id}, queued 0m ago and not delivered yet: "Re-run the meter bench with the new clock."`,
    );

    const closed = await world.done.close(TASK, {
      why: "finished",
      evidence: EVIDENCE,
      dropWaiting: [id],
    });
    expect(closed).toMatchObject({ ok: true });
    expect(closed.text.startsWith(`Dropped message ${id} from its crewmate's lane.`)).toBe(true);
    expect(world.inbox.get(id)).toBeUndefined();
    expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "finished" });
    expect(
      world.tasks
        .timeline(TASK)
        .some(
          (event) =>
            event.actor === "firstmate" &&
            event.text?.includes(
              'dropped guidance waiting for its crewmate: "Re-run the meter bench',
            ),
        ),
    ).toBe(true);
  });

  it("INF-4072: a message handed to a turn that never finished with it is named and dropped", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    const id = world.inbox.enqueue(TASK, "Re-run the meter bench with the new clock.");
    world.inbox.markDelivered([id]);
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held.text).toContain(
      `message ${id}, queued 0m ago and handed to a turn that never finished with it`,
    );

    const closed = await world.done.close(TASK, {
      why: "finished",
      evidence: EVIDENCE,
      dropWaiting: [id],
    });
    expect(closed).toMatchObject({ ok: true });
    expect(world.inbox.inFlight(TASK)).toEqual([]);
    expect(world.inbox.get(id)).toBeUndefined();
  });

  // INF-4136's review: the captain's own words, never the host's lead before
  // them, and a cut that never splits a character.
  it("INF-4072: a waiting card reply is named by the captain's words, cut at a character", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    const words = `take the northern route ${"🧭".repeat(200)}`;
    const id = world.inbox.enqueue(TASK, {
      facts: { kind: "thread-reply", card: { id: "card-course", title: "Pick a course" }, words },
    });
    const held = await world.done.close(TASK, { why: "finished", evidence: EVIDENCE });
    expect(held.text).toContain(
      `Waiting: message ${id}, queued 0m ago and not delivered yet: "take the northern route 🧭`,
    );
    expect(held.text).not.toContain("Pick a course");
    // No half of a character is left behind.
    expect(held.text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
    expect(held.text).toContain('🧭…"');
  });

  // The captain's pick on INF-4136's review: "Delete the messages only when
  // the close actually goes through".
  it("INF-4072: a close refused for anything else keeps the messages it named", async () => {
    const world = settleWorld();
    world.live.pull = { ...merged(PR), state: "open", merged: false, mergedSha: undefined };
    const id = world.inbox.enqueue(TASK, "Re-run the meter bench with the new clock.");
    const held = await world.done.close(TASK, {
      why: "finished",
      evidence: EVIDENCE,
      dropWaiting: [id],
    });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).not.toContain("guidance is still queued");
    expect(held.text).not.toContain("Dropped message");
    expect(world.inbox.get(id)).toBeDefined();
    expect(world.tasks.get(TASK)?.status).toBe("active");
    expect(
      world.tasks.timeline(TASK).some((event) => event.text?.includes("dropped guidance")),
    ).toBe(false);
  });

  it("INF-4072: a message is never dropped while its crewmate works, and one the close did not name stays", async () => {
    const world = settleWorld();
    world.live.pull = merged(PR);
    const id = world.inbox.enqueue(TASK, "Re-run the meter bench with the new clock.");
    seedTask(world.tasks, { id: "busy", title: "Busy", status: "running" });
    const busy = world.inbox.enqueue("busy", "Check the clock drift.");
    const refused = await world.done.close("busy", {
      why: "finished",
      evidence: EVIDENCE,
      dropWaiting: [busy],
    });
    expect(refused).toMatchObject({ ok: false });
    expect(refused.text).toContain("a waiting message is dropped only while it is idle");
    expect(world.inbox.get(busy)).toBeDefined();

    // An id waiting for another task's crewmate is left alone.
    const other = await world.done.close(TASK, {
      why: "finished",
      evidence: EVIDENCE,
      dropWaiting: [busy],
    });
    expect(other).toMatchObject({ ok: false });
    expect(other.text).toContain(`Waiting: message ${id},`);
    expect(world.inbox.get(busy)).toBeDefined();
  });
});

// INF-4526, from the weekly reach audit the captain answered "Drop a level
// now: it passes by itself when the follow-up started from your reply on
// its card", scoped on that card to an answer task whose card the captain
// replied under. INF-4191's case: the captain replied under the answer
// card asking for deeper work, the first mate started the carrier naming
// that card, and the close as carried on was refused until an override.
describe("an answer carried on by the task the captain's reply under its card started", () => {
  const ANSWER = "split-check";
  const ANSWER_CARD = `card-${ANSWER}-10`;
  const CARRIER = "split-explain";
  const REPLY =
    "ok i want a clear architectural explanation how this aspect works holistically, done by a fable crewmate";

  /** The answer task, its crewmate's card with the captain's reply under it, and the task he asked for. */
  function answered(world: SettleWorld, card: { actions?: Card["actions"]; id?: string } = {}) {
    world.live.deliverable = "answer";
    seedTask(world.tasks, {
      id: ANSWER,
      title: "Check if the view and background split is done",
      status: "idle",
      repoId: "project",
      repoDir: "/not-mounted/project",
      worktreeDir: "/not-mounted/split-check",
      branch: "fm/task-split-check",
      outcome: "All seven pieces of the split are merged and in the latest alpha.",
      shape: { kind: "research", deliverable: "answer" },
    });
    const id = card.id ?? ANSWER_CARD;
    world.cards.put({
      id,
      taskId: ANSWER,
      author: id.startsWith("card-fm-") ? "firstmate" : "crewmate",
      priority: 15,
      title: "The view and background split is in the latest alpha",
      meta: ANSWER,
      body: "<p>Yes: all seven planned pieces are merged and in the latest alpha.</p>",
      actions: card.actions ?? [],
      status: "ready",
      createdAt: 1_000,
    });
    const reply = world.cards.addMessage(id, "captain", REPLY);
    seedTask(world.tasks, {
      id: CARRIER,
      title: "Explain how the view and background split works",
      status: "queued",
      shape: {
        kind: "research",
        deliverable: "answer",
        basis: world.tasks.get(ANSWER)?.key ?? ANSWER,
      },
    });
    return {
      start: () =>
        world.tasks.capture.recordStartedFromCard(CARRIER, { cardId: id, reply: reply.id }),
    };
  }

  it.each([
    {
      card: "still up",
      arrange: () => {},
      refusal: 'its answer "The view and background split is in the latest alpha" is still up',
    },
    {
      card: "withdrawn by its crewmate",
      arrange: (world: SettleWorld) =>
        world.cards.close(ANSWER_CARD, { kind: "crewmate", taskId: ANSWER }, "Passed on."),
      refusal: "the captain asked for its answer",
    },
  ])(
    "closes once the carrier started from his reply, its card $card",
    async ({ arrange, refusal }) => {
      const world = settleWorld();
      const { start } = answered(world);
      arrange(world);
      const held = await world.done.close(ANSWER, { why: "carried_on", carriedBy: CARRIER });
      expect(held).toMatchObject({ ok: false });
      expect(held.text).toContain(refusal);
      expect(held.text).toContain("Soft hold decisions");

      start();
      const closed = await world.done.close(ANSWER, { why: "carried_on", carriedBy: CARRIER });
      expect(closed).toMatchObject({ ok: true });
      expect(world.tasks.get(ANSWER)).toMatchObject({ status: "done", closedReason: "superseded" });
      expect(world.tasks.graph.replacementOf(ANSWER)).toBe(world.tasks.get(CARRIER)?.key);
    },
  );

  it.each([
    {
      hold: "its card still asks",
      arrange: (world: SettleWorld) =>
        answered(world, { actions: [{ id: "deeper", label: "Look deeper", default: true }] }),
      refusal: "still asks the captain",
    },
    {
      hold: "it waits on the captain",
      arrange: (world: SettleWorld) => {
        const answer = answered(world);
        seedDelivery(world.tasks, ANSWER, {
          captainWait: { reason: "Read the result", at: 1_000 },
        });
        return answer;
      },
      refusal: "it still waits on the captain's decision",
    },
    {
      hold: "his reply was under the first mate's card, not its answer",
      arrange: (world: SettleWorld) => answered(world, { id: "card-fm-split" }),
      refusal: "the captain asked for its answer",
    },
  ])("still holds when $hold", async ({ arrange, refusal }) => {
    const world = settleWorld();
    arrange(world).start();
    const held = await world.done.close(ANSWER, { why: "carried_on", carriedBy: CARRIER });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain(refusal);
    expect(held.text).toContain("Soft hold decisions");
    expect(world.tasks.get(ANSWER)?.status).toBe("active");
  });

  it("still holds a close carried on by a task his reply did not start", async () => {
    const world = settleWorld();
    answered(world).start();
    seedTask(world.tasks, { id: "split-other", title: "Tidy the split docs", status: "queued" });
    const held = await world.done.close(ANSWER, { why: "carried_on", carriedBy: "split-other" });
    expect(held).toMatchObject({ ok: false });
    expect(held.text).toContain("Soft hold decisions");
    expect(world.tasks.get(ANSWER)?.status).toBe("active");
  });
});

// INF-3418, the captain's words on the card it explained: "that whole card
// was super confusing. figure out why it even showed, and why so many wrong
// data". Closing INF-1706 as carried on by INF-1109 followed INF-1109's old
// replaced-by link to INF-1643, dropped two weeks before, and wrote that
// drop's closing line onto the card answering the captain's message.
describe("a carried-on close whose carrier was once handed to a task dropped since", () => {
  const CARRIER = "meter-carrier";
  const DROPPED = "meter-dropped";
  const CARD = "card-meter-merged";
  const OLD_LINE = "The meter repairs moved to their own pull request, which the carrier offers.";

  /** The captain's message about the meter, answered by the meter's merge card he accepted. */
  async function carriedOnce(world: SettleWorld, handedToDropped: boolean) {
    world.tasks.capture.openAsk({ id: "meter-ask", text: "Make the meter read on time." });
    world.tasks.capture.attachAsk("meter-ask", TASK, "tool:spawn_crewmate");
    world.cards.put({
      id: CARD,
      taskId: TASK,
      author: "crewmate",
      priority: 15,
      title: "The meter reads on time",
      meta: TASK,
      body: "<p>The meter reads on time on the bench.</p>",
      actions: [],
      status: "ready",
      createdAt: 1_000,
    });
    world.tasks.capture.acceptAnswer("meter-ask", CARD);
    seedTask(world.tasks, { id: CARRIER, title: "Carry the meter on", status: "running" });
    seedTask(world.tasks, { id: DROPPED, title: "Repair the meter", status: "running" });
    // The carrier's work once moved to the task dropped later; the link stayed.
    if (handedToDropped) world.tasks.graph.link(CARRIER, DROPPED, "replaced-by", "firstmate");
    await world.closing.withClosingSentence(DROPPED, OLD_LINE, () =>
      world.closing.closeTask(DROPPED, {
        status: "dropped",
        reason: "cancelled",
        actor: "firstmate",
      }),
    );
    expect(world.tasks.get(DROPPED)?.status).toBe("dropped");
    expect(world.cards.get(CARD)?.body).not.toContain(OLD_LINE);
  }

  // The control INF-3418 did not finish runs the same close without the old link.
  it.each([
    { handedToDropped: true, link: "with" },
    { handedToDropped: false, link: "without" },
  ])(
    "never writes the dropped task's old line on the answer, $link the old link",
    async ({ handedToDropped }) => {
      const world = settleWorld();
      await carriedOnce(world, handedToDropped);

      const closed = await world.done.close(TASK, { why: "carried_on", carriedBy: CARRIER });

      expect(closed).toMatchObject({ ok: true });
      expect(world.tasks.get(TASK)).toMatchObject({ status: "done", closedReason: "superseded" });
      const card = world.cards.get(CARD);
      expect(card?.body).not.toContain(OLD_LINE);
      expect(card?.body).not.toContain("dropped");
    },
  );
});
