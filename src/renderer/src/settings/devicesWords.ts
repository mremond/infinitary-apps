import { formatDate, formatTime } from "@shared/i18n/format";
import * as m from "@shared/i18n/messages.generated";
import { workSetupWords } from "@shared/workSetupWords";
import type { DeviceMake } from "../../../shared/deviceArrival";
import { aDevice, chipWords } from "../../../shared/deviceNames";
import {
  automaticStartupOf,
  automaticStartupWords,
  awayWord,
  type DeviceView,
  deviceConnecting,
  deviceLabel,
  deviceRunsWork,
  LINK_SAY,
  namesInWords,
  reachFrom,
  sharedVersion,
  userDisplayName,
} from "../../../shared/devices";
import { PLATFORM_ATTRIBUTE } from "../../../shared/platform";
import { catalogEntry } from "../../../shared/providers";
import { type RemoteLoginCopy, remoteLoginWords } from "../../../shared/remoteLogin";
import { type DeviceSignIns, signInPlace } from "../../../shared/signIns";
import { runsForAnotherFirstmate, sshConnectionWords } from "../../../shared/sshConnection";
import { sinceWhen } from "../devices/viewWords";

/**
 * The words of Settings -> Devices (`DevicesTab.tsx`; design skill
 * `components/devices/DevicesTab`): what each panel, row and way says, and
 * the lines a device's row reads from what the home knows of it.
 */

/** How other devices find this computer. */
export const WAYS_WORDS = {
  get label() {
    return m.settingsDevicesWaysLabel();
  },
  get local() {
    return m.settingsDevicesWaysLocal();
  },
  get localLine() {
    return m.settingsDevicesWaysLocalLine();
  },
  get localOff() {
    return m.settingsDevicesWaysLocalOff();
  },
  get private() {
    return m.settingsDevicesWaysPrivate();
  },
  get privateOffTitle() {
    return m.settingsDevicesWaysPrivateOffTitle();
  },
  get privateLine() {
    return m.settingsDevicesWaysPrivateLine();
  },
  get privateOff() {
    return m.settingsDevicesWaysPrivateOff();
  },
  get internet() {
    return m.settingsDevicesWaysInternet();
  },
  get internetLine() {
    return m.settingsDevicesWaysInternetLine();
  },
  get foot() {
    return m.settingsDevicesWaysFoot();
  },
  get copyLink() {
    return m.settingsDevicesWaysCopyLink();
  },
  get copyCommand() {
    return m.settingsDevicesWaysCopyCommand();
  },
  get ready() {
    return m.settingsDevicesWaysReady();
  },
  get off() {
    return m.settingsDevicesWaysOff();
  },
  get reachedLocal() {
    return m.settingsDevicesWaysReachedLocal();
  },
  get reachedPrivate() {
    return m.settingsDevicesWaysReachedPrivate();
  },
  get noNetwork() {
    return m.settingsDevicesWaysNoNetwork();
  },
} as const;

export function wayCount(count: number): string {
  return m.settingsDevicesWayCount({ count });
}

/** The phone panel uses the same Mac link; its presentation stays local to Settings. */
export type DevicePanelMake = DeviceMake | "phone";

/** What each panel says, by what it holds. */
export const PANEL_WORDS: Record<
  DevicePanelMake,
  { label: string; say: [string, ...string[]]; copy: string; thing: "link" | "command" }
> = {
  link: {
    get label() {
      return m.settingsDevicesPanelLinkLabel();
    },
    say: [...LINK_SAY.computer],
    get copy() {
      return m.settingsDevicesPanelCopyLink();
    },
    thing: "link",
  },
  phone: {
    get label() {
      return m.settingsDevicesPanelPhoneLabel();
    },
    say: [...LINK_SAY.phone],
    get copy() {
      return m.settingsDevicesPanelCopyLink();
    },
    thing: "link",
  },
  command: {
    get label() {
      return m.settingsDevicesPanelCommandLabel();
    },
    get say(): [string, ...string[]] {
      return [m.settingsDevicesPanelCommandRun(), m.settingsDevicesPanelCommandNetwork()];
    },
    get copy() {
      return m.settingsDevicesPanelCopyCommand();
    },
    thing: "command",
  },
  "user-command": {
    get label() {
      return m.settingsDevicesPanelUserCommandLabel();
    },
    get say(): [string, ...string[]] {
      return [
        onWindows()
          ? m.settingsDevicesPanelUserCommandLogInWindows()
          : m.settingsDevicesPanelUserCommandLogIn(),
        m.settingsDevicesPanelUserCommandSwitchBack(),
      ];
    },
    get copy() {
      return m.settingsDevicesPanelCopyCommand();
    },
    thing: "command",
  },
};

/**
 * Whether this window is on Windows, as its preload marked the page
 * (`thisDesktop`, which the end-to-end tests that read these words cannot load).
 */
function onWindows(): boolean {
  return globalThis.document?.documentElement?.getAttribute(PLATFORM_ATTRIBUTE) === "win32";
}

/** Whether a device answers now, or since when it has not: the status on its head. */
export const SEEN_WORDS = {
  get now() {
    return m.settingsDevicesSeenNow();
  },
  /** The two words a computer not in reach reads as have one home, `awayWord`. */
  get outOfReach() {
    return awayWord(false);
  },
  /** The state on a row's right, and the mono line, of a computer whose connection is being made. */
  get connecting() {
    return awayWord(true);
  },
  /** Followed by when it was last in reach: "out of reach since 14:02". */
  get since() {
    return m.settingsDevicesSeenSince();
  },
  get restarted() {
    return m.settingsDevicesSeenRestarted();
  },
};

/** The fixed words of a device's row. */
export const DEVICE_ROW_WORDS = {
  /** What a Mac's summary leads with while Firstmate is open on it, controlling this one. */
  get controllingNow() {
    return m.settingsDevicesControllingNow();
  },
  /** A computer's summary while no project runs on it. */
  get runsNoProject() {
    return m.settingsDevicesRunsNoProject();
  },
  /** The mono state on the right of a computer that takes no new work. */
  get noNewWork() {
    return m.settingsDevicesNoNewWork();
  },
} as const;

/** The words of Remove's question (design skill `components/devices/DevicesTab`, "Remove"). */
export function removeLines(device: DeviceView): [string, ...string[]] {
  const label = deviceLabel(device);
  if (!deviceRunsWork(device.kind))
    return [m.settingsDevicesRemoveCutOff({ device: label }), m.settingsDevicesRemoveNewLink()];
  const runs = device.runs ?? [];
  const projects = runs.length > 0 ? namesInWords(runs) : null;
  // Its Firstmate runs work for another one now, so its work never comes here.
  if (runsForAnotherFirstmate(device.ssh))
    return [
      m.settingsDevicesRemoveOtherFirstmate({ device: label }),
      projects
        ? m.settingsDevicesRemoveStaysThereOn({ projects })
        : m.settingsDevicesRemoveStaysThere(),
    ];
  // Connected on another version that takes no new work, its work cannot
  // come here until it is updated.
  if (!device.inReach && device.otherVersion)
    return [
      m.settingsDevicesRemoveNoNewWork({ device: label }),
      projects
        ? m.settingsDevicesRemoveUpdateItOn({ projects, device: label })
        : m.settingsDevicesRemoveUpdateIt({ device: label }),
    ];
  if (!device.inReach)
    return [
      m.settingsDevicesRemoveAway({
        device: label,
        state: awayWord(deviceConnecting(device), device.updating),
      }),
      projects
        ? m.settingsDevicesRemoveWaitOn({ projects, device: label })
        : m.settingsDevicesRemoveWait({ device: label }),
    ];
  const tasks = device.tasks ?? 0;
  return [
    m.settingsDevicesRemoveComesFirst({ device: label }),
    tasks === 0
      ? m.settingsDevicesRemoveCleansUp()
      : projects
        ? m.settingsDevicesRemoveTasksStopOn({ count: tasks, projects })
        : m.settingsDevicesRemoveTasksStop({ count: tasks }),
    ...(projects ? [m.settingsDevicesRemoveRunsAfter({ count: runs.length, projects })] : []),
  ];
}

/** "9:41": the minutes and seconds a link has left. */
export function linkTimeLeft(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "today 14:06", "yesterday 09:12" or "Oct 1 18:40": when a device joined. */
export function joinedWhen(at: number, now: number): string {
  const date = new Date(at);
  const time = formatTime(date, { hour: "2-digit", minute: "2-digit" });
  const day = new Date(now);
  if (date.toDateString() === day.toDateString()) return m.settingsDevicesJoinedToday({ time });
  day.setDate(day.getDate() - 1);
  if (date.toDateString() === day.toDateString()) return m.settingsDevicesJoinedYesterday({ time });
  return `${formatDate(date, { month: "short", day: "numeric" })} ${time}`;
}

/** Whether a device answers now, or since when it has not. */
function seenWords(device: DeviceView, now: number): string {
  // On another version it is connected, whether or not it takes work.
  if (device.inReach || device.otherVersion) return SEEN_WORDS.now;
  if (device.restartedSince) return SEEN_WORDS.restarted;
  return device.seenAt === undefined
    ? SEEN_WORDS.outOfReach
    : m.settingsDevicesSeenSinceWhen({ when: sinceWhen(device.seenAt, now) });
}

/**
 * What a device is, with a computer's chip as it said at pairing (INF-1456):
 * "a computer · Intel", so a person can see why Automatic leaves it out of a
 * project held to this computer's chip.
 */
function whatDevice(device: DeviceView): string {
  return device.chip && device.system !== "ios"
    ? `${aDevice(device)} · ${chipWords(device.chip, device.system)}`
    : aDevice(device);
}

/**
 * The mono line under a device's name (design skill
 * `components/devices/DevicesTab`, "The row"): what it is and where it is,
 * then the version every copy on it shares with this computer. Where it
 * stands is never on it: that is the status on the row's head
 * (`deviceStatus`), said once.
 */
export function deviceIdentity(device: DeviceView, now: number): string {
  const shared = sharedVersion(device);
  const version = shared ? ` · ${m.settingsDevicesVersionMark({ version: shared })}` : "";
  const startup = automaticStartupOf(device);
  if (startup === "unavailable" || startup === "unknown") {
    const where =
      device.remoteLogin ?? (device.user ? m.settingsDevicesRunningAs({ user: device.user }) : "");
    return `${whatDevice(device)}${where ? ` · ${where}` : ""} · ${automaticStartupWords[startup]}${version}`;
  }
  // Reached over this Mac's own SSH, it is named by its address.
  if (device.remoteLogin && device.ssh && device.onThisMac && device.user)
    return `${m.settingsDevicesAnotherUserHere()} · ${device.remoteLogin}${version}`;
  if (device.onThisMac && device.user) {
    const who = userDisplayName(device.user);
    return `${m.settingsDevicesAnotherUserHere()} · ${m.settingsDevicesRunsWhileLoggedIn({ user: who })}${version}`;
  }
  // A Mac added by its address is named by it (components/devices/DevicesTab).
  if (device.remoteLogin) return `${whatDevice(device)} · ${device.remoteLogin}${version}`;
  const reached =
    device.reachedOn === "local"
      ? WAYS_WORDS.reachedLocal
      : device.reachedOn === "private"
        ? WAYS_WORDS.reachedPrivate
        : null;
  const joined = m.settingsDevicesJoined({ when: joinedWhen(device.pairedAt, now) });
  return `${whatDevice(device)} · ${joined}${reached ? ` · ${reached}` : ""}${version}`;
}

/** What a row's ⋯ menu offers, in its order: the rarely used actions, then Remove. */
export type RowAct = "address" | "home-move" | "standby-ready" | "standby-keep" | "remove";

/**
 * The one status on a device's head, in its most exact words (design skill
 * `components/devices/DevicesTab`, "The row"): a computer in reach says its
 * tasks or idle, one on another version that takes no new work says so, and
 * one out of reach says since when, or what its SSH connection does now. A
 * phone or a Mac that only controls says whether it answers.
 */
export function deviceStatus(
  device: DeviceView,
  now: number,
): { text: string; tone: "busy" | "idle" | "warn" } {
  if (!deviceRunsWork(device.kind))
    return device.inReach
      ? { text: SEEN_WORDS.now, tone: "idle" }
      : { text: seenWords(device, now), tone: "warn" };
  const state = deviceState(device);
  if (device.inReach || device.otherVersion || device.workSetup?.state === "starting") return state;
  const reach = reachFrom(device);
  if (reach === "connecting" || reach === "reconnecting" || deviceConnecting(device)) return state;
  // Its SSH connection, where it says more than out of reach: starts at next login, could not
  // start. A setup that starts no work at login never promises one (INF-1617).
  const startup = automaticStartupOf(device);
  if (
    device.ssh &&
    device.remoteLogin &&
    device.ssh.state !== "stopped" &&
    startup !== "unavailable" &&
    startup !== "unknown"
  )
    return { text: sshConnectionWords.detail(device.ssh, device), tone: state.tone };
  return { text: seenWords(device, now), tone: "warn" };
}

/** The names of what a computer is signed in to: its subscriptions, then where projects live. */
function signedInNames(signIns: DeviceSignIns | undefined): string[] | null {
  if (!signIns?.signIns) return null;
  const names = signIns.signIns.accounts.map(
    (account) => catalogEntry(account.providerId)?.name ?? account.providerId,
  );
  for (const forge of signIns.signIns.forges?.signIns ?? []) names.push(forge.name);
  return [...new Set(names)];
}

/**
 * What a computer that runs work runs and is signed in to, or where its
 * removal stands: "Runs website and api · Signed in to Codex and GitHub".
 * A Mac that controls this Firstmate leads with "Controlling your Firstmate
 * now" while Firstmate is open on it; one that only controls says nothing
 * else (design skill `components/devices/DevicesTab`).
 */
export function deviceSummary(device: DeviceView, signIns: DeviceSignIns | undefined): string {
  const controlling = device.controlling ? [DEVICE_ROW_WORDS.controllingNow] : [];
  if (!deviceRunsWork(device.kind)) return controlling.join("");
  const runs = device.runs ?? [];
  if (device.removal === "bringing-work")
    return runs.length > 0
      ? m.settingsDevicesBringingWorkOf({ projects: namesInWords(runs) })
      : m.settingsDevicesBringingWork();
  if (device.removal === "cleaning-up")
    return m.settingsDevicesRemovingSetUp({
      where: signInPlace({ ...device, onThisMac: device.onThisMac ?? false }).where,
    });
  const parts = [
    ...controlling,
    runs.length > 0
      ? m.settingsDevicesRuns({ projects: namesInWords(runs) })
      : DEVICE_ROW_WORDS.runsNoProject,
  ];
  const names = signedInNames(signIns);
  if (names)
    parts.push(
      names.length > 0
        ? m.settingsDevicesSignedInTo({ names: namesInWords(names) })
        : m.settingsDevicesNoSignIns(),
    );
  return parts.join(" · ");
}

/**
 * The mono state on a computer's right: its tasks, idle, no new work,
 * connecting, reconnecting, or out of reach. Show an active SSH retry as
 * an attempt, not a stopped connection.
 */
export function deviceState(device: DeviceView): { text: string; tone: "busy" | "idle" | "warn" } {
  if (device.otherVersion?.takesWork === false)
    return { text: DEVICE_ROW_WORDS.noNewWork, tone: "warn" };
  if (!device.inReach) {
    if (device.workSetup?.state === "starting")
      return { text: m.settingsDevicesSettingUp(), tone: "idle" };
    if (reachFrom(device) === "reconnecting")
      return {
        text:
          device.seenAt === undefined
            ? m.settingsDevicesMapConnectingSsh()
            : m.settingsDevicesMapReconnectingSsh(),
        tone: "idle",
      };
    const connecting = deviceConnecting(device);
    return { text: awayWord(connecting), tone: connecting ? "idle" : "warn" };
  }
  const tasks = device.tasks ?? 0;
  if (tasks > 0) return { text: m.settingsDevicesTasks({ count: tasks }), tone: "busy" };
  return { text: m.settingsDevicesIdle(), tone: "idle" };
}

/**
 * The line under an out-of-reach computer's summary once this Mac's address
 * changed since it was last in reach, saying how it comes back; null
 * otherwise (design skill `components/devices/DevicesTab`, "Bringing a
 * computer back").
 */
export function strandedLine(device: DeviceView): string | null {
  // Connected on another version, it is not out of reach.
  if (
    !deviceRunsWork(device.kind) ||
    device.inReach ||
    device.otherVersion ||
    !device.addressChanged
  )
    return null;
  // Reached over this Mac's own SSH, it follows this Mac wherever it listens.
  if (device.remoteLogin) return null;
  if (device.onThisMac && device.user)
    return m.settingsDevicesStrandedAsUser({ user: userDisplayName(device.user) });
  return m.settingsDevicesStrandedThere();
}

/**
 * The way back for an out-of-reach computer added by a command, once this
 * Mac's address changed: a new command. One added by its address comes back
 * by itself over this Mac's own SSH, or by Try again.
 */
export function wayBack(device: DeviceView): { label: string; does: DeviceMake } | null {
  if (!deviceRunsWork(device.kind) || device.inReach || device.otherVersion) return null;
  if (device.remoteLogin || !device.addressChanged) return null;
  return {
    label: m.settingsDevicesMakeCommand(),
    does: device.onThisMac ? "user-command" : "command",
  };
}

/**
 * Why a computer a command added on another Mac has not reached this Mac
 * since it joined, under its summary, while macOS there holds its dial on
 * the local network; null otherwise (design skill
 * `components/devices/DevicesTab`, "Held on the local network"). Its way
 * back is Add it by its address.
 */
export function heldLine(device: DeviceView): string | null {
  if (!deviceRunsWork(device.kind) || device.inReach || device.otherVersion) return null;
  if (!device.heldOnLocalNetwork) return null;
  return m.settingsDevicesHeldLine({ device: deviceLabel(device) });
}

/**
 * Why a Mac's work is not in reach while its window is connected, under its
 * summary (docs/devices.md, "A Mac that has not finished setting up"; design
 * skill `components/devices/DevicesTab`, "A Mac that has not finished
 * setting up"): what its window found, or this Mac's own reading of a run
 * that has not reached it. Held on the local network keeps its own line
 * (`heldLine`); null otherwise.
 */
export function workSetupLine(device: DeviceView): string | null {
  const setup = device.workSetup;
  if (!setup || device.inReach) return null;
  return device.heldOnLocalNetwork && setup.reason === "local-network"
    ? null
    : workSetupWords(deviceLabel(device), setup);
}

/** Whether a Mac's row offers Fix it: its window is connected and its work cannot be set up. */
export function offersFixWork(
  device: Pick<DeviceView, "workSetup" | "inReach" | "controlling">,
): boolean {
  return device.workSetup?.state === "blocked" && !device.inReach && device.controlling === true;
}

/**
 * Why this Mac stopped trying its SSH connection to a computer, and what to
 * do, under its summary in `--warn`; null while it connects or tries again
 * by itself.
 */
export function sshStoppedLine(device: DeviceView): string | null {
  if (device.ssh?.state !== "stopped" || !device.ssh.reason || !device.remoteLogin) return null;
  return sshConnectionWords
    .stopped(device.ssh.reason, { address: device.remoteLogin, device })
    .join(" ");
}

/**
 * A Mac this Mac is adding by its address: reaching it - or, on the call
 * that carries the password typed once, letting Firstmate's own key in -
 * then setting it up once it said its name, or, for a computer already on
 * the list (`deviceId`), telling it where this Mac is now; `copy` is how far
 * the copy of Firstmate has gone there since.
 */
export type AddingMac = {
  address: string;
  stage: "reaching" | "letting-in" | "setting-up" | "finding";
  name?: string;
  deviceId?: string;
  copy?: RemoteLoginCopy;
};

/**
 * Where a Mac being added by its address stands, as its row says it: how far
 * the copy has gone once it is sent - the bytes sent so far, never a share of
 * a total - and before that the stage. `name` is how the row names it.
 */
export function addingWords(mac: AddingMac, name: string): string {
  if (mac.copy?.download)
    return remoteLoginWords.downloading(name, mac.copy.download.received, mac.copy.download.total);
  if (mac.copy?.state === "sending") return remoteLoginWords.sendingRow(name, mac.copy.sent ?? 0);
  if (mac.copy?.state === "starting") return remoteLoginWords.startingRow(name);
  switch (mac.stage) {
    case "setting-up":
      return remoteLoginWords.settingUpRow(name);
    case "finding":
      return remoteLoginWords.findingRow({ name });
    case "letting-in":
      return remoteLoginWords.lettingInRow(mac.address);
    default:
      return remoteLoginWords.reachingRow(mac.address);
  }
}
