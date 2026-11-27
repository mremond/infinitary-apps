# Fleet management

How repositories are set up, configured and unregistered, and how delivery and autonomy are derived and enforced.

## Asking the first mate to add a project

The first mate may propose a project at any time: on the captain's message, after a crewmate's report, or on its own judgment (the captain's direction A on FI3-1531, built in FI3-1532).
Its `app_change project-setup` never adds one; the line is tier `hands` with `proposes`, so `app_change` hands the value to `ProjectSetups.propose` (`src/core/workspace/projectSetups.ts`) at any wake, and the dispatcher refuses a first mate actor on `inf:repos:setup`.
The value is the setup spec (`clone` with `origin`, `init` with `name`, `adopt` with `path`, each with an optional `key`, below) plus what the first mate suggests: `delivery`, `autonomy`, `rigor`, `runsOn` (`automatic`, a computer that runs work, or null), and `work`, the waiting work it starts once the project is added (`projectSetupProposalSchema`, `src/shared/projectSetup.ts`).
`RepoRegistry.check` reads what the setup would do without writing anything: the name it would get, where the project lives, whether a plain folder would get git, and the task key it was asked to take.
A project already on the list - the same folder, or another project with the same origin - gets no card, and the first mate is told its name and id; a request setup would refuse is refused in the same words now.
Otherwise the host puts up one card it writes itself (design skill `components/projects/SetupCard`), under an id made from the project, so asking again for the same project revises that card.
It names the project, where it comes from and how it lands on this computer, and the task key when the first mate named one, then the rows of its Settings entry: Runs on (when it has a remote), Where changes go, Ask before merging and Care, with the first mate's suggestions selected and today's defaults otherwise.
Runs on defaults to Automatic for a project with a remote; an explicit This computer selection stays explicit.
A folder with a remote is linked where it is by default, and the card offers a fresh clone into the projects folder instead.
Add project and Not now carry host ops (`add-project`, `decline-project`) whose argument is the card's own offer; an effect is never declared to the body's frame, so only the captain's click on the card's own button adds a project.
Add project runs, as the captain, the same dispatcher Settings uses: the setup, then the settings the captain chose that differ from the new row, then Runs on; each writes its own feed line and operation, and all are saved before the first mate hears.
The first mate then hears once, as an `[fm-op]` `project-setup` wake: added with its settings and the work the card named, which it starts; already on the list; not now, from the explicit Not now button; or failed with the reason, carrying a clone's typed sign-in refusal (`docs/forge.md`).
Putting the setup card aside leaves its offer and operation row pending and sends no setup outcome.
That wake skips the inbox's coalescing window, so the first mate answers the click at once (`docs/inbox.md`).
Settings' own Add project adds at once and shows no card.
A folder dropped on the main message box puts up the same card with today's defaults, opening with the folder the captain dropped instead of the first mate's ask (`ProjectSetups.offerFolder`, `docs/composer.md` "Files"); the first mate never asked, so it hears nothing of that card's answer.

## A folder that is not there

An `adopt` path reads from the home folder unless it is absolute, and `~` is the home folder, so "projects/meter" means the folder the captain would say.
A proposal for a folder that is not there is refused before anything is checked or carded.
The refusal names the folders `locateProject` finds for the path's last part (`src/core/workspace/projectLocator.ts`), each already a project with its id, and tells the first mate to ask on one decision card offering each folder the captain may have meant and a Choose folder action.
A Choose folder action is an open effect with target `projects` and `folder: true` (`openEffectSchema`, `src/shared/cards.ts`).
In a window on the first mate's own computer its click opens the system's folder picker and adds the folder picked as Settings -> Projects does (`pickProjectFolder`, `src/renderer/src/app/projectFolder.ts`), and only then sends the click, so the first mate hears it once the project is on the list.
Cancel keeps the card up and sends nothing, and a refusal shows on the card.
A view, or a window from before the flag, opens Settings -> Projects instead, as an open effect with target `projects` always did.

## Adding a repository to a project

A project may hold several repositories, and each task works in one of them (`docs/architecture.md`, rev-11).
A repository joins a project when it is added, or later by a move ("Moving a repository to another project" below): setup's `project` names the project by its task key, and the repository's tasks take that key.
`project` and `key` are never both given, and Scratch, the personal workspace and an unknown key are refused in words before anything is cloned, created or linked (`RepoRegistry.joining`).
The first mate passes `project` to `project-setup`; the setup card then asks "Add {repository} to {project}?", shows a Project fact instead of Task key, and its button reads Add repository.
Settings' Add a repository button adds to a project at once: it follows the last repository tab on every project's page, a project of one or several, and its form opens inside the page's Repositories panel.
A repository already added moves to another project with `project-move`, below.
Delivery, autonomy, rigor, scope and Runs on stay with each repository, and the project's directions reach every repository in it.
A project of several has a name of its own, which the Name field in its page's Project box and the first mate's `project-name` action change through `inf:projects:rename` (`RepoRegistry.renameProject`), with one feed line and operation; a project of one is named with its repository and renamed with it.
A project that shrinks back to one repository takes that repository's name again, in the same transaction that removes the other (`RepoRegistry.unregister`).

## Moving a repository to another project

`project-move` moves one or more repositories into another project in one step (`inf:repos:move`, `src/core/dispatcher/repositoryMove.ts`, amending rev-11's remove-and-add-back with rev-12 in `docs/architecture.md`).
Its `project` names the project they join by its task key, or `{ own: true }` for a project of its own, with an optional `key` for a new one.
Each repository keeps its id, name, folder, delivery, autonomy, rigor, scope, cost limit and Runs on: only its project changes (`ProjectStore.moveRepositories`).
Every task keeps its key, whatever project it joins, so a task key names one task forever.
A project the move empties joins its target whole: all its tasks, open and closed, and every automation about it join the target, and it leaves the project list archived, with its key reserved and the project it joined recorded (`projects.combined_into`), which the key's refusal names whatever moves later.
A project that keeps some repositories gives up only the tasks that work in the repositories that move; one left with a single repository takes that repository's name again.
A move that would put an open task and its open part in different projects is refused, naming both, before anything is written (`TaskService.joinWithRepositories`).
A project of its own brings back the archived project the repository was made with, with its key and numbering, and otherwise makes a new project; one repository moves to a project of its own at a time.
Scratch, the personal workspace, an unknown key and a target that already holds the repository are refused in words (`planRepositoryMove`, `src/core/workspace/repositoryMove.ts`).
The repositories, their projects and tasks, the archived projects and the automations change in one transaction, and the board refreshes once it commits.
Directions follow without a write, since a project's directions reach every repository it holds.
The first mate applies a move the captain named exactly with `on_words: true`; otherwise `ProjectChanges` puts up one card per target, "Move {repositories} into {project}?", whose table shows each repository's project now and after the click, and lists the open tasks that join, how many closed tasks follow, the automations that move and the keys that leave the list.
Its words are saved facts (`projectsMove…` messages, `MOVE_CARD_SAID`), so each view words the card in its own language when it draws it, and a view that cannot shows the English the card saved; names and keys stay as they are.
Its Apply move applies the move once and Not now declines it, and the first mate hears the outcome once through `project-change`.
The card keeps one digest of what it showed, the move and the tasks and automations that go with it (`moveFingerprint`), and `inf:repos:move` refuses a click whose digest no longer matches, in the same run as its write.
Settings offers the same move on each repository's page, on its Move line above Remove (`MoveRepository`, design skill `components/projects/MoveRepository`): a chosen project, or a project of its own when the repository shares its project, asks once in place and then calls `inf:repos:move` at once, with no card, as Add a repository does; the catalog's `project-move` line writes its feed line.
Combining two projects is moving the repositories of one into the other, never removing and adding them back.

## Adding a removed project back

Removing a project removes its row and its fleet-root link and deletes no folder, so a project cloned into the projects folder leaves its folder there (`RepoRegistry.unregister`).
Adding it back links that folder where it is instead of cloning a second copy beside it named with -2 (`RepoRegistry.leftFolder`, `src/core/workspace/repoRegistry.ts`).
A clone looks under the name it would take and each numbered name after it, up to the first free one, in the projects folder and in the fleet root, where projects went before another folder was chosen.
It takes a real folder that no project holds, that is the top of its own git repository, and whose remote is the same project: the same address, or the same owner and name on the same host however the address is spelled, ignoring case where the host does (`sameProject`).
A folder in a chosen projects folder is taken only while its name is free in the fleet root, where it is linked again.
Picking that folder links it in place too, in Settings or through the first mate's `adopt`: a real folder directly in the fleet root is accepted, and one a project still holds answers as that project.
The fleet root itself, a link in it, a folder inside a project and the personal workspace are still refused as already inside the fleet root.
The project comes back with a new id, a task key derived anew because a removed project keeps its key, and today's default settings; its tasks and settings stay with the removed project.
The setup card names the folder and says it is linked where it is, with no fresh clone to choose, and Settings says the folder was linked instead of cloned again; `inf:repos:setup` answers with `leftFolder` (contract change `setup-left-folder`).

## Choosing a task key

A project's key prefixes every task key it mints, such as `INF` in `INF-12`, and it is chosen once, when the project is added (FI3-1787, step 4 of the Infinitary rename).
Settings' Add project row has an optional Task key field that the next folder, repository or new project added there takes; `project-setup`'s `key` does the same through the setup card, whose Add project and fresh-clone choice both keep it.
With no key, the app derives one from the name (`deriveProjectKey`, `src/core/tasks/projectKey.ts`), as it always has.
A chosen key is normalized to capitals and refused in words when it is not 2-4 letters or digits, or when any project has it, Scratch and a removed project included, because a closed task's key still names one project (`freeProjectKey`, `src/core/storage/projectStore.ts`).
The refusal comes before anything is cloned, created or linked, and for a clone it is never turned into a sign-in refusal.
A project already on the list is answered as it is, with the key it has.

## Changing a project

Settings and the first mate use the same action catalog and dispatcher for every project change.
`project-settings` changes scope, delivery, autonomy, rigor, display name, folder and approved hosting address; `project-runs-on` changes where its next task runs.
The global `projects-folder` setting still changes where new projects go on typed captain words.
The first mate applies an exact change the captain named in the captain's words, quoting them as evidence, wherever they reach it: the captain's message, one the captain sends while a turn runs, the captain's reply a crewmate relays, or a schedule the captain set (INF-751).
The first mate declares that judgment with `on_words: true`; an omitted declaration proposes instead.
The exact-words judgment belongs to its tool guidance, not a host parser.
Every other proposal, including an ordinary agent-card choice, reaches `ProjectChanges` (`src/core/workspace/projectChanges.ts`) and gets an app-written card showing the old and proposed values.
Only that card's Apply change button applies the stored patch once; Not now declines the proposal without a change.
The minus keeps the proposal pending without applying or declining it.
The host refuses a card if the saved project changed since the offer, and revalidates the folder, address and devices on applying.
The first mate hears the outcome once through `project-change` and reads current values before starting work that needs it.
Removal still needs the captain's typed words, and adding still uses the setup card above.
The personal workspace remains locked and takes no scope.

Scope is optional free text describing what work belongs in the project.
Settings saves it with Save details, and talking uses the same exact-words or Before/After proposal path; null clears it.
The first mate sees every project scope on attachment, after successful compaction, and after any project or scope change, never on an unchanged next turn.
Only the first mate judges scope fit; an explicit project wins and follow-ups stay with their work.

Name changes keep the project's id, key, sequence and task history, and update its fleet index without moving its files.
Folder changes point at an already moved, existing git folder, are refused while tasks are planned or working, and never move files.
The app refuses a folder belonging to another managed project, or a new folder while the old one still exists.
Where it lives is the approved address, not whatever git currently says.
The app notices a changed origin at startup and before starting a task, and proposes the exact address on the same card; no detection writes the registry or moves its API write fence.
The address must still match git when the captain approves it, and a read failure never clears an address.
Detection and registration read the configured origin address before git's transport rewrites, so a local mirror does not become the approved hosting address.
Removing the origin also chooses Local merge and returns Runs on to this computer.
A project with no approved address cannot choose Pull requests in Settings or through the first mate.
The expanded Settings row offers Name, Scope, Folder and Where it lives with Save details, using the same dispatcher; its hosting field accepts the address the folder already points at rather than editing git configuration.
How a project joined, its key and its workspace kind are provenance, not editable settings.

## Notes

Moved verbatim from `AGENTS.md` on 2026-09-24; `docs/README.md` lists this page.

- Adding and configuring projects are shared by Settings and the first mate through `app_change project-setup` and `app_change project-settings` (`src/shared/actions.ts`); the first mate's `project-setup` puts up the setup card above, and only the captain's click there adds; removal is the own-words `project-remove` line (`inf:repos:remove`, guarded by `inf:repos:removal`), and `unregister_repo` is retired.
  The app-owned fleet root is `userData/fleet` (`paths.fleetDir`), the index of every managed repo: clone/init create real directories in the projects folder, which is the fleet root unless the person chose another folder in Settings → Projects (the projects folder's line under Add project, `RepoRegistry.setProjectsFolder` over the `projects-folder` settings row, picked with the shell's `inf:app:choose-folder`); a project created or cloned in a chosen folder gets a fleet-root symlink exactly like an adopted one; adopt links an existing folder in place via a fleet-root symlink (captain's call - adopted data never moves), and a folder a removed project left in the fleet root is linked where it is ("Adding a removed project back" above), so `RepoView.path` is always the real working directory.
  Changing the projects folder never moves a project already set up.
  A chosen folder is refused, with the reason beside the row, when it is not there, sits inside the app's own data or inside a managed project, or cannot be written to; one that has gone missing since (a drive not plugged in) refuses the next clone/init rather than being created anew.
  The person changes it in Settings or asks the first mate to change it on their own words through the action catalog's `projects-folder` line.
  Each repo carries a workspace KIND (`repoKindSchema`: `project` | `personal`, migration 37 - the personal workspace is a kind, never a posture), a delivery posture (`direct-pr` | `local-only`, defaulted by remote presence - new postures extend `repoDeliverySchema` in `src/shared/repos.ts`, the seam a future validation pipeline plugs into) and an autonomy flag (on = the agent may land green work itself).
  Autonomy has delivery's and rigor's shape since contract v3.9 (captain ruling F7 A, 2026-09-20): the repository column is the default, `spawn_crewmate autonomy_ask` carries the captain's own words for one task, and `autonomyFor`/`autonomyForRecord` in `src/shared/repos.ts` is the one derivation - the ask (read by PRESENCE, so `false` is an ask), then the repo; a repo-less task, a personal-workspace task and an answer task are not held at all - no standing answer to enforce, and no merge to hold (v3.8's deliverable refusal speaks first on the last).
  The HOST enforces it, not just the prompt: `settleTaskOnce` refuses a first-mate-actor `merge-pr`/`land` on an autonomy-off task with the structured `autonomy-off` `SettleRefusal`, whose one way out is the open merge card's own merge action (a `SettleWay` carrying a `card`, not a `tool`), unless the app holds that card's Merge after its change moved on, when it offers no way and says the card waits for its crewmate, or no card is up because the captain's click already approved the merge and that approval stands, when it offers no way and says the host merges once the gates pass and the click is no override (INF-4525); a captain click (`actor: "captain"`) is never refused.
  The mint stamps `WorkShape.autonomy` as provenance the quiet way rigor is stamped, while every decision derives the effective value live; `SettleFacts.strip`, `crew_status` and the context crew lines carry it per task.
  Removal refuses while tasks are on the repo (naming them by key) and never deletes repo data.
  Setup and removal are shared with Settings; Settings → Projects can set delivery, autonomy, standing rigor, Require pull request checks (`docs/forge.md`, "A project with no checks") and a GitHub project's Advisory workflows (`docs/forge.md`, "Advisory workflows") on each project's own page, on the same row `app_change project-settings` writes (`inf:repos:configure`) and still follows `repo_setup`/`repo_configured`/`repo_unregistered`.
  The autonomy row reads "Ask before merging" (`AUTONOMY_SWITCH_NAME`); its right-anchored switch is on and says "Asks first" when autonomy is false, and off and says "Merges on its own" when autonomy is true (`AUTONOMY_WORDS` in `src/shared/vocabulary.ts`).
  Its click writes the inverse flag; the locked personal workspace reads "Merges on its own" without a switch.
  A project's line in the Settings list says "merges on its own" when the stored flag is on and nothing when it asks first, the default (`projectRowWords` in `src/renderer/src/settings/projectsWords.ts`), and the feed uses the same words in lowercase mid-sentence.
  Settings may add, move and remove projects through `app_change`'s dispatcher.
