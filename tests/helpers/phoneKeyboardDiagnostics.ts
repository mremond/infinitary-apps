import { randomUUID } from "node:crypto";
import type { PhoneKeyOutcome } from "./phoneKeyboard";

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
  const record = (event: string, fields: Record<string, unknown> = {}) => {
    console.log(
      `Phone keyboard diagnostic: ${JSON.stringify({
        ...fields,
        id,
        phase,
        event,
        uptimeMs: performance.now(),
        wallTimeMs: Date.now(),
        elapsedMs: performance.now() - started,
      })}`,
    );
  };
  return Object.assign(record, { id });
}

export function phoneKeyFocusDestinations(line: string) {
  return [...line.matchAll(/<keyboardFocus;[^<>]*; pid: (\d+);[^<>]*>/g)].map((match) => ({
    pid: Number(match[1]),
    display: /\bdisplay: ([\dA-Fa-f-]+)/.exec(match[0])?.[1] ?? null,
    token: /\btoken: (0x[\dA-Fa-f]+)/.exec(match[0])?.[1] ?? null,
  }));
}

export function phoneKeyDiagnosticDestinations(proof: readonly string[]) {
  return proof.map((event) => ({ event, destinations: phoneKeyFocusDestinations(event) }));
}

type ProcessReader = (pids: readonly number[], signal: AbortSignal) => Promise<string>;

export class PhoneKeyRoutingDiagnostics {
  private pending = new Set<Promise<void>>();
  private controllers = new Set<AbortController>();
  private closed = false;
  private read: ProcessReader;

  constructor(read: ProcessReader) {
    this.read = read;
  }

  observe(appPid: number, outcome: PhoneKeyOutcome): PhoneKeyOutcome {
    const diagnostic = phoneKeyboardDiagnostic("duo-key-routing");
    const evidence = phoneKeyDiagnosticDestinations(outcome.proof);
    diagnostic("event-destinations", {
      appPid,
      outcome: outcome.outcome,
      evidence,
      ambiguous: outcome.proof.length > 1,
      missingProof: outcome.proof.length === 0,
    });
    if (this.closed) {
      diagnostic("identity-not-started-after-close");
      return outcome;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const pids = [
      ...new Set([
        appPid,
        ...evidence.flatMap(({ destinations }) => destinations.map(({ pid }) => pid)),
      ]),
    ];
    const work = this.capture(pids, controller.signal, diagnostic).finally(() => {
      this.pending.delete(work);
      this.controllers.delete(controller);
    });
    this.pending.add(work);
    return outcome;
  }

  private async capture(
    pids: readonly number[],
    signal: AbortSignal,
    diagnostic: ReturnType<typeof phoneKeyboardDiagnostic>,
  ) {
    try {
      const table = await this.read(pids, signal);
      const processes = pids.map((pid) => {
        const line = table.split("\n").find((row) => Number(/^\s*(\d+)\s/.exec(row)?.[1]) === pid);
        const accountingName = line?.replace(/^\s*\d+\s+/, "").trim();
        return { pid, accountingName: accountingName || null };
      });
      diagnostic("process-identities", { identityKind: "ps-ucomm", processes });
    } catch (error) {
      // Diagnostic settlement must not replace the completed key's response.
      diagnostic("identity-read-failed", { errors: phoneKeyboardError(error) });
    }
  }

  async close() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    await Promise.all(this.pending);
  }
}
