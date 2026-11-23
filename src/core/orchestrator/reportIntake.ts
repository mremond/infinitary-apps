import { randomUUID } from "node:crypto";
import {
  type AskedResponsePolicy,
  type CrewResponse,
  crewResponseSchema,
  type ResponseCard,
} from "@shared/crewResponses";
import { STANDING_WORDS_FROM } from "@shared/holds";
import {
  checkApproval,
  type KeptValidationInput,
  keptValidationInputSchema,
  type LiveValidation,
  type ValidationAllowance,
  type ValidationForgeWrite,
  validationRevision,
} from "@shared/liveValidation";
import { formatDurationShort } from "@shared/quotaSignals";
import { keptRecoveryWaySchema, workWaitSchema } from "@shared/recovery";
import { deliveryFor, opensPullRequest, type RepoDelivery } from "@shared/repos";
import { type PlanItem, readPlanItems } from "@shared/taskPlan";
import { taskTitleRefusal } from "@shared/taskTitle";
import { cutText } from "@shared/textCut";
import { crewmateCardPicturesDir } from "../paths";
import {
  verifyKeptValidationEvidence,
  verifyKeptValidationEvidenceSync,
} from "../pi/validationEvidence";
import { ORDINARY_NOTE_READ_ACK } from "../prompts/cardContract";
import type { FollowupInput } from "../session/tools";
import type { TaskRecord } from "../storage/taskRecords";
import { keptYeses } from "../tasks/alreadyAllowed";
import { TaskGraphRefusal } from "../tasks/taskGraph";
import { resultRefusal } from "../tasks/taskResult";
import { TaskService } from "../tasks/taskService";
import type { ReportDeclaration } from "../tasks/taskTurns";
import { CREWMATE_ANSWER_ASK } from "./answerDelivery";
import type { AskEnding } from "./askEnding";
import { cardEmitter, crewmateCardId } from "./cardEmit";
import type { CardService } from "./cardService";
import type { TaskRuntime } from "./crewRuntime";
import type { CrewSupervisorOptions } from "./crewSupervisorOptions";
import { type PersonalBriefFacts, renderFollowupBrief } from "./intentBrief";
import { implausibleReport } from "./reportPlausibility";

/** What the report intake reaches of the supervisor beyond its options. */
export type ReportIntakeHost = {
  /** The card stack: a crewmate's open cards and the threads awaiting it. */
  readonly cards: CardService;
  /** How each captain's message ends: whether a finished report owes its card first. */
  readonly askEnding: AskEnding;
  /** Whether a task builds in place on the personal workspace. */
  isPersonalTask(taskId: string): boolean;
  /** The personal workspace's brief facts, when this build has one. */
  personalFacts(): PersonalBriefFacts | undefined;
  /** A task's delivery posture: whether it delivers through a pull request. */
  taskDelivery(taskId: string): RepoDelivery | undefined;
  /** The builder a review task reads: its parent, the one stored join. */
  reviewBuilderOf(record: TaskRecord | undefined): TaskRecord | undefined;
  /** A crewmate's proof of life: its quiet clock starts again. */
  noteTaskActivity(task: TaskRuntime): void;
  /** Deliver the inbox's waiting rows now (`FirstmateHooks.pokeInbox`). */
  pokeInbox(): void;
  /** When a crewmate's own client jobs began, while any runs. */
  clientJobStart(taskId: string): number | undefined;
  /** Tell the window the crew's counts changed. */
  broadcastCrewCounts(): void;
  /** Whether a relay made now wakes the first mate at once (`CrewTurns.relayWakesNow`). */
  relayWakesNow(task: TaskRuntime): boolean;
  /** The captain's words a report passes on, read where he typed them (`CaptainOverrides.relayedCaptainWords`). */
  relayedCaptainWords(
    taskId: string,
    from: string,
  ): { ok: true; words: string; at: number } | { ok: false; text: string };
};

/**
 * What a crewmate reports, as the crew takes it in (docs/report-sort.md,
 * docs/card-threads.md "Shared cards", docs/delivery-rigor.md): its
 * follow-ups, its progress notes, its explicit report with what it declares
 * about whose turn follows, a response its card line carries, and its live
 * validation records with the write a validation request approved. The
 * report is sorted when the turn ends, not here, except a relay
 * (`needs_firstmate`), which wakes the first mate when it is made
 * (`CrewTurns.relayNow`). The crew supervisor
 * composes it and its callers reach it as `CrewSupervisor.reportIntake`.
 */
export class ReportIntake {
  constructor(
    private readonly options: CrewSupervisorOptions,
    private readonly host: ReportIntakeHost,
  ) {}

  /**
   * file_followup (design section 7): the crewmate found work it should not
   * do itself. The record files it as an on-request task of its own,
   * discovered-from the crewmate's task but never a child of it: a row, a
   * link, and one feed line - never a card and never a wake of its own
   * (cards/tasks/agents P0, WI-4). The Firstmate hears about it with the
   * report that ends this turn and triages it there, deciding whether the
   * follow-up runs now, later, or not at all. Only `blocks_me` holds the
   * origin up, and then the origin's settle says which task and why.
   */
  fileFollowup(task: TaskRuntime, input: FollowupInput): string {
    const origin = this.options.tasks.get(task.id);
    if (!origin) throw new Error(`Task ${task.id} no longer exists.`);
    const title = input.title.trim();
    const goal = input.goal.trim();
    const why = input.why.trim();
    if (!title) throw new Error("title is required.");
    // The title is the crewmate's words: past its room it is refused, never cut.
    const titleRefused = taskTitleRefusal(title);
    if (titleRefused) throw new Error(`Nothing was filed. ${titleRefused}`);
    if (!goal) throw new Error("goal is required: one sentence saying what done looks like.");
    if (!why) throw new Error("why is required: what you found that makes this follow-up needed.");
    const personal = this.host.isPersonalTask(task.id);
    // The follow-up's own posture, never the origin's: an ask made of the
    // origin is not one made of it (FI3-733). It is written again at start.
    const repo = origin.repoId ? this.options.repos.get(origin.repoId) : undefined;
    const delivery = personal ? undefined : deliveryFor({ repo: repo?.delivery }).delivery;
    const filed = this.options.tasks.fileFollowup({
      id: randomUUID().slice(0, 8),
      originId: origin.id,
      title,
      goal,
      why,
      prompt: renderFollowupBrief(
        { goal, why, filedBy: task.crewmate, originTitle: origin.title, originKey: origin.key },
        delivery,
        personal ? this.host.personalFacts() : undefined,
      ),
      ...(input.blocksMe ? { blocksOrigin: true } : {}),
      ...(input.testFailure ? { testFailure: true } : {}),
      ...(input.testPath ? { testPath: input.testPath } : {}),
    });
    if (filed.duplicate) {
      return `Already filed as ${filed.record.key} "${filed.record.title}" for ${input.testPath?.trim()}. Name that key in your report; do not file another.`;
    }
    const record = filed.record;
    this.options.broadcastEvent({
      type: "firstmate_note",
      text: `Task ${origin.title} follow-up filed: ${record.key} ${title}${input.blocksMe ? `; ${origin.title} must wait` : ""}`,
    });
    this.host.broadcastCrewCounts();
    task.filedThisTurn.push({ key: record.key, title, blocks: Boolean(input.blocksMe) });
    return `Filed follow-up ${record.key} "${title}", discovered from your task${input.blocksMe ? " and blocking it: your task cannot land until this one closes" : " and not holding it up"}. The first mate hears about it with your report and decides when it runs; keep going on your own task.`;
  }

  verifyValidationEvidence(taskId: string): void {
    const run = this.options.tasks.get(taskId)?.delivery?.liveValidation?.runs.at(-1);
    if (run)
      verifyKeptValidationEvidenceSync(
        run.evidence,
        crewmateCardPicturesDir(this.options.paths, taskId),
        taskId,
      );
  }

  private validationAllowances(record: TaskRecord, head: string) {
    return keptYeses(this.options.tasks, record, head, this.options.knowledge?.directions);
  }

  /** The write gateway calls this at execution, including a captain-approved kept write. */
  async consumeValidationEffect(
    taskId: string,
    request: string,
    write?: ValidationForgeWrite,
  ): Promise<void> {
    const task = this.options.tasks.get(taskId);
    if (!task) throw new Error("The task no longer exists; nothing was sent.");
    if (write) {
      const requested = task.delivery?.liveValidation?.permissions.find(
        (item) => item.request.id === request,
      )?.request;
      const approved = requested?.kind === "effect" ? requested.forgeWrite : undefined;
      if (
        !approved ||
        approved.host !== write.host ||
        approved.method !== write.method ||
        approved.path !== write.path ||
        approved.bodyDigest !== write.bodyDigest
      )
        throw new Error(
          "This exact write was not included in the validation request. Ask about its destination, action and contents before sending it.",
        );
    }
    const head = await this.validationHead(task);
    await this.requireCleanValidationWork(task, head);
    const current = this.options.tasks.get(taskId);
    if (!current) throw new Error("The task no longer exists; nothing was sent.");
    this.options.tasks.delivery.recordLiveValidation(
      taskId,
      {
        kind: "effect-state",
        request,
        state: "started",
        evidence: "The approved validation write passed the execution gate.",
      },
      { head, allowances: this.validationAllowances(current, head) },
    );
    this.options.tasks.delivery.recordLiveValidation(
      taskId,
      {
        kind: "effect-state",
        request,
        state: "unknown",
        evidence:
          "The write is being sent. Reconcile its result before any further action; never replay an unknown outcome.",
      },
      { head },
    );
  }

  async validationHead(record: TaskRecord): Promise<string> {
    const head = record.deviceId
      ? (await this.options.machines?.revision(record.deviceId, record.id))?.headSha
      : record.branch
        ? await this.options.workspace.branchHead(record.repoDir, record.branch)
        : undefined;
    if (!head)
      throw new Error("The task's committed version cannot be read; validation remains held.");
    return head;
  }

  private async requireCleanValidationWork(record: TaskRecord, head: string): Promise<void> {
    if ((!record.deviceId && !record.worktreeDir) || !record.branch)
      throw new Error("The validation working copy cannot be read; nothing may run.");
    const status = record.deviceId
      ? await this.options.machines?.workStatus(record.id)
      : await this.options.workspace.taskWorkStatus(
          {
            taskId: record.id,
            cwd: record.worktreeDir,
            repoDir: record.repoDir,
            branch: record.branch,
          },
          { strict: true },
        );
    const actual = record.deviceId
      ? (await this.options.machines?.revision(record.deviceId, record.id))?.headSha
      : await this.options.workspace.branchHead(record.worktreeDir, "HEAD");
    if (!status || status.dirty || actual !== head)
      throw new Error(
        "Commit the current work before validation; proof and permission name one clean committed version.",
      );
  }

  async recordValidationReport(
    task: TaskRuntime,
    text: string,
    summary: string | undefined,
    declared: ReportDeclaration,
    responseText: string,
  ): Promise<string> {
    const input = keptValidationInputSchema.parse(declared.validation);
    const record = this.options.tasks.get(task.id);
    if (!record) throw new Error("The task no longer exists.");
    const builder = this.host.reviewBuilderOf(record);
    const owner = builder ?? record;
    // INF-994: records are kept at every care level, so a raise to Careful
    // mid-task keeps them. A review's record is the verdict on any change
    // (INF-1875), however it delivers.
    if (input.kind !== "review" && !opensPullRequest(this.host.taskDelivery(owner.id)))
      throw new Error("Live validation belongs to a change delivered through a pull request.");
    // A review's record binds to the head its turn was assigned (INF-1875):
    // the version under review, read when the turn began, never the
    // builder's branch as it stands now.
    const currentHead =
      input.kind === "review" && builder ? undefined : await this.validationHead(owner);
    const head = builder ? record.delivery?.validationAssignment?.head : currentHead;
    if (!head)
      throw new Error(
        "The review has no assigned validation revision. Request a fresh review turn.",
      );
    if (input.kind === "decision")
      throw new Error(
        "Bind validation permission with emit_card.validation_request so the shown offer carries its exact facts; a report cannot attach permission to an unrelated card.",
      );
    if (
      currentHead !== undefined &&
      (input.kind === "run" ||
        (input.kind === "request" && input.request.kind === "effect") ||
        (input.kind === "effect-state" && input.state === "started"))
    )
      await this.requireCleanValidationWork(owner, currentHead);
    if (input.kind === "request" && input.request.kind === "effect" && input.request.preChange) {
      // A part built on an approved version has changed only what it added to that version.
      const builtOn = this.options.tasks.graph.startedOn(owner)?.head;
      const files = owner.deviceId
        ? (await this.options.machines?.revision(owner.deviceId, owner.id, undefined, builtOn))
            ?.changedFiles
        : await this.options.workspace.reviewChangedFiles(
            owner.repoDir,
            head,
            ...(builtOn ? [builtOn] : []),
          );
      if (!files || files.length)
        throw new Error(
          "A changed branch needs code review before a validation effect; it is not a pre-change reproduction.",
        );
    }
    if (input.kind === "run")
      await verifyKeptValidationEvidence(
        input.evidence,
        crewmateCardPicturesDir(this.options.paths, owner.id),
        owner.id,
      );
    // A verdict for another version than this turn's is refused below; the
    // refusal names the assigned version and the builder's newest commit,
    // so the reviewer and the first mate see which one it judged (INF-3141).
    const assigned = record.delivery?.validationAssignment;
    if (
      input.kind === "review" &&
      builder &&
      assigned &&
      (input.head !== assigned.head || input.revision !== assigned.revision)
    ) {
      const newest = await this.validationHead(builder).catch(() => undefined);
      throw new Error(
        `Live validation refused: Judge only the version and evidence assigned to this review turn: version ${assigned.head.slice(0, 7)} at evidence revision ${assigned.revision}; this record names ${input.head.slice(0, 7)} at evidence revision ${input.revision}. ${
          newest === undefined
            ? "The builder's newest commit cannot be read now."
            : newest === assigned.head
              ? "That is also the builder's newest commit."
              : `The builder's newest commit is ${newest.slice(0, 7)}; a later review turn is assigned it.`
        }`,
      );
    }
    const current = this.options.tasks.get(owner.id);
    if (!current) throw new Error("The task no longer exists.");
    const kept = builder ? [] : this.validationAllowances(current, head);
    this.options.tasks.delivery.recordLiveValidation(owner.id, input, {
      head,
      ...(builder
        ? { reviewer: task.id, assignment: record.delivery?.validationAssignment }
        : { allowances: kept }),
    });
    if (currentHead !== undefined)
      this.options.tasks.delivery.recordChangeEvidence(owner.id, { validationHead: currentHead });
    // The reviewer's typed review is this turn's verdict (INF-1875); the
    // turn's end records it on the builder.
    if (input.kind === "review") task.turnReview = input;
    const { validation: _validation, ...declaration } = declared;
    const recorded = this.options.tasks.get(owner.id)?.delivery?.liveValidation;
    const revision = validationRevision(recorded);
    const approvedFrom = approvedFromYes(input, recorded, kept);
    if (
      input.kind !== "run" &&
      input.kind !== "review" &&
      !declaration.needsFirstmate &&
      !declaration.responses?.length &&
      !declaration.wait &&
      !declaration.finished
    )
      return `Validation ${input.kind} recorded at evidence revision ${revision}.${approvedFrom || " This records facts, not a finished-work report or permission."} Continue the task; report when the first mate must act.`;
    return `${this.recordExplicitReport(task, text, summary, declaration, responseText)} Validation recorded at evidence revision ${revision}.${approvedFrom}`;
  }

  /**
   * report (WI-1): the crewmate's explicit report for the turn in flight.
   * It wins over the turn's final text and is sorted exactly once, when the
   * turn ends, or when it is made for a relay (`needs_firstmate`, which
   * the turn's end then does not wake again); implausible text is refused here, with the fix, instead of
   * being set aside later. What it declares about whose turn follows
   * (FI3-435) is checked here too: a wait or finished, never both, and a
   * wait's card is one of the crewmate's own that is up. The receipt says
   * only what the sort will do (FI3-710): a report wakes the Firstmate when
   * the task's state or its own needs_firstmate says so, not by itself.
   */
  recordExplicitReport(
    task: TaskRuntime,
    text: string,
    summary?: string,
    declared?: ReportDeclaration,
    responseText = text,
  ): string {
    const report = text.trim();
    if (!report) {
      throw new Error("text is required: what you finished, found, or are blocked on.");
    }
    const implausible = implausibleReport(report);
    if (implausible) {
      throw new Error(`Report refused: ${implausible}. Write it again in plain words.`);
    }
    const declaration = this.checkDeclaration(task, declared);
    // The crewmate step (INF-1610): the last running work of a captain's
    // message reports finished with no card answering it, so its crewmate
    // is asked once for that card; a second finished report is its reason.
    if (declaration?.finished && this.host.askEnding.crewmateStep(task.id).length > 0) {
      throw new Error(CREWMATE_ANSWER_ASK);
    }
    const heldSummary = summary?.replace(/\s+/g, " ").trim();
    const { recordedReleases, linked, responseReceipts } = this.options.tasks.atomic(
      () => ({
        // Saved now, counted at the turn's end (INF-3165): a turn the
        // provider fails after this call keeps the words on the record, and
        // its retry names them (docs/inbox.md, "A report a failed turn
        // kept"). A refused report rolls it back with the rest.
        held: this.options.tasks.turns.holdReport(task.id, {
          text: report,
          ...(heldSummary ? { summary: heldSummary } : {}),
        }),
        responseReceipts: (declaration?.responses ?? []).map((response) =>
          this.options.inbox.submitResponse(
            response,
            { task: task.id, session: task.session?.recordPath() ?? null },
            responseText,
          ),
        ),
        recordedReleases: declaration?.firstRelease
          ? this.options.tasks.delivery.recordFirstRelease(task.id, declaration.firstRelease)
          : undefined,
        linked: this.linkReportedWaits(task, declaration?.waitsOn),
      }),
      () => {},
    );
    task.explicitReport = report;
    task.explicitSummary = summary?.replace(/\s+/g, " ").trim() || undefined;
    task.explicitDeclared = declaration;
    this.host.noteTaskActivity(task);
    if (responseReceipts.length) this.host.pokeInbox();
    const receipt = ["Reported."];
    if (responseReceipts.length)
      receipt.push(
        ...responseReceipts.map(
          (response) =>
            `Saved response ${response.responseId}; first mate notification ${response.handledAt !== null ? "already handled (delivery handling, not correctness)" : response.deliveredAt !== null ? "delivered to its session; handling still pending" : "queued immediately (not yet confirmed delivered or handled)"}. Later reports do not replace it.`,
        ),
      );
    if (recordedReleases !== undefined)
      receipt.push(
        `Recorded ${recordedReleases} first-release attribution(s); existing attributions kept unless explicitly corrected.`,
      );
    if (declaration?.wait) {
      receipt.push(
        "Your task now waits on the captain: nothing nudges you, and you hear when they act or you are steered.",
      );
      const named = declared?.wait?.cardId?.trim();
      if (named && !declaration.wait.cardId)
        receipt.push(`Your card "${named}" is already closed, so the wait names no card.`);
      // He answers what is on his screen; with nothing there the Firstmate asks (INF-11).
      if (!declaration.wait.cardId && this.host.cards.openCardsFor(task.id).length === 0) {
        receipt.push(
          "No card of yours is up, so the first mate is woken to ask them unless one is up when this turn ends.",
        );
      }
    }
    if (linked) receipt.push(linked);
    const review = this.ownReviewNamed(task, declared);
    if (review)
      receipt.push(
        `waits_on named ${review}, your task's own review, so no wait was recorded on it: a question its reviewer asks the captain is your task's wait on the captain, so declare waiting_on_captain naming that card.`,
      );
    if (declaration?.checkBack) {
      const minutes = formatDurationShort(declaration.checkBack.minutes * 60_000);
      // A check-back owns a wait only while a job runs (INF-1644 R1); with
      // nothing running, a crewmate waiting for time starts a background
      // sleep, which the app counts as its job and whose end wakes it (INF-2133).
      const running =
        this.options.hasRunningJobs?.(task.id) === true ||
        this.host.clientJobStart(task.id) !== undefined;
      receipt.push(
        running
          ? `When this turn ends, the app wakes you in ${minutes} with your running job's facts, unless a turn starts before then.`
          : `Nothing of yours is running, so this check-back alone wakes nothing and the task reads as stopped when this turn ends. To wait ${minutes} for time to pass, start a background sleep for that long before this turn ends: it counts as your running job, and its end wakes you.`,
      );
    }
    if (declaration?.needsFirstmate) {
      receipt.push(
        this.host.cards.threadAwaitingAuthor(task.id)
          ? "The first mate is woken for it when this turn ends only if the captain's reply under your card has your answer by then: answer it in that thread or revise the card."
          : task.relayWoken?.request === declaration.needsFirstmate
            ? "The first mate was already woken for this request in this turn."
            : this.host.relayWakesNow(task)
              ? "The first mate is woken for it now, while your turn goes on."
              : "The first mate is woken for it when this turn ends.",
      );
    } else if (declaration?.finished && this.host.cards.answerNoteForTask(task.id)) {
      receipt.push(
        "Your saved answer still waits for the captain's Done on its note or record. This report does not close it or wake the first mate; putting it away is not an acknowledgement.",
      );
    } else if (
      declaration?.finished &&
      this.host.cards
        .openCardsFor(task.id)
        .some((card) => cardEmitter(card.id, card.taskId ?? task.id) === "crewmate")
    ) {
      // INF-1879: an open card, including one put away, still owns its explicit ending.
      // Its reviewer's question card (INF-5004) keeps the task open, while
      // who reads the report is the review's to route, so it promises none.
      const reviewers = this.host.cards
        .openCardsFor(task.id)
        .some((card) => Boolean(card.taskId) && card.taskId !== task.id);
      receipt.push(
        `${reviewers ? "A card about your task is still open, so finished does not close your task while it is up." : "A card of yours is still open, so finished does not wake the first mate while it is up."} ${ORDINARY_NOTE_READ_ACK} When the captain reads your note, the first mate is woken to close your task and no new turn starts for you. A decision waits for its choice; Done receipts a marked answer note or its record.`,
      );
    } else if (declaration?.finished) {
      receipt.push("The first mate hears it when this turn ends and closes your task.");
    } else if (!declaration?.wait && this.options.tasks.get(task.id)?.shape?.internal_step) {
      receipt.push(
        "Your internal step's report is handed to the first mate when this turn ends, unless a card, pending reply, or continuing work holds its turn.",
      );
    } else if (!declaration?.wait) {
      receipt.push(
        "It goes on your task's record when this turn ends; whether the first mate is woken for it depends on your task's state. If the first mate must act on it, report again with needs_firstmate.",
      );
    }
    return receipt.join(" ");
  }

  /**
   * A response a card line carries (docs/card-threads.md, "Shared cards"):
   * its request is live, a request about a card names this card's current
   * lifecycle, and an answer names the captain message the request is
   * about. An identity already saved is refused: a correction is a new one.
   * Nothing is written here; a refusal changes nothing.
   */
  checkCardResponse(
    response: CrewResponse,
    card: { id: string; lifecycleId?: string; messageId?: number },
  ): void {
    const parsed = crewResponseSchema.parse(response);
    const request = this.options.inbox.responseRequest(parsed.requestId);
    if (!request) throw new Error(`there is no response request ${parsed.requestId}.`);
    if (request.state === "cancelled") throw new Error("that response request was cancelled.");
    if (this.options.inbox.savedResponse(parsed.responseId))
      throw new Error(
        `response ${parsed.responseId} is already saved; a corrected answer needs a new response identity.`,
      );
    if (!request.card) return;
    if (request.card.id !== card.id || request.card.lifecycle !== card.lifecycleId)
      throw new Error(
        `request ${request.id} is about card ${request.card.id} in lifecycle ${request.card.lifecycle}; answer it there.`,
      );
    if (parsed.status === "answered" && card.messageId !== request.card.messageId)
      throw new Error(
        `request ${request.id} asks about the captain's message ${request.card.messageId}; name it in answers_message.`,
      );
  }

  /**
   * A response's optional captain reference is factual routing, never edit
   * authority. A reference that leaves out the lifecycle takes the card's
   * current one (INF-4165 finding 6), since the first mate is never shown
   * a lifecycle; the message must still be the captain's in it. A refusal
   * names the card's current captain messages (INF-3718); `field` names
   * the optional parameter that carried it, which the caller may leave out.
   * Answers the reference with its lifecycle.
   */
  checkResponseCard(
    reference: NonNullable<AskedResponsePolicy["card"]>,
    field?: string,
  ): ResponseCard {
    const card = this.options.cardStore.get(reference.id);
    const lifecycle = reference.lifecycle ?? card?.lifecycleId;
    const messages = card
      ? this.options.cardStore
          .observations(reference.id)
          .flatMap((observation) =>
            observation.lifecycleId === card.lifecycleId &&
            observation.kind === "message_ref" &&
            observation.payload.who === "captain"
              ? [observation.payload.messageId]
              : [],
          )
      : [];
    if (lifecycle && card?.lifecycleId === lifecycle && messages.includes(reference.messageId))
      return { id: reference.id, lifecycle, messageId: reference.messageId };
    const facts = !card
      ? `There is no card ${reference.id}.`
      : `Card ${reference.id}'s current lifecycle is ${card.lifecycleId}, ${messages.length ? `with captain messages ${messages.join(", ")}` : "with no captain message"}.`;
    const way = !field
      ? "Read the current card before resubmitting."
      : card && messages.length
        ? `Name one of those messages in ${field}, or leave ${field} out.`
        : `Leave ${field} out.`;
    throw new Error(
      `The response reference does not name a captain message in that card's current lifecycle. Nothing changed. ${facts} ${way}`,
    );
  }

  /** A report's declaration, normalized, or a refusal with the fix (FI3-435, FI3-710). */
  private checkDeclaration(
    task: TaskRuntime,
    declared: ReportDeclaration | undefined,
  ): ReportDeclaration | undefined {
    const wait = declared?.wait;
    if (wait && declared?.finished) {
      throw new Error("Report refused: pass waiting_on_captain or finished, not both.");
    }
    if (declared?.checkBack && (wait || declared.finished)) {
      throw new Error(
        "Report refused: check_back is for work of your own still running; pass it without waiting_on_captain or finished.",
      );
    }
    const ask = declared?.needsFirstmate?.replace(/\s+/g, " ").trim();
    if (declared?.needsFirstmate !== undefined && !ask) {
      throw new Error(
        "Report refused: needs_firstmate needs a reason - what the first mate must do.",
      );
    }
    const captainWords = this.relayedWords(task, declared?.captainWordsFrom);
    const workWait = declared?.workWait ? workWaitSchema.parse(declared.workWait) : undefined;
    const recoveryWays = declared?.recoveryWays?.length
      ? declared.recoveryWays.map((way) => keptRecoveryWaySchema.parse(way))
      : undefined;
    const result = this.checkResult(task, declared);
    const checkBack = checkBackOf(declared);
    const waitsOn = this.reportedWaits(task, declared);
    const responses = declared?.responses?.map((response) => crewResponseSchema.parse(response));
    for (const response of responses ?? []) {
      const request = this.options.inbox.responseRequest(response.requestId);
      if (request?.card && !this.options.inbox.savedResponse(response.responseId))
        this.checkResponseCard(request.card);
    }
    const needs = {
      ...(responses?.length ? { responses } : {}),
      ...(waitsOn ? { waitsOn } : {}),
      ...(workWait ? { workWait } : {}),
      ...(recoveryWays ? { recoveryWays } : {}),
      ...(ask ? { needsFirstmate: cutText(ask, 300) } : {}),
      ...(captainWords ? { captainWordsFrom: captainWords.from, captainWords } : {}),
      ...(declared?.firstRelease ? { firstRelease: declared.firstRelease } : {}),
      ...(result ? { result } : {}),
      ...(checkBack ? { checkBack } : {}),
    };
    if (declared?.finished) return { finished: true, ...needs };
    if (!wait) return Object.keys(needs).length > 0 ? needs : undefined;
    const reason = wait.reason.replace(/\s+/g, " ").trim();
    if (!reason) {
      throw new Error(
        "Report refused: waiting_on_captain needs a reason - what the captain still has to read or decide.",
      );
    }
    const named = wait.cardId?.trim();
    const cardId = named ? this.ownOpenCard(task, named) : undefined;
    return { wait: { reason: cutText(reason, 300), ...(cardId ? { cardId } : {}) }, ...needs };
  }

  /**
   * The captain's words a report passes on (INF-3202): read where its
   * crewmate says he typed them, on a card of its own task or in its
   * Crewmate tab, or a refusal with the fix. The words are kept whole; the
   * host reads none of them.
   */
  private relayedWords(task: TaskRuntime, from: string | undefined) {
    if (from === undefined) return undefined;
    const cited = from.trim();
    if (!cited)
      throw new Error(
        "Report refused: captain_words_from is empty; name your card's id or crewmate-tab, or leave it out.",
      );
    const read = this.host.relayedCaptainWords(task.id, cited);
    if (!read.ok) throw new Error(read.text);
    return { from: cited, text: read.words, at: read.at };
  }

  /**
   * The open card of its own a report's wait names: by the id emit_card
   * returned, or by the id the crewmate gave emit_card, which names the
   * same card (`crewmateCardId`). A card of its own that is already closed,
   * with no card of its open, is a fact the app holds, so the wait drops it
   * and names no card (INF-3060: five reports in a day were refused for
   * it). With a card of its open the wait may have meant that one, and the
   * app guesses nothing, so any other name is refused with the full id of
   * each card it has open, so the next report can name one (INF-2835).
   */
  private ownOpenCard(task: TaskRuntime, named: string): string | undefined {
    // Its reviewer's question card asks about it too (INF-5004), and keeps
    // the reviewer's id, so its short name is read under the reviewer's task.
    const about = this.host.cards.openCardsFor(task.id);
    const open = about.map((card) => card.id);
    const found = about.find(
      (card) => card.id === named || card.id === crewmateCardId(card.taskId ?? task.id, named),
    );
    if (found) return found.id;
    const candidates = [named, crewmateCardId(task.id, named)];
    if (
      open.length === 0 &&
      candidates.some((candidate) => this.options.cardStore.get(candidate)?.taskId === task.id)
    )
      return undefined;
    const ids = open.map((full) => `"${full}"`).join(", ");
    throw new Error(
      open.length === 0
        ? `Report refused: "${named}" is not an open card of yours, and no card of yours is open. Omit card_id.`
        : open.length === 1
          ? `Report refused: "${named}" is not an open card of yours. Your open card is ${ids}; pass that id, or omit card_id.`
          : `Report refused: "${named}" is not an open card of yours. Your open cards are ${ids}; pass one of those ids, or omit card_id.`,
    );
  }

  /**
   * The tasks a report says its task waits on (INF-1428, `waits_on`),
   * resolved to live tasks by key or id, or a refusal naming the first that
   * is unknown, closed or the task itself. A wait is for work still to
   * come, so finished refuses it. A cycle is refused when the links are
   * written (`linkReportedWaits`).
   */
  private reportedWaits(
    task: TaskRuntime,
    declared: ReportDeclaration | undefined,
  ): string[] | undefined {
    const refs = (declared?.waitsOn ?? []).map((ref) => ref.trim()).filter(Boolean);
    if (refs.length === 0) return undefined;
    if (declared?.finished) {
      throw new Error(
        "Report refused: waits_on names work your task still waits on; pass it without finished.",
      );
    }
    const ids: string[] = [];
    for (const ref of refs) {
      const named = this.options.tasks.resolve(ref);
      if (!named) {
        throw new Error(
          `Report refused: waits_on names "${ref}", which is no task. Search with tasks and pass its key.`,
        );
      }
      // A replaced task's wait is recorded on the task carrying its work (INF-1826).
      const record = this.options.tasks.graph.carrierOf(named.id) ?? named;
      if (record.id !== named.id && record.status === "done") {
        throw new Error(
          `Report refused: waits_on names ${named.key || named.id}, whose work moved to ${record.key || record.id}, which is already done, so nothing waits on it any more.`,
        );
      }
      if (record.id === task.id) {
        throw new Error(`Report refused: waits_on names your own task, ${ref}.`);
      }
      // Its own review is no wait it holds (INF-5004): the receipt says so.
      if (this.isOwnReview(task, record)) continue;
      if (TaskService.isClosed(record)) {
        throw new Error(
          `Report refused: waits_on names ${record.key || record.id}, which is ${record.status}, so nothing waits on it any more.`,
        );
      }
      if (!ids.includes(record.id)) ids.push(record.id);
    }
    return ids.length > 0 ? ids : undefined;
  }

  /** A host-raised delivery child of the task, such as its review. */
  private isOwnReview(task: TaskRuntime, record: TaskRecord): boolean {
    return record.parentId === task.id && TaskService.isDeliveryChild(record);
  }

  /** The key of the task's own review a report's waits_on named, which no wait records. */
  private ownReviewNamed(
    task: TaskRuntime,
    declared: ReportDeclaration | undefined,
  ): string | undefined {
    for (const ref of declared?.waitsOn ?? []) {
      const record = this.options.tasks.resolve(ref.trim());
      if (record && this.isOwnReview(task, record)) return record.key || record.id;
    }
    return undefined;
  }

  /**
   * Records a report's waits as `blocks` links (INF-1428): each holds the
   * task's merge until that work closes (INF-3167), and the idle ladder and
   * the report's sort read it like any other (docs/report-sort.md). A cycle
   * refuses the report with the graph's own words. Returns the receipt's
   * line, if any link was new.
   */
  private linkReportedWaits(task: TaskRuntime, waitsOn: string[] | undefined): string | undefined {
    if (!waitsOn?.length) return undefined;
    let linked: string[];
    try {
      linked = this.options.tasks.graph.linkWaits(task.id, waitsOn, "crewmate");
    } catch (caught) {
      if (caught instanceof TaskGraphRefusal) throw new Error(`Report refused: ${caught.message}`);
      throw caught;
    }
    const names = waitsOn.map((id) => {
      const record = this.options.tasks.get(id);
      return record?.key || id;
    });
    return `${linked.length > 0 ? "Recorded" : "Already recorded"}: your task waits on ${names.join(", ")}. While that work is underway nothing nudges you, and when it closes you are steered; work nobody has started goes to the first mate.`;
  }

  /**
   * A report's typed result against its task's declared shape (INF-799
   * piece 1): a result that does not fit, or none where a shape stands, is
   * refused naming the first failing field, so the crewmate reports again.
   * A report that hands the turn to the captain or the first mate, or names
   * a check-back on work still running (INF-2037), is taken without one. A
   * task with no shape keeps whatever object it was given.
   */
  private checkResult(
    task: TaskRuntime,
    declared: ReportDeclaration | undefined,
  ): Record<string, unknown> | undefined {
    const schema = this.options.tasks.get(task.id)?.shape?.result_schema;
    const result = declared?.result;
    if (!schema) return result;
    if (result === undefined) {
      if (
        declared?.wait ||
        declared?.needsFirstmate?.trim() ||
        declared?.checkBack ||
        declared?.responses?.length
      )
        return undefined;
      throw new Error(
        "Report refused: result is missing. Your task declares a result shape (your brief prints it): pass result, a JSON object that fits it, or declare waiting_on_captain, needs_firstmate, check_back or a correlated response.",
      );
    }
    const refusal = resultRefusal(schema, result);
    if (refusal)
      throw new Error(
        `Report refused: ${refusal} Fix that field so result fits your task's result shape, and report again.`,
      );
    return result;
  }

  /**
   * note_progress: one line on the crewmate's own timeline; proof of life
   * too. A note that carries a list replaces the plan; one that omits it
   * keeps the last list standing rather than being refused (INF-484 move 5:
   * never refuse a shape). Only a list no surface could draw is refused in
   * words, writing nothing.
   */
  noteProgress(task: TaskRuntime, text: string, plan?: unknown): string {
    const line = text.replace(/\s+/g, " ").trim();
    if (!line) throw new Error("text is required: one line of progress.");
    let items: PlanItem[] | undefined;
    if (plan !== undefined) {
      const read = readPlanItems(plan);
      if ("refusal" in read) return read.refusal;
      items = read.items;
    }
    const planned =
      !items &&
      this.options.tasks
        .timeline(task.id)
        .some(
          (event) =>
            (event.kind === "progress" || event.kind === "compacted") &&
            !("refusal" in readPlanItems(event.data?.plan)),
        );
    this.options.tasks.noteProgress(task.id, cutText(line, 500), "crewmate", items);
    this.host.noteTaskActivity(task);
    if (items) return "Noted on your task's timeline, with your plan.";
    return planned
      ? "Noted on your task's timeline; your last plan stands."
      : "Noted on your task's timeline.";
  }
}

/**
 * A report's check-back, normalized, or a refusal with the fix (INF-1244):
 * a positive number of minutes and what the crewmate waits for.
 */
function checkBackOf(
  declared: ReportDeclaration | undefined,
): ReportDeclaration["checkBack"] | undefined {
  const back = declared?.checkBack;
  if (!back) return undefined;
  if (!Number.isFinite(back.minutes) || back.minutes <= 0) {
    throw new Error(
      "Report refused: check_back minutes must be a number above 0 - how long until you look at the job again.",
    );
  }
  const waitingFor = back.waitingFor.replace(/\s+/g, " ").trim();
  if (!waitingFor) {
    throw new Error(
      "Report refused: check_back needs waiting_for - what the running job is doing.",
    );
  }
  return { minutes: back.minutes, waitingFor: cutText(waitingFor, 300) };
}

/**
 * INF-4446: the receipt's words when a check request named a kept yes and
 * the approval it rests on counts now, so the crewmate runs the check
 * rather than asking the captain again; empty otherwise.
 */
function approvedFromYes(
  input: KeptValidationInput,
  recorded: LiveValidation | undefined,
  kept: readonly ValidationAllowance[],
): string {
  if (input.kind === "effect-state" && input.state === "started") {
    const source = recorded?.permissions.find((entry) => entry.request.id === input.request)?.yes;
    return source
      ? ` The exact reviewed action passed the gate using ${source}; send it once, then record its outcome.`
      : "";
  }
  if (input.kind !== "request" || input.request.kind !== "check" || !input.request.allowance)
    return "";
  const { id, scenario: scenarioId, allowance } = input.request;
  const scenario = recorded?.scenarios.find((item) => item.id === scenarioId);
  if (!recorded || !scenario || checkApproval(recorded, scenario, kept)?.request.id !== id)
    return "";
  const yes =
    allowance === STANDING_WORDS_FROM
      ? "standing override"
      : allowance.startsWith("d:")
        ? `direction ${allowance}`
        : `kept yes on ${allowance}`;
  return ` The check ${scenarioId} is approved from the captain's ${yes}; run it now with no card, while that yes stands.`;
}
