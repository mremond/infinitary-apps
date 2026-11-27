import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { type Route, stub } from "../../../../../tests/helpers/githubForgeStub";
import { BUNDLED_NAMING } from "../../../../../tests/helpers/namingRunbook";
import { checkSnapshotSummary } from "../../../../shared/checkSnapshot";
import { BATCH_CHECK } from "../../forge";
import { presentationCommitMessage } from "../../presentation";
import { readOpenChanges } from "./changes";
import {
  GITHUB_API_URL,
  GitHubForge,
  githubApiBaseFor,
  githubApiBaseUrl,
  githubGraphqlUrl,
  githubUploadOrigin,
} from "./githubForge";

/**
 * The REST GitHub forge against a local stub of GitHub's API (git
 * integration PR 1.1): real HTTP, real headers, the green rule over check
 * runs AND commit statuses, and every failure typed. PR 1.2 binds it to the
 * app's own GitHub sign-in; here the token is the test's.
 */

const PULL = {
  number: 23,
  html_url: "https://github.com/octo/meter/pull/23",
  title: "fix: correct meter",
  body: "Why",
  head: { sha: "feedbeef", ref: "fm/task-1" },
};

describe("GitHubForge", () => {
  it("INF-203 F5: marks only the reviewed draft ready through the forge's GraphQL request", async () => {
    let draft = true;
    const { forge, seen } = await stub({
      "GET /repos/octo/meter/pulls/23": () => ({
        json: { ...PULL, node_id: "PR_fixture_23", state: "open", base: { ref: "main" }, draft },
      }),
      "POST /graphql": (call) => {
        expect(call.body).toMatchObject({ variables: { id: "PR_fixture_23" } });
        draft = false;
        return {
          json: { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } },
        };
      },
    });
    const change = {
      number: PULL.number,
      url: PULL.html_url,
      branch: PULL.head.ref,
      headSha: PULL.head.sha,
      draft: true,
    };
    await expect(
      forge.markReady({ ...change, headSha: "another-version" }, () => {}),
    ).rejects.toThrow("changed");
    await expect(
      forge.markReady(change, () => {
        throw new Error("Proof changed before send");
      }),
    ).rejects.toThrow("Proof changed");
    expect(seen.filter((call) => call.method === "POST")).toHaveLength(0);
    const result = await forge.markReady(change, () => {});
    expect(result.draft).toBe(false);
    expect((await forge.pull(PULL.number)).readiness).not.toBe("draft");
    await forge.markReady(change, () => {
      throw new Error("Already ready must not send");
    });
    expect(seen.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(seen.find((call) => call.method === "POST")?.headers.authorization).toBe(
      "Bearer gho_test",
    );
    console.log(
      "INF-203 GitHub readiness",
      JSON.stringify(seen.map(({ method, url, body }) => ({ method, url, body }))),
    );
  });

  it("finds the open change for a branch, with the person's sign-in and GitHub's API headers", async () => {
    const { seen, forge } = await stub({ "GET /repos/octo/meter/pulls": () => ({ json: [PULL] }) });
    const change = await forge.changeFor("fm/task-1");
    expect(change).toEqual({
      number: 23,
      url: "https://github.com/octo/meter/pull/23",
      branch: "fm/task-1",
      headSha: "feedbeef",
      title: "fix: correct meter",
      body: "Why",
    });
    expect(forge.label(change as NonNullable<typeof change>)).toBe("#23");
    const [request] = seen;
    expect(request?.url).toBe(
      "/repos/octo/meter/pulls?head=octo%3Afm%2Ftask-1&state=open&per_page=1",
    );
    expect(request?.headers.authorization).toBe("Bearer gho_test");
    expect(request?.headers.accept).toBe("application/vnd.github+json");
    expect(request?.headers["x-github-api-version"]).toBe("2022-11-28");
  });

  it("answers no change when GitHub lists none", async () => {
    const { forge } = await stub({ "GET /repos/octo/meter/pulls": () => ({ json: [] }) });
    await expect(forge.changeFor("fm/task-1")).resolves.toBeNull();
  });

  // Accepted INF-1177 piece 0: absence is a reading, not a host verdict.
  it("returns an empty check list without inventing a pending check", async () => {
    const { forge } = await stub({
      "GET /repos/octo/meter/commits/feedbeef/check-runs": () => ({ json: { check_runs: [] } }),
      "GET /repos/octo/meter/commits/feedbeef/status": () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () => ({ json: { total_count: 0, workflow_runs: [] } }),
    });
    expect(await forge.checks({ number: 23, url: null, branch: "b", headSha: "feedbeef" })).toEqual(
      { items: [], complete: true },
    );
  });

  // INF-2675 finding 7: on 2026-11-05 GitHub answered 500, with no message,
  // to a commit's statuses while two pull requests' checks ran; typed as a
  // refusal, it ended both check watches instead of reading again.
  it("types GitHub's 500 on a check reading as transient, so the watch reads again", async () => {
    const head = "5dfc572dc7ea84dfc3a07cf252c8eaedda9541d6";
    const { forge } = await stub({
      [`GET /repos/octo/meter/commits/${head}/check-runs`]: () => ({ json: { check_runs: [] } }),
      [`GET /repos/octo/meter/commits/${head}/status`]: () => ({ status: 500 }),
    });
    await expect(
      forge.checks({ number: 23, url: null, branch: "b", headSha: head }),
    ).rejects.toMatchObject({
      failure: "transient",
      message: `GitHub answered 500 to GET /repos/octo/meter/commits/${head}/status`,
    });
  });

  // INF-988: INF-643's repair was declared at 93355db9 while PR #203
  // conflicted, so GitHub never ran anything there; the pull request then
  // moved on, clean. These are GitHub's answers on 2026-10-23.
  it("reads the requested earlier version without interpreting repair settlement", async () => {
    const head = "93355db9d04e964513879db74d068a7789cb4c16";
    const { forge, seen } = await stub({
      [`GET /repos/octo/meter/commits/${head}/check-runs`]: () => ({
        json: { total_count: 0, check_runs: [] },
      }),
      [`GET /repos/octo/meter/commits/${head}/status`]: () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () => ({ json: { total_count: 0, workflow_runs: [] } }),
    });
    expect(
      await forge.checks(
        { number: 203, url: null, branch: "fm/task-643", headSha: "c7f9d964" },
        head,
      ),
    ).toEqual({ items: [], complete: true });
    expect(seen.map((c) => c.url.split("?")[0])).toEqual([
      `/repos/octo/meter/commits/${head}/check-runs`,
      `/repos/octo/meter/commits/${head}/status`,
      "/repos/octo/meter/actions/runs",
    ]);
  });

  // INF-893: PR #328 read green at 19:07:01Z on its dispatched replay-gate
  // alone, while GitHub was creating its ci, journeys and phone runs. The
  // runs, check and project count below are #328's own, as GitHub gave them.
  it("relays the pull request's own run facts without inferring missing checks, and leaves a run started by hand out of its reading while a branch's reading keeps it (INF-1177, INF-1891)", async () => {
    const head = "21abc81254618e65ff72612b155f0aa261bc5372";
    const replay = {
      id: 39836971427,
      name: "replay",
      event: "workflow_dispatch",
      run_number: 18,
      workflow_id: 393063421,
      check_suite_id: 107972720379,
      status: "completed",
      run_started_at: "2026-10-22T19:04:58Z",
      head_sha: head,
    };
    const ci = {
      id: 39837269252,
      name: "ci",
      event: "pull_request",
      run_number: 819,
      workflow_id: 386227718,
      check_suite_id: 107973566509,
      status: "queued",
      run_started_at: "2026-10-22T19:07:00Z",
      head_sha: head,
    };
    const replayGate = {
      name: "replay-gate",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-22T19:05:02Z",
      completed_at: "2026-10-22T19:06:06Z",
      check_suite: { id: replay.check_suite_id },
    };
    const replayGateRead = {
      name: "replay-gate",
      state: "success",
      startedAt: Date.parse("2026-10-22T19:05:02Z"),
      finishedAt: Date.parse("2026-10-22T19:06:06Z"),
    };
    let versionRuns: (typeof replay)[] = [replay];
    let checkRuns: (typeof replayGate)[] = [replayGate];
    let projectRuns = 1507;
    const { forge } = await stub({
      [`GET /repos/octo/meter/commits/${head}/check-runs`]: () => ({
        json: { total_count: checkRuns.length, check_runs: checkRuns },
      }),
      [`GET /repos/octo/meter/commits/${head}/status`]: () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": (request) => ({
        json: request.url.includes("head_sha=")
          ? { total_count: versionRuns.length, workflow_runs: versionRuns }
          : { total_count: projectRuns, workflow_runs: [] },
      }),
      "GET /repos/octo/meter/pulls/328": () => ({
        json: { mergeable: true, mergeable_state: "clean" },
      }),
    });
    const change = { number: 328, url: null, branch: "fm/task-7aa0123e", headSha: head };

    // The reading #328 got: a replay gate a crewmate started by hand ran at the
    // version, but it is not the pull request's check (INF-1891, the captain:
    // "for merge we only care about the PR checks"), and no run of its own is
    // on the version yet. Nothing is inferred in its place.
    expect(await forge.checks(change)).toMatchObject({ items: [], complete: true });
    // GitHub lists the run before its jobs have checks: still pending, now by the run.
    versionRuns = [ci, replay];
    expect(await forge.checks(change)).toMatchObject({
      // It sums up the run, a row no check of its own (INF-5097 piece 1's review).
      items: [
        {
          name: "ci (run 819)",
          state: "pending",
          summary: true,
          startedAt: Date.parse(ci.run_started_at),
        },
      ],
    });
    versionRuns = [{ ...ci, status: "completed" }, replay];
    checkRuns = [
      {
        name: "typecheck-lint-build",
        status: "completed",
        conclusion: "success",
        started_at: "2026-10-22T19:08:50Z",
        completed_at: "2026-10-22T19:10:44Z",
        check_suite: { id: ci.check_suite_id },
      },
      replayGate,
    ];
    expect((await forge.checks(change)).items.map((check) => [check.name, check.state])).toEqual([
      ["typecheck-lint-build", "success"],
    ]);
    // A branch's own reading, as the default branch's checks are read, carries
    // no pull request: every run at its version is its own, the hand-started one too.
    versionRuns = [replay];
    checkRuns = [replayGate];
    projectRuns = 0;
    expect(await forge.checks({ ...change, number: undefined })).toMatchObject({
      items: [replayGateRead],
    });
    expect(await forge.checks(change)).toMatchObject({ items: [] });
  });

  it("reads the default branch's own check runs, not a pull request's (INF-833 Fix 4)", async () => {
    const sha = "a".repeat(40);
    const { forge, seen } = await stub({
      "GET /repos/octo/meter": () => ({ json: { default_branch: "main" } }),
      "GET /repos/octo/meter/git/ref/heads/main": () => ({
        json: { object: { type: "commit", sha } },
      }),
      [`GET /repos/octo/meter/commits/${sha}/check-runs`]: () => ({
        json: {
          total_count: 1,
          check_runs: [
            {
              name: "linux-checks",
              status: "completed",
              conclusion: "success",
              started_at: "2026-10-22T06:00:00Z",
              completed_at: "2026-10-22T06:12:00Z",
            },
          ],
        },
      }),
      [`GET /repos/octo/meter/commits/${sha}/status`]: () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () => ({ json: { total_count: 1, workflow_runs: [] } }),
    });
    await expect(forge.branchChecks()).resolves.toMatchObject({
      sha,
      checks: {
        items: [expect.objectContaining({ name: "linux-checks", state: "success" })],
      },
    });
    expect(seen.map((request) => request.url.split("?")[0])).toEqual([
      "/repos/octo/meter",
      "/repos/octo/meter/git/ref/heads/main",
      `/repos/octo/meter/commits/${sha}/check-runs`,
      `/repos/octo/meter/commits/${sha}/status`,
      "/repos/octo/meter/actions/runs",
    ]);
  });

  // The team queue the app once shipped left its files in a project; the
  // app reads only whether they are still there, for its one offer to remove
  // them (docs/forge.md, "A project that still carries the team queue's files").
  describe("the team queue's files a project still carries", () => {
    const entry = (name: string, type = "file") => ({ name, type, path: name });
    const queueFiles = {
      "GET /repos/octo/meter": () => ({ json: { default_branch: "main" } }),
      "GET /repos/octo/meter/contents/.github/workflows": () => ({
        json: [
          entry("ci.yml"),
          entry("infinitary-queue.yml"),
          entry("infinitary-batch-checks.yml"),
        ],
      }),
      "GET /repos/octo/meter/contents/.github/actions/infinitary-batch": () => ({
        json: [entry("action.yml"), entry("compose.sh")],
      }),
      "GET /repos/octo/meter/contents/.github/infinitary": () => ({
        json: [
          entry("rules.mjs"),
          entry("message.mjs"),
          entry("github.mjs"),
          entry("notes", "dir"),
        ],
      }),
    } satisfies Record<string, Route>;
    const FILES = [
      ".github/workflows/infinitary-queue.yml",
      ".github/workflows/infinitary-batch-checks.yml",
      ".github/actions/infinitary-batch/action.yml",
      ".github/actions/infinitary-batch/compose.sh",
      ".github/infinitary/rules.mjs",
      ".github/infinitary/message.mjs",
      ".github/infinitary/github.mjs",
    ];

    it("names each file on the default branch and the rule set that still requires the queue's status", async () => {
      const { forge, seen } = await stub({
        ...queueFiles,
        "GET /repos/octo/meter/rules/branches/main": () => ({
          json: [
            { type: "pull_request", ruleset_id: 7 },
            {
              type: "required_status_checks",
              ruleset_id: 9,
              parameters: {
                required_status_checks: [
                  { context: "typecheck-lint-build" },
                  { context: BATCH_CHECK },
                ],
              },
            },
          ],
        }),
        "GET /repos/octo/meter/rulesets/9": () => ({ json: { id: 9, name: "main checks" } }),
      });
      expect(await forge.teamQueueLeftovers()).toEqual({
        files: FILES,
        rule: 'rule set "main checks"',
      });
      // Every folder is read on the default branch, never on a task's own.
      expect(
        seen.filter((request) => request.url.includes("/contents/")).map((request) => request.url),
      ).toEqual([
        "/repos/octo/meter/contents/.github/workflows?ref=main",
        "/repos/octo/meter/contents/.github/actions/infinitary-batch?ref=main",
        "/repos/octo/meter/contents/.github/infinitary?ref=main",
      ]);
    });

    it("names the branch's own protection when no rule set requires the status", async () => {
      const { forge } = await stub({
        ...queueFiles,
        "GET /repos/octo/meter/rules/branches/main": () => ({ json: [] }),
        "GET /repos/octo/meter/branches/main/protection/required_status_checks": () => ({
          json: {
            strict: false,
            contexts: ["typecheck-lint-build"],
            checks: [{ context: BATCH_CHECK }],
          },
        }),
      });
      expect(await forge.teamQueueLeftovers()).toEqual({
        files: FILES,
        rule: "branch protection rule for main",
      });
    });

    it("names the files alone when no rule requires the status or the sign-in may not read the rules", async () => {
      const { forge } = await stub({
        ...queueFiles,
        "GET /repos/octo/meter/contents/.github/actions/infinitary-batch": () => ({
          status: 404,
          json: { message: "Not Found" },
        }),
        "GET /repos/octo/meter/rules/branches/main": () => ({ json: [] }),
        "GET /repos/octo/meter/branches/main/protection/required_status_checks": () => ({
          status: 403,
          json: { message: "Resource not accessible by integration" },
        }),
      });
      expect(await forge.teamQueueLeftovers()).toEqual({
        files: FILES.filter((path) => !path.startsWith(".github/actions/")),
      });
    });

    it("reads no rule for a project that carries none of the queue's files", async () => {
      const { forge, seen } = await stub({
        "GET /repos/octo/meter": () => ({ json: { default_branch: "main" } }),
        "GET /repos/octo/meter/contents/.github/workflows": () => ({ json: [entry("ci.yml")] }),
      });
      expect(await forge.teamQueueLeftovers()).toEqual({ files: [] });
      expect(seen.some((request) => request.url.includes("/rules/"))).toBe(false);
      expect(seen.some((request) => request.url.includes("/protection/"))).toBe(false);
    });
  });

  it("relays check runs and commit statuses without a suite verdict", async () => {
    let runs: { name: string; status: string; conclusion: string | null }[] = [];
    let statuses: { context: string; state: string }[] = [];
    const { forge, seen } = await stub({
      "GET /repos/octo/meter/commits/feedbeef/check-runs": () => ({
        json: { total_count: runs.length, check_runs: runs },
      }),
      "GET /repos/octo/meter/commits/feedbeef/status": () => ({ json: { statuses } }),
    });
    const change = {
      number: 23,
      url: null,
      branch: "b",
      headSha: "feedbeef",
      title: "fix: correct meter",
      body: "Why",
    };
    // Zero of both: green, so a project with no checks can still put work in.
    expect(await forge.checks(change)).toMatchObject({ items: [] });
    runs = [{ name: "linux-checks", status: "completed", conclusion: "success" }];
    statuses = [{ context: "deploy/preview", state: "success" }];
    expect(await forge.checks(change)).toMatchObject({
      items: [
        { name: "linux-checks", state: "success" },
        { name: "deploy/preview", state: "success" },
      ],
    });
    runs = [{ name: "linux-checks", status: "queued", conclusion: null }];
    expect((await forge.checks(change)).items[0]?.state).toBe("pending");
    // A conditional skipped run is finished and does not block green.
    runs = [{ name: "linux-checks", status: "completed", conclusion: "skipped" }];
    expect((await forge.checks(change)).items[0]?.state).toBe("skipped");
    // Skips do not hide unfinished runs or change the neutral policy.
    runs.push({ name: "review", status: "in_progress", conclusion: null });
    expect((await forge.checks(change)).items[1]?.state).toBe("pending");
    runs = [{ name: "review", status: "completed", conclusion: "neutral" }];
    expect((await forge.checks(change)).items[0]?.state).toBe("neutral");
    // Any terminal failure on either source is red.
    runs = [{ name: "linux-checks", status: "completed", conclusion: "success" }];
    statuses = [{ context: "deploy/preview", state: "failure" }];
    expect(
      (await forge.checks(change)).items.find((item) => item.name === "deploy/preview")?.state,
    ).toBe("failure");
    expect(seen.every((request) => request.method === "GET")).toBe(true);
  });

  // The captain's ask (INF-587): the checks cell counts from GitHub's own
  // start and finish. The check runs are main's own on a0cf68a2, as GitHub gave them.
  it("keeps each check's start and finish as GitHub gives them", async () => {
    const { forge } = await stub({
      "GET /repos/octo/meter/commits/feedbeef/check-runs": () => ({
        json: {
          total_count: 2,
          check_runs: [
            {
              name: "integration-tests (2/2)",
              status: "in_progress",
              conclusion: null,
              started_at: "2026-10-20T03:30:48Z",
              completed_at: null,
              check_suite: { id: 106671664368 },
            },
            {
              name: "probe-tests",
              status: "completed",
              conclusion: "success",
              started_at: "2026-10-20T03:30:47Z",
              completed_at: "2026-10-20T03:31:28Z",
              check_suite: { id: 106671664368 },
            },
          ],
        },
      }),
      // A commit status starts when it was first posted, and a settled one ends at its last change.
      "GET /repos/octo/meter/commits/feedbeef/status": () => ({
        json: {
          statuses: [
            {
              context: "deploy/preview",
              state: "success",
              created_at: "2026-10-20T03:30:50Z",
              updated_at: "2026-10-20T03:32:10Z",
            },
          ],
        },
      }),
    });
    const change = { number: 23, url: null, branch: "b", headSha: "feedbeef", title: "fix: x" };
    expect((await forge.checks(change)).items).toMatchObject([
      {
        name: "integration-tests (2/2)",
        state: "pending",
        startedAt: Date.parse("2026-10-20T03:30:48Z"),
      },
      {
        name: "probe-tests",
        state: "success",
        startedAt: Date.parse("2026-10-20T03:30:47Z"),
        finishedAt: Date.parse("2026-10-20T03:31:28Z"),
      },
      {
        name: "deploy/preview",
        state: "success",
        startedAt: Date.parse("2026-10-20T03:30:50Z"),
        finishedAt: Date.parse("2026-10-20T03:32:10Z"),
      },
    ]);
  });

  // INF-1555 F25: passing checks do not turn a transient workflow-list failure into a lasting refusal.
  it.each([502, 503, 504, "timeout"] as const)(
    "keeps workflow metadata failure %s transient with passing checks",
    async (failure) => {
      let metadataStatus = typeof failure === "number" ? failure : 200;
      const { base } = await stub({
        "GET /repos/octo/meter/commits/feedbeef/check-runs": () => ({
          json: {
            check_runs: [{ name: "linux-checks", status: "completed", conclusion: "success" }],
          },
        }),
        "GET /repos/octo/meter/commits/feedbeef/status": () => ({ json: { statuses: [] } }),
        "GET /repos/octo/meter/actions/runs": () => ({
          status: metadataStatus,
          json:
            metadataStatus === 200
              ? { total_count: 0, workflow_runs: [] }
              : { message: "Temporarily unavailable" },
        }),
      });
      let timedOut = failure === "timeout";
      const forge = new GitHubForge(
        { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/r" },
        {
          token: async () => "gho_test",
          apiBaseUrl: base,
          fetch: (input, init) =>
            timedOut && String(input).includes("/actions/runs?")
              ? Promise.reject(new DOMException("The request timed out", "TimeoutError"))
              : fetch(input, init),
        },
      );
      const change = { number: 23, url: null, branch: "b", headSha: "feedbeef" };
      try {
        await expect(forge.checks(change)).rejects.toMatchObject({ failure: "transient" });
      } finally {
        timedOut = false;
      }
      metadataStatus = 200;
      expect(await forge.checks(change)).toMatchObject({
        complete: true,
        items: [{ name: "linux-checks", state: "success" }],
      });
    },
  );

  it("sets aside the cancelled duplicate and retains the later check’s run, workflow and event facts (captain F26)", async () => {
    let metadataStatus = 200;
    const { forge } = await stub({
      "GET /repos/octo/meter/commits/feedbeef/check-runs": () => ({
        json: {
          check_runs: [
            {
              name: "linux-checks",
              status: "completed",
              conclusion: "cancelled",
              check_suite: { id: 410 },
            },
            {
              name: "linux-checks",
              status: "completed",
              conclusion: "success",
              check_suite: { id: 420 },
            },
          ],
        },
      }),
      "GET /repos/octo/meter/commits/feedbeef/status": () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () =>
        metadataStatus !== 200
          ? {
              status: metadataStatus,
              json: {
                message: metadataStatus === 401 ? "Bad credentials" : "Metadata unavailable",
              },
            }
          : {
              json: {
                total_count: 2,
                workflow_runs: [
                  {
                    id: 41,
                    check_suite_id: 410,
                    workflow_id: 7,
                    event: "pull_request",
                    run_number: 41,
                    status: "completed",
                  },
                  {
                    id: 42,
                    check_suite_id: 420,
                    workflow_id: 7,
                    event: "pull_request",
                    run_number: 42,
                    status: "completed",
                  },
                ],
              },
            },
    });
    const facts = await forge.checks({ number: 23, url: null, branch: "b", headSha: "feedbeef" });
    expect(facts).toEqual({
      complete: true,
      items: [
        {
          name: "linux-checks",
          state: "success",
          status: "completed",
          conclusion: "success",
          run: 42,
          workflow: 7,
          event: "pull_request",
        },
      ],
    });
    metadataStatus = 403;
    const unread = await forge.checks({ number: 23, url: null, branch: "b", headSha: "feedbeef" });
    expect(unread).toMatchObject({
      complete: false,
      items: [{ state: "cancelled" }, { state: "success" }],
    });
    // INF-1555 F14: the lasting refusal remains a fact with its actual reason.
    expect(unread.problem).toContain("Metadata unavailable");
    expect(unread.problem).toContain("GitHub");
    metadataStatus = 503;
    await expect(
      forge.checks({ number: 23, url: null, branch: "b", headSha: "feedbeef" }),
    ).rejects.toMatchObject({ failure: "transient" });
    metadataStatus = 401;
    await expect(
      forge.checks({ number: 23, url: null, branch: "b", headSha: "feedbeef" }),
    ).rejects.toMatchObject({ failure: "sign-in" });
  });

  it("keeps the same-workflow/event boundaries of a later run's decision (captain F26, FI3-585, INF-4584)", async () => {
    type Run = { id: number; workflow: number; event: string; status: string };
    type Check = { name: string; status: string; conclusion: string | null; suite?: number };
    let workflowRuns: Run[] = [];
    let checks: Check[] = [];
    let runsAnswer: { status: number; json: unknown } | undefined;
    const { forge, seen } = await stub({
      "GET /repos/octo/meter/commits/feedbeef/check-runs": () => ({
        json: {
          check_runs: checks.map(({ suite, ...run }) =>
            suite === undefined ? run : { ...run, check_suite: { id: suite } },
          ),
        },
      }),
      "GET /repos/octo/meter/commits/feedbeef/status": () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () =>
        runsAnswer ?? {
          json: {
            total_count: workflowRuns.length,
            workflow_runs: workflowRuns.map((run) => ({
              id: run.id,
              check_suite_id: run.id * 10,
              workflow_id: run.workflow,
              event: run.event,
              run_number: run.id,
              status: run.status,
              head_sha: "feedbeef",
            })),
          },
        },
    });
    const change = { number: 23, url: null, branch: "b", headSha: "feedbeef" };
    // Observe the filtered facts through the same summary the app uses, not a returned verdict.
    const read = async () => {
      const facts = await forge.checks(change);
      return {
        ...facts,
        overall: checkSnapshotSummary({
          headSha: change.headSha,
          items: facts.items,
          complete: facts.complete,
          problem: facts.problem,
          absenceDeclared: false,
        }).overall,
      };
    };
    const ci = (id: number, status = "completed"): Run => ({
      id,
      workflow: 7,
      event: "pull_request",
      status,
    });
    const check = (suite: number, conclusion: string | null, status = "completed"): Check => ({
      name: "linux-checks",
      status,
      conclusion,
      suite: suite * 10,
    });
    const actionsReads = () =>
      seen.filter((request) => request.url.startsWith("/repos/octo/meter/actions/runs")).length;

    // Read the workflow list once even without a cancellation: waiting jobs
    // may not have created checks yet.
    workflowRuns = [ci(41)];
    checks = [check(41, "success")];
    expect((await read()).overall).toBe("green");
    expect(actionsReads()).toBe(1);

    // PR #632's version: one push started two runs of ci, the second
    // cancelled the first before it began, and the second passed.
    workflowRuns = [ci(42), ci(41)];
    checks = [check(41, "cancelled"), check(42, "success")];
    expect(await read()).toMatchObject({
      overall: "green",
      items: [{ name: "linux-checks", state: "success" }],
    });
    expect(seen.at(-1)?.url).toBe("/repos/octo/meter/actions/runs?head_sha=feedbeef&per_page=100");

    // The later run's own check decides, whatever it reads.
    checks = [check(41, "cancelled"), check(42, null, "in_progress")];
    expect((await read()).overall).toBe("pending");
    checks = [check(41, "cancelled"), check(42, "failure")];
    expect((await read()).overall).toBe("red");

    // A later run that has not created the check yet: pending, never green.
    workflowRuns = [ci(42, "queued"), ci(41)];
    checks = [check(41, "cancelled"), { name: "lint", status: "completed", conclusion: "success" }];
    expect(await read()).toMatchObject({
      overall: "pending",
      items: [
        { name: "linux-checks", state: "pending" },
        { name: "lint", state: "success" },
        { name: "workflow (run 42)", state: "pending" },
      ],
    });
    // Finished without it, the cancellation still counts.
    workflowRuns = [ci(42), ci(41)];
    expect((await read()).overall).toBe("red");

    // The latest run's cancellation or failure counts, whatever passed before it.
    for (const latest of ["cancelled", "failure"]) {
      checks = [check(41, "success"), check(42, latest)];
      expect((await read()).overall).toBe("red");
    }
    // Another workflow or another event is not the same check, even under one name.
    for (const later of [
      { ...ci(42), workflow: 8 },
      { ...ci(42), event: "push" },
    ]) {
      workflowRuns = [later, ci(41)];
      for (const earlier of ["cancelled", "failure"]) {
        checks = [check(41, earlier), check(42, "success")];
        expect((await read()).overall).toBe("red");
      }
    }
    // A check the app cannot place in a workflow run counts as it reads.
    workflowRuns = [ci(42), ci(41)];
    checks = [{ ...check(41, "cancelled"), suite: undefined }, check(42, "success")];
    expect((await read()).overall).toBe("red");

    // A side read GitHub refuses leaves every check counted; a hiccup or a
    // refused sign-in fails the reading instead of guessing.
    checks = [check(41, "cancelled"), check(42, "success")];
    runsAnswer = { status: 403, json: { message: "Resource not accessible" } };
    expect((await read()).overall).toBe("red");
    runsAnswer = { status: 503, json: { message: "unavailable" } };
    await expect(read()).rejects.toMatchObject({ failure: "transient" });
    runsAnswer = { status: 401, json: { message: "Bad credentials" } };
    await expect(read()).rejects.toMatchObject({ failure: "sign-in" });
  });

  it("lets a newer request of the same workflow decide the check an older failed request left (INF-4584)", async () => {
    // The reading of a pushed branch with no pull request when its merge was
    // refused: a journeys request that named the wrong comparison failed
    // before any test ran, and a newer request of the same journeys passed
    // at the same version.
    const head = "a2c2d6a4f776cbc16f1474840b861c3320744a86";
    const workflowRuns = [
      [43985011182, "journeys", 2662, 386227719, "workflow_dispatch", 119073534410],
      [43983054190, "journeys", 2658, 386227719, "workflow_dispatch", 119068384997],
      [43981548975, "ci", 4854, 386227718, "push", 119064493166],
    ].map(([id, name, run_number, workflow_id, event, check_suite_id]) => ({
      id,
      name,
      run_number,
      workflow_id,
      event,
      check_suite_id,
      status: "completed",
      head_sha: head,
    }));
    const [newer, older, ci] = workflowRuns.map((run) => run.check_suite_id);
    const linux =
      "Manual request · Selected journeys (Linux; part 1/1) / Manual request · Selected app journeys (Linux; parallel; part 1/1)";
    const mac = "Manual request · Selected app journeys (Mac)";
    const replace = "Manual request · Replace an older request of the same journeys";
    const choose = "Manual request · Choose and place app journeys";
    const branchCheck = "Branch push · Code, build, affected tests and critical path (Linux)";
    const integration =
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub names a matrix job it skipped before expanding it this way.
      "Manual request · Integration tests (Linux; group ${{ matrix.shard }}/${{ strategy.job-total }})";
    // Each check as GitHub listed it: its run's suite, name, conclusion, start and finish.
    const checkRuns = [
      [older, mac, "skipped", "2026-11-16T23:54:20Z", "2026-11-16T23:54:20Z"],
      [older, linux, "failure", "2026-11-17T00:03:46Z", "2026-11-17T00:06:11Z"],
      [older, replace, "success", "2026-11-16T23:53:20Z", "2026-11-16T23:53:28Z"],
      [older, choose, "success", "2026-11-16T23:53:20Z", "2026-11-16T23:54:20Z"],
      [newer, linux, "success", "2026-11-17T00:12:13Z", "2026-11-17T00:18:55Z"],
      [newer, mac, "success", "2026-11-17T00:08:50Z", "2026-11-17T00:11:54Z"],
      [newer, replace, "success", "2026-11-17T00:08:20Z", "2026-11-17T00:08:31Z"],
      [newer, choose, "success", "2026-11-17T00:07:28Z", "2026-11-17T00:08:28Z"],
      [ci, "Manual request · Environment checks (Linux)", "skipped", "2026-11-16T23:42:12Z"],
      [ci, integration, "skipped", "2026-11-16T23:42:12Z", "2026-11-16T23:42:12Z"],
      [ci, "Manual request · Unit tests (Linux)", "skipped", "2026-11-16T23:42:12Z"],
      [ci, branchCheck, "success", "2026-11-16T23:43:00Z", "2026-11-16T23:52:50Z"],
    ].map(([suite, name, conclusion, started_at, completed_at = started_at]) => ({
      name,
      status: "completed",
      conclusion,
      started_at,
      completed_at,
      check_suite: { id: suite },
    }));
    const { forge } = await stub({
      [`GET /repos/octo/meter/commits/${head}/check-runs`]: () => ({
        json: { total_count: checkRuns.length, check_runs: checkRuns },
      }),
      [`GET /repos/octo/meter/commits/${head}/status`]: () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () => ({
        json: { total_count: workflowRuns.length, workflow_runs: workflowRuns },
      }),
    });
    const branch = "inf/card-option-words-flow-2be5";
    const facts = await forge.checks({ url: null, branch, headSha: head });
    // What the merge boundary reads: the newer request decided every check
    // the older one left, so the version's checks passed.
    expect(checkSnapshotSummary({ headSha: head, ...facts, absenceDeclared: false })).toMatchObject(
      { overall: "green", words: "5 passed · 3 skipped" },
    );
    expect(facts.items.filter((item) => item.run === 43983054190)).toEqual([]);
    expect(facts.items.find((item) => item.name === linux)).toMatchObject({
      state: "success",
      run: 43985011182,
    });
  });

  it("sends the saved plain summary on both merge routes, not the rendered story (INF-228 F2)", async () => {
    const { forge, seen } = await stub({
      "PUT /repos/octo/meter/pulls/23/merge-async": () => ({
        json: { status: "merged", details: { sha: PULL.head.sha } },
      }),
    });
    const squashMessage = presentationCommitMessage(
      {
        whatChanged: ["Keep upload_receipts on restart."],
        projectText: "BREAKING CHANGE: update the work computer.",
      },
      BUNDLED_NAMING,
    );
    const change = {
      number: PULL.number,
      url: PULL.html_url,
      branch: PULL.head.ref,
      headSha: PULL.head.sha,
      title: PULL.title,
      body: "<!-- infinitary-story:sample:start -->\n## What changed\nKeep upload\\_receipts on restart\\.\n### Risk\n| Dimension | Level | Why |",
      squashMessage,
    };
    await forge.putIn(change, change.headSha, "squash");
    await forge.putInSkippingRules(change, change.headSha);
    expect(seen).toHaveLength(2);
    for (const request of seen)
      expect(request.body).toMatchObject({
        commit_message: squashMessage,
        commit_title: PULL.title,
        sha: PULL.head.sha,
      });
  });

  it.each([422, 503])(
    "keeps GitHub's write explanation and the certainty split for %s (INF-228 F4)",
    async (status) => {
      const message = status === 422 ? "Validation Failed" : "Service unavailable";
      const detail = "A pull request already exists for octo:fm/task-1.";
      const { forge } = await stub({
        "POST /repos/octo/meter/pulls": () => ({
          status,
          json: { message, errors: [{ message: detail }] },
        }),
        "GET /repos/octo/meter": () => ({ json: { default_branch: "main" } }),
        "GET /repos/octo/meter/pulls/23": () => ({ json: { ...PULL, state: "open" } }),
        "PATCH /repos/octo/meter/pulls/23": () => ({
          status,
          json: { message, errors: [{ message: detail }] },
        }),
      });
      for (const write of [
        () => forge.openChange({ branch: PULL.head.ref, title: PULL.title, body: PULL.body }),
        () =>
          forge.updateChangeBody(
            {
              number: PULL.number,
              url: PULL.html_url,
              branch: PULL.head.ref,
              headSha: PULL.head.sha,
              title: PULL.title,
              body: PULL.body,
            },
            "Revised story",
          ),
      ]) {
        const error = await write().catch((caught: unknown) => caught);
        expect(error).toMatchObject({ outcome: status === 422 ? "failed" : "uncertain" });
        expect((error as Error).message).toContain(message);
        expect((error as Error).message).toContain(detail);
      }
    },
  );

  it("INF-717: sends a saved story's title in its description's write, only while the title reads as read", async () => {
    let title = PULL.title;
    const { forge, seen } = await stub({
      "GET /repos/octo/meter/pulls/23": () => ({ json: { ...PULL, title, state: "open" } }),
      "PATCH /repos/octo/meter/pulls/23": () => ({ json: { ...PULL, state: "open" } }),
    });
    const change = {
      number: PULL.number,
      url: PULL.html_url,
      branch: PULL.head.ref,
      headSha: PULL.head.sha,
      title: PULL.title,
      body: PULL.body,
    };
    await forge.updateChangeBody(change, "Revised story", "fix!: correct meter");
    await forge.updateChangeBody(change, "Revised story");
    // Someone renamed it after the read: no write goes.
    title = "fix: correct the meter's lag";
    await expect(
      forge.updateChangeBody(change, "Revised story", "fix!: correct meter"),
    ).rejects.toMatchObject({ outcome: "failed" });
    expect(seen.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([
      { title: "fix!: correct meter", body: "Revised story" },
      { body: "Revised story" },
    ]);
  });

  it("puts the change in only at the checked head, and closes one without putting it in", async () => {
    const { forge, seen } = await stub({
      "PUT /repos/octo/meter/pulls/23/merge-async": () => ({
        json: { status: "merged", details: { sha: "squash01" } },
      }),
      "PATCH /repos/octo/meter/pulls/23": () => ({ json: { state: "closed" } }),
    });
    const change = {
      number: 23,
      url: null,
      branch: "b",
      headSha: "feedbeef",
      title: "fix: correct meter",
      body: "Why",
    };
    await forge.putIn(change, "feedbeef", "squash");
    await expect(
      forge.putIn({ ...change, title: "Plain change" }, "feedbeef", "squash"),
    ).rejects.toThrow(/does not follow the naming runbook/);
    await forge.close(change);
    expect(seen.map((request) => [request.method, request.url, request.body])).toEqual([
      [
        "PUT",
        "/repos/octo/meter/pulls/23/merge-async",
        {
          sha: "feedbeef",
          merge_method: "squash",
          commit_title: "fix: correct meter",
          commit_message: "Why",
        },
      ],
      ["PATCH", "/repos/octo/meter/pulls/23", { state: "closed" }],
    ]);
  });

  it("reads every page of the checks, and never reads a suite it could not finish as green (FI3-304)", async () => {
    const runsPage = (page: number, count: number, conclusion = "success") =>
      Array.from({ length: count }, (_, i) => ({
        name: `job-${page}-${i}`,
        status: "completed",
        conclusion,
      }));
    let total = 130;
    let lastConclusion = "success";
    const { forge, seen } = await stub({
      "GET /repos/octo/meter/commits/feedbeef/check-runs": (request) => {
        const page = Number(new URL(request.url, "http://stub").searchParams.get("page"));
        const remaining = Math.max(0, total - (page - 1) * 100);
        return {
          json: {
            total_count: total,
            check_runs: runsPage(
              page,
              Math.min(100, remaining),
              page === 2 ? lastConclusion : "success",
            ),
          },
        };
      },
      "GET /repos/octo/meter/commits/feedbeef/status": () => ({
        json: { total_count: 1, statuses: [{ context: "deploy", state: "success" }] },
      }),
    });
    const change = { number: 23, url: null, branch: "b", headSha: "feedbeef" };
    const read = await forge.checks(change);
    expect(read.items).toHaveLength(131);
    expect(read.items[0]?.state).toBe("success");
    expect(
      seen.filter((request) => request.url.includes("/check-runs")).map((request) => request.url),
    ).toEqual([
      "/repos/octo/meter/commits/feedbeef/check-runs?per_page=100&page=1",
      "/repos/octo/meter/commits/feedbeef/check-runs?per_page=100&page=2",
    ]);
    // A failure on the second page is a failure of the suite.
    lastConclusion = "failure";
    expect((await forge.checks(change)).items.find((item) => item.name === "job-2-0")?.state).toBe(
      "failure",
    );
    // More checks than the pages the app reads: one pending item stands for the rest.
    lastConclusion = "success";
    total = 1_500;
    const past = await forge.checks(change);
    expect(past.complete).toBe(false);
    expect(past.items.every((item) => item.state === "success")).toBe(true);
  });

  // INF-7061: the crew pushes its update to a contributor's branch only when
  // GitHub says the author allows maintainer edits.
  it("reads whether a contributor allows the project's maintainers to push to its branch", async () => {
    let pull: Record<string, unknown> = {};
    const { forge } = await stub({
      "GET /repos/octo/meter/pulls/23": () => ({
        json: { ...PULL, state: "open", base: { ref: "main" }, ...pull },
      }),
    });
    pull = { maintainer_can_modify: true };
    expect((await forge.pull(23)).maintainerCanModify).toBe(true);
    pull = { maintainer_can_modify: false };
    expect(await forge.pull(23)).not.toHaveProperty("maintainerCanModify");
  });

  it("reads a pull request by its number with whether it may merge now, in the seam's terms", async () => {
    let pull: Record<string, unknown> = {};
    const { forge } = await stub({
      "GET /repos/octo/meter/pulls/23": () => ({
        json: { ...PULL, state: "open", base: { ref: "main" }, ...pull },
      }),
    });
    const readiness = async (fields: Record<string, unknown>) => {
      pull = fields;
      return (await forge.pull(23)).readiness;
    };
    expect(await readiness({ mergeable: true, mergeable_state: "clean" })).toBe("clean");
    expect(await readiness({ mergeable: true, mergeable_state: "unstable" })).toBe("clean");
    expect(await readiness({ mergeable: false, mergeable_state: "dirty" })).toBe("conflict");
    expect(await readiness({ mergeable: true, mergeable_state: "behind" })).toBe("behind");
    // Branch rules - a required review among them - hold it, whoever is signed in.
    expect(await readiness({ mergeable: true, mergeable_state: "blocked" })).toBe("blocked");
    expect(await readiness({ mergeable: null, mergeable_state: "unknown" })).toBe("computing");
    expect(await readiness({ mergeable: true, mergeable_state: "clean", draft: true })).toBe(
      "draft",
    );
    expect(await readiness({ mergeable: true, mergeable_state: "something-new" })).toBe(
      "computing",
    );
    pull = { state: "closed", merged: true, merge_commit_sha: "squash01" };
    // Contributor review retains the host's page instead of losing the fork's link.
    expect(await forge.pull(23)).toEqual({
      url: PULL.html_url,
      mergeable: null,
      number: 23,
      state: "closed",
      merged: true,
      mergedSha: "squash01",
      headSha: "feedbeef",
      base: "main",
      branch: "fm/task-1",
      title: "fix: correct meter",
      readiness: "computing",
    });
  });

  it("opens a change onto the branch open_change names without reading the default branch, and reads a pull request's base (INF-1873)", async () => {
    const { forge, seen } = await stub({
      "POST /repos/octo/meter/pulls": () => ({
        status: 201,
        json: { ...PULL, base: { ref: "fm/task-lower" } },
      }),
      "GET /repos/octo/meter/pulls": () => ({ json: [{ ...PULL, base: { ref: "main" } }] }),
    });
    const opened = await forge.openChange({
      branch: "fm/task-1",
      title: "Fix",
      body: "Why",
      base: "fm/task-lower",
    });
    expect(opened.base).toBe("fm/task-lower");
    expect(seen.map((request) => `${request.method} ${request.url.split("?")[0]}`)).toEqual([
      "POST /repos/octo/meter/pulls",
    ]);
    expect(seen[0]?.body).toMatchObject({ head: "fm/task-1", base: "fm/task-lower" });
    // Each later reading carries the base the host holds now, retargeted or not.
    expect((await forge.changeFor("fm/task-1"))?.base).toBe("main");
  });

  it("opens a change onto the default branch and lists the person's projects, newest first", async () => {
    const { forge, seen } = await stub({
      "GET /repos/octo/meter": () => ({ json: { default_branch: "trunk" } }),
      "POST /repos/octo/meter/pulls": () => ({ status: 201, json: PULL }),
      "GET /user/repos": () => ({
        json: [
          {
            full_name: "octo/meter",
            clone_url: "https://github.com/octo/meter.git",
            html_url: "https://github.com/octo/meter",
            updated_at: "2026-09-24T10:00:00Z",
            private: true,
          },
        ],
      }),
    });
    const opened = await forge.openChange({ branch: "fm/task-1", title: "Fix", body: "Why" });
    expect(opened.number).toBe(23);
    expect(seen[1]?.body).toEqual({ title: "Fix", head: "fm/task-1", base: "trunk", body: "Why" });
    expect(await forge.listProjects()).toEqual([
      {
        fullName: "octo/meter",
        cloneUrl: "https://github.com/octo/meter.git",
        url: "https://github.com/octo/meter",
        updatedAt: "2026-09-24T10:00:00Z",
        private: true,
      },
    ]);
    expect(seen[2]?.url).toBe(
      "/user/repos?sort=updated&per_page=100&page=1&affiliation=owner,collaborator,organization_member",
    );
  });

  it("lists every page of the sign-in's repos, newest first, and finds one exact repo", async () => {
    const repo = (n: number) => ({
      full_name: `octo/r${n}`,
      clone_url: `https://github.com/octo/r${n}.git`,
    });
    const { seen, forge } = await stub({
      "GET /user/repos": (request) => {
        const page = Number(new URL(request.url, "http://x").searchParams.get("page"));
        const count = page < 3 ? 100 : 4;
        return { json: Array.from({ length: count }, (_, i) => repo(page * 1000 + i)) };
      },
      "GET /repos/acme/lab": () => ({
        json: {
          full_name: "Acme/lab",
          clone_url: "https://github.com/Acme/lab.git",
          private: true,
        },
      }),
    });
    const listed = await forge.listProjectsPaged();
    expect(listed.projects).toHaveLength(204);
    expect(listed.complete).toBe(true);
    expect(
      seen.map((request) => new URL(request.url, "http://x").searchParams.get("page")),
    ).toEqual(["1", "2", "3"]);
    expect(await forge.findProject("acme/lab")).toMatchObject({
      fullName: "Acme/lab",
      private: true,
    });
    expect(await forge.findProject("acme/missing")).toBeNull();
    expect(await forge.findProject("not-a-name")).toBeNull();
  });

  it("stops at 1,000 repos and says the list was not complete", async () => {
    const { forge } = await stub({
      "GET /user/repos": () => ({
        json: Array.from({ length: 100 }, (_, i) => ({
          full_name: `octo/r${i}`,
          clone_url: "https://github.com/octo/r.git",
        })),
      }),
    });
    const listed = await forge.listProjectsPaged();
    expect(listed.projects).toHaveLength(1000);
    expect(listed.complete).toBe(false);
  });

  it("types every refusal: 401 the sign-in, 403 permission, 5xx transient, and a stale head refused", async () => {
    const status = { code: 401, headers: {} as Record<string, string> };
    const { forge } = await stub({
      "GET /repos/octo/meter/pulls": () => ({
        status: status.code,
        json: { message: "said no" },
        headers: status.headers,
      }),
      // Asked after this stand-in's 404 to the background merge it does not know.
      "PUT /repos/octo/meter/pulls/23/merge": () => ({
        status: 409,
        json: { message: "Head branch was modified. Review and try the merge again." },
      }),
    });
    const failure = () => forge.changeFor("b").catch((caught: unknown) => caught);
    expect(await failure()).toMatchObject({ failure: "sign-in" });
    status.code = 403;
    expect(await failure()).toMatchObject({ failure: "permission" });
    status.headers = { "x-ratelimit-remaining": "0" };
    expect(await failure()).toMatchObject({
      failure: "permission",
      message: expect.stringContaining("the hourly allowance is spent"),
    });
    for (const code of [500, 502, 503, 504]) {
      status.code = code;
      expect(await failure()).toMatchObject({ failure: "transient" });
    }
    await expect(
      forge.putIn(
        { number: 23, url: null, branch: "b", headSha: "old", title: "fix: correct meter" },
        "old",
        "squash",
      ),
    ).rejects.toMatchObject({
      failure: "refused",
      message: expect.stringContaining("Head branch was modified"),
    });
  });

  it("is transient when GitHub cannot be reached, and asks nothing without a sign-in", async () => {
    const unreachable = new GitHubForge(
      { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/r" },
      { token: async () => "gho_test", apiBaseUrl: "http://127.0.0.1:9" },
    );
    await expect(unreachable.changeFor("b")).rejects.toMatchObject({ failure: "transient" });

    const { seen, base } = await stub({});
    const signedOut = new GitHubForge(
      { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/r" },
      { token: async () => undefined, apiBaseUrl: base },
    );
    await expect(signedOut.changeFor("b")).rejects.toMatchObject({
      failure: "sign-in",
      message: "Not signed in to GitHub (github.com)",
    });
    expect(seen).toEqual([]);
  });
});

describe("the app's own sign-in on a request", () => {
  it("asks the sign-in service to look again when GitHub refuses the sign-in, and only then", async () => {
    const status = { code: 401 };
    const { base } = await stub({
      "GET /repos/octo/meter/pulls": () => ({ status: status.code, json: [] }),
    });
    let rejected = 0;
    const forge = new GitHubForge(
      { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/r" },
      { token: async () => "gho_test", apiBaseUrl: base, onSignInRejected: () => rejected++ },
    );
    await expect(forge.changeFor("b")).rejects.toMatchObject({ failure: "sign-in" });
    expect(rejected).toBe(1);
    status.code = 403;
    await expect(forge.changeFor("b")).rejects.toMatchObject({ failure: "permission" });
    status.code = 200;
    await expect(forge.changeFor("b")).resolves.toBeNull();
    expect(rejected).toBe(1);
  });
});

describe("readOpenChanges (the forge.changes read)", () => {
  it("reads the person's open changes and their checks in one request", async () => {
    const node = (number: number, state: string | null, draft = false) => ({
      number,
      title: `Change ${number}`,
      url: `https://github.com/octo/meter/pull/${number}`,
      isDraft: draft,
      updatedAt: "2026-09-24T00:00:00Z",
      repository: { nameWithOwner: "octo/meter" },
      commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] },
    });
    const { seen, base } = await stub({
      "POST /graphql": () => ({
        json: {
          data: {
            viewer: {
              pullRequests: {
                nodes: [
                  node(3, "SUCCESS"),
                  node(2, "FAILURE", true),
                  node(1, "PENDING"),
                  node(0, null),
                ],
              },
            },
          },
        },
      }),
    });
    const rows = await readOpenChanges({ host: "github.com", token: "gho_test", apiBaseUrl: base });
    expect(rows.map((row) => [row.number, row.checks, row.draft])).toEqual([
      [3, "passed", false],
      [2, "failed", true],
      [1, "pending", false],
      [0, "none", false],
    ]);
    expect(rows[0]).toMatchObject({ host: "github.com", project: "octo/meter" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.authorization).toBe("Bearer gho_test");
  });

  it("types a refused sign-in like every other GitHub request", async () => {
    const { base } = await stub({ "POST /graphql": () => ({ status: 401, json: {} }) });
    await expect(
      readOpenChanges({ host: "github.com", token: "gho_test", apiBaseUrl: base }),
    ).rejects.toMatchObject({ failure: "sign-in" });
  });
});

/**
 * GitHub on the person's own server (`docs/forge.md`, "Hosts on your own
 * server"): the same forge, at the host's own API, under its own path.
 */
describe("a GitHub Enterprise host", () => {
  it("is asked at its own API: api.<name>.ghe.com, or the server's /api/v3 and /api/graphql", () => {
    const options = { packaged: true, env: {} };
    expect(githubApiBaseFor("github.com", options)).toBe(GITHUB_API_URL);
    expect(githubApiBaseFor("octo.ghe.com", options)).toBe("https://api.octo.ghe.com");
    expect(githubApiBaseFor("github.corp.example", options)).toBe(
      "https://github.corp.example/api/v3",
    );
    expect(githubGraphqlUrl("https://github.corp.example/api/v3")).toBe(
      "https://github.corp.example/api/graphql",
    );
    expect(githubGraphqlUrl("https://api.octo.ghe.com")).toBe("https://api.octo.ghe.com/graphql");
    expect(githubGraphqlUrl(GITHUB_API_URL)).toBe(`${GITHUB_API_URL}/graphql`);
    // The stand-in override reaches every enterprise host, and only off a packaged app.
    const env = { INFINITARY_GITHUB_ENTERPRISE_API_URL: "http://127.0.0.1:7777/api/v3/" };
    expect(githubApiBaseFor("github.corp.example", { packaged: false, env })).toBe(
      "http://127.0.0.1:7777/api/v3",
    );
    expect(githubUploadOrigin("github.com")).toBe("https://uploads.github.com");
    expect(githubUploadOrigin("octo.ghe.com")).toBe("https://uploads.octo.ghe.com");
    expect(githubUploadOrigin("github.corp.example")).toBe(
      "https://github.corp.example/api/uploads",
    );
    expect(githubApiBaseFor("github.corp.example", { packaged: true, env })).toBe(
      "https://github.corp.example/api/v3",
    );
    expect(githubApiBaseFor("github.com", { packaged: false, env })).toBe(GITHUB_API_URL);
  });

  it("opens a pull request under the server's /api/v3 and names the host where it is not signed in", async () => {
    const { seen, base } = await stub({
      "GET /api/v3/repos/acme/meter": () => ({ json: { default_branch: "main" } }),
      "POST /api/v3/repos/acme/meter/pulls": () => ({
        status: 201,
        json: { ...PULL, html_url: "https://github.corp.example/acme/meter/pull/7" },
      }),
    });
    const location = {
      kind: "github" as const,
      host: "github.corp.example",
      owner: "acme",
      name: "meter",
      dir: "/r",
    };
    const forge = new GitHubForge(location, {
      token: async () => "ghp_enterprise",
      apiBaseUrl: `${base}/api/v3`,
    });
    expect(forge.place).toBe("github.corp.example");
    const change = await forge.openChange({ branch: "fm/x", title: "feat: x", body: "" });
    expect(change.url).toBe("https://github.corp.example/acme/meter/pull/7");
    expect(seen.map((entry) => `${entry.method} ${entry.url}`)).toEqual([
      "GET /api/v3/repos/acme/meter",
      "POST /api/v3/repos/acme/meter/pulls",
    ]);
    expect(seen[1]?.headers.authorization).toBe("Bearer ghp_enterprise");
    const signedOut = new GitHubForge(location, {
      token: async () => undefined,
      apiBaseUrl: `${base}/api/v3`,
    });
    await expect(signedOut.defaultBranch()).rejects.toMatchObject({
      failure: "sign-in",
      message: "Not signed in to github.corp.example",
    });
  });
});

describe("githubApiBaseUrl", () => {
  it("honours the dev override only in an unpackaged app", () => {
    const env = { INFINITARY_GITHUB_API_URL: "http://127.0.0.1:7777/" };
    expect(githubApiBaseUrl({ packaged: false, env })).toBe("http://127.0.0.1:7777");
    expect(githubApiBaseUrl({ packaged: true, env })).toBe(GITHUB_API_URL);
    expect(githubApiBaseUrl({ packaged: false, env: {} })).toBe(GITHUB_API_URL);
  });

  it("reads the override under the older FM3000_ name too; Infinitary's wins", () => {
    const older = { FM3000_GITHUB_API_URL: "http://127.0.0.1:7777/" };
    expect(githubApiBaseUrl({ packaged: false, env: older })).toBe("http://127.0.0.1:7777");
    const env = { ...older, INFINITARY_GITHUB_API_URL: "http://127.0.0.1:8888/" };
    expect(githubApiBaseUrl({ packaged: false, env })).toBe("http://127.0.0.1:8888");
    expect(githubApiBaseUrl({ packaged: true, env })).toBe(GITHUB_API_URL);
  });
});

describe("a release file's upload address (INF-205)", () => {
  const forge = new GitHubForge(
    { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/unused" },
    { token: async () => "gho_test" },
  );

  it("accepts the release's upload address only on GitHub's upload origin", () => {
    const placed = forge.api.releaseUpload?.(
      "https://uploads.github.com/repos/octo/meter/releases/9/assets?name=App.dmg",
      "app.dmg",
    );
    expect(placed).toMatchObject({
      own: true,
      path: "/repos/octo/meter/releases/9/assets?name=App.dmg",
    });
    const named = forge.api.releaseUpload?.("/repos/octo/meter/releases/9/assets", "app.dmg");
    expect(named?.path).toBe("/repos/octo/meter/releases/9/assets?name=app.dmg");
    expect(() =>
      forge.api.releaseUpload?.(
        "https://uploads.github.com/repos/octo/meter/releases/9/assets{?name,label}",
        "app.dmg",
      ),
    ).toThrow("Replace {?name,label}");
    expect(() =>
      forge.api.releaseUpload?.(
        "https://evil.example/repos/octo/meter/releases/9/assets?name=app.dmg",
        "app.dmg",
      ),
    ).toThrow("accepted only on GitHub's upload address");
    expect(() => forge.api.releaseUpload?.("/repos/octo/meter/issues", "app.dmg")).toThrow(
      "not this path",
    );
  });

  it("accepts a GitHub Enterprise Server upload address only under /api/uploads", () => {
    const server = new GitHubForge(
      {
        kind: "github",
        host: "github.corp.example",
        owner: "acme",
        name: "meter",
        dir: "/unused",
      },
      { token: async () => "gho_test", apiBaseUrl: "https://github.corp.example/api/v3" },
    );
    expect(
      server.api.releaseUpload?.(
        "https://github.corp.example/api/uploads/repos/acme/meter/releases/9/assets?name=app.dmg",
        "app.dmg",
      ),
    ).toMatchObject({
      own: true,
      path: "/repos/acme/meter/releases/9/assets?name=app.dmg",
    });
    expect(() =>
      server.api.releaseUpload?.(
        "https://github.corp.example/repos/acme/meter/releases/9/assets?name=app.dmg",
        "app.dmg",
      ),
    ).toThrow("accepted only on GitHub's upload address");
  });

  // INF-290 F5: an evidence upload's 401 is a sign-in only when GitHub refuses the key itself.
  it.each([
    [true, "permission", 0],
    [false, "sign-in", 1],
  ] as const)(
    "reads an evidence upload's 401 with GitHub still answering for the key: %s",
    async (keyAccepted, failure, asked) => {
      const rejected = vi.fn();
      const fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const json = (value: unknown, status = 200) =>
          new Response(JSON.stringify(value), {
            status,
            headers: { "content-type": "application/json" },
          });
        if (url.pathname === "/user")
          return keyAccepted ? json({ login: "octo" }) : json({ message: "Bad credentials" }, 401);
        if (url.pathname === "/user-attachments/assets")
          return json({ message: "Bad credentials" }, 401);
        return json({
          id: 1422452335,
          full_name: "octo/meter",
          private: false,
          visibility: "public",
          permissions: { push: true },
        });
      }) as typeof globalThis.fetch;
      const forge = new GitHubForge(
        { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/unused" },
        {
          token: async () => "gho_test",
          apiBaseUrl: "https://api.github.com",
          fetch,
          onSignInRejected: rejected,
        },
      );
      const attachments = forge.attachments;
      if (!attachments) throw new Error("github.com offers native attachments");
      const bytes = new Uint8Array([137, 80, 78, 71]);
      await expect(
        attachments.upload(await attachments.destination(), {
          bytes,
          mediaType: "image/png",
          sha256: createHash("sha256").update(bytes).digest("hex"),
        }),
      ).rejects.toMatchObject({ outcome: "failed", failure });
      expect(rejected).toHaveBeenCalledTimes(asked);
    },
  );

  it("sends the bytes to the production upload address, including GitHub Enterprise Server", async () => {
    const sent: string[] = [];
    const fetch = (async (input: RequestInfo | URL) => {
      sent.push(String(input));
      return new Response("{}", { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;
    const file = {
      stream: Readable.from(["bytes"]),
      size: 5,
      contentType: "application/octet-stream",
      filename: "app.dmg",
    };
    const github = new GitHubForge(
      { kind: "github", host: "github.com", owner: "octo", name: "meter", dir: "/unused" },
      { token: async () => "gho_test", apiBaseUrl: "https://api.github.com", fetch },
    );
    const githubRoute = github.api.releaseUpload?.(
      "/repos/octo/meter/releases/9/assets",
      "app.dmg",
    );
    if (!githubRoute || !github.api.upload) throw new Error("upload is missing");
    await github.api.upload(githubRoute, file);
    const server = new GitHubForge(
      {
        kind: "github",
        host: "github.corp.example",
        owner: "acme",
        name: "meter",
        dir: "/unused",
      },
      {
        token: async () => "gho_test",
        apiBaseUrl: "https://github.corp.example/api/v3",
        fetch,
      },
    );
    const serverRoute = server.api.releaseUpload?.(
      "https://github.corp.example/api/uploads/repos/acme/meter/releases/9/assets?name=app.dmg",
      "app.dmg",
    );
    if (!serverRoute || !server.api.upload) throw new Error("upload is missing");
    await server.api.upload(serverRoute, { ...file, stream: Readable.from(["bytes"]) });
    expect(sent).toEqual([
      "https://uploads.github.com/repos/octo/meter/releases/9/assets?name=app.dmg",
      "https://github.corp.example/api/uploads/repos/acme/meter/releases/9/assets?name=app.dmg",
    ]);
  });
});

// INF-1184: a repair declared at a version GitHub holds no commit for is
// refused, and one saved there closes void, so only GitHub's 404 for that
// exact commit in a repository the sign-in reads says no.
describe("whether GitHub holds a repair's version", () => {
  const HELD = "a75f9eb4d0f888d5a7fee139a342cbb35a86af3b";
  const MISSING = "a75f9eb4d0f888d5a7fee139a342cbb35a86af3c";

  it("answers from the Git database's read of that exact commit", async () => {
    const { forge, seen } = await stub({
      [`GET /repos/octo/meter/git/commits/${HELD}`]: () => ({ json: { sha: HELD, parents: [] } }),
      "GET /repos/octo/meter": () => ({
        json: { full_name: "octo/meter", default_branch: "main" },
      }),
    });
    expect(await forge.holdsCommit(HELD)).toBe(true);
    expect(await forge.holdsCommit(MISSING)).toBe(false);
    // GitHub's commit reads resolve a longer id by its first 40 characters;
    // a longer or shorter id names no commit, without asking.
    const asked = seen.length;
    expect(await forge.holdsCommit(`${HELD}0761`)).toBe(false);
    expect(await forge.holdsCommit(HELD.slice(0, 7))).toBe(false);
    expect(seen.length).toBe(asked);
  });

  it("says nothing when the sign-in cannot see the repository", async () => {
    const { forge } = await stub({});
    await expect(forge.holdsCommit(MISSING)).rejects.toMatchObject({ failure: "not-found" });
  });
});

// Intent: INF-4196's approved plan - a batched change has no pull request of its own, so its
// merge card links "its changes on GitHub", the branch's compare page against the default
// branch, on github.com and on a team's own server alike; a contributor's fork has none.
describe("a pushed branch's page", () => {
  it("is the compare page from the default branch GitHub names, on GitHub and a team's own server", async () => {
    const { base } = await stub({
      "GET /repos/acme/meter": () => ({ json: { default_branch: "trunk" } }),
    });
    const at = (host: string) =>
      new GitHubForge(
        { kind: "github", host, owner: "acme", name: "meter", dir: "/r" },
        { token: async () => "ghp_disposable", apiBaseUrl: base },
      );
    expect(await at("github.com").branchPage("fm/task-ab12cd34")).toBe(
      "https://github.com/acme/meter/compare/trunk...fm/task-ab12cd34",
    );
    expect(await at("github.corp.example").branchPage("fm/task-ab12cd34")).toBe(
      "https://github.corp.example/acme/meter/compare/trunk...fm/task-ab12cd34",
    );
    const fork = new GitHubForge(
      {
        kind: "github",
        host: "github.com",
        owner: "acme",
        name: "meter",
        dir: "/r",
        source: { id: 9, fullName: "someone/meter" },
      },
      { token: async () => "ghp_disposable", apiBaseUrl: base },
    );
    expect(await fork.branchPage("fm/task-ab12cd34")).toBeNull();
  });
});
