/**
 * INF-2394: fixture ownership follows the product reader.
 * @journey-area src/core/forge/providers/github/
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { presentationBodyLimit, presentationCommentLimit } from "../../src/core/forge/presentation";

/**
 * A local stand-in for GitHub (git integration PR 1.2), in the shape of the
 * quota sensor's vendor stubs: the REST calls the forge makes and GitHub's
 * device flow, served over real HTTP so the app runs its real forge, its
 * real sign-in service and its real health read against it. The app finds
 * it through `INFINITARY_GITHUB_API_URL` and `INFINITARY_GITHUB_OAUTH_URL`, which
 * only an unpackaged app reads (`stubEnv`). It stands in for a GitHub
 * Enterprise host too (`host`): the same API under the server's own
 * `/api/v3` and `/api/graphql`, through `INFINITARY_GITHUB_ENTERPRISE_API_URL`,
 * with that host in every address it hands out. Nothing here ever reaches
 * github.com, and no test raises a keychain or password prompt.
 *
 * The test drives it: approve, deny or expire the code; refuse the
 * sign-in the way GitHub does when it no longer accepts one; or hand over
 * short-lived sign-ins, as GitHub does by default for an OAuth App
 * registered since 2026-08-14, and end one. As on GitHub, a code's sign-in
 * is handed over once and a refresh token works once. Every request is
 * logged for the test to read.
 *
 * A change is coherent the way GitHub's is (docs/e2e-contracts.md): it
 * carries the title and body it was opened or served with, never one the
 * stand-in makes up; its head is the branch's own commit in the disposable
 * repository (`headOf`) wherever the app puts it in; and a merge is
 * GitHub's squash at the head the app asks for, refused (409) when the head
 * has moved on since. A change with a wrong title, an unknown head or
 * failing checks is a refusal case its spec names, never a happy path.
 */

type StubPull = {
  /** A contributor source, named by the host independently of its branch. */
  headRepo?: string;
  headRepoId?: number;
  /** GitHub's `mergeable_state` for this change: `clean` unless a spec names another. */
  mergeableState?: string;
  /**
   * How many reads of the change by its number GitHub answers `mergeable:
   * null` with `mergeable_state: unknown` before `mergeableState`: what it
   * answered PR #94 just after main moved, while it worked out a fresh test
   * merge (INF-456).
   */
  undecidedReads?: number;
  number: number;
  /** The head when no branch head is read (`headOf`): only for a change never put in. */
  headSha?: string;
  branch?: string;
  title: string;
  body?: string;
  merged?: boolean;
  closed?: boolean;
  /** The check runs on this change's head, where they are not every head's (`setChecks`). */
  checks?: StubCheckRun[];
  /** The head `checks` finished on: a newer head's checks start again. */
  checksHead?: string;
};

/** A pull request the app opened here (`POST /pulls`), as GitHub holds it now. */
export type StubOpenedPull = {
  number: number;
  branch: string;
  title: string;
  body: string;
  merged: boolean;
  closed: boolean;
};

export type StubDispatch = {
  workflow: string;
  ref: string;
  headSha: string;
  inputs?: Record<string, string | boolean | number>;
};

type StubCheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  run?: number;
  /**
   * The workflow file of the check's run, such as
   * `.github/workflows/early-tests.yml`, which GitHub names on the run as
   * `path`; a run whose checks name none is the `ci` workflow with no path.
   */
  workflow?: string;
  started_at?: string;
  completed_at?: string;
};

/** One merge GitHub accepted, as the app asked for it. */
export type StubMerge = {
  number: number;
  /** The head the app required the change to still be at. */
  sha: string;
  method: string;
  title: string;
  message: string;
};

/** One merge past the rules (`merge-async` with `bypass_rules`) GitHub accepted, as the app asked for it. */
export type StubAsyncMerge = StubMerge & { action: string; bypass: boolean };

/** One rule set holding the default branch, and what the signed-in person may skip. */
export type StubRuleset = {
  id: number;
  name: string;
  /** GitHub's `current_user_can_bypass`. */
  bypass: string;
  rules: { type: string; parameters?: Record<string, unknown> }[];
};

export type GitHubStub = {
  url: string;
  /** The environment that points the app here. */
  env: Record<string, string>;
  /** Every request, `METHOD /path` (query dropped). */
  requests: () => string[];
  /** Every issue GitHub opened, with the repository's path and the JSON body as it came. */
  openedIssues: () => Array<{ path: string; body: string }>;
  /** The comments GitHub keeps on an issue or pull request, by its number, oldest first. */
  commentsOn: (number: number) => string[];
  /** Whether the open issue every stand-in project holds is still open or was closed. */
  openIssueState: () => "open" | "closed";
  /** Every merge GitHub accepted, in order; a refused one is only a request. */
  merges: () => StubMerge[];
  /**
   * Every merge the app asked GitHub for, as `requests` logs it, in order:
   * the background merge (`PUT .../pulls/N/merge-async`) and the direct one
   * (`PUT .../pulls/N/merge`), whatever GitHub answered.
   */
  mergeRequests: () => string[];
  /** Verification requests accepted for an existing pushed branch. */
  dispatches: () => StubDispatch[];
  /** Every merge past the branch's rules GitHub accepted, in order. */
  asyncMerges: () => StubAsyncMerge[];
  /**
   * Give the default branch a merge queue of GitHub's own, or take it away:
   * with one, GitHub takes an ordinary merge request that names the version
   * alone into the queue instead of merging it, and refuses one that names
   * a merge method or commit words.
   */
  setMergeQueue: (on: boolean) => void;
  inMergeQueue: () => number[];
  /** GitHub's queue merges a pull request it holds, as it does once the queue's own checks pass. */
  queueMerges: (number: number) => void;
  /** GitHub removes a pull request from its queue without merging it. */
  queueRemoves: (number: number) => void;
  /** Contributor request text and review comments, as the host holds them. */
  requestText: (number: number) => { title: string; description: string } | undefined;
  /** A pull request's conversation comments, oldest first, as the host holds them. */
  comments: (number: number) => { id: number; body: string }[];
  /** The rule sets holding the default branch; none by default. */
  setRulesets: (sets: StubRuleset[]) => void;
  /**
   * Serve this change for the first branch the app asks about (the app
   * mints the branch), with the title and body it was opened with. Its head
   * is that branch's own commit when the test reads one (`headOf`);
   * `headSha` is a head for a change whose checks are read and that is
   * never put in.
   */
  servePull: (pull: { number: number; title: string; body?: string; headSha?: string }) => void;
  /**
   * Serve this change for the next branch the app asks about that has no
   * change yet, in the order queued: a later task's change, in a journey
   * whose earlier task already holds the one `servePull` serves. Its head is
   * that branch's own commit (`headOf`).
   */
  serveNext: (pull: {
    number: number;
    title: string;
    body?: string;
    mergeableState?: string;
  }) => void;
  /**
   * Serve a pull request that is not the task's branch. `changeFor` of
   * another branch does not return it.
   */
  serveNumbered: (pull: {
    number: number;
    branch: string;
    title: string;
    body?: string;
    headSha: string;
    headRepo?: string;
    headRepoId?: number;
    mergeableState?: string;
    undecidedReads?: number;
  }) => void;
  /**
   * Earlier pull requests ran workflows, while this head has none, so an
   * empty check list reads as not started rather than green.
   */
  priorPullRequestWorkflows: (on: boolean) => void;
  /** Move a served change's head, for a change that is never put in. */
  setHead: (sha: string) => void;
  /**
   * The person merges change N on GitHub's own page: it leaves the open
   * changes and reads merged by its number, and no merge request from the
   * app is recorded.
   */
  mergeByHand: (number: number) => void;
  /**
   * The check runs on every head: completed and successful by default. A
   * check run that names `run` belongs to that run (by its number) of one
   * pull request workflow; the version's workflow runs list those runs.
   */
  setChecks: (runs: StubCheckRun[]) => void;
  /**
   * Every commit status the app wrote, by commit, as GitHub's combined
   * status lists them: one per context, the newest kept.
   */
  statuses: (sha: string) => { context: string; state: string; description?: string }[];
  /** INF-1555 F14: refuse the version's workflow metadata list, not its sign-in or registered checks. */
  setWorkflowReadFailure: (failure: { status: number; message: string } | undefined) => void;
  /**
   * INF-2546 R8: GitHub fails to read pull request N by its number with this
   * answer, until it is cleared (undefined); every other request reads as usual.
   */
  setPullReadFailure: (
    number: number,
    failure: { status: number; message: string } | undefined,
  ) => void;
  /** Every failed-job rerun GitHub accepted, `POST /path`, in order. */
  reruns: () => string[];
  /** A completed measurement workflow on this exact disposable project version. */
  serveWorkflowEvidence: (headSha: string) => void;
  /** GitHub no longer accepts the sign-in: every API request answers 401. */
  rejectSignIn: () => void;
  acceptSignIn: () => void;
  /** From now on a sign-in is short-lived: eight hours, with a refresh token that works once. */
  issueShortLived: () => void;
  /** The current short-lived sign-in's eight hours ran out: GitHub answers it 401. */
  endAccess: () => void;
  /** Every refresh token the app spent, in order. */
  refreshes: () => string[];
  /** How many sign-ins GitHub handed over for an approved code. */
  exchanges: () => number;
  /** How the next device code ends when the app asks for its sign-in. */
  device: {
    /** The user-facing code the next sign-in attempt displays. */
    setCode: (code: string) => void;
    approve: (token?: string) => void;
    deny: () => void;
    expire: () => void;
  };
  /** The person's repositories `GET /user/repos` lists, newest first. */
  setProjects: (projects: { fullName: string; private?: boolean; updatedAt?: string }[]) => void;
  /** The person's open changes `forge.changes` reads, beside any the app opened. */
  setOpenChanges: (
    changes: { number: number; title: string; draft?: boolean; checks?: string | null }[],
  ) => void;
  /** The version a branch carries where the project lives: every change's live head. */
  headOf: (read: (branch: string) => string) => void;
  /**
   * Runs when a merge request arrives, before GitHub compares heads: a push
   * that lands between the app's check and its put-in.
   */
  onMergeRequest: (apply: () => void) => void;
  /** Move a local stand-in's main ref when GitHub accepts a put-in. */
  onPutIn: (apply: (sha: string) => void) => void;
  /** Every pull request the app opened here, in the order opened, as GitHub holds each now. */
  pulls: () => StubOpenedPull[];
  /**
   * The check runs on the head of each pull request the app opens from now
   * on, in place of every head's (`setChecks`): a batch pull request whose
   * checks have yet to finish, while each change's own branch already passed.
   */
  setOpenedChecks: (runs: StubCheckRun[]) => void;
  /**
   * The check runs on the head pull request N is at now, as its workflows
   * finish or fail; a head pushed later starts again from `setOpenedChecks`.
   */
  setPullChecks: (number: number, runs: StubCheckRun[]) => void;
  /** The merges the project's settings allow; all three until set, as on a new GitHub project. */
  setMergeButtons: (buttons: { squash: boolean; merge: boolean; rebase: boolean }) => void;
  /** Every branch the app deleted here (`DELETE /git/refs/heads/...`), in order. */
  deletedBranches: () => string[];
  /** Drop a local stand-in's branch when GitHub deletes it. */
  onBranchDelete: (apply: (branch: string) => void) => void;
  /**
   * Which heads GitHub refuses to merge for conflicting with newer work: it
   * answers the merge request 405, as GitHub does. Its mergeability read
   * (`GET /pulls/N`) initially says clean, the way GitHub's lazily computed
   * one can lag a change on the default branch. After the refused send,
   * reads of that head report the known conflict until it is resolved.
   */
  conflicts: (conflicted: (head: string) => boolean) => void;
  close: () => Promise<void>;
};

export const GITHUB_STUB_KEY = "gho_e2e_sign_in";
export const STUB_USER_CODE = "WDJB-MJHT";
export const STUB_LOGIN = "octo";
/** The one open issue every stand-in project holds, which a reader's Build row names. */
export const STUB_OPEN_ISSUE = 14;
/** The notification `/notifications` answers with, and the pull request on a listing's second page. */
export const STUB_NOTIFICATION_TITLE = "Release 0.4.0 is out";
export const STUB_SECOND_PAGE_TITLE = "Second page";
/** What the REST API answers, with its 401, a call whose sign-in it does not take. */
export const STUB_BAD_CREDENTIALS = "Bad credentials";
/** The line of the failed job's log that says why it failed. */
export const STUB_JOB_FAILURE_LINE = "Missing measurement input";
/** The Nth refresh token a short-lived sign-in is handed, and the Nth access token a renewal answers. */
export const stubRefreshToken = (n: number) => `ghr_e2e_refresh_${n}`;
export const stubRenewedToken = (n: number) => `gho_e2e_renewed_${n}`;

export async function startGitHubStub(
  options: {
    /** The host the stand-in is: github.com, or a GitHub Enterprise host's name. */
    host?: string;
  } = {},
): Promise<GitHubStub> {
  const webHost = options.host ?? "github.com";
  const log: string[] = [];
  const openedIssues: Array<{ path: string; body: string }> = [];
  /** The open issue's state, which a PATCH closes or opens again. */
  let openIssueState: "open" | "closed" = "open";
  const evidenceProjects = new Set<number>();
  const evidence = new Map<string, { bytes: Buffer; mediaType: string }>();
  const merges: StubMerge[] = [];
  const commitStatuses = new Map<
    string,
    { id: number; context: string; state: string; description?: string }[]
  >();
  // GitHub gives every status it is sent an id of its own, newest highest.
  let statusIds = 0;
  const putStatus = (
    sha: string,
    status: { context: string; state: string; description?: string },
  ): number => {
    statusIds += 1;
    commitStatuses.set(sha, [
      ...(commitStatuses.get(sha) ?? []).filter((item) => item.context !== status.context),
      { id: statusIds, ...status },
    ]);
    return statusIds;
  };
  const asyncMerges: StubAsyncMerge[] = [];
  const asyncResults = new Map<string, { status: string; details: Record<string, unknown> }>();
  let asyncRequests = 0;
  /** The default branch's own merge queue, when a spec gives it one, and what it holds. */
  let mergeQueue = false;
  const hostQueue = new Set<number>();
  let rulesets: StubRuleset[] = [];
  const dispatches: StubDispatch[] = [];
  const cancelledRuns = new Set<number>();
  let anyPull: StubPull | null = null;
  const opened = new Map<string, StubPull>();
  const queued: StubPull[] = [];
  /** The pull requests the app opened, in order; a later one may reuse an earlier one's branch. */
  const appOpened: StubPull[] = [];
  // Issue comments: a crew story for someone else's pull request, and the app's comments that
  // carry a batch's stories past its description.
  const issueComments = new Map<
    number,
    { id: number; body: string; user: { login: string }; html_url: string }[]
  >();
  let nextCommentId = 1;
  const reruns: string[] = [];
  let nextNumber = 100;
  let checkRuns: StubCheckRun[] = [
    { name: "linux-checks", status: "completed", conclusion: "success" },
  ];
  let evidenceHead: string | undefined;
  let workflowReadFailure: { status: number; message: string } | undefined;
  const pullReadFailures = new Map<number, { status: number; message: string }>();
  const measurementZip = readFileSync("tests/fixtures/forge/measurement.zip");
  let rejected = false;
  let device: {
    mode: "pending" | "approved" | "exchanged" | "denied" | "expired";
    token: string;
  } = {
    mode: "pending",
    token: GITHUB_STUB_KEY,
  };
  let userCode = STUB_USER_CODE;
  let shortLived = false;
  let access = "";
  let liveRefresh = "";
  let refreshSerial = 0;
  let renewals = 0;
  let exchanges = 0;
  const ended = new Set<string>();
  const refreshes: string[] = [];
  /** A sign-in as GitHub hands it over, short-lived or not. */
  const issue = (token: string) => {
    access = token;
    if (!shortLived) return { access_token: token, token_type: "bearer", scope: "repo,workflow" };
    refreshSerial += 1;
    liveRefresh = stubRefreshToken(refreshSerial);
    return {
      access_token: token,
      token_type: "bearer",
      scope: "repo,workflow",
      expires_in: 28_800,
      refresh_token: liveRefresh,
      refresh_token_expires_in: 15_897_600,
    };
  };
  let projects = [{ fullName: "octo/meterlab", private: true, updatedAt: "2026-09-20T10:00:00Z" }];
  let headOf: ((branch: string) => string) | null = null;
  let onMergeRequest: () => void = () => {};
  let onPutIn: (sha: string) => void = () => {};
  let onBranchDelete: (branch: string) => void = () => {};
  const deletedBranches: string[] = [];
  let openedChecks: StubCheckRun[] | undefined;
  let mergeButtons = { squash: true, merge: true, rebase: true };
  let priorPullRequestWorkflows = false;
  let conflicted: (head: string) => boolean = () => false;
  const knownConflicts = new Set<string>();
  let openChanges: { number: number; title: string; draft?: boolean; checks?: string | null }[] =
    [];
  let base = "";

  const read = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });

  /**
   * A change's head now: its branch's commit where the test reads one. A
   * merged change whose branch is gone keeps the head it merged at, as
   * GitHub's pull request does.
   */
  const headOfPull = (pull: StubPull): string | undefined => {
    if (!pull.branch || !headOf) return pull.headSha;
    try {
      return headOf(pull.branch) ?? pull.headSha;
    } catch (caught) {
      if (pull.merged && pull.headSha) return pull.headSha;
      throw caught;
    }
  };

  const pullJson = (pull: StubPull, owner: string, name: string) => ({
    number: pull.number,
    title: pull.title,
    html_url: `https://${webHost}/${owner}/${name}/pull/${pull.number}`,
    base: { ref: "main" },
    head: {
      sha: headOfPull(pull),
      ref: pull.branch ?? "",
      repo: {
        full_name: pull.headRepo ?? `${owner}/${name}`,
        ...(pull.headRepoId !== undefined ? { id: pull.headRepoId } : {}),
      },
    },
    body: pull.body ?? "",
  });

  const server: Server = createServer((req, res) => {
    void read(req)
      .then((bytes) => {
        const raw = bytes.toString("utf8");
        const url = new URL(req.url ?? "/", "http://stub");
        // A GitHub Enterprise Server's API lives under its own path.
        const path = url.pathname
          .replace(/^\/api\/v3(?=\/)/, "")
          .replace(/^\/api\/graphql$/, "/graphql");
        const enterprise = /^\/api\/v3(?=\/)/.test(url.pathname);
        const method = req.method ?? "GET";
        log.push(`${method} ${url.pathname}`);
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(json));
        };
        /** GitHub's refusal of a description or a comment past its limit, in its own words. */
        const tooLong = (body: string | undefined, limit: number) => {
          if (body === undefined || Array.from(body).length <= limit) return false;
          send(422, {
            message: "Validation Failed",
            errors: [
              {
                resource: "Issue",
                code: "custom",
                field: "body",
                message: `body is too long (maximum is ${limit} characters)`,
              },
            ],
          });
          return true;
        };

        // GitHub's device flow (the OAuth host).
        if (method === "POST" && path === "/login/device/code") {
          // A new code starts pending: the test answers for the person.
          device = { ...device, mode: "pending" };
          send(200, {
            device_code: "stub-device",
            user_code: userCode,
            verification_uri: `${base}/login/device`,
            expires_in: 900,
            interval: 1,
          });
          return;
        }
        if (method === "POST" && path === "/login/oauth/access_token") {
          const form = new URLSearchParams(raw);
          if (form.get("grant_type") === "refresh_token") {
            const spent = form.get("refresh_token") ?? "";
            refreshes.push(spent);
            if (!spent || spent !== liveRefresh) {
              send(200, { error: "bad_refresh_token" });
              return;
            }
            // The refresh token works once and retires the access token it came with.
            ended.add(access);
            renewals += 1;
            send(200, issue(stubRenewedToken(renewals)));
            return;
          }
          if (device.mode === "approved") {
            exchanges += 1;
            const token = device.token;
            device = { ...device, mode: "exchanged" };
            send(200, issue(token));
          } else if (device.mode === "exchanged") {
            // GitHub hands a code's sign-in over once.
            send(200, { error: "bad_verification_code" });
          } else if (device.mode === "denied") {
            send(200, { error: "access_denied" });
          } else if (device.mode === "expired") {
            send(200, { error: "expired_token" });
          } else {
            send(200, { error: "authorization_pending" });
          }
          return;
        }

        // Signed storage reads deliberately need no sign-in; the forge must drop it.
        if (method === "GET" && path === "/workflow-storage/measurement.zip") {
          if (req.headers.authorization) {
            send(400, { message: "Sign-in leaked to storage" });
            return;
          }
          res.writeHead(200, { "content-type": "application/zip" });
          res.end(measurementZip);
          return;
        }
        if (method === "GET" && path === "/workflow-storage/job.log") {
          if (req.headers.authorization) {
            send(400, { message: "Sign-in leaked to storage" });
            return;
          }
          res.writeHead(200, { "content-type": "text/plain" });
          res.end(`Prepare data\nMeasure pairs: exit 1\n${STUB_JOB_FAILURE_LINE}\n`);
          return;
        }
        // The REST API: every call carries the app's sign-in as a bearer.
        const auth = req.headers.authorization ?? "";
        if (!auth.startsWith("Bearer ") || rejected || ended.has(auth.slice("Bearer ".length))) {
          send(401, { message: STUB_BAD_CREDENTIALS });
          return;
        }
        // INF-285 F4: native evidence uses the same local endpoint override as the API.
        if (webHost === "github.com" && method === "POST" && path === "/user-attachments/assets") {
          const projectId = Number(url.searchParams.get("repository_id"));
          const mediaType = url.searchParams.get("content_type") ?? "";
          if (
            !evidenceProjects.has(projectId) ||
            !bytes.length ||
            !url.searchParams.get("name") ||
            !["image/png", "image/jpeg", "image/webp", "video/mp4"].includes(mediaType)
          ) {
            send(422, {
              message: "An evidence upload needs the confirmed project, name, media type and bytes",
            });
            return;
          }
          const id = randomUUID();
          evidence.set(id, { bytes, mediaType });
          send(201, { url: `https://github.com/user-attachments/assets/${id}` });
          return;
        }
        const evidenceId = /^\/user-attachments\/assets\/([0-9a-f-]{36})$/.exec(path)?.[1];
        if (method === "GET" && evidenceId) {
          const file = evidence.get(evidenceId);
          if (!file) send(404, { message: "Not Found" });
          else {
            res.writeHead(200, { "content-type": file.mediaType });
            res.end(file.bytes);
          }
          return;
        }
        if (method === "GET" && path === "/user") {
          send(200, { login: STUB_LOGIN });
          return;
        }
        if (method === "GET" && path === "/user/repos") {
          send(
            200,
            projects.map((project) => ({
              full_name: project.fullName,
              clone_url: `https://${webHost}/${project.fullName}.git`,
              html_url: `https://${webHost}/${project.fullName}`,
              updated_at: project.updatedAt ?? null,
              private: project.private === true,
            })),
          );
          return;
        }
        if (method === "POST" && path === "/graphql") {
          const asked = JSON.parse(raw || "{}") as {
            query?: string;
            variables?: { number?: number };
          };
          // GitHub's own reading of its merge queue, which its REST pull request does not carry.
          if (asked.query?.includes("isInMergeQueue")) {
            send(200, {
              data: {
                repository: {
                  pullRequest: { isInMergeQueue: hostQueue.has(asked.variables?.number ?? -1) },
                },
              },
            });
            return;
          }
          const pulls = [
            ...openChanges,
            ...[...opened.values()]
              .filter((pull) => !pull.merged)
              .map((pull) => ({ number: pull.number, title: pull.title })),
          ];
          send(200, {
            data: {
              viewer: {
                pullRequests: {
                  nodes: pulls.map(
                    (pull: {
                      number: number;
                      title: string;
                      draft?: boolean;
                      checks?: string | null;
                    }) => ({
                      number: pull.number,
                      title: pull.title,
                      url: `https://${webHost}/octo/meterlab/pull/${pull.number}`,
                      isDraft: pull.draft === true,
                      updatedAt: "2026-09-24T00:00:00Z",
                      repository: { nameWithOwner: "octo/meterlab" },
                      commits: {
                        nodes: [
                          {
                            commit: {
                              statusCheckRollup:
                                pull.checks === null ? null : { state: pull.checks ?? "SUCCESS" },
                            },
                          },
                        ],
                      },
                    }),
                  ),
                },
              },
            },
          });
          return;
        }
        // The writes a crewmate's ask sends once the captain clicks (FI3-1571 piece 4).
        if (method === "POST" && path === "/user/repos") {
          const body = JSON.parse(raw || "{}") as { name?: string; private?: boolean };
          send(201, {
            full_name: `${STUB_LOGIN}/${body.name ?? ""}`,
            private: body.private === true,
            html_url: `https://${webHost}/${STUB_LOGIN}/${body.name ?? ""}`,
          });
          return;
        }
        if (method === "GET" && path === "/notifications") {
          send(200, [{ id: "1", subject: { title: STUB_NOTIFICATION_TITLE, type: "Release" } }]);
          return;
        }
        // GitHub names a repository listing's next page by the repository's id.
        if (method === "GET" && path === "/repositories/77/pulls") {
          send(200, [{ number: 2, title: STUB_SECOND_PAGE_TITLE }]);
          return;
        }
        const repo = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path);
        if (!repo) {
          send(404, { message: "Not Found" });
          return;
        }
        const [, owner, name, rest = ""] = repo as unknown as [string, string, string, string?];
        if (
          method === "GET" &&
          rest === "/actions/runs" &&
          url.searchParams.has("head_sha") &&
          workflowReadFailure
        ) {
          send(workflowReadFailure.status, { message: workflowReadFailure.message });
          return;
        }
        if (method === "POST" && rest === "/actions/workflows/verify.yml/dispatches") {
          const body = JSON.parse(raw || "{}") as { ref?: string; inputs?: StubDispatch["inputs"] };
          let headSha: string | undefined;
          try {
            headSha = body.ref && headOf ? headOf(body.ref) : undefined;
          } catch {
            /* unknown ref */
          }
          if (!body.ref || !headSha) {
            send(422, { message: "The requested branch has not been pushed." });
            return;
          }
          dispatches.push({
            workflow: "verify.yml",
            ref: body.ref,
            headSha,
            ...(body.inputs ? { inputs: body.inputs } : {}),
          });
          res.writeHead(204);
          res.end();
          return;
        }
        const cancel = /^\/actions\/runs\/(\d+)\/cancel$/.exec(rest);
        if (method === "POST" && cancel) {
          const runId = Number(cancel[1]);
          if (!dispatches[runId - 1000]) send(404, { message: "Run not found" });
          else {
            cancelledRuns.add(runId);
            send(202, {});
          }
          return;
        }
        // GitHub's failed-job reruns answer 201 with an empty body.
        if (
          method === "POST" &&
          /^\/actions\/(?:jobs\/\d+\/rerun|runs\/\d+\/rerun(?:-failed-jobs)?)$/.test(rest)
        ) {
          reruns.push(`${method} ${path}`);
          send(201, {});
          return;
        }
        if (
          method === "GET" &&
          rest === "/actions/runs" &&
          url.searchParams.get("event") === "workflow_dispatch"
        ) {
          const runs = dispatches
            .map((run, index) => ({
              id: 1000 + index,
              path: `.github/workflows/${run.workflow}`,
              event: "workflow_dispatch",
              head_branch: run.ref,
              head_sha: run.headSha,
              status: cancelledRuns.has(1000 + index) ? "completed" : "queued",
              conclusion: cancelledRuns.has(1000 + index) ? "cancelled" : null,
            }))
            .filter((run) => run.head_branch === url.searchParams.get("branch"));
          send(200, { total_count: runs.length, workflow_runs: runs });
          return;
        }
        if (
          method === "GET" &&
          evidenceHead &&
          owner === "octo" &&
          name === "meterlab" &&
          rest.startsWith("/actions/")
        ) {
          const run = {
            id: 10,
            name: "Test-speed experiment",
            head_sha: evidenceHead,
            head_branch: "main",
            run_attempt: 1,
            status: "completed",
            conclusion: "failure",
            html_url: `https://${webHost}/${owner}/${name}/actions/runs/10`,
          };
          const job = {
            id: 20,
            run_id: 10,
            head_sha: evidenceHead,
            run_attempt: 1,
            name: "test-speed-experiment",
            status: "completed",
            conclusion: "failure",
            steps: [
              { name: "Measure pairs", number: 3, status: "completed", conclusion: "failure" },
            ],
          };
          const artifact = {
            id: 30,
            name: "test-speed-measurements",
            size_in_bytes: measurementZip.length,
            expired: false,
            expires_at: "2026-10-14T00:00:00Z",
            workflow_run: { id: 10 },
          };
          if (rest === "/actions/runs") {
            const runs = url.searchParams.get("head_sha") === evidenceHead ? [run] : [];
            send(200, { workflow_runs: runs, total_count: runs.length });
            return;
          }
          if (rest === "/actions/runs/10") {
            send(200, run);
            return;
          }
          if (rest === "/actions/runs/10/attempts/1/jobs") {
            send(200, { jobs: [job], total_count: 1 });
            return;
          }
          if (rest === "/actions/runs/10/artifacts") {
            send(200, { artifacts: [artifact], total_count: 1 });
            return;
          }
          if (rest === "/actions/jobs/20") {
            send(200, job);
            return;
          }
          if (rest === "/actions/artifacts/30") {
            send(200, artifact);
            return;
          }
          if (rest === "/actions/jobs/20/logs" || rest === "/actions/artifacts/30/zip") {
            const file = rest.endsWith("/logs") ? "job.log" : "measurement.zip";
            res.writeHead(302, { location: `${base}/workflow-storage/${file}?signed=disposable` });
            res.end();
            return;
          }
        }
        const thread = /^\/issues\/(\d+)\/comments$/.exec(rest);
        const commentWrite = /^\/issues\/comments\/(\d+)$/.exec(rest);
        if (thread) {
          const number = Number(thread[1]);
          const pull =
            [...opened.values()].find((pull) => pull.number === number) ??
            (anyPull?.number === number ? anyPull : undefined);
          if (!pull && number !== STUB_OPEN_ISSUE) {
            send(404, { message: "Not Found" });
            return;
          }
          const rows = issueComments.get(number) ?? [];
          if (method === "GET") {
            const size = Number(url.searchParams.get("per_page") ?? 30);
            const page = Number(url.searchParams.get("page") ?? 1);
            if (page * size < rows.length) {
              const next = new URL(url);
              next.searchParams.set("page", String(page + 1));
              res.setHeader("link", `<${next.href}>; rel="next"`);
            }
            send(200, rows.slice((page - 1) * size, page * size));
            return;
          }
          if (method === "POST") {
            const text = String(JSON.parse(raw || "{}").body ?? "");
            if (tooLong(text, presentationCommentLimit("github.com"))) return;
            const id = nextCommentId++;
            const row = {
              id,
              body: text,
              user: { login: STUB_LOGIN },
              html_url: `https://${webHost}/${owner}/${name}/issues/${number}#issuecomment-${id}`,
            };
            issueComments.set(number, [...rows, row]);
            send(201, row);
            return;
          }
        }
        if (commentWrite && method === "PATCH") {
          const row = [...issueComments.values()]
            .flat()
            .find((row) => row.id === Number(commentWrite[1]));
          if (!row) {
            send(404, { message: "Not Found" });
            return;
          }
          const text = String(JSON.parse(raw || "{}").body ?? "");
          if (tooLong(text, presentationCommentLimit("github.com"))) return;
          row.body = text;
          send(200, row);
          return;
        }
        if (commentWrite && method === "DELETE") {
          const id = Number(commentWrite[1]);
          const thread = [...issueComments].find(([, rows]) => rows.some((row) => row.id === id));
          if (!thread) {
            send(404, { message: "Not Found" });
            return;
          }
          issueComments.set(
            thread[0],
            thread[1].filter((row) => row.id !== id),
          );
          res.writeHead(204);
          res.end();
          return;
        }
        if (method === "GET" && rest === `/collaborators/${STUB_LOGIN}/permission`) {
          send(200, { permission: "write" });
          return;
        }
        if (rest === `/issues/${STUB_OPEN_ISSUE}` && (method === "GET" || method === "PATCH")) {
          if (method === "PATCH") {
            const state = (JSON.parse(raw || "{}") as { state?: string }).state;
            if (state === "open" || state === "closed") openIssueState = state;
          }
          send(200, {
            number: STUB_OPEN_ISSUE,
            state: openIssueState,
            html_url: `https://${webHost}/${owner}/${name}/issues/${STUB_OPEN_ISSUE}`,
          });
          return;
        }
        if (method === "POST" && rest === "/issues") {
          openedIssues.push({ path, body: raw });
          const body = JSON.parse(raw || "{}") as { title?: string };
          send(201, {
            number: 12,
            title: body.title ?? "",
            html_url: `https://${webHost}/${owner}/${name}/issues/12`,
          });
          return;
        }
        if (method === "PATCH" && rest === "/git/refs/heads/topic") {
          const body = JSON.parse(raw || "{}") as { sha?: string; force?: boolean };
          const head = headOf?.("topic");
          if (!head || body.sha !== head) send(422, { message: "Unknown topic version" });
          else send(200, { ref: "refs/heads/topic", object: { sha: head } });
          return;
        }
        if (method === "GET" && rest === "") {
          const fullName = `${owner}/${name}`;
          const index = projects.findIndex((project) => project.fullName === fullName);
          const project = projects[index];
          evidenceProjects.add(index + 2);
          send(200, {
            id: index + 2,
            full_name: fullName,
            default_branch: "main",
            private: project?.private ?? true,
            visibility: (project?.private ?? true) ? "private" : "public",
            permissions: { push: true },
            allow_squash_merge: mergeButtons.squash,
            allow_merge_commit: mergeButtons.merge,
            allow_rebase_merge: mergeButtons.rebase,
          });
          return;
        }
        const deletedRef = method === "DELETE" ? /^\/git\/refs\/heads\/(.+)$/.exec(rest) : null;
        if (deletedRef) {
          const branch = decodeURIComponent(deletedRef[1] ?? "");
          deletedBranches.push(branch);
          onBranchDelete(branch);
          res.writeHead(204);
          res.end();
          return;
        }
        if (method === "GET" && rest.startsWith("/git/ref/heads/")) {
          const branch = decodeURIComponent(rest.slice("/git/ref/heads/".length));
          let sha: string | undefined;
          try {
            sha = headOf?.(branch);
          } catch {
            /* unknown branch */
          }
          send(
            sha ? 200 : 404,
            sha
              ? { ref: `refs/heads/${branch}`, object: { type: "commit", sha } }
              : { message: "Not Found" },
          );
          return;
        }
        if (method === "GET" && rest === "/pulls" && owner === "octo" && name === "website") {
          res.writeHead(200, {
            "content-type": "application/json",
            link: `<${base}/repositories/77/pulls?per_page=1&page=2>; rel="next"`,
          });
          res.end(JSON.stringify([{ number: 1, title: "First page" }]));
          return;
        }
        if (method === "GET" && rest === "/pulls") {
          // A list with no branch filter names every open request, forks included.
          if (!url.searchParams.has("head")) {
            const all = new Map(
              [...opened.values(), ...(anyPull ? [anyPull] : [])].map((pull) => [
                pull.number,
                pull,
              ]),
            );
            send(
              200,
              [...all.values()]
                .filter((pull) => !pull.merged && !pull.closed)
                .map((pull) => pullJson(pull, owner, name)),
            );
            return;
          }
          const head = url.searchParams.get("head") ?? "";
          const branch = head.slice(head.indexOf(":") + 1);
          const found = opened.get(branch);
          if (
            found &&
            !found.merged &&
            !found.closed &&
            (!found.headRepo || found.headRepo === `${owner}/${name}`)
          ) {
            send(200, [pullJson(found, owner, name)]);
          } else if (
            anyPull &&
            !anyPull.merged &&
            !anyPull.closed &&
            (anyPull.branch ?? branch) === branch
          ) {
            anyPull.branch = branch;
            send(200, [pullJson(anyPull, owner, name)]);
          } else if (queued.length > 0 && !found && anyPull?.branch !== branch) {
            const pull = { ...(queued.shift() as StubPull), branch };
            opened.set(branch, pull);
            send(200, [pullJson(pull, owner, name)]);
          } else {
            send(200, []);
          }
          return;
        }
        if (method === "POST" && rest === "/pulls") {
          const body = JSON.parse(raw || "{}") as { head?: string; title?: string; body?: string };
          if (tooLong(body.body, presentationBodyLimit("github.com"))) return;
          const branch = body.head ?? "";
          if (!headOf) {
            // GitHub opens a change only for a branch it has: the spec names it.
            send(422, { message: `No commits between main and ${branch}` });
            return;
          }
          const pull: StubPull = { number: nextNumber++, branch, title: body.title ?? "" };
          if (body.body !== undefined) pull.body = body.body;
          if (openedChecks) pull.checks = openedChecks;
          appOpened.push(pull);
          opened.set(branch, pull);
          send(201, pullJson(pull, owner, name));
          return;
        }
        const numbered = /^\/pulls\/(\d+)$/.exec(rest);
        if (method === "GET" && numbered) {
          const number = Number(numbered[1]);
          const failure = pullReadFailures.get(number);
          if (failure) {
            send(failure.status, { message: failure.message });
            return;
          }
          const pull =
            [...opened.values()].find((open) => open.number === number) ??
            (anyPull?.number === number ? anyPull : undefined);
          if (!pull) {
            send(404, { message: "Not Found" });
            return;
          }
          const head = headOfPull(pull);
          const conflict = head !== undefined && knownConflicts.has(head) && conflicted(head);
          const undecided = (pull.undecidedReads ?? 0) > 0;
          if (undecided) pull.undecidedReads = (pull.undecidedReads ?? 0) - 1;
          send(200, {
            ...pullJson(pull, owner, name),
            state: pull.merged || pull.closed ? "closed" : "open",
            merged: pull.merged === true,
            merge_commit_sha: pull.merged ? `squash-${headOfPull(pull)}` : null,
            draft: false,
            base: { ref: "main" },
            mergeable: undecided ? null : !conflict,
            mergeable_state: undecided
              ? "unknown"
              : conflict
                ? "dirty"
                : (pull.mergeableState ?? "clean"),
          });
          return;
        }
        if (method === "GET" && /^\/commits\/[^/]+\/check-runs$/.test(rest)) {
          const sha = decodeURIComponent(rest.split("/")[2] ?? "");
          // A change that carries its own checks answers them at its own head.
          const own = [...opened.values()].find((pull) => {
            if (!pull.checks || pull.merged || pull.closed) return false;
            try {
              return headOfPull(pull) === sha;
            } catch {
              return false;
            }
          });
          // Checks that finished on an earlier head say nothing of this one: its own start again.
          const moved = own?.checksHead !== undefined && own.checksHead !== sha;
          const runs = own ? (moved ? (openedChecks ?? checkRuns) : own.checks) : checkRuns;
          const listed = (runs ?? checkRuns).map(({ run, workflow: _workflow, ...check }) =>
            run === undefined ? check : { ...check, check_suite: { id: run } },
          );
          send(200, { total_count: listed.length, check_runs: listed });
          return;
        }
        if (method === "GET" && rest === "/actions/runs") {
          if (
            priorPullRequestWorkflows &&
            url.searchParams.get("event") === "pull_request" &&
            checkRuns.length === 0
          ) {
            send(200, { total_count: 1, workflow_runs: [] });
            return;
          }
          if (url.searchParams.get("head_sha") && checkRuns.length === 0) {
            send(200, { total_count: 0, workflow_runs: [] });
            return;
          }
          // Pull request workflows' runs, each a check suite, finished once
          // every check run in it has.
          const numbers = [...new Set(checkRuns.flatMap((check) => check.run ?? []))];
          const files = [...new Set(checkRuns.flatMap((check) => check.workflow ?? []))];
          const runs = numbers.map((number) => {
            const workflow = checkRuns.find((check) => check.run === number)?.workflow;
            return {
              id: number,
              run_number: number,
              check_suite_id: number,
              workflow_id: workflow ? files.indexOf(workflow) + 2 : 1,
              name: workflow
                ? (workflow.split("/").pop() ?? workflow).replace(/\.ya?ml$/, "")
                : "ci",
              ...(workflow ? { path: workflow } : {}),
              event: "pull_request",
              head_sha: url.searchParams.get("head_sha"),
              status: checkRuns.every(
                (check) => check.run !== number || check.status === "completed",
              )
                ? "completed"
                : "in_progress",
            };
          });
          send(200, { total_count: runs.length, workflow_runs: runs });
          return;
        }
        const statusPost = method === "POST" ? /^\/statuses\/([^/]+)$/.exec(rest) : null;
        if (statusPost?.[1]) {
          const body = JSON.parse(raw) as { context: string; state: string; description?: string };
          const id = putStatus(decodeURIComponent(statusPost[1]), body);
          send(201, { id, ...body });
          return;
        }
        const statusList = method === "GET" ? /^\/commits\/([^/]+)\/statuses$/.exec(rest) : null;
        if (statusList?.[1]) {
          send(200, commitStatuses.get(decodeURIComponent(statusList[1])) ?? []);
          return;
        }
        const statusRead = method === "GET" ? /^\/commits\/([^/]+)\/status$/.exec(rest) : null;
        if (statusRead?.[1]) {
          const statuses = commitStatuses.get(decodeURIComponent(statusRead[1])) ?? [];
          const state = statuses.some(
            (status) => status.state === "failure" || status.state === "error",
          )
            ? "failure"
            : statuses.some((status) => status.state === "pending")
              ? "pending"
              : "success";
          send(200, { state, statuses, total_count: statuses.length });
          return;
        }
        if (method === "GET" && /^\/rules\/branches\/.+$/.test(rest)) {
          send(
            200,
            rulesets.flatMap((set) =>
              set.rules.map((rule) => ({
                type: rule.type,
                ruleset_source_type: "Repository",
                ruleset_source: `${owner}/${name}`,
                ruleset_id: set.id,
                ...(rule.parameters ? { parameters: rule.parameters } : {}),
              })),
            ),
          );
          return;
        }
        const ruleset = /^\/rulesets\/(\d+)$/.exec(rest);
        if (method === "GET" && ruleset) {
          const set = rulesets.find((entry) => entry.id === Number(ruleset[1]));
          if (!set) send(404, { message: "Not Found" });
          else
            send(200, {
              id: set.id,
              name: set.name,
              enforcement: "active",
              current_user_can_bypass: set.bypass,
            });
          return;
        }
        const mergeAsync = /^\/pulls\/(\d+)\/merge-async$/.exec(rest);
        // A GitHub Enterprise Server that supports only the older API version
        // refuses the background merge's version with GitHub's own 400, the
        // body github.com sends for a version it does not support, and the
        // app merges directly.
        if (method === "PUT" && mergeAsync && enterprise) {
          const version = String(req.headers["x-github-api-version"] ?? "");
          if (version !== "2022-11-28") {
            send(400, {
              message: "Bad Request",
              errors: `The version you specified in the "X-GitHub-API-Version" request header, "${version}", is not a supported version. The following versions are currently supported: "2022-11-28".`,
              documentation_url: "https://docs.github.com/rest",
              status: "400",
            });
            return;
          }
        }
        if (method === "PUT" && mergeAsync && !enterprise) {
          const number = Number(mergeAsync[1]);
          const body = JSON.parse(raw || "{}") as {
            sha?: string;
            merge_method?: string;
            merge_action?: string;
            bypass_rules?: boolean;
            commit_title?: string;
            commit_message?: string;
          };
          const pull =
            [...opened.values()].find((open) => open.number === number) ??
            (anyPull?.number === number ? anyPull : undefined);
          if (!pull) {
            send(404, { message: "Not Found" });
            return;
          }
          // A merge past the rules skips the queue and the conflict check a spec scripts.
          const ordinary = body.bypass_rules !== true;
          // GitHub answers at once for a pull request it already merged or queued.
          if (pull.merged || (ordinary && hostQueue.has(number))) {
            send(200, {
              status: pull.merged ? "merged" : "enqueued",
              details: pull.merged ? { sha: `squash-${headOfPull(pull)}` } : {},
            });
            return;
          }
          if (ordinary) onMergeRequest();
          asyncRequests += 1;
          const uuid = `merge-${asyncRequests}-${number}`;
          const head = headOfPull(pull);
          const failed = (message: string) =>
            asyncResults.set(uuid, { status: "failed", details: { uuid, message } });
          // GitHub's "match head commit" guard: the change moved on since.
          if (!body.sha || body.sha !== head) {
            failed("Head branch was modified. Review and try the merge again.");
          } else if (ordinary && conflicted(body.sha)) {
            knownConflicts.add(body.sha);
            failed("Pull Request has merge conflicts");
          } else if (ordinary && mergeQueue && body.merge_action !== "direct_merge") {
            // A merge queue merges its own way and writes its own commit
            // words: GitHub's answer, read on a real queue, to a request
            // that names either.
            if (
              body.merge_method !== undefined ||
              body.commit_title !== undefined ||
              body.commit_message !== undefined
            ) {
              failed("Custom merge params are not supported when merging via a merge queue");
            } else {
              hostQueue.add(number);
              asyncResults.set(uuid, { status: "enqueued", details: { uuid } });
            }
          } else if (body.merge_action === "merge_queue") {
            // The stand-in's own words: GitHub's for a branch with no queue were never read.
            failed("the stand-in has no merge queue on this branch");
          } else {
            const merged = {
              number,
              sha: body.sha,
              method: body.merge_method ?? "merge",
              title: body.commit_title ?? pull.title,
              message: body.commit_message ?? "",
            };
            if (ordinary) merges.push(merged);
            else
              asyncMerges.push({
                ...merged,
                action: body.merge_action ?? "default",
                bypass: true,
              });
            pull.merged = true;
            if (ordinary) pull.headSha = body.sha;
            onPutIn(body.sha);
            asyncResults.set(uuid, {
              status: "merged",
              details: {
                uuid,
                sha: ordinary ? body.sha : `squash-${body.sha}`,
                message: "Pull request merged",
              },
            });
          }
          // Accepted to run in the background: the result is read by its id.
          send(202, {
            status: "pending",
            details: {
              uuid,
              merge_method: body.merge_method ?? "default",
              merge_action: body.merge_action ?? "default",
              expected_head_sha: body.sha ?? "",
              bypass_rules: body.bypass_rules === true,
            },
          });
          return;
        }
        const asyncResult = /^\/pulls\/\d+\/merge-async\/([^/]+)$/.exec(rest);
        if (method === "GET" && asyncResult) {
          const result = asyncResults.get(decodeURIComponent(asyncResult[1] ?? ""));
          if (!result) send(404, { message: "Not Found" });
          else send(200, result);
          return;
        }
        const merge = /^\/pulls\/(\d+)\/merge$/.exec(rest);
        if (method === "PUT" && merge) {
          const number = Number(merge[1]);
          const body = JSON.parse(raw || "{}") as {
            sha?: string;
            merge_method?: string;
            commit_title?: string;
            commit_message?: string;
          };
          const pull =
            [...opened.values()].find((open) => open.number === number) ??
            (anyPull?.number === number ? anyPull : undefined);
          if (!pull || pull.merged) {
            send(404, { message: "Not Found" });
            return;
          }
          onMergeRequest();
          const head = headOfPull(pull);
          // GitHub's "match head commit" guard: the change moved on since.
          if (!body.sha || body.sha !== head) {
            send(409, { message: "Head branch was modified. Review and try the merge again." });
            return;
          }
          if (conflicted(body.sha)) {
            knownConflicts.add(body.sha);
            send(405, { message: "Pull Request has merge conflicts" });
            return;
          }
          merges.push({
            number,
            sha: body.sha,
            method: body.merge_method ?? "merge",
            title: body.commit_title ?? pull.title,
            message: body.commit_message ?? "",
          });
          pull.merged = true;
          pull.headSha = body.sha;
          onPutIn(body.sha);
          send(200, { merged: true, sha: body.sha });
          return;
        }
        if (method === "PATCH" && numbered) {
          const number = Number(numbered[1]);
          const pull =
            [...opened.values()].find((open) => open.number === number) ??
            (anyPull?.number === number ? anyPull : undefined);
          if (!pull) {
            send(404, { message: "Not Found" });
            return;
          }
          const update = JSON.parse(raw || "{}") as {
            title?: string;
            body?: string;
            state?: string;
          };
          if (tooLong(update.body, presentationBodyLimit("github.com"))) return;
          if (update.title !== undefined) pull.title = update.title;
          if (update.body !== undefined) pull.body = update.body;
          if (update.state === "closed") pull.closed = true;
          send(200, { ...pullJson(pull, owner, name), state: pull.closed ? "closed" : "open" });
          return;
        }
        send(404, { message: "Not Found" });
      })
      .catch((caught: unknown) => {
        // A stand-in that cannot answer says so at once, never a hung request.
        if (res.headersSent) return;
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: `the GitHub stand-in failed: ${String(caught)}` }));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: base,
    env: {
      INFINITARY_GITHUB_API_URL: base,
      INFINITARY_GITHUB_OAUTH_URL: base,
      INFINITARY_GITHUB_ENTERPRISE_API_URL: `${base}/api/v3`,
    },
    requests: () => [...log],
    openedIssues: () => [...openedIssues],
    commentsOn: (number) => (issueComments.get(number) ?? []).map((row) => row.body),
    openIssueState: () => openIssueState,
    merges: () => [...merges],
    mergeRequests: () =>
      log.filter((request) => /^PUT \S+\/pulls\/\d+\/merge(?:-async)?$/.test(request)),
    dispatches: () => [...dispatches],
    asyncMerges: () => [...asyncMerges],
    setMergeQueue: (on) => {
      mergeQueue = on;
    },
    inMergeQueue: () => [...hostQueue],
    queueMerges: (number) => {
      const pull =
        [...opened.values()].find((open) => open.number === number) ??
        (anyPull?.number === number ? anyPull : undefined);
      if (!pull || !hostQueue.delete(number))
        throw new Error(`the merge queue does not hold pull request #${number}`);
      const head = headOfPull(pull);
      pull.merged = true;
      if (head) {
        pull.headSha = head;
        onPutIn(head);
      }
    },
    queueRemoves: (number) => {
      if (!hostQueue.delete(number))
        throw new Error(`the merge queue does not hold pull request #${number}`);
    },
    requestText: (number) => {
      const pull =
        [...opened.values()].find((pull) => pull.number === number) ??
        (anyPull?.number === number ? anyPull : undefined);
      return pull ? { title: pull.title, description: pull.body ?? "" } : undefined;
    },
    comments: (number) => (issueComments.get(number) ?? []).map(({ id, body }) => ({ id, body })),
    setRulesets: (sets) => {
      rulesets = sets;
    },
    servePull: (pull) => {
      anyPull = { ...pull };
    },
    serveNext: (pull) => {
      queued.push({ ...pull });
    },
    serveNumbered(pull: {
      number: number;
      branch: string;
      title: string;
      body?: string;
      headSha: string;
      headRepo?: string;
      headRepoId?: number;
      mergeableState?: string;
      undecidedReads?: number;
    }) {
      opened.set(pull.branch, { ...pull });
    },
    priorPullRequestWorkflows(on: boolean) {
      priorPullRequestWorkflows = on;
    },
    setHead: (sha) => {
      if (anyPull) anyPull = { ...anyPull, headSha: sha };
    },
    mergeByHand: (number) => {
      const pull =
        [...opened.values()].find((open) => open.number === number) ??
        (anyPull?.number === number ? anyPull : undefined);
      if (!pull) throw new Error(`no change #${number} to merge`);
      pull.merged = true;
    },
    setChecks: (runs) => {
      checkRuns = runs;
    },
    statuses: (sha) => [...(commitStatuses.get(sha) ?? [])],
    setWorkflowReadFailure: (failure) => {
      workflowReadFailure = failure;
    },
    setPullReadFailure: (number, failure) => {
      if (failure) pullReadFailures.set(number, failure);
      else pullReadFailures.delete(number);
    },
    reruns: () => [...reruns],
    serveWorkflowEvidence: (headSha) => {
      evidenceHead = headSha;
    },
    rejectSignIn: () => {
      rejected = true;
    },
    acceptSignIn: () => {
      rejected = false;
    },
    issueShortLived: () => {
      shortLived = true;
    },
    endAccess: () => {
      ended.add(access);
    },
    refreshes: () => [...refreshes],
    exchanges: () => exchanges,
    device: {
      setCode: (code) => {
        userCode = code;
      },
      approve: (token = GITHUB_STUB_KEY) => {
        device = { mode: "approved", token };
      },
      deny: () => {
        device = { ...device, mode: "denied" };
      },
      expire: () => {
        device = { ...device, mode: "expired" };
      },
    },
    setProjects: (next) => {
      projects = next.map((project) => ({
        fullName: project.fullName,
        private: project.private === true,
        updatedAt: project.updatedAt ?? "2026-09-20T10:00:00Z",
      }));
    },
    setOpenChanges: (next) => {
      openChanges = next;
    },
    headOf: (reader) => {
      headOf = reader;
    },
    onMergeRequest: (apply) => {
      onMergeRequest = apply;
    },
    onPutIn: (apply) => {
      onPutIn = apply;
    },
    pulls: () =>
      appOpened.map((pull) => ({
        number: pull.number,
        branch: pull.branch ?? "",
        title: pull.title,
        body: pull.body ?? "",
        merged: pull.merged === true,
        closed: pull.closed === true,
      })),
    setOpenedChecks: (runs) => {
      openedChecks = runs;
    },
    setPullChecks: (number, runs) => {
      const pull = appOpened.find((open) => open.number === number);
      if (!pull) throw new Error(`the app opened no pull request #${number}`);
      pull.checks = runs;
      const head = headOfPull(pull);
      if (head) pull.checksHead = head;
    },
    setMergeButtons: (buttons) => {
      mergeButtons = buttons;
    },
    deletedBranches: () => [...deletedBranches],
    onBranchDelete: (apply) => {
      onBranchDelete = apply;
    },
    conflicts: (next) => {
      conflicted = next;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * A GitHub sign-in already made, exactly where the app keeps one
 * (`userData/forges/github.com/sign-in.json`, 0700 and 0600): for the specs
 * whose subject is a proposed change rather than signing in.
 */
export function seedGitHubSignIn(
  userDataDir: string,
  token = GITHUB_STUB_KEY,
  host = "github.com",
): void {
  const dir = join(userDataDir, "forges", host);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(join(userDataDir, "forges"), 0o700);
  const file = join(dir, "sign-in.json");
  // A GitHub Enterprise host's key names its kind and git's user name, as a key sign-in keeps it.
  const server = host === "github.com" ? {} : { kind: "github", gitUser: "x-access-token" };
  writeFileSync(
    file,
    `${JSON.stringify({ token, scopes: ["repo"], login: STUB_LOGIN, createdAt: 1, ...server })}\n`,
    { mode: 0o600 },
  );
}

/**
 * A real git repository the app manages as a project on GitHub: the
 * direct-pr specs' working folder. Its origin is recorded on the repos row;
 * nothing here pushes anywhere.
 */
export function seedRepo(userDataDir: string): {
  repoDir: string;
  branchHead: (branch: string) => string;
} {
  const repoDir = join(userDataDir, "repo");
  const git = (...args: string[]) => execFileSync("git", args, { stdio: "pipe" }).toString();
  git("init", "--initial-branch=main", repoDir);
  git("-C", repoDir, "config", "user.name", "Test");
  git("-C", repoDir, "config", "user.email", "test@localhost");
  git("-C", repoDir, "commit", "--allow-empty", "-m", "init");
  return {
    repoDir,
    branchHead: (branch: string) => git("-C", repoDir, "rev-parse", `refs/heads/${branch}`).trim(),
  };
}
