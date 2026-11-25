# The project focus

The window can be focused on one project, so the captain sees that project's work while the rest keeps running.
One focus serves every surface: the top bar's project pill, the Tasks panel's project chip and the task board's chip are the same choice (the captain's answer to INF-1091).
How the pill looks and moves is the design skill's `components/core/ProjectFocus.prompt.md`.

| Piece | Where |
| --- | --- |
| Which projects get a pill, what each counts, which saved focus holds, and the tail's count | `src/shared/projectFocus.ts` (`projectPillsOf`, `pillShown`, `heldFocus`, `waitingElsewhere`, `elsewhereWords`) |
| The focus as the window reads it, the row's open state and the pill a rest lights | `src/renderer/src/app/projectFocus.ts` (`projectFocus`, `useProjectFocus`, `heldProjectFocus`) |
| Where the choice is saved | the layout's `focusedProjectId` (`src/shared/preferences.ts`), written by `railStore.focusProject` |
| The pill and its row | `src/renderer/src/app/ProjectFocusControl.tsx`, drawn by `TopBar.tsx` between its two groups |
| A panel's view and pointing | `PanelProps.view.focusedProjectId` and `point.focusProject` (`src/renderer/src/plugins/panelPoint.ts`, `docs/ui-plugins.md`) |
| The stage's light | `src/renderer/src/character/crew/focusLight.ts` (`lightFrame`), `docs/crew-orbits.md` "The project focus" |
| Activity's lines | `src/panels/activity/feedRows.ts` (`linesInFocus`), read by the Activity panel from `view.focusedProjectId` |
| The cards held back | `src/shared/projectFocus.ts` (`holdsBack`), read through `focusHoldsBack` by the window's stack in `src/renderer/src/app/stack.ts` (`reconcileStack`, `stackOf`, `shownEntry`) and `src/renderer/src/app/stackActions.ts` (`applyHold`) |
| The filter a message says | `messageProjectFilter` (`src/renderer/src/app/projectFocus.ts`) fills `focusedProjectId` or `allProjects` on `inf:converse` and `inf:cards:reply`; `projectFilterOf` (`src/core/orchestrator/projectFilter.ts`) reads them, and `CaptainPlaces.fromPhone` says a phone sent it |
| The first mate's line | `project_filter`, written by `projectFilterLine` in `src/core/orchestrator/firstmateContext.ts` |
| The keys | `project-focus.open` and `project-focus.clear` (`docs/keyboard.md`) |

## Which projects get a pill

Every project set up in Settings gets one, in the task board's order.
A project of several repositories gets one pill, which counts and focuses the tasks of every repository in it.
Scratch (the project with no repository) and the app's own workspace, personal, get one only while each has a task the Tasks panel lists (the captain's answer to INF-1292).
The board's project view says which repository is the workspace (`repo.kind` is `personal`), so the rule reads a typed fact, never the name.
An archived project gets none.
The pill shows only while there are two projects or more; with one there is nothing to choose.
A pill counts its project's tasks that wait on the captain and that work, each task once by its own count state (`nowCountGroupOf`), so a pill and the Tasks panel's collapsed summary narrowed to its project always agree.
A quiet published contribution waiting on maintainers remains listed in its existing group but adds nothing to either working count.
A project with nothing waiting and nothing working reads dimmer.

## What the focus does

- The Tasks panel lists only the focused project's tasks, its search open or closed, and its collapsed summary counts only them.
  Closing the search lets go of its words and keeps the focus.
- The task board opens on the focused project, and Hide keeps it.
- On the stage every crewmate of another project keeps a quarter of its light; nothing hides or moves.
  While a crewmate's summary is open, on the desktop or the phone, the stage lights that crewmate's project in the same way instead, and closing the summary puts the focus's light back (`docs/crew-orbits.md`, "The project focus").
- The first mate hears the filter with every message the captain sends (below).
- Activity lists only the lines about the focused project's tasks and the lines about no task: the captain's own turns, the first mate's and the app's (the captain's answer to INF-1091's question 3, "Hide them while focus is on").
  A line's task key says its project, because a task's key starts with its project's key and a project's key never changes, so a line about a task the board no longer lists follows the same rule (`linesInFocus`).
  Collapsed, its header shows the newest line it keeps.
- The card stack holds other projects' cards back (below).
- Every project still notifies.

Focused, the pill names the project, wears the accent border and has a × beside it, Show all projects.
A quiet mono tail after it says how many tasks wait on the captain in other projects ("2 waiting elsewhere"), and a press on it opens the row.

## The first mate

Every message from a window says the window's filter to the first mate, as the `project_filter` line on each input: the focused project, or All projects while the pill shows.
A window with one project has nothing to pick, so its message says no filter.
A reply under a first mate card says it too; a crewmate's card ignores it.
A message from the phone says it came from the phone, which has no filter and shows every project (the captain's answer to INF-6860's question 2).
Ask again, a Crewmate tab line and a button's press say nothing of their own, so the filter from the captain's last message holds, and so does it for every crew report and wake until the next message.
The line tells the first mate what decides a message's project, strongest first: a project, repository or task the captain's words name, the card they replied under, the shown record or card, then the filter.
Where nothing stronger names a project, the filter scopes new work, answers and actions on many tasks, and the first mate names what it left out (the captain's answer to INF-6860's question 1).
The first mate says so in a few words when the filter decided something the captain did not say, and it never changes the filter.

## The card stack

While the window is focused on a project, the stack holds back the cards about other projects' tasks until the focus changes (the captain's answer to INF-1091's question 2, "Hold other projects' cards back until focus changes").
A held card stays open: nothing closes and nothing is written, so the first mate, another Mac's view and the phone see it as before.
How the stack draws it is the design skill's `components/cards/CardStack.prompt.md`, "Held back by the project focus".

- A card about no task stays: the first mate's own, a sign-in, a notice.
  So does a card whose task the board does not list, and before the board is read nothing is held back (`holdsBack`).
- Anything the captain opened stays: a task record, a past card, a task's browser, a panel's card.
- Focusing while another project's card is shown takes it off the stack as a close does, with no question and no message.
- The pager counts only the cards on the stack; the pill's tail counts what waits on the captain in other projects, held cards among them.
- A card that arrives while it is held back stirs nothing on the stack and gives no notice pulse.
- Picking its project or All projects brings a held card back in its place: one that arrived while held comes back marked new, and one the captain had seen comes back seen.
- A card the captain points at (the first mate shows it, a task key, a record's Show the card) comes to the front without moving the focus, and stays until the focus changes (`focusCard`).

Every reading of the window's stack passes its project-held cards through `stackOf` and `shownEntry`; no automatic note-collapse list exists.
The hold moves with the focus and the board: the stack reads them as each cards snapshot lands and again whenever the focus store speaks (`applyHold`), and writes nothing when the held cards stay the same.

## Opening and closing the row

The pill carries an arrow pointing right, because the projects open to the right of All projects (the captain's words on INF-1091, kept on INF-1196).
A press on the pill, Enter or Space on it, the tail or Focus on a project (⇧⌘P) opens the row: All projects, then a pill per project, its counts a beat after.
The row is centred on the bar, the same line as the folded pill, and each pill glides out from where the pill was, so the row fans out both ways (the captain's answer on INF-1196).
A row wider than the bar's room is held 12px inside it.
The row ends in the same arrow turned back, Close the project row, which folds it again.
Esc, a press outside the row, the window changing size or losing focus, and a pick fold it too, playing the glide back into the pill.
Esc folds it wherever focus is: a row the pointer opened leaves focus where it was, such as the message box, so the window's Escape folds the open row before anything else it closes (`App.tsx`, INF-1294).
A row too wide for the bar's room ends in a +N pill that lists the rest in a menu; the focused project always keeps its pill in the row.
A pointer or the keyboard resting on a pill lights that project's crew on the stage before anything is picked.
The pointer lights a pill only once it moves onto it: the row opens under the pointer that pressed the folded pill, and a pill that lands under a still pointer lights nothing, so a click alone never dims the crew (INF-1292).
The row is a radio group: the arrows, Home and End move along it, and Enter or Space picks.
Opened by a key or the command, focus lands on the checked pill; folded, focus goes back to the pill.

## Where it is kept

The choice is saved with this computer's layout, so it survives a restart, and a Mac that controls another keeps its own (`docs/view.md`).
A saved project that is archived or removed lets go of the focus without anyone writing it: the focus that holds is the saved one only while its project still has a pill (`heldFocus`).
Before the board is read at launch the saved focus holds, so a restart never shows All projects on the way to the focused project.

## Tests

- Unit: `src/shared/projectFocus.test.ts` (pills, Scratch, archived, the held focus, the tail and which cards are held back), `src/renderer/src/app/stackActions.test.ts` (the stack holding, bringing back and letting a pointed-at card through), `src/renderer/src/character/crew/focusLight.test.ts` (the light on the orbit's own frames, and an open summary's project giving way over the focus) and `computers.test.ts` (that light on another computer), `src/panels/now/rows.test.ts` (the narrowed summary), `src/panels/activity/feedRows.test.ts` (Activity's lines under focus), `src/renderer/src/plugins/panelPoint.test.ts` (`focusProject` only from the captain's click or key) and `src/renderer/src/app/composer.test.ts` and `cardActions.test.ts` (the filter a message and a reply carry), `src/core/orchestrator/projectFilter.test.ts` (the filter a window or the phone says) and `src/core/orchestrator/firstmateAgent.projectFilter.test.ts` (the line, and which messages keep it).
- Phone: `PhoneFocusLightTests` replays the desktop's light for one board of two computers and two projects.
- Journey: `tests/e2e/computer-clusters.spec.ts` reads a crewmate's summary lighting its project's crew on another computer, and its light going when the summary closes; `tests/e2e/project-focus.spec.ts` drives the pill by keys, the Tasks list, the stage's light, a restart and Show all projects, the held cards and hidden Activity lines coming back, and the project filter line the first mate hears from the main box, a card reply, a Crewmate tab /feedback line and a paired phone; `tests/browser/project-focus-still-click.test.tsx` holds a still click on the pill to the row opening with no crew dimmed, moving onto a pill lighting its project (INF-1292), and Esc from the message box folding the row that click opened (INF-1294); `tasks-search.spec.ts` and `task-board.spec.ts` cover the chips as the one focus.
