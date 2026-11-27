import { randomUUID } from "node:crypto";

// Transport errors can embed control URLs and pairing data. Keep their type/code chain, never messages or stacks.
export function phoneKeyboardError(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current !== undefined && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    const code = current instanceof Error && "code" in current ? current.code : undefined;
    chain.push({
      type: current instanceof Error ? current.constructor.name : typeof current,
      ...((typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) ||
      (typeof code === "number" && Number.isFinite(code))
        ? { code }
        : {}),
    });
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

export function phoneKeyboardDiagnostic(phase: string, correlation?: string) {
  const id =
    correlation && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(correlation)
      ? correlation
      : randomUUID();
  const started = performance.now();
  return (event: string, fields: Record<string, unknown> = {}) => {
    console.log(
      `Phone keyboard diagnostic: ${JSON.stringify({
        id,
        phase,
        event,
        uptimeMs: performance.now(),
        wallTimeMs: Date.now(),
        elapsedMs: performance.now() - started,
        ...fields,
      })}`,
    );
  };
}

export function phoneKeyDiagnosticDestinations(proof: readonly string[]) {
  return proof.flatMap((line) =>
    [...line.matchAll(/<keyboardFocus;([^<>]+)>/g)].map((match) => {
      const fields = match[1] ?? "";
      return {
        pid: Number(/\bpid: (\d+)/.exec(fields)?.[1]) || null,
        display: /\bdisplay: ([\dA-Fa-f-]+)/.exec(fields)?.[1] ?? null,
        token: /\btoken: (0x[\dA-Fa-f]+)/.exec(fields)?.[1] ?? null,
      };
    }),
  );
}

export async function keepPhoneKeyRoutingDiagnostics(
  run: (command: string, args: string[]) => Promise<string>,
  appPid: number,
  proof: readonly string[],
) {
  const diagnostic = phoneKeyboardDiagnostic("duo-key-routing");
  const destinations = phoneKeyDiagnosticDestinations(proof);
  diagnostic("event-destinations", { appPid, destinations });
  const pids = [...new Set([appPid, ...destinations.flatMap(({ pid }) => (pid ? [pid] : []))])];
  try {
    // Simulator PIDs are host PIDs. The runner keeps output, so use accounting names, not paths or arguments.
    const table = await run("ps", ["-p", pids.join(","), "-o", "pid=,ucomm="]);
    const processes = pids.map((pid) => {
      const line = table.split("\n").find((row) => Number(/^\s*(\d+)\s/.exec(row)?.[1]) === pid);
      const accountingName = line?.replace(/^\s*\d+\s+/, "").trim();
      return { pid, accountingName: accountingName || null };
    });
    diagnostic("process-identities", { appPid, identityKind: "ps-ucomm", processes });
  } catch (error) {
    // Losing a diagnostic read must not replace the actual single press's result or error.
    diagnostic("identity-read-failed", { errors: phoneKeyboardError(error) });
  }
}
