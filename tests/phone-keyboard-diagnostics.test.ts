import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deferred } from "./helpers/deferred";
import { startPhoneHome } from "./helpers/phoneHome";
import { PhoneKeyRegistrations } from "./helpers/phoneKeyboard";
import {
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
    keyboardReady: async (chord) => {
      started.resolve();
      return registrations.wait(54571, chord);
    },
  });
  const client = new AbortController();
  try {
    const request = fetch(`${home.url}/keyboard-ready`, {
      method: "POST",
      body: JSON.stringify({ key: "[", modifiers: ["cmd"] }),
      signal: client.signal,
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
    { pid: 94709, display: "8AF25958-F0CD-4018-B5E2-12C18B2E53A7", token: "0xA8B58429" },
  ]);
  expect(
    phoneKeyDiagnosticDestinations([
      "sequence starting with Keyboard event: <sq: 0x10c614540; (no destinations)>",
    ]),
  ).toEqual([]);
});
