import type { DeviceAddresses, DeviceInvite, DeviceRemoveWhen, DeviceView } from "@shared/devices";
import { deviceJoinedLine, deviceRunsWork } from "@shared/devices";
import type { NearbyMacsView } from "@shared/nearbyMacs";
import {
  type RemoteLoginConfirmQuestion,
  type RemoteLoginCopy,
  type RemoteLoginLeaveQuestion,
  type RemoteLoginPasswordQuestion,
  type RemoteLoginRefusedAnswer,
  refusalIsAboutReach,
} from "@shared/remoteLogin";
import type { DeviceSignIns } from "@shared/signIns";
import { create } from "zustand";
import type { AddingMac, DevicePanelMake } from "./devicesWords";

/**
 * What Settings -> Devices holds (`DevicesTab.tsx`, docs/devices.md): the
 * link or command panel and what is under way over Remote Login, each a
 * store that outlives a tab switch; the reach refusal a row clears; and the
 * props every part of the tab reads.
 */

/** The open link's or command's panel: shown, used by a device, or gone unused. */
export type LinkPanel =
  | { state: "open"; invite: DeviceInvite; make: DevicePanelMake; copied?: boolean }
  | {
      state: "joined";
      line: string;
      work: boolean;
      /** The device that joined, so a later sign-in there can clear the note. */
      deviceId?: string;
      /** The line says it has no sign-ins yet: it goes once one arrives. */
      awaitingSignIn?: boolean;
    }
  | { state: "expired"; make: DevicePanelMake };

/** Whether the joined note claims no sign-ins, and that device now has one. */
export function joinedNoticeClears(
  panel: LinkPanel | null,
  signIns: readonly DeviceSignIns[],
): boolean {
  if (!panel || panel.state !== "joined" || !panel.awaitingSignIn || !panel.deviceId) return false;
  const own = signIns.find((entry) => entry.deviceId === panel.deviceId)?.signIns;
  if (!own) return false;
  return own.accounts.length > 0 || (own.forges?.signIns.length ?? 0) > 0;
}

/**
 * A "could not reach" refusal, kept with the computer (and the address it
 * tried, for Change address) it was about. It is stale once that computer's
 * connection began after the refusal (`connectedAt`), or when the computer
 * is gone; every other refusal stays until the captain's next action.
 */
export type ReachRefusal = {
  deviceId: string;
  line: string;
  /** The address the refusal tried; the row has to reconnect at it for the line to go. */
  address?: string;
  /** When the refusal was recorded, in milliseconds since the epoch. */
  at: number;
};

/** What to keep of a refusal: the reach refusal's record, or nothing for any other refusal, which stays until the next action. */
export function reachRefusalOf(
  answer: RemoteLoginRefusedAnswer,
  deviceId: string,
  at: number,
  address?: string,
): ReachRefusal | null {
  if (!refusalIsAboutReach(answer.refused)) return null;
  return {
    deviceId,
    line: answer.lines.join("\n"),
    ...(address === undefined ? {} : { address }),
    at,
  };
}

/** Whether the refusal clears: its computer is gone, or a connection at the tried address began after it. */
export function reachRefusalAfter(refusal: ReachRefusal, devices: readonly DeviceView[]): boolean {
  const device = devices.find((each) => each.id === refusal.deviceId);
  if (!device) return true;
  const there = refusal.address === undefined || device.remoteLogin === refusal.address;
  return there && device.connectedAt !== undefined && device.connectedAt > refusal.at;
}

type PanelStore = {
  panel: LinkPanel | null;
  stopListening: (() => void) | null;
  show: (invite: DeviceInvite, make: DevicePanelMake, copied?: boolean) => void;
  clear: () => void;
};

/**
 * The panel outlives a tab switch, so a link made from a card is still on
 * screen when the captain comes back, and a device that joins while the tab
 * is closed still turns the panel to "joined".
 */
export const usePanel = create<PanelStore>((set, get) => ({
  panel: null,
  stopListening: null,
  show: (invite, make, copied = false) => {
    get().stopListening?.();
    const stopListening = window.infinitary.events.on((event) => {
      if (event.type !== "device_joined") return;
      const { panel } = get();
      if (panel?.state !== "open") return;
      get().stopListening?.();
      // A first join says it has no sign-ins yet. That note goes once one arrives.
      const awaitingSignIn = deviceRunsWork(event.kind) && event.again !== true;
      const hearSignIn = awaitingSignIn
        ? window.infinitary.events.on((later) => {
            if (later.type === "device_signed_in" && later.deviceId === event.deviceId)
              get().clear();
          })
        : null;
      set({
        panel: {
          state: "joined",
          line: deviceJoinedLine(event),
          // One that found this Mac again keeps the projects it ran.
          work: deviceRunsWork(event.kind) && !event.again,
          deviceId: event.deviceId,
          awaitingSignIn,
        },
        stopListening: hearSignIn,
      });
    });
    set({
      panel: { state: "open", invite, make, ...(copied ? { copied: true } : {}) },
      stopListening,
    });
  },
  clear: () => {
    get().stopListening?.();
    set({ panel: null, stopListening: null });
  },
}));

/** A computer this Mac is looking for at another address, to reach it there from now on. */
export type MovingMac = { deviceId: string; address: string };

type SetupStore = {
  adding: AddingMac[];
  /** Computers whose Firstmate is updating at a click here, by id. */
  updating: string[];
  /**
   * Computers this Mac is updating by itself (docs/devices.md, "Updating by
   * itself"), followed from the update's own steps while Devices is open:
   * from its first count until it is done or refused.
   */
  following: string[];
  updateCopy: Record<string, RemoteLoginCopy>;
  /** Computers whose address is changing. */
  moving: MovingMac[];
  stopListening: (() => void) | null;
  addFrom: (address: string, stage?: AddingMac["stage"]) => void;
  addDone: (address: string) => void;
  updateFrom: (deviceId: string) => void;
  updateDone: (deviceId: string) => void;
  moveFrom: (moving: MovingMac) => void;
  moveDone: (deviceId: string) => void;
  /** Devices is open: every update's steps are heard until the returned stop. */
  follow: () => () => void;
};

/**
 * What is under way over Remote Login, outliving a tab switch like the
 * panel: each step the core says moves the Mac's row on.
 */
export const useSetups = create<SetupStore>((set, get) => {
  /** How many open Devices tabs follow every update. */
  let watching = 0;
  /**
   * An update's step, over Remote Login or the connection: its count reads
   * the same in its row. One no click here started is followed from its first
   * count, which every update that sends or starts anything says, until it is
   * done or refused; one that only asks a password says no count, so it is
   * never left reading as updating.
   */
  const updateSaid = (deviceId: string, stage: string, copy: RemoteLoginCopy | undefined) => {
    const { updating, following, updateCopy } = get();
    if (copy)
      set({
        updateCopy: { ...updateCopy, [deviceId]: copy },
        ...(updating.includes(deviceId) || following.includes(deviceId)
          ? {}
          : { following: [...following, deviceId] }),
      });
    if ((stage === "done" || stage === "refused") && get().following.includes(deviceId)) {
      const left = { ...get().updateCopy };
      delete left[deviceId];
      set({ following: get().following.filter((id) => id !== deviceId), updateCopy: left });
    }
  };
  const hear = () => {
    if (get().stopListening) return;
    const stopListening = window.infinitary.events.on((event) => {
      if (event.type === "device_update") {
        updateSaid(event.deviceId, event.stage, event.copy);
        return;
      }
      if (event.type !== "device_setup") return;
      if (event.doing === "update" && event.deviceId) {
        updateSaid(event.deviceId, event.stage, event.copy);
        return;
      }
      if (event.doing !== "add") return;
      set({
        adding: get().adding.map((mac) =>
          mac.address !== event.address
            ? mac
            : {
                ...mac,
                ...(event.stage === "setting-up" || event.stage === "finding"
                  ? { stage: event.stage }
                  : {}),
                ...(event.stage === "finding" && event.deviceId
                  ? { deviceId: event.deviceId }
                  : {}),
                ...(event.name ? { name: event.name } : {}),
                ...(event.copy ? { copy: event.copy } : {}),
              },
        ),
      });
    });
    set({ stopListening });
  };
  const quiet = () => {
    const { adding, updating, stopListening } = get();
    if (adding.length > 0 || updating.length > 0 || watching > 0) return;
    stopListening?.();
    // Unheard from now on, an update by itself is not said to go on.
    const updateCopy = { ...get().updateCopy };
    for (const deviceId of get().following) delete updateCopy[deviceId];
    set({ stopListening: null, following: [], updateCopy });
  };
  return {
    adding: [],
    updating: [],
    following: [],
    updateCopy: {},
    moving: [],
    stopListening: null,
    addFrom: (address, stage = "reaching") => {
      hear();
      set({ adding: [...get().adding, { address, stage }] });
    },
    addDone: (address) => {
      set({ adding: get().adding.filter((mac) => mac.address !== address) });
      quiet();
    },
    updateFrom: (deviceId) => {
      hear();
      set({ updating: [...get().updating, deviceId] });
    },
    updateDone: (deviceId) => {
      const updateCopy = { ...get().updateCopy };
      delete updateCopy[deviceId];
      set({ updating: get().updating.filter((id) => id !== deviceId), updateCopy });
      quiet();
    },
    moveFrom: (moving) => set({ moving: [...get().moving, moving] }),
    moveDone: (deviceId) =>
      set({ moving: get().moving.filter((each) => each.deviceId !== deviceId) }),
    follow: () => {
      watching += 1;
      hear();
      return () => {
        watching -= 1;
        quiet();
      };
    },
  };
});

/** Which click is under way: making a link or a command, or removing a device. */
export type Busy = "link" | "remove" | "carry" | null;

/**
 * Carry its tasks on's question (docs/devices.md, "Joined again"): asked
 * from `row`, for the tasks of `from`, a computer out of reach; `to` is the
 * row that joined again, or absent while the captain picks where they go.
 */
export type CarryAsk = { row: string; from: string; to?: string };

export type DevicesTabViewProps = {
  devices: DeviceView[];
  /** What each computer that runs work last said of its sign-ins. */
  signIns: DeviceSignIns[];
  addresses: DeviceAddresses | null;
  panel: LinkPanel | null;
  now: number;
  /** The device whose Remove question is open. */
  removing: string | null;
  /**
   * The computer whose address question is open: Change address, or Add it
   * by its address for one held on the local network.
   */
  changing: string | null;
  /** Computers whose address is changing. */
  moving: MovingMac[];
  /** + A computer's address form is open. */
  askingAddress: boolean;
  packageUpdate?: DeviceView | undefined;
  /** Macs nearby with Remote Login on, while that question is open. */
  nearby: NearbyMacsView;
  /** The check line, while the captain has not said this is the Mac. */
  confirming: RemoteLoginConfirmQuestion | null;
  /** That user's password, asked once, while the Mac did not let the captain's key in. */
  passwording: RemoteLoginPasswordQuestion | null;
  /** The check line of the selected worker's own update, beneath it; never another flow's. */
  workerConfirming?: RemoteLoginConfirmQuestion | null;
  /** The password of the selected worker's own update, beneath it; never another flow's. */
  workerPasswording?: RemoteLoginPasswordQuestion | null;
  /** The selected worker's own address form, apart from an add's: open, field, port and refusal. */
  workerAskingAddress?: boolean;
  workerAddressDraft?: string;
  workerPortDraft?: string;
  workerAddressRefusal?: readonly string[] | null;
  onWorkerAddressDraft?: (address: string) => void;
  onWorkerPortDraft?: (port: string) => void;
  /** Ends the selected worker's update flow alone, never an add's questions. */
  onCancelWorkerUpdate?: () => void;
  /** What the address field holds, kept after a refusal. */
  addressDraft: string;
  /** What the port field beside it holds, empty for SSH's own. */
  portDraft: string;
  onPortDraft: (port: string) => void;
  /** The refusal's lines in that aside, or null while none is showing. */
  addressRefusal: readonly string[] | null;
  onAddressDraft: (address: string) => void;
  /** Add it's question for a Mac whose user runs another Firstmate's work, while open. */
  leaving: RemoteLoginLeaveQuestion | null;
  /** Macs this Mac is adding by their address. */
  adding: AddingMac[];
  /** Computers whose Firstmate is updating, by id. */
  updating: string[];
  updateCopy?: Record<string, RemoteLoginCopy>;
  busy: Busy;
  problem: string | null;
  onAddMac: () => void;
  onCancelAddress: () => void;
  onAddAt: (address: string) => void;
  /** The captain's yes on the check line. */
  onConfirm: (question: RemoteLoginConfirmQuestion) => void;
  /** Cancel on the check line: the address stays, and nothing is sent. */
  onCancelConfirm: () => void;
  /** The password the captain typed, once, to let Firstmate's own key in there. */
  onPassword: (question: RemoteLoginPasswordQuestion, password: string) => void;
  /** Cancel on the password: the address stays, and nothing is sent. */
  onCancelPassword: () => void;
  /** The captain's yes: add the Mac, leaving the other Firstmate should it not answer. */
  onLeaveAndAdd: (address: string) => void;
  onCancelLeave: () => void;
  onMake: (what: DevicePanelMake) => void;
  onStop: () => void;
  onDone: () => void;
  onAskRemove: (deviceId: string | null) => void;
  /** Update on a computer on another version of Firstmate. */
  onUpdate: (device: DeviceView) => void;
  onRemove: (deviceId: string, when?: DeviceRemoveWhen) => void;
  onKeep: (deviceId: string) => void;
  /** Carry its tasks on's open question; absent where it cannot be asked. */
  carrying?: CarryAsk | null;
  /** Opens Carry its tasks on's question, or closes it with null. */
  onAskCarry?: (ask: CarryAsk | null) => void;
  /** The captain's yes: the tasks of `from` continue on `to`. */
  onCarry?: (from: string, to: string) => void;
  /** Try again: this Mac's own SSH connection to a computer it stopped trying. */
  onTryAgain: (deviceId: string) => void;
  /**
   * Fix it: a Mac whose window is connected checks its work and sets it up
   * again (docs/devices.md, "A Mac that has not finished setting up");
   * absent where it cannot be asked.
   */
  onFixWork?: (deviceId: string) => void;
  /**
   * Update app: the app open on a computer, behind this computer's version,
   * gets it and starts again on it (docs/devices.md, "Updating the app open
   * there"); absent where it cannot be asked.
   */
  onUpdateApp?: (deviceId: string) => void;
  /**
   * Update later: lets a computer's update go while its crew's work is
   * being saved (docs/devices.md, "Saving work before an update"); absent
   * where it cannot be asked.
   */
  onUpdateLater?: (deviceId: string) => void;
  /** Opens a computer's address question, or closes it with null. */
  onAskChangeAddress: (deviceId: string | null) => void;
  onChangeAddress: (deviceId: string, address: string) => void;
  /** Copy a link or a command from the ways section: makes one, copies it, opens the panel. */
  onCopyWay: (what: "link" | "command") => void;
};
