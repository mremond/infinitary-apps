The now panel: what IS, as the `Now` panel of the right side rail (the activity feed on the left says what happened).
When expanded, it has no waiting/working counts line: the host title row carries the panel's two header buttons, a dim search icon and the Open task board icon, beside the title and collapse button (`components/panel/Panel.prompt.md`, "Header buttons").
Their accessible names and tooltips are "Search tasks" and "Open task board".
The list starts below that row with rows for "waiting on you", "working" and "queued", and two collapsed groups that show only their count until clicked: "backlog", "done · 7d".
The order is nearest to happening first: waiting on you, working, queued, backlog, done · 7d.
Queued is open work that starts by itself when nothing holds it (start policy when ready), and a task that is starting until its crewmate begins; backlog is open work that waits for the captain's word (start policy on request).
A blocker or a hold never moves a row between them: it is the row's one dim word and its status reason.
The task board opened from the panel (`TaskBoard.prompt.md`) names its row and columns with the same five words.
Empty groups are absent.
When collapsed, the host header draws what the panel says it holds, `N waiting · N working` (`Panel.prompt.md`, "The collapsed summary"), and Open task board beside the chevron; Search tasks is drawn only while the panel is expanded.

Waiting on you means a live task has a reachable ready decision: `waitingCardId`, not the broader `flags.needsYou` attention flag.
Hidden replies, Working cards, ordinary notes, no-card holds, dead dependencies and closed tasks do not create a waiting row or compact count unless they have a minimized card.
A ready decision behind another card counts because its task can bring it forward.
Count each task once.
A waiting child separates into Waiting on you while its nonwaiting parent and siblings keep their existing working grouping; do not duplicate parent context or add row decoration.
Working lists a working task's live tree beside it: its parent and the parent's other open parts.
A finished part - a done review, plan or piece of work - stays under done · 7d, never in Working, and finished work does not hold a tree together.

A row is a shared task status mark, the task key in dim mono at the start of the title, and the title (one line, ellipsized); the row names neither its project nor the computer that runs it, so the title has the row's width (the captain: the right side was noisy, and the computer's name is not important there).
The key's prefix says the project, and the row's summary names both.
Only while the task's computer cannot take work does the row end with why, in dim mono: `out of reach` or `takes no new work` in `--warn`, `connecting` in `--fg-3` with no warn mark while its connection is being made, `updating` in `--fg-3` with no warn mark while Infinitary there is updated, and `catching up` in `--fg-3` with no warn mark while it is connected and the app is still catching up with the task, its time left to the status reason the row's summary shows (`../devices/RunsOn.prompt.md`).
Those words name no computer; their track is `auto`, as wide as they are, so a long title gives way and never cuts them, at every panel width.
Count from the full board, not the visible-task filter.
Only an unstarted row in the Queued section adds one quiet mono line below its title: what it waits for and since when, supplied by the home and shared with the first mate.
Backlog keeps its compact row without that extra line, since it normally waits for an explicit go; the task's record and first-mate reads retain the wait fact.
The Queued line wraps without ellipsis, and carries no control or new status.
The row keeps the full project name and where it runs in its accessible label; the preview shows them, and the row has no hover title.
A blocked or held row, or working one waiting on its checks, carries exactly one dim word after the title; a child row indents under its parent when both belong to the same group.
The task key also stays on hover, search, and the row locator.
The shared mark, word and reason follow the Shared task status rule below; group membership is not a status.
Nothing else in the rail: no chips, models, or ages, and one meter only, a collapsed task's parts bar (Parts, below) - everything richer hides behind a rest (the crew summary, Row hover below) or a click (the record).

```jsx
<NowPanel counts={{waiting:1,working:2}} groups={{
  waiting:[{id:"a",key:"FM3K-12",projectName:"infinitary",title:"Which project should take this?",group:"waiting",tone:"ok"}],
  working:[{id:"b",key:"FM3K-9",projectName:"infinitary",title:"Refactor the auth middleware",group:"working",tone:"warn"},
           {id:"c",key:"FM3K-10",projectName:"infinitary",title:"Add the retry test",group:"working",tone:"ok",depth:1}],
  queued:[{id:"d",key:"FM3K-11",projectName:"Scratch",title:"Publish the release notes",group:"queued",tone:"ring",word:"blocked"}],
  backlog:[{id:"e",key:"FM3K-13",projectName:"infinitary",title:"Write the release checklist",group:"backlog",tone:"ring"}]
}} onOpen={(t)=>openRecord(t.id)}/>
```

Clicking a row is a pointing gesture: restore put-aside cards, then show its waiting decision, deferred required action, newest showable card or record (`TaskRecord`), in that order.
Newest means when the card was put up, not revised; off-stage and ended cards do not count.
A card already in front stays there, and a held card comes forward without a task lookup.
One entry per task can remain open; each row reads selected while its record is open, even when paged away (FI3-309, replacing the gutter pane).
Open task board in its header shows every task at once on the stage (`TaskBoard.prompt.md`).
The panel's buttons that change a task are a backlog row's Start and every row's pin (below); it has no drag, no inline editing and no manual create - the record's action bar carries Drop task and the one next step (`TaskRecord`), and every other write happens by talking to the first mate.
The filter (a key/title search and project chips) sits behind the search icon; its words are the panel's own state, and its project chip is the window's project focus, the same as the top bar's project pill (`components/core/ProjectFocus`).
While the window is focused on a project the panel lists only that project's tasks, the filter closed or open, and its collapsed summary counts only them.
Close search sits 6px right of the field: a 24px icon button with Lucide `x` at 14px in `--fg-3`, the next stop after the field, labelled "Close search" with the key Esc.
Search tasks still opens and closes the filter, and Find a task (⇧⌘F) still opens it with the caret in the field.
Esc in the filter empties the words, and a second Esc closes it, as the task board's Find does.
Closing the filter by Close search, Esc or Search tasks lets go of the words, so every task of the focused project shows again; the project focus stays until All projects, the top bar's pill or Show all projects lets it go, and a closed filter's words never narrow the list.
The field draws no clearing cross of its own: Esc and Close search do that job.
The filter keeps the reach of the focus ring's glow (18px) clear on every side, because the panel's frame cuts whatever is drawn past its edge.
The search ignores case and reads a curly apostrophe or quote in a title as the plain one a keyboard types, so `what's new` finds `What’s new in …`.
Chips keep the project key as the filter handle; row chrome uses the display name.
Group headers are the design system's micro labels; a collapsed group's header carries its mono count (the two open groups are already counted on the header line).
Queued and backlog also count crew-filed rows the captain has not opened, as ` · N new` beside the count, and such a row's one dim word is `found on <key>` unless it is blocked or held.
A collapsible header ends with the host panel expand chevron: the same 14px down stroke the rail uses to collapse a panel, in `--fg-2`, turned 180° so it points up while the group is collapsed and down while it is open.
In the app this is a Tier-2 frame template (`src/renderer/src/plugins/builtin/now/`), not this JSX; the look is the same, and with nothing to show there is no panel and no rail.

## Parts (INF-3823)

The captain's words: "allow parent tasks that have children nodes in the tasks panel to be "collapsed". ideally, after collapsing, we can see the progress of the overall parent like how many steps are done, not losing visibility", with direction B, count and bar.
A task with parts ends its row with how many are finished and how many there are, in dim mono on its first line, `3/7`, collapsed or expanded; it is the one place the panel shows a task's finished parts beside it, since finished parts list under done · 7d.
The count reads every task filed under it, reviews and dropped ones included, a dropped one counted as finished, as the app counts a task's parts everywhere (the captain's answer "Every task filed under it, reviews and dropped ones included, as the app counts today"); only its direct parts count, never the parts of its parts.
A row with rows listed under it in its group adds the host panel expand chevron after the count, the same 14px stroke as a folding group's header, in `--fg-2`, pointing down while expanded and up while collapsed.
The count and the chevron are one button, 2px in from the row's right end, with a `--bg-2` surface on hover; a press collapses or expands the task, and its accessible name and rest label say what a press does, `Collapse FI3-12's parts` or `Expand FI3-12's parts`, with its state as expanded or not.
A row with a count and nothing listed under it shows the count alone, with no button.
The row's words keep clear of it, and the row's Start and pin show to its left on rest.
The row's accessible label adds the count in words, `3 of 7 parts finished`, and `parts collapsed` while it is collapsed.

Collapsing hides every row listed under the task in its group, at any depth, except a part that waits on you, which is never hidden: it keeps its row and its indentation under the collapsed task (in Pinned, where parts list under their parent whatever their state).
A collapsed row adds a bar under its title, 3px tall, 2px below the title and 1px above the row's edge, from the title's left edge to the row's right: one segment per part, 2px apart (1px past 30 parts), each with a 2px radius - finished parts first in `--fg-3`, then each open part in its order, working now in `--warn`, waiting on you in `--accent`, and the rest as a `--line-2` outline.
A part the board does not list reads finished when the count says so, otherwise not finished.
Resting on a segment rests on the part it names (INF-4147, the captain's words: "when my mouse hover onto the segments in the progress bar, it should count as hovering over the task that segment represents"): after the row's usual beat that part's crew summary opens level with the row, and the part is lit everywhere a rest lights a task, its crewmate on the stage included.
Every segment names its part, the finished ones in the order they closed, oldest first, and the open ones as the board lists them; a segment that names none (an older home that sends no finished parts, or a count the board cannot match) keeps the task's own summary.
Each segment's rest target is its own width plus half of each gap, from 2px above the bar down to the row's bottom edge; moving to another segment moves the summary at once, and moving onto the rest of the row brings back the task's own.
The rested segment grows from 3px to 5px tall, its bottom edge where it was, and nothing else moves.
A click on a segment that names a part opens that part exactly as a click on its own row does (INF-4172, the captain's words: "clicking on a hoverered segment in this progress bar should behave just like a click on a task row that's the task the segment represents"): its waiting decision, deferred required action, newest showable card or record, by the same pointing gesture.
A click anywhere else on the row, a segment that names no part included, opens the task itself, and Enter on the row opens the task too; leaving the row, Esc or a press lets the summary go, as for any row.
The keyboard keeps its way to a part: → opens the task's parts, and ↓ rests on each one.
Nothing starts collapsed (the captain's answer "None.
Everything starts expanded as today, and a task stays collapsed once you collapse it."); a collapsed task stays collapsed across restarts, kept in the panel's own store, until it is expanded or leaves the board.
Typed words in the filter show every match, a part under a collapsed task included, and leave what is collapsed as it was.
Group counts and the collapsed summary still count every task; a blocker line to a hidden row is not drawn, as for a folded group.
A row focus rested on that a collapse hid hands focus to the collapsed task's row.
Command search offers `Collapse all parts` and `Expand all parts`, with no default key.
The phone keeps its own list; it follows in a later piece.

## Start on a backlog row (INF-1663)

The captain's direction A on INF-1662: while the pointer rests on a backlog row, or the keyboard's focus is on it or its Start, a small secondary button reading `Start` shows over the row's right end, just before the row's pin (Pinned, below), which sits 4px in from that end.
It is the row's sibling, never inside the row, so the row stays one button that opens the record and nothing moves on rest.
It is 22px tall, `--text-sm` medium in `--fg-1`, with a `--line-2` hairline border on no surface of its own, and fades in and out over `--dur-fast`; its border brightens to `--fg-3` on hover.
The row keeps its rest look under it, `--bg-3` while the pointer is on the Start too; the title fades out before the Start's left edge, as wide as the Start is, and the trailing reach words hide.
One press runs the record's own Start (`tasks.run` with `start-task`) with no question, so the row moves to Queued as starting and to Working when its crewmate begins.
A row whose start failed reads `Try again`, as the record's bar does.
A row that cannot start - blocked, or one whose parts do the work - shows the Start dim (`--fg-3` on a `--line-1` border), still reachable, with the record's reason on rest (`useRestLabel`); held work on request starts, as its record's Start does.
A press the app refuses dims the Start with the app's words until the row changes.
Only backlog rows carry it; queued rows start by themselves, and the task board keeps its own Start, which asks once.

## Pinned (INF-3127)

The captain's words: "when a task is pinned, it always show in a "pinned" section in the tasks panel at the top, no matter what state it's in".
Pinned is the panel's own first group, above waiting on you, under the same micro uppercase label, `pinned`, with no count and never folded; it is absent while nothing is pinned.
A pinned task lists there, whatever its state or age, done and dropped work included, and leaves its own group.
Its parts, and theirs, move there with it (INF-3512, the captain's words: "when pinning a parent task, i think all child tasks should move with it into the pinned section (only at presentation layer, child tasks aren't really "pinned" in their data)"): each lists under it, indented as a part is in any group, by priority then age, and leaves its own group.
A part that moved there is not pinned: its pin stays an outline, and pinning or unpinning the parent writes nothing to it, so unpinning the parent sends each part back to its own group.
Only parts some group would list move; a dropped part lists nowhere, as before.
A finished part stays in done · 7d unless it is pinned itself (the captain's words: "in the pinned section of the tasks panel, we should not show already completed children that aren't pinned themselves"), and its own open parts move up in its place.
A part pinned itself lists once, under its pinned parent, and at the top level of Pinned once its parent is unpinned.
The top-level rows keep the order they were pinned in, newest last, each reading as every other row does: the mark, the key, the title, the one dim word and the trailing words.
A pinned task that waits for a free crewmate keeps its dated wait line, and a pinned backlog task keeps its Start.
A search narrows Pinned like any group; a part whose parent the search hides moves up in its place.

Every task row carries a pin button that shows on the row's rest or focus, the same 22px square hairline button as the Start, 4px in from the row's right end and after the Start where a row has both.
It is the Lucide pin icon (`PinGlyph`), 14px at stroke 1.5 in `--fg-2`, with no text: an outline while the task is unpinned, and filled in `--fg-1` while it is pinned.
Its accessible name and rest label say what a press does, `Pin FI3-12` or `Unpin FI3-12`, and it reports its state as pressed.
One press pins or unpins at once (`tasks.pin`), with no question; the row moves into or out of Pinned when the board does.
The keyboard reaches it as it reaches the Start: → from a row goes to the row's first button, ← and → move between its buttons, ← from the first goes back to the row, and Enter or Space presses it.
The task board's tile menu offers Pin or Unpin (`TaskBoard.prompt.md`), and the task record's header carries the same pin button beside its corner (`TaskRecord`).
The first mate pins and unpins a task on the captain's words (`update_task` `pinned`), and the record's Activity says it was the first mate.

## Earlier work in the filter (FI3-579, piece 3)

Typing in the filter also searches work the panel does not list: closed work older than seven days, and dropped work of any age.
Matches are by key, title and goal, never by card or report text.
Nothing earlier is listed until text is typed; clearing the field removes the group at once, and the normal groups (and their seven-day window) are unchanged.
Matches appear as one more group labelled `earlier` after `done · 7d`, open (it exists only while text is typed), with the same row, status mark and accessible label as any row, newest closed first, at most 50.
A row follows the same card-first rule as any row, including an answer or decision record the first mate owns.
The project chips narrow earlier matches like any others; a query matching nothing shows no group.
The panel stays read-only: this is a pointing gesture, never a write.

## Shared task status (FI3-565, direction A, piece 1)

All task rows, crew summary heads and record pills read one lifecycle status and mark.
Their shared base reason remains unchanged for lists; the permitted desktop details reconcile structured waits as described below.
A row, a board tile, the summary and the record header do not add a second tooltip for that status, because the words are already shown; a standalone mark still names itself.
The words are Backlog, Queued, Starting, Working, Idle, Interrupted, Waiting on you, Done and Dropped.
Starting is the still open cyan ring, used only while a start is being prepared, and it is not Working.
A confirmed start that did not begin, whether you started it or the queue did, reads Backlog · Could not start, and the Tasks row adds the dim word could not start.
Open work reads by its start policy, as the panel groups it: Backlog waits for Start, Queued starts by itself.
A blocker, a hold or a parent's parts is the reason beside the word, never another word: `Queued · Blocked by another task`, `Queued · Held`, `Backlog · Its 2 parts do the work`.
Open, working or idle work whose computer is out of reach keeps its mark's shape in `--warn` and reads `Idle · Mac mini is out of reach`; while its connection is being made it keeps its mark as it was and reads `Idle · Mac mini is connecting`, with no warn mark; while Infinitary there is updated it keeps its mark as it was and reads `Idle · Mac mini is updating`; while it is connected and catching up it keeps its mark as it was and reads `Idle · Catching up with Mac mini since 12:57 PM`; in each case, unless a blocker, a hold or its parts give the reason (`../devices/RunsOn.prompt.md`); Interrupted, Starting and Waiting on you keep their own.
Keep rows otherwise minimal.

### Naming a wait (INF-38)

A started crewmate idle on other work names it as its reason: `Idle · Waiting on INF-12`, or `Idle · Waiting on 2 tasks` for several, so no one key stands for the others.
When it waits on one task, the reason also says where that wait stops (INF-5578): following each task's own lone wait to the last one, it names that task and its hold, as `Idle · Waiting on INF-12 · INF-9 waits until Nov 21, 12:00 PM`, `Idle · Waiting on INF-12 · INF-9 waits for an app update`, or `Idle · Waiting on INF-12 · which waits on INF-9`; the one task's own hold reads `Idle · Waiting on INF-9 · it waits until …`.
A review that has answered, whose change is still open, waits on that change the same way, `Idle · Waiting on INF-12`, rather than reading as no continuing work; one that has not answered yet keeps its own reason.
The Tasks row, which shows no reason, adds the dim word `waiting`; its margin arrow points at what it waits on, and its summary names each one.
A kanban tile uses grouped wait names and the earliest recorded event in its existing status area, with no separate recorded-since line; when its one wait's line goes further or ends in a hold, it names where that line stops instead of the event, wrapping in the column; list rows and older homes keep their previous presentation.
The summary's Blocked by row lists every standing blocker by its key alone (INF-2528); the task card names its unknown end time and its recorded-since date where known, in the viewing computer's zone.
The time is when the wait was recorded - the edge's own time or a dated declaration, the earliest when several name one task - never when work stopped; an unknown time is left out, never guessed.
A ready decision that settles with a merge reads `Waiting on you · Waiting for your merge`, from the typed merge fact alone; other ready decisions keep `A decision card is ready`.
Paused for access, Background work is unknown and No continuing work keep their own reasons.
The stage beneath a crewmate shows none of these words.

Marks occupy a fixed 12px square, using a 16-unit viewBox: Backlog is a hollow circle, Queued adds a central dot, Working/Idle/Interrupted are filled circles in ember/cyan/lava, Waiting on you is an accent dot inside an accent ring, Done is a neutral check, Dropped is a tertiary cross.
Working on a background wait is a dot inside a dashed accent ring, the stage's wait ring (captain's INF-676 direction A and INF-1777 answer); the dashes keep it apart from Waiting on you's full ring.
The dot is the accent while it waits on checks (`Working · Waiting for checks`) and ember while it waits on local work it left running (`Working · Background work continues`).
It stays Working in the Working group, and a checks row, which shows no reason, adds the dim word `checks`.
Starting is a still open ring, cyan on the arc and neutral on the rest, with no spin.
Shape carries lifecycle, not just color.
All three surfaces use these same marks without animation.
Tooltips and accessible labels say the status followed by its reason.
The summary shows the status's own short reason, the Tasks row's, and never a wait's recorded time (INF-2528), except that a lone wait names where its line stops and that task's hold, its time included (INF-5578, kept by the captain since the Tasks row shows no reason); the record shows a distinct reason beside the status, omitting a generic wait reason only when its typed source appears in its existing Checks or hold fields; posture phrases never become extra statuses.
Closed lifecycle wins over old activity; a reachable ready decision wins over activity on live work; evidenced continuing work wins over interruption, otherwise interruption wins over idle.
Unknown or paused posture stays Idle with an honest reason, never Working.
Stage geometry and color remain unchanged.
The action bar follows in a separate piece.

## Shared task facts (FI3-565, direction A, piece 2)

The crew summary and the task record read one set of task facts: status, task, Now, Progress, then the fact strip - model, intelligence, reasoning, the change, its checks, a review - with the model's reason under it, and the browser.
The summary draws them in that order, leaves the browser out, and adds a Project row under Task from the Tasks row's own project name, followed by where another computer runs it (`website · on Mac mini`).
Its fact strip is one row (INF-2528, the captain's direction B: "the preview should remain concise and only the most critical information"): MODEL, the name alone, DIFFICULTY, the task's own level as its `SlotBadge`, then PULL REQUEST, the change's label with its checks as one state and its time (`#813 ○ running for 11m`, `passed in 14m`, `failed after 9m`); with no change the second cell is CHECKS.
The row never wraps: a long model name gives way first, down to its label's width, then a long branch name, each ending in an ellipsis with the whole name on hover; a review's verdict takes a second row.
Reasoning, the footnote, the check counts, a refusal's reason, how long ago the checks finished and each watch's next read are the record's alone; a check the app cannot read keeps the warning dot and says `cannot read all checks`.
The status, the task title and the project wrap in full; other summary facts stay one line.
The task record's Info tab is shaped like the summary (INF-2261): its relations as rows of keys and the goal with the captain's words folded under it lead, then Project, Now, Progress and the browser line, then the same one row of facts the summary ends with, grown by what the record adds - REASONING and REVIEW cells, DELIVERY, RUNS ON, a dim mono USE and a RUN cell - with the footnote under it, then a closed More row (`../cards/TaskRecord.prompt.md`, "The Info tab").
The summary itself does not change.
A smaller surface shows fewer of them, never different ones; the Tasks row stays a mark, key and title.

- **Now** is the crewmate's own newest doing: its own newest row of Activity (an opened pull request, a checks reading, a report's headline, a progress note), or when newer the description of its newest command, read, edit or search (Activity's plain reading when it gave none) or the sentence it last wrote, never a message the app sent it, a compaction or the start line once it acted (`docs/task-record.md`, "The Now line").
  It reads in those words, with that doing's short age (`now`, `2m`, `3h`, `1d`, mono `--text-xs` `--fg-3`) at the line's right edge and the absolute time on hover.
  Where its words name the task's pull request, the record links them (`../cards/TaskRecord.prompt.md`, "Pull request links"); the summary keeps them plain.
  Absent when the record has no row; a crewmate that did nothing since a message reads its last doing at its true age.
- **Progress** (FI3-734, the captain's Build it on the steps-view preview) is the plan the crewmate reported last with a progress note: a short, high-level list of what the task takes, each item done, current, next or skipped, as declared.
  Its label is `Progress`, so the side label column is 66px on both surfaces.
  A note that carries a list replaces it whole; one that omits it leaves the last list standing.
  The words are the crewmate's, of any length and count: the surfaces cut what they cannot hold, and the record lists every item whole.
  The line’s right edge shows the newest list note’s short age, in Now’s mono `--text-xs` / `--fg-3` style, with its absolute time on hover.
  On the summary it is one line - the count in mono (`2 of 4`, then `· 1 skipped` when any item was) and the full name of the current item (`All done` once none is left), cut with an ellipsis at the line's end with the full name on hover - and under it, 8px lower, one dot per item on a line across the panel: filled `--fg-2` when done, an `--accent` ring on `--accent-dim` when current, a hollow `--idle` ring when next, a `--fg-3` dash when skipped, the line `--line-2` and filled in `--fg-3` behind a finished dot, and the item's short label (`--text-xs`, the current one `--fg-1` medium, finished ones `--fg-2`, the rest `--fg-3`) centered under its dot, cut with an ellipsis, the full name on hover.
  Past eight items the finished ones before the newest finished one fold into one filled dot labelled `6 done`, their names on hover; a line that still holds more than eight dots staggers its labels above and below the line, each allowed two slots.
  The line holds twelve dots: past that, the items after the current one fold into one last dot labelled `4 more`, a hollow ring (filled when every one of them is done), their names on hover; the current item always keeps its own dot (`clipPlanLine`).
  On the record it is the same line, then the whole list under it, always open: one row per item with the list marks (a check, a lit ring, a hollow ring, a dash), a `--line-1` hairline behind the marks, the current item in `--fg-1` medium, a finished one with the short age of when it finished at the right edge, a skipped one followed by the dim word `skipped`; past eight items the same finished ones wait behind `Show earlier · N`, as Activity's do.
  Absent when the crewmate never sent a plan; a closed task keeps its list on the record and its summary draws none.
- **The fact strip** (FI3-1159, the captain's layout B) says a task's facts in the same dot and words on its record, its summary and its merge card, whose foot arranges them as a status line (`../cards/ResponseCard.prompt.md`): one cell per fact, each an uppercase micro label over a one-line value 5px under it, the cells `--space-4` apart, wrapping whole with `--space-2` between rows, under a `--line-1` hairline with 10px above and below it.
  On the record its cells, in order: MODEL, DIFFICULTY (the level the task's routing asked for, as its `SlotBadge`), REASONING (in words); then PULL REQUEST, the change by the label its host gave it (`#612`; BRANCH and the branch's name on a plain Git host), a link where the host has a page and the surface takes clicks, with its checks in the same cell (CHECKS when there is no change): the merge card's 10px state dot and word (`running`, `passed`, `failed`, `not read yet`, `merged outside the app`) with how long the checks have run or took by the host's own times (`running for 15m`, `passed in 14m`, `failed after 9m`; whole minutes, `under 1m` at first, `1h 05m` past the hour), and once they finished how long ago after a `·` (`5m ago`), the start and the last reading on hover (`Started 9:01 PM · read 9:13 PM`); checks that have not started, not read yet or merged outside the app show no time; and REVIEW, an independent review's dot and verdict (`passed`, `findings`, `blocked`) with its risk (`findings · risk high`).
  A check-read refusal keeps its reason readable inside the record's Checks cell, wrapping without overflowing the surface; it uses the warning dot unless a reported failed check already gives it the failed mark.
  It shows no running duration: an unreadable reading does not say that a check is still running.
  Under the cells comes the footnote saying why that model was chosen (`--text-xs`, `--fg-3`).
  A value the record cannot say leaves its cell out; the strip is absent until the task has a model, a change or a checks reading.
  A closed task names its change once, on its closing line, so its strip keeps only the review of the change.
  Every surface names a model through one lookup: its Settings → Models name, listed or by name, with a known OpenRouter maker prefix dropped, else its bare id.
  The label is "Model" wherever a model is a fact.
- **Browser** is the task's own browser on this computer, on the record only (`../cards/TaskBrowser.prompt.md`): the site, who is driving or what stopped it, and `Open`, parted by `·`.
  The summary leaves it out, and it is absent while the task has no browser and on another computer.

Ages beside a fact are short (`2m`); a sentence keeps `2 min ago`.
Facts carry stable identities (`data-task-fact`), never their labels' words.

## Row hover (FI3-565, direction A, piece 3)

Resting the pointer, or the keyboard's focus, on any Tasks row - backlog, queued, working, idle, interrupted, waiting on you or done, and a row the filter found in earlier work - opens the crew summary (`components/mate/Crewmate`, Reading a crewmate) for that row's task: the same panel, the same shared facts in the same order and words, after the same beat (130ms).
The row gains nothing: it stays a mark, key and title.

### The lit row (INF-237)

A rest on the same task anywhere else - its crewmate on the stage (the pointer or a focused name), a task key in a card, a thread, a title, the record, Activity, Knowledge or Settings, a board tile - lights its row at once, with no summary and no beat.
The row takes exactly its own hover look: the `--bg-3` surface, and its blocker lines in `--accent`.
It moves nothing and scrolls nothing: a row out of view stays out of view.
It clears the instant the rest ends, and the row's own `--dur-fast` background transition rides it (a cut under reduced motion).
One task is lit at a time, the last rest winning.

## Blocked by (FI3-1680)

Recorded blockers also draw as quiet lines in a 36px gutter to the left of the rows, in addition to the rows' own padding.
The gutter appears only while a line is drawn.
Each line runs from the waiting row to its blocker, and the arrowhead sits at the blocker: that task finishes first.
Lines use `--fg-3` at low opacity.
The row the pointer or the keyboard rests on lights its lines in `--accent`.
One lane per blocker, at most three.
Further blockers draw only while one of their rows is inspected, and the summary still names every blocker.
A folded group, a filtered row, or a row clipped out of the panel draws no line to that end.
The summary names that key instead, and the key opens the existing record.
Order, groups and parent indentation stay as they are.
Resting on a row still does not slow the stage.

- **Placement.**
  Outside the Tasks panel, on the side facing the stage (left of a panel in the right rail, right of one in the left rail), 14px clear of the panel's edge, centred on the row.
  It stays inside the window under the top bar with 8px of air, and clear of the input and the other rail's panels: where one is in the way it rises above it, and where that side has no room at all it takes the other side.
  A `--line-2` hairline runs from the panel's edge at the row's middle to the summary.
  No corner brackets: the row's own hover surface (`--bg-3`) marks it.
- **Layer.**
  Above the rails and the card stack, never under them, so it reads the same with a record open.
  It never takes the pointer.
- **Moving and closing.**
  It comes and goes as on the stage (`components/mate/Crewmate`): resting on another row while it shows moves it there at once, with no second beat.
  It fades out over `--dur-summary-out` when the pointer or the keyboard's focus leaves the row, on Esc, on a press on the row, when the list moves under it (a scroll, a row arriving or leaving), when the window resizes or loses focus, or when the task leaves the list.
  Leaving another row closes nothing: focus leaving the row a click opened keeps the summary of the row the pointer rests on, and Esc then closes that summary, never the record under it.
  After Esc or a press it stays closed until the pointer leaves that row.
  Esc closes only the summary, never a record open under it.
  The press still opens the record or brings the decision forward, exactly as a click did before.
- **The stage is untouched.**
  Pointing at a row selects no crewmate, pauses nothing and slows nothing; a working row's crewmate keeps its orbit.
- **The same summary from a card.**
  A task key anywhere the app shows one opens this same summary (`../core/TaskKey`), and a click on the key opens the task's record.

## Keyboard

The list is one Tab stop, and the arrows move through it (the app's `docs/keyboard.md`, "Lists and Settings").
The arrows ↑ and ↓ move between the rows and the headers of the groups that open and close, Home and End go to the ends, → opens a closed group and steps into it, ← closes an open one and goes up from a row to its header, and Enter opens the row's task as a click does.
On a task with rows listed under it, ← collapses it and → expands it before anything else; from a part, ← goes to the row it is listed under, and from there on as before.
On a backlog row, → moves to its Start, Enter or Space presses it, ← goes back to the row, and ↑ and ↓ move on as from the row; the Start is no Tab stop of its own.
A task that starts from there moves to Queued, then Working, and focus follows its row.
The header of a group that is always open is a label, not a stop.
In the search, ↓ goes to the first match, and F6 brings focus to the row it was last on.
Closed from the keyboard (Esc, or Enter on Close search), the filter gives focus to the list's stop, the row it was last on.
Focus is the `--focus-ring` hairline and glow, drawn over whatever the row paints: a row whose record is open keeps its `--accent-dim` tint, so focus and the open task never read as one.
A row and a group header span the panel's frame, which cuts whatever is drawn past its edge, so each draws it inside its own edge (`--focus-ring-inset`).
A focused row scrolls into view, and opens its summary as the pointer's rest does.

## Minimized cards

A minimized card keeps its task’s own row under waiting on you, without an added word; even a note on finished work does so.
A taskless minimized card has a row titled by the card.
Click or Enter brings back that task’s minimized cards with keyboard focus at the default card size.

## Recorded wait details

Only desktop task cards enrich their existing fields with the optional structured wait projection; the hover preview keeps its short status and blocker keys (INF-2528), its status naming where a lone wait's line stops (INF-5578).
Checks owns every named watch schedule; Blocked by or the existing hold explanation owns dependencies and their recorded dates.
Remaining check-backs and holds replace the existing header reason; no generic Wait section or extra badge repeats them.
Suppress a generic reason only when its typed source has another owner in that view; keep failure, interruption and access guidance.
Unknown end times remain unknown, and a past event says was due rather than resumed.
The Tasks list and board list rows retain their existing status, words, density and behavior.

## Batch gate

A task whose offered version has a pending batch status keeps Working, with one dim word `batch` after its title and a dot between two accent arcs in place of the checks dashes.
Its shared status is “Working · Waiting for the batch check”; the mark stays still whether the batch waits, runs or is paused.
Queued still means unstarted work that starts by itself, never a pull request in a batch.
