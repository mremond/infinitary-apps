import type { BatchHoldState } from "@shared/batches";
import { formatDate, formatList } from "@shared/i18n/format";
import * as m from "@shared/i18n/messages.generated";
import { AUTOMATIC_COMPUTER } from "@shared/placement";
import { type NoChecksRecord, type RepoView, readsPullRequestChecks } from "@shared/repos";
import { type DeviceSignIns, devicePlace, wordedPlace } from "@shared/signIns";
import { AUTONOMY_WORDS, PROJECT_DELIVERY_WORDS, RIGOR_WORDS } from "@shared/vocabulary";

/**
 * Words of a project's policy rows in Settings -> Projects (`ProjectsTab`),
 * in a plain module so an e2e spec reads them from their owner
 * (docs/e2e-contracts.md, "Words come from their owner").
 */
export const PROJECT_POLICY_WORDS = {
  /**
   * What "Where changes go" says on every project but the personal
   * workspace: it names batched pull requests only while they are offered.
   */
  delivery: (batches: boolean) =>
    batches ? m.settingsProjectsDelivery() : m.settingsProjectsDeliveryNoBatch(),
  /** The first row's name: the personal workspace is a kind of workspace, not a way to deliver. */
  deliveryTitle: (personal: boolean) =>
    personal ? m.settingsProjectsWorkspace() : m.settingsProjectsDeliveryTitle(),
  get workspace() {
    return m.settingsProjectsWorkspaceDescription();
  },
  /** What the asks-first row says under its name. */
  asks: (personal: boolean, autonomy: boolean) =>
    personal
      ? m.settingsProjectsAutonomyPersonal()
      : autonomy
        ? m.settingsProjectsAutonomyOn()
        : m.settingsProjectsAutonomyOff(),
  get rigorTitle() {
    return m.settingsProjectsCare();
  },
  /** What the Rigor row says under its name. */
  rigor: (personal: boolean) =>
    personal ? m.settingsProjectsCarePersonal() : m.settingsProjectsRigorDescription(),
  /** The personal workspace's rigor, in place of a choice. */
  get rigorNone() {
    return m.settingsProjectsCareNone();
  },
  /** The Require pull request checks row's name and its switch's (docs/forge.md, "A project with no checks"). */
  get checksTitle() {
    return m.settingsProjectsRequireChecks();
  },
  /**
   * What the Require pull request checks row says under its name: on, that
   * checks hold the merge; off, that the project runs none, since when, and
   * the task whose crewmate found it.
   */
  checks: (noChecks: NoChecksRecord | undefined) => {
    if (!noChecks) return PROJECT_POLICY_WORDS.checksOn;
    const date = formatDate(noChecks.at, { month: "short", day: "numeric" });
    const since = noChecks.task
      ? m.settingsProjectsRequireChecksFound({ date, task: noChecks.task })
      : m.settingsProjectsRequireChecksSince({ date });
    return `${PROJECT_POLICY_WORDS.checksOff} ${since}`;
  },
  /** Under Require pull request checks while it is on. */
  get checksOn() {
    return m.settingsProjectsRequireChecksOn();
  },
  /** Under Require pull request checks while it is off, before when and by whom. */
  get checksOff() {
    return m.settingsProjectsRequireChecksOff();
  },
  /** The Disclose AI assistance row's name and its switch's (docs/forge.md, "Disclosing AI assistance"). */
  get disclosureTitle() {
    return m.settingsProjectsDisclosure();
  },
  /** What the Disclose AI assistance row says under its name, on or off. */
  disclosure: (on: boolean) =>
    on ? m.settingsProjectsDisclosureOn() : m.settingsProjectsDisclosureOff(),
  /** The name of the field holding the project's line. */
  get disclosureLine() {
    return m.settingsProjectsDisclosureLine();
  },
  get advisoryTitle() {
    return m.settingsProjectsAdvisoryTitle();
  },
  get advisory() {
    return m.settingsProjectsAdvisoryDescription();
  },
  get advisoryLabel() {
    return m.settingsProjectsAdvisoryLabel();
  },
  get advisoryInvalid() {
    return m.settingsProjectsAdvisoryInvalid();
  },
  get advisoryClearsAddress() {
    return m.settingsProjectsAdvisoryClearsAddress();
  },
  get advisoryClearsTarget() {
    return m.settingsProjectsAdvisoryClearsTarget();
  },
  /** Under the rows of a project that merges locally and asks for Careful. */
  get carefulLocal() {
    return m.settingsProjectsLocalCareful();
  },
} as const;

/**
 * What "Where changes go" says on a batched project (docs/forge.md,
 * "Batches of your own"): the app combines this person's approved changes
 * itself, with nothing to set up.
 */
export const BATCH_OWN_WORDS = {
  get note() {
    return m.settingsProjectsBatchOwn();
  },
};

/**
 * A held batch of this person's own approved changes in Settings
 * (docs/forge.md, "A held batch"): why it holds, its pull request, and the
 * by-hand answers - Try again, or Send back the chosen changes, each with
 * the reason its crewmate reads.
 */
export const BATCH_HOLD_WORDS = {
  get title() {
    return m.settingsProjectsBatchHeld();
  },
  checks: (since: string, checks: readonly string[], changes: number) =>
    checks.length
      ? m.settingsProjectsBatchHeldChecks({ since, checks: formatList(checks), count: changes })
      : m.settingsProjectsBatchHeldChecksUnnamed({ since, count: changes }),
  noWay: (since: string) => m.settingsProjectsBatchHeldNoWay({ since }),
  refused: (since: string, detail: string) => m.settingsProjectsBatchHeldRefused({ since, detail }),
  rules: (since: string) => m.settingsProjectsBatchHeldRules({ since }),
  open: (label: string) => m.settingsProjectsBatchOpen({ label }),
  get tryAgain() {
    return m.settingsProjectsBatchTryAgain();
  },
  get changes() {
    return m.settingsProjectsBatchChanges();
  },
  reason: (title: string) => m.settingsProjectsBatchReason({ title }),
  get reasonPlaceholder() {
    return m.settingsProjectsBatchReasonPlaceholder();
  },
  get sendBack() {
    return m.settingsProjectsBatchSendBack();
  },
  get needsChange() {
    return m.settingsProjectsBatchNeedsChange();
  },
  get needsReason() {
    return m.settingsProjectsBatchNeedsReason();
  },
  get retried() {
    return m.settingsProjectsBatchRetried();
  },
  sentBack: (changes: number) => m.settingsProjectsBatchSentBack({ count: changes }),
  /** The box's title: held, and who has its next step (`batchHoldState`). */
  heldTitle: (state: BatchHoldState) => {
    switch (state) {
      case "repairing":
      case "fixing":
      case "sent-back":
        return m.settingsProjectsBatchHeldTitleRepairing();
      case "own":
        return m.settingsProjectsBatchHeldTitleOwn();
      case "passed":
        return m.settingsProjectsBatchHeldTitlePassed();
      case "approve":
        return m.settingsProjectsBatchHeldTitleApprove();
      case "card":
        return m.settingsProjectsBatchHeldTitleCard();
      case "setting":
        return m.settingsProjectsBatchHeldTitleSetting();
      case "rule":
        return m.settingsProjectsBatchHeldTitleRule();
      case "none":
        return m.settingsProjectsBatchHeldTitleNone();
    }
  },
  /**
   * Who has the hold and what is asked of the captain, naming the repair by
   * key; null where the summary already says it (a setting, a rule) or while
   * the board has not named the repair yet.
   */
  who: (state: BatchHoldState, key: string | null): string | null => {
    if (state === "none") return m.settingsProjectsBatchHeldWhoNone();
    if (state === "passed")
      return key
        ? m.settingsProjectsBatchHeldWhoPassed({ key })
        : m.settingsProjectsBatchHeldWhoPassedUnnamed();
    if (!key) return null;
    switch (state) {
      case "repairing":
        return m.settingsProjectsBatchHeldWhoRepairing({ key });
      case "own":
        return m.settingsProjectsBatchHeldWhoOwn({ key });
      case "fixing":
        return m.settingsProjectsBatchHeldWhoFixing({ key });
      case "sent-back":
        return m.settingsProjectsBatchHeldWhoSentBack({ key });
      case "approve":
        return m.settingsProjectsBatchHeldWhoApprove({ key });
      case "card":
        return m.settingsProjectsBatchHeldWhoCard({ key });
      default:
        return null;
    }
  },
  /** The declared fix its checks run with before approval (`OpenBatch.trial`), by key or title. */
  checkingFix: (key: string) => m.settingsProjectsBatchCheckingFix({ key }),
  latestReport: (report: string) => m.settingsProjectsBatchLatestReport({ report }),
  openTask: (key: string) => m.settingsProjectsBatchOpenTask({ key }),
  get answerYourself() {
    return m.settingsProjectsBatchAnswerYourself();
  },
  get answerNote() {
    return m.settingsProjectsBatchAnswerNote();
  },
  get answerRuleNote() {
    return m.settingsProjectsBatchAnswerRuleNote();
  },
};

/** A batch whose merge the host took and still reads as running (`BatchWaitPanel`). */
export const BATCH_WAIT_WORDS = {
  get title() {
    return m.settingsProjectsBatchWaiting();
  },
  since: (since: string, place: string | null) =>
    place
      ? m.settingsProjectsBatchWaitingSince({ since, place })
      : m.settingsProjectsBatchWaitingSinceHost({ since }),
};

/** What "Where changes go" says on a project whose host takes no batch pull request. */
export function batchNoHostWords(): string {
  return m.settingsProjectsBatchNoHost();
}

/**
 * The quiet words after a closed project row's name (INF-1495, the captain's
 * direction A): each names one way the project differs from a new one, which
 * is offered as pull requests where it lives, asks first, takes Default rigor
 * and runs on a computer chosen automatically.
 */
export const PROJECT_ROW_WORDS = {
  get personal() {
    return m.settingsProjectsRowPersonal();
  },
  get linked() {
    return m.settingsProjectsRowLinked();
  },
  localMerge: PROJECT_DELIVERY_WORDS["local-only"],
  mergesOnItsOwn: AUTONOMY_WORDS.putsInItself.toLowerCase(),
  get quick() {
    return m.settingsProjectsRowCare({ care: RIGOR_WORDS.quick });
  },
  get careful() {
    return m.settingsProjectsRowCare({ care: RIGOR_WORDS.reviewed });
  },
  runs: (where: string) => m.settingsProjectsRowRuns({ where }),
  get noChecks() {
    return m.settingsProjectsRowNoChecks();
  },
} as const;

export function inProjectsFolder(path: string, folder: string): boolean {
  const root = folder.replace(/\/+$/, "");
  return path === root || path.startsWith(`${root}/`);
}

/**
 * What a closed project row says after its name, in order: only what differs
 * from a new project. `folder` is the projects folder, or null while it is
 * unread; a project outside it reads `linked` and its row shows its path.
 * `runsWhere` places the project's chosen computer ("on Mac mini"), or is
 * null when Runs on is not drawn.
 */
export function projectRowWords(
  repo: Pick<
    RepoView,
    "kind" | "path" | "delivery" | "autonomy" | "rigor" | "runsOn" | "noChecks" | "origin" | "host"
  >,
  folder: string | null,
  runsWhere: string | null,
): string[] {
  if (repo.kind === "personal") return [PROJECT_ROW_WORDS.personal];
  const words: string[] = [];
  if (folder !== null && !inProjectsFolder(repo.path, folder)) words.push(PROJECT_ROW_WORDS.linked);
  if (repo.delivery === "local-only") words.push(PROJECT_ROW_WORDS.localMerge);
  if (repo.autonomy) words.push(PROJECT_ROW_WORDS.mergesOnItsOwn);
  if (repo.rigor === "quick") words.push(PROJECT_ROW_WORDS.quick);
  if (repo.rigor === "reviewed") words.push(PROJECT_ROW_WORDS.careful);
  if (repo.noChecks && readsPullRequestChecks(repo)) words.push(PROJECT_ROW_WORDS.noChecks);
  if (runsWhere && repo.runsOn && repo.runsOn !== AUTOMATIC_COMPUTER)
    words.push(PROJECT_ROW_WORDS.runs(runsWhere));
  return words;
}

/** The projects in one line, as the phone's Settings row counts them; the personal workspace is not one. */
export function projectsSummary(repos: readonly Pick<RepoView, "kind">[]): string {
  const count = repos.filter((repo) => repo.kind !== "personal").length;
  return count === 0 ? m.settingsProjectsNone() : m.settingsProjectsCount({ count });
}

/** How the row and its badge place a project's computer: "on Mac mini", "as Builder". */
export function runsOnWhere(
  repo: Pick<RepoView, "runsOn">,
  computers: readonly Pick<DeviceSignIns, "deviceId" | "name" | "user" | "onThisMac">[],
): string | null {
  if (!repo.runsOn) return null;
  if (repo.runsOn === AUTOMATIC_COMPUTER) return m.settingsRunsOnAutomatically();
  return wordedPlace(
    devicePlace(
      computers.map((computer) => ({ ...computer, id: computer.deviceId })),
      repo.runsOn,
    ),
  ).where;
}
