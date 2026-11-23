import { forgeOf } from "@shared/forge";
import { addColumn } from "./addColumn";
import {
  addCardAfterMerge,
  addCardAnswerer,
  addCardContributions,
  addCardFiles,
  addCardLiveReads,
  clearInterimAnswers,
  migrateCardEffects,
  migrateOneMergeEffect,
  restoreCloseControls,
} from "./cardMigrations";
import { addOriginalCaptainText } from "./correctionMigrations";
import type { AppDatabase } from "./db";
import {
  addCrewResponses,
  addProviderRefusals,
  migrateIdleRecovery,
  migrateInboxContentHash,
  migrateInboxOrigin,
} from "./inboxMigrations";
import { migrateAlwaysRoute } from "./migrateAlwaysRoute";
import { migrateChanges } from "./migrateChanges";
import { migrateGpt6Slots, migrateModelSlots } from "./migrateModelSlots";
import { migrateOngoingWork } from "./migrateOngoingWork";
import { retireKeepOpen } from "./retireKeepOpen";
import {
  migrateCapGates,
  migrateClosePark,
  migrateCreatedEvents,
  migrateDetachFollowups,
  migrateRetireDelivered,
  migrateTaskDeliveryRecords,
  migrateTaskExecution,
  migrateTaskGraph,
  migrateTaskHygiene,
  migrateTaskPolicies,
  migrateTaskRecord,
  migrateTaskReferences,
  retireReviewEdges,
} from "./taskRecordMigrations";
import { migrateTaskRecordRetirement } from "./taskRecordProjection";
import { REPETITION_TABLES } from "./taskRepetitionStore";
import { migratePublishedViews } from "./views";

/**
 * The embedded migration ledger of userData/firstmate.db (docs/architecture.md
 * section 7): forward-only, each step run once, in order, inside a
 * transaction (db.ts's `migrate`). A migration is SQL text, or a function
 * when the step needs code (a backfill that reads rows and maps them, as the
 * task-record migrations do). A saved database records the number of every
 * step it ran, which is the step's place here: a step is never moved,
 * removed or reordered, and a new one goes at the end.
 */

type Migration = string | ((db: AppDatabase, fresh: boolean) => void);

/**
 * Keyboard presets (docs/keyboard.md, "Presets"): a profile that ran a
 * version from before them keeps today's keys, Legacy. One with changed keys
 * already has its `keyboard` row, which reads as Legacy with its changes;
 * one without gets Legacy's row with nothing changed, in the form those
 * versions saved, so going back to one reads it too. A new profile gets no
 * row and starts on Vim. Deleting the row undoes it.
 */
export const keyboardPresets = (db: AppDatabase, fresh: boolean): void => {
  if (fresh) return;
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('keyboard', ?) ON CONFLICT(key) DO NOTHING",
  ).run(JSON.stringify({ version: 1, keys: {} }));
};

/**
 * INF-6115 piece 2 (docs/task-capture.md "How a message ends"): every
 * captain message is its own thread, and `continues` is never written or
 * read again. Each followed message open at this update is listed once,
 * with the message whose merged thread it was in, so one step after the
 * update keeps that thread's still-open work as the message's own and
 * marks it carried; no row is added after this. `TaskService` is the only
 * writer; no published view reads it. Dropping the table reverses it.
 */
// i18n-exempt: SQL, never shown
export const ASK_THREAD_CARRIES = `
  CREATE TABLE IF NOT EXISTS ask_thread_carries (
    ask_id TEXT PRIMARY KEY,
    root_id TEXT NOT NULL,
    carried_at INTEGER
  ) WITHOUT ROWID;
  INSERT OR IGNORE INTO ask_thread_carries (ask_id, root_id)
    SELECT id, COALESCE(continues, id) FROM captain_asks
    WHERE followed = 1 AND answered_at IS NULL AND delivery != 'unresolved';
`;

export const MIGRATIONS: readonly Migration[] = [
  // 1: work substrate - registered repos and tasks (worktree per task).
  `
  CREATE TABLE repos (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    added_at INTEGER NOT NULL
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    repo_id TEXT,
    repo_dir TEXT NOT NULL,
    worktree_dir TEXT NOT NULL,
    branch TEXT NOT NULL,
    session_file TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // 2: persisted cards (decision D-9). Unresolved cards survive restarts;
  // resolution keeps the chosen action for the record.
  `
  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    kind TEXT NOT NULL,
    priority INTEGER NOT NULL,
    title TEXT NOT NULL,
    meta TEXT NOT NULL,
    body TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    chosen_action TEXT
  );
  `,
  // 3: quota and routing (decisions D-7, D-18) - quota snapshots, local burn
  // tracking, routing decisions with their reasons, and app settings.
  `
  CREATE TABLE quota_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    input INTEGER,
    output INTEGER,
    cache_read INTEGER,
    cache_write INTEGER,
    cost REAL,
    at INTEGER NOT NULL
  );
  CREATE TABLE routing_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    bucket TEXT NOT NULL,
    reasons_json TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 4: the Firstmate agent's durable operational inbox - crewmate lifecycle
  // events queued for injection into the orchestrator session. Rows are
  // deleted only after delivery, so a quit mid-stream loses nothing.
  `
  CREATE TABLE fm_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // 5: the account broker - the per-account usage ledger dimension, the
  // account a task is bound to, and account-selection decisions with their
  // reasons (the "why this account" surface, parallel to routing_decisions).
  `
  ALTER TABLE usage_events ADD COLUMN account_id TEXT;
  ALTER TABLE tasks ADD COLUMN account_id TEXT;
  CREATE TABLE account_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    account_id TEXT,
    reasons_json TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  `,
  // 6: plan-window quota that arrives on a session instead of from a sensor
  // (account-broker phase 7). One row per account per window, overwritten in
  // place - the latest reading is the only one worth keeping, and its
  // timestamp is what makes staleness visible.
  `
  CREATE TABLE pushed_quota (
    account_id TEXT NOT NULL,
    window_id TEXT NOT NULL,
    utilization REAL,
    resets_at INTEGER,
    at INTEGER NOT NULL,
    PRIMARY KEY (account_id, window_id)
  );
  `,
  // 7: the persisted activity feed (P10) - the same lines the renderer
  // shows, surviving restarts so reopening the app shows what happened
  // rather than an empty feed. Bounded by the store, purged with D-13.
  `
  CREATE TABLE activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  `,
  // 8: the task graph (R1) - work that exists but must not run yet. A task
  // row can now be kind 'work' or 'decision' (a parked decision card), hold
  // a gate (after-task, quota-reset, at-time, captain) with an optional
  // expiry, and sit in the queued state until one ready sweep clears it.
  `
  ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'work';
  ALTER TABLE tasks ADD COLUMN gate_kind TEXT;
  ALTER TABLE tasks ADD COLUMN gate_ref TEXT;
  ALTER TABLE tasks ADD COLUMN gate_until INTEGER;
  ALTER TABLE tasks ADD COLUMN gate_reason TEXT;
  ALTER TABLE tasks ADD COLUMN difficulty TEXT;
  `,
  // 9: persistent cron prompts (R3) - schedules whose fires wake the
  // Firstmate agent with a prompt through the durable inbox. Rows survive
  // restarts; fires missed while the app was closed run once, flagged.
  `
  CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    spec_kind TEXT NOT NULL,
    interval_minutes INTEGER,
    hour INTEGER,
    minute INTEGER,
    at INTEGER,
    prompt TEXT NOT NULL,
    next_fire INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // 10: running background jobs (R2). A row exists only while its process
  // runs; rows found at boot were interrupted by the quit and are reported
  // honestly, then cleared.
  `
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    command TEXT NOT NULL,
    started_at INTEGER NOT NULL
  );
  `,
  // 11: the fleet model - how each repo was set up (clone|init|adopt into
  // the app-owned fleet root), its remote origin when known, its delivery
  // posture, and its autonomy flag. Pre-existing rows were arbitrary-path
  // registrations, closest to adopt, and default to the conservative
  // local-only, ask-first posture.
  `
  ALTER TABLE repos ADD COLUMN setup_kind TEXT NOT NULL DEFAULT 'adopt';
  ALTER TABLE repos ADD COLUMN origin TEXT;
  ALTER TABLE repos ADD COLUMN delivery TEXT NOT NULL DEFAULT 'local-only';
  ALTER TABLE repos ADD COLUMN autonomy INTEGER NOT NULL DEFAULT 0;
  `,
  // 12: the durable inbox - fm_inbox generalized to every recipient
  // (firstmate lane, one lane per task) with acknowledge-after-handling
  // semantics: a row is deleted only when the turn that consumed it ended
  // without error, so a failed turn or a quit re-presents the message
  // instead of losing it. Not an event bus: every row has exactly one
  // recipient and one acknowledgement.
  `
  CREATE TABLE inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    delivered_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    escalated_at INTEGER
  );
  CREATE INDEX inbox_recipient ON inbox (recipient, delivered_at);
  INSERT INTO inbox (recipient, payload, created_at)
    SELECT 'firstmate', payload, created_at FROM fm_inbox ORDER BY id;
  DROP TABLE fm_inbox;
  `,
  // 13: the supervision session (design B) - the durable outcome store for
  // triaged fleet events (append-only; effects commit in the same
  // transaction, which is what replaces the source's cursor-and-replay
  // machinery), and a task ref on inbox rows so a supervision-lane wake
  // knows which task it is about.
  `
  CREATE TABLE supervision_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    wake TEXT NOT NULL,
    verdict TEXT NOT NULL,
    summary TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  ALTER TABLE inbox ADD COLUMN ref TEXT;
  `,
  // 14: durable captain-scope notes (stage 0). The memories row is a cache
  // of the latest revision; memory_revisions is authoritative, append-only,
  // and transactional with the current-row update. Origin is a closed
  // enum stamped by code, never by model prose.
  `
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    scope TEXT NOT NULL,
    origin TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER NOT NULL
  );
  CREATE TABLE memory_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    op TEXT NOT NULL,
    content TEXT,
    origin TEXT NOT NULL,
    evidence TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  `,
  // 15: supervision outcome provenance (PoC-2 C1). card_id joins to cards so
  // escalated-and-acted vs escalated-and-dismissed is labelled going forward.
  // model / prompt_sha / tools_sha / steered / wake_kind stamp the session
  // that produced the verdict. All nullable: a value that is not at the
  // existing outcome+inbox write stays null rather than inventing plumbing.
  `
  ALTER TABLE supervision_outcomes ADD COLUMN card_id TEXT;
  ALTER TABLE supervision_outcomes ADD COLUMN model TEXT;
  ALTER TABLE supervision_outcomes ADD COLUMN prompt_sha TEXT;
  ALTER TABLE supervision_outcomes ADD COLUMN tools_sha TEXT;
  ALTER TABLE supervision_outcomes ADD COLUMN steered INTEGER;
  ALTER TABLE supervision_outcomes ADD COLUMN wake_kind TEXT;
  `,
  // 16: the confirmed missed-escalation label (PoC-2 C3). Under-escalation is
  // otherwise unobservable: a routine verdict produces one feed line and no
  // captain contact. The Firstmate's flag_missed_escalation tool stamps the
  // routine row the captain confirmed should have reached him. Nullable and
  // additive, exactly like migration 15: an unflagged row stays null, which
  // is "no label", never "not a miss".
  `
  ALTER TABLE supervision_outcomes ADD COLUMN missed_escalation INTEGER;
  ALTER TABLE supervision_outcomes ADD COLUMN missed_note TEXT;
  ALTER TABLE supervision_outcomes ADD COLUMN missed_at INTEGER;
  `,
  // 17: the task record (task-system design P0, captain decisions D2/D5/D6).
  // A task is a record, not a runtime handle: projects (Scratch plus one per
  // managed repo) mint per-project keys, and tasks gain the record columns -
  // key, project, parent, the five-value status with activity and close
  // reason, priority, goal and intent, outcome, delivery facts, assignee and
  // model, start policy, the worktree's own state, and timestamps. The
  // backfill maps every pre-existing status in code. SQLite cannot add a
  // NOT NULL column without a default to a populated table, so project_id,
  // key and updated_at are nullable here and enforced by TaskService.
  migrateTaskRecord,
  // 18: the task graph tables. `task_links` carries typed edges (blocks,
  // related, discovered-from); the one-to-one after-task gate becomes a
  // blocks edge and its gate columns clear. `task_events` is the per-task
  // timeline written in the same transaction as the change it describes.
  // `captain_asks` is the capture table (P1 writes it; the schema lands
  // with its siblings so one migration set defines the record).
  migrateTaskGraph,
  // 19: one `created` event per pre-existing task, so every timeline starts
  // at its row's birth even for tasks older than the timeline.
  migrateCreatedEvents,
  // 20: the board sequence (task-system P3, design section 9). One row,
  // one counter, bumped inside every TaskService write transaction so a
  // `seq` is minted exactly when a mutation commits and never reused -
  // the journal rule beads learned the hard way (design section 2.1): a
  // client applying pushes in seq order can never skip one. Additive and
  // reversible (drop the table); nothing else reads it.
  `
  CREATE TABLE task_board (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seq INTEGER NOT NULL
  );
  INSERT INTO task_board (id, seq) VALUES (1, 0);
  `,
  // 21: convert the per-account activation shortlist into the install's
  // model-slot record so an upgrade rearranges nothing. Additive (a new
  // settings KV row); the old model-activation row stays unread for one
  // release. Reversible by deleting the model-slots key.
  migrateModelSlots,
  // 22: wake dedupe by content (interaction P0, WI-3). Inbox rows carry the
  // sha256 of their payload, backfilled for rows already queued, and
  // `inbox_acks` remembers the newest acked content per lane and ref for
  // the short dedupe window, since the ack itself deletes the row. Additive
  // and reversible: drop the column and the table; delivery never reads
  // either.
  migrateInboxContentHash,
  // 23: fleet hygiene backfill (interaction P0, WI-7). Rows must tell the
  // truth: a closed row always has closed_at (migration 17 mapped legacy
  // closed statuses without one, hiding them from the board's recent
  // window), and a cancelled or discarded row whose worktree is gone no
  // longer says `present`. A row whose worktree still exists keeps
  // `present` - that is still the truth - and boot reconciliation retires
  // it when nothing would be lost. Additive and reversible: every value
  // changed is recorded in `task_hygiene_backfill` (old and new), so
  // restoring old_value per row and dropping the table undoes it.
  migrateTaskHygiene,
  // 24: card lineage (interaction P1, WI-12). A card revised in place keeps
  // its id, so a revision is one card with history: each superseded
  // version lands here with the card that replaced it. Additive and
  // reversible (drop the table); the stack never reads it.
  `
  CREATE TABLE card_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    replaced_at INTEGER NOT NULL,
    replaced_by TEXT NOT NULL,
    UNIQUE (card_id, revision)
  );
  `,
  // 25: the confirmed duplicate label (interaction P1, WI-14). The captain
  // says a card repeats an earlier one; the Firstmate's flag_duplicate
  // stamps it, write-once, on a captain turn only. Nullable and additive,
  // exactly like migration 16: an unflagged card is "no label", never "not
  // a duplicate". Reversible: drop the three columns.
  `
  ALTER TABLE cards ADD COLUMN duplicate_of TEXT;
  ALTER TABLE cards ADD COLUMN duplicate_note TEXT;
  ALTER TABLE cards ADD COLUMN duplicate_at INTEGER;
  `,
  // 26: follow-ups stop being children (captain, 2026-09-14). P2 filed a
  // crewmate's follow-up as a CHILD of the task it was discovered from as
  // well as discovered-from it, and the parent close rule then refused to
  // close that task while any follow-up stayed open - so work the captain
  // asked for could not land behind planned work nobody had chosen, with
  // no card to say why. Discovery is provenance: the discovered-from edge
  // carries it, and only a `blocks` edge holds an origin up. This detaches
  // the redundant parent edge from every live row whose parent is also its
  // discovered-from origin, which frees the tasks stuck today; blocks
  // edges are untouched, so a real dependency still holds. Closed rows
  // keep their history - they gate nothing. Reversible: every detached
  // parent is recorded in `followup_parent_backfill`.
  migrateDetachFollowups,
  // 27: the live-prototype kind is retired. A preview is a decision whose
  // body is interactive, so a stored row becomes a decision in every
  // respect - the kind it reads back as and the priority it sorts by
  // (CARD_PRIORITY.decision); its body and actions are untouched. Since
  // migration 29 the column is history: a card reads as what it carries.
  `
  UPDATE cards SET kind = 'decision', priority = 30 WHERE kind = 'live-prototype';
  UPDATE card_revisions SET kind = 'decision' WHERE kind = 'live-prototype';
  `,
  // 28: the park machinery is gone (cards/tasks/agents P0, WI-1; captain
  // ruling D3 a, 2026-09-15). "Later" used to park a decision card as an
  // open `park-<cardId>` decision row (R1), or hold the Firstmate's own
  // decision row with a `gate_until`, and a sweep brought the card back a
  // day later. Nothing resurfaces a card any more, so every row still
  // waiting on a park is a wait that can never end: it closes as
  // dropped/superseded with a `closed_at`, its history intact. Additive and
  // reversible: each closed row is recorded in `park_row_backfill` with the
  // gate it carried, so restoring status/closed_reason/closed_at/gate per
  // row and dropping the table undoes it.
  migrateClosePark,
  // 29: one card, actions with effects (cards/tasks/agents P1; captain
  // rulings D1 a and D2, 2026-09-15). The wire lost its `kind`: a card with
  // actions is a decision, one without a note, and the badge derives from
  // the actions and the new `author` column (crewmate, firstmate, host -
  // backfilled from the id shapes each writer used). The host no longer
  // dispatches on an action id, so every OPEN card's reserved ids become
  // the effects they meant (`migrateLegacyActions`: merge-pr/land -> settle
  // merge, discard -> settle discard, open-settings -> open settings, the
  // host ops, and keep/later/dismiss dropped - close is every card's keep).
  // Closed cards are history and untouched. The `kind` columns stay and
  // new rows write `card`. Additive and reversible: each rewritten card is
  // recorded in `card_effect_backfill` with its actions as they were, so
  // restoring `actions_json` per row, dropping `author`, and dropping the
  // table undoes it.
  migrateCardEffects,
  // 30: retire the `delivered` status (cards/tasks/agents P2, WI-11; captain
  // ruling D5′). `finish` was its only producer, and the captain reads a
  // finished task that needs nothing from him as clutter ("if it's finished
  // and doesn't need me, why is it even there?"); an idle crewmate with
  // unlanded work now stays `active` and resumable until merged, landed, or
  // discarded. Every historical `delivered` row becomes `done` - its
  // `closed_reason` (finished) already records how it closed and its
  // `closed_at` stands - so the status enum drops the value. Additive and
  // reversible: each rewritten row is recorded in `delivered_status_backfill`,
  // so restoring `status` per row and dropping the table undoes it.
  migrateRetireDelivered,
  // 31: a captain's merge click survives an in-flight crewmate turn and an
  // app restart. New databases already receive the column with the task
  // record; this adds it to databases that predate the intent queue.
  (db) => addColumn(db, "tasks", "pending_settle_json", "TEXT"),
  // 32: every firstmate- and supervision-lane inbox row carries its
  // `origin` (the served frame's finer sub-type, `ServedOrigin`), stamped by
  // the emitter, so origin classification reads a column instead of the
  // `[fm-op]`/`[user]` wording. Rows already queued when the app upgrades
  // were written before the column; they are translated ONCE here by the
  // text rules the classifier used to apply at read time
  // (`legacyInboxOrigin`), so a pending scheduled wake keeps its create
  // gate across the upgrade. Task-lane rows stay null. Additive and
  // reversible: dropping the column undoes it.
  migrateInboxOrigin,
  // 33: the personal-extension store (talk-to-personalize Step 2, decision
  // Q7). One table for every extension's slice, namespaced by extension id
  // and keyed by extension id + key; values are JSON text. The core caps
  // a slice's bytes on write (PERSONAL_STORE_MAX_BYTES), so the table has
  // no size rule of its own. The D-13 purge clears it. Additive and
  // reversible: dropping the table undoes it.
  `
  CREATE TABLE IF NOT EXISTS plugin_kv (
    extension_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (extension_id, key)
  );
  `,
  // 34: the work shape a task was routed from, and the rule that decided
  // its tier (intelligence-bucket routing S2, captain-approved 2026-09-18).
  // `tasks.shape_json` holds the `WorkShape` the host computed at
  // commission - the Firstmate's facts (basis, premium ask, model
  // override) plus the host's kind and basis verdict - so a queued row
  // dispatches from the same shape it was commissioned with, and the
  // offline corpus finally has the input beside the outcome.
  // `routing_decisions.rule` is the table row that answered (R0-R8),
  // typed rather than read back out of the reasons prose.
  // `tasks.difficulty` keeps holding the tier, now computed instead of
  // judged, so gate refs, the exporters and the replay engine are
  // untouched. New databases already receive `shape_json` with the task
  // record; this adds it to databases that predate the shape. Additive and
  // reversible: dropping both columns undoes it.
  migrateWorkShape,
  // 35: the tier a routing decision was actually SERVED at
  // (intelligence-bucket routing S5). `bucket` records the slot the policy
  // asked for; when no model in it could serve, the ladder answers from a
  // weaker slot and only the reasons prose said so. The column records
  // that outcome as a typed fact, so the downgrade rate is a join rather
  // than a regex over English. Equal to `bucket` on a decision the ladder
  // served as asked, null on rows written before the column. Additive and
  // reversible: dropping the column undoes it.
  migrateRoutingServed,
  // 36: the repository's own delivery rigor (delivery rigor phase 3). Null
  // was historically treated as a derived value; migration 44 backfills it
  // to standard. A value is the standing answer the captain set
  // by talking (`configure_repo rigor`), read by `rigorFor` as `repoRigor`
  // in place of phase 2's repo-note convention. Additive and reversible:
  // dropping the column undoes it.
  migrateRepoRigor,
  // 37: the workspace KIND (`project` | `personal`), lifting the personal
  // workspace out of `delivery` where it had been a third posture. Delivery
  // says only where a change lands; a personal workspace lands nothing,
  // because a crewmate there builds in place. Existing `live` rows become
  // the personal kind on the local-only posture nobody reads. Additive and
  // reversible: dropping the column and restoring `live` undoes it.
  migrateRepoKind,
  // 38: the card thread (cards-as-threads phase 1, captain-approved
  // 2026-09-20). Every card is the head of a conversation between the
  // captain and the card's author: one row per message, with who wrote it
  // and when. The thread is durable and dies with its card, exactly as the
  // card's revisions do, so the D-13 purge and a task's own close need no
  // new rule. Additive and reversible: dropping the table undoes it.
  `
  CREATE TABLE IF NOT EXISTS card_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    who TEXT NOT NULL,
    text TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_card_messages_card ON card_messages (card_id, id);
  `,
  // 39: saved GPT-5.6 slot picks follow the GPT-6 rows the starter map now
  // names (captain, 2026-09-22). gpt-5.6-sol moves to gpt-6-sol,
  // gpt-5.6-terra and gpt-5.6-luna both move to gpt-6-luna, and each pick
  // keeps the slots the user chose. The old id stays in `seen` and the new
  // id is marked seen too, so a turned-off row is not seeded back on.
  // Astra is not in the map. No-op when the row names none of the three.
  // Reversible by the inverse map, except where terra and luna were unioned
  // onto one key.
  migrateGpt6Slots,
  // 40: where each project lives (git integration PR 1.1): the host kind
  // (`github | gitlab | bitbucket | git | none`) and host name, read from
  // the row's own `origin` through `forgeOf` - the same parser the forge
  // seam and the Firstmate's context read. Every backfilled value is logged
  // in `forge_backfill` beside the origin it came from, like migration 23's
  // hygiene log. Additive and reversible: dropping the two columns and the
  // log undoes it.
  migrateRepoForge,
  // 41: the pictures a card shows (card pictures, phase 2; captain's Q9 of
  // 2026-09-24): the host verifies every picture a body names, copies it
  // under the task, and records id, alt, size and group here as JSON - never
  // the bytes, which live in `crewmates/<taskId>/cards/`. Null on a card
  // that shows none, and on every card written before it. Additive and
  // reversible: dropping the column undoes it.
  (db) => addColumn(db, "cards", "pictures_json", "TEXT"),
  // 42: the published views of the record (plugin data surface, Phase B;
  // src/core/storage/views.ts is their one writer): the nine `v_*_v1`
  // views a plugin's read-only query may reach, and the indexes their joins
  // lean on. From here on every migration drops the views first and
  // re-creates them as its last step (`migrate` below), so a column a view
  // reads can still be dropped or renamed. Additive and reversible:
  // dropping the views and the three indexes undoes it.
  migratePublishedViews,
  // 43: the installed plugins (one plugin vehicle, Phase A; captain calls
  // A1a-A3a of 2026-09-24). One row per plugin the captain added from npm,
  // a git address or a folder: where it came from (`source` + the `spec`
  // he named), what it was pinned to (`pinned`: a version and its
  // integrity, a commit, or a content hash), its name and version, the
  // capabilities he CONSENTED to (JSON; the host serves these and never
  // what the files on disk ask for), and when it went in. `pending_json` is
  // a staged install or update waiting on his answer on the consent card;
  // a row whose `installed_at` is null was never added. Additive and
  // reversible: dropping the table undoes it.
  `
  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    source TEXT,
    spec TEXT,
    pinned TEXT,
    name TEXT,
    version TEXT,
    capabilities_json TEXT,
    installed_at INTEGER,
    updated_at INTEGER NOT NULL,
    pending_json TEXT
  );
  `,
  // 44: projects with no standing rigor now explicitly use standard. Keep
  // legacy nulls from silently behaving as an implicit default.
  (db) => db.exec("UPDATE repos SET rigor = 'standard' WHERE rigor IS NULL"),
  // 45: idle crew recovery (captain-approved 2026-09-26; docs/inbox.md and
  // docs/report-sort.md). The inbox gains the honest retry's state: a
  // provider-failed delivery counts in `failures` instead of spending an
  // attempt, `failing_since` is when that row first failed at the provider,
  // and `next_attempt_at` is when the row is next due - the backoff, or the
  // grace after a refused delivery - so `pending` reads one column instead
  // of a fixed grace. Rows already waiting keep today's spacing. The task
  // record gains the durable idle clock: `idle_since` (set at every idle
  // boundary, cleared when a turn starts), and the ladder's rung, wake
  // count and last action time; new databases already receive those four
  // with the task record. Additive and reversible: dropping the seven
  // columns undoes it.
  migrateIdleRecovery,
  // 46: the two graph gaps (primitives review P1). A task's basis verdict
  // is derived at every read (`TaskService.graph.basisHolds`), and the review a
  // builder's verdict came from is read off the parent edge
  // (`TaskService.graph.verdictReviewOf`), so the stamps that cached them leave
  // the record: `basis_verified` from the shape and `reviewTaskId` from the
  // delivery facts. Reversible: both are derived from what stays - the
  // basis task's state and the review's parent edge.
  `
  UPDATE tasks SET shape_json = json_remove(shape_json, '$.basis_verified')
    WHERE json_type(shape_json, '$.basis_verified') IS NOT NULL;
  UPDATE tasks SET delivery_json = json_remove(delivery_json, '$.reviewTaskId')
    WHERE json_type(delivery_json, '$.reviewTaskId') IS NOT NULL;
  `,
  // 47: the gate becomes a witness (the primitives review, P2): a round
  // cap is a hold on the gate that exists, so an active builder whose cap
  // stands unanswered - `ciCapAt` / `reviewCapAt` past any `capAnsweredAt` -
  // gets the `captain` gate the cap now places (ref the head it was reached
  // at). Only rows with no gate are touched. Additive and reversible: each
  // row is logged in `cap_gate_backfill`, so clearing the gate of every
  // logged row and dropping the log undoes it.
  migrateCapGates,
  // 48: the typed wake envelope (the primitives review, P3; docs/inbox.md
  // "The wake envelope"). An inbox payload is `{v, facts, ways}` or, for
  // prose, `{v, text}`, rendered once where it is served; every row already
  // queued is prose and is wrapped as `{v: 1, text}`. `content_hash` keeps
  // the hash of the text, so a wake queued or acked before the upgrade
  // still dedupes the same prose after it. No published view reads the
  // inbox. Reversible: setting each payload back to its `$.text` (a typed
  // row to its rendered prose) and restamping its hash undoes it.
  "UPDATE inbox SET payload = json_object('v', 1, 'text', payload);",
  // 49: a wake's durable once-identity (the primitives review, P3;
  // docs/inbox.md "The wake envelope"). A wake that goes out once per fact
  // - the honest retry's still-down wake once per outage, the job bound once
  // per job - names it, and `InboxStore.enqueueWake` records the name for
  // the wake's task here, in the transaction that queues the row. It
  // replaces two in-memory markers. No record that already exists holds
  // it: `inbox_acks` keeps one ack per lane for five minutes, the task
  // timeline is the captain's history, and the whose-turn ledger names no
  // fact and records no outage wake. Additive and reversible: dropping the
  // table undoes it.
  `
  CREATE TABLE inbox_once (
    ref TEXT NOT NULL,
    once_key TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (ref, once_key)
  );
  `,
  // 50: one decision ledger (the primitives review, P6; docs/decision-models.md
  // "The decision ledger"). `routing_decisions`, `account_decisions` and
  // `supervision_outcomes` become one `decisions` table with a `kind`
  // (`routing`, `account`, `sort`), written only by `DecisionStore`. Every
  // row moves: a sort row keeps its id, because the Firstmate's log and the
  // `decided` events name it; routing and account rows are numbered after
  // them in their own order. A rule-sorted row's `rule:<id>` stamp moves
  // from `model` to `rule`, where a routing row's rule already sits. A sort
  // row gains `facts_json`, the typed facts of the wake it recorded. The
  // three old names stay as read-only views over the table (views.ts), so
  // every reader - the published views, Observe, the exporters, the miss
  // deriver and the replay scorer - reads the same rows. Reversible:
  // re-creating the three tables from their kinds (the stamp back into
  // `model`) and dropping `decisions` undoes it.
  migrateDecisionLedger,
  // 51: the status a pushed plan-window reading carried (W1 S3; docs/quota.md
  // "Typed cut-offs"). Claude's session says whether a window still allows
  // work (`allowed`, `allowed_warning`) or refuses it (`rejected`), and that
  // word was dropped at the store. Nullable: a reading from before this
  // column has no status, which is unknown, never `allowed`. Rows written
  // before it also hold `resets_at` in epoch SECONDS (read now as ms), so a
  // reset is trusted only on a `rejected` reading, which is always new. No
  // published view reads the table. Additive and reversible: dropping the
  // column undoes it.
  `
  ALTER TABLE pushed_quota ADD COLUMN status TEXT;
  `,
  // 52: a card reaches the stage at its author's close-out (the captain's
  // "ship it" of 2026-09-27; docs/card-threads.md "When a card reaches the
  // stage"). `awaiting` is what a card off the stage waits on - `answer`
  // while the captain's reply is the newest line on its thread,
  // `close-out` while its author has written on it and not yet reported or
  // gone idle - so a hidden card stays hidden across a restart and the
  // boot knows which cards the restart itself closes out. Null on a card
  // the stage shows, and on every card written before it. No published
  // view reads the table. Additive and reversible: dropping the column
  // undoes it.
  (db) => addColumn(db, "cards", "awaiting", "TEXT"),
  // 53: the quiet ledger (FI3-152, direction A). `test_path` is the failing
  // test a filing names; the host refuses a second open row for the same
  // path. `captain_opened_at` is the seen mark: Charted counts crew-filed
  // rows the captain has not opened. `verdict` is the one line the
  // Firstmate records when leaving a filing planned. All nullable. No
  // published view reads them. Additive and reversible: dropping the
  // columns undoes it.
  (db) => {
    addColumn(db, "tasks", "test_path", "TEXT");
    addColumn(db, "tasks", "captain_opened_at", "INTEGER");
    addColumn(db, "tasks", "verdict", "TEXT");
  },
  // 54: the captain's answers to the questions a card body asks with its
  // own form (inline decisions, contract 4.22; docs/card-authoring.md
  // "Questions in the body"): the serialised form the footer click carried,
  // JSON, written when the click resolves the card. Null on every card
  // resolved without answers and on every card written before it. No
  // published view reads the table. Additive and reversible: dropping the
  // column undoes it.
  (db) => addColumn(db, "cards", "answers_json", "TEXT"),
  // 55: how wide a card is (the captain's Q5 to Q7 A of 2026-09-28;
  // docs/card-authoring.md "Card width"). `width` is `wide` or `full`, which
  // the host decides at emit from the body's facts and the author's hint;
  // null on a regular card and on every card written before it. The
  // captain's drag is the shell's and never lands here. No published view
  // reads the table. Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "cards", "width", "TEXT"),
  // 56: the model a card's author ran on, as the chip its chrome paints
  // beside the meta line (the captain's 1C, 2026-09-28). A crewmate's card
  // used to carry it inside `meta`; null on every card written before it,
  // which keeps its meta as it was. No published view reads the column.
  // Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "cards", "model", "TEXT"),
  // 57: the card evidence (the human-supervision capture; docs/card-evidence.md).
  // `card_observations` is append-only and written only by `CardStore`, in
  // the same transaction as the card or thread write it describes: the
  // offers a card showed, when each was on the stage, every action taken on
  // one, which thread line was about which offer, and how the card left.
  // `cards.lifecycle_id` / `offer_id` point at the card's current occurrence
  // and the exact version it carries, so a restart resumes both. Null on
  // every card written before it: a boot that finds such a card open seeds
  // it as a legacy snapshot whose start is unknown, and nothing older is
  // reconstructed here. `card_capture_epochs` records when each capture
  // version first ran, under a random namespace of this installation's own
  // (never an account, a path or a hash of either). A task's delete and the purge remove its evidence
  // with its cards. No published view reads either table. Additive and
  // reversible: dropping the tables and the two columns undoes it.
  (db) => {
    addColumn(db, "cards", "lifecycle_id", "TEXT");
    addColumn(db, "cards", "offer_id", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS card_observations (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        card_id TEXT NOT NULL,
        lifecycle_id TEXT NOT NULL,
        task_id TEXT,
        kind TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        capture_version INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        actor TEXT NOT NULL,
        source TEXT NOT NULL,
        offer_id TEXT,
        interaction_id TEXT,
        message_id INTEGER,
        build TEXT,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_card_observations_card
        ON card_observations (card_id, lifecycle_id, seq);
      CREATE INDEX IF NOT EXISTS idx_card_observations_task ON card_observations (task_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_card_observations_interaction
        ON card_observations (card_id, interaction_id) WHERE kind = 'action';
      CREATE TABLE IF NOT EXISTS card_capture_epochs (
        capture_version INTEGER PRIMARY KEY,
        activated_at INTEGER NOT NULL,
        build TEXT,
        namespace TEXT NOT NULL
      );
    `);
  },
  // 58: only profiles created under immediate-welcome behavior can be eligible.
  // Preserve legacy timestamps/cards; a missing legacy stamp is not a new install.
  (db, fresh) => {
    db.prepare(`INSERT INTO settings (key, value) VALUES ('first-run', ?)
      ON CONFLICT(key) DO UPDATE SET value = json_set(CASE WHEN json_valid(settings.value) THEN settings.value ELSE json_object('welcomedAt', NULL, 'firstTurnAt', NULL) END, '$.welcomeState', ?)`).run(
      JSON.stringify({
        welcomedAt: null,
        firstTurnAt: null,
        welcomeState: fresh ? "uninitialized" : "skipped",
      }),
      fresh ? "uninitialized" : "skipped",
    );
  },
  // 59: a reply sends its card to the back of the stack instead of off it
  // (the captain's "send the card to the back of the stack" of 2026-10-01;
  // docs/card-threads.md "When a card reaches the stage"). `sent_back_at`
  // is when the captain last replied under the card; the stack sorts a
  // stamped card after every unstamped one, oldest stamp first, and the
  // stamp outlives the author's answer so the card stays at the back across
  // a restart. Null on every card never replied under. No published view
  // reads the column. Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "cards", "sent_back_at", "INTEGER"),
  // 60: only captain-requested schedules may authorize asked app actions.
  // Legacy schedules have no proof of who requested them; default closed.
  (db) => addColumn(db, "schedules", "captain_requested", "INTEGER NOT NULL DEFAULT 0"),
  // 61: durable release tracking (docs/release-notes.md "Version tracking").
  // The one place a profile created after tracking began is told apart from
  // one that already had saved work, so the classification is recorded here,
  // once, and never guessed later. The baseline starts unknown. An existing
  // row is kept. Additive and reversible: deleting the `release-tracking`
  // settings row undoes it.
  (db, fresh) => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('release-tracking', ?) ON CONFLICT(key) DO NOTHING",
    ).run(
      JSON.stringify({
        schema: 1,
        profile: fresh ? "fresh" : "legacy",
        baseline: null,
        previous: null,
        deliveries: {},
        unresolved: [],
      }),
    );
  },
  // 62: the answer-delivery check's saved state, one set per captain message
  // (docs/task-capture.md "Answer delivery"). `delivery` is where the message
  // stands (`AskDelivery`); `delivery_facts` the actions that took effect and
  // the refused attempts after Firstmate read it (JSON); `notice_card_id` the
  // one notice raised for it. Every row that exists now is `legacy` and never
  // checked; the opener writes `pending` on the rows that follow. No published
  // view reads the columns. Additive and reversible: dropping the three
  // columns undoes it.
  (db) => {
    addColumn(db, "captain_asks", "delivery", "TEXT NOT NULL DEFAULT 'legacy'");
    addColumn(db, "captain_asks", "delivery_facts", "TEXT");
    addColumn(db, "captain_asks", "notice_card_id", "TEXT");
  },
  // 63: where a task's crewmate runs (multi-machine piece 8, FI3-687;
  // docs/helper.md "Holding a conversation"): the id of the paired computer
  // that runs work holding its conversation, or null for this Mac. Every row
  // that exists runs here, so nothing is backfilled. Written only by
  // `TaskService.placement.setDevice`. No published view reads the column. Additive
  // and reversible: dropping the column undoes it.
  (db) => addColumn(db, "tasks", "device_id", "TEXT"),
  // 64: where a project's tasks run (multi-machine piece 11, FI3-690;
  // docs/helper.md "Runs on"): the id of the paired computer that runs work
  // its next task starts on, or null for this Mac. Every project that exists
  // runs here, so nothing is backfilled. Written only by
  // `RepoRegistry.setRunsOn`. No published view reads the column. Additive
  // and reversible: dropping the column undoes it.
  (db) => addColumn(db, "repos", "runs_on", "TEXT"),
  // 65: the one live thing a card points at (docs/task-browser.md, "From a
  // card"): a crewmate's labeled door to its task's browser, as the JSON of
  // `LiveAttachment` - the label, the task, the run of task browsers and
  // which of the task's browsers it named. The host writes it at emit; null
  // on every other card and on every card written before it. No published
  // view reads the column. Additive and reversible: dropping the column
  // undoes it.
  (db) => addColumn(db, "cards", "attachment_json", "TEXT"),
  // 66: an honest usage ledger (the Usage tab, docs/usage.md). How a row
  // names its model (`model_source`: `served` when the provider said which
  // model answered, `requested` when it is the model the session asked
  // for), where its cost came from (`cost_source`: `listed-prices` or
  // `claude`), and the cost by token category where the session priced
  // each one apart. Every row that exists keeps null in all six: its model
  // is the one recorded then, which for Claude may sum several, and its
  // price source was not kept. `UsageStore.record` is the one writer. No
  // published view reads the columns. Additive and reversible: dropping
  // the six columns undoes it.
  (db) => {
    addColumn(db, "usage_events", "model_source", "TEXT");
    addColumn(db, "usage_events", "cost_source", "TEXT");
    addColumn(db, "usage_events", "cost_input", "REAL");
    addColumn(db, "usage_events", "cost_output", "REAL");
    addColumn(db, "usage_events", "cost_cache_read", "REAL");
    addColumn(db, "usage_events", "cost_cache_write", "REAL");
  },
  // 67: where a crewmate card's task runs (FI3-1019; docs/helper.md "A card
  // from there"), as the words its chrome paints right after the meta line
  // ("on Mac mini"), so a long task title gives way and the place never
  // does. A card from a placed task used to carry it inside `meta`; null on
  // every other card and on every card written before it, which keeps its
  // meta as it was. No published view reads the column. Additive and
  // reversible: dropping the column undoes it.
  (db) => addColumn(db, "cards", "place", "TEXT"),
  // 68: the Firstmate's reply line beside each captain message (FI3-1089's
  // plan; docs/composer.md "The last turn"), as JSON `{ text, problem? }`,
  // so the last turn above the input comes back after a relaunch. Null
  // until a turn that read the message ends, and on every row written
  // before it. Written only by `TaskService.capture.setAskReply`. No published view
  // reads the column. Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "captain_asks", "reply", "TEXT"),
  // 69: a merge card's risk assessment (FI3-1128; docs/card-authoring.md
  // "The risk chart"), as the JSON of `RiskAssessment` - the levels and
  // lines its crewmate declared, which the card's chrome draws as a radar. The host writes it at
  // emit; null on every other card and on every card written before it. No
  // published view reads the column. Additive and reversible: dropping the
  // column undoes it.
  (db) => addColumn(db, "cards", "risk_json", "TEXT"),
  // 70: a card that takes no reply (FI3-1164; docs/card-threads.md "A card
  // with no reply row"), as 0: its chrome draws no reply row and the core
  // refuses one, whoever its author is. The host writes it on the welcome
  // only; null on every other card and on every card written before it,
  // which take replies as their author allows. No published view reads the
  // column. Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "cards", "replies", "INTEGER"),
  // 71: whom a task's event concerns (FI3-1189's rule 1; docs/task-record.md
  // "Whom an event concerns"). An event is written once, on its own task;
  // each row here names one other task it concerns, how the event's task
  // stands to it (`relation`, from the typed links when it was written),
  // and the task it reached that one through, when a replacement carried
  // it (`via`). That task's Activity reads it as a row from the other task.
  // Written only by `TaskService`, in the transaction that writes the event.
  // No published view reads the table. Additive and reversible: dropping
  // the table undoes it.
  `
  CREATE TABLE task_event_concerns (
    event_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    via TEXT,
    PRIMARY KEY (event_id, task_id)
  );
  CREATE INDEX task_event_concerns_task ON task_event_concerns (task_id);
  `,
  // 72: each revision thread row's typed links and close-out state (FI3-1245).
  // Additive; legacy rows stay null. No published view reads it.
  (db) => addColumn(db, "card_messages", "revision_json", "TEXT"),
  // 73: remove whole keep-open actions from open cards and freeze pending
  // explain wakes as prose. Originals in keep_open_backfill undo the rewrite;
  // closed cards, revisions, action observations and steer events stay intact.
  retireKeepOpen,
  // 74: a turn a quit or crash cut (docs/inbox.md, "A turn a quit or crash
  // cut"). `cuts` counts the turns serving an inbox row that a quit or crash
  // cut short: the boot reset gives each one's attempt back and adds one
  // here, and a crewmate's replay says it is one. Every row that exists
  // starts at 0, so a row a quit left in flight before this build keeps the
  // attempt it spent. Written only by `InboxStore`. No published view reads
  // the column. Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "inbox", "cuts", "INTEGER NOT NULL DEFAULT 0"),
  // 75: a background job the app's own quit stopped (docs/architecture.md,
  // "Event-driven bash"). The quit marks each running job's row as it sends
  // the kill and leaves the row for the next boot, which names the job as
  // stopped; a row still 0 at boot was running when the app ended without
  // its quit, and its command may have run on. Every row that exists starts
  // at 0. Written only by `JobStore`. No published view reads the column.
  // Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "jobs", "stopped_by_quit", "INTEGER NOT NULL DEFAULT 0"),
  // 76: a confirmed manual start that did not begin (FI3-1478). JSON
  // `{ reason }` on the open row, so reopening the board or the record
  // keeps the reason. Null once the attempt is retried or resolved, and
  // on every row written before it. Written only by `TaskService`. No
  // published view reads the column. Additive and reversible: dropping
  // the column undoes it.
  (db) => addColumn(db, "tasks", "start_notice", "TEXT"),
  // 77: the author's generic reply/arrival continuity declaration (FI3-1466).
  // Null keeps existing cards unchanged; dropping the column reverses it.
  // No published view reads it.
  (db) => addColumn(db, "cards", "holds_place", "INTEGER"),
  // 78: Automation (docs/automation.md) - a schedule becomes a rule with a
  // name, a state, a revision and a history of fires. Existing rows keep
  // their id, prompt, due time and authority: the new columns default to
  // an enabled, unnamed first revision. A one-time rule is kept as
  // `completed` after it fires instead of being deleted. No published view
  // reads them; dropping the columns and the table reverses it.
  (db) => {
    addColumn(db, "schedules", "name", "TEXT");
    addColumn(db, "schedules", "state", "TEXT NOT NULL DEFAULT 'enabled'");
    addColumn(db, "schedules", "revision", "INTEGER NOT NULL DEFAULT 1");
    db.exec(`
      CREATE TABLE IF NOT EXISTS schedule_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        planned_at INTEGER NOT NULL,
        fired_at INTEGER NOT NULL,
        catch_up INTEGER NOT NULL DEFAULT 0,
        missed INTEGER NOT NULL DEFAULT 0,
        prompt TEXT NOT NULL,
        UNIQUE (schedule_id, revision, planned_at)
      );
    `);
  },
  // 79: Automation's calendars and projects (docs/automation.md) - a weekly
  // rule's weekdays, a daily or weekly rule's IANA time zone, and the
  // project a rule's prompt is about. Existing rows get none of them, so a
  // daily rule made before keeps following this computer's clock until
  // the captain picks a zone. No published view reads them; dropping the
  // columns reverses it.
  (db) => {
    addColumn(db, "schedules", "days", "TEXT");
    addColumn(db, "schedules", "time_zone", "TEXT");
    addColumn(db, "schedules", "project_id", "TEXT");
  },
  // 80: Automation's deliveries (docs/automation.md, "Deliveries") - each
  // run names the inbox row carrying it and where it stands (waiting,
  // handled, cancelled), when it settled, why it was recalled, and the
  // tasks and cards the turn that handled it touched. Runs recorded before
  // get none of them and read as sent. A rule may now be a `draft`, a value
  // of the existing `state` column. No published view reads them; dropping
  // the columns reverses it.
  (db) => {
    addColumn(db, "schedule_runs", "inbox_id", "INTEGER");
    addColumn(db, "schedule_runs", "delivery", "TEXT");
    addColumn(db, "schedule_runs", "settled_at", "INTEGER");
    addColumn(db, "schedule_runs", "cancel_reason", "TEXT");
    addColumn(db, "schedule_runs", "tasks", "TEXT");
    addColumn(db, "schedule_runs", "cards", "TEXT");
  },
  // 81: Knowledge owns standing directions. Startup carries active directions
  // and removes the former notes tables before starting any agents.
  // Earlier builds refuse this profile rather than reviving a notes writer.
  "SELECT 1;",
  // Required-action declarations on offered cards; null preserves historical unknowns.
  // Additive and reversible; no published view reads this column.
  (db) => addColumn(db, "cards", "required_actions_json", "TEXT"),
  // Thinking is an optional subset of output, not another billable category.
  (db) => addColumn(db, "usage_events", "reasoning", "INTEGER"),
  // Typed declarations and one bounded start commitment per task; no live history.
  (db) => {
    addColumn(db, "repos", "placement_requirements_json", "TEXT");
    addColumn(db, "tasks", "placement_json", "TEXT");
    db.exec(
      "UPDATE repos SET runs_on = 'automatic' WHERE kind = 'project' AND origin IS NOT NULL AND trim(origin) <> ''",
    );
    db.exec(
      "CREATE INDEX tasks_pending_placement ON tasks(id) WHERE json_extract(placement_json, '$.reservation') = 'pending'",
    );
  },
  // 85: a recorded wait holds the start, never the merge (INF-416 piece E).
  // Every blocks edge already in place keeps holding the close, so no hold
  // changes under an existing row. A new link holds the close only where
  // someone promised it.
  (db) => {
    addColumn(db, "task_links", "holds_merge", "INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE task_links SET holds_merge = 1 WHERE type = 'blocks'");
  },
  // 86: protocol 9 publishes one reach reading; preserve saved placement words.
  (db) => {
    const rows = db
      .prepare("SELECT id, placement_json FROM tasks WHERE placement_json IS NOT NULL")
      .all() as { id: string; placement_json: string }[];
    const write = db.prepare("UPDATE tasks SET placement_json = ? WHERE id = ?");
    for (const row of rows) {
      const placement = JSON.parse(row.placement_json) as {
        snapshot?: { candidates?: Record<string, unknown>[] };
      };
      const candidates = placement.snapshot?.candidates;
      if (!Array.isArray(candidates)) continue;
      let changed = false;
      placement.snapshot!.candidates = candidates.map((candidate) => {
        if (!("connecting" in candidate)) return candidate;
        const { connecting, ...kept } = candidate;
        changed = true;
        return {
          ...kept,
          ...(connecting === true && kept.reach === undefined ? { reach: "connecting" } : {}),
        };
      });
      if (changed) write.run(JSON.stringify(placement), row.id);
    }
  },
  // 87: INF-63's validated review attribution. Null leaves existing cards unchanged.
  // CardStore is the only writer; no published view reads it. Drop the column to reverse.
  (db) => addColumn(db, "cards", "review_task_id", "TEXT"),

  // INF-476: presentation only; never changes card resolution or task gates.
  (db) => addColumn(db, "cards", "minimized", "INTEGER"),
  // 89: an Automation rule that fires on an integration's event
  // (docs/automation.md, "Events"): the integration and event it listens
  // for and its cursor there, and the events each run carried, by id.
  (db) => {
    addColumn(db, "schedules", "event_integration", "TEXT");
    addColumn(db, "schedules", "event_name", "TEXT");
    addColumn(db, "schedules", "event_cursor", "TEXT");
    addColumn(db, "schedule_runs", "events", "TEXT");
  },
  // INF-786: declared event filters survive a restart; null keeps older rules unchanged.
  (db) => addColumn(db, "schedules", "event_filter", "TEXT"),
  // INF-947: which connection an event rule's integration id stood for. Null
  // is a rule saved before, which waits until its integration is picked again.
  (db) => addColumn(db, "schedules", "event_connection", "TEXT"),
  // INF-1117: optional project scope; existing projects start empty.
  (db) => addColumn(db, "repos", "scope", "TEXT"),
  // INF-1226: a crewmate's declaration that the captain's choice on its card
  // is not its answer (`Card.continues`). Null keeps existing cards as they
  // were; CardStore is the only writer and no published view reads it.
  // Dropping the column reverses it.
  (db) => addColumn(db, "cards", "continues", "INTEGER"),
  // One durable association per task conversation (INF-1288).
  `CREATE TABLE task_sessions (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    conversation TEXT NOT NULL,
    resume_token TEXT NOT NULL,
    file TEXT NOT NULL,
    computer TEXT,
    device_id TEXT,
    provider TEXT,
    model TEXT,
    account_id TEXT,
    opened_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    began TEXT NOT NULL,
    PRIMARY KEY (task_id, conversation)
  );`,
  // The checked relationships a task names one of (INF-1296 piece 2,
  // docs/task-record.md "Relationships"): its basis, the task it branches
  // from and the attempt it retries leave the work shape for a row each.
  // The name moves exactly as the shape kept it, with the task it resolves
  // to now; who named it and when were never recorded, so they stay null.
  // An empty name named nothing, so it moves nowhere. None of them is a
  // dependency: the ready query never reads this table. TaskService is the
  // one writer. Reversible: write each `ref` back into its shape field and
  // drop the table.
  migrateTaskReferences,
  // INF-1348: the minute pass and its feed refresh should seek their rows,
  // not scan historical card bodies and every task event. Derived indexes
  // only; dropping them reverses this migration without changing saved data.
  addHousekeepingIndexes,
  // A task's running work leaves the task row for a row of its own
  // (INF-1296 piece 3, docs/task-record.md "A task's execution record"):
  // the resume token, the computer and account, the committed placement,
  // the idle clock and recovery rung, a start that did not begin, and the
  // current turn's declarations out of the delivery facts. Each value moves
  // as saved, and the resume token names its conversation only where
  // task_sessions records that conversation for the task, so a token from
  // before associations stays resumable without one made up. The row keeps
  // its columns, emptied. Reversible: write each value back to its column
  // and field and drop the table.
  migrateTaskExecution,
  // A task's policy inputs leave the work shape for a row of their own
  // (INF-1296 piece 3, docs/task-record.md "A task's policy record"): the
  // delivery, merging and care asked for at filing and the live edits since,
  // each as saved. A value of another type than its field declares stays in
  // the shape. The closed snapshot stays on the delivery facts. Reversible:
  // write each value back into its shape field and drop the table.
  migrateTaskPolicies,
  // A task's delivery facts leave the delivery column for two records of
  // their own (INF-1296 piece 4, docs/task-record.md "A task's change
  // evidence and permissions"): its change evidence - how it delivers, the
  // change, the version its readings were taken at, checks, reviews,
  // ledgers, validation, the story, risk and watches - and its permissions
  // and effects - the merge approval with its lineage and any attempt in
  // flight, completion offers, other reviewed pull requests, write asks,
  // required actions, the override, a refused card, the validation
  // permissions and a settle that has not run. Each value moves as saved;
  // the column keeps the closed policy snapshot and an older result copy,
  // and an unreadable delivery is left as saved. Nothing is sent, granted
  // or resumed here. Reversible: merge each row's fields back into the
  // column (the settle into its own) and drop the tables.
  migrateTaskDeliveryRecords,
  // INF-1296 piece 5: immutable specifications and owned shape records replace mixed columns.
  migrateTaskRecordRetirement,
  // INF-1610: an author's declaration that its card answers the captain's
  // message (`Card.answering`). Null keeps existing cards as they were;
  // CardStore is the only writer and no published view reads it. Dropping
  // the column reverses it.
  (db) => addColumn(db, "cards", "answering", "INTEGER"),
  // INF-1610 piece 2 (docs/task-capture.md "How a message ends"): each
  // captain message is followed until a card the captain accepts answers
  // it. `followed` marks the messages saved from now on - every existing
  // row stays null and is never asked about again; `continues` the earlier
  // message whose open work it joined; `answer_card_id` with `accepted_at`
  // the card they accepted, and `answered_at` when that became final;
  // `crewmate_asked_at` the one time its last crewmate was asked for the
  // answering card. No published view reads them. Dropping the six
  // columns reverses it.
  (db) => {
    addColumn(db, "captain_asks", "followed", "INTEGER");
    addColumn(db, "captain_asks", "continues", "TEXT");
    addColumn(db, "captain_asks", "answer_card_id", "TEXT");
    addColumn(db, "captain_asks", "accepted_at", "INTEGER");
    addColumn(db, "captain_asks", "answered_at", "INTEGER");
    addColumn(db, "captain_asks", "crewmate_asked_at", "INTEGER");
  },
  // INF-1670: who answers a reply under a card whose author cannot
  // (`Card.answeredBy`), as text: "firstmate" on the host's stuck alert.
  // Null keeps existing cards as they were; CardStore is the only writer and
  // no published view reads it. Dropping the column reverses it.
  addCardAnswerer,
  // INF-1482: the existing installer record distinguishes guidance from panels.
  // Existing rows remain panels; no published view reads it. Drop kind to reverse.
  addPluginKind,
  // Preserve existing continuing work while retiring its feature-specific kind.
  migrateOngoingWork,
  // INF-1868 piece 1: the host's typed change record, one change per open
  // task that carries one, read out of its delivery facts; the facts stay
  // where they were and every reader reads them there. Dropping the two
  // tables reverses it.
  migrateChanges,
  // INF-1876: the host holds nothing on a builder for its review, so the
  // `blocks` edge every host review carried onto its builder goes; the
  // parent edge stays the one join. Nothing reverses it: the edge was the
  // retired hold's own record.
  retireReviewEdges,
  // Incremental completed-operation observations; TaskService is the writer.
  REPETITION_TABLES,
  // INF-2062: when a started task went back to the backlog, on its running
  // work's row. Null on every existing row, which is not in the backlog.
  // Written only by `TaskService`. No published view reads the column.
  // Additive and reversible: dropping the column undoes it.
  (db) => addColumn(db, "task_execution", "backlog_since", "INTEGER"),
  // INF-2205 piece B: the panels the host stopped (docs/personal-panels.md,
  // "A stopped panel"), one row per stopped runtime, keyed by where the
  // panel came from, its id, live or draft, and the code version stopped,
  // with the incident that stopped it. `PanelStops` is the only writer; a
  // row stays until the captain's Retry or the panel's removal. No
  // published view reads it. Additive and reversible: dropping the table
  // undoes it.
  `
  CREATE TABLE IF NOT EXISTS panel_stops (
    source TEXT NOT NULL,
    panel_id TEXT NOT NULL,
    runtime TEXT NOT NULL,
    version TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    at TEXT NOT NULL,
    silent_ms INTEGER,
    termination TEXT NOT NULL,
    PRIMARY KEY (source, panel_id, runtime, version)
  );
  `,
  addCrewResponses,
  addCardContributions,
  // INF-2730: an interim line answers no captain message. Clears the
  // message an author's interim line named, read from the line's own
  // `message_ref` observation; every other line keeps what it answers.
  // Nothing reverses it: the cleared value was never a real answer.
  clearInterimAnswers,
  // INF-2796: the after-merge steps a merge card draws from its saved story.
  // Null on every existing card, which declared none. CardStore is the only
  // writer and no published view reads it. Dropping the column reverses it.
  addCardAfterMerge,
  // INF-2886: a project's queue facts (docs/forge.md, "A project's queue"):
  // the workflow files that mention its queue status as last read, and when
  // anything but the app last answered that status. Null on every existing
  // project, which nothing has read yet. `RepoRegistry.recordQueue` is the
  // only writer; no published view reads them. Dropping the columns reverses it.
  (db) => {
    addColumn(db, "repos", "queue_workflows_json", "TEXT");
    addColumn(db, "repos", "queue_answered_at", "INTEGER");
  },
  // INF-2885 direction B: a project's batched delivery chosen while nothing
  // in it answers the queue status waits, and this is when it was chosen
  // (docs/forge.md, "Choosing batched pull requests before a queue exists").
  // Null on every existing project, which chose nothing that waits.
  // `RepoRegistry` is the only writer; no published view reads it. Dropping
  // the column reverses it.
  (db) => addColumn(db, "repos", "queue_pending_at", "INTEGER"),
  // INF-2744: one merge effect. Every OPEN card's settle merge becomes a
  // merge of the task's current change that closes it, and its
  // `request_merge` a merge of that review that continues it
  // (`migrateLegacyActions`). Closed cards are history and untouched; a
  // reader still reads their older effects as the merge (`mergeEffectOf`).
  // Reversible: each rewritten card is recorded in `card_effect_backfill`
  // with its actions as they were.
  migrateOneMergeEffect,
  // INF-2952 piece 1: the shipped queue (docs/forge.md, "The shipped
  // queue"). A project's paused batch as this app last read it, and the
  // shipped queue's version the first mate was last told to offer, so each
  // offer is made once. Null on every existing project, which has read no
  // pause and been offered nothing. `RepoRegistry` is the only writer; no
  // published view reads them. Dropping the columns reverses it.
  (db) => {
    addColumn(db, "repos", "queue_pause_json", "TEXT");
    addColumn(db, "repos", "queue_offered", "INTEGER");
  },
  // INF-3071: a card its author ended while the captain had seen it stays
  // on the stack, marked ended, until the captain closes it. The ending as
  // the stack draws it (`CardEnded`), on the card's resolved row; null on
  // every existing card, which no stack keeps. A partial index finds them
  // at boot without walking the cards. `CardStore` is the only writer and
  // no published view reads it. Dropping the index and column reverses it.
  (db) => {
    addColumn(db, "cards", "ended_json", "TEXT");
    db.exec(
      "CREATE INDEX IF NOT EXISTS cards_ended ON cards(created_at) WHERE ended_json IS NOT NULL",
    );
  },
  // INF-3131: the per-task cost limit (docs/usage.md, "The cost limit"). A
  // limit set on one task or one project, and the holds a limit placed on
  // a task that passed it. Empty on every existing install, whose tasks
  // follow the app's own limit (settings). `CostLimitStore` is the only
  // writer; no published view reads them. Dropping the tables reverses it.
  `
  CREATE TABLE cost_limits (
    scope TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    limit_json TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (scope, owner_id)
  );
  CREATE TABLE cost_holds (
    task_id TEXT PRIMARY KEY,
    limit_usd REAL NOT NULL,
    spent_usd REAL NOT NULL,
    at INTEGER NOT NULL
  );
  `,
  // INF-3108 piece 1: the Not now, Keep and Dismiss buttons the 0.6.4
  // upgrade dropped come back on every open card still exactly as that
  // upgrade left it (`restoreCloseControls`). A card revised or closed
  // since is untouched. Reversible: each restored card's actions before it
  // are kept in `card_close_control_restore`.
  restoreCloseControls,
  addTaskPin,
  (db) => addColumn(db, "card_messages", "notes_json", "TEXT"),
  // Original captain captions stay separate from attachment decoration; old rows remain unknown.
  addOriginalCaptainText,
  // Unacknowledged queue eligibility removals remain effects on the approval record, including after close.
  // The expression seek and partial index read only those tasks, never all closed history.
  `CREATE INDEX task_permissions_queue_removals ON task_permissions (
    json_type(merge_authorization_json, '$.queueRemovals'), task_id
  ) WHERE json_valid(merge_authorization_json)
    AND json_type(merge_authorization_json, '$.queueRemovals') = 'array';`,
  // Contribution routing stores only project identities and the captain's destination choice.
  `ALTER TABLE repos ADD COLUMN contribution_json TEXT;`,
  // Keyboard presets (`keyboardPresets`).
  keyboardPresets,
  // A task-less feed line's fact beside its English (docs/i18n.md, "Saved facts"); older lines keep their words.
  (db) => addColumn(db, "activity_events", "said_json", "TEXT"),
  // A task lane stuck at its provider after the same refusal three times in a row.
  addProviderRefusals,
  addCardFiles,
  // INF-3846 piece 3: a put-off choice ("Not until…") the host keeps on the
  // closed card's row until an Automation rule raises the same card again
  // (`PutOffs`, docs/card-authoring.md "Not until"), and the rule names the
  // card it raises in `schedules.card_id` (docs/automation.md, "A rule that
  // shows a card"). Null on every existing card and rule. A partial index
  // finds the kept cards without walking them. `CardStore` and
  // `ScheduleStore` are the only writers and no published view reads
  // either. Dropping the index and both columns reverses it.
  (db) => {
    addColumn(db, "cards", "put_off_json", "TEXT");
    db.exec(
      "CREATE INDEX IF NOT EXISTS cards_put_off ON cards(created_at) WHERE put_off_json IS NOT NULL",
    );
    addColumn(db, "schedules", "card_id", "TEXT");
  },
  // INF-3898 piece 2 (docs/axi-commands.md, "Infinitary from your terminal"):
  // the captain's own command marks what it says and chooses, as it marks
  // task events. A message, a thread line and a card's choice record
  // `command` when `infinitary-axi` sent them; every older row and every
  // window click stays null, unmarked. Their stores are the only writers.
  // Dropping the three columns reverses it.
  (db) => {
    addColumn(db, "captain_asks", "through", "TEXT");
    addColumn(db, "card_messages", "through", "TEXT");
    addColumn(db, "cards", "resolved_through", "TEXT");
  },
  // What an automation's run found: the closing words of the first mate's
  // turn that handled it (docs/automation.md, "History and retention").
  // Null is a run handled before runs kept them, or one not handled.
  (db) => addColumn(db, "schedule_runs", "found", "TEXT"),
  // What an event rule waits for, in words (docs/automation.md, "The event
  // screen"). Null keeps every existing rule unscreened; `ScheduleStore` is
  // the only writer and no published view reads it. Dropping the column
  // reverses it.
  (db) => addColumn(db, "schedules", "event_waits_for", "TEXT"),
  // INF-3759 piece 1: batches of your own (docs/forge.md, "Batches of your
  // own"). A project's line of approved changes and its one open batch, as
  // this home keeps them. Null on every existing project, which has neither.
  // `RepoRegistry.recordBatch` is the only writer, for `Batches`; no
  // published view reads it. Dropping the column reverses it.
  `ALTER TABLE repos ADD COLUMN batch_json TEXT;`,
  // INF-4104 piece 1 (docs/quota.md, "Credits past the allowance"): what a
  // pushed Claude reading said about extra usage beside its plan window -
  // `overage_status` (`allowed`, `allowed_warning`, `rejected`), the
  // client's `overage_reason` code when it cannot answer, and
  // `using_overage` (1 or 0) when the session is answering on it. Null on
  // every older reading, which said nothing about extra usage: unknown,
  // never off. `PushedQuotaStore` is the only writer and no published view
  // reads the table. Dropping the three columns reverses it.
  (db) => {
    addColumn(db, "pushed_quota", "overage_status", "TEXT");
    addColumn(db, "pushed_quota", "overage_reason", "TEXT");
    addColumn(db, "pushed_quota", "using_overage", "INTEGER");
  },
  // INF-4220 piece 1 (primitives/projects-and-working-copies.md): each
  // repository names the one project it belongs to, so a project can hold
  // several. Filled from the project each repository was made with
  // (`projects.repo_id`), which stays as that first repository and is no
  // longer read for membership. `RepoRegistry` is the only writer; no
  // published view reads it. Dropping the index and the column reverses it.
  (db) => {
    addColumn(db, "repos", "project_id", "TEXT");
    db.exec(`
      UPDATE repos SET project_id = (SELECT id FROM projects WHERE projects.repo_id = repos.id);
      CREATE INDEX repos_project ON repos (project_id);
    `);
  },
  // INF-2114 (docs/forge.md, "A project with no checks"): the record that a
  // project runs no pull request checks, as JSON (`noChecksRecordSchema`),
  // shown as Require pull request checks off in Settings → Projects. Null on
  // every existing project, whose checks hold its merges as before.
  // `RepoRegistry` is the only writer; no published view reads it. Dropping
  // the column reverses it.
  (db) => addColumn(db, "repos", "no_checks_json", "TEXT"),
  // A rule's notes (docs/automation.md, "A rule's notes"): one page per
  // automation rule, every version kept, written by the crewmates its runs
  // start and by the captain in Settings. Empty on every existing install.
  // `ScheduleStore` is the only writer, for `Scheduler`; no published view
  // reads it. Dropping the table reverses it.
  `
  CREATE TABLE schedule_notes (
    schedule_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    at INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    by TEXT NOT NULL,
    task_id TEXT,
    PRIMARY KEY (schedule_id, version)
  );
  `,
  // The batch gap (docs/forge.md, "The batch gap"): the least time in
  // minutes from one of a batched project's batches starting to the next,
  // set in Settings → Projects or by the first mate. Null on every existing
  // project, whose batches start as soon as a change is approved, as before.
  // `RepoRegistry` is the only writer; no published view reads it. Dropping
  // the column reverses it.
  (db) => addColumn(db, "repos", "batch_gap_minutes", "INTEGER"),
  // Why a level's gate holds a premium ask or a stronger-model retry that no
  // allowance reset can start (`TaskGate.cause`, docs/routing.md
  // "Pictures"): no model placed at the level, or none there reads the
  // pictures the task carries. Null on every existing row, which waits for
  // allowance as before. `TaskService` is the only writer; no published view
  // reads it. Dropping the column reverses it.
  (db) => addColumn(db, "tasks", "gate_cause", "TEXT"),
  migrateAlwaysRoute,
  // INF-5005 (docs/fleet.md, "Moving a repository to another project"): the
  // project a removed project was combined into, when a move of its
  // repositories emptied it, so its reserved key's refusal names that
  // project whatever moves later. Null on every existing project, removed or
  // not. `ProjectStore` is the only writer; no published view reads it.
  // Dropping the column reverses it.
  (db) => addColumn(db, "projects", "combined_into", "TEXT"),
  // INF-5145 part 2 (docs/automation.md, "A rule that ends a hold"): the
  // started task whose hold a one-run event rule ends, in
  // `schedules.task_id`, mirroring `card_id`. Null on every existing rule,
  // which runs as before. A partial index finds a task's rules without
  // walking every rule. `ScheduleStore` is the only writer; no published
  // view reads it. Dropping the index and the column reverses it.
  (db) => {
    addColumn(db, "schedules", "task_id", "TEXT");
    db.exec(
      "CREATE INDEX IF NOT EXISTS schedules_task ON schedules(task_id) WHERE task_id IS NOT NULL",
    );
  },
  // INF-5446 (docs/card-authoring.md, "Unsent picks follow you"): each open
  // card's unsent draft, one row per part - a body question's answer
  // (`answer:<name>`), the words in the card's own field (`words`) or its
  // queued notes (`notes`) - with the draft revision that last changed it.
  // Empty on every existing install. `CardDrafts` is the only writer; no
  // agent, published view or export reads it. The two triggers delete a
  // card's draft in the same write that resolves or removes the card.
  // Dropping the triggers and the table reverses it.
  // i18n-exempt: SQL, never shown
  `
  CREATE TABLE IF NOT EXISTS card_drafts (
    card_id TEXT NOT NULL,
    part TEXT NOT NULL,
    value_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    PRIMARY KEY (card_id, part)
  ) WITHOUT ROWID;
  CREATE TRIGGER IF NOT EXISTS card_drafts_resolved AFTER UPDATE OF resolved_at ON cards
    WHEN NEW.resolved_at IS NOT NULL
    BEGIN DELETE FROM card_drafts WHERE card_id = NEW.id; END;
  CREATE TRIGGER IF NOT EXISTS card_drafts_removed AFTER DELETE ON cards
    BEGIN DELETE FROM card_drafts WHERE card_id = OLD.id; END;
  `,
  // A crewmate card's declared live reads and views (`addCardLiveReads`).
  addCardLiveReads,
  // What the captain agreed each panel of an added runbook may do, by its
  // folder (docs/runbooks.md, "Panels"), from the runbook's own add card.
  // Null on every existing row: an added runbook's panels show nothing until
  // the runbook is added again and its card asks. `PluginRecords` is the only
  // writer; no published view reads it. Dropping the column reverses it.
  (db) => addColumn(db, "plugins", "panels_json", "TEXT"),
  // INF-5578 finding 4 (docs/report-sort.md, "Holding a started task until
  // a time"): the app update a started task's hold also ends on - the
  // computer, the version it ran when held, and the version named - as JSON
  // (`TaskGate.update`). Null on every existing row, whose hold ends as
  // before. `TaskService` is the only writer; no published view reads it.
  // Dropping the column reverses it.
  (db) => addColumn(db, "tasks", "gate_update_json", "TEXT"),
  // INF-6115 piece 2: one thread per message (`ASK_THREAD_CARRIES`).
  ASK_THREAD_CARRIES,
];

/**
 * INF-3127 piece 1: when the captain pinned a task to the top of Tasks.
 * Null on every existing row, which is not pinned. `TaskService` is the
 * only writer; no published view reads it. The partial index lets the
 * board read the few pinned rows without walking a long record. Dropping
 * the index and the column reverses it.
 */
export function addTaskPin(db: AppDatabase): void {
  addColumn(db, "tasks", "pinned_at", "INTEGER");
  db.exec(
    "CREATE INDEX IF NOT EXISTS tasks_pinned ON tasks(pinned_at) WHERE pinned_at IS NOT NULL",
  );
}

export function addPluginKind(db: AppDatabase): void {
  addColumn(db, "plugins", "kind", "TEXT NOT NULL DEFAULT 'panel'");
}

export function addHousekeepingIndexes(db: AppDatabase): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS cards_task_id ON cards(task_id);
    CREATE INDEX IF NOT EXISTS task_events_feed ON task_events(at DESC, id DESC) WHERE feed = 1;
  `);
}

function migrateRepoForge(db: AppDatabase): void {
  addColumn(db, "repos", "forge_kind", "TEXT");
  addColumn(db, "repos", "forge_host", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS forge_backfill (
      repo_id TEXT PRIMARY KEY,
      origin TEXT,
      forge_kind TEXT NOT NULL,
      forge_host TEXT,
      migrated_at INTEGER NOT NULL
    );
  `);
  const rows = db.prepare("SELECT id, origin FROM repos WHERE forge_kind IS NULL").all() as {
    id: string;
    origin: string | null;
  }[];
  const stamp = db.prepare("UPDATE repos SET forge_kind = ?, forge_host = ? WHERE id = ?");
  const log = db.prepare(
    "INSERT OR REPLACE INTO forge_backfill (repo_id, origin, forge_kind, forge_host, migrated_at) VALUES (?, ?, ?, ?, ?)",
  );
  const now = Date.now();
  for (const row of rows) {
    const where = forgeOf(row.origin);
    stamp.run(where.kind, where.host, row.id);
    log.run(row.id, row.origin, where.kind, where.host, now);
  }
}

function migrateWorkShape(db: AppDatabase): void {
  addColumn(db, "tasks", "shape_json", "TEXT");
  addColumn(db, "routing_decisions", "rule", "TEXT");
}

function migrateRoutingServed(db: AppDatabase): void {
  addColumn(db, "routing_decisions", "served", "TEXT");
}

function migrateDecisionLedger(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      task_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      rule TEXT,
      reasons_json TEXT,
      provider TEXT,
      model TEXT,
      bucket TEXT,
      served TEXT,
      account_id TEXT,
      wake TEXT,
      facts_json TEXT,
      wake_kind TEXT,
      verdict TEXT,
      summary TEXT,
      card_id TEXT,
      prompt_sha TEXT,
      tools_sha TEXT,
      steered INTEGER,
      missed_escalation INTEGER,
      missed_note TEXT,
      missed_at INTEGER
    );
    INSERT INTO decisions
      (id, kind, task_id, at, rule, model, wake, wake_kind, verdict, summary, card_id,
       prompt_sha, tools_sha, steered, missed_escalation, missed_note, missed_at)
      SELECT id, 'sort', task_id, at,
        CASE WHEN substr(model, 1, 5) = 'rule:' THEN substr(model, 6) END,
        CASE WHEN substr(model, 1, 5) = 'rule:' THEN NULL ELSE model END,
        wake, wake_kind, verdict, summary, card_id,
        prompt_sha, tools_sha, steered, missed_escalation, missed_note, missed_at
      FROM supervision_outcomes ORDER BY id;
    INSERT INTO decisions (kind, task_id, at, rule, reasons_json, provider, model, bucket, served)
      SELECT 'routing', task_id, at, rule, reasons_json, provider, model, bucket, served
      FROM routing_decisions ORDER BY id;
    INSERT INTO decisions (kind, task_id, at, reasons_json, provider, account_id)
      SELECT 'account', task_id, at, reasons_json, provider, account_id
      FROM account_decisions ORDER BY id;
    DROP TABLE supervision_outcomes;
    DROP TABLE routing_decisions;
    DROP TABLE account_decisions;
    CREATE INDEX decisions_kind_task ON decisions (kind, task_id, at);
  `);
}

function migrateRepoRigor(db: AppDatabase): void {
  addColumn(db, "repos", "rigor", "TEXT");
}

function migrateRepoKind(db: AppDatabase): void {
  addColumn(db, "repos", "kind", "TEXT NOT NULL DEFAULT 'project'");
  db.exec("UPDATE repos SET kind = 'personal', delivery = 'local-only' WHERE delivery = 'live'");
}
