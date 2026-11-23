# Saved-data compatibility

Release and alpha installations share `<appData>/infinitary`, and so does `pnpm dev` ("A run from source" below).
The local dev bundle and isolated runs from source remain on `infinitary-dev`; nothing migrates between those roots.
Each moves the Firstmate 3000 folder of its flavor, `firstmate-3000` or `firstmate-3000-dev`, into itself once ("The one-time move").
An older app may open saved work only when it supports the persisted formats.
Release names alone are not compatibility evidence.

## Contribution routes

`repos.contribution_json` stores the verified upstream and owned fork identities, the selected destination, and whether a fork-creation request was attempted.
Existing projects have no route until discovery succeeds; adding the column changes no existing remote or destination on its own.
An imported owned fork keeps a null destination until the person's choice, and an uncertain create request is reconciled by reading rather than sent again.
A task captures its selected route and the host's contribution state on its delivery record.
Saved story destinations may additionally carry `media: card-only`, retaining the pictures on the card while publishing the contribution as text.
The migration history guard refuses a build that predates the new column before it can write these records.

## Before services start

`createServices` first calls `assertSavedDataCompatible` in `src/core/storage/db.ts`, before overflow initialization, shell probes, account vault warming, database writes, launch/crash counters, agents or derived views.
`openDatabase` also guards its own writable boundary, protecting other callers.
`createServices` opens through `openCheckedDatabase`, which skips that second guard: nothing writes the folder between its first check and the open, so a start reads the history once.

The guard checks `saved-data-format.json` and the database migration history.
Every recorded migration must be an integer in this build's embedded migration list.
Unknown migrations, unreadable history, and databases with tables but no recognized history are refused.
Fresh state and known older/current history remain supported; forward migrations still run normally after the guard.

SQLite can create WAL/SHM sidecars even on a read-only connection.
To avoid changing the protected database or its sidecars, the guard copies the existing database and any WAL into a private temporary directory, reads the history through a read-only connection there, and removes that directory in `finally`.
The copy is a clone where the disk can make one (`privateCopy` in `src/core/storage/privateCopy.ts`): APFS through the system's `cp -c`, since Node's own clone flag does not clone on macOS, and btrfs or XFS through that flag on Linux.
A clone shares the file's blocks until either side changes, so a database of a gigabyte copies in milliseconds instead of about half a second; any other disk, or a pair of volumes a clone cannot span, gets a full copy.
It does not register view functions, configure WAL, migrate, or rebuild views.
This assumes startup owns the single-instance lock and no other process writes the app's state.
The snapshot includes committed WAL state after an unclean shutdown; checking only the main database file would miss it.

## A run from source

`pnpm dev` opens the person's own folder, `<appData>/infinitary`, as the installed app does (`runFlavor`, `src/main/userDataDir.ts`).
A newer source may migrate the record past what the installed app opens, and the guard above then refuses that app.
So before a run from source first opens the record, and again before any run whose build would change how the record is saved, it keeps a copy to go back to in `before-source-run/` inside the folder (`keepRecordBeforeSourceRun`, `src/core/storage/sourceRunCopy.ts`): the database and its write-ahead log, the knowledge collection's, and the format marker, made while the run holds the single-instance lock and before services start.
A build changes how the record is saved when it has a database migration the record or the knowledge collection has not had, or the record has no format marker yet (`formatChangeDue`); a database it cannot read is not one, since the guard refuses it and nothing migrates it, so it never replaces a good copy; a newer copy replaces the older one, so the copy is the record as it stood just before the newest such change.
A folder with no record yet keeps no copy.
The copy is made beside its place and moved there whole, so a start that ends partway keeps the older copy and the next start copies again; while a build changes nothing in how the record is saved, no later run from source copies again.
The run says in its terminal where the copy is and that going back means quitting Infinitary and copying those files back into the folder.
A run that cannot keep the copy quits without opening the record.
A window beside a command's run opens no record of its own and keeps no copy.

One app writes the folder: the installed app and `pnpm dev` share Chromium's single-instance lock inside it, so the second to start ends, and `pnpm dev` says in its terminal that the folder is already open; beside the installed app's command run, `pnpm dev`'s window joins it as a view.
A run from source reports the package.json version, which names no release, so it records no launch in the release tracking (`docs/release-notes.md`) and its devices compare other computers by contract alone (`HostAppInfo.sourceOnOwnData`).

## Non-database formats

The closed marker schema is `{ "schemaVersion": 1, "revision": 1 }`.
Missing means supported legacy state.
Invalid, unreadable, extra-key or unknown revision metadata refuses startup rather than guessing.
After a successful first database initialization, the app records the current boundary atomically.
The marker is never rewritten on a refusal.

**Before writing any future incompatible non-database format**, increase `PERSISTED_FORMAT_REVISION` in `savedDataCompatibility.ts`, define exactly which older revisions are supported/migrated, and extend compatibility tests.
Compatible additions do not require an increase.
Database format changes continue to require an embedded migration.
Do not use app-version comparisons to substitute for either boundary.
The window host keeps `saved-card-files/<card-id-hash>.json` under its profile, one private record per card with saved file IDs, destinations and the latest Save all folder.
A missing record means nothing has been saved on that computer; the record is not copied to a paired device.
The installer-owned channel marker is a different file and contract (`update-channel.json`, `docs/alpha.md` "Update channels").

## Folders that moved or are moving

`dataFolderRefusal` in `src/core/storage/dataFolderRefusal.ts` runs in the Electron host before the shell starts, and refuses the folder with its own standalone window (`showDataRefusal`, `src/main/savedDataRefusal.ts`).
A folder that carries `retired-profile.json` moved to Infinitary and is refused for good; the marker's presence is the whole rule, and nothing reads its contents.
A folder whose move lock is held is refused until the move finishes.
The move lock is `<folder>.move-lock`, a sibling of the data folder in the application-data directory (`src/core/storage/moveLock.ts`), so a move can rename the folder it guards.
A lock that names a process which no longer exists is stale and does not block.
So is a lock written before this computer last started: its process ended with that start, whoever has its number now (`predatesBoot`, `src/core/helper/lock.ts`, the same rule `running.lock` follows).
Any other lock that cannot be read holds.
The one-time move below writes both the marker and the lock.

## The one-time move

An app whose spelling has older spellings before it moves an older spelling's folder of its own flavor into its own once, before anything opens either (`src/core/folderMove/move.ts`; the Infinitary rename, FI3-1780 step 3).
Infinitary's folders are `infinitary` and `infinitary-dev` (`USER_DATA_FOLDERS` in `src/shared/userDataFolders.ts`); release and development move apart, each into its own.
This build is Infinitary (`OWN_IDENTITY` in `src/shared/codeNames.ts`, the rename's step 10), so the move is on: it wakes when this build finds Firstmate 3000's folder of its flavor holding saved work.
Firstmate 3000's own folders have no older spelling, so a Firstmate 3000 build's move never wakes.
It moves any older folder this build can read, so nobody has to pass through a particular Firstmate 3000 version first.

`dueMove` (`src/core/folderMove/due.ts`, which loads nothing of the move itself) decides before Electron reads userData, with cheap reads only: a move is due when the app's folder carries an unfinished move, a checked staged copy waits beside it, or an older folder holds saved work and is not retired.
An isolated (`INFINITARY_USER_DATA_DIR`) or switched folder never moves.
While a move is due, Chromium runs on a throwaway profile, `<folder>.hand-over`, so the app's folder is not opened by this process at all; the next ordinary launch removes that profile.

The move runs in this order, and writes its record, `folder-move.json`, before each step that depends on it:

1. It checks, changing nothing: the older app is not open (Chromium's `SingletonLock` in the older folder names no live process on this computer, or was written before this computer last started, `predatesBoot`), its background work does not hold `work/running.lock`, and `assertSavedDataCompatible` reads the older folder.
   When the app's own folder holds saved work too, it asks which work to open instead (below).
2. It takes the move locks beside both folders, so the older app and a second launch both wait.
3. It counts the older folder and checks the disk has room: the bytes it copies, plus a margin of a twentieth (at least 256 MB), or the margin alone on a disk that clones, such as APFS, where the copy clones its files.
   The disk itself says whether it clones (its volume capabilities, `copyClones` in `src/core/folderMove/copy.ts`); its kind's number is no answer, because a Mac numbers each kind of disk as it registers at startup.
4. It copies the older folder into `<folder>.moving-<process>`, a private folder beside the app's own, keeping permissions, times and links as links; a Mac clones each file with `cp -c`, elsewhere Node's copy asks for a reflink.
   It copies four entries at once: each top-level entry, each entry of `worktrees/`, `crewmates/`, `fleet/` and `work/`, and each spare working copy of the warm pool, `worktree-pool/<project>/<slot>` (`copyUnits`, `src/core/folderMove/copy.ts`).
   The Mac's copier runs with `-v`, naming each entry it copies, so the window counts the copy as it goes.
   Each attempt builds in a folder of its own, because a Mac's copier outlives an app that was stopped hard and keeps writing where it was told.
   Chromium's locks and caches, `worktree-trash` and `task-channel` stay behind (`LEFT_BEHIND`, `src/core/folderMove/tree.ts`), and so do sockets and pipes.
   So do the profile a refused launch's word uses and its record (`isWordState`, `src/shared/wordProfiles.ts`, `docs/run.md`), which belong to the folder they are in.
   In `work/`, what a live run, its service manager or a controller may still write while the copy is made stays behind too: Electron's own `chromium/`, `service.log`, `work.log`, the route and its lock, `running.lock`, the display's key, `worktree-trash` and `task-channel` (`WORK_LEFT_BEHIND`); the next run makes each again.
5. It checks the copy file by file: the same names, kinds, sizes, permissions and link targets.
   A file the disk cloned shares its source's bytes, so the same modification time, to the nanosecond, proves it unchanged since the clone.
   A file written byte by byte - Node's copy, a Mac whose copy cannot clone, or one whose copier refused - is checked by its SHA-256.
6. It rewrites the app's own paths in the copy, only where a whole value is a path into the older folder, by either name of it (as the app named it, and as the disk resolves it): the projects' and tasks' folders, a Pi crewmate's session file and the settings' JSON in the database, `work/installed.json` and `work/left.json`, links whose target is absolute, and git's links between working copies and repositories in the folder.
   A task held on another computer keeps its conversation file, which names that computer's file.
   Its project folder and working copy name this Mac's, and the move rewrites them with every other task's.
   A home that already moved, and so still names the older folder on those rows, is repaired the next time it opens, from the move's record.
   That computer's own move leaves its conversation naming the older folder until the next turn there ends, and the computer names its new folder in its place each time the home opens the conversation there (`docs/helper.md`, "Holding a conversation").
   Before its Pi conversation resumes there, the computer brings into its copy any turns an earlier version wrote to the older folder's copy after the move (`docs/helper.md`, "Holding a conversation").
   Prose keeps the paths it was written with, and Claude's transcript copies stay byte for byte.
   Opening the copied database replays its committed write-ahead log, so work the older app had not folded in comes over; the move then folds it in and checks every table keeps its rows and SQLite's own check passes.
7. It writes the record `verified`, writes `retired-profile.json` into the older folder, and renames the staged copy into place in one rename.
   A folder already there with no saved work - an installer's channel marker, a word's profile and its record, and nothing else - hands them over first as they are, so the newer install's marker and the word's profile are kept, never removed.
8. After that commit it changes git's links in repositories kept outside both folders, keeping each file's earlier text in the record, copies Claude's session folders under the new working folders' names (`~/.claude/projects/<encoded folder>`, beside the old ones, never changing them), and writes the record `done`.
   The working folders are read from the new folder, two levels down from it and from its `work/`: the home's `worktrees/<task>`, and the `work/worktrees/<task>` a computer that runs work keeps (`src/core/folderMove/claudeSessions.ts`).

The older folder stays as it was, with only the marker added: it is the recovery copy, and nothing deletes it.
A move stopped before its copy was checked - a restart included - leaves nothing changed, and the next launch takes that staged copy away and starts again; one stopped after resumes from the last state its record names, and never copies again.
A full disk, the older app's window still open, an older copy that will not stop (below), another launch already moving, or saved work newer than this build reads stops the move with nothing changed.

When both folders hold saved work, the hand-over asks which to open and never merges them.
Bringing the older work moves the app's own folder aside first, to `<folder>-set-aside-<time>` beside it, and names that folder in the record.
It never sets aside a folder Infinitary runs from: when this app's own program is inside it - the copy a computer that runs work keeps in `work/app` - or the background work holds its `work` folder, Bring stops with nothing changed, since a running app whose folder moves loses its helper programs and freezes (INF-5226).
A launch stopped hard before its copy was checked leaves that folder named nowhere, so the next launch puts the newest set-aside folder back in place before it asks again, when no move holds the lock, no checked copy waits and the app's own folder holds no saved work; an installer's channel marker or a word's profile written there since is kept, as when a checked copy goes in.
Keeping the app's own work records `kept-own` in its folder, so the question is not asked again, and leaves the older folder as it is.

The hand-over window (`src/main/handOver.ts`, its page in `src/main/handOverPage.ts`) is a standalone page like the refusal windows: no preload and no script of its own, its buttons a form whose navigation the window reads and stops.
It shows the move as it goes: the four steps - counting, copying, checking the copy, finishing - with the current one lit, the unit being copied by its kind and its place among its kind, with the task's short name (`the working copy of task 1a5a170a, 3 of 7`), the files and folders done of the total, the time so far and an estimate for the step at its pace so far, and why it takes this long.
While it counts, copies and checks, Quit, continue later stops the move, which leaves nothing changed as above, and quits; closing the window does the same.
It also shows the question, or why the move stopped with Try again; once the work is in it says so, turns on start at login where the older app had it, and starts the app again on its own folder.
A run from source opens `infinitary` and first moves `firstmate-3000` into it, so the move is rehearsed on a throwaway home whose `CFFIXED_USER_HOME` and `HOME` are scratch folders; the work mode makes its own move the same way.
It may stand in Firstmate 3000's folders instead with `INFINITARY_FOLDER_SPELLING=fm` (`folderSpellingFor`, `src/main/userDataDir.ts`), which opens `firstmate-3000` and moves nothing, to make an older profile to move.
A packaged app ignores it, and a development run's hand-over leaves the computer's login items alone.

A computer that only runs work opens no window, so its work run makes the same move of the whole folder before it starts, and hands its background to the new app's label in the new folder (`docs/helper.md`, "Under the other name").
A window's saved work in that folder moves with it, as the window's own move would take the work; while the older app's window has the folder open, the work runs from the older folder and tries again at its next start.

### An older copy still running

An older copy may still hold the older folder with no window: its background work, by `work/running.lock`, or a run a command started, such as one left in a terminal, by Chromium's `SingletonLock` (INF-5468's plan, piece 3).
The window's hand-over and a run's (`docs/run.md`, "Before it starts") take over from either before the move instead of refusing, and the work run from background work only, since nobody watches it stop a first mate the person runs (`src/core/folderMove/takeOver.ts`):

1. It reads the process the lock names and confirms by its program that it is Infinitary or Firstmate 3000, on a Mac from `ps` and on Linux from `/proc/<pid>/cmdline`; `work run` among its arguments is background work, `run` a command's run, and neither a window.
2. For background work it lets go of the agent the older folder's `installed.json` records, as an update's pause does (`pauseInBackground`), so the service manager does not start that run again while the move runs, unless this process is that agent's own run (`runsUnderAgent`).
   A run's own start entry, the run agent the window or `start-at-boot` sets up, stays: it starts the run again only after a failure, never after a clean stop (`docs/run.md`).
3. It sends the ordinary stop, which saves and exits, and waits up to fifteen seconds for the lock to be let go (`STOPPED_RUN_WAIT_MS`), then makes the move.

Once the holder is known to be one of ours with no window, the window, or the run's terminal, says "Stopping Firstmate 3000's background work" meanwhile.
A copy that has not let go by then is not ended by Infinitary without the person, though the service manager ends background work that ignores its stop after its own wait: the window says it has not stopped and offers Stop it now beside Quit, a run asks for yes typed at its terminal and with no terminal ends, and the work run ends for its background to start it again.
Stop it now first lets go of a run's start entry (`olderRunAgent`), from whichever file launchd loaded it - the login one, or the older data folder's while Start at login is off - which would count the forced end as a failure and start the run again, then ends the run at once.
Whenever the hand-over ends without moving before anything was committed - Quit, a closed window, a run's stop or any answer but yes, a later refusal or the question about both folders - the agents the take-over let go start again (`resumeInBackground`), so the older copy runs as it did.
The work run starts them again only when it ends without the work, to be started again itself; when it carries the work on from the older folder instead, the older agent stays let go, so the two do not take turns at the folder.
Once the move committed, the older folder is a frozen recovery copy, and nothing starts on it again.
Once the work is in, the hand-over hands the background to Infinitary's label, set up anew from the moved folder, and the older agent and its file go, as the work run's move does (`handBackgroundOver`, `docs/helper.md`, "Under the other name"), so the older agent does not start its program again at the next login.
An older copy with its window open keeps the person's own Quit and the refusal's words, and a process that is not ours, or whose program cannot be read (Windows), is never stopped, so the refusal stands.
Once taken over, a copy that holds the folder again shows the refusal, and Try again takes over once more.

The system keeps start at login per app, so the new app cannot read the older one's.
Firstmate 3000 records it in `start-at-login.json` each time it opens and each time the person changes it (`src/core/storage/startAtLoginRecord.ts`), and the move hands that record to the new app; on Linux the older app's autostart entry goes, since it would start the same program again.

## Visible refusal

`UnsupportedSavedDataError` carries the typed `unsupported-saved-data` code.
The Electron host catches only this refusal and displays a standalone offline window explaining that a newer version opened the saved work, and recommending a compatible alpha or compatible stable.
It has no preload, IPC bridge, agents, account services or normal application shell.
Closing it does not restore, delete or migrate anything.
Other startup failures retain their existing handling.

The guard does not prevent Electron from maintaining its own browser cache or single-instance files.
It prevents application-owned protected work, sign-ins, launch counters and database/derived-view changes on refusal.

## The knowledge collection

Knowledge (`docs/knowledge.md`) runs in every build and owns `knowledge/knowledge.db` with its own schema history.
Its first read inspects a private snapshot; a newer or unreadable collection stays unchanged, and no new agent work runs without its standing directions.
Knowledge schema 4 adds current directions and their future edit history, not a notes archive.
Main database schema 81 refuses earlier notes-writing builds.
Before agents start, the service carries active preferences with their identifiers, wording, scope, origin and dates, then removes the old tables.
A quit after the destination commit but before source removal retries only identical rows; a conflict stops startup.
All builds purge Knowledge after writers stop; no retired notes source can restore its contents.

## Activation boundary

Saved work is protected from stable 0.1.25 onward (`docs/alpha.md`, "Activating the channels").

## Verification

- `savedDataCompatibility.test.ts`: fresh/current/older migration history, future history, invalid and incompatible format markers, refusal preserving all seeded files, and WAL-only future migrations.
- `core.boot.test.ts`: the real startup entry refuses before account/service state is initialized.
- `saved-data-refusal.spec.ts`: isolated Electron journeys for future database and incompatible non-database format; each sees the explanation with no normal bridge and verifies protected files unchanged after quit.
  Screenshots go to the run's own results folder.
- `older-profile.spec.ts`: a profile an older release saved opens in this build and works ("Profiles saved by an older release", below).
- `src/core/folderMove/takeOver.integration.test.ts`: real processes holding a scratch older folder - background work whose recorded agent is let go first, a command's run, a window left alone, a process that is not ours, the agent this process runs under never let go, a copy that ignores the stop running on until Stop it now, and the work run bringing the work over instead of ending.
- `src/core/folderMove/move.test.ts`: the one-time move on real git and SQLite - a whole move whose newest rows are only in the write-ahead log, with Claude's sessions of the home's and the work's working copies, both names of a folder, both folders holding work, an interrupted copy, a copy that does not match, a stop before the copy is checked, resuming after the check and after the commit, a full disk, the older app open, another move, newer saved work, and Bring refused while Infinitary runs from inside its own folder or its background work runs there.

## Profiles saved by an older release

A change can keep what an older release saved readable while reading it differently, with no format revision: a new custom check profile makes every saved check an older release's (`docs/custom-api.md`, "Protocol and storage profile").
`tests/e2e/olderProfile.ts` keeps how earlier releases saved each such thing, and its `asSavedByOlderRelease` rewrites a profile set up on this build into that form while the app is stopped.
`older-profile.spec.ts` then opens the profile again, the upgrade a person makes, and checks the result they need.
The change evidence and permissions journey lives in `older-profile-delivery.spec.ts`, which shares the task and first mate readers in `tests/e2e/scenarios/olderProfileReads.ts`.
For a profile whose only connection is a custom API, the first-launch gate names that connection right after the upgrade and asks for its one fresh check, never for a subscription.
That check, from the gate, brings back Firstmate's answers, the offered models and the crew slots chosen before the upgrade, without a restart.
A task's history an older release saved - its latest result also copied onto the task's delivery facts, and card choice events that name no card evidence (`docs/task-record.md`, "The unified timeline") - reads the same after the upgrade and a restart, in the record and through the first mate's by-key `tasks` read, and a report written later takes over the result while the older copy stays saved.
Tasks an older release related by name in their work shape - a basis, the task a retry branches from and the attempt it retries - beside a parent and a dependency, read the same after the upgrade moves the names into relationship rows and after a restart, in the window and through the first mate's by-key `tasks` reads; a task waiting on open work stays unstarted, and a basis named after the upgrade reads back verified.
A change that makes something an earlier release saved read differently adds the earlier form to `olderProfile.ts`, and a journey to `older-profile.spec.ts` when the change reaches a part of the app no journey there opens.

## Custom HTTP approval compatibility

Custom connections retain the persisted `unencryptedLocalApproved` boolean and `local-no-key` credential discriminator.
These legacy names now cover approved HTTP in every network mode, and explicit no-key in local or organization mode.
No serialized shape changes: old local approvals retain their meaning; new public/private HTTP addresses and private no-key connections are rejected by older policy rather than reinterpreted as encrypted or authorized differently.
The format revision therefore stays at 1.
Fresh preparation still requires HTTP approval for the exact reviewed destination in every mode.

Extra request headers (FI3-974) add an optional `headers` list to `custom-auth.json`; a connection saved before reads it as empty and keeps its proofs.
An older app drops the list when it reads the file, and its proofs no longer match the connection's models, so it sends nothing until the person checks again.
A public connection whose headers stand in for its key is refused by older policy.
The format revision stays at 1.

## Integration name repairs

An automatic GitHub name repair saves the distinct name in the existing `integrations/settings.json` shape, preserving paused state and disabled actions.
Its explanation lives separately in `integrations/name-repairs.json`, matched to the resulting name.
Older builds ignore the new file and keep reading every setting; a later name change by an older build makes the explanation inapplicable.
No persisted format revision changes.

## A sign-in through GitHub CLI

A GitHub host's `forges/<host>/sign-in.json` may name the way `cli` and GitHub CLI's `program` and hold no `token` (`docs/forge.md`, "GitHub CLI's sign-in").
Files written before it read the same.
An older build reads such a file as unreadable, because it has no token: the row reads "signed in · checking", git gets no answer and fails at once, and the sign-in card asks for GitHub; nothing is rewritten or deleted, so the sign-in works again in a build that knows the way.
The format revision therefore stays at 1.

## MCP server keys in Secrets

Where Secrets is offered, an MCP server's line in `integrations/mcp.json` names each key as `NAME={secret:REF}` instead of its value, and at launch a line saved before moves its values into Secrets once (`docs/integrations.md`, "MCP servers").
`PATH` stays on the line as written, so a moved line reads the same in an older build for it.
Such a key's vault record, and its entry in a recovery archive, carries `forProgram: true` (`docs/secrets.md`, "Programs that keep running").
Lines and records written before read the same, and the lines move.
An older build reads a moved line as written and passes the reference itself to the program as the variable's value, so the server refuses its key; nothing is rewritten, and the server works again in a build that knows references.
A build that cannot read `mcp.json` whole, because it is damaged or a newer build saved what that build does not know, forgets no server key for seeming unnamed, so going back to such a build loses no key.
An older build still opens such a vault record, since its check covers the stored fields, and lists it as a kept sign-in.
An older build refuses a recovery archive holding a server key, because its archive schema is strict; the archive and its key stay as they are, and a build that knows the field restores them.
Each start of such a server is journaled with `given` on its request line and no approval line, and its history item carries `given: true` with no `approval`; an older build ignores the field and shows the use with no approval words, and its recovery archive takes that history as it is.
The format revision therefore stays at 1.

## An ask's how-to in waiting asks

A waiting ask in `<userData>/secret-asks.json` may carry `how`, the how-to its card draws, already checked and drawn again (`docs/secrets.md`, "How to get it").
Files written before read the same: an ask without it draws no "How to get it" part.
An older build reads a file holding `how` as unreadable, because its schema is strict, so no ask waits there and no card comes back after the restart, and its next ask rewrites the file without them; such an asker hears nothing more of that ask.
The format revision therefore stays at 1.

## Card pictures with a demo recording

A card picture may carry an optional `demo` (docs/card-authoring.md, "Demo recordings"): the recording its poster stands for - its id, kind, size, length, byte size and SHA-256.
It is saved wherever pictures are, as JSON inside `cards.pictures_json` and a card's `offer` observations, so no migration adds it, and the recording itself is a file beside the pictures in the task's `cards/` folder.
Cards saved before it read the same.
An older build reads a picture list with `demo` as unreadable, because its schema is strict: it shows neither that card on the stack nor as a past card, and nothing is rewritten or deleted, so the card is there again in a build that knows the field.
The same holds for a `demo` whose `kind` is `gif`, the single-play fallback, in a build that knew only `mp4`; its recording is a `.gif` file beside the pictures.
The format revision therefore stays at 1.

## Card answers with written words

A card answer may carry an optional `written` string (FI3-1002): the words written under a question's Something else row.
It is saved wherever answers are, as JSON inside `cards.answers_json`, the `card_resolved` event and a card's `action` and `message_ref` observations, so no migration adds it.
Answers saved before it read the same.
An older build reads an answer set that has `written` as no answers at all, because its schema is strict: a past card shows no picks and a reply its whole saved text, and nothing is rewritten or misread as an option.
The format revision therefore stays at 1.

## Brief receipts by reference

A `briefed` receipt stores each long report its brief copied as a short stand-in, such as `[report event 9540 of task 68d38170, kept on the record by reference]`, with the reference in the event's `data.reports` (FI3-390).
It is saved in the existing `task_events` columns, so no migration adds it.
Receipts saved before it carry no references and read the same.
An older build reads such a receipt's text as stored: the `tasks` query shows the stand-ins, each naming the report event a by-key read of that task lists, and nothing is rewritten or lost.
The format revision therefore stays at 1.

## Keys saved under the Tasks panel's old commands

The Tasks panel's commands were the catalog's `tasks.find`, `tasks.board`, `tasks.board-find`, `tasks.board-dropped` and `tasks.board-move`; since the panel is a folder they are `panel:now/find`, `panel:now/board` and the rest (`docs/keyboard.md`, "The Tasks panel's commands").
A key a person saved under an old id, in the `keyboard` settings row or a view's look, is read as the panel command's (`RETIRED_COMMANDS` in `src/shared/keymap.ts`), unless the panel command has a saved key of its own, which wins.
The row is never rewritten on read: the next change a person makes saves the map under the new ids, and the old ones go with it.
An older build reads keys saved under the new ids as keys of commands it does not know: listed, running nothing, kept until Reset all keys.
The format revision therefore stays at 1.

## Keys that work only when not typing

A saved keyboard binding may carry the optional `when: "not-typing"` field (`docs/keyboard.md`, "Keys used when not typing").
The field is saved in the existing `keyboard` settings row, or in the controlling computer's own look under `keyboard` (`src/main/view/viewLook.ts`); the saved map's version stays at 1.
A map without the field still passes the saved-field schema, with no condition added to its bindings.
An older build's strict binding schema rejects a map containing the field as a whole, not just the binding carrying it: every custom key falls back to the catalog's keys, and Keyboard settings says the saved keys could not be read and that changing a key saves over them.
Reading alone leaves the stored map unchanged, so returning to a build that understands the field can read it again.
Changing any key or resetting all keys in that older build replaces the stored map and loses all the previous custom keys, including those without the new field; returning to a newer build cannot restore the overwritten map.
Release and alpha share the same saved-data folder, so switching between them does not protect the map from this downgrade behavior.
No database schema or persisted-format revision changes; the compatibility limit is the keyboard settings reader, not a startup refusal.

A two-key binding may start with a plain key that carries `when: "not-typing"`, and its second key may be an arrow (`docs/keyboard.md`, "Two-key shortcuts"); the saved shape and version are unchanged.
A build that reads `when` but not these pairs leaves such a key out of its installed map, so the command runs from its other keys or by name.
That build also refuses any change while the saved map still holds such a key, naming it, until the person removes or resets that command's keys there; reading alone changes nothing, and a newer build reads the pair again.

## Keyboard presets

Since keyboard presets (`docs/keyboard.md`, "Presets") the saved map is `version: 2`: the chosen preset, its changed keys, and each other preset's changes under `kept`.
A `version: 1` map, in the `keyboard` settings row or a view's look, reads as Legacy with its changes, and is not rewritten on read; the next change a person makes saves it as `version: 2`.
A profile updated from a version before presets gets an empty `version: 1` row from the last migration in `src/core/storage/migrations.ts` when it has none, so it stays on Legacy; a new profile's fresh database skips it and starts on Vim, and a view's look saved before presets reads as Legacy too.
An older build reads a `version: 2` map as keys it could not read, as with the not-typing field above: the catalog's keys stand in, reading alone changes nothing, and a change or Reset all keys there saves over every preset's changes.

Since the tmux preset the `version: 2` map may name `tmux` as its preset and carry an optional `prefix` chord, tmux's prefix once a person changed it; the version stays at 2, and a map without them reads as before.
A build with presets but without tmux reads a map that holds either the same way as above: as keys it could not read, unchanged until a change there saves over it.

## Self-reported merge-card risk

Risk assessments keep only the crewmate's seven declared levels and reasons.
The assessment reader discards unknown historical fields, so saved cards with the former measurements retain their declaration and chart without showing measurements.
A previous build already supports declaration-only assessments, so no database migration or persisted-format revision is needed.

## Card revision links

Migration 72 adds nullable `card_messages.revision_json`, written only by CardStore for host revision rows.
It keeps typed source and predecessor offers, the frozen ordered destinations and whether the author closed out; legacy rows stay null.
Current-card destinations are a read-time projection, never a rewrite of the saved list.
An older build refuses the newer migration at the existing startup boundary.
Verified pictures additionally keep an optional SHA-256 in their saved metadata for content matching; older pictures without it retain their existing copy-name normalization.

## Retired keep-open card actions

Migration 73 drops each action whose saved `keepsOpen` is true from open cards, never only the flag, and resets their `streaming` status to `ready`.
Closed cards, revisions, steer events and recorded clicks remain unchanged.
Every outstanding `card-explain` inbox envelope becomes `{v: 1, text}` with the old rendered words frozen, including its value and answers.
In-flight and escalated rows are outstanding too: their delivery state is unchanged and a later delivery still reads the frozen prose.
`keep_open_backfill` keeps the original changed columns for each card or inbox row, keyed by source and row id, with its migration time.
To undo before any later writes, restore each card's `actions_json` and `status` and each inbox row's `payload` from that table, drop the table and remove migration 73's history row.
An older build refuses the upgraded profile until that database migration is undone.
The published `keepsOpen` field and `streaming` status stay accepted for wire compatibility but are never produced; the plugin manifest's `body.streaming` stays accepted and unread.
New action observations retain their required `keepsOpen` field as false, so historical observations remain readable.
`retireKeepOpen.test.ts` covers the upgrade, exact words, unchanged closed cards, undo rows and restart idempotence; `card-sent-settings.spec.ts` opens ready and streaming older cards and sends their settings by reply.

## Interim lines that kept an answer

Migration 113 clears `card_messages.answers_message` on each line its `message_ref` observation records as interim, and on nothing else (INF-2730).
Such a line ended no captain question, so the cleared value was never a real answer; it only made the author's later answer read as a comment, and the card kept waiting.
A real answer keeps its message, and a comment saved behind an interim line stays a comment: the repair never turns an earlier line into the answer, so a card that was waiting still waits for its author's next line naming the message.
A line with no observation, written on a card with no lifecycle, keeps what it had.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
Nothing reverses it, and nothing needs to: an older build reading the cleared line sees an interim line that answers nothing, as it should have.

## What an automation run found

The newest migration adds nullable `schedule_runs.found`, the closing words of the first mate's turn that handled the run (`docs/automation.md`, "Deliveries").
Runs handled before it, waiting runs and cancelled runs keep null, and History shows no Found line for them.
The retention rewrite of words from outside covers it as it covers the run's prompt and event summaries.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").

## What each device is

The home keeps what each device said it is in its hello - its system and chip - in `devices/systems.json`, a file of its own beside the device list (`docs/devices.md`, "The saved list").
The list itself keeps its shape, so an older build reads it as before and never reads the new file.
A `systems.json` this build cannot read is left as it is, and every device reads as a computer until it can.
The format revision therefore stays at 1.

## Where a phone's cards are pushed

The home keeps each paired phone's push registration in `devices/pushes.json`, a file of its own beside the device list (`docs/phone-push.md`).
The list keeps its shape, so an older build reads it as before and never reads the new file; a home move carries the file with the list.
A `pushes.json` this build cannot read is left as it is, and no phone's cards are pushed until it can be read.
Which phones take withdrawals is in `devices/push-withdrawals.json`, never in `pushes.json`, whose strict schema in an older build would read a new field as a file it cannot read and push to no phone.
An older build ignores the new file, keeps pushing cards and sends no withdrawals; it leaves the file as it is, so a phone that stopped taking withdrawals under the older build may still be sent one by a newer build until its next welcome.
The format revision stays at 1.

## Learned allowance prices

INF-443 piece 3 keeps learned points per dollar in the existing settings row `allowance-prices`, keyed by login pool and window.
Older builds ignore that setting and the additional candidate charge facts in `decisions.facts_json`.
The optional `usage_events_account_at` index on `(account_id, at)` is installed on opening the current schema, without a migration version or changed table shape.
The observation intervals themselves are not saved.

## Task status indexes

The optional `tasks_status` index on `status`, `tasks_kind_status` index on `(kind, status)` and `tasks_closed_at` index on `closed_at` are installed on opening the current schema, without a migration version or changed table shape.
They let the crew's status reads and the Tasks board read the live set and the last week without scanning a long record's older closed rows, and the first launch's crew facts find one task of a kind without reading every task.
An older build reads the table as before and keeps the indexes up to date on its own writes.

## Task event reference index

The optional `task_events_ref` index on `(kind, ref)`, over the events that carry a reference, is installed on opening the current schema, without a migration version or changed table shape.
It lets the reads of the tasks a message or a card names (`TaskEventStore.taskIdsWithRef`, `latestTaskForRef`) seek their rows instead of walking every task event, which the first mate's open messages do before and after each of its turns (INF-2059).
The stronger-model moves (`TaskEventStore.escalatedTo`) are sought the same way, so the Tasks board names what replaced each dropped row without reading that task's timeline (INF-2070).
An older build opens the same database, reads the table as before and keeps the index up to date on its own writes.

## Task event actor index

The optional `task_events_actor_at` index on `(actor, at DESC, id DESC)` is installed on opening the current schema, without a migration version or changed table shape.
It lets the first mate's captain-click context seek the captain's recent events instead of walking every actor's events in the same time window (INF-2284).
The read keeps its existing timestamp boundary, source filter and newest-first order.
An older build opens the same database and keeps the index up to date on its own writes.

## Retired task fields

A work shape's `knowledge_access` and the delivery facts' `landedAt` are retired (INF-1288 piece 3): the first has granted nothing since every crewmate's knowledge became equal, and nothing read the second.
A row an older build saved keeps them on disk, and `TaskStore` leaves them out when it reads the row, so no surface shows them.
The row's next write of its shape or its delivery facts no longer carries them; a closed row that is never written again keeps them on disk, unread.
An export an older build wrote imports without them, because the export's shapes drop a field they do not list.
Both were optional, so an older build reads a row without them as before, and no database migration or format revision is needed.

## Task references

Migration 95 moves the names a task's work shape kept of other tasks - `basis`, `branch_from` and `escalate_from` - into rows of `task_references`, one per task and kind, in the migration's own transaction before any service starts (`docs/task-record.md`, "Relationships").
Each name moves exactly as saved, a key or an id, with the task it resolves to then; an empty name named nothing and moves nowhere, and a basis naming no task moves as named.
Who named it and when were never saved, so they stay empty on a moved row.
The shape the app reads still carries the three names, composed from the rows, so no surface reads them differently; `v_tasks_v1` reads its `basis` column from the rows.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
An export this build writes keeps each name in the task's shape beside the task's `references`, so an older importer reads the names it knew and drops the rows, and an export an older build wrote imports here with each name made a row, its actor and time empty.

## Running work and policy inputs

Migration 97 moves each task's running work off its task row into a `task_execution` row, and migration 98 moves the policy inputs out of its work shape into a `task_policies` row, each in its own transaction before any service starts (`docs/task-record.md`, "A task's execution record" and "Live task policies").
Each value moves exactly as saved: the resume token, computer, account, placement, idle clock, recovery rung and start notice, and the current turn's declarations from the delivery facts; the asks made at filing and the live edits, an explicit `false` and a reset to the project included.
A resume token names the conversation `task_sessions` records for it, and a token from before conversations were recorded names none.
A shape value of another type than its field declares stays in the shape, and the closed policy snapshot stays on the delivery facts.
A task with nothing running has no execution row and reads the defaults it read before.
The task row's columns stay, emptied, so the published views read the same, and `v_placements_v1` reads the execution rows.
An older build refuses the profile, because its migration history names migrations it does not know ("Before services start").
An export this build writes carries the binding's conversation on the task's line, which an older importer drops, and an export an older build wrote imports here with the conversation named as the migration names it.

## Change evidence and permissions

Migration 99 moves each task's delivery facts out of the delivery column into a `task_delivery_evidence` row and a `task_permissions` row, and its settle that has not run off the task row into the permissions row, in one transaction before any service starts (`docs/task-record.md`, "A task's change evidence and permissions").
Each value moves exactly as saved, a `null` and a field this build does not know included, and the delivery column keeps the closed policy snapshot and an older result copy.
A kept merge approval keeps its approved version, its repairs and an attempt whose answer never came, so the boot reads that pull request back and never sends the merge again.
The migration makes no consent: a permission is only one the profile already held, and nothing is sent, granted or resumed by the move.
An unreadable delivery or settle stays where it was saved, read as before.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
A record export carries the same delivery facts as before, with no permission, so an import either way grants nothing.

## Retiring mixed task storage

The task-record retirement migration switches specification and remaining shape writers transactionally before services start.
Immutable specifications keep the current older words without fabricating an earlier author or timestamp; future edits retain their earlier revisions.
Typed family records replace the mixed shape column, while unknown older shape fields and unreadable evidence remain preserved.
Superseded execution copies and mixed task columns are removed only after their consumers use the owned records or the read-only compatibility projection.
Older-format imports remain supported; specification histories in newer exports preserve their revision order through local identity remapping.
This is a forward migration, not permission to open the profile with an older app or to reverse it over subsequent work.

## The change record

Migration 106 makes the change record's two tables, `changes` and `change_versions`, and one change for each open or active task that carries one, read out of its delivery facts exactly as saved, in one transaction before any service starts (`docs/task-record.md`, "A task's change").
The delivery facts stay where they were and every reader reads them there: the migration moves nothing and makes no consent, because a version's consent is only the click, carried approval or override the profile already held.
A version is a head the project's host saw - a check read, an owned merge review, a published story, a merge click and its repairs, a merge card, or an override given for one version - never a review, a lines reading or a story prepared at a head not yet pushed, and never another branch's pull request's head on the task's own change (`docs/task-record.md`, "A task's change").
Since INF-2490 each other pull request a task names is a change of its own; no migration makes those rows, because the task's next write projects them, and a saved review's `owned` or `referenced` word is read as its branch says.
Each change keeps its own saved story: a story saved before then names no branch and is read as the task's own branch's, and the next write places it in `presentation` or `presentations` by which change is current.
A merge card saved before then names no change it was shown for (`shownFor`) and is read by its pull request number, as before.
The record binds a reading and a version override to the pull request they name (INF-1873): a reading saved by a release before this one carries no pull request (`CheckSnapshot.prNumber` is this release's stamp), and the older override writer saved none either.
Such a reading or override is read as the task's own change's only in a slot that records no other branch's pull request; in a slot that does, the host cannot tell whose it was, so the record leaves it out rather than bind it to the wrong change, and the migration rewrites nothing to recover it.
The loss is only in the record: the delivery facts keep the reading and the override, and every gate still reads them there; the first reading after the upgrade is stamped and makes the version's checks.
A version's date is the earliest time a saved fact gives it; a version no fact dates comes after the dated ones, and the current head comes last.
A task closed before this release gets no change and is read as before.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
A record export carries the task's delivery facts as before and no change row, and an import projects the change from them again.

## The review's edge

Migration 107 removes the `blocks` edge the host recorded from each review it raised onto that review's builder, live or closed, and nothing else: a `blocks_me` filing, a required action's prerequisite and a wait the first mate recorded keep their rows and their marks.
The host no longer holds a builder's merge on its review (INF-1876): whether a merge waits for the verdict is the care runbook's guidance, and the parent edge stays the one stored review-to-builder join.
A builder whose review was open at the upgrade is read as waiting on nothing, and its merge card is refused only by what still holds it.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
Nothing reverses it: the edge was the retired hold's own record, and the review's verdicts stay on the builder's timeline.

## Linux automatic startup capability

The work folder's optional `automatic-startup.json` records the last Linux setup outcome with its own versioned schema.
It is separate from `installed.json`, so an older app still reads the same service and app paths and can remove what it installed.
A missing or unreadable startup record supplies no capability claim, and the current cleanup owner removes it with the installed record.
The home's `systems.json` records optional automatic-startup capability beside system and chip.
An older strict reader treats that metadata file as unreadable and preserves it without rewriting; the device list and joins remain in their existing files.
No database migration or saved-data format boundary changes.

## Keep cards maximized

Keep cards maximized and whether cards are maximized now live in a settings row of their own, `card-maximize`, beside the `appearance` row (`SettingsStore.getAppearance` and `setAppearance`).
An older build reads `appearance` strictly, so neither goes in it, and it still reads theme, size and wash; it ignores the new row and opens cards at Default card size.
A look written without them keeps the saved row.

## The language choice

The language the captain chose in Settings → Appearance lives in a settings row of its own, `language`, beside the `appearance` row (`SettingsStore.getAppearance` and `setAppearance`).
An older build reads `appearance` strictly, so the choice never goes in it; that build ignores the new row and speaks its own default language.
A look written without a language removes the row, which means the default language.
A saved language this build's catalog lacks, such as one a newer build added, falls back to the default language too (`chosenLanguage`).

## The font choice

The fonts the captain chose in Settings → Appearance live in a settings row of their own, `fonts`, beside the `appearance` row (`SettingsStore.getAppearance` and `setAppearance`).
An older build reads `appearance` strictly, so the choice never goes in it; that build ignores the new row and writes in Infinitary's own fonts.
A look written without fonts removes the row, which means Infinitary's own fonts.
A saved font this computer lacks stays saved, and the window draws Infinitary's own font in its place (`docs/fonts.md`).

## A task's pin

Migration 122 adds the `pinned_at` column to `tasks`, empty on every row, and a partial index over the pinned rows, so the board reads the few pinned tasks without walking the record (INF-3127).
No row changes: every task starts unpinned, and nothing else reads the column.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
An export this build writes carries the pin on the task's line, which an older importer drops, so a pinned task imports there unpinned.

## A level's wait and its cause

A migration adds the `gate_cause` column to `tasks`, empty on every row, which keeps waiting for allowance as before.
It holds why a level's gate holds a premium ask or a stronger-model retry that no allowance reset can start (`TaskGate.cause`, `docs/task-record.md` "A held task says why"): no model placed at the level, or none there reads the pictures the task carries.
Only the hold that routed the task writes it, and every other gate write clears it with the gate.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
An export this build writes carries the cause on the task's gate, which an older importer drops, so the task imports there waiting for allowance until its next start sets it again.

## The rails' saved arrangement

Since INF-2344 the rails keep one arrangement of every panel's slot and order, and the last More pick, in a settings row of their own, `panel-arrangement`, beside the `layout` row (`SettingsStore.getLayout` and `setLayout`, `docs/ui-plugins.md` "Preferences by talking").
An older build reads `layout` strictly, so the arrangement never goes in it: the `layout` row keeps only the collapse, hide and placement records an older build knows, and it still parses them.
The first start of a build that has the arrangement writes it in from where the rails drew each panel, the saved `placements` and the `panelOrder` More picks included, so no panel moves.
Nothing writes `placements` or `panelOrder` after that, and neither is removed: they place only a panel the arrangement does not list yet, and an older build reads them as before.
A move made in a newer build is therefore not seen by an older one, which draws the panels as they last stood before the arrangement.
A reset of the panels from Settings → Panels clears both, so an older build then draws every panel where it asks to be.
No database migration or saved-data format revision is needed; the settings table takes a new key as it is.

## Antigravity accounts an alpha connected

An alpha connected a Google AI plan through the installed Antigravity program; the app no longer offers it.
Its account's registry row, under the provider id `google-antigravity`, and its empty store folder stay on disk, and every live read skips them (`RETIRED_PROVIDER_IDS`, `src/shared/providers.ts`), as with Cursor.
No row, chip, model, allowance or routing candidate comes from it, and the program's own sign-in is left as it was.
A task that ran on it is refused a resume with the words that it ran on a subscription Infinitary no longer offers, and its waiting guidance stays on its record (`CrewSessions.retiredProviderOf`).
Its pushed allowance readings stay in `pushed_quota`, and nothing reads them.

## What the team queue left saved

Infinitary no longer ships or reads a team queue in a project (`docs/forge.md`, "A project that still carries the team queue's files"), and what earlier builds saved for it stays where it is.
No migration runs and no column is dropped: the project row's columns for the queue's workflows, answers, pause, waiting choice and key stay, and nothing reads them.
One of them carries a new fact: `queue_offered` kept the queue version last offered, always 1 or more, and now holds 0 once the app has looked in the project for the queue's files (`RepoRegistry.teamQueueLooked`).
The saved delivery `queue-pr`, a kept approval's wait on `queue`, and a task's `queueStatus` keep their names, since batches of the person's own write them.
A task's saved mark of a version waiting for the queue, and a saved `answered` declaration, stay in the record as history, and nothing reads them.
A wake of a removed kind that waited in the inbox when the app updated is served once as data the first mate cannot act on, and asks for nothing.
A card an earlier build put up while a batched choice waited for a queue workflow comes down at the first start, with its reason.
The Batched pull requests runbook's switch was saved under `queue` and is read under `batches` (`SettingsStore.getRunbookStates`), so a person who turned it off keeps it off; the saved row is rewritten the next time a switch changes.
An older build that opens the profile again reads that 0 as a queue version it never offered, so it may offer its queue once more in such a project, and once the row is rewritten it finds its own switch absent, which means on.

## Builds of the home's source

The home's pairing folder keeps `source-builds.json`, the computers the captain allowed to run the home's code (`DevicePairing.noteSourceAllowed`, `docs/devices.md`, "Matching the home's build"); a missing or unreadable file allows none, and a computer's entry goes when it is removed.
A computer that runs work keeps each build of the home's source in its work folder's `source/<commit>`, with `infinitary-build.json` (version 1: the commit) beside it; its agent may name that build's Electron, which an older app reads as any launcher it did not write.
No database migration or saved-data format boundary changes.

## One thread per message

The newest migration adds `ask_thread_carries`, filled once with each followed, unended captain message and the message whose merged thread it was in, read from `captain_asks.continues` (`docs/task-capture.md`, "How a message ends", **The update**).
The step at the next start attaches each listed message to its old thread's still-running work as `host:carried` and marks its row carried; no row is added after the migration.
`continues` keeps its saved values and is never written again.
An older build refuses the profile, because its migration history names a migration it does not know ("Before services start").
Dropping the table and removing its history row undoes the migration; the carried attachments stay as `ask` events, which an older build reads as the message's work but not as work its tools acted on.
