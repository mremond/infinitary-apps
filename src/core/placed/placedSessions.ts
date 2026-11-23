import { existsSync, renameSync, statSync } from "node:fs";
import {
  speaksChangePresentations,
  speaksKnowledge,
  speaksSeed,
  speaksTempCleanup,
} from "@shared/contractFeatures";
import { COMPUTER, HERE, PLACE_SAID } from "@shared/deviceNames";
import { awayWord, type ComputerReach } from "@shared/devices";
import type { FmEvent } from "@shared/events";
import { said, saidLine } from "@shared/i18n/said";
import type { InvokeRequest, InvokeResponse, WorkInvokeChannel } from "@shared/ipc";
import { keepsAtClose, leftoversOf } from "@shared/leftoverPrograms";
import type { ComputerSignIns, signInPlace } from "@shared/signIns";
import {
  type PlacedEventRecord,
  type PlacedRosterTask,
  type PlacedSpec,
  type PlacedState,
  placedSpecSchema,
  placedTaskFolders,
  type WorkingCopyBase,
  type WorkOrderChannel,
  type WorkOrderResponse,
  workOrders,
} from "@shared/work";
import { DeviceOutOfReachError, type WorkDeviceContact } from "../connection/connection";
import {
  type ContractChangeName,
  contractChange,
  listsChange,
} from "../connection/contractChanges";
import {
  dueRule,
  type OutsideDue,
  type PlacedOutsideVisit,
  rewriteOutsideData,
} from "../integrations";
import { crewmateResumeToken } from "../orchestrator/crewSession";
import { type AppPaths, crewmatePlacedDir, crewmateSessionsDir } from "../paths";
import { errorText } from "../personal/errorText";
import type { ComputerPool } from "../routing/computerPool";
import type { PersonalVersion } from "../session/personalSet";
import type {
  ControlProfile,
  ModelSession,
  SessionBackend,
  SessionFactories,
  SessionFactory,
  SessionSpec,
} from "../session/session";
import type { SecretUsesElsewhere } from "../session/tools";
import type { TaskRecord, TaskRetentionFields } from "../storage/taskRecords";
import { type KeptJobs, keptJobsAt } from "../tasks/keptJobs";
import { noteLeftovers, openSuccessor } from "../tasks/leftoverPrograms";
import { TaskService } from "../tasks/taskService";
import type { DependencyInstall } from "../workspace/workspaceService";
import {
  type AnsweredWait,
  type CrewMachines,
  FRESH_OPEN,
  NeedsNewConversation,
  NothingOpenedThere,
  NotOpenThere,
  OPEN_NOT_OPENED,
  type PlacedBrowserSink,
  type PlacedHost,
  REATTACH_ONLY_OPEN,
} from "./crewMachines";
import { type HomePersonal, PersonalSync } from "./personalSync";
import { accountKey, PlacedAccounts, type PlacedAccountsOptions } from "./placedAccounts";
import { answerCall, type CallbackReach, NotHeldHere, replayReport } from "./placedCallbacks";
import { PlacedCopies, type PlacedCopy } from "./placedCopies";
import { type CallLine, PlacedLedger, reportOf } from "./placedLedger";
import { metCutOff, PlacedSession, working } from "./placedSession";
import {
  askReopen,
  confirmedSpec,
  type OpenOutcome,
  openOutcome,
  type ReopenProgress,
  reopenedSpec,
  sameModel,
  withToolsNow,
} from "./placedSpecs";
import { NO_PLACED_TASK, type PlacedWork } from "./placedWork";
import { RecordCopy } from "./recordCopy";
import { sendSourceFile } from "./sourceFiles";
import type { WorkDevices } from "./workDevices";

/**
 * The home's side of a crewmate's conversation held on a computer that runs
 * work (docs/helper.md, "Holding a conversation"; src/shared/work.ts).
 *
 * - **Factories.** One `SessionFactory` per backend for each such computer
 *   (`factories(deviceId)`), presenting the backend it runs there, so no
 *   third backend exists. Each opens a `PlacedSession`: the conversation
 *   runs there, with the crewmate's tools, and this Mac drives it by orders.
 * - **Work requests.** What the computer asks about a task it holds for this
 *   home (`answer`): each tool callback is done here exactly as for a
 *   crewmate of this Mac, by the callbacks its session was opened with, and
 *   its answer is kept in `crewmates/<task>/placed/calls.jsonl` before it is
 *   returned, so a callback asked again after a drop is answered from there.
 *   The numbered events are taken in order once each, and the newest the
 *   home keeps for good is saved in `crewmates/<task>/placed/state.json` at
 *   every model turn's end. A request about a task this Mac does not record
 *   on that computer is refused.
 * - **Lost contact.** A task's computer out of reach, or back and not yet
 *   caught up, holds the task (`ready`): its lane waits and nothing calls it
 *   stuck. Once back, the computer's roster is read: a turn it runs that
 *   this Mac does not follow - after a restart here - is adopted, a closed
 *   record's conversation is closed there, and orders it could not be asked
 *   go now under their own ids. The feed says when a computer has been out
 *   of reach for a minute and when its work caught up.
 *
 * Nothing here reaches a computer before the shell attaches the connection
 * (`WorkDevices`). What the crew reads of it is `CrewMachines`
 * (`crewMachines.ts`); the callbacks are answered in `placedCallbacks.ts`,
 * kept in `placedLedger.ts`, the record copied home in `recordCopy.ts`, and
 * the computer's own accounts read in `placedAccounts.ts`.
 */

/** Uses of this Mac's Secrets whose programs run on that computer (`secret-uses-elsewhere.md`). */
const SECRET_USES_ELSEWHERE = contractChange("secret-uses-elsewhere");
/** Asks to keep a secret raised on this Mac for a task there (`secret-asks-elsewhere.md`). */
const SECRET_ASKS_ELSEWHERE = contractChange("secret-asks-elsewhere");

/** Jobs the captain asked to keep running past a close (`kept-jobs.md`). */
const KEPT_JOBS = contractChange("kept-jobs");

/** How long a computer with work is out of reach before the feed says so. */
const OUT_OF_REACH_LINE_MS = 60_000;
export type PlacedSessionsOptions = {
  /**
   * Waited on before a computer is told what was kept, which it then
   * forgets (docs/devices.md, "Before an act that cannot be undone").
   */
  beforeKept?: () => Promise<void>;
  tasks: TaskService;
  paths: AppPaths;
  devices: WorkDevices;
  /**
   * Whether a computer on the list runs as another user on this Mac
   * (`DevicePairing.onThisMac`): its crewmates keep no job, which would run
   * as that user. Absent, none may keep one.
   */
  onThisMac?: (deviceId: string) => boolean;
  /** The home's record of kept jobs, at `<userData>/kept` when absent (docs/leftover-programs.md). */
  keptJobs?: KeptJobs;
  /** Each backend's control plane on this Mac, which it presents from there. */
  profiles: { pi: ControlProfile; claude?: ControlProfile };
  /** A paired computer's name, as Devices lists it. */
  deviceName: (deviceId: string) => string | undefined;
  /** The computers that run work on the list, by device id; absent, none. */
  computers?: () => readonly string[];
  /** How the home's words place a paired computer (`devicePlace`); absent, by its name alone. */
  devicePlace?: (deviceId: string) => ReturnType<typeof signInPlace>;
  /** A project's name, by its id. */
  projectName: (repoId: string) => string | undefined;
  /**
   * The home's repository for a task's work: its project's, or this Mac's
   * own local workspace for a task with none. A placed task's branch and
   * kept work are brought into it (`PlacedCopies`).
   */
  homeRepo?: (repoId: string | null) => Promise<string | undefined>;
  /** Fetches a home repository's default branch before starting work crosses (`PlacedCopies`). */
  refreshDefaultBranch?: (repoDir: string) => Promise<unknown>;
  /** Words refusing a branch whose project's folder here is missing (`PlacedCopies`, INF-572). */
  folderMissing?: (repoId: string, taskId: string) => string;
  /** A project's saved address, cloned from while its folder here is missing (`PlacedCopies`). */
  projectOrigin?: (repoId: string) => string | null | undefined;
  /** Every project's id, to find the one a leftover working copy there was cloned from. */
  projects?: () => readonly string[];
  /**
   * Asks a computer its sign-ins again and resolves once it answered or
   * could not (`DeviceSignIns.refresh`): before a turn there that met a
   * cut-off ends here, so the turn ends held.
   */
  refreshSignIns?: (deviceId: string) => Promise<boolean>;
  /**
   * Whether Firstmate on a computer runs work for another Firstmate now, as
   * this Mac's own SSH connection to it found (`runsForAnotherFirstmate`):
   * its work never catches up here, and removing it here stops that work.
   * Absent, none does.
   */
  runsForAnotherFirstmate?: (deviceId: string) => boolean;
  /** Reach (`reachFrom`) and a followed update (`Computers.updatingOf`): the minute's line waits on either. */
  reachOf?: (deviceId: string) => ComputerReach;
  updatingOf?: (deviceId: string) => boolean;
  /**
   * Where what a task's browser on a computer tells this Mac goes
   * (docs/task-browser.md, "On another computer"): its fact, its pictures
   * and what it has this Mac do once. Read when it arrives, since the
   * browsers are composed after the conversations; absent, nothing there
   * is heard.
   */
  browsers?: () => PlacedBrowserSink | undefined;
  /**
   * A computer went out of reach, came back, or caught up: whether its
   * tasks wait on it moved, which their Tasks rows say (`TaskView.place`).
   */
  reachMoved?: () => void;
  broadcastEvent: (event: FmEvent) => void;
  now: () => number;
  /** One-shot copy delay; answers its own cancel. Tests drive it with the same clock as now. */
  schedule?: (ms: number, run: () => void) => () => void;
  log?: (line: string) => void;
  /**
   * The home's personal instructions and skills, kept on each computer when
   * the switch is on (`PersonalSync`); absent, none is sent.
   */
  personal?: HomePersonal;
} & Pick<PlacedAccountsOptions, "signIns" | "saidSignIns" | "catalogModels">;

type Roster = {
  tasksDir: string;
  /** Where its working copies are; absent from a computer that keeps none. */
  worktreesDir?: string;
  tasks: Map<string, PlacedRosterTask>;
  /** It keeps its tasks' own browsers (docs/task-browser.md, "On another computer"). */
  browsers: boolean;
};

type Device = {
  readonly id: string;
  /** Read once each time it comes into reach. */
  roster: Roster | undefined;
  /** Each contact counts, so a roster from an earlier one is let go. */
  contact: number;
  /** Since when it has been out of reach, or since this Mac started without it. */
  goneSince: number;
  /** When the contact that brought it back came; undefined while it is out of reach. */
  reachedAt: number | undefined;
  /** The feed said it went, so it says when its work caught up. */
  saidGone: boolean;
  /** Resolves once this contact's roster is read: what it asks first waits for it. */
  rostered: Promise<void>;
  rosterRead: () => void;
};

type Placed = {
  readonly task: string;
  readonly deviceId: string;
  /** The newest event taken in. */
  through: number;
  /** The newest event kept for good, at a model turn's end. */
  kept: number;
  /** The newest turn's end kept. */
  ended: number;
  session: PlacedSession | undefined;
  /** The conversation is being opened on this Mac for an ask that came first. */
  adopting: Promise<void> | undefined;
  /** When that opening began. */
  adoptingSince: number | undefined;
  /** Opens asked there and not yet answered. */
  asking: number;
  /** A cleanup of words from outside under way there, which an open waits for. */
  cleaning: Promise<void> | undefined;
  /**
   * An open there again (`reopen`) under way, which a prompt or steer waits
   * for: true once that computer confirmed the conversation open.
   */
  reopening: Promise<boolean> | undefined;
  /** What the home keeps of it: each callback's answer, each change begun, its place. */
  readonly ledger: PlacedLedger;
  calling: Map<string, Promise<unknown>>;
  /** One events request at a time, in order. */
  chain: Promise<unknown>;
  /** Reports answered since the last kept turn's end, given again to an adopting turn. */
  replays: CallLine[];
  /** The existing event lane waits for adopting report callbacks to commit. */
  replaying?: Promise<void>;
  /** It was caught up the last time the lane was let go. */
  released: boolean;
  /** Close was asked of the computer, and answered. */
  closed: boolean;
  /** Calls announced by the computer whose results have not arrived yet. */
  openCalls: Set<string>;
  /** Claude calls that ended there this turn, whose results this Mac's copy may still lack. */
  endedCalls: Set<string>;
  /** This Mac's copy of its conversation's record. */
  readonly record: RecordCopy;
  /** What its session was opened with, to open it there again after that computer restarts. */
  spec: PlacedSpec | undefined;
  /**
   * The computer's newest answer about this conversation (INF-2332): whether
   * its live session works, and how many events it had counted then. It is
   * compared once the home has taken exactly that many, then dropped.
   */
  said: { seq: number; working: boolean } | undefined;
  /**
   * An open asked there while its conversation worked: that computer kept
   * the conversation as it was, so the home asks again once the turn ends
   * here (INF-2332).
   */
  reopenOwed: boolean;
};

const rosterSchema = workOrders["inf:session:roster"].response;

const openAnswerSchema = workOrders["inf:session:open"].response;

export class PlacedSessions implements PlacedWork, CrewMachines {
  /** The tasks' working copies on those computers (docs/helper.md, "Its working copies"). */
  readonly copies: PlacedCopies;
  private readonly devices = new Map<string, Device>();
  private readonly placed = new Map<string, Placed>();
  private readonly closing = new Set<Promise<void>>();
  private readonly stopTaskChanges: () => void;
  private readonly stopContacts: () => void;
  private stoppingCopies: Promise<void> | undefined;
  /**
   * Each task's Secrets uses on the computer that runs it, as its session
   * last named them: a program that ends while its task closes is still
   * heard, and once its conversation there is gone its uses end, so a
   * program that outlives its task records `unknown`.
   */
  private readonly secretUses = new Map<string, SecretUsesElsewhere>();
  private host: PlacedHost | undefined;
  private readonly startedAt: number;
  private readonly log: (line: string) => void;
  /** The computers' own sign-ins and accounts, as each last said. */
  private readonly accounts: PlacedAccounts;
  /** What answering a callback reads of this side. */
  private readonly callbackReach: CallbackReach;
  /** The home's record of the jobs closes kept running, here and there (`KeptJobs`). */
  readonly keptJobs: KeptJobs;
  /** The home's personal set on each computer (docs/personal-resources.md). */
  private readonly personal: PersonalSync | undefined;

  constructor(private readonly options: PlacedSessionsOptions) {
    this.startedAt = options.now();
    this.keptJobs = options.keptJobs ?? keptJobsAt(options.paths.crewmatesDir, options.now);
    this.log = options.log ?? ((line) => console.warn(`[placed] ${line}`));
    this.copies = new PlacedCopies({
      tasks: options.tasks,
      devices: options.devices,
      paths: options.paths,
      homeRepo: options.homeRepo ?? (async () => undefined),
      ...(options.refreshDefaultBranch
        ? { refreshDefaultBranch: options.refreshDefaultBranch }
        : {}),
      ...(options.folderMissing ? { folderMissing: options.folderMissing } : {}),
      ...(options.projectOrigin ? { projectOrigin: options.projectOrigin } : {}),
      projects: options.projects ?? (() => []),
      deviceName: (deviceId) => this.nameOf(deviceId),
      projectName: options.projectName,
      broadcastEvent: options.broadcastEvent,
      now: options.now,
      log: this.log,
      closeThere: (deviceId, task, orderId) => this.closeThere(deviceId, task, orderId),
      awayCopyKept: (taskId) => this.host?.awayCopyKept?.(taskId),
      copyRecordThere: (deviceId, task) => this.copyRecordThere(deviceId, task),
    });
    this.accounts = new PlacedAccounts({
      ...options,
      placeOf: (deviceId) => this.placeOf(deviceId),
    });
    this.personal = options.personal
      ? new PersonalSync({ devices: options.devices, personal: options.personal, log: this.log })
      : undefined;
    options.personal?.onChange(() => void this.bringPersonal());
    this.callbackReach = {
      paths: options.paths,
      host: () => this.host,
      browsers: () => options.browsers?.(),
      takesSharedCards: (deviceId) => this.takesSharedCards(deviceId),
      takesCheckDeclarations: (deviceId) => this.takesCheckDeclarations(deviceId),
    };
    this.stopContacts = options.devices.onWorkDevice((contact) => this.contact(contact));
    // A record that closes closes its conversation there; one that goes - a start that failed,
    // a purge - leaves what it had there to the leftover rule (`PlacedCopies.retireLeftover`).
    this.stopTaskChanges = options.tasks.onChange((change) => {
      for (const taskId of change.taskIds) {
        this.closeIfClosed(taskId);
        this.removeAwayCopiesIfClosed(taskId);
      }
      if (change.removed.length > 0 || change.reset) this.sweepLeftovers();
    });
  }

  /** Stop taking new close and reconnect work, then finish the closes and copy queues already owed. */
  stopCopies(): Promise<void> {
    if (this.stoppingCopies) return this.stoppingCopies;
    this.stopTaskChanges();
    this.stopContacts();
    this.stoppingCopies = Promise.all(this.closing).then(() => this.copies.stop());
    return this.stoppingCopies;
  }

  /** The supervisor, once it exists. */
  serve(host: PlacedHost): void {
    this.host = host;
  }

  // ---- the crew's side ------------------------------------------------------

  factories(machine: string): SessionFactories | undefined {
    const claude = this.factory(machine, "claude");
    return { pi: this.factory(machine, "pi") as SessionFactory, ...(claude ? { claude } : {}) };
  }

  folders(machine: string, taskId: string): ReturnType<typeof placedTaskFolders> | undefined {
    const roster = this.devices.get(machine)?.roster;
    return roster ? placedTaskFolders(roster.tasksDir, taskId, roster.worktreesDir) : undefined;
  }

  keepsBrowsers(machine: string): boolean {
    return this.devices.get(machine)?.roster?.browsers === true;
  }

  takesRepoless(machine: string): boolean {
    const version = this.options.devices.version(machine);
    return version ? speaksSeed(version.contract) : true;
  }

  takesChangePresentations(machine: string): boolean {
    const version = this.options.devices.version(machine);
    return version ? speaksChangePresentations(version.contract) : false;
  }

  /**
   * Whether the computer serves show_merge_card: every one admitted to work
   * on this major does, and one on another major keeps the three calls.
   */
  takesMergeCardCall(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  takesCheckDeclarations(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  takesResults(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  listsChange(machine: string, change: ContractChangeName): boolean {
    return listsChange(this.options.devices.version(machine)?.changes, change);
  }

  takesResponses(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  takesSharedCards(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  reportsFolds(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  takesKnowledge(machine: string): boolean {
    const version = this.options.devices.version(machine);
    return version ? speaksKnowledge(version.contract) : false;
  }

  /**
   * The integrations command rides the computer's task channel, which it has
   * where its roster says it keeps task browsers, and its calls ride the
   * work requests included on this contract major.
   */
  takesIntegrations(machine: string): boolean {
    return this.keepsBrowsers(machine) && this.options.devices.takesCurrentWork(machine);
  }

  /**
   * The files command rides the computer's task channel too, and its lists
   * and copies ride the work requests of this contract major (docs/files.md).
   */
  takesFiles(machine: string): boolean {
    return this.takesIntegrations(machine) && this.answersFiles(machine);
  }

  /**
   * The stops command rides the computer's task channel too, and the close
   * order there runs the stops and answers what it did (docs/leftover-programs.md).
   */
  takesStops(machine: string): boolean {
    return this.keepsBrowsers(machine) && this.listsStops(machine);
  }

  /**
   * Whether the computer's crewmates may keep a job past the close
   * (docs/leftover-programs.md, "A job the captain asked to keep"): one
   * that runs as another user on this Mac may not, since the job would run
   * as that user (false, which its crewmate hears as that refusal), and one
   * without the change cannot (undefined).
   */
  takesKeeps(machine: string): boolean | undefined {
    if (
      !this.takesStops(machine) ||
      !this.options.onThisMac ||
      !listsChange(this.options.devices.version(machine)?.changes, KEPT_JOBS)
    )
      return undefined;
    return !this.options.onThisMac(machine);
  }

  /** Whether the computer's emit_card takes files for the captain (docs/card-authoring.md). */
  takesCardFiles(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  /** Whether the computer's close order runs the task's stops and answers its report. */
  private listsStops(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  /** Whether the computer answers the file orders, so its files can be read from here. */
  answersFiles(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  /**
   * The Secrets command rides the same task channel, and its list rides the
   * metadata-only work request included in this major; no request there asks for a use.
   */
  takesSecrets(machine: string): boolean {
    return this.keepsBrowsers(machine) && this.options.devices.takesCurrentWork(machine);
  }

  /**
   * Whether the computer's Secrets command asks this Mac for uses whose
   * programs run there (`secret-uses-elsewhere.md`, docs/secrets.md "On a
   * computer that runs work").
   */
  takesSecretUses(machine: string): boolean {
    return (
      this.takesSecrets(machine) &&
      listsChange(this.options.devices.version(machine)?.changes, SECRET_USES_ELSEWHERE)
    );
  }

  /**
   * Whether the computer's Secrets command asks this Mac to keep a secret,
   * raised on this Mac's own card (`secret-asks-elsewhere.md`, docs/secrets.md
   * "Asking to keep a secret"); one without the change says an ask is not
   * offered there.
   */
  takesSecretAsks(machine: string): boolean {
    return (
      this.takesSecretUses(machine) &&
      listsChange(this.options.devices.version(machine)?.changes, SECRET_ASKS_ELSEWHERE)
    );
  }

  prepare(
    machine: string,
    taskId: string,
    repoId: string | null,
    base?: WorkingCopyBase,
    branch?: string,
  ): Promise<PlacedCopy> {
    return this.copies.prepare(machine, taskId, repoId, base, branch);
  }

  sourceFile(
    machine: string,
    taskId: string,
    name: string,
    file: string,
    into?: "handover",
  ): Promise<string> {
    if (statSync(file).size === 0 && !this.options.devices.takesCurrentWork(machine))
      throw new Error(
        "Update Infinitary on the work computer before it can receive an empty attached file.",
      );
    return sendSourceFile(this.options.devices, machine, taskId, name, file, into);
  }

  takesHandover(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  /** Whether the computer removes files from outside when they are due: every one on the home's major. */
  takesOutsideFiles(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  sourceRef(
    machine: string,
    taskId: string,
    repoId: string | null,
    sourceId: string,
    ref: string,
  ): Promise<string> {
    return this.copies.sourceRef(machine, taskId, repoId, sourceId, ref);
  }

  revision(
    machine: string,
    taskId: string,
    headSha?: string,
    builtOn?: string,
  ): Promise<WorkOrderResponse<"inf:working-copy:revision">> {
    return this.copies.revision(machine, taskId, headSha, builtOn);
  }

  install(machine: string, taskId: string): Promise<DependencyInstall> {
    return this.copies.install(machine, taskId);
  }
  takesMoves(machine: string): boolean {
    return this.options.devices.takesCurrentWork(machine);
  }

  moveOut(
    machine: string,
    taskId: string,
    attempt: string,
    pack: string,
    keep?: readonly string[],
  ): Promise<{ head: string; branch: string; repoDir: string }> {
    return this.copies.moveOut(machine, taskId, attempt, pack, keep);
  }

  moveIn(
    machine: string,
    taskId: string,
    attempt: string,
    input: { repoId: string | null; head: string; branch: string; pack: string },
  ): Promise<PlacedCopy> {
    return this.copies.moveIn(machine, taskId, attempt, input);
  }

  removeAwayCopy(machine: string, taskId: string): Promise<void> {
    return this.copies.removeAwayCopy(machine, taskId, this.folders(machine, taskId)?.work);
  }

  retireMoved(machine: string, taskId: string): Promise<void> {
    return this.copies.retireMoved(machine, taskId);
  }

  forgetExecution(taskId: string): void {
    const placed = this.placed.get(taskId);
    if (placed && heldSession(placed))
      throw new Error("The task's conversation there is still held here.");
    this.placed.delete(taskId);
    const dir = crewmatePlacedDir(this.options.paths, taskId);
    if (existsSync(dir)) renameSync(dir, `${dir}-before-${this.options.now()}`);
  }

  workStatus(taskId: string): Promise<{ dirty: boolean; unlandedCommits: number } | null> {
    return this.copies.status(taskId);
  }

  homeCopy(taskId: string): ReturnType<PlacedCopies["homeCopy"]> {
    return this.copies.homeCopy(taskId);
  }

  bringBranchHome(taskId: string, strict?: boolean, branch?: string): Promise<string | undefined> {
    return this.copies.bringBranchHome(taskId, strict, branch);
  }

  checkedOut(taskId: string): Promise<{ branch: string | null; head: string } | null> {
    return this.copies.checkoutThere(taskId);
  }

  signInsOf(machine: string): Promise<ComputerSignIns | null> {
    return this.accounts.signInsOf(machine);
  }

  served(machine: string, fresh = false): Promise<ComputerPool> {
    return this.accounts.served(machine, fresh);
  }

  refuseHeld(taskId: string, refused: boolean): void {
    this.ledgerOf(taskId).keepRefused(refused);
  }

  refusedHeld(taskId: string): boolean {
    return this.ledgerOf(taskId).refused();
  }

  private ledgerOf(taskId: string): PlacedLedger {
    const dir = crewmatePlacedDir(this.options.paths, taskId);
    return this.placed.get(taskId)?.ledger ?? new PlacedLedger(dir);
  }

  servedState(machine: string): string {
    return this.accounts.servedState(machine);
  }

  servingAccount(session: ModelSession): string | undefined {
    return this.accounts.servingAccount(session);
  }

  accountOf(machine: string, taskId: string): string | undefined {
    const placed = this.placed.get(taskId);
    const accountId =
      (placed && heldSession(placed)?.servingAccount()) ??
      this.devices.get(machine)?.roster?.tasks.get(taskId)?.state?.accountId;
    return accountId ? accountKey(machine, accountId) : undefined;
  }

  personalOf(taskId: string): PersonalVersion | undefined {
    const placed = this.placed.get(taskId);
    return placed ? heldSession(placed)?.personalVersion() : undefined;
  }

  cutOffOf(account: string): ReturnType<CrewMachines["cutOffOf"]> {
    return this.accounts.cutOffOf(account);
  }

  knows(account: string): boolean {
    return this.accounts.knows(account);
  }

  accountPlace(account: string): ReturnType<CrewMachines["accountPlace"]> {
    return this.accounts.accountPlace(account);
  }

  signInWait(machine: string): ReturnType<CrewMachines["signInWait"]> {
    return this.accounts.signInWait(machine);
  }

  ready(machine: string, taskId: string): boolean {
    if (!this.options.devices.inReach(machine)) return false;
    const roster = this.devices.get(machine)?.roster;
    if (!roster) return false;
    const placed = this.placed.get(taskId);
    if (placed?.adopting) return false;
    const there = roster.tasks.get(taskId);
    if (!there) return true;
    // The closed conversation a move off that computer, out of reach, left
    // there is not caught up on: it goes before the task moves back there.
    const record = this.options.tasks.get(taskId);
    const left = record?.shape?.away_copies?.findLast((entry) => entry.from === machine);
    if (record?.deviceId !== machine && left?.kept && left.kept.removed === undefined) return true;
    return (placed ?? this.load(taskId, machine)).through >= there.seq;
  }

  conversationOpen(machine: string, taskId: string): boolean {
    const roster = this.devices.get(machine)?.roster;
    if (!roster || this.placed.get(taskId)?.adopting) return true;
    const there = roster.tasks.get(taskId);
    return there?.open === true || there?.running !== undefined;
  }

  reattachOnly(machine: string): boolean {
    return this.listsChange(machine, REATTACH_ONLY_OPEN);
  }

  catchingUpSince(machine: string, taskId: string): number | undefined {
    if (!this.options.devices.inReach(machine) || this.ready(machine, taskId)) return undefined;
    const back = this.devices.get(machine)?.reachedAt ?? this.startedAt;
    return Math.max(back, this.placed.get(taskId)?.adoptingSince ?? back);
  }

  // ---- the work requests ------------------------------------------------------

  async answer<C extends WorkInvokeChannel>(
    deviceId: string,
    channel: C,
    request: InvokeRequest<C>[0],
  ): Promise<InvokeResponse<C>> {
    const asked = request as { task: string; callId?: string };
    const record = this.options.tasks.get(asked.task);
    if (record?.deviceId !== deviceId) throw new Error(NO_PLACED_TASK);
    // A browser that stops as its task closes copies a saved sign-in back
    // after the close (docs/task-browser.md, "On another computer").
    const copyBack =
      channel === "inf:work:browser-event" &&
      (request as InvokeRequest<"inf:work:browser-event">[0]).event.kind === "sign-in";
    // A Secrets program started there tells how it ended after the close too.
    const secretEnded =
      channel === "inf:work:secret-use" &&
      (request as InvokeRequest<"inf:work:secret-use">[0]).input.op === "ended";
    if (TaskService.isClosed(record) && !copyBack && !secretEnded)
      throw new Error(`That task is closed on ${HERE.this}.`);
    // A browser's fact and pictures are said once, and the next says it whole.
    if (channel === "inf:work:browser") {
      const { fact, unstarted } = request as InvokeRequest<"inf:work:browser">[0];
      this.options.browsers?.()?.heardFact(deviceId, asked.task, fact, unstarted);
      return { ok: true } as InvokeResponse<C>;
    }
    if (channel === "inf:work:browser-frame") {
      const { frame } = request as InvokeRequest<"inf:work:browser-frame">[0];
      this.options.browsers?.()?.heardFrame(asked.task, frame);
      return { ok: true } as InvokeResponse<C>;
    }
    if (channel === "inf:work:browser-sign-in") {
      const { site } = request as InvokeRequest<"inf:work:browser-sign-in">[0];
      return {
        signIn: this.options.browsers?.()?.automaticSignIn?.(asked.task, site),
      } as InvokeResponse<C>;
    }
    // A Secrets use there is decided here; its values go once and are never kept
    // in the call ledger (docs/secrets.md, "On a computer that runs work").
    if (channel === "inf:work:secret-use" || channel === "inf:work:secret-take") {
      const uses = TaskService.isClosed(record)
        ? this.secretUses.get(asked.task)
        : (await this.live(this.load(asked.task, deviceId))).callbacks?.secretUses;
      if (!uses) throw new Error("That tool is not this task's.");
      this.secretUses.set(asked.task, uses);
      const computer = { id: deviceId, label: this.nameOf(deviceId) };
      if (channel === "inf:work:secret-take") {
        const { request: use } = request as InvokeRequest<"inf:work:secret-take">[0];
        return (await uses.take(computer, use, asked.callId ?? "")) as InvokeResponse<C>;
      }
      const { input } = request as InvokeRequest<"inf:work:secret-use">[0];
      return (await uses.use(computer, input)) as InvokeResponse<C>;
    }
    // An ask to keep a secret there is raised on this Mac's own card; it carries no value.
    if (channel === "inf:work:secret-ask") {
      const uses = (await this.live(this.load(asked.task, deviceId))).callbacks?.secretUses;
      if (!uses?.ask) throw new Error("That tool is not this task's.");
      const { input } = request as InvokeRequest<"inf:work:secret-ask">[0];
      return (await uses.ask(
        { id: deviceId, label: this.nameOf(deviceId) },
        input,
      )) as InvokeResponse<C>;
    }
    if (channel === "inf:work:private-sites") {
      return {
        sites: this.options.browsers?.()?.privateSiteList?.() ?? [],
      } as InvokeResponse<C>;
    }
    const placed = this.load(asked.task, deviceId);
    if (channel === "inf:work:events") {
      const { events } = request as InvokeRequest<"inf:work:events">[0];
      const run = placed.chain.then(() => this.events(placed, events));
      placed.chain = run.catch(() => undefined);
      return run as Promise<InvokeResponse<C>>;
    }
    const callId = asked.callId as string;
    const kept = placed.ledger.answered(callId);
    if (kept) {
      if (kept.error !== undefined) throw new Error(kept.error);
      return kept.answer as InvokeResponse<C>;
    }
    // Asked again while the first is still being done: one effect, one answer.
    const running = placed.calling.get(callId);
    if (running) return running as Promise<InvokeResponse<C>>;
    const work = answerCall(
      this.callbackReach,
      {
        task: placed.task,
        deviceId: placed.deviceId,
        ledger: placed.ledger,
        live: () => this.live(placed),
      },
      channel,
      request as Record<string, unknown>,
    );
    placed.calling.set(callId, work);
    try {
      const answer = await work;
      placed.ledger.keep({
        callId,
        channel,
        after: placed.through,
        answer,
        ...reportOf(channel, request),
      });
      return answer as InvokeResponse<C>;
    } catch (caught) {
      // Not held here yet is asked again; every other refusal is the callback's answer.
      if (!(caught instanceof NotHeldHere))
        placed.ledger.keep({
          callId,
          channel,
          after: placed.through,
          error: caught instanceof Error ? caught.message : String(caught),
        });
      throw caught;
    } finally {
      placed.calling.delete(callId);
    }
  }

  /**
   * The minute's line for a computer with work that went out of reach, once
   * per absence; one whose Firstmate runs work for another one now is never
   * said to come back.
   */
  tick(now: number): void {
    for (const deviceId of this.devicesWithWork()) {
      if (this.options.devices.inReach(deviceId)) continue;
      // Still connecting is not an absence yet, and an update's minute counts from its end.
      if (this.options.reachOf?.(deviceId) === "connecting") continue;
      const device = this.device(deviceId);
      if (this.options.updatingOf?.(deviceId) && !device.saidGone) device.goneSince = now;
      if (device.saidGone || now - device.goneSince < OUT_OF_REACH_LINE_MS) continue;
      device.saidGone = true;
      const name = this.nameOf(deviceId);
      const projects = this.projectsOf(deviceId);
      // Here is the first mate's computer, which a computer that controls it names.
      this.options.broadcastEvent({
        type: "firstmate_note",
        ...saidLine(
          this.options.runsForAnotherFirstmate?.(deviceId)
            ? said("feedComputerOtherFirstMate", { name, projects, here: PLACE_SAID.here })
            : said("feedComputerOutOfReach", { name, projects, here: PLACE_SAID.here }),
        ),
      });
    }
  }

  // ---- opening ----------------------------------------------------------------

  private factory(deviceId: string, backend: SessionBackend): SessionFactory | undefined {
    const profile = this.options.profiles[backend];
    if (!profile) return undefined;
    // The computer's own background work is out of this Mac's sight: the
    // stall clock watches it, as for Claude here.
    const controlProfile: ControlProfile = { ...profile, backgroundWork: "client" };
    return {
      backend,
      controlProfile,
      open: (spec) => this.open(deviceId, backend, controlProfile, spec),
    };
  }

  private async open(
    deviceId: string,
    backend: SessionBackend,
    controlProfile: ControlProfile,
    spec: SessionSpec,
  ): Promise<PlacedSession> {
    const name = backend === "pi" ? "A Pi session" : "A Claude session";
    if (spec.machine !== deviceId)
      throw new Error(`${name} held on another computer cannot run on machine ${spec.machine}.`);
    if (spec.binding.backend !== backend)
      throw new Error(
        `${name} held on another computer cannot serve a ${spec.binding.backend} binding.`,
      );
    if (spec.shape.turns !== "rolling")
      throw new Error(
        `${name} held on another computer serves the coding built-ins on a rolling session only.`,
      );
    if (spec.builtins !== "coding")
      throw new Error(`${name} held on another computer holds a crewmate's conversation only.`);
    const device = this.device(deviceId);
    if (!this.options.devices.inReach(deviceId) || !device.roster)
      throw new DeviceOutOfReachError(
        `${this.nameOf(deviceId)} is ${awayWord(this.options.reachOf?.(deviceId) === "connecting")}, so the conversation waits`,
        { deviceId },
      );
    if (spec.runbookSkills?.length && !this.options.devices.takesCurrentWork(deviceId))
      throw new Error(
        `Update Infinitary on ${this.nameOf(deviceId)} before it can receive this task's runbook skills.`,
      );
    const resume = crewmateResumeToken(spec.shape.record.resume);
    const version = this.options.devices.version(deviceId)?.contract;
    const supportsSpeed = Boolean(
      version &&
        (Number(version.split(".")[0]) > 5 ||
          (Number(version.split(".")[0]) === 5 && Number(version.split(".")[1]) >= 2)),
    );
    if (spec.speed && !supportsSpeed) {
      const model = spec.model ?? { provider: "openai-codex", id: "This model" };
      const requested = await spec.speed.requested(model);
      if (requested !== "standard")
        spec.speed.record(model, {
          requested,
          sent: "standard",
          reason:
            "the computer running this task has not confirmed support for crew speed settings",
        });
    }
    const placedSpec = placedSpecSchema.parse({
      binding: {
        backend,
        ...(spec.binding.accountId ? { accountId: spec.binding.accountId } : {}),
        ...(spec.model?.provider ? { provider: spec.model.provider } : {}),
      },
      ...(spec.model ? { model: spec.model } : {}),
      ...(spec.speed && supportsSpeed ? { speed: true } : {}),
      thinking: {
        level: spec.thinking.level,
        ...(spec.thinking.quick ? { quick: true } : {}),
      },
      instructions: spec.instructions.base,
      ...(spec.homeSource ? { homeSource: spec.homeSource } : {}),
      ...(spec.runbookSkills ? { runbookSkills: spec.runbookSkills } : {}),
      ...(spec.personalResources !== undefined
        ? { personalResources: spec.personalResources }
        : {}),
      tools: spec.tools.map((tool) => tool.name),
      ...(spec.load ? { load: true } : {}),
      ...(spec.stops && this.takesStops(deviceId) ? { stops: true } : {}),
      // Its keeps there, or a refusal naming another user (docs/leftover-programs.md).
      ...(spec.stops && this.takesKeeps(deviceId) !== undefined
        ? { keeps: this.takesKeeps(deviceId) }
        : {}),
      // Its own browser, there beside its shell (docs/task-browser.md, "On another computer").
      ...(spec.callbacks?.browser && device.roster.browsers ? { browser: true } : {}),
      // Its integrations, asked of this Mac (docs/integrations.md, "On a computer that runs work").
      ...(spec.callbacks?.integrations && this.takesIntegrations(deviceId)
        ? { integrations: true }
        : {}),
      // Its files on the captain's other computers, asked of this Mac (docs/files.md).
      ...(spec.callbacks?.files && this.takesFiles(deviceId) ? { files: true } : {}),
      ...(spec.callbacks?.secretsCatalog && this.takesSecrets(deviceId) ? { secrets: true } : {}),
      // Its uses, decided here and run there (docs/secrets.md, "On a computer that runs work").
      ...(spec.callbacks?.secretUses && this.takesSecretUses(deviceId) ? { secretUses: true } : {}),
      // Its asks to keep a secret, raised on this Mac's own card (docs/secrets.md, "Asking to keep a secret").
      ...(spec.callbacks?.secretUses?.ask && this.takesSecretAsks(deviceId)
        ? { secretAsks: true }
        : {}),
      ...(resume ? { resume } : {}),
      // Only the conversation held there, so a new one routes first (`reattach-only-open.md`).
      ...(spec.shape.record.reattach && this.listsChange(deviceId, REATTACH_ONLY_OPEN)
        ? { reattach: true }
        : {}),
      ...(this.listsChange(deviceId, OPEN_NOT_OPENED) ? { notOpened: true } : {}),
      // A restart asks for a new conversation there, never the one it replaces (`fresh-open.md`).
      ...(spec.shape.record.fresh && this.listsChange(deviceId, FRESH_OPEN) ? { fresh: true } : {}),
      ...(spec.bounds?.request?.retries !== undefined
        ? { retries: spec.bounds.request.retries }
        : {}),
    });
    // The home's set reaches it before a conversation that reads it opens (a failed send keeps it).
    if (spec.personalResources) await this.personal?.bring(deviceId);
    const task = spec.owner;
    const placed = this.load(task, deviceId);
    const outcome = await this.askOpen(deviceId, task, placedSpec);
    if ("notOpened" in outcome) throw new NothingOpenedThere(outcome.notOpened);
    if (!("state" in outcome)) throw new NeedsNewConversation(task);
    const { state } = outcome;
    placed.reopening = undefined;
    const recordDir = spec.shape.record.dir;
    placed.record.dir = recordDir;
    // The spec open there; one adopted on another model than asked has none until a reopen confirms one.
    const { reattach: _reattach, notOpened: _notOpened, fresh: _fresh, ...opened } = placedSpec;
    if (sameModel(state.model, opened.model)) placed.spec = confirmedSpec(opened, state);
    placed.reopenOwed = state.streaming;
    // The conversation as it lives there: a live one kept on another backend
    // than this asked for resumes and is followed as that backend's.
    const live =
      state.backend === backend
        ? controlProfile
        : {
            ...(this.options.profiles[state.backend] ?? state.controlProfile),
            backgroundWork: "client" as const,
          };
    let turnOrigin: string | undefined;
    const session: PlacedSession = new PlacedSession(
      {
        task,
        backend: state.backend,
        recordDir,
        callbacks: spec.callbacks,
        order: async <C extends WorkOrderChannel>(channel: C, args: unknown) => {
          // A reopen asks first and routes before it opens: words wait for
          // that open, and go back to their lane unspent if it did not open.
          const words = channel === "inf:session:prompt" || channel === "inf:session:steer";
          if (words && (await placed.reopening) === false) throw new NotOpenThere(task);
          if (channel === "inf:session:prompt") {
            turnOrigin = await this.copies.followProject(deviceId, task, turnOrigin);
            // A reopen that began while the project was followed is waited for too.
            if ((await placed.reopening) === false) throw new NotOpenThere(task);
          }
          return this.options.devices.ask(deviceId, channel, args) as Promise<WorkOrderResponse<C>>;
        },
        inReach: () => this.options.devices.inReach(deviceId),
        copy: () => placed.record.copy(),
        interrupted: (retry = true) =>
          `${this.nameOf(deviceId)} quit before this turn finished${retry ? ", so its messages go again." : "."}`,
        unheard: () =>
          `${this.nameOf(deviceId)} no longer runs this turn, and its end never arrived here, so its messages go again.`,
        released: (released) => {
          if (placed.session === released) {
            placed.session = undefined;
            placed.reopening = undefined;
            placed.openCalls.clear();
            placed.endedCalls.clear();
            placed.record.cancelLive();
          }
        },
      },
      live,
      state,
    );
    placed.session = session;
    // Follow a turn from the roster only if it belongs to the conversation the computer just
    // opened, with the open's state: a replacement resuming the same record keeps its id.
    const there = device.roster?.tasks.get(task);
    if (there?.state?.sessionId === state.sessionId)
      session.adopt({ ...there, state }, there.seq >= placed.through);
    // A report its turn already gave before this Mac restarted, once its owner listens.
    const replays = placed.replays.filter((replay) => replay.after <= placed.through);
    placed.replays = placed.replays.filter((replay) => replay.after > placed.through);
    if (replays.length > 0)
      session.onceHeard(() => {
        placed.replaying = (async () => {
          for (const line of replays) await replayReport(session, line);
        })();
      });
    return session;
  }

  /**
   * The home's personal set changed, or the switch turned on: each computer
   * in reach is sent it now, and one out of reach when it is back.
   */
  bringPersonal(): Promise<void> {
    const sends = [...this.devices.values()]
      .filter((device) => device.roster && this.options.devices.inReach(device.id))
      .map((device) => this.personal?.bring(device.id));
    return Promise.all(sends).then(() => undefined);
  }

  // ---- contact ------------------------------------------------------------------

  private contact(contact: WorkDeviceContact): void {
    const device = this.device(contact.deviceId);
    device.contact += 1;
    this.awaitRoster(device);
    if (contact.contact === "gone") {
      device.roster = undefined;
      this.personal?.forget(contact.deviceId);
      device.goneSince = this.options.now();
      device.reachedAt = undefined;
      for (const placed of this.placed.values())
        if (placed.deviceId === contact.deviceId) {
          placed.released = false;
          placed.record.cancelLive();
        }
      this.options.reachMoved?.();
      return;
    }
    // In reach is not caught up: its tasks say since when they catch up.
    device.reachedAt ??= this.options.now();
    this.options.reachMoved?.();
    void this.reach(device, device.contact).catch((caught: unknown) =>
      this.log(`could not read what ${contact.deviceId} holds: ${errorText(caught)}`),
    );
  }

  /**
   * Back in reach: its roster first, then each closed record's conversation
   * closed there, what a task this Mac no longer records there left removed
   * by the leftover rule, each running turn followed, and what waited asked
   * now.
   */
  private async reach(device: Device, contact: number): Promise<void> {
    const roster = await this.readRoster(device.id);
    if (this.stoppingCopies || device.contact !== contact) return;
    device.roster = {
      tasksDir: roster.tasksDir,
      ...(roster.worktreesDir ? { worktreesDir: roster.worktreesDir } : {}),
      tasks: new Map(roster.tasks.map((entry) => [entry.task, entry])),
      browsers: roster.browsers === true,
    };
    this.personal?.heard(device.id, roster.personal);
    device.rosterRead();
    // Its personal set first, so a conversation it opens again reads the home's newest.
    await this.personal?.bring(device.id);
    if (this.stoppingCopies || device.contact !== contact) return;
    const adopting: Promise<unknown>[] = [];
    // Each entry's computer and close, in one read: a computer keeps every
    // task's folder for a while, thousands of them, and composing each
    // held the main thread a third of a second at every contact (INF-3040).
    const records = this.recordedOn(roster.tasks);
    for (const entry of roster.tasks) {
      const record = records.get(entry.task);
      if (record?.deviceId !== device.id) {
        // No task of this Mac's there: its working copy and folder go once
        // any work in them is here.
        void this.copies.retireLeftover(
          device.id,
          entry.task,
          this.folders(device.id, entry.task)?.work,
        );
        continue;
      }
      if (TaskService.isClosed(record)) {
        // Closed here: its conversation closes there, then its working copy
        // goes once its work is here.
        if (!entry.closed) this.close(entry.task, device.id);
        else if (entry.workingCopy) void this.copies.retire(entry.task);
        continue;
      }
      const placed = this.load(entry.task, device.id);
      const session = heldSession(placed);
      // That computer restarted: the conversation this Mac holds opens there
      // again, and a Secrets program it started there tells nothing more.
      if (session && !entry.open) {
        this.secretUsesGone(entry.task, device.id);
        adopting.push(this.reopen(placed, session, device.id));
      } else if (session) session.adopt(entry, entry.seq >= placed.through);
      // A turn this Mac does not follow: a restart here left it running there.
      else if (entry.running) adopting.push(this.live(placed).catch(() => undefined));
      this.heard(placed, entry);
    }
    for (const placed of this.placed.values()) {
      const session = heldSession(placed);
      if (placed.deviceId !== device.id || !session) continue;
      // What waited for it goes now; the record's copy may have missed a turn's end the drop cut off.
      session.reached();
      void placed.record
        .copy()
        .finally(() => {
          if (placed.record.growing()) placed.record.duringTurn();
        })
        .catch(() => undefined);
    }
    // A closed task whose working copy it no longer holds has nothing left there to bring home.
    if (roster.worktreesDir)
      for (const taskId of this.options.tasks.closedPresentOn(device.id))
        if (!device.roster.tasks.has(taskId)) this.copies.forget(taskId);
    await Promise.all(adopting);
    if (device.contact === contact) this.release(device.id);
  }

  /**
   * Opens the conversation there again, from where its record ends, for the
   * session this Mac still holds; the lane waits until it is open, and until
   * the supervisor took a conversation that started over there. Tool names
   * are what that computer allows now, so a version-gated tool arrives
   * without this Mac restarting.
   */
  private reopen(
    placed: Placed,
    session: PlacedSession,
    deviceId: string,
    owed = false,
  ): Promise<void> {
    // Still this computer's, in the session this Mac holds, after each wait.
    const ours = () => heldSession(placed) === session && placed.deviceId === deviceId;
    const letGo = () => {
      if (ours()) this.host?.letGo?.(placed.task);
      return false;
    };
    const opened = placed.spec && withToolsNow(placed.spec, this.host?.toolsNow?.(placed.task));
    if (opened) placed.spec = opened;
    // Adopted on another model than it asked, it takes no words: the next turn resumes anew.
    if (!opened) {
      placed.reopening = Promise.resolve(false);
      letGo();
      return Promise.resolve();
    }
    const resume = session.resumeToken();
    // One that failed leaving nothing new there says so, when it can (`open-not-opened.md`).
    const notOpened = this.listsChange(deviceId, OPEN_NOT_OPENED) ? { notOpened: true } : {};
    const ask = (spec: PlacedSpec) =>
      this.askOpen(deviceId, placed.task, { ...spec, ...(resume ? { resume } : {}), ...notOpened });
    // One that keeps only what it holds opens nothing before the home routed it (`reattach-only-open.md`).
    const reattachOnly = this.listsChange(deviceId, REATTACH_ONLY_OPEN);
    const progress: ReopenProgress = { asked: opened, anew: false };
    const asking = askReopen(progress, {
      reattachOnly,
      held: owed,
      refused: placed.ledger.refused(),
      ours,
      ask,
      route: (attach) => this.host?.reopenModel?.(placed.task, deviceId, attach),
      letGo,
      creating: () => this.refuseHeld(placed.task, true),
    });
    // True once the conversation is open there for this session's words.
    const reopening: Promise<boolean> = asking
      .then(async (answer) => {
        if (!answer) return false;
        // Nothing opened on the routed pick there: the next open routes among the rest.
        if ("notOpened" in answer && ours()) progress.routed?.passOver();
        if (!("state" in answer)) return letGo();
        const { state } = answer;
        placed.reopenOwed = state.streaming;
        const spec = await reopenedSpec(progress, state, {
          ours,
          letGo,
          refuse: () => this.refuseHeld(placed.task, true),
          kept: () => this.host?.modelKept?.(placed.task, deviceId),
        });
        if (spec === false || !ours()) return false;
        if (spec) placed.spec = spec;
        session.reopened(state);
        if (!session.letGo) this.host?.reopened(placed.task);
        return true;
      })
      .catch((caught: unknown) => {
        this.log(`could not open ${placed.task} there again: ${errorText(caught)}`);
        return letGo();
      });
    placed.adoptingSince = this.options.now();
    // Words wait for that computer to confirm it open, else take none (`NotOpenThere`).
    const settled: Promise<boolean> = reopening
      .then((open) => {
        if (open && placed.reopening === settled) placed.reopening = undefined;
        return open;
      })
      .finally(() => {
        placed.adopting = undefined;
        placed.adoptingSince = undefined;
      });
    placed.reopening = settled;
    placed.adopting = settled.then(() => undefined);
    return placed.adopting;
  }

  /** Asks that computer to open `spec`, its answer read as one outcome (`openOutcome`). */
  private async askOpen(deviceId: string, task: string, spec: PlacedSpec) {
    const placed = this.load(task, deviceId);
    placed.asking += 1;
    try {
      while (placed.cleaning) await placed.cleaning;
      const answer = await this.options.devices.ask(deviceId, "inf:session:open", [
        { orderId: `open:${task}:${this.options.now()}`, task, spec },
      ]);
      return openOutcome(openAnswerSchema.parse(answer), spec);
    } finally {
      placed.asking -= 1;
    }
  }

  /** Lets each of the computer's caught-up tasks go on, and says its work caught up. */
  private release(deviceId: string): void {
    const ready: string[] = [];
    let behind = false;
    for (const record of this.options.tasks.listLive()) {
      if (record.deviceId !== deviceId) continue;
      const placed = this.load(record.id, deviceId);
      if (!this.ready(deviceId, record.id)) {
        behind = true;
        continue;
      }
      if (placed.released) continue;
      placed.released = true;
      ready.push(record.id);
    }
    const device = this.device(deviceId);
    if (!behind && device.saidGone) {
      device.saidGone = false;
      this.options.broadcastEvent({
        type: "firstmate_note",
        text: `${this.nameOf(deviceId)} is back. Its work on ${this.projectsOf(deviceId)} caught up.`,
      });
    }
    if (ready.length > 0) this.host?.caughtUp(ready);
    this.options.reachMoved?.();
  }

  /** A roster to wait for, from this contact on; whoever waited on the last one looks again. */
  private awaitRoster(device: Device): void {
    const wake = device.rosterRead;
    device.rostered = new Promise<void>((resolve) => {
      device.rosterRead = resolve;
    });
    wake();
  }

  /** The task's conversation, open on this Mac: opened by the supervisor when nothing holds it. */
  private async live(placed: Placed): Promise<PlacedSession> {
    const held = heldSession(placed);
    if (held) return held;
    const host = this.host;
    if (!host) throw new NotHeldHere(`${HERE.This} is still starting.`);
    // Asked before its roster was read: where its folders are comes first.
    const device = this.device(placed.deviceId);
    while (!device.roster) {
      if (!this.options.devices.inReach(device.id))
        throw new NotHeldHere("That computer is out of reach.");
      await device.rostered;
    }
    if (!placed.adopting) {
      placed.adoptingSince = this.options.now();
      placed.adopting = host.adopt(placed.task).finally(() => {
        placed.adopting = undefined;
        placed.adoptingSince = undefined;
      });
    }
    try {
      await placed.adopting;
    } catch (caught) {
      this.log(`could not open ${placed.task}'s conversation here: ${errorText(caught)}`);
      throw new NotHeldHere(
        `Could not open the conversation on ${HERE.this}: ${errorText(caught)}`,
      );
    }
    const session = heldSession(placed);
    if (!session) throw new NotHeldHere(`That task's conversation is not open on ${HERE.this}.`);
    return session;
  }

  // ---- events ---------------------------------------------------------------------

  private async events(
    placed: Placed,
    records: readonly PlacedEventRecord[],
  ): Promise<{ through: number; kept: number }> {
    if (!records.some((record) => record.seq > placed.through))
      return { through: placed.through, kept: placed.kept };
    const session = await this.live(placed);
    await placed.replaying;
    const keptBefore = placed.kept;
    for (const record of records) {
      if (record.seq <= placed.through) continue;
      // A gap: the computer sends on from the number after `through`.
      if (record.seq !== placed.through + 1) break;
      // A cut-off the turn met there is that computer's own to record, and it
      // says so with its sign-ins: heard first, so the turn ends here held.
      if (metCutOff(record.event))
        await this.options.refreshSignIns?.(placed.deviceId).catch(() => undefined);
      const event = record.event;
      const type = event.type;
      if (type === "tool_start") placed.openCalls.add(event.callId);
      else if (type === "tool_end") {
        placed.openCalls.delete(event.callId);
        placed.endedCalls.add(event.callId);
      } else if (
        type === "turn_end" ||
        type === "turn_ended" ||
        type === "turn_failed" ||
        type === "continuation_ended"
      ) {
        placed.openCalls.clear();
        placed.endedCalls.clear();
        // A continuation still needs its final tail, even when its client exited.
        if (type !== "continuation_ended") placed.record.cancelLive();
      }
      await session.take(event);
      placed.through = record.seq;
      await this.settleSaid(placed);
      if (type === "turn_ended" || type === "continuation_ended") this.reopenIfOwed(placed);
      if (
        type === "request_started" ||
        type === "tool_start" ||
        type === "tool_end" ||
        type === "turn_end" ||
        type === "continuation_ended"
      )
        placed.record.duringTurn();
      if (type === "turn_end" || type === "turn_ended") {
        placed.kept = placed.through;
        if (type === "turn_ended") {
          placed.ended = placed.through;
          placed.replays = [];
        }
        this.writeKept(placed);
      }
      for (const line of placed.replays.filter((replay) => replay.after === placed.through))
        await replayReport(session, line);
    }
    if (!placed.released) this.release(placed.deviceId);
    // What the computer forgets once told it was kept is in every copy in reach first.
    if (placed.kept > keptBefore) await this.options.beforeKept?.();
    return { through: placed.through, kept: placed.kept };
  }

  // ---- what the computer says is working ------------------------------------------

  async answerReads(taskId: string): Promise<AnsweredWait[]> {
    const deviceId = this.options.tasks.get(taskId)?.deviceId;
    if (!deviceId || !this.options.devices.inReach(deviceId)) return [];
    if (!this.options.devices.takesCurrentWork(deviceId)) return [];
    const through = this.load(taskId, deviceId).through;
    const answer = workOrders["inf:session:answer-reads"].response.parse(
      await this.options.devices.ask(deviceId, "inf:session:answer-reads", [
        { task: taskId, through },
      ]),
    );
    return answer.answered;
  }

  async confirm(taskId: string): Promise<boolean> {
    const record = this.options.tasks.get(taskId);
    const deviceId = record?.deviceId;
    if (!deviceId || !this.options.devices.inReach(deviceId)) return false;
    const device = this.device(deviceId);
    const contact = device.contact;
    const roster = await this.readRoster(deviceId);
    if (device.contact !== contact) return false;
    const entry = roster.tasks.find((each) => each.task === taskId);
    if (!entry) return false;
    const placed = this.load(taskId, deviceId);
    placed.said = { seq: entry.seq, working: working(entry) };
    return this.settleSaid(placed);
  }

  /**
   * One roster row, the computer's own answer from its live session: a turn
   * it runs for a prompt, or a session that says it works (INF-2332).
   */
  private heard(placed: Placed, entry: PlacedRosterTask): void {
    placed.said = { seq: entry.seq, working: working(entry) };
    void this.settleSaid(placed).catch((caught: unknown) =>
      this.log(`could not end ${placed.task}'s turn here: ${errorText(caught)}`),
    );
  }

  /**
   * Compares the computer's answer once the home has taken every event it
   * had counted, and no later one: then a turn the home still holds as
   * running there, which that computer says is over, ended out of sight and
   * ends here as interrupted, and an open owed goes again. An answer the
   * events have already passed says nothing new, and one still ahead of
   * them waits for them.
   */
  private async settleSaid(placed: Placed): Promise<boolean> {
    const said = placed.said;
    if (!said || placed.through < said.seq) return false;
    placed.said = undefined;
    if (said.working || placed.through > said.seq) return false;
    const session = heldSession(placed);
    if (!session) return false;
    const following = session.isStreaming();
    if (following) await session.endedThere();
    // Nothing runs there with every event in: an open owed goes now.
    this.reopenIfOwed(placed);
    return following && !session.isStreaming();
  }

  /**
   * The turn an open found working there has ended here - its end taken, or
   * ended out of sight (`settleSaid`) - with nothing else running: that open
   * goes again, so a contract that moved meanwhile is applied and its answer
   * - a conversation that started over - reaches the supervisor (INF-2332).
   * Called only at such an end, never on an event mid-turn.
   */
  private reopenIfOwed(placed: Placed): void {
    const session = heldSession(placed);
    if (!placed.reopenOwed || !session || session.isStreaming()) return;
    placed.reopenOwed = false;
    void this.reopen(placed, session, placed.deviceId, true);
  }

  /**
   * A record went while its computer may be in reach: each computer in
   * reach whose roster was read is asked again, and what a task this Mac
   * no longer records there left goes by the leftover rule now rather than
   * at its next contact.
   */
  private sweepLeftovers(): void {
    for (const device of this.devices.values()) {
      if (!device.roster || !this.options.devices.inReach(device.id)) continue;
      void this.readRoster(device.id)
        .then((roster) => {
          if (this.stoppingCopies) return;
          const records = this.recordedOn(roster.tasks);
          for (const entry of roster.tasks)
            if (records.get(entry.task)?.deviceId !== device.id)
              void this.copies.retireLeftover(
                device.id,
                entry.task,
                this.folders(device.id, entry.task)?.work,
              );
        })
        .catch((caught: unknown) =>
          this.log(`could not read what ${device.id} holds: ${errorText(caught)}`),
        );
    }
  }

  // ---- removing a computer -------------------------------------------------------

  /**
   * Before a computer that runs work is removed (docs/devices.md, "Remove"):
   * every conversation it holds is closed there for good and every working
   * copy whose task this Mac records is retired once its kept work is here.
   * Rejects while one of its tasks is still open here, and when a working
   * copy there still holds work this Mac lacks, so nothing that never came
   * home is ever lost to a removal.
   */
  async bringHome(deviceId: string): Promise<void> {
    const name = this.nameOf(deviceId);
    const roster = await this.readRoster(deviceId);
    for (const entry of roster.tasks) {
      const record = this.options.tasks.get(entry.task);
      const ours = record?.deviceId === deviceId;
      if (ours && record && !TaskService.isClosed(record))
        throw new Error(`"${record.title}" is still running on ${name}.`);
      if (!entry.closed) {
        await this.closeThere(deviceId, entry.task);
        if (ours) this.load(entry.task, deviceId).closed = true;
      }
      if (entry.workingCopy && ours) await this.copies.retire(entry.task);
    }
    const after = await this.readRoster(deviceId);
    const left = after.tasks.filter(
      (entry) => entry.workingCopy && this.options.tasks.get(entry.task)?.deviceId === deviceId,
    ).length;
    if (left > 0)
      throw new Error(
        `the work of ${left === 1 ? "one task" : `${left} tasks`} on ${name} could not come here yet`,
      );
  }

  // ---- closing ------------------------------------------------------------------

  /** Called only for a closed task whose home-authoritative retention period is over. */
  async removeClosedTaskFiles(
    record: TaskRetentionFields,
  ): Promise<WorkOrderResponse<"inf:session:clean-files">> {
    if (!record.deviceId || !TaskService.isClosed(record))
      throw new Error("This task is not closed on another computer.");
    const deviceId = record.deviceId;
    if (!this.options.devices.inReach(deviceId))
      throw new Error("This task's computer is out of reach.");
    await this.closeThere(deviceId, record.id);
    const result = await this.options.devices.ask(deviceId, "inf:session:clean-files", [
      { orderId: `clean-files:${record.id}:${record.closedAt}`, task: record.id },
    ]);
    return workOrders["inf:session:clean-files"].response.parse(result);
  }

  /**
   * Removes only the provisioned temporary folder on the computer that
   * holds the task. An older computer, or one out of reach, is not reported
   * as cleaned; the caller retries.
   */
  async removeClosedTaskTemp(
    record: TaskRetentionFields,
  ): Promise<WorkOrderResponse<"inf:session:clean-temp">> {
    if (!record.deviceId || !TaskService.isClosed(record))
      throw new Error("This task is not closed on another computer.");
    const deviceId = record.deviceId;
    if (!this.options.devices.inReach(deviceId))
      throw new Error("This task's computer is out of reach.");
    const version = this.options.devices.version(deviceId)?.contract ?? "";
    if (!speaksTempCleanup(version))
      throw new Error("This computer needs an update before temporary files can be removed.");
    await this.closeThere(deviceId, record.id);
    const result = await this.options.devices.ask(deviceId, "inf:session:clean-temp", [
      { orderId: `clean-temp:${record.id}:${record.closedAt}`, task: record.id },
    ]);
    return workOrders["inf:session:clean-temp"].response.parse(result);
  }

  /**
   * The words from outside a task's conversation there holds, once due
   * (`inf:session:delete-outside`; docs/task-retention.md, "Words from
   * outside"): this Mac's copy of its callbacks' answers first, then that
   * computer's files, and this Mac's copy of each it changed, whole. `files`
   * are files from outside due in its hand-over folder there. A computer out
   * of reach or without the change, or an open there unanswered, waits for
   * a later pass; one no longer on the list leaves this Mac's copy to the
   * caller (`gone`). This Mac opens the conversation again, routed, or, on
   * an older computer that opens it by itself, lets its own go first.
   */
  async deleteOutside(
    record: TaskRecord,
    due: OutsideDue,
    files: readonly string[] = [],
  ): Promise<PlacedOutsideVisit> {
    const deviceId = record.deviceId;
    if (!deviceId || !this.computers().includes(deviceId)) return "gone";
    const rule = dueRule(due.kinds);
    const placed = this.load(record.id, deviceId);
    const answers = rewriteOutsideData(placed.ledger.callsFile, rule, due.legacy);
    if (answers > 0) placed.ledger.reread();
    const computer = this.nameOf(deviceId);
    if (!this.options.devices.inReach(deviceId)) return { computer, until: "reach" };
    if (!this.options.devices.takesCurrentWork(deviceId)) return { computer, until: "update" };
    if (files.length > 0 && !this.takesOutsideFiles(deviceId)) return { computer, until: "update" };
    // An open there unanswered, or one here not yet accepted (still refused), is not to let go.
    const [live, refused] = [heldSession(placed), this.refusedHeld(placed.task)];
    if (placed.asking > 0 || placed.adopting || placed.cleaning || (live && refused))
      return "waiting";
    // An older computer reopens it unchecked: never reattached to (`refusedThere`), let go first.
    const older = !this.listsChange(deviceId, REATTACH_ONLY_OPEN);
    if (older) this.refuseHeld(placed.task, true);
    // Only a session held, only at once: one left for a turn's end would wake its words first.
    if (older && live && !live.isStreaming()) this.host?.letGo?.(placed.task, true);
    if (older && heldSession(placed)) return this.refuseHeld(placed.task, refused), "waiting";
    // Opens there wait for its answer, and words to it for the reopen it asks too.
    let cleaned: (open: boolean | Promise<boolean>) => void = () => {};
    const gate = new Promise<boolean>((done) => (cleaned = done));
    let answered = () => {};
    placed.cleaning = new Promise<void>((done) => (answered = done));
    const before = placed.reopening;
    const held = gate.then(async (open) => open && (await before) !== false);
    placed.reopening = held;
    let answer: WorkOrderResponse<"inf:session:delete-outside"> | undefined;
    let lost: unknown;
    try {
      answer = workOrders["inf:session:delete-outside"].response.parse(
        await this.options.devices.ask(deviceId, "inf:session:delete-outside", [
          {
            orderId: `delete-outside:${record.id}:${this.options.now()}`,
            task: record.id,
            kinds: due.kinds,
            legacy: due.legacy,
            ...(files.length > 0 ? { files: [...files] } : {}),
            // The home opens it again after routing it (`reattach-only-open.md`).
            ...(older ? {} : { holdReopen: true }),
          },
        ]),
      );
    } catch (caught) {
      lost = caught;
    }
    placed.cleaning = undefined;
    answered();
    // A reopen asked meanwhile, which waited for this answer, is the one that opens it again.
    const session = older || placed.adopting ? undefined : heldSession(placed);
    // Let go of there or not known: this Mac opens it again, routed; words given back then go.
    if (session && (!answer || answer.reopen || answer.status === "changed"))
      void this.reopen(placed, session, deviceId).then(() => this.host?.caughtUp([placed.task]));
    if (placed.reopening === held) placed.reopening = before;
    cleaned(placed.reopening ?? true);
    // A wait for that computer's update ends: what it holds is refused now.
    if (older) this.host?.caughtUp([placed.task]);
    if (!answer) {
      if (lost instanceof DeviceOutOfReachError) return { computer, until: "reach" };
      throw lost;
    }
    if (answer.status === "waiting") return "waiting";
    const copied = await placed.record.replaceDue(answer.files, rule, due.legacy);
    if (copied.short) return "waiting";
    return answer.status === "changed" || answers > 0 || copied.any ? "changed" : "unchanged";
  }

  /**
   * The task's conversation there closed for good or restarted: its taken
   * Secrets uses end unknown. Its uses stay named, so a report that arrives
   * later still finds them and changes nothing.
   */
  private secretUsesGone(taskId: string, deviceId: string): void {
    this.secretUses.get(taskId)?.gone({ id: deviceId, label: this.nameOf(deviceId) });
  }

  /**
   * A closed task's copies on computers it moved off while they were out of
   * reach go now for each computer in reach, their work saved here first;
   * one out of reach goes at its next contact (`PlacedCopies.retireLeftover`).
   */
  private removeAwayCopiesIfClosed(taskId: string): void {
    const record = this.options.tasks.get(taskId);
    const copies = record?.shape?.away_copies;
    if (!copies || !TaskService.isClosed(record)) return;
    for (const from of new Set(copies.map((entry) => entry.from))) {
      const left = copies.findLast((entry) => entry.from === from);
      if (left?.kept?.removed !== undefined || !this.options.devices.inReach(from)) continue;
      void this.copies.retireLeftover(from, taskId, this.folders(from, taskId)?.work);
    }
  }

  /**
   * Brings this Mac's copy of a task's conversation record up to what that
   * computer holds, for a conversation there this Mac no longer follows: the
   * one a move off that computer, out of reach, left there.
   */
  private copyRecordThere(deviceId: string, task: string): Promise<void> {
    return new RecordCopy(
      {
        task,
        deviceId,
        devices: this.options.devices,
        now: this.options.now,
        log: this.log,
        following: () => false,
        callOpen: () => false,
      },
      crewmateSessionsDir(this.options.paths, task),
    ).copy();
  }

  private closeIfClosed(taskId: string): void {
    const record = this.options.tasks.get(taskId);
    if (!record?.deviceId || !TaskService.isClosed(record)) return;
    const placed = this.load(taskId, record.deviceId);
    if (placed.closed || !this.options.devices.inReach(record.deviceId)) return;
    this.close(taskId, record.deviceId);
  }

  /**
   * The record closed here: its conversation closes there for good, now or
   * at its next roster, and then its working copy goes there once its work
   * is here (`PlacedCopies.retire`).
   */
  private close(taskId: string, deviceId: string): void {
    const placed = this.load(taskId, deviceId);
    placed.closed = true;
    placed.openCalls.clear();
    placed.endedCalls.clear();
    placed.record.cancelLive();
    const closing = this.closeThere(deviceId, taskId)
      .then(() => {
        this.secretUsesGone(taskId, deviceId);
        return this.copies.retire(taskId);
      })
      .catch((caught: unknown) => {
        placed.closed = false;
        this.log(`could not close ${taskId} there yet: ${errorText(caught)}`);
      });
    this.closing.add(closing);
    void closing.then(() => this.closing.delete(closing));
  }

  /**
   * Closes the task's conversation there for good, under the one order id
   * every close of it uses, or a move's own (`orderId`): every close order
   * the home sends goes through here. A computer admitted to work on this
   * major runs the task's stops and ends the programs holding its folders there
   * first, or hands its stops to the task on that computer that carries its
   * work on, and its answer's report goes on the task's timeline once
   * (docs/leftover-programs.md, "On a computer that runs work").
   */
  private async closeThere(
    deviceId: string,
    task: string,
    orderId = `close:${task}`,
  ): Promise<unknown> {
    const stops = this.listsStops(deviceId);
    const carrier = stops ? this.carrierThere(task, deviceId) : undefined;
    const record = stops ? this.options.tasks.get(task) : undefined;
    const startedAt = record?.startedAt;
    // A merged or answered close keeps the task's kept jobs running there;
    // any other close, a move's or one whose record is gone, removes them,
    // as the computer does when the order says nothing.
    const keeps =
      (record?.status === "done" || record?.status === "dropped") &&
      keepsAtClose(record.closedReason) === "keep";
    const answer = await this.options.devices.ask(deviceId, "inf:session:close", [
      {
        orderId,
        task,
        ...(carrier ? { carriedTo: carrier } : {}),
        ...(typeof startedAt === "number" ? { startedAt } : {}),
        ...(keeps ? { keeps: "keep" as const } : {}),
      },
    ]);
    const parsed = workOrders["inf:session:close"].response.safeParse(answer);
    const report = parsed.success ? parsed.data.leftovers : undefined;
    // An order asked again is answered as it was: its report is noted once.
    const noted = `${deviceId}:${orderId}`;
    if (report && this.options.tasks.get(task) && !this.leftoversNoted.has(noted)) {
      this.leftoversNoted.add(noted);
      const same = JSON.stringify(report);
      const already = this.options.tasks
        .timeline(task)
        .some(
          (event) =>
            event.data?.leftoversComputerId === deviceId &&
            JSON.stringify(leftoversOf(event.data)) === same,
        );
      if (!already) noteLeftovers(this.options.tasks, task, report, deviceId);
    }
    // Its kept jobs run there now, recorded here by that computer (`KeptJobs`, once per job).
    const kept = report?.kept ?? [];
    if (kept.length > 0)
      try {
        this.keptJobs.record(kept, {
          computer: deviceId,
          task,
          key: this.options.tasks.get(task)?.key ?? task,
        });
      } catch (caught) {
        // The close's line already names each kept job; the order's answer still goes back.
        this.log(
          `could not record the kept jobs of ${task}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    return answer;
  }

  /** Close orders whose report is already noted on their task's timeline in this run, by computer and order. */
  private readonly leftoversNoted = new Set<string>();

  /** The task carrying a closed task's work on, when it runs on that same computer. */
  private carrierThere(task: string, deviceId: string): { task: string; key: string } | undefined {
    const record = this.options.tasks.get(task);
    const carrier = record ? openSuccessor(this.options.tasks, record) : undefined;
    if (!carrier || carrier.deviceId !== deviceId) return undefined;
    return { task: carrier.id, key: carrier.key || carrier.id };
  }

  /** Each roster entry's record, by task, read for its computer and close alone. */
  private recordedOn(entries: readonly { task: string }[]): Map<string, TaskRetentionFields> {
    const ids = entries.map((entry) => entry.task);
    return new Map(this.options.tasks.retentionFields(ids).map((record) => [record.id, record]));
  }

  /** What the computer holds now, read whole. */
  private async readRoster(deviceId: string): Promise<WorkOrderResponse<"inf:session:roster">> {
    return rosterSchema.parse(await this.options.devices.ask(deviceId, "inf:session:roster", []));
  }

  // ---- what the home keeps ----------------------------------------------------------

  private device(deviceId: string): Device {
    let device = this.devices.get(deviceId);
    if (!device) {
      device = {
        id: deviceId,
        roster: undefined,
        contact: 0,
        goneSince: this.startedAt,
        reachedAt: undefined,
        saidGone: false,
        rostered: Promise.resolve(),
        rosterRead: () => {},
      };
      this.awaitRoster(device);
      this.devices.set(deviceId, device);
    }
    return device;
  }

  private load(task: string, deviceId: string): Placed {
    const known = this.placed.get(task);
    if (known) return known;
    const ledger = new PlacedLedger(crewmatePlacedDir(this.options.paths, task));
    const kept = ledger.place();
    const placed: Placed = {
      task,
      deviceId,
      through: kept.kept,
      kept: kept.kept,
      ended: kept.ended,
      session: undefined,
      adopting: undefined,
      adoptingSince: undefined,
      asking: 0,
      cleaning: undefined,
      reopening: undefined,
      said: undefined,
      reopenOwed: false,
      ledger,
      calling: new Map(),
      chain: Promise.resolve(),
      replays: [],
      released: false,
      closed: false,
      openCalls: new Set(),
      endedCalls: new Set(),
      record: new RecordCopy(
        {
          task,
          deviceId,
          devices: this.options.devices,
          now: this.options.now,
          ...(this.options.schedule ? { schedule: this.options.schedule } : {}),
          log: this.log,
          following: () => !placed.closed && heldSession(placed) !== undefined,
          callOpen: () =>
            placed.spec?.binding.backend === "claude" &&
            (placed.openCalls.size > 0 || placed.record.awaitsAnyResult(placed.endedCalls)),
        },
        crewmateSessionsDir(this.options.paths, task),
      ),
      spec: undefined,
    };
    this.placed.set(task, placed);
    // The reports a turn this Mac had not finished gave: a restart here replays them.
    placed.replays = ledger
      .lines()
      .filter((line) => line.report !== undefined && line.after >= placed.ended);
    return placed;
  }

  private writeKept(placed: Placed): void {
    try {
      placed.ledger.keepPlace(placed.kept, placed.ended);
    } catch (caught) {
      this.log(`could not keep ${placed.task}'s place: ${errorText(caught)}`);
    }
  }

  // ---- words ------------------------------------------------------------------------

  private devicesWithWork(): Set<string> {
    const devices = new Set<string>();
    for (const record of this.options.tasks.listActive())
      if (record.deviceId) devices.add(record.deviceId);
    return devices;
  }

  computers(): readonly string[] {
    return this.options.computers?.() ?? [];
  }

  nameOf(deviceId: string): string {
    return this.options.deviceName(deviceId) ?? `The other ${COMPUTER.one}`;
  }

  placeOf(deviceId: string): ReturnType<typeof signInPlace> {
    if (this.options.devicePlace) return this.options.devicePlace(deviceId);
    const name = this.nameOf(deviceId);
    return { label: name, where: `on ${name}`, who: name };
  }

  /** The projects a computer's active work belongs to, as one phrase. */
  private projectsOf(deviceId: string): string {
    const names = [
      ...new Set(
        this.options.tasks
          .listActive()
          .filter((record) => record.deviceId === deviceId)
          .map((record) =>
            record.repoId
              ? (this.options.projectName(record.repoId) ?? record.title)
              : record.title,
          ),
      ),
    ];
    if (names.length <= 1) return names[0] ?? "its tasks";
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }
}

/** The conversation, while this Mac holds it and has not let it go. */
function heldSession(placed: Placed): PlacedSession | undefined {
  return placed.session && !placed.session.letGo ? placed.session : undefined;
}
