import type { BrowserViewer } from "@core/browser/browserViews";
import { LOCAL_CLIENT } from "@core/connection/connection";
import { dialLocalDoor } from "@core/connection/localDoor";
import {
  HomeLink,
  type HomeLinkConnection,
  type HomeLinkOptions,
  type HomeLinkState,
} from "@core/devices/homeLink";
import type { DeviceGrant } from "@shared/devices";
import type { CoreInvokeChannel, InvokeResponse, PushChannel } from "@shared/ipc";
import { answerKeyReminders, answerWindowAsk, type WindowKeyReminders } from "@shared/windowAnswer";
import { WINDOW_ASK_LIVE, WINDOW_ASK_WORDS, WINDOW_ONLY_CHANNELS } from "@shared/windowAsks";
import { BrowserWatches, isBrowserWatchChannel } from "./browserWatches";
import { shownResetFor } from "./projectMoveReset";

/**
 * The window on the first mate's own computer as a view of it
 * (docs/view.md, "The window on the first mate's own computer"): every
 * core request the window makes goes over the connection, through the
 * local door, and every push the first mate makes comes back the same way,
 * as a view on another computer asks and hears. Admitted by the door's key,
 * it is no device on the list and asks what the window always could: every
 * request but a computer's work, as the captain himself, Secrets included.
 *
 * A task's browser is watched over the same connection, as one viewer for
 * every window here, and its pictures come back as the connection's `live`
 * frames. What only this process holds - its keys, frames, files and voice
 * - stays with the window and never crosses.
 */

type Link = Pick<HomeLink, "start" | "invoke" | "state" | "connection" | "close">;

export type LocalWindowOptions = {
  /** The local door's folder, which the window reads as any local client does. */
  door: string;
  /** Hands a push to this computer's windows; `replayed` marks one a welcome sent again after a drop. */
  broadcast: (channel: PushChannel, payload: unknown, replayed: boolean) => void;
  /** A welcome after the first that could not replay what the window missed: it reads everything again. */
  onReload?: () => void;
  /** A welcome after the first, replayed or not: the link came back after a drop. */
  onBack?: () => void;
  /** The door refused the window's key twice: the link has stopped dialing for good. */
  onLost?: () => void;
  /** The first mate welcomes the window, or no longer does. */
  onContact?: (inReach: boolean) => void;
  /** The first mate moved to another computer; the shell starts the window over as its window. */
  onMoved?: () => void;
  /**
   * Each welcome, on a connection the first mate never saw before: a drop
   * it dialed through at once changes no contact, and is still a new one.
   */
  onWelcome?: () => void;
  /** This computer's key reminder, which the first mate may ask this window to switch. */
  keyReminders?: () => WindowKeyReminders | null;
  /** Opens the link; tests stand in their own. */
  link?: (options: HomeLinkOptions) => Link;
};

/**
 * What the link dials with: the door names where and admits by its key, so
 * this carries no key of a device. The id is the connection's own word for
 * a client of the local door.
 */
const DOOR_GRANT: DeviceGrant = {
  at: "127.0.0.1:1",
  homeKey: "local",
  deviceId: LOCAL_CLIENT,
  kind: "view",
  key: "local",
  cert: "local",
};

/**
 * The waits between dials while the door does not answer. A first mate
 * starting, or starting again, opens its door a few seconds after the
 * window first dials: the window dials every tenth of a second for the ten
 * seconds it waits for a welcome, so it is welcomed as soon as the door
 * opens, then once a second, which the last wait repeats.
 */
const DOOR_RETRY_MS: readonly number[] = [
  ...Array.from({ length: 100 }, () => 100),
  250,
  500,
  1_000,
];

export class LocalWindow {
  private readonly link: Link;
  private readonly browsers: BrowserWatches;
  private welcomed: Promise<void>;
  private welcome: () => void = () => {};
  private closed = false;
  private welcomedOnce = false;
  /** `ready` stopped waiting before the first welcome, so the window read nothing yet. */
  private readBeforeWelcome = false;

  constructor(options: LocalWindowOptions) {
    this.welcomed = new Promise((resolve) => {
      this.welcome = resolve;
    });
    this.browsers = new BrowserWatches((channel, args) => this.link.invoke(channel, args));
    const open = options.link ?? ((linkOptions) => new HomeLink(linkOptions));
    this.link = open({
      grant: DOOR_GRANT,
      // The door's address and key are read again at each dial.
      dial: () => dialLocalDoor(options.door),
      // On one computer a drop is only a restart of the connection: dial again soon.
      retryMs: DOOR_RETRY_MS,
      // Both ends share one process, so a long stall holds both: ping slowly.
      pingMs: 30_000,
      onPush: (channel, payload, replayed) =>
        options.broadcast(channel as PushChannel, payload, replayed),
      onLive: (channel, payload) => {
        if (channel === "inf:browser:frame") this.browsers.show(payload);
        // The key reminder the first mate asked to switch: the rest of this
        // computer's look the first mate changes itself.
        if (channel === WINDOW_ASK_LIVE)
          void answerWindowAsk(
            payload,
            LOCAL_CLIENT,
            async (asked, args) => {
              if (!WINDOW_ONLY_CHANNELS.has(asked)) throw new Error(WINDOW_ASK_WORDS.notAsked);
              return answerKeyReminders(options.keyReminders?.(), asked, args);
            },
            (id, answer) => this.link.invoke("inf:view:answer", [id, answer]),
          );
        // A streamed reply piece or a tool's start or end, outside the numbering.
        if (channel === "inf:event") options.broadcast("inf:event", payload, false);
        // The computers' live readings, outside the numbering.
        if (channel === "inf:computers:resources")
          options.broadcast("inf:computers:resources", payload, false);
        // An open card's draft another window changed, outside the numbering.
        if (channel === "inf:cards:draft") options.broadcast("inf:cards:draft", payload, false);
      },
      onCaughtUp: (catchUp) => {
        // A new connection: the first mate forgot every watch with the last one.
        this.browsers.again();
        // The first welcome comes before the window reads anything; a later
        // reload means pushes the journal no longer held were missed.
        if (
          (catchUp === "reload" && this.welcomedOnce) ||
          (!this.welcomedOnce && this.readBeforeWelcome)
        )
          options.onReload?.();
        if (this.welcomedOnce) options.onBack?.();
        this.welcomedOnce = true;
        this.welcome();
        options.onWelcome?.();
      },
      // The first mate moved to another computer (docs/devices.md, "Moving the first mate").
      onMoved: () => {
        if (!this.closed) options.onMoved?.();
      },
      onState: (state: HomeLinkState) => {
        // Two refusals of the key stop the link for good (docs/view.md,
        // "Leave, and Remove at the other Mac"): the shell takes the window back.
        if (state.removed && !this.closed) options.onLost?.();
        if (!this.closed) options.onContact?.(state.contact === "in-reach");
      },
    });
    this.link.start();
  }

  /** Resolves once the first mate welcomed the window, or after `timeoutMs` regardless. */
  ready(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // A welcome after this finds a window that read nothing: it reads everything then.
        if (!this.welcomedOnce) this.readBeforeWelcome = true;
        resolve();
      }, timeoutMs);
      timer.unref?.();
      void this.welcomed.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  inReach(): boolean {
    return this.link.state().contact === "in-reach";
  }

  /** The connection open now, its welcome's number and when its dial began; null while none is open. */
  connection(): HomeLinkConnection | null {
    return this.link.connection();
  }

  /** The contract changes the first mate's welcome listed; null before its first welcome. */
  homeChanges(): readonly string[] | null {
    return this.link.state().homeChanges;
  }

  async dispatch<C extends CoreInvokeChannel>(
    channel: C,
    rawArgs: unknown[],
    viewer?: BrowserViewer,
  ): Promise<InvokeResponse<C>> {
    if (viewer && isBrowserWatchChannel(channel))
      return (await this.browsers.view(channel, rawArgs, viewer)) as InvokeResponse<C>;
    // The window's preload reads the answer against the contract, as before.
    const args = shownResetFor(channel, rawArgs, this.link.state().homeChanges);
    return (await this.link.invoke(channel, args)) as InvokeResponse<C>;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.browsers.clear();
    this.link.close();
  }
}
