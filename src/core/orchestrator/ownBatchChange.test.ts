import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BATCH_STATUS_WORDS } from "@shared/batches";
import type { ChangePresentation } from "@shared/changePresentation";
import { softHoldWords } from "@shared/holds";
import type { HostedPresentationDestination } from "@shared/presentationDestination";
import { RISK_DIMENSIONS, type RiskDeclaration } from "@shared/risk";
import { describe, expect, it, type MockInstance, vi } from "vitest";
import {
  BATCH_BASE,
  BatchHostForge,
  commitId as id,
  METER_DESTINATION,
  standInGit,
} from "../../../tests/helpers/batchHost";
import { gitRepo } from "../../../tests/helpers/crewHarnessGit";
import { BUNDLED_NAMING } from "../../../tests/helpers/namingRunbook";
import { insertTask, setup } from "../../../tests/helpers/prCiHarness";
import { BATCH_WORDS, Batches } from "../batches/batches";
import { LEFT_OUT_WORDS } from "../batches/combine";
import { BATCH_CHECK, BATCH_WAITING_WORDS, presentationCommitMessage } from "../forge";
import { CardStore } from "../storage/cardStore";
import { InboxStore } from "../storage/inboxStore";
import type { MergeAuthorization } from "../storage/taskRecords";
import { seedProject } from "../workspace/seedProject";
import { askEndingOf } from "./askEnding";
import { CardService } from "./cardService";
import { BATCH_MERGE_WORDS, type MergeGuard } from "./changeMerge";
import { BATCH_OPEN_WORDS } from "./changePublication";
import { BATCH_DECLARATION_WORDS, PROJECT_ABSENCE_WORDS } from "./checkChangeTool";
import { candidateHead, standingAuthorization } from "./mergeAuthorization";
import { MERGE_CARD_WORDS } from "./mergeCardSteps";
import { approvedWhere } from "./ownBatches";
import type { SettleServiceHost } from "./settleHost";
import { createSettleOwners } from "./settleOwners";

// Intent: the captain's approved plan for batches of their own, piece 1: "each change is a
// pushed branch with its saved story and no pull request of its own. The merge click, or
// autonomy, keeps the approval at that version and puts the change in line", its checks
// are read on its pushed branch (the captain's answer own_check), and a repair answers a
// held batch by a typed declaration: send changes back, each with a reason, or declare
// its own change the fix.
//
// The change delivery is wired as the app wires it over a fresh database; the stand-in is
// the host, which holds the pushed branch, its checks and the batch's pull request, with
// the combine and the push writing to it in place of git (`combine.test.ts` owns git).

// One case reads a repair with real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

const REPO = "repo-meter";
const TASK = "ab12cd34";
const BRANCH = "fm/task-ab12cd34";
const HEAD = "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0";
/** The story a crewmate prepared for the change at its pushed version. */
const STORY: ChangePresentation = {
  version: 1,
  taskId: TASK,
  revision: 1,
  title: "fix(parser): read dates with a time zone",
  base: BATCH_BASE,
  head: HEAD,
  destination: METER_DESTINATION,
  why: ["A date with a time zone was read an hour off."],
  whatChanged: ["Dates with a time zone are read as written."],
  before: ["A date with a zone lost its offset."],
  after: ["The date keeps the offset it was written with."],
  noPicture: "The change is in how a date is read, which no screen shows.",
  views: [],
  assets: [],
  pictures: [],
  verification: ["Ran the parser's date tests."],
  risk: Object.fromEntries(
    RISK_DIMENSIONS.map((dimension) => [dimension, { level: "low", why: "One parser function." }]),
  ) as RiskDeclaration,
  requiredActions: [],
  unfinished: [],
  projectText: "",
};

/**
 * The project and its host. `dir` is the project's folder, a real repository where a
 * case reads git, and `head` the pushed version the story and the approval name.
 */
function home(where: { dir?: string; head?: string } = {}) {
  const head = where.head ?? HEAD;
  const story: ChangePresentation = { ...STORY, head };
  const forge = new BatchHostForge(head);
  const approvals = new Map<string, string>();
  const conflicting = new Set<string>();
  const heard = {
    sentBack: [] as { taskId: string; reason: string }[],
    addressMoved: [] as { taskId: string; reason: string }[],
    settled: [] as string[][],
  };
  let clock = 10_000;
  const tick = () => {
    clock += 1;
    return clock;
  };
  const at = setup({ forge, batches: () => batches });
  seedProject(at.db, {
    id: REPO,
    name: "meter",
    path: where.dir ?? tmpdir(),
    origin: "https://github.com/acme/meter.git",
    delivery: "queue-pr",
  });
  insertTask(at.tasks, { repoId: REPO });
  at.readHead.mockImplementation(async () => forge.pushed ?? "");
  const batches: Batches = new Batches({
    repos: at.repos,
    forgeFor: () => forge,
    now: tick,
    naming: () => BUNDLED_NAMING,
    // As the app reads it: the captain's standing approval covers the version, or the
    // stand-in's own click for a change that has none on its record.
    approved: (taskId, version, repo) => {
      const kept = standingAuthorization(at.tasks.get(taskId)?.delivery);
      if (kept && candidateHead(kept) === version) return approvedWhere(kept, repo);
      return approvals.get(taskId) === version;
    },
    runsNoChecks: (taskId, head) => at.service.checks.declaredAbsent(taskId, head),
    live: () => true,
    story: async (member) => ({ region: `<!-- story of ${member.taskId} -->`, projectText: "" }),
    settle: (taskIds) => heard.settled.push(taskIds),
    sentBack: (change, sent) => heard.sentBack.push({ taskId: change.taskId, reason: sent.reason }),
    addressMoved: (change, reason) => heard.addressMoved.push({ taskId: change.taskId, reason }),
    held: () => {},
    note: () => {},
    taskNote: () => {},
    ...standInGit(forge, conflicting),
  });
  /** The crewmate prepared the story for the pushed version. */
  const prepare = (prepared: ChangePresentation = story) =>
    at.tasks.delivery.updateChangePresentation(TASK, () => ({
      revisions: [prepared],
      receipts: [],
    }));
  /** The captain's click on the merge card: the approval kept at the version it showed. */
  const guard = (overrides: Partial<MergeGuard> = {}): MergeGuard => {
    approvals.set(TASK, overrides.head ?? head);
    return { head, unattended: false, beforeDispatch: () => undefined, ...overrides };
  };
  /** The story confirmed on the pushed branch, as open_change leaves it. */
  const confirmed = async () => {
    prepare();
    await at.service.publication.open(TASK, { title: STORY.title, presentation: 1 });
  };
  return {
    ...at,
    forge,
    batches,
    approvals,
    conflicting,
    heard,
    prepare,
    guard,
    confirmed,
    pass: () => batches.pass(REPO),
    line: () => batches.record(REPO).line,
    open: () => batches.record(REPO).open,
    /** Another task's approved change, already in line. */
    other(taskId: string, title: string, head: string) {
      insertTask(at.tasks, { id: taskId, repoId: REPO, branch: `fm/task-${taskId}` });
      approvals.set(taskId, head);
      batches.enqueue(REPO, {
        taskId,
        branch: `fm/task-${taskId}`,
        head,
        title,
        body: "",
        at: tick(),
      });
    },
  };
}

/**
 * A real project folder for a repair's git facts: main, the change the captain approved
 * on its branch, main moved on with another file, and the repair - the same change on
 * the newer main.
 */
function repairedProject() {
  const { dir } = gitRepo("meter");
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@localhost", ...args],
      { encoding: "utf8" },
    ).trim();
  git("checkout", "-q", "-b", BRANCH);
  writeFileSync(join(dir, "parser.ts"), "export const zone = true;\n");
  git("add", "parser.ts");
  git("commit", "-q", "-m", STORY.title);
  const approved = git("rev-parse", "HEAD");
  git("checkout", "-q", "main");
  writeFileSync(join(dir, "export.ts"), "export const csv = true;\n");
  git("add", "export.ts");
  git("commit", "-q", "-m", "feat(export): add a CSV export");
  const base = git("rev-parse", "HEAD");
  git("checkout", "-q", BRANCH);
  git("rebase", "-q", "main");
  return { dir, approved, base, repaired: git("rev-parse", "HEAD") };
}

/**
 * The app's kept merge over the project's record (`createSettleOwners`), as the check
 * watch runs it once a change's checks settle; the cards it raised.
 */
function keptMerge(at: ReturnType<typeof home>) {
  const now = () => 20_000;
  const cards = new CardService({
    now,
    tasks: at.tasks,
    cardStore: new CardStore(at.db),
    syncCaptainGate: () => {},
    closeAnsweredTask: () => false,
    settleFacts: () => undefined,
    followupNotice: () => undefined,
    broadcastCrewCounts: () => {},
    broadcastEvent: () => {},
    broadcastCards: () => {},
    broadcastThread: () => {},
  });
  const host: SettleServiceHost = {
    now,
    tasks: at.tasks,
    inbox: new InboxStore(at.db, { now }),
    workspace: {} as SettleServiceHost["workspace"],
    repos: at.repos,
    cards,
    askEnding: askEndingOf(at.tasks, cards),
    runtimeState: () => "idle",
    stopRuntime: () => undefined,
    endLiveTask: () => {},
    mergePullRequest: (taskId, guard, boundary) => at.service.merges.merge(taskId, guard, boundary),
    isPersonalTask: () => false,
    deliverableOf: () => "change",
    taskDelivery: () => "queue-pr",
    taskAutonomy: () => false,
    resolveTaskRef: (ref) => {
      const record = at.tasks.resolve(ref);
      if (!record) throw new Error(`Unknown task "${ref}".`);
      return record;
    },
    notifyOp: () => {},
    pokeInbox: () => {},
    sweepGates: async () => {},
    broadcastCrewCounts: () => {},
    broadcastEvent: () => {},
  };
  const { kept, settle } = createSettleOwners(host);
  return {
    runMergeAuthorization: (taskId: string) => kept.runMergeAuthorization(taskId),
    cards: () => cards.snapshot(),
    stack: cards,
    settle,
  };
}

describe("a change of a project that gets batches of the person's own", () => {
  it("confirms its story on the pushed branch with open_change and opens no pull request of its own", async () => {
    const at = home();
    at.prepare();
    expect(await at.service.publication.open(TASK, { title: STORY.title, presentation: 1 })).toBe(
      BATCH_OPEN_WORDS.confirmed(BRANCH),
    );
    expect(at.forge.calls.filter((call) => call.startsWith("openChange"))).toEqual([]);
    expect(at.forge.batch).toBeUndefined();
    // There are no words around a story that has no pull request of its own.
    expect(
      await at.service.publication.open(TASK, {
        title: STORY.title,
        presentation: 1,
        around: { from: "", to: "Closes #412." },
      }),
    ).toBe(BATCH_OPEN_WORDS.around);
  });

  it("shows its merge card's story from the pushed branch, where no pull request of its own is open", async () => {
    const at = home();
    await at.confirmed();
    const shown = await at.service.publication.completionPresentation(TASK, 1);
    expect(shown).toMatchObject({ revision: 1, title: STORY.title });
    expect(at.forge.calls.filter((call) => call.startsWith("openChange"))).toEqual([]);

    // A story never confirmed on the pushed branch has no merge card to show.
    const unconfirmed = home();
    unconfirmed.prepare();
    await expect(unconfirmed.service.publication.completionPresentation(TASK, 1)).rejects.toThrow();
  });

  // INF-4153, found on INF-3799's branch: open_change's answer here tells the crewmate to
  // show the merge card, but show_merge_card's walk looked only for a pull request of the
  // change's own, so it confirmed the story and stopped at the pull request on every call.
  it("walks show_merge_card to its merge card from the pushed branch, and repeats nothing when called again", async () => {
    const at = home();
    // The working copy has the pushed version checked out; changePublication's tests own
    // reading it with git.
    vi.spyOn(at.service.publication, "presentationHead").mockResolvedValue(HEAD);
    at.prepare();
    expect(await at.service.mergeCard.walk(TASK)).toEqual({
      did: [MERGE_CARD_WORDS.batchConfirmed(BRANCH)],
      ready: { revision: 1, title: STORY.title, head: HEAD },
    });
    expect(at.forge.calls.filter((call) => call.startsWith("openChange"))).toEqual([]);
    // Called again, it confirms nothing again and reaches the same card.
    expect(await at.service.mergeCard.walk(TASK)).toEqual({
      did: [],
      ready: { revision: 1, title: STORY.title, head: HEAD },
    });
    // The card the walk reaches shows that story from the pushed branch.
    expect(await at.service.publication.completionPresentation(TASK, 1)).toMatchObject({
      revision: 1,
      title: STORY.title,
    });
  });

  it("refuses to confirm a story whose version is not the one pushed", async () => {
    const at = home();
    at.prepare();
    at.forge.pushed = "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7";
    const said = await at.service.publication.open(TASK, { title: STORY.title, presentation: 1 });
    expect(said).toContain("The code changed after this story was prepared.");
    expect(said).not.toBe(BATCH_OPEN_WORDS.confirmed(BRANCH));
  });

  it("reads the checks the project runs on its pushed branch, by that branch's commit", async () => {
    const at = home();
    at.forge.states = ["success", "failure"];
    at.forge.names = ["build", "unit-tests"];
    const run = await at.service.checks.run(TASK, "crewmate");
    expect(run.recorded).toBe(true);
    expect(run.checked?.change).toEqual({
      branch: BRANCH,
      headSha: HEAD,
      url: await at.forge.branchPage(BRANCH),
    });
    expect(at.forge.calls).toContain(`checks ${HEAD}`);
    expect(at.service.checks.reading(TASK)?.overall).toBe("red");

    at.forge.states = ["success", "success"];
    await at.service.checks.run(TASK, "crewmate");
    expect(at.service.checks.reading(TASK)?.overall).toBe("green");
  });

  // Intent: INF-4196's approved plan - "a batched change's merge card links to its changes
  // on GitHub", the branch's compare page, which the card's strip and the Info tab's Branch
  // row read from the record; a change read before the page was kept gains it at its next
  // reading.
  it("keeps its pushed branch's compare page as the change's page, read once", async () => {
    const at = home();
    at.forge.states = ["success"];
    at.forge.names = ["build"];
    const page = await at.forge.branchPage(BRANCH);
    at.forge.calls.length = 0;
    await at.service.checks.run(TASK, "crewmate");
    expect(at.tasks.get(TASK)?.delivery).toMatchObject({ changeLabel: BRANCH, prUrl: page });
    expect(at.tasks.get(TASK)?.delivery?.prNumber).toBeUndefined();
    await at.service.checks.run(TASK, "crewmate");
    expect(at.forge.calls.filter((call) => call.startsWith("branchPage"))).toEqual([
      `branchPage ${BRANCH}`,
    ]);

    // A record from before the page was kept: the branch is known, the page is not.
    at.tasks.delivery.recordChangeEvidence(TASK, { prUrl: undefined });
    expect(at.tasks.get(TASK)?.delivery?.prUrl).toBeUndefined();
    await at.service.checks.run(TASK, "crewmate");
    expect(at.tasks.get(TASK)?.delivery).toMatchObject({ changeLabel: BRANCH, prUrl: page });
  });

  it("reads a branch nobody pushed as having no change yet", async () => {
    const at = home();
    at.forge.pushed = null;
    const run = await at.service.checks.run(TASK, "crewmate");
    expect(run.checked).toBeUndefined();
    expect(at.forge.calls.filter((call) => call.startsWith("checks"))).toEqual([]);
  });

  it("takes a declaration that its pushed version runs no checks, at that exact version only", async () => {
    const at = home();
    at.forge.states = [];
    const absent = {
      evidence: "No workflow of the project runs on a pushed task branch.",
      localGate: "pnpm check:changed passed at this version.",
    };
    expect(
      await at.service.checkTool.checkForCrew(TASK, {
        absentChecks: { ...absent, headSha: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7" },
      }),
    ).toBe(
      `Absence declaration refused: it must name this task's pushed branch at its current version, ${HEAD}, with the workflow and changed-file evidence and the local gate run at that version.`,
    );
    expect(at.service.checks.declaredAbsent(TASK, HEAD)).toBe(false);

    const said = await at.service.checkTool.checkForCrew(TASK, {
      absentChecks: { ...absent, headSha: HEAD },
    });
    expect(said).toContain("Absence evidence stored for this version.");
    expect(at.service.checks.declaredAbsent(TASK, HEAD)).toBe(true);
    // The declaration is about that version: a later push has none.
    expect(at.service.checks.declaredAbsent(TASK, "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7")).toBe(
      false,
    );
  });
});

describe("the merge of a change that joins a batch", () => {
  it("joins only from its merge card: a merge with no kept approval says so and puts nothing in line", async () => {
    const at = home();
    await at.confirmed();
    expect(await at.service.merges.merge(TASK)).toEqual({
      ok: false,
      text: BATCH_MERGE_WORDS.needsCard,
      plain: "it joins its batch from its merge card",
    });
    expect(at.line()).toEqual([]);
    expect(at.open()).toBeUndefined();
  });

  // Intent: INF-6091's audit, finding 2, the captain's pick "Start a task now to build it":
  // on a batch project, the captain's words recorded as passing asking first approve the
  // version his merge card shows, instead of a refusal and a second merge card. The first
  // mate's merge runs through the real settle owners and card stack.
  describe("on the captain's words recorded as passing asking first", () => {
    const CARD = "card-merge-meter";
    /** The crewmate's merge card at `shown`, its offer kept, and the captain's recorded words. */
    const merging = async (shown = HEAD, words = true) => {
      const at = home();
      const kept = keptMerge(at);
      await at.confirmed();
      at.tasks.delivery.recordChangeEvidence(TASK, { headSha: HEAD });
      kept.stack.put({
        id: CARD,
        taskId: TASK,
        author: "crewmate",
        priority: 1,
        title: "The parser reads time zones",
        meta: TASK,
        body: "<p>The parser reads time zones.</p>",
        actions: [
          {
            id: "merge",
            label: "Merge in the next batch",
            default: true,
            effect: { kind: "merge", after: "close" },
          },
        ],
        status: "ready",
        createdAt: 1_000,
      });
      // The stack stamps the card's offer as it goes up.
      const offerId = kept.stack.get(CARD)?.offerId ?? "";
      at.tasks.delivery.recordPermissionRecords(TASK, {
        completionOffers: [
          {
            cardId: CARD,
            offerId,
            headSha: shown,
            presentationRevision: 1,
            destination: {
              repoId: REPO,
              origin: "https://github.com/acme/meter.git",
              branch: BRANCH,
            },
            at: 1_000,
          },
        ],
        ...(words
          ? {
              override: {
                words: "merge",
                holds: ["asks-first"],
                until: "version",
                head: HEAD,
                at: 1_100,
              },
            }
          : {}),
      });
      return { at, kept, offerId };
    };

    it("approves the version the merge card shows, puts it in line and takes the card down", async () => {
      const { at, kept, offerId } = await merging();
      expect(offerId).not.toBe("");
      const outcome = await kept.settle.settleTaskDetailed(TASK, "merge-pr");
      expect(outcome.ok).toBe(false);
      expect(outcome.text).toContain("Approved and in line");
      expect(outcome.text).not.toContain(BATCH_MERGE_WORDS.needsCard);
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toMatchObject({
        status: "standing",
        issuer: "captain",
        approvedHead: HEAD,
        card: { id: CARD, offerId },
      });
      expect(kept.cards().map((card) => card.id)).not.toContain(CARD);
      await at.pass();
      expect(at.open()?.members.map((member) => [member.taskId, member.head])).toEqual([
        [TASK, HEAD],
      ]);
      expect(at.forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([]);
    });

    it("approves nothing when the merge card shows another version, and the card stays up", async () => {
      const { at, kept } = await merging("c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7");
      const outcome = await kept.settle.settleTaskDetailed(TASK, "merge-pr");
      expect(outcome).toMatchObject({ ok: false, text: BATCH_MERGE_WORDS.needsCard });
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toBeUndefined();
      expect(kept.cards().map((card) => card.id)).toContain(CARD);
      await at.pass();
      expect(at.line()).toEqual([]);
      expect(at.open()).toBeUndefined();
    });

    // Intent: the captain's answer on the review, "Hold it until open questions are
    // answered or your words cover them": words that pass only asking first leave the
    // decisions hold standing, as on every other first mate merge.
    it("holds while a crewmate question is open, unless the words pass the decisions too", async () => {
      const { at, kept } = await merging();
      kept.stack.put({
        id: "card-question",
        taskId: TASK,
        author: "crewmate",
        priority: 1,
        title: "Which zone reads first?",
        meta: TASK,
        body: "<p>Which zone reads first?</p>",
        actions: [
          { id: "local", label: "The local zone", default: true },
          { id: "utc", label: "UTC" },
        ],
        status: "ready",
        createdAt: 1_200,
      });
      const held = await kept.settle.settleTaskDetailed(TASK, "merge-pr");
      expect(held.ok).toBe(false);
      expect(held.text).toContain('the open question "Which zone reads first?" needs an answer');
      expect(held.text).toContain(softHoldWords("decisions", "firstmate"));
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toBeUndefined();
      expect(kept.cards().map((card) => card.id)).toContain(CARD);
      expect(at.line()).toEqual([]);

      at.tasks.delivery.recordPermissionRecords(TASK, {
        override: {
          words: "merge, the zone question can wait",
          holds: ["asks-first", "decisions"],
          until: "version",
          head: HEAD,
          at: 1_300,
        },
      });
      const outcome = await kept.settle.settleTaskDetailed(TASK, "merge-pr");
      expect(outcome.text).toContain("Approved and in line");
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toMatchObject({
        status: "standing",
        approvedHead: HEAD,
      });
    });

    it("approves nothing without the captain's recorded words: the merge is still his click", async () => {
      const { at, kept } = await merging(HEAD, false);
      const outcome = await kept.settle.settleTaskDetailed(TASK, "merge-pr");
      expect(outcome.refusal).toMatchObject({ refused: "autonomy-off" });
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toBeUndefined();
      expect(kept.cards().map((card) => card.id)).toContain(CARD);
      expect(at.line()).toEqual([]);
    });
  });

  it("puts the approved version in line with its story's title and commit words, and sends no merge", async () => {
    const at = home();
    await at.confirmed();
    const outcome = await at.service.merges.merge(TASK, at.guard());
    expect(outcome).toEqual({
      ok: false,
      text: `Approved and in line: ${BATCH_WAITING_WORDS.toLowerCase()}. The change merges with this project's next batch, as one commit of its own.`,
      plain: BATCH_WAITING_WORDS.toLowerCase(),
      stop: "queue",
    });
    await at.pass();
    expect(at.open()?.members).toMatchObject([
      {
        taskId: TASK,
        branch: BRANCH,
        head: HEAD,
        title: STORY.title,
        body: presentationCommitMessage(STORY, BUNDLED_NAMING),
      },
    ]);
    expect(at.forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([]);
    // The batch of one opened as this change's own pull request would read.
    expect(at.forge.batch).toMatchObject({ number: 31, title: STORY.title });
  });

  it("keeps the order of the approvals in line when a later approval's merge run reaches the line first", async () => {
    // The plan: the app combines "the whole line at home, in approval order".
    // A merge run reads the branch, its checks and its story before it reaches
    // the line, so a change approved first can arrive there second.
    const at = home();
    await at.confirmed();
    // A batch being checked, so the approvals after it wait in line.
    at.other("aa11bb22", "fix(dates): keep the dates file", "1".repeat(40));
    await at.pass();
    at.other("cd34ef56", "fix(export): keep the export file", "2".repeat(40));
    await at.pass();
    const later = at.line()[0]?.at as number;
    await at.service.merges.merge(TASK, at.guard({ approvedAt: later - 1 }));
    expect(at.line().map((change) => change.taskId)).toEqual([TASK, "cd34ef56"]);
  });

  it("waits while its batch is checked, shows its place as the batch check, then merges with the batch and names its own commit", async () => {
    const at = home();
    await at.confirmed();
    const guard = at.guard();
    await at.service.merges.merge(TASK, guard);
    await at.pass();

    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: false,
      text: `Cannot merge yet - ${BATCH_WAITING_WORDS}: the change is in batch #31, whose checks have not passed yet.`,
      plain: BATCH_WAITING_WORDS.toLowerCase(),
      stop: "queue",
    });
    // Its own check reading carries its place in the batch, kept on the task for the merge card.
    await at.service.checks.run(TASK, "crewmate");
    expect(at.tasks.get(TASK)?.delivery?.queueStatus).toEqual({
      head: HEAD,
      kind: "in-batch",
      words: BATCH_STATUS_WORDS.batch,
      link: "https://github.com/acme/meter/pull/31",
    });
    expect(at.service.checks.reading(TASK)?.overall).toBe("pending");

    at.forge.atHead[at.forge.batchHead] = [{ name: "build", state: "success" }];
    (at.forge.batch as NonNullable<BatchHostForge["batch"]>).readiness = "clean";
    await at.pass();
    const commit = at.forge.batchHead;
    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: true,
      text: "Merged with batch #31 on GitHub. https://github.com/acme/meter/pull/31",
      line: "Merged with batch #31 on GitHub",
      lineSaid: { m: "mergedWithBatchOn", a: { change: "#31", place: "GitHub" } },
      receipt: { head: HEAD, sha: id(`merge of ${commit}`) },
    });
    expect(at.heard.settled).toEqual([[TASK]]);
  });

  // INF-2114, the captain's checked improvement: "A project with no checks is
  // a recorded fact". Its crewmate records it once from its own pushed
  // version, and a batch of the project reads every change in it as declared.
  it("records the project as running no checks from its pushed version's declaration", async () => {
    const at = home();
    at.forge.states = [];
    await at.confirmed();
    const said = await at.service.checkTool.checkForCrew(TASK, {
      absentChecks: {
        headSha: HEAD,
        evidence: "The default branch holds no workflow, and its rules require no checks.",
        localGate: "The project's own tests passed at this version.",
        project: true,
      },
    });
    expect(said).toContain(PROJECT_ABSENCE_WORDS.recorded);
    expect(at.repos.get(REPO)?.noChecks).toMatchObject({
      task: at.tasks.get(TASK)?.key,
      head: HEAD,
    });
    // A later version needs no declaration of its own.
    expect(at.service.checks.declaredAbsent(TASK, "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7")).toBe(
      true,
    );
  });

  it("merges a change of a project recorded as running no checks with its batch, where no check ran on either", async () => {
    const at = home();
    at.forge.states = [];
    at.repos.configure(REPO, { requireChecks: false });
    await at.confirmed();
    const guard = at.guard();
    // Its own reading, where no check ran, holds nothing: it goes in line.
    expect(await at.service.merges.merge(TASK, guard)).toMatchObject({ ok: false, stop: "queue" });
    await at.pass();
    (at.forge.batch as NonNullable<BatchHostForge["batch"]>).readiness = "clean";
    await at.pass();
    expect(await at.service.merges.merge(TASK, guard)).toMatchObject({
      ok: true,
      line: "Merged with batch #31 on GitHub",
    });
    expect(at.heard.settled).toEqual([[TASK]]);
  });

  // INF-2114's review: a project whose workflows run only on pull requests
  // runs them on its batch's, which is the first check that runs there.
  it("ends the project's record when a check runs on its batch pull request, and the check holds the batch", async () => {
    const at = home();
    at.forge.states = [];
    at.repos.configure(REPO, { requireChecks: false });
    await at.confirmed();
    expect(await at.service.merges.merge(TASK, at.guard())).toMatchObject({
      ok: false,
      stop: "queue",
    });
    await at.pass();
    at.forge.report([{ name: "build", state: "pending" }], "clean");
    await at.pass();
    expect(at.repos.get(REPO)?.noChecks).toBeUndefined();
    expect(at.forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([]);
  });

  it("puts nothing in line while the pushed branch's own checks have not passed", async () => {
    const at = home();
    await at.confirmed();
    at.forge.states = ["failure"];
    expect(await at.service.merges.merge(TASK, at.guard())).toMatchObject({
      ok: false,
      notGreen: true,
      stop: "checks",
      plain: "the checks failed",
    });
    at.forge.states = ["pending"];
    expect(await at.service.merges.merge(TASK, at.guard())).toMatchObject({
      ok: false,
      notGreen: true,
      stop: "checks",
    });
    expect(at.line()).toEqual([]);
    expect(at.open()).toBeUndefined();
  });

  it("puts nothing in line for a branch that moved past the approved version, a held approval or a withdrawn one", async () => {
    const at = home();
    await at.confirmed();
    expect(
      await at.service.merges.merge(
        TASK,
        at.guard({ held: () => "the captain's newer words wait for the crewmate's declaration" }),
      ),
    ).toEqual({
      ok: false,
      text: "Cannot merge yet: the captain's newer words wait for the crewmate's declaration.",
      stop: "guidance",
    });
    expect(
      await at.service.merges.merge(
        TASK,
        at.guard({ beforeDispatch: () => "The merge approval was withdrawn" }),
      ),
    ).toEqual({
      ok: false,
      text: "Cannot merge: The merge approval was withdrawn.",
      stop: "withdrawn",
    });
    at.forge.pushed = "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7";
    expect(await at.service.merges.merge(TASK, at.guard())).toMatchObject({
      ok: false,
      plain: "it changed after the version you approved",
      stop: "moved",
    });
    expect(at.line()).toEqual([]);
    expect(at.open()).toBeUndefined();
  });

  it("refuses a version whose story was never confirmed on the pushed branch", async () => {
    const at = home();
    const outcome = await at.service.merges.merge(TASK, at.guard());
    expect(outcome.ok).toBe(false);
    expect(outcome.stop).not.toBe("queue");
    expect(at.line()).toEqual([]);
  });

  it("says why a change was left out of its batch", async () => {
    const at = home();
    await at.confirmed();
    at.conflicting.add(TASK);
    const guard = at.guard();
    await at.service.merges.merge(TASK, guard);
    await at.pass();
    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: false,
      text: `Cannot merge: the change was left out of its batch because ${LEFT_OUT_WORDS.conflict}.`,
      plain: LEFT_OUT_WORDS.conflict,
      stop: "conflict",
    });
  });

  // Intent: INF-4517's plan, piece 2 (the captain's "Approve and build"): a change left out
  // only for a clash with a change ahead says nothing can be done yet, and its kept merge
  // waits quietly as one in line does, waking no one to bring the branch up to date.
  it("says nothing can be done yet when the change was left out only for a clash with a change ahead", async () => {
    const at = home();
    await at.confirmed();
    at.conflicting.add(TASK);
    const guard = at.guard();
    await at.service.merges.merge(TASK, guard);
    await at.pass();
    // The combine found it clashes with an approved change ahead of it, not with the default branch.
    const reason = LEFT_OUT_WORDS.ahead("fix(parser): read dates with a time zone");
    const record = at.batches.record(REPO);
    at.repos.recordBatch(REPO, {
      ...record,
      leftOut: record.leftOut.map((entry) => ({ ...entry, reason, ahead: "t-parser" })),
    });
    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: false,
      text: `Cannot merge yet: the change was left out of its batch because ${reason}. Nothing can be done yet, since the default branch does not hold that change; the merge goes on once that batch merges or that change leaves it.`,
      plain: reason,
      stop: "queue",
    });
  });

  // Intent: INF-6147's accepted plan, piece 1: a change left out for a clash while its batch
  // stays open had its crewmate told to rebuild on that batch's version, so its kept merge
  // waits quietly and names that version as the base to declare the repair on.
  it("names the open batch's version to rebuild on when the change's crewmate was told to", async () => {
    const at = home();
    await at.confirmed();
    at.conflicting.add(TASK);
    const guard = at.guard();
    await at.service.merges.merge(TASK, guard);
    await at.pass();
    const reason = LEFT_OUT_WORDS.ahead("fix(parser): read dates with a time zone");
    const record = at.batches.record(REPO);
    const on = "9".repeat(40);
    const branch = "infinitary-batch/5d1e";
    at.repos.recordBatch(REPO, {
      ...record,
      open: {
        branch,
        head: on,
        base: "8".repeat(40),
        members: [],
        since: 1,
      },
      leftOut: record.leftOut.map((entry) => ({
        ...entry,
        reason,
        ahead: "t-parser",
        rebuild: { head: on, branch },
      })),
    });
    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: false,
      text: `Cannot merge yet: the change was left out of its batch because ${reason}. Its crewmate was told to rebuild it on its batch's version ${on} (branch ${branch}) and declare that push with check_change conflictRepair, giving ${on} as newBase; the rebuilt version then goes in line right behind that batch's changes and first in the next batch.`,
      plain: reason,
      stop: "queue",
    });
  });

  it("reads its batch's failed checks as its own when it is the batch's only change", async () => {
    const at = home();
    await at.confirmed();
    const guard = at.guard();
    await at.service.merges.merge(TASK, guard);
    await at.pass();
    at.forge.atHead[at.forge.batchHead] = [{ name: "unit-tests", state: "failure" }];
    await at.pass();
    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: false,
      text: "Cannot merge yet - the checks of its batch, #31, failed: unit-tests. Its crewmate reads them there and repairs the change in a new version.",
      plain: "the checks of its batch failed",
      notGreen: true,
      stop: "checks",
    });
    await at.service.checks.run(TASK, "crewmate");
    expect(at.service.checks.reading(TASK)?.overall).toBe("red");
    expect(at.tasks.get(TASK)?.delivery?.queueStatus).toMatchObject({ kind: "failed" });
  });

  // Intent: INF-5097 piece 1 with the captain's answer Keep: a sent-back version keeps its
  // approval and waits, as a failed batch of one does, for a repair declared with
  // conflictRepair; its merge card's Batch check keeps how often and why it went back.
  it("waits on a repair when its batch sent it back, and keeps the send-back on its batch check", async () => {
    const at = home();
    await at.confirmed();
    const guard = at.guard();
    // This change and another approved one wait in line together, so their batch holds on a failure.
    at.batches.enqueue(REPO, {
      taskId: TASK,
      branch: BRANCH,
      head: HEAD,
      title: STORY.title,
      body: "",
      at: 1,
    });
    at.other(
      "parser01",
      "fix(parser): read dates with a time zone",
      "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    );
    await at.pass();
    expect(at.open()?.members.map((member) => member.taskId)).toEqual([TASK, "parser01"]);
    at.forge.atHead[at.forge.batchHead] = [
      { name: "unit-tests", state: "failure" },
      { name: "journeys", state: "cancelled" },
    ];
    await at.pass();
    const reason = "Its date test fails on the batch's version.";
    expect(
      await at.batches.answer(REPO, {
        action: "send-back",
        head: at.forge.batchHead,
        changes: [{ taskId: TASK, reason }],
      }),
    ).toBeUndefined();
    expect(await at.service.merges.merge(TASK, guard)).toEqual({
      ok: false,
      text: `Cannot merge yet - the change was sent back from its batch #31: ${reason} Its crewmate repairs it in a new version.`,
      plain: "it was sent back from its batch",
      notGreen: true,
      stop: "checks",
    });
    // The kept merge does not put the sent-back version in line again.
    await at.pass();
    expect(at.line().map((entry) => entry.taskId)).not.toContain(TASK);
    await at.service.checks.run(TASK, "crewmate");
    expect(at.tasks.get(TASK)?.delivery?.queueStatus).toMatchObject({
      kind: "failed",
      sentBack: [
        {
          head: HEAD,
          reason,
          notRun: ["journeys"],
          change: "#31",
          link: "https://github.com/acme/meter/pull/31",
        },
      ],
    });
  });

  it("leaves the line and the open batch when its approval is removed", async () => {
    const at = home();
    await at.confirmed();
    await at.service.merges.merge(TASK, at.guard());
    await at.pass();
    expect(at.open()?.members.map((member) => member.taskId)).toEqual([TASK]);
    await at.service.merges.removeQueuedApproval(TASK, {
      head: HEAD,
      target: { repoId: REPO, branch: BRANCH },
    } as Parameters<typeof at.service.merges.removeQueuedApproval>[1]);
    await at.pass();
    expect(at.open()).toBeUndefined();
    expect(at.batches.standing(REPO, TASK, HEAD)).toBeUndefined();
  });

  // The independent review's finding on this change, a bug being fixed, with the captain's
  // answer to it: a story revised at the approved version keeps its change in its batch.
  it("keeps its place in its batch when its story is revised at the approved version, and the batch takes the story's words", async () => {
    const at = home();
    await at.confirmed();
    const guard = at.guard();
    await at.service.merges.merge(TASK, guard);
    await at.pass();
    expect(at.forge.batch).toMatchObject({ number: 31, title: STORY.title, state: "open" });

    // The crewmate revises the story's What changed at the same pushed version.
    const revised: ChangePresentation = {
      ...STORY,
      revision: 2,
      whatChanged: ["A date keeps the time zone it was written with."],
    };
    at.tasks.delivery.updateChangePresentation(TASK, (kept) => ({
      ...(kept as NonNullable<typeof kept>),
      revisions: [STORY, revised],
    }));
    expect(await at.service.publication.open(TASK, { title: STORY.title, presentation: 2 })).toBe(
      BATCH_OPEN_WORDS.confirmed(BRANCH),
    );
    await at.pass();
    expect(at.open()?.members).toMatchObject([
      { taskId: TASK, head: HEAD, body: presentationCommitMessage(revised, BUNDLED_NAMING) },
    ]);
    // The same pull request, still open: none was closed and none opened beside it.
    expect(at.forge.calls.filter((call) => call.startsWith("openChange"))).toHaveLength(1);
    expect(at.forge.calls.filter((call) => call.startsWith("close"))).toEqual([]);
    expect(at.forge.batch).toMatchObject({ number: 31, state: "open" });
    // Its kept merge reads the change still in its batch, and puts nothing in line again.
    expect(await at.service.merges.merge(TASK, guard)).toMatchObject({ stop: "queue" });
    expect(at.line()).toEqual([]);
  });

  // Intent: piece 1 of the captain's approved plan for smoother delivery: "in a batched
  // project, the app republishes the unchanged story itself after an accepted no-impact update
  // once checks pass, with no wake; a newer unpublished author revision still refuses".
  describe("brought up to date by a repair the app accepted under the captain's kept approval", () => {
    const REPAIRED = "e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80912";
    /** The captain's merge approval at HEAD, as their click on the merge card records it. */
    const approvedAt = (
      at: ReturnType<typeof home>,
      lineage: MergeAuthorization["lineage"] = [],
      approvedHead = HEAD,
      /** The project's name where it lives when the captain clicked, and the approval's id. */
      where: { name: string; id: string } = { name: "meter", id: "auth-1" },
    ) =>
      at.tasks.delivery.recordPermissionRecords(TASK, {
        mergeAuthorization: {
          version: 1,
          id: where.id,
          generation: 1,
          issuer: "captain",
          at: 1,
          card: { id: `card-${TASK}-1`, offerId: "offer-1", actionId: "merge" },
          target: {
            repoId: REPO,
            host: "github.com",
            owner: "acme",
            name: where.name,
            branch: BRANCH,
            delivery: "direct-pr",
            method: "squash",
          },
          approvedHead,
          lineage,
          proceedWithOpen: false,
          status: "standing",
        },
      });
    /** The approval as the accepted repair leaves it: approved at HEAD, now covering REPAIRED. */
    const repaired = (at: ReturnType<typeof home>) => {
      at.forge.pushed = REPAIRED;
      approvedAt(at, [
        {
          fromHead: HEAD,
          toHead: REPAIRED,
          newBase: BATCH_BASE,
          impact: "none",
          changedPaths: [],
          evidence: "The same change on main's newer version.",
          validation: "The checks passed at the repaired version.",
          generation: 1,
          at: 2,
        },
      ]);
      return at.guard({ head: REPAIRED });
    };

    it("puts the repaired version in line with the story's words unchanged, the story confirmed again at that version", async () => {
      const at = home();
      await at.confirmed();
      const outcome = await at.service.merges.merge(TASK, repaired(at));
      expect(outcome).toMatchObject({ ok: false, stop: "queue" });
      expect(outcome.text).toMatch(/^Approved and in line/);
      await at.pass();
      expect(at.open()?.members).toMatchObject([
        {
          taskId: TASK,
          head: REPAIRED,
          title: STORY.title,
          body: presentationCommitMessage(STORY, BUNDLED_NAMING),
        },
      ]);
      const ledger = at.tasks.delivery.changePresentation(TASK, BRANCH);
      expect(ledger?.revisions.at(-1)).toMatchObject({
        revision: 2,
        head: REPAIRED,
        whatChanged: STORY.whatChanged,
      });
      expect(ledger?.completion).toMatchObject({ revision: 2, head: REPAIRED, refreshOf: 1 });
    });

    // Intent: INF-6160's host fix - an approved change whose story was confirmed while
    // the project was private still carries that story once the project goes public,
    // with no new approval: confirmed again at the repaired version for the audience
    // read now, and shown on the batch's pull request at that audience.
    it("carries a story confirmed while the project was private once it went public", async () => {
      const at = home();
      const audience = vi.spyOn(at.forge.attachments, "destination") as MockInstance<
        () => Promise<HostedPresentationDestination>
      >;
      const privately: HostedPresentationDestination = {
        ...METER_DESTINATION,
        visibility: "private",
      };
      audience.mockResolvedValue(privately);
      at.prepare({ ...STORY, destination: privately });
      await at.service.publication.open(TASK, { title: STORY.title, presentation: 1 });
      audience.mockResolvedValue(METER_DESTINATION);

      const outcome = await at.service.merges.merge(TASK, repaired(at));
      expect(outcome).toMatchObject({ ok: false, stop: "queue" });
      const ledger = at.tasks.delivery.changePresentation(TASK, BRANCH);
      expect(ledger?.revisions.at(-1)).toMatchObject({
        revision: 2,
        head: REPAIRED,
        destination: METER_DESTINATION,
        whatChanged: STORY.whatChanged,
      });
      expect(ledger?.completion).toMatchObject({ revision: 2, head: REPAIRED, refreshOf: 1 });
      const { story, region } = await at.presentations.batchRegion(
        TASK,
        BRANCH,
        REPAIRED,
        at.forge,
      );
      expect(story.destination).toEqual(METER_DESTINATION);
      expect(region).toContain("infinitary-story:ab12cd34:end");
      expect(region).toMatch(/Dates with a time zone are read as written/);

      // Any other change of the project still holds its story out of the batch.
      audience.mockResolvedValue({ ...METER_DESTINATION, projectId: 1422452336 });
      await expect(at.presentations.batchRegion(TASK, BRANCH, REPAIRED, at.forge)).rejects.toThrow(
        "The publication destination or audience changed.",
      );
    });

    // Intent: INF-5097 piece 1 with the captain's answer Keep: "a repair declared unchanged
    // rejoins after its proof", while the version sent back never rejoins. The crewmate
    // declares its repair with check_change conflictRepair, read with git in the project's
    // folder, and the app's kept merge - as the check watch runs it once checks settle -
    // puts the repaired version in line by itself, with no merge card and no new approval.
    it("puts a repair declared unchanged after a send-back in line by itself once its checks pass", async () => {
      const project = repairedProject();
      const at = home({ dir: project.dir, head: project.approved });
      const kept = keptMerge(at);
      await at.confirmed();
      approvedAt(at, [], project.approved);
      const approval = at.tasks.get(TASK)?.delivery?.mergeAuthorization;
      // The approved change and another wait in line together, so their batch holds on a failure.
      at.batches.enqueue(REPO, {
        taskId: TASK,
        branch: BRANCH,
        head: project.approved,
        title: STORY.title,
        body: "",
        at: 1,
      });
      at.other(
        "parser01",
        "fix(parser): read dates with a time zone",
        "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      );
      await at.pass();
      expect(at.open()?.members.map((member) => member.taskId)).toEqual([TASK, "parser01"]);
      at.forge.atHead[at.forge.batchHead] = [{ name: "unit-tests", state: "failure" }];
      await at.pass();
      await at.batches.answer(REPO, {
        action: "send-back",
        head: at.forge.batchHead,
        changes: [{ taskId: TASK, reason: "Its date test fails on the batch's version." }],
      });
      // The parser's batch merges without it.
      at.forge.report([{ name: "unit-tests", state: "success" }], "clean");
      await at.pass();
      expect(at.open()).toBeUndefined();
      await kept.runMergeAuthorization(TASK);
      expect(at.line()).toEqual([]);
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toMatchObject({
        id: approval?.id,
        status: "standing",
      });

      // The crewmate pushes its repair, and its branch's own checks are still running.
      at.forge.pushed = project.repaired;
      at.forge.states = ["pending"];
      const answer = await at.service.checkTool.checkForCrew(TASK, {
        conflictRepair: {
          fromHead: project.approved,
          toHead: project.repaired,
          newBase: project.base,
          impact: "none",
          changedPaths: [],
          evidence: "The same parser change on the newer main.",
          validation: "Ran the parser's date tests and the checks that never ran in the batch.",
        },
      });
      expect(answer).not.toMatch(/refused/i);
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toMatchObject({
        id: approval?.id,
        status: "standing",
        approvedHead: project.approved,
        lineage: [{ fromHead: project.approved, toHead: project.repaired, impact: "none" }],
      });
      // The kept merge runs as the crewmate's turn ends: nothing goes in line before green.
      await kept.runMergeAuthorization(TASK);
      await at.pass();
      expect(at.line()).toEqual([]);
      expect(at.open()).toBeUndefined();

      // The checks pass, and the check watch runs the kept merge again: the repaired version
      // goes in line for the next batch on the same approval.
      at.forge.states = ["success"];
      await kept.runMergeAuthorization(TASK);
      await at.pass();
      expect(at.open()?.members.map((member) => [member.taskId, member.head])).toEqual([
        [TASK, project.repaired],
      ]);
      expect(at.tasks.get(TASK)?.delivery?.mergeAuthorization).toMatchObject({
        id: approval?.id,
        status: "standing",
      });
      expect(kept.cards()).toEqual([]);
      expect(at.batches.standing(REPO, TASK, project.approved)).toMatchObject({
        state: "sent-back",
      });
    });

    // Intent: INF-5097 with the captain's answer on its review, "Keep the old block; require
    // a new version": a send-back made before the project moved to a new address still
    // stands at its version there. Fresh approval at the new address does not put the
    // sent-back version in line through the kept merge, and a new version approved there
    // does go in line.
    it("keeps a send-back made before the project moved: the same version approved again at the new address stays out, and a new version goes in line", async () => {
      const at = home();
      const kept = keptMerge(at);
      await at.confirmed();
      approvedAt(at);
      // The approved change and another wait in line together, so their batch holds on a failure.
      at.batches.enqueue(REPO, {
        taskId: TASK,
        branch: BRANCH,
        head: HEAD,
        title: STORY.title,
        body: "",
        at: 1,
      });
      at.other(
        "parser01",
        "fix(parser): read dates with a time zone",
        "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      );
      await at.pass();
      at.forge.atHead[at.forge.batchHead] = [{ name: "unit-tests", state: "failure" }];
      await at.pass();
      const reason = "Its date test fails on the batch's version.";
      await at.batches.answer(REPO, {
        action: "send-back",
        head: at.forge.batchHead,
        changes: [{ taskId: TASK, reason }],
      });
      at.forge.report([{ name: "unit-tests", state: "success" }], "clean");
      await at.pass();
      expect(at.open()).toBeUndefined();

      // The project moves to a new address, and the captain approves the same version there.
      at.repos.configure(REPO, { origin: "https://github.com/acme/new-meter.git" });
      await at.pass();
      approvedAt(at, [], HEAD, { name: "new-meter", id: "auth-moved" });
      at.forge.states = ["success"];
      await kept.runMergeAuthorization(TASK);
      await at.pass();
      expect(at.line()).toEqual([]);
      expect(at.open()).toBeUndefined();
      expect(at.heard.addressMoved).toEqual([]);
      expect(at.batches.standing(REPO, TASK, HEAD)).toMatchObject({ state: "sent-back", reason });
      await at.service.checks.run(TASK, "crewmate");
      expect(at.tasks.get(TASK)?.delivery?.queueStatus).toMatchObject({
        kind: "failed",
        sentBack: [{ head: HEAD, reason }],
      });

      // The crewmate pushes a new version with its confirmed story, its checks pass, and
      // the captain approves it at the new address: the kept merge puts it in line.
      const REPAIR = "c3d4e5f60718293a4b5c6d7e8f9012345678a1b2";
      at.forge.pushed = REPAIR;
      at.prepare({ ...STORY, head: REPAIR });
      await at.service.publication.open(TASK, { title: STORY.title, presentation: 1 });
      approvedAt(at, [], REPAIR, { name: "new-meter", id: "auth-repair" });
      await kept.runMergeAuthorization(TASK);
      await at.pass();
      expect(at.open()?.members.map((member) => [member.taskId, member.head])).toEqual([
        [TASK, REPAIR],
      ]);
      expect(at.open()?.origin).toBe("https://github.com/acme/new-meter.git");
      expect(kept.cards()).toEqual([]);
    });

    it("still refuses where its author prepared a newer story that was never confirmed", async () => {
      const at = home();
      await at.confirmed();
      const newer: ChangePresentation = {
        ...STORY,
        revision: 2,
        head: REPAIRED,
        whatChanged: ["A date keeps the time zone it was written with."],
      };
      at.tasks.delivery.updateChangePresentation(TASK, (kept) => ({
        ...(kept as NonNullable<typeof kept>),
        revisions: [STORY, newer],
      }));
      const outcome = await at.service.merges.merge(TASK, repaired(at));
      expect(outcome.ok).toBe(false);
      expect(outcome.stop).not.toBe("queue");
      // The story hold: the newer story is its author's to confirm.
      expect(outcome.text).toContain(softHoldWords("story", "firstmate"));
      expect(at.line()).toEqual([]);
      expect(at.tasks.delivery.changePresentation(TASK, BRANCH)?.revisions.at(-1)).toEqual(newer);
    });
  });

  // Intent: the follow-up filed at this project's own switch from the team queue (INF-3773):
  // "a version still carrying the queue's waiting mark joins the person's own batch instead of
  // waiting forever". An earlier version of the app wrote that mark where the project lives, and
  // nothing answers it now.
  it("is not held by the waiting mark an earlier version's team queue left on its version", async () => {
    const at = home();
    await at.confirmed();
    at.forge.atHead[HEAD] = [
      { name: "linux-checks", state: "success" },
      { name: BATCH_CHECK, state: "pending", statusId: 41, detail: BATCH_WAITING_WORDS },
    ];

    await at.service.checks.run(TASK, "crewmate");
    expect(at.service.checks.reading(TASK)?.overall).toBe("green");
    // The captain's approval, kept from before the switch, runs again.
    expect(await at.service.merges.merge(TASK, at.guard({ unattended: true }))).toMatchObject({
      ok: false,
      stop: "queue",
    });
    await at.pass();
    expect(at.open()?.members).toMatchObject([{ taskId: TASK, head: HEAD }]);
  });
});

describe("a repair's answer to its project's held batch", () => {
  const PARSER_HEAD = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
  const EXPORT_HEAD = "0f9e8d7c6b5a49382716f5e4d3c2b1a009182736";
  const LEGEND_HEAD = "7e6d5c4b3a2918070f6e5d4c3b2a190817263544";
  const AXIS_HEAD = "3c2b1a0918f7e6d5c4b3a2918070f6e5d4c3b2a1";

  /** Three other tasks' changes in one batch whose checks failed; this task is the repair. */
  async function held() {
    const at = home();
    at.other("parser01", "fix(parser): read dates with a time zone", PARSER_HEAD);
    at.other("export02", "feat(export): add a CSV export", EXPORT_HEAD);
    at.other("legend03", "fix(chart): keep the legend inside the chart", LEGEND_HEAD);
    await at.pass();
    at.forge.atHead[at.forge.batchHead] = [{ name: "unit-tests", state: "failure" }];
    await at.pass();
    expect(at.open()?.hold).toMatchObject({ reason: "checks", checks: ["unit-tests"] });
    return at;
  }
  const evidence =
    "The date test fails with the parser change alone and passes without it; the export and legend changes touch neither.";

  it("refuses a declaration where no batch of the project is held", async () => {
    const at = home();
    expect(await at.service.checkTool.checkForCrew(TASK, { batch: { fix: true, evidence } })).toBe(
      BATCH_DECLARATION_WORDS.none,
    );
  });

  it("sends two changes back, each with the reason its crewmate reads, and the rest go on", async () => {
    const at = await held();
    const said = await at.service.checkTool.checkForCrew(TASK, {
      batch: {
        sendBack: [
          { task: "parser01", reason: "its date test fails on the batch's version" },
          { task: "export02", reason: "its export reads the dates the parser change moved" },
        ],
        evidence,
      },
    });
    expect(said).toBe(BATCH_DECLARATION_WORDS.sentBack(2));
    expect(at.heard.sentBack).toEqual([
      { taskId: "parser01", reason: "its date test fails on the batch's version" },
      { taskId: "export02", reason: "its export reads the dates the parser change moved" },
    ]);
    expect(at.open()?.members.map((member) => member.taskId)).toEqual(["legend03"]);
    expect(at.open()?.hold).toBeUndefined();
  });

  it("refuses a send-back that names a change the batch does not carry, or gives no reason", async () => {
    const at = await held();
    expect(
      await at.service.checkTool.checkForCrew(TASK, {
        batch: { sendBack: [{ task: TASK, reason: "it broke the date test" }], evidence },
      }),
    ).toBe(
      // The batch's changes are named by the keys a person reads on their tasks.
      BATCH_DECLARATION_WORDS.notMember(
        TASK,
        ["parser01", "export02", "legend03"].map((member) => at.tasks.get(member)?.key as string),
      ),
    );
    expect(
      await at.service.checkTool.checkForCrew(TASK, {
        batch: { sendBack: [{ task: "parser01", reason: "  " }], evidence },
      }),
    ).toBe(BATCH_DECLARATION_WORDS.reason("parser01"));
    expect(at.heard.sentBack).toEqual([]);
    expect(at.open()?.members).toHaveLength(3);
  });

  it("refuses a declaration with no evidence, with neither answer, and one sent beside another declaration", async () => {
    const at = await held();
    const tool = at.service.checkTool;
    expect(await tool.checkForCrew(TASK, { batch: { fix: true, evidence: " " } })).toBe(
      BATCH_DECLARATION_WORDS.evidence,
    );
    expect(await tool.checkForCrew(TASK, { batch: { evidence } })).toBe(
      BATCH_DECLARATION_WORDS.one,
    );
    expect(
      await tool.checkForCrew(TASK, {
        batch: { fix: true, evidence },
        absentChecks: { headSha: HEAD, evidence: "none run", localGate: "passed" },
      }),
    ).toBe("Batch declaration refused: send batch on its own, not beside absentChecks.");
    expect(at.batches.record(REPO).fixes).toBeUndefined();
    expect(at.open()?.hold).toBeDefined();
  });

  // Intent: the captain's approved plan to stop changes bouncing between batches, piece 3:
  // one declaration sends the change at fault back and declares the repair's own change the
  // fix, which the old route refused.
  it("sends a change back and declares its own change the fix in one declaration: the batch waits for the fix", async () => {
    const at = await held();
    const before = at.forge.batchHead;
    const sendBack = [{ task: "parser01", reason: "its date test fails on the batch's version" }];
    expect(
      await at.service.checkTool.checkForCrew(TASK, { batch: { fix: true, sendBack, evidence } }),
    ).toBe(BATCH_DECLARATION_WORDS.fixAndSentBack(1));
    expect(at.heard.sentBack).toEqual([
      { taskId: "parser01", reason: "its date test fails on the batch's version" },
    ]);
    // The change sent back keeps its approval (INF-5097, the captain's answer Keep), and
    // its version stands sent back, so it cannot join with the fix.
    expect(at.approvals.has("parser01")).toBe(true);
    expect(at.batches.standing(REPO, "parser01", PARSER_HEAD)).toMatchObject({
      state: "sent-back",
    });
    expect(at.batches.record(REPO).fixes).toEqual([TASK]);
    // Still held at the version that failed, and nothing is combined or pushed.
    await at.pass();
    expect(at.open()?.hold).toBeDefined();
    expect(at.forge.batchHead).toBe(before);

    await at.confirmed();
    await at.service.merges.merge(TASK, at.guard());
    await at.pass();
    expect(at.open()?.members.map((member) => member.taskId)).toEqual([
      "export02",
      "legend03",
      TASK,
    ]);
    expect(at.open()?.hold).toBeUndefined();
    expect(at.forge.batchHead).not.toBe(before);
  });

  // Intent: INF-4421's finding, a bug being fixed: a repair's change approved before it was
  // declared the held batch's fix never joined, and its kept approval left it no new merge
  // card, so the batch and the fix waited on each other.
  it("declares its own change the fix after its approval: it joins the held batch at once with the changes waiting in line", async () => {
    const at = await held();
    const before = at.forge.batchHead;
    at.other("axis04", "fix(chart): label the time axis in local time", AXIS_HEAD);
    await at.confirmed();
    await at.service.merges.merge(TASK, at.guard());
    await at.pass();
    expect(at.open()?.hold).toBeDefined();
    expect(at.line().map((change) => change.taskId)).toEqual(["axis04", TASK]);

    expect(await at.service.checkTool.checkForCrew(TASK, { batch: { fix: true, evidence } })).toBe(
      BATCH_DECLARATION_WORDS.fixApproved,
    );
    await at.pass();
    expect(at.open()?.members.map((member) => member.taskId)).toEqual([
      "parser01",
      "export02",
      "legend03",
      TASK,
      "axis04",
    ]);
    expect(at.open()?.hold).toBeUndefined();
    expect(at.line()).toEqual([]);
    expect(at.forge.batchHead).not.toBe(before);
  });

  it("declares its own change the batch's fix: once approved it joins the held batch and ends the hold", async () => {
    const at = await held();
    const before = at.forge.batchHead;
    expect(await at.service.checkTool.checkForCrew(TASK, { batch: { fix: true, evidence } })).toBe(
      BATCH_DECLARATION_WORDS.fix,
    );
    expect(at.batches.record(REPO).fixes).toEqual([TASK]);
    // Declared, not yet approved: the batch stays held.
    await at.pass();
    expect(at.open()?.hold).toBeDefined();

    await at.confirmed();
    await at.service.merges.merge(TASK, at.guard());
    await at.pass();
    expect(at.open()?.members.map((member) => member.taskId)).toEqual([
      "parser01",
      "export02",
      "legend03",
      TASK,
    ]);
    expect(at.open()?.hold).toBeUndefined();
    expect(at.forge.batchHead).not.toBe(before);
    expect(at.forge.batch?.title).toBe("chore: merge 4 approved changes");
  });

  // Intent: the captain's fix 2 from the daily velocity review: "Merge a held batch once its
  // version passes, even on a rerun, and send a test-only fix declared meanwhile to the next
  // batch." The project's own rerun passed the failed test, while the host still reads it failed.
  it("declares the held version passed on its rerun beside its own fix: the batch merges as it is, and the fix goes next", async () => {
    const at = await held();
    const version = at.forge.batchHead;
    expect(
      await at.service.checkTool.checkForCrew(TASK, {
        batch: { passed: version, fix: true, evidence },
      }),
    ).toBe(BATCH_DECLARATION_WORDS.passedRecorded(true));
    expect(at.batches.record(REPO).fixes).toEqual([TASK]);
    (at.forge.batch as NonNullable<BatchHostForge["batch"]>).readiness = "clean";
    await at.pass();
    expect(at.open()).toBeUndefined();
    expect(at.batches.record(REPO).receipts.map((receipt) => receipt.taskId)).toEqual([
      "parser01",
      "export02",
      "legend03",
    ]);

    await at.confirmed();
    await at.service.merges.merge(TASK, at.guard());
    await at.pass();
    expect(at.open()?.members).toMatchObject([{ taskId: TASK, fix: true }]);
  });

  it("refuses passed for a version the batch is not held at, or beside a send-back", async () => {
    const at = await held();
    const tool = at.service.checkTool;
    expect(await tool.checkForCrew(TASK, { batch: { passed: PARSER_HEAD, evidence } })).toBe(
      BATCH_DECLARATION_WORDS.passed["other-version"],
    );
    expect(
      await tool.checkForCrew(TASK, {
        batch: {
          passed: at.forge.batchHead,
          sendBack: [{ task: "parser01", reason: "its date test fails" }],
          evidence,
        },
      }),
    ).toBe(BATCH_DECLARATION_WORDS.passedSentBack);
    expect(at.open()?.passed).toBeUndefined();
    expect(at.open()?.members).toHaveLength(3);
    expect(at.batches.record(REPO).fixes).toBeUndefined();
  });
});

describe("the words a batch gives a task", () => {
  it("tells a left-out change's task what to do next in words that name no tool of one host", () => {
    expect(BATCH_WORDS.leftOut(LEFT_OUT_WORDS.moved)).toBe(
      "This change was left out of its batch because its pushed branch is no longer at the approved version, so the batch could not carry what was approved. Bring the branch up to date and show a new version; the other changes went on.",
    );
  });
});
