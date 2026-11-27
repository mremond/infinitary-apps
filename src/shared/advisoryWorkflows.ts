import { z } from "zod";
import { forgeOf } from "./forge";

/**
 * One advisory workflow (docs/forge.md, "Advisory workflows"): a workflow
 * file of the project's own, by its path in the repository, the way GitHub
 * names it on each of its runs (`path`). GitHub runs only the files directly
 * in `.github/workflows`, so no other path names a workflow.
 */
export const advisoryWorkflowSchema = z
  .string()
  .trim()
  .regex(/^\.github\/workflows\/[^/\s]+\.ya?ml$/, {
    // i18n-exempt: served to the first mate's model; Settings shows its own words
    message:
      "name a workflow file directly in .github/workflows, such as .github/workflows/early-tests.yml",
  });

/** A project's advisory workflows, each once; an empty list names none. */
export const advisoryWorkflowsSchema = z
  .array(advisoryWorkflowSchema)
  .refine((paths) => new Set(paths).size === paths.length, {
    // i18n-exempt: served to the first mate's model; Settings shows its own words
    message: "name each advisory workflow once",
  });

/**
 * The workflow files a person typed into Settings → Projects, one per line
 * or separated by commas or spaces, each once and in the order typed.
 */
export function typedAdvisoryWorkflows(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((path) => path !== ""))];
}

/**
 * Whether two addresses name the same GitHub repository, however each is
 * spelled: a list chosen for one repository never reaches another's
 * workflow files of the same name (docs/forge.md, "Advisory workflows").
 */
export function sameAdvisoryRepository(
  chosenAt: string | null | undefined,
  readAt: string | null | undefined,
): boolean {
  const chosen = forgeOf(chosenAt);
  const read = forgeOf(readAt);
  return (
    !!chosen.host &&
    !!chosen.owner &&
    !!chosen.name &&
    chosen.host === read.host &&
    chosen.owner.toLowerCase() === read.owner?.toLowerCase() &&
    chosen.name.toLowerCase() === read.name?.toLowerCase()
  );
}

/**
 * Whether moving a project to `origin` clears its advisory workflows, as
 * RepoRegistry.configure does: a list stays with the repository it was
 * chosen for. Every place that changes a project's repository says so first.
 */
export function clearsAdvisoryWorkflows(
  repo: { origin?: string | null; advisoryWorkflows?: readonly string[] },
  origin: string | null | undefined,
): boolean {
  return !!repo.advisoryWorkflows?.length && !sameAdvisoryRepository(repo.origin, origin);
}

/**
 * The advisory workflows moving `repo` to `origin` clears: its list, or none.
 * A place that offers the move sends what it showed
 * (`RepoPolicyPatch.advisoryWorkflowsCleared`), and the move is refused
 * before its first write once the project's own answer differs.
 */
export function advisoryWorkflowsCleared(
  repo: { origin?: string | null; advisoryWorkflows?: readonly string[] },
  origin: string | null | undefined,
): string[] {
  return clearsAdvisoryWorkflows(repo, origin) ? [...(repo.advisoryWorkflows ?? [])] : [];
}

/** The change a home lists once it reads a project's advisory workflows (`project-advisory-workflows.md`). */
export const PROJECT_ADVISORY_WORKFLOWS = "project-advisory-workflows";

/**
 * A project patch as this window's home reads it. A view of a home without
 * the change sends a move as a window older than the list does: that home
 * reads the patch strictly, and keeps no list a move could clear.
 */
export function patchForHome<Patch extends { advisoryWorkflowsCleared?: readonly string[] }>(
  patch: Patch,
  view: boolean,
  homeChanges: readonly string[] | null | undefined,
): Patch {
  if (
    !view ||
    patch.advisoryWorkflowsCleared === undefined ||
    homeChanges?.includes(PROJECT_ADVISORY_WORKFLOWS)
  )
    return patch;
  const older = { ...patch };
  delete older.advisoryWorkflowsCleared;
  return older;
}
