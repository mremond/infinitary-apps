import { BATCH_STATUS_WORDS, type BatchChange } from "@shared/batches";
import { formatTime } from "@shared/i18n/format";
import { describe, expect, it } from "vitest";
import { failed, id, passed, REPO, running, setup } from "../../../tests/helpers/batchesHarness";
import { BATCH_WORDS } from "./batches";
import { BATCH_DESCRIPTION_WORDS } from "./description";

// Intent: the captain's approved plan for a held batch's declared fix (docs/forge.md, "A held
// batch"): once the fix's story is confirmed on its own branch, the batch runs its own checks
// at the held version plus the fix; at the fix's approval, a passed run at that same version
// merges that exact commit, otherwise the batch combines with the line as before; and changes
// waiting in line then wait for the project's batch gap (the captain's answer). The project and
// its host are `batchesHarness.ts`.

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
/** The repair's own change, declared the held batch's fix and built on its held version. */
const FIX: BatchChange = {
  taskId: "t-fix",
  branch: "fm/task-fix",
  head: "3c2b1a0918f7e6d5c4b3a2918070f6e5d4c3b2a1",
  title: "fix(export): read dates through the parser's new form",
  body: "- The export reads dates as the parser now writes them.",
  at: 7_000,
};
const FIX_AGAIN: BatchChange = { ...FIX, head: "b8e1f04a7c2d9e5b3f6a0c8d1e4b7a2f5c9d0e3b" };
const HOURS_3 = 3 * 60 * 60 * 1000;

/**
 * Two approved changes held on a failed check, a third waiting in line, and a fix
 * declared and built on the held version, its story not confirmed yet.
 */
async function heldWithFix() {
  const home = setup();
  home.repos.configure(REPO, { batchGap: 180 });
  home.approve(PARSER);
  home.approve(EXPORT);
  await home.pass();
  home.host.report([passed("build"), failed("unit-tests")]);
  await home.pass();
  home.approve(LEGEND);
  await home.pass();
  const held = home.open();
  home.builtOn.set(FIX.head, held.head);
  home.builtOn.set(FIX_AGAIN.head, held.head);
  expect(await home.batches.declareFix(REPO, FIX.taskId, FIX.head)).toBeUndefined();
  await home.pass();
  return { home, held };
}

/** The fix's crewmate confirms its story at its version on its own branch. */
async function confirm(home: ReturnType<typeof setup>, change: BatchChange) {
  const { taskId, branch, head, title, body } = change;
  await home.batches.revise(REPO, { taskId, branch, head, title, body });
  await home.pass();
}

describe("a held batch's early run with its declared fix", () => {
  it("runs the batch's checks at the held version plus the fix once its story is confirmed, keeping the line out", async () => {
    const { home, held } = await heldWithFix();
    const pushes = home.heard.pushes.length;

    await confirm(home, FIX);

    const trial = home.open().trial;
    expect(trial).toMatchObject({ task: FIX.taskId, version: FIX.head, base: held.base });
    expect(trial?.members.map((member) => member.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-fix",
    ]);
    expect(trial?.members.at(-1)?.heldBase).toBe(held.head);
    // Pushed to the batch's own branch, where its pull request runs the checks.
    expect(home.heard.pushes.slice(pushes)).toEqual([
      { branch: held.branch, head: trial?.head, expected: held.head },
    ]);
    expect(home.host.pulls.get(31)?.head).toBe(trial?.head);
    expect([...home.host.pulls.keys()]).toEqual([31]);
    // The batch stays held at its version: nothing merged, the line still waits.
    expect(home.open()).toMatchObject({ head: held.head, hold: { head: held.head } });
    expect(home.members()).toEqual(["t-parser", "t-export"]);
    expect(home.record().line.map((change) => change.taskId)).toEqual(["t-legend"]);
    expect(home.host.merges).toEqual([]);
    // The pull request's description names the fix its commit carries, not approved yet.
    expect(home.host.pulls.get(31)?.body).toContain(BATCH_DESCRIPTION_WORDS.trial(FIX.title));
    expect(home.heard.notes).toContainEqual(BATCH_WORDS.trial("meter", "#31"));
    expect(home.heard.taskNotes).toContainEqual({
      taskId: FIX.taskId,
      text: BATCH_WORDS.trialTask("#31"),
    });

    // The same story confirmed again starts nothing new.
    await confirm(home, FIX);
    expect(home.heard.pushes).toHaveLength(pushes + 1);
  });

  it("merges the run's exact commit once the fix is approved at that version and the run passed, and the line waits for the gap", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    const trial = home.open().trial;
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");
    await home.pass();
    // Passed but not approved: it waits for the approval and merges nothing.
    expect(home.host.merges).toEqual([]);
    expect(home.batches.status(REPO, FIX.taskId, FIX.head)).not.toMatchObject({ kind: "failed" });

    await home.approve(FIX);
    await home.pass();

    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head: trial?.head })]);
    // Approved, the merged pull request no longer names the fix as not approved yet.
    expect(home.host.pulls.get(31)?.body).toContain(FIX.title);
    expect(home.host.pulls.get(31)?.body).not.toContain(BATCH_DESCRIPTION_WORDS.trial(FIX.title));
    for (const change of [PARSER, EXPORT, FIX])
      expect(home.place(change)).toMatchObject({ state: "merged" });
    expect(home.heard.settled.flat()).toEqual(
      expect.arrayContaining(["t-parser", "t-export", "t-fix"]),
    );
    expect(home.record().fixes ?? []).toEqual([]);
    // The line did not join, and waits for the project's batch gap from when the held batch formed.
    expect(home.record().open).toBeUndefined();
    expect(home.record().line.map((change) => change.taskId)).toEqual(["t-legend"]);
    expect(home.batches.status(REPO, LEGEND.taskId, LEGEND.head)).toEqual({
      kind: "waiting",
      words: BATCH_STATUS_WORDS.waitingUntil(
        formatTime((held.since as number) + HOURS_3, { hour: "numeric", minute: "2-digit" }),
      ),
    });
    home.advance(HOURS_3);
    await home.pass();
    expect(home.members()).toEqual(["t-legend"]);
  });

  it("combines with the line as before when the fix is approved while the run still runs", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    const trial = home.open().trial;
    home.host.report([passed("build"), running("unit-tests")]);

    await home.approve(FIX);
    await home.pass();

    expect(home.members()).toEqual(["t-parser", "t-export", "t-fix", "t-legend"]);
    expect(home.open().trial).toBeUndefined();
    expect(home.open().hold).toBeUndefined();
    expect([held.head, trial?.head]).not.toContain(home.open().head);
    expect(home.host.merges).toEqual([]);
  });

  it("combines with the line as before when the fix is approved at another version than the run's", async () => {
    const { home } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");
    await home.pass();

    await home.approve(FIX_AGAIN);
    await home.pass();

    expect(home.host.merges).toEqual([]);
    expect(home.members()).toEqual(["t-parser", "t-export", "t-fix", "t-legend"]);
    expect(home.open().members.find((member) => member.taskId === "t-fix")?.head).toBe(
      FIX_AGAIN.head,
    );
    expect(home.open().trial).toBeUndefined();
  });

  it("keeps the hold when the run fails, tells the fix's crewmate once, and stays held when that version is approved anyway", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();
    await home.pass();

    expect(home.heard.trialFailed).toEqual([{ task: FIX.taskId, failed: ["unit-tests"] }]);
    expect(home.heard.notes).toContainEqual(
      BATCH_WORDS.trialFailed("meter", "#31", ["unit-tests"]),
    );
    expect(home.open()).toMatchObject({ head: held.head, hold: { head: held.head } });
    expect(home.batches.status(REPO, FIX.taskId, FIX.head)).toMatchObject({ kind: "failed" });

    await home.approve(FIX);
    await home.pass();
    expect(home.host.merges).toEqual([]);
    expect(home.open()).toMatchObject({ head: held.head, hold: { head: held.head } });
    expect(home.members()).toEqual(["t-parser", "t-export"]);
    expect(home.heard.trialFailed).toHaveLength(1);
  });

  // docs/forge.md, "Advisory workflows": a project's advisory workflows decide
  // nothing at the early run's version either; its required checks still do.
  it("merges the run's commit past a failed advisory workflow once the fix is approved", async () => {
    const { home } = await heldWithFix();
    await confirm(home, FIX);
    const trial = home.open().trial;
    home.host.report([
      passed("build"),
      passed("unit-tests"),
      { name: "early-tests", state: "neutral", advisory: "failure" },
    ]);
    home.host.ready("clean");
    await home.pass();
    expect(home.heard.trialFailed).toEqual([]);

    await home.approve(FIX);
    await home.pass();
    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head: trial?.head })]);
  });

  it("keeps the hold on a failed required check beside a passed advisory workflow, merging nothing", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([
      passed("build"),
      failed("unit-tests"),
      { name: "early-tests", state: "neutral", advisory: "success" },
    ]);
    home.host.ready("clean");
    await home.pass();
    expect(home.heard.trialFailed).toEqual([{ task: FIX.taskId, failed: ["unit-tests"] }]);

    await home.approve(FIX);
    await home.pass();
    expect(home.host.merges).toEqual([]);
    expect(home.open()).toMatchObject({ head: held.head, hold: { head: held.head } });
  });

  it("starts a new run for a new version of the fix in place of the earlier one", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    const first = home.open().trial?.head;
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();

    await confirm(home, FIX_AGAIN);

    const trial = home.open().trial;
    expect(trial).toMatchObject({ version: FIX_AGAIN.head });
    expect(trial?.head).not.toBe(first);
    expect(trial?.failed).toBeUndefined();
    expect(home.heard.pushes.at(-1)).toEqual({
      branch: held.branch,
      head: trial?.head,
      expected: first,
    });
    expect(home.open().hold).toMatchObject({ head: held.head });
  });

  it("leaves the batch held, merging nothing, once the fix's task closed", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");
    home.closedTasks.add(FIX.taskId);
    await home.pass();
    await home.pass();

    expect(home.host.merges).toEqual([]);
    expect(home.open()).toMatchObject({ head: held.head, hold: { head: held.head } });
    expect(home.members()).toEqual(["t-parser", "t-export"]);
  });

  it("drops the run and combines as before when a held member's approval ends", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");

    await home.batches.withdraw(REPO, EXPORT.taskId);
    await home.pass();

    expect(home.open().trial).toBeUndefined();
    expect(home.host.merges).toEqual([]);
    expect(home.members()).not.toContain("t-export");
    expect(home.open().head).not.toBe(held.head);
  });

  it("starts no run for a fix built on an older held version, beside a rerun declared passed, or on a batch held for a rule", async () => {
    const older = await heldWithFix();
    older.home.builtOn.set(FIX.head, "e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b");
    const olderPushes = older.home.heard.pushes.length;
    await confirm(older.home, FIX);
    expect(older.home.open().trial).toBeUndefined();
    expect(older.home.heard.pushes).toHaveLength(olderPushes);

    // A rerun declared passed for the failed check, while another check fails at that version.
    const rerun = await heldWithFix();
    expect(await rerun.home.batches.declarePassed(REPO, rerun.held.head)).toBeUndefined();
    rerun.home.host.report([failed("unit-tests"), failed("lint")]);
    await rerun.home.pass();
    expect(rerun.home.open().hold).toMatchObject({ reason: "checks", checks: ["lint"] });
    const rerunPushes = rerun.home.heard.pushes.length;
    await confirm(rerun.home, FIX);
    expect(rerun.home.open().trial).toBeUndefined();
    expect(rerun.home.heard.pushes).toHaveLength(rerunPushes);

    const home = setup();
    home.approve(PARSER);
    home.approve(EXPORT);
    await home.pass();
    home.host.report([passed("build")]);
    home.host.ready("blocked");
    await home.pass();
    expect(home.open().hold).toMatchObject({ reason: "rules" });
    home.builtOn.set(FIX.head, home.open().head);
    expect(await home.batches.declareFix(REPO, FIX.taskId, FIX.head)).toBeUndefined();
    const pushes = home.heard.pushes.length;
    await confirm(home, FIX);
    expect(home.open().trial).toBeUndefined();
    expect(home.heard.pushes).toHaveLength(pushes);
  });

  it.each([
    ["body", { body: "- A report exports as CSV, quoted." }],
    ["title", { title: "Export reports as quoted CSV" }],
  ])(
    "drops the run when a held member's %s is reworded, and combines the batch again as before, without the fix",
    async (_part, words) => {
      const { home, held } = await heldWithFix();
      await confirm(home, FIX);
      const trial = home.open().trial;

      await home.batches.revise(REPO, { ...EXPORT, ...words });
      await home.pass();

      expect(home.open().trial).toBeUndefined();
      expect(home.members()).toEqual(["t-parser", "t-export"]);
      expect(home.open().members.at(-1)).toMatchObject(words);
      expect([held.head, trial?.head]).not.toContain(home.open().head);
      expect(home.record().line.map((change) => change.taskId)).toEqual(["t-legend"]);
      expect(home.host.merges).toEqual([]);
    },
  );

  it("merges the held version as it is when a rerun is declared passed during the run, with the fix left for the next batch", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.ready("clean");

    expect(await home.batches.declarePassed(REPO, held.head)).toBeUndefined();
    await home.pass();
    await home.pass();

    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head: held.head })]);
    expect(home.place(EXPORT)).toMatchObject({ state: "merged" });
    expect(home.record().fixes).toEqual([FIX.taskId]);
  });

  it("takes a generated commit the checks add on the run as the run's commit, and merges it at the fix's approval", async () => {
    const { home } = await heldWithFix();
    await confirm(home, FIX);
    const ran = home.open().trial?.head as string;
    const branch = home.open().branch;
    const pushedByChecks = id("generated by the checks");
    home.host.generated.set(pushedByChecks, { parent: ran, title: "chore: regenerate files" });
    home.host.branches.set(branch, pushedByChecks);

    await home.pass();

    const trial = home.open().trial;
    expect(trial?.generated).toBeDefined();
    expect(trial?.head).toBe(trial?.generated);
    expect(home.host.branches.get(branch)).toBe(trial?.head);
    expect(home.open().hold).toMatchObject({ head: home.open().head });

    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");
    await home.approve(FIX);
    await home.pass();
    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head: trial?.head })]);
    expect(home.place(FIX)).toMatchObject({ state: "merged" });
  });

  it("combines with the line as before when the fix is approved at a passed run the host reads behind", async () => {
    const { home } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("behind");

    await home.approve(FIX);
    await home.pass();

    expect(home.host.merges).toEqual([]);
    expect(home.open().trial).toBeUndefined();
    expect(home.members()).toEqual(["t-parser", "t-export", "t-fix", "t-legend"]);
  });

  it("ends a failed run's failure once its checks pass when run again, and merges it at the fix's approval", async () => {
    const { home } = await heldWithFix();
    await confirm(home, FIX);
    const trial = home.open().trial;
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();
    expect(home.batches.status(REPO, FIX.taskId, FIX.head)).toMatchObject({ kind: "failed" });

    home.host.report([passed("build"), passed("unit-tests")]);
    home.host.ready("clean");
    await home.pass();
    expect(home.open().trial?.failed).toBeUndefined();
    expect(home.batches.status(REPO, FIX.taskId, FIX.head)).not.toMatchObject({ kind: "failed" });

    await home.approve(FIX);
    await home.pass();
    expect(home.host.merges).toEqual([expect.objectContaining({ number: 31, head: trial?.head })]);
  });

  it("takes a fix approved after its run failed when Try again comes before any pass reads it", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();
    // The captain's merge click on the failed version records only the approval, and Try
    // again comes before the next pass.
    home.approvals.set(FIX.taskId, FIX.head);
    expect(home.record().line.map((change) => change.taskId)).toEqual(["t-legend"]);

    expect(
      await home.batches.answer(REPO, { action: "try-again", head: held.head }),
    ).toBeUndefined();
    expect(home.members()).toEqual(["t-parser", "t-export", "t-fix", "t-legend"]);
    expect(home.open().hold).toBeUndefined();
  });

  it("puts a fix approved after its run failed in line, so Try again combines it with the line", async () => {
    const { home, held } = await heldWithFix();
    await confirm(home, FIX);
    home.host.report([passed("build"), failed("unit-tests")]);
    await home.pass();
    // The captain's merge click on the failed version: its merge reads failed and puts nothing
    // in line itself (`ChangeMerge.mergeInBatch`), so only the approval is recorded here.
    home.approvals.set(FIX.taskId, FIX.head);
    await home.pass();

    expect(home.record().line.map((change) => change.taskId)).toEqual(["t-legend", "t-fix"]);
    expect(home.batches.status(REPO, FIX.taskId, FIX.head)).toMatchObject({ kind: "failed" });
    expect(home.open()).toMatchObject({ head: held.head, hold: { head: held.head } });

    expect(
      await home.batches.answer(REPO, { action: "try-again", head: held.head }),
    ).toBeUndefined();
    expect(home.members()).toEqual(["t-parser", "t-export", "t-fix", "t-legend"]);
    expect(home.open().hold).toBeUndefined();
  });
});
