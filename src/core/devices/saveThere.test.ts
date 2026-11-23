import { PROTOCOL_VERSION } from "@shared/ipc";
import { WORK_SAVE_ORDER } from "@shared/work";
import { describe, expect, it } from "vitest";
import { DeviceOutOfReachError } from "../connection/connection";
import type { WorkDeviceContact } from "../connection/connectionTypes";
import { CONTRACT_CHANGES } from "../connection/contractChanges";
import { saveThereFor } from "./saveThere";

/**
 * The save a computer that runs work does itself before its home updates it,
 * as the home asks it (docs/devices.md, "Saving work before an update"): only
 * of a computer in reach that lists the change, and a drop while it saves is
 * waited out and the same save asked again.
 */

const MINI = "device-mini";

/** The home's link to one computer: whether it is in reach, what its hello listed, and each order it was asked. */
function link(options: { changes?: readonly string[]; inReach?: boolean } = {}) {
  let inReach = options.inReach ?? true;
  const listeners = new Set<(contact: WorkDeviceContact) => void>();
  const answers: (() => Promise<unknown>)[] = [];
  const asked: string[] = [];
  return {
    asked,
    answers,
    inReach: (deviceId: string) => deviceId === MINI && inReach,
    version: () => ({
      contract: PROTOCOL_VERSION,
      takesWork: true,
      changes: options.changes ?? CONTRACT_CHANGES.names,
    }),
    ask: (_deviceId: string, channel: string) => {
      asked.push(channel);
      const next = answers.shift();
      return next ? next() : Promise.reject(new DeviceOutOfReachError());
    },
    onWorkDevice: (listener: (contact: WorkDeviceContact) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The computer's connection drops, or comes back. */
    contact: (contact: WorkDeviceContact["contact"]) => {
      inReach = contact === "in-reach";
      for (const listener of [...listeners]) listener({ deviceId: MINI, contact });
    },
  };
}

describe("the save a computer that runs work does before its update", () => {
  it("is asked only of a computer in reach whose hello lists the change", () => {
    expect(saveThereFor(link(), MINI)).toBeDefined();
    expect(saveThereFor(link({ inReach: false }), MINI)).toBeUndefined();
    const older = CONTRACT_CHANGES.names.filter((name) => name !== "work-update-saving");
    expect(saveThereFor(link({ changes: older }), MINI)).toBeUndefined();
  });

  it("waits out a drop while it saves and asks the same save again once the computer is back", async () => {
    const home = link();
    home.answers.push(() => {
      home.contact("gone");
      return Promise.reject(new DeviceOutOfReachError());
    });
    home.answers.push(async () => ({ stopped: ["task-footer"] }));
    const there = saveThereFor(home, MINI, 60_000);
    const saving = there?.save(new AbortController().signal);
    await expect.poll(() => home.asked.length).toBe(1);
    home.contact("in-reach");
    await expect(saving).resolves.toEqual({ stopped: ["task-footer"] });
    expect(home.asked).toEqual([WORK_SAVE_ORDER, WORK_SAVE_ORDER]);
  });

  it("gives up once the computer has not come back for as long as an update has to return, or once Update later lets it go", async () => {
    const home = link();
    home.answers.push(() => {
      home.contact("gone");
      return Promise.reject(new DeviceOutOfReachError());
    });
    const there = saveThereFor(home, MINI, 20);
    await expect(there?.save(new AbortController().signal)).rejects.toBeInstanceOf(
      DeviceOutOfReachError,
    );

    const back = link();
    back.answers.push(() => new Promise(() => {}));
    const later = new AbortController();
    const saving = saveThereFor(back, MINI)?.save(later.signal);
    later.abort(new Error("Update later"));
    await expect(saving).rejects.toThrow("Update later");
  });
});
