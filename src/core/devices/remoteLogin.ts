import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import { COMPUTER } from "@shared/deviceNames";
import {
  type DeviceChip,
  type DeviceView,
  deviceLabel,
  KEY_TEXT_PATTERN,
  parsePairingLink,
} from "@shared/devices";
import type { FmEvent } from "@shared/events";
import type { JoinAtOptions, JoinAtRefusal, LinkAtAnswer } from "@shared/joinByAddress";
import {
  COMPUTER_LINK_COMMAND,
  COMPUTER_LINK_NONE,
  type ComputerLinkNone,
  readComputerLinkAnswer,
} from "@shared/phoneLink";
import {
  type BackgroundState,
  LINUX_INSTALLERS,
  type LinuxInstaller,
  type LinuxInstalls,
  parseRemoteLoginAddress,
  REMOTE_LOGIN_TIME_LIMIT_MS,
  type RemoteLoginAddAnswer,
  type RemoteLoginAddOptions,
  type RemoteLoginConfirmQuestion,
  type RemoteLoginCopy,
  type RemoteLoginDoing,
  type RemoteLoginPasswordQuestion,
  type RemoteLoginReach,
  type RemoteLoginRefusal,
  type RemoteLoginStage,
  type RemoteLoginUpdateOptions,
  readWorkOutcome,
  remoteLoginWords,
} from "@shared/remoteLogin";
import { SSH_MESSAGE_VERSION, sshConnectionWords, sshMessageLine } from "@shared/sshConnection";
import type { BuildFlavor } from "@shared/userDataFolders";
import { hostPlatform, thisDeviceSystem } from "../platform";
import { copyCount } from "./appArchive";
import { asDeviceName } from "./computerName";
import { copyStream, type FarBuild, FarBuilds } from "./farBuilds";
import {
  type FarSystem,
  farFolderArgs,
  farSystemNamed,
  farSystemOf,
  LOOK,
  REMOVE,
} from "./farSystems";
import { readHostKey, resolveDestination, signInUser } from "./hostKey";
import { sameHostKey } from "./hostTrust";
import { type Locality, type LocalityChallenge, placeLocalityChallenge } from "./locality";
import type { DevicePairing, SshCleanup } from "./pairing";
import {
  DOWNLOAD_FETCHED,
  DOWNLOAD_INSTALL,
  DOWNLOAD_READY,
  MAC_DOWNLOAD,
  MAC_DOWNLOAD_UPDATE,
  readDownloadCount,
  UPDATE_STARTING,
} from "./remoteDownload";
import { runSsh, SSH_FAILED, SSH_OPTIONS, SshMaster, type SshProgram, type SshResult } from "./ssh";
import { type PasswordMethod, passwordMethods, placeOwnKey } from "./sshPassword";
import { sshRefusal } from "./sshRefusal";
import {
  lingerOff,
  PACKAGE_SETUP,
  RECEIVE_DEB,
  type SudoRight,
  sudoInstallCommand,
  sudoRejected,
  UBUNTU_PACKAGE_BIN,
  ubuntuInstallNeed,
  ubuntuPackageRelease,
  writeSecret,
} from "./ubuntuPackage";

/**
 * Adding a Mac or a Linux computer by its address over SSH (docs/devices.md,
 * "Adding a computer by its address"; design skill
 * `components/devices/AddAMac`), and, for a computer added that way,
 * updating Firstmate there and removing what Firstmate set up there. Every
 * step runs the captain's own SSH in batch mode (`./ssh.ts`) and is the
 * captain's own click: Firstmate only offers the card whose button does it
 * in Settings -> Devices.
 *
 * Adding, in order, each said once in the feed:
 * 1. "Reaching sam@mini.local with your SSH key.": one look at the other
 *    computer - its system and chip, which choose its adapter
 *    (`./farSystems.ts`), what its work lacks there, the user it runs as,
 *    its own name, whether it is this computer itself (`./locality.ts`), and
 *    whether that user already runs work for a Firstmate: which one, by its
 *    key's pin, and the id that Firstmate gave it. Nothing is written there.
 *    A computer that did not let the captain's key in, and lets a user in
 *    with a password, answers the password question instead; with that
 *    password, typed once, "Letting Firstmate's own key in on
 *    sam@mini.local." places Firstmate's own key there (`./sshPassword.ts`),
 *    and the look runs again with that key.
 * 2. "Preparing Firstmate for Mac mini.": its Firstmate - this app's own for
 *    its own system, or the one published for that system at this version,
 *    got and checked first ("Getting Firstmate for Mac mini's system…",
 *    `./farBuilds.ts`) - then a one-use link for a computer that runs work,
 *    and the copy sent over the same SSH - "Sending Firstmate to Mac mini:
 *    42.3 MB sent.", the count rewritten in place as it moves
 *    (docs/devices.md, "How far the copy has gone") - checked and unpacked
 *    in a temporary folder there and, with "Starting Firstmate on Mac
 *    mini.", started as `work join --fetched <app> --from-home`, which reads
 *    the link from its input - never from its arguments, where that
 *    computer's other users could read it - joins with it, keeps the copy and
 *    sets itself to run in the background as that user.
 * 3. The joined line pairing says, and, when nobody is logged in there as
 *    that user, when its work starts.
 *
 * A user there that runs this Firstmate's work already, as a computer on
 * the list out of reach, is found again instead (docs/devices.md, "Finding
 * the home again"): step 2 is "Telling Mac mini where this Mac is now.", and
 * the same link and copy, started the same way, find this Mac where it is
 * now as the same computer, whose id, sign-ins and projects stay. One in
 * reach is left as it is; one this Mac removed is set up anew.
 *
 * A user there that runs another Firstmate's work is asked about first
 * (docs/devices.md, "Another first mate's Mac"): Add it answers the question,
 * with nothing sent there, and only Add it again with `leave` sets it up,
 * telling the join there to leave that Firstmate should it not answer. The
 * join checks: one that still answers stays, and nothing changes there.
 *
 * A refusal is two feed lines, what happened and what to do, each `warn`,
 * and nothing changed there; the link nobody used is closed at once.
 */

/** One step of an operation over Remote Login, as the feed says it. */
export type DeviceSetupEvent = Extract<FmEvent, { type: "device_setup" }>;

export type RemoteLoginOptions = {
  pairing: DevicePairing;
  ssh: SshProgram;
  /** This app's flavor, which names the data folder its copy keeps on the other Mac. */
  flavor: BuildFlavor;
  /**
   * This app's own, which a computer of its own system gets: a Mac's bundle,
   * or a Linux AppImage; null when this copy cannot send itself.
   */
  appBundle: () => string | null;
  /**
   * Which Firstmate each system gets (docs/devices.md, "Firstmate for another
   * system"): this app's own, or the one published for that system at this
   * version. Absent, only `appBundle`, so only a computer of this app's own
   * system is set up, as in a test.
   */
  builds?: FarBuilds;
  /** Resolves once the connection listens for what pairing holds now. */
  listening: () => Promise<void>;
  /** Whether a computer on the list is in reach now; none is when absent. */
  inReach?: (deviceId: string) => boolean;
  emit: (event: DeviceSetupEvent) => void;
  /**
   * Leaves the token the look reads back on this Mac alone
   * (`placeLocalityChallenge`), unless a test stands in its own.
   */
  here?: () => LocalityChallenge;
  /**
   * This Mac's SSH connections to the computers it reaches that way
   * (`SshConnections`): each operation on one holds its connection, and a
   * computer set up waits until it is done. None in a test that keeps none.
   */
  connections?: {
    hold: <T>(deviceId: string, operation: () => Promise<T>) => Promise<T>;
    settingUp: <T>(operation: () => Promise<T>) => Promise<T>;
  };
  /** Where control sockets' folders are made; `/tmp` unless a test stands in its own. */
  controlBase?: string;
  /** Backstops: a quiet connection already ends within a minute. */
  lookTimeoutMs?: number;
  sendTimeoutMs?: number;
  /** How often the copy's count is said while it moves; `COPY_EVERY_MS` unless a test says every chunk. */
  copyEveryMs?: number;
  /** No movement for two minutes ends a Mac download or send. */
  idleTimeoutMs?: number;
  /** This app's version, which an Ubuntu package there is compared with. */
  version?: string;
};

/**
 * A refusal, with the two lines the feed said.
 * The message is those lines, one per line, so Settings can show them apart.
 */
export class RemoteLoginRefusedError extends Error {
  constructor(
    readonly refusal: RemoteLoginRefusal,
    readonly lines: readonly [string, string],
    message: string = lines.join("\n"),
    /** The change there may already have happened, so it is not tried again. */
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "RemoteLoginRefusedError";
  }
}

/**
 * What one look at the other Mac found (`LOOK`): with `joined`, the pin of
 * the Firstmate that user runs work for and the id it gave it, when its
 * grant says them.
 */
type Look = {
  os: string;
  /** What `uname -m` answered there. */
  arch?: string;
  /** What its work lacks there (`LINUX_NEEDS`), as the look names it, each once. */
  needs: string[];
  /** How it names what it installs there, which the refusal for `needs` says. */
  installs: LinuxInstalls;
  /** The copy it gets could not keep Chromium's sandbox on there. */
  sandboxOff: boolean;
  /** `/etc/os-release` ID, when the look could read one. */
  distro?: string;
  /** `/etc/os-release` VERSION_ID. */
  release?: string;
  /** The installed Ubuntu package's version, or empty when none is installed. */
  pkg?: string;
  /** Whether that account may install software. */
  sudo?: SudoRight;
  user?: string;
  uid?: number;
  name?: string;
  joined?: boolean;
  keptAppImage?: boolean;
  home?: string;
  device?: string;
  /**
   * With no grant kept for its work there, the home and id of the grant its
   * window keeps, when that window joined a Firstmate as a Mac.
   */
  windowHome?: string;
  windowDevice?: string;
  /** What it read at the path this Mac left its token at, when it could read one. */
  here?: string;
};

/**
 * An Ubuntu package that matches this computer's version there: `ready`, or
 * `linger-off` when the install just made it so but could not let that
 * user's work keep running after they log out, where systemd does not run.
 */
type UbuntuReady = "ready" | "linger-off";

const LOOK_TIMEOUT_MS = 90_000;
const SEND_TIMEOUT_MS = REMOTE_LOGIN_TIME_LIMIT_MS;
/** The copy's count is said at most this often between its first bytes and its end. */
const COPY_EVERY_MS = 1_000;
const IDLE_TIMEOUT_MS = 2 * 60_000;

/** What a bootstrap's path may be: absolute, and nothing a shell or SSH would read. */
const REMOTE_PATH = /^\/[A-Za-z0-9._/-]{1,1000}$/;

export class RemoteLogin {
  /** Addresses and devices with an operation under way. */
  private readonly underWay = new Set<string>();
  /** Which Firstmate each system gets: this app's own, or the one published for it. */
  private readonly builds: FarBuilds;

  constructor(private readonly options: RemoteLoginOptions) {
    this.builds =
      options.builds ??
      new FarBuilds({
        own: () => options.appBundle(),
        published: null,
        chip: thisDeviceSystem().chip ?? null,
      });
  }

  /** Adds the Mac at `text` as a computer that runs work; answers it on the list, or rejects with the refusal or the question. */
  async add(text: string, options: Partial<RemoteLoginAddOptions> = {}): Promise<DeviceView> {
    const answer = await this.addOrAsk(text, options);
    if ("asks" in answer)
      throw new Error(
        answer.asks === "confirm"
          ? remoteLoginWords.confirmQuestion(answer.address)[0]
          : answer.asks === "password"
            ? remoteLoginWords.passwordQuestion(answer.address)[0]
            : remoteLoginWords.leaveQuestion(answer)[0],
      );
    return answer;
  }

  /**
   * Add it, as the captain's click asks it: the computer on the list, the
   * question when that user runs another Firstmate's work and the captain
   * has not agreed to `leave` it, or a rejection with the refusal.
   */
  async addOrAsk(
    text: string,
    options: Partial<RemoteLoginAddOptions> = {},
  ): Promise<RemoteLoginAddAnswer> {
    const address = parseRemoteLoginAddress(text);
    if (!address)
      throw new Error(
        `That is not an address to reach a ${COMPUTER.one} at, such as sam@mini.local.`,
      );
    return this.once(address, address, async () => {
      const { pairing } = this.options;
      const step = this.stepper(address, "add");
      if (!this.builds.canSendAny()) return step.refuse("cannot-send");
      const gated = await this.confirmHost(address, options.confirm);
      if ("asks" in gated) return gated;
      if ("refusal" in gated)
        return step.refuse(gated.refusal, gated.reach ? { reach: gated.reach } : {});
      step.say("reaching", remoteLoginWords.reaching(address));
      // Whether that Mac is this one is this Mac's own finding, bound to the
      // link it makes, never where the device later dials from.
      let here: LocalityChallenge;
      try {
        here = (this.options.here ?? placeLocalityChallenge)();
      } catch {
        return step.refuse("failed");
      }
      let look: Awaited<ReturnType<RemoteLogin["look"]>>;
      try {
        look = await this.look(address, here.path);
        // That Mac did not let the captain's key in: its user's password,
        // asked once, lets Firstmate's own key in, and the look runs again.
        if ("refusal" in look && look.refusal === "key-refused") {
          const methods = look.methods ?? null;
          if (methods?.length === 0) return step.refuse("password-off");
          const user = await signInUser(this.options.ssh, address);
          const asked = { asks: "password" as const, address, ...(user ? { user } : {}) };
          if (!options.password) return asked;
          const letIn = await this.letIn(address, methods, options.password, step);
          if (letIn === "wrong") return { ...asked, wrong: true };
          look = await this.look(address, here.path);
          if ("refusal" in look && look.refusal === "key-refused")
            return step.refuse("key-not-taken");
        }
      } finally {
        here.dispose();
      }
      if ("refusal" in look)
        return step.refuse(
          look.refusal,
          look.refusal === "unreachable" ? { reach: await this.signInReach(address) } : {},
        );
      // That computer's system decides how it is set up, and which Firstmate it gets.
      const far = farSystemOf(look.os);
      const chip = far?.chips[look.arch ?? ""];
      if (!far || !chip) return step.refuse("other-system");
      // Ubuntu 24.04 and 26.04 get the package when this home can read the
      // tap. A home with no published builds, including the tests, keeps the
      // AppImage way. The package brings the tools and keeps the sandbox on.
      const packageRelease = this.builds.readsPublished() ? ubuntuPackageRelease(look) : null;
      if (!packageRelease) {
        if (look.needs.length > 0)
          return step.refuse("needs-tools", {
            name: look.name ?? address,
            missing: look.needs,
            installs: look.installs,
          });
        // Its work's web pages and cards run in Chromium's sandbox, or not at all
        // (docs/linux-packages.md, "The sandbox").
        if (look.sandboxOff) return step.refuse("sandbox-off", { name: look.name ?? address });
        if (!this.builds.canSend(far, chip)) return step.refuse("cannot-send");
      }
      const locality = here.localityOf(look.here);
      // That user runs work for a Firstmate already: this one's, it is found
      // again where this Mac is now; another's is asked about once, and one
      // whose key its grant does not say is refused.
      let found: DeviceView | undefined;
      let leave = false;
      if (look.joined && look.home !== pairing.identity().pin) {
        if (!look.home) return step.refuse("already-joined");
        if (!options.leave)
          return { asks: "leave", address, ...(look.name ? { name: look.name } : {}) };
        leave = true;
      } else if (look.joined) {
        found = pairing.list().find((entry) => entry.id === look.device);
        if (found && this.options.inReach?.(found.id))
          return step.refuse("in-reach", { name: deviceLabel(found) });
      } else if (look.windowHome === pairing.identity().pin) {
        // Its window joined this Firstmate as that Mac, and its work never
        // kept the grant: the join there takes the window's, so this finishes
        // that same entry (docs/devices.md, "One computer, one entry").
        found = pairing
          .list()
          .find((entry) => entry.id === look.windowDevice && entry.kind === "mac");
      }
      const name = found ? deviceLabel(found) : (look.name ?? address);
      if (found) step.say("finding", remoteLoginWords.finding(found), { name, deviceId: found.id });
      else
        step.say("setting-up", remoteLoginWords.settingUp(name), {
          name,
          copy: { state: "preparing" },
        });
      const setUp = () =>
        this.setUp({
          address,
          far,
          chip,
          locality,
          name,
          step,
          leave,
          stage: found ? "finding" : "setting-up",
          ...(found ? { deviceId: found.id } : {}),
          ...(packageRelease ? { package: look } : {}),
          ...(options.password ? { password: options.password } : {}),
        });
      const { connections } = this.options;
      // Its connection, if this Mac keeps one, waits while it is set up again.
      if (!connections) return setUp();
      return found ? connections.hold(found.id, setUp) : connections.settingUp(setUp);
    });
  }

  /**
   * Asks the Infinitary open on the computer at `text` for a one-use link
   * for this computer (docs/view.md, "Joining by its address"), as this
   * app's first launch joins it: the key line first, then a sign-in with the
   * captain's own SSH, or the password asked once to let Infinitary's own key
   * in, then the one fixed command (`COMPUTER_LINK_COMMAND`). Nothing is
   * written to the feed, and nothing is installed or started there. The link
   * comes back only to the program that asked, never a page: the main
   * process, or beside a command its window started, the command's program,
   * which answers it over the local door to the window's own program. It
   * comes with the host the captain's SSH resolved the address to, which the
   * join dials first; a link this app made for itself is refused.
   */
  async linkAt(text: string, options: JoinAtOptions = {}): Promise<LinkAtAnswer> {
    const address = parseRemoteLoginAddress(text);
    if (!address) return { refused: "not-an-address" };
    return this.once(address, address, async () => {
      const step = this.stepper(address, "add", undefined, true);
      try {
        const gated = await this.confirmHost(address, options.confirm);
        if ("asks" in gated) return gated;
        if ("refusal" in gated) return { refused: gated.refusal };
        let asked = await this.askLink(address);
        if ("refusal" in asked && asked.refusal === "key-refused") {
          const methods = asked.methods ?? null;
          if (methods?.length === 0) return { refused: "password-off" };
          // Windows' own ssh takes no password from Infinitary yet: only
          // the person's own key signs in from a Windows PC.
          if (hostPlatform() === "win32") return { refused: "key-refused" };
          const user = await signInUser(this.options.ssh, address);
          const question = { asks: "password" as const, address, ...(user ? { user } : {}) };
          if (!options.password) return question;
          const letIn = await this.letIn(address, methods, options.password, step);
          if (letIn === "wrong") return { ...question, wrong: true };
          asked = await this.askLink(address);
          if ("refusal" in asked && asked.refusal === "key-refused")
            return { refused: "key-not-taken" };
        }
        if ("refusal" in asked) return { refused: asked.refusal };
        if ("none" in asked) return { refused: linkNoneRefusal(asked.none) };
        let key: string;
        try {
          key = parsePairingLink(asked.link).key;
        } catch {
          return { refused: "no-link" };
        }
        if (key === this.options.pairing.identity().pin) return { refused: "self" };
        const where = await resolveDestination(this.options.ssh, address);
        return { link: asked.link, host: where?.host ?? null };
      } catch (error) {
        if (error instanceof RemoteLoginRefusedError) return { refused: error.refusal };
        throw error;
      }
    });
  }

  /** One run of the fixed command there: its answer, or why SSH did not sign in. */
  private async askLink(
    address: string,
  ): Promise<
    | ReturnType<typeof readComputerLinkAnswer>
    | { refusal: RemoteLoginRefusal; methods?: PasswordMethod[] | null }
  > {
    const ran = await runSsh({
      ...this.sshFor(address),
      command: COMPUTER_LINK_COMMAND,
      timeoutMs: this.options.lookTimeoutMs ?? LOOK_TIMEOUT_MS,
    });
    if (ran.code === SSH_FAILED) {
      const refusal = sshRefusal(ran.stderr);
      return refusal === "key-refused"
        ? { refusal, methods: passwordMethods(ran.stderr) }
        : { refusal };
    }
    return readComputerLinkAnswer(ran.stdout);
  }

  /**
   * Updates a computer over Remote Login to this Mac's
   * version: the copy is sent and started as `work update`, which checks it
   * runs work for this home as that computer, stops the running one, keeps
   * the new copy in place of the old, and starts it again. This Mac's SSH
   * connection to it waits while it is updated, and is made again after, to
   * the new copy. `pause` runs once the update goes ahead, before anything
   * there stops: past every refusal here and the password question.
   */
  async update(
    deviceId: string,
    options: RemoteLoginUpdateOptions & { pause?: () => Promise<void> } = {},
  ): Promise<DeviceView | RemoteLoginPasswordQuestion | RemoteLoginConfirmQuestion> {
    const device = this.device(deviceId);
    const oneTime = !device.remoteLogin && options.address !== undefined;
    const address = device.remoteLogin ?? parseRemoteLoginAddress(options.address ?? "");
    if (!address) throw new Error(`${deviceLabel(device)} could not be reached at that address.`);
    return this.once(deviceId, deviceLabel(device), () =>
      this.holding(deviceId, async () => {
        const step = this.stepper(address, "update", device);
        if (!this.builds.canSendAny()) return step.refuse("cannot-send");
        if (oneTime) {
          // A join link does not grant Remote Login. Ask for a verified host
          // before signing in, and check the joined folder before installing.
          const gated = await this.confirmHost(address, options.confirm);
          if ("asks" in gated) return gated;
          if ("refusal" in gated) return step.refuse(gated.refusal);
          const look = await this.look(address, "");
          if ("refusal" in look) return step.refuse(look.refusal);
          if (!look.joined) return step.packageAddressRefused();
          if (look.home !== this.options.pairing.identity().pin)
            return step.refuse("already-joined");
          if (look.device !== deviceId) return step.refuse("another-computer");
          // Do not switch an AppImage worker to the package in this path.
          if (
            farSystemOf(look.os)?.chips[look.arch ?? ""] !== "x64" ||
            !ubuntuPackageRelease(look) ||
            !look.pkg ||
            look.keptAppImage
          )
            return step.packageAddressRefused();
          step.say("updating", remoteLoginWords.updating(device), { deviceId });
          const outcome = await this.updateUbuntu(device, look, options, step, address, true);
          if (!("asks" in outcome))
            this.options.pairing.rememberPackageUpdateAddress(deviceId, address);
          return outcome;
        }
        const changed = await this.changedKey(address);
        if (changed) return step.refuse(changed);
        step.say("updating", remoteLoginWords.updating(device), { deviceId });
        // The system it said in its hello; one that never said is asked there.
        let far = device.system ? farSystemNamed(device.system) : null;
        let chip = far ? (device.chip ?? Object.values(far.chips)[0]) : undefined;
        if (!device.system) {
          const look = await this.look(address, "");
          if ("refusal" in look) return step.refuse(look.refusal);
          far = farSystemOf(look.os);
          chip = far?.chips[look.arch ?? ""];
        }
        if (!far || !chip) return step.refuse("other-system");
        if (far.system === "linux" && this.builds.readsPublished()) {
          const looked = await this.look(address, "");
          if ("refusal" in looked) return step.refuse(looked.refusal);
          if (ubuntuPackageRelease(looked)) return this.updateUbuntu(device, looked, options, step);
        }
        if (!this.builds.canSend(far, chip)) return step.refuse("cannot-send");
        await options.pause?.();
        const name = deviceLabel(device);
        const download = device.onThisMac ? null : await this.builds.downloadFor(far, chip);
        const idleTimeoutMs = this.options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
        let ran: Awaited<ReturnType<typeof runSsh>> | undefined;
        let starting = false;
        const start = () => {
          starting = true;
          step.say("updating", remoteLoginWords.starting(name), {
            deviceId,
            copy: { state: "starting" },
          });
        };
        const backstopMs = this.options.sendTimeoutMs ?? SEND_TIMEOUT_MS;
        if (download) {
          let install: () => void = () => {};
          const observe = this.downloadProgress(name, step, "updating", { deviceId });
          ran = await runSsh({
            ...this.sshFor(address),
            command: [
              "/bin/sh",
              "-c",
              MAC_DOWNLOAD_UPDATE,
              "infinitary",
              ...this.expected(deviceId),
              onHomeMacWord(device),
              download.sha256,
              download.url,
            ],
            idleTimeoutMs,
            timeoutMs: backstopMs,
            stdin: async (sink) => {
              install = () => {
                sink.write(`${DOWNLOAD_INSTALL}\n`);
              };
              await new Promise<void>((resolve) => sink.once("close", resolve));
            },
            onLine: (line, activity) => {
              if (line === DOWNLOAD_FETCHED) {
                activity.end();
                return false;
              }
              if (line === DOWNLOAD_READY && !starting) {
                // Decide before sending the acknowledgement: a lost reply
                // must never retry an update that may already have started.
                activity.end();
                start();
                install();
                return true;
              }
              return observe(line);
            },
          });
          // Only a fetch/check/unpack failure retries. Never repeat work update.
          if (!starting && (ran.stopped || [6, 7, 8].includes(ran.code ?? -1))) {
            step.say("updating", remoteLoginWords.downloadFallback(name, ran.code === 7), {
              deviceId,
              copy: { state: "preparing" },
            });
            ran = undefined;
          }
        }
        if (!ran) {
          if (this.builds.fetches(far, chip))
            step.say("updating", remoteLoginWords.gettingBuild(name), {
              deviceId,
              copy: { state: "preparing" },
            });
          const build = await this.builds.for(far, chip);
          if ("refusal" in build) return step.refuse(build.refusal);
          const script = far.update[build.form];
          if (!script) return step.refuse("failed");
          const run = { id: `copy-${randomUUID()}` };
          const copy = copyCount((sent) => {
            if (far.system === "macos")
              step.say("updating", remoteLoginWords.sendingRow(name, sent), {
                deviceId,
                copy: { state: "sending", sent },
                run,
              });
          }, this.options.copyEveryMs ?? COPY_EVERY_MS);
          ran = await runSsh({
            ...this.sshFor(address),
            command: [
              "/bin/sh",
              "-c",
              script,
              "firstmate",
              ...this.expected(deviceId),
              onHomeMacWord(device),
              ...(build.form === "bundle" ? [] : [build.sha256]),
            ],
            stdin: async (sink, activity) => {
              await sendCopy(build, sink, (bytes) => {
                activity();
                copy.add(bytes);
              });
              copy.end();
              activity.end();
            },
            onLine: (line, activity) => {
              if (line === UPDATE_STARTING && !starting) {
                activity.end();
                start();
              }
              return false;
            },
            ...(far.system === "macos"
              ? { idleTimeoutMs, timeoutMs: backstopMs }
              : { timeoutMs: backstopMs }),
          });
          copy.end();
          // Stopped before it started there: what stopped it, never what SSH answered after.
          if (ran.stopped && !starting) return step.stopped(name, ran.stopped);
        }
        const outcome = readWorkOutcome(ran.stdout);
        if (outcome?.firstmate === "updated") {
          if (outcome.background === "unavailable" || outcome.background === "unknown") {
            this.options.pairing.noteSystem(deviceId, { automaticStartup: outcome.background });
            step.caution([remoteLoginWords.startup(device, outcome.background)], { deviceId });
          }
          step.say("done", remoteLoginWords.updated(device, outcome.background), { deviceId });
          if (outcome.background === "failed")
            step.caution(remoteLoginWords.notInBackground(device, "update"), { deviceId });
          return this.device(deviceId);
        }
        if (outcome?.firstmate === "refused")
          return step.refuse(
            outcome.reason === "not-joined"
              ? "not-set-up"
              : outcome.reason === "busy"
                ? "busy"
                : outcome.reason === "other-home"
                  ? "already-joined"
                  : "failed",
          );
        if (starting) return step.uncertain(name);
        if (ran.code === SSH_FAILED) return step.refuse(sshRefusal(ran.stderr));
        return step.refuse("failed");
      }),
    );
  }

  /**
   * Removes what Firstmate set up on a computer added by its address, over
   * Remote Login, for Remove now while it is out of reach of the connection
   * (docs/devices.md, "Remove"): `work remove` there checks it runs work for
   * this home as that computer, stops its run, lets the home go and removes
   * what Firstmate set up, keeping a working copy that holds unmerged work.
   * Answers whether nothing is left there for the computer to hear; a
   * refusal is said, never thrown, so the removal goes on: a computer this
   * Mac reaches over its own SSH is tried again later
   * (`DevicePairing.sshCleanups`), and any other removes it itself once it
   * is back. One that could not remove all of it yet has let the home go,
   * and tries again itself at its user's next login. A folder there that is
   * another home's or another computer's, or holds nothing, is touched by
   * nothing and said to have had nothing of this home's to remove.
   */
  async removeThere(device: DeviceView): Promise<boolean> {
    const address = device.remoteLogin;
    if (!address) return false;
    const step = this.stepper(address, "remove", device);
    step.say("removing", remoteLoginWords.removing(device), { deviceId: device.id });
    const outcome = await this.removeOver(address, device.id);
    if (outcome === "unremoved") {
      step.caution(remoteLoginWords.notAllRemovedThere(device, 0), { deviceId: device.id });
      return true;
    }
    if (outcome === "nothing") {
      step.say("done", remoteLoginWords.nothingThere(device), { deviceId: device.id });
      return true;
    }
    if (typeof outcome === "number") {
      step.say("done", remoteLoginWords.removedThere(device, outcome), { deviceId: device.id });
      return true;
    }
    step.warn("failed");
    return false;
  }

  /**
   * The removal waiting on a computer this Mac reaches over its own SSH and
   * removed (`SshConnections`): tried again quietly until it works, and said
   * once only when it removed something there - a computer that heard it was
   * removed has removed it itself - or `done` with nothing said when what is
   * there is another home's or another computer's, which is never touched.
   */
  async cleanUpThere(cleanup: SshCleanup): Promise<"done" | "failed"> {
    const outcome = await this.removeOver(cleanup.address, cleanup.deviceId);
    if (outcome === "failed") return "failed";
    const named = { name: cleanup.name };
    const say = (text: string, tone: "info" | "warn") =>
      this.options.emit({
        type: "device_setup",
        address: cleanup.address,
        doing: "remove",
        stage: "done",
        text,
        tone,
        name: cleanup.name,
        deviceId: cleanup.deviceId,
      });
    if (outcome === "unremoved")
      for (const text of remoteLoginWords.notAllRemovedThere(named, 0)) say(text, "warn");
    else if (typeof outcome === "number")
      say(remoteLoginWords.removedThere(named, outcome), "info");
    return "done";
  }

  /**
   * Change address (docs/devices.md, "Changing its address"): this Mac
   * reaches a computer it reaches over its own SSH at `text` from now on,
   * once one look there finds that same computer - a Mac whose Firstmate
   * runs work for this home with this computer's id. Anything else changes
   * nothing: another home's, another computer's, none, or a Mac this Mac
   * cannot reach. Its connection waits while it is looked at, and is made
   * again at the new address.
   */
  async changeAddress(deviceId: string, text: string): Promise<DeviceView> {
    const address = parseRemoteLoginAddress(text);
    if (!address)
      throw new Error(
        `That is not an address to reach a ${COMPUTER.one} at, such as sam@mini.local.`,
      );
    const device = this.device(deviceId);
    if (!device.remoteLogin)
      throw new Error(`${deviceLabel(device)} was not added by its address.`);
    return this.once(deviceId, deviceLabel(device), () =>
      this.holding(deviceId, async () => {
        const step = this.stepper(address, "address", device);
        const changed = await this.changedKey(address);
        if (changed) return step.refuse(changed);
        step.say("reaching", remoteLoginWords.reaching(address), { deviceId });
        const look = await this.look(address, "");
        if ("refusal" in look) return step.refuse(look.refusal);
        if (!farSystemOf(look.os)) return step.refuse("other-system");
        if (!look.joined) return step.refuse("not-set-up");
        if (look.home !== this.options.pairing.identity().pin) return step.refuse("already-joined");
        if (look.device !== deviceId) return step.refuse("another-computer");
        const moved = this.options.pairing.setSshAddress(deviceId, address);
        step.say("done", sshConnectionWords.addressChanged(device, address), { deviceId });
        return moved;
      }),
    );
  }

  // ---- inside -------------------------------------------------------------------

  /**
   * Sets Firstmate up there over one SSH connection this Mac owns
   * (`SshMaster`): its own session runs its system's bootstrap
   * (`FarSystem.setup`), which makes
   * the join's private socket and a folder for the copy; this Mac forwards
   * that socket to its own loopback listener; the copy goes in a session of
   * its own; then the link and the socket go to the join on its input, and
   * the join dials this Mac through the socket alone. A link nobody used is
   * closed whatever happened, and both folders there are deleted.
   */
  private async setUp(at: {
    address: string;
    /** That computer's system, and the chip the look found there. */
    far: FarSystem;
    chip: DeviceChip;
    locality: Locality;
    name: string;
    step: ReturnType<RemoteLogin["stepper"]>;
    /** The captain agreed to leave the other Firstmate that user runs work for. */
    leave: boolean;
    /** Set up anew, or a computer on the list found again, which the copy's lines name. */
    stage: "setting-up" | "finding";
    deviceId?: string;
    /** The look, when this computer gets the Ubuntu package instead of an AppImage. */
    package?: Look;
    /** That account's password, typed once on this call. Zeroed before this returns. */
    password?: string;
  }): Promise<RemoteLoginAddAnswer> {
    const { pairing } = this.options;
    const { address, name, step } = at;
    const secret = at.password ? Buffer.from(at.password, "utf8") : null;
    try {
      // The install put the package there but could not keep the work on after logout.
      let lingersNot = false;
      if (at.package) {
        const installed = await this.installUbuntu(at.package, {
          address,
          name,
          step,
          secret,
          stage: at.stage,
          ...(at.deviceId ? { deviceId: at.deviceId } : {}),
        });
        if (installed !== "ready" && installed !== "linger-off") return installed;
        lingersNot = installed === "linger-off";
      }
      const said = (copy: RemoteLoginCopy, run?: { id: string }) => ({
        name,
        ...(at.deviceId ? { deviceId: at.deviceId } : {}),
        copy,
        ...(run ? { run } : {}),
      });
      // Its Firstmate first: this app's own for its own system, or the one
      // published for that system, got and checked before any link exists.
      // An Ubuntu package was installed above; the join runs that program.
      const download =
        !at.package && at.locality !== "this-mac"
          ? await this.builds.downloadFor(at.far, at.chip)
          : null;
      let build: FarBuild | null = null;
      if (!at.package && !download) {
        if (this.builds.fetches(at.far, at.chip))
          step.say(at.stage, remoteLoginWords.gettingBuild(name), said({ state: "preparing" }));
        const got = await this.builds.for(at.far, at.chip);
        if ("refusal" in got) return step.refuse(got.refusal, { name });
        build = got;
      }
      let unpack = build ? at.far.unpack[build.form] : null;
      if (!at.package && !download && !unpack) return step.refuse("failed", { name });
      // A Mac, unless the look found this Mac itself: then another user here.
      const invite = pairing.invite(
        { kind: "mac" },
        { remoteLogin: address, via: "ssh", locality: at.locality },
      );
      let master: SshMaster | null = null;
      try {
        await this.options.listening();
        const heard = new Map<string, string>();
        let staged: () => void = () => {};
        const bootstrapped = new Promise<void>((resolve) => {
          staged = resolve;
        });
        const trusted = this.options.pairing.sshOptions(address);
        master = new SshMaster({
          ssh: this.options.ssh,
          address,
          ...(trusted ? { options: trusted } : {}),
          command: ["/bin/sh", "-c", at.package ? PACKAGE_SETUP : at.far.setup, "firstmate"],
          onLine: (line) => {
            const match = /^infinitary:(socket|stage)=(.*)$/.exec(line.trim());
            if (!match?.[1] || heard.has(match[1]) || !REMOTE_PATH.test(match[2] ?? "")) return;
            heard.set(match[1], match[2] ?? "");
            if (heard.has("socket") && (at.package || heard.has("stage"))) staged();
          },
          ...(this.options.controlBase ? { controlBase: this.options.controlBase } : {}),
        });
        const opened = master;
        const mac = at.far.system === "macos";
        const idleTimeoutMs = this.options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
        const backstopMs = this.options.sendTimeoutMs ?? SEND_TIMEOUT_MS;
        let backstop: ReturnType<typeof setTimeout> | undefined;
        // The time limit stopped it: said as that, never as what SSH answered after.
        let timedOut = false;
        // A connection lost after the sign-in is said as lost while sending.
        const refuse = (refusal: RemoteLoginRefusal, reach?: RemoteLoginReach): never =>
          timedOut
            ? step.stopped(name, "timeout")
            : step.refuse(refusal, {
                name,
                ...(refusal === "unreachable" && reach ? { reach } : {}),
              });
        const clearBackstop = () => {
          if (backstop) clearTimeout(backstop);
        };
        const startBackstop = () => {
          clearBackstop();
          backstop = setTimeout(() => {
            timedOut = true;
            void opened.stop();
          }, backstopMs);
          backstop.unref();
        };
        startBackstop();
        try {
          const ready = await Promise.race([
            bootstrapped.then(() => true),
            master.exited.then(() => false),
          ]);
          const socket = heard.get("socket") ?? "";
          const stage = heard.get("stage") ?? "";
          if (!ready) {
            const ran = await master.exited;
            return refuse(ran.code === SSH_FAILED ? sshRefusal(ran.stderr) : "failed", {
              step: "sign-in",
            });
          }
          if (!(await master.forward(socket, pairing.port))) {
            const alive = master.alive();
            await master.stop();
            return refuse(alive ? "forwarding-refused" : "unreachable", { step: "send" });
          }
          // The bytes sent so far, said as they move, each count in place of the one before.
          const run = { id: `copy-${randomUUID()}` };
          const copy = copyCount(
            (bytes) =>
              step.say(
                at.stage,
                remoteLoginWords.sending(name, bytes),
                said({ state: "sending", sent: bytes }, run),
              ),
            this.options.copyEveryMs ?? COPY_EVERY_MS,
          );
          let downloaded = false;
          if (download) {
            clearBackstop();
            const observe = this.downloadProgress(
              name,
              step,
              at.stage,
              at.deviceId ? { deviceId: at.deviceId } : {},
            );
            const got = await master.session(
              ["/bin/sh", "-c", MAC_DOWNLOAD, "infinitary", stage, download.sha256, download.url],
              undefined,
              backstopMs,
              {
                idleTimeoutMs,
                onLine: (line, activity) => {
                  if (line === DOWNLOAD_FETCHED) {
                    activity.end();
                    return false;
                  }
                  return observe(line);
                },
              },
            );
            startBackstop();
            downloaded = got.code === 0 && !got.stopped;
            if (!downloaded) {
              if (!master.alive()) return refuse("unreachable", { step: "send" });
              step.say(
                at.stage,
                remoteLoginWords.downloadFallback(name, got.code === 7),
                said({ state: "preparing" }),
              );
              if (this.builds.fetches(at.far, at.chip))
                step.say(
                  at.stage,
                  remoteLoginWords.gettingBuild(name),
                  said({ state: "preparing" }),
                );
              const gotBuild = await Promise.race([
                this.builds.for(at.far, at.chip),
                master.exited.then(() => ({ refusal: "failed" as const })),
              ]);
              if ("refusal" in gotBuild) return refuse(gotBuild.refusal);
              build = gotBuild;
              unpack = at.far.unpack[build.form] ?? null;
            }
          }
          if (!at.package && !downloaded && build && unpack) {
            const sendingBuild = build;
            if (mac) clearBackstop();
            const sent = await master.session(
              [
                "/bin/sh",
                "-c",
                unpack,
                "firstmate",
                stage,
                ...(build.form === "bundle" ? [] : [build.sha256]),
              ],
              async (sink, activity) => {
                await sendCopy(sendingBuild, sink, (bytes) => {
                  activity();
                  copy.add(bytes);
                });
                copy.end();
                activity.end();
              },
              mac ? backstopMs : undefined,
              mac ? { idleTimeoutMs } : {},
            );
            if (mac) startBackstop();
            if (sent.stopped) return step.stopped(name, sent.stopped);
            if (sent.code !== 0) {
              await master.stop();
              return refuse(sent.code === SSH_FAILED ? "unreachable" : "failed", { step: "send" });
            }
            copy.end();
          }
          if (mac) startBackstop();
          step.say(at.stage, remoteLoginWords.starting(name), said({ state: "starting" }));
          master.write(
            sshMessageLine({
              firstmate: "join",
              v: SSH_MESSAGE_VERSION,
              link: invite.link,
              socket,
              ...(at.leave ? { leave: true as const } : {}),
            }),
          );
          const ran = await master.exited;
          const outcome = readWorkOutcome(ran.stdout);
          const deviceId = pairing.claimedBy(invite.id);
          const device = deviceId
            ? pairing.list().find((entry) => entry.id === deviceId)
            : undefined;
          if (device) {
            // It left the other Firstmate first: said once, and what it could not remove there.
            if (outcome?.firstmate === "joined" && outcome.left) {
              const [left, ...unremoved] = remoteLoginWords.leftOther(device, outcome.left);
              if (left) step.say("done", left, { name, deviceId: device.id });
              step.caution(unremoved, { name, deviceId: device.id });
            }
            if (
              outcome?.firstmate === "joined" &&
              (outcome.background === "unavailable" || outcome.background === "unknown")
            ) {
              pairing.noteSystem(device.id, { automaticStartup: outcome.background });
              step.caution([remoteLoginWords.startup(device, outcome.background)], {
                name,
                deviceId: device.id,
              });
            }
            if (outcome?.firstmate === "joined" && outcome.background === "at-login")
              step.say("done", remoteLoginWords.atLogin(device), { name, deviceId: device.id });
            if (outcome?.firstmate === "joined" && outcome.background === "failed")
              step.caution(remoteLoginWords.notInBackground(device, "add"), {
                name,
                deviceId: device.id,
              });
            if (lingersNot && outcome?.firstmate === "joined")
              step.caution(
                afterLogoutLines(device, device.user ?? at.package?.user, outcome.background),
                { name, deviceId: device.id },
              );
            return device;
          }
          if (outcome?.firstmate === "refused") {
            const refusal = joinRefusal(outcome.reason);
            // The other Firstmate answered there after all, so it stays.
            return step.refuse(
              at.leave && refusal === "already-joined" ? "still-answers" : refusal,
              {
                name,
              },
            );
          }
          if (ran.code === SSH_FAILED) return refuse(sshRefusal(ran.stderr));
          return refuse("failed");
        } finally {
          clearBackstop();
        }
      } finally {
        await master?.stop();
        // A link nobody used goes at once.
        pairing.stop(invite.id);
      }
    } finally {
      secret?.fill(0);
    }
  }

  /**
   * One removal over SSH, checked there to be this home's and that
   * computer's: how many working copies it kept for their unmerged work,
   * `unremoved` when it could not remove all yet, `nothing` when nothing of
   * this home's was there to remove, or `failed`.
   */
  private async removeOver(
    address: string,
    deviceId: string,
  ): Promise<number | "unremoved" | "nothing" | "failed"> {
    const changed = await this.changedKey(address);
    if (changed) return "failed";
    const ran = await runSsh({
      ...this.sshFor(address),
      command: ["/bin/sh", "-c", REMOVE, "firstmate", ...this.folder(), ...this.expected(deviceId)],
      timeoutMs: this.options.lookTimeoutMs ?? LOOK_TIMEOUT_MS,
    });
    const outcome = readWorkOutcome(ran.stdout);
    if (outcome?.firstmate === "removed")
      return outcome.unremoved?.length ? "unremoved" : outcome.kept.length;
    if (
      outcome?.firstmate === "refused" &&
      (outcome.reason === "not-joined" || outcome.reason === "other-home")
    )
      return "nothing";
    return "failed";
  }

  /** The home's pin and the computer's id, which the work mode there checks first. */
  private expected(deviceId: string): [string, string] {
    return [this.options.pairing.identity().pin, deviceId];
  }

  /** Runs `operation` with this Mac's SSH connection to the computer held, when it keeps one. */
  private holding<T>(deviceId: string, operation: () => Promise<T>): Promise<T> {
    return this.options.connections
      ? this.options.connections.hold(deviceId, operation)
      : operation();
  }

  /**
   * Installs the Ubuntu package when it is missing or another version, with
   * the password on `sudo -S`'s input. `ready` once the package matches, or
   * `linger-off` once this install put it there but could not let that
   * user's work keep running after they log out (`LINGER_OFF_LINE`).
   * A password that did not work is asked again; it is not logged.
   */
  private async installUbuntu(
    look: Look,
    at: {
      address: string;
      name: string;
      step: ReturnType<RemoteLogin["stepper"]>;
      secret: Buffer | null;
      stage: "setting-up" | "finding" | "updating";
      deviceId?: string;
    },
  ): Promise<RemoteLoginAddAnswer | UbuntuReady> {
    const need = ubuntuInstallNeed(look, this.options.version ?? "");
    if (need === "ready") return "ready";
    if (need === "refused") return at.step.refuse("cannot-install", { name: at.name });
    if (need === "ask" && !at.secret) {
      return {
        asks: "password",
        address: at.address,
        ...(look.user ? { user: look.user } : {}),
        for: at.stage === "updating" ? "update" : "install",
        ...(at.deviceId ? { deviceId: at.deviceId } : {}),
      };
    }
    const said = {
      name: at.name,
      ...(at.deviceId ? { deviceId: at.deviceId } : {}),
      copy: { state: "preparing" as const },
    };
    at.step.say(
      at.stage === "updating" ? "updating" : at.stage,
      remoteLoginWords.gettingBuild(at.name),
      said,
    );
    const linux = farSystemOf("Linux");
    if (!linux) return at.step.refuse("other-system", { name: at.name });
    const build = await this.builds.for(linux, "x64", "deb");
    if ("refusal" in build) return at.step.refuse(build.refusal, { name: at.name });
    if (build.form === "bundle") return at.step.refuse("failed", { name: at.name });
    const sent = await this.sendDeb(at.address, build, at);
    if (sent === "stopped") return at.step.stopped(at.name, "timeout");
    if (sent === "failed") return at.step.refuse("failed", { name: at.name });
    at.step.say(
      at.stage === "updating" ? "updating" : at.stage,
      remoteLoginWords.installing(at.name),
      { name: at.name, ...(at.deviceId ? { deviceId: at.deviceId } : {}) },
    );
    const outcome = await this.runInstall(
      at.address,
      sent,
      build.sha256,
      need === "ask" ? at.secret : null,
    );
    if (outcome === "wrong") {
      at.step.warn("password-wrong");
      return {
        asks: "password",
        address: at.address,
        ...(look.user ? { user: look.user } : {}),
        wrong: true,
        for: at.stage === "updating" ? "update" : "install",
        ...(at.deviceId ? { deviceId: at.deviceId } : {}),
      };
    }
    if (outcome === "mismatch") return at.step.refuse("build-unverified", { name: at.name });
    // Stopped while the installer ran: it may already have installed it.
    if (outcome === "stopped")
      return at.stage === "updating"
        ? at.step.uncertain(at.name)
        : at.step.stopped(at.name, "timeout");
    if (outcome === "linger-off") return "linger-off";
    if (outcome !== "ok") return at.step.refuse("failed", { name: at.name });
    return "ready";
  }

  /** Sends the checked deb and answers the path it was kept at, `stopped` by the time limit, or `failed`. */
  private async sendDeb(
    address: string,
    build: Exclude<FarBuild, { form: "bundle" }>,
    at: {
      name: string;
      step: ReturnType<RemoteLogin["stepper"]>;
      stage: RemoteLoginStage;
      deviceId?: string;
    },
  ): Promise<string | "stopped" | "failed"> {
    const run = { id: `copy-${randomUUID()}` };
    const copy = copyCount(
      (bytes) =>
        at.step.say(
          at.stage === "updating" ? "updating" : at.stage,
          remoteLoginWords.sending(at.name, bytes),
          {
            name: at.name,
            ...(at.deviceId ? { deviceId: at.deviceId } : {}),
            copy: { state: "sending", sent: bytes },
            run,
          },
        ),
      this.options.copyEveryMs ?? COPY_EVERY_MS,
    );
    const ran = await runSsh({
      ...this.sshFor(address),
      command: ["/bin/sh", "-c", RECEIVE_DEB, "firstmate", build.sha256],
      stdin: (sink) => sendCopy(build, sink, copy.add),
      timeoutMs: this.options.sendTimeoutMs ?? SEND_TIMEOUT_MS,
    });
    copy.end();
    if (ran.stopped) return "stopped";
    const path = /^infinitary:deb=(\/\S+)$/m.exec(ran.stdout)?.[1] ?? "";
    if (ran.code !== 0 || !REMOTE_PATH.test(path)) return "failed";
    return path;
  }

  /**
   * Installs the deb already checked there. The password, when one is
   * needed, is written to `sudo -S` and then zeroed by the caller. stderr
   * is read only for sudo's own refusal, and is not logged; stdout only for
   * the line that says linger could not be turned on (`linger-off`).
   */
  private async runInstall(
    address: string,
    debPath: string,
    sha256: string,
    secret: Buffer | null,
  ): Promise<"ok" | "linger-off" | "wrong" | "mismatch" | "stopped" | "failed"> {
    const ran = await runSsh({
      ...this.sshFor(address),
      command: sudoInstallCommand(debPath, sha256, secret !== null),
      ...(secret ? { stdin: (sink: Writable) => writeSecret(secret, sink) } : {}),
      timeoutMs: this.options.sendTimeoutMs ?? SEND_TIMEOUT_MS,
    });
    if (ran.stopped) return "stopped";
    if (ran.code === 0) return lingerOff(ran.stdout) ? "linger-off" : "ok";
    if (ran.code === 65) return "mismatch";
    if (secret && sudoRejected(ran.stderr)) return "wrong";
    if (ran.code === SSH_FAILED) return "failed";
    return "failed";
  }

  /** Updates an Ubuntu package computer: the password again, then the new package, then a restart. */
  private async updateUbuntu(
    device: DeviceView,
    look: Look,
    options: { password?: string; pause?: () => Promise<void> },
    step: ReturnType<RemoteLogin["stepper"]>,
    address = device.remoteLogin ?? "",
    verifyReturn = false,
  ): Promise<DeviceView | RemoteLoginPasswordQuestion> {
    if (!verifyReturn && ubuntuInstallNeed(look, this.options.version ?? "") === "ready")
      return step.refuse("current");
    const secret = options.password ? Buffer.from(options.password, "utf8") : null;
    try {
      const installed = await this.installUbuntu(look, {
        address,
        name: deviceLabel(device),
        step,
        secret,
        stage: "updating",
        deviceId: device.id,
      });
      if (installed !== "ready" && installed !== "linger-off") {
        if ("asks" in installed && installed.asks === "password") return installed;
        return step.refuse("failed");
      }
      await options.pause?.();
      if (verifyReturn) {
        const name = deviceLabel(device);
        step.say("updating", remoteLoginWords.starting(name), {
          deviceId: device.id,
          name,
          copy: { state: "starting" },
        });
      }
      const onHomeMac = onHomeMacWord(device);
      const ran = await runSsh({
        ...this.sshFor(address),
        command: [
          UBUNTU_PACKAGE_BIN,
          "work",
          "update",
          "--from-home",
          "--home",
          this.options.pairing.identity().pin,
          "--device",
          device.id,
          ...(onHomeMac ? ["--on-home-mac", onHomeMac] : []),
        ],
        timeoutMs: this.options.sendTimeoutMs ?? SEND_TIMEOUT_MS,
      });
      const outcome = readWorkOutcome(ran.stdout);
      if (outcome?.firstmate === "updated") {
        if (outcome.background === "unavailable" || outcome.background === "unknown") {
          this.options.pairing.noteSystem(device.id, { automaticStartup: outcome.background });
          step.caution([remoteLoginWords.startup(device, outcome.background)], {
            deviceId: device.id,
          });
        }
        if (!verifyReturn)
          step.say("done", remoteLoginWords.updated(device, outcome.background), {
            deviceId: device.id,
          });
        if (outcome.background === "failed")
          step.caution(remoteLoginWords.notInBackground(device, "update"), { deviceId: device.id });
        if (installed === "linger-off")
          step.caution(afterLogoutLines(device, device.user ?? look.user, outcome.background), {
            deviceId: device.id,
          });
        return this.device(device.id);
      }
      // Stopped by the time limit while `work update` ran there: it may already have updated.
      if (ran.stopped) return step.uncertain(deviceLabel(device));
      if (ran.code === SSH_FAILED) return step.refuse(sshRefusal(ran.stderr));
      return step.refuse("failed");
    } finally {
      secret?.fill(0);
    }
  }

  /**
   * One look at the other Mac, reading what is at `here` there; nothing is
   * written there. A refused key says which password methods that Mac
   * offered (`passwordMethods`).
   */
  private async look(
    address: string,
    here: string,
  ): Promise<Look | { refusal: RemoteLoginRefusal; methods?: PasswordMethod[] | null }> {
    const ran = await runSsh({
      ...this.sshFor(address),
      command: ["/bin/sh", "-c", LOOK, "firstmate", ...this.folder(), here],
      timeoutMs: this.options.lookTimeoutMs ?? LOOK_TIMEOUT_MS,
    });
    if (ran.code === SSH_FAILED) {
      const refusal = sshRefusal(ran.stderr);
      return refusal === "key-refused"
        ? { refusal, methods: passwordMethods(ran.stderr) }
        : { refusal };
    }
    const said = new Map<string, string>();
    const needs: string[] = [];
    for (const line of ran.stdout.split("\n")) {
      const match = /^infinitary:([a-z0-9]+)=(.*)$/.exec(line.trim());
      // A library says its need once for each of its libraries there is none of.
      if (match?.[1] === "needs") {
        const need = match[2] ?? "";
        if (/^[a-z]{1,16}$/.test(need) && !needs.includes(need) && needs.length < 16)
          needs.push(need);
      } else if (match?.[1] && !said.has(match[1])) said.set(match[1], match[2] ?? "");
    }
    const os = said.get("os");
    if (ran.code !== 0 || os === undefined) return { refusal: "failed" };
    const uid = Number(said.get("uid"));
    const name = asDeviceName(said.get("name") ?? "");
    const home = said.get("home");
    const device = said.get("device");
    const windowHome = said.get("windowhome");
    const windowDevice = said.get("windowdevice");
    const read = said.get("here");
    const arch = said.get("arch");
    return {
      os,
      ...(arch ? { arch } : {}),
      needs,
      installs: {
        ...installerField(said.get("installer")),
        ...(said.get("t64") === "yes" ? { t64: true } : {}),
      },
      sandboxOff: said.get("sandbox") === "off",
      ...tokenField("distro", said.get("distro"), /^[a-z0-9._-]{1,32}$/),
      ...tokenField("release", said.get("release"), /^[0-9.]{1,16}$/),
      ...(pkgField(said.get("pkg")) ? { pkg: pkgField(said.get("pkg")) } : { pkg: "" }),
      ...sudoField(said.get("sudo")),
      ...(said.get("user") ? { user: said.get("user") } : {}),
      ...(Number.isInteger(uid) ? { uid } : {}),
      ...(name ? { name } : {}),
      joined: said.get("joined") === "yes",
      keptAppImage: said.get("keptappimage") === "yes",
      ...(home && KEY_TEXT_PATTERN.test(home) ? { home } : {}),
      ...(device && device.length <= 64 ? { device } : {}),
      ...(windowHome && KEY_TEXT_PATTERN.test(windowHome) ? { windowHome } : {}),
      ...(windowDevice && windowDevice.length <= 64 ? { windowDevice } : {}),
      ...(read ? { here: read } : {}),
    };
  }

  /**
   * Lets Firstmate's own key in there with that user's password, typed once,
   * only to the Mac whose check line is remembered (`placeOwnKey`). The
   * password is held as bytes for this one run and zeroed after it, whatever
   * happened. `wrong` is said in the feed and asked again; anything else
   * that stops it is the add's refusal.
   */
  private async letIn(
    address: string,
    methods: PasswordMethod[] | null,
    typed: string,
    step: ReturnType<RemoteLogin["stepper"]>,
  ): Promise<"placed" | "wrong"> {
    const password = Buffer.from(typed, "utf8");
    try {
      const trusted = this.options.pairing.hostTrustOptions(address);
      if (!trusted || !this.options.pairing.rememberedHost(address))
        return step.refuse("host-unknown");
      let key: Awaited<ReturnType<DevicePairing["ownSshKey"]>>;
      try {
        key = await this.options.pairing.ownSshKey();
      } catch {
        return step.refuse("failed");
      }
      step.say("reaching", remoteLoginWords.lettingIn(address));
      const outcome = await placeOwnKey({
        ssh: this.options.ssh,
        address,
        trusted,
        methods,
        publicLine: key.publicLine,
        password,
        timeoutMs: this.options.lookTimeoutMs ?? LOOK_TIMEOUT_MS,
      });
      if (outcome === "wrong") {
        step.warn("password-wrong");
        return "wrong";
      }
      if (outcome === "off") return step.refuse("password-off");
      if (outcome === "other-system") return step.refuse("other-system");
      if (outcome !== "placed") return step.refuse(outcome.refusal);
      try {
        this.options.pairing.ownKeyPlacedAt(address);
      } catch {
        return step.refuse("failed");
      }
      return "placed";
    } finally {
      password.fill(0);
    }
  }

  /**
   * Where a sign-in that could not reach `address` dialed: the port the
   * person's SSH settings resolve, unless a proxy stands in between.
   */
  private async signInReach(address: string): Promise<RemoteLoginReach> {
    const where = await resolveDestination(this.options.ssh, address);
    return where && !where.proxied ? { step: "sign-in", port: where.port } : { step: "sign-in" };
  }

  /**
   * The check line, before any sign-in. A Mac this Mac has not checked is
   * asked; a yes that matches the line just read is remembered; a Mac that
   * answers unlike a remembered yes is refused. Nothing is signed in to
   * either way.
   */
  private async confirmHost(
    address: string,
    confirm: string | undefined,
  ): Promise<
    | { ok: true }
    | { asks: "confirm"; address: string; line: string }
    | { refusal: RemoteLoginRefusal; reach?: RemoteLoginReach }
  > {
    if (this.options.pairing.hostTrustCannotBeRead()) return { refusal: "failed" };
    const live = await readHostKey(this.options.ssh, address);
    if ("refusal" in live) return live;
    const remembered = this.options.pairing.rememberedHost(address);
    if (remembered)
      return sameHostKey(remembered, live) ? { ok: true } : { refusal: "host-changed" };
    if (confirm === undefined) return { asks: "confirm", address, line: live.line };
    if (confirm !== live.line) return { refusal: "host-changed" };
    try {
      this.options.pairing.rememberHost(address, live);
    } catch {
      return { refusal: "failed" };
    }
    return { ok: true };
  }

  /**
   * A remembered Mac that now answers unlike before, checked before a
   * sign-in. Null when nothing is remembered, so a Mac added before this
   * check still uses the captain's own SSH.
   */
  private async changedKey(address: string): Promise<RemoteLoginRefusal | null> {
    if (!this.options.pairing.rememberedHost(address)) return null;
    const gated = await this.confirmHost(address, undefined);
    return "refusal" in gated ? gated.refusal : null;
  }

  /**
   * The ssh to start, checking the remembered key when there is one, and
   * offering Firstmate's own key first where it is let in.
   */
  private sshFor(address: string): {
    ssh: SshProgram;
    address: string;
    options?: readonly string[];
  } {
    const extra = this.options.pairing.sshOptions(address);
    return {
      ssh: this.options.ssh,
      address,
      ...(extra ? { options: [...SSH_OPTIONS, ...extra] } : {}),
    };
  }

  /** The look's and the removal's arguments: the data folders' names, and the flavor. */
  private folder(): [string, string] {
    return farFolderArgs(this.options.flavor);
  }

  private device(deviceId: string): DeviceView {
    const device = this.options.pairing.list().find((entry) => entry.id === deviceId);
    if (!device) throw new Error("No device with that id is on the list.");
    return device;
  }

  /** Runs one operation per address or device at a time. */
  private async once<T>(key: string, label: string, run: () => Promise<T>): Promise<T> {
    if (this.underWay.has(key)) throw new Error(`${label} is being set up already.`);
    this.underWay.add(key);
    try {
      return await run();
    } finally {
      this.underWay.delete(key);
    }
  }

  private downloadProgress(
    name: string,
    step: ReturnType<RemoteLogin["stepper"]>,
    stage: RemoteLoginStage,
    facts: StepFacts,
  ): (line: string) => boolean {
    const run = { id: `download-${randomUUID()}` };
    let last = -1;
    return (line) => {
      const count = readDownloadCount(line);
      if (!count || (count.received === 0 && count.total === undefined) || count.received === last)
        return false;
      const moved = count.received > Math.max(0, last);
      last = count.received;
      step.say(stage, remoteLoginWords.downloading(name, count.received, count.total), {
        ...facts,
        name,
        copy: { state: "preparing", download: count },
        run,
      });
      return moved;
    };
  }

  /**
   * Says each step of one operation in the feed, and its refusal as two warn
   * lines; `quiet` says nothing there, for a join that writes no feed line.
   */
  private stepper(address: string, doing: RemoteLoginDoing, device?: DeviceView, quiet = false) {
    const emit = (
      stage: RemoteLoginStage,
      text: string,
      tone: "info" | "warn",
      extra: StepFacts = {},
    ) =>
      !quiet &&
      this.options.emit({
        type: "device_setup",
        address,
        doing,
        stage,
        text,
        tone,
        ...(device ? { name: deviceLabel(device), deviceId: device.id } : {}),
        ...extra,
      });
    type At = {
      name?: string;
      missing?: string[];
      installs?: LinuxInstalls;
      reach?: RemoteLoginReach;
    };
    const lines = (refusal: RemoteLoginRefusal, at: At) =>
      remoteLoginWords.refused(refusal, {
        address,
        doing,
        name: at.name ?? (device ? deviceLabel(device) : undefined),
        missing: at.missing,
        installs: at.installs,
        reach: at.reach,
      });
    return {
      say: (stage: RemoteLoginStage, text: string, extra: StepFacts = {}) =>
        emit(stage, text, "info", extra),
      /** Lines that finish the step but say what is still wrong there. */
      caution: (said: readonly string[], extra: { name?: string; deviceId?: string } = {}) => {
        for (const line of said) emit("done", line, "warn", extra);
      },
      packageAddressRefused: (): never => {
        const said = remoteLoginWords.packageAddressRefused(device ? deviceLabel(device) : address);
        for (const line of said) emit("refused", line, "warn");
        throw new RemoteLoginRefusedError("failed", said);
      },
      uncertain: (name: string): never => {
        const said = remoteLoginWords.uncertain(name);
        for (const line of said) emit("refused", line, "warn", { name });
        throw new RemoteLoginRefusedError("failed", said, said.join("\n"), true);
      },
      stopped: (name: string, why: NonNullable<SshResult["stopped"]>): never => {
        const said = remoteLoginWords.stopped(name, doing, why);
        for (const line of said) emit("refused", line, "warn", { name });
        throw new RemoteLoginRefusedError("failed", said);
      },
      warn: (refusal: RemoteLoginRefusal) => {
        for (const line of lines(refusal, {})) emit("refused", line, "warn");
      },
      refuse: (refusal: RemoteLoginRefusal, at: At = {}): never => {
        const said = lines(refusal, at);
        for (const line of said) emit("refused", line, "warn", at.name ? { name: at.name } : {});
        throw new RemoteLoginRefusedError(refusal, said);
      },
    };
  }
}

/**
 * After an Ubuntu install that could not turn on linger there, once the work
 * runs in the background or starts at the next login: the one line an
 * administrator runs there so it keeps running after `user` logs out. None
 * when it could not set itself up there, whose own lines say so.
 */
function afterLogoutLines(
  device: DeviceView,
  user: string | undefined,
  background: BackgroundState,
): readonly string[] {
  if (!user || (background !== "running" && background !== "at-login")) return [];
  return remoteLoginWords.afterLogout(device, user);
}

function tokenField(
  key: "distro" | "release",
  value: string | undefined,
  pattern: RegExp,
): { distro?: string; release?: string } {
  return value && pattern.test(value) ? { [key]: value } : {};
}

function installerField(value: string | undefined): { installer?: LinuxInstaller } {
  return (LINUX_INSTALLERS as readonly string[]).includes(value ?? "")
    ? { installer: value as LinuxInstaller }
    : {};
}

function pkgField(value: string | undefined): string {
  return value && /^[A-Za-z0-9.+:~_-]{1,64}$/.test(value) ? value : "";
}

function sudoField(value: string | undefined): { sudo?: SudoRight } {
  return value === "free" || value === "password" || value === "no" ? { sudo: value } : {};
}

/**
 * Whether a computer runs on this Mac, as its list found where it joined
 * from (`onThisMac`), as an update's arguments say it (`--on-home-mac`);
 * empty while the list does not say. The update there keeps it on its
 * grant before it sets its agent up anew: this Mac's Update holds its SSH
 * connection to that computer, so the update cannot dial this Mac to hear
 * it (docs/helper.md, "Started by the home").
 */
function onHomeMacWord(device: Pick<DeviceView, "onThisMac">): "true" | "false" | "" {
  return device.onThisMac === undefined ? "" : device.onThisMac ? "true" : "false";
}

/** Why the work mode there would not join, as the home says it. */
function joinRefusal(reason: string): RemoteLoginRefusal {
  switch (reason) {
    case "same-user":
      return "same-user";
    case "joined":
      return "already-joined";
    case "busy":
      return "busy";
    default:
      return "failed";
  }
}

/** What a step's feed line carries beside its words, as `device_setup` types it. */
type StepFacts = {
  name?: string;
  deviceId?: string;
  copy?: RemoteLoginCopy;
  run?: { id: string };
};

/**
 * Sends the copy into the other computer's input: a bundle as one gzipped
 * tar made as it goes, anything else as its file; `sent` hears the size of
 * each piece as it is handed over.
 */
export function sendCopy(
  build: FarBuild,
  sink: Writable,
  sent?: (bytes: number) => void,
): Promise<void> {
  const { stream, ended, stop } = copyStream(build);
  // SSH may stop reading long before tar fills its output pipe (INF-320).
  const closed = () => stop();
  sink.once("close", closed);
  sink.once("error", closed);
  if (sent) stream.on("data", (chunk: Buffer) => sent(chunk.length));
  stream.pipe(sink, { end: false });
  return ended.finally(() => {
    sink.off("close", closed);
    sink.off("error", closed);
    stream.unpipe(sink);
    stop();
  });
}

/** The join's refusal for why the fixed command made no link. */
function linkNoneRefusal(none: ComputerLinkNone): JoinAtRefusal {
  switch (none) {
    case COMPUTER_LINK_NONE.notOpen:
      return "not-open";
    case COMPUTER_LINK_NONE.tooOld:
      return "too-old";
    case COMPUTER_LINK_NONE.noCurl:
      return "no-curl";
    case COMPUTER_LINK_NONE.controls:
      return "controls";
    default:
      return "no-link";
  }
}
