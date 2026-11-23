import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_VERSIONS,
  appliedVersions,
  columnNames,
  REVERSE_MIGRATION_66,
  REVERSE_MIGRATION_68,
  REVERSE_MIGRATION_102,
  tmpUserData,
} from "../../../tests/helpers/migrations";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { PluginRecords } from "../plugins/pluginRecords";
import { fetchPluginSource } from "../plugins/pluginSource";
import { PushedQuotaStore } from "../quota/pushedQuota";
import { TaskService } from "../tasks/taskService";
import type { AppDatabase } from "./db";
import { openDatabase, openInMemoryDatabase, PLUGIN_KIND_MIGRATION_VERSION } from "./db";
import { SettingsStore } from "./settingsStore";
import { UsageStore } from "./usageStore";
import { dropViews } from "./views";

// The settings and profile migrations: captain messages and their answers, schedules, model
// slots, quota readings, the usage ledger, the reply line, release tracking, the welcome and
// personal panels.

it("marks every captain message from before the answer-delivery check legacy, and opens new ones pending", () => {
  const dir = tmpUserData();
  const legacy = openDatabase(dir, 61);
  legacy
    .prepare(
      "INSERT INTO captain_asks (id, at, text, turn_state) VALUES ('old1', 1, 'before the check', 'closed')",
    )
    .run();
  legacy.close();
  const upgraded = openDatabase(dir);
  const tasks = new TaskService({ db: upgraded, strict: true });
  const old = tasks.capture.getAsk("old1");
  expect(old).toMatchObject({
    delivery: "legacy",
    deliveryFacts: { entries: [] },
    noticeCardId: null,
  });
  // A legacy message takes no fact and is never judged.
  tasks.capture.noteDelivery(["old1"], {
    outcome: "action",
    kind: "card",
    tool: "emit_card",
    at: 2,
  });
  expect(tasks.capture.getAsk("old1")?.deliveryFacts.entries).toEqual([]);
  const fresh = tasks.capture.openAsk({ id: "new1", text: "after the check" });
  expect(fresh.delivery).toBe("pending");
  expect(tasks.capture.getAsk("new1")?.delivery).toBe("pending");
  upgraded.close();
});

it("migrates legacy schedules without inventing captain authority", () => {
  const dir = tmpUserData();
  const legacy = openDatabase(dir, 59);
  legacy
    .prepare(
      "INSERT INTO schedules (id, spec_kind, interval_minutes, prompt, next_fire, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run("legacy", "every", 30, "turn notifications off", 30000, 1);
  legacy.close();
  const upgraded = openDatabase(dir);
  expect(
    upgraded.prepare("SELECT captain_requested FROM schedules WHERE id = ?").get("legacy"),
  ).toEqual({ captain_requested: 0 });
  upgraded.close();
});

describe("migration 21 (model-activation to model-slots)", () => {
  it("converts activated models into slots so an upgrade rearranges nothing", () => {
    const dir = tmpUserData();
    const atTwenty = openDatabase(dir, 20);
    expect(appliedVersions(atTwenty).at(-1)).toBe(20);
    atTwenty.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "model-activation",
      JSON.stringify({
        accounts: {
          "acct-copilot": {
            active: [
              "github-copilot/claude-opus-5",
              "github-copilot/claude-fable-5",
              "github-copilot/gpt-5.6-sol",
            ],
            known: [
              "github-copilot/claude-opus-5",
              "github-copilot/claude-fable-5",
              "github-copilot/gpt-5.6-sol",
              "github-copilot/gemini-3.6-flash",
            ],
          },
          "acct-codex": {
            active: ["openai-codex/gpt-5.6-terra"],
            known: ["openai-codex/gpt-5.6-terra", "openai-codex/gpt-5.5"],
          },
        },
      }),
    );
    atTwenty.close();

    const atTwentyOne = openDatabase(dir, 21);
    const converted = JSON.parse(
      (
        atTwentyOne.prepare("SELECT value FROM settings WHERE key = ?").get("model-slots") as {
          value: string;
        }
      ).value,
    ) as { assignments: Record<string, string> };
    expect(converted.assignments["github-copilot/gpt-5.6-sol"]).toBe("high");
    expect(converted.assignments["openai-codex/gpt-5.6-terra"]).toBe("medium");
    atTwentyOne.close();

    const upgraded = openDatabase(dir);
    expect(appliedVersions(upgraded)).toEqual(ALL_VERSIONS);
    const slotsRow = upgraded
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("model-slots") as { value: string };
    const slots = JSON.parse(slotsRow.value) as {
      version: number;
      assignments: Record<string, string | string[]>;
      seen: string[];
    };
    expect(slots.version).toBe(1);
    // Migration 21 kept every active offering. Migration 39 then moved the
    // GPT-5.6 picks onto GPT-6; the Claude rows stay where 21 put them.
    expect(slots.assignments["github-copilot/claude-opus-5"]).toBe("high");
    expect(slots.assignments["github-copilot/claude-fable-5"]).toBe("premium");
    expect(slots.assignments["github-copilot/gpt-5.6-sol"]).toBeUndefined();
    expect(slots.assignments["github-copilot/gpt-6-sol"]).toEqual(["high"]);
    expect(slots.assignments["openai-codex/gpt-5.6-terra"]).toBeUndefined();
    expect(slots.assignments["openai-codex/gpt-6-luna"]).toEqual(["medium"]);
    // Known-but-inactive stays seen and off.
    expect(slots.assignments["github-copilot/gemini-3.6-flash"]).toBeUndefined();
    expect(slots.assignments["openai-codex/gpt-5.5"]).toBeUndefined();
    expect(slots.seen.sort()).toEqual(
      [
        "github-copilot/claude-fable-5",
        "github-copilot/claude-opus-5",
        "github-copilot/gemini-3.6-flash",
        "github-copilot/gpt-5.6-sol",
        "github-copilot/gpt-6-sol",
        "openai-codex/gpt-5.5",
        "openai-codex/gpt-5.6-terra",
        "openai-codex/gpt-6-luna",
      ].sort(),
    );
    // The old row stays unread for one release.
    expect(
      upgraded.prepare("SELECT value FROM settings WHERE key = ?").get("model-activation"),
    ).toBeTruthy();
    upgraded.close();
  });

  it("does nothing on a fresh install that never had an activation record", () => {
    const db = openInMemoryDatabase();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("model-slots");
    expect(row).toBeUndefined();
    db.close();
  });
});

describe("migration 39 (saved GPT-5.6 picks follow GPT-6)", () => {
  function readSlots(db: AppDatabase) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("model-slots") as {
      value: string;
    };
    return JSON.parse(row.value) as {
      assignments: Record<string, string | string[]>;
      seen: string[];
    };
  }

  it("moves sol, terra, and luna, unions onto luna, and leaves astra and a custom slot", () => {
    const dir = tmpUserData();
    const at = openDatabase(dir, 38);
    at.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "model-slots",
      JSON.stringify({
        version: 1,
        assignments: {
          "openai-codex/gpt-5.6-sol": "high",
          "openai-codex/gpt-5.6-terra": ["medium"],
          "openai-codex/gpt-5.6-luna": "low",
          "openai-codex/gpt-6-astra": "premium",
          "xai/grok-4.6": "high",
        },
        seen: [
          "openai-codex/gpt-5.6-sol",
          "openai-codex/gpt-5.6-terra",
          "openai-codex/gpt-5.6-luna",
          "openai-codex/gpt-6-astra",
          "xai/grok-4.6",
        ],
      }),
    );
    at.close();

    const upgraded = openDatabase(dir);
    const slots = readSlots(upgraded);
    expect(slots.assignments["openai-codex/gpt-6-sol"]).toEqual(["high"]);
    expect(slots.assignments["openai-codex/gpt-6-luna"]).toEqual(["medium", "low"]);
    expect(slots.assignments["openai-codex/gpt-6-astra"]).toBe("premium");
    expect(slots.assignments["xai/grok-4.6"]).toBe("high");
    expect(slots.assignments["openai-codex/gpt-5.6-sol"]).toBeUndefined();
    expect(slots.assignments["openai-codex/gpt-5.6-terra"]).toBeUndefined();
    expect(slots.assignments["openai-codex/gpt-5.6-luna"]).toBeUndefined();
    expect(slots.seen).toEqual(
      expect.arrayContaining([
        "openai-codex/gpt-5.6-sol",
        "openai-codex/gpt-6-sol",
        "openai-codex/gpt-5.6-terra",
        "openai-codex/gpt-5.6-luna",
        "openai-codex/gpt-6-luna",
        "xai/grok-4.6",
      ]),
    );
    upgraded.close();
  });

  it("leaves a slot record that names none of those picks", () => {
    const dir = tmpUserData();
    const at = openDatabase(dir, 38);
    const stored = JSON.stringify({
      version: 1,
      assignments: { "xai/grok-4.6": "high" },
      seen: ["xai/grok-4.6"],
    });
    at.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("model-slots", stored);
    at.close();

    const upgraded = openDatabase(dir);
    const row = upgraded.prepare("SELECT value FROM settings WHERE key = ?").get("model-slots") as {
      value: string;
    };
    expect(row.value).toBe(stored);
    upgraded.close();
  });
});

describe("migration 51 (a pushed reading's status, W1 S3)", () => {
  it("adds the nullable status, keeps every earlier reading as unknown, records new ones, and reverses", () => {
    const dir = tmpUserData();
    const at50 = openDatabase(dir, 50);
    const columnsAt50 = columnNames(at50, "pushed_quota");
    expect(columnsAt50).not.toContain("status");
    at50
      .prepare(
        "INSERT INTO pushed_quota (account_id, window_id, utilization, resets_at, at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("acct_a", "five_hour", 0.4, 2_000, 1_000);
    at50.close();

    const upgraded = openDatabase(dir);
    expect(appliedVersions(upgraded)).toEqual(ALL_VERSIONS);
    const store = new PushedQuotaStore(upgraded);
    // A reading from before the column has no status: unknown, never `allowed`.
    expect(store.windowsFor("acct_a")).toEqual([
      { windowId: "five_hour", utilization: 0.4, resetsAt: 2_000, at: 1_000 },
    ]);
    store.record("acct_a", {
      windowId: "five_hour",
      status: "rejected",
      utilization: 1,
      resetsAt: 9_000,
      at: 3_000,
    });
    upgraded.close();

    // An app restart reads the status back from disk.
    const reopened = openDatabase(dir);
    expect(new PushedQuotaStore(reopened).windowsFor("acct_a")).toEqual([
      { windowId: "five_hour", status: "rejected", utilization: 1, resetsAt: 9_000, at: 3_000 },
    ]);

    // Reversible: dropping the column, and the extra-usage columns a later
    // migration adds, restores the v50 shape with every row.
    reopened.exec("ALTER TABLE pushed_quota DROP COLUMN status;");
    for (const column of PUSHED_OVERAGE_COLUMNS)
      reopened.exec(`ALTER TABLE pushed_quota DROP COLUMN ${column};`);
    expect(columnNames(reopened, "pushed_quota")).toEqual(columnsAt50);
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM pushed_quota").get()).toEqual({ n: 1 });
    reopened.close();
  });
});

const PUSHED_OVERAGE_COLUMNS = ["overage_status", "overage_reason", "using_overage"] as const;

describe("migration 136 (a pushed reading's extra usage, INF-4104 piece 1)", () => {
  it("adds the nullable columns, keeps every earlier reading silent on extra usage, records new ones, and reverses", () => {
    const dir = tmpUserData();
    const before = openDatabase(dir, 135);
    const columnsBefore = columnNames(before, "pushed_quota");
    before
      .prepare(
        "INSERT INTO pushed_quota (account_id, window_id, status, utilization, resets_at, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("acct_a", "five_hour", "allowed", 0.4, 2_000, 1_000);
    before.close();

    const upgraded = openDatabase(dir);
    expect(appliedVersions(upgraded)).toEqual(ALL_VERSIONS);
    const store = new PushedQuotaStore(upgraded);
    // An older reading said nothing about extra usage: no fields, so unknown, never off.
    expect(store.windowsFor("acct_a")).toEqual([
      { windowId: "five_hour", status: "allowed", utilization: 0.4, resetsAt: 2_000, at: 1_000 },
    ]);
    store.record("acct_a", {
      windowId: "five_hour",
      status: "rejected",
      utilization: 1,
      resetsAt: 9_000,
      overageStatus: "allowed",
      usingOverage: true,
      at: 3_000,
    });
    upgraded.close();

    const reopened = openDatabase(dir);
    expect(new PushedQuotaStore(reopened).windowsFor("acct_a")).toEqual([
      {
        windowId: "five_hour",
        status: "rejected",
        utilization: 1,
        resetsAt: 9_000,
        overageStatus: "allowed",
        usingOverage: true,
        at: 3_000,
      },
    ]);
    for (const column of PUSHED_OVERAGE_COLUMNS)
      reopened.exec(`ALTER TABLE pushed_quota DROP COLUMN ${column};`);
    expect(columnNames(reopened, "pushed_quota")).toEqual(columnsBefore);
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM pushed_quota").get()).toEqual({ n: 1 });
    reopened.close();
  });
});

describe("migration 66 (an honest usage ledger, the Usage tab)", () => {
  it("adds the nullable columns, keeps every earlier row unqualified, records a served row, and reverses", () => {
    const dir = tmpUserData();
    const at65 = openDatabase(dir, 65);
    const columnsAt65 = columnNames(at65, "usage_events");
    expect(columnsAt65).not.toContain("model_source");
    at65
      .prepare(
        "INSERT INTO usage_events (task_id, provider, model, input, output, cost, at) VALUES ('t1', 'anthropic-claude', 'opus', 100, 20, 0.5, 1)",
      )
      .run();
    at65.close();

    const upgraded = openDatabase(dir);
    expect(appliedVersions(upgraded)).toEqual(ALL_VERSIONS);
    // A row written before the columns keeps the model recorded then, with no source.
    expect(
      upgraded.prepare("SELECT model, model_source, cost, cost_source FROM usage_events").get(),
    ).toEqual({ model: "opus", model_source: null, cost: 0.5, cost_source: null });
    new UsageStore(upgraded).record({
      taskId: "t1",
      model: { provider: "anthropic-claude", id: "opus" },
      usage: {
        input: 10,
        cost: 0.1,
        costSource: "claude",
        models: [{ model: "claude-opus-4-1", input: 10, cost: 0.1, costSource: "claude" }],
      },
      at: 2,
    });
    upgraded.close();

    const reopened = openDatabase(dir);
    expect(
      reopened
        .prepare("SELECT model, model_source, cost_source FROM usage_events WHERE at = 2")
        .get(),
    ).toEqual({ model: "claude-opus-4-1", model_source: "served", cost_source: "claude" });
    // Reversible: dropping the columns restores the v65 shape with every row.
    dropViews(reopened);
    reopened.exec(REVERSE_MIGRATION_66);
    expect(columnNames(reopened, "usage_events")).toEqual(columnsAt65);
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM usage_events").get()).toEqual({ n: 2 });
    reopened.close();
  });
});

describe("migration 68 (the reply line beside each captain message, FI3-1089)", () => {
  it("adds the nullable column, keeps an older message with no reply, keeps a reply, and reverses", () => {
    const dir = tmpUserData();
    const at67 = openDatabase(dir, 67);
    const columnsAt67 = columnNames(at67, "captain_asks");
    expect(columnsAt67).not.toContain("reply");
    at67
      .prepare(
        "INSERT INTO captain_asks (id, at, text, turn_state) VALUES ('old1', 1, 'before the line', 'closed')",
      )
      .run();
    at67.close();

    const upgraded = openDatabase(dir);
    expect(appliedVersions(upgraded)).toEqual(ALL_VERSIONS);
    const tasks = new TaskService({ db: upgraded, strict: true, now: () => 2 });
    // A message written before the column has no reply line.
    expect(tasks.capture.lastTurn()).toEqual({
      you: "before the line",
      reply: null,
      previous: null,
    });
    tasks.capture.openAsk({ id: "new1", text: "how is the alpha?" });
    tasks.capture.setAskReply("new1", { text: "The alpha is cut" });
    upgraded.close();

    // An app restart reads the last turn back from disk, with the round
    // before it (INF-1771: the last two rounds above the input).
    const reopened = openDatabase(dir);
    expect(new TaskService({ db: reopened, strict: true }).capture.lastTurn()).toEqual({
      you: "how is the alpha?",
      reply: { text: "The alpha is cut" },
      previous: { you: "before the line", reply: null },
    });
    // Reversible: dropping the column restores the v67 shape with every row.
    dropViews(reopened);
    reopened.exec(REVERSE_MIGRATION_68);
    expect(columnNames(reopened, "captain_asks")).toEqual(columnsAt67);
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM captain_asks").get()).toEqual({ n: 2 });
    reopened.close();
  });
});

describe("release-tracking profile migration", () => {
  it("records a new profile as fresh, with no known baseline", () => {
    const dir = scratchDir("infinitary-new-tracking-");
    const db = openDatabase(dir);
    expect(new SettingsStore(db).getReleaseTracking()).toEqual({
      schema: 1,
      profile: "fresh",
      baseline: null,
      previous: null,
      deliveries: {},
      unresolved: [],
    });
    db.close();
  });

  it("records a profile that already had saved work as legacy and keeps its first-run record", () => {
    const dir = scratchDir("infinitary-legacy-tracking-");
    const legacy = openDatabase(dir, 60);
    new SettingsStore(legacy).setFirstRun({
      welcomedAt: 123,
      firstTurnAt: 456,
      welcomeState: "consumed",
    });
    legacy.close();
    const upgraded = openDatabase(dir);
    const settings = new SettingsStore(upgraded);
    expect(settings.getReleaseTracking()).toMatchObject({ profile: "legacy", baseline: null });
    expect(settings.getFirstRun()).toMatchObject({ welcomedAt: 123, welcomeState: "consumed" });
    upgraded.close();
  });

  it("never rewrites a recorded classification when reopened", () => {
    const dir = scratchDir("infinitary-reopen-tracking-");
    const db = openDatabase(dir);
    const settings = new SettingsStore(db);
    settings.setReleaseTracking({
      ...settings.getReleaseTracking(),
      baseline: { version: "0.1.28", source: null, recordedAt: 7 },
    });
    db.close();
    const reopened = openDatabase(dir);
    expect(new SettingsStore(reopened).getReleaseTracking()).toMatchObject({
      profile: "fresh",
      baseline: { version: "0.1.28" },
    });
    reopened.close();
  });
});

describe("immediate-welcome profile migration", () => {
  it("persists a new profile's uninitialized eligibility across reopen", () => {
    const dir = scratchDir("infinitary-new-welcome-");
    const db = openDatabase(dir);
    const settings = new SettingsStore(db);
    expect(settings.getFirstRun()).toEqual({
      welcomedAt: null,
      firstTurnAt: null,
      welcomeState: "uninitialized",
    });
    settings.setFirstRun({ welcomedAt: null, firstTurnAt: null, welcomeState: "pending" });
    db.close();
    const reopened = openDatabase(dir);
    expect(new SettingsStore(reopened).getFirstRun().welcomeState).toBe("pending");
    reopened.close();
  });

  it.each(["missing", "timestamps", "unreadable"] as const)(
    "skips a legacy profile with a %s record, preserving timestamps",
    (kind) => {
      const dir = scratchDir("infinitary-legacy-welcome-");
      const legacy = openDatabase(dir, 57);
      if (kind === "timestamps")
        new SettingsStore(legacy).setFirstRun({ welcomedAt: 123, firstTurnAt: 456 });
      if (kind === "unreadable")
        legacy.prepare("INSERT INTO settings (key, value) VALUES ('first-run', ?)").run("not json");
      legacy.close();
      const upgraded = openDatabase(dir);
      expect(new SettingsStore(upgraded).getFirstRun()).toEqual({
        welcomeState: "skipped",
        welcomedAt: kind === "timestamps" ? 123 : null,
        firstTurnAt: kind === "timestamps" ? 456 : null,
      });
      upgraded.close();
    },
  );
});

// INF-1610 piece 2: the captain's messages from before the app followed each
// to its answer are never asked about again; a new one is followed and keeps
// its answer across a restart.
it("INF-1610 leaves every older captain message unfollowed, follows a new one, keeps its answer across reopen and reverses", () => {
  const dir = tmpUserData();
  const old = openDatabase(dir, 101);
  const columns = columnNames(old, "captain_asks");
  old
    .prepare(
      "INSERT INTO captain_asks (id, at, text, turn_state, delivery) VALUES ('stack', 1, 'did something change about how we order the cards in the stack?', 'closed', 'covered')",
    )
    .run();
  old.close();
  const upgraded = openDatabase(dir);
  expect(appliedVersions(upgraded)).toEqual(ALL_VERSIONS);
  const tasks = new TaskService({ db: upgraded, strict: true });
  expect(tasks.capture.getAsk("stack")).toMatchObject({ followed: false, answeredAt: null });
  tasks.capture.openAsk({ id: "taps", text: "the taps on the phone get lost" });
  tasks.capture.closeAsk("taps", "closed");
  tasks.capture.markAnswered("taps", "card-firstmate-taps");
  upgraded.close();
  const reopened = openDatabase(dir);
  const again = new TaskService({ db: reopened, strict: true });
  expect(again.capture.getAsk("taps")).toMatchObject({
    followed: true,
    answerCardId: "card-firstmate-taps",
  });
  reopened.exec(REVERSE_MIGRATION_102);
  expect(columnNames(reopened, "captain_asks")).toEqual(columns);
  expect(reopened.prepare("SELECT COUNT(*) AS n FROM captain_asks").get()).toEqual({ n: 2 });
  reopened.close();
});

// Intent: INF-1177 piece 3 reuses the installer records without reclassifying an existing panel.
it("INF-1482 keeps installed panels through the runbook-kind upgrade, restart and reversal", async () => {
  const dir = tmpUserData();
  const old = openDatabase(dir, PLUGIN_KIND_MIGRATION_VERSION - 1);
  const columns = columnNames(old, "plugins");
  // A legacy installed panel, in the shape the pre-runbook installer persisted.
  old
    .prepare(
      "INSERT INTO plugins (id, source, spec, name, version, capabilities_json, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "token-watch",
      "path",
      join(process.cwd(), "tests/fixtures/personal-skills/token-watch"),
      "Acme",
      "1.0.0",
      JSON.stringify({ reads: ["tasks.board"] }),
      1,
      1,
    );
  const before = old.prepare("SELECT * FROM plugins").all();
  old.close();
  const upgraded = openDatabase(dir);
  expect(new PluginRecords(upgraded).get("token-watch")).toMatchObject({
    kind: "panel",
    name: "Acme",
    capabilities: { reads: ["tasks.board"] },
    installedAt: 1,
  });
  const spec = join(process.cwd(), "resources/runbooks/sequences");
  const fetched = await fetchPluginSource({ source: "path", spec, workDir: join(dir, "fetch") });
  new PluginRecords(upgraded).commit("studio-workflows", {
    kind: "runbook",
    source: "path",
    spec,
    pinned: fetched.pinned,
    name: "Studio",
    version: "1.0.0",
    title: "Studio workflows",
    capabilities: {},
    stagedAt: 2,
  });
  upgraded.close();
  const reopened = openDatabase(dir);
  expect(new PluginRecords(reopened).get("studio-workflows")).toMatchObject({
    kind: "runbook",
    name: "Studio",
  });
  new PluginRecords(reopened).delete("studio-workflows");
  reopened.exec("ALTER TABLE plugins DROP COLUMN kind;");
  // A runbook's agreed panel grants came in a later migration; reversing to before both drops it too.
  reopened.exec("ALTER TABLE plugins DROP COLUMN panels_json;");
  expect(columnNames(reopened, "plugins")).toEqual(columns);
  expect(reopened.prepare("SELECT * FROM plugins").all()).toEqual(before);
  reopened.close();
});
