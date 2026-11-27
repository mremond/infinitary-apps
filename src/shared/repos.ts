import { z } from "zod";
import { advisoryWorkflowsSchema } from "./advisoryWorkflows";
import { batchRecordSchema } from "./batches";
import { contributionDestinationSchema, contributionRouteSchema } from "./contributions";
import { contributorDisclosureSchema } from "./contributorDisclosure";
import { costLimitSchema } from "./costLimit";
import { HERE, PLACE_SAID } from "./deviceNames";
import { type ForgeKind, hasChangeRequests } from "./forge";
import { changeRequestHost, serverFactsAt } from "./forgeKinds";
import { englishOf, type Said, type SaidPart, said } from "./i18n/said";
import { placementRequirementsSchema } from "./placement";
import { rigorSchema } from "./rigor";

/**
 * Managed work repos (decision D-8, fleet-root revision). Every repo is set
 * up by Settings or the Firstmate agent and indexed in the app-owned fleet root
 * (userData/fleet): `clone` and `init` create real directories in the
 * projects folder - the fleet root itself unless the person chose another
 * one (`ProjectsFolderView`), which the fleet root then links; `adopt`
 * keeps an existing folder in place and links it from the fleet root, so
 * `path` is always the repo's real working directory. The default
 * local-only workspace is not listed here - it is the implicit fallback for
 * repo-less tasks.
 */

export const repoSetupKindSchema = z.enum(["clone", "init", "adopt"]);
export type RepoSetupKind = z.infer<typeof repoSetupKindSchema>;

/**
 * The task key a new project's tasks are numbered with (`INF` for `INF-1`),
 * when the person or Firstmate chose one; the app otherwise derives it from
 * the name. The core refuses, in words, a key that is not 2-4 letters or
 * digits or that another project has (`freeProjectKey`).
 */
export const projectKeyChoiceSchema = z.string().trim().min(1).max(16);

/**
 * An existing project a new repository joins instead of getting its own
 * (INF-4220), by its task key (`EDW`); never together with `key`. Scratch,
 * the personal workspace's project and a removed project are refused.
 */
export const projectJoinSchema = z.string().trim().min(1).max(16);

export const repoSetupSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("clone"),
    origin: z.string().trim().min(1),
    name: z.string().optional(),
    key: projectKeyChoiceSchema.optional(),
    project: projectJoinSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("init"),
    name: z.string().trim().min(1),
    key: projectKeyChoiceSchema.optional(),
    project: projectJoinSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("adopt"),
    path: z.string().trim().min(1),
    name: z.string().optional(),
    key: projectKeyChoiceSchema.optional(),
    project: projectJoinSchema.optional(),
  }),
]);
export type RepoSetupSpec = z.infer<typeof repoSetupSpecSchema>;

/**
 * What kind of workspace a registered repo is. A `project` is ordinary
 * managed work: a crewmate takes a worktree on a branch and the change
 * leaves through a gate. `personal` is the app's own personal workspace
 * (talk-to-personalize Step 4) and there is exactly one: a crewmate builds
 * in place there, with no worktree, no branch and no pull request, the host
 * commits the workspace at the end of each of its turns, and a completion
 * report closes the task - nothing to merge, land, or discard. The kind is
 * the workspace's nature, never a delivery: delivery says only where a
 * change lands, and a personal task lands nowhere because it is already
 * there.
 */
export const repoKindSchema = z.enum(["project", "personal"]);
export type RepoKind = z.infer<typeof repoKindSchema>;

/**
 * How the agent ships finished work on the repo. `direct-pr` pushes a
 * branch and opens a PR; `queue-pr` is batched pull requests: the captain's
 * merge click puts the approved version in line, and the app at the captain's
 * home combines the line into one batch pull request it merges once every
 * check passed (docs/forge.md, "Batches of your own"; the saved value keeps
 * its first name); `local-only` lands on a local branch and never leaves the
 * machine. New postures extend this enum - the registry and display render
 * whatever it carries.
 */
export const repoDeliverySchema = z.enum(["direct-pr", "queue-pr", "local-only"]);

export type RepoDelivery = z.infer<typeof repoDeliverySchema>;

export type PullRequestDelivery = Exclude<RepoDelivery, "local-only">;

export function opensPullRequest(
  delivery: string | null | undefined,
): delivery is PullRequestDelivery {
  return delivery === "direct-pr" || delivery === "queue-pr";
}

/**
 * The delivery a single task ships at. The captain's ask (in words, as
 * `delivery_ask`) overrides the repository's default for that task alone;
 * omit it and the repo stands. The personal workspace's tasks carry a
 * delivery nobody reads: they build in place, which is its kind's business
 * rather than a posture of its own.
 */
export type DeliveryInput = {
  /** The repository's standing posture; undefined = no repo (local-only). */
  repo?: RepoDelivery | undefined;
  ask?: RepoDelivery | undefined;
};

export type DeliveryDecision = {
  delivery: RepoDelivery;
  reason: string;
};

export function deliveryFor(input: DeliveryInput): DeliveryDecision {
  if (input.ask) {
    return {
      delivery: input.ask,
      reason: `the captain asked for ${input.ask}`,
    };
  }
  const repo = input.repo ?? "local-only";
  return {
    delivery: repo,
    reason: input.repo ? `the repository ships ${input.repo}` : "no repository: local-only",
  };
}

export function deliveryForRecord(
  record: {
    shape?: { delivery_ask?: RepoDelivery; policies?: { delivery?: RepoDelivery | null } } | null;
  },
  repo?: RepoDelivery,
): RepoDelivery {
  return deliveryFor({
    repo,
    ask:
      record.shape?.policies?.delivery === undefined
        ? record.shape?.delivery_ask
        : (record.shape.policies.delivery ?? undefined),
  }).delivery;
}

/**

 * Whether the fleet may land a task's own green work, or must bring it to
 * the captain (captain ruling, 2026-09-20: "this should actually be the
 * same - repo default, per-task ask allowed"). Autonomy now has the shape
 * delivery and rigor have: a repository default, a per-task ask on the
 * captain's own words, and one effective value every reader takes.
 */
export type AutonomyInput = {
  /** The repository's standing flag; undefined = no repository, so no policy. */
  repo?: boolean | undefined;
  /** The captain said in words, for this task alone. `false` is an ask too. */
  ask?: boolean | undefined;
};

export type AutonomyDecision = {
  autonomy: boolean;
  reason: string;
};

/**
 * The derivation, in the captain's order: the ask, then the repository.
 *
 * A repo-less task - the default workspace - is not held. Autonomy is a
 * REPOSITORY's standing answer to "who merges my green work", and the hold
 * enforces that answer; where there is no repository there is no answer to
 * enforce, and nothing ships out of the app either, so holding it would be
 * the host inventing a policy the captain never set. This is the one case
 * the ruling did not name.
 */
export function autonomyFor(input: AutonomyInput): AutonomyDecision {
  if (input.ask !== undefined) {
    return {
      autonomy: input.ask,
      reason: input.ask
        ? "the captain asked for this task to merge itself"
        : "the captain asked to be asked before this task merges",
    };
  }
  if (input.repo === undefined) {
    return { autonomy: true, reason: "no repository: nothing to hold" };
  }
  return {
    autonomy: input.repo,
    reason: `the repository ${input.repo ? "merges green work itself" : "asks before merging"}`,
  };
}

/**
 * The autonomy a stored task ships at: its ask, else the repo. Derived
 * live, exactly like `deliveryForRecord` - the shape's stamped `autonomy`
 * is what the task was commissioned under, not what a merge attempt reads,
 * so flipping a repository's default reaches work already in flight.
 */
export function autonomyForRecord(
  record: { shape?: { autonomy_ask?: boolean; policies?: { autonomy?: boolean | null } } | null },
  repo?: boolean,
): boolean {
  return autonomyFor({
    ...(repo !== undefined ? { repo } : {}),
    ask:
      record.shape?.policies?.autonomy === undefined
        ? record.shape?.autonomy_ask
        : (record.shape.policies.autonomy ?? undefined),
  }).autonomy;
}

/**
 * Policy fields Settings and `app_change project-settings` may write. The personal
 * workspace takes none of them (its registry refuses the whole patch): it
 * builds in place, so there is nothing to deliver, land, or review.
 */
/**
 * Where a registered project lives (git integration PR 1.1, migration 40):
 * the host kind read from its origin (`forgeOf` in `./forge.ts`) and the
 * host's name. Null for a project kept only on this Mac. A remote on this Mac's
 * own disk is a plain host with no name.
 */
export const repoHostSchema = z
  .object({
    kind: z.enum(["github", "gitlab", "bitbucket", "git"]),
    name: z.string().nullable(),
  })
  .nullable();
export type RepoHost = z.infer<typeof repoHostSchema>;

export const BATCH_HOST_REFUSAL =
  "Batched pull requests need a host where Infinitary can open and merge a batch pull request, and this project's host has none it can use yet. Choose pull requests or a local merge.";

/**
 * Whether a project's host takes a batch pull request, so it may choose
 * batched pull requests: the app combines a person's approved changes into
 * a batch pull request (docs/forge.md, "Batches of your own"): it opens,
 * reads and merges that pull request with the person's own sign-in, where
 * the host's row in the shared table says it `batches`. Any other host gives
 * it no pull request to combine into, so batched pull requests is not
 * offered there.
 */
export function hostTakesBatches(host: RepoHost | undefined): boolean {
  // A server running another product than the public host (Bitbucket Data
  // Center) answers for its own batches.
  const server = serverFactsAt(host?.kind, host?.name);
  return server ? server.batches : (changeRequestHost(host?.kind)?.batches ?? false);
}

/**
 * Whether a project's pull requests can carry checks where it lives: GitHub
 * and GitLab run them, as their forges' `hasChecks` says, while a plain Git
 * host or a project kept on this Mac runs none, so its changes already read
 * no checks (docs/forge.md, "A project with no checks"). Settings → Projects
 * offers Require pull request checks only where this holds and the project
 * ships through pull requests, and a project may turn it off only there.
 */
export function readsPullRequestChecks(
  repo: Pick<RepoView, "kind" | "delivery" | "origin" | "host">,
): boolean {
  return (
    repo.kind !== "personal" &&
    opensPullRequest(repo.delivery) &&
    !!repo.origin &&
    hasChangeRequests(repo.host?.kind)
  );
}

/**
 * Whether a project may name advisory workflows (docs/forge.md, "Advisory
 * workflows"): one whose changes' checks are read on GitHub, which names the
 * workflow file each check's run comes from. Settings → Projects offers the
 * setting only here, and `RepoRegistry.checkConfigure` refuses it elsewhere.
 */
export function namesAdvisoryWorkflows(
  repo: Pick<RepoView, "kind" | "delivery" | "origin" | "host">,
): boolean {
  return readsPullRequestChecks(repo) && repo.host?.kind === "github";
}

/**
 * The refusal the first mate's project-settings action reads; Settings →
 * Projects offers the row only where it holds, so no person meets it there.
 */
// i18n-exempt: served to the first mate's model
export const ADVISORY_WORKFLOWS_REFUSAL =
  "Advisory workflows can be named only for a project whose changes go through pull requests on GitHub, which says which workflow file each check comes from. This project's changes do not.";

// i18n-exempt: served to the first mate's model
export const ADVISORY_WORKFLOWS_MOVED_REFUSAL =
  "These advisory workflows were named for a repository this project no longer uses. Read the project again and name them for the repository it uses now.";

// i18n-exempt: served to the first mate's model
export const ADVISORY_WORKFLOWS_TARGET_REFUSAL =
  "This project's target project is changing. Name its advisory workflows again once the change is done.";

// i18n-exempt: served to the first mate's model
export const ADVISORY_WORKFLOWS_RESET_REFUSAL =
  "The project's advisory workflows changed while its target project was read. Nothing changed; choose its target project again.";

export const NO_CHECKS_REFUSAL =
  "Require pull request checks can be turned off only for a project whose changes go through pull requests on GitHub, GitLab or Bitbucket. This project's changes do not, so no check holds its merge.";

export const BATCHES_OFF_REFUSAL =
  "Batched pull requests is off. Turn it on in Settings, under Runbooks, to choose it for a project.";

/**
 * The deliveries a project may choose where it lives: a project kept only on
 * this Mac lands locally; one with a host also opens pull requests; and one
 * whose host takes a batch pull request can combine approved changes, while a
 * runbook that is on offers batched pull requests (`batchesOffered`) or the
 * project already uses them (`delivery`). Settings lists them in this order,
 * from the lightest choice to the most involved.
 */
export function deliveryChoices(
  host: RepoHost | undefined,
  batchesOffered: boolean,
  delivery?: RepoDelivery,
): RepoDelivery[] {
  if (!host) return ["local-only"];
  return hostTakesBatches(host) && (batchesOffered || delivery === "queue-pr")
    ? ["local-only", "direct-pr", "queue-pr"]
    : ["local-only", "direct-pr"];
}

/** The deliveries Settings offers a project, as its home says whether batches are offered. */
export function projectDeliveryChoices(
  repo: Pick<RepoView, "origin" | "host" | "delivery" | "batchesOffered">,
): RepoDelivery[] {
  return deliveryChoices(
    repo.origin ? repo.host : undefined,
    repo.batchesOffered ?? true,
    repo.delivery,
  );
}

/** A parsed origin (`forgeOf`) as a project's host, or null when it lives only on this Mac. */
export function repoHostFrom(where: { kind: ForgeKind; host: string | null }): RepoHost {
  return where.kind === "none" ? null : { kind: where.kind, name: where.host };
}

/** A project's batch gap in whole minutes (`RepoView.batchGap`). */
export const batchGapSchema = z.number().int().positive();

export const repoPolicyPatchSchema = z
  .object({
    contributionDestination: contributionDestinationSchema.optional(),
    placementRequirements: placementRequirementsSchema.nullable().optional(),
    delivery: repoDeliverySchema.optional(),
    autonomy: z.boolean().optional(),
    rigor: rigorSchema.nullable().optional(),
    costLimit: costLimitSchema.nullable().optional(),
    scope: z.string().nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    path: z.string().trim().min(1).max(4096).optional(),
    origin: z.string().trim().min(1).max(4096).nullable().optional(),
    /**
     * Settings → Projects' Require pull request checks (docs/forge.md, "A
     * project with no checks"): false records that the project runs no
     * checks, true ends that record.
     */
    requireChecks: z.boolean().optional(),
    /**
     * Settings → Projects' When a batch starts, for a batched project
     * (docs/forge.md, "The batch gap"): the least time in minutes from one
     * batch's start to the next, or null to start one as soon as a change is approved.
     */
    batchGap: batchGapSchema.nullable().optional(),
    /**
     * Settings → Projects' Disclose AI assistance (docs/forge.md, "Disclosing AI
     * assistance"): the line that opens what the crew posts to an
     * outside contributor, an empty string to post none, or null for the
     * default line.
     */
    contributorDisclosure: contributorDisclosureSchema.nullable().optional(),
    /**
     * Settings → Projects' Advisory workflows (docs/forge.md, "Advisory
     * workflows"): the workflow files whose checks never hold a merge; an
     * empty list names none.
     */
    advisoryWorkflows: advisoryWorkflowsSchema.optional(),
    /**
     * The address of the repository `advisoryWorkflows` was named for, as
     * the place naming it read the project: a save is refused once the
     * project uses another repository, however it was queued.
     */
    advisoryWorkflowsAt: z.string().max(4096).nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message:
      "pass delivery, autonomy, rigor, costLimit, scope, name, path, origin, requireChecks, batchGap, contributorDisclosure, advisoryWorkflows, or several",
  });
export type RepoPolicyPatch = z.infer<typeof repoPolicyPatchSchema>;

/**
 * The record that a project runs no pull request checks (docs/forge.md, "A
 * project with no checks"), shown as Require pull request checks off in
 * Settings → Projects. A crewmate's declaration names its task (by key), the
 * version it read and its evidence; a change in Settings or by the first
 * mate names none.
 */
export const noChecksRecordSchema = z.object({
  at: z.number(),
  task: z.string().optional(),
  head: z.string().optional(),
  evidence: z.string().optional(),
});
export type NoChecksRecord = z.infer<typeof noChecksRecordSchema>;

/** What the app did to a project's no-checks record on its own, from a reading or a declaration. */
export type NoChecksChange =
  | { kind: "recorded"; record: NoChecksRecord }
  | { kind: "ended"; check: string; change: string };

/** The Activity line when the app starts or ends a project's no-checks record, as a saved fact. */
export function noChecksSaid(name: string, change: NoChecksChange): Said {
  return change.kind === "recorded"
    ? said("feedNoChecksRecorded", { name, task: change.record.task ?? "" })
    : said("feedNoChecksEnded", { name, check: change.check, change: change.change });
}

export const repoViewSchema = z.object({
  id: z.string(),
  /** The fleet name (unique; names the fleet-root entry), shown in surfaces. */
  name: z.string(),
  /** What work belongs here, in the captain's words; personal takes no scope. */
  scope: z.string().nullable().optional(),
  /** The repo's real working directory (external for adopted repos). */
  path: z.string(),
  setupKind: repoSetupKindSchema,
  /**
   * The workspace's nature (`project` or `personal`), migration 37. There
   * is exactly one `personal` row - the app's own personal workspace - and
   * it takes no delivery, autonomy or rigor.
   */
  kind: repoKindSchema,
  /** Remote URL when known: the clone source, or a detected origin on adopt. */
  origin: z.string().nullable(),
  /** Where the project lives, read from `origin`; null = kept on this Mac. */
  host: repoHostSchema,
  contribution: contributionRouteSchema.optional(),
  /** A successful host inspection, including a direct route with no fork requirement. */
  contributionChecked: z.boolean().optional(),
  delivery: repoDeliverySchema,
  /** On = the agent may land green finished work on this repo by itself. */
  autonomy: z.boolean(),
  /**
   * The repository's standing delivery rigor (delivery rigor phase 3), set
   * by talking or Settings → Projects; null = the host derives it per task
   * from the posture and the intelligence tier (`rigorFor` in `./rigor.ts`).
   */
  rigor: rigorSchema.nullable(),
  /** Null follows Settings → Intelligence; absent on older homes. */
  costLimit: costLimitSchema.nullable().optional(),
  /**
   * Where the project's next task starts (multi-machine piece 11,
   * docs/helper.md "Runs on"): the id of a paired computer that runs work,
   * or null for this Mac.
   */
  runsOn: z.string().nullable(),
  placementRequirements: placementRequirementsSchema.optional(),
  /**
   * This person's line of approved changes and open batch in the project,
   * while there is either (docs/forge.md, "Batches of your own").
   */
  batch: batchRecordSchema.optional(),
  /**
   * The record that the project runs no pull request checks, while it has
   * one; absent, its changes' checks hold their merge (docs/forge.md, "A
   * project with no checks").
   */
  noChecks: noChecksRecordSchema.optional(),
  /**
   * The least time in minutes from one of this person's batches starting
   * to the next (docs/forge.md, "The batch gap"); absent, a batch starts as
   * soon as a change is approved. A held batch's repair never waits for it.
   */
  batchGap: batchGapSchema.optional(),
  /**
   * The project's own line opening what the crew posts to an outside
   * contributor, or an empty string for none (docs/forge.md, "Disclosing AI
   * assistance"); absent, the default line.
   */
  contributorDisclosure: contributorDisclosureSchema.optional(),
  /**
   * The project's advisory workflows, by file (docs/forge.md, "Advisory
   * workflows"): their checks show on every reading and hold nothing.
   * Absent, every check holds as read.
   */
  advisoryWorkflows: advisoryWorkflowsSchema.optional(),
  /**
   * Whether a runbook that is on at the home offers batched pull requests,
   * so the project may newly choose them (`deliveryChoices`); absent from an
   * older home, which offers them by host alone.
   */
  batchesOffered: z.boolean().optional(),
});
export type RepoView = z.infer<typeof repoViewSchema>;

/**
 * Whether a batched project's approved changes combine in batches of this
 * person's own (docs/forge.md, "Batches of your own"): the batched delivery
 * on a host that takes a batch pull request.
 */
export function ownsBatches(delivery: RepoDelivery, repo: Pick<RepoView, "host">): boolean {
  return delivery === "queue-pr" && hostTakesBatches(repo.host);
}

/**
 * Why a project's tasks can run only on this Mac, or null when its Runs on
 * may name another computer: the personal workspace builds in place here,
 * and a project with no origin has nowhere another computer could clone it
 * from (docs/helper.md, "Its working copies").
 */
export function runsHereOnly(repo: Pick<RepoView, "kind" | "origin">): string | null {
  if (repo.kind === "personal") return `The personal workspace stays on ${HERE.this}.`;
  if (!repo.origin) return `Kept on ${HERE.this} only, so its tasks run there.`;
  return null;
}

/**
 * A task's own Runs on that names this Mac (`WorkShape.runs_on_ask`,
 * docs/helper.md "A task's own Runs on"); any other value is a device id.
 */
export const RUNS_ON_THIS_MAC = "this-mac";

/**
 * The feed line when a project's Runs on changes (design skill
 * `components/devices/RunsOn`). `where` places the computer after a verb,
 * as `signInPlace` does ("on Mac mini", "as Builder"), as words or as the
 * fact `SignInPlace.said` holds; null is this Mac. `fromHere` says the
 * project ran on this Mac before.
 */
export function runsOnLine(
  name: string,
  where: string | SaidPart | null,
  fromHere: boolean,
  automatic = false,
): string {
  return englishOf(runsOnSaid(name, where, fromHere, automatic));
}

/**
 * The same line as a saved fact (docs/i18n.md, "Saved facts"), saying this
 * computer and here as places (`PLACE_SAID`), so a computer that controls
 * the first mate names the first mate's computer there.
 */
export function runsOnSaid(
  name: string,
  where: string | SaidPart | null,
  fromHere: boolean,
  automatic = false,
): Said {
  if (automatic) return said("feedRunsOnAutomatic", { name });
  if (where === null)
    return said("feedRunsOnHere", { name, computer: PLACE_SAID.this, here: PLACE_SAID.here });
  return fromHere
    ? said("feedRunsOnFromHere", { name, where, here: PLACE_SAID.here })
    : said("feedRunsOnThere", { name, where });
}

export const repoSetupResultSchema = z.object({
  repo: repoViewSchema,
  created: z.boolean(),
  initializedGit: z.boolean().optional(),
  createdInitialCommit: z.boolean().optional(),
  /**
   * The folder a removed project left in the projects folder, linked where it
   * is instead of cloning a second copy (docs/fleet.md, "Adding a removed
   * project back").
   */
  leftFolder: z.string().optional(),
});
export type RepoSetupResult = z.infer<typeof repoSetupResultSchema>;

/**
 * A folder dropped on the main message box (docs/composer.md, "Files"): the
 * setup card that went up for it, or the project it already is.
 */
export const folderOfferSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("card"), cardId: z.string().min(1) }),
  z.object({ kind: z.literal("already"), name: z.string().min(1) }),
]);
export type FolderOffer = z.infer<typeof folderOfferSchema>;

/**
 * What a setup would do, read without doing any of it (the setup card,
 * `./projectSetup.ts`): the project already on the list, or the name it
 * would get, where it lives, whether adding a plain folder starts a git
 * repository in it, and the task key it was asked to take, normalized.
 */
export type RepoSetupCheck =
  | { existing: RepoView }
  | {
      name: string;
      origin: string | null;
      host: RepoHost;
      startsGit: boolean;
      key?: string;
      /** The existing project it would join, when the spec names one. */
      project?: { key: string; name: string };
      /** The folder a removed project left, which the setup links where it is. */
      leftFolder?: string;
    };

/**
 * Where `project-move` takes repositories (INF-5005, docs/fleet.md "Moving a
 * repository to another project"): an existing project by its task key, or
 * a project of its own - the one the repository was made with when it was
 * removed, else a new one, with a chosen key or one derived from its name.
 */
export const repoMoveTargetSchema = z.union([
  z.string().trim().min(1),
  z.strictObject({ own: z.literal(true), key: z.string().trim().min(1).optional() }),
]);
export type RepoMoveTarget = z.infer<typeof repoMoveTargetSchema>;

/** What a move did: the project the repositories are in now, and how many tasks joined it. */
export const repoMoveResultSchema = z.object({
  project: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  repos: z.array(z.object({ id: z.string(), name: z.string() })),
  tasks: z.number().int().nonnegative(),
});
export type RepoMoveResult = z.infer<typeof repoMoveResultSchema>;

/** Tasks still on a project. Any open or active task blocks its removal. */
export const repoRemovalSchema = z.object({
  tasks: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      status: z.enum(["planned", "working"]),
    }),
  ),
});
export type RepoRemoval = z.infer<typeof repoRemovalSchema>;

/** Settings and Firstmate say the same thing when tasks are in the way. */
export function repoRemovalRefusal(name: string, tasks: RepoRemoval["tasks"]): string {
  const named = tasks.map((task) => `${task.key} "${task.title}" (${task.status})`);
  const list =
    named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : (named[0] ?? "");
  return `${name} still has ${tasks.length === 1 ? "1 task" : `${tasks.length} tasks`}: ${list}. Finish or drop ${tasks.length === 1 ? "it" : "them"}, then remove it.`;
}

/** What Remove does to a project, said on its row before anything is asked. */
export const REPO_REMOVAL_LINE = "Takes it off this list. Its folder and finished tasks stay.";

export function repoRemovalQuestion(name: string, path: string): string {
  return `Remove ${name}? Its folder stays at ${path}, and its finished tasks stay readable.`;
}

/**
 * Where new projects go: the folder `clone` and `init` create their real
 * directories in. `custom` is false while it is the app's own fleet root,
 * the default; a folder the person chose in Settings -> Projects is
 * `custom`. Projects already set up never move when it changes.
 */
export const projectsFolderViewSchema = z.object({
  path: z.string(),
  custom: z.boolean(),
});
export type ProjectsFolderView = z.infer<typeof projectsFolderViewSchema>;

/** The one `repo_configured` payload Settings and `app_change project-settings` broadcast. */
export function repoConfiguredEvent(repo: RepoView): {
  type: "repo_configured";
  repoId: string;
  name: string;
  delivery: RepoDelivery;
  autonomy: boolean;
  rigor: z.infer<typeof rigorSchema> | null;
} {
  return {
    type: "repo_configured",
    repoId: repo.id,
    name: repo.name,
    delivery: repo.delivery,
    autonomy: repo.autonomy,
    rigor: repo.rigor,
  };
}

/** The one outcome line Settings and `app_change project-settings` write. */
export function repoPolicyOutcome(repo: RepoView): string {
  return `${repo.name} now ships ${repo.delivery} with autonomy ${
    repo.autonomy ? "on" : "off"
  }, rigor ${repo.rigor ?? "standard"}.`;
}

export const DEFAULT_WORKSPACE_ID = "default";
