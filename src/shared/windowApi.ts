import type { AccountView } from "./accounts";
import type { ChosenFile, DroppedPath } from "./attachments";
import type {
  AutomationList,
  AutomationNotes,
  AutomationRule,
  AutomationSave,
  AutomationSpec,
} from "./automation";
import type { BatchAnswer } from "./batches";
import type { CardDraft, CardDraftChange, CardDraftChanged } from "./cardDrafts";
import type {
  CardFileSaved,
  CardFilesSaved,
  OpenCardFileResult,
  SavedCardFiles,
} from "./cardFiles";
import type { CardNote } from "./cardNotes";
import type {
  Card,
  CardActionSource,
  CardAnswer,
  CardSubmission,
  CardThread,
  DropTaskReview,
  PastCard,
  TaskLifecycleOp,
  TaskMoveFrom,
  TurnImage,
} from "./cards";
import type { Presence, WindowControl, WindowState } from "./channels/shell";
import type { AppCostLimitView, CostLimit } from "./costLimit";
import type { CrewSpeed } from "./crewSpeed";
import type { CrewPicture, CrewResultText, CrewSendResult } from "./crewTranscript";
import type {
  CustomApiAddress,
  CustomApiConnectInput,
  CustomApiConnectResult,
  CustomApiInput,
  CustomApiReview,
  CustomApiView,
  CustomCapabilityProfile,
  CustomListedModel,
  CustomNetworkMode,
} from "./customApi";
import type { DecisionModelId, DecisionsSettings, DecisionsView } from "./decisions";
import type { DecisionUseRequest } from "./decisionUses";
import type {
  DeviceAddresses,
  DeviceCarryOn,
  DeviceInvite,
  DeviceInviteRequest,
  DeviceRemoveWhen,
  DeviceView,
  JoinOutcome,
  ThisMac,
} from "./devices";
import type { DictationSettings } from "./dictation";
import type { CrewCounts, FmEvent } from "./events";
import type { FeedLine } from "./feed";
import type { CrewWord, FirstRunView } from "./firstRun";
import type {
  ForgeBrowserSignIn,
  ForgeChangesView,
  ForgeCliSignInResult,
  ForgeKeySignIn,
  ForgeKeySignInResult,
  ForgeProjectListing,
  ForgeSignInFlow,
  ForgesView,
} from "./forges";
import type { HomeMoveProgress, HomeMoveReady } from "./homeMove";
import type { HomeUpdate } from "./homeUpdate";
import type {
  IntegrationKind,
  IntegrationMcpAdd,
  IntegrationSettingsPatch,
  IntegrationSignInConsent,
  IntegrationsView,
} from "./integrations";
import type { AppInfo, InvokeResponse, RecordedKey } from "./ipc";
import type { JoinAtAnswer, JoinAtOptions, SetUpHere, SetUpReads } from "./joinByAddress";
import type { KeptJobsView, KeptJobView, KeptRemoveResult } from "./keptJobs";
import type { MainCommandId, PanelCommand, PanelCommandId, ShellCommandId } from "./keyboard";
import type { KeymapSnapshot, SavedKeymap } from "./keymap";
import type { LastTurn } from "./lastTurn";
import type { LocalOrchestratorSetting, LocalOrchestratorView } from "./localOrchestrator";
import type { ModelSlotsView, ReasoningChoice, Slot } from "./modelSlots";
import type { NearbyMacsView } from "./nearbyMacs";
import type { ObserveSessionDetail, ObserveSessionSummary } from "./observe";
import type { UpdateAsked } from "./ownWindow";
import type {
  PanelIntegrationsRequest,
  PanelIntegrationsResponse,
  PersonalInvokeOptions,
  PersonalInvokeResult,
  PersonalSnapshot,
  PersonalStoreChange,
  PersonalStoreRequest,
  PersonalStoreResponse,
} from "./personal/manifest";
import type { PanelMounts } from "./personal/mounts";
import type { MediatedFetchCall, MediatedFetchResult } from "./plugins/fetch";
import type { FrameMount, FrameMountRequest } from "./plugins/frameDocument";
import type {
  Appearance,
  Layout,
  LayoutMove,
  PersonalPanels,
  ShellPreferences,
} from "./preferences";
import type { PrivateSiteChange, PrivateSitesView } from "./privateSites";
import type { AuthNotice, AuthPromptView, ProviderView } from "./providers";
import type {
  ModelsCatalogView,
  PiModelRefView,
  QuotaSnapshotView,
  RoutingSettings,
} from "./quota";
import type { ReadArgs, ReadGrant, ReadName, ReadResult } from "./reads";
import type { ReleaseNotesView, ShownReleaseNote } from "./releaseTracking";
import type {
  PackageUpdateAddressQuestion,
  RemoteLoginAddAnswer,
  RemoteLoginAddOptions,
  RemoteLoginConfirmQuestion,
  RemoteLoginPasswordQuestion,
  RemoteLoginRefusedAnswer,
  RemoteLoginUpdateOptions,
} from "./remoteLogin";
import type {
  FolderOffer,
  ProjectsFolderView,
  RepoMoveResult,
  RepoMoveTarget,
  RepoPolicyPatch,
  RepoRemoval,
  RepoSetupResult,
  RepoSetupSpec,
  RepoView,
} from "./repos";
import type { ComputerResourcesView } from "./resources";
import type { RunbookView } from "./runbooks";
import type { KeptOutsideData, OutsideDataDeleted } from "./savedOutsideData";
import type { SavedResetResult, UseSavedResetOptions } from "./savedResets";
import type { SecretBringAnswer, SecretBringInput } from "./secretBring";
import type {
  SecretAction,
  SecretEntryInput,
  SecretKeep,
  SecretKeepInput,
  SecretRehearsal,
  SecretRehearsalInput,
  SecretsView,
} from "./secrets";
import type { SharingAskAnswer, SharingChannel, SharingPreview, SharingView } from "./sharing";
import type { DeviceSignInEvent, DeviceSignIns } from "./signIns";
import type { StandbyReady, StandbyViews } from "./standby";
import type {
  SavedSignInsView,
  TaskBrowserAskAnswer,
  TaskBrowserCommandResult,
  TaskBrowserFrame,
  TaskBrowserHandle,
  TaskBrowserInput,
  TaskBrowserPlaces,
  TaskBrowserReturn,
  TaskBrowserSize,
} from "./taskBrowser";
import type {
  MoveOptions,
  ProjectView,
  TaskBoard,
  TaskBoardDelta,
  TaskBoardRead,
  TaskDetail,
} from "./tasks";
import type { PresenceSettings, UpdateChannel, UpdateInstallResult, UpdateStatus } from "./update";
import type { MicAccess, RecognizerPlace, VoiceDownloadProgress, VoiceStatus } from "./voice";

/** The one frozen API surface the preload exposes as `window.infinitary`. */
export type FirstmateApi = {
  secrets: {
    /** Whether this build keeps protected storage; without it Settings offers no Secrets tab. */
    shown: () => Promise<{ shown: boolean }>;
    view: () => Promise<SecretsView>;
    entry: (input: SecretEntryInput) => Promise<SecretsView>;
    action: (input: SecretAction) => Promise<SecretsView>;
    rehearse: (input: SecretRehearsalInput) => Promise<SecretRehearsal>;
    /** Keep on an ask card: its one-time pass and the values typed into its masked fields. */
    keep: (input: SecretKeepInput) => Promise<SecretKeep>;
    /** Bring into Secrets on a bring card: its pass and the ticked rows, never a value. */
    bring: (input: SecretBringInput) => Promise<SecretBringAnswer>;
    exportHistory: () => Promise<{ saved: boolean }>;
    onChange: (listener: () => void) => () => void;
  };

  /**
   * Files the captain gives the composer (docs/composer.md, "Files"). Only a
   * real File object the captain dropped, or the system picker's own
   * answer, reaches the host - never a path the page writes.
   */
  files: {
    /** Where a dropped File lives on disk, and whether it is a regular file. */
    dropped: (file: File) => Promise<DroppedPath>;
    /** The system file picker; null when cancelled. */
    choose: () => Promise<ChosenFile[] | null>;
  };
  app: {
    healthcheck: () => Promise<AppInfo>;
    /** The first-launch state: the gate, the welcome, the first turn. */
    firstRun: () => Promise<FirstRunView>;
    /** A crewmate state word was shown in full; the core records it once. */
    noteCrewWord: (word: CrewWord) => Promise<FirstRunView>;
    /** Open an https (or http loopback) URL in the system browser. */
    openExternal: (url: string) => Promise<{ ok: true }>;
    /** The system's folder picker: the chosen folder, or null when cancelled. */
    chooseFolder: (startAt?: string) => Promise<string | null>;
    /**
     * Start it here, on the notice over a window whose command stopped
     * (`ThisMac.command`): the app starts again as this computer's own
     * first mate. False where nothing offers it.
     */
    startHere: () => Promise<boolean>;
    /**
     * Restart it, on the notice over a window whose command runs and does
     * not answer (`ThisMac.command`, ending `not-answering`): the command
     * is ended by force and started again. False where nothing offers it.
     */
    restartCommand: () => Promise<boolean>;
    /**
     * Stop, beside Infinitary started by a command (`ThisMac.byCommand`):
     * its first mate and crew stop until the person starts Infinitary again.
     * False where none runs beside this window.
     */
    stopCommand: () => Promise<boolean>;
    /** Quits this window's program. */
    quit: () => Promise<{ ok: true }>;
    /** One of the window's own buttons where the app draws them; answers the window's state after it. */
    controlWindow: (control: WindowControl) => Promise<WindowState>;
    windowState: () => Promise<WindowState>;
    onWindowState: (listener: (state: WindowState) => void) => () => void;
    /** Whether someone is at this computer (docs/ambient-music.md), and each change to it. */
    presence: () => Promise<Presence>;
    onPresence: (listener: (presence: Presence) => void) => () => void;
    /**
     * Resolves once every push sent to this window before it has arrived.
     * Chromium can hand the window an answer ahead of a push sent before it;
     * an answer applied after the fence is applied in push order.
     */
    fence: () => Promise<void>;
  };
  conversation: {
    /** Send one user turn to the Firstmate agent (the orchestrator). Accepts string for backward compat or {text?, images?, visibleCardId?, taskId?} for attachments, the on-screen card, and the task it points at. */
    send: (
      textOrTurn:
        | string
        | {
            text?: string;
            files?: Array<{ text: string }>;
            images?: Array<{
              mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
              data: string;
            }>;
            visibleCardId?: string;
            taskId?: string;
            pastCardId?: string;
            focusedProjectId?: string;
          },
    ) => Promise<{ ok: true }>;
    /** The captain's newest message and the Firstmate's reply line beside it, or null before the first. */
    lastTurn: () => Promise<LastTurn | null>;
  };
  task: {
    abort: (taskId: string) => Promise<{ ok: true }>;
    delete: (taskId: string) => Promise<{ ok: true }>;
    /**
     * A lifecycle toggle from the task record's footer or the task board:
     * start, stop, continue, drop, queue or unqueue.
     */
    run: (
      taskId: string,
      op: TaskLifecycleOp,
      review?: DropTaskReview,
      /** The panel whose page the captain moved it from, by its title. */
      from?: TaskMoveFrom,
    ) => Promise<{ ok: true } | { ok: false; text: string }>;
    /** The record's Close as done: close started work as done on the captain's word. */
    closeDone: (taskId: string) => Promise<{ ok: boolean; text: string }>;
    /**
     * Pin a task to the top of Tasks, or unpin it with `pinned` false
     * (INF-3127): the Tasks panel, the task board and the task record.
     */
    pin: (
      taskId: string,
      pinned: boolean,
      /** The panel whose page the captain pinned it from, by its title. */
      from?: TaskMoveFrom,
    ) => Promise<{ ok: true } | { ok: false; text: string }>;
    /** Where a started task could move: Move to a computer's choices. */
    moveOptions: (taskId: string) => Promise<MoveOptions>;
    /**
     * Move a started task to a computer, or cancel its waiting move with
     * null; `leaveBehind` moves it off a computer out of reach, leaving
     * what only that computer holds there.
     */
    move: (
      taskId: string,
      to: string | null,
      options?: { leaveBehind: true },
    ) => Promise<{ ok: true; text: string } | { ok: false; text: string }>;
    /** A line the captain typed in the Crewmate tab: his steer on the crewmate's lane. */
    steer: (
      taskId: string,
      text: string,
      /** The notes on the task's running page and their marked pictures, which leave with the line. */
      more?: { notes?: CardNote[]; images?: TurnImage[] },
    ) => Promise<CrewSendResult>;
    /** ⌃C or Stop in the Crewmate tab: his interrupt of the crewmate's running turn. */
    interrupt: (taskId: string) => Promise<CrewSendResult>;
  };
  automation: {
    list: () => Promise<AutomationList>;
    /** The next dates a schedule would run; nothing is sent or changed. */
    preview: (spec: AutomationSpec) => Promise<{ dates: number[] }>;
    /** Save a new rule (no id) or an edit; refused with a readable reason. */
    save: (rule: AutomationSave) => Promise<AutomationRule>;
    /** Pause, or resume at the next future occurrence. */
    setState: (id: string, change: "pause" | "resume") => Promise<AutomationRule>;
    /** The captain's edit or clear of a rule's notes; makes no new revision. */
    saveNotes: (id: string, text: string) => Promise<AutomationNotes | null>;
    pauseAll: () => Promise<{ paused: number }>;
    delete: (id: string) => Promise<{ id: string }>;
    /** The jobs kept running past their task's close (docs/leftover-programs.md, "Kept running"). */
    kept: () => Promise<KeptJobsView>;
    /** Runs one kept job's check on its computer and answers it with how it went. */
    checkKept: (id: string) => Promise<KeptJobView>;
    /** Runs one kept job's remove on its computer; a remove that did not finish keeps it listed. */
    removeKept: (id: string) => Promise<KeptRemoveResult>;
    /** Takes a kept job off the list without running its remove; it may still run there. */
    forgetKept: (id: string) => Promise<{ id: string }>;
  };
  repos: {
    setup: (spec: RepoSetupSpec) => Promise<RepoSetupResult>;
    /** A folder dropped on the main message box: its setup card goes up, or the project it already is. */
    offerFolder: (path: string) => Promise<FolderOffer>;
    /** The tasks still on a project; any of them blocks `remove`. */
    removal: (repoId: string) => Promise<RepoRemoval>;
    /** Takes the project off the list; its folder stays. Refused while tasks are on it. */
    remove: (repoId: string) => Promise<{ id: string; name: string }>;
    /** Moves repositories into another project, keeping their settings and their tasks' keys (docs/fleet.md). */
    move: (repoIds: string[], target: RepoMoveTarget) => Promise<RepoMoveResult>;
    /** Reflection of the managed fleet. */
    list: () => Promise<RepoView[]>;
    /** Delivery, autonomy, and standing rigor. */
    configure: (repoId: string, changes: RepoPolicyPatch) => Promise<RepoView>;
    /** Answer a held batch of the captain's own approved changes: try again, or send changes back. */
    batchAnswer: (repoId: string, answer: BatchAnswer) => Promise<{ ok: true }>;
    /** Where new projects go. */
    folder: () => Promise<ProjectsFolderView>;
    /** A folder the person chose, or null for the default; refused with a readable reason. */
    setFolder: (path: string | null) => Promise<ProjectsFolderView>;
  };
  /** The window's keys (docs/keyboard.md). */
  keyboard: {
    /**
     * A window command the page runs, heard by the main process wherever
     * focus is: the catalog's, or a panel's by its id.
     */
    onCommand: (
      listener: (heard: { command: ShellCommandId | PanelCommandId }) => void,
    ) => () => void;
    /** A movement command's key for the frame named, which the page hands to it while it holds focus. */
    onMove: (
      listener: (heard: { key: import("./keyboard").MoveKey; frame: string }) => void,
    ) => () => void;
    /** The window took a key before the page, which the dictation key counts as one pressed with it. */
    onTaken: (listener: () => void) => () => void;
    /** Runs a window command the main process owns, chosen in command search. */
    run: (command: MainCommandId) => Promise<{ ok: true }>;
    /** The keys the window has installed, and what a person changed. */
    keymap: () => Promise<KeymapSnapshot>;
    onKeymap: (listener: (snapshot: KeymapSnapshot) => void) => () => void;
    /** Saves and installs a change whole, or rejects with the reason. */
    save: (keymap: SavedKeymap) => Promise<KeymapSnapshot>;
    /** Installs the panels' commands the window has now, with the catalog's. */
    setPanels: (panels: PanelCommand[]) => Promise<KeymapSnapshot>;
    /** Offers an unused key from the native focused document, never a command. */
    offer: (press: import("./keyboard").KeyPress, frame?: string) => Promise<{ ok: true }>;
    /** Records keys in Keyboard settings: the window's keys pass to it until it stops. */
    record: (recording: boolean) => Promise<{ ok: true }>;
    onRecorded: (listener: (key: RecordedKey) => void) => () => void;
    /** The key reminder's switch and the keys pressed (docs/keyboard.md, "The key reminder"). */
    reminders: () => Promise<import("./keyReminders").KeyReminders>;
    onReminders: (listener: (value: import("./keyReminders").KeyReminders) => void) => () => void;
    /** Turns every key reminder on or off. */
    setReminders: (on: boolean) => Promise<import("./keyReminders").KeyReminders>;
    /** The two-key shortcuts that may finish the first key the window took, or null once it stopped waiting. */
    onNext: (
      listener: (next: readonly import("./keyboard").NextKey[] | null) => void,
    ) => () => void;
  };
  /** Settings -> Devices (docs/devices.md): the captain's own, on this Mac's window. */
  devices: {
    /**
     * Whether this computer offers the Devices tab and device cards.
     */
    shown: () => Promise<{ shown: boolean }>;
    list: () => Promise<DeviceView[]>;
    /** A one-use ten-minute link, for this window alone. */
    invite: (request: DeviceInviteRequest) => Promise<DeviceInvite>;
    /** Closes an open link before it expires. */
    stop: (linkId: string) => Promise<{ ok: true }>;
    /**
     * Adds the Mac at an address over Remote Login, with the captain's own
     * SSH key; answers it once it joined, or rejects with what happened and
     * what to do. A Mac whose user runs another Firstmate's work answers the
     * question asked once; `{ leave: true }` is the captain's yes to it. A
     * Mac that did not let that key in answers the password question;
     * `{ password }`, typed once, lets Firstmate's own key in there.
     */
    add: (address: string, options?: RemoteLoginAddOptions) => Promise<RemoteLoginAddAnswer>;
    /**
     * Updates Firstmate on a computer added by its address to this Mac's version.
     * An Ubuntu package asks for that account's password once, in the same aside.
     */
    update: (
      deviceId: string,
      options?: RemoteLoginUpdateOptions,
    ) => Promise<
      | DeviceView
      | PackageUpdateAddressQuestion
      | RemoteLoginConfirmQuestion
      | RemoteLoginPasswordQuestion
      | RemoteLoginRefusedAnswer
    >;
    /**
     * Takes a device off the list; it is cut off before this answers. A
     * computer that runs work has its unmerged work brought here first; one
     * out of reach is removed `when-back` or `now`, as the captain chose.
     */
    remove: (deviceId: string, when?: DeviceRemoveWhen) => Promise<DeviceView>;
    /** Keep it: a computer waiting to be removed once it is back stays. */
    keep: (deviceId: string) => Promise<DeviceView>;
    /**
     * Update later (docs/devices.md, "Saving work before an update"): lets
     * the computer's update go while its crew's work is being saved; false
     * when none is being saved.
     */
    updateLater: (deviceId: string) => Promise<boolean>;
    /**
     * Carry its tasks on (docs/devices.md, "Joined again"): the started
     * tasks of a computer out of reach continue on `to`, and it is removed
     * once they have; the answer says each task that stayed, and why.
     */
    carryOn: (from: string, to: string) => Promise<DeviceCarryOn>;
    /** Moving the first mate to a computer that runs work (docs/devices.md, "Moving the first mate"). */
    homeMove: {
      /** The Ready list: each gap on that computer before the move. */
      ready: (deviceId: string) => Promise<HomeMoveReady>;
      /** The captain's click: answers at once, and progress pushes say the rest. */
      start: (deviceId: string) => Promise<{ ok: boolean; text: string }>;
      /** Stops a move that has not stopped the first mate yet. */
      cancel: () => Promise<{ ok: boolean; text: string }>;
      /** Starts the first mate here again once the computer it moves to stayed out of reach. */
      startHere: () => Promise<{ ok: boolean; text: string }>;
      onProgress: (listener: (progress: HomeMoveProgress) => void) => () => void;
    };
    /** Keeping a copy of the record on computers that run work (docs/devices.md, "Keeping a copy on another computer"). */
    standby: {
      /** Where each computer's copy stands. */
      list: () => Promise<StandbyViews>;
      /** The selected device’s last saved takeover endpoints, available only at home. */
      savedAddresses: (deviceId: string) => Promise<InvokeResponse<"inf:standby:saved-addresses">>;
      /** The captain's Keep a copy here (true) or Stop keeping a copy (false). */
      name: (deviceId: string, on: boolean) => Promise<{ ok: boolean; text: string }>;
      /** The captain's Keep secrets there: that computer asks the person there to confirm. */
      keepSecrets: (deviceId: string) => Promise<{ ok: boolean; text: string }>;
      /** The Ready to take over list: each gap on that computer before it could take over. */
      ready: (deviceId: string) => Promise<StandbyReady>;
      /** Two homes with one number: keeps this one ("here") or the other, by its id. */
      keepHome: (choice: string) => Promise<{ ok: boolean; text: string }>;
      onViews: (listener: (views: StandbyViews) => void) => () => void;
    };
    /**
     * Try again: this Mac's own SSH connection to the computer, or to every
     * one it stopped trying when none is named, is tried once now.
     */
    tryAgain: (deviceId?: string) => Promise<{ tried: number }>;
    /** Change address: this Mac reaches a computer it added by its address at another one. */
    changeAddress: (
      deviceId: string,
      address: string,
    ) => Promise<DeviceView | RemoteLoginRefusedAnswer>;
    /** Your devices, whole, after any change. */
    onDevices: (listener: (devices: DeviceView[]) => void) => () => void;
    onResources: (listener: (resources: ComputerResourcesView) => void) => () => void;
    /** Macs nearby with Remote Login on: `true` looks for another minute, `false` stops. */
    nearby: (watching: boolean) => Promise<NearbyMacsView>;
    /** Macs nearby, whole, whenever the list reads differently. */
    onNearby: (listener: (nearby: NearbyMacsView) => void) => () => void;
    /** Where devices find this Mac. */
    addresses: () => Promise<DeviceAddresses>;
    /** Where devices find this Mac, whole, after it reads differently: a choice, or this Mac's network moving. */
    onAddresses: (listener: (addresses: DeviceAddresses) => void) => () => void;
    /** One of this Mac's own private addresses, or null to take the first. */
    setAddress: (address: string | null) => Promise<DeviceAddresses>;
    /** Where a project's next task starts: a computer that runs work by its id, or null for this Mac. */
    runsOn: (repoId: string, deviceId: string | null) => Promise<RepoView>;
    /** What this app is on its Mac: the one holding Firstmate, or controlling another. */
    thisMac: () => Promise<ThisMac>;
    onThisMac: (listener: (thisMac: ThisMac) => void) => () => void;
    /** Joins Firstmate on another Mac with a pasted link; on success the window starts over. */
    join: (link: string) => Promise<JoinOutcome>;
    /** One step of asking the computer at an address for a link over SSH (`inf:devices:join-at`). */
    joinAt: (address: string, options?: JoinAtOptions) => Promise<JoinAtAnswer>;
    /** Joins with the link `joinAt` held, or forgets it. */
    joinHeld: (choice: "join" | "forget") => Promise<JoinOutcome>;
    /** Stops controlling the other Mac and returns this app to its own first launch. */
    leave: () => Promise<{ ok: true }>;
    /**
     * Takes over as the first mate's computer from the copy this Mac keeps,
     * once confirmed with Touch ID or the password (docs/devices.md, "Taking over").
     */
    takeOver: () => Promise<{ ok: boolean; text: string }>;
    /**
     * Try again on a Mac whose work could not be set up: checks it and sets
     * it up again now (docs/view.md, "A Mac that runs work"); answers once
     * the check is done, and `onThisMac` says what it found.
     */
    setUpWork: () => Promise<{ ok: true }>;
    /**
     * Set up from your first mate's computer, at the first launch
     * (docs/view.md, "Joining"): this computer's addresses, its Remote
     * Login state and check line; its Sharing settings on a Mac; and
     * following along once that computer added this one, while nothing was
     * done here (`followed` false otherwise).
     */
    setUpHere: (reads: SetUpReads) => Promise<SetUpHere>;
    openSharing: () => Promise<{ ok: true }>;
    followAdded: () => Promise<{
      followed: boolean;
      follows: boolean;
      joins: boolean;
      pastes: boolean;
      outside: boolean;
    }>;
    /**
     * Fix it on a Mac's row: its window, connected now, checks its work and
     * sets it up again; `asked` is false when no window of it is connected.
     */
    fixWork: (deviceId: string) => Promise<{ asked: boolean }>;
    /**
     * Update app on the row of an app behind this computer's version: that
     * app, connected now, gets this computer's version and starts again on it
     * (docs/devices.md, "Updating the app open there"); `asked` is false when
     * no app of it is connected.
     */
    updateApp: (deviceId: string) => Promise<{ asked: boolean }>;
    /** Each computer that runs work, with what it last said of its own sign-ins. */
    signIns: () => Promise<DeviceSignIns[]>;
    onSignIns: (listener: (devices: DeviceSignIns[]) => void) => () => void;
    /** Starts a sign-in on that computer, or signs one of its accounts in again; its steps arrive on `onSignIn`. */
    signIn: (
      deviceId: string,
      providerId: string,
      type: "oauth" | "api_key",
      accountId?: string,
    ) => Promise<{ signInId: string }>;
    /** What the captain typed or chose, sent to that computer once and kept nowhere here; null stops it. */
    answerSignIn: (
      signInId: string,
      promptId: string,
      value: string | null,
    ) => Promise<{ ok: true }>;
    cancelSignIn: (signInId: string) => Promise<{ ok: true }>;
    onSignIn: (listener: (event: DeviceSignInEvent) => void) => () => void;
    /** Signs that computer out of one of its own accounts. */
    signOut: (deviceId: string, accountId: string) => Promise<{ ok: true }>;
    /** Starts that computer's own sign-in where projects live; its code to read arrives on `onSignIn`. */
    forgeSignIn: (deviceId: string, host: string) => Promise<{ signInId: string }>;
    /** Signs that computer in through its own GitHub CLI's sign-in; the answer carries no token. */
    forgeSignInWithCli: (deviceId: string, host: string) => Promise<ForgeCliSignInResult>;
    /** Signs that computer in to GitLab or GitHub Enterprise with a key, kept only there; the answer carries no key. */
    forgeSignInWithKey: (deviceId: string, input: ForgeKeySignIn) => Promise<ForgeKeySignInResult>;
    /** Starts GitLab's browser code sign-in on that computer; its code rides `onSignIn`. */
    forgeSignInWithBrowser: (
      deviceId: string,
      input: ForgeBrowserSignIn,
    ) => Promise<{ signInId: string }>;
    /** Signs that computer out where projects live. */
    forgeSignOut: (deviceId: string, host: string) => Promise<{ ok: true }>;
    /**
     * A custom API connection on that computer. The key rides connect once
     * and is kept nowhere here.
     */
    custom: {
      profiles: (deviceId: string) => Promise<CustomCapabilityProfile[]>;
      address: (deviceId: string, baseUrl: string) => Promise<CustomApiAddress>;
      review: (
        deviceId: string,
        baseUrl: string,
        mode: CustomNetworkMode,
        pem?: string,
      ) => Promise<CustomApiReview>;
      connect: (deviceId: string, input: CustomApiConnectInput) => Promise<CustomApiConnectResult>;
      check: (deviceId: string, draftId: string, modelId: string) => Promise<CustomApiView>;
      discover: (deviceId: string, draftId: string) => Promise<CustomListedModel[]>;
      cancel: (deviceId: string, draftId: string) => Promise<{ ok: true }>;
      save: (deviceId: string, draftId: string, paused: boolean) => Promise<CustomApiView>;
      recheck: (deviceId: string, accountId: string) => Promise<CustomApiView>;
    };
  };
  cards: {
    list: () => Promise<Card[]>;
    act: (
      cardId: string,
      actionId: string,
      source: CardActionSource,
      value?: unknown,
      submission?: CardSubmission,
    ) => Promise<InvokeResponse<"inf:cards:act">>;
    minimize: (cardId: string, minimized: boolean) => Promise<{ ok: true }>;
    close: (cardId: string, submission?: CardSubmission) => Promise<{ ok: true }>;
    /**
     * A live note's own button: Done or Got it (INF-2794), with the words
     * left in the card's field as act's chrome value carries them.
     */
    noteDone: (
      cardId: string,
      submission?: CardSubmission,
      value?: { answers: CardAnswer[] },
    ) => Promise<{ ok: true }>;
    onCards: (listener: (cards: Card[]) => void) => () => void;
    /** The stage showed the captain this version (offer) of the card. */
    seen: (cardId: string, offerId: string) => Promise<{ ok: true }>;
    seenUpdate: (cardId: string, lifecycleId: string, updateId: string) => Promise<{ ok: true }>;
    /** The card's thread (cards-as-threads phase 1), oldest message first. */
    thread: (cardId: string) => Promise<CardThread>;
    /**
     * Every open card's unsent draft (docs/card-authoring.md, "Unsent picks
     * follow you"), read at each welcome; absent on an older preload.
     */
    drafts?: () => Promise<CardDraft[]>;
    /** What this window changed in one card's draft since it last heard it at `change.since`. */
    draft?: (cardId: string, change: CardDraftChange) => Promise<CardDraftChanged>;
    /** The card a click on its notification asked this window to open, once; null for none. */
    takeNotified: () => Promise<{ cardId: string | null }>;
    /** A click on a card's notification: take which card with `takeNotified`. */
    onNotified: (listener: () => void) => () => void;
    /** A closed card as the captain last saw it; null while it is open or unknown. */
    past: (cardId: string) => Promise<PastCard | null>;
    /** Bring a closed card forward as the read-only past card (the shared show-card door). */
    showPast: (cardId: string) => Promise<PastCard>;
    /**
     * Open the page a card's live attachment names from its task's project
     * in that task's own browser, on the captain's click: the browser it
     * opened in, or a refusal in words.
     */
    openPage: (cardId: string) => Promise<{ refusal?: string; browser?: TaskBrowserHandle }>;
    /**
     * A card's kept data file by its minted name, the text its frame asks
     * the bridge for (docs/card-authoring.md, "Data by reference"); a name
     * the home did not mint is refused.
     */
    data: (name: string) => Promise<{ contentType: "application/json"; data: string }>;
    /**
     * Save a file the card carries into this computer's Downloads, on the
     * captain's click: the name it took there and its full path, or a
     * refusal in words thrown as an error.
     */
    saveFile: (cardId: string, fileId: string) => Promise<CardFileSaved>;
    /** Save all: every named file into one new Downloads folder named `name` (the task's title). */
    saveFiles: (cardId: string, fileIds: string[], name: string) => Promise<CardFilesSaved>;
    /** Only this computer's saved display names, and a folder if Save all made one. */
    savedFiles: (cardId: string, fileIds: string[]) => Promise<SavedCardFiles>;
    /** Open a locally saved card file, or its Save all folder when fileId is null. */
    openSavedFile: (cardId: string, fileId: string | null) => Promise<OpenCardFileResult>;
    /**
     * A proof log a merge card names, by its kept file name, for the log
     * reader: its kind and its text as base64 (docs/card-authoring.md "Proof
     * logs"). A view asks the home for it.
     */
    log: (fileName: string) => Promise<{ contentType: string; data: string }>;
    /**
     * A card's own picture by its minted name, as base64: what the window draws
     * the captain's marks on before a reply carries the marked picture
     * (docs/card-threads.md, "Pointing at a place"). A name the home did not
     * mint is refused.
     */
    picture: (name: string) => Promise<InvokeResponse<"inf:cards:picture">>;
    /** The captain's reply, verbatim; the core routes it to the card's author. */
    reply: (
      cardId: string,
      payload:
        | string
        | {
            text?: string;
            files?: Array<{ text: string }>;
            answers?: CardAnswer[];
            images?: Array<{
              mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
              data: string;
            }>;
          },
      submission?: CardSubmission,
    ) => Promise<CardThread>;
    onThread: (listener: (thread: CardThread) => void) => () => void;
    /** A card's draft another window changed (`inf:cards:draft`). */
    onDraft?: (listener: (draft: CardDraft) => void) => () => void;
  };
  events: {
    on: (listener: (event: FmEvent) => void) => () => void;
  };
  feed: {
    /** The persisted recent activity lines, oldest first (P10). */
    recent: () => Promise<FeedLine[]>;
  };
  crew: {
    /** Live strip counts; live updates ride inf:event crew_counts. */
    counts: () => Promise<CrewCounts>;
  };
  /**
   * The task protocol (task-system P3): reads. The record's lifecycle
   * toggles are `task.run`; every other write is a conversation.
   */
  tasks: {
    /**
     * The live board a client resyncs from; live updates ride onBoard.
     * `{ closed: false }` reads it without its closed rows (`boardWithoutClosed`).
     */
    board: (read?: TaskBoardRead) => Promise<TaskBoard>;
    /** One record in full: view, intent, brief, outcome, timeline, asks. */
    detail: (taskId: string) => Promise<TaskDetail>;
    /** The captain opened a filing's record. Clears its new mark. */
    opened: (taskId: string) => Promise<{ opened: boolean }>;
    /** One call's whole result in the Crewmate tab, by the ref its line carries. */
    crewmateResult: (taskId: string, ref: string) => Promise<CrewResultText | null>;
    /** One picture a call's result holds in the Crewmate tab, by its ref. */
    crewmatePicture: (taskId: string, ref: string) => Promise<CrewPicture | null>;
    onBoard: (listener: (board: TaskBoard) => void) => () => void;
    /**
     * The same validated board as `onBoard`, as its JSON text. A string
     * crosses the preload bridge as one value, where a board object is
     * copied value by value on the renderer's main thread - the app's read
     * executor takes this one, parses it once and shares it.
     */
    onBoardJson: (listener: (board: string) => void) => () => void;
    /** Deltas above the measured trigger; `applyTaskBoardDelta` folds one onto a board. */
    onBoardDelta: (listener: (delta: TaskBoardDelta) => void) => () => void;
  };
  /**
   * A task's own browser, as the captain watches it (docs/task-browser.md,
   * "The view"). Its fact rides `tasks.detail`.
   */
  browser: {
    /** Pictures of the task's page start coming to `onFrame`; false when it has no browser here. */
    watch: (taskId: string) => Promise<{ watching: boolean }>;
    unwatch: (taskId: string) => Promise<{ ok: true }>;
    onFrame: (listener: (frame: TaskBrowserFrame) => void) => () => void;
    /** Stop browser: its pages, history and site data go. */
    stop: (taskId: string) => Promise<TaskBrowserCommandResult>;
    /** Open again: a fresh browser at the stopped one's last page, nothing signed in. */
    reopen: (taskId: string) => Promise<TaskBrowserCommandResult>;
    /** What the page's outline names on screen now, for Point at; read once and nothing is recorded. */
    places: (taskId: string) => Promise<TaskBrowserPlaces>;
    /** Take control of the browser the view shows, once the crewmate's command finishes. */
    take: (taskId: string, handle: TaskBrowserHandle) => Promise<TaskBrowserCommandResult>;
    /** The captain's answer to what the page asks: Allow once or Use passkey, Not now, or Show Chrome window for a passkey let run. */
    ask: (
      taskId: string,
      handle: TaskBrowserHandle,
      id: number,
      answer: TaskBrowserAskAnswer,
    ) => Promise<TaskBrowserCommandResult>;
    /** Return control: the crewmate is woken once to take a fresh look; `remember` saves the site's sign-in. */
    return: (
      taskId: string,
      handle: TaskBrowserHandle,
      options?: TaskBrowserReturn,
    ) => Promise<TaskBrowserCommandResult>;
    /** The signed-in sites each computer keeps, for Settings; `available` false where there are no task browsers. */
    signIns: () => Promise<SavedSignInsView>;
    /** The rule for the shown site: later tasks use it without asking, or ask; `deviceId` names a computer that runs work. */
    allowAutomaticSignIn: (
      site: string,
      id: string,
      automatic: boolean,
      deviceId?: string,
    ) => Promise<TaskBrowserCommandResult>;
    /** Remove a signed-in site: that computer's kept profile signs it out. */
    removeSignIn: (site: string, deviceId?: string) => Promise<TaskBrowserCommandResult>;
    /** Remove every sign-in a computer keeps, listed or not: its kept profile signs out of every site. */
    removeAllSignIns: (deviceId?: string) => Promise<TaskBrowserCommandResult>;
    /** The captain's private sites list, for Settings; `available` false where there are no task browsers. */
    privateSites: () => Promise<PrivateSitesView>;
    /** Add a name or suffix the captain typed or allowed on the app's card. */
    addPrivateSite: (site: string) => Promise<PrivateSiteChange>;
    /** Remove an entry from the list. */
    removePrivateSite: (site: string) => Promise<PrivateSiteChange>;
    /** The captain's own pointer, keys and pasted text, while he has control; recorded nowhere. */
    input: (taskId: string, input: TaskBrowserInput) => Promise<TaskBrowserCommandResult>;
    /** The room the maximized view gives the watched page, or null to give it back its own size. */
    size: (taskId: string, size: TaskBrowserSize | null) => Promise<{ ok: true }>;
  };
  projects: {
    /** Scratch plus every project the managed repositories belong to, with live counts. */
    list: () => Promise<ProjectView[]>;
    /** Name a project of several repositories; one of one is named with its repository. */
    rename: (projectId: string, name: string) => Promise<{ id: string; name: string }>;
  };
  quota: {
    snapshot: () => Promise<QuotaSnapshotView | null>;
    refresh: () => Promise<QuotaSnapshotView | null>;
    models: () => Promise<ModelsCatalogView | null>;
    onSnapshot: (listener: (snapshot: QuotaSnapshotView) => void) => () => void;
  };
  settings: {
    getRouting: () => Promise<RoutingSettings>;
    setRouting: (settings: RoutingSettings) => Promise<RoutingSettings>;
    getFirstmateModel: () => Promise<PiModelRefView | null>;
    setFirstmateModel: (model: PiModelRefView | null) => Promise<PiModelRefView | null>;
    getFirstmateAccount: () => Promise<string | null>;
    setFirstmateAccount: (accountId: string | null) => Promise<string | null>;
    /**
     * The dev-only local seat (roadmap 1.7): the same choice the environment
     * variables make, from Settings. A packaged build answers
     * `available: false` (no section renders) and refuses the write.
     */
    getLocalOrchestrator: () => Promise<LocalOrchestratorView>;
    setLocalOrchestrator: (setting: LocalOrchestratorSetting) => Promise<LocalOrchestratorView>;
    onDictation: (listener: (setting: DictationSettings) => void) => () => void;
    getDictation: () => Promise<DictationSettings>;
    setDictation: (setting: DictationSettings) => Promise<DictationSettings>;
    getRunbooks: () => Promise<RunbookView[]>;
    openRunbooksFolder: () => Promise<{ ok: true }>;
    viewRunbook: (id: string) => Promise<{ ok: true }>;
    setRunbook: (id: string, enabled: boolean) => Promise<RunbookView[]>;
    getPersonalResources: () => Promise<boolean>;
    setPersonalResources: (enabled: boolean) => Promise<boolean>;
    /** The app's own cost limit for each task (docs/usage.md, "The cost limit"). */
    getCostLimit: () => Promise<AppCostLimitView>;
    setCostLimit: (limit: CostLimit) => Promise<AppCostLimitView>;
    getNotifications: () => Promise<boolean>;
    setNotifications: (enabled: boolean) => Promise<boolean>;
    /** Theme and the rest of how the app looks. */
    getAppearance: () => Promise<Appearance>;
    setAppearance: (appearance: Appearance) => Promise<Appearance>;
    /** How the app is arranged: today, which rail panels are collapsed. */
    getLayout: () => Promise<Layout>;
    /** `move` names the one panel the captain moved, for the Activity line. */
    setLayout: (layout: Layout, move?: LayoutMove) => Promise<Layout>;
    /**
     * The host-owned switch over the captain's own panels (Step 5). Off
     * unmounts every one of them and stops their server modules; the
     * reason the app gives for them being off is the core's, so only
     * `enabled` crosses.
     */
    setPanels: (enabled: boolean) => Promise<PersonalPanels>;
    /** All of it, as the one value the host applies; pushed on every write. */
    getPreferences: () => Promise<ShellPreferences>;
    onPreferences: (listener: (preferences: ShellPreferences) => void) => () => void;
    /**
     * The two switches (roadmap 1.4): what may leave this machine for us.
     * Diagnostics - the allowlisted anonymous events with an anonymous
     * install ID (`src/shared/diagnostics.ts`) - is on by default and sends
     * nothing until the person has been shown it once (the first-launch
     * notice or the viewer); contribution is off. The preview is that
     * payload, before and after a send; the ask is the one-time question
     * at local-model enablement, answered once.
     */
    getSharing: () => Promise<SharingView>;
    setSharing: (channel: SharingChannel, enabled: boolean) => Promise<SharingView>;
    markSharingViewed: (channel: SharingChannel) => Promise<SharingView>;
    sharingPreview: () => Promise<SharingPreview>;
    answerSharingAsk: (answer: SharingAskAnswer) => Promise<SharingView>;
    onSharing: (listener: (view: SharingView) => void) => () => void;
  };
  models: {
    /** Re-read model/use/readiness state after any confirmed model mutation. */
    onChanged: (listener: () => void) => () => void;
    available: () => Promise<PiModelRefView[]>;
    /** The slot-first Settings board. */
    slots: () => Promise<ModelSlotsView>;
    /** Adds or removes one slot from an offering's membership; returns the refreshed view. */
    setSlotMembership: (key: string, slot: Slot, on: boolean) => Promise<ModelSlotsView>;
    setSpeed: (key: string, speed: CrewSpeed) => Promise<ModelSlotsView>;
    setReasoning: (
      key: string,
      slot: Slot,
      level: ReasoningChoice | null,
    ) => Promise<ModelSlotsView>;
    /** Reset offerings to the starter map; omit providerId for every provider. */
    resetSlots: (providerId?: string) => Promise<ModelSlotsView>;
    /**
     * The Decisions group (S7b): which model answers typed decisions, and
     * each native option's state. Never a key - it has its own write-only
     * call, and no call here returns one.
     */
    decisions: () => Promise<DecisionsView>;
    setDecisions: (decisions: DecisionsSettings) => Promise<DecisionsView>;
    setDecisionKey: (id: DecisionModelId, key: string) => Promise<DecisionsView>;
    removeDecisionKey: (id: DecisionModelId) => Promise<DecisionsView>;
    /** One decision model use switched; `approve` only after the person agreed in the consent dialog. */
    setDecisionUse: (request: DecisionUseRequest) => Promise<DecisionsView>;
  };
  update: {
    status: () => Promise<UpdateStatus>;
    /** Check for updates: the release source now, past the saved answer. */
    check: () => Promise<UpdateStatus>;
    setChannel: (channel: UpdateChannel) => Promise<UpdateStatus>;
    openReleasePage: () => Promise<{ ok: true }>;
    install: () => Promise<UpdateInstallResult>;
    /** Update later: lets an update go while it saves the crew's work. */
    later: () => Promise<UpdateStatus>;
    /** A paired view started this computer's update (`inf:update:asked`): its name. */
    onAsked: (listener: (asked: UpdateAsked) => void) => () => void;
    /**
     * Whether this window holds words not yet sent: an app following its
     * home's version waits to start again while one does (docs/view.md,
     * "Following the home's version").
     */
    unsent: (holds: boolean) => Promise<{ ok: true }>;
    /**
     * The first mate's computer's own update, read and started from this Mac
     * while it controls that one (docs/view.md, "Updating the first mate's
     * computer"); asked only where `thisMac` says `homeUpdates`.
     */
    home: {
      status: () => Promise<HomeUpdate>;
      install: () => Promise<HomeUpdate>;
      later: () => Promise<HomeUpdate>;
    };
  };
  /** The release notes the app showed (docs/release-notes.md "Reading a note again"). */
  releaseNotes: {
    list: () => Promise<ReleaseNotesView>;
    /** Brings a shown note forward: the one for `version`, or else the newest that listed changes. */
    show: (version: string | null) => Promise<ShownReleaseNote & { open: boolean }>;
    onChange: (listener: (view: ReleaseNotesView) => void) => () => void;
  };
  presence: {
    get: () => Promise<PresenceSettings>;
    set: (settings: PresenceSettings) => Promise<PresenceSettings>;
  };
  retention: {
    purge: () => Promise<{ purgedTasks: number }>;
    /**
     * Whether a purge also clears knowledge, which only an alpha or
     * development build keeps; and the words from outside this build keeps
     * for a while, which `deleteOutside` deletes on their own.
     */
    scope: () => Promise<{ knowledge: boolean; kept?: KeptOutsideData[] }>;
    /** Replace the Gmail and Calendar content every saved conversation holds with a note (INF-952). */
    deleteOutside: () => Promise<OutsideDataDeleted>;
  };
  knowledge: {
    /**
     * Whether this build keeps knowledge - an alpha or development build - and
     * whether there is any to show (docs/knowledge.md, "The browser").
     */
    enabled: () => Promise<{ enabled: boolean; held: boolean }>;
  };
  voice: {
    status: () => Promise<VoiceStatus>;
    ensureModel: () => Promise<{ ok: true }>;
    micAccess: () => Promise<{ access: MicAccess }>;
    openMicSettings: () => Promise<{ ok: true }>;
    recognizer: () => Promise<{ where: RecognizerPlace }>;
    warmUp: () => Promise<{ ok: true }>;
    transcribe: (audio: Float32Array) => Promise<{ text: string }>;
    onProgress: (listener: (progress: VoiceDownloadProgress) => void) => () => void;
  };
  auth: {
    providers: () => Promise<ProviderView[]>;
    replyPrompt: (promptId: string, value: string | null) => Promise<{ ok: true }>;
    cancel: () => Promise<{ ok: true }>;
    onPrompt: (listener: (prompt: AuthPromptView) => void) => () => void;
    onNotice: (listener: (notice: AuthNotice) => void) => () => void;
  };
  accounts: {
    custom: {
      profiles: () => Promise<CustomCapabilityProfile[]>;
      review: (
        baseUrl: string,
        mode: CustomApiInput["mode"],
        pem?: string,
      ) => Promise<CustomApiReview>;
      address: (baseUrl: string) => Promise<CustomApiAddress>;
      connect: (input: CustomApiConnectInput) => Promise<CustomApiConnectResult>;
      prepare: (input: CustomApiInput) => Promise<CustomApiView>;
      check: (draftId: string, modelId: string) => Promise<CustomApiView>;
      discover: (draftId: string) => Promise<CustomListedModel[]>;
      cancel: (draftId: string) => Promise<{ ok: true }>;
      save: (draftId: string, paused: boolean) => Promise<CustomApiView>;
      /** A saved connection's one fresh check; a failure comes back on its model. */
      recheck: (accountId: string) => Promise<CustomApiView>;
      list: () => Promise<CustomApiView[]>;
    };
    list: () => Promise<AccountView[]>;
    /** Add an account: runs the provider's own sign-in into a fresh store. */
    add: (
      providerId: string,
      type: "oauth" | "api_key",
      options?: { enterpriseHost: string },
    ) => Promise<AccountView>;
    /** Sign an existing account in again, into its own store; nothing else moves. */
    signIn: (accountId: string) => Promise<AccountView>;
    remove: (accountId: string) => Promise<{ ok: true }>;
    /** With `deviceId`, rename, pause and prefer act on that computer that runs work's own account. */
    rename: (accountId: string, label: string, deviceId?: string) => Promise<{ ok: true }>;
    setEnabled: (accountId: string, enabled: boolean, deviceId?: string) => Promise<{ ok: true }>;
    pin: (providerId: string, accountId: string | null, deviceId?: string) => Promise<{ ok: true }>;
    /** Keep going on credits once the allowance is spent (docs/quota.md), on or off. */
    /** With `deviceId`, the account is that computer that runs work's own. */
    keepGoing: (accountId: string, on: boolean, deviceId?: string) => Promise<{ ok: true }>;
    /**
     * Uses one of a Codex account's saved resets through the Codex CLI
     * (docs/codex-client.md); with `signIn`, Codex may sign in first.
     */
    redeemSavedReset: (
      accountId: string,
      options?: UseSavedResetOptions,
    ) => Promise<SavedResetResult>;
    /**
     * Use saved resets on their own, on or off (docs/quota.md); turning it
     * on with `signIn` lets Codex sign in to the account first.
     */
    setUseSavedResets: (
      accountId: string,
      on: boolean,
      options?: UseSavedResetOptions,
    ) => Promise<{ ok: true }>;
  };
  /**
   * The app's own sign-ins where projects live (git integration PR 1.2):
   * optional - a project kept on this Mac never needs one. `signIn` starts
   * the host's device flow and answers with the code to enter on the
   * host's page; how it ends arrives on `onChange`. `signInWithKey` signs
   * in to a host on the person's own server with a key made there, and
   * answers whether it was kept. `signInWithCli` signs a GitHub host in
   * through the person's own GitHub CLI, and answers whether it was kept.
   */
  forges: {
    /** A host's projects, and whether the listing read them all. */
    projects: (host: string) => Promise<ForgeProjectListing>;
    list: () => Promise<ForgesView>;
    signIn: (host: string) => Promise<ForgeSignInFlow>;
    signInWithBrowser: (input: ForgeBrowserSignIn) => Promise<ForgeSignInFlow>;
    signInWithKey: (input: ForgeKeySignIn) => Promise<ForgeKeySignInResult>;
    signInWithCli: (address: string) => Promise<ForgeCliSignInResult>;
    cancel: () => Promise<ForgesView>;
    signOut: (host: string) => Promise<ForgesView>;
    /** The person's open proposed changes there, newest first (the `forge.changes` read). */
    changes: () => Promise<ForgeChangesView>;
    onChange: (listener: (view: ForgesView) => void) => () => void;
  };
  /**
   * Integrations (docs/integrations.md): the rows Settings -> Integrations
   * draws, and the changes it makes through the same catalog lines the
   * first mate's `app_change` uses. A connection is made by its kind's own
   * sign-in (GitHub's is `forges.signIn`, Google's `signIn`), or added from
   * the person's words (an MCP server, `addMcp`).
   */
  integrations: {
    list: () => Promise<IntegrationsView>;
    addMcp: (server: IntegrationMcpAdd) => Promise<{ id: string; view: IntegrationsView }>;
    /**
     * Sign in to a kind that signs in in the person's browser (Google): it
     * opens the page there and answers once the browser comes back. A kind
     * with a notice (`INTEGRATION_NOTICES`) needs the person's accept of it.
     */
    signIn: (
      kind: IntegrationKind,
      consent?: IntegrationSignInConsent,
    ) => Promise<{ id: string; view: IntegrationsView }>;
    /** End the sign-in waiting for the browser. */
    cancelSignIn: () => Promise<IntegrationsView>;
    /**
     * On a computer that controls a first mate: the address the browser ended
     * on, pasted, for the sign-in there whose return this computer could not
     * catch (docs/view.md, "A sign-in that returns to the first mate's
     * computer"), with what that sign-in answered.
     */
    signInReturn: (id: string, address: string) => Promise<{ status: number; page: string }>;
    /** Link the inbox's command into /usr/local/bin, where that is free and writable. */
    linkInbox: () => Promise<IntegrationsView>;
    configure: (id: string, patch: IntegrationSettingsPatch) => Promise<IntegrationsView>;
    rule: (id: string, action: string, allowed: boolean) => Promise<IntegrationsView>;
    remove: (id: string) => Promise<IntegrationsView>;
    check: (id: string) => Promise<IntegrationsView>;
    /** Keep the captain's key for one slot, or forget it with null; nothing hands it back. */
    secret: (id: string, slot: string, value: string | null) => Promise<IntegrationsView>;
    onChange: (listener: (view: IntegrationsView) => void) => () => void;
  };
  observe: {
    enabled: () => Promise<{ enabled: boolean }>;
    sessions: () => Promise<ObserveSessionSummary[]>;
    detail: (sessionId: string) => Promise<ObserveSessionDetail>;
  };
  /** The plugin host's own needs: the frame vehicle, the read catalog, the fetch seam. */
  plugins: {
    mountFrame: (request: FrameMountRequest) => Promise<FrameMount>;
    unmountFrame: (mountId: string) => Promise<{ ok: true }>;
    /** Answers once the main process runs; the frame watchdog asks it each tick. */
    mainAlive: () => Promise<{ ok: true }>;
    /**
     * Executes one read-catalog entry (src/shared/reads.ts) by name. `grant`
     * is what the plugin host adds from the plugin's manifest (the views a
     * `sql` read may reach); a read without one reaches nothing it grants.
     */
    read: <N extends ReadName>(
      name: N,
      args: ReadArgs<N>,
      grant?: ReadGrant,
    ) => Promise<ReadResult<N>>;
    fetch: (call: MediatedFetchCall) => Promise<MediatedFetchResult>;
    /**
     * Personal extensions (talk-to-personalize Step 2): the snapshot the
     * renderer mounts from, an action call into an extension's `server.ts`,
     * and the extension store. `db` is namespaced by extension id on every
     * call; a panel gets it pre-bound to its own id in its props.
     */
    personal: {
      list: () => Promise<PersonalSnapshot>;
      onSnapshot: (listener: (snapshot: PersonalSnapshot) => void) => () => void;
      /** What the window did with each panel, for `place_panel` and the surfaces list. */
      reportMounts: (mounts: PanelMounts) => Promise<{ ok: true }>;
      /** The captain's Retry on a panel whose background work the app stopped. */
      retry: (extensionId: string, options?: PersonalInvokeOptions) => Promise<boolean>;
      /** The captain's Update panel on a panel whose background work the app refused. */
      update: (extensionId: string) => Promise<boolean>;
      /** The captain's Ask again on a panel's integration call waiting on him or turned down. */
      askAgain: (extensionId: string, integration: string, action: string) => Promise<boolean>;
    };
    /** A panel drawing's call on its integrations, over what its manifest names. */
    integrations: (
      extensionId: string,
      request: PanelIntegrationsRequest,
      options?: PersonalInvokeOptions,
    ) => Promise<PanelIntegrationsResponse>;
    /**
     * A panel's change of a setting its manifest's `actions` grant names, on
     * the captain's press in it (docs/ui-plugins.md, "Changing settings").
     */
    changeSetting: (
      extensionId: string,
      action: string,
      value: Record<string, unknown>,
    ) => Promise<{ ok: true } | { ok: false; text: string }>;
    invoke: (
      extensionId: string,
      action: string,
      input?: unknown,
      options?: PersonalInvokeOptions,
    ) => Promise<PersonalInvokeResult>;
    db: {
      request: (request: PersonalStoreRequest) => Promise<PersonalStoreResponse>;
      onChange: (listener: (change: PersonalStoreChange) => void) => () => void;
    };
  };
};
