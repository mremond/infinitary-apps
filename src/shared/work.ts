import { z } from "zod";
import { cardFileSchema } from "./cardFiles";
import {
  CARD_MEDIA_KINDS,
  CARD_MEDIA_PIECE_BYTES,
  CARD_SOUND_KINDS,
  CARD_TYPEFACE_KINDS,
} from "./cardPictures";
import { cardReadsSchema, cardViewsSchema } from "./cardReads";
import {
  cardEffectSchema,
  cardMutationSchema,
  cardPictureSchema,
  riskDeclarationSchema,
} from "./cards";
import {
  openChangeInputSchema,
  showMergeCardInputSchema,
  stagedChangePresentationSchema,
} from "./changePresentation";
import { checkChangeInputSchema } from "./checkRepair";
import { crewResponseSchema } from "./crewResponses";
import { crewSpeedSchema, speedSelectionSchema } from "./crewSpeed";
import { cutOffSchema, fmEventSchema } from "./events";
import { filesAnswerSchema, filesReadInputSchema } from "./files";
import { closeOrder } from "./leftoverPrograms";
import { keptValidationInputSchema } from "./liveValidation";
import { personalVersionSchema } from "./personalSet";
import {
  PLACEMENT_FACTS_ORDER,
  placementFactsAnswerSchema,
  placementFactsRequestSchema,
} from "./placement";
import { privateSiteSchema } from "./privateSites";
import { putOffUntilSchema } from "./putOff";
import { reasoningSchema } from "./reasoning";
import { keptRecoveryWaySchema, workWaitSchema } from "./recovery";
import { requiredActionRevisionInputSchema, requiredActionsSchema } from "./requiredActions";
import { runbookSkillFilesSchema } from "./runbooks";
import { sourceIdentitySchema } from "./selfSource";
import { heldSignInSchema, taskBrowserFactSchema, taskBrowserFrameSchema } from "./taskBrowser";
import { firstReleaseReportSchema } from "./taskRelease";
import { toolObservationSchema } from "./toolCompletion";
import { commitSchema, placedTaskIdSchema, workingCopyBaseSchema } from "./workIdentity";
import { knowledgeReadInputSchema, recordKnowledgeInputSchema } from "./workKnowledge";
import {
  placedSecretAskAnswerSchema,
  placedSecretAskInputSchema,
  placedSecretTakeAnswerSchema,
  placedSecretUseAnswerSchema,
  placedSecretUseInputSchema,
} from "./workSecrets";
import { updateSaveOrders } from "./workUpdate";

/**
 * A crewmate's conversation held on a computer that runs work (piece 8,
 * docs/helper.md "Holding a conversation"), as the shapes both sides of the
 * connection parse. Nothing here is a new kind of message: both directions
 * ride the connection's own `invoke` and `result` (src/shared/connection.ts).
 *
 * - **Work requests**, asked by the computer of its home: one per tool
 *   callback a crewmate's tools hand the host (a card, a report, a
 *   follow-up, ...), a card picture's bytes, a background job's end, and the
 *   numbered events of what the conversation did. They are core channels in
 *   `src/shared/ipc.ts` whose `reach` is `work`. Each carries the task and a
 *   `callId` the computer chose once; after a drop it asks again under the
 *   same `callId`, and the home answers a repeat from what it kept.
 * - **Orders**, asked by the home of the computer: open a conversation,
 *   prompt it, steer it, abort, detach or close it, list what the computer
 *   holds, and copy a conversation's record; and make, read, keep and
 *   retire the task's working copy there (piece 10, docs/helper.md "Its
 *   working copies"). Each that acts carries an `orderId` taken from
 *   something the home saved, and the computer answers a repeat without
 *   acting again.
 *
 * The crewmate's tools run on the computer, where its files are; only what a
 * tool hands the host crosses. The computer asks nothing until a home has
 * opened a conversation on it, so a home that never does never sees a work
 * request.
 */

/** A task id as the home mints it; it names a folder on the computer, so nothing else passes. */
export { placedTaskIdSchema, type WorkingCopyBase, workingCopyBaseSchema } from "./workIdentity";

/**
 * The refs a source bundle may name its starting work by
 * (`inf:working-copy:source-ref`): a branch or a kept ref, in letters,
 * digits, `_`, `-` and `/`. A branch git takes with other characters, such
 * as `release/1.2`, crosses under a stand-in ref the sender makes.
 */
export const SOURCE_REF_FROM = /^refs\/(heads|infinitary\/kept|fm3000\/kept)\/[A-Za-z0-9_/-]+$/;

/** The computer's own id for one callback, the same each time it asks again. */
export const workCallIdSchema = z.string().min(1).max(128);

/**
 * An order's id, taken from what the home saved before it asked: the inbox
 * rows a prompt or steer delivers, the task event that asked to stop.
 */
export const workOrderIdSchema = z.string().min(1).max(4096);

/** The most events one `inf:work:events` request carries. */
export const PLACED_EVENTS_MAX_PER_REQUEST = 512;

/**
 * The most bytes one answer or order carries of a file that crosses in
 * pieces: a conversation's record (`inf:session:copy`), a git bundle
 * (`inf:working-copy:read`), a downloaded artifact (`inf:working-copy:artifact`).
 */
export const PLACED_COPY_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * The most files one `inf:session:copy` order names in `from`; a computer
 * refuses an order that names more, so the home's copy names past it only
 * what that computer still holds (`RecordCopy`).
 */
export const SESSION_COPY_FROM_MAX = 1024;

/** A card picture's or project font's bytes, base64: room for the card tool's 8 MiB cap. */
const PICTURE_DATA_MAX_CHARS = 11_200_000;

/** One piece of a demo recording, base64: room for `CARD_MEDIA_PIECE_BYTES`. */
const RECORDING_PIECE_MAX_CHARS = Math.ceil(CARD_MEDIA_PIECE_BYTES / 3) * 4;
/** A demo recording's whole size: the card tool's 16 MiB cap. */
const RECORDING_MAX_BYTES = 16 * 1024 * 1024;

/** Where a computer that runs work keeps its tasks' working copies (`WorkingCopies`). */
export function worktreesDirOf(dataDir: string): string {
  return `${dataDir}/worktrees`;
}

/**
 * Where a computer keeps one task's conversation, under the folder its
 * roster names (`tasksDir`), and its working copy, under the folder the
 * roster names for those (`worktreesDir`). The home writes the crewmate's
 * instructions with these paths, so the crewmate reads the folders it
 * actually has. Both sides are Macs, so the separator is a slash.
 */
export function placedTaskFolders(tasksDir: string, task: string, worktreesDir?: string) {
  const root = `${tasksDir}/${task}`;
  return {
    root,
    /**
     * The working copy: the task's own git worktree there, or an empty
     * folder of the conversation's on a computer that keeps none.
     */
    work: worktreesDir ? `${worktreesDir}/${task}` : `${root}/work`,
    /** The conversation's record, which the home copies at each turn's end. */
    sessions: `${root}/sessions`,
    /** The verified copies of the pictures its cards name. */
    cards: `${root}/cards`,
    cardBodies: `${root}/card-bodies`,
    sourceCards: `${root}/source-cards`,
    evidence: `${root}/evidence`,
    /** Bulk working material. Removed when the task closes, not after a week. */
    temp: `${root}/temp`,
  };
}

const modelRefSchema = z.object({ provider: z.string().min(1), id: z.string().min(1) });

const sessionImageSchema = z.object({
  mimeType: z.string().min(1).max(64),
  data: z.string().min(1).max(PICTURE_DATA_MAX_CHARS),
});

const controlProfileSchema = z.object({
  steer: z.enum(["native", "followup-queue"]),
  interruptGranularity: z.enum(["turn", "process"]),
  quotaEvents: z.boolean(),
  backgroundWork: z.enum(["host", "client"]),
  failureSignals: z.enum(["typed", "text"]),
});

/**
 * What a held conversation is now, as the computer last saw it: what the
 * home's stand-in for the session answers from without asking.
 */
export const placedStateSchema = z.object({
  sessionId: z.string(),
  backend: z.enum(["pi", "claude"]),
  controlProfile: controlProfileSchema,
  streaming: z.boolean(),
  /** Where it resumes from on the computer: its record file, or its Claude session id. */
  resume: z.string().optional(),
  /**
   * Its record, by its path under the task's `sessions` folder: the name the
   * home's copy of it goes by (`inf:session:copy`).
   */
  record: z.string().min(1).max(1024).optional(),
  model: modelRefSchema.optional(),
  modelLabel: z.string().optional(),
  reasoning: reasoningSchema.optional(),
  /**
   * The session this one started over from, when an open renewed it, until
   * a turn of the new conversation finishes: a home that opens it before
   * then, here or again after a restart, has yet to tell the crewmate why.
   */
  renewal: z
    .object({ from: z.string(), changed: z.array(z.enum(["prompt", "instructions"])) })
    .optional(),
  /**
   * The computer's own account the conversation is bound to there, which its
   * usage and a cut-off it meets belong to; never one of the home's. Absent
   * when it is bound to none of the computer's accounts (Claude on that
   * user's login, with no account of Firstmate's there), or from a computer
   * older than this.
   */
  accountId: z.string().min(1).max(256).optional(),
  /** The home's personal set it read as it opened (`inf:session:personal`); absent when none. */
  personal: personalVersionSchema.optional(),
});
export type PlacedState = z.infer<typeof placedStateSchema>;

/**
 * What the home opens a conversation with. The binding crosses as a
 * description, and the computer resolves it with its own sign-ins; the
 * instructions are the home's, written with the computer's folders; `tools`
 * names the crewmate tools to bind, each to callbacks that ask the home.
 */
export const placedSpecSchema = z.object({
  /** Home build identity only; each computer resolves its own source path. */
  homeSource: sourceIdentitySchema.optional(),
  /** Resolve the home’s saved speed before each request; eligibility stays on this computer. */
  speed: z.boolean().optional(),
  binding: z.object({
    backend: z.enum(["pi", "claude"]),
    accountId: z.string().min(1).max(256).optional(),
    provider: z.string().min(1).max(256).optional(),
  }),
  model: modelRefSchema.optional(),
  thinking: z.object({
    level: z.enum(["low", "medium", "high", "xhigh", "off"]),
    quick: z.boolean().optional(),
  }),
  instructions: z.string(),
  /** Only the opt-in travels; each computer reads its own user files. */
  personalResources: z.boolean().optional(),
  runbookSkills: z.array(runbookSkillFilesSchema).optional(),
  tools: z.array(z.string().min(1).max(64)).max(64),
  /** The conversation to reopen, as the computer named it in an earlier state. */
  resume: z.string().min(1).max(4096).optional(),
  /** The provider's retries before a turn fails. */
  retries: z.number().int().nonnegative().max(16).optional(),
  /**
   * The task has its own browser on that computer (docs/task-browser.md,
   * "On another computer"): its crewmate's shell is given `infinitary-browser-axi`
   * and its `emit_card` the browser's door and handoff. The home sends it
   * only to a computer whose roster says it keeps task browsers.
   */
  browser: z.boolean().optional(),
  /**
   * The task's crewmate reaches the home's integrations through
   * `infinitary-integrations-axi` in its shell there, each list, show and
   * call asked of the home (`inf:work:integrations`,
   * `inf:work:use-integration`; docs/integrations.md, "On a computer that
   * runs work"). The home sends it only to a computer that keeps task
   * browsers, whose task channel the command rides.
   */
  integrations: z.boolean().optional(),
  /**
   * The task's crewmate reads files on the captain's other computers through
   * `infinitary-files-axi` in its shell there, each list and copy asked of
   * the home (`inf:work:files`, `inf:work:copy-file`; docs/files.md). The
   * home sends it only to a computer on the current work major that keeps
   * task browsers.
   */
  files: z.boolean().optional(),
  /** The home grants this computer's load command (docs/heavy-runs.md). */
  load: z.boolean().optional(),
  stops: z.boolean().optional(), // infinitary-stops-axi there (docs/leftover-programs.md)
  /**
   * Its crewmate may keep a job the captain asked for past the close
   * (`kept-jobs.md`; docs/leftover-programs.md, "A job the captain asked to
   * keep"). The home sends it only to a computer that lists the change:
   * true, or false for another user on the home's own computer, whose
   * crewmate is refused a keep because the job would run as that user.
   * Absent, a keep is refused too.
   */
  keeps: z.boolean().optional(),
  /**
   * The task's crewmate lists the captain's secrets through
   * `infinitary-secrets-axi` in its shell there, each list asked of the home
   * (`inf:work:secrets`; docs/secrets.md, "Current command seam"): metadata
   * only, with no use, receipt or value. The home sends it only to a
   * computer that keeps task browsers, whose task channel the command rides.
   */
  secrets: z.boolean().optional(),
  /** With `secrets`, uses decided on the home and run there (`secret-uses-elsewhere.md`). */
  secretUses: z.boolean().optional(),
  /** With `secretUses`, asks to keep a secret raised on the home (`secret-asks-elsewhere.md`). */
  secretAsks: z.boolean().optional(),
  /**
   * Only reattach to the conversation held there (`reattach-only-open.md`):
   * one held and running, or idle with the same contract, answers its
   * state; otherwise nothing opens and the answer says `needsOpen`, so the
   * home routes the new conversation before it asks for one.
   */
  reattach: z.boolean().optional(),
  /** An open that failed leaving no new conversation there answers `notOpened` (`open-not-opened.md`). */
  notOpened: z.boolean().optional(),
  /**
   * A new conversation, never the one held there (`fresh-open.md`): an idle
   * one held is let go of and a new one opens; a turn still running there
   * fails the open, which opens nothing, and the home asks again.
   */
  fresh: z.boolean().optional(),
});
export type PlacedSpec = z.infer<typeof placedSpecSchema>;

/**
 * Everything a held conversation tells its home, in order: what a session
 * tells its owner (`SessionEvent`, src/core/session/session.ts), plus where
 * each prompt's turn starts and ends. `turn_ended` carries the steers no turn
 * took in and the state after it, and `interrupted` when the computer quit
 * mid-turn.
 */
export const placedEventSchema = z.union([
  toolObservationSchema,
  fmEventSchema,
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("background_work_changed"),
      count: z.number().int().nonnegative().optional(),
      /**
       * A Pi conversation's longest-running shell job there, by its id and
       * command, while the count is above zero.
       */
      job: z.object({ id: z.string().min(1), command: z.string() }).optional(),
    }),
    z.object({ type: z.literal("turn_closed"), text: z.string().optional() }),
    /**
     * The conversation folded its context (major 15): sent
     * only to a home on the current work major.
     */
    z.object({ type: z.literal("context_compacted") }),
    z.object({ type: z.literal("request_started") }),
    z.object({ type: z.literal("input_read"), textSha256: z.string() }),
    z.object({ type: z.literal("continuation_started") }),
    z.object({
      type: z.literal("continuation_ended"),
      /** The helper ended this work on shutdown/recovery; the home supplies its computer's name. */
      interrupted: z.literal(true).optional(),
      error: z.string().optional(),
      cutOff: cutOffSchema.optional(),
    }),
    z.object({
      type: z.literal("model_served"),
      model: z.object({ provider: z.string(), id: z.string() }),
      fallback: z
        .object({
          from: z.object({ provider: z.string(), id: z.string() }),
          category: z.string().optional(),
        })
        .optional(),
    }),
    z.object({
      type: z.literal("turn_started"),
      turn: z.number().int().positive(),
      orderId: workOrderIdSchema,
    }),
    z.object({
      type: z.literal("turn_ended"),
      turn: z.number().int().positive(),
      outcome: z.enum(["done", "failed", "interrupted"]),
      error: z.string().optional(),
      /** A failed turn its model never took, stopped by an update's save: its words go again. */
      unstarted: z.literal(true).optional(),
      undelivered: z.array(z.string()),
      state: placedStateSchema.optional(),
    }),
  ]),
]);
export type PlacedEvent = z.infer<typeof placedEventSchema>;

/** One numbered event: counted per task from 1, with the computer's own time. */
export const placedEventRecordSchema = z.object({
  seq: z.number().int().positive(),
  at: z.number(),
  event: placedEventSchema,
});
export type PlacedEventRecord = z.infer<typeof placedEventRecordSchema>;

/** The answer to `inf:work:events`: what the home took in, and what it keeps for good. */
export const placedEventsAnswerSchema = z.object({
  /** The newest number the home has; the computer sends on from the next. */
  through: z.number().int().nonnegative(),
  /** The newest number the home will never ask for again; the computer may forget up to it. */
  kept: z.number().int().nonnegative(),
});
export type PlacedEventsAnswer = z.infer<typeof placedEventsAnswerSchema>;

const toolTextSchema = z.object({ text: z.string() });
const doneSchema = z.object({ ok: z.literal(true) });

/**
 * A file one task hands another, by its kept name (`handover-files.md`,
 * INF-992): its sha256's first sixteen digits, then its own name reduced
 * to letters, digits, `_` and `-`, with one extension.
 */
export const HANDOVER_FILE_NAME = /^[0-9a-f]{16}-[A-Za-z0-9_-]{1,100}\.[A-Za-z0-9]{1,16}$/;

/** A handed file as a report declares it: never its content, only its kept name, size and sha256. */
export const handoverFileSchema = z.object({
  file: z.string().regex(HANDOVER_FILE_NAME),
  size: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type HandoverFile = z.infer<typeof handoverFileSchema>;

/** One callback's request: its task, its call, and what the tool handed over. */
function asked<T extends z.ZodRawShape>(shape: T) {
  return z.tuple([z.object({ task: placedTaskIdSchema, callId: workCallIdSchema, ...shape })]);
}

/**
 * A card a crewmate on that computer emitted, as declared: an action may come
 * without a label, which the home's host words or refuses (FI3-249).
 */
export const placedCardSchema = z.object({
  title: z.string(),
  body: z.string(),
  actions: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      default: z.boolean().optional(),
      effect: cardEffectSchema.optional(),
      danger: z.boolean().optional(),
      until: putOffUntilSchema.optional(), // a put-off choice the home keeps and raises again
    }),
  ),
  id: z.string().optional(),
  pictures: z.array(cardPictureSchema).optional(),
  /** Files for the captain kept there, by reference; the home names this computer. */
  files: z.array(cardFileSchema.omit({ computer: true })).optional(),
  presentationRevision: z.number().int().positive().optional(),
  sinceSeen: z.string().optional(), // what changed since the captain last saw a merge card for it
  width: z.enum(["wide", "full"]).optional(),
  holdsPlace: z.boolean().optional(),
  reply: z.string().optional(),
  /** Its reply is a progress note (major 15); an older home drops it. */
  interim: z.boolean().optional(),
  riskDeclaration: riskDeclarationSchema.optional(),
  requiredActions: requiredActionsSchema.optional(),
  asking: z.boolean().optional(),
  designOnly: z.boolean().optional(),
  /** The choice on it is not its task's answer (INF-1226, `Card.continues`). */
  continues: z.boolean().optional(),
  /** It answers the captain's message it is about (INF-1610, `Card.answering`). */
  answering: z.boolean().optional(),
  /** A write on someone else's card (major 15); an older home drops them. */
  expectedRevision: z.string().optional(),
  contributionReason: z.string().optional(),
  operationId: z.string().optional(),
  answersMessage: z.number().int().optional(),
  /** The label of the card's door to its task's browser, from a crewmate whose task has one there. */
  browserButton: z.string().optional(),
  /** Its request that the captain take its browser over (docs/task-browser.md, "Asking for help"). */
  browserHandoff: z
    .object({
      site: z.string(),
      reason: z.string(),
      after: z.string(),
      /** The saved sign-in its browser was given did not sign the page in (docs/task-browser.md, "Signed-in sites"). */
      savedFailed: z.literal(true).optional(),
    })
    .optional(),
  /** Bind the shown ordinary action to a recorded validation request; INF-1824: `gaps` names further gaps of the same version, drawn as one checklist. */
  validationDecision: z
    .object({ request: z.string(), action: z.string(), gaps: z.array(z.string()).optional() })
    .optional(),
  /** The page from its task's project that its browser button opens (docs/task-browser.md, "A page from the project"). */
  browserPage: z.string().optional(),
  /** The live reads and views its body may use while open (`card-live-reads.md`); an older home drops them. */
  reads: cardReadsSchema.optional(),
  sql: cardViewsSchema.optional(),
  /** The ordinary action whose click the home keeps as the captain's yes, and what it covers (docs/delivery-rigor.md, "What the captain already allowed"). */
  allows: z.object({ action: z.string(), covers: z.string() }).optional(),
});

const cardRefusalReasonSchema = z.enum(["checks", "ci-cap", "review", "shape", "other"]);

/** A card answer: shown, or refused with the typed reason a completion card's refusal keeps. */
export const placedCardAnswerSchema = z.union([
  z.object({
    shown: z.literal(true),
    cardId: z.string().optional(),
    /** What a write on someone else's card did (major 15). */
    mutation: cardMutationSchema.optional(),
  }),
  z.object({
    refused: z.object({ message: z.string(), reason: cardRefusalReasonSchema, why: z.string() }),
  }),
]);
export type PlacedCardAnswer = z.infer<typeof placedCardAnswerSchema>;

/**
 * One answer of the home's integrations, as a crewmate's
 * `infinitary-integrations-axi` prints it (docs/integrations.md, "On a
 * computer that runs work"): structured rows, a call's words, or a
 * refusal's. It is what the home's integrations said, never a sign-in.
 */
const integrationAnswerSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  text: z.string().optional(),
  refused: z.enum(["refused", "invalid"]).optional(),
});

/**
 * The captain's secrets as a task on another computer lists them: each
 * one's reference, name, saved version and environment label, and nothing
 * else - no value, receipt or use crosses to that computer.
 */
export const placedSecretsSchema = z.object({
  secrets: z.array(
    z.object({
      ref: z.string(),
      label: z.string(),
      version: z.string(),
      environment: z.string().optional(),
    }),
  ),
});

/**
 * The work requests a computer that runs work asks its home, declared into
 * `invokeContract` (src/shared/channels/work.ts) with `reach: "work"`.
 */
export const workRequests = {
  "inf:work:card": {
    effect: "change",
    request: asked({ card: placedCardSchema }),
    response: placedCardAnswerSchema,
  },
  "inf:work:card-refused": {
    effect: "change",
    request: asked({
      refusal: z.object({ title: z.string(), reason: cardRefusalReasonSchema, why: z.string() }),
    }),
    response: doneSchema,
  },
  "inf:work:close-card": {
    effect: "change",
    request: asked({ cardId: z.string(), reason: z.string().optional() }),
    response: toolTextSchema,
  },
  "inf:work:followup": {
    effect: "change",
    request: asked({
      input: z.object({
        title: z.string(),
        goal: z.string(),
        why: z.string(),
        blocksMe: z.boolean().optional(),
        testFailure: z.boolean().optional(),
        testPath: z.string().optional(),
      }),
    }),
    response: toolTextSchema,
  },
  "inf:work:start-program": {
    effect: "change",
    request: asked({
      input: z.object({
        title: z.string().optional(),
        goal: z.string().optional(),
        script: z.string().optional(),
        args: z.unknown().optional(),
        bound: z.number().optional(),
        program: z.string().optional(),
        stop: z.boolean().optional(),
      }),
    }),
    response: toolTextSchema,
  },
  "inf:work:progress": {
    effect: "change",
    request: asked({
      text: z.string(),
      plan: z
        .array(
          z.object({
            label: z.string(),
            short: z.string(),
            state: z.enum(["done", "current", "next", "skipped"]),
          }),
        )
        .optional(),
    }),
    response: toolTextSchema,
  },
  "inf:work:report": {
    effect: "change",
    request: asked({
      text: z.string(),
      summary: z.string().optional(),
      declared: z
        .object({
          responses: z.array(crewResponseSchema).optional(),
          firstRelease: firstReleaseReportSchema.optional(),
          validation: keptValidationInputSchema.optional(),
          workWait: workWaitSchema.optional(),
          recoveryWays: z.array(keptRecoveryWaySchema).optional(),
          wait: z.object({ reason: z.string(), cardId: z.string().optional() }).optional(),
          finished: z.boolean().optional(),
          needsFirstmate: z.string().optional(),
          /** Where the captain typed the words it passes on (major 15); the home reads them. */
          captainWordsFrom: z.string().optional(),
          /** When it looks at its running job again (major 15); the home keeps it. */
          checkBack: z.object({ minutes: z.number(), waitingFor: z.string() }).optional(),
          /** The report's typed result (`report-result.md`); the home checks it. */
          result: z.record(z.string(), z.unknown()).optional(),
          /** Files it hands on (`handover-files.md`), sent home before the report. */
          files: z.array(handoverFileSchema).optional(),
        })
        .optional(),
    }),
    response: toolTextSchema,
  },
  "inf:work:reply": {
    effect: "change",
    /** `interim` marks a still-working line. */
    request: asked({
      cardId: z.string(),
      text: z.string(),
      interim: z.boolean().optional(),
      /** Major 15: the captain message it answers, its operation and response. */
      answersMessage: z.number().int().optional(),
      /** The captain's message says they are done with the answer. */
      signsOff: z.boolean().optional(),
      operationId: z.string().optional(),
      response: crewResponseSchema.optional(),
    }),
    response: toolTextSchema,
  },
  /** Correct a required action's words (major 15); an older home lacks it. */
  "inf:work:revise-required-action": {
    effect: "change",
    request: asked({ input: requiredActionRevisionInputSchema }),
    response: toolTextSchema,
  },
  /** Read one card before revising or answering it (major 15); an older home lacks it. */
  "inf:work:read-card": {
    effect: "read",
    request: asked({ cardId: z.string().min(1) }),
    response: toolTextSchema,
  },
  "inf:work:speed-note": {
    effect: "change",
    request: asked({ model: modelRefSchema, selection: speedSelectionSchema }),
    response: doneSchema,
  },
  "inf:work:speed": {
    effect: "read",
    request: asked({ model: modelRefSchema }),
    response: crewSpeedSchema,
  },
  "inf:work:tasks": {
    effect: "read",
    request: asked({
      input: z.object({
        project: z.string().optional(),
        status: z.enum(["open", "active", "done", "dropped", "live", "closed"]).optional(),
        key: z.string().optional(),
        field: z.string().optional(),
        text: z.string().optional(),
        parent: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        skip: z.number().int().nonnegative().optional(),
        // One cut of a list that stops short, and its later pages.
        snapshot: z.boolean().optional(),
        ids: z.array(z.string()).max(100).optional(),
        // Every project and its folder instead of tasks (`project-folders.md`).
        projects: z.boolean().optional(),
      }),
    }),
    response: z.object({
      rows: z.array(z.record(z.string(), z.unknown())),
      total: z.number().int().nonnegative(),
      projects: z
        .array(
          z.object({
            key: z.string(),
            name: z.string(),
            folder: z.string().optional(),
            // Each repository of a project of several (`project-repositories.md`).
            repositories: z
              .array(z.object({ name: z.string(), folder: z.string().optional() }))
              .optional(),
          }),
        )
        .optional(),
      order: z.array(z.string()).optional(),
    }),
  },
  "inf:work:read-workflow": {
    effect: "read",
    request: asked({
      input: z.object({
        runId: z.number().int().positive(),
        // Omitted for the run's short read, which saves the home's run watch (since 8.5).
        jobId: z.number().int().positive().optional(),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    }),
    response: toolTextSchema,
  },
  "inf:work:github-read": {
    effect: "read",
    request: asked({
      input: z.object({ path: z.string(), method: z.enum(["GET", "HEAD"]).optional() }),
    }),
    response: toolTextSchema,
  },
  "inf:work:github-write": {
    effect: "change",
    request: asked({
      input: z.object({
        method: z.enum(["POST", "PATCH", "PUT", "DELETE"]),
        path: z.string(),
        body: z.string().optional(),
        validationEffect: z.string().optional(),
      }),
    }),
    response: toolTextSchema,
  },
  /**
   * open_change: the home offers the task's branch where the project lives,
   * with its own sign-in, once it has brought the branch home.
   */
  "inf:work:prepare-change": {
    effect: "change",
    request: asked({ input: stagedChangePresentationSchema }),
    response: toolTextSchema,
  },
  "inf:work:open-change": {
    effect: "change",
    request: asked({ input: openChangeInputSchema }),
    response: toolTextSchema,
  },
  /**
   * show_merge_card: the home walks the steps up to
   * the merge card and shows it, or answers the one thing missing.
   */
  "inf:work:show-merge-card": {
    effect: "change",
    request: asked({ input: showMergeCardInputSchema }),
    response: toolTextSchema,
  },
  /** check_change: the home reads the change's checks, and records what the crewmate declared. */
  "inf:work:check-change": {
    effect: "change",
    request: asked({ input: checkChangeInputSchema }),
    response: toolTextSchema,
  },
  /**
   * download_artifact: the home downloads it with its own sign-in and
   * writes it into the task's working copy here (`inf:working-copy:artifact`)
   * before it answers.
   */
  "inf:work:download-artifact": {
    effect: "change",
    request: asked({
      input: z.object({
        runId: z.number().int().positive(),
        artifactId: z.number().int().positive(),
        /** One exact member streamed into task evidence. */
        file: z.string().min(1).max(4096).optional(),
        /** The archive's files instead of saving anything. */
        list: z.boolean().optional(),
        /** Paths inside the archive to save, or to narrow a listing to. */
        files: z.array(z.string().min(1).max(4096)).optional(),
        /** The listing's first file, 1-based. */
        offset: z.number().int().positive().optional(),
      }),
    }),
    response: toolTextSchema,
  },
  /**
   * knowledge: the home reads its own knowledge for the crewmate, as the
   * reader it binds for a crewmate of its own (docs/knowledge.md, "Who has
   * it"), from `KNOWLEDGE_THERE_SINCE` on.
   */
  "inf:work:knowledge": {
    effect: "read",
    request: asked({ input: knowledgeReadInputSchema }),
    response: toolTextSchema,
  },
  /**
   * record_knowledge: the home writes its own knowledge for the crewmate, under the same rules.
   * It repeats safely: knowledge keeps its own request id, so a cut-off is asked again.
   */
  "inf:work:record-knowledge": {
    effect: "change",
    repeats: "safe",
    request: asked({ input: recordKnowledgeInputSchema }),
    response: toolTextSchema,
  },
  /**
   * The integrations command's list, with no name, and its show: the home
   * reads its own integrations for the crewmate, as for a crewmate of its
   * own (docs/integrations.md, "On a computer that runs work").
   */
  "inf:work:integrations": {
    effect: "read",
    request: asked({ input: z.object({ name: z.string().optional() }) }),
    response: integrationAnswerSchema,
  },
  /**
   * The integrations command's call: the home runs one action with its own
   * sign-in under the task's rules - a read runs, a change is kept as an ask
   * the captain's click sends - and answers with its words.
   */
  "inf:work:use-integration": {
    effect: "change",
    request: asked({
      input: z.object({
        name: z.string(),
        action: z.string(),
        input: z.unknown(),
        reason: z.string().optional(),
      }),
    }),
    response: integrationAnswerSchema,
  },
  /**
   * The files command's computers and one folder's listing on another of
   * them (docs/files.md): the home answers as for a crewmate of its own.
   */
  "inf:work:files": {
    effect: "read",
    request: asked({ input: filesReadInputSchema }),
    response: filesAnswerSchema,
  },
  /**
   * The files command's copy: the home reads one file on another computer
   * and delivers it into the task's hand-over folder here before it
   * answers. Asked again, it copies the same file again, which lands under
   * the same name.
   */
  "inf:work:copy-file": {
    effect: "change",
    repeats: "safe",
    request: asked({ input: z.object({ target: z.string().min(1).max(4200) }) }),
    response: filesAnswerSchema,
  },
  /**
   * The Secrets command's list and show: the home reads its own catalog
   * for the crewmate, the same one a crewmate of its own lists
   * (docs/secrets.md, "Current command seam"). It answers metadata only;
   * a use's values leave the home only through `inf:work:secret-take`.
   */
  "inf:work:secrets": {
    effect: "read",
    request: asked({ input: z.strictObject({}) }),
    response: placedSecretsSchema,
  },
  /** The Secrets command's uses there, decided on the home, answered with receipts, never kept. */
  "inf:work:secret-use": {
    effect: "change",
    repeats: "safe",
    request: asked({ input: placedSecretUseInputSchema }),
    response: placedSecretUseAnswerSchema,
  },
  /**
   * An approved use's values, taken once and never kept in the call ledger,
   * or the state it ended in. The take spends the values, and the same call
   * asked again after a cut-off receives the same values until the use ends.
   */
  "inf:work:secret-take": {
    effect: "change",
    repeats: "safe",
    request: asked({ request: z.string().min(1) }),
    response: placedSecretTakeAnswerSchema,
  },
  /**
   * The Secrets command's ask to keep a secret there, raised on the home's
   * own card (`secret-asks-elsewhere.md`; docs/secrets.md, "Asking to keep a
   * secret"): names, places, a reason and the asker's id, or a withdrawal,
   * never a value. Asked again with a waiting ask's id, it raises nothing new.
   */
  "inf:work:secret-ask": {
    effect: "change",
    repeats: "safe",
    request: asked({ input: placedSecretAskInputSchema }),
    response: placedSecretAskAnswerSchema,
  },
  /** One card picture's verified copy, asked before the card that names it. */
  "inf:work:picture": {
    effect: "change",
    repeats: "safe",
    request: asked({
      id: z.string().regex(/^[A-Za-z0-9_-]{1,64}-[0-9a-f]{32}$/),
      extension: z.enum(["png", "jpg", "webp"]),
      data: z.string().min(1).max(PICTURE_DATA_MAX_CHARS),
    }),
    response: doneSchema,
  },
  /**
   * One piece of a card's demo recording, asked in order after its poster
   * and before the card that names it, or of a sound clip it plays, asked
   * before the card (docs/helper.md): the home keeps the file once its last
   * piece arrives.
   */
  "inf:work:media": {
    effect: "change",
    repeats: "safe",
    request: asked({
      id: z.string().regex(/^[A-Za-z0-9_-]{1,64}-[0-9a-f]{32,64}$/),
      extension: z.enum([
        ...CARD_MEDIA_KINDS,
        ...CARD_SOUND_KINDS,
        "png",
        "jpg",
        "webp",
        "txt",
        "json",
        "log",
      ]),
      offset: z.number().int().nonnegative(),
      size: z.number().int().positive().max(RECORDING_MAX_BYTES),
      data: z.string().min(1).max(RECORDING_PIECE_MAX_CHARS),
    }),
    response: doneSchema,
  },
  /**
   * One piece of a file a crewmate's report hands on (`handover-files.md`,
   * INF-992), asked in order before that report: the home keeps the file
   * once its last piece arrives whole, checked against its sha256. Its
   * content is never logged or printed on either side.
   */
  "inf:work:handover-file": {
    effect: "change",
    repeats: "safe",
    request: asked({
      file: z.string().regex(HANDOVER_FILE_NAME),
      size: z
        .number()
        .int()
        .positive()
        .max(1024 * 1024 * 1024),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      offset: z.number().int().nonnegative(),
      data: z
        .string()
        .min(1)
        .max(Math.ceil(PLACED_COPY_CHUNK_BYTES / 3) * 4),
    }),
    response: doneSchema,
  },
  /**
   * One project font's verified copy, asked before the card whose preview
   * names it (docs/helper.md), from `CARD_TYPEFACES_SINCE` on.
   */
  "inf:work:typeface": {
    effect: "change",
    repeats: "safe",
    request: asked({
      id: z.string().regex(/^[A-Za-z0-9_-]{1,64}-[0-9a-f]{32}$/),
      extension: z.enum(CARD_TYPEFACE_KINDS),
      data: z.string().min(1).max(PICTURE_DATA_MAX_CHARS),
    }),
    response: doneSchema,
  },
  /**
   * A background job the crewmate's shell started there ended; its `callId`
   * is `job:<id>`. With `interrupted`, from protocol 8.15, it never exited:
   * that computer's run ended first, and its next start says so once -
   * `quit` when the run's own stop killed it, `crash` when the run ended
   * without one, so the command may have run on. A background task its
   * Claude client ran there comes only so, by the id its model was given,
   * with its description as the command; from protocol 9.2
   * (`CLIENT_JOB_ENDS_SINCE`), `client` when the client ended with it while
   * that computer ran on.
   */
  "inf:work:job-exit": {
    effect: "change",
    request: asked({
      exit: z.object({
        jobId: z.string().min(1).max(64),
        command: z.string(),
        exitCode: z.number().int().nullable(),
        durationMs: z.number().nonnegative(),
        tail: z.string(),
        interrupted: z.enum(["quit", "crash", "client"]).optional(),
      }),
    }),
    response: doneSchema,
  },
  /**
   * What the conversation did, numbered: one request at a time per task, in
   * order, from the number after the last answer's `through`.
   */
  "inf:work:events": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        events: z.array(placedEventRecordSchema).min(1).max(PLACED_EVENTS_MAX_PER_REQUEST),
      }),
    ]),
    response: placedEventsAnswerSchema,
  },
  /**
   * A task's browser there, as the captain reads it, each time it changes
   * (docs/task-browser.md, "On another computer"): asked once, while the
   * home is in reach and never again, since the next one says it whole;
   * null once that computer keeps no fact of it.
   */
  "inf:work:browser": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        fact: taskBrowserFactSchema.nullable(),
        /**
         * Its page is served there with no saved start (`page-start`), for
         * emit_card's one line; never part of the fact a view reads.
         */
        unstarted: z.literal(true).optional(),
      }),
    ]),
    response: doneSchema,
  },
  /** A live read only: credentials never enter the durable conversation ledger. */
  "inf:work:browser-sign-in": {
    effect: "read",
    request: z.tuple([z.object({ task: placedTaskIdSchema, site: z.string().min(1) })]),
    response: z.object({
      signIn: heldSignInSchema
        .extend({
          site: z.string(),
          id: z.string(),
          savedAt: z.number(),
          automatic: z.literal(true),
        })
        .optional(),
    }),
  },
  /**
   * The captain's private sites list, read live as a task's browser there
   * opens a page (docs/task-browser.md, "Private sites"; major 15):
   * the home lends it and that computer keeps no copy.
   */
  "inf:work:private-sites": {
    effect: "read",
    request: z.tuple([z.strictObject({ task: placedTaskIdSchema })]),
    response: z.object({ sites: z.array(privateSiteSchema) }),
  },
  /** One picture of a task's page while the captain watches it there; asked once, like the fact. */
  "inf:work:browser-frame": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        frame: taskBrowserFrameSchema.omit({ taskId: true }),
      }),
    ]),
    response: doneSchema,
  },
  /**
   * What a task's browser there has the home do, each once under its
   * `callId`: one line on its timeline, its crewmate's wake once the
   * captain handed it back, or its saved sign-in copied back into the save
   * the home lent it or made from it as it stops.
   */
  "inf:work:browser-event": {
    effect: "change",
    request: asked({
      event: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("note"), text: z.string().min(1).max(2_000) }),
        z.object({
          kind: z.literal("returned"),
          site: z.string(),
          after: z.string().optional(),
          saved: z.literal(true).optional(),
          once: z.string().min(1).max(512),
        }),
        // Nothing answers at a task's page there (`page-unanswered.md`).
        z.object({
          kind: z.literal("unanswered"),
          site: z.string(),
          url: z.string(),
          once: z.string().min(1).max(512),
          // The saved start that ran there and how it failed (`page-start.md`).
          start: z
            .object({
              command: z.string(),
              exit: z.number().int().nullable().optional(),
              ranOut: z.literal(true).optional(),
              log: z.string(),
            })
            .optional(),
        }),
        z.object({
          kind: z.literal("sign-in"),
          site: z.string().min(1),
          id: z.string().min(1).max(128),
          held: heldSignInSchema,
        }),
      ]),
    }),
    response: doneSchema,
  },
} as const satisfies Record<
  `inf:work:${string}`,
  {
    effect: "read" | "change";
    /** A change that may be asked again: a cut-off is safe, and the home marks none begun. */
    repeats?: "safe";
    request: z.ZodType;
    response: z.ZodType;
  }
>;

/** Whether a cut-off of this request is safe to ask again, from its own declaration. */
export function requestRepeatsSafely(channel: string): boolean {
  const declared = workRequests[channel as keyof typeof workRequests];
  return declared !== undefined && "repeats" in declared && declared.repeats === "safe";
}

/** One order's task and id: every order that acts carries both. */
/** A task's branch name, as git would take it; git itself refuses the rest when it makes the branch. */
const taskBranchSchema = z.string().min(1).max(255);

function ordered<T extends z.ZodRawShape>(shape: T) {
  return z.tuple([z.object({ orderId: workOrderIdSchema, task: placedTaskIdSchema, ...shape })]);
}

/** One conversation as the computer's roster lists it. */
export const placedRosterTaskSchema = z.object({
  task: placedTaskIdSchema,
  /** A conversation is open there now. */
  open: z.boolean(),
  /** The home closed it; it opens no more. */
  closed: z.boolean(),
  /** The turn running now, and the order that started it. */
  running: z.object({ turn: z.number().int().positive(), orderId: workOrderIdSchema }).optional(),
  /** The newest event number it has written. */
  seq: z.number().int().nonnegative(),
  state: placedStateSchema.optional(),
  /** Its working copy is there, not yet retired (`inf:working-copy:retire`). */
  workingCopy: z.boolean().optional(),
});
export type PlacedRosterTask = z.infer<typeof placedRosterTaskSchema>;

/** The commit a task's working copy started from, and whether it was fetched first. */
const dispatchBaseSchema = z.object({
  sha: z.string(),
  ref: z.string(),
  fetch: z.enum(["fetched", "failed", "none"]),
  fetchError: z.string().optional(),
});

/** What a task's work saved as one commit on its kept ref before its working copy goes. */
export const keptWorkSchema = z.object({
  ref: z.string().min(1).max(256),
  sha: commitSchema,
  dirty: z.boolean(),
  unlandedCommits: z.number().int().nonnegative(),
});

/** A git bundle waiting there to be read home (`inf:working-copy:read`). */
const bundleSchema = z.object({
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Which of a task's refs a bundle carries: its branch, or the commit its work was kept in. */
export const bundledRefSchema = z.enum(["branch", "kept"]);
export type BundledRef = z.infer<typeof bundledRefSchema>;

/** What `read` reads: a bundle, or the pack of a task that moves. */
export const readableRefSchema = z.enum(["branch", "kept", "move"]);
export type ReadableRef = z.infer<typeof readableRefSchema>;

/** A file the home sent as a source file (`inf:session:source-file`), by its name there. */
const sourceFileSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/)
    .max(200),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const sourceFileFields = {
  task: placedTaskIdSchema,
  name: z
    .string()
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/)
    .max(200),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  offset: z.number().int().nonnegative(),
  data: z.string().max(Math.ceil(PLACED_COPY_CHUNK_BYTES / 3) * 4),
  /** A file another task handed this one, kept in temporary storage. */
  into: z.enum(["handover"]).optional(),
};

/**
 * The orders a home asks a computer that runs work. The computer answers
 * them; the home sends them only to a computer whose welcome says it takes
 * work (`takesWork`, src/shared/contractFeatures.ts).
 */
export const workOrders = {
  [PLACEMENT_FACTS_ORDER]: {
    effect: "read",
    request: z.tuple([placementFactsRequestSchema]),
    response: placementFactsAnswerSchema,
  },
  /** Verified source-card files, media and git bundles kept outside the working copy. */
  "inf:session:source-file": {
    effect: "change",
    request: z.tuple([
      z.union([
        // Streaming evidence has no whole-file memory allocation or legacy size bound.
        z.object({
          ...sourceFileFields,
          size: z.number().int().nonnegative(),
          evidence: z.literal(true),
        }),
        z.object({
          ...sourceFileFields,
          size: z
            .number()
            .int()
            .nonnegative()
            .max(1024 * 1024 * 1024),
          evidence: z.never().optional(),
        }),
      ]),
    ]),
    response: z.object({ file: z.string(), complete: z.boolean() }),
  },
  /** Imports a verified source bundle into this task's repository, never its checked-out branch. */
  "inf:working-copy:source-ref": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        name: z
          .string()
          .regex(/^[A-Za-z0-9_-]+\.bundle$/)
          .max(200),
        // Infinitary's refs from INFINITARY_REFS_SINCE on, Firstmate 3000's always.
        from: z.string().regex(SOURCE_REF_FROM),
        to: z.string().regex(/^refs\/(infinitary|fm3000)\/sources\/[A-Za-z0-9_-]+$/),
        sha: z.string().regex(/^[0-9a-f]{40,64}$/),
        size: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    ]),
    response: z.object({ ref: z.string() }),
  },
  /** What the computer holds, the folder its tasks live under, and the one its working copies do. */
  "inf:session:roster": {
    effect: "read",
    request: z.tuple([]),
    response: z.object({
      tasksDir: z.string(),
      worktreesDir: z.string().optional(),
      tasks: z.array(placedRosterTaskSchema),
      /**
       * It keeps task browsers: a browser engine and a command process
       * (docs/task-browser.md, "On another computer"). Absent from one that
       * keeps none, or speaks a contract older than `TASK_BROWSERS_THERE_SINCE`.
       */
      browsers: z.boolean().optional(),
      /** The home's personal set kept here (`inf:session:personal`); absent before one arrives. */
      personal: personalVersionSchema.optional(),
    }),
  },
  ...updateSaveOrders,
  /**
   * The home's personal instructions and skills, whole, kept here in place
   * of the version kept before, only when its fingerprint matches what
   * arrived (docs/personal-resources.md, "One set, kept on each computer").
   * Sent when the home's set changed, never with a task. Paths are under
   * the home's own folder, each `data` its bytes in base64.
   */
  "inf:session:personal": {
    effect: "change",
    request: z.tuple([
      z.object({
        version: z.string().regex(/^[0-9a-f]{64}$/),
        since: z.number(),
        files: z.array(
          z.object({
            path: z.string().min(1).max(1024),
            data: z.string(),
            exec: z.boolean().optional(),
          }),
        ),
      }),
    ]),
    response: z.object({ personal: personalVersionSchema }),
  },
  /** Opens the task's conversation; one already open answers its state. */
  "inf:session:open": {
    effect: "change",
    request: ordered({ spec: placedSpecSchema }),
    /**
     * `state` always, but for a `reattach` open that found none to keep: `needsOpen` (`reattach-only-open.md`);
     * and for a `notOpened` open that failed leaving no new conversation there: `notOpened`, why (`open-not-opened.md`).
     */
    response: z.object({
      state: placedStateSchema.optional(),
      needsOpen: z.literal(true).optional(),
      notOpened: z.string().optional(),
    }),
  },
  /** Starts a turn; answers once it has started, and its end is an event. */
  "inf:session:prompt": {
    effect: "change",
    request: ordered({
      text: z.string(),
      images: z.array(sessionImageSchema).max(16).optional(),
    }),
    response: z.object({ turn: z.number().int().positive() }),
  },
  /** Words into the running turn; `delivered: false` when no turn runs, so nothing took them. */
  "inf:session:steer": {
    effect: "change",
    request: ordered({
      text: z.string(),
      images: z.array(sessionImageSchema).max(16).optional(),
    }),
    response: z.object({ delivered: z.boolean() }),
  },
  "inf:session:abort": {
    effect: "change",
    request: ordered({ failure: z.string().optional() }),
    response: doneSchema,
  },
  /**
   * The quiet watchdog's ask (INF-2603, major 15): each of
   * the app's own reads the conversation began by event `through`, the
   * newest the home has taken, is answered "ask again" there, so its turn
   * goes on. Never a change, and never a call the crewmate started itself;
   * asked again, it answers only reads still open. Answered outside the
   * task's order of orders, so an order waiting on the turn never holds it.
   */
  "inf:session:answer-reads": {
    effect: "change",
    request: z.tuple([
      z.object({ task: placedTaskIdSchema, through: z.number().int().nonnegative() }),
    ]),
    response: z.object({
      answered: z
        .array(z.object({ tool: z.string(), waitedMs: z.number().int().nonnegative() }))
        .max(100),
    }),
  },
  /** Lets go of the live client at an idle boundary; the next prompt reattaches. */
  "inf:session:detach": {
    effect: "change",
    request: ordered({}),
    response: doneSchema,
  },
  /** Ends the conversation for good; its stops run there first (`closeOrder`, docs/leftover-programs.md). */
  "inf:session:close": {
    effect: "change",
    request: ordered(closeOrder.request),
    response: closeOrder.response,
  },
  /** Removes leftovers only, after the home checks age and live dependencies. */
  "inf:session:clean-files": {
    effect: "change",
    request: ordered({}),
    response: z.object({
      removedFiles: z.array(z.string()),
      bytes: z.number().nonnegative(),
    }),
  },
  /**
   * Removes only the task's provisioned temporary folder, after the
   * conversation is closed. Separate from the week-long leftover pass.
   * A pending answer is not final: the home asks again.
   */
  "inf:session:clean-temp": {
    effect: "change",
    request: ordered({}),
    response: z.object({
      status: z.enum(["removed", "absent", "pending"]),
      bytes: z.number().nonnegative(),
      reason: z.string().min(1).max(300).optional(),
    }),
  },
  /**
   * Replaces the words from outside its conversation holds, once due, with
   * their kind's note (`outside-data-there.md`; docs/task-retention.md,
   * "Words from outside"): each kind's words read by its `until`, and the
   * results of the calls that fetched a kind's words before they were
   * fenced (`legacy`). `waiting` while it works; a conversation open there
   * is let go of and opened again from its files, and `state` is its own
   * after, unless `holdReopen` leaves the open to the home. `files` names what changed under its record's folder, by the
   * names `inf:session:copy` uses, for the home to copy whole.
   */
  "inf:session:delete-outside": {
    effect: "change",
    request: ordered({
      kinds: z
        .array(
          z.object({
            label: z.string().min(1).max(48),
            until: z.number(),
            note: z.string().min(1).max(200),
          }),
        )
        .min(1)
        .max(64),
      legacy: z
        .array(
          z.object({
            label: z.string().min(1).max(48),
            names: z.array(z.string().min(1).max(200)).max(1024),
          }),
        )
        .max(64),
      /**
       * Files from outside due in the task's hand-over folder, by kept name,
       * removed first.
       */
      files: z.array(z.string().regex(HANDOVER_FILE_NAME)).max(1024).optional(),
      /**
       * The conversation it lets go of is not opened again there; the
       * answer says `reopen`, and the home opens it (`reattach-only-open.md`).
       */
      holdReopen: z.boolean().optional(),
    }),
    response: z.object({
      status: z.enum(["changed", "unchanged", "waiting"]),
      files: z.array(z.string().min(1).max(1024)).max(1024),
      state: placedStateSchema.optional(),
      /** With `holdReopen`: the conversation was let go of, for the home to open again. */
      reopen: z.literal(true).optional(),
    }),
  },
  /**
   * Removes the task's folder there - its conversation's record, orders and
   * outbox - for a task the home no longer records there: only once the
   * conversation is closed for good and its working copy is gone. One
   * already removed answers the same.
   */
  "inf:session:remove": {
    effect: "change",
    request: ordered({}),
    response: doneSchema,
  },
  /**
   * The conversation's record, from where the home's copy of each file ends:
   * at most `PLACED_COPY_CHUNK_BYTES` per answer, `more` while there is more.
   */
  "inf:session:copy": {
    effect: "read",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        /** Refresh the app-owned record from a live client before reading (8.15 or later). */
        refresh: z.boolean().optional(),
        from: z
          .array(
            z.object({
              name: z.string().min(1).max(1024),
              offset: z.number().int().nonnegative(),
            }),
          )
          .max(SESSION_COPY_FROM_MAX),
      }),
    ]),
    response: z.object({
      files: z.array(
        z.object({
          name: z.string().min(1).max(1024),
          size: z.number().int().nonnegative(),
          offset: z.number().int().nonnegative(),
          /** The bytes from `offset`, base64. */
          data: z.string(),
        }),
      ),
      more: z.boolean(),
    }),
  },
  /**
   * Makes the task's working copy there: the project cloned there once,
   * then a working copy on the task's branch from where the project lives,
   * or one of a warm working copy that came back. One already there
   * answers where it is. With no project, it is one of the computer's own
   * local workspace, as a task with no project is here.
   */
  "inf:working-copy:prepare": {
    effect: "change",
    request: ordered({
      project: z
        .object({
          origin: z.string().min(1).max(4096),
          pushOrigin: z.string().min(1).max(4096).optional(),
        })
        .optional(),
      /** Use another task's local repository at this commit, without cloning or fetching. */
      base: workingCopyBaseSchema.optional(),
      /**
       * With no project: the commit of the home's default workspace the
       * working copy starts from, sent first (`inf:working-copy:seed`).
       */
      seed: commitSchema.optional(),
      /**
       * The task's branch as the home names it (docs/architecture.md, "A task's branch");
       * `fm/task-<task>` without one. The answer's `branch` is the one made.
       */
      branch: taskBranchSchema.optional(),
    }),
    response: z.union([
      z.object({ refused: z.literal("preparation-unknown") }),
      z.object({ refused: z.literal("preparation-failed"), message: z.string().max(2000) }),
      z.object({
        dir: z.string(),
        branch: z.string(),
        /** Acknowledges an exact base; the home refuses an older computer that ignores it. */
        headSha: commitSchema.optional(),
        /** It cloned the project for this one. */
        cloned: z.boolean(),
        /** It cloned it with this computer's own sign-in where the project lives. */
        signedIn: z.boolean().optional(),
        /** How it got the working copy, absent when it was already there. */
        acquired: z
          .object({
            source: z.enum(["pool", "new"]),
            base: dispatchBaseSchema,
            ms: z.number().nonnegative(),
          })
          .optional(),
      }),
      /**
       * The host where the project lives refused the clone for want of this
       * computer's own sign-in (`forgeAuthRequired`): a typed refusal, so
       * the home holds the task for that sign-in and starts it by itself
       * once this computer reports one (docs/forge.md, "A computer's own
       * sign-in"). Nothing was made here for the task.
       */
      z.object({
        refused: z.literal("forge-sign-in"),
        host: z.string().min(1).max(253),
        /** The person's word for the host ("GitHub"). */
        name: z.string().min(1).max(64),
      }),
    ]),
  },
  /**
   * Sends the home's default workspace to a task with no project, so its
   * working copy there starts from the commit the home has and its work
   * merges back into it. The first ask names the commit alone: `have` when
   * this computer holds it, else `need` with the commits it holds that the
   * bundle may leave out. The bundle then crosses in pieces the way an
   * artifact does; `ready` once every byte is there and the commit is.
   */
  "inf:working-copy:seed": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        sha: commitSchema,
        piece: z
          .object({
            size: z.number().int().positive(),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            offset: z.number().int().nonnegative(),
            data: z.string(),
          })
          .optional(),
      }),
    ]),
    response: z.object({
      outcome: z.enum(["have", "need", "partial", "ready"]),
      /** With `need`: commits this computer already holds. */
      have: z.array(commitSchema).max(64).optional(),
    }),
  },
  /** Installs the working copy's dependencies there, as a new one's are here. */
  "inf:working-copy:install": {
    effect: "change",
    request: ordered({}),
    response: z.union([
      z.object({ outcome: z.literal("skipped") }),
      z.object({ outcome: z.enum(["offline", "online"]), ms: z.number().nonnegative() }),
      z.object({ outcome: z.literal("failed"), ms: z.number().nonnegative(), error: z.string() }),
    ]),
  },
  /** Reads a task's committed revision and complete changed-file list on this computer. */
  "inf:working-copy:revision": {
    effect: "read",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        headSha: commitSchema.optional(),
        /** The approved version a part started on (`built_on`), read from while the head builds on it. */
        builtOn: commitSchema.optional(),
      }),
    ]),
    response: z.object({
      headSha: commitSchema,
      /** The approved version the changed files and lines were read from; absent when read from the default branch. */
      builtOn: commitSchema.optional(),
      /**
       * The default branch read in place of the clone's `origin`'s, as a full
       * ref: a task that followed its project to a new address reads that
       * address's. Absent when read from `origin`'s, or from an older computer.
       */
      base: z.string().min(1).max(512).optional(),
      changedFiles: z.array(z.string()),
      /** Host-measured text lines at headSha; absent when unavailable or on an older computer. */
      changeLines: z
        .object({
          base: commitSchema,
          added: z.number().int().nonnegative(),
          deleted: z.number().int().nonnegative(),
        })
        .optional(),
      /**
       * The change reading at that commit (INF-148). Absent from a computer
       * on an older contract, which then cannot carry a passed review.
       */
      changeReading: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
    }),
  },
  /** Whether the working copy holds edits or commits that never merged. */
  "inf:working-copy:status": {
    effect: "read",
    request: z.tuple([z.object({ task: placedTaskIdSchema })]),
    response: z.object({
      present: z.boolean(),
      dirty: z.boolean(),
      unlandedCommits: z.number().int().nonnegative(),
      /**
       * Where the project it was cloned from lives, as its clone there names
       * it; null for one of the computer's own local workspace. Absent from
       * a computer on an older contract, and when no working copy is there.
       */
      origin: z.string().max(4096).nullable().optional(),
      /**
       * The branch the working copy has checked out, null when its checkout
       * is detached, and the commit it points at (INF-2490). Absent from a
       * computer on an older contract, and when no working copy is there.
       */
      checkedOut: z
        .object({ branch: z.string().min(1).max(255).nullable(), head: commitSchema })
        .optional(),
    }),
  },
  /**
   * Bundles one of the task's refs for the home, leaving out the commits it
   * says it has. `sha` is where the ref points, null when there is none;
   * with no `bundle` the home has that commit already.
   */
  "inf:working-copy:bundle": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        ref: bundledRefSchema,
        have: z.array(commitSchema).max(64),
        /**
         * With ref `branch`, another branch of the working copy's repository
         * to bundle in place of the task's own (INF-2490): one the crewmate
         * checked out to deliver. Sent only to a computer that lists
         * `checked-out-branch`.
         */
        branch: z.string().min(1).max(255).optional(),
      }),
    ]),
    response: z.object({ sha: commitSchema.nullable(), bundle: bundleSchema.optional() }),
  },
  /** The bundle (or move pack) made last for that ref, from `offset`: at most `PLACED_COPY_CHUNK_BYTES`. */
  "inf:working-copy:read": {
    effect: "read",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        ref: readableRefSchema,
        offset: z.number().int().nonnegative(),
      }),
    ]),
    response: z.object({
      size: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative(),
      /** The bytes from `offset`, base64. */
      data: z.string(),
    }),
  },
  /**
   * The task closed at home: what its working copy holds that never merged
   * is saved there as one commit on its kept ref, once, and answered the
   * same when asked again. Null when nothing is unmerged.
   */
  "inf:working-copy:keep": {
    effect: "change",
    request: ordered({}),
    response: z.object({ kept: keptWorkSchema.nullable() }),
  },
  /**
   * Deletes the task's working copy there, once its kept work is at home:
   * `kept` names the commit the home holds, and must be the one the keep
   * answered; with null, nothing may be unmerged.
   */
  "inf:working-copy:retire": {
    effect: "change",
    request: ordered({ kept: commitSchema.nullable() }),
    response: doneSchema,
  },
  /**
   * One piece of an artifact the home downloaded for the task's crewmate,
   * written at `offset` into the working copy's
   * `.infinitary-artifacts/run-<runId>/artifact-<artifactId>.zip` (a computer
   * before 8.4: `.firstmate-artifacts/`) once every
   * piece is there and its digest matches; never over a file already there.
   */
  "inf:working-copy:artifact": {
    effect: "change",
    request: z.tuple([
      z.object({
        task: placedTaskIdSchema,
        runId: z.number().int().positive(),
        artifactId: z.number().int().positive(),
        /** A selection of the artifact's files, named by its SHA-256's start. */
        part: z
          .string()
          .regex(/^[0-9a-f]{12}$/)
          .optional(),
        size: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        offset: z.number().int().nonnegative(),
        data: z.string(),
      }),
    ]),
    /** `exists` when a file was there already, which it never writes over. */
    response: z.object({ outcome: z.enum(["partial", "written", "exists"]) }),
  },
  /**
   * Packs the task's work to move it to another computer
   * (docs/helper.md, "Moving a started task"): its conversation must be idle
   * and is let go first, never closed, so the task can run here again if the
   * move does not finish. The pack - what is staged and not, untracked
   * files and the task's own folders - waits in `bundles/` for `read` with
   * `move`, and its branch's commits for `bundle` with `branch`.
   */
  "inf:working-copy:move-out": {
    effect: "change",
    request: ordered({
      /** Ignored files in the working copy that move too (`ComputerMove.keep`). */
      keep: z.array(z.string().min(1).max(4096)).max(256).optional(),
    }),
    response: z.object({ head: commitSchema, branch: z.string().min(1), pack: bundleSchema }),
  },
  /**
   * Makes the working copy of a task that moves here: asked
   * first with neither file, it answers the commits it holds that a bundle
   * may leave out (`need`); then, with the task's branch as a source file
   * (none when every commit is here) and its pack, it fetches the branch,
   * makes the working copy at `head` and unpacks the work, checked against
   * what left (`ready`). Asked again once ready, it answers the same.
   */
  "inf:working-copy:move-in": {
    effect: "change",
    request: ordered({
      /**
       * Where the project lives, to clone it from; or, for a project the
       * home keeps on itself or clones from a folder, its id, whose commits
       * come in the bundle alone, with the home's own branch and the commit
       * the task's branch left it at, which the repository there starts on.
       */
      project: z
        .union([
          z.object({
            origin: z.string().min(1).max(4096),
            pushOrigin: z.string().min(1).max(4096).optional(),
          }),
          z.object({
            local: z.string().min(1).max(64),
            base: z.object({ branch: z.string().min(1).max(255), sha: commitSchema }),
          }),
        ])
        .optional(),
      /** A task with no project: the home's workspace commit it sent first. */
      seed: commitSchema.optional(),
      head: commitSchema,
      bundle: sourceFileSchema.optional(),
      pack: sourceFileSchema.optional(),
      /** The task's branch as the home names it, as `inf:working-copy:prepare` takes it. */
      branch: taskBranchSchema.optional(),
    }),
    response: z.discriminatedUnion("outcome", [
      z.object({ outcome: z.literal("need"), have: z.array(commitSchema).max(64) }),
      z.object({ outcome: z.literal("ready"), dir: z.string(), branch: z.string() }),
    ]),
  },
} as const satisfies Record<
  `inf:session:${string}` | `inf:working-copy:${string}` | typeof PLACEMENT_FACTS_ORDER,
  { effect: "read" | "change"; request: z.ZodType; response: z.ZodType }
>;

export type WorkOrderChannel = keyof typeof workOrders;
export type WorkOrderRequest<C extends WorkOrderChannel> = z.infer<
  (typeof workOrders)[C]["request"]
>;
export type WorkOrderResponse<C extends WorkOrderChannel> = z.infer<
  (typeof workOrders)[C]["response"]
>;
export const WORK_ORDER_CHANNELS = Object.keys(workOrders) as WorkOrderChannel[];

export function isWorkOrderChannel(channel: string): channel is WorkOrderChannel {
  return Object.hasOwn(workOrders, channel);
}

/**
 * The update order a home asks a computer that runs work whatever version it
 * runs (docs/helper.md, "Updated by its home"): bring Firstmate there to the
 * home's own version. A computer that keeps a copy of Firstmate gets the
 * home's at `FETCH_APP_PATH` with its own key and keeps it in place of its
 * own; one that runs its Mac's own app has nothing to get. Either answers,
 * then lets its run end, and its background starts it again from what is
 * kept there; `restarts` says whether a background is set up there to do so.
 *
 * It is asked of a computer on any major from `WORK_UPDATE_SINCE` on, so its
 * name and shape never change: a later major adds an order beside it, never
 * in its place.
 */
export const updateOrders = {
  "fm:firstmate:update": {
    effect: "change",
    request: z.tuple([]),
    response: z.object({ restarts: z.boolean(), needsPackage: z.literal(true).optional() }),
  },
} as const satisfies Record<
  `fm:firstmate:${string}`,
  { effect: "read" | "change"; request: z.ZodType; response: z.ZodType }
>;

export type UpdateOrderChannel = keyof typeof updateOrders;
export const UPDATE_ORDER_CHANNELS = Object.keys(updateOrders) as UpdateOrderChannel[];
/** The update order's channel. */
export const WORK_UPDATE_ORDER: UpdateOrderChannel = "fm:firstmate:update";
export type WorkUpdateAnswer = z.infer<(typeof updateOrders)[typeof WORK_UPDATE_ORDER]["response"]>;

/** Where the home's version is published for a Mac, and the SHA-256 it is checked against. */
export const updateDownloadSchema = z.object({
  url: z
    .string()
    .max(2048)
    .regex(/^https:\/\/\S+$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type UpdateDownload = z.infer<typeof updateDownloadSchema>;

const downloadCountShape = {
  received: z.number().int().nonnegative(),
  total: z.number().int().positive().optional(),
};
/**
 * What is under way where a home asked a download: `idle`, nothing in this
 * run; `downloading`; `updating`, what arrived is checked and being kept, or
 * the update order runs, so it starts again from the new copy; `failed` or
 * `mismatch`, the last download ended with nothing there changed. The
 * progress order's shape never changes across majors, so a state a later
 * version adds is still read: a home reads one it does not know as under way.
 */
export const UPDATE_PROGRESS_STATES = [
  "idle",
  "downloading",
  "updating",
  "failed",
  "mismatch",
  // A source build's steps (`sourceOrders`), which a home before them reads as under way.
  "fetching",
  "installing",
  "building",
] as const;
export type UpdateProgressState = (typeof UPDATE_PROGRESS_STATES)[number];

/**
 * How far a download the home asked for has got: the bytes received, the
 * size its release stated (only when it stated one, and never a redirect's),
 * and what is under way there (`UPDATE_PROGRESS_STATES`). A home whose
 * connection dropped while it asked reads it to follow that download
 * (docs/devices.md, "Downloading over the connection").
 */
export const updateProgressSchema = z.object({
  ...downloadCountShape,
  state: z.string().min(1).max(64),
});
/** How far a download has got, as a computer of this version says it: one of the states it knows. */
export type UpdateProgress = Omit<z.infer<typeof updateProgressSchema>, "state"> & {
  state: UpdateProgressState;
};

/**
 * The orders a home asks a Mac that runs work to download its update itself
 * (docs/devices.md, "Downloading over the connection"), of a computer on
 * any major from `WORK_DOWNLOAD_SINCE` on, so their names and shapes never
 * change either. `fm:firstmate:update-download` gets the home's published
 * version over HTTPS, checks its SHA-256 and its publisher, keeps it in
 * place of the copy there and answers as the update order does; or answers
 * `fallback` with nothing there changed - the download failed, stopped with
 * nothing moving, or did not match (`mismatch`) - and the home sends its own
 * copy with the update order. Either answer carries the download's last
 * count. One asked while a download or an update already runs there answers
 * `updating`, and the home follows that one. `fm:firstmate:update-progress`
 * answers how far that download has got, which the home asks while it runs.
 */
export const downloadOrders = {
  "fm:firstmate:update-download": {
    effect: "change",
    request: z.tuple([updateDownloadSchema]),
    response: z.union([
      z.object({ restarts: z.boolean(), ...downloadCountShape }),
      z.object({ fallback: z.enum(["failed", "mismatch"]), ...downloadCountShape }),
      z.object({ updating: z.literal(true) }),
    ]),
  },
  "fm:firstmate:update-progress": {
    effect: "read",
    request: z.tuple([]),
    response: updateProgressSchema,
  },
} as const satisfies Record<
  `fm:firstmate:${string}`,
  { effect: "read" | "change"; request: z.ZodType; response: z.ZodType }
>;

export type DownloadOrderChannel = keyof typeof downloadOrders;
export const DOWNLOAD_ORDER_CHANNELS = Object.keys(downloadOrders) as DownloadOrderChannel[];
/** The download order's channel. */
export const WORK_DOWNLOAD_ORDER = "fm:firstmate:update-download" satisfies DownloadOrderChannel;
/** The order that reads how far the download has got. */
export const WORK_PROGRESS_ORDER = "fm:firstmate:update-progress" satisfies DownloadOrderChannel;
export type WorkDownloadAnswer = z.infer<
  (typeof downloadOrders)[typeof WORK_DOWNLOAD_ORDER]["response"]
>;

/**
 * The step a source build stopped at on a computer (`sourceOrders`), with
 * nothing there changed: `system`, it is no Mac; `tools`, it found no Node
 * or pnpm to build with; `fetch`, the source did not arrive whole; `install`
 * and `build`, its packages did not install or it did not build; `keep`, its
 * background could not be moved to the build.
 */
export const SOURCE_BUILD_STEPS = ["system", "tools", "fetch", "install", "build", "keep"] as const;
export type SourceBuildStep = (typeof SOURCE_BUILD_STEPS)[number];

/** The contract change that brings `build` in the hello and the source order. */
export const SOURCE_BUILDS_CHANGE = "source-builds";

/**
 * The order a home run from source asks a Mac that runs work for it, once
 * that computer lists `source-builds` (docs/devices.md, "Matching the home's build";
 * docs/helper.md, "Building the home's source"): get the home's committed
 * source at `commit` from `FETCH_SOURCE_PATH` with its own key, install its
 * packages, build it, and have its background run Electron from that folder
 * on trial, as an update keeps a copy. It answers `restarts` as the update
 * order does, and its run ends; or `failed` with the step it stopped at and
 * the last lines that step printed, with nothing there changed. One asked
 * while an update or another build runs there answers `updating`. While it
 * runs, the progress order says `fetching`, `installing` or `building`.
 */
export const sourceOrders = {
  "inf:source:build": {
    effect: "change",
    request: z.tuple([z.object({ commit: z.string().regex(/^[a-f0-9]{40,64}$/) })]),
    response: z.union([
      z.object({ restarts: z.boolean() }),
      z.object({
        failed: z.enum(SOURCE_BUILD_STEPS),
        detail: z.string().max(4000).optional(),
      }),
      z.object({ updating: z.literal(true) }),
    ]),
  },
} as const satisfies Record<
  `inf:${string}`,
  { effect: "read" | "change"; request: z.ZodType; response: z.ZodType }
>;

export type SourceOrderChannel = keyof typeof sourceOrders;
export const SOURCE_ORDER_CHANNELS = Object.keys(sourceOrders) as SourceOrderChannel[];
/** The source build order's channel. */
export const WORK_SOURCE_ORDER = "inf:source:build" satisfies SourceOrderChannel;
export type WorkSourceAnswer = z.infer<(typeof sourceOrders)[typeof WORK_SOURCE_ORDER]["response"]>;
