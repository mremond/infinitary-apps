import type { ChangePresentationDraft } from "@shared/changePresentation";
import { DEFAULT_CONTRIBUTOR_DISCLOSURE } from "@shared/contributorDisclosure";
import { fixedHoldWords } from "@shared/holds";
import { type MergeReview, mergeRuleWords } from "@shared/mergeReview";
import { RISK_DIMENSIONS, type RiskDeclaration } from "@shared/risk";
import { describe, expect, it, vi } from "vitest";
import {
  FakeForge,
  insertDirectPrTask,
  insertTask,
  setup,
} from "../../../tests/helpers/prCiHarness";
import { seedDelivery } from "../../../tests/helpers/taskDelivery";
import {
  type ForgeApi,
  ForgeBaseMoved,
  type ForgeChange,
  type ForgeCheck,
  ForgeError,
  type ForgePull,
  type ForgeReadiness,
  type ForgeRuleset,
  type ForgeSkipMerge,
  forkStoryForge,
  parseApiRequest,
} from "../forge";
import { stageChangePresentation } from "../pi/changePresentation";
import type { MergeGuard } from "./changeMerge";

const HEAD = "4f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39";
const MERGED = "b2e6d0c94a8f7e6d5c4b3a2918f7e6d5c4b3a201";

function openPull(overrides: Partial<ForgePull> = {}): ForgePull {
  return {
    number: 23,
    state: "open",
    merged: false,
    headSha: HEAD,
    base: "main",
    branch: "fm/task-ab12cd34",
    headRepo: "x/y",
    title: "fix(crew): keep a renewed conversation's reason across a restart",
    readiness: "clean",
    ...overrides,
  };
}

/** The rule set GitHub reads for the default branch when the sign-in may skip it. */
const SKIPPABLE: ForgeRuleset = {
  id: 7,
  name: "main checks",
  bypass: "always",
  rules: ["required_status_checks"],
};

/**
 * A task on a GitHub project x/y whose pull request #23 the host reads by its
 * number, with its branch rules and the merge past them. The test moves
 * `host` between calls. A shape puts the project's delivery ask on the task.
 */
async function onGitHub(
  shape?: { delivery_ask: "queue-pr" },
  prepareContribution?: (taskId: string) => Promise<string | undefined>,
) {
  const forge = new FakeForge();
  const harness = setup({
    forge,
    ...(prepareContribution ? { prepareContribution } : {}),
  });
  await insertDirectPrTask(harness.tasks, harness.repos, {
    ...(shape ? { shape: { kind: "fix", kind_source: "none", ...shape } } : {}),
  });
  const task = harness.tasks.get("ab12cd34");
  if (!task?.repoId) throw new Error("the task has no project");
  harness.repos.configure(task.repoId, { origin: "https://github.com/x/y.git" });
  forge.change = {
    number: 23,
    url: "https://github.com/x/y/pull/23",
    branch: task.branch ?? "",
    headSha: HEAD,
    title: openPull().title,
  };
  const host: {
    pull: ForgePull;
    readFails?: Error;
    rules: ForgeRuleset[];
    send: ForgeSkipMerge | Error;
    /** What the pull request reads as once the merge past the rules was sent. */
    afterSend?: ForgePull;
    /** Whether the review read as sent when the merge went out: it is marked before the send. */
    markedAtSend?: boolean;
  } = { pull: openPull(), rules: [SKIPPABLE], send: { status: "merged" } };
  let sent = false;
  const putInSkippingRules = vi.fn(
    async (_change: ForgeChange, _headSha: string): Promise<ForgeSkipMerge> => {
      sent = true;
      host.markedAtSend = (harness.tasks.get(task.id)?.delivery?.mergeReviews ?? []).some(
        (item) => item.skips && item.sent !== undefined,
      );
      if (host.send instanceof Error) throw host.send;
      return host.send;
    },
  );
  Object.assign(forge, {
    pull: async (number: number): Promise<ForgePull> => {
      if (host.readFails) throw host.readFails;
      if (sent && host.afterSend) return { ...host.afterSend, number };
      return { ...host.pull, number };
    },
    branchRules: async () => host.rules,
    putInSkippingRules,
  });
  const reviews = () => harness.tasks.get(task.id)?.delivery?.mergeReviews ?? [];
  const skipInput = (overrides: { headSha?: string; method?: "squash" } = {}) => ({
    pull: 23,
    skipRules: { headSha: HEAD, method: "squash" as const, ...overrides },
  });
  const prepareSkip = async (): Promise<MergeReview> => {
    const answer = await harness.service.checkTool.checkForCrew(task.id, skipInput());
    expect(answer).toContain("skipping the branch rules");
    const review = reviews().find((item) => item.skips);
    if (!review) throw new Error(`no review stored: ${answer}`);
    return review;
  };
  const prepare = async (): Promise<MergeReview> => {
    const answer = await harness.service.checkTool.checkForCrew(task.id, { pull: 23 });
    expect(answer).toContain("Merge review mr");
    const review = reviews().find((item) => !item.skips);
    if (!review) throw new Error(`no review stored: ${answer}`);
    return review;
  };
  return {
    ...harness,
    forge,
    task,
    host,
    putInSkippingRules,
    reviews,
    skipInput,
    prepareSkip,
    prepare,
  };
}

/**
 * A reviewed fork pull request on x/y whose story the crew published through
 * open_change, with the project's saved disclosure set first when given. The
 * comment stand-in keeps the one comment the story writes and every write.
 */
async function publishedForkStory(disclosure?: string) {
  const at = await onGitHub();
  if (disclosure !== undefined && at.task.repoId)
    at.repos.configure(at.task.repoId, { contributorDisclosure: disclosure });
  at.host.pull = openPull({ title: "Fix typo", headRepo: "contributor/y", headRepoId: 912 });
  const review = await at.prepare();
  let comment: { id: number; body: string } | undefined;
  const writes: string[] = [];
  const api: ForgeApi = {
    place: "GitHub",
    defaultPerPage: 100,
    route: (method, path) => parseApiRequest(method, path, { owner: "x", name: "y" }),
    nextPath: () => null,
    call: async (method, path, body) => {
      if (method !== "GET") {
        writes.push(`${method} ${path}`);
        comment = { id: 41, body: JSON.parse(body ?? "{}").body };
      }
      return {
        status: 200,
        requestId: null,
        rateLimit: null,
        retryAfterSeconds: null,
        link: null,
        body: JSON.stringify(method === "GET" ? (comment ? [comment] : []) : comment),
      };
    },
  };
  Object.assign(at.forge, {
    api,
    attachments: {
      destination: async () => ({
        host: review.host,
        projectId: 1,
        fullName: `${review.owner}/${review.name}`,
        visibility: "public",
      }),
      upload: async () => {
        throw new Error("The text-only review story has no media to upload.");
      },
    },
  });
  at.forge.change = null;
  at.readHead.mockResolvedValue(review.headSha);
  const draft: ChangePresentationDraft = {
    title: "fix: correct the typo",
    base: review.headSha,
    head: review.headSha,
    publishable: true,
    why: ["A word was misspelled."],
    whatChanged: ["The word is spelled correctly."],
    before: ["The page showed the typo."],
    after: ["The page shows the word spelled correctly."],
    views: [],
    noPicture: "The change corrects one word.",
    checked: [{ check: "Source review", result: "The selected version's checks passed." }],
    verification: [],
    risk: Object.fromEntries(
      RISK_DIMENSIONS.map((dimension) => [
        dimension,
        { level: "low", why: "This fixture corrects one word." },
      ]),
    ) as RiskDeclaration,
    requiredActions: [],
    unfinished: [],
  };
  const staged = await stageChangePresentation(draft, {
    taskId: at.task.id,
    worktree: at.paths,
    dir: at.paths,
  });
  expect(await at.service.publication.preparePresentation(at.task.id, staged)).toContain(
    "Prepared presentation",
  );
  const revision = at.tasks.delivery.changePresentation(at.task.id)?.revisions.at(-1)?.revision;
  if (revision === undefined) throw new Error("The fork story was not prepared");
  expect(
    await at.service.publication.open(at.task.id, { title: draft.title, presentation: revision }),
  ).toContain("Published the crew's story in a comment");
  return { at, review, writes, comment: () => comment?.body };
}

describe("preparing a review of a pull request named by its number", () => {
  it("refuses, storing nothing, a number, project, host or pull request it cannot review", async () => {
    const { service, task, host, reviews, forge } = await onGitHub();
    const ask = (pull: number) => service.checkTool.checkForCrew(task.id, { pull });
    expect(await ask(0)).toBe("Merge review refused: pull must be the pull request's number.");
    expect(await ask(2.5)).toBe("Merge review refused: pull must be the pull request's number.");
    host.readFails = new ForgeError("refused", "GitHub answered 404 to GET /repos/x/y/pulls/23");
    expect(await ask(23)).toBe(
      "Merge review refused: could not read pull request 23. GitHub answered 404 to GET /repos/x/y/pulls/23",
    );
    host.readFails = new ForgeError("sign-in", "GitHub answered 401");
    expect(await ask(23)).toBe(
      "Not signed in to GitHub (github.com). Report this as a blocker: the captain signs in to GitHub in the app's Settings. Do not sign in yourself, and do not look for another way in.",
    );
    host.readFails = undefined;
    host.pull = openPull({ state: "closed" });
    expect(await ask(23)).toBe("Merge review refused: pull request 23 is not open.");
    host.pull = openPull({ merged: true, state: "closed" });
    expect(await ask(23)).toBe("Merge review refused: pull request 23 is not open.");
    host.pull = openPull({ branch: undefined });
    expect(await ask(23)).toBe(
      "Merge review refused: pull request 23 did not name its branch, version and destination.",
    );
    host.pull = openPull({ headRepo: undefined });
    expect(await ask(23)).toBe(
      "Merge review refused: pull request 23 did not name its source repository.",
    );
    host.pull = openPull();
    const absent = (overrides: Partial<{ headSha: string; evidence: string; localGate: string }>) =>
      service.checkTool.checkForCrew(task.id, {
        pull: 23,
        absentChecks: {
          headSha: HEAD,
          evidence: "The project has no workflows.",
          localGate: "pnpm check passed",
          ...overrides,
        },
      });
    const absenceRefusal =
      "Merge review refused: an absence declaration must name this pull request's current version, the workflow and changed-file evidence, and the local gate run at that version.";
    expect(await absent({ headSha: MERGED })).toBe(absenceRefusal);
    expect(await absent({ evidence: "  " })).toBe(absenceRefusal);
    expect(await absent({ localGate: "" })).toBe(absenceRefusal);
    expect(reviews()).toEqual([]);
    Object.assign(forge, { pull: undefined });
    expect(await ask(23)).toBe(
      "Merge review refused: where this project lives has no pull requests to read.",
    );
    const plain = setup();
    await insertDirectPrTask(plain.tasks, plain.repos);
    expect(await plain.service.checkTool.checkForCrew("ab12cd34", { pull: 23 })).toBe(
      "Merge review refused: this project has no pull requests where it lives.",
    );
    expect(reviews()).toEqual([]);
  });

  it("refuses skipRules without a pull request number, and a change id the task does not have", async () => {
    const { service, task } = await onGitHub();
    expect(
      await service.checkTool.checkForCrew(task.id, {
        skipRules: { headSha: HEAD, method: "squash" },
      }),
    ).toBe("Merge review refused: skipRules goes with pull, the pull request's number.");
    expect(await service.checkTool.checkForCrew(task.id, { change: "ch-unknown" })).toMatch(
      /^check_change refused: "ch-unknown" is not one of this task's changes; its changes are [0-9a-f]{8}\.$/,
    );
    const fresh = setup();
    insertTask(fresh.tasks);
    expect(await fresh.service.checkTool.checkForCrew("ab12cd34", { change: "ch-unknown" })).toBe(
      "check_change refused: this task has no change record yet; leave change out.",
    );
  });

  it("stores the review, names it and selects it, granting nothing", async () => {
    const { service, task, prepare, reviews } = await onGitHub();
    const review = await prepare();
    expect(review).toMatchObject({
      kind: "github",
      host: "github.com",
      owner: "x",
      name: "y",
      number: 23,
      headSha: HEAD,
      base: "main",
      branch: "fm/task-ab12cd34",
      method: "squash",
      title: "fix(crew): keep a renewed conversation's reason across a restart",
    });
    expect(review.id).toMatch(/^mr[0-9a-f]{12}$/);
    expect(reviews()).toHaveLength(1);
    expect(await service.reviews.reviewGate(task.id, review.id)).toBeUndefined();
  });
});

// Accepted contributor plan, piece A: a crewmate names a fork and the
// captain's click merges only that source at that version. The in-memory
// host readings are the remote fixture; real task storage owns the consent.
describe("reviewed contributor changes", () => {
  // The saved-story click defect exposed by the accepted contributor plan:
  // its ordinary merge must use the real published comment and crew title,
  // even when the fork's branch collides with the task's own branch.
  // Real task/presentation owners prepare, publish and verify the story;
  // only the existing forge's remote readings and writes are stand-ins.
  it.each(["direct-pr", "direct-pr-with-contribution-hook", "queue-pr"] as const)(
    "the ordinary saved-story merge uses the selected fork's comment for %s",
    async (delivery) => {
      const contribution =
        delivery === "direct-pr-with-contribution-hook"
          ? vi.fn(async () => "The task's own contribution would need setup")
          : undefined;
      const at = await onGitHub(
        delivery.startsWith("direct-pr") ? undefined : { delivery_ask: "queue-pr" },
        contribution,
      );
      at.host.pull = openPull({ title: "Fix typo", headRepo: "contributor/y", headRepoId: 912 });
      const review = await at.prepare();
      const comments: { id: number; body: string }[] = [];
      const writes: string[] = [];
      const api: ForgeApi = {
        place: "GitHub",
        defaultPerPage: 100,
        route: (method, path) => parseApiRequest(method, path, { owner: "x", name: "y" }),
        nextPath: () => null,
        call: async (method, path, body) => {
          if (method !== "GET") {
            writes.push(`${method} ${path}`);
            comments.push({ id: 41, body: JSON.parse(body ?? "{}").body });
          }
          return {
            status: 200,
            requestId: null,
            rateLimit: null,
            retryAfterSeconds: null,
            link: null,
            body: JSON.stringify(method === "GET" ? comments : comments[0]),
          };
        },
      };
      Object.assign(at.forge, {
        api,
        attachments: {
          destination: async () => ({
            host: review.host,
            projectId: 1,
            fullName: `${review.owner}/${review.name}`,
            visibility: "public",
          }),
          upload: async () => {
            throw new Error("The text-only review story has no media to upload.");
          },
        },
      });
      // Like the real host, the project branch lookup cannot find this fork.
      at.forge.change = null;
      at.readHead.mockResolvedValue(review.headSha);
      const draft: ChangePresentationDraft = {
        title: "fix: preserve the contributor's explanation",
        base: review.headSha,
        head: review.headSha,
        publishable: true,
        why: ["Contributors keep their request text."],
        whatChanged: ["The crew publishes its review in a comment."],
        before: ["The merge used the contributor's title."],
        after: ["The merge uses the crew's story title."],
        views: [],
        noPicture: "This change affects the merged commit, not an app view.",
        checked: [{ check: "Source review", result: "The selected version's checks passed." }],
        verification: [],
        risk: Object.fromEntries(
          RISK_DIMENSIONS.map((dimension) => [
            dimension,
            { level: "low", why: "This fixture preserves the contribution's text." },
          ]),
        ) as RiskDeclaration,
        requiredActions: [],
        unfinished: [],
      };
      const staged = await stageChangePresentation(draft, {
        taskId: at.task.id,
        worktree: at.paths,
        dir: at.paths,
      });
      const storyForge = forkStoryForge(at.forge, review, at.task.id, undefined);
      if (contribution) {
        // A selected fork's comment is not publication of the task's own contribution.
        expect(await at.service.publication.preparePresentation(at.task.id, staged)).toContain(
          "Prepared presentation",
        );
        const revision = at.tasks.delivery
          .changePresentation(at.task.id)
          ?.revisions.at(-1)?.revision;
        if (revision === undefined) throw new Error("The fork story was not prepared");
        expect(
          await at.service.publication.open(at.task.id, {
            title: draft.title,
            presentation: revision,
          }),
        ).toContain("Published the crew's story in a comment");
        expect(contribution).not.toHaveBeenCalled();
      } else {
        const revision = await at.presentations.prepare(at.task.id, staged, storyForge);
        await at.presentations.publish(
          at.task.id,
          revision,
          storyForge,
          review.branch,
          draft.title,
        );
      }
      const dispatched: ForgeChange[] = [];
      at.forge.putIn = async (change) => {
        dispatched.push(change);
        return undefined;
      };
      const guard: MergeGuard = {
        head: review.headSha,
        prNumber: review.number,
        unattended: false,
        beforeDispatch: () => undefined,
      };
      // A pull request the task names by its number merges as its own, whatever the project's delivery.
      expect(await at.service.merges.merge(at.task.id, guard)).toMatchObject({ ok: true });
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toMatchObject({
        number: review.number,
        headSha: review.headSha,
        title: draft.title,
      });
      expect(dispatched[0]?.squashMessage).toContain(draft.whatChanged[0]);
      expect(at.host.pull.title).toBe("Fix typo");
      expect(writes).toEqual([`POST /repos/x/y/issues/${review.number}/comments`]);
    },
  );
  // The captain's words: "when we reply to outside contributors, we should
  // always disclose this is made by an infinitary crewmate". A merge that
  // finds the pull request past its published story republishes the comment,
  // and that rebuilt comment still opens with the project's line.
  it.each(["ordinary", "numbered"] as const)(
    "the %s merge that republishes a moved review story keeps the project's disclosure line",
    async (route) => {
      const { at, review, comment, writes } = await publishedForkStory();
      expect(comment()).toContain(DEFAULT_CONTRIBUTOR_DISCLOSURE);
      // The contributor pushes past the published story, and the crew reviews
      // that version: the merge finds the story behind it.
      const MOVED = "c3f7e1d05b9a8f7e6d5c4b3a2918f7e6d5c4b3a2";
      at.host.pull = { ...at.host.pull, headSha: MOVED };
      at.readHead.mockResolvedValue(MOVED);
      await at.prepare();
      const reviewed = at.reviews().find((item) => item.headSha === MOVED);
      if (!reviewed) throw new Error("The moved version was not reviewed");
      at.forge.putIn = async () => undefined;
      const result =
        route === "ordinary"
          ? await at.service.merges.merge(at.task.id)
          : await at.service.reviews.mergeReview(at.task.id, reviewed.id);
      expect(result, result.text).toMatchObject({ ok: true });
      expect(writes).toEqual([
        `POST /repos/x/y/issues/${review.number}/comments`,
        "PATCH /repos/x/y/issues/comments/41",
      ]);
      expect(comment()).toContain(DEFAULT_CONTRIBUTOR_DISCLOSURE);
    },
  );
  // The captain's per-project ask: "default disclosure on, but user can
  // either turn it off or edit the disclosure line". The project's saved
  // setting decides the line open_change posts.
  it("a project's own saved line replaces the default in the posted review comment", async () => {
    const own = "_Reviewed with help from an AI crewmate._";
    const { comment } = await publishedForkStory(own);
    expect(comment()).toContain(`<!-- infinitary-story:ab12cd34:start -->\n\n${own}\n\n# `);
    expect(comment()).not.toContain(DEFAULT_CONTRIBUTOR_DISCLOSURE);
  });
  it("a project with the disclosure turned off posts its review comment with no line", async () => {
    const { comment } = await publishedForkStory("");
    expect(comment()).toContain(
      "<!-- infinitary-story:ab12cd34:start -->\n\n# fix: correct the typo",
    );
    expect(comment()).not.toContain(DEFAULT_CONTRIBUTOR_DISCLOSURE);
  });
  // Accepted naming boundary: fork merge paths add no conventional-title wording rule.
  it.each(["ordinary", "numbered"] as const)(
    "the %s fork path accepts the request's unchanged wording",
    async (route) => {
      const at = await onGitHub();
      at.host.pull = openPull({ title: "Fix typo", headRepo: "contributor/y", headRepoId: 912 });
      const review = await at.prepare();
      // A real fork host exposes an empty comments resource even when no story was published.
      const api: ForgeApi = {
        place: "GitHub",
        defaultPerPage: 100,
        route: (method, path) => parseApiRequest(method, path, { owner: "x", name: "y" }),
        nextPath: () => null,
        call: async (method) => {
          if (method !== "GET") throw new Error("No-story merging must not write a story");
          return {
            status: 200,
            requestId: null,
            rateLimit: null,
            retryAfterSeconds: null,
            link: null,
            body: "[]",
          };
        },
      };
      Object.assign(at.forge, { api });
      const sent = vi.spyOn(at.forge, "putIn");
      const result =
        route === "ordinary"
          ? await at.service.merges.merge(at.task.id)
          : await at.service.reviews.mergeReview(at.task.id, review.id);
      expect(result, result.text).toMatchObject({ ok: true });
      expect(sent).toHaveBeenCalledWith(
        expect.objectContaining({ title: review.title, headSha: review.headSha }),
        review.headSha,
        // This stand-in forge reads no allowed merges, so none is chosen for it.
        undefined,
      );
    },
  );

  it("reads checks by number and version even when a project branch has the same name", async () => {
    const at = await onGitHub();
    at.host.pull = openPull({ headRepo: "contributor/y", headRepoId: 912 });
    // A project branch with precisely the fork's name is a different PR.
    at.forge.change = {
      number: 99,
      headSha: MERGED,
      branch: at.host.pull.branch ?? "",
      url: null,
      title: at.host.pull.title,
    };
    const review = await at.prepare();
    expect(review).toMatchObject({ headRepo: "contributor/y", headRepoId: 912, headSha: HEAD });
    expect(at.tasks.get(at.task.id)?.delivery?.checkTarget?.number).toBe(review.number);
    expect(
      at.tasks
        .changesFor(at.task.id)
        .find((change) => change.handle?.number === review.number)
        ?.versions.find((version) => version.head === HEAD)?.checks?.snapshot?.headSha,
    ).toBe(HEAD);
    expect(await at.service.reviews.reviewGate(at.task.id, review.id)).toBeUndefined();
    const merged = await at.service.reviews.mergeReview(at.task.id, review.id);
    expect(merged, merged.text).toMatchObject({ ok: true, receipt: { head: HEAD } });
    // The merge names the fork's pull request at its version, never the project's #99.
    expect(at.forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([
      `putIn ${review.branch} ${HEAD}`,
    ]);
  });

  it.each([
    { headRepo: "another/y" },
    { headRepoId: 913 },
    { headSha: MERGED },
    { branch: "another-branch" },
  ])("refuses a changed source or version before the merge click: %j", async (changed) => {
    const at = await onGitHub({ delivery_ask: "queue-pr" });
    at.host.pull = openPull({ headRepo: "contributor/y", headRepoId: 912 });
    const review = await at.prepare();
    at.host.pull = { ...at.host.pull, ...changed };
    expect(await at.service.reviews.reviewGate(at.task.id, review.id)).toMatch(/Card refused/);
    expect((await at.service.reviews.mergeReview(at.task.id, review.id)).ok).toBe(false);
    expect(at.forge.calls.some((call) => call.startsWith("putIn "))).toBe(false);
  });

  it("does not carry a contributor approval to a later repair version", async () => {
    const at = await onGitHub();
    at.host.pull = openPull({ headRepo: "contributor/y" });
    const review = await at.prepare();
    at.host.pull.headSha = MERGED;
    const outcome = await at.service.reviews.mergeReview(at.task.id, review.id, {
      head: MERGED,
      prNumber: review.number,
      unattended: true,
      held: () => undefined,
      beforeDispatch: () => undefined,
    });
    expect(outcome).toMatchObject({ ok: false, stop: "moved" });
    expect(at.forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  // INF-7061 builds INF-7050's approved plan (the captain: "i'd like to make
  // it my crew's responsibility to carry an all-good-to-go PR across the
  // finish line", with the pick "The author's own branch, so their pull
  // request merges as theirs"): the crew's update on the contributor's
  // branch, once a repair declaration the host accepted carried the
  // captain's kept approval to it, merges with no new click.
  it("carries a contributor approval to the crew's update a repair declaration carried it to", async () => {
    const at = await onGitHub();
    at.host.pull = openPull({ headRepo: "contributor/y", maintainerCanModify: true });
    const review = await at.prepare();
    seedDelivery(at.tasks, at.task.id, {
      mergeAuthorization: {
        version: 1,
        id: "approval-fork",
        generation: 1,
        issuer: "captain",
        at: 1,
        card: { id: "merge-fork", offerId: "offer-1", actionId: "merge" },
        target: {
          repoId: at.task.repoId ?? "",
          host: "github.com",
          owner: "x",
          name: "y",
          prNumber: review.number,
          branch: review.branch,
          delivery: "direct-pr",
          method: "squash",
        },
        approvedHead: HEAD,
        review,
        proceedWithOpen: false,
        status: "standing",
        lineage: [
          {
            fromHead: HEAD,
            toHead: MERGED,
            newBase: "9aee67a6300bf6bef94376f3a94b02b690d9b097",
            impact: "none",
            changedPaths: [],
            evidence: "kept both imports at the top of one file",
            validation: "the merge's checks",
            generation: 1,
            at: 2,
          },
        ],
      },
    });
    at.host.pull.headSha = MERGED;
    const outcome = await at.service.reviews.mergeReview(at.task.id, review.id, {
      head: MERGED,
      prNumber: review.number,
      unattended: true,
      held: () => undefined,
      beforeDispatch: () => undefined,
    });
    expect(outcome, outcome.text).toMatchObject({ ok: true });
    expect(at.forge.calls).toContain(`putIn ${review.branch} ${MERGED}`);
  });

  it("tells a review of a contributor who allows maintainer edits that the crew may push to their branch", async () => {
    const at = await onGitHub();
    at.host.pull = openPull({ headRepo: "contributor/y", maintainerCanModify: true });
    const answer = await at.service.checkTool.checkForCrew(at.task.id, { pull: 23 });
    expect(answer).toContain(
      `the crew may push to their branch, ${at.host.pull.branch} in contributor/y.`,
    );
    at.host.pull = openPull({ headRepo: "contributor/y" });
    expect(await at.service.checkTool.checkForCrew(at.task.id, { pull: 23 })).not.toContain(
      "the crew may push to their branch",
    );
  });

  it("records a reviewed fork's merge on the fork's own change, never on the task's", async () => {
    const at = await onGitHub({ delivery_ask: "queue-pr" });
    at.host.pull = openPull({ headRepo: "contributor/y" });
    const review = await at.prepare();
    expect((await at.service.reviews.mergeReview(at.task.id, review.id)).ok).toBe(true);
    expect(at.forge.calls).toContain(`putIn ${review.branch} ${HEAD}`);
    const forks = at.tasks
      .changesFor(at.task.id)
      .filter((change) => change.handle?.number === review.number);
    expect(forks).toHaveLength(1);
    expect(forks[0]?.receipt?.outcome).toBe("merged");
    expect(at.tasks.changeFor(at.task.id)?.receipt).toBeNull();
  });
});

describe("check_change's own-pull absence declaration and its declarations (INF-1955, FI3-304)", () => {
  it("refuses an own-pull absence declaration it cannot read, or on a host with no checks", async () => {
    const { service, task, forge } = await onGitHub();
    const declare = () =>
      service.checkTool.checkForCrew(task.id, {
        absentChecks: {
          headSha: HEAD,
          evidence: "The project has no workflows.",
          localGate: "pnpm check passed",
        },
      });
    forge.failChangeForTimes = 1;
    forge.fail.changeFor = new ForgeError("transient", "could not reach GitHub: socket hang up");
    expect(await declare()).toBe(
      "Absence declaration refused: could not read this task's pull request. could not reach GitHub: socket hang up",
    );
    forge.failChangeForTimes = 1;
    forge.fail.changeFor = new ForgeError("sign-in", "GitHub answered 401");
    expect(await declare()).toBe(
      "Not signed in to GitHub (github.com). Report this as a blocker: the captain signs in to GitHub in the app's Settings. Do not sign in yourself, and do not look for another way in.",
    );
    const plain = new FakeForge({ kind: "git", place: "git.example.com" });
    const harness = setup({ forge: plain });
    await insertDirectPrTask(harness.tasks, harness.repos);
    expect(
      await harness.service.checkTool.checkForCrew("ab12cd34", {
        absentChecks: { headSha: HEAD, evidence: "none", localGate: "passed" },
      }),
    ).toBe(
      "Absence declaration refused: git.example.com runs no checks, so there is nothing to declare; the reading already says so.",
    );
  });

  it("refuses a conflict repair sent beside a diagnosis, repair or rerun, recording nothing", async () => {
    const { service, task, tasks } = await onGitHub();
    const before = tasks.get(task.id)?.delivery;
    expect(
      await service.checkTool.checkForCrew(task.id, {
        conflictRepair: {
          fromHead: HEAD,
          toHead: MERGED,
          newBase: "9d3c0f1e2b4a5968778695a4b3c2d1e0f9a8b7c6",
          impact: "none",
          changedPaths: [],
          evidence: "Brought up to date; only the conflicted file changed.",
          validation: "pnpm test passed",
        },
        rerun: { headSha: HEAD, check: "critical-path", evidence: "A runner lost its connection." },
      }),
    ).toBe(
      "Check declaration refused: send a conflictRepair on its own, not beside a diagnosis, repair or rerun.",
    );
    expect(tasks.get(task.id)?.delivery).toEqual(before);
  });
});

describe("preparing a merge past the branch rules (FI3-1571 piece 2)", () => {
  it("refuses, storing nothing, what it may not skip, word for word", async () => {
    const { service, task, host, reviews, skipInput, forge } = await onGitHub();
    const ask = (input = skipInput()) => service.checkTool.checkForCrew(task.id, input);
    host.pull = openPull({ readiness: "blocked" });
    expect(
      await service.checkTool.checkForCrew(task.id, { pull: 0, skipRules: skipInput().skipRules }),
    ).toBe("Merge review refused: pull must be the pull request's number.");
    expect(
      await ask({
        pull: 23,
        skipRules: { headSha: HEAD, method: "merge" as unknown as "squash" },
      }),
    ).toBe("Merge review refused: a merge that skips the branch rules uses squash only.");
    expect(await ask(skipInput({ headSha: MERGED }))).toBe(
      `Merge review refused: pull request 23 is at ${HEAD}, not the version you named (${MERGED}). Read it again and prepare the review at the version you mean.`,
    );
    host.pull = openPull({ readiness: "blocked", headRepo: "someone/y" });
    expect(await ask()).toBe(
      "Merge review refused: pull request 23 is not a branch in x/y. Forks are out of scope for a merge past the branch rules.",
    );
    host.pull = openPull({ readiness: "blocked", base: "release" });
    expect(await ask()).toBe(
      "Merge review refused: pull request 23 merges into release, not this project's default branch.",
    );
    for (const [readiness, plain] of [
      ["conflict", "it conflicts with newer work in the project"],
      ["draft", "its pull request is a draft"],
      ["computing", "GitHub has not worked out whether it can merge yet"],
    ] as const) {
      host.pull = openPull({ readiness });
      expect(await ask()).toBe(
        `Merge review refused: ${plain}. Skipping rules does not change that.`,
      );
    }
    host.pull = openPull({ readiness: "blocked" });
    for (const bypass of ["never", null] as const) {
      host.rules = [SKIPPABLE, { id: 8, name: "release gate", bypass, rules: ["pull_request"] }];
      expect(await ask()).toBe(
        "Merge review refused: GitHub says your sign-in may not skip the rule set release gate.",
      );
    }
    host.rules = [{ ...SKIPPABLE, rules: ["pull_request"], mergeMethods: ["merge", "rebase"] }];
    expect(await ask()).toBe(
      "Merge review refused: the rule set main checks allows no squash merge, the one method the app sends.",
    );
    for (const readiness of ["blocked", "behind"] as const) {
      host.rules = [];
      host.pull = openPull({ readiness });
      expect(await ask()).toBe(
        "Merge review refused: GitHub holds it by a rule outside its rule sets, such as classic branch protection, which the app cannot skip.",
      );
    }
    host.rules = [SKIPPABLE];
    host.pull = openPull({ readiness: "clean" });
    expect(await ask()).toBe(
      "Merge review refused: nothing holds pull request 23: GitHub reports no rule or terminal failure to skip. Prepare an ordinary review with pull alone.",
    );
    host.pull = openPull({ readiness: "blocked" });
    forge.fail.checks = new ForgeError("transient", "could not reach GitHub: socket hang up");
    expect(await ask()).toBe(
      "Merge review refused: the checks or the branch rules could not be read. could not reach GitHub: socket hang up",
    );
    forge.fail.checks = undefined;
    const read = forge.checks.bind(forge);
    forge.checks = async (change, movedPast) => ({
      ...(await read(change, movedPast)),
      problem: "GitHub answered 403 to GET /repos/x/y/commits/checks",
    });
    expect(await ask()).toBe(
      "Merge review refused: The checks cannot be read. GitHub answered 403 to GET /repos/x/y/commits/checks",
    );
    expect(reviews().some((review) => review.skips)).toBe(false);
  });

  it("refuses, storing nothing, a pull request it cannot read or that is not open", async () => {
    const { service, task, host, reviews, skipInput } = await onGitHub();
    const ask = () => service.checkTool.checkForCrew(task.id, skipInput());
    host.readFails = new ForgeError("refused", "GitHub answered 404 to GET /repos/x/y/pulls/23");
    expect(await ask()).toBe(
      "Merge review refused: could not read pull request 23. GitHub answered 404 to GET /repos/x/y/pulls/23",
    );
    host.readFails = new ForgeError("sign-in", "GitHub answered 401");
    expect(await ask()).toBe(
      "Not signed in to GitHub (github.com). Report this as a blocker: the captain signs in to GitHub in the app's Settings. Do not sign in yourself, and do not look for another way in.",
    );
    host.readFails = undefined;
    host.pull = openPull({ readiness: "blocked", state: "closed" });
    expect(await ask()).toBe("Merge review refused: pull request 23 is not open.");
    host.pull = openPull({ readiness: "blocked", base: "" });
    expect(await ask()).toBe(
      "Merge review refused: pull request 23 did not name its branch, version and destination.",
    );
    expect(reviews()).toEqual([]);
  });

  it("refuses on a host that cannot merge past its rules", async () => {
    const gitlab = new FakeForge({ kind: "gitlab", place: "git.example.com" });
    const harness = setup({ forge: gitlab });
    await insertDirectPrTask(harness.tasks, harness.repos);
    const repoId = harness.tasks.get("ab12cd34")?.repoId ?? "";
    harness.repos.configure(repoId, { origin: "https://git.example.com/x/y.git" });
    Object.assign(gitlab, { pull: async () => openPull({ readiness: "blocked" }) });
    expect(
      await harness.service.checkTool.checkForCrew("ab12cd34", {
        pull: 23,
        skipRules: { headSha: HEAD, method: "squash" },
      }),
    ).toBe(
      "Merge review refused: a merge that skips the branch rules is available on GitHub, including GitHub Enterprise, only.",
    );
  });

  it("names each rule it skips and each failed check, granting nothing", async () => {
    const { service, task, host, forge, skipInput } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    host.rules = [
      SKIPPABLE,
      { id: 9, name: "reviews", bypass: "pull_requests_only", rules: ["pull_request"] },
    ];
    forge.names = ["typecheck-lint-build", "critical-path"];
    forge.states = ["success", "failure"];
    const answer = await service.checkTool.checkForCrew(task.id, skipInput());
    const lines = answer.split("\n");
    expect(lines.find((line) => line.startsWith("Merge review mr"))).toMatch(
      new RegExp(
        `^Merge review mr[0-9a-f]{12} for #23 at ${HEAD} into main on GitHub, skipping the branch rules\\.$`,
      ),
    );
    expect(lines).toContain("Your merge card merges it, its review naming this review.");
    expect(lines).toContain(
      "It may skip these rules, each of which GitHub says your sign-in may skip: required checks (main checks); a review before merging (reviews).",
    );
    expect(lines).toContain("It merges with these checks failed: critical-path.");
  });

  // docs/forge.md, "Advisory workflows": a merge past the rules waits on and
  // names an advisory workflow's check as GitHub reported it.
  it("waits on an advisory check and names a failed one, as GitHub reported them", async () => {
    const { service, task, host, forge, skipInput, reviews } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    let early: ForgeCheck = { name: "early-tests", state: "neutral", advisory: "pending" };
    forge.checks = async () => ({
      items: [{ name: "typecheck-lint-build", state: "success" }, early],
    });
    expect(await service.checkTool.checkForCrew(task.id, skipInput())).toBe(
      "Merge review refused: The checks have not finished. Wait for their final results before preparing or sending a rule-bypass review.",
    );
    expect(reviews()).toEqual([]);
    early = { name: "early-tests", state: "neutral", advisory: "failure" };
    expect((await service.checkTool.checkForCrew(task.id, skipInput())).split("\n")).toContain(
      "It merges with these checks failed: early-tests.",
    );
  });
});

describe("the captain's click on a merge past the rules: sent once, never again", () => {
  it("merges once and keeps its receipt; a second click sends nothing", async () => {
    const { service, task, host, prepareSkip, putInSkippingRules, reviews } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    const review = await prepareSkip();
    host.send = { status: "merged", sha: MERGED };
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: true,
      text: "Merged #23 on GitHub, skipping the branch rules.",
      receipt: { head: HEAD, sha: MERGED },
    });
    expect(putInSkippingRules).toHaveBeenCalledTimes(1);
    expect(putInSkippingRules.mock.calls[0]?.[1]).toBe(HEAD);
    expect(host.markedAtSend).toBe(true);
    const stored = reviews().find((item) => item.id === review.id);
    expect(stored?.sent?.outcome).toBeUndefined();
    expect(stored?.receipt).toMatchObject({ head: HEAD, sha: MERGED });
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: true,
      text: `Pull request #23 was already merged at ${HEAD}.`,
      receipt: { head: HEAD, sha: MERGED, already: true },
    });
    expect(await service.reviews.reviewGate(task.id, review.id)).toBe(
      `Card refused: that merge was already sent once and is never sent again. Prepare a new review to ask again. ${fixedHoldWords("sent-once")}`,
    );
    expect(putInSkippingRules).toHaveBeenCalledTimes(1);
  });

  it("keeps a refusal GitHub gave as failed, and never sends it again", async () => {
    const { service, task, host, prepareSkip, putInSkippingRules, reviews } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    const review = await prepareSkip();
    host.send = { status: "failed", message: 'Required status check "critical-path" is failing' };
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: false,
      text: 'Cannot merge: GitHub did not merge #23: Required status check "critical-path" is failing. Nothing merged, and it is not sent again.',
      problem: 'Required status check "critical-path" is failing',
    });
    expect(reviews().find((item) => item.id === review.id)?.sent).toMatchObject({
      outcome: "failed",
      text: 'Required status check "critical-path" is failing',
    });
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: false,
      text: `Cannot merge: that merge was sent once and GitHub did not merge it (Required status check "critical-path" is failing). Nothing was sent again; prepare a new review to ask again. ${fixedHoldWords("sent-once")}`,
      stop: "outcome",
    });
    expect(putInSkippingRules).toHaveBeenCalledTimes(1);
  });

  it("keeps an answer it cannot read as unknown, read back first, and never sends it again", async () => {
    const { service, task, host, prepareSkip, putInSkippingRules, reviews } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    const review = await prepareSkip();
    host.send = { status: "unknown", message: "GitHub answered 502" };
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: false,
      text: "The merge of #23 was sent once, and its outcome is unknown: GitHub answered 502. It is not sent again; read pull request #23 to see whether it merged.",
      problem: "GitHub answered 502",
      stop: "outcome",
    });
    expect(reviews().find((item) => item.id === review.id)?.sent).toMatchObject({
      outcome: "unknown",
      text: "GitHub answered 502",
    });
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: false,
      text: `Cannot merge: that merge was already sent once and its outcome is unknown (GitHub answered 502). Nothing was sent again; read pull request #23 to see whether it merged. ${fixedHoldWords("sent-once")}`,
      stop: "outcome",
    });
    expect(putInSkippingRules).toHaveBeenCalledTimes(1);
  });

  it("reads a lost answer back: merged at the reviewed version is the merge", async () => {
    const { service, task, host, prepareSkip, putInSkippingRules, reviews } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    const review = await prepareSkip();
    host.send = new ForgeError("transient", "could not reach GitHub: socket hang up");
    host.afterSend = openPull({ state: "closed", merged: true, mergedSha: MERGED });
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: true,
      text: "Merged #23 on GitHub, skipping the branch rules.",
      receipt: { head: HEAD, sha: MERGED },
    });
    expect(reviews().find((item) => item.id === review.id)?.receipt?.head).toBe(HEAD);
    expect(putInSkippingRules).toHaveBeenCalledTimes(1);
  });

  it("keeps a transport failure unknown and a sign-in refusal failed, each sent once", async () => {
    const unknown = await onGitHub();
    unknown.host.pull = openPull({ readiness: "blocked" });
    const first = await unknown.prepareSkip();
    unknown.host.send = new ForgeError("transient", "could not reach GitHub: socket hang up");
    expect(await unknown.service.reviews.mergeReview(unknown.task.id, first.id)).toMatchObject({
      ok: false,
      stop: "outcome",
      problem: "could not reach GitHub: socket hang up",
    });
    expect(unknown.reviews()[0]?.sent?.outcome).toBe("unknown");

    const signIn = await onGitHub();
    signIn.host.pull = openPull({ readiness: "blocked" });
    const second = await signIn.prepareSkip();
    signIn.host.send = new ForgeError("sign-in", "GitHub answered 401");
    expect(await signIn.service.reviews.mergeReview(signIn.task.id, second.id)).toEqual({
      ok: false,
      text: "Cannot merge: GitHub answered 401. Nothing merged, and it is not sent again.",
      problem: "GitHub answered 401",
      stop: "sign-in",
    });
    expect(signIn.reviews()[0]?.sent?.outcome).toBe("failed");
    expect(signIn.putInSkippingRules).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the pull request changed after the review, and stores the merge made outside it", async () => {
    const { service, task, host, prepareSkip, putInSkippingRules, forge } = await onGitHub();
    host.pull = openPull({ readiness: "blocked" });
    const review = await prepareSkip();
    const click = () => service.reviews.mergeReview(task.id, review.id);
    host.pull = openPull({ readiness: "blocked", base: "release" });
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the pull request is not the one that was reviewed.",
      stop: "identity",
    });
    host.pull = openPull({ readiness: "blocked", state: "closed" });
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the pull request was closed without merging.",
      stop: "closed",
    });
    host.pull = openPull({ readiness: "blocked", headSha: MERGED });
    expect(await click()).toEqual({
      ok: false,
      text: `Cannot merge: the pull request is at ${MERGED}, and the review covers ${HEAD}. Nothing merged. A new version needs a new review and a new click.`,
      stop: "moved",
    });
    host.pull = openPull({ readiness: "blocked" });
    host.rules = [SKIPPABLE, { id: 9, name: "reviews", bypass: "always", rules: ["pull_request"] }];
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: it would now also skip a review before merging (reviews), which the review did not name. Nothing merged. Prepare a new review.",
      stop: "protected",
    });
    host.rules = [SKIPPABLE];
    forge.names = ["typecheck-lint-build"];
    forge.states = ["failure"];
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the check typecheck-lint-build failed after the review, which did not name it. Nothing merged. Prepare a new review.",
      stop: "checks",
    });
    expect(await service.reviews.reviewGate(task.id, review.id)).toBe(
      "Card refused: the check typecheck-lint-build failed after the review, which did not name it. Nothing merged. Prepare a new review.",
    );
    forge.states = ["success"];
    host.readFails = new ForgeError("transient", "could not reach GitHub: socket hang up");
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the pull request could not be read. could not reach GitHub: socket hang up",
      stop: "transient",
    });
    host.readFails = undefined;
    Object.assign(forge, { putInSkippingRules: undefined });
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: this host cannot merge past its branch rules.",
    });
    Object.assign(forge, { putInSkippingRules });
    host.pull = openPull({ state: "closed", merged: true, mergedSha: MERGED });
    expect(await click()).toEqual({
      ok: true,
      text: "#23 is already merged on GitHub.",
      receipt: { head: HEAD, sha: MERGED, already: true },
    });
    expect(putInSkippingRules).not.toHaveBeenCalled();
  });
});

describe("the captain's click on an ordinary review", () => {
  it("refuses a review, or a merge, that is not on the task", async () => {
    const { service, task } = await onGitHub();
    expect(await service.reviews.reviewGate(task.id, "mrmissing0000")).toBe(
      "Card refused: merge review mrmissing0000 is not on this task.",
    );
    expect(await service.reviews.mergeReview(task.id, "mrmissing0000")).toEqual({
      ok: false,
      text: "Cannot merge: merge review mrmissing0000 is not on this task.",
    });
  });

  it("refuses at the gate and at the click what changed since the review, sending nothing", async () => {
    const { service, task, host, prepare, forge, repos } = await onGitHub();
    const review = await prepare();
    const click = () => service.reviews.mergeReview(task.id, review.id);
    host.pull = openPull({ state: "closed", merged: true, mergedSha: MERGED });
    expect(await service.reviews.reviewGate(task.id, review.id)).toBe(
      "Card refused: that pull request is already merged.",
    );
    host.pull = openPull({ branch: "fm/task-other" });
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the pull request is not the one that was reviewed.",
      stop: "identity",
    });
    host.pull = openPull({ state: "closed" });
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the pull request was closed without merging.",
      stop: "closed",
    });
    host.pull = openPull();
    forge.fail.checks = new ForgeError("refused", "GitHub answered 404 to GET checks");
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the checks could not be read. GitHub answered 404 to GET checks",
      stop: "checks",
      notGreen: true,
    });
    forge.fail.checks = undefined;
    forge.states = ["failure"];
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: the checks failed",
      stop: "checks",
      notGreen: true,
    });
    forge.states = [];
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: No checks have registered and no positive absence declaration covers this version.",
      stop: "checks",
      notGreen: true,
    });
    forge.states = ["success"];
    repos.configure(task.repoId ?? "", { origin: "https://github.com/x/moved.git" });
    expect(await click()).toEqual({
      ok: false,
      text: "Cannot merge: where the reviewed pull request lives changed.",
      stop: "identity",
    });
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  it("stores the merge made outside it at the reviewed version, and refuses a host it cannot read", async () => {
    const { service, task, host, prepare, forge, reviews } = await onGitHub();
    const review = await prepare();
    host.readFails = new ForgeError("sign-in", "GitHub answered 401");
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: false,
      text: "Cannot merge: the pull request could not be read. GitHub answered 401",
      stop: "sign-in",
    });
    host.readFails = undefined;
    host.pull = openPull({ state: "closed", merged: true, mergedSha: MERGED });
    expect(await service.reviews.mergeReview(task.id, review.id)).toEqual({
      ok: true,
      text: "#23 is already merged on GitHub.",
      receipt: { head: HEAD, sha: MERGED, already: true },
    });
    expect(reviews()[0]?.receipt).toMatchObject({ head: HEAD, sha: MERGED });
    const second = await onGitHub();
    const other = await second.prepare();
    Object.assign(second.forge, { pull: undefined });
    expect(await second.service.reviews.mergeReview(second.task.id, other.id)).toEqual({
      ok: false,
      text: "Cannot merge: this host cannot read a pull request by its number.",
    });
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
    expect(second.forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  it("keeps a merge GitHub made though its answer was lost, and reads a 409 as moved", async () => {
    const lost = await onGitHub();
    const review = await lost.prepare();
    lost.forge.fail.putIn = new ForgeError("transient", "could not reach GitHub: socket hang up");
    // GitHub merged it; only its answer was lost on the way back.
    const putIn = lost.forge.putIn.bind(lost.forge);
    lost.forge.putIn = async (change, head) => {
      try {
        return await putIn(change, head);
      } finally {
        lost.host.pull = openPull({ state: "closed", merged: true, mergedSha: MERGED });
      }
    };
    expect(await lost.service.reviews.mergeReview(lost.task.id, review.id)).toEqual({
      ok: true,
      text: "Merged #23 on GitHub.",
      receipt: { head: HEAD, sha: MERGED },
    });
    expect(lost.reviews()[0]?.receipt).toMatchObject({ head: HEAD, sha: MERGED });
    expect(lost.forge.calls.filter((call) => call.startsWith("putIn"))).toHaveLength(1);

    const moved = await onGitHub();
    const second = await moved.prepare();
    moved.forge.fail.putIn = new ForgeError(
      "refused",
      "GitHub answered 409 to PUT /repos/x/y/pulls/23/merge: Head branch was modified. Review and try the merge again.",
    );
    expect(await moved.service.reviews.mergeReview(moved.task.id, second.id)).toEqual({
      ok: false,
      text: "Cannot merge: GitHub answered 409 to PUT /repos/x/y/pulls/23/merge: Head branch was modified. Review and try the merge again.",
      problem:
        "GitHub answered 409 to PUT /repos/x/y/pulls/23/merge: Head branch was modified. Review and try the merge again.",
      stop: "moved",
    });
  });

  it("holds a kept approval's click on the captain's newer words and on an approval that ended", async () => {
    const { service, task, prepare, forge } = await onGitHub();
    const review = await prepare();
    const guard = (overrides: Partial<MergeGuard> = {}): MergeGuard => ({
      head: HEAD,
      prNumber: 23,
      unattended: true,
      beforeDispatch: () => undefined,
      ...overrides,
    });
    expect(
      await service.reviews.mergeReview(
        task.id,
        review.id,
        guard({ held: () => "the captain's newer words wait for the crewmate's declaration" }),
      ),
    ).toEqual({
      ok: false,
      stop: "guidance",
      text: "the captain's newer words wait for the crewmate's declaration",
    });
    expect(
      await service.reviews.mergeReview(
        task.id,
        review.id,
        guard({ beforeDispatch: () => "the captain's merge approval ended" }),
      ),
    ).toEqual({ ok: false, stop: "withdrawn", text: "the captain's merge approval ended" });
    expect(await service.reviews.mergeReview(task.id, review.id, guard({ head: MERGED }))).toEqual({
      ok: false,
      text: "Cannot merge: the pull request moved past the approved version. Declare its repair with check_change conflictRepair; the captain's approval is kept.",
      stop: "moved",
    });
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  it("answers a review already merged from its receipt, asking the host nothing", async () => {
    const harness = setup();
    insertTask(harness.tasks);
    const review: MergeReview = {
      id: "mrreceipt0001",
      kind: "github",
      host: "github.com",
      owner: "x",
      name: "y",
      number: 23,
      headSha: HEAD,
      base: "main",
      branch: "fm/task-ab12cd34",
      method: "squash",
      title: openPull().title ?? "",
      at: 1,
      receipt: { head: HEAD, sha: MERGED, at: 2 },
    };
    seedDelivery(harness.tasks, "ab12cd34", { mergeReviews: [review] });
    expect(await harness.service.reviews.mergeReview("ab12cd34", review.id)).toEqual({
      ok: true,
      text: `Pull request #23 was already merged at ${HEAD}.`,
      receipt: { head: HEAD, sha: MERGED, already: true },
    });
    expect(harness.forge.calls).toEqual([]);
  });
});

// INF-4360, direction A: "the app reads the sign-in's right to skip branch
// rules, and when GitHub refuses a merge for a skippable rule the crewmate
// puts up the skip card". The refusal and the rule set are the ones GitHub
// gave a project whose main branch asks for an approval from someone other
// than the last pusher, with an Admin role on the skip list.
describe("a kept merge GitHub refuses for its branch rules (INF-4360)", () => {
  const REFUSAL =
    "GitHub did not merge #23: Repository rule violations found\n\nNew changes require approval from someone other than the last pusher.\n\n";
  const MAIN_RULES = (bypass: ForgeRuleset["bypass"]): ForgeRuleset => ({
    id: 4,
    name: "main",
    bypass,
    mergeMethods: ["squash"],
    rules: ["deletion", "non_fast_forward", "pull_request", "required_linear_history"],
  });

  async function refused(bypass: ForgeRuleset["bypass"], headRepo = "x/y") {
    const world = await onGitHub();
    const review = await world.prepare();
    world.host.rules = [MAIN_RULES(bypass)];
    // GitHub read the pull request as mergeable until the merge went out,
    // then refused it and reads it as blocked.
    world.forge.putIn = async () => {
      world.host.pull = openPull({ readiness: "blocked", headRepo });
      throw new ForgeError("refused", REFUSAL);
    };
    const guard: MergeGuard = {
      head: HEAD,
      prNumber: 23,
      unattended: false,
      beforeDispatch: () => undefined,
    };
    return world.service.reviews.mergeReview(world.task.id, review.id, guard);
  }

  it("records that the sign-in may skip every rule set holding it, naming each rule", async () => {
    const answer = await refused("always");
    expect(answer).toMatchObject({
      ok: false,
      stop: "protected",
      skip: {
        may: true,
        rules: ["pull_request", "required_linear_history"].map((rule) => ({
          ruleset: "main",
          rule: mergeRuleWords(rule),
        })),
      },
    });
    expect(answer.text).toContain(REFUSAL.trim());
  });

  it("records that it may not, in the host's words, beside GitHub's own refusal", async () => {
    const answer = await refused("never");
    expect(answer).toMatchObject({
      ok: false,
      stop: "protected",
      skip: { may: false, why: "GitHub says your sign-in may not skip the rule set main." },
    });
    expect(answer.text).toContain(REFUSAL.trim());
  });

  // INF-4373's review: check_change skipRules refuses a fork's branch, so
  // the refusal must not steer to a card that cannot go up.
  it("records nothing for a branch outside the project, which skipRules refuses", async () => {
    const answer = await refused("always", "someone/y");
    expect(answer).toMatchObject({ ok: false, stop: "protected" });
    expect(answer).not.toHaveProperty("skip");
  });
});

describe("the captain's click on a pull request the task did not open, while GitHub works it out (INF-457)", () => {
  // PR #94 as GitHub served it on 2026-10-18 (INF-456): it answered
  // mergeable null, which reads computing, to both of the captain's clicks
  // just after main moved, and clean to reads seconds later.
  const PR94 = {
    number: 94,
    headSha: "44b8b3aaf25091de13081dc62eae268df3d9a148",
    branch: "fm/task-3a9271dd",
    title: "fix(crew): keep a renewed conversation's reason across a restart",
  };

  class UndecidedForge extends FakeForge {
    answers: { readiness: ForgeReadiness; headSha?: string }[] = [{ readiness: "computing" }];
    reads = 0;
    async pull(number: number): Promise<ForgePull> {
      const answer = this.answers[Math.min(this.reads, this.answers.length - 1)];
      this.reads += 1;
      return {
        number,
        state: "open",
        merged: false,
        headSha: answer?.headSha ?? PR94.headSha,
        base: "main",
        branch: PR94.branch,
        title: PR94.title,
        headRepo: "infinitary-labs/infinitary",
        readiness: answer?.readiness ?? "computing",
      };
    }
  }

  async function adopted(answers: UndecidedForge["answers"]) {
    const forge = new UndecidedForge();
    forge.answers = answers;
    const harness = setup({ forge });
    await insertDirectPrTask(harness.tasks, harness.repos);
    harness.repos.configure(harness.tasks.get("ab12cd34")!.repoId!, {
      origin: "https://github.com/infinitary-labs/infinitary.git",
    });
    const review: MergeReview = {
      id: "mrpr94clicked",
      kind: "github",
      host: "github.com",
      owner: "infinitary-labs",
      name: "infinitary",
      number: PR94.number,
      headSha: PR94.headSha,
      base: "main",
      branch: PR94.branch,
      method: "squash",
      title: PR94.title,
      at: Date.now(),
    };
    seedDelivery(harness.tasks, "ab12cd34", { mergeReviews: [review] });
    // The click, or the host's merge under a kept approval (`guard`), with
    // the gaps between GitHub's reads on a fake clock: it settles only if the
    // wait ends.
    const click = async (guard?: MergeGuard) => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      try {
        const outcome = harness.service.reviews.mergeReview("ab12cd34", review.id, guard);
        await vi.runAllTimersAsync();
        return await outcome;
      } finally {
        vi.useRealTimers();
      }
    };
    return { ...harness, forge, click };
  }

  it("refuses, sending nothing, when GitHub is still undecided after the wait", async () => {
    const { forge, click } = await adopted([{ readiness: "computing" }]);
    const outcome = await click();
    expect(outcome).toMatchObject({ ok: false, stop: "computing" });
    expect(outcome.text).toContain("Nothing merged");
    expect(forge.reads).toBeGreaterThan(1);
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  it("sends nothing when the pull request moves to a new version while GitHub works it out", async () => {
    const { forge, click } = await adopted([
      { readiness: "computing" },
      { readiness: "clean", headSha: "9d3c0f1e2b4a5968778695a4b3c2d1e0f9a8b7c6" },
    ]);
    const outcome = await click();
    expect(outcome).toMatchObject({ ok: false, stop: "moved" });
    expect(forge.reads).toBe(2);
    expect(forge.calls.some((call) => call.startsWith("putIn"))).toBe(false);
  });

  // The captain's ask: retry on its own right away when GitHub says main
  // moved, with no crewmate step. GitHub's refusal as it gave it to a batch's
  // merges, then the pull request read as computing until GitHub decides.
  it("sends the host's merge GitHub refused because main moved again, once GitHub reads it clean", async () => {
    const { forge, click } = await adopted([
      { readiness: "clean" }, // the read before the request
      { readiness: "computing" }, // read back after the refusal
      { readiness: "computing" }, // the refusal's cause
      { readiness: "computing" }, // the next try's first read
      { readiness: "clean" },
    ]);
    const putIn = forge.putIn.bind(forge);
    let refused = false;
    forge.putIn = async (change, head) => {
      if (refused) return putIn(change, head);
      refused = true;
      forge.calls.push(`putIn ${change.branch} ${head}`);
      throw new ForgeBaseMoved(
        "GitHub answered 405 to PUT /repos/infinitary-labs/infinitary/pulls/94/merge: Base branch was modified. Review and try the merge again.",
      );
    };
    const outcome = await click({
      head: PR94.headSha,
      prNumber: PR94.number,
      unattended: true,
      beforeDispatch: () => undefined,
    });
    expect(outcome).toMatchObject({ ok: true, receipt: { head: PR94.headSha } });
    expect(outcome).not.toHaveProperty("baseMoved");
    expect(forge.reads).toBe(5);
    expect(forge.calls.filter((call) => call.startsWith("putIn"))).toEqual([
      `putIn ${PR94.branch} ${PR94.headSha}`,
      `putIn ${PR94.branch} ${PR94.headSha}`,
    ]);
  });
});

describe("a review's click on a project that gets batches of the person's own (docs/forge.md, \"Batches of your own\")", () => {
  // Intent: the captain's answer on the plan for batches of their own, for a pull request
  // someone else opened in such a project: it merges "As its own pull request through merge
  // review, so the host shows it merged".
  it("merges a pull request someone else opened at the click, as its own pull request", async () => {
    const { service, forge, tasks, task, host, prepare } = await onGitHub({
      delivery_ask: "queue-pr",
    });
    host.pull = openPull({ branch: "their/reading" });
    forge.atHead[HEAD] = [{ name: "linux-checks", state: "success" }];
    const review = await prepare();
    expect(tasks.get(task.id)?.delivery?.checkTarget).toMatchObject({ number: 23 });
    expect(await service.reviews.mergeReview(task.id, review.id)).toMatchObject({
      ok: true,
      receipt: { head: HEAD },
    });
    expect(forge.calls.filter((call) => call.startsWith("putIn"))).toHaveLength(1);
  });
});

describe('a review\'s click on a host whose merge names no version (docs/forge.md, "Bitbucket pull requests")', () => {
  // Intent: the captain's ask for Bitbucket "just like github and gitlab" (INF-5193): Bitbucket's
  // merge holds to no version, so a push in the moment it merges goes in too; the review's
  // receipt names the version that merged, never the approved one, and the crewmate hears it.
  it("records the version the host merged when a push landed after the approved one", async () => {
    const { service, forge, task, host, prepare, reviews } = await onGitHub();
    host.pull = openPull({ branch: "their/reading" });
    forge.atHead[HEAD] = [{ name: "build", state: "success" }];
    const review = await prepare();
    const newer = "9a8b7c6d5e4f30211203f4e5d6c7b8a9f0e1d2c3";
    forge.putIn = async () => ({
      sha: "c0ffee00d15ea5e0b16b00b5ca5cade0ddba11ed",
      mergedHead: newer,
    });
    const outcome = await service.reviews.mergeReview(task.id, review.id);
    expect(outcome).toMatchObject({ ok: true, receipt: { head: newer } });
    expect(outcome.text).toContain(newer);
    expect(reviews().find((item) => item.id === review.id)?.receipt?.head).toBe(newer);
    expect(outcome.line).toContain("#23");
  });

  it("records and tells a merge already made at a later push on a host whose merge names no version", async () => {
    const { service, forge, task, host, prepare, reviews } = await onGitHub();
    Object.assign(forge, { mergeNamesNoVersion: true });
    host.pull = openPull({ branch: "their/reading" });
    forge.atHead[HEAD] = [{ name: "build", state: "success" }];
    const review = await prepare();
    const newer = "9a8b7c6d5e4f30211203f4e5d6c7b8a9f0e1d2c3";
    host.pull = openPull({
      branch: "their/reading",
      state: "closed",
      merged: true,
      headSha: newer,
      mergedSha: "c0ffee00d15ea5e0b16b00b5ca5cade0ddba11ed",
    });
    const outcome = await service.reviews.mergeReview(task.id, review.id);
    expect(outcome).toMatchObject({ ok: true, receipt: { head: newer, already: true } });
    expect(outcome.text).toContain(newer);
    expect(outcome.line).toContain("#23");
    expect(reviews().find((item) => item.id === review.id)?.receipt?.head).toBe(newer);
  });
});
