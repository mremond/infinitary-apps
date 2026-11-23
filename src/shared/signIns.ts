import { z } from "zod";
import {
  ACCOUNT_LABEL_MAX,
  accountViewSchema,
  type MachineLoginOutcome,
  machineLoginOutcomeSchema,
} from "./accounts";
import { crewSpeedSchema } from "./crewSpeed";
import {
  customApiAddressSchema,
  customApiConnectInputSchema,
  customApiConnectResultSchema,
  customApiReviewSchema,
  customApiViewSchema,
  customCapabilityProfileSchema,
  customListedModelSchema,
  customNetworkModeSchema,
} from "./customApi";
import { COMPUTER } from "./deviceNames";
import { computerReachSchema, deviceLabel, userDisplayName } from "./devices";
import {
  FORGE_HOST_NAME,
  forgeBrowserSignInSchema,
  forgeCliSignInResultSchema,
  forgeKeySignInResultSchema,
  forgeKeySignInSchema,
  forgeServerViewSchema,
  forgeSignInStateSchema,
} from "./forges";
import { listedIds } from "./modelListing";
import { reasoningCapabilitiesSchema } from "./modelSlots";
import { authNoticeSchema, authPromptSchema, providerViewSchema } from "./providers";
import { quotaSnapshotViewSchema } from "./quota";
import { savedResetResultSchema } from "./savedResets";
import { deviceWorkSetupSchema } from "./workSetup";

/**
 * Sign-ins owned by a computer that runs work (piece 9, docs/helper.md
 * "Its own sign-ins"): that computer signs in to its own subscriptions, the
 * flow runs there, and the home draws it in Settings -> Intelligence. Nothing
 * here is a new kind of message: both directions ride the connection's own
 * `invoke` and `result` (src/shared/connection.ts), like a conversation held
 * there (src/shared/work.ts).
 *
 * - **Orders**, asked by the home of the computer: what it is signed in to,
 *   start a sign-in, answer one of its prompts, stop it, and sign out. The
 *   answer is what the captain typed - a pasted code or a key - and it
 *   crosses once, inside that order's arguments: the home keeps no copy, and
 *   no answer, event or saved file at home holds it.
 * - **Work requests**, asked by the computer of its home: one step of a
 *   running sign-in (a prompt, a notice, its end), and its sign-ins whole
 *   after any change. Each is asked once while the home is in reach and never
 *   again: a sign-in whose home went out of reach is stopped on the computer.
 *
 * The same orders and steps carry the computer's own sign-in where projects
 * live (GitHub, `docs/forge.md`), which its clones and pushes use: the device
 * flow runs there, its code to read is a step, and it finishes there itself.
 *
 * No shape here carries a credential: what a computer says of its sign-ins
 * is the account rows, the allowance and who each host says it is, which the
 * window draws, never a store.
 */

/** A sign-in's id, minted at the home when the captain starts it; it names nothing on disk. */
export const signInIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** The longest answer a sign-in prompt takes: room for a pasted redirect address or a key. */
export const SIGN_IN_ANSWER_MAX_CHARS = 16_384;

const okSchema = z.object({ ok: z.literal(true) });

/** A host a project lives on, as a forge sign-in names it ("github.com"). */
export const forgeHostSchema = z.string().min(1).max(253).regex(FORGE_HOST_NAME);

/**
 * A computer's own sign-ins where projects live, for its clones and pushes:
 * each host it is signed in to with who the host says it is and that
 * sign-in's health as read there, and every host it offers a sign-in to.
 */
export const computerForgesSchema = z.object({
  signIns: z.array(
    z.object({
      host: forgeHostSchema,
      /** The person's word for the host ("GitHub"). */
      name: z.string().min(1).max(64),
      /** Who the host says it is signed in as; null until it has answered once. */
      login: z.string().max(100).nullable(),
      state: forgeSignInStateSchema,
      /** When the sign-in was made there. */
      since: z.number().int().nonnegative(),
      /** Made through that computer's own GitHub CLI, which it asks for each sign-in. */
      way: z.literal("cli").optional(),
      /** A host on the person's own server, or GitLab: its kind (`computer-forge-servers`). */
      server: forgeServerViewSchema.optional(),
      /** The public Application ID a GitLab browser sign-in used there; never a secret. */
      applicationId: z.string().max(256).optional(),
    }),
  ),
  /**
   * The hosts a sign-in row is drawn for: each one that signs in with a
   * code whatever the computer has (github.com), and each other one it is
   * signed in to, with its kind.
   */
  hosts: z.array(
    z.object({
      host: forgeHostSchema,
      name: z.string().min(1).max(64),
      server: forgeServerViewSchema.optional(),
    }),
  ),
  /**
   * The kinds of server it signs in to by an address there, with a key or,
   * for GitLab, a browser code (`inf:sign-ins:forge-key`,
   * `inf:sign-ins:forge-browser`): GitHub Enterprise and GitLab. Absent from
   * a computer without `computer-forge-servers`, which signs in to
   * github.com alone.
   */
  servers: z.array(forgeServerViewSchema).optional(),
  /**
   * GitHub CLI is installed there, so its GitHub row offers "Use GitHub CLI"
   * (`inf:sign-ins:forge-cli`). An older computer that leaves it out
   * offers the code alone; major 15 includes this capability.
   */
  githubCli: z.boolean().optional(),
});
export type ComputerForges = z.infer<typeof computerForgesSchema>;

/** One model an account on a computer can serve, as that computer read it. Never a credential. */
export const computerServedModelSchema = z.object({
  speeds: z.array(crewSpeedSchema).optional(),
  speedsUntil: z.number().int().nonnegative().optional(),
  reasoningCapabilities: reasoningCapabilitiesSchema.optional(),
  provider: z.string().min(1).max(256),
  id: z.string().min(1).max(256),
  name: z.string().max(256).optional(),
});
export type ComputerServedModel = z.infer<typeof computerServedModelSchema>;

/**
 * The most models one account there lists. OpenRouter alone serves more
 * than four hundred and keeps adding more, so the bound leaves it room.
 */
export const SERVED_MODELS_MAX = 2_000;

/** The longest model id an account's own list may name for the home (`accountList`). */
export const ACCOUNT_LIST_ID_MAX = 256;

/** The models one account there can serve. */
export const computerServedAccountSchema = z.object({
  accountId: z.string().min(1).max(256),
  models: z.array(computerServedModelSchema).max(SERVED_MODELS_MAX),
  /**
   * The ids a Codex or Grok account's own model list named in its last
   * successful read there; `models` is Pi's catalog for it, unnarrowed. The
   * home narrows `models` by it behind its own rail, which protects the
   * models the captain kept (`narrowServedThere`). Absent before a read,
   * after a failed one, and from a computer older than protocol 8.7.
   */
  accountList: z
    .array(z.string().min(1).max(ACCOUNT_LIST_ID_MAX))
    .max(SERVED_MODELS_MAX)
    .optional(),
});

/**
 * One account's models as a computer lists them for its home: at most
 * `SERVED_MODELS_MAX`, the ones the Models board lists first
 * (`listedIds`), so a provider that outgrows the bound never makes the
 * whole list unreadable at the home.
 */
export function servedForHome(
  providerId: string,
  models: readonly ComputerServedModel[],
): ComputerServedModel[] {
  if (models.length <= SERVED_MODELS_MAX) return [...models];
  const listed = listedIds(
    providerId,
    models.filter((model) => model.provider === providerId).map((model) => model.id),
  );
  const onBoard = (model: ComputerServedModel) =>
    model.provider === providerId && listed.has(model.id);
  return [...models.filter(onBoard), ...models.filter((model) => !onBoard(model))].slice(
    0,
    SERVED_MODELS_MAX,
  );
}

/** What a computer says it can sign in to and is signed in to, with its allowance as read there. */
export const computerSignInsSchema = z.object({
  /** Every provider it offers, with why one cannot sign in there (Claude Code not installed). */
  providers: z.array(providerViewSchema),
  accounts: z.array(accountViewSchema),
  /** Its last reading of each account's allowance; null before the first. */
  quota: quotaSnapshotViewSchema.nullable(),
  /** Its own sign-ins where projects live; absent from a computer older than `FORGE_SIGN_INS_SINCE`. */
  forges: computerForgesSchema.optional(),
  /**
   * Its custom API connections, as the form draws them. Absent from a
   * computer older than `CUSTOM_API_SIGN_INS_SINCE`; a computer that knows
   * them sends the array, empty when it holds none. No view carries a key.
   */
  custom: z.array(customApiViewSchema).max(32).optional(),
  /**
   * The models each account there can serve, as that computer read them.
   * A provider this Mac's catalog does not list (OpenRouter, a custom
   * connection) is routed from this list. Absent from a computer older
   * than `CUSTOM_API_SIGN_INS_SINCE`.
   */
  served: z.array(computerServedAccountSchema).max(64).optional(),
});
export type ComputerSignIns = z.infer<typeof computerSignInsSchema>;

/** One step of a sign-in running on a computer. */
export const signInStepSchema = z.discriminatedUnion("kind", [
  /** It waits for the captain: a choice, a code to paste back, or a key. */
  z.object({ kind: z.literal("prompt"), prompt: authPromptSchema }),
  /** Where it is: a link to open, a code to read, progress. */
  z.object({ kind: z.literal("notice"), notice: authNoticeSchema }),
  z.object({
    kind: z.literal("ended"),
    /**
     * `signs-in-there`: a provider that signs in only on that computer itself
     * had no login there to adopt; the home says where to log in. Only a
     * computer older than `FORGE_SIGN_INS_SINCE` says it, of Claude Code,
     * which now signs in there with a code pasted back.
     */
    outcome: z.enum(["signed-in", "failed", "cancelled", "signs-in-there"]),
    /** The account it signed in, on that computer. */
    accountId: z.string().optional(),
    /**
     * What using one of the account's saved Codex resets came to
     * (`inf:sign-ins:use-saved-reset`), on a use that ended with a clear
     * answer; its outcome is then `signed-in`, which an older view reads as
     * a flow that ended as asked.
     */
    savedReset: savedResetResultSchema.optional(),
    /** Why it failed, in the provider's or the computer's words. */
    error: z.string().optional(),
  }),
]);
export type SignInStep = z.infer<typeof signInStepSchema>;

/** The orders a home asks a computer that runs work about its sign-ins. */
export const signInOrders = {
  "inf:sign-ins:list": {
    effect: "read",
    request: z.tuple([]),
    response: computerSignInsSchema,
  },
  /**
   * Starts a sign-in there: a new account, or `accountId` again. It answers
   * once it has started; its steps and its end come as `inf:work:sign-in`.
   */
  "inf:sign-ins:start": {
    effect: "change",
    request: z.tuple([
      z.object({
        signInId: signInIdSchema,
        providerId: z.string().min(1).max(256),
        type: z.enum(["oauth", "api_key"]),
        accountId: z.string().min(1).max(256).optional(),
      }),
    ]),
    response: okSchema,
  },
  /** What the captain typed or chose for one prompt, sent once; `null` stops the sign-in. */
  "inf:sign-ins:answer": {
    effect: "change",
    request: z.tuple([
      z.object({
        signInId: signInIdSchema,
        promptId: z.string().min(1).max(128),
        value: z.string().max(SIGN_IN_ANSWER_MAX_CHARS).nullable(),
      }),
    ]),
    response: okSchema,
  },
  "inf:sign-ins:cancel": {
    effect: "change",
    request: z.tuple([z.object({ signInId: signInIdSchema })]),
    response: okSchema,
  },
  /**
   * Signs that computer out of one account: its store there is deleted.
   * For a Claude account it answers what became of that computer's own
   * Claude login (`login`): signed out when Firstmate made it there from a
   * pasted code, kept when it did not. A computer older than this answers
   * without it.
   */
  "inf:sign-ins:remove": {
    effect: "change",
    request: z.tuple([z.object({ accountId: z.string().min(1).max(256) })]),
    response: okSchema.extend({ login: machineLoginOutcomeSchema.optional() }),
  },
  /**
   * Starts the computer's own sign-in where projects live (GitHub's device
   * flow), there, from `FORGE_SIGN_INS_SINCE`. Its code to read comes as a
   * `notice` step and its end as `ended`; nothing is typed, and
   * `inf:sign-ins:cancel` stops it.
   */
  "inf:sign-ins:forge": {
    effect: "change",
    request: z.tuple([z.object({ signInId: signInIdSchema, host: forgeHostSchema })]),
    response: okSchema,
  },
  /**
   * Signs that computer in to a GitHub host through its own GitHub CLI's
   * sign-in, there (docs/forge.md, "A computer's own sign-in"): it asks
   * GitHub CLI and the host who that is, and keeps only the way and the
   * program's path. No token crosses; the answer says only whether it was
   * kept. Offered where its forges say `githubCli`.
   */
  "inf:sign-ins:forge-cli": {
    effect: "change",
    request: z.tuple([z.object({ host: forgeHostSchema })]),
    response: forgeCliSignInResultSchema,
  },
  /**
   * Signs that computer in to GitLab or a host on the person's own server
   * with a key made there, from `computer-forge-servers` (docs/forge.md, "A
   * computer's own sign-in"). The key rides this order once and is kept only
   * in that computer's store; the answer says whether the host answered for
   * it, never the key.
   */
  "inf:sign-ins:forge-key": {
    effect: "change",
    request: z.tuple([forgeKeySignInSchema]),
    response: forgeKeySignInResultSchema,
  },
  /**
   * Starts GitLab's browser code sign-in there with a public application the
   * person registered on that host, from `computer-forge-servers`. Its code
   * to read comes as a `notice` step and its end as `ended`, as
   * `inf:sign-ins:forge`'s do.
   */
  "inf:sign-ins:forge-browser": {
    effect: "change",
    request: z.tuple([forgeBrowserSignInSchema.extend({ signInId: signInIdSchema })]),
    response: okSchema,
  },
  /** Signs that computer out where a project lives: its sign-in there is deleted. */
  "inf:sign-ins:forge-out": {
    effect: "change",
    request: z.tuple([z.object({ host: forgeHostSchema })]),
    response: okSchema,
  },
  /**
   * A custom API connection typed at the home and kept on this computer,
   * from `CUSTOM_API_SIGN_INS_SINCE`. The address is read here, so localhost
   * is this computer. The key and headers ride once inside `custom-connect`
   * and are kept only in this computer's store. Disconnect reuses
   * `inf:sign-ins:remove`.
   */
  "inf:sign-ins:custom-address": {
    effect: "read",
    request: z.tuple([z.string().max(4096)]),
    response: customApiAddressSchema,
  },
  "inf:sign-ins:custom-profiles": {
    effect: "read",
    request: z.tuple([]),
    response: z.array(customCapabilityProfileSchema),
  },
  "inf:sign-ins:custom-review": {
    effect: "read",
    request: z.tuple([
      z.string().max(4096),
      customNetworkModeSchema,
      z.string().max(65536).optional(),
    ]),
    response: customApiReviewSchema,
  },
  "inf:sign-ins:custom-connect": {
    effect: "change",
    request: z.tuple([customApiConnectInputSchema]),
    response: customApiConnectResultSchema,
  },
  "inf:sign-ins:custom-check": {
    effect: "change",
    request: z.tuple([z.string().min(1).max(128), z.string().min(1).max(256)]),
    response: customApiViewSchema,
  },
  "inf:sign-ins:custom-discover": {
    effect: "change",
    request: z.tuple([z.string().min(1).max(128)]),
    response: z.array(customListedModelSchema),
  },
  "inf:sign-ins:custom-cancel": {
    effect: "change",
    request: z.tuple([z.string().min(1).max(128)]),
    response: okSchema,
  },
  "inf:sign-ins:custom-save": {
    effect: "change",
    request: z.tuple([z.string().min(1).max(128), z.boolean()]),
    response: customApiViewSchema,
  },
  "inf:sign-ins:custom-recheck": {
    effect: "change",
    request: z.tuple([z.string().min(1).max(256)]),
    response: customApiViewSchema,
  },
  /**
   * Turns one of that computer's own accounts' Keep going on credits switch
   * on or off (docs/quota.md), saved only there, from the contract change
   * `computer-keep-going`. Only the account id and the switch cross; its
   * rows reach the home as that computer's sign-ins, whole.
   */
  "inf:sign-ins:keep-going": {
    effect: "change",
    request: z.tuple([z.object({ accountId: z.string().min(1).max(256), on: z.boolean() })]),
    response: okSchema,
  },
  /**
   * Renames, pauses or resumes, and prefers one of that computer's own
   * accounts, saved only there, from the contract change
   * `computer-account-settings`. Its rows reach the home as that computer's
   * sign-ins, whole, so its routing there reads the same switch and pin.
   */
  "inf:sign-ins:rename": {
    effect: "change",
    request: z.tuple([
      z.object({
        accountId: z.string().min(1).max(256),
        label: z.string().min(1).max(ACCOUNT_LABEL_MAX),
      }),
    ]),
    response: okSchema,
  },
  "inf:sign-ins:set-enabled": {
    effect: "change",
    request: z.tuple([z.object({ accountId: z.string().min(1).max(256), enabled: z.boolean() })]),
    response: okSchema,
  },
  /** One account per provider crew work prefers there; null clears it. */
  "inf:sign-ins:pin": {
    effect: "change",
    request: z.tuple([
      z.object({
        providerId: z.string().min(1).max(256),
        accountId: z.string().min(1).max(256).nullable(),
      }),
    ]),
    response: okSchema,
  },
  /**
   * Uses one of that computer's own Codex accounts' saved resets there
   * (docs/codex-client.md), from the contract change `use-saved-reset`. It
   * answers once it has started; with `signIn`, Codex may sign in to the
   * account, its link and paste-back prompt coming as `inf:work:sign-in`
   * steps, and the end is a `signed-in` step carrying `savedReset`.
   */
  "inf:sign-ins:use-saved-reset": {
    effect: "change",
    request: z.tuple([
      z.object({
        signInId: signInIdSchema,
        accountId: z.string().min(1).max(256),
        signIn: z.boolean(),
      }),
    ]),
    response: okSchema,
  },
  /**
   * Turns that computer's own Codex account's Use saved resets on their own
   * on or off there (docs/quota.md, "Saved resets on their own"), from the
   * contract change `auto-saved-resets`. It answers once it has started;
   * turning it on with `signIn` lets Codex sign in to the account first, its
   * link and paste-back prompt coming as `inf:work:sign-in` steps, and the
   * end is a `signed-in` step once the switch is saved.
   */
  "inf:sign-ins:use-saved-resets": {
    effect: "change",
    request: z.tuple([
      z.object({
        signInId: signInIdSchema,
        accountId: z.string().min(1).max(256),
        on: z.boolean(),
        signIn: z.boolean(),
      }),
    ]),
    response: okSchema,
  },
  /**
   * Reads every account's allowance there now, rather than at its next
   * tick (`computer-account-settings`); the reading reaches the home as
   * that computer's sign-ins, whole, and this answers once it is read.
   */
  "inf:sign-ins:read-allowance": {
    effect: "change",
    request: z.tuple([]),
    response: okSchema,
  },
} as const satisfies Record<
  `inf:sign-ins:${string}`,
  { effect: "read" | "change"; request: z.ZodType; response: z.ZodType }
>;

export type SignInOrderChannel = keyof typeof signInOrders;
export type SignInOrderRequest<C extends SignInOrderChannel> = z.infer<
  (typeof signInOrders)[C]["request"]
>;
export type SignInOrderResponse<C extends SignInOrderChannel> = z.infer<
  (typeof signInOrders)[C]["response"]
>;
export const SIGN_IN_ORDER_CHANNELS = Object.keys(signInOrders) as SignInOrderChannel[];

export function isSignInOrderChannel(channel: string): channel is SignInOrderChannel {
  return Object.hasOwn(signInOrders, channel);
}

/**
 * The work requests a computer asks its home about its sign-ins, declared
 * into `invokeContract` (src/shared/channels/work.ts) with `reach: "work"`.
 */
export const signInWorkRequests = {
  "inf:work:sign-in": {
    effect: "change",
    request: z.tuple([z.object({ signInId: signInIdSchema, step: signInStepSchema })]),
    response: okSchema,
  },
  "inf:work:sign-ins": {
    effect: "change",
    request: z.tuple([computerSignInsSchema]),
    response: okSchema,
  },
} as const satisfies Record<
  `inf:work:${string}`,
  { effect: "read" | "change"; request: z.ZodType; response: z.ZodType }
>;

/** A view never starts a sign-in whose older home cannot publish its current state. */
export const REMOTE_SIGN_IN_UPDATE_NOTE =
  "Update Infinitary where your first mate lives to sign in here.";

/** A remote sign-in's complete public state, owned by the home, never a typed answer. */
export const deviceSignInFlowSchema = z
  .object({
    signInId: signInIdSchema,
    deviceId: z.string(),
    providerId: z.string(),
    accountId: z.string().optional(),
    target: z.enum(["account", "forge"]),
    notice: authNoticeSchema.optional(),
    link: z.string().optional(),
  })
  .and(
    z.discriminatedUnion("phase", [
      z.object({
        phase: z.literal("running"),
        prompt: authPromptSchema.optional(),
        ended: z.never().optional(),
      }),
      z.object({
        phase: z.literal("ended"),
        prompt: z.never().optional(),
        ended: signInStepSchema.options[2],
      }),
    ]),
  );
export type DeviceSignInFlow = z.infer<typeof deviceSignInFlowSchema>;

/** Each computer that runs work, with what it last said of its sign-ins, as the home's window draws it. */
export const deviceSignInsSchema = z.object({
  /** Window contact, independent of work reach; absent for work-only computers. */
  controlling: z.boolean().optional(),
  workSetup: deviceWorkSetupSchema.optional(),
  heldOnLocalNetwork: z.boolean().optional(),
  deviceId: z.string(),
  /** Its own name, as it joined (`docs/devices.md`). */
  name: z.string(),
  /** The macOS user it runs as, for one that runs as another user on this Mac. */
  user: z.string().optional(),
  onThisMac: z.boolean(),
  reach: computerReachSchema,
  /** It is being updated (`DeviceView.updating`): its words say updating rather than out of reach. */
  updating: z.literal(true).optional(),
  /** What it last said, or null before it said anything since this home started. */
  signIns: computerSignInsSchema.nullable(),
  /** When it last said it, in ms since the epoch. */
  asOf: z.number().optional(),
  /** It was asked and did not answer: its version may not sign in from here. */
  unanswered: z.boolean().optional(),
  /**
   * It speaks the custom API orders (`CUSTOM_API_SIGN_INS_SINCE`). Absent
   * means it does not, so the chip stays disabled.
   */
  customApi: z.boolean().optional(),
  /**
   * It takes Keep going on credits for its own accounts (the contract change
   * `computer-keep-going`). Absent means it does not, so the item stays dim.
   */
  keepGoing: z.boolean().optional(),
  /**
   * It renames, pauses and prefers its own accounts and reads its allowance
   * on request (the contract change `computer-account-settings`). Absent
   * means it does not, so those items stay dim.
   */
  accountSettings: z.boolean().optional(),
  /**
   * It uses its own Codex accounts' saved resets there (the contract change
   * `use-saved-reset`). Absent means it does not, so the item is not offered.
   */
  savedReset: z.boolean().optional(),
  /**
   * It takes Use saved resets on their own for its own Codex accounts (the
   * contract change `auto-saved-resets`). Absent means it does not, so the
   * item stays dim.
   */
  autoSavedResets: z.boolean().optional(),
  /** Active sign-ins and failures awaiting Done; absent on an older home. */
  flows: z.array(deviceSignInFlowSchema).optional(),
});
export type DeviceSignIns = z.infer<typeof deviceSignInsSchema>;

/** A sign-in running on a computer, one step, as the home's window draws it. */
export const deviceSignInEventSchema = z.object({
  signInId: signInIdSchema,
  deviceId: z.string(),
  /** The provider, or for a sign-in where projects live, its host ("github.com"). */
  providerId: z.string(),
  /** The account signing in again, when it is not a new one. */
  accountId: z.string().optional(),
  step: signInStepSchema,
});
export type DeviceSignInEvent = z.infer<typeof deviceSignInEventSchema>;

/**
 * How the home names a computer that runs work in its words about sign-ins
 * (the design skill's `components/devices/SignInOnAMac`): another Mac by its
 * own name, and another macOS user on this Mac by that user.
 */
export function signInPlace(device: {
  name: string;
  user?: string | undefined;
  onThisMac: boolean;
}) {
  const user = device.onThisMac && device.user ? userDisplayName(device.user) : undefined;
  return {
    /** The group's label: "Mac mini", "Running as Builder". */
    label: deviceLabel(device),
    /** After a verb: "Sign in to Codex on Mac mini", "... as Builder". */
    where: user ? `as ${user}` : `on ${device.name}`,
    /** As a subject or an object: "Send to Mac mini", "Builder is signed in to Codex." */
    who: user ?? device.name,
  };
}

/**
 * Whether a sign-in link sends the browser back to the Mac it is opened on
 * (Codex's `localhost:1455`, OpenRouter's own): the flow waits for that
 * return on the computer that runs it, so from another Mac the page the
 * browser ends on cannot be reached, and its address, which carries what the
 * sign-in needs, is what the captain pastes back. Claude's link sends the
 * browser to a page that shows a code instead.
 */
export function returnsToLoopback(
  link: string | undefined,
  flow: "browser-return" | "paste-code" = "browser-return",
): boolean {
  if (!link) return false;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  // Claude’s pasted-code link selection historically excludes only literal HTTP
  // localhost/127.0.0.1 redirect_uri values. Keep that policy distinct from
  // the browser-return flow, which inspects every HTTP(S) return address.
  if (flow === "paste-code") {
    const back = url.searchParams.get("redirect_uri");
    return !!back && /^http:\/\/(?:localhost|127\.0\.0\.1)[:/]/.test(back);
  }
  return [...url.searchParams.values()].some((value) => {
    try {
      const back = new URL(value);
      return (
        (back.protocol === "http:" || back.protocol === "https:") &&
        ["localhost", "127.0.0.1", "[::1]"].includes(back.hostname)
      );
    } catch {
      return false;
    }
  });
}

/**
 * The feed's line when the captain signs a computer that runs work out of
 * one of its own subscriptions (`device_signed_out`): for Claude, what became
 * of that computer's own Claude login, which Firstmate signs out only when it
 * made it there (docs/helper.md, "Its own sign-ins").
 */
export function deviceSignedOutLine(event: {
  who: string;
  provider: string;
  login?: MachineLoginOutcome | undefined;
}): { kind: "info" | "warn"; text: string } {
  const { who, provider } = event;
  switch (event.login) {
    case "signed-out":
      return {
        kind: "info",
        text: `Infinitary signed ${who} out of the ${provider} login it made.`,
      };
    case "kept":
      return {
        kind: "info",
        text: `Infinitary stopped using ${who}'s ${provider} login. It stays, since Infinitary did not make it.`,
      };
    case "not-signed-out":
      return {
        kind: "warn",
        text: `Infinitary stopped using ${who}'s ${provider} login, but could not sign it out.`,
      };
    default:
      return { kind: "info", text: `${who} is signed out of ${provider}.` };
  }
}

/**
 * `signInPlace` for a computer named by its id on the home's list, or the
 * words for one no longer on it, as the home names a computer it cannot
 * find ("The other Mac").
 */
export function devicePlace(
  devices: readonly {
    id: string;
    name: string;
    user?: string | undefined;
    onThisMac?: boolean | undefined;
  }[],
  deviceId: string,
): ReturnType<typeof signInPlace> {
  const device = devices.find((entry) => entry.id === deviceId);
  return device
    ? signInPlace({ name: device.name, user: device.user, onThisMac: device.onThisMac ?? false })
    : {
        label: `The other ${COMPUTER.one}`,
        where: `on the other ${COMPUTER.one}`,
        who: `The other ${COMPUTER.one}`,
      };
}
