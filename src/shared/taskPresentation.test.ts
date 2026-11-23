import { describe, expect, it } from "vitest";
import * as m from "./i18n/messages.generated.ts";
import {
  STARTED_BACKLOG_REASON,
  type TaskStatusInput,
  taskStatusLabel,
  taskStatusOf,
  waitRecordedTime,
} from "./taskPresentation";

const base: TaskStatusInput = {
  status: "open",
  activity: null,
  closedReason: null,
  startPolicy: "on-request",
  flags: { blocked: false, held: false, needsYou: false, ready: true },
  waitingCardId: null,
  children: { total: 0, closed: 0 },
};
const read = (changes: Partial<TaskStatusInput>) => taskStatusOf({ ...base, ...changes });
describe("one task status", () => {
  // INF-5578 finding 4: a passed review read "No continuing work" for a day
  // while its change waited on a task held for an app update. The row names
  // where its wait stops and until when, from the view's typed chain.
  it("names where a started task's wait stops, and that task's hold", () => {
    const now = Date.UTC(2026, 10, 20, 21, 0);
    const until = Date.UTC(2026, 10, 21, 20, 0);
    const review = {
      status: "active",
      activity: "idle",
      workPosture: { state: "idle", reason: "inactive" },
    } as const;
    const reason = (changes: Partial<TaskStatusInput>) =>
      taskStatusOf({ ...base, ...review, ...changes }, now).reason;
    // The review: its change, and the held task that change waits on.
    expect(reason({ waitChain: { on: "INF-5278", end: "INF-5277", until } })).toBe(
      m.taskWaitChainUntil({ on: "INF-5278", end: "INF-5277", time: waitRecordedTime(until, now) }),
    );
    expect(reason({ waitChain: { on: "INF-5278", end: "INF-5277", update: true } })).toBe(
      m.taskWaitChainUpdate({ on: "INF-5278", end: "INF-5277" }),
    );
    expect(reason({ waitChain: { on: "INF-5278", end: "INF-5277" } })).toBe(
      m.taskWaitChainVia({ on: "INF-5278", end: "INF-5277" }),
    );
    expect(reason({ waitChain: { on: "INF-5278" } })).toBe(m.taskWaitOn({ on: "INF-5278" }));
    // The change itself, waiting on the held task by its own blocks link.
    const dependency = { state: "idle", reason: "dependency" } as const;
    expect(
      reason({
        workPosture: dependency,
        blockedBy: ["INF-5277"],
        waitChain: { on: "INF-5277", until },
      }),
    ).toBe(m.taskWaitOnUntil({ on: "INF-5277", time: waitRecordedTime(until, now) }));
    expect(
      reason({
        workPosture: dependency,
        blockedBy: ["INF-5277"],
        waitChain: { on: "INF-5277", update: true },
      }),
    ).toBe(m.taskWaitOnUpdate({ on: "INF-5277" }));
    // A row working, or failing at its provider, keeps its own words.
    expect(
      taskStatusOf(
        {
          ...base,
          status: "active",
          activity: "running",
          workPosture: { state: "active", reason: "turn" },
          waitChain: { on: "INF-5278" },
        },
        now,
      ).reason,
    ).toBe("");
    expect(
      reason({
        workPosture: { state: "idle", reason: "inactive", atProvider: "stuck" },
        waitChain: { on: "INF-5278" },
      }),
    ).not.toBe(m.taskWaitOn({ on: "INF-5278" }));
  });
  // INF-2062: started work back in the backlog reads as Backlog, marked started, since it went.
  it("reads started work in the backlog as Backlog, marked started, with its wait", () => {
    const parked = read({ status: "active", activity: "idle", backlogSince: 9 });
    expect(parked).toMatchObject({ mark: "backlog", word: "Backlog", since: 9 });
    expect(taskStatusLabel(parked)).toBe(`Backlog · ${STARTED_BACKLOG_REASON}`);
  });
  it.each([
    [{}, "backlog", "Backlog"],
    [{ startPolicy: "when-ready" }, "queued", "Queued"],
    [{ status: "active", activity: "running" }, "working", "Working"],
    [{ status: "active", activity: "idle" }, "idle", "Idle"],
    [{ status: "active", activity: "interrupted" }, "interrupted", "Interrupted"],
    [{ waitingCardId: "card" }, "waiting", "Waiting on you"],
    [{ status: "done", activity: "running" }, "done", "Done"],
    [{ status: "dropped", closedReason: "failed" }, "dropped", "Dropped"],
  ] as const)("reads %j as %s", (input, mark, word) => {
    expect(read(input)).toMatchObject({ mark, word });
  });
  it("preserves honest reasons without expanding the status vocabulary", () => {
    for (const [state, reason] of [
      ["idle", "checks"],
      ["paused", "access"],
      ["unknown", "unobserved"],
    ] as const) {
      expect(read({ status: "active", workPosture: { state, reason } }).mark).toBe("idle");
      expect(read({ status: "active", workPosture: { state, reason } }).reason).not.toBe("");
    }
    expect(
      taskStatusLabel(read({ status: "active", workPosture: { state: "idle", reason: "checks" } })),
    ).toBe("Idle · Waiting for checks");
  });
  it("puts closure then ready decisions then continuing work ahead of stale interruption", () => {
    expect(read({ status: "done", waitingCardId: "old", activity: "interrupted" }).mark).toBe(
      "done",
    );
    expect(read({ status: "active", captainWait: true, activity: "running" }).mark).toBe("working");
    expect(read({ status: "active", waitingCardId: "ready", activity: "running" }).mark).toBe(
      "waiting",
    );
    expect(
      read({
        status: "active",
        activity: "interrupted",
        workPosture: { state: "active", reason: "job" },
      }),
    ).toEqual({
      mark: "working",
      word: "Working",
      reason: "Background work continues",
      wait: "job",
    });
    expect(
      read({
        status: "active",
        activity: "interrupted",
        workPosture: { state: "unknown", reason: "unobserved" },
      }).mark,
    ).toBe("interrupted");
  });
  it("a declared wait is not a decision and cannot hide continuing checks", () => {
    expect(
      read({
        status: "active",
        captainWait: true,
        workPosture: { state: "active", reason: "checks" },
      }),
    ).toEqual({ mark: "working", word: "Working", reason: "Waiting for checks", wait: "checks" });
    expect(
      read({
        status: "active",
        captainWait: true,
        activity: "idle",
        workPosture: { state: "idle", reason: "captain" },
      }),
    ).toEqual({ mark: "idle", word: "Idle", reason: "Work is paused" });
  });
  // INF-676 (captain's direction A) and INF-1777 (the captain's approved
  // plan): the checks watch and local background work keep Working and their
  // reasons, and only they carry the wait the shared mark draws.
  it("marks only the checks watch and background work as a wait inside Working", () => {
    const checks = read({ status: "active", workPosture: { state: "active", reason: "checks" } });
    expect(checks).toMatchObject({ mark: "working", word: "Working", wait: "checks" });
    expect(taskStatusLabel(checks)).toBe("Working · Waiting for checks");
    const job = read({ status: "active", workPosture: { state: "active", reason: "job" } });
    expect(job).toMatchObject({ mark: "working", word: "Working", wait: "job" });
    expect(taskStatusLabel(job)).toBe("Working · Background work continues");
    for (const reason of ["turn", "guidance", "settlement", "timed-wait"] as const)
      expect(
        read({ status: "active", workPosture: { state: "active", reason } }),
      ).not.toHaveProperty("wait");
    for (const reason of ["checks", "job"] as const)
      expect(read({ status: "active", workPosture: { state: "idle", reason } })).not.toHaveProperty(
        "wait",
      );
  });
  // INF-38 (INF-1137 friction 5, "should they resume?"): a started crewmate
  // idle on other work names that work and, when known, when the wait was
  // recorded; a merge card says it waits for the captain's merge.
  it("names what a started crewmate waits on, and when that wait was recorded", () => {
    const idle = {
      status: "active",
      activity: "idle",
      workPosture: { state: "idle", reason: "dependency" },
    } as const;
    const one = read({ ...idle, blockedBy: ["INF-12"], blockedSince: { "INF-12": 1_000 } });
    expect(one).toMatchObject({ mark: "idle", reason: "Waiting on INF-12", since: 1_000 });
    expect(one.waitsOn).toEqual(["INF-12"]);
    expect(read({ ...idle, blockedBy: ["INF-12"] }).since).toBeUndefined();
    const two = read({ ...idle, blockedBy: ["INF-12", "INF-13"], blockedSince: { "INF-12": 1 } });
    expect(taskStatusLabel(two)).toBe("Idle · Waiting on 2 tasks");
    expect(two.since).toBeUndefined();
    // A wait whose blocker the view cannot name keeps the posture's own words.
    expect(read({ ...idle, blockedBy: [] })).toMatchObject({ reason: "Blocked by another task" });
    expect(read({ ...idle, blockedBy: [] }).waitsOn).toBeUndefined();
    expect(
      read({ status: "active", activity: "idle", waitingCardId: "c", waitingCardMerges: true }),
    ).toMatchObject({ mark: "waiting", word: "Waiting on you", reason: "Waiting for your merge" });
  });
  it("reads open work by its start policy, with a blocker or hold as the reason", () => {
    expect(
      read({ startPolicy: "when-ready", flags: { ...base.flags, blocked: true } }),
    ).toMatchObject({ mark: "queued", word: "Queued", reason: "Blocked by another task" });
    expect(read({ startPolicy: "when-ready", flags: { ...base.flags, held: true } })).toMatchObject(
      { mark: "queued", word: "Queued", reason: "Held" },
    );
    expect(read({ flags: { ...base.flags, blocked: true } })).toMatchObject({
      mark: "backlog",
      word: "Backlog",
      reason: "Blocked by another task",
    });
    expect(read({})).toMatchObject({ reason: "Starts when you press Start" });
    expect(read({ startPolicy: "when-ready" })).toMatchObject({
      reason: "Starts by itself when ready",
    });
  });
  it("says a parent's parts do the work, after a blocker or hold", () => {
    expect(taskStatusLabel(read({ children: { total: 3, closed: 1 } }))).toBe(
      "Backlog · Its 3 parts do the work",
    );
    expect(
      taskStatusLabel(read({ startPolicy: "when-ready", children: { total: 1, closed: 0 } })),
    ).toBe("Queued · Its 1 part does the work");
    expect(
      read({ children: { total: 2, closed: 0 }, flags: { ...base.flags, held: true } }).reason,
    ).toBe("Held");
    // Started work reads by its activity, parts or not.
    expect(
      read({ status: "active", activity: "running", children: { total: 2, closed: 0 } }).reason,
    ).toBe("");
  });

  it("says a task on a computer whose connection is being made is connecting, with no warn mark", () => {
    const place = { name: "Mac mini", where: "on Mac mini" };
    const away = read({
      status: "active",
      activity: "running",
      place: { ...place, reach: "out-of-reach" },
    });
    expect(away).toMatchObject({
      mark: "working",
      reason: "Mac mini is out of reach",
      outOfReach: true,
    });
    const connecting = read({
      status: "active",
      activity: "running",
      place: { ...place, reach: "connecting" },
    });
    expect(connecting).toMatchObject({ mark: "working", reason: "Mac mini is connecting" });
    expect(connecting.outOfReach).toBeUndefined();
    // As sent on the wire: `outOfReach` beside `connecting`, for a paired view on protocol 8.5.
    const sent = read({
      status: "active",
      activity: "running",
      place: { ...place, reach: "connecting" },
    });
    expect(sent).toMatchObject({ mark: "working", reason: "Mac mini is connecting" });
    expect(sent.outOfReach).toBeUndefined();
    expect(read({ place: { ...place, reach: "connecting" } }).reason).toBe(
      "Mac mini is connecting",
    );
  });

  // The captain's ask: an updating work computer should not read "out of reach",
  // which is scary; only one truly out of reach should (`computer-updating.md`).
  it("says a task on a computer being updated is updating, with no warn mark, then out of reach once the update ends", () => {
    const place = { name: "Mac mini", where: "on Mac mini" };
    for (const reach of ["out-of-reach", "in-reach"] as const) {
      const updating = read({
        status: "active",
        activity: "running",
        place: { ...place, reach, updating: true },
      });
      expect(updating).toMatchObject({ mark: "working", reason: "Mac mini is updating" });
      expect(updating.outOfReach).toBeUndefined();
    }
    // An older computer being updated reads updating too, not "takes no new work".
    expect(
      read({ place: { ...place, reach: "out-of-reach", noNewWork: true, updating: true } }).reason,
    ).toBe("Mac mini is updating");
    // The update over and the computer not back: out of reach, in warn.
    expect(
      read({ status: "active", activity: "running", place: { ...place, reach: "out-of-reach" } }),
    ).toMatchObject({ reason: "Mac mini is out of reach", outOfReach: true });
  });

  // INF-1810 finding 7: a restart's catching up is in reach, not out of it.
  it("says a task whose connected computer it is catching up with is catching up since then, with no warn mark", () => {
    const since = new Date(2026, 10, 7, 12, 57).getTime();
    const later = new Date(2026, 10, 7, 13, 5).getTime();
    const place = { name: "Mac mini", where: "on Mac mini", reach: "in-reach" as const };
    const at = (time: string) => `Catching up with Mac mini since ${time}`;
    const time = new Date(since).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const idle = taskStatusOf(
      { ...base, status: "active", activity: "idle", place: { ...place, catchingUpSince: since } },
      later,
    );
    expect(idle).toMatchObject({ mark: "idle", word: "Idle", reason: at(time) });
    expect(idle.outOfReach).toBeUndefined();
    const working = taskStatusOf(
      {
        ...base,
        status: "active",
        activity: "running",
        place: { ...place, catchingUpSince: since },
      },
      later,
    );
    expect(working).toMatchObject({ mark: "working", reason: at(time) });
    expect(working.outOfReach).toBeUndefined();
    // Open work keeps its blocker as the reason, and its mark as it was.
    const held = taskStatusOf(
      {
        ...base,
        startPolicy: "when-ready",
        flags: { ...base.flags, held: true },
        place: { ...place, catchingUpSince: since },
      },
      later,
    );
    expect(held).toMatchObject({ mark: "queued", reason: "Held" });
    expect(held.outOfReach).toBeUndefined();
    // A day later the time names its date.
    const nextDay = taskStatusOf(
      { ...base, status: "active", activity: "idle", place: { ...place, catchingUpSince: since } },
      later + 24 * 60 * 60 * 1000,
    );
    const day = new Date(since).toLocaleDateString([], { month: "short", day: "numeric" });
    expect(nextDay.reason).toBe(at(`${day}, ${time}`));
    // Caught up: an in-reach place reads as any task here.
    expect(read({ status: "active", activity: "idle", place })).toMatchObject({
      mark: "idle",
      reason: "No continuing work",
    });
  });
});
