import { type DeviceView, deviceViewSchema } from "@shared/devices";
import { expect, it } from "vitest";
import { z } from "zod";
import { connectClient } from "../../../tests/helpers/connectionClient";
import { home } from "../../../tests/helpers/connectionHome";
import type { CoreDispatch } from "../dispatcher";

// The captain's ask: a computer being updated reads updating, not out of reach
// (`computer-updating`). A desktop from before reads a device strictly, so it is
// never answered or pushed the new field and keeps its own words; a view naming
// the change reads it.
it("leaves a device's updating out of the list for a view without the change", async () => {
  const mini: DeviceView = {
    id: "mini",
    kind: "work",
    name: "Mac mini",
    pairedAt: 1_000,
    inReach: false,
    updating: true,
  };
  const at = await home({
    dispatch: (async (channel) => {
      if (channel === "inf:devices:list") return [mini];
      throw new Error("Unexpected request");
    }) as CoreDispatch,
  });
  const grant = await at.join();
  const older = await connectClient(grant, { changes: [] });
  const current = await connectClient(grant, { changes: ["computer-updating"] });
  const olderList = z.array(deviceViewSchema.omit({ updating: true }));
  const { updating: _updating, ...without } = mini;
  expect(olderList.parse(await older.invoke("inf:devices:list", []))).toEqual([without]);
  expect(await current.invoke("inf:devices:list", [])).toEqual([mini]);
  at.events.emit("inf:devices", [mini]);
  const pushed = await older.push((push) => push.channel === "inf:devices");
  expect(olderList.parse(pushed.payload)).toEqual([without]);
  expect((await current.push((push) => push.channel === "inf:devices")).payload).toEqual([mini]);
  await older.close();
  await current.close();
});
