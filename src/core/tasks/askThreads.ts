import type { AskRecord } from "../storage/askStore";
import type { TaskCoverageFields, TaskRecord } from "../storage/taskRecords";
import { type ThreadOrigin, threadOrigin } from "./taskOrigin";
import type { TaskService } from "./taskService";
import type { TaskWriter } from "./taskWriter";

/** What one message's thread holds (`AskThreads.coverage`). */
export type ThreadCoverage = {
  work: TaskCoverageFields[];
  acted: Set<string>;
  joined: Map<string, number>;
  tied: Set<string>;
  requests: { taskId: string; requestId: string }[];
};

/**
 * The links a task's work goes on through, each marked by how a thread
 * follows it. Work handed over - a replacement, a retry, a branch taken from
 * it, a stronger model - always stays in its predecessor's thread. A part,
 * work built on it and the tasks its merge filed `inherit` the thread only
 * when they have no origin of their own.
 */
export type NextWork = { id: string; inherit: boolean }[];

/**
 * The attachments that keep a message's thread whole across the update to
 * one thread per message: the one-time step marks them so (INF-6115).
 */
export const CARRIED_VIA = "host:carried";

/**
 * Which work belongs to which captain's message (INF-6115,
 * docs/task-capture.md "How a message ends"). This module owns the walk:
 * the thread a message ends on, the messages above a task, the first mate's
 * open list, the notices and where a closed task's outcome goes all read it,
 * and the You asked line reads the same origin (`threadOrigin`).
 *
 * A thread is one message and the work it caused: the tasks it attached
 * to, and the work that carries theirs on. A task belongs to its nearest
 * origin: a task with an origin of its own - a message that started it, an
 * automation, or a click or passed-on words made on another thread's card -
 * stays out of a thread that reaches it only through a part, a plan or a
 * merge. The host never joins two messages into one thread.
 */
export class AskThreads {
  constructor(
    private readonly writer: TaskWriter,
    private readonly tasks: TaskService,
  ) {}

  /**
   * The work a captain's messages cover: the tasks they attached to, those
   * tasks' parts, the work built on them, and the work handed over from them
   * - a replacement, a stronger model, a retry or a branch taken from one -
   * and the tasks a merge filed or set to start for the rest of the work,
   * stopping at a task with an origin of its own (`threadOrigin`) unless that
   * origin continues the thread. With `before`, work filed after that time
   * is left out, apart from a task a message attached to itself: work linked
   * after a message was answered belongs to the newer message. `joined`
   * gives the time a merge linked each task it filed or started, which
   * stands in for when that task was filed (INF-3846 piece 4). `acted` is
   * the part of that work the first mate's own tools attached these
   * messages to, and the work the update carried for them - never the
   * host's fallback to the task a message pointed at. `origins` false walks
   * every link, as a merged thread did before the update; only the one-time
   * update reads that.
   */
  coverage(
    askIds: readonly string[],
    before?: number,
    options: { origins?: boolean } = {},
  ): ThreadCoverage {
    const stop = options.origins !== false;
    const asked = new Set(askIds);
    const attributions = this.writer.events.askAttributions(askIds);
    const worked = attributions.filter((entry) => !entry.tie);
    const attached = [...new Set(worked.map((entry) => entry.taskId))];
    const acted = new Set(
      worked
        .filter((entry) => entry.via?.startsWith("tool:") || entry.via === CARRIED_VIA)
        .map((entry) => entry.taskId),
    );
    const requests = attributions.flatMap((entry) =>
      entry.requests.map((requestId) => ({ taskId: entry.taskId, requestId })),
    );
    const found = new Map<string, TaskCoverageFields>();
    const seeds = new Set(attached);
    const joined = new Map<string, number>();
    // A task whose origin continues another card's or report's thread waits
    // here until that task is reached; it never joins through a link alone.
    const anchored = new Map<string, string>();
    const queue: { id: string; inherit: boolean }[] = attached.map((id) => ({
      id,
      inherit: false,
    }));
    const drain = (): void => {
      while (queue.length > 0) {
        const { id, inherit } = queue.shift() as { id: string; inherit: boolean };
        if (found.has(id)) continue;
        const record = this.writer.store.coverageFields(id);
        if (!record) continue;
        const filedAt = Math.max(record.createdAt, joined.get(id) ?? 0);
        if (before !== undefined && !seeds.has(id) && filedAt > before) continue;
        if (inherit && stop) {
          const origin = this.originOf(id);
          if (origin && !(origin.kind === "asked" && asked.has(origin.askId))) {
            const anchor = this.anchorOf(origin);
            if (!anchor) continue;
            if (!found.has(anchor)) {
              anchored.set(id, anchor);
              continue;
            }
          }
        }
        anchored.delete(id);
        found.set(id, record);
        for (const next of this.tasks.graph.continuations(id)) {
          const known = joined.get(next.id);
          if (known === undefined || next.at < known) joined.set(next.id, next.at);
        }
        queue.push(...this.workAfter(record));
      }
    };
    drain();
    // A task reached before the card or report its origin continues: it
    // joins once that task is in the thread.
    for (let progress = true; progress; ) {
      progress = false;
      for (const [id, anchor] of [...anchored]) {
        if (!found.has(anchor)) continue;
        anchored.delete(id);
        queue.push({ id, inherit: false });
        progress = true;
      }
      drain();
    }
    // Only the work reached: a link to work left out names nothing covered.
    for (const id of [...joined.keys()]) if (!found.has(id) || seeds.has(id)) joined.delete(id);
    // A task the messages are only tied to - a question asked there, a
    // refused change - is about them, so its cards can answer them, but it
    // is not their work and the work after it is not walked.
    const tied = new Set<string>();
    for (const entry of attributions) {
      if (!entry.tie || found.has(entry.taskId) || tied.has(entry.taskId)) continue;
      const record = this.writer.store.coverageFields(entry.taskId);
      if (!record) continue;
      found.set(entry.taskId, record);
      tied.add(entry.taskId);
    }
    return { work: [...found.values()], acted, joined, tied, requests };
  }

  /**
   * The captain's messages whose thread includes this task, newest first:
   * those attached to it, or to the work it came from when the walk from
   * them reaches it (`coverage`). A message answered before the task was
   * filed is left out unless it attached to the task itself. Reached
   * through a merge that started it, the task counts as filed when that
   * merge linked it (INF-3846 piece 4). A message only tied to a task is
   * above that task alone, never the work after it, and with `ties` false
   * not even that.
   */
  asksAbove(id: string, ties = true): AskRecord[] {
    const seen = new Set<string>();
    const asks = new Map<string, AskRecord>();
    // A message attached to the task itself holds it, as work or a tie.
    const direct = new Set<string>();
    const target = this.writer.store.get(id);
    if (!target) return [];
    // Each task to read, with when the target counts as filed on that path:
    // a merge's link to the work it started stands in for its filing.
    const queue: { id: string; filedAt: number }[] = [{ id, filedAt: target.createdAt }];
    while (queue.length > 0) {
      const { id: current, filedAt } = queue.shift() as { id: string; filedAt: number };
      if (seen.has(current)) continue;
      seen.add(current);
      const record = this.writer.store.get(current);
      if (!record) continue;
      const refs =
        ties && current === id
          ? this.writer.events.refsOf(current, "ask")
          : this.writer.events.workAskRefs(current);
      for (const ref of refs) {
        const ask = this.writer.asks.get(ref);
        if (!ask || asks.has(ask.id)) continue;
        if (current === id) direct.add(ask.id);
        const later = current !== id && ask.answeredAt !== null && filedAt > ask.answeredAt;
        if (!later) asks.set(ask.id, ask);
      }
      const joins = new Map(
        this.tasks.graph.continuedFrom(current).map((from) => [from.id, from.at] as const),
      );
      for (const next of this.workBefore(record))
        queue.push({ id: next, filedAt: Math.max(filedAt, joins.get(next) ?? 0) });
    }
    // The links up reach every message that might hold the task; the walk
    // down from each says whether its thread does, so both sides agree.
    return [...asks.values()]
      .filter(
        (ask) => direct.has(ask.id) || this.coverage([ask.id]).work.some((task) => task.id === id),
      )
      .sort((a, b) => b.at - a.at);
  }

  /** A task's own origin (`threadOrigin`). */
  private originOf(id: string): ThreadOrigin | undefined {
    return threadOrigin(
      {
        get: (taskId) => this.writer.store.get(taskId),
        events: (taskId) => this.writer.events.listOriginEvents(taskId),
        ask: (askId) => this.writer.asks.get(askId),
      },
      id,
    );
  }

  /**
   * The task whose thread an origin continues: the card's task for a click,
   * the reporting task for passed-on words. A message or an automation
   * continues none. A click on a card the record never raised on a task
   * continues no thread either.
   */
  private anchorOf(origin: ThreadOrigin): string | undefined {
    if (origin.kind === "card")
      return this.writer.events.latestTaskForRef("card_raised", origin.cardId);
    if (origin.kind === "report") return origin.taskId;
    return undefined;
  }

  /**
   * The tasks that carry a task's work on: its handovers, and its parts,
   * what builds on it and the `Continue: …` tasks its merge filed.
   */
  private workAfter(record: Pick<TaskRecord, "id" | "key">): NextWork {
    const known = this.writer.projection?.workAfter.get(record.id);
    if (known) return known;
    const key = record.key || null;
    const mark = (inherit: boolean) => (id: string) => ({ id, inherit });
    const next: NextWork = [
      ...this.writer.store.childIds(record.id).map(mark(true)),
      ...this.writer.links
        .listFrom(record.id, "replaced-by")
        .map((link) => link.toId)
        .map(mark(false)),
      ...this.writer.references.taskIdsNaming("basis", record.id, key).map(mark(true)),
      ...(["retry-of", "branch-source"] as const).flatMap((kind) =>
        this.writer.references.taskIdsNaming(kind, record.id, key).map(mark(false)),
      ),
      ...this.escalations(record.id, "escalated_to").map(mark(false)),
      ...this.tasks.graph
        .continuations(record.id)
        .map((next) => next.id)
        .map(mark(true)),
    ];
    this.writer.projection?.workAfter.set(record.id, next);
    return next;
  }

  /** The tasks a task's work came from: the inverse of `workAfter`. */
  private workBefore(record: TaskRecord): string[] {
    return [
      ...(record.parentId ? [record.parentId] : []),
      ...this.writer.links.listTo(record.id, "replaced-by").map((link) => link.fromId),
      ...this.writer.references
        .list(record.id)
        .filter(
          (entry) =>
            entry.kind === "basis" || entry.kind === "retry-of" || entry.kind === "branch-source",
        )
        .flatMap((entry) => this.tasks.graph.referenceTarget(entry)?.id ?? []),
      ...this.escalations(record.id, "escalated_from"),
      ...this.tasks.graph.continuedFrom(record.id).map((from) => from.id),
    ];
  }

  /** The other attempt a stronger-model move names, on the side `side` records. */
  private escalations(id: string, side: "escalated_to" | "escalated_from"): string[] {
    return this.writer.events.escalationRefs(id, side);
  }
}
