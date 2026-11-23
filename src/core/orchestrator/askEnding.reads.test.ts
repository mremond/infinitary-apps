import type { Card } from "@shared/cards";
import type Database from "better-sqlite3";
import { expect, it } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import { outsideCensus } from "../../../tests/helpers/statementCheck";
import { FIRSTMATE_RECIPIENT, InboxStore } from "../storage/inboxStore";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { AnswerDeliveryCheck } from "./answerDeliveryCheck";
import { askEndingOf } from "./askEnding";

// INF-2249: the end-of-turn sweep must not reload the same ask for its
// root list, root lookup and membership. The captain's measured record
// had 33 open messages in 13 chains (tests/scale-check.test.ts).
function fixture() {
  const db = freshDatabase();
  let clock = 1_000;
  const now = () => ++clock;
  const tasks = new TaskService({ db, strict: true, now });
  const inbox = new InboxStore(db, { now });
  const cards: Card[] = [];
  const ending = askEndingOf(tasks, {
    values: () => cards,
    stored: (id) => cards.find((card) => card.id === id),
    shownAt: (card) => card.createdAt,
    seenCards: () => [],
  });
  const check = new AnswerDeliveryCheck({
    tasks,
    inbox,
    now,
    ending,
    raiseNotice: () => {
      throw new Error("Working asks need no missing-answer notice");
    },
    cardTitle: () => undefined,
  });
  const message = (id: string, task: string, text: string) => {
    tasks.capture.openAsk({ id, text });
    tasks.capture.attachAsk(id, task, "tool:steer_crewmate");
    tasks.capture.closeAsk(id, "closed");
    tasks.capture.setAskDelivery(id, "covered");
  };
  return { db, tasks, inbox, ending, check, message };
}

/** Count rows actually returned by SQLite, not calls to a particular helper. */
function askReads(db: Database.Database, run: () => void): string[] {
  const statement = Object.getPrototypeOf(db.prepare("SELECT 1")) as Database.Statement;
  const { get, all } = statement;
  const ids: string[] = [];
  const record = (source: string, row: unknown) => {
    if (/\bFROM captain_asks\b/i.test(source) && row && typeof row === "object" && "id" in row)
      ids.push(String(row.id));
  };
  statement.get = function (...args: unknown[]) {
    const row = get.apply(this, args as never);
    record(this.source, row);
    return row;
  };
  statement.all = function (...args: unknown[]) {
    const rows = all.apply(this, args as never);
    for (const row of rows) record(this.source, row);
    return rows;
  };
  try {
    run();
  } finally {
    statement.get = get;
    statement.all = all;
  }
  return ids;
}

it("reads each ask once in a turn-end sweep and sees the next saved change", () => {
  const f = fixture();
  try {
    const groups: string[][] = [];
    outsideCensus(() => {
      for (let chain = 0; chain < 13; chain += 1) {
        const task = `work-${chain}`;
        seedTask(f.tasks, {
          id: task,
          title: `Investigate reported app stall ${chain}`,
          status: "running",
        });
        const ids = [`ask-${chain}`];
        if (chain < 10) ids.push(`detail-${chain}`, `clarification-${chain}`);
        for (const id of ids)
          f.message(
            id,
            task,
            "Trace the recorded stall, preserve current behavior, and show before/after timing.",
          );
        groups.push(ids);
      }
    });
    const expected = groups.flat();
    // Every message is its own thread (INF-6115): three messages about one
    // task are three threads.
    const before = f.ending.openThreads();
    expect(before.map((thread) => thread.ask.id)).toEqual(expected);
    expect(before.every((thread) => f.ending.state(thread).kind === "working")).toBe(true);
    // Compare equal work on the same record; timing is evidence, never a budget assertion.
    const samples: number[] = [];
    outsideCensus(() => {
      for (let sample = 0; sample < 20; sample += 1) {
        const start = performance.now();
        f.check.endTurn({ asks: [], held: false, unread: [] });
        samples.push(performance.now() - start);
      }
    });
    const reads = askReads(f.db, () => f.check.endTurn({ asks: [], held: false, unread: [] }));
    console.info(
      "Turn-end sweep receipt",
      JSON.stringify({
        messages: expected.length,
        tasks: groups.length,
        askRowsRead: reads.length,
        samplesMs: samples,
        pendingWakes: f.inbox.allFor(FIRSTMATE_RECIPIENT).length,
      }),
    );
    expect(reads.toSorted()).toEqual(expected.toSorted());
    expect(f.inbox.allFor(FIRSTMATE_RECIPIENT)).toEqual([]);
    // No long-lived cache: just-accepted messages whose work completed leave the very next sweep.
    for (const id of groups[0]!) f.tasks.capture.acceptAnswer(id, "card-work-0-answer");
    f.tasks.close("work-0", { status: "done", reason: "answered", actor: "host" });
    f.check.sweep();
    expect(groups[0]!.map((id) => f.tasks.capture.getAsk(id)?.answerCardId)).toEqual(
      groups[0]!.map(() => "card-work-0-answer"),
    );
    expect(groups[0]!.every((id) => f.tasks.capture.getAsk(id)?.answeredAt !== null)).toBe(true);
    expect(f.ending.openThreads().map((thread) => thread.ask.id)).toEqual(groups.slice(1).flat());
    console.info(
      "Accepted-answer receipt",
      JSON.stringify({
        answered: groups[0]!.map((id) => ({
          id,
          card: f.tasks.capture.getAsk(id)?.answerCardId,
          finalized: f.tasks.capture.getAsk(id)?.answeredAt !== null,
        })),
        remainingThreads: f.ending.openThreads().length,
        pendingWakes: f.inbox.allFor(FIRSTMATE_RECIPIENT).length,
      }),
    );
  } finally {
    f.db.close();
  }
});

// INF-2249, rewritten for INF-6115 (every message is its own thread): the
// one read of open threads leaves out a message that ended - given its
// notice, or answered - and a message whose turn is still open unless the
// reply that reads it is still running; each thread is its message alone.
it("lists each unended message as its own thread, and an open turn only while it runs", () => {
  const f = fixture();
  try {
    seedTask(f.tasks, { id: "panels", title: "Plan personal panels", status: "running" });
    f.message("plan", "panels", "How could personal panels work?");
    f.message("detail", "panels", "Keep each panel isolated.");
    f.tasks.capture.openAsk({ id: "newest", text: "Also preserve keyboard navigation." });
    f.tasks.capture.attachAsk("newest", "panels", "tool:steer_crewmate");
    f.tasks.capture.setAskDelivery("detail", "unresolved");
    expect(f.ending.openThreads()).toEqual([f.ending.thread("plan")]);
    expect(f.ending.openThreads(true).map((thread) => thread.ask.id)).toEqual(["plan", "newest"]);
    f.tasks.capture.markAnswered("plan", "card-plan");
    f.tasks.capture.closeAsk("newest", "closed");
    expect(f.ending.openThreads()).toEqual([f.ending.thread("newest")]);
  } finally {
    f.db.close();
  }
});
