import { sameAdvisoryRepository } from "@shared/advisoryWorkflows";
import { hasChangeRequests } from "@shared/forge";
import { type ForgeRepo, requestAtRepo, requestLinkAtRepo } from "../forge";

export { requestAtRepo, requestLinkAtRepo } from "../forge";

import type { TaskRecord } from "../storage/taskRecords";

/**
 * A prepared task keeps its own publication identity; other managed targets
 * keep theirs. The project's advisory workflows go with it only to the
 * repository they were chosen for.
 */
export function publicationRepo<T extends ForgeRepo>(record: TaskRecord, repo: T): T {
  const origin = record.delivery?.publicationOrigin;
  if (!("id" in repo && repo.id === record.repoId && origin)) return repo;
  return {
    ...repo,
    origin,
    contribution: record.delivery?.contribution,
    ...(sameAdvisoryRepository(repo.origin, origin) ? {} : { advisoryWorkflows: undefined }),
  };
}

/**
 * The managed repository a kept approval pinned its pull request in
 * (INF-5193): the task's own project first, as it publishes, then any other
 * managed one. Its origin must name the pinned repository and its forge the
 * pinned host, so a project repointed to another host since, whose task
 * still publishes under the old origin, never answers for it.
 */
export function pinnedRequestRepo<T extends ForgeRepo & { id: string }>(
  record: TaskRecord,
  repos: { get(id: string): T | undefined; list(): T[] },
  place: { host: string; owner: string; name: string },
): T | undefined {
  const own = record.repoId ? repos.get(record.repoId) : undefined;
  return [...(own ? [own] : []), ...repos.list()]
    .map((item) => publicationRepo(record, item))
    .find((item) => item.host?.name === place.host && requestAtRepo(item, place));
}

/** Verify saved evidence before using the number, independently of whichever request is selected. */
export function savedRequestAtRepo(
  record: TaskRecord,
  repo: ForgeRepo,
  number: number,
  branch: string,
  link?: string | null,
): boolean {
  if (link) return requestLinkAtRepo(repo, link);
  return (
    !hasChangeRequests(repo.host?.kind) ||
    Boolean(
      record.delivery?.mergeReviews?.some(
        (review) =>
          review.number === number &&
          review.branch === branch &&
          (review.repoId ?? record.repoId) === ("id" in repo ? repo.id : record.repoId) &&
          requestAtRepo(repo, review),
      ),
    )
  );
}
