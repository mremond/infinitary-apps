import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { UPDATE_RETURN_MS } from "@shared/workUpdate";
import { z } from "zod";
import { writePrivate } from "../devices/identity";
import { shellWord } from "../devices/shellWord";
import { hostEnv } from "../hostEnv";
import type { BackgroundContext, Service } from "./background";

/**
 * A copy that does not start (docs/helper.md, "A copy that does not start").
 * An update over the connection keeps the copy it replaces beside the new
 * one (`<app>.previous`) and writes a trial (`app/trial.json`). The new
 * copy's run ends the trial the first time it reaches the home: the
 * previous copy goes. Should it not reach the home within the update's
 * wait (`UPDATE_RETURN_MS`) - it exits at start, or starts and never
 * connects - a watcher the old run left behind puts the previous copy back
 * at the same path, keeps what failed (`app/went-back.json`) and has the
 * service manager start the background again, now from the previous copy.
 * That run's hello tells the home that the copy it sent did not start here,
 * once: the home names its own version, the one it sent.
 *
 * A Mac's first update, an update across the rename and an update over
 * Remote Login rewrite more than the copy: they set aside what they replace
 * (`setAside`, in `app/before-update`) and the watcher puts each thing back,
 * takes away what the new copy set up and has the service manager read the
 * agent anew (`TrialRestore`).
 *
 * Whoever renames the trial file first decides: the new run to keep its
 * copy, or the watcher to go back. A rename is one step, so the two never
 * both act.
 */

const TRIAL_FILE = "trial.json";
const WENT_BACK_FILE = "went-back.json";
const PREVIOUS = ".previous";
const SET_ASIDE = "before-update";

const trialSchema = z.strictObject({
  version: z.literal(1),
  /** The copy the background starts: the new one while the trial lasts. */
  app: z.string().min(1),
  /** The copy it replaced, kept until the new one reached the home. */
  previous: z.string().min(1),
});
type Trial = z.infer<typeof trialSchema>;

/** Where a copy kept for a trial keeps the one it replaced. */
export function previousOf(app: string): string {
  return `${app}${PREVIOUS}`;
}

/** Where the trial is written: gone once the new copy reached the home, or the watcher went back. */
export function trialPathOf(dataDir: string): string {
  return trialPath(dataDir);
}

function trialPath(dataDir: string): string {
  return join(dataDir, "app", TRIAL_FILE);
}

function wentBackPath(dataDir: string): string {
  return join(dataDir, "app", WENT_BACK_FILE);
}

/** Writes the trial for a copy just kept at `app`, with the one it replaced beside it. */
export function beginTrial(dataDir: string, app: string, previous = previousOf(app)): void {
  const trial: Trial = { version: 1, app, previous };
  writePrivate(trialPath(dataDir), `${JSON.stringify(trial, null, 2)}\n`);
}

/**
 * The new copy reached the home: the trial ends, and the copy it replaced
 * goes, with any earlier note of a version that did not start. Answers
 * whether a trial ended here; false when none was open, or the watcher went
 * back first.
 */
export function endTrial(dataDir: string): boolean {
  const path = trialPath(dataDir);
  if (!existsSync(path)) return false;
  let trial: Trial | null = null;
  try {
    trial = trialSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    trial = null;
  }
  const ending = `${path}.ending`;
  try {
    renameSync(path, ending);
  } catch {
    // The watcher took it first: it goes back.
    return false;
  }
  if (trial) rmSync(trial.previous, { recursive: true, force: true });
  rmSync(ending, { force: true });
  rmSync(wentBackPath(dataDir), { force: true });
  return true;
}

/**
 * Whether a watcher went back here from a copy the home sent, which the next
 * hello says until the home has heard it (`forgetWentBack`).
 */
export function readWentBack(dataDir: string): boolean {
  return existsSync(wentBackPath(dataDir));
}

/** The home heard that the copy it sent did not start here: it is not said again. */
export function forgetWentBack(dataDir: string): void {
  rmSync(wentBackPath(dataDir), { force: true });
}

/**
 * What a watcher puts back when it goes back: each thing the update set
 * aside inside the trial's previous, at its own place (`restore`, in order),
 * what the new copy set up that goes (`remove`), and the service manager's
 * commands that start the background again from what was put back (`commands`,
 * run last). A copy kept at the same path puts back that one copy and asks
 * for a restart; an update that rewrote the agent puts its file and record
 * back too and has the agent read anew (`TrialWatch.reload`).
 */
export type TrialRestore = {
  restore: readonly { from: string; to: string }[];
  remove: readonly string[];
  commands: readonly (readonly string[])[];
};

/**
 * The watcher, in the system's own shell so it needs nothing of the copy it
 * watches: it waits while the trial is open, up to its seconds; a trial
 * still open then is taken (one rename), each thing set aside is put back at
 * its place, the one there set aside first and put back should the move
 * fail, what the new copy set up goes, the trial is kept as what went back,
 * and the service manager's own commands run last.
 */
export function watcherScript(
  at: { trial: string; previous: string; back: string; seconds: number },
  restore: TrialRestore,
): string {
  const q = shellWord;
  const trial = q(at.trial);
  const going = q(`${at.trial}.going`);
  // i18n-exempt: a shell script for the system's own shell, never words a person reads.
  const lines = [
    "i=0",
    `while [ -e ${trial} ] && [ "$i" -lt ${Math.max(0, Math.floor(at.seconds))} ]; do sleep 1; i=$((i+1)); done`,
    `mv ${trial} ${going} 2>/dev/null || exit 0`,
    `if [ ! -e ${q(at.previous)} ]; then rm -f ${going}; exit 0; fi`,
  ];
  for (const { from, to } of restore.restore) {
    const failed = q(`${to}.failed`);
    // i18n-exempt: shell lines.
    lines.push(
      `if [ -e ${q(from)} ]; then`,
      `  rm -rf ${failed}`,
      `  if [ -e ${q(to)} ]; then mv ${q(to)} ${failed} || exit 1; fi`,
      `  mv ${q(from)} ${q(to)} || { mv ${failed} ${q(to)}; rm -f ${going}; exit 1; }`,
      `  rm -rf ${failed}`,
      "fi",
    );
  }
  // i18n-exempt: shell lines.
  for (const path of restore.remove) lines.push(`rm -rf ${q(path)}`);
  // i18n-exempt: shell lines.
  lines.push(`rm -rf ${q(at.previous)}`, `mv ${going} ${q(at.back)}`);
  for (const command of restore.commands) lines.push(command.map(q).join(" "));
  return lines.join("\n");
}

/**
 * How this computer's service manager starts the background again from
 * outside its run, and how a process outlives that run: none when it cannot
 * be asked from a program of its own, and then no trial is kept.
 *
 * On a Mac a shell in a session of its own outlives the agent's run, as
 * `reloadInBackground`'s does, and `launchctl kickstart -k` starts the
 * agent again. On Linux the service's own stop takes every process it
 * started with it, so the watcher runs as a transient service of the
 * user's own systemd (`systemd-run`), and `systemctl --user restart` starts
 * the service again.
 */
export type TrialWatch = {
  wrap: readonly string[];
  restart: readonly string[];
  /** Has the service manager read an agent's file anew and start it: after its file was put back. */
  reload: (service: Service) => string[][];
  /** Lets an agent go by its label, its file already gone: one the new copy set up under another. */
  unload: (label: string) => string[];
};

export function trialWatchOf(context: BackgroundContext, service: Service): TrialWatch | null {
  if ("launchctl" in context) {
    const program = context.launchctl.program;
    if (!program) return null;
    const domain = `gui/${context.uid}`;
    return {
      wrap: [],
      restart: [program, "kickstart", "-k", `${domain}/${service.label}`],
      reload: (agent) => [
        [program, "bootout", `${domain}/${agent.label}`],
        [program, "bootstrap", domain, agent.file],
      ],
      unload: (label) => [program, "bootout", `${domain}/${label}`],
    };
  }
  // A Windows PC gets a newer Infinitary only by an install there, with no trial here.
  if ("schtasks" in context) return null;
  const program = context.systemctl.program;
  if (!program) return null;
  // The system's own systemd-run sits beside its systemctl; a stand-in
  // systemctl with none beside it keeps no trial.
  const run = join(dirname(program), "systemd-run");
  if (!existsSync(run)) return null;
  return {
    wrap: [run, "--user", "--collect", "--quiet", "--"],
    restart: [program, "--user", "restart", service.label],
    reload: (unit) => [
      [program, "--user", "daemon-reload"],
      [program, "--user", "restart", unit.label],
    ],
    unload: (label) => [program, "--user", "stop", label],
  };
}

/**
 * Leaves the watcher running once the run let the folder go: what an update
 * that kept a trial does last. The watcher itself is never waited for; a
 * wrapped one (`systemd-run`) is waited for until its transient service
 * started, since the run's own service stop takes the wrapper with it.
 */
export async function watchTrial(
  dataDir: string,
  watch: TrialWatch,
  options: { seconds?: number; restore?: TrialRestore } = {},
): Promise<void> {
  const path = trialPath(dataDir);
  let trial: Trial;
  try {
    trial = trialSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return;
  }
  const seconds = options.seconds ?? Math.ceil(UPDATE_RETURN_MS / 1000);
  const restore: TrialRestore = options.restore ?? {
    restore: [{ from: trial.previous, to: trial.app }],
    remove: [],
    commands: [watch.restart],
  };
  const script = watcherScript(
    { trial: path, previous: trial.previous, back: wentBackPath(dataDir), seconds },
    restore,
  );
  const args = ["/bin/sh", "-c", script, "infinitary-update-watch"];
  const [program, ...rest] = [...watch.wrap, ...args] as [string, ...string[]];
  const child = spawn(program, rest, { detached: true, stdio: "ignore", env: hostEnv() });
  if (watch.wrap.length === 0) {
    child.unref();
    return;
  }
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.once("error", () => resolve());
  });
}

/**
 * Where an update that rewrites the agent, or keeps a copy under another
 * path, sets aside what it replaces until the new copy reached the home:
 * the trial's previous, which ending the trial takes away whole.
 */
export function setAsidePath(dataDir: string): string {
  return join(dataDir, "app", SET_ASIDE);
}

/**
 * Sets aside what an update is about to replace, inside `previous`: a file
 * copied (an agent's file, the record), or a copy of the app moved, in
 * order. Answers where each goes back. A path that is not there is skipped,
 * so nothing is put back in its place.
 */
export function setAside(
  previous: string,
  items: readonly { path: string; move?: boolean }[],
): { from: string; to: string }[] {
  mkdirSync(previous, { recursive: true, mode: 0o700 });
  const pairs: { from: string; to: string }[] = [];
  items.forEach(({ path, move }, index) => {
    if (!existsSync(path)) return;
    const from = join(previous, `${index}-${basename(path)}`);
    rmSync(from, { recursive: true, force: true });
    if (move) renameSync(path, from);
    else cpSync(path, from, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
    pairs.push({ from, to: path });
  });
  return pairs;
}

/** Puts back at once what `setAside` set aside, for an update that stopped before its trial began. */
export function putBack(pairs: readonly { from: string; to: string }[], previous: string): void {
  for (const { from, to } of pairs) {
    if (!existsSync(from)) continue;
    rmSync(to, { recursive: true, force: true });
    renameSync(from, to);
  }
  rmSync(previous, { recursive: true, force: true });
}
