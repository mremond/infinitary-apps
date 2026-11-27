import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { ACTIONS, type ActionActor, type ActionName, isProjectChange } from "@shared/actions";
import { clearsAdvisoryWorkflows } from "@shared/advisoryWorkflows";
import { BATCH_GAP_WORDS } from "@shared/batches";
import { type Card, FIRSTMATE_CARD_META } from "@shared/cards";
import { DEFAULT_CONTRIBUTOR_DISCLOSURE } from "@shared/contributorDisclosure";
import { type CostLimit, formatUsd } from "@shared/costLimit";
import type { DeviceView } from "@shared/devices";
import { deviceRunsWork } from "@shared/devices";
import * as m from "@shared/i18n/messages.generated";
import { cardWordsMark, englishOf, type Said, said, saidMark } from "@shared/i18n/said";
import type { CoreInvokeChannel } from "@shared/ipc";
import { AUTOMATIC_COMPUTER, AUTOMATIC_WORD, type PlacementRequirements } from "@shared/placement";
import {
  opensPullRequest,
  type RepoMoveTarget,
  type RepoPolicyPatch,
  type RepoView,
  RUNS_ON_THIS_MAC,
} from "@shared/repos";
import { devicePlace } from "@shared/signIns";
import { AUTONOMY_WORDS, PROJECT_DELIVERY_WORDS, RIGOR_WORDS } from "@shared/vocabulary";
import { resolveWorkComputer } from "@shared/workComputer";
import { z } from "zod";
import type { CoreDispatch } from "../dispatcher";
import { escapeCardText } from "../orchestrator/cardText";
import type { WakeFacts } from "../orchestrator/wakes";
import { actionRequest, actionValue } from "../pi/appTools";
import type { RepoRegistry } from "./repoRegistry";
import {
  MOVE_CARD_SAID,
  type MoveImpact,
  moveFingerprint,
  type RepositoryMove,
} from "./repositoryMove";

const names = ["project-settings", "project-runs-on", "project-move"] as const;
const offerSchema = z.object({
  token: z.string(),
  action: z.enum(names),
  value: z.record(z.string(), z.unknown()),
  before: z.unknown(),
  title: z.string(),
});
type Offer = z.infer<typeof offerSchema>;

/** One path for project changes: exact captain words, or an app-written exact-change card. */
export class ProjectChanges {
  private dispatch: CoreDispatch | undefined;
  private readonly consumed = new Set<string>();
  constructor(
    private readonly options: {
      repos: RepoRegistry;
      devices: () => readonly DeviceView[];
      /**
       * What a move of repositories takes along, for its card (INF-5005): the
       * tasks that join, and how many automations are about a project it
       * empties.
       */
      joining?: (move: RepositoryMove) => MoveImpact;
      raiseCard: (card: Omit<Card, "author" | "priority" | "status" | "createdAt">) => void;
      tell: (facts: Extract<WakeFacts, { kind: "project-change" }>) => void;
    },
  ) {}
  bindDispatch(dispatch: CoreDispatch): void {
    this.dispatch = dispatch;
  }

  async request(
    action: ActionName,
    raw: unknown,
    actor: ActionActor,
  ): Promise<{ text: string; cardId?: string }> {
    if (!isProjectChange(action)) throw new Error("Not a project change.");
    const line = ACTIONS[action];
    const value = line.value.parse(raw) as Record<string, unknown>;
    const dispatch = this.ready();
    if (action === "project-move") return this.requestMove(value, actor);
    const before = await this.current(action, value);
    if (action === "project-settings") {
      const patch = value.changes as RepoPolicyPatch;
      if (patch.origin === null && patch.delivery === undefined) patch.delivery = "local-only";
      if (
        opensPullRequest(patch.delivery ?? (before as RepoView).delivery) &&
        !(patch.origin === undefined ? (before as RepoView).origin : patch.origin)
      )
        throw new Error(
          "This project is kept on this computer. Approve where it lives before choosing pull requests.",
        );
    }
    if (action === "project-runs-on" && typeof value.deviceId === "string") {
      const resolved = resolveWorkComputer(
        value.deviceId,
        this.options.devices().filter((device) => deviceRunsWork(device.kind)),
      );
      value.deviceId = resolved === RUNS_ON_THIS_MAC ? null : resolved;
    }
    if (action === "project-settings") {
      await this.options.repos.checkDetails(
        value.repoId as string,
        value.changes as RepoPolicyPatch,
      );
    }
    // A normal card choice is not authority for a different change. Only
    // the host button below applies the exact stored patch. A destination
    // discovered in git always needs that button, even on a captain turn.
    // His words apply at any other wake, relayed or sent mid-turn (INF-751).
    const address =
      action === "project-settings" && (value.changes as RepoPolicyPatch).origin !== undefined;
    if (
      !address &&
      actor.kind === "firstmate" &&
      actor.wake !== "captain-choice" &&
      actor.projectWords === true &&
      actor.evidence?.trim()
    ) {
      const args = await actionRequest(dispatch, action, value);
      await dispatch(line.change as CoreInvokeChannel, args, actor);
      return {
        text: JSON.stringify({
          action,
          current: actionValue(action, await dispatch(line.current as CoreInvokeChannel, [])),
        }),
      };
    }
    const repo = this.options.repos.get(value.repoId as string);
    if (!repo) throw new Error("That project is no longer here.");
    const title = `Change ${repo.name}?`;
    const offer: Offer = {
      token: randomUUID(),
      action: action as Offer["action"],
      value,
      before,
      title,
    };
    const cardId = `card-project-change-${action}-${repo.id}`;
    this.options.raiseCard({
      id: cardId,
      title,
      meta: FIRSTMATE_CARD_META,
      body: `<p>Your first mate asks for this project change. Nothing changes until you click Apply change.</p>${changeRows(offer, this.options.devices())}<p>Your project keeps its history and key.</p>`,
      actions: [
        {
          id: `apply-${offer.token}`,
          label: "Apply change",
          default: true,
          variant: "primary",
          effect: { kind: "host", op: "apply-project-change", arg: JSON.stringify(offer) },
        },
        {
          id: `not-now-${offer.token}`,
          label: "Not now",
          variant: "ghost",
          effect: { kind: "host", op: "decline-project-change", arg: JSON.stringify(offer) },
        },
      ],
    });
    return {
      cardId,
      text: `The app's exact-change card is up (${cardId}). Nothing changes until the captain clicks Apply change. Do not write another card or start work that needs the change; you hear how they answered.`,
    };
  }

  async apply(arg: string | undefined): Promise<void> {
    const offer = this.claim(arg);
    if (!offer) return;
    try {
      const dispatch = this.ready();
      if (offer.action === "project-move") {
        // The card's digest goes with the move, which compares it in the
        // same run as its write (`moveRepositories`).
        const args = (await actionRequest(dispatch, offer.action, offer.value)) as unknown[];
        await dispatch("inf:repos:move", [...args, offer.before], { kind: "captain" });
      } else {
        if (!isDeepStrictEqual(offer.before, await this.current(offer.action, offer.value)))
          throw new Error("The project changed since this card was written. Ask for a new card.");
        const args = await actionRequest(dispatch, offer.action, offer.value);
        // A one-project change rechecks its row in dispatch.
        await dispatch(ACTIONS[offer.action].change as CoreInvokeChannel, args, {
          kind: "captain",
          projectBefore: offer.before,
        });
      }
      this.options.tell({ kind: "project-change", outcome: "applied", title: offer.title });
    } catch (error) {
      this.options.tell({
        kind: "project-change",
        outcome: "failed",
        title: offer.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  decline(arg: string | undefined): void {
    const offer = this.claim(arg);
    if (offer)
      this.options.tell({ kind: "project-change", outcome: "not-now", title: offer.title });
  }

  /** Notice only: git never changes the saved address or the API write fence. */
  async inspect(repoId: string): Promise<void> {
    const repo = this.options.repos.get(repoId);
    if (!repo || repo.kind === "personal") return;
    // A missing folder says nothing about the address, and a task bound for
    // another computer needs no folder here (INF-572). The look is never
    // made on the main thread: a folder on a volume that stopped answering
    // must not hold the app (INF-4622).
    const here = await access(repo.path).then(
      () => true,
      () => false,
    );
    if (!here) return;
    const origin = await this.options.repos.detectedOrigin(repoId);
    if (origin !== repo.origin)
      await this.request(
        "project-settings",
        { repoId, changes: { origin, ...(!origin ? { delivery: "local-only" } : {}) } },
        { kind: "firstmate", wake: "other" },
      );
  }
  async inspectAll(): Promise<void> {
    for (const repo of this.options.repos.list()) {
      try {
        await this.inspect(repo.id);
      } catch {
        /* An unreadable folder is not evidence for a different address. */
      }
    }
  }
  /**
   * A move of repositories (INF-5005): exact captain words apply it at
   * once; otherwise one app-written card per target project asks, with
   * Apply move and Not now only.
   */
  private async requestMove(
    value: Record<string, unknown>,
    actor: ActionActor,
  ): Promise<{ text: string; cardId?: string }> {
    const dispatch = this.ready();
    const plan = this.options.repos.planMove(
      value.repoIds as string[],
      value.project as RepoMoveTarget,
    );
    if (
      actor.kind === "firstmate" &&
      actor.wake !== "captain-choice" &&
      actor.projectWords === true &&
      actor.evidence?.trim()
    ) {
      const args = await actionRequest(dispatch, "project-move", value);
      await dispatch("inf:repos:move", args, actor);
      return {
        text: JSON.stringify({
          action: "project-move",
          current: actionValue("project-move", await dispatch("inf:projects:list", [])),
        }),
      };
    }
    const joining = this.options.joining?.(plan) ?? { tasks: [], automations: 0 };
    const titleSaid = MOVE_CARD_SAID.title(plan);
    const title = englishOf(titleSaid);
    const offer: Offer = {
      token: randomUUID(),
      action: "project-move",
      value,
      before: moveFingerprint(plan, joining),
      title,
    };
    const cardId = `card-project-change-project-move-${plan.target.kind === "new" ? `own-${plan.target.repoId}` : plan.target.id}`;
    this.options.raiseCard({
      id: cardId,
      title,
      meta: FIRSTMATE_CARD_META,
      body: `${cardWordsMark([titleSaid, MOVE_CARD_SAID.apply, MOVE_CARD_SAID.notNow])}${moveBody(plan, joining)}`,
      actions: [
        {
          id: `apply-${offer.token}`,
          label: englishOf(MOVE_CARD_SAID.apply),
          default: true,
          variant: "primary",
          effect: { kind: "host", op: "apply-project-change", arg: JSON.stringify(offer) },
        },
        {
          id: `not-now-${offer.token}`,
          label: englishOf(MOVE_CARD_SAID.notNow),
          variant: "ghost",
          effect: { kind: "host", op: "decline-project-change", arg: JSON.stringify(offer) },
        },
      ],
    });
    return {
      cardId,
      text: `The app's move card is up (${cardId}). Nothing moves until the captain clicks Apply move. Do not write another card or start work that needs the move; you hear how they answered.`,
    };
  }

  private ready(): CoreDispatch {
    if (!this.dispatch) throw new Error("Project changes are not ready yet.");
    return this.dispatch;
  }
  private async current(action: ActionName, value: Record<string, unknown>): Promise<unknown> {
    const current = await this.ready()(ACTIONS[action].current as CoreInvokeChannel, []);
    const repo = (current as RepoView[]).find((r) => r.id === value.repoId);
    if (!repo) throw new Error("That project is no longer here.");
    if (repo.kind === "personal") throw new Error("The personal workspace's settings stay fixed.");
    return repo;
  }
  private claim(arg: string | undefined): Offer | undefined {
    if (!arg) return;
    const offer = offerSchema.parse(JSON.parse(arg));
    if (this.consumed.has(offer.token)) return;
    this.consumed.add(offer.token);
    return offer;
  }
}

/**
 * The move card's body (the design skill's ChangeCard, INF-5005): the
 * repositories with their project now and after the click, then what goes
 * with them - the tasks with their keys, the automations, the directions -
 * and the rows that leave the project list.
 */
function moveBody(plan: RepositoryMove, joining: MoveImpact): string {
  // Every run of the app's own words is a saved fact (`saidMark`), worded in
  // the language of whoever draws the card; names and keys fill them as
  // they are.
  const sources = new Map(plan.sources.map((source) => [source.id, source]));
  const key = plan.target.key;
  const after =
    plan.target.kind === "existing"
      ? escapeCardText(`${plan.target.name} (${key})`)
      : saidMark(
          plan.target.kind === "revive"
            ? said("projectsMoveAfterRevive", { key })
            : said("projectsMoveAfterNew", { key }),
        );
  const rows = plan.repos
    .map((repo) => {
      const from = sources.get(repo.from);
      const now = from ? `${from.name} (${from.key})` : "";
      return `<tr><th>${escapeCardText(repo.name)}</th><td class="inf-mono">${escapeCardText(now)}</td><td class="inf-mono">${after}</td></tr>`;
    })
    .join("");
  const project = plan.target.name;
  const open = joining.tasks.filter((task) => task.status === "open" || task.status === "active");
  const closed = joining.tasks.length - open.length;
  const parts: string[] = [];
  if (!open.length && !closed) parts.push(saidMark(said("projectsMoveNoTask"), "p"));
  else {
    parts.push(
      open.length
        ? saidMark(said("projectsMoveOpenTasks", { count: open.length, project }), "p")
        : saidMark(said("projectsMoveNoOpenTask"), "p"),
    );
    if (open.length)
      parts.push(
        `<ul>${open
          .map(
            (task) =>
              `<li><span class="inf-mono">${escapeCardText(task.key)}</span> ${escapeCardText(task.title)}</li>`,
          )
          .join("")}</ul>`,
      );
    if (closed) parts.push(saidMark(said("projectsMoveFinishedTasks", { count: closed }), "p"));
  }
  if (joining.automations)
    parts.push(
      saidMark(said("projectsMoveAutomations", { count: joining.automations, project }), "p"),
    );
  if (plan.target.kind === "existing")
    parts.push(saidMark(said("projectsMoveDirections", { project }), "p"));
  const leaving = plan.sources.filter((source) => source.empties);
  if (leaving.length)
    parts.push(
      saidMark(said("projectsMoveLeaves", { count: leaving.length }), "p"),
      `<ul>${leaving
        .map(
          (source) =>
            `<li>${escapeCardText(source.name)} (<span class="inf-mono">${escapeCardText(source.key)}</span>)</li>`,
        )
        .join("")}</ul>`,
    );
  return `${saidMark(said("projectsMoveAsks", { count: plan.repos.length }), "p")}<table><thead><tr>${saidMark(said("projectsMoveColumnRepository"), "th")}${saidMark(said("projectsMoveColumnNow"), "th")}${saidMark(said("projectsMoveColumnAfter"), "th")}</tr></thead><tbody>${rows}</tbody></table>${saidMark(said("projectsMoveKeeps"), "p")}${parts.join("")}`;
}

function changeRows(offer: Offer, devices: readonly DeviceView[]): string {
  const previous = offer.before as RepoView & { path?: string };
  const changes: Record<string, unknown> =
    offer.action === "project-settings"
      ? { ...(offer.value.changes as Record<string, unknown>) }
      : { runsOn: offer.value.deviceId };
  if (offer.action === "project-settings" && changes.origin === null && previous.runsOn)
    changes.runsOn = null;
  if (
    offer.action === "project-settings" &&
    typeof changes.origin === "string" &&
    !previous.origin &&
    previous.kind === "project"
  )
    changes.runsOn = AUTOMATIC_COMPUTER;
  if (
    offer.action === "project-settings" &&
    changes.origin !== undefined &&
    changes.advisoryWorkflows === undefined &&
    clearsAdvisoryWorkflows(previous, changes.origin as string | null)
  )
    changes.advisoryWorkflows = [];
  const labels: Record<string, string | Said> = {
    name: "Name",
    scope: "Scope",
    path: "Folder",
    origin: "Where it lives",
    delivery: "Where changes go",
    autonomy: "Ask before merging",
    rigor: "Rigor",
    costLimit: "Cost limit",
    runsOn: "Runs on",
    placementRequirements: "Computer requirements",
    requireChecks: "Require pull request checks",
    batchGap: BATCH_GAP_WORDS.title,
    contributorDisclosure: m.settingsProjectsDisclosure(),
    advisoryWorkflows: said("settingsProjectsAdvisoryTitle"),
  };
  // Each detail as the project has it now; the project keeps Require pull
  // request checks as its record that it runs none.
  const now = (key: string): unknown =>
    key === "requireChecks" ? !previous.noChecks : previous[key as keyof typeof previous];
  const words = (key: string, value: unknown): string | Said => {
    if (key === "costLimit") {
      const limit = value as CostLimit | null | undefined;
      return !limit ? "Follow the app" : "usd" in limit ? formatUsd(limit.usd) : "No limit";
    }
    if (key === "scope") return value == null || value === "" ? "Not set" : String(value);
    if (key === "delivery") return PROJECT_DELIVERY_WORDS[value as RepoView["delivery"]];
    if (key === "autonomy") return value ? AUTONOMY_WORDS.putsInItself : AUTONOMY_WORDS.asksFirst;
    if (key === "rigor")
      return RIGOR_WORDS[(value ?? "standard") as NonNullable<RepoView["rigor"]>];
    if (key === "origin" && value === null) return "Kept on this computer";
    if (key === "requireChecks") return value ? "On" : "Off";
    if (key === "batchGap") return BATCH_GAP_WORDS.label(value as number | null | undefined);
    if (key === "contributorDisclosure")
      return value == null
        ? DEFAULT_CONTRIBUTOR_DISCLOSURE
        : value === ""
          ? m.settingsProjectsDisclosureOff()
          : String(value);
    if (key === "advisoryWorkflows") {
      const paths = (value as readonly string[] | undefined) ?? [];
      return paths.length ? paths.join(", ") : said("settingsProjectsAdvisoryNone");
    }
    if (key === "runsOn")
      return value === AUTOMATIC_COMPUTER
        ? AUTOMATIC_WORD
        : value === null
          ? "This computer"
          : devicePlace(devices, String(value)).where;
    if (key === "placementRequirements") {
      const requirements = value as PlacementRequirements | null | undefined;
      const profiles = {
        conversation: "Conversation allowance",
        standard: "Standard allowance",
        heavy: "Heavy allowance",
      };
      return [
        requirements?.systems
          ?.map((system) => (system === "macos" ? "macOS" : "Linux"))
          .join(", ") ?? "This computer's system",
        requirements?.chips?.join(", ") ?? "This computer's architecture",
        requirements?.tools?.length
          ? `Required programs: ${requirements.tools.join(", ")}`
          : "No additional programs",
        profiles[requirements?.profile ?? "standard"],
      ].join(" · ");
    }
    return String(value);
  };
  const cell = (text: string | Said): string =>
    typeof text === "string" ? escapeCardText(text) : saidMark(text);
  return `<table><thead><tr><th>Detail</th><th>Now</th><th>After your click</th></tr></thead><tbody>${Object.entries(
    changes,
  )
    .map(
      ([key, value]) =>
        `<tr><th>${cell(labels[key] ?? key)}</th><td class="inf-mono">${cell(words(key, now(key)))}</td><td class="inf-mono">${cell(words(key, value))}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}
