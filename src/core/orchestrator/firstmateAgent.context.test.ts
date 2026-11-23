import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { replyWithSettings } from "@shared/cardAnswerLines";
import { DECLINE_ACTION_ID, DECLINE_LABEL } from "@shared/cardLeave";
import type { ModelsCatalogView, Slot } from "@shared/quota";
import { describe, expect, it, vi } from "vitest";
import {
  crewCard,
  decodeContext,
  type FakeSession,
  fakeClockEachTest,
  setup,
  tick,
  toolsOf,
} from "../../../tests/helpers/firstmateHarness";
import { pngImage } from "../../../tests/helpers/images";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import {
  SEQUENCES_SEED,
  SEQUENCES_SKILL_RELATIVE_PATH,
  sequencesSha,
} from "../personal/sequencesSkill";
import type { TaskSeed } from "../tasks/seedTask";
import { DELIVERY_CHANGES, DELIVERY_COMPLETE } from "./contextDelivery";
import type { FirstmateAgent } from "./firstmateAgent";
import { FOLD_RECOVERY, OPEN_ASKS_LISTED } from "./firstmateContext";
import { IN_TURN } from "./openWork";

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

/** The first mate agent: the context block (tests/helpers/firstmateHarness.ts). */
fakeClockEachTest();

describe("the captain's sequences, served at each idle boundary (docs/sequences.md)", () => {
  it("serves the built-in text, then the captain's file, and says once when the file is unusable", async () => {
    const { agent, session, specs, events, personalWorkspaceDir } = setup();
    const path = join(personalWorkspaceDir, SEQUENCES_SKILL_RELATIVE_PATH);
    const notes = () =>
      events.filter(
        (event) => event.type === "firstmate_note" && event.text.includes("approach work"),
      );
    const turn = async (text: string) => {
      await agent.converse(text);
      session.emitTurnEnd("Noted.");
      session.resolveNextPrompt();
      await tick();
    };
    const seed = SEQUENCES_SEED.trim();

    // No file yet: the built-in text, at session create and on the prompt.
    await turn("first");
    expect(specs[0]?.instructions.served).toEqual({ text: seed, sha: sequencesSha(seed) });
    expect(session.served.at(-1)).toEqual({ text: seed, sha: sequencesSha(seed) });
    expect(notes()).toHaveLength(0);

    // An empty file: the built-in text again, and one line saying so.
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\nname: sequences\n---\n");
    await turn("second");
    expect(session.served.at(-1)?.text).toBe(seed);
    expect(notes().map((event) => (event as { text: string }).text)).toEqual([
      "Your instructions on how to approach work could not be used (the file is empty); following the built-in ones",
    ]);
    await turn("third");
    expect(notes()).toHaveLength(1);

    // The captain's own words: served as written, the sha moving with them.
    writeFileSync(path, "---\nname: sequences\n---\n# Sequences\n\nAlways plan first.\n");
    utimesSync(path, new Date(), new Date(Date.now() + 60_000));
    await turn("fourth");
    const mine = "# Sequences\n\nAlways plan first.";
    expect(session.served.at(-1)).toEqual({ text: mine, sha: sequencesSha(mine) });
    expect(notes()).toHaveLength(1);
  });
});

describe("the roster places started children under their parent", () => {
  it("names a running child's parent, counts the unstarted parent and child once each, and leaves closed work out", async () => {
    const seedTasks: TaskSeed[] = [
      { id: "parent", title: "Declutter the settings page", status: "queued" },
      { id: "plan", title: "Plan: ways to declutter", status: "running", parentId: "parent" },
      { id: "build", title: "Implement the direction", status: "queued", parentId: "parent" },
      { id: "shipped", title: "An earlier part", status: "queued", parentId: "parent" },
      { id: "sibling", title: "Fix the meter", status: "running" },
    ];
    const { agent, session, tasks } = setup({ seedTasks });
    tasks.close("shipped", { status: "done", reason: "merged", actor: "host" });
    await agent.converse("what is open?");
    const context = decodeContext(session.prompts[0] ?? "");
    const parentKey = tasks.get("parent")?.key;
    expect(context.crew.map((entry) => entry.task_id).sort()).toEqual(["plan", "sibling"]);
    expect(context.crew.find((entry) => entry.task_id === "plan")?.graph).toBe(
      `under ${parentKey}`,
    );
    expect(context.crew.find((entry) => entry.task_id === "sibling")?.graph).toBeUndefined();
    expect(context.backlog?.projects).toEqual([
      expect.objectContaining({ project: "SCR", unstarted: 2 }),
    ]);
    expect(JSON.stringify(context)).not.toContain("An earlier part");
    session.emitTurnEnd("Listed.");
    session.resolveNextPrompt();
    await tick();
  });
});

describe("an active task's crew row names the waits that hold its merge", () => {
  it("says it cannot merge until the work it waits on closes, and drops it once the captain's words pass the wait", async () => {
    // INF-3203: the row reads the wait the way the close gate does: every
    // live wait holds the merge until that task closes (INF-3167), and the
    // captain's recorded override passes it, as the board and Blocked by read.
    const fixture = setup({
      seedTasks: [
        { id: "feed", title: "Fix the pump feed", status: "queued" },
        { id: "pump", title: "Make the pump read on time", status: "running" },
      ],
    });
    const { agent, session, tasks } = fixture;
    tasks.graph.link("feed", "pump", "blocks", "firstmate");
    const turn = async (words: string) => {
      await agent.converse(words);
      const context = decodeContext(session.prompts.at(-1) as string);
      session.emitTurnEnd("Noted.");
      session.resolveNextPrompt();
      await tick();
      return context;
    };
    const first = await turn("what holds the pump?");
    expect(first.crew.find((row) => row.task_id === "pump")?.graph).toBe(
      `cannot merge until ${tasks.get("feed")?.key} closes`,
    );
    seedDelivery(tasks, "pump", {
      override: { words: "merge it, the feed can wait", holds: ["waits"], until: "task", at: 1 },
    });
    const second = (await turn("and now?")) as unknown as {
      crew: { changed: { task_id: string; graph?: string }[] };
    };
    const row = second.crew.changed.find((entry) => entry.task_id === "pump");
    expect(row).toBeDefined();
    expect(row?.graph).toBeUndefined();
  });
});

describe("INF-1117: scope snapshots follow changes and context lifetime", () => {
  it("serves scopes again after an app restart even when the saved project is unchanged", async () => {
    const before = setup();
    const { repo } = await before.repos.setup({ kind: "adopt", path: process.cwd() });
    before.repos.configure(repo.id, { scope: "Tools for our astronomy club." });
    await before.agent.converse("What belongs here?");
    before.session.resolveNextPrompt();
    await vi.waitFor(() => expect(before.agent.isBusy()).toBe(false));
    before.agent.dispose();
    const after = setup({ db: before.db });
    await after.agent.converse("And after restarting?");
    expect(decodeContext(after.session.prompts[0] as string).project_scopes).toMatchObject({
      projects: [{ repo_id: repo.id, scope: "Tools for our astronomy club." }],
    });
    after.session.resolveNextPrompt();
    await vi.waitFor(() => expect(after.agent.isBusy()).toBe(false));
  });

  it("serves all project scopes once, then after edits, clearing, membership changes, compaction and reattachment", async () => {
    const { agent, session, repos, events, tasks } = setup();
    const { repo } = await repos.setup({ kind: "adopt", path: process.cwd() });
    // The project each repository belongs to, by its key (INF-4220).
    const project = tasks.projects.forRepo(repo.id)?.key;
    const scope = "Tools and dashboards for our astronomy club.";
    repos.configure(repo.id, { scope });
    const next = async () => {
      await agent.converse("Where does this work belong?");
      const context = decodeContext(session.prompts.at(-1) as string);
      session.resolveNextPrompt();
      await vi.waitFor(() => expect(agent.isBusy()).toBe(false));
      return context;
    };
    const snapshot = (value: string) => ({
      note: expect.any(String),
      projects: [{ repo_id: repo.id, name: repo.name, project, scope: value }],
    });
    expect((await next()).project_scopes).toEqual(snapshot(scope));
    expect((await next()).project_scopes).toBeUndefined();
    repos.configure(repo.id, { scope: "Club observing tools, not our public website." });
    expect((await next()).project_scopes).toEqual(
      snapshot("Club observing tools, not our public website."),
    );
    repos.configure(repo.id, { scope: null });
    expect((await next()).project_scopes).toEqual(snapshot("not set"));
    expect((await next()).project_scopes).toBeUndefined();
    session.emit({ type: "context_compacted" });
    expect((await next()).project_scopes).toEqual(snapshot("not set"));
    expect(events.some((event) => (event as { type: string }).type === "context_compacted")).toBe(
      false,
    );
    expect((await next()).project_scopes).toBeUndefined();
    await agent.rebind("scope-test-account");
    expect((await next()).project_scopes).toEqual(snapshot("not set"));
    const other = await repos.setup({ kind: "init", name: "website" });
    expect((await next()).project_scopes).toMatchObject({
      projects: [
        { repo_id: repo.id, scope: "not set" },
        { repo_id: other.repo.id, scope: "not set" },
      ],
    });
    repos.unregister(other.repo.id);
    expect((await next()).project_scopes).toEqual(snapshot("not set"));
    const personalPath = scratchDir("infinitary-scope-personal-");
    repos.ensurePersonal(personalPath);
    expect((await next()).project_scopes).toBeUndefined();
    const repoRows = decodeContext(session.prompts.at(-1) as string).repos as unknown as {
      changed: Record<string, unknown>[];
    };
    expect(repoRows.changed.length).toBeGreaterThan(0);
    expect(repoRows.changed.every((row) => row.scope === undefined)).toBe(true);
  });
});

describe("models by intelligence bucket (only shown on change)", () => {
  const catalog: ModelsCatalogView = {
    generatedAt: "now",
    // Quota provider id ("codex"), which QUOTA_TO_PI_PROVIDER maps to the pi
    // provider id ("openai-codex") availableModels/slotsOf speak below.
    models: [
      { provider: "codex", id: "gpt-6-astra", label: "GPT 6 Astra" },
      { provider: "codex", id: "gpt-5.6-sol", label: "GPT 5.6 Sol" },
    ],
  };
  const available = () => [
    { provider: "openai-codex", id: "gpt-6-astra" },
    { provider: "openai-codex", id: "gpt-5.6-sol" },
  ];
  const slots: Record<string, Slot> = {
    "openai-codex/gpt-6-astra": "premium",
    "openai-codex/gpt-5.6-sol": "high",
  };
  const slotsOf = (ref: { provider: string; id: string }) => {
    const slot = slots[`${ref.provider}/${ref.id}`];
    return slot ? [slot] : [];
  };

  it("shows placed models grouped by bucket on the first turn, then stays quiet until it changes", async () => {
    const { agent, session } = setup({
      availableModels: available,
      quotaModels: () => catalog,
      slotsOf,
    });
    await agent.converse("what can you route to?");
    const first = decodeContext(session.prompts[0] as string);
    expect(first.models_by_intelligence_bucket).toContain(
      "premium (crew: never picked automatically):",
    );
    expect(first.models_by_intelligence_bucket).toContain(
      '  - openai-codex/gpt-6-astra "GPT 6 Astra" (Codex)',
    );
    expect(first.models_by_intelligence_bucket).toContain("high (Hard):");
    expect(first.models_by_intelligence_bucket).toContain(
      '  - openai-codex/gpt-5.6-sol "GPT 5.6 Sol" (Codex)',
    );
    session.emitTurnEnd("Noted.");
    session.resolveNextPrompt();
    await tick();

    // Nothing changed: the next turn omits the section entirely.
    await agent.converse("and now?");
    expect(decodeContext(session.prompts[1] as string)).not.toHaveProperty(
      "models_by_intelligence_bucket",
    );
    session.resolveNextPrompt();
    await tick();
  });

  it("shows the section again once a placement actually changes", async () => {
    let bucket: Slot = "high";
    const { agent, session } = setup({
      availableModels: available,
      quotaModels: () => catalog,
      slotsOf: (ref) =>
        ref.provider === "openai-codex" && ref.id === "gpt-5.6-sol" ? [bucket] : [],
    });
    await agent.converse("what can you route to?");
    expect(session.prompts[0]).toContain("high (Hard):");
    session.emitTurnEnd("Noted.");
    session.resolveNextPrompt();
    await tick();

    bucket = "medium";
    await agent.converse("and now?");
    expect(decodeContext(session.prompts[1] as string).models_by_intelligence_bucket).toContain(
      "medium (Normal):",
    );
    session.resolveNextPrompt();
    await tick();
  });

  it("omits an off (unassigned) model from every bucket", async () => {
    const { agent, session } = setup({
      availableModels: available,
      quotaModels: () => catalog,
      slotsOf: () => [],
    });
    await agent.converse("what can you route to?");
    expect(session.prompts[0]).toContain("none placed; settings > models assigns a bucket");
    session.resolveNextPrompt();
    await tick();
  });

  it("lists an offering under every bucket it is placed in", async () => {
    const { agent, session } = setup({
      availableModels: available,
      quotaModels: () => catalog,
      slotsOf: (ref) =>
        ref.provider === "openai-codex" && ref.id === "gpt-5.6-sol" ? ["high", "medium"] : [],
    });
    await agent.converse("what can you route to?");
    const first = session.prompts[0] as string;
    expect(first).toContain("high (Hard):");
    expect(first).toContain("medium (Normal):");
    expect(first.match(/openai-codex\/gpt-5\.6-sol/g)).toHaveLength(2);
    session.resolveNextPrompt();
    await tick();
  });
});

describe("the idle ladder's standing line in the context block", () => {
  it("every captain turn sees a stalled task's line, and a moving one carries none", () => {
    const { agent, tasks } = setup({
      seedTasks: [
        { id: "stuck", title: "Stuck one", status: "completed" },
        { id: "fine", title: "Fine one", status: "completed" },
      ],
    });
    const now = Date.now();
    // The ladder has acted on "stuck": idle 1 h 20 m, and two wakes went out.
    tasks.turns.recordRecovery("stuck", {
      rung: 2,
      count: 2,
      at: now - 30 * 60_000,
      idleSince: now - 80 * 60_000,
    });
    const crew = decodeContext(agent.buildContextBlock()).crew as Array<{
      task_id: string;
      stalled?: string;
    }>;
    // The time it began, which the next input does not resend (INF-1712).
    expect(crew.find((entry) => entry.task_id === "stuck")?.stalled).toBe(
      `idle since ${new Date(now - 80 * 60_000).toISOString()} · 2 wakes`,
    );
    expect(crew.find((entry) => entry.task_id === "fine")).not.toHaveProperty("stalled");
  });
});

// INF-5123 finding 3: a start on the model asked for wakes no one, so the
// crew list the first mate already receives names each task's model.
describe("the crew list names each started task's model", () => {
  it("carries the model a task runs on, and none for a task with no model recorded", () => {
    const { agent } = setup({
      seedTasks: [
        {
          id: "on-sol",
          title: "Repair the batch",
          status: "running",
          model: { provider: "openai-codex", id: "gpt-6.2-sol" },
        },
        { id: "unrecorded", title: "Read the logs", status: "running" },
      ],
    });
    const crew = decodeContext(agent.buildContextBlock()).crew as Array<{
      task_id: string;
      model?: string;
    }>;
    expect(crew.find((entry) => entry.task_id === "on-sol")?.model).toBe(
      "openai-codex/gpt-6.2-sol",
    );
    expect(crew.find((entry) => entry.task_id === "unrecorded")).not.toHaveProperty("model");
  });
});

/**
 * INF-1712 (the captain, on INF-1699's finding 1: "a wake carries only what
 * changed; the roster lists running and idle tasks with the backlog
 * reachable by lookup; directions and projects go once per conversation;
 * after a fold the first mate re-reads open asks and cards from the app").
 */
describe("INF-1712: a context carries what changed, and a fold reads open work back", () => {
  const SAVED = [
    "project_scopes",
    "repos",
    "crew",
    "backlog",
    "open_cards",
    "directions",
    "quota",
    "captain_time_zone",
    "self_source",
    "models_by_intelligence_bucket",
  ];
  const turn = async (
    { agent, session }: { agent: FirstmateAgent; session: FakeSession },
    words: string,
  ) => {
    await agent.converse(words);
    const context = decodeContext(session.prompts.at(-1) as string);
    session.emitTurnEnd("Noted.");
    session.resolveNextPrompt();
    await tick();
    return context;
  };

  it("serves the saved facts once, nothing saved on an unchanged wake, and one row per change", async () => {
    const fixture = setup({
      knowledge: true,
      seedTasks: [
        { id: "t1", title: "Steady the meter", status: "running" },
        { id: "t2", title: "Fix the gauge", status: "idle" },
        { id: "later", title: "Polish the dial", status: "queued" },
      ],
    });
    const { agent, repos, tasks, knowledge } = fixture;
    if (!knowledge) throw new Error("No knowledge.");
    await repos.setup({ kind: "adopt", path: process.cwd() });
    knowledge.directions.change({
      op: "add",
      id: "squash",
      text: "Always squash-merge.",
      reason: "the captain said so",
    });

    const first = await turn(fixture, "what is going on?");
    expect(first.delivery).toBe(DELIVERY_COMPLETE);
    for (const name of ["project_scopes", "repos", "crew", "backlog", "directions", "quota"]) {
      expect(first).toHaveProperty(name);
    }
    expect(first.crew.map((row) => row.task_id).sort()).toEqual(["t1", "t2"]);
    expect(String(first.directions)).toContain("Always squash-merge.");

    // An ordinary wake with nothing saved changed carries none of it.
    const second = await turn(fixture, "and now?");
    expect(second.delivery).toBe(DELIVERY_CHANGES);
    for (const name of SAVED) expect(second).not.toHaveProperty(name);

    // One task moved: one row. One closed: its id, removed.
    tasks.close("t2", { status: "done", reason: "merged", actor: "captain" });
    const third = await turn(fixture, "anything new?");
    expect(third.crew).toEqual({ removed: ["t2"] });
    expect(third).not.toHaveProperty("repos");

    // A direction revised or retired reaches the next input whole; the set
    // emptied clears it.
    knowledge.directions.change({
      op: "retire",
      id: "squash",
      reason: "the captain took it back",
    });
    const fourth = await turn(fixture, "still squash?");
    expect(fourth.directions === undefined && fourth.removed_sections === undefined).toBe(false);
    expect(JSON.stringify(fourth)).not.toContain("Always squash-merge.");
  });

  it("re-serves everything after a fold, with the recovery, until an input carrying it is read", async () => {
    const fixture = setup({
      seedTasks: [{ id: "t1", title: "Steady the meter", status: "running" }],
    });
    await fixture.repos.setup({ kind: "adopt", path: process.cwd() });
    await turn(fixture, "hello");
    expect(await turn(fixture, "again")).not.toHaveProperty("recovery");

    fixture.session.emit({ type: "context_compacted" });
    const folded = await turn(fixture, "after the fold");
    expect(folded.delivery).toBe(DELIVERY_COMPLETE);
    expect(folded.recovery).toBe(FOLD_RECOVERY);
    expect(folded.crew.map((row) => row.task_id)).toEqual(["t1"]);
    expect(folded).toHaveProperty("repos");

    const next = await turn(fixture, "and then?");
    expect(next).not.toHaveProperty("recovery");
    expect(next).not.toHaveProperty("repos");
  });

  it("steers the recovery into a turn a fold interrupts, and never redelivers it as the captain's words", async () => {
    const fixture = setup({
      seedTasks: [{ id: "t1", title: "Steady the meter", status: "running" }],
    });
    const { agent, session, db } = fixture;
    await agent.converse("keep going");
    // Pi's overflow recovery: the fold retries the turn's request.
    session.emit({ type: "context_compacted", turn: "goes-on" });
    await tick();
    expect(session.steers).toHaveLength(1);
    const steered = decodeContext(session.steers[0] as string);
    expect(steered.delivery).toBe(DELIVERY_COMPLETE);
    expect(steered.recovery).toBe(FOLD_RECOVERY);
    expect(steered.crew.map((row) => row.task_id)).toEqual(["t1"]);
    session.emitTurnEnd("Read it back.");
    session.resolveNextPrompt();
    await tick();
    // Read inside the turn: the next input is changes only.
    await agent.converse("next");
    expect(decodeContext(session.prompts.at(-1) as string).delivery).toBe(DELIVERY_CHANGES);
    session.emitTurnEnd("ok");
    session.resolveNextPrompt();
    await tick();

    // A recovery steer the run never read is the app's own: nothing is
    // parked as the captain's, and the next input carries it instead.
    session.holdSteers();
    await agent.converse("one more");
    session.emit({ type: "context_compacted", turn: "goes-on" });
    await tick();
    session.emitTurnEnd("ok");
    session.resolveNextPrompt();
    await tick();
    const parked = db
      .prepare("SELECT COUNT(*) AS n FROM inbox WHERE delivered_at IS NULL")
      .get() as { n: number };
    expect(parked.n).toBe(0);
    session.readSteers();
    await agent.converse("after");
    const after = decodeContext(session.prompts.at(-1) as string);
    expect(after.recovery).toBe(FOLD_RECOVERY);
    expect(after.delivery).toBe(DELIVERY_COMPLETE);
    session.emitTurnEnd("ok");
    session.resolveNextPrompt();
    await tick();
  });

  // INF-1746 R45: a captain steer queued before the fold is a change against
  // the old view; read after the recovery, it puts its stale facts back, so
  // the next wake must correct them.
  it("corrects what a captain steer queued before a fold puts back after the recovery", async () => {
    const fixture = setup({ knowledge: true });
    const { agent, session, knowledge } = fixture;
    if (!knowledge) throw new Error("No knowledge.");
    knowledge.directions.change({
      op: "add",
      id: "squash",
      text: "Always squash-merge.",
      reason: "the captain said so",
    });
    await turn(fixture, "hello");
    session.holdSteers();
    await agent.converse("keep going");
    knowledge.directions.change({
      op: "add",
      id: "rebase",
      text: "Rebase before review.",
      reason: "the captain said so",
    });
    await agent.converse("and one more thing");
    await tick();
    const captain = session.steers.at(-1) as string;
    expect(String(decodeContext(captain).directions)).toContain("Rebase before review.");
    knowledge.directions.change({ op: "retire", id: "rebase", reason: "the captain took it back" });
    session.emit({ type: "context_compacted", turn: "goes-on" });
    await tick();
    const recovery = session.steers.at(-1) as string;
    expect(decodeContext(recovery).recovery).toBe(FOLD_RECOVERY);
    expect(String(decodeContext(recovery).directions)).not.toContain("Rebase before review.");
    // The recovery is read first, then the captain's older steer.
    session.readSteers();
    session.emitTurnEnd("Read it back.");
    session.resolveNextPrompt();
    await tick();
    const next = await turn(fixture, "anything new?");
    expect(next.delivery).toBe(DELIVERY_CHANGES);
    expect(next).not.toHaveProperty("recovery");
    expect(String(next.directions)).toContain("Always squash-merge.");
    expect(String(next.directions)).not.toContain("Rebase before review.");
    // Once corrected, an unchanged wake carries nothing saved.
    expect(await turn(fixture, "and now?")).not.toHaveProperty("directions");
  });

  // A fold after the turn's last request, its input read, is the turn's
  // end: a steer then would start a model request of its own (the 48k
  // custom model journey), so the recovery waits for the next input.
  it("steers nothing into a turn whose fold follows its last request, and serves the recovery next", async () => {
    const fixture = setup({
      seedTasks: [{ id: "t1", title: "Steady the meter", status: "running" }],
    });
    const { agent, session } = fixture;
    await agent.converse("noted?");
    session.emit({ type: "context_compacted" });
    await tick();
    expect(session.steers).toHaveLength(0);
    session.emitTurnEnd("Noted.");
    session.resolveNextPrompt();
    await tick();
    const next = await turn(fixture, "and the rest?");
    expect(next.recovery).toBe(FOLD_RECOVERY);
    expect(next.delivery).toBe(DELIVERY_COMPLETE);
  });

  it("reads back every open message and card, past the context's limit and without a task", async () => {
    const { agent, specs, supervisor, tasks } = setup({
      seedTasks: [{ id: "t1", title: "Steady the meter", status: "running" }],
      seedCards: [
        {
          ...crewCard("card-t1-1", "t1", "Which retry?", "<p>Two ways to retry.</p>"),
          actions: [
            { id: "fast", label: "Retry fast", default: true },
            { id: "slow", label: "Retry slow" },
          ],
        },
      ],
    });
    const count = OPEN_ASKS_LISTED + 2;
    for (let index = 0; index < count; index += 1) {
      tasks.capture.openAsk({
        id: `ask-${index}`,
        text: `Message ${index}: ${"keep the meter steady ".repeat(40)}`,
      });
      tasks.capture.attachAsk(`ask-${index}`, "t1", "tool:steer_crewmate");
      tasks.capture.closeAsk(`ask-${index}`, "closed");
    }
    const loose = supervisor.addFirstmateCard({
      title: "A note of mine",
      body: "<p>The dial is fine.</p>",
      actions: [],
    });
    // The captain's reply sent its card's settings beside the words (INF-1746 R3).
    const settings = [{ name: "speed", values: ["slow"], changed: true }];
    supervisor.cardActions.replyToCard(
      "card-t1-1",
      "what about the slow one?",
      undefined,
      undefined,
      settings,
    );
    const replied = replyWithSettings("what about the slow one?", settings);
    await agent.converse({ text: "what is open?", images: [pngImage] });
    const read = toolsOf(specs).get("open_work");
    // Each answer opens with when it was read, then the record.
    const textOf = (result: Awaited<ReturnType<NonNullable<typeof read>["execute"]>> | undefined) =>
      (result?.content[0] as { text?: string } | undefined)?.text ?? "";
    const jsonOf = (text: string) => JSON.parse(text.slice(text.indexOf("\n") + 1));
    const overview = jsonOf(textOf(await read?.execute("o1", {})));
    // Every message is its own row, past the context's limit (INF-6115).
    // The message this turn is handling is listed too (INF-1746 R2), though
    // the answer check judges it only once its turn closes.
    expect(overview.asks).toHaveLength(count + 1);
    const current = overview.asks[count];
    expect(current).toMatchObject({ state: IN_TURN, words: "what is open?" });
    expect(
      (decodeContext(agent.buildContextBlock()).open_asks as { asks: unknown[] }).asks,
    ).toContainEqual(expect.objectContaining({ ask_id: current.ask_id, state: IN_TURN }));
    expect(overview.asks[0].ask_id).toBe("ask-0");
    expect(overview.asks[0].words).toMatch(/^Message 0: keep the meter steady/);
    expect(overview.asks[0].whole).toBe("ask ask-0");
    expect(overview.asks[0].work).toEqual([
      expect.objectContaining({ task_id: "t1", status: "active" }),
    ]);
    const cards = overview.cards as Array<Record<string, unknown>>;
    expect(cards.map((card) => card.card_id).sort()).toEqual(["card-t1-1", loose].sort());
    expect(cards.find((card) => card.card_id === "card-t1-1")).toMatchObject({
      task_id: "t1",
      actions: [
        { id: "fast", label: "Retry fast", default: true },
        { id: "slow", label: "Retry slow" },
        { id: DECLINE_ACTION_ID, label: DECLINE_LABEL },
      ],
      waits_on: "its author's answer",
      unanswered: replied,
    });

    const whole = jsonOf(textOf(await read?.execute("o2", { ask: "ask-3" })));
    expect(whole).toMatchObject({
      ask_id: "ask-3",
      words: `Message 3: ${"keep the meter steady ".repeat(40)}`,
    });
    const card = jsonOf(textOf(await read?.execute("o3", { card: "card-t1-1" })));
    expect(card).toMatchObject({ state: "open", body: "<p>Two ways to retry.</p>" });
    expect(card.messages).toEqual([expect.objectContaining({ who: "captain", text: replied })]);
    // INF-1879: put-away keeps the question open; an author withdrawal supplies closed history to this reader.
    supervisor.close("card-t1-1");
    expect(jsonOf(textOf(await read?.execute("aside", { card: "card-t1-1" })))).toMatchObject({
      state: "open",
    });
    supervisor.closeCard(
      "card-t1-1",
      { kind: "crewmate", taskId: "t1" },
      "This retry offer is withdrawn",
    );
    const closed = jsonOf(textOf(await read?.execute("o4", { card: "card-t1-1" })));
    expect(closed).toMatchObject({
      state: "closed",
      ending: { how: "author-withdrawal", by: "crewmate" },
    });
    expect(closed.messages).toEqual([expect.objectContaining({ who: "captain", text: replied })]);

    // INF-1746 R4: a message's picture comes back as the picture itself.
    const asked = await read?.execute("o5", { ask: current.ask_id });
    expect(jsonOf(textOf(asked)).pictures).toEqual([
      expect.objectContaining({ copy: "attached, picture 1" }),
    ]);
    expect(asked?.content[1]).toMatchObject({
      type: "image",
      mimeType: pngImage.mimeType,
      data: pngImage.data,
    });

    // INF-1746 R5: a read past one part comes in parts of one version, and
    // a part of a version that changed since is refused, never stitched.
    const words = "steady ".repeat(20_000);
    tasks.capture.openAsk({ id: "ask-long", text: words });
    const parts: string[] = [];
    let next: string | undefined;
    do {
      const text = textOf(await read?.execute("p", next ? { next } : { ask: "ask-long" }));
      next = text.match(/with next "([^"]+)"/)?.[1];
      parts.push(text.slice(text.indexOf("\n", text.indexOf("part ")) + 1));
    } while (next);
    expect(parts.length).toBeGreaterThan(1);
    expect(JSON.parse(parts.join("")).words).toBe(words);
    const first = textOf(await read?.execute("q", { ask: "ask-long" }));
    tasks.capture.attachAsk("ask-long", "t1", "tool:steer_crewmate");
    const stale = textOf(
      await read?.execute("r", { next: first.match(/with next "([^"]+)"/)?.[1] ?? "" }),
    );
    expect(stale).toContain("changed since the earlier part was read");
  });
});
