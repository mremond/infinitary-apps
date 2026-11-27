/**
 * Where a project lives, read from its `origin` (git integration PR 0.2;
 * the forge seam of phase 1 reuses this parser). A project with no origin
 * lives only on this Mac (`none`); GitHub, GitLab and Bitbucket are named
 * by their public hosts; any other remote is a plain Git host (`git`),
 * including a remote on this Mac's own disk.
 *
 * A host on the person's own server is the kind of host it runs once the
 * app knows it (`docs/forge.md`, "Hosts on your own server"): GitHub
 * Enterprise Cloud's `<name>.ghe.com` is GitHub by its name alone, and any
 * other host is the kind the caller names in `known` - a host the person
 * signed in to, or one their projects already live on, which only the core
 * knows. A self-hosted GitLab is known the same way.
 *
 * Pure and total: any string parses to a kind, and nothing here reads git,
 * the network, or a sign-in.
 */

import {
  CHANGE_REQUEST_HOSTS,
  changeHostOf,
  changeRequestHost,
  changeRequestKind,
  serverFactsAt,
} from "./forgeKinds.ts";

export type ForgeKind = "github" | "gitlab" | "bitbucket" | "git" | "none";

export type ForgeOrigin = {
  kind: ForgeKind;
  /** The host name, lower case; null when the project lives nowhere else or on a local path. */
  host: string | null;
  /** The owner path (a GitLab group may nest), when the origin names one. */
  owner?: string;
  /** The project's name, without a trailing `.git`. */
  name?: string;
};

const PUBLIC_HOSTS: Record<string, ForgeKind> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
};

/** github.com: the one GitHub host the app's own GitHub sign-in (the code) is for. */
export const GITHUB_COM = "github.com";

/**
 * The kinds whose proposed change is a numbered request the app opens,
 * reads and merges through the host's API, with readiness and a kept merge
 * approval (FI3-304): GitHub's and Bitbucket's pull requests and GitLab's
 * merge requests.
 * Every other kind sends a branch up, or keeps the work on this Mac. The
 * forge seam binds exactly these kinds to a forge with `pull`
 * (`src/core/forge/index.ts`).
 */
export function hasChangeRequests(kind: ForgeKind | undefined): boolean {
  return changeRequestKind(kind) !== undefined;
}

/** How a host names a proposed change by its number: GitLab's merge request `!N`, every other host's `#N`. */
export function changeNumberLabel(kind: ForgeKind | undefined, number: number): string {
  return `${changeHostOf(kind).numberPrefix}${number}`;
}

/**
 * The page where the project lives that shows what a pushed branch adds to
 * the branch it builds on: GitHub's and GitLab's compare page (INF-4196).
 * A batched change has no pull request of its own, so this is the page its
 * merge card and Info tab link. A server whose pages differ from its
 * public host's (Bitbucket Data Center) names its own compare page. Null
 * for a kind with no such page.
 */
export function branchComparePage(where: {
  kind: ForgeKind;
  host: string;
  owner: string;
  name: string;
  base: string;
  branch: string;
}): string | null {
  const path = (value: string) => value.split("/").map(encodeURIComponent).join("/");
  const project = `https://${where.host}/${path(where.owner)}/${encodeURIComponent(where.name)}`;
  const facts = changeRequestHost(where.kind);
  if (!facts) return null;
  const server = serverFactsAt(where.kind, where.host);
  if (server)
    return `https://${where.host}/${server.projectPage(where.owner, where.name)}/${server.comparePage(where.base, where.branch)}`;
  const range =
    facts.compareRange?.(path(where.base), path(where.branch)) ??
    `${path(where.base)}...${path(where.branch)}`;
  return `${project}/${facts.comparePath}/${range}`;
}

/** A host on the person's own server the app knows, and the kind of host it runs. */
export type KnownForgeHost = { host: string; kind: ForgeKind };

/** GitHub Enterprise Cloud with data residency: every `<name>.ghe.com` is GitHub's own. */
const GHE_CLOUD = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ghe\.com$/;

export function isGitHubEnterpriseCloud(host: string): boolean {
  return GHE_CLOUD.test(host);
}

export function isPublicForgeHost(host: string): boolean {
  return Object.hasOwn(PUBLIC_HOSTS, host);
}

export function kindByName(host: string): ForgeKind | undefined {
  if (Object.hasOwn(PUBLIC_HOSTS, host)) return PUBLIC_HOSTS[host];
  return isGitHubEnterpriseCloud(host) ? "github" : undefined;
}

export function kindOfHost(host: string, known: readonly KnownForgeHost[] = []): ForgeKind {
  return kindByName(host) ?? known.find((entry) => entry.host === host)?.kind ?? "git";
}

/** `git@host:owner/name.git`: scp-like, the one remote shape with no scheme. */
const SCP_LIKE = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/;

/**
 * What a project's origin says about where it lives. `known` are the hosts
 * on the person's own server the caller knows beyond those known by name.
 */
export function forgeOf(
  origin: string | null | undefined,
  known: readonly KnownForgeHost[] = [],
): ForgeOrigin {
  const raw = origin?.trim() ?? "";
  if (!raw) return { kind: "none", host: null };
  const located = locate(raw);
  if (!located) return { kind: "git", host: null };
  const host = located.host.toLowerCase().replace(/^www\./, "");
  const kind = kindOfHost(host, known);
  const segments = located.path
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) return { kind, host };
  const name = segments.at(-1) as string;
  return { kind, host, owner: segments.slice(0, -1).join("/"), name };
}

/** Every spelling of a change's page path, as a pattern's alternatives. */
export function changePagePaths(): string {
  return Object.values(CHANGE_REQUEST_HOSTS)
    .flatMap((entry) => entry.requestPaths)
    .map((path) => path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
    .join("|");
}

/** A change's page: the project's page, a kind's change path, and the number. */
let requestLink: RegExp | undefined;

/** A numbered request is scoped to its forge, repository and number, not its URL spelling. */
export function requestIdentity(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  requestLink ??= new RegExp(`^(https?://.+?)/(${changePagePaths()})/(\\d+)/?(?:[?#].*)?$`, "i");
  const match = requestLink.exec(link);
  if (!match) return undefined;
  try {
    const { host, owner, name } = forgeOf(match[1]);
    if (!host || !owner || !name) return undefined;
    // A path spelled as no kind spells it reads as GitHub's, as the pattern's case allows.
    const facts =
      Object.values(CHANGE_REQUEST_HOSTS).find((entry) =>
        entry.requestPaths.includes(match[2] as string),
      ) ?? changeHostOf(undefined);
    const fold = (word: string) => (facts.foldsNames ? word.toLowerCase() : word);
    return JSON.stringify([facts.kind, host, fold(owner), fold(name), Number(match[3])]);
  } catch {
    return undefined;
  }
}

export function sameRequestLink(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const key = requestIdentity(a);
  return key !== undefined && key === requestIdentity(b);
}

function locate(raw: string): { host: string; path: string } | undefined {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return undefined;
    }
    if (url.protocol === "file:" || !url.hostname) return undefined;
    // An unfinished escape, such as a trailing % typed midway, makes the
    // decode throw; such an address names no repository yet.
    try {
      return { host: url.hostname, path: decodeURIComponent(url.pathname) };
    } catch {
      return undefined;
    }
  }
  // A Windows drive letter ("C:\\...") is a local path, not host:path.
  if (/^[a-z]:[\\/]/i.test(raw)) return undefined;
  const scp = SCP_LIKE.exec(raw);
  if (!scp) return undefined;
  return { host: scp[1] as string, path: scp[2] as string };
}

const PUBLIC_NAMES: Partial<Record<ForgeKind, string>> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

/**
 * The person's word for where a project lives (git integration PR 1.1): the
 * provider's own name on its public host ("GitHub"), which is the person's
 * word the way a model provider's is, else the host's address
 * ("git.example.com", and a host on the person's own server,
 * "github.example.com"). Null where there is no host to name - a project
 * kept only on this Mac, or a remote on this Mac's own disk.
 */
export function forgePlace(where: { kind: ForgeKind; host: string | null }): string | null {
  if (where.kind === "none" || !where.host) return null;
  return PUBLIC_HOSTS[where.host] === where.kind
    ? (PUBLIC_NAMES[where.kind] ?? where.host)
    : where.host;
}

/**
 * An address the person typed for a host on their own server - its name,
 * a page on it, or a project's address there - as the host name the app
 * keys its sign-in by, or null when it names no host.
 */
export function hostOfAddress(address: string): string | null {
  const raw = address.trim();
  // Nothing typed, or a folder on this Mac: no host.
  if (!raw || /^[/.~\\]/.test(raw)) return null;
  const located = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^[^@/\s]+@[^:/\s]+:/.test(raw);
  return forgeOf(located ? raw : `https://${raw}`).host;
}
