import { setImmediate as nextTurn } from "node:timers/promises";
import { BATCH_BRANCH_PREFIX, type BatchSendBack } from "@shared/batches";
import type { Said } from "@shared/i18n/said";
import type { RepoView } from "@shared/repos";
import type { NamingRule } from "@shared/runbooks";
import { Batches, type BatchesOptions } from "../batches/batches";
import { forgeLocationOf, type WorkflowRun } from "../forge";
import type { InboxStore } from "../storage/inboxStore";
import type { MergeAuthorization } from "../storage/taskRecords";
import { TaskGraph } from "../tasks/taskGraph";
import { TaskService } from "../tasks/taskService";
import type { ChangeChecks } from "./changeChecks";
import type { ChangePresentations } from "./changePresentations";
import type { RunBatchFacts } from "./deliveryWakes";
import type { FirstmateAgent } from "./firstmateAgent";
import type { KeptApproval } from "./keptApproval";
import {
  candidateHead,
  coveredNextStep,
  standInFront,
  standingAuthorization,
} from "./mergeAuthorization";
import type { PullComments } from "./pullComments";
import { TICK_PERIOD_MS, type Ticker } from "./ticker";

/**
 * Whether a kept approval was given at the project's current address, or at a
 * former one the project has since moved from.
 */
export function approvedWhere(
  kept: Pick<MergeAuthorization, "target">,
  repo: RepoView,
): true | "former-address" {
  const location = forgeLocationOf(repo);
  const { target } = kept;
  return target.repoId === repo.id &&
    target.host === location.host &&
    target.owner === location.owner &&
    target.name === location.name
    ? true
    : "former-address";
}

/** Keep one batch's closes from running back to back in the same event-loop turn. */
export async function settleBatchMembers(
  taskIds: readonly string[],
  settle: (taskId: string) => Promise<unknown>,
): Promise<void> {
  let first = true;
  for (const taskId of taskIds) {
    if (!first) await nextTurn();
    first = false;
    try {
      await settle(taskId);
    } catch (caught) {
      console.warn("[batches] settling a batch member:", caught);
    }
  }
}

/**
 * Batches of your own (docs/forge.md, "Batches of your own"), wired to the
 * owners its callbacks reach: only approved work is carried, each task's
 * kept merge reads its place, a change sent back keeps its approval as the
 * only change of a failed batch does and its crewmate is told why, with its
 * earlier send-backs, and a held batch of several reaches the first mate
 * once, with its changes' earlier send-backs. The first pass after a start reconciles every open batch from the host.
 */
export function createOwnBatches(owners: {
  repos: BatchesOptions["repos"];
  forgeFor: BatchesOptions["forgeFor"];
  ticker: Pick<Ticker, "now" | "register">;
  tasks: TaskService;
  presentations: Pick<ChangePresentations, "batchRegion">;
  inbox: Pick<InboxStore, "enqueue">;
  /** Owners built after this one, read when a callback runs. */
  late: () => {
    checks: Pick<ChangeChecks, "declaredAbsent">;
    /** Comments on the batch's pull request, handed to the changes they are about. */
    comments?: Pick<PullComments, "readBatch">;
    settling: {
      /** Runs a task's kept merge again, so it reads its change's place now. */
      kept: { runMergeAuthorization: (taskId: string) => Promise<unknown> };
      approvals: Pick<KeptApproval, "endAuthorization">;
    };
  };
  firstmate: () => Pick<FirstmateAgent, "notifyOp"> | undefined;
  /** A line for the Activity feed, as a fact so it follows the language. */
  note: (fact: Said) => void;
  /** The open batch's checks reading changed (`Batches.checksReading`). */
  checksRead?: (repoId: string) => void;
  /** The active naming runbook's rule, read at each use; absent or null, no naming runbook is on. */
  namingRule?: () => NamingRule | null;
  /** The combine, the push and the read of merged commits; git's own where left out. */
  git?: Pick<BatchesOptions, "combine" | "push" | "landed" | "branchName">;
}): Batches {
  const { tasks, forgeFor } = owners;
  // The standing approval, or one queued behind it, that covers this version of the task's own branch.
  const approval = (taskId: string, head: string) => {
    const record = tasks.get(taskId);
    const top = standingAuthorization(record?.delivery);
    if (!record || TaskService.isClosed(record) || !top) return undefined;
    return [top, ...(top.queued ?? [])].find(
      (entry) =>
        !entry.review && entry.target.branch === record.branch && candidateHead(entry) === head,
    );
  };
  // A send-back as a wake names it: its batch's pull request as the host labels it.
  const named = (repo: RepoView | undefined, entry: BatchSendBack) => {
    const change =
      repo && entry.number !== undefined
        ? forgeFor(repo).label({ number: entry.number, branch: "", headSha: "", url: null })
        : undefined;
    return {
      head: entry.head,
      reason: entry.reason,
      ...(change ? { change } : {}),
      failed: entry.failed,
      ...(entry.notRun ? { notRun: entry.notRun } : {}),
    };
  };
  const batches = new Batches({
    repos: owners.repos,
    forgeFor,
    now: owners.ticker.now,
    naming: () => owners.namingRule?.() ?? null,
    approved: (taskId, head, repo) => {
      const kept = approval(taskId, head);
      return kept ? approvedWhere(kept, repo) : false;
    },
    runsNoChecks: (taskId, head) => owners.late().checks.declaredAbsent(taskId, head),
    comments: async (input) => owners.late().comments?.readBatch(input),
    live: (taskId) => {
      const record = tasks.get(taskId);
      return record !== undefined && !TaskService.isClosed(record);
    },
    merged: (taskId) => {
      const record = tasks.get(taskId);
      return record ? TaskGraph.mergedAt(record) : undefined;
    },
    unmergedBase: (change) => {
      const builtOn = tasks.graph.unmergedBuiltOn(tasks.get(change.taskId));
      if (!builtOn || !TaskService.isClosed(builtOn.task)) return undefined;
      // The change may have been brought onto a newer version its base's approval covered.
      const approval = builtOn.task.delivery?.mergeAuthorization;
      return [
        ...new Set([builtOn.head, ...(approval ? [TaskGraph.newestApproved(approval)] : [])]),
      ];
    },
    story: async (member, forge) => {
      const { story, region } = await owners.presentations.batchRegion(
        member.taskId,
        member.branch,
        member.head,
        forge,
      );
      return { region, projectText: story.projectText ?? "" };
    },
    settle: (taskIds) => {
      void settleBatchMembers(taskIds, (taskId) =>
        owners.late().settling.kept.runMergeAuthorization(taskId),
      );
    },
    sentBack: (change, sent, earlier) => {
      // The approval is kept, as a failed batch of one keeps it (INF-5097,
      // the captain's answer Keep): the repair is declared from this version.
      const kept = approval(change.taskId, change.head);
      if (kept) standInFront(tasks, change.taskId, (item) => item.id === kept.id);
      const front = kept ? standingAuthorization(tasks.get(change.taskId)?.delivery) : undefined;
      const repoId = tasks.get(change.taskId)?.repoId;
      const repo = repoId ? owners.repos.get(repoId) : undefined;
      owners.inbox.enqueue(change.taskId, {
        facts: {
          kind: "batch-sent-back",
          ...named(repo, sent),
          earlier: earlier.map((entry) => named(repo, entry)),
          ...(front
            ? {
                approval: `The captain's merge approval is kept and covers ${candidateHead(front)}. ${coveredNextStep(front, "batch")}`,
              }
            : {}),
        },
      });
    },
    rebuild: ({ change, reason, told, open }) => {
      // The approval stays kept: the rebuilt version is declared as its repair.
      const kept = approval(change.taskId, change.head);
      const front = kept ? standingAuthorization(tasks.get(change.taskId)?.delivery) : undefined;
      // No approval covers the version any more: its line and merge card say what follows.
      if (!front) return;
      const repoId = tasks.get(change.taskId)?.repoId;
      const repo = repoId ? owners.repos.get(repoId) : undefined;
      const label =
        repo && open.number !== undefined
          ? forgeFor(repo).label({
              number: open.number,
              branch: open.branch,
              headSha: open.head,
              url: null,
            })
          : undefined;
      owners.inbox.enqueue(change.taskId, {
        facts: {
          kind: "batch-rebuild",
          head: change.head,
          reason,
          ...(label ? { change: label } : {}),
          ...(open.url ? { url: open.url } : {}),
          branch: told.branch,
          on: told.on,
          members: told.members.map((member) => ({
            task: tasks.get(member.taskId)?.key || member.taskId,
            title: open.members.find((entry) => entry.taskId === member.taskId)?.title ?? "",
          })),
          // i18n-exempt: served to a crewmate, never shown to a person (docs/i18n.md, "What stays English")
          approval: `The captain's merge approval is kept and covers ${candidateHead(front)}: impact none keeps it, with no new card.`,
        },
      });
    },
    addressMoved: (change, reason) => {
      // The approval belongs to the project's former address: it ends, and
      // the crewmate asks for fresh approval at the new one.
      const kept = approval(change.taskId, change.head);
      if (kept) {
        standInFront(tasks, change.taskId, (item) => item.id === kept.id);
        owners
          .late()
          .settling.approvals.endAuthorization(
            change.taskId,
            "invalidated",
            `its change was sent back from its batch: ${reason}`,
            { feed: true },
          );
      }
      owners.inbox.enqueue(change.taskId, {
        facts: { kind: "batch-sent-back", head: change.head, reason },
      });
    },
    held: ({ repo, batch, sentBack }) =>
      owners.firstmate()?.notifyOp(
        {
          facts: {
            kind: "batch-held",
            project: { id: repo.id, name: repo.name },
            change:
              batch.number === undefined
                ? "its pull request"
                : forgeFor(repo).label({
                    number: batch.number,
                    branch: batch.branch,
                    headSha: batch.head,
                    url: null,
                  }),
            ...(batch.url ? { url: batch.url } : {}),
            head: batch.head,
            checks: batch.hold?.checks ?? [],
            members: batch.members.map((member) => {
              const earlier = sentBack.filter((entry) => entry.taskId === member.taskId);
              return {
                task: tasks.get(member.taskId)?.key ?? member.taskId,
                title: member.title,
                ...(earlier.length ? { sentBack: earlier.map((entry) => named(repo, entry)) } : {}),
              };
            }),
            ...(batch.repair ? { repair: tasks.get(batch.repair)?.key ?? batch.repair } : {}),
          },
        },
        "agent",
      ),
    note: owners.note,
    ...(owners.checksRead ? { checksRead: owners.checksRead } : {}),
    taskNote: (taskId, text) => tasks.note(taskId, text, { news: true }),
    ...owners.git,
  });
  owners.ticker.register("batches", TICK_PERIOD_MS, () => batches.sweep());
  return batches;
}

/**
 * What the app knows when a task's watched run checks a batch of the
 * captain's approved changes (INF-4574 change 3): the project's open batch,
 * matched by the run's branch, and whether the run is at its version or an
 * earlier one the app replaced by combining it again. Nothing for a run on
 * any other branch, for a task that is one of the batch's changes - its own
 * wakes say what happened to it - or once no batch is open.
 */
export function runBatchFacts(
  owners: {
    tasks: Pick<TaskService, "get" | "byKey">;
    repos: Pick<BatchesOptions["repos"], "get">;
    batches: Pick<Batches, "record">;
    forgeFor: BatchesOptions["forgeFor"];
  },
  taskId: string,
  run: Pick<WorkflowRun, "branch" | "headSha">,
): RunBatchFacts | undefined {
  if (!run.branch?.startsWith(BATCH_BRANCH_PREFIX)) return undefined;
  const repoId = owners.tasks.get(taskId)?.repoId;
  const repo = repoId ? owners.repos.get(repoId) : undefined;
  const open = repo ? owners.batches.record(repo.id).open : undefined;
  if (!repo || !open || open.members.length === 0) return undefined;
  if (open.members.some((member) => member.taskId === taskId)) return undefined;
  return {
    change:
      open.number === undefined
        ? "its pull request"
        : owners.forgeFor(repo).label({
            number: open.number,
            branch: open.branch,
            headSha: open.head,
            url: null,
          }),
    ...(open.url ? { url: open.url } : {}),
    head: open.head,
    members: open.members.map((member) => ({
      task: owners.tasks.get(member.taskId)?.key || member.taskId,
      title: member.title,
    })),
    current: open.branch === run.branch && open.head === run.headSha,
  };
}
