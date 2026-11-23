/**
 * The words of the wakes batches of your own queue, byte for byte
 * (`tests/helpers/wakeWords.ts` says why): the hold the first mate hears and
 * the send-back a change's own crewmate hears (docs/forge.md, "Batches of your own"),
 * the one steer telling a crewmate its approved change waits in a line, and the
 * one telling it to rebuild on the open batch's version (docs/forge.md, "A change
 * rebuilt on an open batch").
 */
import {
  type OwnBatchWakeKind,
  pinWakeWords,
  type WordsCases,
} from "../../../tests/helpers/wakeWords";

const CASES: WordsCases<OwnBatchWakeKind> = {
  "batch-held": [
    {
      // INF-3759 piece 1: a failed batch of several is told once, and one repair task answers it.
      name: "a batch of two failed one check",
      wake: {
        facts: {
          kind: "batch-held",
          project: { id: "p-7a21", name: "meter" },
          change: "#31",
          url: "https://github.com/acme/meter/pull/31",
          head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
          checks: ["unit-tests"],
          members: [
            { task: "MTR-12", title: "fix(meter): read the reset date" },
            { task: "MTR-14", title: "feat(meter): show the weekly window" },
          ],
        },
      },
      words:
        '[fm-op] a batch of the captain\'s approved changes is held in project "meter" (repo_id p-7a21): #31 (https://github.com/acme/meter/pull/31) at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 failed unit-tests. It carries, in order: MTR-12 "fix(meter): read the reset date", MTR-14 "feat(meter): show the weekly window". Changes approved meanwhile wait in line behind it. Start one task in that project now, with no card first and repairs_batch true in its shape, whose brief names the batch-repair skill, that pull request and that version: it accounts for every failed test against every change in the batch, then sends back the change or changes at fault, each with its reason, or fixes forward with a change it declares the batch\'s fix, or does both in one declaration, or runs the failed checks again when it judges a flake, which still gets an owner. If a task is already repairing this batch, start nothing. Put up no card about the hold: the Batches panel and Settings show who is repairing it, and Settings keeps Try again and Send back with a reason.',
    },
    {
      // INF-5097 piece 1: a held batch's repair hears each member's earlier send-backs.
      name: "a held batch whose member was sent back before",
      wake: {
        facts: {
          kind: "batch-held",
          project: { id: "p-7a21", name: "meter" },
          change: "#33",
          url: "https://github.com/acme/meter/pull/33",
          head: "9a1e4c7b2d8f0a3e6c5b1d9f7a2e4c8b0d6f3a1e",
          checks: ["unit-tests"],
          members: [
            {
              task: "MTR-12",
              title: "fix(meter): read the reset date",
              sentBack: [
                {
                  head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
                  reason: "Its new parser fails the date tests the batch ran.",
                  change: "#31",
                  failed: ["unit-tests"],
                  notRun: ["journeys"],
                },
                {
                  head: "7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c",
                  reason: "Its repair still fails the leap-year date test.",
                  change: "#32",
                  failed: ["unit-tests"],
                  notRun: [],
                },
              ],
            },
            { task: "MTR-14", title: "feat(meter): show the weekly window" },
          ],
        },
      },
      words:
        '[fm-op] a batch of the captain\'s approved changes is held in project "meter" (repo_id p-7a21): #33 (https://github.com/acme/meter/pull/33) at 9a1e4c7b2d8f0a3e6c5b1d9f7a2e4c8b0d6f3a1e failed unit-tests. It carries, in order: MTR-12 "fix(meter): read the reset date", MTR-14 "feat(meter): show the weekly window". Earlier send-backs from batches: MTR-12 was sent back twice: at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 in #31: "Its new parser fails the date tests the batch ran" (never ran there: journeys); at 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c in #32: "Its repair still fails the leap-year date test". Put them in the repair\'s brief, with the checks that never ran there. Changes approved meanwhile wait in line behind it. Start one task in that project now, with no card first and repairs_batch true in its shape, whose brief names the batch-repair skill, that pull request and that version: it accounts for every failed test against every change in the batch, then sends back the change or changes at fault, each with its reason, or fixes forward with a change it declares the batch\'s fix, or does both in one declaration, or runs the failed checks again when it judges a flake, which still gets an owner. If a task is already repairing this batch, start nothing. Put up no card about the hold: the Batches panel and Settings show who is repairing it, and Settings keeps Try again and Send back with a reason.',
    },
    {
      // The captain's ask that a held batch show who repairs it: a batch whose repair is
      // recorded tells the first mate to steer that task rather than start another.
      name: "a held batch whose repair is recorded",
      wake: {
        facts: {
          kind: "batch-held",
          project: { id: "p-7a21", name: "meter" },
          change: "#34",
          url: "https://github.com/acme/meter/pull/34",
          head: "3b8f6d2c05f0c2a9e41b7d3c8a6e2f9b0d4c1a7e",
          checks: ["unit-tests"],
          members: [
            { task: "MTR-12", title: "fix(meter): read the reset date" },
            { task: "MTR-14", title: "feat(meter): show the weekly window" },
          ],
          repair: "MTR-19",
        },
      },
      words:
        '[fm-op] a batch of the captain\'s approved changes is held in project "meter" (repo_id p-7a21): #34 (https://github.com/acme/meter/pull/34) at 3b8f6d2c05f0c2a9e41b7d3c8a6e2f9b0d4c1a7e failed unit-tests. It carries, in order: MTR-12 "fix(meter): read the reset date", MTR-14 "feat(meter): show the weekly window". Changes approved meanwhile wait in line behind it. MTR-19 is recorded as this batch\'s repair and is still open: steer it with this pull request and version, and start no other task. Put up no card about the hold: the Batches panel and Settings show who is repairing it, and Settings keeps Try again and Send back with a reason.',
    },
  ],
  "batch-sent-back": [
    {
      // INF-3759 piece 1: a change sent back with no kept approval needs a new merge card. With no
      // batch checks carried, as for a change whose approval belongs to the project's former
      // address, there is nothing of the batch's to re-prove.
      name: "a change sent back with a reason and no batch checks",
      wake: {
        facts: {
          kind: "batch-sent-back",
          head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
          reason:
            "its approval belongs to the project's former address; confirm the change at the approved address and request fresh approval",
        },
      },
      words:
        "Your change at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 was sent back from its batch of approved changes with this reason: its approval belongs to the project's former address; confirm the change at the approved address and request fresh approval. The other changes of that batch go on without it. Repair it on your branch, push and confirm its story, then put up a new merge card for the new version: once approved it joins the project's next batch.",
    },
    {
      // INF-5097 piece 1: a second send-back names the earlier one, the never-run checks, and the kept approval.
      name: "a change sent back a second time under a kept approval",
      wake: {
        facts: {
          kind: "batch-sent-back",
          head: "7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c",
          reason: "Its repair still fails the leap-year date test",
          change: "#32",
          failed: ["unit-tests"],
          notRun: ["journeys", "browser-tests"],
          earlier: [
            {
              head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
              reason: "Its new parser fails the date tests the batch ran.",
              change: "#31",
              failed: ["unit-tests"],
              notRun: ["journeys"],
            },
          ],
          approval:
            "The captain's merge approval is kept and covers 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c. Put up no merge card: this version's batch failed with it alone, sent it back or left it out, as the batch check's words say, and no checks override passes a batch, so there is no Merge anyway. Fix the cause in a new version and declare it with check_change conflictRepair: with impact none the approval goes ahead without a new card and the new version joins the project's next batch once its checks pass; with changed-work the approval ends and you put up a new merge card.",
        },
      },
      words:
        "Your change at 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c was sent back from its batch of approved changes, #32, with this reason: Its repair still fails the leap-year date test. This is send-back 2 of this change; before this: at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 in #31: \"Its new parser fails the date tests the batch ran\" (never ran there: journeys). The batch's failed checks: unit-tests. The batch's checks that never ran to an end on it, cancelled, skipped or unfinished: journeys, browser-tests. The other changes of that batch go on without it. Run at the repaired version the checks your project's rules name for a change sent back from its batch, and the checks that never ran on it, and let them finish before you declare the repair with check_change conflictRepair or put up a new merge card for it: a repair declared with impact none rejoins the next batch with no card, and a batch can be the first place many of a project's tests run, so a repair that re-proves only the failure named can be sent back again. Repair it on your branch and push. The captain's merge approval is kept and covers 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c. Put up no merge card: this version's batch failed with it alone, sent it back or left it out, as the batch check's words say, and no checks override passes a batch, so there is no Merge anyway. Fix the cause in a new version and declare it with check_change conflictRepair: with impact none the approval goes ahead without a new card and the new version joins the project's next batch once its checks pass; with changed-work the approval ends and you put up a new merge card.",
    },
    {
      // INF-5097 piece 1's review: a send-back whose hold kept no never-run list says it is not known,
      // and a first send-back says "once", the captain's answer to the review.
      name: "a change sent back the first time where which checks never ran is not known",
      wake: {
        facts: {
          kind: "batch-sent-back",
          head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
          reason: "Its new parser fails the date tests the batch ran.",
          change: "#31",
          failed: ["unit-tests"],
          earlier: [],
        },
      },
      words:
        "Your change at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 was sent back from its batch of approved changes, #31, with this reason: Its new parser fails the date tests the batch ran. This change has been sent back once, this time: no earlier send-back is on its record. The batch's failed checks: unit-tests. Which of the batch's checks never ran to an end on it is not known. The other changes of that batch go on without it. Run at the repaired version the checks your project's rules name for a change sent back from its batch, and the checks that never ran on it, and let them finish before you declare the repair with check_change conflictRepair or put up a new merge card for it: a repair declared with impact none rejoins the next batch with no card, and a batch can be the first place many of a project's tests run, so a repair that re-proves only the failure named can be sent back again. Repair it on your branch, push and confirm its story, then put up a new merge card for the new version: once approved it joins the project's next batch.",
    },
  ],
  "batch-rebuild": [
    {
      // INF-6147 piece 1: a change that clashes with the open batch is rebuilt on its version at once.
      name: "a change left out for a clash with a change ahead in the open batch",
      wake: {
        facts: {
          kind: "batch-rebuild",
          head: "7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c",
          reason:
            'it combines with the default branch but clashes with "feat(meter): show the weekly window", an approved change ahead of it in the batch that is not merged yet',
          change: "#34",
          url: "https://github.com/acme/meter/pull/34",
          branch: "infinitary-batch/3f9a0c1d",
          on: "9a1e4c7b2d8f0a3e6c5b1d9f7a2e4c8b0d6f3a1e",
          members: [
            { task: "MTR-12", title: "fix(meter): read the reset date" },
            { task: "MTR-14", title: "feat(meter): show the weekly window" },
          ],
          approval:
            "The captain's merge approval is kept and covers 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c: impact none keeps it, with no new card.",
        },
      },
      words:
        'Your change at 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c clashes with this project\'s open batch of approved changes, #34 (https://github.com/acme/meter/pull/34): it combines with the default branch but clashes with "feat(meter): show the weekly window", an approved change ahead of it in the batch that is not merged yet. Rebuild it on that batch\'s version now rather than waiting for the batch to merge: git fetch origin infinitary-batch/3f9a0c1d, then bring only your own commits onto 9a1e4c7b2d8f0a3e6c5b1d9f7a2e4c8b0d6f3a1e, resolve the clash, run your validation again and push. That version carries, in order: MTR-12 "fix(meter): read the reset date", MTR-14 "feat(meter): show the weekly window". Declare that push with check_change conflictRepair, giving 9a1e4c7b2d8f0a3e6c5b1d9f7a2e4c8b0d6f3a1e as newBase. The captain\'s merge approval is kept and covers 7c3e9a1f5b2d8c4a0e6f1b9d3a7c5e2f8b4d0a6c: impact none keeps it, with no new card. Once its own checks pass, the rebuilt version waits right behind that batch\'s changes, joins it if the batch is combined again, and goes first in the next batch as one commit of its own difference from 9a1e4c7b2d8f0a3e6c5b1d9f7a2e4c8b0d6f3a1e. If the batch\'s changes change before then, you are told once to rebuild on its new version.',
    },
  ],
  "merge-line": [
    {
      // INF-4497 finding 2: the quiet while a change waits in the batch line is told once, never flagged.
      name: "an approved change in line for the next batch",
      wake: {
        facts: {
          kind: "merge-line",
          line: "queue",
          head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
        },
      },
      words:
        "Your change at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 is approved and waits in line for this project's next batch of approved changes. The app merges it with that batch once the batch's checks pass, so this wait is not a stall and nothing is needed from you for it: do not put up another merge card or ask the captain to merge again. If the batch leaves your change out, sends it back, or fails its checks with your change alone in it, you are woken with what to do. Finish any other remaining work, then end your turn.",
    },
    {
      // INF-4497 finding 2: the host's own merge queue is the same kind of line.
      name: "an approved change in the host's merge queue",
      wake: {
        facts: {
          kind: "merge-line",
          line: "host-queue",
          head: "5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0",
        },
      },
      words:
        "The project's host took your change at 5f0c2a9e41b7d3c8a6e2f9b0d4c1a7e3b8f6d2c0 into the merge queue of its branch. It merges it once the queue's checks pass, and the task closes then, so this wait is not a stall and nothing is needed from you for it: do not put up another merge card or ask the captain to merge again. If the host removes it from the queue without merging it, you are woken with what to do. Finish any other remaining work, then end your turn.",
    },
  ],
};

pinWakeWords("the wakes of batches of your own, byte for byte", CASES);
