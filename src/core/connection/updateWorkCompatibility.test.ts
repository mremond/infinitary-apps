import { type DeviceView, deviceViewSchema } from "@shared/devices";
import { expect, it } from "vitest";
import { z } from "zod";
import { connectClient } from "../../../tests/helpers/connectionClient";
import { home } from "../../../tests/helpers/connectionHome";
import type { CoreDispatch } from "../dispatcher";

// A computer's crew work saved before its update shows on its row
// (`work-update-saving`). A desktop from before reads a device strictly, so it
// is never answered or pushed the new field and keeps reading the list; a view
// naming the change reads it.
it("leaves a device's updateWork out of the list for a view without the change", async () => {
  const mini: DeviceView = {
    id: "mini",
    kind: "mac",
    name: "Mac mini",
    pairedAt: 1_000,
    inReach: true,
    runs: ["website"],
    updateWork: { state: "saving", tasks: ["Fix the footer"] },
  };
  const at = await home({
    dispatch: (async (channel) => {
      if (channel === "inf:devices:list") return [mini];
      throw new Error("Unexpected request");
    }) as CoreDispatch,
  });
  const grant = await at.join();
  const older = await connectClient(grant, { changes: [] });
  const current = await connectClient(grant, { changes: ["work-update-saving"] });
  const olderList = z.array(deviceViewSchema.omit({ updateWork: true }));
  const { updateWork: _work, ...without } = mini;
  expect(olderList.parse(await older.invoke("inf:devices:list", []))).toEqual([without]);
  expect(await current.invoke("inf:devices:list", [])).toEqual([mini]);
  at.events.emit("inf:devices", [mini]);
  const pushed = await older.push((push) => push.channel === "inf:devices");
  expect(olderList.parse(pushed.payload)).toEqual([without]);
  expect((await current.push((push) => push.channel === "inf:devices")).payload).toEqual([mini]);
  await older.close();
  await current.close();
});
