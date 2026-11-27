import { afterEach, expect, test, vi } from "vitest";
import { startPhoneHome } from "./helpers/phoneHome";
import { scratchDir } from "./helpers/scratchDirs";

// A pending owner promise cannot confirm the keyboard state UIKit needs to publish its shortcuts.
// Native guard tests own the wait, registration and single-send order.
afterEach(() => vi.unstubAllEnvs());

test("keyboard control forwards both states and refuses to acknowledge a failed attachment", async () => {
  vi.stubEnv("PI_OFFLINE", "1");
  for (const name of [
    "INFINITARY_CONNECTION_LOOPBACK_PORT",
    "INFINITARY_DNS_SD",
    "INFINITARY_GOOGLE_URL",
    "INFINITARY_PUSH_RELAY_URL",
  ])
    vi.stubEnv(name, process.env[name]);
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
