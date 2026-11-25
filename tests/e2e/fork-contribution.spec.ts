import { expect, test } from "@playwright/test";
import { CARD_ONLY_MEDIA_WORDS } from "../../src/core/forge/presentationTiers";
import * as m from "../../src/panels/now/messages.generated";
import { CONTRIBUTION_WORDS } from "../../src/shared/contributions";
import { MERGE_WORDS } from "../../src/shared/vocabulary";
import { startContributionWorld } from "./contributionWorld";
import { cardBody } from "./frames";
import { SPAWN_PROMPT_MARKER, STEER_PROMPT_MARKER } from "./mockProvider";
import { openProject } from "./projects";
import { promptInput } from "./prompt";
import { dockRegion, expandDock, nowRow } from "./rails";
import {
  CONTRIBUTION_TASK,
  CONTRIBUTION_TITLE,
  forkContribution,
  READ_CONTRIBUTION_STATUS,
} from "./scenarios/forkContribution";
import { showCard, shownCard } from "./stack";
import { focusOn, pressKey } from "./windowKeys";

/**
 * Approved change D: a person approves one fork, publishes an upstream contribution and waits without merge controls.
 * Real local repositories own the branch reads; the local forge owns host responses; the scripted model supplies only tool calls.
 * Completion is the rendered saved story and upstream request, then the maintainers' observed merge.
 * No native platform feature, real account, external network, runner, signing or shared state is required.
 */
test("a contribution asks once for its fork, publishes text upstream and waits without a merge button", async () => {
  const world = await startContributionWorld(false, [forkContribution]);
  try {
    const { page } = world.app;
    const consent = CONTRIBUTION_WORDS.consentTitle(world.repo.name);
    await showCard(page, consent);
    expect(world.forge.createCalls()).toBe(0);
    await shownCard(page, consent)
      .getByRole("button", { name: CONTRIBUTION_WORDS.makeFork, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.infinitary.repos.list())).find(
            (repo) => repo.id === world.repo.id,
          )?.contribution?.fork?.id,
      )
      .toBe(world.forge.fork.id);
    const prompt = promptInput(page);
    await prompt.fill(`${SPAWN_PROMPT_MARKER} ${CONTRIBUTION_TASK}`);
    await prompt.press("Enter");
    await expect(shownCard(page, CONTRIBUTION_TITLE)).toBeVisible({ timeout: 60_000 });
    const card = shownCard(page, CONTRIBUTION_TITLE);
    await expect(
      cardBody(page, CONTRIBUTION_TITLE).getByText(CONTRIBUTION_WORDS.waiting, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const board = await page.evaluate(() => window.infinitary.tasks.board());
        const task = board.tasks.find((row) => row.title === CONTRIBUTION_TASK);
        return { status: task?.status, posture: task?.workPosture };
      })
      .toEqual({
        status: "active",
        posture: { state: "idle", reason: "checks", maintainers: true },
      });
    await expect(page.locator('canvas[data-crew-layer="near"]')).toHaveAttribute(
      "aria-label",
      /0 working.*1 idle/,
    );
    await expect(dockRegion(page, "now")).toContainText(m.nowPanelSummaryWorking({ count: 0 }));
    const board = await page.evaluate(() => window.infinitary.tasks.board());
    const task = board.tasks.find((row) => row.title === CONTRIBUTION_TASK);
    if (!task) throw new Error("The quiet contribution must remain on the task board");
    await expandDock(page, "now");
    await expect(nowRow(page, task.key)).toBeVisible();
    await expect(
      card.getByRole("button", { name: MERGE_WORDS["merge-pr"], exact: true }),
    ).toHaveCount(0);
    expect(world.forge.createCalls()).toBe(1);
    const opened = world.forge.writes.find((call) => call.path === "/repos/examples/project/pulls");
    expect(opened?.body.head).toContain(`${world.forge.fork.full_name.split("/")[0]}:`);
    expect(opened?.body.body).toContain(CARD_ONLY_MEDIA_WORDS);
    expect(opened?.body.body).not.toContain("/user-attachments/");
    expect(world.forge.writes.some((call) => call.path.includes("/statuses/"))).toBe(false);
    expect(world.forge.base.merges()).toEqual([]);
    expect(world.forge.writes.some((call) => call.path === "/user-attachments/assets")).toBe(false);
    const request = world.forge.writes.find(
      (call) => call.path === "/repos/examples/project/pulls",
    );
    expect(request).toBeDefined();
    const number = world.forge.openedNumber();
    if (number === undefined) throw new Error("The host did not confirm a contribution number");
    world.forge.base.mergeByHand(number);
    await prompt.fill(`${STEER_PROMPT_MARKER} ${CONTRIBUTION_TASK}: ${READ_CONTRIBUTION_STATUS}`);
    await prompt.press("Enter");
    await expect(
      cardBody(page, CONTRIBUTION_TITLE).getByText(CONTRIBUTION_WORDS.merged, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    expect(world.forge.base.merges()).toEqual([]);
  } finally {
    await world.close();
  }
});

test("an imported owned fork asks its destination and the target setting works from the keyboard", async () => {
  const world = await startContributionWorld(true);
  try {
    const { page } = world.app;
    const title = CONTRIBUTION_WORDS.destinationTitle(world.repo.name);
    await showCard(page, title);
    await shownCard(page, title)
      .getByRole("button", { name: CONTRIBUTION_WORDS.contribute, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.infinitary.repos.list())).find(
            (repo) => repo.id === world.repo.id,
          )?.contribution?.destination,
      )
      .toBe("upstream");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Projects", exact: true }).click();
    const row = await openProject(page, world.repo.id);
    const original = row.getByRole("radio", { name: CONTRIBUTION_WORDS.upstream, exact: true });
    const fork = row.getByRole("radio", { name: CONTRIBUTION_WORDS.fork, exact: true });
    await expect(original).toBeChecked();
    await focusOn(original, { focusVisible: true });
    await pressKey(original, "ArrowRight");
    await expect(fork).toBeChecked();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.infinitary.repos.list())).find(
            (repo) => repo.id === world.repo.id,
          )?.origin,
      )
      .toBe(world.forge.fork.clone_url);
    expect(world.forge.createCalls()).toBe(0);
  } finally {
    await world.close();
  }
});
