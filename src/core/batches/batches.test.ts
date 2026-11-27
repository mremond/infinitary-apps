import { isDeepStrictEqual } from "node:util";
import {
  BATCH_STATUS_WORDS,
  type BatchChange,
  type MergeWays,
  SQUASH_ONLY_WORDS,
} from "@shared/batches";
import { formatTime } from "@shared/i18n/format";
import { describe, expect, it, vi } from "vitest";
import {
  EVERY_WAY,
  failed,
  MAIN_AT_START,
  passed,
  REPO,
  running,
  type StandInPull,
  setup,
} from "../../../tests/helpers/batchesHarness";
import { BATCH_WORDS } from "./batches";
import { LEFT_OUT_WORDS } from "./combine";

// Intent: the captain's approved plan for batches of their own, piece 1. Its done-when list
// asks for the formation rule, a change left out, the merge-way choice from host facts,
// two changes sent back, a fix ending a hold, an approval withdrawn, restart reconcile and
// receipts; its rules say a batch of one reads and merges as that change's pull request
// does, a failed batch holds while later approvals wait, and the host's own reading
// decides what happens next. The project and its host are `batchesHarness.ts`.

const PARSER: BatchChange = {
  taskId: "t-parser",
  branch: "fm/task-parser",
  head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
  title: "fix(parser): read dates with a time zone",
  body: "- Dates with a time zone are read as written.",
  at: 1_000,
};
const EXPORT: BatchChange = {
  taskId: "t-export",
  branch: "fm/task-export",
  head: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  title: "feat(export): add a CSV export",
  body: "- A report exports as CSV.",
  at: 2_000,
};
const LEGEND: BatchChange = {
  taskId: "t-legend",
  branch: "fm/task-legend",
  head: "0f9e8d7c6b5a49382716f5e4d3c2b1a009182736",
  title: "fix(chart): keep the legend inside the chart",
  body: "- The legend no longer overlaps the bars.",
  at: 3_000,
};
const AXIS: BatchChange = {
  taskId: "t-axis",
  branch: "fm/task-axis",
  head: "7e6d5c4b3a2918070f6e5d4c3b2a190817263544",
  title: "fix(chart): label the time axis in local time",
  body: "- The time axis reads in the viewer's own time.",
  at: 4_000,
};

/** A repair's own change, declared the held batch's fix. */
const FIX: BatchChange = {
  taskId: "t-fix",
  branch: "fm/task-fix",
  head: "3c2b1a0918f7e6d5c4b3a2918070f6e5d4c3b2a1",
  title: "fix(export): read dates through the parser's new form",
  body: "- The export reads dates as the parser now writes them.",
  at: 7_000,
};

/** Two approved changes combined and opened as pull request #31. */
async function batchOfTwo(ways: MergeWays = EVERY_WAY) {
  const home = setup(ways);
  home.approve(PARSER);
  home.approve(EXPORT);
  await home.pass();
  return home;
}

// Intent: the captain's answer in the approved plan (`squash_only`): batched pull requests
// are not offered to a project that allows only squash merges, since a batch keeps one commit
// for each change. The choice in Settings and the first mate's project settings both pass here.
describe("choosing batched pull requests", () => {
  it("is refused with its reason for a project that allows only squash merges", async () => {
    const home = setup({ squash: true, rebase: false, merge: false });
    await expect(home.batches.refuseSquashOnly(REPO)).rejects.toThrow(SQUASH_ONLY_WORDS);
  });

  it("is taken for a project that can keep each change's commit, by a rebase merge or a merge commit", async () => {
    for (const ways of [
      { squash: true, rebase: true, merge: false },
      { squash: false, rebase: false, merge: true },
    ])
      await expect(setup(ways).batches.refuseSquashOnly(REPO)).resolves.toBeUndefined();
  });

  it("is not refused while the host cannot say which merges the project allows", async () => {
    const home = setup({ squash: true, rebase: false, merge: false });
    home.host.waysUnreadable = true;
    await expect(home.batches.refuseSquashOnly(REPO)).resolves.toBeUndefined();
  });
});

describe("forming a batch", () => {
  it("keeps an open batch from claiming or cleaning up a reused number after a project move", async () => {
    const home = await batchOfTwo();
    const open = home.open();
    const pull = home.host.pulls.get(31);
    if (!pull) throw new Error("The fixture needs the open batch request.");
    await home.approve(LEGEND);
    expect(home.record().line.map((member) => member.taskId)).toEqual([LEGEND.taskId]);
    const formerReceipts = home.batches.record(REPO).receipts;
    // Simulate an unrelated request already merged at the new address, even at the same head.
    Object.assign(pull, { state: "closed", merged: true });
    const get = home.repos.get.bind(home.repos);
    const moved = vi.spyOn(home.repos, "get").mockImplementation((id) => {
      const repo = get(id);
      return repo && id === REPO
        ? { ...repo, origin: "https://github.com/acme/new-meter.git" }
        : repo;
    });
    try {
      await home.pass();
      expect(home.record().open).toBeUndefined();
      expect(home.heard.addressMoved.map((entry) => entry.taskId)).toEqual([
        PARSER.taskId,
        EXPORT.taskId,
        LEGEND.taskId,
      ]);
      // Leaving for a former address is not a send-back: no history is kept for it.
      expect(home.heard.sentBack).toEqual([]);
      expect(home.record().sentBack).toBeUndefined();
      const fresh = { ...LEGEND, taskId: "fresh-task", branch: "fm/fresh-task" };
      await home.approve(fresh);
      await home.pass();
      expect(home.open()).toMatchObject({
        number: 32,
        origin: "https://github.com/acme/new-meter.git",
      });
      expect(home.open().members.map((member) => member.taskId)).toEqual([fresh.taskId]);
      expect(home.record().receipts).toEqual(formerReceipts);
      expect(home.heard.settled).toEqual([]);
      expect(home.host.pulls.get(31)).toBe(pull);
      expect(home.host.branches.get(open.branch)).toBe(open.head);
    } finally {
      moved.mockRestore();
    }
  });

  it("combines the whole line into one pull request, one commit for each change, in approval order", async () => {
    const home = await batchOfTwo();
    expect([...home.host.pulls.keys()]).toEqual([31]);
    const pull = home.host.pulls.get(31) as StandInPull;
    expect(pull.branch).toBe("infinitary-batch/3fa9c1d2");
    expect(pull.title).toBe("chore: merge 2 approved changes");
    expect(home.host.carried.get(pull.head)?.map((commit) => commit.title)).toEqual([
      PARSER.title,
      EXPORT.title,
    ]);
    expect(pull.body).toContain(`- ${PARSER.title}\n- ${EXPORT.title}`);
    expect(pull.body).toContain("<!-- story of t-parser -->");
    expect(pull.body).toContain("<!-- story of t-export -->");
    expect(home.open()).toMatchObject({
      number: 31,
      url: "https://github.com/acme/meter/pull/31",
      base: MAIN_AT_START,
      head: pull.head,
    });
    expect(home.record().line).toEqual([]);
    expect(home.batches.status(REPO, PARSER.taskId, PARSER.head)).toMatchObject({
      kind: "in-batch",
      link: "https://github.com/acme/meter/pull/31",
    });
    expect(home.heard.notes).toEqual([BATCH_WORDS.formed("meter", "#31", 2)]);
  });

  // The plan's "A batch of several is titled in the app's words in the naming form", under
  // the captain's ruling that no naming form lives in the app: the active runbook gives it.
  it("titles a batch of several in the form the active naming runbook gives a name the app writes, and plainly with none on", async () => {
    const team = setup();
    team.nameBy({
      pattern: "^\\[[A-Z][A-Z0-9-]*\\] \\S.+$",
      message: 'Start with the area in capitals and brackets, such as "[DOCS] Explain the export".',
      compose: "[APP] {summary}",
    });
    team.approve(PARSER);
    team.approve(EXPORT);
    await team.pass();
    expect((team.host.pulls.get(31) as StandInPull).title).toBe("[APP] merge 2 approved changes");

    const unnamed = setup();
    unnamed.nameBy(null);
    unnamed.approve(PARSER);
    unnamed.approve(EXPORT);
    await unnamed.pass();
    expect((unnamed.host.pulls.get(31) as StandInPull).title).toBe("merge 2 approved changes");
  });

  it("starts as soon as one change is in line, and keeps one open batch: a later approval waits", async () => {
    const home = setup();
    home.approve(PARSER);
    await home.pass();
    expect(home.members()).toEqual(["t-parser"]);
    home.approve(EXPORT);
    await home.pass();
    expect([...home.host.pulls.keys()]).toEqual([31]);
    expect(home.members()).toEqual(["t-parser"]);
    expect(home.place(EXPORT)).toEqual({ state: "waiting", place: "line" });
  });

  // Found by rehearsing this piece's live proof: four changes were approved within half a
  // second, and the pass combining the first one saved the record it had read at its start,
  // so two approvals written beside it left the line until their own merges ran again.
  it("keeps the changes approved while the batch ahead of them is being combined: they wait in line and go up together next", async () => {
    const home = setup();
    home.whileCombining(() => {
      void home.approve(EXPORT);
      void home.approve(LEGEND);
    });
    void home.approve(PARSER);
    await home.pass();
    // One more pass, behind the two approvals that waited their turn.
    await home.pass();
    expect(home.members()).toEqual(["t-parser"]);
    expect(home.record().line.map((change) => change.taskId)).toEqual(["t-export", "t-legend"]);
    expect(home.place(EXPORT)).toEqual({ state: "waiting", place: "line" });
    expect(home.place(LEGEND)).toEqual({ state: "waiting", place: "line" });

    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges.map((merge) => merge.number)).toEqual([31]);
    expect([...home.host.pulls.keys()]).toEqual([31, 32]);
    expect(home.members()).toEqual(["t-export", "t-legend"]);
    expect(home.record().line).toEqual([]);
  });

  it("leaves out a change that no longer combines, tells its task why, and goes on with the rest", async () => {
    const home = setup();
    home.conflicting.add("t-export");
    home.approve(PARSER);
    home.approve(EXPORT);
    home.approve(LEGEND);
    await home.pass();
    expect(home.members()).toEqual(["t-parser", "t-legend"]);
    expect(home.place(EXPORT)).toEqual({ state: "left-out", reason: LEFT_OUT_WORDS.conflict });
    expect(home.heard.taskNotes).toEqual([
      { taskId: "t-export", text: BATCH_WORDS.leftOut(LEFT_OUT_WORDS.conflict) },
    ]);
    expect(home.heard.settled).toEqual([["t-export"]]);

    // Its crewmate brings the branch up to date; the new version, once approved, waits in line.
    home.conflicting.delete("t-export");
    const repaired = { ...EXPORT, head: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7", at: 6_000 };
    home.approve(repaired);
    await home.pass();
    expect(home.place(repaired)).toEqual({ state: "waiting", place: "line" });
    expect(home.record().leftOut).toEqual([]);
  });

  // Intent: INF-4517's plan, piece 2 (the captain's "Approve and build"): the left-out
  // notice says whether the change clashes with the default branch now or only with changes
  // ahead; in the second case nothing can be done yet, and the change's merge runs again
  // once when that batch merges or the clashing change leaves it.
  it("tells a change that clashes only with a change ahead that nothing can be done yet, and runs its merge again once that batch merges", async () => {
    const home = setup();
    home.clashing.set("t-export", "t-parser");
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    const reason = LEFT_OUT_WORDS.ahead(PARSER.title);
    expect(home.members()).toEqual(["t-parser"]);
    expect(home.place(EXPORT)).toEqual({ state: "left-out", reason, ahead: "t-parser" });
    expect(home.batches.status(REPO, EXPORT.taskId, EXPORT.head)?.kind).toBe("paused");
    expect(home.heard.taskNotes).toEqual([
      { taskId: "t-export", text: BATCH_WORDS.leftOutAhead(reason) },
    ]);
    expect(home.heard.settled).toEqual([["t-export"]]);

    await home.pass();
    expect(home.heard.settled).toEqual([["t-export"]]);

    // The batch ahead merges: the clash is now one with the default branch, said once.
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges.map((merge) => merge.number)).toEqual([31]);
    expect(home.place(EXPORT)).toEqual({ state: "left-out", reason: LEFT_OUT_WORDS.conflict });
    expect(home.heard.taskNotes.slice(1)).toEqual([
      { taskId: "t-export", text: BATCH_WORDS.clashMerged },
    ]);
    expect(home.heard.settled).toEqual([["t-export"], ["t-parser"], ["t-export"]]);
    await home.pass();
    expect(home.heard.settled).toEqual([["t-export"], ["t-parser"], ["t-export"]]);
  });

  it("runs a left-out change's merge again once when the change ahead it clashed with leaves the batch, so the same version can go back in line", async () => {
    const home = setup();
    home.clashing.set("t-export", "t-parser");
    home.approve(PARSER);
    home.approve(EXPORT);
    home.approve(LEGEND);
    await home.pass();
    expect(home.members()).toEqual(["t-parser", "t-legend"]);

    home.approvals.delete("t-parser");
    await home.batches.withdraw(REPO, "t-parser");
    await home.pass();
    expect(home.members()).toEqual(["t-legend"]);
    expect(home.place(EXPORT)).toBeUndefined();
    expect(home.heard.taskNotes.slice(1)).toEqual([
      { taskId: "t-export", text: BATCH_WORDS.clashLeft },
    ]);
    expect(home.heard.settled).toEqual([["t-export"], ["t-export"]]);

    // Its kept merge reads no place now and puts the approved version in line again.
    await home.batches.enqueue(REPO, EXPORT);
    await home.pass();
    expect(home.place(EXPORT)).toEqual({ state: "waiting", place: "line" });
  });

  it("opens no pull request when nothing in line combines", async () => {
    const home = setup();
    home.conflicting.add("t-parser");
    home.approve(PARSER);
    await home.pass();
    expect(home.host.pulls.size).toBe(0);
    expect(home.heard.pushes).toEqual([]);
    expect(home.record().open).toBeUndefined();
    expect(home.place(PARSER)).toMatchObject({ state: "left-out" });
  });
});

// The independent review's finding on this change, a bug being fixed, with the captain's
// answer to it: a batch opens even when a change's story could not be written, Activity
// names the missing story once, and the description is written again until it is there.
describe("a story that could not be added", () => {
  it("opens the batch anyway, names the missing story once, and adds it as soon as it can be", async () => {
    const home = setup();
    home.unwritable.add(EXPORT.taskId);
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    const pull = home.host.pulls.get(31) as StandInPull;
    expect(pull.body).toContain(`- ${PARSER.title}\n- ${EXPORT.title}`);
    expect(pull.body).toContain("<!-- story of t-parser -->");
    expect(pull.body).not.toContain("<!-- story of t-export -->");
    expect(home.heard.notes).toEqual([
      BATCH_WORDS.formed("meter", "#31", 2),
      BATCH_WORDS.noStory("meter", "#31", [EXPORT.title]),
    ]);

    await home.pass();
    await home.pass();
    expect(home.host.rewrites).toEqual([]);
    expect(home.heard.notes).toHaveLength(2);

    home.unwritable.clear();
    await home.pass();
    expect(pull.body).toContain("<!-- story of t-export -->");
    expect(home.host.rewrites).toEqual([{ number: 31, title: "chore: merge 2 approved changes" }]);
    await home.pass();
    expect(home.host.rewrites).toHaveLength(1);
    expect(home.heard.notes).toHaveLength(2);
  });

  it("does the same for a batch of one, whose description is its change's own story", async () => {
    const home = setup();
    home.unwritable.add(PARSER.taskId);
    home.approve(PARSER);
    await home.pass();
    const pull = home.host.pulls.get(31) as StandInPull;
    expect(pull.title).toBe(PARSER.title);
    expect(pull.body).toBe("");
    expect(home.heard.notes).toEqual([
      BATCH_WORDS.formed("meter", "#31", 1),
      BATCH_WORDS.noStory("meter", "#31", [PARSER.title]),
    ]);

    home.unwritable.clear();
    await home.pass();
    expect(pull.body).toBe(
      `Part of the t-parser work.\n\n<!-- story of t-parser -->\n## Why\n${PARSER.title}`,
    );
    expect(home.heard.notes).toHaveLength(2);
  });

  it("says nothing again for a story still missing after the batch's members changed", async () => {
    const home = setup();
    home.unwritable.add(EXPORT.taskId);
    home.approve(PARSER);
    home.approve(EXPORT);
    home.approve(LEGEND);
    await home.pass();
    home.host.report([failed("unit-tests")]);
    await home.pass();
    const said = home.heard.notes.filter((note) => note.m === "feedBatchNoStory");
    expect(said).toEqual([BATCH_WORDS.noStory("meter", "#31", [EXPORT.title])]);

    // A change is sent back: the batch is at a new version, and the same story is still missing.
    await home.batches.answer(REPO, {
      action: "send-back",
      head: home.open().head,
      changes: [{ taskId: "t-legend", reason: "its legend test fails on the batch's version" }],
    });
    await home.pass();
    const pull = home.host.pulls.get(31) as StandInPull;
    expect(pull.title).toBe("chore: merge 2 approved changes");
    expect(pull.body).not.toContain("<!-- story of t-export -->");
    expect(home.heard.notes.filter((note) => note.m === "feedBatchNoStory")).toEqual(said);
  });
});

describe("a batch of one", () => {
  it("reads as that change's own pull request: its title, the words around its story, then the story", async () => {
    const home = setup();
    home.approve(PARSER);
    await home.pass();
    const pull = home.host.pulls.get(31) as StandInPull;
    expect(pull.title).toBe(PARSER.title);
    expect(pull.body).toBe(
      `Part of the t-parser work.\n\n<!-- story of t-parser -->\n## Why\n${PARSER.title}`,
    );
    expect(home.heard.notes).toEqual([BATCH_WORDS.formed("meter", "#31", 1)]);
  });

  it("merges as that pull request does: one squash commit with the change's title and words", async () => {
    const home = setup();
    home.approve(PARSER);
    await home.pass();
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toEqual([
      {
        number: 31,
        head: home.heard.pushes[0]?.head,
        way: "squash",
        title: PARSER.title,
        body: PARSER.body,
      },
    ]);
    // The squash commit the host answered is the change's own commit on the default branch.
    expect(home.place(PARSER)).toMatchObject({
      state: "merged",
      receipt: { sha: home.host.main[0]?.sha, number: 31 },
    });
    expect(home.heard.landedReads).toBe(0);
    expect(home.heard.settled).toEqual([["t-parser"]]);
    expect(home.heard.notes.at(-1)).toEqual(BATCH_WORDS.merged("meter", "#31", 1));
  });

  it("wakes its own change when its checks fail, and never the first mate", async () => {
    const home = setup();
    home.approve(PARSER);
    await home.pass();
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();
    expect(home.place(PARSER)).toEqual({
      state: "failed",
      checks: ["unit-tests"],
      number: 31,
      url: "https://github.com/acme/meter/pull/31",
    });
    expect(home.heard.settled).toEqual([["t-parser"]]);
    expect(home.heard.held).toEqual([]);
  });
});

describe("merging a batch of several", () => {
  it("merges by rebase where the project allows it: a receipt for each change, the branch deleted, the tasks settled, the next batch formed", async () => {
    const home = await batchOfTwo();
    home.approve(LEGEND);
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");
    await home.pass();

    expect(home.host.merges).toEqual([
      {
        number: 31,
        head: home.heard.pushes[0]?.head,
        way: "rebase",
        title: "chore: merge 2 approved changes",
        body: `- ${PARSER.title}\n- ${EXPORT.title}`,
      },
    ]);
    expect(home.host.main.map((commit) => commit.title)).toEqual([PARSER.title, EXPORT.title]);
    expect(home.place(PARSER)).toMatchObject({
      state: "merged",
      receipt: {
        sha: home.host.main[0]?.sha,
        number: 31,
        url: "https://github.com/acme/meter/pull/31",
      },
    });
    expect(home.place(EXPORT)).toMatchObject({
      state: "merged",
      receipt: { sha: home.host.main[1]?.sha, number: 31 },
    });
    expect(home.host.branches.has("infinitary-batch/3fa9c1d2")).toBe(false);
    expect(home.heard.settled).toEqual([["t-parser", "t-export"]]);
    expect(home.heard.notes).toContainEqual(BATCH_WORDS.merged("meter", "#31", 2));

    expect(home.open()).toMatchObject({ number: 32, branch: "infinitary-batch/8be04a67" });
    expect(home.members()).toEqual(["t-legend"]);
    expect(home.open().base).toBe(home.host.branches.get("main"));
  });

  it("keeps the batch's own commits with a merge commit where the project allows no rebase merge", async () => {
    const home = await batchOfTwo({ squash: true, rebase: false, merge: true });
    const written = home.open().members.map((member) => member.commit);
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges.map((merge) => merge.way)).toEqual(["merge"]);
    expect(home.place(PARSER)).toMatchObject({ state: "merged", receipt: { sha: written[0] } });
    expect(home.place(EXPORT)).toMatchObject({ state: "merged", receipt: { sha: written[1] } });
  });

  it("holds where the project allows only squash merges, says so once, and merges once it allows another", async () => {
    const home = await batchOfTwo({ squash: true, rebase: false, merge: false });
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    await home.pass();
    expect(home.host.merges).toEqual([]);
    expect(home.open().hold).toMatchObject({ reason: "merge-way", checks: [] });
    expect(
      home.heard.notes.filter((note) => isDeepStrictEqual(note, BATCH_WORDS.noWay("meter", "#31"))),
    ).toHaveLength(1);
    // The allowed merges are kept as read, for the reason Settings shows.
    expect(home.record().ways).toEqual({ squash: true, rebase: false, merge: false });

    home.host.ways = { squash: true, rebase: true, merge: false };
    await home.pass();
    expect(home.host.merges.map((merge) => merge.way)).toEqual(["rebase"]);
    expect(home.record().ways).toEqual({ squash: true, rebase: true, merge: false });
  });

  it("waits while the batch's checks run or the host has not said it may merge", async () => {
    const home = await batchOfTwo();
    home.host.report([passed("build"), running("unit-tests")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toEqual([]);
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("computing");
    await home.pass();
    expect(home.host.merges).toEqual([]);
    expect(home.open().hold).toBeUndefined();
  });

  it("holds a batch the host reads as blocked by a rule, says so once and sends no merge, then merges by itself once the host lets it through", async () => {
    // The plan: the app "follows the host's reading and adds no rule". The live
    // proof on GitHub under a signed-commits rule: the batch's check passed, the
    // host read its pull request as blocked, and the batch waited without a word.
    const home = await batchOfTwo();
    home.host.report([passed("build")]);
    home.host.ready("blocked");
    await home.pass();
    await home.pass();
    expect(home.host.merges).toEqual([]);
    const held = home.open();
    expect(held.hold).toMatchObject({ reason: "rules", head: held.head, checks: [] });
    const said = BATCH_WORDS.blocked("meter", "#31", "GitHub");
    expect(home.heard.notes.filter((note) => isDeepStrictEqual(note, said))).toHaveLength(1);
    expect(home.place(PARSER)).toMatchObject({ state: "waiting", place: "held", hold: "rules" });
    // A rule is no failed check: no repair is started for it.
    expect(home.heard.held).toEqual([]);

    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toHaveLength(1);
    expect(home.place(PARSER)).toMatchObject({ state: "merged" });
  });

  it("treats a version with no checks as pending until every change in it was declared to run none", async () => {
    const home = await batchOfTwo();
    home.host.ready("clean");
    await home.pass();
    home.declaredNoChecks.add("t-parser");
    await home.pass();
    expect(home.host.merges).toEqual([]);
    home.declaredNoChecks.add("t-export");
    await home.pass();
    expect(home.host.merges).toHaveLength(1);
  });

  it("waits for a pull request that has yet to follow its pushed branch, and combines again only for a branch that itself moved", async () => {
    const home = await batchOfTwo();
    home.host.report([failed("unit-tests")]);
    await home.pass();
    const held = home.open();
    const pushes = home.heard.pushes.length;

    // Try again pushes a new version; the host's pull request still shows the one before.
    home.host.trails = true;
    await home.batches.answer(REPO, { action: "try-again", head: held.head });
    const pushed = home.open().head;
    expect(pushed).not.toBe(held.head);
    await home.pass();
    await home.pass();
    expect(home.heard.pushes).toHaveLength(pushes + 1);
    expect(home.open().head).toBe(pushed);
    expect(home.host.merges).toEqual([]);

    // The pull request catches up: its checks are read at the pushed version and it merges.
    home.host.trails = false;
    home.host.report([passed("unit-tests")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head: pushed })]);

    // A branch someone else moved is not the batch the app combined: it is combined again.
    const moved = setup();
    moved.approve(PARSER);
    await moved.pass();
    const before = moved.open().head;
    moved.host.branches.set(
      "infinitary-batch/3fa9c1d2",
      "c0ffee0123456789abcdef0123456789abcdef01",
    );
    moved.host.carried.set("c0ffee0123456789abcdef0123456789abcdef01", []);
    await moved.pass();
    expect(moved.open().head).not.toBe(before);
    expect(moved.heard.pushes.at(-1)).toMatchObject({
      branch: "infinitary-batch/3fa9c1d2",
      head: moved.open().head,
    });
  });

  it("combines again onto the moved default branch when the host reads the batch behind", async () => {
    const home = await batchOfTwo();
    const first = home.open().head;
    home.host.report([passed("build")]);
    home.host.branches.set("main", "2b4d6f8a0c1e3a5c7e9b1d3f5a7c9e1b3d5f7a9c");
    home.host.ready("behind");
    await home.pass();
    expect(home.host.merges).toEqual([]);
    expect(home.open().base).toBe("2b4d6f8a0c1e3a5c7e9b1d3f5a7c9e1b3d5f7a9c");
    expect(home.open().head).not.toBe(first);
    // The batch branch the app owns moves from the version it last pushed, to the same pull request.
    expect(home.heard.pushes.at(-1)).toEqual({
      branch: "infinitary-batch/3fa9c1d2",
      head: home.open().head,
      expected: first,
    });
    expect([...home.host.pulls.keys()]).toEqual([31]);
  });

  it("closes a change's own pull request with a link once its batch merged", async () => {
    const home = setup();
    home.approve({ ...PARSER, number: 27 });
    home.approve(EXPORT);
    await home.pass();
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.notes).toEqual([
      {
        number: 27,
        note: BATCH_WORDS.superseded("#31", "https://github.com/acme/meter/pull/31"),
      },
    ]);
  });

  it("holds a merge the host refused with the host's own words, and never sends it again at that version", async () => {
    const home = await batchOfTwo();
    home.host.report([passed("build")]);
    home.host.ready("clean");
    home.host.refusal = "Commits must have verified signatures.";
    await home.pass();
    await home.pass();
    expect(home.host.merges).toHaveLength(1);
    const held = home.open();
    expect(held.hold).toMatchObject({
      reason: "merge-way",
      head: held.head,
      detail: "Commits must have verified signatures.",
    });
    expect(home.heard.notes.at(-1)).toEqual(
      BATCH_WORDS.refused("meter", "#31", "Commits must have verified signatures."),
    );

    home.host.ready("blocked");
    await home.pass();
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toHaveLength(1);
    expect(home.open().hold).toMatchObject({ reason: "merge-way", head: held.head });

    // Try again makes a new version; the rule was lifted meanwhile, so that one merges.
    home.host.refusal = undefined;
    expect(
      await home.batches.answer(REPO, { action: "try-again", head: held.head }),
    ).toBeUndefined();
    home.host.report([passed("build")]);
    await home.pass();
    expect(home.host.merges.map((merge) => merge.head)).toEqual([
      held.head,
      home.heard.pushes.at(-1)?.head,
    ]);
    expect(home.place(PARSER)).toMatchObject({ state: "merged" });
  });
});

// Intent: the approved plan's piece 5, for batches: a branch with a merge
// queue of GitHub's own takes the batch's pull request, and the batch waits
// "until the host merges or removes it".
// Intent: the captain's approved plan to run a batched project's batch check less often
// (piece 1, "Approve and build"): at most every 3 hours, set in Settings → Projects or by the
// first mate. Its done-when list: with a 3-hour gap, two approvals after a batch formed join
// one batch formed 3 hours after the previous one, and a held batch's fix reruns at once.
// With no gap a batch forms as today, which the tests above keep.
describe("the batch gap", () => {
  const HOURS_3 = 3 * 60 * 60 * 1000;

  it("keeps two approvals after a batch formed in line, saying when the next batch starts, then forms one batch with both 3 hours after the previous one", async () => {
    const home = setup();
    home.repos.configure(REPO, { batchGap: 180 });
    home.approve(PARSER);
    await home.pass();
    const formed = home.record().formed as number;
    expect(home.open()).toMatchObject({ number: 31, since: formed });
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.place(PARSER)).toMatchObject({ state: "merged" });

    home.approve(LEGEND);
    await home.pass();
    home.advance(60 * 60 * 1000);
    home.approve(FIX);
    await home.pass();
    expect(home.record().open).toBeUndefined();
    expect(home.record().line.map((change) => change.taskId)).toEqual(["t-legend", "t-fix"]);
    expect([...home.host.pulls.keys()]).toEqual([31]);
    expect(home.batches.status(REPO, FIX.taskId, FIX.head)).toEqual({
      kind: "waiting",
      words: BATCH_STATUS_WORDS.waitingUntil(
        formatTime(formed + HOURS_3, { hour: "numeric", minute: "2-digit" }),
      ),
    });

    // The first pass once 3 hours have passed since the previous batch started.
    home.advance(2 * 60 * 60 * 1000);
    await home.pass();
    expect(home.open()).toMatchObject({ number: 32 });
    expect(home.members()).toEqual(["t-legend", "t-fix"]);
    expect(home.record().formed).toBeGreaterThanOrEqual(formed + HOURS_3);
  });

  it("lets a held batch's declared fix join it at once while the gap runs", async () => {
    const home = await batchOfTwo();
    home.repos.configure(REPO, { batchGap: 180 });
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();
    const held = home.open();
    expect(held.hold).toMatchObject({ reason: "checks" });

    expect(await home.batches.declareFix(REPO, FIX.taskId)).toBeUndefined();
    home.approve(FIX);
    await home.pass();
    expect(home.members()).toEqual(["t-parser", "t-export", "t-fix"]);
    expect(home.open().hold).toBeUndefined();
    expect(home.open().head).not.toBe(held.head);
    // The repair answers the open batch; the gap still counts from when it formed.
    expect(home.record().formed).toBe(held.since);
  });
});

describe("a batch on a branch with GitHub's merge queue", () => {
  async function queuedBatch() {
    const home = await batchOfTwo();
    home.host.mergeQueue = true;
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    return home;
  }

  it("hands the batch to the queue, waits there without sending again, and settles its tasks once GitHub merges it", async () => {
    const home = await queuedBatch();
    const head = home.open().head;
    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head })]);
    expect(home.open()).toMatchObject({ queued: head });
    expect(home.open().hold).toBeUndefined();
    expect(home.heard.notes.at(-1)).toEqual(BATCH_WORDS.queued("meter", "#31", "GitHub"));
    // Queued is not merged: no receipt, no task settled.
    expect(home.place(PARSER)).not.toMatchObject({ state: "merged" });
    expect(home.heard.settled).toEqual([]);

    const reads = home.host.queueReads;
    await home.pass();
    await home.restart();
    expect(home.host.queueReads).toBe(reads + 2);
    expect(home.host.merges).toHaveLength(1);
    expect(home.open()).toMatchObject({ queued: head });

    // GitHub's queue merges it, each change its own commit.
    home.host.queued.delete(31);
    home.host.land(31, "rebase");
    await home.pass();
    expect(home.record().open).toBeUndefined();
    expect(home.place(PARSER)).toMatchObject({
      state: "merged",
      receipt: { sha: home.host.main[0]?.sha, number: 31 },
    });
    expect(home.place(EXPORT)).toMatchObject({
      state: "merged",
      receipt: { sha: home.host.main[1]?.sha, number: 31 },
    });
    expect(home.heard.settled).toEqual([["t-parser", "t-export"]]);
    expect(home.host.merges).toHaveLength(1);
  });

  it("holds a batch GitHub removed from its queue, never sends that version again, and sends the new version Try again makes", async () => {
    const home = await queuedBatch();
    const head = home.open().head;
    // GitHub removes it: the pull request is open and out of the queue.
    home.host.queued.delete(31);
    await home.pass();
    expect(home.open().queued).toBeUndefined();
    expect(home.open().hold).toMatchObject({
      reason: "merge-way",
      head,
      detail: BATCH_WORDS.removed("GitHub"),
    });
    expect(home.heard.notes.at(-1)).toEqual(BATCH_WORDS.removedHeld("meter", "#31", "GitHub"));
    const told = home.heard.notes.length;
    await home.pass();
    await home.pass();
    expect(home.host.merges).toHaveLength(1);
    expect(home.heard.notes).toHaveLength(told);

    expect(await home.batches.answer(REPO, { action: "try-again", head })).toBeUndefined();
    home.host.report([passed("build")]);
    await home.pass();
    const again = home.heard.pushes.at(-1)?.head;
    expect(again).not.toBe(head);
    expect(home.host.merges.map((merge) => merge.head)).toEqual([head, again]);
    expect(home.open()).toMatchObject({ queued: again });
  });
});

describe("an approval withdrawn", () => {
  it("takes the change out of the open batch, which combines again without it", async () => {
    const home = await batchOfTwo();
    const first = home.open().head;
    await home.batches.withdraw(REPO, "t-export");
    await home.pass();
    expect(home.members()).toEqual(["t-parser"]);
    expect(home.open().head).not.toBe(first);
    expect(home.open().stale).toBeUndefined();
    // The pull request now carries one change, so it reads as that change's own.
    expect((home.host.pulls.get(31) as StandInPull).title).toBe(PARSER.title);
    expect(home.place(EXPORT)).toBeUndefined();
  });

  it("carries no further a change whose approval ended since it joined", async () => {
    const home = await batchOfTwo();
    home.approvals.delete("t-parser");
    await home.pass();
    expect(home.members()).toEqual(["t-export"]);
  });

  it("closes the pull request and drops the branch once every change was withdrawn", async () => {
    const home = await batchOfTwo();
    await home.batches.withdraw(REPO, "t-parser");
    await home.batches.withdraw(REPO, "t-export");
    await home.pass();
    expect(home.record().open).toBeUndefined();
    expect((home.host.pulls.get(31) as StandInPull).state).toBe("closed");
    expect(home.host.branches.has("infinitary-batch/3fa9c1d2")).toBe(false);
    expect(home.host.merges).toEqual([]);
    // The Batches panel's Last day keeps the batch as closed.
    expect(home.record().finished).toMatchObject([{ number: 31, outcome: "closed" }]);
  });

  it("takes a waiting change out of the line", async () => {
    const home = await batchOfTwo();
    home.approve(LEGEND);
    await home.batches.withdraw(REPO, "t-legend");
    await home.pass();
    expect(home.record().line).toEqual([]);
    expect(home.members()).toEqual(["t-parser", "t-export"]);
  });

  it("merges only approved work: an approval that ends as the batch turns green leaves before the merge", async () => {
    const home = await batchOfTwo();
    home.host.report([passed("build")]);
    home.host.ready("clean");
    // The captain's reply ends the approval after this pass's first look.
    home.host.beforeChecks = () => {
      home.approvals.delete("t-export");
      home.host.beforeChecks = undefined;
    };
    await home.pass();
    expect(home.host.merges).toEqual([]);
    expect(home.members()).toEqual(["t-parser"]);
    expect(home.host.main).toEqual([]);
  });
});

// The independent review's finding on this change, a bug being fixed, with the captain's
// answer to it: a change whose story is revised at its approved version stays in its batch,
// which only takes the story's title and words.
describe("a story revised at the approved version", () => {
  const RETITLED = {
    taskId: PARSER.taskId,
    head: PARSER.head,
    title: "fix(parser): read a date's time zone as written",
    body: "- A date keeps the time zone it was written with.",
  };
  const asItWas = (change: BatchChange) => ({
    taskId: change.taskId,
    head: change.head,
    title: change.title,
    body: change.body,
  });

  it("rewrites only the description when the commit words read as they did: no new version, no checks run again", async () => {
    const home = await batchOfTwo();
    const pull = home.host.pulls.get(31) as StandInPull;
    const version = pull.head;
    home.retold.set(EXPORT.taskId, "A report could not leave the app.");
    await home.batches.revise(REPO, asItWas(EXPORT));
    await home.pass();
    expect(pull.body).toContain("A report could not leave the app.");
    expect(home.host.rewrites).toEqual([{ number: 31, title: "chore: merge 2 approved changes" }]);
    expect(pull.head).toBe(version);
    expect(home.heard.pushes).toHaveLength(1);
    expect(home.members()).toEqual(["t-parser", "t-export"]);
    await home.pass();
    expect(home.host.rewrites).toHaveLength(1);
  });

  it("combines the batch again in place when the commit words changed: the same pull request, the same order, the commit under its new title", async () => {
    const home = await batchOfTwo();
    const pull = home.host.pulls.get(31) as StandInPull;
    const version = pull.head;
    await home.batches.revise(REPO, RETITLED);
    await home.pass();
    expect([...home.host.pulls.keys()]).toEqual([31]);
    expect(pull.state).toBe("open");
    expect(home.members()).toEqual(["t-parser", "t-export"]);
    expect(home.host.carried.get(pull.head)?.map((commit) => commit.title)).toEqual([
      RETITLED.title,
      EXPORT.title,
    ]);
    // The new version went over the one the app pushed, to the same branch.
    expect(home.heard.pushes.at(-1)).toMatchObject({
      branch: "infinitary-batch/3fa9c1d2",
      expected: version,
    });
    expect(pull.body).toContain(`- ${RETITLED.title}\n- ${EXPORT.title}`);
    expect(home.place(PARSER)).toMatchObject({ state: "waiting", place: "batch", number: 31 });
  });

  it("keeps a batch of one's pull request open under the story's new title, never closing and opening another", async () => {
    const home = setup();
    home.approve(PARSER);
    await home.pass();
    await home.batches.revise(REPO, RETITLED);
    await home.pass();
    expect([...home.host.pulls.keys()]).toEqual([31]);
    const pull = home.host.pulls.get(31) as StandInPull;
    expect(pull).toMatchObject({ state: "open", title: RETITLED.title });
    expect(home.host.branches.get("infinitary-batch/3fa9c1d2")).toBe(pull.head);
    // It merges as that change's own pull request would, under the revised words.
    home.host.report([passed("unit-tests")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toMatchObject([
      { number: 31, way: "squash", title: RETITLED.title, body: RETITLED.body },
    ]);
  });

  it("sends no change back from a held batch: the hold stays for a story whose commit words read as they did", async () => {
    const home = await batchOfTwo();
    home.host.report([failed("unit-tests")]);
    await home.pass();
    const held = home.open().hold;
    expect(held).toMatchObject({ reason: "checks" });
    home.retold.set(EXPORT.taskId, "A report could not leave the app.");
    await home.batches.revise(REPO, asItWas(EXPORT));
    await home.pass();
    expect(home.open().hold).toEqual(held);
    expect(home.members()).toEqual(["t-parser", "t-export"]);
    expect(home.heard.sentBack).toEqual([]);
    expect((home.host.pulls.get(31) as StandInPull).body).toContain(
      "A report could not leave the app.",
    );

    // New commit words make a new version of the same changes, whose checks run again.
    await home.batches.revise(REPO, RETITLED);
    await home.pass();
    expect(home.members()).toEqual(["t-parser", "t-export"]);
    expect(home.heard.sentBack).toEqual([]);
    expect(home.open().hold).toBeUndefined();
    expect(home.heard.pushes).toHaveLength(2);
  });

  it("keeps a waiting change's place in line under the story's new words", async () => {
    const home = await batchOfTwo();
    home.approve(LEGEND);
    await home.approve(AXIS);
    await home.batches.revise(REPO, {
      ...asItWas(LEGEND),
      title: "fix(chart): keep the legend clear of the bars",
    });
    await home.pass();
    expect(home.record().line.map((change) => change.title)).toEqual([
      "fix(chart): keep the legend clear of the bars",
      AXIS.title,
    ]);
    expect(home.heard.pushes).toHaveLength(1);
  });

  it("takes the batch's version of a change out when its story is confirmed at another version", async () => {
    const home = await batchOfTwo();
    await home.batches.revise(REPO, { ...RETITLED, head: LEGEND.head });
    await home.pass();
    expect(home.members()).toEqual(["t-export"]);
    expect(home.place(PARSER)).toBeUndefined();
  });
});

describe("after a restart", () => {
  it("adopts the pull request the host already holds when its confirmation was lost, and opens no second one", async () => {
    const home = setup();
    home.host.loseNextOpen = true;
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    expect(home.open().number).toBeUndefined();
    expect(home.host.pulls.size).toBe(1);
    home.host.offline = false;

    await home.restart();
    expect([...home.host.pulls.keys()]).toEqual([31]);
    expect(home.open()).toMatchObject({ number: 31, url: "https://github.com/acme/meter/pull/31" });
    expect(home.heard.notes).toEqual([BATCH_WORDS.formed("meter", "#31", 2)]);
  });

  it("reads the open pull request once and rewrites nothing that already carries the batch's words", async () => {
    const home = await batchOfTwo();
    await home.restart();
    await home.pass();
    expect(home.host.rewrites).toEqual([]);

    // A rewrite that never reached the host before the app closed is sent after it opens again.
    const pull = home.host.pulls.get(31) as StandInPull;
    pull.title = "chore: merge 3 approved changes";
    await home.restart();
    expect(home.host.rewrites).toEqual([{ number: 31, title: "chore: merge 2 approved changes" }]);
  });

  it("reads a batch that merged while the app was closed: receipts, the branch dropped, the tasks settled", async () => {
    const home = await batchOfTwo();
    home.host.land(31, "rebase");
    await home.restart();
    expect(home.record().open).toBeUndefined();
    expect(home.place(PARSER)).toMatchObject({
      state: "merged",
      receipt: { sha: home.host.main[0]?.sha, number: 31 },
    });
    expect(home.place(EXPORT)).toMatchObject({
      state: "merged",
      receipt: { sha: home.host.main[1]?.sha },
    });
    expect(home.host.branches.has("infinitary-batch/3fa9c1d2")).toBe(false);
    expect(home.heard.settled).toEqual([["t-parser", "t-export"]]);
    expect(home.host.merges).toEqual([]);
  });

  it("puts the changes back at the front of the line when the pull request was closed unmerged, and forms the next batch", async () => {
    const home = await batchOfTwo();
    home.approve(LEGEND);
    await home.pass();
    (home.host.pulls.get(31) as StandInPull).state = "closed";
    await home.restart();
    expect(home.host.branches.has("infinitary-batch/3fa9c1d2")).toBe(false);
    expect(home.open()).toMatchObject({ number: 32, branch: "infinitary-batch/8be04a67" });
    expect(home.members()).toEqual(["t-parser", "t-export", "t-legend"]);
  });

  it("keeps a held batch held without telling the first mate again", async () => {
    const home = await batchOfTwo();
    home.host.report([failed("unit-tests")]);
    await home.pass();
    await home.restart();
    expect(home.open().hold).toMatchObject({ reason: "checks", checks: ["unit-tests"] });
    expect(home.heard.held).toHaveLength(1);
  });

  it("drops a merged change's receipt once its task closed", async () => {
    const home = await batchOfTwo();
    home.host.report([passed("build")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.record().receipts.map((receipt) => receipt.taskId)).toEqual([
      "t-parser",
      "t-export",
    ]);
    home.closedTasks.add("t-parser");
    home.closedTasks.add("t-export");
    await home.restart();
    expect(home.repos.get(REPO)?.batch?.receipts ?? []).toEqual([]);
  });
});

// Intent: INF-4517 piece 3 with the captain's choice on the review's question ("Follow the next
// part's commits; tell its crewmate to rebuild without it"): a later part approved into line
// behind an earlier part waits there, and once that earlier part closes without merging, it gets
// its turn: left out in words while its branch carries that work, carried once rebuilt without it.
describe("a later part whose earlier part closes without merging", () => {
  const APPROVED_EXPORT = "c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00";
  const PANEL: BatchChange = {
    taskId: "t-panel",
    branch: "fm/task-panel",
    head: "6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    title: "feat(export): show the CSV export in the report panel",
    body: "- The report panel offers the CSV export.",
    at: 5_000,
    base: EXPORT.branch,
    after: EXPORT.taskId,
  };

  it("leaves it out with words to rebuild while it carries that work, and carries it rebuilt", async () => {
    const home = setup();
    home.carryingBase.add(PANEL.head);
    await home.approve(PANEL);
    await home.pass();
    // Its earlier part is live and not in a batch: it waits in line, with no note.
    expect(home.record().line.map((change) => change.taskId)).toEqual([PANEL.taskId]);
    expect(home.heard.taskNotes).toEqual([]);

    // The earlier part is dropped: it was never merged.
    home.closedTasks.add(EXPORT.taskId);
    home.unmergedBases.set(PANEL.taskId, APPROVED_EXPORT);
    await home.pass();
    const reason = LEFT_OUT_WORDS.baseClosed(APPROVED_EXPORT);
    expect(home.record().line).toEqual([]);
    expect(home.record().leftOut.map((entry) => entry.taskId)).toEqual([PANEL.taskId]);
    expect(home.heard.taskNotes).toEqual([
      { taskId: PANEL.taskId, text: BATCH_WORDS.leftOut(reason) },
    ]);
    expect(home.members()).toEqual([]);

    // Its crewmate rebuilds without that work, and the captain approves the new version.
    const rebuilt = { ...PANEL, head: "1b2c3d4e5f60718293a4b5c6d7e8f90123456789", at: 6_000 };
    await home.approve(rebuilt);
    await home.pass();
    expect(home.members()).toEqual([PANEL.taskId]);
    expect(home.open().members[0]?.head).toBe(rebuilt.head);
  });
});

// Intent: the captain's approved plan for the Batches panel: its open batch shows its checks
// as the app last read them, and the panel reads again only when that reading changed.
describe("the open batch's checks reading", () => {
  it("is kept from each pass, said only when it changed, and gone once the batch ends", async () => {
    const home = await batchOfTwo();
    home.host.report([passed("build"), running("unit-tests"), failed("lint")]);
    await home.pass();
    const head = home.open().head;
    expect(home.batches.checksReading(REPO)).toMatchObject({
      head,
      passed: 1,
      failed: 1,
      running: 1,
      failedNames: ["lint"],
    });
    const said = home.heard.checksRead.length;
    expect(said).toBeGreaterThan(0);

    // The same reading again says nothing.
    await home.pass();
    expect(home.heard.checksRead).toHaveLength(said);

    // The batch merged with nothing behind it: the reading goes with it, and that is said.
    home.host.report([passed("build"), passed("unit-tests"), passed("lint")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.host.merges).toHaveLength(1);
    expect(home.record().open).toBeUndefined();
    expect(home.batches.checksReading(REPO)).toBeUndefined();
    expect(home.heard.checksRead.length).toBeGreaterThan(said);
  });

  // docs/forge.md, "Advisory workflows": an advisory check decides nothing, so it is not counted.
  it("counts only the checks that decide the batch", async () => {
    const home = await batchOfTwo();
    home.host.report([
      passed("build"),
      running("unit-tests"),
      { name: "early-tests", state: "neutral", advisory: "failure" },
      { name: "early-lint", state: "neutral", advisory: "pending" },
    ]);
    await home.pass();
    expect(home.batches.checksReading(REPO)).toMatchObject({
      passed: 1,
      failed: 0,
      running: 1,
      failedNames: [],
    });
  });
});
