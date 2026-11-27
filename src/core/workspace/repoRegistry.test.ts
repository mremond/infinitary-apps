import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { contributorDisclosureLine } from "@shared/contributorDisclosure";
import { AUTOMATIC_COMPUTER } from "@shared/placement";
import {
  ADVISORY_WORKFLOWS_MOVED_REFUSAL,
  ADVISORY_WORKFLOWS_REFUSAL,
  BATCH_HOST_REFUSAL,
  BATCHES_OFF_REFUSAL,
  NO_CHECKS_REFUSAL,
  repoPolicyPatchSchema,
} from "@shared/repos";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { PERSONAL_WORKSPACE_NAME } from "../paths";
import { openInMemoryDatabase } from "../storage/db";
import { ProjectStore } from "../storage/projectStore";
import { SettingsStore } from "../storage/settingsStore";
import { APP_GIT_IDENTITY, git } from "./git";
import { RepoRegistry } from "./repoRegistry";
import { seedProject } from "./seedProject";

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

/**
 * The personal workspace as a managed repo (talk-to-personalize Step 4):
 * registered on first need at the seeder's directory on the live posture
 * with autonomy on, born with its project, and guarded - its posture never
 * changes, no other repo takes it, and it is never unregistered.
 */
function setup() {
  const db = openInMemoryDatabase();
  const fleetRoot = scratchDir("infinitary-fleet-");
  const workspaceDir = join(fleetRoot, PERSONAL_WORKSPACE_NAME);
  mkdirSync(workspaceDir, { recursive: true });
  execFileSync("git", ["-C", workspaceDir, "init", "-q", "-b", "main"]);
  return { db, registry: new RepoRegistry(db, fleetRoot), workspaceDir, fleetRoot };
}

describe("RepoRegistry.setup initial history", () => {
  let db: ReturnType<typeof openInMemoryDatabase>;
  let registry: RepoRegistry;

  beforeEach(() => {
    vi.stubEnv("HOME", scratchDir("infinitary-git-home-"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    db = openInMemoryDatabase();
    registry = new RepoRegistry(db, scratchDir("infinitary-fleet-"));
  });

  afterEach(() => {
    db.close();
    vi.unstubAllEnvs();
  });

  // The review of INF-5409: the first launch asks whether a project was added with one row's read.
  it("says a project was added once the captain adds one", async () => {
    expect(registry.hasProject()).toBe(false);
    await registry.setup({ kind: "init", name: "observatory" });
    expect(registry.hasProject()).toBe(true);
  });

  it("INF-1117: saves, preserves and clears the captain's project scope", async () => {
    const { repo } = await registry.setup({ kind: "init", name: "observatory" });
    const scope =
      "Tools and dashboards for our astronomy club.\nPublic website work stays elsewhere.";
    expect(repo.scope).toBeNull();
    registry.configure(repo.id, { scope });
    expect(new RepoRegistry(db, scratchDir("infinitary-reloaded-fleet-")).get(repo.id)?.scope).toBe(
      scope,
    );
    registry.configure(repo.id, { autonomy: true });
    expect(registry.get(repo.id)?.scope).toBe(scope);
    registry.configure(repo.id, { scope: null });
    expect(registry.get(repo.id)?.scope).toBeNull();
  });

  // The captain's ask on the fork-review disclosure: a per-project setting,
  // on by default, that can be turned off or given another line.
  it("keeps a project's line saying a crewmate wrote it: default, own line, off, default again", async () => {
    const { repo } = await registry.setup({ kind: "init", name: "observatory" });
    const reload = () =>
      new RepoRegistry(db, scratchDir("infinitary-reloaded-fleet-")).get(repo.id);
    expect(contributorDisclosureLine(reload())).toBe(
      "_Written by an Infinitary crewmate, an AI agent working for this project's maintainer._",
    );
    registry.configure(repo.id, { contributorDisclosure: "Posted by our club's AI crew." });
    expect(contributorDisclosureLine(reload())).toBe("Posted by our club's AI crew.");
    registry.configure(repo.id, { autonomy: true });
    expect(contributorDisclosureLine(reload())).toBe("Posted by our club's AI crew.");
    registry.configure(repo.id, { contributorDisclosure: "" });
    expect(contributorDisclosureLine(reload())).toBeUndefined();
    registry.configure(repo.id, { contributorDisclosure: null });
    expect(reload()?.contributorDisclosure).toBeUndefined();
    expect(contributorDisclosureLine(reload())).toContain("Infinitary crewmate");
  });

  it("adopts an unborn repo without committing or changing its staged files", async () => {
    const dir = scratchDir("infinitary-staged-");
    await git(dir, ["init", "-q", "-b", "main"]);
    writeFileSync(join(dir, "partial.txt"), "staged version\n");
    writeFileSync(join(dir, "removed.txt"), "staged but removed from working folder\n");
    await git(dir, ["add", "partial.txt", "removed.txt"]);
    writeFileSync(join(dir, "partial.txt"), "unstaged version\n");
    unlinkSync(join(dir, "removed.txt"));
    writeFileSync(join(dir, "untracked.txt"), "untracked content\n");
    const staged = await git(dir, ["ls-files", "--stage", "-z"], { trim: false });
    const status = await git(dir, ["status", "--short"], { trim: false });

    const result = await registry.setup({ kind: "adopt", path: dir });

    expect(result).toMatchObject({ created: true, createdInitialCommit: true });
    expect(result.initializedGit).toBeUndefined();
    expect(await git(dir, ["ls-tree", "-r", "--name-only", "HEAD"])).toBe("");
    expect(await git(dir, ["rev-list", "--count", "HEAD"])).toBe("1");
    expect(await git(dir, ["ls-files", "--stage", "-z"], { trim: false })).toBe(staged);
    expect(await git(dir, ["status", "--short"], { trim: false })).toBe(status);
    expect(await git(dir, ["show", ":partial.txt"])).toBe("staged version");
    expect(readFileSync(join(dir, "partial.txt"), "utf8")).toBe("unstaged version\n");
    expect(readFileSync(join(dir, "untracked.txt"), "utf8")).toBe("untracked content\n");

    // The initial history is usable, but the person's files stay out of a task checkout.
    const worktree = join(scratchDir("infinitary-checkout-"), "task");
    await git(dir, ["worktree", "add", "-b", "task", worktree, "HEAD"]);
    expect(readdirSync(worktree)).toEqual([".git"]);
    await git(dir, ["worktree", "remove", worktree]);
    const head = await git(dir, ["rev-parse", "HEAD"]);
    expect(await registry.setup({ kind: "adopt", path: dir })).toEqual({
      repo: result.repo,
      created: false,
    });
    expect(await git(dir, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(dir, ["ls-files", "--stage", "-z"], { trim: false })).toBe(staged);
  });

  it("initializes a plain folder without adding its existing files", async () => {
    const dir = scratchDir("infinitary-plain-");
    writeFileSync(join(dir, "notes.txt"), "existing notes\n");
    const result = await registry.setup({ kind: "adopt", path: dir });
    expect(result).toMatchObject({ initializedGit: true, createdInitialCommit: true });
    expect(await git(dir, ["ls-tree", "-r", "--name-only", "HEAD"])).toBe("");
    expect(await git(dir, ["ls-files", "--stage"])).toBe("");
    expect(await git(dir, ["status", "--short"])).toBe("?? notes.txt");
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("existing notes\n");
  });

  it("leaves existing history and pending changes untouched", async () => {
    const dir = scratchDir("infinitary-history-");
    await git(dir, ["init", "-q", "-b", "main"]);
    writeFileSync(join(dir, "notes.txt"), "committed notes\n");
    await git(dir, ["add", "notes.txt"]);
    await git(dir, [...APP_GIT_IDENTITY, "commit", "-m", "chore: existing history"]);
    writeFileSync(join(dir, "notes.txt"), "staged notes\n");
    await git(dir, ["add", "notes.txt"]);
    writeFileSync(join(dir, "notes.txt"), "unstaged notes\n");
    const head = await git(dir, ["rev-parse", "HEAD"]);
    const staged = await git(dir, ["ls-files", "--stage"]);
    const result = await registry.setup({ kind: "adopt", path: dir });
    expect(result.createdInitialCommit).toBeUndefined();
    expect(await git(dir, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(dir, ["ls-files", "--stage"])).toBe(staged);
    expect(await git(dir, ["show", "HEAD:notes.txt"])).toBe("committed notes");
    expect(await git(dir, ["show", ":notes.txt"])).toBe("staged notes");
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("unstaged notes\n");
  });

  it.each(["init", "clone"] as const)("seeds empty history for %s too", async (kind) => {
    const source = scratchDir("infinitary-empty-remote-");
    await git(source, ["init", "--bare", "-q", "-b", "main"]);
    const result = await registry.setup(
      kind === "init" ? { kind, name: "new-project" } : { kind, origin: source },
    );
    expect(result.createdInitialCommit).toBe(true);
    expect(await git(result.repo.path, ["rev-list", "--count", "HEAD"])).toBe("1");
    expect(await git(result.repo.path, ["ls-tree", "-r", "--name-only", "HEAD"])).toBe("");
    expect(await git(result.repo.path, ["status", "--short"])).toBe("");
  });
});

describe("RepoRegistry.ensurePersonal", () => {
  it("registers the workspace once, as the personal kind, autonomous, with a project of its own", () => {
    const { db, registry, workspaceDir } = setup();
    expect(registry.personal()).toBeUndefined();
    const repo = registry.ensurePersonal(workspaceDir);
    expect(repo).toMatchObject({
      name: PERSONAL_WORKSPACE_NAME,
      path: workspaceDir,
      setupKind: "init",
      origin: null,
      kind: "personal",
      delivery: "local-only",
      autonomy: true,
    });
    expect(registry.ensurePersonal(workspaceDir)).toEqual(repo);
    expect(registry.list()).toHaveLength(1);
    // The personal workspace is not a project the captain added (the first launch's `hasPriorActivity`).
    expect(registry.hasProject()).toBe(false);
    expect(registry.get(repo.id)).toEqual(repo);
    expect(registry.personal()).toEqual(repo);
    const project = new ProjectStore(db).list().find((row) => row.repoId === repo.id);
    expect(project?.name).toBe(PERSONAL_WORKSPACE_NAME);
  });

  it("refuses every policy patch on the personal workspace and never unregisters it", async () => {
    const { registry, workspaceDir, fleetRoot } = setup();
    const personal = registry.ensurePersonal(workspaceDir);
    // One message for the whole patch: the personal workspace is a
    // workspace kind, so delivery, autonomy and rigor are not questions it
    // answers.
    for (const patch of [
      { delivery: "direct-pr" as const },
      { autonomy: false },
      { rigor: "standard" as const },
      { scope: "Not for personal work" },
      { delivery: "local-only" as const, autonomy: true },
    ]) {
      expect(() => registry.configure(personal.id, patch)).toThrow(
        "The personal workspace builds in place; its delivery, autonomy and rigor cannot change.",
      );
    }
    expect(registry.get(personal.id)).toMatchObject({ kind: "personal", autonomy: true });
    expect(() => registry.unregister(personal.id)).toThrow(/personalize/);
    expect(registry.get(personal.id)).toBeDefined();

    const other = await registry.setup({ kind: "init", name: "notes" });
    expect(other.repo.path).toBe(join(fleetRoot, "notes"));
    expect(other.repo.kind).toBe("project");
    expect(registry.configure(other.repo.id, { delivery: "direct-pr" })).toMatchObject({
      kind: "project",
      delivery: "direct-pr",
    });
    await expect(registry.setup({ kind: "init", name: PERSONAL_WORKSPACE_NAME })).rejects.toThrow(
      /already exists/,
    );
  });
});

/**
 * A project's Runs on (docs/helper.md, "Runs on"): a computer that runs work
 * by its id, or null for this Mac, kept with the project; the personal
 * workspace and a project with no origin run only here.
 */
describe("RepoRegistry.setRunsOn", () => {
  it("keeps where a project with an origin runs, and refuses one that runs only here", async () => {
    const { registry, workspaceDir } = setup();
    const elsewhere = scratchDir("infinitary-runs-on-");
    const origin = join(elsewhere, "origin.git");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
    const website = join(elsewhere, "website");
    execFileSync("git", ["clone", "-q", origin, website]);
    const { repo } = await registry.setup({ kind: "adopt", path: website });
    expect(repo.runsOn).toBe(AUTOMATIC_COMPUTER);
    expect(registry.setRunsOn(repo.id, "mini-1")).toMatchObject({ runsOn: "mini-1" });
    expect(registry.get(repo.id)?.runsOn).toBe("mini-1");
    expect(registry.list().find((entry) => entry.id === repo.id)?.runsOn).toBe("mini-1");
    expect(registry.setRunsOn(repo.id, null).runsOn).toBeNull();

    const notes = await registry.setup({ kind: "init", name: "notes" });
    expect(() => registry.setRunsOn(notes.repo.id, "mini-1")).toThrow(
      "notes: Kept on this computer only, so its tasks run there.",
    );
    expect(registry.setRunsOn(notes.repo.id, null).runsOn).toBeNull();
    const personal = registry.ensurePersonal(workspaceDir);
    expect(() => registry.setRunsOn(personal.id, "mini-1")).toThrow(
      "The personal workspace stays on this computer.",
    );
    expect(registry.get(personal.id)?.runsOn).toBeNull();
  });
});

/**
 * Batched pull requests (INF-2430 piece 2; review INF-2549): only a project
 * on a host where the app can open and merge a batch pull request (GitHub,
 * GitLab and, since INF-5186 piece 5, Bitbucket) takes them, so a new
 * address is checked against the delivery the project would have, whether
 * the same patch chooses it or it was chosen before.
 */
describe("RepoRegistry delivery through batched pull requests", () => {
  it("refuses an address that would leave a queue-pr project on a host that takes no batch pull request, in the same patch or later", async () => {
    const { registry } = setup();
    const { repo } = await registry.setup({ kind: "init", name: "meter" });
    const github = "https://github.com/o/meter.git";
    const gitlab = "https://gitlab.com/o/meter.git";
    const bitbucket = "https://bitbucket.org/o/meter.git";
    const plain = "https://git.example.com/o/meter.git";
    const refusal = BATCH_HOST_REFUSAL;
    expect(() => registry.configure(repo.id, { delivery: "queue-pr", origin: plain })).toThrow(
      refusal,
    );
    expect(registry.get(repo.id)?.origin).toBeNull();
    expect(registry.configure(repo.id, { delivery: "queue-pr", origin: github })).toMatchObject({
      delivery: "queue-pr",
      host: { kind: "github" },
    });
    expect(registry.configure(repo.id, { origin: gitlab })).toMatchObject({
      delivery: "queue-pr",
      host: { kind: "gitlab" },
    });
    expect(registry.configure(repo.id, { origin: bitbucket })).toMatchObject({
      delivery: "queue-pr",
      host: { kind: "bitbucket" },
    });
    expect(() => registry.configure(repo.id, { origin: plain })).toThrow(refusal);
    expect(() => registry.configure(repo.id, { origin: null })).toThrow(refusal);
    expect(registry.get(repo.id)).toMatchObject({ origin: bitbucket, delivery: "queue-pr" });
    expect(registry.configure(repo.id, { delivery: "direct-pr", origin: plain })).toMatchObject({
      delivery: "direct-pr",
      host: { kind: "git" },
    });
  });
});

/**
 * Batched pull requests off by default (INF-4754, the captain's ask): while
 * no runbook that is on offers them, a project cannot newly choose them and
 * its view says so, while a project already on them keeps them and its other
 * settings still change.
 */
describe("RepoRegistry while Batched pull requests is off", () => {
  it("refuses newly choosing batched pull requests, but leaves a batched project's other settings changeable", async () => {
    const db = openInMemoryDatabase();
    let offered = false;
    const registry = new RepoRegistry(db, scratchDir("infinitary-fleet-"), {
      batchesOffered: () => offered,
    });
    const { repo } = await registry.setup({ kind: "init", name: "meter" });
    registry.configure(repo.id, {
      origin: "https://github.com/o/meter.git",
      delivery: "direct-pr",
    });
    expect(registry.get(repo.id)).toMatchObject({ batchesOffered: false });
    expect(() => registry.configure(repo.id, { delivery: "queue-pr" })).toThrow(
      BATCHES_OFF_REFUSAL,
    );
    expect(registry.get(repo.id)?.delivery).toBe("direct-pr");
    offered = true;
    expect(registry.list()[0]).toMatchObject({ batchesOffered: true });
    expect(registry.configure(repo.id, { delivery: "queue-pr" }).delivery).toBe("queue-pr");
    // A project still batching after the runbook went off keeps every other setting.
    offered = false;
    expect(registry.configure(repo.id, { rigor: "reviewed", delivery: "queue-pr" })).toMatchObject({
      delivery: "queue-pr",
      rigor: "reviewed",
    });
    expect(registry.configure(repo.id, { autonomy: true }).autonomy).toBe(true);
  });
});

/**
 * Require pull request checks (INF-2114): the captain's question under its
 * merge card, "this probably doesn't make sense when the repo chose to
 * deliver through local merges only", answered by refusing the record on a
 * project that, as the patch leaves it, reads no pull request checks.
 */
describe("RepoRegistry's record that a project runs no pull request checks", () => {
  it("turns Require pull request checks off only where the project's changes go through pull requests on GitHub or GitLab", async () => {
    const { registry } = setup();
    const { repo } = await registry.setup({ kind: "init", name: "meter" });
    expect(() => registry.configure(repo.id, { requireChecks: false })).toThrow(NO_CHECKS_REFUSAL);
    registry.configure(repo.id, {
      origin: "https://git.example.org/o/meter.git",
      delivery: "direct-pr",
    });
    expect(() => registry.configure(repo.id, { requireChecks: false })).toThrow(NO_CHECKS_REFUSAL);
    expect(
      registry.configure(repo.id, {
        origin: "https://github.com/o/meter.git",
        requireChecks: false,
      }).noChecks,
    ).toEqual({ at: expect.any(Number) });
    // A local merge reads no checks, so it cannot turn it off; turning it on still ends the record.
    registry.configure(repo.id, { delivery: "local-only" });
    expect(() => registry.configure(repo.id, { requireChecks: false })).toThrow(NO_CHECKS_REFUSAL);
    expect(
      registry.configure(repo.id, { requireChecks: true, delivery: "direct-pr" }).noChecks,
    ).toBeUndefined();
    expect(() =>
      registry.configure(repo.id, { requireChecks: false, delivery: "local-only" }),
    ).toThrow(NO_CHECKS_REFUSAL);
    expect(registry.get(repo.id)?.delivery).toBe("direct-pr");
    expect(registry.get(repo.id)?.noChecks).toBeUndefined();
  });
});

// docs/forge.md, "Advisory workflows".
describe("RepoRegistry's advisory workflows", () => {
  it("keeps a GitHub project's advisory workflow files, clears them, and refuses them where no pull request names its workflow", async () => {
    const { db, registry } = setup();
    const { repo } = await registry.setup({ kind: "init", name: "meter" });
    const reload = () =>
      new RepoRegistry(db, scratchDir("infinitary-reloaded-fleet-")).get(repo.id);
    const pilot = [".github/workflows/early-tests.yml"];
    expect(() => registry.configure(repo.id, { advisoryWorkflows: pilot })).toThrow(
      ADVISORY_WORKFLOWS_REFUSAL,
    );
    registry.configure(repo.id, {
      origin: "https://gitlab.com/o/meter.git",
      delivery: "direct-pr",
    });
    expect(() => registry.configure(repo.id, { advisoryWorkflows: pilot })).toThrow(
      ADVISORY_WORKFLOWS_REFUSAL,
    );
    expect(
      registry.configure(repo.id, {
        origin: "https://github.com/o/meter.git",
        advisoryWorkflows: pilot,
      }).advisoryWorkflows,
    ).toEqual(pilot);
    registry.configure(repo.id, { autonomy: true });
    expect(reload()?.advisoryWorkflows).toEqual(pilot);
    // A local merge reads no checks, so it cannot take the list, and the list stays as it was.
    expect(() =>
      registry.configure(repo.id, { advisoryWorkflows: pilot, delivery: "local-only" }),
    ).toThrow(ADVISORY_WORKFLOWS_REFUSAL);
    expect(reload()?.delivery).toBe("direct-pr");
    expect(
      registry.configure(repo.id, { advisoryWorkflows: [] }).advisoryWorkflows,
    ).toBeUndefined();
    expect(reload()?.advisoryWorkflows).toBeUndefined();
  });

  it("keeps the list when the project's address is spelled another way, and drops it for another repository", async () => {
    const { registry } = setup();
    const { repo } = await registry.setup({ kind: "init", name: "meter" });
    const pilot = [".github/workflows/early-tests.yml"];
    registry.configure(repo.id, {
      origin: "https://github.com/example-studio/meter.git",
      delivery: "direct-pr",
      advisoryWorkflows: pilot,
    });
    expect(
      registry.configure(repo.id, { origin: "git@github.com:Example-Studio/meter.git" })
        .advisoryWorkflows,
    ).toEqual(pilot);
    expect(
      registry.configure(repo.id, { origin: "https://github.com/example-studio/meter-next.git" })
        .advisoryWorkflows,
    ).toBeUndefined();
    // A list sent with the new address is chosen for it.
    expect(
      registry.configure(repo.id, {
        origin: "https://github.com/example-studio/meter.git",
        advisoryWorkflows: pilot,
      }).advisoryWorkflows,
    ).toEqual(pilot);
  });

  // A list Settings or the first mate named for one repository, sent after
  // the project moved to another, as a save queued behind a target change is.
  it("refuses a list named for a repository the project no longer uses, however that address is spelled", async () => {
    const { registry } = setup();
    const { repo } = await registry.setup({ kind: "init", name: "meter" });
    const pilot = [".github/workflows/early-tests.yml"];
    const fork = "https://github.com/someone/meter.git";
    const original = "https://github.com/example-studio/meter.git";
    registry.configure(repo.id, { origin: fork, delivery: "direct-pr" });
    registry.configure(repo.id, { origin: original });
    expect(() =>
      registry.configure(repo.id, { advisoryWorkflows: pilot, advisoryWorkflowsAt: fork }),
    ).toThrow(ADVISORY_WORKFLOWS_MOVED_REFUSAL);
    expect(registry.get(repo.id)?.advisoryWorkflows).toBeUndefined();
    // One patch moving the project and naming the list for where it was is refused whole.
    expect(() =>
      registry.configure(repo.id, {
        origin: fork,
        advisoryWorkflows: pilot,
        advisoryWorkflowsAt: original,
      }),
    ).toThrow(ADVISORY_WORKFLOWS_MOVED_REFUSAL);
    expect(registry.get(repo.id)?.origin).toBe(original);
    expect(
      registry.configure(repo.id, {
        advisoryWorkflows: pilot,
        advisoryWorkflowsAt: "git@github.com:Example-Studio/meter.git",
      }).advisoryWorkflows,
    ).toEqual(pilot);
  });

  it("refuses a file that names no workflow, and a file named twice", () => {
    for (const advisoryWorkflows of [
      ["early-tests.yml"],
      [".github/workflows/nested/early-tests.yml"],
      [".github/workflows/early-tests.yml", ".github/workflows/early-tests.yml"],
    ])
      expect(repoPolicyPatchSchema.safeParse({ advisoryWorkflows }).success).toBe(false);
    expect(
      repoPolicyPatchSchema.safeParse({ advisoryWorkflows: [".github/workflows/early-tests.yaml"] })
        .success,
    ).toBe(true);
  });
});

/**
 * A host on the person's own server (`docs/forge.md`, "Hosts on your own
 * server"): a project there is a plain Git host until the app knows the
 * host, then the kind it runs - stamped at setup once known, and stamped
 * once it becomes known, never back.
 */
describe("RepoRegistry on a host on the person's own server", () => {
  it("stamps a project there the host's kind once the app knows it, and never stamps it back", async () => {
    const db = openInMemoryDatabase();
    let known: { host: string; kind: "github" }[] = [];
    const registry = new RepoRegistry(db, scratchDir("infinitary-fleet-"), {
      knownHosts: () => known,
    });
    const adopt = async (name: string, origin: string) => {
      const dir = join(scratchDir("infinitary-known-host-"), name);
      execFileSync("git", ["init", "-q", "-b", "main", dir]);
      execFileSync("git", ["-C", dir, "remote", "add", "origin", origin]);
      return (await registry.setup({ kind: "adopt", path: dir })).repo;
    };
    const meter = await adopt("meter", "https://github.corp.example/acme/meter.git");
    const ledger = await adopt("ledger", "https://octo.ghe.com/acme/ledger.git");
    const notes = await adopt("notes", "https://git.example.com/me/notes.git");
    expect(meter.host).toEqual({ kind: "git", name: "github.corp.example" });
    expect(ledger.host).toEqual({ kind: "github", name: "octo.ghe.com" });

    known = [{ host: "github.corp.example", kind: "github" }];
    expect(registry.stampKnownHosts(known)).toBe(1);
    expect(registry.get(meter.id)?.host).toEqual({ kind: "github", name: "github.corp.example" });
    expect(registry.get(notes.id)?.host).toEqual({ kind: "git", name: "git.example.com" });
    const website = await adopt("website", "git@github.corp.example:acme/website.git");
    expect(website.host).toEqual({ kind: "github", name: "github.corp.example" });

    // The host stays what it is once the app no longer holds a sign-in there.
    known = [];
    expect(registry.stampKnownHosts(known)).toBe(0);
    expect(registry.get(meter.id)?.host?.kind).toBe("github");
  });
});

/**
 * Where new projects go (Settings -> Projects): clone and init create their
 * directories in the folder the person chose, the fleet root indexes each
 * by a link the way it indexes an adopted folder, and projects already set
 * up never move. The choice is persisted in the settings rows, so another
 * registry over the same database - the next launch - reads it.
 */
describe("RepoRegistry projects folder", () => {
  let db: ReturnType<typeof openInMemoryDatabase>;
  let appData: string;
  let fleetRoot: string;
  let chosen: string;

  const registryOn = () =>
    new RepoRegistry(db, fleetRoot, { settings: new SettingsStore(db), appDataDir: appData });

  beforeEach(() => {
    vi.stubEnv("HOME", scratchDir("infinitary-git-home-"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    db = openInMemoryDatabase();
    appData = realpathSync(scratchDir("infinitary-app-data-"));
    fleetRoot = join(appData, "fleet");
    chosen = realpathSync(scratchDir("infinitary-projects-"));
  });

  afterEach(() => {
    db.close();
    vi.unstubAllEnvs();
  });

  it("starts at the fleet root, and new projects there are real directories", async () => {
    const registry = registryOn();
    expect(registry.projectsFolder()).toEqual({ path: fleetRoot, custom: false });
    const { repo } = await registry.setup({ kind: "init", name: "plain" });
    expect(repo.path).toBe(join(fleetRoot, "plain"));
    expect(lstatSync(repo.path).isDirectory()).toBe(true);
  });

  it("clones and creates new projects in the chosen folder, linked from the fleet root", async () => {
    const origin = scratchDir("infinitary-origin-");
    await git(origin, ["init", "-q", "-b", "main"]);
    await git(origin, [...APP_GIT_IDENTITY, "commit", "-q", "--allow-empty", "-m", "chore: init"]);
    const registry = registryOn();
    const before = await registry.setup({ kind: "init", name: "older" });

    expect(registry.setProjectsFolder(chosen)).toEqual({ path: chosen, custom: true });
    expect(registryOn().projectsFolder()).toEqual({ path: chosen, custom: true });

    const created = await registryOn().setup({ kind: "init", name: "nebula" });
    const cloned = await registryOn().setup({ kind: "clone", origin });
    for (const repo of [created.repo, cloned.repo]) {
      expect(repo.path).toBe(join(chosen, repo.name));
      expect(lstatSync(repo.path).isDirectory()).toBe(true);
      expect(existsSync(join(repo.path, ".git"))).toBe(true);
      const link = join(fleetRoot, repo.name);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe(repo.path);
    }
    expect(created.repo.setupKind).toBe("init");
    expect(cloned.repo).toMatchObject({ setupKind: "clone", origin, delivery: "direct-pr" });
    expect(registry.get(before.repo.id)?.path).toBe(join(fleetRoot, "older"));
    expect(lstatSync(join(fleetRoot, "older")).isDirectory()).toBe(true);

    expect(registry.setProjectsFolder(null)).toEqual({ path: fleetRoot, custom: false });
    const after = await registry.setup({ kind: "init", name: "later" });
    expect(after.repo.path).toBe(join(fleetRoot, "later"));
    expect(registry.get(created.repo.id)?.path).toBe(join(chosen, "nebula"));
  });

  it("never takes a folder already in the chosen one, and adopting from it keeps the name", async () => {
    const registry = registryOn();
    registry.setProjectsFolder(chosen);
    mkdirSync(join(chosen, "taken"));
    writeFileSync(join(chosen, "taken", "mine.txt"), "the person's own\n");

    await expect(registry.setup({ kind: "init", name: "taken" })).rejects.toThrow(/already exists/);
    const origin = scratchDir("infinitary-origin-");
    await git(origin, ["init", "-q", "-b", "main"]);
    const cloned = await registry.setup({ kind: "clone", origin, name: "taken" });
    expect(cloned.repo.path).toBe(join(chosen, "taken-2"));
    expect(readFileSync(join(chosen, "taken", "mine.txt"), "utf8")).toBe("the person's own\n");

    mkdirSync(join(chosen, "sketches"));
    const adopted = await registry.setup({ kind: "adopt", path: join(chosen, "sketches") });
    expect(adopted.repo).toMatchObject({ name: "sketches", path: join(chosen, "sketches") });
  });

  it("unregistering drops only the fleet-root link and keeps the directory", async () => {
    const registry = registryOn();
    registry.setProjectsFolder(chosen);
    const { repo } = await registry.setup({ kind: "init", name: "keepme" });
    registry.unregister(repo.id);
    expect(existsSync(join(fleetRoot, "keepme"))).toBe(false);
    expect(lstatSync(join(chosen, "keepme")).isDirectory()).toBe(true);
    expect(existsSync(join(chosen, "keepme", ".git"))).toBe(true);
  });

  it("refuses a folder that is not there any more instead of making it anew", async () => {
    const registry = registryOn();
    const gone = join(chosen, "drive");
    mkdirSync(gone);
    registry.setProjectsFolder(gone);
    rmSync(gone, { recursive: true });
    await expect(registry.setup({ kind: "init", name: "lost" })).rejects.toThrow(
      `The folder chosen for new projects, ${gone}, is not there.`,
    );
    expect(existsSync(gone)).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it("refuses folders new projects cannot go in, with a reason, and keeps the choice", async () => {
    const registry = registryOn();
    registry.setProjectsFolder(chosen);
    const project = await registry.setup({ kind: "init", name: "home-base" });
    mkdirSync(join(appData, "worktrees"), { recursive: true });

    expect(() => registry.setProjectsFolder("code")).toThrow(/full path/);
    expect(() => registry.setProjectsFolder(join(chosen, "missing"))).toThrow(
      `No folder exists at ${join(chosen, "missing")}.`,
    );
    expect(() => registry.setProjectsFolder(join(appData, "worktrees"))).toThrow(
      "inside Infinitary's own data",
    );
    expect(() => registry.setProjectsFolder(appData)).toThrow("inside Infinitary's own data");
    const inside = join(project.repo.path, "nested");
    mkdirSync(inside);
    expect(() => registry.setProjectsFolder(inside)).toThrow(
      `${inside} is inside your project home-base.`,
    );
    if (process.getuid?.() !== 0) {
      const locked = join(chosen, "locked");
      mkdirSync(locked);
      chmodSync(locked, 0o500);
      try {
        expect(() => registry.setProjectsFolder(locked)).toThrow(/cannot add anything/);
      } finally {
        chmodSync(locked, 0o700);
      }
    }
    expect(registry.projectsFolder()).toEqual({ path: chosen, custom: true });

    // Choosing the fleet root itself is the default, not a custom folder.
    expect(registry.setProjectsFolder(fleetRoot)).toEqual({ path: fleetRoot, custom: false });
  });
});

/**
 * A task key chosen when a project is added (FI3-1787, step 4 of the
 * Infinitary rename): Settings' Add project and the setup card pass it, the
 * project's tasks are numbered with it, and a key that cannot be its is
 * refused in words before anything is cloned, created or linked.
 */
describe("RepoRegistry chosen task key", () => {
  let db: ReturnType<typeof openInMemoryDatabase>;
  let fleetRoot: string;
  let registry: RepoRegistry;
  let projects: ProjectStore;

  const keyOf = (repoId: string) => projects.forRepo(repoId)?.key;

  beforeEach(() => {
    vi.stubEnv("HOME", scratchDir("infinitary-git-home-"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    db = openInMemoryDatabase();
    fleetRoot = scratchDir("infinitary-fleet-");
    registry = new RepoRegistry(db, fleetRoot);
    projects = new ProjectStore(db);
  });

  afterEach(() => {
    db.close();
    vi.unstubAllEnvs();
  });

  it("numbers a new project's tasks with the key chosen for it, by every way of adding", async () => {
    const origin = scratchDir("infinitary-origin-");
    await git(origin, ["init", "-q", "-b", "main"]);
    await git(origin, [...APP_GIT_IDENTITY, "commit", "-q", "--allow-empty", "-m", "chore: init"]);
    const folder = scratchDir("infinitary-adopt-");

    const derived = await registry.setup({ kind: "init", name: "infinitary" });
    expect(keyOf(derived.repo.id)).toBe("INFI");
    const created = await registry.setup({ kind: "init", name: "infinitary-app", key: " inf " });
    const cloned = await registry.setup({ kind: "clone", origin, key: "web" });
    const adopted = await registry.setup({ kind: "adopt", path: folder, key: "N0TE" });
    expect([created, cloned, adopted].map(({ repo }) => keyOf(repo.id))).toEqual([
      "INF",
      "WEB",
      "N0TE",
    ]);
    const project = projects.forRepo(created.repo.id);
    if (!project) throw new Error("No project for the new repo");
    expect(projects.allocateSeq(project.id).key).toBe("INF-1");
    expect(projects.allocateSeq(project.id).key).toBe("INF-2");

    const again = await registry.setup({ kind: "adopt", path: folder, key: "ZZ" });
    expect(again).toMatchObject({ created: false, repo: { id: adopted.repo.id } });
    expect(keyOf(adopted.repo.id)).toBe("N0TE");
    expect(projects.byKey("ZZ")).toBeUndefined();
  });

  // INF-4220: Settings' Add a repository and the first mate's setup card name the project by its key.
  it("adds a repository to an existing project by its key, by every way of adding", async () => {
    const first = await registry.setup({ kind: "init", name: "harbor-ledger", key: "HBL" });
    const origin = scratchDir("infinitary-origin-");
    await git(origin, ["init", "-q", "-b", "main"]);
    await git(origin, [...APP_GIT_IDENTITY, "commit", "-q", "--allow-empty", "-m", "chore: init"]);
    const folder = scratchDir("infinitary-adopt-");

    expect(
      await registry.check({ kind: "init", name: "wallet-api", project: "hbl" }),
    ).toMatchObject({ name: "wallet-api", project: { key: "HBL", name: "harbor-ledger" } });
    const created = await registry.setup({ kind: "init", name: "wallet-api", project: "hbl" });
    const cloned = await registry.setup({ kind: "clone", origin, project: "HBL" });
    const adopted = await registry.setup({ kind: "adopt", path: folder, project: "HBL" });
    const project = projects.forRepo(first.repo.id);
    expect([created, cloned, adopted].map(({ repo }) => projects.forRepo(repo.id))).toEqual([
      project,
      project,
      project,
    ]);
    expect(projects.list().map((one) => one.key)).toEqual(["SCR", "HBL"]);
    if (!project) throw new Error("No project for harbor-ledger");
    expect(projects.allocateSeq(project.id).key).toBe("HBL-1");
  });

  it("refuses to add a repository to an unknown project, or with a key of its own too, before anything is made", async () => {
    await registry.setup({ kind: "init", name: "harbor-ledger", key: "HBL" });
    await expect(registry.setup({ kind: "init", name: "lost", project: "NOPE" })).rejects.toThrow(
      "No project has the task key NOPE.",
    );
    await expect(
      registry.setup({ kind: "init", name: "both", project: "HBL", key: "BOTH" }),
    ).rejects.toThrow("A repository joins a project or gets a task key of its own, never both.");
    await expect(registry.check({ kind: "init", name: "x", project: "SCR" })).rejects.toThrow(
      "Scratch takes no repository.",
    );
    expect(registry.list().map((repo) => repo.name)).toEqual(["harbor-ledger"]);
    expect(existsSync(join(fleetRoot, "lost"))).toBe(false);
  });

  it("refuses a key a project already has, or one that is no key, before anything is made", async () => {
    const first = await registry.setup({ kind: "init", name: "first", key: "INF" });
    const origin = scratchDir("infinitary-origin-");
    await git(origin, ["init", "-q", "-b", "main"]);
    await git(origin, [...APP_GIT_IDENTITY, "commit", "-q", "--allow-empty", "-m", "chore: init"]);
    const folder = scratchDir("infinitary-adopt-");
    const inUse = "INF is already the task key of first. Choose another.";

    await expect(registry.setup({ kind: "init", name: "second", key: "inf" })).rejects.toThrow(
      inUse,
    );
    await expect(registry.setup({ kind: "clone", origin, key: "INF" })).rejects.toThrow(inUse);
    await expect(registry.setup({ kind: "adopt", path: folder, key: "Inf" })).rejects.toThrow(
      inUse,
    );
    expect(readdirSync(fleetRoot).sort()).toEqual(["first"]);
    expect(existsSync(join(folder, ".git"))).toBe(false);
    expect(registry.list().map((repo) => repo.name)).toEqual(["first"]);

    await expect(registry.check({ kind: "init", name: "second", key: "INF" })).rejects.toThrow(
      inUse,
    );
    await expect(registry.check({ kind: "clone", origin, key: "dev" })).resolves.toMatchObject({
      key: "DEV",
    });

    // Scratch's key, and a removed project's, still name their tasks.
    await expect(registry.setup({ kind: "init", name: "third", key: "scr" })).rejects.toThrow(
      "SCR is already the task key of Scratch. Choose another.",
    );
    registry.unregister(first.repo.id);
    await expect(registry.setup({ kind: "init", name: "third", key: "INF" })).rejects.toThrow(
      "INF is already the task key of first, a project you removed. Choose another.",
    );
    for (const key of ["I", "INFIN", "IN-F"]) {
      await expect(registry.setup({ kind: "init", name: "third", key })).rejects.toThrow(
        `A task key is 2-4 letters or digits; "${key}" is not one.`,
      );
    }
    expect(existsSync(join(fleetRoot, "third"))).toBe(false);
  });
});

/**
 * INF-2417's "project row by raw SQL" repair: a journey whose tasks name a
 * fixed project id seeds its project through `seedProject` (journeys reach
 * it through `tests/e2e/projectSeed.ts`), which must save the row and the
 * task project the registry saves when a person adds the same project. Both
 * write through `saveNewRepo`; a default the seed fills in differently from
 * the registry's own fails here.
 */
describe("seedProject, the journeys' project seed", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", scratchDir("infinitary-git-home-"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Every saved column but the ones a seed chooses itself: the ids, the
   * folder, and when. The repository's project is kept as whether it names
   * the project made with it.
   */
  function saved(db: ReturnType<typeof openInMemoryDatabase>, id: string) {
    const {
      id: _id,
      path: _path,
      added_at: _added,
      project_id: projectId,
      ...repo
    } = db.prepare("SELECT * FROM repos WHERE id = ?").get(id) as Record<string, unknown>;
    const {
      id: projectOwnId,
      repo_id: _repo,
      created_at: _created,
      ...project
    } = db.prepare("SELECT * FROM projects WHERE repo_id = ?").get(id) as Record<string, unknown>;
    return { repo, project, member: projectId === projectOwnId };
  }

  it.each([
    ["a hosted project", "https://github.com/o/meterlab.git"],
    ["a project kept on this computer", null],
  ])("saves %s the way the registry adds it", async (_label, origin) => {
    const dir = scratchDir("infinitary-seeded-");
    await git(dir, ["init", "-q", "-b", "main"]);
    if (origin) await git(dir, ["remote", "add", "origin", origin]);
    const added = openInMemoryDatabase();
    const { repo } = await new RepoRegistry(added, scratchDir("infinitary-fleet-")).setup({
      kind: "adopt",
      path: dir,
      name: "meterlab",
    });

    const seeded = openInMemoryDatabase();
    const view = seedProject(seeded, {
      id: "repo-meterlab",
      name: "meterlab",
      path: dir,
      setupKind: "adopt",
      origin,
      delivery: repo.delivery,
    });

    expect(view).toEqual({ ...repo, id: "repo-meterlab" });
    expect(saved(seeded, "repo-meterlab")).toEqual(saved(added, repo.id));
    added.close();
    seeded.close();
  });
});

// INF-4220 piece 1, the captain's chosen direction: "A project holds several
// repositories, each task works in one". Nothing joins one yet; the record
// already keeps it.
describe("a project of several repositories", () => {
  function harborLedger() {
    const { db, registry, workspaceDir } = setup();
    const projects = new ProjectStore(db);
    const app = seedProject(db, {
      id: "r-app",
      name: "harbor-ledger",
      path: "/fleet/harbor-ledger",
      origin: "https://github.com/example/harbor-ledger.git",
      key: "HBL",
      addedAt: 1,
    });
    const project = projects.forRepo(app.id);
    if (!project) throw new Error("harbor-ledger has no project");
    const api = seedProject(db, {
      id: "r-api",
      name: "harbor-ledger-api",
      path: "/fleet/harbor-ledger-api",
      origin: "https://github.com/example/harbor-ledger-api.git",
      project: project.id,
      addedAt: 2,
    });
    return { db, registry, workspaceDir, projects, project, app, api };
  }

  it("joins a repository to an existing project, which then lists both", () => {
    const { projects, project, api } = harborLedger();
    expect(projects.forRepo(api.id)).toEqual(project);
    expect(projects.repositoriesOf(project.id).map((repo) => repo.name)).toEqual([
      "harbor-ledger",
      "harbor-ledger-api",
    ]);
    expect(projects.list().map((one) => one.key)).toEqual(["SCR", "HBL"]);
  });

  it("refuses to join Scratch, the personal workspace, a removed project, or a key of its own too", () => {
    const { db, registry, workspaceDir, projects, project } = harborLedger();
    const seed = { id: "r-x", name: "x", path: "/fleet/x" };
    expect(() => seedProject(db, { ...seed, project: "scratch" })).toThrow(
      "Scratch takes no repository.",
    );
    expect(() => seedProject(db, { ...seed, project: project.id, key: "XX" })).toThrow(
      "A repository joins a project or gets a key of its own, never both.",
    );
    const personal = registry.ensurePersonal(workspaceDir);
    const personalProject = projects.forRepo(personal.id);
    expect(() => seedProject(db, { ...seed, project: personalProject?.id })).toThrow(
      /is the personal workspace and takes no repository/,
    );
    const other = seedProject(db, { id: "r-old", name: "old", path: "/fleet/old" });
    const oldProject = projects.forRepo(other.id);
    registry.unregister(other.id);
    expect(() => seedProject(db, { ...seed, project: oldProject?.id })).toThrow(
      "old was removed, so nothing can join it.",
    );
    expect(registry.get("r-x")).toBeUndefined();
  });

  it("keeps the project's own name when one of several repositories is renamed", () => {
    const { db, registry, projects, project, api } = harborLedger();
    registry.configure(api.id, { name: "wallet-service" });
    expect(projects.get(project.id)?.name).toBe("harbor-ledger");
    const solo = seedProject(db, {
      id: "r-solo",
      name: "solo",
      path: "/fleet/solo",
    });
    registry.configure(solo.id, { name: "solo-renamed" });
    expect(projects.forRepo(solo.id)?.name).toBe("solo-renamed");
  });

  it("names a project of several repositories on its own, and refuses one of one", () => {
    const { db, registry, projects, project, app, api } = harborLedger();
    expect(registry.renameProject(project.id, " Harbor Ledger ")).toEqual({
      id: project.id,
      name: "Harbor Ledger",
      was: "harbor-ledger",
    });
    expect(projects.get(project.id)).toMatchObject({ name: "Harbor Ledger", key: "HBL" });
    expect(registry.projectOf(api.id)).toMatchObject({ key: "HBL", repositories: 2 });
    expect(registry.get(app.id)?.name).toBe("harbor-ledger");
    const solo = seedProject(db, { id: "r-solo", name: "solo", path: "/fleet/solo" });
    const soloProject = projects.forRepo(solo.id);
    expect(() => registry.renameProject(soloProject?.id ?? "", "Other")).toThrow(
      "solo is named with its repository; rename the repository instead.",
    );
    expect(() => registry.renameProject("scratch", "Other")).toThrow(
      "That project is not here. It may have been removed.",
    );
  });

  it("names a project that shrinks back to one repository with that repository", () => {
    const { registry, projects, project, app, api } = harborLedger();
    registry.renameProject(project.id, "Harbor Ledger");
    registry.unregister(app.id);
    expect(projects.get(project.id)).toMatchObject({
      name: "harbor-ledger-api",
      key: "HBL",
      archivedAt: null,
    });
    expect(registry.projectOf(api.id)).toMatchObject({ name: "harbor-ledger-api" });
  });

  it("archives the project only when its last repository is removed", () => {
    const { registry, projects, project, app, api } = harborLedger();
    registry.unregister(app.id);
    expect(projects.get(project.id)?.archivedAt).toBeNull();
    expect(projects.repositoriesOf(project.id).map((repo) => repo.id)).toEqual([api.id]);
    registry.unregister(api.id);
    expect(projects.get(project.id)?.archivedAt).not.toBeNull();
  });
});
