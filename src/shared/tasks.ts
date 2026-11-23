import { z } from "zod";
import type { taskLifecycleOpSchema } from "./cards";
import { checkSnapshotSchema } from "./checkSnapshot";
import { taskCostViewSchema } from "./costLimit";
import { recordDeliveryFactSchema } from "./deliveryFacts";
import { computerReachSchema } from "./devices";
import { saidSchema } from "./i18n/said";
import { liveValidationSummarySchema } from "./liveValidationSummary";
import { modelChoiceSchema } from "./modelChoice";
import { modelReasonSchema } from "./modelReason";
import { slotSchema } from "./modelSlots";
import { personalReadSchema } from "./personalSet";
import { placementSnapshotSchema } from "./placement";
import { reasoningSchema } from "./reasoning";
import { repoDeliverySchema, repoKindSchema } from "./repos";
import { captainActionSchema, requiredActionStatusSchema } from "./requiredActions";
import { reviewRiskSchema, reviewVerdictSchema, rigorSchema } from "./rigor";
import { riskAssessmentSchema } from "./risk";
import { deliverableSchema } from "./routingPolicy";
import { taskBrowserFactSchema } from "./taskBrowser";
import { taskPlanSchema } from "./taskPlan";
import { effectiveTaskPoliciesSchema, taskRunsOnSchema } from "./taskPolicies";
import { taskWaitSchema } from "./taskWaits";
import { timelineReadingSchema } from "./timeline";
import { workPostureSchema } from "./workPosture";

/**
 * The task protocol's wire surface (task-system design section 9, P3).
 *
 * Everything a client learns about tasks crosses in these shapes: the
 * board (`inf:tasks` push, `inf:tasks:board` invoke) is the bounded LIVE set
 * rebuilt from SQLite after every commit and pushed whole, coalesced;
 * `inf:tasks:detail` is one record in full; `inf:projects:list` is the
 * project index with counts. Two FmEvents ride beside them
 * (`src/shared/events.ts`): `task_changed` for per-task invalidation and
 * `task_event` as the feed's source.
 *
 * The enums mirror the record's own vocabulary in
 * `src/core/storage/taskRecords.ts` and `taskEventStore.ts`; the core's view
 * builder (`src/core/tasks/taskView.ts`) assigns record fields into
 * these types, so a value added on one side without the other fails
 * typecheck rather than a client's parse.
 */

export const taskStatusSchema = z.enum(["open", "active", "done", "dropped"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskActivitySchema = z.enum(["starting", "running", "idle", "interrupted"]);
export type TaskActivity = z.infer<typeof taskActivitySchema>;

export const taskKindSchema = z.enum(["work", "question", "decision", "operation"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const taskClosedReasonSchema = z.enum([
  "landed",
  "merged",
  "released",
  "answered",
  "settled",
  "finished",
  "cancelled",
  "discarded",
  "failed",
  "superseded",
]);
export type TaskClosedReason = z.infer<typeof taskClosedReasonSchema>;

export const taskLinkTypeSchema = z.enum(["blocks", "related", "discovered-from", "replaced-by"]);
export type TaskLinkType = z.infer<typeof taskLinkTypeSchema>;

export const taskEventActorSchema = z.enum([
  "captain",
  "firstmate",
  "crewmate",
  "supervisor",
  "host",
]);
export type TaskEventActor = z.infer<typeof taskEventActorSchema>;

/**
 * Whether what this writer says is in the first mate's computer's own words:
 * the host's, its own steering's and the first mate's, so its this computer
 * is that computer (docs/view.md, "The first mate's own words"). The
 * captain's words, and a crewmate's, whose this computer is wherever it ran,
 * are not.
 */
export function speaksAsFirstMatesComputer(actor: string | null | undefined): boolean {
  return actor === "host" || actor === "firstmate" || actor === "supervisor";
}

export const taskEventKindSchema = z.enum([
  "created",
  "ask",
  "answered",
  "briefed",
  "dispatched",
  "steered",
  "progress",
  "report",
  "failed",
  "card_raised",
  "card_resolved",
  "status",
  "linked",
  "unlinked",
  "moved",
  "pr_opened",
  "ci",
  "landed",
  "merged",
  "triaged",
  "note",
  "compacted",
  "interrupted",
  "decided",
  "escalated",
  "review",
  "cap_reset",
  "replied",
]);
export type TaskEventKind = z.infer<typeof taskEventKindSchema>;

/**
 * How a task's work reached its destination: one of the repository's
 * delivery postures, or `in-place` - the personal workspace's commit at the
 * end of each turn, which is its KIND's business rather than a posture
 * (Task A of the posture rationalization; it read `live` before).
 */
export const taskDeliveryModeSchema = z.enum([...repoDeliverySchema.options, "in-place"]);
export type TaskDeliveryMode = z.infer<typeof taskDeliveryModeSchema>;

/**
 * The newest watched workflow run a task started outside a pull request
 * (INF-594), as the app last read it: its state, and when the host says it
 * started and finished. It outlives the run's watch, so a finished run
 * still says how long it took.
 */
export const runChecksSchema = z.object({
  runId: z.number(),
  name: z.string(),
  state: z.enum(["running", "passed", "failed", "cancelled"]),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  /** When the app read it. */
  at: z.number(),
});
export type RunChecks = z.infer<typeof runChecksSchema>;

/**
 * One pull request on a task (INF-2490): its number, its page where the app
 * holds it, the checks last read for it, whether it merged, and whether its
 * merge closes the task - true only for the change the open finishing card
 * was shown for.
 */
export const taskPullRequestSchema = z.object({
  number: z.number(),
  url: z.string().optional(),
  ci: z.enum(["green", "red", "pending", "no-pr", "merged"]).optional(),
  merged: z.literal(true).optional(),
  closes: z.literal(true).optional(),
});
export type TaskPullRequest = z.infer<typeof taskPullRequestSchema>;

/** Delivery facts as they become known (check_pr_ci, land, merge-pr, review). */
export const taskDeliveryViewSchema = z.object({
  captainAction: captainActionSchema.optional(),
  mode: taskDeliveryModeSchema,
  /** `prUrl`, `prNumber` and `changeLabel` name the task's current pull request. */
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  /**
   * Every pull request on the task, in number order (INF-2490). Only the
   * record's read carries it, from the changes the record keeps; absent on
   * a task with none, and on an older home.
   */
  pullRequests: z.array(taskPullRequestSchema).optional(),
  /** The change's name where the project lives: `#N`, or the sent-up branch. */
  changeLabel: z.string().optional(),
  /** The PR head the last CI read saw. */
  headSha: z.string().optional(),
  ci: z.enum(["green", "red", "pending", "no-pr", "merged"]).optional(),
  ciAt: z.number().optional(),
  /** Reported checks; a merge offer itself expresses the crew's judgment. */
  checks: checkSnapshotSchema.optional(),
  /**
   * When the host says the first check on that head started (INF-587):
   * the checks cell counts from it. Absent until a check has started.
   */
  ciStartedAt: z.number().optional(),
  /**
   * When finished checks finished: the last check's finish when they
   * passed, the first failure's when they failed. Absent while running.
   */
  ciFinishedAt: z.number().optional(),
  /** A hand-started run's checks; the checks cell shows them while the task has no change. */
  runChecks: runChecksSchema.optional(),
  landedMode: z.enum(["fast-forward", "merge", "pr"]).optional(),
  /** The independent review's latest verdict on a reviewed task (delivery rigor phase 2). */
  reviewVerdict: reviewVerdictSchema.optional(),
  /** The head the reviewer read. */
  reviewSha: z.string().optional(),
  /** The change reading taken when that review was assigned. */
  reviewChange: z.string().optional(),
  /**
   * A later head a pass covered, because the change lines matched.
   * No longer written. An older record's value still covers its head.
   */
  reviewCarrySha: z.string().optional(),
  /**
   * Whether a passed review covers `headSha`, the version on offer, by the
   * home's coverage rule (exact version or the same change reading). Set
   * only when the review passed and both versions are known; absent from
   * an older home (INF-3141).
   */
  reviewCovers: z.boolean().optional(),
  reviewRisk: reviewRiskSchema.optional(),
  reviewRiskNote: z.string().optional(),
  reviewedAt: z.number().optional(),
  /**
   * Legacy count history remains readable; it no longer places holds or changes readiness.
   */
  ciRounds: z.number().optional(),
  ciRedHead: z.string().optional(),
  ciCapAt: z.number().optional(),
  reviewRounds: z.number().optional(),
  /** The head the last COUNTED findings round read: a round is one per head. */
  reviewRoundSha: z.string().optional(),
  reviewCapAt: z.number().optional(),
  reviewCapOwner: z.enum(["firstmate", "captain"]).optional(),
  /** The captain answered a Firstmate decision card on the task since the cap. */
  capAnsweredAt: z.number().optional(),
  /**
   * The risk assessment on the task's newest completion card: the levels and
   * lines its crewmate declared
   * (docs/card-authoring.md "The risk chart"). No overall level exists.
   */
  risk: riskAssessmentSchema.optional(),
});
export type TaskDeliveryView = z.infer<typeof taskDeliveryViewSchema>;

/** Derived on read, never stored (design principle 4). */
export const taskFlagsSchema = z.object({
  /** An uncleared `blocks` edge points at it. */
  blocked: z.boolean(),
  /** A gate (quota-reset, at-time, captain) holds it. */
  held: z.boolean(),
  /** An open decision card on it, a captain hold, or a dead blocker. */
  needsYou: z.boolean(),
  /** Open, unblocked, unheld work: dispatches when its start policy is when-ready. */
  ready: z.boolean(),
});
export type TaskFlags = z.infer<typeof taskFlagsSchema>;

/**
 * A start the captain asked for, before the crewmate begins. Published on
 * the board so both task surfaces leave Backlog at once. Absent once the
 * attempt is claimed, refused, or known to have failed.
 */
export const startAttemptSchema = z.object({
  phase: z.enum(["preparing", "checking"]),
  /** When the attempt was accepted, for the record's slow-start line. */
  since: z.number(),
});
export type StartAttempt = z.infer<typeof startAttemptSchema>;

/**
 * A confirmed manual start that did not begin. The task is back where its
 * start policy puts it; the reason stays until retry or another resolution.
 */
export const startNoticeSchema = z.object({
  reason: z.string(),
});
export type StartNotice = z.infer<typeof startNoticeSchema>;

/** Whether a move is open to a task now, or why not (src/shared/taskMoves.ts). */
const taskMoveAllowanceSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), text: z.string() }),
]);

/**
 * Where a task runs when that is a computer other than this Mac
 * (docs/helper.md, "Runs on"): where it started, or where it would start
 * now. `name` is that computer as the feed names it ("Mac mini", "Running
 * as Builder"), `where` as the Tasks row reads it after the project ("on
 * Mac mini", "as Builder"). `reach` names whether open or underway work's computer is ready, connecting, or out of reach.
 */
export const taskPlaceSchema = z.object({
  name: z.string(),
  where: z.string(),
  /** The core's one reach reading; absent on a historical task place. */
  reach: computerReachSchema.optional(),
  /** Connected on an older app, so it takes no new work until updated. */
  noNewWork: z.literal(true).optional(),
  /**
   * Its computer is being updated (`DeviceView.updating`): the task reads
   * updating, with its mark as it was, whatever its reach.
   */
  updating: z.literal(true).optional(),
  /**
   * In reach and still catching up with this task, since this time (epoch
   * ms): its computer came back, or its conversation is opening on this Mac.
   * Absent once caught up, and while the computer is out of reach.
   */
  catchingUpSince: z.number().optional(),
});
export type TaskPlace = z.infer<typeof taskPlaceSchema>;

/**
 * A started task's move to another computer (docs/helper.md, "Moving a
 * started task"): where it moves from and to, by name, and where the move
 * stands - `waiting` for a safe pause, `moving` while its work crosses and
 * the new computer takes it, `retiring` while the old working copy is
 * removed. `waitingFor` says, in words, what still stops a safe pause, and
 * `problem` why the last try did not finish. Absent when no move stands.
 */
export const computerMoveViewSchema = z.object({
  from: z.string(),
  to: z.string(),
  state: z.enum(["waiting", "moving", "retiring"]),
  waitingFor: z.array(z.string()),
  problem: z.string().optional(),
  /**
   * A waiting move whose computer went out of reach: what stays behind if
   * it moves without that computer now, in one line, and the destination
   * by device id or `this-mac` for that move. Absent otherwise.
   */
  leftBehind: z.string().optional(),
  toId: z.string().optional(),
});
export type ComputerMoveView = z.infer<typeof computerMoveViewSchema>;

/** One computer a started task could move to, and why it cannot now. */
export const moveDestinationSchema = z.object({
  /** A computer that runs work by its device id, or `this-mac`. */
  id: z.string(),
  name: z.string(),
  /** Absent when it can take the task now. */
  unavailable: z.string().optional(),
});
export type MoveDestination = z.infer<typeof moveDestinationSchema>;

/** Where a started task could move: where it runs now, and every other computer. */
export const moveOptionsSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    from: z.string(),
    destinations: z.array(moveDestinationSchema),
    /**
     * The computer it runs on is out of reach: what stays behind there if
     * it moves now, in one line, which the move must leave behind. Absent
     * when that computer is in reach.
     */
    leftBehind: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), text: z.string().min(1) }),
]);
export type MoveOptions = z.infer<typeof moveOptionsSchema>;

export const taskViewSchema = z.object({
  id: z.string(),
  /** `<PROJECT_KEY>-<seq>`, the conversational handle (D6). */
  key: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  /** Builder whose change this active host-commissioned review reads; absent for other work. */
  reviewOf: z.string().nullable().optional(),
  /** Actual execution device; null is the home Mac, absent on an older home. */
  executionDeviceId: z.string().nullable().optional(),
  /**
   * The task runs a program the host runs (`shape.program`, docs/programs.md):
   * its parts are its children. Absent on every other task, and on an older
   * home, so the stage draws a constellation only for a program.
   */
  program: z.literal(true).optional(),
  /** Where it runs, in words, when another computer runs it; absent on this Mac. */
  place: taskPlaceSchema.optional(),
  /**
   * Started work that may move to another computer now: the record offers
   * Move to a computer. Absent otherwise, and on an older home.
   */
  movable: z.literal(true).optional(),
  /** Its move to another computer, while one stands. */
  computerMove: computerMoveViewSchema.optional(),
  kind: taskKindSchema,
  title: z.string(),
  goal: z.string().nullable(),
  /** 0 urgent .. 3 low. */
  priority: z.number(),
  status: taskStatusSchema,
  activity: taskActivitySchema.nullable(),
  workPosture: workPostureSchema.optional(),
  /** Standing owner facts for permitted desktop wait presentations; absent on older homes. */
  waits: z.array(taskWaitSchema).optional(),
  closedReason: taskClosedReasonSchema.nullable(),
  startPolicy: z.enum(["when-ready", "on-request"]),
  flags: taskFlagsSchema,
  /** Keys of live (open/active) blockers; closed edges remain graph history. */
  blockedBy: z.array(z.string()),
  /**
   * When each wait in `blockedBy` was recorded, by blocker key (INF-38): a
   * key with no known time is absent, and so is the whole field on an older
   * home. A recorded wait's time, never when the crewmate stopped working.
   */
  blockedSince: z.record(z.string(), z.number()).optional(),
  /**
   * Where a started task's wait on other work stops (INF-5578 finding 4):
   * the one task it waits on (`on`) - a lone wait in `blockedBy`, or the
   * change a review waits for - and, following each task's own lone wait,
   * the last task in that line (`end`, absent when it is `on` itself), with
   * that task's hold: when it ends (`until`), and whether it waits for an
   * app update (`update`). Absent with no lone wait, and on an older home.
   */
  waitChain: z
    .object({
      on: z.string(),
      end: z.string().optional(),
      until: z.number().optional(),
      update: z.literal(true).optional(),
    })
    .optional(),
  /** Keys of the tasks waiting on this one. */
  blocks: z.array(z.string()),
  /**
   * Its parts: how many, how many closed, and the closed ones' ids in the
   * order they closed, oldest first. `closedIds` is absent on an older home.
   */
  children: z.object({
    total: z.number(),
    closed: z.number(),
    closedIds: z.array(z.string()).optional(),
  }),
  assignee: z.string().nullable(),
  model: z.string().nullable(),
  /**
   * The intelligence slot the task's crewmate is served on: its newest
   * routing decision's served slot - the weaker one when the ladder fell
   * back - or, on a row routed before `served` was recorded, the slot it
   * asked for. Null when the task never routed. The crew orbit paints it
   * as the crewmate's solid.
   */
  tier: slotSchema.nullable(),
  repo: z.object({ name: z.string(), branch: z.string() }).nullable(),
  delivery: taskDeliveryViewSchema.nullable(),
  /**
   * The latest report's one-line headline: the summary its crewmate gave,
   * else its first sentence past any Intent section.
   */
  outcomeSummary: z.string().nullable(),
  /** Reachable shown ready decision on a live task; not durable attention/holds. */
  waitingCardId: z.string().nullable(),
  /** A saved answer note ready for the captain’s explicit Done, even after reading it. */
  answerNoteId: z.string().optional(),
  answerSince: z.number().optional(),
  /** Desktop presentation only; not a decision, gate or task status. */
  minimizedCardId: z.string().optional(),
  /** Its waiting card settles with a merge: only that card's own button merges. Absent otherwise. */
  waitingCardMerges: z.literal(true).optional(),
  /**
   * Open, underway or dropped work: which lifecycle moves (`TASK_LIFECYCLE_OPS`)
   * it allows now, and why not, by the task record's own rule
   * (`taskMovesOf`, src/shared/taskMoves.ts). `inf:task:run` checks again.
   */
  moves: z
    .object({
      "start-task": taskMoveAllowanceSchema,
      "start-again": taskMoveAllowanceSchema.optional(),
      "stop-task": taskMoveAllowanceSchema,
      "continue-task": taskMoveAllowanceSchema,
      "drop-task": taskMoveAllowanceSchema,
      "queue-task": taskMoveAllowanceSchema,
      "unqueue-task": taskMoveAllowanceSchema,
      "show-card": taskMoveAllowanceSchema.optional(),
      "answer-done": taskMoveAllowanceSchema.optional(),
      "dismiss-question": taskMoveAllowanceSchema.optional(),
    } satisfies Record<z.infer<typeof taskLifecycleOpSchema>, z.ZodType>)
    .optional(),
  /**
   * Its crewmate's last report declared that it waits on the captain
   * (FI3-435), with or without a card up. Present only while that stands.
   */
  captainWait: z.boolean().optional(),
  requiredAction: requiredActionStatusSchema.optional(),
  /** Replacement key, including a stronger-model retry; absent when none replaced it. */
  replacedBy: z.string().optional(),
  /** Origin key when a crewmate filed this row. Absent otherwise. */
  foundOn: z.string().optional(),
  /** Crew-filed, and the captain has not opened the record yet. */
  filingNew: z.boolean().optional(),
  /** Accepted start, not yet a running crewmate. Absent otherwise. */
  startAttempt: startAttemptSchema.optional(),
  /** Confirmed manual start failure. Absent once cleared. */
  startNotice: startNoticeSchema.optional(),
  /** One dated start wait, shared with the first mate. Absent after starting. */
  queueWait: z.object({ line: z.string(), since: z.number().optional() }).optional(),
  /**
   * Started work that went back to the backlog (INF-2062): when it went.
   * It waits there for Start with its work kept. Absent otherwise, and on an older home.
   */
  backlogSince: z.number().optional(),
  /**
   * When the captain pinned it to the top of Tasks (INF-3127): it lists in
   * Pinned whatever its state. Absent while it is not pinned, and on an older home.
   */
  pinnedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  startedAt: z.number().nullable(),
  closedAt: z.number().nullable(),
});
export type TaskView = z.infer<typeof taskViewSchema>;

/**
 * Open work that has never started. The record's Drop task is offered only
 * here, and the host refuses a drop that no longer matches.
 */
export function isUnstartedWork(
  task: Pick<TaskView, "kind" | "status" | "startedAt" | "activity">,
): boolean {
  return (
    task.kind === "work" &&
    task.status === "open" &&
    task.startedAt == null &&
    task.activity == null
  );
}

/** One task a drop would name: a part, or a task waiting on this one. */
export const dropEffectTaskSchema = z.object({
  key: z.string(),
  title: z.string(),
});

/**
 * What Drop task would affect, computed with the record. Absent once the
 * row is no longer unstarted work. Open parts are refused, not dropped.
 */
export const dropEffectsSchema = z.object({
  parts: z.array(dropEffectTaskSchema.extend({ started: z.boolean() })),
  waiting: z.array(dropEffectTaskSchema),
  underway: z.array(dropEffectTaskSchema),
});
export type DropEffects = z.infer<typeof dropEffectsSchema>;

export const taskLinkViewSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: taskLinkTypeSchema,
});
export type TaskLinkView = z.infer<typeof taskLinkViewSchema>;

const projectRepoViewSchema = z.object({
  /** The repository's id, as `project-move` names it (INF-5005); an older home sends none. */
  id: z.string().optional(),
  name: z.string(),
  delivery: repoDeliverySchema,
  autonomy: z.boolean(),
  /**
   * The repository's kind: `personal` for the app's own workspace
   * (major 15). An older home sends none, read as `project`.
   */
  kind: repoKindSchema.optional(),
});

export const projectViewSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  /** The project's first repository, for a reader of one; null for Scratch. */
  repo: projectRepoViewSchema.nullable(),
  /**
   * Every repository the project holds, first first (INF-4220); an older
   * home sends none, read as `repo` alone.
   */
  repos: z.array(projectRepoViewSchema).optional(),
  archived: z.boolean(),
  counts: z.object({
    /** Broader durable attention, including holds and dead dependencies. */
    needsYou: z.number(),
    /** Live tasks with a reachable shown ready decision, each counted once. */
    waitingOnYou: z.number(),
    open: z.number(),
    active: z.number(),
    /** Done within the board's recent window. */
    doneRecent: z.number(),
  }),
});
export type ProjectView = z.infer<typeof projectViewSchema>;

/**
 * The live board: open and active rows, rows closed within
 * `BOARD_RECENT_MS`, and the parents of every row shown, plus every pinned
 * row whatever its age (INF-3127), which brings no old parent along. Other
 * history never rides the push (design section 9.1); it is read one task at a time.
 */
export const taskBoardSchema = z.object({
  /** Monotonic per mutation; a later push with a lower seq is stale. */
  seq: z.number(),
  /** When this snapshot was built. */
  at: z.number(),
  projects: z.array(projectViewSchema),
  tasks: z.array(taskViewSchema),
  /** Edges whose both ends are on the board. */
  links: z.array(taskLinkViewSchema),
  /**
   * Present when this board was read without the closed rows
   * (`inf:tasks:board` with `{ closed: false }`, `boardWithoutClosed`): it
   * left out every closed row that is not pinned, not a parent of a row it
   * keeps, not a part of live work and not the task of a card on the stack.
   * `done` lists the ids of the rows it left out that Tasks shows under Done,
   * by project id, so a client counts them before it reads them. A delta
   * that brings one back, or takes one off the whole board, takes its id
   * out. A snapshot push carries the whole board and none of this.
   */
  closedLeftOut: z.object({ done: z.record(z.string(), z.array(z.string())) }).optional(),
});
export type TaskBoard = z.infer<typeof taskBoardSchema>;

/**
 * How a client asks for the board (`inf:tasks:board`): `closed: false` reads it
 * without the closed rows, the first read a view makes when it comes back, so
 * a week of closed work never holds up its catch-up; no argument reads it whole.
 */
export const taskBoardReadSchema = z.object({ closed: z.boolean() });
export type TaskBoardRead = z.infer<typeof taskBoardReadSchema>;

/** Closed rows stay on the board this long after closing. */
export const BOARD_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export const taskEventViewSchema = z.object({
  id: z.number(),
  at: z.number(),
  actor: taskEventActorSchema,
  kind: taskEventKindSchema,
  /** The captain-facing event line; the saved event remains the exact source record. */
  text: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  ref: z.string().nullable(),
  feed: z.boolean(),
});
export type TaskEventView = z.infer<typeof taskEventViewSchema>;

/** One event of a record's Activity (`condenseActivity`), in plain words. */
export const taskActivityLineSchema = z.object({
  /** The event it reads, so a client can key it. */
  id: z.number(),
  at: z.number(),
  kind: taskEventKindSchema,
  text: z.string(),
  /**
   * The other task that wrote it, when the event is a linked task's that
   * concerns this one (docs/task-record.md, "Whom an event concerns"), so
   * a client can name it and open its record. Absent on the task's own.
   */
  from: z.object({ id: z.string(), key: z.string() }).optional(),
  /**
   * The words of `text` that name a pull request with a page - `[from, to)`,
   * such as "pull request #612" - and that page, so a client links them
   * (the design skill's TaskRecord, "Pull request links"). Absent when the
   * line names none, or the host has no page for it.
   */
  change: z.object({ url: z.string(), from: z.number(), to: z.number() }).optional(),
  /**
   * The line is in the first mate's computer's own words (what the host, its
   * own steering or the first mate wrote), so a computer that controls the
   * first mate names that computer where it says this computer (docs/view.md,
   * "The first mate's own words"). Absent on the captain's and a crewmate's
   * words, and from an older home.
   */
  saidHere: z.literal(true).optional(),
  /**
   * The app's own words of `text` saved as a fact (docs/i18n.md, "Saved
   * facts"), so the window and the phone (`PhoneWords.line`) word the line
   * in their own language; `text` keeps the English for a reader that words
   * nothing itself. Absent on every other line, and from an older home.
   */
  said: saidSchema.optional(),
});
export type TaskActivityLine = z.infer<typeof taskActivityLineSchema>;

/**
 * One thing a crewmate did, read from the session the app keeps for its
 * task, never from the task table (docs/task-record.md, "A crewmate's
 * actions"): the line the crewmate wrote to say what a call does, or a
 * plain reading of the call when it wrote none.
 */
export const taskActionLineSchema = z.object({
  at: z.number(),
  text: z.string(),
});
export type TaskActionLine = z.infer<typeof taskActionLineSchema>;

/**
 * One row of a record's Activity, with the minor events folded under it
 * (docs/task-record.md, "What Activity holds"): the ones that led to it,
 * oldest first, and for the newest row the ones since. Absent when none.
 * `actions` folds what the crewmate did the same way.
 */
export const taskActivityRowSchema = taskActivityLineSchema.extend({
  folded: z.array(taskActivityLineSchema).optional(),
  actions: z.array(taskActionLineSchema).optional(),
});
export type TaskActivityRow = z.infer<typeof taskActivityRowSchema>;

export const taskAskViewSchema = z.object({
  id: z.string(),
  at: z.number(),
  text: z.string(),
  /** How many images rode the ask; never the bytes. */
  images: z.number(),
  attachedVia: z.string().nullable(),
  turnState: z.enum(["open", "closed", "failed"]),
});
export type TaskAskView = z.infer<typeof taskAskViewSchema>;

/** The structured spawn intent (src/core/orchestrator/intentBrief.ts). */
export const taskIntentViewSchema = z.object({
  goal: z.string(),
  userWords: z.string(),
  constraints: z
    .array(
      z.object({
        kind: z.enum([
          // Retired at contract 4.6 (a plan is its own step now); a stored
          // intent may still name it.
          "plan-first",
          "read-only",
          "operation",
          "tests-required",
          "no-new-deps",
          "minimal-diff",
          "free",
        ]),
        text: z.string().optional(),
      }),
    )
    .optional(),
  deliveryNote: z.string().optional(),
});

/**
 * One card a task showed, for the record's Cards row (FI3-579 piece 1): the
 * kind the captain knows it by, its title (the version last seen once it has
 * closed), and how it ended in the captain's words. An `open` card is still on
 * the stage (a folded seen note included), so the row points at the live card;
 * a `closed` one opens as the read-only past card.
 */
export const taskCardRowSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(["decision", "note"]),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  /** Open but taken off the Mac stack by the captain. */
  minimized: z.literal(true).optional(),
  /** How a closed card ended (`pastCardEndingWords`); absent while it is open. */
  ending: z.string().optional(),
  /** When it ended, or when an open card was raised. */
  at: z.number(),
});
export type TaskCardRow = z.infer<typeof taskCardRowSchema>;

/** One record in full: the view plus what the board leaves out. */
export const taskDetailSchema = taskViewSchema.extend({
  cost: taskCostViewSchema.optional(),
  liveValidation: liveValidationSummarySchema.optional(),
  /** Current policies, separate from dispatch and published delivery history. */
  policies: effectiveTaskPoliciesSchema.nullable().optional(),
  /**
   * Where the task runs, once a computer that runs work is on the list:
   * where it started, or where it would start now. Absent otherwise, and
   * for a task that only ever runs on this Mac.
   */
  runsOn: taskRunsOnSchema.optional(),
  placement: placementSnapshotSchema.optional(),
  /**
   * The version of the home's personal instructions and skills the task's
   * newest conversation read, and the computer it read it on
   * (docs/personal-resources.md). Absent while none read them.
   */
  personal: personalReadSchema.optional(),
  intent: taskIntentViewSchema.nullable(),
  /** Dispatch-time care; current care lives in policies. */
  rigor: rigorSchema.nullable(),
  /**
   * What the host derived this task DELIVERS (Task B of the crew-posture
   * rationalization); null on a row shaped before the axis existed, which
   * shipped as a change.
   */
  deliverable: deliverableSchema.nullable(),
  /**
   * The task this work builds on, as the record names it (a key or an id),
   * and whether it holds - done or reported - derived at read, never
   * stored. Null when no basis was named.
   */
  basis: z.object({ ref: z.string(), verified: z.boolean() }).nullable(),
  /** Firstmate's declared reason for building without a plan, if any. */
  skippedPlanBecause: z.string().nullable(),
  /** The rendered brief the crewmate ran from. */
  brief: z.string(),
  /** The latest complete report; an answer given on a card reads as the card's words. */
  outcome: z.string().nullable(),
  /** The assigned model as the captain knows it ("GPT-6 Sol"); null when none. */
  modelLabel: z.string().nullable(),
  /**
   * Why the crewmate runs on that model, off its routing decision's typed
   * columns; absent when the task never routed or the record cannot say.
   */
  modelReason: modelReasonSchema.optional(),
  /**
   * How the routing decision behind that model compared it with the others
   * (INF-1714), as saved when it was made; absent before INF-1714 or when the
   * crewmate runs on another model than the decision chose.
   */
  modelChoice: modelChoiceSchema.optional(),
  /**
   * The reasoning the crewmate's session opened at on that model, as its
   * newest dispatch recorded it (FI3-439); absent when the record cannot say
   * or the crewmate has since moved to another model.
   */
  reasoning: reasoningSchema.optional(),
  /** Every card the task showed, open and past, newest first. */
  cards: z.array(taskCardRowSchema),
  /** The whole timeline, as recorded. */
  events: z.array(taskEventViewSchema),
  /** The timeline condensed for reading (the record's Activity; the popup audit, A8). */
  activityLog: z.array(taskActivityRowSchema),
  /** Every retained source, including evidence, opened read-only from its exact reference. */
  timeline: z.array(timelineReadingSchema).optional(),
  /**
   * The last sentence the crewmate wrote in its session, with its time
   * (`CrewActions.said`): its Now line between its notes (INF-557). Absent
   * or null when it wrote none, or nothing reads its sessions.
   */
  said: taskActionLineSchema.nullable().optional(),
  /**
   * The latest plan the crewmate reported with a progress note (FI3-734):
   * the whole list as declared, with its time; null when it never sent one.
   */
  plan: taskPlanSchema.nullable(),
  /**
   * How a closed row closed: when, and the words recorded with the close
   * (a drop's reason) when there were any beyond the reason's own word.
   * A close as done adds the delivery facts it recorded (`facts`), and
   * `onWord` when the captain's own word asked it (INF-3169's plan, piece
   * 3); both are absent on any other close, and from an older home.
   */
  closing: z
    .object({
      at: z.number(),
      note: z.string().nullable(),
      facts: z.array(recordDeliveryFactSchema).optional(),
      onWord: z.literal(true).optional(),
    })
    .nullable(),
  /**
   * The newest failure or interruption in plain words (`plainProblem`, whose
   * sign-in reading is the one classifier's); null when there was none. The
   * raw error stays on the timeline.
   */
  problem: z.string().nullable(),
  /**
   * Why a gate holds open work and what ends the wait, in the captain's
   * words (`taskHoldWords`, src/shared/taskHold.ts), read from its gate and
   * its own ask; absent when no gate holds it, or the captain's own does.
   */
  hold: z.object({ title: z.string(), text: z.string() }).optional(),
  asks: z.array(taskAskViewSchema),
  /** The filing, in the open on the record. Absent when this row was not crew-filed. */
  filing: z
    .object({
      why: z.string(),
      originKey: z.string(),
      verdict: z.string().nullable(),
    })
    .optional(),
  /** Present only while Drop task applies. The footer confirms these lists. */
  dropEffects: dropEffectsSchema.optional(),
  /**
   * The task's own browser on this Mac, as the captain reads it
   * (docs/task-browser.md, "The view"); absent while it never had one, and
   * on another computer.
   */
  browser: taskBrowserFactSchema.optional(),
});
export type TaskDetail = z.infer<typeof taskDetailSchema>;

// ---- the delta (task-system P5, design section 9.1) ------------------------

/**
 * The live set above which the core pushes deltas instead of snapshots
 * (design section 9.1: "a snapshot over 256 KB or a live set over 500").
 * Below the trigger the snapshot stays: it is simplest and provably
 * consistent. Above it, one `inf:tasks:delta` per coalescing window carries
 * only what changed since the last push, on the same `seq`.
 */
export const BOARD_DELTA_TRIGGER = Object.freeze({
  /** Rows on the board. */
  rows: 500,
  /** Serialized snapshot size, in bytes of JSON. */
  bytes: 256 * 1024,
});

/**
 * What changed between two boards. `baseSeq` is the seq of the board the
 * delta applies to; a client whose board carries any other seq has missed
 * a push and resyncs from `inf:tasks:board`. `projects` ride whole: the
 * index is one row per managed repo, and its counts move on most writes.
 */
export const taskBoardDeltaSchema = z.object({
  /** The seq the client's board must carry for this delta to apply. */
  baseSeq: z.number(),
  /** The seq the board carries after applying it. */
  seq: z.number(),
  at: z.number(),
  /** Rows new or changed since the base, whole. */
  upserts: z.array(taskViewSchema),
  /** Ids of rows that left the board. */
  removed: z.array(z.string()),
  projects: z.array(projectViewSchema),
  links: z.object({
    added: z.array(taskLinkViewSchema),
    removed: z.array(taskLinkViewSchema),
  }),
});
export type TaskBoardDelta = z.infer<typeof taskBoardDeltaSchema>;

/**
 * The board's canonical row order (creation, then id), which the core's
 * snapshot and a client's applied delta share so that the two are equal as
 * arrays, not only as sets.
 */
export function sortBoardTasks(tasks: readonly TaskView[]): TaskView[] {
  return [...tasks].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function linkKey(link: TaskLinkView): string {
  return `${link.fromId} ${link.toId} ${link.type}`;
}

/** The board's canonical edge order (from, to, type). */
export function sortBoardLinks(links: readonly TaskLinkView[]): TaskLinkView[] {
  return [...links].sort((a, b) => linkKey(a).localeCompare(linkKey(b)));
}

/**
 * The delta from `prev` to `next`: by construction
 * `applyTaskBoardDelta(prev, diffTaskBoards(prev, next))` deep-equals
 * `next` (pinned in tasks.test.ts). A row is upserted when its serialized
 * view differs, so a derived-flag change with no write of its own (a
 * blocker closing, a card leaving the stack) travels like any other. A row
 * that is the same object on both boards is the same row, compared without
 * serializing it, and so is the edge array: a core that keeps an untouched
 * row's view between pushes (`TaskProtocol`'s row cache) pays here for the
 * rows it rebuilt, not for the board.
 */
export function diffTaskBoards(prev: TaskBoard, next: TaskBoard): TaskBoardDelta {
  const before = new Map(prev.tasks.map((task) => [task.id, task]));
  const upserts: TaskView[] = [];
  const seen = new Set<string>();
  for (const task of next.tasks) {
    seen.add(task.id);
    const was = before.get(task.id);
    if (was === task) continue;
    if (was === undefined || JSON.stringify(was) !== JSON.stringify(task)) upserts.push(task);
  }
  const removed = prev.tasks.filter((task) => !seen.has(task.id)).map((task) => task.id);
  let added: TaskLinkView[] = [];
  let removedLinks: TaskLinkView[] = [];
  if (prev.links !== next.links) {
    const prevLinks = new Map(prev.links.map((link) => [linkKey(link), link]));
    const nextLinks = new Map(next.links.map((link) => [linkKey(link), link]));
    added = [...nextLinks.values()].filter((link) => !prevLinks.has(linkKey(link)));
    removedLinks = [...prevLinks.values()].filter((link) => !nextLinks.has(linkKey(link)));
  }
  return {
    baseSeq: prev.seq,
    seq: next.seq,
    at: next.at,
    upserts,
    removed,
    projects: next.projects,
    links: { added, removed: removedLinks },
  };
}

/**
 * Applies a delta to the board a client holds. Returns the board unchanged
 * when the delta is older than it (a stale push), the next board when the
 * delta's base is the board's seq, and null on a gap - the one signal to
 * resync from a fresh snapshot rather than guess.
 */
export function applyTaskBoardDelta(board: TaskBoard, delta: TaskBoardDelta): TaskBoard | null {
  if (delta.seq <= board.seq) return board;
  if (delta.baseSeq !== board.seq) return null;
  const rows = new Map(board.tasks.map((task) => [task.id, task]));
  for (const id of delta.removed) rows.delete(id);
  for (const task of delta.upserts) rows.set(task.id, task);
  const links = new Map(board.links.map((link) => [linkKey(link), link]));
  for (const link of delta.links.removed) links.delete(linkKey(link));
  for (const link of delta.links.added) links.set(linkKey(link), link);
  const next: TaskBoard = {
    seq: delta.seq,
    at: delta.at,
    projects: delta.projects,
    tasks: sortBoardTasks([...rows.values()]),
    links: sortBoardLinks([...links.values()]),
  };
  // A board read without its closed rows stays so: a row the delta brings
  // back, or takes off the whole board, is no longer one it left out.
  if (board.closedLeftOut) {
    const gone = new Set([...delta.removed, ...delta.upserts.map((task) => task.id)]);
    const done: Record<string, string[]> = {};
    for (const [projectId, ids] of Object.entries(board.closedLeftOut.done)) {
      const left = ids.filter((id) => !gone.has(id));
      if (left.length > 0) done[projectId] = left;
    }
    next.closedLeftOut = { done };
  }
  return next;
}

/**
 * How many rows Tasks lists under Done that `board` left out (`closedLeftOut`),
 * in one project or in all: zero on a whole board.
 */
export function closedLeftOutDone(
  board: Pick<TaskBoard, "closedLeftOut">,
  projectId?: string,
): number {
  const done = board.closedLeftOut?.done;
  if (!done) return 0;
  if (projectId !== undefined) return done[projectId]?.length ?? 0;
  let count = 0;
  for (const ids of Object.values(done)) count += ids.length;
  return count;
}
