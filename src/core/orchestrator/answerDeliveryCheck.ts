import { type Card, onStage } from "@shared/cards";
import { type AskRecord, askReceipt } from "../storage/askStore";
import { FIRSTMATE_RECIPIENT, type InboxRow, type InboxStore } from "../storage/inboxStore";
import type { TaskService } from "../tasks/taskService";
import {
  type DeliveryEntry,
  type DeliveryNote,
  excerptOf,
  JUDGEABLE_DELIVERY,
  judgeDelivery,
  noticeCard,
  noticeCardId,
  refusalOf,
} from "./answerDelivery";
import type { AskEnding, AskThread } from "./askEnding";
import { answerMissingWake } from "./captainWakes";

/**
 * The inbox ref the answer-missing wake rides. The wake's once-name
 * (`answer-repair:<askId>`) is what keeps it to one retry per message.
 */
export const ANSWER_MISSING_REF = "answer-missing";

/** What the check needs from the app: the saved record, the lane, the stack. */
export type AnswerDeliveryHost = {
  tasks: TaskService;
  inbox: InboxStore;
  now: () => number;
  /** Put the one notice on the stack (a host card; its own record, no crewmate task). */
  raiseNotice: (card: Pick<Card, "id" | "title" | "meta" | "body" | "actions">) => void;
  /** Take a notice down unanswered: an answering card went up after it. Absent, notices stay up. */
  withdrawNotice?: (cardId: string) => void;
  /** The title of a card the captain replied under, when it is still on the stack. */
  cardTitle: (cardId: string) => string | undefined;
  /** The newest captain message under a card, which the retry names. Absent, it names none. */
  captainMessage?: (cardId: string) => number | undefined;
  /** How each message ends (`AskEnding`): its thread, its work and its answer. */
  ending: AskEnding;
  /**
   * Judge nothing: no verdict, no retry, no notice. The replay harness and
   * the developer evaluations replay turns whose outcome is recorded, and the
   * replay scores delivery from the recording itself
   * (`asks_without_action`); the app never runs in this mode.
   */
  observe?: boolean;
};

/** A turn's scope: the messages it read, with the card each was a reply under. */
export type DeliveryTurnEnd = {
  /** The messages the turn opened or took in, still open when it ended. */
  asks: readonly string[];
  /** The turn failed or paused: its messages wait for the turn that serves them again. */
  held: boolean;
  /** Messages steered in that the session never delivered; their turn is a later one. */
  unread: readonly string[];
};

/**
 * Answer delivery, the stateful half (docs/task-capture.md "Answer
 * delivery"). It records, where each action succeeds, a fact against every
 * message the running turn has read; judges those messages when the turn
 * ends, after the normal card and thread capture; queues the one
 * output-only retry; and raises the one notice. The saved state lives on
 * `captain_asks` through `TaskService`, so a restart resumes where it
 * stopped and no message gets a second retry or notice.
 *
 * Which messages a turn has read is typed state, never the words: the asks
 * still open (the live one, and every steer it took in), plus the saved
 * messages a parked row, the retry wake or the answer to a request asked
 * for them carried back.
 */
export class AnswerDeliveryCheck {
  private adopted = new Set<string>();
  private about = new Map<string, string>();
  private retryAsk: string | undefined;
  /** The running turn reads an answer a captain's message waits on. */
  private answerTurn = false;

  constructor(private readonly host: AnswerDeliveryHost) {}

  /** The running turn is the one output-only retry: it may only show an answer. */
  get outputOnly(): boolean {
    return this.retryAsk !== undefined;
  }

  /**
   * The running turn is served alone - the one retry, or an answer a
   * captain's message waits on - so a new message of his waits on the lane
   * for a turn of its own instead of riding in as a steer.
   */
  get servedAlone(): boolean {
    return this.outputOnly || this.answerTurn;
  }

  /** A message was a reply under one of Firstmate's own cards. */
  noteAbout(askId: string, cardId: string | undefined): void {
    if (cardId) this.about.set(askId, cardId);
  }

  /**
   * A drained batch carries saved messages back: parked captain words name
   * theirs, the answer-missing wake names the one it retries (and is judged
   * as retrying from here on), and a requested-response wake brings back
   * each message its request was asked for.
   */
  adopt(rows: readonly InboxRow[], aboutOf: (row: InboxRow) => string | undefined): void {
    for (const row of rows) {
      const facts = row.facts;
      if (facts?.kind === "captain-turn" && facts.askId) {
        this.adopted.add(facts.askId);
        this.noteAbout(facts.askId, aboutOf(row));
      } else if (facts?.kind === "answer-missing") {
        this.adopted.add(facts.askId);
        this.noteAbout(facts.askId, facts.aboutCard?.id);
        this.retryAsk = facts.askId;
        if (this.host.tasks.capture.getAsk(facts.askId)?.delivery !== "retrying") {
          this.host.tasks.capture.setAskDelivery(facts.askId, "retrying");
        }
      } else if (facts?.kind === "requested-response") {
        // The answer to a request asked for a captain's message: the turn
        // that reads it reads that message too, so its follow-up stays the
        // message's and the message is judged when it ends - its card, or
        // the one retry (docs/task-capture.md "How a message ends").
        for (const ask of this.waitingOn(row)) {
          this.answerTurn = true;
          if (ask.delivery === "covered") this.host.tasks.capture.setAskDelivery(ask.id, "pending");
          this.adopted.add(ask.id);
        }
      }
    }
  }

  /**
   * The captain's messages still waiting on the answer a requested-response
   * wake carries. Such a wake is served in a turn of its own, as the one
   * retry is, so the turn that reads it reads only those messages.
   */
  waitingOn(row: InboxRow): AskRecord[] {
    const facts = row.facts;
    if (facts?.kind !== "requested-response") return [];
    return this.host.tasks.capture
      .requestAsks(facts.taskId, facts.requestId)
      .filter(
        (ask) =>
          ask.followed &&
          ask.answeredAt === null &&
          (ask.delivery === "covered" || JUDGEABLE_DELIVERY.includes(ask.delivery)),
      );
  }

  /** The saved messages a drained batch carried back to the running turn. */
  adoptedAsks(): string[] {
    return [...this.adopted];
  }

  /** The messages the running turn has read so far. */
  private scope(): string[] {
    return [
      ...new Set([...this.host.tasks.capture.listOpenAsks().map((ask) => ask.id), ...this.adopted]),
    ];
  }

  /**
   * Something succeeded or was refused after the running turn read these
   * messages. A refused or thrown call is saved as a refusal only for a
   * card; lookups are never saved at all.
   */
  // The live agent supplies backend-witnessed reads; standalone record users
  // retain the capture scope when they have no session witness.
  note(entry: DeliveryNote, read: readonly string[] = this.scope()): void {
    this.save(read, entry);
  }

  /** Closing words written into a card's replies count for the messages that were replies under it. */
  creditReply(cardId: string): void {
    const askIds = [...this.about].filter(([, about]) => about === cardId).map(([id]) => id);
    this.save(askIds, { outcome: "action", kind: "reply", tool: "reply", ref: cardId });
  }

  private save(askIds: readonly string[], entry: DeliveryNote): void {
    if (askIds.length === 0) return;
    try {
      this.host.tasks.capture.noteDelivery(askIds, {
        ...entry,
        at: this.host.now(),
      } as DeliveryEntry);
    } catch (caught) {
      console.warn("[firstmate] answer delivery could not save a fact:", caught);
    }
  }

  /**
   * The turn ended, and its cards and thread answers are already captured:
   * judge each message it read. A turn that failed or paused holds them for
   * the turn that serves them again; a message it never read waits, with no
   * facts of this turn, for the one that does.
   */
  endTurn(end: DeliveryTurnEnd): void {
    const unread = new Set(end.unread);
    const scope = [...new Set([...end.asks, ...this.adopted])];
    try {
      if (this.host.observe) return;
      for (const id of scope) {
        try {
          if (unread.has(id)) this.host.tasks.capture.releaseAskDelivery(id);
          else if (end.held) this.hold(id);
          else this.judge(id);
        } catch (caught) {
          console.warn("[firstmate] answer delivery could not judge a message:", caught);
        }
      }
      if (!end.held) this.sweep();
    } finally {
      this.clear();
    }
  }

  /**
   * The purge control emptied the lane: a retry still waiting on it is gone,
   * and a message nobody can retry gets no notice either - it ends unresolved.
   */
  lanePurged(): void {
    for (const ask of this.host.tasks.capture.listAsksByDelivery("retrying")) {
      this.host.tasks.capture.setAskDelivery(ask.id, "unresolved");
    }
  }

  /** Forget the running turn's scope. */
  clear(): void {
    this.adopted.clear();
    this.about.clear();
    this.retryAsk = undefined;
    this.answerTurn = false;
  }

  private hold(id: string): void {
    const ask = this.host.tasks.capture.getAsk(id);
    if (ask?.delivery === "pending") this.host.tasks.capture.setAskDelivery(id, "held");
  }

  /**
   * One message, judged when a turn that read it ends. A message saved
   * before the app followed messages to their answer keeps the older
   * rule: covered by any action. A followed one is judged by how its
   * thread stands (docs/task-capture.md "How a message ends"): answered,
   * work still running or an answering card up covers it; an answer the
   * captain accepted is made final; with none of these, the first mate
   * is asked once, and after that the one notice goes up.
   */
  private judge(id: string): void {
    const ask = this.host.tasks.capture.getAsk(id);
    if (!ask) return;
    if (!ask.followed) {
      const verdict = judgeDelivery(ask.delivery, ask.deliveryFacts.entries);
      if (verdict === "covered") this.host.tasks.capture.setAskDelivery(id, "covered");
      else if (verdict === "retry") this.retry(id);
      else if (verdict === "notice") this.notify(id);
      return;
    }
    if (!JUDGEABLE_DELIVERY.includes(ask.delivery)) return;
    const thread = this.host.ending.thread(id);
    if (!thread) return;
    const state = this.host.ending.state(thread);
    if (state.kind === "unanswered") return;
    if (state.kind === "missing") {
      if (ask.delivery === "retrying") this.notify(id);
      else this.retry(id, thread);
      return;
    }
    if (state.kind === "accepted") this.finalize(thread, state.cardId);
    this.host.tasks.capture.setAskDelivery(id, "covered");
  }

  /**
   * Every followed message that has not ended, read again: an answer the
   * captain accepted becomes final once the first mate has nothing queued
   * that could start more work for it, and a message whose work has ended
   * with no answer gets the first mate step, then the one notice. A
   * message still waiting for its own turn's judgment, or already asked
   * about, is left to that.
   */
  sweep(): void {
    if (this.host.observe) return;
    this.withdrawNotices();
    for (const thread of this.host.ending.openThreads()) {
      try {
        if (thread.ask.delivery !== "covered") continue;
        const state = this.host.ending.state(thread);
        if (state.kind === "accepted") this.finalize(thread, state.cardId);
        else if (state.kind === "missing") this.retry(thread.ask.id, thread);
      } catch (caught) {
        console.warn("[firstmate] answer delivery could not read a message's ending:", caught);
      }
    }
  }

  /**
   * A notice up for a message whose work now shows an answering card on the
   * stage, offered after the notice, is taken back (INF-2664): a card still
   * held for its author's close-out waits until it is released. The message
   * waits on that card again, as one that never had a notice would. The notice keeps its id on the message, so if that card closes
   * with no answer the same notice comes back, with no second reminder.
   */
  withdrawNotices(): void {
    const withdraw = this.host.withdrawNotice;
    if (this.host.observe || !withdraw) return;
    for (const notice of this.host.ending.noticesUp()) {
      try {
        const ask = this.host.tasks.capture.getAsk(notice.askId);
        if (!ask?.followed || ask.delivery !== "unresolved") continue;
        if (ask.noticeCardId !== noticeCardId(ask.id)) continue;
        const thread = this.host.ending.thread(ask.id);
        const card = thread ? this.host.ending.waitingCard(thread) : undefined;
        if (!thread || !card || !onStage(card)) continue;
        if (this.host.ending.offeredAt(card) < notice.shownAt) continue;
        this.host.tasks.capture.setAskDelivery(ask.id, "covered");
        withdraw(noticeCardId(ask.id));
      } catch (caught) {
        console.warn("[firstmate] answer delivery could not take back a notice:", caught);
      }
    }
  }

  /** Whether the first mate has nothing queued: a choice waiting on it may still start work. */
  private laneEmpty(): boolean {
    return this.host.inbox.allFor(FIRSTMATE_RECIPIENT).length === 0;
  }

  /** The accepted answer is final. */
  private finalize(thread: AskThread, cardId: string | null): void {
    if (!this.laneEmpty()) return;
    this.host.tasks.capture.markAnswered(thread.ask.id, cardId);
  }

  /**
   * The one retry: a typed wake, queued before the state moves so a restart
   * finds one or the other.
   *
   * A ceiling (docs/principles.md, "Build the agent's reach, never its
   * verdicts"): it covers a first mate model that reads the captain's
   * message and ends its turn with nothing taking effect - its answer left
   * in closing words nobody sees, or a refused card it never showed again.
   * Only the retry compensates: the check reads typed facts the host holds,
   * and the notice shows the captain one. Remove the retry, so an uncovered
   * message goes straight to its notice, once the models the first mate is
   * served answer in the turn that read the message. Where it shows: the
   * replay's `asks_without_action` row, and the `answer-repair:<askId>`
   * name `inbox_once` keeps for every retry queued.
   */
  private retry(id: string, thread?: AskThread): void {
    const ask = this.host.tasks.capture.getAsk(id);
    if (!ask) return;
    // A message whose notice was taken back already had its retry: the notice returns.
    if (ask.noticeCardId) {
      this.notify(id);
      return;
    }
    const refusal = refusalOf(ask.deliveryFacts.entries);
    const filed = ask.taskId ? this.host.tasks.get(ask.taskId) : undefined;
    const aboutId = this.about.get(id);
    const aboutTitle = aboutId ? this.host.cardTitle(aboutId) : undefined;
    const aboutMessage = aboutId ? this.host.captainMessage?.(aboutId) : undefined;
    // Work a crewmate ran for it ended: the first mate is asked for the answer it found.
    const ran = thread
      ? this.host.ending.ownWork(thread).filter((task) => task.startedAt !== null)
      : [];
    const queued = this.host.inbox.enqueueWake(
      FIRSTMATE_RECIPIENT,
      answerMissingWake({
        askId: id,
        excerpt: excerptOf(ask.text),
        ...(filed ? { filedOn: { id: filed.id, title: filed.title } } : {}),
        ...(aboutId
          ? {
              aboutCard: {
                id: aboutId,
                title: aboutTitle ?? aboutId,
                ...(aboutMessage !== undefined ? { messageId: aboutMessage } : {}),
              },
            }
          : {}),
        ...(refusal?.outcome === "refused"
          ? { refusal: refusal.reason, ...(refusal.ref ? { ownedBy: refusal.ref } : {}) }
          : {}),
        ...(ran.length > 0
          ? { workEnded: ran.map((task) => ({ id: task.id, title: task.title })) }
          : {}),
      }),
      "agent",
      ANSWER_MISSING_REF,
    );
    // The once-name already spent on an earlier retry: the notice follows.
    if (queued === null) {
      this.notify(id);
      return;
    }
    this.host.tasks.capture.setAskDelivery(id, "retrying");
  }

  /**
   * The one notice, raised under a fixed id and marked on the message so it
   * is never raised twice at once; the message ends unanswered with it. One
   * taken back comes back under the same id.
   */
  private notify(id: string): void {
    const ask = this.host.tasks.capture.getAsk(id);
    if (!ask || ask.delivery === "unresolved") return;
    this.host.raiseNotice(noticeCard(id, askReceipt(ask), ask.deliveryFacts.entries));
    this.host.tasks.capture.markAskUnresolved(id, noticeCardId(id));
  }

  /**
   * The messages whose rows are still on the lane, waiting or in flight:
   * each hands its message back to the turn that serves it - the retry
   * wake, or the captain's words parked with the message.
   */
  waitingOnLane(): string[] {
    const lane = [
      ...this.host.inbox.allFor(FIRSTMATE_RECIPIENT),
      ...this.host.inbox.inFlight(FIRSTMATE_RECIPIENT),
    ];
    return lane.flatMap((row) =>
      row.facts?.kind === "answer-missing"
        ? [row.facts.askId]
        : row.facts?.kind === "captain-turn" && row.facts.askId
          ? [row.facts.askId]
          : [],
    );
  }

  /**
   * Boot. A message the last process left mid-turn never reached its turn's
   * end: it is judged from its saved facts as an uncovered message would be.
   * A retrying message whose wake is no longer on the lane has been served:
   * it is judged now, so a quit before the check still yields one retry and
   * at most one notice.
   */
  reconcile(stranded: readonly string[]): void {
    const queued = new Set(this.waitingOnLane());
    for (const id of stranded) {
      if (queued.has(id)) continue;
      try {
        this.judge(id);
      } catch (caught) {
        console.warn("[firstmate] answer delivery could not judge a stranded message:", caught);
      }
    }
    for (const ask of this.host.tasks.capture.listAsksByDelivery("retrying")) {
      // A message just judged above has its retry queued now, not served.
      if (queued.has(ask.id) || stranded.includes(ask.id)) continue;
      try {
        this.judge(ask.id);
      } catch (caught) {
        console.warn("[firstmate] answer delivery could not judge a retried message:", caught);
      }
    }
    this.sweep();
  }
}
