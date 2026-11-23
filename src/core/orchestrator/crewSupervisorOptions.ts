import type { CutOff } from "@shared/authFailure";
import type { Card, CardAnswer, CardThread, TurnImage } from "@shared/cards";
import type { CheckChangeInput } from "@shared/checkRepair";
import type { ClaudeAccessSource } from "@shared/claudeAccess";
import type { ComputerReach } from "@shared/devices";
import type { FmEvent } from "@shared/events";
import type { IntegrationApprovalChoice } from "@shared/integrations";
import type { RepoView } from "@shared/repos";
import type { ServedWakeOrigin } from "@shared/servedFrame";
import type {
  OfferedSignIn,
  TaskBrowserCommandResult,
  TaskBrowserFact,
  TaskBrowserHandle,
  TaskBrowserRequest,
} from "@shared/taskBrowser";
import type { CrewmateBrowser } from "../browser/taskBrowsers";
import type { TaskFiles } from "../files/taskFiles";
import type {
  DownloadArtifactInput,
  ForgePull,
  GithubReadInput,
  GithubWriteInput,
  ReadWorkflowInput,
  WorkflowRun,
} from "../forge";
import type { IntegrationAskTaken, TaskIntegrations } from "../integrations";
import type { KnowledgeService } from "../knowledge/knowledgeService";
import type { MessageFile } from "../overflow";
import type { AppPaths } from "../paths";
import type {
  LiveTurnCommit,
  PanelCaptureResult,
  PanelPlaceResult,
} from "../personal/personalExtensions";
import type { MediaProbe, TypefaceProbe } from "../pi/cardImages";
import type { AutomaticPlacement } from "../placed/automaticPlacement";
import type { CrewMachines } from "../placed/crewMachines";
import type { KindClassifier } from "../routing/kindClassifier";
import type { Router } from "../routing/router";
import type { Runbooks } from "../runbooks/runbooks";
import type { SecretsCommand } from "../secrets/requests";
import type { SessionBinding, SessionFactories, SessionSpec, TaskShell } from "../session/session";
import type { DeclaredCardInput, SecretUsesElsewhere } from "../session/tools";
import type { CardStore } from "../storage/cardStore";
import type { InboxStore } from "../storage/inboxStore";
import type { TaskService } from "../tasks/taskService";
import type { RepoRegistry } from "../workspace/repoRegistry";
import type { WorkspaceService } from "../workspace/workspaceService";
import type { PrCiOverall } from "./changeChecks";
import type { MergeGuard, PrOutcome } from "./changeMerge";
import type { WatchedReading } from "./checkWatch";
import type { CrewmateSpec } from "./crewSession";
import type { RunBatchFacts } from "./deliveryWakes";
import type { WriteAskSent } from "./githubGateway";
import type { AccountServeability } from "./idleLadder";
import type { PersonalBriefFacts } from "./intentBrief";
import type { MainBranchReading } from "./mainCheckWake";
import type { MergedStory } from "./mergedStory";
import type { IdleRule, ReportSortRule } from "./reportSort";
import type { RunReading } from "./runWatch";
import type { TypedWake, WakeFacts } from "./wakes";

/** The account a resume binds (`reselectForResume`), with its writes kept apart. */
export type ResumeAccount = {
  accountId?: string;
  changed: boolean;
  record?(): void;
  selected?(): void;
};

/**
 * The consent card's two answers (one plugin vehicle, Phase A, A2a): the
 * captain's click on "Add it" adds the staged plugin, and only "Don't add"
 * turns it down. The minus keeps the staged offer pending. The installer is the only
 * implementation; the supervisor only routes the click it already owns.
 */

export type PluginConsentHandler = {
  add: (pluginId: string) => void;
  decline: (pluginId: string) => void;
};

/**
 * The setup card's two answers (docs/fleet.md, "Asking the first mate to add a
 * project"): Add project sets the project up with the settings the
 * captain chose on the card, which its answers carry, and explicit Not now
 * declines it. The minus keeps the offer pending. `offer` is the card's own effect
 * argument, never words a body or an agent wrote.
 */
export type ProjectSetupHandler = {
  add: (offer: string | undefined, answers?: readonly CardAnswer[]) => void;
  decline: (offer: string | undefined) => void;
};

export type FirstmateHooks = {
  /**
   * Queue an [fm-op] operational message for the Firstmate agent: a typed
   * wake the drain renders (`wakes.ts`), never prose the host composed. The
   * origin is what the wake is (a crewmate report, or any other host
   * operation) - the consuming turn is classified by it, never by the text -
   * and the optional ref names the task the wake is about.
   */
  notifyOp: (wake: TypedWake, origin: ServedWakeOrigin, ref?: string) => number | null | void;
  /**
   * Why the Firstmate cannot answer a Start right now, from typed facts: its
   * seat is paused, or its lane is waiting out a provider outage. Absent, or
   * undefined, means it can. Without the hook a Start goes ahead as it is.
   */
  firstmateCannotAnswer?: () => string | undefined;
  /** An actual footer click, never a script-fired choice. */
  notifyCaptainChoice?: (wake: TypedWake, ref?: string) => void;
  /** Premium serveability at this moment; an absent reading is not exhausted. */
  premiumCanServe?: () => boolean;
  /** Retry the last failed Firstmate turn (the error card's action). */
  retryConverse: () => void;
  /**
   * A captain reply on the Firstmate's own card (cards-as-threads phase 2):
   * a captain turn about that card. Optional so supervisor tests without an
   * agent still record the thread message.
   */
  converseAboutCard?: (
    cardId: string,
    text: string,
    images?: TurnImage[],
    messageFiles?: MessageFile[],
    /** Reader-facing receipt; the text above stays the full model input. */
    receipt?: string,
  ) => void;
  /** Apply the rung-2 ladder move: rebind Firstmate to another provider. */
  moveFlagship?: (providerId: string) => void;
  /**
   * A pause card's "Try again": a refusal clears and the lane drains once;
   * on a spent allowance it rechecks, or attempts once when its argument
   * says so (`spentAttemptArg`).
   */
  tryAgain?: (arg: string) => void;
  /** A run-out card's "Keep going on credits": the account's switch goes on. */
  keepGoingOnCredits?: (accountId: string) => void;
  /** A card's "Use a saved reset", by the account's key (`FirstmateAgentOptions.redeemSavedReset`). */
  redeemSavedReset?: (accountKey: string) => "ran" | "sign-in";
  /** A run-out card's "Use saved resets on their own" (`FirstmateAgentOptions.turnOnSavedResets`). */
  turnOnSavedResets?: (accountKey: string) => "ran" | "sign-in";
  /** The notice's "Ask again": the captain's message sent once more as a new turn. */
  askAgain?: (askId: string) => void;
  /** Watchdog pass over the Firstmate's own turn, on the shared tick (P4). */
  checkQuiet?: (now: number) => void;
  /** A durable-inbox delivery poke for the firstmate lane, on the shared tick. */
  pokeInbox?: () => void;
  /**
   * A captain's message's work closed or the captain answered a card: the
   * first mate's answer check reads how each message stands, once it is
   * not mid-turn (INF-1610).
   */
  asksMoved?: () => void;
  /** A card went up: a notice it answers is taken back (INF-2664). */
  cardPlaced?: () => void;
};

/** The account-selection surface the supervisor consumes (AccountSelector). */
export type AccountAttachment = {
  /** `crew` names the routed model, so its accounts rank in that model's scope (INF-1714). */
  selectForSpawn(
    taskId: string,
    piProviderId: string,
    crew?: { model: string },
  ): string | undefined | Promise<string | undefined>;
  /**
   * `selectForSpawn` with its writes kept apart (`AccountSelector.pickForSpawn`):
   * a move writes the decision in its own transaction and marks the account
   * selected once that committed. Absent on a stand-in, which a move then
   * asks `selectForSpawn`.
   */
  pickForSpawn?(
    taskId: string,
    piProviderId: string,
    crew?: { model: string; passing?: readonly string[] },
  ): Promise<{ accountId?: string; record(): void; selected(): void }>;
  /**
   * The account a resume binds: the recorded one while healthy, else a
   * serving sibling, its decision written by `record` and the account marked
   * selected by `selected` only once the resumed conversation is accepted.
   */
  reselectForResume(
    taskId: string,
    accountId: string | null,
  ): ResumeAccount | Promise<ResumeAccount>;
  labelOf(accountId: string): string | undefined;
  /** Where a Claude account's access comes from when it is not a subscription. */
  accessOf?(accountId: string): ClaudeAccessSource | undefined;
  /**
   * What a pick reads of this Mac's accounts, as one comparable string - each
   * account, whether it is on, connected or withheld, and the models it
   * lists - so a wait for a model tries again once one could serve.
   */
  servingState?(): string;
  /**
   * Whether the account serves the model now - on, connected, withheld by
   * nothing, and listing it, or listing nothing while no sibling's list
   * names it - so a conversation bound to it opens on that model.
   */
  serves?(accountId: string, model: { provider: string; id: string }): boolean;
};

export type CrewSupervisorOptions = {
  /**
   * Where the captain's input comes from (docs/devices.md, "Where the
   * captain is"): a crewmate hears it beside each choice and reply, and in
   * emit_card's answer. Absent, nothing names it.
   */
  captainPlaces?: import("../devices/captainPlaces").CaptainPlaceReads;
  /**
   * The reader check (docs/card-authoring.md, "The reader check"): asked
   * about a crewmate's own card once it is up, its answer added to the
   * emit_card answer as facts. `on` is read before anything waits, so a
   * check that is off leaves the card's answer as it was.
   */
  readerCheck?: {
    on(): boolean;
    read(taskId: string, card: { title: string; body: string }): Promise<string>;
  };
  taskSelection?: (
    input: import("../storage/taskSelection").TaskSelectionInput,
  ) => Promise<import("../storage/taskSelection").TaskSelection>;
  automaticPlacement?: AutomaticPlacement;
  /**
   * Starts the process a program's script runs in (docs/programs.md).
   * Absent, a program is refused when it is filed.
   */
  programProcess?: import("../host").HostChildSpawner;
  /**
   * One JSON answer from the person's own cheapest chat model
   * (`ProgramQuestions.answerJson`), for a program's ask(); never a decision
   * model. Absent, ask() answers null.
   */
  answerJson?: (
    caller: { purpose: string; taskId?: string },
    instruction: string,
    text: string,
    signal: AbortSignal,
  ) => Promise<{ text: string } | { failed: string }>;
  /** The app build every card observation is stamped with (docs/card-evidence.md). */
  build?: string;
  /**
   * Each backend's session factory (the session contract): a crewmate is
   * the crewmate preset, opened by the factory of the backend its account
   * binds to.
   */
  sessions: SessionFactories;
  /**
   * The computers that run work for this home (src/core/placed/): a task
   * whose record names one (`deviceId`) opens its conversation there, with
   * that computer's factories and its folders, and waits while it is out of
   * reach or not yet caught up. Absent, every task runs on this Mac.
   */
  machines?: CrewMachines;
  /**
   * Whether a computer is connected on an older Firstmate and takes no new
   * work until it is updated (`Computers.takesNoWorkUntilUpdated`): a task
   * waiting for it says so, not that it is out of reach.
   */
  takesNoWorkUntilUpdated?: (deviceId: string) => boolean;
  /** The one reach value (`reachFrom`). Absent, out of reach. */
  reachOf?: (deviceId: string) => ComputerReach;
  /**
   * Whether the home follows that computer's update now
   * (`Computers.updatingOf`): its open tasks read updating, not out of reach.
   */
  updatingOf?: (deviceId: string) => boolean;
  /** A task began waiting for that computer's update: its Update card returns, even after Not now. */
  recallUpdateCard?: (deviceId: string) => void;
  /**
   * An account's binding, through the one binder: no account binds to the
   * base runtime, and an account that cannot serve throws, so the spawn
   * fails loudly rather than running somewhere else.
   */
  bind: (accountId: string | undefined, providerId?: string) => Promise<SessionBinding>;
  /** The home's opt-in; a computer that runs work reads the home's set it keeps. */
  personalResourcesEnabled?: () => boolean;
  /**
   * The version of the home's personal set a conversation on this Mac reads
   * (docs/personal-resources.md): its timeline names it, and the Info tab.
   */
  personalVersion?: () => Promise<import("@shared/personalSet").PersonalVersion>;
  source?: import("../selfSource/resolve").SelfSourceReader;
  runbooks?: Runbooks;
  /**
   * The crewmate preset. Absent, `crewmateSessionSpec` over the app's paths;
   * the replay and the tests hand in one that also keeps each crewmate's
   * callbacks, so a recorded tool call plays straight into them.
   */
  sessionSpec?: (crewmate: CrewmateSpec, binding: SessionBinding) => SessionSpec;
  workspace: WorkspaceService;
  repos: RepoRegistry;
  /** Resolve a project's contribution destination before starting code work, on either computer. */
  prepareContribution?: (taskId: string) => Promise<string | undefined>;
  /** The one task writer (task-system P0): every record change goes through it. */
  tasks: TaskService;
  taskTimeline?: import("../tasks/taskTimeline").TaskTimeline;
  cardStore: CardStore;
  /**
   * Knowledge (docs/knowledge.md): present in every build. Applicable
   * directions ride a conversation's first turn and any turn after they
   * change (`crewDirections.ts`). A task with a project or references
   * grant gets the knowledge pair locally or on a compatible work computer.
   * Optional only for isolated callers that provide no Knowledge service.
   */
  knowledge?: KnowledgeService;
  /** The durable inbox: one lane per task, plus the firstmate lane. */
  inbox: InboxStore;
  /** Optional routing (D-7/D-18); absent defers to the runtime default. */
  router?: Router;
  /**
   * The reviewer question (INF-5021): before a review with no model named
   * for it starts, the decision model reads the standing directions and
   * answers usual or a model one calls for. Absent, the usual pick reviews.
   */
  reviewerChooser?: import("./reviewerChoice").ReviewerChooser;
  /**
   * Whether the account-less runtime serves any model of its own (a
   * models.json provider): a start on this Mac that routing placed on no
   * model opens there. With none, that session has nothing to answer it and
   * fails as a sign-in, so the start is refused in words instead.
   * Absent = it may serve.
   */
  accountlessServes?: (model?: { provider: string; id: string }) => boolean;
  /**
   * The models that account-less runtime serves, so a start routing placed
   * on no model runs on the one its user named when it is among them
   * (`TaskPlacement.accountlessNamed`). Absent = none.
   */
  accountlessModels?: () => { provider: string; id: string }[];
  /**
   * What establishes a spawn's KIND (intelligence-bucket routing S3).
   * Absent is the honest S2 behaviour: every shape stays `unclear` and R8
   * routes it high - the classifier can make routing cheaper, never
   * possible.
   */
  classifier?: KindClassifier;
  /** Optional account selection (broker phase 4); absent = base runtime. */
  accounts?: AccountAttachment;
  /**
   * A typed cut-off a crewmate's turn observed, recorded on its account
   * (`AccountVault.noteCutOff`): the fact every reader of serveability sees.
   */
  noteCutOff?: (accountId: string, cutOff: CutOff) => void;
  /**
   * Whether each account serves, and the cut-off standing on it (the
   * cut-off contract): a lane is held while a cut-off stands on its
   * account, and the Firstmate hears the cut-off once and its end once.
   * Absent = no account is ever held.
   */
  serveability?: AccountServeability;
  /** The latest available ledger reading, without aggregating historical rows. */
  latestUsage?: (
    taskId: string,
  ) => ReturnType<import("../storage/usageStore").UsageStore["latestForTask"]>;
  /**
   * Each task's cost limit below the app's, the holds it placed, and the
   * app's own limit (docs/usage.md, "The cost limit"); absent, no task is
   * held.
   */
  costLimits?: import("./costLimits").CostLimitFacts;
  /** Records per-turn usage for burn tracking (D-18), per account. */
  recordUsage?: (input: {
    taskId: string;
    accountId?: string;
    model?: { provider: string; id: string };
    usage: NonNullable<Extract<FmEvent, { type: "turn_end" }>["usage"]>;
  }) => void;
  paths: AppPaths;
  /**
   * Whether a quota-reset gate's scope has headroom again (R1). Refs are a
   * quota provider id or `bucket:<intelligence>`; absent means such gates
   * never clear on their own.
   */
  quotaGateCleared?: (ref: string) => boolean;
  /**
   * Whether a quota-reset ref names a real scope. Absent means refs are
   * accepted unchecked (tests); wired in the composition root beside
   * quotaGateCleared so a typo'd scope fails loudly at spawn instead of
   * queueing a gate that can never clear (R1).
   */
  quotaGateRefValid?: (ref: string) => boolean;
  /** A task's running background jobs count as liveness (R2 + P4). */
  hasRunningJobs?: (taskId: string) => boolean;
  /**
   * A task's longest-running background job (the job registry's), for the
   * bound on jobs as proof of life (docs/report-sort.md). Absent means a
   * running job counts as moving however old it is (tests).
   */
  oldestRunningJob?: (
    taskId: string,
  ) => { jobId: string; command: string; startedAt: number } | undefined;
  /** Kills a task's background jobs when the task ends (R2). */
  killJobs?: (taskId: string) => void;
  /** What a closed task left running here, stopped at its close (docs/leftover-programs.md). */
  leftovers?: {
    begin(taskId: string, after?: Promise<unknown>): Promise<void>;
    settled(taskId: string): Promise<void>;
  };
  /**
   * Runs each part of a task's close as a named step for the freeze recorder
   * (docs/freeze-recorder.md, "A task's close"); absent, the parts only run.
   */
  step?: <T>(name: string, run: () => T) => T;
  /**
   * Put the change in where the project lives (the forge seam), injected
   * beside check_pr_ci; a merge under the captain's kept approval passes
   * its guard (FI3-304).
   */
  mergePullRequest?: (
    taskId: string,
    guard?: MergeGuard,
    boundary?: import("./changeMerge").MergeBoundary,
  ) => Promise<PrOutcome>;
  /**
   * Merge one stored review after the captain's click (FI3-1543): a
   * continuing merge, so the task stays open (INF-2490).
   */
  mergeReview?: (taskId: string, reviewId: string, guard?: MergeGuard) => Promise<PrOutcome>;
  /** Whether a stored review may be offered now. Absent in tests that publish unchecked. */
  reviewGate?: (taskId: string, reviewId: string) => Promise<string | undefined>;
  /**
   * The captain's click on a `request_write` card (FI3-1571 piece 4): send
   * the kept write once, through the gateway. Absent where nothing can be
   * sent; the click then sends nothing.
   */
  sendWriteAsk?: (
    taskId: string,
    askId: string,
    choice?: IntegrationApprovalChoice,
  ) => Promise<WriteAskSent>;
  /**
   * Run the first mate's integration ask its card's click already took from
   * the row the host filed for it (INF-1108), once, as the first mate's call.
   */
  sendTakenIntegrationAsk?: (
    rowId: string,
    taken: IntegrationAskTaken,
    choice: IntegrationApprovalChoice,
  ) => Promise<WriteAskSent>;
  /**
   * What the captain chose on a panel's approval card (docs/integrations.md,
   * "Panels"): the panel's next call hears it, never the first mate.
   */
  panelAskAnswered?: (askId: string, choice: IntegrationApprovalChoice) => void;
  /**
   * The pinned pull request by its number, for a kept approval's reconcile,
   * in the repository it pinned (`place`) when named. `mergeTask` asks the
   * host how a merge it took and had not confirmed ended (`ForgePull.mergeTaskRefused`).
   */
  readPull?: (
    taskId: string,
    prNumber: number,
    mergeTask?: string,
    place?: { host: string; owner: string; name: string },
  ) => Promise<ForgePull | undefined>;
  /** The merge card a pull request read merged outside the app can show, or why none (INF-3799). */
  mergedStory?: (taskId: string, pull: ForgePull) => MergedStory | undefined;
  removeQueuedApproval?: (
    taskId: string,
    removal: import("../storage/taskRecords").QueueApprovalRemoval,
  ) => Promise<void>;
  /** Close the change where the project lives on discard, injected beside mergePullRequest. */
  closePullRequest?: (taskId: string) => Promise<PrOutcome>;
  /**
   * A live check_pr_ci reading, injected beside mergePullRequest: the gate a
   * crewmate's own completion card must clear before a merge decision
   * reaches the captain (contract v2.0's "no captain card" clause,
   * standing CI rule). Absent means the gate is not wired (tests, replay)
   * and a crewmate's completion card publishes unchecked, as before.
   */
  checkCi?: (
    taskId: string,
  ) => Promise<PrCiOverall | { overall: PrCiOverall; recorded: boolean; problem?: string }>;
  /**
   * The crewmate's own pair where the project lives (git integration PR
   * 1.2): `open_change` offers the task's branch as a proposed change and
   * `check_change` reads its checks through the app's sign-in, recorded
   * like check_pr_ci. Absent means neither tool is offered.
   */
  prepareChange?: (
    taskId: string,
    input: import("@shared/changePresentation").StagedChangePresentation,
  ) => Promise<string>;
  openChange?: (
    taskId: string,
    input: import("@shared/changePresentation").OpenChangeInput,
  ) => Promise<string>;
  /**
   * show_merge_card's steps up to the card (INF-3717 piece 2): the story
   * prepared, pushed, proved, opened and published, or the first step
   * someone else supplies. The card itself goes up through the crewmate's
   * own card path (`CrewmateCards.showMergeCard`).
   */
  mergeCardSteps?: (
    taskId: string,
    story?: import("@shared/changePresentation").StagedChangePresentation,
  ) => Promise<import("./mergeCardSteps").MergeCardWalk>;
  /**
   * The saved story as its merge card shows it. `pictures` are the copies
   * minted for this card alone, the only files a refused card removes; the
   * body may also show the live proof the task's validation record keeps.
   */
  completionPresentation?: (
    taskId: string,
    revision: number,
  ) => Promise<
    Pick<
      DeclaredCardInput,
      "title" | "body" | "pictures" | "riskDeclaration" | "requiredActions" | "afterMerge"
    > & {
      /** The revision shown, when the host republished the named one at a later version (INF-2509). */
      revision?: number;
    }
  >;
  validateLocalStory?: (taskId: string) => Promise<string>;
  checkChange?: (taskId: string, input?: CheckChangeInput) => Promise<string>;
  readWorkflow?: (taskId: string, input: ReadWorkflowInput) => Promise<string>;
  downloadArtifact?: (taskId: string, input: DownloadArtifactInput) => Promise<string>;
  githubRead?: (taskId: string, input: GithubReadInput) => Promise<string>;
  githubWrite?: (taskId: string, input: GithubWriteInput) => Promise<string>;
  /**
   * The check watch's quiet read (`ChangeChecks.readWatched`, docs/forge.md
   * "The check watch"): the host reads a watched change's checks on the
   * shared tick, wakes the crewmate on the first failed check, and wakes it
   * again when they finish. Absent means
   * nothing is watched and a standing watch never holds the idle ladder.
   */
  readCheckWatch?: (taskId: string) => Promise<WatchedReading>;
  /**
   * The quiet refresh's comment reading (`PullComments.readTask`,
   * docs/forge.md "Comments on a pull request"): new comments on the task's
   * pull request wake its crewmate once. Absent means none are read.
   */
  readComments?: (taskId: string) => Promise<void>;
  /**
   * The default branch's checks for projects with a standing baseline wait
   * (INF-833 Fix 4, `ChangeChecks.readDefaultBranchChecks`). Absent means a
   * main failure still resumes only when the named task closes.
   */
  readMainChecks?: (repoId: string) => Promise<MainBranchReading>;
  readRunWatch?: (taskId: string, runId: number) => Promise<RunReading>;
  /**
   * The batch of the captain's approved changes a watched run checks, read
   * from the project's batch record (`runBatchFacts`, INF-4574). Absent
   * means a run watch's wakes name no batch.
   */
  readRunBatch?: (taskId: string, run: WorkflowRun) => RunBatchFacts | undefined;
  /**
   * Extra work on the shared 60s tick. Credential-health is the fourth
   * rider (quiet watchdog, R1 gates, inbox ladder, then this): proactive
   * renew at expiresAt-lead, not a new timer.
   */
  onWatchdogTick?: (now: number) => void;
  /**
   * The host's one clock (the ticker's, `ticker.ts`): every time the
   * supervisor and its ladder stamp or compare. Absent reads `Date.now()`.
   */
  now?: () => number;
  /**
   * The record of every whose-turn sort (S7c, R4.4): one `sort` row in the
   * decision ledger per sorted report or idle rung (P6), with the rule that
   * sorted it and the wake's typed facts, so `flag_missed_escalation`, the
   * miss deriver, the supervision extractor and the replay scorer keep
   * reading one ledger. Absent = no record (tests).
   */
  recordSort?: (input: {
    taskId: string;
    /** The wake as it was served. */
    wake: string;
    /** Its typed facts; absent when the row records a line, not a typed wake. */
    facts?: WakeFacts;
    verdict: "routine" | "captain";
    summary: string;
    /** The rule that sorted it. */
    rule: ReportSortRule | IdleRule;
    wakeKind: ServedWakeOrigin;
    /** The wake itself, run inside the store's own transaction. */
    effect?: () => void;
  }) => void;
  /**
   * The personal workspace's live build loop (talk-to-personalize Step 4):
   * absent means a `personal-ui` spawn is refused as unavailable.
   */
  personal?: PersonalLiveDelegate;
  /** The host's decoder for crewmates' demo recordings (`HostCapabilities.mediaProbe`). */
  probeMedia?: MediaProbe;
  /** The host's loader for crewmates' project fonts (`HostCapabilities.typefaceProbe`). */
  probeTypeface?: TypefaceProbe;
  /** The computer's declared-run owner and its advertised command capability. */
  load?: {
    forTask: (taskId: string) => import("../placed/loadLine").TaskLoad;
    available: (machine: string) => boolean;
  };
  /**
   * The task channel (docs/axi-commands.md): a task granted its browser gets
   * `infinitary-browser-axi` in its shell. Absent, no crewmate has a browser.
   */
  taskCommands?: {
    grant: (
      taskId: string,
      tools: {
        browser?: CrewmateBrowser;
        integrations?: TaskIntegrations;
        secrets?: SecretsCommand;
        load?: import("../placed/loadLine").TaskLoad;
        files?: TaskFiles;
        stops?: import("../tasks/taskStops").TaskStopsCommand;
      },
    ) => TaskShell;
  };
  /**
   * Each task's registered stops (docs/leftover-programs.md): every crewmate
   * on this Mac with a task channel gets `infinitary-stops-axi`. Absent, none does.
   */
  stops?: { forTask: (taskId: string) => import("../tasks/taskStops").TaskStopsCommand };
  /**
   * The files on the captain's other computers (docs/files.md): every
   * crewmate reads them through `infinitary-files-axi`, the home answering
   * each list and copy. Absent, no crewmate has the command.
   */
  files?: { forTask: (taskId: string) => TaskFiles };
  /**
   * Integrations (docs/integrations.md): a crewmate on this Mac reaches them
   * through `infinitary-integrations-axi` on its task channel. Absent, it has none.
   */
  integrations?: { forTask: (taskId: string) => TaskIntegrations };
  /**
   * Metadata and exact requests, never values or authority; and a task's uses
   * from a computer that runs work, decided here (docs/secrets.md, "On a
   * computer that runs work").
   */
  secrets?: {
    forTask: (taskId: string) => SecretsCommand;
    elsewhere?: (taskId: string) => SecretUsesElsewhere;
  };
  /**
   * Each task's own browser (docs/task-browser.md), on this Mac or on the
   * computer its task runs on ("On another computer"): absent, its crewmate
   * has no browser. Its fact names the browser a card's browser button
   * opens ("From a card").
   */
  browsers?: {
    forTask: (taskId: string) => CrewmateBrowser;
    fact: (taskId: string) => TaskBrowserFact | undefined;
    /** The task's browser is in the captain's hands: the idle ladder reads it as his turn. */
    withCaptain: (taskId: string) => boolean;
    /** A crewmate's card asks the captain to take over (docs/task-browser.md, "Asking for help"). */
    requestHelp: (
      taskId: string,
      request: TaskBrowserRequest & { site: string },
    ) => Promise<{ ok: true; handle: TaskBrowserHandle } | { ok: false; text: string }>;
    /** The captain's click on a request card's open-browser action. */
    takeControl: (taskId: string, handle?: TaskBrowserHandle) => Promise<TaskBrowserCommandResult>;
    /**
     * The saved sign-in a request card on this site may offer
     * (docs/task-browser.md, "Signed-in sites"); absent where none.
     */
    savedSignInFor?: (taskId: string, site: string) => OfferedSignIn | undefined;
    /**
     * The crewmate's request card says the saved sign-in its browser was
     * given did not sign the page in: that save keeps the mark. False when
     * the browser uses none for the site.
     */
    markSavedSignInFailed?: (taskId: string, site: string) => boolean;
    /**
     * A turn of the task's crewmate began or ended (docs/task-browser.md,
     * "Starting a page again"): a build the host started lives through it.
     */
    turn?: (taskId: string, running: boolean) => void;
    /** The task's browser shows a page this computer serves with no saved start for it. */
    unstarted?: (taskId: string) => boolean;
    /** The captain's click on a request card's saved sign-in. */
    grantSavedSignIn?: (
      taskId: string,
      handle: TaskBrowserHandle,
    ) => Promise<TaskBrowserCommandResult>;
  };
  broadcastEvent: (event: FmEvent) => void;
  broadcastCards: (cards: Card[]) => void;
  presentationChanged?: () => void;
  crewSpeed?: (model: { provider: string; id: string }) => import("@shared/crewSpeed").CrewSpeed;
  /** A model by the name Settings → Models gives it (`ModelSlots.nameOf`); its id when absent. */
  modelName?: (model: { provider: string; id: string }) => string;
  /** One card's thread, whole, after any message lands on it (phase 1). */
  broadcastThread?: (thread: CardThread) => void;
};

/**
 * What the supervisor needs from the personal extension host to run a task
 * on the personal workspace (Step 4): the workspace as a managed repo
 * (registered on first need), the surfaces that already exist (for the
 * brief), the stamp window (`beginLiveTask`/`endLiveTask`, so the running
 * dot follows the crewmate's saves), the commit at the end of each turn,
 * and the three checks the crewmate's tools call. Implemented by
 * `PersonalExtensions` plus the repo registry, wired in personal/homePersonal.ts.
 */
export type PersonalLiveDelegate = {
  workspaceDir: string;
  repo: () => RepoView;
  surfaces: () => PersonalBriefFacts["surfaces"];
  beginLiveTask: (taskId: string) => void;
  endLiveTask: (taskId: string) => void;
  commitTurn: (taskId: string, message: string) => Promise<LiveTurnCommit>;
  lint: (input: { id?: string }) => Promise<string>;
  place: (input: { id?: string; taskId: string }) => Promise<PanelPlaceResult>;
  capture: (input: { id: string; taskId: string }) => Promise<PanelCaptureResult>;
};
