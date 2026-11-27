import { execFile, type ChildProcess } from "node:child_process";

export function readPhoneKeyProcessNames(
  pids: readonly number[], signal: AbortSignal, env: NodeJS.ProcessEnv, children: Set<ChildProcess>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let result: { error: Error | null; output: string } | undefined;
    // Use the launcher's isolated hostEnv and a wall-time cap, not the general command hang sampler.
    const child = execFile("ps", ["-p", pids.join(","), "-o", "pid=,ucomm="], {
      env, signal, timeout: 5_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024,
    }, (error, output) => { result = { error, output }; });
    children.add(child);
    // An aborted execFile can call back before its process exits; cleanup owns that exit too.
    child.once("close", () => {
      children.delete(child);
      if (!result) reject(new Error("The keyboard process reader closed without a result"));
      else if (result.error) reject(result.error);
      else resolve(result.output);
    });
  });
}
