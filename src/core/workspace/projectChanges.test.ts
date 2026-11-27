import { tmpdir } from "node:os";
import type { Card } from "@shared/cards";
import type { DeviceView } from "@shared/devices";
import { inLanguage } from "@shared/i18n/current";
import * as m from "@shared/i18n/messages.generated";
import { wordSaidMarks } from "@shared/i18n/said";
import { AUTOMATIC_COMPUTER } from "@shared/placement";
import type { RepoView } from "@shared/repos";
import { describe, expect, it } from "vitest";
import type { CoreDispatch } from "../dispatcher";
import { ProjectChanges } from "./projectChanges";
import type { RepoRegistry } from "./repoRegistry";

const WEBSITE: RepoView = {
  id: "repo-website",
  name: "website",
  path: "/Users/someone/code/website",
  setupKind: "adopt",
  kind: "project",
  origin: "https://github.com/someone/website.git",
  host: { kind: "github", name: "github.com" },
  delivery: "direct-pr",
  autonomy: false,
  rigor: null,
  runsOn: null,
};

// The design skill's ChangeCard: "The primary Apply change and ghost Not now
// are the only buttons" (INF-407).
describe("the app's exact-change card", () => {
  it("INF-1117: scopes use exact captain words or the existing Before/After change card", async () => {
    let current = { ...WEBSITE, scope: "Our public website." };
    const raised: Omit<Card, "author" | "priority" | "status" | "createdAt">[] = [];
    const changes = new ProjectChanges({
      repos: { get: () => current, checkDetails: async () => {} } as unknown as RepoRegistry,
      devices: () => [],
      raiseCard: (card) => raised.push(card),
      tell: () => {},
    });
    changes.bindDispatch((async (channel: string, args: unknown[]) => {
      if (channel === "inf:repos:list") return [current];
      if (channel === "inf:repos:configure") {
        current = { ...current, ...(args[1] as object) };
        return current;
      }
      throw new Error(`No ${channel} here.`);
    }) as CoreDispatch);
    const scope = "Public website and member announcements.";
    await changes.request(
      "project-settings",
      { repoId: WEBSITE.id, changes: { scope } },
      {
        kind: "firstmate",
        wake: "captain",
        projectWords: true,
        evidence: `Set website's scope to ${scope}`,
      },
    );
    expect(current.scope).toBe(scope);
    expect(raised).toHaveLength(0);
    await changes.request(
      "project-settings",
      { repoId: WEBSITE.id, changes: { scope: null } },
      { kind: "firstmate", wake: "other" },
    );
    expect(current.scope).toBe(scope);
    expect(raised[0]?.body).toContain(scope);
    expect(raised[0]?.body).toContain("Not set");
    await changes.apply(
      raised[0]?.actions[0]?.effect?.kind === "host" ? raised[0].actions[0].effect.arg : undefined,
    );
    expect(current.scope).toBeNull();
  });

  // INF-2114: the plan's "the first mate also on your word" reaches Require
  // pull request checks through this card wherever the captain's exact words
  // do not apply, and the project keeps the setting as its no-checks record.
  it("words Require pull request checks from the project's record and the change", async () => {
    const row = async (project: RepoView, requireChecks: boolean) => {
      const raised: Omit<Card, "author" | "priority" | "status" | "createdAt">[] = [];
      const changes = new ProjectChanges({
        repos: { get: () => project, checkDetails: async () => {} } as unknown as RepoRegistry,
        devices: () => [],
        raiseCard: (card) => raised.push(card),
        tell: () => {},
      });
      changes.bindDispatch((async (channel: string) => {
        if (channel === "inf:repos:list") return [project];
        throw new Error(`No ${channel} here.`);
      }) as CoreDispatch);
      await changes.request(
        "project-settings",
        { repoId: project.id, changes: { requireChecks } },
        { kind: "firstmate", wake: "other" },
      );
      const cells = raised[0]?.body.match(
        /<tr><th>Require pull request checks<\/th><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><\/tr>/,
      );
      return cells?.slice(1);
    };
    expect(await row(WEBSITE, false)).toEqual(["On", "Off"]);
    expect(await row({ ...WEBSITE, noChecks: { at: 1, task: "INF-7" } }, true)).toEqual([
      "Off",
      "On",
    ]);
  });

  // docs/forge.md, "Advisory workflows": the registry clears a list chosen
  // for another repository, so the card shows it before the click. The
  // detected address arrives the way a folder whose remote changed reports it.
  it("shows the advisory workflows becoming none when the address names another repository", async () => {
    const project: RepoView = {
      ...WEBSITE,
      path: tmpdir(),
      advisoryWorkflows: [".github/workflows/early-tests.yml"],
    };
    const raised: Omit<Card, "author" | "priority" | "status" | "createdAt">[] = [];
    const changes = new ProjectChanges({
      repos: {
        get: () => project,
        checkDetails: async () => {},
        detectedOrigin: async () => "https://github.com/someone-else/website.git",
      } as unknown as RepoRegistry,
      devices: () => [],
      raiseCard: (card) => raised.push(card),
      tell: () => {},
    });
    changes.bindDispatch((async (channel: string) => {
      if (channel === "inf:repos:list") return [project];
      throw new Error(`No ${channel} here.`);
    }) as CoreDispatch);
    // The row as a reader in `language` sees the saved card: the window
    // words its runs of the app's own words as it draws it.
    const advisoryRow = (body: string | undefined, language = "en") =>
      inLanguage(language, () =>
        [...wordSaidMarks(body ?? "").matchAll(/<tr>(.*?)<\/tr>/g)]
          .map(([, row]) =>
            [...(row ?? "").matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(([, cell]) =>
              (cell ?? "").replace(/<[^>]+>/g, ""),
            ),
          )
          .find(([label]) => label === m.settingsProjectsAdvisoryTitle())
          ?.slice(1),
      );
    await changes.inspect(project.id);
    expect(advisoryRow(raised[0]?.body)).toEqual([
      ".github/workflows/early-tests.yml",
      m.settingsProjectsAdvisoryNone(),
    ]);
    expect(advisoryRow(raised[0]?.body, "fr")).toEqual([
      ".github/workflows/early-tests.yml",
      "Aucun",
    ]);
    await changes.request(
      "project-settings",
      { repoId: project.id, changes: { origin: "git@github.com:Someone/Website.git" } },
      { kind: "firstmate", wake: "other" },
    );
    expect(raised[1]?.body).toContain("git@github.com:Someone/Website.git");
    expect(advisoryRow(raised[1]?.body)).toBeUndefined();
  });

  it("offers a primary Apply change as the default and a ghost Not now", async () => {
    const raised: Omit<Card, "author" | "priority" | "status" | "createdAt">[] = [];
    const changes = new ProjectChanges({
      repos: { get: (id: string) => (id === WEBSITE.id ? WEBSITE : undefined) } as RepoRegistry,
      devices: () => [],
      raiseCard: (card) => raised.push(card),
      tell: () => {},
    });
    changes.bindDispatch((async (channel: string) => {
      if (channel === "inf:repos:list") return [WEBSITE];
      throw new Error(`No ${channel} here.`);
    }) as CoreDispatch);
    // The first mate asks, with no captain words behind it, to run website
    // on whichever computer has room.
    const { cardId } = await changes.request(
      "project-runs-on",
      { repoId: WEBSITE.id, deviceId: AUTOMATIC_COMPUTER },
      { kind: "firstmate", wake: "other" },
    );
    expect(cardId).toBe(raised[0]?.id);
    expect(
      raised[0]?.actions.map(({ label, variant, default: isDefault }) => ({
        label,
        variant,
        default: isDefault === true,
      })),
    ).toEqual([
      { label: "Apply change", variant: "primary", default: true },
      { label: "Not now", variant: "ghost", default: false },
    ]);
  });
});

// INF-1582: the project-change owner resolves names before applying or offering a change.
describe("named project placement", () => {
  it("keeps IDs for exact words and proposals, including an offline computer later renamed", async () => {
    let current = { ...WEBSITE };
    let devices: DeviceView[] = [
      { id: "mini-1", name: "Kun's Mac mini", kind: "work", pairedAt: 1, inReach: false },
    ];
    const raised: Omit<Card, "author" | "priority" | "status" | "createdAt">[] = [];
    const sent: unknown[][] = [];
    const changes = new ProjectChanges({
      repos: { get: () => current } as unknown as RepoRegistry,
      devices: () => devices,
      raiseCard: (card) => raised.push(card),
      tell: () => {},
    });
    changes.bindDispatch((async (channel: string, args: unknown[]) => {
      if (channel === "inf:repos:list") return [current];
      if (channel === "inf:devices:runs-on") {
        sent.push(args);
        current = { ...current, runsOn: args[1] as string | null };
        return current;
      }
      throw new Error(`No ${channel} here.`);
    }) as CoreDispatch);
    await changes.request(
      "project-runs-on",
      { repoId: WEBSITE.id, deviceId: "Kun's Mac mini" },
      {
        kind: "firstmate",
        wake: "captain",
        projectWords: true,
        evidence: "Run website on Kun's Mac mini.",
      },
    );
    expect(sent).toEqual([[WEBSITE.id, "mini-1"]]);
    expect(raised).toHaveLength(0);
    current = { ...current, runsOn: null };
    await changes.request(
      "project-runs-on",
      { repoId: WEBSITE.id, deviceId: "Kun's Mac mini" },
      { kind: "firstmate", wake: "other" },
    );
    expect(sent).toHaveLength(1);
    const effect = raised[0]?.actions[0]?.effect;
    if (effect?.kind !== "host") throw new Error("Missing exact-change host effect");
    devices = [
      {
        ...devices[0],
        id: "mini-1",
        name: "Renamed mini",
        kind: "work",
        pairedAt: 1,
        inReach: false,
      },
    ];
    await changes.apply(effect.arg);
    expect(sent).toEqual([
      [WEBSITE.id, "mini-1"],
      [WEBSITE.id, "mini-1"],
    ]);

    devices.push({
      ...devices[0],
      id: "mini-2",
      name: "Renamed mini",
      kind: "work",
      pairedAt: 1,
      inReach: false,
    });
    await expect(
      changes.request(
        "project-runs-on",
        { repoId: WEBSITE.id, deviceId: "Renamed mini" },
        { kind: "firstmate", wake: "captain", projectWords: true, evidence: "Run on Renamed mini" },
      ),
    ).rejects.toThrow(/More than one/);
    devices = [{ id: "view-1", name: "Phone", kind: "view", pairedAt: 1, inReach: false }];
    await expect(
      changes.request(
        "project-runs-on",
        { repoId: WEBSITE.id, deviceId: "Phone" },
        { kind: "firstmate", wake: "other" },
      ),
    ).rejects.toThrow(/No computer/);
    expect(sent).toHaveLength(2);
    expect(raised).toHaveLength(1);
  });
});
