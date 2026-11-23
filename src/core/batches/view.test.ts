import { type BatchRecord, FINISHED_BATCH_KEPT_MS } from "@shared/batches";
import { AUTOMATIC_COMPUTER } from "@shared/placement";
import type { RepoView } from "@shared/repos";
import { describe, expect, it } from "vitest";
import { LEFT_OUT_WORDS } from "./combine";
import { type BatchesViewSources, batchesView } from "./view";

// Intent: the captain's approved plan for the Batches panel: `batches.list` gives each project
// on batched pull requests its line, open batch, changes left out and the batches that ended
// in the last day, each task by its key, so the panel can show them in the focused project.

const NOW = 50_000_000;
const METER: RepoView = {
  id: "repo-meter",
  name: "meter",
  path: "/projects/meter",
  setupKind: "clone",
  kind: "project",
  origin: "https://github.com/acme/meter.git",
  host: { kind: "github", name: "github.com" },
  delivery: "queue-pr",
  autonomy: false,
  rigor: "standard",
  runsOn: AUTOMATIC_COMPUTER,
};
const TASKS: Record<string, { key: string; title: string }> = {
  "t-parser": { key: "MTR-12", title: "Read dates with a time zone" },
  "t-export": { key: "MTR-14", title: "Add a CSV export" },
  "t-legend": { key: "MTR-15", title: "Keep the legend inside the chart" },
  "t-repair": { key: "MTR-19", title: "Repair the held batch" },
};
const HEAD = "1111111111111111111111111111111111111111";

function sources(repos: RepoView[]): BatchesViewSources {
  return {
    repos,
    projectOf: () => "project-acme",
    place: () => "GitHub",
    reading: () => ({
      head: HEAD,
      at: NOW - 60_000,
      passed: 3,
      failed: 1,
      running: 0,
      failedNames: ["lint"],
    }),
    task: (taskId) => TASKS[taskId],
    now: NOW,
  };
}

const RECORD: BatchRecord = {
  line: [
    {
      taskId: "t-legend",
      branch: "inf/legend",
      head: "3333333333333333333333333333333333333333",
      title: "fix(chart): keep the legend inside the chart",
      body: "",
      at: NOW - 120_000,
      after: "t-export",
    },
  ],
  open: {
    branch: "infinitary-batch/7c41",
    base: "0000000000000000000000000000000000000000",
    head: HEAD,
    since: NOW - 3_000_000,
    number: 31,
    url: "https://github.com/acme/meter/pull/31",
    members: [
      {
        taskId: "t-parser",
        branch: "inf/parser",
        head: "4444444444444444444444444444444444444444",
        title: "fix(parser): read dates with a time zone",
        body: "",
        at: 1_000,
        commit: "5555555555555555555555555555555555555555",
      },
    ],
    hold: { reason: "checks", head: HEAD, checks: ["lint"], at: NOW - 240_000 },
    holds: 1,
  },
  receipts: [],
  leftOut: [{ taskId: "t-export", head: "6666", reason: "it no longer combines", at: NOW }],
  finished: [
    {
      number: 29,
      formed: NOW - FINISHED_BATCH_KEPT_MS - 9_000_000,
      ended: NOW - FINISHED_BATCH_KEPT_MS - 1,
      outcome: "merged",
      members: [{ taskId: "t-parser", title: "an old batch" }],
      holds: 0,
    },
    {
      number: 30,
      url: "https://github.com/acme/meter/pull/30",
      formed: NOW - 9_000_000,
      ended: NOW - 6_000_000,
      outcome: "merged",
      members: [{ taskId: "t-export", title: "feat(export): add a CSV export" }],
      holds: 2,
    },
  ],
};

describe("batches.list", () => {
  it("gives a batched project its line, open batch, left-out changes and last day, each task by its key", () => {
    const [repo] = batchesView(sources([{ ...METER, batch: RECORD }])).repos;
    expect(repo).toMatchObject({
      repoId: "repo-meter",
      name: "meter",
      projectId: "project-acme",
      place: "GitHub",
      line: [{ taskId: "t-legend", key: "MTR-15", afterKey: "MTR-14", fix: false }],
      open: {
        number: 31,
        members: [{ taskId: "t-parser", key: "MTR-12" }],
        hold: { reason: "checks", checks: ["lint"], at: NOW - 240_000, detail: null },
        queued: false,
        stale: false,
        checks: { passed: 3, failed: 1, failedNames: ["lint"] },
      },
      leftOut: [{ taskId: "t-export", key: "MTR-14", reason: "it no longer combines" }],
    });
    // The batch that ended more than a day ago is left out.
    expect(repo?.finished).toEqual([
      {
        number: 30,
        url: "https://github.com/acme/meter/pull/30",
        formed: NOW - 9_000_000,
        ended: NOW - 6_000_000,
        outcome: "merged",
        holds: 2,
        members: [{ taskId: "t-export", key: "MTR-14", title: "feat(export): add a CSV export" }],
      },
    ]);
  });

  // Intent: INF-6147's accepted plan, piece 1, with the captain's answer to its review (let the
  // first rebuild stand): a version told to rebuild while in line, whose batch merged first,
  // waits in no batch, so the panel lists it as left out with why and what it waits for.
  it("lists a version waiting for its rebuild on a batch that merged as left out, not in line", () => {
    const on = "4444444444444444444444444444444444444444";
    const record: BatchRecord = {
      ...RECORD,
      open: undefined,
      leftOut: [],
      rebuilds: [
        {
          taskId: "t-legend",
          head: RECORD.line[0]?.head as string,
          on,
          branch: "infinitary-batch/7c41",
          members: [{ taskId: "t-parser", head: HEAD }],
          at: NOW - 60_000,
          merged: true,
        },
      ],
    };
    const [repo] = batchesView(sources([{ ...METER, batch: record }])).repos;
    expect(repo?.line).toEqual([]);
    expect(repo?.leftOut).toEqual([
      {
        taskId: "t-legend",
        key: "MTR-15",
        title: "fix(chart): keep the legend inside the chart",
        reason: LEFT_OUT_WORDS.batchMerged(on),
        aheadKey: null,
      },
    ]);
  });

  // Intent: the captain's ask that a held batch's actual state be clear: `batches.list` names
  // the hold's repair, whether it waits for that repair's fix, and whether a rerun passed.
  it("names a held batch's repair, or a batch of one's own change, with its fix and a passed rerun", () => {
    const open = RECORD.open as NonNullable<BatchRecord["open"]>;
    const one = (record: BatchRecord) =>
      batchesView(sources([{ ...METER, batch: record }])).repos[0]?.open;
    // A held batch of one: its own change's crewmate repairs it.
    expect(one(RECORD)).toMatchObject({
      repair: { taskId: "t-parser", key: "MTR-12", own: true, fixing: false },
      awaitsFix: false,
      passed: false,
    });
    // A recorded repair that declared the fix, after it sent changes back.
    expect(
      one({
        ...RECORD,
        fixes: ["t-repair"],
        open: { ...open, repair: "t-repair", awaits: "t-repair" },
      }),
    ).toMatchObject({
      repair: {
        taskId: "t-repair",
        key: "MTR-19",
        title: "Repair the held batch",
        own: false,
        fixing: true,
      },
      awaitsFix: true,
    });
    expect(
      one({
        ...RECORD,
        open: { ...open, repair: "t-repair", passed: { head: HEAD, checks: ["lint"] } },
      }),
    ).toMatchObject({ passed: true });
    // No hold, no repair.
    const { hold: _hold, ...checking } = open;
    expect(one({ ...RECORD, open: { ...checking, repair: "t-repair" } })?.repair).toBeNull();
  });

  it("lists a batched project with nothing yet, leaves out one delivered otherwise, and keeps one whose record still holds a batch", () => {
    const direct = { ...METER, id: "repo-site", name: "site", delivery: "direct-pr" as const };
    const ended = { ...direct, id: "repo-docs", name: "docs", batch: RECORD };
    const view = batchesView(sources([METER, direct, ended]));
    expect(view.repos.map((repo) => repo.name)).toEqual(["meter", "docs"]);
    expect(view.repos[0]).toMatchObject({ line: [], open: null, leftOut: [], finished: [] });
  });
});
