import { workOrders } from "@shared/work";
import { UPDATE_RETURN_MS, WORK_RELEASE_ORDER, WORK_SAVE_ORDER } from "@shared/workUpdate";
import { WORK_UPDATE_SAVING } from "../connection/cardCompatibility";
import { DeviceOutOfReachError } from "../connection/connection";
import { listsChange } from "../connection/contractChanges";
import type { SaveThere } from "../orchestrator/crewUpdates";
import type { WorkDevices } from "../placed/workDevices";

type SaveLink = Pick<WorkDevices, "ask" | "inReach" | "onWorkDevice" | "version">;

/**
 * The save a computer that runs work does itself before its home updates it
 * (docs/helper.md, "Saving its work before an update"), when it is in reach
 * and lists `work-update-saving`; undefined for any other, whose turns its
 * home cuts instead.
 */
export function saveThereFor(
  work: SaveLink,
  deviceId: string,
  returnMs = UPDATE_RETURN_MS,
): SaveThere | undefined {
  if (!work.inReach(deviceId) || !listsChange(work.version(deviceId)?.changes, WORK_UPDATE_SAVING))
    return undefined;
  const answer = (raw: unknown) => workOrders[WORK_SAVE_ORDER].response.parse(raw);
  return {
    // A drop while it saves is waited out for as long as an update has to
    // come back, and the same save asked again there: it joins the first,
    // which went on there meanwhile.
    save: async (signal) => {
      for (;;) {
        signal.throwIfAborted();
        try {
          return answer(await abortable(work.ask(deviceId, WORK_SAVE_ORDER, []), signal));
        } catch (caught) {
          if (!(caught instanceof DeviceOutOfReachError)) throw caught;
          await back(work, deviceId, signal, returnMs);
        }
      }
    },
    release: async () => {
      try {
        return workOrders[WORK_RELEASE_ORDER].response.parse(
          await work.ask(deviceId, WORK_RELEASE_ORDER, []),
        );
      } catch {
        // Out of reach, or updated since: it lets the save go by itself.
        return undefined;
      }
    },
  };
}

/** Resolves once the computer is in reach again; rejects after `returnMs`, or once `signal` aborts. */
function back(
  work: SaveLink,
  deviceId: string,
  signal: AbortSignal,
  returnMs: number,
): Promise<void> {
  if (work.inReach(deviceId)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (settle: () => void) => {
      clearTimeout(timer);
      stop();
      signal.removeEventListener("abort", aborted);
      settle();
    };
    const aborted = () => done(() => reject(signal.reason));
    const timer = setTimeout(() => done(() => reject(new DeviceOutOfReachError())), returnMs);
    const stop = work.onWorkDevice((contact) => {
      if (contact.deviceId === deviceId && contact.contact === "in-reach") done(resolve);
    });
    signal.addEventListener("abort", aborted, { once: true });
  });
}

/** The ask, or the signal's reason once it aborts first; the order still runs there. */
function abortable<T>(asked: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    asked.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}
