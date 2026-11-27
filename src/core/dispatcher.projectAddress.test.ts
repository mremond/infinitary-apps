import { rmSync } from "node:fs";
import { ADVISORY_WORKFLOWS_RESET_REFUSAL } from "@shared/repos";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fakeHost } from "../../tests/helpers/bootedCore";
import { scratchDir } from "../../tests/helpers/scratchDirs";
import { type Core, startCore } from "./index";
import { catalogRefreshesSettled } from "./pi/modelRuntime";
import { git } from "./workspace/git";

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("./utilityQos", async (importOriginal) =>
  (await import("../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

describe("a project's address and target project, saved through the configure request", () => {
  let userDataDir: string;
  let core: Core;

  beforeAll(async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    userDataDir = scratchDir("infinitary-core-address-");
    core = await startCore(fakeHost(userDataDir).host);
  }, 60_000);

  afterAll(async () => {
    await core?.dispose();
    await core?.services.workspace.poolSettled();
    await core?.services.workspace.deletionsSettled();
    await catalogRefreshesSettled();
    rmSync(userDataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  // docs/forge.md, "Advisory workflows": a window older than the list sends
  // no reset with a move, so it showed none, and a move that would clear the
  // list waits for one that shows it.
  it("refuses a move from a window that showed no advisory reset once it would clear the project's list", async () => {
    const folder = scratchDir("advisory-older-window-");
    const { repo } = await core.dispatch("inf:repos:setup", [{ kind: "adopt", path: folder }]);
    const here = "https://github.com/octocat/Hello-World.git";
    const there = "https://github.com/octocat/Spoon-Knife.git";
    const pilot = [".github/workflows/early-tests.yml"];
    const choose = vi
      .spyOn(core.services.projectContributions, "choose")
      .mockRejectedValue(new Error(ADVISORY_WORKFLOWS_RESET_REFUSAL));
    try {
      await git(folder, ["remote", "add", "origin", here]);
      core.services.repos.configure(repo.id, { origin: here, delivery: "direct-pr" });
      core.services.repos.configure(repo.id, { advisoryWorkflows: pilot });
      await git(folder, ["remote", "set-url", "origin", there]);
      await expect(
        core.dispatch("inf:repos:configure", [repo.id, { origin: there }]),
      ).rejects.toThrow(ADVISORY_WORKFLOWS_RESET_REFUSAL);
      expect(core.services.repos.get(repo.id)).toMatchObject({
        origin: here,
        advisoryWorkflows: pilot,
      });
      await expect(
        core.dispatch("inf:repos:configure", [repo.id, { contributionDestination: "fork" }]),
      ).rejects.toThrow(ADVISORY_WORKFLOWS_RESET_REFUSAL);
      expect(choose).toHaveBeenCalledWith(repo.id, "fork", false, []);
      const moved = await core.dispatch("inf:repos:configure", [
        repo.id,
        { origin: there, advisoryWorkflowsCleared: pilot },
      ]);
      expect(moved.origin).toBe(there);
      expect(moved.advisoryWorkflows).toBeUndefined();
    } finally {
      choose.mockRestore();
      if (core.services.repos.get(repo.id)) await core.dispatch("inf:repos:remove", [repo.id]);
    }
  });

  // Target and address changes write on the project's line, so a save naming
  // the address the project has is decided there, after the writes before it.
  it("decides a save naming the project's own address after the address change already on its line", async () => {
    const folder = scratchDir("address-line-");
    const { repo } = await core.dispatch("inf:repos:setup", [{ kind: "adopt", path: folder }]);
    const here = "https://github.com/octocat/Hello-World.git";
    const there = "https://github.com/octocat/Spoon-Knife.git";
    const check = core.services.repos.checkDetails.bind(core.services.repos);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let moved = false;
    const checkedAfterMove: boolean[] = [];
    const checkDetails = vi
      .spyOn(core.services.repos, "checkDetails")
      .mockImplementation(async (id, changes) => {
        checkedAfterMove.push(moved);
        if (changes.origin === there) await held;
        return check(id, changes);
      });
    try {
      await git(folder, ["remote", "add", "origin", here]);
      core.services.repos.configure(repo.id, { origin: here });
      await git(folder, ["remote", "set-url", "origin", there]);
      const moving = core.services.projectContributions
        .changeAddress(repo.id, { origin: there, advisoryWorkflowsCleared: [] })
        .finally(() => {
          moved = true;
        });
      const same = core.dispatch("inf:repos:configure", [repo.id, { origin: here }]);
      release();
      await moving;
      await expect(same).rejects.toThrow("Where the folder points changed.");
      expect(checkedAfterMove).toEqual([false, true]);
      expect(core.services.repos.get(repo.id)?.origin).toBe(there);
    } finally {
      checkDetails.mockRestore();
      if (core.services.repos.get(repo.id)) await core.dispatch("inf:repos:remove", [repo.id]);
    }
  });
});
