import { z } from "zod";
import { forgeOf } from "./forge";
import { changeRequestHost } from "./forgeKinds";

/** Host identities, never credentials, for a project's contribution route. */
export const contributionProjectSchema = z.strictObject({
  id: z.number().int().positive(),
  fullName: z.string().min(1),
  origin: z.string().url(),
});
export type ContributionProject = z.infer<typeof contributionProjectSchema>;

/** GitHub and Bitbucket project paths are case-insensitive; GitLab keeps the host's path spelling. */
export function contributionOriginMatches(
  project: Pick<ContributionProject, "fullName" | "origin">,
  origin: string | null | undefined,
  kind: string | undefined,
): boolean {
  const where = forgeOf(origin);
  if (where.host !== forgeOf(project.origin).host) return false;
  const name = `${where.owner}/${where.name}`;
  return changeRequestHost(kind)?.foldsNames
    ? name.toLowerCase() === project.fullName.toLowerCase()
    : name === project.fullName;
}
/** Reuse the person's Git transport for another repository on the same host. */
export function contributionTransport(
  project: ContributionProject,
  reference: string | null | undefined,
): string {
  if (!reference || forgeOf(reference).host !== forgeOf(project.origin).host)
    reference = project.origin;
  const same = contributionOriginMatches(project, reference, forgeOf(project.origin).kind);
  if (reference.includes("://")) {
    const url = new URL(reference);
    if (url.protocol === "https:" || url.protocol === "http:") url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    if (!same) url.pathname = `/${project.fullName}${url.pathname.endsWith(".git") ? ".git" : ""}`;
    return url.toString();
  }
  if (same) return reference;
  const colon = reference.indexOf(":");
  return colon >= 0
    ? `${reference.slice(0, colon + 1)}${project.fullName}${reference.endsWith(".git") ? ".git" : ""}`
    : project.origin;
}

export const CONTRIBUTION_MERGE_REFUSAL =
  "This contribution waits for the project's maintainers. Infinitary cannot merge it or mark their queue.";

export const contributionDestinationSchema = z.enum(["upstream", "fork"]);
export const contributionRouteSchema = z.strictObject({
  upstream: contributionProjectSchema,
  fork: contributionProjectSchema.nullable(),
  /** An imported owned fork waits for the person's choice, never a host guess. */
  destination: contributionDestinationSchema.nullable(),
  /** Written before a create request; an uncertain request is never sent twice. */
  creationAttempted: z.boolean().optional(),
});
export type ContributionRoute = z.infer<typeof contributionRouteSchema>;
export const contributionStateSchema = z.strictObject({
  number: z.number().int().positive(),
  state: z.enum(["open", "merged", "closed"]),
  updatedAt: z.string().optional(),
});
export type ContributionState = z.infer<typeof contributionStateSchema>;

export function waitingForMaintainers(
  delivery:
    | {
        contribution?: ContributionRoute;
        contributionState?: ContributionState;
        prNumber?: number;
      }
    | null
    | undefined,
): boolean {
  return (
    contributesUpstream(delivery?.contribution) &&
    delivery?.contributionState?.state === "open" &&
    delivery.contributionState.number === delivery.prNumber
  );
}

export const CONTRIBUTION_WORDS = {
  target: "Target project",
  upstream: "Original project",
  fork: "My fork",
  description: "Choose whether changes contribute to the original project or stay in your fork.",
  waiting: "Waiting for the maintainers",
  merged: "The maintainers merged this contribution",
  closed: "The maintainers closed this contribution without merging",
  makeFork: "Make my fork",
  contribute: "Contribute to original",
  keepFork: "Keep changes in my fork",
  consentTitle: (name: string) => `Make your fork of ${name}?`,
  destinationTitle: (name: string) => `Where should ${name}'s changes go?`,
} as const;

export function contributesUpstream(route: ContributionRoute | null | undefined): boolean {
  return route?.destination === "upstream" && route.fork !== null;
}

/** The source address and optional fork push address already prepared for this task. */
export function preparedPublicationRemote(
  record:
    | { delivery?: { publicationOrigin?: string; publicationPushOrigin?: string } | null }
    | undefined,
): { origin: string; pushOrigin?: string } | undefined {
  const origin = record?.delivery?.publicationOrigin;
  if (!origin) return undefined;
  return { origin, pushOrigin: record.delivery?.publicationPushOrigin };
}
