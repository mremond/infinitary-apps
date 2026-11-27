import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PHONE_DEVICE_START_MS, PHONE_JOB_BUDGET_MS, recordedPartMs } from "./phone-deadlines.ts";
import type { PhoneHinge } from "./phone-hinge.ts";

// INF-662 piece 1: the phone check builds once and gives each device's tests their own
// test home. Xcode writes the scheme's PHONE_TEST_HOME, empty, into each test target's
// environment in the built test plan (.xctestrun, format 1: one key per target).

/** INF-2014's accepted fail-fast repeats: local gates stop at their first failed part so shell
 * repeat loops return their place promptly. CI keeps full discovery unless explicitly requested;
 * the same explicit 0 preserves deliberate full-discovery local runs. */
export function phoneStopsEarly(env: Record<string, string | undefined>): boolean {
  return env.INFINITARY_PHONE_STOP_EARLY === undefined
    ? !env.CI
    : env.INFINITARY_PHONE_STOP_EARLY === "1";
}

/** The plutil key paths of every test target's PHONE_TEST_HOME in a built test plan, read as JSON. */
export function testHomeKeys(plan: Record<string, unknown>): string[] {
  const keys = Object.entries(plan).filter(([, target]) => {
    const environment = (target as { EnvironmentVariables?: Record<string, unknown> } | null)?.EnvironmentVariables;
    return typeof environment === "object" && environment !== null && "PHONE_TEST_HOME" in environment;
  }).map(([name]) => `${name}.EnvironmentVariables.PHONE_TEST_HOME`);
  if (keys.length === 0) throw new Error("The built test plan has no PHONE_TEST_HOME to name a test home in");
  return keys;
}

/** Where a part writes its own copy of the built test plan, the copy that names its test home: beside the built plan,
 * whose app and test runner a plan finds beside itself, and named for the simulator the part runs on as well as its
 * device and part. A device's lanes can run two passes of one part at once, and a copy named for the part alone gave
 * both passes the test home its last writer named (phone run 43797348609). */
export function partPlanPath(built: string, device: PhoneDevice, part: string, simulator: string): string {
  return join(dirname(built), `${device}-${part}-${simulator}.xctestrun`);
}

// INF-662 piece 2 (the captain's "Both at once, journey in parts"): the phone journey is in parts,
// and each runs alone from its own test home and a clean app on its device's one simulator
// (INF-1438), the devices side by side. The order is each device's start order. INF-4241 removed INF-1735's
// relaunch soak, twenty repeats of one proof: talk-tasks keeps its one dark and light relaunch pair.
// INF-2125 direction C (the captain's "Shared fixes, then short parts", so each pull request's phone
// check finishes quickly): join, talk and cards are each split into short tests, named for
// the part they came from, so a check of the parts a change reaches can run the closest one alone.
// INF-804: `photos` marks a part that chooses a library photo; the gate waits for its device's Photos
// to open its shared-with-you library first, since Photos hands over no chosen photo before then.
// INF-2052: the parts that choose a photo run last, so their device's library photo goes in after the
// device's other parts; a photo added during Photos' background migration held the first part's app
// install on each device for 1 to 13 minutes in runs 41045215266, 41145496442 and 41146815994, and a
// photo added last can still be held (536 seconds before the iPhone's talk in run 41247888712), but
// it holds no part before it.
// INF-4241 piece 6 (the captain's direction B, "a full iPhone pass, a short Duo pass at its four sizes and a short
// iPad pass"): every part runs on the iPhone, and `devices` names the devices beyond it that the part runs on, each
// only because the part checks something that device alone shows, said in `why`. The iPad runs only the parts that
// name it, at a phone release and on a request alike; this one table is the device list phonePasses, phoneJobs,
// scripts/affected-phone.ts, phone.yml and ios-release.yml follow (tests/phone-ci.test.ts holds the workflows
// to it).
// INF-4241 piece 8: a part the iPhone Duo runs names the hinge the gate opens or closes before it (`hinge`), so the Duo
// pass checks INF-4210's promises in the Duo's flat poses: closed upright and on its side, and open like a book; open, it
// turns onto its side and back, and Home's card keeps its place and width like a book (INF-4539). The gate moves the
// hinge, and turns the open Duo, once through scripts/phone-hinge.ts and fails the part when the Duo does not show it.
export const PHONE_JOURNEY = "InfinitaryUITests/PhoneJourney";
export type PhoneDevice = "iphone" | "ipad" | "duo";
/** A row of PHONE_PARTS: the part's name, the journey test or app-hosted class it runs, whether it chooses a library
 * photo, the devices beyond the iPhone it runs on with the reason each needs it, and, where the Duo is one of them,
 * the hinge the Duo starts the part with. */
export type PhonePartRow = { name: string; photos: boolean; mac?: boolean } & ({ test: string } | { suite: string }) &
  ({ devices?: undefined } | { devices: readonly Exclude<PhoneDevice, "iphone">[]; why: string; hinge?: PhoneHinge });
export const PHONE_PARTS = [
  { name: "join-read", test: "testJoinAndRead", photos: false, devices: ["ipad"], why: "its Settings and approvals name This iPad, and turned it shows the wide layout's sidebar beside the stage" },
  { name: "join-activity", test: "testActivityAndCatchUp", photos: false },
  { name: "join-away", test: "testAwayLeaveAndRemoved", photos: false },
  { name: "talk-tasks", test: "testTasksAndSteer", photos: false, devices: ["ipad"], why: "turned, Home's stage and Tasks sit beside the wide layout's sidebar, and the strip comes back from nowhere upright" },
  { name: "talk-drafts", test: "testDraftsAcrossHomes", photos: false },
  { name: "cards-merge", test: "testMergeCard", photos: false },
  { name: "cards-form", test: "testCardForm", photos: false },
  { name: "cards-media", test: "testCardMediaAndBody", photos: false },
  // INF-1183: joining a home by its address, against the Mac's own sshd beside the test home.
  { name: "address", test: "testJoinByAddress", photos: false, devices: ["ipad"], why: "the iPad's number keyboard opens as a pop-up panel that takes the next field's tap" },
  // INF-2095: the pager pick journey launches fresh, so it needs a simulator no other journey joined first.
  { name: "pick", test: "testMenuPickSurvivesAWorkspaceRedraw", photos: false },
  // INF-2565: a revision while the thread shows keeps the card on its back.
  { name: "cards-revise", test: "testRevisionKeepsTheThreadShowing", photos: false },
  // INF-6136: only a card's one-line top bar stays in place, its minus on that line, and its choices can be pressed.
  { name: "cards-top-bar", test: "testCardTopBar", photos: false },
  // INF-6865: a long card revised in place into folded sections while read at its end still scrolls to its choices.
  { name: "cards-revised-scroll", test: "testRevisedCardScrollsToItsChoices", photos: false },
  // INF-6388: a card from an unsafe data reader says a link or request on it may come from a stranger.
  { name: "cards-reader", test: "testReaderCardUnsafeLine", photos: false },
  // INF-3124: a thread read from its start keeps its place as new lines arrive.
  { name: "cards-place", test: "testThreadKeepsItsPlace", photos: false },
  // INF-3296: notes on a card's parts and selected words, queued and sent as one reply.
  { name: "cards-notes", test: "testCardNotes", photos: false },
  // INF-3881: a card's map opens live in a cover of its own; a finger on the map in the card scrolls the card.
  { name: "cards-diagram", test: "testCardDiagramCover", photos: false },
  // INF-4239 piece 4: an ask to keep a secret, typed into the phone's masked field and kept in Secrets.
  { name: "cards-secret", test: "testSecretAskKeptFromPhone", photos: false },
  // INF-5445 piece 2: a card's picks and words shared with every other screen through the test home's real core.
  { name: "cards-drafts", test: "testCardDrafts", photos: false },
  // INF-5531 piece 2: a crewmate's card reads live app data through the panels' reads while it is open, and stops once ended.
  { name: "cards-reads", test: "testCardLiveReads", photos: false },
  // INF-2568: the message box and a card's reply with the keyboard up; each launches fresh and the merge fixture runs once a home.
  { name: "keyboard-pinned", test: "testKeyboardOverPinnedCard", photos: false, devices: ["ipad"], why: "the iPad's keyboard and its taller suggestion row, upright and turned, over the message box and a reply" },
  { name: "keyboard-scrolling", test: "testKeyboardOverScrollingCard", photos: false, devices: ["ipad"], why: "a card that scrolls on the iPhone fits whole above the iPad's keyboard (INF-2737 held back a phone release)" },
  // INF-3106: each way out of a card's reply keyboard and the message box's, the keyboard-down button among them.
  { name: "keyboard-ways-out", test: "testKeyboardWaysOut", photos: false },
  // INF-3427: a text box inside a card body stays in view with the keyboard up.
  { name: "body-field", test: "testCardBodyFieldKeyboard", photos: false },
  // The card question stepper: the picked count and its arrows bring each question of a decision into view.
  { name: "card-questions", test: "testCardQuestionSteps", photos: false },
  // INF-3454: Google's row in the phone's Settings, signing in to the test home's stand-in Google and out again.
  { name: "google", test: "testGoogleSignInAndOut", photos: false },
  // INF-3563: Settings' pages on a home that holds accounts, rules, usage, projects and runbooks: what each shows,
  // what the phone may change, and the keys that reach it.
  { name: "settings-pages", test: "testSettingsPages", photos: false, devices: ["ipad"], why: "the project amount field gets the iPad's numbers-and-punctuation keyboard in place of its pop-up number pad" },
  // INF-3675 piece 4: the phone in each catalog language, Arabic right to left, Apple's pseudo-languages on Settings →
  // Appearance and its Language row opening iOS Settings by keys.
  { name: "languages", test: "testLanguages", photos: false },
  // INF-3830 pieces 2 and 3: the computer's panels on the Panels tab, from a fixture panel on the test home's real core,
  // with a panel's title-row buttons, its cards on Home and its taps that open a task (one part since INF-4241).
  { name: "panels", test: "testPanelsTab", photos: false, devices: ["ipad"], why: "turned, Panels is the wide layout sidebar's third choice beside the stage" },
  // INF-4241 piece 8: the layout in the Duo's flat poses, the hinge moved inside the part, and a device
  // that never folds showing no Split at the fold.
  { name: "fold", test: "testLayoutFollowsTheFold", photos: false, devices: ["duo"], hinge: "closed", why: "the open Duo gives the card room in both poses, shows panels by key and remembers the choice, keeps both split frames stable through turns, and preserves the closed and unsplit layouts" },
  // INF-4207 piece 9: Take over from the phone, against a computer that keeps a copy beside the test home
  // (tests/helpers/phoneTakeOver.ts); it confirms with Face ID and then follows the home at number 2.
  { name: "take-over", test: "testTakeOverFromThePhone", photos: false },
  // INF-4794: card pushes, from the one-sentence ask through a sealed card push the test home's real sender posts
  // to its stand-in relay, which the simulator delivers with the relay's words (a simulated push runs no
  // notification part), to the tap that brings Infinitary back.
  { name: "push", test: "testCardPushes", photos: false },
  // INF-5265: one phone keeping two computers, the test home and a second home in a process of its own
  // (tests/helpers/phoneSecondHome.ts): the bar names the one shown, the sheet marks the other and shows it by keys,
  // a push from the one not shown shows it with its card, and leaving one shows the other.
  { name: "homes", test: "testSeveralComputers", photos: false },
  // INF-2989: the weak link checks (INF-2668, INF-2669) wait out real links and silences, about five minutes a
  // device, which doubled the rest part they joined. An app-hosted class of their own, so a change to the other
  // app-hosted tests repeats only the rest part and a change to these repeats only them. INF-4326 (INF-4241's speed-ups):
  // they drive no screen, so they run on the Mac itself (`mac`), beside the simulated devices: a test target of the
  // phone's package of their own (its suite names the target and the class), against the part's own disposable home.
  { name: "weak-link", suite: "PhoneWeakLinkTests/PhoneWeakLinkTests", photos: false, mac: true },
  // INF-5608's plan, piece 2 (INF-5487): a card's choice carries the photo and note in its field to the computer, and
  // the past card names them; it chooses a photo, so it runs with the parts that do.
  { name: "cards-carried", test: "testCardChoiceCarries", photos: true },
  { name: "talk-compose", test: "testComposeAndSend", photos: true, devices: ["ipad"], why: "the composer turned beside the wide layout's sidebar, and the iPad's own photo picker" },
  // The last part runs every test no other part names: the app-hosted tests and any new one that
  // needs no fresh app, since its simulator already holds the character journey's join.
  { name: "rest", test: "testCharacterAndPastChoices", photos: true, devices: ["ipad"], why: "the iPad's own photo picker, an approval enrolled as iPad, and Settings' Your computer page and its alert drawn over the scene" },
] as const satisfies readonly PhonePartRow[];
export type PhonePart = (typeof PHONE_PARTS)[number]["name"];

export function partDevices(name: string): PhoneDevice[] {
  const part: PhonePartRow | undefined = PHONE_PARTS.find((each) => each.name === name);
  if (!part) throw new Error(`No phone journey part is named ${name}`);
  return ["iphone", ...(part.devices ?? [])];
}

/** The hinge the Duo starts a part with, from its row of PHONE_PARTS; a part the Duo runs always names one. */
export function partHinge(name: string): PhoneHinge {
  const part: PhonePartRow | undefined = PHONE_PARTS.find((each) => each.name === name);
  if (!part) throw new Error(`No phone journey part is named ${name}`);
  if (!part.devices?.includes("duo")) throw new Error(`The ${name} part does not run on the duo`);
  if (!part.hinge) throw new Error(`The ${name} part runs on the duo but names no hinge to start it with`);
  return part.hinge;
}

/** Every device some part runs on, the iPhone first: the devices phone.yml and ios-release.yml check. */
export const PHONE_DEVICES: readonly PhoneDevice[] = [...new Set(PHONE_PARTS.flatMap(({ name }) => partDevices(name)))];

export function devicePartNames(device: PhoneDevice): string[] {
  return PHONE_PARTS.filter(({ name }) => partDevices(name).includes(device)).map(({ name }) => name);
}

/** The XCTest identifier a part runs: its journey test, or the whole test class it names as its `suite`. */
export function partIdentifier(part: { test: string } | { suite: string }): string {
  return "suite" in part ? part.suite : `${PHONE_JOURNEY}/${part.test}`;
}

/** INF-1083: ordinary XCTest must still stop a stuck test, not wait for the job limit.
 * INF-5387 piece 1: each ordinary test's allowance is its part's deadline (`phonePartBudget`), in whole seconds, so a
 * test that hangs while it runs ends with XCTest's own diagnosis; the part's xcodebuild has its own deadline after it.
 * Quiet grading keeps Xcode's original allowances. Neither mode disables its timeouts.
 * INF-2052 (the captain's choice "Also stop Xcode collecting diagnostics after a failed part"): after a failed test
 * Xcode waited 600 seconds for the simulator's diagnostics and timed out with none, in each failed part of run
 * 41196507458; the gate keeps its own failure logs.
 */
export function phoneExecutionArguments(grades: boolean, allowanceSeconds: number): string[] {
  const allowance = String(Math.ceil(allowanceSeconds));
  return ["-test-timeouts-enabled", "YES", "-collect-test-diagnostics", "never", ...(grades ? [] : [
    "-default-test-execution-time-allowance", allowance,
    "-maximum-test-execution-time-allowance", allowance,
  ])];
}

/** INF-1541 piece 1 (the captain's choice "The test code skips Apple's animation wait and checks each target itself"):
 * every journey replaces XCTest's private quiescence wait so no wait asks for the app's animation reply, and prints
 * "Phone animation wait skipped: " once it has (ios/Infinitary/InfinitaryUITests/PhoneAnimationWait.swift); a part whose
 * log never says so ran with Apple's wait. `missed` counts XCTest's own line for an animation wait that ran out, which
 * INF-1538's stalled part printed 18 times; the replacement leaves none, so any the gate counts got past it. */
export function phoneAnimationWaits(output: string): { skipped: boolean; missed: number } {
  const lines = output.split("\n");
  return {
    skipped: lines.some((line) => line.includes("Phone animation wait skipped: ")),
    missed: lines.filter((line) => line.includes("App animations complete notification not received")).length,
  };
}

/** INF-4241 (the captain's "remove all", whose fourth group is "tests of the test tools ... The tool tests then run
 * only when the tools change"): the tests that check the phone check's own tools - its wait clock, its target pixels,
 * the crew reveal's geometry and the scene evidence recorder - rather than the app. The rest part skips them; the
 * `tools` selection runs them, on request from a change to those tools. */
export const PHONE_TOOL_TESTS = [
  "InfinitaryUITests/PhoneKeyActionTests",
  "InfinitaryUITests/PhoneWaitsTests",
  "InfinitaryUITests/PhoneTargetPixelsTests",
  `${PHONE_JOURNEY}/testCrewRevealRejectsRecordedClippingEdge`,
  `${PHONE_JOURNEY}/testCrewRevealWaitsForTheOrbitNotADrag`,
  "InfinitaryTests/PhoneSceneEvidenceTests/testFrameSamplesKeepTheirDrawingScopeAndSource",
  "InfinitaryTests/PhoneSceneEvidenceTests/testWarmupTraceRecordsActualMainRunLoopProgress",
  "InfinitaryTests/PhoneSceneEvidenceTests/testStoppedDisplaySampleNamesMissingCallbacks",
  "InfinitaryTests/PhoneSceneEvidenceTests/testMainThreadStallDoesNotSpendTheDisplayBudget",
  "InfinitaryTests/PhoneSceneEvidenceTests/testLongIdleSampleNamesTheActualUnexpectedMode",
] as const;

/** The entry of PHONE_TOOL_TESTS that holds a test identifier: the test itself or the tool class it is in. */
export function phoneToolEntry(test: string): string | undefined {
  return PHONE_TOOL_TESTS.find((entry) => test === entry || test.startsWith(`${entry}/`));
}

/** A selection of tests in the rest part's place instead of a part's own: the native wait clock alone, or every
 * test of the phone check's tools. */
export type PhoneToolSelection = "waits" | "tools";

/** INF-4326 (INF-4241's guard, the captain's "counts work, never seconds"): the work one part's tests made, read from
 * XCTest's own activity lines in its xcodebuild output. A screen read is each top-level look into the app's screen: a
 * find, an existence check, an element count or list, a snapshot; the looks a tap makes inside its own action are part of
 * that tap. A launch is each start of the app. Seconds move with the computer's load; these counts move with the tests. */
export type PhoneWork = { reads: number; launches: number };

/** The app a part tests, as its Xcode project names it (docs/ios.md). */
export const PHONE_APP = "com.getinfinitary.app";

export function phoneWork(output: string): PhoneWork {
  const lines = output.split("\n");
  const launch = new RegExp(`^ +t = +[\\d.]+s +Launch ${PHONE_APP.replaceAll(".", "\\.")}$`);
  return {
    reads: lines.filter((line) => /^ {4}t = +[\d.]+s (Find the |Checking existence of |Get all elements |Get number of matches |Requesting snapshot )/.test(line)).length,
    launches: lines.filter((line) => launch.test(line)).length,
  };
}

/** Each part, on each device, whose work grew past its recorded amount (scripts/phone-work.json) or that has none
 * recorded, named in a line the gate prints on every run; a pass with no work read (the Mac's weak-link part, a part
 * that never ran) names nothing. */
export function phoneWorkPast(jobs: readonly PhoneJob[], ends: readonly (PhonePassEnd | undefined)[],
  record: Readonly<Record<string, Partial<Record<PhoneDevice, PhoneWork>>>>): string[] {
  return jobs.flatMap((job, index) => {
    const work = ends[index]?.work;
    if (!work) return [];
    const kept = record[job.part]?.[job.device];
    const made = `${work.reads} screen reads and ${work.launches} app launches`;
    if (!kept) return [`${phonePassName(job)} made ${made}, and has no recorded amount`];
    return work.reads > kept.reads || work.launches > kept.launches
      ? [`${phonePassName(job)} made ${made}, past its recorded ${kept.reads} and ${kept.launches}`]
      : [];
  });
}

/** The xcodebuild arguments that choose one part's tests from the built test plan. `tools` names the rest part's tool
 * tests whose own code changed, which it then runs rather than skips. */
export function partSelection(name: string, only?: PhoneToolSelection, tools: readonly string[] = []): string[] {
  // INF-1083: prove the native clock in either mode without grading unrelated UI journeys.
  if (only) {
    if (name !== "rest") throw new Error("Native wait-clock and tool tests belong to the rest part");
    return only === "waits" ? ["-only-testing:InfinitaryUITests/PhoneWaitsTests"]
      : PHONE_TOOL_TESTS.map((test) => `-only-testing:${test}`);
  }
  const index = PHONE_PARTS.findIndex((part) => part.name === name);
  if (index < 0) throw new Error(`No phone journey part is named ${name}`);
  if (tools.length && index < PHONE_PARTS.length - 1) throw new Error(`The ${name} part runs no tool tests; the rest part does`);
  for (const test of tools) if (!phoneToolEntry(test)) throw new Error(`${test} is not a test of the phone check's own tools`);
  if (index < PHONE_PARTS.length - 1) return [`-only-testing:${partIdentifier(PHONE_PARTS[index]!)}`];
  // xcodebuild lets no -only-testing bring back a test a -skip-testing names, so a tool class that holds an edited
  // test is no longer skipped, and its other tests run beside it.
  const running = new Set(tools.map((test) => phoneToolEntry(test)));
  // A part on the Mac runs a package test target the app's test plan does not hold.
  return [...PHONE_PARTS.slice(0, -1).filter((part) => !partOnMac(part.name)).map((part) => `-skip-testing:${partIdentifier(part)}`),
    ...PHONE_TOOL_TESTS.filter((test) => !running.has(test)).map((test) => `-skip-testing:${test}`)];
}

/** INF-4326: whether a part runs on the Mac itself, beside the simulated devices, rather than on a device. */
export function partOnMac(name: string): boolean {
  const part = PHONE_PARTS.find((each) => each.name === name);
  if (!part) throw new Error(`No phone journey part is named ${name}`);
  return "mac" in part && part.mac;
}

/** The `swift test` filter that chooses a Mac part's tests, or the named ones among them, from the phone's package:
 * XCTest identifiers (target/class/test) as its target.class/test patterns. */
export function macTestFilter(part: string, tests: readonly string[] = []): string[] {
  if (!partOnMac(part)) throw new Error(`The ${part} part runs on a device, not on the Mac`);
  phoneTestSelection(part, tests);
  const [identifier] = partSelection(part).map((arg) => arg.slice("-only-testing:".length));
  // swift test names a test Target.Class/test.
  const swiftName = (identifier: string) => identifier.replace("/", ".");
  return ["--filter", tests.length ? tests.map((test) => `^${swiftName(test)}$`).join("|") : `^${swiftName(identifier!)}/`];
}

/** Whether a part drives the app through a UI journey test, rather than running an app-hosted class alone. */
export function partRunsJourney(name: string): boolean {
  const part = PHONE_PARTS.find((each) => each.name === name);
  if (!part) throw new Error(`No phone journey part is named ${name}`);
  return "test" in part;
}

/** INF-2625's phone guard: a part passes on xcodebuild's exit status, and a test XCTest never found fails nothing, so
 * the gate also asks that the part's own journey test started, read from XCTest's own "Test Case ... started" line,
 * or, for a part that runs a whole class, its "Test Suite ... started" line. */
export function partTestStarted(name: string, output: string): boolean {
  const part = PHONE_PARTS.find((each) => each.name === name);
  if (!part) throw new Error(`No phone journey part is named ${name}`);
  if ("suite" in part) return output.includes(`Test Suite '${part.suite.split("/").at(-1)}' started at `);
  return output.includes(`Test Case '-[${PHONE_JOURNEY.replace("/", ".")} ${part.test}]' started.`);
}

/** Exact repeat selectors retain the ordinary part when the change could not be read; a pass's edited tool tests
 * (`tools`) run beside whichever it selects. */
export function phoneTestSelection(part: string, tests: readonly string[] = [], only?: PhoneToolSelection,
  tools: readonly string[] = []): string[] {
  const selection = partSelection(part, only, tools);
  const named = [...new Set([...tests, ...tools])];
  for (const test of named)
    if (!/^(?:InfinitaryTests|InfinitaryUITests|PhoneWeakLinkTests)\/\w+\/test\w+$/.test(test)) throw new Error(`Invalid phone test: ${test}`);
  if (!tests.length) return selection;
  const matches = (test: string, selected: string) => test === selected || test.startsWith(`${selected}/`);
  for (const test of tests) {
    if (selection.some((arg) => arg.startsWith("-only-testing:") && !matches(test, arg.slice("-only-testing:".length))) ||
      selection.some((arg) => arg.startsWith("-skip-testing:") && matches(test, arg.slice("-skip-testing:".length)) &&
        // INF-4241: a tool test the rest part skips is still the rest part's to run when its own code changed.
        !(part === "rest" && (PHONE_TOOL_TESTS as readonly string[]).includes(arg.slice("-skip-testing:".length)))))
      throw new Error(`The ${part} part does not own ${test}`);
  }
  return named.map((test) => `-only-testing:${test}`);
}
export function phoneSelectionRunsJourney(part: string, tests: readonly string[] = [], tools: readonly string[] = []): boolean {
  return tests.length ? [...tests, ...tools].some((test) => test.startsWith(`${PHONE_JOURNEY}/`)) : partRunsJourney(part);
}
/** Whether the part's own test, or each named test, started, and each edited tool test the pass runs beside them,
 * since xcodebuild passes a selection that ran none of them. */
export function phoneTestsStarted(part: string, output: string, tests: readonly string[] = [], tools: readonly string[] = []): boolean {
  const started = (test: string) => {
    const [target, suite, method] = test.split("/");
    return output.includes(`Test Case '-[${target}.${suite} ${method}]' started.`);
  };
  return (tests.length ? tests.every(started) : partTestStarted(part, output)) && tools.every(started);
}

/** Every device's parts in start order: each part on the slower iPad first, then on the iPhone, and each only on the
 * devices its row of PHONE_PARTS names (INF-4241 piece 6).
 * INF-1438: a device with one lane runs its parts in this order on the one simulator it starts (`phoneLanePlan`). */
export function phoneJobs(devices: PhoneDevice[], parts: readonly string[] = PHONE_PARTS.map((part) => part.name)) {
  for (const part of parts) partSelection(part);
  const order: PhoneDevice[] = ["ipad", "duo", "iphone"];
  return PHONE_PARTS.filter((part) => parts.includes(part.name)).flatMap((part) => order
    .filter((device) => devices.includes(device) && partDevices(part.name).includes(device))
    .map((device) => ({ device, part: part.name })));
}

/** One part's run in a gate: its device, its part, which pass of the gate it belongs to, any tests it runs in the
 * part's place, and the edited tool tests it runs beside them (`partSelection`). */
export type PhoneJob = { device: PhoneDevice; part: string; round: number; tests?: readonly string[]; tools?: readonly string[] };

/** The passes after the ordinary one that a part whose test code changed takes (INF-2259: three in all). */
export const PHONE_REPEAT_ROUNDS = [2, 3] as const;

/** INF-2582 direction A (the captain's choices "A: wait once and trim the soak" and "iPhone only; iPad
 * waits for the release check"): one gate runs every pass on the build and simulators it started.
 * Round one runs `parts` on every device and `iphoneOnly` on the iPhone alone; rounds two and three
 * then run `repeats` again on the iPhone alone, after its round one; the iPad runs a repeated part
 * once (INF-2732, the captain's "run each edited phone part three times on the iPhone and once on the iPad").
 * A part runs only on the devices its row of PHONE_PARTS names, so the iPad runs only the parts about the iPad.
 * Every pass of a part in `toolTests` runs those edited tool tests too, so they get the part's rounds.
 * Each device's jobs are in the order its lane runs them (`runDeviceLanes`), and the iPad's lane starts
 * first, as `phoneJobs`. */
export function phonePasses(devices: PhoneDevice[], { parts = [], iphoneOnly = [], repeats = [], repeatTests = {}, toolTests = {} }: {
  parts?: readonly string[]; iphoneOnly?: readonly string[]; repeats?: readonly string[]; repeatTests?: Record<string, readonly string[]>;
  toolTests?: Record<string, readonly string[]>;
}): PhoneJob[] {
  for (const part of [...parts, ...iphoneOnly, ...repeats]) partSelection(part, undefined, toolTests[part]);
  const tools = (job: PhoneJob): PhoneJob => (toolTests[job.part]?.length ? { ...job, tools: toolTests[job.part] } : job);
  const first = phoneJobs(devices, [...parts, ...iphoneOnly])
    .filter(({ device, part }) => device === "iphone" || !iphoneOnly.includes(part) || parts.includes(part))
    .map((job) => tools({ ...job, round: 1 }));
  const order: PhoneDevice[] = ["ipad", "duo", "iphone"];
  return order.filter((device) => devices.includes(device)).flatMap((device) => [
    ...first.filter((job) => job.device === device),
    ...(device === "iphone"
      ? PHONE_REPEAT_ROUNDS.flatMap((round) => phoneJobs([device], repeats).map((job) => tools({ ...job, round, ...(repeatTests[job.part]?.length ? { tests: repeatTests[job.part] } : {}) })))
      : []),
  ]);
}

/** A full gate's part-times.json as it reads: each part's milliseconds on each device it ran on. */
export type PhonePassTimes = Record<string, Partial<Record<PhoneDevice, number>>>;

/** A pass's recorded time: its part's on its device, else its part's longer device time, else the median recorded part
 * (`recordedPartMs`). A later round counts as its part's ordinary pass. */
export function phonePassMs({ device, part }: PhoneJob, times: PhonePassTimes,
  longer: ReadonlyMap<string, number> | undefined = partTimes(JSON.stringify(times))): number {
  const own = times[part]?.[device];
  return typeof own === "number" && own > 0 ? own : recordedPartMs(part, longer);
}

/** INF-5546: a dealt job's recorded milliseconds, as the dealing counts them: its passes' recorded times, and
 * `PHONE_DEVICE_START_MS` for each device past its first, since a phone Mac with one simulator starts each device after
 * the last one's parts. A part on the Mac starts no device. */
export function phoneJobMs(passes: readonly PhoneJob[], times: PhonePassTimes,
  longer: ReadonlyMap<string, number> | undefined = partTimes(JSON.stringify(times))): number {
  const devices = new Set(passes.filter((pass) => !partOnMac(pass.part)).map((pass) => pass.device));
  return passes.reduce((sum, pass) => sum + phonePassMs(pass, times, longer), 0)
    + Math.max(0, devices.size - 1) * PHONE_DEVICE_START_MS;
}

/** One job a manual request deals to its own phone Mac: its number, counted from one, and its passes in plan order.
 * The first job also runs the phone's Swift package tests, once for the request, and holds the Mac part when one is
 * dealt, since that part reuses their build. */
export type PhoneDealtJob = { number: number; passes: PhoneJob[] };

/** INF-5387's plan, piece 2: deals a request's passes into jobs of at most `budget` recorded milliseconds as
 * `phoneJobMs` counts them, each run on its own phone Mac. A pass longer than the budget by itself runs alone. The
 * count is those passes and the other passes' recorded time over the budget, rounded up, and one more while the
 * dealing leaves a job of more than one pass past it. Passes go longest first to the job they leave lightest, a
 * device's start counted where the pass brings a job another device (INF-5546), as `phoneLanePlan` shares a device's
 * parts among its simulators, except that a pass goes to a job already holding its device, whose simulators it then
 * reuses, when that leaves no job longer than the lightest choice would. Every pass is dealt exactly once, and each
 * job keeps its passes in plan order. */
export function dealPhonePasses(passes: readonly PhoneJob[], times: PhonePassTimes,
  budget: number = PHONE_JOB_BUDGET_MS): PhoneDealtJob[] {
  const longer = partTimes(JSON.stringify(times));
  const ms = passes.map((pass) => phonePassMs(pass, times, longer));
  const order = passes.map((_, index) => index).sort((a, b) => ms[b]! - ms[a]! || a - b);
  const total = ms.reduce((sum, each) => sum + each, 0);
  const deal = (count: number) => {
    const jobs = Array.from({ length: count }, () => ({ load: 0, indices: [] as number[], devices: new Set<PhoneDevice>() }));
    const adds = (job: (typeof jobs)[number], index: number) => {
      const { device, part } = passes[index]!;
      const starts = !partOnMac(part) && job.devices.size > 0 && !job.devices.has(device);
      return ms[index]! + (starts ? PHONE_DEVICE_START_MS : 0);
    };
    const lighter = <Job extends { load: number }>(best: Job, job: Job) => job.load < best.load ? job : best;
    for (const index of order) {
      const lightest = jobs.reduce((best, job) => job.load + adds(job, index) < best.load + adds(best, index) ? job : best);
      // Never past the budget, so a pass longer than it by itself raises no other job's bound.
      const longest = Math.min(budget, Math.max(lightest.load + adds(lightest, index), total / count, ...jobs.map((job) => job.load)));
      const holders = jobs.filter((job) => job.load + adds(job, index) <= longest
        && job.indices.some((each) => passes[each]!.device === passes[index]!.device));
      const chosen = holders.length ? holders.reduce(lighter) : lightest;
      chosen.load += adds(chosen, index);
      chosen.indices.push(index);
      if (!partOnMac(passes[index]!.part)) chosen.devices.add(passes[index]!.device);
    }
    return jobs;
  };
  // A pass past the budget runs alone, so the count starts at those passes and the rest's time over the budget.
  const alone = ms.filter((each) => each > budget);
  let count = Math.max(1, alone.length + Math.ceil((total - alone.reduce((sum, each) => sum + each, 0)) / budget));
  let jobs = deal(count);
  // A job past the budget holding one pass is that pass alone; only a job past it with more passes needs another job.
  while (jobs.some((job) => job.load > budget && job.indices.length > 1) && count < passes.length) jobs = deal(++count);
  const dealt = jobs.filter((job) => job.indices.length).map((job) => job.indices.toSorted((a, b) => a - b));
  // The job that holds the Mac part comes first, beside the package tests whose build it reuses.
  const onMac = (indices: number[]) => indices.some((index) => partOnMac(passes[index]!.part));
  return dealt.sort((a, b) => Number(onMac(b)) - Number(onMac(a)) || a[0]! - b[0]!)
    .map((indices, at) => ({ number: at + 1, passes: indices.map((index) => passes[index]!) }));
}

/** A dealt job's passes as the gate reads them from `--plan` (`dealPhonePasses`): each a device and a part its row of
 * PHONE_PARTS runs there, its round (a further round on the iPhone alone), any named tests the part owns and any edited
 * tool tests of the rest part, every pass once. Anything else is refused before a simulator starts. */
export function readPhonePlan(text: string): PhoneJob[] {
  const read = JSON.parse(text) as unknown;
  if (!Array.isArray(read) || !read.length) throw new Error("A dealt phone job's plan lists its passes, at least one");
  const jobs = read.map((pass: unknown): PhoneJob => {
    const { device, part, round, tests, tools } = (pass ?? {}) as Record<string, unknown>;
    if (!(PHONE_DEVICES as readonly unknown[]).includes(device) || typeof part !== "string")
      throw new Error(`A dealt phone pass names a device and a part: ${JSON.stringify(pass)}`);
    if (!partDevices(part).includes(device as PhoneDevice)) throw new Error(`The ${part} part does not run on the ${String(device)}`);
    if (!(round === 1 || (device === "iphone" && (PHONE_REPEAT_ROUNDS as readonly unknown[]).includes(round))))
      throw new Error(`A dealt phone pass of ${part} on the ${String(device)} has no round ${String(round)}`);
    for (const named of [tests, tools])
      if (named !== undefined && (!Array.isArray(named) || named.some((test) => typeof test !== "string")))
        throw new Error(`A dealt phone pass's tests are identifiers: ${JSON.stringify(pass)}`);
    if (tests || tools) phoneTestSelection(part, (tests ?? []) as string[], undefined, (tools ?? []) as string[]);
    return { device: device as PhoneDevice, part, round: round as number, ...(tests ? { tests: tests as string[] } : {}),
      ...(tools ? { tools: tools as string[] } : {}) };
  });
  const names = jobs.map(phonePassName);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice) throw new Error(`A dealt phone job lists ${twice} twice`);
  return jobs;
}

/** A pass's name in the gate's log and in its failure: the part on its device, and its round after the first. */
export function phonePassName({ device, part, round }: PhoneJob): string {
  return round === 1 ? `${device} ${part}` : `${device} ${part} round ${round}`;
}

/** How one pass of the gate ended, and the milliseconds from its start to that end. */
export type PhonePassEnd = { outcome: "passed" | "stopped" | "failed"; ms: number; work?: PhoneWork };

/** The end of a gate, from its passes in plan order and how each ended (undefined for one that never started).
 * INF-827: a full gate keeps each part's minutes on each of its devices as part-times.json in its evidence folder,
 * a part's minutes being its ordinary pass's. A gate is full when each of its devices has an ordinary pass of every
 * part that runs on that device (INF-4241 piece 6) and every pass ran to its end, so a gate of one device keeps its own (INF-2582: the release check runs
 * each device on its own phone Mac). Any failed pass then fails the gate, naming the passes it stopped and the
 * ones it never started. */
export function endPhoneGate(jobs: readonly PhoneJob[], ends: readonly (PhonePassEnd | undefined)[], evidence: string): void {
  const ended = (outcome: PhonePassEnd["outcome"]) => jobs.filter((_, index) => ends[index]?.outcome === outcome).map(phonePassName);
  const [failed, stopped] = [ended("failed"), ended("stopped")];
  const unstarted = jobs.filter((_, index) => !ends[index]).map(phonePassName);
  const devices = [...new Set(jobs.map((job) => job.device))];
  const everyPart = devices.length > 0 && devices.every((device) => devicePartNames(device).every((name) =>
    jobs.some((job) => job.device === device && job.part === name && job.round === 1)));
  if (everyPart && !stopped.length && !unstarted.length) {
    const times: Record<string, Partial<Record<PhoneDevice, number>>> = {};
    for (const [index, job] of jobs.entries()) if (job.round === 1) (times[job.part] ??= {})[job.device] = ends[index]!.ms;
    writeFileSync(join(evidence, "part-times.json"), `${JSON.stringify(times, null, 2)}\n`);
    // INF-4326: and the work each part made, in scripts/phone-work.json's shape, from which a new record is taken.
    const work: Record<string, Partial<Record<PhoneDevice, PhoneWork>>> = {};
    for (const [index, job] of jobs.entries()) {
      const made = ends[index]!.work;
      if (job.round === 1 && made) (work[job.part] ??= {})[job.device] = made;
    }
    writeFileSync(join(evidence, "part-work.json"), `${JSON.stringify(work, null, 2)}\n`);
  }
  if (failed.length) throw new Error([`The phone gate failed: ${failed.join(", ")}`,
    ...(stopped.length ? [`it stopped ${stopped.join(", ")}`] : []),
    ...(unstarted.length ? [`it never started ${unstarted.join(", ")}`] : []), `see its results in ${evidence}`].join("; "));
}

/** INF-4496's fix 2: a rerun of a failed phone job runs only the passes that did not pass in an earlier attempt of
 * the same run, so the rerun is the retry and its pass turns that run's failed check green. Every attempt of a run
 * checks the same version, so a pass there stays a pass; a pass that failed, stopped or never started runs again.
 * The record is the names (`phonePassName`) of every pass that passed in the run so far, read from the file a
 * failed attempt left; no file means no earlier pass. */
export function readPhonePasses(path: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const { passed } = JSON.parse(text) as { passed?: unknown };
  if (!Array.isArray(passed) || passed.some((name) => typeof name !== "string"))
    throw new Error(`${path} does not list the passes of earlier attempts`);
  return passed;
}

export function phonePassesLeft(jobs: readonly PhoneJob[], passed: readonly string[]): PhoneJob[] {
  return jobs.filter((job) => !passed.includes(phonePassName(job)));
}

export function keepPhonePasses(path: string, earlier: readonly string[], jobs: readonly PhoneJob[],
  ends: readonly (PhonePassEnd | undefined)[]): void {
  const passed = jobs.filter((_, index) => ends[index]?.outcome === "passed").map(phonePassName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ passed: [...new Set([...earlier, ...passed])] }, null, 2)}\n`);
}

/** INF-2052: a device's Photos, made ready in two stages. `watched` begins the wait for Photos to open its library
 * once, when the device starts, since that wait reads the library's opening since boot and ends at a ceiling after
 * boot. `ready` adds the library photo once, after that wait, only when the device's first part that chooses a photo
 * asks, and every later part that chooses one hears the same outcome. `restarted` forgets both, for a device that
 * started again; its next `watched` waits from the new start. */
export function devicePhotos(watch: () => Promise<void>, add: () => Promise<void>) {
  let watching: Promise<void> | undefined;
  let adding: Promise<void> | undefined;
  const watched = () => (watching ??= watch());
  return {
    watched,
    ready: () => (adding ??= watched().then(add)),
    restarted: () => {
      watching = adding = undefined;
    },
  };
}

/** Runs each job once, in order, as many at a time as `slots` places hold, each job taking its `places` (one unless
 * it says more, and never more than `slots`); a job waits until its places are free, and no later job starts before
 * it. One job's failure stops none of the others, unless `stopAfter` holds for a job's result or the job throws: then
 * no further job starts and the signal each running job holds aborts. A job that never started leaves its result
 * undefined. */
export async function runSideBySide<Job, Result>(jobs: Job[], slots: number, run: (job: Job, signal: AbortSignal) => Promise<Result>,
  stopAfter?: (result: Result) => boolean, places: (job: Job) => number = () => 1): Promise<(Result | undefined)[]> {
  if (!Number.isInteger(slots) || slots < 1) throw new Error("Run at least one simulator at a time");
  const results: (Result | undefined)[] = jobs.map(() => undefined);
  const errors: unknown[] = [];
  const stopping = new AbortController();
  const running: Promise<void>[] = [];
  let free = slots;
  // Only this loop ever waits, so one waker serves it; a job that ends while nothing waits wakes nothing.
  let wake = () => {};
  for (const [index, job] of jobs.entries()) {
    const need = Math.min(Math.max(1, places(job)), slots);
    while (free < need && !stopping.signal.aborted) await new Promise<void>((resolve) => { wake = resolve; });
    if (stopping.signal.aborted) break;
    free -= need;
    running.push((async () => {
      try {
        results[index] = await run(job, stopping.signal);
        if (stopAfter?.(results[index]!)) stopping.abort();
      } catch (error) {
        errors.push(error);
        if (stopAfter) stopping.abort();
      } finally {
        free += need;
        wake();
      }
    })());
  }
  await Promise.all(running);
  if (errors.length) throw errors[0];
  return results;
}

/** Each part's longer device time, in milliseconds, from a full gate's part-times.json. */
export function partTimes(text: string | undefined, parts: readonly { name: string }[] = PHONE_PARTS): Map<string, number> | undefined {
  if (text === undefined) return undefined;
  try {
    const read = JSON.parse(text) as Record<string, Record<string, number>>;
    const times = new Map<string, number>();
    for (const { name } of parts) {
      const devices = Object.values(read[name] ?? {}).filter((ms) => typeof ms === "number" && ms > 0);
      if (devices.length) times.set(name, Math.max(...devices));
    }
    return times.size ? times : undefined;
  } catch {
    return undefined;
  }
}

/** INF-4241 piece 3: the recorded part times the gate shares a device's parts out by, a full gate's part-times.json
 * copied whole (INF-4241 piece 8's run of every part on every device, two simulators at once, with a later part's
 * time kept from the file before it). A part it lacks starts first, so a new part never
 * ends a lane late; replace the file with a newer full gate's part-times.json when the parts' times move. */
export const PHONE_PART_TIMES = "scripts/phone-part-times.json";

/** INF-4308 (the captain's "Build on two at once"): what one simulated device and its share of the gate need of the
 * Mac. On a compute Mac VM of 10 processor cores and 9 GiB, two simulated devices at once passed every part with each
 * part 1.3 times slower and 0.4 GB of swap at most; three swapped 1.5 GB, kept the processors 87% busy and failed a
 * test from the load. INF-2101's 4-core VMs could not hold two. */
export const PHONE_LANE_NEEDS = { processors: 4, memoryMib: 4096 } as const;

/** How many simulated devices a Mac runs at once: one for each 4 processor cores and each 4 GiB of memory, whichever
 * gives fewer, and always one. Today's 10-core, 9 GiB compute VMs run two. */
export function phoneLanes({ processors, memoryBytes }: { processors: number; memoryBytes: number }): number {
  return Math.max(1, Math.min(Math.floor(processors / PHONE_LANE_NEEDS.processors),
    Math.floor(memoryBytes / (PHONE_LANE_NEEDS.memoryMib * 1024 ** 2))));
}

/** INF-6407: how many of `phoneLanes`' places one simulated device of each kind takes; a kind not named takes one.
 * On the compute Mac VMs of 10 processor cores and 9 GiB, an iPhone Duo beside another simulated device slowed both
 * 1.8 to 3.6 times: its fold part's test took 257 to 275 seconds there against 145 alone on a rented Mac's VM, and
 * the iPad's panels part ran past its three-minute allowance twice, once while the Duo started beside it and once
 * beside its fold part (runs 45254330437, 45259662836 and 45253503275). An iPad beside an iPhone ran its parts 1.06
 * to 1.25 times their time alone there, and two iPhones 1.3 times (INF-4308). */
export const PHONE_DEVICE_PLACES: Readonly<Record<string, number>> = { duo: 2 };

/** One lane: a simulated device of `device`, the `number`th of that device's lanes, counted from one. */
export type PhoneLane<Device extends string = PhoneDevice> = { device: Device; number: number };
/** Which lanes a gate runs, in start order, each device's jobs (by their index in the plan) in the order its lanes
 * take them, a free lane of the device taking the next one, and how many places each device's lanes take. */
export type PhoneLanePlan<Device extends string = PhoneDevice> = {
  lanes: PhoneLane<Device>[];
  queues: Map<Device, number[]>;
  places: Map<Device, number>;
};

/** INF-4241 piece 3: shares `simulators` places among the devices of a gate's jobs, then each device's jobs among
 * its lanes. Every device gets one lane, as before, and each lane takes its device's places (`PHONE_DEVICE_PLACES`).
 * A device whose lane takes every place runs alone, after the devices that share the Mac (INF-6407); among those, each
 * further lane goes to the device with the most recorded work per lane, never more lanes than it has jobs. With fewer
 * places than devices the devices run one after another, the device with the most work per lane first. A device
 * with one lane keeps its jobs in plan order. A device with several shares them longest first by the recorded times,
 * a part with no time first, a later round only after every earlier one, so the lanes end close together. */
export function phoneLanePlan<Job extends { device: string; part: string; round?: number }>(jobs: readonly Job[], simulators: number,
  times: ReadonlyMap<string, number> = new Map()): PhoneLanePlan<Job["device"]> {
  if (!Number.isInteger(simulators) || simulators < 1) throw new Error("Run at least one simulator at a time");
  const devices = [...new Set(jobs.map((job) => job.device))] as Job["device"][];
  const indices = (device: Job["device"]) => jobs.flatMap((job, index) => job.device === device ? [index] : []);
  const longest = Math.max(0, ...times.values());
  const work = new Map(devices.map((device) => [device,
    indices(device).reduce((sum, index) => sum + (times.get(jobs[index]!.part) ?? longest), 0)]));
  const places = new Map(devices.map((device) => [device, Math.min(PHONE_DEVICE_PLACES[device] ?? 1, simulators)]));
  const sharing = devices.filter((device) => places.get(device)! < simulators);
  const counts = new Map(devices.map((device) => [device, 1]));
  for (let extra = simulators - sharing.reduce((sum, device) => sum + places.get(device)!, 0); extra > 0;) {
    const open = sharing.filter((device) => counts.get(device)! < indices(device).length && places.get(device)! <= extra);
    if (!open.length) break;
    const next = open.reduce((best, device) => work.get(device)! / counts.get(device)! > work.get(best)! / counts.get(best)! ? device : best);
    counts.set(next, counts.get(next)! + 1);
    extra -= places.get(next)!;
  }
  const recorded = (index: number) => times.get(jobs[index]!.part) ?? Number.POSITIVE_INFINITY;
  // INF-4241 piece 8: the device with the most recorded work per lane starts first, so with fewer simulators than
  // devices its long lane never waits behind a short one (the every-device gate on a two-lane Mac).
  const perLane = (device: Job["device"]) => work.get(device)! / counts.get(device)!;
  const byWork = (a: Job["device"], b: Job["device"]) => perLane(b) - perLane(a);
  const starts = [...sharing.toSorted(byWork), ...devices.filter((device) => !sharing.includes(device)).toSorted(byWork)];
  return {
    lanes: starts.flatMap((device) => Array.from({ length: counts.get(device)! }, (_, at) => ({ device, number: at + 1 }))),
    queues: new Map(devices.map((device) => [device, counts.get(device) === 1 ? indices(device)
      : indices(device).sort((a, b) => (jobs[a]!.round ?? 1) - (jobs[b]!.round ?? 1) || recorded(b) - recorded(a))])),
    places,
  };
}

/** The lanes that start together at the gate's start, in plan order: each takes its device's places until the next
 * lane's places no longer fit in `simulators`. */
export function firstPhoneLanes<Device extends string>(plan: PhoneLanePlan<Device>, simulators: number): PhoneLane<Device>[] {
  let free = simulators;
  const first: PhoneLane<Device>[] = [];
  for (const lane of plan.lanes) {
    const need = Math.min(plan.places.get(lane.device) ?? 1, simulators);
    if (need > free) break;
    free -= need;
    first.push(lane);
  }
  return first;
}

export type DeviceLane<Job extends { device: string }, Device, Result> = {
  /** Starts the lane's device once, before its first job; a failure here leaves the lane's jobs to the device's other
   * lanes, or unstarted when it has none. `lane` counts the device's lanes from one. */
  open: (device: Job["device"], stopping: AbortSignal, lane: number) => Promise<Device>;
  /** Runs one job on the opened device; the signal aborts when the lanes stop. */
  run: (job: Job, opened: Device, stopping: AbortSignal) => Promise<Result>;
  /** Ends the device after the lane's last job, whether it ran, failed or stopped. */
  close: (opened: Device) => Promise<void>;
};

/** INF-1438 (the captain's "Start each simulated device once per phone check, not once per part"): runs
 * the jobs of each device on the lanes `plan` gives it, one lane a device unless it says more, each lane on one
 * device it opens once and closes at its end, as many lanes at a time as `slots` places hold, each taking its
 * device's places in `plan` (INF-6407). A lane takes its device's next job when it is free (INF-4241 piece 3). One
 * job's failure stops none of the others, unless `stopAfter` holds for a job's result or a job throws: then no lane
 * starts another job and the signal each running job holds aborts, while every opened device still closes. A job
 * that never started leaves its result undefined, and the first error is thrown once every lane has ended. */
export async function runDeviceLanes<Job extends { device: string }, Device, Result>(jobs: Job[], slots: number,
  lane: DeviceLane<Job, Device, Result>, stopAfter?: (result: Result) => boolean,
  plan: PhoneLanePlan<Job["device"]> = phoneLanePlan(jobs.map((job) => ({ ...job, part: "" })), 1)): Promise<(Result | undefined)[]> {
  const queues = new Map([...plan.queues].map(([device, queue]) => [device, [...queue]]));
  const results: (Result | undefined)[] = jobs.map(() => undefined);
  const errors: unknown[] = [];
  const stopping = new AbortController();
  const failed = (error: unknown) => {
    errors.push(error);
    if (stopAfter) stopping.abort();
  };
  await runSideBySide(plan.lanes, slots, async ({ device, number }) => {
    const queue = queues.get(device) ?? [];
    if (stopping.signal.aborted || !queue.length) return;
    let opened: Device;
    try { opened = await lane.open(device, stopping.signal, number); }
    catch (error) { return failed(error); }
    try {
      while (!stopping.signal.aborted) {
        const index = queue.shift();
        if (index === undefined) break;
        try {
          results[index] = await lane.run(jobs[index]!, opened, stopping.signal);
          if (stopAfter?.(results[index]!)) stopping.abort();
        } catch (error) { failed(error); }
      }
    } finally {
      await lane.close(opened).catch((error) => errors.push(error));
    }
  }, undefined, ({ device }) => plan.places.get(device) ?? 1);
  if (errors.length) throw errors[0];
  return results;
}
