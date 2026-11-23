import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import type { CutOff } from "@shared/authFailure";
import { hearsClientJobEnds } from "@shared/contractFeatures";
import { crewSpeedSchema } from "@shared/crewSpeed";
import { HOME } from "@shared/deviceNames";
import { invokeContract, type WorkInvokeChannel } from "@shared/ipc";
import { cutText } from "@shared/textCut";
import {
  isWorkOrderChannel,
  PLACED_EVENTS_MAX_PER_REQUEST,
  type PlacedEvent,
  type PlacedEventRecord,
  type PlacedSpec,
  type PlacedState,
  placedEventsAnswerSchema,
  requestRepeatsSafely,
  type WorkOrderChannel,
  type WorkOrderRequest,
  type WorkOrderResponse,
  workOrders,
} from "@shared/work";
import {
  placedSecretAskAnswerSchema,
  placedSecretTakeAnswerSchema,
  placedSecretUseAnswerSchema,
} from "@shared/workSecrets";
import { UPDATE_RETURN_MS, WORK_RELEASE_ORDER, WORK_SAVE_ORDER } from "@shared/workUpdate";
import type { CrewmateBrowser } from "../browser/taskBrowsers";
import { contractChange, listsChange } from "../connection/contractChanges";
import { WorkRequestAbortedError } from "../devices/homeLink";
import type { TaskFiles } from "../files/taskFiles";
import { hostEnv } from "../hostEnv";
import {
  ClaudeFiles,
  conversationFiles,
  dueIn,
  dueRule,
  rewriteOutsideData,
  type TaskIntegrations,
} from "../integrations";
import type { JobExit } from "../jobs/jobManager";
import {
  crewmateContractStamp,
  crewmateResume,
  crewmateResumeToken,
} from "../orchestrator/crewSession";
import type { MediaProbe, TypefaceProbe } from "../pi/cardImages";
import { CREWMATE_TOOLS } from "../pi/crewmateTaskTools";
import type { SecretsCatalog, SecretsCommand } from "../secrets/requests";
import { type SelfSourceReader, sourceContext } from "../selfSource/resolve";
import { serveAnswerFiles } from "../session/answerFiles";
import { followCompletions } from "../session/followCompletions";
import { APP_TOOL_REQUESTS, OpenReads } from "../session/openReads";
import type { PersonalVersion } from "../session/personalSet";
import {
  type ClientBackgroundTask,
  LOCAL_MACHINE_ID,
  type ModelSession,
  type SessionBackend,
  type SessionBinding,
  type SessionEvent,
  type SessionFactories,
  type SessionRenewal,
  type SessionSpec,
  StoppedBeforeStartError,
  type TaskShell,
} from "../session/session";
import { bindTools, type CrewmateTool, OutcomeUnknownError } from "../session/tools";
import { changeRecoveryCheck, sameNames } from "../session/workRecovery";
import { HANDOVER_IN_DIR_NAME } from "../tasks/handoverFiles";
import { ForgeAuthRequiredError } from "../workspace/forgeAuth";
import type { MovedFolders } from "../workspace/workMove";
import { keepOrdered, type PersonalCopy } from "./personalCopy";
import type { PlacedJob, PlacedTaskState, PlacedTasks } from "./placedTasks";
import { SecretUsesThere } from "./secretUses";
import {
  filesCommand,
  integrationsCommand,
  secretsCommand,
  type TaskAsks,
  toolCallbacks,
} from "./toolCallbacks";
import { PLACED_REQUEST_WAIT_MS } from "./toolWait";
import type { WorkingCopies } from "./workingCopies";

/**
 * A crewmate's conversation held on a computer that runs work, for its home
 * (docs/helper.md, "Holding a conversation"): the computer's side of the
 * orders and work requests in src/shared/work.ts.
 *
 * The real Pi or Claude conversation runs here, with the crewmate's file
 * tools and shell in this computer's own folder for the task and this
 * computer's own sign-ins. The crewmate's own tools run here too, so a card
 * body file or a picture is read where it was written; each tool's callback
 * - a card, a report, a follow-up, a progress note, a reply, a look at the
 * tasks, a read or write of the home's knowledge - asks the home, which does
 * it exactly as for a crewmate of its own. So does each list, show and call
 * of its integrations' command, whose sign-ins stay the home's. Those
 * callbacks and commands are `toolCallbacks.ts`'s, asking through this host.
 *
 * Each task's conversation runs in its own working copy here, which the
 * home has made first (`WorkingCopies`, docs/helper.md "Its working
 * copies"); the orders about the working copy ride the same answers.
 *
 * Nothing is done twice. An order carries an id from what the home saved,
 * and one this conversation already applied is answered as it was, without
 * acting. A callback asks under one id and asks again under it after a drop.
 * What the conversation does is numbered per task and written to the task's
 * outbox before it is sent, one request at a time, and forgotten only once
 * the home keeps it. A turn this computer quit in the middle of ends as
 * `interrupted` at its next start, as a turn on the home ends when the home
 * quits, and each background job's end it had not told yet - an exit the
 * home had not answered, or a job its end cut off, a Claude client's
 * background tasks among them - is told to its home once. So is each
 * background task a Claude client still ran when it ended while this
 * computer ran on.
 */

export type SessionHostOptions = {
  source?: SelfSourceReader;
  tasks: PlacedTasks;
  /**
   * This app's own folder for the private copies a Secrets use binds here
   * (docs/secrets.md, "On a computer that runs work"). Absent, a task here
   * lists the home's catalog alone.
   */
  secretRunsDir?: string;
  /** Asks the home one work request; asked again after every drop until it answers. */
  ask: (channel: WorkInvokeChannel, args: unknown, signal?: AbortSignal) => Promise<unknown>;
  /** This computer's own factories. */
  factories: Partial<SessionFactories>;
  /** The binding the home described, resolved with this computer's own sign-ins. */
  bind: (binding: PlacedSpec["binding"]) => Promise<SessionBinding>;
  /**
   * This computer's own accounts, as far as a conversation's facts go: which
   * of them a resolved binding is, which the state names to the home so its
   * usage is booked there, and where a typed cut-off a turn here meets is
   * recorded - on that account in this computer's own store, never the
   * home's (docs/helper.md, "Its own sign-ins"). Absent, a conversation
   * names no account of its own.
   */
  accounts?: OwnAccounts;
  /** This computer's own Pi shell jobs; Claude reports its own background work. */
  runningJobCount?: (task: string) => number;
  /** The task's longest-running Pi shell job, which the count names to the home. */
  oldestRunningJob?: (task: string) => { jobId: string; command: string } | undefined;
  /** Ends what a task's shell left running, when its conversation closes. */
  killJobs?: (task: string) => void;
  /**
   * This computer's decoder for a card's demo recording (docs/card-authoring.md
   * "Demo recordings"). Absent, a card naming one is refused here.
   */
  probeMedia?: MediaProbe;
  /**
   * The app's own sign-ins and keys on this computer (`protectedPlaces`),
   * which a crewmate's card files never copy.
   */
  protectedPlaces?: readonly string[];
  /**
   * This computer's loader for a preview's project font (docs/card-authoring.md
   * "Fonts by reference"). Absent, a card naming one is refused here.
   */
  probeTypeface?: TypefaceProbe;
  /**
   * The contract the home said in its welcome, while it is known: a project
   * font goes home only to a home that keeps one (`CARD_TYPEFACES_SINCE`).
   */
  homeVersion?: () => string | null;
  /**
   * The contract changes the home listed in its welcome, while known: what a
   * feature added since this major waits for by name
   * (src/shared/contract-changes/README.md).
   */
  homeChanges?: () => readonly string[] | null;
  /** The home's personal set as it last sent it (docs/personal-resources.md); absent, this user's own is read. */
  personal?: PersonalCopy;
  /**
   * This computer's working copies, which a conversation runs in. Absent,
   * a conversation runs in an empty folder of its task's own.
   */
  copies?: WorkingCopies;
  /**
   * This computer's task channel and its task browsers (docs/task-browser.md,
   * "On another computer"): a conversation whose task the home says has a
   * browser is given it, through `infinitary-browser-axi` in its shell, and
   * one the home says reaches its integrations is given
   * `infinitary-integrations-axi`, each call asked of the home
   * (docs/integrations.md, "On a computer that runs work"), and one the
   * home says lists its secrets is given `infinitary-secrets-axi` with the
   * catalog alone, each list asked of the home (docs/secrets.md); all go
   * when the conversation closes for good. Absent, this computer keeps no
   * browsers, and its roster says so.
   */
  commands?: {
    grant: (
      task: string,
      tools: {
        browser: boolean;
        integrations?: TaskIntegrations;
        load?: boolean;
        files?: TaskFiles;
        secretsCatalog?: SecretsCatalog;
        secrets?: SecretsCommand;
        stops?: boolean;
      },
    ) => { browser?: CrewmateBrowser; shell: TaskShell };
    close: (task: string) => void;
  };
  /**
   * The crewmate tools it binds, by the names the home sends: the crewmate's
   * own whose callbacks ask the home, unless a test stands in its own.
   */
  tools?: readonly CrewmateTool[];
  /**
   * Where this computer's Claude client keeps its transcripts (`~/.claude`),
   * so the words from outside a conversation there holds go from them too
   * (`inf:session:delete-outside`). Absent, only its record is read.
   */
  claudeConfigDir?: () => string;
  /**
   * The close's sweep of what the task left running here (docs/leftover-programs.md):
   * its stops run, or go to the task that carries its work on here, and the
   * programs holding its folders end. Absent, a close stops nothing.
   */
  leftovers?: (
    task: string,
    close: { carriedTo?: { task: string; key: string }; startedAt?: number },
  ) => Promise<import("@shared/leftoverPrograms").LeftoversReport>;
  /**
   * Wraps a close from its start to its sweep's end, so what finished tasks
   * left leaves the task out until its own cleanup is done (`LeftBehindHere.sweep`).
   */
  closing?: <T>(task: string, run: () => Promise<T>) => Promise<T>;
  /**
   * How long a saved update waits for its home before it lets the save go
   * here (`saveForUpdate`); `UPDATE_RETURN_MS` unless a test stands in a shorter wait.
   */
  updateReturnMs?: number;
  now?: () => number;
  log?: (line: string) => void;
};

/** What a conversation held here knows of this computer's own accounts (`SessionHostOptions.accounts`). */
export type OwnAccounts = {
  /** The account of this computer's own that a resolved binding is, if it is one. */
  of(binding: SessionBinding): string | undefined;
  /** Records a typed cut-off on that account, in this computer's own store. */
  noteCutOff(accountId: string, cutOff: CutOff): void;
};

/** The crewmate tools whose callbacks can ask the home; the home names which a task gets. */
/** The crewmate tools a conversation here serves by asking its home: the app's own (`APP_TOOL_REQUESTS`). */
const FORWARDED_TOOLS = new Set<string>(Object.keys(APP_TOOL_REQUESTS));
/** A home that draws an ask's how-to (`secret-ask-how.md`). */
const SECRET_ASK_HOW = contractChange("secret-ask-how");

/** The provider's retries a crewmate's turn gets when the home names none. */
const RETRIES = 2;

type Flush = { seq: number; resolve: () => void };

/**
 * Its home's update of this computer while it saves the crew's work, until
 * the update ends this run or the save is let go (`saveForUpdate`).
 */
type UpdateSave = {
  /** Withdraws each stop still waiting (`releaseUpdate`). */
  readonly withdraw: AbortController;
  /** Each task whose turn the save stopped. */
  readonly stopped: Set<string>;
  /** Each stop under way, settled once its turn ended here or it was withdrawn. */
  readonly stops: Map<string, Promise<void>>;
  /** Resolves once every turn here stopped and the home has every end. */
  saving: Promise<void>;
  /** Lets the save go here when the home says nothing for `UPDATE_RETURN_MS` after it saved. */
  timer: NodeJS.Timeout | undefined;
};

/** What the save and its let-go answer: each task whose turn the save stopped. */
type UpdateSaveAnswer = { stopped: string[] };

type Held = {
  readonly task: string;
  state: PlacedTaskState;
  session: ModelSession | null;
  /** Reopening the home’s side can enable the policy without interrupting this conversation. */
  speed: boolean;
  backend: SessionBackend | null;
  /** The version of the home's personal set the open conversation read, when it read one. */
  personal?: PersonalVersion | undefined;
  /** The last Pi shell count sent, so another task's job does not repeat it. */
  jobs: number | undefined;
  /** The job that count last named, so a change of its longest-running job is sent too. */
  jobId: string | undefined;
  /**
   * The background tasks the open conversation's own client runs now (a
   * Claude conversation's), each by its row in the task's job rows, so an
   * end of the client that takes them with it is told: now, or at the next
   * start when it is this computer's stop.
   */
  clientTasks: Map<string, PlacedJob>;
  /** The app's own reads the open conversation has open, which the home's quiet check may answer (INF-2603). */
  readonly openReads: OpenReads;
  /** The account of this computer's own the open conversation is bound to, if it is one. */
  account: string | undefined;
  /** The session the open conversation started over from, until a turn of it finishes (`PlacedState.renewal`). */
  renewal: SessionRenewal | undefined;
  /** The renewal a conversation let go of for the home to open again carries into that open (`holdReopen`). */
  heldRenewal?: SessionRenewal;
  opening: Promise<void> | null;
  unsubscribe: (() => Promise<void>) | null;
  readonly orders: Map<string, unknown>;
  /** Every event after the home's `kept`, in order. */
  outbox: PlacedEventRecord[];
  /** Events not yet on disk. */
  unwritten: PlacedEventRecord[];
  /** The newest number the home said it has. */
  through: number;
  sending: boolean;
  /** The home refused this task's events; nothing more is sent until it is in reach again. */
  refused: boolean;
  flushes: Flush[];
  /** Orders run one at a time per task. */
  chain: Promise<unknown>;
  /** Settles once the prompt's turn running here has ended and its end is written. */
  turnOver: Promise<void> | undefined;
  /** The working copy's orders being done now, by id: one asked again waits for the same. */
  copying: Map<string, Promise<unknown>>;
  /** Its folder was removed (`inf:session:remove`): nothing of it is written again. */
  removed: boolean;
  /** The tool names, instructions and commands this conversation was opened with. */
  opened:
    | {
        tools: readonly string[];
        instructions: string;
        sourceContext: string;
        browser: boolean;
        integrations: boolean;
        load: boolean;
        stops: boolean;
        files: boolean;
        secrets: boolean;
      }
    | undefined;
  /** What the home opened the open conversation with, so a pass that rewrites its files opens it again. */
  spec: PlacedSpec | undefined;
};

/**
 * An open that failed leaving no new conversation here, once any it began
 * was let go (`open-not-opened.md`); `cause` is why it failed.
 */
class NothingOpened extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "NothingOpened";
  }
}

export class SessionHost {
  private readonly held = new Map<string, Held>();
  /** Each task's Secrets uses here, kept across its grants so an intent answers its first use. */
  private readonly secretUses = new Map<string, SecretUsesThere>();
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private stopped = false;
  /** Nothing is sent until the home is first in reach, or asks something. */
  private live = false;
  /** Its home's update while it saves the crew's work here (`saveForUpdate`). */
  private updateSave: UpdateSave | undefined;
  private writeTimer: NodeJS.Immediate | undefined;

  constructor(private readonly options: SessionHostOptions) {
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((line) => console.warn(`[session-host] ${line}`));
    // A turn left running by a quit, or a crash, ended then: say so first.
    for (const task of options.tasks.list()) {
      const held = this.load(task);
      if (held.state.running) {
        const { turn } = held.state.running;
        held.state = { ...held.state, running: undefined };
        this.record(held, { type: "turn_ended", turn, outcome: "interrupted", undelivered: [] });
        this.writeOut(held);
      }
      this.interruptContinuation(held);
      // No conversation is open yet, so no job of this run is: each row is
      // a job the last run's end cut off, or an exit the home had not answered.
      for (const job of options.tasks.jobs(task)) this.tellJobEnd(held, job);
    }
  }

  /** Answers one order the home asked (src/shared/work.ts), or throws why not. */
  async answer(channel: string, args: unknown): Promise<unknown> {
    if (this.stopped) throw new Error("This computer is stopping.");
    if (!isWorkOrderChannel(channel))
      throw new Error(`${channel} is not a request this computer answers.`);
    const parsed = workOrders[channel].request.safeParse(args);
    if (!parsed.success) throw new Error(`Rejected ${channel}: malformed request`);
    this.live = true;
    return this.order(channel, parsed.data);
  }

  /**
   * The home is in reach again: whatever it has not taken goes now. A home
   * that restarted holds only what it kept, so the events after its `kept`
   * go again; one that only lost the connection skips the ones it has.
   */
  reached(): void {
    this.live = true;
    for (const held of this.held.values()) {
      held.refused = false;
      held.through = Math.min(held.through, held.state.kept);
      this.pump(held);
    }
  }

  /** The shell job list changed: each open Pi conversation sends its own count. */
  jobsChanged(): void {
    if (this.stopped) return;
    for (const held of this.held.values()) this.recordJobs(held);
  }

  private recordJobs(held: Held, snapshot = false): void {
    if (!held.session || held.state.closed || held.backend !== "pi") return;
    const count = this.options.runningJobCount?.(held.task);
    if (count === undefined) return;
    // The home cannot see these jobs, so the count names the oldest one
    // for its words about it.
    const oldest = count > 0 ? this.options.oldestRunningJob?.(held.task) : undefined;
    if (!snapshot && count === held.jobs && oldest?.jobId === held.jobId) return;
    held.jobs = count;
    held.jobId = oldest?.jobId;
    this.record(held, {
      type: "background_work_changed",
      count,
      ...(oldest ? { job: { id: oldest.jobId, command: oldest.command } } : {}),
    });
  }

  /**
   * The background tasks the conversation's own client runs now (a Claude
   * conversation's), as its client lists them: each new one gets a row,
   * and one the client no longer lists loses its row, since the client
   * tells its own model how it ended. A row the last run left is told at
   * this start and never touched here.
   */
  private keepClientTasks(held: Held, tasks: readonly ClientBackgroundTask[]): void {
    const live = new Set(tasks.map((task) => task.id));
    for (const id of held.clientTasks.keys()) {
      if (live.has(id)) continue;
      held.clientTasks.delete(id);
      this.options.tasks.forgetJob(held.task, id);
    }
    if (held.state.closed) return;
    for (const task of tasks) {
      if (held.clientTasks.has(task.id)) continue;
      const row: PlacedJob = { id: task.id, command: task.description, startedAt: this.now() };
      held.clientTasks.set(task.id, row);
      this.options.tasks.keepJob(held.task, row);
    }
  }

  /**
   * The conversation's client ended while this computer runs on - the home
   * let go of it (its quit does), a moved contract reopened it, or it
   * stopped by itself - and each background task it still listed ended with
   * it (INF-405). Its row keeps that end until the home answers, and the
   * home is told now, once, so its crewmate never waits on the task.
   */
  private clientEnded(held: Held): void {
    for (const row of held.clientTasks.values()) {
      const job: PlacedJob = {
        ...row,
        exit: {
          exitCode: null,
          durationMs: Math.max(0, this.now() - row.startedAt),
          tail: "",
          interrupted: "client",
        },
      };
      this.options.tasks.keepJob(held.task, job);
      this.tellJobEnd(held, job);
    }
    held.clientTasks.clear();
  }

  /**
   * A background job a crewmate's shell started here ended: its home hears
   * it as a wake. Its row keeps the exit until the home answers, so a stop
   * before then tells it at the next start.
   */
  jobExit(exit: JobExit): void {
    const held = this.held.get(exit.ownerId);
    if (!held || held.state.closed) return;
    const job: PlacedJob = {
      id: exit.jobId,
      command: exit.command,
      startedAt: this.now() - exit.durationMs,
      exit: { exitCode: exit.exitCode, durationMs: exit.durationMs, tail: exit.tail },
    };
    this.options.tasks.keepJob(held.task, job);
    this.tellJobEnd(held, job);
  }

  /**
   * Tells the home a job's end, the one its crewmate waits for, once: its
   * exit, or - for a job the last run here left running - that it never
   * exited, because that run's stop killed it or the run ended without one,
   * or because the Claude client it ran in ended first. It goes under the
   * job's own call id, and its row goes only once the home answers, so a
   * stop before then asks again at the next start and the home answers that
   * from what it kept. A home known to be older hears a client's end
   * without why (`CLIENT_JOB_ENDS_SINCE`), as an exit by signal.
   */
  private tellJobEnd(held: Held, job: PlacedJob): void {
    const forget = () => {
      if (!held.removed) this.options.tasks.forgetJob(held.task, job.id);
    };
    // A closed conversation has nobody waiting.
    if (held.state.closed) {
      forget();
      return;
    }
    const home = this.options.homeVersion?.() ?? null;
    const { interrupted, ...exit } = job.exit ?? {
      exitCode: null,
      durationMs: Math.max(0, (job.stoppedAt ?? job.startedAt) - job.startedAt),
      tail: "",
      interrupted: job.stoppedAt === undefined ? ("crash" as const) : ("quit" as const),
    };
    const older = interrupted === "client" && home !== null && !hearsClientJobEnds(home);
    // A job's end is its own request: it carries no tool's cancellation,
    // so a tool that started the job cannot withdraw the end.
    void this.call(held, "inf:work:job-exit", {
      callId: `job:${job.id}`,
      exit: {
        jobId: job.id,
        command: job.command,
        ...exit,
        ...(interrupted && !older ? { interrupted } : {}),
      },
    }).then(forget, (error: unknown) => {
      // Stopping first: its row stays for the next start.
      if (this.stopped) return;
      this.log(`a job's end was refused: ${messageOf(error)}`);
      forget();
    });
  }

  /**
   * This computer stops: every conversation lets go, a running turn ends
   * as `interrupted`, and what is not on disk is written.
   */
  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.writeTimer) clearImmediate(this.writeTimer);
    this.writeTimer = undefined;
    clearTimeout(this.updateSave?.timer);
    const sessions: ModelSession[] = [];
    for (const held of this.held.values()) {
      if (held.state.running) {
        const { turn } = held.state.running;
        held.state = { ...held.state, running: undefined };
        this.record(held, { type: "turn_ended", turn, outcome: "interrupted", undelivered: [] });
      }
      this.interruptContinuation(held);
      await held.unsubscribe?.();
      held.unsubscribe = null;
      // The client's background tasks end with it: their rows say this stop
      // killed them, for the next start to tell.
      for (const id of held.clientTasks.keys())
        this.options.tasks.jobRows.markStoppedByQuit(id, held.task, this.now());
      held.clientTasks.clear();
      if (held.session) sessions.push(held.session);
      held.session = null;
      this.writeOut(held);
    }
    for (const session of sessions) session.dispose();
    await Promise.all(sessions.map((session) => session.closed().catch(() => undefined)));
  }

  private async order<C extends WorkOrderChannel>(
    channel: C,
    request: WorkOrderRequest<C>,
  ): Promise<WorkOrderResponse<C>> {
    if (channel === "inf:session:roster") return this.roster() as WorkOrderResponse<C>;
    if (channel === WORK_SAVE_ORDER) return this.saveForUpdate() as Promise<WorkOrderResponse<C>>;
    if (channel === WORK_RELEASE_ORDER)
      return this.releaseUpdate() as Promise<WorkOrderResponse<C>>;
    if (channel === "inf:session:personal")
      return keepOrdered(this.options.personal, request as never) as WorkOrderResponse<C>;
    // Outside the task's order of orders: an order waiting on the stuck turn never holds it.
    if (channel === "inf:session:answer-reads") {
      const [ask] = request as WorkOrderRequest<"inf:session:answer-reads">;
      const answered = (this.held.get(ask.task)?.openReads.answer(ask.through) ?? []).map(
        (read) => ({ tool: read.tool, waitedMs: Math.max(0, this.now() - read.since) }),
      );
      return { answered: answered.slice(0, 100) } as WorkOrderResponse<C>;
    }
    const [fields] = request as [{ task: string; orderId?: string }];
    if (channel === "inf:session:copy") {
      const [copy] = request as WorkOrderRequest<"inf:session:copy">;
      if (copy.refresh) await this.held.get(copy.task)?.session?.recordPath({ refresh: true });
      return this.options.tasks.copy(copy.task, copy.from) as WorkOrderResponse<C>;
    }
    if (channel === "inf:session:source-file") {
      const [piece] = request as WorkOrderRequest<"inf:session:source-file">;
      return this.options.tasks.sourceFile(piece) as Promise<WorkOrderResponse<C>>;
    }
    if (channel.startsWith("inf:working-copy:"))
      return this.workingCopy(channel, request) as Promise<WorkOrderResponse<C>>;
    const held = this.hold(fields.task);
    // A new order is news from the home: what it refused before goes again.
    held.refused = false;
    const run = held.chain.then(() => this.act(held, channel, request));
    held.chain = run.catch(() => undefined);
    return run as Promise<WorkOrderResponse<C>>;
  }

  private async act(held: Held, channel: WorkOrderChannel, request: unknown): Promise<unknown> {
    const [fields] = request as [{ orderId: string }];
    // Applied before: answered as it was, and nothing is done again.
    // A pending temporary-folder removal is not final, so it is tried again.
    if (channel !== "inf:session:open" && held.orders.has(fields.orderId)) {
      const remembered = held.orders.get(fields.orderId) as { status?: string } | undefined;
      if (!(channel === "inf:session:clean-temp" && remembered?.status === "pending")) {
        return remembered;
      }
      held.orders.delete(fields.orderId);
    }
    let answer: unknown;
    switch (channel) {
      case "inf:session:open": {
        const [open] = request as WorkOrderRequest<"inf:session:open">;
        try {
          const state = await this.open(held, open.spec);
          return state ? { state } : { needsOpen: true };
        } catch (caught) {
          // One that left no new conversation here says so, when asked, so
          // the home may pass its model over (`open-not-opened.md`).
          if (open.spec.notOpened && caught instanceof NothingOpened)
            return { notOpened: caught.message };
          throw caught instanceof NothingOpened ? caught.cause : caught;
        }
      }
      case "inf:session:prompt": {
        const [prompt] = request as WorkOrderRequest<"inf:session:prompt">;
        answer = this.prompt(held, prompt.orderId, prompt.text, prompt.images);
        break;
      }
      case "inf:session:steer": {
        const [steer] = request as WorkOrderRequest<"inf:session:steer">;
        const session = this.conversation(held);
        // A turn that ended took nothing: the home puts the words back on its
        // lane. Whether one runs is the live session's answer, so a turn the
        // crewmate carries on by itself takes them too (INF-2603).
        if (!held.state.running && !session.isStreaming()) answer = { delivered: false };
        else {
          await session.steer(steer.text, steer.images);
          answer = { delivered: true };
        }
        break;
      }
      case "inf:session:abort": {
        const [abort] = request as WorkOrderRequest<"inf:session:abort">;
        // Nothing open: nothing to do, now or when asked again.
        if (!held.session) return { ok: true };
        await held.session.abort(abort.failure);
        answer = { ok: true };
        break;
      }
      case "inf:session:detach":
        if (!held.session) return { ok: true };
        // A conversation in a turn, or carrying on by itself, keeps its client.
        if (!this.busy(held)) await held.session.detach();
        answer = { ok: true };
        break;
      case "inf:session:close": {
        const [close] = request as WorkOrderRequest<"inf:session:close">;
        const wasClosed = held.state.closed;
        const closeAndSweep = async () => {
          await this.closeTask(held);
          // Its stops run, and the programs holding its folders end, once its
          // conversation and commands are gone and before its folders go
          // (docs/leftover-programs.md, "On a computer that runs work").
          return !wasClosed && this.options.leftovers
            ? await this.options.leftovers(held.task, close).catch((error: unknown) => {
                this.options.log?.(
                  `could not stop what ${held.task} left running: ${error instanceof Error ? error.message : String(error)}`,
                );
                return undefined;
              })
            : undefined;
        };
        const leftovers =
          !wasClosed && this.options.closing
            ? await this.options.closing(held.task, closeAndSweep)
            : await closeAndSweep();
        answer = { ok: true, ...(leftovers ? { leftovers } : {}) };
        break;
      }
      case "inf:session:clean-files":
        if (held.session || held.opening || held.state.running || !held.state.closed)
          throw new Error("This task's conversation is not closed here yet.");
        answer = await this.options.tasks.removeLeftovers(held.task);
        break;
      case "inf:session:clean-temp":
        if (held.session || held.opening || held.state.running || !held.state.closed)
          throw new Error("This task's conversation is not closed here yet.");
        answer = await this.options.tasks.removeOwnedTemp(held.task);
        break;
      case "inf:session:remove":
        // Nothing is remembered: its orders go with its folder, and asked
        // again it finds nothing left to remove.
        this.removeTask(held);
        return { ok: true };
      case "inf:session:delete-outside": {
        // Nothing is remembered: asked again, it finds nothing left to replace.
        const [asked] = request as WorkOrderRequest<"inf:session:delete-outside">;
        return this.deleteOutside(held, asked);
      }
      default:
        throw new Error(`${channel} is not a request this computer answers.`);
    }
    this.remember(held, fields.orderId, answer);
    return answer;
  }

  /** An applied order and its answer, kept for this conversation's life. */
  private remember(held: Held, orderId: string, answer: unknown): void {
    if (held.orders.has(orderId)) return;
    held.orders.set(orderId, answer);
    this.options.tasks.applied(held.task, orderId, answer);
  }

  private roster(): WorkOrderResponse<"inf:session:roster"> {
    const open = [...this.held.values()].filter((held) => held.session).map((held) => held.task);
    const copies = this.options.copies;
    const tasks = new Set([...this.options.tasks.list(), ...open, ...(copies?.list() ?? [])]);
    const personal = this.options.personal?.held();
    return {
      tasksDir: this.options.tasks.tasksDir,
      ...(copies ? { worktreesDir: copies.worktreesDir } : {}),
      ...(this.options.commands ? { browsers: true } : {}),
      ...(personal ? { personal } : {}),
      tasks: [...tasks].sort().map((task) => {
        const held = this.hold(task);
        const state = held.session ? this.stateOf(held) : undefined;
        return {
          task,
          open: held.session !== null,
          closed: held.state.closed,
          ...(held.state.running ? { running: held.state.running } : {}),
          seq: held.state.seq,
          ...(state ? { state } : {}),
          ...(copies ? { workingCopy: copies.has(task) } : {}),
        };
      }),
    };
  }

  /**
   * An order about a task's working copy (docs/helper.md, "Its working
   * copies"). Those that act carry an id and are answered as they were when
   * asked again, but for a keep, which reads the working copy again; they
   * run beside the conversation's own orders, so a long clone or install
   * never holds a steer or an abort.
   */
  private async workingCopy(channel: WorkOrderChannel, request: unknown): Promise<unknown> {
    const copies = this.options.copies;
    if (!copies) throw new Error("This computer keeps no working copies.");
    switch (channel) {
      case "inf:working-copy:source-ref": {
        const [source] = request as WorkOrderRequest<"inf:working-copy:source-ref">;
        const file = `${this.options.tasks.folders(source.task).sourceCards}/${source.name}`;
        return copies.sourceRef(source, file);
      }
      case "inf:working-copy:revision": {
        const [{ task, headSha, builtOn }] =
          request as WorkOrderRequest<"inf:working-copy:revision">;
        return copies.revision(task, headSha, builtOn);
      }
      case "inf:working-copy:status": {
        const [{ task }] = request as WorkOrderRequest<"inf:working-copy:status">;
        return copies.status(task);
      }
      case "inf:working-copy:read": {
        const [{ task, ref, offset }] = request as WorkOrderRequest<"inf:working-copy:read">;
        return copies.read(task, ref, offset);
      }
      case "inf:working-copy:bundle": {
        const [{ task, ref, have, branch }] =
          request as WorkOrderRequest<"inf:working-copy:bundle">;
        return copies.bundle(task, ref, have, branch);
      }
      case "inf:working-copy:seed": {
        const [seed] = request as WorkOrderRequest<"inf:working-copy:seed">;
        return copies.seed(seed);
      }
      case "inf:working-copy:artifact": {
        const [piece] = request as WorkOrderRequest<"inf:working-copy:artifact">;
        return copies.artifact(piece);
      }
      default:
        break;
    }
    const [fields] = request as [{ task: string; orderId: string }];
    const held = this.hold(fields.task);
    const saved = held.orders.get(fields.orderId);
    const retryingPreparation = channel === "inf:working-copy:prepare" && preparationUnknown(saved);
    // A keep answers what the working copy holds now, which an earlier
    // version may have read short of its branch; keeping again what is
    // already kept answers the same commit.
    const keeping = channel === "inf:working-copy:keep";
    if (held.orders.has(fields.orderId) && !retryingPreparation && !keeping) return saved;
    const running = held.copying.get(fields.orderId);
    if (running) return running;
    const run = (async () => {
      let answer: unknown;
      switch (channel) {
        case "inf:working-copy:prepare": {
          const [prepare] = request as WorkOrderRequest<"inf:working-copy:prepare">;
          if (held.state.closed)
            throw new Error(
              "This task's conversation was closed here, so it takes no working copy.",
            );
          if (prepare.base && held.state.running)
            throw new Error("The conversation is running; its working copy cannot move yet.");
          // Persist uncertainty before any asynchronous preparation. After a
          // restart a failed reconciliation cannot prove the earlier work ended.
          this.remember(held, fields.orderId, { refused: "preparation-unknown" });
          try {
            answer = await copies.prepare(
              prepare.task,
              prepare.project,
              prepare.seed,
              prepare.base,
              prepare.branch,
            );
          } catch (caught) {
            // The host wants this computer's own sign-in: a typed answer, so
            // the home holds the task for it rather than reading the words
            // of a failure (docs/forge.md, "A computer's own sign-in").
            if (retryingPreparation) {
              answer = { refused: "preparation-unknown" };
              break;
            }
            if (!(caught instanceof ForgeAuthRequiredError)) {
              answer = {
                refused: "preparation-failed",
                message: cutText(caught instanceof Error ? caught.message : String(caught), 2000),
              };
              break;
            }
            const refused: WorkOrderResponse<"inf:working-copy:prepare"> = {
              refused: "forge-sign-in",
              host: caught.host,
              // A long server address fits the order's word; the home names the host itself.
              name: caught.place.slice(0, 64),
            };
            answer = refused;
          }
          break;
        }
        case "inf:working-copy:install":
          answer = await copies.install(held.task);
          break;
        case "inf:working-copy:keep":
          // Its conversation is closed for good first, so nothing changes the copy after.
          if (held.session || held.opening || held.state.running)
            throw new Error("This task's conversation is still open here.");
          answer = await copies.keep(held.task);
          break;
        case "inf:working-copy:retire": {
          const [retire] = request as WorkOrderRequest<"inf:working-copy:retire">;
          await copies.retire(held.task, retire.kept);
          answer = { ok: true };
          break;
        }
        case "inf:working-copy:move-out": {
          // Moving to another computer (docs/helper.md, "Moving a started
          // task"): only between turns, with nothing it started still
          // running, and the conversation let go, never closed, so the task
          // can run here again if the move does not finish.
          if (this.busy(held)) throw new Error("This task's conversation is in a turn here.");
          if (this.options.tasks.jobs(held.task).some((job) => !job.exit && !job.stoppedAt))
            throw new Error("A command this task started is still running here.");
          await this.releaseConversation(held);
          const [out] = request as WorkOrderRequest<"inf:working-copy:move-out">;
          answer = await copies.moveOut(held.task, this.movedFolders(held.task), out?.keep);
          break;
        }
        case "inf:working-copy:move-in": {
          const [move] = request as WorkOrderRequest<"inf:working-copy:move-in">;
          if (held.state.closed)
            throw new Error(
              "This task's earlier conversation here was closed and is not removed yet, so it takes no moved work.",
            );
          const sources = this.options.tasks.folders(held.task).sourceCards;
          answer = await copies.moveIn(
            move,
            {
              ...(move.bundle ? { bundle: join(sources, move.bundle.name) } : {}),
              ...(move.pack ? { pack: join(sources, move.pack.name) } : {}),
            },
            this.movedFolders(held.task),
          );
          break;
        }
        default:
          throw new Error(`${channel} is not a request this computer answers.`);
      }
      if ((channel === "inf:working-copy:prepare" && !preparationUnknown(answer)) || keeping)
        held.orders.delete(fields.orderId);
      this.remember(held, fields.orderId, answer);
      return answer;
    })();
    held.copying.set(fields.orderId, run);
    try {
      return await run;
    } finally {
      held.copying.delete(fields.orderId);
    }
  }

  /**
   * Opens the task's conversation from `spec`. A `reattach` open keeps only
   * the conversation held, running or idle with the same contract, and
   * otherwise opens nothing and answers undefined, so the home routes the
   * new conversation first (`reattach-only-open.md`).
   */
  private async open(held: Held, spec: PlacedSpec): Promise<PlacedState>;
  private async open(
    held: Held,
    spec: PlacedSpec,
    reattach: boolean,
  ): Promise<PlacedState | undefined>;
  private async open(
    held: Held,
    spec: PlacedSpec,
    reattach = spec.reattach === true,
  ): Promise<PlacedState | undefined> {
    if (held.state.closed)
      throw new Error("This task's conversation was closed here, so it opens no more.");
    const sourceFacts = sourceContext(await this.options.source?.(), spec.homeSource);
    if (this.stopped) throw new Error("This computer is stopping.");
    held.speed = spec.speed === true;
    if (held.opening) await held.opening;
    if (held.session) {
      // An idle conversation whose named tools, instructions or model
      // changed, because the home reopened it for a contract this computer
      // now speaks or routed it off a model that left, lets go and opens
      // again, so a version-gated tool arrives without a restart here. A turn in progress keeps the tools it
      // started with, and so does one its crewmate carries on by itself:
      // closing it would cut that turn and lose what it still sends, such
      // as a report waiting for the home. Its answer says it still streams,
      // and the home asks again once the turn ends (INF-2332). A reattach
      // keeps a held conversation on whatever model it runs, and answers it.
      // A fresh open never answers the one held: an idle one is let go of
      // and a new one opens, and one still in a turn opens nothing yet, so
      // the home asks again (`fresh-open.md`).
      if (spec.fresh && !reattach) {
        if (this.busy(held))
          throw new Error(
            "This task's conversation is still in a turn here, so its new one opens once that ends.",
          );
      } else if (this.busy(held) || !this.contractMoved(held, spec, sourceFacts, !reattach)) {
        this.recordJobs(held, true);
        return this.stateOf(held);
      }
      if (reattach) return undefined;
      await this.releaseConversation(held);
    } else if (reattach) return undefined;
    // Set while a conversation that began may still be held here.
    let lingering = false;
    let state: PlacedState | undefined;
    const opening = (async () => {
      const binding = await this.options.bind(spec.binding);
      const factory = this.options.factories[binding.backend];
      if (!factory) throw new Error(`This computer holds no ${binding.backend} conversations.`);
      if (this.options.copies && !this.options.copies.has(held.task))
        throw new Error("This task has no working copy here yet.");
      const folders = this.options.tasks.ensure(held.task);
      const instructions = `${spec.instructions}\n${sourceFacts}`;
      const personal = spec.personalResources
        ? this.options.personal?.forHome(this.options.homeChanges?.() ?? null)
        : undefined;
      // Pi records belong to this task's sessions folder, never a path a
      // home cached before an update. Claude's token is its session id.
      const token =
        spec.resume && binding.backend === "pi"
          ? join(folders.sessions, basename(spec.resume))
          : spec.resume;
      const resume = crewmateResume(token, binding.backend);
      // Its own browser, here beside its shell, when the home says it has
      // one, and its integrations and the files on the captain's other
      // computers, asked of the home, when it says it reaches them.
      const granted =
        spec.browser || spec.integrations || spec.load || spec.files || spec.secrets || spec.stops
          ? this.options.commands?.grant(held.task, {
              browser: spec.browser === true,
              ...(spec.load ? { load: true } : {}),
              ...(spec.stops ? { stops: true, keeps: spec.keeps } : {}),
              ...(spec.integrations ? { integrations: integrationsCommand(this.asks(held)) } : {}),
              ...(spec.files ? { files: filesCommand(this.asks(held)) } : {}),
              ...(spec.secrets ? { secretsCatalog: secretsCommand(this.asks(held)) } : {}),
              // Its uses, decided by the home and run here (docs/secrets.md, "On a computer that runs work").
              ...(spec.secrets && spec.secretUses && this.options.secretRunsDir
                ? { secrets: this.secretUsesOf(held, this.options.secretRunsDir, spec) }
                : {}),
            })
          : undefined;
      // An answer too long to read whole is saved here, beside its shell.
      const tools = serveAnswerFiles(
        held.openReads.serve(
          bindTools(
            (
              this.options.tools ?? CREWMATE_TOOLS.filter((tool) => FORWARDED_TOOLS.has(tool.name))
            ).filter((tool) => spec.tools.includes(tool.name)),
            {
              ...toolCallbacks(this.asks(held), folders, this.options),
              ...(granted?.browser ? { browser: granted.browser } : {}),
            },
          ),
        ),
        folders.temp,
      );
      const sessionSpec: SessionSpec = {
        machine: LOCAL_MACHINE_ID,
        owner: held.task,
        cwd: folders.work,
        binding,
        ...(spec.model ? { model: spec.model } : {}),
        speed: {
          requested: async (model) =>
            held.speed
              ? crewSpeedSchema.parse(
                  await this.call(held, "inf:work:speed", {
                    callId: randomUUID(),
                    model: { provider: model.provider, id: model.id },
                  }),
                )
              : "standard",
          record: (model, selection) => {
            if (!held.speed) return;
            void this.call(held, "inf:work:speed-note", {
              callId: randomUUID(),
              model: { provider: model.provider, id: model.id },
              selection,
            }).catch((error: unknown) =>
              this.log(`speed could not be recorded: ${messageOf(error)}`),
            );
          },
        },
        thinking: {
          level: spec.thinking.level,
          ...(spec.thinking.quick ? { quick: true } : {}),
        },
        instructions: { base: instructions },
        ...(spec.runbookSkills ? { runbookSkills: spec.runbookSkills } : {}),
        ...(spec.personalResources !== undefined
          ? { personalResources: spec.personalResources }
          : {}),
        ...(personal ? { personalRoot: personal.root } : {}),
        builtins: "coding",
        tools,
        ...(granted ? { shell: granted.shell } : {}),
        shape: {
          turns: "rolling",
          record: {
            dir: folders.sessions,
            ...(resume ? { resume } : {}),
            // Stamped here, on the tools this computer serves.
            stamp: crewmateContractStamp(instructions, tools),
          },
        },
        bounds: { request: { retries: spec.retries ?? RETRIES } },
      };
      const session = await factory.open(sessionSpec);
      // An open that fails once its conversation began lets it go, and says
      // it left nothing new here only once that let-go is over.
      try {
        if (this.stopped) throw new Error("This computer is stopping.");
        held.session = session;
        held.opened = {
          tools: spec.tools,
          instructions: spec.instructions,
          sourceContext: sourceFacts,
          browser: spec.browser === true,
          integrations: spec.integrations === true,
          load: spec.load === true,
          stops: spec.stops === true,
          files: spec.files === true,
          secrets: spec.secrets === true,
        };
        held.spec = spec;
        held.personal = personal?.held;
        held.backend = binding.backend;
        held.account = this.options.accounts?.of(binding);
        held.renewal = session.takeRenewal() ?? held.heldRenewal;
        held.heldRenewal = undefined;
        held.unsubscribe = await followCompletions(
          session,
          (event) => {
            // Work was admitted on this home's major, which includes folds:
            // its crewmate's directions go again.
            if (event.type === "context_compacted") {
              this.record(held, { type: "context_compacted" });
              return;
            }
            // A cut-off is a fact about the account that served the turn: this
            // computer's own, kept in its own store and never the home's.
            if (event.type === "turn_failed" && event.cutOff && held.account)
              this.options.accounts?.noteCutOff(held.account, event.cutOff);
            if (event.type === "background_work_changed") {
              // The home hears the count, as before; the tasks stay here.
              this.record(held, { type: "background_work_changed", count: event.count });
              // A client that ended (`count` unknown) took what it ran with it.
              if (event.count === undefined) this.clientEnded(held);
              else this.keepClientTasks(held, event.tasks ?? []);
              return;
            }
            this.record(held, event);
          },
          this.now,
          // The work major includes owner-only completed-operation observations.
          true,
          join(folders.root, "completions.sqlite"),
        );
        if (this.stopped) throw new Error("This computer is stopping.");
        this.recordJobs(held, true);
        state = this.stateOf(held);
      } catch (caught) {
        lingering = true;
        if (held.session === session) await this.releaseConversation(held);
        else session.dispose();
        lingering = false;
        throw caught;
      }
    })();
    held.opening = opening;
    try {
      await opening;
    } catch (caught) {
      throw lingering ? caught : new NothingOpened(caught);
    } finally {
      held.opening = null;
    }
    return state as PlacedState;
  }

  /**
   * Whether this open names tools or instructions the held conversation was
   * not opened with, a model it does not run, or an account of this computer's other
   * than the one it is bound to: the home routed it again off a model that
   * left every level, or off an account that does not serve it (docs/routing.md),
   * and an idle conversation opens again on the new one. Without
   * `withModel`, only the rest is compared.
   */
  private contractMoved(
    held: Held,
    spec: PlacedSpec,
    sourceFacts: string,
    withModel = true,
  ): boolean {
    const opened = held.opened;
    if (!opened) return false;
    const key = (model: { provider: string; id: string } | undefined) =>
      model ? `${model.provider}/${model.id}` : "";
    // The model the held conversation runs, as it says - one that says none
    // runs no model asked - when a model is asked; and the account it is
    // bound to, or none.
    const running = spec.model ? held.session?.modelRef() : held.spec?.model;
    return (
      (withModel &&
        (key(running) !== key(spec.model) ||
          (this.options.accounts !== undefined &&
            spec.binding.accountId !== undefined &&
            spec.binding.accountId !== held.account))) ||
      !sameNames(opened.tools, spec.tools) ||
      opened.instructions !== spec.instructions ||
      opened.sourceContext !== sourceFacts ||
      opened.browser !== (spec.browser === true) ||
      opened.integrations !== (spec.integrations === true) ||
      opened.load !== (spec.load === true) ||
      opened.stops !== (spec.stops === true) ||
      opened.files !== (spec.files === true) ||
      opened.secrets !== (spec.secrets === true)
    );
  }

  /**
   * Replaces the words from outside this conversation holds, once due
   * (`inf:session:delete-outside`; docs/helper.md, "Words from outside"):
   * its record and the Claude client's own files for it, only between its
   * turns and with nothing of its client's own still running. One open here
   * is let go of first, so no writer holds its files and nothing of them
   * stays in memory, and opened again from them as the home opened it.
   * The files from outside it names go from the hand-over folder first.
   */
  private async deleteOutside(
    held: Held,
    asked: WorkOrderRequest<"inf:session:delete-outside">[0],
  ): Promise<WorkOrderResponse<"inf:session:delete-outside">> {
    if (held.removed) return { status: "unchanged", files: [] };
    const folders = this.options.tasks.folders(held.task);
    // Files from outside in its hand-over folder go first, whatever its conversation is doing.
    for (const file of asked.files ?? [])
      await rm(join(folders.temp, HANDOVER_IN_DIR_NAME, file), { force: true });
    if (this.working(held)) return { status: "waiting", files: [] };
    const rule = dueRule(asked.kinds);
    const token = held.session ? crewmateResumeToken(held.session.resume()) : undefined;
    const claude = this.options.claudeConfigDir?.();
    const files = conversationFiles(
      { dir: folders.sessions, ...(token ? { token } : {}), cwd: folders.work },
      claude ? new ClaudeFiles(claude, true) : undefined,
    );
    const due: string[] = [];
    for (const file of files) if (await dueIn(file, rule, asked.legacy, undefined)) due.push(file);
    if (due.length === 0) return { status: "unchanged", files: [] };
    // A turn may have started while the files were read.
    if (this.working(held)) return { status: "waiting", files: [] };
    const session = held.session;
    const reopen =
      session && held.spec
        ? { spec: held.spec, resume: crewmateResumeToken(session.resume()), renewal: held.renewal }
        : undefined;
    if (session) await this.releaseConversation(held);
    const changed: string[] = [];
    let replaced = 0;
    for (const file of due) {
      const count = rewriteOutsideData(file, rule, asked.legacy);
      if (count === 0) continue;
      replaced += count;
      const name = relative(folders.sessions, file);
      if (name && !name.startsWith("..") && !isAbsolute(name))
        changed.push(name.split(sep).join("/"));
    }
    let state: PlacedState | undefined;
    // The home opens it again itself, after routing it (`reattach-only-open.md`).
    if (reopen && asked.holdReopen) {
      held.heldRenewal = reopen.renewal;
      return { status: replaced > 0 ? "changed" : "unchanged", files: changed, reopen: true };
    }
    if (reopen) {
      try {
        state = await this.open(held, {
          ...reopen.spec,
          ...(reopen.resume ? { resume: reopen.resume } : {}),
        });
        // The session it started over from earlier still stands until a turn of it finishes.
        held.renewal ??= reopen.renewal;
      } catch (error) {
        this.log(`${held.task}'s conversation did not open again: ${messageOf(error)}`);
      }
    }
    return {
      status: replaced > 0 ? "changed" : "unchanged",
      files: changed,
      ...(state ? { state } : {}),
    };
  }

  /**
   * Whether the conversation is working, as its live session says
   * (INF-2332): the session follows Claude's or Pi's own start and stop
   * signals, so it answers for a prompt's turn and for a turn the crewmate
   * carries on by itself alike. A prompt's turn this computer started counts
   * from its start until its end is written (`running`), which covers the
   * moment between the session settling and that end; an opening counts,
   * since what it opens is not known yet. No other note decides it.
   */
  private busy(held: Held): boolean {
    return (
      held.opening !== null ||
      held.state.running !== undefined ||
      held.session?.isStreaming() === true
    );
  }

  /** Working, or with work of its client's own running. */
  private working(held: Held): boolean {
    return this.busy(held) || held.clientTasks.size > 0;
  }

  /** The task's own folders a move carries, here (`workMove.ts`). */
  private movedFolders(task: string): MovedFolders {
    const folders = this.options.tasks.ensure(task);
    return {
      evidence: folders.evidence,
      "card-bodies": folders.cardBodies,
      "source-cards": folders.sourceCards,
      sessions: folders.sessions,
      handover: join(folders.temp, HANDOVER_IN_DIR_NAME),
    };
  }

  private async releaseConversation(held: Held): Promise<void> {
    await held.unsubscribe?.();
    held.unsubscribe = null;
    // A carried-on turn the home was told of ends with the session, after
    // this stopped listening: the home hears that end from here.
    this.interruptContinuation(held);
    const session = held.session;
    held.session = null;
    held.opened = undefined;
    held.renewal = undefined;
    held.backend = null;
    if (!session) return;
    // Its client ends now, and what it ran in the background with it.
    this.clientEnded(held);
    session.dispose();
    await session.closed().catch(() => undefined);
  }

  private prompt(
    held: Held,
    orderId: string,
    text: string,
    images: WorkOrderRequest<"inf:session:prompt">[0]["images"],
  ): { turn: number } {
    const session = this.conversation(held);
    if (held.state.running) throw new Error("A turn is already running here.");
    const turn = held.state.turn + 1;
    held.state = {
      ...held.state,
      turn,
      running: { turn, orderId },
    };
    this.record(held, { type: "turn_started", turn, orderId });
    this.writeOut(held);
    // Kept before the turn starts: asked again after a quit here, it is
    // answered and never started twice; that turn ended `interrupted`.
    this.remember(held, orderId, { turn });
    // Its home is updating this computer: the turn never reaches its model,
    // and the home sends its words again once the update is over.
    if (this.updateSave) {
      this.ended(held, turn, "failed", new StoppedBeforeStartError().message, true);
      return { turn };
    }
    held.turnOver = session.prompt(text, images).then(
      () => this.ended(held, turn, "done"),
      (error: unknown) =>
        this.ended(
          held,
          turn,
          "failed",
          messageOf(error),
          error instanceof StoppedBeforeStartError || undefined,
        ),
    );
    return { turn };
  }

  private ended(
    held: Held,
    turn: number,
    outcome: "done" | "failed",
    error?: string,
    unstarted?: true,
  ): void {
    // Closed, or this computer stopped, first: that turn already ended.
    if (held.state.running?.turn !== turn || !held.session) return;
    const undelivered = held.session.takeUndeliveredSteers();
    held.state = { ...held.state, running: undefined };
    // The home told the crewmate why with this turn's prompt, so a home
    // that opens it again later hears of no move.
    if (outcome === "done") held.renewal = undefined;
    this.record(held, {
      type: "turn_ended",
      turn,
      outcome,
      ...(error !== undefined ? { error } : {}),
      ...(unstarted ? { unstarted } : {}),
      undelivered,
      state: this.stateOf(held),
    });
    this.writeOut(held);
  }

  /**
   * Its home is about to update this computer (docs/helper.md, "Saving its
   * work before an update"): no turn starts here until the update ends this
   * run or the save is let go, and each conversation working here stops
   * where nothing is lost - its running calls finish and keep their
   * results, the ones it would start are refused and say so, and then its
   * turn is cut. Answers once every stopped turn's end is written here and
   * the home has every event, so what the crew did is kept on both sides
   * before anything here stops. A second ask joins the first. This
   * computer decides when it is saved, and lets the save go by itself when
   * the home says nothing for `UPDATE_RETURN_MS` after that.
   */
  private async saveForUpdate(): Promise<UpdateSaveAnswer> {
    let save = this.updateSave;
    if (!save) {
      const own: UpdateSave = {
        withdraw: new AbortController(),
        stopped: new Set(),
        stops: new Map(),
        saving: Promise.resolve(),
        timer: undefined,
      };
      this.updateSave = own;
      for (const held of this.held.values()) this.stopForUpdate(held, own);
      own.saving = this.saveTurns(own);
      save = own;
    }
    // Asked again: the home is still there, so the wait starts over.
    clearTimeout(save.timer);
    save.timer = undefined;
    await save.saving;
    if (this.updateSave === save && !this.stopped) {
      const own = save;
      own.timer = setTimeout(() => {
        if (this.updateSave !== own) return;
        // i18n-exempt: this computer's own log.
        this.log("its home did not update it after saving its work, so it carries on");
        void this.releaseUpdate();
      }, this.options.updateReturnMs ?? UPDATE_RETURN_MS);
      own.timer.unref?.();
    }
    return { stopped: [...save.stopped] };
  }

  /** Waits for every stop, then for the home to have every event written by then. */
  private async saveTurns(save: UpdateSave): Promise<void> {
    await Promise.all(save.stops.values());
    if (this.updateSave !== save) return;
    const kept = [...this.held.values()].filter((held) => !held.removed);
    await Promise.all(kept.map((held) => this.flushed(held)));
  }

  /**
   * One conversation working here stops for the update: safely when its
   * session can hold its calls, cut when it cannot. A turn the stop cut is
   * the save's, so its home carries it on after the update.
   */
  private stopForUpdate(held: Held, save: UpdateSave): void {
    const session = held.session;
    if (!session || held.state.closed || save.stops.has(held.task) || !this.busy(held)) return;
    const stopping = session.stopSafely
      ? session.stopSafely({ signal: save.withdraw.signal })
      : session.abort().then(() => "stopped" as const);
    save.stops.set(
      held.task,
      stopping
        .catch((caught: unknown) => {
          // i18n-exempt: this computer's own log.
          this.log(`could not stop ${held.task} safely: ${messageOf(caught)}`);
          return "stopped" as const;
        })
        .then(async (outcome) => {
          if (outcome !== "stopped") return;
          save.stopped.add(held.task);
          await held.turnOver;
        }),
    );
  }

  /**
   * The update did not replace this copy, or was let go: a stop still
   * waiting is withdrawn and its turn goes on as if never asked, and turns
   * start here again. Answers once each stop settled, naming every task
   * whose turn the save stopped, which its home carries on.
   */
  private async releaseUpdate(): Promise<UpdateSaveAnswer> {
    const save = this.updateSave;
    if (!save) return { stopped: [] };
    this.updateSave = undefined;
    clearTimeout(save.timer);
    save.withdraw.abort();
    await Promise.all(save.stops.values());
    return { stopped: [...save.stopped] };
  }

  private async closeTask(held: Held): Promise<void> {
    if (held.state.closed) return;
    if (held.opening) await held.opening.catch(() => undefined);
    if (held.state.running) {
      const { turn } = held.state.running;
      held.state = { ...held.state, running: undefined };
      this.record(held, { type: "turn_ended", turn, outcome: "interrupted", undelivered: [] });
    }
    held.state = { ...held.state, closed: true };
    this.writeOut(held);
    await held.unsubscribe?.();
    held.unsubscribe = null;
    const session = held.session;
    held.session = null;
    this.options.killJobs?.(held.task);
    // Its client's background tasks end with it, and nobody waits on them.
    this.keepClientTasks(held, []);
    // Its browser goes with it, copying a saved sign-in back as any stop
    // does, and its commands answer nothing more.
    this.options.commands?.close(held.task);
    // A program already started keeps running and still tells the home how it
    // ended; a report that arrives after the home hears this conversation
    // closed finds that use already ended as unknown.
    this.secretUses.delete(held.task);
    if (session) {
      session.dispose();
      await session.closed();
    }
  }

  /**
   * The task's folder goes, for a task its home no longer records here:
   * only once its conversation is closed for good and its working copy is
   * gone, so nothing it holds is still in use or holds work.
   */
  private removeTask(held: Held): void {
    const copies = this.options.copies;
    // Without working copies, the crewmate's working folder is inside it.
    if (!copies) throw new Error("This computer keeps a task's work in its folder.");
    if (held.session || held.opening || held.state.running)
      throw new Error("This task's conversation is still open here.");
    if (copies.has(held.task)) throw new Error("This task's working copy is still here.");
    const tasks = this.options.tasks;
    // No folder is one removed already, or never made.
    if (tasks.has(held.task) && !held.state.closed)
      throw new Error("This task's conversation is not closed here yet.");
    held.removed = true;
    held.outbox = [];
    held.unwritten = [];
    this.held.delete(held.task);
    // Nobody waits on events that are no longer anywhere.
    for (const flush of held.flushes.splice(0)) flush.resolve();
    tasks.remove(held.task);
  }

  /** The open conversation, or why an order for it cannot be done. */
  private conversation(held: Held): ModelSession {
    if (!held.session) throw new Error("No conversation is open for this task here.");
    return held.session;
  }

  private stateOf(held: Held): PlacedState {
    const session = this.conversation(held);
    const resume = crewmateResumeToken(session.resume());
    const record = recordName(this.options.tasks.folders(held.task).sessions, session.recordPath());
    const model = session.modelRef();
    const modelLabel = session.modelLabel();
    const reasoning = session.reasoning();
    return {
      sessionId: session.sessionId,
      backend: held.backend ?? "pi",
      controlProfile: session.controlProfile,
      streaming: session.isStreaming(),
      ...(resume ? { resume } : {}),
      ...(record ? { record } : {}),
      ...(model ? { model } : {}),
      ...(modelLabel ? { modelLabel } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(held.renewal ? { renewal: { ...held.renewal, changed: [...held.renewal.changed] } } : {}),
      ...(held.account ? { accountId: held.account } : {}),
      ...(held.personal ? { personal: held.personal } : {}),
    };
  }

  /**
   * The task's Secrets uses here: each asked of the home, which decides it and
   * hands an approved use's values once; never kept in a call's record.
   */
  private secretUsesOf(held: Held, runsDir: string, spec: PlacedSpec): SecretUsesThere {
    const catalog = secretsCommand(this.asks(held));
    const uses =
      this.secretUses.get(held.task) ??
      new SecretUsesThere({
        runsDir,
        environment: () => hostEnv(),
        home: {
          list: () => catalog.list(),
          use: async (input) =>
            placedSecretUseAnswerSchema.parse(
              await this.call(held, "inf:work:secret-use", { callId: randomUUID(), input }),
            ),
          take: async (request) =>
            placedSecretTakeAnswerSchema.parse(
              await this.call(held, "inf:work:secret-take", { callId: randomUUID(), request }),
            ),
        },
      });
    this.secretUses.set(held.task, uses);
    // Its asks to keep a secret, raised on the home's own card, while the home takes them.
    uses.offerAsks(
      spec.secretAsks
        ? async (input) =>
            placedSecretAskAnswerSchema.parse(
              await this.call(held, "inf:work:secret-ask", { callId: randomUUID(), input }),
            )
        : undefined,
      listsChange(this.options.homeChanges?.() ?? null, SECRET_ASK_HOW),
    );
    return uses;
  }

  /**
   * One deadline spans all requests in a callback, including its asset transfers.
   * The tool's own cancellation, when it passed one, ends them too.
   */
  private async withDeadline<T>(
    channel: WorkInvokeChannel,
    run: (signal: AbortSignal) => Promise<T>,
    toolSignal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLACED_REQUEST_WAIT_MS);
    const signal = toolSignal
      ? AbortSignal.any([controller.signal, toolSignal])
      : controller.signal;
    try {
      return await run(signal);
    } catch (error) {
      if (!signal.aborted) throw error;
      const days = PLACED_REQUEST_WAIT_MS / (24 * 60 * 60 * 1000);
      const ended = controller.signal.aborted
        ? `The request waited ${days} days for ${HOME.the}`
        : `The conversation stopped waiting for ${HOME.the}`;
      const sent = error instanceof WorkRequestAbortedError && error.everSent;
      if (invokeContract[channel].effect === "read")
        throw new Error(
          sent
            ? `${ended}; the request was sent, but its answer did not arrive. You can ask for the read again.`
            : `${ended}; the request was not sent. It will not be sent when ${HOME.the} returns. You can ask again.`,
        );
      throw sent
        ? new OutcomeUnknownError(
            `${ended}; the change may already be done. ${changeRecoveryCheck(channel)}`,
          )
        : new Error(
            `${ended}; the change was not sent. It will not be sent when ${HOME.the} returns. You can ask again.`,
          );
    } finally {
      clearTimeout(timer);
    }
  }

  /** This task's requests of its home, which its tools and commands here ask through (`toolCallbacks`). */
  private asks(held: Held): TaskAsks {
    return {
      task: held.task,
      call: (channel, fields, signal) => this.call(held, channel, fields, signal),
      withDeadline: (channel, run, toolSignal) => this.withDeadline(channel, run, toolSignal),
      log: (line) => this.log(line),
    };
  }

  /** One work request, after prior events reach the home, within its callback's deadline. */
  private async call(
    held: Held,
    channel: WorkInvokeChannel,
    fields: object,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!signal)
      return this.withDeadline(channel, (deadline) => this.call(held, channel, fields, deadline));
    signal.throwIfAborted();
    await this.flushed(held, signal);
    signal.throwIfAborted();
    try {
      return await this.options.ask(channel, [{ task: held.task, ...fields }], signal);
    } catch (error) {
      if (!(error instanceof WorkRequestAbortedError)) throw error;
      const finalRequest = !requestRepeatsSafely(channel);
      throw new WorkRequestAbortedError(finalRequest && error.everSent, error.cause);
    }
  }

  private hold(task: string): Held {
    return this.held.get(task) ?? this.load(task);
  }

  private load(task: string): Held {
    const tasks = this.options.tasks;
    const state = tasks.state(task);
    const outbox = tasks.outbox(task, state.kept);
    const seq = Math.max(state.seq, outbox.at(-1)?.seq ?? 0, state.kept);
    // Older folders have the boundaries in their outbox but no state flag yet.
    const continuing = outbox.reduce(
      (active, { event }) =>
        event.type === "continuation_started"
          ? true
          : event.type === "continuation_ended"
            ? false
            : active,
      state.continuing === true,
    );
    const held: Held = {
      task,
      state: { ...state, seq, continuing: continuing ? true : undefined },
      session: null,
      speed: false,
      backend: null,
      jobs: undefined,
      jobId: undefined,
      clientTasks: new Map(),
      // Marked by event number: the home names reads by the events it has taken.
      openReads: new OpenReads(this.now, () => held.state.seq),
      account: undefined,
      renewal: undefined,
      opening: null,
      unsubscribe: null,
      orders: tasks.orders(task),
      outbox,
      unwritten: [],
      through: state.kept,
      sending: false,
      refused: false,
      flushes: [],
      chain: Promise.resolve(),
      turnOver: undefined,
      copying: new Map(),
      removed: false,
      opened: undefined,
      spec: undefined,
    };
    this.held.set(task, held);
    return held;
  }

  /**
   * This computer owns the terminal boundary when its client cannot send
   * one: at a start after a quit or crash, at its own stop, and when it lets
   * the session go. A home on this contract also reads the roster's live
   * answer and ends such a turn itself; an older home reads only this end.
   */
  private interruptContinuation(held: Held): void {
    if (held.state.closed || !held.state.continuing) return;
    this.record(held, {
      type: "continuation_ended",
      interrupted: true,
      // Older homes can still read a plain error when they ignore the new marker.
      error: "Work stopped before the turn finished.",
    });
  }

  /** One thing the conversation did, numbered, kept until the home keeps it, and sent. */
  private record(held: Held, event: SessionEvent | PlacedEvent): void {
    const seq = held.state.seq + 1;
    held.state = {
      ...held.state,
      seq,
      ...(event.type === "continuation_started" ? { continuing: true as const } : {}),
      ...(event.type === "continuation_ended" ? { continuing: undefined } : {}),
    };
    const record: PlacedEventRecord = { seq, at: this.now(), event: event as PlacedEvent };
    held.outbox.push(record);
    held.unwritten.push(record);
    // Keep the boundary even if the home acknowledges and trims its outbox entry.
    if (event.type === "continuation_started" || event.type === "continuation_ended")
      this.writeOut(held);
    // A burst of words is one write.
    if (!this.writeTimer)
      this.writeTimer = setImmediate(() => {
        this.writeTimer = undefined;
        for (const each of this.held.values()) this.writeEvents(each);
      });
    this.pump(held);
  }

  private writeEvents(held: Held): void {
    if (held.unwritten.length === 0 || held.removed) return;
    const records = held.unwritten;
    held.unwritten = [];
    try {
      this.options.tasks.append(held.task, records);
    } catch (error) {
      this.log(`could not keep ${held.task}'s events: ${messageOf(error)}`);
    }
  }

  /** The events and the state, on disk now. */
  private writeOut(held: Held): void {
    if (held.removed) return;
    this.writeEvents(held);
    try {
      this.options.tasks.writeState(held.task, held.state);
    } catch (error) {
      this.log(`could not keep ${held.task}'s state: ${messageOf(error)}`);
    }
  }

  /** Sends the next events the home does not have, one request at a time. */
  private pump(held: Held): void {
    if (held.sending || held.refused || held.removed || this.stopped || !this.live) return;
    const from = Math.max(held.through, held.state.kept);
    const batch = held.outbox
      .filter((record) => record.seq > from)
      .slice(0, PLACED_EVENTS_MAX_PER_REQUEST);
    if (batch.length === 0) {
      this.settleFlushes(held);
      return;
    }
    // On disk before it is sent: what the home has not kept survives a quit.
    this.writeEvents(held);
    held.sending = true;
    this.options
      .ask("inf:work:events", [{ task: held.task, events: batch }])
      .then(
        (raw) => {
          // Stopping first: the run that starts next from this folder may
          // already have gone on, so this answer writes nothing over it; that
          // run sends again what the home had not kept, and the home skips
          // what it has (INF-151).
          if (held.removed || this.stopped) return;
          const answer = placedEventsAnswerSchema.parse(raw);
          held.through = Math.min(answer.through, held.state.seq);
          const kept = Math.min(answer.kept, held.state.seq);
          if (kept > held.state.kept) {
            held.state = { ...held.state, kept };
            held.outbox = held.outbox.filter((record) => record.seq > kept);
            this.writeEvents(held);
            try {
              this.options.tasks.trim(held.task, kept);
              this.options.tasks.writeState(held.task, held.state);
            } catch (error) {
              this.log(`could not forget ${held.task}'s kept events: ${messageOf(error)}`);
            }
          }
        },
        (error: unknown) => {
          if (this.stopped) return;
          held.refused = true;
          this.log(`the home refused ${held.task}'s events: ${messageOf(error)}`);
          if (held.state.closed) this.letGoOfEvents(held);
        },
      )
      .finally(() => {
        held.sending = false;
        this.settleFlushes(held);
        this.pump(held);
      });
  }

  /**
   * The home refused the events of a conversation it closed here for good,
   * and it takes no event of a task it closed: they go, from memory and from
   * the outbox, so no welcome or later start sends them again (INF-2080).
   * A refusal of an open conversation's events may pass, so those wait.
   */
  private letGoOfEvents(held: Held): void {
    if (held.removed) return;
    held.outbox = [];
    held.unwritten = [];
    try {
      this.options.tasks.trim(held.task, held.state.seq);
    } catch (error) {
      this.log(`could not let go of ${held.task}'s refused events: ${messageOf(error)}`);
    }
  }

  /** Resolves once the home has every event written before now, or refused them. */
  private flushed(held: Held, signal?: AbortSignal): Promise<void> {
    const seq = held.state.seq;
    if (held.through >= seq || held.refused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const abort = () => {
        held.flushes = held.flushes.filter((entry) => entry !== flush);
        reject(signal?.reason);
      };
      const flush = {
        seq,
        resolve: () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        },
      };
      signal?.addEventListener("abort", abort, { once: true });
      held.flushes.push(flush);
      this.pump(held);
    });
  }

  private settleFlushes(held: Held): void {
    const waiting = held.flushes;
    held.flushes = [];
    for (const flush of waiting) {
      if (held.refused || held.through >= flush.seq) flush.resolve();
      else held.flushes.push(flush);
    }
  }
}

/** A record's path under its task's `sessions` folder, slash-separated; none outside it. */
function recordName(sessions: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const name = relative(sessions, path);
  if (!name || name.startsWith("..") || isAbsolute(name)) return undefined;
  return name.split(sep).join("/");
}

function preparationUnknown(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "refused" in value &&
    value.refused === "preparation-unknown"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
