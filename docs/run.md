# Infinitary started by a command

How Infinitary runs with no window, started by a command: `<app> run` starts the whole app - its record, first mate, crew and scheduler - and keeps it running until it is stopped (INF-1228's approved plan, piece 1).
It is for a computer or an account where nobody sits at Infinitary's window, such as a second macOS account that runs the crew while the everyday account only controls it.

## Who owns what

The app owns what no starter can do: running with no window, a clean stop, and an exit with its reason.
Whatever runs the command owns everything about how it runs: when it starts (at boot, at login or by hand), as which account, whether it starts again after a crash or an update, its priority, its log and its settings file.
So the app adds no option per setup: a macOS boot entry, a Linux service, a login item and a terminal all run the same command.
Infinitary's own window is one more such starter: opened with no command running, it sets the command up with this account's service manager and opens beside it ("The window starts it" below).
On screen the mode is called "started by a command", beside Settings' "Start at login"; the words server, service, daemon and headless stay off the app's screens (`docs/vocabulary.md`).

## The command

`<app> run`, where `<app>` is `Infinitary.app/Contents/MacOS/Infinitary` on a Mac, `infinitary` from a Linux package, the AppImage file itself, or `electron . run` in a checkout.
Chromium's own switches may stand before `run`, as they may before `work` (`commandWords`, `src/main/workCommand.ts`); `<app> work run` is the work mode's own command, never this one (`docs/helper.md`).
`<app> run --settings <file>` names a settings file ("A settings file" below); `--agent <label>` after it is the mark this app's own Windows task gives its run ("On Windows" below); any other word after `run` prints how to use it and exits 2.

The main entry (`src/main/index.ts`) reads the words before anything of the app loads (`runCommand`, `src/main/runCommand.ts`) and starts the app itself (`startApp`, `src/main/app.ts`) with no window:

- **The same app.**
  It opens the same data folder the app with its window opens in that account, holds the same single-instance lock, and starts the same core, connection and scheduler, so a device paired with that account's Infinitary reaches it as it reaches the window.
- **No window.**
  It opens no window, menu or icon in the top bar, and on a Mac its activation policy is `prohibited`, so macOS lists it as background-only with no Dock icon.
  On a Mac it runs from a file of its own inside the app, so clicking Infinitary in the Dock, Spotlight or Finder, or `open -a`, starts the window beside it however busy the command is ("Opened while it runs" below).
  The only windows it draws are hidden pages: a task's browser and the checks of a card's demo recording or a preview's font.
  The last of them closing is no reason to quit.
- **A display of its own on Linux.**
  Before Chromium opens a display, it starts Xvfb with a key of its own in the data folder, as the work mode does (`startOwnDisplay`, `src/main/ownDisplay.ts`; `docs/helper.md`, "No screen needed"), so its hidden pages draw with nobody logged in.
  With no Xvfb and no display, it says "Infinitary needs Xvfb to run on a computer with no screen." and "Install Xvfb with your system's software, then run this again." and exits 1.
- **Nobody to ask.**
  Voice is not prepared, and an installed Linux app's checks at start (`docs/linux-packages.md`, "What the app checks at start") are said instead of asked: with no git it exits 1, and with Chromium's sandbox off it says so and runs, since its starter chose to start it that way.

Once its core runs, it says "Infinitary is running here with no window, started by a command." on its output; the notes the app's parts leave go to the same output, each starting with `[`.
While it holds the folder it keeps `run.json` there, with its process number, start time and an environment reading, and takes it away as it ends.
On a Mac the environment's Keychain reading needs the app ready, and the app is ready only once the run's start has returned, so `run.json` is written first and takes the reading when it arrives, a moment later; until then `status` says no environment reading was recorded, and a reading that arrives after the run ended is not written (INF-1659's check on a disposable Mac found a run that waited for it never started).
On Linux, and on an isolated or switched data folder, the reading is written with the note at once, so a run that ends right away, as with a settings file it cannot use, keeps it in its last stop.
Before removing the marker it writes `run-last-stop.json` with the reason, lines, exit code and stop time; both files are private to the account and replaced atomically.
A refused second start owns neither file, so it cannot replace the running command's reading.

## Before it starts

When the one-time move from Firstmate 3000 is due (`docs/saved-data-compatibility.md`, "The one-time move"), the run makes it in its terminal before Chromium opens either folder, then goes on from Infinitary's own folder (`runHandOverInTerminal`, `src/main/runHandOver.ts`).
The entry awaits the app's start before Electron is ready, so the move runs while no browser profile is open, and the run needs no second start.
Its lines go to its output and are the window's hand-over in words a terminal shows:

- **An older copy with no window.**
  When an older copy's background work or a run a command started holds the older folder, the run takes over from it as the window's hand-over does (`docs/saved-data-compatibility.md`, "An older copy still running"): it says "Stopping Firstmate 3000's background work" with the window's words, lets go of its background agent, asks it to save and stop, and waits up to fifteen seconds.
- **Asking before forcing.**
  A copy that has not let go by then is ended only when the person types yes at the run's terminal: Infinitary says "Firstmate 3000 has not stopped", that stopping it now ends it without waiting for it to save, and asks "Type yes to stop it now:".
  Any other answer leaves it running and ends the run.
  A run with no terminal to answer, as a service manager starts one, never ends it: it says to run this again in a terminal to stop it now, and ends.
  Either way nothing is changed, and the agents the take-over let go start again.
- **The move, step by step.**
  It says where the move starts and that Firstmate 3000's folder stays as a recovery copy, how much it copies, when it checks the copy, how far it is at most every fifteen seconds, and when the work is in.
  Once the work is in, it turns start at login on as the older app had it and hands the older background to Infinitary's label, as the window's move does.
- **A stop meanwhile.**
  Ctrl-C, SIGTERM or SIGHUP while it hands over stops the move before its copy is checked, with nothing changed, starts again the agents the take-over let go, says "Infinitary stopped." and exits 0; the move starts again the next time Infinitary runs.
  At the question, Ctrl-C answers it the same way.
- **What only the window asks.**
  When both folders hold work, the run says to open Infinitary with its window once to choose the work it opens, then run this again.
  An older copy with its window open keeps the person's own Quit: the run says to quit it, then run this again.

Any other reason the move cannot go on now - another launch moving the same folders, newer saved work, too little room, or a failed copy - ends the run with 1, saying what happened and what to do on its error output.

## Opened while it runs

On a Mac, a click on Infinitary in the Dock, Spotlight or Finder, or `open -a`, starts the app's window while a command runs, even one too busy or stuck to answer anything.
Such a click goes to a running copy that lives at the app's folder or runs the app's main executable, and a command whose main thread is stuck never answers it.
So the packaged app has two executables of its own, both compiled from `scripts/mac-app-launcher.m` and put in place by `scripts/place-mac-app-launcher.mjs` in electron-builder's `afterPack` (`scripts/after-pack.mjs`): the main executable, `Contents/MacOS/<name>`, in place of Electron's, and beside it the background file, `Contents/MacOS/<name> Background`.
Each starts Electron as Electron's own executable does, after one choice.
Each records the macOS SDK that Electron's own executable records, since AppKit picks which of its behaviors a window gets by the SDK the main executable records, so the window keeps Electron's whichever Xcode packaged the app.
A start whose first word is one a start with no window takes (`run`, `work`, `status`, `link`, `start-at-boot` or `help`, as `src/main/index.ts` reads them) moves to the background file before Electron starts, as the same process with the same words, and tells macOS it lives at that file, so macOS lists it there and never at the app.
A start with a window that reaches the background file moves to the main executable the same way.
A command keeps its process number through the move, so its starter, `run.json`, `status` and Stop all reach it as before.

The background file keeps the app's identity.
It carries an Info.plist of its own that holds only the app's bundle id, which `codesign` takes as its signing identifier, so a release and a local package sign it under the app's own name with no change to their signing, and the Keychain and macOS's permissions see the same app.
It is put in place signed ad hoc, because the signing pass may sign the main executable first, whose signature seals the files beside it, and `codesign` refuses to seal one that carries no signature; the signing pass then replaces it.
That small list is all the info macOS gives a file that carries one, so before Electron starts the file reads the app's own Info.plist back from the app's folder; a file that cannot read it hands the start back to the main executable, which keeps it, as where the move fails below.
The app's code reads the main executable as its own program (`appExecutable`, `src/main/appExecutable.ts`), so the agent at login, the command for another user and the check for a replaced program ("After an update" below) name the same file they named before.
`scripts/verify-app.sh` fails a release whose background file is missing or lacks either chip, and a signed one whose background file names another identifier or designated requirement than the app's.

Where the move to the background file fails, the command runs from the main executable, and a click reaches it as it reaches a command an earlier version started: the command hears macOS's reopen (`activate`), puts itself back in the background, and opens the app beside itself as a new copy through macOS's `open -n`, which joins the command as any window does (`openWindowOnReopen`, `src/main/runReopen.ts`).
A command whose main thread is stuck still answers no click that way, which is why the background file exists.
A command an earlier version started runs from the main executable until it ends, so after an update by hand a click still reaches it until then; the next command, from the new version, runs from the background file.

## Stopping and its reasons

Ctrl-C, SIGTERM or SIGHUP stops it the way quitting the app does: the core stops its crew, scheduler and connection (`deferCoreDisposal`, `src/main/lifecycle.ts`), it says "Infinitary stopped.", and it exits 0.
On Windows, where one program cannot ask another to stop cleanly, Stop writes `run-stop.json` in the data folder instead, and the run stops the same way once it reads one written after its own start ("On Windows" below).
On every system, a stop for one run alone - a window that lets the command go, or Start it here over a run started by hand - writes `run-stop-for.json` naming that run by its process and start, never a signal to its process number, which another program may have taken by the time it arrives; only that run honours it.
A run reads these files, and a force stop asked of it, only once its folder and saved data are accepted, so a run that refuses its folder ends with them as they were, and one still starting reads a stop asked meanwhile once it has started.
It listens for those signals itself from its start, so a module that listens later (Pi's sign-in store, through signal-exit) never ends the process before the core stops, as in the work mode (`src/main/work.ts`).
Once Electron is ready it puts its own handler for those signals in the system's place, which quits as a plain quit does and would lose the stop's reason, so the run then takes every listener for them off and puts it back in its order, and the signals come to it again (`src/main/app.ts`).

When it cannot start, it says why on its error output and exits 1, where the app with its window would open a page of its own (`RUN_WORDS`, `src/main/runCommand.ts`):

| Why | What it says |
| --- | --- |
| The app is already open in this account, or another command runs it | "Infinitary is already open here, as this user." and "Quit it, then run this again." |
| Infinitary's one-time move from Firstmate 3000 cannot go on now ("Before it starts" above) | what stopped it and what to do, such as "Firstmate 3000 is still open here, and it holds your saved work. Quit Firstmate 3000, then run this again." |
| The folder moved, a move holds it, or newer saved work is in it | the refusal page's title and reason, as two lines |
| This account's Infinitary controls a first mate on another computer (`docs/view.md`) | "Infinitary here controls your first mate on another computer, so there is nothing for a command to run here." and "Leave it from Infinitary's window here first, then run this again." |
| Anything else stopped its start | "Infinitary could not start: " and the reason |

A run whose first mate moved to another computer ends for good (`docs/devices.md`, "Moving the first mate"): it says "Your first mate moved to another computer, so this run ends for good.", forgets its background so nothing starts it again, and exits 0.
A move that failed after the first mate stopped, or that the captain answered with Start my first mate here again, ends the run with 75 as an update does, so its background starts it again here with nothing lost.
It says "Your first mate starts again here, so this run ends." and "Start it again if nothing starts it for you.", and records the stop as `restart`, so a window beside it shows its ordinary stop words, never an update's.

## A settings file

`<app> run --settings <file>` names a file of settings, so whatever starts the command also decides where programs are found (INF-1228's approved plan, piece 4: "With it, the app finds programs where the file says and asks no login shell").
Without one the run asks the person's login shell for its search path as its process starts, while the app's code loads (`askLoginShellEarly`, `captureLoginPath`, `docs/architecture.md` §17), and the core awaits that one answer, which needs a shell whose startup files answer, and nobody may be logged in to the account a boot entry starts.
The file is one JSON object, read once as the run starts, relative to where the command runs when it is not a full path:

```json
{ "path": ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] }
```

- **`path`** lists the folders where programs are, in the order they are searched, each a full path.
  Every child the core starts - a crewmate's shell, an install, git and Claude's client - searches the app's own git first, then these folders, then whatever the process path holds that they do not, so the system folders a starter sets stay behind them (`configureSettingsPath`, `src/core/hostEnv.ts`).
  Nothing is guessed: the installer folders the core adds to a shell's answer (`installerDirs`) count only when the file or the process path names them.
- **No login shell is asked**: neither the search path's question as the core starts nor the last rung of Claude's locator (`primeClaudeExecutable`).
  The run's output notes `[host-env] children search the settings path, <n> entries`.

`path` is the only setting; any other name refuses rather than being ignored, so a misspelled `paths` never starts a run that searches none of the folders it meant.
A file it cannot use ends the run before its core starts: it says "Infinitary could not use the settings file <file>: <reason>." and "Fix the file, then run this again." on its error output, keeps both lines as its last stop for `status`, and exits 78 (`EX_CONFIG`), so a starter can tell a file to fix from another failed start (`RUN_SETTINGS_EXIT`, `src/main/runCommand.ts`).
The reasons are a missing or unreadable file, a folder, text that is not JSON, anything but one object, a setting it does not know, no `path`, a `path` that is not a list of folders, and a folder that is not a full path or holds the separator (`readRunSettings`, `src/main/runSettings.ts`).
`--settings` with no file prints the usage and exits 2.
The file is the starter's, as the account and the start are: the app never writes it, and it holds no sign-in, since Claude signs in only where someone is logged in ("Not yet").

## Reading status

`<app> status` prints the command's status in words; `<app> status --json` prints one JSON object and exits without opening a window or starting the core (INF-1228's approved plan, piece 2).
It uses the same data-folder selection as `run`, including the installed release/development distinction and isolated development overrides, but creates no folder, takes no lock, performs no move and reads no database or credential.
It works on Linux without a display or Xvfb.
An ordinary result, running or stopped, exits 0; an unreadable record or unconfirmed lock holder exits 1, and any arguments other than the optional `--json` exit 2.

The JSON's `schemaVersion` is 1, `running` is true, false or null (unknown), `run` names the live command or is null, `lastStop` holds the last recorded stop or is null, `environment` holds the last command's dated reading or is null, and `problems` lists unreadable evidence.
This is the status of `run`, not a health check of the first mate, its subscriptions or its crew.
A live lock without a command marker answers unknown rather than guessing that the window is a command.
A command's marker left after its process disappeared or lost the lock reports an unrecorded stop, with null stop time and exit code; it never claims the preceding clean stop explains this one.
Where another process holds the lock meanwhile, as a window or a lock that names no holder, `running` is null, never stopped.
On Windows a marker that keeps its run's birth is read by it, as the window's startup reads it (`runIdentity`), so a program that took the number of a run that ended is not that run; the window beside a command reads the same, so it neither joins as if nothing ran nor as the owner of that run, and its Stop asks nothing of it.
A run whose birth Windows cannot read is not known to be the noted run: beside a held lock its status is unknown and it is nobody's own, so no window joins beside it, stops it alone or asks it to end by force.
Status then keeps the stop written before it, never one made up for that run; only once its exit is known, its number free or the lock let go, does a run that left its note in place show as ended unrecorded.
A marker from an earlier version keeps no birth and is read by its number alone.
The marker written by piece 1 remains readable, with no environment reading.
A fresh account has no last stop, and failures before a command owns the folder leave no new stop record.
Handled failures after it owns the folder retain their reason, including incompatible saved data and a missing core; updates retain exit 75.
An orderly quit retains exit 0; a signal delivered to Node also retains its name, while Electron's native quit path records a clean quit without inventing which signal caused it.

The environment is explicitly a snapshot **when the command started**, not a live probe of the running session:

- `display`: `own` when Linux starts Xvfb, `session` when the session names a display, `none` when Linux has neither, or `unknown` on macOS.
  A named display alone proves no drawing; INF-1416's check on a disposable Mac saw the hidden pages draw at boot with nobody logged in.
- `keychain`: on a Mac, the `locked`, `unlocked`, `absent` or `unknown` state of the account's own login Keychain, opened by its path under the home its user record names (`~/Library/Keychains/login.keychain-db`, `accountKeychainPath`), read silently through Security.framework's metadata-only `SecKeychainGetStatus` in a disposable utility process, never an item or a password.
  It never asks for the default Keychain: for a run outside the logged-in session, such as a system job, that is the Mac's own unlocked System Keychain while the account's stays locked (INF-1416's check on a disposable Mac).
  An unlocked Keychain promises no sign-in, and a lock changed after start does not change this dated reading.
  Isolated launches never touch the person's Keychain and record unknown; other systems record `not-applicable`, which makes no claim about Linux's separate keyring.
- `voice`: `unavailable`, since a run does not prepare voice.
- `notifications`: `unknown`, since delivery in that session has not been checked.

The status command itself never queries the Keychain or creates a display, so an SSH reader does not substitute its own session's capabilities for the command's.
`src/main/runStatus.ts` owns the command's output; `src/main/runCommand.ts` remains the one writer of its marker and stop record.

## A link by command

`<app> link` prints a one-use link another computer's Infinitary joins with at its first launch, and `<app> link --phone` prints a code the phone app scans, with the same link under it (INF-1228's approved plan, piece 3).
It asks the Infinitary running in this account, started by a command or with its window, so the link joins that app's first mate; it starts nothing, opens no window, takes no lock and works on Linux without a display.
It finds the data folder as `status` does, and asks at that folder's phone door with the door's key (`docs/devices.md`, "A phone that joins by its address"), so `DevicePairing` makes the link exactly as Settings -> Devices does: one use, ten minutes, and for a phone the addresses a phone reaches first.
The words above the link are the ones Settings -> Devices shows (`LINK_SAY`, `src/shared/devices.ts`), and the line under it says how long it works.
On Linux and Windows, when this computer's own firewall may keep the other computer out, it then prints what Settings -> Devices says of it, two lines and the one line to run, such as `sudo ufw allow 47623/tcp` (`firewallWords`; `docs/devices.md`, "A home's firewall"); a server started by a command has no window to show it.
The phone's code is drawn from the same modules as the one in Settings -> Devices (`phoneCodeModules`, `src/shared/phoneCode.ts`), in half blocks, black on white whatever the terminal's own colors, with the margin a camera needs.
`--json` prints one object instead, `schemaVersion` 1, `for` (`computer` or `phone`), `link` and `expiresAt`; it draws no code and reads no firewall.
A link prints with exit 0; any other word exits 2 with the usage.
With no link it exits 1 and says why on its error output:

| What it read | What it says |
| --- | --- |
| No door answers and no app holds the data folder | "Infinitary is not running here, as this user." and "Start it with infinitary run, or open it, then run this again." |
| An app holds the folder but no door answers, as an older app | "Infinitary is open here, but it did not answer this command." and "Quit it and start it again, then run this again." |
| This account's Infinitary controls a first mate on another computer (`docs/view.md`) | "Infinitary here controls your first mate on another computer." and "Make the link on that computer instead." |
| Pairing made no link, as when the saved device list is unreadable | "Infinitary here could not make a link: " and pairing's reason |

The link reaches this command's output alone: the door writes it to no log, and the command is this account's, as the door's key is.
`src/main/linkCommand.ts` owns the command and its words.

## Control from another computer

Another computer's Infinitary that joins a first mate a command started controls it as it controls any first mate (`docs/view.md`, "What the window asks"), and the same rule answers a view of a first mate with its window.
What is left to a command's own first mate is its window's absence:

- **Pages it would open.**
  Every page such a first mate would open in a browser goes to each computer that controls it as the push `inf:app:open-page` (`startCore`'s `startedByCommand`, `src/core/index.ts`), since nobody sits at its computer; `docs/view.md`, "Pages it would open", says what the view does with it.
  Google's sign-in page goes as `inf:app:sign-in-page` instead, so that computer can pass the browser's return back (`docs/view.md`, "A sign-in that returns to the first mate's computer").
- **General.**
  General leaves out that computer's Start at login, Dock, dictation and panels switch, which are set at its own window ("The window opened beside it" below), as on any view.
- **First launch.**
  Its first launch shows the subscription chips under the line `gateRunLine` makes: "Connect one for your first mate on Mac mini.
  It signs in from here."

## After an update

Every account on a computer runs the one installed app, so updating it in one account replaces the program a command runs in another.
Once a minute the run reads which file the installed program is - its device, inode and time, so a replaced file reads as another whatever its version says - and once it is another, it says "Infinitary here was updated, so this run ends." and "Start it again to run the new version.", stops as it does on a signal, and exits 75 (`EX_TEMPFAIL`), so a starter that starts it again only after a failure starts the new version too (`followInstalledProgram`, `src/main/runCommand.ts`).
The program is the app's executable, or the AppImage file its runtime names (`APPIMAGE`).
A program that cannot be read, as while an update moves the app into place, is read again a minute later.
A development run may stand in the program with `INFINITARY_RUN_PROGRAM` and how often it is read with `INFINITARY_RUN_PROGRAM_EVERY_MS`; an installed app reads neither.

An update the command's own first mate installs ends the same way (INF-3660's plan, the captain's answer update=window-installs): its updater saves the crew's work, replaces the program, and where the app with its window would start itself again, the command says the same two lines and exits 75, for whatever started it to start the new version (`endUpdated`, `src/main/app.ts`).
A command never starts itself again: it would come back as a window.
On Windows the installer runs only once the command has ended, and opens the new copy's window, which starts the command again (`docs/alpha.md`, "Updates on Windows").
On a Mac whose installed app updates itself, only a program in the person's own session can replace the copy, so the window opened beside the command installs it while the command holds the crew's saved work, and the command ends with 75 once the window says the copy is replaced (`docs/alpha.md`, "Saving work before an update").
A window that started the command lets its agent go then, so the agent does not start the old copy again before the installer replaces it, and the new copy's window starts the command.

## The window starts it

Opening Infinitary's window with no command running starts `<app> run` in the background and opens the window beside it, so the first mate never runs in the window's program (INF-1352's plan, piece 7, the captain's answer starter=login-agent: "The window sets it up in the background through the seam a work computer uses, so a crash restarts it and Start at login keeps it").
The window asks this account's own service manager, as a computer that runs work sets up `<app> work run` (`docs/helper.md`, "In the background"; `startRunAgent`, `src/core/helper/runAgent.ts`):

- **On a Mac** it loads an agent into this user's session, labelled `<bundle id>.run` (`.dev.run` for the local dev bundle and an isolated run from source, `runLabelOf`; `pnpm dev` on the person's own data takes the installed app's label).
  The agent runs `<app> run` at once, at the priority of an app the person started, starts it again after a failed exit and never after a clean one, and writes what the run says to `run.log` in the data folder (`runAgentPlist`).
  Its file is `run-agent.plist` in the data folder, which launchd never reads by itself, so the agent lasts until the person logs out.
- **On Linux** it starts the same user service `<app> start-at-boot` writes, writing it first where none is ("Starting at boot" below).
- **On Windows** it registers the same Task Scheduler task `<app> start-at-boot` registers, with its sign-in trigger off until Start at login turns it on, and asks Task Scheduler to run it now ("On Windows" below).

Each start writes the Mac agent's file anew, so it starts the program this window is, keeping the settings file and log a `start-at-boot` agent names (`macAgentKept`).
On Linux each start writes the service again wherever it differs from the one this window would write, such as a moved program or another data folder's settings, keeping the settings file a `start-at-boot` service names.
The window then opens beside the command as below, and waits with no notice for it to welcome the window, for as long as it would wait for a start entry; an earlier command's stop on record is not this one's.
Where the command cannot start - no service manager, no login session to give it to, or the service manager refused it - the window lets the agent go and runs its first mate itself, as it always did.
It starts no command for a data folder named with Chromium's `--user-data-dir` switch, for an installed app whose home is pinned away from the account's own (macOS's `CFFIXED_USER_HOME`, or a `HOME` naming another folder), since its agent carries no settings and the service manager starts the run with the account's own home, so that run would open another data folder, while a move of the folder is due, for a folder the app refuses, for an app that joined another computer, beside a system job an earlier version had an administrator put in a Mac's `/Library/LaunchDaemons`, which starts the run itself, or after the person chose Start it here on a command that could not start.
A development run, `pnpm dev` and every journey among them, starts one only with `INFINITARY_WINDOW_STARTS_RUN=1`, so it keeps the window's own first mate and runs the code it was started from; a journey that sets it also names a stand-in service manager.
An installed app reads neither, and never starts one for an isolated data folder.

**Start at login** starts the command, not the window: while the window stands beside a command it can start, the switch moves the Mac agent's file into `~/Library/LaunchAgents`, which launchd reads at every login, and back, gives the Linux service the link its user's login reads, or turns the Windows task's sign-in trigger on and off (`setRunAgentAtLogin`).
On a Mac the file in `~/Library/LaunchAgents` is the agent `start-at-boot` writes too, so the switch reads it as on, and turning the switch off moves that agent into the data folder, as the Linux service is one for both.
A login item the window had before moves to the command the first time the window starts beside it, and the window's own is turned off.

**Joining another computer** from beside the command: the command's first mate is this computer's own, so joining stops it and lets the agent go, its files and the Linux service with it, and the window becomes a view of the other computer (`Shell.join`, `src/main/shell.ts`).
It is offered only while the command running is the one the window's agent started, and stops that run, and on a Mac or Linux the agent's job with any run it started again meanwhile, never a run started by hand; beside a command started by hand it is not offered (`docs/view.md`, "Following along").
While no command runs, and none the window started or restarted is still waiting to welcome it, the shell accepts a pasted link's join as well, though the window shows its stopped notice then rather than the first-launch group: it starts no command, lets the agent go with no stop file or signal, so only a run its own Mac or Linux job started meanwhile ends with that job, and a command started by hand meanwhile keeps going; joining by its address and following along wait for the command the window starts (`joinTarget`'s `owned: null`, `followsAdded`'s `pastes`).
Joining by its address works there too, as an installed app's first launch offers it (INF-1827, INF-4935): the command's first mate keeps this computer's SSH trust and Infinitary's own key, so the window asks it each step with `inf:devices:link-at`, and it signs in to the other computer and answers the link to the window's program alone, never its page (`BesideWindow.linkAt`, `PROGRAM_ONLY_CHANNELS`).
The window then joins with the held link as a pasted one joins, stopping the command as above.
A command from before that request does not list the `join-by-address-beside` change, and the window says it could not ask that computer for a link.
Beside a boot entry the window did not set up, which would start the command again at the next boot, joining is refused, by its link or its address.

## Quit and Stop

Quitting the window closes only the window: the command's first mate and crew keep working (the captain's answer quit=window-only).
Settings -> General says so beside the window, as its first row, and offers Stop, which the person presses twice, as Purge (`StopCommandRow`, `src/renderer/src/settings/GeneralTab.tsx`; `inf:app:stop-command`).
Stop signals the command as a terminal's stop does, so it stops its crew cleanly and exits 0, and neither the agent nor the service starts it again (`stopRunningCommand`, `src/main/runCommand.ts`).
The window then shows its notice, and Start it here starts the command again through the service manager; opening Infinitary again starts it too.
The window says it stands beside a command as `byCommand` on what this app is (`inf:devices:this-mac`).

## The window opened beside it

Opening Infinitary's window in the same account while the command runs opens the window as a view of the command's first mate, over its local door (INF-1352's plan, piece 6, the captain's answer window_joins=join, which reverses INF-1228's "It says a command started Infinitary here, and quits").
The window asks before it asks for the single-instance lock, since a process the lock refused never becomes ready: `run.json` names a live process that holds Chromium's lock, which on a Mac and on Linux is a link naming its holder (`SingletonLock`, `<host>-<pid>`), and on Windows a file, `lockfile`, its holder keeps open for writing, so it says only that some program holds it (`runningByCommand`, `lockHolder`).
A note a crashed run left names a process that is gone or holds no lock, so the window starts the command as above, or, where it cannot, opens with its own first mate unless a start entry is about to start the command again ("When the command stops" below).

One rule splits the work between the two programs (INF-3660's plan and the captain's answers on it): the first mate keeps the settings, the records and the crew, and only this computer's window touches the desktop.
The first mate stores each setting once and tells the window, the window applies it to its own program, and the command's program applies nothing to a window (`BesideWindow`, `src/main/besideWindow.ts`; `startCore`'s `startedByCommand`, `src/core/index.ts`).

- **No first mate of its own.**
  The window's process starts no core, connection or scheduler: every core request goes to the command's first mate through its local door, as the captain, and every push comes back the same way, as for the window of a first mate it runs itself (`docs/view.md`, "The window on the first mate's own computer"; `BesideMode`, `src/main/shell.ts`).
  It is this computer's own window, not a device: it has no row in Settings -> Devices and nothing to leave.
- **Drawn before the first welcome.**
  The window is made at once, drawn with the look it keeps, while the command's first mate is still starting, instead of after its welcome (`BesideWindow.start`).
  What the window asks the first mate before that welcome, a message typed meanwhile among them, waits and goes in the order it was asked once the welcome was read and the window said it is here (`held`).
  A first mate that never welcomes it leaves the window under its notice ("When the command stops" below), and what waited is refused as out of reach, so a message waiting comes back to the message box.
- **A browser profile of its own.**
  Two programs cannot share one browser profile, so the window keeps its own in `window-profile` inside the data folder and holds its single-instance lock there, so a second launch brings the same window forward and only one window opens beside a command (`windowProfileDir`, `src/main/runCommand.ts`).
- **The look and the keys follow the first mate's** (look_here=follow).
  The window draws with the first mate's theme, size, wash and panel layout and installs its keys, on this computer only: it reads them at each welcome and follows every `inf:shell:preferences` after, so a change the first mate makes itself reaches the window (`ViewLook.follow`, `src/main/view/viewLook.ts`).
  A change made in this window's Settings goes to the first mate, which keeps it; changed keys go with `inf:settings:keys:set` and are read with `inf:settings:keys:get`.
  The window keeps a copy in its profile's `look` folder, which it draws with before the first mate answers and while the command is down.
  A view on another computer keeps its own look and keys, as before.
- **Show in Dock and Start at login** (dock=split).
  Show in Dock is the first mate's setting: the window applies it to its own program at each welcome and whenever the first mate says it changed (`inf:presence:dock`), and the command's own Dock call does nothing.
  Start at login is the system's setting for what starts at login, so the window reads and changes it - the command's agent or service where the window can start the command, otherwise its own login item: the first mate asks the window (`inf:own-window:ask`, answered with `inf:own-window:answer`; `OwnWindow`, `src/core/ownWindow.ts`), whether Settings here asked or the first mate did on the captain's words.
  With no window open the first mate answers what the data folder last remembered (`start-at-login.json`) and refuses a change in plain words (`OWN_WINDOW_WORDS`, `src/shared/ownWindow.ts`).
- **Notifications** (notifications=window).
  The window posts the first mate's card-worthy moments to this computer's Notification Center, as a view on another computer posts them (`ViewNotices`, `src/main/view/viewNotices.ts`; `docs/view.md`, "Notifications").
  The command's program never posts, so nothing posts here while no window is open.
- **What only a window can do** (extras=same-piece).
  A page of a task's browser that asks for a file gets this window's file picker, and with no window open it gets no file, as when the captain chooses none.
  The window tells the first mate when it comes to the front, which refreshes a stale reading of the plan's allowance (`inf:own-window:focused`), and when dictation's first-use microphone step is done (`inf:voice:primed`).
  It also says when it comes to the front and when it leaves it (`inf:window:front`), and again at each welcome while in front: the first mate's program has no window of its own, so this is how its phone sender knows the captain is at the window and pushes no card meanwhile (`docs/phone-push.md`, "When the computer sends").
  The first mate forgets it when the window's connection drops.
  A runbook's folder opens here: the window asks the first mate which folder (`inf:runbooks:folder`) and opens it itself.
  The first mate makes a built-in's read-only copy in its own program's temporary folder (`HostCapabilities.temporaryDir`).
- **Who may ask.**
  The window says it is open on its own connection (`inf:own-window:here`) at each welcome, and the first mate forgets it when that connection drops.
  These requests are `reach: "home"`, so no paired computer asks them (`src/shared/channels/ownWindow.ts`).
- **Panels.**
  The captain's panels draw in this window as in every window (`docs/view.md`, "Panels in every window").
- **Pictures and dictation.**
  Card pictures are read from the first mate's folder on this computer, and dictation follows the first mate's switch, wherever it is turned, with the voice models in the data folder.
- **Pages it opens.**
  A first mate started by a command opens no page itself and sends each to the computers that control it, so the window opens each one here, a sign-in's included, whose browser comes back to the command's own port on this computer.
- **Before the door opens.**
  A window opened as the command starts may come before its door: it dials until the door opens and then reads everything.
- **Its update.**
  Where the command can replace the program, its own updater is the only one: the window's update notice and its buttons are the first mate's, asked over the door.
  On a Mac whose installed app updates itself the window installs it for the command ("After an update" above).
  A window that finds its own program replaced when the command welcomes it again starts again on the new copy.

## When the command stops

Once the command no longer runs, the window says so over itself and never starts a first mate by itself (the captain's answer restart=wait-for-entry: "Wait for the start entry when one is in place, then offer it; offer it at once when none will restart the run").
While the first mate is out of reach the window reads the command's own records once a second (`readRunStatus`, `src/main/runStatus.ts`): a note that names a live command means the window is only connecting again, and records it cannot read are never a stop.

- **How it ended.**
  The command records why it stopped only on a clean stop, so a stop record that names another command than the one the window joined, by its process and start time, means the joined one left none: it crashed (`runEnd`, `src/main/besideRun.ts`).
- **Waiting for the start entry.**
  Where the start entry the app wrote is in place - the user's systemd service on Linux, the agent the window loaded or `start-at-boot` wrote on a Mac, or a system job an administrator put in place there for an earlier version (`startEntryInPlace`, `src/main/startAtBoot.ts`) - and it starts the command again after that end, the notice says the window waits for it and offers only Quit (`entryRestarts`: after a crash or a failed exit such as an update's 75, never after a clean stop, and on Linux never after 78).
  The wait is the entry's own ten seconds plus the ten seconds a window allows a command to welcome it, counted from the command's own record of its stop, or from when the window first saw it gone where it left none; after it the notice offers Start it here (`entryWaitMs`).
  A start entry a person wrote by hand is not recognised, so the notice offers Start it here at once.
- **Start it here.**
  Where no entry will start it again, the notice offers Start it here beside Quit at once.
  Where the window can start the command it starts it again through the service manager and waits for it as above; otherwise, or where the command could not start, it starts the app again as this computer's own first mate (`--start-here`), which takes the data folder's lock as every start does, and only while the records still say no command runs.
  That start notes which ended command the person answered (`run-started-here.json` in the data folder), so no later launch waits for that same end again.
- **The notice.**
  It covers the whole window; Escape does not close it, Tab moves between its buttons, and Quit is always there (`CommandStopped`, `src/renderer/src/devices/CommandStopped.tsx`; the design skill's `components/devices/CommandStopped.prompt.md`).
  Its words say "started by a command" and how it ended (`COMMAND_NOTICE_WORDS`, `src/shared/commandNotice.ts`), and the window hears it as `command` on what this app is (`inf:devices:this-mac`).
  Beside the program the window started itself, where the person never ran a command, the notice carries `byWindow` and its line speaks of their first mate instead, from the message catalog; a command the person set up keeps the words above.
- **A command that runs and does not answer** (INF-4622).
  A command that is alive but never opens its door, or welcomes the window and never answers its first asks, would otherwise leave the window waiting with no end and no word why; after an update a person saw no window at all, back when the window drew only after its first answers.
  Once a running command has stayed out of reach for thirty seconds past the window's own wait to join, or has not answered the asks of a welcome for thirty seconds, the window stops waiting for it, draws from the copy of the look it keeps, and the notice says Infinitary is not answering, with Start it here beside Quit (`not-answering`, `BesideWindow.firstAnswers`).
  The wait for a welcome's answers belongs to the connection it came on, so the notice still comes when the command's records could not be read at the welcome and come back during the wait.
  The notice is about the run behind that connection, as its local door named it, so its buttons never end a run that took the folder since.
  A door from an earlier version names no run, so its notice names none: it offers no Restart it, and its Start it here stops nothing, so the app starting again finds the folder held and joins whichever run holds it again; its words say so, that Start it here connects to it again (`retries`).
  A notice that went up while the records could not be read cannot say whose run it is; the window reads them again once a second, and once they read, the notice for that same run offers Restart it where the window's own agent started it.
  Where the silent run is the one the window's own agent started, as the same reading of the records says (`ownedRunOf`), and its note says a force stop can end it (`recovers`, written once its reading thread has said it read the folder `run-force/`, which the run makes on every platform, not merely that it started, and taken back while its readings of it fail, and on a Mac or Linux taken back too once the pipe its helper holds is no longer the one at its path, looked at as often as the folder is read whether or not a reading failed, and given again only while it is, so a folder made again since, or the pipe alone taken away, never gives it back, and, on a Mac or Linux, its helper below has said it is ready, holding the pipe in a group the run leads; on Windows only where the run wrote its birth; and taken back should either of them fail later), the notice is the window's own (`byWindow`) and offers Restart it first (`inf:app:restart-command`, `BesideWindow.restartCommand`): the starter has the run end itself by force, since one that does not answer may never act on a polite stop, and once no program runs under its number asks its service manager to start the job as at a login (`restartRunAgent`: launchd's `kickstart` without `-k`, systemd's `start`, or Task Scheduler's `/Run`), each of which starts nothing where the job already runs, so a run the job started again meanwhile is never ended.
  The window waits under the notice that its first mate is starting again, joins the command that comes back, and offers Restart it again should that one not answer either.
  Until the owned run's note says so, the window reads the records again once a second and the notice offers Start it here alone; while the notice is up it keeps reading them once a second, so a note that stops saying it takes Restart it away from a notice already shown.
  The starter reads the note again as it acts, and asks no force stop of a run whose note no longer says one can end it.
  Start it here stops that command first, its notice saying the first mate is being stopped and that the window starts it here once it has, with only Quit to press meanwhile: where the notice is the window's own the run ends itself by force through the starter, and the service manager is asked nothing, so a run its job started again meanwhile keeps going and is joined; otherwise, for a run started by hand, the run is asked to stop by `run-stop-for.json` as above; either way the window waits, as long as a command waits for a stopped run, until that run let the folder go.
  Once it has, the app starts again as this computer's own first mate.
  Only after a force stop of its own agent's run, and only once it holds the folder's own lock, never a folder move's throwaway one, and its folder and saved data are accepted, does that window let the job go, so the job does not keep starting a run the folder refuses (`app.ts`, `--let-go-job`); the starter's agent stays in place, so a later launch starts the command again as before, and a job the service manager would not stop is said in the window's log while the window goes on as this computer's first mate.
  Where the agent's job started its run again before that window took the folder, or takes it just after, the window opens beside that run as its own, with its starter, and neither starts nor stops it: one reading of the run's note decides both that a run holds the folder and that it is the agent's own, and whether a grant waiting keeps the starter (`keepsStarterBesideGrant`).
  A run notes that it holds the folder in the same step as it takes the app's single-instance lock, clearing its temporary folder only after, so a window refused that lock starts again beside the run once the note is there, and starts again on its own once the lock is let go, as by a run that ended before it noted anything (`lockHolderKind`).
  On Windows, whose lock names no holder, a note that keeps the run's birth is read by it, so a run that ended without taking its note away, its number taken since, is no command holding the folder and never the agent's; a note from an earlier version keeps no birth and is read by its number alone.
  Every window launch on the folder's own lock that opens beside no run, never a folder move's throwaway one, asks whoever holds the lock to answer as Start it here does (below), since a run may hold the lock before it notes itself, and ignores a second launch.
  A note whose run's birth cannot be read while the lock is held may be a window's lock beside a stale note, so a launch takes the holder for neither: it keeps its starter, opens beside nothing yet, and starts again beside the run once the run is known to hold the folder, as the agent's own where its birth then reads so.
  It quits only where a window holds the lock, which it knows from that window's answer or from what the holder runs as: the launch asks the holder to answer with a word of its own (`windowAnswers`), a window writes `window-answer-<word>` in the data folder only once one of its windows a person uses is there, restoring it where it was minimized, a refusal page shown in place of the main window included, never counting a window the app draws a panel's picture in or holds hidden, opening one again on a Mac whose app outlived its last main window, and a run never does; a write that fails is tried again once a second without bringing the window forward again.
  An answer is read before anything else, a run's note and a lock that can be taken included, and once more as the launch takes the lock, so a window the person quit just after it answered stays quit and the launch quits too.
  The ask carries the launch's process, and the window takes away, as it quits, the answers it wrote whose launch is gone, as one that told the window from what it runs as and quit before the answer came; an answer whose launch is still there stays for that launch to read and take away, so a window quitting just after it answered never leaves the launch to take the folder it just gave up (`clearWindowAnswers`).
  A window from before windows answered (as one still open across an update) brings itself forward at the ask and never answers, so the launch reads what the holder its ask reached runs as (`holderIsWindow`).
  On a Mac and on Linux that is the words the holder the lock names runs with, read as a launch reads its own (`windowByWords`): a command is one they start as `run`, after any switches, whatever its version.
  On Linux they are read exactly, from `/proc`, so any other words are a window's, and only where the holder runs from a program of this one's name (`/proc`'s `exe`): a source Electron beside the packaged app starts its words another way, so its words are not known.
  On a Mac they come from `ps`, only where they start with this program's own path, joined with spaces, so a word of a switch's value may look like `run`; a real `run` always stays a word of its own, so words with no `run` among them are a window's and any others are not known.
  On a Windows PC, whose lock names no holder, a command holds a pipe of its own, named from the folder, from once it holds the lock until it ends, so a command refused the lock never holds it, never during a folder move or on a folder it refuses, so a holder with that pipe is a command (`commandPipe`); a pipe is no file in the folder and goes with its program, so a command that ended leaves nothing behind.
  A holder with no such pipe is not known, since a command from before that pipe, or one that could not hold it, holds none either: it is waited for until it answers, notes itself or lets the lock go.
  A holder that still shows nothing when it is read again, as a window from before windows answered, or one never shown to be a command that lets the lock go, read once or not yet, as such a window on a Windows PC quit before its pipe was read, or one that took the lock after the launch's read and refused its ask unseen, has the launch ask the person once whether to open Infinitary here once it closes, or leave it (the default); Leave it quits the launch at once.
  A holder shown to be a command that lets the lock go asks the person nothing, and the launch starts again; another holder seen in its place, by another process number or, on Windows, its pipe gone while the lock stays held, was never read, so one that lets the lock go before the launch reads it has the person asked too.
  Electron never becomes ready in a launch refused the lock before it was ready, as every window launch asks for it, so the launch shows no box itself: a copy of the program started for that one word shows it and says which button was pressed, asking for no lock on the data folder and using a profile of its own kept in it (`askPersonWord`, `src/main/personWord.ts`).
  That profile is a folder the launch made in the data folder under a name no one else chose (`word-profile-` and six random letters, `wordProfileIn`), with the copy's temporary folder inside it (`TEMP`, `TMP` and `TMPDIR`, which a Mac and Linux read first), apart from the private temporary folder a window or run clears at its start, so the copy's temporary files have a place from its start and keep it.
  A record beside it in the data folder, `word-profile.json` (`WORD_RECORDS`, `src/shared/wordProfiles.ts`), names that profile, and is the app's evidence the profile is its own.
  The launch makes the profile and its temporary folder with no access for anyone else, which on Windows is the data folder's owner-only list handed down to what is made in it, and writes the record whole under a name of its own before renaming it into place.
  It uses a recorded profile again only where it is still a real folder of this account's alone (not a link; away from Windows owned by this account with no access for anyone else by its mode), as is the temporary folder in it.
  Before it starts the copy it reads both folders' access lists too, which modes do not show (`keptToOwner`): on Windows each must be read whole, let in no one but this account and hand that down to every file and folder made in it; on a Mac neither may carry an entry that allows anyone anything; one that does, or one it cannot read, starts no copy, and the word counts as not shown.
  A folder no record names, even a private one under a profile's name, is never used or written in; one a record names that is gone or no longer private is left as it is, and the launch makes a new profile and records that one instead.
  Anything at a record's name the launch did not write - a link, a folder, a file of another account's, or one holding anything but the name of a profile - is left exactly as it is, never read into, changed or given other access, and the launch tries the next name (`word-profile-2.json`, then `word-profile-3.json`); where all three hold something else it starts no copy.
  The profile is kept and used again by every later word, so the app never moves or removes it, nor anything else there: what it changes is only what it made in its own data folder.
  The copy's first act is to take its profile for itself alone with Electron's own lock on a profile, the one a window takes on its data folder (`claimWordProfile`, which refuses a profile whose name the app does not make); a copy that finds its profile held by another word's copy shows nothing and says so.
  The launch then asks its question again through the profile the next record names, making and recording one there as above, so two launches refused at once each show the person their own Leave it or Open here; where every record's profile is held, or the word is the Dock word, which says nothing the word already up does not, the launch says the word in its own output.
  So that one launch's next word never meets its previous word's copy, a launch asks its words in turn (`oneWordAtATime`): a word taken away answers only once its copy has ended and let the profile go, and the next word is asked only then, and only if it is still wanted; two separate launches asking at once use a profile each, as above.
  A folder move carries the profile, its record and anything the copy left in them into the moved folder as it is, never counts them as saved work and never copies an older folder's into it (`isWordState`, `docs/saved-data-compatibility.md`); a copy that runs while the folder is set aside may then show nothing.
  On Windows the launch keeps that profile only where its data folder was kept private (`docs/windows-private-files.md`); a folder refused, or never judged, makes none, and the word counts as not shown.
  The copy starts as the launch did, on Linux from its AppImage file only where the launch runs from that file's mount (`readLinuxInstallation`), never from an `APPIMAGE` it only inherited, and on a Mac keeps out of the Dock, so the Infinitary the word names there is the only one to click.
  The launch holds the copy's input open while it lives, so the copy and its box end when the launch takes the word away, ends or dies, even where the launch could not end the copy itself.
  On Windows, where Electron gives a program no input to read, the copy instead looks every half second for the launch by the process number it was started with (`endWithRequesterGone`) and ends once that launch is gone.
  Only a press the copy said in full, of a button its box has, and ended on cleanly counts, past the empty lines Electron on Windows writes to a program's output of its own; a copy that could not be made, started or show its box, that crashed, or that said anything else counts as a word not shown, and the launch says the word in its own output.
  The word is in the language a launch speaks at its start, before any choice in Settings is read (`docs/i18n.md`); a check's hidden launch starts no copy and says its words in its output, and a question that is not shown on purpose leaves the launch to open here once the folder is free, while one that could not be shown is answered as Leave it.
  A lock let go while that question is up waits for the person's answer, since a window quit on purpose and a command that ended look the same, so a window the person quits stays quit; the launch lets go of the lock it took to read it free before it waits, and one that opens here starts again and reads the folder afresh.
  While the question is up the launch keeps watching the folder without taking its lock: a window that answers or a run that notes itself takes the question away and ends the launch as it would have, and a holder it sees take the lock is watched as the first one was, asked once and told apart by what it shows, its pipe and its words included, so a window that takes over answers or is told by its words; where the lock names no holder (Windows), one holder that follows another with no free moment between them is not seen.
  Open here acts on the folder as it is then: free, the launch starts again; held, it watches that holder first.
  A holder that shows it is a window quits the launch at once: its ask brought that window forward, as every version's second launch does.
  A Mac app from before windows answered that outlived its last window opens nothing at the ask, so a launch that told it by its words says that Infinitary is already open and to click it in the Dock before it quits, unless a window's answer by then confirms it (`endRefusedLaunch`, `src/main/runReopen.ts`).
  The launch sends that window nothing: macOS reaches one process of several only with the person's consent to control the app, and its open of the app's bundle may reach another running copy, or start one where none runs, so it could reopen a copy the person quit.
  That word is made only when it is shown, and taken away once a window answers or the holder lets the folder go, so it never stays up after the window it names answered or quit.
  How the word ended is read when it closes, as before it is made: a window's answer ends the launch; that holder gone, as a window the person quit, with the folder left free starts nothing, so a window quit stays quit; gone with the folder taken by another program, the launch watches that holder as the first one, asked once and told apart by what it shows.
  A window's answer is read again before each of these ends, so one that comes late still has the launch start nothing and tell the person nothing of the Dock.
  The person's Leave it ends the watch of the folder at once, even while a read of the holder is under way, so the launch asks and tells nothing after it; a question the launch takes away before it shows makes no window and brings nothing to the front.
  The launch writes no note of its own in the folder before it holds the lock; what any launch writes there before then, such as Start it here's note, is unchanged.
  What the holder runs as is read once, and again a while later only where it could not be told, or, each second, where the lock names no holder, which may have changed unseen.
  A holder that shows nothing yet is waited for with no window and no time limit; the launch asks for the lock again only when the holder it sees changes, before it takes anything that new holder shows, so the window that takes over was always asked and brought its window forward; a holder seen unchanged is only watched, never asked again, so a window from before windows answered is not brought forward a second time.
  A lock read free is asked for at each look, since no holder is there to bring forward, so a holder that refused the launch's own ask and ended before the first look leaves the launch nothing to wait for.
  Where the lock names no holder, a holder that shows something other than it showed before, as a command's pipe gone, is a holder that changed unseen and is asked once too.
  A run that did not let the folder go in time is never joined again in place of starting here: the notice comes back with Start it here to press again.
  Until then, nothing else is sent: a second press, Restart it and a join are refused, and a welcome or answer that arrives meanwhile keeps the waiting notice up while the stop can still act.
  Both buttons name the run by its process and start, and the starter or Stop reads the run's record again as it acts: where another run holds the folder, or none does, nothing is ended and the window joins again (`restartRunAgent`, `stopRunAgent`'s `force`, `stopRunningCommand`'s `only`).
  The service managers - launchd, systemd and Task Scheduler - end whichever run their job holds by then, and a signal or Windows' own end goes to whichever program holds a process number by then, so neither ends the run: the run ends itself (`endRunByForce`, `src/core/helper/runForce.ts`).
  Each force stop is a file of its own attempt in the folder's `run-force/` (`<attempt>.json`), naming the run by its process and start and carrying the end of the starter's wait; no attempt moves another's file, so overlapping attempts never cancel each other.
  Every run its own agent started reads that folder once a second, on a thread of its own that a stuck first mate does not hold up, and claims each stop naming it by moving it to `<attempt>.taken`, which only one of that claim and its asker's withdrawal can do (`watchRunForce`); no program that took its number reads it, a run that already ended cannot, and a run started by hand reads nothing; a reading that cannot start or fails ends only itself, never its run.
  Only then does the run read the claimed stop's own time: within it, the run commits to it by moving it to `<attempt>.ended`, which the asker's withdrawal can still beat, and only once that move won ends its own process; past it, as for a reading held up until after the wait or a stop left behind by a window that quit, the run declines it (`<attempt>.declined`) and goes on, so a stop first claimed after its time never acts.
  The starter asks that only while the record names the run as its agent's, and calls it ended only once no program runs under the run's number, or, on a Mac or Linux, once nothing holds the run's lifetime pipe any more, which a program that took the number since cannot hold.
  The run makes that pipe in `run-force/` (`life-<pid>-<start>`) beside its helper's, holds it open from the moment its helper's pipe is made until its process ends, never closing it itself, even after its reading and helper ended, and nothing ever writes to it; the starter opens it once, only as the file it was found as, and reads through it until the stop is answered, so the run's end is told even once the pipe is taken from the folder, and never while the run is still finishing after its reading stopped.
  The starter never reads the helper's own pipe, so a line it writes there stays for the helper however late the helper reads it.
  Another file in a pipe's place, a pipe included, is not the run's and is never opened, and a pipe the starter could not open tells nothing either way and is never read as the run held when the stop is asked.
  The run notes the two pipes as the files they are (`pipes`) in its record with `recovers`, and the starter asks, wakes and reads only those: pipes found at their names that are other files, as where something took their place before the press, are no run's, and nothing is asked even while the record still says a force stop can end it.
  A run no longer there at the press, as where another program holds its number by then, is left alone with no stop written: on a Mac or Linux the starter looks for the run's pipes before it reads the record, so a run whose pipes are not there, gone since, not those it noted, held by no one, or whose holding cannot be told, is told as gone before any stop is written, never as one that ended after it: a run that says a force stop can end it holds its pipes, so no pipe is no proof that the named run is still there.
  A run whose whole process is held, as a fully frozen first mate's, has its thread held too, so it is let go on, which ends nothing.
  On a Mac or Linux the run's own helper does that: a shell the run starts in its own process group, waiting at no cost on a pipe the run holds open in `run-force/` (`wake-<pid>-<start>`), which the starter writes a line to once a second while it waits, only once the file it opens there is the pipe it found, so another file in its place receives nothing; at each line, where the run committed to a stop, or a stop names exactly that run by its process and start and, read as the helper acts, has at least a whole second of its time left, the helper sends the continue signal to the run's process alone, so another program in its group, stopped on purpose, stays stopped.
  The run's number cannot pass to another program while it leads a process group with a member alive, and the helper is one, so the signal reaches only the run; the helper does nothing unless the run leads its own group, as a service manager starts one, ends when the run ends and closes the pipe, and the window itself signals no process.
  On Windows the starter does it, only through a handle to the program whose birth Windows keeps as the one the run wrote in its record (`wakeRun`), so a later program under its number is never touched, and a run that wrote none is left as it is.
  Either way the starter asks for a wake only for a committed stop or one with a whole wake interval of its time left, so a stop past its time never lets a held run go on.
  On Windows the starter also tells the run gone by that birth, never by its number alone, so a program that took the number since does not keep the stop waiting (`windowsRunHolds`).
  Where the run still runs when the wait is over and has not committed to the stop, the starter takes the stop back by moving its file aside, pending or claimed; where that move wins, or the run declined the stop, the stop never acts and the run is reported as still running (`withdrawn`): a program that took the number since, or a run whose whole process stayed held.
  A stop none of whose files is there any more past its time, as where `run-force/` was removed and made again, is not known to be withdrawn: the run may have committed it just before, and ends on it once it goes on, so the starter waits until the run is gone and calls it gone, and nothing is woken for it once its file is gone.
  A stop the starter once saw committed stays committed, its file there or not: the run is waited for until it is gone and called ended.
  Where the run committed to the stop, the starter waits until the run is gone, however long that takes, and only then answers: Restart it keeps the window waiting under its notice and Start it here keeps its own wait, neither offering a button or a join, and on Windows a run that ended so is started again once, as Task Scheduler never does by itself.
  The run is called ended by its stop (`ended`) only where it committed to the stop and is gone; one that ended on its own before it committed, or after declining the stop, is gone (`gone`), which Restart it starts again after as well.
  Only a force stop that ended the run lets the window starting here retire the job (`--let-go-job`); a run gone before the press or on its own, or a stop withdrawn, leave the job as it is.
  The attempt's files go once its end is known, and one that cannot be removed changes nothing of what the starter answers.
  A run whose reading or helper cannot make, read or remove its files goes on as before, starting and stopping as it would, with no force stop offered.
  Otherwise the starter ends and starts nothing and answers so (`untouched`), and the window stands as it did before the press: a first mate that answered or welcomed it meanwhile keeps that answer or its own wait, and otherwise the notice comes back, naming the run while it still holds the folder; one that took the folder since is named by nobody's silence, so that notice stops nothing, and while the window is still connected no reading of the records times the run there; a restart that was tried and did not complete (`failed`) keeps its notice as above.
  A command that answers after all takes the notice down, and the window starts its pages over.
  This reaches only a window that opened: on a Mac a click on the app in the Dock or Finder goes to the running command, which shares the app's identity and opens the window itself, so a command whose main thread is stuck opens no window and no notice shows; giving the command an identity of its own is separate work.
  The command itself reads each project's folder against where the project lives in the background, never before its door opens (`ProjectChanges.inspectAll`, `src/core/index.ts`).
- **When the command is back.**
  The command's welcome takes the notice down; a window that stood under it starts its pages over and reads everything from the command that came back.
- **Opened between two starts.**
  A window opened while no command runs, where the entry in place is still expected to start one again after how the last one ended, opens as the window beside the command to come, straight under the waiting notice, and starts no first mate of its own (`betweenStops`).
  Where the rule would offer Start it here at once - no entry in place, an end it does not start again, an entry that already had its time since the recorded stop, or an end the person already answered with Start it here - the app opens as this computer's own first mate, as it always did.
- **A door that no longer takes the window's key** starts the app again, which reads the door anew.
- The app never starts itself again on its own - for that door, a command back on a replaced program or a moved folder - while Restart it or Start it here can still act; it does once that settled, and Start it here's own start again carries it.
- A launch with an isolated data folder quits where the app would start itself again, for whatever started it; a development one notes the words it would start with in the file `INFINITARY_RELAUNCH_NOTE` names.
- A development run may stand in the start entry with a file named by `INFINITARY_RUN_START_ENTRY` and its wait with `INFINITARY_RUN_RESTART_WAIT_MS`, and the wait for a running command to answer with `INFINITARY_RUN_ANSWER_WAIT_MS`, and a development run's command holds its note back while the file `INFINITARY_RUN_NOTE_HOLD` names is there, and its core's start while the file `INFINITARY_RUN_START_HOLD` names is there, and its started core's return to the startup while the file `INFINITARY_RUN_STARTED_HOLD` names is there, each writing that name with `.reached` after it once held and with `.stopping` after it once a stop was taken while it holds; a development window answers no launch, as one from before windows answered, with `INFINITARY_ANSWERS_NO_LAUNCH` set to 1; an installed app reads none of them.

## Starting at boot

`<app> start-at-boot` sets the usual start at boot up for this account: on Linux it writes what the account may and prints the one line an administrator runs (INF-1228's approved plan, piece 7, the captain's answer boot=both; piece 5 of INF-1352's plan), and on a Mac it needs no administrator (INF-1659).
On Linux it writes this user's own systemd service, `<bundle id>.run.service` (`.dev.run` for the local dev bundle and an isolated run from source, `runLabelOf`, `src/shared/codeNames.ts`) in `~/.config/systemd/user` (or `$XDG_CONFIG_HOME`), and the link in `default.target.wants` that `systemctl --user enable` makes, so the user's systemd starts `<app> run` at their login (`bootUnit`, `src/core/helper/background.ts`).
Its command names Chromium's X11 platform (`--ozone-platform=x11` before `run`), as the work mode's does (`docs/helper.md`, "In the background"), so the run draws on its own display whatever session the user's systemd describes.
To start it at boot with nobody logged in, the user must linger: it asks `loginctl enable-linger --no-ask-password <user>`, which systemd allows some accounts, and otherwise prints "To start it whenever this computer starts, before anyone logs in, an administrator runs this once:" and `sudo loginctl enable-linger <user>`, the line the Linux join prints (`afterLogout`, `docs/devices.md`).
The service starts the run again ten seconds after a failure, so an update's exit 75 runs the new version, but not after a clean stop (0) or a settings file to fix (78, `RestartPreventExitStatus`); what the run says goes to the user's journal (`journalctl --user -u <label>.service`), which the command names.
It starts the service now, unless another Infinitary holds the data folder (the window, or a run started by hand): then it says the service starts the next time instead, so it never fails beside it; a run of the service itself restarts with the new file.
`--settings <file>` names a settings file ("A settings file" above) for the service's run, by its full path; a file it cannot use is said now with the run's own words and exit 78, and nothing is written.
`--off` takes the service and its link away and stops it; when the user lingers it also prints how an administrator turns that off (`lingerStays`), since the app never turns linger off itself.
Before it writes anything it asks the facts the Linux join asks (`systemdRuntime`, `src/core/helper/linuxStartup.ts`; `docs/helper.md`, "In the background"), because a systemctl on the search path does not mean systemd runs: a container started with a shell has one and no systemd (INF-1601).
Where this user's own systemd answers, or systemd runs here (`/run/systemd/system`) while this shell cannot reach the user's own, as with nobody logged in or in `su`, it sets the service up as above, since their login, or linger, starts it.
With no systemctl, or where systemd does not run, it says this computer has no systemd for this user and exits 1, writing nothing and asking for no linger, since no login and no administrator's line starts it there.
Where it cannot read whether systemd runs, it says so, asks for the command again where the user is logged in, writes nothing and exits 1, promising no start.
Any other word prints the usage and exits 2.
`src/main/startAtBoot.ts` owns the command and its words.

On a Mac it writes a login agent in the account's own `~/Library/LaunchAgents`, `<label>.plist`, which launchd starts in the account's logged-in session whenever it logs in (`bootPlist`, `src/core/helper/background.ts`; the captain's choice on INF-1659).
It is the agent the window's Start at login keeps there, under the same label and file ("The window starts it" above), so the window's own agent in the data folder goes and only one starts the run.
To start it whenever the Mac starts, the person turns on automatic log in for the account, in System Settings > Users & Groups, which the command says.
Automatic log in is offered only with FileVault off; with FileVault on, the password typed when the Mac starts logs the account in, and that starts the agent too.
A run in that session sees the login keychain the log in unlocked, so Secrets work there ([secrets](secrets.md), "In the app").
A system job started before anyone logs in never does: the keychain's lock is kept per session, and logging in later unlocks only the logged-in session's (INF-1659's check on a disposable Mac).
So the agent loads only in the logged-in session (`LimitLoadToSessionType` `Aqua`), never a remote connection's, and the run stops when the account logs out; a Mac waiting at its login window runs nothing, and the command says both.
It runs at the priority of an app the person started, as the home's own work runs (INF-247).
It starts the run again after a failure, so an update's exit 75 runs the new version, but not after a clean stop (0); launchd cannot spare one exit code, so a settings file to fix (78) is started again every ten seconds, launchd's own wait, and is said in the log each time.
What the run says goes to `~/Library/Logs/<label>.log`, which the command names.
When the account is logged in it starts the agent now (`launchctl bootstrap gui/<uid>`), unless another Infinitary holds the data folder, as on Linux; a run of the agent itself starts again with the new file.
Otherwise it says the agent starts the next time the account logs in.
An earlier version wrote a system job for an administrator to copy into `/Library/LaunchDaemons` (INF-1362).
The command takes that version's own copy in `~/Library/LaunchDaemons` away; one still in place starts first at boot and holds the data folder, so the command prints the line that takes it away, `sudo launchctl bootout system/<label> 2>/dev/null; sudo rm -f /Library/LaunchDaemons/<label>.plist`.
`--settings <file>` and its refusal are as on Linux.
`--off` takes the agent away and stops its run; while an earlier version's system job is in place, it prints that same line.
An earlier `help run` showed how to save a login agent by hand as `~/Library/LaunchAgents/infinitary.run.plist`; it starts the same run, so while that file is there the command says so, setting up and with `--off`, and leaves the file alone.

### On Windows

On Windows the start entry is a task in this user's own Task Scheduler, under the run's label, that runs `<app> run` as them in their signed-in session, at the priority of an app the person started, with no time limit (INF-4243's plan, piece 5: "<app> run is registered at your login through Windows' Task Scheduler, and the window starts it as on Mac and Linux"; `runTaskXml`, `src/core/helper/windowsTask.ts`).
`<app> start-at-boot` registers it with a trigger at this user's sign-in, with `schtasks /Create /XML`, which needs no administrator for a task that runs as the user who registers it and only while they are signed in.
The task as registered is kept in the data folder as `run-task.xml`, the file `schtasks` reads, so whether it is in place and whether it starts at sign-in are read from that file without asking Task Scheduler, whose answers are in the computer's own language.
It runs only while the user is signed in: it stops when they sign out, and nothing runs while the computer waits at its sign-in screen, which the command says.
It starts the run now unless another Infinitary holds the data folder, and otherwise says it starts at the next sign-in.
Task Scheduler never starts a run again after it ends, so a crash, or an update's 75 from a package installed by hand, waits for the next sign-in or the window, which offers Start it here at once (`entryRestarts`); after the app's own update the installer opens that window.
`--settings <file>` and its refusal are as on Linux.
`--off` deletes the task and leaves a run going alone, since Task Scheduler's own end of a task ends its program at once, with no clean stop.
A task Task Scheduler would not delete keeps its `run-task.xml`, and `--off` fails saying it is still registered, or that Task Scheduler could not say, unless Task Scheduler itself answers, through its scripting interface in Windows' own PowerShell, that it holds no task by that name (its not-found error from looking up that exact task; the same error reaching the service or its root folder is unknown); a refusal, a timeout or a PowerShell that cannot start is never taken for the task's absence, and neither is a list of tasks, which leaves out one this account cannot read.
For the same reason nothing on Windows signals the run: a stop is asked by writing a file in the data folder, which the run reads once a second and honours only when it was written after the run started: `run-stop.json`, Stop's, is for whichever runs there, and `run-stop-for.json` names one run by its process and start, which only that run honours and a run from an older version never reads; a file that holds no request is no stop (`requestRunStop`, `watchRunStop`).
A run on a Mac or Linux reads `run-stop-for.json` the same way.
The task this app registers runs `run --agent <label>`, since Task Scheduler sets no variable for the mark a Mac's and Linux's agents give their runs (`runTaskXml`, `docs/view.md`, "Following along").
An installed app's window on a PC with no Git yet starts no command: a run cannot ask, so the window offers Git for Windows and runs its own first mate that time, and the next window starts the command (`docs/windows.md`, "Git for Windows").
A development run may stand in `schtasks` with `INFINITARY_SCHTASKS`; an installed app reads `%SystemRoot%\System32\schtasks.exe`.

`<app> help` lists the commands, and `<app> help run` prints the run's usage and the ways to start it, each with this app's own path: by hand in a terminal, and `start-at-boot` (INF-1228's plan: "infinitary help run prints examples for other setups").

## Not yet

The rest of INF-1228's plan follows in order, each on its own: from another computer, its computers and phones, through the same pairing (piece 6).
A task's browser is shown and taken over from another computer as from the first mate's own (`docs/view.md`, "A task's browser on a view").
Claude signs in only where someone is logged in: a Mac nobody is logged in to keeps Claude's login locked in its Keychain, and the crew there uses other subscriptions (captain's pick on question 3).
Moving an existing record to another account is planned separately (question 7).

## Tests

`tests/e2e/run-command.spec.ts` starts the built app as `<app> run` in the hermetic environment `launchApp` uses (`hermeticEnv`, `tests/e2e/launch.ts`), with no display on Linux: it runs and stops cleanly, a second run refuses, a replaced program ends it with 75, and a word after `run` exits 2.
Every journey starts a command through `tests/e2e/commandRun.ts`, and `hermeticEnv` names a start entry that is not there, so no journey reads this computer's own.
With a settings file and the system folders as its path, a run never asks a stand-in login shell that the same run without one asks, and notes the file's folders; a misspelled setting ends it with 78 and keeps why as its last stop.
`tests/e2e/run-hand-over.spec.ts`, on Linux only, starts the built app as `<app> run` with no isolated folder while a stand-in older run holds Firstmate 3000's folder: the older run saves and ends on the ordinary stop, the run brings the saved work over and starts fully from its own folder, and the moved record holds the older task; a full start that is not isolated would read a Mac's own Keychain, so the Mac's take-over is `src/main/runHandOver.integration.test.ts`.
`tests/e2e/run-window.spec.ts` opens the built app's window beside such a command: it shows the command's card as this computer's own window, and once the command is stopped it offers Start it here beside Quit by keys, with Escape closing nothing.
A command killed over an earlier stop's record is told as stopped without saying why; under a stand-in start entry the window waits for a command that ended for its update and follows the new program, offers Start it here once the entry's time passed and takes the notice down for a late command, and a window opened between two starts waits unless Start it here answered that end.
Its last journey changes the theme at the first mate from a second client of the local door, which the window draws, and changes it back in the window, which the first mate keeps.
`tests/e2e/window-starts-run.spec.ts` opens the window with no command running against a stand-in service manager that runs the job it is given (`tests/e2e/serviceManagerStandIn.ts`): the window starts the command and shows its card, Settings -> General offers Stop and moves Start at login to the command, Quit leaves the command running and the window opened again joins it, Stop ends it with nothing starting it again, Start it here starts a new one, and a replaced program ends it for the service manager to start the new one.
Its second test freezes the command and presses Restart it, and its third presses Start it here over the frozen command and starts each start it asks for, as the development build notes it: the frozen run's exit is seen before any cleanup, and the app opens beside the command the job started again as its own, whether that command already noted that it holds the folder or holds the lock and notes it later, with nothing asked of the service manager, and an ordinary launch while the command holds the lock and has not noted it waits the same way and opens beside it.
The journeys freeze a run only once its note says a force stop can end it, and confirm through its supervisor that it is suspended; the asks of the service manager are compared from the press of Start it here on.
The stand-in signals, reads and stops a run only through the supervisor that started it, naming the run by its place in the record of runs and only while it is still that run; a stop is said done only once that supervisor exited, an ask with no answer is taken back, and a journey whose supervisors did not all stop, or one of whose runs its supervisor never saw exit, fails, after its other cleanup and keeping the stand-in's records.
Its last test starts a crewmate whose step stays open, quits the window and opens it again: the step is still open, the task is still running on the same command, and the window's browser profile folder is its own, held by a different process from the command's.
`src/core/helper/runAgent.test.ts` holds the agent's file, the Linux service and the Windows task against stand-ins: where each lives, Start at login moving it, a refused start, letting it go, keeping the settings file and log of the agent `start-at-boot` wrote, and which program each recovery button ends and which survives; `src/core/helper/runForce.test.ts` holds a stuck run ending itself at a stop that names it, beside a bystander, and a program under its number that knows another start keeping going.
`src/core/helper/windowsTask.test.ts` holds the Windows task's file and its command line, what is asked of `schtasks`, and the stop asked through `run-stop.json` and `run-stop-for.json`.
`tests/e2e/latency.check.spec.ts` prints, on a perf run on a Mac, memory across both programs and the time a request, an answer, a key and a fast-typing burst take to reach the screen, against the window running its first mate itself (`docs/testing.md`, "The latency check").
`tests/e2e/panels-every-window.spec.ts` holds the panels in that window and in one on another computer: a panel drawn from the first mate's built files, an action answered there, and a panel built again while the window is open.
`tests/mac-app-launcher.test.ts` builds a stand-in app from Electron's own, named as a packaged app is, and puts both executables in it with the packaging step itself: each holds both Mac chips, Node.js runs where the fuse allows it, the background file arrives signed under the app's bundle id so the main executable signs beside it, a click while a frozen run is up starts a window from the main executable listed at the app, and each start with no window runs from the background file, listed there, while a window's runs from the main executable, whichever file started it.
`src/main/appExecutable.test.ts` holds the background file read as the main executable beside it, and every other program left as it is.
`src/main/runCommand.test.ts` holds the words after `run`, the window's reading of `run.json` and the lock, Windows' lock file among them, Stop's signal, and the program's identity.
`src/main/besideRun.test.ts` holds how a command ended, which start entry starts it again, the notice for each ending and wait, and the note Start it here leaves.
`src/main/shell.beside.test.ts` holds the window beside a command against a stand-in door and presence: it asks over the door with no core, follows the first mate's look and keys from its own copy, applies its Dock choice, answers Start at login and a file picker from its own program, posts its cards' notifications, reads everything once a late door opens, shows the notice and never starts a first mate by itself; and, beside a command it started, waits for it with no notice, answers Start at login from the command's starter, stops it on Stop, starts it again on Start it here, and joins another computer by stopping it, by its address too, asking the command's first mate for the link.
`src/core/ownWindow.test.ts` and `src/core/core.connection.test.ts` hold the first mate's side: what it asks of this computer's window and says with none open, the requests it takes only from that window, that a command's own program posts no notification and changes no login item, and that it pushes no card to a phone while its window says it is in front.
`src/core/update/updateHold.test.ts` holds the save a window's update waits for: a running turn, Update later, a window that leaves mid-save, and the replaced program.
`src/main/runSettings.test.ts` holds the settings file's reading and each reason it refuses one; `src/core/hostEnv.test.ts` holds the search path a child gets from it with no shell asked, and `src/core/claude/claudeCli.test.ts` the locator's login-shell rung it skips.
`tests/e2e/status-command.spec.ts` starts the built commands in the same isolated environment and reads status before, during and after a run, a second start, a signal, an update, a forced end and a saved-data refusal, plus invalid arguments and a corrupt record.
`src/main/runStatus.test.ts` owns the pure output contract, private retained stop, legacy marker compatibility, unknown readings, a Keychain reading that arrives after the note or after the run ended, and the platform capability mapping.
`tests/e2e/link-command.spec.ts` starts the built commands in the same isolated environment: with nothing running `link` says so and makes no data, a word it does not take exits 2, and beside a run a computer's link joins once, a phone's printed code holds its printed link and joins, and `--json` answers a new link; once the run stops it says so again.
`src/main/linkCommand.test.ts` holds the words after `link`, the readings with no answering door, the printed code read back module by module, and the output; `src/core/devices/phoneDoor.test.ts` holds the door's answer and refusals.
`tests/e2e/run-control.spec.ts` starts the built app as `<app> run` with the mock provider and Google's stand-in, joins a second app at its first launch with the link `link --json` prints, and from it opens Intelligence with a card's Open settings button, Usage, Automation and Integrations by command, saves a projects folder typed as its path there after a missing one is refused, and signs in to Google, whose page that app's browser opens; once the run stops its own data holds both.
Its second test, against a first mate with its window, also opens that computer's Knowledge from the second app and adds a stand-in computer to it from that app's Devices, then removes it.
`src/main/startAtBoot.test.ts` holds `start-at-boot` against a stand-in systemd and logind: the service it writes, linger allowed, refused or already on, an Infinitary already open, a settings file, `--off`, no systemd, and `help run`; and on a Mac against a stand-in launchd: the login agent it writes, read back as launchd reads it, started now in a logged-in session or left for the next log in, an Infinitary already open, the window's own agent it takes the place of, a login agent saved by hand, an earlier version's system job and the administrator's line that takes it away, quoted where its folder has a space, a settings file and `--off` with and without that system job.
`src/main/runStatus.test.ts` holds the account path a run hands to its host and the status it returns without guessing.
`src/main/host/claudeKeychainAccess.integration.test.ts` checks real unlocked, locked and missing disposable stores through the child process; `keychainProcess.integration.test.ts` proves a blocked status call leaves its parent responsive.
`src/core/connection/connection.test.ts`, `src/shared/ipc.test.ts`, `src/core/devices/homeLink.test.ts`, `src/main/shell.test.ts` and `src/core/core.connection.test.ts` hold what such a view may ask and is refused, the welcome's field, a replayed page left unopened, and the page the real core sends instead of opening it; `src/renderer/src/devices/viewWords.test.tsx`, `src/renderer/src/settings/SettingsScreen.test.tsx` and `src/renderer/src/app/commandRefusals.test.ts` hold the sections, words and commands.
