import { BATCH_BRANCH_PREFIX, BATCH_CHECK, type MergeWay, type MergeWays } from "@shared/batches";
import { CONTRIBUTION_MERGE_REFUSAL } from "@shared/contributions";
import { settingFrom } from "@shared/envSettings";
import { branchComparePage, forgePlace, GITHUB_COM, isGitHubEnterpriseCloud } from "@shared/forge";
import { notSignedInText } from "@shared/forges";
import type { NamingRule } from "../../../../shared/runbooks";
import { requireNamed } from "../../../workspace/naming";
import {
  type ApiProject,
  type ForgeApi,
  type ForgeApiResponse,
  gatewayAnswerBytes,
  nextPagePath,
  parseApiRequest,
} from "../../api";
import {
  allowanceResetOf,
  asAdvisory,
  checkTimes,
  type Forge,
  ForgeBaseMoved,
  type ForgeChange,
  type ForgeCheck,
  type ForgeCheckState,
  type ForgeChecks,
  type ForgeComment,
  ForgeError,
  type ForgeLocation,
  ForgeMovedError,
  type ForgeProject,
  type ForgePull,
  type ForgePullComment,
  type ForgeReadiness,
  type ForgeRuleset,
  type ForgeSkipMerge,
  ForgeWriteError,
  isFullCommitId,
  isSignInForgeFailure,
  isTransientForgeFailure,
  type MergeAnswer,
  ownChecksOf,
  type TeamQueueLeftovers,
} from "../../forge";
import { waysUnderRules } from "../../mergeWays";
import { GitHubAttachments, githubStoryDestination } from "./attachments";
import { readCommitFiles, readOwnComments, readPullComments } from "./comments";
import { GitHubContributions } from "./contributions";
import { GitHubDownloads } from "./downloads";
import { failureOf } from "./failures";
import { GitHubReleaseUploads, githubUploadOrigin } from "./releaseUploads";
import { GitHubWorkflows } from "./workflows";

/**
 * GitHub over its REST API (git integration PR 1.1), with the app's own
 * GitHub sign-in as a bearer token (PR 1.2: the device flow in `./oauth.ts`,
 * the store in `../../signIns.ts`). The composition root binds every
 * project on GitHub to one of these; nothing else on this Mac - no other
 * program's sign-in - is ever read.
 *
 * Reads checks and workflow identity as GitHub reports them.
 * Readiness, supersession and repair settlement are crew declarations.
 */

export { githubUploadOrigin };
export const GITHUB_API_URL = "https://api.github.com";
/** GitHub's page size for a list read that names no `per_page`. */
const GITHUB_DEFAULT_PER_PAGE = 30;
const API_VERSION = "2022-11-28";
/** GitHub documents its asynchronous merge, the call every merge goes through, at this version. */
const ASYNC_MERGE_API_VERSION = "2026-03-10";
/** How long the app waits before each read of an asynchronous merge's result; after the last it calls the result unknown. */
const ASYNC_MERGE_READ_DELAYS_MS = [250, 500, 1000, 2000, 3000, 4000];
/** The most pages of a branch's rules a reading follows (100 a page). */
const MAX_RULE_PAGES = 5;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The API base: `INFINITARY_GITHUB_API_URL` in dev and e2e only, gated exactly
 * like the quota sensor's endpoint overrides, so a packaged app can never
 * be pointed anywhere but GitHub.
 */
export function githubApiBaseUrl(options: { packaged: boolean; env?: NodeJS.ProcessEnv }): string {
  const override = settingFrom(options.env ?? process.env, "GITHUB_API_URL")?.trim();
  return !options.packaged && override ? override.replace(/\/+$/, "") : GITHUB_API_URL;
}

/**
 * The API of any GitHub host (`docs/forge.md`, "GitHub Enterprise"):
 * github.com's own (`githubApiBaseUrl`); a GitHub Enterprise Cloud host's
 * `api.<name>.ghe.com`; any other GitHub Enterprise host's `/api/v3`.
 * `INFINITARY_GITHUB_ENTERPRISE_API_URL` stands in for every enterprise host's
 * API in dev and e2e only, gated like the github.com override.
 */
export function githubApiBaseFor(
  host: string,
  options: { packaged: boolean; env?: NodeJS.ProcessEnv },
): string {
  if (host === GITHUB_COM) return githubApiBaseUrl(options);
  const override = settingFrom(options.env ?? process.env, "GITHUB_ENTERPRISE_API_URL")?.trim();
  if (!options.packaged && override) return override.replace(/\/+$/, "");
  return isGitHubEnterpriseCloud(host) ? `https://api.${host}` : `https://${host}/api/v3`;
}

/** GitHub's GraphQL address beside a REST API base: `/api/graphql` on a GitHub Enterprise Server. */
export function githubGraphqlUrl(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, "");
  return base.endsWith("/api/v3") ? `${base.slice(0, -"/v3".length)}/graphql` : `${base}/graphql`;
}

export type GitHubForgeOptions = {
  /** The active naming runbook's rule, read at each use; absent or null, no naming runbook is on. */
  namingRule?: () => NamingRule | null;
  /** The person's GitHub sign-in, read at call time; undefined = not signed in. */
  token: () => Promise<string | undefined>;
  /**
   * GitHub refused the sign-in (a 401). The sign-in service asks GitHub
   * again before anything says "sign in again": one refusal is a reason to
   * look, the health read is the proof.
   */
  onSignInRejected?: () => void;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  /** The wait between reads of an asynchronous merge's result; a test's stand-in skips it. */
  sleep?: (ms: number) => Promise<void>;
};

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

type PullJson = {
  node_id?: string;
  draft?: boolean;
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  head: { sha: string; ref: string; repo?: { full_name?: string; id?: number } | null };
  base?: { ref: string };
};

/** The fields of one pull request read by its number that say whether it may merge. */
type PullStateJson = PullJson & {
  updated_at?: string;
  state: string;
  merged?: boolean;
  merge_commit_sha?: string | null;
  draft?: boolean;
  base: { ref: string };
  mergeable?: boolean | null;
  mergeable_state?: string;
  maintainer_can_modify?: boolean;
};

type AsyncMergeJson = {
  status?: string;
  details?: { uuid?: string; message?: string; sha?: string };
};

/**
 * The most check pages a reading follows (100 per page). A suite past that
 * is not read as complete: one pending item stands for the rest, so a
 * reading the app could not finish never reads green.
 */
const MAX_CHECK_PAGES = 10;
/** The most repos one listing reads (100 a page). */
const MAX_LISTED_PROJECTS = 1000;

type CheckRunJson = {
  name: string;
  status: string;
  conclusion: string | null;
  check_suite?: { id: number } | null;
  started_at?: string | null;
  completed_at?: string | null;
};

/** A commit status: posted at `created_at`, last changed at `updated_at`. */
type StatusJson = {
  id?: number;
  context: string;
  state: string;
  description?: string | null;
  target_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * Where the team queue the app once shipped kept its files in a project on
 * GitHub, by folder: the queue's workflow and the project's batch checks it
 * ran, its action, and its scripts.
 */
const TEAM_QUEUE_FILES: Record<string, readonly string[]> = {
  ".github/workflows": ["infinitary-queue.yml", "infinitary-batch-checks.yml"],
  ".github/actions/infinitary-batch": ["action.yml", "compose.sh"],
  ".github/infinitary": ["rules.mjs", "message.mjs", "github.mjs"],
};

/**
 * The workflow run a check suite belongs to, as far as superseding and the
 * project's advisory workflows need it: `path` is its workflow file.
 */
type SuiteRunJson = {
  id?: number;
  name?: string;
  path?: string;
  check_suite_id: number;
  workflow_id: number;
  event: string;
  run_number: number;
  status: string;
  run_started_at?: string | null;
};

export class GitHubForge implements Forge {
  readonly kind = "github" as const;
  readonly host: string | null;
  /** "GitHub", or a GitHub Enterprise host's own address. */
  readonly place: string;
  readonly hasChecks = true;
  readonly workflows: GitHubWorkflows;
  readonly attachments?: GitHubAttachments;
  readonly api: ForgeApi;
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly downloads: GitHubDownloads;
  private readonly uploads: GitHubReleaseUploads;

  constructor(
    readonly location: ForgeLocation,
    private readonly options: GitHubForgeOptions,
  ) {
    this.host = location.host;
    this.place = forgePlace({ kind: "github", host: location.host ?? GITHUB_COM }) ?? "GitHub";
    this.api = {
      place: this.place,
      defaultPerPage: GITHUB_DEFAULT_PER_PAGE,
      route: (method, raw, bodyBytes) => parseApiRequest(method, raw, this.apiProject(), bodyBytes),
      nextPath: (link) => nextPagePath(link, this.base, this.apiProject()),
      call: (method, path, body) => this.apiCall(method, path, body),
      releaseUpload: (raw, filename) => this.uploads.releaseUploadRoute(raw, filename),
      upload: (route, file) => this.uploads.uploadRelease(route, file),
    };
    this.base = (options.apiBaseUrl ?? GITHUB_API_URL).replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
    const wire = {
      base: this.base,
      place: this.place,
      host: this.host,
      fetch: this.fetcher,
      token: () => options.token(),
    };
    this.downloads = new GitHubDownloads({
      ...wire,
      onSignInRejected: () => options.onSignInRejected?.(),
    });
    this.uploads = new GitHubReleaseUploads({
      ...wire,
      apiProject: () => this.apiProject(),
      canonicalBase: () => githubApiBaseFor(this.host ?? GITHUB_COM, { packaged: true }),
      readAnswer: (response) => this.readAnswer(response),
    });
    if (location.host === GITHUB_COM && location.owner && location.name) {
      this.attachments = new GitHubAttachments({
        fullName: `${location.owner}/${location.name}`,
        token: options.token,
        readRepository: async () => {
          const answer = await this.apiCall("GET", this.repoPath());
          if (answer.status !== 200)
            throw new ForgeError(
              answer.status === 401 ? "sign-in" : answer.status === 403 ? "permission" : "refused",
              `GitHub did not confirm the evidence destination (${answer.status}).`,
            );
          return JSON.parse(answer.body) as unknown;
        },
        uploadBaseUrl: this.uploads.uploadOrigin(),
        fetch: this.fetcher,
        // A key GitHub still answers for makes the upload's 401 a permission;
        // the read's own 401 asks the health service to look again.
        unauthorized: async () => {
          const answer = await this.apiCall("GET", "/user").catch(() => undefined);
          if (answer === undefined) options.onSignInRejected?.();
          return answer?.status === 200 ? "permission" : "sign-in";
        },
      });
    }
    this.workflows = new GitHubWorkflows(
      () => this.repoPath(),
      (path) => this.request("GET", path),
      (path, maxBytes) => this.downloads.downloadBytes(path, maxBytes),
      (path, size) => this.downloads.archiveRanges(path, size),
    );
  }

  get contributions() {
    return new GitHubContributions(this.repoPath(), async (method, path, body) => {
      if (method !== "POST") return this.request(method, path, body);
      let attempted = false;
      let refused = false;
      try {
        return await this.request(
          method,
          path,
          body,
          API_VERSION,
          () => {
            attempted = true;
          },
          undefined,
          (status) => {
            refused = [400, 401, 403, 404, 405, 409, 413, 415, 422, 429].includes(status);
          },
        );
      } catch (error) {
        throw new ForgeWriteError(
          !attempted || refused ? "failed" : "uncertain",
          error instanceof ForgeError ? error.failure : "transient",
          error instanceof ForgeError
            ? error.message
            : `${this.place}'s fork-creation answer could not be read.`,
        );
      }
    });
  }

  private requireMaintainer(): void {
    if (this.location.source) throw new ForgeError("permission", CONTRIBUTION_MERGE_REFUSAL);
  }

  private sourcePath(): string {
    return this.location.source ? `/repos/${this.location.source.fullName}` : this.repoPath();
  }

  async storyDestination() {
    const fullName = `${this.location.owner}/${this.location.name}`;
    const destination = githubStoryDestination(
      await this.request("GET", this.repoPath()),
      fullName,
      this.host ?? GITHUB_COM,
      this.location.source ? "describe" : "upload",
    );
    return {
      ...destination,
      format: this.kind,
      ...(this.location.source ? { media: "card-only" as const } : {}),
    };
  }

  /**
   * Every repo the sign-in lists, newest change first, 100 a page up to
   * `MAX_LISTED_PROJECTS`; `complete` is false when GitHub had more.
   */
  async listProjects(): Promise<ForgeProject[]> {
    return (await this.listProjectsPaged()).projects;
  }

  async listProjectsPaged(): Promise<{ projects: ForgeProject[]; complete: boolean }> {
    const projects: ForgeProject[] = [];
    for (let page = 1; page <= MAX_LISTED_PROJECTS / 100; page++) {
      const repos = (await this.request(
        "GET",
        `/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      )) as {
        full_name: string;
        clone_url: string;
        html_url?: string;
        updated_at?: string;
        private?: boolean;
      }[];
      projects.push(
        ...repos.map((repo) => ({
          fullName: repo.full_name,
          cloneUrl: repo.clone_url,
          url: repo.html_url ?? null,
          updatedAt: repo.updated_at ?? null,
          private: repo.private === true,
        })),
      );
      if (repos.length < 100) return { projects, complete: true };
    }
    return { projects, complete: false };
  }

  /** One repo by its exact owner/name, or null when the sign-in cannot see it. */
  async findProject(fullName: string): Promise<ForgeProject | null> {
    const [owner, name, ...extra] = fullName.split("/");
    if (!owner || !name || extra.length > 0) return null;
    try {
      const repo = (await this.request(
        "GET",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      )) as {
        full_name: string;
        clone_url: string;
        html_url?: string;
        updated_at?: string;
        private?: boolean;
      };
      return {
        fullName: repo.full_name,
        cloneUrl: repo.clone_url,
        url: repo.html_url ?? null,
        updatedAt: repo.updated_at ?? null,
        private: repo.private === true,
      };
    } catch (caught) {
      if (caught instanceof ForgeError && caught.failure === "not-found") return null;
      throw caught;
    }
  }

  async defaultBranch(): Promise<string> {
    const repo = (await this.request("GET", this.repoPath())) as { default_branch?: string };
    if (!repo.default_branch) throw new ForgeError("not-found", "GitHub named no default branch");
    return repo.default_branch;
  }

  async openChange(input: {
    branch: string;
    title: string;
    body: string;
    draft?: boolean;
    base?: string;
  }): Promise<ForgeChange> {
    const base =
      input.base ??
      (await this.defaultBranch().catch((error: unknown) => {
        throw new ForgeWriteError(
          "failed",
          error instanceof ForgeError ? error.failure : "transient",
          "Could not read the base branch; no pull request was sent.",
        );
      }));
    const answer = await this.apiCall(
      "POST",
      `${this.repoPath()}/pulls`,
      JSON.stringify({
        title: input.title,
        head: this.location.source
          ? `${this.location.source.fullName.split("/")[0]}:${input.branch}`
          : input.branch,
        ...(this.location.source
          ? { head_repo: this.location.source.fullName.split("/").at(-1) }
          : {}),
        base,
        body: input.body,
        ...(input.draft ? { draft: true } : {}),
      }),
    );
    if (answer.status !== 201)
      throw changeWriteError(answer.status, "opening the pull request", answer.body);
    return changeOf(JSON.parse(answer.body) as PullJson, input.branch);
  }

  async branchChecks(): Promise<{ sha: string; checks: ForgeChecks }> {
    const branch = await this.defaultBranch();
    const sha = await this.readBranchHead(branch, this.repoPath());
    return { sha, checks: await this.checks({ branch, headSha: sha, url: null }) };
  }

  async branchHead(branch: string): Promise<string> {
    return this.readBranchHead(branch, this.sourcePath());
  }

  private async readBranchHead(branch: string, project: string): Promise<string> {
    const answer = await this.apiCall(
      "GET",
      `${project}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    if (answer.status !== 200)
      throw new ForgeError(
        "refused",
        "The story's branch has not been confirmed on GitHub. Push the reviewed version first.",
      );
    const value = JSON.parse(answer.body) as { object?: { type?: string; sha?: string } };
    if (value.object?.type !== "commit" || !/^[0-9a-f]{40,64}$/.test(value.object.sha ?? ""))
      throw new ForgeError("refused", "GitHub did not confirm the branch's code version.");
    return value.object.sha as string;
  }

  async updateChangeBody(change: ForgeChange, body: string, title?: string): Promise<void> {
    const path = `${this.repoPath()}/pulls/${numbered(change)}`;
    const fresh = await this.apiCall("GET", path).catch((error: unknown) => {
      throw new ForgeWriteError(
        "failed",
        error instanceof ForgeError ? error.failure : "transient",
        "Could not reread the pull request; no description was sent.",
      );
    });
    if (fresh.status !== 200)
      throw new ForgeWriteError(
        "failed",
        "refused",
        "Could not reread the pull request before replacing its description.",
      );
    let pull: PullStateJson;
    try {
      pull = JSON.parse(fresh.body) as PullStateJson;
    } catch {
      throw new ForgeWriteError(
        "failed",
        "refused",
        "GitHub did not return a readable pull request; no description was sent.",
      );
    }
    if (
      pull?.state !== "open" ||
      pull.head?.sha !== change.headSha ||
      (pull.body ?? "") !== (change.body ?? "") ||
      (title !== undefined && pull.title !== change.title)
    )
      throw new ForgeWriteError(
        "failed",
        "refused",
        "The pull request changed after it was read, so its description was not replaced. Read it again before updating.",
      );
    const answer = await this.apiCall(
      "PATCH",
      path,
      JSON.stringify(title === undefined ? { body } : { title, body }),
    );
    if (answer.status !== 200)
      throw changeWriteError(answer.status, "replacing the description", answer.body);
  }

  async changeFor(branch: string): Promise<ForgeChange | null> {
    const head = encodeURIComponent(
      `${this.location.source?.fullName.split("/")[0] ?? this.owner()}:${branch}`,
    );
    const pulls = (await this.request(
      "GET",
      `${this.repoPath()}/pulls?head=${head}&state=open&per_page=1`,
    )) as PullJson[];
    const pull = this.location.source
      ? pulls.find((item) => item.head.repo?.full_name === this.location.source?.fullName)
      : pulls[0];
    return pull ? changeOf(pull, branch) : null;
  }

  async checks(change: ForgeChange, movedPast?: string) {
    const sha = encodeURIComponent(movedPast ?? change.headSha);
    const runs = await this.pages<CheckRunJson>(
      `${this.repoPath()}/commits/${sha}/check-runs`,
      (page) => (page as { check_runs?: CheckRunJson[] }).check_runs ?? [],
    );
    const statuses = await this.pages<StatusJson>(
      `${this.repoPath()}/commits/${sha}/status`,
      (page) => (page as { statuses?: StatusJson[] }).statuses ?? [],
    );
    // Waiting jobs can have no check yet. Read the workflow runs once for
    // both that gap and the checks a later run decides. Preserve a refused side list's
    // reason with the partial facts; existing sign-in/transient boundaries stay intact.
    let workflowRuns: { total_count?: number; workflow_runs?: SuiteRunJson[] } | null = null;
    let problem: string | undefined;
    try {
      workflowRuns = (await this.request(
        "GET",
        `${this.repoPath()}/actions/runs?head_sha=${sha}&per_page=100`,
      )) as { total_count?: number; workflow_runs?: SuiteRunJson[] };
    } catch (caught) {
      // F25: a passing network error is not a lasting refusal, with or without cancellations.
      if (
        isSignInForgeFailure(caught) ||
        isTransientForgeFailure(caught) ||
        allowanceResetOf(caught) !== undefined
      )
        throw caught;
      const why = caught instanceof Error ? caught.message : String(caught);
      problem =
        caught instanceof ForgeError && caught.failure === "permission"
          ? `${this.place} refused access to the remaining checks. ${why}`
          : `${this.place} could not provide all check runs: ${why}`;
    }
    const workflows = workflowRuns?.workflow_runs ?? [];
    // Only a check GitHub placed in a run of an advisory file is advisory:
    // a commit status, or a check in no listed run, holds as read.
    const advisoryRun = (run: SuiteRunJson) =>
      !!run.path && !!this.location.advisoryWorkflows?.includes(run.path);
    const read: ForgeCheck[] = [
      ...this.withoutSupersededRuns(runs.items, workflows, advisoryRun),
      ...statuses.items.map((status) => {
        const state = STATUS_STATES[status.state] ?? ("pending" as const);
        // A status starts when it was first posted; a settled one finished at its last change.
        return {
          name: status.context,
          state,
          ...checkTimes(status.created_at, state === "pending" ? null : status.updated_at),
          ...(status.description ? { detail: status.description } : {}),
          ...(status.target_url ? { link: status.target_url } : {}),
        };
      }),
    ];
    for (const run of workflows) {
      if (run.status !== "completed") {
        read.push({
          name: `${run.name ?? "workflow"} (run ${run.run_number})`,
          state: "pending",
          summary: true,
          run: run.id,
          workflow: run.workflow_id,
          event: run.event,
          ...checkTimes(run.run_started_at, null),
        });
      }
    }
    const advisory = new Set(workflows.filter(advisoryRun).map((run) => run.id));
    const marked = read.map((check) =>
      check.run !== undefined && advisory.has(check.run) ? asAdvisory(check) : check,
    );
    // A pull request's checks are the runs it started (INF-1891), and a
    // batch's the runs its own pushed branch started too; a branch's own
    // checks, read with no number, keep every run at its version.
    const items =
      change.number !== undefined
        ? ownChecksOf(marked, change.branch.startsWith(BATCH_BRANCH_PREFIX))
        : marked;
    return {
      items,
      ...(problem ? { problem } : {}),
      complete:
        runs.complete &&
        statuses.complete &&
        workflowRuns !== null &&
        (workflowRuns.total_count ?? workflows.length) <= workflows.length,
    };
  }

  /**
   * A later run of the same workflow, started by the same event at this
   * version, decides each check of the same name an earlier run left,
   * whatever that earlier check read: a duplicate the later run cancelled
   * (captain F26), or a failed request retried by a new one (INF-4584), as a
   * rerun's newest attempt decides inside one run. While the later run has
   * not created that check it reads pending; finished without one, the
   * earlier check counts as it reads. A check the app cannot place in a
   * workflow run counts as it reads, facts preserved. The pending stand-in
   * keeps no run of its own, so an advisory workflow's is marked here.
   */
  private withoutSupersededRuns(
    runs: CheckRunJson[],
    workflowRuns: SuiteRunJson[],
    advisoryRun: (run: SuiteRunJson) => boolean,
  ): ForgeCheck[] {
    const read = runs.map((run) => {
      const workflow = workflowRuns.find((item) => item.check_suite_id === run.check_suite?.id);
      return {
        run,
        check: {
          name: run.name,
          state: runState(run),
          status: run.status,
          conclusion: run.conclusion,
          ...checkTimes(run.started_at, run.completed_at),
          ...(workflow
            ? { run: workflow.id, workflow: workflow.workflow_id, event: workflow.event }
            : {}),
        },
      };
    });
    const bySuite = new Map(workflowRuns.map((run) => [run.check_suite_id, run]));
    const origin = (run: CheckRunJson) =>
      run.check_suite ? bySuite.get(run.check_suite.id) : undefined;
    return read.flatMap(({ run, check }): ForgeCheck[] => {
      const from = origin(run);
      if (!from) return [check];
      const later = workflowRuns.filter(
        (next) =>
          next.workflow_id === from.workflow_id &&
          next.event === from.event &&
          next.run_number > from.run_number,
      );
      if (later.length === 0) return [check];
      const decided = runs.some((other) => {
        const next = origin(other);
        return other.name === run.name && next !== undefined && later.includes(next);
      });
      if (decided) return [];
      // The later run holds no check of this name yet: pending until it
      // does, and as it read if the later run finished without one.
      if (later.every((next) => next.status === "completed")) return [check];
      const waiting: ForgeCheck = { name: check.name, state: "pending" };
      return [advisoryRun(from) ? asAdvisory(waiting) : waiting];
    });
  }

  /**
   * The Git database read answers only an exact full id: the commit reads
   * `checks` uses resolve a longer id to the commit its first 40 characters
   * name (INF-1184). GitHub answers 404 for a repository the sign-in cannot
   * see as well, so a 404 means no such commit only once the repository reads.
   */
  async holdsCommit(sha: string): Promise<boolean> {
    if (!isFullCommitId(sha)) return false;
    const path = `${this.repoPath()}/git/commits/${encodeURIComponent(sha)}`;
    try {
      const commit = (await this.request("GET", path)) as { sha?: string } | null;
      return commit?.sha === sha;
    } catch (caught) {
      if (!(caught instanceof ForgeError && caught.failure === "not-found")) throw caught;
    }
    await this.request("GET", this.repoPath());
    return false;
  }

  /** GitHub's own list of the branches whose head is `sha`, which it answers whole. */
  async branchesAt(sha: string): Promise<string[]> {
    const listed = await this.request(
      "GET",
      `${this.repoPath()}/commits/${encodeURIComponent(sha)}/branches-where-head`,
    );
    if (!Array.isArray(listed)) {
      throw new ForgeError(
        "transient",
        `${this.place}'s list of the branches at ${sha} could not be read.`,
      );
    }
    return (listed as { name?: unknown }[]).flatMap((branch) =>
      typeof branch?.name === "string" ? [branch.name] : [],
    );
  }

  /**
   * Every page of a list GitHub answers 100 at a time, with its
   * `total_count`: read until the count is reached or a page comes back
   * short. `complete` is false when the count says more remain past the
   * last page the app reads.
   */
  private async pages<T>(
    path: string,
    itemsOf: (page: unknown) => T[],
  ): Promise<{ items: T[]; complete: boolean }> {
    const items: T[] = [];
    for (let page = 1; page <= MAX_CHECK_PAGES; page++) {
      const answer = await this.request("GET", `${path}?per_page=100&page=${page}`);
      const listed = itemsOf(answer);
      items.push(...listed);
      const total = (answer as { total_count?: number } | null)?.total_count;
      if (listed.length < 100 || (total !== undefined && items.length >= total)) {
        return { items, complete: true };
      }
    }
    return { items, complete: false };
  }

  /**
   * GitHub's asynchronous merge (`PUT .../merge-async`) with the version
   * guard and GitHub's own choice of action: a branch with a merge queue
   * takes the pull request into it, and any other branch merges it directly.
   * A merge queue takes the version alone, so a request it refuses for
   * naming a merge method or commit words is followed by one that names
   * neither. A GitHub that does not know the call (an Enterprise Server
   * before it) answers 404, or 400 for the API version the call is
   * documented at, before anything is sent on, and gets the direct merge.
   */
  async putIn(
    change: ForgeChange,
    headSha: string,
    way: MergeWay | undefined,
  ): Promise<MergeAnswer> {
    this.requireMaintainer();
    // The project's merges are read before every merge (`mergeWays`), never assumed.
    if (!way)
      throw new ForgeError(
        "refused",
        `no merge this project allows was read before merging ${this.label(change)}`,
        true,
      );
    const path = `${this.repoPath()}/pulls/${numbered(change)}/merge`;
    // `sha` is GitHub's "match head commit" guard: the merge is refused if
    // the change moved on after its checks were read.
    const body = {
      sha: headSha,
      merge_method: way,
      // A rebase merge writes no commit of its own: each change keeps its own.
      ...(way === "rebase"
        ? {}
        : {
            commit_title: requireNamed(
              change.title ?? "",
              "pull request title",
              this.options.namingRule?.() ?? null,
            ),
            commit_message: change.squashMessage ?? change.body ?? "",
          }),
    };
    const first = await this.asyncMerge(`${path}-async`, body, {
      ordinary: true,
      direct: () => this.putInDirect(change, path, body),
    });
    if (first && "direct" in first) return first.direct;
    // A merge queue merges its own way and writes its own commit words, and
    // GitHub refuses a request to one that names either: a result that
    // failed, with nothing sent on. The version alone then goes to the
    // queue by name, an action that takes it into the queue or refuses it
    // and can never merge it another way.
    const reading =
      first?.status === "failed" && /\bmerge queue\b/i.test(first.details?.message ?? "")
        ? await this.asyncMerge(
            `${path}-async`,
            { sha: headSha, merge_action: "merge_queue" },
            { ordinary: true },
          )
        : first;
    if (reading?.status === "merged")
      return reading.details?.sha ? { sha: reading.details.sha } : {};
    if (reading?.status === "enqueued") return { queued: true };
    if (reading?.status === "failed") {
      const said = reading.details?.message ?? "";
      const what = `GitHub did not merge ${this.label(change)}${said ? `: ${said}` : ""}`;
      throw /^Base branch was modified\b/i.test(said)
        ? new ForgeBaseMoved(what)
        : new ForgeError("refused", what);
    }
    // Still running when the reads ended: unknown, so the pull request is read before anything else.
    throw new ForgeError(
      "transient",
      `${this.place} had not finished merging ${this.label(change)} when the app stopped reading`,
    );
  }

  /** The direct merge (`PUT .../merge`), for a GitHub without the asynchronous one. */
  private async putInDirect(change: ForgeChange, path: string, body: object): Promise<MergeAnswer> {
    const answer = (await this.request("PUT", path, body)) as {
      merged?: boolean;
      sha?: string;
      message?: string;
    } | null;
    // A 200 is not a merge on its own: GitHub says it merged, or it did not.
    if (answer?.merged !== true) {
      throw new ForgeError(
        "refused",
        `GitHub did not confirm the merge of ${this.label(change)}${answer?.message ? `: ${answer.message}` : ""}`,
      );
    }
    return answer.sha ? { sha: answer.sha } : {};
  }

  /**
   * Send one asynchronous merge and read its result by the id GitHub
   * returns until it is no longer pending or the reads end. Sent once: a
   * result the app could not read in time is unknown, never a reason to
   * send again. `ordinary` marks a merge within the rules, whose request
   * GitHub may answer with a merge of that pull request still running;
   * `direct` is the merge for a GitHub that does not know the call.
   */
  private async asyncMerge(
    path: string,
    body: object,
    how: { ordinary: true; direct: () => Promise<MergeAnswer> },
  ): Promise<AsyncMergeJson | { direct: MergeAnswer } | null>;
  private async asyncMerge(
    path: string,
    body: object,
    how?: { ordinary: true },
  ): Promise<AsyncMergeJson | null>;
  private async asyncMerge(
    path: string,
    body: object,
    how?: { ordinary: true; direct?: () => Promise<MergeAnswer> },
  ): Promise<AsyncMergeJson | { direct: MergeAnswer } | null> {
    let reading: AsyncMergeJson | null;
    try {
      reading = (await this.request("PUT", path, body, ASYNC_MERGE_API_VERSION)) as AsyncMergeJson;
    } catch (caught) {
      if (!(caught instanceof ForgeError)) throw caught;
      // A GitHub that does not know the call, or the version it is documented
      // at (an Enterprise Server that supports only an older version answers
      // 400 "... is not a supported version"), sent nothing on.
      const unknown =
        caught.failure === "not-found" ||
        /^GitHub answered 400 [^:]*: .*\b(?:API version|is not a supported version)\b/i.test(
          caught.message,
        );
      if (how?.direct && unknown) return { direct: await how.direct() };
      // A merge of this pull request is still running there: its outcome is
      // read, not sent again. A version that moved is GitHub's verdict instead.
      if (
        how?.ordinary &&
        /^GitHub answered 409 /.test(caught.message) &&
        !/: Head branch was modified\b/i.test(caught.message)
      )
        throw new ForgeError("transient", caught.message);
      throw caught;
    }
    for (const delay of ASYNC_MERGE_READ_DELAYS_MS) {
      const uuid = reading?.status === "pending" ? reading.details?.uuid : undefined;
      if (!uuid) break;
      await (this.options.sleep ?? sleep)(delay);
      try {
        reading = (await this.request(
          "GET",
          `${path}/${encodeURIComponent(uuid)}`,
          undefined,
          ASYNC_MERGE_API_VERSION,
        )) as AsyncMergeJson | null;
      } catch (caught) {
        // A result GitHub no longer keeps leaves the outcome unknown, like one still pending.
        if (caught instanceof ForgeError && caught.failure === "not-found") break;
        throw caught;
      }
    }
    return reading;
  }

  /** GitHub's own reading of its merge queue (`isInMergeQueue`), which its REST pull request does not carry. */
  async inHostQueue(number: number): Promise<boolean> {
    const answer = (await this.request(
      "POST",
      "",
      {
        query:
          "query Queued($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { isInMergeQueue } } }",
        variables: { owner: this.owner(), name: this.location.name as string, number },
      },
      API_VERSION,
      undefined,
      githubGraphqlUrl(this.base),
    )) as {
      errors?: unknown[];
      data?: { repository?: { pullRequest?: { isInMergeQueue?: boolean } | null } | null };
    } | null;
    const queued = answer?.data?.repository?.pullRequest?.isInMergeQueue;
    if (answer?.errors?.length || typeof queued !== "boolean")
      throw new ForgeError(
        "transient",
        `${this.place} did not say whether #${number} is in its merge queue`,
      );
    return queued;
  }

  async markReady(change: ForgeChange, beforeSend: () => void): Promise<ForgeChange> {
    const pull = (await this.request(
      "GET",
      `${this.repoPath()}/pulls/${change.number}`,
    )) as PullStateJson;
    if (
      pull.head.sha !== change.headSha ||
      pull.head.ref !== change.branch ||
      pull.state !== "open"
    )
      throw new ForgeError(
        "refused",
        "The prerequisite pull request changed; review its current version first.",
      );
    if (!pull.draft) return changeOf(pull, change.branch);
    if (!pull.node_id)
      throw new ForgeError("refused", "GitHub did not identify the draft pull request.");
    const answer = (await this.request(
      "POST",
      "",
      {
        query:
          "mutation Ready($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }",
        variables: { id: pull.node_id },
      },
      API_VERSION,
      beforeSend,
      githubGraphqlUrl(this.base),
    )) as {
      errors?: unknown[];
      data?: { markPullRequestReadyForReview?: { pullRequest?: { isDraft?: boolean } } };
    };
    if (
      answer.errors?.length ||
      answer.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false
    )
      throw new ForgeError(
        "refused",
        "GitHub did not confirm the draft is ready; read its state before another request.",
      );
    return { ...changeOf(pull, change.branch), draft: false };
  }

  async pull(number: number): Promise<ForgePull> {
    const pull = (await this.request("GET", `${this.repoPath()}/pulls/${number}`)) as PullStateJson;
    const merged = pull.merged === true;
    const headRepo = pull.head.repo?.full_name;
    return {
      number: pull.number,
      url: pull.html_url,
      state: pull.state === "open" ? "open" : "closed",
      merged,
      ...(merged && pull.merge_commit_sha ? { mergedSha: pull.merge_commit_sha } : {}),
      ...(pull.updated_at ? { updatedAt: pull.updated_at } : {}),
      headSha: pull.head.sha,
      base: pull.base.ref,
      ...(pull.head.ref ? { branch: pull.head.ref } : {}),
      ...(pull.title ? { title: pull.title } : {}),
      ...(headRepo ? { headRepo } : {}),
      ...(pull.head.repo?.id !== undefined ? { headRepoId: pull.head.repo.id } : {}),
      readiness: readinessOf(pull),
      mergeable: pull.mergeable ?? null,
      ...(pull.mergeable_state ? { mergeableState: pull.mergeable_state } : {}),
      ...(pull.maintainer_can_modify === true ? { maintainerCanModify: true } : {}),
    };
  }

  /** The signed-in account's name, read once for this forge. */
  private viewer: Promise<string> | undefined;

  async pullComments(number: number, since?: string): Promise<ForgePullComment[]> {
    const viewer = await this.viewerLogin();
    return readPullComments(
      (path) => this.request("GET", path),
      this.repoPath(),
      number,
      viewer,
      since,
    );
  }

  async ownComments(number: number, marker: string): Promise<ForgeComment[]> {
    const viewer = await this.viewerLogin();
    // With no account to match, every comment would read as someone else's and be written again.
    if (!viewer)
      throw new ForgeError("transient", `${this.place} did not say which account is signed in.`);
    return readOwnComments(
      (path) => this.request("GET", path),
      this.repoPath(),
      number,
      viewer,
      marker,
    );
  }

  async writeComment(number: number, body: string, id?: number): Promise<void> {
    await (id === undefined
      ? this.request("POST", `${this.repoPath()}/issues/${number}/comments`, { body })
      : this.request("PATCH", `${this.repoPath()}/issues/comments/${id}`, { body }));
  }

  async deleteComment(_number: number, id: number): Promise<void> {
    try {
      await this.request("DELETE", `${this.repoPath()}/issues/comments/${id}`);
    } catch (caught) {
      if (!(caught instanceof ForgeError && caught.failure === "not-found")) throw caught;
    }
  }

  private viewerLogin(): Promise<string> {
    this.viewer ??= (this.request("GET", "/user") as Promise<{ login?: string } | null>).then(
      (user) => user?.login ?? "",
    );
    return this.viewer.catch((caught: unknown) => {
      this.viewer = undefined;
      throw caught;
    });
  }

  commitFiles(sha: string): Promise<string[]> {
    return readCommitFiles((path) => this.request("GET", path), this.repoPath(), sha);
  }

  /**
   * The active rule sets holding `branch` (`GET /rules/branches/{branch}`),
   * each read once for what this sign-in may skip (`current_user_can_bypass`).
   * A list longer than the app reads is refused, never read as complete.
   */
  async branchRules(branch: string): Promise<ForgeRuleset[]> {
    const found = new Map<number, { rules: Set<string>; mergeMethods?: string[] }>();
    const path = `${this.repoPath()}/rules/branches/${branch.split("/").map(encodeURIComponent).join("/")}`;
    for (let page = 1; ; page++) {
      if (page > MAX_RULE_PAGES) {
        throw new ForgeError(
          "refused",
          `${this.place} holds this branch to more rules than the app reads.`,
        );
      }
      const rules = (await this.request("GET", `${path}?per_page=100&page=${page}`)) as {
        type?: string;
        ruleset_id?: number;
        parameters?: { allowed_merge_methods?: string[]; merge_method?: string };
      }[];
      for (const rule of rules) {
        const id = typeof rule.ruleset_id === "number" ? rule.ruleset_id : 0;
        const entry = found.get(id) ?? { rules: new Set<string>() };
        if (rule.type) entry.rules.add(rule.type);
        const methods = rule.parameters?.allowed_merge_methods;
        // A merge queue merges every pull request its own one way, whatever a request names.
        const queueWay = rule.parameters?.merge_method;
        const named =
          rule.type === "pull_request" && Array.isArray(methods)
            ? methods
            : rule.type === "merge_queue" && typeof queueWay === "string"
              ? [queueWay.toLowerCase()]
              : undefined;
        if (named)
          entry.mergeMethods = entry.mergeMethods
            ? entry.mergeMethods.filter((method) => named.includes(method))
            : named;
        found.set(id, entry);
      }
      if (rules.length < 100) break;
    }
    const sets: ForgeRuleset[] = [];
    for (const [id, entry] of found) {
      // A rule GitHub names no rule set for cannot be read for a skip.
      const set =
        id === 0
          ? {}
          : ((await this.request("GET", `${this.repoPath()}/rulesets/${id}`)) as {
              name?: string;
              current_user_can_bypass?: string;
            });
      const bypass = set.current_user_can_bypass;
      sets.push({
        id,
        name: set.name ?? (id === 0 ? "an unnamed rule set" : `rule set ${id}`),
        bypass:
          bypass === "always" ||
          bypass === "pull_requests_only" ||
          bypass === "exempt" ||
          bypass === "never"
            ? bypass
            : null,
        rules: [...entry.rules],
        ...(entry.mergeMethods ? { mergeMethods: entry.mergeMethods } : {}),
      });
    }
    return sets;
  }

  /**
   * GitHub's asynchronous merge (`PUT .../merge-async`) with squash, the
   * version guard, a direct merge and `bypass_rules`, then its result by
   * the id GitHub returns. Sent once: a result the app could not read in
   * time is unknown, never a reason to send again.
   */
  async putInSkippingRules(change: ForgeChange, headSha: string): Promise<ForgeSkipMerge> {
    this.requireMaintainer();
    const reading = await this.asyncMerge(
      `${this.repoPath()}/pulls/${numbered(change)}/merge-async`,
      {
        sha: headSha,
        merge_method: "squash",
        merge_action: "direct_merge",
        bypass_rules: true,
        commit_title: requireNamed(
          change.title ?? "",
          "pull request title",
          this.options.namingRule?.() ?? null,
        ),
        commit_message: change.squashMessage ?? change.body ?? "",
      },
    );
    const message = reading?.details?.message ?? "";
    if (reading?.status === "merged") {
      return reading.details?.sha
        ? { status: "merged", sha: reading.details.sha }
        : { status: "merged" };
    }
    if (reading?.status === "failed") {
      return { status: "failed", message: message || `${this.place} did not merge it` };
    }
    return {
      status: "unknown",
      message:
        reading?.status === "enqueued"
          ? `${this.place} put it in a merge queue instead of merging it`
          : `${this.place} had not finished the merge when the app stopped reading`,
    };
  }

  async close(change: ForgeChange): Promise<void> {
    await this.request("PATCH", `${this.repoPath()}/pulls/${numbered(change)}`, {
      state: "closed",
    });
  }

  /** The repository's own merge buttons, narrowed by its default branch's rules. */
  async mergeWays(): Promise<MergeWays> {
    const repo = (await this.request("GET", this.repoPath())) as {
      default_branch?: string;
      allow_squash_merge?: boolean;
      allow_merge_commit?: boolean;
      allow_rebase_merge?: boolean;
    };
    // GitHub leaves the three out for a sign-in that cannot push: unknown, never read as allowed.
    if (
      typeof repo.allow_squash_merge !== "boolean" ||
      typeof repo.allow_merge_commit !== "boolean" ||
      typeof repo.allow_rebase_merge !== "boolean" ||
      !repo.default_branch
    )
      throw new ForgeError(
        "permission",
        `${this.place} did not say which merges this project allows for this sign-in.`,
      );
    // A project with no rules, or a plan without them, answers none.
    const rules = await this.branchRules(repo.default_branch).catch((caught: unknown) => {
      if (
        caught instanceof ForgeError &&
        (caught.failure === "permission" || caught.failure === "not-found")
      )
        return [] as ForgeRuleset[];
      throw caught;
    });
    return waysUnderRules(
      {
        squash: repo.allow_squash_merge,
        merge: repo.allow_merge_commit,
        rebase: repo.allow_rebase_merge,
      },
      rules,
    );
  }

  async teamQueueLeftovers(): Promise<TeamQueueLeftovers> {
    const branch = await this.defaultBranch();
    const absent =
      <T>(fallback: T) =>
      (caught: unknown) => {
        if (
          caught instanceof ForgeError &&
          (caught.failure === "not-found" || caught.failure === "permission")
        )
          return fallback;
        throw caught;
      };
    const files: string[] = [];
    for (const [folder, names] of Object.entries(TEAM_QUEUE_FILES)) {
      const listed = (await this.request(
        "GET",
        `${this.repoPath()}/contents/${folder}?ref=${encodeURIComponent(branch)}`,
      ).catch(absent(null))) as { name?: string; type?: string }[] | null;
      if (!Array.isArray(listed)) continue;
      for (const name of names)
        if (listed.some((entry) => entry.type === "file" && entry.name === name))
          files.push(`${folder}/${name}`);
    }
    if (files.length === 0) return { files };
    const rule = await this.ruleRequiring(branch, BATCH_CHECK).catch(absent(undefined));
    return { files, ...(rule ? { rule } : {}) };
  }

  /**
   * The rule on `branch` that requires the status `context`, in GitHub's
   * name for it: a rule set first, then the branch's own protection.
   */
  private async ruleRequiring(branch: string, context: string): Promise<string | undefined> {
    const encoded = branch.split("/").map(encodeURIComponent).join("/");
    const rules = (await this.request(
      "GET",
      `${this.repoPath()}/rules/branches/${encoded}?per_page=100`,
    )) as
      | {
          type?: string;
          ruleset_id?: number;
          parameters?: { required_status_checks?: { context?: string }[] };
        }[]
      | null;
    const held = (rules ?? []).find(
      (rule) =>
        rule.type === "required_status_checks" &&
        (rule.parameters?.required_status_checks ?? []).some((check) => check.context === context),
    );
    if (held) {
      const set =
        typeof held.ruleset_id === "number"
          ? ((await this.request("GET", `${this.repoPath()}/rulesets/${held.ruleset_id}`).catch(
              () => null,
            )) as { name?: string } | null)
          : null;
      return set?.name ? `rule set "${set.name}"` : "rule set on its default branch";
    }
    const protection = (await this.request(
      "GET",
      `${this.repoPath()}/branches/${encoded}/protection/required_status_checks`,
    )) as { contexts?: string[]; checks?: { context?: string }[] } | null;
    const required = [
      ...(protection?.contexts ?? []),
      ...(protection?.checks ?? []).map((check) => check.context),
    ];
    return required.includes(context) ? `branch protection rule for ${branch}` : undefined;
  }

  async deleteBranch(branch: string): Promise<void> {
    const answer = await this.apiCall(
      "DELETE",
      `${this.repoPath()}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
    );
    // 422 is GitHub's answer for a reference that does not exist.
    if (answer.status !== 204 && answer.status !== 404 && answer.status !== 422)
      throw changeWriteError(answer.status, "deleting the batch branch", answer.body);
  }

  async closeWithNote(change: ForgeChange, note: string): Promise<void> {
    await this.request("POST", `${this.repoPath()}/issues/${numbered(change)}/comments`, {
      body: note,
    });
    await this.close(change);
  }

  label(change: ForgeChange): string {
    return change.number !== undefined ? `#${change.number}` : change.branch;
  }

  url(change: ForgeChange): string | null {
    return change.url;
  }

  async branchPage(branch: string): Promise<string | null> {
    const { owner, name, source } = this.location;
    // A contributor's fork names no branch of its own project here.
    if (source || !owner || !name) return null;
    return branchComparePage({
      kind: "github",
      host: this.location.host ?? GITHUB_COM,
      owner,
      name,
      base: await this.defaultBranch(),
      branch,
    });
  }

  private owner(): string {
    if (!this.location.owner || !this.location.name) {
      throw new ForgeError("not-found", "the project's address on GitHub names no owner and name");
    }
    return this.location.owner;
  }

  /** The task's project as the gateway's policy reads it; null for the account-level reads. */
  private apiProject(): ApiProject | null {
    return this.location.owner && this.location.name
      ? { owner: this.location.owner, name: this.location.name }
      : null;
  }

  private repoPath(): string {
    const owner = this.owner();
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(this.location.name as string)}`;
  }

  /** The gateway's raw call: every status answers, redirects are never followed, the body is bounded. */
  private async apiCall(method: string, path: string, body?: string): Promise<ForgeApiResponse> {
    const token = await this.options.token();
    if (!token) {
      throw new ForgeError("sign-in", notSignedInText(this.place, this.host ?? GITHUB_COM));
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}${path}`, {
        method,
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": API_VERSION,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return await this.readAnswer(response);
    } catch (caught) {
      // A lost body is the same transport failure as lost headers. Definite
      // refusals, including an oversized answer used for paging, keep their type.
      if (caught instanceof ForgeError) throw caught;
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new ForgeError("transient", `could not reach ${this.place}: ${message}`);
    }
  }

  /** Every status answers. A redirect is refused, and the answer stays within the JSON cap. */
  private async readAnswer(response: Response): Promise<ForgeApiResponse> {
    if (response.status === 401) this.options.onSignInRejected?.();
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const moved = this.movedPath(response.headers.get("location"));
      if (moved)
        throw new ForgeMovedError(
          "GitHub answered with a redirect, which the gateway does not follow.",
          moved,
        );
      throw new ForgeError(
        "refused",
        "GitHub answered with a redirect, which the gateway does not follow.",
      );
    }
    const bytes = await gatewayAnswerBytes(response);
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const retryAfter = Number(response.headers.get("retry-after"));
    return {
      status: response.status,
      requestId: response.headers.get("x-github-request-id"),
      rateLimit:
        remaining === null
          ? null
          : {
              remaining: Number(remaining),
              resetAt:
                Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
            },
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      link: response.headers.get("link"),
      body: new TextDecoder().decode(bytes),
    };
  }

  /**
   * Where a redirect points, relative to the API, when it names a repository
   * by its number on this same API: how GitHub answers the address of a
   * repository that moved. Any other redirect is undefined.
   */
  private movedPath(location: string | null): string | undefined {
    if (!location) return undefined;
    const base = new URL(this.base);
    let url: URL;
    try {
      url = new URL(location, `${this.base}/`);
    } catch {
      return undefined;
    }
    const prefix = base.pathname.replace(/\/+$/, "");
    if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/repositories/`))
      return undefined;
    const path = `${url.pathname.slice(prefix.length)}${url.search}`;
    return /^\/repositories\/\d+(\/|$|\?)/.test(path) ? path : undefined;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    version = API_VERSION,
    beforeSend?: () => void,
    url = `${this.base}${path}`,
    observedStatus?: (status: number) => void,
  ): Promise<unknown> {
    const token = await this.options.token();
    if (!token) {
      throw new ForgeError("sign-in", notSignedInText(this.place, this.host ?? GITHUB_COM));
    }
    beforeSend?.();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": version,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new ForgeError("transient", `could not reach ${this.place}: ${message}`);
    }
    observedStatus?.(response.status);
    const text = await response.text();
    if (response.status === 401) this.options.onSignInRejected?.();
    if (!response.ok) throw failureOf(response, method, path, text);
    return text ? (JSON.parse(text) as unknown) : null;
  }
}

function changeOf(pull: PullJson, branch: string): ForgeChange {
  return {
    number: pull.number,
    url: pull.html_url,
    branch,
    headSha: pull.head.sha,
    ...(pull.draft ? { draft: true } : {}),
    title: pull.title,
    body: pull.body ?? "",
    ...(pull.base?.ref ? { base: pull.base.ref } : {}),
  };
}

/**
 * GitHub's `mergeable_state` in the seam's terms. `clean`, `unstable` (a
 * check that is not required failed - the app's own all-checks rule
 * decides that) and `has_hooks` may merge only once GitHub has computed
 * `mergeable`; a state the app does not know reads `computing`.
 */
function readinessOf(pull: PullStateJson): ForgeReadiness {
  if (pull.draft === true || pull.mergeable_state === "draft") return "draft";
  switch (pull.mergeable_state) {
    case "dirty":
      return "conflict";
    case "behind":
      return "behind";
    case "blocked":
      return "blocked";
    case "clean":
    case "unstable":
    case "has_hooks":
      return pull.mergeable === true
        ? "clean"
        : pull.mergeable === false
          ? "conflict"
          : "computing";
    default:
      return pull.mergeable === false ? "conflict" : "computing";
  }
}

function numbered(change: ForgeChange): number {
  if (change.number === undefined) {
    throw new ForgeError("unsupported", `${change.branch} has no pull request number on GitHub`);
  }
  return change.number;
}

function runState(run: { status: string; conclusion: string | null }): ForgeCheckState {
  if (run.status !== "completed") return "pending";
  return RUN_CONCLUSIONS[run.conclusion ?? ""] ?? "pending";
}

const RUN_CONCLUSIONS: Record<string, ForgeCheckState> = {
  success: "success",
  failure: "failure",
  cancelled: "cancelled",
  timed_out: "timed_out",
  action_required: "action_required",
  startup_failure: "startup_failure",
  stale: "stale",
  skipped: "skipped",
  neutral: "neutral",
};

const STATUS_STATES: Record<string, ForgeCheckState> = {
  success: "success",
  failure: "failure",
  error: "error",
  pending: "pending",
};

function changeWriteError(status: number, operation: string, body: string): ForgeWriteError {
  const refused = [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(status);
  const messages: string[] = [];
  try {
    const answer: unknown = JSON.parse(body);
    if (answer && typeof answer === "object") {
      if ("message" in answer && typeof answer.message === "string") messages.push(answer.message);
      if ("errors" in answer && Array.isArray(answer.errors)) {
        for (const error of answer.errors) {
          if (error && typeof error.message === "string") messages.push(error.message);
        }
      }
    }
  } catch {
    // An unreadable answer does not change whether the write could have happened.
  }
  return new ForgeWriteError(
    refused ? "failed" : "uncertain",
    status === 401 ? "sign-in" : status === 403 ? "permission" : "refused",
    `GitHub answered ${status} when ${operation}${refused ? ". Nothing was written." : "; read it back before any retry."}${messages.length ? ` ${messages.join(" ")}` : ""}`,
  );
}
