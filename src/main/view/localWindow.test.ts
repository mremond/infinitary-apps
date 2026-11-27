import { CONTRACT_CHANGES } from "@core/connection/contractChanges";
import { HomeLink, type HomeLinkState } from "@core/devices/homeLink";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalWindow } from "./localWindow";
import { PROJECT_ADVISORY_WORKFLOWS } from "./projectMoveReset";

afterEach(() => {
  vi.useRealTimers();
});

// INF-4680's window-first cut, "notice the first mate at once": the window waited up to a
// second after its first mate's door opened, because it dialed only once a second after its
// first three tries.
describe("the window on its first mate's own computer while the first mate starts", () => {
  it("dials the door again within a tenth of a second wherever in the start it opens", async () => {
    vi.useFakeTimers();
    const dials: number[] = [];
    const window = new LocalWindow({
      door: "/no/door/yet",
      broadcast: () => {},
      link: (options) =>
        new HomeLink({
          ...options,
          dial: async () => {
            dials.push(Date.now());
            throw new Error("The first mate on this computer is not open.");
          },
        }),
    });
    const startedAt = Date.now();
    try {
      // The door opens anywhere in a first mate's start of several seconds.
      for (const opensAt of [400, 1_300, 2_950, 4_700, 8_000]) {
        await vi.advanceTimersByTimeAsync(startedAt + opensAt - Date.now());
        await vi.advanceTimersByTimeAsync(100);
        expect(
          dials.some((at) => at > startedAt + opensAt && at <= startedAt + opensAt + 100),
        ).toBe(true);
      }
    } finally {
      window.close();
    }
  });
});

// docs/forge.md, "Advisory workflows": the window beside a command forwards
// each request over this door, and that command's first mate may be older
// than the window, so it may not read the advisory reset a move showed.
describe("a project move the window sends its first mate on this computer", () => {
  it("leaves out the shown advisory reset for a first mate that does not read it", async () => {
    let changes: HomeLinkState["homeChanges"] = null;
    const invoke = vi.fn(async () => ({}));
    const window = new LocalWindow({
      door: "/no/door/needed",
      broadcast: () => {},
      link: () => ({
        start: () => {},
        state: () => ({
          contact: "in-reach",
          access: "full",
          homeVersion: null,
          homeChanges: changes,
          name: null,
          takesWork: null,
          onHomeMac: null,
          heardAt: null,
          removed: false,
        }),
        invoke: invoke as never,
        connection: () => null,
        close: () => {},
      }),
    });
    const address = {
      origin: "https://github.com/examples/project-next.git",
      advisoryWorkflowsCleared: [".github/workflows/early-tests.yml"],
    };
    const target = { contributionDestination: "fork", advisoryWorkflowsCleared: [] };
    const send = async () => {
      invoke.mockClear();
      await window.dispatch("inf:repos:configure", ["project-1", address]);
      await window.dispatch("inf:repos:configure", ["project-1", target]);
      return invoke.mock.calls;
    };
    try {
      changes = CONTRACT_CHANGES.names.filter((name) => name !== PROJECT_ADVISORY_WORKFLOWS);
      expect(await send()).toEqual([
        ["inf:repos:configure", ["project-1", { origin: address.origin }]],
        ["inf:repos:configure", ["project-1", { contributionDestination: "fork" }]],
      ]);
      changes = [...CONTRACT_CHANGES.names];
      expect(await send()).toEqual([
        ["inf:repos:configure", ["project-1", address]],
        ["inf:repos:configure", ["project-1", target]],
      ]);
    } finally {
      window.close();
    }
  });
});
