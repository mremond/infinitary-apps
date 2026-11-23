import { join } from "node:path";
import { isCustomApiProvider } from "@shared/customApi";
import type { FmEvent } from "@shared/events";
import { catalogEntry } from "@shared/providers";
import type { CredentialHealthService } from "../accounts/credentialHealthService";
import type { openTaskChannel, startTaskBrowsers } from "../browser/homeTaskBrowsers";
import type { DecisionModels } from "../decisions/decisionModel";
import { cardReader } from "../decisions/homeDecisions";
import type { CaptainPlaces } from "../devices/captainPlaces";
import type { HomeDevices } from "../devices/homeDevices";
import type { CoreEventSink } from "../events";
import type { startHomeFiles } from "../files/homeFiles";
import type { HomeForges } from "../forge/homeForges";
import type { HostCapabilities } from "../host";
import type { HomeIntegrations } from "../integrations/homeIntegrations";
import type { IntegrationsService } from "../integrations/service";
import type { JobManager } from "../jobs/jobManager";
import type { KnowledgeService } from "../knowledge/knowledgeService";
import type { AppPaths } from "../paths";
import type { HomePersonal } from "../personal/homePersonal";
import type { cardNotifiers } from "../phonePush";
import type { AccountVault } from "../pi/accountVault";
import type { PiAuthService } from "../pi/piAuth";
import type { AutomaticPlacement } from "../placed/automaticPlacement";
import type { PlacedSessions } from "../placed/placedSessions";
import type { ProgramQuestions } from "../program/programQuestions";
import type { HomeQuota } from "../quota/homeQuota";
import type { QuotaService } from "../quota/quotaService";
import type { RecordReader } from "../recordReads/recordReader";
import type { DecisionKindClassifier } from "../routing/decisionKindClassifier";
import type { HomeRouting } from "../routing/homeRouting";
import type { ModelSlots } from "../routing/modelSlots";
import { quotaGateCleared, quotaGateRefValid } from "../routing/quotaGate";
import type { Runbooks } from "../runbooks/runbooks";
import type { SecretBrings } from "../secrets/bring";
import type { SecretsSettings } from "../secrets/settings";
import { readSelfSourceAsync } from "../selfSource/resolve";
import type { SessionBinder } from "../session/binding";
import type { HomePersonalSet } from "../session/homePersonalSet";
import { LOCAL_MACHINE_ID, type SessionFactories } from "../session/session";
import type { CardStore } from "../storage/cardStore";
import type { CostLimitStore } from "../storage/costLimitStore";
import type { DecisionStore } from "../storage/decisionStore";
import type { HomeUsage } from "../storage/homeUsage";
import type { InboxStore } from "../storage/inboxStore";
import type { SettingsStore } from "../storage/settingsStore";
import type { UsageStore } from "../storage/usageStore";
import type { LeftoverPrograms } from "../tasks/leftoverPrograms";
import type { TaskService } from "../tasks/taskService";
import { taskStopsCommand } from "../tasks/taskStops";
import type { TaskTimeline } from "../tasks/taskTimeline";
import type { ProjectContributions } from "../workspace/projectContributions";
import type { RepoRegistry } from "../workspace/repoRegistry";
import type { WorkspaceService } from "../workspace/workspaceService";
import type { ChangeDelivery } from "./changeDelivery";
import { CrewSupervisor } from "./crewSupervisor";
import type { GithubGatewayService } from "./githubGateway";
import { runBatchFacts } from "./ownBatches";
import { reviewerChooser } from "./reviewerChoice";
import type { Ticker } from "./ticker";
import type { WorkflowEvidenceService } from "./workflowEvidence";

/**
 * Home wiring for the crew (docs/architecture.md §2): the one supervisor
 * over every crewmate, with the sessions, machines, accounts, change
 * delivery, task commands and card pushes its hooks reach. The caller
 * late-binds what the crew's own presence lets it build afterwards.
 */
export function startHomeCrew({
  captainPlaces,
  decisions,
  tasks,
  automaticPlacement,
  host,
  programQuestions,
  slots,
  settings,
  homePersonalSet,
  runbooks,
  sourceLocation,
  sessionFactories,
  placed,
  takesNoWorkUntilUpdated,
  reachOf,
  homeDevices,
  crewBinder,
  vault,
  classifier,
  workspace,
  repos,
  timeline,
  cardStore,
  knowledge,
  inbox,
  router,
  auth,
  accounts,
  recordReader,
  noteCutOff,
  costLimitStore,
  recordUsage,
  usageStore,
  paths,
  ticker,
  credentialHealth,
  forgeSignIns,
  jobs,
  computerLoads,
  ledger,
  changeDelivery,
  integrations,
  githubGateway,
  panelAsks,
  workflowEvidence,
  batches,
  forgeFor,
  leftoverPrograms,
  step,
  homePersonal,
  browsers,
  taskCommands,
  leftBehind,
  loadLine,
  files,
  availableModels,
  quota,
  broadcastEvent,
  scheduleWorkPresentation,
  notifier,
  emit,
  onCardsChanged,
  later,
}: {
  captainPlaces: CaptainPlaces;
  decisions: DecisionModels;
  tasks: TaskService;
  automaticPlacement: AutomaticPlacement;
  host: HostCapabilities;
  programQuestions: Pick<ProgramQuestions, "answerJson">;
  slots: Pick<ModelSlots, "speed" | "nameOf" | "slotsOf">;
  settings: SettingsStore;
  homePersonalSet: Pick<HomePersonalSet, "current">;
  runbooks: Runbooks;
  sourceLocation: Parameters<typeof readSelfSourceAsync>[0];
  sessionFactories: SessionFactories;
  placed: PlacedSessions;
  takesNoWorkUntilUpdated: HomeDevices["takesNoWorkUntilUpdated"];
  reachOf: HomeDevices["reachOf"];
  homeDevices: Pick<HomeDevices, "recallUpdateCard" | "updatingOf">;
  crewBinder: SessionBinder;
  vault: AccountVault;
  classifier: DecisionKindClassifier;
  workspace: WorkspaceService;
  repos: RepoRegistry;
  timeline: TaskTimeline;
  cardStore: CardStore;
  knowledge: KnowledgeService;
  inbox: InboxStore;
  router: HomeRouting["router"];
  auth: Pick<PiAuthService, "accountless">;
  accounts: HomeRouting["accounts"];
  recordReader: Pick<RecordReader, "tasks">;
  noteCutOff: HomeQuota["noteCutOff"];
  costLimitStore: CostLimitStore;
  recordUsage: HomeUsage["recordUsage"];
  usageStore: Pick<UsageStore, "latestForTask">;
  paths: AppPaths;
  ticker: Pick<Ticker, "now">;
  credentialHealth: Pick<CredentialHealthService, "tick">;
  forgeSignIns: HomeForges["signIns"];
  jobs: JobManager;
  computerLoads: HomeDevices["computerLoads"];
  ledger: DecisionStore;
  changeDelivery: ChangeDelivery;
  integrations: IntegrationsService;
  githubGateway: GithubGatewayService;
  panelAsks: HomeIntegrations["panelAsks"];
  workflowEvidence: WorkflowEvidenceService;
  batches: Parameters<typeof runBatchFacts>[0]["batches"];
  forgeFor: HomeForges["forgeFor"];
  leftoverPrograms: LeftoverPrograms;
  step: <T>(name: string, run: () => T) => T;
  homePersonal: Pick<HomePersonal, "live">;
  browsers: ReturnType<typeof startTaskBrowsers>;
  taskCommands: Awaited<ReturnType<typeof openTaskChannel>>;
  leftBehind: ReturnType<LeftoverPrograms["leftBehind"]>;
  loadLine: HomeDevices["loadLine"];
  files: ReturnType<typeof startHomeFiles>;
  availableModels: HomeRouting["availableModels"];
  quota: QuotaService;
  broadcastEvent: (event: FmEvent) => void;
  /** Late-bound: the work presentation is built after the crew. */
  scheduleWorkPresentation: () => void;
  notifier: Pick<ReturnType<typeof cardNotifiers>, "observe">;
  emit: CoreEventSink;
  /** Late-bound: the first launch is built after the crew. */
  onCardsChanged: () => void;
  /** What is built after the crew, read only once a hook runs. */
  later: {
    projectContributions: () => ProjectContributions;
    secrets: () => SecretsSettings;
    secretBrings: () => SecretBrings;
  };
}): CrewSupervisor {
  const supervisor: CrewSupervisor = new CrewSupervisor({
    captainPlaces,
    readerCheck: cardReader(decisions),
    reviewerChooser: reviewerChooser(decisions, knowledge.directions),
    prepareContribution: (taskId) => later.projectContributions().prepareTask(taskId, tasks, false),
    automaticPlacement,
    // A program's script runs in a process of its own; its ask() is one typed read.
    ...(host.programProcess ? { programProcess: host.programProcess } : {}),
    answerJson: (caller, instruction, text, signal) =>
      programQuestions.answerJson(caller, instruction, text, signal),
    crewSpeed: (model) => slots.speed(model),
    modelName: (model) => slots.nameOf(model),
    personalResourcesEnabled: () => settings.getPersonalResourcesEnabled(),
    personalVersion: async () => (await homePersonalSet.current()).version,
    runbooks,
    build: host.app.version,
    source: () => readSelfSourceAsync(sourceLocation),
    sessions: sessionFactories,
    machines: placed,
    takesNoWorkUntilUpdated,
    reachOf,
    updatingOf: homeDevices.updatingOf,
    // A task began waiting for an update: its card comes back, even after Not now.
    recallUpdateCard: homeDevices.recallUpdateCard,
    bind: async (accountId, providerId) => {
      if (accountId)
        return crewBinder.bindAccount(accountId, providerId ?? vault.get(accountId)?.providerId);
      if (providerId && isCustomApiProvider(providerId))
        throw new Error(
          "This custom model needs its checked connection; it cannot use another account.",
        );
      return crewBinder.base();
    },
    classifier,
    workspace,
    repos,
    tasks,
    taskTimeline: timeline,
    cardStore,
    knowledge,
    inbox,
    router,
    ...auth.accountless(),
    accounts: {
      selectForSpawn: (taskId, provider, crew) => accounts.selectForSpawn(taskId, provider, crew),
      pickForSpawn: (taskId, provider, crew) => accounts.pickForSpawn(taskId, provider, crew),
      reselectForResume: (taskId, accountId) => accounts.reselectForResume(taskId, accountId),
      labelOf: (accountId) => accounts.labelOf(accountId),
      accessOf: (accountId) => vault.accessSync(accountId),
      servingState: () => accounts.servingState(),
      serves: (accountId, model) => accounts.servesNow(accountId, model),
    },
    taskSelection: host.recordProcess ? (input) => recordReader.tasks(input) : undefined,
    // Whoever observes a typed cut-off records it on the account.
    noteCutOff,
    // Crew delivery reads that fact: a lane is held while a cut-off stands
    // on its account, and the Firstmate hears the cut-off and its end.
    serveability: {
      cutOff: (accountId) => vault.cutOff(accountId),
      providerName: (accountId) => {
        const providerId = vault.get(accountId)?.providerId;
        return (providerId && catalogEntry(providerId)?.name) || providerId || "the provider";
      },
    },
    costLimits: {
      store: costLimitStore,
      appLimit: () => settings.getTaskCostLimit(),
    },
    recordUsage,
    latestUsage: (taskId) => usageStore.latestForTask(taskId),
    paths,
    now: ticker.now,
    onWatchdogTick: (now) => {
      void credentialHealth.tick(now);
      // The sign-ins where projects live, on the same tick (PR 1.2).
      void forgeSignIns.checkHealth();
    },
    hasRunningJobs: (taskId) =>
      jobs.hasRunningJobs(taskId) ||
      computerLoads.hasTask(taskId, tasks.get(taskId)?.deviceId ?? null),
    oldestRunningJob: (taskId) => jobs.oldestRunningJob(taskId),
    // Every whose-turn sort is one `sort` row in the decision ledger, with
    // its rule and the wake's typed facts (S7c, R4.4; P6). The wake rides
    // the store's transaction, so a decision and its effect still commit
    // together - the promise the store was built on.
    recordSort: ({ taskId, wake, facts, verdict, summary, rule, wakeKind, effect }) => {
      ledger.transaction(() => {
        ledger.recordSort({ taskId, wake, facts, verdict, summary, rule, wakeKind });
        effect?.();
      });
    },
    ...changeDelivery.settleHooks,
    // An integration's ask runs through its binding; every other is a forge write.
    sendWriteAsk: (taskId, askId, choice) =>
      tasks.get(taskId)?.delivery?.writeAsks?.find((ask) => ask.id === askId)?.kind ===
      "integration"
        ? integrations.sendAsk(taskId, askId, choice)
        : githubGateway.sendAsk(taskId, askId),
    sendTakenIntegrationAsk: (rowId, taken, choice) => integrations.sendTaken(rowId, taken, choice),
    panelAskAnswered: (askId, choice) => panelAsks.answered(askId, choice === "deny"),
    reviewGate: (taskId, reviewId) => changeDelivery.reviews.reviewGate(taskId, reviewId),
    readPull: (taskId, prNumber, mergeTask, place) =>
      changeDelivery.merges.pullState(taskId, prNumber, mergeTask, place),
    mergedStory: (taskId, pull) => changeDelivery.merges.mergedStory(taskId, pull),
    closePullRequest: (taskId) => changeDelivery.merges.close(taskId),
    checkCi: (taskId) => changeDelivery.checks.readForOffer(taskId),
    prepareChange: (taskId, input) => changeDelivery.publication.preparePresentation(taskId, input),
    openChange: (taskId, input) => changeDelivery.publication.open(taskId, input),
    mergeCardSteps: (taskId, story) => changeDelivery.mergeCard.walk(taskId, story),
    completionPresentation: (taskId, revision) =>
      changeDelivery.publication.completionPresentation(taskId, revision),
    validateLocalStory: (taskId) => changeDelivery.publication.validateLocalStory(taskId),
    checkChange: (taskId, input) => changeDelivery.checkTool.checkForCrew(taskId, input),
    readWorkflow: (taskId, input) => workflowEvidence.read(taskId, input),
    downloadArtifact: (taskId, input) => workflowEvidence.download(taskId, input),
    githubRead: (taskId, input) => githubGateway.readForCrew(taskId, input),
    githubWrite: (taskId, input) => githubGateway.write(taskId, input),
    readCheckWatch: (taskId) => changeDelivery.checks.readWatched(taskId),
    readComments: (taskId) => changeDelivery.comments.readTask(taskId),
    readMainChecks: (repoId) => changeDelivery.checks.readDefaultBranchChecks(repoId),
    readRunWatch: (taskId, runId) => workflowEvidence.readWatched(taskId, runId),
    readRunBatch: (taskId, run) => runBatchFacts({ tasks, repos, batches, forgeFor }, taskId, run),
    killJobs: (taskId) => jobs.killForOwner(taskId),
    leftovers: leftoverPrograms,
    step,
    personal: homePersonal.live,
    ...(host.mediaProbe ? { probeMedia: host.mediaProbe } : {}),
    ...(host.typefaceProbe ? { probeTypeface: host.typefaceProbe } : {}),
    ...(browsers ? { browsers } : {}),
    ...(taskCommands
      ? {
          taskCommands,
          // Every crewmate here registers how to stop what it leaves running.
          stops: {
            forTask: (taskId: string) =>
              taskStopsCommand(join(paths.crewmatesDir, taskId), ticker.now, leftBehind),
          },
          load: {
            forTask: (taskId: string) => loadLine.forTask(taskId),
            available: (machine: string) =>
              machine === LOCAL_MACHINE_ID ||
              (placed.keepsBrowsers(machine) && computerLoads.supports(machine)),
          },
        }
      : {}),
    integrations,
    files,
    ...(host.secrets
      ? {
          secrets: {
            // A bring from another tool rides the same command, here only (docs/secrets.md).
            forTask: (taskId: string) => ({
              ...later.secrets().commandFor({ task: taskId }),
              ...later.secretBrings().commandFor(taskId),
            }),
            elsewhere: (taskId: string) => ({
              use: (computer, input) =>
                later.secrets().elsewhere({ task: taskId, computer }, input),
              take: (computer, request, call) =>
                later.secrets().take({ task: taskId, computer }, request, call),
              gone: (computer) =>
                later.secrets().elsewhereGone({ task: taskId, computer: computer.id }),
              // An ask there is the same ask as one here: the task's own, raised on this Mac's card.
              ask: (_computer, input) => later.secrets().askElsewhere(taskId, input),
            }),
          },
        }
      : {}),
    quotaGateRefValid,
    quotaGateCleared: (ref) =>
      quotaGateCleared(ref, { availableModels, slotsOf: (model) => slots.slotsOf(model), quota }),
    broadcastEvent,
    presentationChanged: () => tasks.invalidatePresentation(),
    broadcastCards: (cards) => {
      scheduleWorkPresentation();
      notifier.observe(cards);
      emit("inf:cards", cards);
      onCardsChanged();
    },
    // One card's thread, whole, after any message lands on it (cards-as-
    // threads phase 1). A thread never notifies natively and never pings:
    // the captain is looking at the card he typed under.
    broadcastThread: (thread) => {
      scheduleWorkPresentation();
      emit("inf:cards:thread", thread);
    },
  });
  return supervisor;
}
