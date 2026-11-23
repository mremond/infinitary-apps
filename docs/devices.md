# Devices and pairing

## Who has it

Every build offers multi-machine support, stable, alpha and development alike.
Settings → Devices with **+ A phone**, the first mate's device cards, first-launch joining, a Mac controlling another, windowless work, a project's Runs on and a computer's own sign-ins are on in an installed build as they are in a checkout.
`tests/e2e/installed-devices.spec.ts` holds that an installed build offers them, + A phone included, and `src/core/core.boot.test.ts`, "every build offers every device channel and card", holds the same for a packaged core.

How a device joins the home and how the home keeps the list of what joined: the link, the keys each side proves itself with, the saved list, Remove, and the threat each rule meets.
The connection that carries a paired device's requests and pushes is `docs/connection.md`; this page is pairing's.

## The shape

- **A device** is one of three kinds, set at the home and never by the device (`deviceKindSchema`, `src/shared/devices.ts`):
  - `mac`: another Mac, however it was added - a link pasted at its first launch, a command, or its address.
    It can control this first mate while Infinitary is open there (`docs/view.md`), and it can run work: there the app itself runs the work, started with no window (`docs/helper.md`).
  - `work`: runs work only - another macOS user on this Mac, which never controls, or another Mac added before a Mac could do both.
    Its work asks only the work requests about a conversation its home opened there, and is asked only its home's orders (`docs/helper.md`, "Holding a conversation").
  - `view`: only controls - a Mac that joined with a link before a Mac could do both, or a second app on this Mac (below, "Joining").
    A device keeps its kind until it is added again: a list saved before `mac` existed loads as it was, an old `view` keeps controlling and an old `work` keeps running work, and neither gains the other ability (`deviceControls`, `deviceRunsWork`).
    A Mac still runs nothing until a project is set to run on it (`docs/helper.md`, "Runs on").
- **What a device is** - the system it runs (`macos`, `linux`, `windows`, or `ios` for a phone) and its chip (`arm64` or `x64`, `deviceSystemSchema` and `deviceChipSchema`) - is the device's own word, said in every hello (`docs/connection.md`, "The handshake and the numbering") from the platform profile (`thisDeviceSystem`, `src/core/platform.ts`).
  The home keeps it beside the device's kind, never as a kind of its own, and Settings -> Devices and every other reader see it on the device as `system` and `chip`: a phone is a `view` whose system is `ios`.
  A device that has not said it since the home began keeping it has neither, and a device keeps what it said last until it says something new.
  The words a person reads name a device by it (`deviceNoun`, `src/shared/deviceNames.ts`): a phone is "a phone", and every computer - a Mac, a Linux computer, later a Windows one - is "a computer", as is a device that never said.
  The saved kinds keep their ids: `mac` names the kind that both controls and runs work, whatever system it runs.
- **`DevicePairing`** (`src/core/devices/pairing.ts`) is the one writer over `userData/devices/`.
  It is also the connection's pairing seam (`PairedDevices`, `docs/connection.md`): what is paired, who a connection request proves to be, and the home's own key.
- **The device's side** - checking the home's key, showing its own, using a link, dialing - is `src/core/devices/dial.ts`, written against the wire alone (`src/shared/connection.ts`, `src/shared/devices.ts`), so the app as a view and the helper share it.
- **`Computers`** (`src/core/devices/computers.ts`) is the list as Settings -> Devices shows it - pairing's list, with what the home reads of each computer that runs work right now - and Remove for a computer that runs work, which brings its unmerged work here first (below, "Remove").

## Keys

Each side has an ECDSA P-256 key and a self-signed certificate that carries it (`src/core/devices/identity.ts`), and each shows its certificate in the TLS 1.3 handshake: the home as the server, the device as the client.
A key's pin is SHA-256 over its SubjectPublicKeyInfo, base64url.

- **The home's key** is made with the first link, as `devices/home-key.pem` and `devices/home-cert.pem`, and kept for as long as the folder is.
  A device trusts the home because its key hashes to the pin the device holds; it reads no name or date in the certificate, which is only the envelope TLS carries the key in.
  Deleting the folder makes a new key, and every device must be paired again.
- **A device's key** is made by the device when it uses a link, and never leaves it.
  The home keeps only its pin.
  On every connection TLS has the device sign the handshake with that key, so what an eavesdropper or an impostor sees proves nothing on any other connection.

No session is resumed: the home issues no ticket it can resume and keeps no session, and the device offers none, so every connection shows both keys again.

## The link

```
infinitary://join?as=mac&at=192.168.1.20:47623&key=<pin>&code=<code>
```

A pasted link reads in either scheme: `infinitary://join?` (what a home builds) or `firstmate3000://join?`, which a computer from before the rename built, with the same parts.
Firstmate 3000's computers from before the bridge release read only the old scheme (`docs/infinitary-rename.md`).

| Part | What it is |
| --- | --- |
| `as` | The kind the home made the link for: `mac` for another Mac, by a link, a command or its address, and `work` for another user on this Mac, by its command. A device that cannot be that kind refuses the link before using it. The home makes no new link for a `view` (`inf:devices:invite` refuses one), and still reads one an older home made. |
| `at` | Where the device dials first, as `host:port`: an address, or a name the device resolves. An older Infinitary reads only this part. |
| `also` | The other addresses to try after `at`, comma-separated in one optional part, at most eight. Absent when the link names one address. |
| `key` | The home's pin, 43 characters. |
| `code` | 32 random bytes, base64url, 43 characters. Good for one use, for ten minutes. |
| `via` | Only `ssh`, and only on a link for a computer that reaches this Mac through this Mac's own SSH connection (below, "Through the home's SSH"). Its `at` is then this Mac's loopback, where that connection delivers it, and the device never dials it. |

The home keeps only the code's SHA-256, its kind, when it expires and a handle for it, in memory.
Using it once spends it, ten minutes after it was made it expires, Stop it closes it sooner (`inf:devices:stop`, by the handle the invite answered), and a home restart forgets every open link.
A device that uses a closed link is refused as `unknown`.

`inf:devices:invite` answers the link only to the window that asked: this Mac's own, or a computer that controls this first mate (below).
This account's own `infinitary link` asks the running app's phone door for one instead, and prints it (`docs/run.md`, "A link by command"; below, "A phone that joins by its address").
Its catalog action is the captain's own (`device-invite`, tier `hands`): the first mate can only offer the card whose button makes one there ("Asking the first mate", below), and `app_change` reads back only the list after a change.
No log line, feed line, record entry, card or error carries a link or a code.

Nothing on either Mac answers the `infinitary:` or `firstmate3000:` scheme.
A link is pasted by its person, and a device joins only after that person confirms the kind and the address it names: the app on another Mac at its first launch (`docs/view.md`, "Joining"), and a computer that runs work in Terminal, by the command that carries its link, with a typed yes (below, "Joining by a command"; `docs/helper.md`, "Joining").
A device never joins because a page or a document opened a link.

## Joining

1. The device reads the link with `parsePairingLink` and refuses one it cannot read or whose `as` it cannot be: Infinitary at its first launch takes a link for a Mac (or an older home's `view`), and the work mode a link for a Mac or for another user.
2. It makes its own key, opens TLS 1.3 to each address in turn, `at` then each of `also`, and sends no request until the home's public key hashes to `key`.
   It keeps the address that answered.
   A link with `via` is dialed only through the private socket this Mac's SSH connection forwards there, never at `at` (`docs/connection.md`, "Where a device dials").
   A mismatch closes the socket.
   Inside the handshake the device has shown only its certificate and a signature bound to that handshake.
3. On that socket it sends `POST /pair` with `{ "code", "kind", "name" }`, its `kind` the link's.
   A device that may run work adds `"user": { "name", "uid" }`, the user it runs as, by name and number (`thisDeviceUser`, `src/core/devices/deviceUser.ts`); a Windows PC, whose users have no number, says its security identifier, `"user": { "name", "sid" }`, read from Windows' own `whoami` (`deviceUserSchema`, `src/shared/connection.ts`).
   A user's name may hold a space, as Windows' often do, but never at either end; the work mode adds `"found": { "git", "claudeCode" }`, what it has there (`docs/helper.md`, "Joining"); and Infinitary at its first launch adds `"window": true`.
   `name` is the device's own label, such as its computer name.
   The home pairs it as the link's kind, but for a link for a Mac used from this Mac itself (`joinedKind`): Infinitary at a second app's first launch joins as a `view`, and the work mode as another user here as `work`, refused as `same-user` when it runs as the home's own user.
   A phone adds `"system": "ios"` and no `user`: it joins as a `view` whichever link it used, a link for a Mac or an older home's `view`, so it is never a computer a project can run on and Settings -> Devices' "Runs on" never lists it.
   Infinitary at its first launch on a Windows PC adds `"system": "windows"` with its `user`, and joins a link for a Mac as a Mac does, a computer that controls and runs work (`systemRunsWork`, `src/shared/devices.ts`; INF-4260's plan, piece 10: "A PC joined as a window can also run work, with no new link").
   A PC that joined before Windows ran work, as a `view`, stays one; it joins again with a new link to run work.
   An older home refuses the identifier as `malformed`, and a home on a version from before a Windows PC ran work is sent the system too, so it lists the PC as a `view`.
   A link made for another user here is not for a phone (409 `kind`).
   The home keeps the system when the device joins, before its first hello says it again.
   The grant answers the kind it was paired as.
4. The home answers:

| Answer | When |
| --- | --- |
| 201 `{ "deviceId", "kind" }` | The code is open, its kind matches (a phone is paired as a `view` whichever link it used), and the device showed a key not yet on the list. The link is spent before the answer is written, and the device is on the list with its key's pin. |
| 400 `malformed` | The body is not the shape above, or a computer that runs work sent no user. An older home also answers it to a phone's `system`. |
| 401 `unknown` | No open link has that code |
| 401 `unproven` | The device showed no key of its own |
| 409 `kind` | The link was made for another kind, or Infinitary at its first launch, or a phone, used a link for another user |
| 201 `{ "deviceId", "kind" }`, with `again` | A device finding its home again showed a key on the list (below, "Finding the home again"). The link is spent and the entry stays as it was, kind and all: a computer that runs work finds its home with any link that adds one, and a phone, a view, with a link for a Mac. |
| 409 `paired` | That key is on the list already, and the device did not ask `again`. One entry per key keeps Remove whole. |
| 409 `same-user` | A computer that runs work dialed from this Mac as the user the home runs as, by its number, or on Windows by its security identifier, which a Windows home reads from `whoami` at its start and until then refuses every identifier, since one might be its own (`docs/helper.md`, "The home's side") |
| 410 `used` | The link was used already |
| 410 `expired` | The link is past its lifetime: ten minutes, or thirty for a command that downloads (below, "Joining by a command") |
| 410 `removed` | A device finding its home again showed a key the list no longer holds: the home removed it while it was out of reach |

Only a link used well is spent.
Every refusal is `{ "refused", "reason" }`, and none echoes the code.
`/pair` also refuses a request with an `Origin` (403), another method (405), a body that is not `application/json` (415) or one over 4 KiB (413).
Answers carry `Cache-Control: no-store`.

5. The device keeps its grant, `{ at, homeKey, deviceId, kind, key, cert }` and the link's `via` when it had one (`deviceGrantSchema`), private to itself (0600 in its own data folder).
6. The home says it once in the feed (`device_joined`, `deviceJoinedLine`), by the device's own name: "MacBook Air joined.
   It can control your first mate and run its work." for a Mac that joined at its first launch, "Mac mini joined your devices.
   It has git and Claude Code, and no sign-ins yet." for one a command or its address set up, "Running as Builder is set up.
   It runs work only, and has no sign-ins yet." for another user on this Mac, and "MacBook Air joined.
   It can control your first mate." for a second app here.
7. A device that may run work then gets its setup card (below, "Finishing its setup"); one that only controls needs nothing more, and a computer that found this Mac again runs work as before.

## Finishing its setup

A computer that runs work does nothing until it has sign-ins of its own and a project set to run on it, and the join alone said so only once in the feed (the captain's FI3-1350: "nothing told me to do github sign in and AI subscription sign in for that machine").
So the moment one joins, the host files one card, "Finish setting up Mac mini" or "Finish setting up Running as Builder" (`DeviceSetup`, `src/core/devices/deviceSetup.ts`; its words `src/shared/deviceSetup.ts`; design skill `components/devices/FinishSetup`), built from typed facts alone and never from the first mate's judgment:

- **What it reads.**
  What the join found there (`found`: git and Claude Code), what the computer last said of its own sign-ins (`DeviceSignIns.lastSaid`), and the projects whose Runs on names it.
  A computer whose card is still asking is asked its sign-ins the moment it comes into reach, so the card reads what it has rather than what the join assumed.
  While work is not connected or has not reported its sign-ins, the card says what is missing instead of offering sign-in links.
  An open card changes when work disconnects or reconnects.
  An answered card stays closed across connection changes and returns only when a setup need or its offered action changes.
  If the sign-in read did not answer, the card says so and notes that the computer may need this computer's version.
- **Its rows.**
  "A subscription of its own", done once the computer reports any account there, whatever its allowance read (the captain's pick: a Claude login whose allowance macOS there will not let Infinitary read still counts); "Its own GitHub sign-in, to clone and push", done once it reports a sign-in for GitHub, whatever its health; and last, "A project that runs there", worded as optional - a computer with no project runs nothing, and that is fine - done once a project's Runs on names it.
  Each row carries its id and whether it is done (`data-setup-row`, `data-done`), so a reader takes the fact, never the words.
- **Its buttons.**
  While work is in reach and has reported, the card footer offers one button per open row that has a usable Settings destination.
  A subscription provider or GitHub host must be offered by that computer for its corresponding action to appear.
  Only the captain's click runs a button: "Add a subscription" opens Settings -> Intelligence, "Sign in to GitHub on Mac mini" opens Settings -> Integrations with that computer's GitHub sign-in started under its row (`forgeSignInOn` on the open effect, `src/shared/cards.ts`, which `openedSection` routes there), and "Choose a project" opens Settings -> Projects; the first open row's button is the default.
  "Not now" takes the card down for good: the card's own resolution remembers it (`CardStore.chosenAction`), across restarts, until the computer is removed and added again.
- **How it moves.**
  Every button resolves the card, as every card's does.
  The host raises it again under the same id when a row moves - the computer reports a sign-in, a project is set to run there - and never when the computer merely says the same again, so a row the captain is already on does not come back on an allowance read.
  Once every row is done it comes down by itself, and the feed says once "Mac mini is set up.
  It runs website with its own sign-ins."
  A computer taken off the list takes its card with it.
  A computer that joined before this Mac started and never had the card gets none: for one set up later, or signed out again, the backstop below speaks.
- **The backstop** (`docs/helper.md`, "Runs on"; `docs/forge.md`, "A computer's own sign-in").
  A task about to start on a computer with no sign-in at all waits as queued work, the feed says "Mac mini has no sign-ins yet. website's next task waits until it has one.", and it starts by itself the moment that computer reports one.
  A project that lives on GitHub set to run on a computer with no GitHub sign-in of its own raises the host's GitHub card for that computer, "Sign in to GitHub on Mac mini", unless the setup card is on the stack and already asks in its own row; a clone that computer's GitHub refuses crosses the connection typed, so the task waits behind that sign-in's gate and starts by itself once the computer reports it.

## A Mac that has not finished setting up

A Mac that joined with its window also runs its work in the background, and its window sets that work up again by itself at every connection to this Mac, the first of each launch included and never before a welcome (`docs/view.md`, "Setting its work up again").
When it cannot, the window tells this Mac why (`inf:devices:work-setup`), and `Computers` keeps what each Mac's window last said while that window is connected (`heardWorkSetup`).
The row of a Mac whose window is connected and whose work is not in reach carries `workSetup` (`deviceWorkSetupSchema`, `src/shared/workSetup.ts`):

- `blocked` with the window's own reason: another first mate's work there (`other-home`), this first mate's work under another entry on the list (`other-entry`), an earlier removal there not finished (`removal-unfinished`), work there a newer Infinitary saved, which that window's version cannot read (`newer-work`), the app running from a disk image or a moved-aside copy (`app-place`), the system refusing the background (`background-off`), or no background the app can use (`no-background`);
- `starting` for `WORK_REACH_GRACE_MS` (30 seconds) after the window found a run or asked the background for one;
- after that moment a run that has not reached this Mac is `blocked` with this Mac's own reading: `local-network` when its work's dial is held on the local network (below, "Held on the local network"), and `not-reached` otherwise.

Held on the local network is decided from the work's own contact alone: the window's connection never writes when that Mac was last seen (`viewContact`), so a connected window does not hide that its work's dial is held.
A window that goes takes what it said with it, and says it again at its next connection.
Fix it on the row (`inf:devices:fix-work`) sends that Mac's window, connected now, a live frame outside the numbering (`inf:devices:set-up-work`, `HomeConnection.liveToView`), and its window checks again; it answers `asked: false` when no window of that Mac is connected.
When the background started the app there because the copy it named was gone, the report says so (`copyGone`), and this Mac's feed says once that its work starts from the Infinitary installed there.
An older window never reports, and its row reads as before.

## Joining by a command

A computer that runs work joins by one command, run once in Terminal as the macOS user who should run the work (design skill `components/devices/AddAMac`).
The command carries a link inside it, with the link's rules: it works once, for ten minutes, it exists only after the captain's own click, and it lives in Settings -> Devices' panel alone.
A command for another Mac that downloads this computer's published version there has a link that lasts thirty minutes from the start instead (`DOWNLOAD_COMMAND_LINK_TTL_MS`, captain's choice on INF-369), so on a slow network both the download and the copy from this Mac it falls back to fit: for today's 401 MB app at 1 MB a second, about 6.7 minutes each and a minute to join, which leaves the person about 15 minutes to run it.
A command that gets Infinitary from this Mac alone keeps ten minutes, and the expired words name the lifetime its link had.
`inf:devices:invite` with `command` (`another-mac` or `another-user`) answers the link and the command (`joinCommand`, `src/core/devices/joinCommand.ts`): the command for another Mac carries a link for kind `mac`, and the one for another user a link for kind `work`.
A Mac joined by its command can open Infinitary there any time to control this one, with no new link (`docs/view.md`, "A Mac that runs work"), and its Terminal says so.
A Linux computer joins a Mac or a Linux home by the command for another computer, with or without a screen (INF-1181); one with a screen may instead paste a link into its own Infinitary at its first launch (`docs/view.md`, "Joining"), and a Mac joins a Linux home either way: each runs its own system's Infinitary, and its work runs in that system's background (`docs/helper.md`, "In the background").
On Linux with no display (neither `DISPLAY` nor `WAYLAND_DISPLAY`), Infinitary's window does not start: it says "Infinitary's window needs a screen, and this computer has none." and "To run your first mate's work here, use Run a command there in Devices on your other computer, then run that command here.", and exits 1 (`src/main/noScreen.ts`).
The command for another computer runs on a Mac or on a Linux computer with an x64 chip, and gets Infinitary for that computer's system (below, "Infinitary for another system").
A Mac with no Infinitary to send for any system - a development run, or an installed one that is no release - refuses to make it at once: "This copy of Infinitary cannot send itself to another computer; only an installed one can."
A Linux home with none to send still makes it, since a Linux computer with Infinitary installed joins with that copy; on any other computer the command says "MacBook Pro cannot send Infinitary for this computer.", "Install Infinitary here, then run this command again." and "Nothing changed on this computer." once the home answers it has nothing to send.

- **Running as another user on this Mac**: this Mac's own app started in its work mode with the link, `'<app>' work join '<link>'` (in a development run, Electron and the checkout's folder before `work`).
  The app asks its yes and joins (`docs/helper.md`, "Joining").
  On a Linux home it is that computer's own Linux app, started as it starts again past its next update (`appLauncher`, `docs/helper.md` "In the background"), and the other user's work draws on a display of its own (`docs/helper.md`, "No screen needed").
  Its link names `127.0.0.1`, which that user reaches from this Mac itself whatever network this Mac is on, so a new address never strands its work (below, "Finding the home again").
  On a Windows home it is one line for PowerShell that starts `(Join-Path $env:LOCALAPPDATA '<program>') work join <link>` as a .NET process with its input piped, the program and its command line in PowerShell's single quotes (`powerShellWord`) and each word of that command line quoted as Windows reads it back (`windowsWord`; INF-4260's plan, piece 10, the captain: "Yes, as part of piece 10").
  Windows installs Infinitary for each account in its own `%LOCALAPPDATA%\Programs`, which no other account may read, so the line names the program at the same place in the folder of the account that runs it, which installs Infinitary first; the program asks its yes in that PowerShell window and the line waits until it is done.
  A program with a window cannot read what is typed in that PowerShell window (the installed app's read ended at once on a fresh Windows 11 PC), so once the person starts typing, PowerShell reads their line and writes it into the program's input, which the program reads as a piped yes; a program that ends without asking leaves the line waiting for nothing, and a stopped line closes that input, which the program reads as no answer.
  Settings -> Devices says "Sign in to Windows as the user who should run the work, install Infinitary there, and run this once in PowerShell."
- **Another computer**: one line, `/bin/sh -c '<script>' firstmate '<link>' '<this Mac's name>' '<address>' ...`.
  The script is the same every time and names no value; every value is its own quoted word after it, so nothing a name holds can change what runs.
  On a system Infinitary does not run on (`uname -s` and `uname -m`: anything but a Mac, or Linux on x64) it stops before anything else: "Infinitary does not run on this computer's system.", "It runs on Macs, and on Linux computers with an x64 chip." and "Nothing changed on this computer."
  On Linux it then looks for Infinitary installed there, in three ways in this order (captain's picks on INF-1181).
  Where it is installed - the Ubuntu package's program (`UBUNTU_PACKAGE_BIN`) or an `infinitary` on the search path - it downloads nothing: it asks that copy its `work version`, and where it is not this Mac's version it stops with "The Infinitary installed on this computer is not version 0.13.0, which MacBook Pro runs.", then the one line that updates the package where `dpkg-query` knows an `infinitary` package ("Update it with this line, then run this command again:" and `linuxUpdateCommand`'s line), or "Update it to version 0.13.0, then run this command again.", and "Nothing changed on this computer."
  Otherwise it starts that copy as `work join <link>`, which asks its own yes (`docs/helper.md`, "Joining").
  On Ubuntu 24.04 or 26.04 (`/etc/os-release`, `UBUNTU_PACKAGE_RELEASES`) with none installed, it asks `sudo -n true` before its yes, and an account sudo refuses outright stops with "Infinitary is not installed on this computer, and this account cannot install software.", "Use an account that can, or install the Infinitary package for this system, then run this command again." and "Nothing changed on this computer."
  After its yes it gets the Ubuntu package from this Mac with the link's code (`package: "deb"` on `FETCH_APP_PATH`), which answers its SHA-256 in `FETCH_APP_SHA256_HEADER`, says "Installing Infinitary, which may ask for this account's password.", and installs it with `sudo apt-get install`, which asks the password on the terminal; a wrong password or a refused install says "Could not install Infinitary on this computer." and "Nothing changed on this computer.". sudo asks a password even of an account it then refuses, such as one outside the `sudo` group, so that account stops there, after its password, with nothing installed.
  The package waits in this account's own folder while sudo asks, so root copies it into a folder only root writes, checks that copy against the SHA-256 and installs only a copy that matches; one that does not says the same two lines.
  The command reads `dpkg -l` before it asks root, so a failed install that changed no package is the two lines above.
  One that changed packages says "Could not finish installing Infinitary on this computer.", and then what stays: where dpkg unpacked part of the package (`dpkg -l infinitary` lists it as anything but not installed), "Part of it stays installed, and this line removes it:" and `sudo apt-get remove -y infinitary`; where apt installed only packages it needs and stopped before the package, "Packages it needs that apt installed stay installed."
  The same root step lets this user's work keep running after logout (`loginctl enable-linger`); where systemd does not run, that fails and the install still stands.
  Then it starts the installed program as `work join --agreed <link>`, which joins without asking again.
  A join that stops then, such as on a command used already or a computer it cannot reach, drops the words that say nothing changed and ends with "Infinitary stays installed on this computer.", and where the install turned linger on, "Programs kun runs now keep running after kun logs out.", "To turn that off, an administrator runs this once:" and `sudo loginctl disable-linger kun`.
  Any other Linux computer gets the AppImage, as below.
  It stops first where that user cannot make a user namespace, asked with the AppImage launcher's own probe (`SANDBOX_PROBE`, `unshare -Ur true`): the AppImage would start with Chromium's sandbox off each time its work starts, with nobody there to ask (`docs/linux-packages.md`, "The sandbox").
  It says "Infinitary would run on this computer without its sandbox: its system keeps apps from making one.", "Install the Infinitary package for this system, then run this command again." and "Nothing changed on this computer.", as adding that computer by its address refuses `sandbox-off` (below, "Adding, step by step").
  It then runs the look's own checks for git, Xvfb, FUSE 2 and the AppImage's libraries (`LINUX_TOOL_NEEDS`, below, "Infinitary for another system"), and where any is missing stops before its yes with "Infinitary needs more on this computer before it can run work for MacBook Pro.", "Install it with this line, then run this command again:" and that computer's own installer's line, such as `sudo apt-get install -y libfuse2t64 libgbm1`, or the needs by name where it has no installer the command knows.
  Each join writes how its work runs in the background (`running`, `at-login`, `failed` or `none`) to a file the command names with `--background`.
  After a Linux computer joined with its work in the background, the command keeps it running after that user logs out where systemd lets it (`loginctl enable-linger --no-ask-password`) and says "It keeps running after kun logs out."; where it does not, it prints the one line an administrator runs: "To keep it running after kun logs out, an administrator runs this once:" and `sudo loginctl enable-linger kun`.
  Where the join set up nothing in the background, or setting it up failed, the command says nothing about after logout, and the join's own words say how the work runs.
  It checks this Mac's key with the system's own curl (a Mac's `/usr/bin/curl`, Linux's on its search path, `--pinnedpubkey`), saying "Could not reach MacBook Pro at 192.168.1.20." or "Something answered at 192.168.1.20, but not the computer that made this command." before anything else, then asks its yes; a Linux computer with no curl says "This command needs curl to get Infinitary from MacBook Pro." and "Install curl, then run it again."
  Only after a yes does it get Infinitary.
  On a Mac, when this Mac's version is published, the command first asks this Mac whether its code is still open, which sends nothing and spends nothing (`check`, below), then downloads that version there itself from its public release over HTTPS with the instructions a Mac reached by its address runs (`MAC_DOWNLOAD`, below, "Downloading on a Mac reached by its address"): its own curl, the published SHA-256, its own ditto and its own codesign against the release's publisher.
  Its count rewrites one Terminal line in place, "Downloading Infinitary… 200.6 MB of 401.1 MB", or "200.6 MB so far" when the release states no size, and the line ends ", done." once the copy is checked and unpacked.
  The download stops after two minutes with no byte moving, or once what is left of the link is only what a copy from this Mac needs on a slow network, so that copy and the join still finish in time (captain's choice on INF-369): a minute to unpack it and join, plus the download's stated size at 1 MB a second, since this Mac's copy is the same app, compressed alike.
  One that failed or stopped says "Could not download Infinitary, so getting it from MacBook Pro instead.", and one that did not match its checksum or publisher "The download did not match, so getting Infinitary from MacBook Pro instead.".
  Otherwise - a development or unpublished version, Linux, or after that line - it gets Infinitary from this Mac with the link's code, naming its own system and chip ("Getting Infinitary from MacBook Pro… done."), unpacks it in a temporary folder - a Mac the home's gzipped tar, or a published zip with its own ditto; Linux keeps the AppImage as it came, in its own cache folder rather than a shared `/tmp`.
  Either way it starts that copy as `work join --fetched <app> <link>`, which joins without asking again and keeps the copy (`docs/helper.md`, "Joining").
  The temporary folder is deleted whatever the join answered, and when the command is stopped part way.
  A used, expired or stopped command says so ("That command was used already.
  Make a new one on MacBook Pro.") and gets nothing, before any download.
  Both computers then run the same version - the download is this Mac's own version as its release published it - and need only the same network.

### Getting Infinitary from this Mac

`POST /firstmate` (`FETCH_APP_PATH`) on the connection's listener answers this app as one gzipped tar of its bundle, made as it is sent (`/usr/bin/tar`, at utility QoS).
The body is `{ "code" }`: pairing answers whether that code is an open link for a device that may run work (`DevicePairing.opened`), and reading it never spends it, so only `/pair` joins.
From protocol 5.1 (`FETCH_APP_SYSTEM_SINCE`) the body may also name the asking computer's `system` and `chip`, and the home answers Infinitary for them (below, "Infinitary for another system"), by its `Content-Type` (`FETCH_APP_TYPES`): a Mac's bundle as before (`application/gzip`), a Mac's published zip from a home that is not a Mac (`application/zip`), or a Linux AppImage itself (`application/octet-stream`).
A computer that names no system is a Mac asking as Macs always have, and gets this home's own bundle or `none`; a computer names its system only to a home whose welcome says 5.1 or later, since an older home refuses the field as `malformed`.
From protocol 8.15 the body may say `check: true`: the home answers 204 when the code is open, and sends nothing; only this home's own command asks it, before it downloads Infinitary from the published release.
A computer on the list that gets the app with its own key is heard as it is sent: the connection tells `WorkDevices` each piece it sends that computer (`onAppSent`), which an update counts (below, "Updating over the connection"); a command's get names no computer yet, and is not heard.
A refusal is `/pair`'s, with the same statuses - `malformed` 400, `unknown` 401, `kind` 409, `used` and `expired` 410 - or `none` 404 from a home that cannot send itself; none echoes the code.
Like `/pair`, it refuses an `Origin` (403), another method (405), another body type (415) and a body over 4 KiB (413).
The bundle is the installed app this runs from (`appBundleOf`): a Mac's `.app`, or the AppImage an installed Linux app runs from; a development run has none, so its command for another computer is refused at once ("This copy of Infinitary cannot send itself to another computer"), unless `INFINITARY_APP_BUNDLE` names one, a `.app` or an `.AppImage`, as a test's stand-in does.

## Adding a computer by its address

The captain may add a Mac, or a Linux computer with an x64 chip, by the address the captain reaches it at with SSH, such as `sam@mini.local` (design skill `components/devices/AddAMac`, "By its address").
It is the way Settings -> Devices and the first mate lead with, since this computer then keeps the other one updated and reaches it by itself, with no visit there after setup.
A Mac home or a Linux home then sets it up over SSH - a Mac's Remote Login, a Linux computer's SSH server - with the captain's own SSH key, and nothing needs to be open on it.
The look there asks the other computer's system first, and that system's adapter sets it up (`FarSystem`, `src/core/devices/farSystems.ts`): a Mac exactly as before, and a Linux computer the same steps in its own folders.
Its work may be in either spelling's data folder of the Infinitary rename, so the look reads the grant, and the removal and the controller start the copy kept there, from the first folder that holds one, Infinitary's first, and never from a folder that moved (`farFolderArgs`; `docs/helper.md`, "Under the other name").
When that computer does not let the captain's key in, Infinitary asks once for that user's password, uses it only to let its own key in there, and keeps none of it (below, "The password, once").
An Ubuntu 24.04 or 26.04 computer is set up from Infinitary's Ubuntu package instead of the AppImage (below, "The Ubuntu package").
It is the captain's own click: Add it on Settings -> Devices' address form, or Add it on the first mate's card (below, "Asking the first mate"), which asks `inf:devices:add` with the address (`RemoteLogin`, `src/core/devices/remoteLogin.ts`).
The address is the one thing the captain supplies: one address, never an option, with no space and never a leading dash (`remoteLoginAddressSchema`, `src/shared/remoteLogin.ts`).
A port other than SSH's 22, typed in the Port field beside it, joins the address as SSH's own URI, `ssh://sam@mini.local:2222` (`addressAtPort`), so ssh, `ssh -G` and the kept key line all read one address, and every later update, removal and key check reaches the computer there.
An alias from the captain's own SSH settings works, because the captain's own SSH resolves it.

### Macs nearby

While the address form is open, Settings -> Devices lists the Macs on this network with Remote Login on, under the field (`NearbyMacs`, `src/core/devices/nearby.ts`; `inf:devices:nearby`).
Remote Login announces itself over Bonjour as `_ssh._tcp`, and this Mac only listens for that, with macOS's own `/usr/bin/dns-sd`: it never tries the addresses around it, and what it lists is what answered.
A Linux home listens for the same with Avahi's `avahi-browse --parsable --resolve` from its search path (`src/core/devices/avahi.ts`), which hears each computer's name on this network with its announcement, so none is asked again; it is stopped after a dns-sd browse's time and another starts, and one that ends by itself, as when Avahi's daemon is not running, says it could not look.
It hears every Mac with Remote Login on, and a Linux computer whose SSH server Avahi announces, which many do not by default (Ubuntu ships the announcement as an example, `/usr/share/doc/avahi-daemon/examples/ssh.service`); typing its address always works.
A Linux home with no `avahi-browse` lists nothing, as before.
A Windows home listens with Windows' own network browsing, the `DnsServiceBrowse` and `DnsServiceResolve` calls its DNS client service answers since Windows 10 (1809), which Windows' own PowerShell makes, as it announces (`runWindowsDnsSd`, `src/core/devices/windowsDnsSd.ts`); it prints what it heard as dns-sd does, so the same readers read it, and it only listens.
While nothing answered, a Linux home's list reads "Looking for computers on this network that announce SSH…".
Each Mac that announces it is asked once for its name on this network (`dns-sd -L`), four at a time, and is listed by the name it announces, drawn as text, with the address it fills in: the user Infinitary runs as here, at that name, such as `sam@Sams-Mac-mini.local`.
This Mac answers too, and is left out by its own names on the network (`ownNetworkNames`, `src/core/devices/computerName.ts`); nothing is listed until those are read.
A Mac already on Your devices is marked "on your list": one added at that name, or one not on this Mac that joined under the same name (`nearbyOnList`, `src/shared/nearbyMacs.ts`).
Picking one fills the field with the user name selected, to change before Add it, which then runs as for a typed address.
Typing an address still works, including a private network's name, such as Tailscale's.

The list is looked for only while the aside is open: the window asks `inf:devices:nearby` with `true` when it opens and every twenty seconds after, and with `false` when it closes, and the look stops by itself a minute after the last ask.
The window applies that ask's answer only when no push of the list has arrived since the ask was sent, so an older answer never covers a newer push.
Every run of dns-sd also ends by itself (`-t`): a browse after 75 seconds, when another starts if the list is still looked for, and a name lookup after five, when that Mac is left off.
A Mac the last browse announced stays two seconds for the next one to announce it again, so the list does not blink.
So an Infinitary that stopped without a word leaves nothing listening for long.
A development run may stand in its own program with `INFINITARY_DNS_SD`; a packaged app ignores it, and every end-to-end launch sets one that finds nothing, so a test never listens on the Mac's own network.

### Announcing to devices

While a device that may look for it is on Your devices, or an unspent direct computer invitation is open, this computer announces itself over Bonjour as `_infinitary._tcp` in the local domain, at the port the connection listens on (`HomeAnnouncement`, `src/core/devices/announce.ts`): a Mac under its own name in System Settings, a Linux or Windows home under its host name.
A device that may look for it is a phone (a device whose system is `ios`), or a computer that dials this one at an address: a Mac that controls this first mate or runs its work, which is neither on this computer nor reached through this computer's own SSH (`looksForAnnouncement`).
An open invitation lets the first phone find this computer before it has joined; invitations through SSH and commands for another user do not announce.
A device browses for that to find this computer again after its address moved, and then dials it and checks the key it was paired with (above, "Joining"; below, "Finding the home again"), so the announcement carries no key and no secret.
A Mac runs macOS's own `dns-sd -R` (or a development run's `INFINITARY_DNS_SD` stand-in, on either system).
A Linux home runs Avahi's `avahi-publish --no-fail --service` from its search path (`avahiAnnounceArgs`, `src/core/devices/avahi.ts`), from the same package as `avahi-browse` above.
Neither has an end of its own, so a shell holds it with the app's pipe (`runDnsSdHeld`, `src/core/devices/dnsSd.ts`): it is killed once the pipe closes, when the announcement stops or the app is gone however it went, so a quit or a crash leaves no announcement.
A Windows home has no program that announces from the command line, so Windows' own PowerShell makes Windows' own call, `DnsServiceRegister`, which its DNS client service answers since Windows 10 (1809), under the computer's host name at `<host name>.local`, never Windows' older 15-letter computer name (`runWindowsAnnouncement`, `src/core/devices/windowsAnnounce.ts`).
PowerShell holds it on the app's pipe and takes it back with `DnsServiceDeRegister` once the pipe closes, so a quit or a crash leaves no announcement running; a stop that closes the pipe ends PowerShell after five seconds if it has not ended by then.
Another computer that already heard it may still answer from its own cache until the record's two-minute lifetime runs out.
A dot or backslash in the computer's name is escaped, so the name stays one label.
It starts when the list gains such a device or a direct invitation opens, and stops once neither remains or the app quits, for good: a change during quit starts nothing.
Stop, expiry and spending the last invitation stop its announcement unless such a device is now on the list.
One that ends by itself, as when mDNSResponder restarts, starts again while either condition holds, five seconds later and doubling up to a minute.
Avahi's daemon restarting does not end one: `avahi-publish` publishes again by itself, and with `--no-fail` one started while the daemon is not running waits for it.
Another computer on the network announcing the same name makes dns-sd or Avahi announce under another, such as `studio #2`.
A second announcement under the same name on the same Linux computer, as a second person's Infinitary there with a phone of their own, is refused by Avahi as a local name collision and ends, so it is tried again as above until the name is free.
A computer with no such device and no open direct invitation announces nothing.
A Linux home announces nothing where it has no `avahi-publish` (Ubuntu's `avahi-utils`, Fedora's `avahi-tools`, Arch's `avahi`), and nothing its phone can hear where its Avahi does not publish a user's services, which Avahi refuses as not permitted, or its firewall keeps mDNS out (Ubuntu's ufw lets it in).
NixOS publishes one only with `services.avahi.publish.enable` and `services.avahi.publish.userServices` set.
The native phone reader, its scan-code panel and its isolated tests are described in `docs/ios.md`.

Bonjour browsing is a local network operation (Apple's TN3179).
When macOS does not let the app use the local network, dns-sd says so with Bonjour's policy-denied answer (-65570), and the list says "macOS has not let Infinitary look for computers on this network." and "Allow it in System Settings, under Privacy & Security, Local Network.
You can still type an address."; a Mac that answers once it is allowed is listed.
The list says so only on that answer, never on a guess: while no Mac answered it reads "Looking for computers on this network with Remote Login on…", and when dns-sd stopped some other way, "Could not look for computers on this network.
You can still type an address."
The app's `NSLocalNetworkUsageDescription` is the sentence macOS shows if it asks (`electron-builder.yml`): "Infinitary lists the computers on your network that have Remote Login on, so you can add one, reaches the computers you added, and lets your phone find this Mac."
Listing asks for no entitlement and no `NSBonjourServices` list, which macOS does not require for it.

### The captain's own SSH

Every step runs the system's own ssh - a Mac's `/usr/bin/ssh`, Linux's from its search path, since NixOS keeps none in `/usr/bin` (`systemSshTool`; so do `ssh-keyscan` and `ssh-keygen`) - with the app's environment (`hostEnv`), so the captain's own agent answers, in batch mode, so it never asks anything (`runSsh`, `src/core/devices/ssh.ts`).
The app reads no SSH settings and no keys: SSH reads the person's own, so an alias still resolves.
What the app adds only narrows what SSH does: no terminal, no agent or display forwarding, no port forwarding a setting asks for, no local command, and no shared connection left behind.
It never loosens how SSH checks that the other Mac is the one it reached before.
It stores no password, and every SSH sign-in but one types none: the one that lets Infinitary's own key in (below, "The password, once").
An Ubuntu package install types that account's password to the installer on an already signed-in session, never to SSH, and keeps none of it (below, "The Ubuntu package").

### Your yes on the check line

The first reach of an address reads the check line and sends nothing until the captain says this is the Mac (`readHostKey`, `src/core/devices/hostKey.ts`).
`ssh -G` says where the captain's own SSH would connect, and `ssh-keyscan` reads the key there.
An address their settings reach through a `ProxyCommand` or `ProxyJump` has no name `ssh-keyscan` can dial, so their own ssh reads the key through that proxy instead.
It reads no known hosts, its known-hosts command only writes down the key it was offered and vouches for none, so SSH stops with "Host key verification failed" before it signs in to that Mac.
A jump host is signed in to as their settings say, as any reach of that address does.
The aside asks "Is this sam@mini.local?" and "Compare this line with the one that computer shows.", with the line, "This is the computer" and "Cancel".
Cancel keeps the address and sends nothing.
The yes is remembered in `devices/host-trust.json`, 0600, and in a known-hosts file beside it that only Infinitary's own SSH reads (`DevicePairing`, `src/core/devices/pairing.ts`).
The captain's SSH settings are not written, and a yes is never taken on first sight.
A later add of that address does not ask again.
A Mac that answers unlike the remembered key is refused as `host-changed` before a sign-in or a copy, and nothing is sent.
`ssh` for a remembered address sets `UserKnownHostsFile` to Infinitary's file, `GlobalKnownHostsFile` to `/dev/null`, `KnownHostsCommand` to none, `VerifyHostKeyDNS` to no, `StrictHostKeyChecking` to yes and `UpdateHostKeys` to no, so a changed key is also refused by SSH itself before it signs in (`hostTrustSshOptions`, `src/core/devices/hostTrust.ts`).
SSH splits an option's value at spaces, and Infinitary's folder is under Application Support, so the file's path is quoted to stay one file (`sshPathWord`).
A development run may stand in its own program with `INFINITARY_SSH`; a packaged app ignores it.

### The password, once

A Mac that lets the captain's key in never asks for a password.
When the look is refused with `key-refused`, SSH's own `-v` note says which ways that Mac lets a user in (`passwordMethods`, `src/core/devices/sshPassword.ts`).
A Mac that takes no password is refused as `password-off`, and nothing is asked.
Otherwise `inf:devices:add` answers the password question (`{ asks: "password", address, user }`, `remoteLoginAddAnswerSchema`), and nothing else happens there.
Settings -> Devices shows it in the aside: "sam@mini.local did not let your SSH key in." and "Infinitary can let its own key in with that user's password.
It uses the password once and keeps none of it.", a password field named "sam's password on that computer", a primary "Add it" and a ghost "Cancel".
Cancel keeps the address and sends nothing.

Add it asks `inf:devices:add` again with `{ password }`, on that one call.
The look runs again with the captain's key, so a Mac that lets it in by then never gets the password.
Then the feed says "Letting Infinitary's own key in on sam@mini.local." and one SSH run types the password (`placeOwnKey`):

1. It runs only with the remembered check line (`hostTrustSshOptions`): with none, it is `host-unknown` and nothing starts.
   SSH checks the host key before it signs in, so a Mac that answers unlike the remembered one never sees the password.
2. It asks nothing but the password, once: `BatchMode=no`, `PubkeyAuthentication=no`, `IdentityAgent=none`, one method (`password`, else `keyboard-interactive`), `NumberOfPasswordPrompts=1`, its own connection (`ControlPath=none`) and no proxy.
3. The password is never an argument, in the environment or in a file.
   SSH asks for it through a small askpass script in a fresh 0700 folder (`SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE=force`), which prints a word only this run knows on SSH's notes and reads one line from SSH's input, which it shares.
   Infinitary writes the password there once, only on that word and only before SSH says it signed in, then ends that input and zeroes its copy.
   The folder is deleted whatever happens.
4. The remote command adds Infinitary's public key line to that user's `~/.ssh/authorized_keys` once, with the folder and the file only that user may change, on a system Infinitary is set up on over SSH only: a Mac or Linux (`other-system` otherwise).

The key's comment is `infinitary` on a key this app makes, and a key whose comment reads `firstmate-3000`, made before the rename, is read as this app's too.

A password that Mac did not take is said in the feed with two `warn` lines, and `inf:devices:add` answers the question again with `wrong`, which the aside shows above an empty field.
A Mac that never asked for one is `password-off`.
Once the key is in, the look runs again with it and the add goes on as above, with no password.
A key placed that the Mac still does not let in is `key-not-taken`.

Infinitary's own key is made with `/usr/bin/ssh-keygen` the first time it is needed: ed25519, no passphrase, named `infinitary`, in `devices/ssh-key/`, a 0700 folder that appears whole or not at all, with both halves 0600 (`makeOwnKey`, `src/core/devices/ownKey.ts`).
The addresses where it is let in are kept in `devices/ssh-key-placed.json`, 0600 (`DevicePairing.ownKeyPlacedAt`).
Every later `ssh` to such an address, the setup's, an update's, a removal's and this Mac's own connection, offers that key first with `-i`, only the keys named (`IdentitiesOnly=yes`) and none added to an agent (`DevicePairing.sshOptions`), so the captain's other keys and agent are not needed there.
The password is held only as the one request's argument in memory, and as bytes zeroed once written or once the run ends: it is in no feed line, log, saved file, task record or command's arguments.

The same aside asks again when an Ubuntu package needs that account's password to install or update (below, "The Ubuntu package").
The words then say Infinitary will install itself, or update itself, and the password is written only to `sudo -S` on that computer, never as an argument.
A password already typed on this add, to let the key in, is the one used for the install, so it is not asked twice.

### The Ubuntu package

Ubuntu 24.04 and 26.04 added by address run from Infinitary's Ubuntu package, not the AppImage.
The owner turns on that computer's SSH server, then types the address and, when the package is missing or another version, that account's password once.
The look also reads whether the account may install software (`sudo -n true`) and the installed `infinitary` version.
An account that may not is refused as `cannot-install`, unless the package already matches this computer's version, in which case no password is asked.
This computer gets the deb for its own version from the tap, checks it, and sends it.
Root copies the received deb from the account's cache into a root-owned directory under `/tmp`, checks that copy against the SHA-256, and gives only that copy to `apt-get`.
Only after verification does root allow apt's unprivileged reader into the directory; unverified contents stay private even if the received path points at a root-only file.
The directory and package allow apt's unprivileged reader to read, but only root may change them, so replacing the account's received file cannot change what apt installs.
Root removes its private directory on exit, including a failed copy, check or install; a successful install also removes the received deb.
`apt-get` brings git, Xvfb and the libraries, and the package's install script loads the AppArmor profile, so Ubuntu's limit and the sandbox both stay on.
The same step turns on linger for that account, so its work keeps running after that user logs out.
Where systemd does not run, as in a container or WSL without it, linger fails and the install still stands: the step says so on a line of its own (`LINGER_OFF_LINE`), and the add or update goes on.
Once the work there joined, or updated, and runs in the background or starts at the next login, the last two lines are warnings that name the one line an administrator runs there: "To keep Mac mini running work after sam logs out, an administrator runs this there once:" and `sudo loginctl enable-linger sam`.
The work then joins from `/opt/infinitary/infinitary` as `work join --from-home --agreed`, which asks nothing there since the captain agreed here, and no AppImage is kept there.
Match asks for the password again and installs the new package the same way.
Removing the computer leaves the package installed.
Any other Linux system keeps the AppImage way above.
Only a home that reads the tap installs the package; one that reads none (below, "Infinitary for another system"), such as a development run or the journeys on a Linux runner, sets up Ubuntu 24.04 and 26.04 the AppImage way too.

### Adding, step by step

1. "Reaching sam@mini.local with your SSH key.": one look at the other computer, which writes nothing there - its system and chip (`uname -s`, `uname -m`), the user it runs as, its own name, whether it is this Mac itself (below, "Where a computer joins from"), and whether that user already runs work for a first mate.
   A system with no adapter, or a chip Infinitary is not published for there, is refused as `other-system`; a Linux computer that lacks what its work needs - git, Xvfb for the display its hidden windows draw on (`docs/helper.md`, "No screen needed"), FUSE 2's `fusermount` and library, which open the AppImage, or a library the AppImage needs to start (`docs/linux-packages.md`, "What the AppImage needs") - is refused as `needs-tools`, before anything is sent.
   The refusal names the package for each it lacks, by the program that installs software there (`apt`, with Debian's 64-bit time names where apt knows them, `dnf`, `pacman` or `zypper`; `LINUX_NEEDS`, `src/shared/remoteLogin.ts`), or by its plain name where the look found none of them.
   A Linux computer where that user cannot make a user namespace - Ubuntu 24.04 and later keep an app with no profile of its own from making one - is refused as `sandbox-off`, unless it is Ubuntu 24.04 or 26.04, which gets the package instead (above, "The Ubuntu package").
   The AppImage's own launcher would turn Chromium's sandbox off there, and its work's web pages and cards run in that sandbox or not at all (`docs/linux-packages.md`, "The sandbox").
   The look asks with the launcher's own probe (`unshare -Ur true`); on any other such system the Infinitary package keeps the sandbox on, so that computer joins by Run a command there instead (above, "Joining by a command").
   A Linux computer keeps its work in `${XDG_CONFIG_HOME:-~/.config}/<folder>/work`, as Electron keeps a Linux user's data, and names itself by its pretty host name, or else `uname -n`.
   A Mac that did not let the captain's key in asks for that user's password first (above, "The password, once"), and the look runs again with Infinitary's own key.
   When it does, the look also reads which one, by the pin of that first mate's key, and the id it gave that user, both public, from the grant the work mode keeps there (`JoinedHome`).
   A user that runs this first mate's work as a computer on the list is found again instead (below, "Finding the home again"); one this Mac removed is set up anew; another first mate's is asked about first (below, "Another first mate's Mac"), and one whose grant names no key is refused.
2. "Preparing Infinitary for Mac mini.": Infinitary for that computer's system, got and checked first when it is not this app's own (below, "Infinitary for another system"); then a one-use link for a computer that reaches this Mac only through this Mac's own SSH connection, kept with the address and where the look found that Mac is (`invite`, `{ remoteLogin, via: "ssh", locality }`).
   This Mac opens one SSH connection of its own for the setup (`SshMaster`, below, "Through the home's SSH"), whose own session runs that system's fixed bootstrap there: it makes a fresh folder only that user may enter under `/tmp`, for the join's private socket, and a temporary folder for the copy - on Linux in that user's own cache folder, since a shared `/tmp` may forbid running it - and says where both are.
   This Mac forwards that socket to its own loopback listener over the connection's control socket, then sends the copy in a session of its own, with its own end, saying how much it sent so far (below, "How far the copy has gone"): a Mac home's own Infinitary as one gzipped tar (`packApp`, `src/core/devices/appArchive.ts`, the same archive `/firstmate` sends), or a file - a Mac's published zip, unpacked there with ditto, or a Linux AppImage - which that computer checks against its SHA-256 before it keeps it, refusing a copy that did not arrive whole.
   Once all of it arrived there, "Starting Infinitary on Mac mini.", and only then does the bootstrap get one typed line (`sshJoinSchema`, `src/shared/sshConnection.ts`), the link and the socket, and start the copy as `work join --fetched <app> --from-home` with that line on its input - never in its arguments, where that Mac's other users could read it.
   The join dials this Mac through that socket alone, joins, keeps the copy and sets itself to run in the background (`docs/helper.md`, "Started by the home").
   Both folders are deleted whatever happens, the setup's connection ends with the join, and a link nobody used is closed at once.
3. The joined line, as for any device, and, when nobody is logged in there as that user, "Mac mini starts running work the next time sam logs in there.".
   When that user's session there refused to start it in the background, no login mends it, so the joined line is followed instead by two warning lines: "Mac mini could not set itself to start in the background, so it runs no work for now." and "Ask again to add it.": asking again finds the same computer and tries once more.

`inf:devices:add` answers the device once it joined, or the question for another first mate's Mac (below); each step is a `device_setup` feed line, and the row in Settings -> Devices follows them.
From then on this Mac keeps its own SSH connection to it (below, "Through the home's SSH").

### How far the copy has gone

The copy is made as it is sent, so nothing knows its size before its end: the row and the feed say the bytes sent so far, never a share of a total (captain's approval of FI3-1361, piece 5).
`device_setup` carries it as `copy`: `preparing` on the setup's first line, `sending` with `sent`, the bytes handed to that Mac's input so far, and `starting` once all of it arrived.
This Mac counts each piece of the archive as it hands it to that Mac's SSH session (`copyCount`, `src/core/devices/appArchive.ts`), so the count runs ahead of what arrived by no more than what SSH holds in flight.
The count is said at its first bytes, then at most once a second while it moves, and once more at its end with all it sent: "Sending Infinitary to Mac mini: 42.3 MB sent.", in the size words a file's chip uses (`fileSizeWords`).
Each count is one run of feed lines (`feedRunSchema`, `src/shared/events.ts`): it rewrites the line before it in place while that line is still Activity's newest, the same way the captain's settled runs do (`docs/orchestrator-contract.md`, "Settled runs"), and a count after any other line starts a line of its own.
A copy that stops is refused as before, with its last count left in the feed above the two lines.
Updating a Mac by its address counts a send the same way, or shows its own download count (below, "Downloading on a Mac reached by its address"), and so does updating any computer over the connection (below, "Updating over the connection" and "Downloading over the connection").
After either transfer, the row says "Starting Infinitary on Mac mini…" while the update starts.

### Infinitary for another system

A computer gets this app's own copy when it runs the same system and chip: a Mac home sends its universal bundle to any Mac, as it always has, and a Linux home that runs from an AppImage sends that file to Linux on its own chip (`FarBuilds`, `src/core/devices/farBuilds.ts`).
Any other computer gets the copy of Infinitary published for its system at this computer's own version, from that version's release on the public tap (`PublishedBuilds`, `src/core/devices/publishedBuilds.ts`; `docs/alpha.md`, "Builds by system and chip"): a Mac the universal zip, Linux on x64 the AppImage, and Ubuntu 24.04 and 26.04 the deb (above, "The Ubuntu package").
Its SHA-256 is the one the tap's builds file names for this version, written after the release fetched every file back; a version the file no longer names, once a newer one is published, is checked against the `.sha256` its release publishes beside the file.
The feed says "Getting Infinitary for Studio's system from its published release, and checking it." while it is got, and the row still reads "Preparing Infinitary for Studio…".
Bytes that do not match are refused as `build-unverified` and kept nowhere; a tap that cannot be reached, or a version with no such build, is `no-build`.
Matching bytes are kept in `devices/builds/<version>/<system>-<chip>/`, checked again against the published checksum each time they are sent, used as they are when the tap cannot be reached, and deleted once another version's are kept.
The other computer checks the copy against the same SHA-256 when it arrives (`sha256sum`, or a Mac's `shasum`), so a copy cut short is never kept.
The same build answers a computer that names its system where it gets Infinitary (above, "Getting Infinitary from this Mac"): the command run on a Linux computer, and a computer updated over the connection, which this computer gets and checks before it asks the update order, so its copy starts at once.

Only an installed release reads the tap.
A development run, or an installed build that is no release, reads none, so it adds a computer of another system only by a link pasted at that computer's first launch (`docs/view.md`, "Joining"); a test stands in its own tap with `INFINITARY_PUBLISHED_TAP`, a folder laid out as the tap's releases (`standInTapFetch`), which a packaged app never reads.

### Another first mate's Mac

A user there that runs another first mate's work may run it for one that is gone for good, as after Infinitary was set up again on its Mac.
Add it then asks once, before anything is sent there, and the captain's yes is what lets that user leave it (captain's answer on FI3-985).

1. The look reads the other first mate's pin from the grant there, and `inf:devices:add` answers the question (`{ asks: "leave", address, name }`, `remoteLoginAddAnswerSchema`) in place of a device.
   The feed says only "Reaching sam@mini.local with your SSH key."; nothing was written there and no link was made.
2. Settings -> Devices shows it where the captain clicked: "sam@mini.local runs work for another first mate.", "If that first mate is gone for good, adding Mac mini leaves it: Infinitary removes what it set up there for that one, with its sign-ins." and "Work that never merged stays there.
   If that first mate still answers, nothing changes.", with a danger "Leave it and add" and a ghost "Cancel", which holds the focus so Enter never leaves it.
   Cancel changes nothing.
3. "Leave it and add" asks `inf:devices:add` again with `{ leave: true }`: the steps above run, and the join's line carries `leave` (`sshJoinSchema`).
4. The join there checks the other first mate itself (`docs/helper.md`, "Leaving a home that is gone").
   One that answers stays, and Add it is refused as `still-answers`; one that does not is left as a removal would leave it, keeping each working copy that holds unmerged work, before the join uses the link.
5. After the joined line, the feed says "Mac mini left the other first mate it ran work for.", or "… Its unmerged work stays there." when it kept a working copy, and a warning line when it could not remove all of it.

The first mate's own card for adding a Mac by its address opens Devices, so its Add it asks the same question there.
The other first mate is not told: it does not answer.

### Refusals

Each refusal is two feed lines with `warn` dots, what happened and what to do, and nothing changed there (`remoteLoginWords.refused`).
`inf:devices:add` rejects with the same words, one line each, which Settings -> Devices shows in the address aside.
The address stays in the field.
Try again runs the same add, and nothing retries on its own.
Cancel closes the aside and changes nothing.
Success still closes the aside.
Why SSH failed is read from its own fixed messages after it exits 255 (`sshRefusal`, `src/core/devices/sshRefusal.ts`); why the work mode there refused is its typed outcome.

| Refusal | When | The lines |
| --- | --- | --- |
| `key-locked` | The other Mac accepted the key, but it is locked with a passphrase | "Could not sign in to sam@mini.local. Your SSH key is locked with a passphrase." "Unlock it once in Terminal, then ask again." |
| `agent-declined` | The other Mac accepted the key, but the agent holding it, such as 1Password's, did not sign: the captain declined, did not answer in time, or it could not ask | "Could not sign in to sam@mini.local. The app that holds your SSH key did not approve it." "Ask again, and approve it in that app when it asks." |
| `agent-not-running` | The agent the captain's SSH settings name, such as 1Password's, did not answer at all, whether its socket is gone or left behind with nothing listening: it is not open, so whatever else SSH tried was not let in | "Could not sign in to sam@mini.local. The app that holds your SSH key is not open." "Open that app, then ask again." |
| `key-refused` | It did not accept the key, when updating, removing or changing its address; adding asks for the password instead | "sam@mini.local did not accept your SSH key." "Check that Remote Login is on there and lets you in, then ask again." |
| `password-off` | It did not accept the key, and lets no one in with a password | "sam@mini.local did not accept your SSH key, and does not take a password." "Let your SSH key in there and ask again, or add it with a command instead." |
| `password-wrong` | It did not take the password typed once; said in the feed, and the aside asks again | "sam@mini.local did not take that password." "Nothing was kept. Check it, then try again." |
| `key-not-taken` | Infinitary placed its own key there, and the Mac still did not let it in | "sam@mini.local did not let Infinitary's own key in, after it was placed there." "Its Remote Login may read keys from another file. Add it with a command instead." |
| `remote-login-off` | Nothing answered Remote Login there | "sam@mini.local did not answer over Remote Login." "Turn on Remote Login there, in System Settings under General, Sharing, or start the SSH server on a Linux computer. Then ask again." |
| `unreachable` | Nothing answered at that address, or the connection dropped | "Could not reach sam@mini.local." "Check its address and that it is awake, then ask again." |
| `host-unknown` | This Mac has not checked that address, and the check could not be asked | "This computer has not checked sam@mini.local yet, so it cannot tell it is your computer." "Add it again by its address, and say this is the computer." |
| `host-changed` | It answers unlike the Mac this Mac reached before | "sam@mini.local does not answer as the computer this computer reached before." "If you did not set it up again, someone may be in between, so nothing was sent to it." |
| `other-system` | It runs a system Infinitary is not set up on over SSH, or Linux on a chip with no published build | "Infinitary cannot run on sam@mini.local's system." "It runs work on Macs, and on Linux computers with an x64 chip. Nothing changed there." |
| `needs-tools` | A Linux computer lacks git, Xvfb, FUSE 2 or a library the AppImage needs to start | "Studio needs xvfb, libfuse2 and libgtk-3-0 before it can run your first mate's work." "Install them there with its software app or package manager, then ask again." |
| `sandbox-off` | A Linux computer, other than Ubuntu 24.04 or 26.04, where the AppImage would run without Chromium's sandbox | "Studio would run Infinitary without its sandbox: its system keeps apps from making one." "Install the Infinitary package for its system there, then add it with Run a command there instead. Nothing changed there." |
| `cannot-install` | An Ubuntu 24.04 or 26.04 account may not install software, and the package is missing or not this version | "Studio cannot install software there." "Use an account that can, or install Infinitary there and add it with Run a command there. Nothing changed there." |
| `no-build` | This computer could not get the copy of Infinitary published for that computer's system at this version | "Could not get Infinitary for Studio's system from its published release." "Check that this computer is online, then ask again. Nothing changed there." |
| `build-unverified` | The published Infinitary did not match its published checksum | "The copy of Infinitary published for Studio's system did not match its checksum, so nothing was sent." "Ask again later. Nothing changed there." |
| `already-joined` | That user already runs work for a first mate whose key its grant does not name, or, when updating or changing its address, another first mate's | "sam@mini.local already runs work for another first mate." "Remove it from that first mate, then ask again." |
| `still-answers` | The captain chose to leave another first mate that user runs work for, and it still answers there | "sam@mini.local runs work for another first mate, which still answers." "Remove it from that first mate, then ask again." |
| `in-reach` | That user runs this first mate's work already, as a computer on the list that is in reach | "Mac mini already runs work for your first mate, and is in reach." "Nothing changed there." |
| `same-user` | It is this Mac, as the user Infinitary runs as | "sam@mini.local is the user Infinitary already runs as, on this computer." "Add another user on this computer, or another computer." |
| `forwarding-refused` | Its Remote Login would not carry the join's connection back to this Mac | "Remote Login on sam@mini.local does not let Infinitary's connection through." "Allow forwarding in its SSH settings, then ask again." |
| `cannot-send` | This copy of Infinitary has nothing to send for that system: a development run without `INFINITARY_APP_BUNDLE` for it or a stand-in tap, or an installed one that is no release | "This copy of Infinitary cannot send itself to another computer." "Only an installed Infinitary can add a computer." |
| `busy` | Someone runs Infinitary's work there by hand | "Someone is running Infinitary's work by hand on Mac mini." "Stop it there, then ask again." |
| `failed` | Anything else | "Could not set up Infinitary on Mac mini." "Nothing changed there. Ask again." |

### Where a computer joins from

Whether a computer joins from this Mac itself is this Mac's own finding, never the device's word (`onThisMac`, below, "The saved list").
A connection forwarded through SSH reaches this Mac from its own loopback, so for a Mac added by its address the socket cannot tell; the look tells instead, before the link exists (`placeLocalityChallenge`, `src/core/devices/locality.ts`).
This Mac leaves a fresh token in a file of its own under `/tmp`, which only this Mac has and which every user on this Mac can read, and the look reads that path there.
The token read back means the other end is this Mac, as the captain's user or another one; anything else is another Mac.
The file goes once the look ends, holds no secret, and nothing names this Mac's hardware.
The link carries what the look found (`locality`), and pairing reads it in place of where the device's socket dialed from.
So the user Infinitary runs as on this Mac is still refused (`same-user`), another user here is still this Mac, and another Mac whose user has the same number joins.
It guards a mistake, as `same-user` always has: code already running as the captain could answer either way.
A link made any other way reads the socket, as before.
A computer keeps where it joined from when it finds this Mac again, and on every connection after.
The welcome to its work says it (`onHomeMac`, `docs/connection.md`), and the computer keeps it on its grant: that decides the priority its work runs at there (`docs/helper.md`, "In the background").

### Kept with the device

How this Mac reaches each computer it set up over Remote Login is kept in `devices/ssh.json`, beside the list: `{ "version": 1, "devices": { "<id>": { "address": "sam@mini.local", "connection": "ssh" } }, "cleanups": { ... } }`, 0600.
`address` is the address it was added at, which rides its entry as `remoteLogin`.
`connection` is how it reaches this Mac: `ssh` when it reaches this Mac only through this Mac's own SSH connection to `address` (below, "Through the home's SSH"), as every Mac added by its address does, and `network` when it dials this Mac's address itself.
`cleanups` holds what this Mac has yet to remove on a computer it took off the list (below, "Removing it there"): `{ "<id>": { "address", "name", "at" } }`, bound to that computer's id.
A computer found again over Remote Login keeps the address that found it, whichever way it was added first, so Match and Remove reach it there; on a home run from source, Match builds its commit over the connection instead ("Matching the home's build").
Settings -> Devices names it by it ("a computer · sam@mini.local").
A file that cannot be read leaves every computer on the list and none reached over SSH, and is never written over, so nothing in it is lost; moving it away starts it over.

### Updating by itself

A computer that runs work and connects on an older Infinitary than this Mac's is updated by itself, with no card to click (`DeviceUpdateNudge`, `src/core/devices/deviceUpdateNudge.ts`).
It reads the same comparison as the row (`Computers.list`'s `otherVersion`, `than: "older"`), hung on `WorkDevices.onVersion`, and never asks the first mate to judge it.
So once this Mac installs a new version, each computer it updates comes up on it as it connects.
The update is the one Update in Devices asks (`Computers.update`, below, "Updating"), so its crew pauses and carries on after, and the feed says each step, from "Updating Infinitary on Mac mini.".
While Settings -> Devices is open, its row follows those steps as it follows a click's update, from the first step that says how far it is (a count, or that it is starting there) until a step says it is done or refused, with no Match meanwhile (`useSetups.follow`, `src/renderer/src/settings/devicesState.ts`); a step that says none, such as one that only asks a password, leaves the row as it was.
It is tried once per gap while this Mac runs, never again for a reconnect on the same versions, and never while one is under way.
Every computer this Mac can update with nothing asked of the captain is updated this way (`deviceUpdatesItself`, `src/shared/deviceUpdateNudge.ts`), whether over the connection or over Remote Login with the captain's own SSH key.
It never takes a joined Ubuntu package worker's package route (below, "Updating"): that route is the captain's click alone.
The card below asks the captain instead when this Mac cannot do it alone:

- **A password.**
  The update asked one there, as an Ubuntu computer's package install does.
- **It did not go through.**
  The update was refused or failed, and its card carries what it said.
- **Not this Mac's to do.**
  The computer is too old to take the update order, so it needs a new command run there, or it is a Windows PC, where a newer Infinitary is installed there.
- **The captain said Not now.**
  A Not now for that gap leaves the computer on its version: nothing updates it by itself until either version changes.

The version that did not start on that computer is never sent there again, by itself or by a click (`failedHere`, below, "A copy that does not start").

### The card that asks for it

The app raises one Attention card per computer that runs work, is connected on an older Infinitary than this Mac's and was not updated by itself (above; words in `src/shared/deviceUpdateNudge.ts`; design skill `components/devices/UpdateNudge`).
A computer on a newer Infinitary, or out of reach, gets none; one that goes out of reach takes its card down without memory.
The card is "Update Infinitary on Mac mini": both versions, what the gap costs only while it costs something (no new work, or "still takes work"), and how Update it reaches that computer.
Its button is Update it, which opens Settings -> Devices with the update running (the `update` arrival), or Make the command for one too old to update from here.
It is raised once per gap, with one feed line, and a reconnect that says the same raises nothing.
Its answers carry the gap in their action ids (`update@<this>><that>`, `not-now@...`), so Not now and Update it hold across restarts for that gap only; this Mac or that computer changing version raises it again.
A legacy dismissed resolution names no gap and preserves its saved hold for the known gap.
The current minus only puts the card aside, without recording Not now or a terminal resolution.
A refused update (`device_update`, stage `refused`) raises the card once more with the refusal in its body, and so does an update by itself that did not go through, with what refused it.
It comes down by itself, with one feed line, when that computer runs this Mac's version, and while an update by itself is under way.
The first mate's offer to update the same computer answers that the card is standing instead of making a second.

### Updating the app open there

The app open on another computer follows this computer's version by itself while nobody uses it there (`docs/view.md`, "Following the home's version"), and says each step to this computer (`inf:devices:app-follow`), kept per device while that app is connected as `appVersion.follow`.
The home keeps only what an app behind its version said of that version, and forgets it when the app goes.
The row says the step in a strip after the app's version, beside Update app while it is offered: how much of the version it downloaded, that it waits for nobody to use it there, that it starts again, that it could not, or that it cannot by itself and what to do there (`appFollowLine`).
Update app on the row (`inf:devices:update-app`, `appUpdateOffered`) has that app get the version at once and start again as soon as it has it, even with a window open in front there, once no words are left unsent there; it is offered while the app gets the version, waits or failed, and never while it restarts or cannot.
While a press waits for those words, the app says `waiting` with `pressed`, and the row says it starts again once the words typed there are sent or cleared, so the press shows it arrived; a reconnect ends the press and the row says it waits for nobody to use it again.
The card "Update the app on Mac mini" goes up only when the app said it cannot follow by itself or that following did not go through (`appUpdateCard`, `DeviceUpdateNudge.appsChanged`): both versions, why, what to do there and, when it said any, the app's own words.
A copy that cannot follow offers Got it, since nothing here installs it; one that failed offers Open Devices, where Update app tries again, beside Not now.
Its answers carry both versions and the step in their action ids (`not-now@app:<this>><that>:<step>`), so Not now holds for that gap and step only; it comes down by itself once the app follows, runs this computer's version, or goes.

### Each copy's version

Every copy tells the home the version of Infinitary it runs in its hello (`appVersion`, `docs/connection.md`): a computer's work, the app open on another computer, and the phone, which says its own version and build as its Settings shows them (`PhoneAppVersion`).
Settings -> Devices' list reads the apps open now from the connection's `runningVersions` and says each on its entry as `appVersion`: the version it said, `older` or `newer` as `than` when both read as versions, and `same` when it is this computer's.
Two apps of one device read as the older, and an app from before apps said their version reads with no `app`, as one too old to say it.
A phone's versions are its own, so its `appVersion` is never measured against this computer's.
A computer whose work runs this computer's version carries that version as `workVersion`; one on another version says it in `otherVersion` (above).
When every copy runs this computer's version, the row says it once as a mark at the end of its mono line (`sharedVersion`, `src/shared/devices.ts`); otherwise it says each under its summary, the app first, and an app behind this computer's is a strip in `--warn` (`appBehind`; design skill `components/devices/DevicesTab`, "Each copy's version").
Out of reach, and while no app is open there, a row says nothing of that copy's version, because the home cannot tell.
The first mate reads the same versions in `computer_versions`.

### Updating

`inf:devices:update` updates Infinitary on a computer added by its address to this Mac's version, the same way: "Updating Infinitary on Mac mini.", Infinitary for the system that computer said in its hello - asked there when it never said one - sent in an SSH session of its own and started as `work update --fetched <app> --from-home --home <pin> --device <id> --on-home-mac <true|false>`, which checks the folder there runs work for this home as that computer, stops the run there, keeps the new copy in place of the old and starts it again, then "Mac mini runs this computer's version of Infinitary now.".
An Ubuntu 24.04 or 26.04 computer is asked for that account's password again, in the same aside, and the new deb is installed the same way as the first one; the installed program is then told to start again, with no copy kept in the work folder.
The copy for another system is got and checked first (above, "Infinitary for another system"), and that computer checks it again when it arrives.
This Mac's own SSH connection to it waits while it is updated (`SshConnections.hold`), so its controller never runs from a copy being replaced, and is made again to the new copy after.
So the update there cannot dial this Mac, and `--on-home-mac` carries this Mac's word on whether that computer runs on this Mac instead: its list's `onThisMac` (above, "Where a computer joins from"), left out while the list does not say, which the update keeps on its grant before it sets its agent up anew (`docs/helper.md`, "Started by the home").
When the session there refused to start it in the background, the feed says "Mac mini has this computer's version of Infinitary now." then the two warning lines "Mac mini could not set itself to start in the background, so it runs no work for now." and "Ask again to update it.".
A turn running there is cut off, as when that computer restarts (`docs/helper.md`, "That computer restarts").
For a joined Linux computer not added by its address, Match in the desktop Devices list can fall back to installing its Ubuntu package over Remote Login.
For a package update, this Mac verifies the address, then checks that the Linux account has the named worker's grant for this Mac and an installed Ubuntu package before it asks for administrator approval or installs anything.
The address stays bound to the worker for future package updates, but does not change how the computer connects or add it again.
Match tries the normal connection route before trying a package update, and computers too old to take the update order keep the update command.
When the connection cannot update an installed Linux copy, Match tries the saved address or a candidate from the worker’s current local or private connection before asking for one.
It still verifies the Remote Login host and the worker’s grant, and shows any questions inside that worker’s row.
When that address is refused - unreachable, or another account, worker or package there - the worker's address form opens prefilled with it and says why, so it can be corrected.
An installer or restart there that ran past its time limit may already have updated it, so that warning stays as it is, with no form to try again, whether the address was tried on its own or typed, confirmed and answered with a password in the form.
The worker's questions and address form are its own: another update's or an add's questions, field and refusal stay in their own place, and a reply or Cancel reaches only the flow that asked it.
That fallback asks the worker without getting the AppImage for that system first, since the worker may need the package instead; any copy it asks for is got when it asks.
The package route refuses a worker already running a kept AppImage, even if an Ubuntu package is also installed.
This Mac waits for a welcome on its own version before saying that the updated copy is running.
When Remote Login or administrator approval is unavailable, the address form gives local update and restart instructions.
Other computers not added by address are updated over the connection (below, "Another version, and updating").
A Windows PC that runs work for another computer takes no update yet, and its window there installs none (`docs/windows.md`); this Mac sends it no copy: its row says it has another version and "Install the newer Infinitary on that computer.", with no Match button, and asking to update it says the same (`installedThere`, `installItThereWords`, `src/shared/devices.ts`).

### Removing it there

Remove for a computer added by its address works as for any computer that runs work (below, "Remove").
Out of reach, Remove now also removes what Infinitary set up there over Remote Login at once: "Removing what Infinitary set up on Mac mini, over Remote Login."
(on a Linux computer "…, over SSH."), the copy kept there - a Mac's bundle, a Linux computer's AppImage, or on Ubuntu 24.04 and 26.04 the package's own program - found by what `uname -s` answers there - started as `work remove --from-home --home <pin> --device <id>`, then "Removed what Infinitary set up on Mac mini."
The Ubuntu package itself stays installed.
(`RemoteLogin.removeThere`).
The work mode there checks first that its folder runs work for this home as that computer, and touches nothing of another home's or another computer's (`other-home`), so an old address that reaches another Mac now never removes its Infinitary.
When its folder there is another's, as on a Mac that left this first mate, or holds nothing (`not-joined`), the feed says "Mac mini had nothing of your first mate's to remove." in place of the removed line.
A working copy that still holds unmerged work stays there, as it does when a computer removes itself.
When it could not remove all of it there yet, the feed says so in two warning lines, "Could not remove all that Infinitary set up on Mac mini yet." and "Mac mini tries again the next time sam logs in there.", in place of the removed line: that computer has let the home go, and finishes it itself (`docs/helper.md`, "Removed").
Once nothing is left there to hear it, the home does not listen for it.
When Remote Login could not do it, the feed says so, and this Mac keeps a cleanup-only record bound to that computer's id (`DevicePairing.sshCleanups`), never a connection: it tries again quietly after 1, 5, 15, then every 30 minutes, and at once when this Mac wakes, and says once when it removed something there.
After thirty days it stops, and says so once: "Could not remove what Infinitary set up on Mac mini: this computer has not reached sam@mini.local in thirty days." and "It stays there, with any unmerged work, until it is deleted there by hand."
Removed in reach, a computer this Mac reaches over its own SSH hears it through that connection, which stays until it went or fifteen seconds passed, and then gets the same cleanup as a backstop, which finds nothing of this home's left once it removed it itself.

## A phone that joins by its address

A phone away from this computer's network joins it once by the address its person signs in with, such as `kun@studio`, over SSH (INF-1183, Macs and Linux homes; the phone's side is `docs/ios.md`, "Joining by its address").
Remote Login on a Mac, or an SSH server on Linux, and the person's own account are all it needs: nothing else is set up on this computer.
SSH carries only the joining: the phone asks for an ordinary one-use phone link, joins with it as with a scanned code, and every connection after it is the pinned connection.
The device it adds is listed in Devices for Remove like any phone, never as on this Mac, and the feed line says it joined.

The phone runs one of two fixed commands, both in `src/shared/phoneLink.ts`, each one line for any login shell - sh, bash, zsh, fish or csh - whose script holds no single quote, backslash, `!` or newline.
The link command looks in the account's data folders (`INFINITARY_USER_DATA_DIR`, then the release's and a development run's, on a Mac and on Linux) for the phone's door, and asks it with the system's curl.
The door (`src/core/devices/phoneDoor.ts`, `AppPaths.phoneDoorDir`) is the task channel's pattern: while the app runs it listens on a loopback port and writes that address and a 256-bit key, as the header line curl sends, to two 0600 files in a 0700 folder, emptied when it opens and closes.
Reading the key is the permission: only this account can, and it could already make a link at the keyboard.
A request naming another host or carrying an `Origin` is refused before its key is read.
The door answers one line, `infinitary-phone-link 1 link <link>`, from `DevicePairing.invite({ kind: "mac", phone: true })`, with the default ten minutes; no log or feed line carries the link.
It answers a link only once the connection listens for it (`WorkDevices.settled`), as adding a computer by its address waits before it hands over its link: the phone tries the link the moment it has it, once on each address, and says the computer is out of reach when refused.
With no door, Chromium's `SingletonLock` in a data folder tells a running Infinitary that is too old, with no door, from none open; a Linux home with no curl says so.
The same door, with the same key, answers this account's own `infinitary link` at `/link?for=computer` or `?for=phone` (`LINK_COMMAND_PATH`): JSON with the link and when it expires, from `DevicePairing.invite({ kind: "mac" })`, or `phone: true` for a phone, or with 503 pairing's reason when it made none (`docs/run.md`, "A link by command").
It too answers a link only once the connection listens for it.
The key command, the one a password signs in for, adds the phone's public key line to that account's `~/.ssh/authorized_keys` once, making the folder and file only that account may change.

## A computer that joins by its address

Infinitary at its first launch joins the first mate on another computer by the address its person signs in with, the way a phone does (INF-1827; `docs/view.md`, "Joining by its address").
It signs in there with the person's own SSH, as adding a computer does, and runs one fixed command, `COMPUTER_LINK_COMMAND` in `src/shared/phoneLink.ts`, one line for any login shell under the same rule as the phone's.
That command asks the same door for `/link?for=computer`, as `infinitary link` does, and prints `infinitary-computer-link 1 answer <json> <status>`, or `infinitary-computer-link 1 none <why>` (`readComputerLinkAnswer`).
Its reasons are the phone's - no app open, one too old to have a door, or a Linux computer with no curl - and `controls`, a running app that controls another computer: it opens no door, and keeps that computer's grant in `joined/home.json`.
A door that answers 404 is an Infinitary from before `/link`, read as too old; one that made no link answers its 503, read as refused.
`RemoteLogin.linkAt` runs it with no feed line, and refuses a link that carries this app's own pin.
The link stays in the main process (`Shell.joinAt`, `inf:devices:join-at`): the window reads only the paste path's question, and `inf:devices:join-held` joins with the held link as a pasted one joins, dialing first the host SSH reached (`linkDialingFirst`).
Beside a command the window started, the command's first mate runs `RemoteLogin.linkAt` and answers the link over the local door with `inf:devices:link-at`, which only the window's program asks: the window's page is served no such request, and `infinitary-axi` reaches none (`PROGRAM_ONLY_CHANNELS`, `src/shared/ipc.ts`; `docs/run.md`, "Joining another computer").
No log, feed line, record entry or file carries it.

## One computer, one entry

A Mac that both controls the first mate and runs its work is one entry on the list, with one key (`docs/helper.md`, "A Mac that also controls").
The home has no identity for a computer beyond its keys, so each step below rests on a key the Mac proves it holds.

- **Added again.**
  A Mac whose window joined but whose work kept no grant, added again by a command or its address, finishes that same entry: its work takes the window's grant (`adoptWindowGrant`, `src/core/helper/fromWindow.ts`), so the join is found again and keeps its id, name, projects and sign-ins.
  The address add reads the window's grant first (`windowhome` and `windowdevice` in `LOOK`, `src/core/devices/farSystems.ts`) and finds that entry by it.
- **On the list twice.**
  A Mac whose window and work kept different entries for the same home and the same user folds them into the one its work keeps.
  Its window, connected as its own entry, sends `inf:devices:fold` once it is in reach, carrying the work entry's certificate and a signature by the work's key over `deviceFoldText` (`foldProof`).
  The home checks both entries are Macs of one user, the signature against the kept entry's pinned key (`DevicePairing.provenBy`), and that the entry that goes neither runs work nor keeps a working copy (`Computers.fold`).
  Each project and each live task whose Runs on named it names the kept entry instead (`TaskService.placement.moveRunsOn`), the entry that goes is removed, and the feed says so once (`deviceFoldedLine`).
  A home without the `devices-fold` change is never asked.
- **Another user on the same Mac** stays its own entry: a fold refuses two users, and an add for another user never takes the window's grant.
- **Removed while its window holds it.**
  Removing the entry a window holds never returns that window to its first screen while the Mac's work still runs for the same home as another entry: the window takes that entry's grant at once and carries on, saying so in Settings -> Devices (`docs/view.md`, "A Mac that runs work").
  An entry waiting to be removed once it is back that only its window holds - its work out of reach and no working copy kept there - is removed when that window connects (`Computers.viewContact`).
- **Joined again under a new key.**
  A computer whose data folder was deleted, or whose Infinitary was reinstalled, joins with a new key, so the home cannot prove it is the earlier entry; see "Joined again" below.

## Joined again

A computer that runs work and joins again under a new key is a new entry, and its earlier one stays on the list out of reach, with its tasks and the projects that run on it.
The home never treats the two as one computer on its own: a name and a user prove nothing a key would.

- **The earlier entry.**
  Each entry in reach lists in `earlier` the work entries out of reach with the same name, the same user and an earlier join, that still hold a task or a project (`Computers.list`).
  Settings -> Devices says so under the new entry's row, with one button, Carry its tasks on here.
- **Any entry out of reach.**
  An entry out of reach that still holds a started task that can move is marked `carriesOn`, with how many, and its row says its tasks wait, with Move its tasks to..., which asks where: another computer in reach, or this Mac.
- **The question.**
  Both buttons open one question in place of the row, saying how many tasks continue, that each continues from the last commit the first mate's computer holds, what stays on the old entry - commits after that one, edits not committed, files git does not track and the files in its task folders there - and that the old entry then comes off the list.
- **Carrying on.**
  The captain's yes sends `inf:devices:carry-on` with both ids (`Computers.carryOn`).
  Each project whose Runs on named the old entry names the new one, and each live task's Runs on follows (`TaskService.placement.moveRunsOn`).
  Each started task moves with the move off a computer out of reach (`TaskMoves.requestComputerMove` with its leave-behind flag; `docs/helper.md`, "Moving a task off a computer that is out of reach"), and each one that move refuses is named in the answer, with why.
  An independent review follows its builder and never moves on its own, so the carry leaves it, the question does not count it, and Remove now stops it with the old entry.
- **Removing the old entry.**
  When every task moved, the row reads that its tasks are moving, and once no task but a review is left on the old entry and no move from it is still under way, it is removed with Remove now (above, "Remove"), and the feed says its tasks continue on the new entry.
  A task left with no move under way keeps the old entry on the list, and the feed says how many stayed.
- **What it does not do.**
  It does not bring back what only the old folder held, read the Trash, merge two data folders or attach the old key again.

## Finding the home again

A Mac that controls this first mate and a computer that runs work keep every address this Mac offers, so a change of this Mac's address - the captain chose another, or the network gave it another - strands neither while one still answers.
The grant keeps the address that answered last (`at`) and up to eight others (`also`): those the link named, then those each welcome offers (`addresses`, this Mac's addresses now, below "Where devices find this Mac"), refreshed on every connection (`grantRoutes`, `src/shared/devices.ts`; `JoinedHome.routes`).
The others are kept beside the grant in `home-addresses.json` (0600, with the grant's `deviceId`), never in `home.json`, so a version that knows only the grant, as after a revert or a move from the alpha to the stable channel, still reads `home.json` and dials `at` alone.
An address the welcome no longer offers is dropped then, and the grant is written only when what it keeps changed.
Each dial tries the address that answered last alone, then every address the grant keeps at once, then, when none answered with this Mac's key, every address heard announcing Infinitary on the local network at once beside the one that answered last (`dialHome`, `src/core/devices/dial.ts`; above, "Announcing to devices").
Listening asks the system's Bonjour - macOS's own `dns-sd -B` then `-L`, Avahi's `avahi-browse --resolve` on Linux, Windows' own network browsing on Windows (below), or a development run's `INFINITARY_DNS_SD` stand-in - and sends nothing (`homeFinder`, `src/core/devices/findHome.ts`); a computer with none of them has no last way to try.
The first address that answers with this Mac's key wins and the others are closed; one that answers with another key is refused with `HomeKeyMismatchError` and nothing of it is kept, as at the address that answered last, so another computer that took this Mac's old address or announces Infinitary under its name is never taken for it.
The address that answered is kept as `at`, dialed first from then on.
How often a device tries again stays as it was (`HomeLink`'s retry steps).
A device reached through this Mac's own SSH dials only the route that connection keeps (below, "Through the home's SSH"), and a computer that runs work on this Mac itself dials only loopback: neither keeps other addresses or listens for the announcement.

Another user on this Mac is not stranded so: its command's link names loopback, which no address change moves, and its work dials loopback from its next run whenever its grant names one of this Mac's own addresses, as one kept before that did (`docs/helper.md`, "Finding the home again").
When no address answers and nothing announcing Infinitary answers with this Mac's key, as when the device is on another network, a Mac that controls this first mate comes back by Leave and a new link (`docs/view.md`, "Leave").
A computer that runs work comes back by a new link from this Mac, in a new command, which it uses to find this Mac where it is now, as the same computer (design skill `components/devices/AddAMac`, "Finding this computer again"; `docs/helper.md`, "Finding the home again"):

1. The device sees that the link's `key` is the pin of the home its grant names, checks that key answers at the link's `at`, and sends `POST /pair` there with `"again": true`, showing the key it was paired with rather than a new one (`findHomeAgain`, `src/core/devices/dial.ts`).
2. With that key on the list, the home spends the link and keeps the entry as it was, so its id - which a project's Runs on and a task placed there name - its name and when it joined stay (`DevicePairing.claim`).
   It says so once in the feed, `device_joined` with `again`: "Mac mini found this computer again.
   It runs work as before.", and Settings -> Devices' panel turns to the same words.
3. The device keeps its grant with the link's `at` and nothing else changed, and dials there from then on.

With that key no longer on the list - the home removed it while it was out of reach - the home answers `removed` and spends nothing.
That answer is how the device hears it was removed, so the home forgets the key's pin in `removed.json` and stops listening for it.
The device removes what Infinitary set up there, as a removal would have, then uses the same link to join anew, with a new key.
A link from another home is refused on the device before anything is sent while the home it runs work for answers ("This user already runs work for MacBook Pro.").
While that home does not answer, the device asks its person to leave it first, as a removal would, keeping unmerged work (`docs/helper.md`, "Leaving a home that is gone").
Without a new link, a device follows this Mac to a new address only through the addresses it keeps and the announcement, as above.

A computer added by its address is never stranded so: this Mac's own SSH connection forwards to wherever this Mac listens (below, "Through the home's SSH").
Add it at its address (`RemoteLogin.add`) still finds such a computer again when it is out of reach, and sets its copy of Infinitary up anew.
It finds a computer a command added the same way, once the captain reaches it with SSH, and moves it onto this Mac's own SSH connection for good (captain's pick on FI3-985).
The look reads that its user runs this first mate's work, as a computer on the list (above, "Adding, step by step"), and the feed's `finding` stage, with its `deviceId`, says "Telling Mac mini where this computer is now." in place of "Preparing Infinitary for Mac mini."; the copy's count and "Starting Infinitary on Mac mini." follow in the same stage, with the same `deviceId`, so the computer's own row follows them.
The same one-use link and this Mac's Infinitary go there and start as `work join --fetched <app> --from-home`, which finds this Mac with the link as above (`docs/helper.md`, "Finding the home again"): the home answers `again`, the link's handle names the same id (`claimedBy`), and `inf:devices:add` answers that computer, still on the list with its id, its projects and its sign-ins.
The link says `via=ssh`, so the computer's grant keeps `via` from then on and dials only the route this Mac's connection keeps there, and this Mac keeps it with `connection: "ssh"` and the address that found it (`findHomeAgain`, `keepSshRecord`).
Nothing moves the other way: a computer on this Mac's SSH refuses a link that dials an address (`via`), so a new command never takes it off that connection.
It then runs this Mac's version of Infinitary, as after an update.
In reach, Add it changes nothing there and says so (`in-reach`): only a computer out of reach has anything to find.

Pairing keeps where each device last reached this Mac, the address and port its connection's socket was dialed at, in `devices/reached.json` (`{ "version": 1, "reached": { "<id>": "192.168.1.20:47623" } }`, 0600), noted when it joins, finds this Mac again, or connects.
When that is not among the addresses the connection listens at now (`HomeConnection.listening`, read through `WorkDevices`), this Mac's address changed since (`DevicePairing.addressChanged`), and a computer that runs work out of reach carries `addressChanged` on the list.
The list is read again each time where the connection listens changes (`HomeConnection.onListening`), so once this Mac's network moves and the connection listens at the new address, the list says so with no link made (below, "Where devices find this Mac").
Loopback is listened on whatever this Mac's address, so there only the port can move.
A computer that reaches this Mac through this Mac's own SSH connection never carries `addressChanged` (below, "Through the home's SSH").
While the connection listens on loopback alone, this Mac is on no network and nothing from another Mac reaches it anywhere, so it never says so of another address; while it listens nowhere, it says nothing.
Settings -> Devices then says how it comes back (below, "Settings -> Devices").

## Moving the first mate

The captain can move the first mate, while it runs, to a paired computer that runs work, as from a MacBook to a Mac mini.
Only the captain's click on Move your first mate here, in that computer's ⋯ menu in Settings -> Devices, starts a move; nothing moves the first mate by itself, and the first mate has no tool for it.
The item stands in the menu of a computer that runs work, in reach, on this computer's version and not being updated or removed (design skill `components/devices/DevicesTab`, "Moving your first mate"), and only where the first mate lives, never in a window of another computer.
The old home runs the move (`OutgoingHomeMove`, `src/core/homeMove/outgoing.ts`) and the computer it moves to answers its orders (`IncomingHomeMove`, `src/core/homeMove/arriving.ts`), over the connection that computer already keeps with it, under the contract change `home-move` (`src/shared/contract-changes/home-move.md`).
Pairing and its key checks are left as they are: the new home shows the same key, so every device that trusted the old one trusts it.

### The Ready list

Before the click, the item opens the Ready list under the row: each gap on that computer, asked of it with `inf:home:ready` (`homeMoveFactsSchema`, `src/shared/homeMove.ts`).
A gap that keeps the move from starting shows in `--warn`: that computer is out of reach or runs a version without the change, the two run different versions, a first mate of its own already answers there, it cannot start the first mate in the background, it offers no address another device could reach, it has less than twice the record's size free, or a started task here cannot move now, or cannot move to that computer, and its own reason says why.
A note says what will differ after the move: started tasks here move there first, that computer's own first mate's record is set aside there, the captain signs in again there to each subscription and host where projects live this computer is signed in to, a computer that reaches the first mate only through this computer's own SSH connection is out of reach after the move until it is added again from there, Secrets stay here, integrations are signed in here only, except one that is a host's own sign-in, such as GitHub's, which the note on sign-ins already names (`forgeSignInHost`, `src/shared/integrations.ts`), a project has uncommitted changes, and dictation stays off in this computer's window once it is a window of another computer.
Move now stays disabled while any gap blocks, and `start` asks the Ready list again before it begins.
A move that begins says its first step, Moving your first mate to Mac mini., before `start` answers, so the Ready list shows a step line and Cancel the move from the click on, however long started tasks, the projects' bundles and the record's first file take to cross before the next step.
A Cancel before the stop takes effect at the next piece that would cross, so a project or a record file part-way across stops there and the destination drops what arrived; a project still being bundled stops once its bundle is made.

### What crosses

The move first sends every started task on this computer to the destination, as a captain's move of each would (`requestComputerMove`), so each keeps its key, branch, files and record; a task that cannot move, or whose move waits on a problem or stops, stops the move before anything else crosses.
Each project folder outside the data folder, and the local-only repository of tasks with no project (`default-workspace/`), crosses as a git bundle of every branch and tag, with its remotes, and is cloned there under the same place relative to the home folder or data folder, or in `fleet/` when it lay elsewhere; a folder already there is never written over, and the project lands beside it.
A repository with no branch or tag yet is made empty there; one whose bundle fails stops the move before the stop, so no project is ever cloned without its commits.
The record crosses as files, each in pieces of `PLACED_COPY_CHUNK_BYTES` with its SHA-256, into `home-arriving/<move>/` in the destination's work folder, which stays that computer's own (`RECORD_ROOTS`, `src/core/homeMove/record.ts`): the database, knowledge, the crew's folders, the first mate's own folders, the device list with this home's key, and the first mate's Claude conversations, which land in Claude's own folder there.
A task's temporary folder, the database's side files and anything a computer keeps for itself stay behind.
A database crosses as its own consistent copy, taken with SQLite's backup.
The record first crosses while the first mate still works; a file written while it crossed crosses again at the stop.

### The stop

Then the old home stops everything it does but its connection: no timer, turn, crewmate or program it started writes the record from here (`quiesce`, `src/core/homeMove/wiring.ts`).
Its connection holds (`HomeConnection.hold`): a change a view asks is refused with "Your first mate is moving to Mac mini.
Try again once it has.", and a request a computer that runs work asks is left unanswered, so that computer asks it again of the new home, whose record answers it once.
The old home adds a window for itself to its device list (`DevicePairing.addMovedHome`), so the new home already holds its key, then sends only what changed since the first pass, and the move's list of files last.
`inf:home:arrive` then checks every file's size and hash, sets aside what the destination's data folder held of a first mate of its own, its window's grant to another home and its local-only repository, in `moved-away/<move>/`, puts the record in place, rewrites its paths to the destination's folders as the one-time move does (`rewriteDatabases`), clones each project, writes the next home number and starts the first mate in the background (`startRunAgent`).
It answers the addresses the new home answers at; asked again while it runs or after it answered, it answers the same and places nothing twice.
Before it changes anything of the destination's own it writes `arriving.json` in the move's folder, saying how far it went; anything that fails from there, the first mate not starting included, is undone before the refusal answers: what it placed goes, and what it set aside comes back.
What was made again at a path set aside goes aside in turn, in `moved-away/<move>/made-since/`, so the undo deletes nothing.
An arrive a restart cut short is undone the same way when the old home asks again, unless it had begun to start the first mate: a first mate already answering there is left as it is, one not answering is started again, and a first mate running there is the move arrived.
An abandon asked again while one runs answers with it, and an arrive asked meanwhile waits for it, so the arrive is settled once.
A move that fails before the stop leaves the first mate as it was.
Before it sends `inf:home:arrive`, the old home writes the move's mark, `home-moving/pending.json` in its data folder.
From then on only the destination's answer decides: while that computer is out of reach the old home waits, saying so, and asks again.
A refused arrive is followed by `inf:home:abandon`; an abandon not answered, or refused, is asked again, and one that did not drop the move asks the arrive again, which answers the arrival once it is there.
The old home starts its first mate again only after the destination answered the abandon with nothing of the move left there, and drops the mark then.
The destination refuses that abandon while its arrive runs, once it arrived and while a first mate it started runs, so two computers never both run the first mate.
A launch that finds the mark keeps the first mate stopped: the core starts no timer, recovery or quota reading, the connection holds from its start, and the old home asks the destination again as the move would have (`OutgoingHomeMove.resume`).
The mark goes aside with the record once the old home starts again as a Mac of the new one.

### A destination that never answers

A destination that stays out of reach may never come back, and the old home would wait for it forever.
Once it has been out of reach for `START_HERE_OFFER_MS` since the old home stopped, the step line in Settings -> Devices offers Start my first mate here again (design skill `components/devices/DevicesTab`, "Moving your first mate").
It starts nothing by itself: the captain confirms, warned that the other computer may run the first mate too if it comes back.
The confirmation reaches the old home through the move's hold, which refuses every other change, so a window beside a command can ask it over the local door (`docs/connection.md`, "Holding for a move").
The old home refuses it while the destination is back in reach or an order to it is on its way, since the destination may then be starting the first mate itself.
When the destination comes back the wait starts over, and a step without the offer takes the button away until it has been out of reach that long again.
`OutgoingHomeMove.startHere` then drops the mark and the window it added for itself, takes a home number one above the one the move gave (`DevicePairing.raiseHomeNumber`) and starts the first mate here with the record as it was.
Every device reaches this computer at that higher number, so a device refuses the destination should it come back running the first mate, as it refuses any home with a lower number.
Started by a command, the old home's run ends for its starter to start it again, saying so in words of its own (`docs/run.md`).
A development run may shorten the wait with `INFINITARY_HOME_MOVE_OFFER_MS`, as `tests/e2e/home-move.spec.ts` does; an installed app reads none.

### The newest copy first

Before it lays its copy out, the work asks each other copy in its reach where its copy stands (`inf:copy:where`).
One that heard a home number higher than the one it would take over with means another computer took over or the home moved since: the work refuses and says which.
One whose copy holds more of the same stream's changes is newer: the work brings that copy in file by file, checks each against its listed SHA-256, and starts from it instead, saying so when it starts; its own copy stays as it was.
A newer copy that cannot give its files, or drops part way, refuses the takeover and says to try again; nothing waits for a copy out of reach.

### Every device follows

The old home tells every device it holds, its own window included, with the live frame `inf:home:moved`: the new home's addresses, its number and which device it is.
A device keeps them and dials there, with no new link or code; one from before the change finds the new home by its announcement, since it shows the same key.
The home number lives in `devices/home-number.json` at a home and beside the grant in `joined/` at a device (`src/core/devices/homeNumber.ts`): 1 until the first move, one more at each, said in every welcome.
A device that heard a higher number refuses a home with a lower one, so a first mate a move left behind is never reached again; the phone keeps it the same way (`PhoneHomeMove`, `ios/Infinitary/InfinitaryKit`).
The old home sets its own record aside in `moved-away/<move>/`, deleting nothing, keeps the grant, and starts again as a Mac of the new home: a window of it that also runs its work (`Shell.homeMoved`, `src/main/shell.ts`).
Run by a command with no window, the old home's run ends for good and forgets its background (`docs/run.md`).
On the destination, its window starts again as the home itself, never as a window of the first mate it now keeps (`windowFromWork`, `src/core/helper/fromWindow.ts`).

### What stays

Secrets stay on the old home, sealed by its own keychain; the captain adds them again on the new one.
Only on a computer that keeps the Secrets sealed with its own lock do they go along, and the Ready list says so (below, "Secrets on a computer that keeps a copy").
The new home uses that computer's own sign-ins: subscriptions, hosts where projects live and integrations are never copied.
The move's list of files names each subscription and host where projects live the old home was signed in to, and the new home keeps them in `sign-in-again.json` (`src/core/homeMove/signInAgain.ts`).
It raises a card for each one not signed in there, once, and takes it down when the captain signs in; the file goes once none is left.

## Keeping a copy on another computer

The captain can name any number of paired computers that run work to keep a live copy of the first mate's record.
Only the captain's click on Keep a copy here, in that computer's ⋯ menu in Settings -> Devices, names one, and Stop keeping a copy in its Ready to take over list unnames it (design skill `components/devices/DevicesTab`, "Keeping a copy").
The named computers are kept in `devices/standbys.json`, part of the record, so a move carries them; a computer no longer on the list, or the one the first mate now runs on, keeps no copy.
A removed computer's copy goes with the rest of what Infinitary set up there (`cleanUp`, `docs/helper.md`, "Removed"), and a computer the first mate moves to drops its own copy once the first mate starts there; either way the home takes it off the list without asking it anything.
The home sends each copy (`StandbyStream`, `src/core/standby/stream.ts`) and the computer keeps it (`StandbyKeeper`, `src/core/standby/keeper.ts`), over the connection it already keeps, under the contract change `standby-copy` (`src/shared/contract-changes/standby-copy.md`).
A computer from before is never asked; its row says to update it.
The record still has one writer, the first mate on its home, and nothing here holds up a save.

### One numbered stream

Each named computer first takes one full copy, then every change right after the home saves it, in one numbered stream that every copy follows at its own pace.
The home starts a new stream each time it starts, and a copy on another stream takes a full copy.
A change of a database the home writes in WAL mode, the record's database and knowledge, is the pages its commit wrote, read from the database's log as plain bytes (`readWal`, `src/core/standby/wal.ts`).
While any computer is named the home folds the log back itself, right after reading it to its end in the same turn, once as many pages gathered as SQLite's own threshold; SQLite would otherwise fold it and begin it again at any write, and pages not yet read would be lost.
A log that began again unread anyway starts a new stream.
So does a change the home cannot keep on its disk, or a turn that could not read the record's changes: every copy then takes a full copy rather than miss one.
Any other file of the record is a change when the watch on the record's folders names it, or when the look over the whole record each minute finds it changed: a file that only grew sends what it added, any other its whole content, and another database its own consistent copy, taken with SQLite's backup.
That look, and a full copy's list of files, walk the record a few hundred files at a time, giving the rest of the home its turn between them.
The home keeps the changes on its own disk, in `standby-stream/` beside the record and never part of it, until every copy has them, but never more than a full copy's size.

### A full copy

A full copy is the record as of one change: each WAL database serialized in the same turn that read its log to its end, and every other file by its hash.
The computer says which files it lacks; only those cross, in pieces of `PLACED_COPY_CHUNK_BYTES`, and a file already there with the same hash is used again.
The copy is built beside the one there and put in place at once.
A copy further behind than the home keeps takes a full copy again, as does one that a change does not fit.
An order that fails is asked again after two seconds, then twice as long after each failure in a row, up to the minute between looks over the record, and a copy in sync starts the wait over.
The whole wait holds while the home keeps saving: only the computer coming into or going out of reach, or the copy being stopped, ends it sooner.
An order whose answer is lost may or may not have been applied, so until the computer says again what it holds, each changed file crosses whole, never as what it added.

### On the computer that keeps it

The copy lives in `standby/copy/` in that computer's work folder, never in the app's own data folder, and nothing there opens it as a first mate.
Each batch of changes is written first to `standby/redo.json` and applied whole, so a restart finishes it; the copy on disk is always as of one change of the home's, and a home that stops in the middle of a change leaves a copy that opens.
The work mode's `status` command says when the copy is from.
Windows refuses to rename or remove a file or folder another reader holds open, so the keeper's writes and the reads of another copy gathering this one never overlap: a write waits until every read under way has closed its file, and a read waits while a write runs (`CopyAccess`, `src/core/standby/copyAccess.ts`).
A file's hash answers only once the file is closed again (`hashFile`, `src/core/homeMove/record.ts`), so a rename right after it finds nothing open.

### Where each copy stands

Each named computer's row says where its copy stands: taking a full copy with how much is done, in sync, catching up with how many changes it lacks, out of reach with the time its copy is from, or that its version cannot keep a copy (`inf:standby:views`, `standbyViewSchema`, `src/shared/standby.ts`).
The home keeps that time beside the record, never in it, so keeping it is no change for a copy to follow (`devices/standby-times.json`): after each full copy and at each look over the record while a copy is in sync, so a home that stopped without closing still shows it when it starts again.
Its Ready to take over list (`inf:standby:ready`) is the copy's own line, a gap while it is not in sync, then a line for each other copy (below, "Copies that reach each other"), then each line the Ready list for a move there shows ("The Ready list"), since taking over needs what a move there needs.
In place of the move's lines on Secrets and sign-ins it shows its own: whether that computer keeps the Secrets (below), and which subscriptions and hosts where projects live the first mate uses that the computer has no sign-in of its own for.
So a host's sign-in, GitHub's included, is named once, on its own line with its button, and never again among the integrations signed in here only.
That computer's own sign-ins are made once, from the home's window: the list names each missing one with a button that starts it there, in Settings -> Subscriptions or Settings -> Integrations under that computer, and Keep a copy here's answer names them too.
A missing sign-in is a gap, since a first mate there could not work without it; a first mate that uses no sign-in shows no line on them.
The list only says how ready each computer is; taking over is its own section below ("Taking over").

### Copies that reach each other

Every computer that keeps a copy reaches the other computers that keep one, directly, so a computer about to take over can ask each of them where its copy stands while the home is out of reach (`StandbyPeers`, `src/core/standby/peers.ts`; contract change `standby-peers`, `src/shared/contract-changes/standby-peers.md`).
A computer about to take over gathers the newest copy over it (below, "The newest copy first").

- **Where it listens.**
  From the home's first order about a copy, and on every start while it keeps one, the computer listens at each of its own addresses (`offeredAddresses`, `src/core/connection/addresses.ts`) on `COPY_LINK_PORT`, or on a port the system picks where that one is taken, such as by a second user on the same Mac.
  The standby hello says where (`listens`, `standbyHelloSchema`), and the home keeps it beside the computer's name in `devices/standbys.json`, so every copy's record carries where each other copy listens.
  A computer that dropped its copy stops listening and cuts its links.
- **Who is let in.**
  The listener speaks TLS 1.3 only, with the key the computer joined with, and asks for the dialer's key.
  On `/copies` it admits only a key its own copy of the record names as another computer that keeps a copy (each one's `keyPin` in `devices/devices.json`), and refuses anything else with 401 before any order; a request from a web page, which always carries an Origin, is refused too.
  On `/phone` it admits only a phone its copy of the record lists, by that phone's key and the system it said it runs, which may ask what Take over rests on there and ask it to take over (below, "Taking over from a phone").
  A computer its copy no longer names keeps admitting and reaching nobody.
- **How it dials.**
  It dials each other copy at every address that copy said, pinned to that copy's key (`pinnedAny`, `src/core/devices/dial.ts`), so a computer at that address with another key is never taken for it.
  On a Mac each dial to another address goes through macOS's own nc, as the home's does (below, "Through macOS's own nc").
  A failed dial is tried again after a second, then five, fifteen and sixty seconds, staying at a minute; a change in where that copy listens starts the waits over.
- **One link between two copies.**
  Whichever side can dial opens the link, and either side asks the other over it; when both sides dialed, both keep the link the lower device id dialed.
  An ask still unanswered on the link they close goes again over the one they keep, since every order between copies only reads; an ask is refused as out of reach only once no open link to that copy is left.
  So two Macs whose background work macOS holds back from dialing each other on the local network (below, "Held on the local network") are still in reach once either of them may.
  Each side pings the link every fifteen seconds and drops one that did not answer.
- **What one copy asks another.**
  `inf:copy:where` answers where its copy stands, as the standby hello says it, and the home number it heard last ("Moving the first mate"), so a computer about to take over can tell the newest copy and a home that moved since (`copyOrders`, `src/shared/standbyPeers.ts`).
  `inf:copy:files` lists the copy's files a page at a time with each one's size and SHA-256, answering each page with the files hashed so far, so a large copy never holds an ask up while the rest are hashed, and `inf:copy:piece` answers one piece of one file, so a computer about to take over brings in a newer copy whole; each answer stays under the link's frame, and a path outside the copy is refused.
- **What the captain sees.**
  The home asks each computer that keeps a copy `inf:standby:peers`, which answers each other copy its record names as in reach, out of reach, or not yet heard where it listens.
  Its Ready to take over list says so after the copy's own line, one line for each other copy: that it reaches it, as a note, or, as a gap, that it cannot, adding where both are Macs that macOS lets Infinitary on each use the local network only once someone there allows it.
  A computer from before says to update it, as does an other copy in reach of the home that runs an older Infinitary.
  The work mode's `status` command says which copies the computer reaches while its work runs (`docs/helper.md`, "Its commands").

### Secrets on a computer that keeps a copy

The captain can keep the first mate's Secrets with the copy on any computer that keeps one, sealed so that only that computer opens them, and only once the captain confirmed on that computer itself.
Keep Secrets there, on the Secrets line of its Ready to take over list (`inf:standby:keep-secrets`), asks the computer with the order `inf:standby:lock`, under the contract change `standby-secrets` (`src/shared/contract-changes/standby-secrets.md`); a computer from before is never asked, and its line says to update it; one out of reach is not asked either, and its line says so.
That computer asks the person there to confirm with its own Touch ID, password or polkit prompt, as Secrets confirm a use (`docs/secrets.md`, "Native custody"), and only then makes its lock: an X25519 key whose private half it keeps in its own keychain or Secret Service, under a name of its own apart from its own Secrets (`SECRET_STANDBY_NAMES`, `src/main/host/nativeSecrets.ts`; `StandbyLockKeeper`, `src/core/standby/lock.ts`).
It answers the lock's public half; the home reads its answer every two seconds while the person there has not confirmed, and the line says to confirm there.
A computer the captain never confirmed on holds no lock, so no key in the record opens for it.

The home keeps each confirmed lock in `devices/standby-locks.json` and the sealed values in `devices/standby-secrets.json`, both part of the record (`src/core/standby/sealedSecrets.ts`), so the stream carries them to every copy like any other change.
The sealed file is a recovery archive of every value (`sealRecovery`, `docs/secrets.md`, "Recovery boundary"), under a fresh key each time, and that key sealed again to each lock: a one-time X25519 key, HKDF-SHA256 and AES-256-GCM, bound to that exact archive (`StandbySecrets`, `src/core/standby/secrets.ts`).
The home makes it again when a value, the Secrets home or the list of locks changed, and only while its Secrets are open; it asks no confirmation of its own, since the captain confirmed each lock where it lives.
A computer that stops keeping a copy, or leaves the list, takes its lock off it, and with no lock left the sealed file goes.
A computer's line says it keeps the Secrets only while the sealed file holds a key for it, never on its lock alone, the same check a move's list makes (`sealedFor`), so a lock the home could not seal to yet still reads as keeping none.

A first mate that starts from a copy - a takeover, or a move to a computer that keeps the Secrets - opens the sealed file with that computer's own lock, read from the same keychain item, and takes the values as a restore would: a new home of Secrets with no saved decisions and no approving devices, and nothing else of the old home's authority (`adoptStandby`, `src/core/secrets/protected.ts`).
It takes them on its own only where Secrets on that computer hold no value of their own, and only once: the file it seals next names it as the source.
Its own lock leaves the list, since it is the home now, and the values are sealed again for the other copies.
When it does not take them, it leaves the sealed file as it was and seals nothing over it, so the other copies keep the values.
A locked store, its own lock's included, a use under way or a failed step is tried again at the next change of Secrets there that the taking did not announce itself, and the values are taken in that same run once it can.
An archive this version cannot open holds for the whole run.
Secrets of its own there - a computer that was the home before, whose own Secrets a move left in place - keep both sets as they are, and one card on that first mate asks which to use: Use the copy's Secrets takes them as above, replacing this computer's own once the person confirms there again, as a restore asks, and Keep this computer's Secrets seals its own for the other copies in their place (`whichTitle`, `src/core/standby/words.ts`).
A lock store still locked when the captain answers finishes the answer at the next change of Secrets there, with no restart.
Until the captain answers, this computer uses its own and nothing is sealed over the copy's.
It keeps which exact sealed file it took beside the record, never in it (`standby-secrets-taken.json`, by the file's home, what it was made from and when), so a start after one that took the values but stopped before sealing again knows that file as taken and seals them for the other copies, while a later file from the same home is never mistaken for one it took.

## Taking over

A Mac or Windows PC that keeps a copy and controls the home offers Take over under Controlling in Settings -> Devices while the home is out of reach (design skill `components/devices/DevicesTab`, "Taking over"; contract change `standby-take-over`).
It says when its copy is from, whether that computer said it went to sleep or that Infinitary quit there, and each other copy as the home last told it, marked as maybe newer when it held more changes.
Only the captain's click, confirmed with Touch ID or the password on a Mac, or with Windows Hello or the Windows password where Hello is off on a Windows PC, starts it: nothing takes over by itself, and no timer decides.
The window writes the ask in its work folder (`take-over-ask.json`), and that computer's own work answers it (`TakeOverHere`, `src/core/standby/takeOver.ts`).
Each side hears the other through a watch on that folder and also reads the file again every second, because the system's watch may miss a change.
The work refuses while the home answers it, with no whole copy, before the home told it what taking over needs, or before it joined.

### What taking over needs

The home tells each copy whose version speaks `standby-take-over` what the record does not hold (`inf:standby:home`): its name and folders, each project with its remotes, its sign-ins by name, its home number and every other copy.
The copy keeps it in `standby/home.json` beside the copy, and the home tells it again only when it changed.

### Starting from the copy

The work lays the copy out as a move's files, cloned where the disk can and copied where not, and leaves the copy itself as it was.
It takes itself off `devices/standbys.json`, writes which takeover this is in `devices/take-over.json`, and arrives as a move's destination does (`IncomingHomeMove.takeOver`), with the next home number: one more than the highest the home or this computer heard.
Each project is cloned again from its first remote, or begun empty when it has none.
The first mate and its schedules then resume from the copy; sign-ins and Secrets are added again, as after a move ("What stays").
A failure leaves the copy and says why.

### Every device follows

Every welcome also lists where each computer that keeps a copy would answer (`welcomeTargets`), which each device keeps among the home's own addresses.
When those addresses change, as when a copy is kept or its hello says new ones, the home tells every connected device at once with the live frame `inf:home:routes`, so a device that connected before a copy was kept still follows a takeover there.
A computer that took over shows the home's own key, so every window, computer that runs work and other copy finds it there and takes its higher number.
Its own work dials it at once.
A work request not yet answered is asked once of the home that welcomes it, as after a move.

### Before an act that cannot be undone

Before a merge, a push, a secret use, or telling a computer that runs work what was kept, the home waits until each copy in reach holds every change so far (`SettledBeforeAct`, `src/core/standby/settled.ts`; `StandbyStream.settled`).
A copy out of reach, or one whose version cannot keep a copy, holds nothing up, and the wait has no timer: it ends when the copies answer or leave reach.
A computer that takes over then finds the act recorded, and checks it rather than repeating it.

### The goodbye

Before its computer sleeps, the home tells each device so (`inf:home:goodbye`), and a Mac that keeps a copy says that computer went to sleep rather than that it is lost.

### An old home that returns

While any computer keeps a copy, the home keeps a way back on its own list: a Mac named in the record (`returning.json`) whose key stays on the home alone (`returning-key.json`, never copied), made with the first copy and taken off with the last (`DevicePairing.returningIdentity`).
A move carries neither the key nor which takeover made the home (`take-over.json`): the home it makes drops the way back that crossed from its list, since the old home joins it as a Mac of its own, and makes its own once a copy is kept.
Settings never lists it on the home itself; a computer that takes over keeps a copy for it from then on.
At start, and while any copy is out of its reach, the home dials each such copy at the addresses where a first mate there would answer, as that way back and pinned to its own key, only to hear a welcome (`StepDownWatch`, `src/core/standby/stepDown.ts`).
It looks again after a second, then five, fifteen and sixty seconds, staying at a minute, and at once when a copy's reach changes; nothing promotes by itself.
A home there with a higher number took over while this one was away: this home lists the newest task feed lines it saved after that copy's time, which never reached it, beside its record (`never-sent.json`), sets its record aside as after a move, and opens as a Mac of the new home with the way back as its grant, running work and keeping a copy from then on.
Controlling in Settings shows what never reached the new home, with each task and time.
A home that took over dials as the Mac it was before, whose grant it set aside on arriving, since another copy lists that Mac and not its way back.

### Two homes with one number

A home that took over says its takeover's id in every welcome (`takeOver`), and each device keeps it beside the home number (`home-take-over.json`).
Another home that says the same number with another id is a second home: the device refuses it and keeps dialing the one it knew, and Controlling in Settings says so and to keep one in Settings -> Devices on either.
A device from before keeps no id and takes either.
A home whose watch hears another home with its own number and another takeover holds every act that cannot be undone (`SettledBeforeAct.hold`) and asks in Settings -> Devices (`inf:standby:keep-home`, the `twoHomes` of `inf:standby:views`).
A window that hears a second home tells each home of the other once (`inf:standby:other-home`): the second at once over the link it refused, and the home it follows on its next welcome, each only where that home's welcome lists the `standby-take-over` change.
A home told so holds its acts and asks just as when its own watch hears the other, so two homes that cannot reach each other still both hold and ask; its watch clears it only on hearing the other answer otherwise.
A home that keeps no copies runs no watch, so it answers that it holds nothing (`ok: false`).
Keep this one takes the next number, so the other steps down once it hears it, or once the captain keeps it there; keeping the other steps this one down to it, at the addresses it was heard or reported at, as an old home that returns does, with its acts still held.

### Taking over from a phone

A phone can ask a computer that keeps a copy to take over, the same takeover its window's Take over starts (contract change `standby-phone`).
Each welcome a phone hears lists every computer that keeps a copy and has said where it listens (`standbys`): its id, its name, the pin of its own key and where it listens for the other copies, and `inf:home:routes` sends the list again when it changes.
A computer that never said where it listens is nowhere a phone could reach, so it is left out.
The phone keeps the list beside the home's addresses and number in its paired record; it keeps no record of the home and is never a copy itself.
While the home is out of reach, the computer's sheet on the phone shows Take over with each computer that keeps a copy (`PhoneTakeOverSection`; design skill `components/devices/PhoneView`, "Taking over").
The phone reaches each one on its own link for phones, `/phone` beside the copies' `/copies`, pinned to that computer's own key (`StandbyPeers`, `src/core/standby/peers.ts`).
That computer admits only a phone its copy of the record lists, by the phone's key and the system the phone said it runs (`devices/devices.json`, `devices/systems.json`).
On that link the phone asks `inf:standby:offer` and shows what it answers in the words its own window uses: when its copy is from, whether it reaches the home, whether the home said it went to sleep or quit, each other copy and whether it may be newer, and whether the home told it what taking over needs (`phoneOffer`, `src/core/standby/takeOver.ts`).
Take over on the phone asks once in place, then Face ID or the passcode, with no earlier confirmation reused, and asks `inf:standby:take-over` with an id of its own.
That computer writes the ask as its own window would (`askTakeOver`), so the same work answers it and refuses it for the same reasons; an ask sent again with the same id after a dropped link is the same takeover, never a second one.
The answer comes once the work there started the first mate or refused, in its own words.
A takeover's wait has no end of its own; the phone pings the link as it pings the home, and a computer that stops answering for the session's patience is out of reach, so a dropped link never leaves the phone waiting.
The sheet keeps Take over from a whole round that failed to reach the home until the home answers again, so a reopen after Face ID, which says Reaching, keeps a takeover under way in its row; a deliberate stop, as when the phone's background time ends, lost nothing and shows no Take over.
A row that finds a takeover running there, or whose own ask's link dropped while it ran, reads it again until that computer answers it; after a started answer the row stays taking over, since that computer no longer keeps a copy.
After a takeover the phone dials the home's addresses again and finds the computer that took over, at the home's own key, with the next home number and its takeover's id, and follows it as after a move.
It refuses the old home's lower number, and another home with the same number and another takeover ("Two homes with one number"), and keeps dialing the one it follows; unlike a window, it tells neither home of the other.
A computer from before answers `/phone` with 404, and the phone says to update Infinitary there first.

## Through the home's SSH

A computer may reach this Mac only through this Mac's own SSH connection to it, the way the captain chose for a Mac added by its address (FI3-970).
A launchd agent's dial to an address on the local network waits for a person at that Mac to allow it, even through nc (below, "Through macOS's own nc").
So the background a computer runs in (`docs/helper.md`, "In the background") cannot reach this Mac on a shared network with nobody at that Mac's screen.
This Mac's own SSH runs under the captain's own session, and accepting a connection is no local network dial, so the connection is turned around at the transport alone:

- This Mac's SSH connection forwards a private Unix socket on that Mac to this Mac's loopback listener.
  That Mac gets no new network listener, and its work never dials this Mac's network address.
- The computer is still the TLS client, with its own key, and this Mac still checks it is on the list; SSH carries the bytes and decides nothing.
- Its link says `via=ssh` and names this Mac's loopback, where the forward delivers it (`invite`, `{ remoteLogin, via: "ssh", locality }`), and its grant keeps `via`: it dials only the route that connection keeps there (`docs/helper.md`, "Through the home's SSH"), and with none it is out of reach and dials nothing (`docs/connection.md`, "Where a device dials").
- This Mac keeps it with `connection: "ssh"` (above, "Kept with the device"; `DevicePairing.sshConnections`), and never says this Mac's address changed since it was last in reach: that connection follows this Mac wherever it listens.
- Where it joins from is the look's finding (above, "Where a computer joins from").

### The connection

`SshConnections` (`src/core/devices/sshConnections.ts`) keeps one connection to each computer `DevicePairing.sshConnections` lists while this Mac's Infinitary runs.
It starts only when the shell attaches the paired connection, and the shell stops it on quit after the connection closed, so each computer hears this Mac quit first.
Closing the window does not end it; quitting does, and sleep pauses it.

1. **The captain's own SSH, as the app's own master.**
   `SshMaster` (`src/core/devices/ssh.ts`) starts `/usr/bin/ssh` with `SSH_MASTER_OPTIONS`: `SSH_OPTIONS`' batch mode and narrowing, `ClearAllForwardings=yes`, and a control socket of the app's own (`ControlMaster=yes`, `ControlPersist=no`) in a fresh 0700 folder under `/tmp`, short enough for the suffix SSH adds while it makes it.
   It never shares the captain's own connections, and it ends with its own session.
2. **The controller there.**
   Its session runs the copy of Infinitary kept there - a Mac's bundle, or a Linux computer's AppImage, by what `uname -s` answers there (`CONNECT`, `src/core/devices/farSystems.ts`) - as `work connect --from-home --home <pin> --device <id>` (`docs/helper.md`, "Through the home's SSH"), which checks its folder runs work for this home as that computer, makes a fresh private socket folder and says the socket's path.
3. **The forward.**
   `ClearAllForwardings` clears a forward on the command line too, so this Mac adds the one it needs afterwards, over the control socket alone: `ssh -F /dev/null -S <control> -O forward -R <socket>:127.0.0.1:<port>`, to wherever the paired connection listens now.
   No setting of the captain's adds anything to it, and a forward the captain's settings ask for stays closed.
4. **The route.**
   Told the forward is in place, the controller checks this Mac answers through it with its own key, publishes the route the work there dials (`HomeRoute`), and says whether that work runs: `running`, `at-login` while nobody is logged in there as its user, or `failed`.
   Every 15 seconds this Mac sends a beat, which renews the route's 75-second lease.
5. **Connected only on the welcome.**
   The connection is `connected` once the work there said hello through it, on any version, never on SSH's word or a loaded agent.

What rides the session is one typed, versioned JSON line at a time, at most 4 KiB, never a word a shell reads (`src/shared/sshConnection.ts`).
Every other request - a forward, a session that carries a copy - goes over the control socket with `ProxyCommand=/usr/bin/false`, so once the master is gone it fails instead of opening a connection of its own.

**Tries.**
A connection that drops or cannot be made is tried again after 1, 2, 4, 8, 15, then every 30 seconds, each 20% early or late at most, and from the start again once one stayed up a minute.
SSH's own keepalive (15 seconds, four unanswered) notices a dead network; the welcome and the connection's own pings decide whether the work is reached.
While this Mac sleeps nothing is tried; waking tries each computer not connected once at once.
This Mac's address changing needs nothing: the forward goes to its loopback, and a new port after a restart is forwarded on the next connection.

**Stopped until Try again.**
What only a person can mend stops the tries: a Mac this Mac never reached (`host-unknown`), one that answers unlike before (`host-changed`), a key refused (`key-refused`), locked or not answered by its app (`key-locked`), not approved by its app (`agent-declined`) or held by an app that is not open (`agent-not-running`), Remote Login that will not forward (`forwarding-refused`), Infinitary gone there (`not-set-up`), or a Mac whose Infinitary runs work for another home or as another computer (`other-home`).
SSH has checked that Mac answers as before, so `other-home` is that Mac, which left this first mate: Devices and the feed say its address runs work for another first mate now and to remove it here, never that it reaches another Mac or that its work catches up when it is back (`runsForAnotherFirstmate`).
Try again and Change address are not offered on that row, and Try again for every stopped Mac skips it, because it is not coming back.
The feed says it once, in two warning lines (`sshConnectionWords.stopped`), and once more when the computer is back after Try again ("Mac mini is connected using SSH again.").
A key that is locked, or whose app did not answer (`key-locked`), a key its app did not approve (`agent-declined`) and a key whose app is not open (`agent-not-running`) are mended outside Infinitary, by unlocking the key, approving it in that app or opening that app (`QUIET_RETRY_STOPS`), so this Mac also tries them again quietly when it wakes and every five minutes, each a little early or late.
Devices keeps saying it stopped while it is tried, the feed says why only once until it is back or the captain presses Try again, and the next try after it is unlocked, approved or opened brings it back by itself.
Try again (`inf:devices:try-again`) tries one computer, or every stopped one when none is named, except a Mac that left for another first mate; it changes nothing saved.

**One operation at a time.**
Setting a computer up, updating it, finding it again and changing its address each hold its connection (`SshConnections.hold`): the connection ends first, nothing is tried while the operation runs, and it is made again after.
A computer a command added has no connection until finding it again gives it one, so a connection pairing asks for while its computer is held waits for that operation too, and the controller there never reads a grant the join has yet to move.
A computer that joins during a setup is not tried until the setup is done, so the controller never finds a folder the join has yet to write.

**Ending.**
Stopping a connection ends the controller's input first, so it withdraws its route and removes its own socket folder; then the master over its control socket; then a stop signal, then a kill, each within a bound; then this Mac's control folder goes.
If this Mac's Infinitary crashes, the master's input ends with it, and the controller there withdraws its route and ends; if this Mac sleeps or loses power, the controller hears no beat for 75 seconds and does the same, and the route's lease runs out by itself.
Nothing reads a process number that may be another's now.

### Changing its address

The captain may reach a computer at another address: Change address on its row, or `inf:devices:change-address`.
One look there (`RemoteLogin.changeAddress`) must find a Mac whose Infinitary runs work for this home with this computer's id; anything else changes nothing and says why in two lines - another first mate's (`already-joined`), this first mate's as another computer (`another-computer`), none (`not-set-up`), or one SSH could not reach.
Found, `DevicePairing.setSshAddress` keeps the new address, the feed says "This computer reaches Mac mini at sam@studio.local now.", and the connection is made there.
No address is ever guessed, and no key is ever trusted anew.

## Another version, and updating

A computer that runs work says in its hello the contract it speaks and, from `WORK_UPDATE_SINCE` on, the version of Infinitary it runs (`appVersion`, `docs/connection.md`).
The connection tells the home's `WorkDevices` both at each welcome, whether or not the computer takes work, and that it went once its last connection did (`onWorkVersion`).
Settings -> Devices' list (`Computers.list`) measures them against this Mac's own: the versions of Infinitary when both are known, otherwise the contracts.
A computer connected on another version carries `otherVersion` on its entry - the version it said, `older` or `newer` when both read as versions (`compareSemver`), whether it still takes work, how this Mac would update it, and `downloads` when it would download this Mac's published version itself over the connection - and one out of reach carries none, because the home cannot tell (design skill `components/devices/DevicesTab`, "Another version").
One that takes no work is still connected, so it reads "seen just now" and "no new work", never out of reach, and a task waiting for it says so too ("It takes no new work until it is updated.", `docs/helper.md`, "Runs on"), recalls its update by itself or its Update card ("Updating by itself"), and Automatic's compared computers name it "has an older Infinitary".

### Updating

`inf:devices:update` (`Computers.update`) brings a computer that runs work to this Mac's version, the app by itself as that computer connects (above, "Updating by itself") or the captain's own click on Match in Devices or on the first mate's card:

- **Added by its address**: over Remote Login, as above ("Adding a computer by its address", "Updating").
- **Joined Ubuntu package worker**: try the connection first, then use verified Remote Login if the worker needs a package update.
  Only the captain's click takes that second route (`packageFallback`, from Match in Devices or the card's Update it, which opens Devices).
  The app's update by itself tries the connection alone.
  A worker that comes back on its old version from that update's order without being sent a copy may need a package, so that update is refused as soon as it is back, never after the whole return wait, and the worker gets the card.
  A reconnect before the order is sent, such as a network drop, does not count.
  Its Update it tries the connection again before it offers the package route.
  Devices can try a saved address or an eligible direct peer before asking for one, without changing the pairing.
  The worker stays selected while its update sends a request or needs an answer, including an update started from a card.
- **Any other computer that takes the update order** (`takesUpdate`, a contract from `WORK_UPDATE_SINCE` on, whatever its major): over the connection, below.
- **One too old to take it**: refused as `not-updatable`; Devices' Match makes the command for it instead, which run there once finds this Mac again and keeps this Mac's version (above, "Finding the home again").

Its crew pauses for the update and carries on after, with no message from the captain and no failed turn (INF-721 friction 9; `pauseTasks` and `resumeTasks`, `CrewUpdates.pauseForUpdate` and `resumeAfterUpdate`):

- **When it pauses.**
  Once the update goes ahead there, past every refusal and the password question, and before anything there stops: over the connection after the checks that refuse it, over Remote Login once nothing refused it here (`RemoteLogin.update`'s `pause`).
- **What pausing does.**
  Each crewmate turn running there is asked to stop, and the update waits for those turns to end there, at most `QUIT_SETTLE_MS`.
  Each paused task gets one `turn-resumed` row on its lane, which says its last turn stopped part way while Infinitary there was updated and asks it to check what already took effect before it repeats a step.
  The task's Activity says it paused, and the feed says once that it paused while Infinitary there is updated and carries on once that computer is back.
  No interrupt is recorded, so a kept merge approval stands.
- **While it is updated.**
  Its crew is held as for a computer out of reach (`outOfReach`): nothing is handed to it, a steer waits on its lane, a task set to start there waits, and the idle ladder reads it as moving.
  A turn's end there is a pause: the words it was serving are acknowledged when it stopped clean, and go again, due at once with no attempt spent, when the update cut it off there instead; its last words are never its report, and a report it gave stands, withdrawing its `turn-resumed` row.
- **When it is over.**
  Whatever came of the update, each paused crewmate carries on once that computer is back and caught up, or at once when it never stopped, with its `turn-resumed` row as the turn's first words.

While its update goes on, the computer reads updating, never out of reach (`updating` on its entry, `Computers.updatingOf`; contract change `computer-updating`):

- **From when to when.**
  From its crew's pause (`Computers.pauseFor`) until the update's route ends, whatever came of it.
  The fact lives only in this Mac's memory, so a restart of the app here forgets it.
- **What says so.**
  Devices reads "updating" with an idle dot, and its line keeps the update's own step even when Devices opened part way.
  Each task there carries `place.updating`: its Tasks row reads "updating" in `--fg-3` with no warn mark, and its status says "Mac mini is updating" with the mark as it was (`docs/helper.md`, "Runs on").
  Runs on, the sign-ins note, the device forge rows, Remove's lines and Automatic's compared computers say "updating" too, and so do the phone's task rows.
- **How long without a word.**
  Anything heard of the update renews it: the computer's connection, each step the feed says, and each Remote Login setup step.
  After `UPDATE_RETURN_MS` (3 minutes) heard from nowhere, a computer still not in reach reads out of reach in `--warn`, update or no update, and reads updating again at the next word heard.
- **The feed.**
  The minute's "is out of reach" line waits while a computer reads updating, and counts its minute from when it stops (`PlacedSessions`).
- **Older windows and phones.**
  A view whose hello lacks `computer-updating` gets the list without `updating`, on the read and its push, and keeps today's words.

Device update and change-address requests always answer Remote Login refusals as typed data; Devices shows the two lines in one error line above the list.
A refusal that says the computer did not answer (`unreachable`, `out-of-reach`, `refusalIsAboutReach`) goes once that computer's row says connected again (`reachRefusalAfter`, `src/renderer/src/settings/devicesState.ts`): the row's `connectedAt` is later than the refusal, after the row had said it was not.
For Change address the row has to reconnect at the address that was tried.
Any other refusal stays until the captain's next action.

### Downloading on a Mac reached by its address

Add and Update first look up this computer's version in the published builds, without downloading its zip here.
This computer sends fixed shell instructions, the address and the published SHA-256 over its existing SSH path; an older Mac needs no new helper to read them.
That Mac downloads the universal zip itself over HTTPS, checks its checksum and unpacks it in a private temporary folder.
Before starting it, `codesign --verify --deep --strict -R` verifies its Developer ID signature against the release's Team ID and app identifier in `packaging/release-identity.json`, also read by the release gate.
A bad or wrong-publisher signature follows the same immediate counted-send fallback as a checksum mismatch.
A Mac reached by its address but proven to be this Mac uses the local copy as before, without even looking up a public download.
Each second it reports received bytes and the final release response's Content-Length, if present, never a redirect's size.
Devices and one rewritten feed line say "Mac mini is downloading Infinitary… 200.6 MB of 401.1 MB", or "200.6 MB so far" without a known total.
If fetching, checking or unpacking fails, this computer immediately sends its own copy, explains the fallback and counts bytes sent for Add and Update.
The row clears the failed download count and returns to preparing while this computer gets the fallback build, before the sent count begins.
A development, unpublished or offline version sends its copy directly.
Two minutes without byte movement stops a Mac transfer; heartbeats never renew that deadline, and moving transfers have no thirty-minute ceiling.
The idle clock ends when the transfer finishes, before signature checking, unpacking and start work.
Preparation, the home's own fallback fetch, and silent start/join work use the existing thirty-minute backstop instead.
The public address/checksum lookup has a separate five-second deadline, after which a local bundle can still be sent.
The first empty observation stays silent until either bytes or a release-stated total arrives.
A stalled download falls back to sending; a stalled send names inactivity instead of reporting that the address could not be reached.
A stop by the thirty-minute backstop (`REMOTE_LOGIN_TIME_LIMIT_MS`) before Infinitary starts there names that limit the same way, for Add, Update and the Ubuntu package's send and install, never what SSH answered once it was stopped: in a session it exits 255 then, which `sshRefusal` would read as not reached.
Setting up runs that backstop on its own SSH connection, so a refusal after it stopped that connection is the limit's too.
For Update, a downloaded app enters its start phase when the home acknowledges it; a sent copy enters it only when its script prints the execution marker after checks and unpacking.
A lost outcome after that boundary says it may already have updated and asks the person to check Devices, never claiming nothing changed or inviting a second update while it may still run.
An Add that never claimed its invite remains a definite setup or SSH failure; its unclaimed invite is closed and its warning never describes an update.
Closing a session stops the packing process and the downloader, and removes partial files before returning.
For Update from a direct download, the remote instructions wait for the home's acknowledgement after checking and unpacking, before starting `work update`.
The home commits to that start before sending the acknowledgement, so a lost reply cannot trigger a second update.
Only download/check/unpack failure retries; once that start is acknowledged, its result is never retried as a fetch failure.
Linux keeps its current delivery path, and a Mac a command added downloads over the connection instead (below, "Downloading over the connection").

### Updating over the connection

1. "Updating Infinitary on Mac mini.": the home asks the update order, `fm:firstmate:update` (`updateOrders`, `src/shared/work.ts`), of a connected computer whatever its version (`ask` with `anyVersion`).
   The order takes no arguments and answers `{ restarts }`, and its name and shape never change across majors, so a home on any later major can still ask it.
2. A computer that keeps a copy of Infinitary - another Mac added by a command - gets this Mac's at `/firstmate` with its own key and no code (below, "Getting Infinitary by its own key"), unpacks it beside its own and keeps it in its place; another user on this Mac runs this Mac's own app, so it gets nothing.
   Another Mac that joined by pasting its link runs its own installed app, so its first update keeps this Mac's copy the same way and its background starts that copy from then on (`docs/helper.md`, "Updated by its home").
   This Mac counts what it sends that computer as it goes (`onAppSent`), and the row and one feed line rewritten in place say "Sending Infinitary to Mac mini… 42.3 MB sent", as for a Mac reached by its address (above, "How far the copy has gone").
   Nothing there changes if the copy does not arrive whole.
   That computer reads this Mac's answer to its end even after its tar has the whole app, since tar stops reading at the archive's end, before the padding that fills its last block (`fetchFirstmate`).
3. It answers, then its run ends, and its background, which keeps it running while it is joined, starts it again from what is kept (`docs/helper.md`, "Updated by its home").
   The feed says "Starting Infinitary on Mac mini.", and the row "Starting Infinitary on Mac mini…" until it is back.
4. "Mac mini runs this computer's version of Infinitary now." once it is back on this Mac's version.
   Still on another version after three minutes, the feed says which version it sees rather than claiming the update installed.
   If it is not in reach, the feed says that it has not come back after the update, and one with no background to start it again says it runs the new copy once it is started there again.

Each step is a `device_update` feed line, a count with its `copy` and its `run`, and each refusal two `warn` lines that `inf:devices:update` answers as typed data too (`remoteLoginWords.refused`): `out-of-reach`, `current` (it runs this Mac's version already), `not-updatable`, `cannot-send` (another Mac, from a copy of Infinitary with no bundle to send), and `failed` (the computer could not get or keep the copy).
A turn running there is cut off, as when that computer restarts.

### A copy that does not start

A computer that went back to the copy it kept, because the one an update brought did not reach this Mac within the update's wait (`docs/helper.md`, "A copy that does not start"), says so in its hello (`failedUpdate`) until it has reached this Mac once.
The copy that did not start is the one this Mac sent, so `Computers` keeps this Mac's own version on pairing's `failed-updates.json` (`DevicePairing.noteFailedUpdate`), and the feed says once, in two warning lines, "Mac mini could not start Infinitary 0.1.29, so it went back to the version it ran before." and "This computer does not send Infinitary 0.1.29 there again."
While this Mac's version is that one (`Computers.failedHere`), Match refuses before anything is asked there ("Mac mini could not start Infinitary 0.1.29 before, so this computer does not send it there again.
It can be updated once a newer version is here."), and neither the update by itself nor the update card is for it (`DeviceUpdateNudge`'s `failedHere`, which reads the note `Computers` keeps first, since it hears each version before the card does).
The note goes once that computer runs that version or a newer one, and when it is removed.

### Matching the home's build

Every copy that runs work also says which build it runs in its hello (`build`, `buildIdentitySchema`, `src/shared/buildIdentity.ts`): an installed release names the commit its source index names, and a run from source says so (`source: true`) and names its commit when it has one.
The home says its own from its starter (`starterBuild`, `src/core/devices/sourceArchive.ts`), and `compareBuilds` measures each computer against it, the one comparison the row, the update by itself and the card read:

- **Two releases** compare by version, as above.
- **A home run from source that names its commit** is matched by commit, whatever the other runs: a computer on another commit, or on a release, carries `otherVersion.source` with that commit, and Match builds it there.
- **A home on a release** brings a computer that runs source back to that release, as the update over the connection does.
- **Another account on this Mac** runs this Mac's own copy, so it is compared by version alone and never matched by build: a home run from source offers it no Match for a commit, and builds no second copy there.

The row says "Runs another build than this computer, which runs its code at commit 1a2b3c4." and offers one Match, which replaces Update and Install older version for every computer, installed copies too: it brings that computer to whatever the home runs, older or newer.

Match on a source home (`Computers.matchSource`) sends a committed source archive that a Mac builds and runs; edits not committed stay on the home.
It refuses before anything is asked there when that computer is out of reach, is not a Mac ("Only a Mac builds Infinitary from code, and Mac mini is not a Mac."), or speaks no `source-builds` change ("Install the newest Infinitary release there, then choose Match again."), each with "It keeps the version it runs."
Otherwise its crew pauses as for an update, the home asks the source order, `inf:source:build` (`sourceOrders`, `src/shared/work.ts`), with the commit, and follows `fm:firstmate:update-progress` as it runs: "Mac mini is getting this computer's code.", "… is installing what this computer's code needs." and "… is building this computer's code."
(`fetching`, `installing`, `building`).
A step that fails answers which (`tools`, `fetch`, `install`, `build`, `keep` or `system`) and changes nothing there; the feed says it in two warning lines, the second "It keeps the version it runs."
A build that does not reach the home in time goes back as a release update does (below, "A copy that does not start"), and the home keeps that commit on `failed-updates.json`, so Match does not build it there again until the home runs other code.

The captain is asked once per computer before it first runs the home's code.
The captain's own Match is that yes, and so is Match it on the card "Run this computer's code on Mac mini?"
(`sourceMatchCard`, `src/shared/deviceUpdateNudge.ts`), which the update by itself raises for a computer not yet allowed, with Not now beside it; its answers carry the commit in their action ids (`source:<commit>`).
The yes is kept on pairing's `source-builds.json` (`DevicePairing.noteSourceAllowed`), goes when that computer is removed, and from then on the update by itself matches that computer whenever the home runs another commit, with no card.
For an allowed computer the card comes back only after a match that did not go through: "Match Mac mini again?", with the first paragraph and why, and Match again beside Not now; it does not ask for the yes again or say the password sentence.

`/infinitary-source` (`FETCH_SOURCE_PATH`) answers `{ commit }` from a computer that runs work, already on the list and proven by its key in TLS, as `/firstmate` admits it, with `git archive --format=tar.gz` of that commit from the home's starter folder (`homeSourceOf`): `malformed` for a body it does not read, `unknown` for a key the list does not hold or a view, and `none` for another commit than the one the home runs, or a home that does not run source.
An archive that fails part way cuts the answer short, so the computer never builds half a tree.
How the computer builds and starts it is in `docs/helper.md`, "Building the home's source".

### Downloading over the connection

A Mac a command added - a Mac elsewhere that keeps its own copy - on a contract from `WORK_DOWNLOAD_SINCE` on, whatever its major (`takesDownload`), downloads this Mac's published version itself before it is sent anything; its entry's `otherVersion` says so with `downloads`.
One on an older contract keeps the update order alone, now counted, and takes the download order only from the update after (captain's direction B on INF-322: every work computer).

1. After "Updating Infinitary on Mac mini.", this Mac looks up its version in the published builds without downloading it here, with the five-second lookup a Mac reached by its address uses (`FarBuilds.downloadFor`); a development, unpublished or offline version is sent at once, as above.
2. It asks the download order, `fm:firstmate:update-download`, with the address and the published SHA-256 (`downloadOrders`, `src/shared/work.ts`), whatever that computer's major (`anyVersion`).
   Its name and shape never change across majors, nor in either spelling (`FROZEN_CHANNELS`), as the update order's do not.
3. That computer downloads it with the instructions a Mac reached by its address runs (`MAC_DOWNLOAD`; `downloadHere`, `src/core/helper/update.ts`): its own curl over HTTPS, the published SHA-256, its own ditto and its own codesign against the release's publisher, into a private folder in its work folder that goes whatever happens.
4. While it runs, this Mac asks `fm:firstmate:update-progress` once a second: the bytes received, the size the release states, never a redirect's, and what is under way there (`state`: `idle`, `downloading`, `updating` while it keeps what it got or the update order runs, or `failed` and `mismatch` once a download ended with nothing changed).
   The answer's shape never changes across majors, so a state a later computer adds is read, as under way.
   The row and one feed line rewritten in place say "Mac mini is downloading Infinitary… 200.6 MB of 401.1 MB", or "200.6 MB so far" with no stated size; the first empty count says nothing.
   The download order's own answer carries the last count, so the line ends on it even when a second's asking missed it, and a count that arrives after that answer is not said.
5. Checked and unpacked, the copy is kept as the update order keeps this Mac's, and that computer answers `{ restarts }` with its last count; only that answer has the feed say "Starting Infinitary on Mac mini.", and its run ends for its background to start it again, as above.
6. A download that failed, stopped after two minutes with no byte moving, or did not match its checksum or publisher answers `fallback` with nothing there changed, and so does any other failure the download order answers.
   Heartbeats never renew the two minutes; checking and unpacking what arrived have the update's thirty-minute backstop instead.
   The feed says "Mac mini could not download Infinitary, so this computer is sending its copy." or "Mac mini's download did not match, so this computer is sending its copy.", the row returns to updating, and this Mac asks the update order at once, its send counted as above.
7. A connection that drops while the download runs does not stop it (captain's choice on INF-369: this Mac reconnects and follows the running download until the new version is up).
   This Mac follows it by its progress once that computer is back: it says each count as before, and the update is done once that computer is on this Mac's version, whatever became of the answer it could not hear.
   A download that ended there with nothing changed - `failed` or `mismatch`, or nothing under way there on its old version, as after its run stopped part way and took the download with it - has this Mac send its own copy at once, counted, after the line that says why.
8. Asked the download order while a download or an update already runs there, as after this Mac restarted, that computer answers `{ updating }` and changes nothing; this Mac follows that one the same way, and never says it could not download it, or that nothing changed.
9. Not heard from again within the update's three-minute wait, it may still be downloading or may have updated: the feed says "Mac mini may already have updated Infinitary." and "Check Devices for its version.
   Do not start another update while it may still be running.", never that nothing changed.

Another user on this Mac, a Mac a command added on this Mac itself, and a Linux computer keep the update order alone.
A development run may stand in the publisher check of a computer's own download with `INFINITARY_CODESIGN`, as a test's stand-in release needs; an installed app never reads it.

### Getting Infinitary by its own key

`/firstmate` with `{}` and no code answers this app to a computer that runs work already on the list, proven by the key it shows in TLS, as `/connection` admits it (`DevicePairing.opened`): `unknown` 401 for a key the list does not hold, and `kind` 409 for a Mac that only controls this first mate.
That path and body never change across majors either, nor across the two spellings of the Infinitary rename (`docs/connection.md`, "Two spellings"), so a home on either side of it updates a computer on the other: the computer keeps the app it is sent under its own name and moves its background to it (`docs/helper.md`, "Updated by its home").

## Every connection after

The device opens TLS to `at`, or another address it keeps or hears (above, "Finding the home again"), showing its key, checks the home's pin before it sends a request, and asks for the WebSocket upgrade on `/connection`.
The home admits the request when the key the socket showed is on its list.
Nothing secret rides the request: no header, path or query carries one.

What a connection may do follows what it is, which its hello says (`as`, `docs/connection.md`) within what its kind may be, never beyond: a `view` is Infinitary open on the device, which a `mac` or a `view` may be, and a `work` connection its work, which a `mac` or a `work` device may be.
A `mac` holds one of each at once; a hello that says what its kind may not be is closed as `protocol`.

| Connection | Requests | Pushes |
| --- | --- | --- |
| `view` | the core channels whose `reach` is `views`, as the captain, and `leave` | every core push, numbered |
| `work` | the work requests about a conversation its home opened there, and about its own sign-ins, as itself; its welcome says whether its version takes new work (`takesWork`), and on any version it answers the update order (above, "Updating over the connection") | none |

## Through macOS's own nc

Since macOS 15, local network privacy gates an outgoing dial to an address on the local network: the system asks the person at the screen the first time a program dials one, and drops the dial until they answer (Apple's TN3179).
It tracks the responsible code up the process tree, and exempts a dial made under Terminal or over SSH, and by any child they spawn, but not one a launchd agent makes.
The system's own nc is such a child, and it only moves bytes: carrying a dial through `/usr/bin/nc` (`relayFor` and `relayedStream`, `src/core/devices/relay.ts`), started as `nc <host> <port>` with the app's environment, lets the dial take the exemption of whatever started nc, while the TLS, the home's pin and both keys stay the device's own, end to end.
The app's own dial, by contrast, is tracked back to the app and asked about.
So on macOS a device makes every dial to another computer's address through nc; a dial to loopback goes directly, since local network privacy never asks about it, and so do a dial to a private socket on its own Mac (`docs/connection.md`, "Where a device dials") and every dial on another system.
When nc exits with an error before it relayed a byte, nothing answered there, and the dial fails with what nc said; closing the socket stops nc.
It is every dial `pinnedSocket` makes to an address: joining, finding the home again, the checks before either, and every connection after, for a computer that runs work and for the app as a view (`docs/view.md`).

This is what lets a Mac added by its address over Remote Login join on a shared local network: the copy the home starts there runs under `sshd-session`, so its dial back to the home, carried through nc, takes that SSH exemption and reaches the home with nobody at the other Mac's screen.
What a launchd agent dials is not exempt, though, even through nc.
Once joined, a computer that runs work dials the home from its background agent (`docs/helper.md`, "In the background"), and on a local-network address that dial is gated by local network privacy, so on a headless Mac its background work cannot reach the home there until the permission is granted once on that Mac.
That is why a Mac added by its address is to reach this Mac through this Mac's own SSH connection instead (above, "Through the home's SSH").
A private network service's address, such as Tailscale's, is not a local-network address, so none of this touches it: the background work reaches the home over one with nothing to answer.
The home needs no relay of its own: it only listens, and accepting a connection is not a local network operation (TN3179); it reaches another Mac over Remote Login with `/usr/bin/ssh`, which runs under the person's own shell and is exempt.

### Held on the local network

A Mac a command added joins, since the command runs under Terminal or SSH, and then its background work dials this Mac from a launchd agent.
On a local-network address macOS holds that dial until someone at that Mac allows Infinitary there, so with nobody at its screen it never comes into reach (captain's pick on FI3-1001).
This Mac cannot see a dial macOS holds on another Mac, so it says what it knows (`DevicePairing.heldOnLocalNetwork`, `heldOnLocalNetwork` on the list):

- a computer that runs work, joined from another Mac, out of reach now,
- not reached through this Mac's own SSH connection (above, "Through the home's SSH"),
- never in reach since it joined, with nothing for it in `seen.json`,
- and last reached this Mac at an address on the local network (`onLocalNetwork`, `src/core/connection/addresses.ts`): a home or office range or a link-local address, never loopback or a private network service's shared range.

The join's own dial to hear this Mac's name says so in its hello (`nameOnly`, `docs/connection.md`), and the home counts it as nothing of that computer in reach, so only its work's own connection is.
A computer whose address changed since carries `addressChanged` instead, never both: that old address is the first thing to mend.
While `seen.json` cannot be read, no computer reads as held, since one in reach before cannot be told from one never in reach.
Settings -> Devices says why on its row and offers Add it by its address (below, "Settings -> Devices"), which finds it again over Remote Login and moves it onto this Mac's own SSH connection for good (above, "Finding the home again").
Someone at that Mac allowing Infinitary there brings it into reach too, and once its work reached this Mac either way the row never says it again.

## The saved list

`devices/devices.json` holds `{ "version": 1, "devices": [{ "id", "kind", "name", "pairedAt", "user", "onThisMac", "keyPin" }] }`.
Beside it, in files of their own so a list an older app reads is still the list it knows: `seen.json`, when each device was last in reach; `reached.json`, where each last reached this Mac (above, "Finding the home again"); `removing.json`, the computers to remove once they are back; `removed.json`, the key pins of computers removed while out of reach that have yet to hear it (below, "Remove"); `ssh.json`, how this Mac reaches each computer it added over Remote Login (above, "Kept with the device"); `package-update-addresses.json`, verified Ubuntu update addresses by worker; `systems.json`, what each device said it is in its hello (above, "The shape"); and `pushes.json`, where each paired phone's cards are pushed (`docs/phone-push.md`).
A `systems.json` that cannot be read is never written over, and until it can be every device reads as a computer.
A `pushes.json` that cannot be read is never written over, and until it can be no phone's cards are pushed.
`user` is the macOS user a computer that runs work said it runs as, and `onThisMac` whether the device joined from this Mac itself, as the home found it: from its link when the look over SSH found it (above, "Where a computer joins from"), else from its socket; a list saved before either existed reads as it was.
For such a computer, what the files command needs to know (`docs/files.md`, "Another user on this Mac") comes from where its newest connection dials from, by the same look a join takes, never through this Mac's own SSH connection (`DevicePairing.onThisMac`).
The folder is 0700 and every file in it 0600, set again on each write.
The list is written whole to a temporary file and renamed into place.
It holds no secret: a pin is public.

A list that cannot be read, or one written by a newer version, admits no device and refuses every change, and is never overwritten.
The home says so once in its log.
Moving the folder away starts over.

`name` is the device's own words: at most 64 characters, with no control or formatting characters, so a name cannot reorder the text around it.
The home stores it as text and draws it as text.
It reaches the first mate through `app_state` and a feed line, so it is quoted there like any text a device chose.

## Where devices find this Mac

A new link carries every address this computer has, up to what a link carries, with `CONNECTION_PORT`.
An ordinary computer link offers the local network's name, such as `kuns-macbook-pro.local`, first when this computer is on a local network, then each local address, then the private network.
A phone invitation (`phone: true`) instead offers detected private IPv4 addresses first, then the same local name and local addresses; computer invitations and SSH paths keep their order.
The phone checks each candidate with a pinned non-mutating request before spending the invitation, preserves private-first order on reconnect and refreshes alternatives from the authenticated welcome (`docs/ios.md`).
The first stays `at`.
The rest ride `also`, at most `PAIRING_LINK_ALSO_MAX` (eight) of them, since every installed reader, on a computer and on the phone, refuses a link with more.
A Mac with more addresses than that offers the first nine in this order, and a device that joined hears every one in its welcome.
Container bridges are left out.
The connection listens on loopback plus every one of those addresses, never a wildcard, a public address or a link-local address (`docs/connection.md`).
The other computer tries each in order and keeps the one that answered, with the others beside it, refreshed from each welcome (above, "Finding the home again").
The link in the command for another user on this Mac names `127.0.0.1` alone, since that user dials from this Mac itself.
The addresses on offer are this Mac's own private IPv4 addresses right now (`offeredAddresses`, `src/core/connection/addresses.ts`): the local network's first, Wi-Fi and Ethernet before other interfaces, then the shared range a private network service hands out.
A bridge Linux makes for containers or virtual machines (Docker's `docker0` and `br-`, libvirt's `virbr`) is left out, since no other computer reaches it.
With no private address a link names `127.0.0.1`, which reaches only this Mac.
Nothing offers a chosen address.
`inf:devices:address:set` still answers, and still refuses an address that is not this Mac's own, and changes nothing.
A choice saved in `devices/address.json` is read no more.

Pairing follows this Mac's network while the connection runs (`DevicePairing.followNetwork`), which the shell starts beside the connection.
Nothing tells the app when an address comes or goes, so pairing looks at this Mac's own private addresses every five seconds and tells its listeners once a change has held for two looks in a row.
A moment off the network while this Mac changes Wi-Fi is no change.
The connection then listens on the addresses this Mac has now, in a new listening run (`docs/connection.md`).
Settings -> Devices is sent where devices find this Mac, whole, each time it reads differently (`inf:devices:addresses`), so its rows follow with the tab open.
The list then says a computer still looks for this Mac at its old address, per address (above, "Finding the home again").
A development run may keep the connection to loopback at a port of its own with `INFINITARY_CONNECTION_LOOPBACK_PORT`: pairing then sees no private address, so a link names `127.0.0.1` at that port and the connection listens there alone; a packaged app ignores it.
A development run may also stand in addresses and a network name with `INFINITARY_STAND_IN_ADDRESSES` and `INFINITARY_STAND_IN_NETWORK_NAME`, so a picture can show the rows without this computer's own network; a packaged app ignores both.
Every end-to-end launch sets it (`tests/e2e/launch.ts`), so a test never listens on the Mac's own network, where a firewall can drop the dial, or on the port a real app holds.
The launch reports that port as `connectionPort`, so a test that probes whether its app listens dials that app, never the port an installed app holds (`tests/e2e/phase0-guardrails.spec.ts`).
The app lists only this Mac's own interfaces and never reads another program's settings.

## A home's firewall

A device dials its home at the connection's port, and a Linux desktop or a Windows PC may turn on a firewall that drops that dial, so a computer added by a link never joins and nothing says why.
A Linux home looks at its own firewall (`firewallKeepsOut`, `src/core/devices/firewall.ts`), reading only what any user may read and never asking for a password, and says what it found as `firewall` where devices find it, and a Windows home as `windowsFirewall` (below) (`inf:devices:addresses`, `deviceFirewallSchema`: `ufw`, `firewalld` or `nixos`, with the port):

- **ufw** (Ubuntu, and Omarchy's own): on while its settings file, `/etc/ufw/ufw.conf`, says `ENABLED=yes`.
  Its rules are an administrator's to read, so while it is on the port may be closed.
- **firewalld** (Fedora): running while its service is active, unless `firewall-cmd --query-port` answers that the port is open, or, where it will not answer this user, its default zone is Fedora Workstation's own, which lets every port from 1025 in.
- **NixOS's own firewall**: on while its `firewall` service is active on a computer that has `/etc/NIXOS`.
  Its rules are an administrator's to read too.

Anything else is no warning: a firewall it cannot tell of is never said to keep devices out.
Pairing looks again at most once every ten seconds - each time Settings -> Devices reads where devices find this computer, and with each new link - and pushes what it found when it changed (`DevicePairing.checkFirewall`).
Settings -> Devices then says, in `--warn`, "The firewall on this computer may keep your other computers out." and "To let them in, run this once in a terminal:" over `sudo ufw allow 47623/tcp`, or `sudo firewall-cmd --permanent --add-port=47623/tcp && sudo firewall-cmd --reload`; for NixOS, "To let them in, add this to your NixOS configuration and rebuild it:" over `networking.firewall.allowedTCPPorts = [ 47623 ];` (`firewallWords`, `src/shared/devices.ts`; design skill `components/devices/DevicesTab`, "A home's firewall").
A Windows home reads Windows Defender Firewall's policy through `HNetCfg.FwPolicy2`, which any user may read, with Windows' own PowerShell (`windowsFirewallKeepsOut`): each network profile in use now, and each enabled incoming TCP rule that names this app's program or none (`windowsFirewallSchema`, with the port, the program, the profiles that keep devices out, and whether a rule blocks this app or the profile blocks every incoming connection).
A profile keeps devices out while it is on and blocks every incoming connection, while a rule blocks this app or the port, or while no rule allows them and it blocks what no rule allows, as it does unless someone changed it.
Windows asks its person when this app first listens and writes a rule from their answer, so the warning names the profiles the answer left closed.
Settings -> Devices then says "To let them in, run this once in PowerShell as an administrator:" over one line that lets the profile's rules apply where it blocked every incoming connection, removes the rule that blocks this app where one does, and adds one that allows this app's program at the port on those profiles (`windowsFirewallWay`, `src/shared/devices.ts`).
It stands in the open link or command panel while one for another computer is open, and otherwise under the ways box; the command for another user on this computer never takes it, since that user dials loopback.
A Mac never looks: macOS asks its person before its firewall keeps Infinitary out.
The new field keeps older windows reading the addresses: one that knows only `firewall` shows no warning for a Windows home.

## Leave

A connected device's person can take it off the list from the device itself: it sends the connection's `leave` frame (`docs/connection.md`), and pairing removes its entry exactly as Remove does (`DevicePairing.leave`), so the connection closes it as `unpaired` (4401).
A device that may run work leaves as Remove removes one (`leaveWithWork`, below): its window is cut at once, its work comes here first - or once it is back, when its work is out of reach - and only then is it off the list.
The home says it once in the feed, by the device's own name: "MacBook Air left."
(`device_left`).
A device can leave only itself; it cannot remove another.
A device out of reach cannot tell the home, which lists it until the captain removes it there (`docs/view.md`, "Leave").

## Remove

`inf:devices:remove` deletes the entry and writes the list, and forgets where a phone's cards are pushed (`docs/phone-push.md`).
Before it returns, the connection has closed that device's every connection with `unpaired` (4401), and it drops any frame it reads afterwards from a device it no longer holds.
The device needs a new link, and a new key, to come back.
When the last device goes and no link is open, the connection stops listening.

A computer that runs work never loses work that never merged to a removal (`Computers.remove`):

- **In reach**: each project whose Runs on names it runs on this Mac from then on, so a task that has not started follows its project here, and a task's own Runs on that names it is forgotten, so that task follows its parent's or its project's (`TaskService.placement.forgetRunsOn`); each task started there stops, as the captain's Stop stops one (`CrewSessions.stopTasksOn`); every task's conversation there is closed and its working copy retired once its kept work is here (`PlacedSessions.bringHome`), which refuses when a working copy there still holds work this Mac lacks; and only then is it taken off the list.
  Cut off, it removes what Infinitary set up there (`docs/helper.md`, "Removed").
  Devices reads "Bringing website's unmerged work to this computer…", then "Removing what Infinitary set up on Mac mini…" (`removal` on its row), and the feed "Removed Mac mini. website runs on this computer now.".
  When its work cannot all come here, it stays on the list and the tab says why.
- **Out of reach**, `inf:devices:remove` refuses unless the captain chose: `when-back` keeps it on the list, saved, and removes it as above the next time it is in reach; Keep it (`inf:devices:keep`) takes that back; `now` stops its tasks here, marks their working copies as left there, runs its projects here, and takes it off the list at once.
  A Mac waiting under `when-back` whose work is out of reach and keeps no working copy is removed this way when its window connects (above, "One computer, one entry").
  While a removal runs its row reads its stage, and the computer coming back meanwhile starts no second one.
  Its unmerged work stays on that computer.
  It has not heard it was removed, so its key's pin is kept in `removed.json` and the connection keeps listening for it; the next time it dials it is refused, reads that as removed, and removes what Infinitary set up there, but a working copy that still holds work.
  The pin is forgotten after three refusals - a device needs two in a row - or after thirty days.
  A computer that runs work for another first mate now (`other-home`, above) is not coming back, so Devices asks only to remove it now, and the feed says nothing of this first mate's was there to remove (above, "Removing it there").

## The requests

| Channel | Reach | Catalog action |
| --- | --- | --- |
| `inf:devices:list` | views | the current value of both actions below |
| `inf:devices:invite` | views | `device-invite`, tier `hands` |
| `inf:devices:remove` | views | `device-remove`, tier `hands`; a computer that runs work out of reach takes `when-back` or `now` |
| `inf:devices:fold` | views | none: only a Mac's own window folds its entry into the one its work keeps ("One computer, one entry") |
| `inf:devices:carry-on` | views | none: the captain's yes under Carry its tasks on moves an entry out of reach's tasks and projects to another computer, then removes it ("Joined again") |
| `inf:devices:keep` | views | none: it takes back the captain's own wait to remove a computer once it is back |
| `inf:devices:try-again` | views | none: the captain's Try again, or the `devices.try-again` command, tries this Mac's own SSH connection once more and sets nothing |
| `inf:devices:change-address` | views | none: the captain's Change address reaches a computer added by its address somewhere else, once a look there finds the same computer |
| `inf:devices:add` | views | none: the captain's click adds the Mac at an address over Remote Login; `device-invite` with `how: "address"`, tier `hands`, only offers the card |
| `inf:devices:update` | views | none: the captain's click updates Infinitary on a computer that runs work, over Remote Login or the connection; `device-update`, tier `hands`, only offers the card |
| `inf:devices:shown` | views | none: whether Devices is offered here; every build's home answers `{ shown: true }`, to its own window and to a computer that controls it |
| `inf:devices:stop` | views | none: it closes the captain's own open link and sets nothing |
| `inf:devices:addresses` | views | none |
| `inf:devices:address:set` | views | `device-address`, tier `hands` |
| `inf:devices:runs-on` | views | `project-runs-on`, tier `asked`: where a project's next task starts (`docs/helper.md`, "Runs on") |
| `inf:devices:sign-ins` | views | the current value of `device-sign-in` |
| `inf:devices:sign-in` | views | none: the captain's click starts it there; `device-sign-in`, tier `hands`, only offers the card (`docs/helper.md`, "Its own sign-ins") |
| `inf:devices:sign-in:answer` | views | none: what the captain typed goes to that computer once and is kept nowhere here |
| `inf:devices:sign-in:cancel` | views | none |
| `inf:devices:sign-out` | views | none |
| `inf:devices:forge-sign-in` | views | none: the captain's click in Settings -> Integrations starts that computer's own GitHub sign-in there (`docs/forge.md`, "A computer's own sign-in") |
| `inf:devices:forge-sign-out` | views | none |

The list is also pushed whole, `inf:devices`, after any change to it, to what the home reads of a computer that runs work, or to whether a Mac that controls this first mate is connected.
Every task write reads the list again, so each computer's count of running tasks comes from `TaskService.activeCountsByDevice`, which reads only the computer each running task runs on and composes no task record.
Every row is marked `views`: it is asked from this Mac's window and from a computer that controls this first mate, as the captain at that computer (`devices-from-a-view`, `docs/view.md`, "Settings on a view").
A link a view asks for is this Mac's link, answered to the window that asked; the computer it adds joins this Mac.
A paired view asks the core as the captain, and words typed on it reach the first mate as the captain's; the first mate cannot add or remove a device, and only the captain's click, on this Mac or on a view, can.
The first mate can read the list through `app_state` - each device's id, kind, name and when it joined - which holds nothing secret.
A lost Mac or phone that still controls this first mate can make links and add and remove devices as the captain can, until the captain removes it here or from another computer; removing it cuts it off at once.
Words typed on a paired view are the captain's own words (the captain's pick on FI3-709): in its input or under a card, they may ask the first mate for an own-words change - removing a project, disconnecting an account, signing out of GitHub, moving the projects folder or removing a panel - as words typed on this Mac may.
A lost view can therefore ask for those until the captain removes it here, and it asks directly what a view may (`docs/view.md`, "What the window asks"): sign-ins and API keys, settings, projects, deleting tasks and purging their data.

## Where the captain is

The captain may click and write from more than one window: the one on the computer where the first mate lives, a computer that controls it, or a phone.
Each request says which, as a typed fact the connection proved: the window on the first mate's own computer asks as the captain with no device, and a paired view asks naming its device (`docs/connection.md`, "Requests").
`CaptainPlaces` (`src/core/devices/captainPlaces.ts`) reads it for the captain's own input - a message, a card's choice, close or Got it, a reply under a card, and a line in the Crewmate tab (`CAPTAIN_INPUT_CHANNELS`) - and keeps the latest, in memory only, with its time.

A crewmate hears it in three places, and only while another computer or phone is paired: with one computer there is nowhere else to be.

- A choice on its card and a reply under it say which window they came from: "The captain chose it in their window on Sam's Mac mini."
  Each is named precisely: a computer or phone by the name it joined with, a phone as one, and the first mate's own computer by the name macOS gives it with its role, as the crewmate's prompt lists it: "Sam's MacBook Pro, the computer where your first mate lives".
- emit_card's answer names where the captain's latest click or words came from, and how long ago.
- The paragraph naming the captain's computers (`crewmateComputersNote`, `src/core/pi/piResources.ts`), there once a computer that runs work is listed, tells it what to do with them: a card that needs the captain at one of these computers names it, the one they are using now and how to reach it from there, and a choice from another one than the next step needs is said on a card before anything starts that waits on them there.

The host names the places and decides nothing from them: whether a card needs the captain somewhere, and whether a wait can start, are the crewmate's (`docs/principles.md`, "Build the agent's reach, never its verdicts").
A click from a script in a card's frame names no window.

## Settings -> Devices

Every build offers the tab and the first mate's device cards: `inf:devices:shown` answers yes on every home, stable, alpha and development alike.
The tab offers **+ A phone** on every build too; no flag gates it.
On an app that controls another Mac the tab is that Mac's row with Leave, then that Mac's own Devices, read and changed there; one too old to answer a view's devices shows "Update Infinitary on Mac mini to do this from here." in its place (`docs/view.md`, "Settings on a view").

The tab after Usage, built to the agreed design in the design skill's `components/devices/DevicesTab` (`src/renderer/src/settings/DevicesTab.tsx`):

- **Your devices**: "Your first mate lives on this computer.
  From any computer you add you can control it, and any computer you add can run a project's work.
  Running as another user on this computer runs work, and your first mate can move there.
  Like every user here, it can read files in your home folder." above the map or list; on Linux the last sentence reads "Like every user here, it can read the files your home folder lets other users read.", since Linux keeps no private folders from other users and leaves it to the home folder's own permissions (`anotherUserHere`, `src/shared/deviceNames.ts`).
  Map starts with home selected at the center and puts paired devices in fixed seats around it, up to eight per page.
  Solid lines mean connected, dots mean connecting, and a capped break means out of reach.
  A connected window or a device on an incompatible version can still have no work available.
  List shows every paired device at once and shares the selected device with Map.
  The inspector below holds each selected device's details and actions; other users on the same computer stay under home.
  Home shows Preferred address above Local address when a private-network address exists, without changing the order any device tries.
  On home, a named standby's inspector reads its saved endpoints by device ID and labels them Last reported for takeover, not as proof of current reach.
  It does not ask a device for addresses or substitute a saved SSH destination for them.
  A Mac that only controls this first mate (a `view`) reads "a computer · joined today 14:06 · seen just now" with its dot `ok` and "Controlling your first mate now" under it while Infinitary is open there and connected (`controlling` on its row), and "a computer · joined today 14:06 · out of reach since 14:02" with its dot `warn` once its last connection goes.
  The home hears a view come and go through the connection's `onViewDevice`, held by `WorkDevices`, and keeps when it was last seen in `seen.json`, so a restart still says since when.
  A device that may run work - a Mac, or a computer that only runs work - is drawn in `components/machines/MachineRow`'s shape, and a Mac's summary leads with "Controlling your first mate now" while Infinitary is open there (`controlling`, read as for a view), its dot and state following its work: "Running as Builder" with "another user on this computer · runs work only, while Builder is logged in · seen just now", or another Mac's name with "a computer · joined today 14:06 · seen just now"; then "Runs website and api · Signed in to Codex and GitHub" (or "Runs no project yet", "No sign-ins yet"); its dot `ok` in reach, `idle` while its connection is being made and `warn` out of reach; and on the right "1 task" in the accent, "idle", "connecting" while its SSH connection is being made, or "out of reach" in `--warn`.
  Out of reach it reads "out of reach since 14:02", or "not logged in since this computer restarted" for another user on this Mac nobody has logged in as since.
  Connected on another version of Infinitary, a line under its summary says which, "Has Infinitary 0.1.20, older than this computer's.", with "It takes no new work until it is updated." in `--warn` while it takes none, its dot `warn` and "no new work" on the right; Match stands before Remove (above, "Another version, and updating").
  Under it, each copy's version: "Its app has Infinitary 0.8.3, older than this computer's." in `--warn` while the app open there is behind, "Its work runs Infinitary 0.8.4, as this computer does.", or one line, "Its app and its work run Infinitary 0.8.4, as this computer does.", when both run this computer's; a Mac that only controls and a phone say their app's the same way, a phone's as "Its app has version 0.1.0 (212)."
  (above, "Each copy's version").
  Match on one too old to update from here makes the command for it, for another Mac or for another user on this Mac.
- **Bringing a computer back**: added by a command and out of reach with `addressChanged`, a computer's row adds "It still looks for this computer at its old address." under its summary, for another Mac with "A new command run there brings it back.", and for another user on this Mac with "A new command run as Builder brings it back."; Make a command opens the command panel for that kind.
- **Held on the local network**: a computer a command added that macOS holds on the local network (above, "Held on the local network") reads "a computer · joined today 14:06 · out of reach", and adds under its summary "It has not reached this computer since it joined. macOS lets Infinitary on Mac mini use your local network only once someone there allows it.
  Added by its address, this computer reaches it with your SSH key instead.", with a secondary Add it by its address before Remove.
  It opens one question in place: "Where to reach Mac mini" over "The address you use with SSH for it, as sam.
  Remote Login must be on there.", an address field with "sam@mini.local" as its placeholder, Add it and Cancel.
  Add it asks `inf:devices:add` with that address, as the address form does, and the row reads "Reaching sam@mini.local with your SSH key…", then "Telling Mac mini where this computer is now…".
- **A Mac that has not finished setting up**: a Mac whose window is connected and whose work cannot be set up (above, "A Mac that has not finished setting up") adds its reason under its summary, such as "Its work cannot start: Infinitary on iMac is not allowed to run in the background.
  On a Mac, turn it on there in System Settings › General › Login Items.", with a secondary Fix it, which asks its window to check again, before Add it by its address and Remove.
  Held on the local network it keeps that line instead; while its work is starting it reads "Its work on iMac is starting." with "setting up" on the right and no Fix it.
- **Reached over your SSH**: a computer added by its address reads "a computer · sam@mini.local · connected using SSH" once its work said hello through the connection (`ssh` on its entry, `SshConnections.state`), "connecting using SSH…" before, and after an operation held it (an update, a change of address, finding it again) or a move of its work's folder, which make the connection again by design (`fresh` on the line, until an attempt fails), "reconnecting using SSH…" while this Mac tries again by itself after a drop, and Devices distinguishes these active attempts from an out-of-reach warning.
  Every reader takes one reach value, `reachFrom` (`reachOf` in the core): in reach, connecting, reconnecting, or out of reach.
  `deviceConnecting` is that value being connecting, and published task places, sign-ins and placement explanations carry the reach value instead of compatibility flags.
  Subscriptions' device sign-ins, Projects' Runs on, the device forge rows, Remove's question and the remove-when-back line say "connecting" from it.
  Intelligence and Integrations show a work computer before its first sign-in report, using the Devices explanation when one is known.
  Intelligence offers the same Fix it while the computer's window can act; Integrations shows an inactive row without a sign-in action.
  The first mate's `app_state` for `device-sign-in` separates the window from work reach and carries the typed reason when known.
  It reads connecting for at most `CONNECTING_MS` (5 minutes) from when it began, read when reach is read, and then reads "reconnecting", which Devices shows as an active retry rather than a stopped connection.
  The host clock re-reads the list, so no timer flips it.
  For the first minute after the app starts here (`STARTUP_CONNECTING_MS`), a computer not yet seen since then reads connecting in the core (`reachAfterStart`), so a task there reads "connecting" while the computers come back, and out of reach only after that minute; Devices reads each entry's own reach.
  A far end that keeps ending as moved keeps backing off on the ordinary waits and times out the same way.
  A computer never seen says "connecting using SSH…" on its line for every try, whether its first attempt failed or it dropped before its first hello, and "reconnecting using SSH…" only once it has been seen (design skill `components/devices/DevicesTab`, "Reached over your SSH").
  Devices continues to say it is connecting if the computer has never answered, even after an attempt fails or five minutes pass and retries slow.
  A "could not reach" line on the tab goes when `connectedAt` on the row, the moment the connection the row calls connected began, is newer than the line, or the computer is gone.
  Remove's refusal, a placed conversation's refusal and a waiting Automatic start's words say connecting by the same rule, and the minute's "out of reach" feed line is held until it is really out of reach.
  The line then goes on: "starts the next time sam logs in there" while nobody is logged in there, and "could not start" when that user's session holds no background work, which no login mends.
  Stopped, its mono line says since when it is out of reach, the reason's two lines stand under its summary in `--warn`, and a secondary Try again stands before the rest.
  A ghost Change address stands on every such row and opens one question in place: "Where to reach Mac mini", its address in a mono field, Change it and Cancel; while it looks, the row reads "Reaching sam@studio.local with your SSH key…", with no state or Remove.
  Add it at its address while it is out of reach finds it again on the same row: "Reaching sam@mini.local with your SSH key…", then "Telling Mac mini where this computer is now…".
- **Remove** asks once in place, with Keep it focused, so Enter never removes: "Remove MacBook Air?
  It is cut off at once." over "To come back, it needs a new link." for a Mac that controls this first mate; "Remove Mac mini?
  Its unmerged work comes here first." over "Its task on website stops.
  Infinitary then removes what it set up there, with its sign-ins." and "website runs on this computer after." for a computer that runs work in reach; and "Remove Mac mini?
  It is out of reach."
  ("It is connecting." while its connection is being made) over "Its unmerged work on website is still there.
  Wait, and it comes here before Mac mini is removed.", with Remove when it is back and a danger Remove now, out of reach.
  Waiting reads "out of reach · removed when it is back" ("connecting · removed when it is back" while its connection is being made), with Keep it in place of Remove.
  A computer connected that takes no new work is asked the same, with "Remove Mac mini?
  It takes no new work." over "… Update it, and its work comes here before Mac mini is removed." and Remove once it is updated, since its work can come here only once it takes work again.
- **+ A computer** opens the address form at once, with the caret in its field (captain's pick on INF-4926): "The other computer's address" over "The one you use with SSH.
  Remote Login must be on there." and "This computer then keeps it updated and reaches it by itself.", an address field with "you@mini.local" as its placeholder, Add it and Cancel.
  On a Linux home, where the other computer is as likely Linux, the line under the label reads "The one you use with SSH.
  Its SSH server, or Remote Login on a Mac, must be on.", as does a row's own address question.
  Under them, the micro label "On this network" over the Macs nearby (above, "Macs nearby"): each by its name with the address it fills in, in mono, and "on your list" on one already added.
  The list is one Tab stop: ↑, ↓, Home and End move in it, ↓ in the field reaches it and ↑ from its first row goes back, and Enter or a click fills the field with the user name selected.
  Under the list, a hairline and "Can't turn on Remote Login there?" lead the two other ways, each a secondary button with when to use it beside it and each reached with Tab: "Paste a link into Infinitary there", "You're at that computer, or it is a Windows PC.", which opens the link panel for a Mac (`mac`); and "Run a command there", "You can type in Terminal there.", which opens the command panel for another Mac.
  Updating a Linux computer to Infinitary's package uses the same form with its own words and no other ways (above, "The Ubuntu package").
  A Windows home adds no computer by its address (`addsByAddress: false` on `inf:devices:addresses`), so there + A computer opens the two other ways alone, as before, and never looks for the computers nearby.
  Until that answer arrives, + A computer shows the two other ways alone too, with the link's button focused, and looks for no computer nearby: on a home that adds by its address, the form then takes their place with the caret in its field and the two ways under it; on a Windows home they stay as they are.
  A view on a version from before the address form is never sent `addsByAddress`, on the read or its push (`device-adds-by-address`).
  While it is reached and set up, a row stands in the list with an idle dot, the address, and "Reaching sam@mini.local with your SSH key…", then the Mac's own name and "Preparing Infinitary for Mac mini…", "Sending Infinitary to Mac mini… 42.3 MB sent" with the count moving (above, "How far the copy has gone"), and "Starting Infinitary on Mac mini…".
  A refusal keeps the address in the field and shows its two lines in that aside, with Try again and Cancel.
  A Mac whose user runs another first mate's work asks once under the foot, with Cancel focused, before anything is sent there (above, "Another first mate's Mac").
  A computer whose Infinitary is updating reads "Updating Infinitary on Mac mini…" in place of what it runs, with no Update or Remove.
  **+ Running as another user** makes the command for another user on this Mac at once.
  **+ A phone**, offered on every build, opens the scan-code panel (`docs/ios.md`).
  The link or command stands in a panel at the top of the tab with Copy link or Copy command, "works once · 9:41 left" and Stop it, then reads what joined (`deviceJoinedLine`), and for a computer that runs work "Give it a project in Projects when you want it to run work.", with Done; once that computer has a sign-in the panel goes, and Done dismisses it before then; or "The link expired before any computer used it."
  (or "The command expired…") with Make a new one.
  Making a new one stops the one it replaces.
  The panel lives in the window's memory alone: it outlives a tab switch, and a restart forgets it.
- **Home addresses**: in the home inspector, Preferred address comes first when available, then Local address and Over the internet.
  Each route has a dot, one line and a state.
  The stored SSH destination stays in the peer’s details, separate from takeover addresses.
  The map and list distinguish contact from work readiness and show known setup progress without changing the edge.
  An SSH attempt shows connecting or reconnecting via SSH, and a peer with neither contact nor an attempt shows an out-of-reach warning.
  A link carries every way, so there is nothing to choose.
  Copy a link and Copy a command stand under the rows.

## Asking the first mate

Asked to add a computer without being told which way, the first mate never picks one for the captain: the `device-invite` line tells it to ask the captain first on one decision card of its own, with every way as an option - the computer's address, a link, a command, or another user on this computer - and the address recommended, because this computer then keeps the other one updated and reaches it by itself.
It says a link suits a computer the captain sits at or a Windows PC, and a command one where they can type in Terminal but Remote Login is off.
On a Windows home its line leaves the address out and recommends a link instead (`ActionLine.lineOn`, `src/shared/actions.ts`; `src/core/orchestrator/firstmateAgent.addressWay.test.ts` holds both recommendations).
Asked to connect a Mac, or to remove one, the first mate calls `app_change`, and the host files one card for the captain from typed facts, never the first mate's words (`HandoverOffer`, `src/shared/actions.ts`):

| Asked | The card | Its button |
| --- | --- | --- |
| `device-invite { name? }` | "Connect your MacBook Air": "Make a link here, then paste it into Infinitary on your MacBook Air." and "It works once, for ten minutes. Only your click can make it, so I never see it." | Make a link, beside Not now |
| `device-invite { name?, how: "command" }` | "Add your Mac mini by a command": "Make the command here, then run it once in Terminal on your Mac mini." and "It works once, for ten minutes. Only your click can make it, so I never see it." | Make the command, beside Not now |
| `device-invite { how: "phone" }` | "Connect your phone": the Devices lead for a phone and "Make a link here, then scan its code inside Infinitary on your phone. It works once, for ten minutes. Only your click can make it, so I never see it." | Make a link, beside Not now |
| `device-invite { how: "another-user" }` | "Run work as another user on this computer": "Its work then runs as that user, with sign-ins of its own, and cannot control your first mate.", "That user, like every user on this computer, can read files in your home folder, outside private folders such as Desktop and Documents." and "Make the user in System Settings first. Then make the command here, and run it once as that user." | Make the command, beside Not now |
| `device-invite { name?, how: "address" }`, with no address | "Add your Mac mini by its address" (or "Add a computer by its address"): "I set it up from this computer over Remote Login, with your own SSH key, and keep it updated." and "Open the form here, then type its address or pick it from the computers on this network." | Open the form, beside Not now |
| `device-invite { how: "address", address }` | "Add the computer at sam@mini.local": "I set it up over Remote Login, with your own SSH key. Nothing needs to be open on it." and "Only your click can add a computer, so I ask first." | Add it, beside Not now |
| `device-update { deviceId }` | "Update Infinitary on Mac mini", for a Mac added by its address: "It downloads this computer's version of Infinitary, or this computer sends its own copy, with a count. Remote Login uses your own SSH key." and "Its running work stops for a moment and goes on after."; for another computer in reach on another version "I send this computer's Infinitary to it over your network, and it starts again." (another user on this Mac: "I start it again on this computer's own Infinitary.") with the same second line; for a Mac to match this computer's code, the source card's own title and words, with no line saying its work stops only for a moment, and Match it | Update it, beside Not now |
| `device-update { deviceId }`, too old to update from here | "Update Infinitary on Mac mini": "Its version of Infinitary is too old to update from here, so it needs a new command." and "Make the command here, then run it once in Terminal on Mac mini." (or "as Builder") | Make the command, beside Not now |
| `device-remove { deviceId }` | "Remove MacBook Air?", named from the list itself: "It is cut off at once." and "To come back, it needs a new link. Only your click can remove a computer."; for a computer that runs work "Its task on website stops, and its unmerged work comes here first." and "Then I remove what I set up there, with its sign-ins. Only your click can remove it." | a danger Remove Mac mini, beside Keep it |
| `device-change-address { deviceId }`, for a computer added by its address | "Change the address of Mac mini?": "Open Mac mini in Settings → Devices and type the address it answers at now." and that this computer keeps the new address only if the same computer answers | Open Mac mini, beside Not now |
| `home-move { deviceId }`, in reach and on this version | "Move your first mate to Mac mini?": the first mate and its record would then run there, and Move your first mate here shows what differs first | Open Mac mini, beside Not now |
| `standby-keep { deviceId }` | "Keep a copy of your first mate on Mac mini?": the live copy it keeps, which is never opened there, and "Open Mac mini in Settings → Devices and choose Keep a copy here." | Open Mac mini, beside Not now |
| `keep-home {}`, while two first mates answer | "Keep one of your two first mates": acts that cannot be undone wait until the captain keeps one, and Settings → Devices asks which | Open Devices, beside Not now |
| `device-forge-sign-in { deviceId }`, in reach and not signed in | "Sign in to GitHub on Mac mini": its own sign-in, nothing from this computer's, and the code under its row | Sign in, beside Not now |

For another user on this Mac added by its address, the update card says "This computer copies its own Infinitary there over Remote Login, with your own SSH key, and starts it again."
A user added by a command instead starts again on this computer's own installed app, as before.

The button's effect is `open` on `devices` with `make` (`link`, `command` or `user-command`), `phone`, `addressForm: true`, which opens + A computer's address form, `add: <address>`, `update: <id>` or `remove: <id>`; the captain's click opens Settings -> Devices, which makes the link or the command, adds the Mac or updates Infinitary there, or removes the device, on arrival.
A phone's link rides the optional `phone` field rather than a new `make`, so a view from before ignores it and opens Settings -> Devices with nothing made.
The address, move and copy cards carry `item: <id>` instead, which only chooses that computer's row: its Change address, Move your first mate here and Keep a copy here stay the captain's clicks, as does Keep this one on the two first mates' question.
The GitHub sign-in card opens Settings -> Integrations with that computer's sign-in started (`forgeSignInOn`), as its row's own Sign in does.
On a Mac controlling this one, the same button sends nothing and says this Mac's computers and phones cannot be changed from there yet (`docs/view.md`, "Card buttons that open Settings").
A value a line does not read, such as an address that is not one, is refused as `app_change`'s answer, and no card is offered for it; so is updating a computer out of reach, whose version the home cannot tell, or one on this Mac's version already.
`app_state` carries each computer's `otherVersion`, so the first mate can say which run another version.
A computer that runs work out of reach is not removed on arrival: its question opens instead, so the captain chooses whether to wait for it.
A link or a command therefore exists only after the captain's own click and lives in the panel alone, never in a card, its thread, a feed line, a record entry or a transcript; the one other way to a link is this account's own `infinitary link`, which prints it to that command's output alone (`docs/run.md`, "A link by command").
Asking twice revises one card while it is up, and only the host's cards carry the `devices` target: no agent's `emit_card` offers it.
Once the captain answered that card, with its button or Not now, the next ask is a new question on a new card (`CardEmits.offerCardId`), so adding a second computer is never refused as the first one's answered card.

## While a link is open

The connection listens while something is paired, a link is open, or a computer removed while out of reach has yet to hear it, so a device can use its link, and a command can get Infinitary with it.
A link that expires with nothing paired stops the listener.

## Threats and what meets them

| Threat | What meets it |
| --- | --- |
| Someone on the same network reads or changes the traffic | TLS 1.3 on every address, loopback included. No plain listener exists. |
| A machine answers in the home's place: another macOS user holding the port, a spoofed address on the network, or a wrong address in a link | The device checks the pin before it sends a request or a code, and its key signs only that handshake, so an impostor learns at most which device dialed, nothing it can use. A port someone else holds can keep the home from listening, said in its log, or take connections on another address: they can deny the connection, never join it. |
| Another macOS user on this Mac | Loopback gets no shortcut: it takes the same TLS and a key the home paired. The devices folder is 0700 and its files 0600. The window's own IPC is not reachable from another user. |
| A web page in a browser on either Mac | A request with an `Origin` is refused on `/connection` and `/pair`. The home sends no CORS headers, and a browser trusts neither key. |
| A page or a document opens a link | The Mac does not handle the join scheme. The phone treats an opened link as a proposal and requires confirmation before sending it; it always joins as a view, never a computer that runs work. |
| Someone on the same network sees the announcement | While a phone or a computer that dials this one at an address is on the list, or a direct computer invitation is open, any network this computer is on, public Wi-Fi included, learns that Infinitary runs here, this computer's name and the connection's port. It carries no key and no secret, and learning it joins nothing: a device still needs an open link and the home's pin. A device looking for its home dials what it hears and refuses any computer that does not answer with the home's key, keeping nothing of it. |
| A device says `system` to change what it becomes | The word can only narrow a link for a Mac to a `view`; it never widens, and a link for another user refuses it. |
| Work run as another macOS user on this Mac reads the captain's files | Nothing in the app: macOS opens every home folder to every user on the Mac, outside private folders such as Desktop, Documents and Library, so that user reads the rest of the captain's home folder. The card, the Terminal question and Devices say so, and the app changes no permission (the captain's pick on FI3-862, words only). The files command reaches no further: it reads a home file for that user's tasks as that user, never inside those private folders (`docs/files.md`, "Another user on this Mac"). |
| Work run as the captain on the home Mac | A computer that runs work dialing from this Mac as the home's own macOS user is refused (`same-user`): its work would read and change everything the captain can. Where it dialed from is read off the socket; the user is its own word, so this guards a mistake, and code already running as the captain is out of pairing's reach (below). |
| Someone else sees a link: on the clipboard, in a message, in a screen share, or pasted into a conversation | It works once, for ten minutes, for the kind set at home; that bound is the guard. If someone else uses it first, the device it was meant for is refused as `used`, and the other one is on the list to Remove. |
| Guessing a link | Its code is 256 random bits, kept only as a hash and found by lookup. |
| A link used to find the home again | Only a key already on the list is kept, and only the device holding it can show it in the handshake; the device sends it only after the link's address answers with the home's own key. The one change is that the link is spent: no new device joins and nothing about the listed one changes. |
| The home's saved files are read later, from a backup | The list holds pins, which are public. The home's key would let someone answer as the home to its devices: show them a false stage and read what a view sends. It cannot be used to join the home or to learn a device's key. After any exposure, delete the folder and pair every device again. |
| A paired Mac or phone is lost or stolen | Remove cuts it off at once, and its key is useless afterwards. Until it is removed it can make links, including for a computer that runs work, add a Mac by its address and remove the captain's other devices, as the captain can (`devices-from-a-view`); it cannot keep itself on the list once removed from another computer. Until it is removed, it is the captain at another computer: its typed words are the captain's own (FI3-709), and it can start work, answer cards, change settings and projects, sign accounts in and out, set API keys, delete tasks and purge their data (the requests `docs/view.md` lists, "What the window asks"). |
| A view's saved grant is read later, from a backup of that Mac | It holds the view's own key (`userData/joined/home.json`, 0600, `docs/view.md`), which lets someone reach the home as that Mac until it is removed there. Leave deletes it, and Remove makes it useless. |
| A computer that runs work reads the stage, or a view runs work | Kind is set at home, checked at the claim, and checked on every request. A `work` device is sent no push, asks only the work requests, as itself, and is answered them only about a task the home runs there; a view is refused them. |
| A computer that runs work holds the captain's website sign-ins | Each computer keeps only the sites the captain signed in to on its own task browsers, in its own kept browser profile, and nothing of a sign-in crosses between computers (`docs/task-browser.md`, "Signed-in sites"): a computer that runs work learns no other computer's sign-ins, and the home learns none of its. Someone who reads that computer's disk as its macOS user, or runs work there as that user, can use its signed-in sites as the captain; the built-in engine's cookies are encrypted with a key that computer's system keeps for the app. Remove in Settings signs that computer's kept profile out of a site; removing the computer removes what Infinitary set up there, its sign-ins with it. |
| A prompt-injected first mate | It can neither make a link nor remove a device: it can only offer the host's card, whose words the host writes from the list and whose button only the captain's click runs. `app_change` reads back the list, never a link. |
| Code running as the captain on the home Mac, such as a crewmate's shell | Out of pairing's reach: the same macOS user can read the local door's key and reach the first mate at once with the captain's own reach, Secrets included (`docs/connection.md`, "The local door"), and can read the home's key and add an entry to the list, which takes effect at the next launch. Crewmate isolation is social (`docs/architecture.md` §2, §4). |
| Flooding the home's listener | It listens beyond loopback only while something is paired, a link is open, or a removed computer has yet to hear it (thirty days at most); the local door listens on loopback alone whenever the app runs. A handshake, the request headers and `/pair` each have 10 seconds. `/pair` and `/firstmate` take 4 KiB at most. Frames are capped and slow devices cut (`docs/connection.md`). |
| Dialing or flooding the listener of a computer that keeps a copy | A computer that runs work listens beyond loopback for the other copies only while it keeps one, at its own addresses (above, "Copies that reach each other"). It speaks TLS 1.3 only, with the key it joined with and no resumed session; a handshake, the request headers and a request each have 10 seconds, and a plain request is answered 404. An upgrade carrying an `Origin`, on another path, on `/copies` from a key its own copy of the record does not name as another computer keeping a copy, or on `/phone` from a key it does not list as a phone, is refused before any order. A link takes frames of 64 KiB at most. Another copy's orders read where a copy stands, the home number and the copy's own files, never anything beyond the copy. A phone's two orders read what Take over rests on and ask the same takeover the window's Take over asks: that computer's own work still refuses it while the home answers, without a whole copy, or when another copy heard a higher number, and an ask sent again with the same id is the same takeover. The phone asks Face ID or the passcode before it asks; the computer cannot see that check and trusts the listed phone's key for it, so whoever holds that key can ask a takeover the computer's own work would accept anyway. A copy dials another only pinned to that copy's key, so a computer answering at its address with another key is never taken for it. |
| Someone else sees a command, or reads it off the other Mac while it runs | It carries a link, with a link's bounds: once, ten minutes, the kind set at home. While it runs on the other Mac its words are visible to that Mac's other users; if one of them uses it first, the intended Mac is refused as `used` and the other is on the list to Remove. |
| Getting Infinitary from this Mac | `/firstmate` answers only the holder of an open link for kind `work`, or a computer that runs work already on the list proving its own key in TLS, over TLS pinned to the home's key, and never spends a link; what it sends is the same app anyone can download. Nothing is fetched or written on the other Mac before its person's yes, and the copy joins only with that same link. |
| Updating a computer over the connection | The update order is asked only of a computer on the list and only to bring it to the home's own version: by the app itself when that computer connects on an older version, or by the captain's click. The computer gets Infinitary only from the home its grant pins, keeps it only once it arrived whole, and runs only what its background starts from its own folder. A prompt-injected first mate can only offer the card; no words start an update, since the app starts one only from the versions both computers said. |
| A command's words running on the other Mac | Every value - the link, this Mac's name, the address - is its own quoted word after a script that names none, so a name cannot add a command. |
| An older protocol or a replayed handshake | TLS 1.3 on both sides, with no early data and no resumed session. |
| A misleading device name | The name is limited as above, and the list shows when each device was added and its kind as the home set it. |
| A connection forwarded through SSH reaches this Mac from its own loopback | Where a computer joins from is this Mac's own finding before its link exists - a token only this Mac has, read back over the captain's SSH - and the link carries it; the claim reads that, never the socket. The user Infinitary runs as on this Mac is still refused, and another Mac with the same user number joins. |
| A computer that reaches this Mac through its SSH connection is pointed at an address | Its link and grant say `via=ssh`: a dial with no private socket is refused before anything is sent and never goes to the address instead, and whatever answers at a socket must still show this Mac's key. |
| Another user on that Mac plants a socket, or reads the route | The route names a socket this user owns, in a folder only this user may enter, or it is no route; it holds no key and no link; and the pin, not the socket, decides who answers. |
| Something answers at an address in the other Mac's place | The captain's own SSH checks it is the Mac it reached before, in batch mode it trusts no Mac it never reached, and the app never loosens either, so it refuses before anything is sent. A link also checks the home's key from the other side before it is used. |
| The link on its way to a Mac added by its address | It rides the captain's own SSH and reaches the work mode on its input, never in an argument that Mac's other users could read; it works once, for ten minutes, and is used within seconds or closed. |
| An address made to read as something else | It is one address: no space, no leading dash, and it follows `--`, so it cannot be an option to SSH or a word to a shell. The remote command is a fixed script with every value its own quoted word. |
| The captain's SSH key | It never leaves the captain's agent or the captain's key file: the app reads neither, forwards neither, types no passphrase and stores no password. |
| The password typed once to let Infinitary's own key in | It goes only to the Mac whose check line the captain said yes to, checked by SSH before it signs in, on a run that asks nothing else. It is never an argument, in the environment or in a file: it passes from Infinitary to its askpass on SSH's own input, only when that askpass asks with a word only that run knows, and its bytes are zeroed after. No feed line, log, saved file or task record holds it. |
| Infinitary's own SSH key | Its private half stays in its own 0700 folder, 0600, is never added to an agent and never leaves this Mac; only its public half is placed there. |
| A Mac added by its address claims to run this first mate's work already | The look only reads a pin and an id, both public, and decides what the feed says and whether a Mac in reach is left alone. Finding this Mac again still needs the key on the list, shown in the handshake; any other key is told `removed` and joins anew with the captain's one-use link, as Add it would have. |
| The connection this Mac keeps to a Mac it added by its address | Its own master and control socket, in a 0700 folder only this user enters, never the captain's shared connections; only the one forward the app adds, over the control socket with no setting read; every other request fails once the master is gone instead of connecting anew. A crash ends the controller there through its input, and silence through its 75-second lease. |
| An address that reaches another Mac later | Updating, changing the address and removing each check there first that the folder runs work for this home as that computer, and touch nothing else. A host key that changed stops the connection until the captain's Try again. |
| Something answers at the address a phone typed | The phone shows its SSH fingerprint and asks once, signs in to nothing before the yes, and stops before signing in at a different key later. The link it gets must still show this computer's pin before the phone sends its code. |
| The phone's link door on this computer | It listens only on loopback, answers only the holder of its 0600 key in a 0700 folder - this account, which could already make a link - refuses a request naming another host or carrying an `Origin`, and its folder is emptied when the app opens and closes. Its answer to `infinitary link`, a link for a computer as well as a phone's, adds no reach: the same account could already ask it for a phone's link, which joins a device as a computer's does. |
| The password a phone types once | It signs in only at the fingerprint the person said yes to, runs only the command that adds the phone's own public key, and is kept nowhere on the phone or here. |
| A prompt-injected first mate asks to add an attacker's Mac by its address | It can only offer the card, which names the address; only the captain's click reaches it, and a Mac added runs no work until the captain sets a project to run on it. |

## Not yet

- A real phone joining by its address from away, over a real network: the phone check signs in to this computer's own `sshd`, and a real phone away from home is checked only with the captain's separate consent.
- A Linux home with no curl: the runners all have it, so its words are untested.

- Checking this Mac's own SSH connection between two real Macs on a shared network, with nobody at the far one (FI3-970's acceptance): the tests stand in the far Mac as another folder on this one, over a throwaway SSH server.
- Checking a real Mac add a real Linux computer by its address with the published AppImage: the tests stand in the far computer on the same one, Linux on hosted Ubuntu, and the AppImage with a stand-in.
- Linux on an Arm chip, and Windows, by their address: no Linux Arm build is published, and Windows would be an adapter of its own (`FAR_SYSTEMS`).
- The command for another computer from a Linux home to a Mac, and a Mac updated over the connection from a Linux home, unpack the published zip with that Mac's own ditto; no test runs a Linux home with a Mac on its other side.
- What runs work, and the requests it asks, are `docs/helper.md`.
- Moving the first mate between two real computers on a shared network: the journey stands in the destination as another folder on this computer, with its work mode in the test's own process.
- Two real computers that keep a copy reaching each other on a shared network, through macOS's own nc and its local network permission: the tests stand both in on loopback, in the test's own process.
- Secrets crossing in a move: they stay on the old home, and the captain adds them again on the new one.
- An old home that returns finding a copy that took over on a shared network between two real computers: the tests stand both in on loopback.
- A device following this Mac to a new address it neither keeps nor hears announced: when the device is on another network after the address changes, a Mac that controls it still needs Leave and a new link, and another Mac that runs work a new command (above, "Finding the home again"); one added by its address is reached over this Mac's own SSH, and another user on this Mac dials loopback, neither of which moves.
- Updating, over the connection, a computer joined before `WORK_UPDATE_SINCE`: it knows no update order, so a new command run there once updates it.
- Checking on a real Mac that a Mac added by its address starts its work at its user's next login; the tests stand in launchd.
- Checking that the connection follows a real network change, a laptop joining another Wi-Fi: the tests stand in this Mac's network.
- This Mac's row saying what it runs and is signed in to.
- A setup row for git or Claude Code missing on the computer: the card says what the join found and asks for nothing about it.

- A Mac that joined at its first launch keeps the app the person installed and its work follows that app; updating it from here keeps a copy in its work folder, as for a Mac a command added (`docs/helper.md`, "A Mac that also controls").

## Tests

- `src/core/devices/phoneDoor.test.ts`: a phone's fixed commands, run as sshd runs them under each login shell this computer has, with the system's curl: the link the real pairing made, answered only once the connection listens for it, the Mac and Linux data folders, the door's modes and refusals, not open, too old, no link, and the key let in once; and the door's answer to `infinitary link`, a computer's link and a phone's, answered only once the connection listens, its refusals and pairing's reason.
- `tests/e2e/home-move.spec.ts`: the captain moves the live first mate by keys from Settings -> Devices to a computer that runs work; the old home's process ends, the new home keeps the record at number 2 with the project cloned with its branches, the old home opens as a Mac of the new one, and the computer that runs work follows it (above, "Moving the first mate"); a first mate started by a command moves from the window beside it, the command ending for good and forgetting its background while the window follows as a Mac of the new home with its work; and with a destination that never answers, Start my first mate here again from that window passes the move's hold, ends the command in its own words and starts the first mate here at the next home number ("A destination that never answers").
- `tests/e2e/standby-copy.spec.ts`: the captain names two computers to keep a copy by keys; both read in sync, Ready to take over lists the copy first, one stops while the first mate saves and reads its copy's time, starts again and catches up, the three records compare equal after a quiet moment, neither computer holds a first mate's record outside its copy, a home killed in the middle of saving leaves copies that pass SQLite's integrity check, and once the home starts again both follow it and Stop keeping a copy deletes one computer's copy while the other keeps its own (above, "Keeping a copy on another computer").
- `src/core/standby/standby.test.ts`: the stream and two keepers over real SQLite and files: a full copy then each change of databases, a file that grows, a new and a removed file; a copy that was away catching up through logs folded back and begun again with no second full copy; one further behind than a full copy taking a full copy again; and an apply cut short finished at the keeper's start, and a copy unnamed deleted there.
- `src/core/standby/peers.test.ts`: two copies' listeners and links over real TLS on loopback, each given its copy through the home's own orders: each says where it listens, and they reach each other and ask where each copy stands both ways; a dial from one side only reaches both ways; a key the record does not name is refused before any order, and an address answering with another key is never taken for the copy; a computer whose addresses could not be read listens once they can; and a dropped copy stops listening and reaching.
- `tests/e2e/standby-peers.spec.ts`: the captain keeps a copy on two computers by keys and each Ready to take over list says it reaches the other copy; a key not on the list dials one copy and is refused; and with the home killed, one computer still asks the other where its copy stands, and both say in their status that they reach each other (above, "Copies that reach each other").
- `src/core/homeMove/homeMove.test.ts`: both sides of a move over real files, SQLite and git: the record, a task's key and every branch crossing, a commit asked again answered once, the destination's own record set aside, the Ready list's version, task, sign-in, SSH, Secrets, integrations (a host's own sign-in, such as GitHub's, named once), uncommitted-project, dictation, own-record and out-of-reach gaps with the blocking ones refusing a start, the move's first step said before `start` answers and before anything crosses, a computer that cannot take the move asked nothing, no sign-in file crossing, the new home's sign-in cards raised only for what is missing there, a failure after the stop restarting here, and a cancel before it, while a task crosses and part-way through a project, which sends none of that project's later pieces.
- `tests/browser/devices-tab-home-move-offer.test.tsx`: only a computer in reach on this computer's version offers Move your first mate here, and Move now stays off while a gap on its Ready list blocks the move.
- `src/core/devices/homeLink.test.ts`, "a device when the first mate moves to another computer": a device follows the move frame and refuses number 1 after it, and a work request left unanswered while the home moves is answered once by the new home.
- `ios/Infinitary/InfinitaryKit/Tests/InfinitaryKitTests/PhoneHomeMoveTests.swift`: the phone follows the move frame, keeps the highest number and refuses the home left behind.
- `tests/e2e/link-command.spec.ts` and `src/main/linkCommand.test.ts`: `infinitary link` beside a run, its links joining, and its words with no answer (`docs/run.md`, "Tests").

- `src/shared/devices.test.ts`: the link and the name, and every malformed link refused.
- `src/core/devices/identity.test.ts`: the certificate carries its key and verifies, the home's key survives a restart, and its files are 0600 in a 0700 folder.
- `src/core/devices/pairing.test.ts`: one use, expiry on an injected clock, the kind rule, one entry per key, Remove, the saved list and its refusals, a computer that runs work's user, `same-user` and `onThisMac`, and a listed key finding the home again with a new link while a removed one hears `removed`; and the command for another user on this Mac naming loopback whatever this Mac's address, while every other link names that address.
- `src/core/connection/connection.test.ts`: the whole join over TLS against the real pairing - a wrong, used or expired link refused, an impostor's key refused before anything is sent, Remove cutting a device before it returns, loopback with no key or a stranger's key refused, and each kind's limits.
- `src/core/core.connection.test.ts`, "the connection serves the core to paired devices": the real core makes the links through its own requests, devices that know only the wire join and use it, the first mate can only offer the host's cards, the feed names who joined, and nothing saved holds a link.
- `src/core/core.connection.test.ts`, "words typed on a paired Mac are the captain's own words": a view joined over the real connection asks the real first mate, in its input, to remove a project and, under a first mate card, to move the projects folder, and both changes are made.
- `src/core/core.connection.test.ts`, "a development run keeps the connection to loopback at its own port": with the stand-in, a link names `127.0.0.1` at its port, a device joins there and the connection listens nowhere else, wired as the app wires it; a packaged build ignores it.
- `src/core/devices/pairing.test.ts` also holds Stop it, the joined callback and the address choice; `src/core/orchestrator/firstmateAgent.actions.test.ts` the cards the host files; `src/renderer/src/settings/DevicesTab.test.tsx` the tab's words and states.
- `src/core/core.connection.test.ts`, "says in Devices while a Mac that controls this Firstmate is connected": the real core and connection, wired as the shell wires them, list and push a view in reach and controlling while connected, and out of reach since it went, kept by pairing.
- `tests/e2e/devices-links.spec.ts`: the captain asks the first mate to connect a Mac, clicks Make a link on its card, a device joins with the link from the tab, its row says it controls this first mate until it goes, Remove cuts it off, and no card, feed line, record or saved file holds the link.
- `src/core/devices/homeLink.test.ts` and `tests/e2e/view.spec.ts`: Leave from the device, and the app joining as a view (`docs/view.md`).
- `src/core/devices/pairing.test.ts`, "joins another Mac as a Mac", "keeps the kind of a computer that finds this Mac again" and "hands Leave from a Mac that runs work to Remove"; `src/core/connection/connection.test.ts`, "lets a Mac hold its window's view and its work at once" and "cuts a device whose hello says it does what its kind never does"; `src/core/devices/computers.test.ts`, a Mac's one row; and `tests/e2e/view.spec.ts`, "a Mac joined at its first launch also runs that Mac's work": the kinds and what each connection may do.
- `src/core/devices/joinCommand.test.ts`: the command for another Mac run by the Mac's own `/bin/sh`, curl and tar in a UTF-8 locale, against the real pairing and connection and a stand-in bundle - asked first, the app got with the link and started to join, nothing left behind; a no, a Mac out of reach or not that Mac, and a used, expired or stopped command; a name that cannot change what runs; the same command on a stand-in Linux computer, stopped before anything where it cannot make a user namespace and asking as before where it can, naming the one line that installs what it lacks, joining with an installed copy and stopping on another version with or without its update line, installing the Ubuntu package after the yes with a password and installing nothing with a wrong one or an account that cannot, and keeping the work on after logout or printing the sudo line; the command for another user; and `/firstmate` itself, for a work link only and never spending it.
- `src/core/devices/pairing.test.ts` also holds `opened`, last seen, waiting to remove, and listening for a computer removed out of reach; `src/core/placed/placedComputers.test.ts`, "removing a computer that runs work", Remove over the real supervisor, record, Pi and connection - in reach, when back, and now.
- `src/renderer/src/settings/DevicesTab.test.tsx` the rows, panels and questions; `src/shared/devices.test.ts` the words; `src/core/orchestrator/firstmateAgent.actions.test.ts` the command and remove cards.
- `tests/e2e/devices-command.spec.ts`, the first test: another user joins with a command made from the first mate's card, Devices lists what it runs, out of reach Remove waits and Keep it takes that back, and Remove takes it off with its project run here.
- `src/core/devices/dialTarget.test.ts`: a link for a computer that reaches this Mac through its SSH connection joins, connects and is answered through a private socket that does what the forward does, found to be another Mac with the home's own user number; it never dials its address, with or without an address given; nothing answering at a socket, or another key, is refused; a direct grant may dial through a socket with the same keys; and finding the home again moves a grant that dials an address onto the SSH connection, never back.
- `src/core/devices/pairing.test.ts`, "reads where a computer joins from off its link", "makes a link that reaches this Mac only through its own SSH connection" and "keeps a computer on the list, out of reach": the link's locality over the socket's, the link naming loopback, `connection: "ssh"` kept and never an address change, and an unreadable `ssh.json` never written over.
- `src/core/devices/sshConnections.test.ts`: this Mac's own SSH connection against a throwaway SSH server and a stand-in controller there - the socket forwarded to this Mac's listener carrying a computer's pinned connection, connected only on its welcome, beats, and nothing left on either side once stopped; tried again after a drop; stopped on a changed host until Try again, said once each way; a locked key tried again quietly every few minutes and at once on waking, still stopped in Devices and said once, and back by itself once unlocked; a key its app did not approve, a stand-in agent that asks before each use, stopped with its own reason, tried again quietly the same way, and back by itself once the app approves; a key whose app quit and left its socket behind, stopped with its own reason, tried again quietly, and back by itself once the app opens; stopped on Remote Login that will not forward and on Infinitary gone there; held while an update runs; a connection a find-again gives a computer a command added made only once that find ends; nothing tried asleep and at once on waking; removal in reach cleaned up over SSH after the connection let go; and a removal out of reach tried quietly and given up after thirty days.
  `src/core/helper/connect.test.ts`: the controller itself - its private socket, its route published only once this Mac answers through it, renewed on beats, withdrawn with its folder when the home lets go or goes quiet, ended when a later connection took the route, and another home's or computer's folder refused untouched.
- `tests/e2e/devices-ssh.spec.ts`, "reached over this Mac's own SSH": added by its address from the keyboard, connected using SSH, back by itself after this Mac restarts at another port, stopped with its reason when the host changed, and Try again, Change address and the `devices.try-again` command, each by keys.
- `tests/e2e/devices-ssh.spec.ts`, "leaves for another Firstmate": a Mac added by its address whose grant names another home while this Mac is quit, stopped as `other-home` with its reason in Devices and the feed, Try again and Change address absent, Remove by keys asking only to remove it now, and the feed saying nothing of this first mate's was there to remove.
- `src/core/devices/remoteLoginPassword.test.ts`, the password: against a throwaway SSH server that offers passwords, a refused key asks for the password with nothing placed; a wrong one, through the Mac's own SSH and askpass, is said and asked again; with the right one (invented, which a stand-in for that server takes) Infinitary's own key is placed, 0600 in a 0700 folder, the Mac joins, and a later add reaches it with that key and asks for nothing; a Mac that takes no password says so; a Mac unlike its remembered key, or none remembered, never gets the password; and no argument, environment, feed line or saved file holds it, with every askpass folder gone.
  Its pairing folder has a space in its path, as Application Support does.
- `src/core/devices/nearby.test.ts`: Macs nearby against dns-sd's own lines in memory - each Mac asked its name once, four at a time, this Mac left out and nothing listed before its names are read, a Mac gone from every interface taken off, macOS's policy-denied answer said and a Mac that answers after listed, another error or an ended run said as could not look, a browse that ran its time followed by another with no blink, and nothing running once stopped or a minute after the last ask; `src/core/devices/dnsSd.test.ts` the same through a stand-in program, every run gone once stopped.
  `src/shared/nearbyMacs.test.ts`: the address a Mac fills in and which Macs read as on your list; `src/renderer/src/settings/DevicesTab.test.tsx`: the list, its states and its keys.
- `src/core/devices/homeRoutes.test.ts`: against the real pairing and connection on loopback, a device keeps every address the welcome offers and comes back at one once its own is gone, a computer that runs work finds its home by the announcement once no address it keeps answers, and a route answering with another key is refused whether kept or heard, and nothing of it is kept.
- `src/core/devices/findHome.test.ts`: what dns-sd's browse and lookup and Avahi's resolved lines say of where each computer announcing Infinitary can be reached, and nothing when macOS does not let it look.
- `tests/e2e/view-home-moved.spec.ts`: a Mac controlling another finds it at its new address by its announcement and refuses another computer announcing Infinitary (`docs/view.md`).
- `src/core/devices/announce.test.ts`: this Mac announces itself over Bonjour while a phone or a computer that dials it at an address is on the list, or a direct invitation is open, never for one on this computer or on its own SSH, once, under its own name at the connection's port, stops when neither remains, starts again after a run that ended by itself, and starts nothing once disposed, and a Linux home asks `avahi-publish` for the same; `src/core/devices/dnsSd.test.ts` the held run ending dns-sd when stopped.
  `src/core/devices/pairing.test.ts`: a phone joins as a `view` by a link for a Mac or an older `view`, is refused a link for another user here, finds the home again, and is never a computer that runs work.
- `tests/e2e/devices-address.spec.ts`, "lists Macs nearby but this one": with a stand-in dns-sd, this Mac is not a row, ↓ and Enter fill the field with the user name selected, a changed user name is typed, the Mac is added over a throwaway SSH server and marked on the list when the aside opens again, and closing it leaves no run of dns-sd; "has not allowed the local network": the list says so and a private network's name still goes in.
- `src/core/devices/remoteLogin.test.ts`, "how far the copy has gone": a copy of incompressible bytes over a throwaway SSH server, its count said at every piece, each more than the last, its last count the archive's own size, one run of lines in the feed's words between preparing and starting, no total and no percentage; said at most once a second, a second copy says fewer counts and the same last one.
  `src/core/devices/appArchive.test.ts`: the count's rule, its first bytes at once and its end once; `src/core/core.settings.test.ts`: a count rewrites its line in place while it is Activity's newest, and one after another line writes its own; `src/renderer/src/settings/DevicesTab.test.tsx`: the row preparing, sending with its count and starting, on a new row and on a computer found again.
- `tests/e2e/devices-address.spec.ts`, "says how far the copy has gone": an add by its address with a stand-in carrying incompressible bytes hears preparing, counts that rise, and starting, with no share of a total, and the feed keeps the last count as one line beside the starting line.
- `tests/e2e/devices-address.spec.ts`, "did not let your SSH key in": after the check line the aside asks for the password in a hidden field, says a wrong one above an empty field, and adds the Mac with Infinitary's own key, all by keys, with neither password in the feed, a card, a task, a saved file or an ssh's arguments.
- The SSH tests run on a Mac and on Linux alike: the throwaway SSH server is the system's own OpenSSH, and on Linux the far computer is Linux, so the stand-in Infinitary there is an AppImage (`STAND_IN_APP`, `tests/helpers/standInFirstmate.ts`) and the server stands in Xvfb and FUSE where the computer lacks them, a library list that holds every library the AppImage needs, and the user-namespace probe, since the stand-in uses none of them.
  A command for another computer that a test runs on that Linux computer outside SSH gets the same stand-in probe, with stand-ins for FUSE 2, the library list and `loginctl` (`onLinuxThatRunsIt` in `tests/e2e/run-work.spec.ts`), since a hosted runner's kernel may refuse the real probe, its system may lack what the AppImage needs, and no test changes its linger.
- `src/core/devices/remoteLogin.test.ts`: adding a Mac by its address with the Mac's own `/usr/bin/ssh` in batch mode against a throwaway SSH server on loopback (`tests/helpers/sshServer.ts`, shared through `tests/helpers/remoteLoginHome.ts`), the real pairing and connection, and a stand-in Infinitary that joins at the wire (`tests/helpers/standInFirstmate.ts`) - the copy sent whole, the link on its input and never in its words, each step said; and every refusal, from a locked or refused key, a key whose agent did not approve it or quit, taking its socket or leaving it behind, Remote Login off, no answer, a Mac never reached or answering unlike before, to not a Mac and a user already joined, with nothing started there and the link closed.
  The same file holds aliases the person's SSH settings reach through a `ProxyCommand` and a `ProxyJump`, one with no name outside those settings, each asked on the same check line as the server's own key, the person's known hosts left unwritten, and each added after the yes.
  `src/core/devices/remoteLoginFound.test.ts` holds this Mac's own user and a Mac that cannot reach this one back, refused the same way; where the look finds that Mac is - this Mac, with the token gone afterwards, or another Mac whose user has the home's own number, which joins; and, with the stand-in keeping its grant, a Mac of this first mate found again at this Mac's new address as the same computer, one in reach left as it is with nothing sent, one this Mac removed set up anew, another first mate's asked about once with nothing sent, the captain's yes carried to the join there and its leaving said, and another first mate that still answers left as it is (`still-answers`).
  `src/core/devices/remoteLoginUpdate.test.ts` holds updating, which tells the work there whether it runs on this Mac as the look found it, and removing it there, or saying nothing of this first mate's was there to remove when its folder is another first mate's or holds nothing; the thirty-minute time limit said as that limit, never as not reached, when it stops an update while that computer still checks the copy, or setting it up while the join waits; and a background the session there refused, said as such after adding and after updating, never as the next login.
  `src/core/devices/remoteLoginForward.test.ts` holds a private socket the Mac's own OpenSSH forwards from the app's own connection to the home's listener: it carries a pinned connection, is 0600 for this user alone and taken by a route, a forward the person's settings ask for stays closed, and once cancelled it answers nothing.
  `sshRefusal.test.ts` reads SSH's own messages as the Mac's SSH printed them.
- `src/core/devices/relay.test.ts`: a computer that runs work joins, connects and is answered through a relay, against the real pairing and connection, and a home that does not answer or another computer answering is refused through it as directly; each through a stand-in that does what nc does, and on a Mac through macOS's own nc; the relay stops once its socket closes, and only macOS dials another computer through it.
- `src/core/placed/placedComputers.test.ts`, "removing a computer that runs work": out of reach, Remove now on a computer added by its address removes what Infinitary set up there at once, keeps its unmerged work there, and leaves the home listening for nothing.
- `tests/e2e/devices-address.spec.ts`, the first test: the captain asks the first mate to add a Mac at its address, clicks Add it, and Devices adds it over SSH; an address nothing answers at says what to do there and in the feed; nothing saved holds the link.
  `tests/e2e/run-work.spec.ts`: the built app on the other side of SSH - a Mac's bundle, or on Linux the AppImage a Linux computer gets - joins, runs in the background, is updated, comes back by itself after this Mac's address changes, and is removed; and a Mac a command joined, stranded once this Mac moved, is found by Add it at its address as the same computer with its sign-in kept and is on this Mac's SSH connection from then on.
- `tests/e2e/devices-address.spec.ts`, "a Mac whose user runs another Firstmate's work": Add it asks once in Devices with nothing sent, Cancel holds the focus and changes nothing, and Leave it and add by keys adds it, with the leave on the join's input and its leaving in the feed.
  `tests/e2e/run-work.spec.ts`, "its home gone for good, a new home adds it by its address": the built app there, asked by the home's question, stays with a home that still answers, and once that home is gone leaves it as a removal would, keeping its unmerged working copy, and joins over the home's SSH.
- `tests/e2e/devices-command.spec.ts`, "this Mac's address changes": the app started again at another port, a computer added by a command shows the line and Make a command, whose command finds this Mac again as the same computer with its project.
- `tests/e2e/devices-ssh.spec.ts`, "a Mac a command added that macOS holds on the local network": a stand-in Infinitary joins with the command made in Devices, the list is left as a Mac elsewhere on the local network leaves it, Devices says why, and Add it by its address by keys finds it again over a throwaway SSH server, after which its run is connected using SSH.
  `src/core/devices/pairing.test.ts`, "says macOS holds a computer joined from another Mac on the local network", and `src/core/devices/computers.test.ts`: which computers read as held, until in reach once, and never beside `addressChanged`; `src/core/connection/connection.test.ts` and `src/core/helper/helper.test.ts`: the join's dial for the name welcomed and counted as nothing of that computer in reach.
- `src/core/devices/pairing.test.ts`, "keeps where each device last reached this Mac": where a device reached this Mac kept beside the list, the address changed or not, on no network, at another loopback port, and found again; "keeps the address a computer was found again at over Remote Login".
- `src/core/devices/pairing.test.ts`, "follows this Mac's network": a move told once two looks agree and only once, a moment off the network not told, a new address beside the one in use told, the captain's choice told once by the choice, and nothing looking once stopped; `src/main/shell.test.ts`: only a development build follows it, and stops with the connection.
- `src/core/devices/computers.test.ts`: the real pairing following a stand-in network, the real `WorkDevices` and `Computers`, and a computer out of reach that last reached the old address, said on the list only once the connection listens at the new one; "after a task changes": each computer's count read with one row per task running there and no task record composed, and pushed again as a task starts there, moves here or closes.
- `src/core/connection/connection.test.ts`: what a computer says of its version, taking work or not, and the update order reaching one that takes none; `src/core/devices/pairing.test.ts`: `/firstmate` by a computer's own key.
- `src/core/devices/computerUpdate.test.ts`: the list saying another version, and Update over the real connection, pairing and work mode composition - the copy got with the computer's own key and kept, its send counted, another user here getting nothing, the run started again on this Mac's version, not back in time or by hand, every refusal, and a copy that exits at start: the computer goes back to the copy it kept, this Mac names that version once and refuses to send it again, while a copy that reaches this Mac lets the previous one go.
  On a Mac it also holds a Mac a command added downloading from a stand-in release over local HTTPS: its count in one line toward the release's size, the downloaded copy kept; a download that does not match its checksum or publisher, cannot be got, or stops with nothing moving falls back to a counted send with nothing left of it; a dropped connection followed to the new version, with the order asked again answering `updating`; an update asked while a download runs following it with no fallback; a run stopped part way coming back on its old version and sent this Mac's copy; one not heard from again said to have maybe updated; and an older contract kept on the update order.
- `src/core/devices/joinCommand.test.ts`, "when this Mac's version is published": the command downloads it there with its count rewriting one line and joins with it, getting nothing from this Mac; falls back to this Mac's copy when the download does not match or cannot be got, or once only the time a copy of its size needs is left of the link, and downloads while more is left even under two minutes; and says a used or expired command before it downloads anything.
- `tests/e2e/devices-command.spec.ts`, "a computer on another version": the app brings an older one to this Mac's version by itself, its row following the update and no card asking, and one too old gets the card and, from Match, the command; `tests/e2e/run-work.spec.ts`, "updated over the connection": the built app gets the home's Infinitary with its own key, keeps it and ends for its background.
- `tests/e2e/devices.spec.ts`, "a Mac a command added downloads its update": Devices' command names the published download, and the update the app starts by itself as the Mac connects on an older version counts the download in its row and one rewritten feed line, or falls back to a counted send when it does not match.
  `tests/e2e/run-work.spec.ts`, "the command for another Mac downloads the published version" and "updated over the connection, the copy a command kept downloads": the built app joins with the copy the command downloaded, and keeps the one its work mode downloaded, after a mismatch changed nothing.
- `tests/browser/devices-tab-update-by-itself.test.tsx`: an update the app started by itself reads in its row from its first count until it is done, with no Match meanwhile; `tests/browser/devices-tab-update-from-card.test.tsx`: the update card's Update it opens Devices and asks that computer's update there, its row reading as updating until the update answers.

## Unsupported Linux automatic startup

A joined Linux computer keeps its join when Infinitary cannot set up automatic startup.
Its optional `automaticStartup` fact is kept beside the system and chip, and is independent of whether work is reachable.
Devices says “automatic startup not set up” and “This setup does not start work at login”, rather than promising work at a later login.
An unreadable check is unknown, not an absent session.
A Linux command join reports running, waiting for login, refusal, unavailable startup or unknown startup with its final name-only hello.
Both that hello and address-based setup carry the outcome; the SSH controller refreshes it when reconnecting.
A manually started worker can be reachable while automatic startup remains unavailable.
Updates do not claim that a saved service file alone can restart a Linux worker.
The existing explicit work process and its lifetime are described in [the helper manual](helper.md#in-the-background).

## Running versions in first mate facts

Every first mate context includes `computer_versions`: the home's running app version and each paired device's current authenticated hello version, with its name, role and connection state.
The connection's `runningVersions` snapshot includes views and computers on incompatible versions as well as computers taking work, excludes name-only lookups, and stops reporting a connection as soon as it closes.
`WorkDevices.runningVersions` forwards that live snapshot without saving an installation claim or using an available update as the running version.
A disconnected device, or an older client that did not say its app version, has a null version; its contract number is not an app version.
Distinct live roles or versions on one device keep separate rows rather than picking one as the computer's only running app.
