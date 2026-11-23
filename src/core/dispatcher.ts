import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { ACTION_NAMES, ACTIONS, type ActionActor, type ActionName } from "@shared/actions";
import { APP_FOLLOW_ONLY } from "@shared/appFollow";
import { AUTOMATION_UNREADABLE, type AutomationRule } from "@shared/automation";
import { isCustomApiProvider } from "@shared/customApi";
import { HERE } from "@shared/deviceNames";
import { computerPresenceOf, deviceRunsWork } from "@shared/devices";
import { settingFrom } from "@shared/envSettings";
import { forgeOf, forgePlace } from "@shared/forge";
import {
  type CoreInvokeChannel,
  HOME_CAPABILITIES,
  type InvokeRequest,
  type InvokeResponse,
  invokeContract,
  isWorkInvokeChannel,
  PROTOCOL_VERSION,
  parseInvokeRequest,
  type WorkInvokeChannel,
} from "@shared/ipc";
import { KNOWLEDGE_OFF } from "@shared/knowledge";
import { OWN_WINDOW_WORDS } from "@shared/ownWindow";
import { panelSettingsNow } from "@shared/panelSettings";
import { type AuthPromptView, providerServesRole } from "@shared/providers";
import { releaseNoteToShow } from "@shared/releaseTracking";
import type { RemoteLoginRefusedAnswer } from "@shared/remoteLogin";
import { opensPullRequest, repoRemovalRefusal } from "@shared/repos";
import { resolveWorkComputer } from "@shared/workComputer";
import { WORK_SETUP_ONLY } from "@shared/workSetup";
import { asAView, askedFromAView } from "./askedFromAView";
import { automationNotesOf, automationRuleOf, automationRulesOf } from "./automationViews";
import { batchesView } from "./batches/view";
import { type BrowserViewer, BrowserViews } from "./browser/browserViews";
import { privateSiteChannels } from "./browser/privateSites";
import { prepareComposerTurn } from "./composerTurn";
import { CONTRACT_CHANGES } from "./connection/contractChanges";
import type { CoreServices } from "./coreServices";
import { isCaptainInput } from "./devices/captainPlaces";
import { RemoteLoginRefusedError } from "./devices/remoteLogin";
import { accountHandlers } from "./dispatcher/accountHandlers";
import { createActionTrail } from "./dispatcher/actionTrail";
import { cardMediaHandlers } from "./dispatcher/cardMedia";
import { type CoreHandlers, createCatalogDispatch } from "./dispatcher/catalogDispatch";
import { renameProject } from "./dispatcher/projectRename";
import { moveRepositories } from "./dispatcher/repositoryMove";
import type { CoreEventSink } from "./events";
import { SignInRequiredError, signInRefusal } from "./forge";
import { homeMoveHandlers } from "./homeMove/handlers";
import type { OutgoingHomeMove } from "./homeMove/outgoing";
import type { HostCapabilities } from "./host";
import { isAllowedOpenExternalUrl } from "./openExternal";
import { CardChoiceUnavailableError } from "./orchestrator/cardActions";
import type { OwnWindow } from "./ownWindow";
import { panelChange } from "./personal/panelChange";
import { readPanelGraph } from "./personal/panelGraph";
import { type PanelLibraryFile, readPanelLibrary } from "./personal/panelLibrary";
import { answerPhoneAsk, isPhoneAsk, phoneOnly } from "./phoneAsks";
import type { AuthInteractionBridge } from "./pi/piAuth";
import { releaseNotesView } from "./releaseNotes/shown";
import { secretsHandlers } from "./secrets/handlers";
import { plainSettingsChannels } from "./settingsChannels";
import { SIGN_IN_RETURN_WORDS, type SignInReturns } from "./signInReturns";
import { standbyHandlers } from "./standby/handlers";
import type { Standbys } from "./standby/wiring";
import { eventCounts } from "./storage/scheduleStore";
import { readStartAtLogin, recordStartAtLogin } from "./storage/startAtLoginRecord";
import { ProjectKeyRefusal } from "./tasks/projectKey";
import { recentFeed } from "./tasks/taskFeed";
import { taskRowChannels } from "./tasks/taskRowChannels";
import { dispatcherHomeUpdates } from "./update/homeUpdateWiring";
import { createUpdateHold } from "./update/updateHold";
import { ViewWindows } from "./viewWindows";
import { projectPageFile } from "./workspace/projectPage";

/**
 * Who asks the core: the captain or Firstmate (`ActionActor`), or a paired
 * computer that runs work, about a conversation it holds for this home
 * (src/shared/work.ts). Only the connection stamps a device, from the
 * pairing its socket proved.
 */
export type CoreActor = ActionActor | { kind: "device"; deviceId: string };

/** What a task browser command answers on a core that keeps none (an installed build). */
const NO_TASK_BROWSERS = `${HERE.This} keeps no task browsers.`;

/**
 * Remote Login refusals always carry their typed kind and lines; other failures reject.
 * `uncertain` goes only to a caller that sent a field of the same contract change
 * (`joined-ubuntu-update`), since an older view's strict reader refuses it.
 */
async function refusalAsAnswer<T>(
  run: () => Promise<T>,
  readsUncertain = false,
): Promise<T | RemoteLoginRefusedAnswer> {
  try {
    return await run();
  } catch (caught) {
    if (caught instanceof RemoteLoginRefusedError)
      return {
        refused: caught.refusal,
        lines: [...caught.lines],
        ...(readsUncertain && caught.uncertain ? { uncertain: true as const } : {}),
      };
    throw caught;
  }
}

/** The knowledge owner, where this build keeps knowledge; any other build refuses the read. */
function knowledgeOf(services: CoreServices): NonNullable<CoreServices["knowledge"]> {
  if (!services.knowledge) throw new Error(KNOWLEDGE_OFF);
  return services.knowledge;
}

/**
 * The core's inbound side (daemon study D1): one transport-agnostic entry
 * point for every `surface: "core"` channel in the contract.
 *
 * `dispatch(channel, rawArgs, actor)` takes UNVALIDATED args and zod-parses them
 * itself, so validation belongs to the protocol rather than to whichever
 * adapter happens to carry it. The desktop adapter (src/main/ipc/index.ts)
 * stamps captain; Firstmate's app tools supply its code-stamped wake and
 * named action; the connection stamps the device that asks a work request.
 * Older core clients default to captain. A work request (`reach: "work"`)
 * is answered only for a device, and a device is answered nothing else.
 */
export type CoreDispatch = <C extends CoreInvokeChannel>(
  channel: C,
  rawArgs: unknown,
  actor?: CoreActor,
  /**
   * Who asked, when pictures can go back to it: the window or the
   * connection that asks to watch a task's browser (`BrowserViews`).
   */
  viewer?: BrowserViewer,
) => Promise<InvokeResponse<C>>;

/**
 * The requests that need to know who watches: the pictures go to it alone.
 * Only a window asks them, so `infinitary-axi` reaches none (`commandReaches`).
 */
export const VIEWER_CHANNELS: ReadonlySet<CoreInvokeChannel> = new Set<CoreInvokeChannel>([
  "inf:browser:watch",
  "inf:browser:unwatch",
  "inf:browser:size",
  // This computer's window, named by its own connection: it says it is
  // open, and holds the crew's saved work while it installs an update.
  "inf:own-window:here",
  "inf:update:hold",
  // A window in a program of its own, named by its connection, says whether it is in front.
  "inf:window:front",
]);

/** A request that names the window asking it, asked by something that is not a window. */
const OWN_WINDOW_ONLY = "Only this computer's own window asks this of its first mate.";

/** Whether a window is in front, said by something that is not a window. */
// i18n-exempt: an error for a caller that is not a window, never shown
const WINDOW_ONLY = "Only a window says whether it is in front.";

export type CoreDispatcherOptions = {
  services: CoreServices;
  host: HostCapabilities;
  emit: CoreEventSink;
  /** The first mate's change recorded: its operation, its catalog line, and what it says. */
  onActionRecorded?: (id: string, action: ActionName, value: Record<string, unknown>) => void;
  /** The waiting sign-ins another computer may hand a browser's return to (`startCore`). */
  signInReturns?: SignInReturns;
  /**
   * This computer's window, for a first mate a command started: what only a
   * program in the person's session can do is asked of it (`OwnWindow`).
   * Absent for a first mate that runs in the window's own program.
   */
  ownWindow?: OwnWindow;
  /** Moving the first mate to another computer (`OutgoingHomeMove`); refused when absent. */
  homeMove?: OutgoingHomeMove;
  /** The live copies on other computers (docs/devices.md, "Keeping a copy on another computer"). */
  standbys?: Standbys;
  /** The windows the first mate asks; a test hands its own. */
  viewWindows?: ViewWindows;
};

export function createCoreDispatcher(options: CoreDispatcherOptions): CoreDispatch {
  const { services, host, emit, ownWindow } = options;
  const browserViews = new BrowserViews(() => services.browsers);
  /** The windows the first mate asks their own Settings (`./viewWindows.ts`). */
  const viewWindows =
    options.viewWindows ??
    new ViewWindows({
      liveToView: (deviceId, channel, payload, change) =>
        services.workDevices.liveToView(deviceId, channel, payload, change, true),
    });
  /** The panel library as this run read it, which its build fixed (`inf:plugins:library`). */
  let panelLibrary: Promise<PanelLibraryFile[]> | undefined;
  /**
   * Start at login is the system's own setting for the program a person
   * opens, so a first mate a command started reads and changes it through
   * this computer's window (docs/run.md, "The window opened beside it").
   * With no window open it answers what the folder last remembered, and
   * refuses a change in plain words.
   */
  const startAtLogin = async (set?: boolean): Promise<boolean> => {
    if (!ownWindow) {
      if (set !== undefined) host.presence.setStartAtLogin(set);
      return host.presence.getStartAtLogin();
    }
    if (ownWindow.open())
      return (
        await ownWindow.ask({ kind: "start-at-login", ...(set === undefined ? {} : { set }) })
      ).enabled;
    const remembered = readStartAtLogin(services.paths.userData) ?? false;
    if (set !== undefined && set !== remembered) throw new Error(OWN_WINDOW_WORDS.noWindowForLogin);
    return remembered;
  };
  // The crew's work held saved while this computer's window installs an update.
  const updateHold = createUpdateHold(
    {
      save: (saveOptions) => services.supervisor.updates.saveForUpdate(saveOptions),
      release: () => services.supervisor.updates.releaseUpdate(),
      resuming: () => services.supervisor.updates.resumingAfterUpdate(),
    },
    () => host.relaunch?.(),
  );

  /** The automation rules as last read: what an unreadable list answers with (docs/automation.md). */
  let lastRules: AutomationRule[] = [];
  /**
   * What the Scheduler says of a change to a rule this dispatcher runs: the
   * words of its trail, in place of a feed line of the Scheduler's own
   * (docs/automation.md, "Where it shows"). Only a catalog change sets it,
   * and those run one at a time (`catalogTail`).
   */
  const automation: { said: string | undefined } = { said: undefined };
  const say = (text: string) => {
    automation.said = text;
  };

  /**
   * Pending login prompts: the auth bridge parks a resolver here while the
   * client collects the user's answer.
   */
  const pendingAuthPrompts = new Map<
    string,
    { resolve: (value: string) => void; reject: (error: Error) => void }
  >();

  /** Each sign-in still running, stopped together by `inf:auth:cancel`. */
  const signInsRunning = new Set<AbortController>();
  const stoppable = async <T>(work: (bridge: AuthInteractionBridge) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    signInsRunning.add(controller);
    try {
      return await work({ ...authBridge, signal: controller.signal });
    } finally {
      signInsRunning.delete(controller);
    }
  };

  // Sign-in interactions relayed to whoever is attached; secrets never cross.
  const authBridge: AuthInteractionBridge = {
    prompt: (prompt) =>
      new Promise<string>((resolve, reject) => {
        const promptId = prompt.promptId || randomUUID();
        pendingAuthPrompts.set(promptId, { resolve, reject });
        const view: AuthPromptView = { ...prompt, promptId };
        emit("inf:auth:prompt", view);
      }),
    notify: (notice) => emit("inf:auth:notice", notice),
    openExternal: async (url) => {
      // Pi's OAuth urls are provider https endpoints (Codex is
      // auth.openai.com). Loopback http is for local callback pages.
      // A silent drop used to leave Connect stuck on Connecting...
      if (!isAllowedOpenExternalUrl(url)) {
        throw new Error("Could not open the sign-in page.");
      }
      await host.openExternal(url);
    },
  };

  const handlers: CoreHandlers = {
    "inf:app:healthcheck": () => ({
      ok: true as const,
      version: host.app.version,
      platform: host.app.platform,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: [...HOME_CAPABILITIES],
      changes: [...CONTRACT_CHANGES.names],
    }),
    "inf:converse": async (turn) => {
      // Acceptance (including thread replies) stamps first-run state inside Firstmate.
      await services.firstmate.converse(prepareComposerTurn(turn));
      return { ok: true as const };
    },
    "inf:conversation:last-turn": () => services.tasks.capture.lastTurn(),
    "inf:conversation:state": () => ({ busy: services.firstmate.isBusy() }),
    "inf:task:abort": async (taskId) => {
      await services.supervisor.sessions.abort(taskId);
      return { ok: true as const };
    },
    // The Crewmate tab's composer: the captain's own line, and his ⌃C or Stop.
    "inf:task:steer": (taskId, text, more) =>
      services.supervisor.steer.steerFromCrewmateTab(taskId, text, more),
    "inf:task:interrupt": (taskId) => services.supervisor.steer.interruptFromCrewmateTab(taskId),

    ...taskRowChannels(() => services.supervisor.hostOps, services.tasks),
    "inf:task:close-done": (taskId) => services.supervisor.hostOps.closeDoneFromRecord(taskId),

    "inf:task:delete": async (taskId) => {
      // Behaves like discard (task-system P0): the worktree goes, the
      // record closes as discarded, its session stays (D2).
      await services.supervisor.settling.settle.requestDiscard(taskId);
      return { ok: true as const };
    },

    // A started task's move to another computer (docs/helper.md, "Moving a started task").
    "inf:task:move-options": (taskId) => services.supervisor.moves.moveOptions(taskId),
    "inf:task:move": async (taskId, to, options) => {
      const done =
        to === null
          ? services.supervisor.moves.cancelComputerMove(taskId, "captain")
          : await services.supervisor.moves.requestComputerMove(
              taskId,
              to,
              "captain",
              [],
              options?.leaveBehind === true,
            );
      return done.ok
        ? { ok: true as const, text: done.text }
        : { ok: false as const, text: done.text };
    },

    "inf:repos:list": () => services.repos.list(),

    "inf:repos:setup": async (spec) => {
      try {
        const result = await services.repos.setup(spec);
        if (result.repo.kind === "personal")
          throw new Error("Your personal workspace is already managed and cannot be added here.");
        if (result.created) {
          await services.projectContributions.discover(result.repo.id).catch((error: unknown) => {
            services.broadcastEvent({
              type: "firstmate_note",
              text: `Could not read contribution settings: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
        }
        if (result.created && spec.project) services.tasks.invalidatePresentation(); // the board's project names its repositories
        return { ...result, repo: services.repos.get(result.repo.id) ?? result.repo };
      } catch (caught) {
        // A refused task key is checked before any clone, so it is never a sign-in.
        if (spec.kind === "clone" && !(caught instanceof ProjectKeyRefusal)) {
          const where = forgeOf(spec.origin, services.forges.knownHosts());
          // A host the app signs in to: github.com, or one on the person's
          // own server it knows (or knows by its name, a `.ghe.com` host).
          const name = where.host ? services.forges.nameOf(where.host) : undefined;
          if (where.host && name && !services.forges.isSignedIn(where.host))
            throw new SignInRequiredError(
              `${name} did not let this app add ${where.name ?? "this project"}. Sign in to ${name} at the top of this tab, then try again.`,
              signInRefusal({
                host: where.host,
                name,
                context: `${where.name ?? "This project"} could not be cloned. Sign in, then try again.`,
              }),
            );
        }
        throw caught;
      }
    },
    "inf:repos:removal": (repoId) => ({
      tasks: services.supervisor.facts.activeTasksOnRepo(repoId),
    }),

    "inf:repos:remove": async (repoId) => {
      const repo = services.repos.get(repoId);
      if (!repo) throw new Error("That project is not here. It may already be removed.");
      const tasks = services.supervisor.facts.activeTasksOnRepo(repo.id);
      if (tasks.length > 0) throw new Error(repoRemovalRefusal(repo.name, tasks));
      await services.projectContributions.clearPushAddress(repo.id);
      services.repos.unregister(repo.id);
      services.tasks.invalidatePresentation(); // its project may hold one fewer, or take its last one's name
      return { id: repo.id, name: repo.name };
    },
    "inf:repos:move": (repoIds, target, expected) =>
      moveRepositories(services, repoIds, target, expected),
    "inf:repos:batch-answer": (repoId, answer) => services.batches.answerOrThrow(repoId, answer),
    "inf:batches:list": () =>
      batchesView({
        repos: services.repos.list(),
        projectOf: (repoId) => services.repos.projectOf(repoId)?.id,
        place: (repo) => forgePlace(forgeOf(repo.origin)) ?? undefined,
        reading: (repoId) => services.batches.checksReading(repoId),
        task: (taskId) => {
          const task = services.tasks.get(taskId);
          return task ? { key: task.key, title: task.title } : undefined;
        },
        now: Date.now(),
      }),
    "inf:repos:configure": async (repoId, changes) => {
      if (changes.contributionDestination !== undefined) {
        const { contributionDestination, ...rest } = changes;
        const updated = await services.projectContributions.choose(
          repoId,
          contributionDestination,
          false,
        );
        if (Object.keys(rest).length === 0) return updated;
        changes = rest;
      }
      if (changes.path !== undefined && services.supervisor.facts.activeTasksOnRepo(repoId).length)
        throw new Error(
          "Finish or drop the project’s planned and working tasks before changing its folder.",
        );
      try {
        await services.repos.checkDetails(repoId, changes);
        const current = services.repos.get(repoId);
        if (
          opensPullRequest(changes.delivery ?? current?.delivery) &&
          !(changes.origin === undefined ? current?.origin : changes.origin)
        )
          throw new Error(
            "This project is kept on this computer. Approve where it lives before choosing pull requests.",
          );
        if (changes.origin !== undefined && changes.origin !== current?.origin)
          await services.projectContributions.clearPushAddress(repoId);
        // A batch keeps one commit for each change, so a project that allows
        // only squash merges is refused batched pull requests with its reason.
        const batched = changes.delivery === "queue-pr" && current?.delivery !== "queue-pr";
        if (batched && changes.origin === undefined)
          await services.batches.refuseSquashOnly(repoId);
        return services.repos.configure(repoId, changes);
      } catch (caught) {
        const text = caught instanceof Error ? caught.message : String(caught);
        services.broadcastEvent({
          type: "firstmate_note",
          text: `Could not change the project's settings - ${text}`,
        });
        throw caught;
      }
    },

    "inf:repos:offer-folder": (path) => services.projectSetups.offerFolder(path),

    // Where new projects go: refused folders throw their reason, which
    // Settings shows beside the control.
    "inf:repos:folder": () => services.repos.projectsFolder(),

    "inf:repos:folder:set": (path) => services.repos.setProjectsFolder(path),

    "inf:computers:resources": () => services.computerResourceFeed.read(),
    "inf:computers:presence": () => computerPresenceOf(services.computers.list()),

    // Devices and pairing (docs/devices.md): the link goes back to this
    // Mac's own window only; the catalog keeps making one the captain's.
    "inf:devices:list": () => services.computers.list(),
    "inf:devices:invite": (request) => services.inviteDevice(request),
    "inf:devices:remove": (deviceId, when) => services.computers.remove(deviceId, when),
    // Answered in `Computers.foldAsked`, which knows the window that asked.
    "inf:devices:fold": () => Promise.reject(new Error("Only a Mac's own window folds its entry.")),
    "inf:devices:keep": (deviceId) => services.computers.keep(deviceId),
    "inf:devices:update-later": (deviceId) => services.computers.updateLater(deviceId),
    "inf:devices:carry-on": (from, to) => services.computers.carryOn(from, to),
    "inf:devices:push": phoneOnly("inf:devices:push"),
    // This Mac's own SSH connection to a computer it added by its address
    // (docs/devices.md, "Through the home's SSH"): the captain's Try again,
    // and his Change address.
    "inf:devices:try-again": (deviceId) => ({
      tried: services.sshConnections.tryAgain(deviceId),
    }),
    // A Mac's row's Fix it (docs/devices.md, "A Mac that has not finished
    // setting up"): its window, connected now, checks its work half again.
    "inf:devices:fix-work": (deviceId) => ({ asked: services.computers.fixWork(deviceId) }),
    // The row's Update of an app behind (docs/devices.md, "Updating the app open there").
    "inf:devices:update-app": (deviceId) => ({ asked: services.computers.updateApp(deviceId) }),
    // Answered by `Computers.appFollowAsked`, which knows the app whose connection told it.
    "inf:devices:app-follow": () => {
      throw new Error(APP_FOLLOW_ONLY);
    },
    // Answered by `Computers.workSetupAsked`, which knows the Mac whose window told it.
    "inf:devices:work-setup": () => {
      throw new Error(WORK_SETUP_ONLY);
    },
    "inf:devices:change-address": (deviceId, address) =>
      refusalAsAnswer(() => services.remoteLogin.changeAddress(deviceId, address)),
    // Every build offers them on the Mac where Firstmate lives, + A phone
    // included (docs/devices.md, "Settings -> Devices").
    "inf:devices:shown": () => ({ shown: true }),
    "inf:devices:stop": (linkId) => {
      services.devices.stop(linkId);
      return { ok: true as const };
    },
    // Adding a Mac by its address, and updating Firstmate there, over the
    // captain's own SSH (docs/devices.md, "Adding a computer by its address").
    // Another Firstmate's Mac is asked about once; `leave` is the captain's yes.
    "inf:devices:add": (address, options) => services.remoteLogin.addOrAsk(address, options),
    // Join by its address from the window beside a command (docs/run.md,
    // "Joining another computer"): this first mate keeps the SSH trust, so
    // it asks there, and only the window's program hears the link.
    "inf:devices:link-at": (address, options) => services.remoteLogin.linkAt(address, options),
    "inf:devices:update": (deviceId, options) =>
      refusalAsAnswer(
        () => {
          // The captain's Match is their yes to that computer running this
          // Mac's source, asked once per computer (docs/devices.md, "Matching the home's build").
          services.computers.allowSource(deviceId);
          return services.computers.update(deviceId, options);
        },
        options?.address !== undefined || options?.packageFallback === true,
      ),
    // Macs nearby while "By its address" is open (docs/devices.md, "Macs nearby").
    "inf:devices:nearby": (watching) => services.nearbyMacs.ask(watching),
    // Devices reads where devices find this computer: a Linux home looks at
    // its firewall again first (docs/devices.md, "A home's firewall").
    "inf:devices:addresses": () => services.devices.addressesAfterLook(),
    "inf:devices:address:set": (address) => services.devices.setAddress(address),
    // Where a project's next task starts (docs/helper.md, "Runs on"): only a
    // computer that runs work on the list, or null for this Mac.
    "inf:devices:runs-on": (repoId, deviceId) => {
      try {
        const resolved =
          deviceId === null
            ? null
            : resolveWorkComputer(
                deviceId,
                services.devices.list().filter((device) => deviceRunsWork(device.kind)),
              );
        return services.repos.setRunsOn(repoId, resolved === "this-mac" ? null : resolved);
      } catch (caught) {
        // A refused change is a feed line, as a refused project setting is.
        const text = caught instanceof Error ? caught.message : String(caught);
        services.broadcastEvent({
          type: "firstmate_note",
          text: `Could not change where the project runs - ${text}`,
        });
        throw caught;
      }
    },
    // A computer that runs work signing in to its own subscriptions
    // (docs/helper.md, "Its own sign-ins"). The answer is sent there once and
    // kept nowhere here: no action line names this channel, so nothing trails it.
    "inf:devices:sign-ins": () => services.deviceSignIns.read(),
    "inf:devices:sign-in": (deviceId, providerId, type, accountId) =>
      services.deviceSignIns.start(deviceId, providerId, type, accountId),
    "inf:devices:sign-in:answer": (signInId, promptId, value) =>
      services.deviceSignIns.answer(signInId, promptId, value),
    "inf:devices:sign-in:cancel": (signInId) => services.deviceSignIns.cancel(signInId),
    "inf:devices:sign-out": (deviceId, accountId) =>
      services.deviceSignIns.signOut(deviceId, accountId),
    // Its own sign-in where projects live, for its clones and pushes: the
    // device flow runs there, and nothing is typed (docs/forge.md).
    "inf:devices:forge-sign-in": (deviceId, host) =>
      services.deviceSignIns.startForge(deviceId, host),
    "inf:devices:forge-sign-in-cli": (deviceId, host) =>
      services.deviceSignIns.forgeWithCli(deviceId, host),
    "inf:devices:forge-sign-in-key": (...a) => services.deviceSignIns.forgeWithKey(...a),
    "inf:devices:forge-sign-in-browser": (...a) => services.deviceSignIns.forgeBrowser(...a),
    "inf:devices:forge-sign-out": (deviceId, host) =>
      services.deviceSignIns.signOutForge(deviceId, host),
    // The key rides connect once and is parsed out of the answer before it returns.
    "inf:devices:custom:address": (deviceId, baseUrl) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-address", [baseUrl]),
    "inf:devices:custom:profiles": (deviceId) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-profiles", []),
    "inf:devices:custom:review": (deviceId, baseUrl, mode, pem) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-review", [baseUrl, mode, pem]),
    "inf:devices:custom:connect": (deviceId, input) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-connect", [input]),
    "inf:devices:custom:check": (deviceId, draftId, modelId) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-check", [draftId, modelId]),
    "inf:devices:custom:discover": (deviceId, draftId) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-discover", [draftId]),
    "inf:devices:custom:cancel": (deviceId, draftId) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-cancel", [draftId]),
    "inf:devices:custom:save": (deviceId, draftId, paused) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-save", [draftId, paused]),
    "inf:devices:custom:recheck": (deviceId, accountId) =>
      services.deviceSignIns.custom(deviceId, "inf:sign-ins:custom-recheck", [accountId]),

    "inf:cards:list": () => services.supervisor.cards.ended.stack(),

    // INF-2553: a captain's choice or close goes out to every view before its
    // result does, so a view settling its prediction on the next snapshot
    // never waits out the stack's coalescing window.
    "inf:cards:act": (cardId, actionId, source, value, submission) => {
      try {
        const result = services.supervisor.cardActions.act(
          cardId,
          actionId,
          source,
          value,
          submission,
        );
        services.supervisor.cards.flushBroadcast();
        return result;
      } catch (error) {
        if (!(error instanceof CardChoiceUnavailableError)) throw error;
        return { refusal: error.message };
      }
    },

    "inf:cards:minimize": (cardId, minimized) => {
      services.supervisor.cards.setMinimized(cardId, minimized);
      return { ok: true as const };
    },
    "inf:cards:show": (cardId) => {
      const { cards } = services.supervisor;
      if (cards.has(cardId)) cards.showOpenCard(cardId);
      const open = cards.shown(cardId);
      if (open) return open;
      const past = cards.past(cardId);
      if (!past) throw new Error(`No card ${cardId}. Read its id from the task record.`);
      services.broadcastEvent({ type: "past_card_shown", cardId });
      return past;
    },
    // Pointing, as show-card does (primitives/app-actions.md): the window
    // opens the record or the Settings page, and nothing is stored.
    "inf:tasks:show": (ref) => {
      const task = services.tasks.get(ref) ?? services.tasks.byKey(ref);
      if (!task) throw new Error(`No task ${ref}. Read its key from the task board or tasks.`);
      services.broadcastEvent({ type: "task_record_shown", taskId: task.id });
      return { id: task.id, key: task.key ?? "", title: task.title };
    },
    "inf:settings:show": (show) => {
      services.broadcastEvent({
        type: "settings_shown",
        section: show.section,
        ...(show.item ? { item: show.item } : {}),
      });
      return { ok: true as const };
    },
    "inf:cards:close": (cardId) => {
      services.supervisor.close(cardId);
      services.supervisor.cards.flushBroadcast();
      return { ok: true as const };
    },
    "inf:cards:note-done": (cardId, submission, value) => {
      services.supervisor.pressNote(cardId, submission, value);
      services.supervisor.cards.flushBroadcast();
      return { ok: true as const };
    },

    "inf:cards:thread": (cardId) => services.supervisor.cards.thread(cardId),
    "inf:cards:drafts": () => services.cardDrafts.read(),
    "inf:cards:draft": (cardId, change) => services.cardDrafts.change(cardId, change),

    ...cardMediaHandlers(services),

    // The captain's click on a card's page from its task's project
    // (docs/task-browser.md, "A page from the project"): only the path the
    // host wrote on the card, checked again inside the project folder as it
    // is now, and opened in the task's own browser with the captain in
    // control. The card is left as it was; the answer names the browser
    // for the view to open on.
    "inf:cards:open-page": async (cardId) => {
      const card = services.supervisor.cards.snapshot().find((shown) => shown.id === cardId);
      const page = card?.attachment;
      if (page?.kind !== "page" || page.taskId !== card?.taskId) {
        return { refusal: "This card has no page to open." };
      }
      const record = services.tasks.get(page.taskId);
      const repo = record?.repoId ? services.repos.get(record.repoId) : undefined;
      if (!repo) return { refusal: "This page's project is no longer in Settings → Projects." };
      const found = projectPageFile(repo.path, page.path);
      if ("refusal" in found) return { refusal: found.refusal };
      if (!services.browsers) return { refusal: NO_TASK_BROWSERS };
      const opened = await services.browsers.openPage(page.taskId, {
        folder: repo.path,
        path: page.path,
      });
      return opened.ok ? { browser: opened.handle } : { refusal: opened.text };
    },

    "inf:cards:file": (cardId, fileId, offset) => services.cardFiles.piece(cardId, fileId, offset),
    "inf:cards:past": (cardId) => services.supervisor.cards.past(cardId) ?? null,
    "inf:cards:show-past": (cardId) => {
      const past = services.supervisor.cards.past(cardId);
      if (!past)
        throw new Error(
          `No closed card ${cardId}. Read the card id from the task's closing resolution (tasks by key); a card still on the stage is already shown.`,
        );
      services.broadcastEvent({ type: "past_card_shown", cardId });
      return past;
    },

    // What's new (docs/release-notes.md "Reading a note again"): the notes the
    // app showed, and the one door that brings one forward as it was shown.
    "inf:release-notes:list": () =>
      releaseNotesView(services.settings.getReleaseTracking(), host.app.version),
    "inf:release-notes:show": (version) => {
      const { notes } = releaseNotesView(services.settings.getReleaseTracking(), host.app.version);
      const note = releaseNoteToShow(notes, version);
      if (!note)
        throw new Error(
          version
            ? `No release note for ${version} was shown here. Read the versions from app_state.`
            : "No release notes yet.",
        );
      const open = services.supervisor.cards.has(note.cardId);
      if (!open && !services.supervisor.cards.past(note.cardId))
        throw new Error(`The release note for ${note.version} can no longer be read.`);
      services.broadcastEvent({
        type: open ? "open_card_shown" : "past_card_shown",
        cardId: note.cardId,
      });
      return { ...note, open };
    },

    "inf:cards:seen": (cardId, offerId) => {
      services.supervisor.cards.seen(cardId, offerId);
      return { ok: true as const };
    },

    "inf:cards:seen-update": (cardId, lifecycleId, updateId) => {
      services.supervisor.cards.seenUpdate(cardId, lifecycleId, updateId);
      return { ok: true as const };
    },

    // A reply never moves its card (docs/card-threads.md); an older view's
    // fourth argument, whether the card was leaving, is read no more.
    "inf:cards:reply": (cardId, payload, submission) => {
      if (typeof payload === "string") {
        return services.supervisor.cardActions.replyToCard(cardId, payload, undefined, submission);
      }
      return services.supervisor.cardActions.replyToCard(
        cardId,
        payload.text ?? "",
        payload.images,
        submission,
        payload.answers,
        payload.files,
        payload.notes,
      );
    },

    "inf:app:first-run": () => services.firstRun.view(),
    "inf:app:first-run:crew-word": (word) => services.firstRun.noteCrewWord(word),

    "inf:voice:status": async () => ({
      modelReady:
        (!host.app.packaged && settingFrom(process.env, "VOICE_MODEL_READY") === "1") ||
        (await host.voice?.modelReady()) === true,
      firstUse: !services.settings.getFlag("voice-mic-primed"),
    }),
    "inf:voice:ensure-model": async () => {
      if (!host.voice) throw new Error("Voice download is unavailable on this host.");
      await host.voice.ensureModel((progress) => emit("inf:voice:progress", progress));
      return { ok: true as const };
    },
    "inf:presence:get": async () => ({
      startAtLogin: await startAtLogin(),
      showInDock: services.settings.getShowInDock(),
    }),
    "inf:presence:set": async (settings) => {
      const startsAtLogin = await startAtLogin(settings.startAtLogin);
      recordStartAtLogin(services.paths.userData, startsAtLogin);
      services.settings.setShowInDock(settings.showInDock);
      host.presence.setShowInDock(settings.showInDock);
      // The first mate keeps Show in Dock; a window in another program applies it to itself.
      emit("inf:presence:dock", { showInDock: settings.showInDock });
      return { startAtLogin: startsAtLogin, showInDock: services.settings.getShowInDock() };
    },

    // Answered below, where the window that answers is known.
    "inf:view:answer": () => {
      throw new Error("A window's answer is heard only from that window.");
    },
    "inf:own-window:answer": (id, answer) => {
      ownWindow?.answer(id, answer);
      return { ok: true as const };
    },
    "inf:own-window:focused": () => {
      services.quota.onWindowFocus();
      return { ok: true as const };
    },
    "inf:voice:primed": () => {
      if (
        services.settings.getDictation().enabled &&
        !services.settings.getFlag("voice-mic-primed")
      )
        services.settings.setFlag("voice-mic-primed", true);
      return { ok: true as const };
    },
    "inf:settings:keys:get": () => services.preferences.keymap(),
    "inf:settings:keys:set": (keymap) => {
      services.preferences.setKeymap(keymap);
      return { ok: true as const };
    },
    // A built-in's copy goes in the host's own temporary folder, as the window's program kept it.
    "inf:runbooks:folder": (request) =>
      request.kind === "personal"
        ? services.runbooks.personalFolder()
        : services.runbooks.view(request.id, host.temporaryDir?.() ?? tmpdir()),
    // Both name the window that asks, which only its own connection does (`answerViewer`).
    "inf:own-window:here": () => {
      throw new Error(OWN_WINDOW_ONLY);
    },
    "inf:update:hold": () => {
      throw new Error(OWN_WINDOW_ONLY);
    },
    "inf:window:front": () => {
      throw new Error(WINDOW_ONLY);
    },

    "inf:update:check": () => services.updateChecker.checkNow(),
    "inf:update:channel": (channel) => {
      if (!services.updateChecker.setChannel)
        throw new Error("This installation does not support changing its update channel here.");
      return services.updateChecker.setChannel(channel);
    },

    "inf:update:open-release": async () => {
      await services.updateChecker.openReleasePage();
      return { ok: true as const };
    },

    "inf:update:install": () => services.updateChecker.install(),
    ...dispatcherHomeUpdates(options),
    "inf:update:later": () =>
      services.updateChecker.later?.() ?? services.updateChecker.getStatus(),

    "inf:retention:purge": async () => {
      // D-13 + Q4: the purge clears every task, the Firstmate agent's rolling
      // session (its Pi files, its Claude copies and sidecars, and a retired
      // supervision transcripts dir if one remains), the persisted activity
      // feed, and the personal extensions' store and compiled cache alike
      // (the workspace's files stay, like a repo's). Where knowledge is on
      // it clears that collection too, after every crewmate that could write
      // to it has stopped; a stable build has none and leaves its folder
      // alone (docs/knowledge.md). Pending reply checks and their cases go
      // too, with the captain's words they hold (docs/decision-models.md).
      // The Claude client's own copies stay.
      const purgedTasks = await services.supervisor.purgeAllTasks();
      services.corrections?.cases.purge();
      await services.firstmate.reset();
      services.activity.clear();
      services.knowledge?.purge();
      await services.personal.purge();
      return { purgedTasks };
    },

    "inf:retention:scope": () => ({
      knowledge: services.knowledge !== undefined,
      kept: services.integrations.kept(),
    }),

    // INF-952: only the words from outside go, from every saved conversation
    // on this computer, and every other word stays (docs/task-retention.md,
    // "Words from outside").
    "inf:retention:delete-outside": () => services.savedOutsideData.deleteNow(),

    // The Knowledge browser (docs/knowledge.md, "The browser") is available
    // in every build. Isolated callers without a service refuse each read
    // here, before anything opens the collection.
    "inf:knowledge:enabled": () => ({
      enabled: services.knowledge !== undefined,
      held: services.knowledge?.held() ?? false,
    }),
    "inf:knowledge:collections": () => knowledgeOf(services).window.collections(),
    "inf:knowledge:graph": (args) => knowledgeOf(services).window.graph(args),
    "inf:knowledge:concepts": (args) => knowledgeOf(services).window.concepts(args),
    "inf:knowledge:findings": (args) => knowledgeOf(services).window.findings(args),
    "inf:knowledge:entry": (args) => knowledgeOf(services).window.entry(args),
    "inf:knowledge:directions": (args = { scope: "all" }) =>
      knowledgeOf(services).directions.page(args),
    "inf:knowledge:direction": (args) => knowledgeOf(services).directions.read(args),
    "inf:knowledge:direction:set": (change) => knowledgeOf(services).directions.change(change),
    "inf:knowledge:refs": (args) => knowledgeOf(services).window.refs(args),
    "inf:knowledge:uses": (args) => knowledgeOf(services).window.uses(args),

    // The feed is a view (task-system P3): the record's own feed-worthy
    // timeline events merged with the few task-less activity lines.
    "inf:feed:recent": () => recentFeed(services.tasks, services.activity, 200),

    "inf:crew:counts": () => services.supervisor.facts.crewCounts(),

    "inf:tasks:board": (read) => services.taskProtocol.board(read),

    "inf:tasks:detail": (taskId) => services.taskProtocol.detail(taskId),

    // The task card's Crewmate tab (docs/task-card-tabs.md, "The Crewmate tab").
    "inf:tasks:crewmate": (taskId) => services.taskProtocol.crewmate(taskId),

    "inf:tasks:crewmate:live": (taskId) =>
      services.crewLive.read(taskId, services.supervisor.facts.turnStartedAt(taskId)),

    "inf:tasks:crewmate:result": (taskId, ref) => services.taskProtocol.crewmateResult(taskId, ref),

    "inf:tasks:crewmate:picture": (taskId, ref) =>
      services.taskProtocol.crewmatePicture(taskId, ref),

    "inf:tasks:search": (query) => services.taskProtocol.search(query),
    "inf:tasks:keys": (keys) => services.taskProtocol.byKeys(keys),

    "inf:tasks:opened": (taskId) => ({ opened: services.tasks.markOpened(taskId) }),

    // Asked with nobody to show pictures to, such as the first mate's own
    // tools: there is nothing to watch for (`answerViewer` answers a viewer).
    "inf:browser:watch": () => ({ watching: false }),
    "inf:browser:unwatch": () => ({ ok: true as const }),
    "inf:browser:size": () => ({ ok: true as const }),

    // The captain's own input while they have control (docs/task-browser.md,
    // "Taking control"): refused unless he holds the browser; nothing here
    // or in the browser records it.
    "inf:browser:input": async (taskId, input) =>
      services.browsers
        ? services.browsers.captainInput(taskId, input)
        : { ok: false, text: NO_TASK_BROWSERS },

    // What the task's page names on screen, read once when the captain's Point at
    // holds its picture (docs/task-browser.md, "Pointing at a page"); nothing is recorded.
    "inf:browser:places": async (taskId) =>
      services.browsers ? services.browsers.places(taskId) : { ok: false as const },

    // The captain's own clicks in a task's browser view (docs/task-browser.md).
    "inf:browser:stop": (taskId) =>
      services.browsers?.stopByCaptain(taskId) ?? { ok: false, text: NO_TASK_BROWSERS },

    "inf:browser:reopen": async (taskId) =>
      services.browsers ? services.browsers.reopen(taskId) : { ok: false, text: NO_TASK_BROWSERS },

    "inf:browser:take": async (taskId, handle) =>
      services.browsers
        ? services.browsers.takeControl(taskId, handle)
        : { ok: false, text: NO_TASK_BROWSERS },

    "inf:browser:ask": async (taskId, handle, id, answer) =>
      services.browsers
        ? services.browsers.answerAsk(taskId, handle, id, answer)
        : { ok: false, text: NO_TASK_BROWSERS },

    // Words left in the docked request's field wait for the return's one
    // wake (docs/task-browser.md, "Asking for help"), which may come from
    // another computer after this answers; a refused return lets them go.
    "inf:browser:return": async (taskId, handle, options) => {
      if (!services.browsers) return { ok: false, text: NO_TASK_BROWSERS };
      const { words, ...rest } = options ?? {};
      const cardActions = services.supervisor.cardActions;
      cardActions.holdReturnWords(taskId, words ?? null);
      const result = await services.browsers.returnControl(taskId, handle, rest);
      if (!result.ok) cardActions.holdReturnWords(taskId, null);
      return result;
    },

    // The signed-in sites each computer keeps (docs/task-browser.md, "Signed-in sites").
    "inf:browser:sign-ins": async () =>
      services.browsers ? services.browsers.signInsView() : { available: false, signIns: [] },

    "inf:browser:sign-ins:automatic": async (site, id, automatic, deviceId) =>
      services.browsers
        ? services.browsers.allowAutomaticSignIn(site, id, automatic, deviceId)
        : { ok: false, text: NO_TASK_BROWSERS },

    "inf:browser:sign-ins:remove": async (site, deviceId) =>
      services.browsers
        ? services.browsers.removeSavedSignIn(site, deviceId)
        : { ok: false, text: NO_TASK_BROWSERS },

    "inf:browser:sign-ins:remove-all": async (deviceId) =>
      services.browsers
        ? services.browsers.removeAllSavedSignIns(deviceId)
        : { ok: false, text: NO_TASK_BROWSERS },
    ...privateSiteChannels(() => services.browsers?.privateSites, NO_TASK_BROWSERS),

    "inf:projects:list": () => services.taskProtocol.projects(),
    "inf:projects:rename": (projectId, name) => renameProject(services, projectId, name),

    "inf:quota:snapshot": () => services.quota.latest() ?? null,

    // Settings' Refresh and command search's Recheck allowance are the
    // first mate's recheck: a switched login is read first, and a seat paused
    // on a spent allowance reads its way back.
    // Each computer that runs work in reach reads its own allowance at the
    // same time; its reading arrives as its sign-ins.
    "inf:quota:refresh": async () => {
      const [snapshot] = await Promise.all([
        services.firstmate.recheckAllowance(),
        services.deviceSignIns.readAllowance(),
      ]);
      return snapshot ?? null;
    },

    // An older window opening Subscriptions; nothing is read only on that
    // press any more, so it answers the snapshot.
    "inf:quota:opened": () => services.quota.latest() ?? null,

    "inf:quota:models": () => services.quota.latestModels() ?? null,

    "inf:settings:routing:get": () => services.settings.getRoutingSettings(),

    "inf:settings:routing:set": (settings) => {
      services.settings.setRoutingSettings(settings);
      return services.settings.getRoutingSettings();
    },

    // Every preference write goes through the one writer, which pushes the
    // whole value back as `inf:shell:preferences` (talk-to-personalize Step 1).
    "inf:settings:appearance:get": () => services.settings.getAppearance(),

    "inf:settings:appearance:set": (appearance) => services.preferences.setAppearance(appearance),

    // What a panel reads of each named setting (`settings.current`): the
    // line's own current answer, cut to its panel value (src/shared/panelSettings.ts).
    "inf:settings:current": (names) =>
      panelSettingsNow(names, async (name) => {
        // The saved limit alone: the line's own answer also walks recent usage.
        if (name === "cost-limit") return { limit: services.settings.getTaskCostLimit() };
        const current = ACTIONS[name].current;
        if (!current) throw new Error(`${name} holds no setting to read.`);
        return (handlers as unknown as Record<string, () => unknown>)[current]?.();
      }),

    "inf:settings:layout:get": () => services.settings.getLayout(),

    "inf:settings:layout:set": (layout) => services.preferences.setLayout(layout),

    // The host-owned switch (Step 5): the window's control is the only
    // caller, so the reason is always the captain's own.
    "inf:settings:panels:set": (enabled) =>
      services.preferences.setPersonalPanels(enabled, "captain"),

    "inf:shell:preferences": () => services.preferences.get(),

    // The two switches (roadmap 1.4): every write goes through the one
    // writer, which pushes the whole view back as `inf:sharing`.
    "inf:settings:sharing:get": () => services.sharing.get(),

    "inf:settings:sharing:set": (channel, enabled) => services.sharing.setSwitch(channel, enabled),

    "inf:settings:sharing:viewed": (channel) => services.sharing.markViewed(channel),

    "inf:settings:sharing:preview": () => services.sharing.preview(),

    "inf:settings:sharing:ask": (answer) => services.sharing.answerAsk(answer),

    "inf:settings:sharing:phone": phoneOnly("inf:settings:sharing:phone"),

    "inf:settings:dictation:get": () => services.settings.getDictation(),
    "inf:settings:dictation:set": (setting) => {
      services.settings.setDictation(setting);
      emit("inf:settings:dictation", services.settings.getDictation());
      return services.settings.getDictation();
    },
    ...plainSettingsChannels(services),
    "inf:settings:notifications:get": () => services.settings.getNotificationsEnabled(),

    "inf:settings:notifications:set": (enabled) => {
      services.settings.setNotificationsEnabled(enabled);
      services.notificationsSwitched?.();
      return services.settings.getNotificationsEnabled();
    },

    "inf:settings:firstmate-model:get": () => services.settings.getFirstmateModel(),

    "inf:settings:firstmate-model:set": async (model) => {
      // The same gate the account setter reads: a model the Firstmate
      // cannot run on - a provider without the role, or one whose every
      // account is out of the seat's reach - is refused with the reason,
      // never pinned for the next attach to fail on.
      if (
        model !== null &&
        !(isCustomApiProvider(model.provider)
          ? services.vault
              .list(model.provider)
              .some(
                (account) => account.enabled && services.vault.customChecked(account.id, model.id),
              )
          : services.flagship.servesFirstmate(model.provider))
      ) {
        const account = services.vault.list(model.provider)[0];
        const name = services.flagship.providerNameOf(model.provider);
        throw new Error(
          account
            ? (services.flagship.ineligibilityReason(account.id) ??
                `${name} cannot run your first mate.`)
            : providerServesRole(model.provider, "firstmate")
              ? `${name} is not connected.`
              : `${name} cannot run your first mate.`,
        );
      }
      // Choosing a checked custom model is the explicit seat placement. Its
      // generated provider belongs to exactly one account, never a fallback.
      if (model && isCustomApiProvider(model.provider)) {
        const account = services.vault.list(model.provider)[0];
        if (account) services.settings.setFirstmateAccount(account.id);
      }
      await services.firstmate.applyModelSetting(model);
      services.firstRun.reconcile();
      emit("inf:models:changed", { ok: true });
      return services.settings.getFirstmateModel();
    },

    "inf:settings:local-orchestrator:get": () => services.localOrchestrator.view(),

    "inf:settings:local-orchestrator:set": async (setting) => {
      const view = await services.localOrchestrator.set(setting);
      // The seat is a model that can answer, so the first-run gate follows it.
      services.firstRun.reconcile();
      return view;
    },

    // What a picker may offer: the listed pool (docs/model-lists.md) plus the
    // user's own models.json providers. Everything else served stays
    // reachable by name through the slot view's `byName`.
    "inf:models:available": () => services.slots.listedOf(services.availableModels()),

    "inf:models:slots": () => services.slots.view(),

    "inf:models:slots:set": (key, slot, on) => {
      const separator = key.indexOf("/");
      const provider = key.slice(0, separator);
      const modelId = key.slice(separator + 1);
      const checkedThere = services.deviceSignIns
        .view()
        .some((device) =>
          (device.signIns?.custom ?? []).some(
            (view) =>
              view.enabled &&
              device.signIns?.accounts.some(
                (account) => account.id === view.accountId && account.providerId === provider,
              ) &&
              view.models.some((model) => model.id === modelId && model.checked),
          ),
        );
      if (
        on &&
        isCustomApiProvider(provider) &&
        !checkedThere &&
        !services.vault
          .list(provider)
          .some((account) => account.enabled && services.vault.customChecked(account.id, modelId))
      )
        throw new Error("Check and enable this custom model before assigning it to crew.");
      services.slots.setSlotMembership(key, slot, on);
      emit("inf:models:changed", { ok: true });
      return services.slots.view();
    },

    "inf:models:speed:set": (key, speed) => {
      services.slots.setSpeed(key, speed);
      emit("inf:models:changed", { ok: true });
      return services.slots.view();
    },

    "inf:models:reasoning:set": (key, slot, level) => {
      services.slots.setReasoning(key, slot, level);
      emit("inf:models:changed", { ok: true });
      return services.slots.view();
    },

    "inf:models:slots:reset": (...args) => {
      services.slots.reset(args[0]);
      emit("inf:models:changed", { ok: true });
      return services.slots.view();
    },

    // Decision models (S7b). The row and the key are separate calls on
    // purpose: nothing here ever returns a key.
    "inf:settings:decisions": () => services.decisions.view(),

    "inf:settings:decisions:set": (decisions) => services.decisions.setSettings(decisions),

    "inf:decisions:key:set": (id, key) => services.decisions.setKey(id, key),

    "inf:decisions:key:remove": (id) => services.decisions.removeKey(id),

    "inf:decisions:use:set": (request) => {
      const view = services.decisions.setUse(request);
      services.eventScreenOffer?.turnedOn();
      return view;
    },

    "inf:auth:providers": () => services.providerViews(),

    "inf:accounts:custom:review": (baseUrl, mode, pem) =>
      services.vault.customReview(baseUrl, mode, pem),
    "inf:accounts:custom:address": (baseUrl) => services.vault.customAddress(baseUrl),
    "inf:accounts:custom:connect": (input) => services.vault.customConnect(input),
    "inf:accounts:custom:prepare": (input) => services.vault.customPrepare(input),
    "inf:accounts:custom:check": (draftId, modelId) => services.vault.customCheck(draftId, modelId),
    "inf:accounts:custom:discover": (draftId) => services.vault.customDiscover(draftId),
    "inf:accounts:custom:cancel": (draftId) => {
      services.vault.customCancel(draftId);
      return { ok: true as const };
    },
    "inf:accounts:custom:save": async (draftId, paused) => {
      const replacement = services.vault.customReplacement(draftId);
      if (
        replacement &&
        (services.supervisor.sessions.accountHasActiveTurns(replacement) ||
          ((services.firstmate.boundAccount() ?? services.settings.getFirstmateAccount()) ===
            replacement &&
            services.firstmate.isBusy()))
      )
        throw new Error(
          "Matching work is still running. Apply this checked replacement once it is idle.",
        );
      const record = await services.vault.customSave(draftId, paused);
      services.slots.reconcile();
      services.firstRun.reconcile();
      const view = services.vault.customViews().find((entry) => entry.accountId === record.id);
      if (!view) throw new Error("This connection could not be saved.");
      emit("inf:models:changed", { ok: true });
      return view;
    },
    "inf:accounts:custom:recheck": async (accountId) => {
      const view = await services.vault.customRecheck(accountId);
      services.slots.reconcile();
      services.firstRun.reconcile();
      emit("inf:models:changed", { ok: true });
      return view;
    },
    "inf:accounts:custom:profiles": () => services.vault.customProfiles(),
    "inf:accounts:custom:list": () => services.vault.customViews(),

    "inf:accounts:list": () => services.vault.views(),

    "inf:accounts:add": async (providerId, type, options) => {
      const record = await stoppable((bridge) =>
        services.vault.add(providerId, type, bridge, options ?? {}),
      );
      const views = await services.vault.views();
      const added = views.find((view) => view.id === record.id);
      if (!added) throw new Error("The account was not registered.");
      services.slots.reconcile();
      // Its own catalog, in the background: nothing waits on it.
      void services.servedModels.refresh(record.id);
      // The gate may just have closed: the first time, that is the welcome.
      services.firstRun.reconcile();
      return added;
    },

    "inf:accounts:sign-in": async (accountId) => {
      await stoppable((bridge) => services.vault.signIn(accountId, bridge));
      void services.servedModels.refresh(accountId);
      const view = (await services.vault.views()).find((entry) => entry.id === accountId);
      if (!view) throw new Error("The account is no longer registered.");
      services.firstRun.reconcile();
      return view;
    },

    // One saved Codex reset (docs/codex-client.md): with `signIn`, Codex may
    // sign in through the same prompts and links a sign-in uses.
    "inf:accounts:use-saved-reset": (accountId, options) => {
      const where = options?.deviceId ? { deviceId: options.deviceId } : {};
      return options?.signIn
        ? stoppable((bridge) => services.redeemSavedReset(accountId, { ...where, bridge }))
        : services.redeemSavedReset(accountId, where);
    },

    // Use saved resets on their own (docs/quota.md): turning it on with
    // `signIn` lets Codex sign in first through the prompts a sign-in uses.
    "inf:accounts:use-saved-resets": async (accountId, on, options) => {
      const where = options?.deviceId ? { deviceId: options.deviceId } : {};
      if (on && options?.signIn)
        await stoppable((bridge) =>
          services.setUseSavedResets(accountId, on, { ...where, bridge }),
        );
      else await services.setUseSavedResets(accountId, on, where);
      return { ok: true as const };
    },

    ...accountHandlers(services, emit),

    // The sign-ins where projects live (git integration PR 1.2): the
    // service pushes the whole view as `inf:forges` after every change.
    "inf:forges:projects": (host) => services.forgeProjects(host),
    "inf:forges:projects-listed": (host) => services.forgeProjectsListed(host),

    "inf:forges:list": () => services.forges.view(),

    "inf:forges:sign-in": (host) => services.forges.signIn(host),

    "inf:forges:sign-in-browser": (input) => services.forges.signInWithBrowser(input),
    "inf:forges:sign-in-key": (input) => services.forges.signInWithKey(input),
    "inf:forges:sign-in-cli": (address) => services.forges.signInWithCli(address),

    "inf:forges:cancel": () => {
      services.forges.cancel();
      return services.forges.view();
    },

    "inf:forges:changes": () => services.forgeChanges(),

    "inf:forges:sign-out": async (host, deviceId) => {
      // A computer that runs work's own sign-in there, for its clones and pushes.
      if (deviceId) await services.deviceSignIns.signOutForge(deviceId, host);
      else services.forges.signOut(host);
      return services.forges.view();
    },

    ...secretsHandlers(services),
    ...homeMoveHandlers(options.homeMove),
    ...standbyHandlers(options.standbys),
    // Integrations (docs/integrations.md): Settings and app_change alike.
    "inf:integrations:list": () => services.integrations.view(),
    "inf:integrations:add": (server) => services.integrations.add("mcp", server),
    "inf:integrations:sign-in": async (kind, consent) => {
      const signedIn = await services.integrations.signIn(kind, consent);
      // Adding the inbox turns its rule on with it (docs/integrations.md, "The inbox").
      if (kind === "inbox") services.integrationInbox.added(say);
      return signedIn;
    },
    // What a browser on the computer the person is at brought back to a
    // sign-in waiting here (docs/view.md, "A sign-in that returns to the
    // first mate's computer").
    "inf:integrations:sign-in-return": ({ id, address }) => {
      if (!options.signInReturns) throw new Error(SIGN_IN_RETURN_WORDS.gone);
      return options.signInReturns.deliver(id, address);
    },
    "inf:integrations:sign-in-cancel": () => {
      services.integrations.cancelSignIn();
      return services.integrations.view();
    },
    "inf:integrations:inbox-link": () => {
      services.integrationInbox.link();
      return services.integrations.changed();
    },
    "inf:integrations:configure": (id, patch) => services.integrations.configure(id, patch),
    "inf:integrations:rule": (id, action, allowed) =>
      services.integrations.setRule(id, action, allowed),
    "inf:integrations:remove": (id) => services.integrations.remove(id),
    "inf:integrations:check": (id) => services.integrations.check(id),
    "inf:integrations:secret": (id, slot, value) =>
      services.integrations.setSecret(id, slot, value),

    "inf:settings:firstmate-account:get": () => services.settings.getFirstmateAccount(),

    "inf:settings:firstmate-account:set": async (accountId) => {
      // Eligibility is enforced here too, not only at derivation: an
      // explicit pin is the one path a caller could otherwise use to bind
      // the orchestrator to an account its seat cannot stand on.
      if (accountId !== null && !services.flagship.isEligible(accountId)) {
        throw new Error(
          services.flagship.ineligibilityReason(accountId) ??
            "That account cannot run your first mate.",
        );
      }
      // The seat stands on an account of its model's provider; any other
      // would be replaced at the next bind, so it is refused in words that
      // point at the model instead.
      const model = services.settings.getFirstmateModel();
      const provider = accountId === null ? undefined : services.flagship.providerOf(accountId);
      if (
        accountId !== null &&
        model &&
        providerServesRole(model.provider, "firstmate") &&
        provider !== model.provider
      ) {
        const name = services.flagship.providerNameOf(provider ?? "");
        throw new Error(
          `${services.flagship.labelOf(accountId) ?? "That account"} is a ${name} account, and your first mate answers with ${services.flagship.providerNameOf(model.provider)}. Choose a ${name} model for your first mate first.`,
        );
      }
      services.settings.setFirstmateAccount(accountId);
      // An explicit pin is a policy rebind: applied now if idle, else at the
      // next idle boundary.
      await services.firstmate.applyAccountSetting();
      // An open Intelligence tab shows the pick, whoever made it.
      emit("inf:models:changed", { ok: true });
      return services.settings.getFirstmateAccount();
    },

    "inf:auth:prompt-reply": (promptId, value) => {
      const pending = pendingAuthPrompts.get(promptId);
      if (pending) {
        pendingAuthPrompts.delete(promptId);
        if (value === null) {
          pending.reject(new Error("Sign in cancelled"));
        } else {
          pending.resolve(value);
        }
      }
      return { ok: true as const };
    },

    "inf:auth:cancel": () => {
      for (const controller of signInsRunning) controller.abort();
      for (const [promptId, pending] of pendingAuthPrompts) {
        pendingAuthPrompts.delete(promptId);
        pending.reject(new Error("Sign in cancelled"));
      }
      return { ok: true as const };
    },

    "inf:observe:enabled": () => ({ enabled: services.observe.enabled }),

    "inf:observe:sessions": () => services.observe.list(),

    "inf:observe:detail": (sessionId) => services.observe.detail(sessionId),

    "inf:observe:live": (sessionId) => services.observe.live(sessionId),

    "inf:automation:list": () => {
      try {
        lastRules = automationRulesOf(services);
        return { state: "ready" as const, rules: lastRules };
      } catch {
        // Unreadable is never empty: the rules last read stay, marked so.
        return { state: "unavailable" as const, reason: AUTOMATION_UNREADABLE, rules: lastRules };
      }
    },
    "inf:automation:history": (id) => {
      // What a delivery led to, as it is now: a task by its key, a card by
      // its title, and whether that card is still up.
      const shown = new Map(services.supervisor.cards.snapshot().map((card) => [card.id, card]));
      return services.scheduler.history(id).map((run) => ({
        id: run.id,
        revision: run.revision,
        plannedAt: run.plannedAt,
        firedAt: run.firedAt,
        catchUp: run.catchUp,
        missed: run.missed,
        ...eventCounts(run.events),
        prompt: run.prompt,
        // A screened run reads as never sent, with no reason; `screened` says why.
        delivery: run.state === "screened" ? "cancelled" : run.state,
        settledAt: run.settledAt,
        ...(run.cancelReason ? { cancelReason: run.cancelReason } : {}),
        tasks: run.tasks.flatMap((taskId) => {
          const task = services.tasks.get(taskId);
          return task ? [{ id: task.id, key: task.key, title: task.title }] : [];
        }),
        cards: run.cards.flatMap((cardId): { id: string; title: string; open: boolean }[] => {
          const open = shown.get(cardId);
          if (open) return [{ id: cardId, title: open.title, open: true }];
          const past = services.supervisor.cards.past(cardId);
          return past ? [{ id: cardId, title: past.title, open: false }] : [];
        }),
        ...(run.found ? { found: run.found } : {}),
      }));
    },
    "inf:automation:preview": (spec) => ({ dates: services.scheduler.preview(spec) }),
    // A new rule is a draft until the review's Turn on (`enable`).
    // A linked rule taking its place in an event again answers once its
    // first look did, as it stands then (docs/automation.md, "A rule that
    // ends a hold"); every other save answers at once.
    "inf:automation:save": async (rule) => {
      const record = rule.id
        ? services.scheduler.update(
            rule.id,
            {
              name: rule.name,
              spec: rule.spec,
              prompt: rule.prompt,
              projectId: rule.projectId ?? null,
              ...(rule.reconnect === true ? { reconnect: true } : {}),
            },
            { enable: rule.enable === true, say },
          )
        : services.scheduler.create(rule.spec, rule.prompt, true, rule.name, rule.projectId, {
            draft: rule.enable !== true,
            say,
          });
      return automationRuleOf(services, await services.scheduler.armed(record));
    },
    "inf:automation:state": async (id, change) =>
      automationRuleOf(
        services,
        change === "pause"
          ? services.scheduler.pause(id, { say })
          : await services.scheduler.armed(services.scheduler.resume(id, { say })),
      ),
    "inf:automation:notes": (id, versions) =>
      (versions === "all"
        ? services.scheduler.notesHistory(id)
        : [services.scheduler.notes(id)].filter((notes) => notes !== undefined)
      ).map((notes) => automationNotesOf(services, notes)),
    // The captain's own edit or clear; a notes save makes no new revision.
    "inf:automation:notes-save": (id, text) => {
      const saved = services.scheduler.saveNotes(id, text, { by: "captain" }, { say });
      return saved ? automationNotesOf(services, saved) : null;
    },
    "inf:automation:pause-all": () => ({ paused: services.scheduler.pauseAll({ say }) }),
    "inf:automation:delete": (id) => {
      services.scheduler.cancel(id, { say });
      return { id };
    },
    "inf:automation:kept": () => services.keptRunning.list(),
    "inf:automation:kept-check": (id) => services.keptRunning.check(id),
    "inf:automation:kept-remove": (id) => services.keptRunning.remove(id, { say }),
    // Its own feed line: after Forget it is the one place still naming a job that may run.
    "inf:automation:kept-forget": (id) =>
      services.keptRunning.forget(id, {
        say: (text) => services.broadcastEvent({ type: "personalized", actor: "captain", text }),
      }),
    "inf:usage:summary": (query) => services.usage.summary(query),
    "inf:usage:tasks": (query) => services.usage.tasks(query),

    "inf:plugins:fetch": (call) => services.pluginFetch(call),
    "inf:sql:query": (request) => services.sql.query(request),
    // Personal extensions (talk-to-personalize Step 2).
    // A panel being built shows only in a window on this computer
    // (docs/view.md, "Panels in every window").
    "inf:plugins:personal:list": () => {
      const snapshot = services.personal.snapshot();
      return askedFromAView() ? { extensions: snapshot.extensions } : snapshot;
    },
    "inf:plugins:files": async (request) => {
      if (request.draft && askedFromAView()) return null;
      const dir = services.personal.framePanelDir(
        request.source,
        request.id,
        request.version,
        request.draft ? { draft: true } : {},
      );
      if (!dir) return null;
      const files = await readPanelGraph(dir);
      return {
        builtFor: host.app.version,
        files: [...files].map(([path, bytes]) => ({
          path,
          data: Buffer.from(bytes).toString("base64"),
        })),
      };
    },
    // The library a panel's files import, for a phone (docs/view.md, "Panels
    // on the phone"): only at this computer's version, read once a run.
    "inf:plugins:library": async ({ version }) => {
      const lib = host.frameLib;
      if (!lib || version !== host.app.version) return null;
      panelLibrary ??= readPanelLibrary(lib).catch((error: unknown) => {
        panelLibrary = undefined;
        throw error;
      });
      return { version, files: await panelLibrary };
    },
    // The placement a crewmate waits on is this computer's window's: a
    // window on another computer places its panels its own way.
    "inf:plugins:personal:mounts": (mounts) => {
      if (!askedFromAView()) services.panelMounts.note(mounts);
      return { ok: true };
    },
    "inf:plugins:invoke": (extensionId, action, input, options) =>
      services.personal.invoke(extensionId, action, input, options),
    "inf:plugins:db": (request) => services.personal.storeRequest(request),
    "inf:plugins:retry": (extensionId, options) => services.personal.retry(extensionId, options),
    "inf:plugins:update": (extensionId) => services.personal.askUpdate(extensionId),
    "inf:plugins:integrations": (extensionId, request, options) =>
      services.personal.integrationsRequest(extensionId, request, options),
    "inf:plugins:ask-again": (extensionId, integration, action) =>
      services.personal.askAgain(extensionId, integration, action),
    // A panel's change of a setting it was granted, run as the captain (`personal/panelChange.ts`).
    "inf:plugins:settings:change": (extensionId, action, value) =>
      panelChange(
        outer,
        (id, name) => services.personal.changeGrant(id, name),
        extensionId,
        action,
        value,
      ),
  };

  const { runOf, trail } = createActionTrail(services, options);

  // Each request's guard, before and after reads and trail line (`dispatcher/catalogDispatch.ts`).
  const dispatch = createCatalogDispatch({
    services,
    handlers,
    runOf,
    trail,
    automation,
    viewWindows,
  });

  // A rapid succession of Settings writes is one ordered trail. Without
  // this seam, awaited snapshots can attribute the next write to both calls.
  let catalogTail = Promise.resolve();
  // A large model download must not hold unrelated Settings writes behind it.
  // Its own queue still takes the readiness snapshot after the previous download.
  let voiceTail = Promise.resolve();
  let setupTail = Promise.resolve();
  /** Each window's own changes, in order (`route`). */
  const windowTails = new Map<string, Promise<void>>();
  // A work request is a device's own, about the conversation it holds; it
  // never touches the action catalog.
  const answerWork = async <C extends WorkInvokeChannel>(
    channel: C,
    rawArgs: unknown,
    actor: CoreActor | undefined,
  ): Promise<InvokeResponse<C>> => {
    if (actor?.kind !== "device")
      throw new Error(`${channel} is asked only by a computer that runs work.`);
    const [request] = parseInvokeRequest(channel, rawArgs);
    // What a computer says of its own sign-ins is not about a task it holds.
    if (channel === "inf:work:sign-in")
      return services.deviceSignIns.step(
        actor.deviceId,
        request as InvokeRequest<"inf:work:sign-in">[0],
      ) as InvokeResponse<C>;
    if (channel === "inf:work:sign-ins")
      return services.deviceSignIns.changed(
        actor.deviceId,
        request as InvokeRequest<"inf:work:sign-ins">[0],
      ) as InvokeResponse<C>;
    return services.placed.answer(actor.deviceId, channel, request);
  };

  // A view's watch of a task's browser (docs/task-browser.md, "The view"):
  // the captain's alone, wherever they sit, and its pictures go back to the
  // window or connection that asked.
  const answerViewer = async (
    channel: CoreInvokeChannel,
    rawArgs: unknown,
    viewer: BrowserViewer,
  ): Promise<unknown> => {
    if (channel === "inf:browser:watch") {
      const [taskId] = parseInvokeRequest("inf:browser:watch", rawArgs);
      return browserViews.watch(viewer, taskId);
    }
    if (channel === "inf:browser:unwatch") {
      const [taskId] = parseInvokeRequest("inf:browser:unwatch", rawArgs);
      browserViews.unwatch(viewer, taskId);
      return { ok: true };
    }
    if (channel === "inf:own-window:here") {
      parseInvokeRequest("inf:own-window:here", rawArgs);
      if (ownWindow) {
        ownWindow.here(viewer);
        // What the system starts at login, remembered in the folder as the
        // window reads it, each time it opens (storage/startAtLoginRecord.ts).
        void startAtLogin().then(
          (enabled) => recordStartAtLogin(services.paths.userData, enabled),
          () => {},
        );
      }
      return { ok: true };
    }
    if (channel === "inf:update:hold") {
      const [step] = parseInvokeRequest("inf:update:hold", rawArgs);
      return updateHold(step, viewer);
    }
    if (channel === "inf:window:front") {
      const [inFront] = parseInvokeRequest("inf:window:front", rawArgs);
      services.windowsInFront.report(viewer, inFront);
      return { ok: true };
    }
    const [taskId, size] = parseInvokeRequest("inf:browser:size", rawArgs);
    browserViews.size(viewer, taskId, size);
    return { ok: true };
  };

  const outer = (<C extends CoreInvokeChannel>(
    channel: C,
    rawArgs: unknown,
    actor?: CoreActor,
    viewer?: BrowserViewer,
  ): Promise<InvokeResponse<C>> => {
    if (isWorkInvokeChannel(channel)) return answerWork(channel, rawArgs, actor);
    if (viewer && VIEWER_CHANNELS.has(channel) && (actor ?? { kind: "captain" }).kind === "captain")
      return answerViewer(channel, rawArgs, viewer) as Promise<InvokeResponse<C>>;
    // A paired phone's own word, handed only by that phone (`./phoneAsks.ts`).
    if (isPhoneAsk(channel))
      return answerPhoneAsk(services, channel, rawArgs, actor) as Promise<InvokeResponse<C>>;
    if (channel === "inf:devices:fold")
      return services.computers.foldAsked(rawArgs, actor) as Promise<InvokeResponse<C>>;
    if (channel === "inf:devices:app-follow")
      return services.computers.appFollowAsked(rawArgs, actor) as Promise<InvokeResponse<C>>;
    if (channel === "inf:devices:work-setup")
      return services.computers.workSetupAsked(rawArgs, actor) as Promise<InvokeResponse<C>>;
    if (channel === "inf:view:answer") {
      const [id, answer] = parseInvokeRequest("inf:view:answer", rawArgs);
      return Promise.resolve(viewWindows.answered(id, answer, actor) as InvokeResponse<C>);
    }
    if (actor?.kind === "device")
      return Promise.reject(
        new Error(`${channel} is not a request a computer that runs work asks.`),
      );
    const routed = () =>
      route(channel as Exclude<C, WorkInvokeChannel>, rawArgs, actor) as Promise<InvokeResponse<C>>;
    // The captain's own input names where it came from (docs/devices.md, "Where the captain is").
    const answer = isCaptainInput(channel, actor)
      ? () => services.captainPlaces.during(routed)
      : routed;
    return actor?.kind === "captain" && actor.view
      ? asAView(answer, {
          view: actor.view,
          version: actor.viewVersion,
          changes: actor.viewChanges,
        })
      : answer();
  }) as CoreDispatch;
  return outer;

  function route<C extends Exclude<CoreInvokeChannel, WorkInvokeChannel>>(
    channel: C,
    rawArgs: unknown,
    actor?: ActionActor,
  ): Promise<InvokeResponse<C>> {
    // A read an act runs (Check for updates) writes nothing, so it waits
    // behind no Settings write.
    if (
      invokeContract[channel].effect !== "change" ||
      !ACTION_NAMES.some(
        (name) =>
          ACTIONS[name].change === channel ||
          (ACTIONS[name].alwaysTrail && ACTIONS[name].channels?.includes(channel)),
      )
    )
      return dispatch(channel, rawArgs, actor);
    if (channel === "inf:repos:setup") {
      const result = setupTail.then(() => dispatch(channel, rawArgs, actor));
      setupTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }
    if (channel === "inf:voice:ensure-model") {
      const result = voiceTail.then(() => dispatch(channel, rawArgs, actor));
      voiceTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }
    // A change asked of a paired Mac's window waits on that connection, so
    // it holds only that window's other changes, never this computer's.
    const window = actor?.kind === "firstmate" ? actor.window : undefined;
    if (window) {
      const result = (windowTails.get(window.deviceId) ?? Promise.resolve()).then(() =>
        dispatch(channel, rawArgs, actor),
      );
      const settled = result.then(
        () => undefined,
        () => undefined,
      );
      windowTails.set(window.deviceId, settled);
      void settled.then(() => {
        if (windowTails.get(window.deviceId) === settled) windowTails.delete(window.deviceId);
      });
      return result;
    }
    const result = catalogTail.then(() => dispatch(channel, rawArgs, actor));
    catalogTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
