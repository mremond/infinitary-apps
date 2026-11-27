import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSnapshotSummary } from "@shared/checkSnapshot";
import { inLanguage, setCurrentLanguage } from "@shared/i18n/current";
import type { MergeReview } from "@shared/mergeReview";
import type { NoChecksChange } from "@shared/repos";
import { describe, expect, it, vi } from "vitest";
import { stub as githubStub } from "../../../tests/helpers/githubForgeStub";
import {
  FakeForge,
  insertDirectPrTask,
  insertTask,
  recordPr,
  setup,
} from "../../../tests/helpers/prCiHarness";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import {
  type ForgeChange,
  type ForgeCheck,
  type ForgeCheckState,
  ForgeError,
  type ForgePull,
} from "../forge";
import { InboxStore } from "../storage/inboxStore";
import { TaskStore } from "../storage/taskRecords";
import { git } from "../workspace/git";
import { PROJECT_NO_CHECKS_WORDS } from "./changeChecks";
import { PROJECT_ABSENCE_WORDS } from "./checkChangeTool";
import { CheckWatcher } from "./checkWatch";
import type { TypedWake } from "./wakes";

// Integration cohort (docs/test-cohorts.md): real git at the run's own
// priority, the slowest test (the no-CI project's merge) 0.59 s at its fastest
// of five Mac runs, so five times fits vitest's 5 s default and the file sets no budget.

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

/**
 * Raw check facts, crew-declared judgments, fail-soft text on every edge,
 * and the timestamped record the host's
 * settle-facts strip renders (contract v2.0) - read through the forge seam
 * (git integration PR 1.1), so a fake forge stands where the project lives.
 * GitHub over its REST API is `githubForge.test.ts`; a plain
 * Git host against real repositories is `plainGit.test.ts`.
 */
describe("ChangeChecks", () => {
  it("merges a deliberately no-CI project after positive absence and crew readiness (captain F3)", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    repos.configure(task.repoId!, { origin: "https://github.com/x/y.git" });
    const headSha = await git(task.repoDir, ["rev-parse", "HEAD"]);
    forge.change = { ...forge.change!, headSha };
    forge.states = [];
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
    const absence = {
      headSha,
      evidence: "The trusted default-branch project policy explicitly declares no CI.",
      localGate: "The fixture's applicable local checks passed.",
    };
    const response = await service.checkTool.checkForCrew(task.id, {
      pull: 23,
      absentChecks: absence,
    });
    expect(response).toContain("Merge review");
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    await service.checkTool.checkForCrew(task.id);
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    const reviews = tasks.get(task.id)!.delivery!.mergeReviews!;
    // F3: evidence from another project, branch or version is not positive evidence here.
    for (const wrongScope of [
      { owner: "another-owner" },
      { branch: "another-branch" },
      { headSha: "another-version" },
    ]) {
      seedDelivery(tasks, task.id, {
        mergeReviews: reviews.map((review) => ({ ...review, ...wrongScope })),
      });
      await service.checkTool.checkForCrew(task.id);
      expect(service.checks.reading(task.id)?.overall).toBe("pending");
    }
    seedDelivery(tasks, task.id, { mergeReviews: reviews });
    await service.checkTool.checkForCrew(task.id);
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    expect(tasks.get(task.id)?.delivery?.checks).toMatchObject({
      items: [],
      absenceDeclared: true,
    });
    forge.states = ["pending"];
    await service.checkTool.checkForCrew(task.id);
    expect(tasks.get(task.id)?.delivery).toMatchObject({
      ci: "pending",
      checks: { items: [{ state: "pending" }] },
    });
    forge.states = ["failure"];
    await service.checkTool.checkForCrew(task.id);
    expect(tasks.get(task.id)?.delivery).toMatchObject({
      ci: "red",
      checks: { items: [{ state: "failure" }] },
    });
    forge.states = [];
    const merged = await service.merges.merge(task.id);
    expect(merged.ok).toBe(true);
    expect(forge.calls).toContain(`putIn ${task.branch} ${headSha}`);
  });

  // INF-1955: the declaration for the task's own pull request, sent with no
  // pull named, registers against that pull request or is refused in words.
  it("stores an own-pull absence declaration sent with no pull, and refuses one it cannot match", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    repos.configure(task.repoId!, { origin: "https://github.com/x/y.git" });
    const headSha = await git(task.repoDir, ["rev-parse", "HEAD"]);
    forge.change = { ...forge.change!, headSha };
    forge.states = [];
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
    const absence = {
      headSha,
      evidence: "The trusted default-branch project policy explicitly declares no CI.",
      localGate: "The fixture's applicable local checks passed.",
    };
    await service.checkTool.checkForCrew(task.id);
    expect(service.checks.reading(task.id)?.overall).toBe("pending");
    const stale = await service.checkTool.checkForCrew(task.id, {
      absentChecks: { ...absence, headSha: "another-version" },
    });
    expect(stale).toContain("Absence declaration refused");
    expect(stale).toContain(headSha);
    expect(tasks.get(task.id)?.delivery?.mergeReviews ?? []).toEqual([]);
    expect(service.checks.reading(task.id)?.overall).toBe("pending");
    expect(
      await service.checkTool.checkForCrew(task.id, {
        absentChecks: absence,
        diagnosis: { headSha, check: "x", classification: "unknown", evidence: "none" },
      }),
    ).toContain("send absentChecks on its own");
    const stored = await service.checkTool.checkForCrew(task.id, { absentChecks: absence });
    expect(stored).toContain("Absence evidence stored for this version");
    expect(stored).not.toContain("refused");
    expect(tasks.get(task.id)?.delivery?.mergeReviews?.[0]).toMatchObject({
      number: 23,
      headSha,
      absentChecks: { headSha },
    });
    expect(tasks.get(task.id)?.delivery?.checkTarget).toBeUndefined();
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    expect(tasks.get(task.id)?.delivery?.checks).toMatchObject({
      items: [],
      absenceDeclared: true,
    });
    expect((await service.merges.merge(task.id)).ok).toBe(true);
    expect(forge.calls).toContain(`putIn ${task.branch} ${headSha}`);
  });

  it("refuses an own-pull absence declaration while the task has no open pull request", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    forge.change = null;
    const answer = await service.checkTool.checkForCrew(task.id, {
      absentChecks: { headSha: "feedbeef", evidence: "No CI.", localGate: "Passed." },
    });
    expect(answer).toContain("Absence declaration refused");
    expect(answer).toContain("no open pull request");
    expect(tasks.get(task.id)?.delivery?.mergeReviews ?? []).toEqual([]);
  });

  it("reports every check on the change head and records the overall", async () => {
    const forge = new FakeForge();
    forge.change = { ...(forge.change as ForgeChange), headSha: "abc123def456" };
    forge.states = ["success", "pending"];
    forge.names = ["checks", "package-smoke"];
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    const result = await service.checkTool.checkForCrew("ab12cd34");
    expect(result).toContain("pull request #23 https://github.com/x/y/pull/23 head abc123def456");
    expect(result).toContain("facts: ");
    expect(result).not.toContain("crew verdict:");
    expect(result).toContain("- checks: completed / success");
    expect(result).toContain("- package-smoke: in_progress / -");
    expect(forge.calls[0]).toBe("changeFor fm/task-ab12cd34");
    expect(service.checks.reading("ab12cd34")?.overall).toBe("pending");
  });

  // Intent: the team queue's removal (the approved plan for batches of your own, piece 4). A
  // version the app marked waiting for a project's queue keeps that status where the project
  // lives, and nothing answers it now, so it must not keep the change waiting.
  it("leaves out the status the team queue left on a version, so a change whose own checks passed reads green", async () => {
    const forge = new FakeForge();
    forge.states = ["success", "pending"];
    forge.names = ["typecheck-lint-build", "infinitary/queue"];
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    const result = await service.checkTool.checkForCrew("ab12cd34");
    expect(result).toContain("- typecheck-lint-build: completed / success");
    expect(result).not.toContain("infinitary/queue");
    expect(service.checks.reading("ab12cd34")?.overall).toBe("green");
    expect(tasks.get("ab12cd34")?.delivery?.checks?.items.map((item) => item.name)).toEqual([
      "typecheck-lint-build",
    ]);
  });

  it("records the green reading with the time it was taken, and the change by the forge's label", async () => {
    const now = 1_000_000;
    const { tasks, repos, service } = setup({ now: () => now });
    await insertDirectPrTask(tasks, repos);
    await service.checks.checkOverall("ab12cd34");
    // The settle-facts strip renders this reading and its age (contract
    // v2.0); nothing expires it, because a put-in click re-checks the head.
    expect(service.checks.reading("ab12cd34")).toEqual({ overall: "green", at: now });
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prUrl: "https://github.com/x/y/pull/23",
      prNumber: 23,
      changeLabel: "#23",
      ci: "green",
      ciAt: now,
    });
  });

  it("stamps a reading with the pull request it is of and its base, and records the default branch's newest run of a failed check as evidence that no gate reads (INF-1873, INF-1915 fix 1)", async () => {
    // INF-1915's audit, the captain's choice "Fold fix 1 into INF-1873 and
    // INF-1874": main's run of the same check is evidence about a failure's
    // cause, never a merge input. INF-1872's follow-up: the reading names the
    // pull request it is of, so the change record binds it by that number.
    const forge = new FakeForge();
    forge.change = { ...(forge.change as ForgeChange), base: "main" };
    forge.states = ["failure", "success"];
    forge.names = ["unit-tests", "typecheck-lint-build"];
    let onMain: ForgeCheckState = "failure";
    forge.branchChecks = async () => {
      forge.calls.push("branchChecks");
      return {
        sha: "ma1n0001",
        checks: {
          items: [
            { name: "unit-tests", state: onMain },
            { name: "typecheck-lint-build", state: "success" },
          ],
        },
      };
    };
    const now = 5_000;
    const { tasks, repos, service } = setup({ forge, now: () => now });
    await insertDirectPrTask(tasks, repos);
    const text = await service.checkTool.checkForCrew("ab12cd34");
    const facts = JSON.parse(
      text
        .split("\n")
        .find((line) => line.startsWith("facts: "))!
        .slice("facts: ".length),
    );
    const change = tasks.changeFor("ab12cd34");
    expect(facts.change).toEqual({ id: change?.id, base: "main" });
    expect(facts.main).toEqual({
      sha: "ma1n0001",
      items: [{ name: "unit-tests", state: "failure" }],
    });
    const evidence = {
      sha: "ma1n0001",
      at: now,
      items: [{ name: "unit-tests", state: "failure" }],
    };
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prNumber: 23,
      prBase: "main",
      checks: { headSha: "feedbeef", prNumber: 23 },
      mainChecks: { head: "feedbeef", ...evidence },
    });
    expect(change?.base).toBe("main");
    expect(
      change?.versions.map((v) => [v.head, v.checks?.snapshot?.prNumber, v.checks?.main]),
    ).toEqual([["feedbeef", 23, evidence]]);
    // The same failures read again keep the evidence without a second read of
    // the default branch; a reading whose failures changed reads it again.
    await service.checkTool.checkForCrew("ab12cd34");
    expect(forge.calls.filter((call) => call === "branchChecks")).toHaveLength(1);
    forge.states = ["failure", "failure"];
    await service.checkTool.checkForCrew("ab12cd34");
    expect(forge.calls.filter((call) => call === "branchChecks")).toHaveLength(2);
    expect(tasks.get("ab12cd34")?.delivery?.mainChecks?.items.map((item) => item.name)).toEqual([
      "unit-tests",
      "typecheck-lint-build",
    ]);
    // A green reading clears it, on the slot and on the record's version, and
    // the default branch's own failure holds nothing: the pull request's own
    // checks alone make the reading green.
    onMain = "failure";
    forge.states = ["success", "success"];
    await service.checkTool.checkForCrew("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery?.mainChecks).toBeUndefined();
    expect(tasks.changeFor("ab12cd34")?.versions[0]?.checks?.main).toBeUndefined();
    expect(service.checks.reading("ab12cd34")?.overall).toBe("green");
  });

  it("names the change: check_change reads only this task's change by its id, and open_change opens only on a project the app manages, onto the base it names (INF-1873, INF-2510)", async () => {
    // INF-1868 piece 2: open_change takes a repository and base; checks name a change.
    // The captain's INF-1868 answer 2: "Only repositories the app manages as projects".
    const forge = new FakeForge();
    forge.change = null;
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    const project = repos.get(tasks.get("ab12cd34")?.repoId ?? "");
    if (!project) throw new Error("the task's project is not registered");
    const elsewhere = await service.publication.open("ab12cd34", {
      title: "fix: correct it",
      body: "b",
      repository: "octo/other",
    });
    expect(elsewhere).toBe(
      `Cannot open the change on "octo/other": a change opens only in a project the app manages (${repos
        .list()
        .map((repo) => repo.name)
        .join(", ")}). Name one of them, or leave repository out for this task's own.`,
    );
    expect(forge.calls).toEqual([]);
    const opened = await service.publication.open("ab12cd34", {
      title: "fix: correct it",
      body: "b",
      repository: project.name.toUpperCase(),
      base: "fm/task-lower",
    });
    expect(opened).toContain("Opened pull request #42");
    expect(forge.bases).toEqual(["fm/task-lower"]);
    expect(tasks.get("ab12cd34")?.delivery?.prBase).toBe("fm/task-lower");
    const change = tasks.changeFor("ab12cd34");
    expect(change?.base).toBe("fm/task-lower");
    expect(await service.checkTool.checkForCrew("ab12cd34", { change: "chg_other" })).toBe(
      `check_change refused: "chg_other" is not one of this task's changes; its changes are ${change?.id}.`,
    );
    expect(await service.checkTool.checkForCrew("ab12cd34", { change: change?.id })).toContain(
      "facts: ",
    );
  });

  describe("checkOverall", () => {
    it("resolves the fresh verdict alone, for the crewmate completion-card CI gate", async () => {
      const { tasks, repos, service } = setup();
      await insertDirectPrTask(tasks, repos);
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("green");
      expect(tasks.get("ab12cd34")?.delivery?.ci).toBe("green");
    });

    it("resolves pending or red exactly as check would report them", async () => {
      const forge = new FakeForge();
      forge.states = ["failure"];
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("red");
    });

    it("falls back to pending, never green, on a forge failure that never recorded a reading", async () => {
      const forge = new FakeForge();
      forge.failChangeForTimes = 1;
      forge.fail.changeFor = new ForgeError("refused", "the host said no");
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      expect(service.checks.reading("ab12cd34")).toBeUndefined();
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("pending");
    });

    it("answers pending, never an earlier green, when this call could not read the checks", async () => {
      const forge = new FakeForge();
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos);
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("green");

      forge.fail.checks = new ForgeError("refused", "spawn gh ENOENT");
      // The earlier green stays on the record with its time (it is what was
      // last read), but it says nothing about the head the card is about now.
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("pending");
      expect(service.checks.reading("ab12cd34")?.overall).toBe("green");
    });

    it("answers pending on an early return too, whatever an earlier reading said", async () => {
      const forge = new FakeForge();
      const { tasks, repos, service } = setup({ forge });
      await insertDirectPrTask(tasks, repos, {
        worktreeDir: join(tmpdir(), "infinitary-gone-worktree"),
      });
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("green");
      const repoDir = tasks.get("ab12cd34")?.repoDir as string;
      // The repository folder goes away: check returns before any reading.
      rmSync(repoDir, { recursive: true, force: true });
      await expect(service.checks.checkOverall("ab12cd34")).resolves.toBe("pending");
    });
  });

  it("fails soft on every edge: unknown task, queued row, no change, forge failure", async () => {
    const forge = new FakeForge();
    forge.change = null;
    const { tasks, repos, service } = setup({ forge });
    expect(await service.checkTool.checkForCrew("nope")).toContain('Unknown task "nope"');
    insertTask(tasks, { id: "queued99", branch: "", status: "queued" });
    expect(await service.checkTool.checkForCrew("queued99")).toContain("no branch yet");
    await insertDirectPrTask(tasks, repos);
    const noPr = await service.checkTool.checkForCrew("ab12cd34");
    expect(noPr).toBe("overall: no-pr\nNo open PR found for branch fm/task-ab12cd34.");
    expect(service.checks.reading("ab12cd34")?.overall).toBe("no-pr");

    const failing = setup();
    failing.forge.failChangeForTimes = 1;
    failing.forge.fail.changeFor = new Error("gh: command not found");
    await insertDirectPrTask(failing.tasks, failing.repos);
    expect(await failing.service.checkTool.checkForCrew("ab12cd34")).toContain(
      "Could not check CI",
    );
  });

  it("refuses to pretend local-only work has CI", async () => {
    const { tasks, repos, service, forge } = setup();
    // init has no remote, so the defaulted posture is local-only.
    const { repo } = await repos.setup({ kind: "init", name: "local-notes" });
    insertTask(tasks, { repoId: repo.id, repoDir: repo.path });
    expect(await service.checkTool.checkForCrew("ab12cd34")).toContain("local-only");
    expect(forge.calls).toEqual([]);
  });

  it("checks CI for a task whose ask is direct-pr even when the repo is local-only", async () => {
    const forge = new FakeForge();
    forge.states = [];
    const { tasks, repos, service } = setup({ forge });
    const { repo } = await repos.setup({ kind: "init", name: "local-notes" });
    insertTask(tasks, {
      repoId: repo.id,
      repoDir: repo.path,
      shape: { kind: "fix", kind_source: "none", delivery_ask: "direct-pr" },
    });
    const result = await service.checkTool.checkForCrew("ab12cd34");
    expect(result).toContain("facts: ");
    expect(result).not.toContain("crew verdict:");
    expect(forge.calls).not.toEqual([]);
  });

  it("does not check CI when the task asked to stay local on a direct-pr repo", async () => {
    const { tasks, repos, service, forge } = setup();
    const { repo } = await repos.setup({ kind: "init", name: "notes" });
    repos.configure(repo.id, { delivery: "direct-pr" });
    insertTask(tasks, {
      repoId: repo.id,
      repoDir: repo.path,
      shape: { kind: "fix", kind_source: "none", delivery_ask: "local-only" },
    });
    const text = await service.checkTool.checkForCrew("ab12cd34");
    expect(text).toContain("Task ab12cd34 ships local-only");
    expect(text).not.toContain("Repository");
    expect(forge.calls).toEqual([]);
  });
});

it("does not open a change again when an older task recorded its number before its label", async () => {
  const { tasks, repos, service, forge } = setup();
  await insertDirectPrTask(tasks, repos);
  recordPr(tasks, 23);
  await service.checks.checkOverall("ab12cd34");
  expect(tasks.timeline("ab12cd34").filter((event) => event.kind === "pr_opened")).toEqual([]);
  expect(forge.calls.some((call) => call.startsWith("openChange"))).toBe(false);
});

// Crew judgment and settlement live in checkDeclarations.test.ts (accepted INF-1177).

describe("an absence declaration beside registered check facts (INF-893, INF-1555 F13)", () => {
  // INF-893 and accepted INF-1177 raw facts: PR #328's real dispatched replay check
  // remains authoritative beside the crew-owned absence declaration. The new
  // provider protocol reports observations, never an invented pending marker.
  const PR328 = {
    number: 328,
    headSha: "21abc81254618e65ff72612b155f0aa261bc5372",
    branch: "fm/task-7aa0123e",
    title: "fix(validation): ask before sensitive or costly access",
  };

  /** PR #328 read by its number, with its registered replay-gate and the older metadata hint. */
  class NotStartedForge extends FakeForge {
    replayGate: ForgeCheckState = "pending";
    async pull(number: number): Promise<ForgePull> {
      return {
        number,
        state: "open",
        merged: false,
        headSha: PR328.headSha,
        base: "main",
        branch: PR328.branch,
        title: PR328.title,
        headRepo: "infinitary-labs/infinitary",
        readiness: "clean",
      };
    }
    override async checks(change: ForgeChange) {
      this.calls.push(`checks ${change.headSha}`);
      const items: ForgeCheck[] = [{ name: "replay-gate", state: this.replayGate }];
      return { items, notStarted: true };
    }
  }

  it("never lets the crew-owned absence declaration waive a registered running or failed check", async () => {
    const forge = new NotStartedForge();
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    repos.configure(tasks.get("ab12cd34")!.repoId!, {
      origin: "https://github.com/infinitary-labs/infinitary.git",
    });
    const review: MergeReview = {
      id: "mrpr328absent",
      kind: "github",
      host: "github.com",
      owner: "infinitary-labs",
      name: "infinitary",
      number: PR328.number,
      headSha: PR328.headSha,
      base: "main",
      branch: PR328.branch,
      method: "squash",
      title: PR328.title,
      absentChecks: {
        headSha: PR328.headSha,
        evidence: "No pull request workflow runs for this change; replay.yml ran by hand.",
        localGate: "pnpm typecheck && pnpm check && pnpm lint:adherence passed at this version.",
      },
      at: Date.now(),
    };
    seedDelivery(tasks, "ab12cd34", { mergeReviews: [review] });

    // replay-gate still running: the declaration does not cover it.
    expect(await service.reviews.mergeReview("ab12cd34", review.id)).toMatchObject({
      ok: false,
      stop: "checks",
    });
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
    // A failed replay-gate is never waived either.
    forge.replayGate = "failure";
    expect(await service.reviews.mergeReview("ab12cd34", review.id)).toMatchObject({
      ok: false,
      stop: "checks",
    });
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
    // Passed: there is no invented marker, and every registered check must still pass.
    forge.replayGate = "success";
    await service.checkTool.checkForCrew("ab12cd34");
    expect(await service.reviews.mergeReview("ab12cd34", review.id)).toMatchObject({
      ok: true,
    });
    expect(forge.calls).toContain(`putIn ${PR328.branch} ${PR328.headSha}`);
  });
});

// Accepted INF-1177 piece 0: exercise the actual crew check interface and saved declarations.
describe("check facts without host verdicts", () => {
  it("returns raw run identity and movement without a separate crew-readiness prerequisite (INF-1555 F12)", async () => {
    const { tasks, repos, service, forge } = setup();
    await insertDirectPrTask(tasks, repos);
    forge.atHead.feedbeef = [
      { name: "linux-checks", state: "cancelled", run: 41, workflow: 7, event: "pull_request" },
      { name: "linux-checks", state: "success", run: 42, workflow: 7, event: "pull_request" },
    ] as ForgeCheck[];
    Object.assign(forge, {
      pull: async (number: number): Promise<ForgePull> => ({
        number,
        headSha: forge.change!.headSha,
        state: "open",
        merged: false,
        base: "main",
        readiness: "clean",
      }),
    });
    const first = await service.checkTool.checkForCrew("ab12cd34");
    const facts = JSON.parse(
      first
        .split("\n")
        .find((line) => line.startsWith("facts: "))!
        .slice(7),
    );
    expect(facts).toMatchObject({
      headSha: "feedbeef",
      moved: false,
      readiness: "clean",
      checks: forge.atHead.feedbeef,
    });
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({ ci: "red" });
    expect(service.checks.reading("ab12cd34")?.overall).toBe("red");
    const beforeJudgment = await service.merges.merge("ab12cd34");
    expect(beforeJudgment).toMatchObject({
      ok: false,
      plain: "the checks failed",
    });
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
    expect(tasks.get("ab12cd34")?.delivery).not.toHaveProperty("crewVerdict");
    forge.change = { ...forge.change!, headSha: "cafe0042" };
    const moved = await service.checkTool.checkForCrew("ab12cd34");
    expect(moved).toContain('"moved":true');
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({ ci: "green" });
    expect(service.checks.reading("ab12cd34")?.overall).toBe("green");
    const afterMovement = await service.merges.merge("ab12cd34");
    expect(afterMovement.ok).toBe(true);
    expect(forge.calls.filter((call) => call.startsWith("putIn"))).toHaveLength(1);
    console.log(
      JSON.stringify({
        first,
        beforeJudgment,
        moved,
        afterMovement,
        saved: tasks.get("ab12cd34")?.delivery,
      }),
    );
  });
});

/**
 * INF-1884 R2: the slot's number and head name one change. A reading of a
 * selected pull request writes its number with the head it read, and when
 * the task's own change is named again the same write names the own head
 * and drops the selection's reading, so the change record never sees the
 * selection's head under the task's own number.
 */
describe("the slot's head moves with the change it names (INF-1884 R2)", () => {
  const RELEASE_BRANCH = "release-please--branches--main";
  const R1 = "1".repeat(40);
  const R2 = "2".repeat(40);
  class SelectingForge extends FakeForge {
    constructor() {
      super();
      if (this.change) this.change.url = "https://github.com/infinitary-labs/infinitary/pull/23";
    }

    release: ForgeChange = {
      number: 94,
      url: "https://github.com/infinitary-labs/infinitary/pull/94",
      branch: RELEASE_BRANCH,
      headSha: R1,
      title: "chore(main): release 0.2.0",
    };
    override async changeFor(branch: string) {
      if (branch !== RELEASE_BRANCH) return super.changeFor(branch);
      this.calls.push(`changeFor ${branch}`);
      return { ...this.release };
    }
    async pull(number: number): Promise<ForgePull> {
      this.calls.push(`pull ${number}`);
      const change = number === this.release.number ? this.release : this.change;
      if (!change) throw new ForgeError("transient", "no such pull request");
      return {
        number,
        state: "open",
        merged: false,
        headSha: change.headSha,
        base: "main",
        branch: change.branch,
        title: change.title,
        headRepo: "infinitary-labs/infinitary",
        readiness: "clean",
      };
    }
  }

  it("names the own head and drops the selection's reading when the own change is named again, after the selected pull request moved past its review", async () => {
    const forge = new SelectingForge();
    const { db, tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    repos.configure(tasks.get("ab12cd34")!.repoId!, {
      origin: "https://github.com/infinitary-labs/infinitary.git",
    });
    seedDelivery(tasks, "ab12cd34", { prNumber: 23, prUrl: forge.change?.url ?? undefined });
    await service.checkTool.checkForCrew("ab12cd34");
    const store = new TaskStore(db);
    const heads = () => store.changes.forTask("ab12cd34")?.versions.map((version) => version.head);
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prNumber: 23,
      headSha: "feedbeef",
      ci: "green",
    });
    expect(heads()).toEqual(["feedbeef"]);

    // check_change(pull) selects the release pull request: the slot's number
    // and head follow it, and the review records the head it read.
    await service.checkTool.checkForCrew("ab12cd34", { pull: 94 });
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prNumber: 94,
      changeLabel: "#94",
      headSha: R1,
      checks: { headSha: R1 },
      checkTarget: { number: 94, headSha: R1 },
    });
    forge.release = { ...forge.release, headSha: R2 };
    await service.checkTool.checkForCrew("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prNumber: 94,
      headSha: R2,
      checks: { headSha: R2 },
      checkTarget: { headSha: R1 },
    });
    expect(heads()).toEqual(["feedbeef"]);

    // open_change on the task's own branch names its own change again: one
    // write carries the own number with the own head and no reading, never
    // the own number beside the release's head and checks.
    await service.publication.open("ab12cd34", { title: "fix: ship it", body: "b" });
    const own = tasks.get("ab12cd34")?.delivery;
    expect(own).toMatchObject({ prNumber: 23, changeLabel: "#23", headSha: "feedbeef" });
    expect(own?.checkTarget).toBeUndefined();
    expect(own?.checks).toBeUndefined();
    expect(own?.ci).toBeUndefined();
    expect(own?.ciAt).toBeUndefined();
    expect(heads()).toEqual(["feedbeef"]);
    await service.checkTool.checkForCrew("ab12cd34");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prNumber: 23,
      headSha: "feedbeef",
      ci: "green",
      checks: { headSha: "feedbeef" },
    });
    expect(heads()).toEqual(["feedbeef"]);
    expect(store.changes.forTask("ab12cd34")?.versions[0]?.checks).toMatchObject({
      state: "green",
      snapshot: { headSha: "feedbeef" },
    });
  });

  // Re-review INF-2546 R3, under the captain's "several changes per task,
  // one per PR": naming the task's own change after another pull request
  // brings back the own pull request's number with its branch. Once the own
  // pull request merged, the reading then reads it by that number, never the
  // other pull request it read last.
  it("reads the task's own merged pull request by its own number when its change is named after another pull request (INF-2546)", async () => {
    const forge = new (class extends SelectingForge {
      own: ForgeChange | null = null;
      override async pull(number: number): Promise<ForgePull> {
        if (!this.own || number !== this.own.number) return super.pull(number);
        this.calls.push(`pull ${number}`);
        return {
          number,
          state: "closed",
          merged: true,
          headSha: this.own.headSha,
          base: "main",
          branch: this.own.branch,
          title: this.own.title,
          headRepo: "infinitary-labs/infinitary",
          readiness: "clean",
        };
      }
    })();
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    repos.configure(tasks.get("ab12cd34")!.repoId!, {
      origin: "https://github.com/infinitary-labs/infinitary.git",
    });
    seedDelivery(tasks, "ab12cd34", { prNumber: 23, prUrl: forge.change?.url ?? undefined });
    const own = reportedChange(await service.checkTool.checkForCrew("ab12cd34"));
    await service.checkTool.checkForCrew("ab12cd34", { pull: 94 });
    expect(tasks.get("ab12cd34")?.delivery?.prNumber).toBe(94);
    // The own pull request merges where the project lives: its branch has no open one.
    forge.own = forge.change;
    forge.change = null;
    forge.calls.length = 0;
    const answer = await service.checkTool.checkForCrew("ab12cd34", { change: own ?? "" });
    expect(answer).toContain("overall: merged");
    expect(answer).toContain("#23");
    expect(forge.calls).toContain("pull 23");
    expect(forge.calls).not.toContain("pull 94");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({ prNumber: 23, ci: "merged" });
    expect(tasks.get("ab12cd34")?.delivery?.checkTarget).toBeUndefined();
  });

  it("keeps the old change id tied to its repository when another request reuses its number", async () => {
    const forge = new SelectingForge();
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34");
    if (!task?.repoId) throw new Error("The fixture needs a managed project.");
    repos.configure(task.repoId, { origin: "https://github.com/infinitary-labs/infinitary.git" });
    const oldURL = "https://github.com/Infinitary-Labs/Infinitary/pull/94/";
    forge.release = { ...forge.release, url: oldURL };
    const old = reportedChange(await service.checkTool.checkForCrew(task.id, { pull: 94 }));
    if (!old) throw new Error("The fixture needs the former change id.");
    const equivalent = "https://github.com/infinitary-labs/infinitary/pull/94";
    forge.release = { ...forge.release, url: equivalent };
    expect(reportedChange(await service.checkTool.checkForCrew(task.id, { pull: 94 }))).toBe(old);
    seedDelivery(tasks, task.id, { prUrl: undefined });
    repos.configure(task.repoId, { origin: "https://github.com/infinitary-labs/new-home.git" });
    const newURL = "https://github.com/infinitary-labs/new-home/pull/94";
    forge.release = { ...forge.release, url: newURL, headSha: R2 };
    const pull = forge.pull.bind(forge);
    forge.pull = async (number) => ({
      ...(await pull(number)),
      headRepo: "infinitary-labs/new-home",
    });
    const changeFor = forge.changeFor.bind(forge);
    forge.changeFor = async (branch) => {
      const pending = tasks.changesFor(task.id).find((change) => change.handle?.url === newURL);
      expect(pending?.versions.some((version) => !!version.checks?.snapshot)).toBe(false);
      forge.changeFor = changeFor;
      return changeFor(branch);
    };
    const replacement = reportedChange(await service.checkTool.checkForCrew(task.id, { pull: 94 }));
    expect(replacement).not.toBe(old);
    expect(tasks.changesFor(task.id).find((change) => change.id === old)?.handle?.url).toBe(
      equivalent,
    );
    const saved = tasks.changesFor(task.id).find((change) => change.id === replacement);
    expect(saved?.handle?.url).toBe(newURL);
    expect(saved?.versions.map((version) => version.head)).toEqual([R2]);
    expect(saved?.versions[0]?.checks?.snapshot?.headSha).toBe(R2);
    forge.calls.length = 0;
    expect(await service.checkTool.checkForCrew(task.id, { change: old })).toContain(
      "former address",
    );
    expect(forge.calls).toEqual([]);
    expect(
      reportedChange(await service.checkTool.checkForCrew(task.id, { change: replacement ?? "" })),
    ).toBe(replacement);
  });

  const reportedChange = (answer: string): string | null => {
    const line = answer.split("\n").find((item) => item.startsWith("facts: "));
    if (!line) throw new Error(`No facts line in: ${answer}`);
    return (JSON.parse(line.slice("facts: ".length)) as { change: { id: string | null } }).change
      .id;
  };

  // INF-2546 R3 and R4, under the captain's "several changes per task, one
  // per PR": a reading reports the id of the change it read, so passing that
  // id back to check_change reads the same change; and a change whose review
  // the capped review list no longer keeps is read again by its number,
  // never swapped for the task's own.
  it("reports the id of the change it read and reads that change again by it, also once its review left the capped list (INF-2546)", async () => {
    const forge = new SelectingForge();
    const { tasks, repos, service } = setup({ forge });
    await insertDirectPrTask(tasks, repos);
    repos.configure(tasks.get("ab12cd34")!.repoId!, {
      origin: "https://github.com/infinitary-labs/infinitary.git",
    });
    seedDelivery(tasks, "ab12cd34", { prNumber: 23, prUrl: forge.change?.url ?? undefined });
    const own = reportedChange(await service.checkTool.checkForCrew("ab12cd34"));
    expect(own).toBe(tasks.changeFor("ab12cd34")?.id);
    const read = reportedChange(await service.checkTool.checkForCrew("ab12cd34", { pull: 94 }));
    const release = tasks.changesFor("ab12cd34").find((change) => change.handle?.number === 94);
    expect(release).toBeDefined();
    expect(read).toBe(release?.id);
    expect(read).not.toBe(own);
    expect(
      reportedChange(await service.checkTool.checkForCrew("ab12cd34", { change: read ?? "" })),
    ).toBe(release?.id);
    expect(tasks.get("ab12cd34")?.delivery?.checkTarget).toMatchObject({ number: 94 });
    expect(
      reportedChange(await service.checkTool.checkForCrew("ab12cd34", { change: own ?? "" })),
    ).toBe(own);
    expect(tasks.get("ab12cd34")?.delivery?.checkTarget).toBeUndefined();
    // The capped list no longer keeps the release's review; its change stays on the record.
    seedDelivery(tasks, "ab12cd34", { mergeReviews: [] });
    expect(tasks.changesFor("ab12cd34").some((change) => change.id === release?.id)).toBe(true);
    expect(
      await service.checkTool.checkForCrew("ab12cd34", {
        change: release?.id,
        declaration: { headSha: R1, verdict: "flake", evidence: "The runner lost its disk." },
      }),
    ).toContain("read it first with change alone, then send declaration");
    expect(tasks.get("ab12cd34")?.delivery?.checkTarget).toBeUndefined();
    forge.calls.length = 0;
    expect(
      reportedChange(await service.checkTool.checkForCrew("ab12cd34", { change: release?.id })),
    ).toBe(release?.id);
    expect(forge.calls).toContain("pull 94");
    expect(tasks.get("ab12cd34")?.delivery).toMatchObject({
      prNumber: 94,
      checkTarget: { number: 94, branch: RELEASE_BRANCH },
    });
  });
});

// INF-2114, the captain's checked improvement: "A project with no checks is a
// recorded fact: its card offers Merge now, nothing watches for two hours".
// The crewmate records it once with its evidence; a later change in the
// project reads no checks unwatched, and the first check that runs ends it.
describe('a project with no checks (docs/forge.md, "A project with no checks")', () => {
  async function noCiProject() {
    const harness = setup();
    const { tasks, repos, forge } = harness;
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34")!;
    repos.configure(task.repoId!, { origin: "https://github.com/x/y.git" });
    const headSha = await git(task.repoDir, ["rev-parse", "HEAD"]);
    forge.change = { ...forge.change!, headSha };
    forge.states = [];
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
    const heard: NoChecksChange[] = [];
    repos.onNoChecks((_repo, change) => heard.push(change));
    const absence = {
      headSha,
      evidence: "The default branch has no workflow files and its rules require no checks.",
      localGate: "The project's own tests passed at this version.",
      project: true,
    };
    return { ...harness, task, repoId: task.repoId!, headSha, heard, absence };
  }

  it("records the crewmate's declaration for the project, reads its later changes as no checks with nothing watched, and ends the record when a check runs", async () => {
    const { tasks, repos, service, forge, task, repoId, headSha, heard, absence } =
      await noCiProject();
    await service.checkTool.checkForCrew(task.id);
    expect(tasks.get(task.id)?.delivery?.ciWatch).toMatchObject({ head: headSha });

    const answer = await service.checkTool.checkForCrew(task.id, { absentChecks: absence });
    expect(answer).toContain("Absence evidence stored for this version");
    expect(answer).toContain(PROJECT_ABSENCE_WORDS.recorded);
    expect(repos.get(repoId)?.noChecks).toMatchObject({
      task: task.key || task.id,
      head: headSha,
      evidence: absence.evidence,
    });
    expect(heard).toMatchObject([{ kind: "recorded" }]);
    // Declaring again keeps the first record, with its task and evidence.
    expect(await service.checkTool.checkForCrew(task.id, { absentChecks: absence })).toContain(
      PROJECT_ABSENCE_WORDS.already,
    );
    expect(heard).toHaveLength(1);

    // A later change in the same project needs no declaration of its own.
    insertTask(tasks, {
      id: "ef56ab78",
      repoId,
      repoDir: task.repoDir,
      branch: "fm/task-ef56ab78",
    });
    const reading = await service.checkTool.checkForCrew("ef56ab78");
    expect(reading).toContain(PROJECT_NO_CHECKS_WORDS);
    expect(tasks.get("ef56ab78")?.delivery).toMatchObject({
      checks: { items: [], absenceDeclared: true },
    });
    expect(tasks.get("ef56ab78")?.delivery?.ciWatch).toBeUndefined();
    expect(service.checks.reading("ef56ab78")?.overall).toBe("green");

    // A job that skipped did not run: the record stands.
    forge.states = ["skipped"];
    await service.checkTool.checkForCrew("ef56ab78");
    expect(repos.get(repoId)?.noChecks).toBeDefined();
    expect(tasks.get("ef56ab78")?.delivery?.ciWatch).toBeUndefined();

    // A check that runs ends the record, and checks hold the merge again.
    forge.states = ["pending"];
    await service.checkTool.checkForCrew("ef56ab78");
    expect(repos.get(repoId)?.noChecks).toBeUndefined();
    expect(heard.at(-1)).toEqual({ kind: "ended", check: "linux-checks", change: "#23" });
    expect(tasks.get("ef56ab78")?.delivery).toMatchObject({ ci: "pending" });
    expect((await service.merges.merge("ef56ab78")).ok).toBe(false);
    forge.states = [];
    await service.checkTool.checkForCrew("ef56ab78");
    expect(service.checks.reading("ef56ab78")?.overall).toBe("pending");
    expect(tasks.get("ef56ab78")?.delivery?.ciWatch).toMatchObject({ head: headSha });
  });

  it("merges a later change on the captain's kept click while the record stands, with nothing watched", async () => {
    const { tasks, service, forge, task, repoId, headSha, absence } = await noCiProject();
    await service.checkTool.checkForCrew(task.id, { absentChecks: absence });
    insertTask(tasks, {
      id: "ef56ab78",
      repoId,
      repoDir: task.repoDir,
      branch: "fm/task-ef56ab78",
    });
    await service.checkTool.checkForCrew("ef56ab78");
    expect(tasks.get("ef56ab78")?.delivery?.ciWatch).toBeUndefined();
    const click = {
      head: headSha,
      prNumber: 23,
      unattended: false,
      beforeDispatch: () => undefined,
    };
    expect((await service.merges.merge("ef56ab78", click)).ok).toBe(true);
    expect(forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([
      `putIn fm/task-ef56ab78 ${headSha}`,
    ]);
  });

  it("refuses the project record beside a named pull request, and where a check ran at the version", async () => {
    const { repos, service, forge, task, repoId, absence } = await noCiProject();
    expect(await service.checkTool.checkForCrew(task.id, { pull: 23, absentChecks: absence })).toBe(
      PROJECT_ABSENCE_WORDS.withPull,
    );
    expect(repos.get(repoId)?.noChecks).toBeUndefined();

    forge.states = ["success"];
    await service.checkTool.checkForCrew(task.id);
    const answer = await service.checkTool.checkForCrew(task.id, { absentChecks: absence });
    expect(answer).toContain(PROJECT_ABSENCE_WORDS.ran(["linux-checks"]));
    expect(answer).not.toContain(PROJECT_ABSENCE_WORDS.recorded);
    expect(repos.get(repoId)?.noChecks).toBeUndefined();
  });

  // docs/forge.md, "Advisory workflows".
  it("keeps the record while only an advisory check runs", async () => {
    const { tasks, repos, service, forge, task, repoId, headSha } = await noCiProject();
    repos.configure(repoId, { requireChecks: false });
    forge.atHead[headSha] = [
      { name: "early-tests", state: "neutral", advisory: "pending" },
    ] as ForgeCheck[];
    await service.checkTool.checkForCrew(task.id);
    expect(repos.get(repoId)?.noChecks).toBeDefined();
    expect(tasks.get(task.id)?.delivery?.ciWatch).toBeUndefined();
    expect(service.checks.reading(task.id)?.overall).toBe("green");
  });

  it("keeps the record the captain sets in the project's settings, and ends it there", async () => {
    const { tasks, repos, service, task, repoId } = await noCiProject();
    expect(repos.configure(repoId, { requireChecks: false }).noChecks).toMatchObject({
      at: expect.any(Number),
    });
    await service.checkTool.checkForCrew(task.id);
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    expect(tasks.get(task.id)?.delivery?.ciWatch).toBeUndefined();
    const review = await service.checkTool.checkForCrew(task.id, { pull: 23 });
    expect(review).toContain(PROJECT_NO_CHECKS_WORDS);
    expect(review).not.toContain("An empty hosted reading alone does not establish");
    expect(service.checks.reading(task.id)?.overall).toBe("green");
    expect(repos.configure(repoId, { requireChecks: true }).noChecks).toBeUndefined();
    await service.checkTool.checkForCrew(task.id);
    expect(service.checks.reading(task.id)?.overall).toBe("pending");
  });
});

/**
 * INF-4552 (a user's report on GitHub Enterprise; the captain's choice "Fix
 * it by each host's own rule"): a finished check that ended neutral, such
 * as a coverage bot's, holds nothing, as GitHub's required checks pass on
 * success, skipped or neutral; a check a person must start, such as a
 * GitLab manual job that blocks its pipeline, holds with no wake promised.
 */
describe("a neutral check by each host's own rule (INF-4552)", () => {
  const HEAD = "feedbeef";
  const PASSED = [
    "build",
    "lint",
    "typecheck",
    "unit-tests",
    "integration-tests",
    "e2e",
    "CodeQL",
    "Analyze",
  ];
  const NEUTRAL = "Test Insights - Coverage Delta";
  const runJson = (name: string, conclusion: string, app: string, id: number) => ({
    id,
    name,
    status: "completed",
    conclusion,
    started_at: "2026-11-15T20:00:00Z",
    completed_at: "2026-11-15T20:10:00Z",
    app: { slug: app },
    check_suite: { id: 900 + id },
  });

  /** The user's checks as GitHub answers them, through the app's real GitHub reader. */
  async function readOnGitHub() {
    const { forge } = await githubStub({
      [`GET /repos/octo/meter/commits/${HEAD}/check-runs`]: () => ({
        json: {
          total_count: 9,
          check_runs: [
            ...PASSED.map((name, index) => runJson(name, "success", "github-actions", index + 1)),
            runJson(NEUTRAL, "neutral", "test-insights", 99),
          ],
        },
      }),
      [`GET /repos/octo/meter/commits/${HEAD}/status`]: () => ({
        json: { state: "success", statuses: [] },
      }),
      "GET /repos/octo/meter/actions/runs": () => ({ json: { total_count: 0, workflow_runs: [] } }),
    });
    return forge.checks({
      number: 23,
      url: null,
      branch: "fm/task-ab12cd34",
      headSha: HEAD,
      title: "fix: ship it",
    });
  }

  it("reads a finished neutral GitHub check run as passed, still says neutral, and merges", async () => {
    const read = await readOnGitHub();
    const fake = new FakeForge();
    fake.atHead[HEAD] = read.items.map((item) => ({ name: item.name, state: item.state }));
    const { tasks, repos, service } = setup({ forge: fake });
    await insertDirectPrTask(tasks, repos);
    recordPr(tasks, 23);

    expect(await service.checks.readForOffer("ab12cd34")).toEqual({
      overall: "green",
      recorded: true,
    });
    const delivery = tasks.get("ab12cd34")?.delivery;
    expect(checkSnapshotSummary(delivery!.checks!)).toMatchObject({
      overall: "green",
      words: "8 passed · 1 neutral",
    });
    expect((await service.merges.merge("ab12cd34")).ok).toBe(true);
    expect(fake.calls.filter((call) => call.startsWith("putIn"))).toHaveLength(1);
  });

  it("holds a job waiting for a person to start it, names it, and promises no wake", async () => {
    let now = 1_000_000;
    const { tasks, repos, service, forge, db } = setup({ now: () => now });
    await insertDirectPrTask(tasks, repos);
    recordPr(tasks, 23);
    forge.atHead[HEAD] = [
      { name: "test", state: "success" },
      { name: "approve", state: "neutral", manual: true },
    ] as ForgeCheck[];

    const said = await service.checkTool.checkForCrew("ab12cd34");
    expect(said).toContain("- approve: manual / waiting for a person to start it");
    expect(said).toContain("approve waits for a person to start it");
    expect(said).toContain("no wake comes");
    const delivery = tasks.get("ab12cd34")?.delivery;
    expect(delivery?.ciWatch).toBeUndefined();
    expect(checkSnapshotSummary(delivery!.checks!)).toMatchObject({
      overall: "pending",
      words: "1 passed · 1 waiting to be started",
    });
    expect(service.checks.reading("ab12cd34")?.overall).toBe("pending");

    const steers: TypedWake[] = [];
    const watcher = new CheckWatcher({
      tasks,
      inbox: new InboxStore(db, { now: () => now }),
      runKept: () => {},
      read: (taskId) => service.checks.readWatched(taskId),
      steer: async (_taskId, wake) => {
        steers.push(wake);
      },
    });
    for (let minute = 1; minute <= 30; minute++) {
      now += 60_000;
      await watcher.poll(now);
    }
    expect(steers).toHaveLength(0);

    expect((await service.merges.merge("ab12cd34")).ok).toBe(false);
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });
});

/**
 * docs/forge.md, "Advisory workflows". Each reading is one the GitHub reader
 * already marked (`asAdvisory`), so these start past the reader.
 */
describe("a check from an advisory workflow", () => {
  const HEAD = "feedbeef";
  const early = (state: ForgeCheckState) =>
    ({ name: "early-tests", state: "neutral", advisory: state }) as ForgeCheck;

  async function readWith(checks: ForgeCheck[]) {
    const harness = setup();
    await insertDirectPrTask(harness.tasks, harness.repos);
    recordPr(harness.tasks, 23);
    harness.forge.atHead[HEAD] = checks;
    const said = await harness.service.checkTool.checkForCrew("ab12cd34");
    const delivery = harness.tasks.get("ab12cd34")?.delivery;
    return { ...harness, said, delivery };
  }

  it.each([
    ["pending", "in_progress / -", "running"],
    ["failure", "completed / failure", "failed"],
    ["timed_out", "completed / timed_out", "timed out"],
    ["cancelled", "completed / cancelled", "cancelled"],
  ] as const)(
    "merges while the advisory check is %s, and still names its own state",
    async (state, facts, words) => {
      const { said, delivery, service, forge } = await readWith([
        { name: "unit-tests", state: "success" },
        early(state),
      ]);
      expect(said).toContain(
        `- early-tests: ${facts}, advisory, so it holds nothing here; a GitHub branch rule that requires it still holds the merge on GitHub`,
      );
      expect(checkSnapshotSummary(delivery!.checks!)).toMatchObject({
        overall: "green",
        words: `1 passed · 1 advisory, ${words}`,
      });
      expect(delivery?.ciWatch).toBeUndefined();
      expect((await service.merges.merge("ab12cd34")).ok).toBe(true);
      expect(forge.calls.filter((call) => call.startsWith("putIn"))).toHaveLength(1);
    },
  );

  it.each([
    ["failure", "red"],
    ["pending", "pending"],
  ] as const)(
    "holds while a required check reads %s, whatever the advisory one says",
    async (state, overall) => {
      const { delivery, service, forge } = await readWith([
        { name: "unit-tests", state },
        early("success"),
      ]);
      expect(checkSnapshotSummary(delivery!.checks!).overall).toBe(overall);
      expect((await service.merges.merge("ab12cd34")).ok).toBe(false);
      expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
    },
  );

  // docs/i18n.md: a person reads the label in their language; the crew's wake stays English.
  it("words an advisory check in the reader's language, and in English for the crew", async () => {
    const { delivery, service } = await readWith([
      { name: "unit-tests", state: "success" },
      early("pending"),
    ]);
    expect(inLanguage("fr", () => checkSnapshotSummary(delivery!.checks!).words)).toContain(
      "indicatif, en cours",
    );
    setCurrentLanguage("fr");
    const wake = await service.checks
      .readWatched("ab12cd34")
      .finally(() => setCurrentLanguage("en"));
    expect(wake).toMatchObject({
      kind: "finished",
      checks: expect.arrayContaining([{ name: "early-tests", state: "advisory, running" }]),
    });
  });

  it("times the checks by the required ones alone", async () => {
    const at = (time: string) => Date.parse(`2026-11-27T${time}Z`);
    const { delivery } = await readWith([
      {
        name: "unit-tests",
        state: "success",
        startedAt: at("06:54:39"),
        finishedAt: at("07:02:10"),
      },
      { ...early("success"), startedAt: at("06:54:37"), finishedAt: at("08:23:39") },
    ]);
    expect([delivery?.ciStartedAt, delivery?.ciFinishedAt]).toEqual([
      at("06:54:39"),
      at("07:02:10"),
    ]);
  });

  it("waits on a reading where only advisory checks ran, as on an empty one", async () => {
    const { delivery, service, forge } = await readWith([early("success")]);
    expect(checkSnapshotSummary(delivery!.checks!)).toMatchObject({
      overall: "pending",
      words: "advisory, passed",
    });
    expect(service.checks.reading("ab12cd34")?.overall).toBe("pending");
    expect((await service.merges.merge("ab12cd34")).ok).toBe(false);
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });
});
