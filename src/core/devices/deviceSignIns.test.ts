import { type DeviceSsh, type DeviceView, reachFrom } from "@shared/devices";
import * as m from "@shared/i18n/messages.generated";
import { PROTOCOL_VERSION } from "@shared/ipc";
import type { ComputerSignIns, DeviceSignIns as DeviceSignInsView } from "@shared/signIns";
import { describe, expect, it, vi } from "vitest";
import type { WorkDeviceContact } from "../connection/connection";
import { DeviceSignIns } from "./deviceSignIns";

/**
 * Every surface that draws a computer out of reach says "connecting" for one
 * whose connection is being made (captain, INF-49); the sign-ins view carries
 * it to Subscriptions, Projects' Runs on and the device forge rows.
 */

const MINI: DeviceView = { id: "mini", kind: "work", name: "Mac mini", pairedAt: 1 };

function view(inReach: boolean, ssh: DeviceSsh | undefined) {
  const signIns = new DeviceSignIns({
    devices: () => [MINI],
    work: {
      ask: async () => {
        throw new Error("not asked");
      },
      onWorkDevice: () => () => {},
      inReach: () => inReach,
      version: () => undefined,
    },
    emit: () => {},
    broadcastEvent: () => {},
    reachOf: () => reachFrom({ inReach, ssh }),
  });
  const [only] = signIns.view();
  signIns.dispose();
  return only;
}

describe("a computer's sign-ins view", () => {
  // The captain's choice B on the updating plan: the first minute after start
  // reads connecting, and once it ends Runs on and the sign-ins say out of
  // reach though the list itself did not move.
  it("pushes again when the reach its view says moves, with the list unchanged", () => {
    let reach: "connecting" | "out-of-reach" = "connecting";
    const pushed: DeviceSignInsView[][] = [];
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask: async () => {
          throw new Error("not asked");
        },
        onWorkDevice: () => () => {},
        inReach: () => false,
        version: () => undefined,
      },
      emit: (channel, payload) => {
        if (channel === "inf:devices:sign-ins") pushed.push(payload as DeviceSignInsView[]);
      },
      broadcastEvent: () => {},
      reachOf: () => reach,
    });
    try {
      signIns.reachChanged([MINI]);
      expect(pushed.at(-1)?.[0]?.reach).toBe("connecting");
      signIns.reachChanged([MINI]);
      expect(pushed).toHaveLength(1);
      reach = "out-of-reach";
      signIns.reachChanged([MINI]);
      expect(pushed.at(-1)?.[0]?.reach).toBe("out-of-reach");
    } finally {
      signIns.dispose();
    }
  });

  // Accepted token-command plan: an older work computer must not silently keep a fixed key instead.
  it("forwards a token command only to a computer advertising that capability", async () => {
    // A computer on the major before token commands were folded in has them only by name.
    let contract = "15.0.0";
    const changes: string[] = [];
    const ask = vi.fn(async () => ({ listed: [] }));
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask,
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => ({ contract, takesWork: true, changes: [...changes] }),
      },
      emit: () => {},
      broadcastEvent: () => {},
    });
    try {
      const args = [
        { tokenCommand: { command: "company-token --audience claude", refreshSeconds: 300 } },
      ];
      await expect(signIns.custom(MINI.id, "inf:sign-ins:custom-connect", args)).rejects.toThrow(
        "before saving a token command",
      );
      expect(ask).not.toHaveBeenCalled();
      changes.push("custom-token-command");
      await expect(signIns.custom(MINI.id, "inf:sign-ins:custom-connect", args)).resolves.toEqual({
        listed: [],
      });
      expect(ask).toHaveBeenCalledWith(MINI.id, "inf:sign-ins:custom-connect", args);
      // A computer on this major has them without listing the name.
      contract = PROTOCOL_VERSION;
      changes.length = 0;
      await expect(signIns.custom(MINI.id, "inf:sign-ins:custom-connect", args)).resolves.toEqual({
        listed: [],
      });
      expect(ask).toHaveBeenCalledTimes(2);
    } finally {
      signIns.dispose();
    }
  });
  // INF-4275: an older computer cannot save Keep going on credits, so the home never sends it.
  it("sends Keep going on credits only to a computer that lists the change, for an account it has", async () => {
    const changes: string[] = [];
    const ask = vi.fn(async (_deviceId: string, channel: string) =>
      channel === "inf:sign-ins:list"
        ? {
            providers: [],
            accounts: [
              {
                id: "acct-codex",
                providerId: "openai-codex",
                kind: "subscription_oauth",
                label: "Work",
                enabled: true,
                connected: true,
                pinned: false,
                createdAt: 1,
              },
            ],
            quota: null,
          }
        : { ok: true },
    );
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask,
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => ({ contract: PROTOCOL_VERSION, takesWork: true, changes: [...changes] }),
      },
      emit: () => {},
      broadcastEvent: () => {},
    });
    try {
      await signIns.refresh(MINI.id);
      expect(signIns.view()[0]?.keepGoing).toBe(false);
      await expect(signIns.keepGoing(MINI.id, "acct-codex", true)).rejects.toThrow(
        "Update Infinitary on Mac mini to keep going on credits there.",
      );
      changes.push("computer-keep-going");
      expect(signIns.view()[0]?.keepGoing).toBe(true);
      await expect(signIns.keepGoing(MINI.id, "acct-elsewhere", true)).rejects.toThrow(
        "Mac mini has no account with that id.",
      );
      await expect(signIns.keepGoing(MINI.id, "acct-codex", true)).resolves.toEqual({ ok: true });
      expect(ask.mock.calls.filter(([, channel]) => channel === "inf:sign-ins:keep-going")).toEqual(
        [[MINI.id, "inf:sign-ins:keep-going", [{ accountId: "acct-codex", on: true }]]],
      );
    } finally {
      signIns.dispose();
    }
  });
  // INF-5478's plan, piece 1: a computer's own Codex account's saved reset is
  // used there, never by the home, and only on a computer that takes the order.
  it("uses a computer's own saved reset there only when it lists the change, and answers with what it came to", async () => {
    const changes: string[] = [];
    const broadcast = vi.fn();
    const ask = vi.fn(async (_deviceId: string, channel: string, _args: unknown[]) =>
      channel === "inf:sign-ins:list"
        ? {
            providers: [],
            accounts: [
              {
                id: "acct-codex",
                providerId: "openai-codex",
                kind: "subscription_oauth",
                label: "Work",
                enabled: true,
                connected: true,
                pinned: false,
                createdAt: 1,
              },
            ],
            quota: null,
          }
        : { ok: true },
    );
    let contactOf: ((contact: WorkDeviceContact) => void) | undefined;
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask,
        onWorkDevice: (listener) => {
          contactOf = listener;
          return () => {};
        },
        inReach: () => true,
        version: () => ({ contract: PROTOCOL_VERSION, takesWork: true, changes: [...changes] }),
      },
      emit: () => {},
      broadcastEvent: broadcast,
    });
    try {
      await signIns.refresh(MINI.id);
      expect(signIns.view()[0]?.savedReset).toBeUndefined();
      await expect(signIns.redeemSavedReset(MINI.id, "acct-codex", true)).rejects.toThrow(
        "Update Infinitary on Mac mini to use a saved reset there.",
      );
      expect(ask.mock.calls.map(([, channel]) => channel)).not.toContain(
        "inf:sign-ins:use-saved-reset",
      );
      // Its reason stays under the account's row, where a card's press lands.
      expect(signIns.view()[0]?.flows).toEqual([
        expect.objectContaining({
          accountId: "acct-codex",
          ended: expect.objectContaining({
            outcome: "failed",
            error: "Update Infinitary on Mac mini to use a saved reset there.",
          }),
        }),
      ]);
      changes.push("use-saved-reset");
      expect(signIns.view()[0]?.savedReset).toBe(true);
      const used = signIns.redeemSavedReset(MINI.id, "acct-codex", true);
      await vi.waitFor(() =>
        expect(ask.mock.calls.some(([, c]) => c === "inf:sign-ins:use-saved-reset")).toBe(true),
      );
      const [, , [order]] = ask.mock.calls.find(
        ([, channel]) => channel === "inf:sign-ins:use-saved-reset",
      ) as [string, string, [{ signInId: string; accountId: string; signIn: boolean }]];
      expect(order).toMatchObject({ accountId: "acct-codex", signIn: true });
      // Its sign-in shows under the account's row while it runs, in place of the refusal.
      expect(signIns.view()[0]?.flows).toEqual([
        expect.objectContaining({ signInId: order.signInId, accountId: "acct-codex" }),
      ]);
      // A second press while it runs is refused, and sends nothing.
      await expect(signIns.redeemSavedReset(MINI.id, "acct-codex", true)).rejects.toThrow(
        m.accountsSavedResetBusy({ account: "Codex · Work" }),
      );
      // A sign-in started there meanwhile runs beside it and cancels nothing.
      await signIns.start(MINI.id, "anthropic-claude", "oauth");
      expect(ask.mock.calls.map(([, channel]) => channel)).not.toContain("inf:sign-ins:cancel");
      expect(ask.mock.calls.filter(([, c]) => c === "inf:sign-ins:use-saved-reset")).toHaveLength(
        1,
      );
      signIns.step(MINI.id, {
        signInId: order.signInId,
        step: {
          kind: "ended",
          outcome: "signed-in",
          accountId: "acct-codex",
          savedReset: { outcome: "used", left: 1 },
        },
      });
      await expect(used).resolves.toEqual({ outcome: "used", left: 1 });
      // Nothing new was signed in, so no signed-in line: the use's own line says what it came to.
      expect(broadcast).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "device_signed_in" }),
      );

      // A use that failed there says that computer's words.
      const failed = signIns.redeemSavedReset(MINI.id, "acct-codex", false);
      await vi.waitFor(() =>
        expect(ask.mock.calls.filter(([, c]) => c === "inf:sign-ins:use-saved-reset")).toHaveLength(
          2,
        ),
      );
      const [, , [second]] = ask.mock.calls
        .filter(([, channel]) => channel === "inf:sign-ins:use-saved-reset")
        .at(-1) as [string, string, [{ signInId: string }]];
      signIns.step(MINI.id, {
        signInId: second.signInId,
        step: { kind: "ended", outcome: "failed", error: "Codex is not signed in there." },
      });
      await expect(failed).rejects.toThrow("Codex is not signed in there.");

      // Cancel under the row asks that computer to stop, and the use stays until its own end arrives.
      const orders = () =>
        ask.mock.calls.filter(([, channel]) => channel === "inf:sign-ins:use-saved-reset");
      const stopped = signIns.redeemSavedReset(MINI.id, "acct-codex", false);
      await vi.waitFor(() => expect(orders()).toHaveLength(3));
      const [, , [third]] = orders().at(-1) as [string, string, [{ signInId: string }]];
      await signIns.cancel(third.signInId);
      expect(ask).toHaveBeenCalledWith(MINI.id, "inf:sign-ins:cancel", [
        { signInId: third.signInId },
      ]);
      expect(signIns.view()[0]?.flows).toContainEqual(
        expect.objectContaining({ signInId: third.signInId, phase: "running" }),
      );
      signIns.step(MINI.id, {
        signInId: third.signInId,
        step: {
          kind: "ended",
          outcome: "signed-in",
          accountId: "acct-codex",
          savedReset: { outcome: "used", left: 0 },
        },
      });
      await expect(stopped).resolves.toEqual({ outcome: "used", left: 0 });

      // A reconnect while it runs says its outcome is unknown, never that it stopped.
      const lost = signIns.redeemSavedReset(MINI.id, "acct-codex", false);
      await vi.waitFor(() => expect(orders()).toHaveLength(4));
      contactOf?.({ deviceId: MINI.id, contact: "in-reach" });
      await expect(lost).rejects.toThrow(m.accountsSavedResetUnclear({ account: "Codex · Work" }));
    } finally {
      signIns.dispose();
    }
  });
  // INF-5484's review: turning Use saved resets on their own on or off there uses no reset, so it never gets a use's words.
  it("turns a computer's switch on as a sign-in, and off with no flow unless it is refused, its reason under the row", async () => {
    let refuseOff = false;
    let inReach = true;
    const ask = vi.fn(async (_deviceId: string, channel: string, args: unknown[]) => {
      if (channel === "inf:sign-ins:list")
        return {
          providers: [],
          accounts: [
            {
              id: "acct-codex",
              providerId: "openai-codex",
              kind: "subscription_oauth",
              label: "Work",
              enabled: true,
              connected: true,
              pinned: false,
              createdAt: 1,
            },
          ],
          quota: null,
        };
      if (refuseOff && (args[0] as { on?: boolean } | undefined)?.on === false)
        throw new Error("This computer has no account with that id.");
      return { ok: true };
    });
    let contactOf: ((contact: WorkDeviceContact) => void) | undefined;
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask,
        onWorkDevice: (listener) => {
          contactOf = listener;
          return () => {};
        },
        inReach: () => inReach,
        version: () => ({
          contract: PROTOCOL_VERSION,
          takesWork: true,
          changes: ["use-saved-reset", "auto-saved-resets"],
        }),
      },
      emit: () => {},
      broadcastEvent: () => {},
    });
    const orders = () =>
      ask.mock.calls.filter(([, channel]) => channel === "inf:sign-ins:use-saved-resets");
    try {
      await signIns.refresh(MINI.id);
      // Off: that computer saves it and answers, and no flow shows under the row.
      await expect(signIns.setUseSavedResets(MINI.id, "acct-codex", false, false)).resolves.toEqual(
        { ok: true },
      );
      expect(orders()).toHaveLength(1);
      expect(orders()[0]?.[2]).toEqual([expect.objectContaining({ on: false, signIn: false })]);
      expect(signIns.view()[0]?.flows ?? []).toEqual([]);

      // On, and contact drops: it ends as a sign-in does, never with a reset use's unknown outcome.
      const turning = signIns.setUseSavedResets(MINI.id, "acct-codex", true, true);
      await vi.waitFor(() => expect(orders()).toHaveLength(2));
      contactOf?.({ deviceId: MINI.id, contact: "in-reach" });
      const failure = await turning.then(
        () => undefined,
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      expect(failure).toBe(
        "Mac mini reconnected, so the earlier sign-in stopped. Try signing in again.",
      );
      expect(failure).not.toBe(m.accountsSavedResetUnclear({ account: "Codex · Work" }));

      // A turn-off that computer refuses stays under the account's row, so the switch is not left on unseen.
      refuseOff = true;
      await expect(signIns.setUseSavedResets(MINI.id, "acct-codex", false, false)).rejects.toThrow(
        "This computer has no account with that id.",
      );
      const ends = () =>
        (signIns.view()[0]?.flows ?? [])
          .filter((flow) => flow.accountId === "acct-codex")
          .map((flow) => flow.ended?.error);
      expect(ends()).toContain("This computer has no account with that id.");
      // So does one refused before it is sent, with that computer out of reach.
      inReach = false;
      await expect(signIns.setUseSavedResets(MINI.id, "acct-codex", false, false)).rejects.toThrow(
        "Mac mini is out of reach, so nothing was sent.",
      );
      expect(ends()).toContain("Mac mini is out of reach, so nothing was sent.");
    } finally {
      signIns.dispose();
    }
  });
  // INF-4280's audit, fixes 1 and 3: an older computer cannot take the new orders, so the home never sends them.
  it("sends account settings and an allowance read only to a computer that lists the change", async () => {
    const changes: string[] = [];
    const ask = vi.fn(async (_deviceId: string, channel: string) =>
      channel === "inf:sign-ins:list"
        ? {
            providers: [],
            accounts: [
              {
                id: "acct-codex",
                providerId: "openai-codex",
                kind: "subscription_oauth",
                label: "Work",
                enabled: true,
                connected: true,
                pinned: false,
                createdAt: 1,
              },
            ],
            quota: null,
            forges: {
              signIns: [
                { host: "github.com", name: "GitHub", login: "octo", state: "ok", since: 1 },
              ],
              hosts: [{ host: "github.com", name: "GitHub" }],
            },
          }
        : { ok: true },
    );
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask,
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => ({ contract: PROTOCOL_VERSION, takesWork: true, changes: [...changes] }),
      },
      emit: () => {},
      broadcastEvent: () => {},
    });
    const sent = (channel: string) => ask.mock.calls.filter(([, asked]) => asked === channel);
    const pause = { kind: "set-enabled", accountId: "acct-codex", enabled: false } as const;
    try {
      await signIns.refresh(MINI.id);
      expect(signIns.view()[0]?.accountSettings).toBe(false);
      await expect(signIns.setAccount(MINI.id, pause)).rejects.toThrow(
        "Update Infinitary on Mac mini to change its accounts from here.",
      );
      // An older computer is only asked for its sign-ins again.
      const listed = sent("inf:sign-ins:list").length;
      await signIns.readAllowance();
      expect(sent("inf:sign-ins:read-allowance")).toEqual([]);
      expect(sent("inf:sign-ins:list").length).toBe(listed + 1);

      changes.push("computer-account-settings");
      expect(signIns.view()[0]?.accountSettings).toBe(true);
      await expect(
        signIns.setAccount(MINI.id, { ...pause, accountId: "acct-elsewhere" }),
      ).rejects.toThrow("Mac mini has no account with that id.");
      await expect(signIns.setAccount(MINI.id, pause)).resolves.toEqual({ ok: true });
      await signIns.setAccount(MINI.id, {
        kind: "pin",
        providerId: "openai-codex",
        accountId: null,
      });
      expect(sent("inf:sign-ins:set-enabled")).toEqual([
        [MINI.id, "inf:sign-ins:set-enabled", [{ accountId: "acct-codex", enabled: false }]],
      ]);
      expect(sent("inf:sign-ins:pin")).toEqual([
        [MINI.id, "inf:sign-ins:pin", [{ providerId: "openai-codex", accountId: null }]],
      ]);
      await signIns.readAllowance();
      expect(sent("inf:sign-ins:read-allowance")).toEqual([
        [MINI.id, "inf:sign-ins:read-allowance", []],
      ]);
      // INF-4280's audit, fix 2: a host it holds no sign-in to is refused before anything is sent.
      await expect(signIns.signOutForge(MINI.id, "gitlab.com")).rejects.toThrow(
        "Mac mini has no sign-in to gitlab.com. Signed in: github.com.",
      );
      expect(sent("inf:sign-ins:forge-out")).toEqual([]);
    } finally {
      signIns.dispose();
    }
  });
  // INF-2186: account posture narrowed the same remote model list for every task row.
  it("narrows each computer's sign-ins once per projection and drops the snapshot after a new answer", () => {
    const model = { provider: "openai-codex", id: "gpt-6.1-sol" };
    const older = { provider: model.provider, id: "gpt-6.0-sol" };
    let kept = [model.id];
    const protectedIds = vi.fn(() => kept);
    const answer: ComputerSignIns = {
      providers: [],
      quota: null,
      accounts: [
        {
          id: "work",
          providerId: model.provider,
          kind: "subscription_oauth",
          label: "Work",
          enabled: true,
          connected: true,
          pinned: false,
          createdAt: 1,
        },
      ],
      served: [{ accountId: "work", models: [model, older], accountList: [model.id] }],
    };
    const signIns = new DeviceSignIns({
      devices: () => [MINI],
      work: {
        ask: async () => {
          throw new Error("read should not ask");
        },
        onWorkDevice: () => () => {},
        inReach: () => true,
        version: () => undefined,
      },
      protectedIds,
      emit: () => {},
      broadcastEvent: () => {},
    });
    try {
      signIns.changed(MINI.id, answer);
      protectedIds.mockClear();
      for (let row = 0; row < 40; row += 1) signIns.lastSaid(MINI.id);
      const baseline = protectedIds.mock.calls.length;
      protectedIds.mockClear();
      signIns.readProjection(() => {
        for (let row = 0; row < 40; row += 1)
          expect(signIns.lastSaid(MINI.id)?.served?.[0]?.models).toEqual([model]);
        expect(protectedIds).toHaveBeenCalledTimes(1);
        signIns.changed(MINI.id, {
          ...answer,
          served: [
            { accountId: "work", models: [model, older], accountList: [model.id, older.id] },
          ],
        });
        expect(signIns.lastSaid(MINI.id)?.served?.[0]?.models).toEqual([model, older]);
        expect(protectedIds).toHaveBeenCalledTimes(2);
      });
      expect(baseline).toBe(40);
      signIns.changed(MINI.id, answer);
      kept = [model.id, older.id];
      // A new projection re-reads the rail; the missing kept model refuses narrowing.
      signIns.readProjection(() =>
        expect(signIns.lastSaid(MINI.id)?.served?.[0]?.models).toEqual([model, older]),
      );
    } finally {
      signIns.dispose();
    }
  });
  it("says connecting only for a computer out of reach whose connection is being made", () => {
    expect(view(false, { state: "connecting" })).toMatchObject({
      reach: "connecting",
    });
    for (const state of ["reconnecting", "at-login", "not-started", "stopped"] as const)
      expect(view(false, { state })?.reach).toBe(
        state === "reconnecting" ? "reconnecting" : "out-of-reach",
      );
    expect(view(false, undefined)?.reach).toBe("out-of-reach");
    expect(view(true, { state: "connecting" })?.reach).toBe("in-reach");
  });
});
