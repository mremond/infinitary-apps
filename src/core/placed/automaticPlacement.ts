import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { speaksSince } from "@shared/contractFeatures";
import { chipWords, HERE, SYSTEM_WORDS } from "@shared/deviceNames";
import { type ComputerReach, type DeviceView, deviceLabel, deviceRunsWork } from "@shared/devices";
import { forgeOf, type KnownForgeHost } from "@shared/forge";
import {
  PLACEMENT_FACT_MAX_AGE_MS,
  PLACEMENT_FACTS_ORDER,
  PLACEMENT_FACTS_SINCE,
  type PlacementFacts,
  type PlacementSnapshot,
  type PlacementWait,
  placementFactsAnswerSchema,
  placementNamedModelWait,
  placementReason,
  placementWait,
  publishedSystems,
} from "@shared/placement";
import type { RepoView } from "@shared/repos";
import { RESOURCE_READ_TIMEOUT_MS } from "@shared/resources";
import type { WorkShape } from "@shared/routingPolicy";
import type { ComputerForges, ComputerSignIns } from "@shared/signIns";
import { narrowServedThere } from "../models/piAccountLists";
import { thisDeviceSystem } from "../platform";
import type { QuotaCatalogModel } from "../quota/auth";
import { actualComputerPool } from "../routing/computerPool";
import {
  evaluatePlacement,
  floorHold,
  type LeftOut,
  leftOutComputers,
  type PlacementCandidate,
  pickable,
  resolvePlacementRequirements,
  type SystemUnserved,
  unservedSystems,
} from "../routing/placementEngine";
import type { RouteResult, Router } from "../routing/router";
import type { TaskRecord } from "../storage/taskRecords";
import type { TaskService } from "../tasks/taskService";
import type { ComputerChoiceComputer, ComputerPick } from "./computerChoice";
import type { ComputerResourceFeed } from "./computerResourceFeed";
import { withoutSignIn } from "./placedCopies";
import { readPlacementFacts } from "./placementFacts";
import type { WorkDevices } from "./workDevices";

type Facts = {
  facts: PlacementFacts;
  /** What a computer that runs work said it is signed in to; absent for this computer. */
  signIns?: ComputerSignIns | null;
  pool?: ReturnType<typeof actualComputerPool>;
  started: number;
  generation: number;
};
type Read = { result: Promise<Facts | null>; started: number };

/** Where a new Automatic task starts, with what routing chose for it there. */
export type AutomaticChoice = {
  computerId: string | null;
  routed?: RouteResult;
  accountId?: string;
  /** Added computers this comparison left out for a reason only a change ends (`leftOutComputers`). */
  leftOut?: NamedLeftOut[];
};

/** A left-out computer by the name Task Details gives it, and the computer that took the task. */
export type NamedLeftOut = LeftOut & { name: string; took?: string };

/**
 * Why a new Automatic task waits, once every computer was compared. `held` is
 * the route of a wait for the level the task asked for (`floorHold`), which
 * the supervisor holds on that level's reset as it holds a This computer start.
 * `unserved` says no computer runs a system the task requires
 * (`unservedSystems`), which no room or reading ends.
 */
export type AutomaticWait = {
  wait: PlacementWait;
  held?: RouteResult;
  unserved?: SystemUnserved;
  /**
   * The model the captain named, which no computer whose models were read
   * serves now: the first mate asks the captain instead of a silent swap.
   */
  namedUnserved?: string;
  leftOut?: NamedLeftOut[];
};

/** The one start-time admission owner. Resource demand uses the screen/panel feed,
 * not a second sampler. Fresh compatibility is transient; only commitments persist.
 */
export class AutomaticPlacement {
  private readonly generations = new Map<string, number>();
  private readonly reads = new Map<string, Read>();
  private readonly runningSince = new Map<string, number>();
  /**
   * The decision model's answer for each task waiting to start, with the
   * computers in reach when it was asked: asked again only when one comes
   * into or leaves reach. Undefined is unsure or no answer.
   */
  private readonly picks = new Map<string, { reach: string; pick: ComputerPick | undefined }>();
  private readonly stop: (() => void)[];

  constructor(
    private readonly options: {
      tasks: TaskService;
      resources: ComputerResourceFeed;
      work: WorkDevices;
      devices: () => readonly DeviceView[];
      /** Whether a computer is connected on an older Firstmate and takes no new work. */
      takesNoWorkUntilUpdated?: (deviceId: string) => boolean;
      /** The one reach value (`reachFrom`). Absent, out of reach. */
      reachOf?: (deviceId: string) => ComputerReach;
      /** Whether the home follows that computer's update now (`Computers.updatingOf`). */
      updatingOf?: (deviceId: string) => boolean;
      router: Router;
      repo: (id: string) => RepoView | undefined;
      catalog: () => readonly QuotaCatalogModel[];
      /** This Mac's rail, which narrows a computer's Codex and Grok lists (`narrowServedThere`). */
      protectedIds?: (providerId: string) => readonly string[];
      /** The resource receiver's clock: a witness is compared with when its samples began. */
      now?: () => number;
      /** Evidence that the conversation is running, including one reconciled after restart. */
      running: (task: TaskRecord) => boolean;
      localFacts?: typeof readPlacementFacts;
      /**
       * This computer's own sign-ins where projects live, with each one's
       * health, as it lists them for a home (`ForgeSignIns.view`): the same
       * facts a computer that runs work answers with.
       */
      forgeSignIns?: () => ComputerForges["signIns"];
      /** The forge hosts on the person's own servers this computer knows. */
      knownForgeHosts?: () => readonly KnownForgeHost[];
      /** This computer's system and chip; absent, the running process's. */
      home?: () => ReturnType<typeof thisDeviceSystem>;
      /** Re-read inherited choices after asynchronous compatibility reads. */
      eligible?: (record: TaskRecord) => boolean;
      /** This computer's own name, as the computer question names it; absent, "This computer". */
      homeName?: () => string;
      /**
       * The computer question (`computerChoice.ts`): whether its use is on,
       * and the decision model's pick among the computers that can run the
       * task. Absent, or off, the ordinary rules choose.
       */
      chooser?: {
        allowed(): boolean;
        pick(
          record: TaskRecord,
          repo: RepoView,
          shape: WorkShape,
          computers: ComputerChoiceComputer[],
        ): Promise<ComputerPick | undefined>;
      };
    },
  ) {
    this.stop = [
      options.work.onWorkDevice(({ deviceId }) => {
        this.generations.set(deviceId, (this.generations.get(deviceId) ?? 0) + 1);
        for (const key of this.reads.keys())
          if (key.startsWith(`${deviceId}\n`)) this.reads.delete(key);
        for (const record of options.tasks.placement.pendingPlacements())
          if (record.deviceId === deviceId) this.runningSince.delete(record.id);
      }),
      // Witnessed before every sample, so the next reading can free a running
      // task's room, however long since the last start (FI3-1757).
      options.resources.onSample(() => this.witness()),
    ];
  }

  /** A compared computer the home follows the update of now: its words say updating. */
  private updating(computerId: string | null): boolean {
    return computerId !== null && this.options.updatingOf?.(computerId) === true;
  }

  dispose(): void {
    for (const stop of this.stop) stop();
    this.reads.clear();
    this.runningSince.clear();
    this.picks.clear();
  }

  /**
   * The chosen computer never changes, including when the first answer was lost.
   * A wait carries its words when every computer was compared and none chosen,
   * and the held route when it waits for the level its task asked for.
   * `images` says the captain's pictures ride its first turn, so each
   * computer's model is one that reads them (docs/routing.md, "Pictures").
   */
  async choose(
    record: TaskRecord,
    repo: RepoView,
    prompt: string,
    shape: WorkShape,
    options: { ignoreAsk?: boolean; images?: boolean } = {},
  ): Promise<AutomaticChoice | AutomaticWait | undefined> {
    const needs = options.images ? { images: true } : {};
    const existing = this.options.tasks.get(record.id)?.placement;
    if (existing && existing.reservation !== "ended") {
      // Reconcile the SAME preparation. Saved readings are never scheduling inputs.
      const id = existing.snapshot.computerId;
      const facts = await this.facts(
        id,
        repo.path,
        existing.snapshot.requirements.tools ?? [],
        repo.origin ? withoutSignIn(repo.origin) : undefined,
      );
      if (
        !facts ||
        facts.facts.physicalComputerId !== existing.snapshot.physicalComputerId ||
        this.now() - facts.started > PLACEMENT_FACT_MAX_AGE_MS ||
        this.now() < facts.started ||
        (id &&
          (!this.options.work.inReach(id) ||
            facts.generation !== (this.generations.get(id) ?? 0))) ||
        (id && !facts.pool)
      )
        return undefined;
      if (!this.stillCurrent(record, repo)) return undefined;
      return this.options.router.inOrder(async () => {
        const prepared = await this.options.router.prepare({
          ...needs,
          ...(facts.pool ? { pool: facts.pool } : {}),
        });
        if (
          !this.stillCurrent(record, repo) ||
          this.now() - facts.started > PLACEMENT_FACT_MAX_AGE_MS ||
          (id &&
            (!this.options.work.inReach(id) ||
              facts.generation !== (this.generations.get(id) ?? 0)))
        )
          return undefined;
        const preview = this.options.router.preview(prompt, shape, prepared);
        // The computer it chose no longer serves the model the captain named:
        // it waits there for it, as a new start waits, and never swaps.
        if (preview?.named && !preview.named.served)
          return {
            wait: { kind: "model", words: placementNamedModelWait(preview.named.model) },
            namedUnserved: preview.named.model,
          } satisfies AutomaticWait;
        // Only the home starts on its runtime default when routing names no model.
        if (
          !preview ||
          (!preview.result.choice && id !== null) ||
          (preview.requiresReasoningWait && !options.ignoreAsk)
        )
          return undefined;
        const choice = preview.result.choice;
        return {
          computerId: id,
          routed: this.options.router.commit(record.id, preview),
          ...(choice
            ? { accountId: facts.pool?.modelAccounts.get(`${choice.provider}/${choice.id}`) }
            : {}),
        };
      });
    }
    const home = this.options.home?.() ?? thisDeviceSystem();
    const requirements = resolvePlacementRequirements({
      project: repo.placementRequirements,
      task: shape.placement_requirements,
      home,
      workingCopy: true,
    });
    const resourceRound = this.options.resources.readCurrent(); // The same round that views use.
    const computers = [
      {
        computerId: null as string | null,
        name: HERE.This,
        inReach: true,
        system: home.system,
      },
      ...this.options
        .devices()
        .filter((device) => deviceRunsWork(device.kind))
        .map((device) => ({
          computerId: device.id,
          name: deviceLabel(device),
          inReach: this.options.work.inReach(device.id),
          // What it last said it runs, for a computer out of reach now.
          system: device.system,
        })),
    ];
    const origin = repo.origin ? withoutSignIn(repo.origin) : undefined;
    const facts = await Promise.all(
      computers.map((computer) =>
        computer.inReach
          ? this.facts(computer.computerId, repo.path, requirements.tools, origin)
          : null,
      ),
    );
    await resourceRound;
    if (existing) {
      const bound =
        facts[
          computers.findIndex((computer) => computer.computerId === existing.snapshot.computerId)
        ];
      if (bound?.facts.physicalComputerId !== existing.snapshot.physicalComputerId)
        return undefined;
    }
    if (!this.stillCurrent(record, repo)) return undefined;
    const reach = computers
      .filter(
        (computer) =>
          computer.computerId === null || this.options.work.inReach(computer.computerId),
      )
      .map((computer) => computer.computerId ?? "")
      .sort()
      .join("\n");
    const saved = this.picks.get(record.id);
    let ask: ComputerChoiceComputer[] | undefined;
    const result = await this.options.router.inOrder(async () => {
      const routingOptions = await Promise.all(
        facts.map((read) =>
          this.options.router.prepare({ ...needs, ...(read?.pool ? { pool: read.pool } : {}) }),
        ),
      );
      if (!this.stillCurrent(record, repo)) return undefined;
      let now = this.now();
      const live = this.options.resources.snapshot();
      this.reconcile();
      const candidates: PlacementCandidate[] = computers.map((computer, index) => {
        const read = facts[index];
        const valid =
          read &&
          now >= read.started &&
          now - read.started <= PLACEMENT_FACT_MAX_AGE_MS &&
          (computer.computerId === null ||
            (this.options.work.inReach(computer.computerId) &&
              read.generation === (this.generations.get(computer.computerId) ?? 0)));
        const prepared = routingOptions[index];
        const model =
          valid && prepared && (computer.computerId === null || read.pool)
            ? (this.options.router.preview(prompt, shape, prepared) ?? null)
            : null;
        // An explicit start_now already owns acceptance of the existing fallback.
        if (model && options.ignoreAsk) model.requiresReasoningWait = false;
        return {
          computerId: computer.computerId,
          inReach: computer.computerId === null || this.options.work.inReach(computer.computerId),
          ...(computer.computerId !== null &&
          this.options.takesNoWorkUntilUpdated?.(computer.computerId)
            ? { olderFirstmate: true }
            : {}),
          ...(computer.computerId !== null && this.options.reachOf
            ? { reach: this.options.reachOf(computer.computerId) }
            : {}),
          workEnabled: true,
          ...(valid ? { system: read.facts.system, chip: read.facts.chip } : {}),
          physicalComputerId: valid ? read.facts.physicalComputerId : null,
          tools: valid ? read.facts.tools : {},
          projectAccess: valid ? read.facts.projectAccess : "unknown",
          resources: live.computers.find((row) => row.computerId === computer.computerId)
            ?.reading ?? { status: "unknown", reason: "missing" },
          model,
          // The home starts a task with no routed model on its runtime default;
          // a computer that runs work refuses one (`CrewStarts.startTask`).
          runtimeDefault: computer.computerId === null,
        };
      });
      const pick = saved?.reach === reach ? saved.pick : undefined;
      // Ask once per task, and again only when reach changed, while two or
      // more computers can run it. A committed task is never asked about.
      if (!existing && saved?.reach !== reach && this.options.chooser?.allowed()) {
        const choices = this.choices(record, requirements, computers, candidates);
        if (choices.length >= 2) {
          ask = choices;
          return undefined;
        }
      }
      let routed: RouteResult | undefined;
      let wait: AutomaticWait | undefined;
      let onDefault: { computerId: string | null; name: string } | undefined;
      let leftOut: NamedLeftOut[] = [];
      const committed = this.options.tasks.placement.commitPlacement(record.id, (pending) => {
        now = this.now();
        const atCommit = this.options.resources.snapshot();
        for (const [index, candidate] of candidates.entries()) {
          candidate.resources = atCommit.computers.find(
            (row) => row.computerId === candidate.computerId,
          )?.reading ?? { status: "unknown", reason: "missing" };
          const read = facts[index];
          if (!read || now < read.started || now - read.started > PLACEMENT_FACT_MAX_AGE_MS) {
            candidate.physicalComputerId = null;
            candidate.projectAccess = "unknown";
            candidate.model = null;
          }
        }
        // Read the direct relationship and CURRENT execution inside the synchronous
        // commitment, after all asynchronous facts. A null device is home only
        // once execution is recorded; an unstarted answer supplies no locality.
        const current = this.options.tasks.get(record.id);
        const continued = current && !existing ? this.continuedOn(current) : undefined;
        const basis = continued?.task;
        const basisComputer = continued ? { computerId: continued.computerId } : undefined;
        const decision = evaluatePlacement({
          requirements,
          candidates,
          ...(basisComputer ? { basisComputer } : {}),
          reservations: pending.flatMap((task) =>
            task.placement
              ? [
                  {
                    orderId: task.placement.snapshot.orderId,
                    physicalComputerId: task.placement.snapshot.physicalComputerId,
                    demand: task.placement.snapshot.demand,
                  },
                ]
              : [],
          ),
          ...(existing ? { boundComputer: { computerId: existing.snapshot.computerId } } : {}),
          ...(pick && !existing ? { pick } : {}),
        });
        const chosen = decision.chosen;
        const nameOf = (id: string | null) =>
          computers.find((row) => row.computerId === id)?.name ?? "The other computer";
        leftOut = leftOutComputers({
          project: repo.placementRequirements,
          requirements,
          candidates,
          evaluations: decision.candidates,
        }).map((left) => ({
          ...left,
          name: nameOf(left.computerId),
          ...(chosen ? { took: nameOf(chosen.computerId) } : {}),
        }));
        if (!chosen && decision.picked === "wait" && pick) {
          const name = nameOf(pick.computerId);
          const away =
            !this.options.work.inReach(pick.computerId ?? "") && pick.computerId !== null;
          wait = {
            wait: {
              kind: away ? "other" : "room",
              words: away
                ? `Waiting for ${name} to come back: the decision model picked it, reading your standing directions. Existing work stays where it started.`
                : `Waiting for room on ${name}: the decision model picked it, reading your standing directions. Existing work stays where it started.`,
            },
            ...(leftOut.length ? { leftOut } : {}),
          };
          return undefined;
        }
        if (!chosen) {
          const held = floorHold(decision.candidates);
          // A fresh reading's system, else the one the computer last said.
          const unserved = unservedSystems(
            requirements.systems,
            computers.map((computer, index) => ({
              name: computer.name,
              system: candidates[index]?.system ?? computer.system,
            })),
          );
          // The model the captain named, served on no computer whose models were read.
          const named = decision.candidates.find((row) => row.model?.named)?.model?.named?.model;
          const namedUnserved =
            named && !decision.candidates.some((row) => row.model?.named?.served)
              ? named
              : undefined;
          const shown = placementWait(
            decision.candidates.map((row) => ({
              name: nameOf(row.computerId),
              rejections: row.rejections,
              ...(row.reach ? { reach: row.reach } : {}),
              ...(this.updating(row.computerId) ? { updating: true as const } : {}),
              capacity: row.capacity,
            })),
            requirements.demand,
            namedUnserved,
          );
          wait = {
            wait: shown,
            ...(held ? { held } : {}),
            ...(unserved ? { unserved } : {}),
            ...(namedUnserved && shown.kind === "model" ? { namedUnserved } : {}),
            ...(leftOut.length ? { leftOut } : {}),
          };
          return undefined;
        }
        routed = this.options.router.commit(record.id, chosen.model);
        const model = chosen.model.result.choice;
        // A commitment names its model. The runtime default names none, so that
        // start takes the existing unrouted start there, the way it would with
        // routing off, and holds no reservation.
        if (!model) {
          onDefault = { computerId: chosen.computerId, name: nameOf(chosen.computerId) };
          return undefined;
        }
        // The chosen candidate is retained even for a fleet exceeding the explanation cap.
        const rows = [...decision.candidates]
          .sort(
            (a, b) =>
              Number(b.computerId === chosen.computerId) -
              Number(a.computerId === chosen.computerId),
          )
          .slice(0, 64);
        // A Windows home's own system has no published word: its row says it.
        const systems = publishedSystems(requirements.systems);
        const snapshot: PlacementSnapshot = {
          version: 1,
          at: Date.now(),
          computerId: chosen.computerId,
          computerName: nameOf(chosen.computerId),
          physicalComputerId: chosen.physicalComputerId,
          orderId: `prepare:${randomUUID()}`,
          ...(origin ? { origin } : {}),
          ...(decision.basisPreferred && basis && basisComputer
            ? {
                basis: {
                  taskId: basis.id,
                  taskKey: basis.key,
                  computerId: basisComputer.computerId,
                },
              }
            : {}),
          ...(decision.picked === "start" && pick
            ? { picked: { ...(pick.source ? { source: pick.source } : {}) } }
            : {}),
          demand: requirements.demand,
          model,
          acceptedFallback: options.ignoreAsk === true,
          requirements: {
            ...(systems ? { systems } : {}),
            chips: requirements.chips,
            tools: requirements.tools,
            profile: requirements.profile,
            ...(requirements.inherited.length ? { inherited: requirements.inherited } : {}),
          },
          candidateCount: decision.candidates.length,
          candidates: rows.map((row) => {
            const read =
              facts[computers.findIndex((computer) => computer.computerId === row.computerId)];
            const said = candidates.find((each) => each.computerId === row.computerId);
            return {
              computerId: row.computerId,
              name: nameOf(row.computerId),
              physicalComputerId: row.physicalComputerId,
              rejections: row.rejections,
              ...(row.reach ? { reach: row.reach } : {}),
              ...(this.updating(row.computerId) ? { updating: true as const } : {}),
              missingTools: row.missingTools,
              ...(said?.system ? { system: said.system } : {}),
              ...(said?.chip ? { chip: said.chip } : {}),
              reading: row.resources,
              factsAgeMs: read ? Math.max(0, now - read.started) : null,
              capacity: row.capacity,
              reserved: row.reserved,
              remaining: row.remaining,
              model: row.model?.result.choice ?? null,
              preferenceRank: Number.isFinite(row.model?.preferenceRank)
                ? (row.model?.preferenceRank ?? null)
                : null,
            };
          }),
        };
        return snapshot;
      });
      if (onDefault && routed) {
        this.options.tasks.note(record.id, placementReason({ computerName: onDefault.name }), {
          news: true,
          feed: true,
        });
        return {
          computerId: onDefault.computerId,
          routed,
          ...(leftOut.length ? { leftOut } : {}),
        };
      }
      if (!committed || !routed) return wait;
      const pool =
        facts[computers.findIndex((row) => row.computerId === committed.snapshot.computerId)]?.pool;
      return {
        computerId: committed.snapshot.computerId,
        ...(routed ? { routed } : {}),
        ...(leftOut.length ? { leftOut } : {}),
        accountId: pool?.modelAccounts.get(
          `${committed.snapshot.model.provider}/${committed.snapshot.model.id}`,
        ),
      };
    });
    if (ask && this.options.chooser) {
      // Asked outside the routing order, so a slow answer holds no other start.
      const answer = await this.options.chooser.pick(record, repo, shape, ask);
      this.picks.set(record.id, { reach, pick: answer });
      // The readings are read again: a pick is checked against fresh facts.
      return this.choose(record, repo, prompt, shape, options);
    }
    if (result && "computerId" in result) this.picks.delete(record.id);
    return result;
  }

  /**
   * The computers the decision model chooses among: each that can run the
   * task apart from room and which computer serves the better model, and
   * each out of reach that last said it runs a system the task allows.
   */
  private choices(
    record: TaskRecord,
    requirements: ReturnType<typeof resolvePlacementRequirements>,
    computers: readonly { computerId: string | null; name: string; system?: string }[],
    candidates: readonly PlacementCandidate[],
  ): ComputerChoiceComputer[] {
    const decision = evaluatePlacement({
      requirements,
      candidates,
      reservations: this.options.tasks.placement.pendingPlacements().flatMap((task) =>
        task.placement
          ? [
              {
                orderId: task.placement.snapshot.orderId,
                physicalComputerId: task.placement.snapshot.physicalComputerId,
                demand: task.placement.snapshot.demand,
              },
            ]
          : [],
      ),
    });
    const current = this.options.tasks.get(record.id);
    const continued = current ? this.continuedOn(current) : undefined;
    return decision.candidates.flatMap((row, index): ComputerChoiceComputer[] => {
      const computer = computers[index];
      if (!computer) return [];
      const base = {
        computerId: row.computerId,
        name:
          row.computerId === null ? (this.options.homeName?.() ?? computer.name) : computer.name,
        here: row.computerId === null,
        continued: continued !== undefined && continued.computerId === row.computerId,
      };
      if (pickable(row)) {
        const busy = row.rejections.some((each) => each === "cpu-busy" || each === "memory-busy");
        const choice = row.model?.result.choice;
        return [
          {
            ...base,
            status: busy ? "busy" : "room",
            ...(!busy && row.score !== null ? { roomFor: Math.floor(row.score) } : {}),
            ...(choice ? { model: `${choice.provider}/${choice.id}` } : {}),
          },
        ];
      }
      const away =
        row.rejections.includes("out-of-reach") &&
        computer.system !== undefined &&
        requirements.systems.some((system) => system === computer.system);
      return away ? [{ ...base, status: "away" }] : [];
    });
  }

  /**
   * Where the work this task continues ran: its basis, else the task a
   * follow-up was filed from, once that one started.
   */
  private continuedOn(
    current: TaskRecord,
  ): { task: TaskRecord; computerId: string | null } | undefined {
    const relation = this.options.tasks.graph.basisOf(current);
    const basis = relation?.verified ? this.options.tasks.resolve(relation.ref) : undefined;
    const origin = basis ?? this.options.tasks.graph.discoveredOrigins(current.id)[0];
    return origin && origin.startedAt !== null
      ? { task: origin, computerId: origin.deviceId ?? null }
      : undefined;
  }

  /** A sample begun after running was confirmed includes demand; never subtract it twice.
   * After restart/reconnect running must be witnessed again, then a NEW sample must follow.
   * A sample's start is the receiver's own, never rebuilt from its age and a second clock read.
   */
  reconcile(): void {
    const now = this.now();
    for (const task of this.options.tasks.placement.pendingPlacements()) {
      const placement = task.placement;
      if (!placement || !this.options.running(task)) {
        this.runningSince.delete(task.id);
        continue;
      }
      const since = this.runningSince.get(task.id);
      if (since === undefined) {
        this.runningSince.set(task.id, now);
        continue;
      }
      const began = this.options.resources.sampledAt(placement.snapshot.computerId);
      // A witness taken just before a sample was asked for counts for that sample.
      if (began !== undefined && began >= since) {
        this.options.tasks.placement.releasePlacement(
          task.id,
          placement.snapshot.orderId,
          "observed",
        );
        this.runningSince.delete(task.id);
      }
    }
  }

  /** Notes each pending task running now, before a sample that will include it. */
  private witness(): void {
    const now = this.now();
    for (const task of this.options.tasks.placement.pendingPlacements()) {
      if (!this.options.running(task)) this.runningSince.delete(task.id);
      else if (!this.runningSince.has(task.id)) this.runningSince.set(task.id, now);
    }
  }

  /** Late facts never overrule a changed task, parent choice or project. */
  private stillCurrent(record: TaskRecord, repo: RepoView): boolean {
    const current = this.options.tasks.get(record.id);
    if (
      !current ||
      current.status !== "open" ||
      current.branch ||
      current.sessionFile ||
      current.repoId !== record.repoId ||
      current.parentId !== record.parentId ||
      current.prompt !== record.prompt ||
      JSON.stringify(current.intent) !== JSON.stringify(record.intent) ||
      JSON.stringify(current.shape) !== JSON.stringify(record.shape) ||
      this.options.eligible?.(current) === false
    )
      return false;
    const latest = this.options.repo(repo.id);
    return Boolean(
      latest &&
        JSON.stringify([
          latest.path,
          latest.origin,
          latest.runsOn,
          latest.placementRequirements,
        ]) === JSON.stringify([repo.path, repo.origin, repo.runsOn, repo.placementRequirements]),
    );
  }

  private facts(
    id: string | null,
    cwd: string,
    tools: string[],
    origin?: string,
  ): Promise<Facts | null> {
    if (id && !speaksSince(this.options.work.version(id)?.contract ?? "", PLACEMENT_FACTS_SINCE))
      return Promise.resolve(null);
    const key = `${id ?? "home"}\n${JSON.stringify({ origin, tools, cwd: id === null ? cwd : undefined })}`;
    const previous = this.reads.get(key);
    if (previous && this.now() - previous.started < 2_000) return previous.result;
    const started = this.now();
    const generation = id ? (this.generations.get(id) ?? 0) : 0;
    const request = { tools, ...(origin ? { origin } : {}) };
    const ending = new AbortController();
    const reading = id
      ? this.options.work.ask(id, PLACEMENT_FACTS_ORDER, [request]).then((raw) => {
          const answer = placementFactsAnswerSchema.parse(raw);
          const pool = actualComputerPool(
            id,
            this.options.protectedIds
              ? narrowServedThere(answer.signIns, this.options.protectedIds)
              : answer.signIns,
            this.options.catalog(),
            Date.now(),
          );
          return {
            facts: answer,
            signIns: answer.signIns,
            pool: pool && { ...pool, deviceId: id },
            started,
            generation,
          };
        })
      : (this.options.localFacts ?? readPlacementFacts)(request, cwd, {
          signal: ending.signal,
        }).then((facts) => ({
          facts,
          started,
          generation,
        }));
    // Keep the ask single-flight even when it times out. A reconnect invalidates it.
    let done!: (value: Facts | null) => void;
    const result = new Promise<Facts | null>((resolve) => {
      done = resolve;
    });
    // At the limit this computer's read answers with what it has, a check
    // still waiting reading unknown on its own (`readPlacementFacts`); a
    // reader that does not answer then, and another computer's ask, read
    // nothing.
    const timer = setTimeout(() => {
      ending.abort();
      setTimeout(() => done(null), 0).unref();
    }, RESOURCE_READ_TIMEOUT_MS);
    timer.unref();
    const held = { result, started: Infinity };
    this.reads.set(key, held);
    void reading
      .then(
        (value) => done(value),
        () => done(null),
      )
      .finally(() => {
        clearTimeout(timer);
        if (this.reads.get(key) === held) held.started = started;
      });
    return result;
  }

  /**
   * Why a started task cannot run on `computerId` (null is this Mac) once
   * moved there, read from the facts a start reads (docs/helper.md, "Moving
   * a started task"): the system and chip the project and task allow, the
   * programs they require, and, for a project that lives on a forge, that
   * computer's own sign-in there. A fact that cannot be read refuses too.
   * Undefined when nothing stops it.
   */
  async moveRefusal(
    record: Pick<TaskRecord, "shape">,
    repo: RepoView | undefined,
    computerId: string | null,
    name: string,
  ): Promise<string | undefined> {
    const requirements = resolvePlacementRequirements({
      ...(repo?.placementRequirements ? { project: repo.placementRequirements } : {}),
      ...(record.shape?.placement_requirements
        ? { task: record.shape.placement_requirements }
        : {}),
      home: this.options.home?.() ?? thisDeviceSystem(),
      workingCopy: true,
    });
    const origin = repo?.origin ? withoutSignIn(repo.origin) : undefined;
    const read = await this.facts(computerId, repo?.path ?? tmpdir(), requirements.tools, origin);
    if (!read) return `Infinitary could not read what ${name} runs.`;
    const { system, chip, tools } = read.facts;
    if (!system || !requirements.systems.includes(system))
      return `${name} runs ${system ? SYSTEM_WORDS[system] : "a system Infinitary cannot read"}, and this task runs on ${requirements.systems.map((each) => SYSTEM_WORDS[each]).join(" or ")}.`;
    if (!chip || !requirements.chips.includes(chip))
      return `${name} has ${chip ? chipWords(chip, system) : "a chip Infinitary cannot read"}, and this task runs on ${requirements.chips.map((each) => chipWords(each, system)).join(" or ")}.`;
    const missing = requirements.tools.filter((tool) => tools[tool] !== "available");
    if (missing.length)
      return `${name} does not have ${missing.join(", ")}, which this task needs.`;
    // Only a forge's sign-in refuses (INF-1772 R8, the captain: "except for when the project
    // is on a forge that isn't signed in on the destination machine"), read from that
    // computer's own sign-ins, never from whether the project answered; a project in a
    // plain folder or kept here only crosses in a bundle.
    const where = origin ? forgeOf(origin, this.options.knownForgeHosts?.() ?? []) : undefined;
    if (!where?.host || where.kind === "git" || where.kind === "none") return undefined;
    const host = where.host;
    // One reading for both destinations: each computer's own list of sign-ins
    // and their health, where a lapsed one is no sign-in, and no list or a
    // sign-in in unknown health (its file unreadable, or not read yet) is unread.
    const signIns =
      computerId === null ? this.options.forgeSignIns?.() : read.signIns?.forges?.signIns;
    const signIn = signIns?.find((each) => each.host === host);
    if (!signIns || signIn?.state === "unknown")
      return `Infinitary could not read whether ${name} is signed in to ${host}.`;
    if (!signIn || signIn.state === "needs_reauth")
      return `${name} is not signed in to ${host}, where ${repo?.name ?? "its project"} lives.`;
    return undefined;
  }

  private now(): number {
    return this.options.now?.() ?? performance.now();
  }
}
