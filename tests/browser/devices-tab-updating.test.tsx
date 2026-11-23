import type { DeviceView } from "@shared/devices";
import * as m from "@shared/i18n/messages.generated";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { fakeBridge } from "./bridge";
import { ADDRESSES, AIR, MINI, openDevices, STUDIO, shown, unansweredOf } from "./devicesTab";
import { freshHome } from "./freshHome";
import { openWindow } from "./window";

// The captain's ask (INF-6166's plan): a work computer the home is updating
// reads Updating on the Devices map, on a trying edge, never Out of reach in
// warn; a computer truly out of reach still does.
test("the map reads a computer being updated as updating, and one out of reach as away", async () => {
  const away = { inReach: false, connectedAt: undefined, otherVersion: undefined, ssh: undefined };
  const peers: DeviceView[] = [
    AIR,
    { ...MINI, ...away, remoteLogin: undefined, updating: true },
    { ...STUDIO, ...away, remoteLogin: undefined },
  ];
  const bridge = fakeBridge(await freshHome());
  bridge.answer("inf:devices:list", () => peers);
  bridge.answer("inf:devices:addresses", ADDRESSES);
  bridge.answer("inf:devices:sign-ins", []);
  bridge.answer("inf:devices:nearby", () => ({ state: "off", user: null, macs: [] }));
  await page.viewport(1330, 940);
  await openWindow(bridge);
  await openDevices();
  const map = await shown('[data-layout="map"]');
  const mini = await shown(`[data-device-select="${MINI.id}"] .fm-topology-state`);
  expect(mini.getAttribute("data-contact")).toBe("trying");
  expect(mini.textContent).toBe(m.settingsDevicesMapUpdating());
  const studio = await shown(`[data-device-select="${STUDIO.id}"] .fm-topology-state`);
  expect(studio.getAttribute("data-contact")).toBe("away");
  expect(studio.textContent).toBe(m.settingsDevicesMapAway());
  expect(map.querySelectorAll('path[data-contact="trying"]')).toHaveLength(1);
  expect(map.querySelectorAll('path[data-contact="away"]')).toHaveLength(1);
  expect(unansweredOf(bridge)).toEqual([]);
});
