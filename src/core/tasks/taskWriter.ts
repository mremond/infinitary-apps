import { isForkReview } from "@shared/mergeReview";
import { deliveryForRecord } from "@shared/repos";
import type { WorkShape } from "@shared/routingPolicy";
import { askedFromTheCommand, THROUGH_THE_COMMAND } from "../askedFromTheCommand";
import { AskStore } from "../storage/askStore";
import { currentChange, placeStories, storyLedgers } from "../storage/changeProjection";
import type { AppDatabase } from "../storage/db";
import { ProjectStore } from "../storage/projectStore";
import {
  type InsertTaskEvent,
  type TaskConcern,
  type TaskConcernRelation,
  type TaskEvent,
  type TaskEventActor,
  TaskEventStore,
} from "../storage/taskEventStore";
import { type TaskLink, TaskLinkStore, type TaskLinkType } from "../storage/taskLinkStore";
import { type TaskDelivery, type TaskRecord, TaskStore } from "../storage/taskRecords";
import type { TaskReferenceStore } from "../storage/taskReferenceStore";
import { TaskSessionStore } from "../storage/taskSessionStore";
import type { BlockingEdge } from "./taskGraph";
import type { TaskServiceOptions } from "./taskService";
import { compactTimeline } from "./timelineCompaction";

/**
 * One committed mutation, as the protocol sees it: the board sequence it
 * committed under, the rows it touched, the timeline events it inserted,
 * and whether rows vanished (a failed spawn's discard, the D-13 purge) so a
 * consumer rebuilds rather than patching.
 */
export type TaskChange = {
  seq: number;
  taskIds: string[];
  events: TaskEvent[];
  /** Ids of rows the mutation deleted; they are not in `taskIds`. */
  removed: string[];
  reset: boolean;
  /**
   * Only the presentation pass republishing rows (`refreshPresentation`):
   * it changes nothing a status reads, so it asks for no further pass.
   */
  republish?: true;
  /**
   * A derived presentation changed with no row written
   * (`invalidatePresentation`): a reader that keeps rows between changes
   * reads every row's live facts again.
   */
  presentation?: true;
};

export type TaskChangeListener = (change: TaskChange) => void;

type PendingChange = {
  presentation: boolean;
  republish: boolean;
  taskIds: Set<string>;
  events: TaskEvent[];
  removed: Set<string>;
  reset: boolean;
};

function freshPending(): PendingChange {
  return {
    presentation: false,
    republish: false,
    taskIds: new Set(),
    events: [],
    removed: new Set(),
    reset: false,
  };
}

const LINK_END_RELATION: Record<TaskLinkType, TaskConcernRelation> = {
  blocks: "waiter",
  "discovered-from": "origin",
  "replaced-by": "replacement",
  related: "related",
};

/** How a link's `from` stands to its `to`. */
const LINK_FROM_RELATION: Record<TaskLinkType, TaskConcernRelation> = {
  blocks: "blocker",
  "discovered-from": "follow-up",
  "replaced-by": "replaced",
  related: "related",
};

/**
 * A task's milestones, the events the tasks linked to it read (FI3-1189's
 * rule 1): filed, started, a pull request opened, merged, and closed - for
 * good, failed included - with why.
 */
function isMilestone(event: InsertTaskEvent): boolean {
  const status = event.data?.status;
  switch (event.kind) {
    case "created":
    case "dispatched":
    case "pr_opened":
    case "merged":
    case "landed":
      return true;
    case "status":
    case "failed":
      return status === "done" || status === "dropped";
    default:
      return false;
  }
}

/** How the record's words name a task: its key, or its id before it has one. */
export function keyOrId(record: { key: string; id: string }): string {
  return record.key || record.id;
}

/**
 * A shape with one key set, or without it when `value` is undefined; every
 * other key stays as it was, and a set key moves to the end.
 */
export function withShapeKey<K extends Exclude<keyof WorkShape, "kind">>(
  shape: WorkShape | null | undefined,
  key: K,
  value: WorkShape[K] | undefined,
): WorkShape {
  const { [key]: _old, ...rest } = shape ?? { kind: "unclear" as const };
  return (value === undefined ? rest : { ...rest, [key]: value }) as WorkShape;
}

/** A committed observation accompanying an owner-specific record write. */
export type DeliveryObservation = {
  kind: "ci" | "pr_opened" | "review" | "cap_reset" | "note";
  text: string;
  feed?: boolean;
  actor?: TaskEventActor;
  /**
   * Provenance that rides the timeline event but is no delivery fact:
   * which review a verdict came from (the replay scorer reads it).
   */
  data?: Record<string, unknown>;
};

/**
 * The one task writer's state and its write seam (taskService.ts says what
 * the writer guarantees): the stores, the clock, the change listeners, the
 * read projection and the pending change. The task service and its parts
 * reach the tables only through it, and every write runs inside `write()`.
 */
export class TaskWriter {
  readonly db: AppDatabase;
  readonly store: TaskStore;
  projection:
    | {
        workAfter: Map<string, { id: string; inherit: boolean }[]>;
        linksTo: Map<string, TaskLink[]>;
        linksFrom: Map<string, TaskLink[]>;
        blockers: Map<string, TaskRecord[]>;
        blocksIn: Map<string, BlockingEdge[]>;
        activeWaiters: Map<string, TaskRecord[]>;
        facts: Map<object, Map<symbol, unknown>>;
      }
    | undefined;
  readonly events: TaskEventStore;
  readonly links: TaskLinkStore;
  readonly references: TaskReferenceStore;
  readonly asks: AskStore;
  readonly conversations: TaskSessionStore;
  readonly projects: ProjectStore;
  readonly now: () => number;
  readonly listeners = new Set<TaskChangeListener>();
  /** Nesting depth of `write()`; only the outermost commit notifies. */
  depth = 0;
  pending: PendingChange = freshPending();

  constructor(private readonly options: TaskServiceOptions) {
    this.db = options.db;
    this.store = new TaskStore(options.db);
    this.events = new TaskEventStore(options.db);
    this.links = new TaskLinkStore(options.db);
    this.references = this.store.references;
    this.asks = new AskStore(options.db);
    this.conversations = new TaskSessionStore(options.db);
    this.projects = new ProjectStore(options.db);
    this.now = options.now ?? (() => Date.now());
  }

  /** A task by id or by key (`FM3K-12`, any case); tools accept either. */
  resolve(ref: string): TaskRecord | undefined {
    const trimmed = ref.trim();
    if (!trimmed) return undefined;
    return this.store.get(trimmed) ?? this.store.byKey(trimmed);
  }

  writeDeliveryRecords(
    id: string,
    patch: Partial<TaskDelivery>,
    event?: DeliveryObservation,
  ): void {
    const at = this.now();
    const run = this.write(() => {
      const record = this.mustGet(id);
      const delivery = this.mergeDelivery(record, patch);
      // A write that would save every record as it stands is an exact no-op:
      // the task keeps its updated time and the board does not move
      // (INF-2220). An observation's timeline line is always written.
      if (!event && !this.store.deliveryMoves(id, delivery)) return;
      this.patch(id, { delivery, updatedAt: at });
      if (event) {
        const { liveValidation: _validationState, ...eventPatch } = patch;
        this.addEvent({
          taskId: id,
          at,
          actor: event.actor ?? "host",
          kind: event.kind,
          text: event.text,
          data: { ...eventPatch, ...event.data },
          feed: event.feed ?? false,
        });
      }
    });
    run();
  }

  /**
   * A write transaction with the change seam around it. Returns a runner
   * like `db.transaction` does. Nested calls join the outer transaction (a
   * savepoint) and the outer one alone bumps the sequence and notifies -
   * after its commit, so a listener never sees an uncommitted row. A
   * transaction that throws discards what it collected.
   */
  write<T>(fn: () => T): () => T {
    const inner = this.db.transaction(() => {
      const projection = this.projection;
      this.projection = undefined;
      try {
        return this.store.writeOutsideProjection(fn);
      } finally {
        if (projection) for (const reads of Object.values(projection)) reads.clear();
        this.projection = projection;
      }
    });
    return () => {
      if (this.depth > 0) {
        this.depth += 1;
        try {
          return inner();
        } finally {
          this.depth -= 1;
        }
      }
      this.depth = 1;
      let seq = 0;
      let result: T;
      try {
        result = this.db.transaction(() => {
          const value = inner();
          if (this.hasPendingChange()) seq = this.store.bumpBoardSeq();
          return value;
        })();
      } catch (caught) {
        this.pending = freshPending();
        throw caught;
      } finally {
        this.depth = 0;
      }
      const pending = this.pending;
      this.pending = freshPending();
      if (seq > 0) {
        const change: TaskChange = {
          seq,
          taskIds: [...pending.taskIds],
          events: pending.events,
          removed: [...pending.removed],
          reset: pending.reset,
          ...(pending.republish ? { republish: true as const } : {}),
          ...(pending.presentation ? { presentation: true as const } : {}),
        };
        for (const listener of this.listeners) {
          try {
            listener(change);
          } catch (caught) {
            console.warn("[tasks] change listener failed:", caught);
          }
        }
      }
      return result;
    };
  }

  private hasPendingChange(): boolean {
    const { taskIds, events, removed, reset } = this.pending;
    return (
      this.pending.presentation ||
      reset ||
      taskIds.size > 0 ||
      events.length > 0 ||
      removed.size > 0
    );
  }

  touch(id: string): void {
    this.pending.taskIds.add(id);
  }

  /**
   * Every row write. A patch that moves a row to a closed status always
   * carries `closed_at` (WI-7): a closed row without one is invisible to the
   * board's recent window, so no close path may forget it.
   */
  patch(id: string, patch: Parameters<TaskStore["update"]>[1]): void {
    // Date source transitions, not unrelated edits or resource refreshes.
    if ("gate" in patch || "startPolicy" in patch || patch.status === "open" || patch.startNotice) {
      const before = this.mustGet(id);
      const policyChanged =
        (patch.startPolicy !== undefined && patch.startPolicy !== before.startPolicy) ||
        (patch.status === "open" && before.status !== "open") ||
        Boolean(patch.startNotice);
      const gateChanged =
        "gate" in patch &&
        (patch.gate?.kind !== before.gate?.kind ||
          patch.gate?.ref !== before.gate?.ref ||
          patch.gate?.until !== before.gate?.until);
      if ((before.status === "open" || patch.status === "open") && (policyChanged || gateChanged)) {
        const shape = patch.shape ?? before.shape ?? { kind: "unclear" as const };
        const at = patch.updatedAt ?? this.now();
        patch = {
          ...patch,
          shape: {
            ...shape,
            start_wait_since: {
              ...before.shape?.start_wait_since,
              ...(policyChanged ? { policy: at } : {}),
              ...(gateChanged ? { gate: at } : {}),
            },
          },
        };
      }
    }
    const closing = patch.status === "done" || patch.status === "dropped";
    const stamped =
      closing && patch.closedAt == null
        ? { ...patch, closedAt: patch.updatedAt ?? this.now() }
        : patch;
    this.store.update(id, stamped);
    this.touch(id);
  }

  /**
   * Every timeline write. The event is written once, on its own task, and
   * names the other tasks it concerns (`concernsOf`) in the same
   * transaction; those tasks are touched so their readers read it.
   */
  addEvent(written: InsertTaskEvent, about: readonly string[] = []): number {
    // The captain's own command acts as the captain; what it causes says so (INF-1895).
    const event: InsertTaskEvent =
      written.actor === "captain" && askedFromTheCommand()
        ? { ...written, data: { ...written.data, through: THROUGH_THE_COMMAND } }
        : written;
    const id = this.events.insert(event);
    this.touch(event.taskId);
    const concerns = this.concernsOf(event, about);
    if (concerns.length > 0) {
      this.events.insertConcerns(id, concerns);
      for (const concern of concerns) this.touch(concern.taskId);
    }
    this.pending.events.push({
      id,
      taskId: event.taskId,
      at: event.at,
      actor: event.actor,
      kind: event.kind,
      text: event.text,
      data: event.data ?? null,
      ref: event.ref ?? null,
      feed: event.feed ?? true,
    });
    const compacted = compactTimeline(this.events, event.taskId);
    if (compacted) this.pending.events.push(compacted);
    return id;
  }

  /**
   * The other tasks an event concerns (docs/task-record.md, "Whom an event
   * concerns"), read only from the typed links as they stand when it is
   * written: a link's other end; for a milestone (`isMilestone`), the
   * parent, the tasks it blocks, the origin it was filed from, the task
   * its basis names, and the task it replaced together with that one's own
   * (`via`); and the tasks a
   * writer names (`about`, such as the blockers a refused merge waits on),
   * each by the link that joins it to the event's task.
   */
  private concernsOf(event: InsertTaskEvent, about: readonly string[]): TaskConcern[] {
    const found = new Map<string, TaskConcern>();
    const add = (taskId: string, relation: TaskConcernRelation, via: string | null) => {
      if (taskId !== event.taskId && !found.has(taskId) && this.store.get(taskId)) {
        found.set(taskId, { taskId, relation, via });
      }
    };
    const data = event.data ?? {};
    if ((event.kind === "linked" || event.kind === "unlinked") && typeof data.fromId === "string") {
      const type = data.type as TaskLinkType;
      add(data.fromId, LINK_END_RELATION[type] ?? "related", null);
    }
    if (isMilestone(event)) {
      const seen = new Set<string>([event.taskId]);
      const walk = (id: string, via: string | null) => {
        const record = this.store.get(id);
        if (!record) return;
        if (record.parentId) add(record.parentId, "part", via);
        for (const link of this.links.listFrom(id)) {
          if (link.type === "blocks") add(link.toId, "blocker", via);
          else if (link.type === "discovered-from") add(link.toId, "follow-up", via);
        }
        for (const link of this.links.listTo(id, "replaced-by")) {
          add(link.fromId, "replacement", via);
          if (seen.has(link.fromId)) continue;
          seen.add(link.fromId);
          walk(link.fromId, link.fromId);
        }
      };
      walk(event.taskId, null);
      // The task it names as its basis reads what became of the work built
      // on it (INF-976), closed or not.
      const basis = this.store.get(event.taskId)?.shape?.basis;
      const built = basis ? this.resolve(basis) : undefined;
      if (built) add(built.id, "built-on", null);
    }
    for (const taskId of about) {
      const relation = this.relationBetween(event.taskId, taskId);
      if (relation) add(taskId, relation, null);
    }
    return [...found.values()];
  }

  /** How task `from` stands to task `to` by the one link or parent edge that joins them. */
  private relationBetween(from: string, to: string): TaskConcernRelation | undefined {
    const record = this.store.get(from);
    const other = this.store.get(to);
    if (!record || !other) return undefined;
    if (record.parentId === to) return "part";
    if (other.parentId === from) return "parent";
    for (const link of this.links.listFrom(from)) {
      if (link.toId === to) return LINK_FROM_RELATION[link.type];
    }
    for (const link of this.links.listTo(from)) {
      if (link.fromId === to) return LINK_END_RELATION[link.type];
    }
    return undefined;
  }

  mustGet(id: string): TaskRecord {
    const record = this.store.get(id);
    if (!record) throw new Error(`Unknown task "${id}".`);
    return record;
  }

  mergeDelivery(record: TaskRecord, patch: Partial<TaskDelivery>): TaskDelivery {
    const mode =
      patch.mode ??
      record.delivery?.mode ??
      deliveryForRecord(
        record,
        record.repoId ? this.options.repos?.get(record.repoId)?.delivery : undefined,
      );
    const delivery = { ...(record.delivery ?? {}), ...patch, mode };
    // The current change's story ledger is the one in `presentation`, so a
    // write that selects another change moves its ledger there (INF-2490).
    if (delivery.presentation || delivery.presentations)
      Object.assign(
        delivery,
        placeStories(
          storyLedgers(delivery),
          record.branch,
          currentChange(delivery, record.branch).branch,
          delivery.checkTarget && isForkReview(delivery.checkTarget)
            ? delivery.checkTarget.number
            : undefined,
        ),
      );
    // Kept files own the bytes. CI polls and event rows never copy transcripts.
    if (delivery.liveValidation)
      delivery.liveValidation = {
        ...delivery.liveValidation,
        runs: delivery.liveValidation.runs.map((run) => ({
          ...run,
          evidence: run.evidence.map(({ text: _transcript, ...metadata }) => metadata),
        })),
      };
    return delivery;
  }
}
