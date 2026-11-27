import { createServer, type Server } from "node:http";
import type { BrowserViewer } from "@core/browser/browserViews";
import { contractChange, listsChange } from "@core/connection/contractChanges";
import {
  BROWSER_FROM_ANY_VIEW,
  DEVICES_FROM_A_VIEW,
  EVERY_VIEW_ASKS,
  PANELS_IN_EVERY_WINDOW,
} from "@core/connection/viewHello";
import { computerName } from "@core/devices/computerName";
import { dialHome } from "@core/devices/dial";
import { HomeLink, type HomeLinkOptions, type HomeLinkState } from "@core/devices/homeLink";
import type { Joined, JoinedHome } from "@core/devices/joinedHome";
import type { HostNotifications } from "@core/host";
import { hostPlatform } from "@core/platform";
import type { FreshAuthentication } from "@core/secrets/approvals";
import { SIGN_IN_RETURN } from "@core/signInReturns";
import { AppFollowsHome } from "@core/update/appFollowsHome";
import type { UpdateChecker } from "@core/update/updateChecker";
import { ACTIONS } from "@shared/actions";
import { APP_FOLLOWS_HOME, APP_UPDATE_LIVE, appUpdateAskSchema } from "@shared/appFollow";
import {
  type FoldedInto16,
  hasSince16,
  homeAnswersUpdate,
  homeHearsWhileReading,
  sideToUpdate,
} from "@shared/contractFeatures";
import { HERE, HOME } from "@shared/deviceNames";
import { type DeviceFold, splitDialAddress, type ThisMac } from "@shared/devices";
import { replayedPointing } from "@shared/events";
import { HOME_UPDATE_STATUS, homeUpdateSchema } from "@shared/homeUpdate";
import {
  type CoreInvokeChannel,
  type InvokeResponse,
  isViewInvokeChannel,
  openPageSchema,
  PROTOCOL_VERSION,
  type PushChannel,
  parseInvokeRequest,
  signInEndedSchema,
  signInPageSchema,
} from "@shared/ipc";
import type { PanelSettingName } from "@shared/panelSettingNames";
import { panelSettingsNow } from "@shared/panelSettings";
import { personalSnapshotSchema } from "@shared/personal/manifest";
import { type ShellPreferences, shellPreferencesSchema } from "@shared/preferences";
import { HOME_GOODBYE_LIVE } from "@shared/standby";
import { answerKeyReminders, answerWindowAsk, type WindowKeyReminders } from "@shared/windowAnswer";
import { WINDOW_ASK_LIVE, WINDOW_ONLY_CHANNELS } from "@shared/windowAsks";
import {
  type DeviceWorkSetup,
  deviceWorkSetupSchema,
  WORK_SETUP_LIVE,
  type WorkSetupReport,
  workSetupAskSchema,
} from "@shared/workSetup";
import { BrowserWatches, isBrowserWatchChannel } from "./browserWatches";
import { skippedAnswersFor } from "./cardAnswerSkipped";
import { noteWordsUnheard, pressInputFor } from "./cardPressInput";
import { MacApprover, type MacApproverHost } from "./macApprover";
import { namedCards, namedHere, namedHereError } from "./namedHere";
import { shownResetFor } from "./projectMoveReset";
import { projectsListedFrom } from "./projectsListed";
import { ViewLook } from "./viewLook";
import { ViewNotices } from "./viewNotices";
import { type TakeOverOutcome, ViewTakeOver, viewTakeOverWords } from "./viewTakeOver";

/** A reset of the first mate's computer asked from here (`home-reset.md`, docs/reset.md). */
const HOME_RESET = contractChange("home-reset");

/**
 * The app as a view of another Mac (docs/view.md): the main process's
 * stand-in for the core it no longer runs. The window keeps every call it
 * makes; this decides who answers each one.
 *
 * - The core channels a view may ask (`reach: "views"`) go to the other Mac
 *   over the connection (`HomeLink`), as the captain at another Mac, and a
 *   page it would open for one of them opens here.
 * - This Mac's own look is answered here (`ViewLook`), and so is its own
 *   update notice: this Mac's installed app and the release page it opens.
 * - A task's browser is watched over that connection too, as one viewer for
 *   every window here: the other Mac sends this connection its pictures, and
 *   each goes to the windows that watch that task (docs/view.md, "A task's
 *   browser on a view").
 * - Everything else stays on the other Mac - its Secrets, voice, panels and
 *   Observe - and is refused here without being sent.
 *
 * Only the pushes a view shows reach the window; the other Mac's own look
 * is never one of them. A change asked while that Mac is out of reach is
 * refused at once and never sent later.
 *
 * Its cards notify on this Mac as they do on the other (docs/view.md,
 * "Notifications"): the same notifier reads the same card pushes, while
 * this Mac's window is in the background and the other Mac's own switch
 * is on.
 */

/**
 * The pushes a view shows, with what its Settings follow: a sign-in's steps,
 * the sign-ins where projects live, integrations, Diagnostics, and the
 * computers and phones with their sign-ins (`DEVICES_FROM_A_VIEW`). The
 * rest are the other Mac's own: its look, voice and panels.
 */
export const VIEW_PUSHES: ReadonlySet<PushChannel> = new Set<PushChannel>([
  "inf:event",
  "inf:cards",
  "inf:cards:thread",
  "inf:quota",
  "inf:models:changed",
  "inf:tasks",
  "inf:tasks:delta",
  "inf:auth:prompt",
  "inf:auth:notice",
  "inf:forges",
  "inf:integrations",
  "inf:sharing",
  "inf:devices",
  "inf:devices:addresses",
  "inf:devices:nearby",
  "inf:devices:sign-ins",
  "inf:devices:sign-in",
  "inf:computers:presence",
  "inf:computers:resources",
  // The captain's panels, drawn here from the first mate's own files.
  "inf:plugins:personal",
  "inf:plugins:db",
]);

/** A panel being built shows only in a window on the first mate's own computer. */
function withoutDrafts(payload: unknown): unknown {
  const snapshot = personalSnapshotSchema.safeParse(payload);
  if (!snapshot.success) return payload;
  const { drafts: _drafts, ...shown } = snapshot.data;
  return shown;
}

/** Channels answered from this Mac's own look. */
export const OWN_LOOK = new Set<CoreInvokeChannel>([
  "inf:shell:preferences",
  "inf:settings:appearance:get",
  "inf:settings:appearance:set",
  "inf:settings:layout:get",
  "inf:settings:layout:set",
]);

/** Channels about the app installed on this Mac: its update notice and release page. */
export const OWN_APP = new Set<CoreInvokeChannel>([
  "inf:update:status",
  "inf:update:check",
  "inf:update:channel",
  "inf:update:open-release",
  "inf:update:install",
  "inf:update:later",
]);

/** The pictures and project fonts this run has shown, by name, up to this many bytes; a name never changes its bytes. */
const PICTURE_CACHE_BYTES = 64 * 1024 * 1024;

/** The home folds a Mac's two entries into one (`devices-fold.md`). */
const DEVICES_FOLD = contractChange("devices-fold");

type Link = Pick<HomeLink, "start" | "invoke" | "state" | "leave" | "close">;

export type ViewBackendOptions = {
  joined: JoinedHome;
  record: Joined;
  /** Hands a push to this Mac's windows. */
  broadcast: (channel: PushChannel, payload: unknown) => void;
  /** This Mac's Notification Center, and whether its window is in front. */
  notifications: HostNotifications;
  /** What this app is changed; the window follows it. */
  onThisMac: (thisMac: ThisMac) => void;
  /** The other Mac took this one off its list. */
  onRemoved: () => void;
  /**
   * The first mate moved to this computer (docs/devices.md, "Moving the
   * first mate"): the window starts over as this computer's own first mate.
   */
  onMovedHere?: () => void;
  /** This Mac's own installed app's update checker. */
  updates: UpdateChecker;
  /**
   * Opens a page in this computer's browser: one the first mate would have
   * opened there (`inf:app:open-page`). Absent, such a page is not opened.
   */
  openPage?: (url: string) => Promise<void>;
  /**
   * The loopback address this computer catches a sign-in's return on
   * (docs/view.md, "A sign-in that returns to the first mate's computer"):
   * 127.0.0.1, as the provider sends the browser there; a test playing two
   * computers on one Linux PC gives another of its own addresses.
   */
  returnHost?: string;
  /**
   * The request that folds this window's entry into the one this Mac's work
   * keeps (`foldProof`, docs/devices.md, "One computer, one entry"), asked
   * once a welcome lists `devices-fold`; the home then removes this entry
   * and the window carries on as the other.
   */
  fold?: DeviceFold;
  /** Opens the link to the other Mac; tests stand in their own. */
  link?: (options: HomeLinkOptions) => Link;
  /**
   * How the link dials: for a Mac that Mac reaches over its own SSH, the
   * route this Mac's work keeps (docs/view.md, "A Mac that runs work");
   * by default every address the grant keeps, then `find`.
   */
  dial?: HomeLinkOptions["dial"];
  /**
   * What this Mac approves the other computer's Secrets uses with, made when
   * first needed (docs/secrets.md, "Remote decisions"); none, and an Allow
   * pressed here is refused with where to set this Mac up.
   */
  approver?: () => MacApproverHost | undefined;
  /**
   * What this computer confirms Take over with, where it is not the
   * approver's (docs/devices.md, "Taking over"): a Windows PC's Windows
   * Hello or Windows password. The approver's Touch ID or password when absent.
   */
  takeOverAuthentication?: () => FreshAuthentication | undefined;
  /** The system this computer runs, whose words Take over says; this process's own by default. */
  platform?: NodeJS.Platform;
  /** This Mac's own name, as it joined the other computer (`ownComputerName`); macOS's name for it by default. */
  name?: () => Promise<string>;
  /**
   * The version of Infinitary this app is, which its hello tells the other
   * computer (docs/devices.md, "Each copy's version"); unsaid when absent.
   */
  appVersion?: string;
  /**
   * The addresses heard announcing Infinitary on the local network, the
   * default dial's last way to that Mac (docs/devices.md, "Finding the home
   * again"); none when absent.
   */
  find?: () => Promise<readonly string[]>;
  /**
   * When this window carried on as the entry its Mac's work keeps, after the
   * entry it held was removed (`Shell`); the window says so.
   */
  carriedOn?: number;
  /**
   * The view this one carries on from (`Shell`): its catch-up count, so the
   * windows here catch up again at this connection's first welcome, and its
   * watches of tasks' browsers, asked again there.
   */
  from?: ViewBackend;
  /**
   * This Mac's own work folder, where it keeps a copy of the first mate's
   * record when the captain named it (docs/devices.md, "Taking over"); none
   * for a Mac that runs no work.
   */
  workDir?: string;
  /**
   * Each time the link to the other Mac is caught up, at the start too: a
   * Mac that runs work checks its work half then (docs/view.md, "A Mac that
   * runs work").
   */
  onConnected?: () => void;
  /** The other Mac's Fix it on this Mac's row: check the work half again. */
  onSetUpWork?: () => void;
  /** This Mac's own key reminder, which the first mate there may ask this window to switch. */
  keyReminders?: () => WindowKeyReminders | null;
  /**
   * Whether nobody uses this app now (docs/view.md, "Following the home's
   * version"): no window of it in front and none holding words not yet sent.
   * Absent, someone always does, so the app starts again only when asked.
   */
  nobodyHere?: () => boolean;
  /**
   * Whether a window of this app holds words not yet sent, which the home's
   * Update app waits for too. Absent, some always may, so it never starts again.
   */
  wordsLeft?: () => boolean;
};

/** What this Mac's window found of its work half, told to its home (`work-setup.md`). */
const WORK_SETUP = contractChange("work-setup");
/** Newer saved work and a copy that was gone, in a work report (`work-setup-newer-work.md`). */
const WORK_SETUP_NEWER = contractChange("work-setup-newer-work");

/** A work report as a home reads it: one from before hears neither newer saved work nor a copy that was gone. */
function toldHome(
  report: WorkSetupReport,
  changes: Parameters<typeof listsChange>[0],
): WorkSetupReport {
  if (listsChange(changes, WORK_SETUP_NEWER)) return report;
  const { copyGone: _gone, ...before } = report;
  return before.reason === "newer-work" ? { ...before, reason: "not-reached" } : before;
}

/** A window that says whether it is in front (`window-front.md`). */
const WINDOW_FRONT = contractChange("window-front");

/** An app that follows its home's version and tells it each step (`app-follows-home.md`). */
const APP_FOLLOWS = contractChange(APP_FOLLOWS_HOME);

export class ViewBackend {
  readonly look: ViewLook;
  private readonly link: Link;
  private readonly notices: ViewNotices;
  private readonly approver: MacApprover;
  /** The other Mac's cards as last heard, named here, before this Mac's approver shapes them. */
  private cardsHeard: unknown;
  private readonly joined: JoinedHome;
  private readonly record: Joined;
  private caughtUp = 0;
  /** The times the link came back after a drop, replayed or not (`ThisMac`'s `linkBack`). */
  private linkBack = 0;
  /** Whether the link was welcomed before, so the next welcome is a return. */
  private welcomedOnce = false;
  /** A return counted that the window has not been told yet. */
  private linkBackUntold = false;
  /** The pushes a replaying welcome sent again are still arriving. */
  private replaying = false;
  private readonly pictures = new Map<string, Uint8Array>();
  private pictureBytes = 0;
  private seeding: Promise<void> | null = null;
  private disposed = false;
  /** Whether this Mac's window is in front, as it last said (`front`). */
  private inFront = false;
  /** The fold was asked on this view (`foldOnce`). */
  private folded = false;
  /**
   * Each task's browser a window here watches: the other Mac hears one
   * watch per task, asked again whenever this connection is welcomed again.
   */
  private readonly browsers: BrowserWatches;
  /** The sign-in there whose return this computer waits for, and its listener while it has one. */
  private signInReturn: { id: string; caught: boolean; server: Server | null } | null = null;
  /** Take over from the copy this Mac keeps, while the first mate is out of reach. */
  private readonly taking: ViewTakeOver | null;
  /** What this Mac's own check last found of its work half (`workSetupFound`). */
  private workFound: WorkSetupReport | null = null;
  /** What the other Mac's list says of this Mac's work: whether it is in reach, and why not. */
  private workThere: { inReach: boolean; workSetup?: DeviceWorkSetup } | null = null;
  /** This app catching up with the other Mac's version (docs/view.md, "Following the home's version"). */
  private readonly follows: AppFollowsHome;

  constructor(private readonly options: ViewBackendOptions) {
    this.joined = options.joined;
    this.record = options.record;
    this.look = new ViewLook(options.joined, (value) =>
      options.broadcast("inf:shell:preferences", value),
    );
    this.notices = new ViewNotices(options.notifications, (channel, args) =>
      this.link.invoke(channel, args),
    );
    this.approver = new MacApprover({
      host: () => options.approver?.(),
      label: () => (options.name ? options.name() : computerName()),
      home: () => this.homeName(),
      invoke: (channel, args) => this.link.invoke(channel, args),
      // The window's cards follow whether this Mac approves.
      changed: () => {
        if (this.cardsHeard !== undefined)
          options.broadcast("inf:cards", this.approver.shown(this.cardsHeard));
      },
    });
    this.browsers = new BrowserWatches(
      (channel, args) => this.link.invoke(channel, args),
      () => this.homeLacks(BROWSER_FROM_ANY_VIEW),
    );
    if (options.from) {
      this.caughtUp = options.from.caughtUp;
      this.linkBack = options.from.linkBack;
      options.from.browsers.handTo(this.browsers);
    }
    this.taking =
      options.workDir && options.record.grant.kind === "mac"
        ? new ViewTakeOver({
            workDir: options.workDir,
            deviceId: options.record.grant.deviceId,
            authentication: () =>
              options.takeOverAuthentication?.() ?? options.approver?.()?.authentication,
            words: viewTakeOverWords(options.platform ?? hostPlatform()),
            started: () => options.onMovedHere?.(),
            changed: () => this.changed(),
          })
        : null;
    this.follows = new AppFollowsHome({
      updates: options.updates,
      homeVersion: () => this.homeAppVersion(),
      tell: (report) => {
        if (this.disposed || !listsChange(this.link.state().homeChanges, APP_FOLLOWS)) return;
        this.link.invoke("inf:devices:app-follow", [report]).catch((error: unknown) => {
          console.warn(
            `[view] could not tell the other Mac how this app catches up: ${String(error)}`,
          );
        });
      },
      nobodyHere: () => options.nobodyHere?.() ?? false,
      wordsLeft: () => options.wordsLeft?.() ?? true,
    });
    const open = options.link ?? ((linkOptions) => new HomeLink(linkOptions));
    this.link = open({
      grant: options.record.grant,
      // A Mac that also runs this home's work says this connection controls it.
      as: "view",
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
      dial:
        options.dial ??
        ((grant, reached) =>
          dialHome(grant, { reached, ...(options.find ? { find: options.find } : {}) })),
      // Every address that Mac offers, kept for the next time this Mac starts.
      onRoutes: (routes) => {
        try {
          this.joined.routes(routes.at, routes.also);
        } catch (error) {
          console.warn(`[view] could not keep where the other computer listens: ${String(error)}`);
        }
      },
      // A home a move left behind is never this Mac's again; a move is followed.
      homeNumber: options.joined.homeNumber(),
      onHomeNumber: (homeNumber) => {
        try {
          this.joined.keepHomeNumber(homeNumber);
        } catch (error) {
          console.warn(`[view] could not keep the home number: ${String(error)}`);
        }
      },
      // A second home with the same number but another takeover is refused and asked about.
      heardTakeOver: options.joined.heardTakeOver(),
      onTakeOver: (heard) => {
        try {
          this.joined.keepHeardTakeOver(heard);
        } catch (error) {
          console.warn(`[view] could not keep the takeover: ${String(error)}`);
        }
      },
      onMoved: (moved) => {
        if (moved.to === options.record.grant.deviceId) options.onMovedHere?.();
      },
      onPush: (channel, pushed, replayed) => {
        // The first mate's own cards name its computer where they say this computer.
        if (channel === "inf:cards") this.cardsHeard = namedCards(pushed, () => this.homeName());
        const payload = channel === "inf:cards" ? this.approver.shown(this.cardsHeard) : pushed;
        // A use or the captain's switch for this Mac changed there.
        if (channel === "inf:secrets:changed") void this.approver.refresh();
        if (channel === "inf:cards") this.notices.observe(payload);
        if (channel === "inf:app:open-page") this.openPage(payload, replayed);
        if (channel === "inf:app:sign-in-page") void this.openSignInPage(payload, replayed);
        if (channel === "inf:app:sign-in-ended") this.signInEnded(payload);
        // The first mate's look stays its own; only its panels switch is heard here.
        if (channel === "inf:shell:preferences") this.heardPanels(payload);
        if (channel === "inf:devices") this.heardDevices(payload);
        if (VIEW_PUSHES.has(channel as PushChannel) && !replayedPointing(channel, pushed, replayed))
          options.broadcast(
            channel as PushChannel,
            channel === "inf:plugins:personal" ? withoutDrafts(payload) : payload,
          );
      },
      onLive: (channel, payload) => {
        if (channel === "inf:browser:frame") this.browsers.show(payload);
        // The first mate's computer is going to sleep: Take over says so.
        if (channel === HOME_GOODBYE_LIVE) this.taking?.heardGoodbye();
        // Update app on this app's row there: catch up now, and start again once no words are left unsent.
        if (channel === APP_UPDATE_LIVE) {
          const ask = appUpdateAskSchema.safeParse(payload);
          if (ask.success && ask.data.deviceId === options.record.grant.deviceId)
            this.follows.askedNow();
        }
        // Fix it on this Mac's row there.
        if (channel === WORK_SETUP_LIVE) {
          const ask = workSetupAskSchema.safeParse(payload);
          if (ask.success && ask.data.deviceId === options.record.grant.deviceId)
            options.onSetUpWork?.();
        }
        // A Settings change the first mate there asked of this Mac's own window.
        if (channel === WINDOW_ASK_LIVE)
          void answerWindowAsk(
            payload,
            options.record.grant.deviceId,
            (asked, args) =>
              WINDOW_ONLY_CHANNELS.has(asked)
                ? Promise.resolve(answerKeyReminders(options.keyReminders?.(), asked, args))
                : this.dispatch(asked as CoreInvokeChannel, [...args]),
            (id, answer) => this.link.invoke("inf:view:answer", [id, answer]),
          );
        // A streamed reply piece or a tool's start or end, outside the numbering.
        if (channel === "inf:event") options.broadcast("inf:event", payload);
        // The computers' live readings, outside the numbering.
        if (channel === "inf:computers:resources")
          options.broadcast("inf:computers:resources", payload);
        // An open card's draft another window changed, outside the numbering.
        if (channel === "inf:cards:draft") options.broadcast("inf:cards:draft", payload);
      },
      // Counted before the state turns in reach, and said with it, so the
      // window goes from out of reach to catching up with no moment of live
      // between.
      onWelcoming: (catchUp, missed) => {
        this.replaying = catchUp === "replay" && missed > 0;
        if (catchUp === "reload") this.caughtUp += 1;
        // A return, replayed or not and however short the drop: the window
        // asks its one-time reads again, live pushes it missed among them.
        if (this.welcomedOnce) {
          this.linkBack += 1;
          this.linkBackUntold = true;
        }
        this.welcomedOnce = true;
      },
      onCaughtUp: (catchUp) => {
        // A return within the link's grace changes no state, so it is said here.
        if (this.linkBackUntold) this.changed();
        this.taking?.heardAgain();
        // The first mate there forgot it with the last connection.
        if (this.inFront) this.sayFront(true);
        if (!this.look.seeded()) void this.seedLook();
        void this.readPanels();
        void this.approver.refresh();
        // A new connection: the other Mac forgot every watch with the last one.
        this.browsers.again();
        options.onConnected?.();
        // A home on a newer version has this app follow it.
        this.follows.connected();
        // Read again whole - at the start too - what the other Mac holds is
        // old news here, as restored cards are there. A replay needs
        // nothing: the missed pushes follow, and a card that became ready
        // while this Mac could not hear it is news.
        if (catchUp === "reload") {
          // Whether the sign-in there still waits is not known: its page again starts anew.
          this.endSignInReturn();
          this.notices.startOver();
        }
      },
      // Catching up with the other Mac's version ends with the connection it read it on.
      onDropped: () => this.follows.lost(),
      onReplayed: () => {
        if (!this.replaying) return;
        this.replaying = false;
        this.changed();
      },
      onState: (state) => this.followed(state),
    });
    this.link.start();
  }

  private homeAddress(): string {
    const at = this.joined.read()?.grant.at ?? this.record.grant.at;
    return splitDialAddress(at)?.host ?? at;
  }

  /** The other Mac's name: as it says it, as it was saved when this Mac joined, or its address. */
  private homeName(): string {
    return (
      this.link.state().name ?? this.joined.read()?.name ?? this.record.name ?? this.homeAddress()
    );
  }

  thisMac(): ThisMac {
    const state = this.link.state();
    return {
      role: "view",
      name: this.homeName(),
      address: this.homeAddress(),
      joinedAt: this.record.joinedAt,
      contact: state.contact,
      readOnly: readOnly(state),
      ...(readOnly(state) !== null &&
      homeHearsWhileReading(state.homeVersion ?? undefined, state.homeChanges)
        ? { messagesWhileReading: true as const }
        : {}),
      ...(homeAnswersUpdate(state.homeVersion, state.homeChanges)
        ? { homeUpdates: true as const }
        : {}),
      ...(listsChange(state.homeChanges, HOME_RESET) ? { homeResets: true as const } : {}),
      heardAt: state.heardAt,
      caughtUp: this.caughtUp,
      ...(this.linkBack > 0 ? { linkBack: this.linkBack } : {}),
      ...(this.replaying ? { replaying: true as const } : {}),
      ...(this.record.grant.kind === "mac" ? { runsWork: true } : {}),
      ...(this.options.carriedOn !== undefined
        ? { carriedOn: { at: this.options.carriedOn } }
        : {}),
      ...(() => {
        const workSetup = this.workSetup();
        return workSetup ? { workSetup } : {};
      })(),
      ...(this.homeLacks(EVERY_VIEW_ASKS) ? { needsUpdateThere: true as const } : {}),
      ...(this.homeLacks(BROWSER_FROM_ANY_VIEW) ? { browserNeedsUpdateThere: true as const } : {}),
      ...(this.homeLacks(DEVICES_FROM_A_VIEW) ? { devicesNeedUpdateThere: true as const } : {}),
      ...(this.homeLacks(SIGN_IN_RETURN) ? { returnsNeedUpdateThere: true as const } : {}),
      ...(this.signInReturn
        ? { signInReturn: { id: this.signInReturn.id, caught: this.signInReturn.caught } }
        : {}),
      ...(() => {
        const takeOver = this.taking?.offer(state.contact);
        return takeOver ? { takeOver } : {};
      })(),
      ...(state.twoHomes ? { twoHomes: { name: state.twoHomes.name } } : {}),
      ...(() => {
        const steppedDown = this.joined.steppedDown();
        return steppedDown ? { steppedDown } : {};
      })(),
    };
  }

  /**
   * The captain's Take over (docs/devices.md, "Taking over"), confirmed with
   * Touch ID or the password, then asked of this Mac's own work.
   */
  async takeOver(): Promise<TakeOverOutcome> {
    if (!this.taking)
      return {
        ok: false,
        text: viewTakeOverWords(this.options.platform ?? hostPlatform()).noOffer,
      };
    return this.taking.takeOver(this.link.state().contact, this.homeName());
  }

  async dispatch<C extends CoreInvokeChannel>(
    channel: C,
    rawArgs: unknown[],
    viewer?: BrowserViewer,
  ): Promise<InvokeResponse<C>> {
    if (OWN_LOOK.has(channel)) return (await this.ownLook(channel, rawArgs)) as InvokeResponse<C>;
    if (channel === "inf:settings:current")
      return (await this.settingsNow(rawArgs)) as InvokeResponse<C>;
    if (OWN_APP.has(channel)) return (await this.ownApp(channel, rawArgs)) as InvokeResponse<C>;
    if (viewer && isBrowserWatchChannel(channel))
      return (await this.browsers.view(channel, rawArgs, viewer)) as InvokeResponse<C>;
    if (!isViewInvokeChannel(channel))
      throw new Error(`${channel} is answered only on ${HOME.the}.`);
    // An Allow on a Secrets use is this Mac's own signed answer, never a press there.
    if (
      channel === "inf:cards:act" &&
      typeof rawArgs[0] === "string" &&
      typeof rawArgs[1] === "string"
    ) {
      const answered = await this.approver.act(rawArgs[0], rawArgs[1]);
      if (answered) return answered as InvokeResponse<C>;
    }
    // An older home strips unknown command settings, potentially preserving an old key.
    const commandInput =
      channel === "inf:accounts:custom:connect"
        ? rawArgs[0]
        : channel === "inf:devices:custom:connect"
          ? rawArgs[1]
          : undefined;
    if (
      commandInput &&
      typeof commandInput === "object" &&
      "tokenCommand" in commandInput &&
      !this.homeHas("custom-token-command")
    )
      throw new Error(`Update Infinitary on ${HOME.the} before saving a token command.`);
    if (noteWordsUnheard(channel, rawArgs, this.link.state().homeChanges))
      throw new Error(
        `Update Infinitary on ${HOME.the} before words go with this button. Send them with Chat first.`,
      );
    // The window's preload reads the answer against the contract, as it reads this Mac's own,
    // with the other Mac's own words naming it where they say this computer.
    const name = () => this.homeName();
    try {
      const homeChanges = this.link.state().homeChanges;
      if (channel === "inf:forges:projects-listed")
        return namedHere(
          channel,
          await projectsListedFrom(homeChanges, rawArgs[0], {
            listed: (args) =>
              this.link.invoke(channel, args) as Promise<
                InvokeResponse<"inf:forges:projects-listed">
              >,
            projects: (args) =>
              this.link.invoke("inf:forges:projects", args) as Promise<
                InvokeResponse<"inf:forges:projects">
              >,
          }),
          name,
        ) as InvokeResponse<C>;
      const args = skippedAnswersFor(
        channel,
        pressInputFor(channel, shownResetFor(channel, rawArgs, homeChanges), homeChanges),
        homeChanges,
      );
      return namedHere(channel, await this.link.invoke(channel, args), name) as InvokeResponse<C>;
    } catch (caught) {
      throw namedHereError(caught, name);
    }
  }

  /** A card picture by its name, from the other Mac, kept for this run. */
  async picture(fileName: string): Promise<Uint8Array> {
    const kept = this.pictures.get(fileName);
    if (kept) return kept;
    const answer = (await this.link.invoke("inf:cards:picture", [
      fileName,
    ])) as InvokeResponse<"inf:cards:picture">;
    const bytes = new Uint8Array(Buffer.from(answer.data, "base64"));
    this.keepPicture(fileName, bytes);
    return bytes;
  }

  /**
   * A project font by its name, from the other Mac (`inf:cards:typeface`),
   * kept for this run with the pictures.
   */
  async typeface(fileName: string): Promise<Uint8Array> {
    const kept = this.pictures.get(fileName);
    if (kept) return kept;
    const answer = (await this.link.invoke("inf:cards:typeface", [
      fileName,
    ])) as InvokeResponse<"inf:cards:typeface">;
    const bytes = new Uint8Array(Buffer.from(answer.data, "base64"));
    this.keepPicture(fileName, bytes);
    return bytes;
  }

  /**
   * A piece of a card's demo recording by its name, from the other Mac
   * (`inf:cards:media`): never kept, since a player asks for what it needs.
   */
  async recordingPiece(
    fileName: string,
    offset: number,
    length: number,
  ): Promise<{ data: Uint8Array; size: number }> {
    const answer = (await this.link.invoke("inf:cards:media", [
      fileName,
      offset,
      length,
    ])) as InvokeResponse<"inf:cards:media">;
    return { data: new Uint8Array(Buffer.from(answer.data, "base64")), size: answer.size };
  }

  /**
   * Leave: tells the other Mac when it is in reach, then stops. True when
   * that Mac heard it.
   */
  async leave(): Promise<boolean> {
    if (this.disposed) return false;
    return this.link.leave();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.taking?.dispose();
    this.follows.dispose();
    this.notices.stop();
    this.browsers.clear();
    this.signInReturn?.server?.close();
    this.signInReturn = null;
    this.link.close();
  }

  /**
   * Whether the first mate there has an addition major 16 folded in: it
   * speaks that major, or it is on major 15 and lists the addition's name
   * (`hasSince16`). False before any welcome.
   */
  private homeHas(name: FoldedInto16): boolean {
    const state = this.link.state();
    return hasSince16(state.homeVersion, state.homeChanges, name);
  }

  /**
   * This Mac's window came to the front or left it: the first mate there
   * pushes no card to a phone while it is in front (docs/phone-push.md).
   * Said again at each welcome, since the first mate forgets it as the
   * connection drops.
   */
  front(inFront: boolean): void {
    this.inFront = inFront;
    this.sayFront(inFront);
    if (!inFront) this.follows.noticed();
  }

  /**
   * Who uses this app may have changed, such as a window's words sent: a
   * version waiting for nobody to use it starts now if nobody does.
   */
  noticed(): void {
    this.follows.noticed();
  }

  /**
   * The version of Infinitary the other Mac runs, as its own update status
   * says it (`inf:home-update:status`, asked on every major); null from a
   * home too old to answer it.
   */
  private async homeAppVersion(): Promise<string | null> {
    const state = this.link.state();
    if (!homeAnswersUpdate(state.homeVersion, state.homeChanges)) return null;
    const parsed = homeUpdateSchema.safeParse(await this.link.invoke(HOME_UPDATE_STATUS, []));
    return parsed.success ? parsed.data.version : null;
  }

  /** A first mate from before the request is not told, and its phone pushes as it did. */
  private sayFront(inFront: boolean): void {
    if (this.disposed || !listsChange(this.link.state().homeChanges, WINDOW_FRONT)) return;
    this.link.invoke("inf:window:front", [inFront]).catch(() => {
      // Out of reach: the first mate forgot it, and the next welcome says it again.
    });
  }

  /**
   * What this Mac's own check found of its work half (`setUpWork`): kept for
   * the window's notice, and told to the other Mac for its row when it
   * listens for it (`work-setup.md`). Null when there is nothing to say.
   */
  workSetupFound(report: WorkSetupReport | null): void {
    this.workFound = report;
    this.changed();
    const changes = this.link.state().homeChanges;
    if (!report || !listsChange(changes, WORK_SETUP)) return;
    this.link
      .invoke("inf:devices:work-setup", [toldHome(report, changes)])
      .catch((error: unknown) => {
        console.warn(`[view] could not say what this Mac found of its work: ${String(error)}`);
      });
  }

  /**
   * What the window says of this Mac's work half: nothing once the other
   * Mac has it in reach; otherwise why this Mac's own check could not set it
   * up, or why the other Mac finds it has not reached it.
   */
  private workSetup(): DeviceWorkSetup | undefined {
    if (this.record.grant.kind !== "mac" || this.workThere?.inReach) return undefined;
    if (this.workFound?.state === "blocked")
      return { state: "blocked", reason: this.workFound.reason ?? "not-reached" };
    if (this.workThere?.workSetup) return this.workThere.workSetup;
    return this.workFound?.state === "starting" ? { state: "starting" } : undefined;
  }

  private heardDevices(payload: unknown): void {
    if (!Array.isArray(payload)) return;
    const id = this.record.grant.deviceId;
    const row = payload.find(
      (entry): entry is { id: string; inReach?: unknown; workSetup?: unknown } =>
        typeof entry === "object" && entry !== null && (entry as { id?: unknown }).id === id,
    );
    const parsed = deviceWorkSetupSchema.safeParse(row?.workSetup);
    this.workThere = row
      ? { inReach: row.inReach === true, ...(parsed.success ? { workSetup: parsed.data } : {}) }
      : null;
    this.changed();
  }

  /** A first mate there that is known, from its welcome, not to have such an addition. */
  private homeLacks(name: FoldedInto16): boolean {
    return this.link.state().homeChanges !== null && !this.homeHas(name);
  }

  /**
   * A panel's `settings.current` here: a line this Mac's own look holds
   * (`OWN_LOOK`) is read from it, as this window shows it, and only the rest
   * is asked of the other Mac.
   */
  private async settingsNow(rawArgs: unknown[]): Promise<unknown> {
    const [names] = parseInvokeRequest("inf:settings:current", rawArgs);
    const ownLine = (name: PanelSettingName) =>
      OWN_LOOK.has(ACTIONS[name].current as CoreInvokeChannel);
    const there = names.filter((name) => !ownLine(name));
    const fromHome =
      there.length > 0 ? ((await this.link.invoke("inf:settings:current", [there])) as object) : {};
    const here = await panelSettingsNow(names.filter(ownLine), (name) =>
      this.ownLook(ACTIONS[name].current as CoreInvokeChannel, []),
    );
    return { ...fromHome, ...here };
  }

  private async ownLook(channel: CoreInvokeChannel, rawArgs: unknown[]): Promise<unknown> {
    // The window paints nothing until it has a look; a first one waits for
    // the other Mac's, which this Mac starts from.
    if (!this.look.seeded()) await this.seedLook();
    return answerOwnLook(this.look, channel, rawArgs);
  }

  /**
   * A page the first mate would have opened, opened here as it arrives. One
   * a welcome sent again after a drop is old news and is not opened.
   */
  private openPage(payload: unknown, replayed: boolean): void {
    if (replayed || !this.options.openPage) return;
    const page = openPageSchema.safeParse(payload);
    if (!page.success) return;
    void this.options.openPage(page.data.url).catch(() => {
      // The sign-in's own steps still offer its page to open by hand.
    });
  }

  /**
   * A sign-in page whose browser comes back to the other computer's loopback
   * address (docs/view.md, "A sign-in that returns to the first mate's
   * computer"): this computer listens on the same port of its own, then
   * opens the page here. What the browser brings back goes to the other
   * computer, and its answer back to the browser. When the port is taken
   * here, Settings asks for the address the browser ended on instead.
   */
  private async openSignInPage(payload: unknown, replayed: boolean): Promise<void> {
    if (replayed || !this.options.openPage || this.disposed) return;
    const page = signInPageSchema.safeParse(payload);
    if (!page.success) return;
    this.endSignInReturn();
    const { id, port, url } = page.data;
    const waiting: { id: string; caught: boolean; server: Server | null } = {
      id,
      caught: false,
      server: null,
    };
    this.signInReturn = waiting;
    const server = createServer((request, response) => {
      if (request.method !== "GET") {
        response.writeHead(405, { connection: "close" }).end();
        return;
      }
      void this.handBack(waiting, request.url ?? "/").then(({ status, page: answer }) => {
        response.writeHead(status, {
          "content-type": "text/html; charset=utf-8",
          connection: "close",
        });
        response.end(answer);
      });
    });
    waiting.caught = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, this.options.returnHost ?? "127.0.0.1", () => resolve(true));
    });
    if (this.signInReturn !== waiting) {
      server.close();
      return;
    }
    if (waiting.caught) waiting.server = server;
    this.changed();
    void this.options.openPage(url).catch(() => {
      // The sign-in's own steps still offer its page again.
    });
  }

  /** Hands the browser's return to the other computer, answering the page it said. */
  private async handBack(
    waiting: { id: string; caught: boolean; server: Server | null },
    address: string,
  ): Promise<{ status: number; page: string }> {
    try {
      const answer = (await this.link.invoke("inf:integrations:sign-in-return", [
        { id: waiting.id, address },
      ])) as InvokeResponse<"inf:integrations:sign-in-return">;
      // Taken once: nothing else reaches the other computer through here.
      if (answer.status === 200) {
        waiting.server?.close();
        waiting.server = null;
      }
      return answer;
    } catch (refusal) {
      // Out of reach, or no longer waiting: Settings asks for the address.
      if (this.signInReturn === waiting && waiting.caught) {
        waiting.caught = false;
        this.changed();
      }
      return { status: 502, page: returnLostPage((refusal as Error).message) };
    }
  }

  private signInEnded(payload: unknown): void {
    const ended = signInEndedSchema.safeParse(payload);
    if (!ended.success || this.signInReturn?.id !== ended.data.id) return;
    this.endSignInReturn();
  }

  private endSignInReturn(): void {
    const waiting = this.signInReturn;
    if (!waiting) return;
    this.signInReturn = null;
    waiting.server?.close();
    waiting.server?.closeAllConnections();
    this.changed();
  }

  /**
   * This Mac's own update notice, never the other Mac's: a newer Firstmate
   * there asks this Mac to update, and this is where it finds how.
   */
  private ownApp(channel: CoreInvokeChannel, rawArgs: unknown[]): Promise<unknown> {
    return answerOwnApp(this.options.updates, channel, rawArgs);
  }

  /**
   * The first mate's panels switch, read at every welcome (docs/view.md,
   * "Panels in every window"): a first mate that sends no panel's files
   * yet leaves them off here, as before.
   */
  private async readPanels(): Promise<void> {
    if (!this.homeHas(PANELS_IN_EVERY_WINDOW)) {
      this.look.heardPanels(null);
      return;
    }
    try {
      this.heardPanels(await this.link.invoke("inf:shell:preferences", []));
    } catch {
      // Out of reach: the next welcome reads it.
    }
  }

  /**
   * A switch heard before this Mac has a look of its own waits for the
   * seed: told at once, it would paint the window in the catalog's look
   * before the other Mac's saved one arrives. Each waits on the same seed,
   * so they are told in the order heard; none is told once this view is
   * gone, when closing refuses the seed.
   */
  private heardPanels(payload: unknown): void {
    if (!this.homeHas(PANELS_IN_EVERY_WINDOW)) return;
    const heard = shellPreferencesSchema.safeParse(payload);
    if (!heard.success) return;
    const { panels } = heard.data;
    if (this.look.seeded()) this.look.heardPanels(panels);
    else
      void this.seedLook().then(() => {
        if (!this.disposed) this.look.heardPanels(panels);
      });
  }

  /** Takes the other Mac's look once, when this Mac has none of its own yet. */
  private seedLook(): Promise<void> {
    this.seeding ??= this.link
      .invoke("inf:shell:preferences", [])
      .then((value) => {
        const parsed: ShellPreferences = shellPreferencesSchema.parse(value);
        this.look.seed({ appearance: parsed.appearance, layout: parsed.layout });
      })
      .catch(() => {
        // Out of reach: the defaults stand in until it is back.
      })
      .finally(() => {
        this.seeding = null;
      });
    return this.seeding;
  }

  private followed(state: HomeLinkState): void {
    if (state.name) {
      try {
        this.joined.name(state.name);
      } catch {
        // Said again at the next welcome.
      }
    }
    if (state.removed) {
      this.options.onRemoved();
      return;
    }
    if (state.contact === "in-reach") this.foldOnce(state);
    // A replay cut short ends with the connection; the next welcome says again.
    if (state.contact === "lost" || state.contact === "closed") this.replaying = false;
    this.changed();
  }

  /** Asks the fold once per view, of a home that lists it; a refusal leaves both entries as they are. */
  private foldOnce(state: HomeLinkState): void {
    const fold = this.options.fold;
    if (!fold || this.folded || !listsChange(state.homeChanges, DEVICES_FOLD)) return;
    this.folded = true;
    this.link.invoke("inf:devices:fold", [fold]).catch(() => {
      // Refused or out of reach: the next launch asks again.
    });
  }

  private changed(): void {
    this.linkBackUntold = false;
    if (!this.disposed) this.options.onThisMac(this.thisMac());
  }

  private keepPicture(fileName: string, bytes: Uint8Array): void {
    if (bytes.byteLength > PICTURE_CACHE_BYTES) return;
    this.pictures.set(fileName, bytes);
    this.pictureBytes += bytes.byteLength;
    for (const [name, kept] of this.pictures) {
      if (this.pictureBytes <= PICTURE_CACHE_BYTES) break;
      this.pictures.delete(name);
      this.pictureBytes -= kept.byteLength;
    }
  }
}

export function answerOwnLook(
  look: ViewLook,
  channel: CoreInvokeChannel,
  rawArgs: unknown[],
): unknown {
  switch (channel) {
    case "inf:shell:preferences":
      return look.get();
    case "inf:settings:appearance:get":
      return look.get().appearance;
    case "inf:settings:layout:get":
      return look.get().layout;
    case "inf:settings:appearance:set": {
      const [appearance] = parseInvokeRequest("inf:settings:appearance:set", rawArgs);
      return look.setAppearance(appearance);
    }
    case "inf:settings:layout:set": {
      const [layout] = parseInvokeRequest("inf:settings:layout:set", rawArgs);
      return look.setLayout(layout);
    }
    default:
      throw new Error(`${channel} is not ${HERE.this}'s own.`);
  }
}

export async function answerOwnApp(
  updates: UpdateChecker,
  channel: CoreInvokeChannel,
  rawArgs: unknown[],
): Promise<unknown> {
  switch (channel) {
    case "inf:update:channel": {
      const [next] = parseInvokeRequest("inf:update:channel", rawArgs);
      if (!updates.setChannel)
        throw new Error("This installation does not support changing its update channel here.");
      return updates.setChannel(next);
    }
    case "inf:update:status":
      return updates.getStatus();
    case "inf:update:check":
      return updates.checkNow();
    case "inf:update:open-release":
      await updates.openReleasePage();
      return { ok: true };
    case "inf:update:install":
      return updates.install();
    case "inf:update:later":
      return updates.later?.() ?? updates.getStatus();
    default:
      throw new Error(`${channel} is not ${HERE.this}'s own.`);
  }
}

/**
 * The page the browser shows when its return could not reach the first
 * mate's computer: what happened, and the way through Settings.
 */
function returnLostPage(why: string): string {
  const words = `${why} If Infinitary is still waiting, copy this page's address and paste it in Settings, Integrations.`;
  const escaped = words.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><meta charset="utf-8"><title>Infinitary</title><body style="font:15px system-ui;margin:3em">${escaped}</body>`;
}

/** Whether the two Firstmates are too far apart for this Mac to make changes, and which is newer. */
function readOnly(state: HomeLinkState): "newer-there" | "older-there" | null {
  if (!state.access || !state.homeVersion) return null;
  const side = sideToUpdate(state.access, PROTOCOL_VERSION, state.homeVersion);
  return side === "home" ? "older-there" : side === "this" ? "newer-there" : null;
}
