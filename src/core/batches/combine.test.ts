import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type BatchChange,
  type BatchMember,
  type BatchRecord,
  EMPTY_BATCH_RECORD,
} from "@shared/batches";
import { describe, expect, it, vi } from "vitest";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import {
  batchVersionIn,
  clashesWithBatch,
  combine,
  LEFT_OUT_WORDS,
  landedCommits,
  pushBatch,
} from "./combine";
import { carried, combined, declared, enqueue, heldVersions, release, withdraw } from "./line";

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

// Integration budget (docs/test-cohorts.md): real git against a bare host, the slowest
// test took 1.1 s on the Mac, five times that rounded up.
vi.setConfig({ testTimeout: 10_000 });

// Intent: the captain's approved plan for batches of their own, piece 1: the app combines
// the whole line at home, in approval order, onto the freshly fetched default branch, one
// commit per change with the change's checked title as its subject; a change that does
// not combine is left out and the rest go on; each member's receipt names its own commit.

const run = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" })
    .toString()
    .trim();

type Host = {
  /** The project where it lives: a bare repository. */
  bare: string;
  /** The project's folder at home, where the combine runs. */
  home: string;
  /** A crewmate's working copy, where branches are written and pushed. */
  work: string;
};

/** A small project where it lives, its folder at home and a working copy, with one commit on main. */
function host(): Host {
  const root = scratchDir("infinitary-batch-combine-");
  const bare = join(root, "meter.git");
  const home = join(root, "home");
  const work = join(root, "work");
  execFileSync("git", ["init", "--bare", "--initial-branch=main", bare], { stdio: "pipe" });
  execFileSync("git", ["clone", bare, work], { stdio: "pipe" });
  run(work, "config", "user.name", "Ada Crew");
  run(work, "config", "user.email", "ada@example.com");
  write(work, "src/parser.ts", "export const parse = (text: string) => new Date(text);\n");
  write(work, "src/report.ts", "export const rows = ['date', 'total'];\n");
  run(work, "add", "-A");
  run(work, "commit", "-m", "chore: start the meter");
  run(work, "push", "origin", "HEAD:refs/heads/main");
  execFileSync("git", ["clone", bare, home], { stdio: "pipe" });
  return { bare, home, work };
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** Push a branch with one commit that writes `files`, started from `from`, and answer it as an approved change. */
function change(
  at: Host,
  input: {
    taskId: string;
    title: string;
    body?: string;
    files: Record<string, string>;
    from?: string;
    approvedAt: number;
    author?: string;
  },
): BatchChange {
  const branch = `fm/${input.taskId}`;
  run(at.work, "fetch", "--quiet", "origin");
  run(at.work, "checkout", "--quiet", "-B", branch, input.from ?? "origin/main");
  for (const [path, text] of Object.entries(input.files)) write(at.work, path, text);
  run(at.work, "add", "-A");
  run(
    at.work,
    "-c",
    `user.name=${input.author ?? "Ada Crew"}`,
    "commit",
    "-m",
    `wip: ${input.taskId}`,
  );
  run(at.work, "push", "--force", "origin", `HEAD:refs/heads/${branch}`);
  return {
    taskId: input.taskId,
    branch,
    head: run(at.work, "rev-parse", "HEAD"),
    title: input.title,
    body: input.body ?? "",
    at: input.approvedAt,
  };
}

const PARSER = {
  taskId: "task-parser",
  title: "fix(parser): read dates with a time zone",
  body: "- Dates with a time zone are read as written.\n\nBREAKING CHANGE: a date without a zone is read as UTC.",
  files: {
    "src/parser.ts": "export const parse = (text: string) => new Date(text.concat('Z'));\n",
  },
  approvedAt: 1_000,
};
const EXPORT = {
  taskId: "task-export",
  title: "feat(export): add a CSV export",
  body: "- A report exports as CSV.",
  files: { "src/export.ts": "export const csv = (rows: string[]) => rows.join(',');\n" },
  approvedAt: 2_000,
  author: "Grace Crew",
};

const AT = Date.UTC(2026, 10, 11, 18, 30);

/** The time limit these tests give a call: a local fetch takes a small part of it. */
const SOON = 500;

/**
 * From its `after`-th connection on, the place the project lives takes a
 * connection and stays silent for ten times the limit these tests give a
 * call, then gives up. Git's own `ext` transport runs this script in place
 * of the network, so a real fetch or push from the project's folder at home
 * waits on it as it would on a silent host. Answers whether the host gave
 * up by itself: a call its own limit ended never lets it get that far.
 */
function goesSilent(at: Host, after: number): () => boolean {
  const root = dirname(at.bare);
  const calls = join(root, "calls");
  const gaveUp = join(root, "gave-up");
  const script = join(root, "host.sh");
  mkdirSync(calls);
  writeFileSync(
    script,
    [
      "#!/bin/sh",
      `n=$(ls "${calls}" | wc -l)`,
      `: > "${calls}/$$"`,
      `if [ "$n" -ge ${after} ]; then sleep ${(SOON * 10) / 1000}; : > "${gaveUp}"; exit 1; fi`,
      `exec git "$1" "${at.bare}"`,
      "",
    ].join("\n"),
  );
  run(at.home, "config", "protocol.ext.allow", "always");
  run(at.home, "remote", "set-url", "origin", `ext::sh ${script.replaceAll(" ", "% ")} %s`);
  return () => existsSync(gaveUp);
}

describe("combining approved changes at home", () => {
  it("writes one commit per change, in approval order, onto the default branch", async () => {
    const at = host();
    const parser = change(at, PARSER);
    const exported = change(at, EXPORT);
    const before = run(at.home, "status", "--porcelain=v2", "--branch");

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [parser, exported],
      at: AT,
    });

    expect(result.leftOut).toEqual([]);
    expect(result.base).toBe(run(at.bare, "rev-parse", "main"));
    expect(result.members.map((member) => member.taskId)).toEqual(["task-parser", "task-export"]);
    const [first, second] = result.members.map((member) => member.commit) as [string, string];
    expect(result.head).toBe(second);
    // One commit each, the second on the first, the first on the default branch.
    expect(run(at.home, "rev-list", "--parents", "-n", "1", first)).toBe(`${first} ${result.base}`);
    expect(run(at.home, "rev-list", "--parents", "-n", "1", second)).toBe(`${second} ${first}`);
    // The change's checked title is the subject; its story's words and breaking footer the body.
    expect(run(at.home, "log", "-1", "--format=%B", first)).toBe(
      `${PARSER.title}\n\n${PARSER.body}`,
    );
    expect(run(at.home, "log", "-1", "--format=%s%n%an", second)).toBe(
      `${EXPORT.title}\nGrace Crew`,
    );
    // Each commit carries its own change and nothing else.
    expect(run(at.home, "diff", "--name-only", result.base, first)).toBe("src/parser.ts");
    expect(run(at.home, "diff", "--name-only", first, second)).toBe("src/export.ts");
    // The project's own folder is untouched: no file moved and no branch changed.
    expect(run(at.home, "status", "--porcelain=v2", "--branch")).toBe(before);
    expect(readFileSync(join(at.home, "src/parser.ts"), "utf8")).toContain("new Date(text)");
  });

  it("leaves a branch from the former project history out and combines the current work (project move)", async () => {
    const former = host();
    const current = host();
    run(
      current.work,
      "commit",
      "--amend",
      "-m",
      "chore: start the new home without the former history",
    );
    run(current.work, "push", "--force", "origin", "HEAD:main");
    const old = change(former, PARSER);
    run(former.work, "push", current.bare, `HEAD:refs/heads/${old.branch}`);
    const eligible = change(current, EXPORT);
    const result = await combine({
      repoDir: current.home,
      defaultBranch: "main",
      changes: [old, eligible],
      at: AT,
    });
    expect(result.leftOut).toEqual([{ change: old, reason: LEFT_OUT_WORDS.unrelated }]);
    expect(result.members).toEqual([{ ...eligible, commit: result.head }]);
    expect(run(current.home, "diff", "--name-only", result.base, result.head)).toBe(
      "src/export.ts",
    );
  });

  it("combines onto the default branch as it is now, not as the home last saw it", async () => {
    const at = host();
    const parser = change(at, PARSER);
    // Someone else's change merges where the project lives after the approval.
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "README.md", "# Meter\n");
    run(at.work, "add", "-A");
    run(at.work, "commit", "-m", "docs: add a readme");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
    const moved = run(at.work, "rev-parse", "HEAD");

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [parser],
      at: AT,
    });

    expect(result.base).toBe(moved);
    expect(run(at.home, "ls-tree", "-r", "--name-only", result.head).split("\n")).toEqual([
      "README.md",
      "src/parser.ts",
      "src/report.ts",
    ]);
  });

  // Intent: INF-4517's plan, piece 2 (the captain's "Approve and build"): the left-out
  // reason says whether the change clashes with the default branch now or only with a
  // change ahead of it in the batch, and names that change.
  it("leaves out a change that does not combine with one ahead of it, names that change, and the rest go on", async () => {
    const at = host();
    const parser = change(at, PARSER);
    const clash = change(at, {
      taskId: "task-strict",
      title: "fix(parser): refuse a date with no year",
      files: { "src/parser.ts": "export const parse = (text: string) => strict(text);\n" },
      approvedAt: 1_500,
    });
    const exported = change(at, EXPORT);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [parser, clash, exported],
      at: AT,
    });

    expect(result.members.map((member) => member.taskId)).toEqual(["task-parser", "task-export"]);
    expect(result.leftOut).toEqual([
      {
        change: clash,
        reason: LEFT_OUT_WORDS.ahead(PARSER.title),
        ahead: "task-parser",
        clash: true,
      },
    ]);
  });

  it("leaves out a change that no longer combines with the default branch itself as clashing with it, even with a change ahead", async () => {
    const at = host();
    const clash = change(at, {
      taskId: "task-strict",
      title: "fix(parser): refuse a date with no year",
      files: { "src/parser.ts": "export const parse = (text: string) => strict(text);\n" },
      approvedAt: 1_500,
    });
    // The default branch moves under it: another change to the parser merged meanwhile.
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "src/parser.ts", "export const parse = (text: string) => loose(text);\n");
    run(at.work, "commit", "-qam", "fix(parser): read loose dates");
    run(at.work, "push", "--quiet", "origin", "HEAD:refs/heads/main");
    const exported = change(at, EXPORT);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [exported, clash],
      at: AT,
    });

    expect(result.members.map((member) => member.taskId)).toEqual(["task-export"]);
    expect(result.leftOut).toEqual([
      { change: clash, reason: LEFT_OUT_WORDS.conflict, clash: true },
    ]);
  });

  it("leaves out a change whose pushed branch moved past the approved version", async () => {
    const at = host();
    const approved = change(at, PARSER);
    // The crewmate pushes again after the approval: what was approved is no longer what is pushed.
    change(at, { ...PARSER, files: { "src/parser.ts": "export const parse = Date.parse;\n" } });

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [approved],
      at: AT,
    });

    expect(result.members).toEqual([]);
    expect(result.head).toBe(result.base);
    expect(result.leftOut).toEqual([{ change: approved, reason: LEFT_OUT_WORDS.moved }]);
  });

  it("leaves out a change that changes nothing on the default branch as it is now", async () => {
    const at = host();
    const parser = change(at, PARSER);
    run(at.work, "push", "origin", `${parser.head}:refs/heads/main`);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [parser],
      at: AT,
    });

    expect(result.leftOut).toEqual([{ change: parser, reason: LEFT_OUT_WORDS.nothing }]);
  });

  it("carries a change stacked on another only once that work is in, never unapproved work", async () => {
    const at = host();
    const parser = change(at, PARSER);
    const stacked: BatchChange = {
      ...change(at, {
        taskId: "task-zones",
        title: "feat(parser): name the time zone in errors",
        files: { "src/zones.ts": "export const zone = 'UTC';\n" },
        from: parser.head,
        approvedAt: 3_000,
      }),
      base: parser.branch,
    };

    // Alone, it would bring the parser change in under its own commit.
    const alone = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [stacked],
      at: AT,
    });
    expect(alone.members).toEqual([]);
    expect(alone.leftOut).toEqual([
      { change: stacked, reason: LEFT_OUT_WORDS.stacked("fm/task-parser") },
    ]);

    // Behind the change it builds on, it adds only its own work.
    const together = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [parser, stacked],
      at: AT,
    });
    expect(together.leftOut).toEqual([]);
    const [first, second] = together.members.map((member) => member.commit) as [string, string];
    expect(run(at.home, "diff", "--name-only", first, second)).toBe("src/zones.ts");
  });
});

// Intent: INF-4517 piece 3, the captain's "a part starts \"When the part before it is approved
// to merge\"", and the independent review's findings on it: a part built on its base's approved
// version combines only on the version of its base the batch carries or merged, and waits in
// line, with no left-out note, while its base did not combine.
describe("a change built on another change's approved version", () => {
  /** The parser change approved at a first version, then at a second one built on it. */
  function approvedTwice(at: Host) {
    const first = change(at, PARSER);
    const panel: BatchChange = {
      ...change(at, {
        taskId: "task-panel",
        title: "feat(parser): show parsed dates in the panel",
        files: { "src/panel.ts": "export const panel = 'dates';\n" },
        from: first.head,
        approvedAt: 3_000,
      }),
      base: first.branch,
      after: first.taskId,
    };
    /** The parser change approved again at a second version, pushed over the first. */
    const again = () =>
      change(at, {
        ...PARSER,
        files: {
          "src/parser.ts": "export const parse = (text: string) => new Date(text + 'Z');\n",
        },
        from: first.head,
      });
    return { first, again, panel };
  }

  it("waits for its base, with no left-out note, while its base is neither in the batch nor merged", async () => {
    const at = host();
    const { panel } = approvedTwice(at);
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [panel],
      at: AT,
    });
    expect(result.members).toEqual([]);
    expect(result.leftOut).toEqual([]);
    expect(result.waiting).toEqual([panel]);
  });

  it("goes behind the version of its base the batch carries, and is left out when built on an earlier one", async () => {
    const at = host();
    const { first, again, panel } = approvedTwice(at);
    const onFirst = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [first, panel],
      at: AT,
    });
    expect(onFirst.leftOut).toEqual([]);
    const [base, own] = onFirst.members.map((member) => member.commit) as [string, string];
    expect(run(at.home, "diff", "--name-only", base, own)).toBe("src/panel.ts");

    const second = again();
    const onSecond = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [second, panel],
      at: AT,
    });
    expect(onSecond.members.map((member) => member.taskId)).toEqual([PARSER.taskId]);
    expect(onSecond.leftOut).toEqual([
      { change: panel, reason: LEFT_OUT_WORDS.behindBase(second.head) },
    ]);
  });

  // INF-5269's plan, part 2: a chain three parts deep, each started at the approval of the
  // part under it, merges in order as one commit of each part's own difference, and the parts
  // above a part the batch leaves out do not go in without it.
  it("carries a chain of three in order, each as its own commit, and none above a part left out", async () => {
    const at = host();
    const { first, panel } = approvedTwice(at);
    const legend: BatchChange = {
      ...change(at, {
        taskId: "task-legend",
        title: "feat(parser): explain the dates in a legend",
        files: { "src/legend.ts": "export const legend = 'dates';\n" },
        from: panel.head,
        approvedAt: 4_000,
      }),
      base: panel.branch,
      after: panel.taskId,
    };
    const input = { repoDir: at.home, defaultBranch: "main", at: AT };
    const chain = await combine({ ...input, changes: [first, panel, legend] });
    expect(chain.leftOut).toEqual([]);
    expect(chain.members.map((member) => member.taskId)).toEqual([
      PARSER.taskId,
      panel.taskId,
      legend.taskId,
    ]);
    const [one, two, three] = chain.members.map((member) => member.commit) as [
      string,
      string,
      string,
    ];
    expect(run(at.home, "diff", "--name-only", chain.base, one)).toBe("src/parser.ts");
    expect(run(at.home, "diff", "--name-only", one, two)).toBe("src/panel.ts");
    expect(run(at.home, "diff", "--name-only", two, three)).toBe("src/legend.ts");

    // The bottom part's crewmate pushes past its approved version: the batch leaves it out.
    change(at, { ...PARSER, files: { "src/parser.ts": "export const parse = Date.parse;\n" } });
    const withoutBase = await combine({ ...input, changes: [first, panel, legend] });
    expect(withoutBase.members).toEqual([]);
    expect(withoutBase.leftOut).toEqual([{ change: first, reason: LEFT_OUT_WORDS.moved }]);
    expect(withoutBase.waiting).toEqual([panel, legend]);
  });

  it("goes as its own change once its base merged, checked against the version that merged", async () => {
    const at = host();
    const { first, again, panel } = approvedTwice(at);
    const mergedAt = (head: string) => (taskId: string) =>
      taskId === PARSER.taskId ? head : undefined;
    const input = { repoDir: at.home, defaultBranch: "main", changes: [panel], at: AT };
    run(at.work, "push", "origin", `${first.head}:refs/heads/main`);
    const own = await combine({ ...input, merged: mergedAt(first.head) });
    expect(own.leftOut).toEqual([]);
    expect(own.members.map((member) => member.taskId)).toEqual([panel.taskId]);
    expect(run(at.home, "diff", "--name-only", own.base, own.head)).toBe("src/panel.ts");

    const second = again();
    run(at.work, "push", "origin", `${second.head}:refs/heads/main`);

    const behind = await combine({ ...input, merged: mergedAt(second.head) });
    expect(behind.members).toEqual([]);
    expect(behind.leftOut).toEqual([
      { change: panel, reason: LEFT_OUT_WORDS.behindBase(second.head) },
    ]);
  });

  // The captain's choice on the review's question: follow the later part's commits, and tell
  // its crewmate to rebuild without the earlier part's work when that part closed unmerged.
  it("leaves it out while it carries the work of a base that closed without merging, and carries it rebuilt without it", async () => {
    const at = host();
    const { first, panel } = approvedTwice(at);
    const closed = (change: BatchChange) =>
      change.taskId === panel.taskId ? [first.head] : undefined;
    const carrying = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [panel],
      at: AT,
      unmergedBase: closed,
    });
    expect(carrying.members).toEqual([]);
    expect(carrying.leftOut).toEqual([
      { change: panel, reason: LEFT_OUT_WORDS.baseClosed(first.head) },
    ]);

    const rebuilt: BatchChange = {
      ...change(at, {
        taskId: panel.taskId,
        title: panel.title,
        files: { "src/panel.ts": "export const panel = 'dates';\n" },
        approvedAt: 4_000,
      }),
      base: first.branch,
      after: first.taskId,
    };
    const own = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [rebuilt],
      at: AT,
      unmergedBase: closed,
    });
    expect(own.leftOut).toEqual([]);
    expect(run(at.home, "diff", "--name-only", own.base, own.head)).toBe("src/panel.ts");
  });

  // INF-5297's review: a kept repair brings the earlier part up to date with the default
  // branch, so its newer approved version does not hold the one the later part was built on.
  // A later part brought onto that newer version still carries the closed part's work.
  it("leaves it out while it carries the newer approved version of a base that closed without merging", async () => {
    const at = host();
    const { first } = approvedTwice(at);
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "src/report.ts", "export const rows = ['date', 'total', 'zone'];\n");
    run(at.work, "commit", "-am", "feat(report): add the zone column");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
    // The repair: the parser's change again, on the newer default branch.
    const repaired = change(at, { ...PARSER, approvedAt: 2_500 });
    const replayed: BatchChange = {
      ...change(at, {
        taskId: "task-panel",
        title: "feat(parser): show parsed dates in the panel",
        files: { "src/panel.ts": "export const panel = 'dates';\n" },
        from: repaired.head,
        approvedAt: 4_000,
      }),
      base: first.branch,
      after: first.taskId,
    };
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [replayed],
      at: AT,
      unmergedBase: () => [first.head, repaired.head],
    });
    expect(result.members).toEqual([]);
    expect(result.leftOut).toEqual([
      { change: replayed, reason: LEFT_OUT_WORDS.baseClosed(repaired.head) },
    ]);
  });
});

describe("a held batch's fix built on the version that held", () => {
  // Intent: the captain's approved plan to stop changes bouncing between batches, piece 3:
  // a declared fix can change lines a batch member added or changed, so a repair fixes a
  // collision forward instead of sending a correct change back. The collision is the one a
  // repair met: one change adds a column, another adds the generated page that lists the
  // columns, and the page is stale once both are combined.
  const COLUMN = {
    taskId: "task-column",
    title: "feat(report): add a time zone column",
    files: { "src/report.ts": "export const rows = ['date', 'total', 'zone'];\n" },
    approvedAt: 1_000,
  };
  const PAGE = {
    taskId: "task-page",
    title: "docs(report): generate the report's column page",
    files: { "docs/report.md": "| date | total |\n" },
    approvedAt: 2_000,
  };
  const BATCH = "infinitary-batch/5e1d";

  /** The two changes combined and pushed as a batch, as it holds: answers its version. */
  async function heldBatch(
    at: Host,
  ): Promise<{ column: BatchChange; page: BatchChange; held: string; record: BatchRecord }> {
    const column = change(at, COLUMN);
    const page = change(at, PAGE);
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, page],
      at: AT,
    });
    await pushBatch({ repoDir: at.home, branch: BATCH, head: result.head, expected: null });
    // The record as a batch saved before it kept the versions that held: its hold alone names it.
    const record: BatchRecord = {
      ...EMPTY_BATCH_RECORD,
      open: {
        branch: BATCH,
        head: result.head,
        base: result.base,
        members: result.members,
        since: AT,
        hold: { at: AT, head: result.head, reason: "checks", checks: ["unit-tests"] },
      },
    };
    return { column, page, held: result.head, record };
  }

  /** The default branch moves where the project lives, so the next combine re-makes every commit. */
  function mainMoves(at: Host): void {
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "README.md", "# Meter\n");
    run(at.work, "add", "-A");
    run(at.work, "commit", "-m", "docs: add a readme");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
  }

  it("joins with only its own difference when it rewrites a file a member added", async () => {
    const at = host();
    const { column, page, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(docs): list the time zone column",
        files: { "docs/report.md": "| date | total | zone |\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    mainMoves(at);

    // Merged the ordinary way, the fix meets the re-made page as new work and clashes.
    const ordinary = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, page, fix],
      at: AT + 60_000,
    });
    expect(ordinary.leftOut.map((entry) => entry.change.taskId)).toEqual(["task-fix"]);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, page, fix],
      at: AT + 60_000,
      held: [held],
    });

    expect(result.leftOut).toEqual([]);
    expect(result.members.map((member) => member.taskId)).toEqual([
      "task-column",
      "task-page",
      "task-fix",
    ]);
    const [, second, third] = result.members.map((member) => member.commit) as [
      string,
      string,
      string,
    ];
    // Its commit carries the fix alone, on the members' own commits.
    expect(run(at.home, "rev-list", "--parents", "-n", "1", third)).toBe(`${third} ${second}`);
    expect(run(at.home, "diff", second, third)).toContain("+| date | total | zone |");
    expect(run(at.home, "diff", "--name-only", second, third)).toBe("docs/report.md");
    expect(run(at.home, "show", `${result.head}:docs/report.md`)).toBe("| date | total | zone |");
    expect(run(at.home, "show", `${result.head}:README.md`)).toBe("# Meter");
  });

  it("carries no work of a change sent back beside it, and changes a member's own line", async () => {
    const at = host();
    const { column, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };

    // The page went back; the column and the fix combine once.
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, fix],
      at: AT + 60_000,
      held: [held],
    });

    expect(result.leftOut).toEqual([]);
    expect(result.members.map((member) => member.taskId)).toEqual(["task-column", "task-fix"]);
    expect(run(at.home, "show", `${result.head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total', 'time_zone'];",
    );
    expect(run(at.home, "ls-tree", "-r", "--name-only", result.head)).not.toContain(
      "docs/report.md",
    );
  });

  it("is left out with its reason when its difference touches what a change sent back wrote", async () => {
    const at = host();
    const { column, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(docs): list the time zone column",
        files: { "docs/report.md": "| date | total | zone |\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, fix],
      at: AT + 60_000,
      held: [held],
    });

    expect(result.members.map((member) => member.taskId)).toEqual(["task-column"]);
    // The version it was verified on goes with it, left out as it is (`fixBases`).
    expect(result.leftOut).toEqual([
      { change: { ...fix, heldBase: held }, reason: LEFT_OUT_WORDS.fixClash(held) },
    ]);
  });

  it("keeps the version it was verified on, so a combine that no longer knows it carries the fix the same way", async () => {
    const at = host();
    const { column, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    // The page went back, and the fix joined the rest.
    const first = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, fix],
      at: AT + 60_000,
      held: [held],
    });
    const joined = first.members.find((member) => member.taskId === "task-fix");
    expect(joined?.heldBase).toBe(held);

    // The batch closed where the project lives and its changes went back in line.
    const { commit: _commit, ...requeued } = joined as BatchMember;
    mainMoves(at);
    const again = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, requeued],
      at: AT + 120_000,
    });
    expect(again.leftOut).toEqual([]);
    expect(run(at.home, "ls-tree", "-r", "--name-only", again.head)).not.toContain(
      "docs/report.md",
    );
    expect(run(at.home, "show", `${again.head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total', 'time_zone'];",
    );

    // A branch moved off that version is left out, never carried whole.
    const moved = change(at, {
      taskId: "task-fix",
      title: "fix(report): name the column as the export does",
      files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
      approvedAt: 3_000,
    });
    const lost = { ...moved, fix: true as const, heldBase: held };
    const refused = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, lost],
      at: AT + 180_000,
    });
    expect(refused.leftOut).toEqual([{ change: lost, reason: LEFT_OUT_WORDS.fixBaseLost(held) }]);
  });

  // Intent: the same piece, the independent review's second finding, a bug being fixed: a
  // new version of a fix that had joined was carried whole, with the members' work.
  it("carries a new version of a joined fix, approved in its place, from the same held version", async () => {
    const at = host();
    const { column, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    // The page went back beside the fix, and the fix joined the rest.
    await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, fix],
      at: AT + 60_000,
      held: [held],
    });

    // The repair pushes a new version on its own branch: in line, it carries no verified base.
    const replaced: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'tz'];\n" },
        from: fix.head,
        approvedAt: 4_000,
      }),
      fix: true,
    };
    mainMoves(at);
    const again = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, replaced],
      at: AT + 120_000,
      held: [held],
    });

    expect(again.leftOut).toEqual([]);
    expect(again.members.find((member) => member.taskId === "task-fix")?.heldBase).toBe(held);
    expect(run(at.home, "show", `${again.head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total', 'tz'];",
    );
    expect(run(at.home, "ls-tree", "-r", "--name-only", again.head)).not.toContain(
      "docs/report.md",
    );
  });

  // Intent: Try again must not clear the hold while leaving the branch at the failed
  // version. Keep the real Git clock input in the same second, even on a second retry.
  it("pushes a new version on each same-second retry without changing the approved work", async () => {
    const at = host();
    const { held, record } = await heldBatch(at);
    const excludeHeads = [held];
    const input = {
      repoDir: at.home,
      defaultBranch: "main",
      changes: carried(release(record), "line"),
      at: AT + 1,
      excludeHeads,
    };
    let expected = held;
    const commits = (head: string) =>
      run(at.home, "log", "--format=%T%n%an%n%ae%n%at%n%B", `main..${head}`);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await combine(input);
      await pushBatch({ repoDir: at.home, branch: BATCH, head: result.head, expected });
      const pushed = run(at.bare, "rev-parse", `refs/heads/${BATCH}`);
      expect(pushed).toBe(result.head);
      expect(excludeHeads).not.toContain(pushed);
      expect(result.base).toBe(record.open?.base);
      expect(result.members).toEqual(
        record.open?.members.map((member, index, members) => ({
          ...member,
          commit: index === members.length - 1 ? pushed : member.commit,
        })),
      );
      expect(commits(pushed)).toBe(commits(held));
      expected = pushed;
      excludeHeads.push(pushed);
    }
  });

  /** The batch record's own combine, as the app runs it, over real git. */
  async function recombined(at: Host, record: BatchRecord, when: number): Promise<BatchRecord> {
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: carried(record, "line"),
      at: when,
      held: heldVersions(record),
    });
    return {
      ...combined(release(record), result, { branch: BATCH, at: when }),
      leftOut: result.leftOut.map((entry) => ({
        taskId: entry.change.taskId,
        head: entry.change.head,
        reason: entry.reason,
        at: when,
      })),
    };
  }

  // Intent: the same piece, the independent review's third finding, a bug being fixed: a
  // hold saved before the record kept its versions was the fix's only base, and Try again
  // released it before the fix was approved, so the fix was carried whole.
  it("carries a fix declared on a saved hold from its version after Try again released it", async () => {
    const at = host();
    const { page, held, record: saved } = await heldBatch(at);
    // The page goes back beside the fix, and the repair declares its own change the fix.
    let record = declared(withdraw(saved, page.taskId), "task-fix");
    // Try again releases the hold before the fix is approved.
    record = await recombined(at, release(record), AT + 30_000);
    expect(record.open?.hold).toBeUndefined();

    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    record = enqueue(record, fix);
    mainMoves(at);
    record = await recombined(at, record, AT + 60_000);

    expect(record.leftOut).toEqual([]);
    expect(record.open?.members.map((member) => member.taskId)).toEqual([
      "task-column",
      "task-fix",
    ]);
    expect(record.fixBases).toEqual({ "task-fix": held });
    const head = record.open?.head as string;
    expect(run(at.home, "show", `${head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total', 'time_zone'];",
    );
    expect(run(at.home, "ls-tree", "-r", "--name-only", head)).not.toContain("docs/report.md");
  });

  // Intent: the same piece, the independent review's later finding, a bug being fixed: an
  // approval that measured the fix from the held version while the retried batch was still
  // checking kept nothing, so a version approved in its place before the first combine was
  // carried whole, with the work of the change sent back.
  it("keeps the version an approval measured a fix from, so a replacement before its first combine is left out", async () => {
    const at = host();
    const { page, held, record: saved } = await heldBatch(at);
    let record = declared(withdraw(saved, page.taskId), "task-fix");
    // Try again releases the hold, and the retried batch checks without the fix.
    record = await recombined(at, release(record), AT + 30_000);
    expect(record.open?.hold).toBeUndefined();

    // Approved while it checks: its approval measured the fix from the held version.
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
      heldBase: held,
    };
    record = enqueue(record, fix);
    expect(record.fixBases).toEqual({ "task-fix": held });

    // Replaced before any combine by a version that squashed the batch's commits into its own.
    const rewritten: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: {
          "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n",
          "docs/report.md": "| date | total |\n",
        },
        approvedAt: 4_000,
      }),
      fix: true,
    };
    record = await recombined(at, enqueue(record, rewritten), AT + 60_000);

    expect(record.open?.members.map((member) => member.taskId)).toEqual(["task-column"]);
    expect(record.leftOut).toEqual([
      expect.objectContaining({ taskId: "task-fix", reason: LEFT_OUT_WORDS.fixBaseLost(held) }),
    ]);
    expect(run(at.home, "ls-tree", "-r", "--name-only", record.open?.head as string)).not.toContain(
      "docs/report.md",
    );
  });

  // Intent: the same piece, the independent review's third finding, a bug being fixed: a
  // joined fix replaced by a version whose inherited history was rewritten matched no held
  // version and was carried whole, with the work of the change sent back.
  it("leaves out a joined fix replaced by a version whose inherited history was rewritten", async () => {
    const at = host();
    const { page, held, record: saved } = await heldBatch(at);
    let record = declared(withdraw(saved, page.taskId), "task-fix");
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: { "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    record = await recombined(at, enqueue(record, fix), AT + 60_000);
    expect(record.fixBases).toEqual({ "task-fix": held });

    // The repair squashes the batch's commits into its own and pushes that in its place:
    // the page sent back rides along, on no version that held.
    const rewritten: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(report): name the column as the export does",
        files: {
          "src/report.ts": "export const rows = ['date', 'total', 'time_zone'];\n",
          "docs/report.md": "| date | total |\n",
        },
        approvedAt: 4_000,
      }),
      fix: true,
    };
    record = await recombined(at, enqueue(record, rewritten), AT + 120_000);

    expect(record.open?.members.map((member) => member.taskId)).toEqual(["task-column"]);
    expect(record.leftOut).toEqual([
      expect.objectContaining({ taskId: "task-fix", reason: LEFT_OUT_WORDS.fixBaseLost(held) }),
    ]);
    expect(run(at.home, "ls-tree", "-r", "--name-only", record.open?.head as string)).not.toContain(
      "docs/report.md",
    );
  });

  // Intent: the same piece, the independent review's fourth finding, a bug being fixed: a fix
  // left out on its first combine lost the version it was verified on, so a replacement that
  // rewrote its inherited history was carried whole, with the work of the change sent back.
  it("keeps the version a fix was verified on when its first combine left it out", async () => {
    const at = host();
    const { page, held, record: saved } = await heldBatch(at);
    let record = declared(withdraw(saved, page.taskId), "task-fix");
    // Its difference touches the page sent back beside it, so it does not combine.
    const clashing: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(docs): list the time zone column",
        files: { "docs/report.md": "| date | total | zone |\n" },
        from: `origin/${BATCH}`,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    record = await recombined(at, enqueue(release(record), clashing), AT + 60_000);
    expect(record.leftOut).toEqual([
      expect.objectContaining({ taskId: "task-fix", reason: LEFT_OUT_WORDS.fixClash(held) }),
    ]);
    expect(record.fixBases).toEqual({ "task-fix": held });

    // The repair pushes its new version from the default branch with the page folded in.
    const rewritten: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(docs): list the time zone column",
        files: { "docs/report.md": "| date | total | zone |\n" },
        approvedAt: 4_000,
      }),
      fix: true,
    };
    record = await recombined(at, enqueue(record, rewritten), AT + 120_000);
    expect(record.leftOut).toEqual([
      expect.objectContaining({ taskId: "task-fix", reason: LEFT_OUT_WORDS.fixBaseLost(held) }),
    ]);
    expect(run(at.home, "ls-tree", "-r", "--name-only", record.open?.head as string)).not.toContain(
      "docs/report.md",
    );
  });

  // Intent: the same piece, the independent review's fourth finding, a bug being fixed: one
  // unreadable version in the batch's history left out every fix, even one it never touched.
  it("passes over a version it cannot read, and leaves out only a fix whose own verified version is unreadable", async () => {
    const at = host();
    const { column, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(parser): read dates with a time zone",
        files: PARSER.files,
        approvedAt: 3_000,
      }),
      fix: true,
    };
    const unread = "0123456789abcdef0123456789abcdef01234567";
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, fix],
      at: AT + 60_000,
      held: [unread, held],
    });
    expect(result.leftOut).toEqual([]);
    expect(result.members.map((member) => member.taskId)).toEqual(["task-column", "task-fix"]);

    const pinned = { ...fix, heldBase: unread };
    const refused = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, pinned],
      at: AT + 120_000,
      held: [held],
    });
    expect(refused.leftOut).toEqual([
      { change: pinned, reason: LEFT_OUT_WORDS.fixBaseUnread(unread) },
    ]);
  });

  it("combines the ordinary way when it is built on the default branch", async () => {
    const at = host();
    const { column, page, held } = await heldBatch(at);
    const fix: BatchChange = {
      ...change(at, {
        taskId: "task-fix",
        title: "fix(parser): read dates with a time zone",
        files: PARSER.files,
        approvedAt: 3_000,
      }),
      fix: true,
    };

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [column, page, fix],
      at: AT + 60_000,
      held: [held],
    });

    expect(result.leftOut).toEqual([]);
    const [, second, third] = result.members.map((member) => member.commit) as [
      string,
      string,
      string,
    ];
    expect(run(at.home, "diff", "--name-only", second, third)).toBe("src/parser.ts");
  });
});

describe("a change rebuilt on an open batch's version", () => {
  // Intent: INF-6147's accepted plan, piece 1, from the captain's ask that batches stop paying
  // again and again to bring a large change up to date that never gets in: a change that
  // clashes with the open batch is rebuilt on its version while it runs, then goes right
  // behind that batch's changes, or first in the next batch once they merge, as one commit of
  // its own difference, and never with work that is not approved.
  const ROWS = {
    taskId: "task-rows",
    title: "feat(report): add a zone row",
    files: { "src/report.ts": "export const rows = ['date', 'total', 'zone'];\n" },
    approvedAt: 1_000,
  };
  const COUNT = {
    taskId: "task-count",
    title: "feat(report): add a count row",
    files: { "src/report.ts": "export const rows = ['date', 'total', 'count'];\n" },
    approvedAt: 500,
  };
  const BATCH = "infinitary-batch/6a2b";

  /** The rows change combined and pushed as the open batch, with the count change left out. */
  async function openBatch(at: Host) {
    const rows = change(at, ROWS);
    const count = change(at, COUNT);
    const first = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [rows, count],
      at: AT,
    });
    await pushBatch({ repoDir: at.home, branch: BATCH, head: first.head, expected: null });
    // Its crewmate rebuilds the count change on the batch's version, keeping both rows.
    const rebuilt: BatchChange = {
      ...change(at, {
        ...COUNT,
        files: { "src/report.ts": "export const rows = ['date', 'total', 'zone', 'count'];\n" },
        from: `origin/${BATCH}`,
      }),
      onBatch: { head: first.head, members: [{ taskId: rows.taskId, head: rows.head }] },
    };
    return { rows, count, first, rebuilt };
  }

  /** The default branch moves where the project lives, so the next combine re-makes every commit. */
  function mainMoves(at: Host): void {
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "README.md", "# Meter\n");
    run(at.work, "add", "-A");
    run(at.work, "commit", "-m", "docs: add a readme");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
  }

  // The independent review's finding: a rebuilt version is known from git's history, so one
  // whose repair came back to the captain still goes behind the batch it was built on.
  it("reads which open batch version a change's branch builds on, fetching a branch this clone does not hold yet", async () => {
    const at = host();
    const { first, rebuilt, count } = await openBatch(at);
    const ask = (entry: BatchChange) =>
      batchVersionIn({
        repoDir: at.home,
        branch: entry.branch,
        head: entry.head,
        versions: ["0".repeat(40), first.head],
      });
    expect(await ask(rebuilt)).toBe(first.head);
    expect(await ask(count)).toBeUndefined();
    expect(await ask({ ...rebuilt, head: "1".repeat(40) })).toBeNull();
  });

  it("tells a change waiting in line that clashes with the open batch's version, and not one that combines", async () => {
    const at = host();
    const rows = change(at, ROWS);
    const batch = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [rows],
      at: AT,
    });
    const count = change(at, { ...COUNT, approvedAt: 3_000 });
    const exported = change(at, EXPORT);

    const ask = (entry: BatchChange) =>
      clashesWithBatch({
        repoDir: at.home,
        branch: entry.branch,
        head: entry.head,
        batch: batch.head,
      });

    expect(await ask(count)).toBe(true);
    expect(await ask(exported)).toBe(false);
    // A batch version this clone does not hold cannot be told here.
    expect(
      await clashesWithBatch({
        repoDir: at.home,
        branch: count.branch,
        head: count.head,
        batch: "0".repeat(40),
      }),
    ).toBeUndefined();
  });

  it("is left out of the batch for its clash, then joins right behind that batch's change as its own difference when the batch is combined again", async () => {
    const at = host();
    const { rows, count, first, rebuilt } = await openBatch(at);
    expect(first.leftOut).toEqual([
      {
        change: count,
        reason: LEFT_OUT_WORDS.ahead(ROWS.title),
        ahead: "task-rows",
        clash: true,
      },
    ]);
    mainMoves(at);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [rows, rebuilt],
      at: AT + 60_000,
    });

    expect(result.leftOut).toEqual([]);
    expect(result.members.map((member) => member.taskId)).toEqual(["task-rows", "task-count"]);
    const [rowsCommit, countCommit] = result.members.map((member) => member.commit) as [
      string,
      string,
    ];
    // Its commit sits on the re-made rows commit and carries only its own row.
    expect(run(at.home, "rev-list", "--parents", "-n", "1", countCommit)).toBe(
      `${countCommit} ${rowsCommit}`,
    );
    expect(run(at.home, "diff", "--name-only", rowsCommit, countCommit)).toBe("src/report.ts");
    expect(run(at.home, "show", `${result.head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total', 'zone', 'count'];",
    );
    expect(run(at.home, "show", `${result.head}:README.md`)).toBe("# Meter");
    expect(run(at.home, "log", "-1", "--format=%s", countCommit)).toBe(COUNT.title);
  });

  it("goes as its own difference once the batch merged by a rebase, where merged the ordinary way it clashes", async () => {
    const at = host();
    const { rows, first, rebuilt } = await openBatch(at);
    // The batch merges by a rebase onto a default branch that moved: its commit is written again.
    mainMoves(at);
    run(at.work, "checkout", "--quiet", "-B", "rebased", `origin/${BATCH}`);
    run(at.work, "rebase", "--quiet", "main");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
    expect(run(at.work, "rev-parse", "HEAD")).not.toBe(first.head);

    const ordinary = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [{ ...rebuilt, onBatch: undefined }],
      at: AT + 120_000,
    });
    expect(ordinary.members).toEqual([]);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [rebuilt],
      at: AT + 120_000,
      mergedWith: (taskId) => (taskId === rows.taskId ? rows.head : undefined),
    });

    expect(result.leftOut).toEqual([]);
    expect(result.members.map((member) => member.taskId)).toEqual(["task-count"]);
    expect(run(at.home, "diff", "--name-only", result.base, result.head)).toBe("src/report.ts");
    expect(run(at.home, "show", `${result.head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total', 'zone', 'count'];",
    );
  });

  it("is left out, never carried with work that is not approved, once a change it was built on is neither ahead of it nor merged", async () => {
    const at = host();
    const { rebuilt } = await openBatch(at);
    const exported = change(at, EXPORT);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [exported, rebuilt],
      at: AT + 60_000,
    });

    expect(result.members.map((member) => member.taskId)).toEqual(["task-export"]);
    expect(result.leftOut).toEqual([
      {
        change: rebuilt,
        reason: LEFT_OUT_WORDS.batchChanged(rebuilt.onBatch?.head as string),
        clash: true,
      },
    ]);
    expect(run(at.home, "show", `${result.head}:src/report.ts`)).toBe(
      "export const rows = ['date', 'total'];",
    );
  });

  it("is left out when the change it was built on is ahead of it at another version", async () => {
    const at = host();
    const { rows, rebuilt } = await openBatch(at);
    const newer = change(at, {
      ...ROWS,
      files: { "src/report.ts": "export const rows = ['date', 'total', 'zone', 'tz'];\n" },
    });
    expect(newer.head).not.toBe(rows.head);

    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [newer, rebuilt],
      at: AT + 60_000,
    });

    expect(result.members.map((member) => member.taskId)).toEqual(["task-rows"]);
    expect(result.leftOut.map((entry) => entry.reason)).toEqual([
      LEFT_OUT_WORDS.batchChanged(rebuilt.onBatch?.head as string),
    ]);
  });
});

describe("pushing the batch branch the app owns", () => {
  it("pushes a new branch, then the next version over the one it pushed", async () => {
    const at = host();
    const first = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, PARSER)],
      at: AT,
    });
    await pushBatch({
      repoDir: at.home,
      branch: "infinitary-batch/7c41",
      head: first.head,
      expected: null,
    });
    expect(run(at.bare, "rev-parse", "infinitary-batch/7c41")).toBe(first.head);

    const second = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, EXPORT)],
      at: AT,
    });
    await pushBatch({
      repoDir: at.home,
      branch: "infinitary-batch/7c41",
      head: second.head,
      expected: first.head,
    });
    expect(run(at.bare, "rev-parse", "infinitary-batch/7c41")).toBe(second.head);
  });

  it("refuses a branch someone else moved, and never overwrites it", async () => {
    const at = host();
    const first = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, PARSER)],
      at: AT,
    });
    await pushBatch({
      repoDir: at.home,
      branch: "infinitary-batch/7c41",
      head: first.head,
      expected: null,
    });
    // A person pushes to the batch branch by hand.
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "checkout", "--quiet", "-B", "by-hand", "origin/infinitary-batch/7c41");
    write(at.work, "NOTES.md", "a note\n");
    run(at.work, "add", "-A");
    run(at.work, "commit", "-m", "docs: a note by hand");
    run(at.work, "push", "origin", "HEAD:refs/heads/infinitary-batch/7c41");
    const byHand = run(at.work, "rev-parse", "HEAD");

    const second = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, EXPORT)],
      at: AT,
    });
    await expect(
      pushBatch({
        repoDir: at.home,
        branch: "infinitary-batch/7c41",
        head: second.head,
        expected: first.head,
      }),
    ).rejects.toThrow();
    expect(run(at.bare, "rev-parse", "infinitary-batch/7c41")).toBe(byHand);
  });
});

describe("each member's own commit on the default branch after its batch merged", () => {
  async function pushed(at: Host) {
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, PARSER), change(at, EXPORT)],
      at: AT,
    });
    await pushBatch({
      repoDir: at.home,
      branch: "infinitary-batch/7c41",
      head: result.head,
      expected: null,
    });
    return result;
  }

  it("is the batch's own commit where the merge kept them, as a merge commit does", async () => {
    const at = host();
    const result = await pushed(at);
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    run(at.work, "merge", "--no-ff", "-m", "Merge the batch", "origin/infinitary-batch/7c41");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");

    const landed = await landedCommits({
      repoDir: at.home,
      defaultBranch: "main",
      members: result.members,
      merged: run(at.work, "rev-parse", "HEAD"),
    });

    expect([...landed]).toEqual(result.members.map((member) => [member.taskId, member.commit]));
  });

  it("is the commit a rebase merge wrote for it, read in the batch's order by its title", async () => {
    const at = host();
    const result = await pushed(at);
    // The default branch moved, so the host's rebase merge writes new commits.
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "README.md", "# Meter\n");
    run(at.work, "add", "-A");
    run(at.work, "commit", "-m", "docs: add a readme");
    run(at.work, "checkout", "--quiet", "-B", "rebased", "origin/infinitary-batch/7c41");
    run(at.work, "rebase", "--quiet", "main");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
    const tip = run(at.work, "rev-parse", "HEAD");

    const landed = await landedCommits({
      repoDir: at.home,
      defaultBranch: "main",
      members: result.members,
      merged: tip,
    });

    expect(landed.get("task-export")).toBe(tip);
    expect(landed.get("task-parser")).toBe(run(at.work, "rev-parse", "HEAD~1"));
    expect(landed.get("task-parser")).not.toBe(result.members[0]?.commit);
    expect(run(at.work, "log", "-1", "--format=%s", landed.get("task-parser") as string)).toBe(
      PARSER.title,
    );
  });

  // INF-5186 piece 5: Bitbucket's rebase merge (`rebase_merge`) writes the
  // batch's commits again on the default branch and then a merge commit over
  // them, so they sit under that commit's second parent.
  it("is the commit a rebase merge wrote for it under the merge commit it ended in", async () => {
    const at = host();
    const result = await pushed(at);
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "checkout", "--quiet", "-B", "main", "origin/main");
    write(at.work, "README.md", "# Meter\n");
    run(at.work, "add", "-A");
    run(at.work, "commit", "-m", "docs: add a readme");
    run(at.work, "checkout", "--quiet", "-B", "rebased", "origin/infinitary-batch/7c41");
    run(at.work, "rebase", "--quiet", "main");
    const rebased = run(at.work, "rev-parse", "HEAD");
    run(at.work, "checkout", "--quiet", "main");
    run(at.work, "merge", "--quiet", "--no-ff", "-m", "Merged in infinitary-batch/7c41", "rebased");
    run(at.work, "push", "origin", "HEAD:refs/heads/main");
    const mergeCommit = run(at.work, "rev-parse", "HEAD");

    const landed = await landedCommits({
      repoDir: at.home,
      defaultBranch: "main",
      members: result.members,
      merged: mergeCommit,
    });

    expect(landed.get("task-export")).toBe(rebased);
    expect(landed.get("task-parser")).toBe(run(at.work, "rev-parse", `${rebased}~1`));
    expect(landed.get("task-parser")).not.toBe(result.members[0]?.commit);
  });

  it("names no commit when the default branch does not hold the batch", async () => {
    const at = host();
    const result = await pushed(at);

    const landed = await landedCommits({
      repoDir: at.home,
      defaultBranch: "main",
      members: result.members,
    });

    expect([...landed.values()]).toEqual([undefined, undefined]);
  });
});

// Intent: the independent review's finding on this change, a bug being fixed: every writer
// of a project's batch waits behind its fetches and pushes, so a remote that stops
// answering has to end the call, and a change is never left out for a slow remote.
describe("a place the project lives that stops answering", () => {
  it("ends the combine at the time limit, and leaves out no change whose branch it could not read in time", async () => {
    const at = host();
    const approved = change(at, PARSER);
    // The default branch is read; the change's own branch never answers.
    const gaveUp = goesSilent(at, 1);

    await expect(
      combine({
        repoDir: at.home,
        defaultBranch: "main",
        changes: [approved],
        at: AT,
        timeoutMs: SOON,
      }),
    ).rejects.toMatchObject({ killed: true });
    expect(gaveUp()).toBe(false);
  });

  it("ends the combine too when the branch a stacked change builds on never answers", async () => {
    const at = host();
    const parser = change(at, PARSER);
    const stacked: BatchChange = {
      ...change(at, {
        taskId: "task-zones",
        title: "feat(parser): name the time zone in errors",
        files: { "src/zones.ts": "export const zone = 'UTC';\n" },
        from: parser.head,
        approvedAt: 3_000,
      }),
      base: parser.branch,
    };
    // The default branch and the change's own branch are read; the branch it builds on never answers.
    const gaveUp = goesSilent(at, 2);

    await expect(
      combine({
        repoDir: at.home,
        defaultBranch: "main",
        changes: [stacked],
        at: AT,
        timeoutMs: SOON,
      }),
    ).rejects.toMatchObject({ killed: true });
    expect(gaveUp()).toBe(false);
  });

  it("ends the push of the batch branch at the time limit", async () => {
    const at = host();
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, PARSER)],
      at: AT,
    });
    const gaveUp = goesSilent(at, 0);

    await expect(
      pushBatch({
        repoDir: at.home,
        branch: "infinitary-batch/7c41",
        head: result.head,
        expected: null,
        timeoutMs: SOON,
      }),
    ).rejects.toMatchObject({ killed: true });
    expect(gaveUp()).toBe(false);
    expect(run(at.bare, "branch", "--list", "infinitary-batch/*")).toBe("");
  });

  it("names no merged commit it could not read in time", async () => {
    const at = host();
    const result = await combine({
      repoDir: at.home,
      defaultBranch: "main",
      changes: [change(at, PARSER)],
      at: AT,
    });
    await pushBatch({
      repoDir: at.home,
      branch: "infinitary-batch/7c41",
      head: result.head,
      expected: null,
    });
    // The batch merged keeping its commit, which an answering host would name.
    run(at.work, "fetch", "--quiet", "origin");
    run(at.work, "push", "origin", "origin/infinitary-batch/7c41:refs/heads/main");
    const gaveUp = goesSilent(at, 0);

    const landed = await landedCommits({
      repoDir: at.home,
      defaultBranch: "main",
      members: result.members,
      timeoutMs: SOON,
    });

    expect([...landed.values()]).toEqual([undefined]);
    expect(gaveUp()).toBe(false);
  });
});
