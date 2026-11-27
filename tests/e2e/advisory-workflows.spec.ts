import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { openDatabase } from "../../src/core/storage/db";
import { TaskStore } from "../../src/core/storage/taskRecords";
import { PROJECT_POLICY_WORDS } from "../../src/renderer/src/settings/projectsWords";
import { advisoryCheckWords } from "../../src/shared/checkSnapshot";
import { CONTRIBUTION_WORDS } from "../../src/shared/contributions";
import * as m from "../../src/shared/i18n/messages.generated";
import { CHECK_WORDS, MERGE_WORDS } from "../../src/shared/vocabulary";
import { scratchDir } from "../helpers/scratchDirs";
import { startContributionWorld } from "./contributionWorld";
import { cardBody } from "./frames";
import { seedGitHubSignIn, seedRepo, startGitHubStub } from "./githubStub";
import { launchApp, SHORT_TICK } from "./launch";
import { SPAWN_PROMPT_MARKER } from "./mockProvider";
import { seedHostedOrigins, seedProject } from "./projectSeed";
import { openProject, projectLine, projectSettings, taskBranch } from "./projects";
import { promptInput } from "./prompt";
import { readSavedData } from "./savedData";
import {
  GITHUB_CHANGE_PROMPT_MARKER,
  githubChange,
  MOCK_GITHUB_CHANGE_CARD_TITLE,
} from "./scenarios/githubChange";
import { ownBatch, ownBatchPrompt, ownBatchTask, ownBatchTitle } from "./scenarios/ownBatch";
import { completionAction, factsStrip, showCard, shownCard } from "./stack";
import { focusOn, pressKey, untilFocused } from "./windowKeys";

const git = (...args: string[]) => execFileSync("git", args, { stdio: "pipe" }).toString().trim();

const ADVISORY = ".github/workflows/early-tests.yml";
/**
 * The project's required workflow passed at the version while its advisory
 * one, a pilot it is still trying out, has not finished: each check names
 * its run's workflow file, as GitHub does on the run.
 */
const REQUIRED_PASSED_ADVISORY_RUNNING = [
  {
    name: "unit-tests",
    status: "completed",
    conclusion: "success",
    run: 1,
    workflow: ".github/workflows/ci.yml",
  },
  { name: "early-tests", status: "in_progress", conclusion: null, run: 2, workflow: ADVISORY },
];

const savedAdvisory = (userDataDir: string) =>
  readSavedData(userDataDir, (savedDb) => {
    const row = savedDb
      .prepare("SELECT advisory_workflows_json FROM repos WHERE id = ?")
      .get("repo-meterlab") as { advisory_workflows_json: string | null };
    return row.advisory_workflows_json
      ? (JSON.parse(row.advisory_workflows_json) as string[])
      : null;
  });

/**
 * docs/forge.md, "Advisory workflows".
 *
 * A project on GitHub stands in through a local stand-in GitHub that serves
 * the app's real sign-in, forge, workflow runs and merge, and every push
 * lands on a bare repository here; a scripted crewmate
 * (`scenarios/githubChange.ts`) commits, pushes, opens its pull request and
 * reads its checks with its own tools. Completion signals are the saved
 * project row, the merge card's checks cell and button, and the one merge
 * the stand-in records at the pushed version. Requires desktop Electron and
 * local git; no real sign-in or shared pull request.
 */
test("a project names an advisory workflow by keys, and a change merges while that workflow still runs", async () => {
  test.setTimeout(180_000);
  const userDataDir = scratchDir("infinitary-advisory-workflows-");
  const bare = join(userDataDir, "github-meterlab.git");
  const meterlab = join(userDataDir, "meterlab");
  const origin = "https://github.com/octo/meterlab.git";
  git("init", "--bare", "--initial-branch=main", bare);
  git("init", "--initial-branch=main", meterlab);
  git("-C", meterlab, "config", "user.name", "Test");
  git("-C", meterlab, "config", "user.email", "test@localhost");
  git("-C", meterlab, "commit", "--allow-empty", "-m", "chore: start the meter");
  git("-C", meterlab, "remote", "add", "origin", origin);
  git("-C", meterlab, "config", `url.${bare}.insteadOf`, origin);
  git("-C", meterlab, "push", "origin", "HEAD:refs/heads/main");
  // The folder knows origin's default branch the way a clone does, so the merge's refresh reads it.
  git("-C", meterlab, "fetch", "--quiet", "origin");
  git("-C", meterlab, "remote", "set-head", "origin", "--auto");
  const db = openDatabase(userDataDir);
  seedProject(db, {
    id: "repo-meterlab",
    path: meterlab,
    name: "meterlab",
    setupKind: "clone",
    origin,
    runsOn: null,
    delivery: "direct-pr",
    rigor: "quick",
  });
  db.close();
  seedGitHubSignIn(userDataDir);
  const github = await startGitHubStub();
  github.setChecks(REQUIRED_PASSED_ADVISORY_RUNNING);
  github.headOf((branch) => git("-C", bare, "rev-parse", `refs/heads/${branch}`));
  const launched = await launchApp({
    withMockProvider: true,
    scenarios: [githubChange],
    userDataDir,
    env: github.env,
  });
  try {
    const { page } = launched;

    // Settings → Projects: Advisory workflows follows Require pull request
    // checks, and takes a workflow file by keys.
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Projects", exact: true }).click();
    const header = projectLine(page, "repo-meterlab").getByRole("button");
    await expect(header).toBeVisible();
    await pressKey(header, "Enter");
    const row = projectSettings(page, "repo-meterlab");
    const require = row.getByRole("switch", { name: PROJECT_POLICY_WORDS.checksTitle });
    const field = row.getByRole("textbox", { name: PROJECT_POLICY_WORDS.advisoryLabel });
    await expect(row).toContainText(PROJECT_POLICY_WORDS.advisory);
    await focusOn(require);
    await pressKey(require, "Tab");
    await expect(field).toBeFocused();
    // A file outside .github/workflows names no workflow: the reason shows and nothing is saved.
    await field.pressSequentially("early-tests.yml");
    await expect(row).toContainText(PROJECT_POLICY_WORDS.advisoryInvalid);
    await pressKey(field, "Enter");
    await field.fill("");
    await field.pressSequentially(ADVISORY);
    await expect(row).not.toContainText(PROJECT_POLICY_WORDS.advisoryInvalid);
    expect(savedAdvisory(userDataDir)).toBeNull();
    await pressKey(field, "Enter");
    await expect.poll(() => savedAdvisory(userDataDir)).toEqual([ADVISORY]);
    // Escape goes back to the list, then closes Settings.
    await pressKey(field, "Escape");
    await page.keyboard.press("Escape");

    // A crewmate's change: its required check passed and the advisory
    // workflow's check is still running.
    const input = promptInput(page);
    await input.fill(`${SPAWN_PROMPT_MARKER} meterlab ${GITHUB_CHANGE_PROMPT_MARKER}`);
    await input.press("Enter");
    await expect(shownCard(page, MOCK_GITHUB_CHANGE_CARD_TITLE)).toBeVisible({ timeout: 90_000 });
    const board = await page.evaluate(() => window.infinitary.tasks.board());
    const taskId =
      board.tasks.find((task) => task.title.includes(GITHUB_CHANGE_PROMPT_MARKER))?.id ?? "";
    expect(taskId).not.toBe("");
    const branch = await taskBranch(page, taskId);
    const pushed = git("-C", bare, "rev-parse", `refs/heads/${branch}`);

    const facts = factsStrip(cardBody(page, MOCK_GITHUB_CHANGE_CARD_TITLE));
    await expect(facts.checks).toHaveText(CHECK_WORDS.green);
    // The checks cell's counts, on rest, name the advisory check and its own
    // state. Its unfinished workflow run is a row of its own, as any
    // unfinished run is, so the running advisory workflow counts twice.
    await pressKey(facts.change.locator("a"), "Shift+Tab");
    await untilFocused(facts.cell("checks"));
    await expect(facts.rest("checks")).toContainText(`2 ${advisoryCheckWords("pending")}`);
    const merge = page.getByRole("button", { name: MERGE_WORDS["merge-pr"], exact: true });
    await expect(merge).toBeVisible();
    await expect(
      page.getByRole("button", { name: MERGE_WORDS.whenChecksPass, exact: true }),
    ).toHaveCount(0);
    // Nothing watches the advisory check: the reading is green, with the check's own state kept.
    const delivery = () =>
      readSavedData(userDataDir, (savedDb) => new TaskStore(savedDb).get(taskId)?.delivery);
    expect(delivery()?.checks?.headSha).toBe(pushed);
    expect(delivery()?.checks?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "unit-tests", state: "success" }),
        expect.objectContaining({ name: "early-tests", state: "neutral", advisory: "pending" }),
      ]),
    );
    expect(delivery()?.ciWatch).toBeUndefined();

    await pressKey(merge, "Enter");
    await expect
      .poll(() => github.merges().map(({ number, sha }) => ({ number, sha })), { timeout: 30_000 })
      .toEqual([{ number: 100, sha: pushed }]);

    // Clearing the field names no advisory workflow again.
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Projects", exact: true }).click();
    await pressKey(projectLine(page, "repo-meterlab").getByRole("button"), "Enter");
    await expect(field).toHaveValue(ADVISORY);
    await field.fill("");
    await pressKey(field, "Enter");
    await expect.poll(() => savedAdvisory(userDataDir)).toBeNull();
  } finally {
    await launched.close();
    await github.close();
  }
});

/**
 * The batch pull request's own version, which GitHub checks apart from the
 * change's: the same two workflows in runs of their own, so only a reading
 * at the batch's version can tell which of its checks is advisory.
 */
const atBatch = (required: string, advisory: string) => [
  {
    name: "unit-tests",
    status: "completed",
    conclusion: required,
    run: 11,
    workflow: ".github/workflows/ci.yml",
  },
  { name: "early-tests", status: "completed", conclusion: advisory, run: 12, workflow: ADVISORY },
];

/**
 * The same goal for a batched project (docs/forge.md, "Batches of your
 * own"): the captain's merge click puts the change in line while its
 * advisory workflow still runs, and the batch pull request's own checks
 * decide the batch: it merges once its required check passed, with the
 * advisory one failed there, and holds on a failed required check, with
 * the advisory one passed. The batch crewmate is scripted
 * (`scenarios/ownBatch.ts`).
 */
for (const batchCase of [
  {
    name: "merges once its required check passed, with the advisory one failed",
    checks: atBatch("success", "failure"),
    merges: true,
  },
  {
    name: "holds on its failed required check, with the advisory one passed",
    checks: atBatch("failure", "success"),
    merges: false,
  },
]) {
  test(`a batched project's change goes in line while the advisory workflow still runs, and its batch ${batchCase.name}`, async () => {
    test.setTimeout(240_000);
    const userDataDir = scratchDir("infinitary-advisory-batch-");
    const { repoDir } = seedRepo(userDataDir);
    const repoGit = (...args: string[]) => git("-C", repoDir, ...args);
    const github = await startGitHubStub();
    github.headOf((branch) => repoGit("rev-parse", `refs/heads/${branch}`));
    // GitHub's merge moves the project's default branch; the project folder is its own mirror here.
    github.onPutIn((sha) => {
      repoGit("merge", "--ff-only", sha);
    });
    github.onBranchDelete((branch) => {
      repoGit("branch", "-D", branch);
    });
    github.setChecks(REQUIRED_PASSED_ADVISORY_RUNNING);
    github.setOpenedChecks(batchCase.checks);
    seedGitHubSignIn(userDataDir);
    const db = openDatabase(userDataDir);
    seedProject(db, {
      id: "repo-meterlab",
      path: repoDir,
      name: "meterlab",
      setupKind: "clone",
      origin: "https://github.com/o/meterlab.git",
      runsOn: null,
      delivery: "queue-pr",
      rigor: "quick",
    });
    seedHostedOrigins(db, userDataDir);
    db.close();
    const launched = await launchApp({
      withMockProvider: true,
      scenarios: [ownBatch],
      userDataDir,
      env: { ...github.env, ...SHORT_TICK },
    });
    try {
      const { page } = launched;
      // The setting Settings → Projects writes, through the same request.
      await page.evaluate(
        (advisory) =>
          window.infinitary.repos.configure("repo-meterlab", { advisoryWorkflows: [advisory] }),
        ADVISORY,
      );
      expect(savedAdvisory(userDataDir)).toEqual([ADVISORY]);

      const input = promptInput(page);
      await input.fill(ownBatchPrompt("meterlab", ["dates"]));
      await input.press("Enter");
      const title = ownBatchTitle("dates");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.infinitary.cards.list())).map((c) => c.title),
          { timeout: 120_000 },
        )
        .toContain(title);
      await showCard(page, title);
      await expect(
        page
          .locator("[data-card-layer]")
          .getByRole("button", { name: MERGE_WORDS.batch, exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await pressKey(await completionAction(page, title), "Enter");

      // The change goes in line and its batch of one opens.
      await expect.poll(() => github.pulls().length, { timeout: 30_000 }).toBe(1);
      if (!batchCase.merges) {
        const meterlab = async () =>
          (await page.evaluate(() => window.infinitary.repos.list())).find(
            (repo) => repo.id === "repo-meterlab",
          );
        await expect
          .poll(async () => (await meterlab())?.batch?.open?.hold, { timeout: 60_000 })
          .toMatchObject({ reason: "checks", checks: ["unit-tests"] });
        expect(github.merges()).toEqual([]);
        expect(github.pulls()[0]?.merged).toBe(false);
        return;
      }
      await expect.poll(() => github.pulls()[0]?.merged, { timeout: 60_000 }).toBe(true);
      const board = (await page.evaluate(() => window.infinitary.tasks.board())).tasks;
      const taskId =
        board.find((task) => task.title === ownBatchTask("meterlab", "dates"))?.id ?? "";
      await expect
        .poll(() => page.evaluate((id) => window.infinitary.tasks.detail(id), taskId), {
          timeout: 30_000,
        })
        .toMatchObject({ status: "done", closedReason: "merged" });
    } finally {
      await launched.close();
      await github.close();
    }
  });
}

/**
 * docs/forge.md, "Advisory workflows": the list belongs to the repository it
 * was chosen for, so Settings says before the change which control would
 * move the project to another repository and clear it. An imported fork that
 * contributes to its original (`contributionWorld.ts`) offers both: its
 * address and its Target project. Completion signals are the two notes and
 * the saved project's address and list. A list saved with a target change
 * names the repository the page showed, so it never lands on the other one,
 * and Settings says beside the field that the app refused it; a draft typed
 * for one repository is not offered for the other.
 */
test("Settings says before the change that another repository clears the advisory workflows", async () => {
  const world = await startContributionWorld(true);
  try {
    const { page } = world.app;
    const title = CONTRIBUTION_WORDS.destinationTitle(world.repo.name);
    await showCard(page, title);
    await shownCard(page, title)
      .getByRole("button", { name: CONTRIBUTION_WORDS.contribute, exact: true })
      .click();
    const saved = async () =>
      (await page.evaluate(() => window.infinitary.repos.list())).find(
        (repo) => repo.id === world.repo.id,
      );
    await expect.poll(async () => (await saved())?.origin).toBe(world.forge.upstream.clone_url);
    await page.evaluate(
      ({ id, advisory }) =>
        window.infinitary.repos.configure(id, {
          delivery: "direct-pr",
          advisoryWorkflows: [advisory],
        }),
      { id: world.repo.id, advisory: ADVISORY },
    );

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Projects", exact: true }).click();
    const row = await openProject(page, world.repo.id);
    const targetNote = row.getByText(PROJECT_POLICY_WORDS.advisoryClearsTarget, { exact: true });
    const addressNote = row.getByText(PROJECT_POLICY_WORDS.advisoryClearsAddress, { exact: true });
    const address = row.getByRole("textbox", {
      name: m.settingsProjectsOriginLabel(),
      exact: true,
    });
    await expect(
      row.getByRole("textbox", { name: PROJECT_POLICY_WORDS.advisoryLabel }),
    ).toHaveValue(ADVISORY);
    await expect(targetNote).toBeVisible();
    await expect(addressNote).toHaveCount(0);

    // The same repository, spelled another way, keeps the list; the fork's address would clear it.
    await address.fill("git@github.com:Examples/Project.git");
    await expect(addressNote).toHaveCount(0);
    await address.fill(world.forge.fork.clone_url);
    await expect(addressNote).toBeVisible();
    // An escape typed halfway names no repository yet: the page keeps taking
    // keys, and nothing is saved.
    await address.fill("https://github.com/examples/project%");
    await expect(addressNote).toBeVisible();
    await address.press("Backspace");
    await expect(address).toHaveValue("https://github.com/examples/project");
    await expect(addressNote).toHaveCount(0);
    expect((await saved())?.origin).toBe(world.forge.upstream.clone_url);
    expect((await saved())?.advisoryWorkflows).toEqual([ADVISORY]);
    await address.fill(world.forge.upstream.clone_url);
    await expect(addressNote).toHaveCount(0);

    const original = row.getByRole("radio", { name: CONTRIBUTION_WORDS.upstream, exact: true });
    await focusOn(original, { focusVisible: true });
    await pressKey(original, "ArrowRight");
    await expect(
      row.getByRole("radio", { name: CONTRIBUTION_WORDS.fork, exact: true }),
    ).toBeChecked();
    await expect.poll(async () => (await saved())?.origin).toBe(world.forge.fork.clone_url);
    expect((await saved())?.advisoryWorkflows).toBeUndefined();
    await expect(targetNote).toHaveCount(0);

    // Both land in one task, before Settings sends its batched changes, so
    // they reach the app as one save.
    const advisory = row.getByRole("textbox", { name: PROJECT_POLICY_WORDS.advisoryLabel });
    await advisory.fill(ADVISORY);
    const form = await advisory.evaluateHandle((input) => (input as HTMLInputElement).form);
    const toOriginal = await original.elementHandle();
    await page.evaluate(
      ([saving, choosing]) => {
        saving?.requestSubmit();
        (choosing as HTMLInputElement | null)?.click();
      },
      [form, toOriginal] as const,
    );
    await expect.poll(async () => (await saved())?.origin).toBe(world.forge.upstream.clone_url);
    expect((await saved())?.advisoryWorkflows).toBeUndefined();
    await expect(
      row.getByText(PROJECT_POLICY_WORDS.refused("advisory-moved"), { exact: true }),
    ).toBeVisible();

    // Neither repository has a list saved, so only the draft's own
    // repository tells them apart.
    await advisory.fill(ADVISORY);
    await focusOn(original, { focusVisible: true });
    await pressKey(original, "ArrowRight");
    await expect.poll(async () => (await saved())?.origin).toBe(world.forge.fork.clone_url);
    await expect(advisory).toHaveValue("");
    await expect(
      row
        .locator("form")
        .filter({ has: page.getByRole("textbox", { name: PROJECT_POLICY_WORDS.advisoryLabel }) })
        .getByRole("button", { name: m.settingsProjectsFolderSave(), exact: true }),
    ).toBeDisabled();
    await advisory.fill(ADVISORY);
    await advisory.press("Enter");
    await expect.poll(async () => (await saved())?.advisoryWorkflows).toEqual([ADVISORY]);
  } finally {
    await world.close();
  }
});
