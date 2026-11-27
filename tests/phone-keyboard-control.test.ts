import { afterEach, expect, test, vi } from "vitest";
import { deferred } from "./helpers/deferred";
import { startPhoneHome } from "./helpers/phoneHome";
import { joinPhoneHardwareKeyboardWrites, setPhoneHardwareKeyboard } from "./helpers/phoneKeyboard";
import { scratchDir } from "./helpers/scratchDirs";

// A pending owner promise cannot confirm the keyboard state UIKit needs to publish its shortcuts.
// Native guard tests own the wait, registration and single-send order.
afterEach(() => vi.unstubAllEnvs());

function isolateHomeEnvironment() {
  vi.stubEnv("PI_OFFLINE", "1");
  for (const name of [
    "INFINITARY_CONNECTION_LOOPBACK_PORT",
    "INFINITARY_DNS_SD",
    "INFINITARY_GOOGLE_URL",
    "INFINITARY_PUSH_RELAY_URL",
  ])
    vi.stubEnv(name, process.env[name]);
}

test("keyboard control forwards both states and refuses to acknowledge a failed attachment", async () => {
  isolateHomeEnvironment();
  const states: boolean[] = [];
  const home = await startPhoneHome(scratchDir("infinitary-keyboard-control-"), {
    start: async () => {},
    stop: async () => {},
    keyboardAttachment: async (attached) => {
      states.push(attached);
      if (attached) throw new Error("No owned simulator keyboard exists");
      return { attached };
    },
  });
  try {
    const attachment = await fetch(`${home.url}/keyboard-attach`, { method: "POST" });
    expect(attachment.status).toBe(500);
    const detachment = await fetch(`${home.url}/keyboard-detach`, { method: "POST" });
    expect(detachment.ok).toBe(true);
    expect(states).toEqual([true, false]);
  } finally {
    await home.close();
  }
});

// Closing client sockets is not completion of the host commands they started.
test("home shutdown joins keyboard detachment after both control clients disconnect", async () => {
  isolateHomeEnvironment();
  const attachmentStarted = deferred<void>();
  const releaseAttachment = deferred<void>();
  const detachmentRequested = deferred<void>();
  const detachmentStarted = deferred<void>();
  const releaseDetachment = deferred<void>();
  const joining = deferred<void>();
  const writes: string[] = [];
  let attached = false;
  let closed = false;
  const run = async (_command: string, args: string[]) => {
    const next = (Number(args[6]) & 0xff) === 1;
    if (next) {
      writes.push("attachment started");
      attachmentStarted.resolve();
      await releaseAttachment.promise;
    } else {
      writes.push("detachment started");
      detachmentStarted.resolve();
      await releaseDetachment.promise;
    }
    attached = next;
    writes.push(next ? "attached" : "detached");
  };
  const home = await startPhoneHome(scratchDir("infinitary-keyboard-shutdown-"), {
    start: async () => {},
    stop: async () => {},
    keyboardAttachment: async (state) => {
      if (!state) detachmentRequested.resolve();
      await setPhoneHardwareKeyboard(run, "A9EEAD2F-B238-4612-9A9C-250E64BC7E52", state);
      return { attached: state };
    },
    keyboardClosed: async () => {
      joining.resolve();
      await joinPhoneHardwareKeyboardWrites(run);
    },
  });
  let closing: Promise<void> | undefined;
  const attachClient = new AbortController();
  const detachClient = new AbortController();
  try {
    const attachment = fetch(`${home.url}/keyboard-attach`, {
      method: "POST",
      signal: attachClient.signal,
    });
    const abortedAttachment = expect(attachment).rejects.toMatchObject({ name: "AbortError" });
    await attachmentStarted.promise;
    attachClient.abort();
    await abortedAttachment;
    const detachment = fetch(`${home.url}/keyboard-detach`, {
      method: "POST",
      signal: detachClient.signal,
    });
    const abortedDetachment = expect(detachment).rejects.toMatchObject({ name: "AbortError" });
    await detachmentRequested.promise;
    detachClient.abort();
    await abortedDetachment;
    closing = home.close().then(() => {
      closed = true;
    });
    const boundary = await Promise.race([
      joining.promise.then(() => "joining"),
      closing.then(() => "closed"),
    ]);
    expect(boundary).toBe("joining");
    expect(writes).toEqual(["attachment started"]);
    expect(closed).toBe(false);
    releaseAttachment.resolve();
    await detachmentStarted.promise;
    expect(attached).toBe(true);
    expect(closed).toBe(false);
    releaseDetachment.resolve();
    await closing;
    expect(writes).toEqual(["attachment started", "attached", "detachment started", "detached"]);
    expect(attached).toBe(false);
    expect(closed).toBe(true);
  } finally {
    attachClient.abort();
    detachClient.abort();
    releaseAttachment.resolve();
    releaseDetachment.resolve();
    await (closing ?? home.close());
  }
});
