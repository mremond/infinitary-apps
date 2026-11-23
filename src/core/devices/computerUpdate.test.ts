import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Spelling, workLabelOf } from "@shared/codeNames";
import {
  PLACED_WORK_SINCE,
  WORK_DOWNLOAD_SINCE,
  WORK_UPDATE_SINCE,
} from "@shared/contractFeatures";
import { type DeviceView, deviceLabel } from "@shared/devices";
import {
  DEVICE_UPDATE_ACTIONS,
  deviceUpdateActionId,
  deviceUpdateCardId,
} from "@shared/deviceUpdateNudge";
import { PROTOCOL_VERSION } from "@shared/ipc";
import { remoteLoginWords } from "@shared/remoteLogin";
import type { UpdateDownload } from "@shared/work";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimedPort } from "../../../tests/helpers/claimedPort";
import { deferred } from "../../../tests/helpers/deferred";
import { macRelease } from "../../../tests/helpers/macRelease";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { forwardSocket } from "../../../tests/helpers/socketForward";
import { startConnection, type WorkDeviceVersion } from "../connection/connection";
import type { CoreDispatch } from "../dispatcher";
import { CoreEventBus } from "../events";
import {
  type BackgroundContext,
  launchctlAt,
  readInstalled,
  startInBackground,
  writeInstalled,
} from "../helper/background";
import { fetchedLauncher, joinHome, keepApp } from "../helper/join";
import { HomeRoute } from "../helper/route";
import { type HelperRun, type StartHelperOptions, startHelper } from "../helper/run";
import { updateHere } from "../helper/update";
import { setAsidePath } from "../helper/updateTrial";
import { helperWords } from "../helper/words";
import { WorkDevices } from "../placed/workDevices";
import * as platform from "../platform";
import { openDatabase } from "../storage/db";
import { TaskService } from "../tasks/taskService";
import { RepoRegistry } from "../workspace/repoRegistry";
import { Computers, type DeviceUpdateEvent } from "./computers";
import { DeviceUpdateNudge } from "./deviceUpdateNudge";
import { claimLink, HomeRouteMissingError } from "./dial";
import { JoinedHome } from "./joinedHome";
import { DevicePairing } from "./pairing";
import { RemoteLoginRefusedError } from "./remoteLogin";

/**
 * Updating Firstmate on a computer that runs work over the connection
 * (docs/devices.md, "Another version" and "Updating over the connection"),
 * end to end from the home's side: the real pairing and connection, the
 * home's list and Update (`Computers`) over a real task record, and on the
 * other side the work mode's own run (`startHelper`), which gets the home's
 * Firstmate at `/firstmate` with its own key, unpacks it with the Mac's own
 * tar and keeps it. The background that starts a run again is this test:
 * once a run ends updated, it starts the next one, as launchd would.
 */

// Integration budget (docs/test-cohorts.md): real TLS on loopback and the
// Mac's own tar, the slowest case 0.47 s at its fastest of three runs on an
// Apple silicon Mac; on a Mac, a download from a local HTTPS release with
// curl, shasum, ditto and a stand-in codesign, the slowest 3.7 s (a paced
// download, and one that stalls for its two seconds). A poll waits for a
// computer that crosses the connection and starts again, so it waits for the
// rest of the test's budget (tests/helpers/waitWindow.ts).
vi.setConfig({ testTimeout: 10_000 });

/** This Mac's version of Firstmate in these tests. */
const HOME_APP = "0.1.29";
const BUILDER = { name: "builder", uid: 502 };

/**
 * A stand-in bundle whose marker says whose copy it is, named as the app it
 * stands in for, whose program exits at once, as a copy that does not start does.
 */
function bundle(marker: string, name = "Firstmate 3000"): string {
  const app = join(scratchDir("infinitary-update-bundle-"), `${name}.app`);
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(app, "Contents", "Resources"), { recursive: true });
  writeFileSync(join(app, "Contents", "MacOS", name), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  writeFileSync(join(app, "Contents", "Resources", "marker"), `${marker}\n`);
  return app;
}

/** A contract on the home's major, one minor before a computer took the update order. */
function beforeUpdates(): string {
  const [major, minor] = WORK_UPDATE_SINCE.split(".").map(Number);
  return `${major}.${(minor ?? 1) - 1}.0`;
}

/** A contract one minor before a computer could hold a conversation: it takes no work. */
function beforePlacedWork(): string {
  const [major, minor] = PLACED_WORK_SINCE.split(".").map(Number);
  return `${major}.${(minor ?? 1) - 1}.0`;
}

const stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) await stop();
});

/**
 * A home and a computer joined to it as another user on this Mac. `kept` is
 * the copy of Firstmate kept there, as a command keeps one, or none, as for
 * another user running this Mac's own app; `background` whether a background
 * is set up there to start its run again.
 */
async function world(
  options: {
    app?: string | null;
    kept?: boolean;
    background?: boolean;
    waitMs?: number;
    updateByAddress?: NonNullable<
      ConstructorParameters<typeof Computers>[0]["updateOverRemoteLogin"]
    >;
    /** Added by its address over Remote Login, which `RemoteLogin` updates. */
    remoteLogin?: string;
    /** The spelling of channel names the home writes: Infinitary's, standing in a home that moved to it. */
    speaks?: Spelling;
    /** Its work folder is in Firstmate 3000's data folder, as an installed app keeps it, not one a test named. */
    inDataFolder?: boolean;
    /** It joined from another Mac, as a command run there joins, so this Mac does not run its app. */
    fromAnotherMac?: boolean;
    /** Where this Mac's version is published for a Mac to download itself; none for an unpublished one. */
    download?: UpdateDownload;
    /** Its update over Remote Login asks the password of the account there first, as an Ubuntu install does. */
    asksPassword?: boolean;
    /**
     * The home's update nudge, wired as the home wires it: it hears each
     * version and each update step, and updates the computer by itself or
     * raises its card (docs/devices.md, "Updating by itself").
     */
    nudge?: boolean;
    /** What getting this Mac's Firstmate for that computer's system answers before it is asked. */
    prepare?: NonNullable<ConstructorParameters<typeof Computers>[0]["prepare"]>;
  } = {},
) {
  const userData = scratchDir("infinitary-update-home-");
  const pairing = new DevicePairing({
    dir: join(userData, "devices"),
    onProblem: () => {},
    interfaces: () => ({}),
    ownUid: 501,
    ...(options.fromAnotherMac ? { joinsFromAnotherMac: true } : {}),
  });
  stops.push(() => pairing.dispose());
  const db = openDatabase(userData);
  stops.push(() => {
    db.close();
  });
  const tasks = new TaskService({ db, now: Date.now });
  const repos = new RepoRegistry(db, join(userData, "fleet"));
  const work = new WorkDevices();
  const port = await claimedPort();
  const homeApp = options.app === undefined ? bundle("the home's own copy") : options.app;
  const listen = () =>
    startConnection({
      dispatch: (async (channel: string) => {
        throw new Error(`Rejected ${channel}`);
      }) as CoreDispatch,
      events: new CoreEventBus(),
      devices: pairing,
      port,
      name: () => "MacBook Pro",
      app: () => homeApp,
      ...(options.speaks ? { speaks: options.speaks } : {}),
    });
  let connection = listen();
  stops.push(() => connection.close());
  // Detached first, so nothing the closing connection says reaches the record.
  let detach = work.attach(connection);
  stops.push(() => detach());
  const said: DeviceUpdateEvent[] = [];
  const overRemoteLogin: string[] = [];
  const pushed: DeviceView[][] = [];
  /** The computer's crew, paused and carried on around its update, in order. */
  const crew: string[] = [];
  let nudge: DeviceUpdateNudge | undefined;
  const computers = new Computers({
    pairing,
    work,
    tasks,
    repos,
    stopTasks: async () => {},
    bringHome: async () => {},
    pauseTasks: async (deviceId) => {
      crew.push(`paused ${deviceId}`);
    },
    resumeTasks: (deviceId) => {
      crew.push(`resumed ${deviceId}`);
    },
    home: { app: HOME_APP, contract: PROTOCOL_VERSION },
    canSend: () => homeApp !== null,
    download: async () => options.download ?? null,
    ...(options.prepare ? { prepare: options.prepare } : {}),
    // Every count is said and asked for at once, so a short download shows some.
    countEveryMs: 50,
    emitUpdate: (event) => {
      said.push(event);
      nudge?.updateSaid(event);
    },
    updateWaitMs: options.waitMs ?? 5_000,
    // Remote Login's own update is RemoteLogin's (remoteLoginUpdate.test.ts); this
    // records that the list hands it a Mac added by its address, which goes
    // ahead there, pausing its crew, as RemoteLogin does once nothing refused.
    updateOverRemoteLogin:
      options.updateByAddress ??
      (async (deviceId, asked) => {
        overRemoteLogin.push(deviceId);
        if (options.asksPassword && !asked?.password)
          return { asks: "password", address: options.remoteLogin ?? "", for: "update", deviceId };
        await asked?.pause?.();
        return pairing.list().find((device) => device.id === deviceId) as DeviceView;
      }),
    emit: (list) => pushed.push(list),
    onProblem: () => {},
    now: Date.now,
    bootedAt: () => 0,
  });
  /** What the nudge did: each update it started, each card it raised, and what the captain chose. */
  const nudged = {
    updates: [] as string[],
    raised: [] as { id: string; body: string }[],
    standing: new Set<string>(),
    chosen: new Map<string, string>(),
  };
  if (options.nudge) {
    nudge = new DeviceUpdateNudge({
      devices: () => computers.list(),
      homeApp: () => HOME_APP,
      failedHere: (deviceId) => computers.failedHere(deviceId),
      update: (deviceId) => {
        nudged.updates.push(deviceId);
        return computers.update(deviceId);
      },
      cards: {
        raise: (card) => {
          nudged.standing.add(card.id);
          nudged.raised.push({ id: card.id, body: card.body });
        },
        withdraw: (id) => void nudged.standing.delete(id),
        has: (id) => nudged.standing.has(id),
        chosenAction: (id) => nudged.chosen.get(id),
      },
      broadcastEvent: () => undefined,
    });
    // After the list's own, as the home hears each version.
    work.onVersion((deviceId) => nudge?.refresh(deviceId));
  }

  const { link } = pairing.invite(
    { kind: "work", at: `127.0.0.1:${port}` },
    options.remoteLogin ? { remoteLogin: options.remoteLogin } : {},
  );
  await connection.settled();
  const appData = scratchDir("infinitary-update-computer-");
  const dataDir = options.inDataFolder ? join(appData, "firstmate-3000", "work") : appData;
  const joined = await joinHome({
    text: link,
    dataDir,
    io: { say: () => {}, ask: async () => "yes" },
    device: { name: "Mac mini", user: BUILDER },
    timeoutMs: 2_000,
  });
  if (!joined.ok) throw new Error(joined.reason);
  const deviceId = joined.grant.deviceId;
  // The join dialed once to hear the home's name; that connection goes.
  await expect
    .poll(() => computers.list().find((device) => device.id === deviceId)?.inReach)
    .toBe(false);
  // What the join set up there: the copy it kept, and the background.
  const app = options.kept ? keepApp(bundle("the copy it kept"), dataDir) : null;
  writeInstalled(dataDir, {
    service:
      options.background === false
        ? null
        : { label: "com.kunchenguid.firstmate3000.dev.work", file: join(dataDir, "agent.plist") },
    app,
  });

  const lines: string[] = [];
  let run: HelperRun | undefined;
  /** The one-time move's own: a Mac's copier, and Claude's records in a folder of the test's. */
  const moveDeps = {
    platform: process.platform,
    claudeConfigDir: scratchDir("infinitary-update-claude-"),
    hostname: "builder-mac",
  };
  /**
   * The computer's run starts, speaking these versions, with its background
   * when one is given, from its work folder or the one named.
   */
  const start = (
    versions: Pick<
      StartHelperOptions,
      | "protocolVersion"
      | "appVersion"
      | "verifier"
      | "downloadIdleSeconds"
      | "update"
      | "trialSeconds"
      | "sourceRun"
      | "build"
    >,
    background?: BackgroundContext,
    from: string = dataDir,
  ) => {
    const started = startHelper({
      dataDir: from,
      say: (said) => lines.push(...said),
      retryMs: [20],
      log: () => {},
      moveDeps,
      ...versions,
      ...(background ? { background: { context: background, env: {} } } : {}),
    });
    if (!started.ok) throw new Error(started.reason);
    run = started.run;
    return started.run;
  };
  stops.push(() => run?.stop());
  const view = () => computers.list().find((device) => device.id === deviceId);
  return {
    computers,
    deviceId,
    appData,
    dataDir,
    overRemoteLogin,
    crew,
    lines,
    said,
    pushed,
    start,
    view,
    /** What the copy kept there says it is, or null when none is kept. */
    kept: () =>
      app && existsSync(app)
        ? readFileSync(join(app, "Contents", "Resources", "marker"), "utf8").trim()
        : null,
    feed: () => said.map((event) => event.text),
    nudge,
    nudged,
    /** The home's own connection, which asks the computer its orders. */
    work,
    pairing,
    /** The connection drops under every computer and this Mac listens again at once, as on a flaky network. */
    drop: async () => {
      detach();
      await connection.close();
      connection = listen();
      detach = work.attach(connection);
      await connection.settled();
    },
  };
}

describe("a computer that runs work on another version of Firstmate", () => {
  it("says so on the list while it is connected, older or newer, and whether it still takes work", async () => {
    const at = await world();
    expect(at.view()?.otherVersion).toBeUndefined();

    const older = at.start({ appVersion: "0.1.20" });
    await expect
      .poll(() => at.view()?.otherVersion)
      .toEqual({
        app: "0.1.20",
        than: "older",
        takesWork: true,
        updateBy: "connection",
      });
    expect(at.view()).toMatchObject({ inReach: true });
    expect(at.pushed.at(-1)?.[0]?.otherVersion).toMatchObject({ app: "0.1.20" });
    await older.stop();
    // Out of reach, this Mac cannot tell its version.
    await expect.poll(() => at.view()?.otherVersion).toBeUndefined();
    expect(at.view()).toMatchObject({ inReach: false });

    // Too old to hold work or take the update order: in reach, and it says so.
    const tooOld = at.start({ protocolVersion: beforePlacedWork(), appVersion: "0.1.12" });
    await expect
      .poll(() => at.view()?.otherVersion)
      .toEqual({
        app: "0.1.12",
        than: "older",
        takesWork: false,
        updateBy: "command",
      });
    expect(at.view()).toMatchObject({ inReach: false });
    expect(at.view()?.seenAt).toBeGreaterThan(0);
    await tooOld.stop();

    // Newer than this Mac's; and on this Mac's own version it says nothing.
    await expect.poll(() => at.view()?.otherVersion).toBeUndefined();
    const newer = at.start({ appVersion: "0.1.31" });
    await expect.poll(() => at.view()?.otherVersion?.than).toBe("newer");
    await newer.stop();
    await expect.poll(() => at.view()?.inReach).toBe(false);
    at.start({ appVersion: HOME_APP });
    await expect.poll(() => at.view()?.inReach).toBe(true);
    expect(at.view()?.otherVersion).toBeUndefined();
  });

  it("is updated over the connection: it gets this Mac's Firstmate with its own key, keeps it, and starts again on this Mac's version", async () => {
    const at = await world({ kept: true });
    const before = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");

    const updating = at.computers.update(at.deviceId);
    // It kept this Mac's copy in place of its own, then its run ended.
    expect(await before.ended).toBe("updated");
    expect(at.kept()).toBe("the home's own copy");
    // Its crew paused before its run ended, and waits for it to be back (INF-721 friction 9).
    expect(at.crew).toEqual([`paused ${at.deviceId}`]);
    expect(at.lines).toEqual(
      expect.arrayContaining(helperWords.updated({ thisMac: true, host: "127.0.0.1" }, null, true)),
    );
    // Its background starts it again, on this Mac's version.
    at.start({ appVersion: HOME_APP });
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");
    expect(updated).toMatchObject({ id: at.deviceId, inReach: true });
    expect(updated.otherVersion).toBeUndefined();
    expect(at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
    const builder = { name: "Mac mini", user: "builder", onThisMac: true };
    const label = deviceLabel(builder);
    // What this Mac sent it is counted as it goes, in one line rewritten in place.
    const sent = at.said.filter((event) => event.copy?.state === "sending");
    expect(sent.length).toBeGreaterThan(0);
    expect(new Set(sent.map((event) => event.run?.id)).size).toBe(1);
    expect(sent.at(-1)?.text).toBe(
      remoteLoginWords.sendingRow(label, sent.at(-1)?.copy?.sent ?? 0),
    );
    expect(sent.at(-1)?.copy?.sent).toBeGreaterThan(0);
    expect(at.said.filter((event) => !sent.includes(event)).map((event) => event.text)).toEqual([
      remoteLoginWords.updating(builder),
      remoteLoginWords.starting(label),
      remoteLoginWords.updated(builder, "running"),
    ]);
    // Nothing of the copy it got is left beside the one it kept.
    expect(readdirSync(at.dataDir).filter((entry) => entry.startsWith("update-"))).toEqual([]);
  });

  // INF-3307 audit: a stop during a work computer's update can leave its temporary folder behind.
  it("stopped while it gets this Mac's Firstmate, lets the copy go and leaves no temporary folder beside its work (INF-3307 audit)", async () => {
    const at = await world({ kept: true });
    let reached!: () => void;
    const getting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const before = at.start({
      appVersion: "0.1.20",
      // As `updateHere` gets the copy: into a folder of its own beside the
      // work, taken away whatever happens, from a home that never finishes
      // sending it; only a stop ends it.
      update: async (_grant, signal) => {
        const into = mkdtempSync(join(at.dataDir, "update-"));
        try {
          reached();
          await new Promise((_, reject) => {
            signal?.addEventListener("abort", () => reject(new Error("stopped")), { once: true });
          });
          throw new Error("unreachable");
        } finally {
          rmSync(into, { recursive: true, force: true });
        }
      },
    });
    await expect.poll(() => at.view()?.inReach).toBe(true);
    const asked = at.work.ask(at.deviceId, "fm:firstmate:update", [], { anyVersion: true });
    asked.catch(() => undefined);
    await getting;

    await before.stop();
    expect(await before.ended).toBe("stopped");
    expect(readdirSync(at.dataDir).filter((entry) => entry.startsWith("update-"))).toEqual([]);
    // Nothing was kept: the copy it had stays.
    expect(at.kept()).toBe("the copy it kept");
  });

  it("running this Mac's own app, gets nothing and starts again", async () => {
    const at = await world({ app: null });
    const before = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.view()?.otherVersion).toBeDefined();
    const updating = at.computers.update(at.deviceId);
    expect(await before.ended).toBe("updated");
    expect(existsSync(join(at.dataDir, "app"))).toBe(false);
    at.start({ appVersion: HOME_APP });
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");
    expect(updated.otherVersion).toBeUndefined();
  });

  // INF-1752, the captain's "Keep a copy" for every Mac that joined by its
  // link: its agent starts the Mac's own installed app, so an update that got
  // nothing came back on the old version.
  it("joined by its link on another Mac, keeps this Mac's copy as its first, starts its agent from it and comes back on this Mac's version", async () => {
    // The portable launchd fixture must take the first-copy path on Linux CI too.
    const runnerPlatform = vi.spyOn(platform, "hostPlatform").mockReturnValue("linux");
    stops.push(() => {
      runnerPlatform.mockRestore();
    });
    const at = await world({ fromAnotherMac: true });
    const asked: string[][] = [];
    const context: BackgroundContext = {
      flavor: "release",
      dataDir: at.dataDir,
      homeDir: scratchDir("infinitary-update-agents-"),
      uid: 502,
      launchctl: async (args) => {
        asked.push([...args]);
        return { ok: true, output: "" };
      },
    };
    // What the window's join set up there: an agent that starts the Mac's own app.
    const installedApp = bundle("the Mac's own app");
    const ownLauncher = fetchedLauncher(installedApp);
    if (!ownLauncher) throw new Error("no launcher");
    await startInBackground(
      { ...context, spelling: "fm" },
      { launcher: ownLauncher, env: {}, app: null },
    );
    const service = readInstalled(at.dataDir).service;
    if (!service) throw new Error("no agent");

    const before = at.start({ appVersion: "0.1.20" }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    asked.length = 0;
    const updating = at.computers.update(at.deviceId);
    expect(await before.ended).toBe("updated");

    // This Mac's copy is kept in its work folder, and its agent starts it from now on.
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    expect(readInstalled(at.dataDir)).toEqual({ service, app: kept });
    expect(readFileSync(join(kept, "Contents", "Resources", "marker"), "utf8").trim()).toBe(
      "the home's own copy",
    );
    const agent = readFileSync(service.file, "utf8");
    expect(agent).toContain(
      `<string>${join(kept, "Contents", "MacOS", "Firstmate 3000")}</string>`,
    );
    expect(agent).not.toContain(ownLauncher.executable);
    // launchd read the agent anew once the run let the folder go.
    expect(asked).toEqual([
      ["bootout", `gui/502/${service.label}`],
      ["bootstrap", "gui/502", service.file],
    ]);
    // The Mac's own app is left as it was.
    expect(readFileSync(join(installedApp, "Contents", "Resources", "marker"), "utf8").trim()).toBe(
      "the Mac's own app",
    );

    // The agent starts the kept copy, on this Mac's version, within the wait.
    at.start({ appVersion: HOME_APP }, context);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");
    expect(updated.otherVersion).toBeUndefined();
    const builder = { name: "Mac mini", user: "builder", onThisMac: false };
    expect(at.feed().at(-1)).toBe(remoteLoginWords.updated(builder, "running"));
  });

  it("reports an old-version return without claiming the update installed", async () => {
    const at = await world({ waitMs: 500 });
    const oldApp = "0.1.20";
    const worker = at.start({ appVersion: oldApp });
    await expect.poll(() => worker.state().contact).toBe("in-reach");
    const updating = at.computers.update(at.deviceId);
    expect(await worker.ended).toBe("updated");
    const returned = at.start({ appVersion: oldApp });
    await expect.poll(() => returned.state().contact).toBe("in-reach");
    expect(await updating).toHaveProperty("otherVersion.app", oldApp);
    expect(at.said.at(-1)).toMatchObject({
      tone: "warn",
      text: remoteLoginWords.stillOnVersion(
        { name: "Mac mini", user: "builder", onThisMac: true },
        oldApp,
      ),
    });
  });

  it("offers package fallback only after a legacy Linux worker restarts unchanged without a copy", async () => {
    const at = await world({ fromAnotherMac: true, waitMs: 60_000 });
    const old = at.start({ appVersion: "0.1.20", update: async () => ({ restarts: true }) });
    await expect.poll(() => old.state().contact).toBe("in-reach");
    at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
    const updating = at.computers.update(at.deviceId, { packageFallback: true });
    expect(await old.ended).toBe("updated");
    await expect.poll(() => at.work.version(at.deviceId)).toBeUndefined();
    const returned = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => returned.state().contact).toBe("in-reach");
    expect(await updating).toEqual({ asks: "package-address" });
    expect(at.overRemoteLogin).toEqual([]); // Loopback supplies no Remote Login candidate.
  });

  // The captain's choice on INF-5136's review: the app's own update hands an unchanged
  // package worker to the card at once, never after the whole return wait.
  it("without the package route, refuses a legacy Linux worker as soon as it restarts unchanged without a copy", async () => {
    // The wait outlasts the test's own limit, so only a prompt answer passes.
    const at = await world({ fromAnotherMac: true, waitMs: 60_000 });
    const old = at.start({ appVersion: "0.1.20", update: async () => ({ restarts: true }) });
    await expect.poll(() => old.state().contact).toBe("in-reach");
    at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
    // Its refusal comes as the worker returns, so it is held from the start.
    const updating = at.computers.update(at.deviceId).then(
      () => "updated",
      (error: unknown) => error,
    );
    expect(await old.ended).toBe("updated");
    await expect.poll(() => at.work.version(at.deviceId)).toBeUndefined();
    const returned = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => returned.state().contact).toBe("in-reach");
    expect(await updating).toMatchObject({
      lines: remoteLoginWords.packageCopyMissing("Mac mini"),
    });
    expect(at.overRemoteLogin).toEqual([]);
  });

  // INF-5136 review: a reconnect while the order is still being prepared is not that order's return.
  it("a Linux worker that reconnects before its update order is sent still waits for that order's own return", async () => {
    let release: () => void = () => {};
    const prepare = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const at = await world({ fromAnotherMac: true, kept: true, prepare });
    const worker = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => worker.state().contact).toBe("in-reach");
    at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
    const updating = at.computers.update(at.deviceId).then(
      (answer) => answer,
      (error: unknown) => error,
    );
    await expect.poll(() => prepare.mock.calls.length).toBe(1);
    // The network drops and it comes back on the same version before anything is asked of it.
    await at.drop();
    await expect.poll(() => at.work.version(at.deviceId)?.app).toBe("0.1.20");
    release();
    expect(await worker.ended).toBe("updated");
    expect(at.kept()).toBe("the home's own copy");
    expect(at.crew).toEqual([`paused ${at.deviceId}`]);
    at.start({ appVersion: HOME_APP });
    expect(await updating).toMatchObject({ id: at.deviceId, inReach: true });
    expect(at.view()?.otherVersion).toBeUndefined();
    expect(at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
    expect(at.feed()).toContain(
      remoteLoginWords.updated(at.view() ?? { name: "Mac mini" }, "running"),
    );
  });

  // INF-5136 review: a drop before the order is not remembered, so a welcome after it
  // from a second connection, with no new drop, is not the order's return.
  it("a Linux worker dropped before its update order is not taken as back unchanged on a later overlapping welcome", async () => {
    let release: () => void = () => {};
    const prepare = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const at = await world({ fromAnotherMac: true, waitMs: 60_000, prepare });
    let ordered: () => void = () => {};
    const orderSeen = new Promise<void>((resolve) => {
      ordered = resolve;
    });
    let restart: () => void = () => {};
    const restarting = new Promise<void>((resolve) => {
      restart = resolve;
    });
    const worker = at.start({
      appVersion: "0.1.20",
      update: async () => {
        ordered();
        await restarting;
        return { restarts: true };
      },
    });
    await expect.poll(() => worker.state().contact).toBe("in-reach");
    at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
    let settled = false;
    const updating = at.computers.update(at.deviceId).then(
      (answer) => {
        settled = true;
        return answer;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    await expect.poll(() => prepare.mock.calls.length).toBe(1);
    await at.drop();
    await expect.poll(() => at.work.version(at.deviceId)?.app).toBe("0.1.20");
    release();
    await orderSeen;
    // A second connection's welcome on the same version while the first is still up:
    // the connection publishes its version as it does at every welcome, with no drop.
    const version = at.work.version(at.deviceId);
    if (!version) throw new Error("The worker is not connected.");
    (at.work as unknown as { heard(id: string, version: WorkDeviceVersion): void }).heard(
      at.deviceId,
      version,
    );
    // Whatever that welcome settles has run by the next turn of the loop.
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(at.crew).toEqual([`paused ${at.deviceId}`]);
    restart();
    expect(await worker.ended).toBe("updated");
    at.start({ appVersion: HOME_APP });
    expect(await updating).toMatchObject({ id: at.deviceId, inReach: true });
    expect(at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
  });

  // Unreachable, or reached but another account, worker or package there: each is correctable.
  it.each([
    "unreachable",
    "key-refused",
    "host-changed",
    "password-wrong",
    "another-computer",
    "cannot-install",
  ] as const)(
    "prefills the peer address with why after a %s refusal without stopping the worker",
    async (refusal) => {
      const updateByAddress = vi.fn(async () => {
        throw new RemoteLoginRefusedError(refusal, [
          "Could not use the address.",
          "Choose another address.",
        ]);
      });
      const at = await world({ fromAnotherMac: true, updateByAddress });
      const worker = at.start({
        appVersion: "0.1.20",
        update: async () => ({ restarts: false, needsPackage: true }),
      });
      await expect.poll(() => worker.state().contact).toBe("in-reach");
      at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
      vi.spyOn(at.pairing, "packageUpdatePeer").mockReturnValue("192.168.1.42");
      await expect(at.computers.update(at.deviceId)).rejects.toMatchObject({
        lines: remoteLoginWords.packageCopyMissing("Mac mini"),
      });
      expect(updateByAddress).not.toHaveBeenCalled();
      expect(await at.computers.update(at.deviceId, { packageFallback: true })).toEqual({
        asks: "package-address",
        address: "builder@192.168.1.42",
        lines: ["Could not use the address.", "Choose another address."],
      });
      expect(updateByAddress).toHaveBeenCalledExactlyOnceWith(
        at.deviceId,
        expect.objectContaining({ address: "builder@192.168.1.42" }),
      );
      expect(worker.state().contact).toBe("in-reach");
      expect(at.said.some((event) => event.copy?.state === "starting")).toBe(false);
    },
  );

  it("asks a Linux worker that may need the Ubuntu package without getting its AppImage first", async () => {
    const updateByAddress = vi.fn(async () => {
      throw new RemoteLoginRefusedError("unreachable", ["Could not reach it.", "Choose another."]);
    });
    const prepare = vi.fn(async () => "no-build" as const);
    const at = await world({ fromAnotherMac: true, updateByAddress, prepare });
    const worker = at.start({
      appVersion: "0.1.20",
      update: async () => ({ restarts: false, needsPackage: true }),
    });
    await expect.poll(() => worker.state().contact).toBe("in-reach");
    at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
    vi.spyOn(at.pairing, "packageUpdatePeer").mockReturnValue("192.168.1.42");
    // Without the package fallback, the missing AppImage still refuses before it is asked.
    await expect(at.computers.update(at.deviceId)).rejects.toMatchObject({ refusal: "no-build" });
    expect(prepare).toHaveBeenCalledTimes(1);
    // With it, the worker is asked at once, and the AppImage is fetched only if it asks.
    expect(await at.computers.update(at.deviceId, { packageFallback: true })).toEqual({
      asks: "package-address",
      address: "builder@192.168.1.42",
      lines: ["Could not reach it.", "Choose another."],
    });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("keeps the warning of an install that may already have run on the address it tried, with nothing to try again", async () => {
    const said = remoteLoginWords.uncertain("Ubuntu builder");
    const updateByAddress = vi.fn(async () => {
      throw new RemoteLoginRefusedError("failed", said, said.join("\n"), true);
    });
    const at = await world({ fromAnotherMac: true, updateByAddress });
    const worker = at.start({
      appVersion: "0.1.20",
      update: async () => ({ restarts: false, needsPackage: true }),
    });
    await expect.poll(() => worker.state().contact).toBe("in-reach");
    at.pairing.noteSystem(at.deviceId, { system: "linux", chip: "x64" });
    vi.spyOn(at.pairing, "packageUpdatePeer").mockReturnValue("192.168.1.42");
    await expect(at.computers.update(at.deviceId, { packageFallback: true })).rejects.toMatchObject(
      { refusal: "failed", lines: said, uncertain: true },
    );
    expect(updateByAddress).toHaveBeenCalledOnce();
  });

  it("says when it has not started again, or will only once it is started by hand", async () => {
    const late = await world({ waitMs: 100 });
    late.start({ appVersion: "0.1.20" });
    await expect.poll(() => late.view()?.otherVersion).toBeDefined();
    await late.computers.update(late.deviceId);
    const builder = { name: "Mac mini", user: "builder", onThisMac: true };
    expect(late.said.map(({ text, tone }) => [text, tone])).toEqual([
      [remoteLoginWords.updating(builder), "info"],
      [remoteLoginWords.starting(deviceLabel(builder)), "info"],
      ...remoteLoginWords.notBack(builder).map((line) => [line, "warn"]),
    ]);

    const byHand = await world({ background: false });
    byHand.start({ appVersion: "0.1.20" });
    await expect.poll(() => byHand.view()?.otherVersion).toBeDefined();
    await byHand.computers.update(byHand.deviceId);
    expect(byHand.feed()).toEqual([
      remoteLoginWords.updating(builder),
      remoteLoginWords.updatedByHand(builder),
    ]);
  });

  it("added by its address, is updated over Remote Login, never the connection", async () => {
    const at = await world({ kept: true, remoteLogin: "sam@mini.local" });
    const running = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("remote-login");
    // The home lists its version as it welcomes it, before the computer
    // hears the welcome: both sides are in reach before the update.
    await expect.poll(() => running.state().contact).toBe("in-reach");
    await at.computers.update(at.deviceId);
    expect(at.overRemoteLogin).toEqual([at.deviceId]);
    expect(at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
    expect(at.said).toEqual([]);
    expect(at.kept()).toBe("the copy it kept");
    expect(running.state().contact).toBe("in-reach");
  });

  // The captain's ask: a work computer being updated reads updating, never out of reach.
  it("reads updating from its crew's pause until the update ends, then its own reach", async () => {
    const at = await world({ kept: true });
    const before = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    expect(at.view()).not.toHaveProperty("updating");
    const updating = at.computers.update(at.deviceId);
    await expect.poll(() => at.view()?.updating).toBe(true);
    expect(await before.ended).toBe("updated");
    await expect.poll(() => at.view()?.inReach).toBe(false);
    expect(at.view()?.updating).toBe(true);
    at.start({ appVersion: HOME_APP });
    await updating;
    expect(at.view()).not.toHaveProperty("updating");
    expect(at.pushed.some((list) => list.some((device) => device.updating))).toBe(true);
  });

  it("reads out of reach once nothing is heard from an update for its wait, and updating again once a step is heard", async () => {
    const [held, paused] = [deferred<void>(), deferred<void>()];
    const at = await world({
      kept: true,
      remoteLogin: "sam@mini.local",
      waitMs: 300,
      updateByAddress: async (_deviceId, asked) => {
        await asked?.pause?.();
        paused.resolve();
        return held.promise.then(() => at.view() as DeviceView);
      },
    });
    const updating = at.computers.update(at.deviceId);
    await paused.promise;
    expect(at.view()?.updating).toBe(true);
    await expect.poll(() => at.view()?.updating).toBeUndefined();
    at.computers.heardFrom(at.deviceId);
    expect(at.pushed.at(-1)?.find((device) => device.id === at.deviceId)?.updating).toBe(true);
    held.resolve();
    await updating;
    expect(at.view()).not.toHaveProperty("updating");
  });

  it("reads its own reach once its update failed, and never updating when refused before its crew paused", async () => {
    const at = await world({
      kept: true,
      remoteLogin: "sam@mini.local",
      updateByAddress: async (_deviceId, asked) => {
        await asked?.pause?.();
        throw new RemoteLoginRefusedError("failed", ["It failed.", "Nothing changed."], "failed");
      },
    });
    await expect(at.computers.update(at.deviceId)).rejects.toThrow("failed");
    expect(at.view()).not.toHaveProperty("updating");
    expect(at.pushed.some((list) => list.some((device) => device.updating))).toBe(true);
    const refused = await world({ kept: true });
    await expect(refused.computers.update(refused.deviceId)).rejects.toThrow();
    expect(refused.pushed.some((list) => list.some((device) => device.updating))).toBe(false);
  });

  it("refuses what it cannot update, in two lines here and in the feed, and changes nothing there", async () => {
    const builder = { name: "Mac mini", user: "builder", onThisMac: true };
    const refused = (refusal: Parameters<typeof remoteLoginWords.refused>[0]) =>
      remoteLoginWords.refused(refusal, {
        address: "Running as Builder",
        name: "Running as Builder",
        doing: "update",
      });

    // Out of reach, and on this Mac's version already.
    const at = await world({ kept: true });
    await expect(at.computers.update(at.deviceId)).rejects.toThrow(
      refused("out-of-reach").join(" "),
    );
    const current = at.start({ appVersion: HOME_APP });
    await expect.poll(() => at.view()?.inReach).toBe(true);
    await expect(at.computers.update(at.deviceId)).rejects.toThrow(refused("current").join(" "));
    await current.stop();
    await expect.poll(() => at.view()?.inReach).toBe(false);

    // Too old to take the update order: a new command updates it instead.
    at.start({ protocolVersion: beforeUpdates(), appVersion: "0.1.25" });
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("command");
    await expect(at.computers.update(at.deviceId)).rejects.toThrow(
      refused("not-updatable").join(" "),
    );
    expect(at.feed()).toEqual([
      ...refused("out-of-reach"),
      ...refused("current"),
      ...refused("not-updatable"),
    ]);
    expect(at.said.every(({ stage, tone }) => stage === "refused" && tone === "warn")).toBe(true);
    expect(at.kept()).toBe("the copy it kept");
    // Refused before anything there stops, its crew never paused.
    expect(at.crew).toEqual([]);

    // This Mac has no Firstmate to send: the computer could not get it, kept
    // its own, and runs on.
    const none = await world({ app: null, kept: true });
    const running = none.start({ appVersion: "0.1.20" });
    await expect.poll(() => none.view()?.otherVersion).toBeDefined();
    await expect(none.computers.update(none.deviceId)).rejects.toThrow(refused("failed").join(" "));
    expect(none.feed()).toEqual([remoteLoginWords.updating(builder), ...refused("failed")]);
    expect(none.kept()).toBe("the copy it kept");
    expect(running.state().contact).toBe("in-reach");
    // Its crew paused as the update went ahead, and carries on once it failed.
    expect(none.crew).toEqual([`paused ${none.deviceId}`, `resumed ${none.deviceId}`]);
  });
});

/**
 * The captain's ask on INF-2115: "The work computer installs the update the
 * home installed on its own, with no card to click" (docs/devices.md,
 * "Updating by itself"). The home's nudge, wired as the home wires it, over
 * the same real connection and run as the updates above.
 */
describe("a computer that connects on an older version than the home's", () => {
  const builder = { name: "Mac mini", user: "builder", onThisMac: true };

  it("is updated by itself as it connects, its crew paused and carried on, with no card to click", async () => {
    const at = await world({ kept: true, nudge: true });
    const before = at.start({ appVersion: "0.1.20" });
    // Nobody asks: the home updates it as it connects.
    expect(await before.ended).toBe("updated");
    expect(at.kept()).toBe("the home's own copy");
    at.start({ appVersion: HOME_APP });
    await expect.poll(() => at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
    expect(at.view()).toMatchObject({ inReach: true });
    expect(at.view()?.otherVersion).toBeUndefined();
    expect(at.nudged.updates).toEqual([at.deviceId]);
    expect(at.nudged.raised).toEqual([]);
    const counts = (event: DeviceUpdateEvent) => event.copy?.state === "sending";
    expect(at.said.filter((event) => !counts(event)).map((event) => event.text)).toEqual([
      remoteLoginWords.updating(builder),
      remoteLoginWords.starting(deviceLabel(builder)),
      remoteLoginWords.updated(builder, "running"),
    ]);
  });

  it("whose update does not go through gets the card once, with what refused it, and is not tried again for that gap", async () => {
    // This Mac has no Firstmate to send, so the computer cannot get it.
    const at = await world({ app: null, kept: true, nudge: true });
    const running = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.nudged.raised.length).toBe(1);
    const refusal = remoteLoginWords.refused("failed", {
      address: deviceLabel(builder),
      name: deviceLabel(builder),
      doing: "update",
    });
    expect(at.nudged.raised[0]?.id).toBe(deviceUpdateCardId(at.deviceId));
    expect(at.nudged.raised[0]?.body).toContain(
      `The last update was refused. ${refusal.join(" ")}`,
    );
    expect(at.nudged.updates).toEqual([at.deviceId]);
    expect(at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
    expect(at.kept()).toBe("the copy it kept");
    expect(running.state().contact).toBe("in-reach");

    // Back on the same versions after a drop, it gets its card again, and nothing tries it again.
    await at.drop();
    await expect.poll(() => at.nudged.raised.length).toBe(2);
    expect(at.nudged.standing.has(deviceUpdateCardId(at.deviceId))).toBe(true);
    expect(at.nudged.updates).toEqual([at.deviceId]);
  });

  it("is left on its version once the captain said Not now for that gap, and a task's wait recalls the card, not an update", async () => {
    const at = await world({ kept: true, nudge: true });
    const id = deviceUpdateCardId(at.deviceId);
    at.nudged.chosen.set(
      id,
      deviceUpdateActionId(DEVICE_UPDATE_ACTIONS.notNow, `${HOME_APP}>0.1.20`),
    );
    const running = at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.view()?.otherVersion?.than).toBe("older");
    await expect.poll(() => running.state().contact).toBe("in-reach");
    expect(at.nudged.updates).toEqual([]);
    expect(at.nudged.raised).toEqual([]);
    // A task waiting for it recalls the card as it starts to wait.
    at.nudge?.refresh(at.deviceId, true);
    expect(at.nudged.raised.map((card) => card.id)).toEqual([id]);
    expect(at.nudged.updates).toEqual([]);
    expect(at.kept()).toBe("the copy it kept");
  });

  it("whose card was closed by the old close control, which names no version, is still updated by itself", async () => {
    const at = await world({ kept: true, nudge: true });
    at.nudged.chosen.set(deviceUpdateCardId(at.deviceId), "dismissed");
    const before = at.start({ appVersion: "0.1.20" });
    expect(await before.ended).toBe("updated");
    // Back on this Mac's version, the update ends inside the test, its crew carried on.
    at.start({ appVersion: HOME_APP });
    await expect.poll(() => at.crew).toEqual([`paused ${at.deviceId}`, `resumed ${at.deviceId}`]);
    expect(at.view()?.otherVersion).toBeUndefined();
    expect(at.nudged.updates).toEqual([at.deviceId]);
    expect(at.nudged.raised).toEqual([]);
  });

  it("too old to take the update order, gets the card to make its command, with nothing tried", async () => {
    const at = await world({ kept: true, nudge: true });
    at.start({ protocolVersion: beforeUpdates(), appVersion: "0.1.25" });
    await expect.poll(() => at.nudged.raised.length).toBe(1);
    expect(at.view()?.otherVersion?.updateBy).toBe("command");
    expect(at.nudged.updates).toEqual([]);
    expect(at.said).toEqual([]);
  });

  it("added by its address, is updated over Remote Login by itself, and gets the card when that asks a password there", async () => {
    const at = await world({
      kept: true,
      remoteLogin: "sam@mini.local",
      asksPassword: true,
      nudge: true,
    });
    at.start({ appVersion: "0.1.20" });
    await expect.poll(() => at.nudged.raised.length).toBe(1);
    expect(at.overRemoteLogin).toEqual([at.deviceId]);
    expect(at.nudged.updates).toEqual([at.deviceId]);
    // Asked before anything there stops, its crew never paused.
    expect(at.crew).toEqual([]);
    expect(at.nudged.raised[0]?.body).not.toContain("The last update was refused.");
  });
});

/**
 * A Mac a command added downloads its update itself (INF-322, the captain's
 * direction B: every work computer, its count in Devices and the feed, and
 * this Mac's own copy at once when it cannot): the home names where its
 * version is published, and the computer's own run fetches it over HTTPS
 * from a stand-in release with the Mac's own curl, checks its SHA-256,
 * unpacks it with ditto and checks its publisher - a stand-in for codesign,
 * since no stand-in app carries the release's signature - then keeps it.
 * A computer on an older contract keeps the update order alone.
 */
describe.runIf(process.platform === "darwin")(
  "a Mac a command added, on a contract that takes the download order",
  () => {
    const mini = { name: "Mac mini", user: "builder", onThisMac: false };
    const label = deviceLabel(mini);

    /** This Mac's version as its release publishes it: a real zip over local HTTPS, trusted by curl here alone. */
    async function published(paceMs = 0) {
      const release = await macRelease(bundle("the published copy"), "0.13.0", paceMs);
      stops.push(() => release.stop());
      vi.stubEnv("CURL_CA_BUNDLE", release.cert);
      stops.push(() => {
        vi.unstubAllEnvs();
      });
      const url = release.downloads[release.publicUrl] ?? "";
      return { ...release, download: { url, sha256: release.sha256 } };
    }

    /** Each line the feed said, but the counts. */
    const lines = (said: DeviceUpdateEvent[]) =>
      said
        .filter((event) => !event.copy?.download && event.copy?.state !== "sending")
        .map((event) => event.text);
    const leftovers = (dataDir: string) =>
      readdirSync(dataDir).filter((entry) => entry.startsWith("update-"));

    it("downloads this Mac's version itself, counts it in one line rewritten in place, keeps it and starts again", async () => {
      const release = await published(100);
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const verifier = release.programs["/usr/bin/codesign"];
      const before = at.start({ appVersion: "0.1.20", verifier });
      await expect
        .poll(() => at.view()?.otherVersion)
        .toMatchObject({ updateBy: "connection", downloads: true });
      // Its publisher is checked once the whole download arrived: held there,
      // the count it reaches is the release's own size.
      release.signature("hold");
      const updating = at.computers.update(at.deviceId);
      await expect.poll(() => existsSync(release.verificationReady), { timeout: 8_000 }).toBe(true);
      await expect
        .poll(() => at.said.filter((event) => event.copy?.download).at(-1)?.copy?.download)
        .toEqual({ received: release.size, total: release.size });
      release.signature("valid");
      expect(await before.ended).toBe("updated");
      expect(at.kept()).toBe("the published copy");
      at.start({ appVersion: HOME_APP });
      await updating;

      const counts = at.said.filter((event) => event.copy?.download);
      expect(counts.length).toBeGreaterThan(1);
      expect(new Set(counts.map((event) => event.run?.id)).size).toBe(1);
      for (const { text, copy } of counts)
        expect(text).toBe(
          remoteLoginWords.downloading(label, copy?.download?.received ?? 0, release.size),
        );
      expect(lines(at.said)).toEqual([
        remoteLoginWords.updating(mini),
        remoteLoginWords.starting(label),
        remoteLoginWords.updated(mini, "running"),
      ]);
      // Nothing was sent from here, and nothing of the download is left there.
      expect(at.said.some((event) => event.copy?.state === "sending")).toBe(false);
      expect(release.requests()).toBe(1);
      expect(leftovers(at.dataDir)).toEqual([]);
    });

    it.each([
      ["does not match its checksum", "corrupt", true],
      ["cannot be downloaded", "fail", false],
    ] as const)(
      "sends this Mac's own copy at once, counted, when the download %s",
      async (_, mode, mismatch) => {
        const release = await published();
        release.mode(mode);
        const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
        const before = at.start({
          appVersion: "0.1.20",
          verifier: release.programs["/usr/bin/codesign"],
        });
        await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
        const updating = at.computers.update(at.deviceId);
        expect(await before.ended).toBe("updated");
        expect(at.kept()).toBe("the home's own copy");
        at.start({ appVersion: HOME_APP });
        await updating;
        expect(lines(at.said)).toEqual([
          remoteLoginWords.updating(mini),
          remoteLoginWords.downloadFallback(label, mismatch),
          remoteLoginWords.starting(label),
          remoteLoginWords.updated(mini, "running"),
        ]);
        const sent = at.said.filter((event) => event.copy?.state === "sending");
        expect(sent.at(-1)?.copy?.sent).toBeGreaterThan(0);
        expect(sent.at(-1)?.text).toBe(
          remoteLoginWords.sendingRow(label, sent.at(-1)?.copy?.sent ?? 0),
        );
        expect(leftovers(at.dataDir)).toEqual([]);
      },
    );

    it("sends this Mac's own copy when what it downloaded is not the release's publisher's", async () => {
      const release = await published();
      release.signature("wrong-team");
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const before = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
      });
      await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
      const updating = at.computers.update(at.deviceId);
      expect(await before.ended).toBe("updated");
      at.start({ appVersion: HOME_APP });
      await updating;
      expect(at.kept()).toBe("the home's own copy");
      expect(release.verifications()).toHaveLength(1);
      expect(lines(at.said)).toContain(remoteLoginWords.downloadFallback(label, true));
    });

    it("stops a download with nothing moving, leaves nothing of it there, and sends this Mac's copy", async () => {
      const release = await published();
      release.mode("hang");
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const before = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
        downloadIdleSeconds: 2,
      });
      await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
      const updating = at.computers.update(at.deviceId);
      expect(await before.ended).toBe("updated");
      at.start({ appVersion: HOME_APP });
      await updating;
      expect(at.kept()).toBe("the home's own copy");
      expect(lines(at.said)).toContain(remoteLoginWords.downloadFallback(label, false));
      // The stalled transfer's connection closed with its downloader.
      await expect.poll(() => release.active()).toBe(0);
      expect(leftovers(at.dataDir)).toEqual([]);
    });

    // INF-369 F1, the captain's choice: this computer reconnects and follows the running download until the new version is up.
    it("followed through a dropped connection, its download goes on and the home waits for its new version", async () => {
      const release = await published();
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const before = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
      });
      await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
      // Held where it checks the publisher, the whole download arrived.
      release.signature("hold");
      const updating = at.computers.update(at.deviceId);
      await expect.poll(() => existsSync(release.verificationReady)).toBe(true);
      await at.drop();
      // Its link redials at once, so it never says it was out of reach; this Mac welcomes it again.
      await expect.poll(() => at.view()?.inReach).toBe(true);
      // Asked again while it downloads, it says so, and changes nothing.
      expect(
        await at.work.ask(at.deviceId, "fm:firstmate:update-download", [release.download], {
          anyVersion: true,
        }),
      ).toEqual({ updating: true });
      release.signature("valid");
      expect(await before.ended).toBe("updated");
      expect(at.kept()).toBe("the published copy");
      at.start({ appVersion: HOME_APP });
      await updating;
      expect(lines(at.said)).toEqual([
        remoteLoginWords.updating(mini),
        remoteLoginWords.updated(mini, "running"),
      ]);
      expect(at.said.at(-2)?.copy?.download).toEqual({
        received: release.size,
        total: release.size,
      });
      expect(release.requests()).toBe(1);
      expect(leftovers(at.dataDir)).toEqual([]);
    });

    it("asked to update while a download runs there, follows that download without falling back", async () => {
      const release = await published();
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const before = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
      });
      await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
      // An earlier update whose answer this Mac never heard, as after it restarted.
      release.signature("hold");
      const earlier = at.work.ask(at.deviceId, "fm:firstmate:update-download", [release.download], {
        anyVersion: true,
      });
      await expect.poll(() => existsSync(release.verificationReady)).toBe(true);
      const updating = at.computers.update(at.deviceId);
      await expect
        .poll(() => at.said.filter((event) => event.copy?.download).at(-1)?.copy?.download)
        .toEqual({ received: release.size, total: release.size });
      release.signature("valid");
      expect(await earlier).toMatchObject({ restarts: true });
      expect(await before.ended).toBe("updated");
      at.start({ appVersion: HOME_APP });
      await updating;
      expect(lines(at.said)).toEqual([
        remoteLoginWords.updating(mini),
        remoteLoginWords.updated(mini, "running"),
      ]);
      expect(at.said.some((event) => event.copy?.state === "sending")).toBe(false);
      expect(release.requests()).toBe(1);
    });

    // INF-369 N2: a home that could not look its version up asks the update order while an earlier download still runs there.
    it.each([
      ["kept its copy, answers as that download ended", "valid", "the published copy"],
      ["ended with nothing changed, goes on with the update", "invalid", "the home's own copy"],
    ] as const)(
      "asked the update order while a download runs there, waits for it: one that %s",
      async (_, signature, kept) => {
        const release = await published();
        // This Mac's lookup answers nothing now, as offline or past its limit on a slow hotspot.
        const at = await world({ kept: true, fromAnotherMac: true });
        const before = at.start({
          appVersion: "0.1.20",
          verifier: release.programs["/usr/bin/codesign"],
        });
        await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
        release.signature("hold");
        const earlier = at.work.ask(
          at.deviceId,
          "fm:firstmate:update-download",
          [release.download],
          {
            anyVersion: true,
          },
        );
        await expect.poll(() => existsSync(release.verificationReady)).toBe(true);
        const updating = at.computers.update(at.deviceId);
        await expect.poll(() => lines(at.said)).toEqual([remoteLoginWords.updating(mini)]);
        release.signature(signature);
        await earlier;
        expect(await before.ended).toBe("updated");
        expect(at.kept()).toBe(kept);
        at.start({ appVersion: HOME_APP });
        await updating;
        expect(lines(at.said)).toEqual([
          remoteLoginWords.updating(mini),
          remoteLoginWords.starting(label),
          remoteLoginWords.updated(mini, "running"),
        ]);
      },
    );

    it("whose run stopped part way comes back with nothing changed, and is sent this Mac's copy at once", async () => {
      const release = await published();
      release.mode("hang");
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const before = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
      });
      await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
      const updating = at.computers.update(at.deviceId);
      await expect.poll(() => release.active()).toBe(1);
      await before.stop();
      // Its download went with the run, and left nothing.
      await expect.poll(() => release.active()).toBe(0);
      expect(leftovers(at.dataDir)).toEqual([]);
      // Its background starts it again on its old version: nothing is under way there.
      const again = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
      });
      expect(await again.ended).toBe("updated");
      expect(at.kept()).toBe("the home's own copy");
      at.start({ appVersion: HOME_APP });
      await updating;
      expect(lines(at.said)).toEqual([
        remoteLoginWords.updating(mini),
        remoteLoginWords.downloadFallback(label, false),
        remoteLoginWords.starting(label),
        remoteLoginWords.updated(mini, "running"),
      ]);
    });

    it("not heard from again within the wait, says it may already have updated, never that nothing changed", async () => {
      const release = await published();
      release.mode("hang");
      const at = await world({
        kept: true,
        fromAnotherMac: true,
        download: release.download,
        waitMs: 300,
      });
      const before = at.start({
        appVersion: "0.1.20",
        verifier: release.programs["/usr/bin/codesign"],
      });
      await expect.poll(() => at.view()?.otherVersion?.downloads).toBe(true);
      const updating = at.computers.update(at.deviceId);
      await expect.poll(() => release.active()).toBe(1);
      await before.stop();
      await expect(updating).rejects.toThrow(remoteLoginWords.uncertain(label).join(" "));
      expect(lines(at.said)).toEqual([
        remoteLoginWords.updating(mini),
        ...remoteLoginWords.uncertain(label),
      ]);
      expect(at.kept()).toBe("the copy it kept");
    });

    it("on an older contract, keeps the update order alone: it is sent this Mac's copy, counted, and never told of the download", async () => {
      const release = await published();
      const [major, minor] = WORK_DOWNLOAD_SINCE.split(".").map(Number);
      const at = await world({ kept: true, fromAnotherMac: true, download: release.download });
      const before = at.start({
        appVersion: "0.1.20",
        protocolVersion: `${major}.${(minor ?? 1) - 1}.0`,
      });
      await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
      expect(at.view()?.otherVersion?.downloads).toBeUndefined();
      const updating = at.computers.update(at.deviceId);
      expect(await before.ended).toBe("updated");
      at.start({ appVersion: HOME_APP });
      await updating;
      expect(at.kept()).toBe("the home's own copy");
      expect(release.requests()).toBe(0);
      expect(lines(at.said)).toEqual([
        remoteLoginWords.updating(mini),
        remoteLoginWords.starting(label),
        remoteLoginWords.updated(mini, "running"),
      ]);
      expect(at.said.some((event) => event.copy?.state === "sending")).toBe(true);
    });
  },
);

/**
 * The Infinitary rename (FI3-1780 step 2): a home that moved to Infinitary
 * writes its channel names in Infinitary's spelling, keeps the update order's
 * one name, and sends its own app, `Infinitary.app`. This computer keeps that
 * app beside its own and moves its background to it in one step, under that
 * app's label. Its background answers through a stand-in launchctl, which
 * writes down what it was asked.
 */
describe("a computer whose home moved to Infinitary", () => {
  function inBackground(dataDir: string, refuses?: (args: readonly string[]) => boolean) {
    const asked: string[][] = [];
    const context: BackgroundContext = {
      flavor: "release",
      dataDir,
      homeDir: scratchDir("infinitary-update-agents-"),
      uid: 502,
      launchctl: async (args) => {
        asked.push([...args]);
        return refuses?.(args) ? { ok: false, output: "refused" } : { ok: true, output: "" };
      },
    };
    return { context, asked };
  }

  /**
   * The agent the join set up there, starting the copy it kept: Firstmate
   * 3000's, under its own label, as a computer that joined before the
   * rename has it.
   */
  async function joinedInBackground(context: BackgroundContext, kept: string) {
    const launcher = fetchedLauncher(kept);
    if (!launcher) throw new Error("no launcher");
    await startInBackground({ ...context, spelling: "fm" }, { launcher, env: {}, app: kept });
    const service = readInstalled(context.dataDir).service;
    if (!service) throw new Error("no agent");
    return service;
  }

  it("keeps Infinitary's app, starts its background from it first, and takes its own copy and agent away last", async () => {
    const at = await world({
      kept: true,
      speaks: "inf",
      app: bundle("Infinitary's own copy", "Infinitary"),
    });
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    const { context, asked } = inBackground(at.dataDir);
    const before = await joinedInBackground(context, kept);
    expect(before.label).toBe(workLabelOf("fm", "release"));

    const running = at.start({ appVersion: "0.1.20" }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    asked.length = 0;
    const updating = at.computers.update(at.deviceId);
    // The order kept its one name across the two spellings, so this run answered it.
    expect(await running.ended).toBe("updated");

    const moved = join(at.dataDir, "app", "Infinitary.app");
    const label = workLabelOf("inf", "release");
    const file = join(context.homeDir, "Library", "LaunchAgents", `${label}.plist`);
    expect(readInstalled(at.dataDir)).toEqual({ service: { label, file }, app: moved });
    expect(readFileSync(join(moved, "Contents", "Resources", "marker"), "utf8").trim()).toBe(
      "Infinitary's own copy",
    );
    expect(readFileSync(file, "utf8")).toContain(
      `<string>${join(moved, "Contents", "MacOS", "Infinitary")}</string>`,
    );
    // The new agent started before the old one went, which went last.
    expect(asked).toEqual([
      ["bootout", `gui/502/${label}`],
      ["bootstrap", "gui/502", file],
      ["bootout", `gui/502/${before.label}`],
    ]);
    expect(existsSync(before.file)).toBe(false);
    expect(existsSync(kept)).toBe(false);

    // Its background starts it again, on this Mac's version.
    at.start({ appVersion: HOME_APP }, context);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");
    expect(updated.otherVersion).toBeUndefined();
  });

  it("changes nothing when its background will not move to the new app, and runs on", async () => {
    const at = await world({
      kept: true,
      speaks: "inf",
      app: bundle("Infinitary's own copy", "Infinitary"),
    });
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    const label = workLabelOf("inf", "release");
    const { context } = inBackground(
      at.dataDir,
      (args) => args[0] === "bootstrap" && String(args[2]).includes(label),
    );
    const before = await joinedInBackground(context, kept);

    const running = at.start({ appVersion: "0.1.20" }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    await expect(at.computers.update(at.deviceId)).rejects.toThrow();
    expect(running.state().contact).toBe("in-reach");
    expect(readInstalled(at.dataDir)).toEqual({ service: before, app: kept });
    expect(at.kept()).toBe("the copy it kept");
    expect(existsSync(before.file)).toBe(true);
    expect(existsSync(join(at.dataDir, "app", "Infinitary.app"))).toBe(false);
    expect(existsSync(join(context.homeDir, "Library", "LaunchAgents", `${label}.plist`))).toBe(
      false,
    );
  });

  it("keeping its work in Firstmate 3000's data folder, moves that folder into Infinitary's before its background moves to the copy there", async () => {
    const at = await world({
      kept: true,
      speaks: "inf",
      app: bundle("Infinitary's own copy", "Infinitary"),
      inDataFolder: true,
    });
    writeFileSync(join(at.dataDir, "work.log"), "a note\n");
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    const { context, asked } = inBackground(at.dataDir);
    const before = await joinedInBackground(context, kept);

    const running = at.start({ appVersion: "0.1.20" }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    asked.length = 0;
    const updating = at.computers.update(at.deviceId);
    expect(await running.ended).toBe("updated");

    // The whole folder is in Infinitary's now; Firstmate 3000's is its recovery copy.
    const older = join(at.appData, "firstmate-3000");
    const work = join(at.appData, "infinitary", "work");
    expect(existsSync(join(older, "retired-profile.json"))).toBe(true);
    expect(new JoinedHome(work).read()?.grant.deviceId).toBe(at.deviceId);
    expect(existsSync(join(work, "work.log"))).toBe(false);
    const moved = join(work, "app", "Infinitary.app");
    const label = workLabelOf("inf", "release");
    const file = join(context.homeDir, "Library", "LaunchAgents", `${label}.plist`);
    expect(readInstalled(work)).toEqual({ service: { label, file }, app: moved });
    expect(readFileSync(join(moved, "Contents", "Resources", "marker"), "utf8").trim()).toBe(
      "Infinitary's own copy",
    );
    const plist = readFileSync(file, "utf8");
    expect(plist).toContain(`<string>${join(moved, "Contents", "MacOS", "Infinitary")}</string>`);
    expect(plist).toContain(`<key>${join(work, "home.json")}</key>`);
    expect(plist).not.toContain(older);
    // The new agent started first, in the new folder; the old one went last.
    expect(asked).toEqual([
      ["bootout", `gui/502/${label}`],
      ["bootstrap", "gui/502", file],
      ["bootout", `gui/502/${before.label}`],
    ]);
    expect(existsSync(before.file)).toBe(false);
    expect(existsSync(join(work, "app", "Firstmate 3000.app"))).toBe(false);

    // Its background starts it again from the new folder, on this Mac's version.
    at.start({ appVersion: HOME_APP }, { ...context, dataDir: work, spelling: "inf" }, work);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");
    expect(updated.otherVersion).toBeUndefined();
  });

  it("changes nothing when its folder cannot move, and its own run starts again as it was", async () => {
    const at = await world({
      kept: true,
      speaks: "inf",
      app: bundle("Infinitary's own copy", "Infinitary"),
      inDataFolder: true,
      waitMs: 300,
    });
    // Firstmate 3000's window has the folder open there.
    const older = join(at.appData, "firstmate-3000");
    symlinkSync(`builder-mac-${process.pid}`, join(older, "SingletonLock"));
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    const { context, asked } = inBackground(at.dataDir);
    const before = await joinedInBackground(context, kept);

    const running = at.start({ appVersion: "0.1.20" }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    asked.length = 0;
    await at.computers.update(at.deviceId);
    expect(await running.ended).toBe("updated");
    await expect.poll(() => existsSync(join(at.dataDir, "app", "Infinitary.app"))).toBe(false);
    expect(existsSync(join(at.appData, "infinitary"))).toBe(false);
    expect(existsSync(join(older, "retired-profile.json"))).toBe(false);
    expect(readInstalled(at.dataDir)).toEqual({ service: before, app: kept });
    expect(at.kept()).toBe("the copy it kept");
    expect(asked).toEqual([]);
  });
});

describe("a computer that reaches its home through the home's SSH connection", () => {
  it("gets this Mac's Firstmate through the route that connection keeps, never at an address", async () => {
    const pairing = new DevicePairing({
      dir: join(scratchDir("infinitary-update-home-"), "devices"),
      onProblem: () => {},
      interfaces: () => ({}),
      ownUid: 501,
      port: await claimedPort(),
    });
    stops.push(() => pairing.dispose());
    const connection = startConnection({
      dispatch: (async (channel: string) => {
        throw new Error(`Rejected ${channel}`);
      }) as CoreDispatch,
      events: new CoreEventBus(),
      devices: pairing,
      port: pairing.port,
      app: () => bundle("the home's own copy"),
    });
    stops.push(() => connection.close());
    const forward = await forwardSocket(pairing.port);
    stops.push(() => forward.close());
    const { link } = pairing.invite(
      { kind: "work" },
      { remoteLogin: "builder@mini.local", via: "ssh", locality: "elsewhere" },
    );
    await connection.settled();
    const grant = await claimLink(
      link,
      { kind: "work", name: "Mac mini", user: BUILDER },
      { target: { socket: forward.socket } },
    );
    const dataDir = scratchDir("infinitary-update-computer-");
    new JoinedHome(dataDir).join(grant, Date.now());
    const app = keepApp(bundle("the copy it kept"), dataDir);
    writeInstalled(dataDir, { service: null, app });
    const kept = () => readFileSync(join(app, "Contents", "Resources", "marker"), "utf8").trim();

    // With no route, nothing is got and nothing here changes.
    await expect(updateHere({ dataDir, grant })).rejects.toBeInstanceOf(HomeRouteMissingError);
    expect(kept()).toBe("the copy it kept");
    expect(forward.carried()).toBe(1);

    const route = new HomeRoute(dataDir);
    route.publish(route.begin(), {
      socket: forward.socket,
      homeKey: grant.homeKey,
      deviceId: grant.deviceId,
    });
    await expect(updateHere({ dataDir, grant })).resolves.toEqual({ restarts: false });
    expect(kept()).toBe("the home's own copy");
    expect(forward.carried()).toBe(2);
  });
});

/**
 * A copy that does not start (INF-4207's plan, piece 3; docs/helper.md, "A
 * copy that does not start"): an update over the connection keeps the copy
 * it replaces until the new one has reached this Mac once, and goes back to
 * it by itself otherwise; this Mac then names the version that did not start
 * and does not send it there again. The background answers through a
 * stand-in launchctl that is a program of its own, as the watcher the old
 * run leaves behind runs it, writing down what it was asked; the test plays
 * launchd, starting each copy the agent names.
 */
describe("a computer whose update brought a copy that does not start", () => {
  /** A background whose launchctl is a stand-in program of the test's, writing down each ask. */
  function standInBackground(dataDir: string) {
    const dir = scratchDir("infinitary-update-launchctl-");
    const log = join(dir, "asked.log");
    const program = join(dir, "launchctl");
    // Once `loggedOut` runs, launchd knows no session there: agents start at the next login.
    const away = join(dir, "logged-out");
    writeFileSync(
      program,
      `#!/bin/sh\necho "$*" >> "${log}"\nif [ -e "${away}" ]; then case "$1" in bootstrap|print) exit 113;; esac; fi\n`,
      { mode: 0o755 },
    );
    const context: BackgroundContext = {
      flavor: "release",
      dataDir,
      homeDir: scratchDir("infinitary-update-agents-"),
      uid: 502,
      launchctl: launchctlAt(program),
    };
    const asked = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
    return { context, asked, loggedOut: () => writeFileSync(away, "") };
  }

  it("goes back to the copy it kept when the new one exits at start, and this Mac names that version and does not send it again", async () => {
    const at = await world({
      kept: true,
      app: bundle("the home's own copy"),
      waitMs: 200,
    });
    const { context, asked } = standInBackground(at.dataDir);
    const service = readInstalled(at.dataDir).service;
    if (!service) throw new Error("no agent");
    const appDir = join(at.dataDir, "app");
    const kept = join(appDir, "Firstmate 3000.app");

    const before = at.start({ appVersion: "0.1.20", trialSeconds: 2 }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    const updating = at.computers.update(at.deviceId);
    expect(await before.ended).toBe("updated");
    // The new copy is in place, and the one it replaced is kept beside it.
    expect(at.kept()).toBe("the home's own copy");
    expect(
      readFileSync(join(`${kept}.previous`, "Contents", "Resources", "marker"), "utf8").trim(),
    ).toBe("the copy it kept");

    // As launchd would, the new copy starts, and exits at once: it never reaches this Mac.
    const program = join(kept, "Contents", "MacOS", "Firstmate 3000");
    expect(spawnSync(program, ["work", "run"]).status).toBe(1);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");

    // The watcher put the previous copy back and had launchd start the agent again.
    await expect.poll(() => at.kept(), { timeout: 8_000 }).toBe("the copy it kept");
    await expect.poll(asked, { timeout: 8_000 }).toEqual([`kickstart -k gui/502/${service.label}`]);
    expect(readdirSync(appDir).sort()).toEqual(["Firstmate 3000.app", "went-back.json"]);

    // That copy's run tells this Mac, which says once which version did not
    // start there: its own, the one it sent. Once heard, it is not said again.
    const builder = { name: "Mac mini", user: "builder", onThisMac: true };
    at.start({ appVersion: "0.1.20" }, context);
    await expect
      .poll(() => at.feed().slice(-2))
      .toEqual(remoteLoginWords.wentBack(builder, HOME_APP));
    expect(at.computers.failedHere(at.deviceId)).toBe(true);
    await expect.poll(() => readdirSync(appDir)).toEqual(["Firstmate 3000.app"]);

    // Nothing sends that version there by itself and no update card asks
    // for it, where any other gap is updated by itself.
    const nudged = (failedHere: (deviceId: string) => boolean) => {
      const done = { cards: [] as string[], updates: [] as string[] };
      new DeviceUpdateNudge({
        devices: () => at.computers.list(),
        homeApp: () => HOME_APP,
        failedHere,
        // Started and never answered: what it began is all this reads.
        update: (deviceId) => {
          done.updates.push(deviceId);
          return new Promise(() => {});
        },
        cards: {
          raise: (card) => void done.cards.push(card.id),
          withdraw: () => undefined,
          has: () => false,
          chosenAction: () => undefined,
        },
        broadcastEvent: () => undefined,
      }).refresh(at.deviceId);
      return done;
    };
    expect(nudged((deviceId) => at.computers.failedHere(deviceId))).toEqual({
      cards: [],
      updates: [],
    });
    expect(nudged(() => false)).toEqual({ cards: [], updates: [at.deviceId] });
    const said = at.said.length;
    // Update does not send that version there again, and asks nothing of it.
    await expect(at.computers.update(at.deviceId)).rejects.toThrow(
      remoteLoginWords.failedHere(builder, HOME_APP).join(" "),
    );
    expect(at.said.length).toBe(said);
    expect(at.kept()).toBe("the copy it kept");
  });

  it("keeps the new copy and lets the previous one go once the new one reaches this Mac", async () => {
    const at = await world({
      kept: true,
      app: bundle("the home's own copy"),
    });
    const { context, asked } = standInBackground(at.dataDir);
    const appDir = join(at.dataDir, "app");

    // Its wait outlasts any start here; the watcher ends as soon as the trial does.
    const before = at.start({ appVersion: "0.1.20", trialSeconds: 60 }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    const updating = at.computers.update(at.deviceId);
    expect(await before.ended).toBe("updated");
    expect(readdirSync(appDir)).toContain("Firstmate 3000.app.previous");

    // The new copy's run reaches this Mac: the trial ends, and the previous copy goes.
    at.start({ appVersion: HOME_APP }, context);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");
    expect(updated.otherVersion).toBeUndefined();
    await expect.poll(() => readdirSync(appDir)).toEqual(["Firstmate 3000.app"]);
    expect(at.kept()).toBe("the home's own copy");
    expect(at.computers.failedHere(at.deviceId)).toBe(false);
    // The watcher found the trial ended, so it went back on nothing.
    expect(asked()).toEqual([]);
  });

  // A Mac's first update and an update across the rename keep the trial too
  // (INF-5468's plan, piece 2): what they rewrote is put back, not only the copy.
  it("on a Mac's first update, takes the copy away and has the agent start the Mac's own app again", async () => {
    const runnerPlatform = vi.spyOn(platform, "hostPlatform").mockReturnValue("linux");
    stops.push(() => {
      runnerPlatform.mockRestore();
    });
    const at = await world({ fromAnotherMac: true, waitMs: 200 });
    const { context, asked } = standInBackground(at.dataDir);
    const installedApp = bundle("the Mac's own app");
    const ownLauncher = fetchedLauncher(installedApp);
    if (!ownLauncher) throw new Error("no launcher");
    await startInBackground(
      { ...context, spelling: "fm" },
      { launcher: ownLauncher, env: {}, app: null },
    );
    const service = readInstalled(at.dataDir).service;
    if (!service) throw new Error("no agent");
    const agentBefore = readFileSync(service.file, "utf8");
    const record = readFileSync(join(at.dataDir, "installed.json"), "utf8");

    const setUp = asked().length;
    const before = at.start({ appVersion: "0.1.20", trialSeconds: 2 }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    const updating = at.computers.update(at.deviceId);
    expect(await before.ended).toBe("updated");
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    expect(readInstalled(at.dataDir)).toEqual({ service, app: kept });
    expect(readFileSync(service.file, "utf8")).not.toBe(agentBefore);

    // The kept copy exits at start: it never reaches this Mac.
    expect(
      spawnSync(join(kept, "Contents", "MacOS", "Firstmate 3000"), ["work", "run"]).status,
    ).toBe(1);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");

    // The agent's file and the record are back as they were, and launchd read the agent anew.
    await expect.poll(() => existsSync(kept), { timeout: 8_000 }).toBe(false);
    // launchd read it once for the new copy, then once more for the one put back.
    const readAnew = [`bootout gui/502/${service.label}`, `bootstrap gui/502 ${service.file}`];
    await expect
      .poll(() => asked().slice(setUp), { timeout: 8_000 })
      .toEqual([...readAnew, ...readAnew]);
    expect(readFileSync(service.file, "utf8")).toBe(agentBefore);
    expect(readFileSync(join(at.dataDir, "installed.json"), "utf8")).toBe(record);
    expect(readdirSync(join(at.dataDir, "app"))).toEqual(["went-back.json"]);
    expect(readFileSync(join(installedApp, "Contents", "Resources", "marker"), "utf8").trim()).toBe(
      "the Mac's own app",
    );
  });

  // A computer running the home's source is brought back to a release when the
  // home runs one (docs/devices.md, "Matching the home's build"): the release
  // replaces the copy kept at the same path, and the trial puts the build back.
  it("brings a computer running the home's source back to the release, and goes back to its build when the release does not start", async () => {
    // On another Mac: another account on this Mac is compared by version alone, never by build.
    const at = await world({
      kept: true,
      app: bundle("the home's own copy"),
      waitMs: 200,
      fromAnotherMac: true,
    });
    const { context, asked } = standInBackground(at.dataDir);
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    // Its agent starts a build of the home's source, as a source match leaves it.
    const build = scratchDir("infinitary-update-source-build-");
    await startInBackground(
      { ...context, spelling: "fm" },
      { launcher: { executable: "/bin/sh", args: [build] }, env: {}, app: kept },
    );
    const service = readInstalled(at.dataDir).service;
    if (!service) throw new Error("no agent");
    const agentBefore = readFileSync(service.file, "utf8");
    expect(agentBefore).toContain(build);
    const record = readFileSync(join(at.dataDir, "installed.json"), "utf8");

    const setUp = asked().length;
    const before = at.start(
      {
        appVersion: HOME_APP,
        trialSeconds: 2,
        sourceRun: build,
        build: { commit: "a".repeat(40), source: true },
      },
      context,
    );
    // The home runs a release, so the computer's own source run is not the same build.
    await expect.poll(() => at.view()?.otherVersion?.source).toBeUndefined();
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    const updating = at.computers.update(at.deviceId);
    expect(await before.ended).toBe("updated");
    // The home's copy replaced the one kept there, which is set aside whole, and the agent starts it.
    expect(at.kept()).toBe("the home's own copy");
    expect(readFileSync(service.file, "utf8")).not.toContain(build);
    expect(
      readFileSync(
        join(setAsidePath(at.dataDir), "2-Firstmate 3000.app", "Contents", "Resources", "marker"),
        "utf8",
      ).trim(),
    ).toBe("the copy it kept");

    // The release exits at start: it never reaches this Mac.
    expect(
      spawnSync(join(kept, "Contents", "MacOS", "Firstmate 3000"), ["work", "run"]).status,
    ).toBe(1);
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");

    // The kept copy, the agent's file and the record are back, and launchd read the agent anew.
    await expect.poll(() => at.kept(), { timeout: 8_000 }).toBe("the copy it kept");
    await expect
      .poll(() => asked().slice(setUp).includes(`bootstrap gui/502 ${service.file}`), {
        timeout: 8_000,
      })
      .toBe(true);
    expect(readFileSync(service.file, "utf8")).toBe(agentBefore);
    expect(readFileSync(join(at.dataDir, "installed.json"), "utf8")).toBe(record);
    expect(existsSync(build)).toBe(true);
  });

  it("across the rename, keeps the new copy with no trial when its agent starts only at the next login", async () => {
    const at = await world({
      kept: true,
      speaks: "inf",
      app: bundle("Infinitary's own copy", "Infinitary"),
      waitMs: 200,
    });
    const { context, loggedOut } = standInBackground(at.dataDir);
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    const launcher = fetchedLauncher(kept);
    if (!launcher) throw new Error("no launcher");
    await startInBackground({ ...context, spelling: "fm" }, { launcher, env: {}, app: kept });

    const running = at.start({ appVersion: "0.1.20", trialSeconds: 1 }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    loggedOut();
    const updating = at.computers.update(at.deviceId);
    expect(await running.ended).toBe("updated");
    await updating.catch(() => undefined);
    const moved = join(at.dataDir, "app", "Infinitary.app");
    const label = workLabelOf("inf", "release");
    const file = join(context.homeDir, "Library", "LaunchAgents", `${label}.plist`);
    // The new copy and agent stay for the next login, with no trial to take them back.
    expect(readInstalled(at.dataDir)).toEqual({ service: { label, file }, app: moved });
    await expect.poll(() => readdirSync(join(at.dataDir, "app"))).toEqual(["Infinitary.app"]);
  });

  it("across the rename, takes the new copy and its agent away and starts the old agent and copy again", async () => {
    const at = await world({
      kept: true,
      speaks: "inf",
      app: bundle("Infinitary's own copy", "Infinitary"),
      waitMs: 200,
    });
    const { context, asked } = standInBackground(at.dataDir);
    const kept = join(at.dataDir, "app", "Firstmate 3000.app");
    const launcher = fetchedLauncher(kept);
    if (!launcher) throw new Error("no launcher");
    await startInBackground({ ...context, spelling: "fm" }, { launcher, env: {}, app: kept });
    const old = readInstalled(at.dataDir).service;
    if (!old) throw new Error("no agent");
    const agentBefore = readFileSync(old.file, "utf8");

    const running = at.start({ appVersion: "0.1.20", trialSeconds: 2 }, context);
    await expect.poll(() => at.view()?.otherVersion?.updateBy).toBe("connection");
    const updating = at.computers.update(at.deviceId);
    expect(await running.ended).toBe("updated");
    const moved = join(at.dataDir, "app", "Infinitary.app");
    const label = workLabelOf("inf", "release");
    const file = join(context.homeDir, "Library", "LaunchAgents", `${label}.plist`);
    expect(readInstalled(at.dataDir)).toEqual({ service: { label, file }, app: moved });

    // The new copy exits at start: it never reaches this Mac.
    expect(spawnSync(join(moved, "Contents", "MacOS", "Infinitary"), ["work", "run"]).status).toBe(
      1,
    );
    const updated = await updating;
    if ("asks" in updated) throw new Error("Update asked for a password.");

    await expect.poll(() => existsSync(moved), { timeout: 8_000 }).toBe(false);
    // The watcher lets the new agent go, then has launchd read the old one anew.
    await expect
      .poll(() => asked().slice(-3), { timeout: 8_000 })
      .toEqual([
        `bootout gui/502/${label}`,
        `bootout gui/502/${old.label}`,
        `bootstrap gui/502 ${old.file}`,
      ]);
    expect(existsSync(file)).toBe(false);
    expect(readFileSync(old.file, "utf8")).toBe(agentBefore);
    expect(readInstalled(at.dataDir)).toEqual({ service: old, app: kept });
    expect(at.kept()).toBe("the copy it kept");
    expect(readdirSync(join(at.dataDir, "app")).sort()).toEqual([
      "Firstmate 3000.app",
      "went-back.json",
    ]);
  });
});
