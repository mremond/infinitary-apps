import type { ComputerBehindError, ContractChangeName } from "../connection/contractChanges";
import { LOCAL_MACHINE_ID } from "../session/session";
import { QUIT_SETTLE_MS, type TaskRuntime } from "./crewRuntime";
import type { CrewSupervisorOptions } from "./crewSupervisorOptions";
import type { RestartWatch } from "./restartWatch";

/** How a save for this computer's own update ended (`saveForUpdate`). */
export type UpdateSaveOutcome = "saved" | "withdrawn";

/** One turn this computer's own update stops (`stopForUpdate`). */
type UpdateTurn = {
  task: TaskRuntime;
  /** The lane row that carries it on. */
  row: number;
  /** Withdraws the stop while it still waits. */
  withdraw: AbortController;
  /** How many calls it runs that the stop waits for. */
  running: number;
  /** Resolves once the turn has ended here, or the stop was withdrawn. */
  ended: Promise<void>;
};

/**
 * What a computer that runs work does itself to save its crew's work before
 * its home updates it (`work-update-saving.md`; docs/helper.md, "Saving its
 * work before an update").
 */
export type SaveThere = {
  /**
   * Its turns stop safely there; resolves once each stopped turn's end is
   * here, naming the tasks whose turn it stopped. Rejects once `signal`
   * aborts, or when the computer could not be asked or did not come back.
   */
  save(signal: AbortSignal): Promise<{ stopped: string[] }>;
  /** Lets the save there go, naming the tasks whose turn it stopped; undefined when it could not be asked. */
  release(): Promise<{ stopped: string[] } | undefined>;
};

/** A computer that runs work while its home updates it (`pauseForUpdate`). */
type RemoteUpdate = {
  computer: string;
  /** It saves its own crew's work, and is let go after (`resumeAfterUpdate`). */
  there: SaveThere | undefined;
  /** Each task whose turn there the update holds, with the lane row that carries it on. */
  turns: Map<string, { task: TaskRuntime; row: number }>;
  /** Tells the update which tasks' running turns there it waits for now. */
  report: () => void;
  /** The pause under way, which a second ask joins. */
  saving: Promise<UpdateSaveOutcome>;
};

/** This computer's own update while it saves the crew's work (`saveForUpdate`). */
type LocalUpdate = {
  turns: Map<string, UpdateTurn>;
  /** Tells the update which tasks' running work it waits for now. */
  report: () => void;
  /** Every turn here has stopped: the copy may be replaced. */
  saved: boolean;
  /** The save under way, which a second ask joins. */
  saving: Promise<UpdateSaveOutcome>;
};

/** A paused task's timeline line while this computer is updated. */
const UPDATE_PAUSE_NOTE = "paused while Infinitary is updated";

/**
 * The feed's one line for a turn an update paused: another computer's
 * update names that computer, and this computer's own names none, since
 * its pause carries no computer (INF-3060 finding 6: it read "undefined").
 * A computer that must be updated before it takes the turn (`behind`)
 * says so: no update may be under way yet.
 */
export function updatePauseLine(
  title: string,
  computer: string | undefined,
  behind?: boolean,
): string {
  if (computer === undefined)
    return `${title} paused while Infinitary is updated. It carries on after the update.`;
  return behind
    ? `${title} waits for Infinitary on ${computer} to be updated. It carries on once ${computer} is.`
    : `${title} paused while Infinitary on ${computer} is updated. It carries on once ${computer} is back.`;
}

/** What the crew's updates reach of the supervisor beyond its options. */
export type CrewUpdatesHost = {
  now(): number;
  /** The crew a restart or an update cut, watched until each carries on. */
  readonly restarts: RestartWatch;
  /** The app is quitting: nothing is paused, saved or carried on now. */
  disposed(): boolean;
  /** Every crewmate open here now. */
  runtimes(): Iterable<TaskRuntime>;
  /** Where a task's crewmate runs: the computer that runs work its record names, or this Mac. */
  machineOf(taskId: string): string;
  /** Resolves once the task's running turn here has ended, at once when none runs. */
  untilTurnOver(task: TaskRuntime): Promise<void>;
  /** Deliver what is due on a task's lane now. */
  sweepTaskLane(taskId: string, now: number): Promise<void>;
  /** Run the ready sweep now. */
  sweepGates(now: number): Promise<void>;
  /** Tell the window the crew's counts changed. */
  broadcastCrewCounts(): void;
};

/**
 * The crew's side of an update (docs/helper.md, "Updated by its home";
 * docs/alpha.md, "Saving work before an update"): a computer that runs
 * work pauses its crewmates while its home updates it, and this computer
 * saves its own crew's work before its copy is replaced, then carries on.
 */
export class CrewUpdates {
  /**
   * The computers being updated now, each by its device id: their
   * crewmates wait as for a computer out of reach (`outOfReach`) until the
   * update is over and the computer is back and caught up.
   */
  private readonly updating = new Map<string, RemoteUpdate>();
  /**
   * This computer's own update while it saves its crew's work and until
   * the copy is replaced or the update is let go (`saveForUpdate`): no
   * turn here starts, and each one running stops where nothing is lost.
   */
  private localUpdate: LocalUpdate | undefined;

  /**
   * The tasks whose turn their computer refused until it is updated
   * (`waitForUpdateThere`), each with the computer and the change it lacks.
   */
  private readonly behind = new Map<string, { deviceId: string; change: ContractChangeName }>();

  constructor(
    private readonly options: Pick<
      CrewSupervisorOptions,
      "inbox" | "machines" | "tasks" | "recallUpdateCard"
    >,
    private readonly host: CrewUpdatesHost,
  ) {}

  /** A computer that runs work is being updated now (`pauseForUpdate`). */
  isUpdating(deviceId: string): boolean {
    return this.updating.has(deviceId);
  }

  /** This computer's own update is saving its crew's work, or saved it and has not replaced the copy. */
  updatingHere(): boolean {
    return this.localUpdate !== undefined;
  }

  /** Every turn this computer's own update stopped has ended: the copy may be replaced. */
  savedHere(): boolean {
    return this.localUpdate?.saved === true;
  }

  /**
   * This computer is being updated and the task's turns run here
   * (`saveForUpdate`): nothing starts a turn for it until the update is
   * over, and what it is sent waits on its lane in order.
   */
  heldForUpdate(taskId: string): boolean {
    return this.localUpdate !== undefined && this.host.machineOf(taskId) === LOCAL_MACHINE_ID;
  }

  /**
   * The task's computer refused its turn until it is updated
   * (`ComputerBehindError`; docs/helper.md, "Waiting for its update"): the
   * turn ends as a pause that never reached its model, so its words go
   * again, and its lane waits (`waitsForUpdateThere`) until the computer
   * lists the change. The task stays open, and nobody is woken: there is
   * nothing to act on but the update, which that computer's one Update card
   * asks the captain for. The first task to wait on that computer brings the
   * card back, even after Not now; the tasks that wait beside it raise no
   * second one.
   */
  waitForUpdateThere(task: TaskRuntime, behind: ComputerBehindError): void {
    const computer = this.options.machines?.nameOf(behind.deviceId) ?? behind.deviceId;
    const first = ![...this.behind.keys()].some(
      (taskId) =>
        this.behind.get(taskId)?.deviceId === behind.deviceId && this.waitsForUpdateThere(taskId),
    );
    this.behind.set(task.id, { deviceId: behind.deviceId, change: behind.change });
    if (first) this.options.recallUpdateCard?.(behind.deviceId);
    task.turn.hold({ computer, unstarted: true, behind: true });
    task.lastTurnError ??= behind.message;
    this.host.restarts.recordRestartOutcome(
      task.id,
      "waiting",
      `Infinitary on ${computer} must be updated first`,
    );
    this.options.tasks.note(task.id, `waits for Infinitary on ${computer} to be updated`, {
      news: true,
    });
  }

  /**
   * The task waits for its computer's update (`waitForUpdateThere`): true
   * until that computer, connected, lists the change it lacked. A task that
   * moved to another computer, or closed, waits no more.
   */
  waitsForUpdateThere(taskId: string): boolean {
    const behind = this.behind.get(taskId);
    if (!behind) return false;
    const record = this.options.tasks.get(taskId);
    const machines = this.options.machines;
    if (
      record?.status !== "active" ||
      record.deviceId !== behind.deviceId ||
      !machines?.listsChange ||
      machines.listsChange(behind.deviceId, behind.change)
    ) {
      this.behind.delete(taskId);
      return false;
    }
    return true;
  }

  /**
   * Each task whose running turn here this computer's own update would stop
   * now, by its title: what a view confirms an update against
   * (`src/shared/homeUpdate.ts`). Turns on other computers go on there.
   */
  wouldStopHere(): string[] {
    return [...this.host.runtimes()]
      .filter((task) => task.turn.running && this.host.machineOf(task.id) === LOCAL_MACHINE_ID)
      .map((task) => task.title);
  }

  /** A turn began while its computer is being updated: it stops too. */
  turnBegan(task: TaskRuntime): void {
    const update = this.updating.get(this.host.machineOf(task.id));
    if (update?.there) this.holdTurn(task, update);
    else if (update) void this.pauseTurn(task, update.computer);
    if (this.localUpdate && this.heldForUpdate(task.id)) this.stopForUpdate(task, this.localUpdate);
  }

  /**
   * The computer is about to be updated (docs/helper.md, "Updated by its
   * home"): nothing is handed to its crew until the update is over and the
   * computer is back and caught up (`outOfReach`), and each crewmate turn
   * running there stops, as a pause and never a failure, with a lane row
   * that carries it on after.
   *
   * A computer that saves its own work (`there`; docs/helper.md, "Saving
   * its work before an update") stops each turn where nothing is lost and
   * decides when it is saved: this resolves `saved` once it says so, with
   * every stopped turn's end here, telling `waiting` meanwhile which tasks'
   * turns there it waits for. Aborting `signal` first lets the update go
   * (Update later) and resolves `withdrawn`; `resumeAfterUpdate` then lets
   * the computer go. Any other computer's turns are cut, and the update
   * waits at most `QUIT_SETTLE_MS` for them to end there. A second ask
   * joins the first.
   */
  pauseForUpdate(
    deviceId: string,
    options: {
      signal?: AbortSignal;
      waiting?: (tasks: string[]) => void;
      there?: SaveThere;
    } = {},
  ): Promise<UpdateSaveOutcome> {
    const known = this.updating.get(deviceId);
    if (known) return known.saving;
    if (this.host.disposed()) return Promise.resolve("saved");
    const computer = this.options.machines?.nameOf(deviceId) ?? deviceId;
    const turns = new Map<string, { task: TaskRuntime; row: number }>();
    const update: RemoteUpdate = {
      computer,
      there: options.there,
      turns,
      report: () =>
        options.waiting?.(
          [...turns.values()].filter(({ task }) => task.turn.running).map(({ task }) => task.title),
        ),
      saving: Promise.resolve("saved"),
    };
    this.updating.set(deviceId, update);
    const running = [...this.host.runtimes()].filter(
      (task) => task.turn.running && this.host.machineOf(task.id) === deviceId,
    );
    if (options.there) {
      for (const task of running) this.holdTurn(task, update);
      update.saving = this.saveThere(update, options.there, options.signal);
    } else if (running.length > 0) {
      const stopping = running.map((task) => this.pauseTurn(task, computer));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const bound = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, QUIT_SETTLE_MS);
      });
      update.saving = Promise.race([Promise.all(stopping), bound])
        .finally(() => clearTimeout(timer))
        .then(() => "saved" as const);
    }
    return update.saving;
  }

  /**
   * Waits for the computer to save its own crew's work, without a bound:
   * it decides when it is saved. Update later (`signal`) stops waiting.
   */
  private async saveThere(
    update: RemoteUpdate,
    there: SaveThere,
    signal?: AbortSignal,
  ): Promise<UpdateSaveOutcome> {
    const withdraw = new AbortController();
    const letGo = () => withdraw.abort();
    if (signal?.aborted) letGo();
    else signal?.addEventListener("abort", letGo, { once: true });
    update.report();
    try {
      await there.save(withdraw.signal);
      if (withdraw.signal.aborted) return "withdrawn";
      update.report();
      return "saved";
    } catch (caught) {
      if (withdraw.signal.aborted) return "withdrawn";
      throw caught;
    } finally {
      signal?.removeEventListener("abort", letGo);
    }
  }

  /**
   * One crewmate's turn there is held for its computer's update, which
   * stops it there where nothing is lost: a lane row says why for the turn
   * that carries it on, and its end is a pause (`turnComplete`) - one that
   * kept what it read, unless the computer quit first or stopped it before
   * its model took it. No interrupt is recorded, so a kept merge approval stands.
   */
  private holdTurn(task: TaskRuntime, update: RemoteUpdate): void {
    if (update.turns.has(task.id) || task.turn.pause || task.turn.closing || !task.session) return;
    const row = this.options.inbox.enqueue(task.id, {
      facts: { kind: "turn-resumed", stopped: "update", computer: update.computer },
    });
    task.turn.hold({ computer: update.computer, row });
    this.notePaused(task, update.computer);
    update.turns.set(task.id, { task, row });
    void this.host.untilTurnOver(task).then(() => update.report());
  }

  /**
   * The update is over, whatever came of it: the computer's crew carries
   * on, each paused crewmate with the lane row its pause left - once the
   * computer is back and caught up (`placedCaughtUp`), or now when it
   * never stopped. A computer that saved its own work is let go first, so
   * a turn it did not stop goes on as if never asked.
   */
  resumeAfterUpdate(deviceId: string): void {
    const update = this.updating.get(deviceId);
    if (!update) return;
    this.updating.delete(deviceId);
    if (this.host.disposed()) return;
    if (!update.there) {
      this.carryOn(deviceId);
      return;
    }
    void this.letGoThere(update, update.there)
      .catch((caught: unknown) => {
        console.warn("[crew] a computer's saved work could not be let go:", caught);
      })
      .finally(() => this.carryOn(deviceId));
  }

  /**
   * Lets the computer's save go there: a held turn it did not stop still
   * runs there, so its pause and its lane row go. One it could not be
   * asked about keeps both, and is carried on.
   */
  private async letGoThere(update: RemoteUpdate, there: SaveThere): Promise<void> {
    const answer = await there.release();
    if (!answer) return;
    for (const { task, row } of update.turns.values()) {
      if (answer.stopped.includes(task.id) || task.turn.pause?.row !== row) continue;
      task.turn.takePause();
      this.options.inbox.withdraw([row]);
      this.host.restarts.forget(task.id);
    }
  }

  /** What waited on the computer's lanes goes now, in order. */
  private carryOn(deviceId: string): void {
    if (this.host.disposed()) return;
    const now = this.host.now();
    for (const taskId of this.options.inbox.recipientsWithRows())
      if (this.host.machineOf(taskId) === deviceId) void this.host.sweepTaskLane(taskId, now);
    void this.host.sweepGates(now);
    this.host.broadcastCrewCounts();
  }

  /**
   * The tasks on a computer that runs work whose turn its update stopped
   * and which have not started again, by title: that computer's Resuming work.
   */
  resumingOn(deviceId: string): string[] {
    const titles: string[] = [];
    for (const taskId of this.options.inbox.recipientsWithRows()) {
      if (this.host.machineOf(taskId) !== deviceId) continue;
      const waits = this.options.inbox
        .allFor(taskId)
        .some(
          (row) =>
            row.deliveredAt === null &&
            row.facts?.kind === "turn-resumed" &&
            row.facts.stopped === "update" &&
            row.facts.computer !== undefined,
        );
      const title = waits ? this.options.tasks.get(taskId)?.title : undefined;
      if (title) titles.push(title);
    }
    return titles;
  }

  /**
   * One crewmate's turn stops for its computer's update: a lane row says
   * why, for the turn that carries it on, and the turn's end there is a
   * pause (`turnComplete`). No interrupt is recorded, so a kept merge
   * approval stands.
   */
  private async pauseTurn(task: TaskRuntime, computer: string): Promise<void> {
    if (task.turn.pause || task.turn.closing || !task.session) return;
    const row = this.options.inbox.enqueue(task.id, {
      facts: { kind: "turn-resumed", stopped: "update", computer },
    });
    task.turn.hold({ computer, row });
    this.notePaused(task, computer);
    try {
      await task.session.abort();
    } catch (caught) {
      // Its end comes with the update instead, and is read as the pause.
      console.warn("[crew] a paused turn could not be stopped:", caught);
    }
  }

  /** A task paused for its computer's update: its restart record waits, and its timeline says why. */
  private notePaused(task: TaskRuntime, computer: string): void {
    this.host.restarts.observe(task.id);
    this.host.restarts.recordRestartOutcome(
      task.id,
      "waiting",
      `Infinitary on ${computer} is being updated`,
    );
    this.options.tasks.note(task.id, `paused while Infinitary on ${computer} is updated`, {
      news: true,
    });
  }

  /**
   * This computer's own copy is about to be replaced (docs/alpha.md,
   * "Saving work before an update"). No new turn starts here and what the
   * crew is sent waits on its lanes in order (`heldForUpdate`); each turn
   * running here stops where nothing is lost - the calls it runs finish and
   * keep their results, the ones it would start are refused and say so,
   * and then the turn is cut, with a lane row that carries it on after the
   * restart. Resolves `saved` once every turn here has stopped, with no
   * bound, telling `waiting` meanwhile which tasks' running work it waits
   * for. Aborting `signal` lets the update go (`releaseUpdate`) and
   * resolves `withdrawn`. A second ask joins the first. Turns on other
   * computers go on there, and an idle or paused task is left as it is.
   */
  saveForUpdate(
    options: { signal?: AbortSignal; waiting?: (tasks: string[]) => void } = {},
  ): Promise<UpdateSaveOutcome> {
    if (this.localUpdate) return this.localUpdate.saving;
    if (this.host.disposed()) return Promise.resolve("saved");
    const turns = new Map<string, UpdateTurn>();
    const report = () =>
      options.waiting?.(
        [...turns.values()].filter((turn) => turn.running > 0).map((turn) => turn.task.title),
      );
    const update: LocalUpdate = { turns, report, saved: false, saving: Promise.resolve("saved") };
    this.localUpdate = update;
    for (const task of [...this.host.runtimes()])
      if (task.turn.running && this.heldForUpdate(task.id)) this.stopForUpdate(task, update);
    update.saving = this.saveTurns(update, options.signal);
    return update.saving;
  }

  /** Waits for every turn the update stops, including one that began meanwhile. */
  private async saveTurns(update: LocalUpdate, signal?: AbortSignal): Promise<UpdateSaveOutcome> {
    let letGo = () => {};
    const withdrawn = new Promise<"withdrawn">((resolve) => {
      letGo = () => resolve("withdrawn");
    });
    if (signal?.aborted) letGo();
    else signal?.addEventListener("abort", letGo, { once: true });
    try {
      for (let asked = -1; asked !== update.turns.size; ) {
        asked = update.turns.size;
        const ended = Promise.all([...update.turns.values()].map((turn) => turn.ended));
        const outcome = await Promise.race([ended.then(() => "saved" as const), withdrawn]);
        if (this.localUpdate !== update) return "withdrawn";
        if (outcome === "withdrawn") {
          this.releaseUpdate();
          return "withdrawn";
        }
      }
      update.saved = true;
      update.report();
      return "saved";
    } finally {
      signal?.removeEventListener("abort", letGo);
    }
  }

  /**
   * One crewmate's turn here stops for this computer's update: a lane row
   * says why for the turn that carries it on, and its end is a pause
   * (`turnComplete`). A session that cannot hold its calls is cut.
   */
  private stopForUpdate(task: TaskRuntime, update: LocalUpdate): void {
    const session = task.session;
    if (update.turns.has(task.id) || task.turn.closing || !session) return;
    const row = this.options.inbox.enqueue(task.id, {
      facts: { kind: "turn-resumed", stopped: "update" },
    });
    task.turn.hold({ row });
    this.host.restarts.observe(task.id);
    this.host.restarts.recordRestartOutcome(task.id, "waiting", "Infinitary is being updated");
    this.options.tasks.note(task.id, UPDATE_PAUSE_NOTE, { news: true });
    const withdraw = new AbortController();
    const turn: UpdateTurn = { task, row, withdraw, running: 0, ended: Promise.resolve() };
    const stopped = session.stopSafely
      ? session.stopSafely({
          signal: withdraw.signal,
          waiting: (calls) => {
            turn.running = calls.length;
            update.report();
          },
        })
      : session.abort().then(() => "stopped" as const);
    turn.ended = stopped
      .catch((caught: unknown) => {
        // Its end comes with the update instead, and is read as the pause.
        console.warn("[crew] a paused turn could not be stopped:", caught);
        return "stopped" as const;
      })
      .then((outcome) => {
        turn.running = 0;
        if (outcome === "stopped") return this.host.untilTurnOver(task);
        // Let go before it was cut: the turn goes on as if never asked.
        if (task.turn.pause?.row === row) {
          task.turn.takePause();
          this.options.inbox.withdraw([row]);
          this.host.restarts.forget(task.id);
        }
      });
    update.turns.set(task.id, turn);
    update.report();
  }

  /**
   * This computer's update was let go, or did not replace the copy
   * (docs/alpha.md, "Saving work before an update"): a turn still stopping
   * goes on as if never asked, one that stopped carries on from its lane
   * row, and what waited on the lanes goes now, in order.
   */
  releaseUpdate(): void {
    const update = this.localUpdate;
    if (!update) return;
    this.localUpdate = undefined;
    for (const turn of update.turns.values()) turn.withdraw.abort();
    if (this.host.disposed()) return;
    const now = this.host.now();
    for (const taskId of this.options.inbox.recipientsWithRows())
      if (this.host.machineOf(taskId) === LOCAL_MACHINE_ID)
        void this.host.sweepTaskLane(taskId, now);
    void this.host.sweepGates(now);
    this.host.broadcastCrewCounts();
  }

  /**
   * The tasks whose turn this computer's own update stopped and which have
   * not started again, by title: the update's Resuming work.
   */
  resumingAfterUpdate(): string[] {
    const titles: string[] = [];
    for (const taskId of this.options.inbox.recipientsWithRows()) {
      const waits = this.options.inbox
        .allFor(taskId)
        .some(
          (row) =>
            row.deliveredAt === null &&
            row.facts?.kind === "turn-resumed" &&
            row.facts.stopped === "update" &&
            row.facts.computer === undefined,
        );
      const title = waits ? this.options.tasks.get(taskId)?.title : undefined;
      if (title) titles.push(title);
    }
    return titles;
  }
}
