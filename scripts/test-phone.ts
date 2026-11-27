/** INF-64 piece 2's native gate: disposable real home, simulators sized to the Mac, no signing. */
import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, totalmem, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { budgetTimer, GRADES_BUDGETS, startPhoneLoadClock } from "../tests/helpers/budgets.ts";
import { phoneGuestJourneyFinished } from "../tests/helpers/phoneGuestLaunches.ts";
import { observePhoneLog } from "../tests/helpers/phoneLogs.ts";
import { capturePhoneIdleTimeout, capturePhoneKeyboardTimeout, phoneLaunchOwner, phoneLaunchProcesses, phoneProcessTable, phoneRenderProcesses } from "../tests/helpers/phoneStacks.ts";
import { phoneWebContentStartup } from "../tests/helpers/phoneWebContent.ts";
import { capturePhoneWebStacks } from "../tests/helpers/phoneWebStacks.ts";
import { libraryPhotoAdded, photosOpened } from "../tests/helpers/phonePhotos.ts";
import { changePhoneTextSize, joinPhoneHardwareKeyboardWrites, setPhoneHardwareKeyboard, observePhoneKeyboard, type PhoneChord, type PhoneDisplayReport, type PhoneTextSize, phoneApplicationPid, phoneDisplayDeadline, phoneTouchDeadline, withPhoneHardwareKeyboard } from "../tests/helpers/phoneKeyboard.ts";
import { removeScratchDirs, scratchDir } from "../tests/helpers/scratchDirs.ts";
import { keepPhoneKeyRoutingDiagnostics } from "../tests/helpers/phoneKeyboardDiagnostics.ts";
import { ciModeRefusal } from "./checks-mode.ts";
import { openModuleRunner, REPO_ROOT } from "./moduleRunner.ts";
import { takeHeavyRunPlace } from "./heavy-run-place.ts";
import { startPhoneActivity } from "./phone-activity.ts";
import { keepPhonePasses, phonePassesLeft, readPhonePasses, readPhonePlan } from "./phone-test-plan.ts";
import { finishPhoneCheck, joinPhoneObserver, keepPhoneDiagnostic, runEveryCheck } from "./phone-checks.ts";
import { keepPhoneFailureLogs, runPhoneLog } from "./phone-failure-logs.ts";
import { GATE_SIMULATOR, removePhoneLeftovers, SCRATCH_PREFIX } from "./phone-leftovers.ts";
import { buildPhoneHinge, type PhoneHinge, type PhoneKey, type PhoneTurn, pressPhoneKey, setPhoneHinge, turnPhone } from "./phone-hinge.ts";
import { phoneRecording } from "./phone-recording.ts";
import { phoneBuildArguments, readPhoneBuildIdentity, useSharedPhoneBuild } from "./phone-build.ts";
import { endPhoneHang, PHONE_COMMAND_BUDGET_MS, PhoneDeadlinePassed, phoneCommandBudget, phoneCommandName, phonePartBudget, withinPhoneDeadline } from "./phone-deadlines.ts";
import { startPhoneGuestObserver } from "./phone-guest-observer.ts";
import { buildPhoneFaceId, PHONE_BOOT_BUDGET_MS, PHONE_FACE_ID_BUDGET_MS, PHONE_PREWARM_BUDGET_MS, phoneFaceIdStarted, phonePrewarmFinished, phoneSharedCacheFolder, phoneSimulator, phoneSimulatorBooted, phoneXcode, removeEmptyPhoneSharedCache } from "./phone-simulator.ts";
import { devicePartNames, PHONE_APP, devicePhotos, endPhoneGate, firstPhoneLanes, macTestFilter, partHinge, PHONE_DEVICES, PHONE_PARTS, partOnMac, partPlanPath, type PhoneWork, phoneWork, phoneWorkPast, runSideBySide, type PhoneDevice, type PhoneJob, type PhonePassEnd, phonePassName, phoneSelectionRunsJourney, phoneTestSelection, phoneTestsStarted, phoneAnimationWaits, phoneExecutionArguments, phoneLanePlan, phoneLanes, phonePasses, phoneStopsEarly, PHONE_PART_TIMES, partTimes, runDeviceLanes, testHomeKeys } from "./phone-test-plan.ts";

// INF-800: with CI mode on, the phone check runs only through CI (docs/testing.md).
const refusal = ciModeRefusal("phone");
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
const { values } = parseArgs({ options: {
  evidence: { type: "string" },
  ipad: { type: "boolean", default: false },
  demo: { type: "boolean", default: false },
  // CI needs no encoder: keep simctl's H.264 capture for conversion on the evidence reader's Mac.
  "raw-demo": { type: "boolean", default: process.env.PHONE_RECORDING === "1" },
  waits: { type: "boolean", default: process.env.INFINITARY_PHONE_WAITS_ONLY === "1" },
  // INF-4241: every test of the phone check's own tools, which the rest part skips (PHONE_TOOL_TESTS).
  tools: { type: "boolean", default: process.env.INFINITARY_PHONE_TOOLS_ONLY === "1" },
  starve: { type: "boolean", default: process.env.INFINITARY_STARVE_CHECK === "1" },
  "guest-observer": { type: "boolean", default: process.env.INFINITARY_PHONE_GUEST_OBSERVER === "1" },
  // INF-662 piece 1: check and build once, then the iPhone and the iPad side by side.
  both: { type: "boolean", default: false },
  // INF-4241 piece 8: the devices to check from the one build, any of PHONE_DEVICES; --ipad and --both name the iPad
  // alone and the iPhone with the iPad.
  device: { type: "string", multiple: true },
  // INF-4241 piece 8: every device PHONE_PARTS names, from one build, as the phone release's full check runs.
  "every-device": { type: "boolean", default: false },
  // INF-4241 piece 8: a Duo part's hinge helper, built once by the gate (scripts/phone-hinge.ts).
  "hinge-helper": { type: "string" },
  // INF-662 piece 2: the journey's parts to run (all of them unless named), and how many devices at once.
  part: { type: "string", multiple: true },
  // INF-2582 direction A: parts a change only reaches, run on the iPhone alone, and parts whose test code
  // changed, run twice more on every device after the ordinary pass, on the same build and simulators.
  "iphone-part": { type: "string", multiple: true },
  "repeat-part": { type: "string", multiple: true },
  "repeat-tests": { type: "string" },
  test: { type: "string", multiple: true },
  // The rest part's tool tests whose own code changed, which one part's run then runs beside its tests (`partSelection`).
  "tool-test": { type: "string", multiple: true },
  // Local repeats stop at their first failed part; CI chooses fail-fast or full discovery explicitly.
  "stop-early": { type: "boolean", default: phoneStopsEarly(process.env) },
  // INF-4241 piece 3: how many simulated devices run at once, as many as this Mac's processors and memory hold
  // (`phoneLanes`); the devices share them, and a device with several shares its parts among them.
  simulators: { type: "string", default: String(phoneLanes({ processors: availableParallelism(), memoryBytes: totalmem() })) },
  // One part on one device: its test plan from the gate's build, and the simulator the gate started for it.
  xctestrun: { type: "string" },
  simulator: { type: "string" },
  // INF-4496's fix 2: the record of the passes this run's earlier attempts passed; the gate skips them and keeps
  // this attempt's passes in it too (`phonePassesLeft`, `keepPhonePasses`).
  passes: { type: "string" },
  // INF-5387's plan, piece 2: one job a manual request dealt to this phone Mac, its passes as JSON (`dealPhonePasses`),
  // run exactly as listed; and whether this job leaves the package tests to the request's first job.
  plan: { type: "string" },
  "skip-package-tests": { type: "boolean", default: false },
  // INF-6039's plan, part 1: the folder a dealt job's check shares its first job's build in (scripts/phone-build.ts);
  // the gate uses that build only when it was made from this version with this Xcode, SDK and chip, and builds otherwise.
  "shared-build": { type: "string" },
  // INF-4326: one part on the Mac itself (PHONE_PARTS' `mac`), with the package build the gate's package tests made.
  mac: { type: "boolean", default: false },
  "swift-build": { type: "string" },
} });
if (process.platform !== "darwin") throw new Error("The native gate needs Xcode on a Mac");
if (!values.evidence) throw new Error("Pass --evidence with a folder outside the working copy");
const evidence = resolve(values.evidence);
if (evidence === REPO_ROOT || evidence.startsWith(REPO_ROOT + "/"))
  throw new Error("Native evidence must stay outside the working copy");
if (values.both && (values.ipad || values.xctestrun)) throw new Error("--both runs the iPhone and the iPad itself");
if (values["every-device"] && (values.device || values.both || values.ipad || values.xctestrun)) throw new Error("--every-device names every device itself");
if (values.device && (values.both || values.ipad)) throw new Error("--device names the devices itself, so it takes no --ipad or --both");
if (values.xctestrun && values.device && values.device.length !== 1) throw new Error("--xctestrun runs on exactly one --device");
for (const device of values.device ?? []) if (!(PHONE_DEVICES as readonly string[]).includes(device))
  throw new Error(`The phone check has no device ${device}; it checks ${PHONE_DEVICES.join(", ")}`);
if (values.xctestrun && values.part?.length !== 1) throw new Error("--xctestrun runs exactly one --part");
if (!!values.xctestrun !== !!values.simulator) throw new Error("A part needs both its built plan and the gate's simulator");
if (values.xctestrun && (values["iphone-part"] || values["repeat-part"])) throw new Error("--xctestrun runs one part once");
if (values.waits && (values["iphone-part"] || values["repeat-part"])) throw new Error("--waits runs only the wait-clock tests");
if (values.tools && (values["iphone-part"] || values["repeat-part"])) throw new Error("--tools runs only the tool tests");
if (values.waits && values.tools) throw new Error("--waits and --tools are two different selections");
// The rest part's tests replaced by the wait clock's or the tools', or none.
const only = values.waits ? "waits" as const : values.tools ? "tools" as const : undefined;
if (values.mac && (values.xctestrun || values.part?.length !== 1 || !partOnMac(values.part[0]!) || !values["swift-build"]))
  throw new Error("--mac runs exactly one Mac part, with the gate's package build");
if (values.test && !values.xctestrun && !values.mac) throw new Error("--test needs the gate's built test plan");
if (values["tool-test"] && (!values.xctestrun || only)) throw new Error("--tool-test runs beside one part's own tests, from the gate's built test plan");
if (values.passes && (values.xctestrun || values.mac)) throw new Error("--passes belongs to the gate, not one part");
if (values.plan && (values.part || values["iphone-part"] || values["repeat-part"] || values["repeat-tests"] || values.test || values["tool-test"] || values.device
  || values["every-device"] || values.both || values.ipad || values.xctestrun || values.mac || values.waits || values.tools))
  throw new Error("--plan names the job's passes itself, so it takes no parts, devices or selection");
if (values["skip-package-tests"] && !values.plan) throw new Error("--skip-package-tests belongs to a dealt job's --plan");
if (values["shared-build"] && (values.xctestrun || values.mac)) throw new Error("--shared-build belongs to the gate, not one part");
// A part the gate started, on its device's simulator or on the Mac.
const onePartOnly = !!(values.xctestrun || values.mac);
const repeatTests: Record<string, string[]> = JSON.parse(values["repeat-tests"] || "{}");
for (const [part, tests] of Object.entries(repeatTests)) {
  if (!Array.isArray(tests) || tests.some((test) => typeof test !== "string")) throw new Error("Repeat tests must be arrays of identifiers");
  phoneTestSelection(part, tests);
}
const planned = values.plan ? readPhonePlan(values.plan) : undefined;
const devices: PhoneDevice[] = planned ? PHONE_DEVICES.filter((device) => planned.some((job) => job.device === device))
  : values["every-device"] ? [...PHONE_DEVICES] : values.device ? [...new Set(values.device as PhoneDevice[])]
  : values.both ? ["iphone", "ipad"] : [values.ipad ? "ipad" : "iphone"];
// A gate of several devices keeps a folder of evidence per device, as piece 1 did, and so does every dealt job, so the
// jobs of one request keep one layout.
const perDevice = devices.length > 1 || !!planned;
const named = !!(values.part || values["iphone-part"]);
const jobs: PhoneJob[] = planned ?? phonePasses(devices, only ? { parts: ["rest"] } : {
  parts: named ? values.part ?? [] : PHONE_PARTS.map((part) => part.name),
  iphoneOnly: values["iphone-part"], repeats: values["repeat-part"], repeatTests });
// INF-4241 piece 6: a part runs only on the devices its row of PHONE_PARTS names, so a gate whose parts none of its
// devices run would pass having checked nothing.
if (!jobs.length) throw new Error(devices.map((device) => `None of the named parts runs on the ${device}; the parts that do: ${devicePartNames(device).join(" ")}`).join(". "));
const simulators = Number(values.simulators);
// INF-4496's fix 2: a rerun of a failed job runs only what its run's earlier attempts did not pass, at the same version.
const earlierPasses = values.passes ? readPhonePasses(values.passes) : [];
const left = phonePassesLeft(jobs, earlierPasses);
if (earlierPasses.length) console.log(`Passed in an earlier attempt of this run, not run again: ${jobs.filter((job) => !left.includes(job)).map(phonePassName).join(", ") || "none"}`);
if (!left.length) {
  console.log("Every pass of this gate passed in an earlier attempt of this run, at this version");
  process.exit(0);
}
// INF-4326: a part on the Mac takes no lane; the plan's queues index the device jobs alone, as `runDeviceLanes` gets them.
const recordedTimes = partTimes(readFileSync(join(REPO_ROOT, PHONE_PART_TIMES), "utf8"));
const lanePlan = phoneLanePlan(left.filter((job) => !partOnMac(job.part)), simulators, recordedTimes);
mkdirSync(evidence, { recursive: true });
// INF-1541 piece 4 and INF-1664: a local gate waits in its computer's load line, never for a quieter
// Mac; its parts ride the gate's place. CI's job, and a shell with no line, start at once (INF-2137).
const runPlace = onePartOnly ? { close() {} } : await takeHeavyRunPlace("phone", { simulators: Math.min(simulators, lanePlan.lanes.length) });
// Capture the account home before the disposable app/test HOME replaces it.
const invokingHome = userInfo().homedir;
const root = scratchDir(SCRATCH_PREFIX);
const home = join(root, "home");
mkdirSync(home);
process.env.HOME = home;
process.env.CFFIXED_USER_HOME = home;
process.env.PI_OFFLINE = "1";
process.env.INFINITARY_LOCAL_CODESIGN_DIR = join(home, "signing-unused");
startPhoneLoadClock();
const runner = await openModuleRunner();
const { hostEnv } = await runner.import<typeof import("../src/core/hostEnv")>(join(REPO_ROOT, "src/core/hostEnv.ts"));
const env = { ...hostEnv(), HOME: home, CFFIXED_USER_HOME: home };
let activity: ReturnType<typeof startPhoneActivity>;
try { activity = startPhoneActivity(env, invokingHome); }
catch (error) { await runner.close(); runPlace.close(); throw error; }
let number = 0;
const children = new Set<ChildProcess>();
let interrupted = false;
let cleaningUp = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  interrupted = true;
  for (const child of children) child.kill("SIGTERM");
});
// A cleanup command, such as deleting a simulator the gate started, still runs after an interruption; `stop` ends one
// the gate no longer waits for. INF-5387 piece 1: every command has a deadline (`phoneCommandBudget` unless `budget`
// names one); past it, what it waited on is kept, it is ended, and it fails naming itself, with no retry.
const run = async (command: string, args: string[], cleanup = false, onLine?: (line: string) => void, stop?: AbortSignal,
  extraEnv: Record<string, string> = {}, budget = phoneCommandBudget(command, args)) => {
  if (interrupted && !cleaningUp && !cleanup) throw new Error("The native gate was interrupted");
  const child = spawn(command, args, { cwd: REPO_ROOT, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  const end = () => child.kill("SIGTERM");
  stop?.addEventListener("abort", end, { once: true });
  let output = "";
  child.stdout.on("data", (part) => { output += part; });
  child.stderr.on("data", (part) => { output += part; });
  const readers = onLine ? [child.stdout, child.stderr].map((input) => {
    const reader = createInterface({ input });
    reader.on("line", onLine);
    return reader;
  }) : [];
  const closed = new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject); child.once("close", resolveExit);
  }).finally(() => { children.delete(child); stop?.removeEventListener("abort", end); for (const reader of readers) reader.close(); });
  const name = phoneCommandName(command, args);
  let late: PhoneDeadlinePassed | undefined;
  const status = await withinPhoneDeadline(name, budget, closed, () => endPhoneHang({ name, pid: child.pid, evidence, env,
    simulator: args.find((arg) => ownedSimulators.has(arg)) ?? simulator })).catch((error: Error) => {
    if (!(error instanceof PhoneDeadlinePassed)) throw error;
    late = error;
    return null;
  });
  const log = join(evidence, `${++number}-${command.replaceAll("/", "-")}.log`);
  writeFileSync(log, output);
  if (late) {
    console.log(`::error::${late.message}`);
    throw Object.assign(late, { output });
  }
  if (status !== 0) throw Object.assign(new Error(`${command} failed (${status}); see ${log}`), { output });
  return output;
};
const demo = phoneRecording(values["raw-demo"] ? "raw" : values.demo ? "encoded" : "off", run);
// The part's simulator, which the gate started and owns; the part only uses it.
let simulator: string | undefined = values.simulator;
const phoneBundle = PHONE_APP;
// The UI test runner Xcode installs beside the app, which a part's `xcodebuild` reinstalls.
const runnerBundle = `${phoneBundle}.uitests.xctrunner`;
// The processes behind a failed part's photo and card steps: the app, its card pages and Photos.
const SIMULATOR_LOG = 'process == "Infinitary" OR process BEGINSWITH "com.apple.WebKit" OR process CONTAINS[c] "photo"'
  + ' OR process == "assetsd" OR process == "mediaanalysisd"'
  + ' OR (process == "runningboardd" AND (eventMessage CONTAINS "WebKit" OR eventMessage CONTAINS "Infinitary"))';
// INF-819: the simulator's own system, keyboard and accessibility processes, which answer XCUITest's
// "Check for interrupting elements"; on a few iPhone talk parts they stopped answering after a keyboard switch.
// INF-1645: iOS 27.0's backboardd repeats one IOSurface line about 1.2 thousand times a second (346 MB in
// 20 minutes, against 758 lines on iOS 26.4), so the phone check's log leaves that line out.
const SYSTEM_LOG = '(process IN {"SpringBoard", "backboardd", "AccessibilityUIServer", "testmanagerd", "kbd"}'
  + ' OR process ENDSWITH "-Runner" OR subsystem BEGINSWITH[c] "com.apple.accessibility")'
  + ' AND NOT eventMessage CONTAINS "IOSurfaceQueryTransactionList"';
let keyboard: Awaited<ReturnType<typeof observePhoneKeyboard>> | undefined;
let simulatorLog: Awaited<ReturnType<typeof observePhoneLog>> | undefined;
let timeoutStack: ReturnType<typeof capturePhoneKeyboardTimeout> | undefined;
let idleStack: ReturnType<typeof capturePhoneIdleTimeout> | undefined;
let webStacks: ReturnType<typeof capturePhoneWebStacks> | undefined;
let guestObserver: Awaited<ReturnType<typeof startPhoneGuestObserver>> | undefined;
let recorder: ChildProcess | undefined;
let recorded: Promise<void> | undefined;
let recordingLog = "";
const recordings: { name: string; raw: string }[] = [];
// INF-1785: the appearance this part last asked for; its gate set light before the part began.
let askedAppearance: "light" | "dark" = "light";
// INF-2052: the text size this part last asked for; its gate set large before the part began.
let askedTextSize: PhoneTextSize = "large";
// An appearance SpringBoard misses leaves no line to prove it, so it is confirmed and never set again. Its witness
// runs while the text size changes, and every witness of one display control answers by `until` (INF-1799), so its
// unknown reaches the journey before the journey's own request ends.
const changeAppearance = async (style: "light" | "dark", until: number) => {
  if (!simulator || !keyboard) throw new Error("No owned simulator display observer exists");
  const observer = keyboard;
  const since = Date.now();
  await run("xcrun", ["simctl", "ui", simulator, "appearance", style]);
  const confirmed = async (): Promise<PhoneDisplayReport["appearance"]> => {
    // The simulator writes nothing for the appearance it already has, so SpringBoard has nothing to change.
    if (style === askedAppearance) return { outcome: "unchanged" };
    askedAppearance = style;
    const outcome = await observer.appearance(since, style, until);
    if (outcome.outcome !== "applied") console.log(`Appearance ${style}: ${JSON.stringify(outcome)}`);
    return outcome;
  };
  return { confirmed: confirmed() };
};
// The hinge the Duo shows now: the one its part started with until the part moves it.
let hinge: PhoneHinge | undefined;
// INF-4794: how many pushes the stand-in relay handed the simulator, which names each one's file.
let pushesSent = 0;
const recording = {
  keyboardBeforeLaunch: async () => {
    if (!keyboard) throw new Error("No owned simulator keyboard observer exists");
    return keyboard.beforeLaunch();
  },
  // INF-1477: what backboardd did with the tap the runner began at `since`, from the same renewed subscription.
  touchOutcome: async (since: number) => {
    if (!keyboard) throw new Error("No owned simulator keyboard observer exists");
    return keyboard.touch(since);
  },
  // INF-1477: whether the photo picker read the photo tap the runner began at `since` as a press-and-hold.
  pickerPreview: async (since: number) => {
    if (!keyboard) throw new Error("No owned simulator keyboard observer exists");
    return keyboard.preview(since);
  },
  // INF-6074: whether the system's keyboard took back the caret a text field of the app took after the key the runner
  // pressed at `since`, read from the same renewed subscription and, when it holds no proof, the kept log.
  caretOutcome: async (since: number) => {
    if (!simulator || !keyboard) throw new Error("No owned simulator keyboard observer exists");
    const [owned, observer] = [simulator, keyboard];
    const deadline = phoneTouchDeadline();
    const services = await run("xcrun", ["simctl", "spawn", owned, "launchctl", "list"]);
    return observer.caret(phoneApplicationPid(services, phoneBundle), since, deadline);
  },
  keyboardClosed: async () => {
    await withinPhoneDeadline("Simulator keyboard shutdown", 2 * PHONE_COMMAND_BUDGET_MS,
      joinPhoneHardwareKeyboardWrites(run), async () => "pending commands end with gate cleanup");
  },
  keyboardAttachment: async (attached: boolean) => {
    if (!simulator) throw new Error("No owned simulator keyboard exists");
    await setPhoneHardwareKeyboard(run, simulator, attached);
    return { attached };
  },
  keyboardReady: async (chord: PhoneChord) => {
    if (!simulator || !keyboard) throw new Error("No owned simulator keyboard observer exists");
    const owned = simulator;
    const observer = keyboard;
    const services = await run("xcrun", ["simctl", "spawn", owned, "launchctl", "list"]);
    return observer.wait(phoneApplicationPid(services, phoneBundle), chord);
  },
  display: async (appearance: "light" | "dark", large: boolean): Promise<PhoneDisplayReport> => {
    const until = phoneDisplayDeadline();
    const { confirmed } = await changeAppearance(appearance, until);
    if (!simulator || !keyboard) throw new Error("No owned simulator display observer exists");
    const [owned, observer] = [simulator, keyboard];
    const size: PhoneTextSize = large ? "extra-extra-extra-large" : "large";
    const asked = askedTextSize;
    askedTextSize = size;
    const textSize = await changePhoneTextSize(size,
      () => run("xcrun", ["simctl", "ui", owned, "content_size", size]),
      (since) => observer.textSize(since, size, until), asked);
    for (const outcome of textSize) if (outcome.outcome !== "applied" && outcome.outcome !== "unchanged") console.log(`Text size ${size}: ${JSON.stringify(outcome)}`);
    return { appearance: await confirmed, textSize };
  },
  // INF-4241 piece 8: the fold part moves a Duo's hinge through its test home, once each time; a device with no hinge
  // answers none.
  ...(values["hinge-helper"] ? {
    hinge: async (to?: PhoneHinge): Promise<{ hinge: PhoneHinge | null }> => {
      if (!simulator) throw new Error("No owned simulator exists");
      if (!to) return { hinge: hinge ??= partHinge(values.part![0]!) };
      await setPhoneHinge({ run, simulator, helper: values["hinge-helper"]!, hinge: to, reading: join(root, "displays.json") });
      return { hinge: hinge = to };
    },
    // INF-4539: the fold part turns the open Duo between its book pose and its side, once each time.
    turn: async (to: PhoneTurn): Promise<{ turn: PhoneTurn }> => {
      if (!simulator) throw new Error("No owned simulator exists");
      await turnPhone({ run, simulator, helper: values["hinge-helper"]!, to });
      return { turn: to };
    },
    // INF-5183: the fold part presses a key on the open Duo once, as an attached keyboard does, and the answer names
    // where the simulator sent it: the app's own process, or nowhere. The keyboard is attached for the press alone, as
    // XCTest's own is for its key, so the simulator ends detached and still shows its own keyboard for the next field.
    key: async (key: PhoneKey) => {
      if (!simulator || !keyboard) throw new Error("No owned simulator keyboard observer exists");
      const [owned, observer] = [simulator, keyboard];
      const services = await run("xcrun", ["simctl", "spawn", owned, "launchctl", "list"]);
      const pid = phoneApplicationPid(services, phoneBundle);
      const pressed = await withPhoneHardwareKeyboard(run, owned, () => pressPhoneKey({ run, simulator: owned,
        helper: values["hinge-helper"]!, key, outcome: (since, until, deadline) => observer.keyOutcome(pid, since, until, deadline) }));
      // Bound the diagnostic query without extending the caller's existing control timeout.
      await keepPhoneKeyRoutingDiagnostics(
        (command, args) => run(command, args, false, undefined, undefined, {}, 5_000), pid, pressed.proof);
      return { key, ...pressed };
    },
  } : {}),
  // INF-4794: the stand-in relay's pushes, delivered to this part's simulator as Apple would deliver them.
  push: async (payload: Record<string, unknown>) => {
    if (!simulator) throw new Error("No owned simulator exists");
    const file = join(root, `push-${++pushesSent}.json`);
    writeFileSync(file, JSON.stringify(payload));
    await run("xcrun", ["simctl", "push", simulator, phoneBundle, file]);
  },
  // INF-5265's homes part: the phone's own network going and coming back, which the app's stand-in path monitor reads
  // as the system's (PhoneModel's `standInNetwork`); a test cannot change the simulator's own network.
  phonePath: async (usable: boolean) => {
    if (!simulator) throw new Error("No owned simulator exists");
    const name = `com.getinfinitary.infinitary.test.path-${usable ? "back" : "lost"}`;
    await run("xcrun", ["simctl", "spawn", simulator, "notifyutil", "-p", name]);
  },
  appearance: async (theme: "dark" | "light"): Promise<PhoneDisplayReport> => ({ appearance: await (await changeAppearance(theme, phoneDisplayDeadline())).confirmed }),
  damageRecord: async () => {
    if (!simulator) throw new Error("No owned simulator exists");
    const container = resolve((await run("xcrun", ["simctl", "get_app_container", simulator, phoneBundle, "data"])).trim());
    if (!container.split("/").includes(simulator)) throw new Error("The app container is not on this run's simulator");
    // INF-5265: the phone keeps its computers in one record (docs/ios.md, "Saved records").
    const saved = join(container, "Library", "Application Support", "KeptMacs.json");
    const bytes = readFileSync(saved);
    // Reproduce a truncated version of the actual saved record, never another simulator's data.
    writeFileSync(saved, bytes.subarray(0, bytes.length - 8));
  },
  start: async (name = "reconnect") => {
    if (!demo.enabled || recorder || !simulator) return;
    if (!["reconnect", "reopen", "talk", "composer", "character", "conversation", "native-scene-pan", "native-scene-keyboard", "native-orbit-gap", "card-form", "card-paging", "card-reply", "card-picture", "card-recording", "review-recovery"].includes(name)) throw new Error("Unknown phone recording");
    const raw = join(root, `${name}.mp4`);
    recordings.push({ name, raw });
    recordingLog = "";
    const child = spawn("xcrun", ["simctl", "io", simulator, "recordVideo", "--codec=h264", raw], {
      env, stdio: ["ignore", "pipe", "pipe"],
    });
    recorder = child;
    recorded = new Promise<void>((resolveStopped) => child.once("close", () => resolveStopped()));
    await new Promise<void>((resolveStarted, reject) => {
      const timeout = budgetTimer(() => reject(new Error("The simulator recorder did not start")), 15_000);
      const hear = (part: Buffer) => {
        recordingLog += part.toString();
        if (recordingLog.includes("Recording started")) { timeout.cancel(); resolveStarted(); }
      };
      child.stdout?.on("data", hear); child.stderr?.on("data", hear);
      child.once("error", (error) => { timeout.cancel(); reject(error); });
      child.once("exit", () => {
        timeout.cancel();
        if (!recordingLog.includes("Recording started")) reject(new Error("The simulator recorder exited before starting"));
      });
    });
  },
  stop: async () => {
    if (!recorder) return;
    recorder.kill("SIGINT"); await recorded; recorder = undefined;
    writeFileSync(join(evidence, `${recordings.at(-1)!.name}-recording.log`), recordingLog);
  },
  // INF-1109's phone approvals: the owned simulator's Face ID, through its own enrollment and match signals.
  // A face stays in view while the system's prompt looks for it, so the match signal repeats until the
  // journey looks away; one signal sent before the prompt opens would be a face the prompt never saw.
  biometry: async (step: "enroll" | "face-in-view" | "face-away") => {
    if (!simulator) throw new Error("No owned simulator exists");
    const owned = simulator;
    if (step === "enroll") {
      await run("xcrun", ["simctl", "spawn", owned, "notifyutil", "-s", "com.apple.BiometricKit.enrollmentChanged", "1"]);
      await run("xcrun", ["simctl", "spawn", owned, "notifyutil", "-p", "com.apple.BiometricKit.enrollmentChanged"]);
    } else if (step === "face-in-view") {
      if (faceInView) return;
      let looking = true;
      let signals = 0;
      const joinSeen = joinPhoneObserver((async () => {
        while (looking && !interrupted) {
          await run("xcrun", ["simctl", "spawn", owned, "notifyutil", "-p", "com.apple.BiometricKit_Sim.pearl.match"]);
          signals += 1;
          await new Promise((resolveLook) => setTimeout(resolveLook, 300));
        }
      })());
      faceInView = { stop: async () => { looking = false; await joinSeen(); writeFileSync(join(evidence, "face-in-view.log"), `${signals} match signals\n`); } };
    } else {
      await faceInView?.stop();
      faceInView = undefined;
    }
  },
};
let faceInView: { stop(): Promise<void> } | undefined;
let fixture: Awaited<ReturnType<typeof import("../tests/helpers/phoneHome").startPhoneHome>> | undefined;
// INF-2125 piece 3: the Swift packages' fetched repositories, which the package tests and Xcode share. CI keeps
// them outside the gate's scratch folder, restored from the nightly check of main; otherwise they stay in it.
// A part on the Mac reads the cache beside the gate's package build.
const packageCache = process.env.INFINITARY_PHONE_PACKAGE_CACHE || join(values.mac ? dirname(values["swift-build"]!) : root, "swift-packages");
// INF-1438 (the captain's "Start each simulated device once per phone check, not once per part"): the gate
// owns one simulator per lane, from create to delete, and runs the lane's parts on it one after the other, each as
// its own gate with its own test home and a clean app; INF-4241 piece 3 gives a device several lanes on a Mac
// with room for them. Do not borrow or erase a developer's simulator.
const ownedSimulators = new Set<string>();
type Lane = { device: PhoneDevice; owned: string; booted: Date; photos?: ReturnType<typeof devicePhotos> };
// INF-2445: once per gate, before its first simulator starts, an empty cache folder of the pinned runtime goes, so the
// kept log every recovery reads spells out the shared cache's words (`removeEmptyPhoneSharedCache`).
// One look a gate for each runtime its devices use (INF-4241 piece 8: the Duo's iOS differs from the others').
const sharedCaches = new Map<string, Promise<void>>();
// `simctl bootstatus -b` boots the simulator and prints each step of its boot; the gate waits for it within its budget.
const bootSimulator = (device: PhoneDevice, owned: string) => phoneSimulatorBooted({ device, simulator: owned,
  boot: (stop, heard) => run("xcrun", ["simctl", "bootstatus", owned, "-b"], false, heard, stop, {},
    PHONE_BOOT_BUDGET_MS + PHONE_COMMAND_BUDGET_MS) });
// INF-6058: no part starts on a simulator until the wallpaper prewarm its scheduler runs minutes after each boot has
// finished; the log stream of it lasts as long as the wait may.
const prewarmFinished = (device: PhoneDevice, owned: string, booting: Date) => phonePrewarmFinished({ device, simulator: owned,
  booting, run: (args, heard, stop) => run("xcrun", args, false, heard, stop, {},
    heard ? PHONE_PREWARM_BUDGET_MS + PHONE_COMMAND_BUDGET_MS : PHONE_COMMAND_BUDGET_MS) });
// INF-7013: no part starts on a simulator until its Face ID interface runs, so a Face ID prompt in the part never waits
// for that process to start; the helper whose request starts it builds once, for the first part that needs it.
let faceIdHelper: Promise<string> | undefined;
const faceIdStarted = async (device: PhoneDevice, owned: string) => phoneFaceIdStarted({ device, simulator: owned,
  helper: await (faceIdHelper ??= buildPhoneFaceId(run, root)),
  run: (args, heard, stop) => run("xcrun", args, false, heard, stop, {},
    heard ? PHONE_FACE_ID_BUDGET_MS + PHONE_COMMAND_BUDGET_MS : PHONE_COMMAND_BUDGET_MS) });
const startSimulator = async (device: PhoneDevice): Promise<Lane> => {
  const catalog = JSON.parse(await run("xcrun", ["simctl", "list", "--json"]));
  const { kind, runtime } = phoneSimulator(catalog, device);
  if (!sharedCaches.has(runtime.identifier)) sharedCaches.set(runtime.identifier, (async () => {
    const folder = phoneSharedCacheFolder((await run("sw_vers", ["-buildVersion"])).trim(), runtime);
    const removed = await removeEmptyPhoneSharedCache(folder,
      () => run("xcrun", ["simctl", "runtime", "dyld_shared_cache", "remove", runtime.identifier]));
    if (removed) console.log(removed);
  })());
  await sharedCaches.get(runtime.identifier);
  const owned = (await run("xcrun", ["simctl", "create", GATE_SIMULATOR, kind.identifier, runtime.identifier])).trim();
  ownedSimulators.add(owned);
  // CoreSimulator is a host service, not a signing operation. This new device owns its own Keychain.
  const booted = new Date();
  // INF-3689: a boot that never finishes fails its lane in minutes, named in the log as it happens.
  await bootSimulator(device, owned).catch((error: Error) => {
    console.log(`::error::${error.message}`);
    throw error;
  });
  console.log(`${device}: started simulator ${owned} in ${((Date.now() - booted.getTime()) / 60_000).toFixed(1)} minutes`);
  // The first lanes' wait runs beside the build, as their boot does.
  await prewarmFinished(device, owned, booted).catch((error: Error) => {
    console.log(`::error::${error.message}`);
    throw error;
  });
  return { device, owned, booted };
};
// INF-5387 piece 1: a simulator whose delete failed or passed its deadline is not tried again at the gate's end; the next
// phone check on this Mac removes it before it starts (`removePhoneLeftovers`).
const deleteSimulator = async (owned: string) => {
  try {
    await run("xcrun", ["simctl", "shutdown", owned], true).catch(() => {});
    await run("xcrun", ["simctl", "delete", owned], true);
  } finally { ownedSimulators.delete(owned); }
};
const simulatorState = async (owned: string): Promise<string> => {
  const listed = JSON.parse(await run("xcrun", ["simctl", "list", "devices", "-j"])).devices as Record<string, { udid: string; state: string }[]>;
  const state = Object.values(listed).flat().find((item) => item.udid === owned)?.state;
  if (!state) throw new Error(`The gate's simulator ${owned} is gone`);
  return state;
};
const installedApps = async (owned: string): Promise<Record<string, unknown>> => {
  const listed = join(root, `${owned}-apps.plist`);
  writeFileSync(listed, await run("xcrun", ["simctl", "listapps", owned]));
  return JSON.parse(await run("plutil", ["-convert", "json", "-o", "-", listed]));
};
// Every part starts from a clean app on the device: the previous part's app and test runner, Keychain,
// permission answers, appearance, type size and hardware keyboard are gone, as on a new simulator, and its Face ID
// interface runs.
const readyForPart = async (lane: Lane, name: string) => {
  const { owned, device } = lane;
  const state = await simulatorState(owned);
  if (state !== "Booted") {
    // INF-1265's run 40260276185: Xcode shut a device down after a failed part, and the parts after it failed to start.
    console.log(`${name}: the simulator was ${state} after the previous part; booting it again`);
    lane.booted = new Date();
    // Photos opens its library again after the boot; a part that chooses a photo waits for it, and its photo, again.
    lane.photos?.restarted();
    await bootSimulator(device, owned);
    lane.photos?.watched().catch(() => {});
    // The boot runs the wallpaper prewarm again.
    await prewarmFinished(device, owned, lane.booted);
  }
  const apps = await installedApps(owned);
  for (const bundle of [phoneBundle, runnerBundle]) if (apps[bundle]) await run("xcrun", ["simctl", "uninstall", owned, bundle]);
  await run("xcrun", ["simctl", "keychain", owned, "reset"]);
  await run("xcrun", ["simctl", "privacy", owned, "reset", "all"]);
  await run("xcrun", ["simctl", "ui", owned, "appearance", "light"]);
  await run("xcrun", ["simctl", "ui", owned, "content_size", "large"]);
  await setPhoneHardwareKeyboard(run, owned, false);
  if ((await installedApps(owned))[phoneBundle]) throw new Error(`${device}: the previous part's app survived its uninstall`);
  await faceIdStarted(device, owned);
};
// The library photo a part that chooses a photo picks.
const LIBRARY_PHOTO = "release-notes/pictures/activity-settles-setting-runs-light.png";
// A device's Photos is made ready once: from the device's start beside its first part, the wait for Photos to open
// its library since boot; then, before the device's first part that chooses a photo, the library photo (INF-2052,
// `devicePhotos`). INF-1170: the photo goes in once Photos is ready, so a restart of Photos never cuts its import
// short; INF-1438: and again after the restart that frees a photo Photos' background migration held. A part that
// chooses a photo waits for both.
// INF-4241 piece 3: a device with several lanes keeps each lane's Photos wait in a folder of its own.
const lanePhotos = (lane: Lane, stopping: AbortSignal, number: number) => devicePhotos(
  () => photosOpened({ device: lane.owned, booting: lane.booted, stopping, env, children, run, failureLog: SIMULATOR_LOG,
    evidence: ((folder) => lanePlan.lanes.filter((each) => each.device === lane.device).length > 1
      ? (mkdirSync(join(folder, `lane-${number}`), { recursive: true }), join(folder, `lane-${number}`)) : folder)(perDevice ? join(evidence, lane.device) : evidence) }),
  () => libraryPhotoAdded({ device: lane.owned, picture: join(REPO_ROOT, LIBRARY_PHOTO), run }));
let hingeHelper: Promise<string> | undefined;
// Builds once for any simulator, then runs each device's parts on the lanes `lanePlan` gives it, each lane one
// simulator it starts once and each part as its own gate from that build with its own test home, as many lanes at
// once as --simulators places hold, an iPhone Duo's lane taking two (INF-4241 piece 3, INF-6407).
const everyPart = async () => {
  const xcode = await run("xcodebuild", ["-version"]);
  phoneXcode(xcode);
  // INF-2125 piece 3: the simulators the first lanes use start, and wait for their wallpaper prewarm, while Xcode
  // builds, so their first parts begin as the build ends, or as a lane's prewarm finishes when that comes later; a
  // lane past --simulators' places starts its own when its places free.
  const starting = new Map(firstPhoneLanes(lanePlan, simulators)
    .map(({ device, number }) => [`${device} ${number}`, startSimulator(device)] as const));
  // A start that fails is heard by its lane's open, and every start settles before the gate's cleanup.
  for (const started of starting.values()) started.catch(() => {});
  try { await everyPartOn(starting, xcode); }
  finally { await Promise.allSettled(starting.values()); }
};
const everyPartOn = async (starting: Map<string, Promise<Lane>>, xcode: string) => {
  // INF-4241 piece 8: the hinge helper builds beside the app when a Duo part runs; its failure fails the Duo's parts.
  if (jobs.some((job) => job.device === "duo")) {
    hingeHelper = buildPhoneHinge(run, root);
    hingeHelper.catch(() => {});
  }
  const products = join(root, "DerivedData", "Build", "Products");
  // INF-6039's plan, part 1: the build this check's first job shared stands in for this job's own only when it was made
  // from this very version with this Xcode, SDK and chip; anything else, and the gate builds as it always has.
  const shared = values["shared-build"]
    ? await useSharedPhoneBuild(values["shared-build"], products, await readPhoneBuildIdentity(run, xcode), run) : undefined;
  if (shared && "plan" in shared) console.log(`Using the build this check's first job shared, of this version; not building the app here`);
  else {
    if (shared) console.log(`::notice::Not using a shared build: ${shared.refusal}. Building the app here.`);
    const building = Date.now();
    await run("xcodebuild", phoneBuildArguments(join(root, "DerivedData"), packageCache));
    console.log(`Built the app for testing in ${((Date.now() - building) / 60_000).toFixed(1)} minutes`);
  }
  const plans = readdirSync(products).filter((name) => name.endsWith(".xctestrun"));
  const [plan] = plans;
  if (!plan || plans.length !== 1) throw new Error(`The build made ${plans.length} test plans, not one`);
  // A run of several devices keeps a folder per device, as piece 1 did; each part writes its own folder in it, and a
  // later pass of it a folder beside it named for its round (INF-2582).
  const folder = ({ device, part, round }: PhoneJob) => {
    const name = round === 1 ? part : `${part}-round-${round}`;
    return perDevice ? join(evidence, device, name) : join(evidence, name);
  };
  if (perDevice) for (const device of devices) mkdirSync(join(evidence, device), { recursive: true });
  // INF-5387 piece 1: a part's own run ends within its deadline, its test's (`phonePartBudget`), and room for its
  // xcodebuild to end and for its own clean-up. Its own commands' deadlines end it first; this one ends a part whose
  // clean-up still hangs, with every process under it, and fails it naming the part and its minutes.
  const partEnded = (name: string, job: PhoneJob, child: ChildProcess, owned: string | undefined, ended: () => void) =>
    withinPhoneDeadline(`The ${name} part`, phonePartBudget(job.part, recordedTimes) + 2 * PHONE_COMMAND_BUDGET_MS,
      new Promise<number | null>((resolveExit, reject) => {
        child.once("error", reject); child.once("close", resolveExit);
      }).finally(ended),
      () => endPhoneHang({ name, pid: child.pid, evidence: folder(job), simulator: owned, env }))
      .catch((error: Error) => {
        if (!(error instanceof PhoneDeadlinePassed)) throw error;
        ended();
        console.log(`::error::${name}: ${error.message}`);
        return null;
      });
  const gate = async (job: PhoneJob, lane: Lane, stopping: AbortSignal): Promise<PhonePassEnd> => {
    const { device, part } = job;
    const name = phonePassName(job);
    const began = Date.now();
    const minutes = () => ((Date.now() - began) / 60_000).toFixed(1);
    const ended = (outcome: PhonePassEnd["outcome"]) => ({ outcome, ms: Date.now() - began });
    console.log(`${name}: began at ${new Date(began).toISOString()}`);
    try {
      await readyForPart(lane, name);
      // INF-4241 piece 8: the Duo starts each part with the hinge its row names, moved once; a Duo that does not show
      // it fails the part here, by name, and nothing moves it again.
      if (device === "duo") await setPhoneHinge({ run, simulator: lane.owned, helper: await hingeHelper!, hinge: partHinge(part),
        reading: join(root, `${lane.owned}-displays.json`) });
      if (lane.photos && PHONE_PARTS.find((each) => each.name === part)?.photos) await lane.photos.ready();
    } catch (error) {
      console.log(`${name}: ${(error as Error).message}`);
      console.log(`${name}: ${stopping.aborted ? "stopped after another part failed" : "failed before its tests"} after ${minutes()} minutes`);
      return ended(stopping.aborted ? "stopped" : "failed");
    }
    const command = [process.execPath, "scripts/test-phone.ts", "--device", device,
      ...(device === "duo" ? ["--hinge-helper", await hingeHelper!] : []),
      ...demo.childArgs, ...(only ? [`--${only}`] : []), ...(values["guest-observer"] ? ["--guest-observer"] : []),
      "--part", part, ...(job.tests ?? []).flatMap((test) => ["--test", test]),
      ...(job.tools ?? []).flatMap((test) => ["--tool-test", test]), "--evidence", folder(job),
      "--xctestrun", join(products, plan), "--simulator", lane.owned];
    if (values.starve) command.unshift("python3", "scripts/starve-check.py", "--timeout", "3600", "--stall-seconds", "12", "--");
    const child = spawn(command[0]!, command.slice(1), { cwd: REPO_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    // Another part failed: this one ends as an interrupted part does.
    let stopped = false;
    const stop = () => { stopped = true; child.kill("SIGTERM"); };
    stopping.addEventListener("abort", stop, { once: true });
    for (const stream of [child.stdout, child.stderr])
      createInterface({ input: stream }).on("line", (line) => console.log(`${name}: ${line}`));
    const status = await partEnded(name, job, child, lane.owned, () => { children.delete(child); stopping.removeEventListener("abort", stop); });
    console.log(`${name}: ${stopped ? "stopped after another part failed" : `ended with ${status}`} after ${minutes()} minutes`);
    const work = join(folder(job), "work.json");
    return { ...ended(status === 0 ? "passed" : stopped ? "stopped" : "failed"),
      ...(existsSync(work) ? { work: JSON.parse(readFileSync(work, "utf8")) as PhoneWork } : {}) };
  };
  // INF-4326 (INF-4241's speed-ups): a part on the Mac runs beside the device lanes, one at a time, with no simulator:
  // its child starts its own disposable home and runs its tests from the package build the gate's package tests made.
  const onMac = left.filter((job) => partOnMac(job.part));
  const onDevices = left.filter((job) => !partOnMac(job.part));
  const macGate = async (job: PhoneJob, stopping: AbortSignal): Promise<PhonePassEnd> => {
    const name = phonePassName(job);
    const began = Date.now();
    console.log(`${name}: began on the Mac at ${new Date(began).toISOString()}`);
    const command = [process.execPath, "scripts/test-phone.ts", "--mac", "--part", job.part,
      ...(job.tests ?? []).flatMap((test) => ["--test", test]), "--evidence", folder(job), "--swift-build", join(root, "swift-build")];
    const child = spawn(command[0]!, command.slice(1), { cwd: REPO_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let stopped = false;
    const stop = () => { stopped = true; child.kill("SIGTERM"); };
    stopping.addEventListener("abort", stop, { once: true });
    for (const stream of [child.stdout, child.stderr])
      createInterface({ input: stream }).on("line", (line) => console.log(`${name}: ${line}`));
    const status = await partEnded(name, job, child, undefined, () => { children.delete(child); stopping.removeEventListener("abort", stop); });
    const minutes = ((Date.now() - began) / 60_000).toFixed(1);
    console.log(`${name}: ${stopped ? "stopped after another part failed" : `ended with ${status}`} after ${minutes} minutes on the Mac`);
    return { outcome: status === 0 ? "passed" : stopped ? "stopped" : "failed", ms: Date.now() - began };
  };
  const stopEarly = values["stop-early"] ? (({ outcome }: PhonePassEnd) => outcome === "failed") : undefined;
  const macOutcomes = runSideBySide(onMac, 1, macGate, stopEarly);
  macOutcomes.catch(() => {});
  // Any part failing fails the gate; with --stop-early the first failure stops the rest.
  const deviceOutcomes = await runDeviceLanes(onDevices, simulators, {
    open: async (device, stopping, number) => {
      const lane = await (starting.get(`${device} ${number}`) ?? startSimulator(device)).catch((error: Error) => {
        throw new Error(`${device}: the simulator of its lane ${number} could not start, so that lane ran none of its parts: ${error.message}`);
      });
      console.log(`${device}: lane ${number} runs on simulator ${lane.owned}`);
      // The wait for Photos begins beside the device's first part; the device's first part that chooses a photo hears
      // how it went, and adds the photo.
      if (!only && left.some((job) => job.device === device && PHONE_PARTS.find((each) => each.name === job.part)?.photos)) {
        lane.photos = lanePhotos(lane, stopping, number);
        lane.photos.watched().catch(() => {});
      }
      return lane;
    },
    run: gate,
    close: async ({ device, owned }) => {
      console.log(`${device}: deleting simulator ${owned}`);
      await deleteSimulator(owned);
    },
  }, stopEarly, lanePlan);
  const macEnds = await macOutcomes;
  const outcomes = left.map((job) => partOnMac(job.part) ? macEnds[onMac.indexOf(job)] : deviceOutcomes[onDevices.indexOf(job)]);
  // INF-4326 (INF-4241's guard): every run names each part whose tests grew past their recorded work.
  const past = phoneWorkPast(left, outcomes, JSON.parse(readFileSync(join(REPO_ROOT, "scripts", "phone-work.json"), "utf8")));
  for (const line of past) console.log(`::warning title=Phone part work::${line}`);
  if (!past.length) console.log("Every part's work stayed within its recorded amount");
  // A rerun of this job skips what passed here (INF-4496's fix 2).
  if (values.passes) keepPhonePasses(values.passes, earlierPasses, left, outcomes);
  // A full gate keeps its part times and work; any failed part fails it.
  endPhoneGate(left, outcomes, evidence);
};
// A test plan copy beside the built one, naming this part's own test home, one for each simulator.
const planFor = async (built: string, url: string, owned: string) => {
  const plan = partPlanPath(built, devices[0]!, values.part![0]!, owned);
  copyFileSync(built, plan);
  for (const key of testHomeKeys(JSON.parse(await run("plutil", ["-convert", "json", "-o", "-", built])))) {
    await run("plutil", ["-replace", key, "-string", url, plan]);
    // Xcode does not inherit the launcher's environment into its test targets.
    await run("plutil", ["-replace", key.replace(/PHONE_TEST_HOME$/, "INFINITARY_PERF_BUDGETS"),
      "-string", GRADES_BUDGETS ? "1" : "0", plan]);
  }
  return plan;
};
// One part on the simulator the gate started for its device, with its own test home; the gate made the
// device clean before it and waited for Photos where the part chooses a photo.
const onePart = async () => {
  const owned = simulator!;
  // INF-5387 piece 1: XCTest ends a test that hangs while it runs at the part's deadline; the part's xcodebuild has that
  // and room to end after it, so a test program that never starts again ends too.
  const partBudget = phonePartBudget(values.part![0]!, recordedTimes);
  keyboard = await observePhoneKeyboard({ simulator: owned, env, evidence, children });
  const { startPhoneHome } = await runner.import<typeof import("../tests/helpers/phoneHome")>(join(REPO_ROOT, "tests/helpers/phoneHome.ts"));
  await demo.prepare();
  // INF-3563: only the part that reads the phone's Settings pages starts its computer with accounts, projects,
  // recorded usage and automations; every other part's computer stays as it was.
  fixture = await startPhoneHome(root, recording, { settings: values.part![0] === "settings-pages" });
  writeFileSync(join(evidence, "published-client.json"), JSON.stringify(await fixture.checkPublishedClient(), null, 2));
  const destination = ["-parallel-testing-enabled", "NO", "-destination", `platform=iOS Simulator,id=${owned}`,
    "-resultBundlePath", join(evidence, "phone.xcresult")];
  const plan = await planFor(values.xctestrun!, fixture.url, owned);
  // INF-1066: keep the talk journey's exact Photos/tap order and waits. Capture once
  // at the actual UIKit fault, while the blocked stack still exists, not on retry.
  if (values.part![0]?.startsWith("talk-")) {
    timeoutStack = capturePhoneKeyboardTimeout({ evidence,
      currentPid: async () => phoneApplicationPid(await run("xcrun", ["simctl", "spawn", owned, "launchctl", "list"]), phoneBundle),
      sample: async (pid, destination) => { await run("/usr/bin/sample", [String(pid), "1", "1", "-mayDie", "-file", destination]); },
    });
  }
  const webContent = phoneWebContentStartup();
  // INF-1936 / INF-1941: discover ownership before the journey. A simulator
  // command issued during the stall can queue behind that same blocked launch.
  const processes = async (pids: number[]) => phoneProcessTable(await run("/bin/ps", ["-p", pids.join(","), "-o", "pid=,ppid=,lstart=,comm="]));
  try {
    const services = await run("xcrun", ["simctl", "spawn", owned, "launchctl", "list"]);
    const owner = await phoneLaunchOwner(owned, services, processes);
    writeFileSync(join(evidence, "web-stack-owner.log"), JSON.stringify({ discoveredAt: new Date().toISOString(), owner }, null, 2));
    // INF-2767: when XCTest reports the app never went idle, or (INF-6750) its main thread busy, sample it and what its
    // turn waits on while still stuck.
    idleStack = capturePhoneIdleTimeout({ evidence, owner, processes,
      children: async () => processes((await run("/usr/bin/pgrep", ["-P", String(owner.launcher.pid)]))
        .split(/\s+/).filter(Boolean).map(Number)),
      sample: async (pid, destination) => { await run("/usr/bin/sample", [String(pid), "3", "1", "-mayDie", "-file", destination]); },
    });
    if (values["guest-observer"] && values.part![0]!.startsWith("cards-")) {
      const execution = phoneExecutionArguments(false, partBudget / 1000);
      guestObserver = await startPhoneGuestObserver({ owner, env, evidence: join(evidence, "guest-observer"),
        sampleSeconds: Number(execution[execution.indexOf("-maximum-test-execution-time-allowance") + 1]),
      }, children);
    } else webStacks = capturePhoneWebStacks({ evidence, capture: async (app, destination, extensions) => {
      const phases: string[] = [];
      const record = (message: string) => {
        phases.push(`${new Date().toISOString()} ${message}`);
        writeFileSync(`${destination}-phases.log`, phases.join("\n") + "\n");
      };
      record("Host process lookup began.");
      const { targets, unavailable } = extensions.length
        ? await phoneRenderProcesses(owner, app, extensions, processes)
        : { targets: await phoneLaunchProcesses(owner, app, processes), unavailable: [] };
      record("Host process lookup ended; owned process identities match.");
      for (const reason of unavailable) record(reason);
      writeFileSync(`${destination}-targets.log`, JSON.stringify({ simulator: owned, extensions, targets, unavailable }, null, 2));
      await Promise.allSettled(targets.map(async ({ pid, executable }) => {
        record(`Sample began for PID ${pid}.`);
        try {
          await run("/usr/bin/sample", [String(pid), "1", "1", "-mayDie", "-file", `${destination}-${pid}.log`]);
          record(`Sample ended for PID ${pid}.`);
        } catch (error) {
          record(`Sample failed for PID ${pid}: ${String(error)}`);
          writeFileSync(`${destination}-${pid}-error.log`, `${executable}: ${String(error)}\n`);
        }
      }));
    } });
  } catch (problem) {
    console.log(`WebKit stack ownership could not be established: ${String(problem)}`);
    // This explicit investigation asks for observation before the journey; do not
    // spend it on an unobserved journey if that prerequisite could not start.
    if (values["guest-observer"]) throw problem;
  }
  simulatorLog = await observePhoneLog({ device: owned, env, evidence, children,
    predicate: `(${SIMULATOR_LOG}) OR (${SYSTEM_LOG})`, onLine: (line) => {
      keyboard?.previewLine(line);
      timeoutStack?.receive(line);
      webContent.receive(line);
      webStacks?.receive(line);
      idleStack?.receive(line);
    } });
  const testing = new Date();
  let output = "";
  await finishPhoneCheck(run("xcodebuild", ["-xctestrun", plan, ...destination, ...phoneTestSelection(values.part![0]!, values.test, only, values["tool-test"]),
    ...phoneExecutionArguments(GRADES_BUDGETS, partBudget / 1000), "test-without-building"], false, (line) => {
      idleStack?.receive(line);
      if (guestObserver && phoneGuestJourneyFinished(line, values.part![0]!)) guestObserver.stop();
    }, undefined, {}, partBudget + PHONE_COMMAND_BUDGET_MS)
    .then((log) => { output = log; }, (error: Error & { output?: string }) => {
      output = error.output ?? "";
      throw error;
    }), async () => {
      // End the diagnostic at the journey boundary, not after post-failure log collection.
      await keepPhoneDiagnostic("Guest observer", () => guestObserver?.close()); guestObserver = undefined;
      await keepPhoneDiagnostic("Recording", () => recording.stop());
      // A requested clip/poster is a deliverable, not an optional diagnostic.
      await demo.finish(recordings, evidence);
    })
    .catch(async (error: Error) => {
      // The CI job log names why a part failed; its results archive is often too large to fetch.
      // Keep native output even when the error came from recording finalization.
      for (const line of output.split("\n").filter((each) => / error: |Test Case .* failed|^Phone wait failed:/.test(each)).slice(0, 20))
        console.log(line);
      console.log("The pre-failure simulator log is kept in simulator-live.log, even if XCTest tore its domain down.");
      await keepPhoneFailureLogs({ device: owned, testing, appPredicate: SIMULATOR_LOG, systemPredicate: SYSTEM_LOG,
        evidence, webContent, closeLive: async () => { await simulatorLog?.close(); },
        nextLog: () => join(evidence, `${++number}-xcrun.log`),
        keepLog: async (args, log) => {
          if (interrupted && !cleaningUp) throw new Error("The native gate was interrupted");
          await runPhoneLog({ command: "xcrun", args, cwd: REPO_ROOT, env, children, log, budget: PHONE_COMMAND_BUDGET_MS });
        },
      });
      throw error;
    })
    .finally(() => {
      console.log(`XCTest animation waits that ran out: ${phoneAnimationWaits(output).missed}`);
      // INF-4326: the part's work, which its gate checks against the recorded amount (scripts/phone-work.json).
      const work = phoneWork(output);
      console.log(`Screen reads: ${work.reads}, app launches: ${work.launches}`);
      writeFileSync(join(evidence, "work.json"), `${JSON.stringify(work)}\n`);
    });
  // INF-1541 piece 1: the native wait-clock tests launch no app, so only a journey part must say it skipped the wait;
  // a part that runs an app-hosted class alone (INF-2989's weak-link) drives no UI and has no such wait.
  if (!only && phoneSelectionRunsJourney(values.part![0]!, values.test, values["tool-test"]) && !phoneAnimationWaits(output).skipped)
    throw new Error(`The ${values.part![0]} part ran with XCTest's animation wait: its journey never printed "Phone animation wait skipped", so the hook in PhoneAnimationWait.swift is missing`);
  // INF-2625: a test XCTest no longer finds passes silently; the part's own journey test must have started.
  if (!only && !phoneTestsStarted(values.part![0]!, output, values.test, values["tool-test"]))
    throw new Error(`The ${values.part![0]} part never started its journey test${values["tool-test"] ? " or an edited tool test it runs" : ""}: XCTest did not find it in the built tests`);
};
// INF-4326 (INF-4241's speed-ups): a part on the Mac itself, beside the simulated devices: its own disposable home, and
// its tests from the phone's package, built by the gate's package tests, on the real timers. Its phone identity is kept
// in memory, never in this Mac's keychain (PhoneWeakLinkTests.swift).
const macPart = async () => {
  const { startPhoneHome } = await runner.import<typeof import("../tests/helpers/phoneHome")>(join(REPO_ROOT, "tests/helpers/phoneHome.ts"));
  fixture = await startPhoneHome(root);
  const part = values.part![0]!;
  const output = await run("swift", ["test", "--package-path", "ios/Infinitary/InfinitaryKit", "--scratch-path", values["swift-build"]!,
    "--cache-path", packageCache, ...macTestFilter(part, values.test)], false, (line) => {
    if (/^Test Case .* (started|passed|failed|skipped)|error: /.test(line)) console.log(line);
  }, undefined, { PHONE_TEST_HOME: fixture.url }, phonePartBudget(part, recordedTimes) + PHONE_COMMAND_BUDGET_MS);
  // INF-2625: a test XCTest no longer finds passes silently; a skipped one ran nothing.
  if (!phoneTestsStarted(part, output, values.test)) throw new Error(`The ${part} part never started its tests: swift test did not find them`);
  if (/^Test Case .* skipped/m.test(output)) throw new Error(`The ${part} part skipped its tests: they found no disposable home`);
};
let failures: string[] = [];
try {
  // A part skips these: its gate checked them once for every part.
  if (!onePartOnly) {
    // INF-1596: a killed run never deleted its simulator or scratch folder; neither stops this gate.
    await removePhoneLeftovers(run, env).catch((error: Error) =>
      console.log(`Leftovers of earlier phone checks were not removed: ${error.message}`));
  }
  // INF-5387's plan, piece 2: a request's dealt jobs run the package tests once, in its first job.
  if (!onePartOnly && !values["skip-package-tests"]) {
    // A failed check here is reported, and the simulator tests still run (INF-663). INF-2125 piece 3: the
    // generated files' checks are `pnpm check`'s, which every pull request runs on Linux.
    const testing = Date.now();
    failures = await runEveryCheck([
      () => run("swift", ["test", "--package-path", "ios/Infinitary/InfinitaryKit", "--scratch-path", join(root, "swift-build"),
        "--cache-path", packageCache]),
    ], () => interrupted);
    console.log(`Ran the Swift package tests in ${((Date.now() - testing) / 60_000).toFixed(1)} minutes`);
    for (const failure of failures) console.log(`::error::${failure}`);
  }
  await (values.mac ? macPart() : values.xctestrun ? onePart() : everyPart());
  if (failures.length > 0) throw new Error(`The simulator tests passed, but ${failures.length} earlier check(s) failed: ${failures.join("; ")}`);
  console.log(only ? `Native ${only === "waits" ? "wait-clock" : "tool"} tests passed on ${devices.join(" and ")}, with disposable simulators and homes.`
    : values.mac ? `The ${values.part![0]} part passed on this Mac, beside the simulated devices, against its own disposable Mac.`
    : values.xctestrun ? `The ${values.part![0]} part passed on the gate's simulator and its own disposable Mac.`
    : `Every part passed on ${devices.join(" and ")}, each simulator started once and every part on its own disposable Mac.`);
} finally {
  cleaningUp = true;
  try {
    try {
      await keepPhoneDiagnostic("Home observations", () => {
        if (fixture) writeFileSync(join(evidence, "home-observations.json"), JSON.stringify(fixture.observations(), null, 2));
      });
    } finally {
      try { await faceInView?.stop(); }
      finally {
        await keepPhoneDiagnostic("Recording", () => recording.stop());
        await keepPhoneDiagnostic("Keyboard observer", () => keyboard?.close());
        await keepPhoneDiagnostic("Simulator log", () => simulatorLog?.close());
        await keepPhoneDiagnostic("Keyboard timeout stack", () => timeoutStack?.close());
        await keepPhoneDiagnostic("Idle timeout stack", () => idleStack?.close());
        await keepPhoneDiagnostic("WebKit stacks", () => webStacks?.close());
        await keepPhoneDiagnostic("Guest observer", () => guestObserver?.close());
      }
    }
  } finally {
    try { await fixture?.close(); }
    finally {
      try {
        // A lane deletes its own simulator at its end; this catches one a failure left behind.
        for (const owned of [...ownedSimulators]) await deleteSimulator(owned).catch((error: Error) =>
          console.log(`The gate's simulator ${owned} could not be deleted: ${error.message}`));
      } finally {
        try { await runner.close(); }
        finally {
          // INF-5387 piece 1: a diagnostic whose close passed its deadline left its process; none outlives the gate.
          for (const child of children) child.kill("SIGKILL");
          // Keep activity visible through the scratch owner's filesystem teardown too.
          try { removeScratchDirs(); }
          finally {
            try { activity.close(); }
            finally { runPlace.close(); }
          }
        }
      }
    }
  }
}
