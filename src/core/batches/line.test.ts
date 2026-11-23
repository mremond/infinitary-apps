import {
  BATCH_STATUS_WORDS,
  type BatchChange,
  type BatchMember,
  type BatchRecord,
  EMPTY_BATCH_RECORD,
  FINISHED_BATCH_KEPT_MS,
} from "@shared/batches";
import { describe, expect, it } from "vitest";
import { BATCH_WAITING_WORDS } from "../forge";
import { type Combined, LEFT_OUT_WORDS } from "./combine";
import {
  abandoned,
  batchStatus,
  builtOnBatch,
  carried,
  clashesEnded,
  combined,
  enqueue,
  finishedWithin,
  fixWaits,
  forms,
  hold,
  merged,
  pruned,
  rebuildTold,
  release,
  reopened,
  repaired,
  reworded,
  standing,
  toldRebuild,
  withdraw,
} from "./line";

// Intent: the captain's approved plan for batches of their own, piece 1: a project's line
// of approved changes and its one open batch, as the rules its done-when list names - the
// formation rule, a change left out, two changes sent back, a fix ending a hold, an
// approval withdrawn and receipts.

const BASE = "9d1c7e2a4b6f8091a3c5e7d9f1b3a5c7e9d1f3b5";
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

const member = (change: BatchChange, commit: string): BatchMember => ({ ...change, commit });
const PARSER_COMMIT = "1111111111111111111111111111111111111111";
const EXPORT_COMMIT = "2222222222222222222222222222222222222222";
const LEGEND_COMMIT = "3333333333333333333333333333333333333333";

/** What a combine of `changes` onto the default branch answers, the last commit its version. */
function combineOf(members: BatchMember[], leftOut: Combined["leftOut"] = []): Combined {
  return { base: BASE, head: members.at(-1)?.commit ?? BASE, members, leftOut };
}

/** Two approved changes combined and opened as pull request #31. */
function openBatch(): BatchRecord {
  const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), EXPORT);
  const pushed = combined(
    line,
    combineOf([member(PARSER, PARSER_COMMIT), member(EXPORT, EXPORT_COMMIT)]),
    { branch: "infinitary-batch/7c41", at: 5_000 },
  );
  return {
    ...pushed,
    open: {
      ...(pushed.open as NonNullable<BatchRecord["open"]>),
      number: 31,
      url: "https://github.com/acme/meter/pull/31",
    },
  };
}

describe("the formation rule", () => {
  it("forms a batch once one change is in line and none of this home's is open", () => {
    expect(forms(EMPTY_BATCH_RECORD)).toBe(false);
    expect(forms(enqueue(EMPTY_BATCH_RECORD, PARSER))).toBe(true);
  });

  it("keeps changes approved meanwhile in line while a batch is open", () => {
    const waiting = enqueue(openBatch(), LEGEND);
    expect(forms(waiting)).toBe(false);
    expect(waiting.line).toEqual([LEGEND]);
    expect(standing(waiting, LEGEND.taskId, LEGEND.head)).toEqual({
      state: "waiting",
      place: "line",
    });
  });

  it("takes the whole line, in approval order, whatever order the approvals were saved in", () => {
    const line = enqueue(enqueue(enqueue(EMPTY_BATCH_RECORD, LEGEND), PARSER), EXPORT);
    expect(carried(line).map((change) => change.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-legend",
    ]);
  });
});

// Intent: the captain's approved plan to run a batched project's batch check less often
// (piece 1, "Approve and build"): with a batch gap, changes approved after a batch formed
// wait and go up together once the gap from that batch's start has passed; a held batch's
// repair never waits; with no gap a batch forms at once, as before.
describe("the batch gap", () => {
  const HOURS_3 = 180;
  const GAP_MS = HOURS_3 * 60_000;

  /** The open batch #31, formed at 5_000, merged at 8_000, then two changes approved. */
  function afterMerge(): BatchRecord {
    const done = merged(openBatch(), new Map(), 8_000);
    return enqueue(enqueue(done, { ...LEGEND, at: 9_000 }), {
      ...PARSER,
      head: EXPORT_COMMIT,
      at: 10_000,
    });
  }

  it("keeps two approvals in line until the gap from the last batch's start has passed, then takes both", () => {
    const record = afterMerge();
    expect(record.formed).toBe(5_000);
    expect(forms(record, HOURS_3, 10_000)).toBe(false);
    expect(forms(record, HOURS_3, 5_000 + GAP_MS - 1)).toBe(false);
    expect(forms(record, HOURS_3, 5_000 + GAP_MS)).toBe(true);
    const next = combined(
      record,
      combineOf([
        member(LEGEND, LEGEND_COMMIT),
        member({ ...PARSER, head: EXPORT_COMMIT }, PARSER_COMMIT),
      ]),
      { branch: "infinitary-batch/9a02", at: 5_000 + GAP_MS },
    );
    expect(next.open?.members.map((entry) => entry.taskId)).toEqual(["t-legend", "t-parser"]);
    expect(next.formed).toBe(5_000 + GAP_MS);
  });

  it("forms at once with no gap, or when the project has had no batch yet", () => {
    expect(forms(afterMerge(), undefined, 10_000)).toBe(true);
    expect(forms(enqueue(EMPTY_BATCH_RECORD, PARSER), HOURS_3, 1_000)).toBe(true);
  });

  it("moves nothing when the open batch is combined again, as a held batch's repair does", () => {
    const held = hold(openBatch(), {
      at: 6_000,
      head: EXPORT_COMMIT,
      reason: "checks",
      checks: ["typecheck-lint-build"],
    }).record;
    const fixed = enqueue(held, { ...LEGEND, fix: true, at: 7_000 });
    // The repair answers the open batch, which the gap never holds: its fix joins at once.
    expect(fixWaits(fixed)).toBe(true);
    const again = combined(
      release(fixed),
      combineOf([
        member(PARSER, PARSER_COMMIT),
        member(EXPORT, EXPORT_COMMIT),
        member(LEGEND, LEGEND_COMMIT),
      ]),
      { branch: "infinitary-batch/7c41", at: 7_500 },
    );
    expect(again.open?.members).toHaveLength(3);
    expect(again.formed).toBe(5_000);
  });
});

describe("a combine's result on the record", () => {
  it("opens the batch with one commit per change and empties the line of what it carried", () => {
    const record = openBatch();
    expect(record.line).toEqual([]);
    expect(record.open).toMatchObject({
      branch: "infinitary-batch/7c41",
      head: EXPORT_COMMIT,
      base: BASE,
      members: [
        { taskId: "t-parser", commit: PARSER_COMMIT },
        { taskId: "t-export", commit: EXPORT_COMMIT },
      ],
      since: 5_000,
    });
  });

  it("leaves a change out with its reason while the rest go on", () => {
    const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), EXPORT);
    const reason = "it no longer combines with the default branch";
    const record = combined(
      line,
      combineOf([member(PARSER, PARSER_COMMIT)], [{ change: EXPORT, reason }]),
      { branch: "infinitary-batch/7c41", at: 5_000 },
    );
    expect(record.open?.members.map((entry) => entry.taskId)).toEqual(["t-parser"]);
    expect(record.line).toEqual([]);
    expect(standing(record, EXPORT.taskId, EXPORT.head)).toEqual({ state: "left-out", reason });
    expect(batchStatus({ state: "left-out", reason })).toEqual({
      kind: "failed",
      words: BATCH_STATUS_WORDS.leftOut(reason),
    });
    // A new version of that change joins the line again and its note goes.
    const repaired = enqueue(record, { ...EXPORT, head: LEGEND.head, at: 6_000 });
    expect(repaired.leftOut).toEqual([]);
    expect(repaired.line.map((change) => change.head)).toEqual([LEGEND.head]);
  });

  // Intent: INF-4517's plan, piece 2 (the captain's "Approve and build"): a change that
  // clashes only with a change ahead asks nothing of its crewmate until that clash ends.
  it("keeps a clash with a change ahead while that change waits in the batch or back in line", () => {
    const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), EXPORT);
    const reason = "it clashes with a change ahead";
    const record = combined(
      line,
      combineOf([member(PARSER, PARSER_COMMIT)], [{ change: EXPORT, reason, ahead: "t-parser" }]),
      { branch: "infinitary-batch/7c41", at: 5_000 },
    );
    const place = standing(record, EXPORT.taskId, EXPORT.head);
    expect(place).toEqual({ state: "left-out", reason, ahead: "t-parser" });
    expect(batchStatus(place as NonNullable<typeof place>).kind).toBe("paused");
    // In the open batch, and back in line after its pull request closed unmerged, it is still ahead.
    expect(clashesEnded(record, "conflict").ended).toEqual([]);
    expect(clashesEnded(reopened(record), "conflict").ended).toEqual([]);
  });

  it("opens no batch when nothing combined", () => {
    const line = enqueue(EMPTY_BATCH_RECORD, PARSER);
    const record = combined(
      line,
      combineOf([], [{ change: PARSER, reason: "it changes nothing" }]),
      {
        branch: "infinitary-batch/7c41",
        at: 5_000,
      },
    );
    expect(record.open).toBeUndefined();
    expect(forms(record)).toBe(false);
  });

  it("keeps the pull request and its start when the open batch is combined again", () => {
    const again = combined(
      openBatch(),
      combineOf([member(PARSER, LEGEND_COMMIT), member(EXPORT, PARSER_COMMIT)]),
      { branch: "infinitary-batch/7c41", at: 9_000 },
    );
    expect(again.open).toMatchObject({ number: 31, since: 5_000, head: PARSER_COMMIT });
    expect(again.open?.hold).toBeUndefined();
  });
});

describe("a held batch", () => {
  const failed = {
    at: 6_000,
    head: EXPORT_COMMIT,
    reason: "checks" as const,
    checks: ["unit-tests"],
  };

  it("is told to its owner once for each held version", () => {
    const first = hold(openBatch(), failed);
    expect(first.fresh).toBe(true);
    expect(hold(first.record, { ...failed, at: 7_000 }).fresh).toBe(false);
    expect(hold(first.record, { ...failed, head: LEGEND_COMMIT }).fresh).toBe(true);
  });

  // Intent: the captain's approved plan to stop changes bouncing between batches, piece 3:
  // a fix built on a version that held can join the batch after it is combined again.
  it("keeps every version that held, newest first, through each combine and a batch put back in line", () => {
    const first = hold(openBatch(), failed).record;
    const again = combined(
      release(first),
      combineOf([member(PARSER, PARSER_COMMIT), member(EXPORT, LEGEND_COMMIT)]),
      { branch: "infinitary-batch/7c41", at: 7_000 },
    );
    expect(again.held).toEqual([EXPORT_COMMIT]);
    const second = hold(again, { ...failed, head: LEGEND_COMMIT }).record;
    expect(second.held).toEqual([LEGEND_COMMIT, EXPORT_COMMIT]);
    // A batch closed where the project lives keeps them for the line.
    expect(reopened(second).held).toEqual([LEGEND_COMMIT, EXPORT_COMMIT]);
  });

  it("reads as held for each change of several, and as failed for its only change", () => {
    const several = hold(openBatch(), failed).record;
    expect(standing(several, PARSER.taskId, PARSER.head)).toMatchObject({
      state: "waiting",
      place: "held",
      number: 31,
    });
    expect(batchStatus(standing(several, PARSER.taskId, PARSER.head) as never)).toEqual({
      kind: "paused",
      words: BATCH_STATUS_WORDS.held("checks"),
      link: "https://github.com/acme/meter/pull/31",
    });
    // A batch a rule of the default branch holds says that, never that its checks failed.
    const blocked = hold(openBatch(), { ...failed, reason: "rules", checks: [] }).record;
    expect(batchStatus(standing(blocked, PARSER.taskId, PARSER.head) as never)).toEqual({
      kind: "paused",
      words: BATCH_STATUS_WORDS.held("rules"),
      link: "https://github.com/acme/meter/pull/31",
    });
    const one = hold(withdraw(openBatch(), EXPORT.taskId), failed).record;
    expect(standing(one, PARSER.taskId, PARSER.head)).toMatchObject({
      state: "failed",
      checks: ["unit-tests"],
    });
  });

  it("sends two changes back: both leave, and the rest combine again with the line", () => {
    let record = hold(
      enqueue(enqueue(openBatch(), LEGEND), { ...LEGEND, taskId: "t-axis", at: 4_000 }),
      failed,
    ).record;
    record = withdraw(withdraw(record, PARSER.taskId), EXPORT.taskId);
    expect(record.open?.members).toEqual([]);
    expect(record.open?.stale).toBe(true);
    expect(carried(record, "line").map((change) => change.taskId)).toEqual(["t-legend", "t-axis"]);
    expect(standing(record, PARSER.taskId, PARSER.head)).toBeUndefined();
  });

  // Intent: the captain's direction that a held batch's repair takes "everything waiting
  // plus the fix, without asking".
  it("ends by a declared fix: the fix joins right behind the members, and the rest of the line behind it", () => {
    const held = hold(openBatch(), failed).record;
    const fix = {
      ...LEGEND,
      taskId: "t-fix",
      title: "fix(parser): keep the renamed column for the export",
      at: 4_000,
      fix: true as const,
    };
    const withLine = enqueue(enqueue(held, LEGEND), fix);
    expect(fixWaits(withLine)).toBe(true);
    expect(fixWaits(enqueue(held, LEGEND))).toBe(false);
    expect(carried(withLine, "line").map((change) => change.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-fix",
      "t-legend",
    ]);
    const fixed = combined(
      release(withLine),
      combineOf([
        member(PARSER, PARSER_COMMIT),
        member(EXPORT, EXPORT_COMMIT),
        member(fix, LEGEND_COMMIT),
        member(LEGEND, "4444444444444444444444444444444444444444"),
      ]),
      { branch: "infinitary-batch/7c41", at: 8_000 },
    );
    expect(fixed.open?.hold).toBeUndefined();
    expect(fixed.line).toEqual([]);
  });

  it("ends when its checks run again", () => {
    const held = hold(openBatch(), failed).record;
    expect(release(held).open?.hold).toBeUndefined();
    expect(release(openBatch())).toEqual(openBatch());
  });
});

// Intent: the captain's ask that the Batches panel make a held batch's actual state clear
// without implying the captain must answer it: the app records which task repairs the hold.
describe("a held batch's repair", () => {
  const failed = {
    at: 6_000,
    head: EXPORT_COMMIT,
    reason: "checks" as const,
    checks: ["unit-tests"],
  };

  it("is recorded only while the batch is held", () => {
    const held = hold(openBatch(), failed).record;
    expect(repaired(held, "t-repair").open?.repair).toBe("t-repair");
    expect(repaired(openBatch(), "t-repair")).toEqual(openBatch());
    expect(repaired(EMPTY_BATCH_RECORD, "t-repair")).toBe(EMPTY_BATCH_RECORD);
  });

  it("stays the repair while its repair combines the same batch again", () => {
    const held = repaired(hold(openBatch(), failed).record, "t-repair");
    const again = combined(
      release(held),
      combineOf([member(PARSER, PARSER_COMMIT), member(EXPORT, LEGEND_COMMIT)]),
      { branch: "infinitary-batch/7c41", at: 7_000 },
    );
    expect(again.open?.repair).toBe("t-repair");
  });

  it("is dropped once its task closes, and the batch stays held", () => {
    const held = repaired(hold(openBatch(), failed).record, "t-repair");
    expect(pruned(held, () => true)).toBe(held);
    const closed = pruned(held, (taskId) => taskId !== "t-repair");
    expect(closed.open?.repair).toBeUndefined();
    expect(closed.open?.hold).toEqual(held.open?.hold);
  });
});

describe("an approval withdrawn", () => {
  it("takes the change out of the line", () => {
    const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), EXPORT);
    expect(withdraw(line, PARSER.taskId).line).toEqual([EXPORT]);
  });

  it("takes the change out of the open batch, which combines again without it", () => {
    const record = withdraw(openBatch(), PARSER.taskId);
    expect(record.open?.members.map((entry) => entry.taskId)).toEqual(["t-export"]);
    expect(record.open?.stale).toBe(true);
    expect(standing(record, PARSER.taskId, PARSER.head)).toBeUndefined();
  });

  it("carries only the newly approved version of a change approved again", () => {
    const next = { ...PARSER, head: LEGEND.head, at: 7_000 };
    const record = enqueue(openBatch(), next);
    expect(record.open?.members.map((entry) => entry.taskId)).toEqual(["t-export"]);
    expect(record.line).toEqual([next]);
    // The same approved version is put in line once.
    expect(enqueue(record, next)).toBe(record);
  });
});

// Intent: INF-4517 piece 3, the captain's "a part starts \"When the part before it is approved
// to merge\"": a later part built on its base's approved version waits in line, with no
// left-out note, until its base's work is carried ahead of it or merged.
describe("a change built on another change's approved version", () => {
  const PANEL: BatchChange = {
    taskId: "t-panel",
    branch: "fm/task-panel",
    head: "7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c4b3a",
    title: "feat(export): show the CSV export in the report panel",
    body: "- The report panel offers the CSV export.",
    at: 1_500,
    base: EXPORT.branch,
    after: EXPORT.taskId,
  };

  it("waits in line while its base is not ahead of it, with no left-out note", () => {
    const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), PANEL);
    expect(carried(line).map((change) => change.taskId)).toEqual(["t-parser"]);
    expect(line.leftOut).toEqual([]);
  });

  it("goes right behind its base, whatever order the approvals came in", () => {
    const line = enqueue(enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), PANEL), EXPORT);
    expect(carried(line).map((change) => change.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-panel",
    ]);
  });

  it("joins a later batch behind its base's open batch, and as its own change once the base merged", () => {
    const waiting = enqueue(openBatch(), PANEL);
    expect(carried(waiting, "line").map((change) => change.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-panel",
    ]);
    const later = { ...EMPTY_BATCH_RECORD, line: [PANEL] };
    expect(carried(later)).toEqual([]);
    // The combine checks it against the version its base merged at.
    expect(carried(later, "none", (taskId) => taskId === EXPORT.taskId)).toEqual([PANEL]);
  });

  it("goes back in line, with no left-out note, when its base is left out of the combine", () => {
    const left = { change: EXPORT, reason: LEFT_OUT_WORDS.conflict };
    const joined = combined(
      enqueue(enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), PANEL), EXPORT),
      { ...combineOf([member(PARSER, PARSER_COMMIT)]), leftOut: [left], waiting: [PANEL] },
      { branch: "infinitary-batch/7c41", at: 6_000 },
    );
    expect(joined.open?.members.map((entry) => entry.taskId)).toEqual(["t-parser"]);
    expect(joined.line).toEqual([PANEL]);
    expect(joined.leftOut.map((entry) => entry.taskId)).toEqual([EXPORT.taskId]);
  });

  it("goes back in line when its base leaves the open batch", () => {
    const joined = combined(
      enqueue(openBatch(), PANEL),
      combineOf([
        member(PARSER, PARSER_COMMIT),
        member(EXPORT, EXPORT_COMMIT),
        member(PANEL, LEGEND_COMMIT),
      ]),
      { branch: "infinitary-batch/7c41", at: 6_000 },
    );
    const after = withdraw(joined, EXPORT.taskId);
    expect(after.open?.members.map((entry) => entry.taskId)).toEqual(["t-parser"]);
    expect(after.line.map((change) => change.taskId)).toEqual(["t-panel"]);
    expect(carried(after, "line").map((change) => change.taskId)).toEqual(["t-parser"]);
  });
});

describe("a change rebuilt on an open batch", () => {
  // Intent: INF-6147's accepted plan, piece 1, from the captain's ask that batches stop paying
  // again and again to bring a large change up to date that never gets in: a change that
  // clashes with the open batch has its crewmate told once to rebuild it on the batch's
  // version, and the rebuilt version waits right behind that batch's changes and goes first
  // in the next batch. This reverses INF-4517's quiet wait for a clash with a change ahead.
  const reason = "it clashes with a change ahead";
  const BATCH_HEAD = EXPORT_COMMIT;
  /** PARSER and EXPORT open as #31, with LEGEND left out for a clash with PARSER. */
  function leftOut(): BatchRecord {
    const open = openBatch();
    return {
      ...open,
      leftOut: [{ taskId: LEGEND.taskId, head: LEGEND.head, reason, at: 5_000, ahead: "t-parser" }],
    };
  }
  const AXIS_CHANGE: BatchChange = { ...EXPORT, taskId: "t-axis", head: "7".repeat(40), at: 7_000 };
  const REBUILT: BatchChange = {
    ...LEGEND,
    head: "4444444444444444444444444444444444444444",
    // Approved before both changes in the batch, so approval order alone would put it first.
    at: 500,
  };

  it("tells its crewmate once per version of the change and set of changes in the batch", () => {
    const first = toldRebuild(leftOut(), LEGEND, 6_000);
    expect(first.fresh).toBe(true);
    expect(first.told).toEqual({
      taskId: LEGEND.taskId,
      head: LEGEND.head,
      on: BATCH_HEAD,
      branch: "infinitary-batch/7c41",
      members: [
        { taskId: PARSER.taskId, head: PARSER.head },
        { taskId: EXPORT.taskId, head: EXPORT.head },
      ],
      at: 6_000,
    });
    expect(rebuildTold(first.record, LEGEND)).toBe(true);
    // The left-out change reads the version it was told while that batch is open, and waits.
    const place = standing(first.record, LEGEND.taskId, LEGEND.head);
    expect(place).toEqual({
      state: "left-out",
      reason,
      ahead: "t-parser",
      rebuild: { head: BATCH_HEAD, branch: "infinitary-batch/7c41" },
    });
    expect(batchStatus(place as NonNullable<typeof place>).kind).toBe("paused");
    expect(toldRebuild(first.record, LEGEND, 7_000).fresh).toBe(false);
    // The batch combined again with the same changes tells nothing new.
    const recombined: BatchRecord = {
      ...first.record,
      open: { ...(first.record.open as NonNullable<BatchRecord["open"]>), head: "5".repeat(40) },
    };
    expect(toldRebuild(recombined, LEGEND, 8_000).fresh).toBe(false);
    // A change leaving the batch is a new set: its crewmate hears again.
    const fewer = withdraw(first.record, EXPORT.taskId);
    expect(rebuildTold(fewer, LEGEND)).toBe(false);
    expect(toldRebuild(fewer, LEGEND, 9_000).fresh).toBe(true);
  });

  it("asks for nothing once the batch it names is no longer open", () => {
    const told = toldRebuild(leftOut(), LEGEND, 6_000).record;
    const { open: _open, ...ended } = told;
    expect(standing(ended, LEGEND.taskId, LEGEND.head)).toEqual({
      state: "left-out",
      reason,
      ahead: "t-parser",
    });
    expect(toldRebuild(ended, LEGEND, 7_000)).toEqual({ record: ended, fresh: false });
  });

  it("enters the line built on the batch version it was told, or on the open batch's version, and on no other", () => {
    const told = toldRebuild(leftOut(), LEGEND, 6_000).record;
    const members = [
      { taskId: PARSER.taskId, head: PARSER.head },
      { taskId: EXPORT.taskId, head: EXPORT.head },
    ];
    expect(builtOnBatch(told, LEGEND.taskId, BATCH_HEAD)).toEqual({ head: BATCH_HEAD, members });
    expect(builtOnBatch(openBatch(), LEGEND.taskId, BATCH_HEAD)).toEqual({
      head: BATCH_HEAD,
      members,
    });
    expect(builtOnBatch(told, LEGEND.taskId, BASE)).toBeUndefined();
    const line = enqueue(told, { ...REBUILT, onBatch: { head: BATCH_HEAD, members } });
    expect(line.leftOut).toEqual([]);
    expect(line.line.map((entry) => entry.head)).toEqual([REBUILT.head]);
  });

  it("joins right behind the batch's changes when the open batch is combined again, and only while they are in it", () => {
    const record = enqueue(enqueue(openBatch(), LEGEND), {
      ...REBUILT,
      taskId: "t-axis",
      onBatch: {
        head: BATCH_HEAD,
        members: [
          { taskId: PARSER.taskId, head: PARSER.head },
          { taskId: EXPORT.taskId, head: EXPORT.head },
        ],
      },
    });
    expect(carried(record).map((entry) => entry.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-axis",
    ]);
    // A change it was built on left the batch: it waits in line for the combine to judge.
    expect(carried(withdraw(record, EXPORT.taskId)).map((entry) => entry.taskId)).toEqual([
      "t-parser",
    ]);
    // When the line joins a held batch, it goes behind the declared fixes and ahead of the rest.
    const fix = { ...LEGEND, taskId: "t-fix", fix: true as const, at: 9_000 };
    expect(carried(enqueue(record, fix), "line").map((entry) => entry.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-fix",
      "t-axis",
      "t-legend",
    ]);
  });

  it("goes first in the next batch once the batch merged, and behind its changes when they went back in line", () => {
    const rebuilt = {
      ...REBUILT,
      at: 4_000,
      onBatch: {
        head: BATCH_HEAD,
        members: [
          { taskId: PARSER.taskId, head: PARSER.head },
          { taskId: EXPORT.taskId, head: EXPORT.head },
        ],
      },
    };
    const early = { ...PARSER, taskId: "t-early", head: "6".repeat(40), at: 100 };
    const withLine = enqueue(enqueue(openBatch(), early), rebuilt);
    const merged_ = merged(withLine, new Map(), 9_000);
    expect(carried(merged_).map((entry) => entry.taskId)).toEqual(["t-legend", "t-early"]);
    // Closed unmerged, the batch's changes go back to the front: it still goes behind them.
    expect(carried(reopened(withLine)).map((entry) => entry.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-legend",
      "t-early",
    ]);
  });

  // The captain's answer to the review's question: let the first rebuild stand, so the change
  // goes first next batch, when the batch merges before the rebuilt version arrives.
  it("lets the rebuild stand once its batch merged with each change it was told about, and only then", () => {
    const told = toldRebuild(leftOut(), LEGEND, 6_000).record;
    const done = merged(told, new Map(), 9_000);
    expect(done.rebuilds?.[0]?.merged).toBe(true);
    expect(standing(done, LEGEND.taskId, LEGEND.head)).toMatchObject({
      state: "left-out",
      rebuild: { head: BATCH_HEAD, branch: "infinitary-batch/7c41" },
    });
    // Its clash with the change ahead ended with that merge, with nothing more to say.
    expect(clashesEnded(done, "conflict").ended).toEqual([
      { taskId: LEGEND.taskId, head: LEGEND.head, ahead: "t-parser", how: "merged", rebuilt: true },
    ]);
    // Waiting in line at the clashing version, it stays out of every batch until replaced.
    const waiting = { ...done, leftOut: [], line: [LEGEND, AXIS_CHANGE] };
    expect(carried(waiting).map((entry) => entry.taskId)).toEqual([AXIS_CHANGE.taskId]);
    expect(standing(waiting, LEGEND.taskId, LEGEND.head)).toEqual({
      state: "left-out",
      reason: LEFT_OUT_WORDS.batchMerged(BATCH_HEAD),
      rebuild: { head: BATCH_HEAD, branch: "infinitary-batch/7c41" },
    });
    expect(carried({ ...waiting, line: [REBUILT] }).map((entry) => entry.head)).toEqual([
      REBUILT.head,
    ]);

    // A batch that merged without a change it was told about leaves the rebuild unstood.
    const fewer = merged(withdraw(told, EXPORT.taskId), new Map(), 9_000);
    expect(fewer.rebuilds?.[0]?.merged).toBeUndefined();
    expect(standing(fewer, LEGEND.taskId, LEGEND.head)).not.toHaveProperty("rebuild");
  });

  it("drops what its crewmate was told once its task closes", () => {
    const told = toldRebuild(leftOut(), LEGEND, 6_000).record;
    const record = pruned(told, (taskId) => taskId !== LEGEND.taskId);
    expect(record.rebuilds).toBeUndefined();
    expect(pruned(told, () => true)).toBe(told);
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

  it("keeps a waiting change's place in line and gives it the story's title and words", () => {
    const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), EXPORT);
    const record = reworded(line, RETITLED);
    expect(record.line).toEqual([{ ...PARSER, ...RETITLED }, EXPORT]);
    expect(standing(record, PARSER.taskId, PARSER.head)).toEqual({
      state: "waiting",
      place: "line",
    });
  });

  it("keeps a batch's change in its place, and has the batch combined again so its commit says the new words", () => {
    const held = hold(openBatch(), {
      at: 6_000,
      head: EXPORT_COMMIT,
      reason: "checks",
      checks: ["unit-tests"],
    }).record;
    const record = reworded(held, RETITLED);
    expect(record.open?.members).toEqual([
      { ...member(PARSER, PARSER_COMMIT), ...RETITLED },
      member(EXPORT, EXPORT_COMMIT),
    ]);
    expect(record.open?.stale).toBe(true);
    // The next combine carries the same changes in the same order, under the new words.
    expect(carried(record).map((change) => change.title)).toEqual([RETITLED.title, EXPORT.title]);
    // No change was sent back: each still reads its place in the held batch.
    expect(standing(record, PARSER.taskId, PARSER.head)).toMatchObject({ place: "held" });
    expect(standing(record, EXPORT.taskId, EXPORT.head)).toMatchObject({ place: "held" });
  });

  it("leaves the batch at its version when the story's title and commit words read as they did", () => {
    const record = reworded(openBatch(), {
      taskId: PARSER.taskId,
      head: PARSER.head,
      title: PARSER.title,
      body: PARSER.body,
    });
    expect(record).toEqual(openBatch());
    expect(record.open?.stale).toBeUndefined();
  });

  it("carries no other version of the task: one confirmed at another version leaves, as a withdrawn one does", () => {
    const elsewhere = { ...RETITLED, head: LEGEND.head };
    expect(reworded(openBatch(), elsewhere)).toEqual(withdraw(openBatch(), PARSER.taskId));
    const line = enqueue(enqueue(EMPTY_BATCH_RECORD, PARSER), EXPORT);
    expect(reworded(line, elsewhere).line).toEqual([EXPORT]);
  });
});

describe("receipts", () => {
  it("gives each member its own commit on the default branch once the batch merged", () => {
    const landed = new Map([
      [PARSER.taskId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      [EXPORT.taskId, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    ]);
    const record = merged(enqueue(openBatch(), LEGEND), landed, 9_000);
    expect(record.open).toBeUndefined();
    expect(record.receipts).toEqual([
      {
        taskId: "t-parser",
        head: PARSER.head,
        sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        number: 31,
        url: "https://github.com/acme/meter/pull/31",
        at: 9_000,
      },
      {
        taskId: "t-export",
        head: EXPORT.head,
        sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        number: 31,
        url: "https://github.com/acme/meter/pull/31",
        at: 9_000,
      },
    ]);
    expect(standing(record, EXPORT.taskId, EXPORT.head)).toMatchObject({ state: "merged" });
    expect(batchStatus(standing(record, EXPORT.taskId, EXPORT.head) as never)).toEqual({
      kind: "passed",
      words: BATCH_STATUS_WORDS.merged,
      link: "https://github.com/acme/meter/pull/31",
    });
    // The next batch forms from what waited.
    expect(forms(record)).toBe(true);
  });

  it("names no commit it could not read, never a guessed one", () => {
    const record = merged(openBatch(), new Map([[PARSER.taskId, undefined]]), 9_000);
    expect(record.receipts.map((receipt) => "sha" in receipt)).toEqual([false, false]);
  });

  it("drops a closed task's receipt, left-out note and send-backs once nothing reads them", () => {
    const sent = (taskId: string, head: string) => ({
      taskId,
      head,
      reason: "it broke the date test",
      at: 9_000,
      failed: ["unit-tests"],
      notRun: [],
    });
    const record: BatchRecord = {
      ...merged(openBatch(), new Map(), 9_000),
      leftOut: [{ taskId: "t-legend", head: LEGEND.head, reason: "it changes nothing", at: 9_000 }],
      sentBack: [sent("t-legend", LEGEND.head), sent("t-export", EXPORT.head)],
    };
    const live = pruned(record, (taskId) => taskId === "t-export");
    expect(live.receipts.map((receipt) => receipt.taskId)).toEqual(["t-export"]);
    expect(live.leftOut).toEqual([]);
    expect(live.sentBack).toEqual([sent("t-export", EXPORT.head)]);
    expect(pruned(live, () => true)).toBe(live);
  });
});

describe("a batch's place on its changes", () => {
  it("says a change in line waits for the batch check, and one in the batch is being checked", () => {
    expect(batchStatus({ state: "waiting", place: "line" })).toEqual({
      kind: "waiting",
      words: BATCH_WAITING_WORDS,
    });
    expect(batchStatus(standing(openBatch(), PARSER.taskId, PARSER.head) as never)).toEqual({
      kind: "in-batch",
      words: BATCH_STATUS_WORDS.batch,
      link: "https://github.com/acme/meter/pull/31",
    });
  });

  it("puts the members back at the front of the line when the pull request was closed unmerged", () => {
    const record = reopened(enqueue(openBatch(), LEGEND));
    expect(record.open).toBeUndefined();
    expect(record.line.map((change) => change.taskId)).toEqual([
      "t-parser",
      "t-export",
      "t-legend",
    ]);
    expect(record.line[0]).not.toHaveProperty("commit");
  });
});

// Intent: the captain's approved plan for the Batches panel: its Last day disclosure lists
// the batches that merged or closed in the last day, with when each formed and ended and
// how many times it was held.
describe("a batch that ended", () => {
  const failed = {
    reason: "checks" as const,
    head: EXPORT_COMMIT,
    checks: ["unit-tests"],
    at: 6_000,
  };

  it("is kept on the record when it merged, with its members, its times and its holds", () => {
    const record = merged(hold(openBatch(), failed).record, new Map(), 9_000);
    expect(record.finished).toEqual([
      {
        number: 31,
        url: "https://github.com/acme/meter/pull/31",
        formed: 5_000,
        ended: 9_000,
        outcome: "merged",
        members: [
          { taskId: PARSER.taskId, title: PARSER.title },
          { taskId: EXPORT.taskId, title: EXPORT.title },
        ],
        holds: 1,
      },
    ]);
  });

  it("is kept as closed when its pull request was closed unmerged", () => {
    const record = reopened(openBatch(), 9_000);
    expect(record.finished).toMatchObject([
      { number: 31, outcome: "closed", ended: 9_000, holds: 0 },
    ]);
  });

  it("keeps the times it was held when its repair combines it again", () => {
    const held = hold(openBatch(), failed).record;
    const again = combined(held, combineOf([member(PARSER, PARSER_COMMIT)]), {
      branch: "infinitary-batch/3fa9c1d2",
      at: 7_000,
    });
    expect(merged(again, new Map(), 9_000).finished).toMatchObject([{ number: 31, holds: 1 }]);
  });

  it("is kept as closed when every change in it was withdrawn", () => {
    const record = abandoned(openBatch(), 9_000);
    expect(record.open).toBeUndefined();
    expect(record.finished).toMatchObject([
      { number: 31, outcome: "closed", ended: 9_000, holds: 0 },
    ]);
  });

  it("is dropped a day after it ended", () => {
    const first = merged(openBatch(), new Map(), 9_000);
    expect(finishedWithin(first.finished ?? [], 9_000 + FINISHED_BATCH_KEPT_MS - 1)).toHaveLength(
      1,
    );
    expect(finishedWithin(first.finished ?? [], 9_000 + FINISHED_BATCH_KEPT_MS)).toEqual([]);
    // The next batch to end a day later carries only itself.
    const later = 9_000 + FINISHED_BATCH_KEPT_MS;
    const second = combined(enqueue(first, LEGEND), combineOf([member(LEGEND, LEGEND_COMMIT)]), {
      branch: "infinitary-batch/8d52",
      at: later - 1_000,
    });
    const numbered: BatchRecord = {
      ...second,
      open: { ...(second.open as NonNullable<BatchRecord["open"]>), number: 32 },
    };
    expect(merged(numbered, new Map(), later).finished?.map((batch) => batch.number)).toEqual([32]);
  });
});
