import { describe, expect, it, vi } from "vitest";
import {
  api,
  gate,
  model,
  placedWorldHooks,
  said,
  world,
} from "../../../tests/helpers/placedWorld";
import { saveThereFor } from "../devices/saveThere";
import { renderWake } from "../orchestrator/wakes";
import { CREWMATE_TOOLS } from "../pi/crewmateTaskTools";
import type { CrewmateTool } from "../session/tools";

/**
 * A computer that runs work saves its own crew's work before its home
 * updates it (docs/devices.md, "Saving work before an update"; docs/helper.md,
 * "Saving its work before an update"): the call a crewmate runs there
 * finishes, its turn stops there, the home has its end before the update
 * goes on, and it carries on once after - or goes on as if never asked when
 * the update is let go.
 */

// Integration budget (docs/test-cohorts.md): a real computer that runs work
// and a real home over the connection, as `placedReach.test.ts` runs them.
vi.setConfig({ testTimeout: 10_000 });
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

let ahead = 0;
placedWorldHooks({
  now: () => Date.now() + ahead,
  reset: () => {
    ahead = 0;
  },
});

/** The crewmate's tools there, with `note_progress` held there until the test lets it finish. */
function holdingProgress(): {
  tools: CrewmateTool[];
  reached: Promise<void>;
  open: () => void;
  finished: () => number;
} {
  let reach!: () => void;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const held = gate();
  let finished = 0;
  const tools = CREWMATE_TOOLS.map((tool: CrewmateTool): CrewmateTool => {
    if (tool.name !== "note_progress") return tool;
    return {
      ...tool,
      bind: (delegate) => {
        const bound = tool.bind(delegate);
        return (
          bound && {
            ...bound,
            run: async (params, signal) => {
              reach();
              await held.held;
              const result = await bound.run(params, signal);
              finished += 1;
              return result;
            },
          }
        );
      },
    };
  });
  return { tools, reached, open: held.open, finished: () => finished };
}

describe("a computer that runs work saving its crew's work before its update", () => {
  it("waits for the call a turn runs there, has the turn's end before it is saved, and carries it on once after repeated restarts", async () => {
    const progress = holdingProgress();
    const at = await world(undefined, { tools: progress.tools });
    model([
      { tools: [{ name: "note_progress", args: { text: "Checking the footer." } }] },
      { text: "Picked the footer up again." },
    ]);
    const requests = api.requests.length;
    await at.start("t-save");
    await progress.reached;
    const home = at.home();
    const computer = at
      .pairing()
      .list()
      .find((device) => device.id === at.deviceId)?.name;

    const there = saveThereFor(home.devices, at.deviceId);
    expect(there).toBeDefined();
    const waiting: string[][] = [];
    let saved: string | undefined;
    const saving = home.supervisor.updates.pauseForUpdate(at.deviceId, {
      signal: new AbortController().signal,
      waiting: (tasks) => waiting.push(tasks),
      ...(there ? { there } : {}),
    });
    void saving.then((outcome) => {
      saved = outcome;
    });
    // A second ask, as a duplicate update request, joins the first.
    expect(home.supervisor.updates.pauseForUpdate(at.deviceId)).toBe(saving);
    await expect.poll(() => waiting.at(-1)).toEqual(["website"]);
    // The call there still runs, so the work is not saved yet.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(saved).toBeUndefined();
    expect(progress.finished()).toBe(0);

    progress.open();
    expect(await saving).toBe("saved");
    // The call finished and kept its result; the turn's end is here before the update goes on.
    expect(progress.finished()).toBe(1);
    expect(home.tasks.get("t-save")?.activity).toBe("idle");
    expect(waiting.at(-1)).toEqual([]);
    expect(api.requests.length - requests).toBe(1);

    // The update restarts the computer, here twice, and the connection drops meanwhile.
    await at.restartComputer();
    await at.restartComputer();
    await at.inReach("t-save");
    expect(api.requests.length - requests).toBe(1);
    home.supervisor.updates.resumeAfterUpdate(at.deviceId);

    await expect.poll(() => home.tasks.get("t-save")?.outcome).toBe("Picked the footer up again.");
    // One carry-on turn, which starts with why it stopped.
    expect(api.requests.length - requests).toBe(2);
    expect(said(api.requests.at(-1))).toContain(
      renderWake({ facts: { kind: "turn-resumed", stopped: "update", computer } }),
    );
    expect(home.tasks.timeline("t-save").some((event) => event.kind === "failed")).toBe(false);
    expect(home.events.some((event) => event.type === "turn_failed")).toBe(false);
    expect(home.inbox.allFor("t-save")).toEqual([]);
  });

  it("lets the save go on Update later: the turn it had not stopped goes on there as if never asked, and starts nothing again", async () => {
    const progress = holdingProgress();
    const at = await world(undefined, { tools: progress.tools });
    model([
      { tools: [{ name: "note_progress", args: { text: "Checking the footer." } }] },
      { text: "Fixed the footer." },
    ]);
    const requests = api.requests.length;
    await at.start("t-later");
    await progress.reached;
    const home = at.home();
    const there = saveThereFor(home.devices, at.deviceId);
    const later = new AbortController();
    const saving = home.supervisor.updates.pauseForUpdate(at.deviceId, {
      signal: later.signal,
      ...(there ? { there } : {}),
    });
    await expect
      .poll(() => home.inbox.allFor("t-later").map((row) => row.facts?.kind))
      .toEqual(["turn-resumed"]);

    later.abort();
    expect(await saving).toBe("withdrawn");
    home.supervisor.updates.resumeAfterUpdate(at.deviceId);
    // Let go there, the turn is no longer held: its row goes, and its call finishes.
    await expect.poll(() => home.inbox.allFor("t-later")).toEqual([]);
    progress.open();

    await expect.poll(() => home.tasks.get("t-later")?.outcome).toBe("Fixed the footer.");
    // The same turn went on: no second turn, and nothing said it stopped.
    expect(api.requests.length - requests).toBe(2);
    expect(said(api.requests.at(-1))).not.toContain("turn-resumed");
    expect(home.events.some((event) => event.type === "turn_failed")).toBe(false);
    expect(home.tasks.timeline("t-later").some((event) => event.kind === "failed")).toBe(false);
  });
});
