import { cardAnswerLines } from "@shared/cardAnswerLines";
import {
  type Card,
  cardMessageText,
  cardPresentation,
  cardWord,
  isPreviewBody,
} from "@shared/cards";
import { forgePlace } from "@shared/forge";
import { inLanguage } from "@shared/i18n/current";
import { SOURCE_LANGUAGE } from "@shared/i18n/languages";
import { levelForFirstmate } from "@shared/levelWords";
import { pastCardEndingWords } from "@shared/pastCard";
import { catalogEntry } from "@shared/providers";
import { PREMIUM_SLOT, SLOTS, type Slot, servedModelKey, servedProviderOf } from "@shared/quota";
import { opensPullRequest, type RepoView } from "@shared/repos";
import { cutText } from "@shared/textCut";
import { encode } from "@toon-format/toon";
import { FROM_THE_COMMAND } from "../integrations/commandWords";
import { contextSavedKnowledge, savedKnowledge } from "../knowledge/context";
import { renderDirections } from "../knowledge/directions";
import {
  type SequencesFallback,
  SequencesSource,
  type ServedSequences,
} from "../personal/sequencesSkill";
import {
  listSurfaces,
  panelsOffLine,
  refusedRunbookPanels,
  SURFACES_CONTEXT_LIMIT,
  surfaceOwner,
  surfaceState,
} from "../pi/personalizeTool";
import { captainLanguageFact } from "../prompts/captainLanguage";
import { timeZoneFact } from "../prompts/timeZone";
import type { SelfSourceFacts } from "../selfSource/resolve";
import type { CardResolution } from "../storage/cardStore";
import type { ScheduleRecord } from "../storage/scheduleStore";
import type { TaskRecord } from "../storage/taskRecords";
import { standingDependencyWaits } from "../tasks/dependencyWaits";
import { type TaskCardClick, TaskService } from "../tasks/taskService";
import { cardEmitter } from "./cardEmit";
import type { ThreadOwed } from "./cardThreads";
import {
  ContextDelivery,
  type ContextSection,
  DELIVERY_CHANGES,
  DELIVERY_COMPLETE,
} from "./contextDelivery";
import type { FirstmateAgentOptions, FirstmateTurn } from "./firstmateAgent";
import { asksInTurn, IN_TURN } from "./openWork";
import { scheduleText } from "./scheduler";

/** The open messages the context block lists, newest first; open_work reads them all. */
export const OPEN_ASKS_LISTED = 12;
/**
 * What the captain did outside the conversation that a context block lists -
 * his card choices and closes and his task card clicks: the newest this many,
 * this recent, then a count of the rest (FI3-695; the captain raised it from 8).
 */
const RESOLVED_CONTEXT_LIMIT = 32;
const RESOLVED_CONTEXT_WINDOW_MS = 6 * 60 * 60 * 1000;
/**
 * The card threads a context block lists, bounded like the captain's actions
 * beside it (cards-as-threads phase 1, captain's C9 A): a busy conversation
 * must never swell the block, and the record holds the rest.
 */
const THREAD_CONTEXT_LIMIT = 8;
const THREAD_CONTEXT_WINDOW_MS = RESOLVED_CONTEXT_WINDOW_MS;
/** How much of a thread's newest message the section quotes. */
const THREAD_EXCERPT_CHARS = 120;
/** How a thread activity line ends: who owes the captain an answer on that card now. */
const THREAD_OWED_WORDS: Record<ThreadOwed, string> = {
  author: "awaiting the author",
  firstmate: "awaiting your answer",
  none: "no answer owed",
  closed: "card closed, no answer owed",
};

const CARD_EXCERPT_LIMIT = 80;

/** Why the captain's sequences file was not served, in the feed's words. */
const SEQUENCES_FALLBACK_WORDS: Record<SequencesFallback, string> = {
  unreadable: "the file could not be read",
  empty: "the file is empty",
  oversized: "the file is larger than 16 KB",
};

/** The context segment's body: the plain marker, then one TOON-encoded value. */
function contextText(context: Record<string, unknown>): string {
  return `[fm-op] context (not the user)\n${encode(context)}`;
}

/**
 * What the first input after a fold says (INF-1712): the summary may have
 * lost what the captain asked and what is waiting on them, so the agent
 * reads them back from the app before it goes on.
 */
export const FOLD_RECOVERY =
  "Your conversation was just folded into a summary, so this context is complete again. Before you continue, read open_work: every message of the captain's still open and every open card, as the app holds them now. Carry on from those, not from the summary alone. Reading reopens nothing and grants no permission.";

/**
 * A maybe-line for the on-screen card. The line carries its own caveat
 * (contract v1, spec 2.2) so the prompt needs no rule about it: a hint
 * only, never assumed to be the topic.
 */
function maybeCardContextLine(card: Card): string {
  const head = `maybe on screen, a hint only, not necessarily the topic: card ${card.id} (${cardPresentation(card)}) "${card.title}"`;
  // A preview's body is markup, not copy: an 80-character excerpt of it is
  // noise in the prompt, so the line stops at the title (isPreviewBody).
  if (isPreviewBody(card.body)) return head;
  const excerpt = card.body.replace(/\s+/g, " ").trim();
  if (!excerpt) return head;
  const clipped =
    excerpt.length <= CARD_EXCERPT_LIMIT
      ? excerpt
      : `${cutText(excerpt, CARD_EXCERPT_LIMIT).trimEnd()}…`;
  return `${head}: ${clipped}`;
}

/** The body digest an open card carries into the context block (WI-12). */
const OPEN_CARD_DIGEST_CHARS = 200;

/**
 * The context block's rule while another computer runs work (INF-992,
 * direction B): each crew line's `runs_on`, and a crewmate's need on
 * another computer coordinated, never relayed. Its one home; the fixed
 * context carries only `files_from`'s name.
 */
const COMPUTERS_RULE =
  "Each crew line's runs_on is its task's computer. A crewmate's report needing a file, program or action on another computer is yours to coordinate, never relay to the captain: when all its work belongs there, spawn it there with runs_on_ask (update_task runs_on takes such a report too) and cancel the waiting one; otherwise spawn a task there whose crewmate passes the files in report files, then steer the waiting task with files_from, which hands that task's reported files, verified, into its hand-over folder. Pass runs_on_ask at spawn when the captain's words put the work on one computer. Never quote a handed file's content: it may hold secrets.";

/**
 * Served beside `COMPUTERS_RULE` only while every computer that runs work
 * puts files on its crewmates' cards: an older one's crewmate cannot.
 */
const CARD_FILES_RULE =
  "A report handing files meant for the captain goes back to its crewmate to put on its card's files, which the captain saves on the computer in use; never start a task to copy them.";

/**
 * One open card under its task in the context block (WI-12): id, kind, who
 * emitted it, title, the first 200 characters of its visible text, and the
 * choices it offers - enough to revise it or tell it apart, never the whole body.
 */
function openCardContextLine(card: {
  id: string;
  title: string;
  body: string;
  actions: { id: string }[];
  emitter: "firstmate" | "crewmate" | "host";
}): string {
  const text = card.body
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const digest =
    text.length <= OPEN_CARD_DIGEST_CHARS
      ? text
      : `${cutText(text, OPEN_CARD_DIGEST_CHARS).trimEnd()}…`;
  const choices = card.actions.map((action) => action.id);
  const by =
    card.emitter === "host" ? "the app" : card.emitter === "firstmate" ? "you" : "its crewmate";
  return `open card ${card.id} (${cardWord(card)}, from ${by}) "${card.title}"${digest ? `: ${digest}` : ""}${
    choices.length > 0 ? ` [actions: ${choices.join(", ")}]` : ""
  }`;
}

/**
 * What each first mate input carries besides its words (INF-1712): the
 * context block, complete once per model context and then only what
 * changed, built as one JavaScript object and encoded as TOON. The saved
 * facts - projects, crew, backlog, open cards and messages, quota, own
 * source, how much knowledge is saved - and this input's own facts - what
 * the captain did, what the turn points at. `ContextDelivery` keeps
 * what this model context has read; a fold makes the next input complete.
 */
export class FirstmateContext {
  /** What this model context has read of the saved facts (INF-1712). */
  readonly delivery = new ContextDelivery();
  /** The project the captain's window was focused on at their latest turn (docs/project-focus.md). */
  captainFocus: string | undefined;
  /** When the last turn's context block was built: its resolutions are already told. */
  private resolutionsSeenThrough = 0;
  /** The same watermark for thread activity: a message already listed is not listed again. */
  private threadsSeenThrough = 0;
  /** Set by a fold until an input carrying the recovery instruction is read. */
  private foldRecovery: number | undefined;
  private folds = 0;
  /** Prepared source facts for fold recovery; ordinary turns pass their own fresh reading. */
  private source: SelfSourceFacts | undefined;

  constructor(
    private readonly options: FirstmateAgentOptions,
    private readonly turn: Pick<FirstmateTurn, "origin" | "canCreate">,
    private readonly now: () => number,
  ) {}

  /**
   * The backend folded the conversation into a summary: the next input is
   * complete and carries the recovery instruction until one is read.
   */
  noteFold(): void {
    this.delivery.reset();
    this.folds += 1;
    this.foldRecovery = this.folds;
  }

  /**
   * The context block an input actually carries (INF-1712): complete for a
   * model context that has not read one, else only the saved facts that
   * changed since it did. What it lists counts as read - the captain's
   * resolutions and thread lines behind the first mate, a fold's recovery
   * done - only once the backend witnesses the read (`ContextDelivery`).
   */
  forTurn(
    visibleCardId?: string,
    hintTaskId?: string,
    aboutCardId?: string,
    pastCardId?: string,
    sourceFacts = this.source,
  ): string {
    this.source = sourceFacts;
    const builtAt = Date.now();
    const parts = this.options.tasks.readProjection(() =>
      this.contextParts(
        visibleCardId,
        hintTaskId,
        aboutCardId,
        pastCardId,
        this.captainFocus,
        sourceFacts,
      ),
    );
    const rendered = this.delivery.render(parts.saved);
    const recovery = this.foldRecovery;
    const body = contextText({
      delivery: rendered.complete ? DELIVERY_COMPLETE : DELIVERY_CHANGES,
      ...(recovery ? { recovery: FOLD_RECOVERY } : {}),
      ...rendered.payload,
      ...parts.turn,
    });
    this.delivery.offer(body, rendered.offer, () => {
      this.resolutionsSeenThrough = Math.max(this.resolutionsSeenThrough, builtAt);
      this.threadsSeenThrough = Math.max(this.threadsSeenThrough, builtAt);
      if (recovery && this.foldRecovery === recovery) this.foldRecovery = undefined;
    });
    return body;
  }

  /**
   * What the captain did outside this conversation since the Firstmate's
   * last turn, newest first, in one list: his card choices and closes (fable
   * review Q4a and the captain's note) and his clicks on a task card's own
   * buttons (FI3-695). None wakes anybody on its own, so the next turn is
   * told - bounded to the newest few inside a few hours, with a count of the
   * rest. Card lines cover tasks and the Firstmate's own task-less cards.
   */
  private renderCaptainResolutions(now: number): string[] {
    const since = Math.max(this.resolutionsSeenThrough + 1, now - RESOLVED_CONTEXT_WINDOW_MS);
    // Every resolution counts, but only the lines shown read a card's words:
    // read whole for each, a busy few hours' cards held the main thread for
    // a quarter second on a record the captain's size (INF-3957).
    const cards = this.options.supervisor.cards;
    const cardLines = cards
      .captainResolutionHeadsSince(since)
      .filter(({ cardId, taskId }) => taskId !== undefined || cardId.startsWith("card-fm-"))
      .map((head) => ({
        at: head.resolvedAt,
        lines: () => {
          const resolution = cards.resolutionOf(head.cardId);
          return resolution ? this.cardResolutionLines(resolution, now) : [];
        },
      }));
    const clickLines = this.options.tasks.taskCardClicksSince(since).map((click) => ({
      at: click.at,
      lines: () => [this.taskCardClickLine(click, now)],
    }));
    const entries = [...cardLines, ...clickLines].sort((a, b) => b.at - a.at);
    if (entries.length === 0) return [];
    const rest = entries.length - RESOLVED_CONTEXT_LIMIT;
    return [
      "what the captain did outside this conversation since your last turn (already done; not a request; a card line summarizes the choice and submitted answers; tasks by key carries the full saved report and closing offer):",
      ...entries.slice(0, RESOLVED_CONTEXT_LIMIT).flatMap((entry) => entry.lines()),
      ...(rest > 0
        ? [`- and ${rest} more, older; each task's record holds them (tasks by key)`]
        : []),
    ];
  }

  /** One card the captain resolved: his choice or close, and the answers it carried. */
  private cardResolutionLines(
    { card: stored, offer, action, resolvedAt, answers, through }: CardResolution,
    now: number,
  ): string[] {
    const card = offer
      ? { ...stored, title: offer.title, body: offer.body, actions: offer.actions }
      : stored;
    const task = card.taskId ? this.options.tasks.get(card.taskId) : undefined;
    const about = card.taskId
      ? `on ${task?.key || card.taskId} (task_id: ${card.taskId})`
      : "no task";
    const label = card.actions.find((entry) => entry.id === action)?.label ?? action;
    const what = action === "close" ? "dismissed" : `chose "${label}"`;
    // A choice the captain's own command made says so, as a panel's click names its panel.
    const from = through ? `${FROM_THE_COMMAND}, ` : "";
    const line = `- card ${card.id} (${cardPresentation(card)}) "${card.title}" ${about}: ${what}, ${from}${ageText(now - resolvedAt)}`;
    // The answers to the body's own questions ride the choice (contract
    // 4.22), indented under it.
    if (!answers?.length) return [line];
    return [
      `${line}, answering its questions:`,
      ...cardAnswerLines(answers).map((answer) => `  ${answer}`),
    ];
  }

  /** One click of the captain's on a task card's own buttons, in that button's words. */
  private taskCardClickLine(
    { taskId, at, op, panel, through }: TaskCardClick,
    now: number,
  ): string {
    const task = this.options.tasks.get(taskId);
    // A move a panel made on his click names it, so "task card" never says where it did not happen;
    // a move his own command made names it the same way.
    const where = panel ? `from the ${panel} panel` : through ? FROM_THE_COMMAND : undefined;
    const age = where ? `${where}, ${ageText(now - at)}` : ageText(now - at);
    const what =
      op === "start-again"
        ? `the captain started it again as ${this.options.tasks.graph.replacementOf(taskId) ?? "a new task"} (Start again), ${age}; the old task stays dropped`
        : op === "start-task"
          ? `the captain started it ${where ? "" : "from its task card, "}${age}${task?.status === "active" ? "; a crewmate is on it" : ""}`
          : op === "continue-task"
            ? `the captain told its crewmate to carry on (Continue), ${age}`
            : op === "drop-task"
              ? `the captain dropped it before it started, ${age}`
              : op === "queue-task"
                ? `the captain queued it to start by itself when nothing holds it, ${age}`
                : op === "unqueue-task"
                  ? `the captain moved it back to the backlog; it starts only on request, ${age}`
                  : op === "close-done"
                    ? `the captain closed it as done from its record (Close as done), ${age}; its unmerged work is kept and an open pull request stays open`
                    : `the captain stopped it and dropped it; its unfinished work is kept, ${age}`;
    return `- task ${task?.key || taskId} (task_id: ${taskId}) "${task?.title ?? ""}": ${what}`;
  }

  /**
   * What happened in the cards' threads since the Firstmate's last turn
   * (cards-as-threads phase 1, the captain's C9 A). A thread message wakes
   * nobody - the captain's words go to the card's author and the author
   * answers there - so this is the only way the Firstmate hears of it, and
   * it costs nothing until the next turn runs anyway.
   *
   * One line per card: who wrote last, the first ~120 characters, how many
   * messages the thread holds, and who owes an answer now - read from the
   * card's current lifecycle (`ThreadOwed`), never from who wrote last, so a
   * captain message a closed or reopened card kept owes nothing. Bounded the
   * way the resolutions beside it are; the task record holds the rest for
   * the `tasks` query when the Firstmate wants more.
   */
  private renderThreadActivity(now: number): string[] {
    const since = Math.max(this.threadsSeenThrough + 1, now - THREAD_CONTEXT_WINDOW_MS);
    const summaries = this.options.supervisor.cards.threadActivitySince(
      since,
      THREAD_CONTEXT_LIMIT,
    );
    if (summaries.length === 0) return [];
    return [
      "thread activity since your last turn (already on the record; not a request - the card's author answers it; each line ends with what its card waits on now, not who wrote last):",
      ...summaries.map(({ card, count, last, owed }) => {
        const task = card.taskId ? this.options.tasks.get(card.taskId) : undefined;
        const about = card.taskId
          ? `on ${task?.key || card.taskId} (task_id: ${card.taskId})`
          : "no task";
        const excerpt = cutText(
          cardMessageText(last).replace(/\s+/g, " ").trim(),
          THREAD_EXCERPT_CHARS,
        );
        return `- card ${card.id} "${card.title}" ${about}: ${count} message${
          count === 1 ? "" : "s"
        }, last from ${last.who}${last.through ? ` ${FROM_THE_COMMAND}` : ""} ${ageText(now - last.at)} - "${excerpt}" (${THREAD_OWED_WORDS[owed]})`;
      }),
    ];
  }

  /**
   * Every available offering the user has placed in a bucket (premium is
   * opt-in only - the automatic ladder never reaches it), grouped
   * strongest-first. An offering placed in more than one bucket is listed
   * under each. An offering in no bucket (off) is not listed; it is still
   * reachable by pinning it by name. Bucket order and names are the same
   * four words the work-shape tier table and defer_until's bucket:<x>
   * speak, each with the word the captain reads for it (`levelForFirstmate`).
   */
  private modelBucketLines(): string[] {
    const available = this.options.availableModels();
    const availableKeys = new Set(available.map((model) => `${model.provider}/${model.id}`));
    const byBucket = new Map<Slot, string[]>();
    for (const model of this.options.quotaModels()?.models ?? []) {
      const piProvider = servedProviderOf(model.provider);
      const key = servedModelKey(model);
      if (!availableKeys.has(key)) continue;
      const memberSlots = this.options.slotsOf?.({ provider: piProvider, id: model.id }) ?? [];
      if (memberSlots.length === 0) continue; // off: not placed in any bucket
      const providerName = catalogEntry(piProvider)?.name ?? piProvider;
      for (const slot of memberSlots) {
        const rows = byBucket.get(slot) ?? [];
        rows.push(`  - ${key} "${model.label}" (${providerName})`);
        byBucket.set(slot, rows);
      }
    }
    if (byBucket.size === 0) return ["- none placed; settings > models assigns a bucket"];
    const lines: string[] = [];
    for (const bucket of SLOTS) {
      const rows = byBucket.get(bucket);
      if (!rows || rows.length === 0) continue;
      lines.push(
        `${levelForFirstmate(bucket)}${bucket === PREMIUM_SLOT ? " (crew: never picked automatically)" : ""}:`,
      );
      lines.push(...rows);
    }
    return lines;
  }

  /** The snapshot whose lifetime is the current model context, not an app setting. */
  private projectScopes() {
    return this.options.repos
      .list()
      .filter((repo) => repo.kind !== "personal")
      .map((repo) => ({
        repo_id: repo.id,
        name: repo.name,
        ...this.projectFact(repo),
        scope: repo.scope || "not set",
      }));
  }

  /**
   * The project a repository belongs to (INF-4220): its key, and its name
   * where it is not the repository's, as in a project of several.
   */
  private projectFact(repo: { id: string; name: string }): Record<string, string> {
    const project = this.options.tasks.projects.forRepo(repo.id);
    if (!project) return {};
    return {
      project: project.key,
      ...(project.name !== repo.name ? { project_name: project.name } : {}),
    };
  }

  /**
   * The complete context block, as a context that has read nothing would
   * get it. Small on purpose: crew_status and the read tools are the query
   * side. The marker stays plain model-facing
   * wording; every byte after it is one TOON-encoded JavaScript object.
   */
  buildContextBlock(
    visibleCardId?: string,
    hintTaskId?: string,
    aboutCardId?: string,
    pastCardId?: string,
    focusedProjectId?: string,
  ): string {
    const parts = this.options.tasks.readProjection(() =>
      this.contextParts(visibleCardId, hintTaskId, aboutCardId, pastCardId, focusedProjectId),
    );
    const { payload } = new ContextDelivery().render(parts.saved);
    return contextText({ delivery: DELIVERY_COMPLETE, ...payload, ...parts.turn });
  }

  /**
   * A context's two halves (INF-1712): the saved facts, which a model
   * context reads whole once and then only as they change
   * (`ContextDelivery`), and this input's own facts - what the captain did
   * and what the turn points at - which every input carries.
   */
  private contextParts(
    visibleCardId?: string,
    hintTaskId?: string,
    aboutCardId?: string,
    pastCardId?: string,
    focusedProjectId?: string,
    sourceFacts?: SelfSourceFacts,
  ): { saved: Record<string, ContextSection>; turn: Record<string, unknown> } {
    const repos = this.options.repos.list();
    const schedules = this.options.scheduler?.list() ?? [];
    const outcomes = this.options.supervisionLog?.(5) ?? [];
    const shown =
      visibleCardId !== undefined
        ? this.options.supervisor.cards.snapshot().find((card) => card.id === visibleCardId)
        : undefined;
    const aboutCard = aboutCardId
      ? this.options.supervisor.cards.snapshot().find((card) => card.id === aboutCardId)
      : undefined;
    const requiredActionTask =
      aboutCard?.taskId && this.options.tasks.get(aboutCard.taskId)?.delivery?.captainAction
        ? aboutCard.taskId
        : undefined;
    // INF-1137 friction 2: guidance belongs to this conversation, not the
    // fixed instructions every unrelated turn pays for.
    const requiredActionGuide = requiredActionTask
      ? `; required captain action task_id ${requiredActionTask}. Answer with emit_card using this same id, task_id and reply; the host preserves instructions and controls. For failure, read the output, arrange repair through the crew and keep repair status in this thread. Never confirm for the captain.`
      : "";
    // INF-1670: the host's stuck alert names the first mate as its answerer.
    const hostAlertGuide =
      aboutCard?.author === "host" && aboutCard.answeredBy === "firstmate"
        ? `; the host's stuck alert on task_id ${aboutCard.taskId ?? ""}, which you answer and cannot revise: any act it asks goes through your tools`
        : "";
    // Only a line naming the captain's message answers it; the closing
    // words are a line that leaves it open (the captain's "Only a line that
    // says it answers it; a handoff stays open").
    const asked = aboutCard
      ? this.options.supervisor.cards
          .thread(aboutCard.id)
          .messages.findLast((line) => line.who === "captain")
      : undefined;
    const answerGuide = asked
      ? ` as message ${asked.id}; answer it with an emit_card reply on this id naming answers_message ${asked.id}, since your closing words alone leave it open`
      : "";
    const aboutCardLine = aboutCard
      ? `about: card ${aboutCard.id} (${cardPresentation(aboutCard)}) "${aboutCard.title}" - the captain replied in its thread${answerGuide}${requiredActionGuide}${hostAlertGuide}`
      : undefined;
    const maybeCard = aboutCardLine ? undefined : shown ? maybeCardContextLine(shown) : undefined;
    // The task the turn points at (the open card, or the record card): the
    // fallback prefers it, and the agent should pass its task_id (P1). A
    // Firstmate-card reply names the card instead - that card IS the topic.
    const hinted = hintTaskId ? this.options.tasks.get(hintTaskId) : undefined;
    const past = pastCardId ? this.options.supervisor.cards.past(pastCardId) : undefined;
    const pastLine = past
      ? `past card ${past.id} "${past.title}" (${inLanguage(SOURCE_LANGUAGE, () => pastCardEndingWords(past))}) - the captain is reading it as history${
          hinted ? ` on ${hinted.key || hinted.id}` : ""
        }; it is closed and nothing on it can be clicked, so any change comes through your tools`
      : undefined;
    const about =
      aboutCardLine ??
      pastLine ??
      (hinted
        ? `about: ${hinted.key || hinted.id} "${hinted.title}" (${indexStatus(hinted)}) - task_id ${hinted.id}; the open card points at it`
        : undefined);
    // The captain's window is focused on one project: a hint like the
    // shown record, one step weaker, never a limit on what can be done.
    const focusedProject = focusedProjectId
      ? this.options.tasks.projects.get(focusedProjectId)
      : undefined;
    const focusLine =
      focusedProject && focusedProject.archivedAt === null
        ? `${focusedProject.key} "${focusedProject.name}" - the captain's window is focused on this project, so new work they ask for belongs to it unless they name another; a hint, never a limit`
        : undefined;
    const directions = this.options.knowledge
      ? renderDirections(
          this.options.knowledge.directions.standing({
            kind: "firstmate",
            origin: this.turn.origin,
            canCreate: this.turn.canCreate,
          }),
        )
      : undefined;
    const surfaces = this.renderSurfaces();
    const integrations = this.options.integrations?.rosterLine();
    const captainResolutions = this.renderCaptainResolutions(Date.now());
    const threadActivity = this.renderThreadActivity(Date.now());
    const introductionId = this.options.settings.getFirstRun().welcomeCardId;
    const introduction = introductionId
      ? this.options.tasks.capture.taskForCard(introductionId)
      : undefined;
    const whole = (value: unknown): ContextSection => ({ kind: "whole", value });
    const rows = (entries: { id: string; value: unknown }[]): ContextSection => ({
      kind: "rows",
      rows: entries,
    });

    // Plain JavaScript values; the whole payload goes to the TOON encoder at
    // once (`contextText`). No section concatenates its own syntax into the
    // envelope.
    const saved: Record<string, ContextSection> = {
      project_scopes: whole({
        note: "Project scopes: use these to choose where new work goes. Not repeated until a project or scope changes, or this context is lost.",
        projects: this.projectScopes(),
      }),
      repos: rows(
        repos.map((repo) => ({
          id: repo.id,
          value: {
            name: repo.name,
            repo_id: repo.id,
            ...this.projectFact(repo),
            path: repo.path,
            setup: repo.setupKind,
            workspace: repo.kind,
            // Where the project lives and, where its changes go there, the
            // app's sign-in (git integration PR 1.3).
            lives: this.livesFact(repo),
            // The computer keeping its folder, and where its tasks run (INF-567).
            ...this.placesFact(repo),
            ...(repo.kind === "personal"
              ? { delivery: "builds in place" }
              : {
                  delivery: repo.delivery,
                  autonomy: repo.autonomy,
                  ...(repo.rigor ? { rigor: repo.rigor } : {}),
                }),
          },
        })),
      ),
      crew: rows(this.rosterRows()),
      // Served only while another computer runs work, so one computer pays nothing (INF-992).
      computers: whole(
        this.options.supervisor.placement.computersListed()
          ? this.options.supervisor.placement.everyComputerTakesCardFiles()
            ? `${COMPUTERS_RULE} ${CARD_FILES_RULE}`
            : COMPUTERS_RULE
          : undefined,
      ),
      computer_versions: whole(this.options.computerVersions?.()),
      backlog: whole(this.renderBacklog()),
      open_cards: rows(this.openCardRows()),
      open_asks: whole(this.renderOpenAsks().open_asks),
      introduction: whole(
        introduction && introductionId
          ? {
              card_id: introductionId,
              title: introduction.title,
              body: introduction.outcome,
              already_created: true,
            }
          : undefined,
      ),
      schedules: rows(
        schedules.map((record) => ({
          id: record.id,
          value: {
            id: record.id,
            timing: scheduleTextOf(record),
            prompt: cutText(record.prompt, 80),
          },
        })),
      ),
      recent_fleet_outcomes: whole(
        outcomes.length > 0
          ? outcomes.map((outcome) => ({
              verdict: outcome.verdict,
              task_id: outcome.taskId,
              summary: cutText(outcome.summary, 100),
            }))
          : undefined,
      ),
      directions: whole(directions),
      // How much is saved, never a saved word: the first mate searches when a
      // message needs it (docs/knowledge.md, "Knowledge as needed").
      saved_knowledge: whole(
        this.options.knowledge
          ? contextSavedKnowledge(savedKnowledge(this.options.knowledge))
          : undefined,
      ),
      surfaces: whole(surfaces),
      // One name per connected integration; its actions are read on request.
      integrations: whole(integrations),
      models_by_intelligence_bucket: whole(this.modelBucketLines()),
      quota: whole(this.options.quotaLine()),
      // The zone CARD_AUTHORING's time rule says times in (FI3-1006).
      captain_time_zone: whole(timeZoneFact(this.now())),
      // The language CARD_AUTHORING's language rule says cards and replies in (INF-3674).
      captain_language: whole(captainLanguageFact()),
      self_source: whole(this.options.selfSourceDir),
      self_source_facts: whole(sourceFacts ?? this.options.selfSourceFacts?.() ?? null),
    };
    const turn = {
      // When this input's facts were read: the times above count from it.
      as_of: new Date(this.now()).toISOString(),
      ...(captainResolutions.length > 0 ? { captain_resolutions: captainResolutions } : {}),
      ...(threadActivity.length > 0 ? { thread_activity: threadActivity } : {}),
      ...(maybeCard ? { visible_card_hint: maybeCard } : {}),
      ...(about ? { about } : {}),
      ...(focusLine ? { focused_project: focusLine } : {}),
    };
    return { saved, turn };
  }

  /**
   * Where a project lives, as the context's `lives` fact (git integration
   * PR 1.1, sign-in added by PR 1.3): the host's kind from its origin -
   * github, gitlab, bitbucket, git, or none for a project kept only on
   * this Mac - and, only where the project's changes go there, the app's
   * sign-in: `github (signed in as octo)`, `github (not signed in)`. A
   * project whose work goes straight in never needs a sign-in, so its fact
   * names none (the captain's constraint: a host is never required); a
   * plain host names its address, which is all there is to know about it.
   */
  /** A project's folder computer and where its tasks run, while another computer runs work. */
  private placesFact(repo: RepoView): { folder_on?: string; tasks_run_on?: string } {
    const places = this.options.supervisor.placement.projectPlaces(repo);
    return places ? { folder_on: places.folder, tasks_run_on: places.tasks } : {};
  }

  private livesFact(repo: RepoView): string {
    const host = repo.host;
    if (!host) return "none";
    if (repo.kind === "personal" || !opensPullRequest(repo.delivery)) return host.kind;
    const signIn = host.name ? this.options.forges?.signInOn(host.name) : undefined;
    if (signIn === undefined) {
      // A plain host has no name of its own but its address.
      const place = forgePlace({ kind: host.kind, host: host.name });
      return place && place === host.name ? `${host.kind} (${place})` : host.kind;
    }
    if (signIn === null) return `${host.kind} (not signed in)`;
    const who = signIn.login ? `signed in as ${signIn.login}` : "signed in";
    if (signIn.state === "needs_reauth") {
      return `${host.kind} (${signIn.name} no longer accepts the sign-in)`;
    }
    if (signIn.state === "unavailable") return `${host.kind} (${who}; not reachable just now)`;
    return `${host.kind} (${who})`;
  }

  /**
   * The captain's surfaces (talk-to-personalize Step 1): the theme and every
   * panel with its rail, position, place in its slot and visibility under
   * the layout, in the layout's own order (INF-2344) - bounded, one row per
   * surface, each carrying the id `personalize` takes. Absent in a build
   * with no personalize tool.
   */
  private renderSurfaces(): Record<string, unknown> | undefined {
    const personalize = this.options.personalize;
    if (!personalize) return undefined;
    const preferences = personalize.preferences.get();
    const personal = personalize.personal();
    const all = listSurfaces(preferences.layout, personal, personalize.gates());
    const mounts = personalize.mounts?.() ?? null;
    // The captain's own panels and the ones added, a runbook's included.
    const personalSurfaces = all.filter((surface) => surface.kind !== "app");
    const listed = new Set(personalSurfaces.slice(0, SURFACES_CONTEXT_LIMIT));
    const shown = all.filter((surface) => surface.kind === "app" || listed.has(surface));
    const omitted =
      personalSurfaces.length - Math.min(personalSurfaces.length, SURFACES_CONTEXT_LIMIT);
    const panelsOff = panelsOffLine(preferences.panels);
    const refused = refusedRunbookPanels(personal);
    return {
      description: "app_change panel and personalize remove act on these ids",
      theme: preferences.appearance.theme,
      panels: shown.map((surface) => ({
        id: surface.id,
        title: surface.title,
        ...surfaceOwner(surface, personal),
        rail: surface.placement.x,
        position: surface.placement.y,
        // Its place in that slot, from the top: "2 of 3".
        ...(surface.place ? { order: surface.place, of: surface.of } : {}),
        // The window's own word on it (docs/personal-panels.md, "Placed on the rail").
        state: surfaceState(surface, mounts),
      })),
      ...(omitted > 0 ? { personal_panels_omitted: omitted } : {}),
      // A runbook's panel left off, beside the one that holds its id (docs/runbooks.md, "Panels").
      ...(refused.rows.length > 0 ? { refused_runbook_panels: refused.rows } : {}),
      ...(refused.more > 0 ? { refused_runbook_panels_omitted: refused.more } : {}),
      ...(panelsOff ? { panels_off: panelsOff } : {}),
    };
  }

  /**
   * The captain's sequences (docs/sequences.md), read at each idle boundary
   * and served after the prompt. Created on first use, because the personal
   * workspace is an option the constructor has not unpacked yet.
   */
  private sequences: SequencesSource | undefined;
  /** The fallback last announced, so a broken file is one feed line, not one per turn. */
  private sequencesFallback: SequencesFallback | undefined;

  servedSequences(): ServedSequences {
    if (this.options.runbooks) return this.options.runbooks.firstmate();
    this.sequences ??= new SequencesSource(this.options.personalize?.personalWorkspaceDir);
    const served = this.sequences.current();
    if (served.fallback !== this.sequencesFallback) {
      this.sequencesFallback = served.fallback;
      if (served.fallback) {
        this.options.broadcastEvent({
          type: "firstmate_note",
          text: `Your instructions on how to approach work could not be used (${SEQUENCES_FALLBACK_WORDS[served.fallback]}); following the built-in ones`,
        });
      }
    }
    return served;
  }

  /**
   * The captain's messages that have not ended on an answer they accepted
   * (INF-1610, docs/task-capture.md "How a message ends"), newest first and
   * bounded (`OPEN_ASKS_LISTED`): so "what is still open?" needs no
   * crewmate. A message the notice answered stays listed while its notice
   * is up. Answered ones are read through the tasks tool.
   */
  private renderOpenAsks(): { open_asks?: Record<string, unknown> } {
    const ending = this.options.supervisor.askEnding;
    const shown = new Set(this.options.supervisor.cards.snapshot().map((card) => card.id));
    const rows: { at: number; row: Record<string, unknown> }[] = [];
    try {
      const threads = ending.openThreads();
      for (const ask of asksInTurn(this.options.tasks, threads)) {
        rows.push({
          at: ask.at,
          row: { ask_id: ask.id, sent: new Date(ask.at).toISOString(), state: IN_TURN },
        });
      }
      for (const thread of threads) {
        const state = ending.state(thread);
        const live = ending.listedWork(thread).filter((task) => !TaskService.isClosed(task));
        rows.push({
          at: thread.ask.at,
          row: {
            ask_id: thread.ask.id,
            sent: new Date(thread.ask.at).toISOString(),
            state:
              state.kind === "working"
                ? "working"
                : state.kind === "waiting"
                  ? `waiting on the captain: card ${state.cardId}`
                  : state.kind === "accepted"
                    ? "answer accepted"
                    : "no answer yet",
            ...(live.length > 0
              ? {
                  running: live
                    .slice(0, 4)
                    .map((task) => `${task.key || task.id}: ${cutText(task.title, 80)}`),
                }
              : {}),
          },
        });
      }
      for (const ask of this.options.tasks.capture.listAsksByDelivery("unresolved")) {
        if (!ask.followed || !ask.noticeCardId || !shown.has(ask.noticeCardId)) continue;
        rows.push({
          at: ask.at,
          row: {
            ask_id: ask.id,
            sent: new Date(ask.at).toISOString(),
            state: `unanswered: the app's notice ${ask.noticeCardId} is up`,
          },
        });
      }
    } catch (caught) {
      console.warn("[firstmate] the open messages could not be read:", caught);
      return {};
    }
    if (rows.length === 0) return {};
    rows.sort((a, b) => b.at - a.at);
    return {
      open_asks: {
        note: "The captain's messages not yet answered on a card they accepted, one per row, newest first, by when each was sent; their words are in your conversation. Each ends on its own accepted answering card; two messages about one task can end on the same card. open_work reads every one, with its words.",
        asks: rows.slice(0, OPEN_ASKS_LISTED).map((entry) => entry.row),
        ...(rows.length > OPEN_ASKS_LISTED ? { more: rows.length - OPEN_ASKS_LISTED } : {}),
      },
    };
  }

  /**
   * The roster (INF-1712): every started task that has not closed - running,
   * idle, paused, held or on a computer out of reach - read from the task
   * record, with the crew's facts where the supervisor has them. Unstarted
   * work is the backlog's count, read by lookup. Times are the times they
   * run from, so a row changes when its facts do, never with the clock.
   */
  private rosterRows(): { id: string; value: Record<string, unknown> }[] {
    const tasks = this.options.tasks;
    const crew = new Map(
      this.options.supervisor.facts
        .crewStatus(undefined, { startedOnly: true })
        .map((entry) => [entry.taskId, entry]),
    );
    const iso = (at: number) => new Date(at).toISOString();
    return tasks
      .listActive()
      .slice()
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)
      .map((record) => {
        const entry = crew.get(record.id);
        const times = entry?.times ?? {};
        const answer = this.options.supervisor.cards.answerNoteForTask(record.id);
        const graph = this.indexGraphNote(record).replace(/^ \[|\]$/g, "");
        return {
          id: record.id,
          value: {
            task_id: record.id,
            ...(record.key ? { key: record.key } : {}),
            ...(record.kind === "work" ? {} : { kind: record.kind }),
            status: entry?.status ?? indexStatus(record),
            title: record.title,
            ...(answer
              ? {
                  answer_waiting: {
                    since: iso(answer.createdAt),
                    completion: "Done in its record; time does not close it",
                  },
                }
              : {}),
            repo:
              entry?.repoName ??
              (record.repoId ? this.options.repos.get(record.repoId)?.name : undefined) ??
              "default workspace",
            // The computer it runs on, while another computer runs work (INF-992).
            ...(entry?.computer ? { runs_on: entry.computer } : {}),
            ...(entry?.away ? { away: entry.away } : {}),
            // The model it runs on, so a start on the model asked for needs no wake (INF-5123).
            ...(record.model ? { model: record.model } : {}),
            ...(graph ? { graph } : {}),
            ...(entry?.gate ? { gate: entry.gate } : {}),
            ...(entry?.rigor ? { rigor: entry.rigor } : {}),
            ...(entry?.autonomy === undefined ? {} : { autonomy: entry.autonomy }),
            ...(entry?.review ? { review: entry.review } : {}),
            ...(entry?.thread ? { thread: entry.thread } : {}),
            ...(entry?.restart ? { restart: entry.restart } : {}),
            // Times to count from as_of, never guess (INF-1244).
            ...(times.stalledSince !== undefined
              ? {
                  stalled: `idle since ${iso(times.stalledSince)} · ${times.stalledWakes ?? 0} wake${times.stalledWakes === 1 ? "" : "s"}`,
                }
              : {}),
            ...(times.jobSince !== undefined
              ? { job: `running since ${iso(times.jobSince)}: ${times.job ?? ""}` }
              : {}),
            // What a quiet turn waits on, once the twenty-minute check named it (INF-2603).
            ...(times.calls?.length || times.steersUnread
              ? {
                  waiting: [
                    ...(times.calls ?? []).map(
                      (call) => `inside ${call.tool} since ${iso(call.since)}`,
                    ),
                    ...(times.steersUnread
                      ? [
                          `${times.steersUnread} steer${times.steersUnread === 1 ? "" : "s"} unread since ${iso(times.steersSince ?? 0)}`,
                        ]
                      : []),
                  ].join("; "),
                }
              : {}),
            ...(times.reportedAt !== undefined ? { reported_at: iso(times.reportedAt) } : {}),
            ...(times.checkBackUntil !== undefined
              ? { check_back: `${iso(times.checkBackUntil)}: ${times.checkBackFor ?? ""}` }
              : {}),
            ...(entry?.override ? { override: entry.override.passes } : {}),
            ...(entry?.allowed
              ? { allowed: entry.allowed.map((yes) => `${yes.card}: ${yes.covers}`) }
              : {}),
          },
        };
      });
  }

  /**
   * The backlog (INF-1712): unstarted work, counted per project. The rows
   * are read with the tasks tool; a count is never a reason to start one.
   */
  private renderBacklog(): Record<string, unknown> | undefined {
    const tasks = this.options.tasks;
    const byProject = new Map<string, TaskRecord[]>();
    for (const record of tasks.listLive()) {
      if (record.status !== "open") continue;
      byProject.set(record.projectId, [...(byProject.get(record.projectId) ?? []), record]);
    }
    if (byProject.size === 0) return undefined;
    const projects = tasks.projects.list().flatMap((project) => {
      const open = byProject.get(project.id);
      if (!open?.length) return [];
      const count = (predicate: (record: TaskRecord) => boolean) => open.filter(predicate).length;
      const waiting = count((record) => indexRank(record) === 0);
      const onRequest = count((record) => record.startPolicy === "on-request");
      return [
        {
          project: project.key,
          name: project.name,
          unstarted: open.length,
          ...(waiting > 0 ? { waiting_on_you: waiting } : {}),
          ...(onRequest > 0 ? { on_request: onRequest } : {}),
        },
      ];
    });
    return {
      note: "Unstarted tasks per project, not listed here: read them with the tasks tool (project, status open; skip pages past limit). The about line and open cards still name one when they point at it.",
      projects,
    };
  }

  /**
   * Every open card on the stack (WI-12, INF-1712), whatever its task's
   * state and including cards with no task: the agent revises an
   * overlapping card, steers a crewmate that already carded it, and adds a
   * card only for something distinct. Full cards are read with open_work.
   */
  private openCardRows(): { id: string; value: Record<string, unknown> }[] {
    const supervisor = this.options.supervisor;
    return supervisor.cards.snapshot().map((card) => {
      const task = card.taskId ? this.options.tasks.get(card.taskId) : undefined;
      const emitter =
        card.author === "host"
          ? "host"
          : card.taskId
            ? cardEmitter(card.id, card.taskId)
            : card.author;
      const owed = supervisor.cards.owed(card.id);
      return {
        id: card.id,
        value: {
          card_id: card.id,
          ...(card.taskId ? { task: task?.key || card.taskId, task_id: card.taskId } : {}),
          // A preview's body is markup, not copy: its line stops at the title.
          line: openCardContextLine({
            ...card,
            body: isPreviewBody(card.body) ? "" : card.body,
            emitter,
          }),
          ...(owed === "firstmate" || owed === "author"
            ? { waits_on: THREAD_OWED_WORDS[owed] }
            : {}),
        },
      };
    });
  }

  /**
   * The graph in a few words on an index row (P2): the parent, where a
   * follow-up was found, and what the row waits on - blockers by key, an
   * on-request policy - so the agent can answer "why has this not started"
   * (or "why can this not merge") without a query.
   */
  private indexGraphNote(record: TaskRecord, nested = false): string {
    const tasks = this.options.tasks;
    const parts: string[] = [];
    // A nested row sits under its parent already; saying so again is noise.
    const parent = record.parentId && !nested ? tasks.get(record.parentId) : undefined;
    if (parent) parts.push(`under ${parent.key || parent.id}`);
    // A parent no crewmate holds is a container: say so, and how the work
    // under it stands, since nothing else on its row would.
    const children = record.status === "open" ? tasks.graph.children(record.id) : [];
    const container = children.length > 0;
    if (container) {
      const count = (status: TaskRecord["status"]) =>
        children.filter((child) => child.status === status).length;
      parts.push(
        `no crewmate; children: ${count("active")} running, ${count("open")} open, ${count("done")} done`,
      );
    }
    // A follow-up is no longer a child of the task it was found on, so its
    // discovered-from edge is the only thing that places it.
    const origins = tasks.graph.discoveredOrigins(record.id);
    if (origins.length > 0) {
      parts.push(`found on ${origins.map((origin) => origin.key || origin.id).join(", ")}`);
    }
    if (record.status === "active") {
      // The waits that hold its merge until that work closes, as the close
      // gate reads them: a wait the captain's words passed holds nothing.
      const holding = tasks.graph.holdingClose(record.id, record);
      if (holding.length > 0) {
        parts.push(
          `cannot merge until ${holding.map((blocker) => blocker.key || blocker.id).join(", ")} ${holding.length === 1 ? "closes" : "close"}`,
        );
      }
      // A baseline wait holds no close, but the task waits on that work
      // all the same; it resumes when that work closes (FI3-250).
      const waits = standingDependencyWaits(tasks, record.delivery)
        .map((wait) => wait.task)
        .filter((task) => TaskService.blockerHoldsClose(task))
        .filter((task) => !holding.some((blocker) => blocker.id === task.id));
      if (waits.length > 0) {
        parts.push(`waits on ${waits.map((task) => task.key || task.id).join(", ")}`);
      }
    }
    if (record.status === "open" && record.kind === "work") {
      const waiting = tasks.graph.waitingOn(record.id);
      if (waiting.length > 0) {
        const dead = waiting.some((blocker) => blocker.status === "dropped");
        parts.push(
          `blocked by ${waiting.map((blocker) => blocker.key || blocker.id).join(", ")}${dead ? " (dropped)" : ""}`,
        );
      } else if (!record.gate && record.startPolicy === "on-request" && !container) {
        parts.push("on request");
      }
    }
    return parts.length > 0 ? ` [${parts.join("; ")}]` : "";
  }
}

function scheduleTextOf(record: ScheduleRecord): string {
  return record.state === "paused" || record.state === "draft"
    ? `${scheduleText(record.spec)} (${record.state})`
    : scheduleText(record.spec);
}

/** "just now", "4m ago", "2h ago": an age a context line can carry. */
function ageText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** The status word an index row shows: the record's, or its activity while active. */
function indexStatus(record: TaskRecord): string {
  if (record.status === "active") return record.activity ?? "active";
  if (record.status === "open") {
    if (record.kind === "decision") return "waiting on you";
    if (record.gate?.kind === "captain") return "waiting on you";
    return "open";
  }
  return record.closedReason ?? record.status;
}

/** Index order: needs-you first, then live before closed, then priority, then recency. */
function indexRank(record: TaskRecord): number {
  const needsYou =
    record.status === "open" && (record.kind === "decision" || record.gate?.kind === "captain");
  if (needsYou) return 0;
  if (record.status === "active") return 1;
  if (record.status === "open") return 2;
  return 3;
}
