import { describe, expect, it, vi } from "vitest";
import { freshDatabase, rowsRead } from "../../../tests/helpers/database";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import { IdleLadder, type IdleLadderHost } from "../orchestrator/idleLadder";
import { TaskEventStore } from "../storage/taskEventStore";
import { seedTask } from "./seedTask";
import { TaskService } from "./taskService";

// INF-2186: board posture witnesses and roster wait chains repeatedly read
// and compose the same task records during one synchronous projection.
describe("task projection reads", () => {
  // INF-2255: posture's flags and the named waits must share the same
  // marked incoming edges, not reread them for every witness.
  it("shares blocker reads across posture flags and wait facts, then sees a close", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Keep task refreshes responsive", status: "idle" });
      seedTask(tasks, { id: "fix", title: "Fix the blocking check", status: "idle" });
      tasks.graph.link("fix", "builder", "blocks", "firstmate", true);
      tasks.readProjection(() => {
        tasks.listLive();
        const builder = tasks.get("builder")!;
        const rows = rowsRead(db, () => {
          for (let read = 0; read < 20; read += 1) {
            expect(tasks.graph.flagsOf(builder).blocked).toBe(true);
            expect(tasks.graph.waitsHolding(builder.id).map((task) => task.id)).toEqual(["fix"]);
          }
        });
        console.info(JSON.stringify({ intent: "INF-2255 marked blockers", reads: 20, rows }));
        expect(rows).toBe(tasks.graph.linksTo(builder.id).length);
        tasks.close("fix", { status: "done", reason: "settled", actor: "host" });
        expect(tasks.graph.flagsOf(builder).blocked).toBe(false);
        expect(tasks.graph.waitsHolding(builder.id)).toEqual([]);
      });
    } finally {
      db.close();
    }
  });

  // INF-2186, captain's firstmateActedSince/listChildren posture sample.
  it("answers a first-mate request from action times without decoding old timelines or child payloads", () => {
    const db = freshDatabase();
    let now = Date.now();
    const tasks = new TaskService({ db, now: () => now });
    const ladder = new IdleLadder({ tasks } as IdleLadderHost);
    const retained = "Retained context unrelated to the first-mate action time.";
    const request = { at: now, request: "Check the fix." };
    try {
      seedTask(tasks, {
        id: "builder",
        title: "Keep Tasks responsive",
        status: "idle",
        createdAt: now,
      });
      for (let index = 0; index < 10; index += 1) {
        const id = `old-child-${index}`;
        seedTask(tasks, {
          id,
          title: "Earlier work",
          parentId: "builder",
          status: "cancelled",
          createdAt: now,
        });
        tasks.note(id, retained, { news: false, data: { retained } });
        seedDelivery(tasks, id, {
          checks: {
            headSha: "93355db9d04e964513879db74d068a7789cb4c16",
            items: [],
            absenceDeclared: false,
            complete: false,
            problem: retained,
          },
        });
      }
      tasks.note("builder", retained, { news: false, data: { retained } });
      seedDelivery(tasks, "builder", { needsFirstmate: request });
      now += 1;
      new TaskEventStore(db).insert({
        taskId: "builder",
        at: now,
        actor: "firstmate",
        kind: "decided",
        text: "Read the request.",
        data: { retained },
      });
      tasks.readProjection(() => {
        tasks.listLive();
        const record = tasks.get("builder");
        if (!record) throw new Error("Missing builder");
        const parse = vi.spyOn(JSON, "parse");
        const timelines = vi.spyOn(tasks, "timeline");
        const children = vi.spyOn(tasks.graph, "children");
        let parsed: number;
        try {
          expect(ladder.unansweredAsk(record)).toEqual(request);
          expect(tasks.graph.openChildren(record.id)).toEqual([]);
          parsed = parse.mock.calls.filter(
            ([value]) => typeof value === "string" && value.includes(retained),
          ).length;
          expect(timelines).not.toHaveBeenCalled();
          expect(children).not.toHaveBeenCalled();
        } finally {
          parse.mockRestore();
          timelines.mockRestore();
          children.mockRestore();
        }
        console.info(JSON.stringify({ intent: "INF-2186 first-mate action metadata", parsed }));
        expect(parsed).toBe(0);
        now += 1;
        seedTask(tasks, {
          id: "new-child",
          title: "Act on the request",
          parentId: "builder",
          status: "cancelled",
          createdAt: now,
        });
        expect(ladder.unansweredAsk(record)).toBeUndefined();
      });
    } finally {
      db.close();
    }
  });

  // INF-2186, captain's dependencyWaits -> waitWitnesses sample.
  it("shares dependency witnesses until a graph write changes them", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    const ladder = new IdleLadder({ tasks } as IdleLadderHost);
    try {
      seedTask(tasks, { id: "builder", title: "Keep Tasks responsive", status: "idle" });
      seedTask(tasks, {
        id: "dependency",
        title: "Fix the baseline",
        status: "queued",
        startPolicy: "on-request",
      });
      tasks.graph.link("dependency", "builder", "blocks", "firstmate");
      tasks.readProjection(() => {
        const record = tasks.get("builder");
        if (!record) throw new Error("Missing builder");
        const links = vi.spyOn(tasks.graph, "linksTo");
        try {
          for (let reader = 0; reader < 20; reader += 1) {
            expect(ladder.unstartedWaits(record).map((task) => task.id)).toEqual(["dependency"]);
            expect(ladder.underwayWaits(record)).toEqual([]);
          }
          expect(links.mock.calls.filter(([id]) => id === record.id)).toHaveLength(1);
          tasks.graph.unlink("dependency", "builder", "blocks", "firstmate");
          expect(ladder.unstartedWaits(record)).toEqual([]);
          expect(ladder.underwayWaits(record)).toEqual([]);
        } finally {
          links.mockRestore();
        }
      });
    } finally {
      db.close();
    }
  });

  // INF-2186, captain's heldOn -> sortReport sample: closed waiters are not
  // report-sort witnesses and their retained delivery payloads need no decode.
  it("reads only active work held on a finding, not its closed waiters' payloads", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    const ladder = new IdleLadder({ tasks } as IdleLadderHost);
    const retained = "A retained diagnosis belonging only to closed work.";
    try {
      seedTask(tasks, { id: "finding", title: "Fix the Tasks refresh", status: "idle" });
      seedTask(tasks, { id: "active", title: "Verify the finding", status: "idle" });
      tasks.graph.link("finding", "active", "blocks", "firstmate");
      for (let index = 0; index < 10; index += 1) {
        const id = `closed-${index}`;
        seedTask(tasks, { id, title: "An earlier verification", status: "cancelled" });
        seedDelivery(tasks, id, {
          ci: "red",
          ciRepair: {
            failures: [],
            repairs: [],
            diagnoses: [
              {
                headSha: "93355db9d04e964513879db74d068a7789cb4c16",
                check: "unit-tests",
                classification: "own-regression",
                evidence: retained,
                at: 1,
              },
            ],
          },
        });
        tasks.graph.link("finding", id, "blocks", "firstmate");
      }
      const finding = tasks.get("finding");
      if (!finding) throw new Error("Missing finding");
      tasks.readProjection(() => {
        const parse = vi.spyOn(JSON, "parse");
        let decoded: number;
        try {
          expect(ladder.heldOn(finding).map((task) => task.id)).toEqual(["active"]);
          decoded = parse.mock.calls.filter(
            ([value]) => typeof value === "string" && value.includes(retained),
          ).length;
        } finally {
          parse.mockRestore();
        }
        console.info(
          JSON.stringify({ intent: "INF-2186 held work", closedPayloadsDecoded: decoded }),
        );
        expect(decoded).toBe(0);
      });
    } finally {
      db.close();
    }
  });

  // INF-2186: the turn-end sorter compares the current report with its predecessor.
  it("reads only the current and previous report for the report sorter", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Keep task refreshes responsive", status: "idle" });
      for (const text of [
        "Reproduced the link walk.",
        "Indexed the incoming waits.",
        "Verified the wait dates.",
      ]) {
        tasks.note("builder", "The checks are running.", { news: false });
        tasks.turns.recordReport("builder", { text });
      }
      let all: ReturnType<TaskService["reportEntries"]> = [];
      const baseline = rowsRead(db, () => {
        all = tasks.reportEntries("builder");
      });
      let recent: ReturnType<TaskService["lastReportEntries"]> = [];
      const reads = rowsRead(db, () => {
        recent = tasks.lastReportEntries("builder");
      });
      expect(recent).toEqual(all.slice(-2));
      expect(reads).toBe(recent.length);
      expect(reads).toBeLessThan(baseline);
      console.info(JSON.stringify({ intent: "INF-2186 report sort", baseline, recent: reads }));
    } finally {
      db.close();
    }
  });

  // INF-2186: openChains repeatedly decoded full timelines for ask attribution and escalation edges.
  it("reads ask coverage from typed edges without decoding unrelated timeline payloads", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Keep task refreshes responsive", status: "idle" });
      seedTask(tasks, { id: "waits", title: "Fix the waits", parentId: "builder", status: "idle" });
      tasks.capture.openAsk({ id: "refresh", text: "Fix the Tasks list refresh." });
      tasks.capture.attachAsk("refresh", "builder", "host:fallback");
      tasks.capture.attachAsk("refresh", "waits", "tool:spawn_crewmate");
      tasks.note("builder", "Compared the wait dates.", {
        news: false,
        data: { check: "blockedSince" },
      });
      seedTask(tasks, { id: "handover", title: "Continue on the stronger model", status: "idle" });
      new TaskEventStore(db).insert({
        taskId: "builder",
        at: Date.now(),
        actor: "firstmate",
        kind: "escalated",
        text: "Continued the work on another model.",
        data: {
          escalated_to: "handover",
          reasons: ["The investigation needs the stronger model."],
        },
        ref: "handover",
      });
      tasks.readProjection(() => {
        tasks.listLive();
        const parse = vi.spyOn(JSON, "parse");
        let calls: number;
        let covered: ReturnType<TaskService["capture"]["askCoverage"]>;
        try {
          covered = tasks.capture.askCoverage(["refresh"]);
          // The test runner parses a module's source map the first time the
          // statement check names it in a call stack: that is not the app's.
          calls = parse.mock.calls.filter(
            ([text]) => !String(text).startsWith('{"version":3,'),
          ).length;
        } finally {
          parse.mockRestore();
        }
        expect(covered.work.map((task) => task.id)).toEqual(["builder", "waits", "handover"]);
        expect([...covered.acted]).toEqual(["waits"]);
        expect(calls).toBe(0);
        seedTask(tasks, {
          id: "places",
          title: "Fix placement reads",
          parentId: "builder",
          status: "idle",
        });
        expect(tasks.capture.askCoverage(["refresh"]).work.map((task) => task.id)).toEqual([
          "builder",
          "waits",
          "places",
          "handover",
        ]);
      });
    } finally {
      db.close();
    }
  });

  // INF-2186: presentation publication only needs to test whether each row exists.
  it("republishes existing task ids without composing their records", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Keep task refreshes responsive", status: "idle" });
      const changes: string[][] = [];
      tasks.onChange((change) => changes.push(change.taskIds));
      const parse = vi.spyOn(JSON, "parse");
      let calls: number;
      try {
        tasks.refreshPresentation(["builder", "missing"]);
        calls = parse.mock.calls.length;
      } finally {
        parse.mockRestore();
      }
      expect(changes).toEqual([["builder"]]);
      expect(calls).toBe(0);
    } finally {
      db.close();
    }
  });

  // Captain's 12:07:29 PM sample: roster restart facts decoded a whole event.
  it("reads the latest restart line without decoding the event payload", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Keep task refreshes responsive", status: "idle" });
      tasks.note("builder", "The task is waiting for its computer.", {
        news: false,
        data: { restartOutcome: { outcome: "waiting", reason: "computer out of reach" } },
      });
      tasks.note("builder", "The task resumed after the computer returned.", {
        news: false,
        data: { restartOutcome: { outcome: "resumed" } },
      });
      tasks.note("builder", "The checks are running.", { news: false });
      const parse = vi.spyOn(JSON, "parse");
      let calls: number;
      try {
        const latest = tasks.restartObservation("builder");
        calls = parse.mock.calls.length;
        expect(latest?.text).toBe("The task resumed after the computer returned.");
      } finally {
        parse.mockRestore();
      }
      expect(calls).toBe(0);
    } finally {
      db.close();
    }
  });
  // INF-2341: each running crew row of the first mate's context reads its
  // restart line, and SQLite chose to seek the task's notes by kind and test
  // every one, so the read grew with the task's own progress notes.
  it("seeks the latest restart line among restart notes alone, whatever the task's other notes", () => {
    const db = freshDatabase();
    let now = Date.now();
    const tasks = new TaskService({ db, now: () => now });
    try {
      seedTask(tasks, { id: "builder", title: "Keep task refreshes responsive", status: "idle" });
      const reopenedAt = now;
      tasks.note("builder", "Has not carried on after the app reopened: computer out of reach.", {
        news: true,
        data: {
          journal: true,
          restartOutcome: { reopenedAt, outcome: "waiting", reason: "computer out of reach" },
        },
      });
      now += 1_000;
      tasks.note("builder", "Carried on after the app reopened.", {
        news: true,
        data: { journal: true, restartOutcome: { reopenedAt, outcome: "resumed" } },
      });
      for (let step = 0; step < 200; step += 1) {
        now += 1_000;
        tasks.note("builder", `Ran check ${step} of the refresh fix.`, { news: false });
      }
      const ran: { source: string; args: unknown[] }[] = [];
      const statement = Object.getPrototypeOf(db.prepare("SELECT 1")) as {
        get: (this: { source: string }, ...args: unknown[]) => unknown;
      };
      const { get } = statement;
      statement.get = function (this: { source: string }, ...args: unknown[]) {
        ran.push({ source: this.source, args });
        return get.apply(this, args);
      };
      let latest: ReturnType<TaskService["restartObservation"]>;
      try {
        latest = tasks.restartObservation("builder");
      } finally {
        statement.get = get;
      }
      expect(latest?.text).toBe("Carried on after the app reopened.");
      // The index whose rows are the restart notes alone, read from the schema the migration wrote.
      const restartIndexes = (
        db
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'task_events'",
          )
          .all() as { name: string; sql: string | null }[]
      ).filter((index) => index.sql?.includes("$.restartOutcome"));
      expect(restartIndexes).toHaveLength(1);
      expect(ran).toHaveLength(1);
      const [read] = ran;
      const plan = (
        db.prepare(`EXPLAIN QUERY PLAN ${read?.source}`).all(...(read?.args ?? [])) as {
          detail: string;
        }[]
      ).map((step) => step.detail);
      console.info(JSON.stringify({ intent: "INF-2341 restart line", notes: 202, plan }));
      expect(plan).toEqual([
        `SEARCH task_events USING INDEX ${restartIndexes[0]?.name} (task_id=?)`,
      ]);
    } finally {
      db.close();
    }
  });
  it("shares composed records and live lists within a read, never across a write or a later read", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Fix board refreshes", status: "idle" });
      seedTask(tasks, {
        id: "review",
        title: "Review the board fix",
        parentId: "builder",
        status: "running",
        shape: { kind: "review", kind_source: "host:review" },
      });
      tasks.graph.link("review", "builder", "blocks", "firstmate");
      tasks.readProjection(() => {
        const live = tasks.listLive();
        const builder = live.find((row) => row.id === "builder");
        const reads = rowsRead(db, () => {
          for (let i = 0; i < live.length; i += 1) {
            expect(tasks.get("builder")).toBe(builder);
            expect(tasks.listLive()).toBe(live);
            expect(tasks.graph.blockers("builder")[0]).toBe(
              live.find((row) => row.id === "review"),
            );
          }
        });
        // The blocker edges cross SQLite once for the whole projection, not per witness.
        expect(reads).toBe(tasks.graph.linksTo("builder").length);
        tasks.updateFields("builder", { title: "Keep the board responsive" }, "firstmate");
        expect(tasks.get("builder")?.title).toBe("Keep the board responsive");
        expect(tasks.get("builder")).not.toBe(builder);
        expect(tasks.listLive()).not.toBe(live);
        expect(tasks.graph.blockers("builder").map((row) => row.id)).toEqual(["review"]);
        seedTask(tasks, { id: "checks", title: "Verify the fix", status: "idle" });
        tasks.graph.link("checks", "builder", "blocks", "firstmate");
        expect(tasks.graph.blockers("builder").map((row) => row.id)).toEqual(["review", "checks"]);
      });
      tasks.updateFields("builder", { title: "The latest title" }, "firstmate");
      tasks.readProjection(() => expect(tasks.get("builder")?.title).toBe("The latest title"));
    } finally {
      db.close();
    }
  });

  it("drops a projection after an exception and sees a rolled-back write correctly", () => {
    const db = freshDatabase();
    const tasks = new TaskService({ db });
    try {
      seedTask(tasks, { id: "builder", title: "Keep this title", status: "idle" });
      expect(() =>
        tasks.readProjection(() => {
          tasks.get("builder");
          throw new Error("interrupted projection");
        }),
      ).toThrow("interrupted projection");
      tasks.readProjection(() => {
        const original = tasks.get("builder");
        expect(() =>
          tasks.atomic(
            () => {
              tasks.updateFields("builder", { title: "A rolled-back title" }, "firstmate");
              throw new Error("rollback");
            },
            () => {},
          ),
        ).toThrow("rollback");
        expect(tasks.get("builder")).toEqual(original);
      });
    } finally {
      db.close();
    }
  });
});
