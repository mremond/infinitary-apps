Adding a computer that can run work, and running as another user on this computer (captain's picks on FI3-682, 2026-10-03).
Every way adds the same kind of device to Your devices (`DevicesTab.prompt.md`); a computer the person sits at joins by pasting a link at Infinitary's first launch (`JoinAnotherMac.prompt.md`).
Its address is the default way (captain's pick on INF-4926): this computer then keeps it updated and reaches it by itself, so nobody goes back to it after setup.
The link and the command stay one click away for a computer that cannot turn Remote Login on: the link when the person is at that computer or it is a Windows PC, the command when they can type in Terminal there.
Pairing's rules - one use, ten minutes, the captain's own click, and a yes on the joining side before anything is sent - are the app's `docs/devices.md`.
Macs, and Linux computers with an x64 chip (FI3-1432, piece 9): a Mac home or a Linux home adds either.
The examples name the computer where the first mate lives "MacBook Pro", the added computer "Mac mini", its address `sam@mini.local` and the other user "Builder"; the app always uses the real names.

**By its address.**
"add my mini at sam@mini.local" yields one decision from the first mate, "Add the computer at sam@mini.local": "I set it up over Remote Login, with your own SSH key.
Nothing needs to be open on it." and "Only your click can add a computer, so I ask first.", with a ghost "Not now" and a primary "Add it".
Devices' + A computer does the same with no card.
Asked to add a computer without saying how, the first mate offers every way on one card and recommends the address.
Asked for the address way with no address, it offers "Add a computer by its address": "I set it up from here over Remote Login, with your own SSH key, and keep it updated." and "Open the form here, then type its address or pick it from the computers on this network.", with a ghost "Not now" and a primary "Open the form", which opens + A computer's address form.
A Linux computer is added the same way, at its SSH server; this computer asks its system first, and sends the Infinitary made for it.
When that is not this computer's own - a Mac adding a Linux computer, or a Linux computer adding a Mac - it is the one published for that system at this computer's version, got and checked before anything is sent, and the feed says so: "Getting Infinitary for Studio's system from its published release, and checking it.", while the row still reads "Preparing Infinitary for Studio…".
The address is the one thing the person supplies, with a port beside it only when its SSH server listens on another one than 22.
That address is then `ssh://sam@mini.local:2222`, as SSH writes one, and every later update, removal and key check reaches the computer there.
An alias from their own SSH settings works, because their own SSH resolves it; the app reads no SSH settings.
While it works, a row stands in the list with an `idle` dot and the summary "Reaching sam@mini.local with your SSH key…", then "Preparing Infinitary for Mac mini…", "Sending Infinitary to Mac mini… 42.3 MB sent", and "Starting Infinitary on Mac mini…".
The count is what was sent so far, in the words a file's size takes on a chip ("640 KB", "42.3 MB"), and it moves about once a second while the copy goes (captain's approval of FI3-1361).
The copy is made as it is sent, so nothing knows its size before its end: never a percentage, a share of a total, a bar that fills or a time left.
The feed says each stage: "Reaching sam@mini.local with your SSH key.", "Preparing Infinitary for Mac mini.", "Sending Infinitary to Mac mini: 42.3 MB sent.", which rewrites itself in place as the count moves while it is the feed's newest line, "Starting Infinitary on Mac mini.", then "Mac mini joined your devices.
It has git and Claude Code, and no sign-ins yet."
A refusal is two feed lines with `warn` dots, never a card:
- a locked key: "Could not sign in to sam@mini.local.
  Your SSH key is locked with a passphrase." and "Unlock it once in Terminal, then ask again."
- a key the app that holds it did not approve, such as 1Password when the person declines or does not answer: "Could not sign in to sam@mini.local.
  The app that holds your SSH key did not approve it." and "Ask again, and approve it in that app when it asks."
- a key the app that holds it cannot sign with because that app is not open, such as 1Password after it quit: "Could not sign in to sam@mini.local.
  The app that holds your SSH key is not open." and "Open that app, then ask again."
- a refused key, when the computer takes a password: the aside asks for it once (below, "The password, once").
- a refused key, when the computer takes no password: "sam@mini.local did not accept your SSH key, and does not take a password." and "Let your SSH key in there and ask again, or add it with a command instead."
- a refused key, when updating, removing or changing its address: "sam@mini.local did not accept your SSH key." and "Check that Remote Login is on there and lets you in, then ask again."
- Infinitary's own key placed there, and still not let in: "sam@mini.local did not let Infinitary's own key in, after it was placed there." and "Its Remote Login may read keys from another file.
  Add it with a command instead."
- no answer: the step and port it stopped at, then what to check with the private network among it, ending "Then ask again, or add it with Run a command there.", the button under the form; such as "Nothing answered at sam@mini.local on port 22 when reading its SSH key." and "Check its address and that it is on.
  Both computers need the same network or private network, such as Tailscale, and its firewall must let SSH in.
  Then ask again, or add it with Run a command there."
  (`docs/devices.md`, "When it could not reach the computer").
- stopped by its thirty-minute time limit before Infinitary started there: "Preparing Infinitary for Mac mini stopped at its 30-minute time limit." and "Nothing changed there.
  Ask again.", never "Could not reach", since that computer answered all along.
- another system, or Linux on a chip with no published build: "Infinitary cannot run on sam@mini.local's system." and "It runs work on Macs, and on Linux computers with an x64 chip.
  Nothing changed there."
- a Linux computer that lacks what its work needs: "Studio needs xvfb, libfuse2 and libgtk-3-0 before it can run your first mate's work." and "Install them there with its software app or package manager, then ask again.", naming each of git, Xvfb, FUSE 2 and the libraries Infinitary needs to start there that it lacks, by the package its own package manager installs, before anything is sent.
- a Linux computer where Infinitary would run without its sandbox, as on Ubuntu 24.04 and later, which keep apps from making one: "Studio would run Infinitary without its sandbox: its system keeps apps from making one." and "Install the Infinitary package for its system there, then add it with Run a command there instead.
  Nothing changed there."
- the published Infinitary for that system could not be got: "Could not get Infinitary for Studio's system from its published release." and "Check that this computer is online, then ask again.
  Nothing changed there."
- the published Infinitary did not match its checksum: "The copy of Infinitary published for Studio's system did not match its checksum, so nothing was sent." and "Ask again later.
  Nothing changed there."
- Remote Login off: "sam@mini.local did not answer over Remote Login." and "Turn on Remote Login there, in System Settings under General, Sharing, or start the SSH server on a Linux computer.
  Then ask again."
- a computer this computer has not checked: the aside asks before anything is sent, "Is this sam@mini.local?" and "Compare this line with the one that computer shows.", with the check line in mono on `--accent-dim`, a primary "This is the computer" and a ghost "Cancel" which holds the focus so Enter never says yes.
  Cancel keeps the address and sends nothing.
  The yes is remembered in Infinitary's own list, not in the captain's SSH settings, and a later add of that address does not ask again.
  Infinitary never trusts a computer on first sight.
- a computer this computer has not checked, when the check cannot be asked: "This computer has not checked sam@mini.local yet, so it cannot tell it is your computer." and "Add it again by its address, and say this is the computer."
- a computer that answers unlike before: "sam@mini.local does not answer as the computer this computer reached before." and "If you did not set it up again, someone may be in between, so nothing was sent to it."
- a user that runs work for a first mate its saved grant does not name: "sam@mini.local already runs work for another first mate." and "Remove it from that first mate, then ask again."
  A user that runs this first mate's work is never refused this way: Add it finds that computer again (below, "Finding this computer again").
  A user that runs another first mate's work is asked about first (below, "Another first mate's Mac").
- another first mate the captain chose to leave still answers there: "sam@mini.local runs work for another first mate, which still answers." and "Remove it from that first mate, then ask again."
- a computer on the list and in reach: "Mac mini already runs work for your first mate, and is in reach." and "Nothing changed there."
- the user Infinitary runs as: "sam@mini.local is the user Infinitary already runs as, on this computer." and "Add another user on this computer, or another computer."
- a Remote Login that will not carry Infinitary's connection back: "Remote Login on sam@mini.local does not let Infinitary's connection through." and "Allow forwarding in its SSH settings, then ask again."
- anything else: "Could not set up Infinitary on Mac mini." and "Nothing changed there.
  Ask again."

By its address keeps the address in the field and shows the two lines in that aside, in `--warn`.
Try again runs the same add.
Cancel closes the aside and changes nothing.
Success still closes the aside.
The field, Try again and Cancel are reached with Tab.
A refusal of an update, a removal or a changed address still stands at the top of the tab, where the captain clicked.
When nobody is logged in at that computer's screen as that user, the joined line is followed by "Mac mini starts running work the next time sam logs in there."
When that user's session there refused to start it in the background, no login mends it: the joined line is followed by two warning lines instead, "Mac mini could not set itself to start in the background, so it runs no work for now." and "Ask again to add it."
(captain's pick on FI3-673: work runs while that user is logged in).
On an Ubuntu 24.04 or 26.04 computer where systemd does not run, as in a container, the install still stands and the add goes on.
Once it joined, two warning lines name the one line an administrator runs there so the work keeps running after logout: "To keep Mac mini running work after sam logs out, an administrator runs this there once:" and `sudo loginctl enable-linger sam`; an update there ends the same way.
Once added, this computer keeps its own SSH connection to that computer while Infinitary runs here, and that computer's work reaches this computer only through it (captain's approval of FI3-970): no answer is needed at that computer's screen, and no address of this computer's is ever dialed there.
Devices says where that connection stands (`DevicesTab.prompt.md`, "Reached over your SSH").

**Nearby.**
While + A computer's address form is open, the computers on this network with Remote Login on stand under the field, so the captain can pick one instead of knowing its address (captain's pick on FI3-1361).
This computer only listens for what Remote Login announces; it never tries the addresses around it.
A micro label `ON THIS NETWORK` stands over one row per computer: its own name in `--text-sm --fg-1`, drawn as text, then the address it fills in, in mono `--text-xs --fg-3`, "sam@Sams-Mac-mini.local", with the person's own user name before the `@`.
A computer already on Your devices adds "on your list" on the right, in mono `--fg-3`; it can still be picked.
This computer is never a row.
A row's hover is `--bg-2` on `--radius-s`.
Picking one, by a click or Enter, fills the field and puts the caret there with the user name selected, so typing replaces it; Add it then works as for a typed address.
The list is one Tab stop after Cancel: ↑ and ↓ move between rows, Home and End to its ends, ↓ in the field goes to the list and ↑ from its first row back to the field.
While no computer answered, one `--text-sm --fg-2` line says "Looking for computers on this network with Remote Login on…", and on a Linux home "Looking for computers on this network that announce SSH…".
A Linux home listens with Avahi, and hears a Mac with Remote Login on and a Linux computer whose SSH server Avahi announces; with no Avahi it lists nothing, and typing an address still works.
When macOS has not let Infinitary use the local network, the list says so, never on a guess: "macOS has not let Infinitary look for computers on this network." in `--warn`, over "Allow it in System Settings, under Privacy & Security, Local Network.
You can still type an address."
When the looking stopped some other way: "Could not look for computers on this network.
You can still type an address."
Typing an address always works, including a private network's name.
The list is looked for only while the aside is open.

**The password, once.**
A computer that lets the person's SSH key in never asks for a password (captain's picks on FI3-1361: ask once, keep none, a key Infinitary makes and keeps in its own folder).
When it did not, and it takes a password, the aside asks after the check line, the same shape as "By its address": the question line "sam@mini.local did not let your SSH key in." over one `--text-sm --fg-2` line, "Infinitary can let its own key in with that user's password.
It uses the password once and keeps none of it.", then a password `Input` whose name and placeholder are "sam's password on that computer", holding the focus, a small primary "Add it" and a ghost "Cancel".
Enter adds it; Tab moves from the field to Add it, then Cancel.
Cancel keeps the address and sends nothing.
Add it empties the field: the password goes on that one try and is kept nowhere, not in the feed, a log or a saved file.
The feed says "Letting Infinitary's own key in on sam@mini.local.", then the steps above, with no password.
A password that computer did not take is said in the feed with two `warn` dots, "sam@mini.local did not take that password." and "Nothing was kept.
Check it, then try again.", and the same two lines in `--warn` above the empty field, which holds the focus again.
Infinitary's key, not the person's, is what that computer lets in afterwards, so a later add, update or connection there asks for nothing, except an Ubuntu 24.04 or 26.04 computer whose package is missing or another version.
That aside is the same shape, with the question "Infinitary will install itself on sam@box." or, on Update, "Infinitary will update itself on sam@box.", and "It uses that account's password once, and keeps none of it."
Update's button reads Update.
Cancel on an update closes the aside and changes nothing.

**Another first mate's Mac.**
A user there may run work for another first mate that is gone for good, as after Infinitary was set up again on its computer (captain's answer on FI3-985: "Add it asks you once, then leaves the old Firstmate as a removal would, keeping unmerged work").
Add it asks once, before anything is sent there, as an aside under the foot of Your devices, the same shape as "By its address": the question line "sam@mini.local runs work for another first mate." over two `--text-sm --fg-2` lines, "If that first mate is gone for good, adding Mac mini leaves it: Infinitary removes what it set up there for that one, with its sign-ins." and "Work that never merged stays there.
If that first mate still answers, nothing changes."
Its buttons are a small danger "Leave it and add" and a ghost "Cancel", which holds the focus so Enter never leaves it.
The feed says only "Reaching sam@mini.local with your SSH key." until the captain answers; Cancel changes nothing, and no card asks it.
The first mate's card's Add it opens Devices, which asks the same question there.
After "Leave it and add" the steps are the usual ones, and after the joined line the feed says "Mac mini left the other first mate it ran work for.", or "Mac mini left the other first mate it ran work for.
Its unmerged work stays there." when it kept a working copy; when it could not remove all of it there, a warning line follows, "Infinitary could not remove all it set up on Mac mini for the other one."
That computer decides for itself: a first mate that still answers stays, and Add it is refused as above.

**Updating and removing a computer added by its address.**
The same address keeps working for that computer.
"update Infinitary on the mini" yields one decision from the first mate, "Update Infinitary on Mac mini": "It downloads this computer's version of Infinitary, or this computer sends its own copy, with a count.
Remote Login uses your own SSH key." and "Its running work stops for a moment and goes on after.", with a ghost "Not now" and a primary "Update it".
For another user on this computer added by its address, the first line instead reads "This computer copies its own Infinitary there over Remote Login, with your own SSH key, and starts it again."
The click opens Devices, whose row first reads "Updating Infinitary on Mac mini…" in place of what it runs, with no Remove.
For Add and Update by address, the row and feed then count the download or fallback send as `DevicesTab.prompt.md` describes.
The feed ends with "Mac mini runs this computer's version of Infinitary now."
When the session there refused to start it in the background, the feed says "Mac mini has this computer's version of Infinitary now." then two warning lines, "Mac mini could not set itself to start in the background, so it runs no work for now." and "Ask again to update it."
A computer added by a link or a command normally updates over your network (below, "Updating any other computer").
For a joined Ubuntu package worker, Devices can instead install the package through verified Remote Login without adding the worker again.
Removing it out of reach (`DevicesTab.prompt.md`, "Remove") with Remove now also removes what Infinitary set up there over Remote Login at once: the feed says "Removing what Infinitary set up on Mac mini, over Remote Login."
(a Linux computer "…, over SSH.") then "Removed what Infinitary set up on Mac mini.", or "Could not remove what Infinitary set up on Mac mini, over Remote Login." and "It removes it itself the next time it is back."
When it could not remove all of it there yet, the two warning lines are "Could not remove all that Infinitary set up on Mac mini yet." and "Mac mini tries again the next time sam logs in there."
When nothing of your first mate's is there, as on a computer that left it for another first mate, nothing there is touched and the feed says "Mac mini had nothing of your first mate's to remove." in place of the removed line.

**Updating any other computer.**
A computer added by a command, and running as another user on this computer, update over your network, with nothing to set up there.
A joined Ubuntu package worker can use the Remote Login route from its Devices row.
Devices' Update does it on a row that says the computer has another version (`DevicesTab.prompt.md`, "Another version"), and "update Infinitary on the mini" yields one decision from the first mate, "Update Infinitary on Mac mini": "I send this computer's Infinitary to it over your network, and it starts again." and "Its running work stops for a moment and goes on after.", with a ghost "Not now" and a primary "Update it".
For running as another user it reads "I start it again on this computer's own Infinitary.", since that user runs this computer's own app.
For a Mac a command added that runs a version that takes the download, the first line reads "It downloads this computer's version of Infinitary, or this computer sends its own copy over your network, with a count."
(the captain's direction B on INF-322: every work computer).
The click opens Devices, whose row reads "Updating Infinitary on Mac mini…", and the feed says "Updating Infinitary on Mac mini.".
Such a Mac then downloads this computer's published version on its own connection, and the row and one feed line rewritten in place count it, "Mac mini is downloading Infinitary… 200.6 MB of 401.1 MB", as for a Mac reached by its address.
When it cannot download it, or the download does not match, the feed says so in one line, "Mac mini could not download Infinitary, so this computer is sending its copy." or "Mac mini's download did not match, so this computer is sending its copy.", and this computer sends its copy at once.
Any copy this computer sends is counted the same way, "Sending Infinitary to Mac mini… 42.3 MB sent", and then the row and the feed say "Starting Infinitary on Mac mini…".
Once it is back, the feed says "Mac mini runs this computer's version of Infinitary now."
When it is out of reach after three minutes, two warning lines take that line's place: "Mac mini has not come back after the update." and "Check that it is awake.
If it stays out of reach, remove it, then add it again."
When it is back on another version, the feed names the version still running.
When nothing starts it again there by itself, as when its work was started by hand in Terminal, the feed says "Mac mini has this computer's version of Infinitary now, and runs it once it is started there again."
Its running work stops for a moment, as when that computer restarts, and goes on after.
Refusals are two feed lines with `warn` dots, and Devices shows them at the top of the tab:
- out of reach: "Mac mini is out of reach, so this computer cannot update it now." and "Ask again once it is back."
- too old to update from here: "Mac mini has a version of Infinitary too old to update from here." and "Make a new command for it in Devices, and run it there once."
- already this computer's version: "Mac mini already runs this computer's version of Infinitary." and "Nothing changed there."
- a copy of Infinitary with nothing to send: "This copy of Infinitary cannot send itself to another computer." and "Only an installed Infinitary can update another computer."
- anything else: "Could not update Infinitary on Mac mini." and "Nothing changed there.
  Ask again."

Asked to update one too old to update from here, the first mate's decision is "Update Infinitary on Mac mini" with "Its version of Infinitary is too old to update from here, so it needs a new command." and "Make the command here, then run it once in Terminal on Mac mini."
(or "as Builder"), with a ghost "Not now" and a primary "Make the command".
The command finds this computer again and gets its version, as below ("Finding this computer again").
Out of reach, it offers no card: the first mate says it cannot tell that computer's version now.
What it says there goes to the log its work keeps, never to a screen: "MacBook Pro updated Infinitary on this computer to its version." and "It starts again now."

**By a command.**
For a computer with no screen, or one this computer cannot reach over Remote Login.
The command panel in Devices carries the link inside the command.
The command gets Infinitary from this computer with that link (captain's pick), so the two computers always run the same version and need only the same network.
When this computer's version is published, the command on a Mac first downloads that same version there on its own connection, and checks it, and gets it from this computer only when it cannot (the captain's direction B on INF-322, with Add as well as Update).
The person runs it once in Terminal there, as the macOS user who should run the work.
Terminal shows, before anything is fetched, written or sent:
```
Infinitary on MacBook Pro asks to add this computer, as the user sam.
It runs only the projects you give it, with sign-ins of its own.
Type yes to agree:
```
Any answer but yes prints "Nothing changed on this computer."
After yes:
```
Getting Infinitary from MacBook Pro… done.
Joined. This computer runs work for MacBook Pro now, whenever sam is logged in.
Open Infinitary here any time to control it from this computer, with no new link.
```
When it downloads, the count rewrites one line in place about once a second, "Downloading Infinitary… 200.6 MB of 401.1 MB", or "200.6 MB so far" when the release states no size, never a percentage or a time left, and the line ends once the copy is checked:
```
Downloading Infinitary… 401.1 MB of 401.1 MB, done.
Joined. This computer runs work for MacBook Pro now, whenever sam is logged in.
```
A download that fails, stops after two minutes with nothing moving or once what is left of the command's thirty minutes - a command that downloads lasts that long from the start - is only what this computer's copy needs on a slow network (a minute to join, plus the download's size at 1 MB a second), or does not match, says so on a line of its own and gets this computer's copy instead:
```
Downloading Infinitary… 12.0 MB of 401.1 MB
Could not download Infinitary, so getting it from MacBook Pro instead.
Getting Infinitary from MacBook Pro… done.
```
or "The download did not match, so getting Infinitary from MacBook Pro instead.".
A used or expired command says so before anything is downloaded.
Refusals:
- run on a system Infinitary does not run on, before anything else: "Infinitary does not run on this computer's system.", "It runs on Macs, and on Linux computers with an x64 chip." and "Nothing changed on this computer."
  Run on a Linux computer with an x64 chip, the command gets the Infinitary made for Linux, as it gets a Mac's on a Mac; a Linux computer with no curl says "This command needs curl to get Infinitary from MacBook Pro.", "Install curl, then run it again." and "Nothing changed on this computer."
  On Linux the command first looks for Infinitary installed there, and joins with that copy, downloading nothing; one that is not this computer's version stops with "The Infinitary installed on this computer is not version 0.13.0, which MacBook Pro runs.", the one line that updates it, and "Nothing changed on this computer."
  On Ubuntu 24.04 or 26.04 with none installed, it installs the Infinitary package after the yes, saying "Installing Infinitary, which may ask for this account's password.", and the account's password is typed in that Terminal; a wrong password says "Could not install Infinitary on this computer." and "Nothing changed on this computer.", and an account that cannot install software is told so before the yes.
  A join that stops after the install never says nothing changed and ends with "Infinitary stays installed on this computer.", and an install apt left part way says "Could not finish installing Infinitary on this computer.", "Part of it stays installed, and this line removes it:" and `sudo apt-get remove -y infinitary`, and one apt stopped after it installed only packages Infinitary needs says "Could not finish installing Infinitary on this computer." and "Packages it needs that apt installed stay installed."
  Any other Linux computer gets the AppImage, and first names what it lacks before the yes: "Infinitary needs more on this computer before it can run work for MacBook Pro.", "Install it with this line, then run this command again:" and the line, such as `sudo apt-get install -y libfuse2t64 libgbm1`.
  A Linux computer where the AppImage would run without its sandbox stops before anything too: "Infinitary would run on this computer without its sandbox: its system keeps apps from making one.", "Install the Infinitary package for this system, then run this command again." and "Nothing changed on this computer."
  Once a Linux computer joined with its work in the background, the last line says "It keeps running after kun logs out.", or names the one line an administrator runs to allow it: "To keep it running after kun logs out, an administrator runs this once:" and `sudo loginctl enable-linger kun`.
  A Mac with nothing to send for any system - one that is not an installed release - offers no working command, and asking for one says "This copy of Infinitary cannot send itself to another computer; only an installed one can."
- used: "That command was used already.
  Make a new one on MacBook Pro." and "Nothing changed on this computer."
- expired: "That command expired.
  It lasts ten minutes; make a new one on MacBook Pro."
  ("It lasts thirty minutes" for a command that downloads) and "Nothing changed on this computer."
- unreachable, before the question, because the command cannot get Infinitary: "Could not reach MacBook Pro at 192.168.1.20." and "Both computers need the same network, or the same private network."
- something else answered: "Something answered at 192.168.1.20, but not the computer that made this command." and "Nothing was sent to it."

The words in Terminal follow the vocabulary like any other surface.
The command is the thing itself, in mono, and the app shows it only in its panel.

**Finding this computer again.**
A computer added by a command keeps the address its command named.
When MacBook Pro's address changes, as when its Wi-Fi hands it a new one, Mac mini is out of reach until it hears where MacBook Pro is now.
Another user on this computer is not stranded so: its command names the address a computer uses for itself, which no network changes, so Builder stays in reach when MacBook Pro moves to another Wi-Fi.
The way back is the same as the way in: make a new command in Devices and run it once on Mac mini, as the same user.
The command still asks its yes and gets Infinitary from MacBook Pro.
Mac mini stays the same computer on the list, so its projects, its sign-ins and its unmerged work stay as they were, and Terminal then shows:
```
Found MacBook Pro at 192.168.1.30. This computer runs its work as before, whenever sam is logged in.
```
Add it at Mac mini's address brings it back too, with nothing run there (captain's pick on FI3-985).
So does Devices' "Add it by its address" on a computer a command added that never reached this computer on the local network, where macOS holds its work's dial until someone at it allows it (`DevicesTab.prompt.md`, "Held on the local network").
Mac mini stays the same computer on the list, with its projects and sign-ins, and from then on reaches MacBook Pro only through MacBook Pro's own SSH connection, as a computer added by its address does, so a later move strands it no more.
A new command run as another user on this computer anyway asks nothing, since that user already runs your first mate's work:
```
Found Infinitary on this computer again. Builder runs its work as before.
It runs whenever Builder is logged in, even in the background. You can switch back.
```
Devices' panel then reads "Mac mini found this computer again.
It runs work as before."
(or "Running as Builder found this computer again."), with no hint to give it a project, and the feed says the same.
When MacBook Pro removed Mac mini while it was out of reach, the new command first does what that removal would have done there, then joins it anew: "MacBook Pro removed this computer earlier.", the removal's own lines, then the joined lines.
What that removal could not remove there it names, "Infinitary could not remove all it set up here, in …", with no promise to try again, and joins all the same.
A command from another first mate still says "This user already runs work for MacBook Pro." and "Nothing changed on this computer." while MacBook Pro answers.
When MacBook Pro does not answer - gone for good, as after Infinitary was installed there again - the command asks first: "This user runs work for MacBook Pro, which does not answer.", "Joining leaves it: Infinitary removes what it set up here for MacBook Pro, with its sign-ins." and "Work that never merged stays on this computer."
On a yes it says "This user left MacBook Pro.", the removal's own lines, then the joined lines; anything else is "Nothing changed on this computer."

A computer added by its address never looks for this computer at an old address: this computer's own SSH connection reaches it wherever this computer is, and comes back by itself.
Add it at its address, from Devices or the first mate's card, still finds it again while it is out of reach, and sets its Infinitary up anew.
Reaching it, this computer sees that its user there already runs your first mate's work, so it tells that computer where this computer is now instead of setting it up again.
The feed says "Reaching sam@mini.local with your SSH key.", "Telling Mac mini where this computer is now.", the copy's count and "Starting Infinitary on Mac mini." as above, then "Mac mini found this computer again.
It runs work as before."
Its row reads "Reaching sam@mini.local with your SSH key…", then "Telling Mac mini where this computer is now…", then the copy's count and "Starting Infinitary on Mac mini…", with no state and no Remove; no second row stands in the list.
Mac mini stays the same computer on the list, with its projects, its sign-ins and its unmerged work, and runs this computer's version of Infinitary after.
When nobody is logged in there as that user, the found line is followed by "Mac mini starts running work the next time sam logs in there."; when that user's session refused to start it in the background, by "Mac mini could not set itself to start in the background, so it runs no work for now." and "Ask again to add it."
When MacBook Pro removed Mac mini while it was out of reach, Add it sets it up anew, "Preparing Infinitary for Mac mini.", and that computer first does what the removal would have done there.

**Running as another user on this computer.**
For work that runs apart from the person: it runs as another macOS user on this computer, with sign-ins of its own, and never controls your first mate.
It does not keep the person's files private: macOS opens every home folder to every user on the computer, outside private folders such as Desktop, Documents and Library, so that user can read the rest.
Every place that offers it or shows it says so, and nothing changes what it may read (captain's pick on FI3-862, words only).
The person makes that user in System Settings first; the app never makes a macOS user or asks for an administrator password.
On a Linux home the words follow Linux, which keeps no private folders from other users and leaves it to the home folder's own permissions: "Like every user on this computer, it can read the files your home folder lets other users read.", "That user, like every user on this computer, can read the files your home folder lets other users read." and "Make the user in your desktop's settings first.", and Settings -> Devices reads "Like every user here, it can read the files your home folder lets other users read."
On a Windows home the words follow Windows, which keeps each user's own folder from every other account that is not an administrator, and installs Infinitary for each account apart: "Windows keeps your user folder from it, unless it is an administrator, who can open it.", "Windows keeps your user folder from that user, unless it is an administrator, who can open it." and "Make the user in Windows Settings first, and install Infinitary as that user."; Settings -> Devices reads "Windows keeps your user folder from it, unless it is an administrator.", and its panel says "Sign in to Windows as the user who should run the work, install Infinitary there, and run this once in PowerShell.", the command being one line for PowerShell that starts that user's own Infinitary.
"run work as another user on this computer" yields one decision from the first mate, "Run work as another user on this computer": "Its work then runs as that user, with sign-ins of its own, and cannot control your first mate.", "That user, like every user on this computer, can read files in your home folder, outside private folders such as Desktop and Documents." and "Make the user in System Settings first.
Then make the command here, and run it once as that user.", with a ghost "Not now" and a primary "Make the command".
The command runs Infinitary straight from this computer's app, with no download.
The person logs in as that user, runs it in Terminal, and switches back:
```
Infinitary on this computer asks the user builder to run its work.
Builder only runs work and cannot control your first mate.
Like every user on this computer, it can read files in your home folder, outside private folders such as Desktop and Documents.
Type yes to agree: yes
Joined. Builder runs work for Infinitary on this computer now.
It runs whenever Builder is logged in, even in the background. You can switch back.
```
Run as the user Infinitary itself runs as, it refuses: "This is the user Infinitary already runs as.
Log in as another user on this computer, and run it there." and "Nothing changed."
It runs work only while that user is logged in, including in the background after switching back (captain's pick on FI3-673).
Running whether or not anyone is logged in needs an administrator-level install, which is a later decision of its own.
In every list it is "Running as Builder", and its group label reads `RUNNING AS BUILDER`.

**Opening Infinitary later** on a computer added by its address or a command controls the first mate on MacBook Pro with no new link: that computer is already on the list.
Never the words helper, runner, agent, daemon, service, install, provision, machine, node or host for any of this (`copy/Vocabulary.prompt.md`).
