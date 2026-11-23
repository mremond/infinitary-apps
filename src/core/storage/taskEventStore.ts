import type { AppDatabase } from "./db";
import { feedGroups } from "./feedProjection";
import { prepared } from "./statements";
import { COMPACTION_CANDIDATE } from "./taskEventCompaction";
import { taskReadTable } from "./taskRecordFields";

/**
 * The per-task timeline (task-system design section 4.4): every state
 * change commits with the event that explains it, in the same transaction.
 * `text` is the timeline line; `feed = 0` keeps a crewmate's own notes out
 * of the global feed, which reads this table since P3
 * (src/core/tasks/taskFeed.ts authors the feed line from event and record).
 */

export type TaskEventActor = "captain" | "firstmate" | "crewmate" | "supervisor" | "host";

export type TaskEventKind =
  | "created"
  | "ask"
  | "answered"
  | "briefed"
  | "dispatched"
  | "steered"
  | "progress"
  | "report"
  | "failed"
  | "card_raised"
  | "card_resolved"
  | "status"
  | "linked"
  | "unlinked"
  | "moved"
  | "pr_opened"
  | "ci"
  | "landed"
  | "merged"
  | "triaged"
  | "note"
  | "compacted"
  | "interrupted"
  | "decided"
  | "escalated"
  | "review"
  | "cap_reset"
  | "replied";

export type TaskEvent = {
  id: number;
  /** Stable source identity; storage-local numeric ids may be remapped by import. */
  identity?: string;
  taskId: string;
  at: number;
  actor: TaskEventActor;
  kind: TaskEventKind;
  text: string;
  data: Record<string, unknown> | null;
  ref: string | null;
  feed: boolean;
};

export type InsertTaskEvent = Omit<TaskEvent, "id" | "data" | "ref" | "feed"> &
  Partial<Pick<TaskEvent, "data" | "ref" | "feed">> & {
    /** Private original input, never included in the published timeline event. */
    captainText?: string;
  };

/**
 * How an event's task stands to another task the event concerns, read from
 * the typed links when the event was written (docs/task-record.md, "Whom an
 * event concerns"): it is a `part` of that task, its `parent`, a `follow-up`
 * filed from it, its `origin`, a `blocker` it waits for, a `waiter` waiting
 * for it, its `replacement`, the task it `replaced`, work `built-on` it (the
 * event's task names it as its basis), or `related` to it.
 */
export const TASK_CONCERN_RELATIONS = [
  "part",
  "parent",
  "follow-up",
  "origin",
  "blocker",
  "waiter",
  "replacement",
  "replaced",
  "built-on",
  "related",
] as const;
export type TaskConcernRelation = (typeof TASK_CONCERN_RELATIONS)[number];

/** One other task an event concerns: `via`, the task a replacement carried it through. */
export type TaskConcern = { taskId: string; relation: TaskConcernRelation; via: string | null };

/** An event another task wrote, as a task it concerns reads it. */
export type ConcernedTaskEvent = TaskEvent & { relation: TaskConcernRelation; via: string | null };

type Row = {
  id: number;
  identity?: string | null;
  task_id: string;
  at: number;
  actor: TaskEventActor;
  kind: TaskEventKind;
  text: string;
  data_json: string | null;
  ref: string | null;
  feed: number;
};

/** The request ids an `ask` event's `requests` holds, read as JSON text. */
function requestIdsOf(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function fromRow(row: Row): TaskEvent {
  let data: Record<string, unknown> | null = null;
  if (row.data_json) {
    try {
      data = JSON.parse(row.data_json) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }
  return {
    id: row.id,
    identity: row.identity ?? `task-event:${encodeURIComponent(row.task_id)}:${row.id}`,
    taskId: row.task_id,
    at: row.at,
    actor: row.actor,
    kind: row.kind,
    text: row.text,
    data,
    ref: row.ref,
    feed: row.feed === 1,
  };
}

/** One owner's stable identity, never a hash of its words or its timestamp. */
export function timelineEventIdentity(
  event: Pick<TaskEvent, "id" | "taskId" | "identity">,
): string {
  return event.identity ?? `task-event:${encodeURIComponent(event.taskId)}:${event.id}`;
}

export class TaskEventStore {
  private identities: boolean | undefined;
  constructor(private readonly db: AppDatabase) {}

  private hasIdentities(): boolean {
    this.identities ??= (
      this.db.prepare("PRAGMA table_info(task_events)").all() as { name: string }[]
    ).some((column) => column.name === "identity");
    return this.identities;
  }

  byIdentity(identity: string): TaskEvent | undefined {
    if (this.hasIdentities()) {
      const row = this.db.prepare("SELECT * FROM task_events WHERE identity = ?").get(identity) as
        | Row
        | undefined;
      if (row) return fromRow(row);
    }
    const local = identity.match(/^task-event:(.+):(\d+)$/)?.[2];
    const event = local ? this.get(Number(local)) : undefined;
    return event && timelineEventIdentity(event) === identity ? event : undefined;
  }

  /** Original nearby task readings in recorded order, never a manufactured reply pair. */
  originalCaptainExchange(taskId: string): {
    preceding: { who: "captain" | "author"; text: string }[];
    unavailableContext: boolean;
  } {
    const captain = this.db
      .prepare(`SELECT id, captain_text FROM task_events
      WHERE task_id = ? AND kind = 'steered' AND actor = 'captain' ORDER BY id DESC LIMIT 1`)
      .get(taskId) as { id: number; captain_text: string | null } | undefined;
    const report = this.lastReports(taskId).at(-1);
    const entries: { id: number; who: "captain" | "author"; text: string }[] = [];
    if (captain?.captain_text !== undefined && captain.captain_text !== null)
      entries.push({ id: captain.id, who: "captain", text: captain.captain_text });
    if (report) entries.push({ id: report.id, who: "author", text: report.text });
    return {
      preceding: entries.sort((a, b) => a.id - b.id).map(({ who, text }) => ({ who, text })),
      unavailableContext: captain?.captain_text == null || !report,
    };
  }

  /** Read original captain input through its owner, not from redacted timeline text. */
  captainText(taskId: string, eventId: number): string | undefined {
    const row = this.db
      .prepare(
        "SELECT captain_text FROM task_events WHERE id = ? AND task_id = ? AND actor = 'captain'",
      )
      .get(eventId, taskId) as { captain_text: string | null } | undefined;
    return row?.captain_text ?? undefined;
  }

  insert(event: InsertTaskEvent): number {
    const original = event.actor === "captain" && event.captainText !== undefined;
    const result = this.db
      .prepare(
        `INSERT INTO task_events (task_id, at, actor, kind, text, data_json, ref, feed${original ? ", captain_text" : ""})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?${original ? ", ?" : ""})`,
      )
      .run(
        event.taskId,
        event.at,
        event.actor,
        event.kind,
        event.text,
        event.data ? JSON.stringify(event.data) : null,
        event.ref ?? null,
        (event.feed ?? true) ? 1 : 0,
        ...(original ? [event.captainText] : []),
      );
    const id = Number(result.lastInsertRowid);
    if (this.hasIdentities())
      this.db
        .prepare("UPDATE task_events SET identity = ? WHERE id = ?")
        .run(event.identity ?? timelineEventIdentity({ ...event, id }), id);
    return id;
  }

  /** The other tasks an event concerns, written with it (migration 71). */
  insertConcerns(eventId: number, concerns: readonly TaskConcern[]): void {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO task_event_concerns (event_id, task_id, relation, via) VALUES (?, ?, ?, ?)",
    );
    for (const concern of concerns) {
      insert.run(eventId, concern.taskId, concern.relation, concern.via);
    }
  }

  /** Every event of other tasks that concerns this one, in timeline order. */
  listConcerning(taskId: string): ConcernedTaskEvent[] {
    const rows = this.db
      .prepare(
        `SELECT e.*, c.relation AS relation, c.via AS via FROM task_event_concerns c
         JOIN task_events e ON e.id = c.event_id
         WHERE c.task_id = ? ORDER BY e.at, e.id`,
      )
      .all(taskId) as (Row & { relation: TaskConcernRelation; via: string | null })[];
    return rows.map((row) => ({ ...fromRow(row), relation: row.relation, via: row.via }));
  }

  /** Every concern row, oldest event first (the task export carries them). */
  listAllConcerns(): (TaskConcern & { eventId: number })[] {
    const rows = this.db
      .prepare(
        "SELECT event_id, task_id, relation, via FROM task_event_concerns ORDER BY event_id, task_id",
      )
      .all() as {
      event_id: number;
      task_id: string;
      relation: TaskConcernRelation;
      via: string | null;
    }[];
    return rows.map((row) => ({
      eventId: row.event_id,
      taskId: row.task_id,
      relation: row.relation,
      via: row.via,
    }));
  }

  /** One event by its id, whatever its task; undefined once it is gone (compacted or erased). */
  get(id: number): TaskEvent | undefined {
    const row = this.db.prepare("SELECT * FROM task_events WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** The first real first-mate effect after a request, not its decided/read receipt. */
  firstFirstmateActAfter(taskId: string, since: number): number | undefined {
    const row = this.db
      .prepare(
        `SELECT at FROM task_events WHERE task_id = ? AND actor = 'firstmate'
       AND kind <> 'decided' AND at > ? ORDER BY at, id LIMIT 1`,
      )
      .get(taskId, since) as { at: number } | undefined;
    return row?.at;
  }

  /** The report sorter reads only the report it just kept and its predecessor. */
  lastReports(taskId: string): TaskEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM task_events WHERE task_id = ? AND kind = 'report' ORDER BY at DESC, id DESC LIMIT 2",
      )
      .all(taskId) as Row[];
    return rows.reverse().map(fromRow);
  }

  /**
   * Ask attribution needs the attached task, its typed via and whether the
   * message is only tied to the task (`tie`, with the response requests it
   * asked there), not its whole timeline.
   */
  askAttributions(askIds: readonly string[]): {
    taskId: string;
    via: string | null;
    tie: boolean;
    carried: boolean;
    requests: string[];
  }[] {
    if (askIds.length === 0) return [];
    return (
      this.db
        .prepare(
          // i18n-exempt: SQL, never shown to a person
          `SELECT events.task_id AS taskId,
         CASE WHEN json_valid(events.data_json) THEN json_extract(events.data_json, '$.via') END AS via,
         CASE WHEN json_valid(events.data_json) THEN json_extract(events.data_json, '$.tie') END AS tie,
         CASE WHEN json_valid(events.data_json) THEN json_extract(events.data_json, '$.threadCarried') END AS carried,
         CASE WHEN json_valid(events.data_json) THEN json_extract(events.data_json, '$.requests') END AS requests
         FROM json_each(?) AS asks CROSS JOIN task_events AS events
         WHERE events.kind = 'ask' AND events.ref = asks.value
         ORDER BY CAST(asks.key AS INTEGER), events.id`,
        )
        .all(JSON.stringify(askIds)) as {
        taskId: string;
        via: unknown;
        tie: unknown;
        carried: unknown;
        requests: unknown;
      }[]
    ).map((row) => ({
      taskId: row.taskId,
      via: typeof row.via === "string" ? row.via : null,
      tie: row.tie === 1 || row.tie === true,
      carried: row.carried === 1 || row.carried === true,
      requests: requestIdsOf(row.requests),
    }));
  }

  /** The `ask` event that attached a message to a task, if one did. */
  askEvent(taskId: string, askId: string): TaskEvent | undefined {
    const row = this.db
      .prepare(
        // i18n-exempt: SQL, never shown to a person
        "SELECT * FROM task_events WHERE task_id = ? AND kind = 'ask' AND ref = ? ORDER BY id LIMIT 1",
      )
      .get(taskId, askId) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** A message's tie to a task becomes its work: the tie mark leaves its `ask` event. */
  clearAskTie(eventId: number): void {
    this.db
      .prepare(
        // i18n-exempt: SQL, never shown to a person
        `UPDATE task_events SET data_json = json_remove(data_json, '$.tie')
         WHERE id = ? AND kind = 'ask' AND json_valid(data_json)`,
      )
      .run(eventId);
  }

  /**
   * The one-time step to one thread per message kept this attachment as the
   * message's work (INF-6115): it counts as acted, whatever attached it first.
   */
  markAskCarried(eventId: number): void {
    this.db
      .prepare(
        // i18n-exempt: SQL, never shown to a person
        `UPDATE task_events SET data_json = json_set(data_json, '$.threadCarried', json('true'))
         WHERE id = ? AND kind = 'ask' AND json_valid(data_json)`,
      )
      .run(eventId);
  }

  /** A response request a message asked of the task its `ask` event names. */
  addAskRequest(eventId: number, requestId: string): void {
    this.db
      .prepare(
        // i18n-exempt: SQL, never shown to a person
        `UPDATE task_events SET data_json = json_set(data_json, '$.requests',
           json_insert(COALESCE(json_extract(data_json, '$.requests'), json('[]')), '$[#]', ?))
         WHERE id = ? AND kind = 'ask' AND json_valid(data_json)`,
      )
      .run(requestId, eventId);
  }

  /** The messages whose tie to a task asked it this response request. */
  requestAsks(taskId: string, requestId: string): string[] {
    return (
      this.db
        .prepare(
          // i18n-exempt: SQL, never shown to a person
          `SELECT events.ref AS ref FROM task_events AS events
         CROSS JOIN json_each(CASE WHEN json_valid(events.data_json)
           THEN COALESCE(json_extract(events.data_json, '$.requests'), '[]') ELSE '[]' END) AS asked
         WHERE events.task_id = ? AND events.kind = 'ask' AND events.ref IS NOT NULL
           AND asked.value = ?
         ORDER BY events.id`,
        )
        .all(taskId, requestId) as { ref: string }[]
    ).map((row) => row.ref);
  }

  /**
   * The messages attached to a task as its work, oldest first: a message
   * only tied to it (a question asked there, a refused change) is left out.
   */
  workAskRefs(taskId: string): string[] {
    return (
      this.db
        .prepare(
          // i18n-exempt: SQL, never shown to a person
          `SELECT ref FROM task_events WHERE task_id = ? AND kind = 'ask' AND ref IS NOT NULL
         AND NOT (json_valid(data_json) AND COALESCE(json_extract(data_json, '$.tie'), 0) = 1)
         ORDER BY at, id`,
        )
        .all(taskId) as { ref: string }[]
    ).map((row) => row.ref);
  }

  /** The graph's escalation endpoints, without decoding the retained event payload. */
  escalationRefs(taskId: string, side: "escalated_to" | "escalated_from"): string[] {
    return (
      this.db
        .prepare(
          `SELECT ref FROM task_events WHERE task_id = ? AND kind = 'escalated'
         AND ref <> ''
         AND CASE WHEN json_valid(data_json) THEN json_type(data_json, '$.' || ?) END = 'text'
         ORDER BY at, id`,
        )
        .all(taskId, side) as { ref: string }[]
    ).map((row) => row.ref);
  }

  /**
   * The roster needs the restart line, not the note's potentially large JSON
   * payload. It reads through the index of restart notes alone: left to
   * choose, SQLite seeks the task's notes by kind and tests every one of
   * them, so each running crew row's read grew with its own history
   * (INF-2341).
   */
  latestRestartObservation(taskId: string): Pick<TaskEvent, "at" | "text"> | undefined {
    return this.db
      .prepare(
        `SELECT at, text FROM task_events INDEXED BY task_events_restart_outcome
         WHERE task_id = ? AND kind = 'note'
         AND CASE WHEN json_valid(data_json) THEN json_type(data_json, '$.restartOutcome') END = 'object'
         ORDER BY at DESC, id DESC LIMIT 1`,
      )
      .get(taskId) as Pick<TaskEvent, "at" | "text"> | undefined;
  }

  /** Only unresolved close reports from this computer, not the closed history. */
  leftoverNotes(computerId: string | null): TaskEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM task_events INDEXED BY task_events_leftovers
       WHERE kind = 'note'
       AND CASE WHEN json_valid(data_json) THEN json_extract(data_json, '$.leftoversUnresolved') END = 1
       AND json_extract(data_json, '$.leftoversComputerId') IS ?
       ORDER BY at, id`,
      )
      .all(computerId) as Row[];
    return rows.map(fromRow);
  }

  /**
   * Marks one close report resolved once the computer's list shows its task
   * keeps nothing there any more; it leaves the leftovers index.
   */
  resolveLeftovers(eventId: number): void {
    this.db
      .prepare(
        `UPDATE task_events SET data_json = json_set(data_json, '$.leftoversUnresolved', json('false'))
         WHERE id = ? AND kind = 'note' AND json_valid(data_json)`,
      )
      .run(eventId);
  }

  /** The newest event of `kind` on a task whose data holds an object under `key`. */
  latestWithObject(taskId: string, kind: TaskEventKind, key: string): TaskEvent | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM task_events WHERE task_id = ? AND kind = ?
         AND CASE WHEN json_valid(data_json) THEN json_type(data_json, '$.' || ?) END = 'object'
         ORDER BY at DESC, id DESC LIMIT 1`,
      )
      .get(taskId, kind, key) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  /**
   * Whether one of the task's notes holds `value` under `key` in its data.
   * It seeks the task's notes by kind and tests their data in SQLite, so
   * none of the task's history is decoded: the pass over closed tasks'
   * temporary folders asks it of every closed task it could not clear,
   * and reading each one's whole timeline held the main thread for over a
   * second after a start (INF-5047).
   */
  hasNoteWith(taskId: string, key: string, value: string | number): boolean {
    return (
      prepared(
        this.db,
        `SELECT 1 FROM task_events WHERE task_id = ? AND kind = 'note'
         AND CASE WHEN json_valid(data_json) THEN json_extract(data_json, '$.' || ?) END = ?
         LIMIT 1`,
      ).get(taskId, key, value) !== undefined
    );
  }

  /** The task whose newest event of `kind` carries `ref` (a card id → its task). */
  latestTaskForRef(kind: TaskEventKind, ref: string): string | undefined {
    const row = prepared(
      this.db,
      "SELECT task_id FROM task_events WHERE kind = ? AND ref = ? ORDER BY id DESC LIMIT 1",
    ).get(kind, ref) as { task_id: string } | undefined;
    return row?.task_id;
  }

  /** Every task with an event of `kind` carrying `ref` (a message id → the tasks it attached to). */
  taskIdsWithRef(kind: TaskEventKind, ref: string): string[] {
    // Every card in a snapshot reads its message's reach here (INF-4464).
    const rows = prepared(
      this.db,
      "SELECT DISTINCT task_id FROM task_events WHERE kind = ? AND ref = ?",
    ).all(kind, ref) as { task_id: string }[];
    return rows.map((row) => row.task_id);
  }

  /**
   * Each task a stronger-model move replaced, with the task that carries its
   * work on (`escalated_to` on the task's newest `escalated` row). It seeks the
   * `escalated` rows by kind and ref (`task_events_ref`), so the work grows
   * with the record's stronger-model moves, never with any task's history:
   * the board asks it for every dropped row it shows (INF-2070).
   */
  escalatedTo(): Map<string, string> {
    const rows = this.db
      .prepare(
        `SELECT task_id, json_extract(data_json, '$.escalated_to') AS successor FROM task_events
         WHERE kind = ? AND ref IS NOT NULL
         AND CASE WHEN json_valid(data_json) THEN json_type(data_json, '$.escalated_to') END = 'text'
         ORDER BY at, id`,
      )
      .all("escalated") as { task_id: string; successor: string }[];
    // Oldest first, so a task's newest move is the one kept.
    return new Map(rows.map((row) => [row.task_id, row.successor]));
  }

  /** The refs of a task's events of `kind`, oldest first. */
  refsOf(taskId: string, kind: TaskEventKind): string[] {
    const rows = this.db
      .prepare(
        "SELECT ref FROM task_events WHERE task_id = ? AND kind = ? AND ref IS NOT NULL ORDER BY at, id",
      )
      .all(taskId, kind) as { ref: string }[];
    return rows.map((row) => row.ref);
  }

  /** The ref of a task's oldest event of `kind` that names one, if it has one. */
  oldestRef(taskId: string, kind: TaskEventKind): string | undefined {
    const row = this.db
      .prepare(
        "SELECT ref FROM task_events WHERE task_id = ? AND kind = ? AND ref IS NOT NULL ORDER BY at, id LIMIT 1",
      )
      .get(taskId, kind) as { ref: string } | undefined;
    return row?.ref;
  }

  /** A task's newest event of `kind`, if it has one. */
  latestOfKind(taskId: string, kind: TaskEventKind): TaskEvent | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM task_events WHERE task_id = ? AND kind = ? ORDER BY at DESC, id DESC LIMIT 1",
      )
      .get(taskId, kind) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  /**
   * A task's newest line that stopped or started it (INF-3846 piece 2): a
   * note whose data moves it into or out of the backlog, sets its start
   * policy (a board move's `startPolicy`, or an edit's `changes.startPolicy`)
   * or declares a stop the captain asked for (`captainStop`), or the status
   * line of a failed start that put it back on request (`startPolicy`).
   */
  latestStopLine(taskId: string): TaskEvent | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM task_events WHERE task_id = ? AND kind IN ('note', 'status')
         AND CASE WHEN json_valid(data_json) THEN
           json_type(data_json, '$.backlog') IS NOT NULL
           OR json_type(data_json, '$.startPolicy') IS NOT NULL
           OR json_type(data_json, '$.changes.startPolicy') IS NOT NULL
           OR json_type(data_json, '$.captainStop') IS NOT NULL
         END
         ORDER BY at DESC, id DESC LIMIT 1`,
      )
      .get(taskId) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** When a task's newest event of `kind` naming `ref` happened, if it has one. */
  latestAtForRef(taskId: string, kind: TaskEventKind, ref: string): number | undefined {
    const row = this.db
      .prepare("SELECT MAX(at) AS at FROM task_events WHERE task_id = ? AND kind = ? AND ref = ?")
      .get(taskId, kind, ref) as { at: number | null } | undefined;
    return row?.at ?? undefined;
  }

  /**
   * What the `linked` line of the `type` link from `fromId` to `toId` saved
   * under `filed`: whether the write that linked it filed `fromId` too
   * (`TaskGraph.linkMergeStep`), or undefined for a line that saved neither.
   * The line sits on `toId` and names `fromId` as its ref.
   */
  linkFiled(toId: string, fromId: string, type: string): boolean | undefined {
    const row = prepared(
      this.db,
      // i18n-exempt: SQL, never shown to a person
      `SELECT json_type(data_json, '$.filed') AS filed FROM task_events
       WHERE task_id = ? AND kind = 'linked' AND ref = ?
       AND CASE WHEN json_valid(data_json) THEN json_extract(data_json, '$.type') END = ?
       ORDER BY at DESC, id DESC LIMIT 1`,
    ).get(toId, fromId, type) as { filed: string | null } | undefined;
    return row?.filed === "true" ? true : row?.filed === "false" ? false : undefined;
  }

  /** When a task's newest event of `kind` naming any ref but `ref` happened, if it has one. */
  latestAtOtherRef(taskId: string, kind: TaskEventKind, ref: string): number | undefined {
    const row = this.db
      .prepare(
        "SELECT MAX(at) AS at FROM task_events WHERE task_id = ? AND kind = ? AND (ref IS NULL OR ref != ?)",
      )
      .get(taskId, kind, ref) as { at: number | null } | undefined;
    return row?.at ?? undefined;
  }

  /** When a task's newest event of `kind` happened, if it has one. */
  latestAt(taskId: string, kind: TaskEventKind): number | undefined {
    const row = this.db
      .prepare("SELECT MAX(at) AS at FROM task_events WHERE task_id = ? AND kind = ?")
      .get(taskId, kind) as { at: number | null } | undefined;
    return row?.at ?? undefined;
  }

  /** The inbox rows the supervisor's own steers (the idle ladder's nudges) rode on a task. */
  ladderSteerRows(taskId: string): number[] {
    const rows = this.db
      .prepare(
        `SELECT json_extract(data_json, '$.inboxId') AS row FROM task_events
         WHERE task_id = ? AND kind = 'steered' AND actor = 'supervisor'`,
      )
      .all(taskId) as { row: number | null }[];
    return rows.flatMap((entry) => (typeof entry.row === "number" ? [entry.row] : []));
  }

  // Compaction repeats these completed reads on every over-cap write.
  // Reuse their statements and SQLite row constructors, never their results.
  countFor(taskId: string): number {
    const row = prepared(this.db, "SELECT COUNT(*) AS n FROM task_events WHERE task_id = ?").get(
      taskId,
    ) as { n: number };
    return row.n;
  }

  countCompactable(taskId: string): number {
    const row = prepared(
      this.db,
      `SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND ${COMPACTABLE}`,
    ).get(taskId) as { n: number };
    return row.n;
  }

  /** The oldest `limit` compactable events of a task, in timeline order. */
  oldestCompactable(taskId: string, limit: number): TaskEvent[] {
    const rows = prepared(
      this.db,
      `SELECT * FROM task_events WHERE task_id = ? AND ${COMPACTABLE} ORDER BY at, id LIMIT ?`,
    ).all(taskId, limit) as Row[];
    return rows.map(fromRow);
  }

  /** Every compactable event at or before `at`, in timeline order. */
  compactableUpTo(taskId: string, at: number): TaskEvent[] {
    const rows = prepared(
      this.db,
      `SELECT * FROM task_events WHERE task_id = ? AND at <= ? AND ${COMPACTABLE} ORDER BY at, id`,
    ).all(taskId, at) as Row[];
    return rows.map(fromRow);
  }

  deleteIds(ids: readonly number[]): void {
    if (ids.length === 0) return;
    const marks = ids.map(() => "?").join(", ");
    this.db.prepare(`DELETE FROM task_event_concerns WHERE event_id IN (${marks})`).run(...ids);
    this.db.prepare(`DELETE FROM task_events WHERE id IN (${marks})`).run(...ids);
  }

  listFor(taskId: string): TaskEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY at, id")
      .all(taskId) as Row[];
    return rows.map(fromRow);
  }

  /**
   * A task's `ask` events and the `note` events that save an origin, oldest
   * first: all a card's origin walk reads (`originAbout`, INF-2326). The walk
   * runs for every open card on each first mate turn, and a task's other
   * events (its checks, progress and reports, most of its history) are never
   * decoded for it (INF-3412).
   */
  listOriginEvents(taskId: string): TaskEvent[] {
    const rows = prepared(
      this.db,
      `SELECT * FROM task_events WHERE task_id = ? AND (kind = 'ask' OR (kind = 'note'
         AND CASE WHEN json_valid(data_json) THEN json_type(data_json, '$.origin') END = 'object'))
       ORDER BY at, id`,
    ).all(taskId) as Row[];
    return rows.map(fromRow);
  }

  /**
   * Events of one kind newer than `since`, newest first, capped - the
   * contribution channel's backlog read (roadmap 1.4: the R2 `decided`
   * records not yet sent). `countByKindSince` is the whole backlog's size.
   */
  listByKindSince(kind: TaskEventKind, since: number, limit: number): TaskEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM task_events WHERE kind = ? AND at > ? ORDER BY at DESC, id DESC LIMIT ?",
      )
      .all(kind, since, limit) as Row[];
    return rows.map(fromRow);
  }

  /**
   * One actor's events whose `data.via` names `via`, at or after `since`,
   * newest first, across every task: the captain's task card clicks
   * (`TaskService.taskCardClicksSince`).
   */
  listByActorViaSince(actor: TaskEventActor, via: string, since: number): TaskEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM task_events
         WHERE at >= ? AND actor = ? AND json_extract(data_json, '$.via') = ?
         ORDER BY at DESC, id DESC`,
      )
      .all(since, actor, via) as Row[];
    return rows.map(fromRow);
  }

  countByKindSince(kind: TaskEventKind, since: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM task_events WHERE kind = ? AND at > ?")
      .get(kind, since) as { n: number };
    return row.n;
  }

  /**
   * The newest feed-worthy events, newest first. A program and its direct
   * parts share their latest event before the limit; every other event
   * stays separate. This is a read projection, never a timeline rewrite.
   */
  listFeed(limit: number): TaskEvent[] {
    // Today's record keeps the grouped view between reads and folds in only
    // what was written since (feedProjection.ts, INF-2971). An older schema,
    // read by migration tests and the offline scripts, groups on every read.
    if (taskReadTable(this.db) === "task_records")
      return feedGroups(this.db, limit).map((row) => fromRow(row as unknown as Row));
    const rows = this.db
      .prepare(`
        WITH grouped AS (
          SELECT e.*, CASE
            WHEN json_type(p.shape_json, '$.program') = 'object' THEN p.id
            WHEN json_type(t.shape_json, '$.program') = 'object' THEN t.id
          END AS program_id
          FROM task_events e
          JOIN tasks t ON t.id = e.task_id
          LEFT JOIN tasks p ON p.id = t.parent_id
          WHERE e.feed = 1
        ), ranked AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY program_id, CASE WHEN program_id IS NULL THEN id ELSE 0 END
            ORDER BY at DESC, id DESC
          ) AS position FROM grouped
        )
        SELECT * FROM ranked WHERE position = 1 ORDER BY at DESC, id DESC LIMIT ?
      `)
      .all(limit) as Row[];
    return rows.map(fromRow);
  }

  /** One task's timeline, and every concern its events name or other events name of it. */
  deleteFor(taskId: string): void {
    this.db
      .prepare(
        "DELETE FROM task_event_concerns WHERE task_id = ? OR event_id IN (SELECT id FROM task_events WHERE task_id = ?)",
      )
      .run(taskId, taskId);
    this.db.prepare("DELETE FROM task_events WHERE task_id = ?").run(taskId);
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM task_event_concerns").run();
    this.db.prepare("DELETE FROM task_events").run();
  }
}

// The partial index excludes provenance and replay journals before a read
// visits any payload. A candidate another task reads still stays verbatim.
const COMPACTABLE = `${COMPACTION_CANDIDATE}
  AND id NOT IN (SELECT event_id FROM task_event_concerns)`;
