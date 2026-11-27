import { createHash } from "node:crypto";
import { clearsAdvisoryWorkflows } from "@shared/advisoryWorkflows";
import { type Card, FIRSTMATE_CARD_META } from "@shared/cards";
import {
  CONTRIBUTION_WORDS,
  type ContributionProject,
  type ContributionRoute,
  contributionOriginMatches,
  contributionRouteSchema,
  contributionTransport,
} from "@shared/contributions";
import type { FmEvent } from "@shared/events";
import { forgeOf } from "@shared/forge";
import { said, saidMark } from "@shared/i18n/said";
import {
  ADVISORY_WORKFLOWS_RESET_REFUSAL,
  deliveryForRecord,
  opensPullRequest,
  type RepoView,
} from "@shared/repos";
import { type Forge, ForgeAllowanceSpent, ForgeError, ForgeWriteError } from "../forge";
import { escapeCardText } from "../orchestrator/cardText";
import type { TaskService } from "../tasks/taskService";
import { clearManagedOriginPush, git, preserveWorktreeRemotes, setManagedOriginPush } from "./git";
import type { RepoRegistry } from "./repoRegistry";

type HostCard = Omit<Card, "author" | "priority" | "status" | "createdAt">;
const stamp = (route: ContributionRoute) =>
  createHash("sha256").update(JSON.stringify(route)).digest("hex");

/**
 * The destination card's choices that would clear the project's advisory
 * workflows, as the card names them. Each click carries the list its card
 * showed, so a list saved after the card went up is shown before any write.
 */
function clearingChoices(repo: RepoView): string[] {
  const route = repo.contribution;
  if (!route) return [];
  return (
    [
      [route.upstream, CONTRIBUTION_WORDS.contribute],
      [route.fork, CONTRIBUTION_WORDS.keepFork],
    ] as const
  ).flatMap(([project, label]) =>
    project && clearsAdvisoryWorkflows(repo, project.origin) ? [label] : [],
  );
}

/** A target switch whose advisory reset changed after it was shown; it wrote nothing. */
class ResetChanged extends Error {}

/** Project-owned fork routing, with creation reachable only from an app-authored consent card. */
export class ProjectContributions {
  static ownsOffer(arg: string | undefined): boolean {
    return arg?.startsWith("contribution:") === true;
  }
  private readonly pending = new Map<string, Promise<void>>();
  private readonly choosing = new Map<string, Promise<RepoView>>();
  constructor(
    private readonly options: {
      repos: RepoRegistry;
      tasks?: TaskService;
      broadcastEvent?: (event: FmEvent) => void;
      forgeFor: (repo: RepoView) => Pick<Forge, "contributions" | "defaultBranch">;
      raise: (card: HostCard) => void;
      note: (text: string, outcome: "applied" | "failed") => void;
      /** A later destination change waits for the project's current code tasks. */
      hasWorkingCopy?: (repoId: string) => boolean;
    },
  ) {}

  /** Capture one route before work or publication; ordinary projects retain offline starts. */
  async prepareTask(
    taskId: string,
    tasks: TaskService,
    discover = true,
  ): Promise<string | undefined> {
    const record = tasks.get(taskId);
    if (!record?.repoId) return undefined;
    const repo = this.options.repos.get(record.repoId);
    if (!opensPullRequest(deliveryForRecord(record, repo?.delivery))) return undefined;
    await this.finishChoice(record.repoId);
    if (
      (record.delivery?.publicationOrigin !== undefined || record.delivery?.contribution) &&
      (record.worktreeDir || record.branch || record.delivery?.prNumber !== undefined)
    )
      return undefined;
    if (!discover && !this.options.repos.get(record.repoId)?.contribution) return undefined;
    await this.discover(record.repoId);
    await this.finishChoice(record.repoId);
    const prepared = tasks.get(taskId);
    if (
      prepared?.delivery?.publicationOrigin !== undefined &&
      (prepared.branch || prepared.worktreeDir || prepared.delivery.prNumber !== undefined)
    )
      return undefined;
    const selected = this.options.repos.get(record.repoId);
    const route = selected?.contribution;
    if (!route || !selected) return undefined;
    if (route.destination === null || !route.fork)
      return "The project's contribution card needs the captain's choice before this task can start, push or publish. Nothing was opened.";
    const preferredPush = await git(selected.path, [
      "config",
      "--get",
      "remote.origin.pushurl",
    ]).catch(() => "");
    tasks.delivery.recordChangeEvidence(taskId, {
      contribution: route,
      publicationPushOrigin: contributionTransport(route.fork, preferredPush || selected?.origin),
      publicationOrigin: contributionTransport(
        route.destination === "upstream" ? route.upstream : route.fork,
        selected?.origin,
      ),
    });
    return undefined;
  }

  /** Read facts on add (both Settings and the first mate), or before publication for older projects. */
  discover(repoId: string): Promise<void> {
    const running = this.pending.get(repoId);
    if (running) return running;
    const run = this.discoverOnce(repoId).finally(() => this.pending.delete(repoId));
    this.pending.set(repoId, run);
    return run;
  }

  private async discoverOnce(repoId: string): Promise<void> {
    const repo = this.options.repos.get(repoId);
    if (!repo?.origin || repo.kind !== "project") return;
    if (!repo.contribution && repo.contributionChecked) return;
    if (repo.contribution) {
      if (repo.contribution.destination === null || !repo.contribution.fork) this.offer(repo);
      else {
        const project =
          repo.contribution.destination === "upstream"
            ? repo.contribution.upstream
            : repo.contribution.fork;
        if (!contributionOriginMatches(project, repo.origin, repo.host?.kind))
          await this.choose(repo.id, repo.contribution.destination);
      }
      return;
    }
    const contributions = this.options.forgeFor(repo).contributions;
    if (!contributions) return;
    const facts = await contributions.inspect();
    let route: ContributionRoute;
    if (facts.owned && facts.parent) {
      route = { upstream: facts.parent, fork: facts.project, destination: null };
    } else if (facts.canPush === false) {
      route = {
        upstream: facts.project,
        fork: await contributions.findFork(),
        destination: "upstream",
      };
    } else {
      this.options.repos.markContributionChecked(repo.id);
      return;
    }
    this.checkHost(repo, route);
    await this.preservePrepared(repo, facts.project);
    const saved = this.saveRoute(repo.id, route);
    if (route.destination && route.fork) await this.choose(repo.id, route.destination);
    else this.offer(saved);
  }

  private checkHost(repo: RepoView, raw: ContributionRoute): void {
    const route = contributionRouteSchema.parse(raw);
    if (
      ![route.upstream, route.fork].some(
        (project) => project && contributionOriginMatches(project, repo.origin, repo.host?.kind),
      )
    )
      throw new Error(
        "The project's address changed. Read its contribution settings again before creating or using a fork.",
      );
    for (const project of [route.upstream, route.fork].filter((item) => item !== null)) {
      const where = forgeOf(project.origin);
      const url = new URL(project.origin);
      if (
        url.protocol !== "https:" ||
        url.origin !==
          (repo.origin?.startsWith("https://")
            ? new URL(repo.origin).origin
            : `https://${repo.host?.name}`) ||
        url.username ||
        url.password ||
        where.host !== repo.host?.name ||
        !contributionOriginMatches(project, project.origin, repo.host?.kind)
      )
        throw new Error("The host did not confirm a fork on this project's own host.");
    }
  }

  private offer(repo: RepoView): void {
    const route = repo.contribution;
    if (!route) return;
    const name = escapeCardText(repo.name);
    const choice = route.destination === null;
    const clearing = clearingChoices(repo);
    const arg = (action: string) =>
      `contribution:${JSON.stringify({ repo: repo.id, action, before: stamp(route), clears: clearing })}`;
    const action = (id: string, label: string, picked: string, primary = false) => ({
      id,
      label,
      ...(primary ? { default: true } : {}),
      effect: { kind: "host" as const, op: "apply-project-change" as const, arg: arg(picked) },
    });
    this.options.raise({
      id: `card-project-contribution-${repo.id}`,
      title: choice
        ? CONTRIBUTION_WORDS.destinationTitle(repo.name)
        : CONTRIBUTION_WORDS.consentTitle(repo.name),
      meta: FIRSTMATE_CARD_META,
      body: choice
        ? `<p>${name} is your fork of <span class="inf-mono">${escapeCardText(route.upstream.fullName)}</span>.</p><p>Contribute to the original project, or keep changes in your fork.</p>${clearing.map((label) => saidMark(said("projectsContributionClearsAdvisory", { choice: label }), "p")).join("")}<p>You can change Target project in Settings → Projects later.</p>`
        : route.creationAttempted
          ? `<p>The host has not confirmed your fork of ${name} yet.</p><p>Infinitary will read the result before sending anything else. It will not repeat an uncertain request.</p>`
          : `<p>Your sign-in cannot push to ${name}. Making your fork lets Infinitary contribute changes to its maintainers.</p><p>Infinitary asks once for this project, reuses your fork, and leaves merging to the maintainers.</p>`,
      actions: choice
        ? [
            action("contribute-upstream", CONTRIBUTION_WORDS.contribute, "upstream", true),
            action("keep-fork", CONTRIBUTION_WORDS.keepFork, "fork"),
            { id: "not-now", label: "Not now", declines: true },
          ]
        : [
            action(
              "make-fork",
              route.creationAttempted ? "Check for my fork" : CONTRIBUTION_WORDS.makeFork,
              "create",
              true,
            ),
            { id: "not-now", label: "Not now", declines: true },
          ],
    });
  }

  /** The host's own button, not an agent tool or the question's script. */
  async answer(raw: string | undefined): Promise<void> {
    try {
      const ask = JSON.parse(raw?.slice("contribution:".length) ?? "null") as {
        repo: string;
        action: string;
        before: string;
        clears?: string[];
      } | null;
      if (!ask) return;
      const repo = this.options.repos.get(ask.repo);
      if (!repo?.contribution || stamp(repo.contribution) !== ask.before)
        throw new Error(
          "The project's contribution settings changed. Read them before choosing again.",
        );
      this.checkHost(repo, repo.contribution);
      if (ask.action === "upstream" || ask.action === "fork") {
        try {
          // A card raised before its clicks carried the list showed none.
          await this.choose(repo.id, ask.action, true, ask.clears ?? []);
        } catch (error) {
          if (!(error instanceof ResetChanged)) throw error;
          const current = this.options.repos.get(repo.id);
          if (current) this.offer(current);
        }
        return;
      }
      if (ask.action !== "create") throw new Error("That contribution choice is unavailable.");
      const forge = this.options.forgeFor(repo);
      if (!forge.contributions) throw new Error("This host cannot make a fork.");
      const route = repo.contribution;
      let fork = await forge.contributions.findFork();
      if (!fork && !route.creationAttempted) {
        this.saveRoute(repo.id, { ...route, creationAttempted: true });
        try {
          fork = await forge.contributions.createFork();
        } catch (error) {
          if (
            (error instanceof ForgeWriteError && error.outcome === "failed") ||
            (error instanceof ForgeError && error.beforeSend) ||
            // A spent allowance is the host refusing before it did anything.
            error instanceof ForgeAllowanceSpent
          ) {
            const retry = this.saveRoute(repo.id, { ...route, creationAttempted: false });
            this.offer(retry);
          }
          throw error;
        }
      }
      if (!fork)
        throw new Error("The host has not confirmed the fork. No create request was repeated.");
      const next = { ...route, fork };
      this.checkHost(repo, next);
      this.saveRoute(repo.id, next);
      await this.choose(repo.id, "upstream");
    } catch (error) {
      this.options.note(
        `Could not set up contributions: ${error instanceof Error ? error.message : String(error)}`,
        "failed",
      );
    }
  }

  private announce(repo: RepoView): void {
    this.options.broadcastEvent?.({
      type: "repo_configured",
      repoId: repo.id,
      name: repo.name,
      delivery: repo.delivery,
      autonomy: repo.autonomy,
      rigor: repo.rigor,
      description: `${repo.name} · contribution settings updated`,
    });
  }

  private saveRoute(
    id: string,
    route: ContributionRoute,
    options: { notify?: boolean; originChanged?: boolean } = {},
  ): RepoView {
    const before = this.options.repos.get(id)?.contribution;
    const visible = (value: ContributionRoute | undefined) =>
      value ? JSON.stringify([value.upstream, value.fork, value.destination]) : undefined;
    const updated = this.options.repos.setContribution(id, route);
    if (
      options.notify !== false &&
      (options.originChanged || visible(before) !== visible(updated.contribution))
    )
      this.announce(updated);
    return updated;
  }

  private async preservePrepared(repo: RepoView, source?: ContributionProject): Promise<void> {
    source ??= [repo.contribution?.upstream, repo.contribution?.fork].find(
      (project): project is ContributionProject =>
        Boolean(project && contributionOriginMatches(project, repo.origin, repo.host?.kind)),
    );
    if (!source) return;
    const preferredPush = await git(repo.path, ["config", "--get", "remote.origin.pushurl"]).catch(
      () => "",
    );
    const copies: { dir: string; branch: string }[] = [];
    for (const record of this.options.tasks?.listLive() ?? []) {
      if (
        record.repoId !== repo.id ||
        (!record.branch && !record.worktreeDir) ||
        !opensPullRequest(deliveryForRecord(record, repo.delivery))
      )
        continue;
      if (record.branch && record.worktreeDir && record.worktreeDir !== repo.path)
        copies.push({ dir: record.worktreeDir, branch: record.branch });
      if (record.delivery?.publicationOrigin !== undefined) continue;
      this.options.tasks?.delivery.recordChangeEvidence(record.id, {
        publicationPushOrigin: contributionTransport(
          repo.contribution?.destination === "upstream" && repo.contribution.fork
            ? repo.contribution.fork
            : source,
          preferredPush || repo.origin,
        ),
        publicationOrigin: contributionTransport(source, repo.origin),
        ...(repo.contribution?.destination ? { contribution: repo.contribution } : {}),
      });
    }
    await preserveWorktreeRemotes(repo.path, copies);
  }

  /** Before Settings changes an address/route or removes a project, release its managed push address. */
  async clearPushAddress(repoId: string): Promise<void> {
    const repo = this.options.repos.get(repoId);
    if (!repo?.contribution) return;
    await this.preservePrepared(repo);
    await clearManagedOriginPush(repo.path);
  }

  private async finishChoice(repoId: string): Promise<void> {
    let choosing = this.choosing.get(repoId);
    while (choosing) {
      await choosing;
      choosing = this.choosing.get(repoId);
    }
  }

  /**
   * Serialize target writes; a new task waits before reading its branch's
   * route. `shown` is the reset its card showed (`clearingChoices`); a
   * Settings switch showed the project's as it starts.
   */
  choose(
    repoId: string,
    destination: "upstream" | "fork",
    notify = true,
    shown?: readonly string[],
  ): Promise<RepoView> {
    const previous = this.choosing.get(repoId);
    const next = previous
      ? previous.catch(() => {}).then(() => this.chooseOnce(repoId, destination, notify, shown))
      : this.chooseOnce(repoId, destination, notify, shown);
    const run = next.finally(() => {
      if (this.choosing.get(repoId) === run) this.choosing.delete(repoId);
    });
    this.choosing.set(repoId, run);
    return run;
  }

  private async chooseOnce(
    repoId: string,
    destination: "upstream" | "fork",
    notify: boolean,
    shown?: readonly string[],
  ): Promise<RepoView> {
    const repo = this.options.repos.get(repoId);
    const route = repo?.contribution;
    if (!repo || !route?.fork) throw new Error("This project has no confirmed fork to choose.");
    const reset = JSON.stringify(shown ?? clearingChoices(repo));
    this.checkHost(repo, route);
    const project = destination === "upstream" ? route.upstream : route.fork;
    const same = contributionOriginMatches(project, repo.origin, repo.host?.kind);
    const origin = same && repo.origin ? repo.origin : contributionTransport(project, repo.origin);
    if (!same && route.destination !== null && this.options.hasWorkingCopy?.(repoId))
      throw new Error(
        "Finish the project's current code tasks before changing its target project. Their working copies still use this project's addresses.",
      );
    const branch = same
      ? undefined
      : await this.options.forgeFor({ ...repo, origin }).defaultBranch();
    const preferredPush = await git(repo.path, ["config", "--get", "remote.origin.pushurl"]).catch(
      () => "",
    );
    // The reads above wait on the host, and a list saved meanwhile was never
    // shown as cleared: compare before the first write, which pins prepared
    // tasks' routes, then hold the project's advisory saves until its
    // address is written.
    const current = this.options.repos.get(repoId);
    if (!current || JSON.stringify(clearingChoices(current)) !== reset)
      throw new ResetChanged(ADVISORY_WORKFLOWS_RESET_REFUSAL);
    const release = this.options.repos.holdAdvisoryWorkflows(repoId);
    let updated: RepoView;
    try {
      await this.preservePrepared(repo);
      if (branch) {
        await git(repo.path, [
          "fetch",
          "--quiet",
          "--no-tags",
          origin,
          `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
        ]);
      }
      await clearManagedOriginPush(repo.path);
      if (destination === "upstream")
        await setManagedOriginPush(
          repo.path,
          contributionTransport(route.fork, preferredPush || origin),
        );
      if (branch) {
        await git(repo.path, ["remote", "set-url", "origin", origin]);
        await git(repo.path, [
          "symbolic-ref",
          "refs/remotes/origin/HEAD",
          `refs/remotes/origin/${branch}`,
        ]);
      }
      this.options.repos.configure(repo.id, { origin });
      updated = this.saveRoute(
        repo.id,
        { ...route, destination },
        { notify, originChanged: repo.origin !== origin },
      );
    } finally {
      release();
    }
    this.options.note(
      `New tasks in ${repo.name} now go to ${destination === "upstream" ? "the original project's maintainers" : "your fork"}.`,
      "applied",
    );
    return updated;
  }
}
