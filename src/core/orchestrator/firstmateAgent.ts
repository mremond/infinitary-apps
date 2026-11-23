import type { FirstmateAgentOptions, FirstmateTurnOutcome } from "./firstmateAgentOptions";

export type {
  FirstmateAgentOptions,
  FirstmateTurnOutcome,
  RunningComputerVersion,
} from "./firstmateAgentOptions";

import { createHash, randomUUID } from "node:crypto";
import type { ActionName } from "@shared/actions";
import type { AttachmentRef } from "@shared/attachments";
import { type CutOff, isAuthFailureMessage } from "@shared/authFailure";
import type { TurnImage } from "@shared/cards";
import type { TurnFailureReason, TurnTrigger } from "@shared/diagnostics";
import { AUTOMATIC_EMOTE_WORDS, type HostReplyEmote } from "@shared/emotes";
import { PROGRESS_TOOL_NAMES } from "@shared/events";
import type { LastTurnReply } from "@shared/lastTurn";
import { isRunawayProviderError, plainProblem } from "@shared/plainProblem";
import type { QuotaSnapshotView } from "@shared/quota";
import {
  frameServedInput,
  type ServedSegmentInput,
  type ServedWakeOrigin,
} from "@shared/servedFrame";
import { THROUGH_THE_COMMAND, throughNow } from "../askedFromTheCommand";
import { AttachmentUnavailableError, keepImages, loadImages } from "../attachments";
import type { CoreDispatch } from "../dispatcher";
import { classifyInboxBatch, type KnowledgeOrigin } from "../knowledge/origin";
import type { MessageFile } from "../overflow";
import { FIRSTMATE_CONTRACT_VERSION, firstmatePromptSha } from "../pi/piResources";
import type { ModelSession, SessionEvent } from "../session/session";
import {
  FIRSTMATE_RECIPIENT,
  INBOX_ATTEMPT_MAX,
  type InboxRow,
  WAKE_COALESCE_MS,
} from "../storage/inboxStore";
import type { DeliveryNote } from "./answerDelivery";
import { AnswerDeliveryCheck } from "./answerDeliveryCheck";
import { AskCapture, type TurnOrigin } from "./askCapture";
import { QUIET_CARD_MS, QUIET_FEED_MS } from "./crewWatch";
import { DecisionCapture, type ServedInput } from "./decisionCapture";
import { FirstmateContext } from "./firstmateContext";
import { premiumCanServe } from "./firstmateModelPick";
import { FirstmateSeat, formatFlagshipError } from "./firstmateSeat";
import { buildFirstmateTools, type FirstmateToolHost } from "./firstmateTools";
import { FIRSTMATE_FAILURE_CARD_ID } from "./hostCards";
import type { LocalOrchestratorSeat } from "./localOrchestrator";
import { type ReplyFacts, replyLine, replyWords } from "./replyLine";
import {
  FIRSTMATE_CAPTAIN_THINKING_LEVEL,
  FIRSTMATE_OPERATIONAL_THINKING_LEVEL,
  type FirstmateThinkingLevel,
  keptMessageWords,
} from "./seat";
import { appendDigest, digestEntry, digestFor } from "./seatDigest";
import { turnOriginOf } from "./turnOrigins";
import {
  aboutCardIdFromRef,
  captainTurn,
  captainTurnRef,
  drainWakes,
  renderWake,
  rowAttachments,
  type TypedWake,
} from "./wakes";

/** The inbox ref of a captain turn parked on the firstmate lane (`./wakes`). */
export { CAPTAIN_TURN_REF } from "./wakes";

/** The progress a shortening of the conversation reports itself by. */
const [FOLD_TOOL] = PROGRESS_TOOL_NAMES;
/**
 * The Firstmate agent: one persistent embedded Pi session that takes every
 * user turn and decides answer vs ask vs steer vs spawn (the orchestrator
 * loop; docs/architecture.md section 2). Its output contract is cards-only:
 * emit_card is the single card channel. Final assistant text is unused for
 * the UI and is never a feed line or chat (captain refinement 4a).
 *
 * Context discipline (index-plus-query): every user turn carries a compact
 * [fm-op] context block - registered repos, the crew, the backlog's count,
 * open cards and messages, quota, own source - built as one JavaScript
 * object and encoded as TOON, complete once per model context and then only
 * what changed (INF-1712), while crew_status, tasks and open_work pull
 * detail on demand. The host state is
 * authoritative; the transcript is lossy by design (Pi compaction bounds the
 * rolling session, captain decision Q4).
 *
 * Capture (task-system P1, design section 6): every captain turn opens a
 * `captain_asks` row before it runs; the tools attach it to the task they
 * act on (attach first, D1), and `AskCapture.endTurn` files whatever is
 * still loose at turn end. Nothing the captain says falls outside the task
 * system.
 */

/**
 * Name the provider and model on a flagship error so the captain can tell
 * a provider fault from a local crash: "Grok grok-4.6: Response incomplete:
 * max_time_limit" rather than a 120-character first sentence.
 */
/**
 * The running turn, field by field: what it read, did and met. One record
 * for the agent and the owners its tools and context reach; `runTurn`
 * clears what each turn starts afresh, and the wake that begins a turn
 * stamps its origin first.
 */
export type FirstmateTurn = {
  /**
   * Set when the current turn ends in a provider error (Pi resolves such
   * turns instead of rejecting), so runTurn's ack-after-handling releases
   * the inbox batch for retry instead of deleting it.
   */
  failed: boolean;
  contextOverflow: boolean;
  /** The running turn's failure text, for the ask it files. */
  error?: string;
  /** The coarse kind of this turn's first failure, for Diagnostics; never its text. */
  failureKind?: TurnFailureReason;
  /**
   * Origin and create-gate for the in-flight turn, stamped from the wake
   * (never from model prose). Default is fail-closed for creates.
   */
  origin: KnowledgeOrigin;
  canCreate: boolean;
  appWake: "captain" | "captain-choice" | "scheduled" | "other";
  /** The closing assistant text of the running turn: its reply line, a card-thread answer, a fallback question's answer. */
  closingText?: string;
  delivered: boolean;
  /** What the running turn did that can be its reply line (./replyLine). */
  replyFacts: ReplyFacts;
  /** Exact inputs waiting for the backend's read witness, in send order. */
  pendingReads: { sha: string; asks: string[]; inboxIds: number[] }[];
  read: Set<string>;
  /** The automation runs, clicks and reports the running turn has read, in reading order. */
  originsRead: TurnOrigin[];
  /**
   * The Firstmate card this captain turn is about (phase 2). Set only for
   * an idle runTurn so closing prose can land in that card's thread.
   */
  aboutCardId?: string;
  /** The captain's words the running turn answers, for the digest. */
  asked: string[];
  /**
   * The running turn carries words the captain typed - a message, parked or
   * live, or a steer - never only a card choice's label or a choice the app
   * carried out (INF-6091; the hold `card-question` reads it).
   */
  typed: boolean;
  /** The tools the running turn called, for the digest. */
  tools: string[];
  /** The running turn's typed cut-off, when it ended in one. */
  cutOff?: CutOff;
  /** That cut-off paused the seat: the ladder's card speaks for it. */
  pausing: boolean;
  /** The captain's live words the running turn carries on no inbox row. */
  liveCaptain?: {
    words: string;
    attachments?: AttachmentRef[];
    aboutCardId?: string;
    askId?: string;
  };
};

/** What each turn starts afresh: its origin, wake, card and live words were stamped before it. */
function beginTurn(turn: FirstmateTurn, asked: readonly string[], typed: boolean): void {
  Object.assign(turn, {
    failed: false,
    contextOverflow: false,
    error: undefined,
    failureKind: undefined,
    closingText: undefined,
    delivered: false,
    replyFacts: {},
    pendingReads: [],
    originsRead: [],
    asked: [...asked],
    typed,
    tools: [],
    cutOff: undefined,
    pausing: false,
  } satisfies Partial<FirstmateTurn>);
  turn.read.clear();
}

/** One conclusion for every owner settling a running turn. */
type TurnEnd =
  | { kind: "clean"; failure?: never }
  | {
      kind: "broke" | "failed";
      failure: {
        reason: TurnFailureReason;
        error: string | undefined;
        cutOff: CutOff | undefined;
        pausing: boolean;
        recoverContext: boolean;
      };
    };

function endedTurn(turn: FirstmateTurn, threw: boolean, recoveryAttempted: boolean): TurnEnd {
  if (!threw && !turn.failed) return { kind: "clean" };
  return {
    kind: threw ? "broke" : "failed",
    failure: {
      reason: turn.failureKind ?? turnFailureReason(turn.error, turn.failed),
      error: turn.error,
      cutOff: turn.cutOff,
      pausing: turn.cutOff !== undefined && turn.pausing,
      recoverContext: turn.contextOverflow && !recoveryAttempted && !threw,
    },
  };
}

type TurnPayload =
  | string
  | {
      text?: string;
      /** Readable receipt when the model needs a more detailed card projection. */
      receipt?: string;
      /** Set only at the trusted new-input boundary, before decoration. */
      captainText?: string | undefined;
      messageFiles?: MessageFile[];
      images?: Array<{ mimeType: string; data: string; name?: string }>;
      visibleCardId?: string;
      /** The task the open record card points at (P4); a hint like the card. */
      taskId?: string;
      /**
       * A captain reply on the Firstmate's own card (cards-as-threads
       * phase 2): this card IS the topic, not a maybe-hint.
       */
      aboutCardId?: string;
      /**
       * A past card shown on the stage (FI3-579): a closed card the captain is
       * reading as history. Context like the visible card, never the topic.
       */
      pastCardId?: string;
      /** The message this one sends again: Ask again on the answer-delivery notice. */
      retryOf?: string;
      /**
       * The project the captain's window is focused on (the top bar's
       * project pill, docs/project-focus.md): a hint below a shown record.
       */
      focusedProjectId?: string;
    };

/** Whether a batch of inbox rows carries a message the captain typed, not only a choice. */
function captainTypedIn(rows: readonly InboxRow[]): boolean {
  return rows.some((row) => row.origin === "captain" && row.facts?.kind === "captain-turn");
}

/** The captain's words a batch of inbox rows carries, oldest first. */
function captainWordsOf(rows: readonly InboxRow[]): string[] {
  return rows.flatMap((row) => {
    if (row.origin !== "captain") return [];
    if (row.facts?.kind === "captain-turn") return [row.facts.words];
    if (row.facts?.kind === "card-choice" && row.facts.to === "firstmate")
      return [row.facts.choice.label];
    return row.text ? [row.text] : [];
  });
}

export class FirstmateAgent {
  private directionsBlocked = false;
  private running = false;
  /**
   * The app is quitting: a turn that settles now is the next boot's to
   * reconcile, and a drain that resumes now starts no turn.
   */
  private disposed = false;
  /** The captain's steers the session accepted since the last turn ended, oldest first. */
  private acceptedSteers: AcceptedSteer[] = [];
  /**
   * The coalescing window's re-poke timer (WI-13): armed while the first
   * pending wake waits out `WAKE_COALESCE_MS` for its siblings, so a lone
   * operational wake still drains without waiting for the next tick. Unref'd
   * so it never keeps the process alive; the clock, not this timer, decides
   * drainability, so a replay coalesces from its own clock alone.
   */
  private coalesceTimer: ReturnType<typeof setTimeout> | undefined;
  /** The coalescing window in ms (WI-13), from options or `WAKE_COALESCE_MS`. */
  private readonly coalesceMs: number;
  private readonly now: () => number;
  /**
   * Watchdog signals over the orchestrator's own turn (P4 extension,
   * captain call with the empty-turn rewording): the crewmate thresholds,
   * driven by the supervisor's shared tick through the hooks. Escalation
   * only - the Firstmate is steer-only, so the card informs, never offers
   * an interrupt.
   */
  private lastEventAt = 0;
  private quietLevel: 0 | 1 | 2 = 0;
  /** One fresh-conversation recovery until a turn succeeds; never an automatic reset loop. */
  private contextRecoveryAttempted = false;
  /** The exact recovery steers sent into a running turn: never a captain's words to redeliver. */
  private recoverySteers = new Set<string>();
  private appDispatch?: CoreDispatch;
  /** Which account and model answer, and how the seat pauses, moves and comes back. */
  private readonly seat: FirstmateSeat;
  /** What each turn's context block carries, and what this model context has read of it. */
  private readonly context: FirstmateContext;
  /** What the running turn read, did and met (`FirstmateTurn`), field by field. */
  private readonly turn: FirstmateTurn = {
    failed: false,
    contextOverflow: false,
    origin: "agent",
    canCreate: false,
    appWake: "other",
    delivered: false,
    replyFacts: {},
    pendingReads: [],
    read: new Set<string>(),
    originsRead: [],
    asked: [],
    typed: false,
    tools: [],
    pausing: false,
  };

  /** A change the first mate made through the catalog: a direction kept tucks, the rest tick. */
  appActionRecorded(id: string, action?: ActionName, value?: Record<string, unknown>): void {
    this.asks.attach(id, "app_change");
    this.noteDelivery({ outcome: "action", kind: "record", tool: "app_change", ref: id });
    this.replyEmote(action === "direction" && value?.op !== "retire" ? "tuck" : "tick");
  }

  /**
   * The notice's Ask again: the captain's message sent once more, as a fresh
   * captain turn that keeps the same hint and links back to it. It runs with
   * the captain's own authority like any turn of theirs.
   */
  private async askAgain(askId: string): Promise<void> {
    const ask = this.options.tasks.capture.getAsk(askId);
    if (!ask) return;
    try {
      // Read and verify every retained copy before accepting a fresh turn.
      // Never turn a picture-only retry into an empty message, or resend
      // just the words when one of the original pictures is unavailable.
      const refs = ask.attachments ?? [];
      const images = loadImages(refs).map((image, index) => ({
        ...image,
        name: refs[index]?.name,
      }));
      await this.converse({
        text: ask.text,
        receipt: ask.deliveryFacts.receipt,
        ...(images.length ? { images } : {}),
        ...(ask.messageFiles?.length ? { messageFiles: ask.messageFiles } : {}),
        ...(ask.hintTaskId ? { taskId: ask.hintTaskId } : {}),
        retryOf: askId,
      });
    } catch (caught) {
      const why =
        caught instanceof AttachmentUnavailableError
          ? `${caught.message} Send it again with the picture.`
          : "Please send it again.";
      this.options.broadcastEvent({
        type: "firstmate_note",
        text: `Your message could not be sent again. ${why}`,
      });
    }
  }

  /**
   * Save one action that took effect (or one refused card) for the messages
   * the turn has read, or for the one message the action named with
   * `ask_id` (INF-6115): a card shown for one message is shown for it alone.
   */
  private noteDelivery(entry: DeliveryNote): void {
    const named = this.asks.namedAsk();
    this.delivery.note(entry, named ? [named] : [...this.turn.read]);
    // The same typed facts choose the reply line (./replyLine).
    if (!this.running || entry.outcome !== "action") return;
    this.turn.replyFacts.acted = true;
    // A line in a card's thread names that card, as showing it does.
    if ((entry.kind === "card" || entry.kind === "reply") && entry.ref) {
      const shown = this.options.supervisor.cards.snapshot().find((card) => card.id === entry.ref);
      if (shown?.title) this.turn.replyFacts.latest = shown.title;
    }
  }

  bindAppDispatch(dispatch: CoreDispatch): void {
    this.appDispatch = dispatch;
  }

  /** The capture guarantee: asks open per turn, attached by tools or the host. */
  private readonly asks: AskCapture;
  /** The origins the served batch's wakes offer, by inbox row (INF-2326). */
  private servedOrigins = new Map<number, TurnOrigin>();

  private expectRead(text: string, asks: string[], inboxIds: number[] = []): void {
    this.turn.pendingReads.push({
      sha: createHash("sha256").update(text).digest("hex"),
      asks,
      inboxIds,
    });
    this.context.delivery.expect(text);
  }

  /** The answer-delivery check: what took effect after each message the turn read. */
  private readonly delivery: AnswerDeliveryCheck;
  /** Messages steered into the running turn that the session refused: a later turn reads them. */
  private unreadAsks = new Set<string>();
  /** Prospective provenance: one decision per served turn (R2). */
  private readonly decisions: DecisionCapture;

  constructor(private readonly options: FirstmateAgentOptions) {
    this.coalesceMs = options.coalesceMs ?? WAKE_COALESCE_MS;
    const now = options.now;
    this.now = now ? () => now() : () => Date.now();
    this.context = new FirstmateContext(options, this.turn, this.now);
    this.seat = new FirstmateSeat(options, {
      running: () => this.running,
      tools: () => buildFirstmateTools(this.toolHost()),
      sequences: () => this.context.servedSequences(),
      contextChanged: () => this.context.delivery.reset(),
      onSessionEvent: (event) => this.onSessionEvent(event),
      drain: () => this.drainInbox(),
    });
    this.decisions = new DecisionCapture(options.tasks);
    this.asks = new AskCapture(
      options.tasks,
      (taskId, tool) => {
        this.decisions.noteTask(taskId);
        // Most tools attribute after writing. Crew control attributes BEFORE
        // attempting the action, so those callbacks confirm completion below.
        if (!["steer_crewmate", "interrupt_crewmate", "settle_task"].includes(tool)) {
          this.turn.delivered = true;
        }
      },
      () => this.turn.originsRead,
    );
    this.delivery = new AnswerDeliveryCheck({
      tasks: options.tasks,
      inbox: options.inbox,
      now: () => this.now(),
      raiseNotice: (card) => options.supervisor.cards.hostCards.raiseHostCard(card),
      withdrawNotice: (cardId) =>
        options.supervisor.cards.hostCards.withdrawHostCard(cardId, "an answering card went up"),
      cardTitle: (cardId) =>
        options.supervisor.cards.snapshot().find((card) => card.id === cardId)?.title,
      captainMessage: (cardId) =>
        options.supervisor.cards
          .thread(cardId)
          .messages.filter((message) => message.who === "captain")
          .at(-1)?.id,
      ending: options.supervisor.askEnding,
      observe: options.answerDelivery === "observe",
    });
    // The one-time step after the update to one thread per message keeps
    // each message open then whole, before anything judges it (INF-6115).
    options.supervisor.askEnding.carryThreads();
    // A quit mid-turn left asks open; they land now, marked failed. One whose
    // words still wait on the lane stays open for the turn that reads them.
    const stranded = options.tasks.capture.listOpenAsks().map((ask) => ask.id);
    this.asks.reconcileStranded(this.delivery.waitingOnLane());
    this.delivery.reconcile(stranded);
    options.supervisor.setFirstmateHooks({
      notifyOp: (wake, origin, ref) => this.notifyOp(wake, origin, ref),
      // Mid-turn, the turn's own end reads every message (`endTurn`).
      asksMoved: () => {
        if (!this.running) this.delivery.sweep();
      },
      cardPlaced: () => this.delivery.withdrawNotices(),
      firstmateCannotAnswer: () => this.cannotAnswerNow(),
      notifyCaptainChoice: (wake, ref) => this.notifyCaptainChoice(wake, ref),
      premiumCanServe: () => premiumCanServe(this.options),
      askAgain: (askId) => this.askAgain(askId),
      retryConverse: () => {
        this.seat.runawayRefused = false;
        this.seat.runawayStreak = 0;
        // The failed turn's words wait on the lane: Retry makes them due now.
        this.options.inbox.endOutage(FIRSTMATE_RECIPIENT);
        void this.drainInbox();
      },
      converseAboutCard: (cardId, text, images, messageFiles, receipt) => {
        void this.converse({
          text,
          receipt,
          images,
          ...(messageFiles?.length ? { messageFiles } : {}),
          visibleCardId: cardId,
          aboutCardId: cardId,
        });
      },
      moveFlagship: (providerId) => {
        void this.seat.moveFlagship(providerId);
      },
      tryAgain: (arg) => this.seat.tryAgain(arg),
      keepGoingOnCredits: (accountId) => this.seat.keepGoingOnCredits(accountId),
      redeemSavedReset: (accountKey) => this.options.redeemSavedReset?.(accountKey) ?? "sign-in",
      turnOnSavedResets: (accountKey) => this.options.turnOnSavedResets?.(accountKey) ?? "sign-in",
      checkQuiet: (now) => this.checkQuiet(now),
      pokeInbox: () => this.pokeInbox(),
    });
  }

  /** One user turn. Resolves once the turn is accepted, not completed. */
  async converse(turn: TurnPayload): Promise<void> {
    const text = typeof turn === "string" ? turn : (turn.text ?? "");
    const images = typeof turn === "string" || !turn.images?.length ? undefined : turn.images;
    const visibleCardId =
      typeof turn === "string" ? undefined : turn.visibleCardId?.trim() || undefined;
    const aboutCardId =
      typeof turn === "string" ? undefined : turn.aboutCardId?.trim() || undefined;
    const pastCardId = typeof turn === "string" ? undefined : turn.pastCardId?.trim() || undefined;
    // The window's focus rides every turn until the captain's next one says otherwise.
    this.context.captainFocus =
      typeof turn === "string" ? undefined : turn.focusedProjectId?.trim() || undefined;
    const trimmed = text.trim();
    if (!trimmed && !images) return;
    // An accepted turn owns copies of its pictures before anything records
    // or acknowledges it, so a parked or retried turn still has its bytes.
    const kept = images ? keepImages(randomUUID(), images) : undefined;
    // The feed line is the receipt: fire before session work so submit
    // is visible even when Firstmate is already mid-turn (steer path).
    this.options.broadcastEvent({
      type: "user_turn",
      text: typeof turn === "string" ? trimmed : (turn.receipt ?? trimmed),
      ...(throughNow() ? { through: THROUGH_THE_COMMAND } : {}),
    });
    // The ask row exists before anything runs (capture, P1): the open card
    // or the record card is the hint the fallback prefers.
    const hintTaskId = this.resolveHint(turn, visibleCardId, pastCardId);
    const ask = this.asks.open({
      text: trimmed,
      ...(typeof turn !== "string" && turn.receipt !== undefined ? { receipt: turn.receipt } : {}),
      captainText: typeof turn === "string" ? undefined : turn.captainText,
      images: images?.map((image) => ({ mimeType: image.mimeType })),
      attachments: kept,
      messageFiles: typeof turn === "string" ? [] : (turn.messageFiles ?? []),
      hintTaskId,
      ...(typeof turn !== "string" && turn.retryOf ? { retryOf: turn.retryOf } : {}),
    });
    this.asks.select([...this.turn.read].at(-1));
    this.delivery.noteAbout(ask.id, aboutCardId);
    try {
      this.options.onCaptainTurnAccepted?.();
    } catch (error) {
      // The ask is already durable. An introductory stamp cannot reject it;
      // the saved ask also excludes any uncreated introduction on recovery.
      console.warn("[firstmate] acceptance witness could not be recorded:", error);
    }
    const unavailable = this.options.knowledge?.availability();
    if (unavailable?.state === "unavailable") {
      const problem = `Your first mate has paused new work because standing directions could not be read. ${unavailable.reason}`;
      this.park({ words: trimmed, attachments: kept, aboutCardId, askId: ask.id });
      this.replyToLastMessage([ask.id], plainProblem(problem));
      this.settleTurn({ trigger: "captain", failed: true, reason: "error" });
      this.delivery.endTurn({ asks: [ask.id], held: true, unread: [] });
      return;
    }
    // Source validation can outlive an idle model change or an inbox drain.
    // Acquire the attachment only after it finishes, as drainInbox does, so
    // neither a steer nor admission retains a conversation replaced meanwhile.
    const sourceFacts = this.options.selfSourceFactsAsync
      ? await this.options.selfSourceFactsAsync()
      : undefined;
    if (this.disposed) return;
    const session = await this.seat.ensureSession();
    if (!session && this.seat.pausedAtAttach) {
      // Paused at the attach: the words wait on the inbox like admission's.
      this.park({ words: trimmed, attachments: kept, aboutCardId, askId: ask.id });
      this.keptReceipt(ask.id);
      return;
    }
    if (!session) {
      // No session could be built: the card is up, and Retry serves the
      // same durable message once a session can start.
      this.park({ words: trimmed, attachments: kept, aboutCardId, askId: ask.id });
      this.replyToLastMessage([ask.id], plainProblem(this.seat.sessionFailure));
      this.settleTurn({ trigger: "captain", failed: true, reason: "no_session" });
      this.delivery.endTurn({ asks: [ask.id], held: true, unread: [] });
      return;
    }
    // Built for the session that reads it: admission may replace the
    // session and renewed instructions may start it over, and either makes
    // the next context complete.
    const contextNow = () =>
      this.context.forTurn(visibleCardId, hintTaskId, aboutCardId, pastCardId, sourceFacts);
    const userBody = renderWake(captainTurn(trimmed, false, undefined, undefined, ask.through));
    const userSegment: ServedSegmentInput = { kind: "user", body: userBody, origin: "captain" };
    const captainOnly = (context: string): ServedInput => ({
      framed: frameServedInput([{ kind: "context", body: context }, userSegment]),
    });
    if (this.delivery.servedAlone) {
      // The running turn is an answer-delivery retry, which may only show an
      // answer: a new message would meet its refusals if it rode in as a
      // steer, so it waits on the lane for a turn of its own, and the retry
      // does not judge a message it never read. So does a turn reading an
      // answer an earlier message waits on: a card for the new message must
      // not count as the earlier one's answer.
      this.park({ words: trimmed, attachments: kept, aboutCardId, askId: ask.id });
      this.unreadAsks.add(ask.id);
      return;
    }
    if (session.isStreaming() || this.running) {
      // The user interrupting is the captain speaking: record first, then
      // steer. The row is the durable copy - a rejected or lost steer is
      // redelivered from the inbox instead of silently vanishing. The
      // captain is now waiting, so the rest of the turn runs at the captain
      // level even when it began as a low operational drain (WI-13).
      session.setThinkingLevel(FIRSTMATE_CAPTAIN_THINKING_LEVEL);
      await this.steerRecorded(
        session,
        captainOnly(contextNow()),
        trimmed,
        images,
        kept,
        aboutCardId,
        ask.id,
      );
      return;
    }
    // The pre-turn admission check: the flagship binding is re-decided only
    // here, at the idle boundary - never mid-turn.
    const admitted = await this.seat.admitTurn(session);
    if (!admitted) {
      this.park({ words: trimmed, attachments: kept, aboutCardId, askId: ask.id });
      this.keptReceipt(ask.id);
      return;
    }
    if (this.delivery.servedAlone) {
      this.park({ words: trimmed, attachments: kept, aboutCardId, askId: ask.id });
      this.unreadAsks.add(ask.id);
      return;
    }
    if (admitted.isStreaming() || this.running) {
      admitted.setThinkingLevel(FIRSTMATE_CAPTAIN_THINKING_LEVEL);
      await this.steerRecorded(
        admitted,
        captainOnly(contextNow()),
        trimmed,
        images,
        kept,
        aboutCardId,
        ask.id,
      );
      return;
    }
    this.seat.serveInstructionsAt(admitted);
    this.beginOriginTurn("captain-turn", true);
    this.turn.appWake = "captain";
    // WI-13 (captain ruling D5): judgment where the captain is watching.
    admitted.setThinkingLevel(FIRSTMATE_CAPTAIN_THINKING_LEVEL);
    // The wake diet: a captain turn is never delayed and carries the pending
    // operational wakes with it (before the user segment so they read as
    // context, not the question), so a coalesced op drain does not fire
    // seconds later for facts this turn already holds. The rows ride the
    // ack-after-handling contract like any drained batch.
    this.clearCoalesceTimer();
    // The one retry, and an answer a captain's message waits on, are served
    // alone (drainInbox), never carried on a captain turn.
    const served = this.withPictures(
      this.options.inbox
        .pending(FIRSTMATE_RECIPIENT, this.now(), { limit: 20 })
        .filter(
          (row) =>
            row.facts?.kind !== "answer-missing" && this.delivery.waitingOn(row).length === 0,
        ),
    );
    const pending = served.rows;
    const turnImages = [...(images ?? []), ...(served.images ?? [])];
    const context = contextNow();
    const input =
      pending.length > 0 ? this.servedTurn(context, pending, userSegment) : captainOnly(context);
    this.options.inbox.markDelivered(pending.map((row) => row.id));
    this.delivery.adopt(pending, (row) => aboutCardIdFromRef(row.ref));
    this.turn.aboutCardId = aboutCardId;
    // The live words ride no row: a cut-off turn parks them (runTurn).
    this.turn.liveCaptain = { words: trimmed, attachments: kept, aboutCardId, askId: ask.id };
    void this.runTurn(
      admitted,
      input,
      FIRSTMATE_CAPTAIN_THINKING_LEVEL,
      turnImages.length > 0 ? turnImages : undefined,
      pending.length > 0
        ? pending.map((row) => ({ id: row.id, attempts: row.attempts }))
        : undefined,
      [...captainWordsOf(pending), trimmed],
      true,
    );
  }

  /**
   * One served turn in the frame (R2): the context block, then each inbox
   * row as a wake - or, for a parked captain turn, as the captain's words -
   * then the live captain words when there are any. Each segment carries its
   * row's stamped origin and remembers the row it came from. A row with no
   * origin is served as a wake of origin `agent`, the least trusted. Here,
   * and only here on this lane, a row's envelope becomes prose: the one
   * drain (`drainWakes`), which a crewmate's lane serves through too.
   */
  private servedTurn(context: string, rows: InboxRow[], user?: ServedSegmentInput): ServedInput {
    const segments: ServedSegmentInput[] = [{ kind: "context", body: context }];
    const sources: ServedInput["rows"] = [undefined];
    for (const wake of drainWakes(rows)) {
      const origin = wake.origin ?? "agent";
      const body = wake.body;
      segments.push(
        origin === "captain" ? { kind: "user", body, origin } : { kind: "wake", body, origin },
      );
      sources.push({ id: wake.id, ref: wake.ref });
    }
    if (user) {
      segments.push(user);
      sources.push(undefined);
    }
    return { framed: frameServedInput(segments), rows: sources };
  }

  /** The lane rows whose pictures were already said to be unavailable. */
  private blockedPictureRows = new Set<number>();

  /**
   * The rows this turn can serve, with the pictures their messages keep
   * copies of. A row whose copy is missing or changed stays pending - never
   * served as words alone - and the feed says so once.
   */
  private withPictures(rows: InboxRow[]): { rows: InboxRow[]; images?: TurnImage[] } {
    const servable: InboxRow[] = [];
    const images: TurnImage[] = [];
    for (const row of rows) {
      const refs = rowAttachments([row]);
      if (refs.length === 0) {
        servable.push(row);
        continue;
      }
      try {
        images.push(...loadImages(refs));
        servable.push(row);
      } catch (caught) {
        if (!this.blockedPictureRows.has(row.id)) {
          this.blockedPictureRows.add(row.id);
          const why =
            caught instanceof AttachmentUnavailableError
              ? caught.message
              : "a picture could not be read.";
          this.options.broadcastEvent({
            type: "firstmate_note",
            text: `A message of yours is waiting: ${why} Send it again with the picture.`,
          });
        }
      }
    }
    return { rows: servable, ...(images.length > 0 ? { images } : {}) };
  }

  /**
   * The task a turn points at without saying so: an explicit record-card
   * task id, else the on-screen card's task, else the decision row an
   * on-screen Firstmate decision card carries. A hint only - the fallback
   * prefers it, the tools decide.
   */
  private resolveHint(
    turn: TurnPayload,
    visibleCardId: string | undefined,
    pastCardId?: string,
  ): string | undefined {
    const tasks = this.options.tasks;
    if (typeof turn !== "string") {
      const explicit = turn.taskId?.trim();
      if (explicit && tasks.get(explicit)) return explicit;
    }
    const past = pastCardId ? this.options.supervisor.cards.past(pastCardId) : undefined;
    if (past?.taskId && tasks.get(past.taskId)) return past.taskId;
    if (!visibleCardId) return undefined;
    const card = this.options.supervisor.cards.snapshot().find((c) => c.id === visibleCardId);
    if (!card) return undefined;
    if (card.taskId && tasks.get(card.taskId)) return card.taskId;
    return tasks.capture.openDecisionFor(card.id)?.id;
  }

  /**
   * The captain's words parked on the lane as theirs - the words only, with
   * the pictures their message keeps; the drain frames them under a fresh
   * context block. Answers the row's id.
   */
  private park({ words, attachments, aboutCardId, askId }: AcceptedSteer): number {
    const through = askId ? this.options.tasks.capture.getAsk(askId)?.through : undefined;
    return this.options.inbox.enqueue(
      FIRSTMATE_RECIPIENT,
      captainTurn(words, false, attachments, askId, through),
      captainTurnRef(aboutCardId),
      "captain",
    );
  }

  /**
   * Record-first steering (the durable-inbox contract): the row is written
   * before the steer, acknowledged when the session accepts it, and left
   * pending - to be drained as an ordinary turn - when the steer fails.
   * Images ride the live steer only; the durable copy says so, so a
   * redelivered turn never silently loses attachments.
   */
  private async steerRecorded(
    session: ModelSession,
    input: ServedInput,
    words: string,
    images: Array<{ mimeType: string; data: string }> | undefined,
    kept: AttachmentRef[] | undefined,
    aboutCardId?: string,
    askId?: string,
  ): Promise<void> {
    const id = this.park({ words, attachments: kept, aboutCardId, askId });
    this.expectRead(input.framed.text, askId ? [askId] : []);
    try {
      await session.steer(input.framed.text, images);
      this.options.inbox.ack([id]);
      this.decisions.noteSteer(input);
      this.acceptedSteers.push({ words, attachments: kept, aboutCardId, askId });
      this.turn.asked.push(words);
      this.turn.typed = true;
    } catch {
      // The row stays pending; the next drain delivers it as a turn, and that
      // turn reads the message, so this one does not judge it.
      if (askId) this.unreadAsks.add(askId);
    }
  }

  /**
   * A captain's words steered into this turn that the turn never read go
   * back on the durable inbox as a parked captain turn, which the drain at
   * the turn's end serves as a turn of their own. The window is the turn's
   * own tail: the run has made its last check of the queue, or has ended
   * while this turn is still closing, and a steer then would otherwise wait
   * unseen - its row already acknowledged - for whatever turn came next.
   * Runs with `running` already false and nothing awaited since, so no new
   * steer can land between the look and the park. Returns the steers the
   * turn did read.
   */
  private redeliverUndeliveredSteers(session: ModelSession): AcceptedSteer[] {
    const accepted = this.acceptedSteers;
    this.acceptedSteers = [];
    // A fold's recovery steer is the app's own: an unread one leaves the
    // recovery set for the next input instead.
    const undelivered = session
      .takeUndeliveredSteers()
      .filter((text) => !this.recoverySteers.has(text));
    this.recoverySteers.clear();
    if (undelivered.length === 0) return accepted;
    // The queue delivers oldest first, so what is left is the newest steers.
    for (const steer of accepted.slice(-undelivered.length)) {
      this.park(steer);
      if (steer.askId) this.unreadAsks.add(steer.askId);
    }
    return accepted.slice(0, accepted.length - undelivered.length);
  }

  /**
   * Queue a typed operational wake on the durable inbox. The row is acknowledged only when the
   * turn that consumed it ends without error, so a quit or a failed turn
   * re-presents the message instead of losing it. An op repeating the
   * lane's last one is not a new event (WI-3). The caller names the wake's
   * origin; that stamp, not the `[fm-op]` wording, is what the turn is
   * classified by. Answers the queued row's id, or null when nothing new
   * was queued.
   */
  notifyOp(wake: TypedWake, origin: ServedWakeOrigin, ref?: string): number | null {
    const id = this.options.inbox.enqueueWake(FIRSTMATE_RECIPIENT, wake, origin, ref);
    if (id === null) return null;
    void this.drainInbox();
    return id;
  }

  /**
   * Why a Start sent now would not be read: the seat is paused, or its lane
   * is waiting out a provider outage (docs/inbox.md). A busy turn is neither.
   */
  private cannotAnswerNow(): string | undefined {
    if (this.seat.paused) return "your first mate is paused";
    if (this.options.inbox.outage(FIRSTMATE_RECIPIENT).failures > 0)
      return "your first mate is waiting out a provider outage";
    return undefined;
  }

  private notifyCaptainChoice(wake: TypedWake, ref?: string): void {
    this.options.inbox.enqueue(FIRSTMATE_RECIPIENT, wake, ref, "captain");
    void this.drainInbox();
  }

  /** A delivery-attempt poke (boot, the supervisor's shared tick). */
  pokeInbox(): void {
    this.seat.checkSeat();
    void this.drainInbox();
  }

  /** The purge control resets the rolling session (captain decision Q4). */
  async reset(): Promise<void> {
    this.clearCoalesceTimer();
    await this.seat.forget();
    this.options.inbox.deleteFor(FIRSTMATE_RECIPIENT);
    this.delivery.lanePurged();
  }

  /** The quit: settles once an attach in flight has stopped (`FirstmateSeat.dispose`). */
  dispose(): Promise<void> {
    this.disposed = true;
    this.clearCoalesceTimer();
    return this.seat.dispose();
  }

  /**
   * The rolling session is in a turn or opening: its files are not to be
   * written by anyone else now (`SavedOutsideData`).
   */
  conversationBusy(): boolean {
    return (
      this.running || this.seat.creating !== undefined || Boolean(this.seat.session?.isStreaming())
    );
  }

  /** A live session holds the rolling session's files. */
  conversationHeld(): boolean {
    return this.running || this.seat.creating !== undefined || this.seat.session !== undefined;
  }

  /**
   * Let go of the rolling session between turns, so a pass can write its
   * files again whole; the next turn re-opens them. False while busy.
   */
  async releaseConversation(): Promise<boolean> {
    if (this.conversationBusy()) return false;
    const session = this.seat.session;
    this.seat.detach();
    await session?.closed().catch(() => {});
    return true;
  }

  /** Peek for Observe: the orchestrator is mid-turn. */
  isBusy(): boolean {
    return this.running || Boolean(this.seat.session?.isStreaming());
  }

  /**
   * The receipt for a captain message the paused seat keeps (FI3-592): the
   * reply line beside the message says it at once, and one feed line per
   * message keeps it, so the captain sees where his words went even after
   * he closed the pause card, which asks only once. It names what stopped
   * the seat and the way back; "answering again" follows when it serves.
   * A message kept for any other reason (a sign-in rewriting the store, an
   * answer-delivery retry) says nothing here.
   */
  private keptReceipt(askId: string): void {
    const paused = this.seat.paused;
    const flagship = this.options.flagship;
    if (!paused || !flagship) return;
    const pause = flagship.pause(paused.accountId);
    if (!pause) return;
    const providerId =
      flagship.providerOf(paused.accountId) ?? this.options.settings.getFirstmateModel()?.provider;
    const providerName = providerId ? flagship.providerNameOf(providerId) : "its provider";
    const text = keptMessageWords(
      flagship.pauseSentence(paused.accountId, pause),
      pause.class,
      providerName,
      flagship.accessOf(paused.accountId) !== undefined,
    );
    this.keepReplyLine([askId], { text, eligibility: "queued" });
    this.options.broadcastEvent({ type: "firstmate_note", text });
  }

  /** A quota refresh may un-pause the orchestrator: read the way back, then drain. */
  onQuotaRefreshed(): void {
    this.seat.checkSeat();
    void this.drainInbox();
  }

  /**
   * A cut-off was recorded or cleared on an account (`AccountVault
   * .onCutOffChange`): the seat reads its way back now, as the crew lanes
   * do, rather than at the next tick - a changed login or client, or a
   * refusal a crewmate met on the seat's own account.
   */
  onCutOffChanged(): void {
    this.seat.checkSeat();
    void this.drainInbox();
  }

  /**
   * The dev-only local seat changed under Settings: it binds at an idle
   * boundary (`FirstmateSeat.setLocalOrchestrator`).
   */
  setLocalOrchestrator(seat: LocalOrchestratorSeat | undefined): Promise<void> {
    return this.seat.setLocalOrchestrator(seat);
  }

  /** Peek for Observe: the model this rolling session is on. */
  modelRef(): { provider: string; id: string } | null {
    return this.seat.modelRef();
  }

  /** The attached session's file, whichever seat serves it; null before one attaches. */
  sessionFile(): string | null {
    return this.seat.sessionFile();
  }

  /** Rebind the rolling session to another account at an idle boundary (`FirstmateSeat.rebind`). */
  rebind(accountId: string, note?: string): Promise<ModelSession | undefined> {
    return this.seat.rebind(accountId, note);
  }

  /** The account the current attachment is bound to (settings surface). */
  boundAccount(): string | undefined {
    return this.seat.boundAccountId;
  }

  /** An explicit flagship pin change in Settings (`FirstmateSeat.applyAccountSetting`). */
  applyAccountSetting(): Promise<void> {
    return this.seat.applyAccountSetting();
  }

  /** A model picked in Settings (`FirstmateSeat.applyModelSetting`). */
  applyModelSetting(model: { provider: string; id: string } | null): Promise<void> {
    return this.seat.applyModelSetting(model);
  }

  /** The captain's Recheck allowance (`FirstmateSeat.recheckAllowance`). */
  recheckAllowance(options: { fromCard?: boolean } = {}): Promise<QuotaSnapshotView | undefined> {
    return this.seat.recheckAllowance(options);
  }

  /** A sign-in or sign-out is about to rewrite an account's store (`FirstmateSeat.holdSeatFor`). */
  holdSeatFor(accountId: string): Promise<() => void> {
    return this.seat.holdSeatFor(accountId);
  }

  /** A custom connection is removed without changing the saved seat choice. */
  disconnectAccount(accountId: string): Promise<void> {
    return this.seat.disconnectAccount(accountId);
  }

  /** Local preflight's chosen model, or its normal initial Auto choice; never opens a session. */
  preflightModel(): { provider: string; id: string } | undefined {
    return this.seat.preflightModel();
  }

  /** What the first mate's tools reach of this agent (`FirstmateToolHost`). */
  private toolHost(): FirstmateToolHost {
    return {
      options: this.options,
      turn: this.turn,
      asks: this.asks,
      decisions: this.decisions,
      delivery: this.delivery,
      appDispatch: () => this.appDispatch,
      noteDelivery: (entry) => this.noteDelivery(entry),
      replyEmote: (emote) => this.replyEmote(emote),
      sessionFile: () => this.sessionFile(),
    };
  }

  /**
   * The host's own reply emotes (captain's board verdict, 2026-09-22,
   * trigger C): a steer delivered nods, a note kept tucks, a personalize
   * applied ticks - on a captain turn only, because a reply answers the
   * captain, and an operational or scheduled wake answers nobody. The
   * character holds it until the turn ends (renderer character/machine.ts),
   * and so does the line above it with the app's own words (FI3-1077),
   * marked automatic so the Firstmate's own words for the same reply win.
   */
  private replyEmote(emote: HostReplyEmote): void {
    if (this.turn.origin !== "captain-turn") return;
    this.turn.replyFacts.app = AUTOMATIC_EMOTE_WORDS[emote];
    this.options.broadcastEvent({
      type: "firstmate_emote",
      emote,
      text: AUTOMATIC_EMOTE_WORDS[emote],
      automatic: true,
    });
  }

  /**
   * The complete context block, as a context that has read nothing would
   * get it (`FirstmateContext.buildContextBlock`).
   */
  buildContextBlock(
    visibleCardId?: string,
    hintTaskId?: string,
    aboutCardId?: string,
    pastCardId?: string,
    focusedProjectId?: string,
  ): string {
    return this.context.buildContextBlock(
      visibleCardId,
      hintTaskId,
      aboutCardId,
      pastCardId,
      focusedProjectId,
    );
  }

  private async runTurn(
    session: ModelSession,
    input: ServedInput,
    thinkingLevel: FirstmateThinkingLevel,
    images?: Array<{ mimeType: string; data: string }>,
    inboxRows?: { id: number; attempts: number }[],
    asked: readonly string[] = [],
    typed = false,
  ): Promise<void> {
    this.running = true;
    beginTurn(this.turn, asked, typed);
    // A parent whose last part this turn closes waits for the turn's end (INF-4509).
    this.options.supervisor.intake.firstmateTurnBegan();
    this.lastEventAt = Date.now();
    this.quietLevel = 0;
    if (!inboxRows) this.servedOrigins.clear();
    this.expectRead(
      input.framed.text,
      [
        ...this.delivery.adoptedAsks(),
        ...(this.turn.liveCaptain?.askId ? [this.turn.liveCaptain.askId] : []),
      ],
      inboxRows?.map((row) => row.id) ?? [],
    );
    const localTurn = this.seat.boundLocal;
    // Tools attach only to messages the backend has actually read.
    this.asks.beginTurn();
    this.asks.select(undefined);
    // The policy-step boundary (R2): the decision opens as the input is
    // served and closes once its asks, inbox rows and effects are settled.
    this.decisions.begin({
      tag: "fm",
      producer: {
        actor: "firstmate",
        role: "firstmate",
        model: session.modelRef() ?? null,
        accountId: this.seat.boundAccountId ?? null,
        thinkingLevel,
      },
      contract: {
        version: FIRSTMATE_CONTRACT_VERSION,
        promptSha: this.seat.promptSha ?? firstmatePromptSha(),
        toolsSha: this.seat.toolsSha,
      },
      input,
    });
    this.options.broadcastEvent({ type: "firstmate_state", busy: true });
    let threw = false;
    try {
      await this.asks.outsideActions(() => session.prompt(input.framed.text, images));
      if (
        localTurn &&
        !this.turn.failed &&
        this.options.tasks.capture.listOpenAsks().some((ask) => this.turn.read.has(ask.id)) &&
        !this.turn.delivered &&
        !(this.turn.aboutCardId && String(this.turn.closingText ?? "").trim())
      ) {
        throw new Error(
          "The local model finished without showing an answer or taking an action. Try again or choose a different model.",
        );
      }
    } catch (caught) {
      // The thrown channel: Pi's pre-request auth preflight lands here, so
      // route through the same auth-vs-generic dispatch as session failures.
      threw = true;
      const message = caught instanceof Error ? caught.message : String(caught);
      this.turn.error = message;
      this.turn.failureKind ??= turnFailureReason(message, false);
      this.seat.noteRunaway(message);
      this.seat.raiseSessionFailureCard(message);
    } finally {
      // A quit cut this turn: nothing it read is answered, acknowledged or
      // judged now. Its lane rows stay in flight and its messages open, so the
      // next boot reconciles it as it does a crash (docs/task-capture.md).
      if (this.disposed) this.running = false;
      else
        this.closeTurn(
          session,
          endedTurn(this.turn, threw, this.contextRecoveryAttempted),
          inboxRows,
        );
      this.options.supervisor.intake.firstmateTurnEnded(!this.disposed);
    }
  }

  /**
   * The end of a turn that settled while the app runs: its lane rows are
   * acknowledged or released, its messages filed and judged, and the lane
   * drained again.
   */
  private closeTurn(
    session: ModelSession,
    end: TurnEnd,
    inboxRows: { id: number; attempts: number }[] | undefined,
  ): void {
    let asks: { id: string; taskId: string | null; via: string | null }[] = [];
    // The messages this turn read, as they stood before its close filed them.
    let readAsks: string[] = [];
    // Ack after handling: the batch is deleted only when the turn ended
    // clean. A turn that failed at the provider (provider failures resolve
    // rather than throw, so the turn_failed flag counts) takes the honest
    // retry (docs/inbox.md): no attempt spent, backing off - and never
    // before a spent allowance's reset. One that threw spends its attempt
    // and is due again one grace later.
    // Set by the turn's own events, which the reset above cannot see.
    const failed = end.failure !== undefined;
    const cutOff = end.failure?.cutOff;
    const pausing = end.failure?.pausing ?? false;
    if (inboxRows && inboxRows.length > 0) {
      const ids = inboxRows.map((row) => row.id);
      if (end.kind === "failed") {
        this.options.inbox.releaseAfterProviderFailure(
          ids,
          cutOff?.resetsAt !== undefined ? { notBefore: cutOff.resetsAt } : {},
        );
      } else if (end.kind === "broke") {
        this.options.inbox.release(ids);
        if (inboxRows.some((row) => row.attempts + 1 === INBOX_ATTEMPT_MAX)) {
          // The firstmate lane never escalates to a card - operational
          // messages have nowhere else to go - but the repeated failure
          // is said once in the feed instead of staying invisible.
          this.options.broadcastEvent({
            type: "firstmate_note",
            text: `Operational updates could not be handled after ${INBOX_ATTEMPT_MAX} attempts; they retry when your first mate recovers.`,
          });
        }
      } else {
        this.options.inbox.ack(ids);
      }
      // A Start this turn read and did not start begins as it is.
      const began = this.options.supervisor.hostOps.firstmateTurnEnded(ids, end.kind);
      this.options.inbox.ack(began);
    }
    // The provider answered: whatever was backing off on this lane is due now.
    if (!failed) this.options.inbox.endOutage(FIRSTMATE_RECIPIENT);
    // The captain's live words ride no row until here.
    const live = this.turn.liveCaptain;
    this.turn.liveCaptain = undefined;
    if (failed) {
      // Retry drains the original words, never re-sends them. A thrown
      // turn's unread tail still uses redeliverUndeliveredSteers below.
      const words = [
        ...(live ? [live] : []),
        ...this.acceptedSteers.filter(
          (entry) =>
            end.kind !== "broke" || pausing || (entry.askId && this.turn.read.has(entry.askId)),
        ),
      ];
      this.acceptedSteers =
        end.kind === "broke" && !pausing
          ? this.acceptedSteers.filter((entry) => !entry.askId || !this.turn.read.has(entry.askId))
          : [];
      const ids = words.map((entry) => this.park(entry));
      if (!pausing) {
        this.options.inbox.markDelivered(ids);
        this.options.inbox.releaseAfterProviderFailure(
          ids,
          cutOff?.resetsAt !== undefined ? { notBefore: cutOff.resetsAt } : {},
        );
      }
    } else {
      this.options.supervisor.cards.hostCards.withdrawHostCard(
        FIRSTMATE_FAILURE_CARD_ID,
        "recovered",
      );
    }
    // The capture floor (P1): whatever no tool attached lands now - on
    // the hinted task, else as its own question task. A failed turn files
    // too, apart from a message whose words now wait on the lane for a
    // retry: the turn that serves them again attaches and closes it.
    // Never lets a bookkeeping fault take the turn down with it.
    try {
      const turnAsks = this.options.tasks.capture.listOpenAsks().map((ask) => ask.id);
      readAsks = turnAsks.filter((id) => this.turn.read.has(id));
      const waiting = this.delivery.waitingOnLane();
      this.asks.endTurn({
        asks: readAsks.filter((id) => !waiting.includes(id)),
        failed,
        closingText: this.turn.closingText,
        error: end.failure?.error,
      });
      asks = readAsks.map((id) => {
        const ask = this.options.tasks.capture.getAsk(id);
        return { id, taskId: ask?.taskId ?? null, via: ask?.attachedVia ?? null };
      });
    } catch (caught) {
      console.warn("[firstmate] ask capture failed at turn end:", caught);
    }
    const decision = this.decisions.finish({
      served: session.servedState(),
      outcome: failed ? "failed" : "clean",
      error: end.failure?.error,
      inbox: inboxRows && inboxRows.length > 0 ? (failed ? "released" : "acked") : "none",
      asks,
    });
    // A scheduled prompt this turn handled is handled in its rule's history,
    // with the work it touched and its closing words (docs/automation.md).
    if (decision) {
      try {
        this.options.scheduler?.noteDecision(decision, this.turn.closingText);
      } catch (caught) {
        console.warn("[firstmate] automation history failed at turn end:", caught);
      }
    }
    const trigger: TurnTrigger = this.turn.origin === "captain-turn" ? "captain" : "operation";
    this.recordDigest(trigger, failed);
    const recoverContext = end.failure?.recoverContext ?? false;
    if (!failed) this.contextRecoveryAttempted = false;
    if (recoverContext) {
      this.contextRecoveryAttempted = true;
      // Keep the old transcript and the failed decision; only forget this backend's
      // resume pointer. The normal durable lane owns redelivery, including steers.
      const backend = session.resume()?.backend;
      if (backend === "claude") this.options.settings.setFirstmateClaudeSession(null);
      else this.options.settings.setFirstmateSessionFile(null);
      const recent = digestFor(this.options.settings.getFirstmateSeatDigest(), "");
      this.options.inbox.enqueue(
        FIRSTMATE_RECIPIENT,
        `[fm-op] The previous conversation reached the model's context limit. A fresh conversation starts with this bounded recent-turn digest. Check the task records before repeating any action.\n${JSON.stringify(recent)}`,
        "context-recovery",
        "agent",
      );
      // The changed conversation, like Retry, makes the kept words due now.
      this.options.inbox.endOutage(FIRSTMATE_RECIPIENT);
      this.options.broadcastEvent({
        type: "firstmate_note",
        text: "Your first mate reached the conversation limit and is continuing with recent context in a new conversation.",
      });
    }
    this.settleTurn(
      end.failure
        ? {
            trigger,
            failed: true,
            reason: end.failure.reason,
          }
        : { trigger, failed: false },
    );
    this.running = false;
    const tookIn = this.redeliverUndeliveredSteers(session);
    if (recoverContext) this.seat.detach();
    this.clearQuiet();
    // The closing words are the line under every card reply this turn read -
    // its own about card, and one the captain sent while it ran - unless it
    // already wrote there. They name no captain message, so they answer
    // none: a handoff stays open (the captain's choice), and an answer is an
    // emit_card reply naming the message.
    const threadAnswer = (this.turn.closingText ?? "").trim();
    const repliedUnder = new Set(
      [this.turn.aboutCardId, ...tookIn.map((steer) => steer.aboutCardId)].filter(
        (cardId): cardId is string => cardId !== undefined,
      ),
    );
    // The reply line goes out before the busy signal falls, so the
    // working line turns straight into it; an answer in a card's replies
    // is an answer on that card, and its words are the line too.
    if (!failed && threadAnswer && repliedUnder.size > 0) this.turn.replyFacts.acted = true;
    // A lost sign-in on Claude access set up for Claude Code is renewed
    // where Claude Code's is, never by a sign-in here.
    const access =
      failed && cutOff?.class === "signed_out" && this.seat.boundAccountId
        ? this.options.flagship?.accessOf(this.seat.boundAccountId)
        : undefined;
    this.replyToLastMessage(
      [...this.turn.read],
      failed
        ? plainProblem(
            end.failure?.error,
            cutOff ? { cutOff, ...(access ? { access } : {}) } : undefined,
          )
        : undefined,
    );
    this.options.broadcastEvent({ type: "firstmate_state", busy: false });
    if (!failed && threadAnswer) {
      for (const cardId of repliedUnder) {
        try {
          if (this.options.supervisor.cards.recordFirstmateThreadAnswer(cardId, threadAnswer)) {
            this.delivery.creditReply(cardId);
          }
        } catch (caught) {
          console.warn("[firstmate] card-thread answer failed at turn end:", caught);
        }
      }
    }
    this.turn.aboutCardId = undefined;
    // The turn's end is the Firstmate's close-out: a card of its own it
    // answered since the captain's reply reaches the stage now.
    this.options.supervisor.cards.closeOut({ kind: "firstmate" }, "turn-end");
    // Answer delivery: the normal capture above is done, so each message
    // this turn read is judged by what took effect after it.
    const unread = [...this.unreadAsks];
    this.unreadAsks.clear();
    this.delivery.endTurn({ asks: readAsks, held: failed || pausing, unread });
    this.turn.pendingReads = [];
    this.turn.read.clear();
    // A cut-off pauses the seat now, not when the next row falls due.
    if (pausing) void this.admitAfterCutOff();
    else void this.drainInbox();
  }

  /**
   * The reply line beside the captain's newest message (docs/composer.md
   * "The last turn"), when the turn that just ended read it: the problem's
   * plain words for a turn that failed, else the line its closing words
   * and facts choose (./replyLine). It is kept beside the message for the next launch and
   * sent to the window. A turn that did not read the newest message, or
   * that closed with no words where nothing took effect, leaves the line as
   * it is.
   */
  private replyToLastMessage(read: readonly string[], problem: string | undefined): void {
    const text = problem ?? replyLine(this.turn.replyFacts);
    const words = problem ? undefined : replyWords(this.turn.replyFacts);
    if (text)
      this.keepReplyLine(
        read,
        problem
          ? { text, problem: true }
          : { text, eligibility: "completed", ...(words ? { words } : {}) },
      );
  }

  /** Keeps a reply line beside the newest message, when it is one of `read`, and sends it. */
  private keepReplyLine(read: readonly string[], reply: LastTurnReply): void {
    try {
      const latest = this.options.tasks.capture.latestAskId();
      if (!latest || !read.includes(latest)) return;
      this.options.tasks.capture.setAskReply(latest, reply);
      this.options.broadcastEvent({ type: "firstmate_reply", ...reply });
    } catch (caught) {
      console.warn("[firstmate] the reply line could not be kept:", caught);
    }
  }

  /**
   * One turn on the digest a seat move carries across (Q4 b,
   * `seatDigest.ts`): who it answered, the captain's words, the tools it
   * called and its closing words - capped, and never a turn's transcript.
   */
  private recordDigest(trigger: TurnTrigger, failed: boolean): void {
    const seat = this.seat.boundSeat;
    if (!seat) return;
    try {
      const settings = this.options.settings;
      settings.setFirstmateSeatDigest(
        appendDigest(
          settings.getFirstmateSeatDigest(),
          digestEntry({
            seat: seat.identity,
            at: this.now(),
            // A turn that served the captain's words answered the captain,
            // whatever else its batch carried.
            trigger: this.turn.asked.length > 0 ? "captain" : trigger,
            asked: this.turn.asked,
            tools: this.turn.tools,
            ...(this.turn.closingText ? { said: this.turn.closingText } : {}),
            failed,
          }),
        ),
      );
    } catch (caught) {
      console.warn("[firstmate] seat digest failed at turn end:", caught);
    }
  }

  /** A turn ended in a cut-off: admission reads the account now, and pauses or moves on. */
  private async admitAfterCutOff(): Promise<void> {
    const session = await this.seat.ensureSession();
    if (!session || this.running || session.isStreaming()) return;
    const admitted = await this.seat.admitTurn(session);
    if (admitted) void this.drainInbox();
  }

  /**
   * One watchdog pass over the orchestrator's own turn, on the supervisor's
   * shared tick: the 10-minute feed line and 20-minute card a crewmate gets.
   */
  checkQuiet(now: number): void {
    if (!this.isBusy()) return;
    const quietFor = now - this.lastEventAt;
    const minutes = Math.round(quietFor / 60_000);
    if (quietFor >= QUIET_CARD_MS && this.quietLevel < 2) {
      this.quietLevel = 2;
      this.options.supervisor.cards.hostCards.addFirstmateQuietCard(
        `Your first mate has said nothing for ${minutes} minutes while working. It may be stuck; it recovers on its own when it finishes.`,
      );
    } else if (quietFor >= QUIET_FEED_MS && this.quietLevel < 1) {
      this.quietLevel = 1;
      this.options.broadcastEvent({
        type: "firstmate_note",
        text: `Your first mate has been quiet for ${minutes} minutes while working.`,
      });
    }
  }

  /** Any session event is proof of life; a stale quiet card retires. */
  private noteActivity(): void {
    this.lastEventAt = Date.now();
    if (this.quietLevel > 0) this.clearQuiet();
  }

  private clearQuiet(): void {
    this.quietLevel = 0;
    this.options.supervisor.cards.hostCards.clearFirstmateQuietCard();
  }

  /**
   * Deliver queued [fm-op] messages when the session is idle. Streaming
   * turns are never interrupted; agent-end triggers the next drain, and the
   * supervisor's shared tick pokes so retries happen even in a quiet app.
   * Rows are marked in-flight at hand-off and acknowledged only when the
   * consuming turn ends without error (runTurn), so a failed turn or a quit
   * re-presents the batch instead of losing it.
   *
   * The wake diet (WI-13): the first pending wake waits `WAKE_COALESCE_MS`
   * for its siblings, then everything pending drains as ONE turn - so a burst
   * of crew reports or escalations is one interruption, not one each. The
   * window is anchored to the oldest pending row's `createdAt` and read from
   * the clock, so a stranded row from a past session (long aged) drains at
   * once and a replay's frozen clock coalesces identically.
   */
  private async drainInbox(): Promise<void> {
    if (this.disposed || this.running) return;
    const now = this.now();
    const rows = this.options.inbox.pending(FIRSTMATE_RECIPIENT, now, { limit: 20 });
    const oldest = rows[0];
    if (!oldest) return;
    const waited = now - oldest.createdAt;
    // A captain's words never wait out the window, nor does the one retry
    // for a message nothing took effect after, an answer a message of his
    // waits on, how his setup click came out,
    // an Update panel press, or a Start held for this turn. A queued task's
    // directions can still batch.
    const waiting = rows.some(
      (row) =>
        row.origin === "captain" ||
        row.facts?.kind === "answer-missing" ||
        this.delivery.waitingOn(row).length > 0 ||
        row.facts?.kind === "project-setup" ||
        row.facts?.kind === "panel-update-asked" ||
        (row.facts?.kind === "captain-start" && row.facts.move === "start"),
    );
    if (waited < this.coalesceMs && !waiting) {
      this.scheduleCoalesceDrain(this.coalesceMs - waited);
      return;
    }
    this.clearCoalesceTimer();
    const sourceFacts = this.options.selfSourceFactsAsync
      ? await this.options.selfSourceFactsAsync()
      : undefined;
    if (this.disposed || this.running) return;
    // A quit that lands while the drain waits ends it before it reads the
    // lane again: the rows stay undelivered for the next boot.
    const session = await this.seat.ensureSession();
    if (this.disposed || !session || session.isStreaming() || this.running) return;
    // Paused (no account can serve): rows stay queued for a later drain.
    const admitted = await this.seat.admitTurn(session);
    if (this.disposed || !admitted || admitted.isStreaming() || this.running) return;
    this.seat.serveInstructionsAt(admitted);
    // Admission or the instructions served may have queued the moved seat's
    // wake: the batch is read after it.
    const served = this.withPictures(
      this.options.inbox.pending(FIRSTMATE_RECIPIENT, this.now(), { limit: 20 }),
    );
    const pending = served.rows;
    // A card click has its own turn: no operational report can borrow its
    // authority. Ordinary parked captain words retain their prior co-batching.
    const choice = pending.find(
      (row) => row.origin === "captain" && row.facts?.kind === "card-choice",
    );
    // The answer-delivery retry is served alone: a typed wake of its own,
    // never batched with anything and never carried on a captain's turn.
    const retry = choice ? undefined : pending.find((row) => row.facts?.kind === "answer-missing");
    // So is an answer a captain's message waits on: the turn that reads it
    // reads that message alone, so nothing else in it counts toward it
    // (docs/task-capture.md "Waiting for an answer"). Parked captain words
    // go first, with such answers left out, as a live captain turn does.
    const words = pending.some((row) => row.origin === "captain");
    const answer =
      choice || retry || words
        ? undefined
        : pending.find((row) => this.delivery.waitingOn(row).length > 0);
    const batch = choice
      ? [choice]
      : retry
        ? [retry]
        : answer
          ? [answer]
          : pending.filter((row) => this.delivery.waitingOn(row).length === 0);
    if (batch.length === 0) return;
    // A choice's turn carries only that choice's own pictures (`choice-attachments.md`).
    const batchImages = choice ? this.withPictures([choice]).images : served.images;
    const classified = classifyInboxBatch(batch);
    this.beginOriginTurn(classified.origin, classified.canCreate);
    this.turn.appWake =
      classified.kind === "captain"
        ? choice
          ? "captain-choice"
          : "captain"
        : classified.kind === "scheduled" &&
            batch.every(
              (row) =>
                row.origin === "scheduled" &&
                row.facts?.kind === "scheduled" &&
                row.facts.captainRequested === true,
            )
          ? "scheduled"
          : "other";
    // WI-13: a parked captain turn keeps its judgment budget; operational
    // wakes run at the low default.
    const thinkingLevel =
      classified.origin === "captain-turn" || retry
        ? FIRSTMATE_CAPTAIN_THINKING_LEVEL
        : FIRSTMATE_OPERATIONAL_THINKING_LEVEL;
    admitted.setThinkingLevel(thinkingLevel);
    const aboutCardId = batch
      .map((row) =>
        row.facts?.kind === "answer-missing"
          ? row.facts.aboutCard?.id
          : aboutCardIdFromRef(row.ref),
      )
      .find(Boolean);
    const unavailable = this.options.knowledge?.availability();
    if (unavailable?.state === "unavailable") {
      if (!this.directionsBlocked) {
        this.options.broadcastEvent({
          type: "firstmate_note",
          text: "Your first mate has paused new work because standing directions could not be read. Your saved work is unchanged.",
        });
        this.directionsBlocked = true;
      }
      return;
    }
    this.directionsBlocked = false;
    const input = this.servedTurn(
      this.context.forTurn(undefined, undefined, aboutCardId, undefined, sourceFacts),
      batch,
    );
    this.options.inbox.markDelivered(batch.map((row) => row.id));
    this.servedOrigins = new Map(
      batch.flatMap((row) => {
        const origin = turnOriginOf(row, (id) => this.options.tasks.get(id)?.key || undefined);
        return origin ? [[row.id, origin] as const] : [];
      }),
    );
    this.delivery.adopt(batch, (row) => aboutCardIdFromRef(row.ref));
    this.turn.aboutCardId = aboutCardId;
    void this.runTurn(
      admitted,
      input,
      thinkingLevel,
      batchImages,
      batch.map((row) => ({ id: row.id, attempts: row.attempts })),
      captainWordsOf(batch),
      captainTypedIn(batch),
    );
  }

  /**
   * Arm the coalescing window's re-poke (WI-13). One timer only - the window
   * stays anchored to the first pending wake, so a later wake does not push
   * the drain out. Unref'd so a quiet app can still exit; the clock decides
   * drainability, so this is only the nudge that a lone wake needs when no
   * later wake or tick would otherwise re-drain within the window.
   */
  private scheduleCoalesceDrain(ms: number): void {
    if (this.coalesceTimer) return;
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = undefined;
      void this.drainInbox();
    }, ms);
    this.coalesceTimer.unref?.();
  }

  private clearCoalesceTimer(): void {
    if (!this.coalesceTimer) return;
    clearTimeout(this.coalesceTimer);
    this.coalesceTimer = undefined;
  }

  /**
   * The backend folded the conversation into a summary (INF-1712): what the
   * model read of the saved facts may be gone, so the next input is
   * complete and tells it to re-read the open messages and cards. Inside a
   * running turn that input is steered in at once, so the turn does not go
   * on from the summary alone; an unread steer leaves it for the next input.
   */
  private afterFold(turn: "goes-on" | "unknown" | undefined): void {
    this.context.noteFold();
    const session = this.seat.session;
    if (!this.running || !session) return;
    // A fold after the turn's last request, with its input read, is the
    // turn's end: a steer would start a request of its own, so the recovery
    // rides the next input. An unread input, a retried request or a fold
    // before the next response goes on.
    if (turn === undefined && this.turn.pendingReads.length === 0) return;
    const input = this.servedTurn(this.context.forTurn(), []);
    this.recoverySteers.add(input.framed.text);
    this.expectRead(input.framed.text, []);
    // Ahead of any captain words still queued, so the next request reads it.
    const steer = session.steerFirst
      ? session.steerFirst(input.framed.text)
      : session.steer(input.framed.text);
    steer.then(
      () => this.decisions.noteSteer(input),
      () => {
        // Not queued: the recovery stays set for the next input.
      },
    );
  }

  private onSessionEvent(event: SessionEvent): void {
    if (event.type === "context_compacted") {
      this.afterFold(event.turn);
      return;
    }
    if (event.type === "input_read") {
      this.context.delivery.read(event.textSha256);
      const index = this.turn.pendingReads.findIndex((input) => input.sha === event.textSha256);
      if (!this.running || index < 0) return;
      const [input] = this.turn.pendingReads.splice(index, 1);
      if (!input) return;
      this.options.inbox.responsesDelivered(input.inboxIds);
      for (const id of input.inboxIds) {
        const origin = this.servedOrigins.get(id);
        if (origin) this.turn.originsRead.push(origin);
      }
      for (const id of input.asks) this.turn.read.add(id);
      this.asks.select([...this.turn.read].at(-1));
      if (input.asks.includes(this.options.tasks.capture.latestAskId() ?? ""))
        this.turn.replyFacts = {};
      return;
    }
    // A session's owner-only events other than a turn's close say nothing
    // the agent reads yet, and are never broadcast.
    if (
      event.type === "background_work_changed" ||
      event.type === "request_started" ||
      event.type === "continuation_started" ||
      event.type === "continuation_ended" ||
      event.type === "model_served" ||
      event.type === "tool_observation"
    ) {
      return;
    }
    this.noteActivity();
    this.decisions.noteSessionEvent(event);
    if (event.type === "turn_closed") {
      if (event.text) this.turn.closingText = event.text;
      // The reply line takes the words of the turn's last model request,
      // and only after the newest message was read (./replyLine).
      if (this.running) this.turn.replyFacts.closing = event.text;
      return;
    }
    if (event.type === "tool_start") this.turn.tools.push(event.toolName);
    // A shortening's start and end, on Pi or Claude, is the character's cinch.
    if ((event.type === "tool_start" || event.type === "tool_end") && event.toolName === FOLD_TOOL)
      this.options.broadcastEvent({
        type: "firstmate_state",
        busy: this.running,
        folding: event.type === "tool_start",
      });
    if (event.type !== "turn_failed") {
      this.options.broadcastEvent(event);
    }
    if (event.type === "turn_failed") {
      // A provider-failed turn resolves instead of throwing, so runTurn's
      // catch never sees it - this is that failure's only path to a card
      // (auth decision or retryable error). The flag also tells runTurn to
      // release the inbox batch it delivered.
      this.turn.failed = true;
      this.turn.contextOverflow = event.contextOverflow === true;
      if (event.cutOff && this.seat.boundAccountId) {
        this.options.noteCutOff?.(this.seat.boundAccountId, event.cutOff);
      }
      // A cut-off is a designed path: when it pauses the seat, the card the
      // ladder raises for its class speaks for it, in product words, never
      // the client's. One the account does not hold (a spent allowance with
      // no known reset) pauses nothing, so it is an ordinary failure: its
      // card, its feed line, and the honest retry - never invisible and
      // retried.
      const pausing = Boolean(event.cutOff && this.seat.pausesOnCutOff() && this.seat.pausesNow());
      const labeled = {
        ...event,
        error: formatFlagshipError(this.seat.session?.modelRef(), event.error),
        ...(pausing ? { paused: true } : {}),
      };
      this.options.broadcastEvent(labeled);
      this.turn.error = labeled.error;
      this.turn.failureKind ??= turnFailureReason(event.error, true);
      this.seat.noteRunaway(event.error);
      if (event.cutOff) this.turn.cutOff = event.cutOff;
      if (event.cutOff && this.seat.pausesOnCutOff()) {
        this.turn.pausing = pausing;
        if (this.turn.pausing) return;
      }
      if (!this.turn.contextOverflow || this.contextRecoveryAttempted) {
        this.seat.raiseSessionFailureCard(event.error);
      }
    } else if (event.type === "turn_end" || event.type === "tool_end") {
      if (event.type === "turn_end" && !this.turn.failed) {
        this.seat.runawayStreak = 0;
        this.seat.runawayRefused = false;
      }
      if (event.usage) {
        const model = this.seat.session?.modelRef();
        this.options.recordUsage?.({
          ...(this.seat.boundAccountId ? { accountId: this.seat.boundAccountId } : {}),
          ...(model ? { model } : {}),
          usage: event.usage,
        });
      }
    }
  }

  /** Tell the turn's listener how it went; a listener fault never reaches the turn. */
  private settleTurn(outcome: FirstmateTurnOutcome): void {
    try {
      this.options.onTurnSettled?.(outcome);
    } catch (caught) {
      console.warn("[firstmate] turn listener failed:", caught);
    }
  }

  /** Stamp origin and writing authority from the wake. */
  private beginOriginTurn(origin: KnowledgeOrigin, canCreate: boolean): void {
    this.turn.origin = origin;
    this.turn.canCreate = canCreate;
  }
}

/**
 * The coarse kind of a failed turn, for Diagnostics: a refused sign-in,
 * the provider's time limit, a provider-failed turn, or anything else that
 * threw. Only the kind leaves; the message never does.
 */
function turnFailureReason(error: string | undefined, providerFailed: boolean): TurnFailureReason {
  // Classified from the raw message: the model-labelled one moves a status
  // code out of the position the auth classifier reads.
  const message = error ?? "";
  if (isAuthFailureMessage(message) || message.includes("No signed-in model")) return "sign_in";
  if (isRunawayProviderError(message)) return "time_limit";
  return providerFailed ? "provider" : "error";
}

/** A captain's steer the session accepted: his words, and the card they were about, if any. */
type AcceptedSteer = {
  words: string;
  attachments?: AttachmentRef[];
  aboutCardId?: string;
  askId?: string;
};
