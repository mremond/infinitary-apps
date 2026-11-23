import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { AttachmentRef } from "@shared/attachments";
import { shortTaskTitle } from "@shared/taskTitle";
import type { MessageFile } from "../overflow";
import {
  type AskAttachedVia,
  type AskImage,
  type AskRecord,
  askReceipt,
} from "../storage/askStore";
import type { TaskRecord } from "../storage/taskRecords";
import type { SavedOrigin } from "../tasks/taskOrigin";
import type { TaskService } from "../tasks/taskService";

/**
 * The capture guarantee (task-system design section 6, captain requirement
 * 1 and decision D1): every captain ask lands in a task. The row is opened
 * before the Firstmate turn runs; the agent's own tool calls select the
 * message they address per action, or no message for unrelated operational
 * work (attach first - an ask about existing work lands on that work).
 * At turn end the HOST attaches whatever is still loose: to the hinted
 * task when the open card pointed at one, else as a
 * standalone question task filed closed. Failed turns file too, apart from
 * a message whose words go back on the lane for a retry.
 *
 * The owner selects the current ask at its read witness and names the asks
 * a turn end closes; merely queueing a steer does not answer it, so an
 * unread ask stays open for the turn that reads it, and a read one whose
 * words wait for a retry stays open for the turn that serves them again. A
 * turn a quit or crash cut is closed at the next boot the same way, marked
 * failed, apart from a message whose words still wait on the lane.
 * Operational [fm-op] wakes open no ask and get no fallback - their tool
 * calls still write the task-side records (a decision task, an answered
 * event), they just have no captain words to attach.
 *
 * `attachedVia` is the attribution-quality signal: `tool:<name>` means the
 * agent found the task; `host:fallback` means the floor held. The share of
 * fallbacks is what dogfood watches.
 */

export type OpenTurnAsk = {
  text: string;
  receipt?: string;
  captainText?: string | undefined;
  images?: AskImage[];
  /** The message's own copies of its pictures, kept when it was accepted. */
  attachments?: AttachmentRef[] | undefined;
  messageFiles?: MessageFile[] | undefined;
  hintTaskId?: string | undefined;
  /** The message this one sends again (Ask again on the answer-delivery notice). */
  retryOf?: string | undefined;
};

export type EndTurnInput = {
  /**
   * The asks this end closes: those the turn read, apart from one whose
   * words wait on the lane for a retry, or the one message an early failure
   * answers. Every other open ask - one parked on the lane for a turn of its
   * own - stays open, so the turn that serves it attaches and closes it.
   */
  asks: readonly string[];
  failed: boolean;
  /** The turn's closing assistant text (the answer a fallback question keeps). */
  closingText?: string | undefined;
  error?: string | undefined;
};

export type FallbackResult = {
  askId: string;
  via: "hint" | "question";
  taskId: string;
};

/**
 * The first sentence of the ask as a question task's title, ending on a
 * whole word when it is longer than a title holds; the whole ask stays
 * attached to the question task.
 */
export function askTitle(text: string, images: AskImage[] = []): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return images.length > 0 ? "Image attachment" : "Empty turn";
  const sentence = flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? flat;
  return shortTaskTitle(sentence);
}

/**
 * An automation run, card click or crewmate report a turn has read, as the
 * origin a task it files or starts saves (INF-2326). `refs` are the names
 * an action may declare it by: the automation's id, the card's id, the
 * reporting task's id and key.
 */
export type TurnOrigin = { origin: SavedOrigin; refs: readonly string[] };

export class AskCapture {
  /** The latest read ask, used only when an action omits its own selection. */
  private currentAskId: string | undefined;
  private readonly actionAsk = new AsyncLocalStorage<{
    askId: string | undefined;
    origin?: TurnOrigin | undefined;
    /** Whether the action named its message with `ask_id`, rather than leaving it to the turn. */
    named?: boolean;
  }>();

  /**
   * `onAttach` hears every tool attribution, with or without an ask - a
   * drain has no ask, yet its tools still act on tasks, and the turn's
   * decision record (R2) must know which.
   */
  constructor(
    private readonly tasks: TaskService,
    private readonly onAttach?: (taskId: string, tool: string) => void,
    /** The automation runs, card clicks and reports the running turn has read. */
    private readonly readOrigins: () => readonly TurnOrigin[] = () => [],
  ) {}

  /**
   * A captain turn begins: open its ask before anything runs. The new ask
   * is the current one from this moment, so a steer mid-turn re-points the
   * turn's later tool calls at the words that caused them.
   */
  open(input: OpenTurnAsk): AskRecord {
    const hint = input.hintTaskId && this.tasks.get(input.hintTaskId) ? input.hintTaskId : null;
    const record = this.tasks.capture.openAsk({
      id: randomUUID().slice(0, 8),
      text: input.text,
      ...(input.receipt !== undefined ? { receipt: input.receipt } : {}),
      captainText: input.captainText,
      messageFiles: input.messageFiles ?? [],
      images: input.images ?? [],
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      hintTaskId: hint,
      ...(input.retryOf ? { retryOf: input.retryOf } : {}),
    });
    this.currentAskId = record.id;
    return record;
  }

  /**
   * A turn starts running (a captain prompt or an inbox drain): adopt every
   * still-open ask as its scope, the latest one current. A drain with no
   * open ask is an operational wake and attaches nothing.
   */
  beginTurn(): void {
    const open = this.tasks.capture.listOpenAsks();
    this.currentAskId = open.at(-1)?.id;
  }

  /** The owner's read witness selects which message in-flight tools may attach. */
  select(askId: string | undefined): void {
    this.currentAskId = askId;
  }

  /**
   * Pin an action's declared source through awaits, without changing
   * another action's source: the message it addresses, and the automation
   * run, click or report it answers when it named one. `named` says the
   * action named the message itself with `ask_id`.
   */
  withAsk<T>(askId: string | undefined, action: () => T, origin?: TurnOrigin, named = false): T {
    return this.actionAsk.run(
      { askId, ...(origin ? { origin } : {}), ...(named ? { named } : {}) },
      action,
    );
  }

  /**
   * The message the running action named with `ask_id`, when it named one:
   * what it shows or writes is recorded for that message alone (INF-6115).
   */
  namedAsk(): string | undefined {
    const scope = this.actionAsk.getStore();
    return scope?.named ? scope.askId : undefined;
  }

  /**
   * Run a turn outside every action's pin. Work an action starts - a
   * crewmate's run, its report, the wake turn that report drains - goes on
   * in that action's async context, so without this a later turn's tools
   * would read the earlier action's message as theirs and leave the
   * message they serve to the fallback.
   */
  outsideActions<T>(turn: () => T): T {
    return this.actionAsk.exit(turn);
  }

  /** The read automation run, click or report an action names, or undefined when it names none this turn read. */
  readOrigin(ref: string): TurnOrigin | undefined {
    return this.readOrigins().find((entry) => entry.refs.includes(ref));
  }

  /**
   * The origin a task filed or started without a message of the captain's
   * saves: the one the action named, else the one the turn read when it
   * read exactly one; with several and none named, none (INF-2326: the
   * first mate names which, and the host never guesses).
   */
  private actionOrigin(): SavedOrigin | undefined {
    const named = this.actionAsk.getStore()?.origin;
    if (named) return named.origin;
    const read = this.readOrigins();
    return read.length === 1 ? read[0]?.origin : undefined;
  }

  /**
   * The origin a task this action starts will save (`attach`), known before
   * the task exists: none while a message of the captain's is the action's.
   * Its start saves it first, so the brief minted at dispatch reads it.
   */
  startOrigin(): SavedOrigin | undefined {
    return this.current() ? undefined : this.actionOrigin();
  }

  current(): AskRecord | undefined {
    const scope = this.actionAsk.getStore();
    const askId = scope ? scope.askId : this.currentAskId;
    return askId ? this.tasks.capture.getAsk(askId) : undefined;
  }

  /** The copies of the current message's pictures: what a tool acting on it carries along. */
  currentPictures(): AttachmentRef[] {
    return this.current()?.attachments ?? [];
  }

  /** The task the current ask's card or panel pointed at, if it still exists. */
  hintedTask(): TaskRecord | undefined {
    const ask = this.current();
    return ask?.hintTaskId ? this.tasks.get(ask.hintTaskId) : undefined;
  }

  /**
   * Attach the action's selected ask, not merely the latest message in its turn.
   * No-op for unrelated operational work or an unknown task - the tool's own error
   * already said so. `tie` attaches it as about the task without making the
   * task its work: a question asked there, or a change before it takes
   * effect (attached again without `tie` once it does).
   */
  attach(taskId: string, tool: string, starts?: boolean, tie?: "tie"): boolean {
    this.onAttach?.(taskId, tool);
    const ask = this.current();
    if (!this.tasks.get(taskId)) return false;
    if (!ask) {
      // Work filed or started with no message of the captain's keeps the
      // automation run, click or report it answered (INF-2326).
      const origin = starts ? this.actionOrigin() : undefined;
      if (origin) this.tasks.capture.saveOrigin(taskId, origin);
      return false;
    }
    return this.tasks.capture.attachAsk(
      ask.id,
      taskId,
      `tool:${tool}` as AskAttachedVia,
      starts,
      tie === "tie",
    );
  }

  /**
   * The turn ended: each open ask it names closes, and whatever nothing
   * attached is attached now - to the hinted task, else as a standalone
   * question task born closed in Scratch. Returns the fallbacks it had to take.
   */
  endTurn(input: EndTurnInput): FallbackResult[] {
    const fallbacks: FallbackResult[] = [];
    for (const ask of this.tasks.capture.listOpenAsks()) {
      if (!input.asks.includes(ask.id)) continue;
      const fallback = this.settle(ask, input);
      if (fallback) fallbacks.push(fallback);
      this.tasks.capture.closeAsk(ask.id, input.failed ? "failed" : "closed");
    }
    this.currentAskId = undefined;
    return fallbacks;
  }

  /**
   * Boot: asks the last process left open never got their turn end. They
   * are filed now, marked failed, so a quit mid-turn loses no ask. An ask
   * whose words still wait on the lane (`waiting`) is not stranded: the
   * turn that serves them reads it, attaches it and closes it.
   */
  reconcileStranded(waiting: readonly string[]): FallbackResult[] {
    const stranded = this.tasks.capture
      .listOpenAsks()
      .map((ask) => ask.id)
      .filter((id) => !waiting.includes(id));
    if (stranded.length === 0) return [];
    return this.endTurn({
      asks: stranded,
      failed: true,
      error: "the app closed before this turn ended",
    });
  }

  private settle(ask: AskRecord, input: EndTurnInput): FallbackResult | undefined {
    if (ask.taskId) return undefined;
    const hinted = ask.hintTaskId ? this.tasks.get(ask.hintTaskId) : undefined;
    if (hinted) {
      this.tasks.capture.attachAsk(ask.id, hinted.id, "host:fallback", false);
      return { askId: ask.id, via: "hint", taskId: hinted.id };
    }
    const outcome = input.failed
      ? `hit a problem: ${input.error ?? "unknown error"}`
      : input.closingText?.trim() || null;
    const task = this.tasks.capture.fileQuestion({
      id: randomUUID().slice(0, 8),
      title: askTitle(askReceipt(ask), ask.images),
      outcome,
      actor: "host",
      fallback: "question",
    });
    this.tasks.capture.attachAsk(ask.id, task.id, "host:fallback", true);
    return { askId: ask.id, via: "question", taskId: task.id };
  }
}
