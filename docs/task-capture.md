# Task capture: every captain ask lands in a task

Task-system phase P1 (design record `fm3000-task-system-design-s1/report.md`, section 6; captain requirement 1 and decision D1).
P0 made a task a durable record; P1 makes sure nothing the captain says falls outside those records.

## The rule (D1, captain's words)

"if it was an 'answer' to something, that 'something' should have been a task at some point, right? in that case, it should attach to that task. become its own task only when it's truly an independent one-off trivial prompt from the captain that has no connection or consequences to anything else."

So: attach first.
An ask about existing work lands on that work.
A task of its own exists only for a genuinely standalone one-off, and only when the model asserts it.

The first mate's answer is its own card (INF-2714; captain: "you should answer such questions with a neutral card that belongs to first mate, and simply mention the related tasks in the card is enough").
The ask attaches to the answer's own record, which is headed first mate and names the tasks it is about in its words and in `related`; each named task's record gains a `related` link to it.
Only a decision whose buttons act on a task, and a review relay, carry `task_id`.
An answer given while the first mate handles a crewmate's report saves that report as its record's origin, and the message that report's work covers ends on it as it would on a card about that work.

## Mechanics

1. `inf:converse` opens a `captain_asks` row before the first mate turn runs (`TaskService.capture.openAsk`, policy in `src/core/orchestrator/askCapture.ts`).
   The hint is the task the open card points at: an explicit `taskId` on the turn (the P4 record card), else the visible card's `taskId`, else the decision row a visible first mate decision card carries.
2. The first mate's attributing tools accept `ask_id`: a message this turn has read, any open message a finished reply has read (INF-2664), or the empty string for operational work unrelated to a captain message.
   Which message work serves is the first mate's to declare: its description tells it to name the message on work that comes from a click on its card or a report on its work.
   The host checks only typed facts (`AskEnding.nameRefusal`): a message still waiting for its own step is refused as unread, and one that has ended - answered, or its notice closed - is refused with a reason saying it ended.
   Omission uses the latest read message for ordinary direct-request calls.
   A turn itself runs outside every action's selection (`AskCapture.outsideActions`), so a turn woken by work an earlier action started attaches only the messages it reads.
   The host pins that selection for the action's whole asynchronous execution (`withAskAttribution` and `AskCapture.withAsk`), including pictures and complete text files carried in a brief, and attaches only that selected ask with `attached_via = tool:<name>`:
   - `spawn_crewmate` -> the new task; `steer_crewmate`, `interrupt_crewmate`, `settle_task`, `update_task` (including `start_now`) -> the named task.
   - `emit_card` with `task_id` -> that task: a decision a `card_raised` event whose resolution `act()`/`close()` record as `card_resolved`, and a review relay (with `review_task_id`) an `answered` event carrying the body.
     A note with `task_id` and no `review_task_id` is refused (`NOTE_NAMES_TASK_REFUSAL` in `src/core/pi/cardLint.ts`).
   - `emit_card` decision without `task_id` -> a new `decision` task, open, captain gate `ref = card id`, living as long as its choice remains open, including while put away: the captain’s choice closes it `done/answered`, Decline, on the card or in its record, is a choice and closes it `done/answered` too (INF-3108), `close_card` closes it `dropped/superseded`, and the sweep closes one whose card is gone anyway `dropped/superseded`.
     Putting it away retains the open card and its Tasks row; Show the card brings it back (cards/tasks/agents P0; migration 28 closed every park row and logged it in `park_row_backfill`).
   - `emit_card` note without `task_id` files a `question` task born `done/answered` with the body as outcome; the captain's message attaches to it.
     Revising the card in place revises the same row.
   - `related` on either card names the tasks it mentions, by id or key; the host links the card's record to each with a `related` edge (`linkRelated` in `firstmateTools.ts`), so each task's record shows the answer, and refuses an unknown one.
   - The operate tools that still file through `filingOperations` in `firstmateTools.ts` are `schedule_prompt`, `record_knowledge` (`docs/knowledge.md`), `flag_missed_escalation`, `flag_duplicate`, `personalize` and `install_plugin` (`setup_repo` and `unregister_repo` are retired); each files an `operation` task `done/settled` with the tool result as outcome, in the repo's project or Scratch.
3. At turn end (`AskCapture.endTurn`) every open ask the backend read closes, apart from one whose words wait on the lane for a retry.
   One nothing attached goes to the hinted task, else becomes a standalone `question` task in Scratch titled by the ask's first sentence with the turn's closing text as outcome; either way `attached_via = host:fallback`.
   A failed turn, whether its model resolves with a failure or throws, puts the captain's live words and read steers back on the lane with their original ask ids; a cut-off that pauses the seat keeps them due for when it serves again.
   Those messages stay open, and the turn that serves their words again attaches and closes them.
   A message refused before any turn (standing directions unreadable, no session) also waits on that lane with its original ask id.
   Retry makes the saved words due and drains the lane; it never opens a second ask or keeps a separate in-process copy of the message.
   A running turn computes one `TurnEnd` in `runTurn` after the model settles, and `closeTurn` uses that value for the lane, capture, decision, reply, delivery check and recovery rather than reclassifying the mutable turn fields.
   A quit mid-turn is reconciled at the next boot the same way, apart from a message whose parked words are still on the lane (`AnswerDeliveryCheck.waitingOnLane`), which stays open for the turn that serves them.
   Its question task's outcome reads "hit a problem: the app closed before this turn ended".
   A normal quit leaves the turn it cuts as a crash does: the session it lets go of settles that turn, and a turn that settles once the agent is disposed files no message, acknowledges no lane row and judges nothing.
4. Operational `[fm-op]` wakes open no ask and get no fallback.
   Their tool calls still write the task-side records.

Turn scope is the asks whose inputs the backend witnessed with `input_read`: Pi when the user message enters context, Claude at its acknowledgement.
A captain steer opens its ask immediately, but an in-flight action keeps its selected source even when the steer is read.
New actions can name any message this turn has read, or any open one a finished reply has read; unrelated operational actions select no message rather than inheriting the turn's captain words.
An unread ask stays open without a task attachment or reply from the earlier turn, and its parked captain turn supplies its own read witness later.
Only a turn end that names an ask closes it (`AskCapture.endTurn` takes the asks it ends), so nothing else files a message before the turn that reads it.

## Context block and prompt

The `[fm-op]` context carries the started work in `crew`, the unstarted work as a `backlog` count per project, and an `about` line when a hint exists (`docs/orchestrator-contract.md`, "What a context carries").
Unstarted and closed work are not listed here and stay reachable on demand through the `tasks` tool.
`FIRSTMATE_PROMPT_CORE` gained one rule before the six classes: every turn is about a task, find it first, pass its `task_id` to a tool that acts on it, and name it only in words and `related` on an answer.
The C5 dispatch extractor parses the new lines as noise (`tests/extract-dispatch-corpus.test.ts` pins that the fleet parses identically).

## Attribution quality

`attached_via` is the metric: the share of `host:fallback` rows in `captain_asks` says how often the model failed to name the task.
The floor is code; the ceiling is the prompt, the index, the about line and the pin-by-card.

## Answer delivery

A captain message the first mate read and then did nothing visible about is a hidden answer: its closing words are never a card, and the reply line (`docs/composer.md` "The last turn") is one sentence beside the message, not an answer the captain can accept, so the message still needs one.
Each message saved from INF-1610 piece 2 on is followed until a card the captain accepts answers it ("How a message ends" below); a message saved before it keeps the older rule, which only checked that at least one action took effect after the first mate read it.
The host never judges whether an answer is right (`src/core/orchestrator/answerDelivery.ts`, the pure rule and the served words; `askEnding.ts`, how a message stands; `answerDeliveryCheck.ts`, the stateful check; `FirstmateAgent` records the facts).

What the first mate did is recorded where the call succeeds (a typed result, never the words) for every message the running turn had read when it took effect, or, when the call named a message with `ask_id`, for that message alone (`AskCapture.namedAsk`):

- a card shown or revised (`emit_card`, the Settings hand-over card, the app's approval card for a held `use_integration` call), with the card's id;
- the closing words written into the card's replies, for a reply under a first mate card or a done task's kept note (`CardService.recordFirstmateThreadAnswer` returns whether it wrote), with the card's id;
- a line the first mate writes alone in the thread of someone else's open card, such as the crewmate's card the steer-not-answer refusal sends it to (`emit_card` with that card's id and `reply`, a `reply-only` write that is no closed card's clarification), as a reply with the card's id;
- a line the first mate writes in the thread of its own card with a write that leaves the card as it was (`emit_card` with that card's id and `reply`, named or not; `OwnCardWrite` in `cardEmit.ts`), as a reply with the card's id (INF-5202), which includes its answer on a required-action card, where the host keeps the app's own body and controls and writes only the thread line, and a call that leaves `body` out, which writes the line alone (`onReplyAlone` in `firstmateTools.ts`, INF-6128);
- work started, steered, stopped or settled (`spawn_crewmate`, `steer_crewmate` - including a steer the app only saved because the crewmate's account is held, which FI3-592 owns the status of - `interrupt_crewmate`, `settle_task`, a task dropped or started, a link changed);
- a setting or operation recorded (`create_task`, `update_task`, `schedule_prompt`, `remember`, `forget`, a `record_knowledge` write that changed the collection, `personalize`, `install_plugin`, a flag, an applied `app_change`, which `cancel_schedule` is, a `use_integration` change or send that ran);
- a card closed (`close_card`), and a reaction (`emote`).

Never recorded: a refused or thrown call, a lookup (`crew_status`, `tasks`, `locate_project`, `app_state`, `supervision_log`, `knowledge`, `integrations`, a `use_integration` read), a `record_knowledge` call repeating an earlier request, and a graph refusal returned as text.
A refused `emit_card` is saved as an attempt with its typed reason, `crewmate-owns` or `card-refused`, and voids a later reaction.
A message that arrives mid-turn is judged only by actions after it; a steer the session never read goes back on the lane carrying its message id, with none of this turn's facts, and the turn that serves it judges it.

The state is saved on `captain_asks` (migration 62): `delivery` (`pending`, `held`, `covered`, `retrying`, `unresolved`, `legacy`), `delivery_facts` and `notice_card_id`.
Every row from before migration 62 is `legacy` and never checked; every row from before piece 2's migration is unfollowed and keeps the older rule.
`TaskService` is the only writer.

The check runs at the turn's end, after reply capture and the first mate's close-out, so the normal output is saved first:

1. A failed or paused turn judges nothing: its messages are `held`, the failure keeps its card and its honest retry, and the turn that serves the words again judges them (parked rows carry the message id in their `captain-turn` facts).
2. A followed message is `covered` while its own work runs, while a request asked for it waits for its answer ("Waiting for an answer" above), while a card that can answer it is up, or once its answer is accepted; a message with none of these is missing its answer.
3. A missing answer gets one retry: the typed `answer-missing` wake (`docs/inbox.md`), once-name `answer-repair:<askId>`, served alone at the captain thinking level.
   For a reply under the first mate's own card whose card was not refused, the wake names one place, that card's thread, with the card's id and the captain's message number, and says to change the card only when the answer changes what it says (INF-5202): a wake naming two places had one answer written in both.
   During it every tool that starts, steers, stops or closes work or changes a setting answers with a refusal as text (`ANSWER_ONLY_REFUSED_TOOLS`); `emit_card`, `close_card`, `emote`, `link_tasks` and the lookups stay.
4. A retry that still leaves the answer missing raises one task-less host notice, `card-ask-<askId>`: the captain's own words escaped, a typed reason when one is known, **Ask again** (default; host op `ask-again`, a fresh captain turn with the same hint, linked `retryOf`) and **Leave it** (runs nothing).
   Ask again loads and verifies the message's retained pictures before accepting the fresh turn, preserving their names alongside the original words and complete text-file references; a picture-only message is sent too.
   A missing or changed picture refuses the whole resend and explains in Activity that the message needs to be sent again with the picture, rather than sending only its words or remaining pictures.
   Older messages with no retained picture copies keep their text-only retry.
   It never quotes closing words, refusal text or an error, and the host's own record for it files no crewmate task.
   The message ends `unresolved`.
5. A card that can answer the message, offered on the stage after its notice, takes the notice back (`AnswerDeliveryCheck.withdrawNotices`, run whenever a card goes up, is revised or leaves its close-out hold, and on every sweep): the message is `covered` again and waits on that card.
   A crewmate's card still held for its close-out takes nothing back until it reaches the stage, since the captain sees neither until then.
   While its notice is up the first mate may still name the message on work, so that work's card can be the one.
   The message keeps `notice_card_id`, so if it goes unanswered again the same notice comes back, with no second retry.
   An author's explicit withdrawal rechecks coverage through the existing answer-delivery sweep, without accepting the answer on the captain's behalf.
   Putting a decision aside keeps its answering offer available and does not withdraw it.
   Every message has its own one retry and its own notice: a newer message about the same work never shares an older message's.
   A notice the captain answered, with Ask again or Leave it, is gone, and its message stays ended.

Boot reconciles from the saved facts: a message stranded mid-turn is judged as uncovered, a retrying message whose wake was served is judged now, and a message whose parked words are still on the lane waits for them; the once-name and the fixed card id rule out a second retry or notice.
Operational wakes and card clicks open no message and are never checked.
The local model's own no-output check is separate: it looks only at the messages its own turn read.
The replay and the developer evaluations wire the agent with `answerDelivery: "observe"`, which judges nothing; the replay's observational `asks_without_action` row reads the recording (`docs/replay-harness.md`).

## How a message ends

INF-1610, from the captain's words: "i like the idea that each captain ask has a "thread" and perhaps each "thread" has to have a card as its conclusion".
A message may run any number of tasks and cards; the plans, questions and consents along the way stay as they are, and the message ends on a card the captain accepts as its answer (`src/core/orchestrator/askEnding.ts`).
The host reads only typed facts: the saved message, the task graph, the cards and the captain's own response, never the words of a card or a message.

What piece 2's migration adds to `captain_asks`: `followed` (every message saved from then on), `continues`, `answer_card_id` with `accepted_at`, `answered_at` and `crewmate_asked_at`.
`continues` is never written; only the one-time step in **The update** below reads it.

Each message is its own thread: the message and the work it caused (INF-6115).
One module owns the walk (`src/core/tasks/askThreads.ts`, `AskThreads`): the thread a message ends on, the messages above a task (`asksAbove`), the first mate's open list, the notices and where a closed task's outcome goes all read it, and the You asked line reads the same origin (`threadOrigin` in `taskOrigin.ts`).

- **Its work.**
  The tasks the message attached to, and every task that carries their work on: parts, builds on a plan (`basis`), retries, branches taken from them, replacements (`replaced-by`), a stronger model (`escalated_to`) and the tasks a merge filed or set to start from its story's after-merge steps (the host's own `discovered-from` link, `TaskGraph.continuations`, which counts as the task's filing for the `before` cutoff, for the message's own work and for `asksAbove`; a crewmate's other follow-ups stay outside it), walked by `TaskService.capture.askCoverage`, which reads each message's tasks once.
  Work handed over - a replacement, a retry, a branch, a stronger model - always stays in the thread.
  A part, a build on a plan and a task a merge filed belong to their nearest origin (**A task's own origin** below): the walk takes one in only when it has no origin of its own, or when its origin continues this thread.
  Attribution and escalation edges are read as typed metadata, without decoding each task's entire timeline.
  Coverage reads only task identity, title, status, close reason and creation/start times from the task row, and child identities in their existing order, without composing specifications, shapes, execution or delivery payloads.
  A read of every open thread shares these task fields and successor edges across its messages; these facts are discarded after the synchronous read and invalidated by task writes, including rollback.
  A cold card dismissal or choice uses the same narrow readers without needing a board read to prime them.
  A terminal answer-task choice still reads its own task's shape for eligibility; it does not compose the other covered tasks.
  The message's own work is the part of it the first mate's tools acted on for the message (`acted` on the same read), and anything filed or started after it; a task the message only pointed at, such as the card it was typed under, which nobody acted on since, is not working on it.
- **Tied, not its work.**
  Two actions tie a message to a task without making the task its work (`tie` on the `ask` event, `TaskService.capture.attachAsk`): a `steer_crewmate` that asks for an answer, which is its default, and a change the first mate tried there before it takes effect (`update_task`, `settle_task`, `interrupt_crewmate`, `link_tasks`, `flag_missed_escalation`, `flag_duplicate`).
  Every task change the first mate tries is tied first, whatever path it takes, and only the outcome it records as taken effect makes the task the message's work (`settle_task`'s `ok`, including a close as done, each `update_task` path's own effect, a link that changed and a flag that went through); a refused one leaves the tie, so the task's own answering card can still answer the message, and the message no longer waits for the task to close.
  A steer that only passes guidance on (`guidance-only`) makes the task its work as before, unless the message is already tied to that task: a steer there, such as "carry on" after an answer, leaves the tie as it is.
  A tied task is about the message, so its cards count as above, but the work after it is not walked (`asksAbove` with ties left out).
  The first mate's reads of open messages (`open_asks`, `open_work`) list a tied task while the message waits on it for an answer (`AskEnding.listedWork`).
- **Waiting for an answer.**
  Each response request the first mate asks for a message is saved on that message's `ask` event (`TaskService.capture.tieRequest`, from `CrewSteer`).
  The message waits on it while the request is open and its task is open, and while its answer is still waiting unread on the first mate's lane, whether or not its task has closed (`InboxStore.requestOpen`).
  A crewmate that answers not yet, or never answers, keeps it waiting until the task closes, so the message never waits longer than its task; a request the first mate cancels waits no longer.
  An answer a message still waits on is served in a turn of its own, as the one retry is, never batched with other wakes and never carried on a captain's turn (`AnswerDeliveryCheck.waitingOn`), so nothing else in that turn counts toward the message.
  A captain's message sent while that turn runs waits on the lane for a turn of its own, as during the retry (`AnswerDeliveryCheck.servedAlone`), and parked captain words are served before a waiting answer.
  The turn that reads the answer (a `requested-response` wake) reads the message too (`AnswerDeliveryCheck.adopt`): a follow-up asked or work started in it stays the message's, a card shown in it is shown for the message, and the message is judged when that turn ends, so an answer written only as closing words gets the one retry below.
  Several messages asked of one long task each wait on their own requests and end on their own answers.
- **A task's own origin.**
  A task's origin is the message that filed or started it, an automation run, the card whose choice filed it, or the task whose report passed the captain's words on (`threadOrigin`).
  A message or an automation starts a thread of its own: a thread that reaches such a task only through a part, a plan or a merge stops there, so work another message started on top of this one's never ends this message.
  A click on a card and words a report passed on continue the thread of the card's task, or the reporting task: the task joins the thread once that task is in it, and a click on a card the record never raised on a task continues none.
  The host's own delivery child, a review or a repair assessment, has no origin: it is always part of the work it checks, whatever turn filed it.
  Starting queued work (`update_task` `start_now`) is never an origin: the task stays in the thread that filed it.
  The You asked line reads the same origin, so the line and the thread agree, apart from the report and follow-up routes, which the line follows and a thread never does.
- **Its own thread.**
  Two messages about the same work each keep their own thread and each end on their own; they can end on the same card.
  An answer once recorded never moves: work linked afterwards belongs to the newer message.
- **The update.**
  The update to one thread per message keeps each message open at it from losing work its merged thread held.
  The migration lists each followed, unended message with the message whose thread it was in (`ask_thread_carries`); one step at the next start (`AskEnding.carryThreads`, before the boot's answer check) reads that merged thread once as it stood and attaches the message to its still-running work as `host:carried`, or marks an attachment it already had there, such as the host's fallback, as carried (`threadCarried` on its `ask` event), ties it to the tasks of the cards that thread waited on or was answered from, carries its response requests, the other messages' card, reply and reaction facts and its spent crewmate ask, and marks it carried in the same write.
  A carried attachment counts as acted on and is never quoted as where work came from; the step raises no retry, notice or crewmate ask, and runs once.
- **A card that can answer it.**
  A card about its work that its author marked `answering`, a merge card's merge, the app's merge line on a story note, or a card the first mate showed for the message; it counts only when it was shown since the message.
- **Accepted.**
  The captain's choice on a decision about its work that is not still asking (`asking`, `continues`), or Done on a note that can answer it, with no reply of theirs waiting under it (`CardService` reports each response through `captainResponded`).
  Putting a taskless note or an already-completed task's note away as read also acknowledges the message when the note qualifies as its answer; this ends no work.
  Reading an active task's note accepts nothing: a saved answer still waits for explicit Done.
  An explicitly answering crewmate card on an active answer-deliverable task also counts when its admitted choice qualifies to close that task, even with `asking` set.
  Ask acceptance and task completion for that admitted answer-task choice share `taskResultResponse`; continuing cards, held writes, browser handoffs and pending replies do not qualify.
  The author judges whether the requested result is supplied, including a ready plan that offers further work, rather than a prerequisite question or consent.
  The host checks attribution, the admitted choice and offer freshness, never card meaning or button wording.
  CardService saves choice acceptance through TaskService in the resolution transaction before task closure, preserving the original offer and submitted answers.
  The normal `answer_task_closed` handoff remains pending until the first mate recovers and handles the choice; acceptance alone neither authorizes nor proves later work.
  The captain's response is accepted per message: for each message whose work or ties include the card's task, or for which the first mate showed the card.
  A choice counts whether it lands before or after the reply that showed the card finishes: `captainResponded` also reads the threads whose reply is still running.
  A decision closed without a choice answers nothing; a reply, a question or a new message keeps the message open.
  One reply is the exception (INF-2845, the captain's direction A): a line its crewmate signs off.
  When the captain's line under a crewmate's answering card says, in any words, that they need nothing more from it, the crewmate answers it with `reply`, naming the message in `answers_message` and setting `signs_off` (`CardThreads.signOff`).
  The crewmate judges the words; the host checks only typed facts (`signOffRefusal`): its own open answering card of an active answer task, the message the card waits on, no merge, write or browser hand-off for the captain, not `asking`, not `continues` and not an interim line, refusing anything else with its reason and writing nothing.
  An accepted mark resolves the card as read (its past card names the crewmate, never a click of the captain's; a card the captain had seen stays on their screen ended, with one Close, as `close_card` keeps one), accepts it as the answer through `captainResponded` (`signed-off`), and closes the answer task `done/answered` through `taskResultResponse`, the same ending as Done.
  Work the choice started keeps the message working until it ends; then the accepted card still answers it.
  The step that handles the click attaches that work to the message only when the first mate names the message on it (`ask_id`).
  Closing the first mate's own card is never an acceptance; when `close_card` closes the card a message a step has read was waiting on, and leaves it with no answering card up and no work running, its answer says so, as a fact and never a refusal.
  The first mate's answer in a card's thread is accepted: its closing words under the card the message was typed under, or its line alone on someone else's open card, even one shown before the message.
  So is a reaction to a message that asks nothing, the first mate's own judgment.
- **Seen.**
  Once all of a message's work has ended, an answering crewmate card the captain saw since the message is its answer (`AskEnding.seenAnswer`), from the card's `seen` observations (`CardStore.seenCards`).
  Only a sighting of the card's current version counts - its current offer, and its current released update once there is one - so a revision the captain never saw is still asked for.
  A merge offer never counts, and neither does a lifecycle its own author withdrew.
  An answering card still up keeps the message waiting on it as before; a seen answer counts only when none is up.
- **Answered.**
  An accepted answer becomes `answered_at` once the first mate has nothing queued that could start more work for it.

Who writes a missing answer, in the captain's order:

An answer the captain saw (**Seen** above) skips all three: the finished report stands, the first mate is not asked and no notice goes up.

1. The crewmate whose task is the message's last running work: when it reports finished with no answer accepted, up or seen, its report is refused once (`CREWMATE_ANSWER_ASK`, the same words whatever the messages), and every message that needs its card is marked asked in that one refusal (`crewmate_asked_at`); its second finished report stands.
2. The first mate, through the retry above, once all of the message's work has ended with no answer: the wake names the work that ended (`workEnded`), and the first mate shows the answer or links the task that took the work over with `link_tasks`.
3. The app's one notice.

At most one closing note: when work closes without the captain's click, `TaskClosing` asks `AskEnding.closingPlace` where its outcome goes.
A card speaks only for its own task: the close line or merge line is written only on a card of the closed task, and no card the captain already chose on or closed is ever put back on the stack (INF-6115, the captain's pick "Its own note").

- The task's own card shaped as an answer that is still up is revised first, even when a later message asked about it or the message's answer is another card.
- The accepted or recorded answer is revised when it is a card of the closed task and still up; one the captain already chose on stays down, and a drop they did not make is told on the task's own closing note instead, while a note they closed tells nothing more (INF-2718).
- Other running work of the message, or a handover, puts up nothing.
- Work another task carries on closes done with no outcome of its own, so it puts up nothing; when the task carrying it closed first, that task's held-back outcome is placed once (`docs/task-record.md`, "Work carried on by another task").
- An answering card of the closed task that is up is revised.
- When the message's answer, accepted or up, is a card of other work, that card keeps its words: a drop, merge or release with the first mate's sentence goes up as the task's own closing note, not marked as the answer, when no card of the task is on the stack; a finish puts up nothing.
- An answer the captain saw puts up nothing.
- Otherwise the app's one closing note goes up, marked as the answer.
- Work no message of the captain's covers, such as work the fleet started, puts up a note only when it merged or released and nothing of the task is on the stack.

Open-thread reads list every followed, unended message in one query (`TaskService.capture.openThreadAsks`), each message decoded once; each call reads current storage, with no retained thread cache.
The first mate's turn facts list the open messages (`open_asks`), one per row: each one's id, when it was sent, how it stands and the work that still runs for it, newest first and bounded like the task list, with a notice still up counted as unanswered; `open_work` lists every one, one per row, with its words.
They never repeat the captain's words, which are in its conversation.

## Pictures stay with the task

A captain message's pictures, however they reached the input (pasted, dropped or chosen), are kept as the message's own copies when it is accepted (`docs/composer.md`, "Files"), and its ask row keeps their references in `images_json` (id, name, type, size, SHA-256 and the copy's path under `<userData>/attachments/`, never the bytes).
A row an older build saved holds the types alone and has no copies to name.
Whatever task the message attaches to, by a tool or by the fallback, holds its pictures: `TaskService.capture.pictures` reads them from every `ask` event on the task, in the order the messages attached, so a message about two tasks lands on both.
The `tasks` query by key lists them by name and copy (`pictures`).

The crewmate that takes the task is briefed with them (`CrewBrief.briefPictures` in `crewBrief.ts`): the task's own pictures, then those of the work its brief carries forward - its basis, the task it was discovered or escalated from, the attempt it replaces - each picture once by digest.
Routing reads the same sources first, so that crewmate runs on a model that reads pictures (`docs/routing.md`, "Pictures").
As many as one message may carry (`TURN_IMAGES_MAX`) ride the first turn as images; the brief's pictures section, right under the captain's words, names every copy by its path in the task’s `temp/handover/` folder on the computer running it, says how many did not fit, and counts a copy that is gone instead of sending its name as if it were there.
When a copy is gone, the section tells the crewmate to say so plainly and ask the captain to send it again, rather than answer without it.
The brief's inbox row keeps the riding copies (`attachments-kept`), so a retried or re-presented first turn carries them again (`docs/inbox.md`, "Pictures ride the row by reference").
`spawn_crewmate` hands the action's selected message's pictures to the brief directly, because the brief goes out before the message attaches to the new task; a planned task reads them from its record whenever it starts, after a relaunch too.
A spawn on a project that runs on Automatic starts through the queued start at once, so that start carries the message's pictures and files too (`dispatchQueuedTask`'s `message`, INF-2422); one that waits for room reads them from its record when it starts.
Supported text attachments also keep typed references to their complete overflow copies (name, path, size and digest) on the ask, alongside the picture references in `images_json`.
A task reads those references from its asks and the same source tasks at dispatch; an immediate spawn also receives the selected ask’s references before capture attaches it.
Both pictures and complete text files go through the existing verified hand-over writer here or the source-file order there, with private file permissions and digest-qualified names.
A remote computer that cannot receive handed files refuses the start with an update request; a missing or changed text copy refuses the start rather than supplying only its preview.
No helper task is filed, and unsupported files that the composer enters as ordinary path text are not attachments and are not copied.
A `steer_crewmate` carries the action's selected message's pictures with the first mate's guidance, kept on its row the same way; a copy that is gone leaves the guidance to go as words, since they are the first mate's own.
A reply under a crewmate's card already goes straight to that crewmate with its copies (`docs/card-threads.md`), and a reply under a first mate card is a captain message like any other.

## What capture does not do

No card renders a task id.
An open first mate decision card does not light the rail: the strip counts working, idle and queued crew, never decisions.

## Notes moved from AGENTS.md

Moved verbatim from `AGENTS.md` on 2026-09-24; `docs/README.md` lists this page.

- Capture (task-system P1, design section 6, captain decision D1 - "attach first"; `docs/task-capture.md`): every `inf:converse` opens a `captain_asks` row BEFORE the turn runs (`src/core/orchestrator/askCapture.ts` over `TaskService.capture.openAsk`); the first mate's tools select the read message they address through `ask_id` (empty for unrelated operational work) and attach it to the task they act on (`attached_via = tool:<name>`), and `AskCapture.endTurn` files whatever is still loose - on the hinted task (the open card's task, or the turn's `taskId`), else as a standalone `question` task in Scratch (`host:fallback`; the share of these is the attribution metric).
  `emit_card` refuses `task_id` on a note unless it relays a review (INF-2714: an answer is the first mate's own and names its tasks in `related`), a task-less decision files an open `decision` task keyed by its card id (a choice, Decline included, or close_card closes it; putting it away does not), and the operate tools file `operation` tasks through one helper.
  `[fm-op]` wakes open no ask.
  Never add a second ask writer, and never let a first mate card with `task_id` count as the crewmate's card (`cardEmitter` in `crewSupervisor.ts` reads the emitter off the id: `card-fm-` vs `card-<taskId>-`).

Catalog changes, including project settings, file their operation once in the core dispatcher.
`appActionRecorded` attaches the action's selected ask to that operation; `filingOperations` does not wrap them.
Theme, panel arrangement and panel instructions (a `direction` scoped to the personal workspace) use `app_change`; removal stays in `personalize`.
