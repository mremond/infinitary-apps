import type { Card } from "@shared/cards";
import { describe, expect, it } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import { FIRSTMATE_RECIPIENT, InboxStore } from "../storage/inboxStore";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { AnswerDeliveryCheck } from "./answerDeliveryCheck";
import { askEndingOf } from "./askEnding";

/**
 * A request the first mate asks a crewmate for a captain's message ties
 * the message to that request, not to the crewmate's whole task, and a
 * change the task refused ties the message to it without counting as its
 * work (INF-5578's audit, finding 1; docs/task-capture.md "How a message
 * ends"). Each case is one the audit saw on a day's sessions or one of the
 * four places it named where a build must take care, over the real task
 * record, the real lane and the real check.
 */
function fixture() {
  const db = freshDatabase();
  const clock = { t: 1_000 };
  const now = () => clock.t;
  const tasks = new TaskService({ db, strict: true, now });
  const inbox = new InboxStore(db);
  const up: Card[] = [];
  const later = () => {
    clock.t += 1_000;
    return clock.t;
  };
  const ending = askEndingOf(
    tasks,
    {
      values: () => up,
      stored: (id) => up.find((card) => card.id === id),
      shownAt: (card) => card.createdAt,
      seenCards: () => [],
    },
    (id) => inbox.requestOpen(id),
  );
  const check = new AnswerDeliveryCheck({
    tasks,
    inbox,
    now,
    raiseNotice: () => {},
    cardTitle: () => undefined,
    ending,
  });
  /** A long-running task the captain's messages ask about. */
  const longTask = (id: string, title: string) => {
    later();
    return seedTask(tasks, { id, title, status: "running" });
  };
  /** The captain's message is read by a turn, which runs `act` and ends. */
  const captainTurn = (id: string, text: string, act: () => void) => {
    later();
    tasks.capture.openAsk({ id, text });
    act();
    tasks.capture.closeAsk(id, "closed");
    check.endTurn({ asks: [id], held: false, unread: [] });
  };
  /** The first mate asks a task a question for a message, as `steer_crewmate` does by default. */
  const askTask = (askId: string, taskId: string, question: string) => {
    tasks.capture.attachAsk(askId, taskId, "tool:steer_crewmate", undefined, true);
    const { request } = inbox.requestResponse(taskId, question);
    tasks.capture.tieRequest(askId, taskId, request.id);
    return request.id;
  };
  /** The crewmate answers the request; its answer waits on the first mate's lane. */
  const crewmateAnswers = (
    taskId: string,
    requestId: string,
    status: "answered" | "not-yet-answered" = "answered",
  ) => {
    later();
    inbox.submitResponse(
      { requestId, responseId: `${requestId}-${clock.t}`, status },
      { task: taskId, session: null },
      status === "answered" ? "Yes: updating now installs the new alpha." : "Not yet.",
    );
  };
  /** A turn the app starts drains the lane (the answer's wake), runs `act` and ends. */
  const wakeTurn = (act: (read: string[]) => void = () => {}) => {
    later();
    // The one retry is served alone, never with other wakes.
    const rows = inbox
      .pending(FIRSTMATE_RECIPIENT, clock.t)
      .filter((row) => row.facts?.kind !== "answer-missing");
    inbox.markDelivered(rows.map((row) => row.id));
    check.adopt(rows, () => undefined);
    act(check.adoptedAsks());
    check.endTurn({ asks: [], held: false, unread: [] });
    inbox.ack(rows.map((row) => row.id));
  };
  /** The first mate shows its answer card for the messages the turn read. */
  const showCard = (id: string, read: readonly string[]) => {
    const card: Card = {
      id,
      author: "firstmate",
      priority: 30,
      title: "Updating now gets the alpha",
      meta: "",
      body: "<p>Updating now gets the alpha.</p>",
      actions: [],
      status: "ready",
      createdAt: later(),
    };
    up.push(card);
    check.note({ outcome: "action", kind: "card", tool: "emit_card", ref: id }, read);
    return card;
  };
  const retries = () =>
    inbox
      .allFor(FIRSTMATE_RECIPIENT)
      .flatMap((row) => (row.facts?.kind === "answer-missing" ? [row.facts.askId] : []));
  const delivery = (askId: string) => tasks.capture.getAsk(askId)?.delivery;
  const state = (askId: string) => {
    const thread = ending.thread(askId);
    if (!thread) throw new Error(`No thread for ${askId}`);
    return ending.state(thread);
  };
  /** The tasks the first mate's reads of open messages list for one. */
  const listed = (askId: string) => {
    const thread = ending.thread(askId);
    return thread ? ending.listedWork(thread).map((task) => task.id) : [];
  };
  return {
    tasks,
    inbox,
    check,
    up,
    later,
    longTask,
    captainTurn,
    askTask,
    crewmateAnswers,
    wakeTurn,
    showCard,
    retries,
    delivery,
    state,
    listed,
  };
}

describe("a request asked for a captain's message", () => {
  it("waits for the answer, not the task, and asks the first mate once for a card when the answer brings none", () => {
    // Nov 20, 1:02 PM: a question asked of a task that stayed open all day.
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    let request = "";
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      request = f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    expect(f.delivery("m1")).toBe("covered");
    expect(f.retries()).toEqual([]);
    // The first mate's reads list the task the message waits on.
    expect(f.listed("m1")).toEqual(["alpha"]);

    // The answer is on the lane, unread: another turn's sweep still waits for it.
    f.crewmateAnswers("alpha", request);
    f.check.sweep();
    expect(f.retries()).toEqual([]);

    // The turn that reads the answer writes it only as closing words: the one
    // retry asks for the card while the task is still open.
    f.wakeTurn();
    expect(f.tasks.get("alpha")?.status).toBe("active");
    expect(f.retries()).toEqual(["m1"]);
  });

  it("waits on the card the turn reading the answer shows", () => {
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    let request = "";
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      request = f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    f.crewmateAnswers("alpha", request);
    let card: Card | undefined;
    f.wakeTurn((read) => {
      expect(read).toEqual(["m1"]);
      card = f.showCard("card-alpha-answer", read);
    });
    expect(f.retries()).toEqual([]);
    expect(f.delivery("m1")).toBe("covered");
    expect(f.state("m1")).toEqual({ kind: "waiting", cardId: card?.id });
  });

  it("keeps waiting through a crewmate's not-yet and a follow-up asked in the turn that read the answer", () => {
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    let request = "";
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      request = f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    f.crewmateAnswers("alpha", request, "not-yet-answered");
    f.wakeTurn();
    expect(f.retries()).toEqual([]);

    // The answer comes; the turn reading it asks a follow-up for the same message.
    f.crewmateAnswers("alpha", request);
    let followUp = "";
    f.wakeTurn((read) => {
      expect(read).toEqual(["m1"]);
      followUp = f.askTask("m1", "alpha", "Which channel does it come from?");
    });
    expect(f.retries()).toEqual([]);
    expect(f.delivery("m1")).toBe("covered");

    // Its answer brings no card: now the message is due.
    f.crewmateAnswers("alpha", followUp);
    f.wakeTurn();
    expect(f.retries()).toEqual(["m1"]);
  });

  it("falls back to the task's close when its crewmate never answers", () => {
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    // The request stays open however many turns go by.
    f.check.sweep();
    expect(f.retries()).toEqual([]);
    expect(f.delivery("m1")).toBe("covered");

    f.later();
    f.tasks.close("alpha", { status: "done", reason: "answered", actor: "host" });
    f.check.sweep();
    expect(f.retries()).toEqual(["m1"]);
  });

  it("keeps an answer still unread waiting after its task closes, until the turn that reads it", () => {
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    let request = "";
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      request = f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    f.crewmateAnswers("alpha", request);
    f.later();
    f.tasks.close("alpha", { status: "done", reason: "answered", actor: "host" });
    // The retry would reach the first mate before the answer it asks about.
    f.check.sweep();
    expect(f.retries()).toEqual([]);
    expect(f.delivery("m1")).toBe("covered");

    f.wakeTurn((read) => expect(read).toEqual(["m1"]));
    expect(f.retries()).toEqual(["m1"]);
  });

  it("stops waiting once the first mate cancels its request", () => {
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    let request = "";
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      request = f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    f.inbox.cancelResponse(request);
    f.check.sweep();
    expect(f.retries()).toEqual(["m1"]);
  });

  it("gives each message on one long task its own ending", () => {
    // INF-5135 held six of the captain's messages on one day.
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    let first = "";
    f.captainTurn("m1", "will updating get the new alpha?", () => {
      first = f.askTask("m1", "alpha", "Will updating get the new alpha?");
    });
    let second = "";
    f.captainTurn("m2", "and the phone app?", () => {
      second = f.askTask("m2", "alpha", "Does the phone app update too?");
    });
    // A question asked of a task joins no earlier question asked of it.
    expect(f.tasks.capture.getAsk("m2")?.continues).toBeNull();

    // The second answer comes back first: only its message is due.
    f.crewmateAnswers("alpha", second);
    f.wakeTurn((read) => expect(read).toEqual(["m2"]));
    expect(f.retries()).toEqual(["m2"]);
    expect(f.delivery("m1")).toBe("covered");

    f.crewmateAnswers("alpha", first);
    f.wakeTurn((read) => expect(read).toEqual(["m1"]));
    expect(f.retries()).toEqual(["m2", "m1"]);
  });

  it("still makes a task the message's work when the first mate only passes guidance on", () => {
    const f = fixture();
    f.longTask("alpha", "Cut the batch alpha");
    f.captainTurn("m1", "hold off on the alpha", () => {
      f.tasks.capture.attachAsk("m1", "alpha", "tool:steer_crewmate");
    });
    f.check.sweep();
    expect(f.retries()).toEqual([]);
    expect(f.delivery("m1")).toBe("covered");
  });
});

describe("a change the task refused", () => {
  it("stops counting as the message's work, and keeps the tie so the task's own card can answer it", () => {
    // Nov 20, 11:21 AM: a model taken off two running reviews, both refused.
    const f = fixture();
    f.longTask("review", "Careful review of the batch");
    f.captainTurn("m1", "remove my standing direction on careful reviews", () => {
      f.tasks.capture.attachAsk("m1", "review", "tool:update_task", undefined, true);
    });
    // Nothing runs for it: the first mate is asked for its card at once.
    expect(f.retries()).toEqual(["m1"]);

    // The task's own answering card is about the message and answers it.
    const card: Card = {
      id: "card-review-answer",
      taskId: "review",
      author: "crewmate",
      priority: 30,
      title: "Careful reviews no longer default to that model",
      meta: "",
      body: "<p>Done.</p>",
      actions: [],
      status: "ready",
      answering: true,
      createdAt: f.later(),
    };
    f.up.push(card);
    expect(f.state("m1")).toEqual({ kind: "waiting", cardId: card.id });
  });

  // INF-6115: the later message keeps its own thread on the shared work.
  it("gives a later message the earlier message's open work in its own thread once a change tied there takes effect", () => {
    const f = fixture();
    f.longTask("review", "Careful review of the batch");
    f.captainTurn("m0", "review the batch carefully", () => {
      f.tasks.capture.attachAsk("m0", "review", "tool:spawn_crewmate", true);
    });
    f.captainTurn("m1", "give the review a stronger model", () => {
      f.tasks.capture.attachAsk("m1", "review", "tool:update_task", undefined, true);
      f.tasks.capture.attachAsk("m1", "review", "tool:update_task");
    });
    expect(f.tasks.capture.getAsk("m1")?.continues).toBeNull();
    expect(f.listed("m1")).toEqual(["review"]);
    expect(f.listed("m0")).toEqual(["review"]);
    expect(f.retries()).toEqual([]);
  });

  it("becomes the message's work once a change there takes effect", () => {
    const f = fixture();
    f.longTask("review", "Careful review of the batch");
    f.captainTurn("m1", "give the review a stronger model", () => {
      f.tasks.capture.attachAsk("m1", "review", "tool:update_task", undefined, true);
      f.tasks.capture.attachAsk("m1", "review", "tool:update_task");
    });
    expect(f.retries()).toEqual([]);
    expect(f.delivery("m1")).toBe("covered");
  });
});
