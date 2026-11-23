import { type FoldedInto16, hasSince16 } from "@shared/contractFeatures";
import {
  AMBIENT_AWAY,
  AMBIENT_MUSIC,
  AMBIENT_OWN_STYLES,
  AMBIENT_PAUSE,
  AMBIENT_STYLE,
  DEVICE_ADDS_BY_ADDRESS,
  SETTINGS_CURRENT,
  WORK_UPDATE_SAVING,
} from "./cardCompatibility";
import { listsChange } from "./contractChanges";

/**
 * The additions major 16 folded in that a home and a view still check of
 * each other by their historical names (`hasSince16`,
 * src/shared/contractFeatures.ts): a view within its floor may be on major
 * 15, and so may the home a view on this major meets.
 */

/** One rule for every view: a home answers it every request whose reach is `views`. */
export const EVERY_VIEW_ASKS = "every-view-asks" satisfies FoldedInto16;

/** A view asks the home's computers, phones and Knowledge. */
export const DEVICES_FROM_A_VIEW = "devices-from-a-view" satisfies FoldedInto16;

/**
 * Any view asks every request of a task's browser, and the home sends its
 * pictures as `live` frames.
 */
export const BROWSER_FROM_ANY_VIEW = "browser-from-any-view" satisfies FoldedInto16;

/** A view draws the captain's panels from the home's own files. */
export const PANELS_IN_EVERY_WINDOW = "panels-in-every-window" satisfies FoldedInto16;

/**
 * Streamed reply pieces and tool starts and ends go to a view as `live`
 * frames, outside the numbering, and to a phone not at all.
 */
export const STREAMED_EVENTS_LIVE = "streamed-events-live" satisfies FoldedInto16;

/**
 * The computers' live processor and memory readings go to a view as `live`
 * frames, outside the numbering, and to a phone not at all.
 */
export const COMPUTER_READINGS_LIVE = "computer-readings-live" satisfies FoldedInto16;

/** What a view's hello says of what it reads: its contract, its system and the changes it lists. */
export type ViewHello = { protocolVersion: string; system?: string; changes?: readonly string[] };

/**
 * Whether a view has an addition major 16 folded in. A computer that speaks
 * that major has every one, and an older one within the floor has what its
 * hello lists by name. A phone has only what its hello lists, whatever it
 * speaks, because it lists what it draws.
 */
export function viewHas(hello: ViewHello, name: FoldedInto16): boolean {
  return hello.system === "ios"
    ? (hello.changes?.includes(name) ?? false)
    : hasSince16(hello.protocolVersion, hello.changes, name);
}

/**
 * How a view is sent a push that stays outside the numbering: as a `live`
 * frame, under the newest number for a view from before its change, or not at
 * all, as a phone, which never reads it.
 */
export type Unnumbered = "live" | "numbered" | "none";

export function unnumberedFor(hello: ViewHello, name: FoldedInto16): Unnumbered {
  if (hello.system === "ios") return "none";
  return viewHas(hello, name) ? "live" : "numbered";
}

/** The look's later choices and panel reads a view does not have, which it cannot read (`lookFor`). */
export function unreadLook(hello: ViewHello): string[] {
  return [
    ...(viewHas(hello, "language-choice") ? [] : ["language"]),
    ...(viewHas(hello, "font-choice") ? [] : ["fonts"]),
    ...(listsChange(hello.changes, AMBIENT_MUSIC) ? [] : ["ambientMusic", "ambientVolume"]),
    ...(listsChange(hello.changes, AMBIENT_PAUSE) ? [] : ["ambientPaused"]),
    ...(listsChange(hello.changes, AMBIENT_STYLE) ? [] : ["ambientStyle"]),
    ...(listsChange(hello.changes, AMBIENT_AWAY) ? [] : ["ambientPlaysWhenAway"]),
    ...(listsChange(hello.changes, SETTINGS_CURRENT) ? [] : ["settings.current"]),
    ...(listsChange(hello.changes, AMBIENT_OWN_STYLES) ? [] : ["ambientOwnStyles"]),
    // Not the look, but read as strictly: where devices find a Windows home.
    ...(listsChange(hello.changes, DEVICE_ADDS_BY_ADDRESS) ? [] : ["addsByAddress"]),
    // A computer's work saved before its update, which an older view's strict device list cannot read.
    ...(listsChange(hello.changes, WORK_UPDATE_SAVING) ? [] : ["updateWork"]),
  ];
}
