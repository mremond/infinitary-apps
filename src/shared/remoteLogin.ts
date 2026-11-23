import { z } from "zod";
import { fileSizeWords } from "./attachments";
import { COMPUTER, HERE } from "./deviceNames";
import { type DeviceView, deviceLabel, deviceViewSchema, userDisplayName } from "./devices";
import * as m from "./i18n/messages.generated.ts";

/**
 * Adding a Mac or a Linux computer by its address over SSH (docs/devices.md,
 * "Adding a computer by its address"; design skill
 * `components/devices/AddAMac`): the home reaches the other computer with the
 * captain's own SSH, in batch mode, copies the Firstmate for that computer's
 * system there and has it join as a computer that runs work.
 * The same address later updates Firstmate there, and removes what Firstmate
 * set up there when the computer is out of reach of the connection.
 *
 * These are the shapes both sides read and the words a person reads: the
 * address, where an operation stands, why one was refused, and the one line
 * the work mode tells the home when the home started it.
 */

/**
 * The address a person reaches the other Mac at with SSH, as they type it:
 * `sam@mini.local`, `sam@192.168.1.30`, or an alias their own SSH settings
 * name. The app reads no SSH settings: their own SSH resolves it. It never
 * starts with a dash, so it cannot be read as an option, and holds no space
 * or character a shell or SSH would read. A port typed beside it, other
 * than 22, makes it SSH's own `ssh://sam@mini.local:2222` (`addressAtPort`),
 * which every ssh, `ssh -G` and the kept key line read as one address.
 */
export const remoteLoginAddressSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^(?:(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}@)?[A-Za-z0-9_[][A-Za-z0-9_.:%[\]-]{0,190}|ssh:\/\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}@)?(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,190}|\[[A-Za-z0-9:.%]{2,64}\]):[1-9][0-9]{0,4})$/,
  );

/** The address a person typed, or null when it is not one. */
export function parseRemoteLoginAddress(text: string): string | null {
  const parsed = remoteLoginAddressSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

/** A port a person typed: empty for SSH's own, or a number from 1 to 65535. */
export function parsePort(text: string): number | "none" | null {
  const typed = text.trim();
  if (typed === "") return "none";
  if (!/^[0-9]{1,5}$/.test(typed)) return null;
  const port = Number(typed);
  return port >= 1 && port <= 65535 ? port : null;
}

/**
 * The address to reach with the port typed beside it: as typed when the
 * port is empty or 22, otherwise SSH's own `ssh://` form. Null when either
 * is not one, or when the address already names a port.
 */
export function addressAtPort(text: string, portText: string): string | null {
  const address = parseRemoteLoginAddress(text);
  const port = parsePort(portText);
  if (!address || port === null) return null;
  if (port === "none" || port === 22) return address;
  if (address.startsWith("ssh://")) return null;
  const at = address.lastIndexOf("@");
  const user = at < 0 ? "" : address.slice(0, at + 1);
  const host = at < 0 ? address : address.slice(at + 1);
  // An IPv6 address takes brackets before its port, as SSH reads it.
  const place = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return parseRemoteLoginAddress(`ssh://${user}${place}:${port}`);
}

/**
 * An address taken apart into what a person types: the account and computer,
 * and the port when it names one other than SSH's own.
 */
export function addressParts(address: string): { address: string; port: string } {
  const uri = /^ssh:\/\/(.+):([0-9]+)$/.exec(address);
  if (!uri) return { address, port: "" };
  const at = (uri[1] ?? "").lastIndexOf("@");
  const user = at < 0 ? "" : (uri[1] ?? "").slice(0, at + 1);
  const host = (uri[1] ?? "").slice(at + 1).replace(/^\[(.*)\]$/, "$1");
  return { address: `${user}${host}`, port: uri[2] ?? "" };
}

/**
 * How long an add or update over Remote Login may send, install, check and
 * start before the home stops it: a Mac's moving transfer has no such
 * ceiling, only what follows it (docs/devices.md, "Downloading on a Mac
 * reached by its address").
 */
export const REMOTE_LOGIN_TIME_LIMIT_MS = 30 * 60_000;

/**
 * Where an operation over Remote Login stands, as the feed and Settings ->
 * Devices say it: reaching the address (letting Firstmate's own key in there
 * with the password the captain typed once is still reaching it), setting
 * Firstmate up there, telling a computer already on the list where this Mac
 * is now (`finding`, with its `deviceId`), updating it, removing what
 * Firstmate set up there, done, or refused.
 */
export const remoteLoginStageSchema = z.enum([
  "reaching",
  "setting-up",
  "finding",
  "updating",
  "removing",
  "done",
  "refused",
]);
export type RemoteLoginStage = z.infer<typeof remoteLoginStageSchema>;

/**
 * How far the copy of Firstmate has gone while a Mac is set up, or found
 * again, by its address (docs/devices.md, "How far the copy has gone"):
 * `preparing` it, `sending` it with `sent`, the bytes handed to that Mac so
 * far, or `starting` it there once all of it arrived. A streamed send has no
 * total: the copy is made as it is sent. During a remote download, the
 * preparing state additionally carries `download`, with its received bytes
 * and a total only when release storage states one.
 */
export const remoteLoginCopySchema = z.object({
  state: z.enum(["preparing", "sending", "starting"]),
  sent: z.number().int().nonnegative().optional(),
  /** A separately downloaded file, whose total is only present when the release states it. */
  download: z
    .object({
      received: z.number().int().nonnegative(),
      total: z.number().int().positive().optional(),
    })
    .optional(),
});
export type RemoteLoginCopy = z.infer<typeof remoteLoginCopySchema>;

/**
 * Why an operation over Remote Login stopped, each with its own two lines
 * (`remoteLoginWords.refused`): what happened, and what to do.
 *
 * - `key-locked`: the other Mac accepts the captain's SSH key, but it is locked with a passphrase.
 * - `agent-declined`: the other Mac accepts it, but the app that holds it (an SSH agent such as
 *   1Password's) did not sign with it: the captain declined, did not answer in time, or it could not ask.
 * - `agent-not-running`: the app that holds it, the agent the captain's SSH settings name, did not
 *   answer at all: it is not open, as when 1Password has quit.
 * - `key-refused`: the other Mac did not accept it.
 * - `password-off`: the other Mac did not accept it, and lets no one in with a password.
 * - `password-wrong`: the other Mac did not take the password the captain typed once.
 * - `key-not-taken`: Firstmate placed its own key there, and the other Mac still did not let it in.
 * - `remote-login-off`: nothing answered Remote Login there.
 * - `unreachable`: nothing answered at that address at all, or the connection dropped.
 * - `host-unknown`: this Mac has not checked that address, and the check could not be asked.
 * - `host-changed`: it answered unlike the Mac this Mac reached before.
 * - `other-system`: it runs a system or chip Firstmate does not run on: anything but a
 *   Mac, or a Linux computer with an x64 chip.
 * - `needs-tools`: a Linux computer lacks what Firstmate's work needs there (`missing`):
 *   git, Xvfb to draw on, FUSE 2 to open the AppImage, or a library the AppImage needs
 *   to start, each named as the package that computer installs.
 * - `sandbox-off`: the AppImage a Linux computer gets would run without Chromium's sandbox
 *   there, since its system keeps an app with no profile of its own from making one.
 * - `cannot-install`: an Ubuntu 24.04 or 26.04 account may not install software, and its
 *   package is missing or not this computer's version.
 * - `no-build`: this computer could not get the published Firstmate for that computer's
 *   system, at this version, from the public tap.
 * - `build-unverified`: the published Firstmate it got did not match its published checksum.
 * - `already-joined`: that user already runs work for another Firstmate.
 * - `still-answers`: the captain chose to leave another Firstmate that user
 *   runs work for, and that Firstmate still answers there, so it stays.
 * - `in-reach`: that user runs this Firstmate's work already, and it is in reach.
 * - `same-user`: it is the user Firstmate already runs as, on this Mac.
 * - `cannot-send`: this copy of Firstmate cannot send itself.
 * - `not-set-up`: Firstmate is not set up there any more.
 * - `busy`: someone runs Firstmate's work there by hand.
 * - `forwarding-refused`: its Remote Login would not carry Firstmate's connection back to this Mac.
 * - `another-computer`: Change address found this Firstmate's work there, as another computer.
 * - `failed`: anything else.
 *
 * Updating a computer over the connection (docs/devices.md, "Updating over
 * the connection") says its refusals in the same two lines, with three more:
 *
 * - `out-of-reach`: the computer is not connected now.
 * - `not-updatable`: its Firstmate is too old to take the update order.
 * - `current`: it already runs this Mac's version.
 */
export const remoteLoginRefusalSchema = z.enum([
  "key-locked",
  "agent-declined",
  "agent-not-running",
  "key-refused",
  "password-off",
  "password-wrong",
  "key-not-taken",
  "remote-login-off",
  "unreachable",
  "host-unknown",
  "host-changed",
  "other-system",
  "needs-tools",
  "sandbox-off",
  "cannot-install",
  "no-build",
  "build-unverified",
  "already-joined",
  "still-answers",
  "in-reach",
  "same-user",
  "cannot-send",
  "not-set-up",
  "busy",
  "forwarding-refused",
  "another-computer",
  "failed",
  "out-of-reach",
  "not-updatable",
  "current",
]);
export type RemoteLoginRefusal = z.infer<typeof remoteLoginRefusalSchema>;

/**
 * The lines a refusal's message carries, one per line.
 * A refusal joins its two lines this way so Settings can show them apart.
 * A message with no line break is one line.
 */
export function remoteLoginRefusalLines(message: string): readonly string[] {
  return message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Whether the work runs in the background after the work mode set itself
 * up: `running` now, `at-login` from that user's next login (nobody is logged
 * in at that Mac's screen as them), `failed` when it could not be set up or
 * that user's session there refused it.
 */
export const backgroundStateSchema = z.enum([
  "running",
  "at-login",
  "failed",
  "none",
  "unavailable",
  "unknown",
]);
export type BackgroundState = z.infer<typeof backgroundStateSchema>;

/**
 * The one line the work mode prints on stdout when the home started it over
 * Remote Login (`work join|update|remove --from-home`, docs/helper.md): a
 * typed outcome the home reads, never words for a person. `reason` names a
 * refusal the work mode met (`JoinOutcome`'s reasons, `joined`, `busy`,
 * `not-joined`); `kept` the working copies a removal left for their
 * unmerged work or unreadable history, with `unreadable` distinguishing the
 * latter; `unremoved` what it could not remove yet, which that computer tries
 * again at its user's next login.
 */
export const workOutcomeSchema = z.discriminatedUnion("firstmate", [
  z.strictObject({
    firstmate: z.literal("joined"),
    background: backgroundStateSchema,
    /**
     * It left another Firstmate first, as the home's captain agreed (`leave`):
     * how many working copies it kept for their unmerged work, and how many
     * things it could not remove.
     */
    left: z
      .strictObject({
        kept: z.number().int().nonnegative().max(64),
        unremoved: z.number().int().nonnegative().max(64),
      })
      .optional(),
  }),
  z.strictObject({ firstmate: z.literal("updated"), background: backgroundStateSchema }),
  z.strictObject({
    firstmate: z.literal("removed"),
    kept: z.array(z.string().max(4096)).max(64),
    /** Kept because its work history could not be read, not known to be empty. */
    unreadable: z.array(z.string().max(4096)).max(64).optional(),
    /** What it meant to remove and could not yet. */
    unremoved: z.array(z.string().max(4096)).max(64).optional(),
  }),
  z.strictObject({ firstmate: z.literal("refused"), reason: z.string().min(1).max(64) }),
]);
export type WorkOutcome = z.infer<typeof workOutcomeSchema>;

/** The work mode's outcome line, as it prints it. */
export function workOutcomeLine(outcome: WorkOutcome): string {
  return JSON.stringify(workOutcomeSchema.parse(outcome));
}

/** The last outcome line in what the work mode printed, or null when it printed none. */
export function readWorkOutcome(stdout: string): WorkOutcome | null {
  const lines = stdout.split("\n").reverse();
  for (const line of lines) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      const parsed = workOutcomeSchema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
    } catch {
      // Not the outcome: a line the other Mac's own shell printed.
    }
  }
  return null;
}

/**
 * Add it's one option (docs/devices.md, "Another first mate's Mac"): the
 * captain agreed to leave the other Firstmate that user runs work for, should
 * it not answer there.
 */
export const remoteLoginAddOptionsSchema = z.strictObject({
  /** The captain agreed to leave the other Firstmate that user runs work for. */
  leave: z.literal(true).optional(),
  /**
   * The check line the captain said was that Mac. Absent, a Mac this Mac has
   * not checked answers the question instead of signing in.
   */
  confirm: z.string().min(1).max(160).optional(),
  /**
   * That user's password there, typed once by the captain after the Mac did
   * not let the captain's key in (docs/devices.md, "The password, once").
   * Firstmate types it only to let its own key in, after the check line, and
   * keeps none of it.
   */
  password: z.string().min(1).max(1024).optional(),
});
export type RemoteLoginAddOptions = z.infer<typeof remoteLoginAddOptionsSchema>;

/**
 * That account's password, asked once. Absent `for` means the computer did
 * not let the SSH key in. `install` and `update` mean the Ubuntu package,
 * asked in the same aside. `deviceId` names the computer an update asks about.
 * `wrong` when the one just typed did not work, which was not kept.
 */
export const remoteLoginPasswordQuestionSchema = z.strictObject({
  asks: z.literal("password"),
  address: z.string().min(1).max(255),
  user: z.string().min(1).max(64).optional(),
  wrong: z.literal(true).optional(),
  for: z.enum(["install", "update"]).optional(),
  deviceId: z.string().min(1).max(64).optional(),
});

/**
 * A Remote Login refusal answered as typed data:
 * which refusal it was and the two lines the feed said, so Settings can tell a
 * refusal that is about reaching a computer from the rest. Update and
 * change-address requests always use this answer; other errors still reject.
 */
export const remoteLoginRefusedAnswerSchema = z.strictObject({
  refused: remoteLoginRefusalSchema,
  lines: z.array(z.string().max(1024)).max(4),
  /** The change there may already have happened, so nothing offers to try it again. */
  uncertain: z.literal(true).optional(),
});
export type RemoteLoginRefusedAnswer = z.infer<typeof remoteLoginRefusedAnswerSchema>;

/** Whether a refusal says the computer did not answer, so it is stale once it answers again. */
export function refusalIsAboutReach(refusal: RemoteLoginRefusal): boolean {
  return refusal === "unreachable" || refusal === "out-of-reach";
}

/**
 * What Add it answers: the computer once it joined, or, when that user runs
 * work for another Firstmate, the question the captain is asked once before
 * anything is sent there (`leave`), naming the Mac by its own name when it
 * said one.
 */
export const remoteLoginConfirmQuestionSchema = z.strictObject({
  asks: z.literal("confirm"),
  address: z.string().min(1).max(255),
  line: z.string().min(1).max(160),
});

export const remoteLoginAddAnswerSchema = z.union([
  deviceViewSchema,
  z.strictObject({
    asks: z.literal("leave"),
    address: z.string().min(1).max(255),
    name: z.string().min(1).max(255).optional(),
  }),
  remoteLoginConfirmQuestionSchema,
  remoteLoginPasswordQuestionSchema,
]);
export const packageUpdateAddressQuestionSchema = z.strictObject({
  asks: z.literal("package-address"),
  address: remoteLoginAddressSchema.optional(),
  /** Why the address tried on its own was refused, said above it so it can be corrected. */
  lines: z.array(z.string().max(1024)).max(4).optional(),
});
export type PackageUpdateAddressQuestion = z.infer<typeof packageUpdateAddressQuestionSchema>;

export const remoteLoginUpdateOptionsSchema = z.strictObject({
  password: z.string().min(1).max(1024).optional(),
  address: remoteLoginAddressSchema.optional(),
  confirm: z.string().min(1).max(160).optional(),
  packageFallback: z.literal(true).optional(),
});
export type RemoteLoginUpdateOptions = z.infer<typeof remoteLoginUpdateOptionsSchema>;

export type RemoteLoginAddAnswer = z.infer<typeof remoteLoginAddAnswerSchema>;
export type RemoteLoginLeaveQuestion = Extract<RemoteLoginAddAnswer, { asks: "leave" }>;
export type RemoteLoginConfirmQuestion = Extract<RemoteLoginAddAnswer, { asks: "confirm" }>;
export type RemoteLoginPasswordQuestion = z.infer<typeof remoteLoginPasswordQuestionSchema>;

/**
 * What the home was doing over Remote Login: adding a Mac, updating
 * Firstmate there, removing it, or changing the address it reaches a
 * computer at (docs/devices.md, "Changing its address").
 */
export const remoteLoginDoingSchema = z.enum(["add", "update", "remove", "address"]);
export type RemoteLoginDoing = z.infer<typeof remoteLoginDoingSchema>;

/**
 * Which step an `unreachable` refusal stopped at, so its words name it
 * (docs/devices.md, "When it could not reach the computer"): reading its SSH
 * key before any sign-in, at the port the person's SSH settings resolve
 * (`answered` when something took the connection there and sent no key,
 * false when nothing did, absent when this computer cannot tell); signing in
 * after the key was read; or sending Infinitary after the sign-in.
 */
export type RemoteLoginReach =
  | { step: "key"; port: number; answered?: boolean }
  | { step: "sign-in"; port?: number }
  | { step: "send" };

/**
 * An `unreachable` refusal's two lines: the step and port it stopped at,
 * then what to check, the private network among it. An add ends by offering
 * Run a command there, which works where SSH from here does not.
 */
function unreachableLines(
  address: string,
  name: string,
  doing: RemoteLoginDoing | undefined,
  reach: RemoteLoginReach | undefined,
): [string, string] {
  const next = doing === "add" ? m.devicesReachOrCommand() : m.devicesReachAskAgain();
  if (!reach) return [m.devicesReachNone({ address }), `${m.devicesReachCheck()} ${next}`];
  switch (reach.step) {
    case "key": {
      const port = String(reach.port);
      if (reach.answered === true)
        return [
          m.devicesReachKeyNoKey({ address, port }),
          `${m.devicesReachCheckNoKey({ port })} ${next}`,
        ];
      if (reach.answered === false)
        return [
          m.devicesReachKeySilent({ address, port }),
          `${m.devicesReachCheckSilent()} ${next}`,
        ];
      return [
        m.devicesReachKeyUnread({ address, port }),
        `${m.devicesReachCheckPort({ port })} ${next}`,
      ];
    }
    case "sign-in":
      return [
        reach.port === undefined
          ? m.devicesReachSignIn({ address })
          : m.devicesReachSignInPort({ address, port: String(reach.port) }),
        `${m.devicesReachCheckStay()} ${next}`,
      ];
    case "send":
      return [m.devicesReachSend({ name }), `${m.devicesReachCheckStay()} ${next}`];
  }
}

/** The program that installs software on a Linux computer, as the look tells it. */
export const LINUX_INSTALLERS = ["apt", "dnf", "pacman", "zypper"] as const;
export type LinuxInstaller = (typeof LINUX_INSTALLERS)[number];

/**
 * How a Linux computer names what it installs: the program that installs it,
 * and with apt, whether its libraries take Debian's 64-bit time names, as
 * Ubuntu 24.04 and Debian 13 do (`libasound2t64`).
 */
export type LinuxInstalls = {
  installer?: LinuxInstaller | undefined;
  t64?: boolean | undefined;
};

type NeedNames = Readonly<Record<"any" | LinuxInstaller, string>> & { readonly t64?: string };

/**
 * What a Linux computer needs before Firstmate's work runs there (docs/devices.md,
 * "Adding a computer by its address"), by the word the look says, and the package
 * a person installs for it with each installer, or `any` where the look could not
 * tell which: git for the work itself, Xvfb for the display the work draws its
 * hidden windows on, FUSE 2's `fusermount` and library, which open the AppImage,
 * and the libraries Electron is linked against (docs/linux-packages.md, "What the
 * AppImage needs").
 */
export const LINUX_NEEDS = {
  git: { any: "git", apt: "git", dnf: "git", pacman: "git", zypper: "git" },
  xvfb: {
    any: "Xvfb",
    apt: "xvfb",
    dnf: "xorg-x11-server-Xvfb",
    pacman: "xorg-server-xvfb",
    zypper: "xorg-x11-server-Xvfb",
  },
  fuse: { any: "FUSE 2", apt: "fuse3", dnf: "fuse", pacman: "fuse2", zypper: "fuse" },
  libfuse: {
    any: "FUSE 2",
    apt: "libfuse2",
    t64: "libfuse2t64",
    dnf: "fuse-libs",
    pacman: "fuse2",
    zypper: "libfuse2",
  },
  gtk: {
    any: "GTK 3",
    apt: "libgtk-3-0",
    t64: "libgtk-3-0t64",
    dnf: "gtk3",
    pacman: "gtk3",
    zypper: "libgtk-3-0",
  },
  nss: { any: "NSS", apt: "libnss3", dnf: "nss", pacman: "nss", zypper: "mozilla-nss" },
  gbm: { any: "GBM", apt: "libgbm1", dnf: "mesa-libgbm", pacman: "mesa", zypper: "libgbm1" },
  alsa: {
    any: "ALSA",
    apt: "libasound2",
    t64: "libasound2t64",
    dnf: "alsa-lib",
    pacman: "alsa-lib",
    zypper: "libasound2",
  },
  udev: {
    any: "libudev",
    apt: "libudev1",
    dnf: "systemd-libs",
    pacman: "systemd-libs",
    zypper: "libudev1",
  },
} as const satisfies Record<string, NeedNames>;
export type LinuxNeed = keyof typeof LINUX_NEEDS;

/**
 * What a person installs there for each need, by that computer's installer,
 * each once, in the look's order: two needs one package brings name it once.
 */
export function linuxNeedNames(missing: readonly string[], installs: LinuxInstalls = {}): string[] {
  const { installer, t64 } = installs;
  const named = missing.map((need) => {
    const names: NeedNames | undefined = Object.hasOwn(LINUX_NEEDS, need)
      ? LINUX_NEEDS[need as LinuxNeed]
      : undefined;
    if (!names) return need;
    if (!installer) return names.any;
    return (installer === "apt" && t64 && names.t64) || names[installer];
  });
  return [...new Set(named)];
}

/** "git", "git and xvfb", "git, xvfb and fuse3". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A computer named for the words: its label, or the address it was added at before it has one. */
type Named = Pick<DeviceView, "name" | "user" | "onThisMac"> & {
  system?: DeviceView["system"];
};

/** How the home reaches a computer it added by its address: Remote Login on a Mac, its SSH server on Linux. */
function overSsh(device: Named): string {
  return device.system === "linux" ? "over SSH" : "over Remote Login";
}

/** When a user who is not logged in starts running work: "the next time sam logs in there". */
function nextLogin(device: Named): string {
  if (!device.user) return "the next time someone logs in there";
  return device.onThisMac
    ? `the next time ${userDisplayName(device.user)} logs in`
    : `the next time ${device.user} logs in there`;
}

/**
 * What the feed and Settings -> Devices say over Remote Login, in the design
 * skill's words (`components/devices/AddAMac`). The address is the thing
 * itself; the app shows it in mono where it can.
 */
export const remoteLoginWords = {
  /** The feed's line for each stage. */
  reaching: (address: string) => `Reaching ${address} with your SSH key.`,
  /** The aside that asks before anything is sent: the question, then what to compare. */
  confirmQuestion: (address: string): [string, string] => [
    `Is this ${address}?`,
    `Compare this line with the one that ${COMPUTER.one} shows.`,
  ],
  /**
   * The aside that asks for that user's password once (docs/devices.md, "The
   * password, once"): what happened, then what Firstmate does with it.
   */
  passwordQuestion: (address: string): [string, string] => [
    `${address} did not let your SSH key in.`,
    "Infinitary can let its own key in with that user's password. It uses the password once and keeps none of it.",
  ],
  /** The same aside, when the password installs Firstmate on an Ubuntu computer. */
  passwordInstallQuestion: (address: string): [string, string] => [
    `Infinitary will install itself on ${address}.`,
    "It uses that account's password once, and keeps none of it.",
  ],
  /** The same aside, when Update installs a newer package there. */
  passwordUpdateQuestion: (address: string): [string, string] => [
    `Infinitary will update itself on ${address}.`,
    "It uses that account's password once, and keeps none of it.",
  ],
  /** The password field's name, which its placeholder says too. */
  passwordField: (user: string | undefined) =>
    user ? `${user}'s password on that ${COMPUTER.one}` : `The password on that ${COMPUTER.one}`,
  lettingIn: (address: string) => `Letting Infinitary's own key in on ${address}.`,
  settingUp: (name: string) => `Preparing Infinitary for ${name}.`,
  /**
   * Getting the Firstmate published for a computer of another system, at this
   * computer's version, before the copy goes (docs/devices.md, "Firstmate for
   * another system").
   */
  gettingBuild: (name: string) =>
    `Getting Infinitary for ${name}'s system from its published release, and checking it.`,
  /** The copy's line, which says the bytes sent so far and never a share of a total. */
  sending: (name: string, sent: number) =>
    `Sending Infinitary to ${name}: ${fileSizeWords(sent)} sent.`,
  downloading: (name: string, received: number, total?: number) =>
    `${name} is downloading Infinitary… ${fileSizeWords(received)}${total === undefined ? " so far" : ` of ${fileSizeWords(total)}`}`,
  downloadFallback: (name: string, mismatch: boolean) =>
    mismatch
      ? `${name}'s download did not match, so ${HERE.this} is sending its copy.`
      : `${name} could not download Infinitary, so ${HERE.this} is sending its copy.`,
  /**
   * What stopped an add or update before Infinitary started there: two
   * minutes with nothing moving (`inactive`), or its time limit (`timeout`),
   * never what SSH answered once it was stopped.
   */
  stopped: (
    name: string,
    doing: RemoteLoginDoing,
    why: "inactive" | "timeout",
  ): readonly [string, string] => [
    `${doing === "update" ? "Updating Infinitary on" : "Preparing Infinitary for"} ${name} ${
      why === "inactive"
        ? "stopped after two minutes with nothing moving"
        : `stopped at its ${REMOTE_LOGIN_TIME_LIMIT_MS / 60_000}-minute time limit`
    }.`,
    "Nothing changed there. Ask again.",
  ],
  uncertain: (name: string): readonly [string, string] => [
    `${name} may already have updated Infinitary.`,
    "Check Devices for its version. Do not start another update while it may still be running.",
  ],
  starting: (name: string) => `Starting Infinitary on ${name}.`,
  /** The Ubuntu package is being installed there, after the copy was checked. */
  installing: (name: string) => `Installing Infinitary on ${name}.`,
  /** A computer on the list, out of reach since this Mac's address changed (docs/devices.md, "Finding the home again"). */
  finding: (device: Named) => `Telling ${deviceLabel(device)} where ${HERE.this} is now.`,
  updateLocalCopyOffer: () =>
    `${HERE.This} copies its own Infinitary there over Remote Login, with your own SSH key, and starts it again.`,
  updateDownloadOffer: () =>
    `It downloads ${HERE.this}'s version of Infinitary, or ${HERE.this} sends its own copy, with a count. Remote Login uses your own SSH key.`,
  /** A Mac a command added, which downloads its update itself over its own connection (docs/devices.md, "Downloading over the connection"). */
  updateConnectionDownloadOffer: () =>
    `It downloads ${HERE.this}'s version of Infinitary, or ${HERE.this} sends its own copy over your network, with a count.`,
  updating: (device: Named) => `Updating Infinitary on ${deviceLabel(device)}.`,
  removing: (device: Named) =>
    `Removing what Infinitary set up on ${deviceLabel(device)}, ${overSsh(device)}.`,

  /** Settings -> Devices' row while it works. */
  reachingRow: (address: string) => `Reaching ${address} with your SSH key…`,
  lettingInRow: (address: string) => `Letting Infinitary's own key in on ${address}…`,
  settingUpRow: (name: string) => `Preparing Infinitary for ${name}…`,
  sendingRow: (name: string, sent: number) =>
    `Sending Infinitary to ${name}… ${fileSizeWords(sent)} sent`,
  startingRow: (name: string) => `Starting Infinitary on ${name}…`,
  findingRow: (device: Named) => `Telling ${deviceLabel(device)} where ${HERE.this} is now…`,
  updatingRow: (device: Named) => `Updating Infinitary on ${deviceLabel(device)}…`,

  startup: (device: Named, state: "unavailable" | "unknown") =>
    state === "unavailable"
      ? `Infinitary could not set up automatic startup on ${deviceLabel(device)}.`
      : `Infinitary could not check automatic startup on ${deviceLabel(device)}.`,

  /** Said after the joined line when nobody is logged in there as that user. */
  atLogin: (device: Named) => `${deviceLabel(device)} starts running work ${nextLogin(device)}.`,

  updated: (device: Named, background: BackgroundState) =>
    background === "at-login"
      ? `${deviceLabel(device)} has ${HERE.this}'s version of Infinitary now, and starts it ${nextLogin(device)}.`
      : background === "failed" || background === "unavailable" || background === "unknown"
        ? `${deviceLabel(device)} has ${HERE.this}'s version of Infinitary now.`
        : `${deviceLabel(device)} runs ${HERE.this}'s version of Infinitary now.`,

  /**
   * Updated over the connection, a computer with no background set up to
   * start it again runs this Mac's version only once it is started there.
   */
  updatedByHand: (device: Named) =>
    `${deviceLabel(device)} has ${HERE.this}'s version of Infinitary now, and runs it once it is started there again.`,

  /**
   * The copy an update brought did not reach this computer, so that
   * computer went back to the copy it kept (docs/helper.md, "A copy that
   * does not start"); said once.
   */
  wentBack: (device: Named, version: string): [string, string] => [
    `${deviceLabel(device)} could not start Infinitary ${version}, so it went back to the version it ran before.`,
    `${HERE.This} does not send Infinitary ${version} there again.`,
  ],

  /** Update asked for the version that did not start there before. */
  failedHere: (device: Named, version: string): [string, string] => [
    `${deviceLabel(device)} could not start Infinitary ${version} before, so ${HERE.this} does not send it there again.`,
    "It can be updated once a newer version is here.",
  ],

  packageAddressRefused: (name: string): [string, string] => [
    `That address does not reach the Ubuntu package for ${name}.`,
    "Check the address and account, or update Infinitary on that computer.",
  ],
  packageUpdateAddress: (device: Named) =>
    `To install the Ubuntu package on ${deviceLabel(device)}, enter the address you use for Remote Login there.`,
  packageUpdateThere: (device: Named) =>
    `If Remote Login is not available, update Infinitary on ${deviceLabel(device)} and restart it there. You do not need to add it again.`,
  packageCopyMissing: (name: string): [string, string] => [
    `${name} has no copy of Infinitary to replace over this connection.`,
    "Update Infinitary on that computer, or open Devices on the computer where your first mate lives.",
  ],

  stillOnVersion: (device: Named, app?: string) =>
    app
      ? `${deviceLabel(device)} still runs Infinitary ${app} after the update.`
      : `${deviceLabel(device)} is back, but does not run ${HERE.this}'s version of Infinitary.`,

  /** Asked to update, it has not come back within the wait. */
  notBack: (device: Named): [string, string] => [
    `${deviceLabel(device)} has not come back after the update.`,
    "Check that it is awake. If it stays out of reach, remove it, then add it again.",
  ],

  /**
   * Said after the joined or updated line when that user's session there
   * refused to start it in the background: no login starts it either, and
   * asking again tries once more, with the same computer on the list.
   */
  notInBackground: (device: Named, doing: "add" | "update"): [string, string] => [
    `${deviceLabel(device)} could not set itself to start in the background, so it runs no work for now.`,
    doing === "update" ? "Ask again to update it." : "Ask again to add it.",
  ],

  /**
   * Said after the joined or updated line when the Ubuntu package's install
   * there could not keep `user`'s work running after they log out (systemd's
   * linger, where systemd does not run, as in a container): the one line an
   * administrator runs there, as the command for another computer says it
   * (`afterLogout`, `src/core/helper/words.ts`).
   */
  afterLogout: (device: Named, user: string): [string, string] => [
    `To keep ${deviceLabel(device)} running work after ${user} logs out, an administrator runs this there once:`,
    `sudo loginctl enable-linger ${user}`,
  ],

  /**
   * Add it's question for a Mac whose user runs work for another Firstmate:
   * what it found, what leaving does, and what stays.
   */
  leaveQuestion: (asked: {
    address: string;
    name?: string | undefined;
  }): [string, string, string] => [
    `${asked.address} runs work for another first mate.`,
    `If that first mate is gone for good, adding ${asked.name ?? "it"} leaves it: Infinitary removes what it set up there for that one, with its sign-ins.`,
    "Work that never merged stays there. If that first mate still answers, nothing changes.",
  ],

  /** Said once a Mac added this way left the other first mate it ran work for. */
  leftOther: (device: Named, left: { kept: number; unremoved: number }): string[] => [
    left.kept === 0
      ? `${deviceLabel(device)} left the other first mate it ran work for.`
      : `${deviceLabel(device)} left the other first mate it ran work for. Its unmerged work stays there.`,
    ...(left.unremoved > 0
      ? [`Infinitary could not remove all it set up on ${deviceLabel(device)} for the other one.`]
      : []),
  ],

  removedThere: (device: Named, kept: number) =>
    kept === 0
      ? `Removed what Infinitary set up on ${deviceLabel(device)}.`
      : `Removed what Infinitary set up on ${deviceLabel(device)}. Its unmerged work stays there.`,

  /**
   * Said in place of `removedThere` when what is there is another
   * Firstmate's or another computer's, or nothing: nothing was removed.
   */
  nothingThere: (device: Named) =>
    `${deviceLabel(device)} had nothing of your first mate's to remove.`,

  /**
   * Said in place of `removedThere` when it could not remove all of it there
   * yet: that computer tries again itself, at its user's next login.
   */
  notAllRemovedThere: (device: Named, kept: number): [string, string] => [
    kept === 0
      ? `Could not remove all that Infinitary set up on ${deviceLabel(device)} yet.`
      : `Could not remove all that Infinitary set up on ${deviceLabel(device)} yet. Its unmerged work stays there.`,
    `${deviceLabel(device)} tries again ${nextLogin(device)}.`,
  ],

  /**
   * A refusal: what happened, then what to do. `name` is the other Mac's own
   * name, or how the list names a computer already on it.
   */
  refused(
    refusal: RemoteLoginRefusal,
    at: {
      address: string;
      name?: string | undefined;
      doing?: RemoteLoginDoing;
      /** What a Linux computer lacks, for `needs-tools`, by the words `LINUX_NEEDS` reads. */
      missing?: readonly string[] | undefined;
      /** How that computer names what it installs, for `needs-tools`. */
      installs?: LinuxInstalls | undefined;
      /** The step an `unreachable` refusal stopped at, when known. */
      reach?: RemoteLoginReach | undefined;
    },
  ): [string, string] {
    const { address } = at;
    const name = at.name ?? address;
    switch (refusal) {
      case "key-locked":
        return [
          `Could not sign in to ${address}. Your SSH key is locked with a passphrase.`,
          "Unlock it once in Terminal, then ask again.",
        ];
      case "agent-declined":
        return [
          `Could not sign in to ${address}. The app that holds your SSH key did not approve it.`,
          "Ask again, and approve it in that app when it asks.",
        ];
      case "agent-not-running":
        return [
          `Could not sign in to ${address}. The app that holds your SSH key is not open.`,
          "Open that app, then ask again.",
        ];
      case "key-refused":
        return [
          `${address} did not accept your SSH key.`,
          "Check that Remote Login is on there and lets you in, then ask again.",
        ];
      case "password-off":
        return [
          `${address} did not accept your SSH key, and does not take a password.`,
          "Let your SSH key in there and ask again, or add it with a command instead.",
        ];
      case "password-wrong":
        return [
          `${address} did not take that password.`,
          "Nothing was kept. Check it, then try again.",
        ];
      case "key-not-taken":
        return [
          `${address} did not let Infinitary's own key in, after it was placed there.`,
          "Its Remote Login may read keys from another file. Add it with a command instead.",
        ];
      case "remote-login-off":
        return [
          `${address} did not answer over Remote Login.`,
          "Turn on Remote Login there, in System Settings under General, Sharing, or start the SSH server on a Linux computer. Then ask again.",
        ];
      case "unreachable":
        return unreachableLines(address, name, at.doing, at.reach);
      case "host-unknown":
        return [
          `${HERE.This} has not checked ${address} yet, so it cannot tell it is your ${COMPUTER.one}.`,
          `Add it again by its address, and say this is the ${COMPUTER.one}.`,
        ];
      case "host-changed":
        return [
          `${address} does not answer as the ${COMPUTER.one} ${HERE.this} reached before.`,
          "If you did not set it up again, someone may be in between, so nothing was sent to it.",
        ];
      case "other-system":
        return [
          `Infinitary cannot run on ${address}'s system.`,
          "It runs work on Macs, and on Linux computers with an x64 chip. Nothing changed there.",
        ];
      case "needs-tools": {
        const names = linuxNeedNames(at.missing ?? [], at.installs);
        return [
          `${name} needs ${listed(names)} before it can run your first mate's work.`,
          `Install ${names.length === 1 ? "it" : "them"} there with its software app or package manager, then ask again.`,
        ];
      }
      case "sandbox-off":
        return [
          `${name} would run Infinitary without its sandbox: its system keeps apps from making one.`,
          "Install the Infinitary package for its system there, then add it with Run a command there instead. Nothing changed there.",
        ];
      case "cannot-install":
        return [
          `${name} cannot install software there.`,
          "Use an account that can, or install Infinitary there and add it with Run a command there. Nothing changed there.",
        ];
      case "no-build":
        return [
          `Could not get Infinitary for ${name}'s system from its published release.`,
          `Check that ${HERE.this} is online, then ask again. Nothing changed there.`,
        ];
      case "build-unverified":
        return [
          `The copy of Infinitary published for ${name}'s system did not match its checksum, so nothing was sent.`,
          "Ask again later. Nothing changed there.",
        ];
      case "already-joined":
        return [
          `${address} already runs work for another first mate.`,
          "Remove it from that first mate, then ask again.",
        ];
      case "still-answers":
        return [
          `${address} runs work for another first mate, which still answers.`,
          "Remove it from that first mate, then ask again.",
        ];
      case "in-reach":
        return [
          `${name} already runs work for your first mate, and is in reach.`,
          "Nothing changed there.",
        ];
      case "same-user":
        return [
          `${address} is the user Infinitary already runs as, on ${HERE.this}.`,
          `Add another user on ${HERE.this}, or another ${COMPUTER.one}.`,
        ];
      case "cannot-send":
        return [
          `This copy of Infinitary cannot send itself to another ${COMPUTER.one}.`,
          at.doing === "update"
            ? `Only an installed Infinitary can update another ${COMPUTER.one}.`
            : `Only an installed Infinitary can add a ${COMPUTER.one}.`,
        ];
      case "not-set-up":
        return [`Infinitary is not set up on ${name} any more.`, "Nothing changed there."];
      case "busy":
        return [
          `Someone is running Infinitary's work by hand on ${name}.`,
          "Stop it there, then ask again.",
        ];
      case "forwarding-refused":
        return [
          `Remote Login on ${address} does not let Infinitary's connection through.`,
          "Allow forwarding in its SSH settings, then ask again.",
        ];
      case "another-computer":
        return [
          `${address} runs your first mate's work as another computer, not ${name}.`,
          "Nothing changed.",
        ];
      case "out-of-reach":
        return [
          `${name} is out of reach, so ${HERE.this} cannot update it now.`,
          "Ask again once it is back.",
        ];
      case "not-updatable":
        return [
          `${name} has a version of Infinitary too old to update from here.`,
          "Make a new command for it in Devices, and run it there once.",
        ];
      case "current":
        return [
          `${name} already runs ${HERE.this}'s version of Infinitary.`,
          "Nothing changed there.",
        ];
      case "failed":
        if (at.doing === "address")
          return [`Could not reach ${name} at ${address}.`, "Nothing changed. Ask again."];
        return at.doing === "remove"
          ? [
              `Could not remove what Infinitary set up on ${name}, over Remote Login.`,
              "It removes it itself the next time it is back.",
            ]
          : [
              `Could not ${at.doing === "update" ? "update" : "set up"} Infinitary on ${name}.`,
              "Nothing changed there. Ask again.",
            ];
    }
  },
};
