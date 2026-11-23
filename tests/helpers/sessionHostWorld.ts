import { existsSync, mkdirSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { HOME_CAPABILITIES, PROTOCOL_VERSION } from "@shared/ipc";
import type {
  PlacedEventRecord,
  PlacedSpec,
  WorkOrderChannel,
  WorkOrderResponse,
} from "@shared/work";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { type HomeConnection, startConnection } from "../../src/core/connection/connection";
import { DevicePairing } from "../../src/core/devices/pairing";
import type { CoreActor, CoreDispatch } from "../../src/core/dispatcher";
import { CoreEventBus } from "../../src/core/events";
import { joinHome } from "../../src/core/helper/join";
import { PersonalCopy } from "../../src/core/helper/personalCopy";
import { PlacedTasks } from "../../src/core/helper/placedTasks";
import { type HelperRun, startHelper } from "../../src/core/helper/run";
import { SessionHost, type SessionHostOptions } from "../../src/core/helper/sessionHost";
import type { WorkingCopies } from "../../src/core/helper/workingCopies";
import type { MediaProbe, TypefaceProbe } from "../../src/core/pi/cardImages";
import { createPiSessionFactory } from "../../src/core/pi/sessionFactory";
import type { ModelRuntime } from "../../src/core/pi/types";
import type { CrewmateTool } from "../../src/core/session/tools";
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
import { scratchDir } from "./scratchDirs";
import { scriptedClaudeCleanup } from "./scriptedClaudeContract";
import type { ContractWorld } from "./sessionContract";
import { moveWorkFolder, olderWorkFolder } from "./workFolderMove";

/**
 * The world of a crewmate's conversation held on a computer that runs work
 * (docs/helper.md, "Holding a conversation"), end to end on this side: the
 * helper as the app's work mode composes it, joined through the real
 * pairing, over the real connection, holding a real Pi conversation against
 * a local stub of the model's API. The home is a stand-in that answers the
 * work requests the way the home keeps them (src/shared/work.ts): every
 * answer under the id it was asked by, every event once, in order. Nothing
 * reaches the network, and no sign-in is read.
 * Each `src/core/helper/sessionHost*.test.ts` file over it calls
 * `sessionHostHooks`.
 */

export const PROVIDER = "fm-placed";
export const MODEL = "stub-1";
/** A second model the same stub connection serves, for a conversation that changes model. */
export const OTHER_MODEL = "stub-2";
export const TASK = "task-placed";
const BUILDER = { name: "builder", uid: 502 };

/** The model's stub API and the runtime over it, started once for each test file. */
export let api: StubApi;
export let runtime: ModelRuntime;

/** A real grayscale PNG, 4x3 by default; distinct widths produce distinct picture ids. */
export function png(width = 4): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(3, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((width + 1) * 3))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** What the model does on one request: call tools, or answer and end the turn. */
export type Step = { tools: { name: string; args: Record<string, unknown> }[] } | { text: string };

/** The model, one step per request from now on; past the last step it answers "Done." */
export function model(steps: Step[]): void {
  const first = api.requests.length;
  api.answer((request: StubRequest, res: ServerResponse) => {
    const step = steps[request.n - first - 1] ?? { text: "Done." };
    beginAnthropicStream(res, 100, request.n);
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
  });
}

/** One first-time effect of a work request at the home, and how many events it had taken in by then. */
export type Effect = {
  channel: string;
  callId: string;
  request: Record<string, unknown>;
  after: number;
};

/**
 * The home's side as a stand-in: what the real home keeps (src/shared/work.ts)
 * - an answer per call id, kept before it is returned and answered again
 * from there; each event once, in order; `kept` at each turn's end - and a
 * gate a test can hold one kind of request at.
 */
export function standInHome() {
  const ledger = new Map<string, unknown>();
  const effects: Effect[] = [];
  const asked: { channel: string; callId: string }[] = [];
  const events: PlacedEventRecord[] = [];
  const actors: CoreActor[] = [];
  const pictures = new Map<string, Buffer>();
  const recordings = new Map<string, Buffer>();
  const typefaces = new Map<string, Buffer>();
  let through = 0;
  let kept = 0;
  const gates = new Map<string, { reached: () => void; open: Promise<void> }>();
  const answers = new Map<string, unknown>();
  let cards = 0;

  const answerFor = (channel: string, request: Record<string, unknown>): unknown => {
    if (answers.has(channel)) return answers.get(channel);
    switch (channel) {
      case "inf:work:card":
        cards += 1;
        return { shown: true, cardId: `card-${cards}` };
      case "inf:work:picture":
        pictures.set(String(request.id), Buffer.from(String(request.data), "base64"));
        return { ok: true };
      case "inf:work:typeface":
        typefaces.set(String(request.id), Buffer.from(String(request.data), "base64"));
        return { ok: true };
      case "inf:work:media": {
        const id = String(request.id);
        const piece = Buffer.from(String(request.data), "base64");
        recordings.set(id, Buffer.concat([recordings.get(id) ?? Buffer.alloc(0), piece]));
        return { ok: true };
      }
      case "inf:work:tasks":
        // More match than one page holds, so a list read is one that stops short.
        return { rows: [{ key: "FI3-1", title: "A task" }], total: 2 };
      case "inf:work:card-refused":
      case "inf:work:job-exit":
        return { ok: true };
      default:
        return { text: `${channel} done` };
    }
  };

  const dispatch = (async (channel: string, rawArgs: unknown, actor?: CoreActor) => {
    if (channel === "inf:app:healthcheck")
      return {
        ok: true,
        version: "9.9.9",
        platform: "test-os",
        protocolVersion: PROTOCOL_VERSION,
        capabilities: [...HOME_CAPABILITIES],
      };
    if (actor) actors.push(actor);
    const [request] = rawArgs as [Record<string, unknown>];
    if (channel === "inf:work:events") {
      const gate = gates.get(channel);
      if (gate) {
        gate.reached();
        await gate.open;
      }
      for (const record of request.events as PlacedEventRecord[]) {
        if (record.seq <= through) continue;
        if (record.seq !== through + 1) break;
        events.push(record);
        through = record.seq;
        if (record.event.type === "turn_end" || record.event.type === "turn_ended") kept = through;
      }
      return { through, kept };
    }
    const callId = String(request.callId);
    asked.push({ channel, callId });
    if (ledger.has(callId)) return ledger.get(callId);
    const gate = gates.get(channel);
    if (gate) {
      gate.reached();
      await gate.open;
    }
    // Asked again while the first one waited: one effect, one answer.
    if (ledger.has(callId)) return ledger.get(callId);
    effects.push({ channel, callId, request, after: through });
    const answer = answerFor(channel, request);
    ledger.set(callId, answer);
    return answer;
  }) as CoreDispatch;

  return {
    dispatch,
    effects,
    asked,
    events,
    actors,
    pictures,
    recordings,
    typefaces,
    /** The event types the home took in, in order. */
    types: () => events.map((record) => record.event.type),
    /** The home's answer to every request of one kind from now on, in place of its usual one. */
    answer(channel: string, value: unknown) {
      answers.set(channel, value);
    },
    /** Holds every request of one kind until `open()`; `reached` resolves when the first arrives. */
    hold(channel: string) {
      let reached!: () => void;
      let open!: () => void;
      const arrived = new Promise<void>((resolve) => {
        reached = resolve;
      });
      gates.set(channel, {
        reached,
        open: new Promise<void>((resolve) => {
          open = resolve;
        }),
      });
      return {
        reached: arrived,
        open: () => {
          gates.delete(channel);
          open();
        },
      };
    },
  };
}

const connections: HomeConnection[] = [];
const pairings: DevicePairing[] = [];
const runs: HelperRun[] = [];

/**
 * Registers a test file's hooks: the model's stub API and runtime for the
 * file, and after each case every helper run stopped, every connection
 * closed, every pairing disposed and the scripted Claude client cleaned up.
 */
export function sessionHostHooks(): void {
  beforeAll(async () => {
    api = await startStubApi(() => true);
    runtime = await piStubRuntime(api.url, { provider: PROVIDER, id: MODEL }, [OTHER_MODEL]);
  });
  afterAll(async () => {
    await api.close();
  });
  afterEach(async () => {
    await Promise.all(runs.splice(0).map((run) => run.stop()));
    await Promise.all(connections.splice(0).map((connection) => connection.close()));
    for (const pairing of pairings.splice(0)) pairing.dispose();
    await scriptedClaudeCleanup();
  });
}

/**
 * The working copies a computer keeps, as far as a conversation reads them:
 * a task's is its folder under `worktrees/`, made and deleted by the test as
 * `WorkingCopies` makes and retires one, with no git.
 */
export function folderCopies(dataDir: string): WorkingCopies {
  const worktreesDir = join(dataDir, "worktrees");
  return {
    worktreesDir,
    has: (task: string) => existsSync(join(worktreesDir, task)),
    list: () => (existsSync(join(worktreesDir, TASK)) ? [TASK] : []),
  } as Partial<WorkingCopies> as WorkingCopies;
}

/** A home with the stand-in core, a computer joined to it as another user, and the helper running there. */
export async function placed(
  options: {
    copies?: boolean;
    probeMedia?: MediaProbe;
    probeTypeface?: TypefaceProbe;
    /** The contract the home's welcome says, in place of the one the link heard. */
    homeVersion?: string;
    homeChanges?: readonly string[];
    /** It keeps the home's personal set under its work folder (`PersonalCopy`). */
    personal?: boolean;
    /** Claude's factory on the scripted client, for a conversation the home binds to Claude. */
    claude?: ContractWorld;
    /** Its work starts in Firstmate 3000's folder, before its first update to Infinitary (`moveComputer`). */
    inOlderFolder?: boolean;
    retryMs?: readonly number[];
    /** A filtered Claude give-up signal, injected at the bound-tool seam independently of the test model. */
    toolSignal?: AbortSignal;
    /** Tools of the test's own, in place of the crewmate's; the spec names them too. */
    tools?: readonly CrewmateTool[];
    /** The close order's sweep of what a task left running (docs/leftover-programs.md). */
    leftovers?: SessionHostOptions["leftovers"];
    /** How long a saved update waits for the home before it lets the save go there. */
    updateReturnMs?: number;
  } = {},
) {
  const home = standInHome();
  const pairing = new DevicePairing({
    dir: join(scratchDir("infinitary-placed-home-"), "devices"),
    onProblem: () => {},
    interfaces: () => ({}),
    ownUid: 501,
  });
  pairings.push(pairing);
  const port = await claimedPort();
  const listen = () => {
    const connection = startConnection({
      dispatch: home.dispatch,
      events: new CoreEventBus(),
      devices: pairing,
      port,
      name: () => "MacBook Pro",
    });
    connections.push(connection);
    return connection;
  };
  let connection = listen();
  const { link } = pairing.invite({ kind: "work", at: `127.0.0.1:${port}` });
  await connection.settled();
  const appData = options.inOlderFolder ? scratchDir("infinitary-placed-app-data-") : undefined;
  let dataDir = appData ? olderWorkFolder(appData) : scratchDir("infinitary-placed-");
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

  let host: SessionHost | undefined;
  let belowUi: boolean | undefined;
  const start = () => {
    const started = startHelper({
      dataDir,
      say: () => {},
      retryMs: options.retryMs ?? [20],
      conversations: async ({ dataDir: dir, ask, homeVersion, belowUi: below }) => {
        belowUi = below;
        const copies = options.copies ? folderCopies(dir) : undefined;
        const pi = createPiSessionFactory({ agentDir: join(dir, "pi-agent") });
        host = new SessionHost({
          tasks: new PlacedTasks(dir, copies?.worktreesDir),
          ...(copies ? { copies } : {}),
          ...(options.leftovers ? { leftovers: options.leftovers } : {}),
          ask,
          factories: {
            pi: options.toolSignal
              ? {
                  ...pi,
                  open: (spec) =>
                    pi.open({
                      ...spec,
                      tools: spec.tools?.map((tool) => ({
                        ...tool,
                        run: (params) => tool.run(params, options.toolSignal),
                      })),
                    }),
                }
              : pi,
            ...(options.claude ? { claude: options.claude.factory } : {}),
          },
          bind: async (binding) =>
            binding.backend === "claude" && options.claude
              ? options.claude.binding
              : { backend: "pi", runtime },
          ...(options.probeMedia ? { probeMedia: options.probeMedia } : {}),
          ...(options.probeTypeface ? { probeTypeface: options.probeTypeface } : {}),
          ...(options.tools ? { tools: options.tools } : {}),
          ...(options.homeVersion
            ? { homeVersion: () => options.homeVersion as string }
            : homeVersion
              ? { homeVersion }
              : {}),
          ...(options.homeChanges ? { homeChanges: () => options.homeChanges ?? [] } : {}),
          ...(options.personal ? { personal: new PersonalCopy(join(dir, "personal")) } : {}),
          ...(options.updateReturnMs !== undefined
            ? { updateReturnMs: options.updateReturnMs }
            : {}),
          log: () => {},
        });
        const held = host;
        return { host: held, close: () => held.close() };
      },
    });
    if (!started.ok) throw new Error(started.reason);
    runs.push(started.run);
    return started.run;
  };
  let run = start();
  const inReach = async () => {
    await expect
      .poll(() =>
        connection.ask(deviceId, "inf:session:roster", []).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);
  };
  await inReach();

  /** The home asks the computer one order. */
  const order = <C extends WorkOrderChannel>(channel: C, args: unknown) =>
    connection.ask(deviceId, channel, args) as Promise<WorkOrderResponse<C>>;
  const spec: PlacedSpec = {
    binding: { backend: "pi", provider: PROVIDER },
    model: { provider: PROVIDER, id: MODEL },
    thinking: { level: "off" },
    instructions: "You are a crewmate on another Mac.",
    tools: options.tools?.map((tool) => tool.name) ?? [
      "emit_card",
      "report",
      "note_progress",
      "file_followup",
      "tasks",
      "github_write",
    ],
  };
  return {
    home,
    deviceId,
    /** The computer's work folder now: Infinitary's once `moveComputer` moved it. */
    get dataDir() {
      return dataDir;
    },
    order,
    spec,
    host: () => {
      if (!host) throw new Error("No conversation was opened.");
      return host;
    },
    /** Whether the run had its conversations keep a crewmate's builds and tests below the UI. */
    belowUi: () => belowUi,
    /** The home opens the conversation: one it holds, or a new one on `spec`. */
    open: async () => {
      const answer = await order("inf:session:open", [
        { orderId: `open:${TASK}:1`, task: TASK, spec },
      ]);
      if (!answer.state) throw new Error("The computer opened no conversation.");
      return { state: answer.state };
    },
    /** The home's turn ends: the computer said `turn_ended` for this turn. */
    ended: (turn: number) =>
      expect
        .poll(() =>
          home.events.some(
            (record) => record.event.type === "turn_ended" && record.event.turn === turn,
          ),
        )
        .toBe(true),
    stopHome: async () => {
      await connection.close();
      await expect.poll(() => run.state().contact).not.toBe("in-reach");
    },
    startHome: async () => {
      connection = listen();
      await connection.settled();
    },
    inReach,
    /** Firstmate quits on the home and opens again: the connection drops and comes back. */
    dropAndReturn: async () => {
      await connection.close();
      connection = listen();
      await connection.settled();
      await inReach();
    },
    /** The computer's own process quits, and starts again from the same folder. */
    restartComputer: async () => {
      await run.stop();
      host = undefined;
      run = start();
      await inReach();
    },
    /** Its first update to Infinitary: its work stops, the one-time move runs, and its work starts from the new folder. */
    moveComputer: async () => {
      if (!appData) throw new Error("This computer's work is in no older folder.");
      await run.stop();
      host = undefined;
      dataDir = await moveWorkFolder(appData, "linux");
      run = start();
      await inReach();
    },
  };
}
