import { cutText } from "@shared/textCut";
import { z } from "zod";
import type { AccountView } from "./accounts";
import { ambientLines } from "./ambientActions";
import { appearanceLines } from "./appearanceActions";
import {
  type AutomationList,
  type AutomationRule,
  automationSpecSchema,
  scheduleDetailsWords,
} from "./automation";
import { automationValue } from "./automationActionValue";
import { type BatchAnswer, batchAnswerSchema } from "./batches";
import { shortCommit } from "./buildIdentity";
import { type AppCostLimitView, costLimitSchema, formatUsd } from "./costLimit";
import { crewSpeedSchema, SPEED_NAMES } from "./crewSpeed";
import { type DecisionsView, decisionAnswererSchema, decisionModelDone } from "./decisions";
import type { DeviceMake } from "./deviceArrival";
import { addressFormOffer, addressOffer, deviceInviteLine } from "./deviceInvite";
import { anotherUserHere, COMPUTER, HERE } from "./deviceNames";
import {
  buildsSourceThere,
  type DeviceView,
  deviceNameSchema,
  deviceRunsWork,
  deviceWords,
  installedThere,
  installItThereWords,
  LINK_SAY,
  userDisplayName,
} from "./devices";
import { type DictationKey, type DictationSettings, dictationKeySchema } from "./dictation";
import { FONT_SLOTS, type FontChoices, type FontSlot, fontFamilySchema } from "./fonts";
import { hostOfAddress, kindByName } from "./forge";
import { signInHost } from "./forgeKinds";
import type { ForgesView } from "./forges";
import { handoverLines } from "./handoverActions";
import * as m from "./i18n/messages.generated.ts";
import { englishOf, type Said, type SaidPart, said } from "./i18n/said";
import { integrationLines, integrationsBrief } from "./integrationActions";
import {
  INTEGRATIONS_SIGN_IN_HOST,
  type IntegrationKind,
  type IntegrationsView,
  integrationIdSchema,
} from "./integrations";
import { type CoreInvokeChannel, invokeContract } from "./ipc";
import type { KeptJobsView } from "./keptJobs";
import {
  type KnowledgeDirectionHeard,
  type KnowledgeDirections,
  knowledgeDirectionChangeSchema,
} from "./knowledge";
import { reasoningChoiceSchema, slotSchema } from "./modelSlots";
import { panelLines } from "./panelActions";
import { AUTOMATIC_COMPUTER } from "./placement";
import type { Appearance, Layout } from "./preferences";
import { normalizePrivateSite, type PrivateSitesView } from "./privateSites";
import { projectSetupProposalSchema } from "./projectSetup";
import { catalogEntry } from "./providers";
import { type RoutingSettings, restoredPins } from "./quota";
import { reasoningWord } from "./reasoning";
import type { ReleaseNotesView } from "./releaseTracking";
import { remoteLoginAddressSchema, remoteLoginWords } from "./remoteLogin";
import {
  type RepoView,
  repoMoveTargetSchema,
  repoPolicyOutcome,
  repoPolicyPatchSchema,
  runsHereOnly,
  runsOnSaid,
} from "./repos";
import { savedResetLines } from "./savedResetActions";
import { settingsActs } from "./settingsActs";
import { costLimitValue, enabledValue, fontsValue, panelsSwitchValue } from "./settingValues";
import type { SharingView } from "./sharing";
import { showLines } from "./showActions";
import { type DeviceSignIns, signInPlace } from "./signIns";
import { summaryPointLines } from "./summaryPointActions";
import { tagLines } from "./tagActions";
import type { ProjectView } from "./tasks";
import { themeLines } from "./themeActions";
import { signInsUnansweredInEnglish, workSetupWordsInEnglish } from "./workSetupWords";

/**
 * Stable permissions, independent of Settings tabs. Captain can run every
 * line. `asked` and `own-words` are the first mate's at any wake, on its
 * judgment that the captain asked - in any form for `asked`, in his typed
 * words for `own-words` - with that evidence (INF-751). `judgment` is the
 * first mate's own judgment of what the captain wants, whatever began its
 * turn (INF-638), with its reason as evidence.
 */
export type ActionTier = "asked" | "own-words" | "hands" | "yours" | "judgment";
export type ActionLine = {
  alwaysTrail?: boolean;
  /** Settings owned inside a shared request object (or its selector enum). */
  fields?: string[];
  /**
   * Of `fields`, those this value's request sets, when it sets fewer than
   * all: what a window checks and sets of its own value (docs/view.md, "What
   * the first mate asks of a window"). Absent, every one of `fields`.
   */
  sets?: (value: Record<string, unknown>) => string[];
  area:
    | "projects"
    | "appearance"
    | "general"
    | "panels"
    | "intelligence"
    | "automation"
    | "integrations";
  tier: ActionTier;
  /** A core request, or a window's own that only a window answers (`WINDOW_ONLY_CHANNELS`). */
  change: CoreInvokeChannel | "inf:keyboard:reminders:set" | null;
  channels?: CoreInvokeChannel[];
  handover?: "settings" | "subscriptions" | "projects" | "devices";
  /**
   * A multi-machine line (docs/devices.md): with no host to hand it over,
   * the Firstmate is told the line alone, since no button it can put on a
   * card opens what the line needs. Every line whose handover is `devices`
   * is one already.
   */
  multiMachine?: boolean;
  /**
   * A hands line whose card the host writes from the checked request, at
   * any wake (the setup card, docs/fleet.md "Asking the first mate to add a
   * project"): app_change puts it up through its delegate's `propose`, and
   * only the captain's click on it runs the line's change.
   */
  proposes?: true;
  /**
   * The card a hands line offers in place of acting, from the value the
   * Firstmate passed and the line's current value: its words and its one
   * button. Absent, the host offers a plain Open Settings card. It throws a
   * reason when the value names nothing it can offer.
   */
  offer?: (
    value: Record<string, unknown>,
    current: unknown,
    /**
     * The system the home runs, for a line whose words name its settings,
     * and what `offerReads` read, for an offer whose row reads it too.
     */
    here: { platform: string; also?: unknown },
  ) => HandoverOffer;
  /** A second read an offer needs beside `current`, as the Settings row it opens reads it. */
  offerReads?: CoreInvokeChannel;
  current: CoreInvokeChannel | "inf:keyboard:reminders" | null;
  value: z.ZodType;
  line: string;
  /** The line as served on a home of this system, where its words differ by system; `line` elsewhere. */
  lineOn?: (platform: string) => string;
  toRequest: (
    value: Record<string, unknown>,
    current: unknown,
    expandHome: (path: string) => string,
    /** The first mate's evidence, for a line whose request keeps it. */
    evidence?: string,
  ) => unknown[];
  readValue: (current: unknown) => Record<string, unknown>;
  done: (value: Record<string, unknown>) => string;
  /**
   * A setting with a scale: the words of the captain's settled run
   * (docs/orchestrator-contract.md, "Settled runs"), from the value where
   * the run started to the value where it settled, each as `readValue`
   * reads it. Absent, a run says `done` of where it settled.
   */
  settled?: (from: Record<string, unknown>, to: Record<string, unknown>) => string;
  /**
   * The trail of a line whose request does more than this line's act, or
   * whose act leaves no value to compare, or a value too narrow to show it
   * (own ambient styles, read by name): the value its feed line says, from
   * the request, the handler's answer and the line's value read before, or
   * null when this request was not the line's act (a secret action other
   * than ending a read), so it leaves no line of this one's.
   */
  trailOf?: (
    args: readonly unknown[],
    result: unknown,
    before: unknown,
  ) => Record<string, unknown> | null;
  /** What the handler's answer tells the first mate beside the value read after, for an act. */
  answers?: (result: unknown) => Record<string, unknown>;
  /**
   * A line that runs only part of its request's acts: why the first mate's
   * request asks another of them, or null when it is this line's act. The
   * dispatcher checks it before every first mate request on the channel.
   */
  refuses?: (args: readonly unknown[]) => string | null;
};
/**
 * The card the host files for the captain when the Firstmate asks for a
 * hands action (app_change): built by the host from typed facts, never by
 * the Firstmate, so its button does exactly what its words say.
 */
export type HandoverOffer = {
  /** Stable, so asking twice revises one card. */
  cardId: string;
  title: string;
  /** Plain text, one sentence or two each. */
  paragraphs: string[];
  /** The default button, which opens Settings on the line's section. */
  label: string;
  danger?: boolean;
  /** The button that closes the card and does nothing. */
  decline: string;
  /**
   * The facts its title, paragraphs and buttons were worded from, when they
   * are the app's catalog words: the card keeps them (`cardWordsMark`,
   * `saidMark`), so each view words it in its own language.
   */
  said?: { title: Said; paragraphs: Said[]; label: Said; decline: Said };
  /**
   * What the section does on arrival (`openEffectSchema`): a phone's link,
   * or the exact place it opens (`section`, and the `item` it shows), and
   * whether the act there is only on the first mate's own computer (`fromHome`).
   */
  arrival?:
    | { make: DeviceMake }
    | { phone: true }
    | { item: string; fromHome?: true }
    | { section: string; item: string; fromHome?: true }
    | { fromHome: true }
    | { forgeSignInOn: { deviceId: string; host: string } }
    | { remove: string }
    | { add: string }
    | { addressForm: true }
    | { update: string }
    | { privateSite: string }
    | { signIn: string }
    | { signInOn: { deviceId: string; providerId: string } };
};

/** An integration as the catalog reads it back: its settings, without its actions' words. */
/**
 * What the captain's own sign-in click started, read from the channel it
 * called (SCR-523: a click carries no catalog value, so the line once read
 * "undefined sign-in started"). A forge's own sign-in names its server kind
 * (`github` for GitHub Enterprise) and the address the captain typed.
 */
export function integrationSignInValue(
  channel: CoreInvokeChannel,
  args: readonly unknown[],
): { kind?: IntegrationKind; host?: string } {
  if (channel === "inf:integrations:sign-in") return { kind: args[0] as IntegrationKind };
  if (channel === "inf:forges:sign-in") {
    const host = String(args[0]);
    if (host === INTEGRATIONS_SIGN_IN_HOST) return { kind: "github" };
    const kind = signInHost(kindByName(host))?.serverIntegration;
    return kind ? { kind, host } : { host };
  }
  if (channel === "inf:forges:sign-in-cli") {
    // GitHub CLI's sign-in serves GitHub hosts alone: github.com, or GitHub Enterprise.
    const host = hostOfAddress(String(args[0])) ?? undefined;
    if (host === INTEGRATIONS_SIGN_IN_HOST) return { kind: "github" };
    return { kind: "github-enterprise", ...(host ? { host } : {}) };
  }
  const input = args[0] as { kind: string; address: string };
  const host = hostOfAddress(input.address) ?? undefined;
  const kind = signInHost(input.kind)?.serverIntegration;
  return { ...(kind ? { kind } : {}), ...(host ? { host } : {}) };
}

export function isMultiMachineLine(line: Pick<ActionLine, "handover" | "multiMachine">): boolean {
  return line.handover === "devices" || line.multiMachine === true;
}
function cardSlug(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function automationRule(current: unknown, id: unknown): AutomationRule {
  const list = current as AutomationList;
  if (list.state === "unavailable") throw new Error(list.reason);
  const rule = list.rules.find((entry) => entry.id === id);
  if (!rule) throw new Error(`No automation ${id}. Its id is in this action's current value.`);
  return rule;
}
const automationIdSchema = z.string().trim().min(1).max(64);
function presence(field: "startAtLogin" | "showInDock", label: string): ActionLine {
  return {
    area: "general",
    tier: "asked",
    fields: [field],
    change: "inf:presence:set",
    current: "inf:presence:get",
    value: z.strictObject({ enabled: z.boolean() }),
    line: `${label} when asked.`,
    toRequest: (v, c) => [{ ...(c as object), [field]: v.enabled }],
    readValue: (c) => ({ enabled: (c as Record<string, unknown>)[field] }),
    done: (v) => `${label} ${v.enabled ? "on" : "off"}`,
  };
}
function owned(
  change: CoreInvokeChannel,
  current: CoreInvokeChannel,
  line: string,
  done: string,
): ActionLine {
  return {
    area: "general",
    tier: "yours",
    change,
    current,
    value: z.strictObject({ args: invokeContract[change].request }),
    line,
    alwaysTrail: true,
    toRequest: (v) => v.args as unknown[],
    // What it reads stays the captain's: an owned line hands the first mate
    // nothing of it unless it names a field (INF-5350).
    readValue: () => ({}),
    done: () => done,
  };
}
function guidance(
  area: ActionLine["area"],
  tier: ActionTier,
  line: string,
  channels: CoreInvokeChannel[] = [],
  handover?: ActionLine["handover"],
  auditText = "Settings action completed",
): ActionLine {
  return {
    area,
    tier,
    line,
    channels,
    handover,
    alwaysTrail: tier === "hands",
    change: null,
    current: null,
    value: z.strictObject({}),
    toRequest: () => [],
    readValue: () => ({}),
    done: () => auditText,
  };
}
/**
 * A direction change as app_change takes it: its evidence is the reason
 * kept, and `from` cites where the captain's own words for it were heard
 * (`task` names the task for `crewmate-tab` or `standing`). The host checks
 * the citation and records the heard mark; the request carries neither.
 */
const [addDirection, reviseDirection, retireDirection] = knowledgeDirectionChangeSchema.options;
const directionCitation = {
  from: z.string().trim().min(1).max(200).optional(),
  task: z.string().trim().min(1).max(64).optional(),
};
const directionValueSchema = z.discriminatedUnion("op", [
  addDirection.omit({ reason: true, heard: true }).extend(directionCitation),
  reviseDirection.omit({ reason: true, heard: true }).extend(directionCitation),
  retireDirection.omit({ reason: true, heard: true }).extend(directionCitation),
]);
/** Where a direction change cites the captain's words, as its value names them. */
export type DirectionCitation = { from?: string; task?: string };
const DIRECTION_DONE = { add: "saved", revise: "revised", retire: "retired" } as const;
/**
 * The line a project's Runs on change leaves (`project-runs-on`), as a saved
 * fact: the action's `done` words, and the feed line's fact beside them.
 */
export function runsOnDoneSaid(v: Record<string, unknown>): Said {
  return runsOnSaid(
    (v.repo as RepoView).name,
    (v.where as string | SaidPart | null | undefined) ?? null,
    v.fromHere !== false,
    (v.repo as RepoView).runsOn === AUTOMATIC_COMPUTER,
  );
}

const actionLines = {
  "project-setup": {
    area: "projects",
    tier: "hands",
    proposes: true,
    change: "inf:repos:setup",
    current: "inf:repos:list",
    value: projectSetupProposalSchema,
    line: "Propose a project at any time - on the captain's message, a crewmate's report, or your own judgment: app_change checks it, changes nothing, and puts up the captain's setup card, where only their Add project click adds it. clone needs origin (remote URL), init needs name (new local project), adopt needs path (an existing folder, read from the home folder unless absolute; a plain one gets git). clone and init go in the projects folder; adopt links in place, and the card also offers a fresh clone when the folder has a remote. Pass key (2-4 letters or digits, INF for INF-1) only when the captain chose the task key; otherwise the app derives one from the name, and it refuses a key another project has. To add a repository to an existing project instead, pass project (that project's task key) and no key; its tasks then take that key, and Scratch and the personal workspace take none. Suggest delivery, autonomy, rigor and runsOn (work computer name/id, or null) only when you know them; the card otherwise shows today's defaults. work names, in a few words, the waiting work you start once they add it. You hear once how they answered. A project already on the list gets no card and is named instead; project-move puts it in another project. Settings adds its own projects at once.",
    toRequest: (v, _c, expandHome) => {
      const { delivery, autonomy, rigor, runsOn, work, ...spec } = v;
      return [
        { ...spec, ...(spec.kind === "adopt" ? { path: expandHome(spec.path as string) } : {}) },
      ];
    },
    readValue: (c) => ({ projects: c as RepoView[] }),
    done: (v) => `Set up project ${(v.repo as RepoView).name}`,
  },
  "project-remove": {
    area: "projects",
    tier: "own-words",
    change: "inf:repos:remove",
    current: "inf:repos:list",
    value: z.strictObject({ repoId: z.string().min(1) }),
    line: "Remove a project from the list when the captain asks you to in their own words. Its folder, files and history are never touched, and finished tasks stay readable. Refused while tasks are still planned or working on it; the refusal names them. To combine projects, move repositories with project-move, never remove and add them back.",
    toRequest: (v) => [v.repoId],
    readValue: (c) => ({ projects: (c as RepoView[]).map(({ id, name }) => ({ id, name })) }),
    done: (v) => `Removed project ${(v.repo as RepoView).name}`,
  },
  "project-settings": {
    area: "projects",
    tier: "asked",
    change: "inf:repos:configure",
    current: "inf:repos:list",
    value: z.strictObject({
      repoId: z.string().min(1),
      changes: repoPolicyPatchSchema,
    }),
    line: "Change costLimit (estimated dollars as {usd}, {none:true} for no limit, null to follow the app), scope (what work belongs here; null clears it), delivery, autonomy, rigor, requireChecks (false records that the project runs no pull request checks; true ends that record), batchGap (a batched project's least minutes from one batch's start to the next; null starts one as soon as a change is approved; a held batch's repair never waits), contributorDisclosure (the line opening what the crew posts to an outside contributor; an empty string posts none; null restores the default), advisoryWorkflows (a GitHub project's workflow files, such as .github/workflows/early-tests.yml, whose checks show but never hold a merge, the check watch or a batch; [] names none), declared computer requirements (placementRequirements: systems, chips, tools, profile; null restores defaults), name, path (an already moved folder, with no planned or working tasks), or origin (the folder’s current git address, never a git configuration write). Exact captain words apply; otherwise the app asks on its exact-change card. Origin always asks. Personal workspace settings stay fixed; keys and history stay.",
    toRequest: (v) => [v.repoId, v.changes],
    readValue: (c) => ({
      projects: (c as RepoView[]).map(
        ({
          id,
          name,
          scope,
          path,
          origin,
          host,
          kind,
          delivery,
          autonomy,
          rigor,
          costLimit,
          placementRequirements,
          noChecks,
          batchGap,
          contributorDisclosure,
          advisoryWorkflows,
        }) => ({
          id,
          name,
          scope,
          path,
          origin,
          host,
          kind,
          delivery,
          autonomy,
          rigor,
          costLimit,
          placementRequirements,
          requireChecks: !noChecks,
          batchGap: batchGap ?? null,
          contributorDisclosure: contributorDisclosure ?? null,
          advisoryWorkflows: advisoryWorkflows ?? [],
        }),
      ),
    }),
    done: (v) => (v.description as string | undefined) ?? repoPolicyOutcome(v.repo as RepoView),
  },
  // Repositories join another project with their tasks, keys kept (INF-5005,
  // docs/fleet.md "Moving a repository to another project"): asked, through
  // the app's move card unless the captain's exact words named the move.
  "project-move": {
    area: "projects",
    tier: "asked",
    change: "inf:repos:move",
    current: "inf:projects:list",
    value: z.strictObject({
      repoIds: z.array(z.string().min(1)).min(1),
      project: repoMoveTargetSchema,
    }),
    line: "Move repositories (repoIds from the current projects) into another project: project is its task key, or {own:true} for a project of their own (one repository; key only when the captain chose one). Each keeps its name, folder and settings, and its tasks join with their keys; an emptied project leaves the list with its automations moving along. Combine projects this way, never by removing and adding back. Exact captain words apply; otherwise the app asks on its move card.",
    toRequest: (v) => [v.repoIds, v.project],
    readValue: (c) => ({
      projects: (c as ProjectView[])
        .filter((project) => !project.archived && (project.repos?.length ?? 0) > 0)
        .map(({ key, name, repos }) => ({
          key,
          name,
          repositories: (repos ?? []).map(({ id, name }) => ({ id, name })),
        })),
    }),
    done: (v) => {
      const moved = (v.repos as { name: string }[]).map((repo) => repo.name);
      const names =
        moved.length > 1 ? `${moved.slice(0, -1).join(", ")} and ${moved.at(-1)}` : moved[0];
      return `Moved ${names} into ${(v.project as { name: string }).name}`;
    },
  },
  // A project of several repositories has a name of its own (INF-4220,
  // docs/fleet.md "Adding a repository to a project"); a project of one is
  // named with its repository through project-settings.
  "project-name": {
    area: "projects",
    tier: "asked",
    change: "inf:projects:rename",
    current: "inf:projects:list",
    value: z.strictObject({
      projectId: z.string().min(1),
      name: z.string().trim().min(1),
    }),
    line: "Name a project of several repositories when asked (projectId from the current projects); its key, history and each repository's own name stay. A project of one is named with its repository through project-settings.",
    toRequest: (v) => [v.projectId, v.name],
    readValue: (c) => ({
      projects: (c as ProjectView[])
        .filter((project) => !project.archived && (project.repos?.length ?? 0) > 1)
        .map(({ id, key, name, repos }) => ({
          id,
          key,
          name,
          repositories: (repos ?? []).map((repo) => repo.name),
        })),
    }),
    done: (v) => `Renamed project ${v.was as string} to ${v.name as string}`,
  },
  ...tagLines,
  // Where a project's next task starts (docs/helper.md, "Runs on"): asked,
  // like the project's other settings. A task already started finishes
  // where it started.
  "project-runs-on": {
    area: "projects",
    tier: "asked",
    change: "inf:devices:runs-on",
    current: "inf:repos:list",
    value: z.strictObject({
      repoId: z.string().min(1),
      deviceId: z.string().min(1).max(64).nullable(),
    }),
    line: `Choose where a project's tasks run when asked, such as "run website on the mini": a work computer’s name or deviceId (duplicates need IDs), null for ${HERE.this}, or automatic to choose once for each new task from fresh compatible computers with room. Its next task starts there; one already running finishes where it started. While that computer is out of reach its tasks wait and never run here instead. A project kept on ${HERE.this} only, and the personal workspace, run here.`,
    toRequest: (v) => [v.repoId, v.deviceId],
    readValue: (c) => ({
      projects: (c as RepoView[]).map((repo) => ({
        id: repo.id,
        name: repo.name,
        runsOn: repo.runsOn,
        ...(runsHereOnly(repo) ? { runsHereOnly: true } : {}),
      })),
    }),
    done: (v) => englishOf(runsOnDoneSaid(v)),
  },
  // Pairing (docs/devices.md). Both stay the captain's own, on this Mac's
  // window: the Firstmate only offers a card whose button acts in Settings
  // -> Devices, app_change never reads a link back, so one cannot reach a
  // conversation, and words typed on a paired view - which reach the
  // Firstmate as the captain's - can neither add a device nor remove one.
  "device-invite": {
    fields: ["kind", "command"],
    area: "general",
    tier: "hands",
    handover: "devices",
    change: "inf:devices:invite",
    current: "inf:devices:list",
    value: z.strictObject({
      name: deviceNameSchema.optional(),
      how: z.enum(["link", "command", "another-user", "address", "phone"]).optional(),
      address: remoteLoginAddressSchema.optional(),
    }),
    line: deviceInviteLine(false),
    // A Windows PC adds no computer by its address, so its first mate recommends the link.
    lineOn: (platform) => deviceInviteLine(platform === "win32"),
    alwaysTrail: true,
    toRequest: (v) =>
      v.how === "command" || v.how === "address"
        ? [{ kind: "mac", command: "another-mac" }]
        : v.how === "another-user"
          ? [{ kind: "work", command: "another-user" }]
          : [{ kind: "mac", ...(v.how === "phone" ? { phone: true } : {}) }],
    readValue: (c) => ({
      devices: (c as DeviceView[]).map(({ id, kind, name }) => ({ id, kind, name })),
    }),
    done: () => "made a ten-minute link to add a device",
    offer: (v, _current, here) => {
      const name = typeof v.name === "string" ? v.name : null;
      // A Windows PC adds no computer by its address (its own ssh keeps no
      // control connection): there the address way offers the link instead.
      if (v.how === "address" && here.platform !== "win32") {
        // Chosen without an address: the form, with the computers nearby to pick from.
        if (typeof v.address !== "string") return addressFormOffer(name);
        return addressOffer(v.address);
      }
      if (v.how === "phone")
        return {
          cardId: "app-device-invite",
          title: name ? `Connect your ${name}` : "Connect your phone",
          paragraphs: [
            LINK_SAY.phone[0],
            "Make a link here, then scan its code inside Infinitary on your phone. It works once, for ten minutes. Only your click can make it, so I never see it.",
          ],
          label: "Make a link",
          decline: "Not now",
          arrival: { phone: true },
        };
      if (v.how === "another-user")
        return {
          cardId: "app-device-invite",
          title: `Run work as another user on ${HERE.this}`,
          paragraphs: [
            "Its work then runs as that user, with sign-ins of its own, and cannot control your first mate.",
            anotherUserHere(here.platform).thatUserReads,
            `${anotherUserHere(here.platform).makeUser} Then make the command here, and run it once as that user.`,
          ],
          label: "Make the command",
          decline: "Not now",
          arrival: { make: "user-command" },
        };
      if (v.how === "command")
        return {
          cardId: "app-device-invite",
          title: name ? `Add your ${name} by a command` : `Add a ${COMPUTER.one} by a command`,
          paragraphs: [
            `Make the command here, then run it once in Terminal on ${name ? `your ${name}` : `that ${COMPUTER.one}`}.`,
            "It works once, for ten minutes, or thirty when it downloads Infinitary there. Only your click can make it, so I never see it.",
          ],
          label: "Make the command",
          decline: "Not now",
          arrival: { make: "command" },
        };
      return {
        cardId: "app-device-invite",
        title: name ? `Connect your ${name}` : `Connect a ${COMPUTER.one}`,
        paragraphs: [
          `Your first mate stays on ${HERE.this}. ${name ? `Your ${name}` : `Your other ${COMPUTER.one}`} will show it and can run work for it.`,
          `Make a link here, then paste it into Infinitary on ${name ? `your ${name}` : `your other ${COMPUTER.one}`}.`,
          "It works once, for ten minutes. Only your click can make it, so I never see it.",
        ],
        label: "Make a link",
        decline: "Not now",
        arrival: { make: "link" },
      };
    },
  },
  // The captain's private sites list for task browsers (docs/task-browser.md,
  // "Private sites"): the first mate only offers the app's Allow card, and
  // only the captain's click on it, or their own entry in Settings, adds one.
  "private-site-allow": {
    area: "integrations",
    tier: "hands",
    handover: "settings",
    change: "inf:browser:private-sites:add",
    current: "inf:browser:private-sites",
    value: z.strictObject({ site: z.string().min(1).max(2_048) }),
    line: "Offer to let task browsers on every computer reach a private site - one on an office, home or VPN network - when a crewmate's report or the captain names one: app_change puts up the app's own card, and only the captain's Allow click adds it to Settings → Integrations → Private sites. Pass site: the name the crewmate gave (wiki.corp.example), or a suffix of two or more parts (.corp.example.com) for every name under it, never an address. A listed site opens over https or http from any page; it never reaches loopback, link-local or cloud metadata addresses, so a program that listens only inside this computer stays out of reach.",
    toRequest: (v) => [v.site],
    readValue: (c) => ({ privateSites: (c as PrivateSitesView).sites }),
    done: (v) => `allowed ${String(v.site)} for task browsers`,
    offer: (v, c) => {
      const checked = normalizePrivateSite(String(v.site));
      if (!checked.ok) throw new Error(checked.text);
      const site = checked.site;
      if ((c as PrivateSitesView | null)?.sites.includes(site))
        throw new Error(`${site} is already on the private sites list.`);
      const suffix = site.startsWith(".");
      return {
        cardId: `app-private-site-${cardSlug(site)}`,
        title: suffix
          ? `Let task browsers reach sites under ${site}?`
          : `Let task browsers reach ${site}?`,
        paragraphs: [
          suffix
            ? `Task browsers on all your computers could then open every site whose name ends in ${site}, on an office, home or VPN network, over https or http.`
            : `Task browsers on all your computers could then open ${site} on an office, home or VPN network, over https or http.`,
          "Any page a crewmate opens could reach it too, as in an ordinary browser. It never reaches a program that listens only inside this computer, or cloud metadata addresses. You can remove it in Settings → Integrations → Private sites.",
        ],
        label: "Allow",
        decline: "Not now",
        arrival: { privateSite: site },
      };
    },
  },
  "device-remove": {
    area: "general",
    tier: "hands",
    handover: "devices",
    change: "inf:devices:remove",
    current: "inf:devices:list",
    value: z.strictObject({ deviceId: z.string().min(1) }),
    line: `Remove a device when the captain asks: app_change offers the captain one card whose button removes it in Settings → Devices. Only the captain's click removes it; it is cut off at once and needs a new link or command to join again. A computer that runs work has its tasks stopped and its unmerged work brought here first, then removes what was set up there, and its projects run on ${HERE.this}. Name it by its id from app_state.`,
    toRequest: (v) => [v.deviceId],
    // `earlier` names an entry out of reach that this one joined again
    // after, and `carriesOn` one whose tasks Settings -> Devices can carry
    // on elsewhere (docs/devices.md, "Joined again").
    readValue: (c) => ({
      devices: (c as DeviceView[]).map(({ id, kind, name, earlier, carriesOn }) => ({
        id,
        kind,
        name,
        ...(earlier?.length ? { earlier } : {}),
        ...(carriesOn ? { carriesOn } : {}),
      })),
    }),
    done: (v) => deviceWords.removed(v.device as DeviceView),
    offer: (v, c) => {
      const device = (c as DeviceView[]).find((candidate) => candidate.id === v.deviceId);
      if (!device) throw new Error("No device with that id is on the list. Look with app_state.");
      const label = deviceWords.label(device);
      return {
        cardId: `app-device-remove-${cardSlug(device.id)}`,
        title: `Remove ${label}?`,
        paragraphs: deviceRunsWork(device.kind)
          ? [
              deviceWords.removeStops(device),
              "Then I remove what I set up there, with its sign-ins. Only your click can remove it.",
            ]
          : [
              "It is cut off at once.",
              `To come back, it needs a new link. Only your click can remove a ${COMPUTER.one}.`,
            ],
        label: `Remove ${label}`,
        danger: true,
        decline: "Keep it",
        arrival: { remove: device.id },
      };
    },
  },
  // A computer that runs work signs in to its own subscriptions
  // (docs/helper.md, "Its own sign-ins"). The Firstmate only offers the
  // captain's card; the sign-in starts on his click in Settings ->
  // Intelligence, and what he types there never reaches a conversation.
  // Updating Firstmate on a computer that runs work (docs/devices.md,
  // "Updating"): over the captain's own SSH for a Mac added by its address,
  // otherwise over the connection; one too old to update from here gets the
  // command to run there instead. The app updates an older one by itself as
  // it connects ("Updating by itself"); this offer is the captain's own
  // click for what that could not do. Like adding one, it
  // runs through no catalog channel, so its minutes never hold another
  // Settings change in line, and the feed says each step itself.
  "device-update": {
    area: "general",
    tier: "hands",
    handover: "devices",
    change: null,
    current: "inf:devices:list",
    value: z.strictObject({ deviceId: z.string().min(1) }),
    line: `Update Infinitary on a computer that runs work when the captain asks: app_change offers them one card whose button brings it to ${HERE.this}'s version - over Remote Login for a ${COMPUTER.one} added by its address, otherwise over the network - or, for one too old to update from here, makes the command to run there once. Its running work stops for a moment and goes on after. When this computer runs Infinitary from its code, otherVersion names a source commit instead: that card has a Mac get this computer's committed code, build it and start from it, asks once for each computer and then matches it by itself, keeps that computer's running work paused through the whole download, install and build, which takes minutes, and refuses a computer that is not a Mac. A computer in reach on another version says so as otherVersion in app_state; the app updates an older one by itself as it connects, and raises the same card itself when it cannot, so offering it then finds that card standing. Name it by its id from app_state.`,
    toRequest: () => [],
    readValue: (c) => ({
      devices: (c as DeviceView[]).map(
        ({ id, kind, name, remoteLogin, inReach, otherVersion }) => ({
          id,
          kind,
          name,
          // Whether it was added by its address, never the login there (INF-5350).
          ...(remoteLogin ? { byAddress: true } : {}),
          ...(deviceRunsWork(kind) ? { inReach: Boolean(inReach || otherVersion) } : {}),
          ...(otherVersion ? { otherVersion } : {}),
        }),
      ),
    }),
    done: () => "offered to update Infinitary on a computer",
    offer: (v, c) => {
      const device = (c as DeviceView[]).find((candidate) => candidate.id === v.deviceId);
      if (!device) throw new Error("No device with that id is on the list. Look with app_state.");
      const label = deviceWords.label(device);
      if (!deviceRunsWork(device.kind))
        throw new Error(`${label} controls the first mate, and runs no work to update.`);
      // A computer that cannot build source is refused as Match refuses it, before any other words.
      if (device.otherVersion?.source && !buildsSourceThere(device.system))
        throw new Error(
          [m.devicesSourceNotMac({ device: label }), m.devicesSourceKeepsVersion()].join(" "),
        );
      if (installedThere(device)) throw new Error(installItThereWords(label));
      const cardId = `app-device-update-${cardSlug(device.id)}`;
      const title = `Update Infinitary on ${label}`;
      const stops = "Its running work stops for a moment and goes on after.";
      // This computer's code, which the captain's yes lets that computer build and run from
      // now on: said as the card the app raises for it says it (docs/devices.md, "Matching the home's build").
      const source = device.otherVersion?.source;
      if (source)
        return {
          cardId,
          title: m.devicesSourceCardTitle({ device: label }),
          paragraphs: [
            m.devicesSourceCardBody({ device: label, commit: shortCommit(source.commit) }),
            m.devicesSourceCardOnce({ device: label }),
            m.devicesSourceCardKeychain({ device: label }),
          ],
          label: m.devicesSourceCardMatch(),
          decline: m.devicesAppCardNotNow(),
          arrival: { update: device.id },
        };
      if (device.remoteLogin)
        return {
          cardId,
          title,
          paragraphs: [
            device.onThisMac
              ? remoteLoginWords.updateLocalCopyOffer()
              : device.system === "linux"
                ? `I copy ${HERE.this}'s Infinitary there over Remote Login, with your own SSH key, and start it again.`
                : remoteLoginWords.updateDownloadOffer(),
            stops,
          ],
          label: "Update it",
          decline: "Not now",
          arrival: { update: device.id },
        };
      const other = device.otherVersion;
      if (!other) {
        if (device.inReach)
          throw new Error(`${label} already runs ${HERE.this}'s version of Infinitary.`);
        throw new Error(
          `${label} is out of reach, so ${HERE.this} cannot tell its version or update it now. Ask again once it is back.`,
        );
      }
      const hereAsUser = device.onThisMac === true && device.user !== undefined;
      if (other.updateBy === "command")
        return {
          cardId,
          title,
          paragraphs: [
            "Its version of Infinitary is too old to update from here, so it needs a new command.",
            hereAsUser
              ? `Make the command here, then run it once in Terminal as ${userDisplayName(device.user as string)}.`
              : `Make the command here, then run it once in Terminal on ${label}.`,
          ],
          label: "Make the command",
          decline: "Not now",
          arrival: { make: hereAsUser ? "user-command" : "command" },
        };
      return {
        cardId,
        title,
        paragraphs: [
          hereAsUser
            ? `I start it again on ${HERE.this}'s own Infinitary.`
            : other.downloads
              ? remoteLoginWords.updateConnectionDownloadOffer()
              : `I send ${HERE.this}'s Infinitary to it over your network, and it starts again.`,
          stops,
        ],
        label: "Update it",
        decline: "Not now",
        arrival: { update: device.id },
      };
    },
  },
  "device-sign-in": {
    area: "intelligence",
    tier: "hands",
    handover: "subscriptions",
    multiMachine: true,
    change: null,
    current: "inf:devices:sign-ins",
    value: z.strictObject({
      deviceId: z.string().min(1).max(64),
      provider: z.string().min(1).max(256),
    }),
    line: `Sign a computer that runs work in to one of its own subscriptions when the captain asks: app_change offers the captain one card whose button opens Settings → Intelligence with that sign-in started there. Name the computer by its deviceId and the subscription by its provider id from app_state. Nothing from ${HERE.this}'s sign-ins goes there, and you never see what the captain types.`,
    alwaysTrail: true,
    toRequest: () => [],
    readValue: (c) => ({
      computers: (c as DeviceSignIns[]).map((device) => ({
        deviceId: device.deviceId,
        name: signInPlace(device).label,
        reach: device.reach,
        ...(device.controlling !== undefined ? { windowConnected: device.controlling } : {}),
        ...(device.workSetup ? { workSetup: device.workSetup } : {}),
        ...(device.reach !== "in-reach"
          ? {
              workWait:
                workSetupWordsInEnglish(
                  signInPlace(device).label,
                  device.workSetup,
                  device.heldOnLocalNetwork,
                ) ?? "Not connected for work.",
            }
          : {}),
        reportedSignIns: device.signIns !== null,
        ...(device.unanswered ? { signInsUnanswered: true } : {}),
        providers: device.signIns?.providers.map((provider) => provider.id) ?? [],
        signedIn:
          device.signIns?.accounts.map((account) => ({
            id: account.id,
            provider: account.providerId,
            label: account.label,
            paused: !account.enabled,
            preferred: account.pinned,
            keepGoingOnCredits: account.keepGoingOnCredits === true,
            useSavedResets: account.useSavedResets === true,
          })) ?? [],
        projectSignIns: device.signIns?.forges?.signIns.map((signIn) => signIn.host) ?? [],
      })),
    }),
    done: () => "offered a sign-in on a computer that runs work",
    offer: (v, c) => {
      const device = (c as DeviceSignIns[]).find((candidate) => candidate.deviceId === v.deviceId);
      if (!device)
        throw new Error("No computer that runs work has that deviceId. Look with app_state.");
      const provider = catalogEntry(v.provider as string);
      if (!provider) throw new Error("No subscription has that provider id. Look with app_state.");
      const place = signInPlace(device);
      if (device.reach !== "in-reach") {
        const why = workSetupWordsInEnglish(
          place.label,
          device.workSetup,
          device.heldOnLocalNetwork,
        );
        throw new Error(
          `${place.who} is not connected for work, so no sign-in was offered.${why ? ` ${why}` : ""}`,
        );
      }
      if (device.unanswered) throw new Error(signInsUnansweredInEnglish(place.who, HERE.this));
      if (!device.signIns)
        throw new Error(
          `${place.who} has not reported its sign-ins yet, so no sign-in was offered.`,
        );
      return {
        cardId: `app-device-sign-in-${cardSlug(device.deviceId)}-${cardSlug(provider.id)}`,
        title: `Sign in to ${provider.name} ${place.where}`,
        paragraphs: [
          `${place.who} signs in to ${provider.name} with a sign-in of its own. Nothing from ${HERE.this}'s sign-in goes there.`,
          `Sign in opens Settings, where it starts under ${place.label}.`,
        ],
        label: "Sign in",
        decline: "Not now",
        arrival: { signInOn: { deviceId: device.deviceId, providerId: provider.id } },
      };
    },
  },
  "device-address": guidance(
    "general",
    "hands",
    `A link carries every address ${HERE.this} has. There is nothing to choose in Settings → Devices.`,
    ["inf:devices:address:set"],
    "devices",
    `changed where devices find ${HERE.this}`,
  ),
  font: {
    fields: ["fonts"],
    area: "appearance",
    tier: "asked",
    change: "inf:settings:appearance:set",
    current: "inf:settings:appearance:get",
    value: z.strictObject({ slot: z.enum(FONT_SLOTS), font: fontFamilySchema.nullable() }),
    line: "Set the font of one place when asked: app (the window's words), reading (what the crew writes on cards) or code. font is a family installed on the captain's computer by its exact name, system-ui (ui-monospace for code) for the computer's own font, or null for Infinitary's own. Reading follows the app font while it is null. Settings → Appearance lists the installed fonts.",
    toRequest: (v, c) => {
      const slot = v.slot as FontSlot;
      const font = v.font as string | null;
      const { [slot]: _was, ...others } = (c as Appearance).fonts ?? {};
      const fonts = font ? { ...others, [slot]: font } : others;
      const { fonts: _saved, ...look } = c as Appearance;
      return [{ ...look, ...(Object.keys(fonts).length > 0 ? { fonts } : {}) }];
    },
    readValue: fontsValue,
    // A line is written from the fonts as `readValue` reads them, whoever chose.
    done: (v) => {
      const fonts = (v.fonts ?? {}) as FontChoices;
      const chosen = FONT_SLOTS.filter((slot) => fonts[slot]);
      return chosen.length === 0
        ? "set every font to Infinitary's own"
        : `set the fonts: ${chosen.map((slot) => `${slot} ${fonts[slot]}`).join(", ")}`;
    },
    settled: (from, to) => {
      const was = (from.fonts ?? {}) as FontChoices;
      const now = (to.fonts ?? {}) as FontChoices;
      const named = (font: string | undefined) => font ?? "Infinitary's own";
      const moved = FONT_SLOTS.filter((slot) => was[slot] !== now[slot]);
      return moved.length === 0
        ? "kept the fonts"
        : moved.map((slot) => `${slot} font ${named(was[slot])} → ${named(now[slot])}`).join(", ");
    },
  },
  ...panelLines,
  "voice-model": {
    ...owned(
      "inf:voice:ensure-model",
      "inf:voice:status",
      "Download the local voice model when asked; audio stays on this machine.",
      "voice model ready",
    ),
    tier: "asked",
    alwaysTrail: false,
    value: z.strictObject({}),
    toRequest: () => [],
    readValue: (c) => ({ ready: (c as { modelReady: boolean }).modelReady }),
  },
  "account-sign-in": guidance(
    "intelligence",
    "hands",
    "Add or sign in again to an account in Settings → Intelligence.",
    ["inf:accounts:add", "inf:accounts:sign-in"],
    "subscriptions",
    "account sign-in requested",
  ),
  "custom-connection": guidance(
    "intelligence",
    "hands",
    "Enter a custom connection in Settings → Intelligence.",
    ["inf:accounts:custom:save"],
    "subscriptions",
    "custom connection saved",
  ),
  "decision-key": guidance(
    "intelligence",
    "hands",
    "Enter or remove a decision key in Settings → Intelligence.",
    ["inf:decisions:key:set", "inf:decisions:key:remove"],
    "subscriptions",
    "decision key changed",
  ),
  "panel-remove": guidance(
    "panels",
    "own-words",
    "Use personalize to remove a panel, only on the captain's own words.",
  ),
  "task-actions": guidance(
    "general",
    "asked",
    "Use update_task, interrupt_crewmate or steer_crewmate for task start, stop, continue and drop, and move_task to move started work to another computer.",
    ["inf:task:abort", "inf:task:delete", "inf:task:run", "inf:task:move"],
  ),
  settle: guidance(
    "general",
    "asked",
    "Use settle_task for merge or discard; an ask-first merge still needs the captain's click.",
    ["inf:task:close-done"],
  ),
  "card-close": guidance(
    "general",
    "yours",
    "Closing someone else's card stays yours on that card.",
  ),
  "plugin-consent": guidance("panels", "yours", "Panel consent stays yours on its consent card."),
  recovery: guidance("general", "yours", "Recovery buttons stay yours on the recovery card."),
  "ask-first-merge": guidance(
    "projects",
    "yours",
    "An ask-first project's merge stays yours on its merge card.",
  ),
  "show-card": {
    area: "general",
    tier: "asked",
    change: "inf:cards:show",
    current: "inf:app:healthcheck",
    value: z.strictObject({ cardId: z.string().trim().min(1).max(128) }),
    line: "Bring a card forward when the captain asks to show or revisit it. A minimized open card returns to the stack; a closed card is read-only. Read cardId from open cards or resolution.card.id in tasks by key. It makes no new card and runs nothing. Never minimize a card yourself.",
    alwaysTrail: true,
    toRequest: (v) => [v.cardId],
    readValue: () => ({}),
    done: (v) => `showed the earlier card "${v.title}"`,
  },
  "show-whats-new": {
    area: "general",
    tier: "asked",
    change: "inf:release-notes:show",
    current: "inf:release-notes:list",
    value: z.strictObject({ version: z.string().trim().min(1).max(64).optional() }),
    line: "Bring a release note forward on the captain's stage when asked what is new or to read the notes again: the newest that listed changes, or the one for a version in current. An open note comes to the front, a closed one comes back read-only. It makes no new card.",
    alwaysTrail: true,
    toRequest: (v) => [v.version ?? null],
    readValue: (c) => ({
      notes: (c as ReleaseNotesView).notes.map(({ version, listed }) => ({ version, listed })),
    }),
    done: (v) => `showed the release note for ${v.version}`,
  },
  direction: {
    area: "general",
    tier: "judgment",
    alwaysTrail: true,
    change: "inf:knowledge:direction:set",
    current: "inf:knowledge:directions",
    value: directionValueSchema,
    line: "Add, revise or retire one of the captain's standing directions on your own judgment of what they want, whatever began the turn: their words, their choice on any card, a click. evidence is the reason its history keeps. add takes text and scope (captain: no crewmate reads it; or a project id); revise takes id and text; retire takes id; expectedRevision is optional. from cites where the captain's own words for this change were heard: turn for words they typed this turn, a card's id for their reply or click there, or crewmate-tab or standing with task naming the task; the host checks them and marks the revision heard there, and refuses a citation it cannot find, saving nothing. Leave from out to save on your judgment alone: the revision is not heard, even when an earlier one was, guides work as an instruction, and is no yes.",
    toRequest: (v, _current, _expandHome, evidence) => {
      const { from: _from, task: _task, ...change } = v as Record<string, unknown>;
      return [{ ...change, reason: evidence }];
    },
    readValue: (current) => {
      const read = current as KnowledgeDirections;
      return read.state === "ready"
        ? {
            directions: read.rows.map((row) => ({
              id: `d:${row.id}`,
              scope: row.scope,
              project: row.scopeName,
              revision: row.revision,
              heard: row.heard ?? false,
              text: row.text,
            })),
            total: read.total,
          }
        : { unavailable: read.reason };
    },
    done: (v) => {
      const text = String(v.text);
      return `${DIRECTION_DONE[v.op as keyof typeof DIRECTION_DONE]} the standing direction "${text.length > 120 ? `${cutText(text, 119)}…` : text}"`;
    },
  },
  "start-at-login": presence("startAtLogin", "start at login"),
  "show-in-dock": presence("showInDock", "show in dock"),
  "release-page": {
    ...owned(
      "inf:update:open-release",
      "inf:update:status",
      "Open the release page when asked.",
      "release page opened",
    ),
    tier: "asked",
    value: z.strictObject({}),
    toRequest: () => [],
  },
  ...integrationLines,
  "integration-key": guidance(
    "integrations",
    "hands",
    "The captain enters or removes an integration's key in Settings → Integrations, never in a message, a card or a task; integrations shows only whether each is kept.",
    ["inf:integrations:secret", "inf:integrations:client"],
    "settings",
    "integration key changed",
  ),
  "integration-check": {
    area: "integrations",
    tier: "asked",
    change: "inf:integrations:check",
    current: "inf:integrations:list",
    value: z.strictObject({ id: integrationIdSchema }),
    line: "Check an integration's connection now when asked; its row and integrations read the same answer.",
    toRequest: (v) => [v.id],
    readValue: (c) => ({ integrations: integrationsBrief(c as IntegrationsView) }),
    done: (v) => `Checked integration ${v.id}`,
  },
  "forge-sign-out": {
    area: "projects",
    tier: "own-words",
    change: "inf:forges:sign-out",
    current: "inf:forges:list",
    value: z.strictObject({
      host: z.string().trim().toLowerCase().min(1).max(253),
      deviceId: z.string().min(1).max(64).optional(),
    }),
    line: "Sign out of one project host the app is signed in to (github.com, a GitHub Enterprise or GitLab host) only on the captain's typed words. To sign a computer that runs work out of its own sign-in, used for its clones and pushes, also pass its deviceId; device-sign-in's state lists its project sign-ins.",
    toRequest: (v, c) => {
      // That computer refuses a host it holds no sign-in to.
      if (v.deviceId) return [v.host, v.deviceId];
      if (!(c as ForgesView).signIns.some((signIn) => signIn.host === v.host))
        throw new Error(
          `No sign-in to ${v.host}. Signed in: ${(c as ForgesView).signIns.map((signIn) => signIn.host).join(", ") || "none"}.`,
        );
      return [v.host];
    },
    // The hosts it is signed in to, never a sign-in's code or who it is there (INF-5350).
    readValue: (c) => ({
      signedIn: ((c as Pick<ForgesView, "signIns"> | null)?.signIns ?? []).map(
        ({ host, state }) => ({ host, state }),
      ),
    }),
    done: (v) =>
      `${v.host === "github.com" ? "GitHub" : v.host} signed out${v.where ? ` ${v.where}` : ""}`,
  },
  diagnostics: {
    fields: ["diagnostics"],
    ...owned(
      "inf:settings:sharing:set",
      "inf:settings:sharing:get",
      "Diagnostics stays yours: Settings → General, beside the preview.",
      "diagnostics changed",
    ),
    alwaysTrail: false,
    readValue: (c) => ({
      enabled: (c as { diagnostics: { enabled: boolean } }).diagnostics.enabled,
    }),
    done: (v) => `diagnostics ${v.enabled ? "on" : "off"}`,
  },
  contribution: {
    fields: ["contribution"],
    ...owned(
      "inf:settings:sharing:set",
      "inf:settings:sharing:get",
      "Contribution stays yours; unavailable until its terms are published.",
      "contribution changed",
    ),
    alwaysTrail: false,
    readValue: (c) => ({
      enabled: (c as { contribution: { enabled: boolean } }).contribution.enabled,
    }),
    done: (v) => `contribution ${v.enabled ? "on" : "off"}`,
  },
  "sharing-ask": {
    ...owned(
      "inf:settings:sharing:ask",
      "inf:settings:sharing:get",
      "Answering the sharing ask stays yours in Settings → General.",
      "sharing ask answered",
    ),
    fields: ["contribute", "not-now"],
    readValue: (c) => ({ askPending: (c as SharingView).askPending }),
  },
  purge: owned(
    "inf:retention:purge",
    "inf:app:healthcheck",
    "Purge stays yours in Settings → General; it erases this conversation.",
    "task data purged",
  ),
  "panels-switch": {
    ...owned(
      "inf:settings:panels:set",
      "inf:shell:preferences",
      "The panels switch stays yours in Settings → General.",
      "panels switch changed",
    ),
    alwaysTrail: false,
    readValue: panelsSwitchValue,
    done: (v) => `panels ${v.enabled ? "on" : "off"}`,
  },
  dictation: {
    fields: ["enabled", "key"],
    area: "general",
    tier: "own-words",
    change: "inf:settings:dictation:set",
    current: "inf:settings:dictation:get",
    value: z
      .strictObject({ enabled: z.boolean().optional(), key: dictationKeySchema.optional() })
      .refine((v) => v.enabled !== undefined || v.key !== undefined, {
        message: "dictation needs enabled or key",
      }),
    line: "Turn hold-to-talk dictation on or off, or choose its key (AltRight, MetaRight or ControlRight: the right-hand Option, Command or Control on a Mac), on the captain's typed words.",
    toRequest: (v, c) => [
      {
        enabled: (v.enabled as boolean | undefined) ?? (c as DictationSettings).enabled,
        key: (v.key as DictationKey | undefined) ?? (c as DictationSettings).key,
      },
    ],
    readValue: (c) => ({
      enabled: (c as DictationSettings).enabled,
      key: (c as DictationSettings).key,
    }),
    done: (v) => `dictation ${v.enabled ? "on" : "off"}, ${v.key}`,
  },
  "firstmate-model": {
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:firstmate-model:set",
    current: "inf:settings:firstmate-model:get",
    value: z.strictObject({
      model: z.strictObject({ provider: z.string().min(1), id: z.string().min(1) }).nullable(),
    }),
    line: "Choose the first mate's model; null restores Auto. Applies after this answer, never mid-turn.",
    toRequest: (v) => [v.model],
    readValue: (c) => ({ model: c }),
    done: (v) =>
      `First mate model ${v.model ? `${(v.model as { provider: string; id: string }).provider}/${(v.model as { id: string }).id}` : "Auto"}`,
  },
  "firstmate-account": {
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:firstmate-account:set",
    current: "inf:settings:firstmate-account:get",
    value: z.strictObject({ accountId: z.string().min(1).nullable() }),
    line: "Choose which account of its model's provider the first mate answers on, by id; null lets the app pick by allowance when it next binds. Applies after this answer, never mid-turn. Crew work's preferred account is account-prefer.",
    toRequest: (v) => [v.accountId],
    readValue: (c) => ({ accountId: c }),
    done: (v) => `First mate account ${(v.label as string | null | undefined) ?? "Auto"}`,
  },
  "crew-slots": {
    area: "intelligence",
    tier: "asked",
    change: "inf:models:slots:set",
    current: "inf:models:slots",
    value: z.strictObject({
      key: z.string().regex(/^[^/]+\/.+$/),
      slot: slotSchema,
      on: z.boolean(),
    }),
    line: "Add or remove one provider/model offering from a crew slot.",
    toRequest: (v) => [v.key, v.slot, v.on],
    readValue: (c) => ({ slots: c }),
    done: (v) => `${v.key} ${v.on ? "added to" : "removed from"} ${v.slot}`,
  },
  "crew-speed": {
    area: "intelligence",
    tier: "asked",
    change: "inf:models:speed:set",
    current: "inf:models:slots",
    value: z.strictObject({ key: z.string().regex(/^[^/]+\/.+$/), speed: crewSpeedSchema }),
    line: "Set one Codex model’s crew speed across supporting accounts. Ultrafast uses 8× plan allowance or 6× purchased credits; Standard is the default. The first mate and Decisions stay Standard.",
    toRequest: (v) => [v.key, v.speed],
    readValue: (c) => ({ slots: c }),
    done: (v) => `${v.key}: ${SPEED_NAMES[crewSpeedSchema.parse(v.speed)]}`,
  },
  "crew-reasoning": {
    area: "intelligence",
    tier: "asked",
    change: "inf:models:reasoning:set",
    current: "inf:models:slots",
    value: z.strictObject({
      key: z.string().regex(/^[^/]+\/.+$/),
      slot: slotSchema,
      level: reasoningChoiceSchema.nullable(),
    }),
    line: "Set reasoning for one provider/model offering at one intelligence level; null uses the level default.",
    toRequest: (v) => [v.key, v.slot, v.level],
    readValue: (c) => ({ slots: c }),
    done: (v) =>
      `${v.key} at ${v.slot}: ${v.level === null ? "Use level default" : reasoningWord({ level: reasoningChoiceSchema.parse(v.level) })}`,
  },
  "crew-slots-reset": {
    area: "intelligence",
    tier: "asked",
    change: "inf:models:slots:reset",
    current: "inf:models:slots",
    value: z.strictObject({ provider: z.string().min(1).optional() }),
    line: "Reset crew slots to starters for one provider, or all providers when omitted.",
    toRequest: (v) => (v.provider ? [v.provider] : []),
    readValue: (c) => ({ slots: c }),
    done: (v) => `crew slots reset for ${v.provider ?? "all providers"}`,
  },
  "model-pins": {
    fields: ["pins", "dormantPins"],
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:routing:set",
    current: "inf:settings:routing:get",
    value: z
      .strictObject({
        pins: z
          .array(z.strictObject({ provider: z.string().min(1), id: z.string().min(1) }))
          .optional(),
        restore: z.literal(true).optional(),
      })
      .refine((v) => (v.pins === undefined) !== (v.restore === undefined), {
        message: "model-pins takes pins, or restore alone",
      }),
    line: "Replace the ordered model pins that Infinitary tries first. restore true puts back the saved pins (dormant) after the current ones, as Settings → Intelligence's Restore does.",
    toRequest: (v, c) => {
      const routing = c as RoutingSettings;
      if (v.restore !== true) return [{ ...routing, pins: v.pins }];
      if (!routing.dormantPins?.length) throw new Error("No saved pins to restore.");
      return [restoredPins(routing)];
    },
    readValue: (c) => ({
      pins: (c as RoutingSettings).pins,
      dormant: (c as RoutingSettings).dormantPins ?? [],
    }),
    done: (v) =>
      `model pins ${(v.pins as { provider: string; id: string }[]).map((p) => `${p.provider}/${p.id}`).join(", ") || "cleared"}`,
  },
  "decision-model": {
    fields: ["answerer"],
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:decisions:set",
    current: "inf:settings:decisions",
    value: z.strictObject({ answerer: decisionAnswererSchema }),
    line: "Choose the decision model. Existing outbound consent is preserved; keys and consent stay in Settings.",
    toRequest: (v, c) => [{ ...(c as DecisionsView).settings, answerer: v.answerer }],
    readValue: (c) => ({ answerer: (c as DecisionsView).settings.answerer }),
    done: (v) => decisionModelDone(v.answerer),
  },
  "refresh-usage": {
    area: "intelligence",
    tier: "asked",
    change: "inf:quota:refresh",
    current: "inf:quota:snapshot",
    value: z.strictObject({}),
    line: "Refresh subscription usage when asked; unknown remains unknown.",
    toRequest: () => [],
    readValue: (c) => ({ usage: c }),
    done: () => "usage refreshed",
  },
  "account-rename": {
    area: "intelligence",
    tier: "asked",
    change: "inf:accounts:rename",
    current: "inf:accounts:list",
    value: z.strictObject({
      accountId: z.string().min(1),
      label: z.string().trim().min(1).max(64),
      deviceId: z.string().min(1).max(64).optional(),
    }),
    line: "Rename an account by id. For an account on a computer that runs work, also pass its deviceId; device-sign-in's state lists its accounts by id.",
    toRequest: (v) => (v.deviceId ? [v.accountId, v.label, v.deviceId] : [v.accountId, v.label]),
    readValue: (c) => ({
      accounts: (c as AccountView[]).map((a) => ({ id: a.id, label: a.label })),
    }),
    done: (v) => `account ${v.accountId} renamed ${v.label}`,
  },
  "account-pause": {
    area: "intelligence",
    tier: "asked",
    change: "inf:accounts:set-enabled",
    current: "inf:accounts:list",
    value: z.strictObject({
      accountId: z.string().min(1),
      paused: z.boolean(),
      deviceId: z.string().min(1).max(64).optional(),
    }),
    line: "Pause or resume an account by id; keeps its sign-in. For an account on a computer that runs work, also pass its deviceId; device-sign-in's state lists its accounts by id.",
    toRequest: (v) =>
      v.deviceId ? [v.accountId, !v.paused, v.deviceId] : [v.accountId, !v.paused],
    readValue: (c) => ({
      accounts: (c as AccountView[]).map((a) => ({ id: a.id, paused: !a.enabled })),
    }),
    done: (v) => `account ${v.accountId} ${v.paused ? "paused" : "resumed"}`,
  },
  "account-prefer": {
    area: "intelligence",
    tier: "asked",
    change: "inf:accounts:pin",
    current: "inf:accounts:list",
    value: z.strictObject({
      provider: z.string().min(1),
      accountId: z.string().min(1).nullable(),
      deviceId: z.string().min(1).max(64).optional(),
    }),
    line: "Prefer an account of a provider for crew work; null clears the preference. The first mate's own account is firstmate-account. For a computer that runs work, also pass its deviceId: its preference covers only crew work there, from device-sign-in's state.",
    toRequest: (v) =>
      v.deviceId ? [v.provider, v.accountId, v.deviceId] : [v.provider, v.accountId],
    readValue: (c) => ({
      accounts: (c as AccountView[]).map((a) => ({
        id: a.id,
        provider: a.providerId,
        preferred: a.pinned,
      })),
    }),
    done: (v) => `preferred account for ${v.provider}: ${v.accountId ?? "Auto"}`,
  },
  "account-keep-going": {
    area: "intelligence",
    tier: "own-words",
    change: "inf:accounts:keep-going",
    current: "inf:accounts:list",
    value: z.strictObject({
      accountId: z.string().min(1),
      on: z.boolean(),
      deviceId: z.string().min(1).max(64).optional(),
    }),
    line: "Turn an account's Keep going on credits on or off by id, only on typed captain words: once its allowance is spent it keeps serving on credits set up with its provider, after every included allowance. Claude and Codex only. For an account on a computer that runs work, also pass its deviceId; device-sign-in's state lists its accounts by id.",
    toRequest: (v) => (v.deviceId ? [v.accountId, v.on, v.deviceId] : [v.accountId, v.on]),
    readValue: (c) => ({
      accounts: (c as AccountView[]).map((a) => ({
        id: a.id,
        provider: a.providerId,
        keepGoingOnCredits: a.keepGoingOnCredits === true,
      })),
    }),
    done: (v) => `account ${v.accountId} ${v.on ? "keeps going" : "stops"} on credits`,
  },
  ...savedResetLines,
  "account-disconnect": {
    area: "intelligence",
    tier: "own-words",
    change: "inf:accounts:remove",
    current: "inf:accounts:list",
    value: z.strictObject({
      accountId: z.string().min(1),
      deviceId: z.string().min(1).max(64).optional(),
    }),
    line: "Disconnect an account only on typed captain words. Cannot disconnect the account running the first mate. For an account on a computer that runs work, also pass its deviceId; device-sign-in's state lists its accounts by id.",
    toRequest: (v) => (v.deviceId ? [v.accountId, v.deviceId] : [v.accountId]),
    readValue: (c) => ({ accounts: (c as AccountView[]).map((a) => ({ id: a.id })) }),
    done: (v) => `account ${v.accountId} disconnected`,
  },
  "custom-connection-file": {
    area: "intelligence",
    tier: "own-words",
    change: "inf:accounts:custom:file:set",
    current: "inf:accounts:custom:file",
    value: z.strictObject({ path: z.string().trim().min(1).max(4096).nullable() }),
    // i18n-exempt: served to the first mate, a model, never shown
    line: "The connection file this computer reads custom connections from, in Pi's models.json format; null reads none. Only on the captain's own words. The app never writes it, and each connection in it still waits for the captain's approval in Settings → Intelligence.",
    toRequest: (v, _current, expandHome) => [v.path === null ? null : expandHome(v.path as string)],
    readValue: (current) => ({ path: (current as { path: string | null }).path }),
    done: (v) =>
      englishOf(
        v.path === null
          ? said("accountsCustomApiFileDoneNone")
          : said("accountsCustomApiFileDone", { path: v.path as string }),
      ),
  },
  "projects-folder": {
    area: "projects",
    tier: "own-words",
    change: "inf:repos:folder:set",
    current: "inf:repos:folder",
    value: z.strictObject({ path: z.string().trim().min(1).nullable() }),
    line: "Where new projects go; null restores the default. Only on the captain's own words. Existing projects stay put; a missing folder is refused.",
    toRequest: (v, _current, expandHome) => [v.path === null ? null : expandHome(v.path as string)],
    readValue: (current) => ({ path: (current as { path: string }).path }),
    done: (v) => `new projects now go in ${v.path}`,
  },
  "project-batch-answer": {
    area: "projects",
    tier: "judgment",
    change: "inf:repos:batch-answer",
    current: "inf:repos:list",
    value: z.strictObject({ repoId: z.string().min(1), answer: batchAnswerSchema }),
    line: "Try a project's held batch of the captain's approved changes again on your own judgment, with every change waiting in line; or send changes back from it, each by its taskId with the captain's reason, only on their own words. head is the held version.",
    toRequest: (v) => [v.repoId, v.answer],
    readValue: (c) => ({
      held: (c as RepoView[])
        .filter((repo) => repo.batch?.open?.hold)
        .map(({ id, name, batch }) => ({ id, name, batch: batch?.open })),
    }),
    done: (v) =>
      (v.answer as BatchAnswer).action === "try-again"
        ? "asked for the held batch to be tried again"
        : `sent ${(v.answer as Extract<BatchAnswer, { action: "send-back" }>).changes.length} of the held batch's changes back`,
  },
  "cost-limit": {
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:cost-limit:set",
    current: "inf:settings:cost-limit:get",
    value: z.strictObject({ limit: costLimitSchema }),
    line: "Set the app's per-task cost limit when asked: {usd} in estimated US dollars, or {none:true} for no limit. It counts each task and everything under it, parts included. Project and task choices take precedence. The default lives in Settings → Intelligence.",
    toRequest: (v) => [v.limit],
    readValue: costLimitValue,
    done: (v) => {
      const limit = v.limit as AppCostLimitView["limit"];
      return "usd" in limit ? `task cost limit ${formatUsd(limit.usd)}` : "no task cost limit";
    },
  },
  notifications: {
    area: "general",
    tier: "asked",
    change: "inf:settings:notifications:set",
    current: "inf:settings:notifications:get",
    value: z.strictObject({ enabled: z.boolean() }),
    line: "Turn notifications on or off when asked.",
    toRequest: (v) => [v.enabled],
    readValue: enabledValue,
    done: (v) => `notifications ${v.enabled ? "on" : "off"}`,
  },
  runbook: {
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:runbooks:set",
    current: "inf:settings:runbooks:get",
    value: z.strictObject({ id: z.string(), enabled: z.boolean() }),
    line: "Turn a named runbook on or off when asked. Read the available names and ids first.",
    toRequest: (v) => [v.id, v.enabled],
    readValue: (current) => ({ runbooks: current }),
    done: (v) =>
      `${v.name} ${v.enabled ? "on" : "off"}${v.replacement ? `; ${v.replacement} off` : ""}`,
  },
  "runbook-copy": {
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:runbooks:copy",
    current: "inf:settings:runbooks:get",
    value: z.strictObject({ id: z.string(), copyId: z.string(), name: z.string().min(1) }),
    line: "Copy a built-in runbook into the personal workspace when asked. Choose an unused copyId and a name. The copy starts off and its path is returned in the runbooks list. Edit its files there; turning it on with runbook turns the named built-in off. To restore ours, turn the copy off and ours on.",
    toRequest: (v) => [v.id, v.copyId, v.name],
    readValue: (current) => ({ runbooks: current }),
    done: (v) =>
      `copied ${v.source} as ${v.name} in your personal workspace; off until you turn it on`,
  },
  "personal-resources": {
    area: "intelligence",
    tier: "asked",
    change: "inf:settings:personal-resources:set",
    current: "inf:settings:personal-resources:get",
    value: z.strictObject({ enabled: z.boolean() }),
    line: `Use each ${COMPUTER.one}'s own global instructions and skills for crewmates when asked. Crew rules govern delivery; personal instructions guide style and judgment. MCP and hooks stay off.`,
    toRequest: (v) => [v.enabled],
    readValue: enabledValue,
    done: (v) => `global instructions and skills ${v.enabled ? "on" : "off"}`,
  },
  ...appearanceLines,
  ...themeLines,
  "panel-collapse": {
    fields: ["collapsedPanels"],
    area: "panels",
    tier: "asked",
    change: "inf:settings:layout:set",
    current: "inf:settings:layout:get",
    value: z.strictObject({ surface: z.string().min(1).max(64), collapsed: z.boolean() }),
    line: "Collapse or expand a panel by its surface id when asked.",
    toRequest: (v, current) => [
      {
        ...(current as Layout),
        collapsedPanels: {
          ...(current as Layout).collapsedPanels,
          [v.surface as string]: v.collapsed,
        },
      },
    ],
    readValue: (current) => ({ collapsedPanels: (current as Layout).collapsedPanels }),
    done: (v) => `${v.surface} ${v.collapsed ? "collapsed" : "expanded"}`,
  },
  // Settings → Automation's own changes (docs/automation.md, "One owner").
  // The words are the Scheduler's, and the trail is the dispatcher's.
  "automation-edit": {
    fields: ["id", "name", "spec", "prompt", "projectId", "enable", "reconnect"],
    area: "automation",
    tier: "asked",
    change: "inf:automation:save",
    current: "inf:automation:list",
    value: z.strictObject({
      id: automationIdSchema,
      name: z.string().max(80).optional(),
      spec: automationSpecSchema.optional(),
      prompt: z.string().trim().min(1).optional(),
      projectId: z.string().min(1).nullable().optional(),
      enable: z.boolean().optional(),
      reconnect: z.literal(true).optional(),
    }),
    line: `Edit one automation by id when asked: its name, spec, prompt or projectId (null takes it off); what you leave out stays. enable true turns a draft or a paused one on. reconnect true has an event rule that waits (stopped) listen to what its integration's id is connected to now. ${scheduleDetailsWords()} Its current value is the app's record of each rule: lastFired is when it last ran (null if never), and failing says since when an event rule's every look has failed; app_state read automation.history with its id lists its recent runs.`,
    toRequest: (v, current) => {
      const rule = automationRule(current, v.id);
      const projectId =
        v.projectId === undefined ? rule.projectId : ((v.projectId as string | null) ?? undefined);
      return [
        {
          id: rule.id,
          name: (v.name as string | undefined) ?? rule.name ?? "",
          spec: v.spec ?? rule.spec,
          prompt: (v.prompt as string | undefined) ?? rule.prompt,
          ...(projectId ? { projectId } : {}),
          ...(v.enable === true ? { enable: true } : {}),
          ...(v.reconnect === true ? { reconnect: true } : {}),
        },
      ];
    },
    readValue: (current) => automationValue(current),
    done: (v) => String(v.text),
  },
  "automation-state": {
    area: "automation",
    tier: "judgment",
    change: "inf:automation:state",
    current: "inf:automation:list",
    value: z.strictObject({ id: automationIdSchema, change: z.enum(["pause", "resume"]) }),
    line: "Pause or resume one automation by id on your own judgment: a paused one sends nothing, and its unsent prompts are taken back. A draft turns on only through automation-edit.",
    toRequest: (v, current) => {
      const rule = automationRule(current, v.id);
      if (v.change === "resume" && rule.state === "draft")
        throw new Error(
          "This automation is a draft: turn it on with automation-edit, enable true.",
        );
      return [rule.id, v.change];
    },
    readValue: (current) => automationValue(current, true),
    done: (v) => String(v.text),
  },
  "automation-pause-all": {
    area: "automation",
    tier: "judgment",
    change: "inf:automation:pause-all",
    current: "inf:automation:list",
    value: z.strictObject({}),
    line: "Pause every running automation at once on your own judgment; drafts and paused ones stay as they are.",
    toRequest: () => [],
    readValue: (current) => automationValue(current, true),
    done: (v) => String(v.text),
  },
  // A rule's notes are the captain's to change in Settings and its runs'
  // crewmates' by file (docs/automation.md, "A rule's notes"); never the
  // first mate's.
  "automation-notes": {
    area: "automation",
    tier: "yours",
    // A notes save changes nothing the list reads back, so it always trails.
    alwaysTrail: true,
    change: "inf:automation:notes-save",
    current: "inf:automation:list",
    value: z.strictObject({ id: automationIdSchema, text: z.string() }),
    line: "An automation's notes change only in Settings or by its run's crewmate.",
    toRequest: (v, current) => [automationRule(current, v.id).id, v.text],
    readValue: (current) => automationValue(current, true),
    done: (v) => String(v.text),
  },
  "automation-delete": {
    area: "automation",
    tier: "judgment",
    change: "inf:automation:delete",
    current: "inf:automation:list",
    value: z.strictObject({ id: automationIdSchema }),
    line: "Delete one automation and its run history by id on your own judgment, as cancel_schedule does.",
    toRequest: (v, current) => [automationRule(current, v.id).id],
    readValue: (current) => automationValue(current, true),
    done: (v) => String(v.text),
  },
  // Kept running's Remove (docs/leftover-programs.md, "Kept running"): a job
  // the captain asked to keep past its task's close, removed on the
  // computer it runs on by the command its crewmate recorded.
  "kept-job-remove": {
    area: "automation",
    tier: "asked",
    change: "inf:automation:kept-remove",
    current: "inf:automation:kept",
    value: z.strictObject({ id: z.string().trim().min(1).max(256) }),
    line: "Remove one job kept running past its task's close, by id, when asked: its recorded remove runs on the computer it runs on. A remove that does not finish keeps it listed.",
    toRequest: (v, current) => {
      const job = (current as KeptJobsView).jobs.find((entry) => entry.id === v.id);
      if (!job) throw new Error(`No kept job ${v.id}. Its id is in this action's current value.`);
      return [job.id];
    },
    readValue: (current) => ({
      jobs: (current as KeptJobsView).jobs.map((job) => ({
        id: job.id,
        label: job.label,
        computer: job.computerName,
        task: job.key || job.task,
        ...(job.removeFailed ? { removeFailed: job.removeFailed.outcome } : {}),
      })),
    }),
    done: (v) => String(v.text),
  },
  ...ambientLines,
  ...handoverLines,
  ...showLines,
  ...summaryPointLines,
  ...settingsActs,
} as const satisfies Record<string, ActionLine>;
export type ActionName = keyof typeof actionLines;

/** The value an action accepts, as its line's schema reads it (unknown where a line is built generically). */
export type ActionValue<A extends ActionName> = z.input<(typeof actionLines)[A]["value"]>;
export const ACTIONS: Record<ActionName, ActionLine> = actionLines;
export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];
export type ActionActor =
  | {
      kind: "captain";
      projectBefore?: unknown;
      /**
       * The panel the captain pressed in, by its title, when a panel asked
       * the change on that press (docs/ui-plugins.md, "Changing settings").
       */
      panel?: string;
      /** The paired view (a phone, or a Mac that controls this one) that asked, by its device id. */
      view?: string;
      /** The contract version that paired view's hello spoke, as its connection heard it. */
      viewVersion?: string;
      /** The contract changes that paired view's hello listed, as its connection heard them. */
      viewChanges?: readonly string[];
    }
  | {
      kind: "firstmate";
      wake: "captain" | "captain-choice" | "scheduled" | "other";
      action?: ActionName;
      evidence?: string;
      projectWords?: boolean;
      /**
       * The panel a `panel` action names, as the first mate wrote it, so a
       * move that reads two ways is told the way it was asked (INF-2344).
       */
      target?: string;
      /**
       * The computer whose own window the first mate asks, for a window's own
       * request (docs/view.md, "What the first mate asks of a window"): a Mac
       * that controls this one, or this computer's own window for a key reminder.
       */
      /** A window's own setting: that computer's window, and its value as the first mate read it. */
      window?: { deviceId: string; name: string; read?: unknown; sets?: string[] };
      /**
       * Where the captain's words a `direction` change cites were heard, as
       * the host checked them (`heardDirection`); absent on the first mate's
       * own judgment.
       */
      heard?: KnowledgeDirectionHeard;
    };
/** Settings and Firstmate share this project-change path. */
export function isProjectChange(action: ActionName): boolean {
  return action === "project-settings" || action === "project-runs-on" || action === "project-move";
}
export function actionRefusal(line: ActionLine, actor: ActionActor): string | null {
  if (actor.kind === "captain") return null;
  if (actor.action && isProjectChange(actor.action) && actor.projectWords !== true)
    return "Propose the project change through app_change, or declare the exact captain words with on_words true.";
  if (actor.action && isProjectChange(actor.action) && actor.wake === "captain-choice")
    return "Only the app’s exact-change card applies a project change from a click.";
  // A judgment line is the first mate's to run at any wake; its evidence is
  // the reason the record keeps.
  if (line.tier === "judgment")
    return actor.evidence?.trim() ? null : "Give the reason for this change.";
  if (line.tier === "hands" || line.tier === "yours")
    return "This action stays with the captain in Settings.";
  // Whatever began the turn: his choice relayed in a crewmate's report, or a
  // message he sent while the turn ran, reaches the first mate there too.
  if (!actor.evidence?.trim())
    return "Give the captain's words, choice or schedule that asked for this change.";
  return null;
}

/**
 * Static capability flags; a wake's permission is separately exposed as
 * allowedNow. A line that proposes is the Firstmate's to propose at any wake.
 */
export function actionActors(line: ActionLine): {
  captainAllowed: true;
  firstmateAllowed: boolean;
} {
  return {
    captainAllowed: true,
    firstmateAllowed:
      line.tier === "asked" ||
      line.tier === "own-words" ||
      line.tier === "judgment" ||
      line.proposes === true,
  };
}

/** Tool guidance follows the same permission lines as dispatch. */
export const OWN_WORDS_ACTIONS = ACTION_NAMES.filter((name) => ACTIONS[name].tier === "own-words");
