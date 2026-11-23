import { z } from "zod";
import { appFollowReportSchema } from "./appFollow";
import { shortCommit } from "./buildIdentity";
import { commandNoticeSchema } from "./commandNotice";
import { COMPUTER, HERE } from "./deviceNames";
import * as m from "./i18n/messages.generated.ts";
import { deviceWorkSetupSchema } from "./workSetup";

/**
 * Devices and pairing (docs/devices.md): what a device is, the link that
 * pairs one, and the grant a device keeps afterwards. The home writes the
 * list (`src/core/devices/pairing.ts`); a device reads a link and dials with
 * its grant (`src/core/devices/dial.ts`). Both read these shapes, so a link
 * one side writes is the link the other parses.
 */

/**
 * What a device is, set at the home and never by the device
 * (docs/devices.md, "The shape"): `mac` is another Mac, which can control
 * this Firstmate while Firstmate is open there and can run work; `work`
 * runs work only - another macOS user on this Mac, or another Mac added
 * before a Mac could do both; `view` only controls - a Mac that joined with
 * a link before then, or a second app on this Mac. A device keeps its kind
 * until it is added again.
 */
export const deviceKindSchema = z.enum(["mac", "work", "view"]);
export type DeviceKind = z.infer<typeof deviceKindSchema>;

/** Whether a device of this kind may control this Firstmate. */
export function deviceControls(kind: DeviceKind): boolean {
  return kind !== "work";
}

/** Whether a device of this kind may run work: a project may be set to run on it. */
export function deviceRunsWork(kind: DeviceKind): boolean {
  return kind !== "view";
}

/**
 * Whether a computer can build Infinitary from its home's source
 * (docs/devices.md, "Matching the home's build"): a Mac, or one that never
 * said its system; never a Linux computer or a Windows PC.
 */
export function buildsSourceThere(system: DeviceSystem | undefined): boolean {
  return system === undefined || system === "macos";
}

/**
 * What one connection of a device does (docs/connection.md, "Hello"): a
 * `view` is Firstmate open on it, controlling this one; `work` is its work,
 * which runs with no window. A Mac that does both holds one of each.
 */
export const deviceRoleSchema = z.enum(["view", "work"]);
export type DeviceRole = z.infer<typeof deviceRoleSchema>;

/** Whether a device of this kind may hold a connection in this role. */
export function deviceMayBe(kind: DeviceKind, role: DeviceRole): boolean {
  return role === "view" ? deviceControls(kind) : deviceRunsWork(kind);
}

/**
 * What system a device runs (docs/devices.md, "What a device is"): the
 * device's own word, said in each hello and kept beside its kind, never a
 * kind of its own. A phone is a view whose system is `ios`. The words a
 * person reads name the device by it (`src/shared/deviceNames.ts`); a
 * device that never said one is a computer.
 */
export const deviceSystemSchema = z.enum(["macos", "linux", "windows", "ios"]);
export type DeviceSystem = z.infer<typeof deviceSystemSchema>;

/** Whether a device is a phone: its system is `ios` (docs/devices.md, "What a device is"). */
export function isPhone(device: { system?: DeviceSystem | undefined }): boolean {
  return device.system === "ios";
}

/**
 * Whether a device of this system may run a home's work (docs/devices.md,
 * "Joining"): a phone never does, so it joins as a device that only
 * controls, whichever link it used. A Mac, a Linux computer and a Windows
 * PC may, and so may a device that never said its system.
 */
export function systemRunsWork(system: DeviceSystem | undefined): boolean {
  return system !== "ios";
}

/**
 * Whether a computer that runs work gets a newer Infinitary only by an
 * install there (docs/devices.md, "Updating"): a Windows PC, which no home
 * sends a build and which has no updater of its own yet. Its home says to
 * install the newer Infinitary on that PC rather than offer Update.
 */
export function installedThere(device: { system?: DeviceSystem | undefined }): boolean {
  return device.system === "windows";
}

/** What a home says of a computer it cannot update, on another version. */
export function installItThereWords(label: string): string {
  return `Infinitary cannot update ${label} from here yet. Install the newer Infinitary on ${label}, and it carries on with the new version.`;
}

/**
 * Whether a device may approve Secrets uses with a key of its own
 * (docs/secrets.md, "Remote decisions"): a phone, or a Mac that may control
 * this Firstmate, which signs with its own Touch ID or password.
 */
export function approvesSecretUses(device: {
  kind: DeviceKind;
  system?: DeviceSystem | undefined;
}): boolean {
  return isPhone(device) || (device.system === "macos" && deviceControls(device.kind));
}

/** The chip a device runs on, as its system names it: Apple silicon and Arm are `arm64`. */
export const deviceChipSchema = z.enum(["arm64", "x64"]);
export type DeviceChip = z.infer<typeof deviceChipSchema>;

/** How long a link stays good after the home makes it. */
export const PAIRING_LINK_TTL_MS = 10 * 60 * 1000;

/**
 * How long the link inside a command for another Mac stays good when that
 * command downloads this computer's version there first (INF-369 N1, the
 * captain's choice: such links last longer from the start). Both the
 * download and the copy from here it falls back to must fit on a slow
 * network, at the 1 MB a second its reserve assumes (`joinCommand`): for
 * today's 401 MB app that is about 6.7 minutes each, and a minute to join,
 * about 14.4 minutes. Thirty minutes leaves the person about 15 minutes to
 * carry the command to that Mac and type yes, more than the 2.3 a ten-minute
 * link left them at that rate, and keeps both fitting, with five minutes to
 * run it, until the app passes about 700 MB. A command that gets Infinitary from here alone keeps
 * `PAIRING_LINK_TTL_MS`.
 */
export const DOWNLOAD_COMMAND_LINK_TTL_MS = 30 * 60 * 1000;

/** The link's scheme and path, as this build writes it; nothing in a browser answers it. */
export const PAIRING_LINK_PREFIX = "infinitary://join?";

/**
 * Every scheme a pasted link may carry: Infinitary's, which this build
 * writes, and Firstmate 3000's, which a computer from before the Infinitary
 * rename wrote and still shows. Both read the same link.
 */
export const PAIRING_LINK_PREFIXES = [PAIRING_LINK_PREFIX, "firstmate3000://join?"] as const;

/**
 * 32 bytes as base64url, unpadded: a link's random code, and a pin (SHA-256
 * of a public key) both have this shape.
 */
export const KEY_TEXT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const keyTextSchema = z.string().regex(KEY_TEXT_PATTERN);

/**
 * A device's own label, such as its computer name: the device's words, so it
 * is bounded and may carry no control or formatting character that could
 * reorder the text drawn around it.
 */
export const deviceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u);

const hostLabel = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST_NAME = new RegExp(`^(?=.{1,253}$)${hostLabel}(?:\\.${hostLabel})*$`, "i");
const IPV6 = /^[0-9a-f:.]{2,45}$/i;

/**
 * Where a device dials, as `host:port`: an IPv4 address, a bracketed IPv6
 * address, or a name the device resolves. It is what a link advertises,
 * which is separate from where the connection listens.
 */
export const dialAddressSchema = z.string().refine((text) => splitDialAddress(text) !== null, {
  message: "Expected host:port",
});

/** A dial address's host and port, or null when it is not one. */
export function splitDialAddress(text: string): { host: string; port: number } | null {
  const match = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d{1,5})$/.exec(text);
  if (!match) return null;
  const [, v6, name, portText] = match;
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  if (v6 !== undefined) return IPV6.test(v6) && v6.includes(":") ? { host: v6, port } : null;
  return name !== undefined && HOST_NAME.test(name) ? { host: name, port } : null;
}

/**
 * How a device reaches its home (docs/devices.md, "Through the home's SSH"):
 * `ssh` when it reaches the home only through the private socket the home's
 * own SSH connection forwards to it, and never at the address its link or
 * grant names. The home decides it when it makes the link; a device whose
 * link or grant says nothing dials that address itself.
 */
export const homeViaSchema = z.literal("ssh");
export type HomeVia = z.infer<typeof homeViaSchema>;

/** Where one dial address sits, for the words a person reads. A name ending in `.local` is this network. */
export function dialNetwork(at: string): "local" | "private" | "name" | "other" {
  const host = splitDialAddress(at)?.host ?? at;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return "private";
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return "local";
  if (/\.local$/i.test(host)) return "name";
  return "other";
}

/** Every address a link names, first to last, with no repeat (docs/devices.md, "The link"). */
export function linkAddresses(link: {
  at: string;
  also?: readonly string[] | undefined;
}): string[] {
  return [...new Set([link.at, ...(link.also ?? [])])];
}

/**
 * A link that dials `host` first, at the port the link names, then each of
 * its own addresses (docs/view.md, "Joining by its address"): the computer
 * its SSH reached, which the link may not name. A link that reaches its home
 * another way, or a host that is no dial address, stays as it is.
 */
export function linkDialingFirst(text: string, host: string | null): string {
  if (!host) return text;
  const link = parsePairingLink(text);
  const port = splitDialAddress(link.at)?.port;
  if (link.via || port === undefined) return text;
  const at = host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
  if (!splitDialAddress(at)) return text;
  const also = linkAddresses(link)
    .filter((each) => each !== at)
    .slice(0, PAIRING_LINK_ALSO_MAX);
  return buildPairingLink({ ...link, at, also });
}

/** Whether a link names a private-network address besides the first, so the confirm question says so. */
export function linkNamesPrivateToo(link: {
  at: string;
  also?: readonly string[] | undefined;
}): boolean {
  return (link.also ?? []).some((at) => dialNetwork(at) === "private");
}

/**
 * The most other addresses a link carries after `at`: every installed reader,
 * on a computer and on the phone, refuses a link with more.
 */
export const PAIRING_LINK_ALSO_MAX = 8;

/** A link's parts (docs/devices.md, "The link"). */
export const pairingLinkSchema = z.strictObject({
  /** The kind the home made the link for. */
  kind: deviceKindSchema,
  /** Where to dial, unless `via` says the device reaches the home another way. */
  at: dialAddressSchema,
  /** The home's pin: SHA-256 of its public key, base64url. */
  key: keyTextSchema,
  /** The one-use code. */
  code: keyTextSchema,
  /** How the device reaches the home; absent, at `at`. */
  via: homeViaSchema.optional(),
  /**
   * The other addresses to try, after `at`, when the first does not answer.
   * One optional part, so a link without it reads as before.
   */
  also: z.array(dialAddressSchema).max(PAIRING_LINK_ALSO_MAX).optional(),
});
export type PairingLink = z.infer<typeof pairingLinkSchema>;

const LINK_PARTS = {
  as: "kind",
  at: "at",
  key: "key",
  code: "code",
  via: "via",
  also: "also",
} as const;

export function buildPairingLink(link: PairingLink): string {
  const parsed = pairingLinkSchema.parse(link);
  const query = new URLSearchParams({
    as: parsed.kind,
    at: parsed.at,
    key: parsed.key,
    code: parsed.code,
    ...(parsed.via ? { via: parsed.via } : {}),
    ...(parsed.also?.length ? { also: parsed.also.join(",") } : {}),
  });
  return `${PAIRING_LINK_PREFIX}${query.toString()}`;
}

/**
 * Reads a link a person pasted. Throws a reason that never repeats the link,
 * because the link carries its code.
 */
export function parsePairingLink(text: string): PairingLink {
  const trimmed = text.trim();
  const prefix = PAIRING_LINK_PREFIXES.find((known) => trimmed.startsWith(known));
  if (!prefix) throw new Error(`This is not a link to join Infinitary on another ${COMPUTER.one}.`);
  const query = new URLSearchParams(trimmed.slice(prefix.length));
  const parts: Record<string, string> = {};
  for (const [name, value] of query) {
    const part = LINK_PARTS[name as keyof typeof LINK_PARTS];
    if (!part || part in parts)
      throw new Error(`This link to join Infinitary on another ${COMPUTER.one} is damaged.`);
    parts[part] = value;
  }
  const parsed = pairingLinkSchema.safeParse({
    ...parts,
    ...(parts.also ? { also: parts.also.split(",").filter((at) => at.length > 0) } : {}),
  });
  if (!parsed.success)
    throw new Error(`This link to join Infinitary on another ${COMPUTER.one} is damaged.`);
  return parsed.data;
}

/**
 * The user a computer joins as, such as `builder` (docs/helper.md): a
 * macOS or Linux short name, or a Windows user name, which may hold a space,
 * such as `Kun Chen`. The device's words, bounded to the characters those
 * names carry, never starting or ending with a space.
 */
export const deviceUserNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_](?:[A-Za-z0-9_.@ -]*[A-Za-z0-9_.@-])?$/);

/** Where the removal of a computer that runs work stands (docs/devices.md, "Remove"). */
export const deviceRemovalStageSchema = z.enum(["when-back", "bringing-work", "cleaning-up"]);
export type DeviceRemovalStage = z.infer<typeof deviceRemovalStageSchema>;

/**
 * One computer, one row (docs/devices.md, "One computer, one entry"): a
 * Mac's window, connected with the key of the entry it holds, asks its home
 * to fold that entry into `into`, the entry its work keeps. `cert` is that
 * entry's certificate (PEM) and `signature` its key's signature (base64url,
 * SHA-256, DER) over `deviceFoldText`, which proves the window's computer
 * holds both keys. The home keeps `into` and answers it.
 */
export const deviceFoldSchema = z.strictObject({
  into: z.string().min(1).max(64),
  cert: z.string().min(1).max(8192),
  signature: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(512),
});
export type DeviceFold = z.infer<typeof deviceFoldSchema>;

/** The feed's one line once a Mac's two entries are one (`inf:devices:fold`). */
export function deviceFoldedLine(device: {
  name: string;
  user?: string;
  onThisMac?: boolean;
}): string {
  return `${deviceLabel(device)} was on your list twice, once for its window and once for its work. It has one row now, the one that runs its work.`;
}

/** What a fold's signature covers: the home's pin, the entry that goes and the one kept. */
export function deviceFoldText(homePin: string, from: string, into: string): string {
  return `infinitary-fold\n${homePin}\n${from}\n${into}`;
}

/**
 * Remove for a computer that runs work out of reach: `when-back` removes it
 * the next time it is in reach, once its work is here; `now` removes it at
 * once and leaves its unmerged work there.
 */
export const deviceRemoveWhenSchema = z.enum(["when-back", "now"]);
export type DeviceRemoveWhen = z.infer<typeof deviceRemoveWhenSchema>;

/**
 * What a computer that runs work has when it joins (docs/helper.md,
 * "Joining"): git and Claude Code, as it looked for them. The home's feed
 * line names them; it is the device's own word, and decides nothing.
 */
export const foundToolsSchema = z.strictObject({
  git: z.boolean(),
  claudeCode: z.boolean(),
});
export type FoundTools = z.infer<typeof foundToolsSchema>;

/**
 * How this Mac brings a computer that runs work to its own version of
 * Firstmate (docs/devices.md, "Updating"): over Remote Login for one added
 * by its address, over the connection for one that takes the update order
 * (`takesUpdate`, src/shared/contractFeatures.ts), or by a new command run there for one
 * too old to take it.
 */
export const deviceUpdateBySchema = z.enum(["remote-login", "connection", "command"]);
export type DeviceUpdateBy = z.infer<typeof deviceUpdateBySchema>;

/**
 * A computer that runs work, connected now, on another version of Firstmate
 * than this Mac's (docs/devices.md, "Another version"): the version it said
 * it runs, when it said one; whether that is older or newer than this Mac's,
 * when both read as versions; whether it still takes new work; and how this
 * Mac brings it to its own version. `downloads`, updated over the
 * connection: a Mac elsewhere that keeps its own copy and takes the
 * download order (`takesDownload`), so it downloads this Mac's published
 * version itself first, with this Mac's own copy as the fallback.
 */
export const deviceOtherVersionSchema = z.strictObject({
  app: z.string().min(1).max(64).optional(),
  than: z.enum(["older", "newer"]).optional(),
  takesWork: z.boolean(),
  updateBy: deviceUpdateBySchema,
  downloads: z.literal(true).optional(),
  /**
   * This computer runs source at a commit, and Match builds that commit there
   * (docs/devices.md, "Matching the home's build"); absent when Match brings
   * it to this computer's installed version.
   */
  source: z.strictObject({ commit: z.string().regex(/^[a-f0-9]{40,64}$/) }).optional(),
});
export type DeviceOtherVersion = z.infer<typeof deviceOtherVersionSchema>;

/**
 * The Infinitary app open on a device now, as its connection's hello said it
 * (docs/devices.md, "Each copy's version"): the version it runs, absent when
 * the app is too old to say one; for a computer, `than` when that version is
 * older or newer than this computer's and `same` when it is this computer's.
 * A phone's app has versions of its own, so its version is never compared.
 */
export const deviceAppVersionSchema = z.strictObject({
  app: z.string().min(1).max(64).optional(),
  than: z.enum(["older", "newer"]).optional(),
  same: z.literal(true).optional(),
  /**
   * Where that app stands in catching up with this computer's version, as
   * it last told it (docs/view.md, "Following the home's version";
   * `app-follows-home`): absent while it said nothing for this version.
   */
  follow: appFollowReportSchema.optional(),
});
export type DeviceAppVersion = z.infer<typeof deviceAppVersionSchema>;

/**
 * Whether the app open on a device is behind this computer's: older, or too
 * old to say its version. A phone's never is, since its versions are its own.
 */
export function appBehind(
  device: { system?: DeviceSystem | undefined },
  version: DeviceAppVersion,
): boolean {
  return !isPhone(device) && (version.than === "older" || version.app === undefined);
}

/**
 * Whether Settings -> Devices offers Update for the app open on a device
 * (docs/devices.md, "Updating the app open there"): it is behind this
 * computer's, it told this computer it follows its version, and it is not
 * already starting again or unable to install it by itself.
 */
export function appUpdateOffered(
  device: { system?: DeviceSystem | undefined },
  version: DeviceAppVersion,
): boolean {
  const step = version.follow?.step;
  return (
    appBehind(device, version) && step !== undefined && step !== "cannot" && step !== "restarting"
  );
}

/**
 * Why this Mac stopped trying its SSH connection to a computer until the
 * captain's Try again: something only a person can mend.
 *
 * - `host-unknown`: this Mac has not checked that address, and the check could not be asked.
 * - `host-changed`: it answers unlike the Mac this Mac reached before.
 * - `key-refused`: it did not accept the captain's SSH key.
 * - `key-locked`: it accepted the key, but it is locked with a passphrase, or its app did not answer.
 * - `agent-declined`: it accepted the key, but the app that holds it did not approve signing in.
 * - `agent-not-running`: the app that holds the key is not open, so nothing answered for it.
 * - `forwarding-refused`: its Remote Login does not let the connection through.
 * - `not-set-up`: Firstmate is not set up there any more.
 * - `other-home`: the address reaches a Mac whose Firstmate runs work for
 *   another home, or as another computer: it no longer runs work as this
 *   one, so it is removed here. Nothing there is touched.
 */
export const sshStopReasonSchema = z.enum([
  "host-unknown",
  "host-changed",
  "key-refused",
  "key-locked",
  "agent-declined",
  "agent-not-running",
  "forwarding-refused",
  "not-set-up",
  "other-home",
]);
export type SshStopReason = z.infer<typeof sshStopReasonSchema>;

/**
 * Where this Mac's SSH connection to a computer stands, as Settings ->
 * Devices says it (design skill `components/devices/DevicesTab`, "Reached
 * over your SSH"):
 *
 * - `connected`: the connection is up and the computer's work said hello
 *   through it. Never before that welcome.
 * - `connecting`: the first attempt since this Mac started, the attempt
 *   right after an operation held the connection or its work's folder moved
 *   (until one fails), or the connection is up and the work there has not
 *   said hello yet, including after a connected work stopped answering. It
 *   reads reconnecting once five minutes have passed since it began
 *   (`CONNECTING_MS`). Devices says "connecting" for it, not "out of reach"
 *   (`deviceConnecting`).
 * - `reconnecting`: it dropped or could not be made, and this Mac tries
 *   again on its own.
 * - `at-login`: the connection is up, and nobody is logged in there as the
 *   user it runs work as, so the work starts when they log in.
 * - `not-started`: the connection is up, and that user's session there
 *   holds no background work, which no login mends.
 * - `stopped`: this Mac stopped trying until Try again, with why.
 */
/** Automatic startup capability is independent of whether the worker is reachable. */
export const automaticStartupSchema = z.enum([
  "available",
  "at-login",
  "failed",
  "unavailable",
  "unknown",
]);
export type AutomaticStartup = z.infer<typeof automaticStartupSchema>;

export const deviceSshSchema = z.strictObject({
  state: z.enum(["connected", "connecting", "reconnecting", "at-login", "not-started", "stopped"]),
  reason: sshStopReasonSchema.optional(),
  automaticStartup: automaticStartupSchema.optional(),
});
export type DeviceSsh = z.infer<typeof deviceSshSchema>;

/**
 * A computer's reach, worked out once from the facts the home already holds
 * (`inReach`, and the SSH state `SshConnections.state` reads, whose connecting
 * limit is that read). Every reader takes this value, including published task places, sign-ins and placement explanations.
 *
 * - `in-reach`: its work said hello, so it takes work.
 * - `connecting`: out of reach only because its connection is being made.
 * - `reconnecting`: it dropped or a try failed, and this Mac tries again.
 *   A computer never seen still says "connecting using SSH…" on its line
 *   (design skill `components/devices/DevicesTab`, "Reached over your SSH").
 * - `out-of-reach`: stopped, not started, waiting for a login, or not reached over SSH.
 */
export const computerReachSchema = z.enum([
  "in-reach",
  "connecting",
  "reconnecting",
  "out-of-reach",
]);
export type ComputerReach = z.infer<typeof computerReachSchema>;

/** The one reach value. A reader injects `reachOf(deviceId)`, which calls this. */
export function reachFrom(device: {
  inReach?: boolean | undefined;
  ssh?: Pick<DeviceSsh, "state"> | undefined;
}): ComputerReach {
  if (device.inReach) return "in-reach";
  switch (device.ssh?.state) {
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    default:
      return "out-of-reach";
  }
}

/**
 * Whether a computer is out of reach only because its connection is being
 * made, such as one just updated: every surface that names a computer out of
 * reach says "connecting" for it instead. One whose connection stopped, failed
 * or dropped is out of reach. The published flag, read from `reachFrom`.
 */
export function deviceConnecting(device: {
  inReach?: boolean | undefined;
  ssh?: Pick<DeviceSsh, "state"> | undefined;
}): boolean {
  return reachFrom(device) === "connecting";
}

/**
 * What a computer not in reach reads as, the one home of its three words:
 * updating while the home follows its update (`updating`,
 * `computer-updating.md`), connecting while its connection is being made
 * (`deviceConnecting`), out of reach otherwise.
 */
export function awayWord(connecting: boolean | undefined, updating?: boolean | undefined): string {
  if (updating) return m.devicesAwayUpdating();
  return connecting ? "connecting" : "out of reach";
}

/**
 * How long after Infinitary starts on the home a computer that runs work,
 * not heard from since, reads connecting rather than out of reach: each one
 * dials the home again every few seconds (docs/devices.md, "Updating").
 */
export const STARTUP_CONNECTING_MS = 60_000;

/**
 * The reach a reader takes in the first minute after the home started
 * (`STARTUP_CONNECTING_MS`): out of reach reads connecting for a computer
 * not heard from since that start, so an update round that restarts the
 * home never flashes out of reach. Every other reading is kept.
 */
export function reachAfterStart(
  reach: ComputerReach,
  { startedAt, now, seenAt }: { startedAt: number; now: number; seenAt: number | undefined },
): ComputerReach {
  if (reach !== "out-of-reach" || now - startedAt >= STARTUP_CONNECTING_MS) return reach;
  return seenAt !== undefined && seenAt >= startedAt ? reach : "connecting";
}

/** One device on the home's list, as every reader sees it: never its secret. */
export const deviceViewSchema = z.strictObject({
  id: z.string().min(1).max(64),
  kind: deviceKindSchema,
  name: deviceNameSchema,
  /** When it joined, in milliseconds since the epoch. */
  pairedAt: z.number().int().nonnegative(),
  /**
   * The macOS user a computer that runs work runs as, as it said when it
   * joined; absent for a view.
   */
  user: deviceUserNameSchema.optional(),
  automaticStartup: automaticStartupSchema.optional(),
  /**
   * Whether it joined from this Mac itself - another macOS user here, or a
   * second app on this Mac - as the home saw where it dialed from. Absent on
   * a device that joined before the home recorded it.
   */
  onThisMac: z.boolean().optional(),
  /**
   * The address its person added it at over Remote Login, such as
   * `sam@mini.local` (docs/devices.md, "Adding a computer by its address"): the
   * home updates Firstmate there, and removes what it set up there, the same
   * way. Absent on a device added by a link or a command.
   */
  remoteLogin: z.string().min(1).max(255).optional(),
  /** A verified address used only for an Ubuntu package update, not for pairing. */
  packageUpdateAt: z.string().min(1).max(255).optional(),
  /**
   * The system it runs and its chip, as its last hello said them
   * (docs/devices.md, "What a device is"); absent on a device that has not
   * said them since the home began keeping them.
   */
  system: deviceSystemSchema.optional(),
  chip: deviceChipSchema.optional(),
  // What the home reads of each device right now, for Settings -> Devices
  // (docs/devices.md, "Your devices"); never saved in the list.
  /** It is in reach: a computer that runs work takes work, a Mac that controls this Firstmate is connected. */
  inReach: z.boolean().optional(),
  /**
   * Connected now on another version of Firstmate than this Mac's, whether
   * or not it takes work; absent while it runs this Mac's version, and while
   * it is out of reach, when the home cannot tell.
   */
  otherVersion: deviceOtherVersionSchema.optional(),
  /**
   * The version of Infinitary its work runs, while connected on this
   * computer's version; one on another version says it in `otherVersion`.
   */
  workVersion: z.string().min(1).max(64).optional(),
  /**
   * The Infinitary app open on it now, while it controls this computer:
   * its version, and how it compares with this computer's. Absent while no
   * app is open there, when this computer cannot tell.
   */
  appVersion: deviceAppVersionSchema.optional(),
  /** When it was last in reach, in milliseconds since the epoch. */
  seenAt: z.number().int().nonnegative().optional(),
  /**
   * When the connection the row calls connected began, in milliseconds
   * since the epoch. Absent while it is not connected. A "could not reach"
   * line goes when this is newer than the line (protocol 8.17).
   */
  connectedAt: z.number().int().nonnegative().optional(),
  /** Firstmate is open on it, controlling this Firstmate now. */
  controlling: z.boolean().optional(),
  /** Another user on this Mac, out of reach since this Mac restarted: nobody has logged in as it since. */
  restartedSince: z.boolean().optional(),
  /**
   * The home follows its update now (docs/devices.md, "Updating"): from its
   * crew's pause until the update ends, while it was heard from in the last
   * `UPDATE_RETURN_MS`. Every place that names it says updating rather than
   * out of reach. A view that does not list `computer-updating` is sent the
   * list without it.
   */
  updating: z.literal(true).optional(),
  /**
   * Out of reach, and this Mac's address changed since it was last in
   * reach: it still looks for this Mac where it found it then, until it
   * hears where this Mac is now (docs/devices.md, "Finding the home again").
   */
  addressChanged: z.boolean().optional(),
  /**
   * Out of reach, never in reach since it joined from another Mac, and it
   * dials this Mac itself on the local network, where macOS there holds its
   * work's dial until someone at that Mac allows it; adding it by its
   * address reaches it over this Mac's own SSH instead (docs/devices.md,
   * "Held on the local network").
   */
  heldOnLocalNetwork: z.boolean().optional(),
  /**
   * Where it last reached this computer, from what pairing keeps: on this
   * network, or on the private network. Absent when it has not, or it
   * reached this computer itself.
   */
  reachedOn: z.enum(["local", "private"]).optional(),
  /** How many tasks run there now. */
  tasks: z.number().int().nonnegative().optional(),
  /** The projects whose Runs on names it. */
  runs: z.array(z.string()).optional(),
  /**
   * Where this Mac's own SSH connection to it stands, for a computer added
   * by its address (docs/devices.md, "Through the home's SSH"); absent for
   * every other device, and while this Mac keeps no such connection.
   */
  ssh: deviceSshSchema.optional(),
  /**
   * Where its removal stands: waiting until it is back, bringing its
   * unmerged work here, then taking it off the list so it removes what
   * Firstmate set up there.
   */
  removal: deviceRemovalStageSchema.optional(),
  /**
   * A computer that runs work, joined again under a new key (docs/devices.md,
   * "Joined again"): the ids of earlier entries that run work, are out of
   * reach, have its name and user, joined before it, and still hold tasks
   * or projects. A fact the home states; only the captain's click acts on it.
   */
  earlier: z.array(z.string().min(1).max(64)).max(16).optional(),
  /**
   * Out of reach with started tasks that can move: how many the home can
   * carry on to another computer (`inf:devices:carry-on`). An independent
   * review follows its builder, so it is not counted; Remove now stops it.
   * Absent from a home without that change.
   */
  carriesOn: z.number().int().positive().optional(),
  /**
   * Its tasks are being carried on to this computer, by id
   * (`RUNS_ON_THIS_MAC` for the home), until it is removed.
   */
  carrying: z.string().min(1).max(64).optional(),
  /**
   * A Mac whose window is connected while its work is not in reach: whether
   * its work is being set up, or why it is not running or has not reached
   * this computer (`work-setup`, docs/devices.md, "A Mac that has not
   * finished setting up"). Absent otherwise, and for a Mac whose window has
   * not said.
   */
  workSetup: deviceWorkSetupSchema.optional(),
});
export type DeviceView = z.infer<typeof deviceViewSchema>;

/**
 * What Carry its tasks on answered (docs/devices.md, "Joined again"): how
 * many started tasks began moving, and one line for each that stayed, with
 * why. With none staying, the earlier entry is removed once they have moved.
 */
export const deviceCarryOnSchema = z.strictObject({
  moving: z.number().int().nonnegative(),
  stayed: z.array(z.string().min(1).max(2_000)).max(500),
});
export type DeviceCarryOn = z.infer<typeof deviceCarryOnSchema>;

/** Public scene facts only: no addresses, sign-ins, setup or removal authority. */
export const computerPresenceSchema = deviceViewSchema.pick({
  id: true,
  name: true,
  inReach: true,
});
export type ComputerPresence = z.infer<typeof computerPresenceSchema>;
export function computerPresenceOf(devices: readonly DeviceView[]): ComputerPresence[] {
  return devices
    .filter((device) => deviceRunsWork(device.kind))
    .map(({ id, name, inReach }) => ({ id, name, inReach }));
}

/**
 * Who a command is for (docs/devices.md, "Joining by a command"): another
 * Mac, which gets Firstmate from this one and joins as a Mac, or another
 * macOS user on this Mac, which runs this Mac's own app and only runs work.
 */
export const deviceCommandForSchema = z.enum(["another-mac", "another-user"]);
export type DeviceCommandFor = z.infer<typeof deviceCommandForSchema>;

/**
 * What the home is asked for when it makes a link (docs/devices.md, "The
 * link"): `mac` adds another Mac, by a link, a command or its address;
 * `work` another macOS user on this Mac, by its command. The home makes no
 * new link for a `view`, which only controls, and refuses one.
 */
export const deviceInviteRequestSchema = z.strictObject({
  kind: deviceKindSchema,
  /** A phone link prefers detected private-network addresses, retaining local fallbacks. */
  phone: z.literal(true).optional(),
  /**
   * Where the link tells the device to dial; when absent, the private
   * address in use, or loopback for another user on this Mac or a Mac with none.
   */
  at: dialAddressSchema.optional(),
  /**
   * Wrap the link in the command for one: `another-mac` for kind `mac`,
   * `another-user` for kind `work`, which only a command adds.
   */
  command: deviceCommandForSchema.optional(),
});
export type DeviceInviteRequest = z.infer<typeof deviceInviteRequestSchema>;

/** A link the home made, for the window that asked: this Mac's own, or a computer that controls it. */
export const deviceInviteSchema = z.strictObject({
  /** The link's own handle, which Stop it names; not a secret, and not the link. */
  id: z.string().min(1).max(64),
  link: z.string().startsWith(PAIRING_LINK_PREFIX),
  kind: deviceKindSchema,
  expiresAt: z.number().int().nonnegative(),
  /**
   * The command that carries the link, when one was asked for: as secret as
   * the link. Its length is bounded by the longest word Linux lets a program
   * take (MAX_ARG_STRLEN, 128 KiB), so each word of a command within it can run.
   */
  command: z
    .strictObject({ for: deviceCommandForSchema, text: z.string().min(1).max(131_072) })
    .optional(),
});
export type DeviceInvite = z.infer<typeof deviceInviteSchema>;

/**
 * The kind of network one of this Mac's own private addresses is on:
 * `local` for the network it shares with nearby devices, `private` for the
 * shared range a private network service hands out (docs/devices.md,
 * "Where devices find this Mac").
 */
export const deviceAddressNetworkSchema = z.enum(["local", "private"]);
export type DeviceAddressNetwork = z.infer<typeof deviceAddressNetworkSchema>;

/**
 * A Linux home's own firewall that may keep its devices out (docs/devices.md,
 * "A home's firewall"): `ufw`, `firewalld`, or NixOS's own `nixos`,
 * with the port a device dials, which it may not let through.
 */
export const deviceFirewallSchema = z.strictObject({
  name: z.enum(["ufw", "firewalld", "nixos"]),
  port: z.number().int().min(1).max(65_535),
});
export type DeviceFirewall = z.infer<typeof deviceFirewallSchema>;

/**
 * A Windows home's own firewall, Windows Defender Firewall, where it may
 * keep its devices out (docs/devices.md, "A home's firewall"): the port a
 * device dials, this app's program, which a rule names, and the network
 * profiles - `domain`, `private` or `public` - that keep it out now.
 * `blockRule`: a rule blocks this app, as Windows writes when its own
 * question was dismissed, so an allowing rule alone does not let devices in.
 * `blockAll`: that profile blocks every incoming connection, allowed or not.
 */
export const windowsFirewallSchema = z.strictObject({
  name: z.literal("windows"),
  port: z.number().int().min(1).max(65_535),
  program: z.string().min(1).max(1024),
  profiles: z
    .array(z.enum(["domain", "private", "public"]))
    .min(1)
    .max(3),
  blockRule: z.boolean(),
  blockAll: z.boolean(),
});
export type WindowsFirewall = z.infer<typeof windowsFirewallSchema>;

/** A home's own firewall that may keep its devices out: a Linux home's, or a Windows home's. */
export type HomeFirewall = DeviceFirewall | WindowsFirewall;

/** A word PowerShell reads as it is: single-quoted, each single quote doubled. */
function powerShellWord(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * The one PowerShell line an administrator runs on a Windows home to let
 * its devices in: lets every incoming connection through where the profile
 * blocks them all, takes away the rules that block this app, and lets this
 * app take connections at its port on the profiles that keep them out.
 */
export function windowsFirewallWay(firewall: WindowsFirewall): string {
  const program = powerShellWord(firewall.program);
  const profiles = firewall.profiles
    .map((profile) => profile[0]?.toUpperCase() + profile.slice(1))
    .join(",");
  return [
    ...(firewall.blockAll
      ? [`Set-NetFirewallProfile -Profile ${profiles} -AllowInboundRules True`]
      : []),
    ...(firewall.blockRule
      ? [
          `Get-NetFirewallApplicationFilter -Program ${program} | Get-NetFirewallRule | Where-Object Action -eq Block | Remove-NetFirewallRule`,
        ]
      : []),
    `New-NetFirewallRule -DisplayName 'Infinitary' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${firewall.port} -Program ${program} -Profile ${profiles}`,
  ].join("; ");
}

/**
 * What Settings -> Devices says of a home's firewall (design skill
 * `components/devices/DevicesTab`, "A home's firewall"): two lines,
 * and the way to let devices in, in mono.
 */
export function firewallWords(firewall: HomeFirewall): { lines: [string, string]; way: string } {
  const { port } = firewall;
  const run = "To let them in, run this once in a terminal:";
  switch (firewall.name) {
    case "windows":
      return {
        lines: [
          `The firewall on ${HERE.this} may keep your other ${COMPUTER.many} out.`,
          m.settingsDevicesWindowsFirewallWay(),
        ],
        way: windowsFirewallWay(firewall),
      };
    case "ufw":
      return {
        lines: [`The firewall on ${HERE.this} may keep your other ${COMPUTER.many} out.`, run],
        way: `sudo ufw allow ${port}/tcp`,
      };
    case "firewalld":
      return {
        lines: [`The firewall on ${HERE.this} may keep your other ${COMPUTER.many} out.`, run],
        way: `sudo firewall-cmd --permanent --add-port=${port}/tcp && sudo firewall-cmd --reload`,
      };
    case "nixos":
      return {
        lines: [
          `The firewall on ${HERE.this} may keep your other ${COMPUTER.many} out.`,
          "To let them in, add this to your NixOS configuration and rebuild it:",
        ],
        way: `networking.firewall.allowedTCPPorts = [ ${port} ];`,
      };
  }
}

/**
 * Where devices find this Mac: its own private addresses right now, bridges
 * left out. `chosen` stays null: a saved choice is read no more, and the
 * field remains so an older client still reads the answer. `current` is the
 * first address. `name` is this computer's name on the local network, when
 * it has one. `firewall`, on a Linux home, is its firewall that may keep
 * devices out; absent when none is known to.
 */
export const deviceAddressesSchema = z.strictObject({
  addresses: z.array(
    z.strictObject({ address: z.string().min(1).max(64), network: deviceAddressNetworkSchema }),
  ),
  chosen: z.string().min(1).max(64).nullable(),
  current: z.string().min(1).max(64).nullable(),
  /** This computer's name on the local network, such as `kuns-macbook-pro.local`, when it has one. */
  name: z.string().min(1).max(253).optional(),
  firewall: deviceFirewallSchema.optional(),
  /** On a Windows home, its firewall that may keep devices out; absent when none is known to. */
  windowsFirewall: windowsFirewallSchema.optional(),
  /**
   * False on a home that cannot set a computer up by its address (a Windows
   * PC): + A computer offers the link and the command instead of the address
   * form. Absent where it can.
   */
  addsByAddress: z.literal(false).optional(),
});
export type DeviceAddresses = z.infer<typeof deviceAddressesSchema>;

/**
 * What a device keeps after joining, private to itself (0600 in its own data
 * folder): where it dials, the home's pin, who it is on the home's list, and
 * its own key and certificate, which prove it in TLS. The key never leaves
 * the device. Its mode is `via`: a grant that reaches its home only through
 * the home's SSH connection never dials `at` (docs/helper.md, "Through the
 * home's SSH").
 */
export const deviceGrantSchema = z.strictObject({
  /** The address that answered last, dialed first. */
  at: dialAddressSchema,
  /**
   * The home's other addresses, tried after `at` (docs/devices.md, "Finding
   * the home again"): the link's other addresses, then each welcome's list,
   * as many as a link carries. Absent on one that reaches its home only
   * through the home's SSH. Never saved in the grant's own file, which an
   * older version must still read: `JoinedHome` keeps them beside it.
   */
  also: z.array(dialAddressSchema).max(PAIRING_LINK_ALSO_MAX).optional(),
  /** The home's pin. */
  homeKey: keyTextSchema,
  deviceId: z.string().min(1).max(64),
  kind: deviceKindSchema,
  /** The device's own private key, PKCS#8 PEM. */
  key: z.string().min(1).max(8192),
  /** The device's own self-signed certificate, PEM. */
  cert: z.string().min(1).max(8192),
  /** How it reaches its home; absent, at `at`. */
  via: homeViaSchema.optional(),
  /**
   * For a computer that runs work: whether it runs on its home's own Mac, as
   * the home found where it joined from (`onThisMac` on the home's list) and
   * says in each welcome (docs/helper.md, "In the background"). Absent until
   * the home has said it.
   */
  onHomeMac: z.boolean().optional(),
});
export type DeviceGrant = z.infer<typeof deviceGrantSchema>;

/**
 * Where a grant dials once its home answered at `answered` and offered
 * `offered` in its welcome (docs/devices.md, "Finding the home again"): the
 * address that answered first, then every address the home offers now, as
 * many as a link carries. A welcome that offers none, as an older home's,
 * keeps the addresses the grant had. Null when nothing changed, and for a
 * grant that reaches its home only through the home's SSH, which never
 * dials an address.
 */
export function grantRoutes(
  grant: Pick<DeviceGrant, "at" | "also" | "via">,
  answered: string,
  offered: readonly string[] | undefined,
): { at: string; also: string[] } | null {
  if (grant.via === "ssh") return null;
  const others = offered?.length ? offered : [grant.at, ...(grant.also ?? [])];
  const also = linkAddresses({ at: answered, also: others }).slice(1, 1 + PAIRING_LINK_ALSO_MAX);
  const same =
    answered === grant.at &&
    also.length === (grant.also ?? []).length &&
    also.every((at, index) => grant.also?.[index] === at);
  return same ? null : { at: answered, also };
}

/**
 * Why this Mac stopped controlling another (docs/view.md): its person chose
 * Leave here, or that Mac removed this one from its devices.
 */
export const leftReasonSchema = z.enum(["left", "removed"]);
export type LeftReason = z.infer<typeof leftReasonSchema>;

/**
 * Whether this Mac hears the Mac it controls right now (docs/view.md):
 * `reaching` before it has heard anything since it started, `in-reach`
 * while it does, `lost` once contact is gone, and `closed` when Firstmate
 * quit there.
 */
export const viewContactSchema = z.enum(["reaching", "in-reach", "lost", "closed"]);
export type ViewContact = z.infer<typeof viewContactSchema>;

/**
 * What this app is on the Mac it runs on (docs/view.md). `home` holds
 * Firstmate and its record itself; `left` is the Mac it last stopped
 * controlling, said once on its first launch. `view` controls Firstmate on
 * another Mac and keeps no record: `name` is that Mac's own name (its
 * address until it has said it), `heardAt` the last moment this Mac heard
 * from it, `readOnly` set when the two Firstmates are too far apart to make
 * changes, `caughtUp` counts the times this Mac had to read everything
 * again after a gap, which the window follows, and `runsWork` says this Mac
 * also runs that Mac's work, so leaving it stops that too.
 */
/**
 * What Take over is based on (docs/devices.md, "Taking over"): when this
 * Mac's copy is from, whether the first mate's computer said goodbye before
 * it slept or quit, every other copy as that computer last said it with
 * whether it may be newer, and the work's answer once asked. `ready` is
 * false when that computer never told this Mac what taking over needs.
 */
export const takeOverOfferSchema = z.strictObject({
  copyAt: z.number().int().nonnegative(),
  goodbye: z.enum(["sleep", "quit"]).nullable(),
  copies: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(64),
        copyAt: z.number().int().nonnegative().nullable(),
        newer: z.boolean(),
      }),
    )
    .max(64),
  ready: z.boolean(),
  asked: z
    .strictObject({
      state: z.enum(["running", "started", "refused"]),
      text: z.string().min(1).max(600),
    })
    .nullable(),
});
export type TakeOverOffer = z.infer<typeof takeOverOfferSchema>;

/** The most lines a stepped-down home lists of what never reached the copy that took over. */
export const STEPPED_DOWN_LINES = 20;

/**
 * An old home that stepped down because a computer that kept a copy took
 * over (docs/devices.md, "An old home that returns"): the new home's name,
 * when this Mac stepped down, when that copy was from, and the newest task
 * feed lines saved here after it, which never reached it.
 */
export const steppedDownSchema = z.strictObject({
  from: z.string().min(1).max(160),
  at: z.number().int().nonnegative(),
  since: z.number().int().nonnegative().nullable(),
  lines: z
    .array(
      z.strictObject({
        task: z.string().max(160),
        at: z.number().int().nonnegative(),
        text: z.string().max(300),
      }),
    )
    .max(STEPPED_DOWN_LINES),
});
export type SteppedDown = z.infer<typeof steppedDownSchema>;

export const thisMacSchema = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("home"),
    left: z
      .strictObject({
        name: z.string().min(1).max(128),
        reason: leftReasonSchema,
        at: z.number().int().nonnegative(),
      })
      .nullable(),
    /**
     * The times the window here read everything again after a gap in what
     * its first mate told it over the local door; absent until the first.
     */
    caughtUp: z.number().int().positive().optional(),
    /**
     * The times the window's link to its first mate over the local door came
     * back after a drop, replayed or not; absent until the first. The window
     * asks its one-time reads again on each.
     */
    linkBack: z.number().int().positive().optional(),
    /**
     * The window was opened beside Infinitary started by a command, which no
     * longer runs (`./commandNotice.ts`): absent while it runs, and in a
     * window whose own program runs the first mate.
     */
    command: commandNoticeSchema.optional(),
    /**
     * The window stands beside Infinitary started by a command, which runs
     * the first mate in a program of its own (docs/run.md, "Quit and Stop"):
     * quitting closes only the window, and Settings → General offers Stop.
     */
    byCommand: z.literal(true).optional(),
  }),
  z.strictObject({
    role: z.literal("view"),
    name: z.string().min(1).max(128),
    address: z.string().min(1).max(256),
    joinedAt: z.number().int().nonnegative(),
    contact: viewContactSchema,
    readOnly: z.enum(["newer-there", "older-there"]).nullable(),
    /**
     * While `readOnly`, the first mate there still hears this Mac's
     * plain-text messages (the `messages-while-reading` contract change), so
     * the message box stays on (docs/view.md, "Two versions apart").
     */
    messagesWhileReading: z.literal(true).optional(),
    /**
     * The first mate there answers its own update's requests
     * (`inf:home-update:*`, the `home-update` contract change), so Settings
     * → General offers its Update row (docs/view.md, "Updating the first
     * mate's computer").
     */
    homeUpdates: z.literal(true).optional(),
    heardAt: z.number().int().nonnegative().nullable(),
    caughtUp: z.number().int().nonnegative(),
    /**
     * The times this Mac's link to the first mate there came back after a
     * drop, replayed or not; absent until the first. The window asks its
     * one-time reads again on each.
     */
    linkBack: z.number().int().positive().optional(),
    /**
     * The pushes this Mac missed are still arriving from a welcome that
     * replays them, so the window says it is catching up until they are in
     * (docs/view.md, "Live, catching up or out of reach").
     */
    replaying: z.literal(true).optional(),
    runsWork: z.boolean().optional(),
    /**
     * The first mate there is too old to answer what every view now asks
     * (the `every-view-asks` contract change), so its settings and sign-ins
     * wait for an update there (docs/view.md, "A first mate on an older version").
     */
    needsUpdateThere: z.literal(true).optional(),
    /**
     * The first mate there is too old to show a task's browser here (the
     * `browser-from-any-view` contract change), so its view says to update
     * Infinitary there (docs/view.md, "A task's browser on a view").
     */
    browserNeedsUpdateThere: z.literal(true).optional(),
    /**
     * The first mate there cannot take a sign-in's return from this computer
     * (the `sign-in-return` contract change), so a sign-in whose page comes
     * back to that computer waits for an update there (docs/view.md, "A
     * sign-in that returns to the first mate's computer").
     */
    returnsNeedUpdateThere: z.literal(true).optional(),
    /**
     * A sign-in there waits for its page's return from this computer, by the
     * return's id: `caught` while this computer listens for the browser, and
     * false when it could not, so Settings asks for the address instead.
     */
    signInReturn: z.strictObject({ id: z.string().min(1).max(64), caught: z.boolean() }).optional(),
    /**
     * The first mate there does not answer a view its computers, phones
     * and Knowledge (the `devices-from-a-view` contract change), so Devices
     * waits for an update there (docs/view.md, "A first mate on an older version").
     */
    devicesNeedUpdateThere: z.literal(true).optional(),
    /**
     * This Mac keeps a copy of the first mate's record and the first mate
     * is out of reach: Take over, with what it is based on (docs/devices.md,
     * "Taking over"). Absent while that Mac is in reach, or this Mac keeps
     * no whole copy.
     */
    takeOver: takeOverOfferSchema.optional(),
    /**
     * This Mac's own work half is not running, or has not reached the first
     * mate's computer, and why (docs/view.md, "A Mac that runs work"): the
     * window's notice says so with Try again. Absent while it runs and is
     * in reach, or is still being set up.
     */
    workSetup: deviceWorkSetupSchema.optional(),
    /**
     * A second first mate answered with the same home number but another
     * takeover (docs/devices.md, "Two homes with one number"): this Mac
     * refused it and stays with the one it knew; its name when it said one.
     */
    twoHomes: z.strictObject({ name: z.string().max(200).nullable() }).optional(),
    /**
     * This Mac was the first mate's home until a computer that kept a copy
     * took over (docs/devices.md, "An old home that returns"): what it saved
     * after that copy, which never reached it. Absent otherwise.
     */
    steppedDown: steppedDownSchema.optional(),
    /**
     * The first mate's computer removed the entry this window held while this
     * Mac's work still runs for it as another, so the window carries on as
     * that one (docs/view.md, "A Mac that runs work"): when it did. Absent
     * otherwise.
     */
    carriedOn: z.strictObject({ at: z.number().int().nonnegative() }).optional(),
  }),
]);
export type ThisMac = z.infer<typeof thisMacSchema>;

/**
 * How joining another Mac with a pasted link went (docs/view.md). A refusal
 * names what happened, never the link: `not-a-link` text that is not one,
 * `kind` a link made for another user on that Mac, `used`, `expired` and
 * `unknown` (no open link has that code) as the other Mac answered,
 * `unreachable` nothing answered at its address, `not-that-mac` something
 * answered there that is not the Mac that made the link, and `other` any
 * other failure.
 */
export const joinOutcomeSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    refused: z.enum([
      "not-a-link",
      "kind",
      "used",
      "expired",
      "unknown",
      "unreachable",
      "not-that-mac",
      "other",
    ]),
  }),
]);
export type JoinOutcome = z.infer<typeof joinOutcomeSchema>;

/** A macOS user's short name as the design names it: "Builder" for builder. */
export function userDisplayName(user: string): string {
  return `${user.charAt(0).toUpperCase()}${user.slice(1)}`;
}

/** What a computer that runs work has, after it joined (design skill `components/devices/DevicesTab`). */
function foundWords(found: FoundTools): string {
  if (found.git && found.claudeCode) return "It has git and Claude Code, and no sign-ins yet.";
  if (found.git) return "It has git, and no Claude Code or sign-ins yet.";
  if (found.claudeCode) return "It has Claude Code, and no git or sign-ins yet.";
  return "It has no git, Claude Code or sign-ins yet.";
}

/**
 * What the home says once a device joined: the feed line, and the words
 * Settings -> Devices' panel turns to. A Mac that joined at Firstmate's
 * first launch there says what it can do; one a command or its address set
 * up what it has there; another user on this Mac that it is set up to run
 * work only. One already on the list that used the link to find this Mac
 * again says only that.
 */
export function deviceJoinedLine(joined: {
  name: string;
  kind: DeviceKind;
  user?: string | undefined;
  onThisMac?: boolean | undefined;
  found?: FoundTools | undefined;
  again?: boolean | undefined;
  reachedOn?: "local" | "private" | undefined;
}): string {
  const way =
    joined.reachedOn === "private"
      ? ` It reached ${HERE.this} on your private network.`
      : joined.reachedOn === "local"
        ? ` It reached ${HERE.this} on this network.`
        : "";
  // A view finds this computer again as a view: it never runs work.
  if (joined.again && joined.kind === "view")
    return `${deviceLabel(joined)} found ${HERE.this} again. It can control your first mate.${way}`;
  if (joined.again)
    return `${deviceLabel(joined)} found ${HERE.this} again. It runs work as before.${way}`;
  if (joined.kind === "view")
    return `${joined.name} joined. It can control your first mate. Your first mate's tasks and conversation stay on ${HERE.this}.${way}`;
  if (joined.kind === "mac" && !joined.found)
    return `${joined.name} joined. It can control your first mate and run its work. Your first mate's tasks and conversation stay on ${HERE.this}.${way}`;
  if (joined.onThisMac && joined.user)
    return `Running as ${userDisplayName(joined.user)} is set up. It runs work only, and has no sign-ins yet.`;
  return joined.found
    ? `${joined.name} joined your devices. ${foundWords(joined.found)}${way}`
    : `${joined.name} joined your devices.${way}`;
}

/** Names in a sentence: "website", "website and api", "website, api and docs". */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * How the home names a device (design skill `components/devices/DevicesTab`):
 * another Mac by its own name, another macOS user on this Mac as "Running
 * as Builder".
 */
export function deviceLabel(device: {
  name: string;
  user?: string | undefined;
  onThisMac?: boolean | undefined;
}): string {
  return device.onThisMac && device.user
    ? `Running as ${userDisplayName(device.user)}`
    : device.name;
}

/** The sentence for the app open on a device, by how its version compares with this computer's. */
function appVersionLine(device: { system?: DeviceSystem | undefined }, version: DeviceAppVersion) {
  if (isPhone(device))
    return version.app ? `Its app has version ${version.app}.` : "Its app did not say its version.";
  if (!version.app) return "Its app has an older Infinitary, too old to say its version.";
  if (version.same) return `Its app has Infinitary ${version.app}, as ${HERE.this} does.`;
  if (version.than)
    return `Its app has Infinitary ${version.app}, ${version.than} than ${HERE.this}'s.`;
  return `Its app has Infinitary ${version.app}.`;
}

/**
 * The version every copy on a computer runs when each runs this computer's
 * own (design skill `components/devices/DevicesTab`, "Each copy's version"):
 * its app's and its work's, or the one of them that is connected. Settings ->
 * Devices marks it on the row's mono line instead of saying a sentence;
 * undefined for a phone, whose app has a version of its own, and whenever a
 * copy differs or says nothing.
 */
export function sharedVersion(device: DeviceView): string | undefined {
  if (isPhone(device) || device.otherVersion) return undefined;
  const app = device.appVersion;
  const work = device.workVersion;
  if (app && (!app.same || app.app === undefined)) return undefined;
  if (app && work && work !== app.app) return undefined;
  return work ?? app?.app;
}

/** The words of Remove, for a card and the feed. */
export const deviceWords = {
  label: deviceLabel,

  /**
   * What Settings -> Devices says of a computer on another version of
   * Firstmate (design skill `components/devices/DevicesTab`, "Another
   * version"): which version it has, and whether it still takes work.
   */
  otherVersion(other: DeviceOtherVersion, itself = false): string {
    if (other.source) {
      const has = m.devicesSourceOtherBuild({ commit: shortCommit(other.source.commit) });
      return other.takesWork ? has : `${has} ${m.devicesSourceNoWorkUntilMatched()}`;
    }
    const has =
      other.app && other.than
        ? `Has Infinitary ${other.app}, ${other.than} than ${HERE.this}'s.`
        : other.app
          ? `Has Infinitary ${other.app}, another version than ${HERE.this}'s.`
          : other.than
            ? `Has ${other.than === "older" ? "an older" : "a newer"} Infinitary than ${HERE.this}.`
            : `Has another version of Infinitary than ${HERE.this}.`;
    const said = other.takesWork ? has : `${has} It takes no new work until it is updated.`;
    // One no home can update is updated by an install there.
    return itself ? `${said} Install the newer Infinitary on that computer.` : said;
  },

  /**
   * What Settings -> Devices says of the version each copy on a device runs
   * (design skill `components/devices/DevicesTab`, "Each copy's version"):
   * the app open there, then its work on this computer's version, in one
   * line; null when it says nothing of either, or when every copy runs
   * this computer's version (`sharedVersion`, a mark on the row's mono line).
   * Work on another version is said by `otherVersion`.
   */
  copyVersions(device: DeviceView): string | null {
    if (sharedVersion(device)) return null;
    const app = device.appVersion;
    const work = device.workVersion;
    const lines: string[] = [];
    if (app) lines.push(appVersionLine(device, app));
    if (work) lines.push(`Its work runs Infinitary ${work}, as ${HERE.this} does.`);
    return lines.length > 0 ? lines.join(" ") : null;
  },

  /**
   * What a computer that runs work stops when it is removed, before its work
   * comes to the first mate: said in the first mate's voice on its Remove
   * card, which every computer that controls it shows too.
   */
  removeStops(device: DeviceView): string {
    const tasks = device.tasks ?? 0;
    const runs = device.runs ?? [];
    if (tasks === 0) return "Its unmerged work comes to me first.";
    const which = `${tasks === 1 ? "Its task" : `Its ${tasks} tasks`}${runs.length > 0 ? ` on ${namesInWords(runs)}` : ""}`;
    return `${which} ${tasks === 1 ? "stops" : "stop"}, and its unmerged work comes to me first.`;
  },

  /** The feed's line once Remove did what it does. */
  removed(device: DeviceView): string {
    if (!deviceRunsWork(device.kind)) return `Removed ${device.name}`;
    const label = deviceLabel(device);
    if (device.removal === "when-back") return `${label} is removed once it is back`;
    const runs = device.runs ?? [];
    return runs.length === 0
      ? `Removed ${label}.`
      : `Removed ${label}. ${namesInWords(runs)} ${runs.length === 1 ? "runs" : "run"} on ${HERE.this} now.`;
  },
};

/**
 * What a new link says to the person who will use it, in Settings ->
 * Devices' panel and from `infinitary link` (docs/run.md, "A link by
 * command"): a computer's, pasted into Infinitary there at its first launch,
 * and a phone's, scanned as its code or pasted there.
 */
export const LINK_SAY = {
  computer: [
    `Your first mate stays on ${HERE.this}. Your other ${COMPUTER.one} will show it and can run work for it.`,
    `Paste this link into Infinitary on your other ${COMPUTER.one}, at its first launch.`,
  ],
  phone: [
    `Your first mate stays on ${HERE.this}. Your phone shows its cards and Activity.`,
    "Scan the code inside Infinitary on your phone, or paste this link there.",
    "For now the phone app comes from TestFlight, only to people asked to test it; it is not in the App Store yet.",
  ],
} as const;

/** The phone panel describes the invitation's actual order, never inferred reachability. */
export function phoneRouteWords(link: string): string {
  const { at } = parsePairingLink(link);
  const host = at.split(":")[0] ?? "";
  const octets = host.split(".").map(Number);
  return octets.length === 4 &&
    octets[0] === 100 &&
    (octets[1] ?? 0) >= 64 &&
    (octets[1] ?? 0) <= 127
    ? "This link prefers your private network, with local addresses as fallbacks. Both devices need access to that network."
    : "Only local addresses are available. Your phone needs to share this computer’s network.";
}

/** Latest controller fact wins; otherwise retain the joining computer's reported startup capability. */
export function automaticStartupOf(
  device: Pick<DeviceView, "ssh" | "automaticStartup">,
): AutomaticStartup | undefined {
  return device.ssh?.automaticStartup ?? device.automaticStartup;
}

export const automaticStartupWords = {
  unavailable: "automatic startup not set up",
  unknown: "automatic startup not checked",
  guidance: "This setup does not start work at login.",
  unchecked: "Infinitary could not check automatic startup here.",
};
