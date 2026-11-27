import { createHash, randomBytes } from "node:crypto";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { createConnection, createServer as createTCPServer, type Socket } from "node:net";
import { join } from "node:path";
import { type PairedDevice, RELOAD_READS, startConnection } from "@core/connection/connection";
import { type JournalEntry, replayBytes, replayOf } from "@core/connection/journal";
import { claimLink } from "@core/devices/dial";
import { createKeyIdentity } from "@core/devices/identity";
import { absentKeychain } from "@core/host";
import { startCore } from "@core/index";
import type { CardService } from "@core/orchestrator/cardService";
import { sinceSeenSaid, sinceSeenSection } from "@core/orchestrator/sinceSeen";
import { appPathsFor } from "@core/paths";
import { resolveFirstmateCardId } from "@core/pi/cardTool";
import { httpSecretBroker } from "@core/secrets/httpBroker";
import { forkChildProcess } from "@core/sql/forkChildProcess";
import { seedTask } from "@core/tasks/seedTask";
import { AFTER_MERGE_LEAD } from "@shared/afterMerge";
import { cardFileId, cardFileStoredName } from "@shared/cardFiles";
import { CARD_LEAVE } from "@shared/cardLeave";
import type { CardNote } from "@shared/cardNotes";
import { cardLogUrl } from "@shared/cardPictures";
import {
  ANYTHING_ELSE_ANSWER,
  type CardAnswer,
  type CardMessage,
  PAST_CARD_WORDS_LEAD,
} from "@shared/cards";
import { CHOICE_ATTACHMENTS } from "@shared/choiceCarried";
import {
  FOLDED_INTO_16_SINCE,
  MESSAGES_WHILE_READING,
  SCENE_OBSERVATIONS_SINCE,
  speaksSince,
} from "@shared/contractFeatures";
import { ENDED_CHIP_LABEL, ENDED_CLOSE_LABEL, endedLineWords } from "@shared/endedCard";
import type { FmEvent } from "@shared/events";
import { type HomeUpdate, homeUpdateSchema } from "@shared/homeUpdate";
import { englishOf } from "@shared/i18n/said";
import { PROTOCOL_VERSION, VIEW_FLOOR } from "@shared/ipc";
import { pastEndingWords } from "@shared/pastCard";
import { RISK_WORDS } from "@shared/risk";
import { SECRET_ASK_CARD_WORDS, SECRET_DEVICE_WORDS } from "@shared/secrets";
import { CONTRACT_CHANGES } from "../../src/core/connection/contractChanges";
import { letterBox } from "../../src/core/phoneLetters";
import { REQUIRED_ACTIONS_LEAD } from "../../src/renderer/src/cards/requiredActionsWords";
import { contributorWords, THREAD_WHO_LABELS } from "../../src/renderer/src/cards/threadWords";
import { CLAUDE_STEER_MARKER, MOCK_CLAUDE_STEERED_REPORT } from "../e2e/crewScripts";
import { MOCK_PROVIDER_ID, mockModelsJson } from "../e2e/mockModels";
import {
  ANSWER_PROMPT_MARKER,
  FM_SEAT_HOLD_MARKER,
  FM_SEAT_STEER_WORD,
  MOCK_FM_CHAT_TEXT,
  startMockProvider,
} from "../e2e/mockProvider";
import { encodePng } from "../e2e/pictureFixtures";
import { fillMapPart, MAP_DATA } from "./architectureMap";
import { budgetTimer, type DeadlineTimer, keepControlConnection } from "./budgets";
import { claimedPort } from "./claimedPort";
import { disposableCustody } from "./disposableCustody";
import { standInDnsSd } from "./dnsSdStandIn";
import { phoneCardReadControls } from "./phoneCardReads";
import { carriedHeard, raiseCarriedCard, showCarriedPast } from "./phoneCarried";
import { awayTraffic, closeCatchUpBoard, openCatchUpBoard } from "./phoneCatchUp";
import { clearPhoneCards, raiseReaderCard } from "./phoneCrewCards";
import { phoneGoogleControls, startPhoneGoogle } from "./phoneGoogle";
import type {
  PhoneCaretOutcome,
  PhoneDisplayReport,
  PhoneKeyOutcome,
  PhonePickerPreview,
  PhoneTouchOutcome,
} from "./phoneKeyboard";
import { type PhoneKeyboardControls, phoneKeyboardControl } from "./phoneKeyboardControl";
import { phoneKeyboardDiagnostic, phoneKeyboardError } from "./phoneKeyboardDiagnostics";
import { raiseMoveCard, showMoveCardPast } from "./phoneMoveCard";
import { phonePanelControls } from "./phonePanels";
import { startPhonePushRelay } from "./phonePushRelay";
import { CARD_RECORDINGS } from "./phoneRecordings";
import { removeEveryDevice } from "./phoneRemove";
import { raiseRevisedCard, reviseRevisedCard } from "./phoneRevisedCard";
import { seedRowMoves, seedTalkTags, seedTalkWork } from "./phoneRowMoves";
import { phoneSceneFixture } from "./phoneScene";
import { phoneSecondHome } from "./phoneSecondHome";
import { secretAskShown } from "./phoneSecretAsk";
import {
  PHONE_SETTINGS_SESSION_LATER,
  phoneSettingsState,
  readPhoneAllowanceAgain,
  seedPhoneAutomations,
  seedPhoneSettings,
} from "./phoneSettings";
import { phoneTakeOverControls } from "./phoneTakeOver";
import { phoneTalkControls, TALK_WRITES } from "./phoneTalk";
import { raiseConversationCard, seedReplyReading } from "./replyReading";
import { startScriptedClient } from "./scriptedClient";
import { bundleSqlProcess } from "./sqlProcessBundle";
import { type SshServer, startSshServer } from "./sshServer";

/** INF-3881: the map part as the Advanced architecture runbook ships it, which a card copies whole. */
const MAP_PART = readFileSync(
  new URL(
    "../../resources/runbooks/architecture/skills/advanced-architecture/parts/map.html",
    import.meta.url,
  ),
  "utf8",
);
// A card that stops answering: its page's thread spins for 15 seconds. INF-4326 (INF-4241's speed-ups): an endless loop
// held every screen read after it for XCTest's own minute, three times a run, while the app's watchdog fails the card
// within about 8 seconds of the stall and a choice waits 4 seconds for its answer; a stall that outlasts both still
// leaves the card failed and the choice unsent, and frees the page for the next read.
/** The crewmate's summary on the merge card that came back after the captain saw it (INF-5035). */
const MERGE_SINCE_SEEN_SUMMARY =
  "I added the evening tide you asked about. The north entrance change is unchanged.";

const STALL_SCRIPT = "const stallEnds = Date.now() + 15000; while (Date.now() < stallEnds) {}";
/**
 * The captain's message the asked card is about (INF-1610): long and in
 * paragraphs, as a real message can be, so the phone shows its start and
 * opens the rest on request.
 */
const PHONE_ASKED_MESSAGE = [
  "did something change about how we order the cards in the stack? this morning a card I had replied under jumped behind two newer notes, and then the merge card for the footer fix showed up first.",
  "could you check what changed in the last few days, and whether the order is still the one we agreed on?",
  "if it is a regression, please fix it, but keep minimize as it is.",
].join("\n\n");

/** A control request's small JSON body, or "" when it sent none. */
async function controlBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 1024) throw new Error("A control request is too large");
  }
  return body;
}

/** INF-64 piece 2: a disposable real home, never a replacement for the wire or stores. */

export async function startPhoneHome(
  root: string,
  controls?: PhoneKeyboardControls & {
    start(name?: string): Promise<void>;
    stop(): Promise<void>;
    damageRecord?(): Promise<void>;
    appearance?(theme: "dark" | "light"): Promise<PhoneDisplayReport>;
    display?(appearance: "light" | "dark", large: boolean): Promise<PhoneDisplayReport>;
    touchOutcome?(since: number): Promise<PhoneTouchOutcome>;
    // INF-6074: whether the system's keyboard took back the caret a text field of the app took since `since`.
    caretOutcome?(since: number): Promise<PhoneCaretOutcome>;
    pickerPreview?(since: number): Promise<PhonePickerPreview>;
    // INF-4794: a push the stand-in relay hands the part's simulator, as Apple would deliver it.
    push?(payload: Record<string, unknown>): Promise<void>;
    // INF-5265: the phone's own network going (false) or coming back (true), through the app's stand-in path monitor.
    phonePath?(usable: boolean): Promise<void>;
    biometry?(step: "enroll" | "face-in-view" | "face-away"): Promise<void>;
    // INF-4241 piece 8: the Duo's hinge, read or moved once (scripts/phone-hinge.ts); absent on a device with none.
    hinge?(to?: "open" | "closed"): Promise<{ hinge: "open" | "closed" | null }>;
    // INF-4539: the open Duo turned once, like a book or on its side (scripts/phone-hinge.ts); absent with no hinge.
    turn?(
      to: "book" | "side-left" | "side-right",
    ): Promise<{ turn: "book" | "side-left" | "side-right" }>;
    // INF-5183: one key pressed on the open Duo as an attached keyboard presses it, and where the simulator sent it
    // (scripts/phone-hinge.ts); absent with no hinge.
    key?(
      key: "tab" | "return" | "escape",
      diagnosticId: string,
    ): Promise<PhoneKeyOutcome & { key: "tab" | "return" | "escape" }>;
  },
  // INF-3563: the Settings pages part's computer starts with accounts, projects, usage and automations to show.
  // INF-5265: a second computer beside it names itself (tests/helpers/phoneSecondHome.ts).
  options: { settings?: boolean; name?: string } = {},
) {
  const homeName = options.name ?? "Test Mac mini";
  const port = await claimedPort();
  process.env.INFINITARY_CONNECTION_LOOPBACK_PORT = String(port);
  process.env.INFINITARY_DNS_SD = standInDnsSd([]);
  const provider = await startMockProvider();
  const googleStandIn = await startPhoneGoogle();
  // INF-4794: the home's phone sender posts to a stand-in relay, which pushes to the part's simulator.
  const pushRelay = await startPhonePushRelay(controls?.push?.bind(controls));
  // INF-5265: the key the phone handed this home, as a short digest, so a part compares two homes' keys and one home's
  // key across a relaunch without reading the key.
  const pushReading = () => {
    const targets = core.services.devices.pushTargets();
    return {
      ...pushRelay.state(),
      registered: targets.length > 0,
      // INF-5275: whether the phone left each kept registration's computer a letter at this stand-in relay.
      lettered:
        targets.length > 0 &&
        targets.every((target) => pushRelay.holds(letterBox(target.registration.key))),
      keys: targets.map((target) =>
        createHash("sha256").update(target.registration.key).digest("hex").slice(0, 16),
      ),
    };
  };
  process.env.INFINITARY_PUSH_RELAY_URL = pushRelay.url;
  const userData = join(root, "app");
  const paths = appPathsFor(userData);
  mkdirSync(paths.authDir, { recursive: true });
  // The held-turn script streams Anthropic tool results; Pi still owns every model session.
  const models = JSON.parse(mockModelsJson(provider.port));
  models.providers[MOCK_PROVIDER_ID].api = "anthropic-messages";
  writeFileSync(paths.modelsPath, JSON.stringify(models));
  if (options.settings) seedPhoneSettings(root, userData);
  let secretConfirms = 0;
  /** INF-5265: the cards `homes-card` made on this home. */
  let homesCards = 0;
  // The invented token the stand-in calendar receives; no request leaves this process.
  const SECRET_TOKEN = "ya29.invented-phone-calendar-token";
  const secretSends: string[] = [];
  let secretRequests = 0;
  let secretsReady = false;
  // INF-3830 piece 2: the panel library this checkout builds, which the computer answers the phone as its own build's.
  // Only the panels part asks for it, so its controls build it there, before the computer first reads it.
  const frameLib = { dir: join(root, "frame-lib"), pins: {} as Record<string, string> };
  // INF-5531 piece 2: the `sql` read's query process, the core's own entry built as the app builds it. Only the
  // cards-reads part asks for it, so its controls build it there, before a card first reads the record.
  let sqlEntry: string | undefined;
  const core = await startCore({
    frameLib,
    sqlProcess: {
      spawn: () => {
        if (!sqlEntry) throw new Error("The phone test home built no query process for this part");
        return forkChildProcess(sqlEntry).spawn();
      },
    },
    // A panel's background work runs in the real panel process, as in the app.
    panelProcess: forkChildProcess(
      join(import.meta.dirname, "..", "..", "src", "core", "panels", "panelProcess.ts"),
    ),
    app: {
      version: "0.1.0",
      platform: "test-os",
      packaged: false,
      userDataDir: userData,
      appDir: join(import.meta.dirname, "..", ".."),
      resourcesDir: join(root, "resources"),
    },
    openExternal: async () => {
      throw new Error("The phone test home never opens an external page");
    },
    notifications: { supported: () => false, focused: () => false, show: () => {} },
    presence: { getStartAtLogin: () => false, setStartAtLogin: () => {}, setShowInDock: () => {} },
    voice: { modelReady: async () => false, ensureModel: async () => {} },
    keychain: absentKeychain,
    // INF-1109's phone approvals: the real Secrets controller over disposable custody. This computer's own
    // confirmation is a stand-in that counts each ask; the phone's Face ID is the simulator's own.
    secrets: {
      custody: disposableCustody(),
      authentication: {
        available: async () => true,
        confirm: async () => {
          secretConfirms += 1;
          return true;
        },
      },
    },
  });
  const scene = phoneSceneFixture(core, userData, () => connection.settled());
  const google = phoneGoogleControls(core);
  const settingsRules = options.settings ? await seedPhoneAutomations(core) : {};
  const panels = phonePanelControls(core, frameLib);
  const cardReads = phoneCardReadControls(core, async () => {
    sqlEntry ??= await bundleSqlProcess();
  });
  const readings = {
    cards: 0,
    feed: 0,
    boards: 0,
    connections: 0,
    stalledConnections: 0,
    homeAttempts: 0,
    // INF-2157: stalled connections the phone gave up on, and how many it had given up on when it last
    // reached the home's port. A phone that dials every address together reaches the home before it cuts
    // the stalled attempt; one that waits out the stalled address first cuts it before. The two TCP accepts
    // of a joint dial land in either order, so neither reading asks which socket the home saw first.
    stalledCuts: 0,
    stalledCutsAtHomeAttempt: 0,
    refusals: 0,
  };
  const observations: unknown[] = [];
  let firstmateBusy = false;
  // The first mate's turns that have ended, so a journey can wait for the turn an action wakes.
  let firstmateTurnsEnded = 0;
  const stopConversationReading = core.events.subscribe((channel, payload) => {
    if (channel !== "inf:event") return;
    const event = payload as FmEvent;
    if (event.type === "firstmate_state") {
      firstmateBusy = event.busy;
      if (!event.busy) firstmateTurnsEnded += 1;
      observations.push({ check: "conversation-state", busy: event.busy });
    }
  });
  const writes: { channel: string; actor: unknown; args: unknown[] }[] = [];
  const until = async (predicate: () => boolean) => {
    if (predicate()) return;
    await new Promise<void>((resolve, reject) => {
      const off = core.events.subscribe(() => {
        if (predicate()) {
          timer?.cancel();
          off();
          resolve();
        }
      });
      const timer = budgetTimer(() => {
        off();
        reject(new Error("The phone action did not reach its promised Mac state"));
      }, 30_000);
    });
  };
  const talk = phoneTalkControls(core, writes, until, (seen) => observations.push(seen));
  const within = async (promise: Promise<void>, failure: string) => {
    let timer: DeadlineTimer | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = budgetTimer(() => reject(new Error(failure)), 30_000);
        }),
      ]);
    } finally {
      timer?.cancel();
    }
  };
  const views = new Set<string>();
  const cardRequests: { channel: string; args: unknown }[] = [];
  /** INF-5445 piece 2: each change the phone sent to a card's draft, as it arrived. */
  const draftChanges: unknown[] = [];
  let draftCardId = "";
  let leaks = 0;
  const cardIDs = {
    choice: "",
    conversation: "",
    note: "",
    saved: "",
    fallback: "",
    context: "",
    merge: "",
    news: "",
    flip: "",
    place: "",
    notes: "",
    field: "",
    carried: "",
    topBar: "",
  };
  // INF-6136: the top bar card's task and story, which its revision reuses.
  let topBarRevision:
    | { taskId: string; story: (extra: string) => Parameters<CardService["emitCrewmateCard"]>[1] }
    | undefined;
  // The captain's question on the flip card, which the first mate's revision answers by its id.
  let flipQuestion: number | undefined;
  const cardBarrier = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  let cardHold:
    | {
        channel: string;
        entered: ReturnType<typeof cardBarrier>;
        released: ReturnType<typeof cardBarrier>;
      }
    | undefined;
  // INF-2553: the next change on this channel is refused with these words, so the phone takes its prediction back.
  let refuseNext: { channel: string; words: string } | undefined;
  let turnsBeforeRelease = 0;
  // INF-1059: the phone's next board read is held, so a card from its first cards read is drawn while it is still reaching.
  let boardHold:
    | {
        taken: boolean;
        entered: ReturnType<typeof cardBarrier>;
        released: ReturnType<typeof cardBarrier>;
        /** Lets the task board's held pushes go, when the hold keeps them too (`hold-board-read`). */
        pushes?: () => void;
      }
    | undefined;
  const releaseBoardHold = () => {
    boardHold?.released.resolve();
    boardHold?.pushes?.();
    boardHold = undefined;
  };
  let latePicture: { name: string; asked: ReturnType<typeof cardBarrier> } | undefined;
  // A real TCP endpoint that never answers TLS: no HTTP response can reset a refusal.
  const stalledSockets = new Set<Socket>();
  const stalledServer = createTCPServer((socket) => {
    readings.stalledConnections += 1;
    stalledSockets.add(socket);
    socket.once("close", () => {
      stalledSockets.delete(socket);
      readings.stalledCuts += 1;
    });
  });
  await new Promise<void>((resolve) => stalledServer.listen(0, "127.0.0.1", resolve));
  const stalledPort = (stalledServer.address() as { port: number }).port;
  // INF-1168: every TCP connection to the home's own port, whatever its handshake becomes. When the
  // phone's own handshake deadline cuts a slow but genuine handshake here, no request arrives, so
  // only this count sees that attempt.
  const countAttempt = (message: unknown) => {
    if ((message as { socket: Socket }).socket.localPort !== port) return;
    readings.homeAttempts += 1;
    readings.stalledCutsAtHomeAttempt = readings.stalledCuts;
  };
  // INF-2157: a route to the home that can go silent without closing, as a path that died under a kept
  // connection while the app was in the background (Wi-Fi asleep, left the house).
  // INF-2668: the same route also shapes the path as a weak cell does: a byte rate and a delay each way, a stall
  // that holds bytes and then delivers them, a drop of every open connection, and no path at all.
  let relayFrozen = false;
  let relayOffline = false;
  let relayStalled: ReturnType<typeof setTimeout> | undefined;
  const relayShape = { delayMs: 0, bytesPerSec: 0 };
  const relayStarted = Date.now();
  const relayDials: { openedAt: number; closedAt?: number; down: number; up: number }[] = [];
  let relayRefused = 0;
  const relayPairs = new Set<{ client: Socket; upstream: Socket }>();
  // Every socket the relay holds, frozen arrivals included: closing the relay server waits for each to end, so
  // the home's close destroys them all rather than wait on a peer that may never hang up.
  const relaySockets = new Set<Socket>();
  const holdRelaySocket = (socket: Socket) => {
    relaySockets.add(socket);
    socket.once("close", () => relaySockets.delete(socket));
  };
  const relaySeconds = () => (Date.now() - relayStarted) / 1000;
  // Bytes wait out the delay, then leave at the byte rate; a stall holds them, a freeze drops them.
  const shapedPipe = (
    from: Socket,
    to: Socket,
    count: (bytes: number) => void,
    closed: () => boolean,
  ) => {
    const queue: { data: Buffer; readyAt: number }[] = [];
    let tokens = 0;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      timer = undefined;
      if (closed()) return;
      const now = Date.now();
      if (relayShape.bytesPerSec > 0)
        tokens = Math.min(
          relayShape.bytesPerSec / 4,
          tokens + ((now - last) / 1000) * relayShape.bytesPerSec,
        );
      last = now;
      while (!relayStalled) {
        const head = queue[0];
        if (!head || head.readyAt > now) break;
        if (relayShape.bytesPerSec > 0) {
          const n = Math.min(head.data.length, Math.floor(tokens));
          if (n < 1) break;
          to.write(head.data.subarray(0, n));
          tokens -= n;
          count(n);
          if (n < head.data.length) {
            head.data = head.data.subarray(n);
            break;
          }
        } else {
          to.write(head.data);
          count(head.data.length);
        }
        queue.shift();
      }
      if (queue.length) timer = setTimeout(step, 20);
    };
    from.on("data", (data: Buffer) => {
      if (relayFrozen) return;
      queue.push({ data, readyAt: Date.now() + relayShape.delayMs });
      if (!timer) step();
    });
  };
  const dropRelayPairs = () => {
    for (const pair of [...relayPairs]) {
      pair.client.destroy();
      pair.upstream.destroy();
    }
  };
  const relayServer = createTCPServer((client) => {
    client.on("error", () => {});
    holdRelaySocket(client);
    if (relayOffline) {
      relayRefused += 1;
      client.destroy();
      return;
    }
    if (relayFrozen) return;
    const upstream = createConnection(port, "127.0.0.1");
    holdRelaySocket(upstream);
    const pair = { client, upstream };
    const dial: (typeof relayDials)[number] = { openedAt: relaySeconds(), down: 0, up: 0 };
    relayDials.push(dial);
    relayPairs.add(pair);
    upstream.on("error", () => {});
    let ended = false;
    shapedPipe(
      client,
      upstream,
      (bytes) => (dial.up += bytes),
      () => ended,
    );
    shapedPipe(
      upstream,
      client,
      (bytes) => (dial.down += bytes),
      () => ended,
    );
    const end = () => {
      if (ended) return;
      ended = true;
      dial.closedAt = relaySeconds();
      relayPairs.delete(pair);
      client.destroy();
      upstream.destroy();
    };
    client.once("close", end);
    upstream.once("close", () => {
      if (!relayFrozen) end();
    });
  });
  await new Promise<void>((resolve) => relayServer.listen(0, "127.0.0.1", resolve));
  const relayPort = (relayServer.address() as { port: number }).port;
  subscribe("net.server.socket", countAttempt);
  // A refusal is a connection request pairing admits no device for: the 401 a removed phone reads.
  const pairing = core.services.devices;
  // INF-1156: only this disposable home can omit metadata or lose a pairing reply.
  let routingAddresses: string[] | undefined;
  let legacyRouting = false;
  let losePairReply = false;
  let pairCalls = 0;
  let takeOver: ReturnType<typeof phoneTakeOverControls> = { override: () => undefined } as never;
  const devices = new Proxy(pairing, {
    get(target, name) {
      const taken = takeOver.override(name);
      if (taken) return taken;
      if (name === "offerTargets")
        return legacyRouting ? undefined : () => routingAddresses ?? target.offerTargets(true);
      // A welcome offers `welcomeTargets` ahead of `offerTargets`: the routing controls answer it too.
      if (name === "welcomeTargets")
        return legacyRouting ? undefined : () => routingAddresses ?? target.welcomeTargets(true);
      if (name === "claim")
        return async (body: unknown, request: IncomingMessage) => {
          pairCalls += 1;
          const outcome = await target.claim(body, request);
          if (losePairReply) {
            losePairReply = false;
            request.socket.destroy();
          }
          return outcome;
        };
      if (name === "admit")
        return (request: IncomingMessage) => {
          let device: PairedDevice | null = null;
          try {
            device = target.admit(request);
            return device;
          } finally {
            if (!device) readings.refusals += 1;
          }
        };
      const value = Reflect.get(target, name);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  // "after": the computer takes the message, then the connection drops before its answer; "before": the
  // connection drops first, so the computer never takes it (INF-2553's unconfirmed take-back).
  let loseNextReply: "after" | "before" | undefined;
  // INF-4012's direction 1: the home's own update as `home-update` sets it, standing in for an
  // updater with a newer version out; null answers from the core's own updater. Install moves it to
  // saving the crew's work and Update later back to offered; nothing is ever installed.
  let homeUpdate: HomeUpdate | null = null;
  const homeUpdateAsks: string[] = [];
  // The core's own id for the hero card (a first mate card's id is the core's, not the one asked for).
  let heroId = "";
  let sceneObservationReads = 0;
  // INF-1390: the core reaches each connection this home starts, as the app's shell attaches its
  // own (src/main/shell.ts), so the core's door answers the phone's link once it listens.
  let unreach = () => {};
  const answerBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? "null");
  const reloadWeight = async (board: [] | [{ closed: false }]) => {
    let total = 0;
    for (const read of RELOAD_READS)
      total += answerBytes(await core.dispatch(read, read === "inf:tasks:board" ? board : []));
    return total;
  };
  const connect = (
    protocolVersion = PROTOCOL_VERSION,
    sceneSupport = true,
    viewFloor?: number,
    without: readonly string[] = [],
  ) => {
    const connection = startConnection({
      dispatch: async (channel, args, actor) => {
        if (channel === "inf:conversation:state" || channel === "inf:computers:presence") {
          sceneObservationReads += 1;
          if (!sceneSupport) throw new Error("This older home has no scene observation reads");
        }
        if (loseNextReply === "before" && channel === "inf:converse") {
          loseNextReply = undefined;
          await connection.close();
          throw new Error("The connection dropped before the computer took the message");
        }
        if (channel === "inf:cards:list") readings.cards += 1;
        if (channel === "inf:feed:recent") readings.feed += 1;
        if (channel === "inf:tasks:board") readings.boards += 1;
        if (
          [
            "inf:cards:act",
            "inf:cards:close",
            "inf:cards:note-done",
            "inf:cards:reply",
            "inf:cards:seen",
            "inf:cards:seen-update",
            "inf:cards:media",
            "inf:cards:minimize",
          ].includes(channel)
        )
          cardRequests.push({ channel, args });
        if (channel === "inf:cards:draft")
          draftChanges.push(structuredClone((args as unknown[])[1]));
        if (TALK_WRITES.includes(channel)) {
          const safe = (Array.isArray(args) ? args : []).map((arg: unknown) =>
            typeof arg === "object" && arg !== null && "images" in arg
              ? {
                  ...arg,
                  images: (arg as { images?: { mimeType: string; data: string }[] }).images?.map(
                    (image) => ({
                      mimeType: image.mimeType,
                      bytes: Buffer.from(image.data, "base64").length,
                    }),
                  ),
                }
              : arg,
          );
          writes.push({ channel, actor, args: safe });
        }
        if (channel === "inf:tasks:board" && boardHold && !boardHold.taken) {
          const held = boardHold;
          held.taken = true;
          held.entered.resolve();
          await held.released.promise;
        }
        if (
          channel === "inf:cards:picture" &&
          latePicture &&
          Array.isArray(args) &&
          args[0] === latePicture.name
        )
          latePicture.asked.resolve();
        if (cardHold && channel === cardHold.channel) {
          const held = cardHold;
          held.entered.resolve();
          await held.released.promise;
        }
        if (refuseNext && channel === refuseNext.channel) {
          const { words } = refuseNext;
          refuseNext = undefined;
          throw new Error(words);
        }
        if (homeUpdate && channel.startsWith("inf:home-update:")) {
          homeUpdateAsks.push(channel);
          if (channel === "inf:home-update:install" && homeUpdate.step === "offered")
            homeUpdate = { ...homeUpdate, step: "saving", waitingFor: homeUpdate.stops.tasks };
          if (channel === "inf:home-update:later" && homeUpdate.step === "saving")
            homeUpdate = { ...homeUpdate, step: "offered", waitingFor: [] };
          return homeUpdate as Awaited<ReturnType<typeof core.dispatch<typeof channel>>>;
        }
        const result = await core.dispatch(channel, args, actor);

        if (loseNextReply === "after" && channel === "inf:converse") {
          loseNextReply = undefined;
          await connection.close();
        }
        return result;
      },
      events: core.events,
      devices,
      port,
      address: [],
      name: () => homeName,
      protocolVersion,
      ...(viewFloor !== undefined ? { viewFloor } : {}),
      // Major 16 folded these names in: a home before it listed them, and the phone still reads one by them.
      changes: sceneSupport
        ? [
            ...CONTRACT_CHANGES.names.filter((name) => !without.includes(name)),
            ...(speaksSince(protocolVersion, FOLDED_INTO_16_SINCE)
              ? []
              : [
                  "card-annotations",
                  "sign-in-return",
                  "board-without-closed",
                  "panels-on-the-phone",
                  MESSAGES_WHILE_READING,
                ]),
          ]
        : [],
    });
    connection.onViewDevice(({ deviceId, contact }) => {
      if (contact === "in-reach") {
        readings.connections += 1;
        views.add(deviceId);
      } else views.delete(deviceId);
    });
    unreach = core.services.workDevices.attach(connection);
    return connection;
  };
  let connection = connect();
  const secondHome = phoneSecondHome();
  takeOver = phoneTakeOverControls({
    ...{ devicesDir: paths.devicesDir, name: homeName, userData },
    ...{ offline: () => connection.close(), routes: () => connection.routes() },
    online: async () => {
      connection = connect();
      await connection.settled();
    },
  });
  const cardTitle = "Your phone is reading your Mac";
  const cardBody = "<p>This card belongs to the disposable test home.</p>";
  // The first mate's note that the phone reads this Mac, which `stream` revises and `stream-reset` brings back.
  // A note the captain closed stays closed (INF-2718): once `empty-cards` reads it, it comes back as a new note.
  let readingNote = "";
  let readingNotes = 0;
  const showReadingNote = (title: string, body: string): void => {
    const open = core.services.supervisor.cards.get(readingNote) !== undefined;
    const id = open ? readingNote : `phone-first-${++readingNotes}`;
    readingNote = core.services.supervisor.addFirstmateCard({ id, title, body, actions: [] });
  };
  showReadingNote(cardTitle, cardBody);
  const task = seedTask(core.services.tasks, {
    id: "phone-fixture",
    title: "Check the phone connection",
    status: "queued",
    startPolicy: "on-request",
  });
  const token = randomBytes(24).toString("hex");
  let changed = 0;
  let boardTasks = 0;
  const awayCards: string[] = [];
  const catchUpBoard: string[] = [];
  let ssh: SshServer | undefined;
  const control = createServer(async (request, response) => {
    const [_, supplied, command] = (request.url ?? "").split("/");
    if (supplied !== token) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    try {
      let result: unknown;
      switch (`${request.method} ${command}`) {
        case "POST keyboard-before-launch":
        case "POST keyboard-attach":
        case "POST keyboard-detach":
        case "POST keyboard-ready": {
          const observation = await phoneKeyboardControl(command, request, controls, response);
          result = observation.result;
          observations.push(observation);
          break;
        }
        case "POST touch-outcome": {
          if (!controls?.touchOutcome) throw new Error("No simulator touch observer is available");
          let body = "";
          for await (const chunk of request) {
            body += chunk.toString();
            if (body.length > 1024) throw new Error("A touch request is too large");
          }
          const { since } = JSON.parse(body);
          if (typeof since !== "number" || !Number.isFinite(since))
            throw new Error("A touch request must name when its tap began");
          result = await controls.touchOutcome(since);
          observations.push({ check: "touch-outcome", result });
          break;
        }
        case "POST caret-outcome": {
          if (!controls?.caretOutcome) throw new Error("No simulator caret observer is available");
          let body = "";
          for await (const chunk of request) {
            body += chunk.toString();
            if (body.length > 1024) throw new Error("A caret request is too large");
          }
          const { since } = JSON.parse(body);
          if (typeof since !== "number" || !Number.isFinite(since))
            throw new Error("A caret request must name when its key was pressed");
          result = await controls.caretOutcome(since);
          observations.push({ check: "caret-outcome", result });
          break;
        }
        case "POST picker-preview": {
          if (!controls?.pickerPreview)
            throw new Error("No simulator photo picker observer is available");
          let body = "";
          for await (const chunk of request) {
            body += chunk.toString();
            if (body.length > 1024) throw new Error("A photo picker request is too large");
          }
          const { since } = JSON.parse(body);
          if (typeof since !== "number" || !Number.isFinite(since))
            throw new Error("A photo picker request must name when its tap began");
          result = await controls.pickerPreview(since);
          observations.push({ check: "picker-preview", result });
          break;
        }
        case "POST link":
        case "POST link-with-unreachable":
        case "POST wrong-link": {
          const invite = await core.dispatch("inf:devices:invite", [{ kind: "mac" }]);
          if (command === "wrong-link") {
            const wrong = new URL(invite.link);
            wrong.searchParams.set("key", createKeyIdentity("Different test Mac").pin);
            result = { ...invite, link: wrong.toString() };
          } else if (command === "link-with-unreachable") {
            const multiple = new URL(invite.link);
            // Own the unreachable endpoint: an unassigned loopback IP can itself stall for ten seconds.
            multiple.searchParams.set("also", `127.0.0.1:${stalledPort}`);
            result = { ...invite, link: multiple.toString() };
          } else result = invite;
          await connection.settled();
          break;
        }
        case "POST review-finding": {
          const review = seedTask(core.services.tasks, {
            id: "phone-review",
            title: "Review the phone connection",
            status: "idle",
            parentId: task.id,
            shape: { kind: "review", kind_source: "host:review", basis: task.id },
          });
          core.services.supervisor.addFirstmateCard({
            id: "phone-review-finding",
            taskId: task.id,
            reviewTaskId: review.id,
            title: "Review the phone connection finding",
            body: "<p>The review needs your choice on the Mac.</p>",
            actions: [
              { id: "keep", label: "Keep it", default: true },
              { id: "change", label: "Change it" },
            ],
          });
          result = { ok: true };
          break;
        }
        case "POST routing-refresh":
          routingAddresses = [`100.101.7.3:${port}`, `localhost:${port}`];
          result = { addresses: routingAddresses, at: `127.0.0.1:${port}` };
          break;
        // INF-2157: the welcome names an address that never answers ahead of the home's own.
        case "POST routing-stalled-first":
          routingAddresses = [`127.0.0.1:${stalledPort}`, `127.0.0.1:${port}`];
          result = { addresses: routingAddresses };
          break;
        case "POST relay-thaw":
          relayFrozen = false;
          relayOffline = false;
          clearTimeout(relayStalled);
          relayStalled = undefined;
          relayShape.delayMs = 0;
          relayShape.bytesPerSec = 0;
          relayDials.length = 0;
          relayRefused = 0;
          result = { address: `127.0.0.1:${relayPort}`, at: `127.0.0.1:${port}` };
          break;
        case "POST relay-freeze":
          relayFrozen = true;
          result = { held: relayPairs.size };
          break;
        // INF-2668: the weak path's controls; each answers with the relay's readings so far.
        case "POST relay-shape":
        case "POST relay-stall":
        case "POST relay-drop":
        case "POST relay-offline":
        case "POST relay-online":
        case "GET relay-readings": {
          let body = "";
          for await (const chunk of request) {
            body += chunk.toString();
            if (body.length > 1024) throw new Error("A relay request is too large");
          }
          const asked = body
            ? (JSON.parse(body) as { delayMs?: number; bytesPerSec?: number; ms?: number })
            : {};
          if (command === "relay-shape") {
            relayShape.delayMs = Math.max(0, Number(asked.delayMs ?? 0));
            relayShape.bytesPerSec = Math.max(0, Number(asked.bytesPerSec ?? 0));
          }
          if (command === "relay-stall") {
            clearTimeout(relayStalled);
            // Held bytes leave on the pipes' next step once the stall ends.
            relayStalled = setTimeout(
              () => (relayStalled = undefined),
              Math.max(1, Number(asked.ms ?? 1000)),
            );
          }
          if (command === "relay-drop") dropRelayPairs();
          if (command === "relay-offline") {
            relayOffline = true;
            dropRelayPairs();
          }
          if (command === "relay-online") relayOffline = false;
          result = {
            address: `127.0.0.1:${relayPort}`,
            at: relaySeconds(),
            shape: { ...relayShape },
            open: relayPairs.size,
            refused: relayRefused,
            dials: relayDials,
          };
          break;
        }
        case "POST routing-legacy":
          legacyRouting = true;
          result = { ok: true };
          break;
        case "POST routing-reset":
          routingAddresses = undefined;
          legacyRouting = false;
          losePairReply = false;
          pairCalls = 0;
          result = { ok: true };
          break;
        case "POST routing-link":
        case "POST routing-lost-link": {
          const invitation = core.services.devices.invite({
            kind: "mac",
            at: `127.0.0.1:${port}`,
            phone: true,
          });
          const multiple = new URL(invitation.link);
          // A held TLS handshake proves that even a preflight timeout may fall back safely.
          multiple.searchParams.set("at", `127.0.0.1:${stalledPort}`);
          multiple.searchParams.set("also", `127.0.0.1:${port},localhost:${port}`);
          losePairReply = command === "routing-lost-link";
          await connection.settled();
          result = { link: multiple.toString(), at: `127.0.0.1:${port}` };
          break;
        }
        // INF-1183: the home as a phone joins it by its address. The Mac's own sshd,
        // run as this user, signs the phone in to a home folder of its own and
        // hands every session this home's data folder, where its door is open.
        // It offers a password and takes none, as it can check none.
        case "POST ssh-start": {
          const sshHome = join(root, "ssh-home");
          mkdirSync(join(sshHome, ".ssh"), { recursive: true });
          ssh ??= await startSshServer({
            passwords: true,
            home: sshHome,
            env: { HOME: sshHome, INFINITARY_USER_DATA_DIR: userData },
          });
          result = { address: ssh.address, port: ssh.port };
          break;
        }
        // The person adds the key the phone showed to their account there.
        case "POST ssh-authorize": {
          let line = "";
          for await (const chunk of request) {
            line += chunk.toString();
            if (line.length > 1024) throw new Error("A key line is too large");
          }
          if (!/^ecdsa-sha2-nistp256 [A-Za-z0-9+/=]+ infinitary-phone$/.test(line.trim()))
            throw new Error("The phone showed no key line");
          appendFileSync(join(root, "ssh-home", ".ssh", "authorized_keys"), `${line.trim()}\n`, {
            mode: 0o600,
          });
          result = { authorized: true };
          break;
        }
        case "GET routing-state":
          result = { pairCalls, devices: core.services.devices.list(), readings: { ...readings } };
          break;
        // INF-1109's phone approvals (docs/secrets.md, "Remote decisions"): Secrets set up here with one entry,
        // and a stand-in calendar that records the header it receives instead of reaching Google.
        case "POST secrets-ready": {
          if (!secretsReady) {
            core.services.secrets.registerBroker(
              httpSecretBroker({
                id: "calendar",
                label: "Google Calendar",
                resolve: () => ({
                  url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                  method: "GET",
                  credentials: {
                    token: {
                      ref: "calendar",
                      delivery: { kind: "header", name: "authorization", prefix: "Bearer " },
                    },
                  },
                  operation: "Read planning calendar",
                  read: true,
                  result: "Calendar events to the integration owner",
                }),
                send: async (_url, init) => {
                  secretSends.push(new Headers(init.headers).get("authorization") ?? "");
                  return new Response(JSON.stringify({ items: [{ summary: "Planning" }] }), {
                    headers: { "content-type": "application/json" },
                  });
                },
              }),
            );
            await core.services.secrets.put({
              ref: "calendar",
              label: "Planning calendar",
              value: SECRET_TOKEN,
              expectedVersion: 0,
              expectedRevision: null,
              environment: "Personal",
            });
            secretsReady = true;
          }
          const view = await core.services.secrets.view();
          result = {
            availability: view.availability,
            entries: view.entries.length,
            confirm: SECRET_DEVICE_WORDS.confirm,
          };
          break;
        }
        // The captain's click on this computer's own enrollment card, after comparing its code with the phone's.
        case "POST secrets-confirm": {
          const cards = await core.dispatch("inf:cards:list", []);
          const card = cards.find((one) => one.id.startsWith("card-secrets-enroll-"));
          const confirm = card?.actions.find(
            (action) => action.label === SECRET_DEVICE_WORDS.confirm,
          );
          if (!card || !confirm) throw new Error("No enrollment card is waiting on this computer");
          const before = secretConfirms;
          // The click returns before its decision ends; Secrets says it changed once the device is saved or refused.
          let stop = () => {};
          const decided = new Promise<void>((resolve) => {
            stop = core.events.subscribe((channel) => {
              if (channel === "inf:secrets:changed") resolve();
            });
          });
          try {
            await core.dispatch("inf:cards:act", [card.id, confirm.id, "chrome"]);
            await within(decided, "The enrollment decision did not end on this computer");
          } finally {
            stop();
          }
          const view = await core.services.secrets.view();
          result = {
            title: card.title,
            code: card.body.match(/\d{4} \d{4}/)?.[0] ?? null,
            devices: view.devices,
            confirmed: secretConfirms - before,
          };
          break;
        }
        case "POST secrets-request": {
          secretRequests += 1;
          const receipt = await core.services.secrets.broker(
            {
              id: `phone-read-${secretRequests}`,
              reason: "Read my next planning meeting",
              broker: "calendar",
              input: { calendar: "primary" },
            },
            task.id,
          );
          result = {
            request: receipt.request,
            state: receipt.state,
            // The approval card names the secret and the task that asked; read it from the card itself.
            title:
              (await core.dispatch("inf:cards:list", [])).find(
                (card) => card.id === `card-secrets-use-${receipt.request}`,
              )?.title ?? null,
          };
          break;
        }
        // INF-4239 piece 4 (docs/secrets.md, "Asking to keep a secret"): the home's task asks to keep one secret, and the
        // real Secrets controller raises its own card, whose masked field the phone draws.
        case "POST secrets-ask-keep": {
          const answer = await core.services.secrets.askToKeep(task.id, {
            id: "phone-ask",
            reason: "Charge the test card in the checkout tests",
            secrets: [{ name: "Stripe test key", place: "Test" }],
            how: '<ol><li>Open your Stripe API keys page: <a href="https://dashboard.stripe.com/test/apikeys">dashboard.stripe.com/test/apikeys</a></li><li>Reveal the <strong>Secret key</strong> and copy it.</li></ol>',
          });
          result = {
            state: answer.state,
            // The field's label says its place once, beside the name (INF-5516's plan).
            place: SECRET_ASK_CARD_WORDS.place("Test"),
            ...secretAskShown(await core.dispatch("inf:cards:list", [])),
          };
          break;
        }
        // A Keep that cannot finish (docs/secrets.md, "Asking to keep a secret"): the task asks to replace the kept
        // calendar sign-in, which then changes on this computer, so the phone's Keep finds it stale and the card comes
        // back with new passes and the words saying why.
        case "POST secrets-ask-replace": {
          const answer = await core.services.secrets.askToKeep(task.id, {
            id: "phone-replace",
            reason: "Renew the calendar sign-in",
            secrets: [{ replace: "calendar" }],
          });
          const shown = (await core.services.secrets.view()).entries.find(
            (entry) => entry.ref === "calendar",
          );
          if (!shown)
            throw new Error("The calendar sign-in is not kept; POST secrets-ready first.");
          await core.services.secrets.put({
            ref: "calendar",
            label: shown.label,
            value: `${SECRET_TOKEN}-changed`,
            expectedVersion: shown.version,
            expectedRevision: shown.revision,
            environment: shown.environment,
          });
          result = {
            state: answer.state,
            title:
              (await core.dispatch("inf:cards:list", [])).find((card) =>
                card.id.startsWith("card-secrets-ask-"),
              )?.title ?? null,
            stale: SECRET_ASK_CARD_WORDS.stale,
          };
          break;
        }
        // What Secrets keeps after the phone's Keep: names, places and versions, never a value.
        case "GET secrets-kept": {
          const view = await core.services.secrets.view();
          result = {
            entries: view.entries.map(({ label, environment, version }) => ({
              label,
              environment,
              version,
            })),
            asks: (await core.dispatch("inf:cards:list", [])).filter((card) =>
              card.id.startsWith("card-secrets-ask-"),
            ).length,
          };
          observations.push({ check: "secrets-kept", result });
          break;
        }
        case "GET secrets-state": {
          const view = await core.services.secrets.view();
          result = {
            uses: view.uses.map(({ request, state }) => ({ request, state })),
            history: view.history.map(({ request, state, approval, device }) => ({
              request,
              state,
              approval: approval ?? null,
              device: device ?? null,
            })),
            devices: view.devices,
            cards: (await core.dispatch("inf:cards:list", []))
              .filter((card) => card.id.startsWith("card-secrets-"))
              .map(({ id, title }) => ({ id, title })),
            // The stand-in calendar received the entry exactly when this is the bearer of the invented token.
            sent: secretSends.map((header) => header === `Bearer ${SECRET_TOKEN}`),
            confirmed: secretConfirms,
          };
          observations.push({ check: "secrets", result });
          break;
        }
        case "POST biometry-enroll":
        case "POST face-in-view":
        case "POST face-away":
          if (!controls?.biometry)
            throw new Error("Only the owned simulator can change its Face ID");
          await controls.biometry(
            command === "biometry-enroll"
              ? "enroll"
              : command === "face-in-view"
                ? "face-in-view"
                : "face-away",
          );
          result = { ok: true };
          break;
        // INF-3454's phone part: approve on the stand-in Google's page, and what the computer kept.
        case "POST google-approve":
          result = await google.approve();
          break;
        case "GET google-state":
          result = await google.state();
          break;
        // INF-3563: what the computer holds after the phone's Settings pages asked it to change something.
        case "GET settings-state":
          result = await phoneSettingsState(core, settingsRules);
          break;
        case "POST settings-allowance":
          // Only a computer started on the stand-in readings reads them again.
          if (!options.settings) throw new Error("This computer was started without Settings data");
          await readPhoneAllowanceAgain(core, root);
          result = { session: PHONE_SETTINGS_SESSION_LATER };
          break;
        // INF-3830 piece 2's phone part: the fixture panel on the computer, its data, its stop and its library.
        case "POST panel-seed":
          result = await panels.seed();
          break;
        case "POST panel-remove":
          result = await panels.remove();
          break;
        case "POST panel-shy-seed":
          result = await panels.seedShy();
          break;
        case "POST panel-shy-show":
          result = await panels.showShy(true);
          break;
        case "POST panel-shy-hide":
          result = await panels.showShy(false);
          break;
        case "POST panel-shy-said-hidden":
          result = await panels.shySaid(false);
          break;
        case "POST panel-shy-remove":
          result = await panels.removeShy();
          break;
        // docs/runbooks.md, "Panels": a runbook of the captain's own shows its panel while it is on.
        case "POST panel-runbook-on":
          result = await panels.runbookOn();
          break;
        case "POST panel-runbook-off":
          result = await panels.runbookOff();
          break;
        // The app's own Automation panel, which shows on the phone while a rule is saved.
        case "POST panel-automation-on":
          result = await panels.automationOn();
          break;
        case "POST panel-automation-off":
          result = await panels.automationOff();
          break;
        case "POST panel-write":
          result = await panels.write(41);
          break;
        // The music on at the computer, which a panel reading settings.current shows.
        case "POST panel-music-on": {
          const look = await core.dispatch("inf:settings:appearance:get", []);
          result = await core.dispatch("inf:settings:appearance:set", [
            { ...look, ambientMusic: true },
          ]);
          break;
        }
        case "POST panel-note":
          result = await panels.note(1);
          break;
        case "POST panel-quit":
          result = await panels.quit();
          break;
        case "POST panel-library-tamper":
          result = await panels.tamperLibrary();
          break;
        case "POST panel-library-restore":
          result = await panels.restoreLibrary();
          break;
        case "GET panel-state":
          result = await panels.state();
          break;
        // INF-5531 piece 2's phone part: a crewmate's card that reads live, a task added under it, and its end.
        case "POST live-card":
          result = await cardReads.card();
          break;
        case "POST live-card-add-task":
          result = await cardReads.addTask();
          break;
        case "POST live-card-end":
          result = await cardReads.end();
          break;
        case "POST live-card-beside":
          result = await cardReads.beside();
          break;
        case "POST live-card-beside-end":
          result = await cardReads.endBeside();
          break;
        case "POST live-card-past":
          result = await cardReads.past();
          break;
        case "GET state":
          result = {
            devices: core.services.devices.list(),
            cards: await core.dispatch("inf:cards:list", []),
            feed: await core.dispatch("inf:feed:recent", []),
            cardTitle,
            readings: { ...readings },
          };
          break;
        // INF-1558: the held/released wire states observed in INF-1557, through the real
        // card store, dispatcher and pinned connection. No crewmate timing or account is needed.
        case "POST held-card-fixture": {
          // A note leaves through its own Got it; the corner only puts a card aside (INF-2794).
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          core.services.supervisor.cards.hostCards.raiseHostCard({
            id: "card-phone-readiness",
            title: "Keep the harbour entrance clear",
            meta: "Harbour survey",
            body: "<p>The harbour survey is ready for your choice.</p>",
            actions: [
              { id: "keep", label: "Keep the entrance clear", default: true },
              { id: "wait", label: "Not now" },
            ],
            awaiting: "close-out",
          });
          core.services.supervisor.addFirstmateCard({
            id: "phone-readiness-witness",
            title: "The tide reading is ready",
            body: "<p>This reading can already be used.</p>",
            actions: [],
          });
          core.services.supervisor.cards.flushBroadcast();
          result = { held: "Keep the harbour entrance clear", ready: "The tide reading is ready" };
          break;
        }
        case "POST release-held-card": {
          const card = core.services.supervisor.cards
            .snapshot()
            .find((card) => card.id === "card-phone-readiness");
          if (!card) throw new Error("The readiness fixture has no held card");
          const { awaiting: _awaiting, sentBackAt: _sentBackAt, ...released } = card;
          core.services.supervisor.cards.hostCards.raiseHostCard({
            ...released,
            body: "<p>The harbour survey is ready for your choice.</p>",
          });
          core.services.supervisor.cards.flushBroadcast();
          result = { ok: true };
          break;
        }
        case "POST replied-under-card": {
          const card = core.services.supervisor.cards
            .snapshot()
            .find((card) => card.id === "card-phone-readiness");
          if (!card) throw new Error("The readiness fixture has no released card");
          core.services.supervisor.cards.hostCards.raiseHostCard({
            ...card,
            awaiting: "answer",
            sentBackAt: Date.now(),
            body: "<p>The surveyor is answering your harbour question.</p>",
          });
          core.services.supervisor.cards.flushBroadcast();
          result = { ok: true };
          break;
        }
        case "GET readiness-state": {
          result = { card: await core.dispatch("inf:cards:past", ["card-phone-readiness"]) };
          break;
        }
        case "POST answer-note-fixture": {
          const answer = seedTask(core.services.tasks, {
            id: `native-answer-${randomBytes(8).toString("hex")}`,
            title: "Explain the harbour launch window",
            status: "idle",
            shape: { kind: "research", deliverable: "answer" },
          });
          const cards = core.services.supervisor.cards;
          const answerText = "The review stays beside the launch checklist.";
          // INF-4427: two files the crewmate kept for the captain, which the phone counts and leaves to a computer.
          const files = [
            { name: "harbour-launch-window.pdf", bytes: 184_320 },
            { name: "tide-table.csv", bytes: 6_144 },
          ].map(({ name, bytes }) => {
            const sha256 = createHash("sha256").update(name).digest("hex");
            const id = cardFileId(answer.id, sha256);
            return { id, name, bytes, sha256, path: `/kept/${cardFileStoredName(id)}` };
          });
          const id = cards.emitCrewmateCard(
            answer.id,
            {
              id: "harbour-answer",
              title: "The harbour launch window is ready",
              body: `<p>${answerText}</p>`,
              actions: [],
              answering: true,
              files,
            },
            "crew",
          );
          cards.closeOut({ kind: "crewmate", taskId: answer.id }, "idle");
          result = {
            taskId: answer.id,
            id,
            title: "The harbour launch window is ready",
            answerText,
            hideLabel: CARD_LEAVE.record.label,
          };
          break;
        }
        case "POST answer-note-state": {
          let body = "";
          for await (const chunk of request) body += chunk.toString();
          const {
            taskId: id,
            expectedStatus,
            expectedCardOpen,
          } = JSON.parse(body) as {
            taskId: string;
            expectedStatus?: string;
            expectedCardOpen?: boolean;
          };
          const cards = core.services.supervisor.cards;
          if (expectedStatus !== undefined || expectedCardOpen !== undefined)
            await until(
              () =>
                (expectedStatus === undefined ||
                  core.services.tasks.get(id)?.status === expectedStatus) &&
                (expectedCardOpen === undefined ||
                  cards.snapshot().some((card) => card.taskId === id) === expectedCardOpen),
            );
          const answer = typeof id === "string" ? core.services.tasks.get(id) : undefined;
          result = {
            status: answer?.status,
            reason: answer?.closedReason,
            ready: typeof id === "string" && cards.answerNoteForTask(id) !== undefined,
            cardOpen: cards.snapshot().some((card) => card.taskId === id),
          };
          observations.push({ check: "saved-answer-state", taskId: id, result });
          break;
        }
        // INF-1879: a real first-mate question record, filed through the task owner.
        case "POST question-record-fixture": {
          const title = "Pick the harbour review day";
          const cardId = core.services.supervisor.addFirstmateCard({
            id: "harbour-review-day",
            title,
            body: "<p>The harbour review can run on Tuesday or Thursday next week.</p>",
            actions: [
              { id: "tuesday", label: "Tuesday", default: true },
              { id: "thursday", label: "Thursday" },
            ],
          });
          const question = core.services.tasks.capture.fileDecision({
            id: randomBytes(4).toString("hex"),
            title,
            cardId,
            repoId: null,
          });
          result = { taskId: question.id, cardId, title, hideLabel: CARD_LEAVE.record.label };
          break;
        }
        case "POST question-record-state": {
          const { taskId, cardId, expectedStatus } = JSON.parse(await controlBody(request)) as {
            taskId: string;
            cardId: string;
            expectedStatus?: string;
          };
          if (expectedStatus !== undefined)
            await until(() => core.services.tasks.get(taskId)?.status === expectedStatus);
          const question = core.services.tasks.get(taskId);
          result = {
            status: question?.status,
            reason: question?.closedReason ?? null,
            cardOnStack: core.services.supervisor.cards
              .snapshot()
              .some((card) => card.id === cardId),
            runs: writes
              .filter(
                (write) =>
                  write.channel === "inf:task:run" &&
                  Array.isArray(write.args) &&
                  write.args[0] === taskId,
              )
              .map((write) => ({ actor: write.actor, move: write.args[1] })),
          };
          observations.push({ check: "question-record-state", taskId, result });
          break;
        }
        case "POST cards-fixture": {
          // INF-64 piece 4: actual stored cards, published requests and the existing view journey's promises.
          // A note leaves through its own Got it; the corner only puts a card aside (INF-2794).
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const directory = join(userData, "crewmates", task.id, "cards");
          mkdirSync(directory, { recursive: true });
          const picture = `${task.id}-${"a".repeat(32)}.png`;
          const recording = `${task.id}-${"b".repeat(32)}.mp4`;
          writeFileSync(
            join(directory, picture),
            encodePng(240, 120, (x, y) => (x < 120 ? [30, 150, 190] : [40 + y, 70, 110])),
          );
          copyFileSync(
            join(import.meta.dirname, "../fixtures/demo/moving-box.mp4"),
            join(directory, recording),
          );
          // A sound clip the card plays in its strip (docs/card-authoring.md "Sound clips"): the two-second tone the
          // Mac's reader checks, its sound repeated ten times so the clip still plays while the journey leaves the app.
          const clip = `${task.id}-${"c".repeat(32)}.wav`;
          const tone = readFileSync(join(import.meta.dirname, "../fixtures/sound/tone.wav"));
          const toneSound = tone.subarray(44, 44 + tone.readUInt32LE(40));
          const clipSound = Buffer.concat(Array.from({ length: 10 }, () => toneSound));
          const clipHeader = Buffer.from(tone.subarray(0, 44));
          clipHeader.writeUInt32LE(36 + clipSound.length, 4);
          clipHeader.writeUInt32LE(clipSound.length, 40);
          writeFileSync(join(directory, clip), Buffer.concat([clipHeader, clipSound]));
          // INF-3887: exercise a half-megabyte kept log without borrowing a session transcript.
          // Complete, numbered lines give the phone reader multiple blocks to render.
          const proofLine = "Measured the sample ferry arrival and matched the expected harbour.\n";
          const logBytes = Buffer.from(
            Array.from(
              { length: Math.ceil((512 * 1024) / (proofLine.length + 7)) },
              (_, index) => `${String(index + 1).padStart(5, "0")}  ${proofLine}`,
            ).join(""),
            "utf8",
          );
          const log = `${task.id}-${createHash("sha256").update(logBytes).digest("hex")}.txt`;
          writeFileSync(join(directory, log), logBytes);
          const address = `http://127.0.0.1:${(control.address() as { port: number }).port}/${token}/leaked`;
          cardIDs.choice = core.services.supervisor.addFirstmateCard({
            id: "phone-choice",
            title: "Choose the harbour",
            holdsPlace: true,
            body: `<p>Your answer stays on your Mac.</p>
              <fieldset data-inf-options-only><legend>Which harbour?</legend>
              <label><input type="radio" required name="harbour" value="north"> North Basin</label>
              <label><input type="radio" required name="harbour" value="south"> South Basin</label></fieldset>
              <label for="note">A note</label><input id="note" name="note" value="Morning tide">
              <button id="preview" type="button">Move the marker</button><p id="marker">Marker at the entrance</p>
              <input id="depth" type="range" min="0" max="10" value="8" aria-label="Chart depth" style="width:100%"><p id="depth-shown">Chart depth 8</p>
              <p id="sandbox">Checking the card boundary</p><p id="appearance"></p>
              <script>
                const appearance = theme => document.getElementById("appearance").textContent = theme === "dark" ? "Night chart" : "Day chart";
                appearance(inf.theme); inf.onTheme(appearance);
                // INF-3110: a body's own slider keeps its sideways drag; the card's swipe leaves it alone.
                document.getElementById("depth").addEventListener("input", (event) => {
                  document.getElementById("depth-shown").textContent = "Chart depth " + event.target.value;
                });
                inf.stage("chart", {zoom: 1});
                document.getElementById("preview").addEventListener("click", () => {
                  inf.stage("chart", {zoom: 2}); document.getElementById("marker").textContent = "Marker inside the harbour";
                });
                Promise.all([
                  inf.action("settings").then(() => "effect escaped", () => "effect refused"),
                  fetch(${JSON.stringify(address)}).then(() => "network escaped", () => "network refused"),
                  Promise.resolve().then(() => parent.document.body).then(() => "parent escaped", () => "parent refused"),
                  Promise.resolve().then(() => webkit.messageHandlers.cardHost.postMessage({type:"hash",scripts:["native access probe"]})).then(() => "native escaped", () => "native refused")
                ]).then(results => document.getElementById("sandbox").textContent = results.join(" · "));
                const image = new Image(); image.src = ${JSON.stringify(address)};
                // Probe navigation after the frame finishes loading: navigating during parsing cancels its own load.
                const leave = document.createElement("button"); leave.textContent = "Try to leave the card";
                leave.addEventListener("click", () => { location.href = ${JSON.stringify(address)}; }); document.body.appendChild(leave);
                const injected = document.createElement("script"); injected.textContent = "document.getElementById('sandbox').textContent='injected script escaped'"; document.body.appendChild(injected);
                const stall = document.createElement("button"); stall.textContent = "Stall the card";
                stall.addEventListener("click", () => { ${STALL_SCRIPT} }); document.body.appendChild(stall);
                let stallOnAnswer = false;
                const arm = document.createElement("button"); arm.textContent = "Stall the next answer";
                arm.addEventListener("click", () => { stallOnAnswer = true; }); document.body.appendChild(arm);
                window.addEventListener("message", event => {
                  if (stallOnAnswer && event.data?.type === "collect") { ${STALL_SCRIPT} }
                }, {capture: true});
              </script>`,
            actions: [
              { id: "choose", label: "Use this harbour", default: true },
              {
                id: "settings",
                label: "Open Settings",
                effect: { kind: "open", target: "settings" },
              },
            ],
          });
          cardIDs.conversation = core.services.supervisor.addFirstmateCard({
            id: "phone-conversation",
            title: "Read the harbour chart",
            holdsPlace: true,
            body: `<p>The survey is ready for your reply.</p><img src="app-frame://images/${picture}" alt="Blue harbour survey">
            <figure><svg viewBox="0 0 750 120" width="100%" role="img" aria-label="Harbour approach in three legs"><rect x="20" y="30" width="200" height="60" rx="8" fill="var(--bg-2)" stroke="var(--line-2)"/><text x="120" y="66" text-anchor="middle" fill="var(--fg-1)">Outer buoy</text><rect x="275" y="30" width="200" height="60" rx="8" fill="var(--bg-2)" stroke="var(--line-2)"/><text x="375" y="66" text-anchor="middle" fill="var(--fg-1)">North entrance</text><rect x="530" y="30" width="200" height="60" rx="8" fill="var(--accent-dim)" stroke="var(--accent)"/><text x="630" y="66" text-anchor="middle" fill="var(--fg-1)">Inner quay</text></svg><figcaption>The approach in three legs</figcaption></figure>
            <figure data-inf-demo="app-frame://media/${recording}" data-inf-duration="5000"><img src="app-frame://images/${picture}" alt="The moving harbour marker"><figcaption>Move the harbour marker.</figcaption></figure>
            <figure data-inf-sound="app-frame://media/${clip}" data-inf-sound-duration="20000"><figcaption>The harbour bell at the north entrance.</figcaption></figure>
            <p><button type="button" data-inf-log="${cardLogUrl(log)}" data-inf-log-bytes="${logBytes.length}">The harbour survey log</button></p>
            <button data-inf-action="body">Choose from the body</button>`,
            actions: [
              { id: "body", label: "Keep this chart", default: true },
              { id: "browser", label: "Open browser", effect: { kind: "open", target: "browser" } },
            ],
          });
          cardIDs.note = core.services.supervisor.addFirstmateCard({
            id: "phone-close",
            title: "The tide note",
            body: "<p>The next tide is in the morning.</p>",
            actions: [],
          });
          core.services.supervisor.cards.addMessage(
            cardIDs.conversation,
            "firstmate",
            "The chart is ready.",
          );
          cardRequests.length = 0;
          result = {
            choice: "Choose the harbour",
            conversation: "Read the harbour chart",
            note: "The tide note",
            log: "The harbour survey log",
            replyAnswer: MOCK_FM_CHAT_TEXT,
          };
          break;
        }
        // INF-1610: a card about a long message of the captain's, which the phone draws as its "You asked" line.
        case "POST move-card":
          result = await raiseMoveCard(core, ["ar", "ja", "en"]);
          break;
        case "POST move-card-past":
          result = await showMoveCardPast(core);
          break;
        case "POST asked-card": {
          const ask = core.services.tasks.capture.openAsk({
            id: "phone-ask",
            text: PHONE_ASKED_MESSAGE,
          });
          const title = "The stack keeps a card you replied under in its place";
          // The first mate's answer is its own question record, which the
          // message attached to (INF-2714); the card reads its line there.
          const asked = core.services.tasks.capture.fileQuestion({
            id: "phone-asked",
            title,
            outcome: "The stack keeps a card you replied under in its place.",
            cardId: resolveFirstmateCardId("phone-asked-card"),
          });
          core.services.tasks.capture.attachAsk(ask.id, asked.id, "tool:emit_card", true);
          core.services.tasks.capture.closeAsk(ask.id, "closed");
          core.services.supervisor.addFirstmateCard({
            id: "phone-asked-card",
            title,
            body: "<p>Nothing else about the order changed.</p>",
            actions: [],
          });
          result = { title, words: PHONE_ASKED_MESSAGE };
          break;
        }
        // INF-1524: a crewmate's merge card as the Mac draws it - its task's key, model and place, its risk, the
        // host's fact strip, what to do after merging, a revision and a thread - for the phone's card head and foot.
        case "POST merge-card": {
          const merging = seedTask(core.services.tasks, {
            id: "phone-merge",
            title: "Keep the harbour chart's north entrance clear",
            status: "idle",
          });
          // The crew's own writer, as a crewmate's completion card reaches it; the supervisor's emit needs a live session.
          const cards = core.services.supervisor.cards;
          const story = (extra: string, lead = "") => ({
            id: "harbour-merge",
            title: "Merge the north entrance chart",
            body: `${lead}<h3>Why</h3><p>You asked for the north entrance to stay clear on the next chart.</p>
              <h3>What changed</h3><p>The chart marks the north entrance as kept clear at every tide.</p>${extra}`,
            requiredActions: [
              {
                id: "harbour-notice",
                target: "Harbour office",
                title: "Post the new chart at the harbour office",
                consequence: "Skippers keep reading the old chart until it is posted.",
                instructions: ["Print the new chart and pin it beside the old one."],
                criterion: "The new chart hangs at the harbour office.",
                prerequisites: [],
                completion: { kind: "manual" as const, label: "Posted" },
              },
            ],
            // INF-3149: the crew's own step shows on the phone too, after the captain's.
            afterMerge: [
              {
                title: "Continue: Send the new chart to the pilot boats",
                goal: "Every pilot boat carries the chart with the north entrance kept clear.",
              },
            ],
            risk: {
              declared: {
                blast: { level: "low" as const, why: "One chart layer" },
                behavior: {
                  level: "medium" as const,
                  why: "The north entrance reads as kept clear by default",
                },
                undo: { level: "low" as const, why: "Revert and done" },
                evidence: { level: "low" as const, why: "Shown on the chart at every tide" },
                sensitivity: { level: "low" as const, why: "None" },
                novelty: { level: "low" as const, why: "Edits the existing chart layer" },
                deps: { level: "low" as const, why: "Nothing added" },
              },
            },
            actions: [
              { id: "later", label: "Not yet" },
              {
                id: "merge",
                label: "Merge",
                default: true,
                effect: { kind: "merge" as const, after: "close" as const },
              },
            ],
          });
          cardIDs.merge = cards.emitCrewmateCard(
            merging.id,
            story(""),
            merging.title,
            "Sonnet 5.5",
            "on Mac mini",
          );
          // The crewmate's turn ends, which brings its card to the stage.
          cards.closeOut({ kind: "crewmate", taskId: merging.id }, "idle");
          const tideQuestion = core.services.supervisor.cards.addMessage(
            cardIDs.merge,
            "captain",
            "Does it cover the evening tide too?",
          );
          // The captain saw the first version, so the crewmate's revision adds one part the revised line and change bar name.
          // INF-1623: a revision answering the captain carries its answer, which the thread shows as the crewmate's.
          cards.seen(cardIDs.merge, cards.shown(cardIDs.merge)?.offerId ?? "");
          // INF-5035: the revision comes back to a captain who saw the first version, so it opens with the crewmate's
          // summary under the label naming that sighting, as the crew's merge card door builds it.
          const sinceSeen = { at: Date.now() };
          cards.emitCrewmateCard(
            merging.id,
            {
              ...story(
                "<h3>After</h3><p>The evening tide keeps the entrance clear too.</p>",
                sinceSeenSection(MERGE_SINCE_SEEN_SUMMARY, sinceSeen),
              ),
              reply: "Yes: the chart keeps it clear at every tide.",
              // Only a line that names the captain's message answers it.
              answersMessage: tideQuestion.id,
            },
            merging.title,
            "Sonnet 5.5",
            "on Mac mini",
          );
          cards.closeOut({ kind: "crewmate", taskId: merging.id }, "idle");
          // INF-2225 (the captain approved shared cards: "Any crewmate or first mate, without a per-card permission
          // grant."): a crewmate on another task writes on this card's thread through the crew's shared-card writer,
          // and the phone names who really wrote it in the Mac's words.
          const surveying = seedTask(core.services.tasks, {
            id: "phone-survey",
            title: "Check the evening tide marks",
            status: "idle",
          });
          const contributed = cards.contribute(
            { actor: "crewmate", taskId: surveying.id },
            {
              id: cardIDs.merge,
              title: "",
              body: "",
              actions: [],
              reply: "The survey boat checked the evening tide marks; they match the chart.",
            },
            { operationId: "phone-survey-line" },
          );
          if (contributed.effect !== "reply-only") {
            throw new Error(
              `the survey crewmate's line was not written: ${JSON.stringify(contributed)}`,
            );
          }
          // The words the phone shows come from the Mac's owners, which the phone's generated words copy.
          result = {
            title: "Merge the north entrance chart",
            key: core.services.tasks.get(merging.id)?.key,
            taskId: merging.id,
            words: "Hold it for the morning survey.",
            sinceSeenLabel: englishOf(sinceSeenSaid(sinceSeen)),
            sinceSeenSummary: MERGE_SINCE_SEEN_SUMMARY,
            why: "Why",
            blast: `${RISK_WORDS.blast.label} · ${RISK_WORDS.blast.levels.low}`,
            sentLead: PAST_CARD_WORDS_LEAD,
            anythingElse: ANYTHING_ELSE_ANSWER,
            requiredLead: REQUIRED_ACTIONS_LEAD,
            crewLead: AFTER_MERGE_LEAD,
            threadCrew: THREAD_WHO_LABELS.crewmate,
            threadContributor: contributorWords({
              host: false,
              label: contributed.contributor.label,
            }),
          };
          break;
        }
        // INF-2565: a first mate card whose thread the captain is reading when the card is revised.
        case "POST flip-card": {
          // A note leaves through its own Got it; the corner only puts a card aside (INF-2794).
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          cardIDs.flip = core.services.supervisor.addFirstmateCard({
            id: "phone-flip",
            title: "Yes, crewmates on the Mac mini are waiting in its test line",
            body: "<p>Four builds wait in the Mac mini's test line behind one long check.</p>",
            actions: [
              { id: "backlog", label: "Move the four newest builds to the backlog" },
              { id: "drain", label: "Let it drain", default: true },
            ],
          });
          flipQuestion = core.services.supervisor.cards.addMessage(
            cardIDs.flip,
            "captain",
            "but is the mini indeed running out of ram?",
          ).id;
          // INF-2225 (the captain: "Only a line that says it answers it; a handoff stays open"): this line hands
          // off, so the captain's question still waits on the first mate's revision.
          core.services.supervisor.cards.addMessage(
            cardIDs.flip,
            "firstmate",
            "I can't see the mini's live memory from here, so I don't know yet. I'll update this card with the answer.",
          );
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = {
            offerId:
              core.services.supervisor.cards.snapshot().find((card) => card.id === cardIDs.flip)
                ?.offerId ?? null,
            title: "Yes, crewmates on the Mac mini are waiting in its test line",
            mate: "I can't see the mini's live memory from here, so I don't know yet. I'll update this card with the answer.",
          };
          break;
        }
        // The first mate revises that card with the answer: same id, new body, so a new offer. The question
        // still waits, so the revision carries its answer naming it, which the thread shows after the revised line.
        case "POST flip-card-revise": {
          const title = "Yes, crewmates on the Mac mini are waiting in its test line";
          const added = "The Mac mini has memory to spare: it is not running out.";
          core.services.supervisor.addFirstmateCard({
            id: cardIDs.flip,
            title,
            body: `<p>Four builds wait in the Mac mini's test line behind one long check.</p><p>${added}</p>`,
            actions: [
              { id: "backlog", label: "Move the four newest builds to the backlog" },
              { id: "drain", label: "Let it drain", default: true },
            ],
            reply: "No: it has memory to spare. I added that to the card.",
            answersMessage: flipQuestion,
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          const shown = core.services.supervisor.cards
            .snapshot()
            .find((card) => card.id === cardIDs.flip);
          result = {
            added,
            offerId: shown?.offerId ?? null,
            messages: core.services.supervisor.cards.thread(cardIDs.flip),
          };
          break;
        }
        case "POST reader-card":
          result = await raiseReaderCard(core);
          break;
        // INF-6865: a long decision, card 2 of 3, which the crewmate revises in place while the captain reads it.
        case "POST revised-scroll-card":
          result = await raiseRevisedCard(core);
          break;
        case "POST revised-scroll-card-revise":
          result = reviseRevisedCard(core, await controlBody(request));
          break;
        // INF-6136: a crewmate's decision with the tallest head a card draws (its task's key, place and model, a
        // four-line title and a revised line), a body several screens long with a required question, three choices
        // and a thread; beside it a short first mate card, its neighbour in the row.
        case "POST top-bar-card": {
          await clearPhoneCards(core);
          const shortTitle = "The tide table is up to date";
          core.services.supervisor.addFirstmateCard({
            id: "phone-top-bar-short",
            title: shortTitle,
            body: "<p>The harbour office posted this week's tide table.</p>",
            actions: [
              { id: "later", label: "Not now" },
              { id: "read", label: "Read it", default: true },
            ],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          const surveying = seedTask(core.services.tasks, {
            id: "phone-top-bar",
            title: "Review what slowed the harbour survey",
            status: "idle",
          });
          const cards = core.services.supervisor.cards;
          const title =
            "The pilot boats and the survey launch slowed the north entrance chart; two fixes recommended";
          const reading = (text: string) => `<p>${text}</p>`.repeat(5);
          const story = (extra: string) => ({
            id: "harbour-slowdown",
            title,
            body: `<p>The north entrance chart waited on two things this week.</p>
              ${reading("The pilot boats took the survey launch's mornings, so the depth readings waited a day each time.")}
              <fieldset><legend>Which fix goes first?</legend>
              <label><input type="radio" name="first" required value="boats" data-inf-recommended> Give the launch its own mornings</label>
              <label><input type="radio" name="first" required value="sounder"> Fit a second depth sounder</label></fieldset>
              ${reading("A second depth sounder lets the pilot boats take readings on their own runs past the entrance.")}${extra}`,
            actions: [
              { id: "both", label: "Approve both fixes", default: true },
              { id: "first", label: "Approve the first fix only" },
              { id: "later", label: "Not now" },
            ],
          });
          cardIDs.topBar = cards.emitCrewmateCard(
            surveying.id,
            story(""),
            surveying.title,
            "Opus 5.5",
            "on Mac mini",
          );
          cards.closeOut({ kind: "crewmate", taskId: surveying.id }, "idle");
          const question = cards.addMessage(
            cardIDs.topBar,
            "captain",
            "Would a third boat help instead?",
          );
          // The captain saw the first version, so the revision carries the revised line under the title.
          cards.seen(cardIDs.topBar, cards.shown(cardIDs.topBar)?.offerId ?? "");
          cards.emitCrewmateCard(
            surveying.id,
            {
              ...story("<p>A third boat would wait on the same sounder, so it would not help.</p>"),
              reply: "No: a third boat would wait on the same sounder.",
              answersMessage: question.id,
            },
            surveying.title,
            "Opus 5.5",
            "on Mac mini",
          );
          cards.closeOut({ kind: "crewmate", taskId: surveying.id }, "idle");
          cards.flushBroadcast();
          topBarRevision = { taskId: surveying.id, story };
          result = { title, shortTitle, key: core.services.tasks.get(surveying.id)?.key };
          break;
        }
        // The crewmate revises that card again while the captain reads its thread.
        case "POST top-bar-card-revise": {
          if (!topBarRevision) throw new Error("top-bar-card-revise before top-bar-card");
          const cards = core.services.supervisor.cards;
          const added = "The launch's own mornings start on Monday.";
          cards.emitCrewmateCard(
            topBarRevision.taskId,
            {
              ...topBarRevision.story(`<p>${added}</p>`),
              reply: "I added when the launch's mornings start.",
            },
            "Review what slowed the harbour survey",
            "Opus 5.5",
            "on Mac mini",
          );
          cards.closeOut({ kind: "crewmate", taskId: topBarRevision.taskId }, "idle");
          cards.flushBroadcast();
          result = { added };
          break;
        }
        // INF-3124: a first mate card whose thread is longer than the card's back, read from its start.
        case "POST place-card": {
          await clearPhoneCards(core);
          const title = "The release window moves to Thursday";
          cardIDs.place = core.services.supervisor.addFirstmateCard({
            id: "phone-place",
            title,
            body: "<p>The release window moves to Thursday, after the long check finishes.</p>",
            actions: [
              { id: "wait", label: "Wait for Thursday", default: true },
              { id: "now", label: "Release today" },
            ],
          });
          const first =
            "Here is the whole plan for the move, from the first check to the release itself.";
          const said: [CardMessage["who"], string][] = [
            ["firstmate", first],
            ["captain", "walk me through it, step by step"],
            ...Array.from({ length: 12 }, (_, step): [CardMessage["who"], string] => [
              "firstmate",
              `Step ${step + 1}: the long check runs again on the newest version, and the release waits for its result before anything moves on to the next part of the plan.`,
            ]),
          ];
          for (const [who, text] of said)
            core.services.supervisor.cards.addMessage(cardIDs.place, who, text);
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          // A reply from the phone wakes the stand-in first mate, whose answer joins this thread.
          result = { title, first, count: said.length, replyAnswer: MOCK_FM_CHAT_TEXT };
          break;
        }
        // Two more lines from the first mate while the captain reads that thread from its start.
        case "POST place-card-more": {
          const newest = "One more thing: the notes for the release are ready for you to read.";
          core.services.supervisor.cards.addMessage(
            cardIDs.place,
            "firstmate",
            "The long check passed on the newest version.",
          );
          core.services.supervisor.cards.addMessage(cardIDs.place, "firstmate", newest);
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = { added: "The long check passed on the newest version.", newest };
          break;
        }
        // INF-4838: a card with a short line beside a long paragraph, the text iOS enlarged in a wide card unless the
        // card's page sets `text-size-adjust`; the short line fits on one line in the narrow card and the wide one.
        case "POST long-text-card": {
          await clearPhoneCards(core);
          const title = "The harbour survey route";
          const line = "Four builds wait.";
          const route =
            "The survey boat leaves the north basin at first light and follows the marked channel past the breakwater, the fuel dock and the old lighthouse, then turns east along the shoal where the depth readings changed after the winter storms. The crew records each reading against last year's chart, notes every buoy that drifted, and photographs the harbour wall where the stones moved. Once the boat is back the readings go to the harbour office, which decides whether the channel needs dredging before the summer traffic starts.";
          core.services.supervisor.addFirstmateCard({
            id: "phone-long-text",
            title,
            body: `<p>${line}</p><p>${route}</p>`,
            actions: [],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = { title, line };
          break;
        }
        // INF-3296's phone piece: a first mate card whose body holds two paragraphs and a list, for notes on a whole
        // part and on words selected in one, behind a card shown ahead of it (INF-4353).
        case "POST note-card": {
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          // INF-4353: a card shown before the notes card, so the notes card's body first draws beside it, kept loaded
          // with no pane, and shows only once the pager moves to it. Like the notes card it asks a choice, so the
          // stack's order (priority, then oldest) puts it first.
          const lead = "The harbour survey is booked";
          const leadLine = "The survey boat leaves on Monday.";
          core.services.supervisor.addFirstmateCard({
            id: "phone-notes-lead",
            title: lead,
            body: `<p>${leadLine}</p>`,
            actions: [
              { id: "keep", label: "Keep Monday", default: true },
              { id: "move", label: "Move to Tuesday" },
            ],
          });
          const title = "The release window moves to Thursday";
          const part = "The release window moves to Thursday, after the long check finishes.";
          const words = "Four builds wait in the test line behind one long check.";
          cardIDs.notes = core.services.supervisor.addFirstmateCard({
            id: "phone-notes",
            title,
            body: `<p>${part}</p><p>${words}</p><ul><li>The notes for the release are ready.</li><li>Nothing else waits.</li></ul>`,
            actions: [
              { id: "wait", label: "Wait for Thursday", default: true },
              { id: "now", label: "Release today" },
            ],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = { lead, leadLine, title, part, words };
          break;
        }
        // INF-5608's plan, piece 2: a card whose choice carries the field's photo and note, behind no other card.
        case "POST carried-card": {
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const said = await controlBody(request);
          const { id } = (said ? JSON.parse(said) : {}) as { id?: string };
          const raised = raiseCarriedCard(core, id);
          cardIDs.carried = raised.id;
          turnsBeforeRelease = firstmateTurnsEnded;
          result = raised;
          break;
        }
        // The first mate's turn that read the phone's choice has ended, and what the card kept with it.
        case "POST carried-heard":
          await until(
            () =>
              !firstmateBusy &&
              firstmateTurnsEnded > turnsBeforeRelease &&
              provider.requestBodies().some((body) => body.includes(`(${cardIDs.carried})`)),
          );
          result = await carriedHeard(core, cardIDs.carried, provider.requestBodies());
          break;
        case "POST carried-past":
          result = await showCarriedPast(core, cardIDs.carried);
          break;
        // A computer from before the change: this build's home whose welcome leaves choice-attachments out.
        case "POST carried-older-home":
          await connection.close();
          connection = connect(PROTOCOL_VERSION, true, undefined, [CHOICE_ATTACHMENTS]);
          await connection.settled();
          result = { ok: true };
          break;
        case "GET note-thread":
          result = { messages: core.services.supervisor.cards.thread(cardIDs.notes).messages };
          break;
        // INF-1524: a card that arrives while the merge card is read, which Home counts beside the pager.
        case "POST merge-news":
          cardIDs.news = core.services.supervisor.addFirstmateCard({
            id: "phone-news",
            title: "The survey boat is back",
            body: "<p>The survey boat is back in the harbour.</p>",
            actions: [],
          });
          // The first mate's turn ends, as its own card reaches the stage.
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          result = { title: "The survey boat is back" };
          break;
        case "POST show-merge-past":
          result = await core.dispatch("inf:cards:show-past", [cardIDs.merge]);
          break;
        // The card question stepper on the phone: a decision asking three questions, each after a section of reading, so
        // the last one starts below the room the card shows.
        case "POST question-card": {
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const title = "Plan the harbour survey";
          const questions = [
            "Which day should the survey run?",
            "Which boat goes out?",
            "What should the crew measure first?",
          ];
          const reading = (text: string) => `<p>${text}</p>`.repeat(6);
          core.services.supervisor.addFirstmateCard({
            id: "phone-question-card",
            title,
            body: `<p>The harbour survey needs three answers before the crew books the boat.</p>
              ${reading("Tuesday has the calmest forecast. Thursday has the lowest tide, which shows more of the north wall.")}
              <fieldset data-inf-options-only><legend>${questions[0]}</legend>
              <label><input type="radio" name="day" required value="tuesday" data-inf-recommended> Tuesday</label>
              <label><input type="radio" name="day" required value="thursday"> Thursday</label></fieldset>
              ${reading("The pilot boat is faster. The survey launch carries the depth sounder without moving it between boats.")}
              <fieldset data-inf-options-only><legend>${questions[1]}</legend>
              <label><input type="radio" name="boat" required value="pilot"> The pilot boat</label>
              <label><input type="radio" name="boat" required value="launch" data-inf-recommended> The survey launch</label></fieldset>
              ${reading("Depth is the reading the chart needs. Silt and the wall's condition can wait for the spring survey.")}
              <fieldset data-inf-options-only><legend>${questions[2]}</legend>
              <label><input type="radio" name="measure" required value="depth"> Depth</label>
              <label><input type="radio" name="measure" required value="silt"> Silt</label>
              <label><input type="radio" name="measure" required value="wall"> The north wall</label></fieldset>`,
            actions: [
              { id: "book", label: "Book the survey", default: true },
              { id: "wait", label: "Not now" },
            ],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = { title, questions };
          break;
        }
        // INF-4425: a decision with one required question and one the captain may skip, its Default marked.
        case "POST default-card": {
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const title = "Send the harbour report";
          core.services.supervisor.addFirstmateCard({
            id: "phone-default-card",
            title,
            body: `<p>The harbour report is ready once these two calls are made.</p>
              <fieldset data-inf-options-only><legend>Who reads the report?</legend>
              <label><input type="radio" name="audience" required value="crew" data-inf-recommended> The crew</label>
              <label><input type="radio" name="audience" required value="harbour"> The harbour office</label></fieldset>
              <label for="send">When should it go out?</label><select id="send" name="send" data-inf-options-only><option value="">Choose</option><option value="friday" data-inf-recommended>Friday</option><option value="monday">Monday</option></select>`,
            actions: [
              { id: "send", label: "Send the report", default: true },
              { id: "wait", label: "Not now" },
            ],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = { title, defaultLine: "Default: Friday" };
          break;
        }
        // INF-5445 piece 2: a decision with two required questions, whose draft the phone shares with every other screen.
        case "POST draft-card": {
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const title = "Book the harbour survey";
          const part = "The harbour survey needs two answers before the crew books the boat.";
          // The core names the card itself (`card-fm-` before the id given), and every draft command reads it by that name.
          draftCardId = core.services.supervisor.addFirstmateCard({
            id: "phone-draft-card",
            title,
            body: `<p>${part}</p>
              <fieldset data-inf-options-only><legend>Which day should the survey run?</legend>
              <label><input type="radio" name="day" required value="tuesday"> Tuesday</label>
              <label><input type="radio" name="day" required value="thursday"> Thursday</label></fieldset>
              <fieldset data-inf-options-only><legend>Which boat goes out?</legend>
              <label><input type="radio" name="boat" required value="pilot"> The pilot boat</label>
              <label><input type="radio" name="boat" required value="launch"> The survey launch</label></fieldset>`,
            actions: [
              { id: "book", label: "Book the survey", default: true },
              { id: "wait", label: "Not now" },
            ],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          draftChanges.length = 0;
          result = { title, part, cardId: draftCardId };
          break;
        }
        case "GET draft-state": {
          const draft =
            core.services.cardDrafts.read().find((one) => one.cardId === draftCardId) ?? null;
          result = { draft, changes: structuredClone(draftChanges) };
          break;
        }
        // Waits until the card's draft holds these values for each named question, these words and notes with these
        // comments, or is gone, on the computer's own events, then answers as draft-state does.
        case "POST draft-wait": {
          let body = "";
          for await (const chunk of request) body += chunk.toString();
          const want = JSON.parse(body) as {
            answers?: Record<string, string[]>;
            words?: string;
            notes?: string[];
            gone?: boolean;
          };
          const read = () =>
            core.services.cardDrafts.read().find((one) => one.cardId === draftCardId);
          const holds = () => {
            const draft = read();
            if (want.gone) return !draft;
            if (!draft) return false;
            if (want.words !== undefined && draft.words !== want.words) return false;
            if (
              want.notes &&
              JSON.stringify(draft.notes.map((note) => note.comment)) !== JSON.stringify(want.notes)
            )
              return false;
            return Object.entries(want.answers ?? {}).every(([name, values]) => {
              const answer = draft.answers.find((one) => one.name === name);
              return JSON.stringify(answer?.values) === JSON.stringify(values);
            });
          };
          await until(holds);
          result = { draft: read() ?? null, changes: structuredClone(draftChanges) };
          break;
        }
        // Another screen changes the card's draft, as a window on a Mac would: the given answers, words and notes, at
        // the revision the computer keeps now.
        case "POST draft-elsewhere": {
          let body = "";
          for await (const chunk of request) body += chunk.toString();
          const { answers, words, notes } = JSON.parse(body) as {
            answers?: CardAnswer[];
            words?: string;
            notes?: CardNote[];
          };
          const card = core.services.supervisor.cards
            .snapshot()
            .find((one) => one.id === draftCardId)!;
          const now = core.services.cardDrafts.read().find((one) => one.cardId === card.id);
          result = await core.dispatch("inf:cards:draft", [
            card.id,
            {
              since: now?.revision ?? 0,
              ...(card.lifecycleId ? { lifecycle: card.lifecycleId } : {}),
              ...(answers ? { answers } : {}),
              ...(words !== undefined ? { words } : {}),
              ...(notes ? { notes } : {}),
            },
          ]);
          break;
        }
        // INF-3427: a decision whose text box sits at the end of a body longer than the room the keyboard leaves.
        case "POST field-card": {
          const title = "Pick the release window";
          const sections = [
            [
              "Tonight",
              "The checks on the newest version passed an hour ago. Shipping tonight puts the fix in front of people before the weekend. Nobody is watching the reports overnight, so a problem waits until morning.",
            ],
            [
              "Tomorrow morning",
              "The crew can watch the first hour of reports. Two other changes are waiting behind this one and would go out together. The release notes need one more picture.",
            ],
            [
              "After the weekend",
              "Every change waiting now goes out in one release. People keep the old behavior for three more days. The batch is larger, so a problem is harder to trace to one change.",
            ],
            [
              "What changed since yesterday",
              "The settings screen keeps its scroll place again. The message box no longer jumps when a photo is attached. The task list counts finished tasks the same way on every computer.",
            ],
          ];
          cardIDs.field = core.services.supervisor.addFirstmateCard({
            id: "phone-field-card",
            title,
            body: `<p>Choose when the next release goes out. Each window trades speed against how closely the crew can watch it.</p>
              ${sections.map(([head, text]) => `<h3>${head}</h3><p>${text}</p>`).join("\n")}
              <fieldset data-inf-options-only><legend>Which window?</legend>
              <label><input type="radio" name="window" required value="tonight"> Tonight</label>
              <label><input type="radio" name="window" required value="morning"> Tomorrow morning</label>
              <label><input type="radio" name="window" required value="weekend"> After the weekend</label></fieldset>
              <label for="crew-note">Anything the crew should know</label>
              <input id="crew-note" name="crew-note" style="display:block;width:100%;box-sizing:border-box">`,
            actions: [
              { id: "ship", label: "Use this window", default: true },
              { id: "wait", label: "Not now" },
            ],
          });
          result = { title };
          break;
        }
        // The captain passed on a person's report: a marked card arrived while they typed in a card's text box and
        // took the stage and the keyboard. The field card's thread gains a line in the same update, which the phone
        // shows on the field card's face only once it holds the stack with the marked card in it.
        case "POST marked-card": {
          const title = "The harbour master needs an answer";
          const line = "The harbour master asked about a berth too.";
          core.services.supervisor.addFirstmateCard({
            id: "phone-marked-card",
            title,
            holdsPlace: true,
            body: "<p>The harbour master asks which berth the crew wants.</p>",
            actions: [
              { id: "north", label: "North berth", default: true },
              { id: "south", label: "South berth" },
            ],
          });
          core.services.supervisor.cards.addMessage(cardIDs.field, "firstmate", line);
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          result = { title, line };
          break;
        }
        case "POST hero-card": {
          // INF-1892: the earlier choice now stays put aside. Give this separate
          // entrance choice its own title so Tasks restores the card it names.
          const title = "Choose the harbour entrance";
          heroId = core.services.supervisor.addFirstmateCard({
            id: "phone-hero",
            title,
            body: `<p>Choose which entrance to keep clear on the next chart.</p>
              <fieldset data-inf-options-only><legend>Which entrance should stay clear?</legend>
              <label><input type="radio" name="entrance" required value="north"> North Basin</label>
              <label><input type="radio" name="entrance" required value="south"> South Basin</label></fieldset>
              <p id="light"></p><script>
              const light = theme => document.getElementById("light").textContent = theme === "dark" ? "Chart for night sailing" : "Chart for daylight sailing";
              light(inf.theme); inf.onTheme(light);
              </script>`,
            actions: [
              { id: "keep", label: "Use this entrance", default: true },
              { id: "wait", label: "Not now" },
            ],
          });
          result = { title };
          break;
        }
        case "POST conversation-card":
        case "POST conversation-waiting":
        case "POST conversation-crew-card":
        case "POST conversation-mate-card":
          result = raiseConversationCard(core, command);
          break;
        // INF-3881: a card holding the Advanced architecture map part, filled with this project's own map files, with words
        // under it so the card is taller than the screen and a finger on the diagram has a card to scroll.
        case "POST map-card": {
          // The map card is the one card on the stage, so it is the one shown.
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const title = "How the project fits together";
          // Enough words that the card is taller than an iPad's screen too, so a drag can scroll it.
          const words = Array.from(
            { length: 24 },
            (_, line) =>
              `<p>Part ${line + 1} of the walk-through: each box is a part of the project, and each arrow says what one part uses another for.</p>`,
          ).join("");
          core.services.supervisor.addFirstmateCard({
            id: "phone-map",
            title,
            body: `<p>The map of the project, at its top.</p>${fillMapPart(
              MAP_PART,
              JSON.stringify({
                maps: MAP_DATA.maps,
                counts: MAP_DATA.counts,
                compare: MAP_DATA.compare,
              }),
            )}${words}`,
            actions: [{ id: "seen", label: "Got it", default: true }],
          });
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          core.services.supervisor.cards.flushBroadcast();
          // The box the journey chooses and goes into: the top shows its groups, so the first group's box.
          result = {
            title,
            top: MAP_DATA.maps[""].name,
            part: MAP_DATA.maps[""].groups[0]?.name ?? "",
          };
          break;
        }
        // INF-944 item 4: an Activity list longer than the screen, so scrolling it makes the tabs recede.
        case "POST long-activity": {
          for (let line = 1; line <= 30; line++)
            core.services.tasks.turns.recordReport(task.id, {
              text: `Checked the harbour chart (${line})`,
              summary: `Checked the harbour chart (${line})`,
            });
          result = { newest: "Checked the harbour chart (30)" };
          break;
        }
        // INF-944 item 3: minimize the hero card on the computer, as the captain would there.
        case "POST minimize-hero":
          await core.dispatch("inf:cards:minimize", [heroId, true]);
          result = { ok: true };
          break;
        case "GET hero-state":
          result = {
            card:
              (
                (await core.dispatch("inf:cards:list", [])) as { id: string; minimized?: boolean }[]
              ).find((card) => card.id === heroId) ?? null,
          };
          break;
        // INF-1059: a picture card waits in the stack while the phone is away, and its next board read is held.
        case "POST late-picture-card": {
          const directory = join(userData, "crewmates", task.id, "cards");
          mkdirSync(directory, { recursive: true });
          const name = `${task.id}-${"c".repeat(32)}.png`;
          writeFileSync(
            join(directory, name),
            encodePng(240, 120, (x, y) => (y < 60 ? [190, 150, 30] : [110, 70, 40 + x / 4])),
          );
          const title = "The late harbour survey";
          core.services.supervisor.addFirstmateCard({
            id: "phone-late-picture",
            title,
            body: `<p>The survey arrived while your phone was away.</p><img src="app-frame://images/${name}" alt="Late harbour survey">`,
            actions: [],
          });
          latePicture = { name, asked: cardBarrier() };
          releaseBoardHold();
          boardHold = { taken: false, entered: cardBarrier(), released: cardBarrier() };
          result = { title, words: "The survey arrived while your phone was away." };
          break;
        }
        // INF-3750: the phone's next board read is held, so its In reach is read while the board's answer is out.
        // The task board's pushes are held with it. This home's board is small, so each push goes whole and gives the
        // phone a board before its read answers: a change made just before, such as `link`'s, pushes once its short
        // timer ends, which can be after the phone's welcome. A large record's pushes go as differences, which a phone
        // with no board cannot apply, so there only the read brings the board.
        case "POST hold-board-read":
          releaseBoardHold();
          boardHold = {
            taken: false,
            entered: cardBarrier(),
            released: cardBarrier(),
            pushes: core.services.taskProtocol.holdPushes(),
          };
          result = { ok: true };
          break;
        case "POST board-read-held": {
          const held = boardHold;
          if (!held) throw new Error("No board read is held");
          await within(held.entered.promise, "The phone never read the board");
          result = { ok: true };
          break;
        }
        case "POST release-board-read":
          releaseBoardHold();
          result = { ok: true };
          break;
        case "POST late-picture-asked": {
          const late = latePicture;
          if (!late) throw new Error("No late picture card was posted");
          await within(late.asked.promise, "The phone never asked for the late card's picture");
          result = { ok: true };
          break;
        }
        // INF-499 #9: hold the real request before dispatch so a competing input has an observable window.
        // INF-2553: any change channel may be held (a card choice by default), so the phone's prediction shows
        // while its request is still out.
        case "POST hold-card-action": {
          const said = await controlBody(request);
          const { channel = "inf:cards:act" } = (said ? JSON.parse(said) : {}) as {
            channel?: string;
          };
          cardHold = { channel, entered: cardBarrier(), released: cardBarrier() };
          result = { ok: true };
          break;
        }
        case "POST refuse-next-change": {
          const asked = JSON.parse(await controlBody(request)) as {
            channel?: unknown;
            words?: unknown;
          };
          if (typeof asked.channel !== "string" || typeof asked.words !== "string")
            throw new Error("A refusal must name its channel and its words");
          refuseNext = { channel: asked.channel, words: asked.words };
          result = { ok: true };
          break;
        }
        case "POST card-action-held": {
          if (!cardHold) throw new Error("No card action is held");
          let timer: DeadlineTimer | undefined;
          const deadline = new Promise<never>((_, reject) => {
            timer = budgetTimer(() => reject(new Error("No card action arrived")), 10_000);
          });
          try {
            await Promise.race([cardHold.entered.promise, deadline]);
          } finally {
            timer?.cancel();
          }
          result = { calls: structuredClone(cardRequests) };
          break;
        }
        case "POST release-card-action":
          turnsBeforeRelease = firstmateTurnsEnded;
          cardHold?.released.resolve();
          cardHold = undefined;
          result = { ok: true };
          break;
        // Main's card identity witness and INF-1643's completed-turn ordering share one waiter.
        // The script choice has reached the model and its turn ended before the footer is read.
        case "POST card-choice-turn-ended":
        case "POST script-choice-heard": {
          await until(
            () =>
              !firstmateBusy &&
              firstmateTurnsEnded > turnsBeforeRelease &&
              provider
                .requestBodies()
                .some(
                  (body) =>
                    body.includes("a script chose") &&
                    body.includes(`(body) on card`) &&
                    body.includes(cardIDs.conversation),
                ),
          );
          result = { busy: firstmateBusy, turns: firstmateTurnsEnded - turnsBeforeRelease };
          observations.push({ check: "script-choice-heard", result });
          break;
        }
        // INF-499 #1/#6: exercise the published saved-sign-in choice and a failed body's last reading.
        // This disposable home has no saved website data; the test proves forwarding and the stored choice, not a sign-in.
        case "POST review-cards":
          cardIDs.saved = core.services.supervisor.addFirstmateCard({
            id: "phone-saved-sign-in",
            title: "Use the saved harbour sign-in",
            body: "<p>Let the computer use its saved sign-in without opening a page on this phone.</p>",
            actions: [
              {
                id: "saved",
                label: "Use my saved sign-in",
                default: true,
                effect: { kind: "open", target: "browser", savedSignIn: true },
              },
              { id: "leave", label: "Leave waiting" },
            ],
          });
          cardIDs.fallback = core.services.supervisor.addFirstmateCard({
            id: "phone-last-reading",
            title: "Keep the harbour note",
            body: `<label for="note">Harbour note</label><input id="note" name="note" value="Morning tide">
              <button id="change">Keep the evening tide</button><button id="stall">Stop the chart</button>
              <script>
                document.getElementById("change").onclick = () => {
                  const field = document.getElementById("note"); field.value = "Evening tide";
                  field.dispatchEvent(new Event("input", {bubbles:true}));
                  document.getElementById("change").textContent = "Evening tide saved";
                };
                document.getElementById("stall").onclick = () => { ${STALL_SCRIPT} };
              </script>`,
            actions: [
              { id: "keep", label: "Keep this note", default: true },
              { id: "leave", label: "Leave it" },
            ],
          });
          result = { saved: "Use the saved harbour sign-in", fallback: "Keep the harbour note" };
          break;
        case "POST show-saved-past":
          result = await core.dispatch("inf:cards:show-past", [cardIDs.saved]);
          break;
        case "POST show-fallback-past":
          result = await core.dispatch("inf:cards:show-past", [cardIDs.fallback]);
          break;
        case "POST capture-review-start":
          await controls?.start("review-recovery");
          result = { ok: true };
          break;
        // INF-2022: real owner, native sightings, exact same-offer answers and legacy fallback.
        case "POST shared-seen-fixture": {
          // A note leaves through its own Got it; the corner only puts a card aside (INF-2794).
          for (const card of core.services.supervisor.cards.snapshot())
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const cards = core.services.supervisor;
          cards.addFirstmateCard({
            id: "shared-leader",
            title: "Sampler result",
            body: "<p>The sampler has finished.</p>",
            actions: [],
          });
          cards.addFirstmateCard({
            id: "shared-target",
            title: "Latency findings",
            body: "<p>The latency findings remain available.</p>",
            actions: [],
          });
          result = { leader: "Sampler result", target: "Latency findings" };
          break;
        }
        case "POST pager-ring-fixture": {
          // INF-4541: three new cards, so "N new" shows each in turn and the chevrons go round past either end.
          // A later round names its cards anew: a closed note is never raised again under its own id.
          let body = "";
          for await (const chunk of request) body += chunk.toString();
          const { round = 1 } = (body ? JSON.parse(body) : {}) as { round?: number };
          for (const card of core.services.supervisor.cards.snapshot())
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const titles = ["Tide table for Friday", "Crane booking moved", "Harbour fees paid"];
          titles.forEach((title, index) => {
            core.services.supervisor.addFirstmateCard({
              id: round === 1 ? `ring-${index + 1}` : `ring-${round}-${index + 1}`,
              title,
              body: `<p>${title}.</p>`,
              actions: [],
            });
          });
          // The first mate's turn ends, as its own cards reach the stage.
          core.services.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
          result = { titles };
          break;
        }
        case "POST ended-card-fixture": {
          // INF-3071: the first mate ends its own card after the captain saw it, so it stays, ended.
          for (const card of core.services.supervisor.cards.snapshot())
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const supervisor = core.services.supervisor;
          const reason = "The crewmate on this task answered it under its own card.";
          const id = supervisor.addFirstmateCard({
            id: "meter-plan",
            title: "The meter reads kWh",
            body: "<p>The meter reads kilowatt-hours.</p>",
            actions: [
              { id: "build", label: "Approve and build", default: true },
              { id: "defer", label: "Save and defer" },
            ],
          });
          const shown = supervisor.cards.shown(id)!;
          supervisor.cards.seen(id, shown.offerId!);
          supervisor.closeCard(id, { kind: "firstmate" }, reason);
          result = {
            id,
            title: shown.title,
            chip: ENDED_CHIP_LABEL,
            close: ENDED_CLOSE_LABEL,
            line: endedLineWords("firstmate", reason),
          };
          break;
        }
        case "POST ended-card-state": {
          let body = "";
          for await (const chunk of request) body += chunk.toString();
          const { id } = JSON.parse(body) as { id: string };
          result = {
            ended: core.services.supervisor.cards.ended.has(id),
            open: core.services.supervisor.cards.has(id),
          };
          break;
        }
        case "POST shared-seen-mark": {
          const card = core.services.supervisor.cards
            .snapshot()
            .find((card) => card.title === "Latency findings")!;
          await core.dispatch("inf:cards:seen-update", [
            card.id,
            card.lifecycleId!,
            card.currentUpdateId!,
          ]);
          result = { ok: true };
          break;
        }
        case "POST shared-seen-answer": {
          const cards = core.services.supervisor.cards;
          const card = cards.snapshot().find((card) => card.title === "Latency findings")!;
          cards.addMessage(
            card.id,
            "firstmate",
            "The same findings also apply after reconnecting.",
          );
          cards.closeOut({ kind: "firstmate" }, "turn-end");
          result = { ok: true };
          break;
        }
        case "POST shared-seen-wait": {
          const read = () =>
            core.services.supervisor.cards
              .snapshot()
              .find((card) => card.title === "Latency findings");
          await until(() => read()?.currentUpdateSeen === true);
          result = { card: read(), calls: structuredClone(cardRequests) };
          break;
        }
        // INF-3155: four notes, every one read before one closes, so the card after it comes up.
        case "POST next-card-fixture": {
          for (const card of core.services.supervisor.cards.snapshot())
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          const titles = ["Morning tide", "Harbour pilot", "Evening tide", "Night watch"];
          for (const [index, title] of titles.entries())
            core.services.supervisor.addFirstmateCard({
              id: `next-card-${index}`,
              title,
              body: `<p>${title} notes for the harbour.</p>`,
              actions: [],
            });
          result = { titles };
          break;
        }
        // INF-3155: the card titled in the body leaves, as when it is answered on another device.
        case "POST close-titled": {
          let title = "";
          for await (const chunk of request) {
            title += chunk.toString();
            if (title.length > 1024) throw new Error("A card title is too long");
          }
          const card = core.services.supervisor.cards
            .snapshot()
            .find((card) => card.title === title);
          if (!card) throw new Error(`No card is titled ${title}`);
          await core.dispatch(
            card.noteDone && !card.noteDone.closesTask ? "inf:cards:note-done" : "inf:cards:close",
            [card.id],
          );
          result = { ok: true };
          break;
        }
        // INF-4241: the card titled in the body comes back on the stack through the Mac's own show-card move, as a click
        // on its row on the Mac does; a journey brings back a card it put aside this way where the phone's own row is
        // not what it checks.
        case "POST show-titled": {
          let title = "";
          for await (const chunk of request) {
            title += chunk.toString();
            if (title.length > 1024) throw new Error("A card title is too long");
          }
          const card = core.services.supervisor.cards
            .snapshot()
            .find((card) => card.title === title);
          if (!card) throw new Error(`No card is titled ${title}`);
          await core.dispatch("inf:cards:show", [card.id]);
          result = { ok: true };
          break;
        }
        // INF-2202 run 41590230179: the journey reads a card, then leaves; the home's own mark of that exact update,
        // not the title on screen, proves the phone read it, so every later fresh stack opens on its first card.
        case "POST seen-wait": {
          let title = "";
          for await (const chunk of request) {
            title += chunk.toString();
            if (title.length > 1024) throw new Error("A card title is too long");
          }
          const read = () =>
            core.services.supervisor.cards.snapshot().find((card) => card.title === title);
          if (!read()) throw new Error(`No card is titled ${title}`);
          await until(() => read()?.currentUpdateSeen === true);
          result = { ok: true };
          break;
        }
        case "GET card-state": {
          const conversation = core.services.supervisor.cards.past(cardIDs.conversation);
          result = {
            calls: structuredClone(cardRequests),
            leaks,
            cards: await core.dispatch("inf:cards:list", []),
            choice: core.services.supervisor.cards.past(cardIDs.choice) ?? null,
            conversation: conversation ?? null,
            conversationEnding: conversation
              ? pastEndingWords({ ...conversation.ending, by: "firstmate" })
              : null,
            saved: core.services.supervisor.cards.past(cardIDs.saved) ?? null,
            fallback: core.services.supervisor.cards.past(cardIDs.fallback) ?? null,
            note: core.services.supervisor.cards.past(cardIDs.note) ?? null,
            merge: core.services.supervisor.cards.past(cardIDs.merge) ?? null,
            mergeCard:
              (
                (await core.dispatch("inf:cards:list", [])) as { id: string; minimized?: boolean }[]
              ).find((card) => card.id === cardIDs.merge) ?? null,
            thread: core.services.supervisor.cards.thread(cardIDs.conversation),
          };
          observations.push({ check: "cards", result });
          break;
        }
        case "GET leaked":
        case "POST leaked":
          leaks += 1;
          result = { ok: true };
          break;
        case "POST thread-answer": {
          // The first mate's answer names the captain's reply; its closing
          // words before it left that reply open.
          const { cards } = core.services.supervisor;
          const harbourReply = cards
            .thread(cardIDs.conversation)
            .messages.findLast((line) => line.who === "captain")?.id;
          cards.addMessage(
            cardIDs.conversation,
            "firstmate",
            "I kept your harbour reply with this chart.",
            undefined,
            undefined,
            undefined,
            false,
            harbourReply !== undefined ? { answersMessage: harbourReply } : {},
          );
          cards.closeOut({ kind: "firstmate" }, "turn-end");
          result = { ok: true };
          break;
        }
        case "POST show-past":
          result = await core.dispatch("inf:cards:show-past", [cardIDs.choice]);
          break;
        case "POST show-body-past":
          result = await core.dispatch("inf:cards:show-past", [cardIDs.conversation]);
          break;
        // INF-209's real native appearance/reading-size checks, only on the launcher's owned simulator.
        case "POST display-light":
        case "POST display-dark":
        case "POST display-large":
          if (!controls?.display)
            throw new Error("Only the owned simulator can change its display");
          result = await controls.display(
            command === "display-dark" ? "dark" : "light",
            command === "display-large",
          );
          observations.push({ check: "display", result });
          break;
        case "GET hinge":
          result = controls?.hinge ? await controls.hinge() : { hinge: null };
          break;
        case "POST hinge-open":
        case "POST hinge-closed":
          if (!controls?.hinge) throw new Error("Only a simulated iPhone Duo has a hinge to move");
          result = await controls.hinge(command === "hinge-open" ? "open" : "closed");
          observations.push({ check: "hinge", result });
          break;
        case "POST turn-book":
        case "POST turn-side-left":
        case "POST turn-side-right":
          if (!controls?.turn)
            throw new Error("Only a simulated iPhone Duo turns through its test home");
          result = await controls.turn(
            command === "turn-book"
              ? "book"
              : command === "turn-side-left"
                ? "side-left"
                : "side-right",
          );
          observations.push({ check: "turn", result });
          break;
        case "POST key-tab":
        case "POST key-return":
        case "POST key-escape": {
          if (!controls?.key)
            throw new Error("Only a simulated iPhone Duo takes a key through its test home");
          const key =
            command === "key-tab" ? "tab" : command === "key-return" ? "return" : "escape";
          const correlation = request.headers["x-phone-keyboard-diagnostic-id"];
          const diagnostic = phoneKeyboardDiagnostic(
            `key-${key}`,
            typeof correlation === "string" ? correlation : undefined,
          );
          diagnostic("request-start");
          try {
            result = await controls.key(key, diagnostic.id);
            diagnostic("owner-completed");
          } catch (error) {
            diagnostic("owner-failed", { errors: phoneKeyboardError(error) });
            throw error;
          }
          observations.push({ check: "key", result });
          break;
        }
        case "POST appearance-dark":
        case "POST appearance-light":
          if (!controls?.appearance)
            throw new Error("Only the owned simulator can change its theme");
          result = await controls.appearance(command === "appearance-dark" ? "dark" : "light");
          observations.push({ check: "appearance", result });
          break;
        case "POST damage-record":
          if (!controls?.damageRecord)
            throw new Error("Only the owned simulator launcher can damage its saved record");
          await controls.damageRecord();
          result = { ok: true };
          observations.push({ check: "damaged-record", result });
          break;
        // INF-4794: the stand-in relay's asks and pushes, and whether this home keeps the phone's registration.
        case "GET push-state": {
          result = pushReading();
          break;
        }
        // Waits up to a minute for the phone to hand a registration with the grant the stand-in relay pushed it.
        case "POST push-registered": {
          const deadline = Date.now() + 60_000;
          while (core.services.devices.pushTargets().length === 0 && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 250));
          result = pushReading();
          break;
        }
        // INF-5275: waits up to half a minute for the phone's letter to this home to reach the stand-in relay.
        case "POST push-lettered": {
          const deadline = Date.now() + 30_000;
          while (!pushReading().lettered && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 250));
          result = pushReading();
          break;
        }
        // INF-5265: waits up to half a minute for this home to have sent its stand-in relay more sealed cards than
        // `after`, the count a part read before (none when it names none).
        case "POST push-sent": {
          const text = await controlBody(request);
          const after = text ? (JSON.parse(text) as { after: number }).after : 0;
          const deadline = Date.now() + 30_000;
          while (pushRelay.state().pushes <= after && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 250));
          result = pushReading();
          break;
        }
        // INF-5265: a new card on this home each time, which its phone sender seals for the phone's registration.
        case "POST homes-card": {
          homesCards += 1;
          const title = `A card from this computer, number ${homesCards}`;
          core.services.supervisor.addFirstmateCard({
            id: `phone-homes-${homesCards}`,
            title,
            body: "<p>This computer has a new card for the phone.</p>",
            actions: [{ id: "ok", label: "Got it", default: true }],
          });
          result = { title };
          break;
        }
        // INF-4794: the home lets go of the phone's registration, as it does when the phone hands null, so the
        // phone's next welcome must hand its held grant again for the home to keep one.
        case "POST push-cleared": {
          for (const target of core.services.devices.pushTargets())
            core.services.devices.setPush(target.deviceId, null);
          result = pushReading();
          break;
        }
        // INF-5265: the phone's own network goes or comes back while the app stays open (`{ "usable": boolean }`).
        case "POST phone-path": {
          if (!controls?.phonePath)
            throw new Error("Only the owned simulator launcher can change the phone's network");
          const { usable } = JSON.parse(await controlBody(request)) as { usable: boolean };
          await controls.phonePath(usable);
          result = { usable };
          break;
        }
        // INF-5265: a second computer beside this one, which the phone joins with a link of its own.
        case "POST second-home":
          result = await secondHome.start();
          break;
        // INF-5265: a card push as the phone's notification part leaves it once it opened the sealed card, naming the
        // card and the computer it came from; a simulated push runs no notification part, so this stands in for it.
        case "POST push-opened": {
          if (!controls?.push)
            throw new Error("Only the owned simulator launcher can push to the phone");
          const opened = JSON.parse(await controlBody(request)) as {
            cardId: string;
            computer: string;
            title: string;
            subtitle: string;
          };
          await controls.push({
            aps: {
              alert: {
                title: opened.title,
                subtitle: opened.subtitle,
                body: pushRelay.state().words,
              },
              sound: "default",
            },
            cardId: opened.cardId,
            computer: opened.computer,
          });
          result = { ok: true };
          break;
        }
        case "POST disconnected": {
          // Home's animation first makes the scene inactive. Wait for the real socket to go,
          // rather than removing a still-connected phone and accidentally testing close 4401.
          // INF-1528: the phone keeps its connection for its background time (iOS gives about
          // 30 seconds; the journey sets its own end, INFINITARY_TEST_BACKGROUND_TIME) and closes it then.
          const started = performance.now();
          if (views.size > 0)
            await new Promise<void>((resolve, reject) => {
              const off = connection.onViewDevice(() => {
                if (views.size === 0) {
                  timer?.cancel();
                  off();
                  resolve();
                }
              });
              const timer = budgetTimer(() => {
                off();
                reject(
                  new Error("The background phone kept its connection past its background time"),
                );
              }, 60_000);
            });
          result = { views: views.size, awayMs: Math.round(performance.now() - started) };
          observations.push({ check: "background-disconnected", result });
          break;
        }
        case "POST idle": {
          // INF-136 #2: expose the connection to both former URLSession deadlines, 10 s a request and 15 s a
          // resource (PinnedTransport's pairing session); INF-4326 (INF-4241's speed-ups): 17 s outlasts both,
          // where 22 s waited 5 s past them. This is an idle observation, not a latency assertion or a retry delay.
          const before = { ...readings };
          const started = performance.now();
          await new Promise((resolve) => setTimeout(resolve, 17_000));
          result = { before, after: { ...readings }, elapsedMs: performance.now() - started };
          observations.push({ check: "idle", result });
          break;
        }
        case "POST stream": {
          const before = { ...readings };
          // Real typed stream pushes, followed by a real stored card revision as an ordering witness.
          for (let i = 0; i < 100; i++) {
            core.events.emit("inf:event", {
              type: "assistant_delta",
              taskId: task.id,
              text: "Reading the Mac. ",
            });
            core.events.emit("inf:event", {
              type: "thinking_delta",
              taskId: task.id,
              text: "Checking its connection. ",
            });
          }
          showReadingNote("Streaming finished", "<p>The test stream ended.</p>");
          result = { before, title: "Streaming finished" };
          observations.push({ check: "stream-start", result });
          break;
        }
        case "POST board-task": {
          // INF-2764: a board update while the phone shows another tab; each call adds one queued task.
          boardTasks += 1;
          const added = seedTask(core.services.tasks, {
            id: `phone-board-${boardTasks}`,
            title: `Chart the harbour's ${boardTasks}th mooring`,
            status: "queued",
            startPolicy: "on-request",
          });
          result = { id: added.id };
          break;
        }
        case "POST catch-up-board":
          result = await openCatchUpBoard(core, catchUpBoard);
          break;
        case "POST away-traffic":
          result = await awayTraffic(core, { nextBoardTask: () => ++boardTasks, awayCards, until });
          break;
        case "POST heavy-away": {
          // INF-2669: what a phone misses while away from a long-running computer whose card list grows by about
          // 80 KB, four cards of about 20 KB each: four card lists, each pushed whole, and the task board pushed whole
          // with each. Each list waits for its own push, as `away-traffic`'s do, so none is coalesced; `away-cleanup`
          // closes the cards. Both grow with what the journeys sharing this home left. The home sends the lighter of
          // a replay, `replayBytes` (INF-3750's option C: only the newest list and board go whole), and the phone's
          // re-read, `reloadBytes`, whose board leaves out closed rows (INF-6832): a check sizes its link by the lighter.
          const cardsPushed = new Set<string>();
          const away: JournalEntry[] = [];
          const stopWatching = core.events.subscribe((channel, payload) => {
            const seq = away.length + 1;
            away.push({
              seq,
              channel,
              frame: JSON.stringify({ t: "push", seq, channel, payload }),
            });
            if (channel === "inf:cards")
              for (const card of payload as { id: string }[]) cardsPushed.add(card.id);
          });
          const line =
            "<p>The harbour log kept every tide, mooring and pilot boat of the season.</p>";
          const cards: string[] = [];
          try {
            for (const [n, title] of [
              "The season's harbour log",
              "The pilot boat came in",
              "The tide turned",
              "The lamps were lit",
            ].entries()) {
              const card = core.services.supervisor.addFirstmateCard({
                id: `phone-heavy-${n}`,
                title,
                body: `<p>${title}.</p>${line.repeat(Math.ceil(20_000 / line.length))}`,
                actions: [],
              });
              cards.push(card);
              awayCards.push(card);
              await until(() => cardsPushed.has(card));
            }
          } finally {
            stopWatching();
          }
          const reloadBytes = await reloadWeight([{ closed: false }]);
          result = { cards, replayBytes: replayBytes(replayOf(away)), reloadBytes };
          break;
        }
        case "POST heavy-card": {
          // INF-2832: one card of about 80 KB, so the card list a reload reads whole outlasts the phone's wait for one
          // message on a slow link; `away-cleanup` closes it. The list and the other first reads grow with what the
          // checks sharing this home left, so a check sizes its link from `listBytes`, the card list read now, and
          // `reloadBytes`, every first read a reload makes.
          const line =
            "<p>The harbour log kept every tide, mooring and pilot boat of the season.</p>";
          const card = core.services.supervisor.addFirstmateCard({
            id: "phone-heavy-card",
            title: "The whole season's harbour log",
            body: line.repeat(Math.ceil(80_000 / line.length)),
            actions: [],
          });
          awayCards.push(card);
          const listBytes = answerBytes(await core.dispatch("inf:cards:list", []));
          result = { card, listBytes, reloadBytes: await reloadWeight([]) };
          break;
        }
        case "POST emote":
          core.events.emit("inf:event", { type: "firstmate_emote", emote: "ponder" });
          result = { ok: true };
          break;
        case "POST away-cleanup":
          for (const card of awayCards.splice(0))
            core.services.supervisor.closeCard(card, { kind: "firstmate" }, "Catch-up test");
          closeCatchUpBoard(core, catchUpBoard);
          result = { ok: true };
          break;
        case "POST empty-cards":
          // A note leaves through its own Got it; the corner only puts a card aside (INF-2794).
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          result = { ok: true };
          break;
        case "POST stream-reset":
          observations.push({ check: "stream-end", readings: { ...readings } });
          showReadingNote(cardTitle, cardBody);
          result = { ok: true };
          break;
        case "POST change": {
          changed += 1;
          const title = `Your Mac kept working (${changed})`;
          core.services.supervisor.addFirstmateCard({
            id: `phone-change-${changed}`,
            title,
            body: "<p>A change made while the phone could not see it.</p>",
            actions: [],
          });
          core.services.tasks.turns.recordReport(task.id, { text: title, summary: title });
          result = { title };
          break;
        }
        case "POST capture-reply-start":
        case "POST capture-media-start":
        case "POST capture-picture-start":
        case "POST capture-page-start":
        case "POST capture-card-start":
        case "POST capture-conversation-start":
        case "POST capture-character-start":
          await controls?.start(CARD_RECORDINGS[command ?? ""]);
          result = { ok: true };
          break;
        // A future home whose major broke views: its floor is its own major, so the phone reads only.
        case "POST read-only": {
          const future = Number(PROTOCOL_VERSION.split(".")[0]) + 2;
          await connection.close();
          connection = connect(`${future}.0.0`, true, future);
          await connection.settled();
          result = { ok: true };
          break;
        }
        // INF-1649: a newer home whose major kept views, its floor at the phone's own major.
        case "POST within-floor":
          await connection.close();
          connection = connect(
            `${Number(PROTOCOL_VERSION.split(".")[0]) + 1}.0.0`,
            true,
            Number(PROTOCOL_VERSION.split(".")[0]),
          );
          await connection.settled();
          result = { ok: true };
          break;
        // INF-1649 review R8: an older home, which this phone's floor (its build's VIEW_FLOOR) does
        // not reach, so the line names the computer; and one at that floor, which it does.
        case "POST older-home":
        case "POST older-home-within": {
          const major = command === "older-home" ? VIEW_FLOOR - 1 : VIEW_FLOOR;
          await connection.close();
          connection = connect(`${major}.0.0`, true, major);
          await connection.settled();
          result = { ok: true };
          break;
        }
        case "POST home-update": {
          const said = await controlBody(request);
          homeUpdate = said ? homeUpdateSchema.parse(JSON.parse(said)) : null;
          homeUpdateAsks.length = 0;
          result = { ok: true };
          break;
        }
        case "GET home-update-state":
          result = { asks: homeUpdateAsks, update: homeUpdate };
          break;
        case "POST lose-reply": {
          const said = await controlBody(request);
          const { before = false } = (said ? JSON.parse(said) : {}) as { before?: boolean };
          loseNextReply = before ? "before" : "after";
          result = { ok: true };
          break;
        }
        case "POST character-fixture": {
          // INF-82: the actual first mate holds a turn; never emit a synthetic busy event.
          await until(() => !firstmateBusy);
          // The previous journey's crew note is obsolete for this fixture. Its author withdraws it:
          // reading this ordinary note would wake that crew and produce another Rivet count card.
          for (const card of await core.dispatch("inf:cards:list", [])) {
            if (card.author === "firstmate")
              core.services.supervisor.closeCard(
                card.id,
                { kind: "firstmate" },
                "Character fixture",
              );
            else if (card.author === "crewmate" && card.taskId)
              core.services.supervisor.closeCard(
                card.id,
                { kind: "crewmate", taskId: card.taskId },
                "Character fixture",
              );
          }
          const remaining = await core.dispatch("inf:cards:list", []);
          if (remaining.length) throw new Error("The character fixture did not empty the stage");
          result = { text: FM_SEAT_HOLD_MARKER, cards: remaining.length, busy: firstmateBusy };
          observations.push({ check: "character-fixture", result });
          break;
        }
        // INF-1066: an older home, on the last major before the scene reads came without a name,
        // advertises no named additions and refuses unsupported scene reads.
        case "POST scene-older-home":
        case "POST scene-current-home":
          await connection.close();
          sceneObservationReads = 0;
          connection =
            command === "scene-current-home"
              ? connect()
              : connect(`${Number(SCENE_OBSERVATIONS_SINCE.split(".")[0]) - 1}.0.0`, false);
          await connection.settled();
          result = { ok: true };
          break;
        case "POST scene-observations":
          result = { reads: sceneObservationReads, busy: firstmateBusy };
          break;
        case "POST character-finished": {
          if (!firstmateBusy || provider.heldFirstmate() !== 1)
            throw new Error("The character was not showing a real held conversational turn");
          await core.dispatch("inf:converse", [FM_SEAT_STEER_WORD]);
          provider.releaseHeldFirstmate();
          await until(() => !firstmateBusy);
          // A note leaves through its own Got it; the corner only puts a card aside (INF-2794).
          for (const card of await core.dispatch("inf:cards:list", []))
            await core.dispatch(
              card.noteDone && !card.noteDone.closesTask
                ? "inf:cards:note-done"
                : "inf:cards:close",
              [card.id],
            );
          result = { busy: firstmateBusy, held: provider.heldFirstmate() };
          observations.push({ check: "character-finished", result });
          break;
        }
        case "POST context-fixture":
          cardIDs.context = core.services.supervisor.addFirstmateCard({
            id: "phone-context",
            title: "The harbour reference",
            holdsPlace: true,
            body: "<p>Read this chart with the next message.</p>",
            actions: [],
          });
          result = {
            id: cardIDs.context,
            title: "The harbour reference",
            text: `Keep this reference and ${ANSWER_PROMPT_MARKER}`,
            noteWords: "Keep the chart for the morning tide",
          };
          break;
        // The captain's lines under the note once its Got it has read it.
        case "POST context-read": {
          const context = cardIDs.context;
          await until(() => core.services.supervisor.cards.get(context) === undefined);
          result = {
            captainLines: core.services.supervisor.cards
              .thread(context)
              .messages.filter((message) => message.who === "captain")
              .map((message) => message.text),
          };
          break;
        }
        case "POST show-context-past":
          result = await core.dispatch("inf:cards:show-past", [cardIDs.context]);
          break;
        case "POST context-sent":
          await until(() =>
            core.services.tasks.capture
              .listAsks()
              .some(
                (ask) => ask.text.startsWith("Keep this reference") && ask.turnState !== "open",
              ),
          );
          result = { writes: structuredClone(writes) };
          observations.push({ check: "past-card-message-context", result });
          break;
        case "POST scene-fixture":
          result = await scene.create();
          observations.push({ check: "native-scene-facts", result });
          break;
        case "POST scene-batch-waiting":
        case "POST scene-batch-in-batch":
        case "POST scene-batch-paused":
          result = await scene.create(
            command === "scene-batch-in-batch"
              ? "in-batch"
              : command === "scene-batch-paused"
                ? "paused"
                : "waiting",
          );
          break;
        case "POST scene-stage-finished":
          result = await scene.finishParts();
          break;
        case "POST scene-cleanup":
          scene.cleanup();
          result = { ok: true };
          break;
        case "POST capture-orbit-gap-start":
          await controls?.start("native-orbit-gap");
          result = { ok: true };
          break;
        case "POST capture-scene-start":
          await controls?.start("native-scene-pan");
          result = { ok: true };
          break;
        case "POST capture-scene-keyboard-start":
          await controls?.start("native-scene-keyboard");
          result = { ok: true };
          break;
        case "POST reply-reading-fixture":
          result = seedReplyReading(core.services.tasks);
          break;
        case "POST talk-fixture": {
          seedTalkWork(core.services.tasks);
          result = {
            text: `Read my harbour note and ${ANSWER_PROMPT_MARKER}`,
            // INF-1892: the hero's creator owns its identity, independent of its title.
            visibleCardId: heroId,
            steer: CLAUDE_STEER_MARKER,
            report: MOCK_CLAUDE_STEERED_REPORT,
          };
          break;
        }
        case "POST tags-fixture":
          result = seedTalkTags(core.services.tasks, "phone-work");
          break;
        case "POST row-moves-fixture":
          result = await seedRowMoves(core.services.tasks, "phone-work", () =>
            core.dispatch("inf:tasks:board", []),
          );
          break;
        case "POST row-moves-dropped":
          await until(() => core.services.tasks.get("row-moves")?.status === "dropped");
          result = { writes };
          break;
        case "GET talk-state":
          result = {
            writes,
            lastTurn: await core.dispatch("inf:conversation:last-turn", []),
            task: await core.dispatch("inf:tasks:detail", ["phone-work"]),
            asks: core.services.tasks.capture.listAsks(),
            held: provider.heldRequests(),
          };
          break;
        case "POST talk-sent":
          result = await talk.sent();
          break;
        case "POST talk-ask":
          result = await talk.ask(await controlBody(request));
          break;
        case "POST talk-started":
          await until(() =>
            core.services.supervisor.cards.snapshot().some((card) => card.taskId === "phone-work"),
          );
          result = await core.dispatch("inf:tasks:detail", ["phone-work"]);
          observations.push({ check: "phone-start-ran-on-mac", result });
          break;
        case "POST talk-interrupted":
          await until(
            () =>
              core.services.tasks.get("phone-work")?.activity === "idle" &&
              core.services.tasks
                .timeline("phone-work")
                .some((event) => event.kind === "interrupted" && event.actor === "captain"),
          );
          result = await core.dispatch("inf:tasks:detail", ["phone-work"]);
          observations.push({ check: "phone-interrupt", result });
          break;
        case "POST talk-resumable":
          // Continue belongs to a recovered Interrupted record, not a normal captain-interrupted turn.
          // Reuse this real task's workspace and session, in the persisted state recovery supplies.
          core.services.tasks.turns.setActivity("phone-work", "interrupted");
          result = { ok: true };
          break;
        case "POST talk-steered":
          await until(() =>
            core.services.tasks
              .timeline("phone-work")
              .some(
                (event) =>
                  event.kind === "steered" &&
                  event.actor === "captain" &&
                  event.text.includes(CLAUDE_STEER_MARKER),
              ),
          );
          provider.releaseHeldCrew();
          await until(
            () => core.services.tasks.get("phone-work")?.outcome === MOCK_CLAUDE_STEERED_REPORT,
          );
          result = { writes, task: await core.dispatch("inf:tasks:detail", ["phone-work"]) };
          observations.push({ check: "phone-continue-and-steer", result });
          break;
        case "POST capture-composer-start":
          await controls?.start("composer");
          result = { ok: true };
          break;
        case "POST capture-talk-start":
          await controls?.start("talk");
          result = { ok: true };
          break;
        case "POST capture-reopen-start":
          await controls?.start("reopen");
          result = { ok: true };
          break;
        case "POST capture-start":
          await controls?.start();
          result = { ok: true };
          break;
        case "POST capture-stop":
          await controls?.stop();
          result = { ok: true };
          break;
        case "POST offline":
          await connection.close();
          result = { ok: true };
          break;
        case "POST online":
          connection = connect();
          await connection.settled();
          result = { ok: true };
          break;
        case "POST remove":
          result = { ok: true, before: { ...readings } };
          await removeEveryDevice(core, await controlBody(request));
          break;
        default:
          result = await takeOver.command(`${request.method} ${command}`);
          if (result === undefined) {
            response.writeHead(404).end();
            return;
          }
      }
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ error: String(error) }));
    }
  });
  keepControlConnection(control);
  await new Promise<void>((resolve) => control.listen(0, "127.0.0.1", resolve));
  const controlPort = (control.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${controlPort}/${token}`,
    observations: () => [
      ...observations,
      {
        check: "final",
        readings: { ...readings },
        cardCalls: structuredClone(cardRequests),
        leaks,
      },
    ],
    // INF-3563: reads as a paired phone does, over the published contract, then forgets that phone.
    asPhone: async <Result>(
      work: (ask: Awaited<ReturnType<typeof startScriptedClient>>["ask"]) => Promise<Result>,
    ): Promise<Result> => {
      const invitation = await core.dispatch("inf:devices:invite", [{ kind: "mac" }]);
      await connection.settled();
      const grant = await claimLink(invitation.link, {
        kind: "mac",
        system: "ios",
        name: "Settings test phone",
      });
      const client = await startScriptedClient(grant);
      try {
        return await work(client.ask.bind(client));
      } finally {
        await client.close();
        core.services.devices.remove(grant.deviceId);
      }
    },
    checkPublishedClient: async () => {
      const invitation = await core.dispatch("inf:devices:invite", [{ kind: "mac" }]);
      await connection.settled();
      const grant = await claimLink(invitation.link, {
        kind: "mac",
        system: "ios",
        name: "Contract test phone",
      });
      const client = await startScriptedClient(grant);
      try {
        const answer = await client.ask("inf:cards:list", []);
        if (
          answer.ok !== true ||
          !Array.isArray(answer.value) ||
          !answer.value.some((card) => card.title === cardTitle)
        )
          throw new Error("The published-contract client did not read the test home's card");
        const conversation = await client.ask("inf:conversation:state", []);
        const computers = await client.ask("inf:computers:presence", []);
        if (conversation.ok !== true || computers.ok !== true)
          throw new Error("The published-contract phone could not read its scene observations");
        return {
          welcome: client.welcome,
          cards: answer,
          kind: grant.kind,
          conversation,
          computers,
        };
      } finally {
        await client.close();
        core.services.devices.remove(grant.deviceId);
      }
    },
    close: async () => {
      cardHold?.released.resolve();
      cardHold = undefined;
      releaseBoardHold();
      await new Promise<void>((resolve) => control.close(() => resolve()));
      try {
        await controls?.keyboardClosed?.();
      } finally {
        await ssh?.stop();
        await takeOver.stop();
        await secondHome.stop();
        unreach();
        await connection.close();
        unsubscribe("net.server.socket", countAttempt);
        for (const socket of stalledSockets) socket.destroy();
        await new Promise<void>((resolve) => stalledServer.close(() => resolve()));
        clearTimeout(relayStalled);
        for (const socket of relaySockets) socket.destroy();
        await new Promise<void>((resolve) => relayServer.close(() => resolve()));
        stopConversationReading();
        google.close();
        if (options.settings) delete process.env.INFINITARY_QUOTA_FIXTURE_DIR;
        await core.dispose();
        await provider.close();
        await googleStandIn.close();
        await pushRelay.close();
      }
    },
  };
}
