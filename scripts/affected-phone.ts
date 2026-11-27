import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PHONE_MESSAGES_PATH } from "./generate-messages.ts";
import { PART_OWNERS, phoneFileOwners } from "./phone-part-owners.ts";
import {
  dealPhonePasses, devicePartNames, PHONE_DEVICES, PHONE_JOURNEY, PHONE_PART_TIMES, PHONE_PARTS, type PhoneDealtJob, type PhoneDevice,
  type PhoneJob, type PhonePassTimes, partDevices, partIdentifier, partTimes, phonePasses, phoneToolEntry,
} from "./phone-test-plan.ts";

export { partTimes };

// INF-79 / INF-136: the captain requested the native gate on phone/shared-contract PRs.
// Include the captain's approved gate setup inputs, not broad shared/core/package changes.
const INPUTS = [
  "ios/", "scripts/generate-phone-cards.ts", "scripts/generate-phone-contract.ts", "scripts/phone-contract-shapes.ts",
  ".github/workflows/phone.yml", "scripts/test-phone.ts", "tests/helpers/phoneHome.ts", "tests/helpers/phoneKeyboard.ts",
  "scripts/phone-checks.ts", "scripts/phone-failure-logs.ts", "scripts/phone-activity.ts", "scripts/phone-simulator.ts",
  // INF-1645: the one Xcode and iOS simulator every Mac's phone check uses.
  "scripts/phone-pin.json",
  // INF-1596: the sweep of earlier runs' simulators and scratch folders at the gate's start.
  "scripts/phone-leftovers.ts",
  // INF-5387 piece 1: the deadline of every command the gate runs.
  "scripts/phone-deadlines.ts",
  // INF-6039's plan, part 1: the build a check's first job shares with its other jobs, and the gate's check of it.
  "scripts/phone-build.ts",
  // INF-1066: native geometry generation and the scene journey's real home fixture.
  "scripts/generate-phone-scene.ts", "tests/helpers/phoneScene.ts", "scripts/phone-recording.ts",
  "tests/helpers/phoneLogs.ts", "tests/helpers/phoneStacks.ts", "tests/helpers/phoneWebContent.ts",
  // INF-1936 / INF-2185: edits to the runner's diagnostics must select their simulator consumer too.
  "scripts/phone-guest-observer.ts", "tests/helpers/phoneWebStacks.ts", "tests/helpers/phoneGuestLaunches.ts",
  "tests/helpers/phoneLauncherLog.ts", "tests/helpers/phoneLookupWait.ts", "tests/helpers/phoneProxyLaunches.ts",
  // INF-662: each device's own test home in the one build's test plan.
  "scripts/phone-test-plan.ts",
  // INF-1242: the rest of what the launcher loads on every part - the Photos wait, the failure timers and load clock,
  // the scratch folders, the module runner, the CI-mode and heavy-run guards and the Duo's hinge helper - and what it
  // reads: each part's recorded work, the hinge helper's source, the Face ID helper's source (INF-7013) and the library
  // photo a part chooses (test-phone.ts's LIBRARY_PHOTO). tests/phone-ci.test.ts holds every module the launcher loads
  // to this list.
  "tests/helpers/phoneKeyboardDiagnostics.ts", "scripts/phone-key-processes.ts",
  "tests/helpers/phonePhotos.ts", "tests/helpers/budgets.ts", "tests/helpers/loadClock.ts", "tests/helpers/scratchDirs.ts",
  "tests/helpers/runScratchFolders.ts", "scripts/moduleRunner.ts", "scripts/checks-mode.ts", "scripts/heavy-run-place.ts",
  "scripts/phone-hinge.ts", "scripts/phone-hinge.m", "scripts/phone-face-id.m", "scripts/phone-work.json",
  "release-notes/pictures/activity-settles-setting-runs-light.png",
  // INF-4241 piece 3: the recorded part times the gate shares a device's parts out by.
  "scripts/phone-part-times.json",
  // INF-2625: the phone check's test home answers the phone's crewmates and first mate through the journey stand-in,
  // its crew scripts, its models.json and the request readers it answers by.
  "tests/e2e/mockProvider.ts", "tests/e2e/crewScripts.ts", "tests/e2e/mockModels.ts", "tests/e2e/providerRequest.ts",
  // INF-2928 piece 3: the test home's Backlog row for a long press and a swipe, and the talk parts' task and its tags.
  "tests/helpers/phoneRowMoves.ts",
  // INF-1242: the test home's Google sign-in stand-in.
  "tests/helpers/phoneGoogle.ts",
  // INF-3563: the script the phone's Settings pages are built by, and the test home's accounts, rules and usage.
  "scripts/generate-phone-settings.ts", "tests/helpers/phoneSettings.ts",
  // INF-3830 piece 2: the test home's fixture panel and the controls the Panels part asks of it.
  "tests/helpers/phonePanels.ts", "tests/fixtures/phone-panels/phone-tally/", "tests/fixtures/phone-panels/phone-shy/",
  // INF-4207 piece 9: the test home's computer that keeps a copy, which the take-over part asks to take over.
  "tests/helpers/phoneTakeOver.ts",
  // INF-4794: the test home's stand-in push relay, which the push part's pushes pass through.
  "tests/helpers/phonePushRelay.ts",
  // INF-5265: the homes part's second computer, which the test home starts in a process of its own.
  "tests/helpers/phoneSecondHome.ts", "tests/helpers/phoneSecondHomeProcess.ts",
  // INF-5608's plan, piece 2: the cards-carried part's card and what reached the computer from its choice.
  "tests/helpers/phoneCarried.ts",
  // INF-6865: the cards-revised-scroll part's long card, revised in place.
  "tests/helpers/phoneRevisedCard.ts",
  // INF-6476: the test home's removal, which many parts start from and the weak-link part's removal check reads.
  "tests/helpers/phoneRemove.ts",
] as const;
// INF-827 (the captain's "skip changes to unused setup"): the device gates never run this
// chooser or scripts/phone-test-home.ts, so they are not inputs. The chooser runs before the
// gates and is checked on Linux by its own unit tests; the test home is for local work only.
// INF-524: the device gates' virtual Mac path, used only while PHONE_VIRTUAL_MAC switches it on.
const VIRTUAL_MAC = ["scripts/virtual-mac/phone.sh", "scripts/virtual-mac/phone-job.sh", "scripts/virtual-mac/vm.sh"] as const;

// INF-496: the phone and the computer come from the same pull request, so a new contract
// version number (a first-number change included) reaches the phone only as this one line.
// docs/contract.json alone is not an input; its other effects arrive as other lines here.
export const GENERATED_CONTRACT = "ios/Infinitary/InfinitaryKit/Sources/InfinitaryKit/PhoneContract.generated.swift";
const VERSION_LINE = /^[+-]\s*public static let version = /;

/** True when a zero-context diff of the generated file changes only its version line. */
export function versionOnly(diff: string | undefined): boolean {
  if (diff === undefined) return false;
  const changed = diff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line));
  return changed.length > 0 && changed.every((line) => VERSION_LINE.test(line));
}

const matches = (inputs: readonly string[], path: string) =>
  inputs.some((input) => input.endsWith("/") ? path.startsWith(input) : path === input);

export function phoneDecision(
  paths: readonly string[] | undefined,
  generatedDiff?: string,
  { virtualMac = false }: { virtualMac?: boolean } = {},
): { run: boolean; reasons: string[] } {
  if (!paths) return { run: true, reasons: ["The change could not be read; run the native gate."] };
  const inputs = virtualMac ? [...INPUTS, ...VIRTUAL_MAC] : INPUTS;
  const reasons = paths.filter((path) =>
    path === GENERATED_CONTRACT && versionOnly(generatedDiff) ? false : matches(inputs, path));
  return { run: reasons.length > 0, reasons };
}

// INF-3379 (the captain's "Let the generated contract and card words files reach only the parts that read the
// changed entries"): every part owns these two generated files, but a change to one reaches only the files that
// read what it changed, and so only those files' owners.
export const GENERATED_CARD_WORDS = "ios/Infinitary/InfinitaryApp/PhoneCardWords.generated.swift";
export const GENERATED_ENTRIES = [GENERATED_CONTRACT, GENERATED_CARD_WORDS] as const;

type GeneratedMember = { type: string; names: string[]; isCase: boolean; start: number; end: number };
type GeneratedType = { name: string; start: number; end: number; members: GeneratedMember[] };
const MEMBER = /^\s*(?:(?:public|private|fileprivate|internal|static|nonisolated|@\w+)\s+)*(let|var|func|case|init|subscript|struct|enum|class|typealias)\b\s*(.*)$/;

/** The generated file's top-level types and their members, each by its 1-based lines; undefined for any shape this
 * reader does not know, such as a nested type or a line outside every type. */
export function generatedMembers(source: string): GeneratedType[] | undefined {
  const lines = blankSwift(source).split("\n");
  const types: GeneratedType[] = [];
  let depth = 0;
  let type: GeneratedType | undefined;
  for (const [at, line] of lines.entries()) {
    const number = at + 1;
    if (depth === 0 && line.trim()) {
      const header = /^(?:public\s+|internal\s+)?(?:enum|struct)\s+([A-Za-z_]\w*)\b[^{]*\{\s*$/.exec(line);
      if (!header) return undefined;
      type = { name: header[1]!, start: number, end: number, members: [] };
      types.push(type);
    } else if (depth === 1 && line.trim() && line.trim() !== "}") {
      const member = MEMBER.exec(line);
      if (!member) return undefined;
      const isCase = member[1] === "case";
      const names = isCase
        ? member[2]!.split(",").map((each) => /^`?([A-Za-z_]\w*)`?/.exec(each.trim())?.[1]).filter((name): name is string => Boolean(name))
        : [/^`?([A-Za-z_]\w*)`?/.exec(member[2]!)?.[1] ?? member[1]!];
      type!.members.push({ type: type!.name, names, isCase, start: number, end: number });
    } else if (depth >= 1 && type?.members.length && line.trim()) type.members.at(-1)!.end = number;
    for (const char of line) depth += "{[(".includes(char) ? 1 : "}])".includes(char) ? -1 : 0;
    if (depth < 0) return undefined;
    if (depth === 0 && type && line.includes("}")) { type.end = number; type = undefined; }
  }
  return depth === 0 ? types : undefined;
}

/**
 * The parts a change to a generated file reaches: the owners of each Swift file that reads a changed entry, where a
 * changed static member is read by a file naming both its type and its name, and a changed case or type by a file
 * naming the type or one of its cases. `diff` is the file's zero-context diff and `after` the file as the change
 * leaves it; `sources` maps every other Swift file to its text. Undefined when the change cannot be placed, so every
 * part keeps the file: an unreadable diff, an unknown shape, a line outside every type, or a reader nobody owns.
 */
export function generatedReach(
  diff: string | undefined, after: string | undefined, sources: ReadonlyMap<string, string>,
  generated: string,
): string[] | undefined {
  const hunks = diff === undefined ? undefined : diffHunks(diff).get(generated);
  if (!hunks || after === undefined) return undefined;
  const sides = [
    { text: after, lines: hunks.flatMap((hunk) => Array.from({ length: hunk.added }, (_, at) => hunk.newStart + at)) },
    { text: before(after, hunks), lines: hunks.flatMap((hunk) => hunk.removed.map((_, at) => hunk.oldStart + at)) },
  ];
  const members = new Map<string, Set<string>>();
  const types = new Map<string, Set<string>>();
  for (const side of sides) {
    const read = generatedMembers(side.text);
    if (!read) return undefined;
    const code = blankSwift(side.text).split("\n");
    const raw = blankSwift(side.text, true).split("\n");
    const changed: GeneratedMember[] = [];
    const wholeType = (type: GeneratedType) => {
      const cases = types.get(type.name) ?? new Set<string>();
      for (const member of type.members) if (member.isCase) for (const name of member.names) cases.add(name);
      types.set(type.name, cases);
    };
    for (const line of side.lines) {
      if (!code[line - 1]?.trim()) continue;
      const type = read.find((each) => each.start <= line && each.end >= line);
      if (!type) return undefined;
      const member = type.members.find((each) => each.start <= line && each.end >= line);
      if (!member || member.isCase) wholeType(type);
      else changed.push(member);
    }
    // A member that reads a changed member of the generated file changes with it.
    for (let grew = true; grew;) {
      grew = false;
      for (const type of read) for (const member of type.members) {
        if (member.isCase || changed.includes(member)) continue;
        const text = raw.slice(member.start - 1, member.end).join("\n");
        if (changed.some((each) => (each.type === type.name || new RegExp(`\\b${each.type}\\b`).test(text)) &&
          each.names.some((name) => new RegExp(`\\b${name}\\b`).test(text)))) { changed.push(member); grew = true; }
      }
    }
    for (const member of changed) {
      const names = members.get(member.type) ?? new Set<string>();
      for (const name of member.names) names.add(name);
      members.set(member.type, names);
    }
  }
  const reached = new Set<string>();
  for (const [path, text] of sources) {
    if (path === generated) continue;
    const code = blankSwift(text, true);
    const word = (name: string) => new RegExp(`\\b${name}\\b`).test(code);
    const reads = [...members].some(([type, names]) => word(type) && [...names].some(word)) ||
      [...types].some(([type, cases]) => word(type) || [...cases].some((name) => new RegExp(`\\.${name}\\b`).test(code)));
    if (!reads) continue;
    // The UI tests drive the app from outside and cannot read its types; an app-hosted test runs where partReach
    // runs its file.
    if (path.startsWith(UI_TESTS)) continue;
    const owners = hostedTest(path) ? appTestParts(path) : phoneFileOwners(path);
    if (!owners.length) return undefined;
    for (const part of owners) reached.add(part);
  }
  return [...reached];
}

// INF-6223's answer (the captain's "Run only the phone parts that read a changed word"): every part owns the phone's
// generated messages and their string files, and the card and panels parts own the card and panel hosts, which
// bundle the whole catalog; a change to them reaches only the parts whose code calls a changed message: the owners of each Swift
// file naming it through `PhoneMessages`, and a host's owners when the host's own code calls it. A message the phone
// words only from a saved fact, by its name at run time, reaches no part here; the release check runs every part.
const PHONE_STRINGS = /^ios\/Infinitary\/InfinitaryKit\/Sources\/InfinitaryKit\/Resources\/[\w-]+\.lproj\/Localizable\.strings(dict)?$/;
// The hosts scripts/generate-phone-cards.ts bundles.
const PHONE_HOSTS = /^ios\/Infinitary\/InfinitaryApp\/CardAssets\/\w+Host\.generated\.js$/;
export const phoneWordsFile = (path: string) =>
  path === PHONE_MESSAGES_PATH || PHONE_STRINGS.test(path) || PHONE_HOSTS.test(path);

/** A host's top-level declarations by their 1-based lines, a statement outside any named "". */
function hostDeclarations(lines: readonly string[]) {
  const declarations: { name: string; start: number; end: number }[] = [];
  for (const [at, line] of lines.entries()) {
    const name = /^ {2}(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/.exec(line)?.[1];
    if (name) declarations.push({ name, start: at + 1, end: at + 1 });
    // A closing line ends the declaration before it; any other top-level statement belongs to none.
    else if (declarations.length && /^ {2}[}\])]/.test(line)) declarations.at(-1)!.end = at + 1;
    else if (/^ {0,2}\S/.test(line)) declarations.push({ name: "", start: at + 1, end: at + 1 });
  }
  return declarations;
}
const CATALOG_TABLES = ["MESSAGES", "MESSAGE_FILLS"];

/**
 * The message each changed line of a phone words file words, "" for a blank or comment line, undefined for a line
 * naming no message.
 */
function wordsLines(path: string, text: string, changed: readonly number[]): (string | undefined)[] {
  const lines = text.split("\n");
  const host = PHONE_HOSTS.test(path) ? hostDeclarations(lines) : [];
  const catalog = new Set(host.filter((each) => each.name === "MESSAGES")
    .flatMap((each) => lines.slice(each.start, each.end).map((line) => /^ {4}([\w$]+),?$/.exec(line)?.[1] ?? "")));
  return changed.map((line) => {
    const at = lines[line - 1]?.trim() ?? "";
    if (!at || /^(\/\/|\/\*|<!--)/.test(at)) return "";
    if (path === PHONE_MESSAGES_PATH)
      return /^public static func `?(\w+)`?\(/.exec(at)?.[1] ?? /^"(\w+)": /.exec(at)?.[1];
    if (PHONE_HOSTS.test(path)) {
      // A host's line is in a message's function, or in a table's entry for one.
      const around = host.findLast((each) => each.start <= line);
      if (!around || around.end < line) return undefined;
      if (CATALOG_TABLES.includes(around.name)) return /^"?([\w$]+)"?(?:[,:]|$)/.exec(at)?.[1];
      return catalog.has(around.name) ? around.name : undefined;
    }
    if (!path.endsWith("dict")) return /^"(\w+)" = /.exec(at)?.[1];
    // A plural message is the dictionary after its name, two spaces in.
    for (let each = line; each >= 1; each--) {
      const name = /^ {2}<key>(\w+)<\/key>$/.exec(lines[each - 1]!)?.[1];
      if (name) return name;
      if (/^\S/.test(lines[each - 1]!)) return undefined;
    }
    return undefined;
  });
}

/** Whether a host's own code calls one of the messages: a name outside its function and the catalog's tables. */
function hostCalls(text: string, messages: ReadonlySet<string>): boolean {
  const lines = text.split("\n");
  const skip = hostDeclarations(lines).filter((each) => messages.has(each.name) || CATALOG_TABLES.includes(each.name));
  const word = new RegExp(`(?<![\\w$])(?:${[...messages].map((name) => name.replaceAll("$", "\\$")).join("|")})(?![\\w$])`);
  return lines.some((line, at) => word.test(line) && !skip.some((each) => each.start <= at + 1 && each.end >= at + 1));
}

/**
 * The parts a change to a phone words file reaches: the owners of each Swift file calling a changed message through
 * `PhoneMessages`, and for a host, its owners when its own code calls one. `diff` is the file's zero-context diff,
 * `after` the file as the change leaves it and `sources` every other Swift file's text. Undefined when the change
 * cannot be placed, so every part keeps the file: an unreadable diff, a line naming no message, or a reader nobody
 * owns.
 */
export function wordsReach(
  diff: string | undefined, after: string | undefined, sources: ReadonlyMap<string, string>, path: string,
): string[] | undefined {
  const hunks = diff === undefined ? undefined : diffHunks(diff).get(path);
  if (!hunks || after === undefined) return undefined;
  const sides = [
    { text: after, lines: hunks.flatMap((hunk) => Array.from({ length: hunk.added }, (_, at) => hunk.newStart + at)) },
    { text: before(after, hunks), lines: hunks.flatMap((hunk) => hunk.removed.map((_, at) => hunk.oldStart + at)) },
  ];
  const messages = new Set<string>();
  for (const side of sides) for (const message of wordsLines(path, side.text, side.lines)) {
    if (message === undefined) return undefined;
    if (message) messages.add(message);
  }
  if (!messages.size) return [];
  if (PHONE_HOSTS.test(path)) {
    if (!sides.some((side) => hostCalls(side.text, messages))) return [];
    const owners = phoneFileOwners(path);
    return owners.length ? owners : undefined;
  }
  const reached = new Set<string>();
  const calls = new RegExp(`\\bPhoneMessages\\s*\\.\\s*\`?(?:${[...messages].join("|")})\`?(?!\\w)`);
  for (const [file, text] of sources) {
    if (file === PHONE_MESSAGES_PATH || file.startsWith(UI_TESTS) || !calls.test(blankSwift(text))) continue;
    const owners = hostedTest(file) ? appTestParts(file) : phoneFileOwners(file);
    if (!owners.length) return undefined;
    for (const part of owners) reached.add(part);
  }
  return [...reached];
}

// INF-827 (the captain's approved INF-828 plan): which of the phone journey's parts a change
// reaches, and how close. 0: it edits test code the part runs; 1: a file the part owns;
// 2: any other phone input, which reaches every part.
export const UI_TESTS = "ios/Infinitary/InfinitaryUITests/";
// The app-hosted tests run in the rest part, beside the tests no other part names, except a class a part
// names as its `suite` (INF-2989's weak-link), which runs in that part alone.
export const APP_TESTS = "ios/Infinitary/InfinitaryTests/";
// INF-4326: a part on the Mac (`mac`) names a test target of the phone's package and its class as its `suite`.
export const MAC_TESTS = "ios/Infinitary/InfinitaryKit/Tests/";
// INF-2125 direction C: a part's owned files are its family's, the part name before its first hyphen,
// so each short part split from join, talk or cards owns what that part owned.
export const partFamily = (part: string) => part.split("-")[0]!;
export { PART_OWNERS } from "./phone-part-owners.ts";

/** Swift source with comments blanked and string contents replaced, keeping every line break. */
export function blankSwift(source: string, keepStrings = false, onInvalid?: () => void): string {
  let out = "";
  let at = 0;
  const keep = (text: string, fill: string) => text.replace(/[^\n]/g, fill);
  while (at < source.length) {
    const rest = source.slice(at, at + 3);
    if (rest.startsWith("//")) {
      const end = source.indexOf("\n", at);
      const stop = end < 0 ? source.length : end;
      out += keep(source.slice(at, stop), " ");
      at = stop;
    } else if (rest.startsWith("/*")) {
      // Swift block comments nest.
      let depth = 0;
      let index = at;
      do {
        if (source.startsWith("/*", index)) { depth++; index += 2; }
        else if (source.startsWith("*/", index)) { depth--; index += 2; }
        else index++;
      } while (depth > 0 && index < source.length);
      if (depth > 0) onInvalid?.();
      out += keep(source.slice(at, index), " ");
      at = index;
    } else if (/^#*"/.test(source.slice(at, at + 8))) {
      const hashes = /^#*/.exec(source.slice(at))![0];
      const multi = source.startsWith('"""', at + hashes.length);
      const open = hashes + (multi ? '"""' : '"');
      const close = (multi ? '"""' : '"') + hashes;
      let index = at + open.length;
      while (index < source.length && !source.startsWith(close, index)) {
        if (!multi && source[index] === "\n") break;
        index += source[index] === "\\" && !hashes ? 2 : 1;
      }
      if (!source.startsWith(close, index)) onInvalid?.();
      const stop = Math.min(source.length, index + close.length);
      out += keepStrings ? source.slice(at, stop) : open + keep(source.slice(at + open.length, index), "x") + source.slice(index, stop);
      at = stop;
    } else {
      out += source[at];
      at++;
    }
  }
  return out;
}

export type SwiftFunction = { name: string; start: number; end: number; body: string; kind?: "type" | "constant" };

/** Each function with a body, by its 1-based first and last lines; undefined when the braces do not balance. */
export function swiftFunctions(source: string): SwiftFunction[] | undefined {
  const code = blankSwift(source);
  const lineAt = (index: number) => code.slice(0, index).split("\n").length;
  const functions: SwiftFunction[] = [];
  // INF-3379: a computed property (`var name: Type {`, no initializer) has a body like a function's, so an edit
  // inside one is placed on the parts that read its name rather than read as outside any declaration.
  const declarations = /\bfunc\s+([A-Za-z_]\w*)|(?<!\b(?:for|case|if|guard|while)\s+)(?<![\w.])var\s+([A-Za-z_]\w*)\s*:[^={}\n]+(?=\{)/g;
  for (const declared of code.matchAll(declarations)) {
    let index = declared.index + declared[0].length;
    let parens = 0;
    while (index < code.length && !(parens === 0 && (code[index] === "{" || code[index] === "}"))) {
      if (code[index] === "(") parens++;
      if (code[index] === ")") parens--;
      index++;
    }
    // A requirement with no body ends at its type's closing brace.
    if (code[index] !== "{") continue;
    let depth = 0;
    do {
      if (code[index] === "{") depth++;
      if (code[index] === "}") depth--;
      index++;
    } while (depth > 0 && index < code.length);
    if (depth !== 0) return undefined;
    functions.push({ name: (declared[1] ?? declared[2])!, start: lineAt(declared.index), end: lineAt(index - 1), body: blankSwift(source.slice(declared.index, index), true) });
  }
  return functions;
}

/** INF-2257: a deliberately small declaration reader, not a Swift name resolver.
 * Only top-level value types and literal constants have a known lazy owner.
 * Everything else remains outside a declaration and therefore selects every part when edited.
 */
function swiftDeclarations(source: string): SwiftFunction[] | undefined {
  const functions = swiftFunctions(source);
  if (!functions) return undefined;
  let valid = true;
  const code = blankSwift(source, false, () => { valid = false; });
  if (!valid) return undefined;
  if (/^\s*#(?:if|elseif|else|endif)\b/m.test(code)) return undefined;
  const lines = code.split("\n");
  const raw = blankSwift(source, true).split("\n");
  const declarations = [...functions];
  const types: SwiftFunction[] = [];
  let depth = 0;
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]!;
    if (depth === 0) {
      const type = /^(?:private\s+|fileprivate\s+)?(?:struct|enum)\s+([A-Za-z_]\w*)\b[^{]*\{/.exec(line);
      const constant = /^(?:private\s+|fileprivate\s+)?let\s+([A-Za-z_]\w*)(?:\s*:\s*[\w.]+)?\s*=\s*(?:true|false|nil|-?\d+(?:\.\d+)?|#*"[^"\n]*"#*)\s*$/.exec(line);
      const match = type ?? constant;
      if (match && !lines[at - 1]?.trim().startsWith("@")) {
        let end = at;
        if (type) {
          let braces = 0;
          do {
            for (const char of lines[end] ?? "") braces += char === "{" ? 1 : char === "}" ? -1 : 0;
            end++;
          } while (braces > 0 && end < lines.length);
          if (braces !== 0) return undefined;
          end--;
        }
        const body = raw.slice(at, end + 1).join("\n");
        // Conditional compilation, attributes, interpolation and executable initializers
        // need more than this reader can prove. Keep their existing full-selection fallback.
        if (!/^[ \t]*[@#]/m.test(lines.slice(at, end + 1).join("\n")) &&
          !(constant && /\\#*\(/.test(body))) {
          const declaration: SwiftFunction = { name: match[1]!, start: at + 1, end: end + 1, body, kind: type ? "type" : "constant" };
          declarations.push(declaration);
          if (type) types.push(declaration);
        }
      }
    }
    for (const char of line) {
      depth += char === "{" ? 1 : char === "}" ? -1 : 0;
      if (depth < 0) return undefined;
    }
  }
  // A helper type owns its methods too; a common method name such as `read` is
  // not a free function shared with every other type declaring a `read` method.
  return depth === 0 ? declarations.filter((each) =>
    !types.some((type) => type !== each && type.start <= each.start && type.end >= each.end)) : undefined;
}

export type SwiftBlock = { kind: string; name: string; plain: boolean; start: number; end: number };

/** INF-3379: each type or extension body, by its 1-based opening and closing lines; `plain` marks an extension that
 * adds no conformance or condition, so its own lines change nothing but what it declares. */
export function swiftBlocks(source: string): SwiftBlock[] {
  const blocks: SwiftBlock[] = [];
  const open: { block?: SwiftBlock; depth: number }[] = [];
  let depth = 0;
  for (const [at, line] of blankSwift(source).split("\n").entries()) {
    const header = /\b(class|struct|enum|actor|protocol|extension)\s+([A-Za-z_][\w.]*)([^{]*)\{/.exec(line);
    const opens = header && !/^(?:func|var|let)$/.test(header[2]!) ? header.index + header[0].length - 1 : -1;
    for (const [index, char] of [...line].entries()) {
      if (char === "{") {
        depth++;
        const block = index === opens ? { kind: header![1]!, name: header![2]!, plain: header![1] === "extension" && !header![3]!.trim(), start: at + 1, end: at + 1 } : undefined;
        if (block) { blocks.push(block); open.push({ block, depth }); }
      } else if (char === "}") {
        if (open.at(-1)?.depth === depth) open.pop()!.block!.end = at + 1;
        depth--;
      }
    }
  }
  return blocks;
}

const SWIFT_KEYWORDS = new Set(("let var func class struct enum extension protocol actor import private fileprivate public " +
  "internal open final static override lazy weak unowned mutating nonmutating init deinit self Self super true false nil " +
  "return if else guard in for while repeat switch case default break continue where as is try throws rethrows async " +
  "await some any inout typealias associatedtype get set willSet didSet nonisolated isolated convenience required " +
  "dynamic optional indirect MainActor").split(" "));

export type Hunk = { oldStart: number; removed: string[]; newStart: number; added: number };

/** Each file's hunks in a zero-context diff, by the path it had: its new one, or its old one when removed. */
export function diffHunks(diff: string): Map<string, Hunk[]> {
  const files = new Map<string, Hunk[]>();
  let hunks: Hunk[] | undefined;
  let hunk: Hunk | undefined;
  let removedFrom = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) { hunks = undefined; hunk = undefined; continue; }
    if (!hunk && line.startsWith("--- ")) { removedFrom = line.slice(4).replace(/^a\//, ""); continue; }
    if (!hunk && line.startsWith("+++ ")) {
      const path = line.slice(4);
      hunks = [];
      files.set(path === "/dev/null" ? removedFrom : path.replace(/^b\//, ""), hunks);
      continue;
    }
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header && hunks) {
      // With no added lines, the new side names the line the removed ones followed.
      const added = header[3] === undefined ? 1 : Number(header[3]);
      hunk = { oldStart: Number(header[1]), removed: [], newStart: Number(header[2]) + (added === 0 ? 1 : 0), added };
      hunks.push(hunk);
      continue;
    }
    if (hunk && line.startsWith("-")) hunk.removed.push(line.slice(1));
  }
  return files;
}

/** The file as it stood before the change, from the file after it and its zero-context hunks. */
export function before(after: string | undefined, hunks: Hunk[]): string {
  const lines = after === undefined || after === "" ? [] : after.split("\n");
  for (const hunk of [...hunks].sort((a, b) => b.newStart - a.newStart))
    lines.splice(hunk.newStart - 1, hunk.added, ...hunk.removed);
  return lines.join("\n");
}

/** `toolTests` names the rest part's tool tests whose own code changed, which every pass of the part then runs. */
export type PartReach = { part: string; distance: 0 | 1 | 2; why: string; repeat?: boolean; repeatTests?: string[]; toolTests?: string[] };
/** A part table: each part's name and the journey test it runs, or the whole test class it names as its
 * `suite`, the last part running every test no other names. The gate's own is PHONE_PARTS; a recorded change
 * replays against the table of its own time. */
export type PartTable = readonly ({ name: string; test: string } | { name: string; suite: string; mac?: boolean })[];
/** The test file a part's `suite` class is declared in, which Xcode, or the package for a part on the Mac, names for
 * the class. */
const suiteFile = (part: PartTable[number]) => !("suite" in part) ? undefined
  : "mac" in part && part.mac ? `${MAC_TESTS}${part.suite}.swift` : `ios/Infinitary/${part.suite}.swift`;
/** Whether a test file runs where a part runs its file: an app-hosted test, or the class of a part on the Mac. */
export const hostedTest = (path: string, parts: PartTable = PHONE_PARTS) =>
  path.startsWith(APP_TESTS) || parts.some((part) => "mac" in part && part.mac && suiteFile(part) === path);
const names = (parts: PartTable) => parts.map((part) => part.name);
const EVERY = names(PHONE_PARTS);
const owners = (part: string) => PART_OWNERS[part] ?? Object.entries(PART_OWNERS)
  .filter(([name]) => partFamily(name) === part).flatMap(([, files]) => files);

const XCTEST_CLASS = /\bclass\s+(\w+)\s*:\s*XCTestCase\b/g;
/** The names of the XCTestCase classes the files declare. */
const testClasses = (files: Iterable<string>) => new Set([...files].flatMap((text) => [...blankSwift(text).matchAll(XCTEST_CLASS)].map((each) => each[1]!)));

/** The class XCTest runs a test function in, read from the class or extension around each function of that name in
 * `source`, when that names one of `classes`; none when the functions sit in no such class or in more than one. */
function testClass(source: string, name: string, classes: ReadonlySet<string>): string | undefined {
  const blocks = swiftBlocks(source);
  const found = new Set((swiftFunctions(source) ?? []).filter((fn) => fn.name === name).map((fn) => {
    const around = blocks.filter((block) => block.start <= fn.start && block.end >= fn.start).at(-1);
    return around && (around.kind === "class" || around.kind === "extension") && classes.has(around.name) ? around.name : undefined;
  }));
  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * The declarations each part runs, by name, from its test and identifier references. The rest
 * part also starts from every test no other part names.
 */
export function partFunctions(functions: SwiftFunction[], parts: PartTable = PHONE_PARTS): Map<string, Set<string>> {
  const names = new Set(functions.map((each) => each.name));
  const calls = new Map<string, Set<string>>();
  for (const each of functions) {
    const called = calls.get(each.name) ?? new Set<string>();
    for (const call of each.body.matchAll(/\b([A-Za-z_]\w*)\b/g))
      if (names.has(call[1]!)) called.add(call[1]!);
    calls.set(each.name, called);
  }
  const named = new Set<string>(parts.slice(0, -1).flatMap((part) => "test" in part ? [part.test] : []));
  const reached = new Map<string, Set<string>>();
  for (const part of parts) {
    // A part that runs an app-hosted class of its own runs no UI test code; a UI test class of its own is
    // read as running every UI test declaration, since this reader does not know which class a declaration is in.
    if (!("test" in part)) { reached.set(part.name, new Set(hostedTest(suiteFile(part)!, parts) ? [] : names)); continue; }
    const setup = [...names].filter((name) => /^(?:setUp|tearDown|testCase)/.test(name));
    const roots = [...setup, ...(part === parts.at(-1)
      ? [part.test, ...[...names].filter((name) => /^test/.test(name) && !named.has(name))]
      : [part.test])];
    const seen = new Set<string>(roots);
    const frontier = [...roots];
    while (frontier.length) for (const call of calls.get(frontier.pop()!) ?? []) {
      if (!seen.has(call)) { seen.add(call); frontier.push(call); }
    }
    reached.set(part.name, seen);
  }
  return reached;
}

/** The parts an app-hosted test file runs in: the part whose class it declares, any other test class in the rest
 * part, and anything else beside them, such as a shared helper, in every part that runs app-hosted tests. */
export function appTestParts(path: string, parts: PartTable = PHONE_PARTS): string[] {
  const own = parts.filter((part) => suiteFile(part) === path && hostedTest(path, parts)).map((part) => part.name);
  // A shared helper beside the app-hosted tests reaches the app-hosted classes, never a package target on the Mac.
  const suites = parts.filter((part) => suiteFile(part)?.startsWith(APP_TESTS));
  const rest = parts.at(-1)!.name;
  return own.length ? own : /Tests\.swift$/.test(path) ? [rest] : [rest, ...suites.map((part) => part.name)];
}

/**
 * How close the change is to each part. `testDiff` is the zero-context diff of the UI tests,
 * `testFiles` every UI test file the change leaves and `read` reads one as the change leaves it.
 * Added lines are read in the new version and removed ones in the old, each with its own references;
 * a file it cannot read or parse counts every part edited. `generated` maps a changed generated file to the parts
 * its changed entries reach (generatedReach), or to undefined when every part keeps it.
 */
export function partReach(
  reasons: readonly string[],
  testDiff: string | undefined,
  testFiles: readonly string[],
  read: (path: string) => string | undefined,
  parts: PartTable = PHONE_PARTS,
  generated: ReadonlyMap<string, readonly string[] | undefined> = new Map(),
): PartReach[] {
  const every = names(parts);
  const edited = new Map<string, Set<string>>(every.map((part) => [part, new Set()]));
  const repeats = new Set<string>();
  const repeatTests = new Map<string, Set<string>>();
  const broadRepeats = new Set<string>();
  // The rest part skips the phone check's own tool tests, so its passes run an edited one only by name, broad or not.
  const rest = parts.at(-1)!.name;
  const toolTests = new Set<string>();
  const repeat = (part: string, test?: string) => {
    repeats.add(part);
    if (test && part === rest && phoneToolEntry(test)) toolTests.add(test);
    if (!test) broadRepeats.add(part);
    else { const tests = repeatTests.get(part) ?? new Set<string>(); tests.add(test); repeatTests.set(part, tests); }
  };
  const everyPart = (why: string) => { for (const part of every) { edited.get(part)!.add(why); repeat(part); } };
  // A line nothing can place still selects every part, once, as a shared helper does.
  const everyPartOnce = (why: string) => { for (const part of every) edited.get(part)!.add(why); };
  const tests = reasons.filter((path) => path.startsWith(UI_TESTS));
  const changed = testDiff === undefined ? undefined : diffHunks(testDiff);
  if (tests.length && (!changed || tests.some((path) => !changed.has(path))))
    everyPart("the UI test change could not be read");
  else if (tests.length) {
    if (!testFiles.length) everyPart("the UI test dependencies could not be enumerated");
    const after = new Map<string, string>();
    for (const path of testFiles) {
      const text = read(path);
      if (text !== undefined) after.set(path, text);
      else everyPart(`${path} could not be read`);
    }
    const beforeFiles = new Map(after);
    for (const path of tests) {
      if (!after.has(path) && (testFiles.includes(path) || changed!.get(path)!.some((hunk) => hunk.added > 0))) everyPart(`${path} could not be read`);
      beforeFiles.set(path, before(after.get(path), changed!.get(path)!));
      if (!after.has(path)) after.set(path, "");
    }
    const parse = (files: Map<string, string>) => {
      const parsed = new Map([...files].map(([path, text]) => [path, swiftDeclarations(text)?.map((each) => ({ ...each, path }))] as const));
      if (![...parsed.values()].every(Boolean)) return undefined;
      const declarations = [...parsed.values()].flatMap((each) => each!);
      const reached = partFunctions(declarations, parts);
      // INF-3379: overloads of one function name share its callers, since partFunctions joins every declaration
      // of a name; any other name declared twice stays ambiguous.
      const kinds = new Map<string, Set<string>>();
      for (const each of declarations) kinds.set(each.name, (kinds.get(each.name) ?? new Set()).add(each.kind ?? "function"));
      const ambiguous = new Set([...kinds].filter(([name, kind]) =>
        declarations.filter((each) => each.name === name).length > 1 && (kind.size > 1 || !kind.has("function"))).map(([name]) => name));
      // A reference outside any known declaration may run at global setup, not just in a test.
      const global = new Set<string>();
      for (const [path, text] of files) for (const [at, line] of blankSwift(text, true).split("\n").entries()) {
        if (parsed.get(path)!.some((each) => each.start <= at + 1 && each.end >= at + 1)) continue;
        for (const token of line.matchAll(/\b[A-Za-z_]\w*\b/g)) global.add(token[0]);
      }
      const globalReach = new Set(global);
      const frontier = [...global];
      while (frontier.length) {
        const name = frontier.pop()!;
        for (const each of declarations.filter((each) => each.name === name))
          for (const token of each.body.matchAll(/\b[A-Za-z_]\w*\b/g))
            if (!globalReach.has(token[0])) { globalReach.add(token[0]); frontier.push(token[0]); }
      }
      const blocks = new Map([...files].map(([path, text]) => [path, swiftBlocks(text)] as const));
      return { files, parsed, declarations, reached, ambiguous, globalReach, blocks };
    };
    type Side = NonNullable<ReturnType<typeof parse>>;
    type Declaration = Side["declarations"][number];
    const place = (side: Side, each: Declaration) => {
      if (side.ambiguous.has(each.name) || side.globalReach.has(each.name))
        everyPart(`${each.name}: ambiguous name or global setup reference`);
      for (const part of every)
        if (side.reached.get(part)!.has(each.name)) {
          edited.get(part)!.add(each.name);
          // Shared helpers get ordinary coverage; a helper exclusive to one test belongs to that test.
          if (/^test[A-Z_]/.test(each.name)) {
            // Old names still select coverage, but cannot be run after a test is renamed or removed.
            const current = after.get(each.path) ?? "";
            if (!swiftFunctions(current)?.some((fn) => fn.name === each.name)) continue;
            const table = parts.find((entry) => "test" in entry && entry.test === each.name);
            const owner = table ? undefined : testClass(current, each.name, testClasses(after.values()));
            repeat(part, table ? `${PHONE_JOURNEY}/${each.name}` : owner ? `InfinitaryUITests/${owner}/${each.name}` : undefined);
          } else if (every.filter((name) => side.reached.get(name)!.has(each.name)).length === 1) {
            const table = parts.find((entry) => entry.name === part);
            repeat(part, table && "test" in table ? partIdentifier(table) : undefined);
          }
        }
    };
    // INF-3379: a line outside every declaration the reader knows - an import, a type or extension's opening or
    // closing line, a stored property - is placed on the declarations it can change, never on every part three
    // times. An import changes only its own file; a plain extension's lines change only what it declares; a type's
    // header changes its members, its extensions and every declaration naming it; any other line changes its
    // enclosing block's declarations and every declaration naming one of its words.
    const outsideLine = (side: Side, path: string, line: number): Declaration[] => {
      const code = blankSwift(side.files.get(path)!).split("\n");
      const own = side.parsed.get(path)!;
      // An attribute on its own line belongs to the declaration after it.
      let at = line;
      while (at < code.length && /^\s*@\w+(?:\([^)]*\))?\s*$/.test(code[at - 1]!)) at++;
      const declared = own.filter((each) => each.start <= at && each.end >= at);
      if (declared.length) return declared;
      const text = code[at - 1] ?? "";
      if (/^\s*(?:@\w+\s+)*import\s/.test(text)) return own;
      const blocks = side.blocks.get(path)!;
      const inside = (block: SwiftBlock, file = path) => side.parsed.get(file)!
        .filter((each) => each.start >= block.start && each.end <= block.end);
      const named = (word: string) => {
        const pattern = new RegExp(`\\b${word}\\b`);
        return [
          ...side.declarations.filter((each) => pattern.test(each.body)),
          ...[...side.blocks].flatMap(([file, each]) => each
            .filter((block) => block.kind === "extension" && block.name.split(".")[0] === word)
            .flatMap((block) => inside(block, file))),
        ];
      };
      const header = blocks.find((block) => block.start === at);
      if (header) return header.plain ? inside(header) : [...inside(header), ...named(header.name.split(".")[0]!)];
      const enclosing = blocks.filter((block) => block.start < at && block.end >= at).at(-1);
      if (enclosing && enclosing.end === at && /^[\s})\];,]*$/.test(text)) return inside(enclosing);
      const words = [...new Set([...text.matchAll(/\b[A-Za-z_]\w*\b/g)].map((each) => each[0]))]
        .filter((word) => !SWIFT_KEYWORDS.has(word));
      return [...new Set([...(enclosing ? inside(enclosing) : own), ...words.flatMap(named)])];
    };
    const sides = [parse(after), parse(beforeFiles)] as const;
    if (!sides[0] || !sides[1]) everyPart("a UI test file could not be parsed");
    else for (const path of tests) for (const [side, lines] of [
      [sides[0], changed!.get(path)!.flatMap((hunk) => Array.from({ length: hunk.added }, (_, at) => hunk.newStart + at))],
      [sides[1], changed!.get(path)!.flatMap((hunk) => hunk.removed.map((_, at) => hunk.oldStart + at))],
    ] as const) {
      const code = blankSwift(side.files.get(path)!).split("\n");
      const functions = side.parsed.get(path)!;
      for (const line of lines) {
        // A blank or comment-only line counts for nothing.
        if (!code[line - 1]?.trim()) continue;
        const around = functions.filter((each) => each.start <= line && each.end >= line);
        const placed = around.length ? around : outsideLine(side, path, line);
        if (!placed.length) everyPartOnce(`${path} line ${line}${side === sides[1] ? " (removed)" : ""}, outside any declaration it could place`);
        for (const each of placed) place(side, each);
      }
    }
  }
  const appTests = reasons.filter((path) => hostedTest(path, parts));
  for (const path of appTests) {
    for (const part of appTestParts(path, parts)) {
      edited.get(part)!.add(`the app-hosted tests (${path})`);
      const hunks = changed?.get(path);
      const text = read(path);
      const sides = text === undefined || !hunks ? undefined : [
        { text, lines: hunks.flatMap((hunk) => Array.from({ length: hunk.added }, (_, at) => hunk.newStart + at)) },
        { text: before(text, hunks), lines: hunks.flatMap((hunk) => hunk.removed.map((_, at) => hunk.oldStart + at)) },
      ];
      if (!sides) repeat(part);
      else for (const side of sides) {
        const functions = swiftFunctions(side.text);
        if (!functions) repeat(part);
        else for (const fn of functions.filter((fn) => /^test[A-Z_]/.test(fn.name) &&
          side.lines.some((line) => fn.start <= line && line <= fn.end))) {
          if (!swiftFunctions(text!)?.some((current) => current.name === fn.name)) continue;
          const owner = testClass(text!, fn.name, testClasses([text!]));
          // The XCTest target: the app's hosted tests, or the package target a part on the Mac names.
          const target = path.startsWith(APP_TESTS) ? "InfinitaryTests" : path.slice(MAC_TESTS.length).split("/")[0];
          repeat(part, owner ? `${target}/${owner}/${fn.name}` : undefined);
        }
      }
    }
  }
  return every.map((part): PartReach => {
    const own = [...edited.get(part)!];
    if (own.length) return { part, distance: 0, repeat: repeats.has(part),
      ...(repeatTests.has(part) && !broadRepeats.has(part) ? { repeatTests: [...repeatTests.get(part)!].sort() } : {}),
      ...(part === rest && toolTests.size ? { toolTests: [...toolTests].sort() } : {}), why: `edits test code it runs: ${own.join(", ")}` };
    // A generated file's change reaches the owners of what reads its changed entries, when they could be read.
    const owned = reasons.filter((path) => generated.get(path)?.includes(part) ?? matches(owners(part), path));
    if (owned.length) return { part, distance: 1, why: `edits a file it owns: ${owned.join(", ")}` };
    return { part, distance: 2, why: `another phone input changed: ${reasons.join(", ")}` };
  });
}

// INF-827: the captain chose six minutes, the same as the Mac journeys' (scripts/journey-budget.ts).
export const PHONE_BUDGET_MS = 6 * 60 * 1000;
export const LEFT_FOR = "the nightly check of main";

export type Placement = PartReach & { minutes?: number; kept: boolean; reason: string };

/**
 * The closest part runs, every part whose test code changed runs even past the budget, and
 * others join while the kept minutes stay within it; ties go to the shorter part. With no
 * readable times, or with the virtual Mac switch on, every part the change reaches runs.
 */
export function placeParts(
  reach: PartReach[],
  times: Map<string, number> | undefined,
  { virtualMac = false }: { virtualMac?: boolean } = {},
): Placement[] {
  const minutes = (part: string) => times?.get(part) === undefined ? undefined : times.get(part)! / 60_000;
  if (!times || virtualMac) {
    const reason = virtualMac ? "the virtual Mac switch runs every part" : "no part times could be read, so every part it reaches runs";
    return reach.map((each) => ({ ...each, minutes: minutes(each.part), kept: true, reason }));
  }
  // A part with no time yet costs the slowest measured one.
  const cost = (part: string) => times.get(part) ?? Math.max(...times.values());
  const ordered = [...reach].sort((a, b) => a.distance - b.distance || cost(a.part) - cost(b.part));
  let kept = 0;
  return ordered.map((each, index): Placement => {
    const placed = { ...each, minutes: cost(each.part) / 60_000 };
    if (index === 0 || each.distance === 0) {
      kept += cost(each.part);
      return { ...placed, kept: true, reason: each.distance === 0 ? "its test code changed" : "the closest part" };
    }
    if (kept + cost(each.part) <= PHONE_BUDGET_MS) {
      kept += cost(each.part);
      return { ...placed, kept: true, reason: "fits in the 6-minute budget" };
    }
    return { ...placed, kept: false, reason: `over the 6-minute budget; left for ${LEFT_FOR}` };
  });
}

/** Requested coverage keeps every reached part. Harness-only changes get one short smoke part;
 * unknown production ownership remains conservative (and the ownership check refuses it). */
export function requestedParts(reasons: readonly string[], reach: PartReach[]): PartReach[] {
  const unknown = reasons.some((path) => path.startsWith("ios/") &&
    !path.startsWith(UI_TESTS) && !hostedTest(path) && !phoneFileOwners(path).length);
  if (unknown) return reach;
  const selected = reach.filter((each) => each.distance < 2);
  if (selected.length || !reasons.length) return selected;
  return reach.filter((each) => each.part === "join-read" || (each.part === "join" && !reach.some((part) => part.part === "join-read")));
}

/** INF-2259: ordinary proof is round one, and each kept part whose test code changed takes two more
 * passes on the iPhone in the same request. INF-2811: a proper subset repeats its edited parts too, since a
 * computer in CI mode cannot run a local phone check; `full` still says the selection covers every live part. */
export function phoneRepeatPlan(parts: readonly string[], reach: readonly PartReach[]): {
  full: boolean; repeatParts: string[];
} {
  const full = EVERY.every((part) => parts.includes(part));
  return { full, repeatParts: EVERY.filter((part) => parts.includes(part) && reach.some((each) => each.part === part && (each.repeat ?? each.distance === 0))) };
}

/** INF-2582, as INF-4241 amends it: on an affected request, a kept part the change only reaches runs on the
 * iPhone, and a part whose test code changed, or a change that could not be read, runs on every device its row of
 * PHONE_PARTS names (INF-4241 piece 6). Beside them, a change to the phone app's screens runs each other device's
 * short pass (`appScreenEdits`, `deviceParts`). The release check runs every part on each device it names. */
export function iphoneOnlyParts(parts: readonly string[], reach: readonly PartReach[]): string[] {
  return parts.filter((part) => !reach.some((each) => each.part === part && each.distance === 0));
}

/** The phone app's own folder: the screens its hand-written Swift files draw. */
export const APP_SCREENS = "ios/Infinitary/InfinitaryApp/";

/** INF-4241 piece 9 (the captain's "The middle rule: today's rule, plus the short Duo and iPad passes when the change
 * edits the phone app's screens"): the hand-written Swift files a change edits in the phone app's own folder. A
 * regenerated file (`.generated.swift`, or any file not in Swift) and translated words do not count. */
export function appScreenEdits(paths: readonly string[]): string[] {
  return paths.filter((path) => path.startsWith(APP_SCREENS) && path.endsWith(".swift") && !path.endsWith(".generated.swift"));
}

/** INF-2970's fix 1: the parts a device's own job runs beside the iPhone's: every kept one the iPhone does not run
 * alone that names the device in PHONE_PARTS (INF-4241 piece 6), and with `screens`, a change that edits the phone
 * app's screens, the device's whole short pass, every part its row names, whether the change reaches it or not
 * (INF-4241 piece 9). With none, phone.yml's job for it ends before its gate. */
export function deviceParts(
  device: Exclude<PhoneDevice, "iphone">, parts: readonly string[], iphoneOnly: readonly string[], screens = false,
): string[] {
  if (screens) return devicePartNames(device);
  return parts.filter((part) => !iphoneOnly.includes(part) && partDevices(part).includes(device));
}
export const ipadParts = (parts: readonly string[], iphoneOnly: readonly string[], screens = false) =>
  deviceParts("ipad", parts, iphoneOnly, screens);

/** The matrix value of phone.yml's one job that checks every device from one build (INF-4241 piece 8). */
export const EVERY_DEVICE = "every";

/** A manual request's devices, chosen on Linux. A request of every part on every device runs as one job of
 * every device from one build, as the phone release's call does (INF-4241 piece 8); a narrower request keeps a job
 * a device, so each takes its own phone Mac at once (INF-2970's fix 1). `screens` is an affected request whose change
 * edits the phone app's screens, which adds each other device's short pass (INF-4241 piece 9); named parts never do. */
export function requestDevicePlan(parts: readonly string[], reach: readonly PartReach[], {
  explicit = false, device = "", screens = false,
}: { explicit?: boolean; device?: string; screens?: boolean } = {}): { iphoneOnly: string[]; devices: string[] } {
  if (device && !PHONE_DEVICES.includes(device as never)) throw new Error(`Unknown phone device: ${device}`);
  const iphoneOnly = explicit ? [] : iphoneOnlyParts(parts, reach);
  if (!device && !iphoneOnly.length && EVERY.every((part) => parts.includes(part))) return { iphoneOnly, devices: [EVERY_DEVICE] };
  const devices = PHONE_DEVICES.filter((name) => (!device || device === name)
    && (name === "iphone" ? parts.length > 0 : deviceParts(name, parts, iphoneOnly, screens && !explicit).length > 0));
  return { iphoneOnly, devices: [...devices].sort() };
}

/** What the chooser hands phone.yml's jobs for a manual request: today's devices, the kept parts, the parts the iPhone
 * runs alone, each other device's parts, the edited parts' further passes with their named tests, the edited tool tests
 * each pass of a kept part runs, whether the selection is complete, and whether the request named its parts. */
export type RequestSelection = {
  devices: readonly string[]; kept: readonly string[]; iphoneOnly: readonly string[]; ipadParts: readonly string[];
  duoParts: readonly string[]; repeats: readonly string[]; repeatTests: Record<string, readonly string[]>;
  toolTests?: Record<string, readonly string[]>; full: boolean; named: boolean;
};

/** A manual request's selection from its kept parts and how far the change reaches each: `explicit` for a request that
 * did not choose its parts from the change, `named` for one that named them, `device` for one that names its device and
 * `screens` for a change to the phone app's screens. */
export function chooseRequest(kept: readonly string[], reach: readonly PartReach[], {
  explicit = false, named = false, device = "", screens = false,
}: { explicit?: boolean; named?: boolean; device?: string; screens?: boolean } = {}): RequestSelection {
  const repeats = phoneRepeatPlan(kept, reach);
  const { iphoneOnly, devices } = requestDevicePlan(kept, reach, { explicit, device, screens });
  return {
    devices, kept, iphoneOnly, ipadParts: ipadParts(kept, iphoneOnly, screens), duoParts: deviceParts("duo", kept, iphoneOnly, screens),
    repeats: repeats.repeatParts, full: repeats.full, named,
    repeatTests: Object.fromEntries(reach.filter((each) => each.repeatTests?.length).map((each) => [each.part, each.repeatTests!])),
    toolTests: Object.fromEntries(reach.filter((each) => each.toolTests?.length && kept.includes(each.part)).map((each) => [each.part, each.toolTests!])),
  };
}

/**
 * INF-5387's plan, piece 2: a manual request's passes, exactly the ones its jobs ran before the request was dealt into
 * jobs, when phone.yml ran one job for each of `devices` and each job's gate built its passes from what the chooser
 * named. A device job's list was the kept parts, or its own parts for the iPad's and the Duo's, of which the iPhone ran
 * its iPhone-only parts alone; a complete selection with no iPhone-only part ran every part instead. A request that named
 * its parts read none of the chooser's further passes or completeness, so it ran no further pass, and it runs no edited
 * tool test by name either. The gate (`scripts/test-phone.ts`) then built each job's passes with `phonePasses`, the job of
 * every device from every device. `devices` names only devices with parts, as a device job with none ended before its gate.
 */
export function requestPasses(selection: RequestSelection): PhoneJob[] {
  const repeats = selection.named ? [] : selection.repeats;
  const full = !selection.named && selection.full;
  return selection.devices.flatMap((device) => {
    const devices: PhoneDevice[] = device === EVERY_DEVICE ? [...PHONE_DEVICES] : [device as PhoneDevice];
    const list = device === "ipad" ? selection.ipadParts : device === "duo" ? selection.duoParts : selection.kept;
    const alone = device === "ipad" || device === "duo" ? [] : selection.iphoneOnly;
    const every = full && !selection.iphoneOnly.length;
    return phonePasses(devices, {
      parts: every ? PHONE_PARTS.map((part) => part.name) : list.filter((part) => !alone.includes(part)),
      iphoneOnly: every ? undefined : list.filter((part) => alone.includes(part)),
      repeats, repeatTests: selection.repeatTests, toolTests: selection.named ? {} : selection.toolTests ?? {},
    });
  });
}

/** One of phone.yml's dealt jobs, as the chooser's `jobs` output names it: its key, its check's name and its passes. */
export type RequestJob = { key: string; label: string; passes: PhoneJob[] };

/** INF-5387's plan, piece 2: a manual request's passes dealt into jobs of at most the job budget's recorded minutes. */
export function requestJobs(selection: RequestSelection, times: PhonePassTimes): RequestJob[] {
  const dealt = dealPhonePasses(requestPasses(selection), times);
  return dealt.map((job) => ({ key: `job-${job.number}`, label: dealtJobLabel(job, dealt.length), passes: job.passes }));
}

/** Whether a request's first failed pass ends its other passes and jobs: a complete selection or one with edited-part
 * passes; a request that named its parts never stopped early. */
export const requestStopsEarly = (selection: RequestSelection) =>
  !selection.named && (selection.full || selection.repeats.length > 0);

export function dealtJobLabel(job: PhoneDealtJob, of: number): string {
  const names: Record<PhoneDevice, string> = { ipad: "iPad", duo: "iPhone Duo", iphone: "iPhone" };
  const devices = PHONE_DEVICES.filter((device) => job.passes.some((pass) => pass.device === device));
  return `job ${job.number} of ${of}: ${devices.map((device) => names[device]).join(", ")}`;
}

/**
 * INF-6223: the commit a request's named base reads. The check's clone holds the project's branches only as their
 * `origin/` copies, so a branch named by its name, such as `main`, reads from `origin/main`. A base neither reads is
 * refused with the reason, since comparing with it would fail and count every part on every device.
 */
export function readableBase(
  base: string, git: (args: string[]) => string,
): { base: string } | { refused: string } {
  const commit = (ref: string) => {
    try { return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim() !== ""; } catch { return false; }
  };
  if (commit(base)) return { base };
  const name = base.replace(/^refs\/heads\//, "");
  if (name && commit(`origin/${name}`)) return { base: `origin/${name}` };
  return {
    refused: `The phone base ${base} names no commit or branch in the check's copy of the project; send a branch name such as main, a full commit id, or no base to compare with main.`,
  };
}

/**
 * INF-3379 (the captain's "compute the base from the branch's merge point with main and ignore an older base"): a
 * request's base older than the branch's merge point with main would count main's own changes since that base as
 * the branch's edits, so the comparison starts at the merge point instead. A base at or past the merge point, such
 * as a stacked branch's, stands, as does any base when main or the merge point cannot be read.
 */
export function requestBase(
  base: string, head: string, git: (args: string[]) => string, main = "origin/main",
): { base: string; ignored?: string } {
  try {
    const point = git(["merge-base", main, head]).trim();
    const from = git(["merge-base", base, head]).trim();
    if (!point || !from || from === point) return { base };
    try { git(["merge-base", "--is-ancestor", from, point]); } catch { return { base }; }
    return { base: point, ignored: base };
  } catch {
    return { base };
  }
}

/**
 * Each file's edit in a change, from its zero-context diff read with `--full-index --no-renames`: the lines it removes
 * and adds, without hunk positions, which move when the base under the change moves, and a changed binary file by
 * the file it leaves.
 */
export function fileEdits(diff: string): Map<string, string> {
  const edits = new Map<string, string>();
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const lines = section.split("\n");
    const start = lines.findIndex((line) => line.startsWith("@@"));
    const header = start < 0 ? lines : lines.slice(0, start);
    const removed = header.find((line) => line.startsWith("--- "))?.slice(4);
    const added = header.find((line) => line.startsWith("+++ "))?.slice(4);
    const path = added && added !== "/dev/null" ? added.replace(/^b\//, "")
      : removed && removed !== "/dev/null" ? removed.replace(/^a\//, "") : /^a\/(.*) b\/(.*)$/.exec(lines[0]!)?.[2];
    if (!path) continue;
    // A mode change, a binary file or an empty file has no lines; the file it leaves names its edit.
    const left = /^index [0-9a-f]+\.\.([0-9a-f]+)/m.exec(header.join("\n"))?.[1] ?? "none";
    const kind = header.filter((line) => /^(new|deleted) file mode|^old mode|^new mode|^Binary files/.test(line));
    const body = start < 0 ? [] : lines.slice(start).filter((line) => /^[+-]/.test(line));
    edits.set(path, [...kind, ...(body.length ? [] : [`left ${left}`]), ...body].join("\n"));
  }
  return edits;
}

/**
 * INF-4071 (the captain's "Only the change's own edits"): the files whose edit differs between the change as it stood
 * at its last passing version and the change now, each read from its own merge point. A file whose edit is the same
 * counts nothing, even when bringing the branch up to date moved main's lines around it, and a file the change no
 * longer edits counts, since its version now is not the one that passed.
 */
export function ownEdits(since: string, now: string): string[] {
  const before = fileEdits(since);
  const after = fileEdits(now);
  return [...new Set([...before.keys(), ...after.keys()])].sort()
    .filter((path) => before.get(path) !== after.get(path));
}

function main(): void {
  const { values } = parseArgs({ options: {
    base: { type: "string", default: "origin/main" },
    head: { type: "string", default: "HEAD" },
    // INF-4071: the version whose affected request last passed; the change's own edits since it choose the parts.
    since: { type: "string" },
    // The newest passing on-request check of main's part-times.json.
    times: { type: "string" },
    placement: { type: "string" },
    request: { type: "boolean", default: false },
    // Explicit ordinary coverage, including an empty string for every live part.
    coverage: { type: "string" },
    device: { type: "string" },
  } });
  const root = fileURLToPath(new URL("..", import.meta.url));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const virtualMac = Boolean(process.env.PHONE_VIRTUAL_MAC);
  const readable = readableBase(values.base, git);
  if ("refused" in readable) {
    console.error(readable.refused);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Native phone gate\n\n${readable.refused}\n`);
    process.exitCode = 1;
    return;
  }
  const base = requestBase(readable.base, values.head, git);
  if (base.ignored) console.error(`Phone base ${values.base} is behind this branch's merge point with main; comparing with ${base.base} instead.`);
  const range = `${base.base}...${values.head}`;
  let paths: string[] | undefined;
  try {
    paths = git(["diff", "--name-only", "-z", range, "--"]).split("\0").filter(Boolean);
  } catch { /* An unreadable comparison must not silently omit the gate. */ }
  // INF-4071: after a pass, only the files the change's own edits since that version reach count; the others keep
  // the earlier pass as their proof. A last pass that cannot be read leaves the whole change counted.
  let since: { commit: string; files: string[] } | undefined;
  if (values.since && paths) {
    try {
      const edit = (from: string, to: string) => git(["diff", "-U0", "--full-index", "--no-renames", `${from}...${to}`, "--"]);
      const files = ownEdits(edit(requestBase(readable.base, values.since, git).base, values.since), edit(base.base, values.head));
      since = { commit: values.since, files };
      paths = files;
    } catch {
      console.error(`Phone last pass ${values.since} could not be read; comparing the whole change with ${base.base}.`);
    }
  }
  // The test files the comparison counts, so a narrowed comparison reads no other test file's edits.
  const macTests = PHONE_PARTS.flatMap((part) => "mac" in part && part.mac ? [suiteFile(part)!] : []);
  const testSpec = since ? since.files.filter((path) => path.startsWith(UI_TESTS) || hostedTest(path)) : [UI_TESTS, APP_TESTS, ...macTests];
  let generatedDiff: string | undefined;
  if (paths?.includes(GENERATED_CONTRACT)) {
    try {
      generatedDiff = git(["diff", "-U0", range, "--", GENERATED_CONTRACT]);
    } catch { /* An unreadable file comparison selects the gate. */ }
  }
  const decision = phoneDecision(paths, generatedDiff, { virtualMac });
  const readFile = (path: string) => { try { return readFileSync(path, "utf8"); } catch { return undefined; } };
  let placement: Placement[] = [];
  if (decision.run) {
    let testDiff: string | undefined;
    try {
      testDiff = testSpec.length ? git(["diff", "-U0", "--no-renames", range, "--", ...testSpec]) : "";
    } catch { /* Counted as every part edited. */ }
    const generated = new Map<string, string[] | undefined>();
    const changedGenerated = decision.reasons.filter((path) =>
      (GENERATED_ENTRIES as readonly string[]).includes(path) || phoneWordsFile(path));
    if (changedGenerated.length) {
      const sources = new Map<string, string>();
      try {
        for (const path of git(["ls-files", "-z", "--", "ios/"]).split("\0").filter((each) => each.endsWith(".swift"))) {
          const text = readFile(join(root, path));
          if (text !== undefined) sources.set(path, text);
        }
      } catch { /* With no sources read, each generated file keeps every part. */ }
      for (const path of changedGenerated) {
        let diff: string | undefined;
        try { diff = git(["diff", "-U0", "--no-renames", range, "--", path]); } catch { /* Every part keeps it. */ }
        const reach = phoneWordsFile(path) ? wordsReach : generatedReach;
        generated.set(path, sources.size ? reach(diff, readFile(join(root, path)), sources, path) : undefined);
      }
    }
    // The working tree is the change's head.
    const read = (path: string) => readFile(join(root, path));
    let testFiles: string[] = [];
    try {
      testFiles = readdirSync(join(root, UI_TESTS)).filter((name) => name.endsWith(".swift")).map((name) => UI_TESTS + name);
    } catch { /* No UI tests left: an edited one counts every part. */ }
    // An unreadable comparison counts every part edited.
    const reach = paths ? partReach(decision.reasons, testDiff, testFiles, read, PHONE_PARTS, generated)
      : names(PHONE_PARTS).map((part): PartReach => ({ part, distance: 0, why: "the change could not be read" }));
    placement = values.request
      ? (values.request && paths && !virtualMac ? requestedParts(decision.reasons, reach) : reach)
        .map((each) => ({ ...each, kept: true, reason: "requested affected parts" }))
      : placeParts(reach, partTimes(values.times ? readFile(values.times) : undefined), { virtualMac });
  }
  let kept = placement.filter((each) => each.kept).map((each) => each.part);
  if (values.coverage !== undefined) {
    const named = values.coverage.split(/\s+/).filter(Boolean);
    for (const part of named) if (!EVERY.includes(part)) throw new Error(`Unknown phone part: ${part}`);
    kept = named.length ? EVERY.filter((part) => named.includes(part)) : [...EVERY];
  }
  const repeats = phoneRepeatPlan(kept, placement);
  const explicit = !values.request || values.coverage !== undefined;
  // INF-4241 piece 9: an affected request whose change edits the phone app's screens adds the short Duo and iPad
  // passes; a request that keeps no part runs nothing anywhere.
  const screens = explicit || !kept.length ? [] : appScreenEdits(paths ?? []);
  const selection = chooseRequest(kept, placement, {
    explicit, named: values.coverage !== undefined && values.coverage !== "", device: values.device, screens: screens.length > 0,
  });
  const { iphoneOnly, devices } = selection;
  console.log(`devices=${JSON.stringify(devices)}`);
  console.log(`full=${selection.full}`);
  console.log(`repeat_parts=${selection.repeats.join(" ")}`);
  console.log(`repeat_tests=${JSON.stringify(selection.repeatTests)}`);
  console.log(`iphone_parts=${iphoneOnly.join(" ")}`);
  console.log(`ipad_parts=${selection.ipadParts.join(" ")}`);
  console.log(`duo_parts=${selection.duoParts.join(" ")}`);
  const run = values.coverage === undefined ? decision.run : kept.length > 0;
  console.log(`run=${run}`);
  console.log(`parts=${kept.join(" ")}`);
  // INF-5387's plan, piece 2: the request's passes dealt into jobs, one phone Mac each (`phone.yml`'s matrix).
  const passTimes = JSON.parse(readFileSync(join(root, PHONE_PART_TIMES), "utf8")) as PhonePassTimes;
  const jobs = run ? requestJobs(selection, passTimes) : [];
  console.log(`jobs=${JSON.stringify(jobs)}`);
  // A request that stops at its first failed pass stops its other jobs too.
  console.log(`stop_early=${requestStopsEarly(selection)}`);
  if (values.placement) writeFileSync(values.placement, `${JSON.stringify({ run, base: base.base, ...(base.ignored ? { ignoredBase: base.ignored } : {}), ...(since ? { since: since.commit, ownEdits: since.files } : {}), inputs: decision.reasons, parts: placement, coverage: kept, iphoneOnly, screens, repeats }, null, 2)}\n`);
  const row = (each: Placement) =>
    `- ${each.kept ? "Runs" : "Left"}: ${each.part}, distance ${each.distance}, ${each.minutes === undefined ? "no time" : `${each.minutes.toFixed(1)} minutes`}: ${each.reason}; ${each.why}`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    ["### Native phone gate", "",
      ...(base.ignored ? [`The requested base ${base.ignored} is behind this branch's merge point with main, so the change is read from ${base.base}.`, ""] : []),
      ...(since ? [`Only the change's own edits since its last pass at ${since.commit} count; the earlier pass stays the proof for every other part. Edited since: ${since.files.join(", ") || "nothing"}.`, ""] : []),
      ...(decision.run ? decision.reasons.map((reason) => `- ${reason}`) : ["No phone input the gate uses changed beyond the contract version number."]),
      "", `Ordinary coverage: ${kept.join(" ") || "none"}; complete live selection: ${repeats.full}.`,
      `On the iPhone only: ${iphoneOnly.join(" ") || "none"}.`,
      ...(explicit || !kept.length ? [] : [screens.length
        ? `The change edits the phone app's screens (${screens.join(", ")}), so the iPad and the iPhone Duo run their short passes.`
        : "The change edits none of the phone app's screens, so the iPad and the iPhone Duo run only the parts whose test code changed."]),
      `On the iPad: ${selection.ipadParts.join(" ") || "none"}.`,
      `On the iPhone Duo: ${selection.duoParts.join(" ") || "none"}.`,
      `Two additional passes on the iPhone (the iPad and the Duo run each of their own parts once): ${repeats.repeatParts.join(" ") || "none"}.`,
      ...Object.entries(selection.named ? {} : selection.toolTests ?? {}).map(([part, tests]) => `Edited tool tests every ${part} pass runs: ${tests.join(", ")}.`),
      "", ...(jobs.length ? ["#### Jobs", "", ...jobs.map((job) => `- ${job.label}: ${job.passes.map((pass) => `${pass.part}${pass.round > 1 ? ` round ${pass.round}` : ""} (${pass.device})`).join(", ")}`), ""] : []), ...(placement.length ? ["#### Parts", "", ...placement.map(row), ""] : [])].join("\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
