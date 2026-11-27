import { describe, expect, it, vi } from "vitest";
import { FakeForge, insertDirectPrTask, setup } from "../../../tests/helpers/prCiHarness";
import { ForgeAllowanceSpent, type ForgeChange, ForgeError } from "../forge";
import { InboxStore } from "../storage/inboxStore";
import { git } from "../workspace/git";
import { CheckWatcher } from "./checkWatch";
import { renderWake, type TypedWake } from "./wakes";

// Integration cohort (docs/test-cohorts.md): real git at the run's own
// priority, the slowest test (the empty reading's two-hour wake) 0.36 s at its
// fastest of five Mac runs, so five times fits vitest's 5 s default and the file sets no budget.

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

describe('the check watch\'s side of a reading (docs/forge.md, "The check watch")', () => {
  // INF-4215, the captain's "how can we prevent this kind of wasteful wait":
  // a GitHub pull request in a project with no workflows reads an empty list
  // forever. The empty list stays pending (docs/forge.md), but no reading
  // tells the crew to wait for a wake that only the two-hour bound sends, and
  // that wake does not call checks running when none started.
  it("names the way out of an empty, undeclared reading, and its two-hour wake says no check started", async () => {
    let now = 1_000_000;
    const forge = new FakeForge();
    forge.states = [];
    const { tasks, repos, service, db } = setup({ forge, now: () => now });
    await insertDirectPrTask(tasks, repos);

    const said = await service.checkTool.checkForCrew("ab12cd34");
    expect(said).toContain("- no checks reported on the head SHA");
    expect(said).toContain("check_change absentChecks");
    // INF-2114: the crewmate records it once for the project, not per version.
    expect(said).toContain("project true");
    expect(said).not.toContain("End your turn now and wait");
    const told = (await service.checks.run("ab12cd34")).text;
    expect(told).toContain("absentChecks");
    expect(told).not.toContain("will wake the crewmate when the first check fails");
    // Still pending and watched, in case checks are about to start.
    expect(service.checks.reading("ab12cd34")?.overall).toBe("pending");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch?.head).toBe("feedbeef");

    const inbox = new InboxStore(db, { now: () => now });
    const steers: TypedWake[] = [];
    const watcher = new CheckWatcher({
      tasks,
      inbox,
      runKept: () => {},
      read: (taskId) => service.checks.readWatched(taskId),
      steer: async (taskId, wake) => {
        steers.push(wake);
        if (wake.once) inbox.enqueueSteerOnce(taskId, { ...wake, once: wake.once });
      },
    });
    const start = now;
    for (let minute = 1; minute <= 130; minute++) {
      now = start + minute * 60_000;
      await watcher.poll(now);
    }
    expect(steers).toHaveLength(1);
    const wake = renderWake(steers[0] as TypedWake);
    expect(wake).toContain("No check that holds the merge started");
    expect(wake).toContain("check_change absentChecks");
    expect(wake).toContain("project true");
    expect(wake).not.toContain("still running");
  });

  it("arms on checks still running, keeps its start on the same head, and restarts on a new one", async () => {
    let now = 1_000_000;
    const forge = new FakeForge();
    forge.states = ["success", "pending"];
    const { tasks, repos, service } = setup({ forge, now: () => now });
    await insertDirectPrTask(tasks, repos);
    const said = await service.checkTool.checkForCrew("ab12cd34");
    expect(said).toContain(
      "The app is watching these checks and will wake you once when the first check fails, and once when they finish. End your turn now and wait for that message; do not call check_change again until it comes.",
    );
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toEqual({
      head: "feedbeef",
      since: 1_000_000,
      nextAt: 1_060_000,
      tries: 0,
    });
    // The host's own reading of the same head keeps the watch.
    now += 30_000;
    await service.checks.checkOverall("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch?.since).toBe(1_000_000);
    forge.change = { ...(forge.change as ForgeChange), headSha: "feed0002" };
    await service.checkTool.checkForCrew("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toMatchObject({
      head: "feed0002",
      since: 1_030_000,
    });
  });

  // The captain's ask (INF-587): the checks cell says how long the checks
  // have run, counted from the host's own start, not the app's last reading.
  // The times are main's own checks on a0cf68a2, as GitHub gave them.
  it("records when the version's checks started and finished, by the host's own times", async () => {
    const at = (time: string) => Date.parse(`2026-10-20T${time}Z`);
    const forge = new FakeForge();
    forge.names = ["unit-tests", "integration-tests (2/2)", "probe-tests"];
    forge.states = ["success", "pending", "success"];
    forge.times = [
      { startedAt: at("03:30:47"), finishedAt: at("03:33:21") },
      { startedAt: at("03:30:48") },
      { startedAt: at("03:30:47"), finishedAt: at("03:31:28") },
    ];
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    await service.checkTool.checkForCrew("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      ci: "pending",
      ciStartedAt: at("03:30:47"),
    });
    expect(tasks.get("ab12cd34")?.delivery?.ciFinishedAt).toBeUndefined();
    // Passed: the last check's finish.
    forge.states = ["success", "success", "success"];
    forge.times[1] = { startedAt: at("03:30:48"), finishedAt: at("03:34:25") };
    await service.checks.readWatched("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      ci: "green",
      ciStartedAt: at("03:30:47"),
      ciFinishedAt: at("03:34:25"),
    });
    // Failed: the first failure's finish, though another check ran on.
    forge.states = ["failure", "failure", "success"];
    await service.checks.checkOverall("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      ci: "red",
      ciFinishedAt: at("03:33:21"),
    });
    forge.change = { ...(forge.change as ForgeChange), headSha: "feed0002" };
    forge.states = ["pending"];
    forge.times = [];
    await service.checkTool.checkForCrew("ab12cd34");
    const fresh = tasks.get("ab12cd34")?.delivery;
    expect(fresh?.ciStartedAt).toBeUndefined();
    expect(fresh?.ciFinishedAt).toBeUndefined();
  });

  it("ends on the crewmate's own finished reading, and stands through the host's own", async () => {
    const forge = new FakeForge();
    forge.states = ["pending"];
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    await service.checkTool.checkForCrew("ab12cd34");
    forge.states = ["success"];
    // The crewmate has not seen this one: it is still woken.
    await service.checks.checkOverall("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toBeDefined();
    // The crewmate read it itself: nothing is left to tell it.
    await service.checkTool.checkForCrew("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toBeUndefined();
  });

  it.each([{ states: ["success", "skipped"] }] as const)(
    "accepts finished skipped checks %j without watching or repair diagnosis",
    async ({ states }) => {
      const forge = new FakeForge();
      forge.states = [...states];
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      const said = await service.checkTool.checkForCrew("ab12cd34");
      console.log(`[skipped checks] check_change:
${said}`);
      expect(said).toContain("facts: ");
      expect(said).not.toContain("crew verdict:");
      expect(said).not.toContain("Read the failed step");
      expect(said).not.toContain("watching");
      const delivery = tasks.get("ab12cd34")?.delivery;
      console.log(`[skipped checks] persisted delivery: ${JSON.stringify(delivery)}`);
      expect(delivery?.ci).toBe("green");
      expect(delivery?.ciRepair?.failures).toEqual([]);
      expect(delivery?.ciWatch).toBeUndefined();
      expect(await service.checks.readWatched("ab12cd34")).toMatchObject({
        kind: "finished",
      });
      const merged = await service.merges.merge("ab12cd34");
      console.log(`[skipped checks] merge: ${JSON.stringify(merged)}`);
      expect(merged.ok).toBe(true);
      expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(true);
    },
  );

  // INF-3915: right after a pull request opens, the host can list only a job
  // that skips on that event, before the jobs that run register. Such a
  // reading is pending and watched like an empty one, and the merge waits,
  // until checks run or the crew declares that version has none that run.
  it("keeps a reading where every check skipped pending and watched, and merges it once its absence is declared", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    repos.configure(task.repoId!, { origin: "https://github.com/x/y.git" });
    const headSha = await git(task.repoDir, ["rev-parse", "HEAD"]);
    forge.change = { ...forge.change!, headSha };
    forge.states = ["skipped"];
    Object.assign(forge, {
      pull: async () => ({
        number: 23,
        state: "open",
        merged: false,
        headSha,
        base: "main",
        branch: task.branch,
        headRepo: "x/y",
        title: "fix: ship the meter",
      }),
    });
    await service.checkTool.checkForCrew(task.id);
    expect(tasks.get(task.id)?.delivery).toMatchObject({
      ci: "pending",
      checks: { items: [{ state: "skipped" }], absenceDeclared: false },
      ciWatch: { head: headSha },
    });
    expect(service.checks.reading(task.id)?.overall).toBe("pending");
    const held = await service.merges.merge(task.id);
    expect(held.ok).toBe(false);
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
    const stored = await service.checkTool.checkForCrew(task.id, {
      absentChecks: {
        headSha,
        evidence: "Every workflow skips on this change's paths by the default branch's own rules.",
        localGate: "The fixture's applicable local checks passed.",
      },
    });
    expect(stored).toContain("Absence evidence stored for this version");
    expect(tasks.get(task.id)?.delivery).toMatchObject({
      ci: "green",
      checks: { items: [{ state: "skipped" }], absenceDeclared: true },
    });
    expect((await service.merges.merge(task.id)).ok).toBe(true);
    expect(forge.calls).toContain(`putIn ${task.branch} ${headSha}`);
  });

  it("watches nothing on a host with no checks, and tells the crewmate so", async () => {
    const forge = new FakeForge({ kind: "git", place: "git.example.com" });
    forge.states = [];
    forge.change = { url: null, branch: "fm/task-ab12cd34", headSha: "feedbeef" };
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    const said = await service.checkTool.checkForCrew("ab12cd34");
    expect(said).toContain(
      "git.example.com runs no checks the app can watch, so no wake will come: the local gate you ran is the evidence.",
    );
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toBeUndefined();
  });

  it("reports a renamed repair job and lets the crew settle its original record while actual checks still control the merge (INF-1480)", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    const commit = async (subject: string) => {
      await git(task.repoDir, [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@localhost",
        "commit",
        "--allow-empty",
        "-m",
        subject,
      ]);
      return git(task.repoDir, ["rev-parse", "HEAD"]);
    };
    const sourceHead = await commit("chore: source before prompt repair");
    const repairHead = await commit("fix: selected runbook prompt");
    const currentHead = await commit("chore: preserve the prompt repair");
    forge.change = { ...forge.change!, headSha: currentHead };
    // Names reported in INF-1480 and PR #588's current check list. The host
    // reports the old name's absence; only the crew claims a replacement.
    const oldCheck = "card-sent-settings/knowledge-directions";
    const replacement = "affected-journeys";
    forge.names = [replacement];
    await service.checkTool.checkForCrew(task.id, {
      repair: {
        id: "runbooks-selected-prompt-2",
        sourceHead,
        headSha: repairHead,
        check: oldCheck,
        evidence: "The prompt repair is preserved in the following version.",
      },
    });
    const reading = await service.checkTool.checkForCrew(task.id);
    const facts = JSON.parse(
      reading
        .split("\n")
        .find((line) => line.startsWith("facts: "))!
        .slice(7),
    );
    expect(facts).toMatchObject({
      headSha: currentHead,
      repairChecksNotInReading: [
        { id: "runbooks-selected-prompt-2", headSha: repairHead, check: oldCheck },
      ],
      checks: [expect.objectContaining({ name: replacement, state: "success" })],
    });
    // Review F6: current facts retain the unresolved identity, not repeated history.
    expect(reading).not.toContain("The prompt repair is preserved in the following version.");
    expect(reading).not.toContain("Crew declarations:");
    expect(tasks.get(task.id)!.delivery!.ciRepair!.repairs[0]!.outcome).toBeUndefined();
    const settlement = await service.checkTool.checkForCrew(task.id, {
      declaration: {
        headSha: repairHead,
        repairId: "runbooks-selected-prompt-2",
        verdict: "settled",
        outcome: "passed",
        check: replacement,
        evidence:
          "The crew verified the preserved repair through the renamed affected-journey job and local prompt journey.",
      },
    });
    const delivery = tasks.get(task.id)!.delivery!;
    expect(delivery.ciRepair!.repairs[0]).toMatchObject({
      id: "runbooks-selected-prompt-2",
      check: oldCheck,
      headSha: repairHead,
      outcome: "passed",
    });
    expect(delivery.ciRepair!.declarations?.at(-1)).toMatchObject({
      verdict: "settled",
      headSha: repairHead,
      check: replacement,
    });
    expect(delivery).toMatchObject({ ci: "green" });
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    expect(delivery.mergeAuthorization).toBeUndefined();
    const settledFacts = JSON.parse(
      settlement
        .split("\n")
        .find((line) => line.startsWith("facts: "))!
        .slice(7),
    );
    expect(settledFacts.repairChecksNotInReading).toEqual([]);
    expect(settlement).not.toContain("Crew declarations:");
    expect(delivery.ciRepair!.repairs[0]!.evidence).toBe(
      "The prompt repair is preserved in the following version.",
    );
    // Captain INF-1555 F12/F18d: the green reading needs no second crew-ready declaration.
    // The internal merge executor is invoked separately; settlement minted no captain authorization above.
    const merged = await service.merges.merge(task.id);
    expect(merged.ok).toBe(true);
    expect(forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([
      `putIn ${task.branch} ${currentHead}`,
    ]);
    expect(merged.text).not.toContain("Crew declarations:");
    expect(merged.text).not.toContain("The prompt repair is preserved in the following version.");
    console.info(
      JSON.stringify({
        case: "INF-1480 renamed repair check",
        reading,
        settlement,
        savedRepair: delivery.ciRepair!.repairs[0],
        savedDeclaration: delivery.ciRepair!.declarations?.at(-1),
        currentReadiness: service.checks.reading(task.id)?.overall,
      }),
    );
  });

  // INF-1555 F25: both real service entry points preserve a bounded watch on transient reads.
  it("preserves a watch through a crewmate read and watcher hiccup, then recovers", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    forge.states = ["pending"];
    await service.checkTool.checkForCrew("ab12cd34");
    const before = tasks.get("ab12cd34")!.delivery!.ciWatch!;
    expect(before).toBeDefined();
    forge.fail.checks = new ForgeError(
      "transient",
      "GitHub answered 502 while listing workflow runs",
    );
    const ownRead = await service.checkTool.checkForCrew("ab12cd34");
    expect(ownRead).toContain("502");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toEqual(before);
    expect(await service.checks.readWatched("ab12cd34")).toMatchObject({
      kind: "failed",
      transient: true,
    });
    const wakes: unknown[] = [];
    const watcher = new CheckWatcher({
      tasks,
      inbox: { woken: () => false },
      read: (id) => service.checks.readWatched(id),
      steer: async (_id, wake) => {
        wakes.push(wake);
      },
    });
    await watcher.poll(before.nextAt);
    const retried = tasks.get("ab12cd34")!.delivery!.ciWatch!;
    expect(retried).toMatchObject({
      head: before.head,
      since: before.since,
      tries: before.tries + 1,
    });
    expect(wakes).toEqual([]);
    forge.fail.checks = undefined;
    forge.states = ["success"];
    await watcher.poll(retried.nextAt);
    expect(tasks.get("ab12cd34")?.delivery?.ci).toBe("green");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toBeUndefined();
    expect(wakes).toHaveLength(1);
    expect(wakes[0]).toMatchObject({ facts: { outcome: "finished" } });
    console.info(
      JSON.stringify({
        case: "F25 bounded transient recovery",
        ownRead,
        before,
        retried,
        recovered: tasks.get("ab12cd34")?.delivery?.checks,
        wakes,
      }),
    );
  });

  // INF-2149: a spent hourly allowance ended every watch as unreadable and woke every crewmate,
  // so each reset began with a burst of re-armed watches. The watch now waits for GitHub's reset.
  it("keeps a watch standing through a spent allowance and reads again at GitHub's reset", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    forge.states = ["pending"];
    await service.checkTool.checkForCrew("ab12cd34");
    const before = tasks.get("ab12cd34")!.delivery!.ciWatch!;
    const resetAt = before.nextAt + 20 * 60_000;
    forge.fail.checks = new ForgeAllowanceSpent(
      resetAt,
      "GitHub answered 403 to GET /repos/o/r/commits/ab/check-runs: API rate limit exceeded for user ID 3233006. (the hourly allowance is spent)",
    );
    const wakes: unknown[] = [];
    const watcher = new CheckWatcher({
      tasks,
      inbox: { woken: () => false },
      read: (id) => service.checks.readWatched(id),
      steer: async (_id, wake) => {
        wakes.push(wake);
      },
    });
    await watcher.poll(before.nextAt);
    const waiting = tasks.get("ab12cd34")!.delivery!.ciWatch!;
    expect(waiting).toMatchObject({ head: before.head, since: before.since, nextAt: resetAt });
    expect(wakes).toEqual([]);
    const reads = () => forge.calls.filter((call) => call.startsWith("checks")).length;
    const readsWhileSpent = reads();
    await watcher.poll(resetAt - 1);
    expect(reads()).toBe(readsWhileSpent);
    forge.fail.checks = undefined;
    forge.states = ["success"];
    await watcher.poll(resetAt);
    expect(tasks.get("ab12cd34")?.delivery?.ci).toBe("green");
    expect(wakes).toHaveLength(1);
    expect(wakes[0]).toMatchObject({ facts: { outcome: "finished" } });
  });

  // INF-1555 F14: partial facts retain the refusal rather than looking complete or endlessly running.
  it("preserves a lasting list-refusal reason in the task snapshot and factual merge hold", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const problem =
      "GitHub could not provide all check runs: Resource not accessible by integration";
    const read = forge.checks.bind(forge);
    forge.checks = async (change, movedPast) => ({
      ...(await read(change, movedPast)),
      complete: false,
      problem,
    });
    const result = await service.checkTool.checkForCrew("ab12cd34");
    expect(result).toContain(problem);
    // INF-1555 F21: the known refusal does not arm a "still running" watch.
    expect(result).not.toContain("End your turn now and wait");
    expect(tasks.get("ab12cd34")?.delivery?.ciWatch).toBeUndefined();
    expect(await service.checks.readWatched("ab12cd34")).toMatchObject({
      kind: "failed",
      transient: false,
      problem,
    });
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      ci: "pending",
      checks: { complete: false, problem, items: [{ state: "success" }] },
    });
    expect(await service.checks.readForOffer("ab12cd34")).toMatchObject({
      recorded: true,
      overall: "pending",
    });
    const merge = await service.merges.merge("ab12cd34");
    expect(merge).toMatchObject({ ok: false, notGreen: true });
    expect(merge.plain).toContain(problem);
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  // INF-1555 F12: a read failure cannot mint another readiness verdict or make old facts fresh.
  it("retains flake evidence on a failed subsequent read without replacing the recorded check facts", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const headSha = forge.change!.headSha;
    forge.states = ["failure"];
    await service.checkTool.checkForCrew("ab12cd34");
    forge.states = ["success"];
    await service.checkTool.checkForCrew("ab12cd34");
    const snapshot = tasks.get("ab12cd34")!.delivery!.checks;
    forge.fail.checks = new Error("The fixture read is unavailable.");
    await service.checkTool.checkForCrew("ab12cd34", {
      declaration: {
        headSha,
        verdict: "flake",
        check: "linux-checks",
        evidence: "The failure log and successful same-version run identify an intermittent check.",
      },
    });
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({ ci: "green", checks: snapshot });
    expect(tasks.get("ab12cd34")?.delivery).not.toHaveProperty("crewVerdict");
    expect(tasks.get("ab12cd34")?.delivery?.ciRepair?.declarations?.at(-1)).toMatchObject({
      verdict: "flake",
    });
    expect(await service.checks.readForOffer("ab12cd34")).toMatchObject({
      overall: "pending",
      recorded: false,
      problem: "The fixture read is unavailable.",
    });
  });

  it("keeps an undeclared empty hosted reading pending without a second readiness judgment (INF-1555 F12/F13)", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    forge.states = [];
    const headSha = forge.change!.headSha;
    await service.checkTool.checkForCrew("ab12cd34");
    expect(service.checks.reading("ab12cd34")?.overall).toBe("pending");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      ci: "pending",
      checks: { items: [], absenceDeclared: false },
      ciWatch: { head: headSha },
    });
    expect(await service.checks.readWatched("ab12cd34")).toMatchObject({
      kind: "pending",
      pending: [],
    });
  });

  it("waits for final checks before preparing or sending a rule bypass (captain F4)", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    repos.configure(task.repoId!, { origin: "https://github.com/x/y.git" });
    const headSha = await git(task.repoDir, ["rev-parse", "HEAD"]);
    forge.change = { ...forge.change!, headSha };
    forge.names = ["unit-tests", "affected-journeys"];
    forge.states = ["failure", "pending"];
    const send = vi.fn(async () => ({ status: "merged" as const, sha: headSha }));
    Object.assign(forge, {
      pull: async () => ({
        number: 23,
        state: "open",
        merged: false,
        headSha,
        base: "main",
        branch: task.branch,
        headRepo: "x/y",
        title: "fix: ship the meter",
        readiness: "blocked",
      }),
      branchRules: async () => [
        { id: 1, name: "main checks", bypass: "always", rules: ["required_status_checks"] },
      ],
      putInSkippingRules: send,
    });
    await service.checkTool.checkForCrew(task.id);
    const input = { pull: 23, skipRules: { headSha, method: "squash" as const } };
    expect(await service.checkTool.checkForCrew(task.id, input)).toContain(
      "checks have not finished",
    );
    expect(tasks.get(task.id)?.delivery?.mergeReviews?.some((review) => review.skips)).not.toBe(
      true,
    );
    forge.states = ["failure", "success"];
    const completeChecks = forge.checks.bind(forge);
    forge.checks = async (change, movedPast) => ({
      ...(await completeChecks(change, movedPast)),
      complete: false,
    });
    expect(await service.checkTool.checkForCrew(task.id, input)).toContain(
      "checks have not finished",
    );
    expect(tasks.get(task.id)?.delivery?.mergeReviews?.some((review) => review.skips)).not.toBe(
      true,
    );
    forge.checks = completeChecks;
    expect(await service.checkTool.checkForCrew(task.id, input)).toContain("Merge review");
    const review = tasks.get(task.id)!.delivery!.mergeReviews!.find((entry) => entry.skips)!;
    expect(review.skips?.failedChecks).toEqual(["unit-tests"]);
    forge.states = ["failure", "pending"];
    expect(await service.reviews.reviewGate(task.id, review.id)).toContain(
      "checks have not finished",
    );
    const outcome = await service.reviews.mergeReview(task.id, review.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("checks have not finished");
    expect(send).not.toHaveBeenCalled();
  });

  describe("readWatched", () => {
    it("retains changed raw observations for delivery without recording another readiness verdict (INF-1555 F12)", async () => {
      const { tasks, repos, service, forge } = setup();
      await insertDirectPrTask(tasks, repos);
      const headSha = forge.change!.headSha;
      await service.checkTool.checkForCrew("ab12cd34");
      const first = tasks.get("ab12cd34")!.delivery!.ciObservation!;
      expect(first.forwarded).toBe(true);
      await service.checks.readWatched("ab12cd34");
      expect(tasks.get("ab12cd34")!.delivery!.ciObservation).toEqual(first);
      forge.states = ["failure"];
      const reading = await service.checks.readWatched("ab12cd34");
      const changed = tasks.get("ab12cd34")!.delivery!.ciObservation!;
      expect(changed).toMatchObject({ forwarded: false });
      expect(changed.id).not.toBe(first.id);
      expect(reading).toMatchObject({
        observationId: changed.id,
        checks: [expect.objectContaining({ state: "failure" })],
      });
      expect(tasks.get("ab12cd34")!.delivery).toMatchObject({
        ci: "red",
        checks: { items: [{ state: "failure" }] },
      });
      expect(service.checks.reading("ab12cd34")?.overall).toBe("red");
      await service.checks.readWatched("ab12cd34");
      expect(tasks.get("ab12cd34")!.delivery!.ciObservation).toEqual(changed);
      await service.checkTool.checkForCrew("ab12cd34");
      expect(tasks.get("ab12cd34")!.delivery!.ciObservation).toEqual({
        ...changed,
        forwarded: true,
      });
      await service.checkTool.checkForCrew("ab12cd34");
      expect(tasks.get("ab12cd34")!.delivery!.ci).toBe("red");
    });

    it("records running checks once per status or head change", async () => {
      const forge = new FakeForge();
      forge.states = ["success", "pending"];
      forge.names = ["checks", "package-smoke"];
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      const events = tasks.timeline("ab12cd34").length;
      await expect(service.checks.readWatched("ab12cd34")).resolves.toEqual({
        kind: "pending",
        observationId: expect.any(String),
        head: "feedbeef",
        change: "pull request #23 https://github.com/x/y/pull/23",
        pending: [{ name: "package-smoke", state: "pending" }],
      });
      expect(tasks.get("ab12cd34")?.delivery).toMatchObject({ ci: "pending", headSha: "feedbeef" });
      const recordedEvents = tasks.timeline("ab12cd34").length;
      expect(recordedEvents).toBeGreaterThan(events);
      await service.checks.readWatched("ab12cd34");
      expect(tasks.timeline("ab12cd34")).toHaveLength(recordedEvents);
    });

    it("records a finished reading once until its result, head or failing checks change (INF-721 friction 6)", async () => {
      // The captain's words: "Record a check poll only when its state
      // changes". INF-550's pull request read red every five minutes all
      // day and wrote 239 identical rows.
      let clock = 1_000_000;
      const forge = new FakeForge();
      forge.states = ["success", "failure"];
      forge.names = ["checks", "lint"];
      const { tasks, repos, service } = setup({ forge, now: () => clock });
      await insertDirectPrTask(tasks, repos);
      const rows = () =>
        tasks
          .timeline("ab12cd34")
          .filter((event) => event.kind === "ci")
          .map((event) => event.text);
      for (let read = 0; read < 12; read++) {
        clock += 5 * 60_000;
        await service.checks.readWatched("ab12cd34");
      }
      await service.checkTool.checkForCrew("ab12cd34");
      expect(rows()).toEqual(["CI red on PR #23 head feedbeef"]);
      // Each reading still moves the reading time the task shows.
      expect(tasks.get("ab12cd34")?.delivery?.ciAt).toBe(clock);
      // A second check fails, a rerun passes, then a new push: three changes.
      forge.states = ["failure", "failure"];
      await service.checks.readWatched("ab12cd34");
      forge.states = ["success", "success"];
      await service.checks.readWatched("ab12cd34");
      await service.checks.readWatched("ab12cd34");
      forge.change = { ...(forge.change as ForgeChange), headSha: "beadfeed" };
      await service.checks.readWatched("ab12cd34");
      await service.checks.readWatched("ab12cd34");
      expect(rows()).toEqual([
        "CI red on PR #23 head feedbeef",
        "CI red on PR #23 head feedbeef",
        "CI green on PR #23 head feedbeef",
        "CI green on PR #23 head beadfeed",
      ]);
    });

    it("records a finished reading for diagnosis without spending a repair and names the red checks", async () => {
      const forge = new FakeForge();
      forge.states = ["success", "failure", "skipped"];
      forge.names = ["checks", "lint", "docs"];
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      await expect(service.checks.readWatched("ab12cd34")).resolves.toEqual({
        kind: "finished",
        observationId: expect.any(String),
        head: "feedbeef",
        change: "pull request #23 https://github.com/x/y/pull/23",
        checks: [
          { name: "checks", state: "success" },
          { name: "lint", state: "failure" },
          { name: "docs", state: "skipped" },
        ],
      });
      expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
        ci: "red",
        ciRepair: { failures: [{ headSha: "feedbeef", checks: ["lint"] }] },
      });
    });

    it("answers a change that is gone, a host hiccup, and a missing sign-in as typed facts", async () => {
      const forge = new FakeForge();
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      forge.change = null;
      await expect(service.checks.readWatched("ab12cd34")).resolves.toEqual({ kind: "gone" });
      forge.change = {
        number: 23,
        url: "https://github.com/x/y/pull/23",
        branch: "fm/task-ab12cd34",
        headSha: "feedbeef",
      };
      forge.fail.checks = new ForgeError("transient", "could not reach GitHub: ECONNRESET");
      await expect(service.checks.readWatched("ab12cd34")).resolves.toEqual({
        kind: "failed",
        transient: true,
        problem: "could not reach GitHub: ECONNRESET",
      });
      forge.fail.checks = new ForgeError("sign-in", "Not signed in to GitHub (github.com)");
      const refused = await service.checks.readWatched("ab12cd34");
      expect(refused).toMatchObject({ kind: "failed", transient: false, signIn: true });
      expect(refused.kind === "failed" && refused.problem).toContain(
        "Report this as a blocker: the captain signs in to GitHub in the app's Settings.",
      );
    });
  });
});
