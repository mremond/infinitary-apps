# Task tags

Each project keeps its own list of tags, and a task carries any of its project's tags.
A tag has a name and a description that says which tasks qualify, such as `bug`: "Something that used to work and is broken now".
Tags help a person find and group work; nothing in the app acts on a tag by itself.
The decision model tags each new task in a project with tags, and Check existing tasks tags the older ones ("Automatic tagging").

## A project's tags

A name is required, and unique in its project ignoring case, so `Bug` and `bug` are one tag.
A description is required.
Tags list alphabetically everywhere, ignoring case (`byTagName`, `src/shared/tags.ts`).
They have no color and no fixed limit on their number.

`ProjectTagStore` (`src/core/storage/projectTagStore.ts`, reached as `ProjectStore.tags`) is the one writer of `project_tags`.
A tag keeps its id for life, so a rename keeps it on every task that carries it.
Each new description raises the tag's `revision`; a rename alone does not.

Removing a tag takes it off every task that carries it, in the same write, and writes one quiet line on each of those tasks' timelines.
Settings asks once first, naming how many tasks carry it.

A project's view (`projectViewSchema`, `src/shared/tasks.ts`) carries its tags in `tags`, each with its description, revision and how many tasks carry it now; the field is absent while the project has none.

## Where a project's tags are changed

- **Settings.**
  A project's page in Settings → Projects has a Tags box between Project and Repositories (`ProjectTags`, `src/renderer/src/settings/ProjectTags.tsx`; design skill `components/projects/ProjectPage`).
  Each row names a tag, how many tasks carry it and its description, with Edit and Remove; Add a tag ends the box.
  Edit and Add a tag open a form in the row's place with the name and which tasks qualify; Enter saves, and Escape or Cancel puts the row back.
  Remove turns its row into one question with Cancel focused, so Enter never removes.
  The form refuses an empty name, an empty description and a name the project already has in the person's own words before anything is sent.
- **The first mate.**
  The `project-tags` line of the action catalog (`src/shared/tagActions.ts`) sends the same request Settings sends, `inf:projects:tags`, on the captain's ask; its current value lists every project's tags with their descriptions and how many tasks carry each.
  The `project-tag-check` line starts or stops Check existing tasks, `inf:projects:tag-check`, on the captain's ask; its current value is every project's check as `inf:projects:tag-checks` reads it.

## The tags a task carries

`task_tags` holds one row per task and tag: on or off, who set it, the tag's description revision the decision model judged it at, and when.
`TaskService` is its one writer: through `setTaskTags`, `changeProjectTags` and `judgeTaskTags` (`src/core/tasks/taskTags.ts`), and through a task's new title or goal (`forgetJudgments`) and a single task's move (`owe`); `TaskTagStore` (`src/core/storage/taskTagStore.ts`) reads and writes the rows for it.

Who set a tag is one of three setters (`tagSetterSchema`):

- `captain`: a person, with Edit tags on the record.
- `firstmate`: the first mate, with create_task's or update_task's `tags`.
- `decision`: the decision model.

A tag a person or the first mate set or removed is theirs for good: the decision model never changes that row, and a row turned off by hand stays, so a tag removed by hand stays removed.
A tag already in the asked state is left as it is and writes nothing.

Each change to a task's tags writes one quiet `note` on its timeline for each direction, tags added or tags taken off, naming who did it ("You tagged this task bug."), with `news: false` and no feed line, so it raises no card and no Activity line.

A task reads a tag only while the tag belongs to its own project.
Moving a task to another project deletes its tag rows, on and off, in the same write as the move (`src/core/tasks/projectMove.ts`), and so does moving repositories out of a project that keeps others.
A task moved on its own owes automatic tagging its new project's tags: the move writes an off row of the decision model's with no revision for each, which automatic tagging asks.
Tasks that leave with their repositories owe nothing; Check existing tasks reaches them.
A project that empties into another, its repositories all moved, brings its tags along (`carryProjectTags`, `src/core/tasks/taskTags.ts`): each lands on the other project's tag of the same name in any case, or joins its list with its description, and every task keeps its rows, on and off, with who set each.
A row keeps the description revision it was judged at only when that description is the one now on its tag: a row of the decision model's landing on a tag the other project already had, or judged at an older description of its own tag, takes revision 0 (`STALE_JUDGMENT`), which no description has, so Check existing tasks asks it again and automatic tagging does not.
The emptied project keeps no tags.
A purged task's rows go with it.

A task's view (`taskViewSchema`) carries the tags it carries in `tags`, alphabetical, each with its id, name and setter; the field is absent while it carries none.
Until any task carries a tag, building a row's view reads only one row of `task_tags`, through a statement compiled once (`TaskTagStore.viewsOf`, `prepared`).

## Where a task's tags are changed

- **The record.**
  The Info tab's Tags row follows Project once the project has tags or the task carries one: the tags it carries, then Edit tags, a menu of the project's tags with each ticked on or off (`RecordTags`, `src/renderer/src/cards/RecordTags.tsx`).
  A tick saves at once, by `inf:task:tags` with every tag the task should carry, and leaves the menu open.
  Edit tags in command search (`task.edit-tags`) opens the same menu from the shown card or any of a task's tabs, turning its record to the Info tab first.
- **The first mate.** create_task and update_task take `tags`, the project's tag names the task carries, exactly; an empty list clears them.
  On update_task they apply after the call's other edits, so a move to another project comes first.
  The tasks tool lists a task's tags by name.

## Finding and grouping work by tag

The Tasks panel and the task board filter and group by tag, one project's tags at a time: the project in focus, or the only project with tags (`tagProjectOf`, `src/panels/now/rows.ts`).
With no project in focus, other projects' tasks count and list under No tag.

- **Tasks' search.**
  Under the words field sit the project row (All projects first) and, while one project's tags apply, the tag row: All tags, each tag alphabetically with how many open tasks pressing it would list, even at 0, then No tag (`tagChipsOf`).
  One tag at a time; a pressed tag narrows every group and count, Earlier matches included, and opens folded groups as typed words do.
  Closing the search, or focusing a project that lacks the tag, lets go of it.
  The tag row is one Tab stop: ← and → move along it, and Enter or Space presses.
- **Group tasks.**
  Tasks' third header button, drawn while the panel is open, opens a menu of By status (the default) and By tag; the choice is kept in the panel's store across restarts.
  By tag lists Pinned, one group per tag that has tasks, No tag, then Done · 7d (`byTagGroupsOf`, `tagGroupsOf`); it has no Waiting on you group.
  Tag groups start folded and keep each fold; inside one, rows run waiting on you, working, queued, then backlog and read as in their own groups, and a task with two tags lists under both.
  A folded tag group draws a bar of one segment per task, waiting on you in blue and working in ember, that rests and presses as a folded parent task's bar does (`tagGroupBarOf`), and still lists its rows waiting on you under the bar (`foldedTagRowsOf`).
  Quiet published maintainer waits keep their segments as outlines in both folded tag bars and parent-parts bars, without changing grouping.
  While a tag is pressed only its group shows, open; where no tags apply, By tag is dim with a line saying why and the list stays by status.
- **The task board.**
  Its own tag row and By tag view (`docs/task-board.md`).
- **The hover summary** names the tags a task carries under its project.
- **Command search.**
  Filter tasks by tag, Show tasks by tag and Group tasks, with no default keys; the first two say why they cannot run while no tags apply (`rail.refuse`, `docs/ui-plugins.md`).
- **The phone.**
  Its Tasks search shows the same tag row while the only project with tags has them, since it keeps no project focus, and its task record shows the Tags row without Edit tags (`docs/ios.md`, "Talk and tasks").
  It changes no tags and has no Group tasks.

## Automatic tagging

Tag tasks automatically is a use of the decision model (`tags`, `src/shared/decisionUses.ts`; `docs/decision-models.md`, "The uses"), on by default, switched in Settings → Intelligence.
`TaskTagger` (`src/core/decisions/taskTagger.ts`) is the one worker that asks; it records every answer through `TaskService.judgeTags` (`judgeTaskTags`, `src/core/tasks/taskTags.ts`).
It asks about one task at a time, all of the task's owed tags in one request (`together`), with the tagging question (`docs/task-tags-eval.md`), and records the use against the task.
A task starts as it always does: nothing waits for the answer.

What is owed is read from the record each time, never kept in a list (`TagWork`, `src/core/storage/tagWork.ts`), so a restart picks up where the record stands:

- a tag of the task's project with no row, on a task filed after automatic tagging began asking and no earlier than the tag;
- a row the decision model set with no revision, which a task's new title or goal leaves (`TaskTagStore.forgetJudgments`), as does a single task's move.

Automatic tagging began asking when this version first started with the use on, and begins again whenever the use is turned back on (the `tag-auto-since` settings row), so tasks filed while it was off are left to Check existing tasks.
Each time it finds nothing owed and no task waiting out a retry, it moves that row up to the newest task filed, so each read seeks only the newest tasks.
An answer that arrives after its task's project, title or goal changed is dropped unrecorded, and the task is asked again about what it holds now.
A project with no tags owes nothing and is never asked about.

`yes` turns the tag on, `no` leaves it off, and `unsure` keeps what the row held; each is kept with the description revision it read, so nothing is asked twice about the same task, tag and description.
A row a person or the first mate set is never asked about or changed.
A tag left without an answer stays owed: its task is asked again an hour later (`TAG_RETRY_MS`) or at the next start, with no card, no Activity line and no loop.
A changed title or goal asks again only the tags the decision model set; a tag added later, or a new description, is asked only by Check existing tasks.

Turning the use off stops new requests at once, lets go of the request in flight and stops a check under way, keeping what it recorded.

## Checking existing tasks

The Tags box ends, once the project has tags, with a line saying whether Tag tasks automatically checks each new task and who answers (`ProjectTagCheck`, `src/renderer/src/settings/ProjectTagCheck.tsx`).
While the use is on, Check existing tasks follows: which tasks (open; open and done in the last 7 days; every task), how many requests that makes, one per task with an unjudged tag, and who answers, then Start.
While a check runs, the same place counts the tasks checked of the tasks it set out to check, with Stop.
After a tag is added or its description changed, the box offers to check that tag alone; Not now returns it to every tag.

`inf:projects:tag-check` starts or stops a check, and `inf:projects:tag-checks` reads one project's view or every project with tags (`src/shared/tagCheck.ts`).
A check asks every task in its reach filed before it started that has a tag with no row, or a row the decision model set at another description or none.
New tasks go first; the check takes the turns left.
One check runs at a time across every project, kept in the `tag-check` settings row, so a restart resumes it; Stop keeps every answer recorded so far.
A finished check writes one Activity line naming its project and how many tasks it checked, and how many got no answer.

## Suggesting tags

While a project has no tags and no form is open, Suggest tags, a small primary button, leads Add a tag, with a quiet line under them: "Suggest tags asks your first mate, who answers on a card."
It is a Tab stop like any button and has no window command, since a person presses it once per project.
While the main message refuses (`mainMessageRefusal`, `src/renderer/src/app/composer.ts`), the button is held and the quiet line says why.

The press sends `inf:projects:suggest-tags` (`src/shared/tagSuggestion.ts`) with the project and the words "Suggest tags for <project>" in the person's language, and the window goes home, where the words show as the person's own message.
Any window may press it, a view on another computer included, and the press counts as the captain's input like a message (`CAPTAIN_INPUT_CHANNELS`, `docs/devices.md`, "Where the captain is"); it names no project focus, since the note names the project.
The home refuses an unknown or removed project, one that already has a tag, and a start before tagging is ready, answering the reason; the window says it under the button, and nothing is sent.
The first mate's turn carries the words and one note, `[tag suggestion request]` (`tagSuggestionNote`, `src/core/orchestrator/tagSuggestionNote.ts`), which the press adds and the words never do.
The note names the project; how many tasks each check reach holds, read by `TagWork.tasksIn`; whether Tag tasks automatically asks now and who answers; and the steps.
The steps: read the open tasks with the tasks tool, propose 8 to 14 tags, kind tags worded so a task fits at most one and part tags named the way the project names them, siblings together, each described with the nearest work that does not qualify and example task keys; put up one decision card with a box per tag and one question on which existing tasks to check; revise it by reply; on the click, add the ticked tags with `project-tags` and start `project-tag-check`.
The first mate never tags a task itself, because a tag it sets is fixed for good.
The note rides only that turn and its parked copy, which a failed turn serves again, so it costs the first mate's standing context nothing; Ask again on an unanswered message sends the words alone.

## Saved data and older sides

The tags migration adds both tables; an existing record upgrades with no step for the person, and every task starts with no tags (`docs/saved-data-compatibility.md`).
A record opened at an older version has neither table, and both stores read nothing from it.
An older window, view or phone never sends either request and reads neither `tags` field, so it draws no tags and behaves as before (`src/shared/contract-changes/project-tags.md`).
Automatic tagging adds no table: it keeps two settings rows, `tag-auto-since` and `tag-check`, and the `revision` column the tags migration already wrote; two query indexes seek its reads (`src/core/storage/queryIndexes.ts`).
An older window never sends the check requests and draws no Check existing tasks (`src/shared/contract-changes/tag-check.md`).
An older window never sends Suggest tags; an older home answers an unknown channel, and the window says the first mate could not be asked (`src/shared/contract-changes/suggest-tags.md`).
A phone that reads the fields from an older computer finds neither and draws no tag row or Tags row.
