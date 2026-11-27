import { describe, expect, it } from "vitest";
import { insertDirectPrTask, setup } from "../../../tests/helpers/prCiHarness";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import { forgeLocationOf } from "../forge";
import { publicationRepo } from "./publicationRepo";

// docs/forge.md, "Advisory workflows": a list is the project's choice for
// one GitHub repository, so a task publishing to another reads its checks
// there with every check holding.
describe("publicationRepo's advisory workflows", () => {
  it("carries the list to the project's own repository however it is spelled, and to no other", async () => {
    const { tasks, repos } = setup();
    await insertDirectPrTask(tasks, repos);
    const task = tasks.get("ab12cd34");
    if (!task?.repoId) throw new Error("the task has no project");
    const pilot = [".github/workflows/early-tests.yml"];
    repos.configure(task.repoId, {
      origin: "https://github.com/example-studio/meter.git",
      advisoryWorkflows: pilot,
    });
    const readAt = (publicationOrigin: string) => {
      seedDelivery(tasks, task.id, { publicationOrigin });
      const record = tasks.get(task.id);
      const repo = repos.get(task.repoId ?? "");
      if (!record || !repo) throw new Error("the task or its project is gone");
      return forgeLocationOf(publicationRepo(record, repo));
    };
    expect(readAt("git@github.com:Example-Studio/meter.git").advisoryWorkflows).toEqual(pilot);
    const upstream = readAt("https://github.com/upstream-org/meter.git");
    expect([upstream.owner, upstream.name, upstream.advisoryWorkflows]).toEqual([
      "upstream-org",
      "meter",
      undefined,
    ]);
  });
});
