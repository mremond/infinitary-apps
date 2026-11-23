import type { AttachmentRef } from "@shared/attachments";
import {
  type CardAnswer,
  type CardDecisionContext,
  type ChoiceCarriedRecord,
  choiceCarriedRecordSchema,
} from "@shared/cards";
import { reportSummary } from "@shared/feed";
import type { LastTurn, LastTurnReply } from "@shared/lastTurn";
import { savedTaskTitle } from "@shared/taskTitle";
import { THROUGH_THE_COMMAND, throughNow } from "../askedFromTheCommand";
import {
  type AskDelivery,
  type DeliveryEntry,
  type DeliveryFacts,
  JUDGEABLE_DELIVERY,
} from "../orchestrator/answerDelivery";
import type { MessageFile } from "../overflow";
import {
  type AskAttachedVia,
  type AskImage,
  type AskRecord,
  type AskTurnState,
  askReceipt,
} from "../storage/askStore";
import type { TaskEvent, TaskEventActor } from "../storage/taskEventStore";
import type { TaskCoverageFields, TaskRecord } from "../storage/taskRecords";
import { AskThreads, CARRIED_VIA, type ThreadCoverage } from "./askThreads";
import {
  ORIGIN_NOTE_KEY,
  originAbout,
  originNoteText,
  type SavedOrigin,
  savedOriginOf,
  type TaskOriginLine,
} from "./taskOrigin";
import type { TaskService } from "./taskService";
import type { TaskWriter } from "./taskWriter";

export type OpenAskInput = {
  /** The turn id. */
  id: string;
  text: string;
  receipt?: string;
  /** Trusted input before file decoration; absent for legacy and replayed turns. */
  captainText?: string | undefined;
  images?: AskImage[];
  /** The message's own copies of `images` (`src/core/attachments.ts`). */
  attachments?: AttachmentRef[];
  messageFiles?: MessageFile[];
  hintTaskId?: string | null;
  at?: number;
  /** The message this one sends again (Ask again on the answer-delivery notice). */
  retryOf?: string;
};

/**
 * A standalone one-off the Firstmate answered (or the host filed at turn
 * end when nothing attached): a `question` task born closed (D1 - it exists
 * only when the ask is about no other work).
 */
export type FileQuestionInput = {
  id: string;
  title: string;
  /** The answer: the card body, or the turn's closing text for a fallback. */
  outcome: string | null;
  repoId?: string | null;
  projectId?: string;
  /** The card that carried the answer, when there was one. */
  cardId?: string;
  actor?: TaskEventActor;
  /** Why the host filed it instead of the agent (fallback provenance). */
  fallback?: "question";
};

/** A fleet/self operation the Firstmate performed: filed done/settled. */
export type FileOperationInput = {
  id: string;
  title: string;
  /** The tool's own result text. */
  outcome: string;
  tool: string;
  repoId?: string | null;
  projectId?: string;
  actor?: TaskEventActor;
};

/**
 * A decision the Firstmate raised that gates no recorded work: an open
 * `decision` task waiting on the captain (its card id is the gate ref, the
 * same shape a parked decision carries).
 */
export type FileDecisionInput = {
  id: string;
  title: string;
  cardId: string;
  repoId?: string | null;
  projectId?: string;
  actor?: TaskEventActor;
};

/**
 * The capture side (design section 6): the `captain_asks` rows each turn
 * opens, attached to tasks with their `ask` event, their answers and
 * delivery, and the question, decision and operation kinds the attaching
 * paths file. Reached as `tasks.capture`.
 */
export class TaskCapture {
  private readonly threads: AskThreads;

  constructor(
    private readonly writer: TaskWriter,
    private readonly tasks: TaskService,
  ) {
    this.threads = new AskThreads(writer, tasks);
  }

  getAsk(id: string): AskRecord | undefined {
    return this.writer.asks.get(id);
  }

  /** The view's ask receipt; the saved event and exact model history remain untouched. */
  eventReceipt(event: Pick<TaskEvent, "kind" | "text" | "data" | "ref">): string {
    if (event.kind !== "ask") return event.text;
    const id = typeof event.data?.askId === "string" ? event.data.askId : event.ref;
    const ask = id ? this.getAsk(id) : undefined;
    return ask ? askReceipt({ text: event.text, deliveryFacts: ask.deliveryFacts }) : event.text;
  }

  /** Asks whose turn has not closed - the host's turn scope. */
  listOpenAsks(): AskRecord[] {
    return this.writer.asks.listOpen();
  }

  /** The messages the answer-delivery check holds in one state. */
  listAsksByDelivery(delivery: AskDelivery): AskRecord[] {
    return this.writer.asks.listByDelivery(delivery);
  }

  /** The asks that first attached to this task. */
  asksFor(id: string): AskRecord[] {
    return this.writer.asks.listFor(id);
  }

  /**
   * The tasks whose work this one was handed: the work it took over (a
   * `replaced-by` link into it), the attempt it retries (`retry-of`) and the
   * task whose branch it continues (`branch-source`). The cards' You asked
   * line and what the captain already allowed (`sameWorkLineage`) read it.
   */
  handedOver(taskId: string): string[] {
    return [
      ...this.writer.links.listTo(taskId, "replaced-by").map((link) => link.fromId),
      ...this.writer.references
        .list(taskId)
        .filter((entry) => entry.kind === "retry-of" || entry.kind === "branch-source")
        .flatMap((entry) => this.tasks.graph.referenceTarget(entry)?.id ?? []),
    ];
  }

  /**
   * Where a task's work came from, for its cards' line (INF-1610, INF-2326;
   * docs/card-authoring.md "The You asked line"): read from the saved
   * messages and origins through the task graph, never from any card's
   * words. The walk is `originAbout` in `taskOrigin.ts`.
   */
  originAbout(id: string): TaskOriginLine | undefined {
    // The walk asks each task's events up to three times; it reads them once.
    const events = new Map<string, TaskEvent[]>();
    return originAbout(
      {
        get: (taskId) => this.writer.store.get(taskId),
        handedOver: (taskId) => this.handedOver(taskId),
        basis: (taskId) => {
          const basis = this.writer.references.list(taskId).find((entry) => entry.kind === "basis");
          return basis ? this.tasks.graph.referenceTarget(basis)?.id : undefined;
        },
        // A merge that set an existing task to start links it to that merge
        // after the task was filed (INF-3846 piece 4): that link is not where
        // its work came from, so its own line stays the one it had. The link
        // says itself whether the merge filed the task, even when both fall
        // in one millisecond (`TaskGraph.mergesThatFiled`, INF-5647).
        followsUp: (taskId) => {
          const filedBy = new Set(this.tasks.graph.mergesThatFiled(taskId));
          return this.writer.links
            .listFrom(taskId, "discovered-from")
            .filter((link) => link.actor !== "host" || filedBy.has(link.toId))
            .map((link) => link.toId);
        },
        // The app files a merge's step and links it to that merge in one
        // write (`TaskDeliveries.activateAfterMergeSteps`).
        filedAtMerge: (taskId) => this.tasks.graph.mergesThatFiled(taskId).length > 0,
        events: (taskId) => {
          let read = events.get(taskId);
          if (!read) {
            read = this.writer.events.listOriginEvents(taskId);
            events.set(taskId, read);
          }
          return read;
        },
        ask: (askId) => this.writer.asks.get(askId),
        askReach: (askId) => this.writer.events.taskIdsWithRef("ask", askId).length,
      },
      id,
    );
  }

  /** Where this task's own work began, when it saved an origin (INF-2326): an automation, a click or a report. */
  savedOrigin(id: string): SavedOrigin | undefined {
    for (const event of this.writer.events.listFor(id)) {
      const saved = savedOriginOf(event);
      if (saved) return saved;
    }
    return undefined;
  }

  /**
   * The automation this task was filed or started while answering, and when
   * that was saved: what an automation run's history reads to keep only the
   * tasks its own rule started (docs/automation.md, "Deliveries").
   */
  automationStart(id: string): { ruleId: string; at: number } | undefined {
    for (const event of this.writer.events.listFor(id)) {
      const saved = savedOriginOf(event);
      if (saved)
        return saved.kind === "automation" ? { ruleId: saved.ruleId, at: event.at } : undefined;
    }
    return undefined;
  }

  /** The task whose crewmate's report this task's work came from, when it saved one (INF-2326). */
  reportOrigin(id: string): string | undefined {
    for (const event of this.writer.events.listFor(id)) {
      const saved = savedOriginOf(event);
      if (saved) return saved.kind === "report" ? saved.taskId : undefined;
    }
    return undefined;
  }

  /**
   * Save where a task's work came from when it was not a message of the
   * captain's (INF-2326): an automation run, a card click or a crewmate's
   * report the first mate answered by filing or starting it. The first one
   * saved stands; a later one adds nothing.
   */
  saveOrigin(taskId: string, origin: SavedOrigin): boolean {
    const run = this.writer.write((): boolean => {
      this.writer.mustGet(taskId);
      if (this.writer.events.listFor(taskId).some((event) => savedOriginOf(event))) return false;
      const reporter = origin.kind === "report" ? this.writer.store.get(origin.taskId) : undefined;
      this.writer.addEvent({
        taskId,
        at: this.writer.now(),
        actor: "host",
        kind: "note",
        text: originNoteText(origin, reporter?.key || reporter?.title),
        data: { [ORIGIN_NOTE_KEY]: origin },
        feed: false,
      });
      return true;
    });
    return run();
  }

  /**
   * The work a captain's messages cover, and the messages above a task: the
   * one walk (`AskThreads`, docs/task-capture.md "How a message ends").
   */
  askCoverage(
    askIds: readonly string[],
    before?: number,
    options?: { origins?: boolean },
  ): ThreadCoverage {
    return this.threads.coverage(askIds, before, options);
  }

  /** The captain's messages whose thread includes this task, newest first (`AskThreads.asksAbove`). */
  asksAbove(id: string, ties = true): AskRecord[] {
    return this.threads.asksAbove(id, ties);
  }

  /**
   * The followed messages that have not ended, oldest first, each its own
   * thread (INF-6115). `running` also reads the messages whose reply is
   * still running.
   */
  openThreadAsks(running = false): AskRecord[] {
    return this.writer.asks.listNotEnded(running);
  }

  /** The captain accepted a card as the answer to this message. */
  acceptAnswer(askId: string, cardId: string): void {
    const at = this.writer.now();
    this.writer.write(() => this.writer.asks.setAccepted(askId, cardId, at))();
  }

  /** This message is answered, on a card or by a reaction: final. */
  markAnswered(askId: string, cardId: string | null): void {
    const at = this.writer.now();
    this.writer.write(() => this.writer.asks.setAnswered(askId, cardId, at))();
  }

  /**
   * The messages open when the app moved to one thread per message, with
   * the message whose merged thread each was in then (`root`, from the
   * retired `continues` column, read only here), until the one-time step
   * carries each (INF-6115).
   */
  threadCarries(): { ask: AskRecord; members: AskRecord[] }[] {
    return this.writer.asks.pendingCarries();
  }

  /**
   * The one-time step kept a message's thread whole: each task of its
   * merged thread's still-open work it now attaches to as work
   * (`CARRIED_VIA`), each task it now waits on or is answered from as a tie,
   * each response request it carries, and the crewmate ask its thread
   * already spent. Marked done in the same write.
   */
  carryThread(
    askId: string,
    carry: {
      work: readonly string[];
      ties: readonly string[];
      requests: readonly { taskId: string; requestId: string }[];
      entries: readonly DeliveryEntry[];
      crewmateAskedAt: number | null;
    },
  ): void {
    const at = this.writer.now();
    this.writer.write(() => {
      for (const taskId of carry.work) {
        if (!this.writer.store.get(taskId)) continue;
        this.attachAsk(askId, taskId, CARRIED_VIA, false);
      }
      for (const taskId of carry.ties) {
        if (!this.writer.store.get(taskId) || this.writer.events.askEvent(taskId, askId)) continue;
        this.attachAsk(askId, taskId, CARRIED_VIA, false, true);
      }
      for (const { taskId, requestId } of carry.requests) {
        if (!this.writer.store.get(taskId)) continue;
        if (this.writer.events.requestAsks(taskId, requestId).includes(askId)) continue;
        if (!this.writer.events.askEvent(taskId, askId))
          this.attachAsk(askId, taskId, CARRIED_VIA, false, true);
        const event = this.writer.events.askEvent(taskId, askId);
        if (event) this.writer.events.addAskRequest(event.id, requestId);
      }
      const ask = this.writer.asks.get(askId);
      if (ask && carry.entries.length > 0)
        this.writer.asks.setDelivery(askId, ask.delivery, {
          ...ask.deliveryFacts,
          entries: [...ask.deliveryFacts.entries, ...carry.entries],
        });
      if (carry.crewmateAskedAt !== null && ask?.crewmateAskedAt === null)
        this.writer.asks.setCrewmateAsked(askId, carry.crewmateAskedAt);
      this.writer.asks.markCarried(askId, at);
    })();
  }

  /** The once a message's last crewmate was asked for its answering card. */
  markCrewmateAsked(askId: string): void {
    const at = this.writer.now();
    this.writer.write(() => this.writer.asks.setCrewmateAsked(askId, at))();
  }

  /** Complete text files the messages attached to this task kept at acceptance. */
  messageFiles(id: string): MessageFile[] {
    return this.writer.events
      .listFor(id)
      .filter((event) => event.kind === "ask" && event.ref)
      .flatMap((event) => this.writer.asks.get(event.ref as string)?.messageFiles ?? []);
  }

  /**
   * The captain's pictures, in message order, each copy once: each message's,
   * and those a choice on the task's card carried (`choice-attachments.md`).
   */
  pictures(id: string): AttachmentRef[] {
    const seen = new Set<string>();
    return this.writer.events
      .listFor(id)
      .flatMap((event) => {
        if (event.kind === "card_resolved") {
          const carried = choiceCarriedRecordSchema.safeParse(event.data?.carried);
          return carried.success ? (carried.data.pictures ?? []) : [];
        }
        return event.kind === "ask" && event.ref
          ? (this.writer.asks.get(event.ref)?.attachments ?? [])
          : [];
      })
      .filter((ref) => {
        if (seen.has(ref.id)) return false;
        seen.add(ref.id);
        return true;
      });
  }

  listAsks(): AskRecord[] {
    return this.writer.asks.list();
  }

  /** The captain's newest message's id: the one a turn's reply line answers. */
  latestAskId(): string | undefined {
    return this.writer.asks.latestId();
  }

  /** The last turn above the input: the newest message and its reply line. */
  lastTurn(): LastTurn | null {
    return this.writer.asks.lastTurn();
  }

  /** The Firstmate's reply line beside a message, kept for the next launch. */
  setAskReply(askId: string, reply: LastTurnReply): void {
    this.writer.write(() => this.writer.asks.setReply(askId, reply))();
  }

  /**
   * The task as it stands right now, as a copy a card choice keeps beside
   * it (docs/card-evidence.md): its identity and state, its gate, what its
   * delivery last read, what it waits on, and the asks it carries. Read
   * before the choice moves the task, so it is the input the choice was
   * made on, never the row it became. Reads only.
   */
  decisionContext(id: string): CardDecisionContext | undefined {
    const record = this.writer.store.get(id);
    if (!record) return undefined;
    const delivery = record.delivery;
    return {
      at: this.writer.now(),
      taskId: record.id,
      key: record.key,
      kind: record.kind,
      status: record.status,
      activity: record.activity,
      parentId: record.parentId,
      gate: record.gate
        ? { kind: record.gate.kind, ...(record.gate.ref ? { ref: record.gate.ref } : {}) }
        : null,
      delivery: delivery
        ? {
            mode: delivery.mode,
            ...(delivery.changeLabel ? { changeLabel: delivery.changeLabel } : {}),
            ...(delivery.headSha ? { headSha: delivery.headSha } : {}),
            ...(delivery.ci ? { checks: delivery.ci } : {}),
            ...(delivery.ciAt !== undefined ? { checksAt: delivery.ciAt } : {}),
            ...(delivery.reviewVerdict ? { review: delivery.reviewVerdict } : {}),
            ...(delivery.reviewSha ? { reviewSha: delivery.reviewSha } : {}),
            ...(delivery.reviewedAt !== undefined ? { reviewedAt: delivery.reviewedAt } : {}),
            settlePending: Boolean(record.pendingSettle),
          }
        : null,
      blockers: this.tasks.graph
        .blockers(id)
        .map((blocker) => ({ id: blocker.id, status: blocker.status })),
      asks: this.asksFor(id).map((ask) => ask.id),
    };
  }

  /**
   * The open decision row a card carries: a decision the Firstmate raised
   * without a task (P1), which keeps the card id as its captain gate's ref
   * and lives exactly as long as the card is on the stack.
   */
  openDecisionFor(cardId: string): TaskRecord | undefined {
    return this.writer.store
      .listByStatus("open")
      .find((record) => record.kind === "decision" && record.gate?.ref === cardId);
  }

  /**
   * The open row that exists only for a card: a Firstmate decision filed
   * without a task, or the operation row a host card with no task files
   * (`fileHostCardTask`). Either keeps the card id as its captain gate's
   * ref and closes when the card leaves the stack.
   */
  openCardTaskFor(cardId: string): TaskRecord | undefined {
    const waiting = this.writer.store
      .listByStatus("open")
      .find(
        (record) =>
          (record.kind === "decision" ||
            (record.kind === "operation" && !record.delivery?.captainAction)) &&
          record.gate?.kind === "captain" &&
          record.gate.ref === cardId,
      );
    if (waiting) return waiting;
    // A chosen card may leave its own operation awaiting a verified effect.
    // The immutable raised-event ref retains that identity after its captain gate clears.
    const id = this.writer.events.latestTaskForRef("card_raised", cardId);
    const pending = id ? this.writer.store.get(id) : undefined;
    return pending?.status === "open" && pending.kind === "operation" && !pending.gate
      ? pending
      : undefined;
  }

  /**
   * A settled run's later step (docs/orchestrator-contract.md, "Settled
   * runs"): the run's one operation, in its place, says where the setting
   * stands now.
   */
  reviseOperation(id: string, input: { title: string; outcome: string }): void {
    const at = this.writer.now();
    const run = this.writer.write(() => {
      const record = this.writer.mustGet(id);
      if (record.kind !== "operation") throw new Error(`${record.key} is not an operation.`);
      this.writer.patch(id, {
        title: savedTaskTitle(input.title),
        outcome: input.outcome,
        outcomeSummary: reportSummary(input.outcome) || null,
        closedAt: at,
        updatedAt: at,
      });
    });
    run();
  }

  onCaptainInput(listener: Parameters<TaskWriter["asks"]["onCaptainInput"]>[0]): () => void {
    return this.writer.asks.onCaptainInput(listener);
  }

  originalTurnsBefore(id: string) {
    return this.writer.asks.originalTurnsBefore(id);
  }

  /** The private original caption, including known empty captions; no history inference. */
  captainAskText(id: string): string | undefined {
    return this.writer.asks.captainText(id);
  }

  /** A captain turn begins: the ask row exists before the agent runs. */
  openAsk(input: OpenAskInput): AskRecord {
    const record: AskRecord = {
      id: input.id,
      at: input.at ?? this.writer.now(),
      text: input.text,
      images: input.images ?? [],
      attachments: input.attachments ?? [],
      messageFiles: input.messageFiles ?? [],
      hintTaskId: input.hintTaskId ?? null,
      taskId: null,
      attachedVia: null,
      attachedAt: null,
      turnState: "open",
      delivery: "pending",
      deliveryFacts: {
        entries: [],
        ...(input.retryOf ? { retryOf: input.retryOf } : {}),
        ...(input.receipt !== undefined ? { receipt: input.receipt } : {}),
      },
      noticeCardId: null,
      followed: true,
      continues: null,
      answerCardId: null,
      acceptedAt: null,
      answeredAt: null,
      crewmateAskedAt: null,
      // A message the captain's own command sent says so (INF-3898 piece 2).
      ...(throughNow() ? { through: THROUGH_THE_COMMAND } : {}),
    };
    this.writer.asks.insert(record, input.captainText);
    return record;
  }

  /**
   * Attach an ask to a task: the first attachment fills the ask's columns,
   * every attachment writes an `ask` event on the task (one ask may be about
   * several tasks), in one transaction. Idempotent per (ask, task).
   *
   * With `tie`, the message is about the task without making it the
   * message's work (docs/task-capture.md "How a message ends"): a question
   * the first mate asked there, or a change the task refused. A later
   * attachment without `tie` makes it work.
   */
  attachAsk(
    askId: string,
    taskId: string,
    via: AskAttachedVia,
    starts?: boolean,
    tie?: boolean,
  ): boolean {
    const at = this.writer.now();
    const run = this.writer.write((): boolean => {
      const ask = this.writer.asks.get(askId);
      if (!ask) throw new Error(`Unknown ask "${askId}".`);
      this.writer.mustGet(taskId);
      const already = this.writer.events.askEvent(taskId, askId);
      // A steer to a task the message is tied to - "carry on" after its
      // answer - passes guidance on and leaves the tie as it is.
      if (already?.data?.tie === true && via === "tool:steer_crewmate") return false;
      if (already) {
        // A tie becomes work once an action for the message takes effect there.
        if (!tie && already.data?.tie === true) this.writer.events.clearAskTie(already.id);
        return false;
      }
      const first = this.writer.asks.attach(askId, taskId, via, at);
      this.writer.patch(taskId, { updatedAt: at });
      this.writer.addEvent({
        taskId,
        at,
        actor: "captain",
        kind: "ask",
        text: ask.text || (ask.images.length > 0 ? "(image attachment)" : "(empty)"),
        data: {
          askId,
          via,
          first,
          // Whether this message filed or started the task (INF-2326), when
          // the caller knows: the line under its cards reads the message
          // that did (`taskOrigin.ts`, `startedBy`).
          ...(starts === undefined ? {} : { starts }),
          ...(tie ? { tie: true } : {}),
          ...(ask.images.length > 0 ? { images: ask.images.length } : {}),
        },
        ref: askId,
        feed: false,
      });
      return true;
    });
    return run();
  }

  /**
   * A response request the first mate asked of a task for a message: saved
   * on the message's `ask` event there, tying the message to the task first
   * when nothing has yet. While the request is open the message waits for it.
   */
  tieRequest(askId: string, taskId: string, requestId: string): void {
    const run = this.writer.write(() => {
      if (!this.writer.events.askEvent(taskId, askId))
        this.attachAsk(askId, taskId, "tool:steer_crewmate", undefined, true);
      const event = this.writer.events.askEvent(taskId, askId);
      if (event) this.writer.events.addAskRequest(event.id, requestId);
    });
    run();
  }

  /** The messages a response request on a task was asked for. */
  requestAsks(taskId: string, requestId: string): AskRecord[] {
    return this.writer.events
      .requestAsks(taskId, requestId)
      .flatMap((id) => this.writer.asks.get(id) ?? []);
  }

  /**
   * Save one thing that took effect (or was refused) after Firstmate read
   * these messages (answer delivery). Only a message still being judged
   * takes it; a covered, unresolved or legacy one is left as it is.
   */
  noteDelivery(askIds: readonly string[], entry: DeliveryEntry): void {
    const run = this.writer.write(() => {
      for (const id of askIds) {
        const ask = this.writer.asks.get(id);
        if (!ask || !JUDGEABLE_DELIVERY.includes(ask.delivery)) continue;
        this.writer.asks.setDelivery(id, ask.delivery, {
          ...ask.deliveryFacts,
          entries: [...ask.deliveryFacts.entries, entry],
        });
      }
    });
    run();
  }

  /** Move a message to a delivery state, keeping its facts unless new ones are given. */
  setAskDelivery(askId: string, delivery: AskDelivery, facts?: DeliveryFacts): void {
    const run = this.writer.write(() => this.writer.asks.setDelivery(askId, delivery, facts));
    run();
  }

  /** A message the turn never read: it waits for the turn that does, with no facts of this one. */
  releaseAskDelivery(askId: string): void {
    const run = this.writer.write(() => {
      const ask = this.writer.asks.get(askId);
      if (!ask || !JUDGEABLE_DELIVERY.includes(ask.delivery)) return;
      this.writer.asks.setDelivery(askId, ask.delivery === "retrying" ? "retrying" : "pending", {
        ...ask.deliveryFacts,
        entries: [],
      });
    });
    run();
  }

  /** The one notice raised for a message: set once, in the same write that marks it unresolved. */
  markAskUnresolved(askId: string, cardId: string): boolean {
    const run = this.writer.write((): boolean => {
      const ask = this.writer.asks.get(askId);
      // A notice taken back when an answering card went up comes back under its own id.
      if (!ask || ask.delivery === "unresolved") return false;
      if (ask.noticeCardId && ask.noticeCardId !== cardId) return false;
      this.writer.asks.setDelivery(askId, "unresolved");
      this.writer.asks.setNoticeCard(askId, cardId);
      return true;
    });
    return run();
  }

  /** The turn ended; the ask's state is final. */
  closeAsk(askId: string, turnState: Exclude<AskTurnState, "open">): AskRecord | undefined {
    const run = this.writer.write(() => {
      this.writer.asks.setTurnState(askId, turnState);
      const ask = this.writer.asks.get(askId);
      // The ask rides the task's detail; its final state is a change there.
      if (ask?.taskId) this.writer.touch(ask.taskId);
      return ask;
    });
    return run();
  }

  /** A standalone question task, born closed with its answer (D1). */
  fileQuestion(input: FileQuestionInput): TaskRecord {
    const at = this.writer.now();
    const actor = input.actor ?? "firstmate";
    const run = this.writer.write((): TaskRecord => {
      this.tasks.create({
        id: input.id,
        kind: "question",
        title: input.title,
        prompt: "",
        repoId: input.repoId ?? null,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        actor,
        createdAt: at,
      });
      const summary = input.outcome ? reportSummary(input.outcome) || null : null;
      this.writer.patch(input.id, {
        outcome: input.outcome,
        outcomeSummary: summary,
        status: "done",
        activity: null,
        closedReason: "answered",
        closedAt: at,
        updatedAt: at,
      });
      if (input.cardId) {
        this.writer.addEvent({
          taskId: input.id,
          at,
          actor,
          kind: "card_raised",
          text: `answered on card "${input.title}"`,
          data: { cardId: input.cardId, kind: "note" },
          ref: input.cardId,
          feed: false,
        });
      }
      this.writer.addEvent({
        taskId: input.id,
        at,
        actor,
        kind: "status",
        text: input.fallback ? "noted (nothing attached this turn)" : "answered",
        data: {
          status: "done",
          reason: "answered",
          ...(input.fallback ? { fallback: input.fallback } : {}),
        },
        feed: false,
      });
      return this.writer.mustGet(input.id);
    });
    return run();
  }

  /** A fleet/self operation the Firstmate performed, filed done/settled. */
  fileOperation(input: FileOperationInput): TaskRecord {
    const at = this.writer.now();
    const actor = input.actor ?? "firstmate";
    const run = this.writer.write((): TaskRecord => {
      this.tasks.create({
        id: input.id,
        kind: "operation",
        title: input.title,
        prompt: "",
        repoId: input.repoId ?? null,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        actor,
        createdAt: at,
      });
      this.writer.patch(input.id, {
        outcome: input.outcome,
        outcomeSummary: reportSummary(input.outcome) || null,
        status: "done",
        activity: null,
        closedReason: "settled",
        closedAt: at,
        updatedAt: at,
      });
      this.writer.addEvent({
        taskId: input.id,
        at,
        actor,
        kind: "status",
        text: `settled by ${input.tool}`,
        data: { status: "done", reason: "settled", tool: input.tool },
        feed: false,
      });
      return this.writer.mustGet(input.id);
    });
    return run();
  }

  /**
   * The row a host card with actions and no task files (docs/card-authoring.md,
   * "A card places the gate"): an open `operation` waiting on the captain,
   * its card id the gate ref, so "waiting on you" counts the host's own
   * asks the way it counts every other card. Explicit resolution closes
   * the row; the minus leaves its card and captain gate pending.
   */
  fileHostCardTask(input: { id: string; title: string; cardId: string }): TaskRecord {
    const at = this.writer.now();
    const run = this.writer.write((): TaskRecord => {
      this.tasks.create({
        id: input.id,
        kind: "operation",
        title: input.title,
        prompt: "",
        repoId: null,
        gate: { kind: "captain", ref: input.cardId },
        actor: "host",
        createdAt: at,
      });
      this.writer.addEvent({
        taskId: input.id,
        at,
        actor: "host",
        kind: "card_raised",
        text: `decision raised on card "${input.title}"`,
        data: { cardId: input.cardId, kind: "decision" },
        ref: input.cardId,
        feed: false,
      });
      return this.writer.mustGet(input.id);
    });
    return run();
  }

  /** An open decision task waiting on the captain; its card id is the gate ref. */
  fileDecision(input: FileDecisionInput): TaskRecord {
    const at = this.writer.now();
    const actor = input.actor ?? "firstmate";
    const run = this.writer.write((): TaskRecord => {
      this.tasks.create({
        id: input.id,
        kind: "decision",
        title: input.title,
        prompt: "",
        repoId: input.repoId ?? null,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        gate: { kind: "captain", ref: input.cardId },
        actor,
        createdAt: at,
      });
      this.writer.addEvent({
        taskId: input.id,
        at,
        actor,
        kind: "card_raised",
        text: `decision raised on card "${input.title}"`,
        data: { cardId: input.cardId, kind: "decision" },
        ref: input.cardId,
        feed: false,
      });
      return this.writer.mustGet(input.id);
    });
    return run();
  }

  /** The task a card was raised on, if any (a revision keeps its row). */
  taskForCard(cardId: string): TaskRecord | undefined {
    const taskId = this.writer.events.latestTaskForRef("card_raised", cardId);
    return taskId ? this.writer.store.get(taskId) : undefined;
  }

  /**
   * A note card answered a question about this task: the body rides the
   * event. `asOutcome` also makes it the record's outcome (a standalone
   * question revised in place).
   */
  recordAnswer(
    id: string,
    input: {
      cardId: string;
      title: string;
      body: string;
      actor?: TaskEventActor;
      asOutcome?: boolean;
    },
  ): void {
    const at = this.writer.now();
    const run = this.writer.write(() => {
      this.writer.mustGet(id);
      this.writer.patch(id, {
        updatedAt: at,
        ...(input.asOutcome
          ? { outcome: input.body, outcomeSummary: reportSummary(input.body) || null }
          : {}),
      });
      this.writer.addEvent({
        taskId: id,
        at,
        actor: input.actor ?? "firstmate",
        kind: "answered",
        text: input.title,
        data: { cardId: input.cardId, body: input.body },
        ref: input.cardId,
        feed: false,
      });
    });
    run();
  }

  /** When a card on the task other than `exceptCardId` was last resolved, if one ever was. */
  cardResolvedAt(id: string, exceptCardId: string): number | undefined {
    return this.writer.events.latestAtOtherRef(id, "card_resolved", exceptCardId);
  }

  /** When a card with this id was last raised on the task, if it ever was. */
  cardRaisedAt(id: string, cardId: string): number | undefined {
    return this.writer.events.latestAtForRef(id, "card_raised", cardId);
  }

  /**
   * A card about this task went on the stack. A crewmate's card is recorded
   * when it reaches the stage, with the close-out that released it
   * (`closeOut`), and again when it comes back with an answer to the
   * captain's reply (`returned`) - the moment the replay counts a late
   * return from (docs/card-threads.md "When a card reaches the stage").
   */
  recordCardRaised(
    id: string,
    input: {
      cardId: string;
      kind: string;
      title: string;
      actor?: TaskEventActor;
      closeOut?: string;
      returned?: boolean;
    },
  ): void {
    const at = this.writer.now();
    const run = this.writer.write(() => {
      if (!this.writer.store.get(id)) return;
      this.writer.patch(id, { updatedAt: at });
      this.writer.addEvent({
        taskId: id,
        at,
        actor: input.actor ?? "firstmate",
        kind: "card_raised",
        text: `${input.kind} card "${input.title}"${input.returned ? " back with its answer" : ""}`,
        data: {
          cardId: input.cardId,
          kind: input.kind,
          ...(input.closeOut ? { closeOut: input.closeOut } : {}),
          ...(input.returned ? { returned: true } : {}),
        },
        ref: input.cardId,
        feed: false,
      });
    });
    run();
  }

  /** Verified delivery, not a verdict about whether the task is finished (INF-1426). */
  recordResultHandoff(
    id: string,
    handoff: { taskId: string } | { cardId: string; action: string },
  ): void {
    this.tasks.note(id, "Its result was handed on.", {
      news: false,
      feed: false,
      data: { resultHandoff: handoff, journal: true },
      ...("taskId" in handoff ? { about: [handoff.taskId] } : {}),
    });
  }

  resultHandoffOf(id: string): boolean {
    return this.writer.events
      .listFor(id)
      .some((event) => event.kind === "note" && event.data?.resultHandoff !== undefined);
  }

  /**
   * The captain's reply under a card started this task: `spawn_crewmate`'s
   * `from_card` wrote its line in that card's thread, which it does only
   * under a captain's reply (`writeStartedLine`). Kept on the started task,
   * so a close of the card's own task can read where its follow-up came
   * from (INF-4526).
   */
  recordStartedFromCard(id: string, start: { cardId: string; reply: number }): void {
    this.tasks.note(id, "Started from your reply under a card.", {
      news: false,
      feed: false,
      data: { startedFromCard: start, journal: true },
    });
  }

  /** The cards whose captain's reply started this task (`recordStartedFromCard`). */
  startedFromCardsOf(id: string): string[] {
    return this.writer.events.listFor(id).flatMap((event) => {
      const start = event.kind === "note" ? event.data?.startedFromCard : undefined;
      const cardId =
        start && typeof start === "object" ? (start as { cardId?: unknown }).cardId : undefined;
      return typeof cardId === "string" ? [cardId] : [];
    });
  }

  /** A card about this task left the stack (an action, Later, or a dismiss). */
  recordCardResolved(
    id: string,
    input: {
      cardId: string;
      title: string;
      action: string;
      actor?: TaskEventActor;
      /** The captain's answers to the body's own questions (contract 4.22). */
      answers?: CardAnswer[];
      /**
       * The card evidence's observation of the same choice or close: the
       * explicit alias the unified timeline folds this event into.
       */
      observation?: string;
      /** What else the card's field sent with the choice (`choice-attachments.md`). */
      carried?: ChoiceCarriedRecord;
    },
  ): void {
    const at = this.writer.now();
    const run = this.writer.write(() => {
      if (!this.writer.store.get(id)) return;
      this.writer.patch(id, { updatedAt: at });
      this.writer.addEvent({
        taskId: id,
        at,
        actor: input.actor ?? "captain",
        kind: "card_resolved",
        text: `card "${input.title}": ${input.action}`,
        data: {
          cardId: input.cardId,
          action: input.action,
          ...(input.answers ? { answers: input.answers } : {}),
          ...(input.observation ? { observation: input.observation } : {}),
          ...(input.carried ? { carried: input.carried } : {}),
        },
        ref: input.cardId,
        feed: false,
      });
    });
    run();
  }
}
