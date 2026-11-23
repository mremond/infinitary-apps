import { describe, expect, it } from "vitest";
import {
  buildPairingLink,
  deviceControls,
  deviceJoinedLine,
  deviceLabel,
  deviceMayBe,
  deviceNameSchema,
  deviceRunsWork,
  deviceWords,
  linkDialingFirst,
  namesInWords,
  type PairingLink,
  parsePairingLink,
  reachAfterStart,
  STARTUP_CONNECTING_MS,
  servedAwayWord,
  splitDialAddress,
} from "./devices";
import { currentLanguage, setCurrentLanguage } from "./i18n/current.ts";
import * as m from "./i18n/messages.generated.ts";

const link: PairingLink = {
  kind: "view",
  at: "192.168.1.20:47623",
  key: "k".repeat(43),
  code: "c".repeat(43),
};

describe("the pairing link", () => {
  it("reads back exactly what the home wrote, for any address a device can dial", () => {
    for (const at of ["192.168.1.20:47623", "[fd7a:115c:a1e0::1]:47623", "studio.tail.ts.net:9"])
      expect(parsePairingLink(` ${buildPairingLink({ ...link, at })}\n`)).toEqual({ ...link, at });
    expect(buildPairingLink(link)).toMatch(/^infinitary:\/\/join\?as=view&at=/);
    // A link for a computer that reaches its home only through the home's
    // SSH connection says so, and reads back the same.
    const overSsh: PairingLink = { ...link, kind: "work", at: "127.0.0.1:47623", via: "ssh" };
    expect(buildPairingLink(overSsh)).toMatch(/&via=ssh$/);
    expect(parsePairingLink(buildPairingLink(overSsh))).toEqual(overSsh);
    expect(parsePairingLink(buildPairingLink(link))).not.toHaveProperty("via");
  });

  it("reads a link in the Firstmate 3000 scheme the same as one in Infinitary's", () => {
    const renamed = buildPairingLink(link);
    const old = renamed.replace("infinitary://", "firstmate3000://");
    expect(parsePairingLink(old)).toEqual(link);
    expect(parsePairingLink(` ${old}\n`)).toEqual(parsePairingLink(renamed));
  });

  it("refuses a link it cannot read, and never repeats it in the reason", () => {
    const good = buildPairingLink(link);
    const damaged = [
      "https://example.com/join?as=view",
      good.replace("as=view", "as=admin"),
      good.replace(/key=[^&]+/, "key=short"),
      good.replace(/code=[^&]+/, `code=${"c".repeat(44)}`),
      good.replace(/at=[^&]+/, "at=192.168.1.20"),
      good.replace(/at=[^&]+/, "at=192.168.1.20%3A70000"),
      good.replace(/at=[^&]+/, "at=bad_host%3A1"),
      `${good}&code=${"d".repeat(43)}`,
      `${good}&next=1`,
      `${good}&via=tcp`,
      `${good}&via=ssh&via=ssh`,
      good.replace(/&code=[^&]+/, ""),
    ];
    for (const text of damaged) {
      let reason = "";
      try {
        parsePairingLink(text);
      } catch (error) {
        reason = (error as Error).message;
      }
      expect(reason, text).toMatch(
        /^This (is not a link|link to join Infinitary on another computer is damaged)/,
      );
      expect(reason).not.toContain("c".repeat(43));
    }
  });

  // INF-1827's accepted plan: a link Join by its address asked for dials first the computer the
  // person's own SSH reached, at the link's port, then each address the link names.
  it("dials the host SSH reached first, at the link's port, then the link's own addresses", () => {
    const text = buildPairingLink({ ...link, kind: "mac", also: ["100.101.102.103:47623"] });
    expect(parsePairingLink(linkDialingFirst(text, "127.0.0.1"))).toEqual({
      ...link,
      kind: "mac",
      at: "127.0.0.1:47623",
      also: ["192.168.1.20:47623", "100.101.102.103:47623"],
    });
    expect(parsePairingLink(linkDialingFirst(text, "fd7a::1")).at).toBe("[fd7a::1]:47623");
    // The host the link already names first is not named twice.
    expect(parsePairingLink(linkDialingFirst(text, "192.168.1.20")).also).toEqual([
      "100.101.102.103:47623",
    ]);
    // No host, one that is no dial address, or a link that reaches its home another way: unchanged.
    expect(linkDialingFirst(text, null)).toBe(text);
    expect(linkDialingFirst(text, "bad_host")).toBe(text);
    const overSsh = buildPairingLink({ ...link, kind: "work", at: "127.0.0.1:1", via: "ssh" });
    expect(linkDialingFirst(overSsh, "192.168.1.30")).toBe(overSsh);
  });

  it("splits a dial address into its host and port", () => {
    expect(splitDialAddress("127.0.0.1:47623")).toEqual({ host: "127.0.0.1", port: 47623 });
    expect(splitDialAddress("[::1]:5")).toEqual({ host: "::1", port: 5 });
    for (const text of ["127.0.0.1", ":80", "host:0", "[nope]:1", "a b:1", "host:1:2"])
      expect(splitDialAddress(text), text).toBeNull();
  });
});

describe("a device's name", () => {
  it("is the device's own words, bounded, with nothing that reorders the text around it", () => {
    expect(deviceNameSchema.parse("  Kun's MacBook Air ")).toBe("Kun's MacBook Air");
    for (const name of ["", "   ", "x".repeat(65), "line\nbreak", "tab\there", "evil‮eman", "a​b"])
      expect(deviceNameSchema.safeParse(name).success, JSON.stringify(name)).toBe(false);
  });
});

describe("the words for a device", () => {
  const mini = {
    id: "mini",
    kind: "work" as const,
    name: "Mac mini",
    pairedAt: 1,
    user: "sam",
    onThisMac: false,
  };
  const builder = { ...mini, id: "builder", name: "MacBook Pro", user: "builder", onThisMac: true };

  it("names another user on this Mac as running as it, and another Mac by its own name", () => {
    expect(deviceLabel(builder)).toBe("Running as Builder");
    expect(deviceLabel(mini)).toBe("Mac mini");
    expect(namesInWords(["website", "api", "docs"])).toBe("website, api and docs");
  });

  it("says what a computer that runs work has once it joined", () => {
    expect(deviceJoinedLine({ ...mini, found: { git: true, claudeCode: true } })).toBe(
      "Mac mini joined your devices. It has git and Claude Code, and no sign-ins yet.",
    );
    expect(deviceJoinedLine({ ...mini, found: { git: true, claudeCode: false } })).toBe(
      "Mac mini joined your devices. It has git, and no Claude Code or sign-ins yet.",
    );
    expect(deviceJoinedLine({ ...mini, found: { git: false, claudeCode: false } })).toBe(
      "Mac mini joined your devices. It has no git, Claude Code or sign-ins yet.",
    );
    expect(deviceJoinedLine(builder)).toBe(
      "Running as Builder is set up. It runs work only, and has no sign-ins yet.",
    );
    expect(deviceJoinedLine({ name: "MacBook Air", kind: "view" })).toBe(
      "MacBook Air joined. It can control your first mate. Your first mate's tasks and conversation stay on this computer.",
    );
    // A Mac joined at its first launch can do both; one a command set up says what it has.
    expect(deviceJoinedLine({ name: "iMac", kind: "mac", user: "sam", onThisMac: false })).toBe(
      "iMac joined. It can control your first mate and run its work. Your first mate's tasks and conversation stay on this computer.",
    );
    expect(deviceJoinedLine({ ...mini, kind: "mac", found: { git: true, claudeCode: true } })).toBe(
      "Mac mini joined your devices. It has git and Claude Code, and no sign-ins yet.",
    );
  });

  it("lets a Mac control and run work, a Mac saved before only what it did, and another user only run work", () => {
    expect([deviceControls("mac"), deviceRunsWork("mac")]).toEqual([true, true]);
    expect([deviceControls("view"), deviceRunsWork("view")]).toEqual([true, false]);
    expect([deviceControls("work"), deviceRunsWork("work")]).toEqual([false, true]);
    expect(deviceMayBe("mac", "view") && deviceMayBe("mac", "work")).toBe(true);
    expect(deviceMayBe("view", "work") || deviceMayBe("work", "view")).toBe(false);
  });

  it("says what Remove stops and what it did", () => {
    expect(deviceWords.removeStops({ ...mini, tasks: 1, runs: ["website"] })).toBe(
      "Its task on website stops, and its unmerged work comes to me first.",
    );
    expect(deviceWords.removeStops({ ...mini, tasks: 0 })).toBe(
      "Its unmerged work comes to me first.",
    );
    expect(deviceWords.removed({ ...mini, runs: ["website", "api"] })).toBe(
      "Removed Mac mini. website and api run on this computer now.",
    );
    expect(deviceWords.removed({ ...builder, runs: [] })).toBe("Removed Running as Builder.");
    expect(deviceWords.removed({ ...mini, removal: "when-back" })).toBe(
      "Mac mini is removed once it is back",
    );
    expect(deviceWords.removed({ ...mini, kind: "view" })).toBe("Removed Mac mini");
  });
});

// The captain's choice B on the updating plan: for the first minute after
// Infinitary starts on the home, a work computer not back yet reads
// connecting, so an update round never flashes out of reach.
describe("a computer's reach in the first minute after the home starts", () => {
  const startedAt = 1_000_000;
  it("reads connecting until it is heard from or the minute ends, then its own reach", () => {
    const pairedAt = startedAt - 86_400_000;
    const at = (now: number, seenAt?: number) =>
      reachAfterStart("out-of-reach", { startedAt, now, seenAt, pairedAt });
    expect(at(startedAt + 5_000)).toBe("connecting");
    expect(at(startedAt + 5_000, startedAt - 60_000)).toBe("connecting");
    // Heard from since the start, and gone again: a real absence.
    expect(at(startedAt + 5_000, startedAt + 2_000)).toBe("out-of-reach");
    expect(at(startedAt + STARTUP_CONNECTING_MS)).toBe("out-of-reach");
    // Joined since the start, it has nothing to come back from.
    expect(
      reachAfterStart("out-of-reach", {
        startedAt,
        now: startedAt + 5_000,
        seenAt: undefined,
        pairedAt: startedAt + 1_000,
      }),
    ).toBe("out-of-reach");
    for (const reach of ["in-reach", "reconnecting", "connecting"] as const)
      expect(
        reachAfterStart(reach, { startedAt, now: startedAt, seenAt: undefined, pairedAt }),
      ).toBe(reach);
  });
});

// AGENTS.md: text served to a model stays English. Automatic's wait words and
// Remove's refusal are saved on the record, so updating reads in English there.
describe("a computer's away word served to a model", () => {
  it("stays English whatever the person's language, while the screen word follows it", () => {
    const was = currentLanguage();
    setCurrentLanguage("de");
    try {
      expect(servedAwayWord(false, true)).toBe("updating");
      expect(m.devicesAwayUpdating()).not.toBe("updating");
    } finally {
      setCurrentLanguage(was);
    }
  });
});
