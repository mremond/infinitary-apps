import { userInfo } from "node:os";
import { join } from "node:path";
import type { BuildIdentity } from "@shared/buildIdentity";
import { CONNECTION_PORT } from "@shared/connection";
import { COMPUTER, HERE } from "@shared/deviceNames";
import {
  type ComputerReach,
  computerPresenceOf,
  type DeviceChip,
  type DeviceInvite,
  type DeviceInviteRequest,
  type DeviceSystem,
  type DeviceView,
  DOWNLOAD_COMMAND_LINK_TTL_MS,
  deviceLabel,
  deviceRunsWork,
  reachFrom,
} from "@shared/devices";
import type { FmEvent } from "@shared/events";
import { overridePasses } from "@shared/holds";
import { saidLine } from "@shared/i18n/said";
import { PROTOCOL_VERSION } from "@shared/ipc";
import type { ComputerResourcesView } from "@shared/resources";
import { interfacesFromAddresses } from "../connection/addresses";
import type { CoreEventSink } from "../events";
import { appLauncher } from "../helper/launcher";
import { bootedAt } from "../helper/lock";
import type { HostCapabilities } from "../host";
import { hostEnv } from "../hostEnv";
import type { CrewSupervisor } from "../orchestrator/crewSupervisor";
import { TICK_PERIOD_MS, type Ticker } from "../orchestrator/ticker";
import type { AppPaths } from "../paths";
import { ComputerLoads } from "../placed/computerLoads";
import { ComputerResourceFeed } from "../placed/computerResourceFeed";
import { ComputerResources } from "../placed/computerResources";
import { LoadLine } from "../placed/loadLine";
import type { PlacedSessions } from "../placed/placedSessions";
import { readProcesses } from "../placed/processResources";
import { ResourceSampler } from "../placed/resourceSampler";
import { WorkDevices } from "../placed/workDevices";
import { hostPlatform, thisDeviceSystem } from "../platform";
import {
  AppDataWatch,
  runPrivacyLog,
  SYSTEM_LOG,
  systemProcessReader,
  taskOfProcess,
} from "../privacy/appDataWatch";
import type { StandIns } from "../standIns";
import type { TaskService } from "../tasks/taskService";
import { TEMP_DIR_NAME } from "../tasks/taskTemp";
import { linuxUpdateCommand, readLinuxInstallation } from "../update/linuxInstall";
import { findOnPath } from "../userBin";
import type { RepoRegistry } from "../workspace/repoRegistry";
import { dnsSdAnnounceArgs, HomeAnnouncement } from "./announce";
import { avahiAnnounceArgs } from "./avahi";
import { ownComputerName, ownNetworkNames } from "./computerName";
import { Computers } from "./computers";
import { DeviceSetup } from "./deviceSetup";
import { DeviceSignIns, type DeviceSignInsOptions } from "./deviceSignIns";
import { DeviceUpdateNudge } from "./deviceUpdateNudge";
import { thisDeviceUser } from "./deviceUser";
import { runDnsSd, runDnsSdHeld, SYSTEM_DNS_SD } from "./dnsSd";
import { type FarBuild, FarBuilds } from "./farBuilds";
import { farSystemNamed } from "./farSystems";
import { firewallKeepsOut, windowsFirewallKeepsOut } from "./firewall";
import { appBundleOf, joinCommand } from "./joinCommand";
import { NearbyMacs } from "./nearby";
import { DevicePairing } from "./pairing";
import { PhoneDoor } from "./phoneDoor";
import { PublishedBuilds, standInTapFetch } from "./publishedBuilds";
import { RemoteLogin } from "./remoteLogin";
import { saveThereFor } from "./saveThere";
import { systemSsh } from "./ssh";
import { SshConnections } from "./sshConnections";
import { runWindowsAnnouncement, windowsAnnounceArgs } from "./windowsAnnounce";
import { runWindowsDnsSd } from "./windowsDnsSd";

/**
 * The home's devices wiring (docs/devices.md): pairing, the computers that
 * run work for this home and their load, Remote Login and SSH to a computer
 * added by its address, Macs nearby, the Bonjour announcement and the door a
 * phone asks at, the privacy watch, and each computer's own sign-ins. Your
 * devices, Remove and Update, and each computer's setup and update cards
 * read the crew, so they are made once the supervisor holds the stack
 * (`attachCrew`).
 */
export type HomeDevices = {
  /**
   * The computers that run work for this home (docs/helper.md, "Holding a
   * conversation"): the connection reaches them once the shell attaches it,
   * and a task whose record names one opens its conversation there.
   */
  work: WorkDevices;
  loadLine: LoadLine;
  computerResources: ComputerResources;
  computerLoads: ComputerLoads;
  /** Pairing: the one writer over userData/devices, and the connection's pairing seam. */
  pairing: DevicePairing;
  computerResourceFeed: ComputerResourceFeed;
  /** The app a command on another Mac gets from this one, or null when this copy cannot send itself. */
  appBundle: string | null;
  /**
   * The Firstmate for a computer of `system` on `chip`, or the Ubuntu package
   * a command asks for to install there, or null when there is none to send.
   */
  farBuild: (
    system: DeviceSystem | undefined,
    chip: DeviceChip | undefined,
    kind?: "deb",
  ) => Promise<FarBuild | null>;
  /** Makes a link for a device, wrapped in the command for one when asked (docs/devices.md, "Joining by a command"). */
  inviteDevice: (request: DeviceInviteRequest) => Promise<DeviceInvite>;
  sshConnections: SshConnections;
  /** One reach value, worked out once and handed to every reader. */
  reachOf: (deviceId: string) => ComputerReach;
  remoteLogin: RemoteLogin;
  nearbyMacs: NearbyMacs;
  homeAnnouncement: HomeAnnouncement;
  phoneDoor?: PhoneDoor;
  privacyWatch: AppDataWatch | null;
  /** Each computer that runs work signing in to its own subscriptions. */
  signIns: DeviceSignIns;
  /** A computer connected on an older Firstmate takes no new work: answered by Your devices. */
  takesNoWorkUntilUpdated: (deviceId: string) => boolean;
  /** A task began waiting for an update: its card comes back, even after Not now. */
  recallUpdateCard: (deviceId: string) => void;
  /** Each computer's resources reach the pressure watch from here on. */
  attachPressure: (observe: (view: ComputerResourcesView) => void) => void;
  /** A computer's word on its sign-ins reaches the crew from here on. */
  attachSignIns: (changed: (deviceId: string) => void) => void;
  /** Your devices and each computer's setup and update cards, once the supervisor holds the stack. */
  attachCrew: (crew: DevicesCrew) => { computers: Computers; setup: DeviceSetup };
};

/** What Your devices and the devices' cards read of the crew. */
export type DevicesCrew = {
  supervisor: Pick<
    CrewSupervisor,
    | "sessions"
    | "updates"
    | "cards"
    | "placement"
    | "moves"
    | "observeRequiredActionDevice"
    | "holdRules"
  >;
  placed: Pick<PlacedSessions, "bringHome">;
  repos: RepoRegistry;
  ticker: Ticker;
};

export async function startHomeDevices(options: {
  host: Pick<HostCapabilities, "app" | "resourceMemory">;
  paths: Pick<AppPaths, "userData" | "devicesDir" | "phoneDoorDir" | "crewmatesDir">;
  standIns: StandIns;
  tasks: TaskService;
  emit: CoreEventSink;
  broadcastEvent: (event: FmEvent) => void;
  /** The ids this Mac's rail protects for a provider: a computer's Codex and Grok lists are judged by it. */
  protectedIds: DeviceSignInsOptions["protectedIds"];
  /** The board's presentation refresh, set up with the crew. */
  scheduleWorkPresentation: () => void;
  /** This run's build when `pnpm dev`'s starter started it (`starterBuild`); absent otherwise. */
  homeBuild?: BuildIdentity;
}): Promise<HomeDevices> {
  const { host, paths, standIns, tasks, emit, broadcastEvent } = options;
  const packaged = host.app.packaged;
  const workDevices = new WorkDevices();
  const loadOverridden = (taskId: string): boolean => {
    const delivery = tasks.get(taskId)?.delivery;
    return overridePasses(delivery, "load-line", delivery?.headSha);
  };
  const loadLine = new LoadLine({
    stateFile: join(paths.userData, "load", "holds.json"),
    overridden: loadOverridden,
    changed: () => tasks.invalidatePresentation(),
  });
  const computerResources = new ComputerResources({
    work: workDevices,
    local: new ResourceSampler({
      memory: host.resourceMemory,
      processes: readProcesses,
      // A program a task's shell left behind still counts as that task's.
      taskFolders: () =>
        tasks
          .listActive()
          .filter((record) => !record.deviceId)
          .map((record) => ({
            taskId: record.id,
            folders: [
              ...(record.worktreeDir && record.workspaceState === "present"
                ? [record.worktreeDir]
                : []),
              join(paths.crewmatesDir, record.id, TEMP_DIR_NAME),
            ],
          })),
      observed: (observation, processes, started, window, cpuWindow) =>
        loadLine.observe(observation, processes, started, window, cpuWindow),
    }),
  });
  const computerLoads = new ComputerLoads({
    local: loadLine,
    work: workDevices,
    changed: () => tasks.invalidatePresentation(),
    overrides: (computerId) => tasks.passingOverridesForComputer(computerId, "load-line"),
  });
  // Made once the supervisor holds the stack (`attachCrew`).
  let computers: Computers | undefined;
  let deviceSetup: DeviceSetup | undefined;
  let updateNudge: DeviceUpdateNudge | undefined;
  // Leave from a Mac that runs work is Remove's, which brings its work here
  // first; bound once Your devices exists (docs/devices.md, "Leave").
  let leaveWithWork: (device: DeviceView) => boolean = () => false;
  // Devices reads each connection's state; the list is made further on.
  let devicesChanged = () => {};
  let observePressure: (view: ComputerResourcesView) => void = () => {};
  // A computer's word on its sign-ins reaches the crew once it exists: a
  // cut-off it names holds its tasks there, and its end lets them go on.
  let onDeviceSignIns: (deviceId: string) => void = () => {};
  // A development picture's addresses.
  const standInAddresses = standIns.addresses;
  const interfaces = () => (standInAddresses ? interfacesFromAddresses(standInAddresses) : {});
  // A Windows home reads its own user's identifier once, so a join as that
  // user from this PC is refused (docs/helper.md, "Another user here").
  let ownSid: string | null | undefined;
  if (hostPlatform() === "win32")
    void thisDeviceUser({ platform: "win32" }).then(
      (user) => {
        ownSid = user && "sid" in user ? user.sid : null;
      },
      () => {
        ownSid = null;
      },
    );
  const devices = new DevicePairing({
    dir: paths.devicesDir,
    ownSid: () => ownSid,
    // Dev/e2e may keep the connection to loopback at a port of its own
    // (tests/e2e/launch.ts): with no private address in view, a link names
    // 127.0.0.1 at that port, so a test never listens on this Mac's network,
    // where a firewall can drop the dial, or on the port a real app holds.
    ...(standIns.loopbackPort !== undefined
      ? { port: standIns.loopbackPort, interfaces }
      : standInAddresses
        ? { interfaces }
        : {}),
    // Dev/e2e may stand in another Mac for every device that joins, so two
    // apps on one Mac read as two Macs; an installed app never does.
    ...(standIns.joinsFromAnotherMac ? { joinsFromAnotherMac: true } : {}),
    leaveWithWork: (device) => leaveWithWork(device),
    // A Linux or Windows home says when its own firewall may keep devices
    // out (docs/devices.md, "A home's firewall"); a Mac's asks its person.
    ...(hostPlatform() === "linux"
      ? { firewall: () => firewallKeepsOut({ port: CONNECTION_PORT }) }
      : hostPlatform() === "win32"
        ? { firewall: () => windowsFirewallKeepsOut(CONNECTION_PORT, process.execPath) }
        : {}),
    // A Windows PC's own ssh keeps no control connection, which adding by an address needs.
    ...(hostPlatform() === "win32" ? { addsByAddress: false as const } : {}),
    // One feed line when a device joins, or finds this Mac again; it names
    // the device, never the link. A computer that runs work then gets its
    // setup card (docs/devices.md, "Finishing its setup").
    onJoined: (device, found, again) => {
      broadcastEvent({
        type: "device_joined",
        deviceId: device.id,
        name: device.name,
        kind: device.kind,
        ...(device.user ? { user: device.user } : {}),
        ...(device.onThisMac !== undefined ? { onThisMac: device.onThisMac } : {}),
        ...(found ? { found } : {}),
        ...(again ? { again } : {}),
        ...(device.reachedOn ? { reachedOn: device.reachedOn } : {}),
      });
      deviceSetup?.joined(device, found, again);
    },
    onLeft: (device) =>
      broadcastEvent({
        type: "device_left",
        deviceId: device.id,
        name: device.name,
        kind: device.kind,
      }),
  });
  const computerResourceFeed = new ComputerResourceFeed({
    resources: computerResources,
    computers: () => [
      { computerId: null, label: HERE.This },
      ...devices
        .list()
        .filter((device) => deviceRunsWork(device.kind))
        .map((device) => ({
          computerId: device.id,
          label: deviceLabel(device),
        })),
    ],
    onComputers: (listener) => devices.subscribe(listener),
    onWork: (listener) => tasks.onChange(() => listener()),
    // Asked on every resource tick and task change, so it never composes the
    // whole task history to learn whether one task is active.
    working: () => loadLine.active || tasks.hasStatus("active"),
    load: (computerId) => computerLoads.read(computerId),
    refreshLoad: (computerId) => computerLoads.refresh(computerId),
    onContact: (listener) => workDevices.onWorkDevice(listener),
    emit: (view) => {
      emit("inf:computers:resources", view);
      observePressure(view);
    },
  });
  if (standIns.networkName) {
    devices.noteNetworkName(standIns.networkName);
  } else {
    void ownNetworkNames().then((names) => {
      const local = names.filter((name) => name.endsWith(".local"));
      devices.noteNetworkName(local.at(-1) ?? null);
    });
  }
  // The app a command on another Mac gets from this one, and how another
  // user on this Mac starts this one (docs/devices.md, "Joining by a command").
  const appBundle = appBundleOf({
    packaged,
    executable: process.execPath,
    env: process.env,
    // An installed Linux app sends itself whole only as the AppImage it runs from.
    appImage:
      packaged && hostPlatform() === "linux"
        ? (readLinuxInstallation({
            chip: process.arch,
            resourcesDir: host.app.resourcesDir,
            execPath: process.execPath,
            env: process.env,
          }).appImage ?? null)
        : null,
  });
  const flavor = host.app.flavor ?? (packaged ? "release" : "dev");
  // The Firstmate a computer of another system gets from this one
  // (docs/devices.md, "Infinitary for another system"): this app's own when it
  // suits, else the one published for that system at this version. Only an
  // installed release reads the public tap; a development run reads a
  // stand-in tap a test names, or none, and so keeps link pairing.
  const tapStandIn = standIns.publishedTap;
  const farBuilds = new FarBuilds({
    own: () => appBundle,
    published:
      (packaged && flavor === "release") || tapStandIn
        ? new PublishedBuilds({
            version: host.app.version,
            dir: join(paths.devicesDir, "builds"),
            ...(tapStandIn ? { fetchImpl: standInTapFetch(tapStandIn) } : {}),
          })
        : null,
    chip: thisDeviceSystem().chip ?? null,
  });
  const farBuild: HomeDevices["farBuild"] = async (system, chip, kind) => {
    const far = farSystemNamed(system);
    const on = far ? (chip ?? Object.values(far.chips)[0]) : undefined;
    if (!far || !on || !Object.values(far.chips).includes(on)) return null;
    if (kind && far.system !== "linux") return null;
    const build = await farBuilds.for(far, on, kind);
    return "refusal" in build ? null : build;
  };
  const launcher = appLauncher({
    packaged,
    platform: hostPlatform(),
    execPath: process.execPath,
    appDir: host.app.appDir,
    resourcesDir: host.app.resourcesDir,
    env: process.env,
  });
  const inviteDevice = async (request: DeviceInviteRequest): Promise<DeviceInvite> => {
    // Every Mac added now can both control and run work, so no new link
    // makes one that only controls (docs/devices.md, "The link").
    if (request.kind === "view")
      throw new Error(
        `A new link adds a ${COMPUTER.one} that can control your first mate and run work.`,
      );
    // A command for another Mac adds a Mac; one for another user here a
    // computer that only runs work.
    if (request.command && (request.command === "another-user") !== (request.kind === "work"))
      throw new Error(
        `Only the command for another user on ${HERE.this} adds one that only runs work.`,
      );
    // A Linux home that cannot send itself still makes it: a Linux computer
    // with Infinitary installed joins with that copy, and any other says
    // this computer has nothing to send it (docs/devices.md, "Joining by a command").
    if (
      request.command === "another-mac" &&
      !farBuilds.canSendAny() &&
      !(packaged && host.app.platform !== "darwin")
    )
      throw new Error(
        `This copy of Infinitary cannot send itself to another ${COMPUTER.one}; only an installed one can.`,
      );
    // A command for another Mac downloads this computer's published version
    // there first, looked up without downloading it here, and its link lasts
    // long enough for that download and the copy from here it falls back to
    // (docs/devices.md, "Joining by a command"); a development or
    // unpublished one gets it from here, with a link of the usual lifetime.
    const mac = farSystemNamed("macos");
    const [download, ubuntuPackage] =
      request.command === "another-mac" && mac
        ? await Promise.all([
            farBuilds.downloadFor(mac, Object.values(mac.chips)[0] ?? "arm64"),
            farBuilds.ubuntuPackageDownload(),
          ])
        : [null, null];
    const invite = devices.invite(
      request,
      download ? { lastsMs: DOWNLOAD_COMMAND_LINK_TTL_MS } : {},
    );
    if (!request.command) return invite;
    return {
      ...invite,
      command: {
        for: request.command,
        text: joinCommand({
          for: request.command,
          link: invite.link,
          homeName: await ownComputerName({ packaged, env: process.env }),
          launcher,
          // Another user on a Windows PC runs their own Infinitary from PowerShell.
          ...(hostPlatform() === "win32"
            ? { windows: { localAppData: process.env.LOCALAPPDATA ?? "" } }
            : {}),
          ...(download ? { download: { ...download, expiresAt: invite.expiresAt } } : {}),
          version: host.app.version,
          // The one line that updates an older Ubuntu package there (captain's pick on INF-1181).
          ...(ubuntuPackage
            ? {
                update:
                  linuxUpdateCommand({ chip: "x64", package: "deb" }, ubuntuPackage) ?? undefined,
              }
            : {}),
        }),
      },
    };
  };
  // The captain's own SSH, or a development run's stand-in for it, so a test
  // never reaches a real Mac (docs/devices.md, "Adding a computer by its address").
  const ssh = standIns.ssh ? { program: standIns.ssh, args: [] } : systemSsh();
  // Nothing here starts it: the shell does, once it attached the paired
  // connection.
  const sshConnections: SshConnections = new SshConnections({
    pairing: devices,
    ssh,
    flavor,
    listening: () => workDevices.listening(),
    settled: () => workDevices.settled(),
    // Welcomed on any version: connected, though it may take no new work.
    welcomed: (deviceId) =>
      workDevices.inReach(deviceId) || workDevices.version(deviceId) !== undefined,
    onWorkDevice: (listener) => workDevices.onWorkDevice(listener),
    cleanUpThere: (cleanup) => remoteLogin.cleanUpThere(cleanup),
    emit: (event) => broadcastEvent(event),
    changed: () => devicesChanged(),
  });
  const reachOf = (deviceId: string) =>
    reachFrom({
      inReach: workDevices.inReach(deviceId),
      ssh: sshConnections.state(deviceId),
    });
  const remoteLogin: RemoteLogin = new RemoteLogin({
    pairing: devices,
    ssh,
    flavor,
    appBundle: () => appBundle,
    builds: farBuilds,
    version: host.app.version,
    listening: () => workDevices.settled(),
    inReach: (deviceId) => workDevices.inReach(deviceId),
    connections: sshConnections,
    emit: (event) => broadcastEvent(event),
  });
  const thisUser = () => {
    try {
      return userInfo().username;
    } catch {
      return "";
    }
  };
  // Macs nearby: macOS's own dns-sd, or a development run's stand-in for
  // it, so a test never listens on the Mac's own network (docs/devices.md,
  // "Macs nearby"). Linux looks with Avahi's avahi-browse where it has one,
  // and Windows with its own network browsing, asked as dns-sd is.
  const dnsSd = standIns.dnsSd || (hostPlatform() === "darwin" ? SYSTEM_DNS_SD : undefined);
  const avahiBrowse =
    !dnsSd && hostPlatform() === "linux" ? findOnPath("avahi-browse", hostEnv()) : undefined;
  const nearbyMacs = new NearbyMacs({
    run: dnsSd ? runDnsSd(dnsSd) : hostPlatform() === "win32" ? runWindowsDnsSd() : null,
    avahi: avahiBrowse ? runDnsSd(avahiBrowse) : null,
    ownNames: () => ownNetworkNames(),
    user: thisUser(),
    changed: (view) => emit("inf:devices:nearby", view),
  });
  // While a device that dials this computer at an address is on the list,
  // this computer announces itself over Bonjour so that device can find it
  // again (docs/devices.md, "Announcing to devices"): with dns-sd, on Linux
  // with Avahi's avahi-publish where it has one, and on Windows with Windows'
  // own announcement (./windowsAnnounce.ts).
  const avahiPublish =
    !dnsSd && hostPlatform() === "linux" ? findOnPath("avahi-publish", hostEnv()) : undefined;
  const announcer = dnsSd || avahiPublish;
  const windowsAnnounces = !dnsSd && hostPlatform() === "win32";
  const homeAnnouncement = new HomeAnnouncement({
    run: announcer ? runDnsSdHeld(announcer) : windowsAnnounces ? runWindowsAnnouncement() : null,
    args: dnsSd ? dnsSdAnnounceArgs : windowsAnnounces ? windowsAnnounceArgs : avahiAnnounceArgs,
    name: () => ownComputerName({ packaged, env: process.env }),
    port: devices.port,
  });
  const announceFor = () =>
    homeAnnouncement.devicesChanged(
      devices.list(),
      devices.phoneMayJoin(),
      new Set(devices.sshConnections().map((each) => each.deviceId)),
    );
  announceFor();
  devices.subscribe(announceFor);
  // A phone signed in to this computer over SSH asks the open app for a
  // one-use phone link at its door (docs/devices.md, "A phone that joins by
  // its address"); with no door, the phone says so and nothing joins. This
  // account's own `infinitary link` asks the same door for a computer's link
  // or a phone's (docs/run.md, "A link by command"). Each is answered once
  // the connection listens for it, as a computer added by its address is.
  const phoneDoor = await PhoneDoor.open({
    dir: paths.phoneDoorDir,
    invite: (phone) => devices.invite({ kind: "mac", ...(phone ? { phone } : {}) }),
    listening: () => workDevices.settled(),
  }).catch((error: unknown) => {
    console.warn(
      `[devices] no phone door, so a phone cannot join by its address: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  });
  // The privacy watch: macOS's own log reader, or a development run's
  // stand-in for it, so a test never reads this Mac's own privacy log
  // (docs/macos-privacy.md). It finds a task by the working copy its
  // process works in, among the live tasks this Mac runs.
  const privacyLog = standIns.privacyLog || (hostPlatform() === "darwin" ? SYSTEM_LOG : undefined);
  const privacyWatch = privacyLog
    ? new AppDataWatch({
        run: runPrivacyLog(privacyLog),
        self: process.pid,
        findTask: (pid) =>
          taskOfProcess(pid, {
            reader: systemProcessReader,
            self: process.pid,
            places: tasks
              .list()
              .filter(
                (record) =>
                  record.status === "active" &&
                  !record.deviceId &&
                  record.workspaceState === "present" &&
                  Boolean(record.worktreeDir),
              )
              .map((record) => ({ taskId: record.id, dir: record.worktreeDir })),
          }),
        note: (taskId, text, facts) => tasks.noteProgress(taskId, text, "host", undefined, facts),
      })
    : null;
  privacyWatch?.start();
  // Each computer that runs work signing in to its own subscriptions: what
  // Settings -> Intelligence draws, and what a task there is routed among.
  const deviceSignIns = new DeviceSignIns({
    devices: () => devices.list(),
    work: workDevices,
    emit,
    broadcastEvent,
    changed: (deviceId) => onDeviceSignIns(deviceId),
    unanswered: (deviceId) => deviceSetup?.refresh(deviceId),
    protectedIds: options.protectedIds,
    reachOf,
  });
  return {
    work: workDevices,
    loadLine,
    computerResources,
    computerLoads,
    pairing: devices,
    computerResourceFeed,
    appBundle,
    farBuild,
    inviteDevice,
    sshConnections,
    reachOf,
    remoteLogin,
    nearbyMacs,
    homeAnnouncement,
    ...(phoneDoor ? { phoneDoor } : {}),
    privacyWatch,
    signIns: deviceSignIns,
    takesNoWorkUntilUpdated: (deviceId) => computers?.takesNoWorkUntilUpdated(deviceId) === true,
    recallUpdateCard: (deviceId) => updateNudge?.refresh(deviceId, true),
    attachPressure: (observe) => {
      observePressure = observe;
    },
    attachSignIns: (changed) => {
      onDeviceSignIns = changed;
    },
    attachCrew: ({ supervisor, placed, repos, ticker }) => {
      // Your devices, and Remove for a computer that runs work (docs/devices.md).
      const list = new Computers({
        pairing: devices,
        work: workDevices,
        tasks,
        repos,
        stopTasks: (deviceId) => supervisor.sessions.stopTasksOn(deviceId),
        runsOnMoved: (taskId) => supervisor.placement.runsOnChanged(taskId),
        bringHome: (deviceId) => placed.bringHome(deviceId),
        // Carry its tasks on (docs/devices.md, "Joined again"): the captain's
        // move off a computer out of reach, leaving behind what only it holds.
        carryTask: (taskId, to) =>
          supervisor.moves.requestComputerMove(taskId, to, "captain", [], true),
        // Its crew pauses for its update and carries on after (docs/helper.md,
        // "Updated by its home"); one that saves its own work stops each turn
        // there where nothing is lost ("Saving its work before an update").
        pauseTasks: (deviceId, pause) => {
          const there = saveThereFor(workDevices, deviceId);
          return supervisor.updates.pauseForUpdate(deviceId, {
            ...pause,
            ...(there ? { there } : {}),
          });
        },
        resumeTasks: (deviceId) => supervisor.updates.resumeAfterUpdate(deviceId),
        resumingTasks: (deviceId) => supervisor.updates.resumingOn(deviceId),
        removeThere: (device) => remoteLogin.removeThere(device),
        // Update: a computer's version against this Mac's, over Remote Login or
        // the connection (docs/devices.md, "Updating"). A run from source on
        // the person's own data names no release, so only contracts compare.
        home: {
          ...(host.app.sourceOnOwnData ? {} : { app: host.app.version }),
          contract: PROTOCOL_VERSION,
          // A run `pnpm dev`'s starter started is matched by its commit (docs/devices.md, "Matching the home's build").
          ...(options.homeBuild ? { build: options.homeBuild } : {}),
        },
        updateOverRemoteLogin: (deviceId, update) => remoteLogin.update(deviceId, update),
        // Whether this computer has a Firstmate for that computer's system, and
        // that one got and checked before it is asked to update.
        canSend: (device) => {
          const far = farSystemNamed(device.system);
          const chip = far ? (device.chip ?? Object.values(far.chips)[0]) : undefined;
          return far !== null && chip !== undefined && farBuilds.canSend(far, chip);
        },
        prepare: async (device) => {
          const far = farSystemNamed(device.system);
          const chip = far ? (device.chip ?? Object.values(far.chips)[0]) : undefined;
          if (!far || !chip || !farBuilds.fetches(far, chip)) return null;
          const build = await farBuilds.for(far, chip);
          return "refusal" in build ? build.refusal : null;
        },
        // Where a Mac updated over the connection downloads this computer's
        // version itself, looked up without downloading it here
        // (docs/devices.md, "Downloading over the connection").
        download: async (device) => {
          const far = farSystemNamed(device.system);
          const chip = far ? (device.chip ?? Object.values(far.chips)[0]) : undefined;
          return far && chip ? farBuilds.downloadFor(far, chip) : null;
        },
        emitUpdate: (event) => {
          broadcastEvent(event);
          updateNudge?.updateSaid(event);
        },
        ssh: (deviceId) => sshConnections.state(deviceId),
        reachOf,
        emit: (view) => {
          emit("inf:devices", view);
          updateNudge?.appsChanged(view);
          emit("inf:computers:presence", computerPresenceOf(view));
          deviceSignIns.reachChanged(view);
          deviceSetup?.reachChanged(view);
        },
        onProblem: (line) =>
          broadcastEvent({
            type: "firstmate_note",
            ...(typeof line === "string" ? { text: line } : saidLine(line)),
          }),
        now: ticker.now,
        bootedAt,
      });
      computers = list;
      devicesChanged = () => {
        // Task rows say connecting by the same reach: they follow it at once.
        options.scheduleWorkPresentation();
        list.refresh();
      };
      // The connecting limit is read when reach is read. The host clock asks
      // whether that read moved, and pushes only then.
      ticker.register("device-reach", TICK_PERIOD_MS, () => {
        if (sshConnections.due()) devicesChanged();
      });
      // Its work comes here first, or once it is back, as Remove's would.
      leaveWithWork = (device) => {
        list.remove(device.id, "when-back").catch((error: unknown) =>
          broadcastEvent({
            type: "firstmate_note",
            text: `${device.name} left, and its removal could not finish: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
        return true;
      };
      // Finishing a computer's setup (docs/devices.md, "Finishing its setup"):
      // the host's own card at join, from typed facts, and the GitHub card a
      // project raises when it runs on a computer with no GitHub sign-in.
      const setup = new DeviceSetup({
        devices: () => list.list(),
        repos,
        signIns: {
          lastSaid: (deviceId) => deviceSignIns.lastSaid(deviceId),
          didNotAnswer: (deviceId) => deviceSignIns.didNotAnswer(deviceId),
          signInsOf: (deviceId) => deviceSignIns.signInsOf(deviceId),
        },
        cards: {
          raise: (card) => supervisor.cards.hostCards.raiseHostCard(card),
          withdraw: (id, reason) => supervisor.cards.hostCards.withdrawHostCard(id, reason),
          has: (id) => supervisor.cards.has(id),
          stored: (id) => supervisor.cards.stored(id),
          chosenAction: (id) => supervisor.cards.chosenAction(id),
        },
        broadcastEvent,
        forgeNeeded: (deviceId, forgeHost, repo) =>
          supervisor.placement.projectForgeSignInNeeded(deviceId, forgeHost, repo),
        forgeReady: (deviceId, forgeHost) =>
          void supervisor.placement
            .resumeDeviceForgeSignInTasks(deviceId, forgeHost)
            .catch((caught: unknown) => {
              console.warn("[crew] a held task's start after a computer's sign-in failed:", caught);
            }),
      });
      deviceSetup = setup;
      repos.onRunsOn((repo) => setup.runsOnChanged(repo));
      workDevices.onWorkDevice((contact) => setup.contact(contact));
      // A computer on an older Firstmate is updated by itself, and the card
      // asks the captain only for what this Mac cannot do alone
      // (docs/devices.md, "Updating by itself").
      const nudge = new DeviceUpdateNudge({
        devices: () => list.list(),
        homeApp: () => (host.app.sourceOnOwnData ? undefined : host.app.version),
        failedHere: (deviceId) => list.failedHere(deviceId),
        sourceAllowed: (deviceId) => list.sourceAllowed(deviceId),
        update: (deviceId) => list.update(deviceId),
        cards: {
          raise: (card) => supervisor.cards.hostCards.raiseHostCard(card),
          withdraw: (id, reason) => supervisor.cards.hostCards.withdrawHostCard(id, reason),
          has: (id) => supervisor.cards.has(id),
          chosenAction: (id) => supervisor.cards.chosenAction(id),
        },
        broadcastEvent,
      });
      updateNudge = nudge;
      // Every version a computer reports reaches this listener, one the
      // connection welcomed before it attached too (`WorkDevices.attach`
      // replays it), since the connection attaches only after the crew.
      workDevices.onVersion((deviceId, version) => {
        if (version) supervisor.observeRequiredActionDevice(deviceId, version);
        // A hold waiting for this computer's app update ends once it is installed (INF-5578).
        if (version?.app) supervisor.holdRules.appRan(deviceId, version.app);
        nudge.refresh(deviceId);
      });
      devices.subscribe(() => {
        setup.devicesChanged();
        nudge.devicesChanged();
      });
      // Where devices find this Mac, whole, whenever it reads differently - the
      // captain's choice, or this Mac's network while pairing follows it - so
      // Settings -> Devices says where this Mac is now with the tab open.
      let addressesSaid = JSON.stringify(devices.addresses());
      devices.subscribe(() => {
        const addresses = devices.addresses();
        const said = JSON.stringify(addresses);
        if (said === addressesSaid) return;
        addressesSaid = said;
        emit("inf:devices:addresses", addresses);
      });
      return { computers: list, setup };
    },
  };
}
