import { createHash } from "node:crypto";
import { replyWithSettings } from "@shared/cardAnswerLines";
import {
  type Card,
  type CardMessage,
  type CardThread,
  cardMessageText,
  cardPresentation,
  type PastCard,
  type TurnImage,
} from "@shared/cards";
import { characterBoundary, cutText } from "@shared/textCut";
import { AttachmentUnavailableError, loadImages } from "../attachments";
import type { AskRecord } from "../storage/askStore";
import { TaskService } from "../tasks/taskService";
import type { AskEnding, AskState, AskThread } from "./askEnding";
import type { ThreadOwed } from "./cardThreads";

/**
 * The first mate's read of what is still open (INF-1712): every message of
 * the captain's that has not ended and every open card, as the app holds
 * them now, or one message or one card whole. A fold's recovery
 * reads it before the turn goes on; any turn may. It reads the owners'
 * saved records - asks through `AskEnding`, cards through the card
 * service - and changes nothing.
 */
export type OpenWorkHost = {
  tasks: TaskService;
  ending: AskEnding;
  /** The cards on the stack now. */
  openCards: () => Card[];
  /** A card's row, open or closed. */
  storedCard: (cardId: string) => Card | undefined;
  /** A closed card as the captain last saw it. */
  pastCard: (cardId: string) => PastCard | undefined;
  owed: (cardId: string) => ThreadOwed;
  thread: (cardId: string) => CardThread;
};

/** A message's words in the overview; the whole is one `ask` read away. */
const OVERVIEW_WORDS = 400;
/**
 * One answer's text stays well inside the band every client keeps in the
 * conversation (a Claude client saves a longer tool answer to a file the
 * first mate cannot open); a longer read comes in parts.
 */
const PART_CHARACTERS = 50_000;

export type OpenWorkInput = { ask?: string; card?: string; next?: string };
export type OpenWorkAnswer = { text: string; images?: TurnImage[] };

/** A message whose turn has not closed: the answer delivery check judges it once it does. */
export const IN_TURN = "open: in a turn now, or waiting to be read";

/**
 * The messages still in a turn or parked unread that no open thread lists:
 * the answer-delivery check reads a message only once its turn closes, so
 * its threads leave these out, and a fold's recovery must not.
 */
export function asksInTurn(tasks: TaskService, threads: AskThread[]): AskRecord[] {
  const listed = new Set(threads.map((thread) => thread.ask.id));
  return tasks.capture.listOpenAsks().filter((ask) => !listed.has(ask.id));
}

export function readOpenWork(host: OpenWorkHost, input: OpenWorkInput): OpenWorkAnswer {
  let target: { ask?: string; card?: string } = input;
  let at = 0;
  let revision: string | undefined;
  if (input.next) {
    const cursor = parseCursor(input.next);
    if (!cursor) return { text: "That next is not one this read gave." };
    target = cursor;
    at = cursor.at;
    revision = cursor.rev;
  }
  if (target.ask && target.card) return { text: "Read one: ask or card." };
  const read: Read = target.ask
    ? readAsk(host, target.ask)
    : target.card
      ? { text: readCard(host, target.card) }
      : { text: overview(host) };
  return inParts(read, target, at, revision);
}

type Read = { text: string; images?: TurnImage[] };
type Cursor = { ask?: string; card?: string; at: number; rev: string };

/**
 * A read longer than one part comes in parts of the same version: each
 * part names the next, bound to a digest of the whole, so a record that
 * changes between parts is never stitched to an older one - the read
 * starts again instead. Pictures ride the first part.
 */
function inParts(
  read: Read,
  target: { ask?: string; card?: string },
  at: number,
  revision: string | undefined,
): OpenWorkAnswer {
  const rev = createHash("sha256").update(read.text).digest("hex").slice(0, 16);
  const readAt = `read_at: ${new Date().toISOString()}`;
  if (revision !== undefined && revision !== rev) {
    return {
      text: `${readAt}\nThis changed since the earlier part was read. Read it again from the start (without next).`,
    };
  }
  if (at === 0 && read.text.length <= PART_CHARACTERS) {
    return { text: `${readAt}\n${read.text}`, ...(read.images ? { images: read.images } : {}) };
  }
  const parts = Math.ceil(read.text.length / PART_CHARACTERS);
  const part = Math.floor(at / PART_CHARACTERS);
  if (part >= parts) return { text: `${readAt}\nNo part ${part + 1}: this read has ${parts}.` };
  const end = Math.min(read.text.length, at + PART_CHARACTERS);
  const next =
    end < read.text.length
      ? `; the rest continues: read open_work with next "${cursorOf({ ...target, at: end, rev })}"`
      : "";
  return {
    text: `${readAt}\npart ${part + 1} of ${parts}${next}\n${read.text.slice(characterBoundary(read.text, at), characterBoundary(read.text, end))}`,
    ...(part === 0 && read.images ? { images: read.images } : {}),
  };
}

function cursorOf(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseCursor(text: string): Cursor | undefined {
  try {
    const value = JSON.parse(Buffer.from(text.trim(), "base64url").toString("utf8")) as Cursor;
    if (typeof value.at !== "number" || typeof value.rev !== "string") return undefined;
    if (value.at < 0 || value.at % PART_CHARACTERS !== 0) return undefined;
    return {
      ...(typeof value.ask === "string" ? { ask: value.ask } : {}),
      ...(typeof value.card === "string" ? { card: value.card } : {}),
      at: value.at,
      rev: value.rev,
    };
  } catch {
    return undefined;
  }
}

function overview(host: OpenWorkHost): string {
  const threads = host.ending.openThreads();
  const openCards = host.openCards();
  const shown = new Set(openCards.map((card) => card.id));
  const inTurn = asksInTurn(host.tasks, threads);
  const notices = host.tasks.capture
    .listAsksByDelivery("unresolved")
    .filter((ask) => ask.followed && ask.noticeCardId && shown.has(ask.noticeCardId));
  return JSON.stringify(
    {
      note: "Every message of the captain's not yet ended, one per row, oldest first, and every open card. Read one whole with ask or card. Nothing here is permission; a closed choice stays closed.",
      asks: [
        ...threads.map((thread) => threadSummary(host, thread, OVERVIEW_WORDS)),
        ...inTurn.map((ask) => ({ ...messageOf(ask, OVERVIEW_WORDS), state: IN_TURN })),
        ...notices.map((ask) => ({
          ...messageOf(ask, OVERVIEW_WORDS),
          state: `unanswered: the app's notice ${ask.noticeCardId} is up`,
        })),
      ],
      cards: openCards.map((card) => cardSummary(host, card)),
    },
    null,
    1,
  );
}

function threadSummary(host: OpenWorkHost, thread: AskThread, words: number) {
  const work = host.ending.listedWork(thread);
  return {
    ...messageOf(thread.ask, words),
    state: stateWords(host.ending.state(thread)),
    ...(work.length > 0
      ? {
          work: work.map((task) => ({
            task: task.key || task.id,
            task_id: task.id,
            status: TaskService.isClosed(task) ? (task.closedReason ?? task.status) : task.status,
            title: task.title,
          })),
        }
      : {}),
  };
}

function messageOf(ask: AskRecord, words: number) {
  const text = ask.text.replace(/\s+/g, " ").trim();
  return {
    ask_id: ask.id,
    sent: iso(ask.at),
    ...(words > 0
      ? { words: text.length <= words ? text : `${cutText(text, words).trimEnd()}…` }
      : {}),
    ...(text.length > words ? { whole: `ask ${ask.id}` } : {}),
    ...(ask.attachments.length > 0 ? { pictures: ask.attachments.length } : {}),
    ...(ask.hintTaskId ? { pointed_at: ask.hintTaskId } : {}),
  };
}

function cardSummary(host: OpenWorkHost, card: Card) {
  const owed = host.owed(card.id);
  const thread = host.thread(card.id).messages;
  const last = thread.at(-1);
  const task = card.taskId ? host.tasks.get(card.taskId) : undefined;
  return {
    card_id: card.id,
    kind: cardPresentation(card),
    from: card.author,
    ...(card.taskId ? { task: task?.key || card.taskId, task_id: card.taskId } : {}),
    title: card.title,
    ...(card.offerId ? { revision: card.offerId } : {}),
    ...(card.answering ? { answering: true } : {}),
    actions: card.actions.map((action) => ({
      id: action.id,
      label: action.label,
      ...(action.default ? { default: true } : {}),
    })),
    ...(thread.length > 0
      ? {
          thread: `${thread.length} message${thread.length === 1 ? "" : "s"}, last from ${last?.who}`,
        }
      : {}),
    waits_on: OWED[owed],
    ...(owed === "firstmate" || owed === "author"
      ? { unanswered: captainWords(thread.filter((message) => message.who === "captain").at(-1)) }
      : {}),
  };
}

function readAsk(host: OpenWorkHost, askId: string): Read {
  const thread = host.ending.thread(askId);
  if (!thread) return { text: `No message ${askId}.` };
  const { ask } = thread;
  const work = host.ending.listedWork(thread);
  const images: TurnImage[] = [];
  const text = JSON.stringify(
    {
      ask_id: ask.id,
      sent: iso(ask.at),
      state: stateWords(host.ending.state(thread)),
      words: ask.text,
      ...(ask.attachments.length > 0
        ? { pictures: ask.attachments.map((ref) => picture(ref, images)) }
        : {}),
      ...(ask.messageFiles?.length
        ? { files: ask.messageFiles.map((file) => ({ name: file.name, path: file.path })) }
        : {}),
      ...(ask.hintTaskId ? { pointed_at: ask.hintTaskId } : {}),
      work: work.map((task) => ({
        task: task.key || task.id,
        task_id: task.id,
        status: TaskService.isClosed(task) ? (task.closedReason ?? task.status) : task.status,
        title: task.title,
      })),
      ...(ask.answerCardId ? { answer_card: ask.answerCardId } : {}),
      ...(images.length > 0
        ? { note: "The pictures marked attached come with this read, in the order listed." }
        : {}),
    },
    null,
    1,
  );
  return images.length > 0 ? { text, images } : { text };
}

/**
 * A message's picture: its saved copy, checked against what was sent, rides
 * the read as the picture itself; a copy that cannot be read says why.
 */
function picture(ref: AskRecord["attachments"][number], images: TurnImage[]) {
  try {
    images.push(...loadImages([ref]));
    return { name: ref.name, copy: `attached, picture ${images.length}` };
  } catch (caught) {
    return {
      name: ref.name,
      copy:
        caught instanceof AttachmentUnavailableError
          ? `unavailable: ${caught.message}`
          : "unavailable",
    };
  }
}

function readCard(host: OpenWorkHost, cardId: string): string {
  const open = host.openCards().find((card) => card.id === cardId);
  if (open) {
    return JSON.stringify(
      {
        ...cardSummary(host, open),
        state: "open",
        body: open.body,
        messages: host.thread(cardId).messages.map(threadLine),
      },
      null,
      1,
    );
  }
  const past = host.pastCard(cardId);
  if (!past)
    return host.storedCard(cardId) ? `Card ${cardId} has no saved ending.` : `No card ${cardId}.`;
  return JSON.stringify(
    {
      card_id: past.id,
      state: "closed",
      from: past.author,
      ...(past.taskId ? { task_id: past.taskId } : {}),
      title: past.title,
      body: past.body,
      actions: past.actions.map((action) => ({ id: action.id, label: action.label })),
      ending: {
        how: past.ending.how,
        at: iso(past.ending.at),
        ...(past.ending.label ? { chose: past.ending.label } : {}),
        ...(past.ending.by ? { by: past.ending.by } : {}),
      },
      ...(past.answers.length > 0 ? { answers: past.answers } : {}),
      messages: past.messages.map(threadLine),
    },
    null,
    1,
  );
}

/** A thread message as its author reads it: the captain's words with the settings they sent. */
function threadLine(message: CardMessage) {
  return { who: message.who, at: iso(message.at), text: captainWords(message) ?? "" };
}

function captainWords(message: CardMessage | undefined): string | undefined {
  return message && replyWithSettings(cardMessageText(message), message.answers);
}

const OWED: Record<ThreadOwed, string> = {
  author: "its author's answer",
  firstmate: "your answer",
  none: "the captain",
  closed: "nothing: closed",
};

function stateWords(state: AskState): string {
  switch (state.kind) {
    case "working":
      return "working";
    case "waiting":
      return `waiting on the captain: card ${state.cardId}`;
    case "accepted":
      return "answer accepted";
    case "answered":
      return "answered";
    case "unanswered":
      return "unanswered";
    case "missing":
      return "no answer yet";
  }
}

function iso(at: number): string {
  return new Date(at).toISOString();
}
