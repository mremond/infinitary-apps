import { withoutSkipped } from "@shared/cardAnswerLines";
import { CARD_DRAFTS } from "@shared/cardDrafts";
import { type CardNote, markNumbers, noteText, noteTexts } from "@shared/cardNotes";
import { CHOICE_ATTACHMENTS } from "@shared/choiceCarried";
import type { Spelling } from "@shared/codeNames";
import { contractChange, listsChange } from "./contractChanges";
import { type JournalEntry, pushFrameIn } from "./journal";
import { type ActionReads, frameWithoutUnreadActions } from "./taskAllow";

/** The ambient music's switch and volume in the look (`ambient-music.md`). */
export const AMBIENT_MUSIC = contractChange("ambient-music");
export const AMBIENT_PAUSE = contractChange("ambient-pause");
export const AMBIENT_STYLE = contractChange("ambient-style");
export const AMBIENT_AWAY = contractChange("ambient-away");
export const AMBIENT_OWN_STYLES = contractChange("ambient-own-styles");

/**
 * The panel read `settings.current` (`settings-current.md`). A view without
 * it decodes a panel's reads as a closed list, so `unreadLook` names the read
 * and `lookFor` leaves out each panel that declares it.
 */
export const SETTINGS_CURRENT = contractChange("settings-current");
const SETTINGS_READ = "settings.current";

/** Where devices find a home says when it cannot add a computer by its address (`device-adds-by-address.md`). */
export const DEVICE_ADDS_BY_ADDRESS = contractChange("device-adds-by-address");

/** A computer the home follows the update of reads updating (`computer-updating.md`). */
export const COMPUTER_UPDATING = contractChange("computer-updating");
/** What an older view's strict device list cannot read, in its unread list. */
const DEVICE_UPDATING = "updating";

/** The answers and push of where devices find a home, which an older desktop reads strictly. */
const ADDRESS_CHANNELS = new Set(["inf:devices:addresses", "inf:devices:address:set"]);

/** A skipped question's answer marked as a skip (`card-answer-skipped.md`). */
export const CARD_ANSWER_SKIPPED = contractChange("card-answer-skipped");

/** Each open card's unsent draft, read and followed by every window (`card-drafts.md`). */
export const CARD_DRAFTS_CHANGE = contractChange(CARD_DRAFTS);

/** A note's place in a picture, and the page a note marks (`card-note-places.md`). */
export const CARD_NOTE_PLACES = contractChange("card-note-places");

/**
 * A line's notes for a reader that draws notes and reads no place: each note with a place is
 * folded into the line's words, numbered as the whole reply numbers its marks, and the rest stay notes.
 */
function withoutPlaces(text: unknown, notes: readonly CardNote[]): Record<string, unknown> {
  const marks = markNumbers(notes);
  const plain = notes.filter((note) => !note.place && !note.page);
  const folded = notes.flatMap((note, index) =>
    note.place || note.page ? [noteText(note, marks[index])] : [],
  );
  if (folded.length === 0) return { notes };
  return {
    ...(plain.length > 0 ? { notes: plain } : {}),
    text: [text, ...folded].filter(Boolean).join("\n"),
  };
}

/** A card button that carries the field's notes, files and pictures (`choice-attachments.md`). */
const CHOICE_ATTACHMENTS_CHANGE = contractChange(CHOICE_ATTACHMENTS);

/** The replies that may hold a past card. */
const PAST_CARD_CHANNELS = new Set(["inf:cards:show", "inf:cards:past", "inf:cards:show-past"]);

/**
 * A past card for its reader: one whose hello does not list `choice-attachments` reads a past
 * card strictly, so what its closing choice carried is left out and the rest reads as before.
 */
export function pastCardFor(
  channel: string,
  value: unknown,
  changes: readonly string[] | null | undefined,
): unknown {
  if (listsChange(changes, CHOICE_ATTACHMENTS_CHANGE) || !PAST_CARD_CHANNELS.has(channel)) {
    return value;
  }
  if (!value || typeof value !== "object" || !("carried" in value)) return value;
  const { carried: _carried, ...rest } = value as Record<string, unknown>;
  return rest;
}

/** A crewmate card's declared live reads and views (`card-live-reads.md`). */
export const CARD_LIVE_READS = contractChange("card-live-reads");

/** Strict older desktops need fields removed; readers without annotations keep a readable note. */
export function threadLinesFor(
  value: unknown,
  reads: {
    sharing: boolean;
    annotations: boolean;
    through?: boolean;
    skipped?: boolean;
    places?: boolean;
  },
): unknown {
  if (Array.isArray(value)) return value.map((entry) => threadLinesFor(entry, reads));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.messages))
    return Array.isArray(record.cards)
      ? { ...record, cards: record.cards.map((card) => threadLinesFor(card, reads)) }
      : value;
  // A reader from before `card-answer-skipped` reads answers strictly.
  const answers = (value: unknown) => (reads.skipped === false ? withoutSkipped(value) : value);
  return {
    ...record,
    ...("answers" in record ? { answers: answers(record.answers) } : {}),
    messages: record.messages.map((message) => {
      if (!message || typeof message !== "object") return message;
      const { contributor, answersMessage, clarification, notes, through, ...line } =
        message as Record<string, unknown>;
      return {
        ...line,
        ...("answers" in line ? { answers: answers(line.answers) } : {}),
        ...(reads.through && through ? { through } : {}),
        ...(reads.sharing ? { contributor, answersMessage, clarification } : {}),
        ...(reads.annotations
          ? notes
            ? reads.places === false && Array.isArray(notes)
              ? withoutPlaces(line.text, notes as CardNote[])
              : { notes }
            : {}
          : notes && Array.isArray(notes)
            ? {
                text: [line.text, ...noteTexts(notes as CardNote[])].filter(Boolean).join("\n"),
              }
            : {}),
      };
    }),
  };
}

/**
 * A view reads the look strictly, so each choice added after it - the
 * language (`language-choice`) and the fonts (`font-choice`) when it is
 * older than major 16, and the ambient music (`ambient-music`) - is left out
 * of the look it is pushed or answered when its hello does not list that
 * name; a view keeps its own look and never needs the home's. Where
 * devices find a home is read as strictly, so a Windows home's
 * `addsByAddress` (`device-adds-by-address`) is left out the same way, and
 * so is a device's `updating` (`computer-updating`).
 */
export function lookFor(channel: string, value: unknown, unread: readonly string[]): unknown {
  if (unread.length === 0 || !value || typeof value !== "object") return value;
  if (ADDRESS_CHANNELS.has(channel)) return without(value, unread);
  if (channel.startsWith("inf:devices") && unread.includes(DEVICE_UPDATING))
    return withoutUpdating(value);
  if (channel === "inf:settings:appearance:get") return without(value, unread);
  if (channel === "inf:plugins:personal:list" || channel === "inf:plugins:personal") {
    return unread.includes(SETTINGS_READ) ? panelsWithoutSettingsRead(value) : value;
  }
  if (channel !== "inf:shell:preferences") return value;
  const look = value as Record<string, unknown>;
  return { ...look, appearance: without(look.appearance, unread) };
}

/**
 * A device, or each one of a list, without `updating`: an older desktop
 * reads a device strictly, and keeps saying out of reach.
 */
function withoutUpdating(value: object): unknown {
  const drop = (device: unknown) => {
    if (!device || typeof device !== "object" || !(DEVICE_UPDATING in device)) return device;
    const { updating: _updating, ...rest } = device as Record<string, unknown>;
    return rest;
  };
  return Array.isArray(value) ? value.map(drop) : drop(value);
}

/** A panel snapshot without the panels (and drafts) that read settings. */
function panelsWithoutSettingsRead(value: object): unknown {
  const keep = (panel: { reads?: readonly string[] }) => !panel.reads?.includes(SETTINGS_READ);
  const snapshot = value as {
    extensions?: { reads?: string[] }[];
    drafts?: { reads?: string[] }[];
  };
  return {
    ...snapshot,
    ...(snapshot.extensions ? { extensions: snapshot.extensions.filter(keep) } : {}),
    ...(snapshot.drafts ? { drafts: snapshot.drafts.filter(keep) } : {}),
  };
}

function without(appearance: unknown, unread: readonly string[]): unknown {
  if (!appearance || typeof appearance !== "object") return appearance;
  return Object.fromEntries(
    Object.entries(appearance as Record<string, unknown>).filter(([key]) => !unread.includes(key)),
  );
}

/** Which added card fields a view's card decoder reads. */
export type CardReads = {
  updates: boolean;
  ended: boolean;
  annotations: boolean;
  files: boolean;
  through: boolean;
  skipped: boolean;
  /** Whether the view reads a note's place and page (`card-note-places.md`). */
  places: boolean;
  /** A card's declared live reads and views (`CARD_LIVE_READS`). */
  liveReads: boolean;
};

/**
 * Keep old desktop strict card decoders working: a snapshot leaves out each
 * added field the view does not read. Phones already ignore optional JSON fields.
 */
export function legacyCardSnapshot(value: unknown, reads: CardReads): unknown {
  if (!Array.isArray(value) || readsEveryCardField(reads)) return value;
  return value.map(
    ({ currentUpdateId, currentUpdateSeen, ended, files, reads: live, sql, ...card }) => ({
      ...card,
      ...(reads.updates ? { currentUpdateId, currentUpdateSeen } : {}),
      ...(reads.ended ? { ended } : {}),
      ...(reads.files && files ? { files } : {}),
      ...(reads.liveReads && live ? { reads: live } : {}),
      ...(reads.liveReads && sql ? { sql } : {}),
    }),
  );
}

/** Whether a view reads every field a card snapshot may carry, so it needs none left out. */
function readsEveryCardField(reads: CardReads): boolean {
  return reads.updates && reads.ended && reads.files && reads.liveReads;
}

/**
 * Every channel a view may ask, or hears, whose answer carries card lines:
 * an older desktop reads each line strictly, so it gets them without who
 * wrote them.
 */
export const THREAD_CHANNELS = new Set([
  "inf:cards:show",
  "inf:cards:thread",
  "inf:cards:past",
  "inf:cards:show-past",
  "inf:cards:reply",
]);

export function cardPushFor(
  entry: JournalEntry,
  spelling: Spelling,
  reads: CardReads,
  sharedCards = true,
  actionReads: ActionReads = { taskAllow: true, keepGoing: true },
  unread: readonly string[] = [],
): string {
  const spelled = lookPushFor(entry, spelling, unread);
  const text = entry.channel.startsWith("inf:cards")
    ? frameWithoutUnreadActions(spelled, actionReads)
    : spelled;
  if (
    (!sharedCards || !reads.annotations || !reads.through || !reads.skipped || !reads.places) &&
    THREAD_CHANNELS.has(entry.channel)
  ) {
    const frame = JSON.parse(text);
    return JSON.stringify({
      ...frame,
      payload: threadLinesFor(frame.payload, {
        sharing: sharedCards,
        annotations: reads.annotations,
        through: reads.through,
        skipped: reads.skipped,
        places: reads.places,
      }),
    });
  }
  if (readsEveryCardField(reads) || entry.channel !== "inf:cards") return text;
  const frame = JSON.parse(text);
  return JSON.stringify({ ...frame, payload: legacyCardSnapshot(frame.payload, reads) });
}

/** A look pushed to a view, without the choices it cannot read (`lookFor`). */
function lookPushFor(entry: JournalEntry, spelling: Spelling, unread: readonly string[]): string {
  const spelled = pushFrameIn(entry, spelling);
  const looks =
    entry.channel === "inf:shell:preferences" ||
    entry.channel === "inf:plugins:personal" ||
    entry.channel.startsWith("inf:devices") ||
    ADDRESS_CHANNELS.has(entry.channel);
  if (unread.length === 0 || !looks) return spelled;
  const frame = JSON.parse(spelled);
  return JSON.stringify({ ...frame, payload: lookFor(entry.channel, frame.payload, unread) });
}
