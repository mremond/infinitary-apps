import { type AttachmentRef, attachmentRefSchema } from "@shared/attachments";
import { type LastTurn, type LastTurnReply, lastTurnReplySchema } from "@shared/lastTurn";
import { THROUGH_THE_COMMAND, type Through } from "@shared/through";
import {
  type AskDelivery,
  type DeliveryFacts,
  parseDeliveryFacts,
} from "../orchestrator/answerDelivery";
import type { MessageFile } from "../overflow";
import type { AppDatabase } from "./db";
import { prepared } from "./statements";

/**
 * The capture table (task-system design section 4.5, P1): one row per
 * captain turn, opened BEFORE the Firstmate turn runs and attached to a task
 * by the agent's own tool calls - or, failing that, by the host at turn end.
 * The invariant every ask carries once its turn closes: `taskId` is never
 * null (captain requirement 1, decision D1: attach to the work it is about
 * by default; a task of its own only when genuinely standalone).
 *
 * Raw SQL over the row shape only; every write goes through
 * `src/core/tasks/taskService.ts`, which pairs an attachment with the `ask`
 * event on the task in one transaction.
 */

/**
 * How an ask reached its task. `tool:<name>` is the agent's own attribution
 * (the quality signal); `host:fallback` is the floor the host guarantees;
 * `host:carried` is the one-time step that kept a message's thread whole
 * when the app moved to one thread per message (INF-6115).
 * The share of fallbacks is the attribution-quality metric to watch.
 */
export type AskAttachedVia = `tool:${string}` | "host:fallback" | "host:carried";

export type AskTurnState = "open" | "closed" | "failed";

export type AskImage = { mimeType: string };

export type AskRecord = {
  /** The turn id. */
  id: string;
  at: number;
  text: string;
  /** Attachment shapes only - never the bytes. */
  images: AskImage[];
  /**
   * The message's own copies of those pictures (`src/core/attachments.ts`),
   * in order: references only, never the bytes. Empty for a message an
   * older build saved, which kept the shapes alone.
   */
  attachments: AttachmentRef[];
  messageFiles?: MessageFile[];
  /** The task the open card or the panel pointed at when the turn began. */
  hintTaskId: string | null;
  /** The first task the ask attached to (further attachments are `ask` events). */
  taskId: string | null;
  attachedVia: AskAttachedVia | null;
  attachedAt: number | null;
  turnState: AskTurnState;
  /** Where the answer-delivery check has this message (`AskDelivery`). */
  delivery: AskDelivery;
  /** What took effect, and what was refused, after Firstmate read it. */
  deliveryFacts: DeliveryFacts;
  /** The one notice card raised for it, once it had no answer after its retry. */
  noticeCardId: string | null;
  /**
   * Whether the app follows this message to the card that answers it
   * (docs/task-capture.md "How a message ends"). False on every message
   * saved before that, which is never asked about again.
   */
  followed: boolean;
  /** The earlier message whose work this one joined, when it joined one still open. */
  continues: string | null;
  /** The card the captain accepted as the answer, and when, until it is final. */
  answerCardId: string | null;
  acceptedAt: number | null;
  /** When the message was answered; final, so the answer never moves. */
  answeredAt: number | null;
  /** When the crewmate whose task ended its work was asked once for the answering card. */
  crewmateAskedAt: number | null;
  /** Sent from the captain's own command, `infinitary-axi`; absent is the window or an older row. */
  through?: Through;
};

/** Captain-facing words; model readers keep the original text and its full target detail. */
export function askReceipt(ask: Pick<AskRecord, "text" | "deliveryFacts">): string {
  return ask.deliveryFacts.receipt ?? ask.text;
}

type Row = {
  id: string;
  at: number;
  text: string;
  images_json: string | null;
  hint_task_id: string | null;
  task_id: string | null;
  attached_via: string | null;
  attached_at: number | null;
  turn_state: AskTurnState;
  delivery: AskDelivery;
  delivery_facts: string | null;
  notice_card_id: string | null;
  reply: string | null;
  followed: number | null;
  continues: string | null;
  answer_card_id: string | null;
  accepted_at: number | null;
  answered_at: number | null;
  crewmate_asked_at: number | null;
  through?: string | null;
};

/** The saved reply line back to its shape; anything unreadable is no reply, never a throw. */
function replyOf(json: string | null): LastTurnReply | null {
  if (!json) return null;
  try {
    const parsed = lastTurnReplySchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The column holds one entry per picture: the copy's reference, or - from
 * an older build - its shape alone. Shapes are read from either.
 */
function picturesOf(json: string | null): { images: AskImage[]; attachments: AttachmentRef[] } {
  if (!json) return { images: [], attachments: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { images: [], attachments: [] };
  }
  if (!Array.isArray(parsed)) return { images: [], attachments: [] };
  const images: AskImage[] = parsed
    .filter((entry): entry is AskImage => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as AskImage).mimeType === "string"
      );
    })
    .map((entry) => ({ mimeType: entry.mimeType }));
  const attachments = parsed.flatMap((entry) => {
    const ref = attachmentRefSchema.safeParse(entry);
    return ref.success ? [ref.data] : [];
  });
  return { images, attachments };
}

function fromRow(row: Row): AskRecord {
  const { images, attachments } = picturesOf(row.images_json);
  let entries: unknown = [];
  try {
    entries = row.images_json ? JSON.parse(row.images_json) : [];
  } catch {
    /* An unreadable row has no usable files. */
  }
  const messageFiles = Array.isArray(entries)
    ? entries.filter(
        (entry): entry is MessageFile =>
          entry?.kind === "text" &&
          typeof entry.name === "string" &&
          typeof entry.path === "string" &&
          Number.isSafeInteger(entry.bytes) &&
          typeof entry.sha256 === "string",
      )
    : [];
  return {
    id: row.id,
    at: row.at,
    text: row.text,
    images,
    attachments,
    messageFiles,
    hintTaskId: row.hint_task_id,
    taskId: row.task_id,
    attachedVia: row.attached_via as AskAttachedVia | null,
    attachedAt: row.attached_at,
    turnState: row.turn_state,
    delivery: row.delivery,
    deliveryFacts: parseDeliveryFacts(row.delivery_facts),
    noticeCardId: row.notice_card_id,
    followed: row.followed === 1,
    continues: row.continues ?? null,
    answerCardId: row.answer_card_id ?? null,
    acceptedAt: row.accepted_at ?? null,
    answeredAt: row.answered_at ?? null,
    crewmateAskedAt: row.crewmate_asked_at ?? null,
    ...(row.through === THROUGH_THE_COMMAND ? { through: THROUGH_THE_COMMAND } : {}),
  };
}

/** Where a followed message has not ended: answered, or given its one notice. */
const NOT_ENDED =
  "followed = 1 AND answered_at IS NULL AND delivery != 'unresolved' AND turn_state != 'open'";
/** The same, with the messages whose reply is still running (INF-2664). */
const NOT_ENDED_OR_RUNNING = "followed = 1 AND answered_at IS NULL AND delivery != 'unresolved'";

export class AskStore {
  private readonly captainListeners = new Set<(ask: AskRecord, text: string) => void>();
  onCaptainInput(listener: (ask: AskRecord, text: string) => void): () => void {
    this.captainListeners.add(listener);
    return () => this.captainListeners.delete(listener);
  }

  *originalTurnsBefore(
    id: string,
  ): Generator<{ text: string | undefined; reply: string | undefined }> {
    const rows = this.db
      .prepare(`SELECT captain_text, reply FROM captain_asks
      WHERE rowid < (SELECT rowid FROM captain_asks WHERE id = ?) ORDER BY rowid DESC`)
      .iterate(id) as Iterable<{ captain_text: string | null; reply: string | null }>;
    for (const row of rows) {
      const reply = replyOf(row.reply);
      yield { text: row.captain_text ?? undefined, reply: reply?.words ?? reply?.text };
    }
  }

  constructor(private readonly db: AppDatabase) {}

  insert(ask: AskRecord, captainText?: string): void {
    const original = captainText !== undefined;
    this.db
      .prepare(
        `INSERT INTO captain_asks (id, at, text, images_json, hint_task_id, task_id, attached_via, attached_at, turn_state, delivery, delivery_facts, notice_card_id, followed, continues, answer_card_id, accepted_at, answered_at, crewmate_asked_at, through${original ? ", captain_text" : ""})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${original ? ", ?" : ""})`,
      )
      .run(
        ask.id,
        ask.at,
        ask.text,
        ask.attachments.length > 0 || ask.messageFiles?.length
          ? JSON.stringify([...ask.attachments, ...(ask.messageFiles ?? [])])
          : ask.images.length > 0
            ? JSON.stringify(ask.images)
            : null,
        ask.hintTaskId,
        ask.taskId,
        ask.attachedVia,
        ask.attachedAt,
        ask.turnState,
        ask.delivery,
        ask.deliveryFacts.entries.length > 0 ||
          ask.deliveryFacts.retryOf ||
          ask.deliveryFacts.receipt !== undefined
          ? JSON.stringify(ask.deliveryFacts)
          : null,
        ask.noticeCardId,
        ask.followed ? 1 : null,
        ask.continues,
        ask.answerCardId,
        ask.acceptedAt,
        ask.answeredAt,
        ask.crewmateAskedAt,
        ask.through ?? null,
        ...(original ? [captainText] : []),
      );
    if (captainText !== undefined) {
      for (const listener of this.captainListeners) {
        try {
          this.db.transaction(() => listener(ask, captainText))();
        } catch {
          console.warn("[asks] captain-input observer failed");
        }
      }
    }
  }

  /** Private source-owner input, never reconstructed from decorated history. */
  captainText(id: string): string | undefined {
    const row = this.db.prepare("SELECT captain_text FROM captain_asks WHERE id = ?").get(id) as
      | { captain_text: string | null }
      | undefined;
    return row?.captain_text ?? undefined;
  }

  get(id: string): AskRecord | undefined {
    const row = prepared(this.db, "SELECT * FROM captain_asks WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row ? fromRow(row) : undefined;
  }

  /**
   * Record the FIRST attachment; later attachments leave the columns alone
   * (the task's `ask` events carry every one). Returns whether this call
   * was the first.
   */
  attach(id: string, taskId: string, via: AskAttachedVia, at: number): boolean {
    const result = this.db
      .prepare(
        "UPDATE captain_asks SET task_id = ?, attached_via = ?, attached_at = ? WHERE id = ? AND task_id IS NULL",
      )
      .run(taskId, via, at, id);
    return result.changes > 0;
  }

  setTurnState(id: string, turnState: AskTurnState): void {
    this.db.prepare("UPDATE captain_asks SET turn_state = ? WHERE id = ?").run(turnState, id);
  }

  /** The answer-delivery check's state and facts for one message. */
  setDelivery(id: string, delivery: AskDelivery, facts?: DeliveryFacts): void {
    if (facts === undefined) {
      this.db.prepare("UPDATE captain_asks SET delivery = ? WHERE id = ?").run(delivery, id);
      return;
    }
    this.db
      .prepare("UPDATE captain_asks SET delivery = ?, delivery_facts = ? WHERE id = ?")
      .run(delivery, facts.entries.length > 0 || facts.retryOf ? JSON.stringify(facts) : null, id);
  }

  setNoticeCard(id: string, cardId: string): void {
    this.db.prepare("UPDATE captain_asks SET notice_card_id = ? WHERE id = ?").run(cardId, id);
  }

  /** The captain accepted a card as the answer; the newest acceptance stands until it is final. */
  setAccepted(id: string, cardId: string, at: number): void {
    this.db
      .prepare(
        "UPDATE captain_asks SET answer_card_id = ?, accepted_at = ? WHERE id = ? AND answered_at IS NULL",
      )
      .run(cardId, at, id);
  }

  /** The message is answered, on a card or by a reaction; set once and never moved. */
  setAnswered(id: string, cardId: string | null, at: number): void {
    this.db
      .prepare(
        "UPDATE captain_asks SET answer_card_id = ?, answered_at = ? WHERE id = ? AND answered_at IS NULL",
      )
      .run(cardId, at, id);
  }

  setCrewmateAsked(id: string, at: number): void {
    this.db.prepare("UPDATE captain_asks SET crewmate_asked_at = ? WHERE id = ?").run(at, id);
  }

  /**
   * The followed messages that have not ended, oldest first, each its own
   * thread (INF-6115). `running` also selects messages whose reply has not
   * finished.
   */
  listNotEnded(running = false): AskRecord[] {
    const rows = prepared(
      this.db,
      `SELECT * FROM captain_asks WHERE ${running ? NOT_ENDED_OR_RUNNING : NOT_ENDED}
       ORDER BY at, rowid`,
    ).all() as Row[];
    return rows.map(fromRow);
  }

  /**
   * The messages the move to one thread per message has yet to carry, each
   * with every message of the merged thread it was in: the retired
   * `continues` column is read here alone (INF-6115).
   */
  pendingCarries(): { ask: AskRecord; members: AskRecord[] }[] {
    const pending = this.db
      .prepare(
        // i18n-exempt: SQL, never shown to a person
        `SELECT carries.root_id AS root_id, asks.* FROM ask_thread_carries AS carries
         CROSS JOIN captain_asks AS asks ON asks.id = carries.ask_id
         WHERE carries.carried_at IS NULL`,
      )
      .all() as (Row & { root_id: string })[];
    // Oldest first, sorted here so the read walks only the short carry list.
    pending.sort((a, b) => a.at - b.at);
    const members = this.db.prepare(
      // i18n-exempt: SQL, never shown to a person
      "SELECT * FROM captain_asks WHERE id = ? OR continues = ? ORDER BY at, rowid",
    );
    return pending.map((row) => ({
      ask: fromRow(row),
      members: (members.all(row.root_id, row.root_id) as Row[]).map(fromRow),
    }));
  }

  /** The move to one thread per message carried this message; it is never read again. */
  markCarried(id: string, at: number): void {
    this.db
      .prepare(
        // i18n-exempt: SQL, never shown to a person
        "UPDATE ask_thread_carries SET carried_at = ? WHERE ask_id = ? AND carried_at IS NULL",
      )
      .run(at, id);
  }

  /** The Firstmate's reply line beside the message (docs/composer.md "The last turn"). */
  setReply(id: string, reply: LastTurnReply): void {
    this.db
      .prepare("UPDATE captain_asks SET reply = ? WHERE id = ?")
      .run(JSON.stringify(reply), id);
  }

  /** The newest message's id, or undefined before the first. */
  latestId(): string | undefined {
    const row = this.db
      .prepare("SELECT id FROM captain_asks ORDER BY at DESC, rowid DESC LIMIT 1")
      .get() as { id: string } | undefined;
    return row?.id;
  }

  /** The two newest messages and their reply lines: the last turn above the input. */
  lastTurn(): LastTurn | null {
    const [row, before] = this.db
      .prepare(
        "SELECT text, reply, delivery_facts, through FROM captain_asks WHERE at <= (SELECT MAX(at) FROM captain_asks) ORDER BY at DESC, rowid DESC LIMIT 2",
      )
      .all() as Pick<Row, "text" | "reply" | "delivery_facts" | "through">[];
    if (!row) return null;
    const round = (saved: Pick<Row, "text" | "reply" | "delivery_facts" | "through">) => ({
      you: askReceipt({
        text: saved.text,
        deliveryFacts: parseDeliveryFacts(saved.delivery_facts),
      }),
      reply: replyOf(saved.reply),
      ...(saved.through === THROUGH_THE_COMMAND ? { through: THROUGH_THE_COMMAND } : {}),
    });
    return { ...round(row), previous: before ? round(before) : null };
  }

  /** Asks whose turn has not closed yet, oldest first. */
  listOpen(): AskRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM captain_asks WHERE turn_state = 'open' ORDER BY at, rowid")
      .all() as Row[];
    return rows.map(fromRow);
  }

  /** The messages the answer-delivery check holds in one state, oldest first. */
  listByDelivery(delivery: AskDelivery): AskRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM captain_asks WHERE delivery = ? ORDER BY at, rowid")
      .all(delivery) as Row[];
    return rows.map(fromRow);
  }

  /** The asks that first attached to a task, oldest first. */
  listFor(taskId: string): AskRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM captain_asks WHERE task_id = ? ORDER BY at, rowid")
      .all(taskId) as Row[];
    return rows.map(fromRow);
  }

  /** Every ask, oldest first (tests and the offline scripts). */
  list(): AskRecord[] {
    const rows = this.db.prepare("SELECT * FROM captain_asks ORDER BY at, rowid").all() as Row[];
    return rows.map(fromRow);
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM captain_asks").run();
  }
}
