import { expect, test } from "vitest";
import { deferred } from "./helpers/deferred";
import { setPhoneHardwareKeyboard } from "./helpers/phoneKeyboard";

// A timed-out control request can leave its host command alive; the simulator owner must order cleanup after it.
test("detachment follows a delayed attachment even when its caller has stopped waiting", async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const writes: string[] = [];
  let attached = false;
  const run = async (_command: string, args: string[]) => {
    const next = (Number(args[6]) & 0xff) === 1;
    if (next) {
      writes.push("attachment started");
      entered.resolve();
      await release.promise;
    }
    attached = next;
    writes.push(next ? "attached" : "detached");
  };
  const attachment = setPhoneHardwareKeyboard(run, "A9EEAD2F-B238-4612-9A9C-250E64BC7E52", true);
  await entered.promise;
  const cleanup = setPhoneHardwareKeyboard(run, "A9EEAD2F-B238-4612-9A9C-250E64BC7E52", false);
  try {
    expect(writes).toEqual(["attachment started"]);
  } finally {
    release.resolve();
  }
  await cleanup;
  await attachment;
  expect(writes).toEqual(["attachment started", "attached", "detached"]);
  expect(attached).toBe(false);
});

test("an attachment error does not block the following cleanup write", async () => {
  const writes: boolean[] = [];
  const run = async (_command: string, args: string[]) => {
    const attached = (Number(args[6]) & 0xff) === 1;
    writes.push(attached);
    if (attached) throw new Error("No owned simulator keyboard exists");
  };
  const attachment = setPhoneHardwareKeyboard(run, "A9EEAD2F-B238-4612-9A9C-250E64BC7E52", true);
  const cleanup = setPhoneHardwareKeyboard(run, "A9EEAD2F-B238-4612-9A9C-250E64BC7E52", false);
  await expect(attachment).rejects.toThrow("No owned simulator keyboard exists");
  await cleanup;
  expect(writes).toEqual([true, false]);
});
