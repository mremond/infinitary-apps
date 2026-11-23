import {
  type BatchChecksReading,
  type BatchesRepoView,
  type BatchesView,
  type BatchRecord,
  type BatchRepairView,
  batchRepairOf,
} from "@shared/batches";
import type { RepoView } from "@shared/repos";
import { LEFT_OUT_WORDS } from "./combine";
import { finishedWithin, nextBatchAt, rebuildStands } from "./line";

/** What the view reads of the app's own records for one repository. */
export type BatchesViewSources = {
  repos: readonly RepoView[];
  /** The project a repository belongs to, by its id. */
  projectOf: (repoId: string) => string | undefined;
  /** Where a repository's project lives, in the host's own name; undefined when unknown. */
  place: (repo: RepoView) => string | undefined;
  /** The open batch's checks as last read at its version. */
  reading: (repoId: string) => BatchChecksReading | undefined;
  /** A task's key and title; undefined for a task no longer recorded. */
  task: (taskId: string) => { key: string; title: string } | undefined;
  now: number;
};

/**
 * `batches.list` (docs/forge.md, "The Batches panel"): each repository on
 * batched pull requests, or whose record still holds a batch, with its line,
 * open batch, changes left out and the batches that ended in the last day,
 * each task by its key. It reads only the app's own record and the last
 * pass's checks reading; nothing is asked where the project lives.
 */
export function batchesView(sources: BatchesViewSources): BatchesView {
  return {
    repos: sources.repos.flatMap((repo) => {
      const record = repo.batch;
      if (repo.kind !== "project" || (repo.delivery !== "queue-pr" && !holdsAny(record, sources)))
        return [];
      return [repoView(repo, record ?? { line: [], receipts: [], leftOut: [] }, sources)];
    }),
  };
}

/** Whether a record still shows something: a change in line, an open batch, one left out or one that ended. */
function holdsAny(record: BatchRecord | undefined, sources: BatchesViewSources): boolean {
  if (!record) return false;
  return (
    record.line.length > 0 ||
    record.open !== undefined ||
    record.leftOut.length > 0 ||
    finishedWithin(record.finished ?? [], sources.now).length > 0
  );
}

function repoView(
  repo: RepoView,
  record: BatchRecord,
  sources: BatchesViewSources,
): BatchesRepoView {
  const keyOf = (taskId: string) => sources.task(taskId)?.key ?? null;
  const taskOf = (taskId: string, title?: string) => {
    const task = sources.task(taskId);
    return { taskId, key: task?.key ?? null, title: title ?? task?.title ?? "" };
  };
  const open = record.open;
  const gap = repo.batchGap ?? null;
  const reading = open ? sources.reading(repo.id) : undefined;
  return {
    repoId: repo.id,
    name: repo.name,
    projectId: sources.projectOf(repo.id) ?? null,
    place: sources.place(repo) ?? null,
    gap,
    nextBatchAt: nextBatchAt(record, gap ?? undefined) ?? null,
    // A version whose rebuild stands waits for its rebuilt version in no batch: it reads as left out.
    line: record.line
      .filter((change) => !rebuildStands(record, change))
      .map((change) => ({
        ...taskOf(change.taskId, change.title),
        at: change.at,
        afterKey: change.after ? keyOf(change.after) : null,
        fix: change.fix === true,
      })),
    open: open
      ? {
          number: open.number ?? null,
          url: open.url ?? null,
          since: open.since,
          members: open.members.map((member) => taskOf(member.taskId, member.title)),
          hold: open.hold
            ? {
                reason: open.hold.reason,
                at: open.hold.at,
                checks: open.hold.checks,
                detail: open.hold.detail ?? null,
              }
            : null,
          queued: open.queued === open.head,
          stale: open.stale === true,
          fixKeys: (record.fixes ?? []).flatMap((taskId) => keyOf(taskId) ?? []),
          checks: reading ?? null,
          repair: repairView(batchRepairOf(open, record.fixes), taskOf),
          awaitsFix: Boolean(open.awaits),
          passed: open.passed?.head === open.head,
        }
      : null,
    leftOut: [
      ...record.leftOut.map((entry) => ({
        ...taskOf(entry.taskId),
        reason: entry.reason,
        aheadKey: entry.ahead ? keyOf(entry.ahead) : null,
      })),
      ...record.line
        .filter((change) => rebuildStands(record, change))
        .map((change) => ({
          ...taskOf(change.taskId, change.title),
          reason: LEFT_OUT_WORDS.clashesBatch,
          aheadKey: null,
        })),
    ],
    finished: finishedWithin(record.finished ?? [], sources.now).map((batch) => ({
      number: batch.number,
      url: batch.url ?? null,
      formed: batch.formed,
      ended: batch.ended,
      outcome: batch.outcome,
      holds: batch.holds,
      members: batch.members.map((member) => taskOf(member.taskId, member.title)),
    })),
  };
}

/** The hold's repair as `batches.list` names it, by its task's key and title. */
function repairView(
  repair: ReturnType<typeof batchRepairOf>,
  taskOf: (taskId: string) => { taskId: string; key: string | null; title: string },
): BatchRepairView | null {
  return repair ? { ...taskOf(repair.taskId), own: repair.own, fixing: repair.fixing } : null;
}
