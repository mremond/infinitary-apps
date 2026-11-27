import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { availableParallelism, loadavg } from "node:os";
import {
  type DeadlineTimer,
  LOAD_CLOCK_TICK_MS,
  type LoadClock,
  processorShare,
  tickedLoadClock,
  waitCap,
} from "./loadClock.ts";

/**
 * Whether this run grades durations against their budgets (captain's B1,
 * "one clock, budgets measured", 2026-09-24; INF-857, the captain's choice:
 * "Grade durations only on a quiet run, as journeys already do").
 *
 * A duration measured on a host running other work grades the load, not the
 * code, so only a run on a quiet host with INFINITARY_PERF_BUDGETS=1 holds a
 * test to its budget: `verify.yml`'s on-demand `perf` input. On every other
 * run a journey's and a unit test's waits run on the load clock below. The
 * e2e budgets read this through `tests/e2e/perf.ts`; vitest's test and hook
 * limits and its waits read the clock `startUnitLoadClock` starts, through
 * the patches of `@vitest/runner` and `vitest` (`patches/`).
 */
export const GRADES_BUDGETS = process.env.INFINITARY_PERF_BUDGETS === "1";

export { type DeadlineTimer, LOAD_CLOCK_TICK_MS, type LoadClock, waitCap };

/**
 * How long this computer's work has waited on its disk, in microseconds:
 * the `some` total of Linux's I/O pressure counter, the time at least one
 * task was held waiting for its disk. A process waiting on a disk sync from
 * Node's thread pool keeps its own timers running, so neither a late tick
 * nor the one-minute load shows that wait; this counter does. Answers
 * undefined where the kernel keeps no such counter - macOS, Windows, or a
 * Linux started without it - and the clock then counts as it did before.
 */
export function linuxDiskWaits(
  read: () => string = () => readFileSync("/proc/pressure/io", "utf8"),
): (() => number) | undefined {
  const total = () => Number(/^some\b.*\btotal=(\d+)/m.exec(read())?.[1]);
  try {
    if (!Number.isFinite(total())) return undefined;
  } catch {
    return undefined;
  }
  return () => {
    try {
      return total();
    } catch {
      return Number.NaN;
    }
  };
}

/**
 * The share of the time since its previous reading that this computer's work
 * did not wait on its disk, from `waited`'s running total in microseconds.
 * A gap whose reading, or the one before it, failed counts in full: a share
 * comes only from the two readings around its gap, never an older one. With
 * no counter it is always 1.
 */
function diskShare(wall: () => number, waited: (() => number) | undefined): () => number {
  if (!waited) return () => 1;
  let lastWall = wall();
  let lastWaited = waited();
  return () => {
    const nowWall = wall();
    const nowWaited = waited();
    const span = (nowWall - lastWall) * 1000;
    const share =
      span > 0 && Number.isFinite(nowWaited) && Number.isFinite(lastWaited)
        ? 1 - Math.min(1, Math.max(0, (nowWaited - lastWaited) / span))
        : 1;
    lastWall = nowWall;
    lastWaited = nowWaited;
    return share;
  };
}

/**
 * A Node process's load clock (`loadClock.ts`), ticked by a timer of its own
 * every `LOAD_CLOCK_TICK_MS`, at the share of a processor this computer's
 * one-minute load leaves, times the share of the time its work did not wait
 * on its disk where its owner gives that counter (`diskWaits`), as a vitest
 * worker's clock does on Linux (`startUnitLoadClock`).
 */
export function startLoadClock(
  wall: () => number = performance.now.bind(performance),
  load: () => number = () => loadavg()[0] ?? 0,
  processors = availableParallelism(),
  diskWaits?: () => number,
): LoadClock & { tick(): void; stop(): void } {
  // The timers as they stand at the start, so a unit test that fakes them later keeps its limits on real time.
  const { setInterval, clearInterval } = globalThis;
  const disk = diskShare(wall, diskWaits);
  const clock = tickedLoadClock(wall, () => processorShare(load(), processors) * disk());
  const ticker = setInterval(clock.tick, LOAD_CLOCK_TICK_MS);
  ticker.unref();
  return { ...clock, stop: () => clearInterval(ticker) };
}

const CLOCK = Symbol.for("infinitary.loadClock");
const scope = globalThis as { [CLOCK]?: LoadClock };

/** The native phone launcher opts its Node failure timers into the same clock as journeys. */
export function startPhoneLoadClock(): void {
  if (!GRADES_BUDGETS) scope[CLOCK] ??= startLoadClock();
}

/**
 * The browser project's command process - the vitest process that answers its
 * pages' commands and drives their Playwright - opts in as well, from the
 * project's global setup (`browserCommandClock.ts`). A page gives each user
 * event, such as a click, the load time its test has left (the patched
 * `@vitest/runner`), and the patched `playwright-core` here counts that limit on
 * this clock, so a command process held by other work does not end the event
 * early. It answers how to put the process back on the wall clock.
 */
export function startCommandLoadClock(): () => void {
  if (GRADES_BUDGETS || scope[CLOCK]) return () => undefined;
  const clock = startLoadClock();
  scope[CLOCK] = clock;
  return () => {
    clock.stop();
    if (scope[CLOCK] === clock) delete scope[CLOCK];
  };
}

const UNIT_CLOCK = Symbol.for("infinitary.unitLoadClock");

/**
 * A vitest worker's clock, which the patched `@vitest/runner` and `vitest`
 * read for every test and hook limit and every `expect.poll` and `vi.waitFor`
 * window on an ordinary run. `waitWindow.ts`, a setup file of every project
 * whose tests run in Node, starts it before any test can fake the timers; the
 * browser project's page keeps one under the same name, ticked by its command
 * process (`tests/browser/loadClock.ts`). It is a clock of its own,
 * not `budgetTimer`'s: a unit test that drives a helper's failure timer with
 * fake timers keeps that timer on the time it fakes.
 *
 * On Linux it also leaves out the time the computer's work waited on its disk
 * (`linuxDiskWaits`): a test that syncs its files to a disk other work starves
 * keeps its limit. A run that must not depend on the computer's own disk, such
 * as `tests/wait-window.test.ts`'s, starts it first with a counter of its own.
 */
export function startUnitLoadClock(diskWaits = linuxDiskWaits()): void {
  const unitScope = globalThis as { [UNIT_CLOCK]?: LoadClock };
  if (!GRADES_BUDGETS)
    unitScope[UNIT_CLOCK] ??= startLoadClock(undefined, undefined, undefined, diskWaits);
}

/** This vitest worker's clock that `startUnitLoadClock` started; none on a graded run. */
export function unitLoadClock(): LoadClock | undefined {
  return (globalThis as { [UNIT_CLOCK]?: LoadClock })[UNIT_CLOCK];
}

/**
 * The product's own request deadlines, made with `AbortSignal.timeout`,
 * counted on `clock` while a unit test drives real requests through them, as
 * the boxed classifier's are (INF-1614). Each keeps the length the product
 * gave it. A worker the runner stalls past a deadline then keeps its request,
 * as it keeps the test's own limit, and a deadline still ends by its wall cap.
 * With no clock, as on a graded run, the deadlines stay native. Answers how to
 * put the native deadline back; call it once per test, never nested.
 */
export function requestDeadlinesOnLoadClock(clock: LoadClock | undefined): () => void {
  if (!clock) return () => undefined;
  const native = AbortSignal.timeout;
  AbortSignal.timeout = (milliseconds) => {
    const controller = new AbortController();
    clock
      .timer(
        () =>
          controller.abort(
            new DOMException("The operation was aborted due to timeout", "TimeoutError"),
          ),
        clock.now() + milliseconds,
      )
      .unref();
    return controller.signal;
  };
  return () => {
    AbortSignal.timeout = native;
  };
}

/** Only the disposable home's control server, never the app's transport.
 * A queued POST survives a frozen home, but an unused connection still closes by a finite cap.
 */
export function keepControlConnection(server: Server): void {
  if (!GRADES_BUDGETS) server.keepAliveTimeout = waitCap(server.keepAliveTimeout);
}

/**
 * The clock this process's waits run on: a Playwright test worker's on an
 * ordinary run, where the patched `playwright` and `playwright-core` read it
 * at every wait deadline (`patches/`). The native launcher explicitly opts
 * into the same shared clock. A graded run, the journey runner's own process
 * and processes that did not opt in keep the wall clock.
 */
export const loadClock: LoadClock | undefined = (() => {
  if (GRADES_BUDGETS || process.env.TEST_WORKER_INDEX === undefined) return undefined;
  scope[CLOCK] ??= startLoadClock();
  return scope[CLOCK];
})();

export function budgetReading(milliseconds: number) {
  const clock = scope[CLOCK];
  return {
    clock: clock ? "load" : "wall",
    nowMs: clock?.now() ?? performance.now(),
    budgetMs: milliseconds,
    wallCapMs: clock ? waitCap(milliseconds) : milliseconds,
  };
}

/**
 * A test's own failure timer, never a stimulus, a poll interval or a product
 * deadline: it fires after `milliseconds` of load time on an ordinary journey
 * or native phone run, by its wall cap at the latest, and after `milliseconds`
 * on the wall clock everywhere else.
 */
export function budgetTimer(fail: () => void, milliseconds: number): DeadlineTimer {
  const clock = scope[CLOCK];
  if (clock) return clock.timer(fail, clock.now() + milliseconds);
  const timer = setTimeout(fail, milliseconds);
  const handle: DeadlineTimer = {
    cancel: () => clearTimeout(timer),
    unref: () => {
      timer.unref();
      return handle;
    },
  };
  return handle;
}
