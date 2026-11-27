/**
 * A review of the advisory workflows change: a view of a home that does not
 * list `project-advisory-workflows` sends a move of address or target project
 * in the shape that home reads, since it refuses the shown reset it cannot
 * read and keeps no list the move could clear.
 */

import { PROJECT_ADVISORY_WORKFLOWS, patchForHome } from "@shared/advisoryWorkflows";
import { describe, expect, it } from "vitest";
import { CONTRACT_CHANGES } from "./contractChanges";

describe("a project move's shown reset as its home reads it", () => {
  const current = CONTRACT_CHANGES.names;
  const older = current.filter((name) => name !== PROJECT_ADVISORY_WORKFLOWS);
  const move = {
    origin: "https://github.com/examples/project-next.git",
    advisoryWorkflowsCleared: [".github/workflows/early-tests.yml"],
  };

  it("keeps it for the home itself and a view of a current home", () => {
    expect(current).toContain(PROJECT_ADVISORY_WORKFLOWS);
    expect(patchForHome(move, false, null)).toEqual(move);
    expect(patchForHome(move, true, current)).toEqual(move);
  });

  it("leaves it out for a view of an older home, and of one that has not answered", () => {
    expect(patchForHome(move, true, older)).toEqual({ origin: move.origin });
    expect(patchForHome(move, true, null)).toEqual({ origin: move.origin });
  });
});
