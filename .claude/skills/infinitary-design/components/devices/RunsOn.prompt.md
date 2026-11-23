Where a project's tasks run, and what the person sees while that device is out of reach (captain's picks on FI3-682, 2026-10-03).
Automatic chooses a compatible computer with room for each new task; a started task stays there.
An explicit computer remains the captain's choice.

**Runs on**, the first row of the Tasks group on a project's page in Settings → Projects, after Changes.
It appears for eligible projects even before another computer is added, and for other projects once a device that runs work is on the list.
The title "Runs on", the description "Where its tasks run.
While that computer is out of reach they wait, and never run on this computer instead.", and one select, the same kind as the address select in Devices, so it holds any number of devices (captain's question about many computers).
Closed, the select shows "Automatic" or the chosen device's name.
Automatic's description is "Choose a compatible computer with room for each new task.
A started task stays there."
Automatic uses the same select, Tab reach, arrow keys and focus ring; there is no extra command or task editor.
Open, it lists "Automatic", "This computer", then the group "Your computers" with each computer by name, then the group "As another user" with "Running as Builder".
An option for a device that cannot take work now names why after a middle dot: "MacBook Air · no sign-ins yet", "Mac mini · out of reach" ("Mac mini · connecting" while its connection is being made, "Mac mini · updating" while Infinitary there is updated; Subscriptions' device sign-ins and the device forge rows say it the same way).
A project kept on this computer only shows "This computer" as text, with the description "Kept on this computer only, so its tasks run there."
On a computer that controls the first mate, "this computer" in both names the first mate's computer.
The personal workspace stays on this computer too, locked like its other rows.
Collapsed, an Automatic project adds the accent badge "runs automatically".
A project that runs elsewhere adds one accent `Badge` after the others: "runs on Mac mini", or "runs as Builder".
"run website on the mini" sets the same row by talking, through the same project-settings action.

The feed says "website runs on Mac mini now.
Its next task starts there; the one running here finishes here.", then "Mac mini cloned website with its own GitHub sign-in.", or the GitHub sign-in card when it has none (`SignInOnAMac.prompt.md`).
Back home it says "website runs on this computer now.
Its next task starts here."
Moving a project never cuts off a running task: the task finishes where it started.

**One task's own Runs on** (captain's picks on FI3-1344, 2026-10-08, direction A).
"run FI3-1345 on the mini" tells the first mate where one task runs, before it starts; there is no control for it.
It wins over its project's Runs on, in both directions: a task can run on Mac mini while its project runs here, or stay on this computer while its project runs on Mac mini.
Each part of a parent task takes its parent's unless it has its own.
"run FI3-1345 where its project runs" clears it.
"choose a computer automatically for FI3-1345" gives an unstarted eligible task its own Automatic setting.
When the project moves, a task with its own stays where the captain put it; one without follows the project.
A started task finishes where it started, and Start again or a retry on a stronger model keeps the task's own.
A task with no project can run there too ("on the mini, find out why its disk is full"): it works on that computer in a copy of this computer's default workspace, and merging its change merges here.
The first mate refuses in plain words a started task, the personal workspace, a project kept on this computer only, a review, and a device that does not run work.
The task's record shows it read-only in Details (`../cards/TaskRecord.prompt.md`), and its cards name where it runs as below.

**A card from there.**
A card from a task that runs elsewhere is the same card.
Its head names where it runs right after its meta line, "Fix the footer · on Mac mini", however long the task's title: the title gives way, the place never does (`../cards/ResponseCard.prompt.md`).
The facts strip at its foot names no computer, since the head already does.
The crewmate's summary carries the same fact, "website · on Mac mini", and its task record names the computer in Details' Runs on; its Tasks row names no computer.
Pull requests are still opened, checked and merged from this computer.

**Out of reach and waiting.**
Feed lines, never cards:
- "Mac mini is out of reach.
  Its work on website catches up here when it is back."
- a computer that left your first mate, never said to catch up: "Mac mini runs work for another first mate now.
  Its work on website stops when you remove it here."
- "api's next task waits for Mac mini.
  It never runs on this computer instead."
- a day later, once: "Mac mini has been out of reach for a day. api's next task still waits." and "To run it here instead, set api to run on this computer."
- a task with its own Runs on is named by its quoted title instead: `"Fix the footer" waits for Mac mini. It never runs on this computer instead.`, a day later `Mac mini has been out of reach for a day. "Fix the footer" still waits.` and `To run it here instead, ask your first mate to run "Fix the footer" on this computer.`, then `"Fix the footer" started on Mac mini.`
- "Mac mini is back.
  Its work on website caught up." and "api's next task started on Mac mini."
- an older Infinitary there: "api's next task waits for Mac mini.
  It takes no new work until it is updated.", a day later "Mac mini has taken no new work for a day. api's next task still waits." and "To run it here instead, set api to run on this computer."
  The wait updates Mac mini by itself when nothing tried it for that gap yet, and otherwise raises its Update card again, even after Not now (`UpdateNudge.prompt.md`).
- a computer on an older Infinitary, for a task with no project: `"Find why the disk is full" waits for Mac mini to be updated.` is the feed's `Mac mini needs an update to run "Find why the disk is full". Update it in Settings → Devices.`, once, and the task starts by itself when it is updated.
- a device with no sign-ins: "MacBook Air has no sign-ins yet. website's next task waits until it has one."
- a sign-in there a cut-off withholds (`SignInOnAMac.prompt.md`): "api's next task waits for Mac mini's own Claude sign-in." when the sign-in is lost or refused, and "api's next task waits for Mac mini's Claude plan's allowance, which resets 1:10pm." when the allowance is spent, with no day's line, then "api's next task started on Mac mini." once it serves again.
- running as another user: "Running as Builder is out of reach.
  It runs work only while Builder is logged in."
  After a restart: "Builder is not logged in since this computer restarted. api's next task waits for it." and "Log in as Builder once, then switch back."
  Then: "Running as Builder is back. api's next task started as Builder."

While its device is out of reach a task's Tasks mark keeps its shape in `warn`, its Tasks row ends "out of reach", naming no computer, its status reason reads "Mac mini is out of reach" on its summary and its record; for a computer connected on an older Infinitary both read "takes no new work" and "Mac mini takes no new work" instead, and the first mate neither nudges it nor calls it stuck (`../now/NowPanel.prompt.md`).
A device that is connected while the app is still catching up with a task - after either side restarted - is in reach, never out of reach: the task's mark stays as it was, its Tasks row ends "catching up" in `--fg-3`, and its status reason, which the row's summary shows, reads "Catching up with Mac mini since 12:57 PM"; its crewmate stays on the orbit.
While Infinitary there is updated, the mark keeps its color, its Tasks row ends "updating" in `--fg-3`, and its status reason reads "Mac mini is updating"; after three minutes with no word of the update it reads out of reach.
For the first minute after the app starts, a computer not yet back reads "connecting".
Never the words away, offline, disconnected, assigned, placed, helper or runner (`copy/Vocabulary.prompt.md`).

**Automatic explanations.**
Details show the selected computer, followed by "Computer choice" and a brief reason.
Candidate lines describe saved headroom and reading ages at the start, in the existing muted policy text, never as live gauges.
A waiting Automatic task says it needs a compatible computer with room in Activity, never on a status card.
Uncertain preparation says the task waits for its chosen computer and will not start elsewhere.

In task Details, Computer choice gives one short reason; a native “Compared computers at start” disclosure keeps the historical candidate lines behind it, preserving open state and keyboard focus across updates.

The existing project-change confirmation names Automatic, and shows declared systems, architectures, required programs and allowance in words before applying computer requirements.
