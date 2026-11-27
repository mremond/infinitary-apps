import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { keepPhoneDiagnostic } from "../../scripts/phone-checks.ts";

import { budgetTimer, waitCap } from "./budgets.ts";
import { logTime } from "./phonePhotos.ts";

export type PhoneChord = { key: string; modifiers: string[] };
type Registration = { pid: number; token: string; keys: Set<string>; timestamp: string };
export type PhoneKeyWitness = Omit<Registration, "keys"> & PhoneChord;
const signature = (chord: PhoneChord) => `${[...chord.modifiers].sort().join("|")}:${chord.key}`;

/** INF-355: an app-side keyCommands array is not the event router's acknowledgement. */
export class PhoneKeyRegistrations {
  private registrations = new Map<string, Registration>();
  private listeners = new Set<() => void>();
  private failure: Error | undefined;

  receive(record: { processImagePath?: string; eventMessage?: string; timestamp?: string }) {
    if (basename(record.processImagePath ?? "") !== "backboardd") return;
    const message = record.eventMessage ?? "";
    const header =
      /^new key command registrations for pid:(\d+) environment: keyboardFocus; token: (0x[\dA-Fa-f]+); keyCommands:/.exec(
        message,
      );
    if (!header?.[1] || !header[2]) return;
    const keys = new Set<string>();
    // ndjson retains a literal Return inside the quoted key; compact logs print it as \^M.
    // A carriage return must not make the whole modifier group's match disappear.
    for (const line of message.split("\n")) {
      const group = /^\s+([a-z|]*): \((.*)\),?$/s.exec(line);
      if (group?.[1] === undefined || group[2] === undefined) continue;
      const modifiers = group[1] ? group[1].split("|") : [];
      for (const value of group[2].match(/"(?:\\.|[^"\\])*"|\([^)]*\)|[^,\s]+/g) ?? []) {
        let key = value;
        if (value === String.raw`"\^M"` || value === '"\r"') key = "\r";
        else if (value === String.raw`"\^I"` || value === String.raw`"\134t"` || value === '"\t"')
          key = "\t";
        else if (value.startsWith("(")) {
          // BackBoard's HID spellings, not XCTest's opaque key constants.
          const arrows: Record<string, string> = {
            "(50:leftArrow)": "leftArrow",
            "(4F:rightArrow)": "rightArrow",
            "(52:upArrow)": "upArrow",
            "(51:downArrow)": "downArrow",
          };
          const arrow = arrows[value];
          if (!arrow) continue;
          key = arrow;
        } else if (value.startsWith('"')) {
          try {
            key = JSON.parse(value);
          } catch {
            continue;
          }
        }
        keys.add(signature({ key, modifiers }));
      }
    }
    const pid = Number(header[1]);
    const token = header[2].toLowerCase();
    // An empty replacement removes readiness; a former command list is never a fallback.
    this.registrations.set(`${pid}:${token}`, {
      pid,
      token,
      keys,
      timestamp: record.timestamp ?? "",
    });
    for (const notify of this.listeners) notify();
  }

  wait(pid: number, chord: PhoneChord): Promise<PhoneKeyWitness> {
    return new Promise((resolve, reject) => {
      const finish = () => {
        deadline.cancel();
        this.listeners.delete(check);
      };
      const check = () => {
        if (this.failure) {
          finish();
          reject(this.failure);
          return;
        }
        const registration = [...this.registrations.values()].find(
          (entry) => entry.pid === pid && entry.keys.has(signature(chord)),
        );
        if (registration) {
          finish();
          resolve({ pid, token: registration.token, timestamp: registration.timestamp, ...chord });
        }
      };
      // A failure deadline, not a delay before sending: only an observed acknowledgement resolves.
      const deadline = budgetTimer(() => {
        finish();
        reject(new Error(`No backboard registration for app ${pid}, ${signature(chord)}`));
      }, 30_000);
      this.listeners.add(check);
      check();
    });
  }

  close(error = new Error("The simulator keyboard observer stopped")) {
    this.failure ??= error;
    for (const notify of this.listeners) notify();
  }
}

export type PhoneTouchOutcome =
  | { outcome: "delivered" | "discarded"; sender: string; timestamp: string; proof: string }
  | { outcome: "unknown"; reason: string };
type TouchScreen = {
  sender: string;
  builtInTouchScreen: boolean;
  at: number;
  timestamp: string;
  line: string;
};
const touchSender = (hex: string) => hex.toLowerCase().replace(/^0+/, "");
const firstLine = (message: string) => message.split("\n", 1)[0] ?? "";

/** An ndjson record's own time ("2026-10-26 14:04:01.403588-0700"), in the runner's milliseconds. */
export function phoneLogMilliseconds(timestamp: string): number {
  const parts = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,3})?\d*([+-]\d{2})(\d{2})$/.exec(
    timestamp,
  );
  if (!parts) return Number.NaN;
  return Date.parse(`${parts[1]}T${parts[2]}${parts[3] ?? ""}${parts[4]}:${parts[5]}`);
}

/** The event router's line for a key press: who it sent the key to. Typed text arrives as a Unicode event, which no
 * key command answers, so only a keyboard event counts. */
const KEY_EVENT_PREFIX = "sequence starting with Keyboard event:";

export type PhoneKeyOutcome = {
  outcome: "delivered" | "discarded" | "unknown";
  pid: number;
  proof: string[];
};

/** A registration is readiness only. Read the destination of the actual single key press. */
export function phoneKeyOutcome(
  records: readonly { processImagePath?: string; eventMessage?: string; timestamp?: string }[],
  pid: number,
  since: number,
  until: number,
): PhoneKeyOutcome {
  const proof = records.flatMap((record) => {
    const at = phoneLogMilliseconds(record.timestamp ?? "");
    const line = record.eventMessage ?? "";
    return basename(record.processImagePath ?? "") === "backboardd" &&
      at >= since &&
      at <= until &&
      line.startsWith(KEY_EVENT_PREFIX)
      ? [line]
      : [];
  });
  const [line] = proof;
  if (!line || proof.length !== 1) return { outcome: "unknown", pid, proof };
  if (line.endsWith("; (no destinations)>")) return { outcome: "discarded", pid, proof };
  const targets = [...line.matchAll(/<keyboardFocus;[^<>]*; pid: (\d+);[^<>]*>/g)];
  return {
    outcome: targets.some((target) => Number(target[1]) === pid) ? "delivered" : "unknown",
    pid,
    proof,
  };
}

type KeyRecord = { processImagePath?: string; eventMessage?: string; timestamp?: string };

/**
 * INF-5183's key witness reads the owned subscription as well as the kept log. In phone run 44860960513 the
 * subscription held backboardd's line for the open Duo's Escape 5 ms after the press, while the simulator started a
 * dozen wallpaper extensions and ten seconds of kept-log reads passed without it, so the key read as unknown. A live
 * subscription can drop a line its simulator kept (INF-1799), so the kept log is still read inside the press's own
 * window, and the first source that names a key for the press answers. The two are never added together, since one
 * line read from both would count as two presses.
 */
export class PhoneKeyEvents {
  private records: KeyRecord[] = [];
  private listeners = new Set<() => void>();
  private readonly recover: (since: number, signal: AbortSignal) => Promise<object[]>;

  constructor(recover: (since: number, signal: AbortSignal) => Promise<object[]>) {
    this.recover = recover;
  }

  receive(record: KeyRecord) {
    if (basename(record.processImagePath ?? "") !== "backboardd") return;
    if (!(record.eventMessage ?? "").startsWith(KEY_EVENT_PREFIX)) return;
    this.records.push(record);
    for (const notify of this.listeners) notify();
  }

  /**
   * Where the key pressed between `since` and `until` went, answered by `deadline`: the subscription's lines for the
   * press, else the kept log's, read until a subscription line names the press or the window ends. A kept-log read
   * the window ended is unknown; one that fails for another reason still fails.
   */
  async outcome(
    pid: number,
    since: number,
    until: number,
    deadline: number,
  ): Promise<PhoneKeyOutcome> {
    const heard = () => phoneKeyOutcome(this.records, pid, since, until);
    const left = deadline - Date.now();
    if (heard().proof.length || left <= 0) return heard();
    const ended = AbortSignal.timeout(left);
    const answered = new AbortController();
    const check = () => {
      if (heard().proof.length) answered.abort();
    };
    this.listeners.add(check);
    try {
      const kept = await this.recover(since, AbortSignal.any([ended, answered.signal]));
      const live = heard();
      return live.proof.length ? live : phoneKeyOutcome(kept, pid, since, until);
    } catch (error) {
      if (!answered.signal.aborted && !ended.aborted) throw error;
      return heard();
    } finally {
      this.listeners.delete(check);
    }
  }
}

/**
 * INF-6074: a phone text field's caret taken back by the system's keyboard. UIKit logs its keyboard scene line as a text
 * field becomes the responder and asks for the keyboard; the keyboard arbiter's client in the app logs a failed
 * connection, then its order to resign that responder. In phone run 44991488174 the iPhone's task search took the caret
 * 1.6 seconds after Find a task, its keyboard took six seconds to come up on a starved simulator, and the arbiter's
 * connection failed and resigned the caret 16 seconds later, so the empty search closed before the journey looked.
 * Those three lines in that order, with no text field taking the caret after them, are the proof; anything else is
 * unknown, including a line the Mac reading the log could not compose.
 */
const CARET_FIELD_SUBSYSTEM = "com.apple.UIKit";
const CARET_FIELD_CATEGORY = "KeyboardSceneDelegate";
const CARET_FIELD_PREFIX = "Try reloading input views for responder:<SwiftUI.UIKitTextField:";
const KEYBOARD_ARBITER_SUBSYSTEM = "com.apple.KeyboardArbiter";
const KEYBOARD_ARBITER_CATEGORY = "Client";
const KEYBOARD_ARBITER_FAILED = "failedConnection";
const KEYBOARD_ARBITER_RESIGNED = "handleKeyboardChange: resignFirstResponder";

type CaretRecord = KeyRecord & { subsystem?: string; category?: string; processID?: number };

export type PhoneCaretOutcome = { outcome: "taken-back" | "unknown"; pid: number; proof: string[] };

/** Whether the system took back the caret a text field of app `pid` took at or after `since`. */
export function phoneCaretOutcome(
  records: readonly CaretRecord[],
  pid: number,
  since: number,
): PhoneCaretOutcome {
  const lines = records
    .flatMap((record) => {
      if (basename(record.processImagePath ?? "") !== PHONE_APP_PROCESS || record.processID !== pid)
        return [];
      const at = phoneLogMilliseconds(record.timestamp ?? "");
      if (!(at >= since)) return [];
      const message = firstLine(record.eventMessage ?? "");
      const arbiter =
        record.subsystem === KEYBOARD_ARBITER_SUBSYSTEM &&
        record.category === KEYBOARD_ARBITER_CATEGORY;
      const kind =
        record.subsystem === CARET_FIELD_SUBSYSTEM &&
        record.category === CARET_FIELD_CATEGORY &&
        message.startsWith(CARET_FIELD_PREFIX)
          ? "field"
          : arbiter && message === KEYBOARD_ARBITER_FAILED
            ? "failed"
            : arbiter && message === KEYBOARD_ARBITER_RESIGNED
              ? "resigned"
              : undefined;
      return kind ? [{ at, kind, line: `${record.timestamp} ${message}` }] : [];
    })
    .sort((a, b) => a.at - b.at);
  const field = lines.findIndex((each) => each.kind === "field");
  const failed = lines.findIndex(
    (each, index) => field >= 0 && index > field && each.kind === "failed",
  );
  const resigned = lines.findIndex(
    (each, index) => failed >= 0 && index > failed && each.kind === "resigned",
  );
  const again = lines.some(
    (each, index) => resigned >= 0 && index > resigned && each.kind === "field",
  );
  if (resigned < 0 || again)
    return { outcome: "unknown", pid, proof: lines.map((each) => each.line) };
  return {
    outcome: "taken-back",
    pid,
    proof: [field, failed, resigned].map((index) => lines[index]?.line ?? ""),
  };
}

/**
 * INF-6074: the caret witness reads the owned subscription first and the kept log only when the subscription holds
 * no proof, since a live subscription can drop a line its simulator kept (INF-1799). The journey asks only after its
 * check missed the field, so every line it needs was logged before the question.
 */
export class PhoneCaretChanges {
  private records: CaretRecord[] = [];
  private readonly recover: (since: number, signal: AbortSignal) => Promise<object[]>;

  constructor(recover: (since: number, signal: AbortSignal) => Promise<object[]>) {
    this.recover = recover;
  }

  receive(record: CaretRecord) {
    if (basename(record.processImagePath ?? "") !== PHONE_APP_PROCESS) return;
    const subsystem = record.subsystem;
    if (subsystem !== CARET_FIELD_SUBSYSTEM && subsystem !== KEYBOARD_ARBITER_SUBSYSTEM) return;
    this.records.push(record);
  }

  /** The subscription's answer for app `pid` since `since`, else the kept log's, read until `deadline`. */
  async outcome(pid: number, since: number, deadline: number): Promise<PhoneCaretOutcome> {
    const heard = phoneCaretOutcome(this.records, pid, since);
    const left = deadline - Date.now();
    if (heard.outcome === "taken-back" || left <= 0) return heard;
    const ended = AbortSignal.timeout(left);
    try {
      const kept = phoneCaretOutcome(
        (await this.recover(since, ended)) as CaretRecord[],
        pid,
        since,
      );
      return kept.outcome === "taken-back" ? kept : heard;
    } catch (error) {
      if (!ended.aborted) throw error;
      return heard;
    }
  }
}

/**
 * INF-1477 (the captain's choice "Allow a proven second tap"): XCTest gives each synthesized tap a virtual
 * touch screen of its own. When a starved simulator's backboardd cannot read that screen's properties in
 * time, it attaches the screen as an accessory, or as a bad usage pair when it read no usage page, and
 * ignores its touches, and XCTest confirms the tap after five seconds with no error. backboardd's own lines
 * are the witness: the first screen it attached once the tap began was delivered when it read a built-in
 * touch screen, or reported a contact on that screen touching, and discarded only once backboardd reports
 * ignoring its touches. Anything else, an accessory screen or a bad usage pair alone included, is not
 * proof and reads as unknown. iOS 27.0 reads every XCTest screen as an accessory and still delivers its
 * touches, naming the screen on each contact line, as the Mac mini's iPad join part showed on Xcode 27.1.
 * INF-1109 / INF-1801: duplicate registration can instead lose a tap's lift. Its initial screen is then
 * insufficient: only that sender's disappearance with a still-touching contact proves the tap unfinished.
 * Registration warnings suspend a delivery verdict, but never by themselves permit another tap.
 */
export class PhoneTouchOutcomes {
  private screens: TouchScreen[] = [];
  private ignored = new Map<string, string>();
  private touching = new Map<string, string>();
  private uncertain = new Map<string, number>();
  private unfinished = new Map<string, { at: number; proof: string }>();
  private listeners = new Set<() => void>();
  private failure: Error | undefined;
  private receivingKept = false;
  private readonly recover?: (since: number, signal: AbortSignal) => Promise<object[]>;

  constructor(recover?: (since: number, signal: AbortSignal) => Promise<object[]>) {
    this.recover = recover;
  }

  receive(record: { processImagePath?: string; eventMessage?: string; timestamp?: string }) {
    if (basename(record.processImagePath ?? "") !== "backboardd") return;
    const message = record.eventMessage ?? "";
    // What backboardd read the screen as, then where it sits. Phone run 40469903139 read one tap's screen as
    // "bad usage pair: (0x0 / 0x4); builtin" and ignored its touches, so only "touchScreen; builtin" takes them.
    const screen =
      /^init: <BKDirectTouchState: 0x[\dA-Fa-f]+; ([^;>]+); (builtin|accessory);[^>]*?\bsenderID: 0x([\dA-Fa-f]+);/.exec(
        message,
      );
    if (screen?.[1] && screen[2] && screen[3]) {
      const at = phoneLogMilliseconds(record.timestamp ?? "");
      if (Number.isNaN(at)) return;
      this.screens.push({
        sender: touchSender(screen[3]),
        builtInTouchScreen: screen[1] === "touchScreen" && screen[2] === "builtin",
        at,
        timestamp: record.timestamp ?? "",
        line: firstLine(message),
      });
    } else {
      const ignoring =
        /^ignoring digitizer event for display .*? from unsupported service: .*?\bid:0x([\dA-Fa-f]+)\b/.exec(
          message,
        );
      const touched = /^\[([\dA-Fa-f]+)\] contact \d+ presence: touching$/.exec(message);
      if (ignoring?.[1]) {
        const sender = touchSender(ignoring[1]);
        if (!this.ignored.has(sender)) this.ignored.set(sender, firstLine(message));
      } else if (touched?.[1]) {
        const sender = touchSender(touched[1]);
        if (!this.touching.has(sender)) this.touching.set(sender, message);
      } else {
        const at = phoneLogMilliseconds(record.timestamp ?? "");
        if (Number.isNaN(at)) return;
        const uncertain =
          /^we already have a service for senderID:([\dA-Fa-f]+)$/.exec(message) ??
          /^\*\*\* unknown digitizer <BKIOHIDService: .*?\bsenderID: 0x([\dA-Fa-f]+);/.exec(
            message,
          );
        // The whole state must be present. Empty disappearance is normal after a completed tap;
        // neither it nor a partial snapshot is permission to send the operation again.
        const vanished =
          /^cancel -- digitizer did disappear:<BKDirectTouchState: 0x[\dA-Fa-f]+;[^>]*?\bsenderID: 0x([\dA-Fa-f]+); contacts: contacts: \[(.*?)\]; destinations: \[.*\]; latentSystemGestureDestinations: \([^)]*\)>$/s.exec(
            message,
          );
        if (uncertain?.[1]) {
          this.uncertain.set(touchSender(uncertain[1]), at);
        } else if (
          vanished?.[1] &&
          /\bpathIndex: \d+; touchIdentifier: \d+; touching;/.test(vanished[2] ?? "")
        ) {
          this.unfinished.set(touchSender(vanished[1]), { at, proof: message });
        } else return;
      }
    }
    if (!this.receivingKept) for (const notify of this.listeners) notify();
  }

  /**
   * The outcome of the tap the runner began at `since`, on its own clock in milliseconds, answered by `until` on the
   * wall clock at the latest.
   */
  outcome(since: number, until = phoneTouchDeadline()): Promise<PhoneTouchOutcome> {
    return new Promise((resolve) => {
      let finished = false;
      let recoveryFailure = "";
      const recovery = new AbortController();
      const finish = (result: PhoneTouchOutcome) => {
        if (finished) return;
        finished = true;
        deadline.cancel();
        clearTimeout(wall);
        this.listeners.delete(check);
        recovery.abort();
        resolve(result);
      };
      const check = () => {
        if (finished) return;
        if (this.failure) {
          finish({ outcome: "unknown", reason: this.failure.message });
          return;
        }
        // The runner sends nothing else between the tap's start and its outcome, so the first is its own.
        const screen = this.screens
          .filter((each) => each.at >= since)
          .sort((a, b) => a.at - b.at)[0];
        if (!screen) return;
        const { sender, timestamp } = screen;
        const unfinished = this.unfinished.get(sender);
        if (unfinished && unfinished.at >= screen.at) {
          finish({ outcome: "discarded", sender, timestamp, proof: unfinished.proof });
          return;
        }
        // A duplicate registration can attach two states before losing the lift. Wait for proof,
        // not an arbitrary settling delay; without it the existing deadline returns unknown.
        const uncertain = this.uncertain.get(sender);
        if (uncertain !== undefined && uncertain >= since) return;
        if (screen.builtInTouchScreen) {
          finish({ outcome: "delivered", sender, timestamp, proof: screen.line });
          return;
        }
        const touched = this.touching.get(sender);
        if (touched) {
          finish({ outcome: "delivered", sender, timestamp, proof: touched });
          return;
        }
        const ignored = this.ignored.get(sender);
        if (ignored) finish({ outcome: "discarded", sender, timestamp, proof: ignored });
      };
      // Failure deadlines, not delays: without a witness the runner sends no second tap.
      const unknown = () =>
        finish({
          outcome: "unknown",
          reason: `No touch screen witness since ${new Date(since).toISOString()}${recoveryFailure}`,
        });
      const deadline = budgetTimer(unknown, 30_000);
      const wall = setTimeout(unknown, Math.max(0, until - Date.now()));
      this.listeners.add(check);
      check();
      // INF-1109 / INF-1917: a live subscription can omit a screen its simulator kept. Read once
      // inside the original outcome wait, alongside the live listener; a known verdict needs no read.
      const recover = this.recover;
      if (recover)
        void Promise.resolve()
          .then(async () => {
            if (finished || this.failure) return;
            const records = await recover(since, recovery.signal);
            if (finished || this.failure) return;
            // A recovered initializer alone must not publish delivery before a later warning or
            // unfinished contact in the same batch. All waiting requests see the complete batch.
            this.receivingKept = true;
            try {
              for (const record of records) this.receive(record);
            } finally {
              this.receivingKept = false;
            }
            for (const notify of this.listeners) notify();
          })
          .catch((error) => {
            // An unreadable kept log proves nothing. The live observer and original deadline remain.
            if (finished || this.failure) return;
            recoveryFailure = `; the simulator's kept log could not be read: ${(error as Error).message}`;
          });
    });
  }

  close(error = new Error("The simulator touch observer stopped")) {
    this.failure ??= error;
    for (const notify of this.listeners) notify();
  }
}

export type PhonePickerPreview =
  | { previewed: true; timestamp: string; proof: string }
  | { previewed: false; reason: string };

/**
 * INF-1477 (the captain's choice "Allow one more photo tap"): a photo tap the iPhone delivered can still reach
 * the photo picker as a press-and-hold. In phone run 40486884004 the lift reached the picker 1.65 seconds after
 * it left the screen, so the picker opened the photo's preview and chose nothing. The picker's own context
 * menu line, logged as it handles that lift, is the proof; the runner taps the photo once more only on it.
 */
export class PhonePickerPreviews {
  private previews: { at: number; timestamp: string; line: string }[] = [];
  private listeners = new Set<() => void>();
  private failure: Error | undefined;

  private recover: ((since: number, signal: AbortSignal) => Promise<object[]>) | undefined;

  constructor(recover?: (since: number, signal: AbortSignal) => Promise<object[]>) {
    this.recover = recover;
  }

  receive(record: {
    processImagePath?: string;
    eventMessage?: string;
    timestamp?: string;
    subsystem?: string;
    category?: string;
  }) {
    if (basename(record.processImagePath ?? "") !== "PhotosPicker") return;
    const message = record.eventMessage ?? "";
    let line = firstLine(message);
    if (!message.startsWith(PICKER_PREVIEW_LINE)) {
      // INF-2444: in main run 41627462640's iPhone rest the narrow stream dropped this press's response, and the
      // virtual Mac's kept log held it only as this placeholder, as it did in every other run INF-2305 traced.
      // The context menu category logs only while a menu animates, and no menu is open as a press begins, so its
      // first unreadable record after the press is that response. A readable record must still be the line itself.
      if (
        message !== UNREADABLE_SHARED_MESSAGE ||
        record.subsystem !== PICKER_PREVIEW_SUBSYSTEM ||
        record.category !== PICKER_PREVIEW_CATEGORY
      )
        return;
      line = `[${PICKER_PREVIEW_SUBSYSTEM}:${PICKER_PREVIEW_CATEGORY}] ${message}`;
    }
    const at = phoneLogMilliseconds(record.timestamp ?? "");
    if (Number.isNaN(at)) return;
    this.previews.push({ at, timestamp: record.timestamp ?? "", line });
    for (const notify of this.listeners) notify();
  }

  /** INF-2305: the owned broad stream can retain a Photos line the narrow stream dropped.
   * Compact log times use the runner's local zone, as the other consumers of observePhoneLog do.
   * Decode its header only; receive remains the owner of the process, message and timestamp checks. */
  receiveLine(line: string) {
    if (!line.includes(PICKER_PREVIEW_LINE) && !line.includes(`:${PICKER_PREVIEW_CATEGORY}] `))
      return;
    const fields =
      /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+\S+\s+([^\s[\]]+)\[\d+:[^\]]+\] \[([^\]:]*):([^\]]*)\] (.*)$/.exec(
        line,
      );
    if (!fields?.[1] || !fields[2] || !fields[5]) return;
    const at = new Date(fields[1].replace(" ", "T"));
    if (Number.isNaN(at.getTime())) return;
    this.receive({
      processImagePath: fields[2],
      timestamp: at.toISOString().replace("T", " ").replace("Z", "+0000"),
      subsystem: fields[3],
      category: fields[4],
      eventMessage: fields[5],
    });
  }

  /** The picker's first preview of a photo tap the runner began at `since`, on its own clock in milliseconds. */
  preview(since: number): Promise<PhonePickerPreview> {
    return new Promise((resolve) => {
      let settled = false;
      let recoveryFailure = "";
      const recovery = new AbortController();
      const finish = (result: PhonePickerPreview) => {
        if (settled) return;
        settled = true;
        deadline.cancel();
        this.listeners.delete(check);
        recovery.abort();
        resolve(result);
      };
      const check = () => {
        if (this.failure) {
          finish({ previewed: false, reason: this.failure.message });
          return;
        }
        const preview = this.previews.find((each) => each.at >= since);
        if (preview) finish({ previewed: true, timestamp: preview.timestamp, proof: preview.line });
      };
      // A failure deadline, not a delay: a photo the picker chose leaves no preview, and the runner stops asking.
      const deadline = budgetTimer(
        () =>
          finish({
            previewed: false,
            reason: `No photo picker preview since ${new Date(since).toISOString()}${recoveryFailure}`,
          }),
        30_000,
      );
      this.listeners.add(check);
      check();
      // INF-2305: Photos logged the rest part's real preview, but the narrow live stream missed it.
      // As for touch witnesses, read the owned simulator's kept log once inside the original wait.
      // Only the same Photos line after this press can answer; no extra touch or longer wait.
      void Promise.resolve().then(async () => {
        if (settled || !this.recover) return;
        try {
          const records = await this.recover(since, recovery.signal);
          if (!settled) for (const record of records) this.receive(record);
        } catch (error) {
          recoveryFailure = `; the simulator's kept log could not be read: ${(error as Error).message}`;
        }
      });
    });
  }

  close(error = new Error("The simulator photo picker observer stopped")) {
    this.failure ??= error;
    for (const notify of this.listeners) notify();
  }
}

export type PhoneDisplayOutcome =
  | { outcome: "applied" | "missed"; timestamp: string; proof: string }
  | { outcome: "unknown"; reason: string };
/** What one display change did: its appearance and its text size, each unchanged when the part already asked for it,
 * and each text size save. */
export type PhoneDisplayReport = {
  appearance: PhoneDisplayOutcome | { outcome: "unchanged" };
  textSize?: (PhoneDisplayOutcome | { outcome: "unchanged" })[];
};
/** The simulator's names for the type sizes the journeys set, and the category its own log names for each. */
export const PHONE_TEXT_SIZES = {
  large: "UICTContentSizeCategoryL",
  "extra-extra-extra-large": "UICTContentSizeCategoryXXXL",
} as const;
export type PhoneTextSize = keyof typeof PHONE_TEXT_SIZES;
/** The app's own process, whose reads of the text size are the ones its screen draws with. */
const PHONE_APP_PROCESS = "Infinitary";
type DisplayReading = { value: string; at: number; timestamp: string; line: string };
/** UIKit's style numbers in SpringBoard's appearance arbiter lines. */
const ARBITER_STYLES: Record<string, "light" | "dark"> = { "1": "light", "2": "dark" };
/**
 * The journey's display requests' budget, `displayBudget` in PhoneJourney.swift; its wall cap is waitCap's formula.
 * INF-1786: as long as that cap, so the request's load clock never ends it before the appearance witness answers.
 */
export const PHONE_DISPLAY_REQUEST_BUDGET_MS = 600_000;
/**
 * INF-1799: the longest the runner reads the simulator's kept log for a witness line its live stream dropped. The
 * read covers the minutes since one display change and takes seconds; past a minute the host is too starved to answer.
 */
const PHONE_DISPLAY_RECOVERY_CAP_MS = 60_000;

/**
 * INF-1799: when every witness of a display control that began at `start` stops waiting. Both deadlines used to cap
 * at 10 minutes, so on a starved host the journey's request, sent first, ended before the runner's non-fatal unknown.
 * One recovery read's worth is left for the kept log, and one for the request's way to the runner and back.
 */
export function phoneDisplayDeadline(start = Date.now()): number {
  return start + waitCap(PHONE_DISPLAY_REQUEST_BUDGET_MS) - 2 * PHONE_DISPLAY_RECOVERY_CAP_MS;
}

/** The budget of the runner's request for a tap's outcome, `askPhoneHome` in PhoneKeys.swift; its wall cap is waitCap's. */
export const PHONE_TOUCH_REQUEST_BUDGET_MS = 40_000;

/**
 * INF-2076: when the witness of a tap whose outcome the runner asked for at `start` stops waiting. The witness's
 * 30-second load budget and the runner's request both capped at 10 minutes, so on a starved host the runner's
 * request, sent first, ended before the home's unknown reached it, and the tap failed with no answer. The kept-log
 * read runs inside the wait, so only one minute is left, as for a display request, for the request's way there and back.
 */
export function phoneTouchDeadline(start = Date.now()): number {
  return start + waitCap(PHONE_TOUCH_REQUEST_BUDGET_MS) - PHONE_DISPLAY_RECOVERY_CAP_MS;
}

/**
 * INF-1785 (the captain's choice "Confirm each change from the simulator's log, and set it once more only when the
 * log proves the phone missed it"): on a starved simulator a display change the runner asks for can miss the app.
 * In phone run 40788049243 the simulator saved the largest text size and the iPhone's app read the old size a
 * millisecond later and never again; in run 40792658138 SpringBoard applied light about 250 seconds after the runner
 * asked, past the journey's wait. Each change is confirmed by its consumer's own line: SpringBoard's appearance
 * arbiter changing to the asked style, or the app reading the asked text size. The app reading another size after the
 * simulator logged the save is the proof of a miss. An appearance miss leaves no line at all, so it is never proven.
 * INF-1799: a live stream can drop a line the simulator's kept log holds, so before a witness answers unknown it
 * reads `recover`, the kept log since the change.
 */
export class PhoneDisplayChanges {
  private styles: DisplayReading[] = [];
  private saves: DisplayReading[] = [];
  private reads: DisplayReading[] = [];
  private listeners = new Set<() => void>();
  private failure: Error | undefined;

  private recover: ((since: number) => Promise<object[]>) | undefined;

  constructor(recover?: (since: number) => Promise<object[]>) {
    this.recover = recover;
  }

  receive(record: { processImagePath?: string; eventMessage?: string; timestamp?: string }) {
    const process = basename(record.processImagePath ?? "");
    const message = record.eventMessage ?? "";
    let readings: DisplayReading[];
    let value: string | undefined;
    if (process === "SpringBoard") {
      readings = this.styles;
      value = ARBITER_STYLES[/^Arbiter changing style from \d+ to (\d+),/.exec(message)?.[1] ?? ""];
    } else if (process === "CoreSimulatorBridge") {
      readings = this.saves;
      value = /^Saved CategoryName: per-app = 0, category name = (\w+),/.exec(message)?.[1];
    } else if (process === PHONE_APP_PROCESS) {
      readings = this.reads;
      // The app also logs its web pages' reads, as "WebContent[pid] Read CategoryName", which draw no native text.
      value = /^Read CategoryName: per-app = 0, category name = (\w+)$/.exec(message)?.[1];
    } else return;
    const at = phoneLogMilliseconds(record.timestamp ?? "");
    if (!value || Number.isNaN(at)) return;
    readings.push({ value, at, timestamp: record.timestamp ?? "", line: firstLine(message) });
    for (const notify of this.listeners) notify();
  }

  /**
   * Whether SpringBoard applied the appearance the runner asked for at `since`, on its own clock in milliseconds.
   * INF-1786 (the captain's choice "Wait for SpringBoard's own line, up to the request's 8-minute limit"): in run
   * 40792658138 SpringBoard applied light 250 seconds after the request, so this waits until `until` alone.
   */
  appearance(
    since: number,
    style: "light" | "dark",
    until = phoneDisplayDeadline(),
  ): Promise<PhoneDisplayOutcome> {
    return this.witness(since, until, undefined, `SpringBoard did not change to ${style}`, () => {
      const changed = this.styles.find((each) => each.at >= since && each.value === style);
      return changed && { outcome: "applied", timestamp: changed.timestamp, proof: changed.line };
    });
  }

  /** Whether the app read the text size the runner asked for at `since`, or proved it missed the simulator's save. */
  textSize(
    since: number,
    size: PhoneTextSize,
    until = phoneDisplayDeadline(),
  ): Promise<PhoneDisplayOutcome> {
    const category = PHONE_TEXT_SIZES[size];
    return this.witness(since, until, 30_000, `the app did not read ${category}`, () => {
      const read = this.reads.find((each) => each.at >= since && each.value === category);
      if (read) return { outcome: "applied", timestamp: read.timestamp, proof: read.line };
      // A read in the save's own millisecond can come before it, as on the iPad of run 40788049243, so it proves nothing.
      const saved = this.saves.find((each) => each.at >= since && each.value === category);
      const stale = saved && this.reads.find((each) => each.at > saved.at);
      return (
        stale && {
          outcome: "missed",
          timestamp: stale.timestamp,
          proof: `${saved.line}; then ${stale.line}`,
        }
      );
    });
  }

  private witness(
    since: number,
    until: number,
    budget: number | undefined,
    missing: string,
    decide: () => PhoneDisplayOutcome | undefined,
  ): Promise<PhoneDisplayOutcome> {
    return new Promise((resolve) => {
      let stopped = false;
      const stop = () => {
        stopped = true;
        deadline?.cancel();
        clearTimeout(wall);
      };
      const finish = (result: PhoneDisplayOutcome) => {
        stop();
        this.listeners.delete(check);
        resolve(result);
      };
      const check = () => {
        if (this.failure) {
          finish({ outcome: "unknown", reason: this.failure.message });
          return;
        }
        const decided = decide();
        if (decided) finish(decided);
      };
      const giveUp = async () => {
        if (stopped) return;
        stop();
        let kept = "";
        if (this.recover && !this.failure)
          try {
            for (const record of await this.recover(since)) this.receive(record);
            kept = ", in its live or kept log";
          } catch (error) {
            kept = `; the simulator's kept log could not be read: ${(error as Error).message}`;
          }
        check();
        finish({
          outcome: "unknown",
          reason: `No display witness since ${new Date(since).toISOString()}: ${missing}${kept}`,
        });
      };
      // Failure deadlines, not delays: without a witness the runner sets nothing again.
      const deadline = budget === undefined ? undefined : budgetTimer(() => void giveUp(), budget);
      const wall = setTimeout(() => void giveUp(), Math.max(0, until - Date.now()));
      this.listeners.add(check);
      check();
    });
  }

  close(error = new Error("The simulator display observer stopped")) {
    this.failure ??= error;
    for (const notify of this.listeners) notify();
  }
}

/**
 * INF-1785: sets the text size, and once more only when the app's own read proves it missed the first save; the
 * simulator posts a save to the app again even when the size is unchanged. Two proven misses fail the part.
 * INF-2052: a size the part already asked for (`asked`) is set again and answered unchanged with no witness, since
 * nothing changes for the app to read: on a freshly started iPad no line of such a save reached the runner, and its
 * witness waited nine minutes of the part for one.
 */
export async function changePhoneTextSize(
  size: PhoneTextSize,
  write: () => Promise<unknown>,
  confirm: (since: number) => Promise<PhoneDisplayOutcome>,
  asked?: PhoneTextSize,
): Promise<(PhoneDisplayOutcome | { outcome: "unchanged" })[]> {
  if (size === asked) {
    await write();
    return [{ outcome: "unchanged" }];
  }
  const outcomes: PhoneDisplayOutcome[] = [];
  do {
    // The runner's and the simulator's records share this Mac's clock; the save logs after this.
    const since = Date.now();
    await write();
    outcomes.push(await confirm(since));
  } while (outcomes.length < 2 && outcomes.at(-1)?.outcome === "missed");
  if (outcomes.every((outcome) => outcome.outcome === "missed"))
    throw new Error(
      `The app read the old text size after both of the simulator's saves of ${size}: ${JSON.stringify(outcomes)}`,
    );
  return outcomes;
}

/** The simulator-wide state UIKit reads through GSEventIsHardwareKeyboardAttached. */
export const PHONE_HARDWARE_KEYBOARD_STATE = "GSEventHardwareKeyboardAttached";
// GraphicsServices packs (countryCode << 8) | (type << 16) | attached, and tests the low byte.
// 33 is the US country code XCTest's own virtual keyboard reports, so these match backboardd's values.
const HARDWARE_KEYBOARD_ATTACHED = String((33 << 8) | 1);
const HARDWARE_KEYBOARD_DETACHED = String(33 << 8);

export function hardwareKeyboardArguments(simulator: string, attached: boolean): string[] {
  return [
    "simctl",
    "spawn",
    simulator,
    "notifyutil",
    "-s",
    PHONE_HARDWARE_KEYBOARD_STATE,
    attached ? HARDWARE_KEYBOARD_ATTACHED : HARDWARE_KEYBOARD_DETACHED,
    "-p",
    PHONE_HARDWARE_KEYBOARD_STATE,
  ];
}

type KeyboardRun = (command: string, args: string[]) => Promise<unknown>;
const keyboardWrites = new WeakMap<KeyboardRun, Map<string, Promise<void>>>();

export function setPhoneHardwareKeyboard(
  run: KeyboardRun,
  simulator: string,
  attached: boolean,
): Promise<void> {
  let writes = keyboardWrites.get(run);
  if (!writes) {
    writes = new Map();
    keyboardWrites.set(run, writes);
  }
  const queue = writes;
  const write = async () => {
    await run("xcrun", hardwareKeyboardArguments(simulator, attached));
  };
  // An HTTP timeout does not cancel notifyutil; cleanup must follow even a failed or late attachment.
  const pending = (queue.get(simulator) ?? Promise.resolve()).then(write, write);
  queue.set(simulator, pending);
  const finished = () => {
    if (queue.get(simulator) === pending) queue.delete(simulator);
  };
  void pending.then(finished, finished);
  return pending;
}

export async function joinPhoneHardwareKeyboardWrites(run: KeyboardRun): Promise<void> {
  const writes = keyboardWrites.get(run);
  const failures: unknown[] = [];
  while (writes?.size) {
    const completed = await Promise.allSettled([...writes.values()]);
    for (const result of completed) if (result.status === "rejected") failures.push(result.reason);
  }
  if (failures.length) throw new AggregateError(failures, "Simulator keyboard cleanup failed");
}

/**
 * UIKit publishes an app's key commands to backboardd only while a hardware keyboard is attached when
 * its deferred update runs, and XCTest's own keyboard detaches within a millisecond of a key press.
 * Attach one to the owned simulator for the acknowledgement wait; detach it again however the wait ends.
 */
export async function withPhoneHardwareKeyboard<T>(
  run: (command: string, args: string[]) => Promise<unknown>,
  simulator: string,
  wait: () => Promise<T>,
): Promise<T> {
  await setPhoneHardwareKeyboard(run, simulator, true);
  try {
    return await wait();
  } finally {
    await setPhoneHardwareKeyboard(run, simulator, false);
  }
}

/** launchctl's PID/status/service columns, scoped to the runner's own simulator. */
export function phoneApplicationPid(services: string, bundle: string): number {
  const pids = services.split("\n").flatMap((line) => {
    const columns = line.trim().split(/\s+/);
    const [pid, , service] = columns;
    return columns.length === 3 &&
      pid &&
      service &&
      /^\d+$/.test(pid) &&
      service.startsWith(`UIKitApplication:${bundle}[`)
      ? [Number(pid)]
      : [];
  });
  const [pid] = pids;
  if (pids.length !== 1 || pid === undefined)
    throw new Error(`Expected one running ${bundle} on the owned simulator, got ${pids.length}`);
  return pid;
}

/** UIKit's context menu line in the photo picker, logged as it handles a press-and-hold's lift. */
const PICKER_PREVIEW_LINE = "performAllAnimations for animator: <_UIContextMenuAnimator";
/** The subsystem and category UIKit logs that line under; every Photos response of every run carried them. */
const PICKER_PREVIEW_SUBSYSTEM = "com.apple.UIKit";
const PICKER_PREVIEW_CATEGORY = "UICMILifecycle";
/**
 * What `log show` writes in place of a message whose format string lives in the simulator's dyld shared cache when
 * the Mac reading the log lacks that cache's format strings. Process, subsystem, category and time survive.
 */
const UNREADABLE_SHARED_MESSAGE = "<compose failure [shared UUID]>";

/** Registration subset of INF-355's observe.sh, limited to the runner's own simulator,
 * INF-1477's touch screen attachments, touching contacts that name their screen and ignored touches,
 * INF-1109's registration warnings and unfinished-contact snapshots from the same backboardd,
 * the photo picker's press-and-hold, INF-1785's display changes, and INF-6074's caret taken back. */
const PHONE_KEYBOARD_LOG_PREDICATE =
  '(process == "backboardd" AND (composedMessage BEGINSWITH "new key command registrations for pid:"' +
  ` OR composedMessage BEGINSWITH "${KEY_EVENT_PREFIX}"` +
  ' OR composedMessage BEGINSWITH "init: <BKDirectTouchState"' +
  ' OR (composedMessage BEGINSWITH "[" AND composedMessage ENDSWITH "presence: touching")' +
  ' OR composedMessage BEGINSWITH "ignoring digitizer event"' +
  ' OR composedMessage BEGINSWITH "we already have a service for senderID:"' +
  ' OR composedMessage BEGINSWITH "*** unknown digitizer"' +
  ' OR composedMessage BEGINSWITH "cancel -- digitizer did disappear:"))' +
  ` OR (process == "PhotosPicker" AND (composedMessage BEGINSWITH "${PICKER_PREVIEW_LINE}"` +
  ` OR (subsystem == "${PICKER_PREVIEW_SUBSYSTEM}" AND category == "${PICKER_PREVIEW_CATEGORY}")))` +
  ' OR (process == "SpringBoard" AND composedMessage BEGINSWITH "Arbiter changing style from")' +
  ' OR (process == "CoreSimulatorBridge" AND composedMessage BEGINSWITH "Saved CategoryName: per-app = 0")' +
  ` OR (process == "${PHONE_APP_PROCESS}" AND (composedMessage BEGINSWITH "Read CategoryName: per-app = 0"` +
  ` OR (subsystem == "${CARET_FIELD_SUBSYSTEM}" AND category == "${CARET_FIELD_CATEGORY}"` +
  ` AND composedMessage BEGINSWITH "${CARET_FIELD_PREFIX}")` +
  ` OR (subsystem == "${KEYBOARD_ARBITER_SUBSYSTEM}" AND category == "${KEYBOARD_ARBITER_CATEGORY}"` +
  ` AND (composedMessage == "${KEYBOARD_ARBITER_FAILED}" OR composedMessage == "${KEYBOARD_ARBITER_RESIGNED}"))))`;

type PhoneKeyboardOptions = {
  simulator: string;
  env: NodeJS.ProcessEnv;
  evidence: string;
  children: Set<ChildProcess>;
};

export async function observePhoneKeyboard(options: PhoneKeyboardOptions) {
  let stream = await openPhoneKeyboardStream(options, false);
  let generation = 1;
  return {
    // INF-82's live subscription stopped supplying records across a relaunch.
    // Renew before launching, never after a timeout or an attempted chord.
    async beforeLaunch() {
      await stream.close();
      stream = await openPhoneKeyboardStream(options, true);
      return { generation: ++generation };
    },
    wait: (pid: number, chord: PhoneChord) => stream.wait(pid, chord),
    touch: (since: number) => stream.touch(since),
    keyOutcome: (pid: number, since: number, until: number, deadline: number) =>
      stream.keyOutcome(pid, since, until, deadline),
    caret: (pid: number, since: number, deadline: number) => stream.caret(pid, since, deadline),
    preview: (since: number) => stream.preview(since),
    previewLine: (line: string) => stream.previewLine(line),
    appearance: (since: number, style: "light" | "dark", until?: number) =>
      stream.appearance(since, style, until),
    textSize: (since: number, size: PhoneTextSize, until?: number) =>
      stream.textSize(since, size, until),
    close: () => stream.close(),
  };
}

/** INF-1799: the simulator's kept log of the witness lines since `since`, which holds lines a live stream dropped. */
function keptPhoneLog(
  options: PhoneKeyboardOptions,
  since: number,
  signal?: AbortSignal,
): Promise<object[]> {
  return new Promise((resolve, reject) => {
    const show = spawn(
      "xcrun",
      [
        "simctl",
        "spawn",
        options.simulator,
        "log",
        "show",
        "--start",
        logTime(new Date(since)),
        "--style",
        "ndjson",
        "--info",
        "--debug",
        "--predicate",
        PHONE_KEYBOARD_LOG_PREDICATE,
      ],
      { env: options.env, stdio: ["ignore", "pipe", "pipe"], signal },
    );
    options.children.add(show);
    const records: object[] = [];
    createInterface({ input: show.stdout }).on("line", (line) => {
      try {
        records.push(JSON.parse(line));
      } catch {
        /* Non-record log diagnostics are not witnesses. */
      }
    });
    show.stderr.resume();
    // A wall cap, not a load budget: the control's answer must still reach the journey in time.
    const cap = setTimeout(() => {
      show.kill("SIGTERM");
      reject(new Error(`it took over ${PHONE_DISPLAY_RECOVERY_CAP_MS / 1000} seconds`));
    }, PHONE_DISPLAY_RECOVERY_CAP_MS);
    show.once("error", (error) => {
      clearTimeout(cap);
      reject(error);
    });
    show.once("close", (status) => {
      clearTimeout(cap);
      options.children.delete(show);
      if (status === 0) resolve(records);
      else reject(new Error(`log show exited with ${status}`));
    });
  });
}

async function openPhoneKeyboardStream(options: PhoneKeyboardOptions, append: boolean) {
  const registrations = new PhoneKeyRegistrations();
  const touches = new PhoneTouchOutcomes((since, signal) => keptPhoneLog(options, since, signal));
  const previews = new PhonePickerPreviews((since, signal) => keptPhoneLog(options, since, signal));
  const displays = new PhoneDisplayChanges((since) => keptPhoneLog(options, since));
  const keys = new PhoneKeyEvents((since, signal) => keptPhoneLog(options, since, signal));
  const carets = new PhoneCaretChanges((since, signal) => keptPhoneLog(options, since, signal));
  const child = spawn(
    "xcrun",
    [
      "simctl",
      "spawn",
      options.simulator,
      "log",
      "stream",
      "--style",
      "ndjson",
      "--level",
      "debug",
      "--predicate",
      PHONE_KEYBOARD_LOG_PREDICATE,
    ],
    {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  options.children.add(child);
  const outputs = [
    pipeline(
      child.stdout,
      createGzip(),
      createWriteStream(join(options.evidence, "keyboard-registrations.ndjson.gz"), {
        flags: append ? "a" : "w",
      }),
    ),
    pipeline(
      child.stderr,
      createWriteStream(join(options.evidence, "keyboard-registrations.stderr"), {
        flags: append ? "a" : "w",
      }),
    ),
  ];
  const saved = Promise.all(outputs);
  // Handle a writer failure immediately, but also rethrow it after every writer has stopped.
  const failed = (error: Error) => {
    registrations.close(error);
    touches.close(error);
    previews.close(error);
    displays.close(error);
    child.kill("SIGTERM");
  };
  void saved.catch(failed);
  const lines = createInterface({ input: child.stdout });
  // pipeline destroys its input on failure; readline forwards that error independently.
  lines.on("error", failed);
  const stopped = new Promise<void>((resolve) =>
    child.once("close", () => {
      registrations.close();
      touches.close();
      previews.close();
      displays.close();
      options.children.delete(child);
      resolve();
    }),
  );
  const close = async () => {
    child.kill("SIGTERM");
    await stopped;
    await Promise.allSettled(outputs);
    lines.close();
    await saved;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = budgetTimer(
        () => reject(new Error("The simulator keyboard log did not start")),
        15_000,
      );
      child.once("error", (error) => {
        deadline.cancel();
        registrations.close(error);
        touches.close(error);
        previews.close(error);
        displays.close(error);
        reject(error);
      });
      child.once("close", () => {
        deadline.cancel();
        reject(new Error("The simulator keyboard log exited"));
      });
      lines.on("line", (line) => {
        if (line.startsWith("Filtering the log data using ")) {
          deadline.cancel();
          resolve();
          return;
        }
        try {
          const record = JSON.parse(line);
          registrations.receive(record);
          touches.receive(record);
          previews.receive(record);
          displays.receive(record);
          keys.receive(record);
          carets.receive(record);
        } catch {
          /* Non-record log diagnostics are not witnesses. */
        }
      });
    });
  } catch (error) {
    await keepPhoneDiagnostic("Keyboard observer startup cleanup", close);
    throw error;
  }
  return {
    wait: (pid: number, chord: PhoneChord) => registrations.wait(pid, chord),
    touch: (since: number) => touches.outcome(since),
    // INF-5183: a key's outcome is read from this subscription and the kept log, and the kept log's read ends when
    // the press's own window does, `deadline`, never at the kept log's own minute (`PhoneKeyEvents`).
    keyOutcome: (pid: number, since: number, until: number, deadline: number) =>
      keys.outcome(pid, since, until, deadline),
    // INF-6074: whether the system's keyboard took back the caret a text field took since `since`.
    caret: (pid: number, since: number, deadline: number) => carets.outcome(pid, since, deadline),
    preview: (since: number) => previews.preview(since),
    previewLine: (line: string) => previews.receiveLine(line),
    appearance: (since: number, style: "light" | "dark", until?: number) =>
      displays.appearance(since, style, until),
    textSize: (since: number, size: PhoneTextSize, until?: number) =>
      displays.textSize(since, size, until),
    close,
  };
}
