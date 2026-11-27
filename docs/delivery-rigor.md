# Delivery rigor

The user-facing care labels are Quick (stored `quick`), Default (stored `standard`), and Careful (stored `reviewed`).
These names do not alter the gates, review, fallback, or persisted values.

This document is the care model's one home: the three care names the host records, how a task's care is derived, what the evidence contract is, how a review runs, and what the host holds as a record.
What each care asks of a crewmate is the Rigor levels runbook's (`resources/runbooks/care`), served by the care's name and held by nothing of the host's (INF-1876, the captain: "the host only knows the three names as typed fact - a metadata. how to execute each rigor level becomes something the runbooks cover").

Rigor derives from the user's words and the repository's configured rigor alone (captain rulings, 2026-09-19): standard is every project's standing value, never the intelligence tier or an escalation.
Careful's guidance orders the review before the pull request, on the builder's branch; the host holds neither the push nor the merge on it.
A verdict-less reviewer report records nothing.
Info-only findings derive a pass.
Declined findings converge through the review history the app writes into every reviewer turn ("The review history").
Validation is agent-driven and evidence-first; no configured command is mandated in the pipeline.
The reviewer is a crewmate, never an external pipeline.
Autonomy on is consent to merge at any risk: there is no risk-high captain card.
Every new hold, cap, constant or served sentence answers which of the four kinds in `docs/principles.md` ("Build the agent's reach, never its verdicts", 2026-10-19) it is - a typed fact the host holds, consent for an effect, a physical limit of the process, or otherwise a verdict that goes to the agent - and since that is a judgment, its author and its reviewer ask it, never a lint.
A served sentence that restates what the host enforces is its refusal's text instead, a case the agent gets right from the fact is left out, and a compensation for today's model is kept and marked as a ceiling (`docs/orchestrator-contract.md`, "The fixed-context budget").

## Why instruction first

Every crewmate's coding session receives the working copy's own instruction file and skills (FI3-789), so the prompt tells the crewmate to read the instructions before anything else and follow the project's gate.
`projectResources.ts` reads the first available root instruction file (`AGENTS.md`, otherwise `CLAUDE.md`) and discovers skills directly under `.claude/skills` and `.agents/skills`, from the working copy alone.
Pi serves the instruction file through its resource loader's `agentsFiles` and exposes the project skills through its skill loader; Claude stages the project skills as a local plugin and appends the project instructions to its prompt (`piResourceLoader.ts`, `claudeProjectResources.ts`, `claude/claudeSessionOptions.ts`).
These are project resources, not the person's machine-wide instructions, skills, or agent configuration; Claude's empty `settingSources` does not prevent the app from supplying the working copy's own resources.
The prompt's core carries the consent rule and the facts every crewmate needs; the Rigor levels runbook's sections follow by the care's name - its Default section when care is standard or reviewed, its Careful section beside that when care is reviewed, and its Quick sentence when care is quick (`resources/runbooks/care/runbook.json`, `docs/runbooks.md`).
A task whose typed delivery and care say a section does not apply is not served that section, on either model backend and on a task that runs on another computer.
Unknown facts are served the Default section and the delivery judgment.
The resource readers supply the project-specific instructions and skills.

## When a goal's premise is untrue

The captain's words define the authorized change, not a mistaken premise in the goal (INF-1366, INF-1266's phone-check budget reversal).
The shared crewmate prompt (`buildCrewmateSystemPrompt`) makes this an exception to its ordinary instruction to make a reasonable call without asking.
A crewmate builds only what those words ask for and leaves everything else as it is.
Before any extra work the goal would require, it asks on a card, naming the mismatch, the extra change and any earlier captain choice it would reverse.
Independent work the words clearly authorize can continue while that choice waits; when no authorized edit is clear, the crewmate asks before editing.
A completion report or merge offer cannot replace that earlier question.
This is the agent's scope judgment and the captain's consent, not a host-side interpretation of natural language or a new hold.

## What delivery takes, confirmed first

Every crewmate, at every care and on every backend, confirms before its first edit that it can deliver and prove its work (FI3-356, from FI3-343's delivery audit).
A builder in that audit, its implementation done, still waited for a reader of its evidence to be built.
So the crewmate prompt (`buildCrewmateSystemPrompt`) asks the crewmate to name what delivery and evidence will take: pushing, opening the pull request and reading its checks when the work ships through one, and whatever its evidence needs, such as a reader of workflow logs or artifacts, a test runner or launcher, an account or a device.
It confirms each with the cheapest call that changes nothing (the tool is in its session, `git push --dry-run` or a read where the project lives answers, the runner reports its version), closes the gaps it can itself, and plans only evidence it can gather.
A gap only someone else can close surfaces before the build, through the paths a handoff blocker already takes: a missing tool or a defect in the way is a filing (`blocks_me` when delivery cannot finish without it), and a sign-in or access only the captain can give is a blocker in its report.
That report ends the turn and says what the crewmate can build meanwhile, so it is sorted now rather than at handoff (`docs/report-sort.md`): a filing wakes the first mate on any backend, and a blocker alone reaches it as any report does, at once where the host sees all of the backend's work and on the idle ladder's clock where it cannot.
The recorded brief says what was confirmed.
Which tools a task needs is a judgment about the work, so it lives in the instructions; the host adds no check of its own (`AGENTS.md`, "Put ambiguous judgments in agent instructions").
The host's own dispatch-time sign-in hold still runs first (`docs/forge.md`, "Dispatch-time GitHub auth refusal").

## The default rule on tests

Every crewmate on a plan, reproduce, implement, fix or chore task on a project, at every care, delivery and backend, is served one passage on how tests are written and repaired (`CREWMATE_TEST_DEFAULT` in `src/core/pi/piResources.ts`, from FI3-1756's approved plan).
It names six words a test meets - intent, fixture, failure, layer, owner and gate - so a test is written only for a stated intent: the user's ask, a standing ruling, or a bug being fixed.
Its failure word names the three tests that cannot fail: one whose expected value the code under test computes, one that asserts what a stand-in was set to return, and one that makes no assertion; its owner word has the owning test state its fact, and a pin elsewhere is read from that source, which the failure word allows.
It gives four rules for an existing test: a failure is a bug report first; a test the product outgrew on purpose is re-typed only for a stated intent and otherwise deleted; an intermittent failure is fixed at its owner with no retry or sleep; and a repaired test meets the same six words as a new one.
It adds the captain's direction on a change's own tests (INF-840): a test whose own code the change adds or edits - a journey file, a device test function, a unit test file, never only a helper, scenario or runner it uses - is never a suspected flake.
Before its merge card, the crewmate runs each test its change adds or edits once against code the test should reject - without the change, or with the guarded behavior broken - sees it fail, restores the code and reports the break and the failure.
It then runs only those tests on the computer it works on, ten times in a row for unit tests and end-to-end tests and three times on each device for device tests, with no retries, and reports the passes.
The host adds no pull request check that repeats them; a project's own rule may move them to one, as this project's `ci.yml` does for unit test files (`docs/testing.md`, "This project's rulings on tests").
The passage is the one copy of its words.
It is a default, not a mandate: its last sentence lets the project's own rule on tests win, read from the instructions the crewmate already treats as its gate ("Why instruction first").
A test file, helper or stand-in a change edits is brought to the six words in the same pull request; a bad pattern is removed by deriving a pin from its source or moving a stand-in to its owner, never deleting on sight.
A pattern seen elsewhere is named in the report for the first mate to file, not fixed in passing and never copied; deleting a test that was there before the change still asks for the captain's approval.
Every independent review on a project is served Testing rules' review section instead (`docs/runbooks.md`): a test the change adds or edits, or any test in a test file it edits, that cannot fail is a warning to fix: one the change itself adds is cut to what it proves when it cannot be made to fail, auto-fix, and only a fix that deletes or weakens a test that was there before the change is ask-user; reading a value from the test that owns it is not a finding; the same fault in a test file the change does not edit gets a follow-up; and the project's own rule on tests wins there too.
This project adds six rulings, including ask-first weakening, skipping or deletion of a test that was there before the change, while a test the change itself adds is its builder's and reviewer's to settle (`docs/testing.md`, "This project's rulings on tests").
A new end-to-end journey follows the passage like any other test, with no ask, and its review still names the promised result, the data, the completion signal, the platform prerequisites and the shared resources (FI3-1732).
The passage decides the rest.
The brief's `tests-required` constraint asks for tests of the task's stated intent, in the passage's sense (`src/core/orchestrator/intentBrief.ts`).

## The three care names

| Care | Stored | What its guidance asks | Default for |
|---|---|---|---|
| **Quick** | `quick` | green checks; the five headings are welcome, nothing more is required (`resources/runbooks/care/quick.json`) | only when asked for: the captain's words (`rigor_ask`) or a repository configured `quick` |
| **Default** | `standard` | the pre-PR procedure, evidence-first validation, the evidence contract and the test-quality rule (`resources/runbooks/care/default.json`) | every project, explicitly set as its standing value |
| **Careful** | `reviewed` | Default, then the careful-change skill: an independent review of the committed code, then live proof run once and read by a reviewer, before the push, the pull request and the merge card, with routine findings, proof and pass handoffs delivered by the host (`resources/runbooks/care/careful.json` and its `skills/careful-change`) | only when asked for: the captain's words (`rigor_ask`) or a repository configured `reviewed` |

The middle care is **Default** (stored `standard`), not "checked" (captain's call): it is what a careful engineer does by default, not an extra step layered on.
The host knows the three names as a typed fact on the record: it selects guidance by them (`Runbooks.crewSections`), shows them on the fact strip, in `crew_status` and in the brief's one care line (`renderRigorSection`), and holds nothing by them - no review hold, no live-proof hold, no refusal of an early card (INF-1876).
Two host rules still read the name as a fact: a Quick task is exempt from the merge card's picture check, and the delivery judgment is served only to pull request delivery (direct-pr or queue-pr).
The review and live proof Careful's guidance orders are recorded when they happen, and the host reads those records only to attest a pull request (`docs/forge.md`, "No-mistakes' attestation") and to show them beside the checks.

### What Default asks

The Default section (`resources/runbooks/care/default.json`) is the procedure's one text, and `src/core/pi/piResources.crewmate.test.ts` pins where it is served.
Before opening or updating a pull request it has the crewmate bring its branch up to date and resolve overlap itself, read the whole diff once against the user's words and its self-brief and revert or name every change the words did not ask for, update every document the change makes stale, and validate the change itself, evidence first: the intent demonstrated end to end as an end user would experience it, product-level artifacts for each concrete thing an end user would do, pictures and demo recordings of each visible view before the first edit and after the last, kept in the task's evidence folder and never committed, the smallest set of existing tests that would catch a break in what an end user experiences, and a test written or improved under the default rule on tests when none produces evidence.
It never combines its commits itself, since a pull request is squashed when it merges: a `git reset --soft` onto a default branch another working copy has moved keeps the older files, and merging it undoes the newer work (PR #913); the prompt's core says so at every care.
A picture the repository's own instructions keep with the change - this project's release-note hero pair (`docs/release-notes.md` "Hero pictures") - is part of the change, not evidence, and is committed where they say.
Bulk working material goes in the task's temporary folder beside the evidence folder, which the app removes when the task closes; evidence keeps its week (`docs/task-retention.md`).
The section then has the crewmate report under the evidence contract below.
Every new branch-based change and its merge card use one saved story, including plain Git and local-only delivery; legacy PRs retain the five-heading PR description.
Public GitHub and GitLab upload selected, inspected, publishable media; other description hosts publish text while keeping media on the merge card and local paths out of the description.
Version-2 saved stories use Why, What changed, Before and after, and Checked, with commands and unfinished work folded (`docs/forge.md`, "Saved change stories").
Both surfaces use the same title, named by the naming runbook; code versions stay in typed data, never rendered prose, by author instruction rather than a refusal check.
Each changed view pairs its Before and After pictures; recordings stack, new views carry the New tag, and empty sections disappear.
Version-1 stories keep their existing drawing; the report, legacy descriptions and free-form completion outline stay unchanged.
The crewmate is told that once, on `emit_card`'s `presentation` field (`tests/crewmate-fixed-context.test.ts`).
Failed checks first require reading the failed step and logs and declaring an explicit diagnosis at the head/check via `check_change`.
Own regressions are repaired on this task: the crewmate declares a stable repair id, source head, new target head/check and fix evidence, and later settles that repair with a `declaration` naming it, its version and its outcome.
The host records each diagnosis, repair and settlement and counts none of them.
When a crewmate stops repairing and reports a blocker (no merge card) is the delivery judgment's guidance (`resources/runbooks/delivery`), never a host count.
The first mate takes a blocker report through stall recovery, then coordinates the next owner or asks the captain for one decision on its task, carrying the other ways its wake names.

An evidenced suspected flake may reserve a failed-job rerun with `check_change`'s `rerun`, before running it without code changes.
The host records the reservation with the failed run it found and refuses no later one: a second reservation, before or after a restart, replaces the standing one while the declaration history keeps both, and no count or allowance stands behind either.
How many reruns a failure is worth is the agents' judgment from their guidance, never a host refusal.
A suspected flake is only ever a test whose own code the change does not add or edit: `check_change` takes `changedTest`, the crewmate's typed answer, which its description says is false for a suspected flake (INF-840); the host records the answer and refuses nothing on it.
A failure in the change's own test is its own regression, or baseline-blocked with untouched-main evidence for a test it edits.
An operation, which ships no change and has no pull request, holds the same `check_change` for a workflow run it read: it records the diagnosis, reserves a rerun and declares a flake there, and refuses a pull request reading or a repair (`declareRunCheck`, INF-2146).
The diagnosis's description asks a baseline failure for untouched-main reproduction evidence and a separately owned task, which the diagnosis names as its `dependencyTask`; the host refuses only a task outside the project or one that would close a wait loop.
The first mate coordinates its dependency.
The host relays each finished run of the default branch's checks to the waiting crewmate, once per commit, and that task's close, and the crewmate judges whether the wait is cleared (FI3-250, INF-833 Fix 4).
The declaration's answer says where that task stands (FI3-671): nobody has started it, so the crewmate leads its report with its key and that report wakes the first mate on any backend (`docs/report-sort.md`, row 2a), which starts it, steers the crewmate to fold the fix into its own branch when that is smaller, or asks the captain in one card; it is underway or queued, so the crewmate reports the wait once and ends its turn, and nothing nudges it until a default-branch run or that task's close wakes it to judge the wait; it is done, so the crewmate brings its change up to date.
A blocking follow-up nobody started wakes the first mate the same way.
Before accepting a diagnosis that names a dependency task, the host checks the same live-wait graph used by ordinary blocker insertion (`docs/task-graph.md`, "Combining repairs after a circular-wait refusal").
A loop refusal names the complete task-key path and changes no diagnosis, link or repair record.
The crewmate reports it to the first mate, which chooses one existing owner, combines attributed patches, removes only obsolete waits, verifies every failed check, and reconciles after merge.
Historical diagnoses and closed dependencies do not create mixed-wait edges; valid waits still derive from durable delivery records across restart and resume when the dependency closes.
A wait instruction alone proves no external ownership.
Diagnosis, waiting and reruns earn no captain card.
The delivery judgment gives an unknown cause one bounded investigation, then a report for the first mate to coordinate if it is still unknown, rather than repeated readings or reruns; the host refuses no second unknown diagnosis.
Only a blocker the first mate cannot resolve, or a real decision, access or information only the captain can supply, warrants a question.
Every current check must still pass before completion.

Validation at every care may use whatever it truly needs, preferring disposable data/accounts, isolated app homes, local instances or workspace-local tools when they prove the same boundary.
Before sensitive or costly access, the crewmate asks on a card naming the resource, check and possible cost or changes: sign-ins/accounts, allowance or money, real data/production, keychain/signing or credential access, and anything others see.
The crewmate asks each consent for the rest of the task and says so in the ask: one approval covers what it named, as the ask described it, for every later check, run or version of the task (INF-1540); a sign-in is used through its owning app or program.
Another sign-in or unrelated sensitive or costly resource needs consent of its own.
Secrets stay off command lines and out of printed output.
Asking for resource consent needs no reviewer clearance, and does not replace separate persistent-effect approval, browser handoff or merge consent.
When a check needs something the builder cannot run itself, it reports `needs_firstmate` for coordination.
Name attempted workarounds if still blocked.
A supplied verification plan is a proposal, not proof or the user's intent: assess its expected outcomes and artifacts independently against the project gate.
During fixes, avoid unrequested rewrites of `AGENTS.md`/`CLAUDE.md`, while still reviewing explicit edits, resolving conflicts and updating instructions made stale by the change.

The test-quality rule travels with the Default section: a test whose only evidence is that source text contains or omits a string proves nothing; exercise an interface and assert behavior.
The prompt pins in `piResources.test.ts`, `piResources.firstmate.test.ts` and `piResources.crewmate.test.ts` are the one sanctioned exception, because the prompt IS the interface being shipped.

## How a task's care is derived

The host derives it for each current reading (`effectiveTaskPolicies` over `rigorFor` in `src/shared/rigor.ts`, pure and fixture-tested like `tierFor`), from facts it holds.
The order is fixed and short (captain rulings, 2026-09-19); the first rule that applies wins.

0. **A gate at all.**
   Rigor exists only where a CHANGE lands through a gate (`RigorInput.gated`, Tasks A and B of the crew-posture rationalization, 2026-09-20).
   Three tasks are ungated: one whose deliverable is an ANSWER ships nothing at all (`WorkShape.deliverable`, below), one on the personal workspace builds in place - there is no branch to review and no pull request to hold - and a review task reads a change rather than shipping one.
   For each, `rigorFor` answers no care at all rather than a quick one, the brief's care line reads none, and nothing is stamped on the shape.
1. **The captain's ask.**
   The user said in words how careful to be, and the first mate passed it as `rigor_ask` at creation or `rigor` on `update_task` for open work; a live edit supersedes the original ask, while `project` explicitly resets it.
2. **The repository's own rigor.**
   `repos.rigor` (migration 36), set by talking - `app_change project-settings` with `changes.rigor: quick|standard|reviewed`, on the user's words alone, and `default` to hand the repository back to this derivation.
   Null is "derive".
3. **Standard.**
   Every repository's default, whatever its posture.

Nothing else moves the rigor: not the intelligence tier - the tier routes models, never ceremony - and not an escalation, because rejecting a result is a signal to try a stronger model, not to add review rounds.

### The deliverable axis (Task B)

Rule 0's first case is its own fact on the record.
`WorkShape.deliverable` is `answer`, `change` or `operation`, derived by the host at the mint from the first mate’s typed constraints (`deliverableFor` in `src/core/orchestrator/intentBrief.ts`): `read-only` declares an answer and `operation` declares an effect.
The sequences document marks every plan, retrieval, research and reproduce step read-only, and the constraint’s description says a task without read-only or operation ships a change.
Folder work is an operation; read-only beside operation or folder work is refused before starting.
Everything else is a change; no feature-specific kind overrides the typed deliverable.
For work the first mate commissioned, the classifier's kind only routes, never decides the deliverable (INF-990 friction 7: a build whose goal asked for a preview first was classified a plan, so its brief said answer only and the captain's choice on the preview closed it).
A plan is its own answer step since contract v4.6 (`docs/sequences.md`), so the retired `plan-first` constraint - which a stored intent may still name - changes nothing here.
No agent judges it, the same way none judges the model tier or the care.

An operation is not classified: R12 requests medium after a named model, premium, escalation and a program’s declared intelligence.
Its brief says the effect is the deliverable: make it, check it took, commit and push nothing, open no pull request, and stop and report if code must change.
The captain’s words authorize only the goal’s named effects; keychain, signing, outside writes, payments and browser handoffs retain their existing consent requirements.
Its own project’s forge writes go at once, while outside-project writes still ask, and it has no prepare/open/check change tools.
An operation has no delivery, autonomy or care policy, and no merge card; its factual outcome note stays until the captain closes it.
So a merge is never an operation's effect, past the branch rules included: the first mate is told so where it declares the constraint, and the crewmate is told never to merge from its shell (`docs/forge.md`, "A merge past the branch rules").
Once its crewmate is idle and has reported, the first mate declares verification with `settle_task` done, why `finished`, and `evidence`.
The existing settle owner records `done/finished` and the evidence, checks outstanding work and decisions, and retires any scratch working copy through its existing owner; the project folder stays untouched.
Merge and land are refused; dismissal of a note is never proof of the effect.

An answer task is told so, in the one place the visual-density audit measured as the channel every model family obeys - the brief.
It gets no `Delivery:` line, a care line reading none, and `renderAnswerShapeSection` says the rest as facts about the task: its card is the deliverable, its worktree is a laboratory that is discarded when the task closes, and it commits nothing, pushes nothing, and opens no pull request.
The host does not only ask: `settle_task merge-pr` and `land` are refused on it, a card carrying a settle effect is refused at the card boundary the way the personal workspace's is, and its worktree is removed whatever it holds with nothing saved first (every other closed task's unlanded work is saved on a hidden kept ref before its tree goes) - the record's own `deliverable` is what says the worktree was scratch.
The kinds nest under it (`KINDS_BY_DELIVERABLE`, INF-1430): the classifier is told the deliverable the host derived and offered only that branch's kinds - `retrieval`, `research`, `plan` and `reproduce` for an answer, `implement`, `fix` and `chore` for a change - so an answer is never sorted into a change kind or the reverse.
A crewmate's follow-up has no intent, so nobody declared it: for it alone the classifier is offered every kind and its kind decides, an answer-branch kind being an answer.
It is held to the same brief, though it has no intent to render from: its brief was written at filing, with the `Delivery:` line last, so when its kind makes it an answer the host drops that line (`withoutDeliveryLine`) and appends the same answer-shape section.
Its tools follow the same stamped deliverable, so an answer is never told to open a pull request it has no `open_change` to open (FI3-598).
A follow-up the classifier calls a change gets that line written again when it starts, from its own record's posture - the project's, or an ask made of the follow-up itself - which is the one its merge takes (`withDeliveryLine`, FI3-733).
An ask made of the origin never reaches it, and a posture the project changed while it waited does.

The captain's choice on that card is the CLOSE (captain F2 A): it closes the row `done/answered`, because the deliverable was produced and the captain answered it.
A card its crewmate declared `continues`, such as a consent before it uses something sensitive, is not that card, and its choice goes back to the crewmate (INF-1226); nor is a card handing the captain the task's browser, whose click hands it over while the task goes on (INF-1322).
The captain's close control never ends work or selects a choice: putting a card aside or reading a marked saved answer sends no author wake.
An ordinary note read acknowledges its message and reaches its crewmate through `card-closed`; a duplicate closure also reaches the author without being an ordinary-read acknowledgement.
After an ordinary read, the crewmate reports `finished` if nothing remains, and the first mate can close the answer row with `settle_task` done, why `answered`.
A marked saved answer instead waits for explicit Done, which receipts it and closes an answer deliverable `done/answered` without a `card-closed` wake.
The findings travel to a builder through `basis`: when `spawn_crewmate` names a verified basis, `renderBasisSection` carries that task's captain words and its report into the builder's brief, and names the file its card body is saved to whole (`docs/sequences.md`); any agent can read them back with the `tasks` query by key.

One bound sits under the order, mechanical rather than judged: Careful's guidance ships a pull request after its review passes, so Careful asked for on a local-only posture ships Default instead, the most care that posture can take, with the reason saying why.

The dispatch answer is stamped on `WorkShape.rigor` as provenance, while `effectiveTaskPolicies` supplies current care to `crew_status`, crew context, completion facts, briefs and guards.
The task detail keeps dispatch `rigor` and publishes current `policies` separately; Details displays the latter.
The brief names current care through `renderRigorSection` - the name and a pointer to the care guidance served with the instructions, nothing of what it asks - and a later policy notice carries the sections the new facts select that the brief did not (`POLICY_GUIDANCE_HEADING`, `noticeWakes.ts`), superseding the brief without changing its scope.
A queued row is told the rigor of the moment it starts.
The kind classifier never sees the section - it runs on the intent before the mint - and a row dispatched before phase 2 reads as `quick`, which is what the replay gate and the corpus export treat a recorded spawn as.

The first mate never judges a rigor, the same way it never judges a reasoning class (routing S2): its prompt says the host derives it, and its care fields relay the captain's words.

## Changing policy on open work

`update_task` is the conversation-first editing surface described in `docs/task-record.md`, “Live task policies”.
An explicit self-merging request (including a reset to an autonomous project) releases only a routine merge card and its matching captain wait; unrelated decisions, dependencies, explicit withdrawals and safety holds remain.
The app then authorizes the open merge card itself, and the merge rereads current checks, destination, review, consent and close requirements; permission is not evidence that they passed.
A task that merges on its own shows the same merge card as any other (INF-2744): at green its crewmate emits it, and the app authorizes the merge from the card as it goes up (`CrewmateCards.mergeFromCard`, through `SettleService.mergeRefusal`, the one reader of autonomy), with no first mate turn; Activity and the record say so.
The card then carries no buttons, only the merging line, so it reads as the task's story note: it carries the risk chart and the merge card's fact strip, and the host keeps it off the stack until the merge has a result, then shows it once, already saying it merged, with the first mate's sentence (`docs/card-authoring.md`, "Work that closed without the captain's click").
The note stays until the captain closes it, and a merge that leaves nothing of the task on their stack puts up the first mate's sentence instead (`docs/card-authoring.md`, "Work that closed without the captain's click").
When a hold stops the app's authorization, the card keeps its buttons and waits for the captain.
A merge the app sends at once because it keeps no approval for it - a local merge, or a plain Git host - gives the card its buttons back when it is refused, so the merge is never left with no one.
When a standing direction's exception covers a merge, the crewmate declares `asksFirst` on its merge effect, citing the direction, and the card waits for the captain's click.
The first mate applies the standing directions that bear on a task, merging included, when the captain starts it (`docs/inbox.md`, "A captain's Start is a wake").
“Asks first” cancels unsent merges and kept approvals even when the displayed value already says Asks first, while a later explicit self-merging request remains possible.
A delivery edit also invalidates approval for the previous destination, but changing delivery or care alone grants no merge permission.
Each accepted edit advances a revision; asynchronous merge attempts compare it at the final boundary immediately before sending the merge, not just before reading checks.
GitHub unattended merges also check draft, conflicts, head and review readiness at that boundary.
Once a merge has been sent it cannot be recalled; the first mate says so, and any retry reads the new policy.
Changing delivery keeps commits, published work and the original pull request linked; switching back reuses that identity when possible and never silently closes it or falls back on missing access.
Higher care holds nothing by itself: the notice on the task's lane carries the care sections the new facts select that the crewmate's instructions did not - the Careful section on a rise to Careful - and the crewmate follows them before its next push or card.
A rise in care, however the captain asked for it, takes that task's merge card down, so no Merge offered at the old care is left to fail; the crewmate brings a new one after the work the new care needs.
Lower care removes nothing from the record: review history, failed checks, declarations and the host's holds stay.
Queued or waiting work does not start merely because a policy changed, and active crews receive the notice through the existing inbox rather than restarting.
`tests/e2e/task-policies.spec.ts` exercises keyboard edits, sources, Activity, reset/restart and an already-ready result under passing and failed checks; the supervisor and workspace tests cover the asynchronous cancellation boundaries.

### Raising care from a merge card

Every merge card on a Quick or Default pull request the captain merges personally carries a Review carefully button between Discard and Merge, keyed ⌘2 (INF-562; Merge keeps ⌘1 and Discard moves to ⌘3).
Local merges, work that merges on its own, Careful tasks, requests to merge another pull request and the first mate's own cards get no button.
The host adds it in `CrewmateCards.withCompletionActions` as an action with `care: reviewed` and no effect; the card lint does not count it among the author's two or three choices.
The captain's click closes the card and mints no merge approval.
It sets care to Careful through `TaskService.updateFields` with the captain as the actor and "from the merge card" in Activity and the feed, then the choice reaches the crewmate like any choice on its card, which starts it with the care notice ahead of it.
A body's script cannot press it.
The pull request stays as it is: nothing is pushed, closed or marked as a draft, and its checks reading stays.
The click also starts the review of the version the card offered (INF-1875): the app commissions it on the commit the task's working copy has checked out (`checkedOutHead`) as soon as the care is on the record, a child of the task like any review, and notes it on the task's timeline.
A task whose record holds no words of the captain's, such as a filed follow-up, is reviewed against its goal, and the brief says the goal stands in for those words (INF-4072).
A part of the click the app cannot carry out - the care it sets, or the review it starts - it names in the feed and tells the first mate at once in a `card-action-undone` wake with the reason, and the first mate carries it out with its own tools or tells the captain what stops it.
The care notice carries the Careful section, which has the crewmate commit, report without pushing and wait for that review.
The reviewer's brief adds the merge card the captain read, saved whole beside the builder's source cards (quoted in the brief when the work runs on another computer), with its risk chart as lines.
A pass on the version already pushed brings a new merge card once its checks read passed, with no push; after fixes the crewmate pushes once to the same pull request after the pass.
The new card reads Care Careful and the review's verdict, with no Review carefully button.
Review and repair stopping decisions belong to agent guidance, and asking the first mate in words still works.

## The evidence contract

A Default or Careful report, and a legacy PR body, carry five headings, in this order:

| Heading | What it holds |
|---|---|
| **Intent** | what the user asked for, in one or two sentences, against the self-brief |
| **What changed** | the change itself, at the level a reviewer reads first |
| **Verified** | the exact commands and tests run and the evidence that the intent is met, one or more product-level artifacts for each concrete thing an end user would do - pictures of any visible surface among them (a demo recording where the change is behavior), kept in the task's evidence folder, never committed, and shown as `<img>` (or `figure[data-inf-demo]`) absolute paths in the merge card, which the host verifies and serves - and what each artifact shows, or what stopped you gathering it |
| **Risk** | low, medium or high, with one sentence |
| **Not done** | what the words asked for that this change leaves out, and why |

The report and the PR body are where the contract lives.
The merge card is not a third copy of it (captain lock 3, 2026-09-19).
Contract v4.37 gives finished code-work merge cards and notes a loose outline: **Why**, **What changed**, **Before**, **After**, in order, with no body lead; the title alone carries the answer.
Before is one sentence on how it stood, then a picture of each changed view as it stood, taken before the first edit; each result picture and the verification sit in After, as many pictures as the change needs (contract v4.69).
A demo recording stands in for a view's pictures in either section, its poster the picture the check counts.
The Default section's self-brief lists the views and states a person will see; a Quick task is exempt from the picture check, one of the two host rules that read the care's name.
What is left closes after After when decision-relevant, otherwise in details, not a fifth heading.
The crewmate's standing instructions carry one sentence; its card boundary refuses a declared settle-merge decision missing an ordered heading, but notes follow the instruction alone.
Answer cards, previews included, keep their own shape.
The report's five headings and rigor numbers are unchanged.
The host appends the CI state, a review, the captain's override, the project, the PR link, the change's lines and a rigor level other than Default itself (`SettleFacts.strip` in `settleCardFacts.ts`, contract v2.0 ruling D4; a status line since INF-3709's plan), so the body never repeats those either.

`tests/e2e/rigor-standard.spec.ts` is the binding test: a crewmate commissioned through the real app on a real Pi session is served the prompt for its own delivery and care, which names its care, and reports under the five headings, and a merge card with the four-heading outline publishes through the real emit -> lint -> CI gate -> frame path with the host's own buttons on it; a missing heading is refused and the corrected card publishes, with no answer line before Why.

PR-8 stands (board decision): a project that runs no checks (a PR that reports zero checks where none are coming) is green when the report's Verified names the local gate that ran on the final commit; checks that have not started yet read pending (`docs/forge.md`).

## The review

A review is an independent read of a change at a version, commissioned on request at any care (INF-1875).
Careful's guidance (`resources/runbooks/care/careful.json` and its careful-change skill) orders it BEFORE the pull request (the no-mistakes ordering, captain-approved 2026-09-19), so fix rounds are local commits rather than push + CI cycles; the host holds neither the push nor the merge on it (INF-1876): a review task is its builder's child and carries no `blocks` edge onto it.
The host owns the derivation, the reviewer's brief, the typed record and direct delivery of routine review handoffs through the durable task lanes.
The first mate reads the recorded summary when it next acts and is woken for decisions, blocked reviews and failed handoffs, not routine relays.
Since FI3-566 (cut C) those instructions sit where each step arises: the first mate's core says when to commission a review and to carry the captain's latest decision into every fix and review steer, each review wake names the step it asks for, and the builder's direct findings handoff carries how to fix a finding (`REVIEW_FIX_RULES` in `REVIEW_HANDOFF_NEXT`, `reportWakes.ts`).

1. **A Careful builder finishes locally and emits no card.**
   The Careful section has it commit its work on its branch, report under the five headings with `needs_firstmate` asking for the review, and neither push, open a PR nor emit a merge card until the host delivers the reviewed handoff; the host refuses none of those by the care's name, so an early card is the first mate's to question, not the host's to refuse (`resources/runbooks/care/guide.md`).
   Its report reaches the first mate through the whose-turn sort like any builder's; only a review task's own events skip the sort (`routeCrewEvent`).
2. **A review is started** - by the first mate's `spawn_crewmate` with `review_of` naming the builder and the user's original words (no new tool, the count stays 24), or by the app itself when the captain presses Review carefully on a merge card ("Raising care from a merge card").
   A review is an operation on a change at a version (INF-1875): any crewmate work with commits on its branch can be reviewed on request, at any care, before or after its pull request; the care names are metadata the record carries, and what each asks for is runbook guidance.
   The host refuses it as text only when the builder is not crewmate work or is closed, has no commits on its branch (`WorkspaceService.branchHead`), or already has a review open; a builder that has not reported yet is reviewed against its branch, and its brief says the report is still to come.
   A builder with a pull request already on record is still reviewed at its committed version, not that pull request's recorded head.
   That version is the commit the builder's working copy has checked out (`checkedOutHead`), as a story's is: the task's branch, or another branch the crewmate committed on and pushed from, so a task's branch left behind is never the version reviewed or proved.
3. **The host briefs the reviewer** (`renderReviewBrief`, byte-stable like the escalation brief, its instruction text aligned to the no-mistakes review prompt): the fixed review instruction around the captain's verbatim words, the builder's branch at the assigned commit (worktrees share refs, so the diff of that commit against the default branch is the change, never the live branch), and the builder's last report and the complete changed-file checklist at that head.
   The reviewer runs on its builder's recorded computer, in a separate working copy at the assigned commit, with the evidence folder on that computer (`docs/helper.md`, "Independent reviews").
   Its provider is selected from that computer's own subscriptions, preferring a different provider than the builder's when one can serve.
   When no model is named for the review, the decision model first reads the standing directions that apply to the builder's project (INF-5021, the `reviewer` use in `docs/decision-models.md`).
   The app works out the usual pick by its ordinary routing and lists the models placed at a level that the builder's computer serves, each marked with whether it can take this review now by the ladder's own checks.
   The question answers usual, or names a model a direction calls for, and, when that model cannot review now, whether a direction says to wait for it.
   A named model is kept on the review's shape as `review_model`, apart from `override_model_id`: routing tries it after any saved pins and ahead of the ladder, only while it passes the ladder's checks (`docs/routing.md`), and otherwise the usual pick reviews and the review's timeline says why.
   A wait starts nothing: the first mate's ask is refused as text naming the model and why it cannot review, so the first mate asks the captain, and a model named with `override_model_id` starts it.
   A repair's assessment takes only a named model, never a wait, since waiting would end the merge approval it serves.
   The builder's computer supplies the committed head, the checklist and the change reading; an unavailable computer refuses the review rather than falling back to a stale home branch.
   A computer on an older contract supplies no reading, so a pass from it does not carry.
   Before a re-review turn, the host refreshes the clean review copy to the new assigned commit; edits or unexpected commits refuse the refresh without losing work.
   A reviewer whose first turn ended with no report, such as after a provider failure, keeps its first commit only while that is still the builder's newest; its next turn takes a newer one like any re-review turn (INF-3141).
   The answer to a review ask names the commit assigned, and says when the builder holds edits not yet committed, which the review does not see; Review carefully's timeline line names the commit too, and the merge card's version when the two differ.
   Guidance during a review waits for the next turn, and the verdict records the commit assigned to that turn, not a later builder head.
   The reviewer checks every listed path, does not call an omitted path clean, and recomputes the checklist at a new head.
   A review commissioned after an earlier review of the same builder passed at another version names that passed version and reads only what changed since it, not the whole change again (INF-401, the captain's direction for an unavoidable update).
   Its brief gives the reviewer `git range-diff` between the two versions, keeps the complete checklist to compare path by path, and says a path whose change reads the same was reviewed at the pass.
   The review task records that version as `passedHead`, so each later turn of that review, a re-review after findings included, keeps the same scope.
   A review commissioned at the very version an earlier review passed is the proof read (INF-2672): its brief says the code passed there and asks it to read only the live proof.
   The builder's committed head must be available on the builder's computer before the reviewer can start at that commit.
   A bounded follow-up coverage turn is not implied.
   It judges over-engineering by the code the change leaves, never the size of the diff (INF-2645): anything left that the user's goal could do without - unneeded code, state or options, a second copy of something the project has, code left without a use, a new subsystem existing primitives could support, a test likely to fail on intentional changes rather than regressions, or a symptom patch where removing code would fix the root cause - is a warning that blocks, and a small tidy-up stays info.
   It also judges whether the documents are current: a document the change makes stale and leaves unchanged is a finding, and its pass stands as the change's documentation check, which no-mistakes' attestation counts (`docs/forge.md`, "No-mistakes' attestation").
   It is read-only by instruction - change nothing, commit nothing, push nothing, run no tests: the builder's Verified section and the builder's evidence folder (named in the brief) are the test record; evidence is never committed.
   Its shape is `kind: review`, established by the host (`kind_source: host:review`, never the classifier) and routed like research (high); its title is `Review: <builder title>`, its parent the BUILDER itself - the one stored review-to-builder join since the `review_of` fold (captain-approved 2026-09-19; `review_of` survives only as the spawn ask) - and no `blocks` edge onto the builder (INF-1876): the host holds nothing on a review, and whether a merge waits for the verdict is the care runbook's guidance.
   The `host:*` kind_source makes the review delivery machinery: it never counts in the children-open close gate, its parent is fixed, and every builder close in any direction retires a live review with it (superseded, silent), so a reviewer never outlives its builder.
4. **The verdict is the typed review record** (INF-1875).
   The reviewer reports it on `report.validation` with kind `review` at the head and evidence revision its turn was assigned (`validationReviewSchema`): `code` clear, findings or blocked; `findings`, one typed entry each - id, severity (error / warning / info), file and line, one sentence of text, and an action: auto-fix, ask-user or no-op (`reviewFindingSchema`); and `risk` low, medium or high with one sentence why.
   The host reads nothing off the report's words: the code judgment is the verdict (`REVIEW_VERDICT_OF_CODE` - clear is a pass), the record refuses one that contradicts itself (clear code beside a finding that blocks, or code findings none of which block; `recordValidation`), and info findings ride a clear review because info never blocks (`findingsBlock` - blocking is an error or warning severity, or an ask-user action at any severity).
   A report with no typed review record, or one naming another head than the assigned commit, records nothing - a reviewer's acknowledgment ("standing by") is not a verdict, and the review stays open, so it still fails toward the human.
   The refusal names the assigned commit and evidence revision, the ones the record named, and the builder's newest commit.
   The code judgment is the verdict as typed at every care; the reviewer's live-proof judgment is its own typed record beside it ("Careful live validation" below), which Careful's guidance has the reviewer give and the first mate read, and which the host reads only to attest the pull request.
   The verdict, the head read, the change reading taken at assignment and the risk land on the builder's delivery facts (`reviewVerdict`, `reviewSha`, `reviewChange`, `reviewRisk`, `reviewRiskNote`, `reviewedAt`) as a `review` timeline event whose data also names the review task; which review a builder's verdict came from is otherwise read off the parent edge (`TaskService.graph.verdictReviewOf`).
   The typed findings stay on the live-validation record, the findings wake carries them one line each, and the change record's version carries them with the verdict (`ChangeReview.findings`, `docs/task-record.md`).
   A pass carries to a later version whose stored change reading matches the review's reading, for the attestation and the record; no merge is held on it (INF-1876).
   The approved head's reading is stored when the captain approves, and each repair's reading is stored when that repair is recorded, in the read that already brought the branch home.
   Opening the pull request still carries a version that has no stored reading yet, by reading it once and storing that reading, and a quiet timeline line records that carry.
   The kept merge reads no review; its story refresh compares the stored readings for the attestation and does not read the branch again.
   A carry recorded before the reading was stored with the version still covers its head.
   The reading keeps one neighboring line and drops where the lines sit.
   A main edit right next to the change asks for a fresh review, because that neighbor is part of the reading.
   A line moved beside the same neighbors still counts as the same change, and the pass carries.
   A move that changes those neighbors asks for a fresh review, and so does any edited line, added change, dropped line, spacing change, or a version the app cannot read.
   A main edit farther from the change does not.
   The checks still run on every version and must pass before a merge.
   A pass recorded before the reading was stored carries the same way when its reviewed commit is still on this Mac and the task is not placed.
   A takeover carries an earlier task's pass when its committed version is the very commit that review read (INF-6536 finding 3; `carryTakenOverReview`, `takeoverCarry.ts`).
   The earlier tasks are the work it was handed, read the way a yes carries ("What the captain already allowed" below, `sameWorkLineage`).
   Only the identical commit carries: a takeover one commit past the reviewed version carries nothing and needs its own review, as any new commit does.
   The carry is written once, while the takeover has no verdict of its own, at the merge card's walk or when its crewmate records proof; a later verdict of its own replaces it.
   The proof accepted with that pass carries too while the takeover has recorded no scenarios of its own: its kept files are copied into the takeover's own proof folder under its name, so every gate reads them as its own, and proof whose files cannot be read whole stays behind with the reason in the note's data.
   A crewmate who records proof at a commit whose proof just carried is told nothing was recorded and to show the merge card.
   The carried pass names the task that earned it (`reviewFrom`): a quiet timeline note on the takeover, `passed in <key>` in Details and in the merge card's Review state, and the line show_merge_card's answer adds.
5. **Findings and blocked leave the reviewer idle and steerable.**
   The host sends auto-fix findings verbatim to the builder through its durable lane, with the fixer preamble (`REVIEW_FIX_RULES`): double-check legitimacy, identify sibling sites of a broken invariant, repair the defect class with one small correction rather than new machinery, retrace normal callers, and verify resolution without reverting intentional changes.
   No brief carries the preamble, so a builder whose care rose after its brief was written reads it the same way (INF-1876).
   The captain's latest decision governs subsequent fixes and reviews: a declined finding is not implemented and a chosen fix is not undone merely because earlier wording differed.
   Genuinely new problems remain reviewable.
   Info findings never block and need no steer.
   A finding reaches the captain only when it is a real tradeoff (INF-5510's plan, piece 1): before choosing a noticeable finding's action, the reviewer lists its ways forward, the code as built among them, and weighs them under the few headings where they differ.
   A heading names a quality of the whole product the captain wants more of, named positively so high is better (save cost, never cost), in one or two words that would fit an unrelated change (security, not approval guarantee), as the shared card rules' tradeoff table defines it for every author; its suggestions are not a limit, and the app checks no heading.
   A small fix that wins or ties under every heading, or a finding a project rule, the approved plan or the user's words answer for that very case, is auto-fix, even against a choice the builder gave a reason for: a builder's easier, cleaner or shorter way never reopens the plan (INF-6608's plan, part 1, under the captain's careful review).
   Behavior the approved plan did not ask to change stays as it is on the default branch, so restoring it is such a fix; a general goal or plan read onto a case it did not name does not settle a finding, and a finding minor either way is an info note.
   Every way giving something up, a winning fix of medium size or larger, undoing a choice the user made, changing what gets built beyond this change, an approval only the captain can give (one yes or no) and doubt make it ask-user, and so does an approved plan that cannot be built as written, would break a project rule or a standing direction, would lose saved data or weaken security, contradicts another part of itself, or rests on a fact that changed since its approval.
   An ask-user finding on work built from an approved plan quotes the plan's nearest sentence and says why it does not settle the case, or which fact means the plan must change.
   A project rule makes a finding ask-user only when its sentence, read on the page that owns it, names that very case, and the finding quotes the sentence: a rule shortened where it is repeated, such as a test rule summarized without its "there before the change", does not reach a case its own page leaves to the crew.
   A noticeable finding settled this way says Settled without asking in its text and the reviewer's report, with what was found, what was done and why the captain was not asked; the builder lists them on its merge card as story checked facts, one line of a few words each for what was found, what was done and why, in words for a stranger (`SETTLED_FINDINGS_RULES`), where a reply that overturns one is the captain's decision.
   A settled fix carries warning or error, since the host sends a builder no info finding; info is only for a settled note.
   A builder that disputes a settled fix leaves it unmade and says why: a report with a new commit returns to the reviewer, which makes it an ask-user finding, and one with no new commit or after the review passed names the dispute in `needs_firstmate` for the first mate to take on.
   An ask-user finding goes back to the reviewer that read the change, with the card rules (`REVIEW_CARD_RULES`), which reach only a reviewer whose verdict holds such a finding (INF-4338, direction D).
   The reviewer settles a finding the user's own words, the approved plan or the review history already answer, and a finding whose recommended way is the plan or the user's words as written: it records that finding again as auto-fix at the same head, which sends it to the builder as a fix, and raises no card that turn, since the next handoff carries only the findings still left for the captain.
   It puts the rest to the captain on ONE decision card per round; a card from an earlier round that is still open is revised in place, keeping each question still waiting on it.
   Before asking a question an earlier round's card asked, the reviewer reads that card, since the round's decisions date from the round's start: an answer the captain gave settles the question, and the reviewer raises no card for it (`docs/card-threads.md`, "A question already answered").
   The host labels a decision card from an independent review Review finding and draws the builder's change on it, with none of its checks or the review's own state, which stay on the merge card; the first mate raises no card for an ask-user finding and is not told about one, and a builder's report wake names its reviewer's open Review finding cards so the first mate asks nobody for another.
   The card opens with a short paragraph reminding the captain what the builder's task set out to do, from the user's words and the builder's goal, which the host names in the reviewer's card handoff since the review brief carries the goal only when no user words were recorded; one sentence then says how many choices wait and whether people using the project will notice.
   For each finding the card asks the question in plain words, with no file or code name, beside a plain seriousness tag: Serious for an error, Worth fixing for a warning, Minor otherwise.
   Under it, one figure shows what happens now on one concrete example from the change, with at most one sentence beside it, then one option per way in a dozen words at most with its rough size after the words.
   One option is what the code does now, marked `data-inf-current`, which the app tags As built (the reviewer adds Leave it as built when no listed way is), and the Recommended mark goes on the reviewer's pick.
   Under the options a table marked `data-inf-tradeoff`, required on a review question with the as-built row while the shared card rules say how to write it, lays out the tradeoff: one row per option, as built included, naming its option's value, one column per heading where the options differ, and in each cell a level, high, medium or low, where high is always better, the most of what a positively named heading names, with a few words for this change.
   The app draws it as a chart each option is picked on, a scatter for two headings and a small radar on each option for more, with the table folded under it (`docs/card-authoring.md`, "The tradeoff chart").
   One line names the headings on which the options are level, and one names the pick, what it gives up and its reason; a question only the captain can approve is one yes or no with no table, and a builder's view, only when the builder gave one, takes its own line under the builder's name.
   A fold titled Settled without asking you, with its count, lists the round's noticeable findings the reviewer settled itself.
   A fold titled The finding as recorded holds the seriousness, file, reviewed version and the finding's text from the review record.
   The captain's choice goes straight to the builder with the review history, with no first mate turn (`CardActions.act`), and a reply under the card goes to the reviewer, which answers from the change it read.
   The card outlives its review's passing close; a choice made after that close tells the builder to commit a chosen change, push it and follow its delivery for a new merge card and a new review, since no reviewer is left to read it.
   Once the review has closed, only the captain ends the card.
   The card stays up when a later round passes and the review closes, and holds the builder's task open past its merge, as any open question on it does (`reviewCard.ts`).
   Supervision reads it as the builder's card too (INF-5004): while it is up, the builder waits on the captain, as it would on a decision card of its own, so nothing nudges it, wakes the first mate about it or counts it standing still in the backlog.
   Only the report's sort reads whether the builder declared that wait: a report that declares it sorts as the captain's turn, and a plain report is still re-read by the first mate while the review's last verdict was findings or blocked.
   The app defines no size scale and checks no size: sizes and reasons ride the finding's text.
   The builder's next report names its open review, that review's last verdict and the head it read (`review` on the `report` wake).
   When that report brings a new committed head, evidence revision or validation state, or follows the captain's answer on the reviewer's own card since its verdict, the host returns it directly to the same reviewer, once per assignment.
   An unchanged report starts no review turn and takes the ordinary report sort, so a dispute or prose blocker still reaches an owner; the review history carries the captain's declined findings without anyone retyping them.
   An idle reader retained for proof does not count as moving work for the builder, so a stopped builder still receives the ordinary missing-witness nudge.
   A reviewer report with no review record while its own card is up records nothing.
   It stays silent when it declares nothing for the first mate and its assignment is still the head, evidence revision and state revision its last verdict read: that is the card's turn or an answer under it.
   A declared needs_firstmate reaches the first mate as the ordinary report wake, and a turn assigned newer facts that ends with no verdict wakes it as an unstated review.
   A blocked review, a no-op finding that blocks and a failed handoff wake the first mate rather than losing the report.
6. **A pass goes directly to the builder.**
   A pass with no accepted proof yet keeps the reviewer idle for the proof read; it records the code pass so the next turn reads only proof or the repair's difference.
   Once the proof is accepted, or no scenarios were declared, the host closes the review task (done / finished) and sends the builder its delivery handoff.
   The one feed line is the builder's own event - `review passed at <sha>, risk <level>: <note> - <builder title>` - and the review's close is silent.
   The direct handoff tells the builder to follow its brief's delivery and show its completion card; local-only work needs no push or PR, and merge consent is unchanged.
   When the builder planned live-validation scenarios, the host reads whether its proof is accepted at the passed head (`acceptedValidation`); while the proof is not accepted, its direct handoff asks for proof instead: the builder proves once and reports the run without pushing, the host returns the new proof to the same reviewer, a repair gets a review of its own difference, and proof that only runs on a pushed branch finishes beside the checks.
   The merge card carries the review beside CI in the host's facts strip (a Review state: `passed`, with `Passed <sha> · risk <level>` and the note on rest; `open` while one is live).
   A pass that does not cover the version on offer (`reviewCoversHead`: the exact version, or a stored change reading that matches) reads `passed at an earlier version <sha>` with a warning dot in Details (the task view's `reviewCovers`), and `passed at an earlier version` on the merge card, which keeps both versions for rest; `crew_status` says `review passed at <sha> only, an earlier version than <sha> on offer`, and the builder's report wake names both versions (`earlierPass`), so an earlier review never reads as covering later work (INF-3141).

**Risk never holds (Q4).**
The reviewer's risk is recorded on the builder and rendered beside CI; autonomy on is consent to merge at any risk, so a green reviewed PR on an autonomy-on repository merges like any other, and the first mate settles after a pass without reading it.

### The review history

The app writes what was decided so far on a reviewed change into every reviewer turn's brief and into the first mate's findings wake (INF-993, the captain's direction B: "the app writes the history only"; `src/core/orchestrator/reviewHistory.ts`).
It reads only typed facts the record already keeps, oldest first: each review round the host recorded, with its verdict, its head and the typed findings the reviewer reported for it, one line each (a record written before reviews were typed keeps its rounds with no findings); each answer the captain chose on a card on the builder's task, with the card's answers word for word; each answer the captain chose on a card of the task the builder is built on (its verified basis, which may be a plan or a reproduction), named as that task's; each reply the captain typed under a crewmate's card on that task; and each live-validation request with its answer and, for an approved gap, whether that approval covers the latest run.
The section is metadata, after no-mistakes' round history and settled questions: a later entry supersedes an earlier one, a declined finding is not re-reported unless the code introduces a new, materially different problem, and a settled question is not asked again in any wording.
The host never decides which answer settles which finding; the reviewer and the first mate judge that.
Because the brief is written again on every reviewer turn, the history survives the reviewer's conversation being summarized, and the first mate never retypes declined findings into a re-review steer.
It adds no size limit.
A reviewer's brief also names that task in a short section of its own - its key, title, saved card file, and the captain's choice and answers on it - and leaves whether it is a plan the captain approved to the reviewer, while its reports stay with it, for the reviewer to read with `tasks` when a finding turns on them (`renderReviewedPlanSection`).

Where the review stands is on every surface the fleet already has: `crew_status` and the context block's crew lines carry `rigor` and the review state (`review open (<key>)`, `review: findings`, `review passed at <sha>`, and `reviews <key>` on the reviewer's own row), the task detail carries `rigor` and the review facts in `delivery`, and Details shows current Care separately from Delivery, with the verdict and its risk beside CI.
Nothing new reaches a user surface: no card kind, no setting, no control.

`tests/e2e/rigor-reviewed.spec.ts` is the binding test: through the real app on real Pi sessions with a local GitHub stand-in the app reads through its own sign-in (`tests/e2e/githubStub.ts`), a direct-pr task derived Careful reports green with no card, the first mate checks CI and spawns `review_of`, the host delivers auto-fix findings and the first mate asks one decision card, the task waits on nothing while the review is open, the re-review's pass is one feed line that releases the builder's close, and the merge card renders the review beside CI and merges.
`reviews.test.ts` and `reviews.version.test.ts` cover the verdicts, the version a review reads, the review record across care edits, the sort and the facts each review wake carries; `wakes.test.ts` the next steps each review wake words; `tests/firstmate-fixed-context.test.ts` that every step the core gave up is still served where it arises; `rigor.test.ts` the derivation order, the typed finding and the blocking rule; `intentBrief.test.ts` the care line and the review brief.

## The record and its holds (phase 3)

The host records policy, review and check declarations without imposing repair, rerun or review-round allowances.
Stopping decisions belong to the agents' guidance, while consent and version identity remain enforced at the effect boundary.

**The repository's rigor is a posture.**
`app_change project-settings` writes `rigor` beside `delivery` and `autonomy` (`configure_repo` is retired); Settings → Projects writes the same row.
The project-settings feed line (`repo_configured` in `src/shared/feed.ts`) names the care (`RIGOR_WORDS`: Quick, Default, Careful) only when the column is set, and says nothing when the host derives it.
The context block does the same: `rigor` is on a repo only when the column is set (`firstmateContext`'s `repos`).
`rigorFor` reads the column as `repoRigor` (rule 3 above).
`setup_repo` is retired; `project-setup` puts up the setup card, where the captain may set a new project's care before it is added (`docs/fleet.md` "Asking the first mate to add a project").
The personal workspace takes no policy at all - its registry refuses the whole patch with one message - because it is a workspace KIND (`repos.kind: personal`, migration 37) rather than a posture.

**Check facts and declarations.**
`check_change` returns check and mergeability facts and records the crewmate's evidence-backed judgments (`docs/forge.md`, "Check facts and crew judgment").
The crew-only Delivery judgment runbook (`resources/runbooks/delivery`) supplies pull request delivery (direct-pr or queue-pr) with readiness, diagnosis, repair, rerun and stopping guidance.
Its switch changes new crew prompts, not the fixed care procedure, actual check facts, consent or merge authorization.
The host does not decide green from check states, automatically settle repairs, or enforce a repair, rerun or review-round count.
The delivery guidance tells the crew how to judge readiness, diagnose a failure, investigate uncertainty and decide when to stop.
A merge offer expresses readiness only for its named version and grants no merge permission.
The checks hold a new merge card until the pull request's own checks pass (INF-1891, the captain: the app turns the merge card down until the pull request's own checks pass), while a revision of a merge card already up goes up as they run.
A pull request with no check registered, or with only skipped or advisory ones (`docs/forge.md`, "Advisory workflows"), reads pending, not no checks, until the crew's absence declaration for that version is stored (INF-1955; `docs/forge.md`, "Check facts and crew judgment"): the refusal names `check_change` `absentChecks`, the stored declaration makes the reading say no checks and lets the offer up, and the captain's kept click on an empty reading completes once that declaration arrives at the approved version, with no checks override.
A project recorded as running no checks needs no declaration for each version: its readings where no check ran say no checks at once and let the offer up (INF-2114; `docs/forge.md`, "A project with no checks").
A failed reading lets the offer up with Merge anyway beside the merge in two cases (`CrewmateCards.pendingCiGate`): every failed check at that version carries the crewmate's diagnosis, or the default branch's newest run of every failed check failed too (`TaskDelivery.mainChecks`, INF-1915 fix 1), which the card states from that fact under its Checks cell.
In the second case the crewmate spends no rerun and asks for no reopening: the captain decides on that card, merging now with Merge anyway or waiting for main's fix, which the app watches (`docs/forge.md`, "A main failure's wake").
The captain's click on Merge anyway passes the checks hold for that version.
Normal check replies carry current facts and unresolved repair identities, not the whole historical ledger; the task record retains declaration history.
A settlement declaration identifies its repair, version, outcome and evidence; a raw reading cannot silently settle or supersede it.
The durable record keeps declarations and older repair history, but legacy count and cap fields no longer hold a task or produce a count on its card.
Review findings still record the reviewer's verdict and evidence; they do not accumulate a host-owned allowance.
The five report headings remain the report's; the review and live validation are what Careful's guidance asks, recorded when they happen and held by nothing of the host's.

**The autonomy hold.**
Autonomy - who merges a task's green work - now has the shape delivery and rigor have (contract v3.9, captain ruling F7 A of 2026-09-20: "this should actually be the same - repo default, per-task ask allowed").
The repository's `autonomy` column is the default, the first mate relays the captain's own words for one task as `autonomy_ask` on `spawn_crewmate`, and `autonomyFor` (`src/shared/repos.ts`, beside `deliveryFor`) is the one derivation: the ask, then the repository.
The ask is read by PRESENCE, so `autonomy_ask: false` - "ask me before merging this one" on an autonomous repository - is an ask, not a silence.
The mint stamps the effective value on `WorkShape.autonomy` the quiet way rigor is stamped, as provenance; every reader that decides anything derives it live from the record instead, so turning a repository autonomous reaches work already in flight.

It is a host-enforced merge rule, beside v3.8's answer task, and the only one that had been prompt-only: with autonomy off, `settleTaskOnce` refuses a `merge-pr` or `land` whose actor is the first mate and settles nothing, returning the structured `autonomy-off` `SettleRefusal` (WI-12).
Its one way out is not a tool the first mate can run - it is the button already in front of the captain, so the refusal names the open merge card's own merge action by card and action id (a `SettleWay` variant that carries a `card` rather than a `tool`), and says whose card is owed when none is up.
When none is up because the captain's click already approved the merge and that approval stands, the refusal names no way and says the approval is kept and the host merges once the gates pass, and that the click is no override (INF-4525).
The captain's click arrives as `actor: "captain"` and this rule never reads it.
Three rows take no autonomy at all, for the reason they take no care - there is no merge to hold: a task on the personal workspace (it builds in place), an **answer** task (it commits nothing, and v3.8's deliverable hold refuses its merge whoever asks, so that refusal speaks first), and a task with **no repository** - the default workspace - because the hold enforces a REPOSITORY's standing answer and there is none to enforce there.
`crew_status` and the context crew lines carry it per task; the fact strip has no autonomy cell, and a task that merges on its own says so in its story note's merge line.

**A kept merge approval (FI3-304).**
The captain's merge click on a merge card is an approval of that change, and a refusal that is not a verdict on the work does not spend it.
`src/core/orchestrator/mergeAuthorization.ts` holds its closed facts; `KeptApproval` (`keptApproval.ts`) keeps its state on the task and `KeptMerge` (`keptMerge.ts`) runs it.

- **The baseline.**
  When a crewmate offers a merge, that offer itself expresses the crew's judgment that the work is ready; no separate ready/red declaration is required or recorded.
  After the current change lookup obtains its target (`CrewmateCards.pendingCiGate`), `CrewmateCards.recordCompletionOffer` keeps the shown offer's id with that head and its pull request (`delivery.completionOffers`, the newest four).
  Pending and partially unreadable checks hold a new offer, and failed checks hold it unless each is diagnosed or fails on the default branch too ("Check facts and declarations" above); the facts remain visible on the card and hold the merge at the click.
  A lookup that obtains no target cannot bind an exact-version offer and reports why; it cannot reuse a stale earlier reading as fresh.
  An offer that shows the same content at another head keeps no baseline.
  A new completion or requested-merge card at another version supersedes that pull request's standing approval: the crewmate is asking again; one at a version an approval covers is refused ("No second card for an approved version" below).
- **The approval.**
  The captain's chrome click mints `delivery.mergeAuthorization` (version 1) in the card resolution's own transaction (`CardService.resolve`'s `alongside`): a fresh id and a generation, the card, lifecycle, offer, action and gesture ids, the GitHub repository, pull request and branch, squash, the approved head and an empty repair lineage.
  That click also stores the approved head's change reading on the approval, so the story refresh at a repaired version compares it for the attestation without reading the branch.
  It is minted only on a GitHub direct-pr task for an offer with a baseline on one of the task's pull requests - its own change or a review it holds (`taskPull`) - whichever branch it is on.
  A first mate merge card, a seeded merge card, a plain Git host or an ambiguous baseline mints nothing: that click is one attempt, as before.
  A merge card naming a review instead pins the stored review it names: the exact host, project, pull request, source branch, destination and reviewed head (INF-1246).
  Its review snapshot survives review-list eviction, and the click makes that pull request the task's current change (INF-2490).
  A click on a merge card approves the pull request that card was shown for, even after another one became current.
  A rule-skipping review remains a one-shot click and mints no kept approval.
  Frames and agents cannot mint one - a settle effect runs only from the chrome.
  One other route mints it in the captain's name: on a project that merges in batches of the person's own, the first mate's merge while the captain's words recorded as an override pass `asks-first` at the task's current version, and the crewmate's merge card is up with its offer at that version (`SettleService.mergeOnCaptainWords`, INF-6091's audit, finding 2).
  The `decisions` hold still applies to it, as to every first mate merge: an open question, a recorded wait on the captain or a gate on the task refuses it unless the override passes `decisions` too (`SettleService.decisionsHold`).
  The approval it keeps records that it came from the captain's words (`fromWords`), so each later run of it reads that hold again at the last look before its change goes in line; only the captain's own click passes the hold (`clickedByCaptain`).
  It mints from that card's offer outside any card resolution, and the app takes the card down unanswered (`CardService.takeDown`), so it reads as taken down by the app, not as a click.
- **A card behind its change (INF-4031).**
  One reading, `MergeCardActions.mergeBehind`, says whether an open merge card shows less than its change: a newer version pushed past its offer, another pull request now the task's current change, an offer an earlier version of the app saved without recording where its change lives, or only a newer story revision at the same version.
  The click and the card read it the same way.
  On the first three, the card refresh (`CardService.refreshSettleFacts`, `settleCardFacts`) takes Merge and Merge anyway off the card and puts one line at its top saying why; its other choices stay, and the app's Decline joins them when no other choice declines.
  It redraws the same card at once when the newest published story is at the current version, so the click returns on the new version; otherwise it wakes the card's author once per card and version (`merge-card-behind`), and that author's next merge card revises it.
  Where the project lives keeps a story, the redraw waits until that story's publication is confirmed, and the confirmation is a new reading, so a story saved in one write and confirmed in a later one is redrawn then; an uncertain publication wakes the author instead.
  The redraw skips a task whose own show_merge_card is writing the card, so the two writes never race.
  While the redraw writes, its author's story calls (prepare_change, open_change, emit_card with a story and show_merge_card) wait for it to finish instead of being refused as a story operation already in progress.
  A held card is still the task's open merge card, so the author's next merge card revises it in place, while checks run too.
  A first mate merge card is held and its author woken, never redrawn.
  An offer an earlier version saved has its own held line, refusal and wake, which say an earlier version showed the card and never that another pull request became current; showing the card again saves an offer that records where its change lives, so Merge returns.
  A click that lands on a card behind its change merges nothing, names the newer version and shows the card as it now stands; a click on a card that changed while the captain read it says so.
  A newer story revision at the same version does not hold Merge: the click merges that version, as above.
  On a project that merges in batches of its own, the task's change is its pushed branch with no pull request, and the reading is the same: the check watch reads that branch after the crewmate's turn ends, when a run watch starts on it, and on every tick while its merge card waits under a captain's reply or is held (`CheckWatcher`, `readsBranch`), so a push from the crewmate's shell takes Merge off as a pushed pull request does (INF-6241).
  A reading at a new version with no check started, or only checks a person starts, arms no watch there, since nothing but its bound would end it.
  Under a captain's reply, such a card stays away until the new version's checks end (`docs/card-threads.md`, "A reworked merge card").
- **Its words (INF-23).**
  The merge card's merge says what a click does, on an offer a click would approve (`approvableOffer`, `MergeCardActions.mergeLabel`): Merge when checks pass while checks are pending or unreadable, Merge after fixing errors when checks fail (captain INF-1555 F20), and Merge the pull request once the checks pass.
  On batched pull requests that last reads Merge in the next batch, since the click puts the change in line for its project's next batch, whether or not it still has a pull request of its own (`mergeWordsFor`, INF-4196); a merge of a reviewed pull request (`check_change` pull) keeps Merge the pull request.
  While the captain's override passes the checks at the card's version and the pull request is still at it, a click merges at once, so it reads Merge the pull request, or Merge in the next batch, whatever the checks read (INF-756).
  While the checks fail at the card's version and no checks override passes them, the host draws Merge anyway beside the merge (`MergeCardActions.mergeAnyway`, INF-1137 friction 6).
  Under the status line, a failed check whose newest run on the default branch failed too reads Fails on main too, with the host's sentence naming that run and when it was read, so the captain sees what failed and why it is outside the change before choosing (`checkVerdicts`, INF-1915 fix 1).
  Its click is the captain's own word: it records the override on the checks for that version in his name, with the button's words and the card's title as its reason (`choiceWords`), and the merge runs at once; GitHub's own rules still decide whether it merges.
  It goes once the checks no longer fail, the pull request moves past the card's version, or an override already passes it.
  `CardService.refreshSettleFacts` writes it with the fact strip whenever the task's record changes, so it follows each new reading.
  A click keeps the approval, and its feed line distinguishes a wait for a fix after failed checks from a wait for pending or unreadable checks (`keptFeedLine`, captain F27).
  A fix brings a new version with fresh checks, so it comes back to the captain on a new merge card when it changed the work (a repair declared `changed-work`, under "Repairs" below); a fix declared to leave the approved work as it was, or the same version passing on a rerun, merges on the kept approval once the checks pass.
  A card whose click approves nothing keeps its words, since a click there is refused and nothing waits.
- **The head it covers.**
  A merge under the approval runs with a `MergeGuard` (`ChangeMerge.merge`): only the candidate head (the approved head, or the newest accepted repair) on the pinned pull request.
  A pull request at any other head stops as `moved`, and nothing is sent.
- **Repairs.**
  Any new version after the approved one is a repair - bringing the change up to date, a reworded commit, a fix for what refused the merge - and the crewmate declares it with `check_change conflictRepair` (`fromHead`, `toHead`, `newBase`, `impact`, `changedPaths`, `evidence`, `validation`).
  The host checks the closed facts with git: the repair starts from the candidate head, `toHead` is a commit here, `newBase` - the default branch commit the repaired change sits on, newer or the one it already had - is in it, and every path that differs between the ORIGINAL approved change and the repaired one is named, so drift across several repairs adds up.
  Generated files count among those paths, so the crewmate diffs the two heads before it declares.
  A change built on another task's approved version that has not merged names that task's newest approved version as `newBase` once it is moved onto it, and its ORIGINAL approved change is then read from the version of that task it was approved on, the newest of that task's pushed versions its approved head holds, so a path only the task under it changed is never counted (docs/task-graph.md, "Following the part under it").
  Once the approval covers that repair, the change's recorded base moves to that version (`followBase`).
  That same read stores the repaired head's change reading on the repair.
  The impact is the crewmate's judgment of what the repair did to the approved work, and the host records it rather than sorting the repair into a kind (the captain's guard = builder; INF-484's E6, INF-493): `none` extends the lineage; `changed-work` invalidates the approval with a hold, and the crewmate puts up a new merge card; `unknown` holds the merge for an independent assessment (next).
  `conflict-only`, `none`'s name before INF-493, still means `none` wherever it arrives: the work request a computer sends its home carries it, so the published contract keeps its shape (`wireRepairImpact`, `repairImpact`).
- **An undecided repair (FI3-663).**
  The guard = builder choice gives uncertainty "an independent bounded assessment", so a crewmate's `unknown` is its last word on that repair: the host checks the same lineage facts, keeps the paths both changes touch on the repair (`paths`), and refuses the crewmate's own later `none` for it (`changed-work` still ends the approval).
  Once the crewmate's turn is over, the kept merge's preflight asks the supervisor to assess it (`Reviews.assessRepair` in `reviews.ts`), which commissions one assessment of that repair and records it on the repair before it starts, so a second read starts none.
  The assessment is a review-kind child of the builder with `kind_source: host:repair-assessment` (`isRepairAssessment`): delivery machinery like the independent review, retired with its builder, placed on another provider than the builder's when one can serve, and never counted as the task's code review.
  Its brief (`renderRepairAssessmentBrief`) names the approved head, the repair's heads, the newer base, every path either change touches and the crewmate's evidence, and asks for one read-only look answered with a first line, `impact: none|changed-work|unknown` (`parseRepairAssessment`).
  Its first report is its verdict, and the host closes it (`decideMergeRepair`): `none` adds the repair to the lineage and the kept merge runs again under every gate; anything else - `changed-work`, `unknown`, no impact line - invalidates the approval with a hold, writes one feed line, and steers the crewmate once (`repair-assessed`) to put up a new merge card, so the captain decides again.
  The bound is a fact the tick reads: an `evidence` wait is timed, and an assessment that could not start, stopped without reporting, or is still open an hour after it started (`ASSESSMENT_BOUND_MS`) ends the approval the same way.
  A verdict about a repair the approval no longer waits on - a newer repair, a newer approval, an ended one - records nothing.
- **The captain's newer words (FI3-662).**
  While the approval stands, every steer of the captain's on the task is guidance that holds its merge: the captain's reply under a crewmate's card, the captain's choice on one or the captain's ask to explain it, a line the captain types in the task's Crewmate tab, and the first mate's steer in a turn that carries the captain's words (`isCaptainGuidance`, read from who sent the steer and its typed kind, never from the captain's words).
  The captain's close of a card is not a choice and Continue is the host's own nudge, so neither holds anything, and neither does the first mate's steer on an operational wake.
  As the steer's row is recorded, `KeptApproval.holdForGuidance` gives it the approval's next mark (`guidance.latest`), with a timeline line and, when the hold begins, one feed line; the mark rides the message itself (`kept-merge-guidance`, `withGuidanceMark`), so the crewmate can declare only guidance it read.
  The crewmate declares the newest mark it read with `check_change captainGuidance` (`mark`, `impact`, `evidence`): `none` lifts the hold through that mark, and a later mark still holds; `changed-work` invalidates the approval with a hold, and the crewmate puts up a new merge card.
  A mark no message named is refused.
- **The gates.**
  A host-run attempt (`runMergeAuthorization`: every idle boundary, the tick's `kept-merges` rider when a timed wait comes due, the end of another settle that held the task when the approval's run met it, and boot) first checks the task and pull request are still the approved ones, no new merge card is up, no guidance of the captain's waits for its declaration, and no repair is undecided; it holds nothing on a review (INF-1876).
  The kept-merge line on a checks reading asks the crewmate to bring the branch up to date only when the merge waits on a conflict or a moved version.
  Then every page of the checks (`GitHubForge.checks`; a suite past the pages it reads keeps a pending item), and GitHub's own readiness for the pinned pull request (`GitHubForge.pull`): only `clean` merges, so a sign-in that could bypass a required review or another branch rule never does.
  The captain's own click keeps today's single attempt and reads readiness only to classify a refusal.
  GitHub's refusal because the main branch moved while it merged is the exception for both: the merge is sent again on its own, right away, once GitHub reads the pull request clean at the approved head; only a conflict or another stop it reads then waits for someone ([the forge seam](forge.md), "Failures are typed").
  Right before the last look, the guard's `held` reads the approval again, so guidance that arrives while the gates are read - or while the captain's own click waits for the crewmate's turn to end - stops the merge as a `guidance` wait and the approval stands.
- **Waits.**
  A conflict, a moved head, checks, a review, GitHub's rules, GitHub not knowing yet, a draft, a sign-in, a hiccup, the captain's undeclared guidance or another refusal leaves the approval standing with `waiting` on that stop.
  A wait new for its head is a quiet timeline line, and one wake to the first mate where someone other than the crewmate the check watch wakes must move.
  Timed waits (`retryAt`, backing off to 30 minutes) are read again by the tick, never in a hot loop.
  At the last look, an at-time gate whose end matches the task's reported check-back is only a reminder and does not hold an app-approved merge; a scheduled continuation, allowance gate, captain gate, open question or recorded captain wait still holds it.
  The refusal names the actual hold, and a last-look refusal while the same approval and generation still stand records the existing refused wait, with one timeline line and first mate wake per head and a backed-off retry.
  An ended or replaced approval leaves no new wait.
- **Batches of your own (INF-3759).**
  On a batched project, the attempt that passed every gate above and the last look below puts the approved version in line for the person's next batch instead of merging, and waits on `queue`.
  That last look is the guard's and then the settle's own (`SettleService.mergeBoundary`, as a mark that records nothing sent), as before a merge request, so an open question, a recorded wait on the captain or a gate on the task holds an approval the app took under autonomy, or one kept from the captain's words, before its change goes in line; the captain's own click passes them.
  It reads merged from its batch's receipt, and a change sent back from a batch keeps its approval, waiting on `checks` for its declared repair as a failed batch of one does ([the forge seam](forge.md), "A change sent back").
- **The host's merge queue (INF-3759 piece 5).**
  On a GitHub branch with a merge queue of its own, GitHub takes the merge the attempt sent into that queue instead of merging it, and the approval waits on `host-queue` with no card and no wake.
  The host reads the queue again at most five minutes apart, before any gate above, and sends nothing meanwhile; GitHub's merge spends the approval, and a version GitHub removed waits on `host-removed` until a declared repair, the crewmate's answer to the removal or the captain's click sends one again ([the forge seam](forge.md), "The host's merge queue").
- **No card after the click (INF-2913).**
  A captain's merge click on any project, on any merge card, takes the card away and the host puts up no card of its own while the merge waits, goes through or stops; the captain's words: "only show a card if the merge went wrong and needs the user's decision".
  Activity's one folding line says what became of the click (`settleLine`, `keptFeedLine`), and the host's sign-in card stays the one card for a refused sign-in.
  A Merge click held only for a healthy batch check keeps its approval without a host card or routine first mate wake.
  A batch must pass with the approved version in it before the host merges it.
  When a stopped merge wakes the first mate, it carries the outcome, marked `unseen` (`UNSEEN_STOP_WORDS`).
  The first mate puts up a card only when the next step is the captain's, and a crewmate whose work changed asks again on a new merge card.
  A note an earlier version put up after a click (`mergePendingCardId`) still leaves when its task closes (`TaskClosing.closeAndPurge`).
- **Restart safety.**
  Right before the merge request goes out the guard's `beforeDispatch` re-reads the approval (same id, generation and head, the crewmate idle, no new card) and persists an `attempt` token.
  Its answer clears it; a 200 merges only when GitHub says `merged`.
  A token that outlived its answer - a quit, a timeout - is read back by the pull request's number before anything is sent again: merged spends the approval, closed ends it, open at the same head runs every gate again.
  A finishing merge, `after: close`, closes the task once; a continuing merge, `after: continue`, leaves it open and delivers its continuation once.
- **Ends.**
  Consumed by the merge; revoked by an interruption (the captain's interrupt = revoke, and the first mate's too: the captain chose in INF-1272 that a stop still ends it, while a move back to the backlog keeps it and the merge goes ahead there, the captain's choice in INF-2114) or the captain's own words through `update_task withdraw_merge`, or by the app when its own approval no longer passes the merge gate because the task no longer merges on its own (`KeptMerge.runFront`); invalidated by changed work, a closed or swapped pull request, or a changed project, host or delivery; superseded by a new merge card at another version or by a click; ended with its task.
  Every close ends it in the close's own transaction (`TaskClosing.endApprovals`): a merge spends it, and any other close, a cancelled or failed turn's included, revokes it and takes it out of the batch line.
  A quit, restart or update is no interruption: the approval stands and the next launch runs it again (`KeptMerge.resumeMergeAuthorizations`), as a computer that runs work's update pause does.
  A revoked or work-changed end `holds` the task's merge for the captain, except the app's own autonomy revoke, which holds nothing: `mergeGate` refuses a first mate merge whatever the project's autonomy, until the captain's new click.
  Contract 4.66's unversioned `delivery.mergeOrder` names no approved head, so the boot retires it and says so rather than carrying it forward.
- **Many merges on one task (INF-2746).**
  A task may ask for many merges, and every merge card's approval stands on its own until its pull request merges.
  Each approval is keyed to its own pull request (`taskPull`): the task's own change or a review it holds, never whichever change is current, so asking for another merge leaves the earlier approval standing.
  An approval of another pull request than the one in front stands beside it (`MergeAuthorization.queued`), never in its place, and each goes ahead on its own as soon as it is ready (captain: "Let each go ahead on its own").
  `KeptMerge.runMergeAuthorization` runs the approval in front once; one that waits without merging steps to the back (`KeptApproval.stepBack`), and the next runs, until every approval has run once in that pass or a settle, a working crewmate or an outstanding attempt holds the task.
  On a batched project, the approval of the task's own change joins its batch, and each approval of a pull request named by number merges on its own.
  The captain's guidance marks stay with the approval in front, and a repair declaration or assessment brings the approval it is about to the front (`standInFront`).
  When the approval in front ends, the next stands in its place (`KeptApproval.promoteQueued`) and leaves the task's current change as it is; a run that merges the task's own change makes it current just before the merge (`selectCovered`).
  An end that holds the task's merge for the captain ends the other approvals too, as do the task's close and a policy change (`KeptApproval.dropQueued`, `CrewSupervisor.policiesChanged`); each such end wakes the crewmate once, naming the merges that will not run, to put their merge cards up again.
  When the app's own approval ends because the task no longer merges on its own, only the other approvals the app took under autonomy end with it, and those the captain clicked still go ahead (`endsWith`).
  A new merge card for a pull request at another version ends that pull request's approval and leaves the others as they are.
- **No second card for an approved version (INF-4018).**
  A merge card at a version a standing approval covers - its approved head or its newest accepted repair, from the captain's click or the app's own approval - is refused before anything is written: `show_merge_card` answers with the approval's line, and `emit_card` refuses the card with the same words (`coveringApproval`, `keptApprovalLine`, `src/core/orchestrator/mergeAuthorization.ts`).
  The approval keeps its generation, the change keeps its place in line, and nothing is posted on the pull request.
  An approval waiting its turn behind another covers its version the same way (`standingApprovals`).
  The version is the one the card offers: the committed version `show_merge_card` verified pushed, or the saved story's on `emit_card`, never a record a check reading has not caught up with.
  What the refusal says to do comes from one place (`coveredNextStep`): while the captain's newer words hold that approval, declare them with `check_change captainGuidance`; while its batch failed that version alone or left it out, which no checks override passes, fix the cause in a new version declared with `conflictRepair`, which joins the project's next batch (`docs/forge.md` "Batches of your own"); while the pull request's own checks failed there, push a fix and declare it with `conflictRepair`, record a rerun, or report a Merge anyway case so the first mate records the captain's override; otherwise end the turn, since the app runs the merge once nothing holds it.
  A card after a choice other than Merge under the same id still goes up with a new id, its answer naming the earlier choice; a card after the approval ended, or for a pull request merged outside the app, goes up as before.
  The check watch sends no wake for a version the approval covers once every check passed there, and runs the approval in its place, since that wake's turn was what ran it (`CheckWatcher.withApproval`, `runKept`); any other check-watch wake at that version carries the approval's line and the refusal's next step.
  Once the approval's own pull request reads merged outside the app, neither the crewmate's `check_change` reading nor a check-watch wake carries the approval's line: nothing is left for it to merge or repair, and the reading's merged words say what follows (INF-4161).
  Closing a card, a merge card or any other, leaves an approval as it was.
  An approval still standing keeps the task open after another merge that declared it closes the task.

Not built: approvals on local-only and plain Git hosts or from first mate cards.
A first mate merge on project autonomy reads no guidance mark: the hold is the kept approval's own.

**Reviewer placement (Q5).**
`Router.decide` takes `avoidProvider` on a review task - the Pi provider the builder's newest `routing_decisions` row chose (`Router.servedProvider`) - and the ladder prefers another signed-in provider at the same tier, falling back to the builder's with the reason on the record when none can serve; it never descends a tier for it, and a pin still wins.
The decision is recorded with rule `R9` (`ruleIdSchema`), its reasons naming the tier row it rode on (`review -> high`, R2).

Observe's crewmate header renders the rigor beside the tier, a builder's review verdict with its risk, and on a review task the builder it reads (`docs/dev-observe.md`); the dispatch corpus carries `rigor`, `review_of`, `review_verdict` and `review_risk` on every task join, null where the record carries none (`docs/dispatch-extractor.md`); a pre-phase-2 database exports exactly as before.

## The holds

Every hold the app places on work is one entry of `HOLDS` in `src/shared/holds.ts` (INF-242's plan, INF-473), and each entry has a level.
A hold is `fixed` only when no word of the captain's changes what it rests on: a physical limit, or a fact outside the app.
A hold that rests on a fact the app holds, on the captain's own consent or on a number the app made up is `soft`, and the captain's words pass it.
Which level a hold takes is a judgment by the four questions above, made by its author and its reviewer, never a lint.
`scripts/holds.ts` in `pnpm check` only keeps the list, the sites that cite it and this table in step: a kind with no site, a hold sentence written outside the registry, or a row here that differs from the entry fails the check.

| Kind | Level | Rests on | What it holds | What passes it |
|---|---|---|---|---|
| `asks-first` | soft | consent | a first mate merge while autonomy is off | the captain's click on the merge card, or the override |
| `decisions` | soft | record | a first mate merge, or its own close as done, while another decision on the task is open | the override, or the captain's words on the close |
| `waits` | soft | record | a close or merge card while a wait on other work stands | the override, or the captain's words on the close |
| `parts` | soft | record | a close while the task's planned parts are open | `proceed_with_open`, the override, or the captain's words on the close |
| `checks` | soft | record | a merge card or merge while the checks failed or are running | Merge anyway on the merge card, or the override |
| `proof` | soft | record | the first mate's own close as done while its crewmate has not reported, its own pull request is open, or its unmerged work goes nowhere the close names; and the merge card while the live proof at its version is not accepted | the override, or the captain's words on the close |
| `story` | soft | consent | a GitHub or GitLab pull request opened, or merged, without its current published story | the override |
| `escalation` | soft | made-up number | a stronger model past the ladder's top | the captain names the model |
| `program-bound` | soft | consent | a program's task() call past its bound | on the captain's words the crewmate that started it raises the bound with `start_program`, or the first mate with `update_task program_bound` |
| `start-waits` | soft | record | starting a task that waits on other work | the first mate removes the wait on the captain's words |
| `card-question` | soft | consent | the first mate's start of unstarted work, its when-ready setting, its removal of when-ready work's last wait, or another edit that leaves when-ready work waiting on nothing, while its own open decision card still asks the captain about that task or the captain's choice on that card waits unread on the first mate's lane | the first mate has read the captain's answer on that card, the captain types their own words, or the first mate withdraws the card, and the first mate starts the task again |
| `load-line` | soft | record | a declared heavy run waiting for its computer's capacity or pressure reading | the override |
| `cost-limit` | soft | consent | a task, and everything under it, past its cost limit (docs/usage.md, "The cost limit") | the captain's click on its card, or the override |
| `model-levels` | soft | record | a task's next conversation while the model it routed to left every level and no model where it runs can take it (docs/routing.md, "A model that left every level") | the captain places a model that can take it on a level, names one for the task, or adds a sign-in that serves one where it runs |
| `host-rules` | fixed | outside fact | a merge the rules or readiness where the project lives hold | no one |
| `nothing-to-merge` | fixed | physical limit | a merge or merge policy for work that has no merge | no one |
| `sign-in` | fixed | outside fact | work where the app is not signed in | no one |
| `sent-once` | fixed | outside fact | a write or merge sent a second time | no one |
| `recorded-path` | fixed | physical limit | a merge outside the merge card, and a wait that closes a cycle | no one |

Every refusal ends with its hold's sentence.
`softHoldWords(kind, audience)` names the override: to the first mate as the way the captain declares it, and to a crewmate as words only the captain gives, through the first mate.
A soft hold with its own way (`escalation`, `program-bound`, `start-waits`, `card-question`, `model-levels`) names that way instead.
`fixedHoldWords(kind)` says no one's word passes it.

**The override.**
The captain's words are one recorded override on the task (`delivery.override`, `HoldOverride`): the captain's words, the soft holds the first mate declared they pass, and how long.
How long is the first mate's reading of the captain's words: `version`, the version it was declared at - the task's head then, of the pull request it named then, its own or one it selected to read - or `task`, the rest of the task's life.
The first mate declares it with `update_task override` (`holds`, `until`, `from`) on the captain's own words, and the host keeps those words as its reason without reading them.
The words are the turn's own: every message of the captain's the turn carries, however it began, words typed while a crewmate's report was being read included (INF-1582 finding 2).
Or they are the words `from` cites (INF-1216): on a card of the task (`from` is the card's id), the newer of the captain's reply in its thread and the captain's click on one of its buttons, on the first mate's cards and a crewmate's alike; the captain's newest line in its Crewmate tab (`crewmate-tab`); or the words of the override standing on the task (`standing`).
A click reads as the button's words, the card's title and anything the captain wrote beside it (`choiceWords`), the words Merge anyway records too; a script in a card's body choosing is never the captain's click.
A click on a merge - the merge card's merge or Merge when checks pass among its words - is the captain's scoped approval of that change at that version, kept until the checks pass with the existing repair-carry rules, never a general override.
The host reads that from the clicked action's declared effect, never from its words (`CaptainOverrides.clickApprovesMerge`), and refuses any override on that ordinary click with nothing recorded (`mergeClickRefusal`).
Older saved overrides marked `HoldOverride.mergeClick` remain in history but never stand, pass a hold or supply words through `standing`.
Separately spoken task-long permission and explicit proof-gap acceptance keep their own consent routes.
Merge anyway passes the checks itself, and a merge past the branch rules names each failed check it skips, so neither is such a click.
`standing` lets the first mate name more holds with the one sentence the captain already gave, so a second sentence is never asked for the same go-ahead.
The host reads a cited reply from the card's thread, a click from the card's recorded ending and a Crewmate tab line from the steer that carried it (`CaptainOverrides.citedCaptainWords`), so it checks only closed facts: the words are the captain's, they are on this task, and the turn is not a scheduled check that carries none of the captain's words.
A cited card on another task, a card with none of the captain's words on the record, `standing` with no override standing, and any citation in a scheduled check that carries none of the captain's words are refused in words, with nothing recorded; a scheduled check still sees the override standing.
The crewmate judges first whether the captain's reply, click or Crewmate tab line passes a hold or tells it to go on without asking: if it does, the crewmate reports those words with `needs_firstmate`, naming the card or the Crewmate tab, and the first mate records the override in the turn that report starts, with no second card to the captain.
A crewmate never records one itself: its refusal tells it to report the captain's words.
The first mate judges which holds the words pass and may record them before any refusal names a hold, when the captain's words grant ahead, such as "keep going and don't ask me again on this task".
Only the captain's words take it back; stopping a crewmate leaves it standing.
An override that names a fixed limit, or a soft hold with its own way, is refused whole before consent is read: nothing is recorded, and the refusal ends with each such hold's own sentence (`overrideRefusal`).
Empty `holds` takes it back, and a new declaration replaces the old one.
The row is a `note` event on the timeline with one feed line, quoting the captain's words and naming the holds and how long; a new event kind would be a contract major.
Each site reads it with `overridePasses(delivery, kind, head)`: a task-long override always passes, and a version-long one passes only at the version it covers, so a new version brings the hold back.
The captain's merge click reads the same record, since the settle boundary is one function for the captain's click and the first mate's merge.
The merge card's fact strip shows an Override state naming the holds the captain's words pass.
The first mate's task line in its context and `crew_status` show the standing override: what it passes, for how long, and, in `crew_status`, the captain's words.
Every crewmate turn on the task is served the standing words: the brief carries them when the work starts with one standing, and each new override, or its withdrawal, is a `task-override-changed` notice on the task's lane that rides the next turn, on this computer or another, and starts none of its own.
The crewmate reads them as its consent for what they reach among its own consent asks (`RIGOR_SAFETY`), such as the captain's plan's allowance, and judges which those are; keychain or signing access, writes outside the project and browser handoffs still ask.
The reviewer's brief carries them on every review turn (`reviewerOverrideWords`), so access or a step they cover is not a finding.
Both arrive as the first entry of the Already allowed list ("What the captain already allowed" below).
When they pass the checks, its merge reads Merge the pull request, or Merge in the next batch, on failed or running checks, since the click merges at once ("Its words" above).

**The first mate's own cards and a story note.**
The `decisions` hold on a first mate merge counts a crewmate's question, a write request and a validation question, never a card of the first mate's own (INF-242's question 9).
Nor does it count a captain wait or gate on the task's own story note: the completion of work that merges on its own stays off the stack until the merge has a result ("Work that closed without the captain's click" in `docs/card-authoring.md`), so the captain reads it after the merge, the same as a wait on a merge offer (INF-2761).

A refusal written with no kind at all is beyond the check; the weekly audit reads each week's changes for one, beside the limits ledger and the override counts (`docs/agents-reach.md`).

## What the captain already allowed

A yes the captain gives on a crewmate's own consent card is kept and served onward, so no later agent on the same work asks for it again (INF-3170 piece 2).
The crewmate marks the yes action with `emit_card`'s `allows`: an ordinary action with no effect, and `covers`, what a yes allows, in the card's own words.
The host refuses a mark on an action with an effect, on an action the card lacks, on the validation approval's own action, and with nothing it covers.
The host draws a strip under the card's body saying what the click is kept as, and keeps the offer on the task beside the card's offer (`delivery.allowanceOffers`); a revision without a mark offers none.
Only the captain's own click on that action records the yes (`delivery.captainAllowances`, `CaptainAllowance`): their click as words (`choiceWords`), what it covers and the card.
A click from the card's own script records nothing, and a click on an older offer of the card is refused, so the card shows its current yes.
The timeline gets a row quoting the yes.
The captain's own click on Merge records one more kind of yes: what an after-merge step the merge card listed names in `uses`, kept on that step's task with the merge card as its card (`docs/task-graph.md`, INF-4574); a merge the app makes on its own records nothing.

Every later crewmate turn reads one list headed Already allowed (`alreadyAllowedWords`): the standing override, then each recorded yes, oldest first.
The brief carries it when the work starts.
Each new yes, one taken back, or a `replaced-by` link that brings earlier work's yeses to a task (noticed just after the change, since a change listener writes nothing) is a `task-allowed-changed` notice carrying the whole list, on the lane of every started task whose work includes the changed one, the task itself, a stronger-model retry or a takeover of it; the notice rides the next turn and starts none of its own.
The reviewer's brief carries the builder's list, so access or a step it covers is not a finding.
`RIGOR_SAFETY` points at the list: a yes on it is that consent, and the crewmate judges whether an ask falls inside it.
A write kept for the captain's click, a browser handoff and anything no entry names still ask; the app adds no stop, refuses nothing new and reads none of the words.
Each entry names the card its yes was given on, so a check request can take its approval from that yes ("Check approval" below).
The captain's yes on a check's own approval card is kept in the same record, covering what the check declares it uses and the cost of one run (`checkYesCovers`), so it is served, carried and taken back like any other yes (INF-4446); its timeline row is the validation answer's.

A yes carries to the same work, the captain's pick on INF-3170: the task itself, its reviewer, a stronger-model retry (`escalate_from`, or an older `escalated` row) and a takeover of its work (`replaced-by`, or a task that continues its branch with `branch_from`, the captain's "Count branch takeovers"), read through the handed-over relation (`TaskCapture.handedOver`) and any number of earlier tasks (`sameWorkLineage`).
A follow-up a merge files is new work and asks again.

A close keeps the yeses, so the work that carries the task on still reads them.
The first mate sees each yes in its task line (`allowed`, the card and what it covers) and in the task's by-key read, with the captain's words.
Only the captain's words take a yes back: the first mate passes the yes's card as `update_task` `take_back_yes`, on the task or on the work that carries it, and the crewmate is told to ask again.

A part of a task is not the same work, so the override standing on a task it is part of is not on its list (INF-1939 friction 5).
Its brief shows the nearest such override as a labeled fact instead (`inheritedOverride`, `inheritedOverrideWords`): the captain's words about that task, naming it, never this task's own ask, passing no hold and standing in for no consent ask on the part.
Where the captain's words cover a part, the first mate records them on it as its own override, through the ordinary steering path, the captain's pick: the answer to an `update_task` `override` names the task's open parts.
For its override, a part cites the captain's words on a card of a task it is part of, or that task's standing override (`standing`), as well as its own (`citedCaptainWords` with `partOf`).
A click on that task's merge stays a merge click, which the override refuses, and closing a part as done reads only its own words.
The answer to a withdrawal names the open parts that carry an override of their own, for the first mate to take back where the captain's words reach them.

## Numbers (phase 4)

The rigor system is countable from records the app already writes, in the one home the routing numbers already have: `scoreRigor` in `scripts/interaction-metrics.ts`, beside `scoreRouting`.
Both the replay gate (`docs/replay-harness.md`) and the offline corpus export (`docs/corpus-export.md`, manifest `rigor`) call it, so the two can never disagree about what a review round or a cap hit is.
Nothing new is written for it: the numbers come off the work shape, the delivery facts, the `review` and `cap_reset` timeline events, the override rows, and the merge cards themselves.

An ANSWER task is out of every denominator here (Task B): a task that ships nothing cannot carry the evidence contract, spend a CI round or hit a cap, so counting it would dilute every share with work the tiers were never about.
Its own share is reported instead, as an observational row nobody grades.

Two row types feed it.
`ObservedDispatch` gains the rigor facts - `rigor` (quick where a shaped row predates the tiers, the same reading the C5 join takes), the delivery posture, whether a PR is on record, `ciRounds`, the holds the caps placed, the overrides the captain's words declared, and whether the change's REPORT carried the five headings.
A review task is shaped too and carries no rigor at all: it read a change rather than shipping one, so it stays out of the mix.
`ObservedReview` is one row per verdict a reviewer returned, read off the builder's own `review` events; its findings are counted from the reviewer's report by the action each line asks for.

| Metric | Direction | What it counts |
|---|---|---|
| `deliverable_share_answer` | either | the share of shaped dispatches whose deliverable is an answer rather than a change |
| `rigor_share_quick` / `rigor_share_standard` / `rigor_share_reviewed` | either | the tier mix over every shaped dispatch that shipped a change |
| `evidence_headings_share` | up | standard-or-above changes that settled with a merge card and whose report carried Intent / What changed / Verified / Risk / Not done, in order |
| `review_rounds_per_change` | down | verdicts returned, per change a reviewer read |
| `findings_auto_fix_per_change` / `findings_ask_user_per_change` / `findings_no_op_per_change` | either | findings by the action each asks for, per reviewed change |
| `findings_ask_user_rate` | either | the share of findings that went to the captain rather than the builder |
| `review_verdict_share_pass` / `_findings` / `_blocked` | either | the verdict mix |
| `ci_rounds_per_change` | down | unsuccessful own repairs (legacy records: distinct red heads), per direct-pr change that opened a PR |
| `rigor_cap_hits` | down | round caps the host placed: each cap standing now, plus each `cap_reset` |
| `hold_overrides` | either | overrides the captain's words declared on a task's soft holds, one per `note` row that carries one; the corpus export counts them per hold kind (`docs/agents-reach.md`) |

Three rules keep them honest, and they are the same rules the routing rows follow.
A distribution has **no good direction**, so those rows are `direction: "either"` - written to the baseline, printed in the report, graded by nobody; only the evidence share, the two round counts and the cap hits are graded.
Every denominator is the population that could answer its question: a fleet that reviewed nothing has no review numbers at all (`n/a`), not a clean zero, and a change whose tier asks for no evidence is not a card that failed the contract.
And **unknown is never zero**: a review whose report the record no longer holds - a review task keeps only its latest, so only the newest verdict can be credited with findings - contributes no findings rather than zero findings.

The evidence share follows the contract to where it is required.
Until contract v3.6 it read the merge card's body through `bodyHeadings`, because that is what the lint refused on; now the headings are the report's, so it reads them with `reportEvidenceHeadings` (`src/shared/rigor.ts`) - a report is plain text, so a heading is a LINE that is the heading and nothing else, however the crewmate marked it up.
`missingEvidenceHeading` is still the one order check, so the metric can never grade a change by a rule nothing asked for.
A change that never settled with a merge card is `null`, not a failure: it did not ship.

Observe is the one surface in the app where any of this renders: the crewmate header carries the rigor, the review verdict and its risk, and the reviewers sit in their own **Review** group with each row's verdict on it (`docs/dev-observe.md`).

For a saved story on GitHub or GitLab, a host-accepted repair republishes the same content at its new head after checks pass, before the kept-approval merge.
Any other push past the published story republishes it the same way, at the merge card or at a merge no kept approval of another version holds (INF-2509).
It reuses confirmed attachments and the approved content hash.
Approval follows the code, never the story's words (INF-3623): a story revised at the approved version keeps the captain's approval, and the merge carries the newest published story, with one quiet line on the task's record; only another commit needs a new merge card.
The merge validates the published and PR heads without waking the work computer or inspecting its uncommitted files.

## Notes moved from AGENTS.md

Moved verbatim from `AGENTS.md` on 2026-09-24; `docs/README.md` lists this page.

- Delivery direct-pr (captain rule): a crewmate that opens a PR must babysit CI (`check_change`, through the app's own sign-in) until every check on the head SHA is green before the final report; the local evidence is the standard tier's (the Standing CI rule in `docs/testing.md`), not the full suite; the first mate must not present any land/merge/accept decision while CI is red or running.
- Delivery care (captain-approved 2026-09-19; `docs/delivery-rigor.md` is the one home): three care names - quick, standard, reviewed, shown as Quick, Default and Careful - and what each asks is the Rigor levels runbook's (INF-1876).
  Standard is EVERY repository's default (captain ruling 2026-09-19; a task with no gate to land through takes no tier at all), whose Default section the crewmate prompt serves (`buildCrewmateSystemPrompt`, every backend) when care is standard, reviewed, or unknown, while the first mate's care rule relays the user's words on care as `rigor_ask`.
  A known quick task is served the Quick section and, when delivery is a pull request, the delivery judgment.
  A task with no gate is not served the direct-pr passage.
  A crewmate's session carries the working copy's AGENTS.md (or its CLAUDE.md where it has none) and lists its project skills on every backend (`src/core/session/projectResources.ts`), and the prompt sends it FIRST to the instructions its session does not carry (CONTRIBUTING.md, a CLAUDE.md beside the AGENTS.md, and any file they point to), AGENTS.md, CLAUDE.md and CONTRIBUTING.md in that order of authority.
  At Default its section has it rebase, read its diff against the user's words, update stale docs, validate the change itself evidence-first (the ported no-mistakes evidence instructions: demonstrate the intent end-to-end as an end user would experience it; evidence for each concrete thing an end user would do, as many product-level artifacts as it takes, and unit tests, pass/fail output or reading the code are not evidence on their own; the smallest set of existing tests that would catch a break in what an end user experiences, end-to-end tests over the changed surfaces included and re-run after an overlapping rebase, a relevant test that cannot run named rather than dropped, a test written or improved under the default rule on tests when none produces evidence, and recorded manual checks when automated testing cannot), and report and write its PR body under five headings in order - Intent, What changed, Verified, Risk, Not done; the crewmate records evidence-backed check judgments, with stopping decisions in its delivery guidance rather than a host counter.
  `tests/e2e/rigor-standard.spec.ts` is the binding test for Default.
- Careful (delivery rigor phase 2; `docs/delivery-rigor.md` "The review"): the HOST derives the rigor at the single brief mint (`rigorFor` in `src/shared/rigor.ts`, revised by the captain 2026-09-19 - the captain's `rigor_ask`, then the repository's own `repos.rigor` column, then STANDARD, full stop; neither the intelligence tier nor an escalation moves it - rejecting a result routes a stronger model, never more ceremony; a task with no gate to land through - one whose deliverable is an ANSWER, a review task, or one on the personal workspace - takes NO tier at all (`RigorInput.gated`), and reviewed on a local-only posture ships standard because reviewed ships a PR), stamps it on `WorkShape.rigor` (quiet, like the kind) and appends `renderRigorSection` after the classifier ran; a pre-phase-2 row and a recorded replay spawn read as `quick`.
  `spawn_crewmate review_of` (tool count stays 24) commissions the reviewer: host-briefed (`renderReviewBrief`, read-only by instruction), shape `kind: review` / `kind_source: host:review` (never classifiable, routed like research), titled `Review: <builder>`, its PARENT the builder itself - the one stored review-to-builder join since the `review_of` shape-field fold (captain-approved 2026-09-19; `review_of` survives only as the spawn ask) - and a `blocks` edge reviewer -> builder holds the builder's close while the review is live - refused as text on a branch with no commits, closed or non-crewmate work, or a review already open; since INF-1875 a review is an operation on a change at a version, at any care and reported or not, and Review carefully on a merge card has the app start one itself.
  A `host:*` kind_source makes the row DELIVERY MACHINERY (`TaskService.isDeliveryChild`): it never counts in the children-open close gate (so `proceed_with_open` never speaks for it and an open review refuses no settle), its parent is fixed (`setParent` refuses), and EVERY builder close - discard, drop, supersede, merge, failed turn - retires its live review with it (`TaskClosing.retireDeliveryChildren`: closed dropped/superseded, silent, runtime aborted, worktree gone), so a reviewer never outlives its builder.
  Careful's guidance orders the review BEFORE the pull request (the no-mistakes ordering, captain-approved 2026-09-19): the reviewer reads the commit the builder's working copy has checked out (worktrees share refs; `checkedOutHead`), fix rounds land as local commits, and the push, PR and CI come after the pass on the first mate's word - a builder with a pull request already on record is still reviewed at that commit, not that pull request's recorded head.
  A review task's events bypass the whose-turn sort and go straight to the first mate; a Careful builder's are sorted like any other's, with two typed witnesses a review adds (`docs/report-sort.md`): its findings or blocked verdict wakes the first mate above a card on the captain's screen (row 0c), and the open review keeps the idle ladder from nudging the builder while the reviewer reads.
  The verdict is the typed review record on the reviewer's `report.validation` (INF-1875; `validationReviewSchema`: `code` clear/findings/blocked, typed `findings` with severity and action, `risk` with its why), mapped by `REVIEW_VERDICT_OF_CODE`; nothing is parsed off the report's words.
  A report with no typed record records nothing - a reviewer's acknowledgment is not a verdict (the phantom rounds of 2026-09-19), and no pass is recorded regardless; the record refuses a review that contradicts its findings, so info findings ride a clear review and never block (the no-mistakes rule; blocking = error/warning severity or an ask-user action, `findingsBlock`).
  Findings/blocked leave the reviewer idle and steerable, a pass records verdict, head and risk on the BUILDER's delivery facts as a feed-worthy `review` event, closes the review task silently (done/finished) and wakes the first mate with the builder as ref.
  Risk never holds (Q4); no host hold reads the care's name (INF-1876); `SettleFacts.strip`, `crewStatus` and the context crew lines carry `rigor` and the review state.
  The first mate routes findings by instruction only (contract v3.5): auto-fix findings are relayed verbatim and fixed by the ported fixer preamble (double-check legitimacy, smallest root-cause fix, never revert intent), ask-user findings are ONE decision card per round, which the reviewer raises since INF-4338, declined findings ride the review history the app writes and are never re-reported, and a reviewer is steered only to re-review at a named new head, evidence revision or validation state - never to stand by; since FI3-566 the steps ride the review wakes, and since INF-1876 the preamble rides every findings wake ("The review").
  `tests/e2e/rigor-reviewed.spec.ts` is the binding test.
- The care as a record (delivery rigor phase 3; `docs/delivery-rigor.md` "The record and its holds"): a repository's standing rigor is `repos.rigor` (migration 36; null = derive), set by talking through `app_change project-settings` with `changes.rigor` of `quick`, `standard`, `reviewed`, or `default` (`configure_repo` is retired) or Settings → Projects - the `project settings` feed line names the care only when set.
  The evidence contract was linted at the crewmate card boundary (`lintCrewmateCard` with the task's rigor) until contract v3.6 removed that rule and the rigor option with it (captain lock 3: the card was the third copy of a record the report and the PR body already carried); the five headings stay REQUIRED in the report and the PR body, and the task's holds (the personal workspace, the checks) still speak before the shape rules.
  Reviewer placement (Q5): `Router.decide` takes `avoidProvider` on a review task - the builder's provider off its newest `routing_decisions` row (`Router.servedProvider`) - prefers another signed-in provider at the same tier, falls back with the reason recorded, never descends a tier, and records rule `R9`; the replay scorer keys on `kind_source`, so the new rule id needs no tolerance there.
  Observe's crewmate header renders rigor, review verdict/risk and the reviewed builder; the C5 join carries `review_of`/`review_verdict`/`review_risk`, null on a pre-phase-2 database.
  Contract v3.5 is the no-mistakes alignment above; `PROTOCOL_VERSION` 1.15.0 since contract v3.8 (the `read-only` constraint in the intent vocabulary and `deliverable` on the task detail, over v3.7's `RepoView.kind`, narrowed delivery enum and `TaskDelivery.mode: in-place`).
  `tests/e2e/rigor-reviewed.spec.ts` (repeated re-reviews with no round allowance) and `tests/e2e/rigor-standard.spec.ts` (the card boundary: since v3.6 a drawn body publishing under the host's own buttons) are the binding tests.
- The rigor numbers (delivery rigor phase 4, the last; `docs/delivery-rigor.md` "Numbers"): `scoreRigor` in `scripts/interaction-metrics.ts` is their ONE home, beside `scoreRouting`, so the replay gate and `manifest.rigor` in the corpus export cannot disagree - fourteen rows over `ObservedDispatch` (which gains the rigor, the posture, the PR, `ciRounds`, the cap holds and whether the change's REPORT carried the five headings - the card's body since contract v3.6 no longer carries them, so `reportEvidenceHeadings` is what the share reads) and `ObservedReview`, one row per verdict read off the builder's `review` timeline events (a review task carries no rigor at all: it read a change rather than shipping one).
  Since Task B the row also carries the `deliverable`, and an ANSWER task is out of every rigor denominator - it ships nothing, so it can carry no evidence contract, spend no CI round and hit no cap - reported instead by its own observational share `deliverable_share_answer`.
  Nothing new is written for it.
  Three rules the rows keep: a distribution is `direction: "either"` and graded by nobody (only the evidence share, the two round counts and the cap hits are graded); a denominator is the population that could answer its question, so a fleet that reviewed nothing scores `n/a`, never a clean zero; and a review task keeps only its latest report, so only its newest verdict can be credited with findings - an earlier round's are unknown, not zero.
  `missingEvidenceHeading` (`src/shared/rigor.ts`) is the one order check, over `reportEvidenceHeadings` for a report and `bodyHeadings` (`src/shared/cardHeadings.ts`) for a body, so nothing grades a change by a rule nobody asked for.
  The committed replay fixtures predate rigor: all-quick, zero reviews.
  Observe gains a fifth group, **Review**, listing review tasks with their verdicts (the verdict lives on the builder, read only while it still names that review task).

## Careful live validation

Careful change work uses the builder to gather proof, with first-mate coordination when needed, and its existing independent review as the judge of coverage and proof (captain's accepted INF-125 plan, implemented by INF-100).
The code is reviewed first and the proof runs once, after the code passes, as no-mistakes runs its Test step after its review (captain's INF-2672 direction A): code rounds judge the code and the scenario list and record no proof, each fix runs one focused check of what it changed, and one proof read judges the run before the push.
Quick, Default, answer-only and personal-workspace work, and the local-delivery fallback keep their existing rules.
A change delivered through a pull request keeps its validation records and validation questions at every care, so a raise to Careful mid-task keeps them; the host holds nothing on them, and Careful's guidance is what reads them (captain's INF-994 direction A; INF-1876).
The careful-change skill (`resources/runbooks/care/skills/careful-change/SKILL.md`) carries the contract to both model families, on this computer or a work computer, staged as a runbook skill.
Beside it, `validation-shape.json` is the JSON Schema of a `report.validation` record, generated from `liveValidationInputSchema` by `node scripts/generate-validation-shape.ts`, which `pnpm check` runs with `--check`; the report tool serves the field open, with a sentence naming that file, and the host parses every record with the same schema.
A reviewer runs neither the product nor the tests: it reads the captain's words, the whole changed-file checklist, the scenario record and the kept proof.

Before editing, the builder records `report.validation` with `kind: plan`.
Each scenario has a stable identity, the captain's words it serves, required or supplementary importance, an action, expected result, adverse case, environment, completion signal and the actual product, service or device boundary the claim requires.
A plan revision compares its previous revision and gives a reason; difficulty never silently downgrades required proof.
The builder runs the actual product, using the real service or device when that boundary changes and following the general validation resource consent rule above.
The reviewer treats unconsented sensitive or costly access as a finding, while respecting task-long approval of what a check declares.
A gap acceptance grants no check approval, and a check approval grants no gap exception.
A stand-in names exactly what it leaves unproven; a simulator cannot demonstrate device-specific behavior.

### Check approval

A check that needs the captain's consent under the general rule declares, in its own words, its `resources` (what a run uses or reaches) and `cost` (what one run costs) (captain's INF-1824 plan, direction B).
The approval is generic: it names no sign-in or provider, only what the check itself declares (the captain's written-in answer to that plan).
The builder records a `request` of kind `check` naming the check and binds it to an ordinary decision through `emit_card.validation_request`.
The host appends a Check approval panel naming the check, what it uses and the cost of one run, and saying the approval covers every later run while each run stays inside those.
A card that already asks the captain which account, model or option to use carries the check request on its default action, so the captain's pick or written-in answer with that click approves it, with no separate approval card.
A check approval rests on the captain's consent, either through its own card or through a named current source.
A yes the captain already gave on the work approves a check with no card at all: when the crewmate judges a yes on its Already allowed list covers everything the check declares it uses and the cost of one run, the check request names that yes's card as its `allowance`, or `standing` for the captain's standing override ("The holds" above), whose words are on the same list, or a current captain-origin project direction heard from the captain by its `d:` id (`docs/knowledge.md`, "Heard from the captain").
The host counts an approval only while the very yes it rests on stays on the task's Already allowed list, or remains current as a project direction whose current revision was heard, so taking that yes back, replacing the standing override, or revising or retiring the direction ends it, and refuses an `allowance` that names no kept yes, `standing` when no override stands, or a yes the captain declined the same check after.
An approval an earlier build kept rests on no yes and counts as before.
The reviewer judges whether a named yes's words cover what the check declares; one that does not is a finding.
`TaskService` keeps the approval on the check by its id for every later run and version of the task, including script fixes and reruns, with no limit on runs.
The captain's click on a check's card counts at whatever version the builder has reached while the card waited, so a commit made meanwhile does not void it, as long as the check is still the one the card showed (INF-6250 finding 2); a gap's or an effect's click stays bound to the version it was asked at.
A plan revision that changes the check's declared resources or cost, or removes the check, expires the approval.
A later plan revision that declares exactly the resources and cost the captain approved restores it with no new question, since the captain's answer covers those words; it never restores an ask whose card ended unanswered, or one the captain's newer no to the same words declined (INF-3751).
A record an earlier build left expired with those words declared again heals on its next validation write.
The host refuses a run that executes a check whose declared resources lack a current approval, and a check request that a current approval already covers.
Asking needs no reviewer clearance; the reviewer treats a run that used more or cost more than its check declares as a finding.
A passing run of the same check at the same version that started before its approval counts as proof once the approval is recorded: the builder records that run then, and the reviewer reports the late approval, or a late effect approval for the run that started it, as a consent finding, never as a reason to run the check again, which would spend the approved cost a second time.
The host records a run when it is reported, never when it started, so it holds no clock on this.
The merge card says how many runs each approval covered.
An effect someone else can see keeps its single-use request below.

A `run` reports its unique identity, committed version, scenario revision, completion state, verdict and one observation for every scenario, including those that could not run.
The builder records proof and starts or requests validation effects only from a clean working copy at the named committed version.
Uncommitted edits cannot use the pre-change reproduction exception to skip code clearance.
Pass and fail need execution and evidence; an untested observation names attempted alternatives and a reason.
Go requires completed live proof of each required scenario; its observation has `result: pass`, `live: true` and `unproven: []`.
`unproven` names missing proof within that scenario's claimed boundary; limits outside that boundary go in `reason`, not in a passed observation's `unproven` list.
A real required gap stays recorded; never clear it merely to obtain go.
An observed failure is no-go even with other proof missing; missing proof or omitted coverage alone is inconclusive, and interrupted or unknown work cannot pass.
This distinction applies to the reviewer's live-proof verdict too; code findings remain separate.
The record refuses a review whose verdict the run it judges could not carry, by the same rules as that run's own record, judged against the scenarios the run ran (`verdictContradiction`, INF-3664): acceptance needs the two verdicts to match, so such a review could only stall the change.
A gap the captain accepted is still missing proof, so its run and every review of it stay inconclusive, and acceptance shows the gap as Proceeding without live proof; the refusal of a go says so, and the reviewer's brief says it first.
It is not omitted coverage: the reviewer's brief says to leave its check out of `omitted`, and acceptance reads a review whose only omissions are exactly the ids of required checks left untested under an accepted gap as covering the change (INF-3883); coverage missing with nothing omitted, or any other omission, still goes back to the builder.
The reviewer records its assigned version and evidence revision, code clearance, coverage with omissions, any inspected effect identities, and its verdict and reason.
Code clearance is separate from final proof acceptance.
A missing required scenario goes back to the builder; supplementary gaps remain explained beside the claim.
No-surface means nothing to run, not missing access, and needs the reviewer's reason rather than a live-pass label.

### Kept proof and exact-version gates

`TaskService` alone writes validation plans, runs, reviews and permissions into the existing delivery record.
The existing `report` tool keeps selected UTF-8 `.txt`, `.json` or `.log` transcripts, PNG, JPEG or WebP pictures, and MP4 or GIF recordings with inspected posters through the card-media owner before recording their digests.
It refuses any other kind of file by its extension, before any picture check, and refuses directories; selected text totals at most 1 MB, individual media at most 16 MB, and the selected proof at most 64 MB.
The kept bytes live in the task's cards folder until the task record is purged, not in its seven-day evidence folder.
Delivery rows contain only evidence metadata; validation events contain compact references, never the complete validation history or transcript bytes.
The task record reads only bounded retained text for presentation; it does not read media or re-hash proof on each refresh.
Review and delivery gates still re-read and verify every selected artifact without a cache.
The home verifies incoming proof, gives a reviewer readable copies on its own computer, and rechecks digests at review, completion, publication and the final merge boundary.
A changed transcript or a displayed attachment that does not name the kept bytes is refused.
A kept proof file that is gone comes back from another file in the task's cards folder holding exactly its bytes, such as an earlier run's copy of the same picture; only with none left is it refused as missing, asking for fresh evidence.

The existing review assignment binds the commit, evidence revision, scenario revision and validation-state revision.
A captain-granted gap exception or an effect request recorded after assignment permits re-review at the same commit and evidence revision; no duplicate run is needed.
The state revision advances for changed validation facts and captain answers, not for reviewer judgments themselves.
An old assignment cannot reuse its earlier typed judgment to accept changed facts.
A new commit, including a check repair or an update from the default branch, keeps the proof already run when a review at that commit judges the earlier run and confirms its difference reaches none of the scenarios (`acceptedValidation`); a difference that reaches a scenario reruns only the scenarios it reaches, carrying the others' earlier observations and kept evidence into the new run.
The existing code-review carry still covers an unchanged change; an unavoidable update reviews only its code difference, not the whole change again.
New evidence at the same commit also needs review, without a dummy commit.
The host counts no findings rounds and keeps no allowance or reset for them: each typed review of a version-and-evidence pair is one more entry in the review history.
The current accepted pair is what Careful's guidance asks for before the push, the pull request and the merge card; the host reads it only to attest the pull request (`docs/forge.md`, "No-mistakes' attestation").
Raising care on open work serves the Careful section in the policy notice; lowering care removes nothing from the record.
A reviewer's live-proof judgment stands beside its code verdict in the typed record, and the first mate relays what it says.
Required checks, autonomy and separate merge consent are unchanged.

### Visible validation effects

The builder declares persistence and audience as typed facts; the host never infers them from a command or report prose.
A persistent validation effect visible to anyone besides the captain needs an action-specific captain approval after the reviewer clears its code and effects.
Collaborator-only visibility counts, uncertain visibility asks, and planned deletion is no exemption.
The request binds its version, scenario, action, destination, audience, purpose, lasting effects, cleanup and required access.
The approval question covers exactly that recorded action, not follow-on writes described only in its prose.
Further actions need their own review, request and consent.
A pre-change reproduction still asks; the host checks that the branch has no changed files before accepting that declaration.
The builder binds an ordinary decision using `emit_card.validation_request`, naming the request and its approval action.
Without covering consent, only the captain's exact shown chrome action grants consent; a frame action, revised offer, reviewer verdict or task approval cannot substitute.
If a current captain-origin project direction heard from the captain, a task's standing override or a task-long card yes covers the exact effect, the builder may name its `d:` id, `standing` or the card id in the request's `allowance`.
The reviewer clears that effect only if the named words cover it and the exact code and action pass review.
At the action gate the app rechecks that the same consent still stands, then records its source and consumes the request once, without a card.
The reviewer leaves an effect that falls outside its named consent out of its clearance, with a reason; the builder submits a new request without an allowance for review and a card.
The task timeline records each source and the merge card's private Live validation section counts its recorded runs.
A stale approval refuses through the ordinary unavailable-choice path, shows its card, removes the unusable actions and asks the builder for a fresh request and revised question.

A changed version or effect needs a new request and approval.
For `github_write`, `validationEffect` names that request: the gateway rechecks it when sending, including a previously kept write, and consumes it before the call.
Other actions record `effect-state: started` before execution and an evidenced outcome afterward.
An uncertain result stays unknown and is reconciled, never repeated.
Existing write-approval and browser-handoff boundaries still apply.
The task's own pull request, ordinary checks and attachments are delivery rather than validation.
A prerequisite publication uses its own exact-action card, not an `allowance`, and names this task's project and branch; the opening guard consumes its permission and opens a draft where supported, without granting final proof or merge.
After proof a review accepted at the current head and a passed review cover it, the host marks that draft ready through the forge owner: GitHub's private GraphQL mutation or GitLab's removal of the `Draft: ` title prefix, never `github_write`.
The prerequisite publication permission remains tied to the task's project and branch; later commits need their proof accepted at their own version, not another publication permission.
A later ready reading settles an unknown readiness result as applied; a later still-draft reading settles it as not applied and permits a new idempotent readiness request.
Overlapping readiness attempts do not send concurrently, and readiness failures never replace or prevent check readings.
Readiness recorded as applied for a change number and head stops further readiness requests for that version, preserving a person's later return to draft; a newer commit still needs its own accepted proof and review.
Unrelated drafts remain the captain's to change; this reconciliation rule does not permit repeating an unknown validation effect or publication.

### Required proof that cannot run

After safe alternatives fail, the builder first records a `run` at the current version and scenario revision with verdict `inconclusive` and the affected scenario `untested`, not live.
That observation names the attempted alternatives, `missingCapability` and `reason`.
Only then does the builder record a `request` of kind `gap`, matching that scenario, missing capability and reason in the latest run; a request before the run is refused.
The builder promptly asks through the same decision binding, giving the alternatives and their results, and ways to close the gap.
Every gap of one version goes on one card: `validation_request` names one request and the rest in `gaps` (captain's INF-1824 plan).
The builder addresses the captain as “you” in the gap record and its card, never “the captain”.
The host appends a send-style panel whose open line names the approval button and untested scenario, followed by the exception's scope and that it records no live pass and merges nothing.
For several gaps the panel is one checklist instead: a fieldset of checkbox rows, one per gap, each starting unticked, with a Check all control, all reachable by Tab and Space.
The approval action accepts exactly the ticked rows and keeps the rest held; a checklist names only gaps of one version, and its card carries no script or field of its own, so the ticks are the captain's alone.
The rows are one required question, so the card holds its main button until a row is ticked, and the core refuses the approval action with no row ticked and records no decision, whichever button carries it.
A closed “The recorded gap” disclosure holds the version, missing capability, reason, alternatives and remedies, with each alternative and remedy in its own list item.
The Validation action panel for effects stays fully open and unchanged.
Only the captain can permit proceeding without this proof; neither the builder nor reviewer grants an exception.
The exception is kept by the check's id: it stays accepted through rewording, plan changes and every later version of the task.
It ends only when that check runs and fails, or leaves the list of checks; the host refuses a second gap request for a check whose gap stands accepted.
Once the missing access arrives, the builder runs the check without asking; a change that widens what a check must prove is a new check with a new id, and the reviewer judges whether a rewording under the same id still claims the same thing.
It never covers a known failure, failed checks or a merge.

The merge merge card is the primary presentation of live validation.
A version-2 saved story pairs visual evidence in Before and after; its typed Checked facts name what the builder exercised, what happened, and what the independent reviewer checked without rerunning it.
A missing proof, stand-in or accepted exception stays in the same visible result, not only under Not done; a check mark never turns missing proof into a pass.
Other merge cards present those results and evidence in After.
The captain need not visit the task record to understand what was and was not demonstrated.
Commands, supporting transcripts and detailed observations sit under How it was checked or equivalent disclosures.
The existing task record retains Live validation as supporting history under Details, with scenario disclosures and kept evidence reachable by pointer or keyboard.
Its accepted labels are Demonstrated for this version, No running surface and Proceeding without live proof.
Awaiting live validation appears only for an approved early publication that is still waiting for proof.
Selected evidence and captain answers survive restarts with the review and repair records.
