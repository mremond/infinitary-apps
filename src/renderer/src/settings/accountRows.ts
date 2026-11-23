import { type AccountView, standingCutOff } from "@shared/accounts";
import {
  CLAUDE_ACCESS_LABEL,
  CLAUDE_ACCESS_REFUSED_TEXT,
  CLAUDE_ACCESS_TRY_AGAIN_LABEL,
  CLAUDE_GATEWAY_LABEL,
} from "@shared/claudeAccess";
import { awayWord } from "@shared/devices";
import { formatTime } from "@shared/i18n/format";
import * as m from "@shared/i18n/messages.generated";
import {
  API_KEY_LABEL,
  BEDROCK_PROFILE_UNAVAILABLE,
  BEDROCK_PROVIDER_ID,
  CLAUDE_PROVIDER_ID,
} from "@shared/providers";
import {
  allowanceProviderOf,
  CREDITS_SWITCH_PROVIDERS,
  isKeychainValueFailure,
  isSensedProvider,
  type QuotaProviderView,
} from "@shared/quota";
import { formatDurationShort, providerScopes, windowSignals } from "@shared/quotaSignals";
import type { DeviceSignIns } from "@shared/signIns";
import type { StatusDotTone } from "../design/core/StatusDot";
import {
  creditsLine,
  EMPTY_QUOTA_TEXT,
  noReaderText,
  SUBSCRIPTIONS_WORDS,
  savedResetsLine,
} from "./subscriptionsWords";

/**
 * What one account's row says in Settings → Intelligence
 * (docs/subscriptions-tab.md): its situation, dot, second line, allowance
 * meters and one verdict, from the account and its allowance reading. Pure,
 * with no window code, so the phone's Intelligence page runs the same rules
 * and words (docs/ios.md, "Settings pages in the computer's words") and
 * `SubscriptionsTab.tsx` only draws what this answers.
 */

function kindCopy(kind: AccountView["kind"]): string {
  return kind === "api_key" ? API_KEY_LABEL : m.settingsSubscriptionsKindSubscription();
}

/**
 * What a row with no window says. The three situations the captain has to be
 * able to tell apart stay apart: we could not find out just now, the sign-in
 * itself needs redoing, and we simply have not read one yet. None of them is
 * ever rendered as a meter.
 */
function emptyQuotaText(status: QuotaProviderView["status"]): string {
  switch (status) {
    case "auth_required":
      return EMPTY_QUOTA_TEXT.signInAgain;
    case "rate_limited":
      return EMPTY_QUOTA_TEXT.slowDown;
    case "unavailable":
    case "error":
      return EMPTY_QUOTA_TEXT.unread;
    default:
      return EMPTY_QUOTA_TEXT.notYet;
  }
}

/** How old a carried-forward reading is, in the words a person would use. */
function measuredAgeText(measuredAt: number, now: number): string {
  const minutes = Math.floor((now - measuredAt) / 60_000);
  if (minutes < 1) return m.settingsSubscriptionsAsOfJustNow();
  if (minutes < 60) return m.settingsSubscriptionsAsOfMinutes({ minutes: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return m.settingsSubscriptionsAsOfHours({ hours: String(hours) });
  return m.settingsSubscriptionsAsOfDays({ days: String(Math.floor(hours / 24)) });
}

export type RowKind =
  | "ok"
  | "stale"
  | "paused"
  | "auth"
  | "disconnected"
  | "pending"
  | "no_row"
  | "no_data"
  | "not_measured"
  | "rate_limited"
  | "unavailable"
  | "error"
  | "skipped";

export type Verdict = { text: string; tone: "ok" | "danger" | "warn" | "neutral" };

export type RowView = {
  kind: RowKind;
  dot: StatusDotTone;
  dotLabel: string;
  /** The mono second line: plan · identity, else the kind word. */
  sub: string;
  meters: {
    id: string;
    label: string;
    percent?: number;
    pace: "ahead" | "on_pace" | "behind" | "unknown";
    resetText?: string;
    clock?: number;
  }[];
  verdict?: Verdict;
  /** Paying past the allowance, in one line, beside a reading's meters (`creditsLine`). */
  credits?: string;
  /** Saved resets the account holds and where they are used, in one line (`savedResetsLine`). */
  savedResets?: string;
  /** The one-line state for a row with no meter to show. */
  stateText?: string;
  stateTone?: "danger";
  /** The only inline action: nothing moves on this row until it is pressed. */
  signIn: boolean;
  /**
   * The inline action's own words when they are not Sign in: on Claude
   * access set up for Claude Code it checks that access again and opens
   * nothing.
   */
  signInLabel?: string;
  /** A Keychain VALUE refusal: retry the read (may raise the macOS ask). */
  retry: boolean;
};

/**
 * Stage 1: which situation the row is in. The order is the priority a person
 * would give the facts: paused first (nothing else matters while it is off),
 * then a sign-in the vendor rejected after a real renewal, then a store with
 * no credential, then what the sensor established. `needsReauth` is the same
 * terminal state from local proof (a lapsed refresh token) when the quota
 * row has not landed yet.
 */
function rowKind(account: AccountView, row: QuotaProviderView | undefined): RowKind {
  if (!account.enabled) return "paused";
  if (
    row?.status === "auth_required" ||
    account.needsReauth ||
    (account.providerId === BEDROCK_PROVIDER_ID && account.cutOff?.class === "signed_out")
  )
    return "auth";
  if (!account.connected) return "disconnected";
  // A sensed provider with no snapshot row yet is waiting on its first
  // read - not a provider Infinitary never reads. OpenRouter and other
  // unsensed providers stay `no_row` (the existing sentence).
  if (!row) return isSensedProvider(account.providerId) ? "pending" : "no_row";
  if (row.stale) return "stale";
  if (row.status === "ok") return row.windows.length > 0 ? "ok" : "no_data";
  return row.status;
}

function runwayVerdict(
  runway: { status: string; projectedExhaustedAtMs?: number },
  now: number,
  allModels: boolean,
): Verdict | undefined {
  if (runway.status === "through_reset") {
    // The check mark is the all-models claim; a narrower scope is just "on pace".
    return {
      text: allModels ? m.settingsSubscriptionsOnPaceAll() : m.settingsSubscriptionsOnPace(),
      tone: "ok",
    };
  }
  if (runway.status === "projected_exhaustion" && runway.projectedExhaustedAtMs !== undefined) {
    return {
      text: m.settingsSubscriptionsEmptyIn({
        duration: formatDurationShort(runway.projectedExhaustedAtMs - now),
      }),
      tone: "danger",
    };
  }
  if (runway.status === "exhausted_now")
    return { text: m.settingsSubscriptionsEmptyNow(), tone: "danger" };
  return undefined;
}

/**
 * The row's one verdict. A combined bound speaks for all models; a stale
 * row says its age and derives nothing (providerScopes already returns
 * nothing for it).
 */
function verdictFor(kind: RowKind, row: QuotaProviderView | undefined, now: number) {
  if (kind === "paused")
    return { text: m.settingsSubscriptionsPaused(), tone: "neutral" } as Verdict;
  if (kind === "stale" && row) {
    return {
      text:
        row.measuredAt !== undefined
          ? measuredAgeText(row.measuredAt, now)
          : m.settingsSubscriptionsStale(),
      tone: "warn",
    } as Verdict;
  }
  if (kind !== "ok" || !row) return undefined;
  const { allModels, scopes } = providerScopes(row, now);
  // An account-wide bound remains authoritative even when it is unknown.
  // Never fall back to a readable window and bypass an unread bound.
  if (allModels) return runwayVerdict(allModels.runway, now, true);
  // With only narrower bounds, keep the lowest-headroom scope's verdict,
  // without the all-models check mark. Unknown headroom takes precedence.
  const lowest = scopes.reduce<(typeof scopes)[number] | undefined>((a, b) => {
    if (!a || b.effectivePercentRemaining === undefined) return b;
    if (a.effectivePercentRemaining === undefined) return a;
    return b.effectivePercentRemaining < a.effectivePercentRemaining ? b : a;
  }, undefined);
  return lowest ? runwayVerdict(lowest.runway, now, false) : undefined;
}

export function rowView(
  account: AccountView,
  row: QuotaProviderView | undefined,
  now: number,
): RowView {
  const kind = rowKind(account, row);
  // Prefer what the provider itself says about the account; fall back to the
  // quota sensor's view, and only then to the kind of credential. Never the
  // internal account id - it means nothing to the person reading it.
  const identity = account.identity ?? row?.account;
  const plan = account.plan ?? row?.plan;
  // Claude access set up for Claude Code has no plan and no email: the row
  // says where it comes from instead, never a subscription's email an
  // earlier reading kept. A subscription whose requests go to an address in
  // Claude Code's settings says so after its plan.
  const sub = account.access
    ? CLAUDE_ACCESS_LABEL[account.access]
    : [
        plan ?? kindCopy(account.kind),
        identity,
        account.gateway ? CLAUDE_GATEWAY_LABEL[account.gateway] : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
  const signedIn =
    account.kind === "api_key"
      ? m.settingsSubscriptionsApiKeySet({ apiKey: API_KEY_LABEL })
      : m.settingsSubscriptionsSignedIn();
  const claudeFirstRun = kind === "disconnected" && account.providerId === CLAUDE_PROVIDER_ID;
  const dot: { tone: StatusDotTone; label: string } =
    kind === "ok"
      ? { tone: "ok", label: signedIn }
      : kind === "stale"
        ? { tone: "warn", label: m.settingsSubscriptionsDotStale({ signedIn }) }
        : claudeFirstRun
          ? { tone: "ring", label: m.settingsSubscriptionsDotNotSignedInYet() }
          : kind === "auth" || kind === "disconnected"
            ? { tone: "danger", label: m.settingsSubscriptionsDotSignInAgain() }
            : kind === "paused"
              ? { tone: "idle", label: m.settingsSubscriptionsPaused() }
              : kind === "pending"
                ? { tone: "ring", label: m.settingsSubscriptionsDotReading({ signedIn }) }
                : { tone: "ring", label: m.settingsSubscriptionsDotNoReading({ signedIn }) };
  const view: RowView = {
    kind,
    dot: dot.tone,
    dotLabel: dot.label,
    sub,
    meters: [],
    signIn: false,
    retry: false,
  };
  if (kind === "auth") {
    view.stateText =
      account.providerId === BEDROCK_PROVIDER_ID
        ? [m.settingsSubscriptionsSignInAgainState(), row?.detail].filter(Boolean).join(" ")
        : emptyQuotaText("auth_required");
    view.stateTone = "danger";
    view.signIn = true;
    return view;
  }
  if (kind === "disconnected") {
    if (account.providerId === CLAUDE_PROVIDER_ID) {
      // First-run, not a failed re-auth: the machine has no Claude login yet.
      view.stateText = SUBSCRIPTIONS_WORDS.claudeFirstRun;
      view.signIn = true;
      return view;
    }
    view.stateText = m.settingsSubscriptionsSignInAgainState();
    view.stateTone = "danger";
    view.signIn = true;
    return view;
  }
  if (account.detail) {
    // The credential is fine and the machine cannot run it (F14: no Claude
    // Code, or one too old). The backend's sentence says what to do; no
    // meter and no sign-in, because neither is the remedy.
    view.dot = "warn";
    view.dotLabel = m.settingsSubscriptionsNotReady();
    view.stateText = account.detail;
    return view;
  }
  if (kind === "pending") {
    // First read in flight (or about to be). Muted mono like other empty
    // states; a failed read replaces this with the sensor's own status.
    view.stateText = m.settingsSubscriptionsReading();
    return withHold(view, account, now);
  }
  if (kind === "no_row") {
    // Says what the app does, never what the credential could expose.
    view.stateText = noReaderText(account.kind);
    return view;
  }
  view.retry = isKeychainValueFailure(row?.reason);
  if (
    account.providerId === BEDROCK_PROVIDER_ID &&
    kind === "unavailable" &&
    row?.reason === BEDROCK_PROFILE_UNAVAILABLE
  ) {
    view.signIn = true;
  }
  if (row && kind !== "ok" && kind !== "paused") {
    if (kind === "stale") {
      // Last-known-good meters stay; the disclosed reason must not vanish
      // behind "as of Nd ago".
      if (row.detail) view.stateText = row.detail;
    } else {
      view.stateText = row.detail ?? emptyQuotaText(row.status);
      // Access set up for Claude Code is never measured, so its hold would
      // never show behind the allowance line: the hold says it instead.
      return account.access ? withHold(view, account, now) : view;
    }
  }
  view.meters = (row?.windows ?? []).map((window) => {
    const signals = windowSignals(window, now);
    return {
      id: window.id,
      label: window.label,
      ...(window.percentRemaining !== undefined ? { percent: window.percentRemaining } : {}),
      pace: window.pace ?? "unknown",
      ...(window.resetText ? { resetText: window.resetText } : {}),
      ...(signals.kind === "measured" ? { clock: signals.timeRemainingPercent } : {}),
    };
  });
  const verdict = verdictFor(kind, row, now);
  if (verdict) view.verdict = verdict;
  const credits = row
    ? creditsLine(row.provider, row.credits, account.keepGoingOnCredits === true)
    : undefined;
  if (credits) view.credits = credits;
  const savedResets = row ? savedResetsLine(row.provider, row.savedResets) : undefined;
  if (savedResets) view.savedResets = savedResets;
  return withHold(view, account, now);
}

/**
 * A withholding cut-off is invisible when the allowance still reads: the
 * row keeps its meters and says the hold, with Sign in for a sign-out.
 */
function withHold(view: RowView, account: AccountView, now: number): RowView {
  const hold = standingCutOff(account, now);
  if (!account.enabled || !account.connected) return view;
  if (hold?.class !== "signed_out" && hold?.class !== "refused") return view;
  view.dot = "warn";
  view.dotLabel =
    hold.class === "signed_out"
      ? SUBSCRIPTIONS_WORDS.signedOutHoldLabel
      : SUBSCRIPTIONS_WORDS.refusedHoldLabel;
  view.stateText =
    hold.class === "signed_out"
      ? SUBSCRIPTIONS_WORDS.signedOutHoldText
      : SUBSCRIPTIONS_WORDS.refusedHoldText;
  view.stateTone = "danger";
  if (hold.class === "signed_out") {
    view.signIn = true;
    // A refused token command is renewed where the person renews it for
    // Claude Code; the row's button checks again and opens no browser.
    if (account.access) {
      view.stateText = CLAUDE_ACCESS_REFUSED_TEXT[account.access];
      view.signInLabel = CLAUDE_ACCESS_TRY_AGAIN_LABEL;
    }
  }
  return view;
}

/**
 * The accounts in one line, as the phone's Settings row says them: how many
 * there are, and how many wait for a sign-in when any does ("3 accounts · 1
 * needs a sign-in").
 */
export function accountsSummary(rows: readonly Pick<RowView, "signIn">[]): string {
  const waiting = rows.filter((row) => row.signIn).length;
  const accounts = m.settingsAccountsCount({ count: rows.length });
  return waiting === 0 ? accounts : m.settingsAccountsWaiting({ accounts, count: waiting });
}

/** When the allowance was last read, as the list's head says it after "as of": 14:05. */
export function clockOf(at: number): string {
  const t = new Date(at);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

/** What a computer that runs work says about its own sign-ins, under its label. */
export const DEVICE_SIGN_INS_WORDS = {
  own: (where: string) => m.settingsDevicesSignInsOwn({ where }),
  /** It was asked and did not answer; `home` is the first mate's computer as the reader names it. */
  unanswered: (who: string, home: string) => m.settingsDevicesSignInsUnanswered({ who, home }),
  get none() {
    return m.settingsDevicesSignInsNone();
  },
};

/**
 * Under a computer's label while it is not in reach: out of reach,
 * connecting while its connection is being made, or updating while the
 * home follows its update (even in reach), and when it last said what
 * it is signed in to. Null while it is in reach.
 */
export function awayNote(
  device: Pick<DeviceSignIns, "reach" | "asOf" | "updating">,
): string | null {
  if (device.reach === "in-reach" && !device.updating) return null;
  const away = awayWord(device.reach === "connecting", device.updating);
  if (!device.asOf) return away;
  const time = formatTime(device.asOf, { hour: "2-digit", minute: "2-digit" });
  return `${away} · ${m.settingsDevicesSignInsAsOf({ time })}`;
}

/** Whether this account's provider sells credits past its allowance (docs/quota.md). */
export function offersKeepGoing(account: AccountView): boolean {
  const provider = allowanceProviderOf(account.providerId);
  return provider !== undefined && CREDITS_SWITCH_PROVIDERS.includes(provider);
}
