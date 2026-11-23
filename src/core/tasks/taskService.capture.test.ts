import { describe, expect, it } from "vitest";
import { tableRowsRead } from "../../../tests/helpers/tableRowsRead";
import { openInMemoryDatabase } from "../storage/db";
import { TaskEventStore } from "../storage/taskEventStore";
import { seedProject } from "../workspace/seedProject";
import { seedTask } from "./seedTask";
import { TaskService } from "./taskService";

/**
 * The capture side of the one writer (task-system P1, design sections 4.5
 * and 6): asks and their attachments, the three filed kinds, and the card
 * and answer records that ride a task's timeline.
 */

function setup() {
  const db = openInMemoryDatabase();
  let now = 1_000;
  const tasks = new TaskService({ db, strict: true, now: () => now });
  return { db, tasks, tick: () => (now += 1) };
}

describe("TaskService capture", () => {
  // INF-6115 (docs/task-capture.md, "How a message ends"): every message
  // is its own thread. A message attached to an earlier message's work is
  // never joined to it; both messages' threads hold that work.
  it("keeps a message attached to an earlier one's work in its own thread", () => {
    const { tasks, tick } = setup();
    seedTask(tasks, { id: "t1", title: "Add pagination", status: "running" });
    seedTask(tasks, { id: "t2", title: "Fix the meter", status: "running" });
    tasks.capture.openAsk({ id: "askA", text: "add pagination", images: [] });
    tasks.capture.attachAsk("askA", "t1", "tool:spawn_crewmate");
    tick();
    tasks.capture.openAsk({ id: "askB", text: "fix the meter", images: [] });
    tasks.capture.attachAsk("askB", "t2", "tool:spawn_crewmate");
    tick();
    tasks.capture.openAsk({ id: "askC", text: "and the page size?", images: [] });
    tasks.capture.attachAsk("askC", "t1", "tool:steer_crewmate");
    expect(tasks.capture.getAsk("askC")?.continues).toBeNull();
    tick();
    expect(tasks.capture.attachAsk("askB", "t1", "tool:create_task")).toBe(true);
    expect(tasks.capture.getAsk("askB")?.continues).toBeNull();
    const work = (id: string) =>
      tasks.capture
        .askCoverage([id])
        .work.map((task) => task.id)
        .sort();
    expect(work("askA")).toEqual(["t1"]);
    expect(work("askB")).toEqual(["t1", "t2"]);
    expect(work("askC")).toEqual(["t1"]);
    expect(tasks.capture.asksAbove("t1").map((ask) => ask.id)).toEqual(["askC", "askB", "askA"]);
  });

  it("opens an ask, attaches it once per task with an ask event, and closes it", () => {
    const { tasks, tick } = setup();
    seedTask(tasks, { id: "t1", title: "Add pagination", status: "running" });
    const ask = tasks.capture.openAsk({
      id: "ask1",
      text: "how is it going?",
      images: [{ mimeType: "image/png" }],
      hintTaskId: "t1",
    });
    expect(ask.turnState).toBe("open");
    expect(tasks.capture.listOpenAsks().map((row) => row.id)).toEqual(["ask1"]);
    tick();
    expect(tasks.capture.attachAsk("ask1", "t1", "tool:emit_card")).toBe(true);
    expect(tasks.capture.attachAsk("ask1", "t1", "tool:steer_crewmate")).toBe(false);
    const stored = tasks.capture.getAsk("ask1");
    expect(stored?.taskId).toBe("t1");
    expect(stored?.attachedVia).toBe("tool:emit_card");
    expect(stored?.attachedAt).toBe(1_001);
    expect(stored?.images).toEqual([{ mimeType: "image/png" }]);
    const events = tasks.timeline("t1").filter((event) => event.kind === "ask");
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe("captain");
    expect(events[0]?.data).toMatchObject({ askId: "ask1", via: "tool:emit_card", first: true });
    expect(events[0]?.feed).toBe(false);
    expect(tasks.capture.asksFor("t1").map((row) => row.id)).toEqual(["ask1"]);
    expect(tasks.capture.closeAsk("ask1", "closed")?.turnState).toBe("closed");
    expect(tasks.capture.listOpenAsks()).toEqual([]);
    expect(() => tasks.capture.attachAsk("missing", "t1", "host:fallback")).toThrow(/Unknown ask/);
    expect(() => tasks.capture.attachAsk("ask1", "missing", "host:fallback")).toThrow(
      /Unknown task/,
    );
  });

  // INF-1610: every card about one of the captain's messages shows that
  // message, read through the task graph; after a handover it is the first.
  it("finds the captain's message a task's cards are about through the task graph", () => {
    const { tasks, tick } = setup();
    const said = (id: string, text: string, taskId: string) => {
      tasks.capture.openAsk({ id, text });
      tick();
      tasks.capture.attachAsk(id, taskId, "tool:spawn_crewmate");
      tick();
    };
    const fix = seedTask(tasks, { id: "fix", title: "Fix the footer", status: "running" });
    said("ask-fix", "the footer overlaps the composer on small windows", fix.id);
    said("ask-later", "how is the footer going?", fix.id);
    const quoted = (id: string) => {
      const line = tasks.capture.originAbout(id);
      return line && "text" in line ? line.text : undefined;
    };
    expect(quoted(fix.id)).toBe("the footer overlaps the composer on small windows");
    // A part and a build on a plan have no message of their own.
    const part = seedTask(tasks, {
      id: "part",
      title: "Measure the footer",
      status: "queued",
      parentId: fix.id,
    });
    expect(quoted(part.id)).toBe("the footer overlaps the composer on small windows");
    const plan = seedTask(tasks, {
      id: "plan",
      title: "Plan the stack",
      status: "completed",
      outcome: "B.",
    });
    said("ask-plan", "plan how the stack orders cards", plan.id);
    const build = seedTask(tasks, {
      id: "build",
      title: "Build the stack order",
      status: "queued",
      shape: { kind: "implement", basis: plan.key },
    });
    expect(quoted(build.id)).toBe("plan how the stack orders cards");
    // A retry at a stronger model and a replacement keep the first message,
    // not the one that asked for the move.
    const retry = seedTask(tasks, {
      id: "retry",
      title: "Fix the footer again",
      status: "queued",
      shape: { kind: "fix", escalate_from: fix.key },
    });
    said("ask-retry", "try that again with a stronger model", retry.id);
    expect(quoted(retry.id)).toBe("the footer overlaps the composer on small windows");
    const fresh = seedTask(tasks, { id: "fresh", title: "Fix the footer anew", status: "queued" });
    said("ask-move", "start over on a new branch", fresh.id);
    tasks.graph.link(fix.id, fresh.id, "replaced-by", "firstmate");
    expect(quoted(fresh.id)).toBe("the footer overlaps the composer on small windows");
    // Work no message reached has none.
    const chore = seedTask(tasks, { id: "chore", title: "Rotate the logs", status: "queued" });
    expect(tasks.capture.originAbout(chore.id)).toBeUndefined();
    expect(tasks.capture.originAbout("missing")).toBeUndefined();
  });

  // INF-3412 (measured by INF-3411): each first mate turn walks the origin of
  // every open card, and the walk decoded every event of every task on the
  // way - checks, progress and reports that can never be an origin - so
  // a turn paused the window longer as that work's history grew.
  it("walks a card's origin without reading the history that can never be one", () => {
    const { db, tasks, tick } = setup();
    const events = new TaskEventStore(db);
    const fix = seedTask(tasks, { id: "fix", title: "Fix the footer", status: "running" });
    tasks.capture.openAsk({ id: "ask-fix", text: "the footer overlaps the composer" });
    tick();
    tasks.capture.attachAsk("ask-fix", fix.id, "tool:spawn_crewmate");
    const part = seedTask(tasks, {
      id: "part",
      title: "Measure the footer",
      status: "running",
      parentId: fix.id,
    });
    // The history a running task gathers: CI readings, progress and the crewmate's notes.
    const work = (taskId: string, rounds: number) => {
      for (let round = 0; round < rounds; round += 1) {
        tick();
        events.insert({
          taskId,
          at: tick(),
          actor: "host",
          kind: "ci",
          text: `typecheck-lint-build: success on round ${round}`,
          data: {
            checks: [{ name: "typecheck-lint-build", state: "success", run: 1000 + round }],
            headSha: `${round}`.padStart(40, "0"),
          },
        });
        events.insert({
          taskId,
          at: tick(),
          actor: "crewmate",
          kind: "progress",
          text: `Measured the footer, round ${round}`,
          data: { plan: [{ label: "Measure", short: "measure", state: "current" }] },
        });
        events.insert({
          taskId,
          at: tick(),
          actor: "crewmate",
          kind: "note",
          text: `Round ${round} of the footer`,
          data: { news: false },
        });
      }
    };
    work(fix.id, 20);
    work(part.id, 20);
    const read = () => {
      const { answer, rows } = tableRowsRead("task_events", () =>
        tasks.capture.originAbout(part.id),
      );
      return { answer, rows: rows.length };
    };
    const before = read();
    expect(before.answer).toMatchObject({
      kind: "asked",
      text: "the footer overlaps the composer",
    });
    work(fix.id, 60);
    work(part.id, 60);
    expect(read()).toEqual(before);
  });

  it("keeps a message's picture copies on its ask, and a task's pictures are those of every message attached to it", () => {
    const { db, tasks } = setup();
    seedTask(tasks, { id: "t1", title: "Fix the dialog", status: "queued" });
    seedTask(tasks, { id: "t2", title: "Fix the footer", status: "queued" });
    const ref = (n: number) => ({
      id: `ref-${n}`,
      kind: "image" as const,
      name: `shot-${n}.png`,
      mimeType: "image/png" as const,
      bytes: 10 + n,
      sha256: String(n).repeat(64),
      file: `message-${n}/1-abc.png`,
    });
    tasks.capture.openAsk({
      id: "ask1",
      text: "this dialog and this footer",
      images: [{ mimeType: "image/png" }, { mimeType: "image/png" }],
      attachments: [ref(1), ref(2)],
    });
    tasks.capture.openAsk({ id: "ask2", text: "and this", attachments: [ref(3)] });
    tasks.capture.openAsk({ id: "ask3", text: "no picture here" });
    // The copies survive the row: read back as they were written.
    expect(tasks.capture.getAsk("ask1")?.attachments).toEqual([ref(1), ref(2)]);
    expect(tasks.capture.getAsk("ask1")?.images).toEqual([
      { mimeType: "image/png" },
      { mimeType: "image/png" },
    ]);
    // One message about two tasks lands its pictures on both; a later one adds its own.
    tasks.capture.attachAsk("ask1", "t1", "tool:create_task");
    tasks.capture.attachAsk("ask1", "t2", "tool:create_task");
    tasks.capture.attachAsk("ask2", "t1", "tool:update_task");
    tasks.capture.attachAsk("ask3", "t1", "tool:update_task");
    expect(tasks.capture.pictures("t1")).toEqual([ref(1), ref(2), ref(3)]);
    expect(tasks.capture.pictures("t2")).toEqual([ref(1), ref(2)]);
    // A row an older build saved holds the shapes alone: it has no copies.
    db.prepare(
      "INSERT INTO captain_asks (id, at, text, images_json, turn_state) VALUES ('old', 1, 'before', ?, 'closed')",
    ).run(JSON.stringify([{ mimeType: "image/jpeg" }]));
    expect(tasks.capture.getAsk("old")).toMatchObject({
      images: [{ mimeType: "image/jpeg" }],
      attachments: [],
    });
  });

  it("files a question task born closed, with its card and answer on record", () => {
    const { tasks } = setup();
    const question = tasks.capture.fileQuestion({
      id: "q1",
      title: "The port flag",
      outcome: "<p>It picks the port.</p>",
      cardId: "card-fm-1",
    });
    expect(question).toMatchObject({
      kind: "question",
      status: "done",
      closedReason: "answered",
      projectId: "scratch",
      outcome: "<p>It picks the port.</p>",
      // The first sentence, as the feed summarizes a report (HTML and all).
      outcomeSummary: "<p>It picks the port.</p>",
      workspaceState: "none",
    });
    expect(question.key).toBe("SCR-1");
    expect(question.closedAt).toBe(1_000);
    expect(tasks.timeline("q1").map((event) => event.kind)).toEqual([
      "created",
      "card_raised",
      "status",
    ]);
    expect(tasks.capture.taskForCard("card-fm-1")?.id).toBe("q1");
    expect(tasks.capture.taskForCard("card-fm-none")).toBeUndefined();
    // A host fallback carries its provenance and may have no answer text.
    const fallback = tasks.capture.fileQuestion({
      id: "q2",
      title: "hello",
      outcome: null,
      actor: "host",
      fallback: "question",
    });
    expect(fallback.outcome).toBeNull();
    const status = tasks.timeline("q2").find((event) => event.kind === "status");
    expect(status?.text).toBe("noted (nothing attached this turn)");
    expect(status?.data).toMatchObject({ fallback: "question" });
    expect(status?.actor).toBe("host");
  });

  it("files an operation task done/settled with the tool result as its outcome", () => {
    const { db, tasks } = setup();
    seedProject(db, { id: "r1", name: "api", path: "/fleet/api", setupKind: "adopt", addedAt: 1 });
    const operation = tasks.capture.fileOperation({
      id: "o1",
      title: "Configured repository api",
      outcome: "api now ships direct-pr with autonomy on.",
      tool: "configure_repo",
      repoId: "r1",
    });
    expect(operation).toMatchObject({
      kind: "operation",
      status: "done",
      closedReason: "settled",
      repoId: "r1",
      outcome: "api now ships direct-pr with autonomy on.",
    });
    expect(operation.projectId).toBe(tasks.projects.forRepo("r1")?.id);
    expect(operation.key).toMatch(/^API-1$/);
    const status = tasks.timeline("o1").find((event) => event.kind === "status");
    expect(status?.text).toBe("settled by configure_repo");
    // No repo: Scratch.
    expect(
      tasks.capture.fileOperation({
        id: "o2",
        title: "Noted x",
        outcome: "Noted.",
        tool: "remember",
      }).projectId,
    ).toBe("scratch");
  });

  it("files a decision task open on a captain gate keyed by its card, found by that card", () => {
    const { tasks } = setup();
    const decision = tasks.capture.fileDecision({
      id: "d1",
      title: "Ship now or wait",
      cardId: "card-fm-9",
    });
    expect(decision).toMatchObject({
      kind: "decision",
      status: "open",
      gate: { kind: "captain", ref: "card-fm-9" },
      projectId: "scratch",
    });
    expect(tasks.capture.openDecisionFor("card-fm-9")?.id).toBe("d1");
    expect(tasks.capture.openDecisionFor("card-fm-other")).toBeUndefined();
    const raised = tasks.timeline("d1").find((event) => event.kind === "card_raised");
    expect(raised?.ref).toBe("card-fm-9");
    expect(raised?.data).toMatchObject({ cardId: "card-fm-9", kind: "decision" });
    tasks.close("d1", { status: "done", reason: "answered", actor: "captain", text: 'chose "A"' });
    expect(tasks.capture.openDecisionFor("card-fm-9")).toBeUndefined();
  });

  it("records answers and card raise/resolve on an existing task's timeline", () => {
    const { tasks } = setup();
    seedTask(tasks, { id: "t1", title: "Add pagination", status: "idle" });
    tasks.capture.recordAnswer("t1", {
      cardId: "card-fm-2",
      title: "Under way",
      body: "<p>Step 2.</p>",
    });
    tasks.capture.recordCardRaised("t1", {
      cardId: "card-fm-3",
      kind: "decision",
      title: "Settle it?",
    });
    tasks.capture.recordCardResolved("t1", {
      cardId: "card-fm-3",
      title: "Settle it?",
      action: "keep",
    });
    const kinds = tasks.timeline("t1").map((event) => `${event.kind}:${event.ref ?? ""}`);
    expect(kinds).toEqual([
      "created:",
      "dispatched:",
      "answered:card-fm-2",
      "card_raised:card-fm-3",
      "card_resolved:card-fm-3",
    ]);
    const answered = tasks.timeline("t1").find((event) => event.kind === "answered");
    expect(answered?.data).toEqual({ cardId: "card-fm-2", body: "<p>Step 2.</p>" });
    expect(tasks.get("t1")?.outcome).toBeNull();
    // A revised standalone answer also becomes the record's outcome.
    tasks.capture.recordAnswer("t1", {
      cardId: "card-fm-2",
      title: "Under way",
      body: "<p>Step 3.</p>",
      asOutcome: true,
    });
    expect(tasks.get("t1")?.outcome).toBe("<p>Step 3.</p>");
    // Records on a task that is gone are dropped, never thrown.
    expect(() =>
      tasks.capture.recordCardResolved("nope", { cardId: "c", title: "t", action: "a" }),
    ).not.toThrow();
  });

  it("the purge clears asks with everything else", () => {
    const { tasks } = setup();
    tasks.capture.openAsk({ id: "ask1", text: "hi" });
    tasks.capture.fileQuestion({ id: "q1", title: "hi", outcome: "hello" });
    tasks.capture.attachAsk("ask1", "q1", "host:fallback");
    expect(tasks.archive.purge()).toBe(1);
    expect(tasks.capture.listAsks()).toEqual([]);
    expect(tasks.list()).toEqual([]);
  });
});
