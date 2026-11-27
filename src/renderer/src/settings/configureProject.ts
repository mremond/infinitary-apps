import { patchForHome } from "@shared/advisoryWorkflows";
import type { RepoPolicyPatch, RepoView } from "@shared/repos";
import { useShellStore } from "../app/store";
import { isView } from "../devices/viewWords";

/**
 * Save a project patch in the shape this window's home reads
 * (`project-advisory-workflows.md`). Only a view asks its home, and only for
 * a move naming the reset it showed; a home out of reach gets the older
 * shape, which a current home refuses once the move would clear a list.
 */
export async function configureProject(id: string, changes: RepoPolicyPatch): Promise<RepoView> {
  const view = isView(useShellStore.getState().thisMac);
  const homeChanges =
    view && changes.advisoryWorkflowsCleared !== undefined
      ? await window.infinitary.app.healthcheck().then(
          (home) => home.changes,
          () => undefined,
        )
      : undefined;
  return window.infinitary.repos.configure(id, patchForHome(changes, view, homeChanges));
}
