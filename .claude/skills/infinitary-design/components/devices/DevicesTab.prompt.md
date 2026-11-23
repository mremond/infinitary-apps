Settings → Devices on the computer where the first mate lives (captain's picks on FI3-681 and FI3-682, 2026-10-03): a topology and a list of your devices, one inspector, and the link or command that adds a computer.
A wide tab after Usage.
How a device joins and what keeps it out are pairing's rules, in the app's `docs/devices.md`; this page is how they look and read.
Adding a computer is `AddAMac.prompt.md`, signing in on it `SignInOnAMac.prompt.md`, and giving it a project `RunsOn.prompt.md`.
```jsx
<DevicesTab devices={[THIS_MAC]} address={{value:"192.168.1.20",kind:"this network"}}/>                        // nothing added yet
<DevicesTab devices={[THIS_MAC,BUILDER,AIR,MINI]} />
<DevicesTab devices={[THIS_MAC,AIR]} panel={{kind:"command",text:COMMAND,secondsLeft:581}}/>                   // a command is open
```
**The picture.**
The first mate lives on one computer.
Every other computer the person adds can control that first mate while Infinitary is open on it, and can run the work of a project set to run on it.
Running as another user on this computer runs work with sign-ins of its own, and controls the first mate only once the first mate moves there.
Like every user on the computer, it can read files in the person's home folder outside private folders such as Desktop and Documents, and the tab says so (`AddAMac.prompt.md`).
Adding a computer changes nothing by itself.
Every computer on the list can act as the person, the same as this computer, so the person adds only their own computers.
The iPhone and iPad app joins the same list as a phone, never runs work, and initially reads only (`PhoneView.prompt.md`).
A computer added before every computer could do both keeps what it could do - only controlling, or only running work - until it is added again; its row reads as a computer that controls or as a computer that runs work.

**Your devices.**
A micro label `YOUR DEVICES` (captain's pick), then one `--text-sm --fg-2` line: "Your first mate lives on this computer.
Its tasks and conversation stay here.
From any computer you add you can control it, and any computer you add can run a project's work.
Running as another user on this computer runs work, and your first mate can move there.
Like every user here, it can read files in your home folder."
The default Map is 380 px high and centers a cyan tesseract with quiet wireframe devices at fixed seats around it.
Use up to eight seats, then six, four or two as the tab narrows, with a fleet-wide count and a shape-coded edge legend: solid for contact, dots for an attempt, and a capped gap for out of reach.
Map and List select by device ID, use ordinary buttons and show the same inspector below.
Start with home selected; show Preferred address before Local address when available, and keep other users of this computer there.
Only home displays a selected standby's saved takeover endpoints, with their provenance, never as a live status.
The inspector uses the Projects list's box and the existing device row shape:
- This computer, first and always: the name "This computer", the mono line "MacBook Pro · your first mate lives here", the summary "Runs notes · Signed in to Codex, Claude and GitHub", its task count, and no Remove.
- Running as another user, right after This computer: the name "Running as Builder", the mono line "another user on this computer · runs work only, while Builder is logged in".
- A selected peer by its own name, drawn as text because the computer chose it: the mono line "a computer · joined today 14:06", or "a computer · sam@mini.local" when it was added by its address; a phone's reads "a phone · joined today 14:06".

The summary line is "Runs website and api" or "Runs no project yet", then "Signed in to Codex, Claude and GitHub" or "No sign-ins yet".
It leads with "Controlling your first mate now" while Infinitary is open on that computer.
A Windows PC that joined from its window controls and runs work as a Mac does, and reads the same.
On another version, its line ends "Install the newer Infinitary on that computer.", since no update reaches a Windows PC yet, and it has no Match button.
On the right one mono status - "1 task" in `--accent`, "idle", "connecting" while its SSH connection is being made, or "out of reach since 14:02" in `--warn` - then the row's ⋯ (below, "The row").
The dot is `ok` while the device answers, `idle` while its connection is being made (its status reads "connecting"), and `warn` while it is out of reach.
While Infinitary there is updated, its row follows the update's step in place of the status, even when Devices opened part way, and its dot is `idle` while it is out of reach; the Map reads "Updating" on a dotted edge, never Out of reach, for up to three minutes heard from nowhere.
A mono line too long for the row wraps between its parts; only a part wider than the whole line, such as a long address, wraps inside itself.
Out of reach, the status reads "out of reach since 14:02"; a user who has not logged in since a restart reads "not logged in since this computer restarted" (`RunsOn.prompt.md` has their feed lines).
A phone or a Mac that only controls reads "seen just now" while it answers.
The box's foot is the `ConnectChips` row shape: the micro label `ADD` and three chips, "+ A computer", "+ A phone" and "+ Running as another user".
A phone opens the scan-code panel described in `PhoneView.prompt.md`, including the current TestFlight-only availability.
Every build shows all three chips, installed and development alike.

**The row** (INF-5506's approved plan: "the calmest row, and each of these actions takes one more click to reach").
Every device's row has the same shape, a head, plain facts, and strips:
- The head: the dot, the name, one status on the right, and a ⋯ `RowMenu` whose label is "Mac mini actions".
  The status is the one word for where it stands - its tasks, "idle", "connecting", "setting up", "no new work", or since when it is out of reach - and never repeats on the facts below.
- The facts, inset under the name: the mono line that says what the device is and where, ending "Infinitary 0.8.4" when every copy on it runs this computer's version; the summary; any version line that is only a fact; where its copy stands; and the phone's approvals.
- One strip per thing that needs the captain, each a `--text-sm` sentence with its one small secondary button on the right, over a 1px `--line-1` rule.
  A strip in `--warn` says something is wrong; the rest read `--fg-1`.
  The strips stand in this order, and a row shows only those that apply: a removal waiting, with "Keep it"; a stopped SSH connection, with "Try again"; the old address, with "Make a command"; work not set up, with "Fix it"; held on the local network, with "Add it by its address"; automatic startup, with no button; another version, with "Match"; an earlier entry, with "Carry its tasks on here"; tasks waiting on a computer out of reach, "Its 2 tasks wait until it is back.", with "Move its tasks to…"; an app behind this computer's, with no button; and the step that app is at as it follows this computer's version, with "Update app".

The ⋯ holds the rare actions, in this order: "Change address", "Move your first mate here", "Keep a copy here" or "Ready to take over", then a separator and "Remove" in the danger tone.
Each item stands only where the rules below offer it; a phone's ⋯ holds Remove alone, and a row with nothing to offer has no ⋯.
The ⋯ is a Tab stop; Enter or Space opens it, the arrows walk its items, Escape closes it without touching a question open beside the row, and focus comes back to the ⋯ after a pick or when the question an item opened closes.

**Approving secret uses** (INF-1690 piece 4, captain's pick: "In Devices, as a switch on the paired iPhone"; INF-4207 decision 8 adds a Mac "set up once on the home, like a phone").
While Secrets are set up and open on this computer, the row of each phone, and of each Mac that controls this computer, adds, under its summary, the core `Switch` with its label "Approves secret uses" after it, then one `--text-sm --fg-2` line that says where it stands.
A build without protected storage, or storage that is not open, draws no switch.
Off, there is no line.
Turned on, it reads on at once and the line says "Waiting for Kun's iPhone.
Open Infinitary there to show its code."; once the phone offers its key it says "Kun's iPhone offered its key.
Check that the card's code matches the one Kun's iPhone shows.", with a small secondary Button "Compare codes" that shows the host's code card, which stays the one confirmation, asking for this computer's own Touch ID or password.
Confirmed, the line reads "Each Allow there asks for its own Face ID, Touch ID, passcode or password.
Code 1234 5678."
Turning it off before the card is confirmed takes the card down; turning it off once the phone approves asks under the switch, never on a card: "Stop approvals from Kun's iPhone?", its two sentences, a small secondary "Keep approvals", focused, and a small danger "Stop approvals", which asks this computer's own confirmation; until it is answered the switch stays on, and Keep approvals returns focus to the switch.
The switch takes Tab and answers Space, like every switch.
On the phone, its Settings shows the same switch under Secrets approvals; it only turns on there, and while on it says to turn it off in Settings → Devices on the computer.
On a Mac, Infinitary's window shows this computer's own cards: the code card adds one line, "This Mac shows the code 1234 5678.", for the comparison.
A use card there is cut down as a phone's is: while that Mac approves, it offers "Allow once", the primary, and "Don't allow", a ghost; a lasting allowance stays this computer's, so the card leaves out the line explaining it and adds one line in its own fine print: "Save a decision on MacBook Pro.
This Mac can allow one use at a time."
While it does not approve, the card offers only "Don't allow", leaves out the lines explaining each allow, and adds one line in its fine print naming where to set it up: "This Mac does not approve Secrets uses.
To set it up, turn on Approves secret uses on its row in Settings, Devices, then confirm it on MacBook Pro."
A window that can keep no approval key, as on Linux, names where to answer instead: "This computer cannot approve Secrets uses.
Allow this use on MacBook Pro, or on a phone or Mac set up to approve them."

**Bringing a computer back.**
A computer that runs work looks for this computer where its link or command said, so after this computer's address changes it stays out of reach until it hears where this computer is now (`AddAMac.prompt.md`, "Finding this computer again").
Another user on this computer looks for it at the address a computer uses for itself, which a new network never moves, so only a change of where Infinitary listens on this computer itself strands it.
When this computer's address changed since the computer was last in reach, its row adds one strip, and the way back:
- another computer added by a command: "It still looks for this computer at its old address.
  A new command run there brings it back.", with a small secondary Button "Make a command", which opens the command panel for another computer.
- another user on this computer: "It still looks for this computer at its old address.
  A new command run as Builder brings it back.", with "Make a command", which opens the command panel for another user.

Back in reach, the strip goes, and the row reads its tasks or "idle" with what it ran before.
The line never stands while this computer is on no network: nothing reaches this computer then, wherever it looks.
A computer added by its address never takes the line: this computer's own SSH connection follows this computer wherever it is (below, "Reached over your SSH").

**Held on the local network** (captain's pick on FI3-1001).
A computer added by a command runs its work in the background, and its work dials this computer itself.
On the local network macOS holds that dial until someone at that computer allows Infinitary there, so a computer with no one at its screen joins and then never comes into reach.
While a computer a command added has not reached this computer since it joined, and it looks for this computer at an address on the local network, its row adds one strip: "It has not reached this computer since it joined. macOS lets Infinitary on Mac mini use your local network only once someone there allows it.
Added by its address, this computer reaches it with your SSH key instead."
Its status reads "out of reach", with no time since, because it never was in reach.
The strip's button is a small secondary "Add it by its address".
It turns the row into one question in place, Change address's shape: "Where to reach Mac mini" over "The address you use with SSH for it, as sam.
Remote Login must be on there.", a mono `Input` with the placeholder "sam@mini.local", a small primary "Add it" and a ghost "Cancel".
Add it there is + A computer's address form: the row reads "Reaching sam@mini.local with your SSH key…", then "Telling Mac mini where this computer is now…", and Mac mini stays the same computer on the list, reached over this computer's own SSH from then on (`AddAMac.prompt.md`, "Finding this computer again").
Once its work reaches this computer, by either way, the line and the button go for good.
A private network's address, such as Tailscale's, is not the local network, and another user on this computer looks for it on this computer itself, so neither takes the line.
A computer whose command named an address this computer no longer has takes "Bringing a computer back" instead: the old address is the first thing to mend.

**A Mac that has not finished setting up** (the captain's ask on INF-4835: "Set it up again by itself, and say why when it still cannot").
A Mac that joined with its window also runs its work in the background, and its window sets that work up again by itself at every connection to its home, the first of each launch included and never before a welcome.
While its window is connected and its work cannot start, its row adds one strip naming why, such as "Its work cannot start: Infinitary on iMac is not allowed to run in the background.
On a Mac, turn it on there in System Settings › General › Login Items.", with a small secondary "Fix it".
Fix it asks that Mac's window to check its work again now; nothing else changes on the row until the window says what it found.
The reasons are another first mate's work there, this first mate's work under another entry on the list, an earlier removal there not finished, the app opened from a disk image or its download folder, the background refused, no background to use, and a run that has not reached this computer.
Held on the local network keeps its own strip beneath instead of a second one saying the same.
While its work is starting the strip reads "Its work on iMac is starting.", the status reads "setting up" in `--fg-2`, and there is no Fix it.
Once its work is in reach the line and the button go.

The joining window says the same from its side, in the quiet strip under the input the voice and diagnostics notices wear (`voice/VoiceInput.prompt.md`, "Under the pill"): one `--text-sm --fg-2` line naming why, such as "This computer cannot run work for MacBook Pro: Infinitary is not allowed to run in the background.
On a Mac, turn it on in System Settings › General › Login Items, then try again.", a small ghost "Not now", and one small secondary "Try again", which reads "Trying again" while the check runs.
It shows only while its work cannot start or has not reached that computer, never while it is starting, and goes once its work is in reach; the window checks again by itself as it comes back to the front, so a trip to System Settings clears it.
Not now folds it into a quiet ghost line at the top bar's left, after the line that names the other computer: a 6px `--warn` dot and "This computer's work: see why" in `--text-sm`, whose press opens the notice again.
It stays folded while the window runs and the reason stays the same; a new reason, or a stop after the work ran, shows it whole again.

**Reached over your SSH.**
A computer added by its address is reached over this computer's own SSH connection while Infinitary runs here, and while it is out of reach its status says where that connection stands: "connecting using SSH…" before its work said hello through it, "reconnecting using SSH…" while this computer tries again by itself after a connection it had before, "connecting using SSH…" for every try of a computer never seen, whether a first attempt failed or it dropped before its first hello, "starts the next time sam logs in there" while nobody is logged in there as that user, and "could not start" when that user's session holds no background work, which no login mends.
In reach through it, its status is its tasks or "idle", like any computer's; its dot is `ok` while connected and `idle` while connecting or reconnecting.
The state reads "connecting" during a fresh attempt, then shows the SSH retry while this computer keeps trying; "out of reach" in `--warn` is for a device without contact or an active attempt.
When only the captain can mend it, this computer stops trying: the status reads "out of reach since 14:02", and the reason's two lines stand as one strip in `--warn` - "sam@mini.local does not answer as the computer this computer reached before.
If you did not set it up again, someone may be in between.
Check it, then try again.", or a refused or locked key, a key the app that holds it did not approve ("Could not sign in to sam@mini.local.
The app that holds your SSH key did not approve it.
This computer tries again when it wakes and every few minutes.
Approve it in that app when it asks."), a key whose app is not open ("Could not sign in to sam@mini.local.
The app that holds your SSH key is not open.
Open that app, and this computer tries again when it wakes and every few minutes."), Remote Login that will not let the connection through, Infinitary gone there, or a computer that left your first mate ("sam@mini.local runs work for another first mate now.
Remove Mac mini here.
Nothing changes there for the other first mate.").
The strip's button is a small secondary "Try again", except on a computer that left your first mate, whose ⋯ offers only Remove.
A computer that left your first mate is never said to reach another computer, or to be back later, and it has no Try again and no Change address.
"Change address" is the first item in the ⋯ of every other computer added by its address.
It turns the row into one question in place: "Where to reach Mac mini" over "The address you use with SSH for it now.
This computer checks it is the same computer first.", a mono `Input` holding its address, a small primary "Change it" and a ghost "Cancel".
While this computer looks there the summary reads "Reaching sam@studio.local with your SSH key…", with no state and no buttons; a refusal's two lines stand at the top of the tab, and the feed says "This computer reaches Mac mini at sam@studio.local now." once it is found.
The feed says each change of the connection once, never each try: why it stopped, in two warning lines, and "Mac mini is connected using SSH again." once it is back.
A locked key, or one whose app did not answer, reads "Unlock it, and this computer tries again when it wakes and every few minutes." as its second line: this computer tries it quietly, the row keeps its stopped state and Try again while it does, and it comes back by itself once unlocked.
A key its app did not approve is tried quietly the same way, and comes back by itself once approved there.
A key whose app is not open is tried quietly the same way, and comes back by itself once that app is open.
Command search's "Try again to reach your computers" does Try again for every computer this computer stopped trying, and opens this tab.
There is no setting for SSH, no port and no dashboard of connections: the row is the whole surface.

**Automatic startup on Linux.**
A computer stays joined when Infinitary cannot set up automatic startup there.
Its mono line ends “automatic startup not set up”, with “This setup does not start work at login.” as a strip with no button.
An unreadable check reads “automatic startup not checked”, with “Infinitary could not check automatic startup here.”
These facts are independent of reachability: an explicitly started worker can answer while automatic startup is not set up.
A supported startup waiting for a verified inactive user manager keeps the existing next-login wording.
Do not offer enabling work after logout, removing and re-adding, or updating as a remedy for unsupported startup.
The row does not show the macOS local-network permission explanation for known unavailable or unknown startup.
A genuinely changed home address still keeps its existing route guidance; it does not supply automatic startup.

**+ A computer** opens its address form under the foot at once, with the caret in the address field (captain's pick on INF-4926: the address is the default way to add a computer, because a computer added by its address never needs a visit after setup).
The form is "The other computer's address" over "The one you use with SSH.
Remote Login must be on there." and "This computer then keeps it updated and reaches it by itself.", a mono `Input` with the placeholder "you@mini.local", beside it a narrow mono `Input` labelled "Port" with the placeholder "Port 22", a small primary "Add it" and a ghost "Cancel" (`AddAMac.prompt.md`).
Under the computers on this network, after a `--line-1` hairline, the question line "Can’t turn on Remote Login there?" leads the two other ways, each a small secondary Button with its `--text-sm --fg-2` line beside it, both reached with Tab:
- "Paste a link into Infinitary there", "You’re at that computer, or it is a Windows PC.": the link panel below (`JoinAnotherMac.prompt.md`).
- "Run a command there", "You can type in Terminal there.": the command panel below.
  Each closes the form and opens its panel as it always did.
  The port stays empty for SSH's usual one; another port joins the address as SSH writes it, `ssh://you@mini.local:2222`, and that is the address the row names and later updates reach.
  On a Linux home, where the other computer is as likely Linux, the line under the label reads "The one you use with SSH.
  Its SSH server, or Remote Login on a Mac, must be on.", and the same in place of "Remote Login must be on there." on a row's own address question.
  Under the fields, the computers on this network with Remote Login on, under the micro label `ON THIS NETWORK`, each filling in the field when picked (`AddAMac.prompt.md`, "Nearby").
  While it works, its row stands at the end of the list: the address as its name until the computer says its own, the mono line "a computer · sam@mini.local", an `idle` dot, and the summary "Reaching sam@mini.local with your SSH key…", then "Preparing Infinitary for Mac mini…", "Sending Infinitary to Mac mini… 42.3 MB sent" with the count moving, and "Starting Infinitary on Mac mini…" (`AddAMac.prompt.md`, "By its address").
  After the password typed once (`AddAMac.prompt.md`, "The password, once"), the summary reads "Letting Infinitary's own key in on sam@mini.local…" until "Preparing Infinitary for Mac mini…".
  A refusal keeps the address in the field and shows its two lines in the form, in `--warn`, with a small primary "Try again" and the ghost "Cancel".
  Try again runs the same add.
  Cancel closes the form and changes nothing.
  Success still closes the form.
  The field, Try again, Cancel and the two other ways are reached with Tab.
  A Windows home adds no computer by its address: there + A computer opens the two other ways alone, as before, with no address form and no computers on this network.
  Until the home says whether it adds by its address, the two other ways show alone the same way, the link focused; on a home that does, the address form then takes their place with the caret in its field.
  A computer whose user runs another first mate's work asks once in an aside of the same shape, with a danger "Leave it and add" and a focused ghost "Cancel" (`AddAMac.prompt.md`, "Another first mate's Mac").

**+ Running as another user** opens the command panel for a user on this computer at once.

**The link and the command.**
A link or a command exists only after the captain's own click, here or on the first mate's card, and it lives in its panel alone: never in a card, a thread, a feed line, a task record or a crewmate's notes.
A command carries a link inside it, with the same rules: it works once, for ten minutes, or thirty for a command that downloads Infinitary on another Mac.
While one is open the panel stands at the top of the tab: `--bg-1`, a 1px `--accent` hairline, `--radius-m`.
In it a micro label, one `--text-sm --fg-2` line, the link or command on one line in a mono `--text-xs` box on `--bg-0`, cut with an ellipsis, and a small primary Button:
- a link: `NEW LINK`, "Your first mate stays on this computer.
  Your other computer will show it and can run work for it.
  Paste this link into Infinitary on your other computer, at its first launch.", and "Copy link".
- a command for another computer: `NEW COMMAND · ANOTHER COMPUTER`, "Run this once in Terminal on the other computer, as the user who should run its work.
  It gets Infinitary from this computer, so both need the same network.", and "Copy command".
- a command for another user: `NEW COMMAND · RUNNING AS ANOTHER USER`, "Log in as the user who should run the work, and run this once in Terminal.
  Switch back when it says it joined.", and "Copy command".

Under them the mono `--text-xs --fg-3` count "works once · 9:41 left" beside a small ghost "Stop it".
"Copy link" and "Copy command" read "Copied" for 1.5 s after success.
When a device uses it the hairline turns `--line-2` and the panel reads, with an `ok` dot, one of "iMac joined.
It can control your first mate and run its work.
Your first mate's tasks and conversation stay on this Mac.", "Mac mini joined.
It has git and Claude Code, and no sign-ins yet." or "Running as Builder is set up.
It runs work only, and has no sign-ins yet.", over "Give it a project in Projects when you want it to run work.", with a ghost "Done".
Once that computer has a sign-in, the panel goes; Done dismisses it before then.
A computer already on the list that used the command to find this computer again reads "Mac mini found this computer again.
It runs work as before.", with no line under it (`AddAMac.prompt.md`, "Finding this computer again").
When ten minutes pass unused it reads "The link expired before any computer used it."
(or "The command expired…") over "Make a new one when the other computer is ready.", with a secondary "Make a new one".
A restart of this computer forgets an open link or command, and the panel is simply gone.
There is no code to scan beside a link until the iPhone app exists (captain's pick on FI3-681); then the code stands at the panel's left, and the line adds "Or scan the code with Infinitary on your phone."

**Remove** works for every device but This computer, as one question in place, `RemoveProject`'s shape, with a ghost "Keep it" focused so Enter never removes:
- A computer that runs no work: "Remove MacBook Air?
  It is cut off at once." over "To come back, it needs a new link.", with a danger "Remove".
- On a computer that controls the first mate, every sentence below that says this computer names the first mate's computer instead.
- A computer or a user that runs work: "Remove Mac mini?
  Its unmerged work comes to this computer first." over "Its task on website stops.
  Infinitary then removes what it set up there, with its sign-ins." and "website and api run on this computer after.", with a danger "Remove".
  The row then reads "Bringing website's unmerged work to this computer…", then "Removing what Infinitary set up on Mac mini…", and leaves the list.
- Out of reach: "Remove Mac mini?
  It is out of reach."
  ("It is connecting." while its connection is being made) over "Its unmerged work on website is still there.
  Wait, and it comes to this computer before Mac mini is removed.", with a secondary "Remove when it is back" and a danger "Remove now".
  Waiting adds the first strip, "It is removed when it is back.", with a small secondary "Keep it", and Remove leaves the ⋯ until it is kept.
  "Remove now" leaves that work on the other computer, and Infinitary removes what it set up there when that computer is back.
- A computer that left your first mate: "Remove Mac mini?
  It runs work for another first mate now." over "Its unmerged work on website stays there.
  Nothing changes there for the other first mate.", with only a danger "Remove now": it is not coming back, so nothing waits for it.
  The feed then says "Mac mini had nothing of your first mate's to remove.", never that it removed something there.

Only the captain's own click in this computer's window removes a device; the first mate never does.

### Joined again

A computer that runs work and joined again under a new key - its saved work deleted, or Infinitary installed fresh - is a new row, and its earlier row stays out of reach with its tasks.
The new row adds one strip: "An earlier entry with this name and user is out of reach, with 2 tasks waiting."
("…, and projects still run on it." when only projects do), with a small secondary "Carry its tasks on here", its accessible name "Carry the earlier entry's tasks on to Mac mini".
Any row out of reach that still holds a started task adds the strip "Its 2 tasks wait until it is back." with a small secondary "Move its tasks to…", its accessible name "Move the tasks of Mac mini to another computer".
Either one turns the row it was pressed on into one question in place, like Remove's:

- From the new row, "Its 2 tasks continue on Mac mini, each from the last commit this computer brought home." over "What only Mac mini holds stays there: commits after that one, edits not committed, files git does not track, and the files in its task folders there." and "Then Mac mini, out of reach, comes off your list, and its projects run on Mac mini."
- From the row out of reach, "Where should the tasks of Mac mini continue?" over grouped pills, one per computer in reach and This Mac, unpicked; the same lines appear once one is picked.
- A ghost Cancel, focused so Enter moves nothing, and a primary "Carry them on", disabled until a destination is picked.

Every count counts only tasks that move: an independent review follows its builder, stays behind, and stops when the old entry is removed.

After the yes the row out of reach reads "Moving its tasks to Mac mini…" and offers nothing, then leaves the list once every task has moved; the feed says "The tasks of a computer out of reach continue on Mac mini, and that entry is off your list."
A task the move refuses stands under the tab as the problem, one line each, and the row stays.

**Moving your first mate** (INF-4207 piece 5, captain: "let me move my home from macbook to mac mini").
A computer that runs work, in reach, on this computer's version and not being updated or removed, offers "Move your first mate here" in its ⋯, before Remove.
Shown only where the first mate lives, never in a window of another computer.
It opens an aside under the row, the Ready list: the question "Move your first mate to Mac mini?" over one `--fg-2` sentence saying what happens ("Your first mate pauses for a moment while its whole record crosses, then runs on Mac mini.
This computer then controls it and keeps running work, and your other devices follow on their own.").
While that computer is checked the aside says "Checking Mac mini…".
Then one line per gap, a plain list at `--text-sm`: a gap that keeps the move from starting in `--warn`, a note about what differs after it in `--fg-2`; with none, "Nothing stands in the way.".
The actions are a primary "Move now", disabled while any gap blocks, and a ghost "Not now", focused so Enter never moves.
Once moving, the aside says each step as one `role="status"` line and offers a ghost "Cancel the move" until the first mate stops for the last copy.
The first line, "Moving your first mate to Mac mini.", stands from the moment the move is accepted, so Move now never shows again while nothing has crossed yet; later lines say each step ("Copying your first mate's record to Mac mini.", with a mono count when it counts).
A move that fails or is cancelled says why in the same line, with "Not now" to close the aside.
When Mac mini is out of reach for three minutes after the first mate stopped for the last copy, the step line says this computer still waits for it, and a secondary "Start my first mate here again" stands under it.
It never starts anything by itself: it turns the actions into a confirmation in `--warn`, "If Mac mini comes back, it may run your first mate too.
Your devices stay with this computer and refuse Mac mini.", over a primary "Start it here", and a ghost "Keep waiting" that is focused, so Enter never starts it.
Start it here starts the first mate on this computer again with its record as it was, and the step line says so.
Nothing moves the first mate by itself; only this click does.

**Keeping a copy** (INF-4207 piece 7).
A computer that runs work, not being removed, offers "Keep a copy here" in its ⋯, before Remove.
Like Move, it is shown only where the first mate lives; a window of another computer shows only where each copy stands.
The click names it at once: it takes one full copy of the first mate's record, then each change right after the first mate saves it, and never opens the copy itself.
A computer that keeps a copy shows where its copy stands on a line of its own under its summary, `--text-sm --fg-2`: "Taking a full copy of your first mate" with a mono percentage, "Copy in sync", "Copy catching up · 12 changes", or, out of reach, "Copy from 9:05" with the copy's time ("No copy yet" before its first).
One whose Infinitary is too old to keep a copy reads "Update Infinitary there to keep a copy" in `--warn`.
Its "Keep a copy here" becomes "Ready to take over" in the same place.
It opens an aside under the row like the Ready list for a move: the question "Could Mac mini take over your first mate?" over one `--fg-2` sentence ("Mac mini keeps a live copy of your first mate's record and never opens it itself.
This list says what it would still need to take over.").
While that computer is checked the aside says "Checking Mac mini…".
Then one line per gap, the copy's own line first ("Mac mini's copy is in sync with your first mate.", or why it is not, in `--warn`), then a line for each other computer that keeps a copy, then each line a move there would show.
A copy it reaches reads "Mac mini reaches the copy on Mac Studio." in `--fg-2`; one it does not reads, in `--warn`, "Mac mini cannot reach the copy on Mac Studio.", adding "macOS lets Infinitary on each of them use your local network only once someone there allows it." where both are Macs, or "Mac mini has not heard where the copy on Mac Studio listens.
It hears once Mac Studio is next in reach of your first mate."
A computer whose Infinitary is too old to reach the other copies reads "Mac mini runs an older Infinitary that cannot reach the other copies.
Update it there." in `--warn`, and an other copy that is too old, "Mac Studio runs an older Infinitary that other copies cannot reach.
Update it there."
The actions are a ghost "Stop keeping a copy", which deletes the copy there once it is in reach, and a ghost "Close", focused so Enter never stops it.
Taking over is not offered here; this list only says how ready each computer is.
A secrets gap that waits on the captain carries a small secondary "Keep Secrets there" beside its line: the click asks that computer to confirm the person on it, the line then reads "Confirm on Mac mini itself, as it asks you there, to keep your Secrets on it.", and once they confirmed it moves to the lines that only note.
A sign-ins gap carries one small secondary "Sign in to Claude there" per missing provider or project host, which opens Subscriptions or Integrations with that computer's sign-in already started.

**Taking over** (INF-4207 piece 8).
On a Mac or Windows PC that keeps a copy and controls the first mate's computer, while that computer is out of reach, Controlling (`RemoteControl.prompt.md`) adds a section under its own row, labeled "Take over" like any section.
One `--fg-2` sentence says when the copy is from and that it can take over while that computer is out of reach.
A box holds one row with a `warn` dot: "MacBook Pro is out of reach.", or "MacBook Pro said it was going to sleep and is out of reach.", or "Infinitary quit on MacBook Pro.".
Under it, one `--text-sm --fg-2` line per other copy as that computer last said it, "Mac Studio's copy is from 9:05, as MacBook Pro last said.", with a small `--warn` "may be newer" after one that held more changes.
A secondary "Take over" ends the row; while that computer never said what taking over needs, it is disabled under a line saying to update Infinitary there first.
The click asks in place, like Leave: "Take over as your first mate's computer?
Your first mate starts here from this copy, after Touch ID or your password." and "If MacBook Pro comes back, it stops and keeps a copy instead.", with a ghost "Stay", focused so Enter never takes over, and a danger "Take over".
On a Windows PC the question ends "after Windows Hello or your Windows password." instead.
The danger button then asks Touch ID or the password, or on a Windows PC Windows Hello, or the Windows password where Hello is off; while the work starts the first mate it reads "Taking over…", and a refusal reads in place as a status line.
Once it started, the window starts over as this computer's own first mate.

**Two homes.**
When another computer answers with the same home number after a take over of its own, Controlling shows a box with a `danger` dot: "Mac Studio also says it is your first mate's computer, after a take over of its own." and the status line "This Mac stays with MacBook Pro.
Keep one in Settings → Devices on either of them; the other then stops and keeps a copy."
On the first mate's own computer, the same two homes put a section labeled "Two first mates" above the Devices list, one box and one row with a `danger` dot: "Mac Studio also answers as your first mate, with this one's number.", then the question line "Merges, pushes and secret uses wait until you keep one.
The one you do not keep stops and keeps a copy of the other."
The row ends with a ghost "Keep Mac Studio" and a secondary "Keep this one"; the answer reads in place as a status line.

**Stepped down.**
On a Mac that was the first mate's computer until a copy took over, Controlling adds a section labeled "Stepped down" under its own row.
One `--fg-2` sentence says which computer took over and from when its copy was, and that what follows never reached it.
A box lists the newest task feed lines this Mac saved after that copy, one row each with a `warn` dot: the task's title as the name, then the line and its time in `--fg-2`; with none, one row with an `ok` dot reads "Nothing: Mac Studio had everything this Mac saved."
A last `--fg-2` sentence says this Mac keeps its own record of that time set aside, and nothing opens it again.

**Another version.**
A computer that runs work, connected on another version of Infinitary than this computer's, says so on a strip of its own: "Has Infinitary 0.1.20, older than this computer's." or "Has Infinitary 0.1.31, newer than this computer's."
One too old to say its version reads "Has an older Infinitary than this computer."
(or "a newer").
While it still takes work its dot stays `ok`, and its status is its tasks or "idle".
One that takes no new work adds "It takes no new work until it is updated." and the strip turns `--warn`; its dot is `warn`, and its status "no new work" in `--warn`.
The strip's button is a small secondary "Match", older or newer, since it brings that computer to whatever this computer runs; its accessible name is "Match Mac mini to this computer".
When this computer runs Infinitary from its code, the strip reads "Runs another build than this computer, which runs its code at commit 1a2b3c4.", and Match has that Mac get the committed code, build it and start from it, the row following each step: "Mac mini is getting this computer's code.", "Mac mini is installing what this computer's code needs.", "Mac mini is building this computer's code."
On Match from the row or the card, try the connection update first, then the saved address or current connection’s candidate if the worker needs a package update.
The app's update by itself tries only the connection, and raises the card as soon as the worker comes back unchanged from that update without being sent a copy.
Show any address, confirmation or approval question in an inset directly under that worker’s row.
Keep that worker selected while the request is in progress or has an unanswered question, including when Match came from a card.
Answering the last question or canceling the update question releases selection.
Adding a computer is still an aside under the Add controls.
The app updates it by itself as it connects, and raises a card for it when it cannot (`UpdateNudge.prompt.md`), so the row is not the only place it is said.
It brings the computer to this computer's version (`AddAMac.prompt.md`, "Updating any other computer"): over Remote Login for a computer added by its address, or for a joined Ubuntu package worker using a verified update address after the person's own Match, and otherwise over your network.
A computer whose version of Infinitary is too old to update from here makes the command for it instead: the command panel for another computer, or for running as another user, which run there once finds this computer again on this computer's version.
Out of reach, a row says nothing of its version: this computer cannot tell it.
Connected on another version, a row is in reach, so it never shows the old-address line or its way back ("Bringing a computer back").

**Each copy's version.**
Every row says the version each copy on it runs, while that copy is connected.
When every copy runs this computer's version, that is one mark at the end of the mono line, "Infinitary 0.8.4", and no sentence.
Otherwise it is a line of its own among the facts, `--text-sm --fg-2`.
The app open there comes first: "Its app has Infinitary 0.8.4, as this computer does.", or "Its app has Infinitary 0.8.3, older than this computer's."
(or "newer").
An app too old to say its version reads "Its app has an older Infinitary, too old to say its version."
An app behind this computer's - older, or too old to say - turns the line into a strip, in `--warn`, so a copy left behind stands out.
A computer whose work runs this computer's version while its app does not adds "Its work runs Infinitary 0.8.4, as this computer does."
A phone's app has versions of its own, never compared: "Its app has version 0.1.0 (212).", the version and build its own Settings shows.
A copy out of reach or not open says nothing of its version, and while a computer updates the line gives way to the update's own.
An app behind this computer's updates itself to this computer's version while nobody uses it there, and a strip after the version's says each step: "Its app updates to Infinitary 0.8.4 by itself: 40% downloaded.", "Its app has Infinitary 0.8.4 ready and starts again on it once nobody uses it there.", after Update app "Its app has Infinitary 0.8.4 ready and starts again on it once the words typed there are sent or cleared.", "Its app starts again on Infinitary 0.8.4."
One that cannot says so in `--warn` with what to do there ("Its app cannot update to Infinitary 0.8.4 by itself.
It updates only from its own window there, so update it there."), and one that tried says "Its app could not update to Infinitary 0.8.4 by itself.
Update app tries again."
While it gets the version, waits or failed, that strip's button is Update app (secondary, small, named "Update the app on Mac mini" for a screen reader), which has it get the version at once and start again as soon as no words are left unsent there, even with its window in front.

**Updating** starts with the summary "Updating Infinitary on Mac mini…", with no version line, no status and no Match or Remove until it is done (`AddAMac.prompt.md`).
An update the app started by itself reads the same while Devices is open, from its first count or "Starting Infinitary on Mac mini…".
For a Mac reached by its address, Add and Match first let it download this computer's published version itself, and so does Match for a Mac a command added, once it runs a version that takes the download.
Its summary and the feed read "Mac mini is downloading Infinitary… 200.6 MB of 401.1 MB", or "200.6 MB so far" when the release states no size.
The count changes in place at most once a second; it has no bar, percentage or time remaining.
If the download fails or its checksum does not match, the feed explains that this computer is sending its own copy instead, and the row and feed count "Sending Infinitary to Mac mini… 42.3 MB sent".
While this computer gets the fallback build, the row returns to preparing instead of keeping the failed download's count.
A development or unpublished version sends that counted copy without trying a download.
Two minutes without bytes moving stops a download or send; a slow transfer that keeps moving can finish.
The first empty observation stays silent until bytes or a known total arrive.
After checks and unpacking, the summary reads "Starting Infinitary on Mac mini…" only when the remote script is about to run the update.
A failed check or unpack keeps its definite failure; sending the last byte alone never means the app started.
Silent start work uses its existing backstop, not the transfer's two-minute deadline.
If the outcome is lost after starting, the warning says the computer may already have updated and to check Devices before starting another update.
Another user on this computer uses its local copy and makes no public download lookup.
Updated over your network, a computer that is sent this computer's copy - an older one, or one whose download failed - counts it the same way, "Sending Infinitary to Mac mini… 42.3 MB sent", and once it answers that it starts again, its row reads "Starting Infinitary on Mac mini…" until it is back on this computer's version.
A download over your network goes on when the connection drops: once that computer is back, the row picks its count up again and follows it until it runs this computer's version, never saying it was out of reach while it may still be downloading.
A stop names inactivity, not a failure to reach the computer.
A stop by the thirty-minute time limit, before Infinitary starts there, names that limit the same way: "Updating Infinitary on Mac mini stopped at its 30-minute time limit." and "Nothing changed there.
Ask again.", never "Could not reach".
It stays above the list until the next action, as any refusal but a computer that did not answer does.
The row keeps its existing type, spacing, focus and disabled controls.
Remove on a computer that takes no new work asks as for one out of reach, with its own first line: "Remove Mac mini?
It takes no new work." over "Its unmerged work on website is still there.
Update it, and its work comes to this computer before Mac mini is removed.", with a secondary "Remove once it is updated" and a danger "Remove now".
Waiting adds the first strip, "It is removed once it is updated.", with "Keep it".

**Addresses in the inspector.**
Home shows Preferred address first when present, then Local address and Over the internet, each with a dot, one plain line and a mono state on the right.
A selected peer shows its saved Remote Login destination once in its details, separate from its saved takeover addresses.
Map and List show when a connected device cannot take work, when SSH is connecting or reconnecting, and known setup or update progress.
Use the warning color and the explicit Out of reach label when neither contact nor an attempt is present; a computer being updated counts as an attempt and reads "Updating".
A way this computer has reads a green dot, its address in mono, and ready, or "1 computer" in accent when a device reached it there.
A way it lacks reads idle, with what gives it, and off.
Over the internet always reads idle: "Never.
Infinitary does not open this computer to the internet.
A private network covers that."
With no network at all, one line says a link works only on this computer, and the copy buttons stay off.
A foot line says a link or command carries every way at once, so there is nothing to choose, and Copy a link and Copy a command stand under it.
One click makes one, copies it and opens the panel at the top reading Copied.
When this computer moves to another network, the rows follow within seconds, with the tab open, and a computer that still looks at an old address takes its line ("Bringing a computer back").
The app lists only this computer's own interfaces and never reads another program's settings.

**A home's firewall.**
A Linux desktop or a Windows PC may turn on a firewall that drops a computer dialing this one, and nothing would say why it never joins.
A Linux or Windows home looks at its own firewall, reading only what any user may read and never asking for a password, and when it may keep devices out the tab says so in one place, as one `--text-sm` line in `--warn` with the way to let them in under it in a mono `--text-xs` box on `--bg-0`, the panel's own box:
- ufw on, whose rules only an administrator may read: "The firewall on this computer may keep your other computers out.
  To let them in, run this once in a terminal:" over `sudo ufw allow 47623/tcp`.
- firewalld running, unless it answers that the port is open or its zone is Fedora Workstation's own, which lets every port from 1025 in: "The firewall on this computer may keep your other computers out.
  To let them in, run this once in a terminal:" over `sudo firewall-cmd --permanent --add-port=47623/tcp && sudo firewall-cmd --reload`.
- NixOS's own firewall on: "The firewall on this computer may keep your other computers out.
  To let them in, add this to your NixOS configuration and rebuild it:" over `networking.firewall.allowedTCPPorts = [ 47623 ];`.
- Windows Defender Firewall keeping the port closed on a network profile in use, as it does where its person did not let Infinitary in when Windows asked: "The firewall on this computer may keep your other computers out.
  To let them in, run this once in PowerShell as an administrator:" over one line that adds a rule letting Infinitary's program in at the port on those profiles, first removing a rule that blocks it, or letting rules apply where the profile blocks every incoming connection.

It stands in the open link or command panel while one for another computer is open, under the panel's line, since that is when the person adds one; otherwise under the Address row.
A command for another user on this computer never takes it: that user dials this computer itself, which no firewall stops.
Once the firewall lets devices in, or is turned off, the line goes the next time the tab reads where devices find this computer.
A Mac never shows it: macOS asks its person before a firewall keeps Infinitary out.

**Asking the first mate.**
Each card's button is the captain's own click on the card's chrome; it opens this tab and acts on arrival, the way a sign-in action opens Integrations and starts that sign-in.
- "connect my MacBook Air so it can control you" yields one decision from the first mate, "Connect your MacBook Air": "Your first mate stays on this computer.
  Your MacBook Air will show it and can run work for it.", "Make a link here, then paste it into Infinitary on your MacBook Air." and "It works once, for ten minutes.
  Only your click can make it, so I never see it.", with "Make a link" and "Not now".
- "add my mini by a command" yields "Add a computer by a command": "Make the command here, then run it once in Terminal on that computer." and "It works once, for ten minutes, or thirty when it downloads Infinitary there.
  Only your click can make it, so I never see it.", with "Make the command" and "Not now".
- "run work as another user on this computer" and "add my mini at sam@mini.local" are in `AddAMac.prompt.md`.
- "remove the mini" yields "Remove Mac mini?": "Its task on website stops, and its unmerged work comes to me first." and "Then I remove what I set up there, with its sign-ins.
  Only your click can remove a computer.", with a danger default "Remove Mac mini" and a ghost "Keep it".
  The click opens this tab and removes it on arrival.

The link, the command and the removal stay out of every card: a card carries only the button.

**Feed lines** at this computer: "MacBook Air joined.
It can control your first mate and run its work.
Your first mate's tasks and conversation stay on this computer.", "Mac mini joined your devices.
It has git and Claude Code, and no sign-ins yet.", "Mac mini found this computer again.
It runs work as before.", "MacBook Air left.", "Removed MacBook Air." and "Removed Mac mini. website and api run on this computer now."
Never the words pair, grant, client, server, host, primary, machine, helper, runner, socket, port, key, pin, certificate or QR code (`copy/Vocabulary.prompt.md`); an address stays in mono where it is the thing itself.
