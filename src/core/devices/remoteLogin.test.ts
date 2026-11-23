import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { PAIRING_LINK_PREFIX } from "@shared/devices";
import { remoteLoginWords } from "@shared/remoteLogin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimedPort } from "../../../tests/helpers/claimedPort";
import {
  addChecked,
  closeEach,
  escapeRegExp,
  home,
  otherUser,
  packedSize,
  server,
  standInBundle,
  THEIR_UID,
} from "../../../tests/helpers/remoteLoginHome";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { SSH_SERVER_AVAILABLE } from "../../../tests/helpers/sshServer";
import {
  addStandInPayload,
  STAND_IN_APP,
  standInFirstmate,
  standInRecord,
} from "../../../tests/helpers/standInFirstmate";
import * as appArchive from "./appArchive";
import { checkLine } from "./hostTrust";
import { placeLocalityChallenge } from "./locality";
import { RemoteLoginRefusedError, sendCopy } from "./remoteLogin";
import { runSsh } from "./ssh";

/**
 * Adding a Mac by its address over Remote Login (docs/devices.md, "Adding a
 * computer by its address"), as the home does it: the Mac's own `/usr/bin/ssh` in
 * batch mode against a real SSH server (`tests/helpers/sshServer.ts`), the
 * real pairing and connection, and a stand-in Firstmate bundle the home
 * sends. The stand-in's program does at the wire what the work mode does
 * when the home starts it - it reads the link from its input and uses it with
 * the Mac's own curl and a key of its own - and writes down how it was
 * started and what it found beside it. The real app joining this way is
 * `tests/e2e/run-work.spec.ts`.
 *
 * Finding a computer again is `remoteLoginFound.test.ts`, an update
 * `remoteLoginUpdate.test.ts`, the password asked once
 * `remoteLoginPassword.test.ts`, asking for a link
 * `remoteLoginLink.test.ts`, an Ubuntu computer `remoteLoginUbuntu.test.ts`,
 * the home's own forward `remoteLoginForward.test.ts`, and a Mac downloading
 * its own copy `remoteLoginDownload.test.ts`; the home they add from is
 * `tests/helpers/remoteLoginHome.ts`.
 */

// Real processes: sshd, ssh, tar, curl and openssl (Mac slowest per-case
// fastest 2.1 s, docs/test-cohorts.md "Budgets").
vi.setConfig({ testTimeout: 15_000 });

afterEach(closeEach);

describe.runIf(SSH_SERVER_AVAILABLE)("adding a Mac by its address over Remote Login", () => {
  // INF-1617: address-based add/update retain the join without promising a login start.
  for (const startup of ["unavailable", "unknown"] as const) {
    it(`keeps an address-added computer whose automatic startup is ${startup}, including after update`, async () => {
      const sshd = await server();
      const them = otherUser();
      const record = join(scratchDir("infinitary-remote-startup-"), "started");
      const at = await home({
        ssh: sshd.ssh({ remote: them.env }),
        bundle: standInFirstmate(record, THEIR_UID, { joined: startup, updated: startup }),
      });
      const device = await addChecked(at.remote, sshd.address);
      expect(at.pairing.list()).toEqual([
        expect.objectContaining({ id: device.id, automaticStartup: startup }),
      ]);
      expect(at.lines()).toContain(remoteLoginWords.startup(device, startup));
      expect(at.lines()).not.toContain(remoteLoginWords.atLogin(device));
      expect(at.lines().join(" ")).not.toContain("enable-linger");
      await at.remote.update(device.id);
      expect(at.pairing.list()).toEqual([
        expect.objectContaining({ id: device.id, automaticStartup: startup }),
      ]);
      expect(at.lines()).toContain(remoteLoginWords.updated(device, startup));
    });
  }

  // INF-333 N1: a join that never claimed its invite is a definite Add failure.
  it.each([1, 4, 255])(
    "an unclaimed Add ending with %s uses its definite refusal, never Update uncertainty",
    async (code) => {
      const sshd = await server();
      const them = otherUser();
      const record = join(scratchDir("infinitary-unclaimed-add-"), "started");
      const bundle = standInFirstmate(record, THEIR_UID, {
        joined: "at-login",
        updated: "running",
        startExit: { when: "join", code },
      });
      const at = await home({ ssh: sshd.ssh({ remote: them.env }), bundle });
      const refused = await addChecked(at.remote, sshd.address).catch((error: unknown) => error);
      const reason = code === 255 ? "unreachable" : "failed";
      const lines = remoteLoginWords.refused(reason, {
        address: sshd.address,
        name: "Mac mini",
        doing: "add",
      });
      expect(refused).toBeInstanceOf(RemoteLoginRefusedError);
      expect((refused as Error).message).toBe(lines.join("\n"));
      expect(at.pairing.list()).toEqual([]);
      expect(at.lines().slice(-2)).toEqual([...lines]);
    },
  );

  it("reaches it with the captain's own SSH, sends this Mac's Firstmate, and that copy joins with the link from its input", async () => {
    const sshd = await server();
    const them = otherUser();
    const record = join(scratchDir("infinitary-remote-record-"), "started");
    const left: string[] = [];
    const at = await home({
      ssh: sshd.ssh({ remote: them.env }),
      bundle: standInBundle(record),
      here: () => {
        const here = placeLocalityChallenge();
        left.push(here.path);
        return here;
      },
    });

    const device = await addChecked(at.remote, sshd.address);

    expect(device).toMatchObject({
      kind: "work",
      name: "Mac mini",
      user: "sam",
      remoteLogin: sshd.address,
      // The look read back the token this Mac left: the Mac at that address is this one.
      onThisMac: true,
    });
    // Read once, then gone.
    expect(left).toHaveLength(1);
    expect(existsSync(left[0] ?? "")).toBe(false);
    expect(at.pairing.list()).toEqual([expect.objectContaining({ remoteLogin: sshd.address })]);
    // Each step said once, in order, and when its work starts there.
    expect(at.lines()).toEqual([
      remoteLoginWords.reaching(sshd.address),
      remoteLoginWords.settingUp("Mac mini"),
      remoteLoginWords.starting("Mac mini"),
      // One Mac in a test: the user it joined as is another user on this one.
      remoteLoginWords.atLogin(device),
    ]);
    // The copy's count is said between preparing it and starting it there.
    const copy = at.said.map((event) => event.copy?.state ?? null);
    expect(copy.indexOf("sending")).toBeGreaterThan(copy.indexOf("preparing"));
    expect(copy.lastIndexOf("sending")).toBeLessThan(copy.indexOf("starting"));
    expect(at.said.every((event) => event.tone === "info" && event.doing === "add")).toBe(true);
    // The copy arrived whole and joined with the link on its input, never in its words.
    const started = readFileSync(record, "utf8");
    expect(started).toMatch(
      new RegExp(
        `^started: work join --fetched /.+/firstmate[.-]\\w+/${escapeRegExp(STAND_IN_APP)} --from-home$`,
        "m",
      ),
    );
    expect(started).toContain("the home's own copy");
    expect(started).toContain("link on its input");
    expect(started).not.toContain(PAIRING_LINK_PREFIX);
    // Its one-use code went to curl on its input, never in curl's arguments.
    const { code, curl } = standInRecord(record);
    expect(code).toHaveLength(43);
    expect(curl).toHaveLength(1);
    expect(curl[0]).not.toContain(code);
    expect(curl[0]).toContain("--data-binary @-");
    // The temporary folder it was unpacked in is gone.
    const unpacked = /--fetched (.+) --from-home/.exec(started)?.[1] ?? "";
    expect(existsSync(unpacked)).toBe(false);
    // Nothing the feed said holds a link.
    expect(JSON.stringify(at.said)).not.toContain(PAIRING_LINK_PREFIX);
  });

  it("says how far the copy has gone: the bytes sent so far as they move, then starting it there, never a share of a total", async () => {
    const sshd = await server();
    const them = otherUser();
    const record = join(scratchDir("infinitary-remote-record-"), "started");
    const bundle = standInBundle(record);
    // Bytes that do not compress, so the copy is about as big as they are.
    const payload = 4_000_000;
    addStandInPayload(bundle, randomBytes(payload));
    // Every piece said, so the count is seen moving however fast this Mac copies.
    const at = await home({ ssh: sshd.ssh({ remote: them.env }), bundle, copyEveryMs: 0 });

    const device = await addChecked(at.remote, sshd.address);

    const sending = at.sending();
    const counts = sending.map((event) => event.copy?.sent ?? -1);
    // It moved while the copy went: many counts, each more than the one before.
    expect(counts.length).toBeGreaterThan(3);
    for (const [index, count] of counts.entries())
      expect(count).toBeGreaterThan(index === 0 ? 0 : (counts[index - 1] ?? 0));
    // Its last count is every byte that reached that Mac: the copy as this Mac packs it.
    expect(counts.at(-1)).toBe(await packedSize(bundle));
    expect(counts.at(-1)).toBeGreaterThan(payload);
    // One run of lines, each in place of the one before, in the feed's words.
    expect(new Set(sending.map((event) => event.run?.id)).size).toBe(1);
    expect(sending.every((event) => event.run?.id)).toBe(true);
    expect(sending.map((event) => event.text)).toEqual(
      counts.map((count) => remoteLoginWords.sending("Mac mini", count)),
    );
    // Preparing it, the counts, then starting it there, then the joined line.
    const order = at.said.map((event) => event.copy?.state ?? event.stage);
    expect(order.slice(0, 2)).toEqual(["reaching", "preparing"]);
    expect(order.slice(2, 2 + counts.length).every((state) => state === "sending")).toBe(true);
    expect(order[2 + counts.length]).toBe("starting");
    expect(at.said[2 + counts.length]?.text).toBe(remoteLoginWords.starting("Mac mini"));
    expect(device).toMatchObject({ kind: "work", remoteLogin: sshd.address });
    // Nothing says a share of a total: no total rides it, and no line holds a percentage.
    for (const event of at.said) {
      expect(Object.keys(event.copy ?? {}).every((key) => key === "state" || key === "sent")).toBe(
        true,
      );
      expect(event.text).not.toContain("%");
    }

    // Said at most once a second, the count still says its first bytes and all it sent.
    const another = await server();
    const calm = await home({ ssh: another.ssh({ remote: otherUser().env }), bundle });
    const again = await addChecked(calm.remote, another.address);
    expect(again).toMatchObject({ kind: "work", remoteLogin: another.address });
    const calmCounts = calm.sending().map((event) => event.copy?.sent ?? -1);
    expect(calmCounts.length).toBeGreaterThanOrEqual(2);
    expect(calmCounts.length).toBeLessThan(counts.length);
    expect(calmCounts.at(-1)).toBe(counts.at(-1));
  });

  it("says why when SSH cannot reach or sign in to it, and starts nothing there", async () => {
    const sshd = await server();
    const record = join(scratchDir("infinitary-remote-record-"), "started");
    const bundle = standInBundle(record);
    const closed = await claimedPort();
    const cases = [
      { ssh: sshd.ssh({ key: "locked" }), refusal: "key-locked" },
      // The app that holds the key asked, and was not approved.
      { ssh: sshd.ssh({ key: "agent" }), refusal: "agent-declined" },
      // The app that holds the key quit, taking its socket with it or leaving it behind.
      { ssh: sshd.ssh({ key: "agent" }), agent: "quit", refusal: "agent-not-running" },
      { ssh: sshd.ssh({ key: "agent" }), agent: "quit-left", refusal: "agent-not-running" },
      // A refused key, at a Remote Login that takes no password either.
      { ssh: sshd.ssh({ key: "refused" }), refusal: "password-off" },
      { ssh: sshd.ssh({ port: closed }), refusal: "remote-login-off" },
      // The key read stops at the port its SSH settings name, and the name finds no address.
      {
        ssh: sshd.ssh(),
        address: "sam@no-such-mac.invalid",
        refusal: "unreachable",
        reach: { step: "key", port: sshd.port },
      },
    ] as const;
    for (const each of cases) {
      sshd.knownHosts("known");
      await sshd.agentRuns("agent" in each ? each.agent : "open");
      const at = await home({ ssh: each.ssh, bundle });
      const address = "address" in each ? each.address : sshd.address;
      const refused = await addChecked(at.remote, address).catch((error: unknown) => error);
      const lines = remoteLoginWords.refused(each.refusal, {
        address,
        doing: "add",
        ...("reach" in each ? { reach: each.reach } : {}),
      });
      expect(refused, each.refusal).toBeInstanceOf(RemoteLoginRefusedError);
      expect((refused as RemoteLoginRefusedError).refusal, each.refusal).toBe(each.refusal);
      expect((refused as RemoteLoginRefusedError).message, each.refusal).toBe(lines.join("\n"));
      const reached =
        each.refusal === "unreachable" || each.refusal === "remote-login-off"
          ? []
          : [remoteLoginWords.reaching(address)];
      expect(at.lines(), each.refusal).toEqual([...reached, ...lines]);
      expect(at.pairing.list()).toEqual([]);
    }
    expect(existsSync(record)).toBe(false);
  });

  it("asks for the check line before sending anything, remembers the yes only in its own list, and refuses a changed key", async () => {
    const sshd = await server();
    sshd.knownHosts("unknown");
    const record = join(scratchDir("infinitary-remote-record-"), "started");
    const bundle = standInBundle(record);
    const dir = join(scratchDir("infinitary-remote-home-"), "devices");
    const at = await home({ ssh: sshd.ssh(), bundle, dir });
    const asked = await at.remote.addOrAsk(sshd.address);
    expect(asked).toMatchObject({ asks: "confirm", address: sshd.address });
    if (!("line" in asked)) throw new Error("The check line was not asked.");
    expect(asked.line).toMatch(/^ED25519 SHA256:\S+$/);
    expect(at.lines()).toEqual([]);
    expect(at.pairing.list()).toEqual([]);
    expect(existsSync(record)).toBe(false);
    expect(existsSync(join(dir, "host-trust.json"))).toBe(false);

    const wrong = await at.remote
      .addOrAsk(sshd.address, { confirm: "ED25519 SHA256:not-the-line" })
      .catch((error: unknown) => error);
    expect(wrong).toBeInstanceOf(RemoteLoginRefusedError);
    expect(wrong).toMatchObject({ refusal: "host-changed" });
    expect(existsSync(record)).toBe(false);
    expect(existsSync(join(dir, "host-trust.json"))).toBe(false);
    expect(readFileSync(sshd.knownHostsFile, "utf8")).toBe("");

    const device = await at.remote.add(sshd.address, { confirm: asked.line });
    expect(device.remoteLogin).toBe(sshd.address);
    expect(statSync(join(dir, "host-trust.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "known_hosts")).mode & 0o777).toBe(0o600);
    const trust = JSON.parse(readFileSync(join(dir, "host-trust.json"), "utf8")) as {
      hosts: Record<string, { line: string; publicKey: string }>;
    };
    expect(trust.hosts[sshd.address]?.line).toBe(asked.line);
    expect(readFileSync(join(dir, "known_hosts"), "utf8")).toContain(
      trust.hosts[sshd.address]?.publicKey,
    );
    expect(readFileSync(sshd.knownHostsFile, "utf8")).toBe("");

    const later = await at.remote.addOrAsk(sshd.address).catch((error: unknown) => error);
    expect(later).not.toMatchObject({ asks: "confirm" });

    const changedRecord = join(scratchDir("infinitary-remote-record-"), "started");
    const changed = await home({
      ssh: sshd.ssh(),
      bundle: standInBundle(changedRecord),
      dir: join(scratchDir("infinitary-remote-home-"), "devices"),
    });
    changed.pairing.rememberHost(sshd.address, {
      type: "ssh-ed25519",
      publicKey: "AQID",
      line: "ED25519 SHA256:not-this-mac",
    });
    const refused = await changed.remote.addOrAsk(sshd.address).catch((error: unknown) => error);
    expect(refused).toMatchObject({ refusal: "host-changed" });
    expect(existsSync(changedRecord)).toBe(false);
    expect(changed.lines().some((line) => line.includes("Terminal"))).toBe(false);
  }, 30_000);

  // A user report: an alias the person's SSH settings reach through a proxy
  // has no name of its own to dial, and the add stopped at "Could not
  // reach" while `ssh <alias>` signed in. The key is read through that
  // same proxy, shown on the same check line, and the add goes on.
  it("reads the check line through the proxy the person's SSH settings name for an alias, and adds it", async () => {
    const sshd = await server();
    sshd.knownHosts("unknown");
    const bastion = await server();
    const target = sshd.ssh();
    const settings = target.args[1] ?? "";
    const serverDir = dirname(settings);
    const bastionDir = dirname(bastion.ssh().args[1] ?? "");
    const [type, publicKey] = readFileSync(join(serverDir, "host.pub"), "utf8").split(" ");
    // The person's settings, as `-F` gives them: two aliases with no name
    // anything outside SSH can look up, and one behind a jump host.
    writeFileSync(
      settings,
      [
        "Host build-box",
        `  ProxyCommand /usr/bin/ssh -F ${settings} -W 127.0.0.1:%p bastion`,
        "Host build-hop",
        "  HostName 127.0.0.1",
        "  ProxyJump bastion",
        "Host bastion",
        "  HostName 127.0.0.1",
        `  Port ${bastion.port}`,
        `  IdentityFile ${join(bastionDir, "good")}`,
        `  UserKnownHostsFile ${bastion.knownHostsFile}`,
        readFileSync(settings, "utf8"),
      ].join("\n"),
    );
    const user = sshd.address.split("@")[0];
    for (const alias of ["build-box", `${user}@build-box`, "build-hop"]) {
      const record = join(scratchDir("infinitary-remote-record-"), "started");
      const at = await home({ ssh: target, bundle: standInBundle(record) });
      const asked = await at.remote.addOrAsk(alias);
      expect(asked, alias).toEqual({
        asks: "confirm",
        address: alias,
        line: checkLine(type ?? "", publicKey ?? ""),
      });
      expect(existsSync(record), alias).toBe(false);
      expect(readFileSync(sshd.knownHostsFile, "utf8"), alias).toBe("");
      const device = await at.remote.add(alias, { confirm: "line" in asked ? asked.line : "" });
      expect(device.remoteLogin, alias).toBe(alias);
      expect(existsSync(record), alias).toBe(true);
    }
  }, 30_000);

  it("refuses a computer of a system Firstmate does not run on, or whose user already runs work, before sending anything", async () => {
    const sshd = await server();
    const record = join(scratchDir("infinitary-remote-record-"), "started");
    const bundle = standInBundle(record);

    // Another system: its uname says so.
    const bin = scratchDir("infinitary-remote-other-");
    writeFileSync(join(bin, "uname"), "#!/bin/sh\necho FreeBSD\n");
    chmodSync(join(bin, "uname"), 0o755);
    const other = otherUser({ PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin` });
    const notMac = await home({ ssh: sshd.ssh({ remote: other.env }), bundle });
    await expect(addChecked(notMac.remote, sshd.address)).rejects.toMatchObject({
      refusal: "other-system",
    });
    expect(notMac.lines().at(-2)).toBe(
      remoteLoginWords.refused("other-system", { address: sshd.address })[0],
    );

    // A user that joined a Firstmate already, whose grant this Mac cannot read as its own.
    const joined = otherUser();
    mkdirSync(joined.work, { recursive: true });
    writeFileSync(join(joined.work, "home.json"), "{}\n");
    const again = await home({ ssh: sshd.ssh({ remote: joined.env }), bundle });
    await expect(addChecked(again.remote, sshd.address)).rejects.toMatchObject({
      refusal: "already-joined",
    });
    expect(existsSync(record)).toBe(false);
  });

  it("says nothing is set up there when the copy is gone, and a copy that cannot send itself sends nothing", async () => {
    const sshd = await server();
    const them = otherUser();
    const at = await home({ ssh: sshd.ssh({ remote: them.env }), bundle: null });
    await expect(addChecked(at.remote, sshd.address)).rejects.toMatchObject({
      refusal: "cannot-send",
    });
    expect(at.lines()).toEqual([...remoteLoginWords.refused("cannot-send", { address: "" })]);
    const device = {
      id: "mini",
      kind: "work" as const,
      name: "Mac mini",
      pairedAt: 0,
      user: "sam",
      remoteLogin: sshd.address,
    };
    // Nothing is set up there, so nothing is left to hear, and nothing was removed.
    at.said.splice(0);
    expect(await at.remote.removeThere(device)).toBe(true);
    expect(at.lines()).toEqual([
      remoteLoginWords.removing(device),
      remoteLoginWords.nothingThere(device),
    ]);
  });
});

// INF-320: a refused input must not leave tar blocked on its full output pipe.
it("stops and reaps packing when the receiving input fails early", async () => {
  const record = join(scratchDir("infinitary-pack-stop-"), "started");
  const bundle = standInBundle(record);
  addStandInPayload(bundle, randomBytes(8_000_000));
  const packed = vi.spyOn(appArchive, "packApp");
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error("The session ended."));
    },
  });
  sink.on("error", () => {});
  try {
    await expect(sendCopy({ form: "bundle", path: bundle }, sink)).rejects.toThrow(
      "Packing Infinitary stopped",
    );
    expect(packed).toHaveBeenCalledOnce();
    const tar = packed.mock.results[0]?.value;
    if (!tar) throw new Error("No packing process was observed.");
    expect(tar.exitCode !== null || tar.signalCode !== null).toBe(true);
  } finally {
    packed.mockRestore();
  }
});

// INF-325 and INF-322: an inactivity stop outranks SSH's exit 255, and
// actual movement, not a heartbeat, renews the two-minute deadline.
it("measures inactivity since real movement and preserves the stop reason despite SSH exit 255", async () => {
  const program = join(scratchDir("infinitary-idle-ssh-"), "ssh");
  writeFileSync(
    program,
    `#!${process.execPath}
process.on('SIGTERM', () => process.exit(255));
require('node:readline').createInterface({ input: process.stdin }).on('line', line => console.log(line));
`,
    { mode: 0o755 },
  );
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let sink: import("node:stream").Writable | undefined;
  let heard: () => void = () => {};
  const line = () =>
    new Promise<void>((resolve) => {
      heard = resolve;
    });
  try {
    const ready = line();
    const ran = runSsh({
      ssh: { program, args: [] },
      address: "fixture",
      idleTimeoutMs: 120_000,
      stdin: async (input) => {
        sink = input;
        input.write("ready\n");
        await new Promise<void>((resolve) => input.once("close", resolve));
      },
      onLine: (value) => {
        heard();
        return value === "bytes";
      },
    });
    await ready;
    await vi.advanceTimersByTimeAsync(119_000);
    const moved = line();
    sink?.write("bytes\n");
    await moved;
    await vi.advanceTimersByTimeAsync(119_000);
    const beat = line();
    sink?.write("heartbeat\n");
    await beat;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await ran).toMatchObject({ code: 255, stopped: "inactive" });
  } finally {
    vi.useRealTimers();
  }
});
