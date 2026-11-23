import type { Card } from "@shared/cards";
import { describe, expect, it } from "vitest";
import { setup } from "../../../tests/helpers/cardServiceHarness";
import { seedTask } from "../tasks/seedTask";
import { taskResultResponse } from "./answerTaskResponse";
import { type AskEnding, askEndingOf } from "./askEnding";
import type { CardService } from "./cardService";

/**
 * Saying you are done under an answer closes it, and no card comes back
 * (INF-2845, the captain's direction A: "the crewmate marks a reply that
 * says you are done, in any words, as closing, and a seen answer is never
 * asked for again"). Each test replays the order INF-2790's answer met -
 * a message, a crewmate's answering decision, the captain's line under it -
 * over a real task record, card store and message ending, with one clock so
 * "seen since the message" is an order, never a wall-clock window.
 */

const LEAVE = { id: "leave", label: "Leave them for now" };
const BUILD = { id: "build-three", label: "Build the three clear plans now", default: true };
const MERGE = {
  id: "merge",
  label: "Merge",
  default: true,
  effect: { kind: "merge", after: "close" },
} as const;

function fixture() {
  const clock = { t: 1_000 };
  const f = setup(undefined, () => clock.t);
  const later = () => {
    clock.t += 1_000;
  };
  let ending: AskEnding | undefined;
  // The answer task's close, as `DeclaredCloses.closeAnsweredTask` decides it.
  const cards: CardService = f.make(
    undefined,
    (card, response, action) => ending?.captainResponded(card, response, action),
    {
      closeAnsweredTask: (card, action, by) => {
        const record = card.taskId ? f.tasks.get(card.taskId) : undefined;
        if (!card.taskId || !taskResultResponse(card, record, action, by)) return false;
        f.tasks.close(card.taskId, { status: "done", reason: "answered", actor: "captain" });
        return true;
      },
    },
  );
  ending = askEndingOf(f.tasks, cards);
  seedTask(f.tasks, {
    id: "overlap",
    title: "Check which four plans stay clear of the restructure",
    status: "running",
    shape: { kind: "research", deliverable: "answer" },
  });
  later();
  f.tasks.capture.openAsk({
    id: "m1",
    text: "these 4 plans - is any of them unlikely to overlap?",
  });
  f.tasks.capture.attachAsk("m1", "overlap", "tool:spawn_crewmate");
  f.tasks.capture.closeAsk("m1", "closed");
  later();
  const answer = (
    input: Partial<Pick<Card, "actions" | "asking" | "title">> & { id?: string } = {},
  ): Card => {
    const id = cards.emitCrewmateCard(
      "overlap",
      {
        ...(input.id ? { id: input.id } : {}),
        title: input.title ?? "Three of the four plans can be built now",
        body: "<p>Three plans touch nothing the restructure moves.</p>",
        actions: input.actions ?? [LEAVE, BUILD],
        answering: true,
        ...(input.asking ? { asking: true } : {}),
      },
      "Check which four plans stay clear of the restructure",
      "model",
    );
    cards.closeOut({ kind: "crewmate", taskId: "overlap" }, "idle");
    later();
    return cards.get(id) as Card;
  };
  /**
   * The window had the card's current version in front of the captain, and
   * reports it as a window does (`reportDrawnUpdate`): the exact released
   * update once there is one, else the offer.
   */
  const see = (card: Card) => {
    const shown = cards.snapshot().find((entry) => entry.id === card.id);
    if (shown?.lifecycleId && shown.currentUpdateId) {
      cards.seenUpdate(card.id, shown.lifecycleId, shown.currentUpdateId);
    } else {
      cards.seen(card.id, card.offerId as string);
    }
    later();
  };
  /** The captain's line under the card, as the thread steer carries it to its crewmate. */
  const captainLine = (card: Card, text: string) => {
    const line = cards.addMessage(card.id, "captain", text);
    later();
    return line.id;
  };
  const thread = () => {
    const found = ending?.thread("m1");
    if (!found) throw new Error("No thread for m1");
    return found;
  };
  return { ...f, cards, ending, answer, see, captainLine, thread, later };
}

describe("signing an answer off from its thread (INF-2845)", () => {
  it("ends the message answered on the crewmate's mark, with the card off the stack and no ask after", () => {
    const f = fixture();
    const card = f.answer();
    f.see(card);
    const said = f.captainLine(card, "i'll take it from here");
    const text = f.cards.replyFromCrewmate("overlap", {
      cardId: card.id,
      text: "Understood; nothing more is needed from me.",
      answersMessage: said,
      signsOff: true,
    });
    expect(text).toContain(`It answers the captain's message ${said} and signs the answer off`);
    expect(f.cards.get(card.id)).toBeUndefined();
    expect(f.cardStore.listOpen().map((open) => open.id)).not.toContain(card.id);
    expect(f.tasks.get("overlap")).toMatchObject({ status: "done", closedReason: "answered" });
    expect(f.ending?.state(f.thread())).toEqual({ kind: "accepted", cardId: card.id });
    expect(f.ending?.crewmateStep("overlap")).toEqual([]);
    expect(f.ending?.closingPlace("overlap").kind).not.toBe("note");
  });

  it("refuses the mark on a merge card or a card still asking, and writes nothing", () => {
    const f = fixture();
    const merge = f.answer({ actions: [MERGE] });
    const said = f.captainLine(merge, "fine, done here");
    expect(
      f.cards.replyFromCrewmate("overlap", {
        cardId: merge.id,
        text: "Noted.",
        answersMessage: said,
        signsOff: true,
      }),
    ).toMatch(/^Nothing was written: /);
    expect(f.cards.messages(merge.id).map((line) => line.who)).toEqual(["captain"]);
    expect(f.cards.get(merge.id)).toBeDefined();
    expect(f.tasks.get("overlap")?.status).toBe("active");
  });

  it("refuses the mark on a card still asking and on an interim line", () => {
    const f = fixture();
    const asking = f.answer({ asking: true });
    const said = f.captainLine(asking, "that's all I needed");
    const reply = (interim: boolean) =>
      f.cards.replyFromCrewmate("overlap", {
        cardId: asking.id,
        text: "Noted.",
        answersMessage: said,
        signsOff: true,
        interim,
      });
    expect(reply(true)).toMatch(/^Nothing was written: /);
    expect(reply(false)).toMatch(/^Nothing was written: /);
    expect(f.cards.messages(asking.id).map((line) => line.who)).toEqual(["captain"]);
    expect(f.cards.get(asking.id)).toBeDefined();
    expect(f.tasks.get("overlap")?.status).toBe("active");
  });
});

describe("an answer the captain saw (INF-2845)", () => {
  it("is the message's answer once its work ends: the crewmate is not asked and no closing note goes up", () => {
    const f = fixture();
    const card = f.answer();
    f.see(card);
    // The captain puts it aside without a choice: the answer was in front of them.
    f.cards.dismiss(f.cards.get(card.id) as Card);
    expect(f.ending?.crewmateStep("overlap")).toEqual([]);
    f.cards.retireTaskCards("overlap", "answered");
    f.tasks.close("overlap", { status: "done", reason: "finished", actor: "firstmate" });
    expect(f.ending?.state(f.thread())).toEqual({ kind: "accepted", cardId: card.id });
    expect(f.ending?.closingPlace("overlap")).toEqual({ kind: "quiet" });
  });

  it("does not count once its own author withdrew it, so that crewmate is asked once", () => {
    const f = fixture();
    const card = f.answer();
    f.see(card);
    f.cards.close(card.id, { kind: "crewmate", taskId: "overlap" });
    expect(f.ending?.crewmateStep("overlap").map((thread) => thread.ask.id)).toEqual(["m1"]);
    expect(f.ending?.crewmateStep("overlap")).toEqual([]);
    f.tasks.close("overlap", { status: "done", reason: "finished", actor: "firstmate" });
    expect(f.ending?.state(f.thread())).toEqual({ kind: "missing" });
  });

  it("counts only when the captain saw it: an answer never in front of them is still asked for", () => {
    const f = fixture();
    const card = f.answer();
    f.cards.retireTaskCards("overlap", "answered");
    expect(f.cards.get(card.id)).toBeUndefined();
    expect(f.ending?.crewmateStep("overlap").map((thread) => thread.ask.id)).toEqual(["m1"]);
  });

  it("counts only the version the captain saw: a revision they never saw is still asked for", () => {
    const f = fixture();
    const first = f.answer({ id: "plans" });
    f.see(first);
    const revised = f.answer({ id: "plans", title: "Two of the four plans can be built now" });
    expect(revised.id).toBe(first.id);
    f.cards.retireTaskCards("overlap", "answered");
    expect(f.ending?.crewmateStep("overlap").map((thread) => thread.ask.id)).toEqual(["m1"]);
  });
});
