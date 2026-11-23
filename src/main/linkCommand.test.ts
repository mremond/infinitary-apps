import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scratchDir } from "../../tests/helpers/scratchDirs";
import { DevicePairing } from "../core/devices/pairing";
import { PhoneDoor } from "../core/devices/phoneDoor";
import { CONNECTION_PORT } from "../shared/connection";
import {
  firewallWords,
  LINK_SAY,
  PAIRING_LINK_PREFIX,
  PAIRING_LINK_TTL_MS,
  parsePairingLink,
  phoneRouteWords,
} from "../shared/devices";
import { PHONE_CODE_QUIET, phoneCodeModules } from "../shared/phoneCode";
import { PHONE_DOOR_FOLDER } from "../shared/phoneLink";
import {
  askForLink,
  LINK_WORDS,
  linkAsked,
  linkCommand,
  linkOutput,
  runLinkCommand,
  terminalCode,
} from "./linkCommand";

/**
 * INF-1228's approved plan, piece 3: "`infinitary link` prints a link for
 * another computer or a code for a phone", from the Infinitary running in
 * this account. These hold the words it takes, what it reads when no app
 * answers, and the code it prints; tests/e2e/link-command.spec.ts holds the
 * built command beside a real run.
 */

const doors: PhoneDoor[] = [];
afterEach(() => {
  for (const door of doors.splice(0)) door.close();
});

/** A data folder whose app answers at its door, with real pairing behind it. */
async function answering(invite?: () => never) {
  const data = scratchDir("infinitary-link-command-");
  const pairing = new DevicePairing({ dir: join(data, "devices"), interfaces: () => ({}) });
  doors.push(
    await PhoneDoor.open({
      dir: join(data, PHONE_DOOR_FOLDER),
      invite: invite ?? ((phone) => pairing.invite({ kind: "mac", ...(phone ? { phone } : {}) })),
      // No connection here, so nothing to wait for (src/core/devices/phoneDoor.test.ts owns the wait).
      listening: async () => {},
    }),
  );
  return { data, pairing };
}

/** Reads the printed code back into modules, as a camera would: dark where the cell is drawn black. */
function readCode(lines: readonly string[]): boolean[][] {
  const rows: boolean[][] = [];
  for (const line of lines) {
    const cells = [...line.replace("\x1b[30;47m", "").replace("\x1b[0m", "")];
    rows.push(cells.map((cell) => cell === "█" || cell === "▀"));
    rows.push(cells.map((cell) => cell === "█" || cell === "▄"));
  }
  return rows;
}

describe("the words after link", () => {
  it("reads link after Chromium's switches, as the work mode reads work", () => {
    expect(linkCommand(["Infinitary", "--no-sandbox", "link", "--phone"], false)).toEqual([
      "--phone",
    ]);
    expect(linkCommand(["electron", "out", "link"], true)).toEqual([]);
    expect(linkCommand(["Infinitary", "status"], false)).toBeNull();
  });

  it("asks for a computer's link by default, a phone's with --phone, and JSON with --json", () => {
    expect(linkAsked([])).toEqual({ for: "computer", json: false });
    expect(linkAsked(["--phone"])).toEqual({ for: "phone", json: false });
    expect(linkAsked(["--json", "--phone"])).toEqual({ for: "phone", json: true });
    for (const words of [["phone"], ["--computer"], ["--phone", "--phone"], ["--help"]])
      expect(linkAsked(words), words.join(" ")).toBeNull();
  });

  it("says how to use it and ends with 2 for words it does not take", async () => {
    const said = await runLinkCommand(["--qr"], scratchDir("infinitary-link-command-"));
    expect(said).toEqual({ code: 2, out: "", error: `${LINK_WORDS.usage.join("\n")}\n` });
  });
});

describe("asking the app running here", () => {
  it("gets a one-use link for another computer, and another for a phone, from pairing", async () => {
    const { data, pairing } = await answering();
    const computer = await askForLink(data, "computer");
    const phone = await askForLink(data, "phone");
    if (computer.kind !== "link" || phone.kind !== "link") throw new Error("no link");
    for (const answer of [computer, phone]) {
      expect(parsePairingLink(answer.link)).toMatchObject({
        kind: "mac",
        key: pairing.identity().pin,
      });
      expect(answer.expiresAt - Date.now()).toBeGreaterThan(PAIRING_LINK_TTL_MS - 60_000);
    }
    expect(parsePairingLink(phone.link).code).not.toBe(parsePairingLink(computer.link).code);
  });

  // INF-6043's change 5: on a server, the link command also prints the
  // firewall line Settings -> Devices shows in a window.
  it("prints under the link the firewall line Settings shows, and leaves it out of the JSON", async () => {
    const { data } = await answering();
    const ufw = { name: "ufw", port: CONNECTION_PORT } as const;
    let read = 0;
    const firewall = async () => {
      read += 1;
      return ufw;
    };
    const said = await runLinkCommand([], data, firewall);
    const { lines, way } = firewallWords(ufw);
    expect(said.code).toBe(0);
    expect(said.out.trimEnd().split("\n").slice(-5)).toEqual(["", ...lines, "", `  ${way}`]);
    expect(said.out.indexOf(way)).toBeGreaterThan(said.out.indexOf(PAIRING_LINK_PREFIX));
    const json = await runLinkCommand(["--json"], data, firewall);
    expect(Object.keys(JSON.parse(json.out)).sort()).toEqual([
      "expiresAt",
      "for",
      "link",
      "schemaVersion",
    ]);
    expect(read).toBe(1);
  });

  it("says why when pairing makes no link", async () => {
    const { data } = await answering(() => {
      throw new Error("The saved device list cannot be read.");
    });
    expect(await askForLink(data, "computer")).toEqual({
      kind: "refused",
      reason: "The saved device list cannot be read.",
    });
  });

  it("reads no running app from no door, or a door an app that stopped left", async () => {
    expect(await askForLink(scratchDir("infinitary-link-command-"), "computer")).toEqual({
      kind: "not-running",
    });
    const { data } = await answering();
    const door = doors.pop() as PhoneDoor;
    const files = join(data, PHONE_DOOR_FOLDER);
    door.close();
    // A killed app's door stays behind, naming a port nothing answers.
    mkdirSync(files, { recursive: true });
    writeFileSync(join(files, "address"), `${door.address}\n`);
    writeFileSync(join(files, "key"), "x-infinitary-phone-key: 00\n");
    // ...and its lock names a process that is gone.
    symlinkSync("a-mac-2147483646", join(data, "SingletonLock"));
    expect(await askForLink(data, "phone", () => false)).toEqual({ kind: "not-running" });
  });

  it("reads an open app with no door as one that did not answer", async () => {
    const data = scratchDir("infinitary-link-command-");
    symlinkSync(`a-mac-${process.pid}`, join(data, "SingletonLock"));
    expect(await askForLink(data, "computer")).toEqual({ kind: "no-answer" });
  });

  it("reads an app that controls a first mate on another computer", async () => {
    const data = scratchDir("infinitary-link-command-");
    mkdirSync(join(data, "joined"));
    writeFileSync(join(data, "joined", "home.json"), "{}");
    symlinkSync(`a-mac-${process.pid}`, join(data, "SingletonLock"));
    expect(await askForLink(data, "computer")).toEqual({ kind: "controls" });
  });
});

describe("what it prints", () => {
  const link = (phone: boolean) => {
    const { link, expiresAt } = new DevicePairing({
      dir: join(scratchDir("infinitary-link-command-"), "devices"),
      interfaces: () => ({}),
    }).invite({ kind: "mac", ...(phone ? { phone } : {}) });
    return { kind: "link", link, expiresAt } as const;
  };

  it("prints the code a phone scans: every module of its link, black on white, with its margin", () => {
    const { link: text } = link(true);
    const modules = phoneCodeModules(text);
    const lines = terminalCode(modules);
    for (const line of lines) {
      expect(line.startsWith("\x1b[30;47m")).toBe(true);
      expect(line.endsWith("\x1b[0m")).toBe(true);
    }
    const read = readCode(lines);
    const side = modules.length + 2 * PHONE_CODE_QUIET;
    expect(read[0]).toHaveLength(side);
    // Every module where the code has it, and only light around it.
    for (let y = 0; y < read.length; y++)
      for (let x = 0; x < side; x++)
        expect(read[y]?.[x], `${x},${y}`).toBe(
          modules[y - PHONE_CODE_QUIET]?.[x - PHONE_CODE_QUIET] === true,
        );
  });

  it("prints a phone's words, its code, its link and how long it works", () => {
    const invite = link(true);
    const now = invite.expiresAt - PAIRING_LINK_TTL_MS;
    const said = linkOutput({ for: "phone", json: false }, invite, now);
    expect(said.code).toBe(0);
    expect(said.out.split("\n")).toEqual([
      ...LINK_SAY.phone,
      "",
      ...terminalCode(phoneCodeModules(invite.link)),
      "",
      invite.link,
      "",
      `${LINK_WORDS.lasts(PAIRING_LINK_TTL_MS)} ${phoneRouteWords(invite.link)}`,
      "",
    ]);
  });

  it("prints a computer's words and link, or one JSON object for a script", () => {
    const invite = link(false);
    const now = invite.expiresAt - PAIRING_LINK_TTL_MS;
    expect(linkOutput({ for: "computer", json: false }, invite, now)).toEqual({
      code: 0,
      out: `${[...LINK_SAY.computer, "", invite.link, "", LINK_WORDS.lasts(PAIRING_LINK_TTL_MS)].join("\n")}\n`,
      error: "",
    });
    const json = linkOutput({ for: "computer", json: true }, invite, now);
    expect(JSON.parse(json.out)).toEqual({
      schemaVersion: 1,
      for: "computer",
      link: invite.link,
      expiresAt: new Date(invite.expiresAt).toISOString(),
    });
  });

  it("says why there is no link on its error output and ends with 1", () => {
    const asked = { for: "computer", json: true } as const;
    for (const [answer, lines] of [
      [{ kind: "not-running" }, LINK_WORDS.notRunning],
      [{ kind: "no-answer" }, LINK_WORDS.noAnswer],
      [{ kind: "controls" }, LINK_WORDS.controls],
      [{ kind: "refused", reason: "no list" }, LINK_WORDS.refused("no list")],
    ] as const)
      expect(linkOutput(asked, answer, 0)).toEqual({
        code: 1,
        out: "",
        error: `${lines.join("\n")}\n`,
      });
  });
});
