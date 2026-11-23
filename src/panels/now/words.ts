import * as m from "./messages.generated";

/**
 * The words a Tasks row and its group header read, in a module of words
 * alone, so a journey and the phone's generated words read them from their
 * owner (scripts/generate-phone-contract.ts). A constant holds the source
 * language's words as the module loads; a table's getters word each read in
 * the panel's language.
 */

/** A backlog row's Start (INF-1663): the task record's own, Start, and Try again after a start that failed. */
export const ROW_START_LABEL = m.nowPanelRowStart();
export const ROW_TRY_AGAIN_LABEL = m.nowPanelRowTryAgain();

/** The one dim word a row may carry after its title (`wordOf`). */
export const ROW_WORDS = {
  get starting() {
    return m.nowPanelRowStarting();
  },
  get couldNotStart() {
    return m.nowPanelRowCouldNotStart();
  },
  get checks() {
    return m.nowPanelRowChecks();
  },
  get batch() {
    return m.nowPanelRowBatch();
  },
  get waiting() {
    return m.nowPanelRowWaiting();
  },
  get blocked() {
    return m.nowPanelRowBlocked();
  },
  get held() {
    return m.nowPanelRowHeld();
  },
};

/** The word of a row a crewmate filed while working on another task. */
export function foundOnWords(key: string): string {
  return m.nowPanelRowFoundOn({ key });
}

/** Why a row's computer cannot take work now (`rowTrailing`). */
export const ROW_REACH_WORDS = {
  get connecting() {
    return m.nowPanelRowConnecting();
  },
  get updating() {
    return m.nowPanelRowUpdating();
  },
  get noNewWork() {
    return m.nowPanelRowNoNewWork();
  },
  get away() {
    return m.nowPanelRowAway();
  },
};

/**
 * What a row says while its computer is connected and this Mac is still
 * catching up with the task (`rowTrailing`); since when is the status's
 * reason, which the row's summary shows, since the rail has no room for it.
 */
export const ROW_CATCHING_UP = "catching up";

/** What a folding group's header adds after its count: crew filings not yet opened. */
export function newCountWords(count: number): string {
  return ` · ${m.nowPanelRowNewCount({ count })}`;
}

/** What the Backlog header adds after its count: starts that failed. */
export function failedCountWords(count: number): string {
  return ` · ${m.nowPanelRowFailedCount({ count })}`;
}

/** The search's own group of older closed work. */
export const EARLIER_LABEL = m.nowPanelGroupEarlier();

/** The panel's own group at its top: the tasks the captain pinned, whatever their state (INF-3127). */
export const PINNED_LABEL = m.nowPanelGroupPinned();

/**
 * A task's parts (INF-3823's plan): how many are finished, in words, for
 * the row's accessible label; the row shows them as `3/7`.
 */
export function partsCountWords(closed: number, total: number): string {
  return `${closed} of ${total} ${total === 1 ? "part" : "parts"} finished`;
}

/** What a collapsed row's accessible label adds: its parts are not listed under it. */
export const ROW_COLLAPSED_WORDS = "parts collapsed";

/** The collapse control's name and rest label: what a press does. */
export function foldLabel(collapsed: boolean, key: string): string {
  return `${collapsed ? "Expand" : "Collapse"} ${key}'s parts`;
}

/** The panel's asks from command search: collapse every task with parts listed under it, or expand all. */
export const COLLAPSE_ALL_ASK = "collapse-parts";
export const EXPAND_ALL_ASK = "expand-parts";
