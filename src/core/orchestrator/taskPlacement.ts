import type { CutOffClass } from "@shared/authFailure";
import { isRepairAssessment } from "@shared/checkRepair";
import { isCustomApiProvider } from "@shared/customApi";
import { COMPUTER, HERE, PLACE_SAID } from "@shared/deviceNames";
import {
  computerForgeHost,
  computerForgeName,
  deviceForgeGateReason,
  deviceForgeGateRef,
  deviceForgeSignInCardId,
  deviceForgeWaitLine,
  deviceSetupCardId,
  noSignInsWaitLine,
  updateWaitLine,
} from "@shared/deviceSetup";
import { noNewWorkDayLine, noNewWorkWaitLine } from "@shared/deviceUpdateNudge";
import { GITHUB_COM } from "@shared/forge";
import { type Said, said, saidLine } from "@shared/i18n/said";
import { offeringKey } from "@shared/modelSlots";
import {
  AUTOMATIC_COMPUTER,
  AUTOMATIC_WORD,
  placementCandidateLines,
  placementReason,
  UNCOMPARED_WAIT,
} from "@shared/placement";
import { backendForProvider } from "@shared/providers";
import { formatResetText } from "@shared/quota";
import { type RepoView, RUNS_ON_THIS_MAC, runsHereOnly } from "@shared/repos";
import type { WorkShape } from "@shared/routingPolicy";
import { RUNS_ON_SOURCE_WORDS, type TaskRunsOn } from "@shared/taskPolicies";
import type { TaskPlace } from "@shared/tasks";
import { resolveWorkComputer } from "@shared/workComputer";
import type { RouteOptions, RouteResult, Router } from "../routing/router";
import type { PiModelRef } from "../routing/routingEngine";
import { LOCAL_MACHINE_ID, type SessionBinding } from "../session/session";
import type { TaskRecord } from "../storage/taskRecords";
import { TaskService } from "../tasks/taskService";
import { UNCONFIRMED_START_RETURNED } from "../tasks/taskStarts";
import type { CardService } from "./cardService";
import type { PlacementRecord, TaskRuntime } from "./crewRuntime";
import type { CrewmateComputers } from "./crewSession";
import type { CrewSupervisorOptions } from "./crewSupervisorOptions";
import { routesNamed } from "./namedModel";

/** How long a project's next task waits for its computer before the feed says so again. */
export const PLACED_WAIT_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a project's next task waits for on its computer, beyond the computer
 * itself being in reach: its own sign-in a cut-off withholds, any sign-in
 * at all, or its own sign-in for the host its project lives on.
 */
export type PlacedWaitFor =
  | { kind: "cut-off"; provider: string; class: CutOffClass; resetsAt?: number }
  | { kind: "no-sign-ins" }
  | { kind: "update" }
  | { kind: "forge"; host: string };

/**
 * The feed's one line when a computer's only sign-in is cut off
 * (docs/helper.md, "Runs on"). A spent allowance is named as that
 * allowance, never as a sign-in.
 */
export function placedCutOffWaitLine(
  subject: string,
  who: string,
  signIn: { provider: string; class: CutOffClass; resetsAt?: number },
  now: number,
): string {
  if (signIn.class !== "no_headroom")
    return `${subject} waits for ${who}'s own ${signIn.provider} sign-in.`;
  const reset = signIn.resetsAt !== undefined ? formatResetText(signIn.resetsAt, now) : undefined;
  return reset
    ? `${subject} waits for ${who}'s ${signIn.provider} plan's allowance, which ${reset}.`
    : `${subject} waits for ${who}'s ${signIn.provider} plan's allowance to reset.`;
}

/** Start now's refusal for the same wait. */
export function placedCutOffStartRefusal(
  handle: string,
  who: string,
  signIn: { provider: string; class: CutOffClass; resetsAt?: number },
  now: number,
): string {
  if (signIn.class === "no_headroom") {
    const reset = signIn.resetsAt !== undefined ? formatResetText(signIn.resetsAt, now) : undefined;
    const when = reset ? `, which ${reset}` : "";
    return `${handle} waits for ${who}'s ${signIn.provider} plan's allowance${when}. It starts by itself once it resets, and never runs on ${HERE.this} instead.`;
  }
  return `${handle} waits for ${who}'s own ${signIn.provider} sign-in, which no longer serves there. It starts by itself once it serves again, and never runs on ${HERE.this} instead.`;
}

/** Who the feed says waits for a computer (`TaskPlacement.waitSubject`). */
type WaitSubject = {
  key: string;
  name: string;
  /** The line saying how to run it on the first mate's computer instead, as a fact. */
  runHere: Said;
  /** The project's name, for the GitHub card a wait for its computer's sign-in raises. */
  project: string;
};

/** What placement reaches of the supervisor beyond its options. */
export type TaskPlacementHost = {
  now(): number;
  /** The card stack, for the GitHub card a computer's own sign-in raises. */
  readonly cards: CardService;
  /** A task's crewmate here, while it has one. */
  runtime(taskId: string): TaskRuntime | undefined;
  /** Whether a task's computer is out of reach, or back and not yet caught up. */
  outOfReach(taskId: string): boolean;
  /** The builder a review task reads: its parent, the one stored join. */
  reviewBuilderOf(record: PlacementRecord | undefined): TaskRecord | undefined;
  /** Start a queued task now, as the ready sweep does. */
  dispatchQueuedTask(taskId: string): Promise<void>;
  /** The app is quitting: nothing more starts. */
  disposed(): boolean;
};

/**
 * Where a task runs (docs/helper.md, "Runs on" and "A task's own Runs on"):
 * the computer it starts on, the words the feed, the Tasks row and Details
 * say of it, the waits for a computer and its sign-ins, and the routing and
 * binding of a task there. The crew supervisor composes it and its callers
 * reach it as `CrewSupervisor.placement`.
 */
export class TaskPlacement {
  /**
   * A project's next task waiting for the computer it runs on, by project and
   * computer (docs/helper.md, "Runs on"): what it waits for - that computer
   * in reach, or its own sign-in a cut-off withholds - when the wait began
   * and whether the day's line was said, so each line is said once per
   * wait. Kept in memory: after a restart here a wait still standing is
   * said once more.
   */
  private readonly placedWaits = new Map<
    string,
    {
      since: number;
      dayTold: boolean;
      on: "reach" | "no-new-work" | "sign-in" | "allowance" | "no-sign-ins" | "update" | "forge";
    }
  >();
  /**
   * A project's next task waiting for its computer's own GitHub sign-in,
   * said once per project and computer until that computer signs in.
   */
  private readonly deviceForgeSaid = new Set<string>();
  private readonly placeFact = Symbol("task place");

  constructor(
    private readonly options: CrewSupervisorOptions,
    private readonly host: TaskPlacementHost,
  ) {}

  /**
   * The model a start on this Mac runs on when routing placed it on none and
   * its user named one: the account-less session opens on this Mac's runtime,
   * so the named model is served only when that runtime holds it (a
   * models.json provider), and the session is then opened on it. Never on a
   * computer that runs work, which serves only its own subscriptions.
   */
  accountlessNamed(
    named: string,
    machine: string | null,
    routed: RouteResult | undefined,
  ): PiModelRef | undefined {
    if ((machine !== null && machine !== LOCAL_MACHINE_ID) || !routed || routed.choice)
      return undefined;
    return this.options.accountlessModels?.().find((model) => routesNamed(named, model));
  }

  /** Whether a start routed so runs on the named model, as routed or account-less. */
  servesNamed(named: string, machine: string | null, routed: RouteResult | undefined): boolean {
    return (
      routesNamed(named, routed?.choice) ||
      this.accountlessNamed(named, machine, routed) !== undefined
    );
  }

  /**
   * The routing decision for a task where it runs: among this Mac's
   * subscriptions, or for a task on a computer that runs work, among the
   * ones that computer is signed in to, with its own reading of the
   * allowance (docs/helper.md, "Its own sign-ins"). Never this Mac's for a
   * task there. `route` carries a reviewer's provider to prefer away from
   * and whether the captain's pictures ride its first turn.
   */
  async routeTask(
    taskId: string,
    prompt: string,
    shape: WorkShape,
    machine: string | null,
    route: Pick<RouteOptions, "avoidProvider" | "images"> = {},
    publish?: (routed: RouteResult | undefined) => void,
  ): Promise<RouteResult | undefined> {
    const router = this.options.router;
    if (!router) {
      publish?.(undefined);
      return undefined;
    }
    const pool = machine ? await this.options.machines?.served(machine) : undefined;
    if (machine && !pool) {
      publish?.(undefined);
      return undefined;
    }
    return router.inOrder(async () => {
      const options = await router.prepare({ ...route, ...(pool ? { pool } : {}) });
      const routed = router.decide(taskId, prompt, shape, options);
      // A review created after routing becomes visible before the next work read.
      publish?.(routed);
      return routed;
    });
  }

  /**
   * The reviewer question's models where a review would run (INF-5021): the
   * usual pick, a dry run of `routeTask` that records nothing, and each
   * model a person placed that the computer's sign-ins serve, with why it
   * cannot take the review now. Undefined with no routing or an unread
   * computer, where the usual start decides as before.
   */
  async reviewerModels(
    prompt: string,
    shape: WorkShape,
    machine: string | null,
    route: Pick<RouteOptions, "avoidProvider" | "images"> = {},
  ): Promise<ReturnType<Router["reviewerModels"]> | undefined> {
    const router = this.options.router;
    if (!router) return undefined;
    const pool = machine ? await this.options.machines?.served(machine) : undefined;
    if (machine && !pool) return undefined;
    const options = await router.prepare({ ...route, ...(pool ? { pool } : {}) });
    return router.reviewerModels(prompt, shape, options);
  }

  /**
   * A placed task's binding (docs/helper.md, "Its own sign-ins"): its
   * model's own backend, naming that computer's own account that serves the
   * model, else one for the provider, which it binds there. This Mac's
   * accounts never serve it, so the runtime is this Mac's account-less one,
   * which only presents the session's control plane. With no model routed,
   * it binds as a task with none does.
   */
  async placedBinding(
    machine: string,
    provider: string | undefined,
    selectedAccount?: string,
    model?: { provider: string; id: string },
  ): Promise<SessionBinding> {
    if (!provider) return this.options.bind(undefined, undefined);
    const pool = selectedAccount ? undefined : await this.options.machines?.served(machine);
    const there =
      selectedAccount ??
      (model?.provider === provider ? pool?.modelAccounts?.get(offeringKey(model)) : undefined) ??
      pool?.accounts.get(provider);
    if (isCustomApiProvider(provider) && !there)
      throw new Error(
        "This task’s custom connection is not available on the computer it runs on. It cannot use another server automatically.",
      );
    if (backendForProvider(provider) === "claude")
      return { backend: "claude", accountId: there ?? "claude" };
    // Only the control-plane runtime is needed here. The provider's checked
    // connection belongs to that computer, and is resolved by bindHere there.
    const binding = await this.options.bind(undefined, undefined);
    return binding.backend === "pi" && there ? { ...binding, accountId: there } : binding;
  }

  /**
   * Where a task runs (docs/helper.md, "Runs on"): the computer its record
   * names - where it started, or where it waits to start, which follows its
   * Runs on while it has not started (`repoint`) - else where it would
   * start now (`runsOnFor`). Null is this Mac.
   */
  placementOf(record: PlacementRecord): string | null {
    if (record.placement) return record.placement.snapshot.computerId;
    if (record.deviceId) return record.deviceId;
    const target = this.runsOnFor(record);
    return target === AUTOMATIC_COMPUTER ? null : target;
  }

  /**
   * Where a start that has not claimed its task goes (INF-409): Automatic,
   * which compares the computers - a computer it chose, or the home it
   * settled on, is still Automatic's - else the computer `placementOf`
   * names, null for this Mac.
   */
  startPlace(record: PlacementRecord): string | null {
    return this.automaticFor(record) ? AUTOMATIC_COMPUTER : this.placementOf(record);
  }

  automaticFor(record: PlacementRecord): boolean {
    return Boolean(
      this.options.automaticPlacement &&
        !record.branch &&
        !record.sessionFile &&
        (record.placement ||
          (!this.runsOnlyHere(record) && this.runsOnFor(record) === AUTOMATIC_COMPUTER)),
    );
  }

  /**
   * Keeps the latest words for Details and Start now, and says why a task
   * waits once, then again only when the kind of wait changes: each new
   * reading can change the words, and every line is a row in Activity.
   */
  sayAutomaticWait(record: TaskRecord, wait = UNCOMPARED_WAIT): void {
    // The record, not this process: a restart still knows what was said.
    const said = this.options.tasks.get(record.id)?.shape?.placement_wait;
    this.options.tasks.placement.setPlacementWait(record.id, wait);
    if (said?.kind === wait.kind) return;
    this.options.broadcastEvent({
      type: "firstmate_note",
      taskId: record.id,
      // A wait for the captain's model names it, even on the computer it chose.
      text:
        record.placement && wait.kind !== "model"
          ? `"${record.title}" waits for its chosen computer to confirm preparation. It will not start elsewhere.`
          : `"${record.title}": ${wait.words}`,
    });
  }

  /** A current runtime/remote continuation, never a saved activity flag alone. */
  placementRunning(record: TaskRecord): boolean {
    return this.host.runtime(record.id)?.turn.running === true && !this.host.outOfReach(record.id);
  }

  /** Where a task would start now: its own Runs on, else its parent's, else its project's. */
  private runsOnFor(record: PlacementRecord): string | null {
    const own = this.ownRunsOn(record);
    return own ? own.deviceId : this.runsOnOf(record);
  }

  /**
   * Whether a task only ever runs on this Mac: a repair assessment, and
   * one whose project can run only here (`runsHereOnly`), or any task where
   * no computer can run work. A task with no project runs where the captain
   * asks, and here without a word.
   */
  private runsOnlyHere(record: PlacementRecord): boolean {
    // A folder repair runs where the folder is (INF-549).
    if (!this.options.machines || isRepairAssessment(record.shape) || record.shape?.in_place)
      return true;
    if (!record.repoId) return false;
    const repo = this.options.repos.get(record.repoId);
    return !repo || runsHereOnly(repo) !== null;
  }

  /** The project's Runs on for a task of its, or null where it runs on this Mac. */
  private runsOnOf(record: PlacementRecord): string | null {
    if (this.runsOnlyHere(record)) return null;
    return this.options.repos.get(record.repoId ?? "")?.runsOn ?? null;
  }

  /**
   * A task's own Runs on (docs/helper.md, "A task's own Runs on"): the
   * captain's word on the task, else on its nearest parent that has one,
   * with where it came from. Undefined where none does, so it follows its
   * project, and for a task that only ever runs on this Mac. Null is this Mac.
   */
  private ownRunsOn(
    record: PlacementRecord,
  ): { deviceId: string | null; from: "task" | "parent" } | undefined {
    const builder = this.host.reviewBuilderOf(record);
    if (builder) return { deviceId: builder.deviceId ?? null, from: "parent" };
    if (this.runsOnlyHere(record)) return undefined;
    const { tasks } = this.options;
    const parents = record.parentId
      ? [tasks.get(record.parentId), ...tasks.graph.ancestors(record.parentId)]
      : [];
    for (const [index, at] of [record, ...parents].entries()) {
      const ask = at?.shape?.runs_on_ask;
      if (!ask) continue;
      return {
        deviceId: ask === RUNS_ON_THIS_MAC ? null : ask,
        from: index === 0 ? "task" : "parent",
      };
    }
    return undefined;
  }

  /** A task has started: it has a branch, a conversation, or a crewmate now. */
  private started(record: TaskRecord): boolean {
    return Boolean(
      record.placement ||
        record.branch ||
        record.sessionFile ||
        this.host.runtime(record.id) !== undefined,
    );
  }

  /** A task that has not started goes where it would start now; one started stays where it started. */
  private repoint(record: TaskRecord): void {
    if (record.status !== "open" || record.kind !== "work" || this.started(record)) return;
    const requested = this.runsOnFor(record);
    const target = requested === AUTOMATIC_COMPUTER ? null : requested;
    if (target !== (record.deviceId ?? null))
      this.options.tasks.placement.setDevice(record.id, target);
  }

  /**
   * A project's Runs on changed: each of its tasks that has not started
   * goes where its next task starts now, unless the captain chose where it
   * runs, and one already started stays where it started (docs/helper.md,
   * "Runs on").
   */
  projectMoved(repo: RepoView): void {
    for (const record of this.options.tasks.listOpen())
      if (record.repoId === repo.id) this.repoint(record);
  }

  /**
   * The captain's word on where a task runs changed, or the task moved
   * under another parent (docs/helper.md, "A task's own Runs on"): it and
   * each of its parts that has not started go where they would start now.
   */
  runsOnChanged(taskId: string): void {
    const record = this.options.tasks.get(taskId);
    if (!record) return;
    for (const task of [record, ...this.options.tasks.graph.descendants(taskId)])
      this.repoint(task);
  }

  /**
   * Why the captain's word on where a task runs cannot be kept, in plain
   * words, or undefined when it can (docs/helper.md, "A task's own Runs
   * on"). `ask` is a device id, `this-mac`, or null to follow its parent's
   * or project's Runs on again.
   */
  runsOnRefusal(taskId: string, ask: string | null): string | undefined {
    const record = this.options.tasks.get(taskId);
    if (!record) return undefined;
    const handle = `${record.key || record.id} "${record.title}"`;
    if (record.kind !== "work" || TaskService.isClosed(record))
      return `${handle} is not open work, so where it runs cannot change.`;
    if (record.status !== "open" || this.started(record)) {
      const where = record.deviceId
        ? (this.options.machines?.placeOf(record.deviceId).where ?? `on the other ${COMPUTER.one}`)
        : `on ${HERE.this}`;
      return `${handle} has started, so it finishes where it started, ${where}.`;
    }
    return ask === null ? undefined : this.placeRefusal(handle, record, ask);
  }

  /**
   * Where a review of `builder` runs, in words: the builder's computer
   * ("on Mac mini"), wherever Automatic starts the builder, or this one
   * (INF-3718: the refusal of a review's runs_on_ask names it).
   */
  reviewPlaceWords(builder: PlacementRecord): string {
    if (this.automaticFor(builder)) return "wherever its builder starts";
    const device = this.placementOf(builder);
    return device
      ? `on ${this.options.machines?.nameOf(device) ?? `the other ${COMPUTER.one}`}`
      : `on ${HERE.this}`;
  }

  /** Resolve the first mate's placement name before any task record is written. */
  resolveRunsOn(ask: string): string {
    const machines = this.options.machines;
    return resolveWorkComputer(
      ask,
      (machines?.computers() ?? []).map((id) => ({ id, name: machines?.nameOf(id) ?? id })),
    );
  }

  /** Why a task cannot be asked to run at `ask`, or undefined when it can. */
  placeRefusal(handle: string, record: PlacementRecord, ask: string): string | undefined {
    if (record.shape?.kind === "review")
      return `${handle} is a review and follows its builder's computer; its location cannot be chosen separately.`;
    const repo = record.repoId ? this.options.repos.get(record.repoId) : undefined;
    if (record.repoId && !repo) return `${handle} has no project, so it runs on ${HERE.this}.`;
    if (repo?.kind === "personal")
      return `${handle} builds in your personal workspace, which stays on ${HERE.this}.`;
    const here = repo ? runsHereOnly(repo) : null;
    if (repo && here) return `${handle} is in ${repo.name}. ${here}`;
    if (ask === AUTOMATIC_COMPUTER && !record.repoId)
      return "Automatic needs a project that can run on another computer.";
    if (
      ask !== AUTOMATIC_COMPUTER &&
      ask !== RUNS_ON_THIS_MAC &&
      !this.options.machines?.computers().includes(ask)
    )
      return "No computer that runs work has that deviceId. Look with app_state.";
    return undefined;
  }

  /**
   * Where a task runs, as its record's Details reads it (docs/helper.md,
   * "A task's own Runs on"): where it started, or where it would start
   * now, and where that came from. Absent until a computer that runs work
   * is on the list, for a task that only ever runs on this Mac, and for a
   * task with no project that nobody asked to run elsewhere.
   */
  runsOnFact(record: TaskRecord): TaskRunsOn | undefined {
    const machines = this.options.machines;
    if (!machines || record.kind !== "work") return undefined;
    if (
      !record.deviceId &&
      !record.placement &&
      this.runsOnFor(record) !== AUTOMATIC_COMPUTER &&
      (machines.computers().length === 0 || this.runsOnlyHere(record))
    )
      return undefined;
    // A task with no project has no project setting to follow: it says where
    // it runs only once the captain, or its parent, chose.
    if (!record.deviceId && !record.repoId && !this.ownRunsOn(record)) return undefined;
    const settled = TaskService.isClosed(record) || this.started(record);
    const device = settled ? (record.deviceId ?? null) : this.placementOf(record);
    return {
      label:
        !record.placement && !settled && this.runsOnFor(record) === AUTOMATIC_COMPUTER
          ? AUTOMATIC_WORD
          : device
            ? machines.placeOf(device).label
            : HERE.This,
      source: this.ownRunsOn(record)?.from ?? "project",
      ...(record.placement
        ? {
            reason: placementReason(record.placement.snapshot),
            candidates: placementCandidateLines(record.placement.snapshot),
          }
        : !settled && this.runsOnFor(record) === AUTOMATIC_COMPUTER
          ? {
              reason:
                record.startPolicy === "when-ready"
                  ? (record.shape?.placement_wait ?? UNCOMPARED_WAIT).words
                  : "Your first mate chooses a computer when this task starts. It stays there.",
            }
          : {}),
    };
  }

  /**
   * Where a task runs in words, as its Tasks row, its summary and its status
   * read it (docs/helper.md, "Runs on"): the computer it started on, or the
   * one it would start on now, and whether open or underway work's computer
   * is out of reach, or connected and still catching up. Absent for a task
   * this Mac runs.
   */
  taskPlace(record: TaskRecord): TaskPlace | undefined {
    return this.options.tasks.projectedFact(record, this.placeFact, () =>
      this.readTaskPlace(record),
    );
  }

  private readTaskPlace(record: TaskRecord): TaskPlace | undefined {
    const machines = this.options.machines;
    if (!machines || record.kind !== "work") return undefined;
    const settled = TaskService.isClosed(record) || this.started(record);
    const device = settled ? record.deviceId : this.placementOf(record);
    if (!device) return undefined;
    const { label, where } = machines.placeOf(device);
    const live = record.status === "open" || record.status === "active";
    const behind = live && machines.ready(device, record.id) !== true;
    // Connected but not yet caught up is in reach, with since when (INF-1810 finding 7).
    const catchingUpSince = behind ? machines.catchingUpSince?.(device, record.id) : undefined;
    const away = behind && catchingUpSince === undefined;
    // One that has not started waits for a computer that takes no new work, even in reach.
    const older =
      (away || (live && !settled)) && this.options.takesNoWorkUntilUpdated?.(device) === true;
    // Its computer's update, followed from its crew's pause to its end, reads updating whatever its reach.
    const updating = live && this.options.updatingOf?.(device) === true;
    return {
      name: label,
      where,
      reach: older
        ? "out-of-reach"
        : away
          ? this.options.reachOf?.(device) === "connecting"
            ? "connecting"
            : "out-of-reach"
          : "in-reach",
      ...(older ? { noNewWork: true as const } : {}),
      ...(updating ? { updating: true as const } : {}),
      ...(catchingUpSince !== undefined ? { catchingUpSince } : {}),
    };
  }

  /** Whether a computer that runs work is listed, so the captain has more than one (INF-992). */
  computersListed(): boolean {
    return (this.options.machines?.computers().length ?? 0) > 0;
  }

  /**
   * The captain's computers as a crewmate's prompt names them (INF-992):
   * every computer that runs work, and the one this crewmate runs on.
   * Nothing while none is listed, when there is no other computer to know.
   */
  computersFor(machineId: string): { computers?: CrewmateComputers } {
    const machines = this.options.machines;
    if (!machines || machines.computers().length === 0) return {};
    const workers = machines.computers().map((device) => {
      const place = machines.placeOf(device);
      return place.where.startsWith("as ")
        ? { name: place.who, sameComputer: true }
        : { name: machines.nameOf(device) };
    });
    const here =
      machineId === LOCAL_MACHINE_ID
        ? undefined
        : machines.placeOf(machineId).where.startsWith("as ")
          ? machines.placeOf(machineId).who
          : machines.nameOf(machineId);
    // An older computer's emit_card has no files, so its crewmate is not told to use them.
    const cardFiles =
      machineId === LOCAL_MACHINE_ID || machines.takesCardFiles?.(machineId) === true;
    return {
      computers: { workers, ...(here ? { here } : {}), ...(cardFiles ? {} : { cardFiles: false }) },
    };
  }

  /**
   * Whether every computer that runs work puts files on its crewmates'
   * cards, so the first mate may send a file for the captain back to its
   * card (`COMPUTERS_RULE`).
   */
  everyComputerTakesCardFiles(): boolean {
    const machines = this.options.machines;
    return (machines?.computers() ?? []).every(
      (device) => machines?.takesCardFiles?.(device) === true,
    );
  }

  /**
   * Where a project's folder is and where its new tasks start, for the
   * first mate's context (INF-567): the folder is always on this computer,
   * which keeps the record, while its tasks follow the project's Runs on.
   * Absent while no other computer runs work, when the two cannot differ.
   */
  projectPlaces(repo: RepoView): { folder: string; tasks: string } | undefined {
    const machines = this.options.machines;
    if (!machines || machines.computers().length === 0) return undefined;
    const runsOn = runsHereOnly(repo) === null ? repo.runsOn : null;
    return {
      folder: HERE.this,
      tasks:
        runsOn === AUTOMATIC_COMPUTER
          ? AUTOMATIC_WORD
          : runsOn
            ? machines.nameOf(runsOn)
            : HERE.this,
    };
  }

  /** The Details row's words once a task's own Runs on is `ask` ("Mac mini (This task)"). */
  runsOnWords(taskId: string, ask: string | null): string {
    const record = this.options.tasks.get(taskId);
    if (!record) return "";
    const { runs_on_ask: _now, ...shape } = record.shape ?? { kind: "unclear" as const };
    const next = {
      ...record,
      deviceId: null,
      shape: { ...shape, ...(ask ? { runs_on_ask: ask } : {}) },
    };
    const fact = this.runsOnFact(next);
    return fact ? `${fact.label} (${RUNS_ON_SOURCE_WORDS[fact.source]})` : HERE.This;
  }

  /**
   * A task that has not started takes where it would start now, and says
   * whether it must wait for that computer: out of reach, back and not yet
   * caught up, or connected on a version that takes no new work until it is
   * updated (`takesNoWorkUntilUpdated`). It never runs on this Mac instead.
   */
  placeForStart(taskId: string): boolean {
    const record = this.options.tasks.get(taskId);
    if (!record) return false;
    const target = this.placementOf(record);
    if (target && !record.deviceId) this.options.tasks.placement.setDevice(taskId, target);
    if (!(target ? this.waitsForComputer(taskId, target) : this.host.outOfReach(taskId)))
      return false;
    if (target) this.sayPlacedWait(this.waitSubject(record), target);
    return true;
  }

  /**
   * Whether a task that has not started must wait for the computer it runs
   * on: out of reach, or connected on a version that takes no new work until
   * it is updated (`takesNoWorkUntilUpdated`), which holds it even in reach.
   * The start, its outcome words and its settling all read this one fact.
   */
  waitsForComputer(taskId: string, device: string): boolean {
    return this.options.takesNoWorkUntilUpdated?.(device) === true || this.host.outOfReach(taskId);
  }

  /**
   * A task for a computer that serves nothing now but a sign-in a cut-off
   * withholds there, as that computer last said, waits for that sign-in, as
   * a lane on a cut-off account here waits (docs/helper.md, "Its own
   * sign-ins"): it takes its place, tries nothing there, and starts once
   * that sign-in serves again. Says whether it waits.
   */
  waitsForSignIn(taskId: string, target: string): boolean {
    const held = this.options.machines?.signInWait(target);
    const record = this.options.tasks.get(taskId);
    if (!held || !record) return false;
    if (!record.deviceId) this.options.tasks.placement.setDevice(taskId, target);
    this.sayPlacedWait(this.waitSubject(record), target, { ...held, kind: "cut-off" });
    return true;
  }

  /**
   * What a task for a computer waits for before anything is tried there,
   * from what that computer said of its own sign-ins (docs/helper.md, "Its
   * own sign-ins"; the captain's pick on FI3-1350): no sign-in at all, so
   * it waits as queued work and starts by itself once the computer reports
   * one; or, for a project that lives on GitHub, no GitHub sign-in of its
   * own there, so it waits behind a gate that computer's sign-in lifts.
   * Undefined when nothing known keeps it from starting - a computer that
   * has said nothing is tried, and fails the way it always has.
   */
  async placedWaitFor(
    target: string,
    repoId: string | null,
  ): Promise<Extract<PlacedWaitFor, { kind: "no-sign-ins" | "update" | "forge" }> | undefined> {
    // A task with no project starts from this Mac's default workspace sent
    // first, which a computer on an older Firstmate cannot take.
    if (!repoId && this.options.machines?.takesRepoless?.(target) === false)
      return { kind: "update" };
    const signIns = await this.options.machines?.signInsOf(target);
    if (!signIns) return undefined;
    // A task there is routed among that computer's own sign-ins; a home
    // that routes nothing binds what it was given, whatever the computer has.
    if (signIns.accounts.length === 0 && this.options.router) return { kind: "no-sign-ins" };
    // Only a sign-in that computer offers from here is worth waiting for -
    // github.com's code, or GitLab and GitHub Enterprise by their address;
    // a computer too old to offer one is tried, and a refusal there is typed.
    const repo = repoId ? this.options.repos.get(repoId) : undefined;
    const host = computerForgeHost(signIns.forges, repo?.host ?? undefined);
    if (!host || !signIns.forges) return undefined;
    return signIns.forges.signIns.some((entry) => entry.host === host)
      ? undefined
      : { kind: "forge", host };
  }

  /**
   * A queued task for a computer with no sign-in it needs waits, as that
   * computer said (`placedWaitFor`): as unheld queued work for any sign-in
   * at all, which the ready sweep tries again once the computer reports
   * one; behind the sign-in's gate for its own GitHub sign-in.
   */
  waitForSetup(
    taskId: string,
    target: string,
    waitFor: Extract<PlacedWaitFor, { kind: "no-sign-ins" | "update" | "forge" }>,
  ): void {
    const record = this.options.tasks.get(taskId);
    if (!record) return;
    if (!record.deviceId) this.options.tasks.placement.setDevice(taskId, target);
    if (waitFor.kind === "forge") this.holdForDeviceForge(taskId, target, waitFor.host);
    this.sayPlacedWait(this.waitSubject(record), target, waitFor);
  }

  /** The gate a task waits behind for its computer's own GitHub sign-in. */
  holdForDeviceForge(taskId: string, deviceId: string, host: string): void {
    const who = this.options.machines?.placeOf(deviceId).who ?? "the computer it runs on";
    const name = computerForgeName(host);
    const gate = {
      kind: "captain" as const,
      ref: deviceForgeGateRef(host, deviceId),
      reason: deviceForgeGateReason(who, name),
    };
    const record = this.options.tasks.get(taskId);
    if (record?.gate?.ref === gate.ref) return;
    if (record?.status === "open") this.options.tasks.placement.setGate(taskId, gate, gate.reason);
    else this.options.tasks.starts.returnStart(taskId, { kind: "held", gate });
  }

  /**
   * Where a crewmate card's task runs, for a task on a computer that runs
   * work ("on Mac mini", "as Builder"; docs/helper.md, "A card from
   * there"). It rides beside the meta line, never inside it, so a long
   * task title gives way and the place never does.
   */
  cardPlace(taskId: string): string | undefined {
    const device = this.options.tasks.get(taskId)?.deviceId;
    return device ? this.options.machines?.placeOf(device).where : undefined;
  }

  /** The project's name, or the task's title for a task with none. */
  private projectWord(repoId: string | null, title: string): string {
    return (repoId ? this.options.repos.get(repoId)?.name : undefined) ?? title;
  }

  /**
   * Who the feed says waits for a computer (design skill
   * `components/devices/RunsOn`): the task, by its title, where the
   * captain chose where it runs; else its project's next task. A wait is
   * said once per subject and computer.
   */
  waitSubject(record: PlacementRecord & { id: string; title: string }): WaitSubject {
    const project = this.projectWord(record.repoId, record.title);
    if (this.ownRunsOn(record)) {
      const name = `"${record.title}"`;
      return {
        key: `task:${record.id}`,
        name,
        runHere: said("feedRunTaskHereInstead", {
          task: name,
          computer: PLACE_SAID.this,
          here: PLACE_SAID.here,
        }),
        project,
      };
    }
    return {
      key: record.repoId ?? record.title,
      name: `${project}'s next task`,
      runHere: said("feedRunProjectHereInstead", {
        project,
        computer: PLACE_SAID.this,
        here: PLACE_SAID.here,
      }),
      project,
    };
  }

  /** A project's next task as the subject of a wait, where no task record names one yet. */
  private projectSubject(repo: { id: string; name: string }): {
    key: string;
    name: string;
    project: string;
  } {
    return { key: repo.id, name: `${repo.name}'s next task`, project: repo.name };
  }

  /**
   * The feed's words for a task waiting for its computer (design skill
   * `components/devices/RunsOn`): once when the wait begins, and once more
   * after a day. Feed lines, never cards.
   */
  sayPlacedWait(subject: WaitSubject, device: string, waitFor?: PlacedWaitFor): void {
    const key = `${subject.key}\n${device}`;
    const place = this.options.machines?.placeOf(device);
    if (!place) return;
    const now = this.host.now();
    const older = !waitFor && this.options.takesNoWorkUntilUpdated?.(device) === true;
    const on = !waitFor
      ? older
        ? "no-new-work"
        : "reach"
      : waitFor.kind === "cut-off"
        ? waitFor.class === "no_headroom"
          ? "allowance"
          : "sign-in"
        : waitFor.kind;
    const wait = this.placedWaits.get(key);
    if (wait?.on !== on) {
      this.placedWaits.set(key, { since: now, dayTold: false, on });
      // A project's task waiting for that computer's own GitHub sign-in
      // raises the GitHub card too, unless its setup card already asks.
      if (waitFor?.kind === "forge") {
        this.deviceForgeSignInNeeded(device, waitFor.host, subject);
        return;
      }
      // The wait begins: the Update card returns, even after Not now.
      if (older) this.options.recallUpdateCard?.(device);
      this.options.broadcastEvent({
        type: "firstmate_note",
        text: !waitFor
          ? older
            ? noNewWorkWaitLine(subject.name, place.who)
            : `${subject.name} waits for ${place.who}. It never runs on ${HERE.this} instead.`
          : waitFor.kind === "cut-off"
            ? placedCutOffWaitLine(subject.name, place.who, waitFor, now)
            : waitFor.kind === "update"
              ? updateWaitLine(place.label, subject.name)
              : noSignInsWaitLine(place.label, subject.name),
      });
      return;
    }
    // A sign-in or a spent allowance there comes back on its own: no day's line.
    if (
      (on !== "reach" && on !== "no-new-work") ||
      wait.dayTold ||
      now - wait.since < PLACED_WAIT_DAY_MS
    )
      return;
    wait.dayTold = true;
    this.options.broadcastEvent({
      type: "firstmate_note",
      text:
        on === "no-new-work"
          ? noNewWorkDayLine(place.label, subject.name)
          : `${place.label} has been out of reach for a day. ${subject.name} still waits.`,
    });
    this.options.broadcastEvent({ type: "firstmate_note", ...saidLine(subject.runHere) });
  }

  /** A task started on the computer it waited for: the wait's last line. */
  sayPlacedStarted(taskId: string): void {
    const record = this.options.tasks.get(taskId);
    const device = record?.deviceId;
    if (!record || !device) return;
    const subject = this.waitSubject(record);
    if (!this.placedWaits.delete(`${subject.key}\n${device}`)) return;
    const place = this.options.machines?.placeOf(device);
    if (!place) return;
    this.options.broadcastEvent({
      type: "firstmate_note",
      text: `${subject.name} started ${place.where}.`,
    });
  }

  /**
   * A start whose contact was lost: once the computer is back, a recorded
   * session means it started, and none means it did not. Neither is a
   * confirmed failure, and Start stays unavailable until that is known.
   */
  reconcileStartChecks(): void {
    for (const id of this.options.tasks.starts.startAttemptIds()) {
      const attempt = this.options.tasks.starts.startAttemptOf(id);
      if (attempt?.phase !== "checking") continue;
      const record = this.options.tasks.get(id);
      if (!record) {
        this.options.tasks.starts.clearStartAttempt(id);
        continue;
      }
      if (record.sessionFile || this.host.runtime(id) !== undefined) {
        this.options.tasks.starts.clearStartAttempt(id);
        continue;
      }
      if (record.placement) continue; // its durable order, not roster absence, owns reconciliation
      if (record.deviceId && this.host.outOfReach(id)) continue;
      this.options.tasks.starts.returnStart(id, {
        kind: "retry",
        text: UNCONFIRMED_START_RETURNED,
      });
    }
  }

  /**
   * A project that lives on a host runs on a computer with no sign-in of
   * its own there (docs/forge.md, "A computer's own sign-in"): the feed
   * says its next task waits for that sign-in, and the host's GitHub card
   * for that computer goes up - unless that computer's setup card is on the
   * stack, which already asks for the sign-in in its own row.
   */
  deviceForgeSignInNeeded(
    deviceId: string,
    host: string,
    subject: { key: string; name: string; project: string },
  ): void {
    const place = this.options.machines?.placeOf(deviceId);
    if (!place) return;
    const name = computerForgeName(host);
    // Said once per subject and computer, until that computer signs in.
    const said = `${deviceForgeGateRef(host, deviceId)}\n${subject.key}`;
    if (!this.deviceForgeSaid.has(said)) {
      this.deviceForgeSaid.add(said);
      this.options.broadcastEvent({
        type: "firstmate_note",
        text: deviceForgeWaitLine(subject.name, place.who, name),
      });
    }
    // The setup card asks for github.com's sign-in alone, so only that
    // host's card waits behind it; every other host asks for its own.
    if (host === GITHUB_COM && this.host.cards.has(deviceSetupCardId(deviceId))) return;
    this.host.cards.hostCards.addDeviceForgeSignInCard({
      deviceId,
      host,
      name,
      project: subject.project,
      place,
    });
    this.host.cards.scheduleBroadcast();
  }

  /** The same, for a project set to run on such a computer before any task of its own waits. */
  projectForgeSignInNeeded(
    deviceId: string,
    host: string,
    repo: { id: string; name: string },
  ): void {
    this.deviceForgeSignInNeeded(deviceId, host, this.projectSubject(repo));
  }

  /**
   * A computer said something new of its own sign-ins: a project's next
   * task that waits for it to have any sign-in at all is tried now, not at
   * the next tick. Only such a wait is retried here; everything else keeps
   * to the ready sweep, so nothing here races a start already under way.
   */
  deviceSignInsChanged(deviceId: string): void {
    const waiting = [...this.placedWaits].some(
      ([key, wait]) => wait.on === "no-sign-ins" && key.endsWith(`\n${deviceId}`),
    );
    if (!waiting) return;
    for (const record of this.options.tasks.graph.listReady()) {
      if (record.kind !== "work" || record.deviceId !== deviceId) continue;
      void this.host.dispatchQueuedTask(record.id).catch((caught: unknown) => {
        console.warn("[crew] a placed task's start after a sign-in failed:", caught);
      });
    }
  }

  /**
   * A computer reported its own sign-in for a host where projects live: its
   * GitHub card comes down, and every task held for that sign-in starts.
   * A quit, even one during a start here, lifts no more holds: each task
   * left keeps its hold until that computer next says its sign-in.
   */
  async resumeDeviceForgeSignInTasks(deviceId: string, host: string): Promise<void> {
    if (this.host.disposed()) return;
    this.host.cards.hostCards.clearAuthDecisionCard(deviceForgeSignInCardId(host, deviceId));
    const ref = deviceForgeGateRef(host, deviceId);
    for (const said of [...this.deviceForgeSaid])
      if (said.startsWith(`${ref}\n`)) this.deviceForgeSaid.delete(said);
    for (const record of this.options.tasks.listOpen()) {
      if (this.host.disposed()) return;
      if (record.kind !== "work" || record.gate?.ref !== ref) continue;
      this.options.tasks.placement.setGate(
        record.id,
        null,
        `its computer's own ${computerForgeName(host)} sign-in is ready`,
      );
      await this.host.dispatchQueuedTask(record.id);
    }
  }
}
