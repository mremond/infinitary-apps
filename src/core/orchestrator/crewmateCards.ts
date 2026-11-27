import { rm } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { cardPictureFiles } from "@shared/cardPictures";
import {
  type Card,
  type CardMutation,
  MERGE_NOT_NOW_ID,
  type MergeEffect,
  mergeEffectOf,
  requestWriteEffectOf,
  settleEffectOf,
} from "@shared/cards";
import { type MergeCardRequest, readyPresentation } from "@shared/changePresentation";
import { everyFailureDiagnosed } from "@shared/checkRepair";
import {
  CHECK_WAITING_TO_START_WORDS,
  checksStillRunning,
  checksWaitingToStart,
  currentCheckStatus,
  everyFailureOnMain,
  failedBatch,
  noCheckRan,
} from "@shared/checkSnapshot";
import { CONTRIBUTION_MERGE_REFUSAL } from "@shared/contributions";
import { forgePlace } from "@shared/forge";
import { fixedHoldWords, overridePasses, softHoldWords } from "@shared/holds";
import type { ValidationPermission } from "@shared/liveValidation";
import { VALIDATION_GAPS_FIELD } from "@shared/liveValidation";
import { mergeActionsOf } from "@shared/mergeHeld";
import type { MergeReview } from "@shared/mergeReview";
import { hostedPresentation } from "@shared/presentationDestination";
import { opensPullRequest, type RepoDelivery } from "@shared/repos";
import type { RiskAssessment } from "@shared/risk";
import {
  CHECK_WORDS,
  MERGE_NOT_NOW_WORDS,
  MERGE_WORDS,
  mergeWordsFor,
  REVIEW_CAREFULLY_WORDS,
  SKIP_RULES_MERGE_WORDS,
  sendWriteWords,
  submitFeedbackWords,
} from "@shared/vocabulary";
import { NEVER_SENT_AGAIN, type WriteAsk } from "@shared/writeAsk";
import { contractChange } from "../connection/contractChanges";
import type { CaptainPlace } from "../devices/captainPlaces";
import { crewmateCardPicturesDir } from "../paths";
import { lintCrewmateCard } from "../pi/cardLint";
import {
  emittedAction,
  parseStableCardId,
  STABLE_CARD_ID_MAX,
  savedStoryRefusal,
} from "../pi/cardTool";
import { verifyKeptValidationEvidence } from "../pi/validationEvidence";
import { LOCAL_MACHINE_ID } from "../session/session";
import {
  CardRefusedError,
  cardRefusalOf,
  type DeclaredCardInput,
  type EmittedAction,
  type EmittedCardInput,
  labeledActions,
} from "../session/tools";
import { currentChange } from "../storage/changeProjection";
import type { CardRefusal, CompletionOffer, TaskRecord } from "../storage/taskRecords";
import { keptYeses } from "../tasks/alreadyAllowed";
import { recordValidation as checkValidationTransition } from "../tasks/liveValidation";
import { TaskService } from "../tasks/taskService";
import { followBase } from "./baseFollow";
import { CardBrowserActions } from "./cardBrowserActions";
import { revisionNotice } from "./cardChanges";
import { crewmateCardId } from "./cardEmit";
import type { CardService } from "./cardService";
import { escapeCardText } from "./cardText";
import type { CardCaller } from "./cardThreads";
import type { TaskRuntime } from "./crewRuntime";
import type { CrewSupervisorOptions } from "./crewSupervisorOptions";
import { manualHoldWords } from "./deliveryWakes";
import {
  type CoveredFailure,
  coveredNextStep,
  coveringApproval,
  keptApprovalLine,
} from "./mergeAuthorization";
import { type MergeCardWalk, mergeCardAnswer } from "./mergeCardSteps";
import { skipRulesStrip, writeAskStrip } from "./requestStrips";
import type { MergeBehind } from "./settleCardFacts";
import type { SettleOwners } from "./settleOwners";
import { contributionStatusLine, pendingMergeLine } from "./settleWords";
import { seenBefore, sinceSeenNotice, sinceSeenSection } from "./sinceSeen";
import { deliverableOf, mergesInOwnBatch, taskContributesUpstream } from "./workShape";

/** A crewmate can name the answered card it asks again (`asks_again`). */
const CARD_ASKS_AGAIN = contractChange("card-asks-again");

/**
 * The tool's answer when a completion card's revision went up while its
 * checks run (INF-834 friction 4): the words are the captain's to read now,
 * and the merge waits for the checks on its own.
 */
export const COMPLETION_REVISED_WHILE_RUNNING =
  "The card is shown; its merge waits on the checks. Do not emit it again just for that. Read missing results and fix failures as usual.";

/** The one merge a card's actions declare, if any (INF-2744). */
function mergeOf(actions: readonly { effect?: unknown }[] | undefined): MergeEffect | undefined {
  for (const action of actions ?? []) {
    const merge = mergeEffectOf(action as Parameters<typeof mergeEffectOf>[0]);
    if (merge) return merge;
  }
  return undefined;
}

/** Whether a card merges the task's own current change. */
function mergesOwn(actions: readonly { effect?: unknown }[] | undefined): boolean {
  return (actions ?? []).some((action) => {
    const merge = mergeEffectOf(action as Parameters<typeof mergeEffectOf>[0]);
    return merge !== undefined && !merge.review;
  });
}

function settles(actions: readonly { effect?: unknown }[] | undefined): boolean {
  return (actions ?? []).some((action) => {
    const typed = action as Parameters<typeof mergeEffectOf>[0];
    return mergeEffectOf(typed) !== undefined || settleEffectOf(typed) !== undefined;
  });
}

/** What a crewmate's cards reach of the supervisor beyond its options. */
export type CrewmateCardsHost = {
  now(): number;
  readonly cards: CardService;
  /** Settling and closing, for the merge approval a new merge card replaces. */
  readonly settling: SettleOwners;
  /** Where a task runs, in its card's words (`TaskPlacement.cardPlace`). */
  cardPlace(taskId: string): string | undefined;
  /** A task's delivery posture: the merge mode a settle resolves to. */
  taskDelivery(taskId: string): RepoDelivery | undefined;
  /** Whether a task merges on its own. */
  taskAutonomy(taskId: string): boolean;
  /** Whether a task builds in place on the personal workspace. */
  isPersonalTask(taskId: string): boolean;
  /** Whether the host filed a task to work in place in its project's folder. */
  worksInPlace(taskId: string): boolean;
  /** A merge effect in the task's own words: its pull request's, or a local merge. */
  mergeModeFor(taskId: string): "merge-pr" | "land";
  /** Where a task's crewmate runs: the computer that runs work its record names, or this Mac. */
  machineOf(taskId: string): string;
  /** The version a validation question, or a merge offered after a passed review, answers. */
  validationHead(record: TaskRecord): Promise<string>;
  /** One card's completion offer, replacing that card's earlier entry. */
  keepOffer(taskId: string, offers: readonly CompletionOffer[], offer: CompletionOffer): void;
};

/**
 * A crewmate's own cards as the crew takes them (docs/card-authoring.md,
 * docs/card-threads.md "Shared cards"): its emit_card - its own card, or a
 * contribution to someone else's - the completion card the host finishes
 * with its buttons and holds on its checks, the offer it keeps, the strip
 * of what a request card's click sends, the refusals the task keeps, and
 * whether its crewmate still owes its completion card. The crew
 * supervisor composes it and its callers reach it as
 * `CrewSupervisor.crewmateCards`.
 */
export class CrewmateCards {
  /** A card's browser door: its browser button, its page and its hand-off. */
  private readonly browser: CardBrowserActions;
  /** Each card and story the app redrew a card behind its change at (`redrawBehind`), once. */
  private readonly redrawn = new Set<string>();
  /** Tasks whose show_merge_card call is running (`whileShowing`). */
  private readonly showing = new Map<string, number>();
  /** Each task's app redraw still writing (`redrawBehind`), which its author's story calls wait for. */
  private readonly redrawing = new Map<string, Promise<void>>();

  constructor(
    private readonly options: CrewSupervisorOptions,
    private readonly host: CrewmateCardsHost,
  ) {
    this.browser = new CardBrowserActions(options, (id) => this.host.cards.get(id));
  }

  /**
   * A crewmate's emit_card: its own card as ever, or a contribution to
   * someone else's (docs/card-threads.md, "Shared cards"), which keeps that
   * card's author, task and answerer and returns the typed result of what
   * the host saved. A card id the record lacks outside the crewmate's own
   * namespace is refused, never filed as a new card.
   */
  crewmateCardWrite(
    task: TaskRuntime,
    input: DeclaredCardInput,
  ): string | CardMutation | Promise<string> {
    const caller: CardCaller = { actor: "crewmate", taskId: task.id };
    const target = this.host.cards.targetOf(caller, input.id);
    // A script shares the frame with the bridge that reports the captain's
    // answers, so it could forge which words are theirs; a reader's words are
    // marked by that split (`answersWithAuthorWordsMarked`).
    if (
      this.options.tasks.get(task.id)?.shape?.unsafe_data_reader === true &&
      /<script\b/i.test(input.body)
    ) {
      // i18n-exempt: a refusal served to the crewmate, never shown to a person
      const why = "an unsafe data reader's card carries no script; send the body as plain HTML.";
      throw new CardRefusedError(`Card refused: ${why}`, "shape", why);
    }
    // A computer from before shared cards would read the typed result as
    // its own card shown: it is refused before anything is written.
    const machine = this.host.machineOf(task.id);
    if (input.files?.length) {
      if (target.kind !== "new" && target.kind !== "own")
        throw new Error(
          `Card refused: files ride only your own task's card; card ${target.id} is not this task's.`,
        );
      // The home names the computer holding each kept copy: the one this task runs on.
      input = {
        ...input,
        files: input.files.map(({ computer: _claimed, ...file }) =>
          machine === LOCAL_MACHINE_ID ? file : { ...file, computer: machine },
        ),
      };
    }
    if (
      target.kind !== "new" &&
      target.kind !== "own" &&
      machine !== LOCAL_MACHINE_ID &&
      !this.options.machines?.takesSharedCards?.(machine)
    ) {
      const why = `card ${target.id} is not this task's, and ${this.options.machines?.placeOf(machine).who ?? "the computer this task runs on"} runs an older Infinitary that cannot write on someone else's card. Nothing was written; reply on it or report the gap to the first mate.`;
      throw new CardRefusedError(`Card refused: ${why}`, "other", why);
    }
    if (target.kind === "new" || target.kind === "own") {
      if (input.expectedRevision !== undefined) {
        const own = target.kind === "own" ? this.host.cards.cardRead(target.id) : undefined;
        // The card's own title as it wrote it: `cardRead` marks a reader's as data.
        const title = own && (this.host.cards.get(own.id) ?? this.host.cards.stored(own.id))?.title;
        if (own && own.revision !== input.expectedRevision)
          throw new Error(
            `Nothing changed on card "${title ?? ""}" (${own.id}): you read revision ${input.expectedRevision}, and it is at ${own.revision ?? "none"} now. Read it again before revising it.`,
          );
      }
      return this.readerChecked(task, input, this.addCrewmateCard(task, input));
    }
    const unlabeled = input.actions.find((action) => !action.label?.trim());
    if (unlabeled)
      return cardRefusedMutation(
        this.host.cards,
        caller,
        target.id,
        `choice "${unlabeled.id}" needs its label.`,
      );
    const actions = input.actions.map((action) => ({ ...action, label: action.label ?? "" }));
    return this.host.cards.contribute(
      caller,
      { ...input, actions },
      {
        ...(input.expectedRevision !== undefined
          ? { expectedRevision: input.expectedRevision }
          : {}),
        ...(input.contributionReason ? { reason: input.contributionReason } : {}),
        ...(input.operationId ? { operationId: input.operationId } : {}),
        ...(input.answersMessage !== undefined ? { answersMessage: input.answersMessage } : {}),
      },
    );
  }

  /**
   * The reader check on a crewmate's own card (docs/card-authoring.md, "The
   * reader check"): once the card is up, its four readings are asked and
   * any that did not pass are added to the answer as facts. A refused card
   * is never read, and a check that is off, fails or finds nothing adds
   * nothing; the card is never held for it.
   */
  private readerChecked(
    task: TaskRuntime,
    input: DeclaredCardInput,
    shown: string | Promise<string>,
  ): string | Promise<string> {
    const check = this.options.readerCheck;
    if (!check?.on()) return shown;
    const card = { title: input.title, body: input.body ?? "" };
    return Promise.resolve(shown).then(async (answer) => {
      const facts = await check.read(task.id, card).catch(() => "");
      return `${answer}${facts}`;
    });
  }

  /**
   * show_merge_card's last steps (INF-3717 piece 2), after the walk up to
   * the card: the checks passed, no open work the task waits on, then the
   * saved story's merge card with the one merge action the app builds. The
   * card path is emit_card's own, so the card, its strip and its approval
   * rules are the same. The answer names what was done and the first step
   * someone else supplies; a card the app refused is kept as a refusal.
   */
  async showMergeCard(
    task: TaskRuntime,
    walk: MergeCardWalk,
    request: MergeCardRequest,
  ): Promise<string> {
    if (walk.stop || !walk.ready) return mergeCardAnswer(walk);
    const { did } = walk;
    const stop = (
      step: "checks" | "waits" | "card",
      missing: string,
      by: "checks" | "first-mate" | "crewmate",
    ) => mergeCardAnswer({ did, stop: { step, missing, by } });
    // Checks still running are a step not yet true, whose finish wakes the
    // crewmate. Failed checks, an empty reading, an unreadable change or a
    // review gate are the crewmate's, with the refusal's whole guidance,
    // recorded as emit_card records it.
    const checksStop = (refused: CardRefusedError, title: string) => {
      if (refused.running) return stop("checks", refused.why, "checks");
      this.recordCardRefusal(task, { title, ...cardRefusalOf(refused) });
      return stop("checks", refused.message, "crewmate");
    };
    // A version the captain's approval already covers takes no new card
    // (INF-4018): the answer says so, and nothing is recorded as refused.
    const covered = this.coveredMergeRefusal(task.id, undefined, walk.ready.head);
    if (covered) return mergeCardAnswer(walk, covered);
    let stableId: string;
    try {
      stableId = parseStableCardId(request.id) ?? "";
      if (!stableId) throw new Error("Give the merge card an id, such as merge-footer-fix.");
    } catch (caught) {
      return stop("card", caught instanceof Error ? caught.message : String(caught), "crewmate");
    }
    // The task's open merge card is revised whatever id the call gives
    // (INF-4031), so an older card never stands beside a newer one.
    const open = this.openMergeCard(task.id);
    const openId = open?.id.slice(crewmateCardId(task.id, "").length);
    if (openId && openId !== stableId) {
      did.push(
        `Your open merge card is ${openId}, so this revises it instead of putting up ${stableId}.`,
      );
      stableId = openId;
    }
    // The captain already chose on a card under this id, and the choice
    // reached the crewmate: the card goes up under a new id instead of being
    // refused for asking again. A choice still on its way keeps the refusal,
    // which carries it.
    const answered = (id: string) => {
      const full = crewmateCardId(task.id, id);
      const past = this.host.cards.past(full);
      return (
        past?.ending.how === "chose" &&
        (past.ending.by ?? "captain") === "captain" &&
        !this.options.inbox.holdsUndeliveredChoice(task.id, full)
      );
    };
    let id = stableId;
    for (let next = 2; answered(id); next++) {
      const suffix = `-${next}`;
      id = `${stableId.slice(0, STABLE_CARD_ID_MAX - suffix.length)}${suffix}`;
    }
    if (id !== stableId) {
      const chose = this.host.cards.past(crewmateCardId(task.id, stableId))?.ending.label;
      did.push(
        `You answered card ${stableId} already${chose ? ` (the captain chose "${chose}")` : ""}, so the merge card goes up as ${id}.`,
      );
    }
    const merge = emittedAction({
      id: "merge",
      default: true,
      effect: {
        kind: "merge",
        after: request.after ?? "close",
        ...(request.asksFirst?.trim() ? { asks_first: request.asksFirst } : {}),
      },
    });
    // 7 and 8: checks before the wait, so a wait never hides checks still running.
    if (merge.effect?.kind === "merge" && merge.effect.after === "close") {
      const waiting = this.options.tasks.graph.blockerRefusal(task.id);
      if (waiting) {
        try {
          const reading = await this.pendingCiGate(task.id, {
            title: walk.ready.title,
            body: "",
            actions: [{ ...merge, label: merge.label ?? "" }],
            id,
          });
          if (reading === "running")
            return stop("checks", "The pull request's checks are still running.", "checks");
        } catch (caught) {
          if (caught instanceof CardRefusedError && caught.reason === "checks")
            return checksStop(caught, walk.ready.title);
          throw caught;
        }
        return stop("waits", waiting.text, "first-mate");
      }
    }
    try {
      const shown = await this.crewmateCardWrite(task, {
        title: walk.ready.title,
        body: "",
        presentationRevision: walk.ready.revision,
        actions: [merge],
        id,
        ...(request.reply?.trim() ? { reply: request.reply.trim() } : {}),
        ...(request.reply?.trim() && request.interim === true ? { interim: true } : {}),
        ...(request.answersMessage !== undefined ? { answersMessage: request.answersMessage } : {}),
        ...(request.sinceSeen?.trim() ? { sinceSeen: request.sinceSeen.trim() } : {}),
      });
      const said = typeof shown === "string" ? shown : "";
      return mergeCardAnswer(
        walk,
        `Showed the merge card from story revision ${walk.ready.revision}${said ? ` (${said})` : ""}.`,
      );
    } catch (caught) {
      if (caught instanceof CardRefusedError && caught.reason === "checks")
        return checksStop(caught, walk.ready.title);
      this.recordCardRefusal(task, { title: walk.ready.title, ...cardRefusalOf(caught) });
      return stop("card", caught instanceof Error ? caught.message : String(caught), "crewmate");
    }
  }

  /**
   * A task's show_merge_card call from its story's preparation to its card
   * write (INF-4031): the app redraws none of that task's cards meanwhile,
   * so the two writes never race and the call's own revision, its reply and
   * what changed since the captain looked are the ones that go up.
   */
  async whileShowing<T>(taskId: string, call: () => Promise<T>): Promise<T> {
    this.showing.set(taskId, (this.showing.get(taskId) ?? 0) + 1);
    try {
      await this.redrawing.get(taskId);
      return await call();
    } finally {
      const left = (this.showing.get(taskId) ?? 1) - 1;
      if (left > 0) this.showing.set(taskId, left);
      else this.showing.delete(taskId);
    }
  }

  /**
   * The task's open merge card of its own change, as its crewmate put it up:
   * one with that merge, or one whose Merge the app holds (INF-4031).
   */
  openMergeCard(taskId: string): Card | undefined {
    const own = crewmateCardId(taskId, "");
    for (const card of this.host.cards.values()) {
      if (card.taskId !== taskId || !card.id.startsWith(own)) continue;
      if (mergesOwn(mergeActionsOf(card))) return card;
    }
    return undefined;
  }

  /**
   * A story call of the task's author after the app's redraw of its merge
   * card ends (INF-4031): the redraw holds the task's story operation, which
   * refuses a second one, so the author's call waits for it instead.
   */
  afterRedraw<T>(taskId: string, call: () => T): T | Promise<Awaited<T>> {
    const running = this.redrawing.get(taskId);
    return running ? (running.then(call) as Promise<Awaited<T>>) : call();
  }

  /**
   * A crewmate's merge card behind its change, redrawn by the app at the
   * newest story once that story is ready at the current version (INF-4031):
   * show_merge_card's own write, under the card's id, so the checks rule,
   * an approval that covers the version, change marks and the strip apply as
   * they do to the crewmate's call. The story's words are always the
   * crewmate's: with no story at the current version, nothing is redrawn.
   * Whether a redraw started or already ran for that story; `failed` hears a
   * redraw the app refused.
   */
  redrawBehind(task: TaskRuntime, card: Card, behind: MergeBehind, failed: () => void): boolean {
    // The task's own show_merge_card is writing this card: it brings it current.
    if (this.showing.has(task.id)) return true;
    const record = this.options.tasks.get(task.id);
    const ledger = this.options.tasks.delivery.changePresentation(task.id);
    const newest = ledger?.revisions.at(-1);
    const current = behind.current ?? record?.delivery?.headSha;
    if (!record || !ledger || !newest || !current || newest.head !== current) return false;
    // On a hosted project the redraw waits for the story's publication to be
    // confirmed: a revision at this version not yet published is redrawn
    // once it is, with no wake meanwhile, since its author is publishing it;
    // the confirmation is a new reading (`MergeBehind.published`). An
    // uncertain write wakes the author.
    if (
      hostedPresentation(newest.destination) &&
      (ledger.published?.revision !== newest.revision || ledger.publication?.state !== "confirmed")
    )
      return !(
        ledger.publication?.revision === newest.revision && ledger.publication.state === "uncertain"
      );
    const once = `${card.id}:${newest.revision}:${newest.head}`;
    if (this.redrawn.has(once)) return true;
    this.redrawn.add(once);
    const merge = mergeActionsOf(card)
      .map((action) => mergeEffectOf(action))
      .find((effect) => effect !== undefined && !effect.review);
    const write = async () =>
      this.crewmateCardWrite(task, {
        title: newest.title,
        body: "",
        presentationRevision: newest.revision,
        actions: [
          emittedAction({
            id: "merge",
            default: true,
            effect: {
              kind: "merge",
              after: merge?.after ?? "close",
              ...(merge?.asksFirst ? { asks_first: merge.asksFirst } : {}),
            },
          }),
        ],
        id: card.id.slice(crewmateCardId(task.id, "").length),
      });
    const running: Promise<void> = write()
      .then(() => {
        // The redraw is the app's write, not a turn's: with its author idle,
        // no close-out would bring it to the stage, so it goes there now.
        if (this.options.tasks.get(task.id)?.activity !== "running")
          this.host.cards.closeOut({ kind: "crewmate", taskId: task.id }, "idle");
      })
      .catch((caught: unknown) => {
        console.warn(`Could not redraw merge card ${card.id}:`, caught);
        failed();
      })
      .finally(() => {
        if (this.redrawing.get(task.id) === running) this.redrawing.delete(task.id);
      });
    this.redrawing.set(task.id, running);
    return true;
  }

  /** Whether the computer a task runs on can send `asks_again` (`card-asks-again.md`). */
  private takesAsksAgain(taskId: string): boolean {
    const machine = this.host.machineOf(taskId);
    return (
      machine === LOCAL_MACHINE_ID ||
      this.options.machines?.listsChange?.(machine, CARD_ASKS_AGAIN) === true
    );
  }

  /** One card as it stands, for a writer about to revise or answer it. */
  readCard(cardId: string): string {
    const read = this.host.cards.cardRead(cardId.trim());
    if (!read) return `No card "${cardId.trim()}" is on the record. Read the id again.`;
    return JSON.stringify(read, null, 2);
  }

  private addCrewmateCard(
    task: TaskRuntime,
    input: DeclaredCardInput,
    checkedHead?: string,
    presentationChecked?: { revision: number; head: string },
  ): string | Promise<string> {
    if (input.allows) allowsRefusal(input);
    const asked = mergeOf(input.actions);
    // The version a card shows: its saved story's, once the story is read
    // (the call that names a presentation comes back here with it).
    const covered =
      asked && input.presentationRevision === undefined
        ? this.coveredMergeRefusal(
            task.id,
            asked.review,
            presentationChecked?.head ?? this.options.tasks.get(task.id)?.delivery?.headSha,
          )
        : undefined;
    if (covered) throw new Error(covered);
    if (input.presentationRevision !== undefined) {
      const revision = input.presentationRevision;
      // The story is shown on the merge card of the task's own change, with
      // autonomy on or off: the app decides who clicks it (INF-2744).
      const contributing = this.contributing(task.id);
      const offer = contributing
        ? input.actions.length === 0
        : input.actions.length === 1 && mergesOwn(input.actions);
      if (!this.options.completionPresentation || !offer)
        throw new Error(
          contributing
            ? `${CONTRIBUTION_MERGE_REFUSAL} Show the published presentation as a note with no actions.`
            : "A saved-story card is only the merge card of this task's current change: one merge action and the story.",
        );
      return this.options.completionPresentation(task.id, revision).then(async (presented) => {
        const { revision: shownRevision, ...story } = presented;
        const record = this.options.tasks.get(task.id);
        try {
          // A copy of the story's risk or required actions the call repeated
          // is left out only when it is exactly the story's; one that differs
          // competes with it and is refused (INF-3060, the captain's "we
          // should not take any guesses here"). Inside the try, so the story
          // media copied for this card go with the refusal.
          const differs = [
            ...(input.riskDeclaration !== undefined &&
            !isDeepStrictEqual(input.riskDeclaration, story.riskDeclaration)
              ? ["risk (differs from the saved revision's)"]
              : []),
            ...(input.requiredActions !== undefined &&
            !isDeepStrictEqual(input.requiredActions, story.requiredActions ?? [])
              ? ["required_actions (differ from the saved revision's)"]
              : []),
          ];
          if (differs.length) throw new Error(savedStoryRefusal(differs));
          const ledger = this.options.tasks.get(task.id)?.delivery?.presentation;
          const head = ledger?.completion?.head ?? ledger?.published?.head;
          if (!head)
            throw new Error(
              "The current story has not been published or completed for this destination.",
            );
          // A part built on another part's approved version offers only a
          // version holding that part's newest approved version, as its
          // batch carries it (docs/task-graph.md, "Following the part under it").
          const behind = contributing
            ? undefined
            : await followBase(this.options.tasks, task.id, head);
          if (behind) throw new Error(`Card refused: ${behind}.`);
          const { presentationRevision: _revision, ...rest } = input;
          return await this.addCrewmateCard(
            task,
            {
              ...rest,
              ...story,
              ...(contributing
                ? {
                    body: `${record ? contributionStatusLine(record) : ""}${story.body}`,
                  }
                : {}),
            },
            undefined,
            {
              revision: shownRevision ?? revision,
              head,
            },
          );
        } catch (caught) {
          const files = cardPictureFiles(story.body, this.options.paths.crewmatesDir);
          // Only the copies minted for this card go: the body also shows
          // the live proof the task's validation record keeps, which every
          // later merge card re-reads (INF-3323).
          const minted = new Set(
            (story.pictures ?? []).flatMap((picture) => [
              picture.id,
              ...(picture.demo ? [picture.demo.id] : []),
            ]),
          );
          // A late failure after persistence must not delete a shown card's own evidence.
          const kept = cardPictureFiles(
            this.host.cards.newestForTask(task.id)?.body ?? "",
            this.options.paths.crewmatesDir,
          );
          const retained = new Set([...kept.pictures, ...kept.recordings]);
          const dir = crewmateCardPicturesDir(this.options.paths, task.id);
          await Promise.all(
            [...files.pictures, ...files.recordings].map(async (file) => {
              if (
                dirname(file) !== dir ||
                retained.has(file) ||
                !minted.has(basename(file, extname(file)))
              )
                return;
              await rm(file, { force: true }).catch((error: unknown) => {
                console.warn("Could not remove refused merge card story copy", error);
              });
            }),
          );
          throw caught;
        }
      });
    }
    const ownPresentation = this.options.tasks.get(task.id)?.delivery?.presentation;
    if (ownPresentation && mergesOwn(input.actions) && !presentationChecked) {
      // INF-961: the refusal names the way to a current story, so a crewmate
      // never takes its story as lost; a push after publication needs no new
      // one, since the host republishes it (INF-2509).
      const story = ownPresentation.revisions.at(-1);
      const newest = story?.revision;
      const local = this.host.taskDelivery(task.id) === "local-only";
      const hosted = story !== undefined && hostedPresentation(story.destination);
      throw new Error(
        `Use presentation on the merge card so it shows the current ${local ? "committed" : "published"} story, not a second account of the change. ${newest === undefined ? "" : `This task's newest story is revision ${newest}. `}${local ? "After another commit, prepare a new story with prepare_change, then show its revision as presentation; local-only work skips open_change." : hosted ? "After a push since the story was published, show the same revision as presentation: the app republishes it at the pushed version. Prepare and publish a new revision only when what the story says changed." : "After a push since the story was published, prepare a new story revision at the pushed version with prepare_change and publish it with open_change, then show the merge card with the revision prepare_change returns as presentation."}`,
      );
    }
    const before = this.options.tasks.get(task.id);
    const reviewedMerge = before?.delivery?.reviewVerdict === "pass" && mergesOwn(input.actions);
    if (!checkedHead && (input.validationDecision || reviewedMerge)) {
      // INF-994: a validation question is kept at every rigor level, and a
      // merge offered after a passed review reads the version it answers.
      if (!before) throw new Error("The task no longer exists.");
      return this.host.validationHead(before).then(async (head) => {
        const current = this.options.tasks.get(task.id);
        if (!current) throw new Error("The task closed while reading its version.");
        const binding = input.validationDecision;
        if (binding) {
          if (
            settles(input.actions) ||
            input.actions.some((action) => requestWriteEffectOf(action))
          )
            throw new Error(
              "A validation question cannot also merge or send another write; keep those separate.",
            );
          if (!input.actions.some((action) => action.id === binding.action && !action.effect))
            throw new Error(
              "The validation approval must be an ordinary decision action, not a merge or another effect.",
            );
          const requests = validationRequestsOf(binding);
          if (requests.length > 1) {
            // INF-1824: the checklist's ticks are the captain's own, so no
            // author script or field may share the frame with them.
            const permissions = current.delivery?.liveValidation?.permissions ?? [];
            if (
              new Set(requests).size !== requests.length ||
              requests.some(
                (id) => permissions.find((item) => item.request.id === id)?.request.kind !== "gap",
              )
            )
              throw new Error(
                "A checklist names distinct gap requests of one version; ask about a check approval or an effect on its own card.",
              );
            if (/<script\b/i.test(input.body) || input.body.includes(VALIDATION_GAPS_FIELD))
              throw new Error(
                "A gap checklist card carries no script and no field of its own; the app draws the checklist.",
              );
          }
          let state = current.delivery?.liveValidation;
          for (const request of requests)
            state = checkValidationTransition(
              state,
              {
                kind: "decision",
                request,
                card: input.id ?? "pending",
                action: binding.action,
              },
              {
                head,
                deviceId: current.deviceId ?? null,
                at: this.host.now(),
                decision: { offer: "pending" },
                allowances: keptYeses(
                  this.options.tasks,
                  current,
                  head,
                  this.options.knowledge?.directions,
                ),
              },
            );
        }
        if (reviewedMerge) {
          const proof = current.delivery?.liveValidation?.runs.at(-1);
          if (proof)
            await verifyKeptValidationEvidence(
              proof.evidence,
              crewmateCardPicturesDir(this.options.paths, task.id),
              task.id,
            );
        }
        this.options.tasks.delivery.recordChangeEvidence(task.id, { validationHead: head });
        return this.addCrewmateCard(task, input, head, presentationChecked);
      });
    }
    // The task's holds speak before the card's shape: a card the task
    // cannot take at all is refused for that, not for its headings.
    if (this.host.isPersonalTask(task.id) && settles(input.actions)) {
      throw new Error(
        "Card refused: this task builds in place on the personal workspace - there is no merge, land, or discard. Show what you built on a note with no actions, then report; a card with actions is only for a genuine decision the captain must make.",
      );
    }
    if (this.host.worksInPlace(task.id) && settles(input.actions)) {
      throw new Error(
        "Card refused: this task works in place in the project's folder - there is no merge, land, or discard, and a merge card is never emitted. Report what you did with report; Infinitary closes the task once what it was for is done. A card is only for a question the captain must answer.",
      );
    }
    if (deliverableOf(this.options.tasks.get(task.id)) === "operation" && settles(input.actions))
      throw new Error(
        "Card refused: an operation has no change to merge or discard. Show the verified effect on a note, then report its evidence for a finished close.",
      );
    // An answer task ships nothing (Task B), so it has no merge card
    // either: the card carrying the answer IS the deliverable, and the task
    // closes when the captain resolves it.
    if (this.isAnswerTask(task.id) && settles(input.actions)) {
      throw new Error(
        "Card refused: this task's deliverable is an answer, not a change - it commits nothing, pushes nothing, and opens no pull request, so there is nothing to merge or discard. Show the answer on this card without a merge or discard action; the captain's choice on it, or your finished report after they close it, is what closes the task.",
      );
    }
    // A merge card names one pull request (INF-2490, INF-2744): its line
    // says what follows its click. A task may have a merge card up for each
    // of its pull requests at once.
    if ((input.actions ?? []).filter((action) => mergeEffectOf(action)).length > 1)
      throw new Error(
        "Card refused: a merge card offers one merge. Put each pull request's merge on its own merge card.",
      );
    const record = this.options.tasks.get(task.id);
    if (mergesOwn(input.actions) && input.requiredActions === undefined)
      throw new CardRefusedError(
        "Card refused: declare required_actions, including [] when none. Name every action the captain must take after merging.",
        "shape",
        "required_actions is missing",
      );
    if (input.requiredActions !== undefined)
      this.options.tasks.delivery.validateRequiredActions(task.id, input.requiredActions);
    // A merge the blocks rule would refuse on the click is refused here
    // instead: only Firstmate can clear the wait, so the card would be a
    // button that cannot work. (Open children stay a click-time decision:
    // the captain can override that one.)
    if (mergeOf(input.actions)?.after === "close") {
      const waiting = this.options.tasks.graph.blockerRefusal(task.id);
      if (waiting) {
        throw new Error(
          `Card refused: this task still waits on open work, so the merge would be refused. ${waiting.text} Report under the five headings with report instead; the first mate clears the wait and tells you when to emit the merge card. ${softHoldWords("waits", "crewmate")}`,
        );
      }
    }
    // A card that asks to send a kept write asks for exactly one, and
    // nothing else that sends (FI3-1571 piece 4); the ask must be this
    // task's and never sent.
    const writes = (input.actions ?? []).flatMap((action) => requestWriteEffectOf(action) ?? []);
    if (writes.length > 0) {
      if (writes.length > 1 || settles(input.actions)) {
        throw new Error(
          "Card refused: a card that asks to send a write asks for exactly one, and carries no merge or discard.",
        );
      }
      const ask = this.writeAskOf(task.id, writes[0]?.ask ?? "");
      if (ask?.kind === "integration")
        throw new Error(
          "The app already presents integration approval cards. Wait for its answer; do not emit another card.",
        );
      if (ask?.card !== undefined)
        throw new Error(
          `Card refused: the app already shows ask ${ask.id} on its own approval card. Wait for its write-answered; do not emit another card.`,
        );
      if (!ask) {
        throw new Error(
          `Card refused: ask ${writes[0]?.ask} is not on this task. Name the id github_write or an integration's call answered with.`,
        );
      }
      if (ask.sentAt !== undefined) {
        throw new Error(
          `Card refused: ask ${ask.id} was already sent once and is ${NEVER_SENT_AGAIN}. Make a new write with github_write, or call the integration again, to ask again. ${fixedHoldWords("sent-once")}`,
        );
      }
    }
    // The merge card's BUTTONS are the host's (contract v3.6, captain
    // lock 3; audit 4.4b row 2): a crewmate declares the merge and the host
    // attaches the pair the task's posture calls for, so no agent learns
    // merge-pr from land and no prompt asks one to transcribe a label it
    // cannot see. Done before the lint, so the lint reads the card the
    // captain will actually get. So is the browser button: the crewmate
    // names its label and the host names the browser it opens.
    const {
      browserButton,
      browserHandoff,
      browserPage,
      attachment: _undeclared,
      risk: _undeclaredRisk,
      riskDeclaration,
      sinceSeen: sinceSeenGiven,
      ...declared
    } = input;
    const sinceSeen = sinceSeenGiven?.trim() || undefined;
    const handoff = this.browser.browserHandoffOf(declared.actions ?? [], browserHandoff);
    // A browser button with a page opens that page from the project
    // (docs/task-browser.md, "A page from the project"); without one it is
    // the door to the browser the task holds now.
    const attachment =
      browserPage !== undefined
        ? this.browser.pageAttachment(task.id, browserButton, browserPage, handoff !== undefined)
        : this.browser.browserAttachment(task.id, browserButton, handoff !== undefined);
    const finished = this.withCompletionActions(task.id, {
      ...declared,
      ...(attachment ? { attachment } : {}),
    });
    // The shape lint runs at the crewmate boundary too (WI-11), whichever
    // backend's tool emitted the card; a refusal is the tool's error text.
    const refusal = lintCrewmateCard(finished, {
      rigor: this.options.tasks.policiesOf(this.options.tasks.get(task.id))?.rigor.value,
      tieredStory:
        presentationChecked !== undefined &&
        ownPresentation?.revisions.find((story) => story.revision === presentationChecked.revision)
          ?.version === 2,
    });
    if (refusal) throw new CardRefusedError(`Card refused: ${refusal}`, "shape", refusal);
    // The crewmate says the saved sign-in its browser was given did not
    // sign the page in: that save keeps the mark before anything is offered
    // (docs/task-browser.md, "Signed-in sites").
    const unmarked =
      handoff?.savedFailed && !this.options.browsers?.markSavedSignInFailed?.(task.id, handoff.site)
        ? ` Your browser uses no saved sign-in for ${handoff.site}, so saved_failed marked nothing.`
        : "";
    // A saved sign-in is offered after the lint: the crewmate never learns
    // which sites are saved, so it is never counted for an action it could
    // not declare.
    const shown = handoff
      ? {
          ...finished,
          actions: this.browser.withSavedSignIn(task.id, handoff.site, finished.actions),
        }
      : finished;
    // What the click sends, drawn by the host from its own record after the
    // lint (FI3-1571): the author words why, never the call itself.
    const strip =
      (this.requestStrip(task.id, shown.actions) ?? "") +
      (input.validationDecision
        ? this.validationRequestStrip(
            task.id,
            validationRequestsOf(input.validationDecision),
            shown.actions.find((action) => action.id === input.validationDecision?.action)?.label ??
              input.validationDecision.action,
          )
        : "") +
      (input.allows
        ? allowsStrip(
            shown.actions.find((action) => action.id === input.allows?.action)?.label ??
              input.allows.action,
            input.allows.covers,
          )
        : "");
    // What changed since the captain's last merge card (INF-3715): the app
    // hands the crewmate the facts in the answer, and draws its label naming
    // the captain's last act there, with the crewmate's own summary under
    // it, first, above the story, only while a merge card the captain saw
    // at another version or story stands behind this one (INF-5035).
    const ownMerge = mergesOwn(shown.actions);
    const offered = {
      head: presentationChecked?.head ?? record?.delivery?.headSha,
      revision: presentationChecked?.revision,
      change: record ? currentChange(record.delivery, record.branch).number : undefined,
    };
    const seen = ownMerge ? seenBefore(record?.delivery, offered) : undefined;
    const summary = seen ? sinceSeenSection(sinceSeen, seen) : "";
    const card = strip || summary ? { ...shown, body: `${summary}${shown.body}${strip}` } : shown;
    // The merge card of a task that merges on its own is the app's own
    // merge (INF-2744): the app approves it as it goes up (`mergeFromCard`).
    // Its crewmate's asks-first declaration, or a hold, leaves it to the
    // captain's click instead.
    const declaredMerge = mergeOf(card.actions);
    const appMerges = declaredMerge !== undefined && this.appMergesFromCard(task.id, declaredMerge);
    // A request for the captain's help pauses the browser before the card
    // goes up (docs/task-browser.md, "Asking for help").
    // A revision of the request the captain holds the browser for redraws
    // where it docks beside the page; it pauses nothing again.
    const revisesHeld = handoff !== undefined && this.browser.holdsRequest(task.id, input.id);
    const paused =
      handoff && !revisesHeld ? this.browser.pauseForCaptain(task.id, handoff) : undefined;
    const publish = (checked: boolean, risk?: RiskAssessment) => {
      // The task may have closed while its completion checks were read.
      // A late tool result must not recreate choices retirement removed.
      const current = this.options.tasks.get(task.id);
      if (!current || TaskService.isClosed(current)) {
        throw new Error("Card refused: this task has closed.");
      }
      if (presentationChecked) {
        const ready = readyPresentation(current.delivery?.presentation);
        if (
          ready?.revision !== presentationChecked.revision ||
          ready.head !== presentationChecked.head ||
          (opensPullRequest(this.host.taskDelivery(task.id)) &&
            current.delivery?.headSha !== presentationChecked.head)
        )
          throw new Error(
            "The story or the checked code changed before the merge card could be shown. Publish the current story first.",
          );
      }
      // The model rides beside the meta line as its own chip (the
      // captain's 1C, 2026-09-28), and where the task runs as its own
      // words, never inside it.
      const id = this.host.cards.emitCrewmateCard(
        task.id,
        risk ? { ...card, risk } : card,
        task.title,
        task.session?.modelLabel() ?? task.session?.modelRef()?.id ?? "Unknown model",
        this.host.cardPlace(task.id),
        this.takesAsksAgain(task.id),
      );
      // INF-3170 piece 2: the card's marked yes, bound to the offer it was
      // shown on; a revision without one offers none.
      const allowsOffer = input.allows ? this.host.cards.get(id)?.offerId : undefined;
      this.options.tasks.delivery.offerAllowance(
        task.id,
        id,
        input.allows && allowsOffer
          ? { offer: allowsOffer, action: input.allows.action, covers: input.allows.covers.trim() }
          : undefined,
      );
      if (input.validationDecision) {
        const offered = this.host.cards.get(id);
        if (!offered?.offerId) throw new Error("The validation decision has no kept offer.");
        for (const request of validationRequestsOf(input.validationDecision))
          this.options.tasks.delivery.recordLiveValidation(
            task.id,
            {
              kind: "decision",
              request,
              card: id,
              action: input.validationDecision.action,
            },
            {
              head: current.delivery?.validationHead ?? "",
              allowances: keptYeses(
                this.options.tasks,
                this.options.tasks.get(task.id) ?? current,
                current.delivery?.validationHead,
                this.options.knowledge?.directions,
              ),
              decision: {
                offer: offered.offerId,
                ...(offered.lifecycleId ? { lifecycle: offered.lifecycleId } : {}),
              },
            },
          );
      }
      if (this.contributing(task.id) && presentationChecked && input.actions.length === 0)
        this.recordCompletionOffer(task.id, id, checked, presentationChecked, false, true);
      if (declaredMerge) {
        this.options.tasks.delivery.clearCardRefusal(task.id);
        if (!declaredMerge.review)
          this.recordCompletionOffer(
            task.id,
            id,
            checked,
            presentationChecked,
            declaredMerge.after === "continue",
          );
        // A new card for the same pull request asks again; one for another
        // pull request stands beside its approval (INF-2744, INF-2746).
        else this.host.settling.approvals.askAgain(task.id, declaredMerge.review);
        const offered = this.host.cards.get(id);
        if (card.requiredActions !== undefined && offered?.offerId)
          this.options.tasks.delivery.declareRequiredActions(task.id, {
            cardId: id,
            offerId: offered.offerId,
            head:
              (declaredMerge.review
                ? this.mergeReviewOf(task.id, declaredMerge.review)?.headSha
                : undefined) ??
              presentationChecked?.head ??
              current.delivery?.headSha,
            actions: card.requiredActions,
          });
        // The task keeps the risk of its newest merge card; one without any
        // leaves none standing.
        if (risk || current.delivery?.risk)
          this.options.tasks.delivery.recordChangeEvidence(task.id, { risk });
        // The app took the merge: the card loses its buttons, since the
        // merge is not the captain's to click, and opens with the line that
        // says so in the app's words from the setting (INF-1219); the merge
        // rewrites that line on the same card (`SettleService`). When the
        // app could not take it, the card keeps the captain's buttons, so
        // the merge is never left with no one.
        const shownCard = this.host.cards.get(id);
        if (appMerges && shownCard && this.mergeFromCard(task.id, id, declaredMerge))
          this.showMerging(task.id, shownCard);
      }
      const since =
        ownMerge || sinceSeen
          ? sinceSeenNotice({
              seen,
              head: offered.head,
              revision: offered.revision,
              lines: current.delivery?.changeLines,
              summary: sinceSeen !== undefined,
            })
          : "";
      return `${id}${revisionNotice(this.host.cards.revisionChanges(id))}${since}`;
    };
    const gate = this.pendingCiGate(task.id, card);
    const advisory =
      card.actions?.length &&
      !declaredMerge &&
      !settles(card.actions) &&
      !card.actions.some((action) => requestWriteEffectOf(action)) &&
      currentCheckStatus(record?.delivery) === "green" &&
      record?.delivery &&
      (record.delivery.changeLabel || record.delivery.prNumber !== undefined)
        ? ` No button on this card can merge ${record.delivery.changeLabel ?? `#${record.delivery.prNumber}`}. If the rest needs that merged first, list it in the story's afterMerge and emit the merge card.`
        : "";
    const pausedWords = revisesHeld
      ? " The captain has control of your browser and reads this card beside its page. Return control wakes you once."
      : handoff
        ? " Your browser is paused for the captain: your browser commands refuse until the captain takes control and returns it, which wakes you once. End your turn when nothing else needs doing; report with waiting_on_captain naming this card."
        : "";
    const placeWords = captainPlaceWords(this.options.captainPlaces?.latest(), this.host.now());
    const startLine = this.browser.startReminder(task.id, attachment);
    const answer = (text: string) =>
      `${text}${advisory}${unmarked}${pausedWords}${placeWords}${startLine}`;
    // A revision that went up while the checks run says what still holds
    // the merge, and what to do once they pass.
    const gated = (risk?: RiskAssessment) =>
      (gate as Promise<"checked" | "running">).then((reading) => {
        const shown = publish(true, risk);
        return reading === "checked" ? shown : `${shown} ${COMPLETION_REVISED_WHILE_RUNNING}`;
      });
    if (riskDeclaration) {
      return gate
        ? gated({ declared: riskDeclaration }).then(answer)
        : answer(publish(false, { declared: riskDeclaration }));
    }
    if (paused) {
      return paused.then(() => (gate ? gated() : publish(false))).then(answer);
    }
    return gate ? gated().then(answer) : answer(publish(false));
  }

  /**
   * Whether the app merges from this merge card itself (INF-2744): the one
   * merge gate lets the app through - autonomy on, no hold on the task, and
   * no asks-first declaration on the card. A review the app cannot keep -
   * one that merges past the branch rules - stays the captain's click.
   */
  private appMergesFromCard(taskId: string, merge: MergeEffect): boolean {
    const record = this.options.tasks.get(taskId);
    if (!record) return false;
    if (merge.review && this.mergeReviewOf(taskId, merge.review)?.skips) return false;
    const mode = merge.review ? "merge-pr" : this.host.mergeModeFor(taskId);
    return (
      this.host.settling.settle.mergeRefusal(record, mode, "app", merge.asksFirst, {
        review: merge.review,
      }) === undefined
    );
  }

  /**
   * The captain set a task to merge on its own while its merge cards are up
   * (INF-2744): the app merges from each, as it does from a card that goes
   * up under autonomy, and the first mate is not woken. A card the app
   * cannot take - asks first, a hold, a merge past the branch rules - stays
   * the captain's. Returns the cards it took.
   */
  mergeOpenCards(taskId: string): string[] {
    const taken: string[] = [];
    // Each card's approval stands on its own: one for another pull request
    // waits beside an approval that already stands (INF-2746).
    for (const card of this.host.cards.values()) {
      if (card.taskId !== taskId || card.author !== "crewmate") continue;
      const merge = mergeOf(card.actions);
      if (!merge || !this.appMergesFromCard(taskId, merge)) continue;
      if (!this.mergeFromCard(taskId, card.id, merge)) continue;
      this.showMerging(taskId, card);
      taken.push(card.id);
    }
    // The crewmate may already be idle, so no turn's end runs the approval.
    if (taken.length > 0)
      void this.host.settling.kept.runMergeAuthorization(taskId).catch((caught: unknown) => {
        console.warn("[crew] kept merge could not run:", caught);
      });
    return taken;
  }

  private showMerging(taskId: string, card: Card): void {
    const source = this.options.tasks.policiesOf(this.options.tasks.get(taskId))?.autonomy.source;
    this.host.cards.put({
      ...card,
      actions: [],
      body: `${pendingMergeLine(source ?? "project")}${card.body}`,
    });
  }

  /**
   * The app approves the merge on the card that just went up, as the
   * captain's click would (INF-2744): a pull request's merge keeps an
   * approval the host runs once its crewmate is idle and the checks pass;
   * a local merge waits for the crewmate's turn to end and merges. The
   * first mate is not woken for it. Returns whether the app took it.
   */
  private mergeFromCard(taskId: string, cardId: string, merge: MergeEffect): boolean {
    const shown = this.host.cards.get(cardId);
    if (!shown) return false;
    // A merge the app sends now gives the card back its buttons when it is
    // refused, so the merge is never left with no one (INF-2746).
    const mergeNow = (mode: "land" | "merge-pr") => {
      void this.host.settling.settle
        .reportCardSettle(taskId, mode, undefined, merge.proceedWithOpen, merge.after, "app")
        .then((result) => {
          if (!result.ok) this.restoreButtons(taskId, shown);
        });
      return true;
    };
    if (!merge.review && this.host.mergeModeFor(taskId) === "land") return mergeNow("land");
    const kept = this.host.settling.approvals.authorizeMerge(
      taskId,
      {
        cardId,
        ...(shown.lifecycleId ? { lifecycleId: shown.lifecycleId } : {}),
        ...(shown.offerId ? { offerId: shown.offerId } : {}),
        actionId: "merge",
      },
      merge.proceedWithOpen ?? false,
      merge.review,
      { after: merge.after, issuer: "autonomy" },
    );
    if (kept || merge.review) return kept !== undefined;
    // A change the app keeps no approval for - no project's host with
    // checks, such as a plain Git host - merges now, through the same
    // gates as the captain's click (INF-2744).
    return mergeNow("merge-pr");
  }

  /**
   * The app's merge from a card was refused: the card it took is put back
   * as it went up, with the captain's buttons, while the task is open and
   * the card still shows only the merging line.
   */
  private restoreButtons(taskId: string, shown: Card): void {
    const record = this.options.tasks.get(taskId);
    const current = this.host.cards.get(shown.id);
    if (!record || TaskService.isClosed(record) || !current || current.actions.length > 0) return;
    if (current.lifecycleId !== shown.lifecycleId) return;
    this.host.cards.put(shown);
  }

  /**
   * A merge card's offer went up (FI3-304). It replaces any standing merge
   * approval - the crewmate is asking again - and, when its checks were
   * just read green, its offer is kept with the head they read: the
   * baseline a click on exactly that offer approves. An offer that shows
   * the same content at another head is ambiguous and keeps no baseline.
   * The change it was shown for is kept apart from the baseline (INF-2490):
   * an offer that approves no head still refuses its click once another
   * change is current.
   */
  private recordCompletionOffer(
    taskId: string,
    cardId: string,
    checked: boolean,
    presentation: { revision: number; head: string } | undefined,
    continues: boolean,
    contribution = false,
  ): void {
    // A new merge card for the current change asks again; an approval of
    // another of the task's pull requests stands beside it (INF-2744).
    if (!contribution) this.host.settling.approvals.askAgain(taskId, undefined);
    const record = this.options.tasks.get(taskId);
    const offerId = this.host.cards.get(cardId)?.offerId;
    const head = presentation?.head ?? record?.delivery?.headSha;
    // The offer is for the task's current change, whoever opened it (INF-2490).
    const prNumber = record ? currentChange(record.delivery, record.branch).number : undefined;
    if (!record || !offerId || !head) return;
    const offers = record.delivery?.completionOffers ?? [];
    const same = (offer: { cardId: string; offerId: string }) =>
      offer.cardId === cardId && offer.offerId === offerId;
    const ambiguous = offers.some((offer) => same(offer) && offer.headSha !== head);
    const baseline =
      !ambiguous &&
      (checked || presentation !== undefined) &&
      (prNumber !== undefined || presentation !== undefined);
    if (!baseline && prNumber === undefined) {
      if (ambiguous)
        this.options.tasks.delivery.recordPermissionRecords(taskId, {
          completionOffers: offers.filter((offer) => !same(offer)),
        });
      return;
    }
    this.host.keepOffer(taskId, offers, {
      cardId,
      offerId,
      headSha: head,
      ...(prNumber === undefined ? {} : { shownFor: prNumber }),
      ...(baseline && prNumber !== undefined ? { prNumber } : {}),
      ...(continues ? { continues: true as const } : {}),
      ...(baseline && presentation
        ? {
            presentationRevision: presentation.revision,
            presentationContentHash: readyPresentation(record.delivery?.presentation)?.contentHash,
          }
        : {}),
      at: this.host.now(),
    });
  }

  /**
   * The completion card as the host finishes it (contract v3.6, captain lock
   * 3 of 2026-09-19 on the visual-density audit, 4.4b row 2). Until v3.5 the
   * crewmate descriptor spelled out the two buttons - their exact labels by
   * posture, the discard's `danger`, its `confirm` - and every Pi crewmate
   * dutifully transcribed facts the host already held, while the Claude
   * crewmates that never received the text got the label right 4 times in 8.
   * Now a crewmate declares the merge and nothing else: the host reads the
   * posture and writes the pair.
   *
   * `confirm` is deliberately NOT host-set. It means "the body already says
   * this branch has unlanded commits or uncommitted edits", which is a claim
   * about the body, not a fact the host holds - and setting it would discard
   * real work without the captain choosing. Left off, a discard that would
   * destroy something returns the structured `unlanded-work` refusal and its
   * ways out, which is the captain's confirmation (WI-12).
   *
   * The crewmate declares the merge without a label, as it is told
   * (FI3-249): every action the host keeps as declared needs words of its
   * own, and one without them refuses the card (`labeledActions`).
   */
  /**
   * A merge card of the pull request `review` names (the task's own change
   * when undefined) at a version the captain's standing approval already
   * covers (INF-4018), from either issuer: the approval's own words and
   * what to do instead. Such a card would only end that approval, so it is
   * refused before anything is written. Undefined when no approval covers it.
   */
  private coveredMergeRefusal(
    taskId: string,
    review: string | undefined,
    shown: string | undefined,
  ): string | undefined {
    const record = this.options.tasks.get(taskId);
    const head = review ? this.mergeReviewOf(taskId, review)?.headSha : shown;
    const kept = coveringApproval(record, head, review);
    // A pull request merged outside the app leaves nothing for the approval
    // to merge: its card closes the task out instead.
    if (!kept || (!review && record?.delivery?.ci === "merged")) return undefined;
    const reading = review ? undefined : record?.delivery;
    const failure: CoveredFailure =
      !reading || !head || reading.headSha !== head || currentCheckStatus(reading) !== "red"
        ? "none"
        : failedBatch(reading, head)
          ? "batch"
          : "checks";
    return `Card refused: ${keptApprovalLine(kept)} ${coveredNextStep(kept, failure)}`;
  }

  mergeReviewOf(taskId: string, reviewId: string): MergeReview | undefined {
    return this.options.tasks
      .get(taskId)
      ?.delivery?.mergeReviews?.find((review) => review.id === reviewId);
  }

  /** A write this task's crewmate asked to send, by the id `github_write` answered with. */
  private writeAskOf(taskId: string, askId: string): WriteAsk | undefined {
    return this.options.tasks.get(taskId)?.delivery?.writeAsks?.find((ask) => ask.id === askId);
  }

  /**
   * The host's strip for a card whose button sends something where the
   * project lives (`./requestStrips.ts`): a kept write, or a merge past the
   * branch rules. Undefined for every other card.
   */
  private requestStrip(taskId: string, actions: readonly EmittedAction[]): string | undefined {
    for (const action of actions) {
      const write = requestWriteEffectOf(action);
      const ask = write ? this.writeAskOf(taskId, write.ask) : undefined;
      if (ask) return writeAskStrip(ask);
      const merge = mergeEffectOf(action);
      const review = merge?.review ? this.mergeReviewOf(taskId, merge.review) : undefined;
      if (review?.skips) {
        return skipRulesStrip(
          review,
          forgePlace({ kind: "github", host: review.host }) ?? "GitHub",
        );
      }
    }
    return undefined;
  }

  /** Whether the task's change joins the person's own batch (docs/forge.md, "Batches of your own"). */
  private inOwnBatch(taskId: string): boolean {
    const record = this.options.tasks.get(taskId);
    return mergesInOwnBatch(
      record,
      record?.repoId ? this.options.repos.get(record.repoId) : undefined,
    );
  }

  private contributing(taskId: string): boolean {
    const record = this.options.tasks.get(taskId);
    return taskContributesUpstream(
      record,
      record?.repoId ? this.options.repos.get(record.repoId) : undefined,
    );
  }

  private withCompletionActions(taskId: string, input: DeclaredCardInput): EmittedCardInput {
    const actions = input.actions ?? [];
    if (actions.some((action) => requestWriteEffectOf(action))) {
      // The host names the send, after where it goes (FI3-1571 piece 4), or
      // Submit feedback for a /feedback report; the crewmate's own Not now
      // stays beside it.
      const labeled = actions.map((action) => {
        const effect = requestWriteEffectOf(action);
        if (!effect) return action;
        const ask = this.writeAskOf(taskId, effect.ask);
        return {
          ...action,
          id: action.id || "send",
          label:
            ask?.kind !== "integration" &&
            ask?.kind !== "web" &&
            ask?.kind !== "build" &&
            ask?.feedback
              ? submitFeedbackWords()
              : sendWriteWords(ask?.place ?? "GitHub"),
          default: true,
          effect,
        };
      });
      return { ...input, actions: labeledActions(labeled) };
    }
    const declaredMerge = mergeOf(actions);
    if (!declaredMerge) return { ...input, actions: labeledActions(actions) };
    if (this.contributing(taskId))
      throw new Error(
        "This contribution waits for the project's maintainers. Show its published presentation as a note with no actions; never offer a merge or mark their queue.",
      );
    // Only the merge card's own buttons are the host's (INF-2744): the
    // merge, Discard beside a merge that closes the task and drops its own
    // working copy, Not now beside any other, and Review carefully below
    // Careful. A card still carries the other actions its author declared
    // (cards/tasks/agents P0): a question it wants answered with the merge
    // is its offer to make and comes back to it on the click.
    const declared = labeledActions(
      actions.filter((action) => !mergeEffectOf(action) && !settleEffectOf(action)),
    );
    const review = declaredMerge.review
      ? this.mergeReviewOf(taskId, declaredMerge.review)
      : undefined;
    const merge: EmittedAction = {
      id: "merge",
      label: review?.skips
        ? SKIP_RULES_MERGE_WORDS
        : declaredMerge.review
          ? MERGE_WORDS["merge-pr"]
          : mergeWordsFor(this.host.taskDelivery(taskId), this.inOwnBatch(taskId)),
      default: true,
      effect: declaredMerge,
    };
    const closesOwnCopy =
      declaredMerge.after === "close" &&
      !declaredMerge.review &&
      Boolean(this.options.tasks.get(taskId)?.worktreeDir);
    const beside: EmittedAction[] = closesOwnCopy
      ? [
          {
            id: "discard",
            label: "Discard",
            danger: true,
            effect: { kind: "settle", mode: "discard" },
          },
        ]
      : declared.some((action) => action.id === MERGE_NOT_NOW_ID)
        ? []
        : [{ id: MERGE_NOT_NOW_ID, label: MERGE_NOT_NOW_WORDS }];
    // A Quick or Default pull request can be made Careful from its merge
    // card (INF-562): drawn between Discard and Merge, so it takes ⌘2.
    const careful: EmittedAction[] = this.offersCareful(taskId)
      ? [{ id: "review-carefully", label: REVIEW_CAREFULLY_WORDS, care: "reviewed" }]
      : [];
    return { ...input, actions: [...declared, merge, ...beside, ...careful] };
  }

  /**
   * Whether a task's merge card offers Review carefully: pull-request work
   * the captain merges himself, below Careful. Local merges, work that
   * merges on its own and a Careful task get no button.
   */
  private offersCareful(taskId: string): boolean {
    if (this.host.mergeModeFor(taskId) !== "merge-pr") return false;
    const policies = this.options.tasks.policiesOf(this.options.tasks.get(taskId));
    return policies !== null && !policies.autonomy.value && policies.rigor.value !== "reviewed";
  }

  /**
   * Whether a task's own crewmate is still the one that emits its completion
   * card (contract v3.6, captain lock 3; audit 4.4b row 9). True while the
   * work is active on a posture that settles at all and no completion card
   * has been emitted on it yet - which is exactly the window in which a
   * Firstmate merge card would duplicate the one the crewmate is about to
   * write. Once that card exists the window closes: a settle refusal's ways
   * out are then a legitimate Firstmate card on the same task.
   */
  crewmateOwesCompletion(taskId: string): boolean {
    const record = this.options.tasks.get(taskId);
    if (record?.status !== "active" || record.kind !== "work") return false;
    if (record.shape?.kind === "review" || this.host.isPersonalTask(taskId)) return false;
    if (record.shape?.in_place) return false;
    // An answer task emits no completion card at all (Task B): it ships
    // nothing, so nobody owes one.
    if (deliverableOf(record) !== "change") return false;
    return !this.host.cards.hasCompletionCard(taskId);
  }

  /**
   * Read the offered change before binding the card to its exact version.
   * The offer itself is the crew's judgment; only actual check facts hold
   * its merge, and the captain still gives separate consent at the click.
   */
  private pendingCiGate(
    taskId: string,
    input: EmittedCardInput,
  ): Promise<"checked" | "running"> | undefined {
    const requested = mergeOf(input.actions);
    if (requested?.review) {
      if (!this.options.reviewGate) return undefined;
      const reviewId = requested.review;
      return this.options.reviewGate(taskId, reviewId).then((refusal) => {
        if (refusal) throw new CardRefusedError(refusal, "checks", refusal);
        return "checked" as const;
      });
    }
    if (!requested || !opensPullRequest(this.host.taskDelivery(taskId))) return undefined;
    if (!this.options.checkCi) return undefined;
    return this.options.checkCi(taskId).then((result) => {
      const read =
        typeof result === "string"
          ? { overall: result, recorded: true, problem: undefined }
          : result;
      if (!read.recorded || read.overall === "no-pr") {
        const why =
          read.problem ??
          (read.overall === "no-pr"
            ? "no open pull request was found for its branch"
            : "the proposed change could not be read");
        throw new CardRefusedError(
          `Card refused: ${why}. Read the proposed change before offering its exact version.${this.waitingReplyNote(taskId)}`,
          "checks",
          why,
        );
      }
      // A pull request merged outside the app has nothing left to check:
      // the captain's click closes the task as merged (FI3-213).
      if (read.overall === "green" || read.overall === "merged") return "checked" as const;
      // The captain's override on the checks lets the card go up at the
      // version it covers; the merge reads the same record.
      const delivery = this.options.tasks.get(taskId)?.delivery;
      if (
        overridePasses(
          delivery,
          "checks",
          delivery?.headSha,
          delivery?.prNumber === undefined ? undefined : (delivery.prUrl ?? null),
        )
      )
        return "checked" as const;
      // The checks hold a new merge card until the pull request's own checks
      // pass (INF-1891, the captain: "the app turns the merge card down
      // until the pull request's own checks pass"). A revision of the card
      // already up goes up while they run (INF-834 friction 4): its words
      // are the captain's to read now, and its merge waits on its own.
      if (read.overall === "pending" && this.host.cards.openCompletionCard(taskId, input.id))
        return "running" as const;
      // Failed checks let the card up with Merge anyway beside the merge in
      // two cases: every failed check carries the crewmate's diagnosis
      // (INF-1891, as stable 0.6.1 did), or the default branch's newest run
      // of every failed check failed too (INF-1915 fix 1), which the strip
      // states from that fact, so the crewmate spends no rerun and asks for
      // no reopening and the captain decides on the card: merge now, or
      // wait for main's fix, which the app watches. The offer is still the
      // crew's judgment (INF-1555 F12): the facts stay on the card and hold
      // the merge at the click, never a second readiness declaration.
      if (
        read.overall === "red" &&
        delivery &&
        (everyFailureOnMain(delivery) || everyFailureDiagnosed(delivery))
      )
        return "checked" as const;
      const reading = delivery?.checks;
      const current = reading !== undefined && reading.headSha === delivery?.headSha;
      // Checks a person must start, with nothing else running (INF-4552):
      // held, worded as waiting, with no promise of a wake.
      const waiting =
        read.overall === "pending" && !read.problem && current && !checksStillRunning(reading)
          ? checksWaitingToStart(reading.items)
          : [];
      const state =
        read.overall === "pending" && read.problem
          ? `${CHECK_WORDS.pending} (${read.problem})`
          : waiting.length > 0
            ? CHECK_WAITING_TO_START_WORDS
            : CHECK_WORDS[read.overall];
      // An empty reading with no declaration is pending, never no checks
      // (INF-1955), and so is one where every check skipped (INF-3915) or is
      // advisory: the refusal names the declaration that registers them
      // absent, so a project that runs no checks is not held for a wake
      // that never comes.
      // A failed batch check gets no Merge anyway (INF-3208): no checks
      // override passes a batch.
      const batch =
        read.overall === "red" &&
        delivery?.headSha !== undefined &&
        this.host.taskDelivery(taskId) === "queue-pr" &&
        failedBatch(delivery, delivery.headSha) !== undefined;
      const empty =
        read.overall === "pending" &&
        current &&
        noCheckRan(reading.items) &&
        !reading.absenceDeclared &&
        !reading.problem;
      throw new CardRefusedError(
        `Card refused: the checks read ${state}, not passed; a merge decision must wait. Read them again with check_change, fix or wait, and emit the merge card again once they pass.${read.overall === "red" ? " If they still fail after you tried, it goes up once every failed check at this version carries your diagnosis (check_change diagnosis), and the app offers Merge anyway on it; when main's newest run of every failed check failed too, the reading says so and the card goes up at once stating that fact, so spend no rerun on it." : ""}${batch ? " The failed batch check is the batch's: no checks override passes a batch, so it gets no Merge anyway; fix the cause in a new version, which joins the project's next batch once approved." : ""}${empty ? " No check that holds the merge has run at this version: if this pull request has no checks that run, declare that with check_change absentChecks (its version, the evidence and the local gate run at it), and the reading then says no checks; a reading that is empty, or holds only skipped or advisory checks, alone stays pending." : ""}${waiting.length > 0 ? ` ${manualHoldWords(waiting)}` : ""}${this.waitingReplyNote(taskId)} ${softHoldWords("checks", "crewmate")}`,
        "checks",
        `its checks read ${state}, not passed`,
        // Only checks still running send the wake the refusal promises: the
        // check watch waits on nothing else (`checksStillRunning`).
        read.overall === "pending" &&
          !empty &&
          !read.problem &&
          (!current || checksStillRunning(reading)),
      );
    });
  }

  /**
   * The checks hold a completion card back while the captain's reply under
   * one of the task's cards still waits for its author (FI3-643): the
   * refusal asks for the thread answer now, so his reply is not left
   * silent until they pass. The card itself waits for them.
   */
  private waitingReplyNote(taskId: string): string {
    return this.host.cards.threadAwaitingAuthor(taskId)
      ? " The captain's reply in your card's thread is still unanswered: answer it now with reply, in one line saying what you did and who goes next, naming their message in answers_message, and update the card once the proposed change can be read."
      : "";
  }

  /**
   * The card tool refused this task's completion card (FI3-401). The
   * refusal stands on the record until a completion card goes up, and the
   * report wake and `crew_status` carry it, so a report that says the card
   * went up is read beside the fact that it did not. A task that has no
   * completion card - the personal workspace, an answer task - or one
   * already closed records nothing: its refusal already says so.
   */
  recordCardRefusal(task: TaskRuntime, refusal: Omit<CardRefusal, "at">): void {
    const record = this.options.tasks.get(task.id);
    if (!record || TaskService.isClosed(record)) return;
    if (this.host.isPersonalTask(task.id) || deliverableOf(record) !== "change") return;
    if (record.shape?.in_place) return;
    this.options.tasks.delivery.recordCardRefusal(task.id, refusal);
  }

  private validationRequestStrip(
    taskId: string,
    requestIds: string[],
    approvalLabel: string,
  ): string {
    const permissions = requestIds.map((requestId) => {
      const permission = this.options.tasks
        .get(taskId)
        ?.delivery?.liveValidation?.permissions.find((item) => item.request.id === requestId);
      if (!permission) throw new Error("That validation request is not on this task.");
      return permission;
    });
    const permission = permissions[0] as ValidationPermission;
    const request = permission.request;
    const lasting =
      "This version and every later one, until that check runs and fails or leaves the list of checks. It records no live pass and merges nothing.";
    const gapDetails = (gap: ValidationPermission) => {
      if (gap.request.kind !== "gap") return "";
      const list = (items: string[]) =>
        `<ul>${items.map((item) => `<li>${escapeCardText(item)}</li>`).join("")}</ul>`;
      return [
        "<details><summary>The recorded gap</summary><dl>",
        `<dt>Version</dt><dd class="inf-mono">${escapeCardText(gap.request.head.slice(0, 7))}</dd>`,
        `<dt>Missing</dt><dd>${escapeCardText(gap.request.missingCapability)}</dd>`,
        `<dt>Why it cannot run</dt><dd>${escapeCardText(gap.request.reason)}</dd>`,
        `<dt>Tried instead</dt><dd>${list(gap.request.alternatives.map((item) => `${item.attempted}: ${item.result}`))}</dd>`,
        `<dt>Ways to close it</dt><dd>${list(gap.request.remedies)}</dd>`,
        "</dl></details>",
      ].join("");
    };
    if (permissions.length > 1) {
      // INF-1824: one checklist for a version's gaps. Rows start unticked;
      // the click accepts exactly the ticked rows and keeps the rest held.
      // Its rows are one required question (INF-4497 finding 3), so the
      // card holds its main button until a row is ticked.
      return [
        '<section class="inf-call inf-call-gap" data-inf-call="gap">',
        `<fieldset data-inf-options-only><legend>${escapeCardText(approvalLabel)} lets the ticked checks go ahead without live proof and keeps the rest held</legend>`,
        '<label><input type="checkbox" data-inf-check-all> Check all</label>',
        ...permissions.map(
          (gap) =>
            `<div><label><input type="checkbox" name="${VALIDATION_GAPS_FIELD}" value="${escapeCardText(gap.request.id)}" required> ${escapeCardText(gap.scenario.action)}</label>${gapDetails(gap)}</div>`,
        ),
        "</fieldset>",
        `<p class="inf-muted">${lasting}</p>`,
        `<script>(function(){var all=document.querySelector("[data-inf-check-all]");var rows=Array.prototype.slice.call(document.querySelectorAll('input[name="${VALIDATION_GAPS_FIELD}"]'));all.addEventListener("change",function(){var on=all.checked;rows.forEach(function(row){row.checked=on;});rows.forEach(function(row){row.dispatchEvent(new Event("change",{bubbles:true}));});});rows.forEach(function(row){row.addEventListener("change",function(){all.checked=rows.every(function(r){return r.checked;});});});})();</script>`,
        "</section>",
      ].join("");
    }
    if (request.kind === "gap") {
      return [
        '<section class="inf-call inf-call-gap" data-inf-call="gap">',
        `<div class="inf-call-k">${escapeCardText(approvalLabel)} lets this go ahead without live proof of</div>`,
        `<div class="inf-call-line" data-inf-call-line>${escapeCardText(permission.scenario.action)}</div>`,
        `<p class="inf-muted">${lasting}</p>`,
        gapDetails(permission),
        "</section>",
      ].join("");
    }
    if (request.kind === "check") {
      // INF-1824: the approval is kept on the check by its id, for the
      // resources and cost per run the check declares.
      const entries: [string, string][] = [
        ["Check", permission.scenario.action],
        ["What it uses", permission.scenario.resources ?? ""],
        ["Cost of one run", permission.scenario.cost ?? ""],
      ];
      return `<section class="inf-panel"><h3>Check approval</h3><dl>${entries.map(([name, value]) => `<dt>${escapeCardText(name)}</dt><dd>${escapeCardText(value)}</dd>`).join("")}</dl><p>${escapeCardText(approvalLabel)} covers every later run of this check in this task, after fixes and on later versions, while each run uses only these and costs no more than this. It grants no merge permission.</p></section>`;
    }
    const entries: [string, string][] = [
      ["Version", request.head.slice(0, 7)],
      ["Scenario", permission.scenario.action],
    ];
    entries.push(
      ["Action", request.action],
      ["Destination", request.destination],
      ["Who can see it", request.audience],
      ["Purpose", request.purpose],
      ["Lasting effects", request.lastingEffects],
      ["Cleanup", request.cleanup],
      ["Access", request.access],
    );
    const exact = request.forgeWrite
      ? `<details><summary>Exact request</summary><pre>${escapeCardText(`${request.forgeWrite.host} ${request.forgeWrite.method} ${request.forgeWrite.path}\nBody SHA-256: ${request.forgeWrite.bodyDigest ?? "No body"}`)}</pre></details>`
      : "";
    return `<section class="inf-panel"><h3>Validation action</h3><dl>${entries.map(([name, value]) => `<dt>${escapeCardText(name)}</dt><dd>${escapeCardText(value)}</dd>`).join("")}</dl>${exact}<p>This choice grants no merge permission and covers only this action.</p></section>`;
  }

  private isAnswerTask(taskId: string): boolean {
    return deliverableOf(this.options.tasks.get(taskId)) === "answer";
  }
}

function validationRequestsOf(binding: { request: string; gaps?: string[] }): string[] {
  return [binding.request, ...(binding.gaps ?? [])];
}

/** A contribution refused before it reached the card's writer, in its typed shape. */
function cardRefusedMutation(
  cards: CardService,
  caller: CardCaller,
  cardId: string,
  refusal: string,
): CardMutation {
  const read = cards.cardRead(cardId);
  return {
    effect: "refused",
    cardId,
    ...(read?.title ? { title: read.title } : {}),
    ...(read?.lifecycle ? { lifecycleId: read.lifecycle } : {}),
    ...(read?.revision ? { revision: read.revision } : {}),
    contributor: cards.contributorOf(caller),
    display: "available",
    refusal,
  };
}

/**
 * A crewmate's marked yes (`allows`, INF-3170 piece 2) names one ordinary
 * action of the card - no effect, and not the validation approval, whose
 * click the app keeps on its own (a check's yes among the captain's other
 * yeses, INF-4446) - and says what the yes covers.
 */
function allowsRefusal(input: DeclaredCardInput): void {
  const allows = input.allows;
  if (!allows) return;
  const action = input.actions.find((entry) => entry.id === allows.action);
  if (!action || action.effect)
    throw new Error(
      `Card refused: allows names "${allows.action}", which is not an ordinary action of this card. Name the action whose click is the captain's yes, one with no effect.`,
    );
  if (input.validationDecision?.action === allows.action)
    throw new Error(
      "Card refused: allows and validation_request name the same action. The app keeps that approval itself, a check's as the captain's yes; mark a different yes, or leave allows out.",
    );
  if (!allows.covers.trim())
    throw new Error(
      "Card refused: allows needs covers, saying what the captain's yes allows, as the card asks it.",
    );
}

/** What the captain's yes on the marked action is kept as, drawn by the host after the lint. */
function allowsStrip(label: string, covers: string): string {
  return [
    '<section class="inf-call" data-inf-call="allows">',
    `<div class="inf-call-k">${escapeCardText(label)} is kept as your yes to</div>`,
    `<div class="inf-call-line" data-inf-call-line>${escapeCardText(covers.trim())}</div>`,
    '<p class="inf-muted">It holds for the rest of this task, its review, a retry on a stronger model and any task that takes over its work. Tell the first mate to take it back.</p>',
    "</section>",
  ].join("");
}

/**
 * Where the captain was at their latest input, in emit_card's answer
 * (docs/devices.md, "Where the captain is"), so a card that needs them at
 * a named computer can say which one they are using now; nothing with one
 * computer or before any input.
 */
export function captainPlaceWords(place: CaptainPlace | undefined, now: number): string {
  if (!place) return "";
  const minutes = Math.max(0, Math.round((now - place.at) / 60_000));
  const ago =
    minutes === 0
      ? "less than a minute ago"
      : minutes === 1
        ? "1 minute ago"
        : `${minutes} minutes ago`;
  return ` The captain's latest click or words came from their window on ${place.words}, ${ago}.`;
}
