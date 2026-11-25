import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chipWords, HERE } from "@shared/deviceNames";
import type { ComputerReach, DeviceView } from "@shared/devices";
import {
  AUTOMATIC_COMPUTER,
  PLACEMENT_FACTS_ORDER,
  PLACEMENT_FACTS_SINCE,
  PLACEMENT_HELD_WAIT,
  PLACEMENT_MODEL_WAIT,
  type PlacementFacts,
  placementCandidateLines,
  placementNamedModelWait,
} from "@shared/placement";
import type { RepoView } from "@shared/repos";
import type { ResourceObservation } from "@shared/resources";
import type { WorkShape } from "@shared/routingPolicy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshDatabase } from "../../../tests/helpers/database";
import {
  orderPolicyOnlyRoute,
  preparePolicyOnlyRoute,
} from "../../../tests/helpers/policyOnlyRouting";
import { seedPublishedContribution } from "../../../tests/helpers/publishedContribution";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { ForgeSignInStore, ForgeSignIns } from "../forge";
import type { RoutePreview, Router } from "../routing/router";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { AutomaticPlacement } from "./automaticPlacement";
import { ComputerResourceFeed } from "./computerResourceFeed";
import { ComputerResources } from "./computerResources";
import { memoryUsedBytes } from "./memoryUsed";
import type { WorkDevices } from "./workDevices";

/**
 * INF-25 (recreated from FI3-1762, found on FI3-1757): each Automatic start
 * sets aside a standard task's half core and 2 GiB on the computer it chose,
 * until a reading taken after that task was seen running includes it. The
 * app saw a task running only while choosing a computer for another one, so
 * the first start after a quiet spell still counted every recent start: at
 * 1:03 AM FI3-1741 waited for memory beside two tasks that had run for two
 * and a half minutes, and started 1.7 s later once their room was freed.
 */

const KIB = 1024;
const MAC = "a".repeat(64);
const EPOCH = "4f0c2a8e-6b1d-4c3e-9a57-2d8f1e0b7c64";

/**
 * This Mac's reading, as Electron reported it on a 24 GiB Mac in ordinary
 * use (FI3-1733, SCR-380): room for 6.2 cores and 4.8 GiB once 20% of idle
 * CPU and 2.4 GiB are kept back. Two standard starts' room leaves 0.8 GiB.
 */
function reading(sequence: number): ResourceObservation {
  return {
    epoch: EPOCH,
    sequence,
    status: "sampled",
    sampleMs: 250,
    cpu: { logicalCpus: 10, idleFraction: 0.77 },
    memory: {
      totalBytes: 25_165_824 * KIB,
      freeBytes: 356_672 * KIB,
      purgeableBytes: 335_184 * KIB,
      fileBackedBytes: 6_852_624 * KIB,
    },
  };
}

/** What this Mac reads about itself for a project it can clone. */
const facts: PlacementFacts = {
  system: "macos",
  chip: "arm64",
  physicalComputerId: MAC,
  tools: { git: "available" },
  projectAccess: "available",
};

const ledger: RepoView = {
  id: "repo-ledger",
  name: "ledger",
  path: "/projects/ledger",
  setupKind: "clone",
  kind: "project",
  origin: "https://github.com/o/ledger.git",
  host: { kind: "github", name: "github.com" },
  delivery: "direct-pr",
  autonomy: false,
  rigor: null,
  runsOn: AUTOMATIC_COMPUTER,
  placementRequirements: { systems: ["macos"], chips: ["arm64"] },
};

const opus: RoutePreview = {
  result: {
    choice: { provider: "anthropic-claude", id: "claude-opus-5-5" },
    bucket: "high",
    rule: "R1a",
  },
  reasons: [],
  preferenceRank: 0,
  requiresReasoningWait: false,
};

/** Another Mac paired with this one to run work, out of reach. */
const macMini: DeviceView = {
  id: "mac-mini",
  kind: "mac",
  name: "Mac mini",
  pairedAt: Date.parse("2026-10-01T09:00:00Z"),
};

/**
 * One clock for the feed, its receiver and placement, moved by the fake
 * timers: by default it reads the same until they move it on. `more` names
 * the rest of placement's world, such as another computer and its reach.
 */
function world(
  now: () => number = () => Date.now(),
  more: Partial<ConstructorParameters<typeof AutomaticPlacement>[0]> = {},
) {
  const db = freshDatabase();
  const tasks = new TaskService({ db, strict: true });
  const work = {
    onWorkDevice: () => () => {},
    inReach: () => false,
    version: () => undefined,
    ask: () => Promise.reject(new Error("No other computer is paired.")),
  } as unknown as WorkDevices;
  let sequence = 0;
  const resources = new ComputerResources({
    local: { read: async () => reading(++sequence) },
    work,
    now,
  });
  const feed = new ComputerResourceFeed({
    resources,
    computers: () => [{ computerId: null, label: HERE.This }],
    onComputers: () => () => {},
    onContact: () => () => {},
    emit: () => {},
    now,
  });
  const router = {
    prepare: preparePolicyOnlyRoute,
    inOrder: orderPolicyOnlyRoute,
    preview: () => opus,
    commit: (_taskId: string, preview: RoutePreview) => preview.result,
  } as unknown as Router;
  const running = new Set<string>();
  const placement = new AutomaticPlacement({
    tasks,
    resources: feed,
    work,
    devices: () => [],
    router,
    repo: () => ledger,
    catalog: () => [],
    now,
    running: (task) => running.has(task.id),
    localFacts: async () => facts,
    home: () => ({ system: facts.system, chip: facts.chip }),
    ...more,
  });
  const task = (id: string, title: string) =>
    seedTask(tasks, { id, title, repoId: ledger.id, status: "queued" });
  const start = (
    record: ReturnType<typeof task>,
    shape: WorkShape = { kind: "fix" },
    project: RepoView = ledger,
  ) => placement.choose(record, project, record.title, shape);
  return {
    db,
    tasks,
    placement,
    running,
    task,
    start,
    dispose: () => {
      placement.dispose();
      feed.dispose();
    },
  };
}

describe("AutomaticPlacement's room set aside for starting tasks", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-14T08:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("admits the same starts beside quiet published contributions at equal readings and reservations", async () => {
    const baseline = world();
    const waiting = world();
    try {
      for (const number of [23, 24, 25])
        seedPublishedContribution(waiting.tasks, `contribution-${number}`, number);
      const observe = async (w: ReturnType<typeof world>) => {
        const first = w.task("first", "Fix the ledger footer");
        const second = w.task("second", "Fix the ledger totals");
        const next = w.task("next", "Fix the ledger header");
        const decisions = [await w.start(first), await w.start(second), await w.start(next)];
        return {
          decisions,
          starts: [first, second].map((task) => ({
            reservation: w.tasks.get(task.id)?.placement?.reservation,
            candidates: w.tasks.get(task.id)?.placement?.snapshot.candidates,
          })),
        };
      };
      const before = await observe(baseline);
      const after = await observe(waiting);
      expect(
        before.decisions.map((decision) =>
          decision && "computerId" in decision ? { computerId: decision.computerId } : decision,
        ),
      ).toEqual([
        { computerId: null },
        { computerId: null },
        { wait: { kind: "room", words: PLACEMENT_HELD_WAIT } },
      ]);
      expect(after).toEqual(before);
      expect(after.starts.map((task) => task.reservation)).toEqual(["pending", "pending"]);
    } finally {
      baseline.dispose();
      waiting.dispose();
    }
  });

  it("starts the first task after a quiet spell beside two tasks that are running and measured", async () => {
    const w = world();
    try {
      const footer = w.task("footer", "Fix the ledger footer");
      const totals = w.task("totals", "Fix the ledger totals");
      expect(await w.start(footer)).toMatchObject({ computerId: null });
      // The second starts while the first still prepares: its room counts.
      expect(await w.start(totals)).toMatchObject({ computerId: null });
      w.running.add(footer.id);
      w.running.add(totals.id);

      await vi.advanceTimersByTimeAsync(150_000);
      const header = w.task("header", "Fix the ledger header");
      expect(await w.start(header)).toMatchObject({ computerId: null });
      expect(w.tasks.get(footer.id)?.placement?.reservation).toBe("observed");
      expect(w.tasks.get(totals.id)?.placement?.reservation).toBe("observed");
      expect(w.tasks.get(header.id)?.placement?.reservation).toBe("pending");
      // INF-396: the placement record saves the figure already on the reading.
      const saved = w.tasks
        .get(footer.id)
        ?.placement?.snapshot.candidates.find((row) => row.computerId === null)?.reading;
      expect(saved?.status).toBe("fresh");
      if (saved?.status === "fresh") {
        expect(saved.memoryUsedBytes).toBe(memoryUsedBytes(saved.observation.memory));
      }
    } finally {
      w.dispose();
    }
  });

  // A running task is seen just before the reading that frees its room is
  // asked for: at the same moment by a clock that has not moved, or a moment
  // before by one that moves on every read.
  it.each([
    ["a clock that reads the same within a moment", () => () => Date.now()],
    [
      "a clock that moves on with every read",
      () => {
        let reads = 0;
        return () => Date.now() + ++reads;
      },
    ],
  ])("frees the room of tasks that began running in a quiet spell on %s", async (_name, clock) => {
    const w = world(clock());
    try {
      const footer = w.task("footer", "Fix the ledger footer");
      const totals = w.task("totals", "Fix the ledger totals");
      await w.start(footer);
      await w.start(totals);
      // Their working copies took long enough that the readings had stopped.
      await vi.advanceTimersByTimeAsync(150_000);
      w.running.add(footer.id);
      w.running.add(totals.id);
      const header = w.task("header", "Fix the ledger header");
      expect(await w.start(header)).toMatchObject({ computerId: null });
      expect(w.tasks.get(footer.id)?.placement?.reservation).toBe("observed");
      expect(w.tasks.get(totals.id)?.placement?.reservation).toBe("observed");
    } finally {
      w.dispose();
    }
  });

  it("keeps the room of tasks that have not started running, and says that is why it waits", async () => {
    const w = world();
    try {
      const footer = w.task("footer", "Fix the ledger footer");
      const totals = w.task("totals", "Fix the ledger totals");
      await w.start(footer);
      await w.start(totals);

      await vi.advanceTimersByTimeAsync(150_000);
      const header = w.task("header", "Fix the ledger header");
      expect(await w.start(header)).toEqual({ wait: { kind: "room", words: PLACEMENT_HELD_WAIT } });
      expect(w.tasks.get(footer.id)?.placement?.reservation).toBe("pending");
      expect(w.tasks.get(totals.id)?.placement?.reservation).toBe("pending");
      expect(w.tasks.get(header.id)?.placement).toBeNull();
    } finally {
      w.dispose();
    }
  });

  // INF-3366 (row 8 of INF-3307's audit): a task closed once its working
  // copy had begun kept its room for good, across restarts, since only a
  // sample of it running or its working copy's cleanup there freed it, and
  // a closed task never runs and may have no working copy to clean up.
  it("frees the room of tasks closed after their working copies began", async () => {
    const w = world();
    try {
      const footer = w.task("footer", "Fix the ledger footer");
      const totals = w.task("totals", "Fix the ledger totals");
      await w.start(footer);
      await w.start(totals);
      w.tasks.placement.beginPlacementPreparation(footer.id);
      w.tasks.placement.beginPlacementPreparation(totals.id);
      w.tasks.close(footer.id, { status: "dropped", reason: "cancelled", actor: "captain" });
      w.tasks.close(totals.id, { status: "dropped", reason: "cancelled", actor: "captain" });

      await vi.advanceTimersByTimeAsync(150_000);
      const header = w.task("header", "Fix the ledger header");
      expect(await w.start(header)).toMatchObject({ computerId: null });
      const recovered = new TaskService({ db: w.db, strict: true });
      expect(recovered.placement.pendingPlacements().map((task) => task.id)).toEqual([header.id]);
    } finally {
      w.dispose();
    }
  });
});

/**
 * INF-464, the captain's pick on INF-460: placement carries the core's one
 * reach value (`reachFrom`) as it is, with no connecting flag made from it.
 * A computer whose connection is being made reads connecting; one this Mac
 * tries again after a drop reads out of reach.
 */
describe("AutomaticPlacement's words for a computer out of reach", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-14T08:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const reaches = [
    ["connecting", "connecting"],
    ["reconnecting", "out of reach"],
  ] as const satisfies readonly (readonly [ComputerReach, string])[];

  it.each(reaches)(
    "saves a %s computer's reach as it is on the start's explanation, which reads %s",
    async (reach, words) => {
      const w = world(undefined, { devices: () => [macMini], reachOf: () => reach });
      try {
        const footer = w.task("footer", "Fix the ledger footer");
        expect(await w.start(footer)).toMatchObject({ computerId: null });
        const snapshot = w.tasks.get(footer.id)?.placement?.snapshot;
        if (!snapshot) throw new Error("The start saved no explanation.");
        expect(snapshot.candidates.find((row) => row.computerId === macMini.id)?.reach).toBe(reach);
        expect(
          placementCandidateLines(snapshot).find((line) => line.startsWith("Mac mini: ")),
        ).toMatch(new RegExp(`^Mac mini: ${words}; `));
      } finally {
        w.dispose();
      }
    },
  );

  it.each(reaches)("names a %s computer %s in a waiting start's words", async (reach, words) => {
    const w = world(undefined, {
      devices: () => [macMini],
      reachOf: () => reach,
      // This Mac cannot clone the project, so the start waits for a computer.
      localFacts: async () => ({ ...facts, projectAccess: "unavailable" }),
    });
    try {
      const footer = w.task("footer", "Fix the ledger footer");
      const waited = await w.start(footer);
      expect(waited).toMatchObject({ wait: { kind: "other" } });
      expect(waited && "wait" in waited ? waited.wait.words : "").toContain(
        `${HERE.This}: project unavailable. Mac mini: ${words}; `,
      );
    } finally {
      w.dispose();
    }
  });
});

/**
 * INF-720, the captain's Fix 4: INF-653 and INF-665 needed Linux, and no
 * computer paired with this one runs it, so each waited hours on "different
 * required system" until the first mate happened to look. A wait says so as
 * a fact of its own only when every computer's system is known and none runs
 * it: a paired computer that runs it can end the wait, in reach or not.
 */
describe("AutomaticPlacement's wait for a system no computer runs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-14T08:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const either: RepoView = {
    ...ledger,
    placementRequirements: { systems: ["macos", "linux"], chips: ["arm64"] },
  };
  /** A task that compares test failures on Linux, as INF-653 did. */
  const onLinux: WorkShape = { kind: "fix", placement_requirements: { systems: ["linux"] } };

  it("says no computer runs Linux while this computer and the Mac mini both run macOS", async () => {
    const w = world(undefined, {
      devices: () => [{ ...macMini, system: "macos" }],
      repo: () => either,
    });
    try {
      const compare = w.task("compare", "Compare the Linux test failures on main");
      expect(await w.start(compare, onLinux, either)).toMatchObject({
        wait: { kind: "other" },
        unserved: {
          required: ["linux"],
          computers: [
            { name: HERE.This, system: "macos" },
            { name: "Mac mini", system: "macos" },
          ],
        },
      });
      expect(w.tasks.get(compare.id)?.placement).toBeNull();
    } finally {
      w.dispose();
    }
  });

  it.each([
    ["runs Linux and is out of reach", { ...macMini, kind: "work", system: "linux" }],
    ["never said what it runs", macMini],
  ] as const satisfies readonly (readonly [string, DeviceView])[])(
    "says nothing of it while a paired computer %s",
    async (_name, device) => {
      const w = world(undefined, { devices: () => [device], repo: () => either });
      try {
        const compare = w.task("compare", "Compare the Linux test failures on main");
        const waited = await w.start(compare, onLinux, either);
        expect(waited).toMatchObject({ wait: { kind: "other" } });
        expect(waited && "unserved" in waited).toBe(false);
      } finally {
        w.dispose();
      }
    },
  );
});

/**
 * INF-1456: a person added an Intel Mac mini beside their Apple-silicon
 * MacBook, and Automatic never used it for a project that declared no
 * computer requirements: the chip was filled from the MacBook's own, and
 * only Task Details said "different required architecture". The start now
 * names the computer it left out, why, and the project change that lets it
 * in, whichever computer took the task.
 */
describe("AutomaticPlacement's word on an added computer it leaves out", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-14T08:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The project in the report: Automatic, with no computer requirements. */
  const scheduler: RepoView = { ...ledger, placementRequirements: undefined };
  const intelMini = {
    system: "macos",
    chip: "x64",
    physicalComputerId: "b".repeat(64),
    tools: { git: "available" },
    projectAccess: "available",
    signIns: null,
  } as const;

  it("starts here and names the Intel Mac mini, held to this computer's Apple silicon", async () => {
    const w = world(undefined, {
      devices: () => [{ ...macMini, kind: "work", system: "macos", chip: "x64" }],
      repo: () => scheduler,
      work: {
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => ({ contract: PLACEMENT_FACTS_SINCE }),
        ask: async () => intelMini,
      } as unknown as WorkDevices,
    });
    try {
      const rotate = w.task("rotate", "Remove and rotate scheduler mail credentials");
      expect(await w.start(rotate, { kind: "fix" }, scheduler)).toMatchObject({
        computerId: null,
        leftOut: [
          {
            computerId: macMini.id,
            name: "Mac mini",
            took: HERE.This,
            reasons: [{ kind: "chip", runs: "x64", heldTo: ["arm64"] }],
            widened: { chips: ["arm64", "x64"] },
          },
        ],
      });
      const snapshot = w.tasks.get(rotate.id)?.placement?.snapshot;
      if (!snapshot) throw new Error("The start saved no explanation.");
      expect(
        placementCandidateLines(snapshot).find((line) => line.startsWith("Mac mini: ")),
      ).toMatch(
        new RegExp(
          `^Mac mini: Intel, while this task was held to Apple silicon, inherited from ${HERE.this}[;.]`,
        ),
      );
    } finally {
      w.dispose();
    }
  });
});

/**
 * INF-4260's piece 10 (INF-4611): a Windows PC runs a home's work, and
 * answers Automatic's checks with its own system, Windows. A home on Windows
 * inherits Windows for a project that declares no system, so its Automatic
 * starts a task on that PC once this one cannot, where the answer once had no
 * word for Windows and the PC's every check read unknown.
 */
describe("Automatic on a Windows home with a Windows PC that runs work", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-17T18:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const notes: RepoView = { ...ledger, placementRequirements: undefined };
  const homeFacts: PlacementFacts = {
    system: "windows",
    chip: "x64",
    physicalComputerId: "c".repeat(64),
    tools: { git: "unavailable" },
    projectAccess: "available",
  };
  /** The other PC, as its work mode answers the home's placement order. */
  const pc: DeviceView = {
    id: "desk-pc",
    kind: "mac",
    name: "Desk PC",
    pairedAt: Date.parse("2026-11-17T17:00:00Z"),
    system: "windows",
    chip: "x64",
  };

  it("starts the task on the other Windows PC, which answers that it runs Windows", async () => {
    const observation = reading(1);
    if (observation.status !== "sampled") throw new Error("The captured reading is missing.");
    const resource = {
      status: "fresh" as const,
      observation,
      ageMs: 0,
      memoryUsedBytes: memoryUsedBytes(observation.memory),
    };
    const w = world(undefined, {
      devices: () => [pc],
      repo: () => notes,
      localFacts: async () => homeFacts,
      home: () => ({ system: "windows", chip: "x64" }),
      work: {
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => ({ contract: PLACEMENT_FACTS_SINCE }),
        ask: async () => ({
          system: "windows",
          chip: "x64",
          physicalComputerId: "d".repeat(64),
          tools: { git: "available" },
          projectAccess: "available",
          signIns: { providers: [], accounts: [], quota: null, served: [] },
        }),
      } as unknown as WorkDevices,
      resources: {
        onSample: () => () => {},
        readCurrent: async () => {},
        snapshot: () => ({
          computers: [
            { computerId: null, reading: resource },
            { computerId: pc.id, reading: resource },
          ],
        }),
        sampledAt: () => undefined,
      } as unknown as ComputerResourceFeed,
    });
    try {
      const task = w.task("index", "Index the meeting notes by date");
      expect(await w.start(task, { kind: "fix" }, notes)).toMatchObject({ computerId: pc.id });
      const snapshot = w.tasks.get(task.id)?.placement?.snapshot;
      expect(snapshot?.candidates.find((row) => row.computerId === pc.id)).toMatchObject({
        system: "windows",
      });
    } finally {
      w.dispose();
    }
  });
});

/**
 * Review INF-1772 R6, the captain: "Add the planned checks back"; and R8:
 * "we should try to support all projects, except for when the project is on
 * a forge that isn't signed in on the destination machine". A started task
 * moves only to a computer that can run it, read as a start reads it, and a
 * move back home is read the same way.
 */
describe("AutomaticPlacement's word on a computer a started task cannot move to", () => {
  const record = { shape: { kind: "fix" } as WorkShape };
  /** The Mac mini's own sign-ins where projects live, as its facts answer names them. */
  const signedInTo = (...hosts: { host: string; state: "ok" | "needs_reauth" }[]) => ({
    providers: [],
    accounts: [],
    quota: null,
    forges: {
      signIns: hosts.map(({ host, state }) => ({
        host,
        name: "GitHub",
        login: "kunchenguid",
        state,
        since: 1,
      })),
      hosts: [{ host: "github.com", name: "GitHub" }],
    },
  });
  const mini = {
    system: "macos",
    chip: "arm64",
    physicalComputerId: "b".repeat(64),
    tools: { git: "available" },
    projectAccess: "available",
    signIns: signedInTo({ host: "github.com", state: "ok" }),
  } as const;
  const answering = (answer: object) =>
    world(undefined, {
      work: {
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => ({ contract: PLACEMENT_FACTS_SINCE }),
        ask: async () => answer,
      } as unknown as WorkDevices,
    });
  const notSignedIn = "Mac mini is not signed in to github.com, where ledger lives.";

  it("takes a computer that runs the project, and names what stops one that cannot", async () => {
    for (const [answer, refusal] of [
      [mini, undefined],
      [
        { ...mini, chip: "x64" },
        `Mac mini has ${chipWords("x64", "macos")}, and this task runs on ${chipWords("arm64", "macos")}.`,
      ],
      [
        { ...mini, tools: { git: "unavailable" } },
        "Mac mini does not have git, which this task needs.",
      ],
      [{ ...mini, signIns: signedInTo() }, notSignedIn],
      [
        { ...mini, signIns: signedInTo({ host: "github.com", state: "needs_reauth" }) },
        notSignedIn,
      ],
      [
        { ...mini, signIns: null },
        "Infinitary could not read whether Mac mini is signed in to github.com.",
      ],
    ] as const) {
      const w = answering(answer);
      try {
        expect(await w.placement.moveRefusal(record, ledger, macMini.id, "Mac mini")).toBe(refusal);
      } finally {
        w.dispose();
      }
    }
  });

  // Review INF-1772 round 2 R6: a public project answers a read without any
  // sign-in, so reaching it is not the destination's sign-in to its forge.
  it("refuses a computer that reaches a public project but is not signed in to its forge", async () => {
    const w = answering({ ...mini, projectAccess: "available", signIns: signedInTo() });
    try {
      expect(await w.placement.moveRefusal(record, ledger, macMini.id, "Mac mini")).toBe(
        notSignedIn,
      );
    } finally {
      w.dispose();
    }
  });

  it("moves a project kept on this computer only, with no forge to sign in to", async () => {
    const w = answering({ ...mini, signIns: signedInTo() });
    try {
      const kept: RepoView = { ...ledger, origin: null, host: null, setupKind: "init" };
      expect(await w.placement.moveRefusal(record, kept, macMini.id, "Mac mini")).toBeUndefined();
      const path: RepoView = { ...ledger, origin: "/Users/kun/code/ledger", host: null };
      expect(await w.placement.moveRefusal(record, path, macMini.id, "Mac mini")).toBeUndefined();
    } finally {
      w.dispose();
    }
  });

  // Review INF-1772 round 3 R6: a move back home reads this computer's own
  // sign-ins and their health, as a move to another computer reads that one's.
  it("reads this computer's own sign-ins and their health for a move back home", async () => {
    const notHere = `${HERE.This} is not signed in to github.com, where ledger lives.`;
    for (const [listed, refusal] of [
      [signedInTo().forges.signIns, notHere],
      [signedInTo({ host: "github.com", state: "needs_reauth" }).forges.signIns, notHere],
      [signedInTo({ host: "github.com", state: "ok" }).forges.signIns, undefined],
      [undefined, `Infinitary could not read whether ${HERE.This} is signed in to github.com.`],
    ] as const) {
      const w = world(undefined, listed ? { forgeSignIns: () => [...listed] } : {});
      try {
        expect(await w.placement.moveRefusal(record, ledger, null, HERE.This)).toBe(refusal);
      } finally {
        w.dispose();
      }
    }
  });

  // Review INF-1772 round 4 R6: the owner lists an unreadable sign-in file,
  // and one whose health is not read yet, as a sign-in in unknown health;
  // both destinations name it unread, read through the real owner's view.
  it("reads an unreadable or unread sign-in through its owner as unread, on both computers", async () => {
    const root = join(scratchDir("infinitary-move-forges-"), "forges");
    const store = new ForgeSignInStore(root);
    let answer: "ok" | "rejected" = "ok";
    const owner = new ForgeSignIns({
      store,
      providers: [
        {
          host: "github.com",
          name: "GitHub",
          start: async () => {
            throw new Error("No sign-in starts in this test.");
          },
          wait: async () => ({ outcome: "denied" }),
          whoAmI: async () =>
            answer === "ok"
              ? { state: "ok", login: "kunchenguid" }
              : { state: "rejected", status: 401 },
        },
      ],
      projectsOn: () => 1,
      push: () => {},
    });
    const unread = (name: string) =>
      `Infinitary could not read whether ${name} is signed in to github.com.`;
    const lapsed = (name: string) => `${name} is not signed in to github.com, where ledger lives.`;
    const read = async (): Promise<[string | undefined, string | undefined]> => {
      const home = world(undefined, { forgeSignIns: () => owner.view().signIns });
      const there = answering({ ...mini, signIns: { ...signedInTo(), forges: owner.view() } });
      try {
        return [
          await home.placement.moveRefusal(record, ledger, null, HERE.This),
          await there.placement.moveRefusal(record, ledger, macMini.id, "Mac mini"),
        ];
      } finally {
        home.dispose();
        there.dispose();
      }
    };
    mkdirSync(join(root, "github.com"), { recursive: true });
    writeFileSync(join(root, "github.com", "sign-in.json"), "{broken");
    await owner.checkHealth();
    expect(owner.view().signIns.map((each) => each.host)).toEqual(["github.com"]);
    expect(await read()).toEqual([unread(HERE.This), unread("Mac mini")]);
    store.write("github.com", {
      token: "gho_x",
      scopes: ["repo"],
      login: "kunchenguid",
      createdAt: 1,
    });
    expect(await read()).toEqual([unread(HERE.This), unread("Mac mini")]);
    await owner.checkHealth();
    expect(await read()).toEqual([undefined, undefined]);
    answer = "rejected";
    await owner.checkHealth();
    expect(await read()).toEqual([lapsed(HERE.This), lapsed("Mac mini")]);
  });
});

/** INF-1870: resolve current basis execution inside admission, not from the start's old record. */
describe("Automatic starts beside their direct answered basis", () => {
  function basisWorld(afterFacts: () => void = () => {}, atAdmission: () => void = () => {}) {
    let snapshots = 0;
    const observation = reading(1);
    if (observation.status !== "sampled") throw new Error("The captured reading is missing.");
    const resource = {
      status: "fresh" as const,
      observation,
      ageMs: 0,
      memoryUsedBytes: memoryUsedBytes(observation.memory),
    };
    const work = {
      onWorkDevice: () => () => {},
      inReach: () => true,
      version: () => ({ contract: PLACEMENT_FACTS_SINCE }),
      ask: async (_id: string, order: string) => {
        expect(order).toBe(PLACEMENT_FACTS_ORDER);
        return {
          ...facts,
          physicalComputerId: "b".repeat(64),
          signIns: { providers: [], accounts: [], quota: null, served: [] },
        };
      },
    } as unknown as WorkDevices;
    return world(undefined, {
      devices: () => [macMini],
      work,
      // Reuse the captured Mac reading, for two independent computers; room
      // differences below are real pending reservations, not invented samples.
      resources: {
        onSample: () => () => {},
        readCurrent: async () => {},
        snapshot: () => {
          if (++snapshots === 2) atAdmission();
          return {
            computers: [
              { computerId: null, reading: resource },
              { computerId: macMini.id, reading: resource },
            ],
          };
        },
        sampledAt: () => undefined,
      } as unknown as ComputerResourceFeed,
      localFacts: async () => {
        await Promise.resolve();
        afterFacts();
        return facts;
      },
    });
  }
  const answered = (w: ReturnType<typeof basisWorld>, id: string, deviceId?: string) =>
    seedTask(w.tasks, {
      id,
      title: `Plan ${id}`,
      status: "idle",
      outcome: "The plan is ready.",
      repoId: "another-project",
      ...(deviceId ? { deviceId } : {}),
    });
  const continuation = (w: ReturnType<typeof basisWorld>, id: string, basis: string) => {
    const task = w.task(id, `Build ${id}`);
    w.tasks.updateFields(task.id, { basis }, "firstmate");
    return w.tasks.get(task.id)!;
  };
  const move = (w: ReturnType<typeof basisWorld>, id: string, deviceId: string | null) =>
    w.tasks.placement.commitComputerMove(id, {
      deviceId,
      repoDir: "/ledger",
      worktreeDir: "/ledger/work",
      branch: "plan",
      actor: "firstmate",
      text: "The task moved.",
      move: {
        from: deviceId === null ? macMini.id : "this-mac",
        to: deviceId ?? "this-mac",
        by: "firstmate",
        at: Date.now(),
        phase: "retiring",
      },
    });

  it.each([null, macMini.id])(
    "prefers a recorded %s basis even when a pending start leaves less room there",
    async (computerId) => {
      const w = basisWorld();
      try {
        const basis = answered(w, "basis", computerId ?? undefined);
        const first = continuation(w, "first", basis.key);
        expect(await w.start(first)).toMatchObject({ computerId });
        const next = continuation(w, "next", basis.key);
        expect(await w.start(next)).toMatchObject({ computerId });
        const snapshot = w.tasks.get(next.id)?.placement?.snapshot;
        expect(snapshot?.basis).toEqual({ taskId: basis.id, taskKey: basis.key, computerId });
        expect(w.tasks.get(next.id)?.shape?.runs_on_ask).toBeUndefined();
        expect(placementCandidateLines(snapshot!)).toContainEqual(
          expect.stringContaining("the basis computer was preferred"),
        );
      } finally {
        w.dispose();
      }
    },
  );

  it("does not treat an unstarted answer as home execution", async () => {
    const w = basisWorld();
    try {
      const cold = w.task("cold", "An unstarted answer");
      w.tasks.turns.recordReport(cold.id, { text: "The answer is ready without execution." });
      // Occupy home first, so ordinary ranking chooses the remote.
      await w.start(w.task("occupy", "Preparing here"));
      const task = continuation(w, "next", cold.key);
      expect(await w.start(task)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(task.id)?.placement?.snapshot.basis).toBeUndefined();
      expect(w.tasks.get(cold.id)?.startedAt).toBeNull();
    } finally {
      w.dispose();
    }
  });

  it("restarts a changed-spec comparison, then uses its current basis and keeps the commitment", async () => {
    let change = () => {};
    const w = basisWorld(() => change());
    try {
      const home = answered(w, "home");
      const there = answered(w, "there", macMini.id);
      const task = continuation(w, "next", home.key);
      change = () => {
        w.tasks.updateFields(task.id, { basis: there.key }, "firstmate");
        change = () => {};
      };
      // The existing stale-spec guard restarts when the grounding itself
      // changes during facts; the new comparison must read the new basis.
      expect(await w.start(task)).toBeUndefined();
      expect(w.tasks.get(task.id)?.placement).toBeNull();
      expect(await w.start(w.tasks.get(task.id)!)).toMatchObject({ computerId: macMini.id });
      const committed = w.tasks.get(task.id)?.placement;
      expect(committed?.snapshot.basis?.taskId).toBe(there.id);
      // The existing owner refuses changing grounding after a commitment.
      expect(() => w.tasks.updateFields(task.id, { basis: home.key }, "firstmate")).toThrow(
        "has not started",
      );
      expect(await w.start(w.tasks.get(task.id)!)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(task.id)?.placement).toEqual(committed);
    } finally {
      w.dispose();
    }
  });

  it("uses a committed move made during comparison, not its historical start or a planned move", async () => {
    let change = () => {};
    const w = basisWorld(() => change());
    try {
      const basis = answered(w, "basis");
      const task = continuation(w, "next", basis.key);
      change = () => {
        move(w, basis.id, macMini.id);
        change = () => {};
      };
      expect(await w.start(task)).toMatchObject({ computerId: macMini.id });
      const committed = w.tasks.get(task.id)?.placement;
      move(w, basis.id, null);
      expect(await w.start(w.tasks.get(task.id)!)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(task.id)?.placement).toEqual(committed);
    } finally {
      w.dispose();
    }
  });

  it("keeps concurrent starts within atomic reservations and preserves uncertain preparation", async () => {
    const w = basisWorld();
    try {
      const basis = answered(w, "basis", macMini.id);
      const tasks = ["one", "two", "three"].map((id) => continuation(w, id, basis.key));
      const starts = await Promise.all(tasks.map((task) => w.start(task)));
      expect(
        starts.map((start) => (start && "computerId" in start ? start.computerId : "waiting")),
      ).toEqual([macMini.id, macMini.id, null]);
      const first = tasks[0]!;
      const held = w.tasks.get(first.id)?.placement;
      move(w, basis.id, null);
      expect(await w.start(first)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(first.id)?.placement).toEqual(held);
    } finally {
      w.dispose();
    }
  });

  it.each(["absent", "unresolved", "unanswered"] as const)(
    "adds no locality or wait for an %s basis",
    async (kind) => {
      const w = basisWorld();
      try {
        await w.start(w.task("occupy", "Preparing here"));
        const unready = seedTask(w.tasks, {
          id: "unready",
          title: "An unanswered basis",
          status: "idle",
        });
        const task = w.tasks.create({
          id: "next",
          title: "Continue",
          prompt: "Continue",
          repoId: ledger.id,
          shape: {
            kind: "fix",
            ...(kind === "absent"
              ? {}
              : { basis: kind === "unresolved" ? "not-created" : unready.key }),
          },
        });
        expect(await w.start(task)).toMatchObject({ computerId: macMini.id });
        expect(w.tasks.get(task.id)?.placement?.snapshot.basis).toBeUndefined();
      } finally {
        w.dispose();
      }
    },
  );

  it("ignores a planned destination until the basis move commits", async () => {
    const w = basisWorld();
    try {
      const basis = answered(w, "basis", macMini.id);
      w.tasks.placement.setComputerMove(basis.id, {
        from: macMini.id,
        to: "this-mac",
        by: "firstmate",
        at: Date.now(),
        phase: "waiting",
      });
      const next = continuation(w, "next", basis.key);
      expect(await w.start(next)).toMatchObject({ computerId: macMini.id });
    } finally {
      w.dispose();
    }
  });

  it("retains the committed destination and provenance through restart during uncertain preparation", async () => {
    const w = basisWorld();
    try {
      const basis = answered(w, "basis", macMini.id);
      const next = continuation(w, "next", basis.key);
      await w.start(next);
      w.tasks.placement.beginPlacementPreparation(next.id);
      const before = w.tasks.get(next.id)?.placement;
      move(w, basis.id, null);
      const recovered = new TaskService({ db: w.db, strict: true });
      expect(recovered.get(next.id)?.placement).toEqual(before);
      expect(recovered.get(next.id)?.deviceId).toBe(macMini.id);
      expect(await w.start(w.tasks.get(next.id)!)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(next.id)?.placement).toEqual(before);
    } finally {
      w.dispose();
    }
  });

  it("re-reads the declared relation inside commitment immediately after the final resource read", async () => {
    let change = () => {};
    const w = basisWorld(
      () => {},
      () => change(),
    );
    try {
      const home = answered(w, "home");
      const there = answered(w, "there", macMini.id);
      const next = continuation(w, "next", home.key);
      change = () => w.tasks.updateFields(next.id, { basis: there.key }, "firstmate");
      expect(await w.start(next)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(next.id)?.placement?.snapshot.basis?.taskId).toBe(there.id);
    } finally {
      w.dispose();
    }
  });
});

/**
 * INF-1729, direction A: QUIL-110, filed by the app when QUIL-108 merged,
 * started on the MacBook because Automatic chose This computer, against the
 * captain's direction that work goes to the Mac mini. With the computer
 * question on, the decision model picks among the computers that can run
 * the task; with it off, or unsure, the ordinary rules choose.
 */
describe("Automatic asks the decision model which computer starts a new task", () => {
  function pickWorld(
    chooser: ConstructorParameters<typeof AutomaticPlacement>[0]["chooser"],
    more: Partial<ConstructorParameters<typeof AutomaticPlacement>[0]> = {},
  ) {
    const observation = reading(1);
    if (observation.status !== "sampled") throw new Error("The captured reading is missing.");
    const resource = {
      status: "fresh" as const,
      observation,
      ageMs: 0,
      memoryUsedBytes: memoryUsedBytes(observation.memory),
    };
    const work = {
      onWorkDevice: () => () => {},
      inReach: () => true,
      version: () => ({ contract: PLACEMENT_FACTS_SINCE }),
      ask: async () => ({
        ...facts,
        physicalComputerId: "b".repeat(64),
        signIns: { providers: [], accounts: [], quota: null, served: [] },
      }),
    } as unknown as WorkDevices;
    return world(undefined, {
      devices: () => [macMini],
      work,
      homeName: () => "Kun's MacBook Pro",
      ...(chooser ? { chooser } : {}),
      resources: {
        onSample: () => () => {},
        readCurrent: async () => {},
        snapshot: () => ({
          computers: [
            { computerId: null, reading: resource },
            { computerId: macMini.id, reading: resource },
          ],
        }),
        sampledAt: () => undefined,
      } as unknown as ComputerResourceFeed,
      ...more,
    });
  }

  it("starts on the picked computer, handing it both computers, and says why", async () => {
    const asked: unknown[] = [];
    const w = pickWorld({
      allowed: () => true,
      pick: async (_record, _repo, _shape, computers) => {
        asked.push(computers);
        return { computerId: macMini.id, mode: "start", source: "jev/jev-1.13.0" };
      },
    });
    try {
      const task = w.task("follow", "Continue: ship the ledger export");
      expect(await w.start(task)).toMatchObject({ computerId: macMini.id });
      expect(asked).toEqual([
        [
          expect.objectContaining({
            computerId: null,
            name: "Kun's MacBook Pro",
            here: true,
            status: "room",
          }),
          expect.objectContaining({
            computerId: macMini.id,
            name: "Mac mini",
            here: false,
            status: "room",
          }),
        ],
      ]);
      expect(w.tasks.get(task.id)?.placement?.snapshot.picked).toEqual({
        source: "jev/jev-1.13.0",
      });
      expect(w.tasks.timeline(task.id).map((event) => event.text)).toContain(
        "Automatic chose Mac mini: the decision model picked it, reading your standing directions (answered by jev/jev-1.13.0).",
      );
    } finally {
      w.dispose();
    }
  });

  it("keeps the ordinary rules when the model is unsure, and asks once", async () => {
    let asks = 0;
    const w = pickWorld({
      allowed: () => true,
      pick: async () => {
        asks += 1;
        return undefined;
      },
    });
    try {
      const task = w.task("unsure", "Fix the ledger totals");
      expect(await w.start(task)).toMatchObject({ computerId: null });
      expect(asks).toBe(1);
      expect(w.tasks.get(task.id)?.placement?.snapshot.picked).toBeUndefined();
    } finally {
      w.dispose();
    }
  });

  it("asks nothing while the switch is off", async () => {
    let asks = 0;
    const w = pickWorld({
      allowed: () => false,
      pick: async () => {
        asks += 1;
        return { computerId: macMini.id, mode: "start" };
      },
    });
    try {
      expect(await w.start(w.task("off", "Fix the ledger header"))).toMatchObject({
        computerId: null,
      });
      expect(asks).toBe(0);
    } finally {
      w.dispose();
    }
  });

  it("waits for room on the picked computer with words naming the pick", async () => {
    let mode: "start" | "wait" = "start";
    const w = pickWorld({
      allowed: () => true,
      pick: async () => ({ computerId: macMini.id, mode }),
    });
    try {
      for (const id of ["one", "two", "three"])
        expect(await w.start(w.task(id, `Preparing ${id}`))).toMatchObject({
          computerId: macMini.id,
        });
      mode = "wait";
      expect(await w.start(w.task("waits", "Fix the ledger footer"))).toMatchObject({
        wait: {
          kind: "room",
          words:
            "Waiting for room on Mac mini: the decision model picked it, reading your standing directions. Existing work stays where it started.",
        },
      });
    } finally {
      w.dispose();
    }
  });

  it("with no answer, keeps a follow-up beside the computer the task it was filed from ran on", async () => {
    const w = pickWorld(undefined);
    try {
      const origin = seedTask(w.tasks, {
        id: "origin",
        title: "Ship the ledger export",
        status: "completed",
        outcome: "Merged.",
        repoId: ledger.id,
        deviceId: macMini.id,
      });
      const follow = w.task("follow", "Continue: ship the ledger export");
      w.tasks.graph.link(follow.id, origin.id, "discovered-from", "host");
      expect(await w.start(follow)).toMatchObject({ computerId: macMini.id });
      expect(w.tasks.get(follow.id)?.placement?.snapshot.basis?.taskId).toBe(origin.id);
    } finally {
      w.dispose();
    }
  });

  // INF-1389: the captain named Fable for a task, and it started on a Mac mini
  // with no Fable sign-in, on another model. A named model now starts only
  // where it is served, whatever the decision model picks, or the task waits
  // and says so, naming the model, for the first mate to ask the captain.
  describe("with a model the captain named", () => {
    const fable = "claude-fable-5-2";
    const named: WorkShape = { kind: "fix", override_model_id: fable };
    const serves: RoutePreview = {
      ...opus,
      result: { ...opus.result, choice: { provider: "anthropic-claude", id: fable }, rule: "R0" },
      named: { model: fable, served: true },
    };
    const substitutes: RoutePreview = {
      ...opus,
      preferenceRank: 1,
      named: { model: fable, served: false },
    };
    /** Routing where `here` answers for this computer and `there` for the Mac mini's own sign-ins. */
    const routing = (here: RoutePreview, there: RoutePreview) =>
      ({
        prepare: preparePolicyOnlyRoute,
        inOrder: orderPolicyOnlyRoute,
        dynamicEnabled: () => true,
        preview: (_prompt: string, _shape: WorkShape, prepared: { pool?: unknown }) =>
          prepared.pool ? there : here,
        commit: (_taskId: string, preview: RoutePreview) => preview.result,
      }) as unknown as Router;

    it("starts where it is served, never on the Mac mini the decision model would pick", async () => {
      let asks = 0;
      const w = pickWorld(
        {
          allowed: () => true,
          pick: async () => {
            asks += 1;
            return { computerId: macMini.id, mode: "start" };
          },
        },
        { router: routing(serves, substitutes) },
      );
      try {
        const task = w.task("fable", "Find why the phone hides the Mac mini's crew");
        expect(await w.start(task, named)).toMatchObject({
          computerId: null,
          routed: serves.result,
        });
        // Only one computer serves it, so there is nothing to choose between.
        expect(asks).toBe(0);
      } finally {
        w.dispose();
      }
    });

    it("waits, naming the model, when no computer serves it", async () => {
      const w = pickWorld(undefined, { router: routing(substitutes, substitutes) });
      try {
        const task = w.task("fable", "Find why the phone hides the Mac mini's crew");
        expect(await w.start(task, named)).toEqual({
          wait: { kind: "model", words: placementNamedModelWait(fable) },
          namedUnserved: fable,
        });
        expect(w.tasks.get(task.id)?.placement).toBeNull();
      } finally {
        w.dispose();
      }
    });

    it("waits on the computer it chose, never swapping, once that computer stops serving it", async () => {
      let here = serves;
      const router = routing(serves, substitutes);
      const w = pickWorld(undefined, {
        router: { ...router, preview: () => here } as unknown as Router,
      });
      try {
        const task = w.task("fable", "Find why the phone hides the Mac mini's crew");
        expect(await w.start(task, named)).toMatchObject({ computerId: null });
        const committed = w.tasks.get(task.id)?.placement;
        expect(committed).not.toBeNull();
        // The sign-in that served it went away before the crewmate opened.
        here = substitutes;
        expect(await w.start(w.tasks.get(task.id) ?? task, named)).toEqual({
          wait: { kind: "model", words: placementNamedModelWait(fable) },
          namedUnserved: fable,
        });
        expect(w.tasks.get(task.id)?.placement).toEqual(committed);
      } finally {
        w.dispose();
      }
    });

    it("says nothing of the model when the computer that serves it is refused for another reason", async () => {
      const w = pickWorld(undefined, {
        router: routing(serves, substitutes),
        // This computer serves the model but cannot clone the project.
        localFacts: async () => ({ ...facts, projectAccess: "unavailable" }),
      });
      try {
        const task = w.task("fable", "Find why the phone hides the Mac mini's crew");
        expect(await w.start(task, named)).toEqual({
          wait: { kind: "model", words: PLACEMENT_MODEL_WAIT },
        });
      } finally {
        w.dispose();
      }
    });
  });
});
