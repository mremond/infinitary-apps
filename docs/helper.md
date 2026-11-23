# Running work for another Mac

How the app runs a home's work on another computer - a Mac or a Linux computer - or as another user on the home's own computer, with no window (`docs/architecture.md` §9).
It is the app itself, started in a mode of its own; it joins the home as a Mac (`mac`, which may also control the home from Infinitary opened there), or as another user on the home's own Mac, which only runs work (`work`, `docs/devices.md`), and dials it over the connection as its work (`docs/connection.md`).
Its words in Terminal are the design skill's `components/devices/AddAMac`; a person never reads the word helper, which the code uses for this part.

## What it is

- **The app's own executable, started as `<app> work <command> ...`.**
  The main entry (`src/main/index.ts`) reads the words after `work` before anything of the app loads (`workCommand`, `src/main/workCommand.ts`) and loads `runWorkMode` (`src/main/work.ts`) instead of the app (`src/main/app.ts`).
  Each is a chunk of its own, so none of the app's modules are evaluated: no window, no core, no single-instance lock.
  When that module loads, before the app is ready, it registers the frame scheme's privileges alone (`src/main/frames/frameScheme.ts`), the same ones the window registers with the shell's other schemes, so a demo recording can play in the hidden window that checks it.
  It sets its activation policy to `prohibited`, so macOS lists it as background-only, with no Dock icon or menu bar.
  It is still listed under the app's own identity, so where it runs the app a person clicks, as a Mac joined at its window's first launch does ("A Mac that also controls" below), a click on Infinitary in the Dock, Spotlight or Finder, or `open -a`, reaches it instead of starting the app.
  It then opens the window as a home's background command does (`docs/run.md`, "No window"): it hears macOS's reopen (`activate`), puts itself back in the background, and opens the app beside itself as a new copy through macOS's `open -n` (`openWindowOnReopen`, `src/main/runReopen.ts`).
  That copy starts as any launch does: a view of the home this folder's grant names (`docs/view.md`, "A Mac that runs work"), or, for another user's work on the home's own Mac, that user's own Infinitary; with a window already open, it brings that window forward through the single-instance lock instead.
  On Linux it draws on a display of its own (below, "No screen needed").
- **One process.**
  Nothing is drawn and the connection is Node's own, so hardware acceleration is off and Chromium's graphics and network services run as threads of the app's process (`in-process-gpu`, `NetworkServiceInProcess2`) rather than as processes beside it.
- **The core's windowless composition** (`src/core/helper/`) does the work, on the Node.js already inside Electron; it imports no Electron, like the rest of `src/core/`.
  `src/main/work.ts` only gives it the app's version, where its data lives, and the Terminal it was started from.
- **No new program ships.**
  Electron's run-as-Node switch stays off (`electronFuses.runAsNode`, §4): with it on, any program could run its own code as Infinitary, with Infinitary's microphone and Keychain grants.
  The work mode runs only Infinitary's own code, from the archive the fuses already pin, and joining still needs its person's typed yes.
  On another Mac, the whole app is what the one command gets from the home and keeps in the data folder's `app/` (`docs/devices.md`, "Joining by a command").
- **Terminal shows only what it says to its person.**
  The notes its parts leave on the console go to the folder's `work.log`; an error stays on stderr.

## Where it keeps its data

`userData/work/` for the app's flavor - `<appData>/infinitary/work` for the release and for `pnpm dev`, `<appData>/infinitary-dev/work` for the local dev bundle and a run from source whose data or work a test isolated (`runFlavor`, `src/main/userDataDir.ts`) - in the home folder of the macOS user it runs as (`helperPlace`, `src/core/helper/place.ts`).
Nothing else in that folder is opened: not the record, not the single-instance lock, not a sign-in.
Only a development run reads `INFINITARY_HELPER_DATA_DIR`, which tests use to isolate it.
`work/` moves with the rest of the data folder when Infinitary moves an older folder in (`docs/saved-data-compatibility.md`, "The one-time move"): the move rewrites `installed.json` and `left.json`, and git's links in `repos/` and `worktrees/`, to name the new folder.
A move waits while the older app's run holds `running.lock`, and leaves behind what a live process still writes: `chromium/`, the logs, the route and the locks.
Until it is made, Infinitary's work is read where it is, in Firstmate 3000's folder, and its own run makes it (below, "Under the other name").

| File | Holds |
| --- | --- |
| `home.json` | The grant (`docs/devices.md`, "Joining"), with whether this computer runs on the home's own Mac once the home has said it (below, "In the background"), the home's name once it has said it, and when it joined, written by `JoinedHome` (`src/core/devices/joinedHome.ts`), the same writer the app as a view uses; for a Mac that joined at Infinitary's first launch, the window keeps its grant here too (below, "A Mac that also controls") |
| `home-addresses.json` | The home's other addresses beside the grant's own, refreshed from each welcome, kept apart so a version that knows only the grant still reads `home.json` (`docs/devices.md`, "Finding the home again"); none on the home's own Mac or over the home's SSH |
| `route.json`, `route.lock` | For a home that reaches this computer through its own SSH connection, the private socket that connection forwards to it now, written by `HomeRoute` (`src/core/helper/route.ts`), its one writer (below, "Through the home's SSH") |
| `left.json` | The home that removed it, which `status` says while the removal has not finished or unmerged work is kept; it goes once nothing is kept |
| `running.lock` | The process that works from the folder now |
| `tasks/<task>/` | One crewmate conversation the home opened here (below), written by `PlacedTasks` (`src/core/helper/placedTasks.ts`), the one writer of `tasks/` |
| `repos/` | One bare clone per project the home gave it work in, from where the project lives (below, "Its working copies") |
| `worktrees/<task>/` | One task's working copy, on the task's branch (below, "Its working copies") |
| `worktree-pool/`, `worktree-trash/` | Warm working copies between tasks, and retired ones being deleted, as the home keeps its own |
| `default-workspace/` | This computer's own local workspace, for a task with no project |
| `home-arriving/<move>/` | A first mate moving here: its files, which can hold a copy of its home's key, until it starts here, then only the answer to that move (`docs/devices.md`, "Moving the first mate"); a removal takes it |
| `standby/` | The copy of its home's record the captain asked it to keep, in `copy/`, with where the copy is in the home's stream, a change half applied and the pieces of a full copy, written only by the home's orders and never opened here, and `peers.json`, which other copies it last reached; a removal takes it (`StandbyKeeper`, `StandbyPeers`, `docs/devices.md`, "Keeping a copy on another computer"); the lock it keeps the first mate's secrets sealed with is not here but in this computer's own store under a name of its own, made only once the person confirmed here (`StandbyLockKeeper`, `inf:standby:lock`, "Secrets on a computer that keeps a copy") |
| `bundles/`, `artifacts/` | A task's branch or kept work waiting for the home to read it, and the pieces of an artifact the home is writing here |
| `pi-agent/` | Pi's own folder for the conversations held here, never `~/.pi` |
| `personal/` | The home's personal instructions and skills as it last sent them, `v-<fingerprint>/` with its `.json` and the `current` link a crewmate here reads in place of this user's home folder, written by `PersonalCopy` (`src/core/helper/personalCopy.ts`), its one writer (`docs/personal-resources.md`, "One set, kept on each computer") |
| `accounts/` | This computer's own sign-ins (below): `registry.json` and one 0700 folder per account, written by its `AccountVault`, the same writer the home keeps its own in; a Claude account's folder holds `made-login.json` when Infinitary made that login here |
| `claude-login.json` | The Claude login Infinitary made here, which a removal begun outside the work's own run keeps for that run to sign out (below, "Removed") |
| `forges/` | This computer's own sign-in where projects live, for its clones and pushes (below): one 0700 folder per host with its 0600 `sign-in.json`, and `health.log`, written by its `ForgeSignIns`, the same writer the home keeps its own in |
| `pi-base/` | Pi's catalog, which says how each provider signs in; it holds no sign-in |
| `app/` | On another Mac, the copy of Infinitary its command got from the home, which the background starts |
| `installed.json` | What Infinitary set up outside this folder: the background agent's label and file, and the copy in `app/` (below, "In the background") |
| `automatic-startup.json` | The last Linux automatic-startup outcome, which an explicit worker reports on reconnect; kept separately so an older app can still read and remove its installed service |
| `work.log` | Notes about the conversations held here, and every console note, which Terminal never shows |
| `service.log` | What the run the background started says |
| `display.auth` | On Linux, the key to the work mode's own display (below, "No screen needed") |
| `chromium/` | What Electron itself writes, even with no window, kept out of the app's own userData; the task browsers' kept profile lives there, the built-in engine's partition and Chrome's `task-browser-chrome-kept` folder, holding the sites the captain signed in to on this computer (`docs/task-browser.md`, "Signed-in sites") |
| `web-sign-ins/` | The list of those signed-in sites and the captain's rule for each, with no cookie or page storage in it, written by `WebSignIns` (`src/core/browser/webSignIns.ts`), its one writer |
| `task-channel/` | One key per task whose crewmate here has its own browser, the home's integrations or the files command, which its `infinitary-browser-axi`, `infinitary-integrations-axi` and `infinitary-files-axi` reach them by (`docs/axi-commands.md`), emptied when the conversations start and stop |
| `file-reach/` | A file of this computer's set aside while the home reads it for the files command, at 0600, let go once read and emptied when the run starts (`docs/files.md`) |

The folder is 0700 and every file in it 0600.
Deleting the folder deletes the computer's key, its working copies and what its task folders held, so the computer joins again as a new entry and its earlier one stays on the home's list out of reach (`docs/devices.md`, "Joined again").
One process at a time works from it (`src/core/helper/lock.ts`): `join` and `run` take `running.lock`, a second is refused, and a lock whose process is gone, or that was written before this computer last started (its number may belong to anyone now), is taken over.

## Its commands

`<app> work <command>` (`src/core/helper/cli.ts`), where `<app>` is `Infinitary.app/Contents/MacOS/Infinitary` on a Mac, `/opt/infinitary/infinitary` (the `infinitary` command) from a Linux package, the AppImage file itself, or `electron . work` in a checkout.
Chromium's own switches may stand before `work` (`workCommand`): an AppImage's runtime adds `--no-sandbox` where it cannot make the sandbox.

| Command | What it does |
| --- | --- |
| `join <link>` | Joins the home a link names (below), then sets itself to run in the background; with a link from the home it already joined, finds that home where the link says it is now (below, "Finding the home again"). Exits 0 joined or found, 1 refused. `join --fetched <app> <link>` is what the command for another Mac starts: the person agreed already, and `<app>` is the copy it got. `join --agreed <link>` is what the command starts on Ubuntu with the package it just installed: the person agreed already, and nothing is kept in `app/`. `join --fetched <app> --from-home` is what the home starts over Remote Login, with the link on its input (below, "Started by the home"), and `join --from-home --agreed` what it starts on Ubuntu with the package it installed there. |
| `run` | Dials the home with the grant and keeps dialing while it is out of reach, until it is stopped or the home removes it. When a removal an earlier run could not finish waits here, it finishes that instead (below, "Removed"). |
| `status` | Says what this user joined, where, since when, and whether it is running, without dialing, and when the copy of the first mate's record kept here is from, and while it runs, which other computers' copies it reaches (`docs/devices.md`, "Copies that reach each other"). |
| `version` | `Infinitary <app version> · contract <PROTOCOL_VERSION>`. |
| `update --fetched <app> --from-home` | The home's own, over Remote Login: keeps the copy it sent in place of the one kept here and starts the background from it again. |
| `remove --from-home` | The home's own, over Remote Login: lets the home go and removes what Infinitary set up here, or finishes a removal an earlier run could not. |
| `connect --from-home` | The far end of the home's own SSH connection: keeps the route this computer's work dials for as long as that connection lasts (below, "Through the home's SSH"). |

Anything else prints how to use it and exits 2.
`<app> run`, with no `work`, is the app itself with no window, its own core and record included (`docs/run.md`).
Ctrl-C or a stop signal quits the app; the command ends first, says so, and the app exits with its code.
That holds once it loaded its own sign-ins too: the work mode listens for SIGINT, SIGTERM and SIGHUP itself from its start, so a module that listens later (Pi's sign-in store, through signal-exit) never ends the process by the signal instead (`src/main/work.ts`).

## Joining

1. It reads the link (`parsePairingLink`) and refuses one that is not a link, or one an older home made for the app on another Mac only (`view`).
2. It opens TLS to the link's address and checks the home's key against the link's pin, sending nothing and showing no key of its own (`probeHome`, `src/core/devices/dial.ts`).
   Nothing answering, or something answering that is not that home, is refused before the person is asked anything.
3. It asks, naming the address the link names, or this Mac when the address is this Mac's own:
   - another Mac: "Infinitary on the computer at 192.168.1.20 asks to add this computer, as the user sam." and "It runs only the projects you give it, with sign-ins of its own."
   - another user here: "Infinitary on this computer asks the user builder to run its work.", "Builder only runs work and cannot control your first mate." and "Like every user on this computer, it can read files in your home folder, outside private folders such as Desktop and Documents."
     On a Windows PC the last sentence is "Windows keeps your user folder from it, unless it is an administrator, who can open it.", since Windows keeps each user's folder from every other account that is not an administrator.
     Then "Type yes to agree:".
     Only `yes` goes on; anything else, or nothing, is "Nothing changed on this computer." and the link stays good.
     Piped in, the answer is printed after the question, so a transcript reads as a terminal does.
4. It uses the link once as the link's kind - `mac` from the command for another Mac or an address, `work` from the command for another user - under this Mac's name (`computerName`; a development run may stand in another with `INFINITARY_DEVICE_NAME`) and the user it runs as, by short name and number, or on Windows, which gives a user no number, by its security identifier (`thisDeviceUser`, `src/core/devices/deviceUser.ts`), with what it has here (`findTools`, `src/core/helper/found.ts`): git - the app's own when its copy carries one (below, "Running"), the Git for Windows the app chose on Windows, else git on the search path, where the stand-in macOS keeps at /usr/bin/git counts only once the developer tools are installed and is never run to find out - and Claude Code.
   It installs and asks nothing.
5. It keeps the grant, dials once to hear the home's name and whether this computer runs on the home's own Mac (below, "In the background"), with a hello that says it only hears them, so the home counts that dial as nothing of this computer in reach (`docs/devices.md`, "Held on the local network"), lets the folder go, sets itself to run in the background (below), and says "Joined.
   This computer runs work for MacBook Pro now, whenever sam is logged in.", with "Open Infinitary here any time to control it from this computer, with no new link." when it joined as a Mac, or "Joined.
   Builder runs work for Infinitary on this computer now." and "It runs whenever Builder is logged in, even in the background.
   You can switch back."

Started with `--fetched` by the command for another Mac, it asks nothing - the command asked before it got Infinitary - and keeps the copy it got in `app/` (cloned where the disk can) before it uses the link; a refused link keeps nothing.
Started with `--agreed` by the command on Ubuntu, with the package it just installed, it asks nothing either and keeps no copy, since the package's program is the one that runs.
Since the package stays, its words then never say nothing changed, and a refusal ends with the words that Infinitary stays installed on this computer (`afterInstall`, `INSTALLED_STAYS`).
Started with `--background <file>`, as the command starts it, a join writes how its work runs in the background there (`running`, `at-login`, `failed`, `unavailable`, `unknown` or `none`), which the command reads to say what keeps the work on after logout (`docs/devices.md`, "Joining by a command").
A link that was used, expired, or closed, and a link from another home while the one kept still answers, each say what happened and that nothing changed ("That command was used already.
Make a new one on the computer at 192.168.1.20.").
A link from another home while the one kept does not answer asks to leave that one first (below, "Leaving a home that is gone").

## Finding the home again

The grant keeps every address the home offers, refreshed from each welcome, and a dial that reaches none listens for the home's announcement on the local network through the system's Bonjour, checking the home's key at every address (`docs/devices.md`, "Finding the home again"); the command passes the way to listen (`homeFinder`, from `startHelper`'s `findHome`).
Once none of those answers with the home's key, as when the home is on another network, this computer is out of reach of it and keeps trying ("MacBook Pro is out of reach.
This computer keeps trying.").
A home on this Mac is dialed at loopback, where it listens too and which no network change moves: the command for another user here names it, and each run dials loopback at the same port whenever the grant names one of this Mac's own network addresses, and keeps the grant so (`homeDialAddress`, `src/core/helper/join.ts`, from `startHelper`).
Such a grant keeps no other address and never listens for the announcement, since loopback is its one way there.
Such a grant was kept before the command named loopback, or by a user here added at its address over Remote Login; a grant naming another Mac, a name, or loopback already dials where it did.
A new command from the home, run once here as the same user, finds it where it is now, as the same computer (`docs/devices.md`, "Finding the home again"; design skill `components/devices/AddAMac`, "Finding this computer again").
A computer added by its address needs nothing run here: the home reaches it over its own SSH connection wherever the home is, and Add it at its address reaches it over Remote Login and starts the join below with a new link on its input (below, "Started by the home").
The join reads that the link names the home its grant does (the same key), and then (`findAgain`, `src/core/helper/join.ts`):

1. It checks that home answers with its key at the link's address, sending nothing, before anything here stops; nothing answering, or something else answering, is refused as for a join.
2. It asks nothing: this user agreed to that home's work when it joined, and the link changes only where it dials.
   The command for another Mac still asks its own yes before it gets Infinitary.
3. It stops the background's run, so the folder is free, and waits a moment for it to go, as an update does; a run someone started by hand keeps it, which is `busy`, and the background is loaded again as it was.
   A turn running here is cut off, as when this computer restarts (below, "That computer restarts").
4. It uses the link with the key it was paired with (`findHomeAgain`), and keeps the grant with the link's address (`JoinedHome.dialAt`); its place on the home's list, its sign-ins, conversations, clones and working copies all stay.
   A link over the home's SSH connection, from the home's Add it at this Mac's address, keeps the grant with `via: "ssh"` too, so a computer a command joined reaches its home only through that connection from then on (below, "Through the home's SSH"); a grant already on it refuses a link that dials an address.
5. A copy of Infinitary the command got is kept in place of the one kept here, as an update keeps one, so this computer runs the home's version again; then the background starts again, and it says "Found MacBook Pro at 192.168.1.30.
   This computer runs its work as before, whenever sam is logged in." or "Found Infinitary on this computer again.
   Builder runs its work as before.".

A refusal from the home leaves everything as it was and loads the background again.
When the home answers that it removed this computer while it was out of reach (`removed`), the join does what hearing that removal would have done (below, "Removed") - "MacBook Pro removed this computer earlier." and the removal's own lines, keeping a working copy that still holds unmerged work - then joins anew with the same link: it asks its yes unless a command fetched this copy, keeps the copy, uses the link with a new key and sets up the background.
What that removal could not remove it names, "Infinitary could not remove all it set up here, in …", and joins all the same; joining anew clears the note, so nothing tries again on its own.

### When the first mate moves here

The work mode answers a move's orders from the home it runs work for (`docs/devices.md`, "Moving the first mate"; `IncomingHomeMove`, `src/core/homeMove/arriving.ts`): what it has before a move, each piece of the record, the commit and an abandoned move.
The record lands in the app's own data folder, the parent of its work folder, and the work mode starts the first mate there in the background with the same agent the run command uses (`startRunAgent`).
A request the work mode asked the old home while it moved is left unanswered there and asked again of the new home, as after any drop (`HomeLink`), and the new home's record answers it once.
A computer that cannot start the first mate in the background takes no move.

## Leaving a home that is gone

A home can be gone for good: Infinitary there was installed again, or its data was reset, so it holds a new key and no longer knows this computer.
This computer then keeps trying it at every login, and only a new home lets it go: its command, or Add it at this computer's address on that home's captain's yes (`leaveFor`, `src/core/helper/join.ts`):

1. It checks the home it runs work for at the address its grant dials, with that home's key, sending nothing.
   While that home answers, the link is refused as before, "This user already runs work for MacBook Pro." and "Nothing changed on this computer.": that home brings its unmerged work home when its captain removes this computer there.
2. It checks the new home answers with its key, sending nothing; nothing answering, or something else answering, is refused as for a join.
3. It asks once, before anything here stops: "This user runs work for MacBook Pro, which does not answer.", "Joining leaves it: Infinitary removes what it set up here for MacBook Pro, with its sign-ins." and "Work that never merged stays on this computer.", then the join's own question unless a command fetched this copy, then "Type yes to agree:".
   When the new link comes from the same place as the old home, as it does from an Infinitary installed there again, the old one is named "an earlier Infinitary on this computer" or "an earlier Infinitary at 192.168.1.20".
   Anything but `yes` is "Nothing changed on this computer.", with its run going on as it was.
   Started by the home over Remote Login nobody here is asked: the home's captain answered Add it's own question (`docs/devices.md`, "Another first mate's Mac"), and the join's line says so (`leave`, `sshJoinSchema`).
   Without that, it is refused as `joined`.
4. On the yes it stops the background's run, as finding the home again does, then leaves that home as a removal would (below, "Removed"): the grant goes, `left.json` notes "left" rather than "removed", and what Infinitary set up for that home goes with its sign-ins and its agent, keeping a working copy that still holds unmerged work.
   Terminal says "This user left MacBook Pro." and the removal's own lines, naming what it could not remove without promising a second try.
5. The same yes then joins the new home, as any join does, and sets up the background again.
   Started by the home, its outcome line says it left (`left`: how many working copies it kept and what it could not remove), and the home says so.

The old home is not told: nothing answers there.
Were it only out of reach after all, its Settings -> Devices keeps this computer as out of reach until its captain removes it.
A link the new home refuses after the yes leaves this computer joined to nothing, and `status` says "This user left MacBook Pro.".

## Through the home's SSH

A home may reach this computer only through its own SSH connection to it (`docs/devices.md`, "Through the home's SSH").
Its grant then says `via: "ssh"`, and the run never dials the grant's address: it dials the private socket that connection forwards here now, which the connection keeps in `route.json` (`HomeRoute`, `src/core/helper/route.ts`).

- **The route** holds the socket, the home's pin, this computer's id on that home's list, a generation and a lease, and never a key or a link.
- **Read on every dial** (`homeDialOptions`), on getting Infinitary from the home to update (`updateHere`), and on checking whether that home answers before a link from another home may ask to leave it (`leaveFor`): a new route is taken as soon as it is there, and the run follows it without starting again, so nothing it holds lets go.
- **Out of reach, never anything else.**
  No route, one whose lease ran out, another home's or device's, one that cannot be read, or a socket that is not this user's in a folder only this user may enter, is out of reach: the run keeps trying, and never dials the grant's address, forgets the grant or removes anything.
- **One writer at a time, by generation.**
  Each connection takes a new generation (`begin`), which withdraws the route until it publishes its own; a connection whose generation is no longer the file's can neither publish nor withdraw, so an old one cannot write over or clean up a newer one.
  Writes are one step under `route.lock`; a lock older than ten seconds was left by a writer that died holding it and is taken over, without reading a process number that may be another's now.
  A finished removal deletes the route under the same lock (`remove`), so a renewal or withdrawal the connection began first writes before it goes, and none after finds a route of its generation to write back.
- **A lease, not a process.**
  A route lasts 75 seconds unless its connection renews it, which it does every 15, so one whose connection crashed or whose Mac restarted runs out by itself.
- **A socket path a dial can reach.** macOS keeps a socket's path in 104 bytes, so a route's socket is absolute and at most 103 bytes, or it is not written.

**The controller** is what keeps it: `work connect --from-home --home <pin> --device <id>` (`connectFromHome`, `src/core/helper/connect.ts`), which the home's own SSH session runs from the copy kept in `app/` (`docs/devices.md`, "Through the home's SSH").

1. It checks the folder runs work for that home as that computer, and through the home's SSH; anything else is refused (`other-home`, `not-joined`, `not-ssh`) before anything is touched.
2. It takes a new generation, makes a fresh folder only this user may enter under `/tmp` and says its socket's path to the home, one typed line on stdout (`controllerSaysSchema`, `src/shared/sshConnection.ts`).
3. Told on stdin that the forward is in place, it checks the home answers through the socket with its own key, sending nothing, then publishes the route and says whether the background runs (`backgroundState`: `running`, `at-login`, `failed`, `unavailable`, `unknown`), asking again on each beat until it runs; a loaded agent that leaves the folder with no live run on two beats in a row is `failed` (`agentProbe`), so Devices says the work could not start rather than "connecting"; while a move of the folder holds its move lock the probe answers `unknown`, since the run moves the folder before it takes the folder, until the lock is older than `MOVE_LOCK_TRUST_MS` (30 minutes, far past the few minutes a large folder takes), after which the probe reads `failed` again, as a stuck move should.
4. Each beat renews the route; a route a later connection took ends it (`superseded`), and so does its folder moving into a newer app's (`moved`), which the home tries again as any dropped connection.
5. The end of its input, or 75 seconds with no beat, withdraws its generation's route, removes its own folder and nothing else, and ends it.

It never starts or stops the work: the background's run follows the route on its next dial, within seconds.
`update --from-home` and `remove --from-home` take the same `--home <pin> --device <id>`, and refuse another home's or computer's folder (`other-home`) before anything stops.
An update takes `--on-home-mac true|false` too, whether this computer runs on the home's own Mac as the home's list found it, left out while the list does not say (below, "Started by the home").

## Started by the home

A home that adds a Mac or a Linux computer by its address reaches it over SSH with its captain's own SSH, sends Infinitary for this computer's system there and starts that copy (`docs/devices.md`, "Adding a computer by its address"): on a Mac the home's own bundle, or the published one; on Linux the published AppImage, which this user keeps in its own folder and runs with no password.
The home does only what its captain chose there - adding it by a click, and updating it by a click or by itself as it connects on an older version (`docs/devices.md`, "Updating by itself") - so nothing is asked here and Terminal shows nothing: with `--from-home`, a command prints one outcome line on stdout for the home to read (`workOutcomeSchema`, `src/shared/remoteLogin.ts`) - `joined`, `updated` or `removed` with whether it runs in the background, or `refused` with the reason - and exits 0, or 1 refused.

- **Join** (`join --fetched <app> --from-home`) reads its input's first line, one typed message with the link and the private socket the home's setup forwards here (`sshJoinSchema`), never its arguments, where this Mac's other users could read them, then joins as the command for another Mac's copy does, dialing the home through that socket alone: it keeps the copy and sets itself to run in the background.
  On Ubuntu 24.04 and 26.04 the home installs the package instead and starts its program as `join --from-home --agreed`, which keeps no copy; without `--agreed` a join with no copy the home sent asks here, and its input holds only the link, so it declines.
  When this user runs that home's work already, the same join finds the home again (above, "Finding the home again"), and the outcome is `joined`; the home tells the two apart by which computer used the link.
  Over Remote Login, with nobody logged in at this Mac's screen as this user, the background starts at that user's next login (below), and the outcome says so for the home to say it; a background that failed is `failed`, never the next login.
- **Update** (`update --fetched <app> --from-home`, `updateFromHome`, `src/core/helper/fromHome.ts`) stops the background's run so the folder is free, keeps the copy the home sent in place of the one kept here, and starts the background from it again.
  The home's Update holds its SSH connection to this computer while it runs (`SshConnections.hold`, `docs/devices.md`, "Updating"), so the controller here has withdrawn its route and nothing here can dial the home.
  The home's word on whether this computer runs on its own Mac rides the update's arguments instead (`--on-home-mac`, from its list's `onThisMac`), and the update keeps it on the grant before it sets the agent up anew, so a grant that had not kept it - one joined before the home said it, updated before its run heard a welcome - starts at the priority the home's word gives (below, "In the background"); with no word, the grant stays as it was.
  A copy under the other name of the Infinitary rename moves the background to it (below, "In the background"), and the copy kept before goes only once the record names the new one, or is kept aside on trial while the background runs (below, "A copy that does not start"); a background that would not move leaves the copy kept before running as it was, and the outcome is `not-kept`.
- **Remove** (`remove --from-home`, `removeFromHome`) is a home removing this computer while it was out of reach of the connection: it stops the background's run, keeps one note of which home removed it (`left.json`), and removes what Infinitary set up here (below, "Removed"), keeping a working copy that still holds unmerged work.
  A Claude login Infinitary made here is the work's own run's to sign out, so it starts the agent again for that.
  What it could not remove yet rides the outcome as `unremoved`, and the home says so (`docs/devices.md`, "Removing it there").
  On a folder whose removal has not finished, it finishes it, with the home already let go.
- Both wait a moment for the stopped run to let the folder go; a run someone started by hand in Terminal keeps it, which is `busy`, and the background is loaded again as it was.
- A folder that joined nothing, with no removal left to finish, is `not-joined`, and nothing changes.

## In the background

Once joined, the computer's own service manager starts `<app> work run` as that user whenever they are logged in, including while another user is at the screen (captain's pick on FI3-673): launchd on a Mac, that user's own systemd on Linux, and that user's own Task Scheduler on Windows.
One seam sets it up, stops and starts its run, says whether it runs and takes it away (`startInBackground`, `stopInBackground`, `pauseInBackground`, `resumeInBackground`, `backgroundState`; `src/core/helper/background.ts`), with an adapter for each manager; the app picks one by its system (`workContext`, `src/main/workContext.ts`).
The program it starts is the one that started the join - this computer's own app for another user here, the kept copy in `app/` on another computer, a Mac's bundle or a Linux AppImage (`fetchedLauncher`) - as it starts again past its next update (`appLauncher`, `src/core/helper/launcher.ts`): a Mac's app or a Linux package's own program, the AppImage file rather than the folder its runtime mounted for one run, and on NixOS the command its profile puts on the search path rather than one version's place in the store.
A removal that could not finish keeps the agent, which runs again and finishes it (below, "Removed").
What it says goes to `service.log`.
`installed.json` records the agent - its label and its file - and the kept copy, so a removal takes away exactly those.
Nothing needs an administrator, and nothing runs as anyone but that user.

**On a Mac** it is a LaunchAgent in that user's own `~/Library/LaunchAgents`, `com.getinfinitary.infinitary.work.plist` (`.dev.work` for the development flavor; Firstmate 3000's was `com.kunchenguid.firstmate3000.work.plist`, which the move hands over), started at load, and kept alive only while the grant (`home.json`) is in the data folder, so a removal is its last stop; a removal that could not finish runs once at the next login.
On a separate Mac it names `ProcessType` `Interactive`, so launchd starts its run as an app the person started, as a GitHub Actions runner's agent is started.
With no `ProcessType`, launchd starts the run as a daemon (`launchctl print` reads `spawn type = daemon (3)`), and the run and every process under it, a crewmate's builds and tests among them, run at priority 20, below the computer's other work at 31; while the computer is busy they starve, and a crewmate's tests there fail with no code change (INF-247).
Nothing in the run can lift that, so an agent an earlier version set up keeps it until the agent is set up again: by a join, an update over Remote Login, or a move to the other name (below, "Under the other name"); an update over the connection keeps the agent as it was.
Another user's work on the home's own Mac keeps the daemon's low priority, so its agent names no `ProcessType` (captain on INF-255: "Keep low priority for another user on your own Mac"); each time the agent's file is written, and each time the run starts, the grant in the folder decides which (`separateMac`, `src/core/helper/background.ts`; `onHomeMac`, `src/core/helper/homePlace.ts`).
The home's own word decides: its list knows whether the computer joined from the home's own Mac (`onThisMac`, `docs/devices.md`, "Where a computer joins from"), and each welcome to that computer's work says it (`onHomeMac`, protocol 9.1, `docs/connection.md`).
The grant keeps what the welcome said: the join hears it with its one dial before it sets up the background, and keeps it in the same write as the home's name (`JoinedHome.heard`); the run keeps it from every welcome, and an update over Remote Login keeps it from its own arguments, which carry the same word from the home's list (above, "Started by the home"), each with `JoinedHome.onHomeMac`.
A grant that has not heard it reads the address it dials, whatever its kind, so a separate Mac that joined as `work` before a Mac could do both starts as an app; through the home's own SSH connection that address is only that connection's far end, so the kind tells: `mac` is another Mac, which the home's own look found, and `work` the home's own Mac.
An agent written before names nothing, and the run keeps low priority until the home next sets it up; an update over the connection keeps the agent as it was, and its run keeps the home's word for the next.
Nothing reads the agent's text or the home's SSH session for it, and nothing reads the `launch-fact.json` protocol 9.0 kept in the data folder; a finished removal deletes that file with the logs (`cleanUp`, below, "Removed").
Its run dials the home through macOS's own nc, as every dial of the join does (`docs/devices.md`, "Through macOS's own nc"); over a private network service's address, or to a home on the same network once that Mac has been granted local network access, it reaches the home with nobody at this Mac's screen, while on a local-network address alone, a launchd agent's dial is gated by local network privacy, which a headless Mac has no one to answer.
A run whose home reaches it through the home's own SSH connection dials the route that connection keeps instead, a private socket on this Mac, with no nc and no network dial (below, "Through the home's SSH").
The join loads it at once (`launchctl bootout`, then `bootstrap gui/<uid>`).
When launchd refuses it, the join asks for that user's login session (`launchctl print gui/<uid>`), never reading launchctl's words.
A Terminal that has no session to give it to (one reached over SSH while that user is not logged in at the screen) leaves it to start at the next login, and says so, as the home does for a Mac it added over Remote Login.
A session that is there and refused it is `failed`, as is an agent that could not be written, since no login mends either: the join says it could not set itself to start in the background, and so does the home.

**On Linux** it is a user service in that user's own `~/.config/systemd/user` (`$XDG_CONFIG_HOME` when the person moved it), `com.getinfinitary.infinitary.work.service` (`.dev.work.service` for the development flavor; Firstmate 3000's was `com.kunchenguid.firstmate3000.work.service`), wanted by the user's login (`default.target`), so it starts whenever that user's systemd does: at each login, again after the computer restarts and they log in, and never while nobody is logged in as them, as on a Mac.
When startup is available or waits for a verified inactive user manager, the join writes the unit and its link in `default.target.wants` itself, so the service starts at the next login even when that user's systemd cannot be asked now, then has systemd read it (`daemon-reload`) and start it (`restart`, so a run an earlier join started stops first). systemd starts the run again ten seconds after it ends, and never gives up, as launchd keeps an agent alive (`Restart=always`, `StartLimitIntervalSec=0`); before each start it checks the folder still holds the grant, or a removal it has yet to finish (`left.json`), so a finished removal is its last stop (`ExecCondition`, which systemd checks again before every restart, where a unit's `ConditionPathExists` is not).
A stop reaches the run first and its display after it (`KillMode=mixed`), within launchd's own twenty seconds (`TimeoutStopSec`).
A reachable user manager is usable even when system startup is unusual.
Otherwise the adapter checks systemd's runtime directory, `/run/systemd/system`: its absence means automatic startup is `unavailable`, not waiting for a login.
On a running systemd system, the system manager must positively report `user@<uid>.service` as inactive before setup is `at-login`.
Unreadable runtime or user-manager facts are `unknown`, never a promise that login will start work.
A reachable user manager that refuses the service is `failed`.
An unavailable or unknown setup keeps the join without writing a new startup service.
The joining command reports its startup outcome to the home with a name-only hello, which does not make its work reachable.
The home keeps that explicit outcome separate from the controller's ordinary `unknown` work progress, which proves nothing about automatic startup.
Devices says “automatic startup not set up” and “This setup does not start work at login” for unavailable startup, independently of reachability.
The Ubuntu package can run explicitly as the joined user with `/opt/infinitary/infinitary work run`; a retained AppImage uses its own launcher with `work run`.
Keep that process running, either explicitly or through an externally configured supervisor; stopping it or restarting the environment requires another start, while the join remains.
For a computer added by address the home's SSH connection still supplies the route, never starts the worker, and normal connection, version and sign-in prerequisites still apply.
This adds no startup adapter or container configuration, and neither linger, removing and re-adding, nor updating supplies a missing supported startup system.
Whether it runs is `ActiveState`, the property systemd answers, never its words.
Taking it away removes the link first, so it never starts at another login, then the unit; then systemd reads the folder again, forgets a failed state, and stops it without waiting, since the run asking may be the service itself.
The run draws on a display of its own (below, "No screen needed"), so the unit's command names Chromium's X11 platform (`--ozone-platform=x11` before `work run`) and the unit leaves out a Wayland session's display it might inherit (`UnsetEnvironment=WAYLAND_DISPLAY`).
Chromium chooses its platform once, at its start, before the app's code runs, and left to choose, Electron picks Wayland whenever `XDG_SESSION_TYPE` says `wayland`, which a compositor such as niri puts into the user's systemd; only the command line overrides that, whatever the session's variables say.
A computer whose search path holds no systemctl sets nothing up in the background: its work runs only while someone runs `work run`.

**On Windows** it is a task in that user's own Task Scheduler under the same label, `com.getinfinitary.infinitary.work` (`.dev.work` for the development flavor), whose file the join writes in the data folder as UTF-16 and registers with `schtasks /Create /XML` (`workTaskXml`, `src/core/helper/windowsTask.ts`), as the command's own task is (`docs/run.md`, "On Windows").
It runs `<app> work run` as that user in their signed-in session (`InteractiveToken`), with no administrator (`LeastPrivilege`), at the priority of an app the person started, with no time limit (INF-4260's plan, piece 10, the captain's pick: "While you are signed in to Windows, as on a Mac.
It needs no administrator.").
It starts at their sign-in, and the join runs it at once (`schtasks /Run`).
Task Scheduler's own restart on failure does not start a program that ended again, so the task also repeats every minute with no end (`WORK_TASK_AGAIN`), and Task Scheduler starts nothing while its run still goes (`IgnoreNew`): a run that crashed, or ended with 75 for an update, starts again within a minute, and only while that user is signed in, since its session is the task's only one.
Nothing on Windows signals the run, so a stop is asked by writing `run-stop.json` in the data folder, which the run reads once a second (`requestRunStop`, `watchRunStop`): taking the task away deletes it (`schtasks /Delete`) and then asks the run to stop, and a pause turns the task off before it asks, so its next minute starts nothing.
Whether it runs is whether Task Scheduler still holds the task (`schtasks /Query`).
The repeat starts the run whatever the folder holds, where launchd starts it only while `home.json` is there and systemd only while its condition holds, so a run that finds no home joined and no removal to finish takes the task away itself (`stopUnjoinedTask`), as after a removal whose `schtasks /Delete` failed.
Before the work mode does anything, it gives its data folder the owner-only access list the window gives its own (`keepDataFolderPrivate`, `docs/windows-private-files.md`), and refuses a folder that cannot be kept private, and it uses the Git for Windows the window chose, whose `git.exe` it finds and whose Git Bash runs a crewmate's commands and a task's stops (`configureWindowsGit`, `docs/windows.md`, "Git for Windows").
Electron's main process on Windows ends its standard input at once, so the work mode reads what a person types or pipes, such as the join's typed yes, from the input handle itself (`windowsStdin`, `src/main/windowsStdin.ts`): off the main thread and only while a reader asks for more, since a read at a console waits for the person's next Enter.
The installed app has a window, and its read of a PowerShell window's typing ended at once, so the Devices line for another Windows account has PowerShell read the person's line and pipe it in (`docs/devices.md`).
A working copy's `current` link is a folder junction, which needs no administrator, where a Mac and Linux keep a symbolic link (`folderLinkType`).
A Windows PC that runs work for another computer takes no update yet, and its window there installs none (`docs/windows.md`); the home sends it no copy and asks it for no update; its Devices row says to install the newer Infinitary on that PC (`installedThere`, `src/shared/devices.ts`).

A development run may stand in its own service manager with `INFINITARY_LAUNCHCTL` on a Mac, `INFINITARY_SYSTEMCTL` on Linux or `INFINITARY_SCHTASKS` on Windows, and carries its stand-ins (`INFINITARY_HELPER_DATA_DIR`, `INFINITARY_FOLDER_SPELLING`, `INFINITARY_DEVICE_NAME`, `INFINITARY_LAUNCHCTL`, `INFINITARY_SYSTEMCTL`, `INFINITARY_SCHTASKS`, `INFINITARY_CLAUDE_CLI`, `INFINITARY_SYSTEM_GIT`, `PI_OFFLINE`) into the agent; one whose data a test isolated with `INFINITARY_HELPER_DATA_DIR` and no stand-in sets up nothing in the background, so no test ever loads an agent.

### Under the other name

Infinitary's app keeps its work under its own label, `com.getinfinitary.infinitary.work` (`.dev.work` for the development flavor), its bundle id and then `.work` as this app's is (`workLabelOf`, `src/shared/codeNames.ts`).
The label follows the folder: `pnpm dev` on the person's own folder takes the installed app's `.work`, so one background runs on a work folder, and an isolated run from source keeps `.dev.work`, so it never takes the installed app's.
When `pnpm dev` sets the work up, as a view of another home does when its work is not running, it writes that one agent with its own launcher, Electron and the checkout, so the work runs from the checkout, on whatever the checkout holds, until the installed app writes the agent again.
An agent `installed.json` records under the other app's label moves to this app's own in one step (`moveInBackground`, the Infinitary rename's FI3-1780 step 2): the new one is set up and started first, it is recorded only once the service manager took it, and the old one's files go and the service manager lets it go last.
The two never run work at once, because each works only while it holds the folder (`running.lock`).
A new one the service manager refuses is taken away again and the old one started again as it was, so a move that fails changes nothing.
A join, the window and the home's update over Remote Login each start the background this way, under the label of the folder the work is in: this app's own once its work is in this app's folder (below).
A run updated by its home over the connection is the old agent's own run, so its move hands back what it does last: the old copy and agent go once that run let the folder go, and letting the agent go ends that run (below, "Updated by its home"); while the new agent runs, they are kept aside on trial until the new copy reaches the home ("A copy that does not start").
A run that holds the folder takes away what a move that stopped partway left (`retireStrays`): an agent of this flavor under the other label whose file names this folder, or the folder the one-time move brought it from, and a copy in `app/` other than the one recorded; another folder's agent stays.

Infinitary keeps its work in its own data folder, so its work follows the one-time move of that folder (`docs/saved-data-compatibility.md`, "The one-time move"), and a computer that only runs work makes that move from its work run, since no window opens there:

- **Where the work is now** (`workFolderNow`, `src/core/helper/place.ts`): in this app's own folder once it is there, or nothing is anywhere else; otherwise in the newest older spelling's folder that holds a grant or a removal to finish and has not moved.
  Every command works from there, and Chromium's files, the notes and the display's key go there too, so nothing writes into the new folder before the move.
  A folder that moved (its retired marker) is never opened: a Firstmate 3000 run there says it has joined nothing, and its controller and removal refuse as `not-joined`.
  An older folder holding only a window's saved work is the window's to move.
- **The label follows the folder.**
  An agent set up while the work is in Firstmate 3000's folder - by Infinitary's update over Remote Login, its join, or the installed program a Linux package update starts - keeps Firstmate 3000's label, now starting Infinitary's copy, from a process that is not that agent's own run.
- **The work run moves it** (`moveWork`, `src/core/helper/moveWork.ts`), before it starts: the whole data folder, with the move engine, window profile and all, then the background under Infinitary's label, set up anew in the new folder from the copy kept there (or this app itself); the agent before it goes last, which ends this run, and the new agent's run takes the work on.
  An older work run that holds the older folder is taken over first: its recorded agent let go, the ordinary stop sent, and the move made once it let go (`docs/saved-data-compatibility.md`, "An older copy still running").
  A run a command started is a first mate the person runs, so the work run leaves it, as it leaves the older app's window: only a hand-over the person sees stops one, the window's or a newer run's in its terminal (`docs/run.md`, "Before it starts").
  A run whose older work run does not stop, or whose folders another move holds, ends, and its background starts it again; any other refusal - the older app's window or a command's run open, no room, newer saved work - leaves the work where it is for this run, and the next start tries again.
  A lock written before this computer last started holds nothing, whoever has its process number now, so a move a restart cut off starts again on the first run after it.
  So does the older app's window lock: a window a restart stopped without a quit does not keep the work where it is.
  An agent already under Infinitary's label that names the older folder is the run's own, which could not be set up anew once the folder moved, so its work stays where it is.
  Should the service manager refuse Infinitary's agent after the move, the agent before it runs on as it was loaded, and its file names the new folder from its next load (`rewriteInBackground`).
- **Updated over the connection by Firstmate 3000** (`updateHere`), a run that keeps Infinitary's app moves the folder itself once its run let the folder go, then moves its background to that copy in the new folder, the agent's own run being the one process that could not set it up anew afterwards; a move it cannot make takes the kept copy away, and its background starts Firstmate 3000's run again as it was.
- **Its conversations follow it.**
  A conversation the home opens here again after the move writes to the new folder, and its crewmate is told so once (below, "Holding a conversation").
- **The home's SSH connection** finds the copy and the grant in either folder (`docs/devices.md`, "Adding a computer by its address"), and its controller ends once its folder moved, so the home connects again to where the work runs (below, "Through the home's SSH").
- A development run moves its own Firstmate 3000 folder the same way, and may stand in Firstmate 3000's folders instead with `INFINITARY_FOLDER_SPELLING=fm`, as the window's does, and carries it into its agent.

## No screen needed

On Linux the work mode needs a display for the hidden windows it draws - a card's demo recording played before the card goes home, a task's own browser - and a computer that runs work in the background has none: its systemd user service starts with no desktop session, and a computer reached over SSH may have no screen at all.
Measured on GitHub's Ubuntu 24.04 with Electron 43: the work mode with no display stops at once ("Missing X server or $DISPLAY") the first time Chromium starts drawing; on Chromium's own windowless platform (`--ozone-platform=headless`) it idles as one process, but the first hidden window it opens crashes it; on a display in memory (Xvfb) every window draws, in a terminal and as a systemd user service alike.
So the work mode on Linux draws on a display of its own, as Orca's windowless mode does (`startOwnDisplay`, `src/main/ownDisplay.ts`):

- **Before Chromium opens one.**
  The main entry awaits it before the work mode loads (`prepareWorkMode`, `src/main/work.ts`), for each command that lives past Chromium's start (`join`, `run`, `update`, `remove`, `connect`); `version` and `status` end before Chromium draws anything and need none.
- **Xvfb, with a key of its own.**
  It starts Xvfb on a display number Xvfb chooses (`-displayfd`), with no network listener, and a fresh MIT-MAGIC-COOKIE-1 in `display.auth`, which only this user may read and which `XAUTHORITY` names; Xvfb with no key lets any user on the computer look at what it draws, and a task's browser there may hold a sign-in.
- **Gone when the work mode is.**
  Xvfb runs under a small keeper in a session of its own, which ends it once the work mode's end of its input closes, so the display outlives every window Chromium closes on the way out, and Ctrl-C in a terminal reaches the work mode alone; under systemd the stop reaches the run first and the keeper after it (above).
- **Its own over the person's.**
  It draws on its own display even inside a desktop session, which can end while the work runs on; only where Chromium chose Wayland at its start, which Electron writes into the command line (`--ozone-platform`), does it draw on the session's.
- **No Xvfb.**
  Each Linux package requires it (`docs/linux-packages.md`); an AppImage cannot, so with no Xvfb the work mode draws on an X session's display when it has one, and otherwise says "Infinitary needs Xvfb to run work on a computer with no screen." and "Install Xvfb with your system's software, then run this again." and exits 1.

## A Mac that also controls

A Mac (`mac`) is one device on its home's list with one key, and two halves: its work, which runs from this folder with no window, and Infinitary opened there with its window, which controls the home (`docs/view.md`, "A Mac that runs work").
Each keeps the same grant - the window in `userData/joined/`, the work here - and each connection says which half it is (`as`, `docs/connection.md`), so the home holds both at once (`src/core/helper/fromWindow.ts`).
Where both read this folder and how the background starts are one module, `workContext` (`src/main/workContext.ts`), which the work mode and the window share.

- **Joined at its first launch** (`setUpWork`): the window keeps its grant here too, under this folder's lock, and sets the work up in the background as a join does, from this app itself, with no copy kept in `app/`.
  A folder that runs work for another device already is left as it is, and so is one whose removal has not finished: the window names why and its home's row says so (`docs/view.md`, "Setting its work up again").
- **At every connection to its home**, the first of each launch included and never before a welcome, the window checks this half again and sets up what is missing: the grant here, and the background when no live run holds the folder.
- **Added by a command or its address** (`windowFromWork`): Infinitary opened there with no grant of its own controls the home this folder's grant names, a `mac`'s alone, with no new link; a grant for another user here only runs work, and stays this folder's.
  Its window dials where the work's grant dials now, and through the route the home's SSH keeps here when the home reaches it that way.
- **Added again** by a command or its address while its window holds a grant for the same home and this folder holds none (`adoptWindowGrant`): the work takes the window's grant under this folder's lock, so the join finds the home again as that same entry (`docs/devices.md`, "One computer, one entry").
- **Leaving it** from its window is a removal of the whole Mac: the home brings its work home first (`docs/devices.md`, "Leave"), then cuts it, and the work here removes what Infinitary set up as any removal does (below, "Removed").
  The window notes which device it left (`left.json`), so it never opens that home again with the grant the work keeps until then.
- A test that isolates the app's data keeps this folder inside it and sets nothing up in the background, unless it stands in its own launchctl.

## The home's side

The pair request of a computer that runs work carries `user` (`{ name, uid }`, `pairRequestSchema`); one without it is `malformed`.
The home reads where the device dialed from off its socket, never from what it says: loopback or one of this Mac's own addresses is this Mac (`isThisMachine`, `src/core/connection/addresses.ts`).

- **The same user is refused.**
  A computer that runs work dialing from this Mac as the macOS user the home itself runs as is refused as `same-user` (409), and the link is not spent: work run as the captain could read and change everything the captain can, so it runs as another user here.
  It says "This is the user Infinitary already runs as.
  Log in as another user on this computer, and run it there." and "Nothing changed."
- **The list keeps who it is.**
  Its entry keeps the device's name, `user` (the short name), and `onThisMac`, whether it joined from this Mac; every device's entry keeps `onThisMac` (`deviceViewSchema`).
  These are what Settings -> Devices will name it by ("Running as Builder"), which piece 12 draws.

## Running

`startHelper` (`src/core/helper/run.ts`) is the whole composition: the data folder, the grant, and `HomeLink`, the device's side of the connection the app as a view also uses (`docs/view.md`, "Reaching the other Mac").
Unlike `createServices` it has no first mate, task record, scheduler or sharing: the home keeps all of those.
Beside the link it holds the crewmate conversations its home opens here (below); it is sent no push (`docs/connection.md`).
Every child it starts - git, a crewmate's shell, Claude's client - carries the app's own git helper pointed at this computer's `forges/` (`configureComputerGit`, `src/core/helper/forges.ts`; `docs/forge.md`, "Git that never prompts"), so its git answers GitHub, GitHub Enterprise and GitLab only with this computer's own sign-in, and Bitbucket Cloud and Data Center with it once this computer signs in there, and never prompts.
Every git it starts - a clone, a crewmate's shell, a removal's look at a working copy - is the app's own, as the home's is: every command takes it before anything looks for git or runs it (`adoptBundledGit`, `src/core/workspace/bundledGit.ts`, from `runCli`; `docs/forge.md`, "The app's own git").
So a Mac with no developer tools clones, commits and pushes, and its join tells the home it has git.

It says each change of contact once: "MacBook Pro is in reach.", "MacBook Pro is out of reach.
This computer keeps trying." and "Infinitary on MacBook Pro quit.
This computer keeps trying."
When the home removes it, it deletes its grant, keeps one note of which home, says "MacBook Pro removed this computer." and "A new command from MacBook Pro joins it again.", removes what Infinitary set up here (below, "Removed"), and exits 0.

**Versions.**
The welcome tells a computer that runs work whether it may take new work (`takesWork`): only on the home's own major, and only when it speaks `PLACED_WORK_SINCE` or later, so it can hold the conversations it is sent (`takesWork`, `src/shared/contractFeatures.ts`).
That is stricter than the version rule's window for a client, because the home sends it the work itself (`docs/contract.md`).
On another major it still connects, says "MacBook Pro has another version of Infinitary, so this computer takes no new work." and "It takes work again once it is updated from MacBook Pro.", and takes none until it is replaced with the home's version.
Its hello also says the version of Infinitary it runs (`appVersion`), so the home's Settings -> Devices says when it runs another (`docs/devices.md`, "Another version, and updating").
On the same major, a home and a computer may still be built from different contract changes, so each lists its own by name and keeps the other's (`changes`; `HomeLinkState.homeChanges` here, `WorkDeviceVersion.changes` at the home; `docs/contract.md`, "Changes by name").

## Updated by its home

A separate Linux worker with no kept copy answers `needsPackage` without stopping when its home advertises `joined-ubuntu-update`.
A home that reads that answer can try a package update over verified Remote Login.

On any version from `WORK_UPDATE_SINCE` on, the run answers its home's update order, `fm:firstmate:update`, whether or not it takes work (`updateHere`, `src/core/helper/update.ts`; `docs/devices.md`, "Updating over the connection"):

1. Where a copy of Infinitary is kept here (`installed.json`'s `app`, what a command got), it gets the home's at `/firstmate` with this computer's own key and no code - naming this computer's system and chip to a home whose welcome said protocol 5.1 or later, which answers Infinitary for them (`docs/devices.md`, "Infinitary for another system") - unpacks it in a temporary folder inside the data folder (a gzipped tar with the Mac's own tar, a published zip with the Mac's own ditto, a Linux AppImage as it came), and keeps it in place of its own at the same path, which is the one the background starts (`keepApp`).
   A copy that did not arrive whole, or another app than the one kept, changes nothing here, and the order is refused.
   The same app under the other name of the Infinitary rename - `Infinitary.app` for a computer that keeps `Firstmate 3000.app`, or back, of the same flavor - is kept beside the one here instead, and the background moves to it under that app's own label before the answer goes (above, "Under the other name"); the old copy and agent go once the run let the folder go, kept aside on trial while the new agent runs (below, "A copy that does not start").
   A background that will not move takes the new copy away again, changes nothing, and the order is refused.
   Another user on the home's Mac runs that Mac's own app, which is the home's already, so nothing is got.
   A separate Mac whose agent starts its own installed app - one that joined at its first launch (above, "A Mac that also controls") - is not on the home's version, so its first update keeps the home's copy in `app/` as a command-added Mac keeps one, and rewrites its agent to start that copy before the answer goes; once the run let the folder go, a shell in a session of its own takes the agent away and sets it up again, since taking it away ends every process of the run but one in its own session (`reloadInBackground`).
   Should that not happen, the agent starts the copy from the next login; every later update replaces the kept copy, and the installed app is left as it is.
   A home that sends an app the agent's label is not for changes nothing, and the order is refused.
2. It answers `{ restarts }`, whether a background is set up here (`installed.json`'s `service`), and says "MacBook Pro updated Infinitary on this computer to its version." and "It starts again now."
   (or, with nothing set up, "Start it again to run its work.").
3. Its run then ends as `updated`: every conversation lets go, as when it quits, and the command exits 0.
   The background keeps the run alive while the grant is in the folder, so launchd starts it again at once, now from this version; a run started by hand is not started again.

The home saves this computer's crew's work before it asks (below, "Saving its work before an update"; `docs/devices.md`, "Saving work before an update"): each turn's end here is a pause and never a failed turn, and nothing is handed to the crew until the update is over and this computer is back and caught up.
A turn the update still cuts off here, on a run that does not save its own work, ends as `interrupted` as when this computer restarts (below, "That computer restarts"), and the home reads that end as the pause too.
The order's name and shape never change across majors, so a home on any later major can still ask it.

From `WORK_DOWNLOAD_SINCE` on, on any major, a Mac's run also answers the download order, `fm:firstmate:update-download`, which names where the home's version is published and its SHA-256 (`downloadHere`, `src/core/helper/update.ts`; `docs/devices.md`, "Downloading over the connection"):

1. Where a Mac's copy is kept here, it downloads that version itself into a temporary folder inside the data folder with the instructions a Mac reached by its address runs (`MAC_DOWNLOAD`): its own curl over HTTPS, the SHA-256, its own ditto and its own codesign against the release's publisher.
   Only a checked, completely unpacked app is kept, as in step 1 above, under the other name of the rename too.
2. While it runs, it answers the home's `fm:firstmate:update-progress` with the bytes received, the size the release stated and what is under way: `downloading`, then `updating` once it is keeping what it got (also while the update order runs), or `failed` or `mismatch` once a download ended with nothing changed; `idle` in a run with none of those.
   The state is open text: a home reads one a later version adds as under way.
3. Kept, it answers `{ restarts }` with its last count, says the updated lines, and its run ends as `updated`, as above.
4. Anything short of that changes nothing here and answers `fallback`, `mismatch` for a download that did not match its checksum or publisher, or `failed`: a download that failed, stopped after two minutes with no byte moving, or did not finish checking within the update's thirty-minute backstop.
   The home then asks the update order at once.
   A Linux computer answers `failed` at once, and another user on the home's Mac runs the home's app, so it answers as the update order does; a separate Mac whose agent starts its own installed app downloads its first copy, kept as in step 1 of the update order.
5. A home that goes out of reach does not stop it: the home follows it by its progress once it is back (`docs/devices.md`, "Downloading over the connection").
   The run stopping stops it, and the run lets the folder go only once what it fetched is gone.

One update runs at a time: the download order asked while either runs answers `{ updating }` and changes nothing, and the update order asked while a download runs waits for it, as a home that could not look its version up asks it: a download that kept its copy answers that update's `{ restarts }`, and one that ended with nothing changed lets the update go on.
A development run may stand in the publisher check with `INFINITARY_CODESIGN`; an installed app never reads it.

### Saving its work before an update

A run whose hello lists `work-update-saving` saves its own crew's work before its home updates it, by any of the home's routes, the way the home's own update saves the home's work (`SessionHost.saveForUpdate`, `src/core/helper/sessionHost.ts`; `docs/alpha.md`, "Saving work before an update").
This computer, not the home, decides when its work is saved:

1. The home asks `inf:session:save-for-update` once the update goes ahead.
2. From then on no turn starts here: one asked meanwhile never reaches its model and ends failed with `unstarted`, which the home reads as a turn stopped before it started (`StoppedBeforeStartError`), so it sends that turn's words again once the update is over.
3. Each conversation working here stops where nothing is lost (`stopSafely`): its running calls finish and keep their results, a call it would start is refused and says so, and then its turn is cut.
   A session that cannot hold its calls is cut at once.
4. It answers once every stopped turn's end is written here and the home has taken every event written by then (`flushed`), naming each task whose turn it stopped.
   The home writes what it took before it answers, so each stopped turn's outcome is kept on both sides before anything here stops, and the home keeps answering the crew's tool calls until then.
5. The same save asked again, such as after the home went out of reach and came back, joins the first and answers the same.

The save lasts until the update ends this run.
When the update did not replace this copy, or the captain chose Update later, the home asks `inf:session:release-update`: a stop still waiting is withdrawn and its turn goes on as if never asked, turns start here again, and the answer names the same stopped tasks.
When the home says nothing for `UPDATE_RETURN_MS` after the save answered, this run lets the save go by itself, as if released.
A home without the change never asks either order, and a run without it is never asked them: that home stops this computer's turns from there, as above.

### Waiting for its update

This Mac may run a newer version than a computer that runs work, as for the minutes between this Mac's update and that computer's.
Before a crewmate turn there, this Mac has the task's working copy confirm the project's approved address (`PlacedCopies.followProject`), which a computer can do only once its hello lists `placed-project-address`.
A connected computer whose hello lacks it refuses that turn as `ComputerBehindError`, naming the change (`src/core/connection/contractChanges.ts`); a computer not connected says nothing of its version, so the turn's order waits for it to be back, as any order does (`DeviceOutOfReachError`).
A turn refused as `ComputerBehindError` never reaches its model and never closes its task (`CrewUpdates.waitForUpdateThere`): it ends as a pause, its words go back on its lane, and the feed says once that the task waits for Infinitary on that computer to be updated.
The first task to wait on that computer brings back its one Update card, even after Not now (`recallUpdateCard`; `docs/devices.md`, "The card that asks for it"); the tasks that wait beside it raise no second card, and nobody is woken.
Its lane then waits, with what the first mate sends meanwhile, as for an update under way (`waitsForUpdateThere`, the `update` lane hold), and a provider outage the lane already carries is kept but not told again as still down meanwhile.
Once that computer is connected with a hello that lists the change, the lane goes on by itself: the computer coming back caught up sweeps it at once (`placedCaughtUp`), and so does the next sweep of the lanes.
The wait lasts only as long as this Mac's run; after a restart here, the next turn is refused and waits again.
A task that moved to another computer, or closed, waits no more.
A connected computer whose hello lacks such a change takes no new work (`WorkDevices.lacksTurnChange`, read by `Computers.takesNoWorkUntilUpdated`), though it speaks this Mac's major: automatic placement passes it by, and a task already placed there waits before it starts, as for a computer on an older major, with the same feed line and Update card.
Other refusals that name an update there, such as preparing a working copy, do not wait this way yet.

### A copy that does not start

An update over the connection keeps the copy it replaces until the new one has reached the home once, and goes back to it by itself otherwise (`src/core/helper/updateTrial.ts`).
It applies where the update keeps the home's copy in place of one of the same name, the answer says the background starts the run again (`restarts`), and that background can be started again from outside its run: a Mac's agent, through launchd's own `launchctl`, or a Linux service, through the `systemd-run` beside the user's own `systemctl`.
Three more routes keep a trial (below); anywhere else the replaced copy goes at once, as before.

1. Keeping the new copy, the update moves the one it replaces beside it (`<app>.previous`) and writes a trial (`app/trial.json`) naming both.
2. Once the run let the folder go, it leaves a watcher behind in the system's own shell, outside the run: in a session of its own on a Mac, and as a transient service of the user's own systemd on Linux, since the service's stop takes every process it started with it; the run waits until `systemd-run` started that service.
3. The new copy's run ends the trial the first time it reaches the home, on any major; the old run, which kept the copy or is stopping, never does: the previous copy goes, and so does any note of an earlier one that went back.
4. A trial still open after the update's wait (`UPDATE_RETURN_MS`, the three minutes the home waits for it) means the new copy exited at start, or started and never reached the home.
   The watcher then puts the previous copy back at its path, keeps the trial as `app/went-back.json`, and has the service manager start the background again (`launchctl kickstart -k`, or `systemctl --user restart`), now from the previous copy.
5. That run's hello says `failedUpdate`, until it first reaches the home, which then has heard it (`docs/devices.md`, "A copy that does not start").
   The hello names no version: a release bundle says only the numeric core of its version, so an alpha's would not match, and the copy that did not start is the one the home sent, at the home's own version.

Whoever renames the trial file first decides, the new run to keep its copy or the watcher to go back, so the two never both act.

Three other routes keep a trial the same way, each setting aside what it replaces in `app/before-update/`, the trial's previous, which ending the trial takes away whole (`setAside`):

- A Mac's first copy ("Kept here first" under "Updated by its home"): the agent's file and `installed.json` are copied aside before the agent is rewritten.
  Going back puts both back, takes the kept copy away, and has launchd read the agent anew (`bootout`, then `bootstrap`), so it starts the installed app again.
- A copy under the other name of the rename, whose work stays in its folder: `installed.json` is copied aside before the background moves, and once the run let the folder go the old copy and its agent's file are moved aside before the old agent is let go.
  Going back puts the three back, takes the new copy and its agent away, and starts the old agent again.
- An update over Remote Login ("Started by the home"): the agent's file and `installed.json` are copied aside and the copy kept here moved aside before the sent copy is kept; the watcher starts once the background is running again.
  Going back puts them back and has the service manager read the agent anew.

A copy under the other name whose work moves into the other spelling's data folder keeps no trial: the move retires the older folder, which the copy before it cannot open again.
A route whose background starts only at the next login, or not at all, keeps no trial either: the new copy could not reach the home within the wait, so the trial and what was set aside go and the new copy stays.
A Windows PC keeps no trial, since a newer Infinitary reaches it only by an install there.

### Building the home's source

A home run from source at a commit asks a Mac that runs work for it to run the same commit with the source order, `inf:source:build` (`sourceOrders`, `src/shared/work.ts`; `buildSourceHere`, `src/core/helper/sourceBuild.ts`; `docs/devices.md`, "Matching the home's build").
A run whose hello lists the `source-builds` change answers it:

1. It refuses at once, changing nothing, on a computer that is not a Mac (`system`), with no background whose agent launchd can start (`keep`), or without this user's own Node and pnpm on the search path the app reads for its children (`tools`).
2. It gets the home's committed tree at that commit from `/infinitary-source` with its own key (`fetchFromHome`, `src/core/devices/dial.ts`) and unpacks it with the Mac's own tar into `source/.<commit>.partial` in its work folder (`fetching`).
3. It runs `pnpm install --frozen-lockfile` there (`installing`), then `node scripts/prepare-local-codesign.mjs` and electron-vite's build (`building`), each through `hostEnv()` with a thirty-minute limit.
   A step that fails takes the partial folder away, changes nothing else, and answers which step with the last of what it printed (`fetch`, `install`, `build`).
4. It writes what it built beside it (`infinitary-build.json`: the commit) and renames the folder to `source/<commit>`; a build of that commit kept there already is used again without building.
5. It rewrites its agent to start that build's own Electron (`node_modules/electron/dist/`, as `path.txt` names it) with the build's folder, and takes away every other build but the one this run started from.
   That is on trial as an update's copy is (above, "A copy that does not start"): the agent's file and `installed.json` are set aside first, and a build that does not reach the home in the update's wait has them put back, the build taken away and launchd read the agent anew, so the copy before it starts again and its hello says `failedUpdate`.
6. It answers `{ restarts }`, and its run ends as `updated`, as the update order's does.

The run it starts reads `infinitary-build.json` and says that commit in its hello (`buildIdentityOf`), so the home sees it matched.
While it runs, `fm:firstmate:update-progress` says `fetching`, `installing` or `building`; one source build or update runs at a time, and the order asked while either runs answers `{ updating }`.
A run started from a build in `source/` that its home brings back to a release keeps the home's copy as a Mac's first copy (above, "Updated by its home"), in place of the installed app its agent named before, and sets that app aside on trial; the builds left in `source/` go at the next source build.

### Saved by a newer Infinitary

The grant (`home.json`) may be one a newer Infinitary saved, with a later version number or fields this version does not know (`JoinedHome.savedByNewer`).
This version names that, and never reads it as not joined:

- the run says so and ends, and pauses its agent so the service manager does not start it on that work again and again (`pauseNewerWork`); the agent's file stays, so a newer copy's window or an update loads it again;
- with an update's trial still open, the agent is left as it is, and the watcher goes back to the copy before it;
- with another live run holding the folder, the newer copy's own while this one was started by hand, the agent is left running;
- `work status` says so;
- a Mac's window never writes its own grant over it, and reports its work half blocked as `newer-work` (`docs/view.md`, "A Mac that runs work").

A grant unreadable for another reason is still no grant.

## Resource observations

The home can ask a work-enabled computer for current CPU and memory facts through the read-only `inf:computer:resources` order (`src/shared/resources.ts`), from protocol 6.3 on.
`ComputerResources` (`src/core/placed/computerResources.ts`) reads the home through the same sampler and freshness policy, with `null` as its computer id.
These observations do not choose a computer, change Runs on, start a conversation or reserve capacity.
They are kept in memory and never load accounts or sign-ins just to answer a reading.
The shared feed samples every two seconds while a task is active or a local declared run remains, even with no screen subscriber; screen demand retains its existing lease.

- `ResourceSampler` measures CPU time deltas across a window of at least 250 milliseconds, no longer than five seconds, and reports the idle fraction and logical processor count.
  A read within five seconds of the previous endpoint reuses that endpoint and measures the whole interval, finishing the minimum window if needed.
  The first read or one after a longer quiet spell takes a fresh quarter-second window.
  A timer can wake before its millisecond, so the sampler waits again until the window is finished, never reading an early wake as an interrupted window.
  Process-time deltas use the corresponding process endpoints, so local declared-run accounting and task Use cover the same refresh interval.
  A missing CPU list, changed processor count, reset counter, empty delta or interrupted window is unknown, never idle.
- The desktop host supplies memory facts in bytes through `HostCapabilities.resourceMemory`; work mode supplies the same adapter (`src/main/host/resourceMemory.ts`).
  Linux supplies `MemAvailable` separately from free memory.
  On Windows, Electron's free memory is Windows' available physical memory, the same estimate, so the adapter supplies it as both, with no swap (`docs/windows.md`, "Automatic on a Windows home").
  On macOS, the adapter supplies free, purgeable and file-backed memory from Electron, and inactive memory, speculative memory and macOS's pressure level from a fresh `vm_stat` and `kern.memorystatus_vm_pressure_level` read with each sample.
  A development or end-to-end run stands in the pressure level with `INFINITARY_MEMORY_PRESSURE` (`normal`, `warning` or `critical`) in place of that read; a packaged build always reads macOS.
  The sampler awaits that read.
  A failed system read omits those facts and keeps Electron's.
  The sampler does not add the Mac figures or claim they are Linux's available-memory estimate.
  The home's receiver works out one memory-used figure from those facts as each fresh reading arrives (`docs/routing.md`).
  Missing or invalid memory makes the whole observation unknown.
- Every answer names the sampler's random lifetime epoch and an increasing sequence, not a remote timestamp or a permanent hardware identifier.
  The home measures age on its own monotonic clock, from before the request, so network travel and sampling both consume the ten-second freshness allowance.
  Negative age, an expired observation, malformed data and repeated or reversed sequences are unknown.
- Every connection transition discards that computer's cached observation and sequence history and invalidates its pending read.
  A late answer from an earlier connection cannot populate the new one, and an epoch change without reconnect is refused.
- Concurrent readers share one request per computer.
  A request that has not answered within five seconds returns unknown; it stays single-flight until it answers or disconnects, so an unresponsive computer cannot accumulate requests.
  Disposal releases listeners, clears readings and invalidates pending answers.
- A computer that is out of reach or speaks an older protocol is not asked.
  It remains available for the existing manual placement paths; missing observations never change its task placement.

The observations are physical-system facts, not process-enforced limits or a prediction of later build demand.
They do not establish OS/tool/project compatibility, shared-physical-computer identity or pending-start reservations.
The pure evaluation seam defines conservative admission allowances and typed requirements (`docs/routing.md`, "Read-only computer evaluation").
Automatic starts combine these observations with fresh compatibility and atomic reservations, as described below.
Screens, personal panels and Automatic placement share the `computers.resources` source; sampling itself persists no history.

### Shared live readings

`computers.resources` is the read-only catalog interface for screens and personal panels, served by `inf:computers:resources` and the same-named push.
A paired view is sent that push as a `live` frame outside the numbering, and a phone, which never shows it, is sent none (`docs/connection.md`, "Live pushes").
A panel must declare that read in its manifest; the frame controller and personal-panel binding refuse an undeclared subscription before making any request.
An authenticated paired view may read it, but a work connection cannot ask it.
Its `computers` array contains the home (`computerId: null`) and each paired work computer, with a label and the shared `ComputerResourceReading` shape from `src/shared/resources.ts`.
Control-only devices are absent; an unreachable or older work computer stays present with an explicit unknown reason.
A fresh reading carries receiver-owned `ageMs`, the one memory-used figure when the reading has one, CPU idle fraction and logical CPU count, and the OS's separate memory observations.
A panel is handed installed memory, that figure and Mac pressure, not the raw counts (`docs/personal-panels.md`).
A failed refresh retains its refusal in memory, so a cached reader sees the same unknown reason as the reader that requested it.
An expired refusal or observation reads stale; no raw history is kept.

`ComputerResourceFeed` (`src/core/placed/computerResourceFeed.ts`) owns one demand-leased loop for all those consumers, over the existing `ComputerResources` receiver and sampler.
It requests at most one sample per computer per two-second cadence, with the receiver's existing single-flight timeout boundary, and publishes completed readings as whole snapshots.
Just before it asks for new readings it calls its `onSample` listeners, so what a listener notes there happened before every sample those readings carry; Automatic placement witnesses running tasks there (below, "Automatic starts").
A contact change immediately publishes the invalidated state; old pending replies cannot fill a new connection's cache.
A task change publishes only when it starts crew work or moves a computer's declared runs, so a run waiting in the line shows at once while other task writes send nothing (INF-2420).
A slow computer cannot hold another computer's completed reading back.
The renderer shares one upstream push subscription and freezes each pushed value before fanning it out to its local readers.
Read-catalog subscribers renew demand every five seconds; those requests return the shared cache rather than starting their own loops.
The last screen demand expires after fifteen seconds; when no task is active either, no new samples begin until another read or task activation arrives.
A read already in flight stays bounded by its timeout.
Closing the core stops the loop and invalidates the receiver.
Ordinary samples write no database row, task event, activity line or panel-store value.
A memory warning on a computer writes one Activity notice and one durable first-mate wake when it begins, told once until it ends ("Running tasks’ resource use").
These readings are observations only, never a scheduling commitment, a physical-sharing identity, or a stored placement snapshot.

### Running tasks’ resource use

The optional `processes` observation carries the process count and each task’s processor equivalents, resident bytes and process count, plus everything else as `other`.
An absent field is an older computer; `unknown` is a failed process-table read, never zero use.
Process identifiers, arguments, paths, usernames and environments never cross the connection.
`ProcessRoots` owns explicit process roots registered by every shell job, including a synchronous one, and every coding Claude client.
`ProcessAttribution` walks parent links and registered groups, retaining observed ownership across reparenting only while the process birth stamp is unchanged.
Each process contributes once; a nested explicit root owns its subtree.
A process outside those trees belongs to the open task whose working copy or temporary folder it, or the nearest process above it, works in (`src/core/placed/workingFolders.ts`), so a test program a task's shell left behind, reparented out of its tree, still counts as that task's.
A registered root or group decides before any folder does.
The working folders come from `lsof -d cwd` on a Mac and `/proc/<pid>/cwd` on Linux, are read only when a task here is open, and never cross the connection; an unreadable listing attributes nothing by folder.
Every other process, including simulators started by launchd, remains in everything else.
Processor use comes from cumulative process-time deltas across the sample, not macOS’s lifetime-average percentage.
A process missing from the first reading, or reborn under the same number, counts all its processor time when its birth stamp is not earlier than the first reading's wall-clock time, since all that work happened inside the window; the comparison allows the whole second a Mac's `lstart` stamp truncates.
Wait loops start new processes in most two-second windows, so without this the whole task's figure went blank in most readings.
A process missing from the first reading that was born earlier, or whose birth cannot be read, leaves its task's processor use unknown for that sample, while its resident bytes still show.
Processes that ended between the two readings are not counted.
Resident bytes sum RSS, so shared pages can appear in more than one process; they are not unique physical memory or the placement memory figure.
Linux reads cumulative processor ticks and the process birth tick from `/proc/<pid>/stat`, using the host’s `CLK_TCK`, rather than the whole-second TIME that Linux ps reports.
Those asynchronous reads run serially so a large process table cannot exhaust open file descriptors; a process that exits between the listing and its stat read is left out of the reading, and an unparsable stat has unknown processor use.
The birth tick reaches the wall clock through `/proc/uptime`.
The Mac adapter adds swap occupancy from `vm.swapusage`, independently of installed memory; Linux reads SwapTotal minus SwapFree from `/proc/meminfo`.
None of these additions changes placement, its margins, sampling cadence or process priority.

The home tells each memory warning on a computer once: one Activity line naming the computer and what holds the most memory, and one durable first-mate wake, when the warning begins.
Later readings in the same warning tell nothing more, except a first turn to critical; a missing reading does not establish recovery.
A warning ends only after the computer reads normal following 30 minutes without pressure, and only then can a new one begin ([heavy-runs.md](heavy-runs.md), "Capacity and pressure").
The wake carries the observed task shares, unclaimed use, process count and swap occupancy when available.
The first mate decides what to steer; this observation path never kills, pauses, slows or gates a run.
The task record’s Use row reads these same live observations, with explicit unavailable words when they are missing or stale.
The separate [heavy-run line](heavy-runs.md) consumes the completed sample to admit caller-declared programs, retains their groups across restart, and supplies the task record's separate Run row.
Its order shares the resource feed's cadence and is asked of every computer that runs work.


## Holding a conversation

A home may open a crewmate's conversation here, while the crewmate's reports, cards and record stay at the home (`SessionHost`, `src/core/helper/sessionHost.ts`).
No new kind of message carries it: both directions ride the connection's own `invoke` and `result` (`docs/connection.md`), with the shapes in `src/shared/work.ts`.
A home opens one for a task whose record names this computer (`task_execution.device_id`, below), which a project's Runs on sets (below, "Runs on").

- **What runs here.**
  The real Pi or Claude conversation, with the crewmate's file tools and shell in the task's own working copy here (below, "Its working copies"), and this Mac's own sign-ins: Claude on this macOS user's own client and login, or the token command set up for Claude Code here (`docs/claude-client.md`, "Access a company set up"), and Pi with an agent folder of its own (`startConversations`, `src/core/helper/conversations.ts`).
  A Pi conversation binds to one of this computer's own accounts for its provider (`bindHere`): the one the home named when it is this computer's, else the one preferred here, else the first that can serve; with none it is refused as having no sign-in here, and never borrows the home's.
  A Claude conversation names this computer's own Claude account the same way, from the sign-ins it already keeps without loading them for it, and with none here it runs on this user's login under no account (`CLAUDE_LOGIN_HERE`), never under the home's.
  The conversation's state names that account to the home (`PlacedState.accountId`), so what its turns spend and meet is that account's (below, "Its own sign-ins").
  The crewmate's own tools run here too, so a card body file or a picture is read where the crewmate wrote it; only what a tool hands the host crosses (`toolCallbacks`, `src/core/helper/toolCallbacks.ts`, which also asks the home for the files, integrations and secrets commands).
  A card's demo recording is played here before the card goes to the home, in the same hidden, isolated window the home uses (`src/main/mediaProbe.ts`, handed in by `src/main/work.ts`); that window closing never ends the work mode.
  A preview's project font is checked and loaded here the same way, in a window of the same kind (`docs/card-authoring.md`, "Fonts by reference").
  A task the home says has a browser has it here too, in hidden windows of this computer's own, which its crewmate drives through this computer's own task channel and the captain watches and takes from the home (`docs/task-browser.md`, "On another computer").
  The sites the captain signs in to there stay in this computer's own kept profile, under this computer's own rule for each; the home never receives a sign-in, and this computer never receives the home's.
  A task the home says reaches its integrations has `infinitary-integrations-axi` on the same channel, and each list, show and call is asked of the home, whose sign-ins never come here (`docs/integrations.md`, "On a computer that runs work").
  A task the home sends `files` has `infinitary-files-axi` on the same channel, and each listing and copy is asked of the home, which delivers a copy into the task's hand-over folder here (`docs/files.md`).
  A long command in the crewmate's shell is a background job here, and its end crosses as a request.
  Each job keeps a row in its task's folder while it runs (`jobs.json`, written by `PlacedTasks`, the one writer there), this computer's stop marks the row of each job it kills, and a job that exits keeps its row, with its exit, until the home answers that end.
  `SessionHost` sends each end under the job's own call id and forgets the row only once the home answers or the request's deadline withdraws it (below); at the next start, before any conversation opens, every row left is sent the same way - an exit the home had not answered as that exit, and a job the last run's end cut off as an end saying it never exited (`interrupted`: `quit` when the stop killed it, `crash` when the run ended without one, so the command may have run on).
  A stop before an answer asks again at the following start, and the home answers it from what it kept, so its crewmate is told once and never waits for an exit that cannot come; a closed conversation's rows go untold.
  A Claude crewmate's background work runs inside its own client, which ends with this computer's stop: each task the client lists as running keeps a row the same way while it is listed (`background_work_changed`'s `tasks`, which stay here while only the count crosses), the stop marks those rows as it ends the client, and the next start tells each the same way, by the id the model was given and the description it gave the task.
  A task the client stops listing loses its row, since the client tells its own model how it ended, and a remote task, which does not run inside the client, never gets one.
  A client that ends while this computer runs on - the home lets go of it (`detach`, as its quit or restart does), a moved contract reopens the conversation, or the client stops by itself - ends every task it still listed: each row keeps that end and is sent at once the same way (`interrupted: client`), so the crewmate is told once and never waits on it, and a close tells nothing.
  A home before protocol 9.2 hears that end with no `interrupted`, as an exit by signal (`CLIENT_JOB_ENDS_SINCE`, `docs/contract.md`).
  On a separate Mac the shell's commands run at the run's own priority, not below the UI as the home's crewmates' do (`src/core/utilityQos.ts`): nothing there draws the character, and below it a crewmate's builds and tests starve behind that computer's other work (above, "In the background").
  On the home's own Mac, as another user joined by the command for one or added at this Mac's own address, they stay below the UI, which the home's window draws there, as that user's whole run keeps low priority (above, "In the background"; `separateMac`, `src/core/helper/background.ts`; captain on INF-255).
- **What the home asks** (orders): `inf:session:roster` lists what this Mac holds, the folder its tasks live under and the one its working copies do, which the home writes the crewmate's instructions with, and whether it keeps task browsers; `open`, `prompt`, `steer`, `abort`, `detach` and `close` drive a conversation; `copy` brings its record home, from where the home's copy of each file ends; `delete-outside` replaces the words from outside it holds once due (below, "Words from outside"); `remove` deletes the folder of a task the home no longer records here (below, "Leftovers"); the `inf:working-copy:` orders make, read, keep and retire its working copy (below); the `inf:task-browser:` orders are the captain's side of a task's browser here, each answered live and never kept, since an answer may hold a sign-in; the `inf:files:` orders list a folder here and set aside, read and let go one file for the files command, each answered live (`docs/files.md`).
  `prompt` answers once its turn has started, and the turn's end is an event.
  A steer that reaches a turn that already ended answers `delivered: false`, so the home puts its words back on the lane.
- **What it asks the home** (work requests, `reach: "work"`): one per tool callback - a card, a refused merge card, closing a card, a follow-up, a progress note, a report, a reply, a look at the task list, a workflow log, a GitHub read or write, opening or checking its change, downloading an artifact, a read or write of the home's knowledge (`docs/knowledge.md`, "The tools"), a list, show or call of the home's integrations (`inf:work:integrations`, `inf:work:use-integration`), the computers, a listing or a copy for the files command (`inf:work:files`, `inf:work:copy-file`), a list of the home's Secrets catalog, metadata only (`inf:work:secrets`), and for a task whose spec carries `secretUses`, a Secrets use the home decides and the values of one it approved, taken once (`inf:work:secret-use`, `inf:work:secret-take`, `docs/secrets.md`, "On a computer that runs work"), and for a task whose spec carries `secretAsks`, an ask to keep a secret raised on the home's own card, never a value (`inf:work:secret-ask`, `docs/secrets.md`, "Asking to keep a secret") - plus a card picture's bytes before its card, a demo recording's after its poster in pieces of at most 1 MB (`inf:work:media`), each project font of this task's own that a card's preview names before that card (`inf:work:typeface`), each data file of this task's own that a card's script reads before that card, as a card's media in the same pieces (`inf:work:media`), a background job's end, the numbered events of what the conversation did, and what a task's browser here has the home do once (`inf:work:browser-event`).
  A task browser's fact, and its pictures while the captain watches, are said once while the home is in reach, since the next one says it whole (`inf:work:browser`, `inf:work:browser-frame`).
  A fold of the conversation's context is one of those events only to a home on the current work major, which then sends the crewmate's directions again on its next turn; a home that does not hears nothing of it and sends them on every turn.
  Each callback asks after every event written before it, so the home hears them in the order they happened.
- **Nothing is done twice.**
  An order that acts carries an `orderId` from what the home saved; one already applied is answered as it was, from `tasks/<task>/orders.jsonl`, without acting again, but for a keep, which reads the working copy again (below, "Its working copies").
  A prompt's answer is kept before its turn starts.
  A callback asks under one `callId` and asks again under it after every drop until the home answers or the callback's deadline expires (`HomeLink.ask`); the home keeps each answer and answers a repeat from it.
  Before a change, once its conversation or receiving service is ready, the home appends that id to `crewmates/<task>/placed/begun.jsonl` and syncs the file to disk (`PlacedLedger.begin`).
  A repeat with a begun mark but no kept answer does nothing: it keeps and returns a warning that the change may already be done, naming the operation and what to check before trying again, never a raw channel id.
  Reads, and a change whose request declares that it repeats safely, leave no begun mark; a picture, a demo piece, a font and a knowledge write are those changes, and knowledge keeps its own request id.
  A begun-only report is never replayed into an adopting turn.
  The sync protects against a process crash or quit, not every sudden power loss: it does not request macOS `F_FULLFSYNC`.
  Older homes ignore the separate file; the request and answer formats are unchanged.
  Events are numbered per task, written to `tasks/<task>/outbox.jsonl` before they are sent, sent one request at a time from the number after the home's `through`, and forgotten up to the home's `kept`.
  After every welcome the events after the home's `kept` go again, since a home that restarted within the link's grace holds only what it kept and this Mac saw no change of contact; a home that only lost the connection skips the ones it has.
  A refusal holds a task's events until the next welcome or order from the home.
  The home takes no event of a task it closed, so once it refuses the events of a conversation it closed here for good, this Mac lets them go, from memory and from the outbox, and no welcome or later start sends them again (INF-2080).
  An answer to events that arrives after this computer's conversations stopped changes nothing here: the run that starts next from the folder may already have gone on, and it sends again the events after the `kept` it reads, which the home skips where it has them.
- **Lost contact.**
  The turn goes on while the home is out of reach, and a tool callback waits at most 24 days (`PLACED_REQUEST_WAIT_MS`), for either provider.
  One deadline starts with each callback, including its wait for earlier events and every picture, demo piece, font and final request it sends.
  Answering one request does not reset that callback's deadline.
  At the deadline the work computer withdraws the request permanently, including from reconnect retries.
  Claude's typed handler timeout also withdraws a waiting request, even when sleep has paused the work computer's own timer.
  Ordinary home-stopped turns and Pi turn cancellations leave the request waiting for its real answer.
  Claude carries the give-up signal through its runtime adapter, and each tool passes that signal to the requests it makes, so one tool's cancellation never reaches another's.
  A completion-refusal record is not one of those requests, so it is still sent after the card's callback is cancelled before its card request went out.
  A background job's end is not one of those requests either, so a job started under a callback still tells its end after that callback is cancelled.
  Its answer says the change was not sent if the final change request never went on a connection, or may already be done if it did, even if that connection dropped.
  A merge card whose card request went out that way records no refusal, since the home may already show it (`OutcomeUnknownError`; `docs/card-authoring.md`, "A refused merge card").
  A request declared to repeat safely never implies the change may be done, and the home marks none of them begun; both computers read that declaration on the request (`repeats` in `src/shared/work.ts`).
  Sending proves only that the home may have received it; it cannot prove receipt or completion.
  A change that may have acted names the same operation-specific check as a begun-mark warning (`src/core/session/workRecovery.ts`); a read is called a request, and can be asked again when its answer never arrives.
  Claude's client would give up on an app tool after about 28 hours, so a conversation here runs it with `MCP_TOOL_TIMEOUT` at the longest a timer holds, about 24.8 days, above our own deadline (`PLACED_CLAUDE_ENV`; `claudeToolWait.integration.test.ts` measures both).
- **Quitting here** lets every conversation go: a running turn ends as `interrupted`, and is said to the home once it is back.
  A turn a crash cut off ends the same way at the next start.
  Asked again for the prompt that started it, this Mac answers that turn's number and starts nothing.
- **Closed** is for good: a closed conversation opens no more.
  A week after the task closes, the home asks `inf:session:clean-files` to remove its evidence and other leftovers here, unless live work holds them (`docs/task-retention.md`, "A closed task's leftover files").
  When the task closes, the home asks `inf:session:clean-temp` to remove only the provisioned temporary folder, after this conversation is closed, and waits for the answer (`docs/task-retention.md`, "A task's temporary folder").
  A computer older than protocol 7.1 is not reported as cleaned.
  The conversation, card bodies and copies, and protocol state stay; an open conversation refuses cleanup.
- **Words from outside.**
  The home asks `inf:session:delete-outside` when the Gmail and Calendar content a conversation here read is past its days, or the captain deletes it (`docs/task-retention.md`, "Words from outside"); a home asks only a computer on the current contract major.
  The order names each kind's label, the moment its words read by then are due, and the note that takes their place, so this computer holds none of the home's rules.
  Its `files` names the files from outside, such as a saved Gmail attachment, due in the task's hand-over folder here, which this computer removes first, whatever the conversation is doing.
  It reads the conversation's record and this Mac's own Claude client's files for it (`claudeConfigDir`), and answers `waiting` while a turn runs, the conversation opens or carries on by itself, or its client runs work of its own.
  A conversation open here is let go of first, so its files have no writer and nothing of them stays in memory, and its due files are written again through a temporary file and one rename.
  A home that asks `holdReopen` (`reattach-only-open.md`) opens it again itself, routed first: this computer answers `reopen` and opens nothing.
  A computer without that change opens it again by itself with what the home opened it with, from its record (`state`); its home lets go of its own session for that conversation before it asks, reads no `state` from the answer, and the next words open the conversation through an ordinary open, checked as new (`PlacedSessions.deleteOutside`).
  The home asks neither while an open of that conversation there is still unanswered, or answered but not yet accepted by the home's check, so no conversation it lets go of reaches this Mac afterwards; it asks again on a later pass.
  From its ask until the reopen it asks settles, the home sends no open and no words for that conversation, and an answer that never arrives is treated as a let-go, so the home opens it again routed; words it gave back meanwhile go once that open settles.
  The conversation an older computer opens again by itself is marked refused at the home (`refuseHeld`), so even a roster that names it open is never reattached to, and the next words route as for a new conversation.
  Its answer names each file it changed under the record's folder, which the home copies whole; nothing is remembered, since asked again it finds nothing left to replace.
- **The record** is the conversation's own file under `tasks/<task>/sessions/`, and its state names it by its path there (`record`), which is the name the home's copy goes by.
  A Claude conversation that started over as it opened names the one it started over from in its state (`renewal`) until a turn of the new one finishes, so a home that opens it again before then still tells the crewmate why, and one that opens it later never tells it twice.
- **After the one-time move.**
  Before any conversation opens, `PlacedTasks` migrates recoverable Pi turns once (`helper/migrateConversations.ts`).
  The migration joins turns the older recovery copy gained after the move into the current record with `joinRecord`, retaining their order and any newer turns.
  It never writes the recovery copy or rewrites historical words.
  A completion record is written only after every record succeeds; a failed or interrupted migration is safe to run again.
  Pi resume tokens select a record within this task's current sessions folder, so a path the home saved before an update cannot reopen the recovery copy.
  The home writes fresh instructions with the folders the current roster names, without a browser-command sentence swap or a moved-folder notice.
  Both home and work computer must speak the same protocol major before work resumes.
- **Loaded only with work.**
  The conversations' code is its own chunk, loaded when a home opens one or one from an earlier run is still on disk, so a computer that is never given work never loads a model's code.
  Measured on the built app on Apple silicon: 177 MB for the work mode with nothing open; with one Claude conversation open and idle, 180 MB for the work mode and 385 MB for the Claude client beside it.

## The home's side

`PlacedSessions` (`src/core/placed/placedSessions.ts`) is the home's half, composed in `createServices` as `services.placed`; it reaches the computers only through `WorkDevices`, which the shell attaches to the connection (`docs/devices.md`).
It is the one writer of a task's `crewmates/<task>/placed/` folder at the home, through its `PlacedLedger`.
Its parts sit beside it in `src/core/placed/`: what the crew reads of the computers (`CrewMachines`, `crewMachines.ts`), the callbacks it answers (`placedCallbacks.ts`), what it keeps of them (`PlacedLedger`, `placedLedger.ts`), this Mac's copy of a record there (`RecordCopy`, `recordCopy.ts`), and each computer's own accounts (`PlacedAccounts`, `placedAccounts.ts`).

- **Where a task runs.**
  `task_execution.device_id` (migration 63, moved by migration 97, written by `TaskService.placement.setDevice`) names the paired computer that runs work holding a task's conversation; null is this Mac.
  The supervisor reads it where it used to name this Mac: that computer makes the task's working copy (below, "Its working copies"), and the session opens on that computer's factories, with that computer's folders in the crewmate's instructions and its working copy as the crewmate's own; this Mac makes no working copy for it.
- **Factories.**
  `factories(deviceId)` is one `SessionFactory` per backend for that computer, presenting the backend it runs there, so no third backend exists; each refuses another machine, another backend's binding, and anything but a crewmate's rolling coding conversation.
  Its `PlacedSession` (`src/core/placed/placedSession.ts`) drives the conversation by orders and answers what a session answers at once - its model, its record, whether a turn runs - from the state the computer last sent.
  It presents `backgroundWork: "client"`, since that computer's jobs are out of this Mac's sight: its background-work count stands in for the job list, as for Claude here.
  For Pi, the computer's `JobManager.onChange` publishes each open conversation's own running job count through `background_work_changed`, on each count change and whenever the home opens that conversation, including zero when no job runs.
  That count can reach the home before the computer answers the open; the home then asks for the conversation (`adoptPlaced`), and that ask joins the open already under way rather than opening a second conversation over it (`CrewSessions.resumeTask`).
  While the count is above zero it names the conversation's longest-running job, its id and command (`job`), and a change of that job is sent too.
  The home reads that count for the hover, Tasks dot and idle ladder's bounded job witness; Claude keeps reporting its client's own count, never the computer's Pi shell count.
  Its words about the job - the check-back ask, the job bound's wake, a timed wait's end and the crew line - name the command; work no one named, from a computer built before it sends one or a Claude client there, is named by that computer's name, never as a Claude client's.
  A crewmate tool runs there; the session spec's `callbacks` are what the home answers each callback with.
- **Orders, by what they deliver.**
  A prompt or steer is named by the lane rows it delivers and this delivery of them (`rows:<ids>:<nonce>`); asked again after a drop it is the same order, which the computer answers without acting, and a later delivery of the same rows is a new one.
  A prompt resolves when its turn ends there and the record's copy is home; it rejects only for a failure the computer reports, never for lost contact, which only makes it wait.
  A steer that reaches a turn that already ended there is left over, and the turn's end gives it back to the lane.
  Disposing lets go here only: a running turn goes on there, and an idle conversation lets its client go (`detach`).
- **Work requests.**
  The home refuses one about a task its record does not place on the computer that asks, or one closed here.
  Each callback is done once, by the task's open session's callbacks, and its answer - or its refusal - is kept in `crewmates/<task>/placed/calls.jsonl` before it is returned, so one asked again is answered from there (`PlacedLedger`).
  A computer that runs work sends a project font only to a home on protocol 8.9 or later (`CARD_TYPEFACES_SINCE`); to an older home it refuses the card itself, in words saying to draw the preview in the app's own typefaces until the home is updated.
  It sends a card's data file home before the card that names it (`docs/card-authoring.md`, "Data by reference").
  A card picture's bytes are kept where this Mac's cards show their pictures from, and so is a project font's, only under the task's own id; a demo recording's pieces are written into a partial file there that becomes the recording only with its last piece, and a job's end reaches the task's lane as a local job's does.
  The events are taken once each and in order; the newest kept for good is saved at every model turn's end in `crewmates/<task>/placed/state.json`, so a restart here never counts a turn's usage twice.
- **Out of reach.**
  A task whose computer is out of reach, or back and not yet caught up, is held (`CrewFacts.outOfReach`): its lane is held as a cut-off holds one, a steer answers `recorded-held`, the quiet and two-hour checks skip it, and the idle ladder and the whose-turn sort read it as moving (`outOfReach`, `docs/report-sort.md`).
  Only the first is out of reach in words: a computer that is back says its tasks are catching up (below, "The Tasks row, the summary and the status").
  A start waits for it too, and never runs here instead.
  After a minute without a computer that has work the feed says "Mac mini is out of reach.
  Its work on website catches up here when it is back.", and once every task there caught up, "Mac mini is back.
  Its work on website caught up.", in the design skill's words (`components/devices/RunsOn`).
  The first line is held while the computer's connection is still being made (`connecting`), and said once it is really out of reach.
  One whose Infinitary runs work for another first mate now, as the home's SSH connection found (`other-home`), is never said to catch up: "Mac mini runs work for another first mate now.
  Its work on website stops when you remove it here."
- **Back in reach.**
  The home reads the computer's roster first: a closed record's conversation is closed there, a conversation that computer lost to a restart is opened there again from its record, a turn this Mac does not follow is followed, and the orders it could not ask go now under their own ids.
  A task is caught up once the home has every event its roster counted; its lane then goes on, with any row a restart here left in flight that no turn there took.
- **Whether a turn works there.**
  The computer answers it from the task's live session, never from notes of its own: its roster row says working while a prompt it took has not ended or its session streams, which covers a turn Claude carries on by itself (INF-2332).
  A conversation is busy while it works or an open is in flight (`SessionHost.busy`); while busy, a home's detach leaves its client running, a move to another computer is refused, and a reopen for moved instructions or another model keeps the conversation as it is and answers that it still streams.
  An idle conversation an open names another model or another account of that computer's for, because the home routed it off a model that left every level, opens again on that model and account (`SessionHost.contractMoved`; `docs/routing.md`, "A model that left every level").
  A reattach-only open keeps a held idle conversation on whatever model it runs and answers it, opening nothing new.
  The home then asks that open again once the turn ends here - its end taken, or an answer of not working with every event in - and never on an event mid-turn (`PlacedSessions.reopenIfOwed`); one that fails stays owed for the next end, so a conversation that starts over for the moved instructions reaches the supervisor as any reopen's does: the record names it, the timeline says why, and the next turn hears the brief and where the earlier transcript is ("That computer restarts", below).
  The home asks with the roster when the computer is back in reach, after twenty quiet minutes (`QUIET_CARD_MS`) and right after a stop, and keeps the answer beside the event count it was given at (`PlacedSessions.confirm`).
  The twenty-minute pass asks first and alerts after: its "may be stuck" note and the first mate's quiet wake wait for the computer's answer, and go unless that answer ended the turn here; an answer that the turn still works, one that ends nothing yet because the home is still behind its events, and no answer at all each raise them.
  When the home has exactly that many events and the answer is not working, it ends what its session still follows as begun there: a carried-on turn ends as `continuation_ended` with `unheard`, and a prompt turn it saw start ends as `interrupted` with its rows going again.
  An answer behind the events the home already has is dropped, and one ahead of them waits for them; a prompt not yet seen starting there is never ended this way.
  A report replayed after the home restarts also restores a followed boundary in `PlacedSession`, even when the saved model-message checkpoint passed its prompt's start and the computer has already quit.
  That report-only boundary ends with the prompt's numbered terminal event or a caught-up idle answer, so the supervisor and its session follow the same turn and return unread guidance through the normal inbox path.
  The supervisor ends an `unheard` continuation as interrupted, notes "its turn had already ended where it ran, but that end never arrived; ended here as interrupted" on the timeline (`UNHEARD_END_NOTE`), and the idle ladder takes the task from there (`docs/report-sort.md`).
  A crewmate on this Mac is checked the same way against its own session.
  Nothing that still runs is stopped.
- **What a quiet turn waits on (INF-2603).**
  The supervisor follows every call a turn has open from its `tool_start` and `tool_end` events, and every steer handed to the turn until the session's `input_read` says the turn read it.
  The quiet note, the first mate's `quiet` and `long-turn` wakes and the crew status (`waiting`) name each open call and when it started, and any steer still unread behind it.
  At the twenty-minute pass the app answers its own declared reads "ask again" (`OpenReads`, src/core/session/openReads.ts): a tool of the app's own whose work request declares `effect: "read"` (`APP_TOOL_REQUESTS`), never a change the app was making and never a call the crewmate started itself, such as a shell command or a helper agent.
  The read is answered on the computer that runs the conversation, so a home that hung, a request lost on the way and an answer lost on its way back all end the same wait.
  On this Mac a read open since the quiet stretch began is answered; on a computer that runs work the home asks `inf:session:answer-reads` with the newest event it has taken (`through`), and that computer answers each read that began by that event, so neither clock decides.
  The timeline notes each read answered, and no "may be stuck" alert goes on that pass.
  A steer still unread at the next twenty-minute pass wakes the first mate once (`steer-unread`), naming what it waits behind.
  The two-hour wake goes even while a background job runs, naming the job and any open call.
  A steer reaches a turn the crewmate carries on by itself: the computer delivers it while the live session streams, not only while a prompt it took runs.
- **This Mac restarts.**
  A turn on another computer went on without it, so the boot neither marks its row interrupted (`interruptLeftRunning`) nor puts its in-flight rows back on the lane (`InboxStore.resetInFlight`).
  The roster's running turn is followed as a continuation that delivers its rows; a turn its crewmate carries on by itself, which the roster says streams, is followed as carried on (`PlacedSession.adopt`); and a report it gave before the restart is given to that turn again from the kept answers.
- **That computer restarts.**
  A turn it cut off ends as `interrupted`, which the home reads as a failed turn in its own words; its rows go back for the honest retry, and the lane runs them again there in the conversation reopened from its record.
  An update the home asked is the exception: the home paused the turn for it, so its end is a pause, its rows go back due at once with no attempt spent, and the `turn-resumed` row its pause left carries the crewmate on once the update is over (`docs/devices.md`, "Updating").
  The computer records an errored `continuation_ended` before detaching a continuation at shutdown, or on recovery if a crash cut it off, so the home ends its autonomous turn and stops repeat copies after reconnect.
  Its optional `interrupted` fact lets the home use its own interruption wording with that computer's name, without interpreting the helper's error text; a closed task records no extra ending.
  The task's local state keeps an optional `continuing` boundary across acknowledged outbox trimming, only as the end it still owes the home, never as whether the conversation works; older state without it is recovered from the typed continuation events still in its outbox.
  Letting go of a conversation for any reason records that owed end first, so a home never waits on a continuation whose client is gone.
  The reopen names the tools that computer's contract allows now, not the ones it allowed when the conversation opened, and keeps the instructions as they were, so a version-gated tool such as `prepare_change` arrives without this Mac restarting.
  A reopen first asks that computer to reattach to a conversation it still holds, routing nothing; only when it answers that it holds none does the home route again and open a new conversation there, and prompts and steers wait for that reopen (`PlacedSessions.reopen`), and take none from a reopen that computer did not confirm until the crewmate here lets it go.
  A resume from this Mac reattaches the same way before it routes (`CrewSessions.openResumed`), and a cleanup of words from outside asks the computer to hold its reopen for the home.
  An older computer that lists no `reattach-only-open` is asked for nothing that could open the conversation again on a model that left every level: its reopen waits for a model.
  Before a cleanup of words from outside, which it answers by opening the conversation again by itself, the home lets go of its own session for that conversation, so whatever that computer opened is checked as new before it takes words (`docs/helper.md`, "Words from outside").
  A let-go asked while a turn runs waits for that turn to end, and takes effect as it ends, before words that turn gave back start another on the same conversation; those words then go to the conversation the task opens next (`placedLetGo`, `CrewTurns.atTurnOver`).
  When the task's model left every level, the reopen asks for the model routing chooses there instead, at that model's effort, and the home records the move only when the computer answers the conversation opened on it; when no model there can take it, or the replacement runs on the other backend, the crewmate here lets the conversation go and the next message opens it through the ordinary resume (`PlacedHost.reopenModel`, `PlacedHost.letGo`).
  A conversation the computer answers open on another model, or bound to an account there that does not serve the model, is let go the same way, and prompts and steers sent meanwhile go back to the lane unspent (`NotOpenThere`).
  Such a refused conversation may still be held there, so the task's next open on that computer opens anew instead of reattaching to it, until an open there takes words (`TaskMoves.refusedThere`).
  A new conversation there is marked so before it is asked, so one opened when this Mac quit, or whose open or check failed, before it was accepted is never reattached to unchecked.
  The check asks that computer its sign-ins again and takes the conversation only when it answers, on an account there that lists the model with its own allowance there not spent.
  An open that fails after its conversation began lets that conversation go, and a home that asks (`notOpened`, `open-not-opened.md`) hears that it left nothing there only once that let-go is over, or when it failed before anything began; any other failure fails as before, and the home reads it as one that may have left a conversation there (`SessionHost.open`).
  A held conversation that runs another model than the open asks, or says no model, opens again.
  An open asked `fresh` (`fresh-open.md`), as a context or refusal restart's is, never gets back the conversation held: an idle one is let go of and a new one opens, and one still in a turn fails the open, which opens nothing, so the home asks again once it ends.
  The home reads an open's answer as exactly one of its state, a `needsOpen` it asked for or a `notOpened` it asked for; any other answer, an empty one included, is an open whose outcome is unknown.
  An open that adopts a conversation kept there on another model or backend follows it as it lives there, and keeps no spec this Mac asked for.
  A Claude conversation that starts over on that reopen, because the computer's update describes a tool it had in other words, adds or removes a tool, or its instructions changed, is carried into its new one as an open carries it (`PlacedHost.reopened`; `docs/claude-client.md`, "The crewmate on Claude"), before its lane goes on.
  The task's timeline notes the move, and its record names the new conversation at once.
  Why, the brief and where the earlier transcript is saved on that computer are a once-named wake on the task's lane, served first on the next prompt, so a quit before that turn ends clean still delivers it (`docs/claude-client.md`).
- **The record's copy.**
  The home copies the conversation's record into `crewmates/<task>/sessions/` as model requests start and tools start or finish, and at model turn ends, coalescing live copies to at most one start per second and keeping a trailing copy when events arrive during a transfer.
  For Claude on a computer that supports record refresh (protocol 8.15 or later), the same throttled copy keeps checking while any call is open for a client transcript written after the call was announced, even if no further event arrives.
  A call that ended stays open for this check while this Mac's copy holds the call but not its result, because the client can write a result to its transcript after it reported the call finished, even after its next request started (`RecordCopy.awaitsAnyResult`).
  Each check reads the record's own transcripts at the top of its folder once, however many calls the turn has ended, and never the skills a session staged beside them.
  Pi and older computers keep event-driven copies without this repeating check.
  The loop stops once every call has ended with its result copied, at a turn's or continuation's end or session release, and while its computer is out of reach; reconnect resumes it only for refresh-capable Claude calls still open.
  A continuation's end keeps one final coalesced copy for its completed text or the tail left by a client exit, without repeating afterward.
  Live copies never hold up a step's events; a turn's end waits for any transfer already in flight before flushing its final record.
  A turn's end, reconnect and session release flush the copy without the live throttle, from where each file's copy ends; Observe and the Crewmate tab read that copy for a task on another computer.
  Where each file's copy ends is read from disk for the record's own files only: the skills each session staged under `staged/` are walked once when their session's folder first appears, then kept from what each copy writes, so a copy lists `staged/` once instead of reading every staged file (`RecordCopy`).
  One copy order names at most `SESSION_COPY_FROM_MAX` files, and the computer removes a session's staged skills once a later session stages its own, while this Mac's copy still holds them.
  So a copy whose files do not fit in one order names the record's own files and only the staged skills that came back in that copy: the computer sends whole each session's skills it still holds, and once that copy runs to its end this Mac removes the staged skills that never came back, the same way for what earlier versions staged at the record's top (INF-4240).
  A copy that fails stops the live copies until a turn's end, a reconnect or the session's release brings the record home, so a copy the computer refused is asked again once a turn, not every second.
  On protocol 8.15 or later, the first piece's copy order requests a fresh app-owned record from the live session before the computer reads it, so a Claude client's mid-turn tail does not wait for its minute tick.
  The home omits that request on older computers, which retain the cached-source behavior until updated.
  A file the computer wrote again shorter, after `delete-outside` replaced the words from outside in it, is copied whole instead: into a folder beside the copy, `crewmates/<task>/sessions.whole/`, and renamed over this Mac's file once whole, so the copy never mixes the old words with the new, while the rest of the record is copied on as usual (`RecordCopy.copyWhole`).
- **Closing.**
  When the record closes the conversation is closed there for good, at once or at that computer's next roster.

## Its working copies

A task runs in a working copy of its own on the computer that runs it, made from where its project lives with the app's own git there, and its work comes to the home over the connection, never through where the project lives.

**On the computer** (`WorkingCopies`, `src/core/helper/workingCopies.ts`, the one writer of `repos/`, `worktrees/`, `worktree-pool/`, `worktree-trash/`, `default-workspace/`, `bundles/` and `artifacts/`):

- **The clone.**
  A project is cloned here once, the first time the home gives this computer a task in it: a bare repository in `repos/`, named for its origin, that fetches only the default branch `origin` declares.
  It is made under a temporary name and takes its own only once whole, so a failed clone leaves nothing behind.
  Its git answers GitHub with this computer's own sign-in in `forges/` when it has one (above, "Running"); a GitHub refusal reads as GitHub's sign-in being needed (`forgeAuthRequired`), and git never waits on a terminal.
  The app saves no commit name in a clone, so each time it prepares a working copy it drops any `user`, `author` or `committer` name or email a task saved there (`forgetSavedNames`): every working copy reads its clone's settings, so a stand-in name one task saved with a plain `git config` would otherwise sign every later task's commits, and the batch merge would carry it to the project's main.
- **The working copy.**
  `inf:working-copy:prepare` makes the task's working copy exactly as the home makes one (`WorkspaceService`): on the branch this computer already marks as the task's, else the branch the request names (`branch`, the task record's, or the name the home chose for a new task, `docs/architecture.md`, "A task's branch"), `fm/task-<task>` without one, marked as the task's, from `origin`'s default branch fetched first, or from a warm working copy in the pool.
  Asked again it answers the working copy that is there.
  A task with no project gets one of this computer's own default workspace, started at the commit of the home's that it was sent first (below, "Seeding").
  `inf:working-copy:install` installs its dependencies as the home installs a new one's.
  A conversation opens only once its working copy is here.
- **Pushing.**
  The crewmate pushes from it in its own shell, with the app's own git there, which answers GitHub with this computer's own sign-in (`configureComputerGit`); nothing of the home's sign-in is here.
- **What it holds.**
  `inf:working-copy:status` says whether it holds edits or commits that never merged, as the home reads its own, and where the project it was cloned from lives (`origin`, null for one of this computer's own local workspace).
  Both discard and a `settle_task` done close ask this computer to inspect its working copy; a missing copy or an unreachable computer is an unknown result, never a clean copy.
  A done close records what the copy holds, saves its edits and commits as every close does, and records a copy it cannot read as unread rather than refusing; it does not merge a branch or a pull request.
- **Seeding.**
  `inf:working-copy:seed` keeps the home's default workspace, which only a task with no project works in, in this computer's own: the commit is asked for first, answered `have` when this computer holds it, else `need` with the commits it holds that the bundle may leave out, and the bundle then arrives in pieces the way an artifact does.
  Once whole and matching its digest it is fetched into `refs/infinitary/home-main` (`SEEDED_REF`), never this computer's checked-out branch, so a default workspace made here before shares no history with it and is left alone.
  What a computer seeded before the Infinitary rename, under `refs/fm3000/home-main`, still counts as the commit it holds and as merged work.
  `inf:working-copy:prepare` then names that commit as `seed`, and the working copy starts at it.
  `SEEDED_REF` counts as merged work where this computer reads what a working copy holds that never merged, so only the task's own commits are kept and brought home.
- **Its work, as a bundle.**
  `inf:working-copy:bundle` writes the task's branch or its kept commit as a git bundle in `bundles/`, leaving out the commits the home says it has, or answers that the home has that commit already; `inf:working-copy:read` reads it to the home in pieces of `PLACED_COPY_CHUNK_BYTES`.
  With `branch`, it bundles another branch of the working copy's repository in place of the task's own: one the crewmate checked out to deliver (INF-2490).
  `inf:working-copy:status` answers, with what the working copy holds, the branch it has checked out and that commit (`checkedOut`).
- **Keeping and deleting.**
  Once the task's conversation is closed for good, `inf:working-copy:keep` saves what the working copy holds that never merged - uncommitted edits, its checkout's commits and its branch's - as one commit on the task's kept ref, as the home saves its own.
  The task's branch is the one marked as the task's, or `fm/task-<task>`, wherever the checkout points, as a reviewer's checks out the version it reads.
  A keep reads the working copy each time it is asked, never from `orders.jsonl`, and a kept commit that already holds all of it is the answer again; once nothing is unmerged, a commit an earlier keep saved here is the answer, so the home takes it first.
  `inf:working-copy:retire` deletes the working copy only when the commit it names is the one kept here and holds every commit of the checkout and the branch that never merged, or, with none, when nothing is unmerged; the copy goes to the pool or the trash, and its branch, kept ref and bundles go with it.
- **An artifact.**
  `inf:working-copy:artifact` takes an artifact the home downloaded in pieces, outside the working copy, and once every byte is there and its digest matches writes it where the home writes one, with the same rules (`writeArtifact`, `src/core/workspace/artifacts.ts`): `.infinitary-artifacts/run-<run>/artifact-<id>.zip`, each folder refused when it is a link, never over a file already there.
  A computer on a contract before 8.4 writes it under `.firstmate-artifacts/`, and the home names that path to its crewmate.
  A selection of an artifact's files arrives with a `part` and is written beside the whole one at `artifact-<id>-<part>.zip` (`docs/forge.md`, "Workflow logs and artifacts"); the home sends one only to a computer taking work on its major, which includes artifact selections, since an older one would drop the `part` and write it where the whole archive goes.

**At the home** (`PlacedCopies`, `src/core/placed/placedCopies.ts`, held by `PlacedSessions` as `copies`):

- **Starting.**
  The supervisor asks for the working copy before it opens the session, records the task's branch and its working copy as present with no folder here (`DispatchInput.workspace.elsewhere`), and notes how that computer got it: "a new working copy was made on Mac mini, starting from the latest origin/main".
  The first time a computer clones a project the feed says "Mac mini cloned website with its own GitHub sign-in.", or "Mac mini cloned website." when it holds no sign-in for where the project lives.
  A task with no project first sends this Mac's default workspace there (`PlacedCopies.seed`): a bundle of only the commits that computer lacks, from this Mac's current commit, the timeline naming it, "a new working copy was made on Mac mini, starting from main (905ff75)".
  The record's repository is this Mac's default workspace, where its branch comes home and merges.
  A project without an origin runs on this Mac only; an origin's address crosses with any name or password in it taken out.
  If the approved address changes, a new turn binds the existing ordinary task's default fetch and push to the new address without moving its branch or edits.
  The separate task remote leaves the shared clone and other tasks' routes alone, so use the branch's default remote rather than the clone's original `origin`.
  A review of such a task reads the new address's default branch through that remote ("Independent reviews", "Code to read").
  An older computer must update before continuing placed project work because it cannot verify the working copy’s effective fetch and push destinations.
- **Reading its branch here.**
  Before this Mac's own git reads a placed task's branch - to open its change, to check a declared repair, to merge it, to merge it locally - the branch is brought home as a bundle of only the commits this Mac lacks, into `refs/heads/<branch>` of the task's repository here (`bringBranchHome`, called by `ChangeContext`, `ChangePublication` and `SettleService`).
  This Mac's git reads it in that repository: the project's folder now, or this Mac's default workspace for a task with no project (`bringBranchHome` answers it).
  The record names this Mac's project folder, including after this Mac's folder moved (`docs/saved-data-compatibility.md`, "The one-time move").
  The read uses the project's folder as it stands, which can have moved again since the task started.
  Out of reach, this Mac reads what it brought last.
  Another branch the crewmate checked out there to deliver (INF-2490) comes home to the task's own ref for it, `refs/infinitary/checked-out/<task>`, so a branch of the same name here never moves; `open_change` reads and, on a plain Git host, sends it from there.
  A story is prepared for the branch the working copy there has checked out, and at its commit, as one here is (`PlacedCopies.checkoutThere`).
  The home asks a computer for its checkout, or for another branch, only on the current work major; an older computer must update before sending another branch.
- **Opening, checking and merging** stay this Mac's, with its own sign-in: a crewmate there calls `open_change`, `check_change`, `show_merge_card` and `download_artifact` as one here does, and the home does each (`inf:work:open-change`, `inf:work:check-change`, `inf:work:show-merge-card`, `inf:work:download-artifact`).
  The home serves `show_merge_card` to every computer that takes work on its own major (`takesMergeCardCall`, `src/core/placed/placedSessions.ts`).
  `prepare_change` transfers its inspected media to the home through `inf:work:prepare-change`, gated by `CHANGE_PRESENTATIONS_SINCE`; the home retains the story without publishing it (`docs/forge.md`, "Saved change stories").
  A whole or selected archive is downloaded here and written into the working copy there before the tool answers, never kept in a folder here.
  A listing or a selection of its files (`list`, `files`) is asked only of a home on the same work major; the computer refuses it, sending nothing, across that boundary, since an older home would drop the fields and download the whole archive.
  A crewmate there calls `read_workflow` as one here does (`inf:work:read-workflow`), and the home reads the run through the project's own forge: with `runId` alone the short read, whose run watch wakes the crewmate there (`docs/forge.md`, "The run watch"), and with `jobId` that job's log.
- **Discarding.**
  A discard asks that computer what the working copy holds; while it is out of reach nobody can tell, so the discard asks for confirmation.
- **Closing.**
  When the record closes, the conversation there closes for good, then that computer keeps the task's unmerged work, the kept commit comes home as a bundle and is fetched into the task's kept ref here, and only then is the working copy deleted there, with this Mac's copy of the branch.
  The record's working copy is then removed, and its timeline says "working copy on Mac mini removed - its 1 commit not in yet and uncommitted edits saved here first".
  While that computer is out of reach the working copy waits there, and the next time it is back each closed task's working copy goes the same way; a step that fails is tried again then.
  Every placed task's work is kept, an answer task's included.

**Leftovers** (`PlacedCopies.retireLeftover`).
A computer can hold a working copy and a task folder for a task this Mac no longer records there: a fresh start that failed after that computer made the working copy, a purge, or a task set to run elsewhere after a start there failed and before it ran.
What it left goes by the rule this Mac's own leftover working copies follow (`docs/task-record.md`, fleet hygiene), except the copy a move off that computer left while it was out of reach, which is kept until the task moves back there or closes (below, "Moving a task off a computer that is out of reach"):

- **When.**
  Each time the home reads that computer's roster - it comes back in reach, or this Mac starts - and, while it is in reach, as soon as a record goes here (a start that failed, a purge), so nothing waits for the next contact.
- **In order.**
  Its conversation there is closed for good.
  What its working copy holds that never merged is kept there as one commit, comes home as a bundle and is fetched onto the task's kept ref, `refs/infinitary/kept/<task>`, in the project here whose origin the copy was cloned from, or this Mac's own local workspace for one of that computer's own.
  A computer not yet updated past the Infinitary rename keeps it under `refs/fm3000/kept/<task>`, and the home takes the bundle's kept ref under either name.
  Only then is the working copy deleted there, and then the task's folder under `tasks/` (`inf:session:remove`), which the computer removes only once the conversation is closed and the working copy is gone.
  A working copy with nothing unmerged goes at once.
- **When its work has nowhere to go here,** it stays there: no project here was cloned from where it came from, the task is one this Mac records elsewhere, whose own work owns its kept ref here, or the kept ref here already holds other work, which is never written over.
  The feed says so once each time this Mac starts, naming the copy by its task's saved branch, or by the branch it has checked out there when this Mac no longer records the task: "Mac mini keeps a leftover working copy, because its work could not be saved on this computer first: inf/blue-footer-a1b2."
  The next time that computer is back the rule runs again, so a project added here again takes its work.
- **This Mac's copy of the branch** goes by boot hygiene's rule: a task branch here no live task explains, marked as a task's or named `fm/task-*`, is deleted with its work saved on its kept ref first (`docs/task-record.md`, fleet hygiene).

### Workflow recordings in task evidence

An exact `download_artifact` file request uses the home's existing forge sign-in, never a credential sent to the computer running work.
The home streams and verifies the selected member into its task temporary folder, then sends bounded `inf:session:source-file` pieces with `evidence: true` through `PlacedCopies.writeEvidenceFile`.
`PlacedTasks` publishes the file in its task evidence folder only after the size and SHA-256 match; interrupted pieces remain temporary, corrupt pieces are removed, and existing evidence is never replaced.
The home removes its staging copy after the transfer attempt.
The ordinary source-card and hand-over destinations are unchanged.

## Runs on

A project's Runs on says where its next task starts: Automatic, this computer, or a computer that runs work (design skill `components/devices/RunsOn`).
An explicit computer stays the captain's choice; Automatic chooses separately for each new task and never moves started work.

- **The setting.**
  `repos.runs_on` (migration 64) holds the computer's device id, or null for this Mac, written only by `RepoRegistry.setRunsOn`, and `RepoView.runsOn` carries it.
  `inf:devices:runs-on` sets it to `automatic`, this computer (`null`), or a listed device that may run work (`mac` or `work`).
  The personal workspace and a project with no origin run only here (`runsHereOnly`), since no other computer could clone them.
- **In Settings and by talking.**
  Settings -> Projects draws Runs on in the Tasks group of the repository's settings on its project's page, for an eligible project or once a computer that runs work is on the list, with one select: Automatic, This computer, then "Your computers", then "As another user", each naming why it cannot take work now ("out of reach", "connecting" while its connection is being made, "no sign-ins yet").
  A task on a computer whose connection is being made reads "connecting" in the Tasks panel and the task footer, with its mark as it was, not warn (`TaskPlace.reach` is `connecting`).
  A project that runs only here shows "This computer" as text with its reason, and a project that runs elsewhere says so on its line in the list, "runs on Mac mini" or "runs as Builder".
  The first mate sets the same row with `app_change` `project-runs-on`, a line offered only where this build offers devices.
  The feed says "website runs on Mac mini now.
  Its next task starts there; the one running here finishes here." or "website runs on this computer now.
  Its next task starts here."
  (`repo_runs_on`).
- **Where a task runs.**
  A task takes its project's Runs on the first time the supervisor tries to start it, unless it has its own (below, "A task's own Runs on"), and `task_execution.device_id` keeps it, so a task already started finishes where it started.
  A task that has not started follows its project when the project moves, unless it has its own.
  An independent review follows the computer its builder actually runs on, regardless of later changes to the project's Runs on (below, "Independent reviews").
- **Waiting.**
  A task whose computer is out of reach, or back and not yet caught up, waits as queued work, and a task commissioned then is queued the same way; it never runs on this Mac instead.
  The ready sweep looks at it on every tick, and starts it once that computer is ready; a computer coming back caught up sweeps at once (`placedCaughtUp`).
  A start that loses a computer it needs before its crewmate's first turn - the one it runs on, or the one its brief reads a source task's live work from - is not a failure (`lostComputer`, `src/core/orchestrator/lostStarts.ts`).
  A loss is the connection's typed refusal, `DeviceOutOfReachError`: a computer out of reach before an order is sent, including the conversation's opening and a source read, or a connection that went mid-request, which names that computer where the start knows it; a refusal the computer answered is a failure as before.
  This Mac ends the start, the task goes back in line, keeping its working copy there and its computer choice, and its record says at which step and for which computer ("returned to the queue - Mac mini went out of reach while its brief and starting work were being sent; it starts again once Mac mini is back").
  Its next start waits for that computer to be ready, so a sweep while it is away spends nothing, and the minute's sweep, or that computer coming back caught up, starts it.
  It waits only while it still needs that computer: once its Runs on moves elsewhere, or its brief no longer reads that source's work there (its basis or replacement link changed, or the source closed or moved; `CrewBrief.liveSources`), it starts where it now would, and that loss no longer counts toward a second.
  A Start the captain gave past a wait for the model they asked for stays past it when the start tries again.
  The retry asks that computer for the working copy it already made and opens the conversation it already holds, so nothing there is made twice, and the brief reaches the crewmate only from a start that finished.
  A start Automatic placed whose working copy went unconfirmed keeps its order and checks it again as before (below, "Automatic starts"), and a typed loss there counts as one all the same; an unconfirmed reply in between keeps the loss already counted.
  A task the first mate or the captain started from the backlog keeps that go, whenever its computer comes back, and is a started backlog task again once it starts; neither the loss nor the recovery wakes the first mate.
  The same start losing the same computer again at the same step is Could not start, naming the step, and the first mate hears it once (`queued-start-failed`); an Automatic start keeps its order for the Start that tries again; a start that finishes, or fails for another reason, forgets the step.
  The feed says "api's next task waits for Mac mini.
  It never runs on this computer instead." once, a day later "Mac mini has been out of reach for a day. api's next task still waits." and "To run it here instead, set api to run on this computer.", and "api's next task started on Mac mini." when it starts.
  A computer connected on an older Infinitary that takes no new work (`Computers.takesNoWorkUntilUpdated`) is not out of reach: the wait says "api's next task waits for Mac mini.
  It takes no new work until it is updated.", a day later "Mac mini has taken no new work for a day. api's next task still waits." and "To run it here instead, set api to run on this computer.", and Start now answers that the computer takes no new work until it is updated.
  The start of that wait updates the computer by itself when nothing tried it for that gap yet, and otherwise raises its Update card again, even after Not now (`DeviceUpdateNudge.refresh`, forced; `docs/devices.md`, "Updating by itself"); the wait itself updates nothing.
  Each is said once per wait, held in memory, so a wait still standing after this Mac restarts is said once more.
  Start now answers that the task waits for that computer.
  A task whose computer serves nothing now but a sign-in a cut-off withholds there waits the same way for that sign-in (below, "Its own sign-ins"): "api's next task waits for Mac mini's own Claude sign-in." once when the sign-in is lost or refused, and "api's next task waits for Mac mini's Claude plan's allowance, which resets 1:10pm." once when the allowance is spent, with no day's line either way, and "api's next task started on Mac mini." once that sign-in serves again; Start now answers with the same distinction.
  A task whose computer has no sign-in at all waits the same way, as queued work with no gate: "Mac mini has no sign-ins yet. api's next task waits until it has one." once, nothing tried there, Start now refusing with the same words, and the task started by itself the moment that computer reports a sign-in (`TaskPlacement.deviceSignInsChanged`), with "api's next task started on Mac mini."
  (`docs/devices.md`, "Finishing its setup").
  A task for a project that lives on GitHub, GitHub Enterprise or GitLab, whose computer offers that host's sign-in from here and holds none, waits behind that sign-in's gate (`forge-sign-in:<host>@<device>`), with "api's next task waits for Mac mini's own GitHub sign-in." once and the host's GitHub card for that computer unless its setup card already asks; the gate lifts, and the task starts, the moment that computer reports the sign-in (`docs/forge.md`, "A computer's own sign-in").
  A quit lifts no more of these gates (`TaskPlacement.resumeDeviceForgeSignInTasks`), so a task it reaches before its gate lifts keeps waiting until that computer next reports the sign-in.
  A project whose computer was removed from the list keeps waiting, as "The other computer", until it is set to run elsewhere.
- **A card from there.**
  A crewmate card's head names where its task runs right after its meta line, the task's title, as "Fix the footer · on Mac mini" (`Card.place`, migration 67).
  The place rides as its own field, never inside the meta text, so a long title gives way and the place reads whole.
  A merge card's fact strip names no computer: the card's top line already says where its author's session runs (INF-3709's plan).
- **The Tasks row, the summary and the status.**
  A task another computer runs carries where on the board, in words (`TaskView.place`, `TaskPlacement.taskPlace`): where it started, or where it would start now, and `reach` (`in-reach`, `connecting`, `reconnecting` or `out-of-reach`) while open or underway work's computer is not in reach.
  A computer that is connected while the home is not yet caught up with the task - its roster not yet read after either side restarted, the task's conversation still opening here, or events there the home has not taken in - is in reach, and the place carries since when it has been catching up (`place.catchingUpSince`, `PlacedSessions.catchingUpSince`): from the contact that brought the computer back, or from when the conversation began opening here, whichever is later.
  Its Tasks row names neither its project nor the place (`rowTrailing`); it ends only with why its computer cannot take work now: "out of reach" in `--warn`, "connecting" in `--fg-3` with no warn mark while its connection is being made (`place.reach`: `connecting`, or anything but `in-reach` for out of reach), "catching up" in `--fg-3` with no warn mark while it catches up, or "takes no new work" while the computer is connected on an older Infinitary (`place.noNewWork`).
  Those words take only their own width and a long title never cuts them; the row's accessible label still names the project and the place.
  Since when it has been catching up is the status's reason below, which the row's summary shows: the rail has no room for a time beside a title.
  The shared status (`taskStatusOf`) draws the mark of open, working and idle work in `--warn` with the reason "Mac mini is out of reach" ("Mac mini takes no new work" for a computer on an older Infinitary; "Mac mini is connecting", with the mark as it was, while its connection is being made; "Catching up with Mac mini since 12:57 PM", with the mark as it was, while it catches up), unless a blocker, a hold or its parts give the reason, so the crew summary, the record's pill and a task board tile say it too; an interruption, a start and a ready decision keep their own.
  The crew summary's Project row reads "website · on Mac mini", and the record names the computer in Details (below, "A task's own Runs on").
  A computer going out of reach, coming back or catching up writes no record, so the placed sessions say so (`reachMoved`) and the board is published again at once (`TaskProtocol.refreshPresentation`); so does a change of its connection, out of reach to connecting and back (`devicesChanged` calls `scheduleWorkPresentation`).
  The connecting limit is read when reach is read, and the host clock publishes the board again once that read has moved.

## Independent reviews

An independent review runs on the same computer as its builder, in a separate working copy at the assigned builder commit.
The captain's choice to put the work on another computer applies to its review too: review load and the builder's evidence stay there.
The home still coordinates the task record and merge; it does not execute the review locally as a fallback.
This placement applies in every build, without a development gate.

- **The computer is the builder's.**
  `TaskIntake.commissionReview` copies the builder's recorded placement, not the project's current setting.
  Routing prefers another provider among that computer's subscriptions, never among the home's when the builder is elsewhere.
  With no suitable subscription there, the review cannot start; it never borrows a home subscription.
  A separate placement request for a review is refused because its builder owns the choice.
- **Code to read.**
  `reviewFacts` asks the builder's computer for its committed head, complete changed-file list and change reading (`inf:working-copy:revision`).
  The reading is optional: a computer on an older contract omits it, and a pass from that computer does not carry.
  The list, the reading and the counted lines are measured from the default branch the clone's `origin` names, except for a task whose own remote names another address, as one that followed its project to a new address does (`WorkspaceService.routedReviewBase`).
  That task's computer fetches the new address's declared default branch into the task remote's own tracking ref, never `origin`'s, and answers its full ref as `base`; the brief names that ref in place of the default branch, so the reviewer's own diff reads the same base.
  The clone's `origin` and every other task's remote stay as they were.
  An unreadable address falls back to the default branch that computer last fetched from it; with none, the read refuses rather than measuring against the former project.
  A computer on an older contract names no `base` and measures from `origin`'s default branch.
  An open pull request does not replace that head: the review reads the builder's committed version, which must exist on that computer.
  An unavailable computer or missing commit refuses the review rather than using an older home copy.
  The branch does not need to be pushed or brought home for review.
- **A separate working copy.**
  `inf:working-copy:prepare` accepts a generic `base`: a source task, exact commit and optional previously assigned commit.
  `WorkingCopies` uses that source's repository without cloning or fetching, and `WorkspaceService.createTaskWorktree` makes a separate task branch and checkout at that commit.
  The builder's working folder and uncommitted edits remain untouched.
  The answer acknowledges the exact head; an older computer that ignores the base cannot silently provide a default-branch review.
  The same exact-commit preparation applies to a home builder's review.
- **Evidence and re-reviews.**
  The brief names the builder's evidence folder on the computer both crewmates use.
  A new review turn reads the builder's latest target and refreshes the reviewer's clean working copy before delivering the new assignment.
  Edits or commits beyond its previously assigned base refuse the refresh, never disappear.
  Mid-turn guidance waits for the next turn so no checkout changes under a running review; the computer also refuses a base change while its conversation is running.
  The review task records its assigned commit in `delivery.headSha`; a verdict uses that assignment, never a newer builder head that arrived while it was reading.
  A review from an older version with no assigned commit cannot pass until a new turn records one.
  An already-running home review of a placed builder is not moved live: end that review and commission a new one on the builder's computer.
  Missing evidence is still a finding, not permission to run the builder's tests (`docs/delivery-rigor.md`, "The reviewed sequence").
- **A return that loses the builder's computer.**
  A builder's report goes back to its open review once the host has read the builder's version there (`Reviews.returnToReview`).
  When that read loses the builder's computer (`lostComputer`, as a start does above, "Waiting"), the report is not handed to the first mate: the builder's record says "Mac mini went out of reach while the fix was read for its reviewer; it goes to the reviewer once Mac mini is back", and the report waits (`Reviews.waitForLostReturn`).
  The ready sweep, on every tick and when that computer comes back caught up, tries it again once the computer is ready, and goes the way the report would have gone, whole (`Reviews.resumeLostReturns`); a sweep while it is away reads nothing.
  A builder that no longer runs there is tried at once where it now runs, a closed builder's wait ends with no retry, and a newer return that reaches the reviewer replaces the waiting one.
  Lost again on that retry, the first mate hears once that the host could not return the fix, naming the computer and the point; the wait is held in memory, so a restart of this Mac forgets it.
- **Lifetime.**
  Reviews use the existing placed conversation and working-copy lifecycle: resume stays there, disconnection holds delivery there, and task close retires its separate copy without touching the builder's.

## Automatic starts

`AutomaticPlacement` is the start-time owner beside the existing supervisor; there is no separate dispatch system.
An eligible project has a cloneable origin and is not the personal workspace.
New eligible projects default to `runs_on = automatic`; the additive migration changes every existing eligible project, preserving task overrides and every started task's recorded computer.
The project select and `project-runs-on` accept `automatic`; `update_task runs_on` and `runs_on_ask` accept the same value for an unstarted task in an eligible project.
Explicit task and parent choices, reviews following builders, origin-less projects and the personal workspace retain their existing owner.
For an uncommitted start already using Automatic, the direct basis named by `TaskService.graph.basisOf` contributes locality only when its answer holds and its `startedAt` records actual execution.
Without such a basis, a follow-up's first origin (`TaskService.graph.discoveredOrigins`, the task it was filed from) contributes locality the same way once it started, so a follow-up starts beside the work it came from.
An unstarted answer with an empty device field is not execution at home, and missing or unresolved bases add no preference or wait.
After asynchronous compatibility and resource reads, the synchronous `commitPlacement` callback resolves that current relationship and reads its current `deviceId`, including a committed move but not a planned destination.
Among fully admitted candidates at the best existing model preference, that account-specific computer wins before spare-room ranking; unavailable, incompatible, unreadable, stale, model-less or full candidates fall back to ordinary placement or its existing wait.
A stronger model preference elsewhere remains authoritative even while that computer is busy.
The new task's own project and requirements decide compatibility, including for a basis in another project; no ancestors, related tasks or physical-computer groups supply locality.
When locality changes the ordinary winner, the snapshot's optional `basis` records the task id, key and execution computer, and the existing computer-choice sentence and Activity line explain it.
Older snapshots keep their original explanation without invented provenance, and eligible alternatives are not falsely described as having less room when locality won.
The preference never writes `runs_on_ask`, extends Automatic to project-free work, changes explicit choices or review placement, copies files, or moves started work.
A task's first committed computer wins over every later project edit, including a committed home selection represented by null.
If routing names no model for the home, it can still qualify when its local runtime serves a default model of its own.
It ranks after every computer whose routing names a model, and it needs room like any other.
Chosen, it takes that existing unrouted home start without a commitment, since a commitment names its model, so it reserves no pending demand.
A computer that runs work still needs a model its own sign-ins serve.
A task whose model the captain named (`override_model_id`, rule R0) runs only on a computer whose routing serves that model (`RoutePreview.named`): every other computer is refused for its model, so neither the ordinary rules nor the decision model starts it on another model.
When no computer whose models were read serves it, the task waits with words naming the model (`placementNamedModelWait`) and the first mate hears it once (`named-model-wait`) and asks the captain whether to keep waiting or name another model, with `update_task override_model_id`.
The computer Automatic already chose waits the same way when it stops serving the model before the crewmate opens, and its Activity line names the model.
It keeps its commitment and reservation, since a committed task never moves to another computer and its preparation may already be under way.
Every other start waits too: a task on This computer or a named computer whose routing does not serve the named model waits with the same words and wake (`routesNamed`), and never falls back to another model; Activity says that wait once, however often the ready sweep tries again.
On this computer, a start routing placed on no model opens on the account-less runtime, so a named model that runtime serves, such as a models.json provider's, counts as served and the session opens on it (`TaskPlacement.accountlessNamed`).
A review, which runs on its builder's computer and has no queue to wait in, carries the named model as its pin, and when that computer does not serve it nothing starts and the spawn tells the first mate to ask the captain.

`placementRequirements` on project configuration and `placement_requirements` on a task declare systems, execution architectures, exact executable names and an admission profile.
The resolver intersects project and task platforms, combines tools and adds Git for a working copy, and never lets a task reduce project demand.
Undeclared platforms conservatively inherit the home system and architecture; nobody infers portability or programs from the brief's words.
A Windows home's own system is one a project cannot declare, so its tasks inherit it and run on it or on another Windows PC that runs its work (`docs/windows.md`, "Automatic on a Windows home").
The resolver marks each platform field it filled that way (`inherited`), and the start's snapshot keeps the mark and what each computer said it runs.

`inf:computer:placement` collects fresh compatibility separately from resource sampling: execution system/architecture, executable identities, read-only access to the exact credential-stripped project origin, and that computer's actual served model list.
Its facts expire after ten seconds, include request travel, and invalidate on every connection transition; a timeout or missing fact is unknown, never spare capacity.
Every computer reads each fact side by side and answers with what it has when its limit ends the read: a check still waiting, such as the project's host answering slowly, reads unknown on its own, and the facts already read still count.
This computer's limit is Automatic's five seconds; a computer that runs work ends its read a second sooner (`PLACEMENT_FACTS_ANSWER_MS`), since the home's five seconds run from before the ask leaves and cover its way there and the answer's way back, and sign-ins it has not listed by then read as unknown.
A computer's identity names the system whose CPU and memory its readings measure, the same for every user of it, never a username, pairing id, address or display name.
A Mac's is its hashed platform UUID, and a Linux computer's its hashed hardware UUID from DMI, which its containers share too.
Where only root may read that UUID, a Linux computer's is its hashed machine id, which every user of it reads; the app never runs as root.
A Windows PC's is its hashed `MachineGuid`, which Windows writes at install and every account on it reads without an administrator.
A virtual machine is a computer of its own: its readings measure what its host gave it, and every user inside it reads its identity, so a home in a virtual machine or on a hosted runner qualifies like any other.
Two virtual machines on one host count separately, as their own readings do.
An unreadable identity, such as a container that may not read DMI and has no machine id, excludes the computer from Automatic.
Explicit selections still work.
The home follows the same identity and resource rules as every other user or computer.
`actualComputerPool` restricts `Router.preview` to actual served models and carries the account serving the selected model; a generic provider sign-in never expands into the home's model catalog.
Its routing catalog names a provider by its allowance id (`claude`, `codex`, `grok`), so it is matched to the served list through `servedModelKey` (`src/shared/quota.ts`), the one comparison between the two names.
A project-access failure remains unknown; a generic forge sign-in cannot prove access to this project.

Placement renews demand on the existing `ComputerResourceFeed`, shared with screens and permitted panels; it creates no sampler or second timer.
A start awaits the shared in-flight resource round through `readCurrent`, so an initially empty cache cannot repeatedly miss the ready sweep.
`TaskService.placement.commitPlacement` evaluates all durable pending commitments and writes the choice and stable preparation order in one transaction before asynchronous preparation.
Commitment records one bounded historical snapshot with the chosen computer, model, demand, candidate reading ages, pending capacity and typed rejection reasons.
`preparationStarted` is written before work begins; a closed unsent commitment can be released without guessing.
A missing preparation reply keeps the reservation and computer across retries and restarts, and reconciles the same preparation order.
The helper journals `preparation-unknown` before starting preparation; it returns `preparation-failed` only when its first attempt has demonstrably ended.
A failed replay after restart keeps the same order uncertain rather than treating a second failure as proof that the first attempt ended.
A proven failed attempt may reserve a new order on the same computer, never choose another computer.
Otherwise the task owner releases pending demand only after proven failed or completed preparation, cleanup, or a sample begun after running was witnessed again.
`AutomaticPlacement` takes that witness just before the shared feed asks for every reading (`ComputerResourceFeed.onSample`), as well as while it compares computers.
A witness at the same moment a sample begins counts for that sample, and a sample's start is the receiver's own record of when it asked for that reading (`ComputerResourceFeed.sampledAt`), never rebuilt from the reading's age and a second clock read.
So the first start after a quiet spell frees the room of tasks already running and measured, rather than counting it beside their measured use.
After restart or reconnect the running witness must be obtained again; historical readings never release demand.
An observation containing running work is not charged that task's pending allowance again.

### Which computer a new task starts on

When two or more computers can run a new Automatic task and the `computer` decision use is on (`docs/decision-models.md`, "The uses"), Automatic asks the decision model where it starts before the ordinary rules choose (`src/core/placed/computerChoice.ts`).
The computers it may name are those a dry run of the comparison admits but for room or a better model elsewhere, and those out of reach whose last system the task allows; a computer that does not serve the model the captain named is never one of them.
The question reads the task's title, goal, what it delivers and its kind, the standing directions that apply to its project, everywhere ones included (`StandingDirections.applying`), each whole or left out and counted, and one line per computer: whether it is this computer, its room, the best model it serves for the task and whether the work this task continues ran there.
It asks two questions in one call: which computer the task belongs on, or usual when no standing direction says which computer runs that kind of task, and, only when some computer cannot start it now, what the directions say for that case: keep it there, wait for it, or use another computer.
Usual is an answer of its own because a decision model that never sees the abstention would otherwise still name a computer, and the questions are split because a native decision model judging both at once leaned to whichever computer had room.
A computer with room starts the task; one that is busy starts it anyway on keep or waits on wait, one out of reach waits on either, and another computer is left to the ordinary rules.
A task whose own title or goal needs one computer, such as its files, settings or logs, or "on this MacBook", belongs on that computer whatever the directions say about its kind of work, and is kept there while it is busy or out of reach.
The answer is kept per task for the set of computers in reach it was asked about, so a later comparison asks again only when that set changes.
`evaluatePlacement` takes the pick and keeps every hard fact: a named computer, a computer that cannot run the task or lacks its model, reach and fresh room for a wait.
A start pick on a computer refused only for room or a better model elsewhere chooses it (`pickable`); a wait pick waits while that computer is busy or out of reach and starts there once it has room.
Usual, unsure, a failed or bounded-out answer, the use switched off, or a pick that no longer fits leaves the ordinary rules to choose.
A start the model chose records `picked` on the snapshot, with the answering model, and Details and Activity say the decision model picked it, reading the standing directions; a wait says so in its words.

Ordinary capacity waits are Activity lines, not cards or captain gates.
A wait names the check that refused it (`placementWait`).
It names the model when a computer that could otherwise take the task was refused only for its model and none waits only for room, and names the model the captain named when no computer whose models were read serves it.
Otherwise, when some computer was refused only for room, it names what that computer was short of: its own spare processing capacity, its own spare memory, or only the room set aside for other tasks that are starting (`PLACEMENT_HELD_WAIT`), read from its capacity before pending starts are taken off.
Otherwise it names each computer's own reasons, in the words of the "Compared computers at start" lines.
Each comparison's readings can change those words, so each wait also has a kind (`PlacementWaitKind`): a model, room on a computer, or another reason.
Room covers spare processing capacity, spare memory, room set aside for other starts and a wait not yet compared, since under load one quarter-second processor reading to the next can trade them.
Start now's answer and Task Details' Computer choice row carry the latest words.
Activity says a wait once and again only when its kind changes, since every line about a task is a row in its Activity; the record's Now line keeps the words of the line that said that kind.
Before the computers have been compared, it waits for a compatible computer with room (`PLACEMENT_WAIT`).
The latest wait is stored on the record (`placement_wait`), so a restart keeps those words for Details and Start now, and Activity does not say the line again.
A comparison never chooses for a task that changed while the computers were compared (`stillCurrent`); one whose model or basis changed is compared again at once on its record as it now stands, never told to wait for room (INF-83).
One set to run elsewhere meanwhile starts where it now runs, also never told to wait for room (INF-409).
A premium ask or escalation rung that no computer serves at its tier is held as a This computer task is: `AutomaticPlacement.choose` returns the held route (`floorHold`), and the crew's starts gate the task on that tier's quota reset and wake the first mate once (`CrewStarts.holdForReasoning`), which may start it lower with `update_task start_now`.
That gate's own check reads the home's quota only, while another computer may serve the tier first, so the gate sweep asks such a task's choice again on every pass (`heldOnItsLevel`); it starts wherever a computer serves its tier, and a repeated hold wakes nobody.
A wait for a system no computer runs is told to the first mate at once (INF-720).
When every computer's system is known and none runs a system the task requires, `AutomaticPlacement.choose` carries that on its wait as `unserved` (`unservedSystems`): this computer's, and each paired computer's that runs work, by a fresh reading, or by what it last said it runs while out of reach.
The supervisor then wakes the first mate with `system-wait`, naming each computer's system, once per task and required system, though every sweep compares the computers again.
No room or reading ends such a wait; a computer that runs the system, paired and in reach, or a change to what the task requires (`update_task placement_requirements`), does.
A paired computer that runs it, in reach or not, or one that never said its system, keeps the wait an ordinary one, and the task's own wait words are the same either way.
An added computer left out for a reason only a change ends is told to the first mate once (INF-1456), whichever computer took the task.
`leftOutComputers` reads each comparison for a paired computer refused for a system or chip filled from this computer's own, a required program it does not have, or no access to the project there; one refused for a system or chip the project or task declared is the declaration working, and says nothing.
For an inherited system or chip it carries the project's requirements with that field declared to include the computer, everything else as the project has it (`widened`), such as both chips for an Intel Mac mini beside an Apple-silicon home.
The supervisor wakes the first mate with `computer-left-out`, once per project, computer and set of reasons, with no task as its once-name's owner, so the project's next task neither repeats it nor loses it when its first task closes.
The wake asks the first mate to ask the captain once through the app's exact-change card for `app_change project-settings` with that change, never to apply it on its own judgment; a missing program or project access names what lets the computer in.
After Apply change, Runs on stays Automatic, a started task stays where it is, and the project's next tasks compare that computer equally.
Task Details show the chosen computer and a brief reason, or a waiting task's wait words; the native “Compared computers at start” disclosure opens the past-tense candidate explanations by keyboard or pointer.
A computer refused for an inherited system or chip reads what it runs and what the task was held to, such as "Mac mini: Intel, while this task was held to Apple silicon, inherited from this computer."
Settings, Devices names each computer's chip on its row, from what it said at pairing (`chipWords`, `src/shared/deviceNames.ts`).
`TaskDetail.placement` carries the bounded snapshot.
`v_placements_v1` exposes the historical snapshot, omitting the private preparation origin, through the existing declared, granted, read-only SQL surface and follows the task row's retention.
Live resource refreshes still write no task, database or panel-store history.
No live migration, automatic sign-ins, enforcement, GPU admission or continuous history is introduced.

## A task's own Runs on

The captain can tell the first mate where one task runs, apart from its project's Runs on (FI3-1344's plan, direction A).
The first mate sets it only from the captain's words, never by judging, and only before the task starts.

- **The setting.**
  `WorkShape.runs_on_ask` holds a computer that runs work by its device id, or `this-mac` (`RUNS_ON_THIS_MAC`); absent, the task follows its parent's, else its project's.
  The first mate passes it as `spawn_crewmate`'s `shape.runs_on_ask`, or as `update_task`'s `runs_on` on a filed task, where `project` clears it.
  Both accept a full computer name as well as an ID; the host matches names case-insensitively, refuses duplicate names with their IDs, and stores the resolved ID before writing the task.
  Project placement through `app_change project-runs-on` and a `project-setup` proposal resolve names the same way, including computers out of reach; no partial-name guessing or fallback changes where work runs.
  `TaskService.updateFields` writes it, one timeline line and feed line ("updated: Runs on: Mac mini (This task)"), and `recordShape` writes only the host's stamp onto the record as it stands, so an edit made while a queued task is classified is never lost.
- **Which wins.**
  A task's own Runs on wins; without one, a part takes its nearest parent's; without either, its project's (`TaskPlacement.ownRunsOn`, `runsOnFor`).
  It works in both directions: a task can run on Mac mini while its project runs here, or stay here while its project runs on Mac mini.
  The personal workspace and a project kept on this Mac only always run here, and have none.
  A review has no independent choice: it follows the computer its builder actually uses.
  A task with no project runs here unless the captain asks, and has no project to follow: it runs on a computer only by its own Runs on, or its parent's.
  Work the first mate declares on a project's folder itself runs here, where the folder is, and has none (`docs/task-record.md`, "A folder a merge left behind").
- **What each side is told** (INF-567).
  Once a computer that runs work is on the list, the first mate's context names, for each project, the computer keeping its folder (`folder_on`, always this computer) and where its tasks start (`tasks_run_on`: a computer's name, Automatic, or this computer) (`TaskPlacement.projectPlaces`).
  Every crewmate, here or on a computer that runs work, reads one paragraph naming this computer, which keeps the record and every project's folder, each computer that runs work, and the one its task runs on (`crewmateComputersNote`, INF-992); a computer that is another user on this Mac is named by that user.
  The paragraph says a file, folder, program or action on another computer goes to the first mate through a report that needs it, naming the computer, what is needed and where the result is needed, and that a handed file's content is never printed, quoted or pasted.
  Until such a file reaches it, the crewmate says plainly it could not open it and never answers as if it had; a picture the captain's words name by its path on another computer is the example it is given (INF-2422).
  The first mate's crew lines carry each task's computer (`runs_on`), and its context carries the `computers` rule (`COMPUTERS_RULE`): it coordinates such a report itself rather than relaying it to the captain, starting a task on that computer or one that finds the files and hands them on.
- **Kept until it starts.**
  An edit, or a move under another parent or into another project, re-points the task and each part of it that has not started (`runsOnChanged`), and a project that moves re-points only its tasks that have none of their own (`projectMoved`).
  A move made while a queued task's start waits on a computer - reading its sign-ins or the models it serves, or Automatic comparing computers - starts that start over from the record (`TaskPlacement.startPlace`, INF-409).
  The task then starts where it now runs, routed among that place's own subscriptions, and is never routed or held for the computer it left.
  Whatever Automatic chose, a computer or this Mac, still counts as Automatic, so its own choice never starts it over.
  From that check to the claim nothing waits, and once claimed the task has started, so a move is refused.
  A started task stays where it started unless the captain moves it (below, "Moving a started task").
  Start again and a stronger-model retry carry the ask to the new task, as they carry `autonomy_ask` (`workShape`).
- **Refusals, in plain words.**
  `TaskPlacement.runsOnRefusal` refuses a started task ("has started, so it finishes where it started, on Mac mini."), the personal workspace, a project kept on this Mac only, a review, and a device id that is not a computer that runs work on the list; `update_task` then changes nothing, and `spawn_crewmate` starts nothing ("Nothing was spawned.").
  A move to another project or under another parent in the same `update_task` lands first, in the same transaction, so the ask is judged, and its words written, where the task lands.
- **A task with no project** (FI3-1496's plan, direction A) starts on the computer the captain named, in a working copy of this Mac's default workspace sent there first (above, "Its working copies").
  Merging its change brings the branch home and merges it into this Mac's default workspace, as a task here merges, so the next task with no project, on either computer, starts from that merge.
  A computer that speaks an older contract than `PLACED_SEED_SINCE` (3.1) takes none: the task waits as queued work, the feed says once "Mac mini needs an update to run "Find why the disk is full".
  Update it in Settings → Devices.", Start now refuses with the same cause, and it starts by itself once that computer is updated.
  Files the crewmate writes outside its working copy stay on that computer.
- **Waiting.**
  A task whose own Runs on, or its parent's, names a computer out of reach waits as a project's task does, and the feed names the task by its quoted title (`waitSubject`).
  It says `"Fix the footer" waits for Mac mini. It never runs on this computer instead.` once, a day later `Mac mini has been out of reach for a day. "Fix the footer" still waits.` and `To run it here instead, ask Firstmate to run "Fix the footer" on this computer.`, and `"Fix the footer" started on Mac mini.` when it starts.
  Removing that computer forgets each task's own Runs on that names it, as each project's moves home, so the task follows its parent's or its project's (`TaskService.placement.forgetRunsOn`, called from `stopTasksOn`).
- **Where the captain sees it.**
  The task record's Details has a read-only Runs on row once a computer that runs work is on the list (for a task with no project, only once it or its parent has its own) (`TaskDetail.runsOn`, `TaskPlacement.runsOnFact`): where it started, or where it would start now, then its source, "This task", "Parent task" or "Project setting" (design skill `components/cards/TaskRecord`).
  A card from the task names where it runs as before ("Fix the footer · on Mac mini").

## Moving a started task

The captain can move a started task to another computer that runs work, or to this computer, and it keeps its key, branch, files and record (INF-1713's plan, which the captain narrowed to moving only).
It moves only when the captain asks: the record's Move to a computer, the `task.move-computer` command that presses it, or the first mate's `move_task` on the captain's words.
Nothing moves work on its own, to balance load or to fail over.

- **What may move.**
  Started work with a working copy of its own moves; the personal workspace, work in a project's own folder and an independent review do not (`TaskMoves.moveRefusal`).
  A computer that runs work takes a move only when it takes work on the home's contract major (`PlacedSessions.takesMoves`); an older one is named with "Update it first."
  A destination must be in reach and must serve the task's own model through a signed-in account of its own (`destinationRefusal`); the task changes model on the way only when its model left every level, as the conversation it opens there routes again (`docs/routing.md`, "A model that left every level").
  It must also be able to run the task, read as a start reads it: the system and chip the project or task names, the programs it needs, and, for a project that lives on a forge, its own sign-in there, read from the sign-ins it lists rather than from whether it can reach the project, which a public project answers without one (`AutomaticPlacement.moveRefusal`); a move back to this computer reads this computer's own list the same way, so a sign-in that needs renewing counts as none, and a list that cannot be read, or a sign-in in unknown health because its file is unreadable or its health is not read yet, is named as unread.
  A refusal says which, such as "Mac mini is not signed in to github.com, where meter lives."
  A project kept on this computer only, or cloned from a folder of this computer, moves too: it has no address the destination can clone, so its commits cross in a bundle of the whole branch into an empty project there (`local`, `WorkingCopies.localProject`), which then starts on this computer's branch at the commit the task's branch left it at (`base`), so the copy there is read and removed as a clone's is.
  The record offers Move to a computer only while the task may move and another computer is on the list (`TaskView.movable`), and its picker lists every other computer, with why one cannot take the task now (`inf:task:move-options`).
- **A safe pause.**
  The ask is kept on the record as `WorkShape.computer_move` (`ComputerMove`) in phase `waiting`, so a quit finds it.
  The task moves once its crewmate's turn ends, the commands it started finish, its merge is settled, its independent review finishes, its browser is closed and both computers are in reach (`pauseBlockers`; a move off a computer out of reach waits for less, below); no turn is cut short, and no live page, or one in the captain's hands, moves or closes.
  No new turn starts meanwhile: the lane is held (`laneHeld`), and steers and job results wait on it.
  The record's footer says what the move still waits for (`TaskView.computerMove`, `computerMoveLine`), and Cancel move, or `move_task` with `cancel`, ends the ask until the work starts crossing.
- **The work crossing** (`TaskMoves.runComputerMove`, phase `moving`).
  The crewmate's conversation is let go, never closed, so a move that does not finish reopens it where it was.
  The work is packed where the task runs (`src/core/workspace/workMove.ts`): the branch's commits cross as a git bundle, and one pack carries what is staged and what is not, as two binary patches against the commit the checkout is at, the files git does not track and does not ignore, the ignored files the move names to keep, and the task's evidence, card bodies, source cards, sessions and handed files.
  A file git ignores stays behind and goes with the old copy unless the ask names it in `keep` (`move_task`), as paths inside the working copy; a kept path that is not there, or that leaves the working copy or passes through a link, refuses the pack.
  No commit is made to carry them, a checkout off its branch or in a merge, rebase, cherry-pick, revert or bisect is refused, as is one with changes inside a submodule, which git's trees cannot check, or a submodule at a commit none of its remotes holds, or submodules git cannot list, and a link is kept as a link.
  A clean submodule is checked out again on the receiving side at the commit that left, or the unpack fails there.
  Unpacking writes nothing through a link already on the receiving side, the working copy and the task's folders themselves included, and reads and writes each file a piece at a time.
  A computer that runs work packs on `inf:working-copy:move-out`, and its pack comes here through `inf:working-copy:read` with the ref `move`; a computer that takes the task gets the bundle and the pack as source files and makes its working copy on `inf:working-copy:move-in`, on the branch the move named (`PlacedCopies.moveOut`, `moveIn`).
  The side that unpacks checks each part's digest and then the restored index and working tree against the trees the packing side read, so what arrives is what left.
  A pack that cannot be made changes nothing: the move waits again and says why.
- **One commit.**
  Once the destination holds the work, `TaskService.placement.commitComputerMove` writes the record once: the computer it runs on, its working copy there, and phase `retiring`, with a feed line ("the captain moved it from this computer to Mac mini").
  Before that, what this computer kept of a conversation on the computer it leaves is set aside (`PlacedSessions.forgetExecution`), so the new one there starts fresh.
  The commit also writes the conversation it left (`restartFrom`), so whichever path resumes the task first - the move itself, the next tick or a quit's reopen - opens a new conversation on the destination through the same session factory, told it moved, with its brief and where its earlier conversation is (`conversationRestartWake`, `changed: "computer"`), and never the old one.
  It keeps the model it had only while a level that the destination's accounts serve holds it, or the task names it; otherwise it routes again there first (docs/routing.md, "A model that left every level").
  The lane stays held until the destination installed its dependencies, as a first turn's are (`prepareFirstTurn`): the commit marks the move `preparing`, the install's end clears it, and a quit before then installs again at the next launch; then what waited on it goes next.
  The work crossing and that install run beside the shared tick, never inside it, so a large pack or a long install holds nothing else.
  The task keeps its cards, threads, policies and limits, and no consent carries over that it did not already have.
- **The old copy goes** (phase `retiring`).
  Once the new conversation has opened, the working copy left on the computer it moved off is removed: here with its worktree, on a computer that runs work by closing its conversation there, removing its copy and then its task folder (`PlacedCopies.retireMoved`), so a later move back starts from nothing it left; a move off a computer out of reach leaves its copy until the task moves back or closes (below, "Moving a task off a computer that is out of reach").
  An unreachable computer is tried again on each tick, and the record's footer says so; the leftover sweep never touches a task while a move names that computer, except one that left its copy on a computer out of reach (below).
  Once removed, the move ends with a timeline line and no card.
  The quit includes in-flight crossing, reopening and copy removal in its existing bounded settlement; tests also await the move’s recorded completion before draining pool returns and deleting their fixtures.
- **A move that does not finish.**
  A failure before the commit, or a quit while the work crossed, ends the move: the task stays where it was with its work and conversation, and its timeline and the feed say why ("its move to Mac mini did not finish: …").
  What the move made on the destination is removed (phase `undoing`), tried again while that computer is out of reach, and the lane's held work goes on where the task runs.

### Moving a task off a computer that is out of reach

When the computer a started task runs on is out of reach, the captain can still move the task, from what this computer holds of it and only after hearing what stays behind (INF-4835, the captain: "Continue the same task there from what your main Mac holds, after saying what stays behind").
Nothing moves on its own, and a move between two computers in reach is unchanged.

- **What this computer holds.**
  At each turn's end of a task on a computer that runs work, this computer brings the task's branch home (`CrewTurns.afterTurn`, `PlacedCopies.bringBranchHome`), and the record keeps the commit it brought and when (`WorkShape.home_copy`, `TaskPlacement.recordHomeCopy`).
  The home stops taking new background close and reconnect work at shutdown, then waits for admitted close orders and queued branch copies and retirements before releasing the task database (`PlacedSessions.stopCopies`).
  What it holds is the commit `refs/heads/<branch>` of the task's repository here names (`PlacedCopies.homeCopy`); when it holds none of the task's commits, the move is refused and names the ways out: wait for that computer, or drop the task.
- **Saying what stays behind.**
  A computer is out of reach for a move when it is not in reach, not catching up and not being updated (`TaskMoves.isAway`); the record still offers Move to a computer.
  The picker says, in one line under the computers, which commit the task continues from, how long ago this computer brought it, and what stays behind: later commits, edits not committed, files git does not track and the files in its task folders there (`MoveOptions.leftBehind`, `leftBehindLine`); its button reads Move without it.
  `move_task` without `leave_behind` refuses with the same line, and with it moves; the first mate passes it only on the captain's yes to that line.
  A move waiting for a safe pause whose computer goes out of reach offers the same choice: its footer adds the line and a Move without it button beside Cancel move (`ComputerMoveView.leftBehind`), and the ask replaces the waiting one.
  `keep` cannot name files on a computer out of reach.
- **The move.**
  The ask records `away` on `computer_move`: the commit it continues from and when this computer brought it.
  It waits only for its merge to be settled and the destination to be in reach; nothing on the computer out of reach is waited for, and its conversation is let go without waiting for it to close.
  Nothing is packed there: to this computer, the new working copy is made at that commit on the task's branch, and the task's folders here are the ones it keeps; to another computer, a pack made here carries no edits, only the task's folders here, with that commit's tree as both trees the other side checks (`packHomeCopy`).
  The commit names the destination as any move's does and records what was left (`WorkShape.away_copies`: the computer, the commit and when), and the task keeps its key, cards, threads and branch.
  Its new conversation is told it moved while that computer was out of reach, which commit it starts from, what may be missing, and to check its working copy against its record (`CrewmateRestart.leftBehind`).
  Once that conversation has opened, the move ends without removing anything; the copy it left stays where it is.
  A computer that comes back before the work starts crossing turns the ask into an ordinary move that carries everything, with a timeline line.
- **When that computer is back.**
  Its roster names a task this computer records elsewhere, so the leftover rule reaches it (`PlacedCopies.retireLeftover`), which for a task with an `away_copies` entry from that computer keeps the copy instead of removing it (`keepAwayCopy`).
  Its conversation there is closed for good, so that computer stops running the task; what its working copy holds that never merged is saved there as one commit and brought here onto a ref of its own, `refs/infinitary/away-copy/<task>/<when it moved>` (`awayCopyRefFor`), so the task's own kept ref is never written over.
  The working copy and the task's folder there stay, and the record notes the commit, the ref and the folder with a timeline line.
  The task's crewmate is told once, as guidance for its next turn, where that copy is and where its unmerged work is kept (`away-copy-kept`, sent by `TaskMoves.tellAwayCopies` as soon as the copy is kept); on this computer it compares the ref with its working copy, and elsewhere it asks through the first mate.
- **When the kept copy goes.**
  The kept copy stays there until the task moves back to that computer or closes (INF-4851's review, the captain: "Remove the kept copy there first, then move the task in" and "Remove kept copies when the task closes, after saving their work").
  Its work is saved here first, if it was not yet (`keepAwayCopy`), and its conversation's record is brought home, since this computer copied it last at a turn's end there and sessions are never pruned (`PlacedSessions.copyRecordThere`); then its working copy is retired there against the kept commit and the task's folder there removed (`PlacedCopies.removeAwayCopy`), and the record notes when (`away_copies[].kept.removed`) with a timeline line.
  A move back to that computer removes it before the work crosses, since its closed conversation there takes no moved work; a removal that fails ends the move with its reason, and the task stays where it is.
  Until it goes, that closed conversation is not one this computer waits to catch up on (`PlacedSessions.ready`).
  A task that closes removes each kept copy on a computer in reach at once, and one out of reach at that computer's next contact (`PlacedSessions.removeAwayCopiesIfClosed`, `retireLeftover`).
- **The first mate hears it when the captain asks.**
  No wake carries a task stranded on a computer out of reach.
  The crew line's `away` (`CrewStatusEntry.away`, and the task index's `away`) says the computer is out of reach, which commit this computer holds and that `move_task` with `leave_behind` continues it on the captain's yes.
- **Every task of one computer at once.**
  Settings -> Devices carries every task of a computer out of reach on to another with one question, the same move for each, then removes the old entry (`docs/devices.md`, "Joined again").

## Its own sign-ins

A computer that runs work signs in to its own subscriptions, and a task it runs uses only those (design skill `components/devices/SignInOnAMac`).
A computer also signs in to GitHub for its own clones and pushes, with a code or through its own GitHub CLI's sign-in, to GitHub Enterprise and GitLab with a key or GitLab's browser code, and to Bitbucket Cloud with an API token and Bitbucket Data Center with an HTTP access token (`docs/forge.md`, "A computer's own sign-in").
Nothing of the home's sign-ins is sent here, and nothing of these goes to the home but the account rows, the allowance read here, and who GitHub says it is.

- **The stores.**
  `startComputerAccounts` (`src/core/helper/accounts.ts`) keeps an `AccountVault` over `work/accounts/`, with Pi's accounts and Claude on this macOS user's own login, and `startComputerForges` (`src/core/helper/forges.ts`) a `ForgeSignIns` over `work/forges/`.
  They are loaded with the first order about sign-ins, the first conversation, or at start when either store already holds a sign-in, so a computer that signs in to nothing never loads them, and a short-lived GitHub sign-in keeps renewing with nobody asking.
- **The flow runs here, and is drawn at the home.**
  The home asks the orders in `src/shared/signIns.ts`: `inf:sign-ins:list`, `start`, `answer`, `cancel` and `remove`, and for GitHub `forge` and `forge-out`, from `computer-forge-servers` `forge-key` and `forge-browser`, and from `CUSTOM_API_SIGN_INS_SINCE` the `custom-*` orders (`SignInHost`, `src/core/helper/signIns.ts`).
  A custom API connection is typed at the home and kept here: this computer reads the address, fetches the model list, checks each model and saves, so a localhost address is this computer.
  The key, headers or token command ride once inside `inf:sign-ins:custom-connect` and stay in this computer's store; the command runs here and its produced tokens stay only in memory; the home keeps no copy in a file, a feed line, a card or a conversation.
  What this computer says of its sign-ins includes its custom connections, with no key, and the models each account can serve, so a provider the home's catalog lacks can still take a task here.
  Its model lists are built as the home builds its own (`createAccountStore`, `docs/model-lists.md`, "Where "served" comes from"), so a task here, started by Automatic or set to run here, routes among what this computer actually serves (above, "Automatic starts", and below, "A task's model").
  A Claude account there lists what this computer's own Claude Code answers, else Claude's shipped catalog (`claudeAvailableModels`), and a Codex or Grok account lists Pi's catalog narrowed by the account's own list.
  The safety rail protects the models the captain kept, which only the home's record holds, so the home judges a Codex or Grok account's own list there: this computer reports Pi's catalog for the account with the ids its own list named (`accountList`), and the home narrows that catalog by the same rail and protected ids as its own accounts (`narrowServedThere`, `src/core/models/piAccountLists.ts`), wherever it reads what this computer serves.
  A model the captain pins or places in a level stays listed there whenever the account's own list leaves it out, as it does here.
  Each account's own list is read when this computer first holds the account, after a sign-in, and once a day after its last try, whether that try succeeded or failed, as the home reads its own.
  An allowance read starts a list read only when the account has never been tried or its last try is a day old, since Claude's read starts its client and holds the login's store.
  A read that could not start while a session held that store is not a try, so the next allowance read starts it again.
  For a custom model, the home opens only the account-free control plane and names this computer's checked account; this computer builds the runtime on its own connection.
  After the home restarts, it adopts the conversation with this computer's account again, without requiring a matching custom connection at the home.
  If this computer no longer offers that custom account, reopening is refused rather than choosing another server.
  Each account lists at most `SERVED_MODELS_MAX` models, the Models board's rows first (`servedForHome`, `src/shared/signIns.ts`): OpenRouter alone serves more than four hundred, and a list past the bound would leave the home reading none of this computer's sign-ins.
  A computer older than that contract omits both, and the home shows the chip disabled.
  A sign-in runs the provider's own flow into this computer's store, and each step - a prompt, a link or a code to read, its end - goes to the home once as `inf:work:sign-in`, asked while the home is in reach and never again.
  Nothing opens a browser here: the link is the captain's to open, on the home's screen.
  A browser sign-in whose link sends the browser back to the Mac it opens on (Codex's `localhost:1455`, OpenRouter's own; `returnsToLoopback`, `src/shared/signIns.ts`) waits for that return here, where the captain's browser on another Mac never comes: its page cannot be reached there, so the home asks for that page's address, which Pi's flow takes whole, never a code its page does not show.
  Another user on the home's Mac shares its loopback, so the return reaches the sign-in here and it usually finishes by itself, with the address as the way back when it does not.
  Codex's code to read (Pi's "Device code login") needs no paste, but only once the person turns on device code login in ChatGPT's security settings, so the choice stays the captain's.
  What the captain types - a pasted code or address, a key - comes back once inside `inf:sign-ins:answer`; it is in this computer's store afterwards, as any sign-in's is, and the home keeps it nowhere.
  A sign-in whose home goes out of reach, or whose computer stops, stops.
- **Claude** adopts the login already on this computer; with none, it signs in with a code pasted back (`pasteCode`, `ClaudeAuthBackend`).
  A token command set up for Claude Code here, by an organization or in this user's own Claude settings, comes first: Claude connects with that access and signs nothing in (`docs/claude-client.md`, "Access a company set up").
  The row's Sign in again, which shows only once Anthropic refused that login, signs in with a code pasted back over it, and counts only a new login.
  It looks for that login in its file and in this macOS user's saved passwords, where macOS keeps it, through the same reader as Claude's allowance below, and reads only whether the login is there, never asking.
  Before a new sign-in over a login it cannot find, Claude Code itself must say it is not signed in: its word that it is adopts the login, and no word refuses the sign-in in a sentence, because the new sign-in would replace that user's login and sign out every Claude Code session running there.
  A refresh token that has lapsed, and is not sitting beside a newer saved password, still starts that sign-in when Claude Code does not say it is signed in.
  The vendor's own `claude auth login --claudeai` runs here with `BROWSER` naming a program that does nothing (`NO_BROWSER`), so no browser opens on this computer.
  The link it prints whose page shows a code (`pasteCodeLink`, the one that does not send the browser back to this computer's loopback) goes to the home as a notice, the captain signs in there and pastes the code the page shows, and it comes back once inside `inf:sign-ins:answer` onto the client's stdin; the client finishes the exchange and keeps the login in this macOS user's own store.
  A sign-in that does not finish ends in Claude's own reason; when it gives none, as its client's bare "Login failed: " when it cannot reach Claude, the home reads that the sign-in there did not finish and to check the internet connection there (`CLAUDE_LOGIN_UNFINISHED_THERE_TEXT`).
  Stopping the sign-in, or the home going out of reach, stops the client.
- **Claude's login, signed out only when Infinitary made it** (captain's pick on FI3-887).
  A login made from a pasted code is recorded in the Claude account's own folder (`made-login.json`, `MADE_LOGIN_FILE`): which login it was, as the stamp's digest of its account and organisation, never a token.
  An adopted login has no record.
  Disconnect at the home (`inf:sign-ins:remove`) signs a recorded login out with the vendor's own `claude auth logout`, and only while the login here is still the one it made (`signOutMadeLogin`); the client's own status read afterwards says whether it went.
  A login it adopted, or one that took its place, stays, and so does one whose account it cannot read.
  The answer carries what happened (`login`: `signed-out`, `kept`, or `not-signed-out` when Infinitary made the login and did not sign it out), and the home's feed says it (`device_signed_out`): "Infinitary signed Mac mini out of the Claude login it made.", "Infinitary stopped using Mac mini's Claude login.
  It stays, since Infinitary did not make it.", or the warning "Infinitary stopped using Mac mini's Claude login, but could not sign it out."
  The home's Disconnect of any other account says "Mac mini is signed out of Codex."
- **GitHub** (`src/core/helper/forges.ts`; `docs/forge.md`, "A computer's own sign-in"): this computer's own sign-in for its clones and pushes, kept in `forges/` by its own `ForgeSignIns`.
  GitHub's device flow runs here, its code to read goes home as a notice, the captain enters it on GitHub's page there, and this computer asks GitHub until it says yes and keeps the sign-in.
  `inf:sign-ins:cancel` stops it, and so does a newer one, since only one code is on screen at a time.
  The code running out ends it as "The code expired.", GitHub out of reach as "Could not reach GitHub - try again.", and a no on GitHub's page quietly.
  Its health and a short-lived sign-in's renewal run on this computer's own minute tick, as the home's own do on its; the home holds no store for it, so it can neither read nor renew it.
  GitHub Enterprise, GitLab, Bitbucket Cloud and Bitbucket Data Center sign in here too, with a key the home sends once (`inf:sign-ins:forge-key`) or GitLab's browser code (`inf:sign-ins:forge-browser`), each kept in `forges/`.
  This computer's sign-ins whole carry the host it is signed in to, who the host says it is and its health, every host it offers and the kinds of server it signs in to (`forges`), never the sign-in itself.
- **Allowance and renewal, here alone.**
  This computer reads each account's allowance with its own store every five minutes and after a sign-in, and tells the home its sign-ins whole as `inf:work:sign-ins` after any change.
  A 401 is handled here, and non-Claude proactive renewal runs on this computer's own clock (`CredentialHealthService`); the home holds no store for these accounts, so it cannot renew one.
  Claude sessions renew themselves here too; only an idle rejection asks the client once, with no health-tick status poll or renewal wait.
  The captain's Refresh in Subscriptions asks each computer in reach that lists `computer-account-settings` to read its allowance now (`inf:sign-ins:read-allowance`, a `demand` read here that still never lets macOS ask), then list its sign-ins again (`DeviceSignIns.readAllowance`); an older computer is only listed again.
- **Keep going on credits, saved here.**
  A Claude or Codex account here carries its own Keep going on credits switch (`docs/quota.md`, "Keep going on credits"), saved in this computer's own store; the home turns it with the `inf:sign-ins:keep-going` order, sent only to a computer that lists the `computer-keep-going` change (`DeviceSignIns.keepGoing`).
  This computer lays the switch over the allowance it reads (`stampSnapshot`) before it tells the home, so the home's routing sees a spent allowance on credits as it sees its own, and a reading or the switch turned on while credits read `available` ends a spent allowance's cut-off here early.
  A computer without the change shows the item dimmed in its row's menu, with a note to update Infinitary there first.
- **A saved reset, used here.**
  A Codex account here uses its saved resets through this computer's own Codex CLI, with its Codex home in the account's folder in this computer's own store (`docs/codex-client.md`); the home asks with the `inf:sign-ins:use-saved-reset` order, sent only to a computer that lists the `use-saved-reset` change (`DeviceSignIns.redeemSavedReset`).
  The use runs as a sign-in does here, under its own sign-in id: Codex's sign-in link and its paste-back prompt cross to the home and show under the account's row, and the end is a `signed-in` step carrying what the use came to (`savedReset`), or a failed step with this computer's words.
  The home says the outcome in its feed and asks this computer to read its allowance again; removing the account here signs Codex out and deletes its Codex home with the account's folder.
  A computer without the change shows the item dimmed in its row's menu, with a note to update Infinitary there first.
- **Saved resets on their own, saved here.**
  A Codex account here carries its own Use saved resets on their own switch (`docs/quota.md`, "Saved resets on their own"), saved in this computer's own store; the home turns it with the `inf:sign-ins:use-saved-resets` order, sent only to a computer that lists the `auto-saved-resets` change (`DeviceSignIns.setUseSavedResets`).
  Turning it on runs as a sign-in does here when Codex needs one, and ends `signed-in` once the switch is saved.
  Turning it off is saved and answered at once, with no steps; a refusal or a failed turn-off stays under the account's row at the home.
  The home decides when to use a reset and sends the same `inf:sign-ins:use-saved-reset` order a click does.
- **Prefer, rename and pause, saved here.**
  The home turns an account's crew preference, its name and its pause with the `inf:sign-ins:pin`, `rename` and `set-enabled` orders, sent only to a computer that lists the `computer-account-settings` change (`DeviceSignIns.setAccount`, its `accountSettings` view).
  This computer refuses an account it does not hold, saves each in its own store with the same `AccountVault` calls the home uses for its own, and tells the home its sign-ins whole; the home keeps none of them.
  The row's menu at the home and the first mate's account actions (`account-prefer`, `account-rename`, `account-pause`, each with the computer's `deviceId`) reach the same orders, and a computer without the change shows those items dimmed, with a note to update Infinitary there first.
  The first mate's `account-disconnect` with a `deviceId` signs this computer out of an account as the row's Disconnect does (`inf:sign-ins:remove`), and its `device-sign-in` read lists each account's id, whether it is paused or preferred, and the hosts this computer is signed in to.
- **A turn's facts are this computer's.**
  A typed cut-off a conversation here meets - a lost sign-in, a refusal, a spent allowance - is recorded on the account it is bound to, in this computer's own store (`AccountVault.noteCutOff`, through `ownAccounts` in `src/core/helper/conversations.ts`), where its own health reads clear it as the home's clear its own: its minute's read sees a login signed in again here, a good allowance reading or a turn that succeeded on it clears a sign-out, and a spent allowance ends at its reset.
  The home records none of it on its own accounts, so its first mate and crew keep serving from its own subscriptions, and no cut-off on the home's accounts holds a task that runs here either.
- **A cut-off here holds its task there, as the home holds its own** (captain's pick on FI3-1001: "skip that sign-in, hold the task, and go on by itself once you sign in there").
  Each account row this computer tells the home carries the cut-off standing on it (`AccountView.cutOff`: its class, when it was seen, and a spent allowance's reset), and this computer tells the home its sign-ins whole as soon as one is recorded or cleared (`AccountVault.onCutOffChange`).
  The home skips that sign-in when it routes a task here (below, "A task's model"), and holds the lane of a task whose conversation here is bound to it, on the one predicate the home's own accounts use (`docs/inbox.md`, "A lane on a withheld account"): no turn is attempted, nothing is set aside, the idle ladder neither nudges it nor calls it stuck, a steer is kept (`recorded-held`), and the card thread's waiting line names where to sign in again ("Claude needs you to sign in again on Mac mini.").
  Only the turn that met it raises the sign-in card, and the first mate hears the cut-off once for the account and its end once ("Claude on Mac mini").
  Once it is gone the lane's kept guidance goes out as one turn, the sign-in card comes down, and a task that waited for that sign-in starts here at the next ready sweep.
  The home books each turn's usage on the account the conversation's state names (`CrewMachines.servingAccount`), or on none when it names none, and its sign-in card for that task says to sign in again on this computer ("on Mac mini").
  A task an earlier build started here may still name one of the home's accounts on its record, and the home reads nothing of that account for it.
- **Claude's allowance, never asking.**
  While a token command is set up for Claude Code here, Claude's allowance is not measured and nothing below is read for it, as at the home (`docs/claude-client.md`, "Access a company set up").
  Otherwise Claude's is read with this macOS user's own login, the way the home reads its own (`docs/quota.md`): its file, else the saved passwords through the app's child-process reader (`src/main/host/electronKeychain.ts`), which the work mode loads with the first read (`savedPasswords`, `src/main/work.ts`).
  Nothing here ever lets macOS ask: nobody may be at this screen to answer, and the read would wait on the dialog.
  So a sign-in asks nothing, every read here passes `allowPrompt: false`, the child-process adapter forces interaction off, and the work mode offers no unlock.
  Metadata, the exact-item permission check and the guarded Apple-first value read all run outside the work process, so a slow saved-password answer cannot freeze its connection.
  A read macOS would have to ask about - no permission given here yet, or the saved passwords locked - comes home as the row's reason with words for a computer (`KEYCHAIN_VALUE_FAILURE_THERE`, `src/shared/quota.ts`), and the row offers no Retry.
  Nothing here holds a refusal, so the next read tries again and a permission given here later shows the allowance.
  A run whose data a test isolated with `INFINITARY_HELPER_DATA_DIR` reads no saved passwords, so no test reads the Claude login of the person running it.
- **The home's side** is `DeviceSignIns` (`src/core/devices/deviceSignIns.ts`): it reaches the computer through the connection's own `ask` (`WorkDevices`, `src/core/placed/workDevices.ts`, which the shell attaches once it starts the connection), keeps in memory only what each computer said of itself, and pushes `inf:devices:sign-ins` and each step as `inf:devices:sign-in` to the window.
  Its computer view includes `flows`: each sign-in's complete current prompt, notice and link, or its terminal failure, with no typed answer.
  `DeviceSignIns.end` owns success, refusal, cancellation and lost-contact exits; a replacement connection ends old-link flows and sends their cancellation through the current link, even when it arrives before the old link's gone notification.
  On each welcome, `SignInHost.reached` stops the computer's old flows too: quick redial can preserve in-reach contact without ever calling its dropped cleanup.
  Starting another flow for the same computer and target ends and cancels its predecessor in core, so overlapping callers cannot leave a second flow hidden behind the first.
  Settings reads this view after a step notification and on mounting, so switching tabs restores the code, prompt and Cancel rather than trying to reconstruct missed steps.
  The prompt box alone holds a typed draft and destroys it when the box leaves; the core never holds it.
  A newer view of an older home without `flows` keeps its account rows, allowance, Disconnect, custom connections and Projects rows with signed-in state and Sign out.
  Only provider and forge sign-in starts are disabled, with the update message beside them; both pending-card entry points also wait for the home to publish `flows`.
  Custom API connection management remains available under its existing capability checks.
  Settings -> Intelligence draws it (`docs/subscriptions-tab.md`, "A computer's own sign-ins"), Settings -> Integrations draws its GitHub row (`docs/forge.md`, "A computer's own sign-in"), and the feed says "Mac mini is signed in to Codex."
  (`device_signed_in`).
- **A task's model.**
  A task that runs here takes its model at the home among the subscriptions this computer is signed in to, never the home's, whether Automatic chose this computer or the task was set to run here (`PlacedAccounts.served`, `actualComputerPool` in `src/core/routing/computerPool.ts`, the pool an Automatic start routes among).
  The pool is every model this computer said an account that can serve lists - enabled, signed in, needing no new sign-in, withheld by nothing here and with no cut-off standing on it - as the home narrowed it (above), with the home's catalog row for each and the allowance as read here, so a subscription spent here is skipped.
  A model the home's catalog lists that no account here serves is never offered.
  A provider that catalog does not list, OpenRouter, joins with the models this computer said that account serves, and a custom connection with its checked models.
  An account that can serve but lists no models takes the home's catalog for its provider, for a task set to run here (`catalogWhereUnlisted`): a computer on protocol 2.6.0 through 8.1.0 lists none for its Claude account.
  A computer older than `CUSTOM_API_SIGN_INS_SINCE` says nothing of what each account serves, so a task set to run there takes every model of the home's provider-wide catalog whose provider it holds an account that can serve (`computerPool`).
  Automatic fills in neither.
  Automatic selection takes those only by the slot record, as it takes the home's own custom models: the captain's placements on the Models board, where they are tagged with this computer, or, when nothing this computer serves is placed, the record's fallback (`ModelSlots.routable`), which for a computer signed in only to OpenRouter takes OpenRouter's listed rows at medium.
  It is cut from what this computer last said of its sign-ins, and the home asks `inf:sign-ins:list` once when it has said nothing yet.
  The home's routing decision records it ("routed among Mac mini's own sign-ins (anthropic-claude): 4 models"), the home selects no account of its own for the task, and its binding names this computer's own account that lists the chosen model - its pin, else the first - or, on a computer too old to list its models, its account for that provider - its pin, else the first that serves - which `bindHere` binds here.
  A task whose computer lists no account at all waits as queued work until it reports one (above, "Runs on"); one whose computer lists accounts but none that can take it does not start, and nothing is made here for it: "Mac mini has no subscription of its own that can take this task now.
  Sign it in to one in Settings → Intelligence."
  When a cut-off alone withholds the sign-in that would serve it (`heldThere`, `PlacedAccounts.signInWait`), the task waits as queued work instead, and starts once that sign-in serves again (above, "Runs on").
  A task waiting for its computer chooses its model once that computer is back, and a task reopened after a restart binds the same way, by the model its record names, so it binds the account it started on while that account still lists the model.
  A started task here moves to another model among these same sign-ins, by the sign-in card's Move, the first mate's answer to a task stuck at its provider, or a model the captain names (`TaskMoves.planMove`, `docs/task-record.md`, "Moving a started task to another provider"), and reopens here bound the same way.
- **The first mate's card.**
  Asked to sign a computer in, the first mate calls `app_change` `device-sign-in { deviceId, provider }`, and the host files one card from the computer's own entry: "Sign in to Codex on Mac mini", with Sign in beside Not now.
  Its button opens Intelligence with that sign-in started there (`signInOn` on the open effect); the first mate starts nothing and never sees what is typed.

**Claude from the home, measured.**
Claude Code 2.1.288, run as this computer would run it - piped stdio, no terminal, its browser openers stubbed, and a stand-in proxy in place of the vendor - prints a sign-in link whose page shows a code to copy, waits on "Paste code here if prompted >", reads a pasted code from stdin, and tries to exchange it at `platform.claude.com`.
With both a stand-in `open` on its search path and a stand-in `BROWSER`, it hands its loopback link to the `BROWSER` one alone and still prints the code page's link, which is why `NO_BROWSER` keeps a browser from opening here.
The client's side of the paste-a-code path works with no terminal; a real code's exchange and the login it stores on that Mac were not run, because only a real sign-in can make one.

## Removed

Once its home removed it - at once, when it is next in reach of a home that removed it while it was out of reach (`docs/devices.md`, "Remove"), or when a new command from that home says so (above, "Finding the home again") - or once it leaves a home that is gone (above, "Leaving a home that is gone"), it lets every conversation and sign-in go, then removes what Infinitary set up here (`cleanUp`, `src/core/helper/cleanUp.ts`): its sign-ins (`accounts/`, `forges/`), the conversations (`tasks/`, `pi-agent/`, `pi-base/`) and their tasks' command keys (`task-channel/`), the home's personal instructions and skills (`personal/`), its clones and working copies, the pieces in flight (`bundles/`, `artifacts/`, the pool and the trash), a moving first mate's files (`home-arriving/`), a kept copy of the record (`standby/`), the copy of Infinitary in `app/`, and last the background agent, which ends this process when it is the agent's.
It touches nothing the person put on this Mac: only `installed.json`'s agent and copy, the data folder's own folders, and the Claude login Infinitary made here.

**The Claude login Infinitary made here** (above, "Its own sign-ins") is signed out with the vendor's own client before its account's folder goes, and a login that was here before Infinitary stays.
Claude's client keeps that login in this user's login session, where the saved passwords are, so only the work's own run, which launchd starts in that session, signs it out (`signOutClaude`).
A removal begun outside it - `remove --from-home` over Remote Login, or a join that leaves a home - keeps the record at the folder's root (`claude-login.json`) and notes the removal unfinished, so the agent stays.
`remove --from-home` starts the agent again at once: its run signs the login out and finishes the removal, or does at the next login.
A join clears the note, so the run after it signs the login out before it loads a sign-in or a conversation.
Terminal says which: "Infinitary signed this user out of the Claude login it made.", "This user's own Claude login stays, since Infinitary did not make it.", or "Infinitary could not sign this user out of the Claude login it made." and "To end it, sign out in Claude Code."
A removal that leaves it to the run says "Infinitary signs this user out of the Claude login it made the next time it runs as this user.", and so does `status` while it waits.
A home brings a computer's unmerged work home before it removes one in reach, so nothing is left to lose; one removed while out of reach could not, so a working copy that still holds edits or commits that never merged stays, with its clone, and Terminal says where: "Unmerged work it could not bring home stays here, in …".
Otherwise it says "Infinitary removed what it set up here, with its sign-ins."
An existing working-copy folder whose history cannot be read stays with its clone, even when Infinitary cannot tell whether it holds unmerged work.
A working-copies folder that cannot be listed stays whole, with every clone, and the rest is removed all the same.
Status, keep, bundle and retire refuse unreadable existing work rather than answer that it is absent or empty.
Removal reports the unreadable folders separately: Terminal says why each stays, and `remove --from-home` includes an optional `unreadable` list alongside `kept` in its outcome.
A failed connected removal leaves the computer on the list and its task's working copy present; after its history is repaired, retry brings its work home before retiring the copy.
Once nothing is kept and the removal has finished, the route, the logs, Electron's own files, the `launch-fact.json` protocol 9.0 kept and `left.json` go too, and `status` says this user has joined nothing.
The route goes under its write lock (`HomeRoute.remove`), since the home's SSH connection may still be renewing or withdrawing it from its own process.
A file the person put in the folder stays.
While unmerged work is kept, or the removal has not finished, `left.json` stays so `status` can say which home and what is left.

**A removal that cannot finish at once.**
Nothing it cannot remove stops the rest: each piece goes on its own, so its sign-ins and conversations go even when a folder beside them cannot.
A folder a build left read-only, inside what Infinitary made, is made writable to its owner and removed.
A route whose lock another writer holds past the two-second wait stays for the next try.
What still stays is noted in `left.json` (`unfinished`, `JoinedHome.setUnfinished`), which the note holds from the moment the removal begins, so a removal cut off part-way is noted too.
The agent, the copy of Infinitary it starts and `installed.json` stay while anything else does: the agent's file goes first, in one step, then the copy, then launchd lets the agent go.
Terminal says "Infinitary could not remove all it set up here yet, in …" and "It tries again the next time this user logs in.", and `status` says the same after which home removed it; `remove --from-home` puts the paths in its outcome's `unremoved`.
The next run finishes it, whichever starts first: the agent at the next login (`work run`, `finishRemoval` in `src/core/helper/run.ts`), or the home's `remove --from-home`.
A working copy an earlier try began to remove is removed without being read again, since a copy half removed no longer reads as one.
Once nothing is left, the note keeps only which home removed it.
A new join clears the note, and nothing tries again on its own; a join that finds the home removed it says what stays (above, "Finding the home again").

## The checks

- `scripts/check-helper.sh <app>` starts a built app as `<app> work version` and `<app> work status` with an empty environment under a throwaway macOS home, and requires its version and that it has joined nothing.
  It starts the runner's own architecture, and Intel through Rosetta when an Apple silicon runner has it; the summary names the ones it started.
  `verify.yml`'s package smoke runs it on the dev bundle, and `release.yml` on the signed app (`work-mode`).
- The work mode's journeys, `tests/e2e/run-work.spec.ts` and the `run-work-command`, `run-work-update`, `run-work-ssh` and `run-work-tasks` journeys beside it, start the built app the same way as its own process, against the real pairing and connection.

## Tests

- `src/core/helper/helper.test.ts`: joining and running against the real connection and pairing - refusals before anything is asked, a yes and a no, the same user refused with the link kept, a used or expired link, a busy folder, in reach and out of reach and back, another major, Remove, and `status`; and finding the home again at its new address as the same computer with its run stopped first and everything kept, a link from another home refused while the one kept answers, and a home that removed it while out of reach heard, its setup removed and the link joining it anew; and a home that is gone left on a yes as a removal would, with one question, only the leaving asked after a command fetched the copy, nothing changed without a yes or when the new home does not answer, and `status` saying it left when the new link is refused after the yes.
- `src/core/helper/helper.test.ts`, "a home on this Mac while this Mac's network address changes": joined by the command for another user at loopback, and in reach again with no new link once the address changed and the home listened anew; a grant naming this Mac's own network address dialing loopback from its next run and kept so; and a grant naming another Mac, a name or loopback left as it was.
- `src/core/helper/sessionHost.test.ts`, `sessionHostDeadlines.test.ts`, `sessionHostCardFiles.test.ts`, `sessionHostRestarts.test.ts` and `sessionHostJobs.test.ts`, over `tests/helpers/sessionHostWorld.ts`: a conversation held here, through the helper as the work mode composes it, the real pairing and connection, and real Pi against a stub of the model's API, with a stand-in home that keeps every answer - a prompt run and each callback done once with every event once and in order, an order applied once, a drop mid-turn caught up exactly with the waiting callback asked again under its id, two callbacks waiting at once, a card's picture before its card and a demo's recording in pieces after its poster, a preview's project font before its card and that card refused to a home too old to keep one, a card's file for the captain kept in the task's `cards` folder here with only its reference crossing, and that card refused to a home too old to show it, one 24-day callback deadline spanning prior events and all picture transfers across two absences, asset-only cancellation distinguished from a sent change, Claude's timeout withdrawing a waiting request before the deadline and preventing a resend, a quit mid-turn ended as `interrupted`, a stopped run's late answer to its events leaving the saved turn of the run that started next as it was, a Claude conversation continuing across the folder migration without a compatibility notice, the record copied from where the home's copy ends, close for good, a task's folder removed only once its conversation is closed and its working copy gone, a job's end, one ending in a cancelled tool's scope still told and its row kept until the home answers, each job end a restart left untold - a job the stop killed, one said to have maybe run on when its run ended without its stop, and an exit the home had not answered - told once and asked again under its id when this computer stops again before the home answers, a Claude client's background tasks kept while it lists them and the one still running told once as the stop's at the next start, with none kept for a task it finished, a carried-on turn and a prompt's turn each keeping its conversation through a reopen for moved instructions and a home's detach, answering that it streams, and starting over for that open asked again once it ends, each task a client still ran when the home's detach or a moved contract let go of it, or it ended by itself, told once at once as the client's end, asked again after a restart until the home answers, and none told at a close, that end told to a home before 9.2 as an ordinary end, and malformed or unknown orders refused.
- `src/core/helper/toolCallbacks.test.ts`: a report's handed file longer than one piece sent to the home over `inf:work:handover-file` in order and whole, before the report that names it.
- `src/core/devices/homeLink.test.ts`: a work request asked again on each new connection until the home answers, the home's own requests answered, and a work request ended when the device stops or its caller withdraws it, with whether it was ever sent kept across drops and no retry after withdrawal.
- `src/core/helper/route.test.ts`: the route on its own - the socket answered for its home and device until its lease runs out, no earlier generation writing over or withdrawing a later one, out of reach when it cannot be read or its socket is not private, refused when its path is too long, a lock a writer died holding taken over, and a removed route that no earlier generation's renewal or withdrawal writes back.
- `src/core/helper/helper.test.ts`, "a home that reaches this computer through its own SSH connection": a run that dials nothing without a route - not even the loopback its grant names, where the home answers - reaches the home through a published route, refuses another home's link while that home answers through it, follows a new route as the old connection drops without starting again, and is out of reach, still joined, once its lease runs out; an update over Remote Login of the Mac mini's grant, which had not heard where it runs, hearing the home through the route first, so its agent starts as an app on another Mac and as before for another user here, and its grant keeping the home's word; a computer a command joined, found again by the home through its SSH after the home moved, keeps its id and sign-ins and dials only the route from then on; and a computer on that connection refuses a command's link.
- `src/core/devices/computerUpdate.test.ts`, "a computer that reaches its home through the home's SSH connection": Infinitary got through the route, and nothing got or changed without one.
- `tests/e2e/run-work-ssh.spec.ts`, "a computer whose home reaches it over the home's own SSH connection": the built app's run dials only the route on disk, out of reach until it is there.
- `src/core/placed/placedPi.contract.test.ts` and `placedClaude.contract.test.ts`: the shared session suite's crewmate cases (`tests/helpers/sessionContract.ts`, the machine from its world) on real Pi and on the scripted Claude client held on a computer, driven by `PlacedSessions` over the real connection (`tests/helpers/placedContractWorld.ts`).
- `src/core/placed/placedRestartRecovery.test.ts`: a report replayed from a model-message checkpoint after both computers restart still owns its terminal boundary, then the real crewmate receives a steer, an interrupt and a backlog restart without losing its inbox guidance; and, when the task's model left every level, a reopen that records its move only once the computer answers it open on the new model with the model and account it bound, words sent while a reopen routes held until a conversation opens, and an older computer asked no cleanup that would reopen the removed model; joined with the real routing and that computer's own sign-ins, the next words after its restart reach the model a level holds on an account there that serves it, a conversation adopted live on another model reopens nothing on it after that computer restarts, a reopen that did not open lets the next order wait for the conversation the next turn opens, a second order and a lane sweep while a move waits to commit reach no model until it commits, a conversation refused before this Mac restarts is never reattached to after it, nor one that opened before this Mac quit while its move waited to commit, and an order whose reopened conversation's check could not finish goes back with no attempt spent.
- `src/core/placed/placedCallbacks.test.ts`, `placedReach.test.ts`, `placedJobs.test.ts`, `placedWorkingCopies.test.ts` and `placedSignIns.test.ts`, over `tests/helpers/placedWorld.ts`: the home's side with the real supervisor and record over a real database (`tests/helpers/placedHome.ts`) and real Pi there - a task started there with each callback done once and its record copied home, a drop held out of reach and caught up exactly, a computer that runs work for another first mate now never said to catch up, an idle task out of reach never nudged, a home restart following the turn with no second prompt and keeping the report it already gave, a begun change with its answer lost refused without repeating its effect, a begun-only report not replayed, a not-ready refusal leaving no begun mark, a computer restart failing the cut-off turn and running its words again, a crewmate waiting on a background job there told once, as its next turn, that the computer's restart stopped it, and a Claude crewmate on a scripted client waiting on its background work there told the same way, and told once, as its next turn, when the home's restart let go of its client there, a Claude conversation on a scripted client that the computer's update starts over on its reopen told its brief and where its earlier transcript is, and not told again after a home restart, a conversation going on from the new folder after that computer's one-time move brought its work there, after both computers update, with its current paths and record preserved, a closed record closed there now or at the next roster, a request about another computer's task refused, a task whose computer takes no work never started, a report a carried-on turn or a prompt's turn gave while the home was away delivered once after the home returns updated, and the conversation then started over for the new instructions with its move noted and its brief told (FIRS-6), a lost continuation end ended as interrupted when the computer is back, after twenty quiet minutes and after a stop, and a quiet turn that still runs there left running, its quiet alert raised only after the computer answers that it works or gives no answer, and raised when the answer ends nothing here; and, on a project with an origin, its working copy cloned there, `open_change` sending the branch up from here once it is home, an artifact written there, its kept work home before the working copy is deleted there, now or once that computer is back, and a discard that asks that computer first.
- `src/core/orchestrator/crewWatch.quiet.test.ts`, the INF-2332 cases: a crewmate on this Mac whose carried-on turn its own session no longer runs ended as interrupted after twenty quiet minutes and after a stop, and one whose session still runs left running.
- `src/core/placed/placedOutside.test.ts`, "the integrations command on a computer that runs work": a Pi crewmate there runs `infinitary-integrations-axi` through that computer's own task channel, and the home's integrations answer its list, show and call, with the sign-in and the kept ask at the home (`docs/integrations.md`, "Tests").
- `src/core/placed/placedOutside.test.ts`, "the files command between this Mac and a computer that runs work": a Pi crewmate there copies a file and a database in use from this Mac, and a task here copies a file from that computer (`docs/files.md`, "Tests").
- `src/core/placed/placedCutOff.test.ts`: a task there while that computer's own sign-in is cut off, through a real `Router`, `PlacedSessions`, `DeviceSignIns` and the computer's real `SignInHost` on one manual clock - signed out there, held with one sign-in card and one wake for the account, a second task waiting with nothing tried, no turn, nothing set aside and no card back after hours and a closed card, a steer kept, and both going on by themselves once its minute's read sees the login signed in again, even when what it tells unasked comes late; a restart here keeping the hold and calling nothing over before that computer says so, with its sign-in card coming down once it is signed in there; and a spent allowance there held until its reset.
- `src/core/placed/placedUpdateSave.test.ts` and `src/core/helper/sessionHostUpdateSave.test.ts`: a computer that runs work saving its crew's work before its update ("Saving its work before an update") - the save waiting for the call a turn runs there and answering once the home has its effect and the turn's end, a second ask joining the first, a turn asked meanwhile ended unstarted with no model request, one carried-on turn after two restarts of that computer with no failed turn and no row left, Update later letting the save go with the same turn going on and nothing started again, and the save let go by itself when the home says nothing after it; `src/core/devices/saveThere.test.ts` holds the home asking it only of a computer that lists the change, waiting out a drop and asking again, and giving up after an update's wait or on Update later.
- `src/core/placed/placedAccounts.test.ts`: whose a placed turn's facts are, through the real supervisor, `PlacedSessions`, connection and pairing, this Mac's own account vault, selector and binder, and the helper binding with `bindHere` and `ownAccounts` over a store of its own - Claude signed out or out of allowance there recorded on that computer's own Claude account and on none of this Mac's, whose account, models and first mate seat still serve; the sign-in card naming that computer; the turn's usage booked on the account that computer bound, for Claude and for Pi; and a cut-off on this Mac's own account holding no task that runs there and naming none in the first mate's wakes.
- `src/core/helper/workingCopies.test.ts`: the working copies on a real project - one clone for every task, a working copy from the origin's newest commit, a clone refused with nothing left behind, a push from the working copy, a branch bundled with only what the home lacks, unmerged work kept and the copy deleted only once the home holds it, the origin a working copy came from, a clean copy parked warm, a task with no project, and an artifact written once whole and never over another.
- `src/core/helper/signIns.test.ts`: this computer's own sign-ins, through the helper as the work mode composes it, the real pairing and connection, the home's real `DeviceSignIns`, and Pi's own flows against stand-in providers - nothing loaded until the home asks, a key typed at the home, Grok's code read there and finished here, Codex's link sending the browser back to loopback and the address it ends on pasted back, with its allowance read here and shown there, a placed conversation bound to this computer's account and no other, Disconnect, Claude adopted or signed in with its code pasted back (and refused), Disconnect signing out the Claude login Infinitary made and leaving one that was there before, with the home's feed event saying which, Claude's login found in this computer's saved passwords and adopted without asking, or adopted on Claude Code's own word when nothing it reads shows one, Claude's allowance read with this computer's own login and never a read that lets macOS ask, the reason said at the home when macOS would have to ask and the reading once it no longer would, GitHub's device flow against a stand-in GitHub with its sign-in in `forges/`, the git environment pointed there, its health read here and signed out from the home, a GitHub sign-in stopped or run out, a sign-in stopped by the home or by lost contact, and nothing typed or issued in what the home pushed or saved.
- `src/core/claude/claudeAuth.test.ts` ("on a computer that runs work: a code pasted back") and `claudeCli.test.ts` (`pasteCodeLink`): the code page's link sent, the code onto stdin, no browser, a login already there adopted, a refused login signed in again over with a pasted code, a login only Claude Code can see adopted on its word, no sign-in when it gives none, a refused code in Claude's own words, a sign-in Claude gives no reason for in a sentence that says what to try, and a stopped sign-in stopping the client; and ("signing out the login it made") the login made from a pasted code signed out, and an adopted login, one that took its place and one whose account cannot be read left signed in, a client that could not sign it out said, and a login signed out by its record alone.
- `tests/e2e/device-sign-ins.spec.ts`: the built app as the home and this computer in the test's own process, signing in from Settings -> Intelligence and from the first mate's card, Codex with the address its opened link sends the browser back to pasted back, Claude with its code pasted back and its allowance read here shown in its row, its login already there used with no code asked, or the row saying why with no Retry when macOS here would have to ask, Disconnect signing out the Claude login Infinitary made or leaving the one it adopted with the feed saying which, and GitHub from Settings -> Integrations against the local GitHub stand-in, whose answer to git's helper is this computer's own sign-in - with nothing typed or issued in the home's saved data.
- `src/core/claude/claudeToolWait.integration.test.ts`: how long the Claude client lets an app tool wait, and its give-up signal reaching the bound tool.
- `src/core/jobs/jobManager.test.ts`: on a Mac, a crewmate's command at the run's own priority as a separate Mac that runs work runs it, and below the UI as the home and another user's work on its Mac run it; `helper.test.ts`, "whose work stays below the UI", which joins are on the home's own Mac, the home's word on the grant deciding over its address and kind, and that word kept from the join, from the run's welcome, and from an update's arguments after the controller the home's Update holds withdrew its route, so a separate Mac's agent starts as an app with nothing dialed.
- `src/core/helper/place.test.ts`, `lock.test.ts` and `words.test.ts`: where the data lives, the lock, and the words for another Mac; `src/main/workCommand.test.ts`: which starts are the work mode.
- `src/core/helper/helper.test.ts` also holds the background set up once joined and out of the folder's lock, what it found told to the home, and a join from a fetched copy that asks nothing and keeps the copy; `found.test.ts` git found as the app's own when its copy carries one and the search path holds none, else on the search path, as `git.exe` on Windows; `background.test.ts` the agent and its file, which asks launchd to start a separate Mac's run as an app and leaves another user's on the home's own Mac as it was, and a refused start told apart: the next login with no session, failed with one; `cleanUp.test.ts` what a removal takes away on a real project, keeping a working copy with unmerged work, a working-copies folder that cannot be listed, a read-only folder a build left, a removal that cannot remove a copy going on with the rest and finished by its next try, the route removed after a renewal that held its lock in another thread wrote, never before, and a route whose lock is held past the wait left for the next try; and the Claude login Infinitary made signed out by the work's own run, one that was there before left, and one a removal outside the run left to that run with the agent kept.
- `src/core/helper/fromHome.test.ts` also holds a removal over Remote Login that leaves the Claude login Infinitary made to the agent, starts the agent again, and the agent's run signing it out and finishing; `helper.test.ts` a join that leaves it to the run after it, which signs it out before it loads a sign-in.
- `src/core/devices/pairing.test.ts` and `src/core/connection/connection.test.ts`: the home's side - the user required, `same-user`, `onThisMac`, an older list read as it was, and `takesWork` and `onHomeMac` in the welcome.
- `tests/e2e/run-work.spec.ts`, on a Mac and on Linux: the built app from Terminal joins with a typed yes and not without one, sets itself to run in the background (a stand-in launchctl, or systemctl on Linux, writes down what it was asked), stays in reach as one process, refuses a second run, stops on a signal and lets the next one take the folder, ends when the home removes it and removes what was set up, and will not run as the home's own user; and a removal, from the home or in reach, that cannot remove a copy, which removes the rest, keeps its agent, says what stays, and is finished by the agent's next run.
- `tests/e2e/run-work-command.spec.ts`, on a Mac and on Linux: the command for another user, which names loopback and stays in reach, with no new command, once this Mac's network address changed and the home listened anew, and the command for another Mac getting Infinitary from the home and joining from the copy it got.
- `tests/e2e/run-work-tasks.spec.ts`, on a Mac and on Linux: a crewmate's turn runs there on Claude's boxed client while the home's record and crew hold it, out of reach and back with each callback once, and, its own sign-ins loaded there, through a stop that exits 0 and a restart of the app with nothing run twice; and a task in a project working in a working copy the app cloned there, its unmerged work home before that copy is deleted; on a search path that holds no git, as on a Mac with no developer tools, the join telling the home it has git, the clone, a crewmate's shell and the work brought home all running the app's own git.
- `src/core/placed/placedComputers.test.ts`, "leftovers on a computer that runs work": a spawn whose start failed after the working copy was made keeping that copy for its task, which Start again starts on, a purged task's unmerged work home on its kept ref in its project before its working copy and folder go, a leftover whose project is gone here kept there and said once until its project is back, and a failed start's working copy removed at the next contact once its task is set to run here.
- `src/core/placed/placedRunsOn.test.ts`, "a project that runs on a computer that runs work": a task waiting for its project's computer out of reach, said once and again after a day, started there once it is back with its card naming where it runs, a task commissioned while it is out of reach queued, a task moved back here before it starts run here, and a project kept on this Mac only refused.
- The computer question: `src/core/placed/computerChoice.test.ts` owns its answers and the directions it sends; `placementEngine.test.ts`, "the decision model's pick", what a start or wait pick chooses and when the ordinary rules take over; `automaticPlacement.test.ts`, "Automatic asks the decision model which computer starts a new task", a pick starting a real task, unsure asking once, the use switched off asking nothing, a wait pick's words, and a follow-up starting beside its origin.
- `src/core/placed/automaticPlacement.test.ts`: Automatic starts through the real task record, resource feed and receiver on a Mac's real reading - the first start after a quiet spell beside two tasks running and measured, their room freed, and the room of tasks that began running in a quiet spell freed by the first reading after, whether the clock reads the same within a moment or moves on with every read, and the room of tasks that have not started running kept, with a wait that says so; `src/core/routing/placementEngine.test.ts` the wait's words and kind naming processing capacity, memory, room set aside for starting tasks, each computer's reasons, or the model; `src/core/orchestrator/starts.automatic.test.ts`, "an Automatic wait in Activity": a new line only when the kind changes, and one line for room while memory stays short and the processor reading flickers, while Details and Start now read the latest words.
  The same three own a system no computer runs: `automaticPlacement.test.ts`, "AutomaticPlacement's wait for a system no computer runs", says so while this computer and the Mac mini both run macOS, and not while a paired computer runs Linux out of reach or never said its system; the supervisor's "tells the first mate at once, and once" wakes the first mate on the first comparison and never again after it read the wake; and `tests/e2e/automatic-placement.spec.ts` serves that wake to the first mate's next turn on a real start in the app, from this computer's own reading.
- `tests/e2e/runs-on.spec.ts`: Settings -> Projects choosing the computer on the project's page, its line in the list and the feed saying so, the first mate setting the same row back by `project-runs-on`, a project kept on this Mac only offering nothing to choose, and a filed task with no project moved to the computer, and back, by asking the first mate.
- `tests/browser/card-place.test.tsx`: a card from a task on another Mac, at the narrowest window and a roomy one, with a task title longer than its head has room for, naming where it runs whole, clear of the model and close, while the title gives way.
- `tests/release-workflows-main-check.test.ts`: both workflows start the built app this way.
- `src/core/helper/fromHome.test.ts`: started by the home - updated to the copy it sent, with its run stopped first and the background started from the new copy, or failed when the agent could not be written; `moveWork.test.ts` the home's word on the Mac mini's grant kept by the one-time move; removed with the note of which home; a removal that could not remove the agent's file finished when asked again, not refused; and refused for a folder that joined nothing, or one someone runs work from by hand, with the run started again as it was.
- `tests/e2e/run-work.spec.ts`, "the home's address changes": the built app, stranded when the home answers at another address, finds it with a new command as the same computer with its background stopped and started again, and, once the home removed it while out of reach, a new command removes what was set up there and joins it anew.
- `tests/e2e/run-work.spec.ts`, "its home gone for good": the built app, its home quit for good, asked by a new home's command to leave it - a no changes nothing and its run keeps trying, and a yes stops its run, removes its sign-ins and agent, keeps a working copy holding uncommitted work, joins the new home and is in reach of it.
- `tests/e2e/run-work.spec.ts`, "an installed build runs the work mode": the built app with the installed flag answers its version and that it has joined nothing.
- `tests/e2e/run-work-ssh.spec.ts`, "a Mac a command joined, stranded when the home's address changes": the built app, joined by the command for another Mac and stranded once the home moved, is found by the home's Add it at its address as the same computer with its sign-in kept, its stranded run stopped, and from then on reaches the home only through the home's SSH connection, which connects, and comes back by itself when the home moves again.
- `tests/e2e/run-work-ssh.spec.ts`, "a Mac added by its address over Remote Login": the built app on the other side of a throwaway SSH server on loopback joins with the link on its input, keeps the copy, sets up its background and runs in reach of the home, then is updated while the home holds its connection, its grant kept as before the home said where it runs, and keeps the home's word from the update's arguments; once the home's address changes, it comes back by itself over the home's new connection with nothing run there; then it is removed over SSH.
- `tests/e2e/run-work-command.spec.ts`, "on Linux with no screen, the command joins with the Infinitary installed there": the built app as the installed program, with no display, joins by the command with its own yes, downloading nothing, and the command names the line that keeps the work on after logout; "on Linux with no screen, the window says to use Run a command there": the window's two lines and exit 1.
- `src/core/devices/computerUpdate.test.ts`: updated by its home over the connection - the home's copy got with its own key and kept, nothing got as another user on the home's Mac, the run ending for its background, a copy that could not be got changing nothing, and a copy that exits at start put back by the watcher, which has launchd start the previous copy again; `tests/e2e/run-work-update.spec.ts`, "updated over the connection": the same with the built app.

## Not yet

- A Linux computer's work while nobody is logged in as its user where systemd does not let that user keep it: an Ubuntu 24.04 or 26.04 computer added by its address or by its command turns linger on for the account, and the command elsewhere turns it on where systemd allows it without a password; where neither could, the add or the command names the one `sudo loginctl enable-linger` line (`docs/devices.md`, "Joining by a command", "The Ubuntu package").
  Anywhere else the service runs only while they are logged in.
- The real check of a Linux computer joined by a link to the captain's own Mac, and of a Mac to a Linux home, on two computers of the captain's: the journeys run both ends on one computer, and GitHub's machines cannot reach each other.

- The priority launchd gives the agent's run: no test loads an agent, so `background.test.ts` holds only the file that asks for it.
- Claude's allowance where macOS here would have to ask first: Infinitary reads it only with its own permission here, which only someone at this screen can give.
- The real check of running as another macOS user, on a spare Mac or a virtual one with two real users, which needs the captain's permission: the tests run every user as the one running them.
- The real check of a Mac added over Remote Login on a spare Mac, which needs the captain's permission: whether a session reached over SSH, with that user logged in at the screen, loads the background at once, and that one with nobody logged in starts it at the next login.
  The tests reach this Mac's own throwaway SSH server, as the user running them.

## Starting from a source task

The home copies the chosen source card whole, including its script and style, and its pictures and recordings into the destination task's `source-cards/` folder before its first turn.
The brief and the card name the verified copies on that computer, never the home's paths.
The card's choice, submitted answers and thread remain inline in the brief.
A live source branch on another computer is brought home at its current commit first.
A source in another repository crosses no code: its branch stays where it is and its brief names where that code lives (`docs/task-record.md`).
Starting branches and kept work cross to the destination as verified git bundles over the paired connection, into private `refs/infinitary/sources/<destination>-<source>` refs in the destination repository.
A bundle carries only the commits the destination lacks: the home first asks the destination's working copy which commit it has checked out (`inf:working-copy:status`) and leaves that commit and everything before it out.
When the destination holds the starting commit already, the bundle carries that one commit, leaving out its parents, so its ref is still named.
That computer's new working copy starts from the default branch it has just fetched, so when the home lacks that commit it first fetches its own default branch from where the project lives, bounded and never prompting (`WorkspaceService.dispatchBase`).
A destination that cannot say, such as one on an older contract, or a commit the home still lacks, as when that fetch failed, means the whole history crosses as before.
A destination computer on a contract before 8.4 (`INFINITARY_NAMES_SINCE`) takes only Firstmate 3000's names, so the home names `refs/fm3000/sources/` to it and bundles kept work under a stand-in `refs/fm3000/kept/for-older/` ref it removes after.
The new working copy is not preloaded: its brief names the imported ref to recover from.
A task that branches from another (`branch_from`) whose work is kept on the home crosses the same way: its working copy there is made at the default branch, the source's last commit crosses into its private ref, and its brief has the crewmate move its new branch onto that ref once, before anything else and only on a working copy with no edits or commits of its own, stopping to report otherwise (`renderBranchFromCarriedLine`).
A branch whose name the transfer order does not take, such as `release/1.2`, crosses under a stand-in kept ref made here only for the bundle (`PlacedCopies.sourceRef`).
A source whose working copy is on another computer is refused at filing, as on the home (`docs/task-record.md`).
The work computer removes these private refs when it retires the destination working copy.
Missing files and refused transfers fail dispatch rather than handing the crewmate paths or refs it cannot read; a computer that went out of reach meanwhile puts the start back in line (above, "Waiting").
A computer that does not support the source-file and source-ref orders must be updated before taking work that needs them.

## Crew speed on the executing computer

The placed spec’s optional `speed` opt-in makes that computer ask `inf:work:speed` before each crew request and summary.
The home returns the task override or shared model default; no sign-in or entitlement crosses with it.
The executing computer reads its own account’s speed capabilities and explains Standard fallback through the task timeline.
Its account catalogs refresh without holding up work, and its sign-in model rows advertise only fresh speed metadata with its original expiry, so a later sign-in update cannot extend old eligibility.
A computer with a contract older than 5.2 keeps Standard and the home explains that it cannot use the faster choice.

`src/core/pi/placedMigration.test.ts` checks recovered Pi turn order with and without newer turns, an unchanged recovery copy, a missing current copy, a mismatched conversation refused, and replay after a lost completion marker.

### Handed files

A task hands files to another task in two steps (INF-992).
Its crewmate's report names files by absolute path (`files`); the computer it runs on keeps verified 0600 copies in a 0700 folder, and a computer that runs work sends each to this computer over `inf:work:handover-file` in pieces before the report, into `crewmates/<task>/handover-out/`.
The home verifies each declared name, size and sha256 before recording the report, and the report's outcome names the kept files.
The first mate's `steer_crewmate` with `files_from` then delivers them into the waiting task's `temp/handover/` folder at 0600, here by a verified copy or there through `inf:session:source-file` with `into: handover`.
A handed file may hold secrets: no side reads its content into a string, logs it or names more than its kept name, size and sha256.
Every computer taking work on the current contract major supports handing files; a waiting task on another major cannot start until updated.
The waiting task's `temp/handover/` goes when that task closes; the handing task's `handover-out/` stays past its close, so a steer after it still hands the files, and goes with its other leftover files a week later, or later while live work builds on it (`docs/task-retention.md`).
The captain’s message attachments use this same destination automatically when their task starts (`docs/task-capture.md`), without a file-finding task or `files_from` steer.
An empty text attachment uses a zero-byte source-file order, supported by every computer taking work on the current contract major.

### Kept validation proof

A work computer sends selected validation files through the existing bounded media transport before its typed report reaches the home.
The home verifies filenames, ownership, bytes and content digests before recording the report; it never treats a remote mutable source path as proof.
The reviewer receives verified copies through the existing source-file transport on the computer that owns its review.
Both session backends use the same report and decision declarations.
The contract version must support those declarations; the existing same-major work rule prevents an older helper from silently dropping them.

## Source on the executing computer

Each installed app already carries its tracked source and index; background installations use their own resources folder, never a guessed Applications location.
The home sends only its build identity in the optional placed-session `homeSource` field, not its source path.
The executing computer resolves its own source facts when opening or reopening a conversation and adds them before stamping the effective instructions for either backend.
An idle conversation whose source facts changed renews on its next open; restart, update and task relocation resolve from the new app location.
Missing, unreadable or inconsistent maps remain explicit and do not block unrelated work; older computers with no source facts stay unknown.
Agents compare known immutable source commits before investigating another computer's build and use the existing verified file handoff when they differ or are unknown.
No source download, clone, additional store, setting or task-placement rule is involved.
