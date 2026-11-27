import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Card } from "@shared/cards";
import {
  CONTRIBUTION_MERGE_REFUSAL,
  CONTRIBUTION_WORDS,
  type ContributionProject,
  contributionTransport,
  preparedPublicationRemote,
  waitingForMaintainers,
} from "@shared/contributions";
import type { FmEvent } from "@shared/events";
import { said, saidMark } from "@shared/i18n/said";
import { PULL_REQUEST_COMMENTS_WAKE } from "@shared/pullComments";
import {
  ADVISORY_WORKFLOWS_MOVING_REFUSAL,
  ADVISORY_WORKFLOWS_RESET_REFUSAL,
  type RepoView,
} from "@shared/repos";
import { MERGE_WORDS } from "@shared/vocabulary";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completionBody,
  fakeCrewmate,
  intentOf,
  SETTLE_MERGE,
  setup,
} from "../../../tests/helpers/crewHarness";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import {
  createForgeResolver,
  type Forge,
  ForgeAllowanceSpent,
  type ForgeLocation,
  type ForgePull,
  ForgeWriteError,
} from "../forge";
import type { ForgeContributions } from "../forge/contributions";
import { WorkingCopies } from "../helper/workingCopies";
import { ChangeContext } from "../orchestrator/changeContext";
import { createChangeDelivery } from "../orchestrator/changeDelivery";
import { contributionStatusLine } from "../orchestrator/settleWords";
import { taskContributesUpstream } from "../orchestrator/workShape";
import { appPathsFor } from "../paths";
import { openInMemoryDatabase } from "../storage/db";
import { seedTask } from "../tasks/seedTask";
import { TaskService } from "../tasks/taskService";
import { git, preserveWorktreeRemotes, taskRemoteName } from "./git";
import * as gitProcesses from "./gitProcess";
import { ProjectContributions } from "./projectContributions";
import { RepoRegistry } from "./repoRegistry";
import { WorkspaceService } from "./workspaceService";

vi.mock("../utilityQos", async (original) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(original),
);
const databases: ReturnType<typeof openInMemoryDatabase>[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllEnvs();
});

/** Approved change D: real repositories prove the upstream base and fork-only branch push. */
async function fixture(imported = true, host = "github.com") {
  const root = scratchDir("infinitary-contribution-route-");
  const gitConfig = join(root, "gitconfig");
  writeFileSync(gitConfig, "");
  vi.stubEnv("GIT_CONFIG_GLOBAL", gitConfig);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  const paths = appPathsFor(join(root, "home"));
  const upstreamDir = join(root, "upstream.git");
  const forkDir = join(root, "fork.git");
  const seed = join(root, "seed");
  await git(root, ["init", "--bare", "--quiet", "--initial-branch=main", upstreamDir]);
  await git(root, ["clone", "--quiet", upstreamDir, seed]);
  const commit = async (dir: string, text: string) => {
    writeFileSync(join(dir, "README.md"), text);
    await git(dir, ["add", "README.md"]);
    await git(dir, [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=Example contributor",
      "-c",
      "user.email=contributor@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "docs: update example",
    ]);
    return git(dir, ["rev-parse", "HEAD"]);
  };
  const forkMain = await commit(seed, "Original example\n");
  await git(seed, ["push", "--quiet", "origin", "main"]);
  await git(root, ["clone", "--bare", "--quiet", upstreamDir, forkDir]);
  const upstreamMain = await commit(seed, "Upstream improved after the fork\n");
  await git(seed, ["push", "--quiet", "origin", "main"]);
  const folder = join(root, "checkout");
  await git(root, ["clone", "--quiet", forkDir, folder]);
  const upstream: ContributionProject = {
    id: 1,
    fullName: "examples/project",
    origin: `https://${host}/examples/project.git`,
  };
  const fork: ContributionProject = {
    id: 2,
    fullName: "contributor/project",
    origin: `https://${host}/contributor/project.git`,
  };
  for (const [project, dir] of [
    [upstream, upstreamDir],
    [fork, forkDir],
  ] as const) {
    await git(folder, ["config", `url.${dir}.insteadOf`, project.origin]);
  }
  await git(folder, ["remote", "set-url", "origin", imported ? fork.origin : upstream.origin]);
  mkdirSync(paths.fleetDir, { recursive: true });
  const db = openInMemoryDatabase();
  databases.push(db);
  const repos = new RepoRegistry(db, paths.fleetDir);
  const { repo } = await repos.setup({ kind: "adopt", path: folder });
  let existing: ContributionProject | null = imported ? fork : null;
  const create = vi.fn(async () => {
    existing = fork;
    return fork;
  });
  const operations: ForgeContributions = {
    inspect: async () =>
      imported
        ? { project: fork, canPush: true, owned: true, parent: upstream }
        : { project: upstream, canPush: false, owned: false },
    findFork: async () => existing,
    createFork: create,
  };
  const cards: Omit<Card, "author" | "priority" | "status" | "createdAt">[] = [];
  const notes: string[] = [];
  const events: FmEvent[] = [];
  const branchReader = vi.fn(async () => "main");
  const make = (hasWorkingCopy?: (repoId: string) => boolean, tasks?: TaskService) =>
    new ProjectContributions({
      hasWorkingCopy,
      repos,
      tasks,
      broadcastEvent: (event) => events.push(event),
      forgeFor: (_repo: RepoView) => ({ contributions: operations, defaultBranch: branchReader }),
      raise: (card) => cards.push(card),
      note: (text) => notes.push(text),
    });
  const offer = () => {
    const card = cards.at(-1);
    if (!card) throw new Error("The project did not offer a choice");
    return card;
  };
  const choose = (card: (typeof cards)[number] | undefined, id: string) => {
    if (!card) throw new Error("The project did not offer a choice");
    const effect = card.actions.find((action) => action.id === id)?.effect;
    if (effect?.kind !== "host") throw new Error("Missing host choice");
    return effect.arg;
  };
  return {
    root,
    paths,
    repo,
    repos,
    db,
    folder,
    forkDir,
    upstreamDir,
    upstream,
    fork,
    upstreamMain,
    forkMain,
    commit,
    create,
    operations,
    branchReader,
    cards,
    notes,
    events,
    make,
    choose,
    offer,
  };
}

async function configuredTaskRemote(dir: string): Promise<string> {
  const branch = await git(dir, ["branch", "--show-current"]);
  return git(dir, ["config", "--get", `branch.${branch}.remote`]);
}

describe("approved once-per-project contribution consent", () => {
  // Regression: an effective local-only delivery never needs contribution discovery or loses its ordinary completion path.
  it("leaves local-only publication independent of host reads and an inherited contribution route", async () => {
    const world = await fixture(false);
    const tasks = new TaskService({ db: world.db, strict: true });
    const task = seedTask(tasks, {
      id: "local-publication",
      title: "Update locally",
      repoId: world.repo.id,
      status: "queued",
      shape: { kind: "chore", delivery_ask: "local-only" },
    });
    const inspect = vi
      .spyOn(world.operations, "inspect")
      .mockRejectedValue(new Error("No host read is needed for local work"));
    const service = world.make();
    expect(await service.prepareTask(task.id, tasks)).toBeUndefined();
    world.repos.setContribution(world.repo.id, {
      upstream: world.upstream,
      fork: world.fork,
      destination: "upstream",
    });
    tasks.delivery.recordChangeEvidence(task.id, {
      contribution: world.repos.get(world.repo.id)?.contribution,
    });
    expect(await service.prepareTask(task.id, tasks)).toBeUndefined();
    const current = tasks.get(task.id);
    expect(taskContributesUpstream(current, world.repos.get(world.repo.id))).toBe(false);
    expect(world.cards).toHaveLength(0);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("keeps the ordinary local merge card on a contributing project", async () => {
    const world = await fixture(false);
    const crewmate = fakeCrewmate();
    const harness = setup(crewmate);
    const { repo } = await harness.repos.setup({ kind: "adopt", path: world.folder });
    harness.repos.configure(repo.id, { autonomy: false });
    harness.repos.setContribution(repo.id, {
      upstream: world.upstream,
      fork: world.fork,
      destination: "upstream",
    });
    try {
      const { taskId } = await harness.supervisor.intake.commission({
        title: "Keep this change local",
        repoId: repo.id,
        intent: intentOf("Update the local example without publishing it"),
        shape: { delivery_ask: "local-only", rigor_ask: "quick" },
      });
      await vi.waitFor(() => expect(harness.specs[0]?.onCard).toBeDefined());
      await harness.specs[0]?.onCard?.({
        requiredActions: [],
        title: "The local example is updated",
        body: completionBody("<p>The local example is updated and checked.</p>"),
        actions: [{ id: "merge", default: true, effect: SETTLE_MERGE }],
      });
      crewmate.finishPrompt();
      await vi.waitFor(() => {
        const card = harness
          .cards()
          .find(
            (shown) => shown.taskId === taskId && shown.title === "The local example is updated",
          );
        expect(card?.actions.find((action) => action.id === "merge")).toMatchObject({
          label: MERGE_WORDS.land,
          effect: SETTLE_MERGE,
        });
      });
    } finally {
      await harness.supervisor.disposeAll();
    }
  });

  // Regression: a successful ordinary inspection survives reopening and later unavailable sign-ins.
  it.each([true, null])(
    "retains a direct project inspection with pushability %s",
    async (canPush) => {
      const world = await fixture(false);
      const inspect = vi
        .spyOn(world.operations, "inspect")
        .mockResolvedValue({ project: world.upstream, canPush, owned: false });
      await world.make().discover(world.repo.id);
      expect(new RepoRegistry(world.db, world.paths.fleetDir).get(world.repo.id)).toMatchObject({
        contributionChecked: true,
      });
      expect(world.repos.get(world.repo.id)?.contribution).toBeUndefined();
      inspect.mockRejectedValue(new Error("The host is offline after discovery"));
      const tasks = new TaskService({ db: world.db, strict: true });
      const task = seedTask(tasks, {
        id: "ordinary-publication",
        title: "Update the project",
        repoId: world.repo.id,
        status: "queued",
      });
      expect(await world.make().prepareTask(task.id, tasks)).toBeUndefined();
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(world.cards).toHaveLength(0);
      expect(world.events).toHaveLength(0);
      world.repos.configure(world.repo.id, {
        origin: "https://github.com/examples/other-project.git",
      });
      expect(world.repos.get(world.repo.id)?.contributionChecked).toBeUndefined();
    },
  );

  // Regression: a transport rewrite alone does not make ordinary local commits lose dispatch precedence.
  it("keeps local-branch-wins with pushInsteadOf and no explicit push address", async () => {
    const world = await fixture();
    const local = await world.commit(world.folder, "A local commit ahead of fork main\n");
    await git(world.folder, [
      "config",
      `url.${world.upstreamDir}.pushInsteadOf`,
      world.fork.origin,
    ]);
    expect(await git(world.folder, ["remote", "get-url", "--push", "origin"])).not.toBe(
      world.fork.origin,
    );
    const workspace = new WorkspaceService(world.paths, { pool: false });
    expect((await workspace.dispatchBase(world.folder)).sha).toBe(local);
  });

  // Regression: the first choice on an existing project applies only to new work, including with SSH transport.
  it.each([
    { destination: "upstream" as const, scoped: false, checkout: "task" },
    { destination: "fork" as const, scoped: false, checkout: "task" },
    { destination: "upstream" as const, scoped: true, checkout: "task" },
    { destination: "fork" as const, scoped: true, checkout: "task" },
    { destination: "upstream" as const, scoped: false, checkout: "other" },
    { destination: "upstream" as const, scoped: false, checkout: "detached" },
  ])(
    "preserves a prepared task while first choosing $destination with scoped config $scoped and checkout $checkout",
    async ({ destination, scoped, checkout }) => {
      const world = await fixture();
      const sshFork = "git@github.com:contributor/project.git";
      const sshUpstream = "git@github.com:examples/project.git";
      await git(world.folder, ["config", "--add", `url.${world.forkDir}.insteadOf`, sshFork]);
      await git(world.folder, [
        "config",
        "--add",
        `url.${world.upstreamDir}.insteadOf`,
        sshUpstream,
      ]);
      await git(world.folder, ["remote", "set-url", "origin", sshFork]);
      world.repos.configure(world.repo.id, { origin: sshFork });
      if (scoped) {
        await git(world.folder, ["config", "extensions.worktreeConfig", "true"]);
        await git(world.folder, ["config", "--worktree", "remote.origin.url", sshFork]);
        await git(world.folder, ["config", "--worktree", "remote.origin.pushurl", ""]);
      }
      const workspace = new WorkspaceService(world.paths);
      const old = await workspace.createTaskWorktree("before-first-choice", world.folder);
      const warm = await workspace.createTaskWorktree("warm-before-first-choice", world.folder);
      await workspace.removeTaskWorktree(warm);
      await workspace.poolSettled();
      if (checkout === "other") {
        await git(old.cwd, ["checkout", "--quiet", "-b", "person-branch"]);
        await git(old.cwd, ["config", "branch.person-branch.remote", "origin"]);
        await git(old.cwd, ["config", "branch.person-branch.pushRemote", "origin"]);
        await git(old.cwd, ["config", "branch.person-branch.merge", "refs/heads/main"]);
      } else if (checkout === "detached") await git(old.cwd, ["checkout", "--quiet", "--detach"]);
      const otherSettings = await git(old.cwd, [
        "config",
        "--get-regexp",
        "^branch\\.person-branch\\.",
      ]).catch(() => "");
      const tasks = new TaskService({ db: world.db, strict: true });
      const record = seedTask(tasks, {
        id: old.taskId,
        title: "Existing fork work",
        repoId: world.repo.id,
        repoDir: world.folder,
        worktreeDir: old.cwd,
        branch: old.branch,
        status: "idle",
      });
      const service = world.make(() => existsSync(old.cwd), tasks);
      await service.discover(world.repo.id);
      await service.answer(
        world.choose(
          world.offer(),
          destination === "upstream" ? "contribute-upstream" : "keep-fork",
        ),
      );
      const selectedOrigin = destination === "upstream" ? sshUpstream : sshFork;
      expect(world.notes.at(-1)).toContain("New tasks");
      expect(world.repos.get(world.repo.id)?.origin).toBe(selectedOrigin);
      expect(await git(world.folder, ["config", "--local", "--get", "remote.origin.url"])).toBe(
        selectedOrigin,
      );
      expect(
        await git(old.cwd, [
          "config",
          "--get",
          `remote.${await git(old.cwd, ["config", "--get", `branch.${old.branch}.remote`])}.url`,
        ]),
      ).toBe(sshFork);
      expect(
        await git(world.folder, ["config", "--get", "extensions.worktreeConfig"]).catch(() => ""),
      ).toBe(scoped ? "true" : "");
      if (scoped)
        expect(
          await git(world.folder, ["config", "--worktree", "--get", "remote.origin.url"]),
        ).toBe(sshFork);
      expect(
        await git(old.cwd, ["config", "--get-regexp", "^branch\\.person-branch\\."]).catch(
          () => "",
        ),
      ).toBe(otherSettings);
      expect(await git(old.cwd, ["remote"])).not.toContain(taskRemoteName("person-branch"));
      await git(old.cwd, ["checkout", "--quiet", old.branch]);
      const oldHead = await world.commit(old.cwd, "Keep the old task in its original fork\n");
      await git(old.cwd, ["push", "--quiet"]);
      expect(await git(world.forkDir, ["rev-parse", `refs/heads/${old.branch}`])).toBe(oldHead);
      await expect(
        git(world.upstreamDir, ["show-ref", "--verify", `refs/heads/${old.branch}`]),
      ).rejects.toThrow();
      const locations: ForgeLocation[] = [];
      const open = vi.fn(async () => ({
        number: 1,
        url: "https://github.com/contributor/project/pull/1",
        branch: old.branch,
        headSha: oldHead,
      }));
      const context = new ChangeContext({
        tasks,
        repos: world.repos,
        forgeFor: createForgeResolver({
          github: (location) => {
            locations.push(location);
            return { kind: "github", openChange: open } as unknown as Forge;
          },
        }),
      });
      const located = context.locate(record.id);
      if ("said" in located) throw new Error(located.said);
      await located.forge.openChange({
        branch: old.branch,
        base: "main",
        title: "docs: keep prepared work in its original project",
        body: "A prepared task keeps its target.",
      });
      expect(locations[0]).toMatchObject({ owner: "contributor", name: "project" });
      expect(locations[0]?.source).toBeUndefined();
      expect(open).toHaveBeenCalledWith(expect.objectContaining({ branch: old.branch }));
      const next = seedTask(tasks, {
        id: "after-first-choice",
        title: "New work",
        repoId: world.repo.id,
        status: "queued",
      });
      expect(await service.prepareTask(next.id, tasks, false)).toBeUndefined();
      expect(tasks.get(next.id)?.delivery?.contribution?.destination).toBe(destination);
      const fresh = await workspace.createTaskWorktree(
        next.id,
        world.folder,
        undefined,
        preparedPublicationRemote(tasks.get(next.id)),
      );
      expect(fresh.acquired?.source).toBe("pool");
      expect(
        await git(fresh.cwd, [
          "config",
          "--get",
          `remote.${await configuredTaskRemote(fresh.cwd)}.url`,
        ]),
      ).toBe(selectedOrigin);
      expect(await git(fresh.cwd, ["rev-parse", "HEAD"])).toBe(
        destination === "upstream" ? world.upstreamMain : world.forkMain,
      );
      expect(await git(world.forkDir, ["rev-parse", "refs/heads/main"])).toBe(world.forkMain);
      const oldRemote = await git(old.cwd, ["config", "--get", `branch.${old.branch}.remote`]);
      await workspace.removeTaskWorktree(old);
      await expect(git(world.folder, ["remote", "get-url", oldRemote])).rejects.toThrow();
      await workspace.poolSettled();
      await workspace.deletionsSettled();
    },
  );

  // Regression: task routes are independent even when their copies are acquired concurrently.
  it("binds concurrent working copies to their own declared push routes", async () => {
    const world = await fixture(false);
    await git(world.folder, ["config", "remote.origin.pushurl", world.fork.origin]);
    const workspace = new WorkspaceService(world.paths, { pool: false });
    const [forked, direct] = await Promise.all([
      workspace.createTaskWorktree("independent-fork", world.folder, undefined, {
        origin: world.upstream.origin,
        pushOrigin: world.fork.origin,
      }),
      workspace.createTaskWorktree("independent-direct", world.folder, undefined, {
        origin: world.upstream.origin,
      }),
    ]);
    const forkHead = await world.commit(forked.cwd, "The fork task keeps its declared route\n");
    const directHead = await world.commit(
      direct.cwd,
      "The direct task ignores the shared fork route\n",
    );
    await Promise.all([git(forked.cwd, ["push", "--quiet"]), git(direct.cwd, ["push", "--quiet"])]);
    expect(await git(world.forkDir, ["rev-parse", `refs/heads/${forked.branch}`])).toBe(forkHead);
    expect(await git(world.upstreamDir, ["rev-parse", `refs/heads/${direct.branch}`])).toBe(
      directHead,
    );
    await expect(
      git(world.forkDir, ["show-ref", "--verify", `refs/heads/${direct.branch}`]),
    ).rejects.toThrow();
    await expect(
      git(world.upstreamDir, ["show-ref", "--verify", `refs/heads/${forked.branch}`]),
    ).rejects.toThrow();
  });

  // Regression: copying Git routes must not expand credentials or expose address secrets through child arguments or task metadata.
  it("keeps private Git-address values out of arguments and publication metadata", async () => {
    const world = await fixture(false);
    const workspace = new WorkspaceService(world.paths, { pool: false });
    const privateOrigin =
      "https://fixture-user:stand-in-password@github.com/examples/project.git?token=stand-in-query";
    await git(world.folder, [
      "config",
      "--add",
      `url.${world.upstreamDir}.insteadOf`,
      privateOrigin,
    ]);
    await git(world.folder, ["remote", "set-url", "origin", privateOrigin]);
    world.repos.configure(world.repo.id, { origin: privateOrigin });
    const tasks = new TaskService({ db: world.db, strict: true });
    const argumentsSeen: string[][] = [];
    const run = gitProcesses.runGitProcess;
    const spy = vi
      .spyOn(gitProcesses, "runGitProcess")
      .mockImplementation((file, args, options) => {
        argumentsSeen.push([...args]);
        return run(file, args, options);
      });
    try {
      const old = await workspace.createTaskWorktree("private-address", world.folder);
      const task = seedTask(tasks, {
        id: old.taskId,
        title: "Keep a private transport",
        repoId: world.repo.id,
        repoDir: world.folder,
        worktreeDir: old.cwd,
        branch: old.branch,
        status: "idle",
      });

      await world.make(() => true, tasks).discover(world.repo.id);
      await preserveWorktreeRemotes(world.folder, [{ dir: old.cwd, branch: old.branch }]);
      expect(tasks.get(task.id)?.delivery?.publicationOrigin).toBe(world.upstream.origin);
      expect(contributionTransport(world.fork, privateOrigin)).toBe(world.fork.origin);
      const remote = await configuredTaskRemote(old.cwd);
      expect(await git(old.cwd, ["config", "--get", `remote.${remote}.url`])).toBe(privateOrigin);
      expect(tasks.get(task.id)?.delivery?.publicationPushOrigin).toBe(world.upstream.origin);
      const config = await git(old.cwd, [
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "config",
      ]);
      expect(statSync(config).mode & 0o077).toBe(0);
      expect(await git(old.cwd, ["remote", "get-url", "--push", remote])).toBe(world.upstreamDir);
      expect(
        argumentsSeen
          .flat()
          .some((arg) => arg.includes("stand-in-password") || arg.includes("stand-in-query")),
      ).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  // Regression: cleanup removes only the app's fork push route, not another user-configured destination.
  it("clears managed fork push addresses before project address changes and removal", async () => {
    const world = await fixture(false);
    const service = world.make();
    await service.discover(world.repo.id);
    await service.answer(world.choose(world.offer(), "make-fork"));
    await git(world.folder, [
      "config",
      "--add",
      "remote.origin.pushurl",
      "https://github.com/examples/another-project.git",
    ]);
    await service.clearPushAddress(world.repo.id);
    expect(await git(world.folder, ["config", "--get-all", "remote.origin.pushurl"])).toBe(
      "https://github.com/examples/another-project.git",
    );
    world.repos.configure(world.repo.id, {
      origin: "https://github.com/examples/another-project.git",
    });
    expect(world.repos.get(world.repo.id)?.contribution).toBeUndefined();
    world.repos.unregister(world.repo.id);
    expect(await git(world.folder, ["config", "--get-all", "remote.origin.pushurl"])).toBe(
      "https://github.com/examples/another-project.git",
    );
  });

  // N2/N4/N5 and the settled F4 decision: own task routing, not person-owned worktree format or transport.
  it("keeps split push transport and restores it without pinning a person's linked copy", async () => {
    const world = await fixture(false);
    const sshUpstream = "git@github.com:examples/project.git";
    const sshFork = "git@github.com:contributor/project.git";
    for (const [address, dir] of [
      [sshUpstream, world.upstreamDir],
      [sshFork, world.forkDir],
    ] as const)
      await git(world.folder, ["config", "--add", `url.${dir}.insteadOf`, address]);
    await git(world.folder, ["config", "remote.origin.pushurl", sshUpstream]);
    const personal = join(world.root, "person-linked-copy");
    await git(world.folder, ["worktree", "add", "-b", "person-work", personal]);
    const personalHead = await git(personal, ["rev-parse", "HEAD"]);
    const personalConfig = await git(personal, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "config.worktree",
    ]);
    const tasks = new TaskService({ db: world.db, strict: true });
    const service = world.make(() => false, tasks);
    await service.discover(world.repo.id);
    await service.answer(world.choose(world.offer(), "make-fork"));
    expect(await git(world.folder, ["config", "--get", "remote.origin.url"])).toBe(
      world.upstream.origin,
    );
    expect(await git(world.folder, ["config", "--get", "remote.origin.pushurl"])).toBe(sshFork);
    const notes = world.notes.length;
    await service.discover(world.repo.id);
    expect(world.notes).toHaveLength(notes);
    const record = seedTask(tasks, {
      id: "split-transport",
      title: "Use the existing push transport",
      repoId: world.repo.id,
      status: "queued",
    });
    await service.prepareTask(record.id, tasks);
    const workspace = new WorkspaceService(world.paths, { pool: false });
    const task = await workspace.createTaskWorktree(
      record.id,
      world.folder,
      undefined,
      preparedPublicationRemote(tasks.get(record.id)),
    );
    const remote = await configuredTaskRemote(task.cwd);
    expect(await git(task.cwd, ["config", "--get", `remote.${remote}.pushurl`])).toBe(sshFork);
    // Even a person's matching-push default must not send the folder's newer main to fork main.
    await git(world.folder, ["config", "push.default", "matching"]);
    const head = await world.commit(task.cwd, "Keep the selected SSH push transport\n");
    await git(task.cwd, ["push", "--quiet"]);
    expect(await git(world.forkDir, ["rev-parse", `refs/heads/${task.branch}`])).toBe(head);
    expect(await git(world.forkDir, ["rev-parse", "refs/heads/main"])).toBe(world.forkMain);
    await workspace.removeTaskWorktree(task);
    await workspace.deletionsSettled();
    await expect(git(world.folder, ["remote", "get-url", remote])).rejects.toThrow();
    await service.clearPushAddress(world.repo.id);
    expect(await git(world.folder, ["config", "--get", "remote.origin.pushurl"])).toBe(sshUpstream);
    await service.choose(world.repo.id, "fork");
    const afterChoice = world.notes.length;
    await service.discover(world.repo.id);
    expect(world.notes).toHaveLength(afterChoice);
    expect(await git(world.folder, ["config", "--get", "remote.origin.pushurl"])).toBe(sshUpstream);
    await service.clearPushAddress(world.repo.id);
    world.repos.unregister(world.repo.id);
    expect(await git(personal, ["config", "--get", "remote.origin.pushurl"])).toBe(sshUpstream);
    expect(await git(personal, ["rev-parse", "HEAD"])).toBe(personalHead);
    expect(await git(personal, ["branch", "--show-current"])).toBe("person-work");
    expect(existsSync(personalConfig)).toBe(false);
    expect(
      await git(world.folder, ["config", "--get", "extensions.worktreeConfig"]).catch(() => ""),
    ).toBe("");
    expect(await git(world.folder, ["config", "--get", "core.bare"])).toBe("false");
    expect(
      await git(world.folder, ["config", "--get", "infinitary.contributionPush"]).catch(() => ""),
    ).toBe("");
  });

  // Regression: a definite host refusal is retryable; the uncertain-create test below still owns no-repeat.
  it("allows another explicit fork attempt after a definite refusal", async () => {
    const world = await fixture(false);
    world.create.mockRejectedValueOnce(
      new ForgeWriteError("failed", "permission", "The host refused to create the fork."),
    );
    const service = world.make();
    await service.discover(world.repo.id);
    await service.answer(world.choose(world.offer(), "make-fork"));
    expect(world.repos.get(world.repo.id)?.contribution?.creationAttempted).toBe(false);
    await service.answer(world.choose(world.offer(), "make-fork"));
    expect(world.create).toHaveBeenCalledTimes(2);
    expect(world.repos.get(world.repo.id)?.contribution?.fork).toEqual(world.fork);
    expect(world.events.at(-1)).toMatchObject({ type: "repo_configured", repoId: world.repo.id });
  });

  // A spent allowance is the host refusing before it did anything, as Bitbucket's 429 on its workspace reads.
  it("allows another explicit fork attempt after the host's allowance ran out", async () => {
    const world = await fixture(false);
    world.create.mockRejectedValueOnce(
      new ForgeAllowanceSpent(Date.now() + 60_000, "The host's hourly allowance is spent."),
    );
    const service = world.make();
    await service.discover(world.repo.id);
    await service.answer(world.choose(world.offer(), "make-fork"));
    expect(world.repos.get(world.repo.id)?.contribution?.creationAttempted).toBe(false);
    await service.answer(world.choose(world.offer(), "make-fork"));
    expect(world.create).toHaveBeenCalledTimes(2);
    expect(world.repos.get(world.repo.id)?.contribution?.fork).toEqual(world.fork);
  });

  it("a work computer fetches upstream but sends its task branch only to the owned fork", async () => {
    const world = await fixture(false);
    const config = join(world.root, "computer-gitconfig");
    writeFileSync(
      config,
      (
        [
          [world.upstream, world.upstreamDir],
          [world.fork, world.forkDir],
        ] as const
      )
        .map(([project, dir]) => `[url "${dir}"]\n\tinsteadOf = ${project.origin}\n`)
        .join(""),
    );
    vi.stubEnv("GIT_CONFIG_GLOBAL", config);
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    const computer = new WorkingCopies(join(world.root, "work-computer"), { pool: false });
    const task = await computer.prepare("remote-contribution", {
      origin: world.upstream.origin,
      pushOrigin: world.fork.origin,
    });
    expect(await git(task.dir, ["rev-parse", "HEAD"])).toBe(world.upstreamMain);
    const changed = await world.commit(task.dir, "The work computer's contribution\n");
    await git(task.dir, ["push", "--quiet"]);
    expect(await git(world.forkDir, ["rev-parse", `refs/heads/${task.branch}`])).toBe(changed);
    expect(await git(world.forkDir, ["rev-parse", "refs/heads/main"])).toBe(world.forkMain);
    expect(await git(world.upstreamDir, ["rev-parse", "refs/heads/main"])).toBe(world.upstreamMain);
    // Regression: reusing this clone for a direct project must clear only its shared push route.
    const ordinary = await computer.prepare("remote-direct", { origin: world.upstream.origin });
    expect(await git(ordinary.dir, ["remote", "get-url", "--push", "--all", "origin"])).toBe(
      world.upstreamDir,
    );
    expect(
      await git(task.dir, [
        "remote",
        "get-url",
        "--push",
        "--all",
        await configuredTaskRemote(task.dir),
      ]),
    ).toBe(world.forkDir);
    const continued = await world.commit(task.dir, "Continue the already-prepared fork task\n");
    await git(task.dir, ["push", "--quiet"]);
    expect(await git(world.forkDir, ["rev-parse", `refs/heads/${task.branch}`])).toBe(continued);
    const directHead = await world.commit(ordinary.dir, "A new direct task\n");
    await git(ordinary.dir, ["push", "--quiet", "origin", ordinary.branch]);
    expect(await git(world.upstreamDir, ["rev-parse", `refs/heads/${ordinary.branch}`])).toBe(
      directHead,
    );
    await expect(
      git(world.upstreamDir, ["show-ref", "--verify", `refs/heads/${task.branch}`]),
    ).rejects.toThrow();
  });
  it("accepts GitHub's canonical spelling of an imported fork without losing its route", async () => {
    const home = await fixture();
    home.repos.configure(home.repo.id, {
      origin: home.fork.origin.replace(home.fork.fullName, home.fork.fullName.toUpperCase()),
    });
    await home.make().discover(home.repo.id);
    expect(home.repos.get(home.repo.id)?.contribution).toMatchObject({
      destination: null,
      fork: home.fork,
    });
    home.repos.configure(home.repo.id, { origin: home.fork.origin });
    expect(home.repos.get(home.repo.id)?.contribution?.fork).toEqual(home.fork);
  });

  // INF-5186 piece 5: Bitbucket reads a workspace and repository name without
  // regard to case, as GitHub does.
  it("accepts Bitbucket's spelling of an imported fork in another case without losing its route", async () => {
    const home = await fixture(true, "bitbucket.org");
    expect(home.repos.get(home.repo.id)?.host?.kind).toBe("bitbucket");
    home.repos.configure(home.repo.id, {
      origin: home.fork.origin.replace(home.fork.fullName, home.fork.fullName.toUpperCase()),
    });
    await home.make().discover(home.repo.id);
    expect(home.repos.get(home.repo.id)?.contribution).toMatchObject({
      destination: null,
      fork: home.fork,
    });
  });

  it("makes a Bitbucket fork only after the consent click and contributes from it", async () => {
    const world = await fixture(false, "bitbucket.org");
    const service = world.make();
    await service.discover(world.repo.id);
    expect(world.create).not.toHaveBeenCalled();
    await service.answer(world.choose(world.cards[0], "make-fork"));
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.repos.get(world.repo.id)?.contribution).toMatchObject({
      destination: "upstream",
      fork: world.fork,
    });
  });

  it("waits for an in-flight target choice before capturing a new task's contribution route", async () => {
    const world = await fixture();
    const service = world.make();
    await service.discover(world.repo.id);
    const tasks = new TaskService({ db: world.db, strict: true });
    const task = seedTask(tasks, {
      id: "choice-in-flight",
      title: "Contribute an example",
      repoId: world.repo.id,
      status: "queued",
    });
    let finishBranch: (branch: string) => void = () => {
      throw new Error("No branch read is pending");
    };
    const branch = new Promise<string>((resolve) => {
      finishBranch = resolve;
    });
    world.branchReader.mockImplementationOnce(() => branch);
    const choice = service.choose(world.repo.id, "upstream");
    expect(world.branchReader).toHaveBeenCalledTimes(1);
    const prepared = service.prepareTask(task.id, tasks, false);
    expect(tasks.get(task.id)?.delivery?.contribution).toBeUndefined();
    finishBranch("main");
    await choice;
    expect(await prepared).toBeUndefined();
    expect(tasks.get(task.id)?.delivery?.contribution).toMatchObject({
      destination: "upstream",
      fork: world.fork,
    });
    expect(await git(world.folder, ["remote", "get-url", "origin"])).toBe(world.upstreamDir);
  });

  it("keeps ordinary offline starts free of host discovery until add or publication needs it", async () => {
    const world = await fixture(false);
    const tasks = new TaskService({ db: world.db, strict: true });
    const task = seedTask(tasks, {
      id: "ordinary-start",
      title: "Update an example",
      repoId: world.repo.id,
      status: "queued",
    });
    const inspect = vi.spyOn(world.operations, "inspect");
    expect(await world.make().prepareTask(task.id, tasks, false)).toBeUndefined();
    expect(inspect).not.toHaveBeenCalled();
  });
  it("does not spend an old fork consent after the project's address changes", async () => {
    const world = await fixture(false);
    const service = world.make();
    await service.discover(world.repo.id);
    const oldConsent = world.choose(world.offer(), "make-fork");
    const origin = "https://github.com/examples/other-project.git";
    await git(world.folder, ["remote", "set-url", "origin", origin]);
    world.repos.configure(world.repo.id, { origin });
    expect(world.repos.get(world.repo.id)?.contribution).toBeUndefined();
    await service.answer(oldConsent);
    expect(world.create).not.toHaveBeenCalled();
    expect(world.repos.get(world.repo.id)?.origin).toBe(origin);
  });

  it("refuses a fork identity that would send the sign-in to another host", async () => {
    const world = await fixture();
    world.operations.inspect = async () => ({
      project: world.fork,
      canPush: true,
      owned: true,
      parent: { ...world.upstream, origin: "https://other.example/examples/project.git" },
    });
    await expect(world.make().discover(world.repo.id)).rejects.toThrow("own host");
    expect(world.create).not.toHaveBeenCalled();
    expect(world.repos.get(world.repo.id)?.contribution).toBeUndefined();
  });
  it("watches maintainer activity and the confirmed external outcome without writing a merge", async () => {
    const world = await fixture();
    await world.make().discover(world.repo.id);
    await world.make().answer(world.choose(world.offer(), "contribute-upstream"));
    const tasks = new TaskService({ db: world.db, strict: true });
    const task = seedTask(tasks, {
      id: "watched-contribution",
      title: "Contribute an example",
      repoId: world.repo.id,
      repoDir: world.folder,
      worktreeDir: world.folder,
      branch: "contribution",
      status: "idle",
    });
    const change = {
      number: 1,
      url: "https://github.com/examples/project/pull/1",
      branch: task.branch,
      headSha: world.upstreamMain,
      title: "docs: contribute an example",
    };
    let pull: ForgePull = {
      number: change.number,
      state: "open",
      merged: false,
      headSha: change.headSha,
      branch: change.branch,
      base: "main",
      readiness: "clean",
      updatedAt: "2026-11-10T20:00:00Z",
    };
    tasks.delivery.recordChangeEvidence(task.id, {
      contribution: world.repos.get(world.repo.id)?.contribution,
      prNumber: change.number,
      prUrl: change.url,
      contributionState: { number: change.number, state: "open" },
    });
    const putIn = vi.fn();
    const forge = {
      kind: "github",
      host: "github.com",
      place: "GitHub",
      hasChecks: true,
      changeFor: async () => (pull.state === "open" ? change : null),
      checks: async () => ({
        complete: true,
        items: [{ name: "example check", state: "success" }],
      }),
      pull: async () => pull,
      pullComments: async () => [],
      label: () => `#${change.number}`,
      url: () => change.url,
      putIn,
    } as unknown as Forge;
    const steer = vi.fn();
    // Review INF-4479's N1: with Pull request comments on, a crewmate whose
    // conversation opened without its guidance still hears maintainer activity,
    // and one told of it hears comments through the comment wake instead.
    const delivery = createChangeDelivery({
      tasks,
      repos: world.repos,
      forgeFor: () => forge,
      steer,
      commentsWatched: () => true,
    });
    await delivery.checks.readWatched(task.id);
    expect(waitingForMaintainers(tasks.get(task.id)?.delivery)).toBe(true);
    await delivery.checks.readWatched(task.id);
    expect(steer).not.toHaveBeenCalled();
    pull = { ...pull, updatedAt: "2026-11-10T20:01:00Z" };
    await delivery.checks.readWatched(task.id);
    expect(steer).toHaveBeenCalledTimes(1);
    expect(steer.mock.calls[0]?.[1].facts).toMatchObject({
      kind: "contribution-updated",
      state: "open",
    });
    tasks.delivery.recordChangeEvidence(task.id, { servedWakes: [PULL_REQUEST_COMMENTS_WAKE] });
    pull = { ...pull, updatedAt: "2026-11-10T20:02:00Z" };
    await delivery.checks.readWatched(task.id);
    expect(steer).toHaveBeenCalledTimes(1);
    pull = { ...pull, state: "closed", merged: true };
    await delivery.checks.readWatched(task.id);
    expect(tasks.get(task.id)?.delivery?.contributionState?.state).toBe("merged");
    expect(waitingForMaintainers(tasks.get(task.id)?.delivery)).toBe(false);
    const merged = tasks.get(task.id);
    if (!merged) throw new Error("The contribution record was lost");
    expect(contributionStatusLine(merged)).toContain(CONTRIBUTION_WORDS.merged);
    expect(putIn).not.toHaveBeenCalled();
  });
  it("refuses both direct and reviewed contribution merges before reaching the host", async () => {
    const world = await fixture();
    const service = world.make();
    await service.discover(world.repo.id);
    await service.answer(world.choose(world.offer(), "contribute-upstream"));
    const tasks = new TaskService({ db: world.db, strict: true });
    const task = seedTask(tasks, {
      id: "contributor",
      title: "Contribute an example",
      repoId: world.repo.id,
      repoDir: world.folder,
      worktreeDir: world.folder,
      branch: "contribution",
      status: "idle",
    });
    tasks.delivery.recordChangeEvidence(task.id, {
      contribution: world.repos.get(world.repo.id)?.contribution,
    });
    tasks.delivery.recordPermissionRecords(task.id, {
      mergeReviews: [
        {
          id: "named-review",
          kind: "github",
          host: "github.com",
          owner: "examples",
          name: "project",
          number: 1,
          headSha: world.upstreamMain,
          base: "main",
          branch: "contribution",
          method: "squash",
          title: "docs: contribute an example",
          at: Date.now(),
        },
      ],
    });
    const forgeFor = vi.fn(() => {
      throw new Error("A contributor must not reach the merge writer");
    });
    const delivery = createChangeDelivery({ tasks, repos: world.repos, forgeFor });
    expect(await delivery.merges.merge(task.id)).toEqual({
      ok: false,
      text: CONTRIBUTION_MERGE_REFUSAL,
    });
    expect(await delivery.reviews.reviewGate(task.id, "named-review")).toBe(
      CONTRIBUTION_MERGE_REFUSAL,
    );
    expect(await delivery.reviews.mergeReview(task.id, "named-review")).toEqual({
      ok: false,
      text: CONTRIBUTION_MERGE_REFUSAL,
    });
    expect(forgeFor).not.toHaveBeenCalled();
  });
  it("asks for an imported fork's destination, persists it, starts upstream and pushes only a task branch to the fork", async () => {
    const world = await fixture();
    // Approved fork-only pushes must not depend on the person's Git defaults.
    await git(world.folder, ["config", "push.autoSetupRemote", "false"]);
    await git(world.folder, ["config", "push.default", "simple"]);
    const service = world.make();
    await service.discover(world.repo.id);
    expect(world.cards).toHaveLength(1);
    const tasks = new TaskService({ db: world.db, strict: true });
    const snapshot = seedTask(tasks, {
      id: "selected-route",
      title: "Contribute an example",
      repoId: world.repo.id,
      status: "queued",
    });
    expect(await service.prepareTask(snapshot.id, tasks, false)).toContain("captain's choice");
    expect(world.repos.get(world.repo.id)?.contribution?.destination).toBeNull();
    expect(world.create).not.toHaveBeenCalled();
    await service.answer(world.choose(world.cards[0], "contribute-upstream"));
    expect(await service.prepareTask(snapshot.id, tasks, false)).toBeUndefined();
    expect(tasks.get(snapshot.id)?.delivery?.contribution?.destination).toBe("upstream");
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.upstream.origin);
    expect(
      new RepoRegistry(world.db, world.paths.fleetDir).get(world.repo.id)?.contribution,
    ).toMatchObject({ destination: "upstream", fork: world.fork });
    const workspace = new WorkspaceService(world.paths, { pool: false });
    const task = await workspace.createTaskWorktree(
      snapshot.id,
      world.folder,
      undefined,
      preparedPublicationRemote(tasks.get(snapshot.id)),
    );
    expect(await git(task.cwd, ["rev-parse", "HEAD"])).toBe(world.upstreamMain);
    const changed = await world.commit(task.cwd, "A contribution\n");
    await git(task.cwd, ["push", "--quiet"]);
    expect(await git(world.forkDir, ["rev-parse", `refs/heads/${task.branch}`])).toBe(changed);
    expect(await git(world.forkDir, ["rev-parse", "refs/heads/main"])).toBe(world.forkMain);
    expect(await git(world.upstreamDir, ["rev-parse", "refs/heads/main"])).toBe(world.upstreamMain);
    await expect(
      git(world.upstreamDir, ["show-ref", "--verify", `refs/heads/${task.branch}`]),
    ).rejects.toThrow();
    const changeTarget = world.make(() => existsSync(task.cwd));
    await expect(changeTarget.choose(world.repo.id, "fork")).rejects.toThrow(
      "Finish the project's current code tasks",
    );
    await workspace.removeTaskWorktree(task);
    await changeTarget.choose(world.repo.id, "fork");
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.fork.origin);
    expect(world.repos.get(world.repo.id)?.contribution?.destination).toBe("fork");
    expect(tasks.get(snapshot.id)?.delivery?.contribution?.destination).toBe("upstream");
  });

  // docs/forge.md, "Advisory workflows": a list stays with the repository it
  // was chosen for, so the choice that moves the project says so first, as a
  // saved fact each reader words in their own language.
  const clears = (choice: string) =>
    saidMark(said("projectsContributionClearsAdvisory", { choice }), "p");

  it("says which target clears an imported fork's advisory workflows, and that choice clears them", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, {
      delivery: "direct-pr",
      advisoryWorkflows: [".github/workflows/early-tests.yml"],
    });
    const service = world.make();
    await service.discover(world.repo.id);
    expect(world.offer().body).toContain(clears(CONTRIBUTION_WORDS.contribute));
    expect(world.offer().body).not.toContain(clears(CONTRIBUTION_WORDS.keepFork));
    await service.answer(world.choose(world.offer(), "contribute-upstream"));
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.upstream.origin);
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toBeUndefined();
  });

  it("shows the choice again before clearing an advisory list saved after its card went up", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    const opened = world.offer();
    expect(opened.body).not.toContain(clears(CONTRIBUTION_WORDS.contribute));
    world.repos.configure(world.repo.id, {
      advisoryWorkflows: [".github/workflows/early-tests.yml"],
    });
    await service.answer(world.choose(opened, "contribute-upstream"));
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.fork.origin);
    expect(world.repos.get(world.repo.id)?.contribution?.destination).toBeNull();
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toEqual([
      ".github/workflows/early-tests.yml",
    ]);
    const shown = world.offer();
    expect(shown).not.toBe(opened);
    expect(shown.body).toContain(clears(CONTRIBUTION_WORDS.contribute));
    await service.answer(world.choose(shown, "contribute-upstream"));
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.upstream.origin);
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toBeUndefined();
  });

  // A target change reads the target's default branch from the host before
  // its first write; a list saved during that read was never shown as cleared.
  const pauseBranchRead = (world: Awaited<ReturnType<typeof fixture>>) => {
    let resume = () => {};
    let started = () => {};
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    world.branchReader.mockImplementationOnce(() => {
      started();
      return new Promise<string>((resolve) => {
        resume = () => resolve("main");
      });
    });
    return { reading, resume: () => resume() };
  };
  const pilot = [".github/workflows/early-tests.yml"];

  it("keeps the list and target when a list is saved while the card's choice reads the branch, and shows the card again", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    const opened = world.offer();
    const read = pauseBranchRead(world);
    const answered = service.answer(world.choose(opened, "contribute-upstream"));
    await read.reading;
    world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
    read.resume();
    await answered;
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.fork.origin,
      advisoryWorkflows: pilot,
      contribution: { destination: null },
    });
    expect(await git(world.folder, ["config", "--get", "remote.origin.url"])).toBe(
      world.fork.origin,
    );
    expect(world.offer()).not.toBe(opened);
    expect(world.offer().body).toContain(clears(CONTRIBUTION_WORDS.contribute));
  });

  it("keeps the list and target when a list is saved while a Settings target change reads the branch", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    const read = pauseBranchRead(world);
    const switching = service.choose(world.repo.id, "upstream", false);
    await read.reading;
    world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
    read.resume();
    await expect(switching).rejects.toThrow(ADVISORY_WORKFLOWS_RESET_REFUSAL);
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.fork.origin,
      advisoryWorkflows: pilot,
      contribution: { destination: null },
    });
    expect(await git(world.folder, ["config", "--get", "remote.origin.url"])).toBe(
      world.fork.origin,
    );
  });

  // A target change pins each prepared task to the repository it was made
  // for; a refused one writes nothing, so a task prepared after the project's
  // route was read stays unpinned, its working copy's remotes as they were.
  it("leaves a prepared task's route and its working copy's remotes alone when the target change is refused", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const tasks = new TaskService({ db: world.db, strict: true });
    const workspace = new WorkspaceService(world.paths, { pool: false });
    const service = world.make(() => true, tasks);
    await service.discover(world.repo.id);
    const prepared = await workspace.createTaskWorktree("prepared-before-target", world.folder);
    const task = seedTask(tasks, {
      id: prepared.taskId,
      title: "Prepared fork work",
      repoId: world.repo.id,
      repoDir: world.folder,
      worktreeDir: prepared.cwd,
      branch: prepared.branch,
      status: "idle",
    });
    const remotes = () =>
      git(prepared.cwd, ["config", "--get-regexp", "^(remote|branch)\\."]).catch(() => "");
    const before = await remotes();
    const read = pauseBranchRead(world);
    const switching = service.choose(world.repo.id, "upstream", false);
    await read.reading;
    world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
    read.resume();
    await expect(switching).rejects.toThrow(ADVISORY_WORKFLOWS_RESET_REFUSAL);
    expect(tasks.get(task.id)?.delivery?.publicationOrigin).toBeUndefined();
    expect(await remotes()).toBe(before);

    await service.choose(world.repo.id, "upstream", false);
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.upstream.origin);
    expect(tasks.get(task.id)?.delivery?.publicationOrigin).toBe(world.fork.origin);
    expect(await configuredTaskRemote(prepared.cwd)).toBe(taskRemoteName(prepared.branch));
    await workspace.removeTaskWorktree(prepared);
    await workspace.deletionsSettled();
  });

  it("refuses a list saved while a target change writes the project's addresses", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    const refusals: string[] = [];
    const run = gitProcesses.runGitProcess;
    const spy = vi
      .spyOn(gitProcesses, "runGitProcess")
      .mockImplementation((file, args, options) => {
        if (args.includes("fetch"))
          try {
            world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
          } catch (error) {
            refusals.push(error instanceof Error ? error.message : String(error));
          }
        return run(file, args, options);
      });
    try {
      await service.choose(world.repo.id, "upstream", false);
    } finally {
      spy.mockRestore();
    }
    expect(refusals).toEqual([ADVISORY_WORKFLOWS_MOVING_REFUSAL]);
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.upstream.origin,
      contribution: { destination: "upstream" },
    });
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toBeUndefined();
  });

  // Each click carries its own choice's reset, so a list saved after the card
  // went up holds back only a choice that would clear it.
  it("takes the card's choice that keeps the repository after a list was saved, and keeps the list", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    const opened = world.offer();
    world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
    await service.answer(world.choose(opened, "keep-fork"));
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.fork.origin,
      advisoryWorkflows: pilot,
      contribution: { destination: "fork" },
    });
  });

  // Settings sends the list its page showed the choice clearing; a list saved
  // after that, before the host takes the change, was never shown.
  it("refuses a Settings target change whose shown reset is no longer the project's, and takes it shown as it is", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
    const reads = world.branchReader.mock.calls.length;
    await expect(service.choose(world.repo.id, "upstream", false, [])).rejects.toThrow(
      ADVISORY_WORKFLOWS_RESET_REFUSAL,
    );
    // A window older than the list sends none, and is refused before the host is read.
    expect(world.branchReader).toHaveBeenCalledTimes(reads);
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.fork.origin,
      advisoryWorkflows: pilot,
      contribution: { destination: null },
    });
    expect(await git(world.folder, ["config", "--get", "remote.origin.url"])).toBe(
      world.fork.origin,
    );

    await service.choose(world.repo.id, "upstream", false, pilot);
    expect(world.repos.get(world.repo.id)?.origin).toBe(world.upstream.origin);
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toBeUndefined();
  });

  // An address change reads the folder before its first write, which releases
  // the project's push address and pins prepared tasks' routes; a list saved
  // during that read was never shown as cleared.
  it("leaves the push address and a prepared task's route alone when an address change is refused after its folder read", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const tasks = new TaskService({ db: world.db, strict: true });
    const workspace = new WorkspaceService(world.paths, { pool: false });
    const service = world.make(undefined, tasks);
    await service.discover(world.repo.id);
    await service.choose(world.repo.id, "upstream", false);
    const pushAddress = () =>
      git(world.folder, ["config", "--get", "remote.origin.pushurl"]).catch(() => "");
    expect(await pushAddress()).toBe(world.fork.origin);
    const prepared = await workspace.createTaskWorktree("prepared-before-address", world.folder);
    const task = seedTask(tasks, {
      id: prepared.taskId,
      title: "Prepared contribution",
      repoId: world.repo.id,
      repoDir: world.folder,
      worktreeDir: prepared.cwd,
      branch: prepared.branch,
      status: "idle",
    });
    const remotes = () =>
      git(prepared.cwd, ["config", "--get-regexp", "^(remote|branch)\\."]).catch(() => "");
    const next = "https://github.com/examples/project-next.git";
    await git(world.folder, ["remote", "set-url", "origin", next]);
    const before = await remotes();
    let saved = false;
    const run = gitProcesses.runGitProcess;
    const spy = vi
      .spyOn(gitProcesses, "runGitProcess")
      .mockImplementation((file, args, options) => {
        if (!saved && args.includes("remote.origin.url")) {
          saved = true;
          world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
        }
        return run(file, args, options);
      });
    try {
      await expect(
        service.changeAddress(world.repo.id, { origin: next, advisoryWorkflowsCleared: [] }),
      ).rejects.toThrow(ADVISORY_WORKFLOWS_RESET_REFUSAL);
    } finally {
      spy.mockRestore();
    }
    expect(saved).toBe(true);
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.upstream.origin,
      advisoryWorkflows: pilot,
    });
    expect(await pushAddress()).toBe(world.fork.origin);
    expect(tasks.get(task.id)?.delivery?.publicationOrigin).toBeUndefined();
    expect(await remotes()).toBe(before);

    const moved = await service.changeAddress(world.repo.id, {
      origin: next,
      advisoryWorkflowsCleared: pilot,
    });
    expect(moved.origin).toBe(next);
    expect(moved.advisoryWorkflows).toBeUndefined();
    expect(await pushAddress()).toBe("");
    expect(tasks.get(task.id)?.delivery?.publicationOrigin).toBe(world.upstream.origin);
    await workspace.removeTaskWorktree(prepared);
    await workspace.deletionsSettled();
  });

  // Address changes take the line target changes take, so neither writes
  // between the other's last check and its address write.
  it("holds an address and list change sent during a target change until that ends, then refuses it before writing", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    const respelled = "git@github.com:contributor/project.git";
    await git(world.folder, ["remote", "set-url", "origin", respelled]);
    const read = pauseBranchRead(world);
    const switching = service.choose(world.repo.id, "upstream", false);
    await read.reading;
    const addressing = service.changeAddress(world.repo.id, {
      origin: respelled,
      advisoryWorkflows: pilot,
      advisoryWorkflowsAt: world.fork.origin,
    });
    read.resume();
    await switching;
    await expect(addressing).rejects.toThrow("Where the folder points changed.");
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.upstream.origin,
      contribution: { destination: "upstream" },
    });
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toBeUndefined();
    expect(await git(world.folder, ["config", "--get", "remote.origin.pushurl"])).toBe(
      world.fork.origin,
    );
  });

  it("refuses a list saved while an address change releases the project's push address", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    await service.choose(world.repo.id, "upstream", false);
    const next = "https://github.com/examples/project-next.git";
    await git(world.folder, ["remote", "set-url", "origin", next]);
    const refusals: string[] = [];
    const run = gitProcesses.runGitProcess;
    const spy = vi
      .spyOn(gitProcesses, "runGitProcess")
      .mockImplementation((file, args, options) => {
        if (refusals.length === 0 && args.includes("remote.origin.pushurl"))
          try {
            world.repos.configure(world.repo.id, { advisoryWorkflows: pilot });
          } catch (error) {
            refusals.push(error instanceof Error ? error.message : String(error));
          }
        return run(file, args, options);
      });
    try {
      await service.changeAddress(world.repo.id, { origin: next, advisoryWorkflowsCleared: [] });
    } finally {
      spy.mockRestore();
    }
    expect(refusals).toEqual([ADVISORY_WORKFLOWS_MOVING_REFUSAL]);
    expect(world.repos.get(world.repo.id)?.origin).toBe(next);
    expect(world.repos.get(world.repo.id)?.advisoryWorkflows).toBeUndefined();
  });

  // Every change naming an address takes the line, and one naming the address
  // the project has by then is a no-op that keeps its push route in Git.
  it("keeps a contributing project's push address when an address change names the address it has", async () => {
    const world = await fixture();
    world.repos.configure(world.repo.id, { delivery: "direct-pr" });
    const service = world.make();
    await service.discover(world.repo.id);
    await service.choose(world.repo.id, "upstream", false);
    await service.changeAddress(world.repo.id, {
      origin: world.upstream.origin,
      advisoryWorkflowsCleared: [],
    });
    expect(world.repos.get(world.repo.id)).toMatchObject({
      origin: world.upstream.origin,
      contribution: { destination: "upstream" },
    });
    expect(await git(world.folder, ["config", "--get", "remote.origin.pushurl"])).toBe(
      world.fork.origin,
    );
  });

  it("creates a fork only after the consent click and reuses it after reopening the project owner", async () => {
    const world = await fixture(false);
    const service = world.make();
    await service.discover(world.repo.id);
    expect(world.create).not.toHaveBeenCalled();
    expect(world.offer().actions.map((action) => action.label)).toContain(
      CONTRIBUTION_WORDS.makeFork,
    );
    await service.answer(world.choose(world.cards[0], "make-fork"));
    expect(world.create).toHaveBeenCalledTimes(1);
    await world.make().discover(world.repo.id);
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.repos.get(world.repo.id)?.contribution).toMatchObject({
      destination: "upstream",
      fork: world.fork,
    });
  });

  it("never repeats a fork creation whose result is uncertain", async () => {
    const world = await fixture(false);
    world.create.mockRejectedValue(new Error("The connection ended after sending the request"));
    const service = world.make();
    await service.discover(world.repo.id);
    await service.answer(world.choose(world.cards[0], "make-fork"));
    expect(world.repos.get(world.repo.id)?.contribution?.creationAttempted).toBe(true);
    await world.make().discover(world.repo.id);
    await service.answer(world.choose(world.cards.at(-1), "make-fork"));
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.notes.at(-1)).toContain("No create request was repeated");
  });
});
