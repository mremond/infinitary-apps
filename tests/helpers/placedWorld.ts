import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import type { AccountView } from "@shared/accounts";
import { placesAs } from "@shared/deviceNames";
import { englishOf } from "@shared/i18n/said";
import { PROTOCOL_VERSION } from "@shared/ipc";
import { STARTER_SLOTS } from "@shared/modelSlots";
import type { QuotaSnapshotView } from "@shared/quota";
import type { ComputerForges } from "@shared/signIns";
import { type PlacedSpec, placedTaskFolders } from "@shared/work";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { DevicePairing } from "../../src/core/devices/pairing";
import { createForgeResolver, type Forge } from "../../src/core/forge";
import type { ComputerAccounts } from "../../src/core/helper/accounts";
import { ComputerBrowsers } from "../../src/core/helper/browsers";
import { cleanUp } from "../../src/core/helper/cleanUp";
import { computerKnownHosts, type HeldForges } from "../../src/core/helper/forges";
import { joinHome } from "../../src/core/helper/join";
import { PersonalCopy } from "../../src/core/helper/personalCopy";
import { PlacedTasks } from "../../src/core/helper/placedTasks";
import { type HelperRun, startHelper } from "../../src/core/helper/run";
import { SessionHost } from "../../src/core/helper/sessionHost";
import { startSignIns } from "../../src/core/helper/signIns";
import { WorkingCopies } from "../../src/core/helper/workingCopies";
import { JobManager } from "../../src/core/jobs/jobManager";
import type { AccountVault } from "../../src/core/pi/accountVault";
import { createPiSessionFactory } from "../../src/core/pi/sessionFactory";
import type { ModelRuntime } from "../../src/core/pi/types";
import type { CrewmateTool } from "../../src/core/session/tools";
import { forkChildProcess } from "../../src/core/sql/forkChildProcess";
import { placedLeftovers } from "../../src/core/tasks/leftoverPrograms";
import { seedTask } from "../../src/core/tasks/seedTask";
import { ForgeAuthRequiredError, forgeAuthRequired } from "../../src/core/workspace/forgeAuth";
import { git } from "../../src/core/workspace/git";
import {
  beginAnthropicStream,
  finishAnthropicStream,
  type StubApi,
  type StubRequest,
  startStubApi,
  writeAnthropicText,
  writeAnthropicToolUse,
} from "./anthropicDialect";
import { claimedPort } from "./claimedPort";
import { piStubRuntime } from "./piStubRuntime";
import { type PlacedHome, startPlacedHome } from "./placedHome";
import { scratchDir } from "./scratchDirs";
import type { ContractWorld } from "./sessionContract";
import { moveWorkFolder, olderWorkFolder } from "./workFolderMove";

/**
 * The world of a task whose crewmate runs on a computer that runs work, end
 * to end from the home's side (docs/helper.md, "Holding a conversation"):
 * the real supervisor and task record over a real database,
 * `PlacedSessions` behind the real connection and pairing, and the helper as
 * the work mode composes it holding a real Pi conversation against a local
 * stub of the model's API, or a real Claude session on a scripted client
 * (`scriptedClaudeWorld`). A home restart is a new home over the same folder
 * and port; a computer restart is a new helper over the same folder. Each
 * `src/core/placed/placed*.test.ts` file over it calls `placedWorldHooks` with
 * its own clock.
 */

export const PROVIDER = "fm-placed";
/** The task commands' launcher (`resources/axi-bin`), which a granted shell finds on its path. */
const AXI_BIN_DIR = resolve(__dirname, "../../resources/axi-bin");
export const MODEL = "stub-1";
/** A second model the same stub connection serves, for a task routed again there. */
export const OTHER_MODEL = "stub-2";
const BUILDER = { name: "builder", uid: 502 };

/** The model's stub API and the runtime over it, started once for each test file. */
export let api: StubApi;
export let runtime: ModelRuntime;

/** What each case started, stopped in reverse order after it. */
export const stops: (() => Promise<void> | void)[] = [];

/** Computers a test calls out of reach only because their connection is being made. */
export const connectingNow = new Set<string>();

/** Computers a test says the home follows the update of (`Computers.updatingOf`). */
export const updatingNow = new Set<string>();

/** The home's one clock, which each test file owns and moves on (`placedWorldHooks`). */
let clock: () => number = Date.now;

/**
 * Registers a test file's hooks over its own clock: the model's stub API
 * and runtime for the file, and after each case every stop in reverse
 * order, the clock set back and the stubbed environment undone.
 */
export function placedWorldHooks(file: { now: () => number; reset: () => void }): void {
  clock = file.now;
  beforeAll(async () => {
    api = await startStubApi(() => true);
    runtime = await piStubRuntime(api.url, { provider: PROVIDER, id: MODEL }, [OTHER_MODEL]);
  });
  afterAll(async () => {
    await api.close();
  });
  afterEach(async () => {
    for (const stop of stops.splice(0).reverse()) await stop();
    file.reset();
    vi.unstubAllEnvs();
  });
}

/** What the model does on one request: call tools, answer, or answer once a test lets it. */
export type Step = (
  | { tools: { name: string; args: Record<string, unknown> }[] }
  | { text: string }
  /** The provider refuses the request with this message, as its API answers a bad request. */
  | { refuse: string }
) & {
  held?: Promise<void>;
};

/**
 * The model, one step per request from now on; past the last step it
 * answers "Done.". A model that reads what it was told picks each step from
 * the request instead.
 */
export function model(steps: Step[] | ((request: StubRequest, index: number) => Step)): void {
  const first = api.requests.length;
  api.answer((request: StubRequest, res: ServerResponse) => {
    const index = request.n - first - 1;
    const step =
      typeof steps === "function" ? steps(request, index) : (steps[index] ?? { text: "Done." });
    if ("refuse" in step) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          type: "error",
          error: { type: "invalid_request_error", message: step.refuse },
        }),
      );
      return;
    }
    beginAnthropicStream(res, 100, request.n);
    const answer = () => {
      if ("text" in step) {
        writeAnthropicText(res, 0, step.text);
        finishAnthropicStream(res, "end_turn", 3);
        return;
      }
      for (const [index, tool] of step.tools.entries())
        writeAnthropicToolUse(res, index, {
          id: `toolu_${request.n}_${index}`,
          name: tool.name,
          args: tool.args,
        });
      finishAnthropicStream(res, "tool_use", 5);
    };
    if (step.held) void step.held.then(answer);
    else answer();
  });
}

/** A gate a model step waits at. */
export function gate(): { held: Promise<void>; open: () => void } {
  let open!: () => void;
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { held, open };
}

/** The words of every user turn a request carried. */
export function said(request: StubRequest | undefined): string {
  return JSON.stringify(request?.body.messages ?? []);
}

/** Where each project lives, as the home finds it for the project's folder. */
export type ForgeFor = NonNullable<Parameters<typeof startPlacedHome>[0]["forgeFor"]>;

/** The home over its folder, with this file's clock, on real Pi's control plane. */
export function startHome(
  userData: string,
  port: number,
  pairing: () => DevicePairing,
  forgeFor?: ForgeFor,
  extra: Pick<
    Parameters<typeof startPlacedHome>[0],
    | "routing"
    | "runsForAnotherFirstmate"
    | "github"
    | "google"
    | "browsers"
    | "knowledge"
    | "files"
    | "programProcess"
    | "secrets"
    | "runbooks"
    | "personal"
  > & {
    /** A task that moves home runs its conversation here on real Pi. */
    runsHere?: boolean;
    claude?: ContractWorld;
    scheduleCopy?: Parameters<typeof startPlacedHome>[0]["scheduleCopy"];
  } = {},
): PlacedHome {
  const home = startPlacedHome({
    userData,
    port,
    pairing,
    now: () => clock(),
    scheduleCopy: extra.scheduleCopy,
    // A home whose crew runs on Claude binds every task to Claude there.
    binding: extra.claude?.binding ?? { backend: "pi", runtime },
    profiles: {
      pi: createPiSessionFactory({ agentDir: join(userData, "pi-agent") }).controlProfile,
      ...(extra.claude ? { claude: extra.claude.factory.controlProfile } : {}),
    },
    ...(forgeFor ? { forgeFor } : {}),
    reachOf: (deviceId) => (connectingNow.has(deviceId) ? "connecting" : "out-of-reach"),
    updatingOf: (deviceId) => updatingNow.has(deviceId),
    ...(extra.routing ? { routing: extra.routing } : {}),
    ...(extra.runsForAnotherFirstmate
      ? { runsForAnotherFirstmate: extra.runsForAnotherFirstmate }
      : {}),
    ...(extra.github ? { github: extra.github } : {}),
    ...(extra.google ? { google: extra.google } : {}),
    ...(extra.browsers ? { browsers: extra.browsers } : {}),
    ...(extra.knowledge ? { knowledge: true } : {}),
    ...(extra.files ? { files: extra.files } : {}),
    ...(extra.programProcess ? { programProcess: extra.programProcess } : {}),
    ...(extra.secrets ? { secrets: extra.secrets } : {}),
    ...(extra.runbooks ? { runbooks: extra.runbooks } : {}),
    ...(extra.personal ? { personal: extra.personal } : {}),
    ...(extra.runsHere
      ? { here: createPiSessionFactory({ agentDir: join(userData, "pi-agent") }) }
      : {}),
    log: (line) => process.env.PLACED_DEBUG && process.stderr.write(`[home] ${line}\n`),
  });
  stops.push(home.quit);
  return home;
}

/**
 * The computer's own sign-ins as it lists them for its home, answered by the
 * real sign-in host over the account rows it holds and the models each
 * serves there; nothing is signed in.
 */
export function signedInTo(
  accounts: AccountView[],
  forgesView?: () => ComputerForges,
  served: ServedThere[] = [],
  allowance: () => QuotaSnapshotView | null = () => null,
) {
  const held = {
    vault: {
      views: async () => accounts,
      swept: async () => {},
      onCutOffChange: () => () => true,
      customViews: () => [],
      // Only an account it holds serves anything there, as its vault lists them.
      availableModelsByAccount: () =>
        served.flatMap((row) => {
          const account = accounts.find((entry) => entry.id === row.accountId);
          return account
            ? [{ ...row, accountLabel: row.accountId, providerId: account.providerId }]
            : [];
        }),
    } as unknown as AccountVault,
    providers: () => [],
    // What its accounts' allowance reads there; absent, nothing is read yet.
    allowance,
    readAllowance: async () => allowance(),
    close: () => {},
  } satisfies ComputerAccounts;
  const forges = {
    view: () => forgesView?.() ?? { signIns: [], hosts: [] },
    start: async () => {},
    startBrowser: async () => {},
    signInWithKey: async () => ({ ok: false, problem: "not-server", host: null }),
    // No GitHub CLI there.
    signInWithCli: async (host) => ({ ok: false, problem: "missing", host }),
    cancel: () => {},
    signOut: () => {},
    checkHealth: async () => {},
    close: () => {},
  } satisfies HeldForges;
  return (start: Parameters<typeof startSignIns>[0]) =>
    startSignIns({ ...start, accounts: async () => held, forges: () => forges });
}

/** A home and a computer joined to it as another user, running work with real Pi. */
export async function world(
  forgeFor?: ForgeFor,
  options: {
    remoteLogin?: string;
    /** This Mac's own subscriptions, for a home that routes. */
    routing?: Parameters<typeof startPlacedHome>[0]["routing"];
    /** The accounts the computer lists as its own sign-ins. */
    signedInTo?: AccountView[];
    /** The models each of those accounts serves there, as that computer reads them. */
    served?: ServedThere[];
    /** Those accounts' allowance as that computer reads it now; absent, none is read. */
    allowance?: () => QuotaSnapshotView | null;
    /** The computer's own sign-ins where projects live, as it lists them. */
    forges?: () => ComputerForges;
    /** Whether the computer's clone is refused by GitHub for want of its own sign-in there. */
    refuseClone?: () => boolean | string;
    /** What the computer's conversations run on; this file's stub unless named. */
    runtime?: ModelRuntime;
    /**
     * Claude's factory on a scripted client (`scriptedClaudeWorld`), which the
     * computer's Claude conversations run on, and every task's crew binds to.
     */
    claude?: ContractWorld;
    scheduleCopy?: Parameters<typeof startPlacedHome>[0]["scheduleCopy"];
    /** Whether Firstmate there runs work for another Firstmate now, as the home's SSH connection found. */
    runsForAnotherFirstmate?: (deviceId: string) => boolean;
    /**
     * Its work starts in Firstmate 3000's folder, as a computer's does
     * before its first update to Infinitary (`moveComputer`).
     */
    inOlderFolder?: boolean;
    /**
     * Its crewmates' long commands are background jobs there, kept as the
     * work mode keeps them (`startConversations`); otherwise Pi's own bash.
     * `counted`: it tells the home how many run but names none, as a
     * computer built before it named the job (included in the current work major) does.
     */
    jobs?: boolean | "counted";
    /** The contract the computer's hello names; this build's own unless a test stands in an older one. */
    protocolVersion?: string;
    /** The contract changes the computer's hello lists; this build's own unless a test stands in an older one. */
    changes?: readonly string[];
    tools?: readonly CrewmateTool[];
    /** The home's github.com sign-in, whose integrations its crew there reaches through its task channel. */
    github?: Parameters<typeof startPlacedHome>[0]["github"];
    secrets?: Parameters<typeof startPlacedHome>[0]["secrets"];
    runbooks?: Parameters<typeof startPlacedHome>[0]["runbooks"];
    /** Google's stand-in, which the home's integrations reach. */
    google?: Parameters<typeof startPlacedHome>[0]["google"];
    /** The home's knowledge, whose standing directions its crew is told. */
    knowledge?: boolean;
    /** A task that moves home runs its conversation here on real Pi. */
    runsHere?: boolean;
    /** Where the computer's task browsers report on the home. */
    browsers?: Parameters<typeof startPlacedHome>[0]["browsers"];
    /** The home's files command, over a scratch home folder (docs/files.md). */
    files?: Parameters<typeof startPlacedHome>[0]["files"];
    /** The program process the home's crew runs programs in (docs/programs.md). */
    programProcess?: Parameters<typeof startPlacedHome>[0]["programProcess"];
    /**
     * The computer's task channel, as the work mode opens it
     * (`ComputerBrowsers`), over the command process bundled at this path;
     * otherwise it keeps none, and its roster says so.
     */
    taskChannel?: string;
    /**
     * The computer's own folder for a Secrets use's private copies, as
     * `startConversations` gives it, so its Secrets command takes uses and
     * asks the home lets it take; otherwise it lists the catalog alone.
     */
    secretRuns?: boolean;
    /**
     * The computer gives its crewmates the stops command over that task
     * channel and runs a closed task's stops and keeps at its close order,
     * as the work mode does (docs/leftover-programs.md, "On a computer that
     * runs work"); otherwise a close there sweeps nothing.
     */
    leftovers?: boolean;
    /**
     * The home's personal set, read from this folder as the home's home
     * folder, which the computer keeps as the work mode does (`PersonalCopy`).
     */
    personal?: Parameters<typeof startPlacedHome>[0]["personal"];
  } = {},
) {
  const userData = scratchDir("infinitary-placed-home-");
  let pairing: DevicePairing | undefined;
  const pairingNow = () => {
    pairing ??= new DevicePairing({
      dir: join(userData, "devices"),
      onProblem: () => {},
      interfaces: () => ({}),
      ownUid: 501,
    });
    return pairing;
  };
  stops.push(() => pairing?.dispose());
  const port = await claimedPort();
  let home = startHome(userData, port, pairingNow, forgeFor, options);
  await home.listen();
  const { link } = pairingNow().invite(
    { kind: "work", at: `127.0.0.1:${port}` },
    // Added by its address, as the home does over Remote Login.
    options.remoteLogin ? { remoteLogin: options.remoteLogin } : {},
  );
  await home.settled();
  // The application-data folder that holds both apps' folders, for a computer
  // whose work starts in Firstmate 3000's.
  const appData = options.inOlderFolder ? scratchDir("infinitary-placed-app-data-") : undefined;
  let dataDir = appData ? olderWorkFolder(appData) : scratchDir("infinitary-placed-computer-");
  if (appData) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const joined = await joinHome({
    text: link,
    dataDir,
    io: { say: () => {}, ask: async () => "yes" },
    device: { name: "Mac mini", user: BUILDER },
    timeoutMs: 2_000,
  });
  if (!joined.ok) throw new Error(joined.reason);
  const deviceId = joined.grant.deviceId;

  let run: HelperRun | undefined;
  /** The computer refuses to open a conversation, as one with no sign-in for its provider does. */
  let refusing = false;
  /** The contract the running computer's hello names. */
  let protocolVersion = options.protocolVersion;
  /** The contract changes the running computer's hello lists. */
  let changes = options.changes;
  /** Every binding the home asked the computer to resolve with its own sign-ins. */
  const bound: PlacedSpec["binding"][] = [];
  /** Every order the computer was sent, oldest first, by its channel. */
  const ordered: string[] = [];
  const startComputer = (
    tools: readonly CrewmateTool[] | undefined = options.tools,
    version = protocolVersion,
  ) => {
    const started = startHelper({
      dataDir,
      say: () => {},
      retryMs: [20],
      ...(version ? { protocolVersion: version } : {}),
      ...(changes ? { changes } : {}),
      ...(options.signedInTo
        ? {
            signIns: signedInTo(
              options.signedInTo,
              options.forges,
              options.served,
              options.allowance,
            ),
          }
        : {}),
      // Removed, it removes what Firstmate set up here; no agent was set up.
      cleanUp: () => cleanUp({ dataDir, background: null }),
      conversations: async ({ dataDir: dir, ask, tell, homeChanges, homeVersion }) => {
        const copies = new WorkingCopies(dir, { pool: false });
        if (options.refuseClone) {
          // GitHub refuses the clone for want of this computer's own sign-in,
          // as its git would say it (`forgeAuthRequired`).
          const prepare = copies.prepare.bind(copies);
          copies.prepare = async (task, project, seed) => {
            const refused = options.refuseClone?.();
            if (refused === true)
              throw new ForgeAuthRequiredError("GitHub requires sign-in to fetch this project.");
            if (typeof refused === "string") {
              // That address's host refused it, read the way this computer reads
              // its git's words, by the hosts it knows (`computerKnownHosts`).
              const said = forgeAuthRequired(
                refused,
                {
                  stderr: `remote: HTTP Basic: Access denied\nfatal: Authentication failed for '${refused}/'`,
                },
                computerKnownHosts(dir),
              );
              throw said ?? new Error(`${refused} was not read as wanting a sign-in`);
            }
            return prepare(task, project, seed);
          };
        }
        const tasks = new PlacedTasks(dir, copies.worktreesDir);
        let host: SessionHost | undefined;
        const jobs = options.jobs
          ? new JobManager({
              rows: tasks.jobRows,
              onChange: () => host?.jobsChanged(),
              onExit: (exit) => host?.jobExit(exit),
              belowUi: false,
            })
          : undefined;
        // Its task channel, as `startConversations` opens it; no page opens here.
        const entry = options.taskChannel;
        const channel = entry
          ? await ComputerBrowsers.open({
              host: {
                open: async () => {
                  throw new Error("No page opens on this computer here.");
                },
              },
              spawner: forkChildProcess(entry),
              binDir: AXI_BIN_DIR,
              version: "9.9.9-test",
              keysDir: join(dir, "task-channel"),
              evidenceDir: (task) => tasks.folders(task).evidence,
              ...(options.leftovers
                ? { taskFolder: (task: string) => tasks.folders(task).root }
                : {}),
              ...(jobs ? { answering: (shell: string) => jobs.answering(shell) } : {}),
              tell,
              ask,
              log: (line) =>
                process.env.PLACED_DEBUG && process.stderr.write(`[channel] ${line}\n`),
            })
          : undefined;
        host = new SessionHost({
          tasks,
          copies,
          ask,
          ...(homeChanges ? { homeChanges } : {}),
          ...(options.secretRuns ? { secretRunsDir: join(dir, "secret-runs") } : {}),
          // Work compatibility reads the real welcome, as startConversations does;
          // omitting it incorrectly refuses supported artifact and branch operations.
          ...(homeVersion ? { homeVersion } : {}),
          ...(options.personal ? { personal: new PersonalCopy(join(dir, "personal")) } : {}),
          factories: {
            pi: createPiSessionFactory({
              agentDir: join(dir, "pi-agent"),
              ...(jobs ? { runBash: (input) => jobs.run(input) } : {}),
            }),
            ...(options.claude ? { claude: options.claude.factory } : {}),
          },
          ...(jobs
            ? {
                runningJobCount: (task: string) => jobs.runningJobCount(task),
                ...(options.jobs === "counted"
                  ? {}
                  : { oldestRunningJob: (task: string) => jobs.oldestRunningJob(task) }),
                killJobs: (task: string) => jobs.killForOwner(task),
              }
            : {}),
          bind: async (binding) => {
            bound.push(binding);
            if (refusing) throw new Error(`This computer has no sign-in for ${PROVIDER} here.`);
            if (binding.backend === "claude" && options.claude) return options.claude.binding;
            // Signed in there, it binds the account of its own the home named.
            const own = options.signedInTo?.find((account) => account.id === binding.accountId);
            return {
              backend: "pi",
              runtime: options.runtime ?? runtime,
              ...(own ? { accountId: own.id } : {}),
            };
          },
          // A conversation bound to an account of its own says so, as a computer's does.
          ...(options.signedInTo
            ? { accounts: { of: (binding) => binding.accountId, noteCutOff: () => {} } }
            : {}),
          ...(tools ? { tools } : {}),
          ...(options.leftovers ? { leftovers: placedLeftovers(tasks) } : {}),
          ...(channel
            ? {
                commands: {
                  grant: (task, granted) => channel.grant(task, granted),
                  close: (task) => channel.close(task),
                },
              }
            : {}),
          log: (line) => process.env.PLACED_DEBUG && process.stderr.write(`[computer] ${line}\n`),
        });
        const held = host;
        // The orders the computer is still answering when it stops, such as a
        // keep running git in a working copy, whose answer is then written to
        // its task's folder. Its own process ends with them; here that process
        // is the test's, which goes on, so the computer's stop waits for them
        // instead, and nothing writes into its folder after its test returns.
        const answering = new Set<Promise<unknown>>();
        const answer = held.answer.bind(held);
        held.answer = (channel, args) => {
          ordered.push(channel);
          const answered = answer(channel, args);
          answering.add(answered);
          const settle = () => answering.delete(answered);
          answered.then(settle, settle);
          return answered;
        };
        return {
          host: held,
          close: async () => {
            await held.close();
            await Promise.allSettled(answering);
            channel?.closeAll();
            jobs?.disposeAll();
          },
        };
      },
    });
    if (!started.ok) throw new Error(started.reason);
    run = started.run;
  };
  stops.push(() => run?.stop());
  startComputer();

  /** Resolves once the computer is in reach and its roster read. */
  const inReach = async (taskId = "none") => {
    await expect.poll(() => home.placed.ready(deviceId, taskId)).toBe(true);
  };
  if (options.protocolVersion && options.protocolVersion !== PROTOCOL_VERSION)
    await expect.poll(() => home.devices.version(deviceId)?.contract).toBe(options.protocolVersion);
  else await inReach();
  return {
    deviceId,
    /** The computer's work folder now: Infinitary's once `moveComputer` moved it. */
    get dataDir() {
      return dataDir;
    },
    home: () => home,
    pairing: pairingNow,
    /** Whether the computer's own process still runs. */
    running: () => run,
    inReach,
    /** A queued task placed on the computer, started now that it is in reach. */
    start: async (id: string, prompt = "Fix the footer.", repoId?: string) => {
      seedTask(home.tasks, {
        id,
        title: "website",
        prompt,
        status: "queued",
        deviceId,
        ...(repoId ? { repoId } : {}),
      });
      await home.supervisor.starts.dispatchQueuedTask(id);
      expect(home.tasks.get(id)?.status).toBe("active");
    },
    /**
     * Firstmate on the home quits and starts again over the same folder and
     * port, after `whileStopped` runs on what it left; `beforeListen` sees
     * the new home before the computer can reach it.
     */
    restartHome: async (
      whileStopped?: () => void | Promise<void>,
      beforeListen?: (home: PlacedHome) => void,
    ) => {
      await home.quit();
      pairing?.dispose();
      pairing = undefined;
      await whileStopped?.();
      home = startHome(userData, port, pairingNow, forgeFor, options);
      beforeListen?.(home);
      await home.listen();
    },
    /**
     * The computer's own process quits, and starts again from the same
     * folder; updated, with the crewmate tools its new version binds.
     */
    restartComputer: async (updated?: {
      tools?: readonly CrewmateTool[];
      protocolVersion?: string;
      /** The contract changes its new version lists. */
      changes?: readonly string[];
    }) => {
      if (updated?.protocolVersion) protocolVersion = updated.protocolVersion;
      if (updated?.changes) changes = updated.changes;
      await run?.stop();
      startComputer(updated?.tools);
    },
    /** The computer's own process quits, as when nobody is logged in there. */
    stopComputer: async () => {
      await run?.stop();
    },
    /**
     * The computer's first update to Infinitary: its work stops, the
     * one-time move brings Firstmate 3000's folder into Infinitary's, and its
     * work runs again from there (docs/helper.md, "Under the other name"),
     * after `moved` runs on the work folder the move made.
     */
    moveComputer: async (moved?: (work: string) => void) => {
      if (!appData) throw new Error("This computer's work is in no older folder.");
      await run?.stop();
      dataDir = await moveWorkFolder(appData);
      moved?.(dataDir);
      startComputer();
    },
    /** The computer's folder for a task. */
    folders: (taskId: string) =>
      placedTaskFolders(join(dataDir, "tasks"), taskId, join(dataDir, "worktrees")),
    /** Every binding the home asked the computer to resolve, oldest first. */
    bound,
    ordered,
    /** Whether the computer refuses to open a conversation from now on. */
    refuseOpens: (on: boolean) => {
      refusing = on;
    },
    /** What the computer holds: a folder per task, and a working copy per task. */
    holds: () => ({
      tasks: listed(join(dataDir, "tasks")),
      workingCopies: listed(join(dataDir, "worktrees")),
    }),
  };
}

/** This Mac signed in to Codex alone, with allowance to spare, and the catalog it lists. */
export const THIS_MAC_ON_CODEX = {
  available: [{ provider: "openai-codex", id: "gpt-6-sol" }],
  catalog: [
    { provider: "codex", id: "gpt-6-sol", label: "GPT-6 Sol", effectivePercentRemaining: 90 },
  ],
  catalogModels: [
    { provider: "openai-codex", id: "gpt-6-sol", name: "GPT-6 Sol" },
    { provider: "xai", id: "grok-stub", name: "Grok stub" },
  ],
};

/** The models one account on a computer serves, as that computer's own runtime lists them. */
export type ServedThere = {
  accountId: string;
  models: { provider: string; id: string; name?: string }[];
};

/** What the computer's Grok account serves there: the one model its runtime defines. */
export const GROK_THERE: ServedThere[] = [
  {
    accountId: "acct_grok_there",
    models: [{ provider: "xai", id: "grok-stub", name: "Grok stub" }],
  },
];

/** The Codex model the starter map places at medium, which routing takes first. */
export const CODEX_MEDIUM_STARTER = Object.entries(STARTER_SLOTS["openai-codex"] ?? {}).find(
  ([, slots]) => slots.includes("medium"),
)?.[0] as string;

/**
 * This Mac signed in to Codex, whose catalog lists the starter map's medium
 * model beside GPT-6 Sol, a Codex model the starter map places nowhere.
 */
export const THIS_MAC_ON_NEWER_CODEX = {
  available: [
    { provider: "openai-codex", id: CODEX_MEDIUM_STARTER },
    { provider: "openai-codex", id: "gpt-6-sol" },
  ],
  catalog: [
    {
      provider: "codex",
      id: CODEX_MEDIUM_STARTER,
      label: CODEX_MEDIUM_STARTER,
      effectivePercentRemaining: 90,
    },
    { provider: "codex", id: "gpt-6-sol", label: "GPT-6 Sol", effectivePercentRemaining: 90 },
  ],
  catalogModels: [
    { provider: "openai-codex", id: CODEX_MEDIUM_STARTER, name: CODEX_MEDIUM_STARTER },
    { provider: "openai-codex", id: "gpt-6-sol", name: "GPT-6 Sol" },
  ],
};

/** An account row as a computer lists it: signed in and serving unless a test says otherwise. */
export function computerAccount(
  id: string,
  providerId: string,
  extra: Partial<AccountView> = {},
): AccountView {
  return {
    id,
    providerId,
    kind: "subscription_oauth",
    label: id,
    enabled: true,
    connected: true,
    pinned: false,
    createdAt: 1,
    ...extra,
  };
}

/** The folders under `dir`, none when it is absent. */
export function listed(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/** The timeline kinds a task's record holds, oldest first. */
export function kinds(home: PlacedHome, taskId: string): string[] {
  return home.tasks.timeline(taskId).map((event) => event.kind);
}

/** Manual-placement journeys name their starting computer instead of borrowing a default. */
export async function adoptHere(repos: PlacedHome["repos"], path: string) {
  const result = await repos.setup({ kind: "adopt", path });
  return { ...result, repo: repos.setRunsOn(result.repo.id, null) };
}

/** The feed's lines, oldest first. */
export function feed(home: PlacedHome): string[] {
  return home.events.flatMap((event) => (event.type === "firstmate_note" ? [event.text] : []));
}

/**
 * The newest feed line holding `words`, as a computer that controls the first mate words it
 * there, naming the first mate's computer `there` (docs/view.md, "The first mate's own words");
 * undefined for a line saved without its fact.
 */
export function feedNamedThere(home: PlacedHome, words: string, there: string): string | undefined {
  const note = home.events.findLast(
    (event) => event.type === "firstmate_note" && event.text.includes(words),
  );
  return note?.type === "firstmate_note" && note.said
    ? englishOf(placesAs(note.said, there))
    : undefined;
}

export async function commit(dir: string, message: string): Promise<string> {
  await git(dir, ["add", "-A"]);
  await git(dir, [
    "-c",
    "user.name=Crewmate",
    "-c",
    "user.email=crew@localhost",
    "commit",
    "-q",
    "-m",
    message,
  ]);
  return git(dir, ["rev-parse", "HEAD"]);
}

/**
 * A project where it lives - a bare repository on disk with one commit on
 * `main` - and the home's own clone of it, named `home`. Its forge is a plain
 * Git host over that origin, sending from `home` unless named another clone,
 * whose workflow evidence answers one artifact.
 */
export async function gitProject() {
  const root = scratchDir("infinitary-placed-project-");
  const origin = join(root, "origin.git");
  await git(root, ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
  const seed = join(root, "seed");
  await git(root, ["clone", "--quiet", origin, seed]);
  writeFileSync(join(seed, "README.md"), "# website\n");
  const main = await commit(seed, "chore: start the website");
  await git(seed, ["push", "--quiet", "origin", "HEAD:main"]);
  const home = join(root, "home");
  await git(root, ["clone", "--quiet", origin, home]);
  const forge = (bytes: Buffer, path = home): Forge =>
    Object.assign(
      // A plain Git host: open_change sends the branch up from this Mac's own repository.
      createForgeResolver({
        github: () => {
          throw new Error("This project does not live on GitHub.");
        },
      })({
        path,
        origin,
        host: { kind: "git", name: "git.example.com" },
      }),
      {
        workflows: {
          run: async (id: number) => ({
            id,
            name: "checks",
            headSha: main,
            branch: null,
            attempt: 1,
            status: "completed",
            conclusion: "failure",
            url: "https://git.example.com/runs/41",
          }),
          jobs: async () => ({ jobs: [], total: 0, complete: true }),
          jobLog: async () => {
            throw new Error("No job logs here.");
          },
          download: async (_runId: number, artifactId: number) => ({
            artifact: {
              id: artifactId,
              name: "logs",
              sizeBytes: bytes.length,
              expired: false,
              expiresAt: "2026-11-01T00:00:00Z",
            },
            bytes,
          }),
          archive: async (_runId: number, artifactId: number) => ({
            artifact: {
              id: artifactId,
              name: "logs",
              sizeBytes: bytes.length,
              expired: false,
              expiresAt: "2026-11-01T00:00:00Z",
            },
            archive: {
              size: bytes.length,
              read: async (start: number, end: number) => bytes.subarray(start, end),
            },
          }),
        },
      },
    );
  return { origin, home, main, forge };
}
