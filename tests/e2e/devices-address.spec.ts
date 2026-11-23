import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { ownNetworkNames } from "@core/devices/computerName";
import { OWN_KEY_COMMENT } from "@core/devices/ownKey";
import { expect, type Locator, test } from "@playwright/test";
import { deviceJoinedLine, deviceLabel, PAIRING_LINK_PREFIX } from "@shared/devices";
import type { FmEvent } from "@shared/events";
import { nearbyMacsWords } from "@shared/nearbyMacs";
import { remoteLoginWords } from "@shared/remoteLogin";
import { COMPUTER } from "../../src/shared/deviceNames";
import { standInDnsSd } from "../helpers/dnsSdStandIn";
import { scratchDir } from "../helpers/scratchDirs";
import { SSH_SERVER_AVAILABLE, startSshServer } from "../helpers/sshServer";
import {
  addStandInPayload,
  STAND_IN_RECORD,
  standInFirstmate,
  standInRecord,
} from "../helpers/standInFirstmate";
import { waitForFirstmateIdle } from "./crew";
import { addByAddress, ask, BUILDER, openDevices, selectDevice } from "./deviceFixtures";
import { launchApp } from "./launch";
import { feedLine, feedLineOf } from "./rails";
import { savedText } from "./savedText";
import { focusOn, pressKey, typeInto } from "./windowKeys";

/**
 * + A Mac by its address over Remote Login (docs/devices.md, "Adding a
 * computer by its address"): from the first mate's card and from Devices,
 * its check line, its count, Macs nearby, the password asked once, and a Mac
 * another first mate uses.
 */

/**
 * The check aside says only its owner's words (`remoteLoginWords.confirmQuestion`):
 * the question, what to compare and the check line, beside its two buttons.
 * Nothing else is there, such as a step to take in Terminal.
 */
async function expectOnlyCheckWords(check: Locator, address: string): Promise<void> {
  const line = (await check.locator("[data-device-check-line]").textContent()) ?? "";
  expect(line).not.toBe("");
  const buttons = check.getByRole("button");
  await expect(buttons).toHaveCount(2);
  const words = [...remoteLoginWords.confirmQuestion(address), line];
  expect(await check.textContent()).toBe([...words, ...(await buttons.allTextContents())].join(""));
}

test("the captain asks Firstmate to add a Mac at its address: Devices reaches it over SSH and sets it up, and a refusal says what to do", async () => {
  test.skip(!SSH_SERVER_AVAILABLE, "needs the Mac's own SSH server and client");
  // The other Mac: a throwaway SSH server on loopback, a user there with a
  // home of its own, and the Firstmate this Mac sends, a stand-in that joins
  // at the wire as another user.
  const sshd = await startSshServer();
  const record = join(scratchDir("infinitary-e2e-remote-record-"), "started");
  const them = scratchDir("infinitary-e2e-remote-user-");
  const ssh = sshd.ssh({
    remote: {
      HOME: them,
      INFINITARY_HELPER_DATA_DIR: join(them, "work"),
      INFINITARY_DEVICE_NAME: "Mac mini",
    },
  });
  const app = await launchApp({
    withMockProvider: true,
    env: {
      INFINITARY_SSH: ssh.program,
      INFINITARY_APP_BUNDLE: standInFirstmate(record, BUILDER.uid),
    },
  });
  try {
    const { page } = app;

    // Asked to add the Mac at an address, Firstmate offers one card; its
    // button opens Devices and adds it there.
    await ask(page, "device-invite", { how: "address", address: sshd.address });
    const add = page.getByRole("button", { name: "Add it", exact: true });
    await expect(add).toBeVisible();
    await waitForFirstmateIdle(page);
    await add.click();
    await expect(page.getByRole("tab", { name: "Devices", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The first reach shows the check line and sends nothing until this is the Mac.
    const check = page.locator("[data-device-confirm-question]");
    await expect(check).toBeVisible();
    await expectOnlyCheckWords(check, sshd.address);
    await check.getByRole("button", { name: `This is the ${COMPUTER.one}`, exact: true }).click();
    // It joins and stands in the list, named as it joined.
    await expect
      .poll(async () => (await page.evaluate(() => window.infinitary.devices.list())).length)
      .toBe(1);
    const [device] = await page.evaluate(() => window.infinitary.devices.list());
    expect(device).toMatchObject({ kind: "work", user: "sam", remoteLogin: sshd.address });
    if (!device) throw new Error("Nothing joined.");
    await expect(await selectDevice(page, device.id)).toContainText(
      deviceLabel({ name: "Mac mini", user: "sam", onThisMac: true }),
    );
    await expect(page.locator("[data-device-adding]")).toHaveCount(0);
    // The link went on the other Mac's input, never in its words.
    expect(readFileSync(record, "utf8")).toContain(STAND_IN_RECORD.link);

    // + A computer’s address form: an address nothing answers at says so, here and in the feed.
    await page.locator('[data-device-add="mac"]').click();
    await page.getByLabel(`The other ${COMPUTER.one}'s address`).fill("sam@no-such-mac.invalid");
    await page.getByRole("button", { name: "Add it", exact: true }).click();
    const refusedAddress = "sam@no-such-mac.invalid";
    // It stopped reading its SSH key at the port its SSH settings name; a name that
    // finds no address says nothing of what answers at that port (hostKey.ts).
    const [what, todo] = remoteLoginWords.refused("unreachable", {
      address: refusedAddress,
      doing: "add",
      reach: { step: "key", port: sshd.port },
    });
    const question = page.locator("[data-device-address-question]");
    const field = question.getByLabel(`The other ${COMPUTER.one}'s address`);
    await expect(question).toBeVisible();
    await expect(field).toHaveValue(refusedAddress);
    await expect(question.locator("[data-device-address-refusal]")).toHaveCount(2);
    await expect(question).toContainText(what);
    await expect(question).toContainText(todo);
    const again = question.getByRole("button", { name: "Try again", exact: true });
    const cancel = question.getByRole("button", { name: "Cancel", exact: true });
    await focusOn(field);
    // The port comes next (INF-1827), then Try again and Cancel.
    await page.keyboard.press("Tab");
    await expect(question.getByLabel("Port", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(again).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    // Try again is the captain's own key. An address that never answers is said
    // again, and nothing is signed in to, so the feed does not say a key was used.
    await page.evaluate((said) => {
      const seen = window as Window & { __addressRefusals?: number };
      seen.__addressRefusals = 0;
      window.infinitary.events.on((event) => {
        if (event.type === "device_setup" && event.doing === "add" && event.text === said) {
          seen.__addressRefusals = (seen.__addressRefusals ?? 0) + 1;
        }
      });
    }, what);
    await pressKey(again, "Enter");
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { __addressRefusals?: number }).__addressRefusals),
      )
      .toBe(1);
    await expect(field).toHaveValue(refusedAddress);
    await expect(question.locator("[data-device-address-refusal]")).toHaveCount(2);
    await pressKey(cancel, "Enter");
    await expect(question).toHaveCount(0);
    expect(await page.evaluate(() => window.infinitary.devices.list())).toHaveLength(1);

    await page.keyboard.press("Escape");
    // Try again said the same two lines again. Nothing else was added, and no key was used.
    await expect(feedLine(page, remoteLoginWords.reaching(refusedAddress))).toHaveCount(0);
    await expect(feedLine(page, what)).toHaveCount(2);
    await expect(feedLine(page, todo)).toHaveCount(2);
    for (const line of [
      remoteLoginWords.reaching(sshd.address),
      remoteLoginWords.settingUp("Mac mini"),
      deviceJoinedLine({ name: "Mac mini", kind: "work", user: "sam", onThisMac: true }),
    ])
      await expect(feedLine(page, line)).toBeVisible();

    // Nothing the captain can read back, and nothing saved, holds the link.
    const { code, curl } = standInRecord(record);
    expect(code).toHaveLength(43);
    expect(curl).not.toEqual([]);
    expect(curl.filter((started) => started.includes(code))).toEqual([]);
    const readable = JSON.stringify([
      await page.evaluate(() => window.infinitary.cards.list()),
      await page.evaluate(() => window.infinitary.tasks.board()),
    ]);
    expect(readable).not.toContain(PAIRING_LINK_PREFIX);
    expect(readable).not.toContain(code);
    expect(
      savedText(app.userDataDir)
        .filter(({ text }) => text.includes(code))
        .map(({ file }) => file),
    ).toEqual([]);
  } finally {
    await app.close();
    await sshd.stop();
  }
});

test("a Mac whose user runs another Firstmate's work: Add it asks once, Cancel changes nothing, and Leave it and add, from the keyboard, adds it", async () => {
  test.skip(!SSH_SERVER_AVAILABLE, "needs the Mac's own SSH server and client");
  // That user there runs work for another Firstmate already: its grant names that one's key.
  const sshd = await startSshServer();
  const record = join(scratchDir("infinitary-e2e-remote-record-"), "started");
  const them = scratchDir("infinitary-e2e-remote-user-");
  const work = join(them, "work");
  mkdirSync(work, { recursive: true });
  writeFileSync(
    join(work, "home.json"),
    `${JSON.stringify({ version: 1, grant: { homeKey: "O".repeat(43), deviceId: "old-mini" } })}\n`,
  );
  const ssh = sshd.ssh({
    remote: { HOME: them, INFINITARY_HELPER_DATA_DIR: work, INFINITARY_DEVICE_NAME: "Mac mini" },
  });
  const app = await launchApp({
    withMockProvider: true,
    env: {
      INFINITARY_SSH: ssh.program,
      INFINITARY_APP_BUNDLE: standInFirstmate(record, BUILDER.uid),
    },
  });
  const started = () => (existsSync(record) ? readFileSync(record, "utf8") : "");
  try {
    const { page } = app;
    await openDevices(page);
    const question = page.locator(`[data-device-leave-question="${sshd.address}"]`);
    const [found] = remoteLoginWords.leaveQuestion({ address: sshd.address, name: "Mac mini" });
    const addByAddress = async () => {
      await page.locator('[data-device-add="mac"]').click();
      await page.getByLabel(`The other ${COMPUTER.one}'s address`).fill(sshd.address);
      await page.keyboard.press("Enter");
    };

    // The check line comes first. This is the Mac, then the leave question.
    // Cancel holds the focus, and changes nothing.
    await addByAddress();
    const check = page.locator("[data-device-confirm-question]");
    await expect(check).toBeVisible();
    await pressKey(
      check.getByRole("button", { name: `This is the ${COMPUTER.one}`, exact: true }),
      "Enter",
    );
    await expect(question).toContainText(String(found));
    await expect(question.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(question).toHaveCount(0);
    expect(started()).toBe("");
    expect(await page.evaluate(() => window.infinitary.devices.list())).toEqual([]);

    // Asked again, the captain's yes by keys: the join there is told to leave the other Firstmate.
    await addByAddress();
    await expect(question).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(
      question.getByRole("button", { name: "Leave it and add", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await page.evaluate(() => window.infinitary.devices.list())).length)
      .toBe(1);
    const [device] = await page.evaluate(() => window.infinitary.devices.list());
    expect(device).toMatchObject({ kind: "work", remoteLogin: sshd.address });
    await expect(question).toHaveCount(0);
    expect(started()).toContain(STAND_IN_RECORD.leave);
    if (!device) throw new Error("Nothing joined.");
    await selectDevice(page, device.id);
    await page.keyboard.press("Escape");
    for (const line of remoteLoginWords.leftOther(device, { kept: 1, unremoved: 0 }))
      await expect(feedLine(page, line)).toBeVisible();
  } finally {
    await app.close();
    await sshd.stop();
  }
});

/** Whether a process is still running. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("the first reach shows the check line and sends nothing until this is the Mac", async () => {
  test.skip(!SSH_SERVER_AVAILABLE, "needs the Mac's own SSH server and client");
  test.setTimeout(120_000);
  process.env.PI_OFFLINE = "1";
  const sshd = await startSshServer();
  sshd.knownHosts("unknown");
  const record = join(scratchDir("infinitary-e2e-remote-record-"), "started");
  const them = scratchDir("infinitary-e2e-remote-user-");
  const ssh = sshd.ssh({
    remote: {
      HOME: them,
      CFFIXED_USER_HOME: them,
      INFINITARY_HELPER_DATA_DIR: join(them, "work"),
      INFINITARY_DEVICE_NAME: "Mac mini",
      ELECTRON_RENDERER_URL: "",
      PI_OFFLINE: "1",
    },
  });
  const bundle = standInFirstmate(record, BUILDER.uid, {
    joined: "running",
    updated: "running",
  });
  const app = await launchApp({
    withMockProvider: true,
    env: { INFINITARY_SSH: ssh.program, INFINITARY_APP_BUNDLE: bundle },
  });
  try {
    const { page } = app;
    await openDevices(page);
    await pressKey(page.locator('[data-device-add="mac"]'), "Enter");
    const question = page.locator("[data-device-address-question]");
    await typeInto(question.getByLabel(`The other ${COMPUTER.one}'s address`), sshd.address);
    await page.keyboard.press("Enter");
    const check = page.locator("[data-device-confirm-question]");
    const [asked, compare] = remoteLoginWords.confirmQuestion(sshd.address);
    await expect(check).toBeVisible();
    await expect(check).toContainText(asked);
    await expect(check).toContainText(compare);
    await expect(check.locator("[data-device-check-line]")).toContainText("ED25519 SHA256:");
    await expectOnlyCheckWords(check, sshd.address);
    await expect(page.locator("[data-device-adding]")).toHaveCount(0);
    const cancel = check.getByRole("button", { name: "Cancel", exact: true });
    const yes = check.getByRole("button", { name: `This is the ${COMPUTER.one}`, exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(yes).toBeFocused();
    await pressKey(cancel, "Enter");
    await expect(check).toHaveCount(0);
    await expect(question.getByLabel(`The other ${COMPUTER.one}'s address`)).toHaveValue(
      sshd.address,
    );
    expect(await page.evaluate(() => window.infinitary.devices.list())).toHaveLength(0);
    expect(existsSync(record)).toBe(false);
    await page.keyboard.press("Enter");
    await expect(check).toBeVisible();
    await pressKey(yes, "Enter");
    await expect
      .poll(async () => (await page.evaluate(() => window.infinitary.devices.list())).length)
      .toBe(1);
    await expect(check).toHaveCount(0);
    expect(readFileSync(record, "utf8")).toContain(STAND_IN_RECORD.link);
  } finally {
    await app.close();
    await sshd.stop();
  }
});

test("adding a Mac by its address says how far the copy has gone: preparing it, what it sent so far, then starting it there", async () => {
  test.skip(!SSH_SERVER_AVAILABLE, "needs the Mac's own SSH server and client");
  test.setTimeout(120_000);
  process.env.PI_OFFLINE = "1";
  const sshd = await startSshServer();
  const record = join(scratchDir("infinitary-e2e-remote-record-"), "started");
  const them = scratchDir("infinitary-e2e-remote-user-");
  const ssh = sshd.ssh({
    remote: {
      HOME: them,
      INFINITARY_HELPER_DATA_DIR: join(them, "work"),
      INFINITARY_DEVICE_NAME: "Mac mini",
    },
  });
  const bundle = standInFirstmate(record, BUILDER.uid);
  // Bytes that do not compress, so the copy takes many pieces.
  const payload = 8_000_000;
  addStandInPayload(bundle, randomBytes(payload));
  const app = await launchApp({
    withMockProvider: true,
    env: { INFINITARY_SSH: ssh.program, INFINITARY_APP_BUNDLE: bundle },
  });
  try {
    const { page } = app;
    await openDevices(page);
    // Each step the core says as Settings hears it.
    await page.evaluate(() => {
      const seen = window as Window & { __setup?: unknown[] };
      seen.__setup = [];
      window.infinitary.events.on((event) => {
        if (event.type === "device_setup" && event.doing === "add") seen.__setup?.push(event);
      });
    });
    await addByAddress(page, sshd.address);
    const said = (await page.evaluate(
      () => (window as Window & { __setup?: unknown[] }).__setup ?? [],
    )) as Extract<FmEvent, { type: "device_setup" }>[];

    // Preparing it, then the bytes sent so far, each more than the last, then starting it there.
    const states = said.map((event) => event.copy?.state);
    const sending = said.filter((event) => event.copy?.state === "sending");
    const counts = sending.map((event) => event.copy?.sent ?? 0);
    expect(states.indexOf("preparing")).toBeGreaterThanOrEqual(0);
    expect(states.indexOf("sending")).toBeGreaterThan(states.indexOf("preparing"));
    expect(states.lastIndexOf("sending")).toBeLessThan(states.indexOf("starting"));
    expect(counts.length).toBeGreaterThanOrEqual(2);
    for (const [index, count] of counts.entries())
      expect(count).toBeGreaterThan(index === 0 ? 0 : (counts[index - 1] ?? 0));
    expect(counts.at(-1)).toBeGreaterThan(payload);
    // No total rides it, and nothing says a share of one.
    for (const event of said) {
      expect(Object.keys(event.copy ?? {}).every((key) => key === "state" || key === "sent")).toBe(
        true,
      );
      expect(event.text).not.toContain("%");
    }

    // The feed keeps the count as one line, at all it sent, then says it is starting there.
    await page.keyboard.press("Escape");
    const last = sending.at(-1);
    if (!last) throw new Error("The copy's count was never said.");
    await expect(feedLineOf(page, last)).toBeVisible();
    await expect(feedLineOf(page, said[states.indexOf("starting")] as FmEvent)).toBeVisible();
    await expect(feedLineOf(page, sending[0] as FmEvent)).toHaveCount(0);
    expect(readFileSync(record, "utf8")).toContain(STAND_IN_RECORD.link);
  } finally {
    await app.close();
    await sshd.stop();
  }
});

test("+ A computer’s address form lists Macs nearby but this one, and adds one picked and edited by keys", async () => {
  test.skip(!SSH_SERVER_AVAILABLE, "needs the Mac's own SSH server and client");
  test.setTimeout(120_000);
  process.env.PI_OFFLINE = "1";
  const sshd = await startSshServer();
  sshd.knownHosts("unknown");
  const record = join(scratchDir("infinitary-e2e-remote-record-"), "started");
  const them = scratchDir("infinitary-e2e-remote-user-");
  const ssh = sshd.ssh({
    remote: {
      HOME: them,
      CFFIXED_USER_HOME: them,
      INFINITARY_HELPER_DATA_DIR: join(them, "work"),
      INFINITARY_DEVICE_NAME: "Mac mini",
      ELECTRON_RENDERER_URL: "",
      PI_OFFLINE: "1",
    },
  });
  const bundle = standInFirstmate(record, BUILDER.uid, { joined: "running", updated: "running" });
  // Two Macs announce Remote Login: the throwaway SSH server on loopback, as
  // the Mac mini, and this Mac by its own name on the network.
  const [own = "this-mac.local"] = await ownNetworkNames();
  const dnsSd = standInDnsSd([
    { name: "Mac mini", at: "127.0.0.1" },
    { name: "This Mac", at: own },
  ]);
  const app = await launchApp({
    withMockProvider: true,
    env: { INFINITARY_SSH: ssh.program, INFINITARY_APP_BUNDLE: bundle, INFINITARY_DNS_SD: dnsSd },
  });
  try {
    const { page } = app;
    const user = userInfo().username;
    await openDevices(page);
    await pressKey(page.locator('[data-device-add="mac"]'), "Enter");
    const question = page.locator("[data-device-address-question]");
    const field = question.getByLabel(`The other ${COMPUTER.one}'s address`);
    const nearby = question.locator("[data-device-nearby-mac]");
    // This Mac is never a row: only the Mac mini, with your user name.
    await expect(nearby).toHaveCount(1);
    await expect(nearby).toContainText("Mac mini");
    await expect(nearby).toContainText(`${user}@127.0.0.1`);
    await expect(question).not.toContainText("This Mac");
    await expect(nearby.locator("[data-device-nearby-on-list]")).toHaveCount(0);

    // ↓ from the field reaches the list, and Enter fills the field with the
    // user name selected, to change before Add it.
    await pressKey(field, "ArrowDown");
    await expect(nearby).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(`${user}@127.0.0.1`);
    expect(
      await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
    ).toEqual([0, user.length]);
    await typeInto(field, "someone");
    await expect(field).toHaveValue("someone@127.0.0.1");
    // Only this test's own user is let in there, so it is typed back.
    // Select the username to the left of the caret without a platform-specific Home key.
    for (const _ of "someone") await page.keyboard.press("Shift+ArrowLeft");
    expect(
      await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
    ).toEqual([0, "someone".length]);
    await typeInto(field, user);
    await expect(field).toHaveValue(sshd.address);
    await page.keyboard.press("Enter");
    const check = page.locator("[data-device-confirm-question]");
    await expect(check).toBeVisible();
    await pressKey(
      check.getByRole("button", { name: `This is the ${COMPUTER.one}`, exact: true }),
      "Enter",
    );
    await expect
      .poll(async () => (await page.evaluate(() => window.infinitary.devices.list())).length)
      .toBe(1);
    await expect(page.locator("[data-device-address-question]")).toHaveCount(0);

    // Open again, the Mac just added is marked.
    await pressKey(page.locator('[data-device-add="mac"]'), "Enter");
    await expect(nearby.locator("[data-device-nearby-on-list]")).toHaveText(nearbyMacsWords.onList);
    // Closed, it stops looking: no run of dns-sd is left.
    await pressKey(question.getByRole("button", { name: "Cancel", exact: true }), "Enter");
    const runs = readFileSync(join(dirname(dnsSd), "pids"), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(runs.length).toBeGreaterThan(0);
    await expect.poll(() => runs.filter((pid) => running(Number(pid)))).toEqual([]);
  } finally {
    await app.close();
    await sshd.stop();
  }
});

test("+ A computer’s address form says when macOS has not allowed the local network, and still takes a typed address", async () => {
  const app = await launchApp({
    withMockProvider: true,
    env: { INFINITARY_DNS_SD: standInDnsSd([], { denied: true }) },
  });
  try {
    const { page } = app;
    await openDevices(page);
    await pressKey(page.locator('[data-device-add="mac"]'), "Enter");
    const question = page.locator("[data-device-address-question]");
    const [notAllowed, allowIt] = nearbyMacsWords.notAllowed;
    await expect(question.locator("[data-device-nearby-not-allowed]")).toContainText(notAllowed);
    await expect(question.locator("[data-device-nearby-not-allowed]")).toContainText(allowIt);
    await expect(question.locator("[data-device-nearby-mac]")).toHaveCount(0);
    // A private network's name still goes in, and Add it takes it.
    const field = question.getByLabel(`The other ${COMPUTER.one}'s address`);
    await typeInto(field, "sam@studio.tailnet-1a2b.ts.net");
    await expect(field).toHaveValue("sam@studio.tailnet-1a2b.ts.net");
    await expect(question.getByRole("button", { name: "Add it", exact: true })).toBeEnabled();
  } finally {
    await app.close();
  }
});

test("a Mac that did not let your SSH key in asks for that user's password once, says a wrong one, and adds it with Firstmate's own key, from the keyboard", async () => {
  test.skip(!SSH_SERVER_AVAILABLE, "needs the Mac's own SSH server and client");
  test.setTimeout(120_000);
  // Invented for this test: no person's password, and never kept anywhere.
  const PASSWORD = "invented-e2e-pw-71d3";
  const WRONG = "not-the-e2e-pw-0a9c";
  const record = join(scratchDir("infinitary-e2e-remote-record-"), "started");
  const them = scratchDir("infinitary-e2e-remote-user-");
  const sshd = await startSshServer({ passwords: true, home: them });
  sshd.knownHosts("unknown");
  const ssh = sshd.ssh({
    key: "refused",
    password: PASSWORD,
    remote: {
      HOME: them,
      INFINITARY_HELPER_DATA_DIR: join(them, "work"),
      INFINITARY_DEVICE_NAME: "Mac mini",
    },
  });
  const app = await launchApp({
    withMockProvider: true,
    env: {
      INFINITARY_SSH: ssh.program,
      INFINITARY_APP_BUNDLE: standInFirstmate(record, BUILDER.uid),
    },
  });
  try {
    const { page } = app;
    await openDevices(page);
    await pressKey(page.locator('[data-device-add="mac"]'), "Enter");
    await typeInto(
      page
        .locator("[data-device-address-question]")
        .getByLabel(`The other ${COMPUTER.one}'s address`),
      sshd.address,
    );
    await page.keyboard.press("Enter");
    const check = page.locator("[data-device-confirm-question]");
    await pressKey(
      check.getByRole("button", { name: `This is the ${COMPUTER.one}`, exact: true }),
      "Enter",
    );

    // That Mac did not let the captain's key in: the password is asked, once, in its own field.
    const asked = page.locator("[data-device-password-question]");
    const [found, say] = remoteLoginWords.passwordQuestion(sshd.address);
    await expect(asked).toBeVisible();
    await expect(asked).toContainText(found);
    await expect(asked).toContainText(say);
    const field = asked.getByLabel(remoteLoginWords.passwordField(userInfo().username));
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toBeFocused();
    expect(existsSync(record)).toBe(false);

    // A wrong one is said there, and the field is empty again.
    await typeInto(field, WRONG);
    await page.keyboard.press("Enter");
    const [what, todo] = remoteLoginWords.refused("password-wrong", { address: sshd.address });
    await expect(asked.locator("[data-device-password-refusal]")).toHaveCount(2);
    await expect(asked).toContainText(what);
    await expect(asked).toContainText(todo);
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    const addIt = asked.getByRole("button", { name: "Add it", exact: true });
    const cancel = asked.getByRole("button", { name: "Cancel", exact: true });
    await typeInto(field, PASSWORD);
    await page.keyboard.press("Tab");
    await expect(addIt).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    await pressKey(addIt, "Enter");

    // Firstmate's own key is let in there, and the Mac joins as any Mac added by its address.
    await expect
      .poll(async () => (await page.evaluate(() => window.infinitary.devices.list())).length)
      .toBe(1);
    await expect(asked).toHaveCount(0);
    const [device] = await page.evaluate(() => window.infinitary.devices.list());
    expect(device).toMatchObject({ kind: "work", remoteLogin: sshd.address });
    expect(readFileSync(join(them, ".ssh", "authorized_keys"), "utf8")).toMatch(
      new RegExp(`^ssh-ed25519 \\S+ ${OWN_KEY_COMMENT}\n$`),
    );
    await page.keyboard.press("Escape");
    await expect(feedLine(page, remoteLoginWords.lettingIn(sshd.address)).first()).toBeVisible();
    await expect(feedLine(page, what)).toHaveCount(1);

    // Neither password is in the feed, a card, a task, a saved file, or any ssh's arguments.
    const readable = JSON.stringify([
      await page.evaluate(() => window.infinitary.cards.list()),
      await page.evaluate(() => window.infinitary.tasks.board()),
    ]);
    for (const typed of [PASSWORD, WRONG]) {
      await expect(feedLine(page, typed)).toHaveCount(0);
      expect(readable).not.toContain(typed);
      expect(
        savedText(app.userDataDir)
          .filter(({ text }) => text.includes(typed))
          .map(({ file }) => file),
      ).toEqual([]);
      expect(sshd.sshRuns().filter((run) => run.args.join(" ").includes(typed))).toEqual([]);
      expect(sshd.sshRuns().some((run) => run.envHeldPassword)).toBe(false);
    }
  } finally {
    await app.close();
    await sshd.stop();
  }
});
