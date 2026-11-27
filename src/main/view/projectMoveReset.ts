import { contractChange, listsChange } from "@core/connection/contractChanges";

/** A project's advisory workflows (`project-advisory-workflows.md`). */
export const PROJECT_ADVISORY_WORKFLOWS = contractChange("project-advisory-workflows");

/**
 * A project change as a home can read it: one that does not list the change
 * reads the patch strictly and would refuse the reset a move of address or
 * target project showed, while it keeps no list the move could clear, so the
 * reset is left out there and the move goes as it did before.
 */
export function shownResetFor(
  channel: string,
  rawArgs: unknown[],
  homeChanges: readonly string[] | null,
): unknown[] {
  if (channel !== "inf:repos:configure" || listsChange(homeChanges, PROJECT_ADVISORY_WORKFLOWS))
    return rawArgs;
  const patch = rawArgs[1];
  if (typeof patch !== "object" || patch === null || !("advisoryWorkflowsCleared" in patch))
    return rawArgs;
  const { advisoryWorkflowsCleared: _shown, ...kept } = patch;
  return rawArgs.map((arg, index) => (index === 1 ? kept : arg));
}
