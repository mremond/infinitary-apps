import { COMPUTER, HERE } from "./deviceNames";
import type { CoreInvokeChannel, InvokeChannel } from "./ipc";

/** A request the window answers itself, never the core. */
type HostInvokeChannel = Exclude<InvokeChannel, CoreInvokeChannel>;

/**
 * Why the first mate does not run a request or a setting itself, from a
 * closed set (primitives/app-actions.md, "What stays outside the
 * catalog"): a credential (a sign-in, key, secret value or joining link),
 * the captain's consent the app holds for their own click, an act that
 * cannot be undone or ends running work (destructive), another computer's
 * own report or act, a recorded captain ruling, a request only the crew or a
 * panel's own code sends (crew-only), the window's own program on the
 * computer the captain is at, which the first mate's tools do not reach
 * (window), or a report, view stamp or conversation nobody chooses
 * (not-a-setting). The captain's click alone is no ground.
 */
export const EXCEPTION_GROUNDS = [
  "credential",
  "consent",
  "destructive",
  "other-computer",
  "ruling",
  "crew-only",
  "window",
  "not-a-setting",
] as const;
export type ExceptionGround = (typeof EXCEPTION_GROUNDS)[number];
/** One excuse: its ground, then why in words. */
export type ActionException = readonly [ExceptionGround, string];

/** A crewmate's tool callback, asked by the computer that holds its conversation (src/shared/work.ts). */
// i18n-exempt: coverage reasons, read by the coverage check and its tests, never shown
const WORK_REQUEST: ActionException = [
  "crew-only",
  "A crewmate's own work, asked by the computer that runs it; not an app setting",
];

/** The captain's own clicks and picks on a card. */
// i18n-exempt: an inventory reason the channel parity test reads, never shown
const CARD_CLICKS: ActionException = ["consent", "Captain card clicks"];

/** Operations which are not app settings, with the reason they stay outside the table. */
// i18n-exempt: coverage reasons, read by the coverage check and its tests, never shown
export const ACTION_EXCEPTIONS: Partial<Record<CoreInvokeChannel, ActionException>> = {
  "inf:secrets:entry": [
    "credential",
    "The captain's trusted secure entry; never a first mate operation or an agent-authored form",
  ],
  "inf:secrets:enroll": [
    "credential",
    "A phone offers its approval key; nothing changes until the captain confirms on the home",
  ],
  "inf:secrets:decide": [
    "consent",
    "A phone's signed decision on one exact use, or its refusal; never a first mate operation",
  ],
  "inf:secrets:keep": [
    "credential",
    "The captain's typed values on an ask card the app drew, sent with its one-time pass; never a first mate operation or an agent-authored form",
  ],
  "inf:secrets:bring": [
    "credential",
    "The captain's ticks on a bring card the app drew, sent with its one-time pass; it carries no value and is never a first mate operation",
  ],
  "inf:quota:opened": [
    "not-a-setting",
    "An older window opening Subscriptions, answered with the snapshot the home holds; the asked refresh-usage reads every allowance",
  ],
  "inf:automation:kept-forget": [
    "destructive",
    "Takes a kept job whose remove did not finish off the list on the captain's click in Settings, running nothing",
  ],
  "inf:converse": ["not-a-setting", "Conversation, not an app setting"],
  "inf:repos:offer-folder": [
    "consent",
    // i18n-exempt: an inventory reason the channel parity test reads, never shown
    "A folder the captain dropped on the message box puts up the project setup card; nothing is added until their Add project click there",
  ],
  "inf:cards:act": CARD_CLICKS,
  "inf:cards:close": CARD_CLICKS,
  "inf:cards:note-done": CARD_CLICKS,
  "inf:cards:minimize": [
    "window",
    "Captain-only saved card presentation; the first mate may restore through show-card, never minimize",
  ],
  "inf:cards:show-past": [
    "not-a-setting",
    "Compatible closed-card gesture; the asked show-card action uses inf:cards:show for live and closed cards",
  ],
  "inf:cards:open-page": [
    "window",
    "The captain's click on a card's page from its task's project; it opens the task's browser and sets nothing",
  ],
  "inf:cards:reply": ["not-a-setting", "Conversation, not an app setting"],
  // The captain's unsent picks, words and notes on a card, kept for every window until a press or reply sends them.
  "inf:cards:draft": CARD_CLICKS,
  "inf:task:steer": [
    "not-a-setting",
    "The captain's own line in a task's Crewmate tab; conversation, not an app setting",
  ],
  "inf:task:interrupt": [
    "consent",
    "The captain's own key or click in a task's Crewmate tab; nothing is set",
  ],
  "inf:auth:prompt-reply": ["credential", "Sign-in interaction"],
  "inf:auth:cancel": ["credential", "Sign-in cancellation"],
  "inf:accounts:custom:connect": ["credential", "Sign-in preparation"],
  "inf:accounts:custom:prepare": ["credential", "Sign-in preparation"],
  "inf:accounts:custom:check": ["credential", "Sign-in check"],
  "inf:accounts:custom:recheck": ["credential", "Sign-in check"],
  "inf:accounts:custom:discover": ["credential", "Sign-in discovery"],
  "inf:accounts:custom:cancel": ["credential", "Sign-in cancellation"],
  "inf:forges:cancel": ["credential", "Sign-in cancellation"],
  "inf:integrations:sign-in-cancel": ["credential", "Sign-in cancellation"],
  "inf:integrations:sign-in-return": [
    "credential",
    "Sign-in interaction: the browser's return from the computer the captain is at, handed once to the waiting sign-in",
  ],
  "inf:devices:stop": ["credential", "Closes the captain's own open link; nothing is set"],
  "inf:devices:push": [
    "other-computer",
    "A paired phone handing where its cards are pushed; not an app setting, and only that phone hands it",
  ],
  "inf:devices:fold": [
    "other-computer",
    "A Mac's own window folds its second row into the one its work keeps, proved by that row's key; never a first mate operation",
  ],
  "inf:devices:carry-on": [
    "consent",
    // i18n-exempt: a channel's coverage reason, read by the coverage check, never shown
    "The captain's own Carry its tasks on in Settings -> Devices, after its one question; the first mate moves a task off a computer out of reach with move_task's leave_behind on the captain's yes",
  ],
  "inf:devices:add": [
    "credential",
    `Adds a ${COMPUTER.one} over Remote Login on the captain's click in Settings; device-invite only offers the card, and the feed says each step`,
  ],
  "inf:devices:link-at": [
    "credential",
    `One step of joining another ${COMPUTER.one} by its address on the captain's click, asked only by the window's own program of the command it started; the link it answers never reaches a page or a command`,
  ],
  "inf:devices:update": [
    "credential",
    `Updates Infinitary on a ${COMPUTER.one} added by its address on the captain's click; device-update only offers the card, and the feed says each step`,
  ],
  "inf:devices:update-later": [
    "consent",
    `The captain's own Update later on a ${COMPUTER.one}'s row while its work is saved, which lets its update go; a model cannot choose it`,
  ],
  "inf:view:answer": [
    "window",
    "A window's own answer to what the first mate asked of it; the asked change is that line's",
  ],
  "inf:devices:work-setup": [
    "other-computer",
    `A ${COMPUTER.one}'s own window telling its home what it found of its background work at each welcomed connection; nothing is set`,
  ],
  "inf:devices:app-follow": [
    "other-computer",
    // i18n-exempt: a channel's coverage reason, read by the coverage check, never shown
    `The app open on another ${COMPUTER.one} telling its home how it catches up with the home's version; nothing is set`,
  ],
  "inf:devices:update-app": [
    "consent",
    // i18n-exempt: a channel's coverage reason, read by the coverage check, never shown
    `The captain's own Update app in Settings, asking the app open on another ${COMPUTER.one} to update to this one's version and start again; a model cannot grant it`,
  ],
  "inf:devices:change-address": [
    "consent",
    `Reaches a ${COMPUTER.one} added by its address at another address on the captain's click in Settings, once a look there finds the same computer`,
  ],
  "inf:home-move:start": [
    "destructive",
    `Moves the first mate to a ${COMPUTER.one} on the captain's Move now in Settings; the Ready list says each step`,
  ],
  "inf:standby:keep-home": [
    "destructive",
    `Keeps one of two homes that answer with one number on the captain's click in Settings; the other steps down to a ${COMPUTER.one} that keeps a copy`,
  ],
  "inf:standby:other-home": [
    "other-computer",
    `A window that hears another home with this one's number tells this home, which holds every act that cannot be undone and asks the captain to keep one in Settings`,
  ],
  "inf:standby:keep-secrets": [
    "credential",
    `Asks a ${COMPUTER.one} that keeps a copy to keep the Secrets sealed with its own lock, on the captain's click in Settings; nothing is kept until the captain confirms there`,
  ],
  "inf:home-move:start-here": [
    "destructive",
    "Starts the first mate here again on the captain's confirmed click, after the computer it moved to stayed out of reach",
  ],
  "inf:devices:sign-in": [
    "credential",
    "Sign-in on a computer that runs work, started by the captain's click",
  ],
  "inf:devices:sign-in:answer": [
    "credential",
    "Sign-in interaction: what the captain typed goes to that computer once and is kept nowhere",
  ],
  "inf:devices:sign-in:cancel": ["credential", "Sign-in cancellation"],
  "inf:devices:sign-out": ["credential", "Signs a computer that runs work out of its own account"],
  "inf:devices:forge-sign-in": [
    "credential",
    "GitHub sign-in on a computer that runs work, started by the captain's click in Settings",
  ],
  "inf:devices:forge-sign-in-cli": [
    "credential",
    "GitHub sign-in through a computer's own GitHub CLI, on the captain's click in Settings",
  ],
  "inf:devices:forge-sign-in-key": [
    "credential",
    "GitLab or GitHub Enterprise key sign-in on a computer that runs work, on the captain's click in Settings; the key goes there once",
  ],
  "inf:devices:forge-sign-in-browser": [
    "credential",
    "GitLab browser sign-in on a computer that runs work, started by the captain's click in Settings",
  ],
  "inf:devices:forge-sign-out": [
    "credential",
    "Signs a computer that runs work out of its own GitHub sign-in",
  ],
  "inf:devices:custom:connect": [
    "credential",
    "Sign-in preparation: the key, headers or token command go to that computer once; the command runs there and its output stays private",
  ],
  "inf:devices:custom:check": ["credential", "Sign-in check on a computer that runs work"],
  "inf:devices:custom:discover": ["credential", "Sign-in discovery on a computer that runs work"],
  "inf:devices:custom:cancel": ["credential", "Sign-in cancellation"],
  "inf:devices:custom:save": [
    "credential",
    "Saves a custom API connection on a computer that runs work",
  ],
  "inf:devices:custom:recheck": ["credential", "Sign-in check on a computer that runs work"],
  "inf:settings:local-orchestrator:set": ["not-a-setting", "Development-only model control"],
  "inf:tasks:opened": ["not-a-setting", "View stamp"],
  "inf:task:pin": [
    "window",
    "The captain's own pin in Tasks, on the task board or on the record; what the Tasks panel lists first, never an app setting",
  ],
  "inf:browser:stop": ["window", "The captain's click in a task's browser view; nothing is set"],
  "inf:browser:reopen": ["window", "The captain's click in a task's browser view; nothing is set"],
  "inf:browser:take": ["window", "The captain's click in a task's browser view; nothing is set"],
  "inf:browser:ask": [
    "consent",
    "The captain's Allow once, Use passkey, Not now or Show Chrome window in a task's browser view, for that page until they return control; nothing is set",
  ],
  "inf:browser:return": ["window", "The captain's click in a task's browser view; nothing is set"],
  "inf:browser:size": [
    "window",
    "The room the captain's maximized task browser view gives its page; nothing is set",
  ],
  "inf:browser:input": [
    "window",
    "The captain's own presses and typing in a task's browser while they have control; nothing is set",
  ],
  "inf:update:install": [
    "consent",
    "The captain's own update-and-restart consent in the update panel; a model cannot grant it",
  ],
  "inf:update:later": [
    "consent",
    "The captain's own Update later in the update panel, which lets an update go; a model cannot choose it",
  ],
  "inf:home-update:install": [
    "consent",
    "The captain's own Update of the first mate's computer from a paired phone or Mac, after its confirmation; a model cannot grant it",
  ],
  "inf:home-update:later": [
    "consent",
    "The captain's own Update later of the first mate's computer from a paired phone or Mac; a model cannot choose it",
  ],
  "inf:browser:sign-ins:automatic": [
    "consent",
    "The captain's separate grant or revocation of saved website account access; the first mate never changes it",
  ],
  "inf:browser:sign-ins:remove": [
    "credential",
    "The captain's own Remove of a saved website sign-in; the first mate never removes one",
  ],
  "inf:browser:sign-ins:remove-all": [
    "credential",
    "The captain's own Remove all of a computer's website sign-ins; the first mate never removes them",
  ],
  "inf:cards:seen": ["not-a-setting", "View stamp"],
  "inf:cards:seen-update": ["not-a-setting", "View stamp"],
  "inf:settings:sharing:viewed": ["not-a-setting", "View stamp"],
  "inf:settings:sharing:phone": [
    "other-computer",
    "A paired phone handing its own usage events to Diagnostics; not an app setting",
  ],
  "inf:app:first-run:crew-word": ["not-a-setting", "First-run view stamp"],
  "inf:plugins:fetch": ["crew-only", "Panel internal operation"],
  "inf:plugins:invoke": ["crew-only", "Panel internal operation"],
  "inf:plugins:db": ["crew-only", "Panel internal operation"],
  "inf:plugins:update": [
    "crew-only",
    "The captain's Update panel on a panel whose background work the app refused; it tells the first mate, which starts the update, and nothing is set",
  ],
  "inf:plugins:integrations": [
    "crew-only",
    "A panel's own call on the captain's integrations; each action keeps its Settings rule, and the first mate reaches them through its own integration tools",
  ],
  "inf:plugins:settings:change": [
    "crew-only",
    "A panel's change of a setting it was granted, on the captain's press in it; it runs that setting's own catalog line as the captain",
  ],
  "inf:plugins:personal:mounts": [
    "window",
    "The window's own answer about which panels it drew, sent whenever it changes; nothing is set",
  ],
  "inf:own-window:here": [
    "window",
    "This computer's window saying it is open beside a first mate a command started; nothing is set",
  ],
  "inf:own-window:answer": [
    "window",
    "This computer's window answering what its first mate asked of it; nothing is set",
  ],
  "inf:window:front": [
    "window",
    // i18n-exempt: a channel's coverage reason, read by the coverage check, never shown
    "A window in a program of its own saying whether it is in front, which holds a phone's pushes; nothing is set",
  ],
  "inf:own-window:focused": [
    "window",
    "This computer's window coming to the front, which reads a stale allowance again; nothing is set",
  ],
  "inf:voice:primed": [
    "window",
    "The window's own record of the first hold to talk, after the system was asked about the microphone",
  ],
  "inf:settings:keys:set": [
    "window",
    "The captain's own keys, changed in Keyboard settings; the first mate never changes a key",
  ],
  "inf:runbooks:folder": [
    "window",
    "The captain's click on a runbook's folder button; it makes the folder ready and answers its path, and nothing is set",
  ],
  "inf:update:hold": [
    "consent",
    "The hold this computer's window keeps on the crew's saved work while it installs the captain's own update; a model cannot grant it",
  ],
  "inf:work:card": WORK_REQUEST,
  "inf:work:card-refused": WORK_REQUEST,
  "inf:work:close-card": WORK_REQUEST,
  "inf:work:followup": WORK_REQUEST,
  "inf:work:start-program": WORK_REQUEST,
  "inf:work:progress": WORK_REQUEST,
  "inf:work:speed-note": WORK_REQUEST,
  "inf:work:report": WORK_REQUEST,
  "inf:work:reply": WORK_REQUEST,
  "inf:work:revise-required-action": WORK_REQUEST,
  "inf:work:github-write": WORK_REQUEST,
  "inf:work:prepare-change": WORK_REQUEST,
  "inf:work:open-change": WORK_REQUEST,
  "inf:work:show-merge-card": WORK_REQUEST,
  "inf:work:check-change": WORK_REQUEST,
  "inf:work:download-artifact": WORK_REQUEST,
  "inf:work:record-knowledge": WORK_REQUEST,
  "inf:work:use-integration": WORK_REQUEST,
  "inf:work:copy-file": WORK_REQUEST,
  "inf:work:picture": WORK_REQUEST,
  "inf:work:media": WORK_REQUEST,
  "inf:work:handover-file": WORK_REQUEST,
  "inf:work:typeface": WORK_REQUEST,
  "inf:work:job-exit": WORK_REQUEST,
  "inf:work:events": WORK_REQUEST,
  "inf:work:browser": WORK_REQUEST,
  "inf:work:browser-frame": WORK_REQUEST,
  "inf:work:browser-event": WORK_REQUEST,
  "inf:work:secret-use": WORK_REQUEST,
  "inf:work:secret-take": WORK_REQUEST,
  "inf:work:secret-ask": WORK_REQUEST,
  "inf:work:sign-in": [
    "other-computer",
    "A computer's own sign-in, told to its home; not an app setting",
  ],
  "inf:work:sign-ins": [
    "other-computer",
    "A computer's own sign-ins, told to its home; not an app setting",
  ],
};

/** Field exceptions name state inside a claimed request that no action changes, with their ground. */
// i18n-exempt: coverage reasons, read by the coverage check and its tests, never shown
export const ACTION_FIELD_EXCEPTIONS: Partial<
  Record<CoreInvokeChannel, Record<string, ActionException>>
> = {
  "inf:settings:layout:set": {
    moved: [
      "not-a-setting",
      "The panel a drag in the window moved, which names the captain's own Activity line",
    ],
    focusedProjectId: [
      "window",
      "The window's project focus is the captain's pick in the top bar's pill or a project chip, and only a hint to the first mate (docs/project-focus.md)",
    ],
  },
  "inf:settings:routing:set": {
    dynamicRouting: [
      "not-a-setting",
      "Legacy field; the home ignores attempts to turn routing off",
    ],
  },
  "inf:settings:decisions:set": {
    version: ["not-a-setting", "Stored format version, not a control"],
    egress: ["consent", "Outbound consent: what a decision model may receive"],
  },
  "inf:decisions:use:set": {
    approve: [
      "consent",
      "Turning a use on shows the answering model's approval again; decision-use-off only turns one off",
    ],
    agreed: ["consent", "A use's disclosure the captain agreed to before it asks"],
  },
  "inf:secrets:action": {
    "kind=unlock": ["credential", "Unlocking Secrets takes the captain's own password"],
    "kind=review-use": ["consent", "A use of a secret waits on the captain's own review"],
    "kind=cancel-use": [
      "consent",
      "Withdrawing a use the captain reviewed is the captain's own answer",
    ],
    "kind=save-rules": ["consent", "Which tasks may use which secret is the captain's consent"],
    "kind=forget": ["destructive", "Forgetting a secret deletes it"],
    "kind=delete-history": ["destructive", "Deleting the record of secret uses"],
    "kind=backup-recovery": ["credential", "A recovery backup holds the key to every secret"],
    "kind=restore-recovery": ["credential", "Restoring takes the captain's recovery key"],
    "kind=start-over": ["destructive", "Starting over deletes every secret"],
    "kind=forget-device": ["destructive", "Forgetting a computer ends its access to Secrets"],
    "kind=ask-phone": ["credential", "The paired phone approves with the captain's own hand"],
    "kind=cancel-phone": ["credential", "Withdraws a phone approval the captain started"],
    "kind=answer": ["credential", "A pass code the captain types"],
    request: ["consent", "Names a use the captain reviews or withdraws"],
    rules: ["consent", "Which tasks may use which secret"],
    ref: ["destructive", "The secret a forget deletes"],
    device: ["destructive", "The computer a forget ends"],
    paired: ["credential", "The phone the captain approves on"],
    pass: ["credential", "The pass code the captain types"],
  },
  "inf:devices:invite": {
    phone: [
      "credential",
      "A phone's joining link is a credential the first mate never holds; device-invite offers computers",
    ],
    at: [
      "credential",
      "Where a joining link tells a device to dial; the link is a credential the first mate never sees",
    ],
  },
};

/**
 * The window's own requests that change something (`surface: "host"`),
 * which the first mate's core never answers: each one's ground.
 */
// i18n-exempt: coverage reasons, read by the coverage check and its tests, never shown
export const HOST_ACTION_EXCEPTIONS: Partial<Record<HostInvokeChannel, ActionException>> = {
  "inf:devices:join": [
    "credential",
    `Joins the first mate on another ${COMPUTER.one} with the link its person pasted; the link is a credential`,
  ],
  "inf:devices:join-at": [
    "credential",
    `Asks a ${COMPUTER.one} at an address for a joining link over the person's own SSH, with their password once`,
  ],
  "inf:devices:join-held": [
    "credential",
    "Joins with, or forgets, the joining link the window holds",
  ],
  "inf:devices:leave": [
    "destructive",
    `${HERE.This} stops controlling the other ${COMPUTER.one} and starts over at its first launch`,
  ],
  "inf:devices:set-up-work": [
    "window",
    `The window of a ${COMPUTER.one} sets up its own work half there; device-fix-work asks it from the first mate's computer`,
  ],
  "inf:devices:open-sharing": [
    "window",
    `Opens the Sharing settings on the ${COMPUTER.one} whose window asked, to turn on Remote Login there`,
  ],
  "inf:devices:follow-added": [
    "window",
    `The window at a ${COMPUTER.one}'s first launch follows the first mate that added it, switching only itself`,
  ],
  "inf:devices:take-over": [
    "destructive",
    `A ${COMPUTER.one} that keeps a copy becomes the first mate's computer, confirmed with Touch ID or the password`,
  ],
  "inf:update:unsent": [
    "window",
    "A window telling its own app whether it holds words not yet sent, which holds that app's restart onto a newer version; nothing is set",
  ],
  "inf:cards:save-file": [
    "window",
    "Saves a card's file into Downloads on the computer whose window asked",
  ],
  "inf:cards:save-files": [
    "window",
    "Saves a card's files into one new folder in Downloads on the computer whose window asked",
  ],
  "inf:cards:open-saved-file": [
    "window",
    "Opens a saved card file on the computer whose window asked",
  ],
  "inf:secrets:export": [
    "credential",
    "Writes the Secrets' recovery file where the person chose; it holds what unlocks every secret",
  ],
  "inf:app:open-external": [
    "window",
    "Opens a page in the browser of the computer whose window asked; the first mate puts a link on a card",
  ],
  "inf:app:open-runbook-folder": [
    "window",
    "Shows a runbook's folder on the computer whose window asked",
  ],
  "inf:app:start-here": [
    "destructive",
    "Starts the app as this computer's own first mate after the command it followed stopped",
  ],
  "inf:app:restart-command": [
    "destructive",
    "Ends by force and starts again the command whose first mate does not answer, the first mate's own run included",
  ],
  "inf:app:stop-command": [
    "destructive",
    "Stops the first mate and crew a command started; the first mate runs inside what it would stop, and every crewmate stops mid-work",
  ],
  "inf:app:quit": [
    "destructive",
    "Ends the window's program, and the first mate with it where it runs there",
  ],
  "inf:keyboard:run": [
    "window",
    "A window command, such as the size keys, run in the window that asked; window-size sets the size itself",
  ],
  "inf:keyboard:save": [
    "window",
    "The keys installed in this computer's window, saved and installed whole there (docs/keyboard.md)",
  ],
  "inf:keyboard:panels": ["window", "The panels' commands the window installs with the catalog's"],
  "inf:keyboard:offer": [
    "window",
    "A key a panel's page offers, resolved only against a native press in that focused frame",
  ],
  "inf:keyboard:record": ["window", "Keyboard settings recording the person's own presses"],
  "inf:window:control": ["window", "The window's own minimize, maximize and close buttons"],
  "inf:app:choose-folder": [
    "window",
    "The system's folder picker on the computer the person is at",
  ],
  "inf:files:choose": ["window", "The system's file picker on the computer the person is at"],
  "inf:voice:mic-access": ["window", "Whether this computer lets the app use its microphone"],
  "inf:cards:take-notified": [
    "window",
    "The card a click on this computer's notification asked to open",
  ],
  "inf:voice:open-mic-settings": ["window", "Opens this computer's own microphone settings"],
  "inf:voice:warm-up": ["window", "Loads this computer's voice model while the person talks"],
  "inf:voice:transcribe": [
    "window",
    "One recording of the person's voice and its words, held in memory only",
  ],
  "inf:frames:mount": [
    "window",
    "The frame a card or panel draws in, served by the window's own program",
  ],
  "inf:frames:unmount": ["window", "Takes back a frame the window served"],
};

/**
 * Read the actual request schema, not a second inventory of settings: every
 * field of every argument, and of every variant of a union, so a selector's
 * object after it or a new variant cannot pass unclaimed. A selector
 * request (a choice, then its value) names its choices as fields.
 */
export function settingFields(request: { toJSONSchema: () => unknown }): string[] {
  type Node = {
    properties?: Record<string, { const?: unknown }>;
    enum?: unknown[];
    anyOf?: Node[];
    oneOf?: Node[];
    allOf?: Node[];
  };
  const schema = request.toJSONSchema() as { prefixItems?: Node[] };
  const items = schema.prefixItems ?? [];
  // A variant of a union keyed by its kind is a field of its own, kind=<its kind>.
  const fieldsOf = (node: Node): string[] => [
    ...Object.keys(node.properties ?? {}),
    ...(node.properties?.kind?.const !== undefined ? [`kind=${node.properties.kind.const}`] : []),
    ...[...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])].flatMap(fieldsOf),
  ];
  const fields = [...new Set(items.flatMap(fieldsOf))];
  if (fields.length) return fields;
  return (items[0]?.enum ?? []).map(String);
}

export function uncoveredSettings(
  fields: string[],
  claimed: string[],
  exceptions: Record<string, ActionException> = {},
): string[] {
  return fields.filter((field) => !claimed.includes(field) && !exceptions[field]?.[1].trim());
}

/** Changing requests with neither a catalog line nor an excuse, or an excuse for a request that does not change. */
export function unaccountedChanges(
  changing: readonly string[],
  covered: ReadonlySet<string>,
  exceptions: Partial<Record<string, ActionException>>,
): string[] {
  return [
    ...changing.filter((channel) => !covered.has(channel) && !exceptions[channel]),
    ...Object.keys(exceptions).filter(
      (channel) => !changing.includes(channel) || covered.has(channel),
    ),
  ];
}

/** Excuses whose ground is outside the closed set, or that give no words. */
export function groundlessExcuses(
  exceptions: Partial<Record<string, readonly [string, string]>>,
): string[] {
  return Object.entries(exceptions)
    .filter(
      ([, excuse]) =>
        !excuse ||
        !(EXCEPTION_GROUNDS as readonly string[]).includes(excuse[0]) ||
        !excuse[1].trim(),
    )
    .map(([channel]) => channel);
}
