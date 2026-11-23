import { readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AttachmentRef } from "@shared/attachments";
import type { Card } from "@shared/cards";
import { parseServedInput } from "@shared/servedFrame";
import { describe, expect, it, vi } from "vitest";
import {
  crewCard,
  decodeContext,
  drained,
  fakeClockEachTest,
  notesBinding,
  notifyProse,
  setup,
  tick,
  toolsOf,
} from "../../../tests/helpers/firstmateHarness";
import { jpegImage, pngImage } from "../../../tests/helpers/images";
import { scratchDir } from "../../../tests/helpers/scratchDirs";
import { pageTaskField, readPagedTaskQuery } from "../../../tests/helpers/taskQueryText";
import { attachmentPath } from "../attachments";
import { IntegrationSettingsStore, IntegrationsService } from "../integrations";
import { initOverflowDir, type MessageFile, withPastedFiles } from "../overflow";
import { parseTasksQueryText } from "../pi/taskTools";
import { FIRSTMATE_RECIPIENT, InboxStore } from "../storage/inboxStore";
import { seedTask } from "../tasks/seedTask";
import { taskResolutionBody } from "../tasks/taskQuery";
import { ANSWER_ONLY_REFUSAL } from "./answerDelivery";
import { ANSWER_MISSING_OPENING } from "./captainWakes";

// This file chains real git and is not about the utility-QoS clamp, so what
// the product spawns runs at this run's own priority (tests/helpers/unclampedQos.ts).
vi.mock("../utilityQos", async (importOriginal) =>
  (await import("../../../tests/helpers/unclampedQos")).unclampedQos(importOriginal),
);

/** The first mate agent: answer delivery (tests/helpers/firstmateHarness.ts). */
fakeClockEachTest();

/**
 * The answer-delivery check (docs/task-capture.md "Answer delivery"): for
 * each captain message, did an action take effect after Firstmate read it?
 * The scripted model here is silent unless a test has it act, so each test
 * says what took effect and what the host did about the rest.
 */
describe("FirstmateAgent answer delivery", () => {
  type Fixture = ReturnType<typeof setup>;
  const finish = async (f: Fixture, text = "Noted.") => {
    f.session.emitTurnEnd(text);
    f.session.resolveNextPrompt();
    await tick();
  };
  const states = (f: Fixture) => f.tasks.capture.listAsks().map((ask) => ask.delivery);
  const note = (id: string, title: string) => ({
    id,
    title,
    body: "<p>Here is the answer.</p>",
  });
  const noticeOf = (f: Fixture) =>
    f.supervisor.cards.snapshot().find((card) => card.id.startsWith("card-ask-"));
  const retries = (f: Fixture) =>
    f.session.prompts.filter((prompt) => prompt.includes(ANSWER_MISSING_OPENING));

  it("covers a message a card was shown for, with no retry and no notice", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("what is two plus two?");
    await toolsOf(f.specs).get("emit_card")?.execute("c1", note("four", "Four"));
    await finish(f);
    expect(states(f)).toEqual(["covered"]);
    expect(f.session.prompts).toHaveLength(1);
    expect(new InboxStore(f.db).allFor(FIRSTMATE_RECIPIENT)).toEqual([]);
    expect(noticeOf(f)).toBeUndefined();
  });

  // INF-1108: the first mate's held integration call raises the app's own
  // approval card, so the message it answered is covered by that card.
  it("covers a message the app raised an integration approval card for, on that card's row", async () => {
    const f = setup({
      silent: true,
      integrations: (supervisor) =>
        new IntegrationsService({
          bindings: [notesBinding()],
          store: new IntegrationSettingsStore(scratchDir("infinitary-agent-integrations-")),
          asks: {
            keep: (taskId, ask) => f.tasks.delivery.keepWriteAsk(taskId, ask),
            keepForFirstmate: (ask) => supervisor.integrationAsks.askIntegrationForFirstmate(ask),
            take: (taskId, askId) => f.tasks.delivery.takeWriteAsk(taskId, askId),
            record: (taskId, askId, outcome) =>
              f.tasks.delivery.recordWriteAskOutcome(taskId, askId, outcome),
          },
        }),
    });
    await f.agent.converse("add my library books reminder to Notes");
    const held = await toolsOf(f.specs)
      .get("use_integration")
      ?.execute("u1", {
        name: "Notes",
        action: "add_note",
        input: { text: "Return the library books by Friday" },
        reason: "The captain asked me to remember the library books.",
      });
    expect(held?.content[0]?.text).toContain("The app raised its approval card");
    await finish(f, "The app is asking you on its card.");
    expect(states(f)).toEqual(["covered"]);
    expect(retries(f)).toEqual([]);
    const card = f.supervisor.cards
      .snapshot()
      .find((shown) => shown.id.startsWith("integration-ask-"));
    expect(card).toBeDefined();
    expect(f.tasks.capture.listAsks()[0]?.taskId).toBe(
      f.tasks.capture.openCardTaskFor(card?.id ?? "")?.id,
    );
  });

  it("counts a steer the app only saved for a held account as an action", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Add pagination", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    vi.spyOn(f.supervisor.steer, "steerCrewmate").mockResolvedValue("recorded-held");
    await f.agent.converse("tell the crew to use cursors");
    // Guidance passed on with no answer asked makes the task the message's
    // work; a question asked there is the request's (askRequestTie.test.ts).
    const steered = await toolsOf(f.specs)
      .get("steer_crewmate")
      ?.execute("s1", { task_id: "t1", message: "Use cursors.", response_mode: "guidance-only" });
    expect(steered?.content[0]?.text).toBeDefined();
    await finish(f);
    expect(states(f)).toEqual(["covered"]);
    expect(f.session.prompts).toHaveLength(1);
  });

  // INF-5578's audit, finding 1: a question asked of a long-running task for
  // the captain's message waits for its answer, not for the task to close.
  it("ties a question asked of a task to the message, and asks for its card when the answer brings none", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Cut the batch alpha", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    const inbox = new InboxStore(f.db);
    const answer = (responseId: string, text: string) => {
      const [request] = inbox.pendingResponses("t1");
      if (!request) throw new Error("No open request on t1");
      inbox.submitResponse(
        { requestId: request.id, responseId, status: "answered" },
        { task: "t1", session: null },
        text,
      );
      f.agent.pokeInbox();
    };
    const steer = (id: string, message: string) =>
      toolsOf(f.specs).get("steer_crewmate")?.execute(id, { task_id: "t1", message });
    await f.agent.converse("will updating get the new alpha?");
    await steer("s1", "Will updating get the new alpha?");
    await finish(f, "I'll answer you once it reports.");
    expect(states(f)).toEqual(["covered"]);
    expect(f.tasks.get("t1")?.status).toBe("active");

    // The turn that reads the answer asks a follow-up for the same message.
    answer("r1", "Yes, updating gets the alpha.");
    await drained(f.session, 2);
    await steer("s2", "Which channel does it come from?");
    await finish(f, "Asked which channel.");
    expect(states(f)).toEqual(["covered"]);
    expect(retries(f)).toEqual([]);

    // The follow-up's answer brings no card: the one retry asks for it.
    answer("r2", "The alpha channel.");
    await drained(f.session, 3);
    await finish(f, "Updating gets the alpha from the alpha channel.");
    await drained(f.session, 4);
    expect(retries(f)).toHaveLength(1);
    expect(f.tasks.get("t1")?.status).toBe("active");
  });

  // The captain's choice on the review of INF-5578's finding 1: the answer a
  // message waits on gets a turn of its own, and "carry on" there keeps the tie.
  it("serves the answer a message waits on in a turn of its own, where a carry-on steer keeps the tie", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Cut the batch alpha", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    const inbox = new InboxStore(f.db);
    await f.agent.converse("will updating get the new alpha?");
    await toolsOf(f.specs)
      .get("steer_crewmate")
      ?.execute("s1", { task_id: "t1", message: "Will updating get the new alpha?" });
    await finish(f, "I'll answer you once it reports.");

    // Another wake waits on the lane when the answer comes back.
    notifyProse(f.db, f.agent, "[fm-op] another task reported", "agent");
    const [request] = inbox.pendingResponses("t1");
    if (!request) throw new Error("No open request on t1");
    inbox.submitResponse(
      { requestId: request.id, responseId: "r1", status: "answered" },
      { task: "t1", session: null },
      "Yes, updating gets the alpha.",
    );
    f.agent.pokeInbox();
    await drained(f.session, 2);
    expect(f.session.prompts[1]).toContain("Yes, updating gets the alpha.");
    expect(f.session.prompts[1]).not.toContain("another task reported");

    // "Carry on" to the same task leaves the tie: the message is due on this
    // turn's answer, not on the task's close.
    await toolsOf(f.specs)
      .get("steer_crewmate")
      ?.execute("s2", { task_id: "t1", message: "Carry on.", response_mode: "guidance-only" });
    await finish(f, "Updating gets the alpha.");
    await drained(f.session, 3);
    expect(retries(f)).toHaveLength(1);
    expect(f.tasks.get("t1")?.status).toBe("active");
  });

  it("never carries the answer a message waits on on a captain's turn", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Cut the batch alpha", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    const inbox = new InboxStore(f.db);
    await f.agent.converse("will updating get the new alpha?");
    await toolsOf(f.specs)
      .get("steer_crewmate")
      ?.execute("s1", { task_id: "t1", message: "Will updating get the new alpha?" });
    await finish(f, "I'll answer you once it reports.");
    const [request] = inbox.pendingResponses("t1");
    if (!request) throw new Error("No open request on t1");
    // The answer lands while the captain's next message is already on its way.
    inbox.submitResponse(
      { requestId: request.id, responseId: "r1", status: "answered" },
      { task: "t1", session: null },
      "Yes, updating gets the alpha.",
    );
    await f.agent.converse("and what about the phone app?");
    expect(f.session.prompts[1]).toContain("and what about the phone app?");
    expect(f.session.prompts[1]).not.toContain("Yes, updating gets the alpha.");
    await toolsOf(f.specs).get("emit_card")?.execute("c1", note("phone", "The phone app"));
    await finish(f, "Noted.");
    await drained(f.session, 3);
    expect(f.session.prompts[2]).toContain("Yes, updating gets the alpha.");
    expect(f.session.prompts[2]).not.toContain("and what about the phone app?");
  });

  it("parks a captain's message sent while the answer's turn runs, so a card there answers only the earlier one", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Cut the batch alpha", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    const inbox = new InboxStore(f.db);
    await f.agent.converse("will updating get the new alpha?");
    await toolsOf(f.specs)
      .get("steer_crewmate")
      ?.execute("s1", { task_id: "t1", message: "Will updating get the new alpha?" });
    await finish(f, "I'll answer you once it reports.");
    const [request] = inbox.pendingResponses("t1");
    if (!request) throw new Error("No open request on t1");
    inbox.submitResponse(
      { requestId: request.id, responseId: "r1", status: "answered" },
      { task: "t1", session: null },
      "Yes, updating gets the alpha.",
    );
    f.agent.pokeInbox();
    await drained(f.session, 2);

    // The captain speaks while the answer's turn runs: the words wait.
    await f.agent.converse("and what about the phone app?");
    await toolsOf(f.specs)
      .get("emit_card")
      ?.execute("c1", note("alpha", "Updating gets the alpha"));
    await finish(f, "Shown.");
    await drained(f.session, 3);
    expect(f.session.prompts[1]).not.toContain("and what about the phone app?");
    expect(f.session.prompts[2]).toContain("and what about the phone app?");
    expect(f.session.prompts[2]).not.toContain("Yes, updating gets the alpha.");
    const [first, second] = f.tasks.capture.listAsks();
    expect(first?.text).toBe("will updating get the new alpha?");
    expect(first?.delivery).toBe("covered");
    expect(second?.delivery).not.toBe("covered");
  });

  // INF-5578's audit, finding 1: a change the task refused stops counting as
  // the message's work, whichever tool path refused it, so the message does
  // not wait for the task to close; the task stays about the message.
  it.each([
    ["update_task", { task: "t1", withdraw_merge: true }],
    ["settle_task", { task_id: "t1", mode: "done", why: "answered" }],
    ["link_tasks", { from: "t2", to: "t1", type: "blocks", remove: true }],
  ] as const)(
    "a change %s refused ties the message and asks for its card while the task stays open",
    async (tool, input) => {
      const f = setup({
        silent: true,
        seedTasks: [
          { id: "t1", title: "Cut the batch alpha", status: "idle", sessionFile: "/tmp/t1.jsonl" },
          { id: "t2", title: "Write the notes", status: "idle", sessionFile: "/tmp/t2.jsonl" },
        ],
      });
      await f.agent.converse("take back the alpha's merge and close it");
      const result = await toolsOf(f.specs).get(tool)?.execute("u1", input);
      expect(f.tasks.get("t1")?.status).not.toMatch(/done|dropped/);
      expect(result?.content[0]?.text).toBeDefined();
      await finish(f, "That could not be done.");
      await drained(f.session, 2);
      expect(retries(f)).toHaveLength(1);
      expect(f.tasks.timeline("t1").some((event) => event.kind === "ask")).toBe(true);
    },
  );

  it("does not count a lookup or closing words: one output-only retry, served alone, then covered by an answer", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Add pagination", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    const steer = vi.spyOn(f.supervisor.steer, "steerCrewmate");
    await f.agent.converse("how is pagination going?");
    const tools = toolsOf(f.specs);
    await tools.get("tasks")?.execute("q1", {});
    // An operational wake that arrives meanwhile is not carried on the retry.
    notifyProse(f.db, f.agent, "[fm-op] a different thing happened", "agent");
    await finish(f, "It is going well.");
    await drained(f.session, 2);
    expect(f.session.prompts[1]).toContain(ANSWER_MISSING_OPENING);
    expect(f.session.prompts[1]).toContain("how is pagination going?");
    expect(f.session.prompts[1]).not.toContain("a different thing happened");
    expect(states(f)).toEqual(["retrying"]);
    expect(f.session.thinkingLevels.at(-1)).toBe("medium");

    // Every tool that changes work or settings answers with a refusal.
    for (const [name, params] of [
      ["steer_crewmate", { task_id: "t1", message: "go" }],
      ["update_task", { task: "t1", title: "Renamed" }],
      [
        "record_knowledge",
        { action: "publish", request_id: "x", kind: "concept", title: "y", text: "told" },
      ],
    ] as const) {
      const refused = await tools.get(name)?.execute(`r-${name}`, params);
      expect(refused?.content[0]?.text).toBe(ANSWER_ONLY_REFUSAL);
    }
    expect(steer).not.toHaveBeenCalled();
    expect(f.tasks.get("t1")?.title).toBe("Add pagination");

    await tools.get("emit_card")?.execute("c1", {
      ...note("pagination-on-track", "Pagination is on track"),
      related: ["t1"],
    });
    await finish(f);
    expect(states(f)).toEqual(["covered"]);
    expect(noticeOf(f)).toBeUndefined();
    // The other wake is served next, on its own.
    await drained(f.session, 3);
    expect(f.session.prompts[2]).toContain("a different thing happened");
    expect(f.session.prompts[2]).not.toContain(ANSWER_MISSING_OPENING);
  });

  it("does not count a refused card or a reaction after it, names the card that owns the work, and raises one notice when the retry fails too", async () => {
    const f = setup({
      silent: true,
      seedTasks: [{ id: "t58", title: "Check if PR 58 merged", status: "idle" }],
      seedCards: [crewCard("card-t58-1", "t58", "PR 58 is merged", "Already shown.")],
    });
    await f.agent.converse({ text: "is PR 58 merged? <b>now</b>", taskId: "t58" });
    const tools = toolsOf(f.specs);
    await expect(
      tools.get("emit_card")?.execute("c1", {
        title: "PR 58 is merged",
        body: "<p>Restating.</p>",
        related: ["t58"],
      }),
    ).rejects.toThrow(/emit_card with id card-t58-1/);
    await tools.get("emote")?.execute("e1", { emote: "nod" });
    await finish(f, "SECRET closing words <script>alert(1)</script>");
    await drained(f.session, 2);
    expect(states(f)).toEqual(["retrying"]);
    // Shared cards (INF-2214): the retry names the card to write on.
    expect(f.session.prompts[1]).toContain(
      "the crewmate's card card-t58-1 is already on screen for that work: write on it with emit_card and its id",
    );

    // The retry shows nothing either: one notice, and no second retry.
    await finish(f, "Still nothing.");
    await vi.waitFor(() => expect(noticeOf(f)).toBeDefined());
    const ask = f.tasks.capture.listAsks()[0];
    const notice = noticeOf(f);
    expect(notice).toMatchObject({
      id: `card-ask-${ask?.id}`,
      author: "host",
      title: "Your first mate has not answered your message",
    });
    expect(notice?.actions.map((action) => action.id)).toEqual(["ask-again", "leave-it"]);
    expect(notice?.body).toContain("is PR 58 merged? &lt;b&gt;now&lt;/b&gt;");
    expect(notice?.body).not.toContain("SECRET");
    expect(JSON.stringify(f.supervisor.cards.snapshot())).not.toContain("SECRET");
    expect(ask).toMatchObject({ delivery: "unresolved", noticeCardId: `card-ask-${ask?.id}` });
    expect(retries(f)).toHaveLength(1);
    f.agent.pokeInbox();
    await tick();
    expect(f.session.prompts).toHaveLength(2);
  });

  // The refusal above sends the first mate to the crewmate's card,
  // shown before the message; its line in that card's thread is its answer.
  it("ends a message the first mate answered in the thread of a crewmate's card already up, with no retry and no notice", async () => {
    const f = setup({
      silent: true,
      seedTasks: [{ id: "t58", title: "Check if PR 58 merged", status: "idle" }],
      seedCards: [crewCard("card-t58-1", "t58", "PR 58 is merged", "Already shown.")],
    });
    vi.advanceTimersByTime(1_000);
    await f.agent.converse("is PR 58 merged?");
    const tools = toolsOf(f.specs);
    await expect(
      tools.get("emit_card")?.execute("c1", {
        title: "PR 58 is merged",
        body: "<p>Restating.</p>",
        related: ["t58"],
      }),
    ).rejects.toThrow(/emit_card with id card-t58-1/);
    const written = await tools.get("emit_card")?.execute("c2", {
      id: "card-t58-1",
      title: "PR 58 is merged",
      body: "<p>Already shown.</p>",
      reply: "Yes, PR 58 merged this morning.",
    });
    expect(written?.content[0]?.text).toContain('Wrote on the thread of card "PR 58 is merged"');
    await finish(f, "Answered on its card.");
    await tick();

    const ask = f.tasks.capture.listAsks()[0];
    expect(ask).toMatchObject({ delivery: "covered", answerCardId: "card-t58-1" });
    expect(ask?.answeredAt).not.toBeNull();
    expect(retries(f)).toEqual([]);
    expect(noticeOf(f)).toBeUndefined();
    expect(f.supervisor.cards.thread("card-t58-1").messages.map((line) => line.who)).toContain(
      "firstmate",
    );
  });

  it("sends the message again on Ask again as a fresh linked turn with the same hint, and Leave it runs nothing", async () => {
    const f = setup({
      silent: true,
      seedTasks: [{ id: "t58", title: "Check if PR 58 merged", status: "idle" }],
    });
    await f.agent.converse({ text: "is PR 58 merged?", taskId: "t58" });
    await finish(f);
    await drained(f.session, 2);
    await finish(f);
    await vi.waitFor(() => expect(noticeOf(f)).toBeDefined());
    const first = f.tasks.capture.listAsks()[0];
    const prompts = f.session.prompts.length;

    f.supervisor.cardActions.act(`card-ask-${first?.id}`, "leave-it");
    await tick();
    expect(f.session.prompts).toHaveLength(prompts);
    expect(noticeOf(f)).toBeUndefined();
    expect(f.tasks.capture.getAsk(first?.id ?? "")?.delivery).toBe("unresolved");

    // Ask again on a second notice (the first is gone): a fresh turn, linked.
    const g = setup({
      silent: true,
      seedTasks: [{ id: "t58", title: "Check if PR 58 merged", status: "idle" }],
    });
    initOverflowDir(scratchDir("infinitary-retry-files-"));
    const messageFiles: MessageFile[] = [];
    withPastedFiles("", [{ name: "notes.txt", text: "Check the attached result." }], messageFiles);
    await g.agent.converse({ text: "is PR 58 merged?", taskId: "t58", messageFiles });
    await finish(g);
    await drained(g.session, 2);
    await finish(g);
    await vi.waitFor(() => expect(noticeOf(g)).toBeDefined());
    const original = g.tasks.capture.listAsks()[0];
    g.supervisor.cardActions.act(`card-ask-${original?.id}`, "ask-again");
    await vi.waitFor(() => expect(g.session.prompts).toHaveLength(3));
    expect(g.session.prompts[2]).toContain("[user]\nis PR 58 merged?");
    const again = g.tasks.capture.listAsks().at(-1);
    expect(again?.id).not.toBe(original?.id);
    expect(again).toMatchObject({
      text: "is PR 58 merged?",
      messageFiles,
      hintTaskId: "t58",
      delivery: "pending",
      deliveryFacts: { retryOf: original?.id },
    });
    expect(noticeOf(g)).toBeUndefined();
    // The original stays unresolved, and is never retried or noticed again.
    expect(g.tasks.capture.getAsk(original?.id ?? "")?.delivery).toBe("unresolved");
  });

  // INF-2664, the captain's recorded case: they chose on the first mate's
  // card 0.4 seconds before its reply finished, the click's step started the
  // work, and that work's crewmate card answered them - yet the notice went up.
  it("counts a choice made before the reply finishes, and the card of work named for the message as its answer (INF-2664)", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("why is my mac mini having memory pressure warning?");
    const ask = f.tasks.capture.listAsks()[0];
    const shown = await toolsOf(f.specs)
      .get("emit_card")
      ?.execute("c1", {
        title: "Memory pressure on the Mac mini has two likely causes",
        body: "<p>A file indexer or a build is holding the most memory.</p>",
        actions: [
          { id: "find", label: "Find what's using the memory", default: true },
          { id: "wait", label: "Leave it for now" },
        ],
      });
    const cardId = shown?.content[0]?.text?.match(/\((card-fm-[^)]+)\)/)?.[1] ?? "";
    // The captain's choice lands while the reply that showed the card still runs.
    f.supervisor.cardActions.act(cardId, "find");
    expect(f.tasks.capture.getAsk(ask?.id ?? "")?.answerCardId).toBe(cardId);
    await finish(f, "Here is what I found.");
    await drained(f.session, 2);
    expect(retries(f)).toEqual([]);

    // The click's step names the message on the work it starts.
    const started = await toolsOf(f.specs).get("spawn_crewmate")?.execute("s1", {
      title: "Find what is using the Mac mini's memory",
      goal: "Name the process holding the memory and how to relieve it",
      user_words: "Find what's using the memory",
      ask_id: ask?.id,
    });
    // Recorded at once; its crewmate starts behind the answer (INF-3060).
    expect(started?.content[0]?.text).toContain("it is starting now");
    await vi.waitFor(() => expect(f.crewSpecs).toHaveLength(1));
    await finish(f, "Started.");
    expect(retries(f)).toEqual([]);
    expect(noticeOf(f)).toBeUndefined();

    // Its crewmate's answering card is the answer the captain chooses on.
    const work = f.tasks.list().find((task) => task.title.startsWith("Find what is using"));
    await f.crewSpecs[0]?.callbacks?.onCard?.({
      title: "A file indexer holds most of the memory",
      body: "<p>Pausing it relieves the pressure.</p>",
      answering: true,
      actions: [
        { id: "pause", label: "Pause the indexer", default: true },
        { id: "keep", label: "Keep it running" },
      ],
    });
    // Its report puts the card on the stage.
    await f.crewSpecs[0]?.tools
      ?.find((tool) => tool.name === "report")
      ?.run({ text: "The indexer holds the memory.", summary: "Found the indexer." });
    const answer = f.supervisor.cards.openCardsFor(work?.id ?? "")[0]?.id ?? "";
    f.supervisor.cardActions.act(answer, "pause");
    expect(f.tasks.capture.getAsk(ask?.id ?? "")?.answerCardId).toBe(answer);
    expect(retries(f)).toEqual([]);
    expect(noticeOf(f)).toBeUndefined();
  });

  it("takes the notice back when an answering card of the message's work goes up, and raises the same notice if it goes unanswered again (INF-2664)", async () => {
    const f = setup({
      silent: true,
      seedTasks: [{ id: "t58", title: "Check if PR 58 merged", status: "idle" }],
    });
    await f.agent.converse({ text: "is PR 58 merged?", taskId: "t58" });
    await finish(f);
    await drained(f.session, 2);
    await finish(f);
    await vi.waitFor(() => expect(noticeOf(f)).toBeDefined());
    const ask = f.tasks.capture.listAsks()[0];
    const notice = `card-ask-${ask?.id}`;

    // A later step names the message, its notice up, on the work it starts.
    notifyProse(f.db, f.agent, "[fm-op] a crewmate reported on PR 58", "agent");
    await drained(f.session, 3);
    await toolsOf(f.specs).get("spawn_crewmate")?.execute("s1", {
      title: "Check whether PR 58 merged",
      goal: "Say whether PR 58 merged",
      user_words: "is PR 58 merged?",
      ask_id: ask?.id,
    });
    await vi.waitFor(() => expect(f.crewSpecs).toHaveLength(1));
    await finish(f);
    expect(noticeOf(f)?.id).toBe(notice);

    // Its crewmate's answering card takes the notice back once it reaches
    // the stage: while it is held for the crewmate's close-out, the captain
    // sees neither, so the notice stays up.
    const work = f.tasks.list().find((task) => task.title === "Check whether PR 58 merged");
    await f.crewSpecs[0]?.callbacks?.onCard?.({
      title: "PR 58 merged",
      body: "<p>It merged into main.</p>",
      answering: true,
      actions: [
        { id: "close-out", label: "Close it out", default: true },
        { id: "recheck", label: "Check again tomorrow" },
      ],
    });
    const crewCard = () =>
      f.supervisor.cards
        .snapshot()
        .find((card) => card.taskId === work?.id && card.title === "PR 58 merged");
    expect(crewCard()?.awaiting).toBe("close-out");
    expect(noticeOf(f)?.id).toBe(notice);
    await f.crewSpecs[0]?.tools
      ?.find((tool) => tool.name === "report")
      ?.run({ text: "PR 58 merged.", summary: "PR 58 merged." });
    expect(crewCard()?.awaiting).toBeUndefined();
    expect(noticeOf(f)).toBeUndefined();
    expect(f.tasks.capture.getAsk(ask?.id ?? "")?.delivery).toBe("covered");

    // The approved minus rule preserves this unanswered decision and its coverage.
    const answerId = f.supervisor.cards.openCardsFor(work?.id ?? "")[0]?.id ?? "";
    f.tasks.close(work?.id ?? "", { status: "done", reason: "answered", actor: "host" });
    f.supervisor.close(answerId);
    expect(f.supervisor.cards.snapshot().find((card) => card.id === answerId)).toMatchObject({
      minimized: true,
    });
    expect(f.tasks.capture.getAsk(ask?.id ?? "")?.delivery).toBe("covered");
    expect(noticeOf(f)).toBeUndefined();
    // Notice retraction requires a genuinely absent answering card. Its author
    // withdraws the unanswered offer; no captain choice or receipt is invented.
    f.supervisor.closeCard(
      answerId,
      { kind: "crewmate", taskId: work?.id ?? "" },
      "Withdraw the unanswered offer",
    );
    expect(f.supervisor.cards.snapshot().some((card) => card.id === answerId)).toBe(false);
    await vi.waitFor(() => expect(noticeOf(f)?.id).toBe(notice));
    expect(f.tasks.capture.getAsk(ask?.id ?? "")).toMatchObject({
      delivery: "unresolved",
      noticeCardId: notice,
    });
    expect(retries(f)).toHaveLength(1);

    // Leave it ends the message: naming it again is refused as ended.
    f.supervisor.cardActions.act(notice, "leave-it");
    notifyProse(f.db, f.agent, "[fm-op] another report on PR 58", "agent");
    await drained(f.session, 4);
    await expect(
      toolsOf(f.specs)
        .get("create_task")
        ?.execute("t1", { title: "Recheck PR 58", ask_id: ask?.id }),
    ).rejects.toThrow(/has ended/);
    await finish(f);
  });

  it("says in close_card's answer when the close leaves an open message with no answering card (INF-2664)", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("what is two plus two?");
    const ask = f.tasks.capture.listAsks()[0];
    const tools = toolsOf(f.specs);
    const idOf = (shown: { content: { text?: string }[] } | undefined) =>
      shown?.content[0]?.text?.match(/\((card-fm-[^)]+)\)/)?.[1] ?? "";
    const first = idOf(await tools.get("emit_card")?.execute("c1", note("four", "Four")));
    const second = idOf(await tools.get("emit_card")?.execute("c2", note("still-four", "Four")));
    const left = `The captain's message ${ask?.id} ("what is two plus two?") now has no answering card up`;
    // Another card that can answer it is still up: nothing to say.
    const kept = await tools.get("close_card")?.execute("x1", { card_id: first, reason: "twice" });
    expect(kept?.content[0]?.text).not.toContain(left);
    const closed = await tools.get("close_card")?.execute("x2", { card_id: second });
    expect(closed?.content[0]?.text).toContain(left);
    await finish(f);
  });

  // INF-2667 review of INF-2664: a newer message about the same work after
  // the notice was taken back has a retry of its own; the old notice, with the
  // old words, never stands in for it. Since INF-6115 it keeps its own thread.
  it("gives a newer message about the same work after a withdrawn notice its own retry (INF-2664)", async () => {
    const f = setup({
      silent: true,
      seedTasks: [{ id: "t58", title: "Check if PR 58 merged", status: "idle" }],
    });
    await f.agent.converse({ text: "is PR 58 merged?", taskId: "t58" });
    await finish(f);
    await drained(f.session, 2);
    await finish(f);
    await vi.waitFor(() => expect(noticeOf(f)).toBeDefined());
    const ask = f.tasks.capture.listAsks()[0];

    notifyProse(f.db, f.agent, "[fm-op] a crewmate reported on PR 58", "agent");
    await drained(f.session, 3);
    await toolsOf(f.specs).get("spawn_crewmate")?.execute("s1", {
      title: "Check whether PR 58 merged",
      goal: "Say whether PR 58 merged",
      user_words: "is PR 58 merged?",
      ask_id: ask?.id,
    });
    await vi.waitFor(() => expect(f.crewSpecs).toHaveLength(1));
    await finish(f);
    const work = f.tasks.list().find((task) => task.title === "Check whether PR 58 merged");
    await f.crewSpecs[0]?.callbacks?.onCard?.({
      title: "PR 58 merged",
      body: "<p>It merged into main.</p>",
      answering: true,
      actions: [
        { id: "close-out", label: "Close it out", default: true },
        { id: "recheck", label: "Check again tomorrow" },
      ],
    });
    await f.crewSpecs[0]?.tools
      ?.find((tool) => tool.name === "report")
      ?.run({ text: "PR 58 merged.", summary: "PR 58 merged." });
    expect(noticeOf(f)).toBeUndefined();

    // A newer message about that work keeps its own thread on it.
    await f.agent.converse({ text: "and did its checks pass?", taskId: work?.id ?? "" });
    await vi.waitFor(() => expect(f.tasks.capture.listAsks()).toHaveLength(2));
    const newer = f.tasks.capture.listAsks()[1];
    await finish(f);
    expect(f.tasks.capture.getAsk(newer?.id ?? "")?.continues).toBeNull();

    // The approved minus rule keeps this decision available to the newer message.
    const answerId = f.supervisor.cards.openCardsFor(work?.id ?? "")[0]?.id ?? "";
    f.tasks.close(work?.id ?? "", { status: "done", reason: "answered", actor: "host" });
    f.supervisor.close(answerId);
    expect(f.supervisor.cards.snapshot().find((card) => card.id === answerId)).toMatchObject({
      minimized: true,
    });
    expect(f.tasks.capture.getAsk(newer?.id ?? "")?.delivery).toBe("covered");
    expect(noticeOf(f)).toBeUndefined();
    // The author removes the unanswered offer, so the newer message now needs
    // its own retry, with its own words; the older notice is not substituted.
    // The older message, its retry spent, gets its own notice back with its
    // own words (INF-6115: each message ends on its own).
    f.supervisor.closeCard(
      answerId,
      { kind: "crewmate", taskId: work?.id ?? "" },
      "Withdraw the unanswered offer",
    );
    expect(f.supervisor.cards.snapshot().some((card) => card.id === answerId)).toBe(false);
    await vi.waitFor(() =>
      expect(f.tasks.capture.getAsk(newer?.id ?? "")?.delivery).toBe("retrying"),
    );
    const wakes = new InboxStore(f.db)
      .allFor(FIRSTMATE_RECIPIENT)
      .flatMap((row) => (row.facts?.kind === "answer-missing" ? [row.facts.askId] : []));
    expect(wakes).toEqual([newer?.id]);
    expect(noticeOf(f)?.id).toBe(f.tasks.capture.getAsk(ask?.id ?? "")?.noticeCardId);
    expect(noticeOf(f)?.body).toContain("is PR 58 merged?");
    expect(noticeOf(f)?.body).not.toContain("and did its checks pass?");
    expect(f.tasks.capture.getAsk(ask?.id ?? "")?.delivery).toBe("unresolved");
  });

  // INF-2664, found running the app: a decision card files its own task, which
  // ends with the card, so closing it in the step that showed it still names
  // the message it leaves without an answer.
  it("says so in close_card's answer for a decision card closed in the step that showed it (INF-2664)", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("what is two plus two?");
    const ask = f.tasks.capture.listAsks()[0];
    const tools = toolsOf(f.specs);
    const shown = await tools.get("emit_card")?.execute("c1", {
      title: "Two plus two is four",
      body: "<p>2 + 2 = 4.</p>",
      answering: true,
      actions: [
        { id: "ok", label: "Thanks", default: true },
        { id: "more", label: "Explain more" },
      ],
    });
    const id = shown?.content[0]?.text?.match(/\((card-fm-[^)]+)\)/)?.[1] ?? "";
    const closed = await tools.get("close_card")?.execute("x1", { card_id: id });
    expect(closed?.content[0]?.text).toContain(
      `The captain's message ${ask?.id} ("what is two plus two?") now has no answering card up`,
    );
    await finish(f);
  });

  // INF-2667 review of INF-2664: close_card names only the messages that
  // waited on the card it closed, never a newer message the card came before;
  // since INF-6115 the older message waits on it in a thread of its own.
  it("names in close_card's answer only the messages waiting on that card (INF-2664)", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("is PR 58 merged?");
    const first = f.tasks.capture.listAsks()[0];
    const shown = await toolsOf(f.specs).get("emit_card")?.execute("c1", note("merged", "Merged"));
    const card = shown?.content[0]?.text?.match(/\((card-fm-[^)]+)\)/)?.[1] ?? "";
    await finish(f);
    // A newer message about the card's work; the card came before it.
    const work = f.tasks.capture.getAsk(first?.id ?? "")?.taskId ?? "";
    await f.agent.converse({ text: "and did its checks pass?", taskId: work });
    await drained(f.session, 2);
    await finish(f);
    const newer = f.tasks.capture.listAsks()[1];
    expect(f.tasks.capture.getAsk(newer?.id ?? "")?.continues).toBeNull();
    const thread = f.supervisor.askEnding.thread(newer?.id ?? "");
    expect(thread && f.supervisor.askEnding.state(thread).kind).not.toBe("waiting");
    notifyProse(f.db, f.agent, "[fm-op] a crewmate reported on PR 58", "agent");
    await vi.waitFor(() => expect(f.session.prompts.length).toBeGreaterThanOrEqual(3));
    const closed = await toolsOf(f.specs).get("close_card")?.execute("x1", { card_id: card });
    expect(closed?.content[0]?.text).toContain("Closed card");
    // The first message waited on the card in its own thread (INF-6115).
    expect(closed?.content[0]?.text).toContain(
      `The captain's message ${first?.id} ("is PR 58 merged?") now has no answering card up`,
    );
    expect(closed?.content[0]?.text).not.toContain(newer?.id ?? "");
    await finish(f);
  });

  // INF-1433: Ask again must send the retained pictures, even with no words.
  it.each(["What is in these pictures?", ""])(
    "resends the original pictures and their names with Ask again (%j)",
    async (text) => {
      const f = setup({ silent: true });
      const images = [
        { ...pngImage, name: "screenshot.png" },
        { ...jpegImage, name: "photo.jpg" },
      ];
      await f.agent.converse({ text, images });
      await finish(f);
      await drained(f.session, 2);
      await finish(f);
      await vi.waitFor(() => expect(noticeOf(f)).toBeDefined());
      const original = f.tasks.capture.listAsks()[0];
      expect(original?.attachments).toHaveLength(2);

      f.supervisor.cardActions.act(`card-ask-${original?.id}`, "ask-again");
      await vi.waitFor(() => expect(f.session.prompts).toHaveLength(3));
      expect(f.session.promptImages[2]).toEqual(images);
      const again = f.tasks.capture.listAsks().at(-1);
      expect(again).toMatchObject({ text, deliveryFacts: { retryOf: original?.id } });
      expect(
        again?.attachments?.map(({ name, mimeType, bytes, sha256 }) => ({
          name,
          mimeType,
          bytes,
          sha256,
        })),
      ).toEqual(
        original?.attachments?.map(({ name, mimeType, bytes, sha256 }) => ({
          name,
          mimeType,
          bytes,
          sha256,
        })),
      );
      for (const [index, attachment] of (again?.attachments ?? []).entries()) {
        expect(readFileSync(attachmentPath(attachment)).toString("base64")).toBe(
          images[index]?.data,
        );
      }
      expect(noticeOf(f)).toBeUndefined();
    },
  );

  // The same intent excludes a partial resend when one retained picture is unavailable.
  it.each(["missing", "changed"])(
    "does not resend words or a subset of pictures when a saved picture is %s",
    async (condition) => {
      const f = setup({ silent: true });
      await f.agent.converse({
        text: "Compare these pictures",
        images: [
          { ...pngImage, name: "first.png" },
          { ...jpegImage, name: "second.jpg" },
        ],
      });
      await finish(f);
      await drained(f.session, 2);
      await finish(f);
      await vi.waitFor(() => expect(noticeOf(f)).toBeDefined());
      const original = f.tasks.capture.listAsks()[0];
      const attachment = original?.attachments?.[1] as AttachmentRef;
      if (condition === "missing") rmSync(attachmentPath(attachment));
      else writeFileSync(attachmentPath(attachment), Buffer.from(pngImage.data, "base64"));

      f.supervisor.cardActions.act(`card-ask-${original?.id}`, "ask-again");
      await tick();
      expect(f.session.prompts).toHaveLength(2);
      expect(f.tasks.capture.listAsks()).toHaveLength(1);
      expect(f.events).toContainEqual({
        type: "firstmate_note",
        text: expect.stringContaining('The picture "second.jpg" is not available'),
      });
    },
  );

  it("judges each message by the actions after it: a card before a steered message does not cover it", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("first question");
    await toolsOf(f.specs).get("emit_card")?.execute("c1", note("first", "First answer"));
    await f.agent.converse("second question");
    expect(f.session.steers).toHaveLength(1);
    await finish(f);
    await drained(f.session, 2);
    const [first, second] = f.tasks.capture.listAsks();
    expect(first?.delivery).toBe("covered");
    expect(second?.delivery).toBe("retrying");
    // The retry asks about the second message alone; the first, whose card is
    // up for the captain, is only among the open messages in the turn's facts.
    const retry = f.session.prompts[1]?.slice(f.session.prompts[1].indexOf(ANSWER_MISSING_OPENING));
    expect(retry).toContain("second question");
    expect(retry).not.toContain("first question");
  });

  // INF-1610 piece 2: the first mate reads every message of the captain's
  // still waiting for its answer in its turn facts, with how it stands.
  it("lists a message whose work runs on among the open messages, and drops it once its answer is accepted", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("build the personal panels in isolation");
    await toolsOf(f.specs).get("spawn_crewmate")?.execute("spawn", {
      title: "Build personal panels in isolation",
      goal: "Build the panels in isolation",
      user_words: "build the personal panels in isolation",
    });
    await finish(f, "Started the panels.");
    const task = f.tasks.list().find((row) => row.title === "Build personal panels in isolation");
    const open = () =>
      decodeContext(f.agent.buildContextBlock()).open_asks as
        | { asks: Record<string, unknown>[] }
        | undefined;
    expect(open()?.asks).toEqual([
      expect.objectContaining({
        ask_id: f.tasks.capture.listAsks()[0]?.id,
        state: "working",
        running: [`${task?.key}: Build personal panels in isolation`],
      }),
    ]);
    const ask = f.tasks.capture.listAsks()[0];
    f.tasks.close(task?.id ?? "", { status: "done", reason: "answered", actor: "host" });
    f.tasks.capture.markAnswered(ask?.id ?? "", null);
    expect(open()).toBeUndefined();
  });

  it("covers both messages when the action came after both were read", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("first question");
    await f.agent.converse("second question");
    await toolsOf(f.specs).get("emit_card")?.execute("c1", note("both", "Both answered"));
    await finish(f);
    expect(states(f)).toEqual(["covered", "covered"]);
    expect(f.session.prompts).toHaveLength(1);
  });

  it("leaves a steered message the turn never read to the turn that does, with none of this turn's actions", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("first question");
    f.session.holdSteers();
    await f.agent.converse("second question");
    await toolsOf(f.specs).get("emit_card")?.execute("c1", note("first", "First answer"));
    await finish(f);
    const [first, second] = f.tasks.capture.listAsks();
    expect(first?.delivery).toBe("covered");
    // Not judged, and the card shown after it was steered in never counted for it.
    expect(second).toMatchObject({ delivery: "pending", deliveryFacts: { entries: [] } });
    // Its own turn serves it as the captain's words and judges it there.
    await drained(f.session, 2);
    expect(f.session.prompts[1]).toContain("[user]\nsecond question");
    expect(retries(f)).toEqual([]);
    await toolsOf(f.specs).get("emote")?.execute("e1", { emote: "nod" });
    await finish(f);
    expect(states(f)).toEqual(["covered", "covered"]);
  });

  // Audit row 5: recovery is shared by resolved provider errors and throws.
  // The durable lane must own the live input and read steers exactly once.
  it.each(["provider", "thrown"] as const)(
    "recovers live words and steers after a %s failure without a second ask",
    async (failure) => {
      const f = setup({ silent: true });
      const inbox = new InboxStore(f.db);
      await f.agent.converse({ text: "count the fenders", images: [pngImage] });
      await f.agent.converse("also count the lines");
      const originalIds = f.tasks.capture.listAsks().map((ask) => ask.id);
      if (failure === "thrown") f.session.rejectNextPrompt("Connection error.");
      else {
        f.session.emitTurnFailed("Connection error.");
        f.session.resolveNextPrompt();
      }
      await tick();
      expect(states(f)).toEqual(["held", "held"]);
      const parked = inbox.allFor(FIRSTMATE_RECIPIENT);
      expect(parked).toHaveLength(2);
      expect(f.session.prompts).toHaveLength(1);
      expect(retries(f)).toEqual([]);
      f.supervisor.cardActions.act("card-fm-turn-failure", "retry-firstmate");
      await drained(f.session, 2);
      const userWords = f.session.prompts[1]!.slice(f.session.prompts[1]!.indexOf("[user]"));
      for (const words of ["count the fenders", "also count the lines"])
        expect(userWords.split(words)).toHaveLength(2);
      expect(f.session.promptImages[1]).toEqual([
        { mimeType: pngImage.mimeType, data: pngImage.data },
      ]);
      await toolsOf(f.specs).get("emit_card")?.execute("answer", note("counts", "The counts"));
      await finish(f);
      expect(f.tasks.capture.listAsks().map((ask) => ask.id)).toEqual(originalIds);
      expect(states(f)).toEqual(["covered", "covered"]);
      expect(inbox.allFor(FIRSTMATE_RECIPIENT)).toEqual([]);
      expect(noticeOf(f)).toBeUndefined();
      console.log(
        JSON.stringify({
          intent: "audit row 5 same-ask recovery",
          failure,
          asks: f.tasks.capture
            .listAsks()
            .map(({ id, turnState, delivery }) => ({ id, turnState, delivery })),
          lane: inbox.allFor(FIRSTMATE_RECIPIENT),
          prompts: f.session.prompts.length,
        }),
      );
    },
  );

  // Deleting Retry's resend path must also preserve messages rejected before
  // a model starts (audit row 5's one-ask requirement).
  it.each(["session", "directions"] as const)(
    "retries a %s preparation failure on its original ask",
    async (failure) => {
      const options = {
        silent: true,
        failCreate: failure === "session" ? "Conversation could not start." : "",
      };
      const f = setup(options);
      const unavailable =
        failure === "directions"
          ? vi
              .spyOn(f.knowledge!, "availability")
              .mockReturnValue({ state: "unavailable", reason: "The folder could not be read." })
          : undefined;
      await f.agent.converse("count the fenders");
      const originalIds = f.tasks.capture.listAsks().map((ask) => ask.id);
      expect(new InboxStore(f.db).allFor(FIRSTMATE_RECIPIENT)).toHaveLength(1);
      expect(f.session.prompts).toEqual([]);
      options.failCreate = "";
      unavailable?.mockRestore();
      if (failure === "session")
        f.supervisor.cardActions.act("card-fm-turn-failure", "retry-firstmate");
      else f.agent.pokeInbox();
      await drained(f.session, 1);
      await toolsOf(f.specs).get("emit_card")?.execute("answer", note("fenders", "Twelve fenders"));
      await finish(f);
      expect(f.tasks.capture.listAsks().map((ask) => ask.id)).toEqual(originalIds);
      expect(states(f)).toEqual(["covered"]);
    },
  );

  it("holds a message a failed turn read and judges it when a turn serves it again", async () => {
    const f = setup({ silent: true });
    await f.agent.converse("hello");
    f.session.emitTurnFailed("Response incomplete: max_time_limit");
    f.session.resolveNextPrompt();
    await tick();
    // The failure keeps today's handling: its own card, and no answer-missing retry.
    expect(states(f)).toEqual(["held"]);
    expect(f.supervisor.cards.snapshot().map((card) => card.id)).toEqual(["card-fm-turn-failure"]);
    expect(retries(f)).toEqual([]);
    f.supervisor.cardActions.act("card-fm-turn-failure", "retry-firstmate");
    await tick();
    expect(f.session.prompts).toHaveLength(2);
    expect(f.session.prompts[1]).toContain("[user]\nhello");
    await toolsOf(f.specs).get("emit_card")?.execute("c1", note("hi", "Hello"));
    await finish(f);
    expect(states(f)).toEqual(["covered"]);
    expect(f.session.prompts).toHaveLength(2);
  });

  it("covers a reply under its own card by the closing words written in that card's replies, and retries one that wrote none", async () => {
    const f = setup({ silent: true });
    const cardId = f.supervisor.addFirstmateCard({
      title: "Pick one",
      body: "<p>A or B.</p>",
      actions: [{ id: "a", label: "A", default: true }],
    });
    f.supervisor.cardActions.replyToCard(cardId, "why A?");
    await drained(f.session, 1);
    await finish(f, "A keeps the queue in order.");
    expect(f.supervisor.cards.thread(cardId).messages.map((message) => message.who)).toContain(
      "firstmate",
    );
    expect(states(f)).toEqual(["covered"]);
    expect(f.session.prompts).toHaveLength(1);

    // A reply the turn answered with nothing is retried, under the same card.
    f.supervisor.cardActions.replyToCard(cardId, "and why not B?");
    await drained(f.session, 2);
    await finish(f, "");
    await drained(f.session, 3);
    expect(states(f)).toEqual(["covered", "retrying"]);
    expect(f.session.prompts[2]).toContain(`a reply under your card "Pick one" (${cardId})`);
    expect(decodeContext(f.session.prompts[2] as string).about).toContain(cardId);
    await finish(f, "B hides the retry.");
    expect(states(f)).toEqual(["covered", "covered"]);
    expect(f.session.prompts).toHaveLength(3);
  });

  // INF-4667 finding 3: the first mate answers a reply under a required-action
  // card with emit_card on that id and reply, as the card's own guidance asks.
  // The host keeps the card and writes only the thread line, so that answer is
  // a reply on the card: once the captain confirms the step, the message has
  // its answer and no answer-missing retry follows.
  it("counts the first mate's thread answer on a required-action card as the reply that answers it", async () => {
    const f = setup({ silent: true });
    seedTask(f.tasks, { id: "action-source", title: "Update setup", status: "completed" });
    f.tasks.delivery.declareRequiredActions(
      "action-source",
      {
        cardId: "card-source",
        offerId: "offer-source",
        actions: [
          {
            id: "rebuild",
            title: "Rebuild the setup",
            target: "the computer",
            consequence: "The old setup is still running.",
            instructions: ["Rebuild the updated setup."],
            criterion: "The rebuild succeeds.",
            prerequisites: [],
            completion: { kind: "manual", label: "It succeeded" },
          },
        ],
      },
      true,
    );
    const action = f.tasks.listOpen().find((task) => task.delivery?.captainAction);
    const cardId = action?.delivery?.captainAction?.cardId ?? "";
    f.supervisor.cards.presentRequiredAction(action?.id ?? "");
    const shown = f.supervisor.cards.snapshot().find((card) => card.id === cardId);
    expect(shown).toBeDefined();

    // The captain reads the card a while and then asks under it.
    vi.advanceTimersByTime(60_000);
    f.supervisor.cardActions.replyToCard(cardId, "where do I run the rebuild?");
    await drained(f.session, 1);
    const asked = f.supervisor.cards.thread(cardId).messages.at(-1)?.id;
    const answered = await toolsOf(f.specs).get("emit_card")?.execute("c1", {
      id: cardId,
      task_id: action?.id,
      title: shown?.title,
      body: "<p>The old setup is still running.</p>",
      answers_message: asked,
      reply: "Run it on the computer that still has the old setup.",
    });
    expect(answered?.content[0]?.text).toContain(cardId);
    await finish(f, "Answered on the card.");
    expect(states(f)).toEqual(["covered"]);
    // The host kept its own card and wrote the answer into the thread.
    expect(f.supervisor.cards.snapshot().find((card) => card.id === cardId)?.body).toBe(
      shown?.body,
    );
    expect(f.supervisor.cards.thread(cardId).messages.at(-1)).toMatchObject({
      who: "firstmate",
      text: "Run it on the computer that still has the old setup.",
    });

    // Later the captain does the step and confirms it on the same card.
    vi.advanceTimersByTime(60_000);
    f.supervisor.cardActions.act(cardId, "confirm");
    await tick();
    const ask = f.tasks.capture.listAsks()[0];
    const thread = f.supervisor.askEnding.thread(ask?.id ?? "");
    // The message ended on the card the first mate answered it under.
    expect(thread && f.supervisor.askEnding.state(thread)).toEqual({ kind: "answered", cardId });
  });

  // INF-5202, the incident on the first mate's own note: the captain asked
  // under it, the first mate answered once in the thread naming the message
  // and left the card as it was, and the check read that write as a card
  // shown again with nothing new shown. Its wake then had the answer written
  // twice more, in the thread and in the card's body.
  describe("a thread answer on the first mate's own card it left as it was (INF-5202)", () => {
    const card = {
      id: "google-ownership",
      title: "Google sign-in ownership: partly moved",
      body: "<p>Partly: the publisher moved, the project did not.</p>",
      answering: true,
    };
    const replyUnderNote = async (f: Fixture) => {
      await f.agent.converse("did we move the google integration to the company?");
      await toolsOf(f.specs).get("emit_card")?.execute("c0", card);
      await finish(f, "Answered on a card.");
      const cardId =
        f.supervisor.cards.snapshot().find((shown) => shown.title === card.title)?.id ?? "";
      // The captain reads it a while, then asks under it.
      vi.advanceTimersByTime(60_000);
      f.supervisor.cardActions.replyToCard(cardId, "is that a cosmetic or a legal problem?");
      await drained(f.session, 2);
      const asked = f.supervisor.cards.thread(cardId).messages.at(-1)?.id ?? 0;
      return { cardId, asked };
    };
    const firstmateLines = (f: Fixture, cardId: string) =>
      f.supervisor.cards.thread(cardId).messages.filter((message) => message.who === "firstmate");

    it("ends the message with one answer naming it, sends no retry, and says so in the receipt", async () => {
      const f = setup({ silent: true });
      const { cardId, asked } = await replyUnderNote(f);
      const receipt = await toolsOf(f.specs)
        .get("emit_card")
        ?.execute("c1", {
          ...card,
          id: cardId,
          reply: "It is more than cosmetic, but nothing is blocked.",
          answers_message: asked,
        });
      await finish(f, "Answered in the thread.");
      expect(states(f)).toEqual(["covered", "covered"]);
      expect(retries(f)).toEqual([]);
      expect(f.session.prompts).toHaveLength(2);
      const lines = firstmateLines(f, cardId);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.answersMessage).toBe(asked);
      expect(receipt?.content[0]?.text).toBe(
        `Card shown: ${card.title} (${cardId}). Your line is message ${lines[0]?.id}; it answers the captain's message ${asked} and ends that question.`,
      );

      // A second line naming the answered message is a comment, and says who answered first.
      const again = await toolsOf(f.specs)
        .get("emit_card")
        ?.execute("c2", {
          ...card,
          id: cardId,
          reply: "Again: nothing is blocked.",
          answers_message: asked,
        });
      expect(again?.content[0]?.text).toContain(
        `added as a comment: your first mate had already answered the captain's message ${asked} ("It is more than cosmetic, but nothing is blocked.")`,
      );
    });

    it("counts a line that names no message as the reply too, and says the message is still open", async () => {
      const f = setup({ silent: true });
      const { cardId, asked } = await replyUnderNote(f);
      const receipt = await toolsOf(f.specs)
        .get("emit_card")
        ?.execute("c1", { ...card, id: cardId, reply: "More than cosmetic; nothing is blocked." });
      await finish(f, "Answered in the thread.");
      expect(states(f)).toEqual(["covered", "covered"]);
      expect(retries(f)).toEqual([]);
      expect(f.session.prompts).toHaveLength(2);
      const line = firstmateLines(f, cardId)[0]?.id;
      expect(receipt?.content[0]?.text).toBe(
        `Card shown: ${card.title} (${cardId}). Your line is message ${line}, a comment: it named no message in answers_message, so the captain's message ${asked} is still open.`,
      );
    });

    // INF-6128, the captain's "what happened to this card's body? why was it
    // turned empty?": answering meant sending the card again, and the
    // placeholder body sent beside the answer replaced the card's own.
    it("keeps the card as it was when the answer leaves its body out (INF-6128)", async () => {
      const f = setup({ silent: true });
      const { cardId, asked } = await replyUnderNote(f);
      const shown = f.supervisor.cards.get(cardId);
      const receipt = await toolsOf(f.specs).get("emit_card")?.execute("c1", {
        id: cardId,
        title: card.title,
        reply: "It is more than cosmetic, but nothing is blocked.",
        answers_message: asked,
      });
      await finish(f, "Answered in the thread.");
      const kept = f.supervisor.cards.get(cardId);
      expect([kept?.title, kept?.body, kept?.actions]).toEqual([
        shown?.title,
        shown?.body,
        shown?.actions,
      ]);
      // One line, the answer: no revised line, since nothing on the card changed.
      expect(f.supervisor.cards.thread(cardId).messages.map((line) => line.who)).toEqual([
        "captain",
        "firstmate",
      ]);
      expect(firstmateLines(f, cardId)[0]?.answersMessage).toBe(asked);
      expect(states(f)).toEqual(["covered", "covered"]);
      expect(retries(f)).toEqual([]);
      expect(receipt?.content[0]?.text).toContain(`it answers the captain's message ${asked}`);
      expect(receipt?.content[0]?.text).toContain("The card itself is unchanged");
    });

    it("still records a write that revised the card as the card shown again", async () => {
      const f = setup({ silent: true });
      const { cardId, asked } = await replyUnderNote(f);
      await toolsOf(f.specs)
        .get("emit_card")
        ?.execute("c1", {
          ...card,
          id: cardId,
          body: `${card.body}<p><strong>Cosmetic or legal:</strong> more than cosmetic.</p>`,
          reply: "More than cosmetic; I added it under Cosmetic or legal.",
          answers_message: asked,
        });
      await finish(f, "Answered on the card.");
      expect(states(f)).toEqual(["covered", "covered"]);
      expect(f.tasks.capture.listAsks()[1]?.deliveryFacts.entries.at(-1)).toMatchObject({
        outcome: "action",
        kind: "card",
        ref: cardId,
      });
    });
  });

  it("serves a message sent during the retry as a turn of its own, where its work is not refused", async () => {
    const f = setup({
      silent: true,
      seedTasks: [
        { id: "t1", title: "Add pagination", status: "idle", sessionFile: "/tmp/t1.jsonl" },
      ],
    });
    vi.spyOn(f.supervisor.steer, "steerCrewmate").mockResolvedValue("mid-turn");
    await f.agent.converse("how is pagination going?");
    await finish(f);
    await drained(f.session, 2);
    expect(states(f)).toEqual(["retrying"]);

    // The retry is running and may only show an answer: the new message is not
    // steered into it, so it neither meets the refusals nor is judged by it.
    await f.agent.converse("tell the crew to use cursors");
    expect(f.session.steers).toEqual([]);
    expect(new InboxStore(f.db).allFor(FIRSTMATE_RECIPIENT)).toHaveLength(1);
    await toolsOf(f.specs).get("emote")?.execute("e1", { emote: "nod" });
    await finish(f);
    expect(states(f)).toEqual(["covered", "pending"]);
    // Still open: the turn that serves it attaches it to the work it acts on.
    expect(f.tasks.capture.listAsks().map((ask) => ask.turnState)).toEqual(["closed", "open"]);

    // Its own turn serves it as the captain's words, and the steer lands.
    await drained(f.session, 3);
    expect(f.session.prompts[2]).toContain("[user]\ntell the crew to use cursors");
    const steered = await toolsOf(f.specs)
      .get("steer_crewmate")
      ?.execute("s1", { task_id: "t1", message: "Use cursors.", response_mode: "guidance-only" });
    expect(steered?.content[0]?.text).not.toBe(ANSWER_ONLY_REFUSAL);
    await finish(f);
    expect(states(f)).toEqual(["covered", "covered"]);
    expect(f.tasks.capture.listAsks().at(-1)).toMatchObject({
      turnState: "closed",
      taskId: "t1",
      attachedVia: "tool:steer_crewmate",
    });
  });

  it("checks no operational wake: nothing a person said, so nothing is retried", async () => {
    const f = setup({ silent: true });
    notifyProse(f.db, f.agent, "[fm-op] a schedule fired", "scheduled");
    await drained(f.session, 1);
    await finish(f);
    f.agent.pokeInbox();
    await tick();
    expect(f.session.prompts).toHaveLength(1);
    expect(f.tasks.capture.listAsks()).toEqual([]);
  });
});

// INF-87 / INF-86: the actual INF-64 offer and submitted answer, not a padded plan.
it("recovers the complete accepted plan through the answer-close wake's task read", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/accepted-plan/inf64.json", "utf8"));
  const taskId = "accepted-plan";
  const cardId = `card-${taskId}-split`;
  const card: Card = {
    ...crewCard(cardId, taskId, fixture.title, fixture.body),
    width: "wide",
    actions: fixture.actions,
  };
  const { agent, session, supervisor, specs, tasks, db } = setup({
    seedTasks: [
      {
        id: taskId,
        title: fixture.taskTitle,
        status: "idle",
        outcome: fixture.report,
        shape: { kind: "plan", deliverable: "answer" },
        intent: {
          goal: fixture.taskTitle,
          userWords: fixture.userWords,
          constraints: [{ kind: "read-only" }],
        },
      },
    ],
    seedCards: [card],
  });
  try {
    supervisor.cardActions.act(cardId, "start-next", "chrome", { answers: fixture.answers });
    await tick();
    expect(session.prompts).toHaveLength(1);
    const served = session.prompts[0]!;
    const wake = parseServedInput(served)!.find((part) => part.kind === "wake")!;
    const handoff = JSON.parse(wake.body.replace("[fm-op] ", ""));
    // The receipt alone was insufficient: follow the read it actually supplies.
    expect(handoff.read).toEqual({ tool: "tasks", arguments: { key: tasks.get(taskId)!.key } });
    const query = specs[0]!.tools.find((tool) => tool.name === handoff.read.tool)!;
    const result = await query.run(handoff.read.arguments);
    const reads = [result.text!];
    for (const omitted of parseTasksQueryText(result.text!).omitted) {
      reads.push(
        ...(await pageTaskField(
          (args) => query.run(args),
          handoff.read.arguments.key,
          omitted.field,
        )),
      );
    }
    const row = readPagedTaskQuery(reads)[0]!;
    expect(row.outcome).toBe(fixture.report);
    expect(row.card).toBe(fixture.body);
    expect(row.resolution).toMatchObject({ action: "start-next", answers: fixture.answers });
    expect(taskResolutionBody(row, "offer")).toBe(fixture.body);
    expect(row.reports?.at(-1)?.text).toBe(fixture.report);
    expect(tasks.get(taskId)?.status).toBe("done");
    session.emitTurnEnd("Read the accepted specification.");
    session.resolveNextPrompt();
    await tick();
    // A second click cannot redeliver approval or start a second builder.
    expect(
      supervisor.cardActions.act(cardId, "start-next", "chrome", { answers: fixture.answers }),
    ).toEqual({});
    await tick();
    expect(session.prompts).toHaveLength(1);
  } finally {
    agent.dispose();
    db.close();
  }
});

// INF-4452's case, fixed by INF-4453 from the captain's words: "any turn ending
// reply should count as the line and show up". A question typed while another
// message's plan card was on screen joined that plan's covered chain, so no
// retry came, and the words-only answer reached no screen.
it("shows a words-only answer as the reply line while another message's card is on screen", async () => {
  const f = setup({ silent: true });
  const finish = async (text: string) => {
    f.session.emitTurnEnd(text);
    f.session.resolveNextPrompt();
    await tick();
  };
  await f.agent.converse("design a pull request comment flow");
  await toolsOf(f.specs).get("spawn_crewmate")?.execute("s1", {
    title: "Plan the pull request comment flow",
    goal: "Design the flow",
    user_words: "design a pull request comment flow",
  });
  await vi.waitFor(() => expect(f.crewSpecs).toHaveLength(1));
  await finish("Started the plan.");
  const plan = f.tasks.list().find((task) => task.title === "Plan the pull request comment flow");
  await f.crewSpecs[0]?.callbacks?.onCard?.({
    title: "Plan: a crewmate answers comments on its pull request",
    body: "<p>My plan.</p>",
    answering: true,
    actions: [
      { id: "approve", label: "Approve and build", default: true },
      { id: "defer", label: "Save and defer" },
    ],
  });
  const planCard = f.supervisor.cards.openCardsFor(plan?.id ?? "")[0];
  expect(planCard).toBeDefined();
  await f.agent.converse({
    text: "the batch cut failed - are we fixing it?",
    visibleCardId: planCard?.id ?? "",
  });
  await vi.waitFor(() => expect(f.tasks.capture.listAsks()).toHaveLength(2));
  const answer = "Yes. A crewmate started fixing the failed cut.";
  await finish(answer);
  expect(f.tasks.capture.listAsks().at(-1)?.delivery).toBe("covered");
  expect(f.tasks.capture.lastTurn()).toMatchObject({
    you: "the batch cut failed - are we fixing it?",
    reply: { text: answer, eligibility: "completed" },
  });
  expect(f.events.filter((event) => event.type === "firstmate_reply").at(-1)).toMatchObject({
    text: answer,
  });
});
