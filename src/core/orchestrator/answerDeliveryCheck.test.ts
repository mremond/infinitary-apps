import type { Card } from "@shared/cards";
import { describe, expect, it, vi } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import type { AskAttachedVia } from "../storage/askStore";
import { FIRSTMATE_RECIPIENT, InboxStore } from "../storage/inboxStore";
import { ASK_THREAD_CARRIES } from "../storage/migrations";
import { TaskEventStore } from "../storage/taskEventStore";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { ANSWER_MISSING_REF, AnswerDeliveryCheck } from "./answerDeliveryCheck";
import { askEndingOf } from "./askEnding";
import { answerMissingWake } from "./captainWakes";
import { captainTurn } from "./wakes";

/**
 * The check over its saved state: a restart (a second check over the same
 * database) resumes where the first stopped, and no message gets a second
 * retry or a second notice.
 */
function fixture(observe = false) {
  const db = freshDatabase();
  const tasks = new TaskService({ db, strict: true });
  const inbox = new InboxStore(db);
  const notices: string[] = [];
  // The stack: the first mate's answers the captain has not yet responded to.
  const up: Card[] = [];
  const answer = (id: string): Card => {
    const card: Card = {
      id,
      author: "firstmate",
      priority: 30,
      title: "Yes: a card you replied under keeps its place",
      meta: "",
      body: "<p>The stack keeps a card you replied under in its place while its author answers.</p>",
      actions: [],
      status: "ready",
      // Shown after the message it answers.
      createdAt: Date.now() + 1,
    };
    up.push(card);
    return card;
  };
  const boot = () =>
    new AnswerDeliveryCheck({
      tasks,
      inbox,
      now: () => 1_000,
      raiseNotice: (card) => notices.push(card.id),
      cardTitle: () => undefined,
      ending: askEndingOf(tasks, {
        values: () => up,
        stored: (id) => up.find((card) => card.id === id),
        shownAt: (card) => card.createdAt,
        seenCards: () => [],
      }),
      observe,
    });
  const ask = (id: string, text = `message ${id}`) => tasks.capture.openAsk({ id, text });
  const retryRows = () =>
    inbox
      .allFor(FIRSTMATE_RECIPIENT)
      .flatMap((row) => (row.facts?.kind === "answer-missing" ? [row.facts.askId] : []));
  return { db, tasks, inbox, notices, boot, ask, answer, retryRows };
}

describe("the answer-delivery check across a restart", () => {
  it("queues one retry for a message nothing followed, even when the turn is judged twice", () => {
    const f = fixture();
    f.ask("m1");
    const check = f.boot();
    check.endTurn({ asks: ["m1"], held: false, unread: [] });
    expect(f.tasks.capture.getAsk("m1")?.delivery).toBe("retrying");
    expect(f.retryRows()).toEqual(["m1"]);
    // A second look at the same message (a replayed turn end) finds it retrying
    // with its wake on the lane: that is a notice, never a second wake.
    f.boot().reconcile([]);
    expect(f.retryRows()).toEqual(["m1"]);
    expect(f.notices).toEqual([]);
  });

  it("judges a message whose turn the app quit in from its saved facts", () => {
    const f = fixture();
    f.ask("covered");
    f.ask("silent");
    const card = f.answer("card-firstmate-covered");
    f.tasks.capture.noteDelivery(["covered"], {
      outcome: "action",
      kind: "card",
      tool: "emit_card",
      ref: card.id,
      at: 1,
    });
    f.boot().reconcile(["covered", "silent"]);
    expect(f.tasks.capture.getAsk("covered")?.delivery).toBe("covered");
    expect(f.tasks.capture.getAsk("silent")?.delivery).toBe("retrying");
    expect(f.retryRows()).toEqual(["silent"]);
    // Booting again changes nothing.
    f.boot().reconcile([]);
    expect(f.retryRows()).toEqual(["silent"]);
    expect(f.notices).toEqual([]);
  });

  it("leaves a stranded message whose words are parked on the lane to the turn that serves them", () => {
    const f = fixture();
    f.ask("parked");
    f.inbox.enqueue(
      FIRSTMATE_RECIPIENT,
      captainTurn("message parked", false, undefined, "parked"),
      "captain-turn",
      "captain",
    );
    f.boot().reconcile(["parked"]);
    expect(f.tasks.capture.getAsk("parked")?.delivery).toBe("pending");
    expect(f.retryRows()).toEqual([]);
  });

  it("raises one notice for a retried message whose wake was served, and never a second", () => {
    const f = fixture();
    f.ask("m1");
    f.boot().endTurn({ asks: ["m1"], held: false, unread: [] });
    // The retry was served and acknowledged; the app quit before its check.
    const [row] = f.inbox.allFor(FIRSTMATE_RECIPIENT);
    f.inbox.ack([row?.id as number]);
    f.boot().reconcile([]);
    expect(f.notices).toEqual(["card-ask-m1"]);
    expect(f.tasks.capture.getAsk("m1")).toMatchObject({
      delivery: "unresolved",
      noticeCardId: "card-ask-m1",
    });
    f.boot().reconcile([]);
    expect(f.notices).toEqual(["card-ask-m1"]);
    expect(f.retryRows()).toEqual([]);
  });

  it("covers a retried message whose served retry did show an answer, quietly", () => {
    const f = fixture();
    f.ask("m1");
    f.boot().endTurn({ asks: ["m1"], held: false, unread: [] });
    const [row] = f.inbox.allFor(FIRSTMATE_RECIPIENT);
    f.inbox.ack([row?.id as number]);
    const card = f.answer("card-firstmate-m1");
    f.tasks.capture.noteDelivery(["m1"], {
      outcome: "action",
      kind: "card",
      tool: "emit_card",
      ref: card.id,
      at: 2,
    });
    f.boot().reconcile([]);
    expect(f.tasks.capture.getAsk("m1")?.delivery).toBe("covered");
    expect(f.notices).toEqual([]);
  });

  it("leaves a retrying message whose wake is still queued for the turn that serves it", () => {
    const f = fixture();
    f.ask("m1");
    f.inbox.enqueueWake(
      FIRSTMATE_RECIPIENT,
      answerMissingWake({ askId: "m1", excerpt: "message m1" }),
      "agent",
      ANSWER_MISSING_REF,
    );
    f.tasks.capture.setAskDelivery("m1", "retrying");
    f.boot().reconcile([]);
    expect(f.tasks.capture.getAsk("m1")?.delivery).toBe("retrying");
    expect(f.notices).toEqual([]);
  });

  it("ends a retrying message unresolved, with no notice, when the purge empties the lane", () => {
    const f = fixture();
    f.ask("m1");
    f.boot().endTurn({ asks: ["m1"], held: false, unread: [] });
    f.inbox.deleteFor(FIRSTMATE_RECIPIENT);
    f.boot().lanePurged();
    f.boot().reconcile([]);
    expect(f.tasks.capture.getAsk("m1")).toMatchObject({
      delivery: "unresolved",
      noticeCardId: null,
    });
    expect(f.notices).toEqual([]);
  });

  // INF-1610 piece 2, the first mate step: work started for a message ended
  // with no card that answers it, so the first mate is asked once - naming
  // the work - and after a restart the one notice follows, never a second ask.
  it("asks the first mate once when the work for a message ends unanswered, and raises one notice after a restart", () => {
    const f = fixture();
    seedTask(f.tasks, {
      id: "panels",
      title: "Build personal panels in isolation",
      status: "running",
    });
    f.ask("m1", "build the personal panels in isolation");
    f.tasks.capture.attachAsk("m1", "panels", "tool:spawn_crewmate");
    f.tasks.capture.closeAsk("m1", "closed");
    f.boot().endTurn({ asks: ["m1"], held: false, unread: [] });
    expect(f.tasks.capture.getAsk("m1")?.delivery).toBe("covered");
    expect(f.retryRows()).toEqual([]);

    f.tasks.close("panels", { status: "done", reason: "answered", actor: "host" });
    f.boot().sweep();
    const [row] = f.inbox.allFor(FIRSTMATE_RECIPIENT);
    expect(row?.facts).toMatchObject({
      kind: "answer-missing",
      askId: "m1",
      workEnded: [{ id: "panels", title: "Build personal panels in isolation" }],
    });
    expect(f.tasks.capture.getAsk("m1")?.delivery).toBe("retrying");
    // A second sweep finds it already asked about.
    f.boot().sweep();
    expect(f.retryRows()).toEqual(["m1"]);

    // The retry was served and showed nothing; the app restarts.
    f.inbox.ack([row?.id as number]);
    f.boot().reconcile([]);
    expect(f.notices).toEqual(["card-ask-m1"]);
    f.boot().reconcile([]);
    f.boot().sweep();
    expect(f.notices).toEqual(["card-ask-m1"]);
    expect(f.retryRows()).toEqual([]);
  });

  it("judges nothing in observe mode", () => {
    const f = fixture(true);
    f.ask("m1");
    f.boot(); // reconcile is the boot's own call; endTurn is the turn's.
    f.boot().endTurn({ asks: ["m1"], held: false, unread: [] });
    expect(f.tasks.capture.getAsk("m1")?.delivery).toBe("pending");
    expect(f.retryRows()).toEqual([]);
  });

  // INF-2059 (the captain: "every several seconds it freezes for a few
  // seconds"): the sweep after each turn read each message's tasks twice,
  // once for its chain and again for its state.
  it("looks up each covered message's tasks once when the sweep reads every open thread", () => {
    const f = fixture();
    seedTask(f.tasks, { id: "panels", title: "Build personal panels", status: "running" });
    seedTask(f.tasks, { id: "meter", title: "Fix the meter", status: "running" });
    const covered = (id: string, taskId: string) => {
      f.ask(id);
      f.tasks.capture.attachAsk(id, taskId, "tool:spawn_crewmate");
      f.tasks.capture.closeAsk(id, "closed");
      f.tasks.capture.setAskDelivery(id, "covered");
    };
    covered("m1", "panels");
    covered("m2", "panels");
    covered("m3", "meter");
    const lookups = vi.spyOn(TaskEventStore.prototype, "askAttributions");
    try {
      f.boot().sweep();
      expect(lookups.mock.calls.flatMap(([askIds]) => askIds).sort()).toEqual(["m1", "m2", "m3"]);
    } finally {
      lookups.mockRestore();
    }
    // Their work still runs: nothing is retried or noticed.
    expect(f.retryRows()).toEqual([]);
    expect(f.notices).toEqual([]);
  });

  // INF-6115: "The upgrade raises no new wake." A message that joined an
  // earlier one's thread before the update keeps that thread's open work.
  it("keeps each open message's merged thread across the update to one thread per message, with no retry or notice", () => {
    const f = fixture();
    seedTask(f.tasks, { id: "plan", title: "Plan the panels", status: "running" });
    seedTask(f.tasks, { id: "size", title: "Say what size the panels are", status: "running" });
    const covered = (id: string, taskId: string, via: AskAttachedVia) => {
      f.ask(id);
      f.tasks.capture.attachAsk(id, taskId, via);
      f.tasks.capture.closeAsk(id, "closed");
      f.tasks.capture.setAskDelivery(id, "covered");
    };
    covered("m1", "plan", "tool:spawn_crewmate");
    covered("m2", "size", "tool:steer_crewmate");
    // A reply typed under the plan's card reached it only by the host's
    // fallback, which the old release joined to m1's thread just the same.
    covered("m3", "plan", "host:fallback");
    f.tasks.close("size", { status: "done", reason: "answered", actor: "host" });
    // As the release before the update saved it: the later message joined
    // the first message's thread. The update's migration then lists both.
    f.db.prepare("UPDATE captain_asks SET continues = 'm1' WHERE id IN ('m2', 'm3')").run();
    f.db.exec("DROP TABLE ask_thread_carries;");
    f.db.exec(ASK_THREAD_CARRIES);
    const ending = askEndingOf(f.tasks, {
      values: () => [],
      stored: () => undefined,
      shownAt: () => 0,
      seenCards: () => [],
    });
    const state = (id: string) => {
      const thread = ending.thread(id);
      if (!thread) throw new Error(`No thread for ${id}`);
      return ending.state(thread);
    };
    // Its own thread alone holds only finished work: it would be retried.
    expect(state("m2")).toEqual({ kind: "missing" });
    // Its fallback attachment never made the plan its own work.
    expect(state("m3")).toEqual({ kind: "missing" });
    ending.carryThreads();
    expect(state("m1")).toEqual({ kind: "working" });
    expect(state("m2")).toEqual({ kind: "working" });
    expect(state("m3")).toEqual({ kind: "working" });
    expect(f.tasks.capture.threadCarries()).toEqual([]);
    // The carried attachment is never quoted as where the work came from.
    expect(f.tasks.capture.originAbout("plan")).toMatchObject({ text: "message m1" });
    f.boot().sweep();
    expect(f.retryRows()).toEqual([]);
    expect(f.notices).toEqual([]);
    // The step runs once: a second boot carries nothing again.
    ending.carryThreads();
    expect(
      f.tasks.capture
        .askCoverage(["m2"])
        .work.map((task) => task.id)
        .sort(),
    ).toEqual(["plan", "size"]);
  });
});
