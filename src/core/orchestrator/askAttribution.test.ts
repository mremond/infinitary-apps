import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { boundTool } from "../session/tools";
import { openInMemoryDatabase } from "../storage/db";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { withAskAttribution } from "./askAttribution";
import { AskCapture } from "./askCapture";

// INF-2010: unrelated work in the same turn must not acquire the captain's
// prototype request. Exercise the shared action boundary, not text matching.
function setup() {
  const db = openInMemoryDatabase();
  const tasks = new TaskService({ db, strict: true });
  seedTask(tasks, { id: "measurement", title: "Measure visible-app latency", status: "idle" });
  seedTask(tasks, { id: "prototype", title: "Prototype You asked treatments", status: "idle" });
  const actedOn: string[] = [];
  const capture = new AskCapture(tasks, (taskId) => actedOn.push(taskId));
  const request = capture.open({
    text: "the \"you asked\" section is helpful, but it's current UI looks odd. something about its font type doesn't feel quite right. have opus prototype a few different treatment for me to decide",
  });
  return { db, tasks, capture, request, actedOn };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("per-action request attribution", () => {
  it("keeps an awaited operational action source-free while another action addresses the read request", async () => {
    const { db, tasks, capture, request, actedOn } = setup();
    const entered = deferred();
    const resume = deferred();
    const tool = withAskAttribution(
      boundTool({
        name: "spawn_crewmate",
        label: "Spawn",
        description: "Start work",
        parameters: Type.Object({ task: Type.String() }),
        run: async ({ task }) => {
          if (task === "measurement") {
            entered.resolve();
            await resume.promise;
          }
          capture.attach(task, "spawn_crewmate");
          return { text: "started" };
        },
      }),
      capture,
      (id) => id === request.id,
    );
    let operational: Promise<unknown> | undefined;
    try {
      operational = tool.run({ task: "measurement", ask_id: "" });
      await entered.promise;
      await tool.run({ task: "prototype", ask_id: request.id });
      resume.resolve();
      await operational;
      expect(tasks.capture.asksFor("measurement")).toEqual([]);
      expect(tasks.capture.asksFor("prototype").map((ask) => ask.id)).toEqual([request.id]);
      expect(actedOn).toEqual(["prototype", "measurement"]);
      expect(capture.current()?.id).toBe(request.id);
    } finally {
      resume.resolve();
      await operational?.catch(() => {});
      db.close();
    }
  });

  it("pins the default read request before an await and restores it after a failed unrelated action", async () => {
    const { db, tasks, capture, request } = setup();
    const entered = deferred();
    const resume = deferred();
    const tool = withAskAttribution(
      boundTool({
        name: "steer_crewmate",
        label: "Steer",
        description: "Guide work",
        parameters: Type.Object({ fail: Type.Optional(Type.Boolean()) }),
        run: async ({ fail }) => {
          if (fail) {
            expect(capture.current()).toBeUndefined();
            throw new Error("start refused");
          }
          entered.resolve();
          await resume.promise;
          capture.attach("prototype", "steer_crewmate");
          return { text: "guided" };
        },
      }),
      capture,
      (id) => id === request.id,
    );
    let action: Promise<unknown> | undefined;
    try {
      await expect(tool.run({ ask_id: "", fail: true })).rejects.toThrow("start refused");
      expect(capture.current()?.id).toBe(request.id);
      action = tool.run({});
      await entered.promise;
      capture.select(undefined); // A read witness changes the turn while this action awaits.
      resume.resolve();
      await action;
      expect(tasks.capture.asksFor("prototype").map((ask) => ask.id)).toEqual([request.id]);
      expect(capture.current()).toBeUndefined();
    } finally {
      resume.resolve();
      await action?.catch(() => {});
      db.close();
    }
  });

  it("refuses an unread message before running the action", async () => {
    const { db, capture } = setup();
    let ran = false;
    const unread = capture.open({ text: "is this a bug?" });
    const tool = withAskAttribution(
      boundTool({
        name: "create_task",
        label: "File",
        description: "Record work",
        parameters: Type.Object({}),
        run: async () => {
          ran = true;
          return { text: "filed" };
        },
      }),
      capture,
      () => false,
    );
    try {
      expect(() => tool.run({ ask_id: unread.id })).toThrow("this turn has read");
      expect(ran).toBe(false);
    } finally {
      db.close();
    }
  });

  // INF-6115: a card or reply made with a named ask_id is recorded for that
  // message alone, never for every message the turn read.
  it("names the one message an action's ask_id named, and none when it named none", async () => {
    const { db, capture, request } = setup();
    const other = capture.open({ text: "and the phone layout?" });
    const named: (string | undefined)[] = [];
    const tool = withAskAttribution(
      boundTool({
        name: "emit_card",
        label: "Card",
        description: "Show a card",
        parameters: Type.Object({}),
        run: async () => {
          named.push(capture.namedAsk());
          return { text: "shown" };
        },
      }),
      capture,
      (id) => id === request.id || id === other.id,
    );
    try {
      await tool.run({ ask_id: request.id });
      await tool.run({});
      await tool.run({ ask_id: "" });
      expect(named).toEqual([request.id, undefined, undefined]);
    } finally {
      db.close();
    }
  });
});
