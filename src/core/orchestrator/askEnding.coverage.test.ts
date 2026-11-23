import type { Card } from "@shared/cards";
import type Database from "better-sqlite3";
import { expect, it } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import { outsideCensus } from "../../../tests/helpers/statementCheck";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { askEndingOf } from "./askEnding";

/** Observe actual SQLite results, including payloads a narrower reader must never request. */
function readsDuring(db: Database.Database, run: () => void) {
  const statement = Object.getPrototypeOf(db.prepare("SELECT 1")) as Database.Statement;
  const { get, all } = statement;
  const asks: string[] = [];
  const fullTasks: string[] = [];
  const childLookups: string[] = [];
  const observe = (source: string, row: unknown) => {
    if (!row || typeof row !== "object" || !("id" in row)) return;
    if (/\bFROM captain_asks\b/i.test(source)) asks.push(String(row.id));
    if ("shape_json" in row && "delivery_json" in row) fullTasks.push(String(row.id));
  };
  statement.get = function (...args: unknown[]) {
    const row = get.apply(this, args as never);
    observe(this.source, row);
    return row;
  };
  statement.all = function (...args: unknown[]) {
    if (/\bFROM (?:task_records|tasks) WHERE parent_id = \?/i.test(this.source))
      childLookups.push(String(args[0]));
    const rows = all.apply(this, args as never);
    for (const row of rows) observe(this.source, row);
    return rows;
  };
  try {
    run();
    return { asks, fullTasks, childLookups };
  } finally {
    statement.get = get;
    statement.all = all;
  }
}

// INF-2278: cold dismissal and the captain's Nov 2 9:42 AM card-choice sample
// must not compose every covered task; retain INF-2249's complete joined-message
// batch and saved acceptance. The 33 messages in 13 chains are the captain-sized
// reading retained in tests/scale-check.test.ts. A terminal answer choice still
// reads its one task's shape to decide eligibility; coverage needs no other payload.
it.each(["close", "choice"] as const)(
  "bounds cold answer coverage for %s without changing acceptance",
  (response) => {
    const db = freshDatabase();
    let clock = 1_000;
    const tasks = new TaskService({ db, strict: true, now: () => ++clock });
    const ending = askEndingOf(tasks, {
      values: () => [],
      stored: () => undefined,
      shownAt: (card) => card.createdAt,
      seenCards: () => [],
    });
    try {
      const groups: string[][] = [];
      outsideCensus(() => {
        for (let chain = 0; chain < 13; chain += 1) {
          const root = `work-${chain}`;
          seedTask(tasks, {
            id: root,
            title: "Investigate the reported task refresh stall",
            status: "idle",
            shape: { kind: "fix", deliverable: "change" },
            prompt: "Measure the recorded path and preserve task and acceptance facts.",
          });
          seedTask(tasks, {
            id: `${root}-part`,
            parentId: root,
            title: "Check the coverage reads",
            status: "idle",
            shape: { kind: "research", deliverable: "answer" },
          });
          const ids = [`ask-${chain}`];
          if (chain < 10) ids.push(`detail-${chain}`, `clarification-${chain}`);
          for (const id of ids) {
            tasks.capture.openAsk({
              id,
              text: "Keep the card dismissal responsive without losing its answer.",
            });
            tasks.capture.attachAsk(id, root, "tool:steer_crewmate");
            tasks.capture.closeAsk(id, "closed");
            tasks.capture.setAskDelivery(id, "covered");
          }
          groups.push(ids);
        }
      });
      const card: Card = {
        id: "card-work-0-part-answer",
        taskId: "work-0-part",
        author: "crewmate",
        priority: 30,
        title: "The coverage reads are checked",
        meta: "",
        body: "<p>The dismissed answer still covers the joined messages.</p>",
        answering: true,
        asking: response === "choice" ? true : undefined,
        actions: response === "choice" ? [{ id: "keep", label: "Keep", default: true }] : [],
        status: "ready",
        createdAt: ++clock,
      };
      // No listLive, board read or outer projection primes the cold read.
      const respond = () =>
        ending.captainResponded(card, response, response === "choice" ? "keep" : undefined);
      const reads = readsDuring(db, respond);
      const accepted = groups[0]!.map((id) => tasks.capture.getAsk(id));
      const samplesMs: number[] = [];
      const samplesCpuMs: number[] = [];
      outsideCensus(() => {
        for (let sample = 0; sample < 20; sample += 1) {
          const cpu = process.cpuUsage();
          const start = performance.now();
          respond();
          samplesMs.push(performance.now() - start);
          const used = process.cpuUsage(cpu);
          samplesCpuMs.push((used.user + used.system) / 1000);
        }
      });
      console.info(
        "Cold answer response receipt",
        JSON.stringify({
          response,
          childLookups: reads.childLookups.length,
          messages: groups.flat().length,
          chains: groups.length,
          fullTaskRows: reads.fullTasks.length,
          askRows: reads.asks.length,
          accepted: accepted.map((ask) => ({
            id: ask?.id,
            card: ask?.answerCardId,
            at: ask?.acceptedAt,
          })),
          samplesMs,
          samplesCpuMs,
        }),
      );
      expect(
        accepted.every((ask) => ask?.answerCardId === card.id && ask.acceptedAt !== null),
      ).toBe(true);
      expect(
        groups
          .slice(1)
          .flat()
          .every((id) => tasks.capture.getAsk(id)?.acceptedAt === null),
      ).toBe(true);
      expect(reads.asks.toSorted()).toEqual(groups.flat().toSorted());
      expect(reads.fullTasks).toEqual(response === "choice" ? [card.taskId] : []);
      expect(reads.childLookups.toSorted()).toEqual(
        groups.flatMap((_, chain) => [`work-${chain}`, `work-${chain}-part`]).toSorted(),
      );
      // The next cold read still sees work state, not a retained acceptance/coverage cache.
      expect(ending.state(ending.thread(groups[0]![0]!)!).kind).toBe("working");
      tasks.close("work-0-part", { status: "done", reason: "answered", actor: "host" });
      tasks.close("work-0", { status: "done", reason: "answered", actor: "host" });
      expect(ending.state(ending.thread(groups[0]![0]!)!)).toEqual({
        kind: "accepted",
        cardId: card.id,
      });
    } finally {
      db.close();
    }
  },
);
