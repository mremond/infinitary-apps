import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

// The key read dials the port itself everywhere but on a Mac, so the test reads it as Linux does.
vi.mock("../platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platform")>()),
  hostPlatform: () => "linux",
}));

const { readOwnHostKey } = await import("./hostKey");

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A port on this computer's loopback where something takes the connection and closes it, sending no SSH key. */
async function notSsh(): Promise<number> {
  const server = createServer((socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const at = server.address();
  if (!at || typeof at === "string") throw new Error("no port");
  return at.port;
}

// INF-6043's change 5: "Could not reach" names the step and port that failed. A Windows
// user's add stopped at the key read with something at port 22 that sent no key.
describe("reading a computer's SSH key", () => {
  it("says the port it read at and that something answered there with no SSH key", async () => {
    const port = await notSsh();
    expect(await readOwnHostKey("127.0.0.1", port)).toEqual({
      refusal: "unreachable",
      reach: { step: "key", port, answered: true },
    });
  });
});
