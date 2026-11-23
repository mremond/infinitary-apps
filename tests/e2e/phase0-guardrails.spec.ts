import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { PRODUCTION_CSP } from "../../src/shared/csp";
import { parsePairingLink } from "../../src/shared/devices";
import { type LaunchedApp, launchApp } from "./launch";

let launched: LaunchedApp;

test.beforeAll(async () => {
  launched = await launchApp();
});

test.afterAll(async () => {
  await launched.close();
});

test("carries the exact section 4 CSP and enforces it against injected scripts", async () => {
  const { page } = launched;
  const metaCsp = await page.evaluate(
    () =>
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content") ?? null,
  );
  expect(metaCsp).toBe(PRODUCTION_CSP);
  // DOM-injected inline scripts honor the page CSP (unlike devtools-protocol
  // evaluation, which is CSP-exempt): with script-src 'self' and no
  // 'unsafe-inline' in the built app, the payload must never run.
  const inlineExecuted = await page.evaluate(() => {
    const marker = "__fm_csp_probe__";
    const script = document.createElement("script");
    script.textContent = `window["${marker}"] = true;`;
    document.body.appendChild(script);
    const executed = (window as unknown as Record<string, unknown>)[marker] === true;
    script.remove();
    return executed;
  });
  expect(inlineExecuted).toBe(false);
});

test("keeps node globals out of the page and exposes a tamper-proof bridge", async () => {
  const { page } = launched;
  const probe = await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    // The bridge under Infinitary's name, and under Firstmate 3000's beside
    // it: the same keys, and neither can be swapped out.
    let reassigned = false;
    for (const name of ["infinitary", "firstmate"]) {
      try {
        win[name] = null;
        reassigned ||= win[name] === null;
      } catch {
        // Refused, as it should be.
      }
    }
    return {
      processAbsent: typeof win.process === "undefined",
      requireAbsent: typeof win.require === "undefined",
      apiKeys: Object.keys(window.infinitary ?? {}),
      olderKeys: Object.keys(window.firstmate ?? {}),
      repoKeys: Object.keys(window.infinitary.repos),
      deviceKeys: Object.keys(window.infinitary.devices),
      forgeKeys: Object.keys(window.infinitary.forges),
      customApiKeys: Object.keys(window.infinitary.accounts.custom),
      reassigned,
    };
  });
  expect(probe.repoKeys.sort()).toEqual([
    "batchAnswer",
    "configure",
    "folder",
    "list",
    "move",
    "offerFolder",
    "removal",
    "remove",
    "setFolder",
    "setup",
  ]);
  expect(probe.deviceKeys.sort()).toEqual([
    "add",
    "addresses",
    "answerSignIn",
    "cancelSignIn",
    "carryOn",
    "changeAddress",
    "custom",
    "fixWork",
    "followAdded",
    "forgeSignIn",
    "forgeSignInWithBrowser",
    "forgeSignInWithCli",
    "forgeSignInWithKey",
    "forgeSignOut",
    "homeMove",
    "invite",
    "join",
    "joinAt",
    "joinHeld",
    "keep",
    "leave",
    "list",
    "nearby",
    "onAddresses",
    "onDevices",
    "onNearby",
    "onResources",
    "onSignIn",
    "onSignIns",
    "onThisMac",
    "openSharing",
    "remove",
    "runsOn",
    "setAddress",
    "setUpHere",
    "setUpWork",
    "shown",
    "signIn",
    "signIns",
    "signOut",
    "standby",
    "stop",
    "takeOver",
    "thisMac",
    "tryAgain",
    "update",
    "updateApp",
    "updateLater",
  ]);
  expect(probe.forgeKeys.sort()).toEqual([
    "cancel",
    "changes",
    "list",
    "onChange",
    "projects",
    "signIn",
    "signInWithBrowser",
    "signInWithCli",
    "signInWithKey",
    "signOut",
  ]);
  expect(probe.processAbsent).toBe(true);
  expect(probe.requireAbsent).toBe(true);
  expect(probe.apiKeys.sort()).toEqual([
    "accounts",
    "app",
    "auth",
    "automation",
    "browser",
    "cards",
    "conversation",
    "crew",
    "devices",
    "events",
    "feed",
    "files",
    "forges",
    "integrations",
    "keyboard",
    "knowledge",
    "models",
    "observe",
    "plugins",
    "presence",
    "projects",
    "quota",
    "releaseNotes",
    "repos",
    "retention",
    "secrets",
    "settings",
    "task",
    "tasks",
    "update",
    "voice",
  ]);
  expect(probe.customApiKeys.sort()).toEqual([
    "address",
    "cancel",
    "check",
    "connect",
    "discover",
    "list",
    "prepare",
    "profiles",
    "recheck",
    "review",
    "save",
  ]);
  expect(probe.olderKeys.sort()).toEqual(probe.apiKeys.sort());
  expect(probe.reassigned).toBe(false);
});

/** Whether anything accepts a connection on loopback at `port`. */
function answers(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

test("accepts no device while nothing is paired", async () => {
  // The connection (docs/connection.md) is part of every launch and listens
  // only while a device is paired or a link to pair one is open
  // (docs/devices.md); a fresh launch has neither. The probe dials this
  // app's own port, never the one an installed app on this Mac holds, and
  // the launch claimed it for this worker, so no other process in the run
  // can be listening there (INF-267).
  const { page, connectionPort } = launched;
  const health = await page.evaluate(() => window.infinitary.app.healthcheck());
  expect(health.capabilities).toContain("connection");
  expect(await answers(connectionPort)).toBe(false);
  // Pairing writes nothing, not even the home's key, until the first link.
  expect(existsSync(join(launched.userDataDir, "devices"))).toBe(false);
  // A link makes this app listen where the probe dialed, so the silence was its own.
  const invite = await page.evaluate(() => window.infinitary.devices.invite({ kind: "mac" }));
  expect(parsePairingLink(invite.link).at).toBe(`127.0.0.1:${connectionPort}`);
  await expect.poll(() => answers(connectionPort)).toBe(true);
  await page.evaluate((id) => window.infinitary.devices.stop(id), invite.id);
});

test("the release launch gate reads the version the running app reports", async () => {
  // scripts/check-app-launch.sh asks a launched release for its version over
  // Chromium's debugging port, because an alpha's bundle fields carry only
  // the numeric core (docs/alpha.md "The signed channel workflow").
  // Playwright launches with a debugging port too, so the gate's probe reads
  // this app exactly as it reads a release.
  const probe = await promisify(execFile)(process.execPath, [
    "scripts/app-runtime-version.mjs",
    launched.userDataDir,
  ]);
  const health = await launched.page.evaluate(() => window.infinitary.app.healthcheck());
  expect(probe.stdout.trim()).toBe(health.version);
  expect(health.version).toBe(JSON.parse(readFileSync("package.json", "utf8")).version);
});
