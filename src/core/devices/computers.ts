import { randomUUID } from "node:crypto";
import type { ActionActor } from "@shared/actions";
import { APP_FOLLOW_ONLY, APP_UPDATE_LIVE, type AppFollowReport } from "@shared/appFollow";
import { type BuildIdentity, compareBuilds, sourceCommitOf } from "@shared/buildIdentity";
import { takesDownload, takesUpdate } from "@shared/contractFeatures";
import { HERE, PLACE_SAID } from "@shared/deviceNames";
import {
  awayWord,
  buildsSourceThere,
  type ComputerReach,
  type DeviceAppVersion,
  type DeviceCarryOn,
  type DeviceFold,
  type DeviceOtherVersion,
  type DeviceRemovalStage,
  type DeviceRemoveWhen,
  type DeviceSsh,
  type DeviceView,
  deviceControls,
  deviceFoldedLine,
  deviceFoldText,
  deviceLabel,
  deviceRunsWork,
  installedThere,
  installItThereWords,
  isPhone,
} from "@shared/devices";
import type { FmEvent } from "@shared/events";
import * as m from "@shared/i18n/messages.generated";
import { englishOf, type Said, said } from "@shared/i18n/said";
import { PROTOCOL_VERSION, parseInvokeRequest } from "@shared/ipc";
import {
  type PackageUpdateAddressQuestion,
  parseRemoteLoginAddress,
  type RemoteLoginConfirmQuestion,
  type RemoteLoginPasswordQuestion,
  type RemoteLoginRefusal,
  type RemoteLoginUpdateOptions,
  remoteLoginWords,
} from "@shared/remoteLogin";
import { RUNS_ON_THIS_MAC } from "@shared/repos";
import { compareSemver } from "@shared/semver";
import { devicePlace } from "@shared/signIns";
import {
  downloadOrders,
  SOURCE_BUILDS_CHANGE,
  type SourceBuildStep,
  sourceOrders,
  type UpdateDownload,
  updateOrders,
  WORK_DOWNLOAD_ORDER,
  WORK_PROGRESS_ORDER,
  WORK_SOURCE_ORDER,
  WORK_UPDATE_ORDER,
  type WorkSourceAnswer,
  type WorkUpdateAnswer,
} from "@shared/work";
import {
  type DeviceWorkSetup,
  WORK_REACH_GRACE_MS,
  WORK_SETUP_LIVE,
  WORK_SETUP_ONLY,
  type WorkSetupReport,
} from "@shared/workSetup";
import { UPDATE_RETURN_MS } from "@shared/workUpdate";
import {
  DeviceOutOfReachError,
  type ViewDeviceContact,
  type WorkDeviceContact,
  type WorkDeviceVersion,
} from "../connection/connection";
import type { WorkDevices } from "../placed/workDevices";
import { TaskService } from "../tasks/taskService";
import type { RepoRegistry } from "../workspace/repoRegistry";
import { copyCount } from "./appArchive";
import type { DevicePairing } from "./pairing";
import { RemoteLoginRefusedError } from "./remoteLogin";

/**
 * Your devices as Settings -> Devices lists them, and Remove for a computer
 * that runs work (docs/devices.md, "Your devices" and "Remove"; design
 * skill `components/devices/DevicesTab`).
 *
 * The list is pairing's, with what the home reads of each device right
 * now: whether it is in reach and when it was last; for a Mac that
 * controls this Firstmate, whether it controls it now; and for a computer
 * that runs work, whether this Mac's address changed since or macOS there
 * holds its dial on the local network, the projects
 * whose Runs on names it, how many tasks run there, and where its removal
 * stands. It is pushed whole (`inf:devices`) whenever any of that changes.
 *
 * Removing a computer that runs work never loses work that never merged:
 * in reach, its projects run on this Mac from then on, each task started
 * there stops, every task's unmerged work comes here as its kept work, and
 * only then is it taken off the list, which has it remove what Firstmate
 * set up there. Out of reach, the captain chooses: remove it once it is
 * back, the same way, or now, which leaves its unmerged work there.
 *
 * A computer connected on another version of Firstmate than this Mac's says
 * so on the list, whether or not it still takes work, and Update brings it
 * to this Mac's version (docs/devices.md, "Another version" and
 * "Updating"): over Remote Login for one added by its address, otherwise
 * over the connection, where the computer gets this Mac's Firstmate with
 * its own key, keeps it, and starts again. One too old to take the update
 * order is updated by a new command run there.
 */

/**
 * Whether an update over the connection has the computer download this
 * Mac's published version itself first (docs/devices.md, "Downloading over
 * the connection"): a Mac elsewhere, which keeps its own copy, on a
 * contract that takes the download order.
 */
function downloadsThere(device: DeviceView, contract: string): boolean {
  return device.onThisMac !== true && device.system === "macos" && takesDownload(contract);
}

/** One step of an update over the connection, as the feed says it. */
export type DeviceUpdateEvent = Extract<FmEvent, { type: "device_update" }>;

export type ComputersOptions = {
  pairing: DevicePairing;
  work: WorkDevices;
  tasks: TaskService;
  repos: RepoRegistry;
  /** Each task started on that computer stops (`CrewSessions.stopTasksOn`), resolving once each is closed. */
  stopTasks: (deviceId: string) => Promise<void>;
  /**
   * A task whose computer moved repoints, with its unstarted descendants
   * (`TaskPlacement.runsOnChanged`), as one whose computer was forgotten does.
   */
  runsOnMoved?: (taskId: string) => void;
  /**
   * The captain's move of one started task off a computer out of reach to
   * `to`, leaving behind what only that computer holds
   * (`TaskMoves.requestComputerMove` with `leaveBehind`); a refusal is text.
   */
  carryTask?: (taskId: string, to: string) => Promise<{ ok: boolean; text: string }>;
  /** Every closed task's work there comes here (`PlacedSessions.bringHome`); rejects when some could not. */
  bringHome: (deviceId: string) => Promise<void>;
  /**
   * The computer's crew pauses for its update (`CrewUpdates.pauseForUpdate`;
   * docs/devices.md, "Saving work before an update"), resolving `saved`
   * once each running turn there stopped and telling `waiting` meanwhile
   * which tasks' turns it waits for; `withdrawn` once `signal` aborts first
   * (Update later). `resumeTasks` carries it on once the update is over,
   * whatever came of it.
   */
  pauseTasks?: (
    deviceId: string,
    options: { signal: AbortSignal; waiting: (tasks: string[]) => void },
  ) => Promise<"saved" | "withdrawn">;
  resumeTasks?: (deviceId: string) => void;
  /** The tasks on the computer whose turn its update stopped and which have not started again, by title. */
  resumingTasks?: (deviceId: string) => string[];
  /**
   * Removes what Firstmate set up on a computer added by its address, over
   * Remote Login (`RemoteLogin.removeThere`): true once nothing is left there
   * for it to hear. Absent, a computer removed out of reach always hears it
   * the next time it dials.
   */
  removeThere?: (device: DeviceView) => Promise<boolean>;
  /**
   * This Mac's own versions - of Firstmate, when it is known, and of the
   * contract it speaks - which a computer's are measured against.
   */
  home?: { app?: string; contract: string; build?: BuildIdentity };
  /** Updates Firstmate on a computer added by its address, over Remote Login (`RemoteLogin.update`). */
  updateOverRemoteLogin?: (
    deviceId: string,
    options?: RemoteLoginUpdateOptions & { pause?: () => Promise<void> },
  ) => Promise<DeviceView | RemoteLoginPasswordQuestion | RemoteLoginConfirmQuestion>;
  /**
   * Whether this computer has a Firstmate for that computer's system: its own,
   * or the one published for it (docs/devices.md, "Infinitary for another system").
   */
  canSend?: (device: DeviceView) => boolean;
  /**
   * Gets and checks the Firstmate published for that computer's system before
   * it is asked to update, so its copy starts at once; answers why it could
   * not, or null.
   */
  prepare?: (device: DeviceView) => Promise<RemoteLoginRefusal | null>;
  /**
   * Where this computer's version is published for a Mac to download itself
   * (docs/devices.md, "Downloading over the connection"), with its SHA-256,
   * looked up without downloading it here; null for a development or
   * unpublished version, or a lookup that did not answer.
   */
  download?: (device: DeviceView) => Promise<UpdateDownload | null>;
  /** How often a download's count is asked over the connection, and a send's said; a second unless a test says. */
  countEveryMs?: number;
  /** One step of an update over the connection, for the feed. */
  emitUpdate?: (event: DeviceUpdateEvent) => void;
  /**
   * Where this Mac's own SSH connection to a computer stands
   * (`SshConnections.state`), for one it reaches that way; none while no
   * such connection is kept.
   */
  ssh?: (deviceId: string) => DeviceSsh | undefined;
  /** The one reach value (`reachFrom`), for Remove's words. Absent, out of reach. */
  reachOf?: (deviceId: string) => ComputerReach;
  /** How long an update waits for the computer to come back on this Mac's version. */
  updateWaitMs?: number;
  /** The list, whole, after any change. */
  emit: (devices: DeviceView[]) => void;
  /** A problem for the feed: words, or the app's own words as a saved fact (docs/i18n.md, "Saved facts"). */
  onProblem: (line: string | Said) => void;
  now: () => number;
  /** Runs `run` once after `ms`, answering how to cancel it; a timer by default. */
  schedule?: (ms: number, run: () => void) => () => void;
  /** When this Mac last started, in milliseconds since the epoch. */
  bootedAt: () => number;
};

type Removing = { stage: DeviceRemovalStage; runs: string[] };

/** Runs `run` once after `ms`, never holding the process open. */
function schedule(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  timer.unref?.();
  return () => clearTimeout(timer);
}

/** A count is said at most this often (docs/devices.md, "How far the copy has gone"). */
const COUNT_EVERY_MS = 1_000;

/** What the feed says of each step a build of this Mac's source failed at, there. */
const SOURCE_FAILED_WORDS: Record<SourceBuildStep, (device: string) => string> = {
  system: (device) => m.devicesSourceNotMac({ device }),
  tools: (device) => m.devicesSourceFailedTools({ device }),
  fetch: (device) => m.devicesSourceFailedFetch({ device }),
  install: (device) => m.devicesSourceFailedInstall({ device }),
  build: (device) => m.devicesSourceFailedBuild({ device }),
  keep: (device) => m.devicesSourceFailedKeep({ device }),
};
/** A commit as a copy that did not start is kept: a version is never this. */
const COMMIT = /^[a-f0-9]{40,64}$/;

/** Update later let a computer's update go while its crew's work was saved: nothing there was replaced. */
class UpdateLetGo extends Error {
  constructor() {
    // i18n-exempt: an internal signal the update route catches, never shown; its feed line is the catalog's.
    super("The update was let go before anything was replaced.");
    this.name = "UpdateLetGo";
  }
}

export class Computers {
  /** Removals under way, with the projects each computer ran when it began. */
  private readonly removing = new Map<string, Removing>();
  /** Computers out of reach whose tasks are being carried on, with where they go (`carryOn`). */
  private readonly carrying = new Map<string, string>();
  /** Computers being updated over the connection now. */
  private readonly updating = new Set<string>();
  /**
   * Computers whose crew's work is being saved before their update, each
   * with Update later's control and the tasks it waits for (`saveWork`).
   */
  private readonly saving = new Map<string, { controller: AbortController; tasks: string[] }>();
  /** When the connection the row calls connected began, cleared once it is not. */
  private readonly connectedSince = new Map<string, number>();
  /** What each Mac's window last found of its work half, and when (`heardWorkSetup`). */
  private readonly workSetups = new Map<string, { report: WorkSetupReport; at: number }>();
  /** What each app open on another computer last said of catching up with this computer's version (`heardAppFollow`). */
  private readonly appFollows = new Map<string, AppFollowReport>();
  /** Reads the list again once a run the window found has had its moment to reach this Mac. */
  private readonly graceTimers = new Map<string, () => void>();
  private said = "";

  constructor(private readonly options: ComputersOptions) {
    options.pairing.subscribe(() => this.changed());
    options.work.onWorkDevice((contact) => this.contact(contact));
    options.work.onViewDevice((contact) => this.viewContact(contact));
    // Connected on any version, it is seen; its version is on the list.
    options.work.onVersion((deviceId, version) => {
      if (version) this.heardVersion(deviceId, version);
      if (version) this.noteConnected(deviceId);
      else this.connectedSince.delete(deviceId);
      options.pairing.seen(deviceId, options.now());
      this.changed();
    });
    // Where the connection listens moved, so whether this Mac's address
    // changed since a computer last reached it may read differently now.
    options.work.onListening(() => this.changed());
    options.repos.onRunsOn(() => this.changed());
    options.tasks.onChange(() => {
      this.settleCarries();
      this.changed();
    });
  }

  /** Every device on the list, oldest first, with what the home reads of each right now. */
  list(): DeviceView[] {
    const { pairing, work, tasks, repos } = this.options;
    const devices = pairing.list();
    if (devices.length === 0) return devices;
    // Tasks and projects are read only when a computer runs work. Every task
    // write reads this list again, so it counts running tasks by where they
    // run and never composes their records (INF-2240).
    const working = devices.some((device) => deviceRunsWork(device.kind));
    const running = working ? tasks.activeCountsByDevice() : new Map<string, number>();
    // Reviews follow their builder and never move on their own: a carry
    // leaves them, and Remove now stops them.
    const reviews = working ? tasks.activeReviewCountsByDevice() : new Map<string, number>();
    const projects = working ? repos.list() : [];
    const booted = this.options.bootedAt();
    const listening = work.listening();
    // What each app open now said of its version, read once for the whole list.
    const apps = this.appVersions(devices);
    // Entries that run work, out of reach and holding work, which a later
    // entry with the same name and user may be the same computer joined
    // again (docs/devices.md, "Joined again").
    const away = devices.filter(
      (device) =>
        deviceRunsWork(device.kind) &&
        !work.inReach(device.id) &&
        !work.version(device.id) &&
        ((running.get(device.id) ?? 0) > 0 || projects.some((repo) => repo.runsOn === device.id)),
    );
    return devices.map((device) => {
      const app = apps.get(device.id);
      if (!deviceRunsWork(device.kind)) {
        // A Mac that controls this Firstmate is in reach while Firstmate is open on it.
        const controlling = work.controlling(device.id);
        const seenAt = pairing.lastSeen(device.id);
        return {
          ...device,
          inReach: controlling,
          ...(seenAt !== undefined ? { seenAt } : {}),
          controlling,
          ...(app ? { appVersion: app } : {}),
        };
      }
      const inReach = work.inReach(device.id);
      const version = work.version(device.id);
      const ssh = this.options.ssh?.(device.id);
      const otherVersion = version ? this.otherVersion(device, version) : undefined;
      const seenAt = pairing.lastSeen(device.id);
      const connectedAt = this.connectedAt(
        device.id,
        inReach || !!otherVersion || ssh?.state === "connected",
      );
      const removing = this.removing.get(device.id);
      const removal: DeviceRemovalStage | undefined =
        removing?.stage ?? (pairing.removingWhenBack(device.id) ? "when-back" : undefined);
      const stranded = !inReach && !version && pairing.addressChanged(device.id, listening);
      const carrying = this.carrying.get(device.id);
      const earlier = away
        .filter(
          (other) =>
            other.id !== device.id &&
            other.name === device.name &&
            device.user !== undefined &&
            other.user === device.user &&
            other.pairedAt < device.pairedAt &&
            !this.removing.has(other.id) &&
            !this.carrying.has(other.id),
        )
        .map((other) => other.id);
      const movable = (running.get(device.id) ?? 0) - (reviews.get(device.id) ?? 0);
      return {
        ...device,
        inReach,
        ...(otherVersion ? { otherVersion } : {}),
        // On this computer's version, its work's version is said as it is.
        ...(version?.app && !otherVersion ? { workVersion: version.app } : {}),
        ...(app ? { appVersion: app } : {}),
        ...(seenAt !== undefined ? { seenAt } : {}),
        ...(connectedAt !== undefined ? { connectedAt } : {}),
        ...(!inReach && !version && device.onThisMac && (seenAt ?? device.pairedAt) < booted
          ? { restartedSince: true }
          : {}),
        // Connected on another version, it found this Mac where it is now.
        ...(stranded ? { addressChanged: true } : {}),
        // A new address strands it first: that is the way back to say.
        ...(!inReach && !version && !stranded && pairing.heldOnLocalNetwork(device.id)
          ? { heldOnLocalNetwork: true }
          : {}),
        tasks: running.get(device.id) ?? 0,
        runs:
          removing?.runs ??
          projects.filter((repo) => repo.runsOn === device.id).map((repo) => repo.name),
        ...(removal ? { removal } : {}),
        ...(earlier.length > 0 ? { earlier } : {}),
        ...(!inReach && !version && movable > 0 && !removal && !carrying
          ? { carriesOn: movable }
          : {}),
        ...(carrying ? { carrying } : {}),
        ...this.updateWorkOf(device.id),
        ...(ssh ? { ssh } : {}),
        // A Mac that also controls this Firstmate says so while Firstmate is open there.
        ...(deviceControls(device.kind) ? { controlling: work.controlling(device.id) } : {}),
        ...this.workSetupOf(
          device.id,
          deviceControls(device.kind) && !inReach && !version,
          !stranded,
        ),
      };
    });
  }

  /**
   * Remove (docs/devices.md, "Remove"): a Mac that controls this Firstmate
   * is cut off at once. A computer that runs work in reach has its work
   * brought here first; out of reach, `when` is the captain's choice, and
   * with none this refuses, so the question is asked.
   */
  async remove(deviceId: string, when?: DeviceRemoveWhen): Promise<DeviceView> {
    const device = this.options.pairing.list().find((entry) => entry.id === deviceId);
    if (!device) throw new Error("No device with that id is on the list.");
    if (!deviceRunsWork(device.kind)) return this.options.pairing.remove(deviceId);
    const { label } = devicePlace([device], deviceId);
    if (this.removing.has(deviceId)) throw new Error(`${label} is being removed already.`);
    if (this.options.work.inReach(deviceId)) return this.removeWithWork(device);
    if (when === "when-back") {
      this.options.pairing.removeWhenBack(deviceId, true);
      return this.viewOf(deviceId) ?? device;
    }
    if (when === "now") return this.removeNow(device);
    const away = awayWord(this.options.reachOf?.(deviceId) === "connecting");
    throw new Error(
      `${label} is ${away}. Choose to remove it when it is back, with its work, or now.`,
    );
  }

  /**
   * Match (docs/devices.md, "Updating" and "Matching the home's build"):
   * brings Firstmate on a computer that runs work to this Mac's build. A
   * home run from source has that computer build its commit over the
   * connection, whichever way it was added, unless the order names an
   * address. Otherwise it goes over Remote Login for one added by its
   * address or one explicitly supplied, else over the connection first, with
   * an opt-in package fallback if no copy changed. Answers it on the list
   * once it is back, or rejects with the refusal's two lines, which the feed
   * said too.
   */
  async update(
    deviceId: string,
    options?: RemoteLoginUpdateOptions,
  ): Promise<
    | DeviceView
    | RemoteLoginPasswordQuestion
    | RemoteLoginConfirmQuestion
    | PackageUpdateAddressQuestion
  > {
    const device = this.options.pairing.list().find((entry) => entry.id === deviceId);
    if (!device) throw new Error("No device with that id is on the list.");
    if (!deviceRunsWork(device.kind))
      throw new Error(`${device.name} controls your first mate, and runs no work to update.`);
    if (this.removing.has(deviceId)) throw new Error(`${deviceLabel(device)} is being removed.`);
    // No home sends a Windows PC a build: a newer Infinitary is installed there.
    if (installedThere(device)) throw new Error(installItThereWords(deviceLabel(device)));
    if (this.failedHere(deviceId))
      throw new Error(
        sourceCommitOf(this.options.home?.build)
          ? m.devicesSourceFailedHere({ device: deviceLabel(device) })
          : remoteLoginWords.failedHere(device, this.options.home?.app ?? "").join(" "),
      );
    if (this.updating.has(deviceId))
      throw new Error(`${deviceLabel(device)} is being updated already.`);
    // This Mac's commit, built there from its source over the connection
    // (docs/devices.md, "Matching the home's build"), whichever way the
    // computer was added: a home run from source has no release to send over
    // Remote Login. Only an address the order names takes that route.
    if (!options?.address) {
      const version = this.options.work.version(deviceId);
      const other = version ? this.otherVersion(device, version) : undefined;
      if (other?.source) return this.matchSource(device, other.source.commit);
    }
    if (device.remoteLogin || options?.address) {
      const update = this.options.updateOverRemoteLogin;
      if (!update) throw new Error(`${deviceLabel(device)} cannot be reached over Remote Login.`);
      // Its crew pauses only once the update goes ahead there, past every
      // refusal and the password question.
      let paused = false;
      const pause = async () => {
        paused = true;
        if (!(await this.saveWork(device))) throw new UpdateLetGo();
      };
      const oneTime = !device.remoteLogin && options?.address !== undefined;
      const back = oneTime ? this.backOnThisVersion(device, true) : null;
      this.updating.add(deviceId);
      try {
        let updated: Awaited<ReturnType<typeof update>>;
        try {
          updated = await update(deviceId, { ...options, pause });
        } catch (caught) {
          if (!(caught instanceof UpdateLetGo)) throw caught;
          this.sayLetGo(device);
          return this.viewOf(deviceId) ?? device;
        }
        if ("asks" in updated) return updated;
        if (back) {
          const running = await back.came();
          this.options.emitUpdate?.({
            type: "device_update",
            deviceId,
            name: deviceLabel(device),
            stage: "done",
            text: running
              ? remoteLoginWords.updated(device, "running")
              : this.updateNotConfirmed(device),
            tone: running ? "info" : "warn",
          });
        }
        return this.viewOf(deviceId) ?? updated;
      } finally {
        this.updating.delete(deviceId);
        back?.cancel();
        if (paused) this.options.resumeTasks?.(deviceId);
      }
    }
    // A Linux worker of its own may be a package that restarts unchanged.
    const packageWorker = device.system === "linux" && !(device.onThisMac && device.user);
    const fallback = options?.packageFallback === true && packageWorker;
    const answer = await this.updateOverConnection(device, { fallback, packageWorker });
    if (answer !== "package-address") return answer;
    const peer = this.options.pairing.packageUpdatePeer(deviceId);
    const address =
      device.packageUpdateAt ??
      (peer && device.user
        ? parseRemoteLoginAddress(`${device.user}@${peer.includes(":") ? `[${peer}]` : peer}`)
        : null);
    if (!address) return { asks: "package-address" };
    try {
      return await this.update(deviceId, { address });
    } catch (error) {
      // Any refusal of the address tried on its own - unreachable, or another
      // account, worker or package there - opens it prefilled with why, to correct.
      // An install that may already have run keeps its warning, with nothing to try again.
      if (error instanceof RemoteLoginRefusedError && !error.uncertain)
        return { asks: "package-address", address, lines: [...error.lines] };
      throw error;
    }
  }

  /**
   * Its crew's work is saved before anything there stops (docs/devices.md,
   * "Saving work before an update"): its row says Saving work, naming the
   * tasks it waits for, and offers Update later. False once Update later let
   * the update go first. A save that could not finish - the computer went
   * out of reach and did not come back - is `lost`'s refusal.
   */
  private async saveWork(device: DeviceView, lost?: () => never): Promise<boolean> {
    const pause = this.options.pauseTasks;
    if (!pause) return true;
    const own = { controller: new AbortController(), tasks: [] as string[] };
    this.saving.set(device.id, own);
    this.changed();
    try {
      const outcome = await pause(device.id, {
        signal: own.controller.signal,
        waiting: (tasks) => {
          own.tasks = tasks;
          this.changed();
        },
      });
      return outcome === "saved";
    } catch (caught) {
      console.warn(`[devices] could not save the work on ${deviceLabel(device)}:`, caught);
      if (lost) return lost();
      throw caught;
    } finally {
      if (this.saving.get(device.id) === own) this.saving.delete(device.id);
      this.changed();
    }
  }

  /**
   * Update later (docs/devices.md, "Saving work before an update"): lets a
   * computer's update go while its crew's work is being saved, so nothing
   * there is replaced and its work carries on. False when none is being saved.
   */
  updateLater(deviceId: string): boolean {
    const saving = this.saving.get(deviceId);
    if (!saving) return false;
    saving.controller.abort();
    this.saving.delete(deviceId);
    this.changed();
    return true;
  }

  /** The update was let go before anything there stopped: the feed says so, once. */
  private sayLetGo(device: DeviceView): void {
    this.options.emitUpdate?.({
      type: "device_update",
      deviceId: device.id,
      name: deviceLabel(device),
      stage: "done",
      text: m.devicesUpdateLetGo({ device: deviceLabel(device) }),
      tone: "info",
    });
  }

  /**
   * What the crew's work is doing around the computer's update, for its row:
   * saving before it, naming the tasks it waits for, or resuming after it
   * until each turn it stopped has started again.
   */
  private updateWorkOf(deviceId: string): Pick<DeviceView, "updateWork"> {
    const saving = this.saving.get(deviceId);
    if (saving) return { updateWork: { state: "saving", tasks: saving.tasks } };
    if (this.updating.has(deviceId)) return {};
    const tasks = this.options.resumingTasks?.(deviceId) ?? [];
    return tasks.length > 0 ? { updateWork: { state: "resuming", tasks } } : {};
  }

  /**
   * Whether this Mac's version is the one that did not start on that
   * computer, which went back to the copy it kept (docs/helper.md, "A copy
   * that does not start"): it is not sent there again.
   */
  failedHere(deviceId: string): boolean {
    const failed = this.options.pairing.failedUpdate(deviceId);
    return failed !== undefined && failed === this.homeTarget();
  }

  /**
   * The captain's own Match (docs/devices.md, "Matching the home's build"):
   * a computer it builds this Mac's source on may run source from now on,
   * and is matched by itself after (`DeviceUpdateNudge`).
   */
  allowSource(deviceId: string): void {
    const device = this.options.pairing.list().find((entry) => entry.id === deviceId);
    const version = this.options.work.version(deviceId);
    if (!device || !buildsSourceThere(device.system)) return;
    if (!version || !this.otherVersion(device, version)?.source) return;
    this.options.pairing.noteSourceAllowed(deviceId);
  }

  /** Whether the captain let this computer run this Mac's source. */
  sourceAllowed(deviceId: string): boolean {
    return this.options.pairing.sourceAllowed(deviceId);
  }

  /**
   * What a computer is brought to, which a copy that did not start there is
   * kept as: this Mac's commit when it runs source with one, else its version.
   */
  private homeTarget(): string | undefined {
    return sourceCommitOf(this.options.home?.build) ?? this.options.home?.app;
  }

  /** Something the list reads changed outside it, such as an SSH connection's state: pushed when it shows. */
  refresh(): void {
    this.changed();
  }

  /** `inf:devices:fold` as asked: only a Mac's own window, by its connection's device id, folds its entry. */
  async foldAsked(rawArgs: unknown, actor: ActionActor | { kind: "device" } | undefined) {
    const [fold] = parseInvokeRequest("inf:devices:fold", rawArgs);
    return this.fold(actor?.kind === "captain" ? actor.view : undefined, fold);
  }

  /**
   * One computer, one row (docs/devices.md, "One computer, one entry"): the
   * Mac `from`, asking as its window, folds its entry into `into`, the one
   * its work keeps, proved by that entry's signature. Both must be Macs that
   * run work as the same user, the entry that goes must not run work or
   * keep a working copy, and the one kept takes every project and live
   * task whose Runs on named the other; the other goes, and the feed says so once.
   */
  fold(from: string | undefined, fold: DeviceFold): DeviceView {
    const { pairing, repos, tasks } = this.options;
    const devices = pairing.list();
    const gone = devices.find((device) => device.id === from);
    const kept = devices.find((device) => device.id === fold.into);
    if (!from || !gone || !kept || gone.id === kept.id)
      throw new Error("Only a Mac's own window folds its entry into another of its own.");
    if (gone.kind !== "mac" || kept.kind !== "mac" || gone.user !== kept.user)
      throw new Error("Only two entries for one Mac and one user fold into one.");
    const text = deviceFoldText(pairing.identity().pin, gone.id, kept.id);
    if (!pairing.provenBy(kept.id, fold.cert, text, fold.signature))
      throw new Error("That fold is not signed with the key of the entry it keeps.");
    if (this.removing.has(gone.id) || this.removing.has(kept.id))
      throw new Error(`${deviceLabel(kept)} is being removed.`);
    if (this.options.work.inReach(gone.id))
      throw new Error(`${deviceLabel(gone)} runs work as the entry that would go.`);
    const placed = tasks
      .list()
      .some((record) => record.deviceId === gone.id && record.workspaceState === "present");
    if (placed) throw new Error(`${deviceLabel(gone)} keeps a working copy for that entry.`);
    for (const repo of repos.list()) if (repo.runsOn === gone.id) repos.setRunsOn(repo.id, kept.id);
    for (const taskId of tasks.placement.moveRunsOn(gone.id, kept.id, deviceLabel(kept)))
      this.options.runsOnMoved?.(taskId);
    pairing.remove(gone.id);
    this.options.emitUpdate?.({
      type: "device_update",
      deviceId: kept.id,
      name: deviceLabel(kept),
      stage: "done",
      text: deviceFoldedLine(kept),
      tone: "info",
    });
    this.changed();
    return this.viewOf(kept.id) ?? kept;
  }

  /**
   * Carry its tasks on (docs/devices.md, "Joined again"): `from`, a computer
   * out of reach, hands its work to `to` - another computer in reach, or
   * this Mac. Each project and unstarted task whose Runs on names it names
   * `to`; each task started there moves without what only `from` holds, as
   * the captain's own move does; and once every one has moved, `from` is
   * removed now (`settleCarries`). A task that cannot move stays there, and
   * so does `from`, with a line saying why.
   */
  async carryOn(from: string, to: string): Promise<DeviceCarryOn> {
    const { pairing, work, tasks, repos } = this.options;
    const devices = pairing.list();
    const source = devices.find((device) => device.id === from);
    if (!source || !deviceRunsWork(source.kind))
      throw new Error("No computer that runs work has that id.");
    const label = deviceLabel(source);
    if (work.inReach(from) || work.version(from))
      throw new Error(`${label} is in reach: move its tasks one by one, or remove it.`);
    if (this.removing.has(from)) throw new Error(`${label} is being removed already.`);
    if (this.carrying.has(from)) throw new Error(`${label}'s tasks are moving already.`);
    const carry = this.options.carryTask;
    if (!carry) throw new Error(`${HERE.This} cannot move tasks between computers.`);
    const target = devices.find((device) => device.id === to);
    if (to === from || (to !== RUNS_ON_THIS_MAC && (!target || !deviceRunsWork(target.kind))))
      throw new Error("Choose another computer that runs work, or this one.");
    if (target && !work.inReach(to)) throw new Error(`${deviceLabel(target)} is out of reach.`);
    const toName = target ? deviceLabel(target) : HERE.this;
    // Runs on first, so nothing new starts on the computer out of reach.
    for (const repo of repos.list())
      if (repo.runsOn === from) repos.setRunsOn(repo.id, to === RUNS_ON_THIS_MAC ? null : to);
    // Saved as a fact beside its English, so it follows the language it is shown in.
    const carried = said("devicesCarryRunsOn", {
      to: target ? toName : PLACE_SAID.this,
      from: label,
    });
    for (const taskId of tasks.placement.moveRunsOn(from, to, toName, carried))
      this.options.runsOnMoved?.(taskId);
    const started = tasks
      .list()
      .filter((record) => record.deviceId === from && record.status === "active")
      // A review follows its builder: it stays, and Remove now stops it.
      .filter((record) => record.shape?.kind !== "review");
    const stayed: string[] = [];
    let moving = 0;
    for (const record of started) {
      const answer = await carry(record.id, to).catch((caught: unknown) => ({
        ok: false,
        text: caught instanceof Error ? caught.message : String(caught),
      }));
      if (answer.ok) moving += 1;
      else stayed.push(answer.text);
    }
    // Only an entry whose every task moved goes: it is removed once they have.
    if (stayed.length === 0) {
      this.carrying.set(from, to);
      this.settleCarries();
    }
    this.changed();
    return { moving, stayed };
  }

  /**
   * A carry whose moves are over: with no task started there any more, the
   * computer out of reach is removed now, as Remove now does; with one
   * still there, its move refused or ended unfinished, the computer stays
   * on the list and the feed says so.
   */
  private settleCarries(): void {
    if (this.carrying.size === 0) return;
    const counts = this.options.tasks.activeCountsByDevice();
    const reviews = this.options.tasks.activeReviewCountsByDevice();
    // A move still under way, in any phase, has not settled where its task runs.
    const moving = this.options.tasks
      .listWithComputerMove()
      .filter((record) => record.status === "active");
    for (const [from, to] of [...this.carrying]) {
      // A review left there is settled: Remove now stops it.
      const left = (counts.get(from) ?? 0) - (reviews.get(from) ?? 0);
      if (left > 0 && moving.some((record) => record.shape?.computer_move?.from === from)) continue;
      this.carrying.delete(from);
      const device = this.options.pairing.list().find((entry) => entry.id === from);
      if (!device) continue;
      const target = this.options.pairing.list().find((entry) => entry.id === to);
      const toName = target ? deviceLabel(target) : HERE.this;
      const toSaid = target ? toName : PLACE_SAID.this;
      if (left > 0) {
        this.options.onProblem(
          said("devicesCarryStayed", { count: left, from: deviceLabel(device) }),
        );
        continue;
      }
      void this.removeNow(device)
        .then(() =>
          this.options.emitUpdate?.({
            type: "device_update",
            deviceId: to,
            name: toName,
            stage: "done",
            // English, as every line of a device's update is.
            text: englishOf(said("devicesCarriedOn", { to: toSaid })),
            tone: "info",
          }),
        )
        .catch((caught: unknown) =>
          this.options.onProblem(
            said("devicesCarryNotRemoved", {
              from: deviceLabel(device),
              why: caught instanceof Error ? caught.message : String(caught),
            }),
          ),
        );
    }
  }

  /** Keep it: a computer waiting to be removed once it is back stays on the list. */
  keep(deviceId: string): DeviceView {
    this.options.pairing.removeWhenBack(deviceId, false);
    const view = this.viewOf(deviceId);
    if (!view) throw new Error("No device with that id is on the list.");
    return view;
  }

  // ---- inside -------------------------------------------------------------------

  private async removeWithWork(device: DeviceView): Promise<DeviceView> {
    const { label } = devicePlace([device], device.id);
    const runs = this.moveProjectsHome(device.id);
    this.removing.set(device.id, { stage: "bringing-work", runs });
    this.changed();
    try {
      await this.options.stopTasks(device.id);
      await this.options.bringHome(device.id);
      this.removing.set(device.id, { stage: "cleaning-up", runs });
      this.changed();
      // Off the list: cut off at once, it removes what Firstmate set up
      // there; one this Mac reaches over its own SSH is also cleaned up over
      // it, in case it never heard.
      const gone = this.options.pairing.remove(device.id, { cleanUpThere: true });
      return { ...gone, runs };
    } catch (caught) {
      const why = caught instanceof Error ? caught.message : String(caught);
      throw new Error(`Could not bring ${label}'s work here: ${why}. It stays on your list.`);
    } finally {
      this.removing.delete(device.id);
      this.changed();
    }
  }

  /**
   * Remove now, out of reach: its tasks stop here, their working copies
   * stay there with any unmerged work, and it removes what Firstmate set
   * up there once it is back and learns it was removed.
   */
  private async removeNow(device: DeviceView): Promise<DeviceView> {
    const { label } = devicePlace([device], device.id);
    const runs = this.moveProjectsHome(device.id);
    // Held while it runs, so a contact meanwhile starts no second removal.
    this.removing.set(device.id, { stage: "cleaning-up", runs });
    this.changed();
    try {
      return await this.removeNowHeld(device, label, runs);
    } finally {
      this.removing.delete(device.id);
      this.changed();
    }
  }

  private async removeNowHeld(
    device: DeviceView,
    label: string,
    runs: string[],
  ): Promise<DeviceView> {
    await this.options.stopTasks(device.id);
    for (const record of this.options.tasks.list()) {
      if (record.deviceId !== device.id || record.workspaceState !== "present") continue;
      if (!TaskService.isClosed(record)) continue;
      this.options.tasks.placement.markWorkspaceRemoved(record.id);
      this.options.tasks.note(
        record.id,
        `working copy left on ${label} - it was removed while out of reach, so any unmerged work stays there`,
        { news: true, data: { device: device.id } },
      );
    }
    // Added by its address, what Firstmate set up there is removed over
    // Remote Login now; when that cannot be done yet, this Mac tries again
    // over SSH later (`DevicePairing.sshCleanups`). Otherwise it hears it was
    // removed the next time it dials, and removes that itself.
    const removedThere = device.remoteLogin
      ? await (this.options.removeThere?.(device) ?? Promise.resolve(false)).catch(() => false)
      : false;
    const gone = this.options.pairing.remove(device.id, {
      farewell: !removedThere,
      cleanUpThere: !removedThere,
    });
    return { ...gone, runs };
  }

  /**
   * Updating over the connection (docs/devices.md, "Updating over the
   * connection"): the computer takes the update order whatever its major,
   * gets this Mac's Firstmate with its own key when it keeps a copy, and
   * starts again; this waits for it to come back on this Mac's version.
   * A Mac that keeps its own copy and takes the download order first gets
   * this Mac's published version itself, its count said as it goes
   * ("Downloading over the connection"); one that could not is sent this
   * Mac's copy at once, with the count of what was sent.
   * A Linux worker that comes back unchanged from the update order without
   * being sent a copy may need a package: it is answered at once, never after
   * the whole wait - with the package route when the click opted in
   * (`fallback`), and otherwise refused, so the app's own update hands it to
   * the card (docs/devices.md, "Updating"). Only a return after the order
   * counts, never a reconnect while the order is still being prepared.
   */
  private async updateOverConnection(
    device: DeviceView,
    { fallback, packageWorker }: { fallback: boolean; packageWorker: boolean },
  ): Promise<DeviceView | "package-address"> {
    const { work } = this.options;
    const label = deviceLabel(device);
    const say = (
      stage: DeviceUpdateEvent["stage"],
      text: string,
      tone: "info" | "warn" = "info",
      extra: Pick<DeviceUpdateEvent, "copy" | "run"> = {},
    ) =>
      this.options.emitUpdate?.({
        type: "device_update",
        deviceId: device.id,
        name: label,
        stage,
        text,
        tone,
        ...extra,
      });
    const refused = (refusal: RemoteLoginRefusal, lines: readonly [string, string]): never => {
      for (const line of lines) say("refused", line, "warn");
      throw new RemoteLoginRefusedError(refusal, lines, lines.join(" "));
    };
    const refuse = (refusal: RemoteLoginRefusal): never =>
      refused(
        refusal,
        remoteLoginWords.refused(refusal, { address: label, name: label, doing: "update" }),
      );
    const version = work.version(device.id);
    if (!version) return refuse("out-of-reach");
    if (!this.otherVersion(device, version)) return refuse("current");
    if (!takesUpdate(version.contract)) return refuse("not-updatable");
    // Another user on this Mac runs this Mac's own app; another Mac gets it from here.
    const runsThisApp = device.onThisMac === true && device.user !== undefined;
    if (!runsThisApp && !(this.options.canSend?.(device) ?? false)) return refuse("cannot-send");

    this.updating.add(device.id);
    // Listening before it is asked, so its return is never missed.
    let sentBytes = false;
    let legacyPackage = false;
    const back = this.backOnThisVersion(device, false, (returned) => {
      if (packageWorker && !sentBytes && version.app && returned.app === version.app) {
        legacyPackage = true;
        return true;
      }
      return false;
    });
    try {
      say("updating", remoteLoginWords.updating(device));
      // Its crew's work is saved before anything there stops, and carries on after.
      if (!(await this.saveWork(device, () => refuse("out-of-reach")))) {
        this.sayLetGo(device);
        return this.viewOf(device.id) ?? device;
      }
      let starting = false;
      const start = () => {
        if (starting) return;
        starting = true;
        say("updating", remoteLoginWords.starting(label), "info", { copy: { state: "starting" } });
      };
      // A Mac elsewhere that keeps its own copy downloads this Mac's
      // published version itself first, when it takes that order.
      const published = downloadsThere(device, version.contract)
        ? ((await this.options.download?.(device)) ?? null)
        : null;
      let answer: WorkUpdateAnswer | undefined;
      if (published) {
        const got = await this.downloadThere(device, published, say);
        // Followed until it came back on this Mac's version.
        if ("back" in got) {
          say("done", remoteLoginWords.updated(device, "running"));
          return this.viewOf(device.id) ?? device;
        }
        // Not heard from again in the wait, with its download possibly
        // still running: it may update by itself, so nothing says it did not.
        if ("lost" in got) return refused("failed", remoteLoginWords.uncertain(label));
        if ("restarts" in got) answer = got;
        else
          say(
            "updating",
            remoteLoginWords.downloadFallback(label, got.fallback === "mismatch"),
            "info",
            {
              copy: { state: "preparing" },
            },
          );
      }
      if (!answer) {
        // A worker that may answer it needs the Ubuntu package is asked
        // without fetching its copy first: the copy it asks for is served when it asks.
        if (!runsThisApp && !fallback) {
          const unready = await this.options.prepare?.(device);
          if (unready) return refuse(unready);
        }
        // What this Mac sends it, counted as it goes: only a computer that
        // keeps a copy gets one.
        const run = { id: `copy-${randomUUID()}` };
        const copy = copyCount(
          (sent) =>
            say("updating", remoteLoginWords.sendingRow(label, sent), "info", {
              copy: { state: "sending", sent },
              run,
            }),
          this.options.countEveryMs ?? COUNT_EVERY_MS,
        );
        const stopCounting = work.onAppSent((deviceId, bytes) => {
          if (deviceId === device.id) {
            sentBytes ||= bytes > 0;
            copy.add(bytes);
          }
        });
        // Its last count is said before whatever follows it.
        const counted = () => {
          stopCounting();
          copy.end();
        };
        // From here a restart is this order's; a drop or welcome before it is not.
        back.arm();
        try {
          answer = updateOrders[WORK_UPDATE_ORDER].response.parse(
            await work.ask(device.id, WORK_UPDATE_ORDER, [], { anyVersion: true }),
          );
        } catch (caught) {
          counted();
          console.warn(`[devices] could not update ${label}:`, caught);
          return refuse(caught instanceof DeviceOutOfReachError ? "out-of-reach" : "failed");
        }
        counted();
      }
      if (answer.needsPackage) {
        if (fallback) return "package-address";
        return refused("failed", remoteLoginWords.packageCopyMissing(label));
      }
      if (!answer.restarts) {
        say("done", remoteLoginWords.updatedByHand(device));
        return this.viewOf(device.id) ?? device;
      }
      start();
      if (await back.came()) say("done", remoteLoginWords.updated(device, "running"));
      else if (legacyPackage && !sentBytes) {
        if (fallback) return "package-address";
        return refused("failed", remoteLoginWords.packageCopyMissing(label));
      } else if (work.version(device.id)) say("done", this.updateNotConfirmed(device), "warn");
      else for (const line of remoteLoginWords.notBack(device)) say("done", line, "warn");
      return this.viewOf(device.id) ?? device;
    } finally {
      back.cancel();
      this.updating.delete(device.id);
      this.options.resumeTasks?.(device.id);
    }
  }

  /**
   * Match to this Mac's source (docs/devices.md, "Matching the home's
   * build"): a Mac that runs work and lists `source-builds` is asked to
   * build this Mac's commit (`inf:source:build`). It gets the committed
   * tree from here with its own key, installs and builds it, and its
   * background starts the build on trial. Each step it is on is said in the
   * feed, as the count of a copy is; a step that failed changed nothing
   * there and is said with its own words. Answers it on the list once it
   * runs this Mac's commit, or rejects with the refusal's two lines.
   */
  private async matchSource(device: DeviceView, commit: string): Promise<DeviceView> {
    const { work } = this.options;
    const label = deviceLabel(device);
    const say = (
      stage: DeviceUpdateEvent["stage"],
      text: string,
      tone: "info" | "warn" = "info",
      extra: Pick<DeviceUpdateEvent, "copy" | "run"> = {},
    ) =>
      this.options.emitUpdate?.({
        type: "device_update",
        deviceId: device.id,
        name: label,
        stage,
        text,
        tone,
        ...extra,
      });
    const refused = (refusal: RemoteLoginRefusal, lines: readonly [string, string]): never => {
      for (const line of lines) say("refused", line, "warn");
      throw new RemoteLoginRefusedError(refusal, lines, lines.join(" "));
    };
    const version = work.version(device.id);
    if (!version)
      return refused(
        "out-of-reach",
        remoteLoginWords.refused("out-of-reach", { address: label, name: label, doing: "update" }),
      );
    if (!buildsSourceThere(device.system))
      return refused("other-system", [
        m.devicesSourceNotMac({ device: label }),
        m.devicesSourceKeepsVersion(),
      ]);
    if (!version.changes?.includes(SOURCE_BUILDS_CHANGE))
      return refused("not-updatable", [
        m.devicesSourceTooOld({ device: label }),
        m.devicesSourceTooOldNext(),
      ]);
    this.updating.add(device.id);
    // Listening before it is asked, so its return is never missed.
    const back = this.backOnThisVersion(device);
    const run = { id: `source-${randomUUID()}` };
    let said: string | undefined;
    const step = (state: string) => {
      const text =
        state === "fetching"
          ? m.devicesSourceFetching({ device: label })
          : state === "installing"
            ? m.devicesSourceInstalling({ device: label })
            : state === "building"
              ? m.devicesSourceBuilding({ device: label })
              : undefined;
      if (!text || text === said) return;
      said = text;
      say("updating", text, "info", { copy: { state: "preparing" }, run });
    };
    let asking: NodeJS.Timeout | undefined;
    let settled = false;
    try {
      say("updating", remoteLoginWords.updating(device));
      // Its crew's work is saved before anything there stops, and carries on after.
      const lost = () =>
        refused(
          "out-of-reach",
          remoteLoginWords.refused("out-of-reach", {
            address: label,
            name: label,
            doing: "update",
          }),
        );
      if (!(await this.saveWork(device, lost))) {
        this.sayLetGo(device);
        return this.viewOf(device.id) ?? device;
      }
      step("fetching");
      const everyMs = this.options.countEveryMs ?? COUNT_EVERY_MS;
      const ask = async () => {
        try {
          const progress = downloadOrders[WORK_PROGRESS_ORDER].response.parse(
            await work.ask(device.id, WORK_PROGRESS_ORDER, [], { anyVersion: true }),
          );
          if (!settled) step(progress.state);
        } catch {
          // Its own answer, or its return, decides.
        }
        if (!settled) asking = setTimeout(ask, everyMs);
      };
      asking = setTimeout(ask, everyMs);
      back.arm();
      let answer: WorkSourceAnswer;
      try {
        answer = sourceOrders[WORK_SOURCE_ORDER].response.parse(
          await work.ask(device.id, WORK_SOURCE_ORDER, [{ commit }], { anyVersion: true }),
        );
      } catch (caught) {
        console.warn(`[devices] could not build ${label}'s source:`, caught);
        // A connection that dropped while it built is followed by its return.
        if (caught instanceof DeviceOutOfReachError) answer = { updating: true };
        else
          return refused(
            "failed",
            remoteLoginWords.refused("failed", { address: label, name: label, doing: "update" }),
          );
      } finally {
        settled = true;
        clearTimeout(asking);
      }
      if ("failed" in answer) {
        const lines: [string, string] = [
          SOURCE_FAILED_WORDS[answer.failed](label),
          m.devicesSourceKeepsVersion(),
        ];
        for (const line of lines) say("refused", line, "warn");
        throw new RemoteLoginRefusedError(
          "failed",
          lines,
          [...lines, answer.detail ?? ""].join("\n").trim(),
        );
      }
      if ("restarts" in answer && !answer.restarts) {
        say("done", remoteLoginWords.updatedByHand(device));
        return this.viewOf(device.id) ?? device;
      }
      say("updating", remoteLoginWords.starting(label), "info", { copy: { state: "starting" } });
      if (await back.came()) say("done", remoteLoginWords.updated(device, "running"));
      else if (work.version(device.id)) say("done", this.updateNotConfirmed(device), "warn");
      else for (const line of remoteLoginWords.notBack(device)) say("done", line, "warn");
      return this.viewOf(device.id) ?? device;
    } finally {
      settled = true;
      clearTimeout(asking);
      back.cancel();
      this.updating.delete(device.id);
      this.options.resumeTasks?.(device.id);
    }
  }

  /**
   * Asks a Mac to download this Mac's published version itself and keep it
   * (docs/devices.md, "Downloading over the connection"), asking how far it
   * got once every count's interval and saying each count as one run of feed
   * lines. Answers the computer's own answer: kept (`restarts`), or a
   * fallback with nothing changed there - also for any other failure it
   * answers. A connection that dropped while it was asked, or a computer
   * already updating, is followed instead: by its progress once it is back,
   * until it is on this Mac's version (`back`), its download ended with
   * nothing changed (a fallback), or it was not heard from for the update's
   * wait (`lost`), its download possibly still running there.
   */
  private downloadThere(
    device: DeviceView,
    published: UpdateDownload,
    say: (
      stage: DeviceUpdateEvent["stage"],
      text: string,
      tone?: "info" | "warn",
      extra?: Pick<DeviceUpdateEvent, "copy" | "run">,
    ) => void,
  ): Promise<
    { restarts: boolean } | { fallback: "failed" | "mismatch" } | { back: true } | { lost: true }
  > {
    const { work } = this.options;
    const label = deviceLabel(device);
    const run = { id: `download-${randomUUID()}` };
    const everyMs = this.options.countEveryMs ?? COUNT_EVERY_MS;
    let said = -1;
    // The first empty count stays unsaid until bytes or a stated total arrive.
    const count = ({ received, total }: { received: number; total?: number }) => {
      if ((received === 0 && total === undefined) || received === said) return;
      said = received;
      const download = { received, ...(total !== undefined && received <= total ? { total } : {}) };
      say("updating", remoteLoginWords.downloading(label, received, download.total), "info", {
        copy: { state: "preparing", download },
        run,
      });
    };
    return new Promise((resolve) => {
      let settled = false;
      // Its own answer is lost, or it was updating already: its progress decides.
      let following = false;
      let asking: NodeJS.Timeout | undefined;
      let away: NodeJS.Timeout | undefined;
      const settle = (outcome: Parameters<typeof resolve>[0]) => {
        if (settled) return;
        settled = true;
        clearTimeout(asking);
        clearTimeout(away);
        stopVersion();
        resolve(outcome);
      };
      // On this Mac's version, it updated, whatever its answer said.
      const stopVersion = work.onVersion((deviceId, version) => {
        if (deviceId === device.id && version && !this.otherVersion(device, version))
          settle({ back: true });
      });
      const missing = () => {
        away ??= setTimeout(
          () => settle({ lost: true }),
          this.options.updateWaitMs ?? UPDATE_RETURN_MS,
        );
      };
      const ask = async () => {
        try {
          const progress = downloadOrders[WORK_PROGRESS_ORDER].response.parse(
            await work.ask(device.id, WORK_PROGRESS_ORDER, [], { anyVersion: true }),
          );
          // A count that arrives after the download's own answer is older than its last.
          if (settled) return;
          clearTimeout(away);
          away = undefined;
          count(progress);
          // A state this Mac does not know, from a later version, is under way.
          if (following && progress.state === "mismatch") settle({ fallback: "mismatch" });
          else if (following && progress.state === "failed") settle({ fallback: "failed" });
          // Nothing under way there, on its old version: the download ended
          // with the run it ran in, and nothing changed.
          else if (following && progress.state === "idle") settle({ fallback: "failed" });
        } catch (caught) {
          if (following && caught instanceof DeviceOutOfReachError) missing();
        }
        if (!settled) asking = setTimeout(ask, everyMs);
      };
      asking = setTimeout(ask, everyMs);
      work
        .ask(device.id, WORK_DOWNLOAD_ORDER, [published], { anyVersion: true })
        .then((answered) => {
          const answer = downloadOrders[WORK_DOWNLOAD_ORDER].response.parse(answered);
          if ("updating" in answer) {
            following = true;
            return;
          }
          // Its last count, which the asking may not have caught.
          count(answer);
          settle(
            "restarts" in answer ? { restarts: answer.restarts } : { fallback: answer.fallback },
          );
        })
        .catch((caught: unknown) => {
          if (caught instanceof DeviceOutOfReachError) {
            following = true;
            missing();
            return;
          }
          // It answered, so nothing there changed: it is sent this Mac's copy.
          console.warn(`[devices] ${label} could not download its update:`, caught);
          settle({ fallback: "failed" });
        });
    });
  }

  private updateNotConfirmed(device: DeviceView): string {
    const running = this.options.work.version(device.id);
    return running
      ? remoteLoginWords.stillOnVersion(device, running.app)
      : remoteLoginWords.notBack(device)[0];
  }

  /**
   * Resolves true once the computer is connected on this Mac's version,
   * false after the wait, which starts once its answer is in: a download
   * may take longer than the wait.
   */
  private backOnThisVersion(
    device: DeviceView,
    requireApp = false,
    unchangedAfterDisconnect?: (version: WorkDeviceVersion) => boolean,
  ): {
    came: () => Promise<boolean>;
    cancel: () => void;
    /** Counts drops from now on for `unchangedAfterDisconnect`: arm it as the order is sent. */
    arm: () => void;
  } {
    let settle: (came: boolean) => void = () => {};
    const came = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    let timer: NodeJS.Timeout | undefined;
    let armed = false;
    let disconnected = false;
    const stop = this.options.work.onVersion((deviceId, version) => {
      if (deviceId !== device.id) return;
      if (!version) {
        disconnected ||= armed;
        return;
      }
      if (requireApp) {
        if (version.app && version.app === this.options.home?.app) done(true);
      } else if (!this.otherVersion(device, version)) done(true);
      else if (disconnected && unchangedAfterDisconnect?.(version)) done(false);
    });
    const done = (value: boolean) => {
      clearTimeout(timer);
      stop();
      settle(value);
    };
    return {
      came: () => {
        timer ??= setTimeout(() => done(false), this.options.updateWaitMs ?? UPDATE_RETURN_MS);
        timer.unref?.();
        return came;
      },
      cancel: () => done(false),
      arm: () => {
        armed = true;
      },
    };
  }

  /**
   * Whether the computer is connected on an older Firstmate than this Mac's
   * and takes no new work because of it: a task for it waits for an update,
   * which is not being out of reach. A computer whose hello lacks a change a
   * crewmate turn there may need (`WorkDevices.lacksTurnChange`) takes none
   * either, though it speaks this Mac's major: a task started there would
   * only wait for its update (docs/helper.md, "Waiting for its update").
   */
  takesNoWorkUntilUpdated(deviceId: string): boolean {
    const version = this.options.work.version(deviceId);
    if (!version) return false;
    if (version.takesWork) return this.options.work.lacksTurnChange(deviceId);
    const device = this.options.pairing.list().find((entry) => entry.id === deviceId);
    return !!device && this.otherVersion(device, version)?.than === "older";
  }

  /**
   * The version of the app open on each device that controls this computer
   * now, as its connection's hello said it (docs/devices.md, "Each copy's
   * version"), by device id. Two apps of one device read as the older, so a
   * copy behind is never hidden; one that said none reads as too old to say.
   */
  private appVersions(devices: readonly DeviceView[]): Map<string, DeviceAppVersion> {
    const apps = new Map<string, DeviceAppVersion>();
    const running = devices.some((device) => deviceControls(device.kind))
      ? this.options.work.runningVersions()
      : [];
    const home = this.options.home?.app;
    for (const device of devices) {
      const said = running
        .filter((row) => row.deviceId === device.id && row.role === "view")
        .map((row) => row.version);
      if (said.length === 0) continue;
      const known = said.filter((version): version is string => version !== null);
      const app =
        known.length < said.length
          ? undefined
          : known.reduce((oldest, version) =>
              (compareSemver(version, oldest) ?? 0) < 0 ? version : oldest,
            );
      if (app === undefined) {
        apps.set(device.id, {});
        continue;
      }
      // A phone's app has versions of its own: never measured against this computer's.
      const order = isPhone(device) || home === undefined ? null : compareSemver(app, home);
      // What it said of catching up, while it is behind this computer's version and said it of that version.
      const follow = this.appFollows.get(device.id);
      apps.set(
        device.id,
        order === null
          ? { app }
          : order === 0
            ? { app, same: true }
            : {
                app,
                than: order < 0 ? "older" : "newer",
                ...(order < 0 && follow && follow.version === home ? { follow } : {}),
              },
      );
    }
    return apps;
  }

  /**
   * What the list says of a computer connected on another version of
   * Firstmate than this Mac's: undefined when it runs this Mac's. Two
   * versions of Firstmate are compared when both are known, else the
   * contracts they speak.
   */
  private otherVersion(
    device: DeviceView,
    version: WorkDeviceVersion,
  ): DeviceOtherVersion | undefined {
    const home = this.options.home ?? { contract: PROTOCOL_VERSION };
    // Another account on this Mac runs this Mac's own copy, whichever build it
    // names: it is compared by version alone, and never matched by build
    // (docs/devices.md, "Matching the home's build").
    const builds = !device.onThisMac;
    const match = compareBuilds(builds ? home : { contract: home.contract, app: home.app }, {
      contract: version.contract,
      app: version.app,
      ...(builds ? { build: version.build } : {}),
    });
    if (match.same) return undefined;
    const homeCommit = builds ? sourceCommitOf(home.build) : null;
    const source = match.target === "source" && homeCommit;
    const updateBy = device.remoteLogin
      ? "remote-login"
      : takesUpdate(version.contract)
        ? "connection"
        : "command";
    return {
      ...(version.app !== undefined ? { app: version.app } : {}),
      ...(match.than ? { than: match.than } : {}),
      takesWork: version.takesWork && !this.options.work.lacksTurnChange(device.id),
      updateBy,
      ...(source ? { source: { commit: homeCommit } } : {}),
      ...(!source && updateBy === "connection" && downloadsThere(device, version.contract)
        ? { downloads: true as const }
        : {}),
    };
  }

  /**
   * What a computer said of its version at a welcome, about an update that
   * did not start there (docs/helper.md, "A copy that does not start"): the
   * copy it went back from is the one this Mac sent, so this Mac's version is
   * kept and said once in the feed; a version it runs now, or one older than
   * it, is forgotten, since it started there.
   */
  private heardVersion(deviceId: string, version: WorkDeviceVersion): void {
    const { pairing } = this.options;
    const kept = pairing.failedUpdate(deviceId);
    // A commit kept is forgotten once that computer runs it, or this Mac runs another.
    if (kept && COMMIT.test(kept)) {
      if (sourceCommitOf(version.build) === kept || kept !== this.homeTarget())
        pairing.noteFailedUpdate(deviceId, null);
    } else if (kept && version.app && (compareSemver(version.app, kept) ?? -1) >= 0)
      pairing.noteFailedUpdate(deviceId, null);
    const failed = version.failedUpdate ? this.homeTarget() : undefined;
    if (!failed) return;
    if (COMMIT.test(failed)) {
      if (sourceCommitOf(version.build) === failed) return;
    } else if (version.app && (compareSemver(version.app, failed) ?? -1) >= 0) return;
    if (!pairing.noteFailedUpdate(deviceId, failed)) return;
    const device = pairing.list().find((entry) => entry.id === deviceId);
    if (!device) return;
    const lines = COMMIT.test(failed)
      ? [m.devicesSourceWentBack({ device: deviceLabel(device) })]
      : remoteLoginWords.wentBack(device, failed);
    for (const line of lines)
      this.options.emitUpdate?.({
        type: "device_update",
        deviceId,
        name: deviceLabel(device),
        stage: "done",
        text: line,
        tone: "warn",
      });
  }

  /** Every project that runs on the computer runs on this Mac from now; answers their names. */
  private moveProjectsHome(deviceId: string): string[] {
    const moved: string[] = [];
    for (const repo of this.options.repos.list()) {
      if (repo.runsOn !== deviceId) continue;
      this.options.repos.setRunsOn(repo.id, null);
      moved.push(repo.name);
    }
    return moved;
  }

  private contact(contact: WorkDeviceContact): void {
    const { pairing } = this.options;
    if (contact.contact === "in-reach") this.noteConnected(contact.deviceId);
    else this.connectedSince.delete(contact.deviceId);
    pairing.seen(contact.deviceId, this.options.now());
    if (
      contact.contact === "in-reach" &&
      pairing.removingWhenBack(contact.deviceId) &&
      !this.removing.has(contact.deviceId)
    ) {
      const device = pairing.list().find((entry) => entry.id === contact.deviceId);
      if (device)
        void this.removeWithWork(device).catch((caught: unknown) =>
          this.options.onProblem(caught instanceof Error ? caught.message : String(caught)),
        );
    }
    this.changed();
  }

  /**
   * What a Mac's window found of its work half is that Mac's alone, so only a
   * window the connection names tells it (docs/devices.md, "A Mac that has
   * not finished setting up").
   */
  async workSetupAsked(rawArgs: unknown, actor: ActionActor | { kind: "device" } | undefined) {
    if (actor?.kind !== "captain" || !actor.view) throw new Error(WORK_SETUP_ONLY);
    const [report] = parseInvokeRequest("inf:devices:work-setup", rawArgs);
    this.heardWorkSetup(actor.view, report);
    return { ok: true as const };
  }

  /**
   * A Mac's window found its work half (docs/devices.md, "A Mac that has not
   * finished setting up"): kept while the window is connected, so its row
   * says why its work is not in reach.
   */
  heardWorkSetup(deviceId: string, report: WorkSetupReport): void {
    const device = this.options.pairing.list().find((entry) => entry.id === deviceId);
    if (!device || !deviceRunsWork(device.kind) || !deviceControls(device.kind))
      throw new Error("No Mac that runs work with that id is on the list.");
    this.workSetups.set(deviceId, { report, at: this.options.now() });
    // The copy its background started was gone, so it starts the app there now: said once.
    if (report.copyGone)
      this.options.emitUpdate?.({
        type: "device_update",
        deviceId,
        name: deviceLabel(device),
        stage: "done",
        text: m.devicesWorkCopyGone({ device: deviceLabel(device) }),
        tone: "info",
      });
    this.graceTimers.get(deviceId)?.();
    this.graceTimers.delete(deviceId);
    // A run found, or one asked for and not there yet, has its moment to
    // reach this Mac; then the row says why it has not.
    if (report.state !== "blocked") {
      const after = () => {
        this.graceTimers.delete(deviceId);
        this.changed();
      };
      this.graceTimers.set(
        deviceId,
        (this.options.schedule ?? schedule)(WORK_REACH_GRACE_MS, after),
      );
    }
    this.changed();
  }

  /**
   * How the app open on another computer catches up with this computer's
   * version is that app's alone, so only the connection of an app that
   * controls this computer tells it (docs/devices.md, "Updating the app open
   * there").
   */
  async appFollowAsked(rawArgs: unknown, actor: ActionActor | { kind: "device" } | undefined) {
    if (actor?.kind !== "captain" || !actor.view) throw new Error(APP_FOLLOW_ONLY);
    const [report] = parseInvokeRequest("inf:devices:app-follow", rawArgs);
    this.heardAppFollow(actor.view, report);
    return { ok: true as const };
  }

  /** An app said a step of catching up: kept while it is connected, so its row and card say it. */
  heardAppFollow(deviceId: string, report: AppFollowReport): void {
    if (!this.options.pairing.list().some((entry) => entry.id === deviceId))
      throw new Error("No computer with that id is on the list.");
    this.appFollows.set(deviceId, report);
    this.changed();
  }

  /**
   * Update on the row of an app behind this computer's version: that app,
   * connected now, catches up and starts again as soon as it has the
   * version and no words are left unsent there. False when no app of that computer is connected, or the one
   * there is from before.
   */
  updateApp(deviceId: string): boolean {
    return this.options.work.liveToView(deviceId, APP_UPDATE_LIVE, { deviceId });
  }

  /**
   * Fix it on a Mac's row: its window, connected now, is asked to check its
   * work half and set it up again. False when no window of that Mac is
   * connected, or the one there is from before.
   */
  fixWork(deviceId: string): boolean {
    return this.options.work.liveToView(deviceId, WORK_SETUP_LIVE, { deviceId });
  }

  /**
   * What a Mac's row says of its work half while its window is connected and
   * its work is not in reach: what the window found, and once a run it found
   * or asked for has had its moment, the home's own reading of why that run has not
   * reached it, from the work's own contact.
   */
  private workSetupOf(
    deviceId: string,
    applies: boolean,
    mayBeHeld: boolean,
  ): { workSetup?: DeviceWorkSetup } {
    const heard = this.workSetups.get(deviceId);
    if (!applies || !heard || !this.options.work.controlling(deviceId)) return {};
    const { report, at } = heard;
    if (report.state === "blocked")
      return { workSetup: { state: "blocked", reason: report.reason ?? "not-reached" } };
    if (this.options.now() - at < WORK_REACH_GRACE_MS) return { workSetup: { state: "starting" } };
    const held = mayBeHeld && this.options.pairing.heldOnLocalNetwork(deviceId);
    return { workSetup: { state: "blocked", reason: held ? "local-network" : "not-reached" } };
  }

  /**
   * A Mac that controls this Firstmate connected or went: when it was last
   * seen is kept. A Mac that also runs work is seen by its work's contact
   * alone, so its window never hides that its work's dial is held. An entry
   * waiting to be removed once it is back that only its window holds - its
   * work out of reach and no working copy kept there - is removed on that
   * window's contact (docs/devices.md, "One computer, one entry"), as one
   * whose work is back would be.
   */
  private viewContact(contact: ViewDeviceContact): void {
    const { pairing, tasks, work } = this.options;
    const id = contact.deviceId;
    const device = pairing.list().find((entry) => entry.id === id);
    if (!device || !deviceRunsWork(device.kind)) pairing.seen(id, this.options.now());
    if (
      device &&
      contact.contact === "in-reach" &&
      pairing.removingWhenBack(id) &&
      !this.removing.has(id) &&
      !work.inReach(id) &&
      !tasks.list().some((record) => record.deviceId === id && record.workspaceState === "present")
    )
      void this.removeNow(device).catch((caught: unknown) =>
        this.options.onProblem(caught instanceof Error ? caught.message : String(caught)),
      );
    // What its window found is said again at its next connection.
    if (contact.contact === "gone") {
      this.workSetups.delete(id);
      this.appFollows.delete(id);
      this.graceTimers.get(id)?.();
      this.graceTimers.delete(id);
    }
    this.changed();
  }

  private viewOf(deviceId: string): DeviceView | undefined {
    return this.list().find((device) => device.id === deviceId);
  }

  /** Records the start of the connection the row calls connected, once per connection. */
  private noteConnected(deviceId: string): number {
    const had = this.connectedSince.get(deviceId);
    if (had !== undefined) return had;
    const at = this.options.now();
    this.connectedSince.set(deviceId, at);
    return at;
  }

  /**
   * When the connection the row calls connected began. A reach event records
   * it; a read that finds the row not connected forgets it, so the next
   * connection is newer than a refusal about the last.
   */
  private connectedAt(deviceId: string, connected: boolean): number | undefined {
    if (!connected) {
      this.connectedSince.delete(deviceId);
      return undefined;
    }
    return this.noteConnected(deviceId);
  }

  /** Pushes the list when what it says changed. */
  private changed(): void {
    const devices = this.list();
    const said = JSON.stringify(devices);
    if (said === this.said) return;
    this.said = said;
    this.options.emit(devices);
  }
}
