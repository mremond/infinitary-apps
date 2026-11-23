import type { Card, ChoiceCarriedRecord } from "@shared/cards";
import type { TaskRecord } from "../storage/taskRecords";
import { TaskService } from "../tasks/taskService";
import { taskResultResponse } from "./answerTaskResponse";
import type { AnswerTaskClosedPayload } from "./captainWakes";
import { SIGNED_OFF_ACTION_ID } from "./cardSignOff";
import type { SettleServiceHost } from "./settleHost";
import type { TaskClosing } from "./taskClose";

/**
 * The closes the host declares on a typed fact rather than a settle: an
 * answer the captain chose on its card, and the outcome a carrier held back
 * for the work it carries on. The first mate's own closes as done are one
 * close (`./doneClose.ts`).
 */
export class DeclaredCloses {
  constructor(
    private readonly host: SettleServiceHost,
    private readonly closing: TaskClosing,
  ) {}

  /**
   * The answer task's own close (Task B, captain F2 A). The captain's choice
   * on the card its own crewmate emitted closes it `done/answered`: the
   * deliverable was produced and he answered it, which is not the same as
   * declining a decision the Firstmate raised. The close control never
   * chooses or ends work. Only an ordinary note read or duplicate closure
   * notifies its live author; only the ordinary read acknowledges a note.
   * After that acknowledgement, the crewmate can report `finished` and the
   * Firstmate can settle the answer task `answered`. A marked saved answer
   * instead waits for explicit Done (`answer-done`), which receipts it and
   * closes the answer task `done/answered` without a `card-closed` steer.
   * Interrupt, cancel and `update_task drop` keep their own closes.
   */
  closeAnsweredTask(
    card: Card,
    action: string,
    by: "captain" | "firstmate" | "crewmate",
    carried?: ChoiceCarriedRecord,
  ): boolean {
    const record = card.taskId ? this.host.tasks.get(card.taskId) : undefined;
    if (!taskResultResponse(card, record, action, by) || !record || !card.taskId) return false;
    const choice = card.actions.find((entry) => entry.id === action);
    // A plain result choice is a receipt, never consent or a merge effect.
    // Change tasks still wait for an explicit answered settle and a clean-work check.
    if (choice && !choice.effect)
      this.host.tasks.capture.recordResultHandoff(record.id, { cardId: card.id, action });
    if (this.host.deliverableOf(record) !== "answer") return false;
    const text = choice
      ? `chose "${choice.label}"`
      : action === SIGNED_OFF_ACTION_ID
        ? "signed off under the answer"
        : "marked answer Done";
    // An invalid action never produces a closure-choice wake.
    const handoff = choice ? this.answerTaskClosedPayload(record, card, choice) : undefined;
    void this.closing
      .closeTask(card.taskId, {
        status: "done",
        reason: "answered",
        actor: "captain",
        text,
        ...(handoff ? { answerHandoff: handoff } : {}),
        ...(handoff && carried ? { answerCarried: carried } : {}),
      })
      .catch(() => {});
    return true;
  }

  private answerTaskClosedPayload(
    task: TaskRecord,
    card: Card,
    choice: Card["actions"][number],
  ): AnswerTaskClosedPayload {
    return {
      version: 1,
      event: "answer_task_closed",
      task: { id: task.id, key: task.key, title: task.title },
      card: { id: card.id, title: card.title },
      choice: { id: choice.id, label: choice.label, effect: choice.effect ?? null },
      close: { status: "done", reason: "answered", actor: "captain" },
    };
  }

  /**
   * The outcome of a carrier that closed before the work it carries on
   * (INF-1825): the old task's message held it back while that task was
   * open, and the old task's close puts up nothing of its own, so the
   * carrier's outcome is placed once, where it would have gone. The carry
   * link says which task carries it (`carrierOf`), and a message whose
   * thread holds the old task is what held it back (INF-6115). A carrier
   * that ends dropped is never one: a dropped task carries no work on
   * (`carrierRefusal`), so it was reached only through a link left from
   * before its drop, and its old line is no news (INF-3418).
   */
  placeHeldOutcome(oldId: string): void {
    const carrier = this.host.tasks.graph.carrierOf(oldId);
    if (!carrier || carrier.id === oldId || !TaskService.isClosed(carrier)) return;
    if (carrier.status === "dropped") return;
    if (!carrier.closedReason) return;
    if (this.host.askEnding.threadsOf(oldId).length === 0) return;
    const close = this.host.tasks
      .timeline(carrier.id)
      .findLast(
        (event) =>
          event.data?.status === carrier.status && event.data?.reason === carrier.closedReason,
      );
    if (!close) return;
    const sentence =
      typeof close.data?.closingSentence === "string" ? close.data.closingSentence : undefined;
    const actor = close.actor === "captain" || close.actor === "firstmate" ? close.actor : "host";
    this.closing.placeOutcome(carrier, carrier.closedReason, actor, sentence);
  }
}
