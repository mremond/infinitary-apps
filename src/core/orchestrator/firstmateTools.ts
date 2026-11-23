import { randomUUID } from "node:crypto";
import type { AttachmentRef } from "@shared/attachments";
import type { CardMutation, TurnImage } from "@shared/cards";
import { deviceUpdateCardOfOffer } from "@shared/deviceUpdateNudge";
import type { HostReplyEmote } from "@shared/emotes";
import { cardWordsMark, saidMark } from "@shared/i18n/said";
import { shortTaskTitle } from "@shared/taskTitle";
import { loadImages } from "../attachments";
import type { CoreDispatch } from "../dispatcher";
import {
  KNOWLEDGE_TOOL,
  knowledgeBinding,
  RECORD_KNOWLEDGE_TOOL,
} from "../knowledge/knowledgeTools";
import { createAppTools } from "../pi/appTools";
import { lintFirstmateCard, steerNotAnswerRefusal } from "../pi/cardLint";
import {
  createCloseCardTool,
  createEmitCardTool,
  type EmittedCard,
  resolveFirstmateCardId,
} from "../pi/cardTool";
import { createCorrectionTool } from "../pi/correctionTool";
import { type CrewDelegate, createCrewTools } from "../pi/crewTools";
import { createEmoteTool } from "../pi/emoteTool";
import { createIntegrationTools } from "../pi/integrationTools";
import { createLocateProjectTool } from "../pi/locateTool";
import { createOpenWorkTool } from "../pi/openWorkTool";
import { createPersonalizeTool } from "../pi/personalizeTool";
import { createInstallPluginTool } from "../pi/pluginTools";
import { createScheduleTools } from "../pi/scheduleTools";
import { createSecretTools } from "../pi/secretTools";
import {
  createFlagDuplicateTool,
  createFlagMissedEscalationTool,
  createSupervisionLogTool,
} from "../pi/supervisionTools";
import { createTaskTools } from "../pi/taskTools";
import { secretAskCardId } from "../secrets/askCard";
import { type BoundTool, bindTool } from "../session/tools";
import type { SettleRefusal } from "../tasks/taskGraph";
import { TaskService } from "../tasks/taskService";
import { locateProject, renderLocated } from "../workspace/projectLocator";
import {
  ANSWER_ONLY_REFUSAL,
  ANSWER_ONLY_REFUSED_TOOLS,
  type DeliveryRefusal,
  excerptOf,
} from "./answerDelivery";
import type { AnswerDeliveryCheck } from "./answerDeliveryCheck";
import { withAskAttribution } from "./askAttribution";
import type { AskCapture } from "./askCapture";
import { captainWordsIn, OVERRIDE_REFUSED } from "./captainOverrides";
import { FIRSTMATE_CARD_PREFIX, type OwnCardWrite } from "./cardEmit";
import { ownCardLineWords } from "./cardMutationText";
import { escapeCardText } from "./cardText";
import type { DecisionCapture } from "./decisionCapture";
import { premiumCanServe } from "./firstmateModelPick";
import { type FirstmateTaskToolsHost, firstmateTaskTools } from "./firstmateTaskTools";
import { readOpenWork } from "./openWork";
import { startedReply } from "./replyLine";
import { writeStartedLine } from "./startedFromCard";

/**
 * The first mate's tools (docs/orchestrator-contract.md): cards, crew,
 * the task graph, schedules, knowledge, integrations, app actions and
 * personalize, each reporting what took effect for the answer-delivery
 * check and the reply line. Built at each attachment from what the agent
 * lends them (`FirstmateToolHost`).
 */

/** What the tools reach of the first mate agent: its options, the running turn and its captures. */
export type FirstmateToolHost = FirstmateTaskToolsHost & {
  readonly decisions: DecisionCapture;
  readonly delivery: AnswerDeliveryCheck;
  /** The app's catalog dispatch, once the window has bound it. */
  appDispatch(): CoreDispatch | undefined;
  replyEmote(emote: HostReplyEmote): void;
  sessionFile(): string | null;
};

// Inferred, never annotated `BoundTool[]`: the e2e stand-ins type their
// scripted calls from this list (`tests/helpers/scriptedCalls.ts`).
export function buildFirstmateTools(host: FirstmateToolHost) {
  const supervisor = host.options.supervisor;
  // Knowledge (docs/knowledge.md) runs in every build.
  // A write that changed the collection is the turn's action; a read,
  // a refusal or a repeated request is not.
  const knowledge = host.options.knowledge && {
    knowledge: knowledgeBinding(
      host.options.knowledge,
      () => ({ kind: "firstmate", origin: host.turn.origin, canCreate: host.turn.canCreate }),
      (outcome, input) => {
        host.noteDelivery({
          outcome: "action",
          kind: "record",
          tool: "record_knowledge",
          ...(outcome.ids[0] ? { ref: outcome.ids[0] } : {}),
        });
        if (input.action === "publish" || input.action === "revise") host.replyEmote("tuck");
      },
    ),
  };
  // A close the first mate asked for (INF-547): it carries the first mate's
  // sentence, keyed by the record whichever reference named it, and a
  // close that took effect is the turn's action.
  const settled = async (
    taskId: string,
    closingSentence: string | undefined,
    close: () => Promise<{ text: string; ok?: boolean; refusal?: SettleRefusal }>,
  ): Promise<{ text: string; ok?: boolean; refusal?: SettleRefusal }> => {
    const result = closingSentence
      ? await supervisor.settling.closing.withClosingSentence(
          host.options.tasks.resolve(taskId)?.id ?? taskId,
          closingSentence,
          close,
        )
      : await close();
    const status = host.options.tasks.get(taskId)?.status;
    if (!result.refusal && (status === "done" || status === "dropped")) {
      host.turn.delivered = true;
      host.noteDelivery({ outcome: "action", kind: "work", tool: "settle_task", ref: taskId });
      // The parent this close left with no open part, named for the first mate to judge (INF-4509).
      const parent = supervisor.intake.parentCloseNote(taskId);
      if (parent) return { ...result, text: `${result.text} ${parent}` };
    }
    return result;
  };
  /** The captain's message an expected answer is asked for: the action's own. */
  const askFor = (response?: import("@shared/crewResponses").AskedResponsePolicy) =>
    (response?.mode ?? "expected") === "expected" ? host.asks.current()?.id : undefined;
  /**
   * A steer that asks for an answer ties its message to the task, so the
   * message waits for that answer and not for the task's close; one that
   * only passes guidance on makes the task the message's work, as before.
   */
  const steerTie = (response?: import("@shared/crewResponses").AskedResponsePolicy) =>
    askFor(response) ? ("tie" as const) : undefined;
  /** A first mate steer's source, read from this turn as it stands. */
  const steerSource = (response?: import("@shared/crewResponses").AskedResponsePolicy) => ({
    via: "tool" as const,
    decision: host.decisions.current() ?? null,
    response: {
      mode: response?.mode ?? "expected",
      sourceSession: host.sessionFile(),
      ...(response?.card ? { card: response.card } : {}),
      ...(response?.cancel ? { cancel: response.cancel } : {}),
      ...(askFor(response) ? { ask: askFor(response) } : {}),
    },
    // In a turn that carries the captain's own words, the steer is his
    // guidance: it holds a kept merge until its crewmate declares it (FI3-662).
    captainWords: host.turn.origin === "captain-turn",
    ...steeredPictures(host.asks),
  });
  /** A steer the first mate's tool accepted. */
  const steered = (taskId: string) => {
    host.turn.delivered = true;
    // A steer the app saved because the crewmate's account is held counts
    // too (the captain's call; paused accounts are FI3-592's).
    host.noteDelivery({ outcome: "action", kind: "work", tool: "steer_crewmate", ref: taskId });
    // Every delivery outcome means the guidance is on its way (a refused
    // steer throws before this): the captain gets a "got it".
    host.replyEmote("nod");
  };
  const delegate: CrewDelegate = {
    escalationEligible: (taskId) => supervisor.escalationEligible(taskId),
    premiumCanServe: () => premiumCanServe(host.options),
    ...(host.options.markBatchRepair ? { markBatchRepair: host.options.markBatchRepair } : {}),
    commission: async (input) => {
      // The message's pictures ride the brief, which goes out before the
      // message attaches to the new task below.
      const attachments = host.asks.currentPictures();
      // The answer waits for the record, never for the start (INF-3060).
      const origin = host.asks.startOrigin();
      const handle = await supervisor.intake.commission({
        ...input,
        ...(origin ? { origin } : {}),
        messageFiles: host.asks.current()?.messageFiles ?? [],
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      // Attach first (P1): the ask that caused the spawn is about the new task.
      host.asks.attach(handle.taskId, "spawn_crewmate", true);
      const started = host.options.tasks.get(handle.taskId)?.title;
      if (started) host.turn.replyFacts.app = startedReply(started);
      host.noteDelivery({
        outcome: "action",
        kind: "work",
        tool: "spawn_crewmate",
        ref: handle.taskId,
      });
      return handle;
    },
    startedFrom: (cardId, taskId, queued) => {
      const task = host.options.tasks.get(taskId);
      if (!task) return "";
      const line = writeStartedLine(supervisor.cards, cardId, task, queued);
      // The started task keeps which card's reply started it, so the
      // card's own answer task can close as carried on by it (INF-4526).
      if (line.reply)
        host.options.tasks.capture.recordStartedFromCard(task.id, {
          cardId: line.reply.cardId,
          reply: line.reply.id,
        });
      return line.text;
    },
    // The ask is about the task the captain named, whatever the tool then
    // says about it - a refused settle is still about that task.
    steerCrewmate: async (taskId, message, response) => {
      host.asks.attach(taskId, "steer_crewmate", undefined, steerTie(response));
      // The answer waits for the message's record, never its delivery (INF-3060).
      const delivery = await supervisor.steer.steerCrewmate(taskId, message, "firstmate", {
        ...steerSource(response),
        behind: true,
      });
      steered(taskId);
      return delivery;
    },
    laneHold: (taskId) => supervisor.facts.laneHold(taskId),
    handFiles: (fromTask, toTask) => supervisor.sessions.handFiles(fromTask, toTask),
    // The hand-over's checks answer now; its copy and the steer after it go
    // on behind the answer, read from this turn as it stands (INF-3060).
    steerAfterFiles: async (fromTask, taskId, message, response) => {
      host.asks.attach(taskId, "steer_crewmate", undefined, steerTie(response));
      await supervisor.steer.steerAfterFiles(fromTask, taskId, message, steerSource(response));
      steered(taskId);
    },
    interruptCrewmate: async (taskId, mode, closingSentence) => {
      // About the task even when refused; its work once it takes effect.
      host.asks.attach(taskId, "interrupt_crewmate", undefined, "tie");
      await supervisor.sessions.interruptCrewmate(
        taskId,
        mode,
        {
          actor: "firstmate",
          via: "tool",
          decision: host.decisions.current() ?? null,
        },
        closingSentence,
      );
      host.asks.attach(taskId, "interrupt_crewmate");
      host.turn.delivered = true;
      host.noteDelivery({
        outcome: "action",
        kind: "work",
        tool: "interrupt_crewmate",
        ref: taskId,
      });
    },
    crewStatus: (taskId) => supervisor.facts.crewStatus(taskId),
    moveTask: async (taskId, computer, keep, leaveBehind) => {
      const done =
        computer === null
          ? supervisor.moves.cancelComputerMove(taskId, "firstmate")
          : await supervisor.moves.requestComputerMove(
              taskId,
              computer,
              "firstmate",
              keep,
              leaveBehind === true,
            );
      if (done.ok) {
        host.turn.delivered = true;
        host.noteDelivery({ outcome: "action", kind: "work", tool: "move_task", ref: taskId });
      }
      return done;
    },
    // The escalation gate (S4): the same wake stamp memory and the miss
    // label read, so `escalate_from` is reachable only from a turn that
    // carries the captain's own words.
    isCaptainTurn: () => host.turn.origin === "captain-turn",
    settleTask: async (taskId, mode, confirm, proceedWithOpen, closingSentence) => {
      // About the task even when refused; its work once it takes effect.
      host.asks.attach(taskId, "settle_task", undefined, "tie");
      const settle = (): Promise<{ text: string; ok: boolean; refusal?: SettleRefusal }> =>
        supervisor.settling.settle.settleTaskDetailed(taskId, mode, confirm, proceedWithOpen);
      const { ok, ...result } = await settled(taskId, closingSentence, settle);
      if (ok) host.asks.attach(taskId, "settle_task");
      return result;
    },
    closeDone: async (taskId, input) => {
      // About the task even when refused; its work once the close takes effect.
      host.asks.attach(taskId, "settle_task", undefined, "tie");
      const record = host.options.tasks.resolve(taskId);
      if (!record) return { text: `Not closed: there is no task "${taskId}".` };
      // The captain's own words, checked as an override's are: this turn's,
      // or the words on this task the first mate cites (INF-1216). His
      // click on a merge approves that merge, never a close.
      let captainWords: string | undefined;
      const from = input.captainWordsFrom?.trim();
      if (from) {
        const said = captainWordsIn(host.turn, from, (cited) =>
          supervisor.overrides.citedCaptainWords(record.id, cited),
        );
        if (!said.ok) return { text: said.text.replace(OVERRIDE_REFUSED, "Not closed:") };
        if (said.mergeClick)
          return {
            text: "Not closed: the words cited are the captain's click on a merge, which approves that merge and asks no close. Cite their words that ask the close, or close without captain_words.",
          };
        captainWords = said.words;
      }
      const close = () =>
        supervisor.settling.done.close(record.id, {
          ...(input.why ? { why: input.why } : {}),
          ...(input.carriedBy ? { carriedBy: input.carriedBy } : {}),
          ...(input.deliveredIn ? { deliveredIn: input.deliveredIn } : {}),
          ...(input.evidence ? { evidence: input.evidence } : {}),
          ...(captainWords ? { captainWords } : {}),
          ...(input.dropWaiting?.length ? { dropWaiting: input.dropWaiting } : {}),
        });
      const { ok, ...result } = await settled(record.id, input.closingSentence, close);
      if (ok) host.asks.attach(record.id, "settle_task");
      return result;
    },
  };
  const scheduler = host.options.scheduler;
  const flagMissedEscalation = host.options.flagMissedEscalation;
  const flagDuplicate = host.options.flagDuplicate;
  const personalize = host.options.personalize;
  const installPlugin = host.options.installPlugin;

  const forges = host.options.forges;
  const locate =
    host.options.locateProject ??
    (async (name: string) => {
      const found = locateProject(name, {
        managed: host.options.repos
          .list()
          .map((repo) => ({ id: repo.id, name: repo.name, path: repo.path })),
      });
      const local = renderLocated(name, found);
      const remote = forges ? await forges.remoteProjects(name, found.length > 0) : "";
      return remote ? `${local}\n\n${remote}` : local;
    });
  // The typed reason the last refused card gives, read off the lint: a card
  // refused for a crewmate's own card on the task names that card.
  let cardOwner: { id: string } | undefined;
  // Only a write that changed the record is an action; an unchanged card
  // took no effect and a refusal changed nothing. A line alone in an open
  // card's thread is the first mate's words in its replies, which answer
  // the messages it read; a revision shows the card again. A closed card's
  // dated clarification keeps the card's kind.
  const noteTyped = (mutation: CardMutation): void => {
    if (mutation.effect === "refused") {
      host.noteDelivery({ outcome: "refused", tool: "emit_card", reason: "card-refused" });
    } else if (mutation.effect !== "unchanged") {
      const inThread = mutation.effect === "reply-only" && !mutation.clarification;
      host.noteDelivery({
        outcome: "action",
        kind: inThread ? "reply" : "card",
        tool: "emit_card",
        ref: mutation.cardId,
      });
    }
  };
  const emitCard = createEmitCardTool(
    (card) => {
      // A write on someone else's card is a contribution
      // (docs/card-threads.md, "Shared cards"): it keeps that card's
      // author, task and answerer, files nothing and answers its typed result.
      const contribution = supervisor.contributeAsFirstmate(card);
      if (contribution) {
        noteTyped(contribution);
        return contribution;
      }
      const written: OwnCardWrite = {};
      const cardId = supervisor.addFirstmateCard(card, written);
      host.decisions.noteCard(cardId);
      // Attach first (P1): the card lands on its task, or files one.
      recordCardFiling(host, card, cardId);
      supervisor.declareStandaloneRequiredActions(card, cardId);
      // A write that left the card as it was and added a line is the first
      // mate's words in the card's thread, never a card shown again, so it is
      // a reply on that card, named or not (INF-5202). A required-action
      // card keeps the app's own body and controls, so every write on it is
      // one (INF-4667 finding 3).
      const inThread = written.line !== undefined && written.changed === false;
      host.noteDelivery({
        outcome: "action",
        kind: inThread ? "reply" : "card",
        tool: "emit_card",
        ref: cardId,
      });
      // The receipt says what the line did, so one answer is never written twice.
      return written.line ? { shown: cardId, line: ownCardLineWords(written) } : cardId;
    },
    (card) => {
      // Someone else's card keeps its own rules: the contribution refuses
      // what its writer may not change, so this card's lint is not its.
      if (supervisor.writesOnOthersCard(card.id)) return undefined;
      let crewCard: { id: string; title: string; taskId: string } | undefined;
      const refusal = lintFirstmateCard(card, {
        resolveCardId: resolveFirstmateCardId,
        taskExists: (taskId) => Boolean(host.options.tasks.get(taskId)),
        taskResolves: (ref) => Boolean(host.options.tasks.resolve(ref)),
        taskClosed: (taskId) => {
          const record = host.options.tasks.get(taskId);
          return Boolean(record && TaskService.isClosed(record));
        },
        // Steer, not answer (WI-12): the stack decides, not a turn flag.
        openCrewmateCard: (ref) => {
          // A task closed done keeps its crewmate's notes, but the crewmate
          // is gone: there is nobody to steer, so its note is no refusal.
          // A note's related task may be named by its key.
          const record = host.options.tasks.resolve(ref);
          if (!record || TaskService.isClosed(record)) return undefined;
          const crew = supervisor.cards
            .openCardDigests(record.id)
            .filter((open) => open.emitter === "crewmate")
            .at(-1);
          crewCard = crew ? { id: crew.id, title: crew.title, taskId: ref } : undefined;
          return crewCard;
        },
        // A revision of the first mate's own open card is not a second
        // answer: one on the task, or one of its own that names no task.
        isOpenFirstmateCard: (cardId, ref) => {
          const open = supervisor.cards.get(cardId);
          if (!open || !cardId.startsWith(FIRSTMATE_CARD_PREFIX)) return false;
          return open.taskId === undefined || open.taskId === host.options.tasks.resolve(ref)?.id;
        },
        openCardOnTask: (cardId, ref) => {
          const task = host.options.tasks.resolve(ref);
          return Boolean(task && supervisor.cards.get(cardId)?.taskId === task.id);
        },
        // The merge decision is the crewmate's (contract v3.6, captain
        // lock 3): a settle merge card is refused while its task's own
        // crewmate has yet to emit its merge card.
        crewmateOwesCompletion: (taskId) => supervisor.crewmateCards.crewmateOwesCompletion(taskId),
      });
      cardOwner =
        refusal !== undefined &&
        crewCard &&
        refusal === steerNotAnswerRefusal(crewCard.taskId, crewCard)
          ? { id: crewCard.id }
          : undefined;
      return refusal;
    },
    {
      role: "firstmate",
      // Its body left out, the write is a line on the card's thread alone,
      // on its own card as on anyone's, and the card stays as it is
      // (INF-6128). The id resolves as a revision's would: a card on the
      // record by its own id, else its own card under that stable id.
      onReplyAlone: (reply) => {
        const target = supervisor.cards.targetOf({ actor: "firstmate" }, reply.cardId);
        const cardId = target.kind === "new" ? resolveFirstmateCardId(reply.cardId) : target.id;
        const mutation = supervisor.cards.replyAs({ actor: "firstmate" }, { ...reply, cardId });
        noteTyped(mutation);
        return mutation;
      },
    },
  );
  const emitCardTool = {
    ...emitCard,
    run: async (params: Parameters<typeof emitCard.run>[0]) => {
      cardOwner = undefined;
      try {
        return await emitCard.run(params);
      } catch (caught) {
        // A refused card is saved with its typed reason: it voids a
        // reaction after it, and the retry and the notice can name it.
        const reason: DeliveryRefusal = cardOwner ? "crewmate-owns" : "card-refused";
        host.noteDelivery({
          outcome: "refused",
          tool: "emit_card",
          reason,
          ...(cardOwner ? { ref: (cardOwner as { id: string }).id } : {}),
        });
        throw caught;
      }
    },
  };
  const tools = [
    // The emit_card boundary runs the card lint: attach-first, the
    // carded-task refusal (WI-12), the settle-needs-a-task check, and the
    // shape rules (WI-11). A refused card returns corrective text and is
    // never shown. The description is the card contract plus the
    // Firstmate's addendum, and only this role's schema carries task_id
    // and related (contract v2.0, INF-2714).
    emitCardTool,
    createCloseCardTool((input) => {
      // The messages a step has read that wait on this card, before the close (INF-2664).
      const ending = supervisor.askEnding;
      const waiting = ending.openThreads(true).filter((thread) => {
        const { ask } = thread;
        if (ask.turnState === "open" && !host.turn.read.has(ask.id)) return false;
        return ending.waitingCard(thread)?.id === input.cardId;
      });
      const closed = supervisor.closeCard(input.cardId, { kind: "firstmate" }, input.reason);
      const left = waiting.flatMap((thread) => {
        const now = ending.thread(thread.ask.id);
        return now && ending.state(now).kind === "missing" ? [now.ask] : [];
      });
      const result = [
        closed,
        ...left.map(
          (ask) =>
            `The captain's message ${ask.id} ("${excerptOf(ask.text)}") now has no answering card up and no work running for it.`,
        ),
      ].join("\n");
      host.turn.delivered = true;
      host.noteDelivery({
        outcome: "action",
        kind: "close",
        tool: "close_card",
        ref: input.cardId,
      });
      return result;
    }),
    createEmoteTool((emote) => {
      host.turn.delivered = true;
      host.noteDelivery({ outcome: "action", kind: "reaction", tool: "emote" });
      host.options.broadcastEvent({ type: "firstmate_emote", emote });
    }),
    ...createCrewTools(delegate),
    // The graph (task-system P2): file on request by default or start when ready,
    // edit or drop a record, link records, and query the record.
    ...createTaskTools(firstmateTaskTools(host)),
    // Project discovery stays a host-owned typed operation; CI state rides crew_status.
    createLocateProjectTool(locate),
    ...(scheduler
      ? filingOperations(
          host,
          createScheduleTools({
            create: (spec, prompt, extra) => {
              const project = extra.project
                ? (host.options.tasks.projects.byKey(extra.project) ??
                  host.options.tasks.projects.get(extra.project))
                : undefined;
              if (extra.project && (!project || project.archivedAt !== null)) {
                throw new Error(
                  `No project "${extra.project}"; use a project key from the backlog or tasks with projects.`,
                );
              }
              const record = scheduler.create(
                spec,
                prompt,
                host.turn.origin === "captain-turn",
                extra.name,
                project?.id,
                { draft: extra.draft === true },
              );
              host.turn.replyFacts.app =
                record.state === "draft"
                  ? `Saved a draft: ${record.prompt}`
                  : `Scheduled: ${record.prompt}`;
              host.noteDelivery({
                outcome: "action",
                kind: "record",
                tool: "schedule_prompt",
                ref: record.id,
              });
              return record;
            },
            // Settings → Automation's Delete, through the same catalog
            // line (docs/automation.md, "One owner"): its trail is the
            // operation and the feed line, and records the delivery.
            cancel: async (id) => {
              const record = scheduler.rules().find((schedule) => schedule.id === id);
              if (!record) return false;
              const appDispatch = host.appDispatch();
              if (!appDispatch) throw new Error("App actions are not connected.");
              await appDispatch("inf:automation:delete", [id], {
                kind: "firstmate",
                wake: host.turn.appWake,
                action: "automation-delete",
                evidence: "cancel_schedule",
              });
              host.turn.replyFacts.app = `Cancelled schedule: ${record.prompt}`;
              return true;
            },
          }),
          {
            schedule_prompt: (params) => ({
              title: shortTaskTitle(`Scheduled: ${stringParam(params.prompt) ?? "a prompt"}`),
            }),
          },
        )
      : []),
    // What is still open, read from the app: a fold's recovery (INF-1712).
    createOpenWorkTool((input) =>
      readOpenWork(
        {
          tasks: host.options.tasks,
          ending: supervisor.askEnding,
          openCards: () => supervisor.cards.snapshot(),
          storedCard: (id) => supervisor.cards.get(id) ?? supervisor.cards.stored(id),
          pastCard: (id) => supervisor.cards.past(id),
          owed: (id) => supervisor.cards.owed(id),
          thread: (id) => supervisor.cards.thread(id),
        },
        input,
      ),
    ),
    // Design B: the durable outcome store's query side - what the fleet
    // did while the captain was not looking, on demand, never as a turn.
    ...(host.options.supervisionLog ? [createSupervisionLogTool(host.options.supervisionLog)] : []),
    // PoC-2 C3: the one path from "you should have told me about that" to a
    // durable label. Captain-turn gated by the same wake stamp memory uses.
    ...(flagMissedEscalation
      ? filingOperations(
          host,
          [
            createFlagMissedEscalationTool({
              flag: (input) => {
                // The ask is about the task whose outcome was the miss; its
                // work once the flag goes through.
                host.asks.attach(input.taskId, "flag_missed_escalation", undefined, "tie");
                const result = flagMissedEscalation(input);
                if (result.status === "flagged") {
                  host.asks.attach(input.taskId, "flag_missed_escalation");
                  host.noteDelivery({
                    outcome: "action",
                    kind: "record",
                    tool: "flag_missed_escalation",
                    ref: input.taskId,
                  });
                }
                return result;
              },
              isCaptainTurn: () => host.turn.origin === "captain-turn",
            }),
          ],
          {
            flag_missed_escalation: (params) => {
              const taskId = stringParam(params.task_id);
              const about = taskId ? host.options.tasks.get(taskId) : undefined;
              return {
                title: `Flagged a missed escalation on ${about?.key ?? taskId ?? "a task"}`,
                ...(about ? { projectId: about.projectId } : {}),
              };
            },
          },
        )
      : []),
    // WI-14: the captain's "this card repeats that one" as a durable
    // label, gated by the same captain-turn stamp.
    ...(flagDuplicate
      ? filingOperations(
          host,
          [
            createFlagDuplicateTool({
              flag: (input) => {
                const card = supervisor.cards.snapshot().find((open) => open.id === input.cardId);
                const about =
                  card?.taskId && host.options.tasks.get(card.taskId) ? card.taskId : undefined;
                // About the card's task; its work once the flag goes through.
                if (about) host.asks.attach(about, "flag_duplicate", undefined, "tie");
                const result = flagDuplicate(input);
                if (result.status === "flagged") {
                  if (about) host.asks.attach(about, "flag_duplicate");
                  host.noteDelivery({
                    outcome: "action",
                    kind: "record",
                    tool: "flag_duplicate",
                    ref: input.cardId,
                  });
                }
                return result;
              },
              isCaptainTurn: () => host.turn.origin === "captain-turn",
            }),
          ],
          {
            flag_duplicate: (params) => ({
              title: `Flagged card ${stringParam(params.card_id) ?? ""} as a duplicate`,
            }),
          },
        )
      : []),
    // Knowledge is the single owner of directions and personal context.
    ...(knowledge
      ? filingOperations(
          host,
          [bindTool(KNOWLEDGE_TOOL, knowledge), bindTool(RECORD_KNOWLEDGE_TOOL, knowledge)],
          {
            record_knowledge: (params) => {
              const scope = stringParam(params.scope);
              const action = stringParam(params.action) ?? "record";
              const what = stringParam(params.title) ?? stringParam(params.id) ?? "knowledge";
              return {
                title: shortTaskTitle(`Knowledge ${action}: ${what}`),
                ...(scope && host.options.repos.get(scope) ? { repoId: scope } : {}),
              };
            },
          },
        )
      : []),
    // Two fixed tools whatever is connected (docs/integrations.md). A held
    // call's approval card is what the turn did, on the row the host filed
    // for it; a change or send that ran is an operation (INF-1108).
    ...(host.options.integrations
      ? createIntegrationTools(host.options.integrations, (fact) => {
          if ("ran" in fact) {
            host.noteDelivery({ outcome: "action", kind: "record", tool: "use_integration" });
            return;
          }
          const row = host.options.tasks.capture.openCardTaskFor(fact.card);
          if (row) host.asks.attach(row.id, "use_integration");
          host.noteDelivery({
            outcome: "action",
            kind: "card",
            tool: "use_integration",
            ref: fact.card,
          });
        })
      : []),
    // Asking to keep a secret: Infinitary's own card is what the turn did.
    ...(host.options.secretAsks
      ? createSecretTools(host.options.secretAsks, (askId) =>
          host.noteDelivery({
            outcome: "action",
            kind: "card",
            tool: "ask_secret",
            ref: secretAskCardId(null, askId),
          }),
        )
      : []),
    createCorrectionTool(async (request) =>
      host.options.correctionCase
        ? host.options.correctionCase(request)
        : { status: "unavailable", message: "Correction cases are not connected." },
    ),
    ...createAppTools({
      ...(host.options.platform ? { platform: host.options.platform } : {}),
      ...(host.options.installedKeys ? { installedKeys: host.options.installedKeys } : {}),
      dispatch: (channel, args, actor) => {
        const appDispatch = host.appDispatch();
        if (!appDispatch) throw new Error("App actions are not connected.");
        return appDispatch(channel, args, actor);
      },
      // The host builds the card from the line's offer, never the
      // Firstmate, so its button does what its words say (docs/devices.md,
      // "Asking the first mate").
      handover: (target, offer) => {
        // The app's own card for a computer behind is the one card.
        const standing = deviceUpdateCardOfOffer(offer.cardId);
        if (standing && supervisor.cards.has(standing))
          return "The update card for that computer is already on the stack.";
        const card: EmittedCard = {
          id: supervisor.cards.offerCardId(offer.cardId),
          title: offer.title,
          // Catalog words keep their facts, so each view words the card in its own language.
          body: offer.said
            ? `${cardWordsMark([offer.said.title, offer.said.label, offer.said.decline])}${offer.said.paragraphs.map((fact) => saidMark(fact, "p")).join("\n")}`
            : offer.paragraphs.map((text) => `<p>${escapeCardText(text)}</p>`).join("\n"),
          actions: [
            {
              id: "open",
              label: offer.label,
              default: true,
              ...(offer.danger ? { danger: true } : {}),
              effect: { kind: "open", target, ...offer.arrival },
            },
            { id: "not-now", label: offer.decline, declines: true },
          ],
        };
        const id = supervisor.addFirstmateCard(card);
        host.decisions.noteCard(id);
        recordCardFiling(host, card, id);
        host.noteDelivery({ outcome: "action", kind: "card", tool: "app_change", ref: id });
        return `Settings button offered on ${id}.`;
      },
      // The setup card is the host's own, written from the checked
      // request: the turn's ask lands on its row, and the card is what
      // the turn did.
      ...(host.options.proposeProject
        ? {
            propose: async (_action, value) => {
              const proposed = await host.options.proposeProject?.(value);
              if (!proposed) return "";
              if (proposed.cardId) {
                const row = host.options.tasks.capture.openCardTaskFor(proposed.cardId);
                if (row) host.asks.attach(row.id, "app_change");
                host.noteDelivery({
                  outcome: "action",
                  kind: "card",
                  tool: "app_change",
                  ref: proposed.cardId,
                });
              }
              return proposed.text;
            },
          }
        : {}),
      changeProject: async (action, value, actor) => {
        if (!host.options.changeProject) throw new Error("Project changes are not connected.");
        const result = await host.options.changeProject(action, value, actor);
        if (result.cardId) {
          const row = host.options.tasks.capture.openCardTaskFor(result.cardId);
          if (row) host.asks.attach(row.id, "app_change");
          host.noteDelivery({
            outcome: "action",
            kind: "card",
            tool: "app_change",
            ref: result.cardId,
          });
        }
        return result.text;
      },
      actor: () => ({ kind: "firstmate", wake: host.turn.appWake }),
    }),
    // Talk-to-personalize Step 1 (Tier A): one call applies a preference
    // about the app itself and the feed gets one line; no card. It files
    // an operation like every other operate tool.
    ...(personalize
      ? filingOperations(
          host,
          [
            createPersonalizeTool({
              ...personalize,
              isCaptainTurn: () => host.turn.origin === "captain-turn",
              // Only an applied change is announced (refusals return
              // early), so its feed line is also the "all set".
              broadcastEvent: (event) => {
                host.options.broadcastEvent(event);
                if (event.type === "personalized") {
                  host.noteDelivery({ outcome: "action", kind: "record", tool: "personalize" });
                  host.replyEmote("tick");
                }
              },
            }),
          ],
          {
            personalize: (params) => ({ title: personalizeTitle(params) }),
          },
        )
      : []),
    // One plugin vehicle, Phase A item 3 (captain's A2a): an operate move
    // that stages a panel from elsewhere and asks the captain on the
    // host's consent card; the tool itself adds nothing.
    ...(installPlugin
      ? filingOperations(
          host,
          [
            createInstallPluginTool({
              install: async (request) => {
                const text = await installPlugin(request);
                host.noteDelivery({
                  outcome: "action",
                  kind: "record",
                  tool: "install_plugin",
                });
                return text;
              },
              isCaptainTurn: () => host.turn.origin === "captain-turn",
            }),
          ],
          {
            install_plugin: (params) => ({
              title: `Asked to ${params.action === "remove" ? "remove" : "add"} a panel or runbook: ${stringParam(params.spec) ?? "elsewhere"}`,
            }),
          },
        )
      : []),
  ];
  // The one retry only shows an answer: every work-changing tool answers
  // with a refusal as text, the way a graph refusal does.
  return tools.map((tool) => {
    const attributed = withAskAttribution(
      tool,
      host.asks,
      (id) => host.turn.read.has(id),
      (id) => host.options.supervisor.askEnding.nameRefusal(id),
    );
    return {
      ...attributed,
      run: (params: Parameters<typeof tool.run>[0], signal?: AbortSignal) =>
        ANSWER_ONLY_REFUSED_TOOLS.has(tool.name) && host.delivery.outputOnly
          ? Promise.resolve({ text: ANSWER_ONLY_REFUSAL })
          : attributed.run(params, signal),
    };
  });
}

/**
 * The emit_card boundary's task side (attach first, D1). A card with
 * task_id - a decision whose buttons act on that task, or a review relay -
 * lands on that task: a note is an `answered` event carrying the body, a
 * decision a `card_raised` event whose resolution act() records. A
 * decision without a task becomes its own decision task waiting on the
 * captain (its card id is the gate ref); a note, the first mate's own
 * answer (INF-2714), becomes its own question task, born closed with the
 * body as its outcome. Either way the turn's ask attaches to that record,
 * and each task the card names in `related` links to it.
 */
function recordCardFiling(host: FirstmateToolHost, card: EmittedCard, cardId: string): void {
  const recordId = fileCard(host, card, cardId);
  linkRelated(host, recordId, card.relatedTaskIds ?? []);
}

/** Files the card's record and attaches the turn's ask to it; returns the record's id. */
function fileCard(host: FirstmateToolHost, card: EmittedCard, cardId: string): string {
  const tasks = host.options.tasks;
  const decision = card.actions.length > 0;
  if (card.taskId) {
    if (decision) {
      tasks.capture.recordCardRaised(card.taskId, {
        cardId,
        kind: "decision",
        title: card.title,
      });
    } else {
      tasks.capture.recordAnswer(card.taskId, { cardId, title: card.title, body: card.body });
    }
    host.asks.attach(card.taskId, "emit_card", false);
    return card.taskId;
  }
  if (decision) {
    // A revision in place keeps its row; a fresh decision files one in the
    // hinted task's project, else Scratch.
    const existing = tasks.capture.openDecisionFor(cardId);
    if (existing) {
      host.asks.attach(existing.id, "emit_card", false);
      return existing.id;
    }
    const hinted = host.asks.hintedTask();
    const row = tasks.capture.fileDecision({
      id: randomUUID().slice(0, 8),
      title: shortTaskTitle(card.title),
      cardId,
      repoId: hinted?.repoId ?? null,
      ...(hinted ? { projectId: hinted.projectId } : {}),
    });
    host.asks.attach(row.id, "emit_card", true);
    return row.id;
  }
  // The first mate's own note: its own row - its answer, or the decision
  // filed for the card - revised in place. A card that was a decision on a
  // task files its own row instead, so that task's outcome is never the note's.
  const filed = tasks.capture.taskForCard(cardId);
  const revised =
    filed?.kind === "question" || (filed && filed.gate?.ref === cardId && filed.kind === "decision")
      ? filed
      : undefined;
  if (revised) {
    tasks.capture.recordAnswer(revised.id, {
      cardId,
      title: card.title,
      body: card.body,
      asOutcome: true,
    });
    host.asks.attach(revised.id, "emit_card", false);
    return revised.id;
  }
  const row = tasks.capture.fileQuestion({
    id: randomUUID().slice(0, 8),
    title: shortTaskTitle(card.title),
    outcome: card.body,
    cardId,
  });
  host.asks.attach(row.id, "emit_card", true);
  return row.id;
}

/**
 * The related links a card declares (INF-2714, the captain's "each record
 * shows a related link to my answer"): from the card's record to each task
 * it names, which the line under a card's title and a question's work never
 * read. A repeat is a no-op; a ref that no longer resolves, or the record
 * itself, is skipped.
 */
function linkRelated(host: FirstmateToolHost, recordId: string, refs: readonly string[]): void {
  const tasks = host.options.tasks;
  for (const ref of refs) {
    const related = tasks.resolve(ref);
    if (!related || related.id === recordId) continue;
    try {
      tasks.graph.link(recordId, related.id, "related", "firstmate");
    } catch (caught) {
      console.warn(`[firstmate] could not link ${ref} as related:`, caught);
    }
  }
}

/**
 * The one host helper the operate tools report through (P1): after a
 * tool succeeds, file an `operation` task - done/settled, the tool's own
 * result as its outcome - in the repo's project or Scratch, and attach the
 * turn's ask to it. A thrown tool error files nothing; the turn-end
 * fallback still lands the ask.
 */
function filingOperations<Tool extends BoundTool>(
  host: FirstmateToolHost,
  tools: Tool[],
  describe: Record<string, (params: Record<string, unknown>) => OperationDescription>,
): Tool[] {
  return tools.map((tool): Tool => {
    const describer = describe[tool.name];
    if (!describer) return tool;
    return {
      ...tool,
      run: async (params) => {
        const output = await tool.run(params);
        try {
          const described = describer((params ?? {}) as Record<string, unknown>);
          const row = host.options.tasks.capture.fileOperation({
            id: randomUUID().slice(0, 8),
            title: shortTaskTitle(described.title),
            outcome: output.text.trim(),
            tool: tool.name,
            repoId: described.repoId ?? null,
            ...(described.projectId ? { projectId: described.projectId } : {}),
          });
          host.asks.attach(row.id, tool.name, true);
        } catch (caught) {
          console.warn(`[firstmate] could not file the ${tool.name} operation:`, caught);
        }
        return output;
      },
    };
  });
}

/**
 * The pictures on the captain's message a steer acts on, for the crewmate
 * to see what the captain showed (`docs/task-capture.md`, "Pictures stay with the
 * task"). A copy that is gone leaves the guidance to go as words.
 */
function steeredPictures(asks: AskCapture): {
  images?: TurnImage[];
  attachments?: AttachmentRef[];
} {
  const attachments = asks.currentPictures();
  if (attachments.length === 0) return {};
  try {
    return { images: loadImages(attachments), attachments };
  } catch {
    return {};
  }
}

type OperationDescription = { title: string; repoId?: string | null; projectId?: string };

/** The operation row a personalize call files, titled by what it did. */
function personalizeTitle(params: Record<string, unknown>): string {
  const action = stringParam(params.action);
  const surface = stringParam(params.surface);
  switch (action) {
    case "theme": {
      const theme = stringParam(params.theme);
      return theme ? `Switched to the ${theme} theme` : "Changed the theme";
    }
    case "panel":
      return `Arranged the ${surface ?? "panel"} surface`;
    case "remove":
      return `Removed the ${surface ?? "panel"} surface`;
    default:
      return "Personalized the app";
  }
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
