import { type Card, mergeEffectOf } from "@shared/cards";
import type { AskRecord } from "../storage/askStore";
import type { TaskCoverageFields } from "../storage/taskRecords";
import { TaskService } from "../tasks/taskService";
import { actionTookEffect, noticeAskId } from "./answerDelivery";
import { answerTaskChoice } from "./answerTaskResponse";
import { hasMergeLine } from "./settleWords";

/**
 * How a captain's message ends (INF-1610 piece 2, docs/task-capture.md "How
 * a message ends"): on a card the captain accepts as its answer. A message
 * may run any number of tasks and cards first; the ones along the way stay
 * as they are. This module reads typed state only - the saved message, the
 * task graph, the cards and the captain's own response - and never the
 * words of a card or a message.
 *
 * Every message is its own thread (INF-6115): the message and the work it
 * caused, as the one walk reads it (`AskThreads`). Two messages about the
 * same task each keep their own thread and can end on the same card; the
 * app never joins them.
 */

/** What the app reads from the stack. */
export type AskEndingHost = {
  tasks: TaskService;
  /** The cards on the stack now. */
  openCards: () => Iterable<Card>;
  /** A card's row, open or resolved. */
  storedCard: (id: string) => Card | undefined;
  /** When the captain was last offered the card as it stands. */
  shownAt: (card: Card) => number;
  /**
   * A task's cards the captain saw, with when they last saw each, passing
   * over every lifecycle its own author withdrew (`CardStore.seenCards`).
   */
  seenCards: (taskId: string) => readonly { cardId: string; at: number }[];
  /**
   * Whether a response request still waits for its answer: `pending` while
   * open, `unread` once answered with the answer not yet served to the first
   * mate (`InboxStore.requestOpen`). Absent, none waits.
   */
  requestOpen?: (requestId: string) => "pending" | "unread" | undefined;
};

/** One message's thread: the message and the work it caused. */
export type AskThread = {
  ask: AskRecord;
  work: TaskCoverageFields[];
  /** The tasks of `work` the first mate's own tools attached the message to. */
  acted: ReadonlySet<string>;
  /** When a merge linked each task of `work` it filed or started (`askCoverage`'s `joined`). */
  joined?: ReadonlyMap<string, number>;
  /**
   * The tasks of `work` the message is only tied to: a question
   * the first mate asked there, or a change it refused (`askCoverage`'s `tied`).
   */
  tied?: ReadonlySet<string>;
  /** The response requests the first mate asked for the message, by task. */
  requests?: readonly { taskId: string; requestId: string }[];
};

/**
 * Where a thread stands. `answered` and `unanswered` are saved endings;
 * `accepted` is an answer the captain accepted with nothing more running,
 * which becomes `answered` once the first mate has nothing left to do for
 * it; `working` has work still running; `waiting` has an answering card up
 * for the captain; `missing` has neither.
 */
export type AskState =
  | { kind: "answered"; cardId: string | null }
  | { kind: "unanswered" }
  | { kind: "accepted"; cardId: string | null }
  | { kind: "working" }
  | { kind: "waiting"; cardId: string }
  | { kind: "missing" };

/**
 * Where a close of a task's work puts its outcome: on a card of that task
 * that answers its message (`revise`, `open` when it is still up), as the
 * app's one closing note named for the task (`note`, marked as the answer
 * only when its message has none), nowhere because other work of the
 * message runs on or took it over (`quiet`), or - for work no message of
 * the captain's covers - by today's rule for work the fleet started.
 */
export type ClosingPlace =
  | { kind: "revise"; card: Card; open: boolean }
  | { kind: "note"; answering: boolean }
  | { kind: "quiet" }
  | { kind: "unasked"; card?: Card };

/**
 * A card shaped as the outcome of work: its author's answering mark, a
 * merge card's merge, or the app's merge line on the story note of
 * work that merges on its own. All typed; never the card's words.
 */
export function answersByShape(card: Card): boolean {
  return (
    card.answering === true ||
    card.actions.some((action) => mergeEffectOf(action)) ||
    hasMergeLine(card.body)
  );
}

/**
 * The part of a thread's work that is its own: acted on for it, or filed,
 * started or joined by a merge after `since`, and not only tied to it.
 */
function ownOf(
  thread: Pick<AskThread, "work" | "acted" | "joined" | "tied">,
  since: number,
): TaskCoverageFields[] {
  return thread.work.filter(
    (task) =>
      !thread.tied?.has(task.id) &&
      (thread.acted.has(task.id) ||
        Math.max(task.createdAt, task.startedAt ?? 0, thread.joined?.get(task.id) ?? 0) > since),
  );
}

/** The ending over a card stack: its open cards, its rows and when each was offered. */
export function askEndingOf(
  tasks: TaskService,
  cards: {
    values(): Iterable<Card>;
    stored(id: string): Card | undefined;
    shownAt(card: Card): number;
    seenCards(taskId: string): readonly { cardId: string; at: number }[];
  },
  requestOpen?: (requestId: string) => "pending" | "unread" | undefined,
): AskEnding {
  return new AskEnding({
    tasks,
    openCards: () => cards.values(),
    storedCard: (id) => cards.stored(id),
    shownAt: (card) => cards.shownAt(card),
    seenCards: (taskId) => cards.seenCards(taskId),
    ...(requestOpen ? { requestOpen } : {}),
  });
}

export class AskEnding {
  constructor(private readonly host: AskEndingHost) {}

  /** A message's thread. */
  thread(askId: string): AskThread | undefined {
    const ask = this.host.tasks.capture.getAsk(askId);
    return ask ? this.withCoverage(ask) : undefined;
  }

  private withCoverage(ask: AskRecord): AskThread {
    const { work, acted, joined, tied, requests } = this.host.tasks.capture.askCoverage([ask.id]);
    return { ask, work, acted, joined, tied, requests };
  }

  /**
   * The threads that have not ended, oldest first: one per message.
   * `running` also reads the messages whose reply is still running.
   */
  openThreads(running = false): AskThread[] {
    return this.host.tasks.readProjection(() =>
      this.host.tasks.capture.openThreadAsks(running).map((ask) => this.withCoverage(ask)),
    );
  }

  /**
   * Why the first mate may not name a message on an action from a step
   * that did not read it, or undefined when it may (INF-2664): any open
   * message a finished reply has read, a notice-up one included. Typed
   * facts only - which message the work serves is the first mate's to say.
   */
  nameRefusal(askId: string): string | undefined {
    const ask = this.host.tasks.capture.getAsk(askId);
    if (!ask) return "ask_id must name an open message (open_asks id), or be empty.";
    if (ask.turnState === "open") {
      return "ask_id must name a message a step has read; this one waits for its own step.";
    }
    const ended =
      !ask.followed ||
      ask.answeredAt !== null ||
      (ask.delivery === "unresolved" && !(ask.noticeCardId && this.noticeUp(ask.id)));
    return ended
      ? "ask_id names a message that has ended: it was answered, or its notice was closed. Leave ask_id empty for this work."
      : undefined;
  }

  /** Whether a message's notice is on the stack now. */
  private noticeUp(askId: string): boolean {
    return this.noticesUp().some((notice) => notice.askId === askId);
  }

  /** When the captain was last offered a card as it stands. */
  offeredAt(card: Card): number {
    return this.host.shownAt(card);
  }

  /** The notices up now, by message, with when each was offered. */
  noticesUp(): { askId: string; shownAt: number }[] {
    const notices: { askId: string; shownAt: number }[] = [];
    for (const card of this.host.openCards()) {
      const askId = noticeAskId(card.id);
      if (askId) notices.push({ askId, shownAt: this.host.shownAt(card) });
    }
    return notices;
  }

  /** The threads whose work includes a task, newest first. */
  threadsOf(taskId: string): AskThread[] {
    return this.host.tasks.capture.asksAbove(taskId).map((ask) => this.withCoverage(ask));
  }

  /**
   * The task a card is about: the one it names, else the record filed for
   * it. The first mate's own answer to a crewmate's report names no task
   * (INF-2714), so its answer record leads to the reporting task it saved
   * as its origin.
   */
  cardTask(card: Card): string | undefined {
    if (card.taskId) return card.taskId;
    const capture = this.host.tasks.capture;
    const filed = capture.taskForCard(card.id);
    return (filed?.kind === "question" ? capture.reportOrigin(filed.id) : undefined) ?? filed?.id;
  }

  /** The cards the first mate showed for the message, by its own facts. */
  private shownFor(ask: Pick<AskRecord, "deliveryFacts">): Set<string> {
    return new Set(
      ask.deliveryFacts.entries.flatMap((entry) =>
        entry.outcome === "action" && entry.kind === "card" && entry.ref ? [entry.ref] : [],
      ),
    );
  }

  /**
   * Whether a card can answer the thread: shaped as an answer and about its
   * work, or one the first mate showed for its message.
   */
  candidate(thread: AskThread, card: Card): boolean {
    return (
      this.about(thread, card) && (this.shownFor(thread.ask).has(card.id) || answersByShape(card))
    );
  }

  /**
   * Whether a card is about the thread: shown for its message, or a card
   * of its work or of a task it is tied to. A card speaks only for its own
   * task, so it is never about a thread that does not reach that task.
   */
  private about(thread: AskThread, card: Card): boolean {
    if (this.shownFor(thread.ask).has(card.id)) return true;
    const taskId = this.cardTask(card);
    return taskId !== undefined && thread.work.some((task) => task.id === taskId);
  }

  /** The newest card up that answers the thread and was shown since its message. */
  waitingCard(thread: AskThread): Card | undefined {
    let newest: Card | undefined;
    for (const card of this.host.openCards()) {
      if (!this.candidate(thread, card) || this.host.shownAt(card) < thread.ask.at) continue;
      if (!newest || this.host.shownAt(card) > this.host.shownAt(newest)) newest = card;
    }
    return newest;
  }

  /**
   * An answer the captain saw (INF-2845, direction A): the newest answering
   * crewmate card of the thread's work they saw since its message, never a
   * merge offer and never one its own author withdrew. Once the thread's
   * work has ended it is the answer: the crewmate is not asked again, the
   * first mate is not asked, and no closing note goes up.
   */
  seenAnswer(thread: AskThread): Card | undefined {
    return this.seenOver(thread.work, thread.ask.at);
  }

  private seenOver(work: readonly TaskCoverageFields[], since: number): Card | undefined {
    let newest: { card: Card; at: number } | undefined;
    for (const task of work) {
      for (const seen of this.host.seenCards(task.id)) {
        if (seen.at < since || (newest && newest.at >= seen.at)) continue;
        const card = this.host.storedCard(seen.cardId);
        if (card?.author !== "crewmate" || card.answering !== true) continue;
        if (card.actions.some((action) => mergeEffectOf(action) !== undefined)) continue;
        newest = { card, at: seen.at };
      }
    }
    return newest?.card;
  }

  /**
   * The captain's accepted answer, when they accepted it since the message.
   * Work their choice started keeps the message working until it ends; then
   * the accepted card still answers it, revised with the outcome.
   */
  private acceptance(thread: AskThread): string | undefined {
    const { ask } = thread;
    if (!ask.answerCardId || ask.acceptedAt === null) return undefined;
    return ask.acceptedAt < ask.at ? undefined : ask.answerCardId;
  }

  /**
   * The thread's own work: the tasks the first mate's tools acted on for
   * it, and those filed, started or joined by a merge after it (a part, a
   * handover, a choice on its card that started work, an existing task a
   * merge set to start for the rest). A task the message only pointed at
   * (its card or panel), which nobody acted on since, is not its work.
   */
  ownWork(thread: AskThread): TaskCoverageFields[] {
    return ownOf(thread, thread.ask.at);
  }

  /**
   * The tasks the thread waits on: its own work still running, each open task
   * a request asked for its message still owes an answer, and each task
   * whose answer is still unread on the first mate's lane, closed or not. A
   * pending request whose task closed, or that its sender cancelled, waits
   * no longer: the message never waits longer than its task, and an unread
   * answer only until its wake is read.
   */
  private waitsOn(thread: AskThread): Set<string> {
    const open = new Set(
      this.ownWork(thread)
        .filter((task) => !TaskService.isClosed(task))
        .map((task) => task.id),
    );
    const requestOpen = this.host.requestOpen;
    if (!requestOpen) return open;
    for (const { taskId, requestId } of thread.requests ?? []) {
      if (open.has(taskId)) continue;
      const task = thread.work.find((entry) => entry.id === taskId);
      const waits = task ? requestOpen(requestId) : undefined;
      if (waits === "unread" || (waits === "pending" && task && !TaskService.isClosed(task)))
        open.add(taskId);
    }
    return open;
  }

  /**
   * The thread's work as its readers list it: its own work, and each task it
   * is only tied to that it still waits on for an answer.
   */
  listedWork(thread: AskThread): TaskCoverageFields[] {
    const own = new Set(this.ownWork(thread).map((task) => task.id));
    const waits = this.waitsOn(thread);
    return thread.work.filter((task) => own.has(task.id) || waits.has(task.id));
  }

  /** Whether the thread's own work runs on: the message still waits for its outcome. */
  private live(thread: AskThread): boolean {
    return this.waitsOn(thread).size > 0;
  }

  /** Whether the thread waits on a task other than this one. */
  private waitsOnOther(thread: AskThread, taskId: string): boolean {
    return [...this.waitsOn(thread)].some((id) => id !== taskId);
  }

  state(thread: AskThread): AskState {
    const { ask } = thread;
    if (ask.answeredAt !== null) return { kind: "answered", cardId: ask.answerCardId };
    if (ask.delivery === "unresolved") return { kind: "unanswered" };
    const live = this.live(thread);
    const accepted = this.acceptance(thread);
    if (accepted && !live) return { kind: "accepted", cardId: accepted };
    if (live) return { kind: "working" };
    const waiting = this.waitingCard(thread);
    if (waiting) return { kind: "waiting", cardId: waiting.id };
    const seen = this.seenAnswer(thread);
    if (seen) return { kind: "accepted", cardId: seen.id };
    const entries = ask.deliveryFacts.entries;
    // The first mate's answer in a card's thread: its closing words under the
    // card the message replied under, or its line alone on someone else's card.
    const reply = entries.findLast(
      (entry) => entry.outcome === "action" && entry.kind === "reply" && entry.ref,
    );
    if (reply?.ref) return { kind: "accepted", cardId: reply.ref };
    // A reaction answers a message that asks nothing; the first mate judged that.
    const reacted = actionTookEffect(
      entries.filter(
        (entry) =>
          entry.outcome === "refused" || (entry.outcome === "action" && entry.kind === "reaction"),
      ),
    );
    if (reacted) return { kind: "accepted", cardId: null };
    return { kind: "missing" };
  }

  /**
   * The captain acknowledged a card: a choice, an ordinary note read, or
   * explicit Done on a marked saved answer. It is the answer for each open
   * message whose thread it is about - its work or a task the message is
   * tied to holds the card's task, or the first mate showed the card for
   * that message - when it was shown since that message and no reply of
   * theirs waits under it: their choice on a decision about its work that
   * is not still asking (or an explicitly answering terminal answer-task
   * choice), or acknowledgement of a note shaped as its answer. Each
   * message is accepted on its own (INF-6115); a card never answers a
   * message whose thread does not reach its task. Aside and saved-answer
   * reads never call this acknowledgement path. A decision put aside
   * answers nothing. A message whose reply is still running counts too: a
   * quick choice lands before the turn that showed the card ends.
   * `signed-off` is the captain's line under the card that its crewmate
   * marked as saying they are done (INF-2845, `CardThreads.signOff`): it
   * answers each message the card is about, as a choice does.
   */
  captainResponded(card: Card, response: "choice" | "close" | "signed-off", action?: string): void {
    if (card.awaiting === "answer") return;
    if (response === "close" && card.actions.length > 0) return;
    const terminalAnswer =
      response === "choice" &&
      card.answering === true &&
      answerTaskChoice(card, card.taskId ? this.host.tasks.get(card.taskId) : undefined, action);
    if (response === "choice" && (card.continues || (card.asking && !terminalAnswer))) return;
    for (const thread of this.openThreads(true)) {
      // A choice on a decision about its work answers it; an acknowledged
      // note answers it only when shaped as its answer, not a note along the way.
      // A line its crewmate signed off (INF-2845) answers it like a choice.
      const answers =
        response === "close" ? this.candidate(thread, card) : this.about(thread, card);
      if (!answers || this.host.shownAt(card) < thread.ask.at) continue;
      this.host.tasks.capture.acceptAnswer(thread.ask.id, card.id);
    }
  }

  /**
   * The crewmate step: a crewmate reports its task finished. For every
   * followed message whose last running work that task is, with no answer
   * accepted, up or seen, the crewmate is asked once for the card that
   * answers it; the returned threads are the ones it is asked about, all
   * in that one ask.
   */
  crewmateStep(taskId: string): AskThread[] {
    const asked: AskThread[] = [];
    for (const thread of this.threadsOf(taskId)) {
      const { ask } = thread;
      if (!ask.followed || ask.answeredAt !== null || ask.delivery === "unresolved") continue;
      if (ask.crewmateAskedAt !== null) continue;
      if (this.waitsOnOther(thread, taskId) || this.acceptance(thread) || this.waitingCard(thread))
        continue;
      if (this.seenAnswer(thread)) continue;
      asked.push(thread);
    }
    for (const thread of asked) this.host.tasks.capture.markCrewmateAsked(thread.ask.id);
    return asked;
  }

  /**
   * The one-time step after the update to one thread per message (INF-6115):
   * each message open at the update keeps what its merged thread held for
   * it, so the update itself raises no retry, notice or crewmate ask. The
   * merged thread is read once more as it stood - every message that joined
   * it, every link walked - and the message now attaches, by a recorded
   * attachment (`CARRIED_VIA`), to each task of that thread's own work still
   * running that its own thread does not already hold as its own; it is tied
   * to each task whose card that thread waited on or was answered from, and
   * to each response request it waited on; the other messages' cards, thread
   * answers and reactions are kept on its facts; the crewmate ask that
   * thread spent stays spent. Each message is marked carried in that write.
   */
  carryThreads(): void {
    for (const { ask, members } of this.host.tasks.capture.threadCarries()) {
      try {
        this.carryThread(ask, members.length > 0 ? members : [ask]);
      } catch (caught) {
        console.warn("[firstmate] a message's thread could not be carried:", caught);
      }
    }
  }

  private carryThread(ask: AskRecord, members: AskRecord[]): void {
    const capture = this.host.tasks.capture;
    const ended = !ask.followed || ask.answeredAt !== null || ask.delivery === "unresolved";
    const root = members.find((member) => member.continues === null) ?? members[0] ?? ask;
    if (ended) {
      capture.carryThread(ask.id, {
        work: [],
        ties: [],
        requests: [],
        entries: [],
        crewmateAskedAt: null,
      });
      return;
    }
    const ids = members.map((member) => member.id);
    const merged = capture.askCoverage(ids, undefined, { origins: false });
    const now = this.thread(ask.id);
    const held = new Set(now?.work.map((task) => task.id) ?? []);
    const own = new Set(now ? this.ownWork(now).map((task) => task.id) : []);
    const work = ownOf(merged, root.at)
      .filter((task) => !TaskService.isClosed(task) && !own.has(task.id))
      .map((task) => task.id);
    // The cards the merged thread waited on or was answered from.
    const newestAt = Math.max(...members.map((member) => member.at));
    const shown = new Set(members.flatMap((member) => [...this.shownFor(member)]));
    const mergedWork = new Set(merged.work.map((task) => task.id));
    const cards: Card[] = [];
    for (const card of this.host.openCards()) {
      if (this.host.shownAt(card) < newestAt) continue;
      const taskId = this.cardTask(card);
      const about = shown.has(card.id) || (taskId !== undefined && mergedWork.has(taskId));
      if (about && (shown.has(card.id) || answersByShape(card))) cards.push(card);
    }
    const seen = this.seenOver(merged.work, newestAt);
    if (seen) cards.push(seen);
    const answer = root.answerCardId ? this.host.storedCard(root.answerCardId) : undefined;
    if (answer) cards.push(answer);
    const ties = [
      ...new Set(
        cards.flatMap((card) => {
          const taskId = this.cardTask(card);
          return taskId && !held.has(taskId) && !work.includes(taskId) ? [taskId] : [];
        }),
      ),
    ];
    const mine = new Set(
      (now?.requests ?? []).map((entry) => `${entry.taskId}\u0000${entry.requestId}`),
    );
    const requests = merged.requests.filter(
      (entry) => !mine.has(`${entry.taskId}\u0000${entry.requestId}`),
    );
    const entries = members
      .filter((member) => member.id !== ask.id)
      .flatMap((member) => member.deliveryFacts.entries)
      .filter(
        (entry) =>
          entry.outcome === "action" &&
          (entry.kind === "card" || entry.kind === "reply" || entry.kind === "reaction"),
      );
    capture.carryThread(ask.id, {
      work,
      ties,
      requests,
      entries,
      crewmateAskedAt: root.crewmateAskedAt,
    });
  }

  /**
   * Where a closed task's outcome goes (the at-most-one rule). A card
   * speaks only for its own task (INF-6115): the outcome is written on a
   * card of the closed task, its own answering card up first, then the
   * message's answer when that card is the task's. When the message is
   * answered or waits on a card of other work, the closed task gets its own
   * closing note, not marked as the answer; other running work of the
   * message, or an answer the captain saw, keeps it quiet. Otherwise the
   * app's one closing note answers the message.
   */
  closingPlace(taskId: string): ClosingPlace {
    // A message only tied to the task decides only when no message has it as work.
    const threads = this.threadsOf(taskId);
    const thread = threads.find((entry) => !entry.tied?.has(taskId)) ?? threads[0];
    const own = [...this.host.openCards()].find(
      (card) => this.cardTask(card) === taskId && answersByShape(card),
    );
    if (!thread) return { kind: "unasked", ...(own ? { card: own } : {}) };
    // The task's own card up takes it, even when the message's answer is
    // another card, shown before a later message about it.
    if (own) return { kind: "revise", card: own, open: true };
    const { ask } = thread;
    const answer =
      ask.answeredAt !== null ? (ask.answerCardId ?? undefined) : this.acceptance(thread);
    if (answer) {
      const open = [...this.host.openCards()].find((card) => card.id === answer);
      const card = open ?? this.host.storedCard(answer);
      if (!card) return { kind: "quiet" };
      if (this.cardTask(card) === taskId) return { kind: "revise", card, open: open !== undefined };
      // The answer is a card of other work: it keeps its words, and the
      // closed task's outcome is told under its own name.
      return this.waitsOnOther(thread, taskId)
        ? { kind: "quiet" }
        : { kind: "note", answering: false };
    }
    if (ask.answeredAt !== null || ask.delivery === "unresolved") return { kind: "quiet" };
    if (this.waitsOnOther(thread, taskId)) return { kind: "quiet" };
    const waiting = this.waitingCard(thread);
    if (waiting && this.cardTask(waiting) === taskId)
      return { kind: "revise", card: waiting, open: true };
    // An answer the captain saw already answers it: nothing comes back.
    if (this.seenAnswer(thread)) return { kind: "quiet" };
    // A card of other work up for the message stays its answer.
    return { kind: "note", answering: waiting === undefined };
  }
}
