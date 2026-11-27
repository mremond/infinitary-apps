import { z } from "zod";
import { BATCH_CHECK } from "./batches";
import type { FactDotState } from "./factDot";
import * as m from "./i18n/messages.generated.ts";

/** Reported check states, shared by the forge reader and every displayed fact. */
export const checkStateSchema = z.enum([
  "success",
  "failure",
  "error",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
  "skipped",
  "neutral",
  "pending",
]);
export type ForgeCheckState = z.infer<typeof checkStateSchema>;

const RED_STATES = new Set<ForgeCheckState>([
  "failure",
  "error",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
]);
export function isRedCheckState(state: ForgeCheckState): boolean {
  return RED_STATES.has(state);
}

/**
 * One check in a reading. `neutral` is a finished check that neither passed
 * nor failed, such as a report bot's GitHub check run: it holds nothing, as
 * GitHub's required checks pass on success, skipped or neutral. `manual`
 * marks a check a person must start before it runs, such as a GitLab manual
 * job that blocks its pipeline: it holds the change until someone starts it,
 * and nothing finishes on its own for a wake to report. `failureAllowed`
 * marks a `neutral` check that failed or was cancelled where its project
 * allows it to fail, such as a GitLab job with `allow_failure`: it holds
 * nothing, as GitLab's own pipeline passes with it. `advisory` is the state
 * the host reported for a check from one of the project's advisory
 * workflows (docs/forge.md, "Advisory workflows"), whose own state reads
 * `neutral`: it holds nothing in any state, and a reading where only
 * advisory or skipped checks ran waits as an empty one does (`noCheckRan`).
 */
export const checkItemSchema = z.object({
  name: z.string(),
  state: checkStateSchema,
  manual: z.boolean().optional(),
  failureAllowed: z.boolean().optional(),
  advisory: checkStateSchema.optional(),
});
export type CheckItem = z.infer<typeof checkItemSchema>;

export function waitsToStart(item: { manual?: boolean }): boolean {
  return item.manual === true;
}

export function failsAllowed(item: { failureAllowed?: boolean }): boolean {
  return item.failureAllowed === true;
}

export function isAdvisory(item: { advisory?: ForgeCheckState }): boolean {
  return item.advisory !== undefined;
}

export function checksWaitingToStart(items: readonly CheckItem[]): string[] {
  return items.filter(waitsToStart).map((item) => item.name);
}

/**
 * Whether a reading still has a check queued or running, or is incomplete:
 * the only reading whose finish the check watch waits for and wakes the
 * crewmate on (`./changeChecks.ts`). A held reading with nothing running -
 * a job waiting for a person, say - sends no wake.
 */
export function checksStillRunning(reading: {
  items: readonly { state: ForgeCheckState }[];
  complete?: boolean;
}): boolean {
  return reading.complete === false || reading.items.some((item) => item.state === "pending");
}

/** One current reading, not the crew's judgment or a second history. */
export const checkSnapshotSchema = z.object({
  headSha: z.string(),
  /**
   * The pull request the reading was of, as the reader named it (INF-1873):
   * the task's own, or one it selected to read. The change record binds the
   * reading to that pull request by this number, never by its head alone.
   */
  prNumber: z.number().int().positive().optional(),
  items: z.array(checkItemSchema),
  complete: z.boolean().optional(),
  /** Why part of this reading could not be obtained, not a sign-out inference. */
  problem: z.string().optional(),
  absenceDeclared: z.boolean(),
});
export type CheckSnapshot = z.infer<typeof checkSnapshotSchema>;

/**
 * The default branch's newest run of each check that failed in a reading
 * (INF-1915 fix 1): the version of that branch it was read on, when, and the
 * state there of each check the reading found red, where that branch ran it.
 * Evidence about the failure's cause for the crew's diagnosis and the card,
 * never a merge input: the merge boundary does not read it. The completion
 * card's checks hold does (`checksFailingOnMain`): a failure that branch
 * fails too lets the card up at once, stated from this fact.
 */
export const mainCheckEvidenceSchema = z.object({
  sha: z.string(),
  at: z.number(),
  items: z.array(z.object({ name: z.string(), state: checkStateSchema })),
});
export type MainCheckEvidence = z.infer<typeof mainCheckEvidenceSchema>;
const STATE_WORDS: Record<ForgeCheckState, string> = {
  success: "passed",
  failure: "failed",
  error: "error",
  cancelled: "cancelled",
  timed_out: "timed out",
  action_required: "needs a decision",
  startup_failure: "did not start",
  stale: "out of date",
  skipped: "skipped",
  neutral: "neutral",
  pending: "running",
};

export const CHECK_WAITING_TO_START_WORDS = "waiting to be started";

export const CHECK_FAILURE_ALLOWED_WORDS = "allowed to fail";

const WORDED_STATES: Record<ForgeCheckState, () => string> = {
  success: m.recordCheckStatePassed,
  failure: m.recordCheckStateFailed,
  error: m.recordCheckStateError,
  cancelled: m.recordCheckStateCancelled,
  timed_out: m.recordCheckStateTimedOut,
  action_required: m.recordCheckStateNeedsDecision,
  startup_failure: m.recordCheckStateDidNotStart,
  stale: m.recordCheckStateOutOfDate,
  skipped: m.recordCheckStateSkipped,
  neutral: m.recordCheckStateNeutral,
  pending: m.recordCheckStateRunning,
};

/** An advisory check with the state the host reported, such as `advisory, running`. */
export function advisoryCheckWords(state: ForgeCheckState): string {
  return m.recordCheckAdvisory({ state: WORDED_STATES[state]() });
}

export const CHECKS_NOT_REPORTED_WORDS = "none reported";
export const CHECKS_ABSENT_WORDS = "no checks";
/** What the checks say when the app could not read them all; the task card adds the reason. */
export const CHECKS_UNREADABLE_WORDS = "cannot read all checks";
/** What the checks say when the reading came back incomplete with no reason. */
export const CHECKS_INCOMPLETE_WORDS = "reading incomplete";

/**
 * Whether a reading shows no check that ran (INF-3915): no check at all, or
 * only skipped ones. Right after a pull request opens, the host may list a
 * job that skips on that event before the jobs that run have registered, so
 * such a reading is still pending until the crew declares the absence of
 * checks at that version, exactly as an empty one is. An advisory check
 * decides nothing, so it counts as none here too (docs/forge.md, "Advisory
 * workflows").
 */
export function noCheckRan(
  items: readonly { state: ForgeCheckState; advisory?: ForgeCheckState }[],
): boolean {
  return items.every((item) => item.state === "skipped" || isAdvisory(item));
}

/**
 * The checks of a reading that ran where the project lives, any one of which
 * ends the project's record that it runs no pull request checks
 * (docs/forge.md, "A project with no checks"): a skipped check did not run,
 * an advisory one decides nothing, and the batch check is the app's own, by
 * its name or an earlier queue's.
 */
export function checksThatRan<
  T extends { name: string; state: ForgeCheckState; advisory?: ForgeCheckState },
>(items: readonly T[]): T[] {
  return items.filter(
    (item) =>
      item.state !== "skipped" &&
      !isAdvisory(item) &&
      item.name !== BATCH_CHECK &&
      !item.name.startsWith(`${BATCH_CHECK} [`),
  );
}

/** Display-only tally of reported facts; never a readiness or merge decision. */
export function checkSnapshotSummary(reading: CheckSnapshot): {
  overall: "green" | "red" | "pending" | "none";
  words: string;
  dot: FactDotState;
  problem?: string;
} {
  const problem = reading.problem ? { problem: reading.problem } : {};
  const incomplete = reading.complete === false || Boolean(reading.problem);
  const unknownWords = reading.problem
    ? `${CHECKS_UNREADABLE_WORDS}: ${reading.problem}`
    : CHECKS_INCOMPLETE_WORDS;
  if (reading.items.length === 0) {
    const absent = reading.absenceDeclared && !incomplete;
    return {
      ...problem,
      overall: absent ? "none" : "pending",
      words: absent ? CHECKS_ABSENT_WORDS : incomplete ? unknownWords : CHECKS_NOT_REPORTED_WORDS,
      dot: absent ? "idle" : reading.problem ? "warn" : "running",
    };
  }
  const counts = new Map<string, number>();
  for (const check of reading.items) {
    const word = itemWords(check);
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const words =
    [...counts]
      .map(([word, count]) => (reading.items.length === 1 ? word : `${count} ${word}`))
      .join(" · ") + (incomplete ? ` · ${unknownWords}` : "");
  if (reading.items.some((check) => isRedCheckState(check.state)))
    return { ...problem, overall: "red", words, dot: "failed" };
  if (incomplete || reading.items.some((check) => check.state === "pending"))
    return { ...problem, overall: "pending", words, dot: reading.problem ? "warn" : "running" };
  // A check a person must start holds, with nothing running for a wake;
  // a finished neutral one does not (`checkItemSchema`).
  if (reading.items.some(waitsToStart)) return { overall: "pending", words, dot: "warn" };
  if (noCheckRan(reading.items) && !reading.absenceDeclared)
    return { overall: "pending", words, dot: "running" };
  return { overall: "green", words, dot: "ok" };
}

function itemWords(check: {
  state: ForgeCheckState;
  manual?: boolean;
  failureAllowed?: boolean;
  advisory?: ForgeCheckState;
}): string {
  if (check.advisory) return advisoryCheckWords(check.advisory);
  if (waitsToStart(check)) return CHECK_WAITING_TO_START_WORDS;
  if (failsAllowed(check)) return CHECK_FAILURE_ALLOWED_WORDS;
  return STATE_WORDS[check.state];
}

/**
 * The checks as one state, as the hover preview says them (INF-2528, the
 * captain's direction B): `running`, `passed`, `failed`. The counts and a
 * refusal's reason are the task card's (`checkSnapshotSummary`).
 */
export function checkSnapshotState(reading: CheckSnapshot): string {
  const { overall, words } = checkSnapshotSummary(reading);
  if (overall === "red") return STATE_WORDS.failure;
  if (reading.problem) return CHECKS_UNREADABLE_WORDS;
  if (reading.items.length === 0) return words;
  // Only skipped checks never read passed, even once declared (INF-3915);
  // advisory ones beside them leave none reported, since they decide nothing.
  if (noCheckRan(reading.items) && reading.complete !== false)
    return reading.items.some(isAdvisory) ? CHECKS_NOT_REPORTED_WORDS : STATE_WORDS.skipped;
  if (overall === "green") return STATE_WORDS.success;
  if (reading.items.some((check) => check.state === "pending")) return STATE_WORDS.pending;
  if (reading.complete === false) return CHECKS_INCOMPLETE_WORDS;
  return CHECK_WAITING_TO_START_WORDS;
}

/**
 * A reading of the change's own checks (INF-3208): every check but the
 * batch check, which says where the change stands in its batch, not how its
 * own checks ran. The merge card counts these in its Checks cell and shows
 * the batch check in its Batch check cell.
 */
export function ownChecks(reading: CheckSnapshot): CheckSnapshot {
  if (!reading.items.some((item) => item.name === BATCH_CHECK)) return reading;
  return { ...reading, items: reading.items.filter((item) => item.name !== BATCH_CHECK) };
}

/**
 * How the batch check stands in the reading of `head`, beside the change's
 * own checks (INF-3208): `failed` when the batch failed the version or left
 * it out, and `alone` when that is the reading's only failure, every own
 * check passed, skipped or finished neutral. Undefined when the reading of that
 * version carries no failed batch check.
 */
export function failedBatch(
  delivery: { checks?: CheckSnapshot } | null | undefined,
  head: string,
): { alone: boolean } | undefined {
  const reading = delivery?.checks;
  if (reading?.headSha !== head) return undefined;
  const batch = reading.items.find((item) => item.name === BATCH_CHECK);
  if (!batch || !isRedCheckState(batch.state)) return undefined;
  const own = ownChecks(reading).items;
  return {
    alone:
      reading.complete !== false &&
      !reading.problem &&
      own.every(
        (item) =>
          (item.state === "success" || item.state === "skipped" || item.state === "neutral") &&
          !waitsToStart(item),
      ),
  };
}

export const CHECKS_OTHER_VERSION_WORDS = "not read for this version";

/** A cached reading never describes a different version. */
export function currentCheckSummary(delivery: {
  checks?: CheckSnapshot;
  headSha?: string;
}): ReturnType<typeof checkSnapshotSummary> | undefined {
  const reading = delivery.checks;
  if (!reading) return undefined;
  if (delivery.headSha && delivery.headSha !== reading.headSha)
    return { overall: "pending", words: CHECKS_OTHER_VERSION_WORDS, dot: "idle" };
  return checkSnapshotSummary(reading);
}

/**
 * The checks as one state for the change's current version
 * (`checkSnapshotState`): a reading of another version says so, as
 * `currentCheckSummary` does, never that version's result (INF-2538).
 */
export function currentCheckState(delivery: {
  checks?: CheckSnapshot;
  headSha?: string;
}): string | undefined {
  const reading = delivery.checks;
  if (!reading) return undefined;
  if (delivery.headSha && delivery.headSha !== reading.headSha) return CHECKS_OTHER_VERSION_WORDS;
  return checkSnapshotState(reading);
}
/** Existing merge-check status from facts, not a separate judgment of the work. */
export function currentCheckStatus(
  delivery:
    | {
        ci?: "green" | "red" | "pending" | "no-pr" | "merged";
        checks?: CheckSnapshot;
        headSha?: string;
      }
    | null
    | undefined,
): "green" | "red" | "pending" | "no-pr" | "merged" | undefined {
  if (!delivery) return undefined;
  if (delivery.ci === "no-pr" || delivery.ci === "merged") return delivery.ci;
  const summary = currentCheckSummary(delivery);
  // Declared absence satisfies the check condition; the visible fact remains "no checks".
  return summary ? (summary.overall === "none" ? "green" : summary.overall) : delivery.ci;
}

/**
 * The checks the current reading found red whose newest run on the default
 * branch failed too (INF-1915 fix 1): read from the recorded evidence, only
 * while the reading and the evidence are both of the current version. Names,
 * never a judgment: the card states the fact and the captain decides.
 */
export function checksFailingOnMain(delivery: {
  headSha?: string;
  checks?: CheckSnapshot;
  mainChecks?: MainCheckEvidence & { head: string };
}): string[] {
  const { headSha, checks, mainChecks } = delivery;
  if (!headSha || checks?.headSha !== headSha || mainChecks?.head !== headSha) return [];
  const onMain = new Set(
    mainChecks.items.filter((item) => isRedCheckState(item.state)).map((item) => item.name),
  );
  return [
    ...new Set(
      checks.items
        .filter((item) => isRedCheckState(item.state) && onMain.has(item.name))
        .map((item) => item.name),
    ),
  ];
}

/**
 * Whether every check the current reading found red fails on the default
 * branch too: the one fact that lets a merge card up at once on failed checks
 * without the crew's diagnosis (INF-1915 fix 1). False with no failure.
 */
export function everyFailureOnMain(delivery: {
  headSha?: string;
  checks?: CheckSnapshot;
  mainChecks?: MainCheckEvidence & { head: string };
}): boolean {
  const { headSha, checks } = delivery;
  if (!headSha || checks?.headSha !== headSha) return false;
  const failed = new Set(
    checks.items.filter((item) => isRedCheckState(item.state)).map((item) => item.name),
  );
  if (failed.size === 0) return false;
  const onMain = new Set(checksFailingOnMain(delivery));
  return [...failed].every((name) => onMain.has(name));
}
