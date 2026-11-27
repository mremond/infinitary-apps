import type { AppDatabase } from "@core/storage/db";
import { DATABASE_VERSION } from "@core/storage/db";
import { PERMISSION_COLUMNS } from "@core/storage/taskDeliveryFields";
import { scratchDir } from "./scratchDirs";
import { taskRecordRetirementReverseSql } from "./taskRecordRetirement";

/**
 * What the database migration tests share (src/core/storage/*Migrations.test.ts):
 * the SQL that undoes each migration a test reverses, so a reversed database
 * can be compared with its older shape, and the folders and reads every
 * upgrade test makes. A reversal undoes the later migrations over the same
 * columns first, so each chain names the newer one it starts from.
 */

export const ALL_VERSIONS = Array.from({ length: DATABASE_VERSION }, (_, index) => index + 1);
/**
 * INF-1610 piece 2's ending of each captain message, undone, with the
 * optional query indexes over its columns (INF-2061's statement check).
 */
export const REVERSE_MIGRATION_102 =
  // Taking back a message (docs/task-capture.md) is newer than both historical schemas.
  "DROP INDEX IF EXISTS captain_asks_correction_of; ALTER TABLE captain_asks DROP COLUMN correction_of; ALTER TABLE captain_asks DROP COLUMN taken_back_at; " +
  // Neither historical schema has the later reply attribution columns.
  "DROP INDEX IF EXISTS captain_asks_typed; ALTER TABLE captain_asks DROP COLUMN typed_line; ALTER TABLE captain_asks DROP COLUMN typed_card_id; " +
  // INF-3898 piece 2's command mark is newer than every captain_asks shape these tests compare.
  "ALTER TABLE captain_asks DROP COLUMN through; " +
  // The approved correction source migration is newer than both historical schemas.
  // Undo its private ask column first, preserving the original full-shape assertions.
  "ALTER TABLE captain_asks DROP COLUMN captain_text; DROP INDEX IF EXISTS captain_asks_continues; DROP INDEX IF EXISTS captain_asks_unanswered; ALTER TABLE captain_asks DROP COLUMN followed; ALTER TABLE captain_asks DROP COLUMN continues; ALTER TABLE captain_asks DROP COLUMN answer_card_id; ALTER TABLE captain_asks DROP COLUMN accepted_at; ALTER TABLE captain_asks DROP COLUMN answered_at; ALTER TABLE captain_asks DROP COLUMN crewmate_asked_at;\n";
/** Migration 68's reply line, undone: the `captain_asks` column. */
export const REVERSE_MIGRATION_68 = `${REVERSE_MIGRATION_102}ALTER TABLE captain_asks DROP COLUMN reply;\n`;
/** INF-1288's conversation associations, removed before a pre-sessions schema comparison. */
export const REVERSE_TASK_SESSIONS = "DROP TABLE task_sessions;\n";
/** INF-1296 piece 2's relationship rows, undone: each name back into its shape field. */
export const REVERSE_TASK_REFERENCES = [
  ["basis", "basis"],
  ["branch-source", "branch_from"],
  ["retry-of", "escalate_from"],
]
  .map(
    ([kind, field]) =>
      `UPDATE tasks SET shape_json = json_set(shape_json, '$.${field}', (SELECT ref FROM task_references r WHERE r.task_id = tasks.id AND r.kind = '${kind}')) WHERE EXISTS (SELECT 1 FROM task_references r WHERE r.task_id = tasks.id AND r.kind = '${kind}');\n`,
  )
  .join("")
  .concat("DROP TABLE task_references;\n");
/** INF-1296 piece 3's policy rows, undone: each input back into its shape field. */
const REVERSE_TASK_POLICIES = [
  ["delivery_ask", "p.delivery_ask"],
  ["autonomy_ask", "json(CASE p.autonomy_ask WHEN 1 THEN 'true' ELSE 'false' END)"],
  ["rigor_ask", "p.rigor_ask"],
  ["policies", "json(p.edits_json)"],
]
  .map(([field, value]) => {
    const column = field === "policies" ? "edits_json" : field;
    return `UPDATE tasks SET shape_json = json_set(shape_json, '$.${field}', (SELECT ${value} FROM task_policies p WHERE p.task_id = tasks.id)) WHERE EXISTS (SELECT 1 FROM task_policies p WHERE p.task_id = tasks.id AND p.${column} IS NOT NULL);\n`;
  })
  .join("")
  .concat("DROP TABLE task_policies;\n");
/** INF-1296 piece 3's execution rows, undone: each value back on the task row, the turn on its delivery. */
const REVERSE_TASK_EXECUTION = `UPDATE tasks SET session_file = x.session_file, device_id = x.device_id,
  account_id = x.account_id, placement_json = x.placement_json, idle_since = x.idle_since,
  recovery_rung = x.recovery_rung, recovery_count = x.recovery_count, recovery_at = x.recovery_at,
  start_notice = x.start_notice,
  delivery_json = CASE WHEN x.turn_json IS NULL THEN tasks.delivery_json
    ELSE json_patch(COALESCE(tasks.delivery_json, '{}'), x.turn_json) END
  FROM task_execution x WHERE x.task_id = tasks.id;
DROP TABLE task_execution;
CREATE INDEX tasks_pending_placement ON tasks(id) WHERE json_extract(placement_json, '$.reservation') = 'pending';
`;
/** INF-1296 piece 4's change evidence and permission rows, undone: each field back on its delivery. */
const REVERSE_TASK_DELIVERY = `UPDATE tasks SET delivery_json = json_set(delivery_json, '$.mode', x.mode)
  FROM task_delivery_evidence x WHERE x.task_id = tasks.id AND x.mode IS NOT NULL;
UPDATE tasks SET delivery_json = json_set(delivery_json, '$.headSha', x.head_sha)
  FROM task_delivery_evidence x WHERE x.task_id = tasks.id AND x.head_sha IS NOT NULL;
UPDATE tasks SET delivery_json = json_patch(delivery_json, x.evidence_json)
  FROM task_delivery_evidence x WHERE x.task_id = tasks.id AND x.evidence_json IS NOT NULL;
${Object.entries(PERMISSION_COLUMNS)
  .map(
    ([field, column]) =>
      `UPDATE tasks SET delivery_json = json_set(delivery_json, '$.${field}', json(p.${column})) FROM task_permissions p WHERE p.task_id = tasks.id AND p.${column} IS NOT NULL;\n`,
  )
  .join(
    "",
  )}UPDATE tasks SET delivery_json = json_set(delivery_json, '$.liveValidation.permissions', json(p.validation_permissions_json))
  FROM task_permissions p WHERE p.task_id = tasks.id AND p.validation_permissions_json IS NOT NULL;
UPDATE tasks SET pending_settle_json = p.pending_settle_json
  FROM task_permissions p WHERE p.task_id = tasks.id AND p.pending_settle_json IS NOT NULL;
DROP TABLE task_permissions;
DROP TABLE task_delivery_evidence;
`;
/** INF-1868 piece 1's change record, undone: its two tables. */
const REVERSE_CHANGES = "DROP TABLE IF EXISTS change_versions; DROP TABLE IF EXISTS changes;\n";
/** INF-2205 piece B's panel stops, undone: its one table. */
const REVERSE_PANEL_STOPS = "DROP TABLE IF EXISTS panel_stops;\n";
/** INF-3131's cost limits and the holds they place, undone: its two tables. */
export const REVERSE_COST_LIMITS =
  "DROP TABLE IF EXISTS cost_holds; DROP TABLE IF EXISTS cost_limits;\n";
/** INF-1296 pieces 3 and 4's records, undone, newest first, after the later tables over them. */
export const REVERSE_RUNNING_WORK =
  REVERSE_COST_LIMITS +
  REVERSE_PANEL_STOPS +
  REVERSE_CHANGES +
  taskRecordRetirementReverseSql() +
  REVERSE_TASK_DELIVERY +
  REVERSE_TASK_POLICIES +
  REVERSE_TASK_EXECUTION;
/** Migration 80's delivery columns, undone. */
export const REVERSE_MIGRATION_80 =
  "ALTER TABLE schedule_runs DROP COLUMN inbox_id; ALTER TABLE schedule_runs DROP COLUMN delivery; ALTER TABLE schedule_runs DROP COLUMN settled_at; ALTER TABLE schedule_runs DROP COLUMN cancel_reason; ALTER TABLE schedule_runs DROP COLUMN tasks; ALTER TABLE schedule_runs DROP COLUMN cards;\n";
/** Migration 79's calendar and project columns, undone. */
export const REVERSE_MIGRATION_79 =
  "ALTER TABLE schedules DROP COLUMN days; ALTER TABLE schedules DROP COLUMN time_zone; ALTER TABLE schedules DROP COLUMN project_id;\n";
/** Migration 78's rule columns and run history, undone. */
export const REVERSE_MIGRATION_78 =
  "DROP TABLE schedule_runs; ALTER TABLE schedules DROP COLUMN name; ALTER TABLE schedules DROP COLUMN state; ALTER TABLE schedules DROP COLUMN revision;\n";
/** Migration 71's concerned tasks, undone: the `task_event_concerns` table. */
export const REVERSE_MIGRATION_71 =
  "DROP TABLE IF EXISTS keep_open_backfill; DROP TABLE task_event_concerns;\n";
/** Migration 71's table, for a fixture that seeds an older database through the one writer. */
export const MIGRATION_71_TABLE =
  "CREATE TABLE task_event_concerns (event_id INTEGER NOT NULL, task_id TEXT NOT NULL, relation TEXT NOT NULL, via TEXT, PRIMARY KEY (event_id, task_id));";
/** INF-1296 piece 2's relationship rows, lent to an older schema for today's writer. */
export const TASK_REFERENCES_TABLE =
  "CREATE TABLE task_references (task_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, target_id TEXT, actor TEXT, recorded_at INTEGER, PRIMARY KEY (task_id, kind));";
/** A rule's notes (docs/automation.md, "A rule's notes"), undone: its one table. */
/** Task tags (docs/task-tags.md; the newest tables), undone: the tags tasks carry, then the projects' own. */
const REVERSE_TASK_TAGS = "DROP TABLE IF EXISTS task_tags;\nDROP TABLE IF EXISTS project_tags;\n";
/** INF-6115's one-time thread carries, undone with the newer tables: its one table. */
const REVERSE_ASK_THREAD_CARRIES = `${REVERSE_TASK_TAGS}DROP TABLE IF EXISTS ask_thread_carries;\n`;
/** The card drafts migration, undone with the newer table: its two triggers on `cards`, then its table. */
export const REVERSE_CARD_DRAFTS =
  REVERSE_ASK_THREAD_CARRIES +
  "DROP TRIGGER IF EXISTS card_drafts_resolved;\nDROP TRIGGER IF EXISTS card_drafts_removed;\nDROP TABLE IF EXISTS card_drafts;\n";

export const REVERSE_SCHEDULE_NOTES = `${REVERSE_CARD_DRAFTS}DROP TABLE IF EXISTS schedule_notes;\n`;
/** INF-3108's record of the close controls it gave back, undone: its one table. */
export const REVERSE_CLOSE_CONTROL_RESTORE = "DROP TABLE IF EXISTS card_close_control_restore;\n";
/** A crewmate card's declared live reads (the newest card column), undone. */
export const REVERSE_CARD_LIVE_READS = "ALTER TABLE cards DROP COLUMN live_reads_json;\n";
/** INF-3898 piece 2's command mark on a card's resolution, with the later card column undone. */
export const REVERSE_RESOLVED_THROUGH = `${REVERSE_CARD_LIVE_READS}ALTER TABLE cards DROP COLUMN resolved_through;\n`;
/** INF-3846's put-off kept on a closed card, with the later card column undone. */
export const REVERSE_PUT_OFF = `${REVERSE_RESOLVED_THROUGH}ALTER TABLE schedules DROP COLUMN card_id;\nDROP INDEX cards_put_off;\nALTER TABLE cards DROP COLUMN put_off_json;\n`;
/** The files for the captain a card holds by reference, with the later card column undone. */
export const REVERSE_CARD_FILES = `${REVERSE_PUT_OFF}ALTER TABLE cards DROP COLUMN files_json;\n`;
/** INF-3071's ended card kept on the stack, with the later card columns undone. */
export const REVERSE_ENDED = `${REVERSE_CARD_FILES}DROP INDEX cards_ended;\nALTER TABLE cards DROP COLUMN ended_json;\n`;
/** INF-2796's after-merge steps on a merge card, with the later card column undone. */
export const REVERSE_AFTER_MERGE = `${REVERSE_ENDED}ALTER TABLE cards DROP COLUMN after_merge_json;\n`;
/** INF-1670's answerer of a card whose author cannot answer, with the later card column undone. */
export const REVERSE_ANSWERED_BY = `${REVERSE_AFTER_MERGE}ALTER TABLE cards DROP COLUMN answered_by;\n`;
/** INF-1610's declaration that a card answers the captain's message, with the later card column undone. */
export const REVERSE_MIGRATION_101 = `${REVERSE_ANSWERED_BY}ALTER TABLE cards DROP COLUMN answering;\n`;
/** INF-1226's declaration that a card's choice is not its task's answer, with the later card column undone. */
export const REVERSE_MIGRATION_93 = `${REVERSE_MIGRATION_101}ALTER TABLE cards DROP COLUMN continues;\n`;
/** INF-476's saved visibility column, with the later card column undone, without deleting card rows. */
export const REVERSE_MIGRATION_88 = `${REVERSE_MIGRATION_93}ALTER TABLE cards DROP COLUMN minimized;\n`;
/** Migration 77's optional continuity declaration, with its later columns undone. */
export const REVERSE_MIGRATION_77 = `${REVERSE_MIGRATION_88}ALTER TABLE cards DROP COLUMN review_task_id; ALTER TABLE cards DROP COLUMN required_actions_json; ALTER TABLE cards DROP COLUMN holds_place;\n`;
/** Legacy card reversal chain removes later columns before migration 70's replies column. */
export const REVERSE_MIGRATION_70 = `${REVERSE_MIGRATION_77}ALTER TABLE cards DROP COLUMN replies;\n`;
/** Migration 69's merge-card risk, undone: the `cards` column. */
export const REVERSE_MIGRATION_69 = "ALTER TABLE cards DROP COLUMN risk_json;\n";
/** Migration 67's card place, undone: the `cards` column. */
export const REVERSE_MIGRATION_67 = "ALTER TABLE cards DROP COLUMN place;\n";
/** Legacy usage reversal removes 83's reasoning count before 66's six columns. */
export const REVERSE_MIGRATION_66 = `
  ALTER TABLE usage_events DROP COLUMN reasoning;
  ALTER TABLE usage_events DROP COLUMN model_source;
  ALTER TABLE usage_events DROP COLUMN cost_source;
  ALTER TABLE usage_events DROP COLUMN cost_input;
  ALTER TABLE usage_events DROP COLUMN cost_output;
  ALTER TABLE usage_events DROP COLUMN cost_cache_read;
  ALTER TABLE usage_events DROP COLUMN cost_cache_write;
`;
/** Migration 65's live attachment, undone: the `cards` column. */
export const REVERSE_MIGRATION_65 = "ALTER TABLE cards DROP COLUMN attachment_json;\n";
/** A project's advisory workflows (docs/forge.md, "Advisory workflows"), the newest project column, undone first. */
export const REVERSE_PROJECT_ADVISORY_WORKFLOWS =
  "ALTER TABLE repos DROP COLUMN advisory_workflows_json;\n";
/** A project's line saying a crewmate wrote it (docs/forge.md, "Disclosing AI assistance"), undone after the later advisory workflows. */
export const REVERSE_PROJECT_CONTRIBUTOR_DISCLOSURE = `${REVERSE_PROJECT_ADVISORY_WORKFLOWS}ALTER TABLE repos DROP COLUMN contributor_disclosure;\n`;
/** A batched project's batch gap (docs/forge.md, "The batch gap"), undone after the later disclosure line. */
export const REVERSE_PROJECT_BATCH_GAP = `${REVERSE_PROJECT_CONTRIBUTOR_DISCLOSURE}ALTER TABLE repos DROP COLUMN batch_gap_minutes;\n`;
/** The no-checks record, undone after the later batch gap. */
export const REVERSE_PROJECT_NO_CHECKS = `${REVERSE_PROJECT_BATCH_GAP}ALTER TABLE repos DROP COLUMN no_checks_json;\n`;
/** Which project each repository belongs to (INF-4220), undone after the later no-checks column and before any older project column. */
export const REVERSE_PROJECT_MEMBERSHIP = `${REVERSE_PROJECT_NO_CHECKS}DROP INDEX repos_project; ALTER TABLE repos DROP COLUMN project_id;\n`;
/** A project's batch of its own, undone, after the later project columns. */
export const REVERSE_PROJECT_BATCH = `${REVERSE_PROJECT_MEMBERSHIP}ALTER TABLE repos DROP COLUMN batch_json;\n`;
/** The contribution route, undone before reconstructing an older project record, after the later batch column. */
export const REVERSE_PROJECT_CONTRIBUTIONS = `${REVERSE_PROJECT_BATCH}ALTER TABLE repos DROP COLUMN contribution_json;\n`;
/** The later project columns, undone before an older project migration: contribution routing and queue facts. */
export const REVERSE_PROJECT_QUEUE = `${REVERSE_PROJECT_CONTRIBUTIONS}ALTER TABLE repos DROP COLUMN queue_pause_json; ALTER TABLE repos DROP COLUMN queue_offered; ALTER TABLE repos DROP COLUMN queue_pending_at; ALTER TABLE repos DROP COLUMN queue_workflows_json; ALTER TABLE repos DROP COLUMN queue_answered_at;\n`;
/** Reversing Runs on also removes the later project requirements, scope and queue columns. */
export const REVERSE_MIGRATION_64 = `${REVERSE_PROJECT_QUEUE}ALTER TABLE repos DROP COLUMN scope; ALTER TABLE repos DROP COLUMN placement_requirements_json; ALTER TABLE repos DROP COLUMN runs_on;\n`;
/** Reversing placed tasks also removes migration 84's commitment column and index. */
export const REVERSE_MIGRATION_63 =
  "DROP INDEX tasks_pending_placement; ALTER TABLE tasks DROP COLUMN placement_json; ALTER TABLE tasks DROP COLUMN device_id;\n";
/** Migration 59's sent-back stamp, undone: the `cards` column. */
export const REVERSE_MIGRATION_59 = `ALTER TABLE cards DROP COLUMN sent_back_at;\n`;
/** Migration 57's card evidence, undone: its two tables and the two `cards` pointers. */
export const REVERSE_MIGRATION_57 = `
  DROP TABLE card_observations;
  DROP TABLE card_capture_epochs;
  ALTER TABLE cards DROP COLUMN lifecycle_id;
  ALTER TABLE cards DROP COLUMN offer_id;
`;
/**
 * Migration 50's one decision ledger, undone: the three tables back from
 * their kinds (a sort row's id and its `rule:<id>` stamp in `model`), and
 * `decisions` dropped. Run with the views dropped, as every older reversal
 * that meets it first is.
 */
export const REVERSE_MIGRATION_50 = `
  CREATE TABLE routing_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, provider TEXT, model TEXT,
    bucket TEXT NOT NULL, reasons_json TEXT NOT NULL, at INTEGER NOT NULL, rule TEXT, served TEXT
  );
  INSERT INTO routing_decisions (task_id, provider, model, bucket, reasons_json, at, rule, served)
    SELECT task_id, provider, model, bucket, reasons_json, at, rule, served
    FROM decisions WHERE kind = 'routing' ORDER BY id;
  CREATE INDEX routing_decisions_task ON routing_decisions (task_id, at);
  CREATE TABLE account_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, provider TEXT NOT NULL,
    account_id TEXT, reasons_json TEXT NOT NULL, at INTEGER NOT NULL
  );
  INSERT INTO account_decisions (task_id, provider, account_id, reasons_json, at)
    SELECT task_id, provider, account_id, reasons_json, at
    FROM decisions WHERE kind = 'account' ORDER BY id;
  CREATE TABLE supervision_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, wake TEXT NOT NULL,
    verdict TEXT NOT NULL, summary TEXT NOT NULL, at INTEGER NOT NULL, card_id TEXT, model TEXT,
    prompt_sha TEXT, tools_sha TEXT, steered INTEGER, wake_kind TEXT,
    missed_escalation INTEGER, missed_note TEXT, missed_at INTEGER
  );
  INSERT INTO supervision_outcomes
    (id, task_id, wake, verdict, summary, at, card_id, model, prompt_sha, tools_sha, steered,
     wake_kind, missed_escalation, missed_note, missed_at)
    SELECT id, task_id, wake, verdict, summary, at, card_id,
      CASE WHEN rule IS NULL THEN model ELSE 'rule:' || rule END,
      prompt_sha, tools_sha, steered, wake_kind, missed_escalation, missed_note, missed_at
    FROM decisions WHERE kind = 'sort' ORDER BY id;
  DROP TABLE decisions;
`;
/**
 * Migration 48's envelope, unwrapped: every payload back to its prose. The
 * older inbox tests queue only prose, so `$.text` is all there is.
 */
const REVERSE_MIGRATION_48_PROSE = "UPDATE inbox SET payload = json_extract(payload, '$.text');";
/** The provider refusal count (`addProviderRefusals`), undone: its three `inbox` columns. */
export const REVERSE_PROVIDER_REFUSALS =
  "ALTER TABLE inbox DROP COLUMN refusal; ALTER TABLE inbox DROP COLUMN refusals; ALTER TABLE inbox DROP COLUMN stuck_at;";
/** Migration 74's cut count, undone (the refusal count's first): the `inbox` column. */
export const REVERSE_MIGRATION_74 = `${REVERSE_PROVIDER_REFUSALS} ALTER TABLE inbox DROP COLUMN cuts;`;
/** Migration 76's start notice, undone: the `tasks` column. */
export const REVERSE_MIGRATION_76 = "ALTER TABLE tasks DROP COLUMN start_notice;";
/** Migration 45's inbox columns, dropped (74's first): what an older inbox reversal undoes first. */
export const REVERSE_MIGRATION_45_INBOX = `${REVERSE_MIGRATION_74} ${REVERSE_MIGRATION_48_PROSE} ALTER TABLE inbox DROP COLUMN failures; ALTER TABLE inbox DROP COLUMN failing_since; ALTER TABLE inbox DROP COLUMN next_attempt_at;`;

/** A throwaway userData folder; scratchDir removes it once the test file ends. */
export function tmpUserData(): string {
  return scratchDir("infinitary-mig-");
}

export function appliedVersions(db: AppDatabase): number[] {
  return (
    db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
      version: number;
    }[]
  ).map((row) => row.version);
}

export function tableNames(db: AppDatabase): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

export function columnNames(db: AppDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (row) => row.name,
  );
}
