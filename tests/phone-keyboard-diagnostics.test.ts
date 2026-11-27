import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readPhoneKeyProcessNames } from "../scripts/phone-key-processes";
import { hostEnv } from "../src/core/hostEnv";
import { deferred } from "./helpers/deferred";
import { startPhoneHome } from "./helpers/phoneHome";
import {
  PhoneKeyRegistrations,
  phoneKeyOutcome,
  phoneLogMilliseconds,
} from "./helpers/phoneKeyboard";
import {
  PhoneKeyRoutingDiagnostics,
  phoneKeyboardError,
  phoneKeyDiagnosticDestinations,
} from "./helpers/phoneKeyboardDiagnostics";
import { scratchDir } from "./helpers/scratchDirs";

beforeEach(() => {
  vi.stubEnv("PI_OFFLINE", "1");
  for (const name of [
    "INFINITARY_CONNECTION_LOOPBACK_PORT",
    "INFINITARY_DNS_SD",
    "INFINITARY_GOOGLE_URL",
    "INFINITARY_PUSH_RELAY_URL",
  ])
    vi.stubEnv(name, process.env[name]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Diagnostic = { phase: string; event: string; id: string; errors?: unknown[] };
function captureDiagnostics(onRecord?: (record: Diagnostic) => void) {
  const records: Diagnostic[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    if (typeof line !== "string" || !line.startsWith("Phone keyboard diagnostic: ")) return;
    const record = JSON.parse(line.slice("Phone keyboard diagnostic: ".length)) as Diagnostic;
    records.push(record);
    onRecord?.(record);
  });
  return { records, restore: () => spy.mockRestore() };
}

// The approved diagnostic ask requires typed error chains, never control URLs or authentication material.
test("real malformed control requests retain their error type and correlation without logging their body or headers", async () => {
  const diagnostic = captureDiagnostics();
  const home = await startPhoneHome(scratchDir("infinitary-keyboard-diagnostic-"), {
    start: async () => {},
    stop: async () => {},
    keyboardReady: async () => {
      throw new Error("Malformed requests must not reach registration");
    },
  });
  const correlation = randomUUID();
  const authorization = randomUUID();
  try {
    const response = await fetch(`${home.url}/keyboard-ready`, {
      method: "POST",
      body: home.url,
      headers: {
        authorization: `Bearer ${authorization}`,
        "x-phone-keyboard-diagnostic-id": correlation,
      },
    });
    await response.text();
    expect(response.status).toBe(500);
    const records = diagnostic.records.filter((record) => record.id === correlation);
    expect(records.find((record) => record.event === "owner-failed")?.errors).toEqual([
      { type: "SyntaxError" },
    ]);
    expect(records.map((record) => record.event)).toContain("response-finished");
    const printed = JSON.stringify(diagnostic.records);
    expect(printed).not.toContain(home.url);
    expect(printed).not.toContain(authorization);
  } finally {
    await home.close();
    diagnostic.restore();
  }
});

// The cancellation investigation needs the disconnected response distinguished from the still-running owner.
test("a real disconnected registration request is recorded before its observer subsequently fails", async () => {
  const closed = deferred<void>();
  const failed = deferred<void>();
  const started = deferred<void>();
  const diagnostic = captureDiagnostics((record) => {
    if (record.phase !== "keyboard-ready") return;
    if (record.event === "response-closed") closed.resolve();
    if (record.event === "owner-failed") failed.resolve();
  });
  const registrations = new PhoneKeyRegistrations();
  const home = await startPhoneHome(scratchDir("infinitary-keyboard-disconnect-"), {
    start: async () => {},
    stop: async () => {},
    keyboardReady: async (chord, diagnosticId) => {
      started.resolve();
      return registrations.wait(54571, chord, diagnosticId);
    },
  });
  const client = new AbortController();
  const correlation = randomUUID();
  try {
    const request = fetch(`${home.url}/keyboard-ready`, {
      method: "POST",
      body: JSON.stringify({ key: "[", modifiers: ["cmd"] }),
      signal: client.signal,
      headers: { "x-phone-keyboard-diagnostic-id": correlation },
    });
    const aborted = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await started.promise;
    client.abort();
    await aborted;
    expect(phoneKeyboardError(client.signal.reason)).toEqual([
      { type: "DOMException", code: DOMException.ABORT_ERR },
    ]);
    await closed.promise;
    expect(diagnostic.records.some((record) => record.event === "owner-failed")).toBe(false);
    registrations.close();
    await failed.promise;
    const events = diagnostic.records
      .filter((record) => record.phase === "keyboard-ready")
      .map((record) => record.event);
    expect(events.indexOf("response-closed")).toBeLessThan(events.indexOf("owner-failed"));
    expect([
      ...new Set(
        diagnostic.records
          .filter(
            (record) =>
              record.phase === "keyboard-ready" || record.phase === "registration-witness",
          )
          .map((record) => record.id),
      ),
    ]).toEqual([correlation]);
    expect(
      diagnostic.records
        .filter((record) => record.phase === "registration-witness")
        .map((record) => record.id),
    ).toEqual([correlation, correlation]);
    expect(diagnostic.records.find((record) => record.event === "owner-failed")?.errors).toEqual([
      { type: "Error" },
    ]);
  } finally {
    client.abort();
    registrations.close();
    await home.close();
    diagnostic.restore();
  }
});

test("the diagnostic chain retains a real filesystem cause code without its message or path", async () => {
  const missing = join(scratchDir("infinitary-keyboard-error-"), "missing");
  const error = await readFile(missing).catch(
    (cause: unknown) => new Error("Control request failed", { cause }),
  );
  expect(phoneKeyboardError(error)).toEqual([{ type: "Error" }, { type: "Error", code: "ENOENT" }]);
  expect(JSON.stringify(phoneKeyboardError(error))).not.toContain(missing);
});

// The approved Duo investigation needs the actual focus display and PID, not an inferred app destination.
test("extracts diagnostic destinations from the existing real open Duo Tab reading", () => {
  // Same public event fixture as phone-key-outcome.test.ts; that file owns the delivery verdict.
  const event =
    "sequence starting with Keyboard event: <sq: 0x10e1f4310; (<keyboardFocus; display: 8AF25958-F0CD-4018-B5E2-12C18B2E53A7; pid: 94709; token: 0xA8B58429>)>";
  expect(phoneKeyDiagnosticDestinations([event])).toEqual([
    {
      event,
      destinations: [
        { pid: 94709, display: "8AF25958-F0CD-4018-B5E2-12C18B2E53A7", token: "0xA8B58429" },
      ],
    },
  ]);
  expect(
    phoneKeyDiagnosticDestinations([
      "sequence starting with Keyboard event: <sq: 0x10c614540; (no destinations)>",
    ]),
  ).toEqual([
    {
      event: "sequence starting with Keyboard event: <sq: 0x10c614540; (no destinations)>",
      destinations: [],
    },
  ]);
});

// Diagnostic privacy requires dropping unused request fields before the asynchronous owner receives them.
test("a validated chord drops unused private fields before reaching its registration owner", async () => {
  const diagnostic = captureDiagnostics();
  const started = deferred<void>();
  const registrations = new PhoneKeyRegistrations();
  let received: unknown;
  const marker = randomUUID();
  const home = await startPhoneHome(scratchDir("infinitary-keyboard-projection-"), {
    start: async () => {},
    stop: async () => {},
    keyboardReady: async (chord, diagnosticId) => {
      received = chord;
      started.resolve();
      return registrations.wait(54571, chord, diagnosticId);
    },
  });
  try {
    const request = fetch(`${home.url}/keyboard-ready`, {
      method: "POST",
      body: JSON.stringify({
        key: "[",
        modifiers: ["cmd"],
        privateMarker: marker,
        id: marker,
        event: marker,
      }),
    });
    await started.promise;
    registrations.close();
    const response = await request;
    await response.text();
    expect(response.status).toBe(500);
    expect(received).toEqual({ key: "[", modifiers: ["cmd"] });
    expect(JSON.stringify(diagnostic.records)).not.toContain(marker);
  } finally {
    registrations.close();
    await home.close();
    diagnostic.restore();
  }
});

// This is the existing public open-Duo reading; the outcome-owner tests own its delivery verdict.
const duoRecord = {
  processImagePath: "/usr/libexec/backboardd",
  timestamp: "2026-11-19 11:14:03.663978-0800",
  eventMessage:
    "sequence starting with Keyboard event: <sq: 0x10e1f4310; (<keyboardFocus; display: 8AF25958-F0CD-4018-B5E2-12C18B2E53A7; pid: 94709; token: 0xA8B58429>)>",
};

test.each(["stalled", "failed"] as const)(
  "a %s identity read cannot replace or delay a completed key's HTTP response",
  async (mode) => {
    const diagnostic = captureDiagnostics();
    const missing = join(scratchDir("infinitary-keyboard-process-error-"), "missing");
    const routing = new PhoneKeyRoutingDiagnostics(
      mode === "stalled"
        ? (_pids, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            })
        : async () => {
            await readFile(missing);
            return "";
          },
    );
    const at = phoneLogMilliseconds(duoRecord.timestamp);
    const pressed = phoneKeyOutcome([duoRecord], 94709, at, at);
    const home = await startPhoneHome(scratchDir("infinitary-keyboard-response-"), {
      start: async () => {},
      stop: async () => {},
      key: async (key) => ({ key, ...routing.observe(94709, pressed) }),
      keyboardClosed: () => routing.close(),
    });
    try {
      const response = await fetch(`${home.url}/key-tab`, { method: "POST" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        key: "tab",
        pid: 94709,
        outcome: "delivered",
        proof: [duoRecord.eventMessage],
      });
      await home.close();
      expect(
        diagnostic.records.filter((record) => record.event === "identity-read-failed"),
      ).toHaveLength(1);
    } finally {
      await routing.close();
      await home.close();
      diagnostic.restore();
    }
  },
);

test("routing diagnostics retain ambiguous events and missing proof without inventing one destination", async () => {
  const diagnostic = captureDiagnostics();
  const routing = new PhoneKeyRoutingDiagnostics(async () => "");
  const at = phoneLogMilliseconds(duoRecord.timestamp);
  const otherEvent =
    "sequence starting with Keyboard event: <sq: 0x1089f4540; (<keyboardFocus; display: 3A1D0EBF-045B-4591-8C60-635F42F4EB0B; pid: 8556; token: 0x4B2C65FC>)>";
  try {
    // These recorded Duo and iPhone-control lines must keep their separate candidate identities.
    routing.observe(94709, {
      outcome: "unknown",
      pid: 94709,
      proof: [duoRecord.eventMessage, otherEvent],
    });
    routing.observe(94709, phoneKeyOutcome([], 94709, at, at));
    await routing.close();
    const records = diagnostic.records.filter((record) => record.event === "event-destinations");
    expect(records[0]).toMatchObject({
      outcome: "unknown",
      ambiguous: true,
      missingProof: false,
      evidence: [
        { event: duoRecord.eventMessage, destinations: [{ pid: 94709 }] },
        { event: otherEvent, destinations: [{ pid: 8556 }] },
      ],
    });
    expect(records[1]).toMatchObject({
      outcome: "unknown",
      ambiguous: false,
      missingProof: true,
      evidence: [],
    });
  } finally {
    await routing.close();
    diagnostic.restore();
  }
});

// Each route must preserve the caller's operation identity through later process-read settlement.
test.each(["tab", "return", "escape"] as const)(
  "Duo %s retains one caller ID through home and process records",
  async (key) => {
    const diagnostic = captureDiagnostics();
    const routing = new PhoneKeyRoutingDiagnostics(async () => "");
    const correlation = randomUUID();
    const home = await startPhoneHome(scratchDir("infinitary-duo-correlation-"), {
      start: async () => {},
      stop: async () => {},
      key: async (pressed, diagnosticId) => ({
        key: pressed,
        ...routing.observe(process.pid, phoneKeyOutcome([], process.pid, 0, 0), diagnosticId),
      }),
      keyboardClosed: () => routing.close(),
    });
    try {
      const response = await fetch(`${home.url}/key-${key}`, {
        method: "POST",
        headers: { "x-phone-keyboard-diagnostic-id": correlation },
      });
      await response.text();
      expect(response.status).toBe(200);
      await home.close();
      expect([...new Set(diagnostic.records.map((record) => record.id))]).toEqual([correlation]);
      expect(diagnostic.records.map((record) => `${record.phase}/${record.event}`).sort()).toEqual(
        [
          `key-${key}/request-start`,
          "duo-key-routing/event-destinations",
          "duo-key-routing/process-identities",
          `key-${key}/owner-completed`,
        ].sort(),
      );
    } finally {
      await routing.close();
      await home.close();
      diagnostic.restore();
    }
  },
);

// The process accounting name is an OS field, not an assurance that its displayed spelling is complete.
test("a real process reading labels accounting names as possibly truncated", async () => {
  const recorded = deferred<void>();
  const diagnostic = captureDiagnostics((record) => {
    if (record.event === "process-identities") recorded.resolve();
  });
  const children = new Set<ChildProcess>();
  const routing = new PhoneKeyRoutingDiagnostics((pids, signal) =>
    readPhoneKeyProcessNames(pids, signal, hostEnv(), children),
  );
  try {
    routing.observe(process.pid, phoneKeyOutcome([], process.pid, 0, 0));
    await recorded.promise;
    expect(
      diagnostic.records.find((record) => record.event === "process-identities"),
    ).toMatchObject({
      accountingNamesMayBeTruncated: true,
      processes: [{ pid: process.pid, accountingName: expect.any(String) }],
    });
  } finally {
    await routing.close();
    diagnostic.restore();
  }
});

// An abort acknowledges cancellation; it does not mean the reader has settled or stopped writing records.
test("shutdown keeps waiting after abort until the identity reader settles", async () => {
  const aborted = deferred<void>();
  const release = deferred<void>();
  const recorded = deferred<void>();
  const diagnostic = captureDiagnostics((record) => {
    if (record.event === "identity-read-failed") recorded.resolve();
  });
  const routing = new PhoneKeyRoutingDiagnostics(async (_pids, signal) => {
    await new Promise<void>((resolve) =>
      signal.addEventListener(
        "abort",
        () => {
          aborted.resolve();
          resolve();
        },
        { once: true },
      ),
    );
    await release.promise;
    throw signal.reason;
  });
  routing.observe(process.pid, phoneKeyOutcome([], process.pid, 0, 0));
  let settled = false;
  const closing = routing.close().then(() => {
    settled = true;
  });
  try {
    await aborted.promise;
    expect(settled).toBe(false);
    release.resolve();
    await closing;
    expect(settled).toBe(true);
    expect(
      diagnostic.records.filter((record) => record.event === "identity-read-failed"),
    ).toHaveLength(1);
  } finally {
    release.resolve();
    await recorded.promise;
    await closing;
    diagnostic.restore();
  }
});
