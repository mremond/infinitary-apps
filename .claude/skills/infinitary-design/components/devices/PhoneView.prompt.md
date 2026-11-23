# Infinitary on iPhone and iPad

The native SwiftUI shell uses the shared dark and light colors, Space Grotesk for words and JetBrains Mono for data.
Native controls keep Dynamic Type, VoiceOver, hardware-keyboard focus and platform-sized touch targets of at least 44 points.
The screen is opaque, with the shared void background, raised cards, hairlines and one ice-cyan selection.
Native colors, spacing and radii are generated from the shared tokens; cards use the card radius and fields the control radius.
The launch screen is the shared void in each appearance, so the first frame is already the app's own surface, never pure white or black.
Every sheet title is inline in Space Grotesk at the headline size, never the system's large bold title.
The paste, Settings and computer sheets sit on the panel color with a hairline at their edge.
The phone's button is the Mac's row: rounded rectangles at the control radius, each its own width, drawn 37 points tall inside a 44-point touch area, at the trailing edge with the default last and filled with the accent, a danger choice in a red outline and the rest in a hairline outline; no button fills the width.
Where a choice is a way in or a thing to pick rather than a decision, it is a row in a list instead.
A plain field, such as the task search, a crewmate message or a computer's link, is the app's field: the panel fill, a hairline and the control radius.
A card's reply row is shaped like the message capsule: one shape with the message box's 32-point send circle inside at its right edge, muted until there is text, on the field's fill and hairline.
That shape is the Mac's input, a pill at one line and a rounded rectangle with the same 22-point radius when it grows.
Every lit mark inside it, such as Point at while it is on, is a 32-point circle, so nothing sticks out of its rounded ends.
A note being written is a raised panel inside the card at the reply row's width, at the card radius on the raised fill with the strong hairline, its comment a plain field beside buttons of the same control radius; queued and sent notes share one row, a 2-point bar, what the note points at on one line, then its comment, the bar in the accent only while the note waits to be sent.
The app follows the device's appearance unless this device's own Theme in Settings says Dark or Light; its read-only Reply sheet uses the conversation treatment in `../cards/ResponseCard.prompt.md`, without extending that treatment to ordinary cards or their threads.
One soft tap of haptic feedback confirms that the computer accepted something: a message, a card's answer or reply, a task's start, continue, interrupt or steer, and the computer coming back after it was out of reach.
Nothing else taps, not a page turn, an arrival or the ordinary reconnection when the app opens.

## Joining and the computer

At first launch, the native first mate greets once above the centered headline “Welcome aboard Infinitary”, in the words of the Mac's own first launch.
One line follows: “Your first mate lives on your Mac.
Join it to read your cards and Activity here.”
The three ways in are rows in one list on the panel fill inside a hairline, a hairline between them: Scan the code, Paste its link and Join by its address, each with its Lucide symbol in the accent, one caption line of guidance under its name and a chevron at the trailing edge.
Nearby is one plain line under the list, with no box: the way to find a computer, or each computer announcing Infinitary as a status dot, its name and Scan its code; a press opens the scanner, never trusts the announcement.
Join by its address is for a computer away from this network, or one here that does not run the phone's link.
It opens a sheet titled Join by its address: one callout line saying to type the account and computer as when signing in to it, with Remote Login or SSH on, a field with the placeholder `kun@studio` and an optional Port (22) field.
Under them, a micro label On this network heads the computers here with Remote Login on, found while the sheet is open and the app in front, as the Mac's own By its address list finds them.
While it finds any, a Your account field and one caption line come first, then the computers as rows in the same list shape: the Lucide computer, its name and its address in the data face; a row waits for the account, and a tap fills the whole address and its port.
While it finds none, one caption line says it is looking, that iOS has not let it look (in the warning color, naming Local Network in Settings) or that it could not look, each ending that an address can still be typed.
Under the list, a plain caption line in the accent offers to look at every address on this network (its words begin “Not listed”) and asks first in an alert that warns it can look like probing; only its Look tries each address on the phone's own private network for a sign-in, and each computer that answers joins the list as its address with Answers a sign-in, not announced.
Continue ends the sheet's typing, fitted at the trailing edge.
While the phone signs in, the sheet shows only “Signing in to <computer>…” with a native progress indicator.
The first sign-in asks once in the same sheet: the heading “Is this <computer>?”, one line, the fingerprint in the data face on the field's surface, a caption that the phone asks once and stops if the fingerprint changes, then one row: Not this one, then Trust <computer> as the default.
When the computer has not let this phone's key in, the sheet says so in one callout line; where it takes a password, a secure field “Your password on <computer>” comes first, then a caption offering the key instead.
The phone's public key line follows in the micro face on the field's surface, with the copy mark at its trailing edge (VoiceOver hears Copy this phone's key, then Copied).
A refusal is one callout line in the warning color above the step's buttons, in plain words; the link the computer answers is never shown, and the sheet closes as the phone joins.
The key step's row is Try again, then Sign in once as the default where the computer takes a password; a stopped join shows its reason, then Try again as the default.
An alert names the computer address reached through the link, with Cancel beside Join, before the phone starts showing it; the authenticated computer name is not known before joining.
The scanner's title is Scan the code, the words of the button that opens it.
A permission refusal says how to allow the camera or local network, without replacing a refused camera with an automatic clipboard read.

Once joined, the top bar is one row: a Settings button at the left, the Home, Tasks, Activity and, while the computer has panels to draw, Panels strip in the middle and the computer button at the right; with one computer kept its name is in its sheet, not the bar.
The strip is Apple's segmented control of three or four icons, a house for Home, a checklist for Tasks, a pulse line for Activity and three stacked panes for Panels, with VoiceOver reading each tab's name; on iOS 26 the system draws it on glass, and it carries no unread dot.
The computer button is the Lucide computer glyph; a dot in the warning color sits at its corner only while the computer is out of reach, because a dot asks for attention, and VoiceOver hears the reach as its value.
With more than one computer kept, the button names the computer shown after its glyph, in the callout size on one line cut with an ellipsis at 120 points, so the person always knows which computer they read; VoiceOver hears that name in place of Your computer.
In reach the bar says nothing more, and VoiceOver hears "Live".
Coming back after the words said out of reach, the line under the bar says "Catching up on what was missed" or "Catching up, reading everything again" until what was missed is shown, then goes.
Out of reach is said once, by one line under the bar on every tab with its dot, state and "since" the last-heard time, with its day when that was not today; no strip above the content or line on a card repeats it, and only the current in-memory view remains.
The message capsule and a card's reply row dim, and one line under the message box says only “Changes are off until <computer> is back.”, as the Mac says it.
The computer button opens a native sheet whose body is one list in the shared list shape, with no heading above it, and which opens just tall enough for its rows, never past half height.
Its first row is the computer shown, in the shape the Mac gives a device: the computer glyph at the name's height, the name in the headline face, "Current connection" in the caption size, and under them one micro mono line with the reach dot and words, then the address reached in the muted color, which wraps under the reach when both do not fit.
A small Leave in the hairline outline, Forget while out of reach, sits at that row's trailing edge beside the name, and drops under the row's lines when the name does not fit beside it; the red is kept for its alert.
Each other kept computer follows as a row, the computer glyph, its name and one line, Answers now with an accent dot before the glyph, Not answering from here, or Looking… while the phone checks; a tap shows it, and the phone never switches by itself.
The last row is Add another computer with a plus glyph, which offers the first screen's three ways in.
With other computers kept, the sheet opens with the first of them focused, and the arrows, Return and Space reach every row; a key pressed with Command held presses no row.
The Settings button, the Lucide gear, opens a sheet at full height on a list of General, Appearance, Projects, Intelligence, Runbooks, Usage, Automation, Integrations and Devices, the desktop's names in the desktop's order.
Each row has no icon: its section name, one current-state line and a trailing chevron, in the shared list shape.
A row opens its page in the same sheet, on iPad as on iPhone, never a sidebar.
General shows Infinitary and the version, Appearance shows Theme, Language and, on a device that folds, Split at the fold, and Devices shows This phone (This iPad on a tablet), its current capability and the existing Approves secret uses switch when the computer offers it.
Sections with nothing to show stay off the list.
Back returns one page, with Command-[ from the keyboard, and Done closes from any page.
The list starts focused on General, arrow keys move between its rows and bring the one they reach into view, and Return or Space opens one; native controls retain their keyboard focus treatment.

Projects, Intelligence, Runbooks, Usage and Automation are the computer's own pages on a phone, and every word, figure and tone on them is the computer's: the phone draws rows the computer's own rules built and writes no sentence of its own.
A page is one column of the shared list shape under the sheet's title, at the sheet's margins: a quiet line that says what the page is where it needs one, groups under the uppercase micro section label, and a last quiet line that says where the rest is done, by the computer's name.
A page under a section (a rule, a draft's review, a project) leads with its own name at the title size, wrapping in full, and the bar above it carries only Back and Done: between them a long name would be cut short.
That last line is the page's only mention of what the phone leaves out; a control the phone does not offer is never drawn dimmed in its place.
A row's state is the status dot before its name, in the computer's tone for it, never a colored row or a badge.
A page asks at most one thing of a row: one button, one switch or one choice, at least 44 points tall, with the row's opening beside it where it has a page.
The filled accent button is the one that moves something forward (Enable… on a draft, Turn on in its review, Resume on a rule's own page); Pause and Pause all are outlined.
On a phone the computer lets only read, the same rows show with every switch and button off.
A change shows what the computer kept when it answers; one the computer refused says why in the warning color under the control that asked, in the computer's words.
A page out of reach keeps its last reading.
From a keyboard a 1.5 point accent ring marks the row or control the keys are on, and shows only after a key is pressed: the up and down arrows and Tab walk every row and control in order and keep the ring in view, Return or Space presses it, the left and right arrows step a choice, and Esc goes back one page.

Intelligence only shows.
Its first line is the accounts' count and how many need a sign-in, with the reading's time opposite in mono.
An account row leads with its dot and provider, then the marks for the crew's preferred account (the accent ✱) and the first mate's (a hairline capsule), with the row's one verdict opposite in mono in its tone.
Under it sit the account's name, plan and identity in mono, then one line for each allowance window: its name at micro size, a 4 point capsule bar of what is left with the reset clock as a 1.5 point tick across it, the percent left in mono, and when it resets under the bar.
The bar and the figure take the computer's micro meter tones, and a reading the computer could not refresh is drawn in the idle color.
A row with no window says its one sentence instead, and a row that waits for a sign-in says where to sign in, in the primary color; the phone draws no Sign in button.
Where other computers run work, each computer's accounts sit under its name, with its out-of-reach note opposite in the warning color.
The two marks are explained once under the list, each beside its mark.

Automation leads with what an automation is, then each rule as a row: its dot and name across the row's width with the chevron opposite, then two caption lines under the name, its schedule and its next run.
The next run is the computer's own words for it, in the rule's time zone, beside its term in the muted color (Next run), and under the term when a date with its zone is too long for the line; a rule with none says its state there instead (Paused, Draft, Done).
A rule's button sits beside those two lines at the row's trailing edge: Pause on an active rule, Resume on a paused one, Enable… filled on a draft, and none on a finished one.
Pause all sits alone under the list and asks once in a confirmation that names how many it pauses.
A rule's page leads with its name, then its dot and state, then its facts as term over value, with the prompt in its own surface box as the first mate gets it, the rule's one button, and its runs.
A fact whose value is a list, such as a draft's next runs, is drawn one entry a line.
A run is its dot and outcome, when it ran in mono, what it led to, and a folded "prompt as sent" that opens in a surface box.
Enable… opens the computer's review: its question as the page's name with the rule's name under it in the secondary color, then the same facts with Back outlined beside Turn on filled; nothing turns on before that page.

Usage only shows.
Period and unit are two segmented controls over the reading's label in mono; they are the page's only controls and change nothing on the computer.
The total stands alone at display size under its label, with the two counts under it as a pair of hairline panels of one height.
Daily usage is one accent bar a day on a hairline floor, 72 points tall, against the period's largest day, today last at 45% because it is still filling, with the first and last dates under it at micro size.
Each model is a row with its share as a line under its name and its figure opposite in mono, and where it went is a list with each project's tasks indented under it in the secondary color.

Projects lists each project as its name over the quiet words that say how it differs from a new one, with a chevron.
A project's page leads with its name and its folder in mono under it, then its four standing choices, each a headline over one caption sentence: where changes go as a list of rows with a radio mark, merging as a switch beside its current state, rigor and cost limit as segmented controls, and an amount as a field with its own Save because the number pad has no Return.
A choice the project's setup fixes shows as its words in the muted color in place of the control, with the computer's reason.

Runbooks lists the built-in runbooks and the person's own under their labels, each as its name over one caption line with Apple's switch tinted with the accent; a runbook the computer could not read says why in the warning color.
Theme is Apple's segmented control worded Device, Dark and Light, like the computer's Dark and Light pills, under one secondary line saying it is set on this iPhone only and the computer keeps its own; it starts on Device and never changes the computer's Theme.
Command-1 to Command-4 switch tabs in the strip's order, Command-Comma opens Settings and Command-I the computer.
The sheet shows a joining time only if the saved connection supplies one; it never invents one for an older record.
Leave on the computer's row asks in an alert that keeps Keep it beside a red Leave and explains that a new link is needed to return; VoiceOver hears the button as Leave <computer>.
**Taking over** (INF-4207 piece 9).
Out of reach, while the computer lists other computers that keep a copy, the sheet adds a section under its list, headed "Take over" in the headline face, with one callout sentence in the secondary color: "Another computer that keeps a copy of your first mate's record can take over while MacBook Pro is out of reach."
Each computer that keeps a copy is one box on the surface fill inside a hairline, at the control radius: a 6-point dot, in the accent while it can take over and the warning color while not, then its name in the headline face.
Under it, its own words in callout lines, read live from that computer, in the order its window says them: "Its copy is from 9:05 AM.", "It cannot reach MacBook Pro either."
(or that MacBook Pro said it was going to sleep, or that Infinitary quit there), each other copy ("Mac Studio's copy is from 9:01 AM."), with a micro "may be newer" in the warning color under one that held more changes.
While it is being read the box says "Asking..."; one the phone cannot reach says so, and one from before says to update Infinitary there first.
A secondary Take over ends the box, disabled while that computer cannot take over; the press asks in an alert, "Take over on Mac mini?", with the detail "Your first mate starts on Mac mini from its copy, once you confirm it is you.
If MacBook Pro comes back, it stops and keeps a copy instead.", a destructive Take over and Not now.
Take over then asks Face ID or the passcode; while that computer starts the first mate the button reads "Taking over...", and its answer reads in place in the primary color.
Once it started, the phone finds the first mate there and reads Live again, with nothing to join.
Out of reach, Forget replaces Leave in the same place and shape, asking in the same kind of alert before clearing only the local saved computer and explaining that the computer may still list this device.
Removed clears the computer's data from this device and takes the first screen's shape: the first mate above “Removed from your computer”, a line saying a new link is needed, and one Join again filled with the accent, fitted and centered under the words.
A protected-data read failure explains why joining cannot proceed and offers another attempt after unlocking.
A damaged saved connection clears only the saved computer, keeps this device's identity and explains that a fresh link can join again; it never asks the person to unlock for a decoding error.

## Panels

Panels is the computer's own side panels, one under another in one scrolling column, in the order its rails hold them read left top, left bottom, right top, right bottom.
Each sits under a header row: its title in micro capitals in the secondary color, its owner word, yours or the plugin's name, in the muted color, and a chevron at the trailing edge that folds it; a fold is kept on the device.
The panel draws below in its own frame with the computer's panel stylesheet, as tall as it draws, or most of the column's height when it fills.
A stopped panel, one that stops answering and one that could not be opened each show one callout line in the secondary color, with a secondary Retry where there is one.
The tab shows only while the computer has a panel to draw; Computer keeps its place in the bar.

## Stage and rails

The compact shell switches between Home, Tasks, Activity and Panels with the strip in the top bar; there is no bottom tab bar.
Tasks joins the strip when the task reader is present, never as an inert placeholder.
A window with room for two columns, an iPad on its side or an iPhone Duo open like a book, uses two columns: a sidebar with Activity and, when present, Tasks and Panels as a segmented control at its top, each scrolling alone, with the stage alongside at up to 560 points, and no strip in the bar.
The window's room decides, regular in width and height and wider than tall, never the kind of device; a large iPhone on its side keeps the strip.
On a foldable the stage, its card and the message box keep to the wider side of a fold that runs down the window, never across it.
There the sidebar reaches the fold, so the sidebar fills the page left of it and Home the page right of it.
Split at the fold, a switch under Settings → Appearance on a device that folds, starts on; off, the open Duo lays out as an iPad does, its card centred across the fold.
A Duo open on its side puts the panel on the page above the fold and Home below it; half folded, the card stays on the upright half and the panel and the message box sit on the flat half.
On a foldable's pages a task's record opens in the Tasks panel's place under a "‹ Tasks" way back, never as a sheet.
The bar is one row on a foldable too, with no vertical rail, except on a closed screen held upright, where the status bar shares the row.
Portrait and narrow multitasking return to one column with the strip; the tablet's width and height decide the layout, not its physical orientation alone.
On any width the card with its pager, the message box, Tasks, Activity and Panels share one centred reading column of 560 points with its gutters, so the message box lines up with the card.
Activity is newest first on both devices, following the captain's submitted answer over the plan's bottom-up sidebar sentence.
A row has a semantic kind dot, the computer-authored words, an optional task key in micro mono inline before them, and a relative mono age.
The exact local date and time remains available to VoiceOver; an empty Activity says “No activity yet”.

Home shows one card at a time in a row of cards, with the previous and next cards' own edges 8 points wide at its sides, 8 points away, and a quiet pager below it: two chevrons around the count; an ordinary arrival never replaces the card being read.
The count opens a menu of the current titles; the next chevron carries a dot while an unread card lies ahead.
With no card to page the pager hides; a card put aside waits in Tasks, and its row there brings it back.
Home carries a dot in the strip while a card is not yet read, and VoiceOver hears the count.
The peek stays within the shorter of the foreground card and its scrolling viewport, never filling the empty space beneath a short card or reaching the pager.
A sideways swipe anywhere on the card moves the row with the finger, the dragged card leaning up to 3 degrees about its own foot and the others two thirds as far; past 35% of the width or a quick flick it slides to the next card (swiping left brings the one after), and anything less glides back.
On release the row carries on from the finger's speed on a spring with no bounce that settles over `--dur-page` and never overshoots, and the card it brings arrives with its body already drawn.
A swipe that starts on the body's own slider, canvas, dragged drawing or sideways scroller stays the body's, a mostly vertical drag scrolls, two fingers never swipe, and while the keyboard is up only the chevrons change cards.
The chevrons slide the row one card as a swipe does; under reduced motion the row stays still, the card dims toward a chevron at the side it heads to, and the next card fades in over `--dur-fade`.
The card stage fits the shell's available column, up to 560 logical points, and owns neither navigation nor the computer-details sheet; on an iPad the card's head can maximize it to the stage's whole width.
A card is the Mac's raised surface: a solid fill, a thin edge, a light line inside its top and a soft drop shadow, and the cards beside it in the row are raised the same way.
The head, footer buttons and reply field are native controls outside the body’s web view.
The head reads as the Mac's: the kind chip (Attention in red), the task's key in mono, which opens its record, where the task runs, the model chip and the risk, then the title and the revised line; it names no sender.
The shared minus is the card's only leave control: it puts decisions, attention and pending notes aside, or reads an ordinary note using the host's declared meaning.
It sits at the trailing end of the head on the card's face and on its thread alike.
It asks no close question, selects no choice or refusal, and never ends work; picks, typed words and pending replies remain available.
A marked saved answer waits for explicit Done, on its note or record.
A merge card's risk is a row of seven dots in the levels' colors, and a tap opens a sheet with each dimension's name, level words and the crewmate's why.
The native controls inherit the shell's tint and retain platform focus and touch behavior.
A review-finding card shows Review finding in the warning color on its head's first line.
The default choice is filled with the accent, with the dark void's ink, in either appearance, as the approved card does; while a required question waits it is drawn muted, and a pressed choice shows a pending mark.
Above the choices sit the host's fact strip, the Mac's status line ending with the line on what the merge does to the task, the actions to take after merging, one written out or more folded under their count, and the reply field, which reads "anything to add?", takes photos from the library or camera, and whose words go with a choice too.
The body uses the Mac’s card stylesheet and fonts and fits the available width; it never zooms or scrolls on its own, since the card has one scroller.
Its type sizes are the Mac's times the device's Text Size factor, the body at the phone's own 17 points at iOS's default, up to 23 at the largest standard size and held there; words inside a drawing keep the Mac's sizes.
A tap on a picture or a diagram opens it full screen, fitted, titled Card picture or Card diagram, with its caption under it and Done at the top.
There a pinch zooms from fitted to eight times fitted, a double-tap goes to its own size centred where tapped (twice fitted when that is no larger) and back, a drag pans a zoomed one, turning the device refits it, and a swipe down while fitted closes it.
A diagram stays a drawing there, sharp at any zoom; its recordings offer playback in a sheet of their own.
Named form answers and reply drafts stay in memory while paging; choosing a form value sends nothing, and a footer press collects the current answers.
Required questions hold the default choice, and a failure keeps the draft with an explanation.
A failed body with a saved reading says that choices use the last saved answers and offers Retry; a timeout on a press never sends that choice.
The thread opens below the card, with plain messages labelled you, crew, mate or app with their times, a captain's settings folded on one line and a working line, never message bubbles; it opens when a new message arrives.
A body's links open in the device's default browser, its task keys open their records and its draft buttons fill the message box, unsent.
Past cards show their last-seen body, submitted answers and the chosen button at full contrast with an accent edge, the words sent with it, Hide instead of Close and no reply field or working actions.
A crewmate's browser shows as a strip naming Browser, the site and who is driving.
A Settings or browser door says to do it on the named computer and keeps the card open.
Using a signed-in site is a normal choice sent to that computer, not a request to open its browser here.
While out of reach, the shown body remains readable, actions and the dimmed reply row are unavailable, and no change waits to be sent later.
A stalled body leaves the native card controls usable and offers Retry in its place.
An empty stage shows the native first mate and the desktop's crew formations, home at full size and other computers at half, panned continuously rather than paged or shrunk to fit.
The orbits are drawn a little smaller than the desktop's, so eight crewmates fit the narrowest iPhone held upright; glyphs keep their size.
Crew ride the desktop's growing two-orbit ring with no orbit outlines (`components/mate/Crewmate.prompt.md`).
Crew retain their published tier, work posture and computer; programs show their live parts and dependency branches, and an unreachable computer shows frozen, unknown activity.
A crewmate opens its summary in the system's standard sheet: the desktop's crew summary in its words, order and marks at 14 points, with Open task leading to the existing task record.
The sheet closes the standard way, with no close mark; while it is open the scene stands still and the crewmate wears the desktop's corner brackets.
Shift-Command-C, Browse crew, starts browsing, drawing an accent outline around its viewport; arrow keys pan it, Tab selects and reveals a crewmate, and Space opens that crewmate's summary.
The selected crewmate has an accent outline and a selected accessibility value; Escape, editing, a preview or leaving Home ends browsing.
The native character moves as the Mac's does: idle drifts slowly with eyes that blink and wander, listening breathes as two counter-rotating hexagons, and working speeds up with the ember, shimmer and halo.
It greets once when the app opens or joins a computer, plays the Mac's full reaction and fidget repertoire, and holds a reply reaction until the real conversational turn finishes.
Animation follows permitted display callbacks, requesting up to 120 frames a second, without claiming that a device delivers that rate.
Every state stops its clock off-screen or in the background and shows a settled still pose under Reduce Motion.
The join stage uses idle; the empty stage shows working only from the Mac's published conversation busy snapshot or numbered busy event, and returns to idle when that turn finishes.
A stopped or lost connection clears that reading; an older home without the scene-observation capability stays unknown until a real busy event arrives.
Listening remains a drawing capability, not a live phone state: native keyboard dictation supplies no public listening signal, and focus, typing, tasks and connection traffic never stand in for one.

The conversation owner puts the message box at the foot of Home, with the last turn's two lines above it; Tasks and Activity run to the foot with nothing over them.
One capsule sits in Home's column under the card's pager and grows with the message, photos, last turn and problems; no panel sits behind it.
On iOS 26 the capsule is native glass; on iOS 18 it is the field's fill and hairline.
In the landscape sidebar layout it sits at the stage's foot.
The message box stays mounted once, so its own text and photo drafts survive changing tabs or rotating; no tab or orientation branch owns another copy.
On an iPhone on its side the card gets the height: the bar keeps its one row with the strip; the last turn and the notice wait until it is upright; and one row holds the removable photo strip and the message capsule.
The field shows at most two lines there and keeps its full text; the 44-point controls and complete warning rows remain visible at the foot.
Portrait and iPad retain the stacked layout; a landscape card must show its full heading and have enough scrollable height to read body text and use its actions.
Dictation is the keyboard's own.
While the keyboard is open, a native Done button takes the Settings button's leading slot and supports Shift-Command-K without sending or clearing the draft.
Its command belongs to the persistent navigation bar, not the keyboard's transient accessory view.
Tasks uses the desktop's five groups, search, status/key/title/project rows and records with their actions at the foot.

## On the computer

On the computer, + A phone opens the existing link panel with a locally encoded scan code, a Copy link alternative and Stop it.
The code has a white quiet margin in both themes because the phone's camera must read it.
The panel says the phone app comes from TestFlight for now, only to people asked to test it, so it implies neither App Store availability nor that anyone can install it.

## Talk and tasks

The joined screen keeps the message box at the foot of Home, with the last captain turn and the first mate’s reply immediately above it.
The last turn is two bare centred lines, one each, with no border, fill or padding: the captain's words in the secondary ink, the reply in the primary ink, each inside quotation marks in the muted ink.
The message field, Photos and Send sit inside the one capsule, Send at its right edge and dimmed until there is something to send.
The native multiline field takes the keyboard’s dictation; there is no second microphone or speech engine.
Photos opens the system library picker, and selected photos appear as removable thumbnail chips above the field.
Send submits words and photos once; a refusal keeps the draft and says why, and an unconfirmed send asks the person to check the Mac before sending again.
Out of reach and a read-only connection retain the view but refuse every change, without sending it later; the one line under the message box says which.
When the Mac still hears words while reading only (`messages-while-reading`, `docs/view.md` "Read only"), Send stays on for words alone, Photos is disabled and dimmed, and the line reads "Your first mate still hears your messages.
Buttons come back once Infinitary on this phone is updated.", or "on your computer" when the Mac is the older side.
Where the Mac answers its own update from afar (`home-update`, `docs/ios.md` "Updating the computer"), the same place under the message box carries its update while the versions differ, an update moves or the last one failed: one centered `caption` `secondary` line, "Mac mini has 0.7.2-alpha.590 ready.", over one secondary choice button (`PhoneChoiceStyle`), Update Mac mini; while it saves, "Saving work on Mac mini." with whose running work it waits for, over Update later.
Update first asks in the system's confirmation sheet, titled "Update Mac mini to 0.7.2-alpha.590?", whose message names the running work that finishes first, the background jobs that stop, and that nobody can undo it from the phone; its buttons are Update Mac mini and Not now.
Settings → General carries the same line and buttons as a row under the phone's own version, always, titled "Infinitary on Mac mini".
The Tasks tab follows the desktop’s five groups: Waiting on you, Working, Queued, Backlog and Done, with search across its current list and earlier tasks.
Each group header is a micro uppercase tracked label with its count, as on the Mac.
The first three groups start expanded; Backlog and Done start collapsed, with their counts and disclosure chevrons.
A row starts with its status mark, mono key, title, then the project in mono; dividers start past the mark, and active parent trees stay together.
An unstarted task adds the home’s quiet mono wait line below its title, wrapping in full, and its record carries the same line.
The search waits above the list until it is pulled down from the top; Shift-Command-F opens it, and VoiceOver always shows it.
A task opens its record in the same column: goal, captain’s words, progress, outcome and timeline, plus a Crewmate section for the session and its direct message box.
The timeline's events sit on a hairline rail in caption size, with each time right-aligned.
The record's heading is the task's own title, with its key in mono at the start of the line below; the bar above it carries no key.
Start and Continue follow the Mac’s own allowed moves; Steer sends to that crewmate, and Interrupt stops only its current turn.
The actions sit at the record's foot like a card's footer: Start or Continue last with the accent fill, Interrupt outlined beside it, and above them a capsule message box whose arrow is Steer.
A closed task remains readable without a message box or actions.
New cards and answered replies announce themselves while the phone is open, following the Mac’s Notifications switch.
The notice is a quiet pill at the top of every tab, under the top bar and over the stage beside the landscape sidebar: a mono New card or Reply label in the accent, then the card's title, on the raised surface with a hairline.
On Home a new card is counted beside the pager instead, in the desktop's badge look (CardStack's accent mono Badge: capitals in the accent on its dim fill, kept 44 points tall to press), and only a reply's pill shows there.
A press on it shows the first new card in the pager's order, as the desktop's badge does; the chevrons go round past either end and carry the new-card dot on either side (INF-4541).
A tap opens the card on Home and a swipe dismisses it; a reply notice leaves after a few seconds, a new-card notice when its card is read, and VoiceOver offers Dismiss.
No notice requests background delivery, and an initial snapshot does not announce old cards.
