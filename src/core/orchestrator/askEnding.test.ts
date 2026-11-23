import { type Card, FIRSTMATE_CARD_META } from "@shared/cards";
import { describe, expect, it, vi } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import { TaskEventStore } from "../storage/taskEventStore";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { AskEnding } from "./askEnding";
import { pendingMergeLine } from "./settleWords";

/**
 * How a captain's message ends (INF-1610 piece 2, the captain's approved
 * plan "each of your asks ends on a card you accept"; docs/task-capture.md
 * "How a message ends"): over a real task graph and a card stack, with one
 * clock so "shown since the message" is an order, never a wall-clock window.
 */
function fixture() {
  const clock = { t: 1_000 };
  const now = () => clock.t;
  const db = freshDatabase();
  const tasks = new TaskService({ db, strict: true, now });
  const open = new Map<string, Card>();
  const stored = new Map<string, Card>();
  const shown = new Map<string, number>();
  const ending = new AskEnding({
    tasks,
    openCards: () => open.values(),
    storedCard: (id) => stored.get(id),
    shownAt: (card) => shown.get(card.id) ?? 0,
    seenCards: () => [],
  });
  const later = () => {
    clock.t += 1_000;
    return clock.t;
  };
  /** The captain sends a message; the first mate's tool attaches it to its work. */
  const message = (
    id: string,
    text: string,
    taskId?: string,
    via: `tool:${string}` = "tool:spawn_crewmate",
  ) => {
    later();
    tasks.capture.openAsk({ id, text });
    if (taskId) tasks.capture.attachAsk(id, taskId, via);
    tasks.capture.closeAsk(id, "closed");
    return id;
  };
  const work = (id: string, title: string, status: "running" | "idle" | "queued" = "running") => {
    later();
    return seedTask(tasks, { id, title, status });
  };
  const show = (card: Partial<Card> & Pick<Card, "id" | "title">): Card => {
    const full: Card = {
      author: "firstmate",
      priority: 30,
      meta: "",
      body: `<p>${card.title}.</p>`,
      actions: [],
      status: "ready",
      createdAt: clock.t,
      ...card,
    };
    open.set(full.id, full);
    stored.set(full.id, full);
    shown.set(full.id, later());
    return full;
  };
  const closeCard = (id: string) => open.delete(id);
  const finish = (taskId: string) => {
    later();
    tasks.close(taskId, { status: "done", reason: "answered", actor: "host" });
  };
  const state = (askId: string) => {
    const thread = ending.thread(askId);
    if (!thread) throw new Error(`No thread for ${askId}`);
    return ending.state(thread);
  };
  return { db, tasks, ending, message, work, show, closeCard, finish, state, later };
}

const MERGE = {
  id: "merge",
  label: "Merge",
  default: true,
  effect: { kind: "merge", after: "close" },
};

describe("how a captain's message ends", () => {
  it("runs while its work runs, asks the last crewmate once, and ends on the note the captain closed", () => {
    const f = fixture();
    f.work("panels", "Build personal panels in isolation");
    f.message("m1", "build the personal panels in isolation", "panels");
    expect(f.state("m1")).toEqual({ kind: "working" });

    // Its crewmate reports finished with no answer up: asked once, never twice.
    expect(f.ending.crewmateStep("panels").map((thread) => thread.ask.id)).toEqual(["m1"]);
    expect(f.ending.crewmateStep("panels")).toEqual([]);

    const answer = f.show({
      id: "card-panels-1",
      taskId: "panels",
      author: "crewmate",
      title: "Personal panels now build in isolation",
      answering: true,
    });
    f.finish("panels");
    expect(f.state("m1")).toEqual({ kind: "waiting", cardId: answer.id });

    // A closed note is accepted; the ending is final once nothing is left.
    f.ending.captainResponded(answer, "close");
    f.closeCard(answer.id);
    expect(f.state("m1")).toEqual({ kind: "accepted", cardId: answer.id });
    f.tasks.capture.markAnswered("m1", answer.id);
    expect(f.state("m1")).toEqual({ kind: "answered", cardId: answer.id });
    expect(f.ending.openThreads()).toEqual([]);
  });

  // INF-2664: the first mate names which message its work serves; the host
  // checks only that the message is open and that a finished reply read it.
  it("lets any open message a finished reply read be named, and refuses an unread or ended one", () => {
    const f = fixture();
    f.message("read", "why is my mac mini having memory pressure warning?");
    expect(f.ending.nameRefusal("read")).toBeUndefined();
    f.tasks.capture.openAsk({ id: "parked", text: "and the other mac?" });
    expect(f.ending.nameRefusal("parked")).toMatch(/a step has read/);
    f.tasks.capture.markAnswered("read", null);
    expect(f.ending.nameRefusal("read")).toMatch(/has ended/);
  });

  it("needs its answer now when it only pointed at work nobody acted on", () => {
    const f = fixture();
    f.work("t58", "Check if PR 58 merged", "idle");
    f.message("m1", "is PR 58 merged?", "t58", "host:fallback" as `tool:${string}`);
    expect(f.state("m1")).toEqual({ kind: "missing" });
  });

  // INF-6115: every message keeps its own thread; two messages about the
  // same work end on the same card, each accepted on its own.
  it("keeps a later message about the same open work in its own thread, and both end on the same card", () => {
    const f = fixture();
    f.work("taps", "Keep taps on the phone");
    f.message("m1", "the taps on the phone get lost", "taps");
    f.message("m2", "also the long press", "taps", "tool:steer_crewmate");
    expect(f.tasks.capture.getAsk("m2")?.continues).toBeNull();
    expect(f.ending.openThreads().map((thread) => thread.ask.id)).toEqual(["m1", "m2"]);
    const answer = f.show({
      id: "card-taps-1",
      taskId: "taps",
      author: "crewmate",
      title: "Taps and long presses kept",
      answering: true,
    });
    f.finish("taps");
    f.ending.captainResponded(answer, "close");
    expect(f.tasks.capture.getAsk("m1")?.answerCardId).toBe(answer.id);
    expect(f.tasks.capture.getAsk("m2")?.answerCardId).toBe(answer.id);
  });

  it("counts an answer for each message only when it was shown since that message", () => {
    const f = fixture();
    f.work("taps", "Keep taps on the phone");
    f.message("m1", "the taps on the phone get lost", "taps");
    const early = f.show({
      id: "card-taps-1",
      taskId: "taps",
      title: "Taps kept",
      answering: true,
    });
    f.message("m2", "also the long press", "taps", "tool:steer_crewmate");
    f.finish("taps");
    // The card predates the second message: it answers the first alone.
    expect(f.state("m1")).toEqual({ kind: "waiting", cardId: early.id });
    expect(f.state("m2")).toEqual({ kind: "missing" });
    f.ending.captainResponded(early, "close");
    expect(f.tasks.capture.getAsk("m1")?.answerCardId).toBe(early.id);
    expect(f.tasks.capture.getAsk("m2")?.answerCardId).toBeNull();
  });

  it("is not answered by a decision closed without a choice, by a card awaiting its author's answer, or by a choice on a question", () => {
    const f = fixture();
    f.work("plan", "Plan the stack order");
    f.message("m1", "did something change about how we order the cards in the stack?", "plan");
    f.finish("plan");
    const decision = f.show({
      id: "card-plan-1",
      taskId: "plan",
      title: "Pick how the stack orders",
      answering: true,
      actions: [{ id: "a", label: "Keep it", default: true }],
    });
    f.ending.captainResponded(decision, "close");
    f.ending.captainResponded({ ...decision, awaiting: "answer" }, "choice");
    f.ending.captainResponded({ ...decision, asking: true }, "choice");
    expect(f.tasks.capture.getAsk("m1")?.acceptedAt).toBeNull();
    // Their choice on the decision is the answer.
    f.ending.captainResponded(decision, "choice");
    expect(f.tasks.capture.getAsk("m1")?.answerCardId).toBe(decision.id);
  });

  // INF-2242: the exception requires the actual terminal answer-task choice,
  // not merely the same project, a question or a button named Start.
  it.each([
    "ready plan",
    "unrelated ask",
    "older offer",
    "pending reply",
    "continues",
    "held write",
    "browser handoff",
    "build task",
    "unmarked",
    "firstmate card",
    "invalid action",
    "dismissed decision",
  ])("limits chosen-plan acceptance: %s", (scenario) => {
    const f = fixture();
    f.later();
    seedTask(f.tasks, {
      id: "reading",
      title: "Plan a reading-style feature",
      status: "running",
      shape: { kind: "plan", deliverable: scenario === "build task" ? "change" : "answer" },
    });
    f.work("other", "Investigate a separate failure");
    f.message("reading-ask", "How could a reading-style feature work?", "reading");
    f.message("other-ask", "Why did the build fail?", "other");
    const card = f.show({
      id: scenario === "firstmate card" ? "card-fm-reading" : "card-reading-plan",
      taskId: "reading",
      author: scenario === "firstmate card" ? "firstmate" : "crewmate",
      title: "A reading-style plan",
      answering: scenario === "unmarked" ? undefined : true,
      asking: true,
      actions: [{ id: "start", label: "Start", default: true }],
      ...(scenario === "pending reply" ? { awaiting: "answer" as const } : {}),
      ...(scenario === "continues" ? { continues: true as const } : {}),
      ...(scenario === "held write"
        ? {
            actions: [
              {
                id: "start",
                label: "Allow",
                default: true,
                effect: { kind: "request_write", ask: "held-write" },
              },
            ],
          }
        : {}),
    });
    if (scenario === "browser handoff") {
      card.attachment = {
        kind: "browser",
        label: "Sign in",
        taskId: "reading",
        session: "reading-browser",
        generation: 1,
        handoff: true,
      };
    }
    if (scenario === "older offer")
      f.message("clarification", "Also check rights before proposing the design", "reading");
    f.ending.captainResponded(
      card,
      scenario === "dismissed decision" ? "close" : "choice",
      scenario === "invalid action" ? "not-an-offer" : "start",
    );
    expect(f.tasks.capture.getAsk("other-ask")?.answerCardId).toBeNull();
    // A message sent after the offer is not answered by it; the message the
    // offer was shown for still is (INF-6115: each message ends on its own).
    expect(f.tasks.capture.getAsk("reading-ask")?.answerCardId).toBe(
      scenario === "ready plan" || scenario === "unrelated ask" || scenario === "older offer"
        ? card.id
        : null,
    );
    if (scenario === "older offer")
      expect(f.tasks.capture.getAsk("clarification")?.answerCardId).toBeNull();
  });

  it("keeps the message open when the captain's choice started more of its work", () => {
    const f = fixture();
    f.work("plan", "Plan the panels");
    f.message("m1", "plan the personal panels", "plan");
    const plan = f.show({
      id: "card-plan-1",
      taskId: "plan",
      title: "The panels plan",
      answering: true,
      actions: [{ id: "build", label: "Approve and build", default: true }],
    });
    f.finish("plan");
    f.ending.captainResponded(plan, "choice");
    f.closeCard(plan.id);
    // The approval files and starts the build, which builds on the plan.
    f.later();
    seedTask(f.tasks, {
      id: "build",
      title: "Build the panels",
      status: "running",
      parentId: "plan",
    });
    expect(f.state("m1")).toEqual({ kind: "working" });
  });

  it("revises the accepted answer when its work closes later, and puts up no new card (INF-1533)", () => {
    const f = fixture();
    f.work("fix", "Fix the reply line");
    f.message("m1", "the reply line is wrong", "fix");
    const done = f.show({
      id: "card-fix-1",
      taskId: "fix",
      author: "crewmate",
      title: "The reply line is fixed",
      actions: [MERGE] as Card["actions"],
    });
    f.ending.captainResponded(done, "choice");
    f.closeCard(done.id);
    expect(f.ending.closingPlace("fix")).toEqual({ kind: "revise", card: done, open: false });
  });

  it("revises the task's own note shown before a later message asked to merge it, and puts up no second note (INF-1219)", () => {
    const f = fixture();
    f.work("meter", "Fix the meter timing");
    f.message("m1", "fix the meter timing", "meter");
    const story = f.show({
      id: "card-meter-1",
      taskId: "meter",
      author: "crewmate",
      title: "fix: the meter reads on time",
      body: `<p>The meter reads on time.</p>${pendingMergeLine("project")}`,
    });
    f.message("m2", "merge the meter fix", "meter", "tool:merge_pr");
    expect(f.ending.closingPlace("meter")).toEqual({ kind: "revise", card: story, open: true });
  });

  // INF-2714: the first mate's answer to a crewmate's report is its own
  // note naming no task; its record saved the report as its origin, so the
  // message still ends on that note when the work closes, with no second
  // closing note beside it.
  it("ends a message on the first mate's own answer to its work's report, which names no task (INF-2714)", () => {
    const f = fixture();
    f.work("rent", "Compare owning and renting Mac CI runners");
    f.message("m1", "should we own or rent the Mac CI runners?", "rent");
    f.later();
    const record = f.tasks.capture.fileQuestion({
      id: "q-rent",
      title: "Renting the Mac runners costs less",
      outcome: "<p>Renting costs less until the third runner.</p>",
      cardId: "card-fm-4-a1b2c3",
    });
    f.tasks.capture.saveOrigin(record.id, { kind: "report", taskId: "rent" });
    const answer = f.show({
      id: "card-fm-4-a1b2c3",
      meta: FIRSTMATE_CARD_META,
      title: "Renting the Mac runners costs less",
      answering: true,
    });
    f.finish("rent");
    expect(f.state("m1")).toEqual({ kind: "waiting", cardId: answer.id });
    expect(f.ending.closingPlace("rent")).toEqual({ kind: "revise", card: answer, open: true });
  });

  it("stays quiet while a handover carries the work on, and answers once when the last work closes (INF-1437)", () => {
    const f = fixture();
    f.work("first", "Rename the notice");
    f.message("m1", "rename the notice", "first");
    f.work("second", "Rename the notice in the app project");
    f.tasks.graph.link("first", "second", "replaced-by", "firstmate");
    f.finish("first");
    expect(f.ending.closingPlace("first")).toEqual({ kind: "quiet" });
    expect(f.ending.crewmateStep("first")).toEqual([]);
    f.finish("second");
    expect(f.ending.closingPlace("second")).toEqual({ kind: "note", answering: true });
  });

  it("leaves work no message of the captain's covers to the rule for work the fleet started", () => {
    const f = fixture();
    f.work("runner", "Rebuild the runner image");
    expect(f.ending.closingPlace("runner")).toEqual({ kind: "unasked" });
    expect(f.ending.crewmateStep("runner")).toEqual([]);
  });

  // INF-2059 (the captain: "every several seconds it freezes for a few
  // seconds"): the context build read each message's tasks three times,
  // once for its work and twice more for what the first mate acted on.
  it("looks up each open message's tasks once while every thread's state and own work are read", () => {
    const f = fixture();
    f.work("panels", "Build personal panels");
    f.work("meter", "Fix the meter");
    f.message("m1", "build the personal panels", "panels");
    f.message("m2", "and give them a title", "panels", "tool:steer_crewmate");
    f.message("m3", "fix the meter", "meter");
    f.message("m4", "the meter is late again", "meter", "tool:steer_crewmate");
    f.message("m5", "check the meter on the phone too", "meter", "tool:steer_crewmate");
    const lookups = vi.spyOn(TaskEventStore.prototype, "askAttributions");
    try {
      const threads = f.ending.openThreads();
      const read = threads.map((thread) => ({
        id: thread.ask.id,
        state: f.ending.state(thread),
        own: f.ending.ownWork(thread).map((task) => task.id),
      }));
      expect(read).toEqual([
        { id: "m1", state: { kind: "working" }, own: ["panels"] },
        { id: "m2", state: { kind: "working" }, own: ["panels"] },
        { id: "m3", state: { kind: "working" }, own: ["meter"] },
        { id: "m4", state: { kind: "working" }, own: ["meter"] },
        { id: "m5", state: { kind: "working" }, own: ["meter"] },
      ]);
      expect(lookups.mock.calls.flatMap(([askIds]) => askIds).sort()).toEqual([
        "m1",
        "m2",
        "m3",
        "m4",
        "m5",
      ]);
    } finally {
      lookups.mockRestore();
    }
  });
});

/**
 * One thread per message (INF-6115, the captain's words on INF-6114: "i
 * suspect there's some messiness in how we attribute various things to
 * captain's asks hence causing this kind of mix up. i want a robust fix
 * from the root"): each message keeps its own thread, and a task belongs
 * to its nearest origin.
 */
describe("one thread per message", () => {
  const workOf = (f: ReturnType<typeof fixture>, askId: string) =>
    f.tasks.capture
      .askCoverage([askId])
      .work.map((task) => task.id)
      .sort();
  /** The record of a card raised on its task, as the card service writes it. */
  const raised = (f: ReturnType<typeof fixture>, card: Card) =>
    new TaskEventStore(f.db).insert({
      taskId: card.taskId ?? "",
      at: f.later(),
      actor: "crewmate",
      kind: "card_raised",
      text: card.title,
      ref: card.id,
    });

  // INF-6104's mix-up: a later message started its own fix built on an
  // earlier message's review, and the captain's choice on the fix's card
  // was taken as the earlier message's answer.
  it("keeps a task another message started out of the thread whose work it builds on", () => {
    const f = fixture();
    f.work("review", "Review the tooltip change");
    f.message("m1", "review the tooltip change", "review");
    f.later();
    const review = f.tasks.get("review");
    seedTask(f.tasks, {
      id: "fix",
      title: "Fix the tooltip delay",
      status: "running",
      shape: { kind: "implement", basis: review?.key },
    });
    f.message("m2", "fix the tooltip delay the review found", "fix");
    expect(workOf(f, "m1")).toEqual(["review"]);
    expect(workOf(f, "m2")).toEqual(["fix"]);
    expect(f.tasks.capture.asksAbove("fix").map((ask) => ask.id)).toEqual(["m2"]);
    const choice = f.show({
      id: "card-fix-1",
      taskId: "fix",
      author: "crewmate",
      title: "Pick the tooltip delay",
      answering: true,
      actions: [{ id: "short", label: "Short delay", default: true }],
    });
    f.ending.captainResponded(choice, "choice");
    expect(f.tasks.capture.getAsk("m2")?.answerCardId).toBe(choice.id);
    expect(f.tasks.capture.getAsk("m1")?.answerCardId).toBeNull();
    // The review's own message still waits on its own work.
    expect(f.state("m1")).toEqual({ kind: "working" });
  });

  it("keeps a build filed from a click on the plan's card, or from words its report passed on, in the plan's thread", () => {
    const f = fixture();
    f.work("plan", "Plan the panels");
    f.message("m1", "plan the personal panels", "plan");
    const plan = f.show({
      id: "card-plan-1",
      taskId: "plan",
      author: "crewmate",
      title: "The panels plan",
      answering: true,
      actions: [{ id: "build", label: "Approve and build", default: true }],
    });
    raised(f, plan);
    const other = f.show({ id: "card-other-1", title: "Another card", taskId: "elsewhere" });
    f.finish("plan");
    const key = f.tasks.get("plan")?.key;
    const filed = (id: string) =>
      seedTask(f.tasks, {
        id,
        title: `Build ${id}`,
        status: "running",
        shape: { kind: "implement", basis: key },
      });
    filed("build");
    f.tasks.capture.saveOrigin("build", {
      kind: "chose",
      cardId: plan.id,
      card: plan.title,
      choice: "Approve and build",
    });
    filed("relayed");
    f.tasks.capture.saveOrigin("relayed", {
      kind: "report",
      taskId: "plan",
      words: { text: "and keep the panel titles short", at: f.later() },
    });
    // A click on a card the record never raised on the plan continues nothing.
    filed("stray");
    f.tasks.capture.saveOrigin("stray", {
      kind: "chose",
      cardId: other.id,
      card: other.title,
      choice: "Go",
    });
    expect(workOf(f, "m1")).toEqual(["build", "plan", "relayed"]);
    expect(f.state("m1")).toEqual({ kind: "working" });
  });

  it("keeps the host's review of a build in the builder's thread, whatever turn filed it", () => {
    const f = fixture();
    f.work("build", "Build the panels");
    f.message("m1", "build the personal panels", "build");
    f.later();
    seedTask(f.tasks, {
      id: "review",
      title: "Review the panels change",
      status: "running",
      parentId: "build",
      shape: { kind: "review", kind_source: "host:review" },
    });
    // Another message's turn filed it: it still takes no origin from that turn.
    f.later();
    f.tasks.capture.openAsk({ id: "m2", text: "how is the panels build going?" });
    f.tasks.capture.attachAsk("m2", "review", "tool:spawn_crewmate", true);
    f.tasks.capture.closeAsk("m2", "closed");
    expect(workOf(f, "m1")).toEqual(["build", "review"]);
  });

  it("never makes a message that started queued work its origin", () => {
    const f = fixture();
    f.work("plan", "Plan the panels");
    f.message("m1", "plan the personal panels", "plan");
    f.later();
    seedTask(f.tasks, {
      id: "build",
      title: "Build the panels",
      status: "queued",
      shape: { kind: "implement", basis: f.tasks.get("plan")?.key },
    });
    // Start now: tied before it takes effect, then the message's work.
    f.later();
    f.tasks.capture.openAsk({ id: "m2", text: "start the panels build now" });
    f.tasks.capture.attachAsk("m2", "build", "tool:update_task", false, true);
    f.tasks.capture.attachAsk("m2", "build", "tool:update_task");
    f.tasks.capture.closeAsk("m2", "closed");
    expect(workOf(f, "m1")).toEqual(["build", "plan"]);
    expect(workOf(f, "m2")).toEqual(["build"]);
  });

  it("asks a finishing crewmate once for every message that needs its card", () => {
    const f = fixture();
    f.work("meter", "Fix the meter");
    f.message("m1", "fix the meter", "meter");
    f.message("m2", "the meter is late on the phone too", "meter", "tool:steer_crewmate");
    expect(f.ending.crewmateStep("meter").map((thread) => thread.ask.id)).toEqual(["m2", "m1"]);
    expect(f.ending.crewmateStep("meter")).toEqual([]);
  });
});
