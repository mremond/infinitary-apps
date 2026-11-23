import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addressParts, type RemoteLoginReach, type RemoteLoginRefusal } from "@shared/remoteLogin";
import { hostEnv } from "../hostEnv";
import { hostPlatform } from "../platform";
import { type HostKey, preferHostKey, RSA_HOST_KEY_ALGORITHMS } from "./hostTrust";
import { type SshProgram, sshEnv, systemSshTool } from "./ssh";

/**
 * The other Mac's check line, read without signing in (docs/devices.md,
 * "Your yes on the check line"). `ssh -G` asks the captain's own SSH where
 * it would connect, so an alias still resolves, and `ssh-keyscan` reads the
 * key there. An address the settings reach through a proxy (`ProxyCommand`
 * or `ProxyJump`) has no name `ssh-keyscan` can dial, so the captain's own
 * ssh reads the key through that proxy and stops at it. Neither writes SSH
 * settings, and neither offers a key or a password to that Mac. A failure
 * is a refusal, never a key to trust.
 */

const SCAN_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 3_000;
const KEY_TYPES = "ed25519,ecdsa-sha2-nistp256,rsa";
/** The same keys, in the same order, as SSH names their signatures. */
const PROXY_KEY_ALGORITHMS = `ssh-ed25519,ecdsa-sha2-nistp256,${RSA_HOST_KEY_ALGORITHMS}`;
/** Where the known-hosts command writes the key it was offered, named in its environment. */
const OFFERED_FILE = "INFINITARY_OFFERED_HOST_KEY";

/**
 * The key, or why it could not be read: an `unreachable` key read on a port
 * it dialed says that port, and whether anything took the connection there.
 */
export type HostKeyRead = HostKey | { refusal: RemoteLoginRefusal; reach?: RemoteLoginReach };

/**
 * The user the captain's own SSH signs in to `address` as, as its settings
 * resolve it, or null when it cannot tell; the password question names it.
 */
export function signInUser(ssh: SshProgram, address: string): Promise<string | null> {
  const typed = /^([^@]+)@/.exec(addressParts(address).address)?.[1];
  if (typed) return Promise.resolve(typed);
  return run(ssh.program, [...ssh.args, "-G", "--", address], SCAN_TIMEOUT_MS).then((ran) => {
    const user = ran.code === 0 ? /^user (\S+)$/m.exec(ran.stdout)?.[1] : undefined;
    return user && user.length <= 64 ? user : null;
  });
}

/** The key that Mac answers with, or why it could not be read. */
export function readHostKey(ssh: SshProgram, address: string): Promise<HostKeyRead> {
  return resolveDestination(ssh, address).then((where) => {
    if (!where) return { refusal: "unreachable" };
    return where.proxied ? readThroughProxy(ssh, address) : scan(where.host, where.port);
  });
}

/**
 * This computer's own key at one of its addresses, as its first mate's
 * computer reads it there, with no sign-in (set up from your first mate's
 * computer, docs/view.md, "Joining"), or why it could not be read: nothing
 * answering on its own loopback is Remote Login off. Another address may
 * answer with another server's key, such as a private network's own SSH.
 */
export function readOwnHostKey(host = "127.0.0.1", port = 22): Promise<HostKeyRead> {
  return scan(host, port);
}

/** Where the captain's own SSH would connect, without connecting. */
export function resolveDestination(
  ssh: SshProgram,
  address: string,
): Promise<{ host: string; port: number; proxied: boolean } | null> {
  return run(ssh.program, [...ssh.args, "-G", "--", address], SCAN_TIMEOUT_MS).then((ran) => {
    if (ran.code !== 0) return null;
    const host = /^hostname (.+)$/m.exec(ran.stdout)?.[1]?.trim();
    const port = Number(/^port (\d+)$/m.exec(ran.stdout)?.[1]);
    if (!host || host.startsWith("-") || !Number.isInteger(port) || port < 1 || port > 65535)
      return null;
    const proxied = /^(proxycommand|proxyjump) (?!none$)\S/m.test(ran.stdout);
    return { host: host.replace(/^\[|\]$/g, ""), port, proxied };
  });
}

/**
 * The key a Mac behind a proxy answers with, read by the captain's own ssh
 * through that proxy. No known host is read, so SSH asks the known-hosts
 * command, which writes down the key it was offered and vouches for none;
 * SSH then stops with "Host key verification failed" before it signs in to
 * that Mac. A jump host is signed in to as the settings say, as any reach
 * of that address does.
 */
function readThroughProxy(ssh: SshProgram, address: string): Promise<HostKeyRead> {
  // The known-hosts command is a POSIX shell's, which a Windows PC lacks.
  if (address.startsWith("-") || hostPlatform() === "win32")
    return Promise.resolve({ refusal: "unreachable" });
  const dir = mkdtempSync(join(tmpdir(), "infinitary-host-key-"));
  const offered = join(dir, "offered");
  return run(
    ssh.program,
    [
      ...ssh.args,
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      "-o",
      "ControlMaster=no",
      "-o",
      "ControlPath=none",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "GlobalKnownHostsFile=/dev/null",
      "-o",
      "VerifyHostKeyDNS=no",
      "-o",
      "CheckHostIP=no",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "UpdateHostKeys=no",
      "-o",
      `HostKeyAlgorithms=${PROXY_KEY_ALGORITHMS}`,
      // SSH fills in %t and %K itself, the key's type and its base64, and
      // reads the command's output as known hosts: it prints nothing.
      "-o",
      `KnownHostsCommand=/bin/sh -c 'echo "$0 $1" >> "$${OFFERED_FILE}"' %t %K`,
      "-o",
      "ForwardAgent=no",
      "-o",
      "ForwardX11=no",
      "-o",
      "ClearAllForwardings=yes",
      "-o",
      "PermitLocalCommand=no",
      "-o",
      "RequestTTY=no",
      "--",
      address,
      "true",
    ],
    SCAN_TIMEOUT_MS,
    { ...sshEnv(), [OFFERED_FILE]: offered },
  ).then((ran) => {
    let said = "";
    try {
      said = readFileSync(offered, "utf8");
    } catch {
      // Nothing was offered.
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const keys = said
      .split("\n")
      .map((line) => parseKeyLine(`${address} ${line}`))
      .filter((key) => key !== null);
    const chosen = preferHostKey(keys);
    if (chosen) return chosen;
    if (/Connection refused/i.test(ran.stderr)) return { refusal: "remote-login-off" };
    return { refusal: "unreachable" };
  });
}

/** The keys that host offers, with no sign-in. */
function scan(host: string, port: number): Promise<HostKeyRead> {
  return run(
    systemSshTool("ssh-keyscan"),
    ["-T", "15", "-t", KEY_TYPES, "-p", String(port), "--", host],
    SCAN_TIMEOUT_MS,
  ).then(async (ran) => {
    const keys = ran.stdout
      .split("\n")
      .map((line) => parseKeyLine(line))
      .filter((key) => key !== null);
    const chosen = preferHostKey(keys);
    if (chosen) return chosen;
    // macOS ssh-keyscan says "Broken pipe" when nothing answers the port.
    if (/Connection refused|connect\(\) failed|Connection reset|Broken pipe/i.test(ran.stderr))
      return { refusal: "remote-login-off" };
    // A Mac never dials it itself, which its local network privacy would
    // ask, so it cannot tell a silent port from one that sent no key.
    if (hostPlatform() === "darwin")
      return { refusal: "unreachable", reach: { step: "key", port } };
    // Linux's and Windows' say nothing when the port is refused, so it is
    // asked once itself; what answers there tells the rest apart.
    const answer = await portAnswer(host, port);
    if (answer === "refused") return { refusal: "remote-login-off" };
    return {
      refusal: "unreachable",
      reach: {
        step: "key",
        port,
        ...(answer === "unknown" ? {} : { answered: answer === "open" }),
      },
    };
  });
}

/**
 * What `host` answers at `port`: `refused` when nothing listens there,
 * `open` when something took the connection, `silent` when nothing came
 * back in time or the network said it cannot be reached, `unknown` when
 * the name found no address, which says nothing of the port.
 */
function portAnswer(
  host: string,
  port: number,
): Promise<"refused" | "open" | "silent" | "unknown"> {
  return new Promise((resolve) => {
    // A refusal comes at once; anything slower is no answer, which the scan already waited out.
    const socket = createConnection({ host, port, timeout: PROBE_TIMEOUT_MS });
    const done = (answer: "refused" | "open" | "silent" | "unknown") => {
      socket.destroy();
      resolve(answer);
    };
    socket.once("connect", () => done("open"));
    socket.once("timeout", () => done("silent"));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      done(
        error.code === "ECONNREFUSED"
          ? "refused"
          : error.code === "ENOTFOUND" || error.code === "EAI_AGAIN"
            ? "unknown"
            : "silent",
      ),
    );
  });
}

function parseKeyLine(line: string): { type: string; publicKey: string } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3 || parts[0]?.startsWith("#")) return null;
  const type = parts[1] ?? "";
  const publicKey = parts[2] ?? "";
  if (!type.startsWith("ssh-") && !type.startsWith("ecdsa-")) return null;
  return { type, publicKey };
}

function run(
  program: string,
  args: readonly string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv = hostEnv(),
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(program, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    timer.unref?.();
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    child.once("error", (error) => {
      stderr += `\n${error.message}`;
      finish(255);
    });
    child.once("close", (code) => finish(code));
  });
}
