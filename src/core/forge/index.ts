import { contributesUpstream } from "@shared/contributions";
import {
  changePagePaths,
  type ForgeKind,
  forgeOf,
  forgePlace,
  hasChangeRequests,
} from "@shared/forge";
import { changeRequestHost, serverFactsAt } from "@shared/forgeKinds";
import type { RepoView } from "@shared/repos";
import type { Forge, ForgeLocation } from "./forge";
import { bitbucketApiBaseFor } from "./providers/bitbucket/client";
import { bitbucketDataCenterBaseFor } from "./providers/bitbucket/dataCenterClient";
import { createBitbucketServer } from "./providers/bitbucket/signIn";
import { githubApiBaseFor, githubApiBaseUrl } from "./providers/github/githubForge";
import {
  createGitHubServer,
  createGitHubSignIn,
  githubOAuthBaseUrl,
} from "./providers/github/oauth";
import { gitlabApiBaseFor } from "./providers/gitlab/client";
import { gitlabOAuthBaseFor } from "./providers/gitlab/oauth";
import { createGitLabServer } from "./providers/gitlab/signIn";
import { NoHostForge } from "./providers/noHost";
import { PlainGitForge } from "./providers/plainGit";
import type { ForgeServer, ForgeSignInProvider } from "./signIns";

/**
 * The forge seam's one door (git integration PR 1.1, `docs/forge.md`).
 * Everything outside `src/core/forge/` imports this file; the provider
 * files under `./providers/` are fenced (Biome `noRestrictedImports`) so
 * only this directory, its home wiring (`homeForges.ts`) among it, reaches
 * one, the way Pi is reached only through `src/core/pi/`.
 */

export type {
  ApiReadMethod,
  ApiRoute,
  ApiWriteMethod,
  ForgeApi,
  ForgeApiResponse,
  GithubReadInput,
  GithubWriteInput,
  ReleaseUpload,
} from "./api";
export {
  API_CALLS_PER_TASK,
  API_RESPONSE_MAX_BYTES,
  nextPagePath,
  OversizedAnswer,
  parseApiRequest,
  smallerPage,
} from "./api";
export type {
  AttachmentDestination,
  AttachmentMediaType,
  ForgeAttachments,
  UploadAttachment,
} from "./attachments";
export { AttachmentUploadError, sameAttachmentDestination } from "./attachments";
export { CONTRIBUTION_DELIVERY_WORDS } from "./contributions";
export type {
  Forge,
  ForgeBypass,
  ForgeChange,
  ForgeCheck,
  ForgeCheckState,
  ForgeChecks,
  ForgeComment,
  ForgeFailure,
  ForgeLocation,
  ForgeOverall,
  ForgeProject,
  ForgePull,
  ForgePullComment,
  ForgeReadiness,
  ForgeRuleset,
  ForgeSkipMerge,
  MergeAnswer,
} from "./forge";
export {
  allowanceResetOf,
  asReported,
  BATCH_CHECK,
  BATCH_WAITING_WORDS,
  changeTitle,
  describeCheckState,
  ForgeAllowanceSpent,
  ForgeBaseMoved,
  ForgeError,
  ForgeMergeUnconfirmed,
  ForgeMovedError,
  ForgeWriteError,
  isRedCheckState,
  isSignInForgeFailure,
  isTransientForgeFailure,
  type TeamQueueLeftovers,
} from "./forge";
export { type GitHubCli, githubCliFor } from "./githubCli";
export {
  NO_MISTAKES_ATTESTATION_PREFIX,
  NO_MISTAKES_SIGNATURE,
  neutralizePipelineAttestation,
  pipelineAttestationSection,
} from "./pipelineAttestation";
export {
  BATCH_STORIES_MARKER,
  messageWithoutPresentation,
  PresentationAroundError,
  presentationAround,
  presentationBodyLimit,
  presentationCardBody,
  presentationCommentLimit,
  presentationCommitMessage,
  presentationContentHash,
  presentationHtmlText,
  presentationLines,
  presentationMarkdown,
  presentationMarkdownText,
  presentationRegionMarkers,
  presentationSizingUrl,
  readPresentationRegion,
  replaceAroundPresentation,
  replacePresentationRegion,
  sameAroundPresentation,
} from "./presentation";
export type { RemoteHost } from "./projects";
export { remoteProjectsText } from "./projects";
export { conditionalGets } from "./providers/github/conditionalGets";
export { githubApiBaseUrl } from "./providers/github/githubForge";
export { gitlabReleaseFileCalls } from "./providers/gitlab/api";
export { GITLAB_PRIVATE_MEDIA_REFUSAL } from "./providers/gitlab/attachments";
export type { LocatedReleaseFile } from "./releaseFile";
export { PLACED_RELEASE_FILE_REFUSAL, releaseFileIn } from "./releaseFile";
export type { SignInRefusal, SignInWay } from "./signInRefusal";
export {
  renderSignInRefusal,
  SignInRequiredError,
  signInRefusal,
  signInWays,
} from "./signInRefusal";
export type {
  ForgeHealthChange,
  ForgeServer,
  ForgeSignInEnding,
  ForgeSignInProvider,
  ForgeSignInRecord,
} from "./signIns";
export {
  ForgeSignInStore,
  ForgeSignIns,
  ForgeStartError,
  forgeFiledHosts,
  forgeKnownHosts,
} from "./signIns";

/**
 * Every host the app offers its own sign-in to, as the sign-in service asks
 * it: GitHub's device flow for now (PR 1.2). The dev and e2e endpoint
 * overrides are read only off a packaged app. The home's forge wiring
 * (`homeForges.ts`) and a computer that runs work's own sign-ins
 * (`src/core/helper/forges.ts`) both start from this list.
 */
export function forgeSignInProviders(options: {
  packaged: boolean;
  env?: NodeJS.ProcessEnv;
  /** GitHub's reads, conditional where the app keeps them (`conditionalGets`). */
  githubFetch?: typeof fetch;
}): ForgeSignInProvider[] {
  return [
    createGitHubSignIn({
      oauthBaseUrl: githubOAuthBaseUrl(options),
      apiBaseUrl: githubApiBaseUrl(options),
      ...(options.githubFetch ? { fetch: options.githubFetch } : {}),
    }),
  ];
}
/**
 * Every kind of server a host on the person's own server can be added as,
 * with a key made there (`docs/forge.md`, "Hosts on your own server"):
 * GitHub Enterprise and GitLab, with each kind's API address, sign-in
 * check and git user name. GitLab also names its public host and offers
 * browser sign-in with a per-host Application ID. Bitbucket signs in by
 * token: an API token at bitbucket.org (`docs/forge.md`, "Bitbucket
 * sign-in and projects"), an HTTP access token at a Bitbucket Data Center
 * server (`docs/forge.md`, "Bitbucket Data Center").
 * The home and a computer that runs work both offer them (`docs/forge.md`,
 * "A computer's own sign-in").
 */
export function forgeSignInServers(options: {
  packaged: boolean;
  env?: NodeJS.ProcessEnv;
  /** GitHub's reads, conditional where the app keeps them (`conditionalGets`). */
  githubFetch?: typeof fetch;
}): ForgeServer[] {
  return [
    createGitHubServer({
      apiBaseFor: (host) => githubApiBaseFor(host, options),
      ...(options.githubFetch ? { fetch: options.githubFetch } : {}),
    }),
    createGitLabServer({
      apiBaseFor: (host) => gitlabApiBaseFor(host, options),
      oauthBaseFor: (host) => gitlabOAuthBaseFor(host, options),
    }),
    createBitbucketServer({
      apiBaseFor: (host) => bitbucketApiBaseFor(host, options),
      dataCenterBaseFor: (host) => bitbucketDataCenterBaseFor(host, options),
    }),
  ];
}

export type {
  ArchiveRanges,
  DownloadArtifactInput,
  ForgeWorkflows,
  ReadWorkflowInput,
  WorkflowArtifact,
  WorkflowJob,
  WorkflowJobLine,
  WorkflowJobList,
  WorkflowRun,
} from "./workflows";

/**
 * Which implementation serves a kind that needs the person's sign-in. The
 * home's forge wiring (`homeForges.ts`) chooses it: GitHub - github.com and
 * every GitHub Enterprise host - is the REST `GitHubForge` with the app's
 * own sign-in for that host (PR 1.2), and GitLab - gitlab.com and every self-hosted
 * server - is the REST `GitLabForge` with the app's own sign-in, and
 * Bitbucket is the REST `BitbucketForge` on bitbucket.org and the REST
 * `DataCenterForge` on a Bitbucket Data Center server. A kind with no
 * binding is a plain Git host.
 */
export type ForgeBindings = Partial<Record<ForgeKind, (location: ForgeLocation) => Forge>>;

/** The repository fields the seam reads; a repo-less task has none. */
export type ForgeRepo = Pick<
  RepoView,
  "path" | "origin" | "host" | "contribution" | "advisoryWorkflows"
>;

/** A saved numbered request belongs to a forge repository, not a managed project id. */
export function requestAtRepo(
  repo: ForgeRepo,
  request: { host: string; owner: string; name: string; kind?: string },
): boolean {
  const here = forgeOf(repo.origin);
  const fold = (word: string | undefined) =>
    changeRequestHost(repo.host?.kind)?.foldsNames ? word?.toLowerCase() : word;
  return (
    (!request.kind || request.kind === repo.host?.kind) &&
    here.host === request.host &&
    fold(here.owner) === fold(request.owner) &&
    fold(here.name) === fold(request.name)
  );
}

/** A request link carries the destination even for records saved before reviews had one. */
export function requestLinkAtRepo(repo: ForgeRepo, link: string | undefined): boolean {
  if (!hasChangeRequests(repo.host?.kind)) return true;
  if (!link) return false;
  const parent = link.replace(new RegExp(`/(?:${changePagePaths()})/\\d+/?$`), "");
  if (parent === link) return false;
  // A server whose project page is not its clone path (Bitbucket Data
  // Center's `projects/KEY/repos/slug` for `scm/key/slug`) is matched on
  // the page the repository's own address names.
  const here = forgeOf(repo.origin);
  const { host, owner, name } = forgeOf(parent);
  const server = serverFactsAt(repo.host?.kind, here.host);
  if (server && here.owner && here.name)
    return (
      !!host &&
      host === here.host &&
      `${owner}/${name}`.toLowerCase() === server.projectPage(here.owner, here.name).toLowerCase()
    );
  return !!host && !!owner && !!name && requestAtRepo(repo, { host, owner, name });
}

export function forgeLocationOf(repo: ForgeRepo): ForgeLocation {
  const parsed = forgeOf(repo.origin);
  return {
    kind: repo.host?.kind ?? "none",
    host: repo.host?.name ?? null,
    ...(parsed.owner ? { owner: parsed.owner } : {}),
    ...(parsed.name ? { name: parsed.name } : {}),
    dir: repo.path,
    ...(contributesUpstream(repo.contribution) && repo.contribution?.fork
      ? { source: { id: repo.contribution.fork.id, fullName: repo.contribution.fork.fullName } }
      : {}),
    ...(repo.advisoryWorkflows?.length ? { advisoryWorkflows: repo.advisoryWorkflows } : {}),
  };
}

/**
 * The forge for a repository. A project with no host (or no repository at
 * all) is kept on this Mac; a kind with a binding is its implementation
 * (GitHub, GitLab or Bitbucket, on its public host or the person's own
 * server); a plain Git host sends its work up as a
 * branch.
 */
export function createForgeResolver(
  bindings: ForgeBindings,
): (repo: ForgeRepo | undefined, fallbackDir?: string) => Forge {
  return (repo, fallbackDir = "") => {
    if (!repo) return new NoHostForge({ kind: "none", host: null, dir: fallbackDir });
    const location = forgeLocationOf(repo);
    if (location.kind === "none") return new NoHostForge(location);
    const bound = bindings[location.kind];
    if (bound) return bound(location);
    return new PlainGitForge({ ...location, place: forgePlace(location) }, repo.origin);
  };
}

export { isForkReview } from "@shared/mergeReview";
export { forkStoryForge } from "./forkStory";
