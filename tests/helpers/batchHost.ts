import { createHash } from "node:crypto";
import type { BatchesOptions } from "../../src/core/batches/batches";
import { type Combined, type CombineInput, LEFT_OUT_WORDS } from "../../src/core/batches/combine";
import {
  type ForgeChange,
  type ForgeCheck,
  ForgeError,
  type ForgePull,
  type ForgeReadiness,
  ForgeWriteError,
} from "../../src/core/forge";
import type { BatchMember, MergeWay } from "../../src/shared/batches";
import { branchComparePage } from "../../src/shared/forge";
import { FakeForge } from "./prCiHarness";

/**
 * The host of a project that gets batches of the person's own (docs/forge.md,
 * "Batches of your own"), for tests of the owners around `Batches`: a task's
 * pushed branch with no pull request of its own, and the one batch pull
 * request the app opens. `standInGit` writes the combine and the push to it
 * in place of git, which `combine.test.ts` owns.
 */

/** The default branch's commit every stand-in batch is combined onto. */
export const BATCH_BASE = "9d1c7e2a4b6f8091a3c5e7d9f1b3a5c7e9d1f3b5";

export const METER_DESTINATION = {
  host: "github.com",
  projectId: 1422452335,
  fullName: "acme/meter",
  visibility: "public" as const,
};

/** A commit id for the words that made it, as git names a commit by its content. */
export const commitId = (words: string) => createHash("sha1").update(words).digest("hex");

/** GitHub for one project: the task's pushed branch, and the batch pull request the app opens. */
export class BatchHostForge extends FakeForge {
  batch?: {
    number: number;
    branch: string;
    title: string;
    body: string;
    state: "open" | "closed";
    merged: boolean;
    mergedSha?: string;
    readiness: ForgeReadiness;
  };
  /** The batch branch's version, as last pushed. */
  batchHead = "";
  readonly attachments = {
    destination: async () => METER_DESTINATION,
    upload: async () => {
      throw new Error("No upload expected");
    },
  };

  /** `pushed` is the task branch's version where the project lives; null while nothing is pushed. */
  constructor(public pushed: string | null = null) {
    super();
    this.change = null;
  }

  /** The pushed branch's compare page, as GitHub names it for the project (INF-4196). */
  async branchPage(branch: string): Promise<string | null> {
    this.calls.push(`branchPage ${branch}`);
    return branchComparePage({
      kind: "github",
      host: "github.com",
      owner: "acme",
      name: "meter",
      base: "main",
      branch,
    });
  }

  async branchHead(branch: string): Promise<string> {
    this.calls.push(`branchHead ${branch}`);
    if (!this.pushed)
      throw new ForgeError(
        "refused",
        "The story's branch has not been confirmed on GitHub. Push the reviewed version first.",
      );
    return this.pushed;
  }
  private batchChange(): ForgeChange | null {
    return this.batch
      ? {
          number: this.batch.number,
          url: `https://github.com/acme/meter/pull/${this.batch.number}`,
          branch: this.batch.branch,
          headSha: this.batchHead,
          title: this.batch.title,
          body: this.batch.body,
        }
      : null;
  }
  // The task's branch has no pull request of its own; only the batch branch does.
  override async changeFor(branch: string) {
    this.calls.push(`changeFor ${branch}`);
    return this.batch?.state === "open" && this.batch.branch === branch ? this.batchChange() : null;
  }
  override async openChange(input: { branch: string; title: string; body: string }) {
    this.calls.push(`openChange ${input.branch} ${input.title}`);
    this.batch = {
      number: 31,
      branch: input.branch,
      title: input.title,
      body: input.body,
      state: "open",
      merged: false,
      readiness: "computing",
    };
    return this.batchChange() as ForgeChange;
  }
  override async updateChangeBody(change: ForgeChange, body: string, title?: string) {
    if (!this.batch) return;
    // GitHub replaces a description only at the version, words and title just read.
    if (
      change.headSha !== this.batchHead ||
      (change.body ?? "") !== this.batch.body ||
      (title !== undefined && change.title !== this.batch.title)
    )
      throw new ForgeWriteError(
        "failed",
        "refused",
        "The pull request changed after it was read, so its description was not replaced. Read it again before updating.",
      );
    this.batch.body = body;
    if (title) this.batch.title = title;
  }
  async pull(number: number): Promise<ForgePull> {
    const batch = this.batch as NonNullable<BatchHostForge["batch"]>;
    return {
      number,
      state: batch.state,
      merged: batch.merged,
      ...(batch.mergedSha ? { mergedSha: batch.mergedSha } : {}),
      headSha: this.batchHead,
      base: "main",
      branch: batch.branch,
      title: batch.title,
      readiness: batch.readiness,
    };
  }
  async mergeWays() {
    return { squash: true, rebase: true, merge: true };
  }
  override async putIn(change: ForgeChange, headSha: string, way?: MergeWay) {
    this.calls.push(`putIn ${change.branch} ${headSha} ${way}`);
    const mergedSha = commitId(`merge of ${headSha}`);
    Object.assign(this.batch as object, { state: "closed", merged: true, mergedSha });
    return { sha: mergedSha };
  }
  async deleteBranch(): Promise<void> {}

  /** The host's checks of the batch's current version came back. */
  report(checks: ForgeCheck[], readiness: ForgeReadiness = "computing") {
    this.atHead[this.batchHead] = checks;
    if (this.batch) this.batch.readiness = readiness;
  }
}

/** The combine, the push and the read of merged commits, written to the stand-in host. */
export function standInGit(
  forge: BatchHostForge,
  /** Tasks whose change no longer combines. */
  conflicting: ReadonlySet<string> = new Set(),
): Required<Pick<BatchesOptions, "combine" | "push" | "landed" | "branchName" | "builtOnVersion">> {
  return {
    // No change here is rebuilt on an open batch's version.
    builtOnVersion: async () => undefined,
    combine: async (input: CombineInput): Promise<Combined> => {
      let head = BATCH_BASE;
      const members: BatchMember[] = [];
      const leftOut: Combined["leftOut"] = [];
      for (const change of input.changes) {
        if (conflicting.has(change.taskId)) {
          leftOut.push({ change, reason: LEFT_OUT_WORDS.conflict });
          continue;
        }
        head = commitId(`${head} ${change.head} ${input.at}`);
        members.push({ ...change, commit: head });
      }
      return { base: BATCH_BASE, head, members, leftOut };
    },
    push: async (input) => {
      forge.batchHead = input.head;
    },
    landed: async (input) => new Map(input.members.map((member) => [member.taskId, member.commit])),
    branchName: () => "infinitary-batch/3fa9c1d2",
  };
}
