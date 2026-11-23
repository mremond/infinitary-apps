import { z } from "zod";
import { chipWords, HERE, SYSTEM_WORDS } from "./deviceNames";
import {
  type ComputerReach,
  computerReachSchema,
  type DeviceSystem,
  deviceChipSchema,
  deviceSystemSchema,
  servedAwayWord,
} from "./devices";
import { computerResourceReadingSchema, RESOURCE_READ_TIMEOUT_MS } from "./resources";
import { computerSignInsSchema } from "./signIns";

/** Work platforms only; a paired phone or an unsupported OS is not a worker. */
export const placementSystemSchema = z.enum(["macos", "linux"]);
export type PlacementSystem = z.infer<typeof placementSystemSchema>;
/**
 * A system Automatic compares: a declared one, or the home's own when
 * nobody declared one, and what a computer that runs work answers it runs
 * (docs/windows.md, "Automatic on a Windows home"). Windows is in this set
 * but not in the one a project declares above, which views read: a project
 * cannot declare it, so a task inherits it only from a Windows home, and a
 * saved snapshot leaves it out of its systems (`publishedSystems`). Only a
 * home reads a computer's answer, and a home from before the
 * `windows-runs-work` change never asks a Windows PC, which it pairs as a
 * device that only controls.
 */
export const workSystemSchema = z.enum(["macos", "linux", "windows"]);
export type WorkSystem = z.infer<typeof workSystemSchema>;

/** The systems a published shape may carry: all of them, or none when one has no published word. */
export function publishedSystems(systems: readonly WorkSystem[]): PlacementSystem[] | undefined {
  const published = systems.flatMap((system) => {
    const parsed = placementSystemSchema.safeParse(system);
    return parsed.success ? [parsed.data] : [];
  });
  return published.length === systems.length ? published : undefined;
}
export const placementProfileSchema = z.enum(["conversation", "standard", "heavy"]);
export type PlacementProfile = z.infer<typeof placementProfileSchema>;

/**
 * Explicit project requirements and task refinements, never inferred from text.
 * Omitted platform fields inherit the home platform, not universal portability.
 * A task narrows declared platforms and adds tools; it cannot waive project needs.
 */
export const placementRequirementsSchema = z.strictObject({
  systems: z.array(placementSystemSchema).min(1).max(2).optional(),
  chips: z.array(deviceChipSchema).min(1).max(2).optional(),
  tools: z
    .array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/))
    .max(32)
    .optional(),
  profile: placementProfileSchema.optional(),
});
export type PlacementRequirements = z.infer<typeof placementRequirementsSchema>;
/** A platform field filled from this computer's own because nobody declared it (INF-1456). */
export const placementInheritedSchema = z.enum(["systems", "chips"]);
export type PlacementInherited = z.infer<typeof placementInheritedSchema>;

/** Advisory admission budget, not an enforced process limit or measured prediction. */
export type PlacementDemand = { cpu: number; memoryBytes: number };
const GIB = 1024 ** 3;
export const PLACEMENT_DEMANDS: Readonly<Record<PlacementProfile, Readonly<PlacementDemand>>> = {
  conversation: { cpu: 0.25, memoryBytes: GIB / 2 },
  standard: { cpu: 0.5, memoryBytes: 2 * GIB },
  heavy: { cpu: 2, memoryBytes: 4 * GIB },
};

export type PlacementFact = "available" | "unavailable" | "unknown";
export const placementRejectionSchema = z.enum([
  "requirements-invalid",
  "out-of-reach",
  "older-firstmate",
  "work-disabled",
  "bound-elsewhere",
  "platform-unknown",
  "system-incompatible",
  "chip-incompatible",
  "tool-unknown",
  "tool-unavailable",
  "project-unknown",
  "project-unavailable",
  "model-unknown",
  "model-unavailable",
  "model-floor",
  "physical-computer-unknown",
  "resources-unknown",
  "resources-stale",
  "resources-invalid",
  "reservations-invalid",
  "memory-unavailable",
  "cpu-busy",
  "memory-busy",
  "model-preferred-elsewhere",
]);
export type PlacementRejection = z.infer<typeof placementRejectionSchema>;

export const AUTOMATIC_COMPUTER = "automatic";
export const AUTOMATIC_WORD = "Automatic";
export const PLACEMENT_FACTS_ORDER = "inf:computer:placement";
export const PLACEMENT_FACTS_SINCE = "8.0.0";
export const PLACEMENT_FACT_MAX_AGE_MS = 10_000;
/**
 * The ask's way to a computer that runs work and its answer's way back: the
 * home's limit on the ask (`RESOURCE_READ_TIMEOUT_MS`) runs from before the
 * ask leaves, so that computer's own read must end this much sooner.
 */
const PLACEMENT_FACTS_TRAVEL_MS = 1_000;
/**
 * How long a computer that runs work reads its placement facts before it
 * answers with what it has (`answerPlacementFacts`), so the answer reaches
 * the home within the home's limit (INF-3164).
 */
export const PLACEMENT_FACTS_ANSWER_MS = RESOURCE_READ_TIMEOUT_MS - PLACEMENT_FACTS_TRAVEL_MS;

const factSchema = z.enum(["available", "unavailable", "unknown"]);
// Project and task can each name 32 different programs, plus the implicit Git requirement.
const RESOLVED_TOOL_LIMIT = 65;
export const placementFactsRequestSchema = z.strictObject({
  tools: z.array(placementRequirementsSchema.shape.tools.unwrap().element).max(RESOLVED_TOOL_LIMIT),
  /** The exact project's origin, stripped of embedded sign-in material. */
  origin: z.string().min(1).max(4096).optional(),
});
export type PlacementFactsRequest = z.infer<typeof placementFactsRequestSchema>;
export const placementFactsSchema = z.object({
  system: workSystemSchema.optional(),
  chip: deviceChipSchema.optional(),
  /**
   * Hash of the system identity of the computer its readings measure, a virtual
   * machine's own, common to every user; unknown fails closed.
   */
  physicalComputerId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  tools: z.record(z.string(), factSchema),
  projectAccess: factSchema,
});
export type PlacementFacts = z.infer<typeof placementFactsSchema>;
export const placementFactsAnswerSchema = placementFactsSchema.extend({
  /** Actual identities served by this computer's own accounts, never the home's catalog. */
  signIns: computerSignInsSchema.nullable(),
});

const demandSchema = z.object({
  cpu: z.number().nonnegative(),
  memoryBytes: z.number().int().nonnegative(),
});
const modelSchema = z.object({ provider: z.string().max(256), id: z.string().max(256) });
/** One bounded historical explanation, saved at commitment, never read as fresh capacity. */
export const placementSnapshotSchema = z.object({
  version: z.literal(1),
  at: z.number(),
  computerId: z.string().nullable(),
  computerName: z.string().max(256),
  physicalComputerId: z.string().regex(/^[a-f0-9]{64}$/),
  orderId: z.string().min(1).max(128),
  origin: z.string().max(4096).optional(),
  /** Present only when an answered basis changed the ordinary placement winner. */
  basis: z
    .object({
      taskId: z.string(),
      taskKey: z.string(),
      computerId: z.string().nullable(),
    })
    .optional(),
  /**
   * Present when the decision model picked this computer, reading the
   * person's standing directions (`src/core/placed/computerChoice.ts`), with
   * the model that answered. Absent when the ordinary rules chose.
   */
  picked: z.object({ source: z.string().max(256).optional() }).optional(),
  demand: demandSchema,
  model: modelSchema,
  acceptedFallback: z.boolean(),
  requirements: placementRequirementsSchema.extend({
    tools: z
      .array(placementRequirementsSchema.shape.tools.unwrap().element)
      .max(RESOLVED_TOOL_LIMIT),
    /** The platform fields filled from the home's own; absent on a historical snapshot. */
    inherited: z.array(placementInheritedSchema).max(2).optional(),
  }),
  candidateCount: z.number().int().positive(),
  candidates: z
    .array(
      z.object({
        computerId: z.string().nullable(),
        name: z.string().max(256),
        physicalComputerId: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        rejections: z.array(placementRejectionSchema).max(32),
        /** The core's one reach reading when it was compared; absent for this Mac and on a historical row. Out of reach reads connecting while it was connecting. */
        reach: computerReachSchema.optional(),
        /** It was being updated when it was compared (`DeviceView.updating`); absent otherwise. */
        updating: z.literal(true).optional(),
        missingTools: z.array(z.string().max(80)).max(RESOLVED_TOOL_LIMIT),
        /** What its fresh reading said it runs; absent when unread and on a historical row. */
        system: deviceSystemSchema.optional(),
        chip: deviceChipSchema.optional(),
        reading: computerResourceReadingSchema,
        factsAgeMs: z.number().nonnegative().nullable(),
        capacity: demandSchema.nullable(),
        reserved: demandSchema,
        remaining: demandSchema.nullable(),
        model: modelSchema.nullable(),
        preferenceRank: z.number().nonnegative().nullable(),
      }),
    )
    .max(64),
});
export type PlacementSnapshot = z.infer<typeof placementSnapshotSchema>;
export const committedPlacementSchema = z.object({
  snapshot: placementSnapshotSchema,
  /** Pending until a proven end, or a later observation includes running demand. */
  reservation: z.enum(["pending", "observed", "ended"]),
  /** Written before asynchronous preparation, so closing an unsent start is provably safe. */
  preparationStarted: z.boolean().optional(),
});
export type CommittedPlacement = z.infer<typeof committedPlacementSchema>;

export function placementReason(
  snapshot: Pick<PlacementSnapshot, "computerName" | "basis" | "picked">,
): string {
  if (snapshot.picked)
    return `Automatic chose ${snapshot.computerName}: the decision model picked it, reading your standing directions${snapshot.picked.source ? ` (answered by ${snapshot.picked.source})` : ""}.`;
  const beside = snapshot.basis
    ? ` This kept the task beside its basis, ${snapshot.basis.taskKey}, without changing model preference.`
    : "";
  return `Automatic chose ${snapshot.computerName}: it can run this project and had room to start.${beside}`;
}
const STAYS = "Existing work stays where it started.";
/** A wait whose computers have not been compared yet. */
export const PLACEMENT_WAIT = `Waiting for a compatible computer with room to start. ${STAYS}`;
export const PLACEMENT_MODEL_WAIT = `Waiting for a computer with a model that can take this task. ${STAYS}`;
/** The model wait of a task whose model the captain named, which runs only where it is served. */
export function placementNamedModelWait(model: string): string {
  return `Waiting for a computer whose sign-ins serve ${model}, the model you asked for. ${STAYS}`;
}
export const PLACEMENT_HELD_WAIT = `Waiting for room set aside for other tasks that are starting. ${STAYS}`;

/**
 * What a wait waits for, as Activity tells waits apart: a model, room on a
 * computer, or each computer's other reasons. Room covers spare processing
 * capacity, spare memory and room set aside for other starts, which one
 * quarter-second reading to the next can trade, and a wait not yet compared.
 * The words name the check from the latest readings; Activity says a wait
 * again only when this changes.
 */
export const placementWaitKindSchema = z.enum(["model", "room", "other"]);
export type PlacementWaitKind = z.infer<typeof placementWaitKindSchema>;
/** The latest Automatic wait: what it waits for, and the words that say why. */
export const placementWaitSchema = z.object({
  kind: placementWaitKindSchema,
  words: z.string(),
  /** When this kind of placement wait began; unchanged by fresh resource readings. */
  since: z.number().optional(),
});
export type PlacementWait = z.infer<typeof placementWaitSchema>;
export const UNCOMPARED_WAIT: PlacementWait = { kind: "room", words: PLACEMENT_WAIT };

const BUSY_REJECTIONS: readonly PlacementRejection[] = ["cpu-busy", "memory-busy"];
const ROOM_REJECTIONS: readonly PlacementRejection[] = [
  ...BUSY_REJECTIONS,
  "model-preferred-elsewhere",
];
const MODEL_REJECTIONS: readonly PlacementRejection[] = ["model-unavailable", "model-floor"];
const FLOOR_REJECTIONS: readonly PlacementRejection[] = ["model-floor"];

/** Whether some computer was refused for these reasons alone. */
function onlyFor(
  rejections: readonly (readonly PlacementRejection[])[],
  reasons: readonly PlacementRejection[],
): boolean {
  return rejections.some(
    (row) => row.length > 0 && row.every((reason) => reasons.includes(reason)),
  );
}

/** One compared computer, as a wait reads it. */
export type PlacementWaitRow = {
  /** The computer's name, as Task Details writes it. */
  name: string;
  rejections: readonly PlacementRejection[];
  /** The core's one reach reading; absent for this Mac. Out of reach reads connecting while it is connecting. */
  reach?: ComputerReach | undefined;
  /** It is being updated (`DeviceView.updating`): out of reach reads updating. */
  updating?: true | undefined;
  /** Its own room before pending starts are taken off; null when unknown. */
  capacity: PlacementDemand | null;
};

/** The room checks, in the order a wait names them. */
const ROOM_CHECKS = [
  {
    reason: "cpu-busy",
    words: "processing capacity",
    fits: (room, demand) => room.cpu >= demand.cpu,
  },
  {
    reason: "memory-busy",
    words: "memory",
    fits: (room, demand) => room.memoryBytes >= demand.memoryBytes,
  },
] as const satisfies readonly {
  reason: PlacementRejection;
  words: string;
  fits: (room: PlacementDemand, demand: PlacementDemand) => boolean;
}[];

/**
 * Why an Automatic start waits, from each computer's typed rejections: the
 * model when a computer that could otherwise take the task was refused only
 * for its model and none waits only for room. Otherwise the check that
 * refused the computers that could take it but for room: its own spare
 * processing capacity or memory, or only the room set aside for other tasks
 * that are starting. With no such computer, each computer's own reasons.
 */
export function placementWait(
  rows: readonly PlacementWaitRow[],
  demand: PlacementDemand,
  /** The model the captain named, when no computer whose models were read serves it: its model wait names it. */
  named?: string,
): PlacementWait {
  const rejections = rows.map((row) => row.rejections);
  if (onlyFor(rejections, MODEL_REJECTIONS) && !onlyFor(rejections, ROOM_REJECTIONS))
    return {
      kind: "model",
      words: named ? placementNamedModelWait(named) : PLACEMENT_MODEL_WAIT,
    };
  const busy = rows.filter(
    (row) =>
      row.rejections.length > 0 &&
      row.rejections.every((reason) => BUSY_REJECTIONS.includes(reason)),
  );
  if (busy.length > 0) {
    // Short on its own reading, or short only once other starts' room is taken off.
    const short = new Set<PlacementRejection>();
    let held = false;
    for (const row of busy)
      for (const check of ROOM_CHECKS) {
        if (!row.rejections.includes(check.reason)) continue;
        if (row.capacity && check.fits(row.capacity, demand)) held = true;
        else short.add(check.reason);
      }
    if (short.size === 0) return { kind: "room", words: PLACEMENT_HELD_WAIT };
    const what = ROOM_CHECKS.filter((check) => short.has(check.reason))
      .map((check) => check.words)
      .join(" and ");
    return {
      kind: "room",
      words: [
        `Waiting for a compatible computer with spare ${what} to start.`,
        ...(held ? ["Other tasks that are starting also hold some of its room."] : []),
        STAYS,
      ].join(" "),
    };
  }
  const why = rows
    .filter((row) => row.rejections.length > 0)
    .map((row) => `${row.name}: ${rejectionWords(row.rejections, row)}.`);
  return why.length > 0
    ? {
        kind: "other",
        words: ["Waiting for a computer that can take this task.", ...why, STAYS].join(" "),
      }
    : UNCOMPARED_WAIT;
}

/**
 * Whether an Automatic start waits for the level its task asked for, a
 * premium ask or an escalation's rung: a computer that could otherwise take
 * it was refused only for that level, and none waits only for room. Such a
 * wait is held on that level's reset, as a This computer start is.
 */
export function placementFloorHold(
  rejections: readonly (readonly PlacementRejection[])[],
): boolean {
  return onlyFor(rejections, FLOOR_REJECTIONS) && !onlyFor(rejections, ROOM_REJECTIONS);
}

const REJECTION_WORDS: Record<PlacementRejection, string> = {
  "requirements-invalid": "requirements could not be resolved",
  "out-of-reach": "out of reach",
  "older-firstmate": "has an older Infinitary",
  "work-disabled": "not taking work",
  "bound-elsewhere": "the task stays on its chosen computer",
  "platform-unknown": "system or architecture unknown",
  "system-incompatible": "different required system",
  "chip-incompatible": "different required architecture",
  "tool-unavailable": "a required program was missing",
  "tool-unknown": "a required program could not be checked",
  "project-unavailable": "project unavailable",
  "project-unknown": "project access could not be checked",
  "model-unknown": "available models unknown",
  "model-unavailable": "no suitable model available",
  "model-floor": "waiting for the requested level",
  "physical-computer-unknown": "physical computer could not be identified",
  "resources-stale": "resource reading was too old",
  "resources-unknown": "resources could not be checked",
  "resources-invalid": "resource reading was invalid",
  "memory-unavailable": "available memory unknown",
  "reservations-invalid": "pending work could not be checked",
  "model-preferred-elsewhere": "another computer better met the requested model or level",
  "cpu-busy": "not enough spare processing capacity",
  "memory-busy": "not enough spare memory",
};

/**
 * A computer's rejections in words; out of reach reads updating while it was
 * being updated, and connecting while its connection was being made (`awayWord`).
 */
function rejectionWords(
  rejections: readonly PlacementRejection[],
  away: { reach?: ComputerReach | undefined; updating?: true | undefined },
  said: Partial<Record<PlacementRejection, string>> = {},
): string {
  return rejections
    .map(
      (reason) =>
        said[reason] ??
        (reason === "out-of-reach" && (away.updating || away.reach === "connecting")
          ? servedAwayWord(away.reach === "connecting", away.updating)
          : REJECTION_WORDS[reason]),
    )
    .join("; ");
}

/**
 * A refusal for a system or chip nobody declared, in the words that say so
 * (INF-1456): "Intel, while this task was held to Apple silicon, inherited
 * from this computer". Only for a reason the snapshot says was inherited and
 * a row that said what it runs.
 */
function inheritedWords(
  snapshot: PlacementSnapshot,
  candidate: PlacementSnapshot["candidates"][number],
): Partial<Record<PlacementRejection, string>> {
  if (!candidate.system && !candidate.chip) return {};
  const inherited = snapshot.requirements.inherited ?? [];
  const held = (what: string) =>
    `, while this task was held to ${what}, inherited from ${HERE.this}`;
  // A Windows home's own system has no published word, so its snapshot
  // leaves systems out (`publishedSystems`); its own row says it.
  const homeSystem = snapshot.candidates.find((row) => row.computerId === null)?.system;
  const systems: DeviceSystem[] = snapshot.requirements.systems ?? (homeSystem ? [homeSystem] : []);
  const home = systems.length === 1 ? systems[0] : undefined;
  return {
    ...(inherited.includes("systems") && candidate.system
      ? {
          "system-incompatible": `${SYSTEM_WORDS[candidate.system]}${held(systems.map((system) => SYSTEM_WORDS[system]).join(" or "))}`,
        }
      : {}),
    ...(inherited.includes("chips") && candidate.chip
      ? {
          "chip-incompatible": `${chipWords(candidate.chip, candidate.system)}${held(
            (snapshot.requirements.chips ?? []).map((chip) => chipWords(chip, home)).join(" or "),
          )}`,
        }
      : {}),
  };
}

/** Past-tense explanations: these readings describe the commitment, never now. */
export function placementCandidateLines(snapshot: PlacementSnapshot): string[] {
  const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
  return [
    ...snapshot.candidates.map((candidate) => {
      const verdict =
        candidate.computerId === snapshot.computerId
          ? "chosen"
          : rejectionWords(candidate.rejections, candidate, inheritedWords(snapshot, candidate)) ||
            (snapshot.basis
              ? "compatible; the basis computer was preferred"
              : "compatible, with less room to start");
      const capacity = candidate.remaining
        ? ` After pending work: ${candidate.remaining.cpu.toFixed(1)} CPUs and ${gib(candidate.remaining.memoryBytes)} GiB memory available.`
        : "";
      const age =
        candidate.reading.status === "fresh"
          ? ` Reading age: ${(candidate.reading.ageMs / 1000).toFixed(1)} seconds.`
          : "";
      return `${candidate.name}: ${verdict}.${capacity}${age}`;
    }),
    ...(snapshot.candidateCount > snapshot.candidates.length
      ? [
          `${snapshot.candidateCount - snapshot.candidates.length} other computers are outside this saved summary.`,
        ]
      : []),
  ];
}

/**
 * A started task's move to another computer, kept on its record so a
 * restart finds it (docs/helper.md, "Moving a started task"). `from` and
 * `to` are a computer that runs work by its device id, or `this-mac`.
 * `waiting`: asked for, until a safe pause. `moving`: its work is crossing;
 * the record still names `from`. `retiring`: the record names `to`, and the
 * working copy left on `from` (in `fromDir` when that is this Mac) is
 * being removed. `undoing`: a move that did not finish, whose copy made on
 * `to` is being removed; the task stays on `from`. `restartFrom`: written
 * with the commit, the conversation the task left on `from`; until a new
 * conversation opens on `to`, told of it, nothing resumes that one there.
 * `preparing`: written with the commit too, and cleared once the new
 * conversation's dependencies installed on `to`; until then nothing on its
 * lane starts a turn, and a restart installs them again first.
 * `keep`: files git ignores in the working copy that must move too, by
 * their paths in it, as the move's ask named them; every other ignored file
 * stays and goes with the old copy.
 * `away`: the captain moved it while `from` was out of reach, leaving
 * behind what `from` holds (docs/helper.md, "Moving a task off a computer
 * that is out of reach"): it continues on `to` from `head`, the commit this
 * Mac held of its branch, brought home at `at` when that is known.
 */
export const computerMoveSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  by: z.enum(["captain", "firstmate"]),
  at: z.number(),
  phase: z.enum(["waiting", "moving", "retiring", "undoing"]),
  fromDir: z.string().optional(),
  restartFrom: z.string().optional(),
  preparing: z.literal(true).optional(),
  keep: z.array(z.string().min(1).max(4096)).max(256).optional(),
  away: z.object({ head: z.string().min(1), at: z.number().optional() }).optional(),
  problem: z.string().optional(),
});
export type ComputerMove = z.infer<typeof computerMoveSchema>;

/**
 * The commit this Mac last brought home of the branch of a task that runs
 * on a computer that runs work, and when (docs/helper.md, "Moving a task off
 * a computer that is out of reach"): what a move continues from when that
 * computer is out of reach. Written only by the host.
 */
export const homeCopySchema = z.object({ sha: z.string().min(1), at: z.number() });
export type HomeCopy = z.infer<typeof homeCopySchema>;

/**
 * What a task left on a computer it moved off while that computer was out
 * of reach (docs/helper.md, "Moving a task off a computer that is out of
 * reach"): `from` by its device id, `head` the commit the move continued
 * from, `at` when it moved. Once that computer is back, `kept` is what
 * this Mac saved of the copy's unmerged work - its commit, the ref here
 * that holds it, and the working copy's folder there - and `told` says the
 * task's crewmate was told where. The copy stays there until the task
 * moves back to that computer or closes; `removed` says when it went.
 */
export const awayCopySchema = z.object({
  from: z.string().min(1),
  head: z.string().min(1),
  at: z.number(),
  kept: z
    .object({
      sha: z.string().min(1).optional(),
      ref: z.string().min(1).optional(),
      folder: z.string().min(1).optional(),
      at: z.number(),
      removed: z.number().optional(),
    })
    .optional(),
  told: z.literal(true).optional(),
});
export type AwayCopy = z.infer<typeof awayCopySchema>;
