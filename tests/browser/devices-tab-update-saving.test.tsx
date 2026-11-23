import { type DeviceView, deviceLabel } from "@shared/devices";
import * as m from "@shared/i18n/messages.generated";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { fakeBridge } from "./bridge";
import {
  ADDRESSES,
  AIR,
  gone,
  MINI,
  openDevices,
  STUDIO,
  selectDevice,
  shown,
  unansweredOf,
} from "./devicesTab";
import { freshHome } from "./freshHome";
import { openSize, openWindow } from "./window";

const row = (id: string) => document.querySelector<HTMLElement>(`[data-device-row="${id}"]`);

// The ask: a computer that runs work saves its crew's work before its update,
// shown on Settings -> Devices as Saving work, Updating, Resuming work and
// Update later (docs/devices.md, "Saving work before an update"; design
// skill components/devices/DevicesTab, "Updating").
test("a computer's row says its crew's work is being saved, offers Update later by keyboard, and says it is resuming after", async () => {
  const home = freshHome();
  const bridge = fakeBridge(home);
  const mini = deviceLabel(MINI);
  const saving: DeviceView = {
    ...MINI,
    updateWork: { state: "saving", tasks: ["Fix the footer", "Add the pricing page"] },
  };
  bridge.answer("inf:devices:list", () => [AIR, saving, STUDIO]);
  bridge.answer("inf:devices:addresses", ADDRESSES);
  bridge.answer("inf:devices:sign-ins", []);
  bridge.answer("inf:devices:nearby", (watching) => ({
    state: watching ? "looking" : "off",
    user: null,
    macs: [],
  }));
  const later: string[] = [];
  bridge.answer("inf:devices:update-later", (deviceId) => {
    later.push(deviceId);
    return true;
  });
  await openSize();
  await openWindow(bridge);
  await openDevices();
  await selectDevice("mini");

  // Saving work: the update's line, then what it waits for beside Update later; no Match meanwhile.
  const strip = '[data-device-row="mini"] [data-device-update-saving]';
  await shown(strip);
  expect(document.querySelector(strip)?.textContent).toContain(
    `${m.devicesUpdateSaving({ device: mini })} ${m.devicesUpdateWaitingFor({ tasks: "Fix the footer and Add the pricing page" })}`,
  );
  expect(
    row("mini")?.querySelector(`[aria-label="${m.settingsDevicesMatchNamed({ device: mini })}"]`),
  ).toBeNull();
  const button = row("mini")?.querySelector<HTMLButtonElement>("[data-device-update-later]");
  expect(button?.getAttribute("aria-label")).toBe(m.devicesUpdateLaterNamed({ device: mini }));
  expect(button?.textContent).toBe(m.devicesUpdateLater());

  // Reached with Tab, Update later answers Enter and lets the update go.
  for (let tab = 0; tab < 60 && document.activeElement !== button; tab++) await userEvent.tab();
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => later).toEqual(["mini"]);

  // The update went on and is over: the row says it is resuming until each stopped turn started again.
  bridge.push("inf:devices", [
    AIR,
    {
      ...MINI,
      otherVersion: undefined,
      updateWork: { state: "resuming", tasks: ["Fix the footer"] },
    },
    STUDIO,
  ]);
  await gone(strip);
  const resuming = '[data-device-row="mini"] [data-device-update-resuming]';
  await shown(resuming);
  expect(document.querySelector(resuming)?.textContent).toBe(
    m.devicesUpdateResuming({ device: mini }),
  );

  bridge.push("inf:devices", [AIR, { ...MINI, otherVersion: undefined }, STUDIO]);
  await gone(resuming);
  expect(unansweredOf(bridge)).toEqual([]);
});
