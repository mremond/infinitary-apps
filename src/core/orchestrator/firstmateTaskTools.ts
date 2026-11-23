import { formatUsd } from "@shared/costLimit";
import { standingOverride } from "@shared/holds";
import { effectiveTaskPolicies } from "@shared/taskPolicies";
import { cutText } from "@shared/textCut";
import type { TaskToolsDelegate } from "../pi/taskTools";
import { FIRSTMATE_RECIPIENT } from "../storage/inboxStore";
import type { TaskRecord } from "../storage/taskRecords";
import { TaskGraphRefusal } from "../tasks/taskGraph";
import { queryTasksAsync } from "../tasks/taskQuery";
import { TaskService } from "../tasks/taskService";
import type { DeliveryNote } from "./answerDelivery";
import type { AskCapture } from "./askCapture";
import { captainWordsIn } from "./captainOverrides";
import { FIRSTMATE_CARD_PREFIX } from "./cardEmit";
import { cardHeldStartRefusal } from "./cardHeldStart";
import { cardMutationText } from "./cardMutationText";
import type { FirstmateAgentOptions, FirstmateTurn } from "./firstmateAgent";
import { startedReply } from "./replyLine";
import { handOffShape } from "./workShape";

/** What the graph tools reach of the first mate agent: its options, the running turn and its asks. */
export type FirstmateTaskToolsHost = {
  readonly options: FirstmateAgentOptions;
  readonly turn: FirstmateTurn;
  readonly asks: AskCapture;
  /** Save one action that took effect for the messages the turn has read. */
  noteDelivery(entry: DeliveryNote): void;
};

/**
 * The graph tools' host side (P2). Each write attaches the turn's ask to
 * the task it acts on (attach first, D1); a graph refusal - a cycle, a
 * parent with open children, a move a workspace forbids - returns as the
 * tool's text so the agent reads it in conversation.
 */
export function firstmateTaskTools(host: FirstmateTaskToolsHost): TaskToolsDelegate {
  const supervisor = host.options.supervisor;
  const tasks = host.options.tasks;
  /** What the card-question hold reads (./cardHeldStart). */
  const cardHold = (taskId: string) => ({
    open: supervisor.cards,
    tasks,
    // The captain's choices on the first mate's own cards, not yet handed to a
    // turn; a row set aside is never delivered, so it holds nothing.
    unreadChoices: () =>
      host.options.inbox
        .allFor(FIRSTMATE_RECIPIENT)
        .flatMap((row) =>
          row.escalatedAt === null &&
          row.facts?.kind === "card-choice" &&
          row.facts.card.id?.startsWith(FIRSTMATE_CARD_PREFIX)
            ? [row.facts.card]
            : [],
        ),
    captainWords: host.turn.typed,
    captainPressedStart: supervisor.hostOps.pendingStarts.has(taskId),
  });
  /**
   * The open parts under a task whose override changed (INF-1939 friction 5):
   * a part does not carry its parent's override, so the captain's words reach
   * each part they cover only through the first mate recording them there.
   */
  const openParts = (taskId: string): TaskRecord[] =>
    tasks.graph.descendants(taskId).filter((part) => !TaskService.isClosed(part));
  const named = (parts: TaskRecord[]): string =>
    parts.map((part) => `${part.key || part.id} "${part.title}"`).join(", ");
  const declaredPartsWords = (taskId: string): string => {
    const parts = openParts(taskId);
    return parts.length
      ? ` Its open parts do not carry these words: ${named(parts)}. If the captain's words cover any of them, record them on each with update_task override, from standing or the card they were given on.`
      : "";
  };
  const withdrawnPartsWords = (taskId: string): string => {
    const parts = openParts(taskId).filter((part) =>
      standingOverride(part.delivery, part.delivery?.headSha),
    );
    return parts.length
      ? ` These open parts carry an override of their own: ${named(parts)}. Where the captain's words take it back there too, take it back on each with update_task override, empty holds.`
      : "";
  };
  const resolve = (ref: string): TaskRecord => {
    const record = tasks.resolve(ref);
    if (!record) {
      throw new Error(
        `Unknown task "${ref}". Use a task id or key from the context's crew, crew_status, or the tasks tool.`,
      );
    }
    return record;
  };
  /**
   * A graph write on started work that took effect: the task becomes the
   * message's work, then the reply's words, when it has some, then the
   * delivery. Each change is attached as about its task before it is tried
   * (`tie`), so a refused one keeps the message's tie without making the
   * task its work.
   */
  const tookEffect = (ref: string, app?: string): void => {
    host.asks.attach(ref, "update_task");
    if (app !== undefined) host.turn.replyFacts.app = app;
    host.noteDelivery({ outcome: "action", kind: "work", tool: "update_task", ref });
  };
  const asText = (run: () => string): string => {
    try {
      return run();
    } catch (caught) {
      if (caught instanceof TaskGraphRefusal) return caught.message;
      throw caught;
    }
  };
  return {
    plan: ({ captainStop, ...input }) => {
      let record: TaskRecord;
      try {
        record = supervisor.intake.plan(input);
      } catch (caught) {
        // A refused hand-off (INF-799) files nothing and reads as words.
        if (caught instanceof TaskGraphRefusal)
          return { taskId: "", key: "", text: caught.message };
        throw caught;
      }
      host.asks.attach(record.id, "create_task", true);
      // The captain asked for it to wait, as when they chose to file it for
      // later (INF-4165 finding 3): recorded at filing, so the next-move
      // check never reads the wait as work standing still.
      const stop = captainStop
        ? tasks.starts.declareCaptainStop(record.id, "firstmate")
        : undefined;
      // The reply says where the work landed (INF-2715): filed means the
      // backlog, and queued work says when it starts.
      host.turn.replyFacts.app =
        record.startPolicy === "on-request"
          ? `Filed ${record.key} in the backlog: ${record.title}`
          : `${record.key} ${supervisor.intake.plannedWaiting(record)}: ${record.title}`;
      host.noteDelivery({
        outcome: "action",
        kind: "record",
        tool: "create_task",
        ref: record.id,
      });
      // A when-ready row nothing waits on is dispatched by this very sweep:
      // the answer says a crewmate starts, the fact the feed line states.
      const waiting =
        supervisor.facts.crewStatus(record.id)[0]?.gate ??
        (record.startPolicy === "when-ready" ? "a crewmate starts on it now" : undefined);
      return {
        taskId: record.id,
        key: record.key,
        text: `Planned ${record.key} "${record.title}" (task_id ${record.id})${waiting ? ` - ${waiting}` : ""}.${stop ? ` ${stop.ok ? `Recorded that the captain asked ${record.key} to wait.` : stop.text}` : ""}`,
      };
    },
    update: async (input) => {
      // The task the change is about: tied to the message before any write,
      // so a refused change keeps the message's tie to it (its own card can
      // still answer) without counting as the message's work.
      let about: string | undefined;
      try {
        const text = await (async () => {
          const record = resolve(input.task);
          about = record.id;
          // Resolve before any write. An unknown prerequisite is a tool error,
          // and two references to one task count once. INF-416 piece I: add
          // what is not linked yet; never compare the list or remove a link.
          const declared =
            input.declaredBlockers === undefined
              ? undefined
              : [...new Set(input.declaredBlockers.map((ref) => resolve(ref).id))];
          host.asks.attach(record.id, "update_task", undefined, "tie");
          // The answer to a task stuck at its provider (docs/inbox.md): the
          // app's own pick, never a model named here.
          if (input.unstick) {
            const answer = await supervisor.turns.unstick(record.id, input.unstick);
            if (!answer.ok) throw new TaskGraphRefusal(answer.text);
            tookEffect(record.id);
            return answer.text;
          }
          const beforePolicies = input.policies
            ? effectiveTaskPolicies(
                record,
                record.repoId ? host.options.repos.get(record.repoId) : undefined,
              )
            : null;
          const runsOn =
            typeof input.runsOn === "string"
              ? supervisor.placement.resolveRunsOn(input.runsOn)
              : input.runsOn;
          // A model named for started work moves it there between turns,
          // keeping its key, branch and working copy (INF-849).
          const moveTo =
            record.kind === "work" && record.status === "active" ? input.model?.trim() : undefined;
          // on-request on started work moves it back to the backlog (INF-2062):
          // its turn stops and its work stays, after the other edits land.
          const toBacklog =
            record.kind === "work" &&
            record.status === "active" &&
            input.startPolicy === "on-request";
          // A typed hand-off is checked as a new task's is (INF-799); empty clears it.
          const handOff = (() => {
            if (
              input.resultSchema === undefined &&
              input.branchFrom === undefined &&
              input.branch === undefined
            )
              return {};
            const checked = handOffShape(
              tasks,
              {
                ...(input.resultSchema ? { result_schema: input.resultSchema } : {}),
                ...(input.branchFrom?.trim() ? { branch_from: input.branchFrom } : {}),
                ...(input.branch?.trim() ? { branch: input.branch } : {}),
              },
              record.repoId,
              record.id,
            );
            if ("refused" in checked) throw new TaskGraphRefusal(checked.refused);
            return {
              ...(input.resultSchema !== undefined
                ? { resultSchema: checked.result_schema ?? null }
                : {}),
              ...(input.branchFrom !== undefined ? { branchFrom: checked.branch_from ?? "" } : {}),
              ...(input.branch !== undefined ? { branch: checked.branch ?? "" } : {}),
            };
          })();
          // What updateFields applies first - a reopening, a move to another
          // project or under another parent - lands before where it runs is
          // judged, in one transaction: it is judged, and its words written,
          // where the task lands, and a refusal changes nothing.
          const moves = {
            ...(input.correctRequiredAction ? { correctRequiredAction: true } : {}),
            ...(input.project !== undefined ? { project: input.project } : {}),
            ...(input.repository !== undefined ? { repository: input.repository } : {}),
            ...(input.parent !== undefined ? { parent: input.parent } : {}),
          };
          // INF-6091 finding 1: when-ready would let the ready sweep start
          // what the first mate's own open card still asks about.
          if (input.startPolicy === "when-ready" && record.status !== "active") {
            const held = cardHeldStartRefusal(record, {
              ...cardHold(record.id),
              edit: "when-ready",
            });
            if (held) throw new TaskGraphRefusal(held);
          }
          // A program's bound is the captain's consent (INF-799): raised only on the captain's turn.
          if (input.programBound !== undefined && host.turn.origin !== "captain-turn")
            throw new TaskGraphRefusal(
              "program_bound is raised only on the captain's words: ask the captain on a card first.",
            );
          const rest = {
            // A title past its room is refused by updateFields, never cut here.
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.programBound !== undefined ? { programBound: input.programBound } : {}),
            ...(input.basis !== undefined ? { basis: input.basis } : {}),
            ...handOff,
            ...(input.startAtApproval !== undefined
              ? { startAtApproval: input.startAtApproval }
              : {}),
            ...(input.needsMerge !== undefined ? { needsMerge: input.needsMerge } : {}),
            ...(input.internalStep !== undefined ? { internalStep: input.internalStep } : {}),
            ...(input.speed !== undefined ? { speed: input.speed } : {}),
            ...(input.model !== undefined && !moveTo ? { model: input.model } : {}),
            ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
            ...(input.placementRequirements !== undefined
              ? { placementRequirements: input.placementRequirements }
              : {}),
            ...(input.policies ? { policies: input.policies } : {}),
            ...(input.direction ? { direction: input.direction } : {}),
            ...(input.goal !== undefined ? { goal: input.goal.trim() || null } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
            ...(input.startPolicy && record.status !== "active"
              ? { startPolicy: input.startPolicy }
              : {}),
            ...(input.verdict !== undefined
              ? { verdict: cutText(input.verdict?.trim() ?? "", 280) || null }
              : {}),
          };
          const changes = tasks.atomic(
            () => {
              const waited = tasks.graph.waitingOn(record.id).length > 0;
              const moved =
                Object.keys(moves).length > 0
                  ? tasks.updateFields(record.id, moves, "firstmate")
                  : [];
              const refused =
                runsOn !== undefined
                  ? supervisor.placement.runsOnRefusal(record.id, runsOn)
                  : undefined;
              if (refused) throw new TaskGraphRefusal(refused);
              const added: string[] = [];
              if (declared) {
                const linked = new Set(tasks.graph.blockers(record.id).map((row) => row.id));
                for (const blockerId of declared) {
                  if (linked.has(blockerId)) continue;
                  // A cycle throws inside this transaction, so the field edits
                  // above and below roll back with the link.
                  if (!tasks.graph.link(blockerId, record.id, "blocks", "firstmate")) continue;
                  const blocker = tasks.get(blockerId);
                  added.push(`waits for ${blocker?.key || blockerId}`);
                }
              }
              const where =
                runsOn !== undefined
                  ? {
                      runsOn: {
                        ask: runsOn,
                        words: supervisor.placement.runsOnWords(record.id, runsOn),
                      },
                    }
                  : {};
              const changed = [
                ...moved,
                ...tasks.updateFields(record.id, { ...rest, ...where }, "firstmate"),
                ...added,
              ];
              // INF-6091 finding 1: an edit that leaves when-ready work waiting
              // on nothing - needs_merge, start_at_approval or a move that lets
              // an approved base answer its wait - lets the ready sweep start
              // what the first mate's own open card still asks about; refusing
              // here rolls the whole edit back.
              const now = tasks.get(record.id);
              if (
                waited &&
                now?.startPolicy === "when-ready" &&
                tasks.graph.waitingOn(record.id).length === 0
              ) {
                const held = cardHeldStartRefusal(now, {
                  ...cardHold(record.id),
                  edit: "waits-ended",
                });
                if (held) throw new TaskGraphRefusal(held);
              }
              return changed;
            },
            () => {},
          );
          const move = moveTo
            ? await supervisor.moves.requestMove(record.id, { by: "firstmate", model: moveTo })
            : undefined;
          const backlog = toBacklog
            ? supervisor.hostOps.moveToBacklog(
                record.id,
                { actor: "firstmate", via: "tool", decision: null },
                input.reason,
              )
            : undefined;
          if (backlog?.ok) tookEffect(record.id);
          if (move?.ok) tookEffect(record.id);
          // The captain asked for it to wait (INF-3846 piece 2): recorded after
          // the start policy and any move to the backlog, which it needs.
          const stop = input.captainStop
            ? tasks.starts.declareCaptainStop(record.id, "firstmate")
            : undefined;
          if (stop?.ok && stop.changed) tookEffect(record.id);
          const stopText = !stop
            ? undefined
            : !stop.ok
              ? stop.text
              : stop.changed
                ? `Recorded that the captain asked ${record.key || record.id} to wait.`
                : `${record.key || record.id} is already recorded as stopped by the captain.`;
          if (changes.length === 0) {
            if (move && !move.ok) throw new TaskGraphRefusal(move.text);
            if (backlog && !backlog.ok) throw new TaskGraphRefusal(backlog.text);
            if (stop && !stop.ok && !move && !backlog) throw new TaskGraphRefusal(stop.text);
            if (move || backlog || stop)
              return [move?.text, backlog?.text, stopText].filter(Boolean).join(" ");
            return `${record.key || record.id} is unchanged.`;
          }
          const updated = tasks.get(record.id) ?? record;
          if (input.speed) supervisor.noteUnsupportedSpeed(updated.id, input.speed);
          host.turn.replyFacts.app = `Updated ${updated.key}: ${updated.title}`;
          host.noteDelivery({
            outcome: "action",
            kind: "record",
            tool: "update_task",
            ref: record.id,
          });
          const policyNote = input.policies
            ? supervisor.policiesChanged(record.id, input.policies, beforePolicies)
            : "";
          // A task under another parent or in another project, or told
          // where it runs, goes there.
          if (runsOn !== undefined || input.parent !== undefined || input.project !== undefined)
            supervisor.placement.runsOnChanged(record.id);
          // Policy edits alone never dispatch a queued row.
          if (
            Object.keys(input).some(
              (key) => key !== "task" && key !== "policies" && key !== "direction",
            )
          ) {
            // An edit its crewmate never hears still sparks to it: its task
            // changed (INF-759). A policy notice sparks as it lands.
            supervisor.steer.announceReach(record.id);
            supervisor.intake.graphChanged();
          }
          const now = tasks.get(record.id);
          return `Updated ${now?.key || record.id}: ${changes.join(", ")}.${policyNote ? ` ${policyNote}` : ""}${move ? ` ${move.text}` : ""}${backlog ? ` ${backlog.text}` : ""}${stopText ? ` ${stopText}` : ""}`;
        })();
        // The change took effect: the task is the message's work.
        if (about) host.asks.attach(about, "update_task");
        return { text, ok: true };
      } catch (caught) {
        if (caught instanceof TaskGraphRefusal) return { text: caught.message, ok: false };
        throw caught;
      }
    },
    drop: (input) =>
      asText(() => {
        const record = resolve(input.task);
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const text = supervisor.intake.dropTask(record.id, {
          reason: input.reason,
          ...(input.confirm ? { confirm: true } : {}),
          ...(input.replacedBy ? { replacedBy: input.replacedBy } : {}),
        });
        // A refusal comes back as text; only a task that is now dropped took effect.
        if (record.status !== "dropped" && tasks.get(record.id)?.status === "dropped") {
          tookEffect(record.id, `Dropped ${record.key}: ${record.title}`);
          // The parent this drop left with no open part (INF-4509).
          const parent = supervisor.intake.parentCloseNote(record.id);
          if (parent) return `${text} ${parent}`;
        }
        return text;
      }),
    reviseRequiredAction: (input) =>
      asText(() => {
        const mutation = supervisor.cards.reviseRequiredAction({ actor: "firstmate" }, input);
        if (mutation.effect === "revised") {
          host.noteDelivery({
            outcome: "action",
            kind: "card",
            tool: "update_task",
            ref: mutation.cardId,
          });
        }
        return cardMutationText(mutation);
      }),
    withdrawMerge: (input) =>
      asText(() => {
        const record = resolve(input.task);
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const withdrawn = supervisor.withdrawMergeApproval(record.id);
        if (withdrawn.ok) {
          tookEffect(record.id, `Withdrew merge approval for ${record.key}: ${record.title}`);
        }
        return withdrawn.text;
      }),
    raisePutOff: (input) =>
      asText(() => {
        const record = resolve(input.task);
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const raised = supervisor.cards.putOffs.raiseForTask(record.id);
        if (raised === 0)
          return `${record.key} has no card put off; nothing changed. Its decisions name what the captain chose.`;
        const words = `Raised again the card${raised === 1 ? "" : "s"} the captain put off on ${record.key}: ${record.title}`;
        tookEffect(record.id, words);
        return `${words}.`;
      }),
    hold: async (input) => {
      let record: TaskRecord;
      try {
        record = resolve(input.task);
      } catch (caught) {
        if (caught instanceof TaskGraphRefusal) return caught.message;
        throw caught;
      }
      host.asks.attach(record.id, "update_task", undefined, "tie");
      const held = await supervisor.holdRules.hold(record.id, input.hold);
      return asText(() => {
        if (held.ok) {
          tookEffect(
            record.id,
            input.hold
              ? `Held ${record.key} until its wait ends: ${record.title}`
              : `Lifted the hold on ${record.key}: ${record.title}`,
          );
          // The gate is the ladder's witness; the panel reads it at once.
          supervisor.intake.graphChanged();
        }
        return held.text;
      });
    },
    pin: (input) =>
      asText(() => {
        const record = resolve(input.task);
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const pinned = tasks.setPinned(record.id, input.pinned, { actor: "firstmate" });
        if (!pinned.ok) return pinned.text;
        const words = input.pinned
          ? `Pinned ${record.key} to the top of Tasks: ${record.title}`
          : `Unpinned ${record.key}: ${record.title}`;
        if (!pinned.changed)
          return `${record.key} is already ${input.pinned ? "pinned" : "not pinned"}; nothing changed.`;
        tookEffect(record.id, words);
        return `${words}.`;
      }),
    override: (input) =>
      asText(() => {
        const record = resolve(input.task);
        // Consent is the one fact the host checks: the words are the
        // captain's own - this turn's, or the words on this task the
        // first mate cites (INF-1216) - which the row keeps and nothing
        // reads. This turn's are every message of his it carries, however
        // it began: typed while it ran, or batched beside a crewmate's
        // report (INF-1582 finding 2). A scheduled check carries none.
        // A click on a merge is his approval of it, never words that pass
        // the checks (INF-1966): the host says which, from the card's action.
        const cited = captainWordsIn(host.turn, input.from, (from) =>
          supervisor.overrides.citedCaptainWords(record.id, from, { partOf: true }),
        );
        if (!cited.ok) return cited.text;
        const said = {
          words: cited.words,
          ...(cited.mergeClick ? { mergeClick: true as const } : {}),
        };
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const declared = supervisor.overrides.declareOverride(record.id, {
          ...said,
          holds: input.holds,
          until: input.until,
        });
        if (declared.ok) {
          tookEffect(record.id, `Recorded your override on ${record.key}: ${record.title}`);
          // Words that pass the cost limit lift the hold standing on it.
          supervisor.costLimits.overrideChanged(record.id);
        }
        return declared.ok ? `${declared.text}${declaredPartsWords(record.id)}` : declared.text;
      }),
    costLimit: (input) =>
      asText(() => {
        const record = resolve(input.task);
        // A cost limit is the captain's consent to spend (docs/usage.md,
        // "The cost limit"): set only on their words.
        if (host.turn.origin !== "captain-turn")
          return "cost_limit is set only on the captain's words: ask them on a card first.";
        host.asks.attach(record.id, "update_task", undefined, "tie");
        supervisor.costLimits.setTaskLimit(record.id, input.limit);
        const limit = input.limit;
        const words =
          limit === null
            ? "follows its project's or the app's cost limit again"
            : "none" in limit
              ? "has no cost limit"
              : `has a cost limit of ${formatUsd(limit.usd)}`;
        tookEffect(record.id, `${record.key} ${words}`);
        return `${record.key} "${record.title}" now ${words}. A cost-limit hold it no longer passes is lifted and its work carries on.`;
      }),
    withdrawOverride: (input) =>
      asText(() => {
        const record = resolve(input.task);
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const withdrawn = supervisor.overrides.withdrawOverride(record.id);
        if (withdrawn.ok) {
          tookEffect(record.id, `Took back your override on ${record.key}: ${record.title}`);
        }
        return withdrawn.ok ? `${withdrawn.text}${withdrawnPartsWords(record.id)}` : withdrawn.text;
      }),
    withdrawAllowance: (input) =>
      asText(() => {
        const record = resolve(input.task);
        host.asks.attach(record.id, "update_task", undefined, "tie");
        const withdrawn = supervisor.overrides.withdrawAllowance(record.id, input.card);
        if (withdrawn.ok)
          tookEffect(record.id, `Took back your yes on ${record.key}: ${record.title}`);
        return withdrawn.text;
      }),
    startAgain: async (input) => {
      const record = resolve(input.task);
      const result = supervisor.starts.startAgain(record.id);
      if (!result.ok) return result.text;
      host.asks.attach(record.id, "update_task");
      host.asks.attach(result.task.id, "update_task");
      tookEffect(
        result.task.id,
        `Started ${record.key} again as ${result.task.key}: ${result.task.title}`,
      );
      return `${result.task.key} replaces ${record.key}. ${await result.started}`;
    },
    startNow: async (input) => {
      const record = resolve(input.task);
      // Starting queued work never makes the message its origin: the task
      // stays in the thread that filed it (INF-6115).
      host.asks.attach(record.id, "update_task", false, "tie");
      // INF-6091 finding 1: the first mate's own open card still asks.
      const held = cardHeldStartRefusal(record, cardHold(record.id));
      if (held) return held;
      const text = await supervisor.starts.startQueuedNow(record.id);
      // A refusal comes back as text; a start now running behind the
      // answer (INF-3060), or a task a crewmate now holds, took effect.
      if (
        record.status !== "active" &&
        (tasks.get(record.id)?.status === "active" || tasks.starts.startAttemptOf(record.id))
      ) {
        tookEffect(record.id, startedReply(record.title));
      }
      return text;
    },
    link: (input) => {
      const from = resolve(input.from);
      const to = resolve(input.to);
      // About both tasks even when refused; their work once the edge changes.
      host.asks.attach(to.id, "link_tasks", undefined, "tie");
      host.asks.attach(from.id, "link_tasks", undefined, "tie");
      // INF-6091 finding 1: removing the last wait of when-ready work lets
      // the ready sweep start what the first mate's own open card asks about.
      if (input.remove && input.type === "blocks" && to.startPolicy === "when-ready") {
        // The ready sweep's own rule: an approved base answers a wait too.
        const others = tasks.graph.waitingOn(to.id).filter((blocker) => blocker.id !== from.id);
        const held =
          others.length === 0
            ? cardHeldStartRefusal(to, { ...cardHold(to.id), edit: "wait-removal" })
            : undefined;
        if (held) return held;
      }
      const linked = () =>
        tasks.graph
          .linksTo(to.id)
          .some((link) => link.fromId === from.id && link.type === input.type);
      const before = linked();
      const text = input.remove
        ? supervisor.intake.unlinkTasks(from.id, to.id, input.type)
        : supervisor.intake.linkTasks(from.id, to.id, input.type);
      // A refusal comes back as text; only an edge that now differs took effect.
      if (linked() !== before) {
        host.asks.attach(to.id, "link_tasks");
        host.asks.attach(from.id, "link_tasks");
        host.turn.replyFacts.app = `${input.remove ? "Unlinked" : "Linked"} ${from.key} and ${to.key}`;
        host.noteDelivery({
          outcome: "action",
          kind: "record",
          tool: "link_tasks",
          ref: to.id,
        });
      }
      return text;
    },
    readCard: (cardId) => supervisor.crewmateCards.readCard(cardId),
    query: (input) =>
      queryTasksAsync(
        tasks,
        input,
        (repoId) => host.options.repos.get(repoId)?.name,
        (taskId) => host.options.supervisor.cards.newestBody(taskId),
        (taskId) => host.options.supervisor.cards.newestResolutionForTask(taskId),
        host.options.supervisor.toolHooks.taskQueryReach(),
      ),
  };
}
