import { existsSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { firewallKeepsOut, windowsFirewallKeepsOut } from "@core/devices/firewall";
import { minutesWords } from "@core/helper/words";
import { hostPlatform } from "@core/platform";
import { CONNECTION_PORT } from "@shared/connection";
import { COMPUTER } from "@shared/deviceNames";
import { firewallWords, type HomeFirewall, LINK_SAY, phoneRouteWords } from "@shared/devices";
import { PHONE_CODE_QUIET, phoneCodeModules } from "@shared/phoneCode";
import {
  LINK_COMMAND_PATH,
  type LinkCommandFor,
  linkCommandAnswerSchema,
  PHONE_DOOR_FILES,
  PHONE_DOOR_FOLDER,
  PHONE_DOOR_KEY_HEADER,
} from "@shared/phoneLink";
import { lockHolder, processAlive } from "./runCommand";
import { commandWords } from "./workCommand";

/**
 * `infinitary link` (docs/run.md, "A link by command"; INF-1228's approved
 * plan, piece 3): a one-use link for another computer, or with `--phone` a
 * code for a phone, from the Infinitary running in this account - started by
 * a command or with its window. It asks that app's door, as a phone signed in
 * over SSH does (`PhoneDoor`, src/core/devices/phoneDoor.ts), so pairing
 * makes the link as Settings -> Devices does; it starts nothing, opens no
 * window and takes no lock. The link reaches this command's output alone.
 * Under the link it prints what Settings -> Devices says of this computer's
 * own firewall, when one may keep the other computer out (docs/devices.md,
 * "A home's firewall"), so a server with no window says it too.
 */

export const LINK_WORDS = {
  usage: [
    "Usage: infinitary link [--phone] [--json]",
    `Prints a one-use link for another ${COMPUTER.one}, or with --phone a code for a phone, from Infinitary running here.`,
  ],
  /** How long the link works, from when it expires. */
  lasts: (ms: number) => `It works once, for ${minutesWords(ms)}.`,
  notRunning: [
    "Infinitary is not running here, as this user.",
    "Start it with infinitary run, or open it, then run this again.",
  ],
  noAnswer: [
    "Infinitary is open here, but it did not answer this command.",
    "Quit it and start it again, then run this again.",
  ],
  controls: [
    `Infinitary here controls your first mate on another ${COMPUTER.one}.`,
    `Make the link on that ${COMPUTER.one} instead.`,
  ],
  refused: (reason: string) => [`Infinitary here could not make a link: ${reason}`],
} as const;

/** Whether the app was started as `<app> link`, and the words after `link` when it was. */
export function linkCommand(argv: readonly string[], defaultApp: boolean): string[] | null {
  const words = commandWords(argv, defaultApp);
  return words?.[0] === "link" ? words.slice(1) : null;
}

export type LinkAsked = { for: LinkCommandFor; json: boolean };

/** What the words after `link` ask for, or null for words it does not take. */
export function linkAsked(words: readonly string[]): LinkAsked | null {
  const known = new Set(["--phone", "--json"]);
  if (words.some((word) => !known.has(word)) || new Set(words).size !== words.length) return null;
  return { for: words.includes("--phone") ? "phone" : "computer", json: words.includes("--json") };
}

/** What the door answered, or why nothing did. */
export type LinkAnswer =
  | { kind: "link"; link: string; expiresAt: number }
  | { kind: "refused"; reason: string }
  | { kind: "not-running" | "no-answer" | "controls" };

/**
 * Asks the app running on this data folder for a link at its door. With no
 * door that answers, it reads why: an app that controls another computer
 * runs no first mate here (`joined/home.json`, `JoinedHome`), an app that
 * holds the folder's lock and has no such door is older or did not open it,
 * and no holder is no app at all.
 */
export async function askForLink(
  dataDir: string,
  asked: LinkCommandFor,
  alive: (pid: number) => boolean = processAlive,
): Promise<LinkAnswer> {
  const door = readDoor(join(dataDir, PHONE_DOOR_FOLDER));
  if (door) {
    const answered = await askDoor(door, asked).catch(() => null);
    if (answered) return answered;
  }
  if (existsSync(join(dataDir, "joined", "home.json"))) return { kind: "controls" };
  const holder = lockHolder(dataDir);
  return typeof holder === "number" && alive(holder)
    ? { kind: "no-answer" }
    : { kind: "not-running" };
}

type Door = { address: string; key: string };

/** The door's address on this computer's loopback, and its key; null when either is missing. */
function readDoor(dir: string): Door | null {
  try {
    const address = readFileSync(join(dir, PHONE_DOOR_FILES.address), "utf8").trim();
    const line = readFileSync(join(dir, PHONE_DOOR_FILES.key), "utf8").trim();
    const prefix = `${PHONE_DOOR_KEY_HEADER}: `;
    // The key goes to this computer's loopback alone, as the phone's command sends it.
    if (!/^127\.0\.0\.1:\d+$/.test(address) || !line.startsWith(prefix)) return null;
    return { address, key: line.slice(prefix.length) };
  } catch {
    return null;
  }
}

/** One request to the door; null when nothing answered as the door does. */
function askDoor(door: Door, asked: LinkCommandFor): Promise<LinkAnswer | null> {
  const [host, port] = door.address.split(":");
  return new Promise((resolve, reject) => {
    const sent = request(
      {
        host,
        port: Number(port),
        method: "POST",
        path: `${LINK_COMMAND_PATH}?for=${asked}`,
        headers: { [PHONE_DOOR_KEY_HEADER]: door.key },
        timeout: 30_000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200 && response.statusCode !== 503) return resolve(null);
          let parsed: ReturnType<typeof linkCommandAnswerSchema.safeParse>;
          try {
            parsed = linkCommandAnswerSchema.safeParse(JSON.parse(body));
          } catch {
            return resolve(null);
          }
          if (!parsed.success) return resolve(null);
          resolve(
            "refused" in parsed.data
              ? { kind: "refused", reason: parsed.data.refused }
              : { kind: "link", ...parsed.data },
          );
        });
        response.on("error", reject);
      },
    );
    sent.on("timeout", () => sent.destroy(new Error("The door did not answer in time.")));
    sent.on("error", reject);
    sent.end();
  });
}

/**
 * A phone's code as a terminal draws it: two rows of modules to a line, in
 * half blocks, black on white whatever the terminal's own colors, so a
 * camera reads it on a dark terminal as on a light one.
 */
export function terminalCode(modules: readonly (readonly boolean[])[]): string[] {
  const size = modules.length + 2 * PHONE_CODE_QUIET;
  const dark = (x: number, y: number) =>
    modules[y - PHONE_CODE_QUIET]?.[x - PHONE_CODE_QUIET] === true;
  const lines: string[] = [];
  for (let y = 0; y < size; y += 2) {
    let line = "";
    for (let x = 0; x < size; x++) {
      const top = dark(x, y);
      const bottom = dark(x, y + 1);
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    // Black on white, then the terminal's own colors again before the line ends.
    lines.push(`\x1b[30;47m${line}\x1b[0m`);
  }
  return lines;
}

export type LinkOutput = { code: number; out: string; error: string };

/**
 * What the command prints for what the door answered, and how it ends: 0 a
 * link, 1 none. `firewall` is this computer's own firewall that may keep the
 * other computer out, printed under the link as Settings -> Devices says it.
 */
export function linkOutput(
  asked: LinkAsked,
  answer: LinkAnswer,
  now: number,
  firewall: HomeFirewall | null = null,
): LinkOutput {
  const fail = (lines: readonly string[]): LinkOutput => ({
    code: 1,
    out: "",
    error: `${lines.join("\n")}\n`,
  });
  switch (answer.kind) {
    case "not-running":
      return fail(LINK_WORDS.notRunning);
    case "no-answer":
      return fail(LINK_WORDS.noAnswer);
    case "controls":
      return fail(LINK_WORDS.controls);
    case "refused":
      return fail(LINK_WORDS.refused(answer.reason));
  }
  if (asked.json)
    return {
      code: 0,
      out: `${JSON.stringify({
        schemaVersion: 1,
        for: asked.for,
        link: answer.link,
        expiresAt: new Date(answer.expiresAt).toISOString(),
      })}\n`,
      error: "",
    };
  const lasts = LINK_WORDS.lasts(answer.expiresAt - now);
  const lines =
    asked.for === "phone"
      ? [
          ...LINK_SAY.phone,
          "",
          ...terminalCode(phoneCodeModules(answer.link)),
          "",
          answer.link,
          "",
          `${lasts} ${phoneRouteWords(answer.link)}`,
        ]
      : [...LINK_SAY.computer, "", answer.link, "", lasts];
  if (firewall) {
    const said = firewallWords(firewall);
    lines.push("", ...said.lines, "", `  ${said.way}`);
  }
  return { code: 0, out: `${lines.join("\n")}\n`, error: "" };
}

/**
 * This computer's own firewall that may keep its other computers out, read
 * as Settings -> Devices reads it on a Linux or Windows first mate's
 * computer; null on a Mac, whose firewall asks its person, or when none is
 * known to.
 */
export function ownFirewall(): Promise<HomeFirewall | null> {
  const platform = hostPlatform();
  if (platform === "linux") return firewallKeepsOut({ port: CONNECTION_PORT });
  if (platform === "win32") return windowsFirewallKeepsOut(CONNECTION_PORT, process.execPath);
  return Promise.resolve(null);
}

/** The whole command: the words after `link`, asked of the app on this data folder. */
export async function runLinkCommand(
  words: readonly string[],
  dataDir: string,
  firewall: () => Promise<HomeFirewall | null> = ownFirewall,
): Promise<LinkOutput> {
  const asked = linkAsked(words);
  if (!asked) return { code: 2, out: "", error: `${LINK_WORDS.usage.join("\n")}\n` };
  const answer = await askForLink(dataDir, asked.for);
  // The JSON is for a program, which reads the link alone.
  const keepsOut =
    answer.kind === "link" && !asked.json ? await firewall().catch(() => null) : null;
  return linkOutput(asked, answer, Date.now(), keepsOut);
}
