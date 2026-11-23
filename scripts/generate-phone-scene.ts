import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ForgeCheckState } from "../src/shared/checkSnapshot.ts";
import type { TaskFactsInput } from "../src/shared/taskFacts.ts";
import type { TaskPlanItem } from "../src/shared/taskPlan.ts";
import type { TaskDetail, TaskView } from "../src/shared/tasks.ts";
import { BATCH_GATE } from "../src/shared/batchGate.ts";
import { openModuleRunner, REPO_ROOT } from "./moduleRunner.ts";
import type { PanelTaskBoard, PanelTaskRow } from "../src/shared/personal/contracts.ts";
import { staleGeneratedFile } from "./github-errors.ts";

/** The parts of the Mac's Tasks panel (src/panels/now/rows.ts) this reads; that module builds with the renderer, not here. */
type NowBoard = PanelTaskBoard;
type NowRow = { task: PanelTaskRow; depth: number; home?: string | null };
type NowFilter = { query: string; projectId: string | null };
type NowRows = {
  NOW_GROUPS: readonly string[];
  OPEN_BY_DEFAULT: ReadonlySet<string>;
  rowsOf(board: NowBoard, filter: NowFilter): Map<string, NowRow[]>;
  earlierRowsOf(tasks: NowBoard["tasks"], groups: Map<string, NowRow[]>, filter: NowFilter): NowRow[];
  wordOf(task: PanelTaskRow): string;
  rowTrailing(task: PanelTaskRow): unknown;
  newFilingCount(rows: readonly NowRow[]): number;
  failedStartCount(tasks: readonly PanelTaskRow[]): number;
};
/** The parts of the Mac's task board (src/panels/now/boardMoves.ts and boardTiles.ts) this reads; they build with the renderer too. */
type BoardMoves = {
  moveContextOf(task: PanelTaskRow): unknown;
  boardMenuOf(task: PanelTaskRow, lane: string, context: unknown): unknown[];
  boardMoveOf(task: PanelTaskRow, from: string, target: string, context: unknown): unknown;
  dropAskOf(key: string, effects: unknown): unknown;
};
type BoardTiles = { boardLaneOf(task: PanelTaskRow): string | null };

/** INF-1066: native drawing shares desktop geometry and tuning, not a web runtime.
 * The comparison traces are readings of the desktop's executable choreography. */
const runner = await openModuleRunner();
try {
  const character = join(REPO_ROOT, "src/renderer/src/character");
  const { FM_STATES } = await runner.import<typeof import("../src/renderer/src/character/targets.ts")>(join(character, "targets.ts"));
  const { EMOTE_DURATION_MS, FIDGET_DURATION_MS } = await runner.import<typeof import("../src/renderer/src/character/machine.ts")>(join(character, "machine.ts"));
  const { CAPTAIN_LIGHT, GEM_WIRES, TIER_SOLIDS, WAIT_LIGHT } = await runner.import<typeof import("../src/renderer/src/character/crew/crewmate.ts")>(join(character, "crew/crewmate.ts"));
  const { CROWDED_PLANES, GROWING_RING, outerPlaneRadius, planeRadius } = await runner.import<typeof import("../src/renderer/src/character/crew/orbitalPlanes.ts")>(join(character, "crew/orbitalPlanes.ts"));
  const { CLUSTER_LAYOUT } = await runner.import<typeof import("../src/renderer/src/character/crew/computers.ts")>(join(character, "crew/computers.ts"));
  const { ORION, BIG_DIPPER } = await runner.import<typeof import("../src/renderer/src/character/constellations.ts")>(join(character, "constellations.ts"));
  const { SATURN } = await runner.import<typeof import("../src/renderer/src/character/saturn.ts")>(join(character, "saturn.ts"));
  const { GALAXY } = await runner.import<typeof import("../src/renderer/src/character/galaxy.ts")>(join(character, "galaxy.ts"));
  const { ALGOL } = await runner.import<typeof import("../src/renderer/src/character/algol.ts")>(join(character, "algol.ts"));
  const { TRAVEL_PER_SECOND, WARP, WARP_LEAD, WARP_SCHEDULE, WARP_STARS, WARP_TRAVEL } = await runner.import<typeof import("../src/renderer/src/character/warp.ts")>(join(character, "warp.ts"));
  const { WARP_RELEASE_MS } = await runner.import<typeof import("../src/renderer/src/character/crew/warp.ts")>(join(character, "crew/warp.ts"));
  const { CINCH, cinchFrame, cinchMotes } = await runner.import<typeof import("../src/renderer/src/character/cinch.ts")>(join(character, "cinch.ts"));
  const { FLICKER_TUNING } = await runner.import<typeof import("../src/renderer/src/character/flicker.ts")>(join(character, "flicker.ts"));
  const { REPLY_EMOTES, replyFrame } = await runner.import<typeof import("../src/renderer/src/character/replies.ts")>(join(character, "replies.ts"));
  const { CAPTAIN_BREATH_MS, CrewOrbit, DEFAULT_ORBIT, PLANES_GLYPH_PX, REMOTE_TRIP, WAIT_ARC_RATE } = await runner.import<typeof import("../src/renderer/src/character/crew/orbit.ts")>(join(character, "crew/orbit.ts"));
  const { CORNERS, FIXED_STARS, JITTER, NARROW_STEP_DEG, REACH_DEG, RHO, ROOM_PX, STEP_DEG, skyPlaces } = await runner.import<typeof import("../src/renderer/src/character/crew/fixedStars.ts")>(join(character, "crew/fixedStars.ts"));
  const { CONSTELLATION } = await runner.import<typeof import("../src/renderer/src/character/crew/constellation.ts")>(join(character, "crew/constellation.ts"));
  const { FIRSTMATE_SESSION_ID } = await runner.import<typeof import("../src/shared/observe.ts")>(join(REPO_ROOT, "src/shared/observe.ts"));
  const { DEPENDENCY_VISUAL } = await runner.import<typeof import("../src/shared/dependencyVisual.ts")>(join(REPO_ROOT, "src/shared/dependencyVisual.ts"));
  const { taskFactsOf } = await runner.import<typeof import("../src/shared/taskFacts.ts")>(join(REPO_ROOT, "src/shared/taskFacts.ts"));
  const { taskStatusLabel, taskStatusOf } = await runner.import<typeof import("../src/shared/taskPresentation.ts")>(join(REPO_ROOT, "src/shared/taskPresentation.ts"));
  const { checksFinishedAgo, checksSpanWords } = await runner.import<typeof import("../src/shared/checksSpan.ts")>(join(REPO_ROOT, "src/shared/checksSpan.ts"));
  const { reasoningWord } = await runner.import<typeof import("../src/shared/reasoning.ts")>(join(REPO_ROOT, "src/shared/reasoning.ts"));
  const { feedRelativeAge } = await runner.import<typeof import("../src/shared/relativeAge.ts")>(join(REPO_ROOT, "src/shared/relativeAge.ts"));
  const { clipPlanLine, foldPlan, planCounts } = await runner.import<typeof import("../src/shared/taskPlan.ts")>(join(REPO_ROOT, "src/shared/taskPlan.ts"));
  const { earlierRowsOf, failedStartCount, newFilingCount, NOW_GROUPS, OPEN_BY_DEFAULT, rowsOf, rowTrailing, wordOf } = await runner.import<NowRows>(join(REPO_ROOT, "src/panels/now/rows.ts"));
  const { failedCountWords, newCountWords } = await runner.import<typeof import("../src/panels/now/words.ts")>(join(REPO_ROOT, "src/panels/now/words.ts"));
  const { recordBarOf } = await runner.import<typeof import("../src/shared/recordBar.ts")>(join(REPO_ROOT, "src/shared/recordBar.ts"));
  const { recordAttentionOf, recordClosedLineOf } = await runner.import<typeof import("../src/shared/recordAttention.ts")>(join(REPO_ROOT, "src/shared/recordAttention.ts"));
  const { taskWaitStatus } = await runner.import<typeof import("../src/shared/taskWaits.ts")>(join(REPO_ROOT, "src/shared/taskWaits.ts"));
  const { boardMenuOf, boardMoveOf, dropAskOf, moveContextOf } = await runner.import<BoardMoves>(join(REPO_ROOT, "src/panels/now/boardMoves.ts"));
  const { boardLaneOf } = await runner.import<BoardTiles>(join(REPO_ROOT, "src/panels/now/boardTiles.ts"));
  const { taskMovesOf } = await runner.import<typeof import("../src/shared/taskMoves.ts")>(join(REPO_ROOT, "src/shared/taskMoves.ts"));
  const { rowControlsOf, rowStartOf } = await runner.import<{
    rowStartOf: (task: PanelTaskRow) => { label: string; reason: string | null } | null;
    rowControlsOf: (task: PanelTaskRow, group: string, home?: string | null) => unknown;
  }>(join(REPO_ROOT, "src/panels/now/rows.ts"));
  const { DROP_REVIEW_STALE, dropConfirmLead, dropPartsLine, dropUnderwayLine, dropWaitingLine } = await runner.import<typeof import("../src/shared/recordDrop.ts")>(join(REPO_ROOT, "src/shared/recordDrop.ts"));
  const { recordPillToneOf } = await runner.import<typeof import("../src/renderer/src/cards/recordFooter.ts")>(join(REPO_ROOT, "src/renderer/src/cards/recordFooter.ts"));
  // The record's tabs and head are renderer modules the scripts' project does not compile (a store behind the tabs,
  // JSX in the head), so these name only the shapes this reading takes from them.
  const { taskTabFactsOf, taskTabsOf } = await runner.import<{
    taskTabFactsOf: (task: TaskDetail) => unknown;
    taskTabsOf: (browser: null, facts: unknown) => Array<{ kind: string; label: string; count?: number }>;
  }>(join(REPO_ROOT, "src/renderer/src/cards/taskTabs.ts"));
  const { crewStateOf } = await runner.import<typeof import("../src/renderer/src/cards/crewmateState.ts")>(join(REPO_ROOT, "src/renderer/src/cards/crewmateState.ts"));
  const { recordAsksOf, recordWordsFoldName } = await runner.import<{
    recordAsksOf: (task: TaskDetail) => Array<{ id: string }>;
    recordWordsFoldName: (task: TaskDetail) => string | null;
  }>(join(REPO_ROOT, "src/renderer/src/cards/RecordHead.tsx"));
  // The stack is a renderer module the scripts' project does not compile, so this names only the shapes it reads.
  const { departureIndex, neighboursOf } = await runner.import<{
    departureIndex: (shown: Array<{ id: string }>, unread: readonly string[], action: "depart", neighbours: readonly string[]) => number;
    neighboursOf: (ids: readonly string[], left: string) => string[];
  }>(join(REPO_ROOT, "src/renderer/src/app/stack.ts"));
  const { satellitePhase } = await runner.import<typeof import("../src/renderer/src/character/crew/satellites.ts")>(join(character, "crew/satellites.ts"));
  const { arrangePanels, RAIL_SLOTS } = await runner.import<typeof import("../src/shared/panelArrangement.ts")>(join(REPO_ROOT, "src/shared/panelArrangement.ts"));
  const outputs = {
    "ios/Infinitary/InfinitaryApp/PhoneSceneData.generated.json": {
      orbit: DEFAULT_ORBIT, remoteTrip: REMOTE_TRIP, program: Object.fromEntries(Object.entries(CONSTELLATION).filter(([, value]) => typeof value === "number")),
      firstmateID: FIRSTMATE_SESSION_ID, dependency: { ...DEPENDENCY_VISUAL, phase: satellitePhase(0, 1, 0, true) },
      targets: FM_STATES, durations: EMOTE_DURATION_MS, fidgets: FIDGET_DURATION_MS,
      solids: TIER_SOLIDS, gemWires: GEM_WIRES, planes: CROWDED_PLANES,
      ring: { startRadiusPx: GROWING_RING.startRadiusPx, remoteShare: CLUSTER_LAYOUT.sizeShare, glyphPx: PLANES_GLYPH_PX,
        remoteGlyphPx: CLUSTER_LAYOUT.crewGlyphPx, crowdedGlyphPx: CLUSTER_LAYOUT.crowdedGlyphPx, crowdedCrew: CLUSTER_LAYOUT.crowdedCrew }, constellations: { orion: ORION, dipper: BIG_DIPPER },
      saturn: SATURN, galaxy: GALAXY, algol: ALGOL, flicker: FLICKER_TUNING, cinch: CINCH, warp: warpData(),
      captain: { ...CAPTAIN_LIGHT, breathMs: CAPTAIN_BREATH_MS },
      wait: { ...WAIT_LIGHT, arcRate: WAIT_ARC_RATE },
      batch: BATCH_GATE,
      fixedStars: { ...FIXED_STARS, corners: CORNERS, rho: RHO, jitter: JITTER, stepDeg: STEP_DEG, narrowStepDeg: NARROW_STEP_DEG, roomPx: ROOM_PX, reachDeg: REACH_DEG },
    },
    "ios/Infinitary/InfinitaryTests/PhoneSceneTraces.generated.json": REPLY_EMOTES.flatMap((emote) =>
      [0, 0.05, 0.15, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((progress) => ({ emote, progress, frame: replyFrame(emote, progress) }))),
    "ios/Infinitary/InfinitaryTests/PhoneCinchTraces.generated.json": cinchTraces(),
    "ios/Infinitary/InfinitaryTests/PhoneOrbitSeats.generated.json": orbitSeats(),
    "ios/Infinitary/InfinitaryTests/PhoneFixedStars.generated.json": fixedStarReadings(),
    "ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhoneTaskFacts.generated.json": taskFactReadings(),
    "ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhoneTaskList.generated.json": taskListReadings(),
    "ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhoneTaskRecord.generated.json": taskRecordReadings(),
    "ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhoneRowMoves.generated.json": taskMoveReadings(),
    "ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhoneCardDeparture.generated.json": departureReadings(),
    "ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhonePanelOrder.generated.json": panelOrderReadings(),
  };
  /** INF-3830 piece 2: the computer's rails read as one column, left top to right bottom, for the phone's panel order to replay. */
  function panelOrderReadings() {
    type Slot = { x: "left" | "right"; y: "top" | "bottom" };
    const at = (x: Slot["x"], y: Slot["y"]): Slot => ({ x, y });
    const panels = [
      { id: "open-prs", preferred: at("left", "top"), order: 100 },
      { id: "quota-glance", preferred: at("right", "top"), order: 20 },
      { id: "crew-reports", preferred: at("left", "top"), order: 100 },
      { id: "tokyo-clock", preferred: at("left", "bottom"), order: 5 },
      { id: "token-watch", preferred: at("right", "bottom"), order: 50 },
      { id: "token-watch-2", preferred: at("right", "bottom"), order: 50 },
      { id: "now-playing", preferred: at("left", "bottom"), order: 7 },
    ];
    const layouts: Array<[string, Record<string, unknown>]> = [
      ["no arrangement, each where it asks", {}],
      ["no arrangement, a saved placement moves one", { placements: { "open-prs": at("right", "bottom") } }],
      ["no arrangement, More picks rank top and bottom", { panelOrder: ["crew-reports", "now-playing", "tokyo-clock"] }],
      ["an arrangement lists them all", { arrangement: { left: { top: ["tokyo-clock", "open-prs"], bottom: ["crew-reports"] },
        right: { top: ["token-watch", "quota-glance"], bottom: ["now-playing", "token-watch-2"] } } }],
      ["an arrangement, new panels land at each slot's middle", { arrangement: { left: { top: ["tasks", "open-prs"], bottom: ["activity"] },
        right: { top: [], bottom: ["token-watch"] } } }],
      ["an arrangement lists one panel twice", { arrangement: { left: { top: ["open-prs", "quota-glance"], bottom: ["open-prs"] },
        right: { top: [], bottom: [] } } }],
    ];
    return layouts.map(([name, patch]) => {
      const layout = { collapsedPanels: {}, hiddenPanels: {}, placements: {}, ...patch } as Parameters<typeof arrangePanels>[0];
      const arranged = arrangePanels(layout, panels);
      const known = new Set(panels.map((panel) => panel.id));
      return { name, layout, panels, column: RAIL_SLOTS.flatMap((slot) => arranged[slot.x][slot.y]).filter((id) => known.has(id)) };
    });
  }
  /** INF-3155: the card the Mac's stack brings up when the shown card leaves, for the phone's to replay. */
  function departureReadings() {
    const stacks: Array<[string, string[], string, string[], string[]]> = [
      ["all read, a middle card closes", ["a", "b", "c", "d"], "b", ["a", "c", "d"], []],
      ["all read, the first card closes", ["a", "b", "c"], "a", ["b", "c"], []],
      ["all read, the last card closes", ["a", "b", "c"], "c", ["a", "b"], []],
      ["all read, the next card left too", ["a", "b", "c", "d"], "b", ["a", "d"], []],
      ["all read, the last two left together", ["a", "b", "c"], "c", ["a"], []],
      ["all read, the stack reordered as it closed", ["a", "b", "c"], "a", ["c", "b"], []],
      ["an unread card waits before it", ["a", "b", "c", "d"], "c", ["a", "b", "d"], ["a"]],
      ["an unread card arrived as it closed", ["a", "b"], "b", ["a", "c"], ["c"]],
      ["only new cards are left", ["a"], "a", ["x", "y"], []],
      ["the only card closes", ["a"], "a", [], []],
    ];
    return stacks.map(([name, previous, left, ids, unread]) => {
      const at = departureIndex(ids.map((id) => ({ id })), unread, "depart", neighboursOf(previous, left));
      return { name, previous, left, ids, unread, comesUp: ids[at] ?? null };
    });
  }
  /** INF-3011: the desktop cinch's frames and motes through a shortening that runs and one only heard ending, for the phone's to replay. */
  function cinchTraces() {
    const fixed = (n: number) => Math.round(n * 1e9) / 1e9;
    const spans: Array<number | null> = [null, 4300, 0];
    return spans.flatMap((endedAt) => [0, 120, 450, 899, 900, 1500, 2100, 3300, 4300, 4700, 5100, 5390, 1000, 1700].map((t) => {
      const frame = cinchFrame(t, endedAt);
      const flight = frame ? cinchMotes(frame) : null;
      return {
        endedAt, t,
        frame: frame && { phase: frame.phase, k: fixed(frame.k), vis: fixed(frame.vis), lift: fixed(frame.lift), holdS: fixed(frame.holdS), u: fixed(frame.u) },
        motes: flight?.motes.map((mote) => ({ slot: mote.slot, u: fixed(mote.u) })) ?? [], arrival: fixed(flight?.arrival ?? 0),
      };
    }));
  }
  /** INF-1755: the warps' settings, schedule, travel and the very stars the desktop draws, only the ones it reads. */
  function warpData() {
    const fixed = (n: number) => Math.round(n * 1e6) / 1e6;
    const stars = (list: Array<[number, number, number]>, count: number) => list.slice(0, count).map((s) => s.map(fixed));
    return { ...WARP, travelPerSecond: TRAVEL_PER_SECOND, releaseMs: WARP_RELEASE_MS, schedule: WARP_SCHEDULE, lead: WARP_LEAD,
      travel: Array.from(WARP_TRAVEL, fixed), head: stars(WARP_STARS.head, WARP.stars), side: stars(WARP_STARS.side, Math.ceil(WARP.stars * 0.6)),
      inner: stars(WARP_STARS.inner, WARP_STARS.inner.length) };
  }
  /** INF-1926: the desktop crew summary's own facts and words for rows in each state it reads, for the phone's sheet to replay. */
  function taskFactReadings() {
    const now = Date.UTC(2026, 9, 29, 17, 0);
    const min = 60_000;
    const modelNames: Record<string, string> = { "openai-codex/gpt-6.1-terra": "GPT-6.1 Terra", "anthropic/claude-opus-5-5": "Claude Opus 5.5" };
    const modelName = (model: string) => modelNames[model] ?? model.slice(model.indexOf("/") + 1);
    const base: TaskView = {
      id: "t-1887", key: "INF-1887", projectId: "p-inf", parentId: null, kind: "work", title: "Show the crewmate's checks on the phone",
      goal: "Show the crewmate's checks on the phone", priority: 0, status: "active", activity: "running",
      workPosture: { state: "active", reason: "turn" }, closedReason: null, startPolicy: "when-ready",
      flags: { blocked: false, held: false, needsYou: false, ready: false }, blockedBy: [], blocks: [], children: { total: 0, closed: 0 },
      assignee: "crewmate", model: "openai-codex/gpt-6.1-terra", tier: "high", repo: { name: "infinitary", branch: "fm/task-1887" },
      delivery: null, outcomeSummary: null, waitingCardId: null, createdAt: now - 90 * min, updatedAt: now - 2 * min,
      startedAt: now - 80 * min, closedAt: null,
    };
    const log: TaskDetail["activityLog"] = [
      { id: 1, at: now - 80 * min, kind: "dispatched", text: "The crewmate started on GPT-6.1 Terra." },
      { id: 2, at: now - 40 * min, kind: "progress", text: "Read the phone's task row and the desktop's summary." },
      { id: 3, at: now - 12 * min, kind: "pr_opened", text: "Opened pull request #612.", change: { url: "https://github.com/infinitary-labs/infinitary/pull/612", from: 7, to: 23 },
        actions: [{ at: now - 9 * min, text: "Running the phone's unit tests" }] },
      { id: 4, at: now - 3 * min, kind: "steered", text: "You asked it to keep the scene still." },
      { id: 5, at: now - 2 * min, kind: "progress", text: "Checked the waiting task's words.", from: { id: "t-1890", key: "INF-1890" } },
    ];
    const items = (labels: string[], current: number, skipped: number[] = []) => labels.map((label, i) => ({
      label, short: label.split(" ")[0] ?? label, since: now - (labels.length - i) * 5 * min,
      state: skipped.includes(i) ? ("skipped" as const) : i < current ? ("done" as const) : i === current ? ("current" as const) : ("next" as const),
    }));
    const plan = { items: items(["Brief the work", "Port the facts", "Draw the sheet", "Photograph it"], 2), at: now - 6 * min };
    const read: Partial<TaskDetail> = { activityLog: log, said: { at: now - 5 * min, text: "Drawing the sheet's fact strip." }, plan,
      reasoning: { level: "high", lower: "quick" } };
    const pr = { mode: "direct-pr" as const, prNumber: 612, prUrl: "https://github.com/infinitary-labs/infinitary/pull/612", headSha: "c0ffee1" };
    const checks = (states: ForgeCheckState[], extra: object = {}) => ({ headSha: "c0ffee1", items: states.map((state, i) => ({ name: `check-${i + 1}`, state })), absenceDeclared: false, ...extra });
    const cases: Array<[string, Partial<TaskView> & Partial<TaskDetail>]> = [
      ["working with its record, plan and checks", { ...read, delivery: { ...pr, ci: "pending", ciAt: now - min, ciStartedAt: now - 15 * min,
        checks: checks(["pending", "success", "pending"]) } }],
      ["working before its record answers", { delivery: { ...pr, ci: "pending" } }],
      ["waiting for your merge", { ...read, waitingCardId: "card-1", waitingCardMerges: true, workPosture: { state: "idle", reason: "captain" }, activity: "idle",
        delivery: { ...pr, ci: "green", ciAt: now - 4 * min, ciStartedAt: now - 30 * min, ciFinishedAt: now - 16 * min, checks: checks(["success", "success", "skipped"]) } }],
      ["a decision card is ready", { waitingCardId: "card-2", activity: "idle", workPosture: { state: "idle", reason: "captain" } }],
      ["waiting for prerequisites", { requiredAction: { cardId: "card-3", state: "blocked", result: "Waiting for INF-1880" } }],
      ["a required action is ready", { requiredAction: { cardId: "card-3", state: "ready", result: "Ready" } }],
      ["starting", { status: "open", activity: null, workPosture: undefined, startAttempt: { phase: "preparing", since: now - min } }],
      ["could not start", { status: "open", activity: null, workPosture: undefined, startPolicy: "on-request", startNotice: { reason: "No model" } }],
      ["queued behind other work", { status: "open", activity: null, workPosture: undefined, queueWait: { line: "Waiting for a crew place since 9:58 AM", since: now - 62 * min } }],
      ["backlog, blocked", { status: "open", activity: null, workPosture: undefined, startPolicy: "on-request", flags: { blocked: true, held: false, needsYou: false, ready: false } }],
      ["queued, held", { status: "open", activity: null, workPosture: undefined, flags: { blocked: false, held: true, needsYou: false, ready: false } }],
      ["a program waiting on its parts", { status: "open", activity: null, workPosture: undefined, program: true, children: { total: 3, closed: 1 } }],
      ["a program waiting on its one part", { status: "open", activity: null, workPosture: undefined, program: true, children: { total: 1, closed: 0 } }],
      ["backlog on a computer out of reach", { status: "open", activity: null, workPosture: undefined, startPolicy: "on-request",
        executionDeviceId: "dev-mini", place: { name: "Mac mini", where: "on Mac mini", reach: "out-of-reach" } }],
      ["backlog by itself", { status: "open", activity: null, workPosture: undefined, startPolicy: "on-request" }],
      ["waiting for a batch", { ...read, workPosture: { state: "active", reason: "checks", batch: "waiting" } }],
      ["running in a batch", { ...read, workPosture: { state: "active", reason: "checks", batch: "in-batch" } }],
      ["paused in a batch", { ...read, workPosture: { state: "active", reason: "checks", batch: "paused" } }],
      ["retrying at its provider", { ...read, workPosture: { state: "active", reason: "guidance", atProvider: "retrying" } }],
      ["stuck at its provider", { ...read, workPosture: { state: "idle", reason: "inactive", atProvider: "stuck" } }],
      ["waiting for its checks", { ...read, workPosture: { state: "active", reason: "checks" }, delivery: { ...pr, ci: "red", ciStartedAt: now - 50 * min, ciFinishedAt: now - 38 * min,
        checks: checks(["failure", "success", "success"]) } }],
      ["background work", { workPosture: { state: "active", reason: "job" } }],
      ["working on a computer connecting", { executionDeviceId: "dev-mini", place: { name: "Mac mini", where: "on Mac mini", reach: "connecting" } }],
      ["working on a computer out of reach", { executionDeviceId: "dev-mini", place: { name: "Mac mini", where: "on Mac mini", reach: "reconnecting" } }],
      // The captain's ask: a computer being updated reads updating, never out of reach, whatever its reach.
      ["working on a computer being updated", { executionDeviceId: "dev-mini", place: { name: "Mac mini", where: "on Mac mini", reach: "out-of-reach", updating: true } }],
      ["idle with an older computer being updated", { activity: "idle", workPosture: { state: "idle", reason: "inactive" }, executionDeviceId: "dev-mini",
        place: { name: "Mac mini", where: "on Mac mini", reach: "in-reach", noNewWork: true, updating: true } }],
      ["interrupted", { activity: "interrupted", workPosture: undefined }],
      ["idle on one task", { activity: "idle", workPosture: { state: "idle", reason: "dependency" }, blockedBy: ["INF-1880"], blockedSince: { "INF-1880": now - 25 * min } }],
      ["idle on two tasks", { activity: "idle", workPosture: { state: "idle", reason: "dependency" }, blockedBy: ["INF-1880", "INF-1881"] }],
      ["idle on a computer that takes no new work", { activity: "idle", workPosture: { state: "idle", reason: "inactive" }, executionDeviceId: "dev-mini",
        place: { name: "Mac mini", where: "on Mac mini", reach: "in-reach", noNewWork: true } }],
      ["idle with an older computer", { activity: "idle", workPosture: { state: "idle", reason: "inactive" }, executionDeviceId: "dev-mini",
        place: { name: "Mac mini", where: "on Mac mini", reach: "out-of-reach", noNewWork: true } }],
      ["idle with no continuing work", { activity: "idle", workPosture: { state: "idle", reason: "inactive" }, model: "anthropic/claude-opus-5-5", tier: "premium",
        ...read, reasoning: { level: "xhigh", lower: "capped" }, delivery: { ...pr, checks: checks([], { absenceDeclared: true }) } }],
      ["idle with no posture", { activity: "idle", workPosture: undefined, model: null, tier: null, ...read }],
      ["paused for access", { activity: "idle", workPosture: { state: "paused", reason: "access" }, delivery: { ...pr, ci: "pending", checks: checks(["success"], { problem: "the host refused the read" }) } }],
      ["done and answered", { status: "done", activity: null, workPosture: undefined, closedReason: "answered", ...read,
        delivery: { ...pr, ci: "merged", reviewVerdict: "pass", reviewRisk: "low" } }],
      ["done with its required action", { status: "done", activity: null, workPosture: undefined, closedReason: "merged", requiredAction: { cardId: "card-4", state: "checked", result: "Installed 1.4" } }],
      ["dropped after failing", { status: "dropped", activity: null, workPosture: undefined, closedReason: "failed", delivery: { ...pr, reviewVerdict: "findings", reviewRisk: "high" } }],
      ["a version its checks were not read for", { delivery: { ...pr, headSha: "d00d1e2", ci: "pending", checks: checks(["success"]) } }],
      ["a reading still incomplete", { delivery: { ...pr, ci: "pending", checks: checks(["success", "neutral"], { complete: false }) } }],
      // INF-4552: a finished neutral check holds nothing; a check a person must start holds.
      ["a neutral check", { delivery: { ...pr, ci: "green", checks: checks(["neutral", "success"]) } }],
      ["a check waiting to be started", { delivery: { ...pr, ci: "pending",
        checks: { ...checks(["success"]), items: [{ name: "check-1", state: "success" }, { name: "approve", state: "neutral", manual: true }] } } }],
      // INF-4557: a GitLab job that failed where its project allows it holds nothing and says so.
      ["a check allowed to fail", { delivery: { ...pr, ci: "green",
        checks: { ...checks(["success"]), items: [{ name: "check-1", state: "success" }, { name: "lint", state: "neutral", failureAllowed: true }] } } }],
      ["no checks reported yet", { delivery: { ...pr, ci: "pending", ciStartedAt: now - 2 * min, checks: checks([]) } }],
      // INF-3915: PR #1600's first reading, one skipped check before the checks that run registered.
      ["only a skipped check", { delivery: { ...pr, ci: "pending", ciStartedAt: now - 2 * min, checks: checks(["skipped"], { complete: true }) } }],
      ["only skipped checks, declared", { delivery: { ...pr, ci: "green", checks: checks(["skipped", "skipped"], { complete: true, absenceDeclared: true }) } }],
      ["a branch with no reading", { delivery: { mode: "local-only", changeLabel: "fm/task-1887", ci: "no-pr" } }],
      ["green with no reading", { delivery: { ...pr, ci: "green", ciStartedAt: now - 3 * 60 * min - 5 * min, ciFinishedAt: now - 30 * 1000 } }],
      ["a run started by hand", { delivery: { mode: "local-only", ci: "no-pr", runChecks: { runId: 7, name: "verify", state: "running", startedAt: now - 70 * min, at: now - min } } }],
      ["a run cancelled by hand", { delivery: { mode: "local-only", runChecks: { runId: 8, name: "verify", state: "cancelled", startedAt: now - 9 * min, finishedAt: now - 4 * min, at: now - 4 * min } } }],
      ["a review blocked", { delivery: { ...pr, ci: "green", reviewVerdict: "blocked" } }],
      ["only another task's rows", { ...read, activityLog: [{ id: 9, at: now - 7 * min, kind: "progress", text: "Its blocker merged.", from: { id: "t-1880", key: "INF-1880" } }], said: null, plan: null }],
      ["only the start line", { ...read, activityLog: [{ id: 1, at: now - 8 * min, kind: "dispatched", text: "The crewmate started." }, { id: 2, at: now - min, kind: "steered", text: "You wrote to it." }], said: null }],
      ["a long plan, clipped", { ...read, plan: { items: items(Array.from({ length: 18 }, (_, i) => `Item ${i + 1} of the long plan`), 2), at: now - 2 * min } }],
      ["a long plan, folded and clipped", { ...read, plan: { items: items(Array.from({ length: 24 }, (_, i) => `Item ${i + 1} of the longer plan`), 9, [3]), at: now - 2 * min } }],
      ["a plan folded", { ...read, plan: { items: items(Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`), 6), at: now - 61 * min } }],
      ["a plan all done", { ...read, plan: { items: items(["Brief", "Build"], 2), at: now - 26 * 60 * min } }],
      ["a plan between items", { ...read, plan: { items: items(["Brief", "Build", "Ship"], 1).map((item) => item.state === "current" ? { ...item, state: "next" as const } : item), at: now } }],
    ];
    /** The summary's line of dots as `PlanDots` builds it: the finished items folded, then the tail past the line's room. */
    function planDots(plan: TaskPlanItem[]) {
      type Dot = { label: string; short: string; state: TaskPlanItem["state"]; group?: number };
      const fold = foldPlan(plan);
      const unclipped: Dot[] = fold
        ? [{ state: "done", short: `${fold.folded.length} done`, label: fold.folded.map((item) => item.label).join(", "), group: fold.folded.length }, ...fold.rest]
        : plan;
      const clip = clipPlanLine(unclipped);
      const nodes: Dot[] = clip
        ? [...clip.shown, { state: clip.later.every((node) => node.state === "done") ? "done" : "next", short: `${clip.later.length} more`,
            label: clip.later.map((node) => node.label).join(", "), group: clip.later.length }]
        : unclipped;
      return nodes.map(({ label, short, state, group }) => ({ label, short, state, group }));
    }
    return { now, modelNames, cases: cases.map(([name, patch]) => {
      const row = { ...base, ...patch } as TaskFactsInput & TaskView;
      const facts = taskFactsOf(row, modelName);
      const shown = facts.plan ? facts.plan.items : [];
      const counts = planCounts(shown);
      const checks = facts.delivery?.checks;
      return { name, row, facts: { ...facts, why: undefined, label: taskStatusLabel(facts.status),
        reasoningWords: facts.reasoning ? reasoningWord(facts.reasoning) : undefined,
        nowAge: facts.now ? feedRelativeAge(facts.now.at, now) : undefined,
        planAge: facts.plan ? feedRelativeAge(facts.plan.at, now) : undefined,
        planWords: facts.plan ? { count: `${counts.done} of ${counts.total}`, skipped: counts.skipped,
          current: counts.current ? counts.current.label : counts.done === counts.total ? "All done" : "Between items" } : undefined,
        planDots: facts.plan ? planDots(shown) : undefined,
        checksWords: checks ? (checks.span ? checksSpanWords(checks.words, checks.span, now) : checks.words) : undefined,
        // INF-2528: the summary's footer says the checks as one state with its time.
        checksStateWords: checks ? (checks.span ? checksSpanWords(checks.state, checks.span, now) : checks.state) : undefined,
        checksAgo: checks?.span?.finishedAt != null ? checksFinishedAgo(checks.span.finishedAt, now) : undefined } };
    }) };
  }
  /**
   * INF-2928 piece 1: the desktop Tasks panel's own reading of one board - its Pinned section (INF-3127), its groups,
   * their order and depth, each row's word and trailing words, the wait line and the folding headers' counts - with and
   * without a search, for the phone's list to replay.
   */
  function taskListReadings() {
    const now = Date.UTC(2026, 10, 6, 17, 0);
    const min = 60_000;
    const project = (id: string, key: string, name: string, repo: string | null) => ({ id, key, name, archived: false,
      repo: repo ? { name: repo, delivery: "direct-pr" as const, autonomy: false } : null,
      counts: { needsYou: 0, waitingOnYou: 0, open: 0, active: 0, doneRecent: 0 } });
    const row = (n: number, title: string, patch: Record<string, unknown> = {}): TaskView => ({
      id: `t-${n}`, key: `INF-${n}`, projectId: "p-inf", parentId: null, kind: "work", title, goal: title, priority: 2,
      status: "open", activity: null, closedReason: null, startPolicy: "when-ready",
      flags: { blocked: false, held: false, needsYou: false, ready: false }, blockedBy: [], blocks: [], children: { total: 0, closed: 0 },
      assignee: null, model: null, tier: null, repo: null, delivery: null, outcomeSummary: null, waitingCardId: null,
      createdAt: now - (3000 - n) * min, updatedAt: now - min, startedAt: null, closedAt: null, ...patch }) as TaskView;
    const started = (minutes: number) => ({ status: "active", startedAt: now - minutes * min, assignee: "crewmate" });
    const idle = (reason: string) => ({ activity: "idle", workPosture: { state: "inactive", reason } });
    const running = { activity: "running", workPosture: { state: "active", reason: "turn" } };
    const flags = (blocked: boolean, held: boolean) => ({ flags: { blocked, held, needsYou: false, ready: false } });
    const done = (closed: number) => ({ status: "done", closedReason: "landed", startedAt: now - 2 * closed * min, closedAt: now - closed * min });
    const tasks: TaskView[] = [
      row(2901, "Answer the harbour master's question", { ...started(50), ...idle("captain"), priority: 1, waitingCardId: "card-2901" }),
      row(2902, "Move the phone's list to the desktop's order", { ...started(40), ...running,
        place: { where: "on Mac mini", name: "Mac mini", reach: "out-of-reach" } }),
      row(2930, "Publish the lighthouse map", { ...started(30), activity: "idle", projectId: "p-har", workPosture: { state: "active", reason: "checks", batch: "waiting" } }),
      row(2903, "Wait for the lighthouse checks", { ...started(30), activity: "idle", priority: 0, projectId: "p-har",
        workPosture: { state: "active", reason: "checks" } }),
      row(2904, "Port the row's word", { ...started(20), ...idle("dependency"), parentId: "t-2902", blockedBy: ["INF-2905"] }),
      row(2914, "Read the reach of each place", { ...started(10), ...running, parentId: "t-2904" }),
      row(2915, "Name the computer", { ...started(5), ...running, parentId: "t-2914" }),
      row(2916, "Spell the place", { ...started(4), ...running, parentId: "t-2915" }),
      row(2905, "Chart the harbour entrance", { priority: 1, pinnedAt: now - 12 * min,
        queueWait: { line: "Waiting for a free crewmate · since Nov 6, 8:40 AM", since: now - 20 * min } }),
      row(2906, "Count the buoys", { priority: 1, startAttempt: { phase: "preparing" } }),
      row(2917, "Relight the lamp", { priority: 3, projectId: "p-har", place: { where: "on Studio", name: "Studio", reach: "connecting" } }),
      row(2931, "Ring the harbour bell", { priority: 3, projectId: "p-har", place: { where: "on Studio", name: "Studio", reach: "in-reach", updating: true } }),
      row(2907, "Mend the harbour nets", { startPolicy: "on-request", foundOn: "INF-2901", filingNew: true }),
      row(2908, "Paint the jetty", { startPolicy: "on-request", startNotice: { reason: "No crewmate could start" } }),
      row(2909, "Clear the slipway", { startPolicy: "on-request", ...flags(false, true), pinnedAt: now - 40 * min }),
      row(2910, "Dredge the channel", { startPolicy: "on-request", priority: 0, ...flags(true, false) }),
      row(2918, "Repair the crane", { ...started(60), ...idle("inactive"), backlogSince: now - 15 * min, startPolicy: "on-request" }),
      row(2920, "Answer the pilot's note", { ...started(70), ...idle("inactive"), answerNoteId: "note-2920", answerSince: now - 95 * min }),
      row(2911, "Survey the harbour floor", { ...done(60), pinnedAt: now - 25 * min }),
      // INF-3127: work closed long ago that the captain pinned: the board lists it for its pin alone.
      row(2921, "Retire the old harbour light", { ...done(9000), pinnedAt: now - 5 * min }),
      // INF-3512: a pinned parent's parts list under it in Pinned, unpinned themselves: a working part with a part of
      // its own and one never started. One done this week lists in Done instead. A search for "harbour" finds only
      // the working part.
      row(2922, "Rebuild the north pier", { ...started(45), ...idle("inactive"), pinnedAt: now - 30 * min }),
      row(2923, "Sink the harbour piles", { ...started(25), ...running, parentId: "t-2922" }),
      row(2924, "Lay the deck", { ...started(15), ...running, parentId: "t-2923" }),
      row(2925, "Order the deck planks", { startPolicy: "on-request", parentId: "t-2922", priority: 1 }),
      row(2926, "Measure the old pier", { ...done(90), parentId: "t-2922" }),
      row(2912, "Log the tides", done(10)),
      row(2919, "Check the moorings", { ...done(30), parentId: "t-2912" }),
      row(2913, "Mark the old wreck", { status: "dropped", closedReason: "dropped", closedAt: now - 5 * min }),
    ];
    const earlier = [
      row(2801, "Paint the harbour wall", { ...done(8000), createdAt: now - 9000 * min }),
      row(2802, "Rope the harbour bell", { status: "dropped", closedReason: "dropped", createdAt: now - 9500 * min, closedAt: now - 7000 * min }),
      row(2911, "Survey the harbour floor", { ...done(60), pinnedAt: now - 25 * min }),
    ];
    const several = { tasks, projects: [project("p-inf", "INF", "Infinitary", "infinitary"), project("p-har", "HAR", "Harbour", "harbour")] };
    const single = { tasks, projects: [project("p-inf", "INF", "Infinitary", "infinitary"), project("p-har", "HAR", "Harbour", null)] };
    type Board = NowBoard;
    const read = (name: string, board: typeof several, query: string, found: TaskView[]) => {
      const panel = board as unknown as Board;
      const filter = { query, projectId: null };
      const groups = rowsOf(panel, filter);
      const older = earlierRowsOf(found as unknown as Board["tasks"], groups, filter);
      const sections = [["pinned" as const, groups.get("pinned") ?? []] as const,
        ...NOW_GROUPS.map((group) => [group, groups.get(group) ?? []] as const), ["earlier" as const, older] as const]
        .filter(([, rows]) => rows.length > 0)
        .map(([section, rows]) => {
          const fresh = section === "queued" || section === "backlog" ? newFilingCount(rows) : 0;
          const failed = failedStartCount(rows.map((r) => r.task));
          return { section, folds: !OPEN_BY_DEFAULT.has(section), count: rows.length,
            newWords: fresh > 0 ? newCountWords(fresh) : undefined,
            failedWords: section === "backlog" && failed > 0 ? failedCountWords(failed) : undefined,
            rows: rows.map(({ task, depth, home }) => ({ key: task.key, depth, word: wordOf(task), trailing: rowTrailing(task),
              // The row's mark and the summary's reason beside it, at this reading's time.
              mark: taskStatusOf(task, now).mark, reason: taskStatusOf(task, now).reason,
              // The group it lists under by its state, where a pinned row would list unpinned: its Start and wait line follow it.
              home: section === "pinned" ? (home ?? undefined) : section === "earlier" ? undefined : section,
              wait: (section === "queued" || home === "queued") && task.queueWait && task.status === "open" ? task.queueWait.line : undefined })) };
        });
      // The phone reads a board with its seq, which a panel reading has no use for.
      return { name, query, now, board: { seq: 1, ...board }, earlier: found, sections };
    };
    return { readings: [read("several projects", several, "", []), read("one project", single, "", []),
      read("a search", several, "HARBOUR", earlier)] };
  }
  /**
   * INF-2935 (INF-2928 piece 2): the desktop task record's own reading of one task in each state it draws - its bar, its
   * pill's tone and reason, its tabs, the attention sentence, the closed line, the fold under the goal, Drop task's
   * question and the Crewmate tab's state - for the phone's record to replay. A wait carries no time here: the clock's
   * words are each platform's own formatter.
   */
  function taskRecordReadings() {
    const now = Date.UTC(2026, 10, 6, 18, 0);
    const min = 60_000;
    const base = {
      id: "t-3001", key: "INF-3001", projectId: "p-har", parentId: null, kind: "work", title: "Chart the outer harbour",
      goal: "Chart the outer harbour before the storm.", priority: 2, status: "active", activity: "running",
      workPosture: { state: "active", reason: "turn" }, closedReason: null, startPolicy: "when-ready",
      flags: { blocked: false, held: false, needsYou: false, ready: false }, blockedBy: [], blocks: [], children: { total: 0, closed: 0 },
      assignee: "crewmate", model: null, tier: null, repo: { name: "harbour", branch: "fm/task-3001" }, delivery: null,
      outcomeSummary: null, waitingCardId: null, createdAt: now - 90 * min, updatedAt: now - min, startedAt: now - 80 * min, closedAt: null,
      intent: { goal: "Chart the outer harbour before the storm.", userWords: "chart the outer harbour before the storm" },
      rigor: "standard", deliverable: "change", basis: null, skippedPlanBecause: null, brief: "", outcome: null, modelLabel: null,
      cards: [], events: [], activityLog: [], plan: null, closing: null, problem: null, asks: [],
    };
    const unstarted = { status: "open", activity: null, workPosture: undefined, startedAt: null };
    const ask = (id: string, minutes: number, text: string) => ({ id, at: now - minutes * min, text, images: 0, attachedVia: null, turnState: "closed" });
    const wait = (id: string, kind: string, label: string) => ({ id, kind, label });
    const cards = [
      { id: "card-3001-b", kind: "decision", title: "Which channel first?", state: "open", at: now - 5 * min },
      { id: "card-3001-a", kind: "note", title: "The chart so far", state: "closed", ending: "You pressed Got it", at: now - 3 * 60 * min },
    ];
    const log = [{ id: 1, at: now - 80 * min, kind: "dispatched", text: "The crewmate started." }];
    const effects = (parts: { key: string; title: string; started: boolean }[], waiting: string[], underway: string[]) => ({ parts,
      waiting: waiting.map((key) => ({ key, title: `Wait for ${key}` })), underway: underway.map((key) => ({ key, title: `Work on ${key}` })) });
    const cases: Array<[string, Record<string, unknown>, { since: number } | null]> = [
      ["working with its cards and activity", { cards, activityLog: log }, null],
      ["working between turns, its live words still coming", { activity: "idle", workPosture: { state: "idle", reason: "inactive" } }, { since: now - 2 * min }],
      ["backlog, never started", { ...unstarted, startPolicy: "on-request", dropEffects: effects([], ["INF-3002"], ["INF-3003", "INF-3004"]) }, null],
      ["queued behind other work, held by a gate", { ...unstarted, queueWait: { line: "Waiting for a free crewmate · since 9:40 AM", since: now - 20 * min },
        hold: { title: "Held until the allowance resets", text: "It starts once your plan's allowance resets." } }, null],
      ["queued, waiting on two tasks", { ...unstarted, startPolicy: "on-request", blockedBy: ["INF-3010", "INF-3011"], flags: { blocked: true, held: false, needsYou: false, ready: false },
        dropEffects: effects([], ["INF-3002", "INF-3005"], ["INF-3003"]) }, null],
      ["starting", { ...unstarted, startAttempt: { phase: "preparing", since: now - 5_000 } }, null],
      ["still starting", { ...unstarted, startAttempt: { phase: "preparing", since: now - 20_000 } }, null],
      ["checking whether it started", { ...unstarted, startAttempt: { phase: "checking", since: now - 40_000 } }, null],
      ["could not start", { ...unstarted, startPolicy: "on-request", startNotice: { reason: "No crewmate could start." }, dropEffects: effects([], [], []) }, null],
      ["what it waited on was dropped", { ...unstarted, flags: { blocked: true, held: false, needsYou: false, ready: false } }, null],
      ["a parent whose part started", { ...unstarted, children: { total: 3, closed: 1 },
        dropEffects: effects([{ key: "INF-3012", title: "Sound the channel", started: true }, { key: "INF-3013", title: "Mark the reef", started: false }], [], []) }, null],
      ["a parent with two open parts", { ...unstarted, children: { total: 2, closed: 0 },
        dropEffects: effects([{ key: "INF-3012", title: "Sound the channel", started: false }, { key: "INF-3013", title: "Mark the reef", started: false }], [], []) }, null],
      ["interrupted", { activity: "interrupted", workPosture: undefined, problem: "The model stopped answering.", activityLog: log }, null],
      ["interrupted with no problem said", { activity: "interrupted", workPosture: undefined }, null],
      ["waiting on its decision", { activity: "idle", workPosture: { state: "idle", reason: "captain" }, waitingCardId: "card-3001-b", cards }, null],
      ["the first mate's question", { kind: "decision", startedAt: null, activity: null, workPosture: undefined, waitingCardId: "card-q" }, null],
      ["an answer ready for Done", { activity: "idle", workPosture: { state: "idle", reason: "inactive" }, answerNoteId: "note-3001", answerSince: now - 95 * min }, null],
      ["a required step ready", { ...unstarted, requiredAction: { cardId: "card-r", state: "ready" } }, null],
      ["paused by its report", { activity: "idle", workPosture: { state: "idle", reason: "captain" }, captainWait: true, outcomeSummary: "It needs the old harbour chart." }, null],
      ["paused with no report", { activity: "idle", workPosture: { state: "idle", reason: "captain" }, flags: { blocked: false, held: false, needsYou: true, ready: false } }, null],
      ["held by a gate after starting", { activity: "idle", workPosture: { state: "idle", reason: "inactive" }, hold: { title: "Held for the tide", text: "It goes on at high tide." } }, null],
      ["standing waits with no times", { activity: "idle", workPosture: { state: "idle", reason: "timed-wait" },
        waits: [wait("w-1", "job", "Sounding job"), wait("w-2", "start", "Start at the tide")] }, null],
      ["a lone job wait", { activity: "idle", workPosture: { state: "active", reason: "job" }, waits: [wait("w-3", "job", "Sounding job")] }, null],
      ["a decision wait beside its card", { activity: "idle", workPosture: { state: "idle", reason: "captain" }, waitingCardId: "card-3001-b",
        waits: [wait("w-4", "decision", "Your answer")] }, null],
      ["a checks wait", { activity: "idle", workPosture: { state: "active", reason: "checks" }, waits: [wait("w-5", "checks", "Checks on #812")] }, null],
      ["back in the backlog, waiting on a task", { activity: "idle", workPosture: { state: "idle", reason: "dependency" }, backlogSince: now - 15 * min,
        startPolicy: "on-request", blockedBy: ["INF-3010"] }, null],
      ["its browser in your hands", { activity: "idle", workPosture: { state: "idle", reason: "inactive" },
        browser: { state: "open", site: "localhost:5173", url: "http://localhost:5173/", title: "Chart", control: "captain" } }, null],
      ["merged as a pull request", { status: "done", activity: null, workPosture: undefined, closedReason: "landed", closedAt: now - 31 * min,
        closing: { at: now - 30 * min, note: null }, cards, activityLog: log,
        delivery: { mode: "direct-pr", prNumber: 812, prUrl: "https://github.com/harbour/harbour/pull/812", ci: "green" } }, null],
      ["merged as a branch", { status: "done", activity: null, workPosture: undefined, closedReason: "merged", closedAt: now - 3 * 60 * min,
        delivery: { mode: "local-only", changeLabel: "fm/task-3001", ci: "no-pr" } }, null],
      ["carried on by another task", { status: "done", activity: null, workPosture: undefined, closedReason: "superseded",
        closing: { at: now - 26 * 60 * min, note: "INF-3020 carries the rest" } }, null],
      ["dropped with a reason", { status: "dropped", activity: null, workPosture: undefined, closedReason: "cancelled",
        closing: { at: now - 2 * 60 * min, note: "No longer wanted" } }, null],
      ["dropped and replaced", { status: "dropped", activity: null, workPosture: undefined, closedReason: "cancelled", replacedBy: "INF-3030", closedAt: now - min }, null],
      ["failed", { status: "dropped", activity: null, workPosture: undefined, closedReason: "failed", problem: "The checks never passed.", closedAt: now - 5 * min }, null],
      ["done with no reason", { status: "done", activity: null, workPosture: undefined, closedAt: now - 10 * min }, null],
      ["a filing not yet started", { ...unstarted, startPolicy: "on-request", filing: { why: "The reef moved in the last storm.", originKey: "INF-2990", verdict: null },
        asks: [ask("a-1", 100, "chart the outer harbour before the storm"), ask("a-2", 30, "and the reef too")] }, null],
      ["a filing under way, built without a plan", { filing: { why: "", originKey: "INF-2990", verdict: "Worth doing now" },
        skippedPlanBecause: "A one-line fix.", intent: null, asks: [ask("a-3", 50, "go ahead")] }, null],
      ["a first mate's own operation", { kind: "operation", intent: null }, null],
    ];
    return { now, cases: cases.map(([name, patch, live]) => {
      const row = { ...base, ...patch } as unknown as TaskDetail;
      const read = taskWaitStatus(row, taskStatusOf(row, now), now);
      // The record's own reading of a start in flight and a failed start, as RecordCard's facts say it.
      const since = row.startAttempt?.since ?? (row.activity === "starting" ? row.startedAt : null);
      const reason = row.startAttempt?.phase === "checking" ? "Checking whether it started"
        : since != null && now - since >= 15_000 && (row.startAttempt?.phase === "preparing" || row.activity === "starting")
          ? "Still starting. You can keep working."
          : row.startNotice ? `Could not start. ${row.startNotice.reason}` : read.reason;
      const bar = recordBarOf(row);
      const closed = recordClosedLineOf(row);
      // Drop task's first press, as RecordPaneFooter's `beginDrop` and its confirm line read the record.
      const end = bar?.end === "drop-task" || bar?.end === "stop-task" ? bar.end : null;
      const effects = row.dropEffects ?? null;
      const refusal = end === "drop-task" ? (!effects ? DROP_REVIEW_STALE : null) : null;
      const question = end && !refusal ? [dropConfirmLead(row.key, end === "stop-task"), end === "drop-task" && effects ? dropPartsLine(effects.parts) : null,
        end === "drop-task" && effects ? dropWaitingLine(effects.waiting) : null,
        end === "drop-task" && effects ? dropUnderwayLine(effects.underway) : null].filter(Boolean).join(" ") : null;
      return { name, row, live: live ? { text: "", since: live.since } : null, bar, pillTone: recordPillToneOf(row),
        status: { mark: read.mark, word: read.word, reason },
        tabs: taskTabsOf(null, taskTabFactsOf(row)).map((tab) => ({ kind: tab.kind, label: tab.label, count: tab.count })),
        crew: crewStateOf(row, live ? { taskId: row.id, text: "", since: live.since } : null),
        attention: recordAttentionOf(row, now),
        closed: closed ? `${closed.lead}${closed.at !== null ? checksFinishedAgo(closed.at, now) : ""}${closed.change ? ` as ${closed.change.noun} ${closed.change.label}` : ""}${closed.tail}` : null,
        fold: recordWordsFoldName(row), asks: recordAsksOf(row).map((entry) => entry.id),
        drop: end ? { refusal, question } : null };
    }) };
  }
  /**
   * INF-2928 piece 3: the desktop's moves on one row in each state they read - the task board's menu with each entry's
   * reason, what moving the row to each lane or the Drop task tray does, a backlog row's Start, the controls the Tasks
   * panel's row shows on rest where it lists (`rowControlsOf`), and Drop task's question from the effects its record
   * lists - for the phone's long press and swipe to replay. Each row carries the moves its board row carries
   * (`taskMovesOf`). A pinned row lists in Pinned with its state's group as its home, a dropped one that is not pinned
   * only among a search's earlier matches.
   */
  function taskMoveReadings() {
    const now = Date.UTC(2026, 10, 7, 17, 0);
    const min = 60_000;
    const row = (n: number, title: string, patch: Record<string, unknown> = {}) => {
      const task = { id: `t-${n}`, key: `INF-${n}`, projectId: "p-har", parentId: null, kind: "work", title, goal: title, priority: 2,
        status: "open", activity: null, closedReason: null, startPolicy: "on-request",
        flags: { blocked: false, held: false, needsYou: false, ready: false }, blockedBy: [], blocks: [], children: { total: 0, closed: 0 },
        assignee: null, model: null, tier: null, repo: null, delivery: null, outcomeSummary: null, waitingCardId: null,
        createdAt: now - (4000 - n) * min, updatedAt: now - min, startedAt: null, closedAt: null, ...patch } as unknown as TaskView;
      return { ...task, moves: taskMovesOf(task) } as unknown as PanelTaskRow;
    };
    const started = (minutes: number) => ({ status: "active", startedAt: now - minutes * min, assignee: "crewmate" });
    const flags = (blocked: boolean, held: boolean) => ({ flags: { blocked, held, needsYou: false, ready: false } });
    const rows: Array<[string, PanelTaskRow, "earlier"?]> = [
      ["backlog, free to start", row(3101, "Chart the outer harbour")],
      ["backlog, waiting on one task", row(3102, "Sound the channel", { ...flags(true, false), blockedBy: ["INF-3101"] })],
      ["backlog, waiting on three tasks", row(3103, "Mark the reef", { ...flags(true, false), blockedBy: ["INF-3101", "INF-3102", "INF-3110"] })],
      ["backlog, held", row(3104, "Clear the slipway", flags(false, true))],
      ["backlog, a parent with open parts", row(3105, "Rebuild the pier", { children: { total: 2, closed: 1 } })],
      ["backlog, a parent whose parts closed", row(3106, "Paint the pier", { children: { total: 2, closed: 2 } })],
      ["backlog, could not start", row(3107, "Paint the jetty", { startNotice: { reason: "No crewmate could start." } })],
      ["backlog, started and put back", row(3108, "Repair the crane", { ...started(60), activity: "idle",
        workPosture: { state: "idle", reason: "inactive" }, backlogSince: now - 15 * min })],
      ["backlog, started and waiting on a task", row(3109, "Repair the winch", { ...started(50), activity: "idle",
        workPosture: { state: "idle", reason: "dependency" }, backlogSince: now - 15 * min, blockedBy: ["INF-3101"] })],
      ["queued", row(3110, "Count the buoys", { startPolicy: "when-ready" })],
      ["queued, waiting on a task", row(3111, "Light the buoys", { startPolicy: "when-ready", ...flags(true, false), blockedBy: ["INF-3110"] })],
      ["queued, starting", row(3112, "Ring the bell", { startPolicy: "when-ready", startAttempt: { phase: "preparing", since: now - 5_000 } })],
      ["working", row(3113, "Survey the floor", { ...started(30), activity: "running", workPosture: { state: "active", reason: "turn" } })],
      ["working, interrupted", row(3114, "Haul the nets", { ...started(40), activity: "interrupted", problem: "The model stopped answering." })],
      ["working, a part of a working parent", row(3115, "Mend the nets", { ...started(20), activity: "running",
        workPosture: { state: "active", reason: "turn" }, parentId: "t-3114" })],
      ["waiting on its decision", row(3116, "Pick the channel", { ...started(70), activity: "idle",
        workPosture: { state: "idle", reason: "captain" }, waitingCardId: "card-3116" })],
      ["waiting on its completion card", row(3117, "Merge the charts", { ...started(80), activity: "idle",
        workPosture: { state: "idle", reason: "captain" }, waitingCardId: "card-3117", waitingCardMerges: true })],
      ["waiting with its card put aside", row(3118, "Answer the pilot", { ...started(90), activity: "idle",
        workPosture: { state: "idle", reason: "captain" }, waitingCardId: "card-3118", minimizedCardId: "card-3118" })],
      ["an answer ready for Done", row(3119, "Read the tide table", { ...started(95), activity: "idle",
        workPosture: { state: "idle", reason: "inactive" }, answerNoteId: "note-3119", answerSince: now - 20 * min })],
      ["the first mate's question", row(3120, "Which harbour first?", { kind: "decision", waitingCardId: "card-3120" })],
      ["a required step ready", row(3121, "Sign the harbour permit", { requiredAction: { cardId: "card-3121", state: "ready" } })],
      ["done", row(3122, "Log the tides", { status: "done", closedReason: "landed", startedAt: now - 60 * min, closedAt: now - 10 * min })],
      ["dropped", row(3123, "Mark the old wreck", { status: "dropped", closedReason: "cancelled", closedAt: now - 5 * min })],
      ["an earlier search match", row(3124, "Paint the harbour wall", { status: "done", closedReason: "landed",
        startedAt: now - 9000 * min, closedAt: now - 8000 * min }), "earlier"],
      ["pinned, in the backlog", row(3125, "Chart the inner harbour", { pinnedAt: now - 3 * min })],
      ["pinned, done", row(3126, "Log the neap tides", { status: "done", closedReason: "landed", startedAt: now - 70 * min,
        closedAt: now - 20 * min, pinnedAt: now - 2 * min })],
      ["pinned, dropped", row(3127, "Mark the new wreck", { status: "dropped", closedReason: "cancelled", closedAt: now - 6 * min,
        pinnedAt: now - min })],
    ];
    const targets = ["waiting", "backlog", "queued", "working", "landed", "drop"] as const;
    const readings = rows.map(([name, task, earlier]) => {
      const lane = earlier ?? boardLaneOf(task);
      if (lane === null) throw new Error(`${name} has no lane`);
      const context = moveContextOf(task);
      const state = NOW_GROUPS.includes(lane) ? lane : null;
      const pinned = task.pinnedAt !== undefined;
      const group = earlier ?? (pinned ? "pinned" : (state ?? "earlier"));
      const home = group === "pinned" ? state : null;
      return { name, row: task, lane, menu: boardMenuOf(task, lane, context),
        moves: Object.fromEntries(targets.map((target) => [target, boardMoveOf(task, lane, target, context)])),
        rowStart: rowStartOf(task), group, home, controls: rowControlsOf(task, group, home) };
    });
    const part = (key: string, title: string, started: boolean) => ({ key, title, started });
    const named = (keys: string[]) => keys.map((key) => ({ key, title: `Work on ${key}` }));
    const effects: Array<[string, { parts: ReturnType<typeof part>[]; waiting: ReturnType<typeof named>; underway: ReturnType<typeof named> } | null]> = [
      ["no effects read", null],
      ["nothing else affected", { parts: [], waiting: [], underway: [] }],
      ["one task waiting, two working", { parts: [], waiting: named(["INF-3202"]), underway: named(["INF-3204", "INF-3203"]) }],
      ["two tasks waiting", { parts: [], waiting: named(["INF-3206", "INF-3205"]), underway: [] }],
      ["a part still open", { parts: [part("INF-3207", "Sound the channel", false)], waiting: [], underway: [] }],
      ["a part started", { parts: [part("INF-3207", "Sound the channel", false), part("INF-3208", "Mark the reef", true)], waiting: [], underway: [] }],
    ];
    const drops = effects.map(([name, read]) => ({ name, key: "INF-3201", effects: read, ask: dropAskOf("INF-3201", read) }));
    return { readings, drops };
  }
  /** INF-3634: the desktop's fixed stars - the constellation's places over the orbits a crew fills, and where a settled
   * stage hangs the pinned crew - for the phone to replay. */
  function fixedStarReadings() {
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    /** The occupied orbits for `n` crew, at the radius their idle crew sit at, as the orbit hands them to the stars. */
    const orbitsFor = (n: number) => {
      const counts = CROWDED_PLANES.map(() => 0);
      for (let i = 0; i < n; i++) {
        const open = counts.findIndex((c, plane) => c < (CROWDED_PLANES[plane]?.capacity ?? 0));
        const plane = open >= 0 ? open : counts.indexOf(Math.min(...counts));
        counts[plane] = (counts[plane] ?? 0) + 1;
      }
      return { counts, orbits: counts.flatMap((c, plane) => (c > 0 ? [{ plane, radius: planeRadius(plane, counts) * (1 + DEFAULT_ORBIT.idleOffset) }] : [])) };
    };
    const places = [1, 5, 8, 11, 24, 30, 48, 60].flatMap((crew) => [1, 2, 3, 7, 12, 24].map((count) => {
      const { orbits } = orbitsFor(crew);
      const sky = skyPlaces(count, orbits);
      return { crew, count, orbits: orbits.map((o) => ({ plane: o.plane, radius: round(o.radius) })),
        points: sky.points.map((p) => [round(p.x), round(p.y)]), joins: sky.joins };
    }));
    const stages = ([[6, ["crew-3", "crew-1"]], [8, ["crew-5"]], [12, ["crew-2", "crew-9", "crew-4", "crew-11"]], [30, ["crew-27", "crew-1", "crew-14"]]] as const).map(([crew, pinned]) => {
      const orbit = new CrewOrbit(0, { ...DEFAULT_ORBIT }, () => 0.5, "adaptive");
      for (let i = 1; i <= crew; i++) orbit.spawn(`crew-${i}`, "idle", 0, true);
      orbit.settleBootRoster(0);
      orbit.setPinned(pinned);
      const frame = orbit.update(16, true);
      const stars = Object.fromEntries(frame.crew.filter((c) => (c.star ?? 0) > 0).map((c) => [c.id, [round(c.x), round(c.y)]]));
      return { crew, pinned, stars, joins: (frame.starJoins ?? []).map((j) => [j.fromId, j.toId]) };
    });
    return { places, stages };
  }
  /** INF-1325: the desktop's own seat choices through arrivals and departures, for the phone to replay. */
  function orbitSeats() {
    type Step = { arrive?: string[]; leave?: string[]; program?: { id: string; parts: string[] }; read?: boolean };
    const range = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
    // Every step is replayed; these arrivals, and every other step, are read back.
    const read = new Set([1, 2, 3, 9, 23, 24, 25, 26, 47, 48, 49, 50, 59, 60]);
    const grow = range("crew-", 1, 60).map((id, i) => ({ arrive: [id], read: read.has(i + 1) }));
    const sequences: Record<string, Step[]> = {
      // Growth to two full orbits and past them, a first-orbit departure above its seats, refills
      // from the second orbit below them, the second orbit closing, and a new start from empty.
      ring: [...grow, { leave: ["crew-3"] }, ...range("crew-", 4, 12).map((id) => ({ leave: [id] })),
        { leave: range("crew-", 25, 50) }, { leave: ["crew-51"] }, { leave: ["crew-60"] },
        { leave: [...range("crew-", 1, 2), ...range("crew-", 13, 24), ...range("crew-", 52, 59)] },
        ...range("crew-", 61, 63).map((id) => ({ arrive: [id] }))],
      // A program's ring takes a seat on the first orbit among the crew, and each part keeps one.
      program: [...range("crew-", 1, 5).map((id) => ({ arrive: [id] })),
        { arrive: ["part-1"], program: { id: "program", parts: ["part-1"] } }, { arrive: ["crew-6"], program: { id: "program", parts: ["part-1"] } },
        { arrive: ["part-2"], program: { id: "program", parts: ["part-1", "part-2"] } }, { leave: ["crew-2"], program: { id: "program", parts: ["part-1", "part-2"] } },
        { leave: ["part-1", "part-2"] }],
    };
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    return Object.fromEntries(Object.entries(sequences).map(([name, steps]) => {
      const orbit = new CrewOrbit(0, undefined, () => 0.5, "adaptive");
      let now = 0, present = new Set<string>(), program: Step["program"];
      return [name, steps.map((step) => {
        now += 1000;
        for (const id of step.leave ?? []) { orbit.leave(id, "home", now); present.delete(id); }
        for (const id of step.arrive ?? []) { orbit.spawn(id, "working", now); present.add(id); }
        const parts = (step.program ?? program)?.parts ?? [];
        if (step.program || program) orbit.setPrograms([{ id: (step.program ?? program)!.id, state: step.program ? "live" : "done",
          parts: parts.map((id) => ({ id, parents: [], state: present.has(id) ? "live" : "done" as const })) }], now);
        program = step.program;
        const frame = orbit.update(now, true);
        const { read, ...change } = step;
        if (read === false) return change;
        const crew = Object.fromEntries(frame.crew.filter((c) => !parts.includes(c.id)).map((c) => [c.id, [c.plane, round(c.x), round(c.y)]]));
        const marks = Object.fromEntries(frame.programs.filter((p) => p.alpha > 0).map((p) => [p.id, [round(p.x), round(p.y)]]));
        return { ...change, crew, marks, outer: round(outerPlaneRadius(present.size)) };
      })];
    }));
  }
  for (const [file, data] of Object.entries(outputs)) {
    const path = join(REPO_ROOT, file);
    const text = `${JSON.stringify(data, null, 2)}\n`;
    if (process.argv.includes("--check")) {
      if (readFileSync(path, "utf8") !== text) throw staleGeneratedFile(file, "node scripts/generate-phone-scene.ts");
    } else writeFileSync(path, text);
  }
} finally { await runner.close(); }
