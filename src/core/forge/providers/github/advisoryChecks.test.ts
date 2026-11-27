import { describe, expect, it } from "vitest";
import { stub } from "../../../../../tests/helpers/githubForgeStub";
import { BUNDLED_NAMING } from "../../../../../tests/helpers/namingRunbook";
import { checkSnapshotSummary } from "../../../../shared/checkSnapshot";
import { GitHubForge } from "./githubForge";

// docs/forge.md, "Advisory workflows".
describe("GitHubForge's advisory workflows", () => {
  it("reads every check of a project's advisory workflow as holding nothing, matched by the workflow file GitHub names on its run", async () => {
    // GitHub's answer for one pull request version, trimmed to three
    // workflows and two checks of each, keeping its run, workflow and suite
    // ids, since the reader joins checks to runs by them.
    const head = "24f40659406048965e39450ce0eaf096201beaa0";
    const run = (
      id: number,
      name: string,
      file: string,
      run_number: number,
      workflow_id: number,
      check_suite_id: number,
      conclusion: string,
    ) => ({
      id,
      name,
      path: `.github/workflows/${file}`,
      run_number,
      workflow_id,
      check_suite_id,
      event: "pull_request",
      status: "completed",
      conclusion: conclusion as string | null,
      head_sha: head,
    });
    const ci = run(45954859973, "ci", "ci.yml", 1439, 424213310, 124326149065, "success");
    const batch = run(
      45954860158,
      "batch",
      "batch-pull-request.yml",
      139,
      424213309,
      124326149518,
      "skipped",
    );
    const contributors = run(
      45954860226,
      "contributors",
      "contributors.yml",
      139,
      424213311,
      124326149668,
      "success",
    );
    const desktop =
      "Pull request · Contributor's desktop checks / Pull request · Unit tests (Linux; group 1/3)";
    const installer =
      "Pull request · Contributor's desktop checks / Pull request · Signed installer checks";
    const check = (suite: number, name: string, conclusion: string, started: string) => ({
      name,
      status: "completed",
      conclusion,
      started_at: started,
      completed_at: started,
      check_suite: { id: suite },
    });
    const ciChecks = [
      check(
        ci.check_suite_id,
        "Pull request · Code checks (Linux)",
        "success",
        "2026-11-27T06:54:39Z",
      ),
      check(
        ci.check_suite_id,
        "Manual request · Unit tests (Linux)",
        "skipped",
        "2026-11-27T06:54:37Z",
      ),
    ];
    const batchChecks = [
      check(batch.check_suite_id, "Merge batch · Batch checks", "skipped", "2026-11-27T06:54:48Z"),
    ];
    const contributorChecks = [
      check(contributors.check_suite_id, desktop, "success", "2026-11-27T06:56:12Z"),
      check(contributors.check_suite_id, installer, "skipped", "2026-11-27T08:23:39Z"),
    ];
    // First as GitHub listed it while the contributors run was going and none of its jobs had registered.
    let versionRuns = [ci, batch, { ...contributors, status: "in_progress", conclusion: null }];
    let checkRuns = [...ciChecks, ...batchChecks];
    const { base } = await stub({
      [`GET /repos/octo/meter/commits/${head}/check-runs`]: () => ({
        json: { total_count: checkRuns.length, check_runs: checkRuns },
      }),
      [`GET /repos/octo/meter/commits/${head}/status`]: () => ({ json: { statuses: [] } }),
      "GET /repos/octo/meter/actions/runs": () => ({
        json: { total_count: versionRuns.length, workflow_runs: versionRuns },
      }),
      "GET /repos/octo/meter/pulls/129": () => ({
        json: { mergeable: true, mergeable_state: "clean" },
      }),
    });
    const forge = (advisoryWorkflows?: string[]) =>
      new GitHubForge(
        {
          kind: "github",
          host: "github.com",
          owner: "octo",
          name: "meter",
          dir: "/r",
          ...(advisoryWorkflows ? { advisoryWorkflows } : {}),
        },
        { token: async () => "gho_test", apiBaseUrl: base, namingRule: () => BUNDLED_NAMING },
      );
    const change = { number: 129, url: null, branch: "fm/task-1", headSha: head };
    const overall = (reading: Awaited<ReturnType<GitHubForge["checks"]>>) =>
      checkSnapshotSummary({ headSha: head, ...reading, absenceDeclared: false }).overall;

    // With no advisory workflow, the unfinished run holds the change, as it always has.
    expect(overall(await forge().checks(change))).toBe("pending");
    // Named advisory, that run holds nothing, and the required checks decide.
    const running = await forge([contributors.path]).checks(change);
    expect(running.items.find((item) => item.run === contributors.id)).toMatchObject({
      state: "neutral",
      advisory: "pending",
      summary: true,
    });
    expect(overall(running)).toBe("green");

    // Its jobs as GitHub reported them once they finished: each reads neutral
    // and keeps its own state, while the other workflows' checks stay as read.
    versionRuns = [ci, batch, contributors];
    checkRuns = [...ciChecks, ...batchChecks, ...contributorChecks];
    const finished = await forge([contributors.path]).checks(change);
    expect(finished.items.map(({ name, state, advisory }) => ({ name, state, advisory }))).toEqual(
      expect.arrayContaining([
        { name: "Pull request · Code checks (Linux)", state: "success", advisory: undefined },
        { name: "Manual request · Unit tests (Linux)", state: "skipped", advisory: undefined },
        { name: desktop, state: "neutral", advisory: "success" },
        { name: installer, state: "neutral", advisory: "skipped" },
      ]),
    );
    expect(finished.items.filter((item) => item.advisory !== undefined)).toHaveLength(2);

    // A rerun of the advisory workflow, before GitHub registers its jobs: the
    // earlier run's failed job waits on the rerun and still holds nothing.
    const rerun = {
      ...contributors,
      id: 45960000001,
      run_number: 140,
      check_suite_id: 124330000001,
      status: "in_progress",
      conclusion: null,
    };
    versionRuns = [ci, batch, contributors, rerun];
    checkRuns = [
      ...ciChecks,
      ...batchChecks,
      { ...contributorChecks[0]!, conclusion: "failure" },
      contributorChecks[1]!,
    ];
    const retried = await forge([contributors.path]).checks(change);
    expect(
      retried.items
        .filter((item) => item.name === desktop || item.name === installer)
        .map(({ state, advisory }) => ({ state, advisory })),
    ).toEqual([
      { state: "neutral", advisory: "pending" },
      { state: "neutral", advisory: "pending" },
    ]);
    expect(overall(retried)).toBe("green");
    // The same rerun of a required workflow holds the change until its jobs finish.
    const ciRerun = { ...rerun, path: ci.path, workflow_id: ci.workflow_id, run_number: 1440 };
    versionRuns = [ci, batch, contributors, ciRerun];
    checkRuns = [...ciChecks, ...batchChecks, ...contributorChecks];
    const required = await forge([contributors.path]).checks(change);
    expect(required.items.find((item) => item.name === ciChecks[0]!.name)).toEqual({
      name: ciChecks[0]!.name,
      state: "pending",
    });
    expect(overall(required)).toBe("pending");
  });
});
