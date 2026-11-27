import { randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { advisoryWorkflowsSchema } from "@shared/advisoryWorkflows";
import { type BatchRecord, batchRecordSchema } from "@shared/batches";
import {
  type ContributionRoute,
  contributionOriginMatches,
  contributionRouteSchema,
} from "@shared/contributions";
import { type ForgeKind, forgeOf, type KnownForgeHost } from "@shared/forge";
import { changeRequestHost } from "@shared/forgeKinds";
import { AUTOMATIC_COMPUTER, placementRequirementsSchema } from "@shared/placement";
import {
  ADVISORY_WORKFLOWS_REFUSAL,
  BATCH_HOST_REFUSAL,
  BATCHES_OFF_REFUSAL,
  deliveryChoices,
  NO_CHECKS_REFUSAL,
  type NoChecksChange,
  type NoChecksRecord,
  namesAdvisoryWorkflows,
  noChecksRecordSchema,
  type ProjectsFolderView,
  type RepoDelivery,
  type RepoKind,
  type RepoMoveTarget,
  type RepoPolicyPatch,
  type RepoSetupCheck,
  type RepoSetupKind,
  type RepoSetupResult,
  type RepoSetupSpec,
  type RepoView,
  readsPullRequestChecks,
  repoHostFrom,
  runsHereOnly,
} from "@shared/repos";
import type { Rigor } from "@shared/rigor";
import type { NamingRule } from "@shared/runbooks";
import { PERSONAL_WORKSPACE_NAME } from "../paths";
import { folderLinkType } from "../platform";
import { CostLimitStore } from "../storage/costLimitStore";
import type { AppDatabase } from "../storage/db";
import {
  ensureRepoProject,
  joinableProject,
  type ProjectRecord,
  ProjectStore,
} from "../storage/projectStore";
import type { SettingsStore } from "../storage/settingsStore";
import { prepared } from "../storage/statements";
import { APP_GIT_IDENTITY, git, isGitRepo } from "./git";
import { composedName } from "./naming";
import { applyRepositoryMove, planRepositoryMove, type RepositoryMove } from "./repositoryMove";

/** A fleet-root link to a project folder: a junction on Windows (`folderLinkType`). */
function linkFolder(target: string, path: string): void {
  symlinkSync(target, path, folderLinkType());
}

/**
 * The managed-repo registry (decision D-8, fleet-root revision): local git
 * repos crewmates work on, each task in its own worktree. Setup and policy
 * and removal share the Settings/Firstmate action catalog. SQLite-backed so it survives restarts.
 *
 * The fleet root (userData/fleet) is the app-owned canonical home/index:
 * clone and init create real directories in the projects folder - the
 * fleet root itself unless the person chose another folder in Settings ->
 * Projects, in which case the fleet root links each new directory the way
 * it links an adopted one; adopt keeps an existing folder in place and
 * creates a fleet-root symlink to it (captain's call - adopted data never
 * moves). `path` is always the real working directory, so worktrees and
 * display never care which kind a repo is or where it sits.
 */

export type RepoRegistryOptions = {
  /**
   * Where the person's choice of projects folder is kept. Without it every
   * new project goes in the fleet root and the choice is refused.
   */
  settings?: Pick<SettingsStore, "getProjectsFolder" | "setProjectsFolder">;
  /**
   * The app's own data folder (userData). A projects folder is never inside
   * it: its working copies, sessions and fleet entries are the app's.
   */
  appDataDir?: string;
  /**
   * The hosts on the person's own server the app knows, with each one's
   * kind (`ForgeSignIns.knownHosts`): a new project there is stamped that
   * kind, the way github.com's is GitHub (`docs/forge.md`, "Hosts on your
   * own server").
   */
  knownHosts?: () => readonly KnownForgeHost[];
  /** The active naming runbook's rule, which names a new project's first commit; absent or null, none is on. */
  namingRule?: () => NamingRule | null;
  /**
   * Whether a runbook that is on offers batched pull requests
   * (`Runbooks.offers`); absent, the deliveries follow the host alone.
   */
  batchesOffered?: () => boolean;
};

export type { RepoSetupResult, RepoSetupSpec } from "@shared/repos";

type Row = {
  id: string;
  name: string;
  path: string;
  setup_kind: RepoSetupKind;
  kind: RepoKind;
  origin: string | null;
  forge_kind: ForgeKind | null;
  forge_host: string | null;
  delivery: RepoDelivery;
  autonomy: number;
  rigor: Rigor | null;
  scope: string | null;
  runs_on: string | null;
  placement_requirements_json?: string | null;
  contribution_json?: string | null;
  batch_json?: string | null;
  no_checks_json?: string | null;
  batch_gap_minutes?: number | null;
  contributor_disclosure?: string | null;
  advisory_workflows_json?: string | null;
};

/** Where a new repository goes: a task key of its own, or the existing project it joins by key. */
type Into = { key?: string | undefined; project?: string | undefined };

const ROW_COLUMNS =
  "id, name, path, setup_kind, kind, origin, forge_kind, forge_host, delivery, autonomy, rigor, runs_on, placement_requirements_json, scope, contribution_json, batch_json, no_checks_json, batch_gap_minutes, contributor_disclosure, advisory_workflows_json";

function fromRow(row: Row): RepoView {
  const contribution = row.contribution_json ? JSON.parse(row.contribution_json) : null;
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    ...(row.contribution_json != null ? { contributionChecked: true } : {}),
    ...(contribution ? { contribution: contributionRouteSchema.parse(contribution) } : {}),
    path: row.path,
    setupKind: row.setup_kind,
    kind: row.kind,
    origin: row.origin,
    // Where the project lives is stamped at insert or approved address change; a row
    // written without it reads its origin the same way the stamp would.
    host: repoHostFrom(
      row.forge_kind ? { kind: row.forge_kind, host: row.forge_host } : forgeOf(row.origin),
    ),
    delivery: row.delivery,
    autonomy: row.autonomy === 1,
    rigor: row.rigor,
    runsOn: row.runs_on ?? null,
    ...(row.placement_requirements_json && row.placement_requirements_json !== "null"
      ? {
          placementRequirements: placementRequirementsSchema.parse(
            JSON.parse(row.placement_requirements_json),
          ),
        }
      : {}),
    ...(row.batch_json ? batchOf(row.batch_json) : {}),
    ...(row.no_checks_json ? noChecksOf(row.no_checks_json) : {}),
    ...(row.batch_gap_minutes ? { batchGap: row.batch_gap_minutes } : {}),
    ...(row.contributor_disclosure != null
      ? { contributorDisclosure: row.contributor_disclosure }
      : {}),
    ...(row.advisory_workflows_json ? advisoryWorkflowsOf(row.advisory_workflows_json) : {}),
  };
}

/** The project's advisory workflows; a garbled value reads as none, so every check holds. */
function advisoryWorkflowsOf(json: string): { advisoryWorkflows?: string[] } {
  try {
    const parsed = advisoryWorkflowsSchema.safeParse(JSON.parse(json));
    return parsed.success && parsed.data.length > 0 ? { advisoryWorkflows: parsed.data } : {};
  } catch {
    return {};
  }
}

/** The record that the project runs no checks; a garbled value reads as none, so checks hold. */
function noChecksOf(json: string): { noChecks?: NoChecksRecord } {
  try {
    const parsed = noChecksRecordSchema.safeParse(JSON.parse(json));
    return parsed.success ? { noChecks: parsed.data } : {};
  } catch {
    return {};
  }
}

/** The saved line and open batch; a garbled value reads as none. */
function batchOf(json: string): { batch?: BatchRecord } {
  try {
    const parsed = batchRecordSchema.safeParse(JSON.parse(json));
    return parsed.success ? { batch: parsed.data } : {};
  } catch {
    return {};
  }
}

/** A new project's row as `saveNewRepo` saves it; each absent policy takes the registry's default. */
export type NewRepoRow = {
  id: string;
  name: string;
  path: string;
  setupKind: RepoSetupKind;
  kind?: RepoKind | undefined;
  origin: string | null;
  delivery: RepoDelivery;
  /** Off when absent. */
  autonomy?: boolean | undefined;
  /** Standard when absent. */
  rigor?: Rigor | null | undefined;
  /** Automatic for a hosted project, else this computer, when absent. */
  runsOn?: string | null | undefined;
  /** When it was added; the list orders by it. Now when absent. */
  addedAt?: number | undefined;
  /** The task key chosen for it, checked free; derived from the name when absent. */
  projectKey?: string | undefined;
  /**
   * An existing project it joins instead of getting its own (INF-4220), by
   * id; never together with `projectKey`. Scratch, the personal
   * workspace's project and a removed project are refused.
   */
  project?: string | undefined;
};

/**
 * The one writer of a new project's row: where it lives stamped from its
 * address, Runs on stamped for a hosted project, and its task project born
 * in the same transaction (design section 8). `RepoRegistry` saves every
 * project a person adds through it, and fixtures that need a fixed id seed
 * through it (`seedProject`), so a column the registry starts stamping
 * reaches both.
 */
export function saveNewRepo(
  db: AppDatabase,
  spec: NewRepoRow,
  knownHosts: readonly KnownForgeHost[] = [],
): RepoView {
  const kind = spec.kind ?? "project";
  const repo: RepoView = {
    id: spec.id,
    name: spec.name,
    scope: null,
    path: spec.path,
    setupKind: spec.setupKind,
    kind,
    origin: spec.origin,
    host: repoHostFrom(forgeOf(spec.origin, knownHosts)),
    delivery: spec.delivery,
    autonomy: spec.autonomy ?? false,
    rigor: spec.rigor === undefined ? "standard" : spec.rigor,
    runsOn:
      spec.runsOn === undefined
        ? spec.origin && kind !== "personal"
          ? AUTOMATIC_COMPUTER
          : null
        : spec.runsOn,
  };
  if (spec.project !== undefined && spec.projectKey !== undefined)
    throw new Error("A repository joins a project or gets a key of its own, never both.");
  if (spec.project !== undefined && kind === "personal")
    throw new Error("The personal workspace keeps a project of its own.");
  db.transaction(() => {
    const projectId =
      spec.project === undefined
        ? ensureRepoProject(db, repo, Date.now(), spec.projectKey)
        : joinableProject(db, spec.project);
    db.prepare(
      `INSERT INTO repos (id, path, name, setup_kind, kind, origin, forge_kind, forge_host, delivery, autonomy, rigor, added_at, runs_on, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      repo.id,
      repo.path,
      repo.name,
      repo.setupKind,
      repo.kind,
      repo.origin,
      repo.host?.kind ?? "none",
      repo.host?.name ?? null,
      repo.delivery,
      repo.autonomy ? 1 : 0,
      repo.rigor,
      spec.addedAt ?? Date.now(),
      repo.runsOn,
      projectId,
    );
  })();
  return repo;
}

export class RepoRegistry {
  private projection: Map<string, RepoView | undefined> | undefined;

  /** Placement and policy facts share each project's row during a synchronous read. */
  readProjection<T>(read: () => T): T {
    if (this.projection) return read();
    this.projection = new Map();
    try {
      return read();
    } finally {
      this.projection = undefined;
    }
  }

  /** Each managed repo's project (task-system D5, INF-4220): born with its first row, archived with its last. */
  private readonly projects: ProjectStore;
  private readonly costLimits: CostLimitStore;
  /** Who hears a project's Runs on change (`onRunsOn`). */
  private readonly runsOnListeners = new Set<(repo: RepoView) => void>();
  private readonly addressListeners = new Set<(former: RepoView, origin: string | null) => void>();
  /** Who hears a project's line of approved changes or its open batch change (`onBatch`). */
  private readonly batchListeners = new Set<(repo: RepoView) => void>();
  /** Who hears the app start or end a project's no-checks record (`onNoChecks`). */
  private readonly noChecksListeners = new Set<(repo: RepoView, change: NoChecksChange) => void>();

  constructor(
    private readonly db: AppDatabase,
    private readonly fleetRoot: string,
    private readonly options: RepoRegistryOptions = {},
  ) {
    this.projects = new ProjectStore(db);
    this.costLimits = new CostLimitStore(db);
  }

  projectsFolder(): ProjectsFolderView {
    const chosen = this.options.settings?.getProjectsFolder() ?? null;
    return chosen ? { path: chosen, custom: true } : { path: this.fleetRoot, custom: false };
  }

  /**
   * Choose where new projects go; null, or the fleet root itself, puts it
   * back to the default. Projects already set up stay where they are. A
   * folder that is not there, one the app cannot write to, one inside the
   * app's own data, or one inside a managed project is refused with a
   * reason the person can read.
   */
  setProjectsFolder(raw: string | null): ProjectsFolderView {
    const settings = this.options.settings;
    if (!settings) throw new Error("New projects can only go in Infinitary's own folder here.");
    if (raw === null) {
      settings.setProjectsFolder(null);
      return this.projectsFolder();
    }
    const trimmed = raw.trim();
    if (!isAbsolute(trimmed)) {
      throw new Error(`Choose a folder by its full path; "${raw}" is not one.`);
    }
    const path = resolve(trimmed);
    let isDirectory = false;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) throw new Error(`No folder exists at ${path}.`);
    const real = realPath(path);
    const fleetRoot = realPath(this.fleetRoot);
    if (real === fleetRoot) {
      settings.setProjectsFolder(null);
      return this.projectsFolder();
    }
    const appData = this.options.appDataDir ? realPath(this.options.appDataDir) : null;
    if (sameOrInside(real, fleetRoot) || (appData && sameOrInside(real, appData))) {
      throw new Error(`${path} is inside Infinitary's own data. Choose a folder outside it.`);
    }
    const project = this.list().find((repo) => sameOrInside(real, realPath(repo.path)));
    if (project) {
      throw new Error(
        `${path} is inside your project ${project.name}. Choose a folder outside your projects.`,
      );
    }
    try {
      accessSync(path, constants.W_OK);
    } catch {
      throw new Error(
        `Infinitary cannot add anything to ${path}. Choose a folder it can write to.`,
      );
    }
    settings.setProjectsFolder(path);
    return this.projectsFolder();
  }

  /**
   * Whether the captain added a project: any repo but the personal
   * workspace, read as one row, never building a view of each.
   */
  hasProject(): boolean {
    // i18n-exempt: a database statement, read by no person
    const any = "SELECT 1 FROM repos WHERE kind != 'personal' LIMIT 1";
    return prepared(this.db, any).get() !== undefined;
  }

  list(): RepoView[] {
    const rows = this.db
      .prepare(`SELECT ${ROW_COLUMNS} FROM repos ORDER BY added_at`)
      .all() as Row[];
    const offered = this.options.batchesOffered?.();
    return rows.map((row) => this.viewOf(row, offered));
  }

  /**
   * A host on the person's own server became known (a key sign-in kept, or
   * the app's start): each project there stamped a plain Git host is
   * stamped the kind it runs - GitHub for a GitHub Enterprise host, or a
   * `.ghe.com` host known by its name. Nothing is ever stamped back: a
   * sign-out leaves the host what it is, the way a github.com project stays
   * GitHub. Says how many projects moved.
   */
  stampKnownHosts(known: readonly KnownForgeHost[]): number {
    // A row written without a stamp reads its origin; it is stamped here too.
    const rows = this.db
      .prepare("SELECT id, origin FROM repos WHERE forge_kind = 'git' OR forge_kind IS NULL")
      .all() as { id: string; origin: string | null }[];
    const stamp = this.db.prepare(
      "UPDATE repos SET forge_kind = ?, forge_host = ? WHERE id = ? AND (forge_kind = 'git' OR forge_kind IS NULL)",
    );
    let moved = 0;
    for (const row of rows) {
      const where = forgeOf(row.origin, known);
      if (where.kind === "git" || where.kind === "none" || !where.host) continue;
      moved += stamp.run(where.kind, where.host, row.id).changes;
      this.projection?.delete(row.id);
    }
    return moved;
  }

  get(id: string): RepoView | undefined {
    if (this.projection?.has(id)) return this.projection.get(id);
    const row = prepared(this.db, `SELECT ${ROW_COLUMNS} FROM repos WHERE id = ?`).get(id) as
      | Row
      | undefined;
    const repo = row ? this.viewOf(row) : undefined;
    this.projection?.set(id, repo);
    return repo;
  }

  /** `offered` is read once for a whole list; absent, it is read for this one view. */
  private viewOf(row: Row, offered = this.options.batchesOffered?.()): RepoView {
    const limit = row.kind === "personal" ? null : this.costLimits.limitOf("project", row.id);
    return {
      ...fromRow(row),
      ...(row.kind === "personal" ? {} : { costLimit: limit }),
      ...(offered !== undefined && row.kind !== "personal" ? { batchesOffered: offered } : {}),
    };
  }

  /** Whether a project may newly choose batched pull requests: a runbook that is on offers them. */
  batchesOffered(): boolean {
    return this.options.batchesOffered?.() ?? true;
  }

  /** True only while this exact path remains a registered project checkout. */
  managesProjectPath(id: string, path: string): boolean {
    const repo = this.get(id);
    return !!repo && repo.kind === "project" && resolve(repo.path) === resolve(path);
  }

  /**
   * Add a project. A project already on the list is answered as it is, its
   * key unchanged; a chosen task key is checked before anything is cloned,
   * created or linked, so a refused key leaves nothing behind.
   */
  async setup(spec: RepoSetupSpec): Promise<RepoSetupResult> {
    mkdirSync(this.fleetRoot, { recursive: true });
    const into = { key: spec.key, project: spec.project };
    if (spec.kind === "clone") return this.clone(spec.origin, spec.name, into);
    if (spec.kind === "init") return this.init(spec.name, into);
    return this.adopt(spec.path, spec.name, into);
  }

  /**
   * What `setup` would do with a spec, read without writing anything (the
   * setup card, docs/fleet.md "Asking the first mate to add a project"): the
   * project already on the list - the same folder, or another project with
   * the same origin - or the name it would get and where it lives. A spec
   * setup would refuse throws the same reason now.
   */
  async check(spec: RepoSetupSpec): Promise<RepoSetupCheck> {
    const sameOrigin = (origin: string | null) =>
      origin
        ? (this.db
            .prepare(`SELECT ${ROW_COLUMNS} FROM repos WHERE origin = ? AND kind = 'project'`)
            .get(origin) as Row | undefined)
        : undefined;
    const lives = (origin: string | null) =>
      repoHostFrom(forgeOf(origin, this.options.knownHosts?.() ?? []));
    if (spec.kind === "clone") {
      const origin = spec.origin.trim();
      if (!origin) throw new Error("clone needs a remote URL in origin.");
      const existing = sameOrigin(origin);
      if (existing) return { existing: fromRow(existing) };
      const parent = this.newProjectParent();
      const left = await this.leftFolder(spec.name ?? nameFromOrigin(origin), parent, origin);
      if (left)
        return {
          name: left.name,
          origin: left.origin,
          host: lives(left.origin),
          startsGit: false,
          leftFolder: left.path,
          ...this.chosenPlace(spec),
        };
      const name = this.uniqueName(spec.name ?? nameFromOrigin(origin), parent);
      return { name, origin, host: lives(origin), startsGit: false, ...this.chosenPlace(spec) };
    }
    if (spec.kind === "init") {
      const name = spec.name.trim();
      if (!/^[\w][\w.-]*$/.test(name)) {
        throw new Error(
          `"${spec.name}" is not a usable project name; use letters, digits, dot, dash, underscore.`,
        );
      }
      if (this.nameTaken(name, this.newProjectParent())) {
        throw new Error(`A fleet entry named "${name}" already exists; pick another name.`);
      }
      return { name, origin: null, host: null, startsGit: false, ...this.chosenPlace(spec) };
    }
    const abs = resolve(spec.path.trim());
    let isDirectory = false;
    try {
      isDirectory = statSync(abs).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) throw new Error(`No folder exists at ${abs}.`);
    const left = this.inFleetRoot(abs);
    const here = left ? this.ownerOf(left) : this.atPath(abs);
    if (here) return { existing: here };
    const startsGit = !(await isGitRepo(abs));
    const origin = startsGit
      ? null
      : await git(abs, ["config", "--get", "remote.origin.url"])
          .then((url) => url || null)
          .catch(() => null);
    const existing = sameOrigin(origin);
    if (existing) return { existing: fromRow(existing) };
    return {
      name: this.uniqueName(spec.name ?? basename(abs), undefined, left && realPath(left)),
      origin,
      host: lives(origin),
      startsGit,
      ...(left ? { leftFolder: left } : {}),
      ...this.chosenPlace(spec),
    };
  }

  /** A chosen task key as a check reads it: normalized, or refused in words. */
  private chosenKey(key: string | undefined): { key?: string } {
    return key === undefined ? {} : { key: this.projects.freeKey(key) };
  }

  /**
   * Where a new repository goes, as a check reads it: the existing project
   * it joins (INF-4220), or the task key chosen for its own; refused in words.
   */
  private chosenPlace(spec: { key?: string | undefined; project?: string | undefined }): {
    key?: string;
    project?: { key: string; name: string };
  } {
    if (spec.project === undefined) return this.chosenKey(spec.key);
    const joined = this.joining(spec.project, spec.key);
    return { project: { key: joined.key, name: joined.name } };
  }

  private joining(projectKey: string, key: string | undefined): ProjectRecord {
    if (key !== undefined)
      throw new Error("A repository joins a project or gets a task key of its own, never both.");
    const project = this.projects.byKey(projectKey.trim());
    if (!project) throw new Error(`No project has the task key ${projectKey.trim()}.`);
    joinableProject(this.db, project.id);
    return project;
  }

  /** What `insert` saves for a chosen place: the project id it joins, or its own task key. */
  private placeOf(into: Into): { projectKey?: string; project?: string } {
    if (into.project === undefined) return { projectKey: this.chosenKey(into.key).key };
    return { project: this.joining(into.project, into.key).id };
  }

  /**
   * The personal workspace as a managed repo (talk-to-personalize Step 4):
   * registered on first need, under the reserved name, at the directory the
   * seeder owns, as the one `personal` KIND with autonomy on - a crewmate
   * there builds in place and the host commits. Its delivery column is
   * written local-only and never read: where a change lands is not a
   * question a workspace that never ships one asks. Idempotent; never clones
   * or inits (the seeder made the repo), and never lands anywhere but that
   * path.
   */
  ensurePersonal(workspaceDir: string): RepoView {
    const existing = this.db
      .prepare(`SELECT ${ROW_COLUMNS} FROM repos WHERE name = ?`)
      .get(PERSONAL_WORKSPACE_NAME) as Row | undefined;
    if (existing) return fromRow(existing);
    const repo = this.insert({
      name: PERSONAL_WORKSPACE_NAME,
      path: workspaceDir,
      setupKind: "init",
      kind: "personal",
      origin: null,
      delivery: "local-only",
    });
    this.db.prepare("UPDATE repos SET autonomy = 1 WHERE id = ?").run(repo.id);
    this.projection?.delete(repo.id);
    return { ...repo, autonomy: true };
  }

  personal(): RepoView | undefined {
    const row = this.db
      .prepare(`SELECT ${ROW_COLUMNS} FROM repos WHERE name = ?`)
      .get(PERSONAL_WORKSPACE_NAME) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** The registry is the only writer of verified host identities and contribution consent. */
  setContribution(id: string, route: ContributionRoute): RepoView {
    const repo = this.get(id);
    if (!repo) throw new Error("That project is no longer here.");
    const contribution = contributionRouteSchema.parse(route);
    this.db
      .prepare("UPDATE repos SET contribution_json = ? WHERE id = ?")
      .run(JSON.stringify(contribution), id);
    this.projection?.delete(id);
    return { ...repo, contribution, contributionChecked: true };
  }

  /** JSON null records a successful inspection without a contribution route; SQL null is undiscovered. */
  markContributionChecked(id: string): RepoView {
    this.db.prepare("UPDATE repos SET contribution_json = 'null' WHERE id = ?").run(id);
    this.projection?.delete(id);
    const repo = this.get(id);
    if (!repo) throw new Error("That project is no longer here.");
    return repo;
  }

  /**
   * Change a repo's delivery posture, autonomy flag, and/or standing rigor
   * (delivery rigor phase 3). Standard is the standing default. The personal
   * workspace takes no policy at all: it is
   * a workspace kind rather than a posture, so every patch on it is refused
   * with one message.
   */
  configure(id: string, changes: RepoPolicyPatch): RepoView {
    const repo = this.checkConfigure(id, changes);
    const name = changes.name ?? repo.name;
    const path = changes.path === undefined ? repo.path : realpathSync(resolve(changes.path));
    const origin = changes.origin === undefined ? repo.origin : changes.origin;
    const where =
      changes.origin === undefined
        ? { kind: repo.host?.kind ?? "none", host: repo.host?.name ?? null }
        : forgeOf(origin, this.options.knownHosts?.());
    const oldLink = join(this.fleetRoot, repo.name);
    const nextLink = join(this.fleetRoot, name);
    let oldTarget: string | undefined;
    let created = false;
    if (name !== repo.name || path !== repo.path) {
      try {
        if (lstatSync(oldLink).isSymbolicLink()) oldTarget = readlinkSync(oldLink);
      } catch {
        /* A folder moved outside the app. */
      }
      if (join(realpathSync(this.fleetRoot), name) !== path) {
        if (nextLink === oldLink && oldTarget !== undefined) unlinkSync(oldLink);
        try {
          linkFolder(path, nextLink);
          created = true;
        } catch (error) {
          if (nextLink === oldLink && oldTarget !== undefined) linkFolder(oldTarget, oldLink);
          throw error;
        }
      }
    }
    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            "UPDATE repos SET name = ?, path = ?, origin = ?, forge_kind = ?, forge_host = ?, delivery = ?, autonomy = ?, rigor = ?, runs_on = ?, placement_requirements_json = ?, scope = ? WHERE id = ?",
          )
          .run(
            name,
            path,
            origin,
            where.kind,
            where.host,
            changes.delivery ?? repo.delivery,
            (changes.autonomy ?? repo.autonomy) ? 1 : 0,
            changes.rigor === undefined ? repo.rigor : changes.rigor,
            origin && repo.kind === "project"
              ? repo.origin
                ? repo.runsOn
                : AUTOMATIC_COMPUTER
              : null,
            JSON.stringify(
              changes.placementRequirements === undefined
                ? (repo.placementRequirements ?? null)
                : changes.placementRequirements,
            ),
            changes.scope === undefined ? (repo.scope ?? null) : changes.scope,
            id,
          );
        if (
          changes.origin !== undefined &&
          origin !== repo.origin &&
          (!repo.contribution ||
            ![repo.contribution.upstream, repo.contribution.fork].some(
              (project) => project && contributionOriginMatches(project, origin, where.kind),
            ))
        )
          this.db.prepare("UPDATE repos SET contribution_json = NULL WHERE id = ?").run(id);
        if (changes.costLimit !== undefined)
          this.costLimits.setLimit("project", id, changes.costLimit, Date.now());
        // Off keeps a record already there, with the task and evidence that started it.
        if (changes.requireChecks !== undefined && changes.requireChecks === !!repo.noChecks)
          this.db
            .prepare("UPDATE repos SET no_checks_json = ? WHERE id = ?")
            .run(changes.requireChecks ? null : JSON.stringify({ at: Date.now() }), id);
        if (changes.batchGap !== undefined)
          this.db
            .prepare("UPDATE repos SET batch_gap_minutes = ? WHERE id = ?")
            .run(changes.batchGap, id);
        if (changes.contributorDisclosure !== undefined)
          this.db
            // i18n-exempt: SQL, never shown
            .prepare("UPDATE repos SET contributor_disclosure = ? WHERE id = ?")
            .run(changes.contributorDisclosure, id);
        if (changes.advisoryWorkflows !== undefined)
          this.db
            // i18n-exempt: SQL, never shown
            .prepare("UPDATE repos SET advisory_workflows_json = ? WHERE id = ?")
            .run(
              changes.advisoryWorkflows.length > 0
                ? JSON.stringify(changes.advisoryWorkflows)
                : null,
              id,
            );
        this.projects.renameForRepo(id, name);
        if (origin !== repo.origin)
          for (const listener of this.addressListeners) listener(repo, origin);
      })();
    } catch (error) {
      if (created) unlinkSync(nextLink);
      if (nextLink === oldLink && oldTarget !== undefined) linkFolder(oldTarget, oldLink);
      throw error;
    }
    this.projection?.delete(id);
    if (nextLink !== oldLink && oldTarget !== undefined) unlinkSync(oldLink);
    const next = this.get(id) as RepoView;
    if (next.runsOn !== repo.runsOn)
      for (const listener of [...this.runsOnListeners]) listener(next);
    return next;
  }

  /** Read the checkout's address, never trusting it as the approved destination. */
  async detectedOrigin(id: string): Promise<string | null> {
    const repo = this.get(id);
    if (!repo) throw new Error("That project is no longer here.");
    // A failed read is not proof that origin was removed.
    // Read the configured address, not an insteadOf transport rewrite.
    const remotes = await git(repo.path, ["remote"]);
    return remotes.split("\n").includes("origin")
      ? await git(repo.path, ["config", "--get", "remote.origin.url"])
      : null;
  }

  /** Check a patch without changing the registry, links, or git configuration. */
  checkConfigure(id: string, changes: RepoPolicyPatch): RepoView {
    const repo = this.get(id);
    if (!repo) throw new Error(`Unknown repo_id "${id}".`);
    if (repo.kind === "personal")
      throw new Error(
        changes.name !== undefined || changes.path !== undefined || changes.origin !== undefined
          ? "The personal workspace builds in place; its details and settings cannot change."
          : "The personal workspace builds in place; its delivery, autonomy and rigor cannot change.",
      );
    const name = changes.name ?? repo.name;
    let ownFolder = repo.path;
    if (changes.path !== undefined) {
      let path: string;
      try {
        if (!isAbsolute(changes.path) || !statSync(changes.path).isDirectory())
          throw new Error("Not a project folder.");
        path = realpathSync(changes.path);
      } catch {
        throw new Error("Choose an existing project folder with its full path.");
      }
      ownFolder = path;
      if (this.list().some((other) => other.id !== id && other.path === path))
        throw new Error("That folder already belongs to another project.");
      if (path !== repo.path && existsSync(repo.path))
        throw new Error("Move the project's folder first; changing its folder never moves files.");
    }
    // The delivery the project would have, against the host it would live on:
    // a new address can move a queue-pr project off GitHub too.
    const host =
      changes.origin === undefined
        ? repo.host
        : repoHostFrom(forgeOf(changes.origin, this.options.knownHosts?.()));
    if (
      (changes.delivery ?? repo.delivery) === "queue-pr" &&
      !deliveryChoices(host, true).includes("queue-pr")
    )
      throw new Error(BATCH_HOST_REFUSAL);
    // Only a newly chosen batch needs the runbook on: a batched project's other settings still change.
    if (changes.delivery === "queue-pr" && repo.delivery !== "queue-pr" && !this.batchesOffered())
      throw new Error(BATCHES_OFF_REFUSAL);
    // Only a project that reads pull request checks, as this patch leaves
    // it, may record that it runs none: a local merge reads no checks.
    if (
      changes.requireChecks === false &&
      !readsPullRequestChecks({
        kind: repo.kind,
        delivery: changes.delivery ?? repo.delivery,
        origin: changes.origin === undefined ? repo.origin : changes.origin,
        host,
      })
    )
      throw new Error(NO_CHECKS_REFUSAL);
    // Naming none is always accepted, as turning checks back on is.
    if (
      changes.advisoryWorkflows !== undefined &&
      changes.advisoryWorkflows.length > 0 &&
      !namesAdvisoryWorkflows({
        kind: repo.kind,
        delivery: changes.delivery ?? repo.delivery,
        origin: changes.origin === undefined ? repo.origin : changes.origin,
        host,
      })
    )
      throw new Error(ADVISORY_WORKFLOWS_REFUSAL);
    if (
      name !== repo.name &&
      (!/^[\w][\w.-]*$/.test(name) || this.nameTaken(name, undefined, ownFolder))
    )
      throw new Error(
        "Choose an unused project name with letters, digits, dot, dash or underscore.",
      );
    return repo;
  }

  /** Also check git for a new folder or address; failure never clears a saved address. */
  async checkDetails(id: string, changes: RepoPolicyPatch): Promise<void> {
    const repo = this.checkConfigure(id, changes);
    const path = changes.path ?? repo.path;
    if (changes.path !== undefined) {
      if (
        !(await isGitRepo(path)) ||
        realpathSync(await git(path, ["rev-parse", "--show-toplevel"])) !== realpathSync(path)
      )
        throw new Error("Choose the git project's main folder, not a folder inside it.");
    }
    if (changes.origin !== undefined) {
      if (changes.origin?.includes("://")) {
        const address = new URL(changes.origin);
        if (address.password || (address.username && address.protocol !== "ssh:"))
          throw new Error("Use a project address without sign-in material.");
      }
      const remotes = await git(path, ["remote"]);
      const current = remotes.split("\n").includes("origin")
        ? await git(path, ["config", "--get", "remote.origin.url"])
        : null;
      if (current !== changes.origin)
        throw new Error(
          "Where the folder points changed. Check its current address and ask again.",
        );
    }
  }

  /**
   * Choose where a project's next task starts (multi-machine piece 11,
   * docs/helper.md "Runs on"): a paired computer that runs work by its id,
   * or null for this Mac. The caller checks the device and the captain-held
   * gate; a project that can run only here is refused with its reason
   * (`runsHereOnly`). A task already started keeps the computer it started on.
   */
  setRunsOn(id: string, deviceId: string | null): RepoView {
    const repo = this.get(id);
    if (!repo) throw new Error(`Unknown repo_id "${id}".`);
    const here = runsHereOnly(repo);
    if (here && deviceId !== null) throw new Error(`${repo.name}: ${here}`);
    this.db.prepare("UPDATE repos SET runs_on = ? WHERE id = ?").run(deviceId, id);
    this.projection?.delete(id);
    const next = this.get(id) as RepoView;
    for (const listener of [...this.runsOnListeners]) listener(next);
    return next;
  }

  /**
   * A project's line of approved changes and its open batch (docs/forge.md,
   * "Batches of your own"), written whole by `Batches` alone; an empty
   * record clears it. The batch listeners hear a change, so Settings reads
   * the project again.
   */
  recordBatch(id: string, record: BatchRecord): RepoView | undefined {
    const repo = this.get(id);
    if (!repo) return undefined;
    const empty =
      record.line.length === 0 &&
      !record.open &&
      record.receipts.length === 0 &&
      record.leftOut.length === 0 &&
      !record.sentBack?.length &&
      !record.ways &&
      // A declared fix and the versions it is carried from outlive every batch until it merges.
      !record.fixes?.length &&
      !record.held?.length &&
      !record.fixBases &&
      // Who was told to rebuild on an open batch stays until that task closes.
      !record.rebuilds?.length &&
      // The batches that ended in the last day stay for the Batches panel (docs/forge.md, "The Batches panel").
      !record.finished?.length;
    const json = empty ? null : JSON.stringify(batchRecordSchema.parse(record));
    if (json === (repo.batch ? JSON.stringify(repo.batch) : null)) return repo;
    this.db.prepare("UPDATE repos SET batch_json = ? WHERE id = ?").run(json, id);
    this.projection?.delete(id);
    const next = this.get(id) as RepoView;
    for (const listener of [...this.batchListeners]) listener(next);
    return next;
  }

  /**
   * Whether the app already looked in this project for files of the team
   * queue it once shipped (docs/forge.md, "A project that still carries
   * the team queue's files"), so the first mate hears of them once. The
   * mark is 0 in the column the retired queue offer kept its version in,
   * where every version was 1 or more.
   */
  teamQueueLooked(id: string): boolean {
    const row = this.db.prepare("SELECT queue_offered FROM repos WHERE id = ?").get(id) as
      | { queue_offered: number | null }
      | undefined;
    return row?.queue_offered === 0;
  }

  recordTeamQueueLooked(id: string): void {
    this.db.prepare("UPDATE repos SET queue_offered = 0 WHERE id = ?").run(id);
  }

  /**
   * Record that a project runs no pull request checks, from a crewmate's
   * declaration with its task, version and evidence (docs/forge.md, "A
   * project with no checks"). A record already there is kept as it is.
   */
  recordNoChecks(id: string, record: NoChecksRecord): RepoView | undefined {
    const repo = this.get(id);
    if (!repo || repo.kind === "personal") return undefined;
    if (repo.noChecks) return repo;
    this.db
      .prepare("UPDATE repos SET no_checks_json = ? WHERE id = ?")
      .run(JSON.stringify(noChecksRecordSchema.parse(record)), id);
    this.projection?.delete(id);
    const next = this.get(id) as RepoView;
    for (const listener of [...this.noChecksListeners])
      listener(next, { kind: "recorded", record });
    return next;
  }

  /**
   * End a project's no-checks record because a check ran on one of its
   * changes: its checks hold the merge again. `check` names that check and
   * `change` the change it ran on, in the host's words.
   */
  endNoChecks(id: string, ran: { check: string; change: string }): RepoView | undefined {
    const repo = this.get(id);
    if (!repo?.noChecks) return undefined;
    this.db.prepare("UPDATE repos SET no_checks_json = NULL WHERE id = ?").run(id);
    this.projection?.delete(id);
    const next = this.get(id) as RepoView;
    for (const listener of [...this.noChecksListeners]) listener(next, { kind: "ended", ...ran });
    return next;
  }

  /** Hears the app start or end a project's no-checks record, after it is written. */
  onNoChecks(listener: (repo: RepoView, change: NoChecksChange) => void): () => void {
    this.noChecksListeners.add(listener);
    return () => {
      this.noChecksListeners.delete(listener);
    };
  }

  /** Keep the local records tied to the approved address in the same transaction. */
  onAddressChange(listener: (former: RepoView, origin: string | null) => void): void {
    this.addressListeners.add(listener);
  }

  /** Hears each change of a project's line or open batch, after it is written; answers its own unsubscribe. */
  onBatch(listener: (repo: RepoView) => void): () => void {
    this.batchListeners.add(listener);
    return () => {
      this.batchListeners.delete(listener);
    };
  }

  /** Hears each change of a project's Runs on, after it is written; answers its own unsubscribe. */
  onRunsOn(listener: (repo: RepoView) => void): () => void {
    this.runsOnListeners.add(listener);
    return () => {
      this.runsOnListeners.delete(listener);
    };
  }

  /**
   * Drop the registration. Never deletes repo data: a repo outside the
   * fleet root - adopted, or cloned or created in a chosen projects folder -
   * loses only its fleet-root symlink; directories stay on disk.
   */
  unregister(id: string): void {
    const repo = this.get(id);
    if (repo?.name === PERSONAL_WORKSPACE_NAME) {
      throw new Error(
        "The personal workspace is the app's own and stays managed; remove a panel with personalize instead.",
      );
    }
    if (repo) {
      // Only ever a link: a project in the fleet root itself is a real
      // directory, and it stays.
      const link = join(this.fleetRoot, repo.name);
      try {
        if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
      } catch {
        // No link to clean (legacy row, or the user removed it) - fine.
      }
    }
    const drop = this.db.transaction(() => {
      const project = this.projects.forRepo(id);
      this.db.prepare("DELETE FROM repos WHERE id = ?").run(id);
      this.projection?.delete(id);
      if (!project) return;
      // The project archives once its last repository leaves, never deletes:
      // its closed tasks stay readable.
      this.projects.archiveIfEmpty(project.id);
      // One left of several (INF-4220): a project of one is named with its
      // repository, so it takes that repository's name back.
      const left = this.projects.repositoriesOf(project.id);
      if (left.length === 1 && left[0]) this.projects.renameForRepo(left[0].id, left[0].name);
    });
    drop();
  }

  /**
   * The project a registered repository belongs to, with how many it holds
   * (INF-4220); undefined for a repository no longer here.
   */
  projectOf(
    repoId: string,
  ): { id: string; key: string; name: string; repositories: number } | undefined {
    if (!this.get(repoId)) return undefined;
    const project = this.projects.forRepo(repoId);
    if (!project) return undefined;
    const { id, key, name } = project;
    return { id, key, name, repositories: this.projects.repositoriesOf(id).length };
  }

  /**
   * Check a move of repositories into another project (INF-5005,
   * `project-move`) and say what it would do, or refuse it in words;
   * nothing is written (`planRepositoryMove`).
   */
  planMove(repoIds: readonly string[], target: RepoMoveTarget): RepositoryMove {
    return planRepositoryMove(
      { db: this.db, projects: this.projects, get: (id) => this.get(id) },
      repoIds,
      target,
    );
  }

  /**
   * Write a checked move's repository and project rows inside the caller's
   * transaction (`applyRepositoryMove`): each repository keeps its id, name,
   * folder, settings and cost limit, and only its project changes.
   */
  applyMove(move: RepositoryMove): ProjectRecord {
    const joined = applyRepositoryMove({ db: this.db, projects: this.projects }, move);
    for (const repo of move.repos) this.projection?.delete(repo.id);
    return joined;
  }

  /**
   * Name a project of several repositories (INF-4220). A project of one is
   * named with its repository, through `configure`, as before.
   */
  renameProject(projectId: string, raw: string): { id: string; name: string; was: string } {
    const name = raw.trim();
    if (!name) throw new Error("A project needs a name.");
    const project = this.projects.get(projectId);
    if (project?.kind !== "repo" || project.archivedAt !== null)
      throw new Error("That project is not here. It may have been removed.");
    if (this.projects.repositoriesOf(projectId).length < 2)
      throw new Error(
        `${project.name} is named with its repository; rename the repository instead.`,
      );
    this.projects.rename(projectId, name);
    return { id: projectId, name, was: project.name };
  }

  private async clone(
    originRaw: string,
    name: string | undefined,
    into: Into,
  ): Promise<RepoSetupResult> {
    const origin = originRaw.trim();
    if (!origin) throw new Error("clone needs a remote URL in origin.");
    const existing = this.db
      .prepare(`SELECT ${ROW_COLUMNS} FROM repos WHERE origin = ? AND setup_kind = 'clone'`)
      .get(origin) as Row | undefined;
    if (existing) return { repo: fromRow(existing), created: false };
    const place = this.placeOf(into);
    const parent = this.newProjectParent();
    const left = await this.leftFolder(name ?? nameFromOrigin(origin), parent, origin);
    if (left) {
      const index = join(this.fleetRoot, left.name);
      if (left.path !== index) linkFolder(left.path, index);
      const createdInitialCommit = await this.ensureInitialCommit(left.path);
      const repo = this.insert({
        name: left.name,
        path: left.path,
        setupKind: "clone",
        origin: left.origin,
        delivery: "direct-pr",
        ...place,
      });
      return {
        repo,
        created: true,
        leftFolder: left.path,
        ...(createdInitialCommit ? { createdInitialCommit } : {}),
      };
    }
    const repoName = this.uniqueName(name ?? nameFromOrigin(origin), parent);
    const target = join(parent, repoName);
    // "--" so an origin starting with "-" can never be read as a git option.
    await git(parent, ["clone", "--", origin, repoName]);
    this.linkFromFleetRoot(parent, repoName);
    // An empty remote clones with an unborn HEAD; seed it like init so task
    // worktrees can branch.
    const createdInitialCommit = await this.ensureInitialCommit(target);
    const repo = this.insert({
      name: repoName,
      path: target,
      setupKind: "clone",
      origin,
      delivery: "direct-pr",
      ...place,
    });
    return { repo, created: true, ...(createdInitialCommit ? { createdInitialCommit } : {}) };
  }

  private async init(nameRaw: string, into: Into): Promise<RepoSetupResult> {
    const name = nameRaw.trim();
    if (!/^[\w][\w.-]*$/.test(name)) {
      throw new Error(
        `"${nameRaw}" is not a usable project name; use letters, digits, dot, dash, underscore.`,
      );
    }
    const parent = this.newProjectParent();
    if (this.nameTaken(name, parent)) {
      throw new Error(`A fleet entry named "${name}" already exists; pick another name.`);
    }
    const place = this.placeOf(into);
    const target = join(parent, name);
    await git(parent, ["init", "-b", "main", name]);
    this.linkFromFleetRoot(parent, name);
    const createdInitialCommit = await this.ensureInitialCommit(target);
    const repo = this.insert({
      name,
      path: target,
      setupKind: "init",
      origin: null,
      delivery: "local-only",
      ...place,
    });
    return { repo, created: true, ...(createdInitialCommit ? { createdInitialCommit } : {}) };
  }

  private async adopt(
    pathRaw: string,
    name: string | undefined,
    into: Into,
  ): Promise<RepoSetupResult> {
    const abs = resolve(pathRaw.trim());
    let isDirectory = false;
    try {
      isDirectory = statSync(abs).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) throw new Error(`No folder exists at ${abs}.`);
    const left = this.inFleetRoot(abs);
    const existing = left ? this.ownerOf(left) : this.atPath(abs);
    if (existing) return { repo: existing, created: false };
    const place = this.placeOf(into);
    const path = left ?? abs;

    const initializedGit = !(await isGitRepo(path));
    if (initializedGit) await git(path, ["init", "-b", "main"]);
    const createdInitialCommit = await this.ensureInitialCommit(path);
    const origin = await git(path, ["config", "--get", "remote.origin.url"])
      .then((url) => url || null)
      .catch(() => null);
    const repoName = this.uniqueName(name ?? basename(path), undefined, left && realPath(left));
    // The linked reference (captain's call): the fleet root indexes the
    // repo, the data stays put. A folder already in the fleet root indexes
    // itself under its own name.
    if (path !== join(this.fleetRoot, repoName)) linkFolder(path, join(this.fleetRoot, repoName));
    const repo = this.insert({
      name: repoName,
      path,
      setupKind: "adopt",
      origin,
      delivery: origin ? "direct-pr" : "local-only",
      ...place,
    });
    return {
      repo,
      created: true,
      ...(initializedGit ? { initializedGit } : {}),
      ...(createdInitialCommit ? { createdInitialCommit } : {}),
      ...(left ? { leftFolder: left } : {}),
    };
  }

  /**
   * A folder picked inside the fleet root, as the fleet root names it: only
   * a real folder directly in it, not the personal workspace's, is added -
   * a removed project's folder, linked where it is (docs/fleet.md, "Adding
   * a removed project back"). The root itself, an index link and a folder
   * inside a project are refused. Undefined for a folder outside the fleet
   * root.
   */
  private inFleetRoot(abs: string): string | undefined {
    const roots = [this.fleetRoot, realPath(this.fleetRoot)];
    if (!roots.some((root) => sameOrInside(abs, root))) return undefined;
    const name = basename(abs);
    if (!roots.includes(dirname(abs)) || name === PERSONAL_WORKSPACE_NAME || !isRealFolder(abs))
      throw new Error(`${abs} is already inside the fleet root; it needs no adoption.`);
    return join(this.fleetRoot, name);
  }

  /** The registered repository at exactly `path`. */
  private atPath(path: string): RepoView | undefined {
    const row = this.db.prepare(`SELECT ${ROW_COLUMNS} FROM repos WHERE path = ?`).get(path) as
      | Row
      | undefined;
    return row && fromRow(row);
  }

  /** The registered repository whose working folder `path` is, however either path is spelled. */
  private ownerOf(path: string): RepoView | undefined {
    const real = realPath(path);
    return this.list().find((repo) => repo.path === path || realPath(repo.path) === real);
  }

  /**
   * The folder a removed project left where new projects go, or in the
   * fleet root where they went before another folder was chosen: under the
   * name a clone of `origin` would take or a numbered name after it, a real
   * folder no project holds, the top of its own git repository, whose remote
   * is the same project. Removing a project leaves its folder, so adding it
   * back links that folder where it is instead of cloning a second copy
   * beside it named with -2.
   */
  private async leftFolder(
    base: string,
    parent: string,
    origin: string,
  ): Promise<{ name: string; path: string; origin: string } | undefined> {
    const known = this.options.knownHosts?.() ?? [];
    const cleaned = cleanName(base);
    for (let i = 0; ; i += 1) {
      const name = i === 0 ? cleaned : `${cleaned}-${i + 1}`;
      // The numbered names a clone would skip end at the first free one.
      if (!this.nameTaken(name, parent)) return undefined;
      if (name === PERSONAL_WORKSPACE_NAME) continue;
      if (this.named(name)) continue;
      const index = join(this.fleetRoot, name);
      // A folder in a chosen folder is linked from the fleet root under its
      // name, so it is taken only while that name is free there.
      const places = parent === this.fleetRoot ? [index] : [join(parent, name), index];
      for (const path of places) {
        if (path !== index && exists(index)) continue;
        if (!isRealFolder(path) || this.ownerOf(path)) continue;
        const remote = await remoteOf(path);
        if (remote && sameProject(remote, origin, known)) return { name, path, origin: remote };
      }
    }
  }

  private insert(spec: {
    name: string;
    path: string;
    setupKind: RepoSetupKind;
    kind?: RepoKind;
    origin: string | null;
    delivery: RepoDelivery;
    /** The task key chosen for it, checked free; derived from the name when absent. */
    projectKey?: string | undefined;
    /** The existing project it joins, by id, checked joinable. */
    project?: string | undefined;
  }): RepoView {
    const repo = saveNewRepo(
      this.db,
      { ...spec, id: randomUUID().slice(0, 8) },
      this.options.knownHosts?.() ?? [],
    );
    this.projection?.delete(repo.id);
    return repo;
  }

  /** Seed history for worktrees without including or consuming the person's staged files. */
  private async ensureInitialCommit(dir: string): Promise<boolean> {
    try {
      await git(dir, ["rev-parse", "--verify", "HEAD"]);
      return false;
    } catch {
      await git(dir, [
        ...APP_GIT_IDENTITY,
        "commit",
        // --allow-empty permits an empty commit but still includes the index.
        // --only with no paths ignores it, including when HEAD is unborn.
        "--only",
        "--allow-empty",
        "-m",
        composedName("initialize fleet project", this.options.namingRule?.() ?? null),
      ]);
      return true;
    }
  }

  /**
   * The folder a clone or init creates its directory in. A chosen folder
   * that is no longer there - a drive not plugged in, a folder removed -
   * refuses the setup rather than being made anew where nobody picked.
   */
  private newProjectParent(): string {
    const { path, custom } = this.projectsFolder();
    if (!custom) return this.fleetRoot;
    let isDirectory = false;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      throw new Error(
        `The folder chosen for new projects, ${path}, is not there. Reconnect the drive it is on, or choose another folder in Settings under Projects.`,
      );
    }
    return path;
  }

  /** A new project outside the fleet root is indexed there by a link, like an adopted one. */
  private linkFromFleetRoot(parent: string, name: string): void {
    if (parent === this.fleetRoot) return;
    linkFolder(join(parent, name), join(this.fleetRoot, name));
  }

  /** Whether a registered repository has this name. */
  private named(name: string): boolean {
    return this.db.prepare("SELECT 1 FROM repos WHERE name = ?").get(name) !== undefined;
  }

  /**
   * Taken in the registry, in the fleet root's index, or - for a directory
   * about to be created in a chosen projects folder - already there.
   */
  private nameTaken(name: string, parent?: string, ownFolder?: string): boolean {
    // The personal workspace's name is reserved even before its directory
    // exists, so a clone or init never lands where the seeder will write.
    if (name === PERSONAL_WORKSPACE_NAME) return true;
    if (this.named(name)) return true;
    return [this.fleetRoot, ...(parent && parent !== this.fleetRoot ? [parent] : [])].some(
      (dir) => {
        try {
          const entry = join(dir, name);
          const stat = lstatSync(entry);
          if (ownFolder && stat.isDirectory() && realpathSync(entry) === ownFolder) return false;
          return true;
        } catch {
          return false;
        }
      },
    );
  }

  /** `ownFolder`, a real path, is the folder being added, which never takes its own name. */
  private uniqueName(base: string, parent?: string, ownFolder?: string): string {
    const cleaned = cleanName(base);
    for (let i = 0; ; i += 1) {
      const candidate = i === 0 ? cleaned : `${cleaned}-${i + 1}`;
      if (!this.nameTaken(candidate, parent, ownFolder)) return candidate;
    }
  }
}

function cleanName(base: string): string {
  return base.replace(/[^\w.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "repo";
}

/** A folder itself, never a link to one: a fleet-root index link is not a project's folder. */
function isRealFolder(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** The remote a folder's own git repository names as origin; undefined inside another repository. */
async function remoteOf(dir: string): Promise<string | undefined> {
  try {
    if (realPath(await git(dir, ["rev-parse", "--show-toplevel"])) !== realPath(dir))
      return undefined;
    return (await git(dir, ["config", "--get", "remote.origin.url"])) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Two addresses of one project: the same words, or the same project path on
 * the same host however it is reached - https or ssh, with or without .git -
 * folding case where the host does (`contributionOriginMatches`).
 */
function sameProject(a: string, b: string, known: readonly KnownForgeHost[]): boolean {
  if (a.trim() === b.trim()) return true;
  const one = forgeOf(a, known);
  const other = forgeOf(b, known);
  if (!one.host || one.host !== other.host || !one.owner || !one.name) return false;
  const path = `${one.owner}/${one.name}`;
  const otherPath = `${other.owner}/${other.name}`;
  return changeRequestHost(one.kind)?.foldsNames
    ? path.toLowerCase() === otherPath.toLowerCase()
    : path === otherPath;
}

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function sameOrInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/** "https://host/owner/repo.git" or "/local/path/repo" -> "repo". */
function nameFromOrigin(origin: string): string {
  const tail = origin.replace(/\/+$/, "").split(/[/:]/).at(-1) ?? "repo";
  return tail.replace(/\.git$/, "");
}
