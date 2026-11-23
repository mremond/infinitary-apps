/**
 * Every wake kind's words, byte for byte (INF-2625's plan, the wakes row:
 * "a byte-exact test of every wake kind's words, with none falling back to
 * the unknown wake"). The served words are what a first mate or crewmate
 * reads, and what the replay ledger matches against, so a restructure of
 * `wakes.ts` must leave each one the same bytes.
 *
 * The cases live in files by who hears them and, for the first mate, by the
 * wake family that words them: each `wakes.words.firstmate.<family>.test.ts`
 * holds the first mate's kinds its family's `*Wakes.ts` module words,
 * `wakes.words.firstmate.test.ts` the rest of `FirstmateWakeKind`, and
 * `wakes.words.crewmate.test.ts` every other kind `WakeFacts` declares but
 * `SavedOnlyWakeKind` and the kinds below that have files of their own. Each
 * file's table is keyed by its kinds, so a kind with no case does not compile.
 */
import { describe, expect, it } from "vitest";
import type { CaptainFacts } from "../../src/core/orchestrator/captainWakes";
import type { HoldWay } from "../../src/core/orchestrator/holds";
import type { IdleFacts } from "../../src/core/orchestrator/idleWakes";
import type { NoticeFacts } from "../../src/core/orchestrator/noticeWakes";
import type { OutageFacts } from "../../src/core/orchestrator/outageWakes";
import type { ReportFacts } from "../../src/core/orchestrator/reportWakes";
import type { StartFacts } from "../../src/core/orchestrator/startWakes";
import type { TurnFacts } from "../../src/core/orchestrator/turnWakes";
import { renderWake, type WakeFacts } from "../../src/core/orchestrator/wakes";

export type WakeKind = WakeFacts["kind"];

/** The kinds only the first mate hears: the crew's facts, the captain's turns and the app's own notices. */
export type FirstmateWakeKind =
  | "requested-response"
  | "response-missing"
  | "possible-repetition"
  | "resource-pressure"
  | "memory-warning-ended"
  | "line-blocked"
  | "freeze-recorded"
  | "panel-update-asked"
  | "team-queue-left"
  | "validation-question-stale"
  | "idle-stall"
  | "backlog-news"
  | "next-move"
  | "idle-asked"
  | "idle-owed"
  | "outage-failed"
  | "outage-still-down"
  | "outage-recovered"
  | "provider-stuck"
  | "provider-cut-off"
  | "provider-back"
  | "job-bound"
  | "turn-failed"
  | "commit-failed"
  | "program-bound"
  | "program-ended"
  | "report"
  | "review-orphan"
  | "review-unstated"
  | "review-verdict"
  | "task-failed"
  | "settled"
  | "answer-closed"
  | "guidance-set-aside"
  | "quiet"
  | "long-turn"
  | "steer-unread"
  | "handover-failed"
  | "queued-started"
  | "queued-start-failed"
  | "asked-start-waits"
  | "captain-start"
  | "dead-gate"
  | "reasoning-wait"
  | "system-wait"
  | "named-model-wait"
  | "computer-left-out"
  | "project-setup"
  | "project-change"
  | "scheduled"
  | "welcome"
  | "captain-turn"
  | "answer-missing"
  | "model-unasked"
  | "seat-moved";

/**
 * The first mate's kinds each wake family words, read from the family's own
 * facts, one file of cases each (`wakes.words.firstmate.<family>.test.ts`).
 */
export type FirstmateNoticeWakeKind = Extract<FirstmateWakeKind, NoticeFacts["kind"]>;
export type FirstmateStartWakeKind = Extract<FirstmateWakeKind, StartFacts["kind"]>;
export type FirstmateReportWakeKind = Extract<FirstmateWakeKind, ReportFacts["kind"]>;
export type FirstmateIdleWakeKind = Extract<FirstmateWakeKind, IdleFacts["kind"]>;
export type FirstmateTurnWakeKind = Extract<FirstmateWakeKind, TurnFacts["kind"]>;
export type FirstmateCaptainWakeKind = Extract<FirstmateWakeKind, CaptainFacts["kind"]>;
export type FirstmateOutageWakeKind = Extract<FirstmateWakeKind, OutageFacts["kind"]>;

/**
 * The first mate's kinds no family file above holds, which
 * `wakes.words.firstmate.test.ts` keeps: a kind a new family adds lands here
 * until it has a file of its own.
 */
export type FirstmateOtherWakeKind = Exclude<
  FirstmateWakeKind,
  | FirstmateNoticeWakeKind
  | FirstmateStartWakeKind
  | FirstmateReportWakeKind
  | FirstmateIdleWakeKind
  | FirstmateTurnWakeKind
  | FirstmateCaptainWakeKind
  | FirstmateOutageWakeKind
>;

/**
 * The kinds the host no longer queues, which only rows an earlier build saved
 * still carry: `wakes.savedRows.test.ts` pins their words from the saved
 * rows themselves, so they hold even once the kinds leave `WakeFacts`.
 */
export type SavedOnlyWakeKind = "ci-cap" | "review-cap" | "main-check-passed";

/** Correction flow has its own byte-exact cases, including the internal queue packet. */
export type CorrectionWakeKind =
  | "correction-input"
  | "correction-review"
  | "kept-project-direction";

/**
 * Batches of your own have their own byte-exact cases: the hold the first
 * mate hears, a crewmate's send-back, and the steer that its approved change
 * waits in a line (the batch line or the host's merge queue).
 */
export type OwnBatchWakeKind = "batch-held" | "batch-sent-back" | "batch-rebuild" | "merge-line";

/** A card button the app could not carry out has its own byte-exact cases (INF-4072). */
export type CardActionWakeKind = "card-action-undone";

/** Finished work still open an hour on has its own byte-exact cases (INF-4072, finding 4). */
export type FinishedOpenWakeKind = "finished-open";

/** Every other kind: a crewmate's steers, and the wrappers and choices either lane hears. */
export type CrewmateWakeKind = Exclude<
  WakeKind,
  | FirstmateWakeKind
  | SavedOnlyWakeKind
  | CorrectionWakeKind
  | OwnBatchWakeKind
  | CardActionWakeKind
  | FinishedOpenWakeKind
>;

/** One wake as a lane holds it, and the words it is served as. */
export type WordsCase<K extends WakeKind> = {
  name: string;
  wake: { facts: Extract<WakeFacts, { kind: K }>; ways?: HoldWay[] };
  words: string;
};

/** At least one case for each of `Kinds`. */
export type WordsCases<Kinds extends WakeKind> = {
  [K in Kinds]: [WordsCase<K>, ...WordsCase<K>[]];
};

/** What `renderWake` serves for facts it cannot word: never one of these cases' words. */
const UNKNOWN_WAKE = "a wake this version cannot word";

/** One test per case: its words are the pinned bytes, and never the unknown wake. */
export function pinWakeWords<Kinds extends WakeKind>(title: string, cases: WordsCases<Kinds>) {
  describe(title, () => {
    for (const [kind, each] of Object.entries(cases) as [string, WordsCase<Kinds>[]][]) {
      for (const one of each) {
        it(`${kind}: ${one.name}`, () => {
          const words = renderWake(one.wake);
          expect(words).not.toContain(UNKNOWN_WAKE);
          expect(words).toBe(one.words);
        });
      }
    }
  });
}

/** The task most cases are about, and its review. */
export const WAKE_TASK = { id: "479823ee", title: "Restructure the wakes file" };
export const WAKE_REVIEW = { id: "b9299a73", title: "Review: Restructure the wakes file" };

/** A moment the cases' times count from (2026-11-05T18:32:08Z). */
export const WAKE_AT = 1_793_903_528_000;

/** A picture the captain sent with a message. */
export const WAKE_PICTURE = {
  id: "a1",
  kind: "image" as const,
  name: "settings.png",
  mimeType: "image/png" as const,
  bytes: 48_213,
  sha256: "9f2c4e1b7a0d3f6e8c5b2a1d4e7f0c3b6a9d2e5f8c1b4a7d0e3f6c9b2a5d8e1f",
  file: "m-118/settings.png",
};
