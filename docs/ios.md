# Infinitary on iPhone and iPad

The native SwiftUI app lives in `ios/Infinitary/`, supports iPhone and iPad from iOS 18, and reads a Mac through the published connection contract.
Its name is Infinitary, its bundle identifier is `com.getinfinitary.app`, and its Xcode development team is Infinitary Labs, Inc. (`Y44V95NP6K`).
Apple moves an app to another team only after an App Store release, so the app left the personal team's `com.getinfinitary.infinitary` for a new identifier and App Store Connect record: a tester installs it from TestFlight as a new app and pairs it again, and the old app's builds expire on their own.
The phone is a view of the Mac, not a separate first mate or a place that runs work.
It shows interactive cards on Home, with Tasks and Activity on their own tabs, sends the captain's messages and photos, and lets the captain start, continue, steer and interrupt work on the Mac.
The version-dispatched TestFlight workflow and the square app icon support internal delivery, and the workflow adds each build to the app's external TestFlight groups; App Store distribution and background notifications remain separate work.
The visual rules live in the design skill's `components/devices/PhoneView.prompt.md`.

## Joining and trust

Settings → Devices → **A phone** on the Mac opens a locally generated QR code, the same one-use computer link, Copy link and Stop it.
Every build of the Mac app offers **A phone**, installed and development alike (`docs/devices.md`, "Settings -> Devices").
The panel explains whether its link prefers a detected private-network address, with local fallbacks, or offers local addresses only.
Both devices need a permitted private-network route, and the computer must stay awake with Infinitary open; a detected address proves neither reachability nor the service that supplied it.
MagicDNS discovery and broader VPN or IPv6-only private-address discovery are not included.
The panel explains that the phone app comes from TestFlight for now, only to the people asked to test it, and is not in the App Store yet.
A phone can scan that code, paste its link or open an `infinitary://join` link, then confirms the address of the Mac it is joining.
On a computer with no screen at hand, `infinitary link --phone` prints the same code and link in its terminal, from the Infinitary running there (`docs/run.md`, "A link by command").
Its first screen welcomes the person in the Mac's first-launch words, “Welcome aboard Infinitary”, with the three ways in, Scan the code, Paste its link and Join by its address, as rows in one list and Nearby as one plain line under it.
Nearby browses `_infinitary._tcp` and opens the scanner; an announcement supplies a possible address, never a key or permission.
The computer, a Mac or a Linux home with Avahi, announces while a usable direct computer invitation is open as well as while a phone, or another computer that dials it at an address, is on its list, so first-phone discovery works (`docs/devices.md`, "Announcing to devices").
Camera and Local Network permissions have separate explanations; a camera refusal offers pasting rather than reading the clipboard automatically.

`InfinitaryKit` owns strict link parsing, the device identity, pinned transport and the view session (`ReadOnlySession`, the foundation’s original type).
`PhoneIdentity` creates a P-256 signing key and a self-signed certificate, with Apple's `swift-certificates` package supplying the certificate encoder.
The private key and certificate live in this app's iOS Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` and synchronization disabled, not in iCloud, a shared group or the Secure Enclave.
If the key exists without its certificate, the app issues a certificate for that same key rather than rotating or abandoning the identity.
The certificate's public key hashes to the same SHA-256 SPKI pin the Mac owns (`docs/devices.md`, "Keys").
The Mac's identity is that pin, not the self-signed certificate's name or dates.

`PinnedTransport` uses an ephemeral URLSession, TLS 1.3, the phone's client identity and the exact saved or scanned server pin, with no cookies, credential store, proxy configuration, cache or redirects.
The app turns off iOS's transport security (`NSAllowsArbitraryLoads`), because iOS counts a Tailscale address (`100.64.0.0/10`) as not local and fails the Mac's self-signed certificate there even after the pin matches (INF-1903); `NSAllowsLocalNetworking` would bring that failure back, and iOS ignores `NSAllowsArbitraryLoads` beside it.
`PinnedTransport` is the app's only URL session, and card web views load only local content.
The app's usage events (`PhoneDiagnostics`) go over that same connection to its own Mac, which sends them under the Mac's Diagnostics switch (`docs/sharing.md`, "A phone's events"); the phone reaches no other server and shows nothing about them.
Apple's App Privacy answers must declare these events before any App Store submission: usage data (product interaction: the app opened, a message sent, a card answered) and a random device-scoped identifier, linked to no person and used for analytics only, collected through the paired Mac (`docs/sharing.md`, "A phone's events"); the answers and the privacy policy move together with the event list.
An App Store submission or external TestFlight build must give Apple a written reason for that setting: the app trusts only the Mac's pinned key, over TLS 1.3 with the phone's own key, and no narrower setting can name a person's own Tailscale address.
`PhoneTransportSecurityTests` joins and reconnects at `127.1`, a loopback form iOS also counts as not local, under the app's own Info.plist.
Pairing has short request deadlines; the socket uses a separate configuration with no request deadline of its own, since that timer also cut a message still arriving after 60 seconds, so the session's silence watch and dial limit own a connection's deadlines.
The home paces what it sends and pings after every piece (`docs/connection.md`, "Pacing and liveness"), so it keeps a phone on a slow link while a long catch-up arrives, and answers the phone's own pings during it.
The phone cannot see a message still arriving, so its hello lists `frame-parts` and the home sends it any frame longer than one piece as parts, each a whole message the phone hears as it arrives (`PhoneParts`; `docs/connection.md`, "Pacing and liveness"): an answer that takes minutes to arrive, such as a grown card list read whole at 1 KB/s, keeps its connection.
A join sends the invitation's kind and `system: "ios"`; the Mac returns HTTP 201 and kind `view` regardless of that invitation's computer kind.
Before spending the invitation, a pinned, non-mutating `GET /connection` must return 426 from a reachable candidate.
Private IPv4 candidates in `100.64.0.0/10` come first, followed by local names and addresses; an unavailable preflight, including a timeout, may try the next candidate.
A wrong pin ends the attempt without sending the invitation, and once a candidate answers preflight the pairing POST never moves to another candidate.
A timeout or missing reply never repeats a pairing request: the Mac may already have spent its code.
An explicit `paired` refusal leaves a fresh invitation unspent, so that one confirmed invitation may use `again` once to recover the same phone identity.
A wrong pin never sends the invitation to that address or replaces the saved pin.

The saved app record is `KeptMacs.json` (`PhoneKeptMacsFiles`): the computer shown and every other kept computer, the one shown most recently first (`PhoneKeptMacs`), each with public addresses, pin, device identifier and name.
It has file protection and is excluded from backup; no invitation code, card, feed line or cursor is saved there.
The phone writes it whole at once, so a switch, join or forget cut short leaves the list as it was before or after, never a computer missing (the captain's pick on INF-5265's review, "Save both together; older versions may not see the latest selection").
Each save is written in `KeptMacsStaging`, a folder beside the list that is left out of backups before anything is written there, protected and left out of backups itself, and then renamed over the list, so no copy of the list is ever one a backup may take; a stage a stopped save left behind goes with the next save.
A phone that saved one computer before has only `JoinedMac.json`, which is read as that computer, shown, with no new join, key or question; the first save writes `KeptMacs.json` and removes `JoinedMac.json`, so an older build opened after it finds no computer and needs a new link.
The Keychain identity survives relaunch, Leave and local Forget; it is never replaced because the network is unavailable.
Protected identity and saved-Mac reads start on activation, not prewarm, and a failed read is retried on activation or joining with a visible explanation if it still fails.
A saved-Mac read suggests unlocking only for `CocoaError(.fileReadNoPermission)` or unavailable protected data; other temporary read failures retain the record and offer another attempt.
An invalid pin or invalid address discards only that computer and keeps the others; an undecodable record discards the kept computers; either way the phone retains its identity, explains the local reset and allows a fresh confirmed link.

### Several computers

One phone keeps every computer it joined and shows one at a time (INF-5265, the captain's approved plan on INF-5264), for a person whose computers cannot see each other, such as one at home and one at work, each behind its own VPN.
A computer is named by its pin, which a home keeps through a move, so joining one again replaces its record rather than adding a second.
Joining while a computer is shown keeps that one among the others and shows the new one; the join itself is the same confirmed link.
Your computer is the first row of Settings (INF-2820's plan, piece 1), and its page is one list (INF-6131, the captain's approved plan): the computer shown first, the other kept computers next, and **Add another computer** last, which offers the first screen's three ways in.
Leave, or Forget, sits on the computer shown's own row, so it is the page's first control and in view as the page opens at every Text Size, which the join-read part checks at the largest standard size.
A tap on a computer shows it: the phone stops the shown computer's connection, saves the new order and connects to the one tapped.
The phone never switches by itself (the captain's pick, "Stay on my choice"): on each open, each settled network change and each time the page opens, it sends each other kept computer the pinned, non-mutating `GET /connection` a join sends first, which opens no session, and marks the ones that answer 426 as Answers now and the rest as Not answering from here.
The page opens with its first row focused, so on a keyboard the up and down arrows move among the rows and Return or Space presses one; Command-I, the top bar's computer button and, while the computer is not in reach, a press on the reach line open Settings at Your computer.
The list's row names the computer shown and its reach, such as Test Mac mini · Live.
A choice there closes Settings before it acts, and Add another computer opens its way in once Settings has closed.
The computer button stays in the bar until the phone's Filter button takes its place (INF-2820's piece 2).
With more than one computer kept, the top bar's computer button names the computer shown beside its glyph, and VoiceOver reads that name in place of Your computer.
Leave and Forget act on the computer their confirmation named, even when a notification's tap showed another before the answer came; forgetting the shown one shows the kept computer shown most recently next, or the first screen when none is left.
A change of network that leaves no usable path marks every other computer Not answering from here and stops the look under way, so a list open while a private network goes away does not keep an old mark.
Each look tries every saved address of a computer at once, each through the pinned check with the pairing timeout, so an address that times out or answers with another key does not hide one that answers.
A computer that removes the phone is forgotten alone: while another is kept, it shows with a line saying the removed one removed this device; otherwise the Removed screen shows as before.
The homes part (`PhoneJourney+Homes.swift`) joins the test home and a second real home in a process of its own (`tests/helpers/phoneSecondHome.ts`) by its pasted link, checks each computer shows only its own cards and seals under its own key at its own stand-in relay, follows the other computer's mark as its home goes offline and back with no switch, switches by keys, keeps both through a relaunch after each home let go of its registration, so each hands its key again and seals a new card under it (`push-cleared`, `homes-card`, `push-sent`), taps a notification from the one not shown and leaves each in turn to the first screen.
A test cannot change the simulator's own network, so with `INFINITARY_TEST_NETWORK` the part's simulator posts a system notification for the phone's path going and coming back (`phone-path`), which the app reads as its path monitor's (simulator builds only): with Your computer open, the mark goes and comes back with no switch; `PhoneKeptMacsTests` holds the saved list, its order, the whole-record save and the move from one record.

### Joining by its address

**Join by its address** opens one field for the account and the computer, such as `kun@studio`, and an optional port, 22 when empty (INF-1183).
Under them the sheet lists the computers on this network with Remote Login on (INF-1312): `NearbyComputers` browses `_ssh._tcp` while the sheet is typing and the app is in front, as the Mac's own By its address list does (`src/shared/nearbyMacs.ts`), and stops when the sheet closes, a join starts or the app leaves the front.
A row names the computer and the host it resolved to; with a Your account field filled above the list, a tap fills the whole address and the port, and Continue signs in as a typed address does.
An announcement says where to try, never who to trust: the first sign-in still asks for the fingerprint.
When iOS has not let the app use the local network the list says to allow Local Network in Settings, and when it cannot look it says an address can still be typed.
A plain line under the list offers to look at every address on this network; only after the yes in its alert does the phone try each other address of its own private IPv4 network on port 22, at most the 254 around it and a few at a time, and lists each one that answers with an SSH banner.
The app's `NSBonjourServices` names `_ssh._tcp` beside `_infinitary._tcp`, and its local network sentence says it lists those computers.
The phone signs in to that computer over SSH with SwiftNIO SSH (`SSHJoin`), runs one fixed command there and joins with the one-use phone link the open Infinitary answers, as with a scanned code; SSH carries only the joining, and every connection after it is the pinned connection above.
The commands are the home's own text, generated into `PhoneSSHCommand` from `src/shared/phoneLink.ts`, and the home's side is `docs/devices.md`, "A phone that joins by its address".
The first sign-in to an address shows the computer's SSH fingerprint, as `ssh-keygen -l` prints it, and asks once: **Not this one** sends nothing, and the yes is kept in `TrustedHomes.json` by address and port.
A different key at that address later stops the join before the phone signs in or sends anything.
Each join is one attempt, and a sign-in's answer lands only on the attempt that asked: a cancelled join that answers after another address was typed changes nothing, so its key is never asked about, or kept, for that address (`PhoneAddressJoinTests`).
The phone signs in with its own key first: a P-256 key in the Secure Enclave where the phone has one, otherwise (a simulator) in this app's Keychain, this device only, never synchronized (`PhoneSSHKey`).
When the computer refuses that key but takes a password, the phone asks for the account's password there once and signs in with it only to run the command that adds the phone's public key to that account's `~/.ssh/authorized_keys`; it then signs in again with the key.
The password is never saved, shown or sent anywhere else; SwiftNIO SSH holds it as a string, so the phone cannot zero its bytes after use.
Beside the password, **Copy this phone's key** copies the public key line, shown in full, for an account that takes no password; **Try again** signs in again once it is added.
The link is never shown: the phone joins with it at once, trying the typed address first at the link's port, then the link's own addresses, and keeps the typed address among the saved alternatives.
The join never repeats an uncertain pairing request, as above.
Each refusal is said in plain words: the computer not reached, Remote Login off (every connection refused), the key refused, a wrong password, Infinitary not open, Infinitary there too old, and the phone too old for the home's answer.
SwiftNIO SSH has no keyboard-interactive sign-in, so a computer that takes passwords only that way takes the copied key instead.

## Reading and returning

The session sends a view hello and its current in-memory epoch/sequence cursor, then reads cards, Activity, the task board and the last turn.
The generated `PhoneRequest` limits the additional requests to the published view channels and derives their read/change distinction and message limits from the contract.
Activity shows the newest line at the bottom, as on the Mac, and uses the Mac's feed wording, not a second event-to-words implementation.
Each line is one row: its dot, its task key, its words cut with an ellipsis and its age (INF-1845).
Tapping a row opens the line's summary with the whole words and its exact time; tapping a key on the board opens that task's record.
The list opens at the bottom and follows a new line while the reader is at the bottom, as a chat does; a reader scrolled up stays where they are.
The native contract constants are generated from `docs/contract.json` with `node scripts/generate-phone-contract.ts`.
`pnpm generate:contract` updates them together, and `pnpm check` refuses stale native constants, theme values or bundled card code and fonts.
Generation also verifies the required native fields in cards, Activity, task boards, records, search, last turns and crewmate transcripts, including the pushed card and task snapshots.
The shown card reads its thread once and follows numbered `inf:cards:thread` pushes; a newer push supersedes an older thread read.
It reads its thread again each time the computer comes back in reach, so a thread read a dropped connection fails puts no line on the card; only the computer button says whether the computer is in reach.
Its card requests are a closed enum generated from the published contract, not a channel an HTML body chooses.

A return consumes numbered replay pushes, or reads fresh snapshots after a reload welcome.
The app says it is in reach, in the words **Live**, once its small first reads arrive: cards, Activity, the last turn and, from a computer with scene observations, its conversation state and computers.
The task board is asked last and fills in Tasks and the crew scene when it arrives (INF-3750): the computer answers in the order asked, and on a large record the board outweighs every other first read together, so asking it first held In reach on a weak link for several times as long.
Tasks says nothing in place of an empty list until the board is read.
`PhoneCatchUpTests` holds the computer's answer to the board read (`hold-board-read`) and checks the phone is in reach with no board, then shows the board once the answer is sent.
The test home holds the task board's pushes with the answer: its board is small, so each push goes whole and would bring the board first, where a large record's pushes go as differences that a phone with no board cannot apply.
A card or task-board push supplies the new snapshot directly and supersedes any older initial read still in flight.
A task-board delta folds onto the board the app holds, as the Mac’s `applyTaskBoardDelta` does (`PhoneBoard.applying`), because a full read of a large board on every task change stalled the crew scene on the main thread (INF-1854).
A welcome that replays is caught up in one step (INF-2773, the captain's pick "keep what they showed, then change once when the catch-up is read"): while the phone reads the replayed pushes, they update its own copies of the cards, board and threads and its held busy state, presence and work count, and the screens keep what they showed.
The screens change once, at the last replayed push or when the connection ends first, and live pushes after it show one by one as before.
A run of replayed board deltas is applied with one sort at that point (`PhoneBoard.applying(run:)`), giving the board that applying them one at a time gives.
A change the captain made that waits on the computer still sees every replayed snapshot, so it settles as it would one push at a time.
Cards that left while away are read into Past, and the new-card notice goes to the newest card that arrived while away and is still up, as before.
The panels' pages hear the replayed pushes at that same point, all of them in order in one call ("Panels").
Once a connection's catch-up shows, its replay read or its first reads answered, the phone tells a computer whose welcome lists `catch-up-shown` how long that took from its hello, which the computer keeps in its catch-up log line only (`docs/connection.md`, "The catch-up log").
`PhoneCatchUpTests` reconnects to the test home after six board updates, a card and a reaction (`away-traffic`) and checks the board and cards change once, the board matches a fresh read, the panels hear every board update in order and the newest card list in one call, the reaction stays silent and a live one (`emote`) plays.
Each frame from the computer is parsed, and its board, delta, card, feed and presence payloads decoded, off the main thread (`PhoneFrame.decode`, INF-2566); the session then reads the decoded frames on the main actor in the order they arrived.
A read waits on the connection from the greeting until the connection ends, also while earlier frames are still being read, because URLSession keeps the computer's close code only for a read already waiting when the close arrives: a send after the close with no read waiting fails the connection without its code (INF-6476).
A payload that cannot decode fails only where the session reads it, as decoding in place did.
Only a delta whose base is not the board held requests a coalesced full board, the published resynchronization path.
Only a closed list of non-streaming events that can change the feed requests a coalesced feed refresh; assistant and thinking deltas cause no reads.
The feed owner exports `FEED_EVENT_TYPES`, with its authoring switch checked exhaustively against that list, and the contract generator derives the Swift `FeedChange` enum from it.
A gap in numbering drops the cursor and reconnects rather than silently losing updates.
Successful frames and pongs update the last-heard time.
A connection is cut for silence, never because an answer is slow (INF-2668): quiet for `ReadOnlySession.patience` (the captain's 20 s, two missed pings) while nothing is awaited, or for `ReadOnlySession.answerWait` while the welcome or a read is out, since a pong waits behind an answer on its way.
URLSession's WebSocket reports no bytes before a whole message arrives, so silence is measured in frames, parts of a frame and pongs; a read the computer leaves unanswered that long while it sends neither a frame nor a part, though it answers every ping, and a Leave unanswered for 15 s, cut it too.
The phone works out its preferred address order once a connection first reaches its address, not on every frame (INF-2773).
Each round dials every saved and nearby address together (INF-2157): private IPv4 candidates first and the rest a quarter second later (`ReadOnlySession.privateLead`, RFC 8305's attempt delay), so the private network wins when both answer.
The first attempt whose WebSocket opens (`PinnedTransport.opened`, after the pinned TLS, the phone's key and the upgrade) is kept and greeted; the others are closed before any hello, so each round makes one welcomed connection.
A round fails once every attempt failed or none opened within `ReadOnlySession.dialLimit`, which cancels the transport too, so a stalled TLS handshake does not inherit the socket's longer lifetime.
Failed rounds wait 2, 4 and 8 s and so on, each up to a quarter longer at random, never past `ReadOnlySession.longestWait`, so a computer that comes back is found within 15 s.
A welcome that replays brings every push the phone missed, so once the phone has read everything since its last reload, the board included, it says In reach at once and sends only the scene's two small reads and any read a cut left unanswered; a reload, or a change whose result was lost, reads everything first.
`contact` is where the connection is and gates reads and changes; `reach` is what the reach line and the computer button say.
`reach` follows `contact`, except that after the computer was in reach it keeps saying In reach while the phone redials, until the computer has been quiet for `patience`, so a cell pause passes unnoticed and a dead path is named within half a minute.
In reach reads "Live" on the reach line and the computer button.
Once the words have left In reach, a welcome after the phone was in reach before names its catch-up in `catchingUp` until what was missed is read: `replay` while the missed pushes arrive, said only when some were missed, and `reload` while it reads everything again.
`reach` says `catching-up` meanwhile, worded "Catching up on what was missed" or "Catching up, reading everything again", and turns In reach only once the replay's last push is shown and every first read has answered; changes are on as soon as `contact` is in reach.
A deliberate stop, such as the close when iOS ends the app's background time, has nothing to be patient about, so the words follow `contact` at once and a reopen reads Reaching until its dial is in reach.
Then it says "Reaching your computer…" while a round dials and "Out of reach" once a whole round failed; later rounds that try again on their own keep it.
Reopening the app, or a change of network once the path has kept still for `PhoneModel.networkSettle`, looks again: a kept connection must answer a ping within `ReadOnlySession.reopenAnswer`, or four measured round trips when that is longer, and a wait between rounds ends and the next round dials now.
A kept connection that does not answer in time but is still receiving is answering, so the check goes on from the last thing it heard; one silent for a whole window is doubted, never cut at once: the phone dials a replacement and cuts the kept connection only once the replacement opened, unless the kept one is heard first.
A replacement that does not open leaves the kept connection to the watchdog, and the next reopen checks it again.
`PhoneReopenTests` reopens against the test home through a route that goes silent under a kept connection, and during a wait between rounds.
`PhoneWeakLinkTests` holds INF-2666's seven checks of a weak link, INF-2669's catch-up of four card lists of about 20 KB cards and the task board pushed with each, on a link of at least 1 KB/s that carries the lighter of the replay and the phone's own re-read, the catch-up the home sends, in about 85 s (`heavy-away`), and INF-2832's reload whose card list of over 80 KB takes about a minute to arrive (`heavy-card`) beside a read the home holds unanswered, still cut 40 s after it was asked (`hold-card-action`), and INF-6476's removal heard right behind a feed line the phone answers with a read (`remove` with `feedFirst`), through the test home's relay, which can slow, delay, stall and drop the path or take it away (`relay-shape`, `relay-stall`, `relay-drop`, `relay-offline`, `relay-online`, `relay-readings`).
The app keeps only its in-memory view while out of reach and shows its last-heard time.
Out of reach is said once, by the reach line under the top bar with since when the computer was last heard, naming the day when that was not today (`PhoneFormats.since`); what the message capsule holds and a card's reply row dim, while the capsule's glass stays whole so it still blurs the crew scene behind it, and `changesOffLine` puts the Mac's own words (`changesOffWords`, `src/renderer/src/devices/viewWords.ts`) under the message box.
`ReadOnlySession.returns` counts the times the computer came back in reach after the reach line said Out of reach, so the app marks a return without mistaking a redial the line never showed, or the ordinary reconnection when it opens, for one.
A trip to the background keeps the connection for the background time iOS gives the app (INF-1528), so a short trip away comes back in reach on the same connection, with what changed meanwhile already read.
When iOS ends that time, the app cancels the connection generation before it is suspended, and activation starts it again; an inactive scene such as Control Center does not disconnect.
A late callback from an old connection cannot clear or overwrite a newer connection.
Nearby addresses may be tried with the original pin.
Each reconnect gives the saved and nearby private IPv4 candidates their head start, without letting a successful local fallback permanently reverse that preference.
The authenticated welcome may carry `addresses`, which refreshes the saved alternatives without changing the phone identity or home pin, erasing local fallbacks or interrupting the working socket.
An older home that omits the field leaves the saved alternatives unchanged.
Your computer displays the last authenticated address actually reached, separately from the saved preference; before any successful connection it shows no reached address.
The session records that address in the same step that turns the connection In reach, so nothing reads In reach beside the previous connection's address while the catch-up's reads are still being sent (`PhoneWeakLinkTests`).

Leave is available in reach and asks for confirmation, sends the connection's Leave frame, waits for removal and forgets the computer shown.
Out of reach, **Forget this computer** asks for confirmation and clears that computer and its pin locally without claiming it removed the phone; either way another kept computer shows next ("Several computers").
Both choices live on Settings' Your computer page, opened from Settings, the top bar's right-hand computer button, Command-I or the reach line; neither is an always-visible destructive toolbar action.
That button is the computer glyph, with a dot in the warning color at its corner only while the computer is out of reach, and VoiceOver reads the reach as its value; with one computer kept its name is on Your computer, not the bar, and with more than one the button names the computer shown.
Out of reach, Your computer also offers Take over with each computer that keeps a copy of the record, as the welcome lists them, which asks one to take over after Face ID or the passcode (`PhoneTakeOverSection.swift`, `PhoneTakeOver.swift`; `docs/devices.md`, "Taking over from a phone").
The phone then follows the home to the computer that took over by its higher number, and refuses the old home's lower number and a second home with the same number.
A removal close or repeated authenticated refusal clears cards and feed and forgets that computer; with no other computer kept it offers joining with a new link on a screen shaped like the first one, with one prominent Join again.
A failed address with no HTTP response does not erase an earlier authenticated refusal; a welcome or a different HTTP response does.
Neither reconnection nor discovery queues or retries a mutation.

## Cards on the phone

`PhoneCards(session:)` is the card-stage integration point: it fills its available column without adding navigation, a toolbar or the app's message box.
It keeps one shown card in a row of cards (INF-3110, the captain's "Row with a lean") and a lower pager of two chevrons around the count, whose menu lists the current titles.
While still, the previous and next cards sit beside the shown one, 8 points apart, so their edges show 8 points wide in the stage's side margins.
The row is a ring (INF-4541): the cards beside the shown one are its neighbours going round, so the first card shows the last card's edge at its left and the last the first card's at its right; with two cards the other card sits on the side the last move came from, and on the side a swipe heads to.
While the row is still, a card beside the shown one is only its raised surface at the shown card's height (`PhoneCardRowEdge` in `PhoneCardRow.swift`), because an accessibility search sees through a hidden view and would find two of every control.
Behind that surface its body, and a merge card's fact strip, load at the width the card will give them (INF-3460, `PhoneCardBodies.swift`), so the card a swipe brings in arrives drawn at its own height and nothing in it moves once the row rests.
Each body has one host and one web view, which moves from the edge it loads behind into the card that shows it, inside a slot of its own (`CardWebSlot`), so a view leaving the screen never closes it; the row closes every body but the shown card's and its neighbours' once it rests or a card shows from the count's menu, and a body whose page stopped while it waited beside the shown card, such as one the phone reclaimed, loads again without showing an error.
A body that drew while its view moved between places is revealed once its view settles in the card that shows it.
A body beside the shown card is one closed element with no name, so a search of the still row finds one title, one body and one put-aside button.
The moment a swipe starts, or a chevron or key turns the page, the cards beside the shown one are built as real panes, each top-aligned at its own height, and once the row comes to rest they are plain edges again; a built side card takes no touches, keys or focus, its body is one closed element with no name, and it is not read until it settles as the shown card.
A sideways swipe anywhere on the shown card, its face or its back, moves the row with the finger, and every card leans about its own foot: the one the finger took up to 3 degrees at the slide-on point, and every other card two thirds as far, each keeping its share until the row rests.
While a card leans, its scrollers draw no top edge band (INF-3704): iOS 27 counts a leaning card's tilted top as under the top bar and would draw the bar's band across it, a strip ending in a bright line; an upright card keeps the band for when its scroller runs under the bar.
The first 10 points decide: travel at least 1.5 times as far sideways as up or down swipes, and anything else is the card's scroller's.
A finger that rests half a second before it moves selects text, two fingers never swipe, and a past card stays put.
Letting go past 35 percent of the card's width, or faster than 500 points a second, slides to the next card, swiping left bringing the one after and right the one before; anything less glides back.
The count changes the moment the finger lifts, and the row glides the rest of the way on a spring with no bounce that starts at the finger's speed and settles over the page time (`--dur-page`), never overshooting (`PhoneCardRowGlide`); a release that glides back follows the same spring.
The app moves the row frame by frame through the glide, as the drag moves it, so it moves in the first frame after the lift (`PhoneCardRowDriver`); the glide's clock counts drawn frames, so a late frame slows the glide for that frame and never makes it jump.
The lift only starts the glide: the row is built again around the new card once the glide ends, or as soon as a finger touches it, and a page turn while it glides carries on from where the row stands.
A swipe past the first or last card goes round; with one card the row moves a third as far as the finger and glides back.
While the keyboard is up the swipe waits, and the chevrons still change cards; a card closed on another computer mid-swipe lets the swipe go.
The chevrons and Shift-Command-[ and ] slide the row one card, as a swipe does, and go round past either end, as the Mac's arrows do; while two or more cards are on Home the chevrons are never greyed out.
Option-Shift-Command-] shows the next new card, as `cards.next-new` does on the Mac.
Under Reduce Motion the row stays still: the shown card dims as the finger moves and a chevron brightens at the side it heads to, and a page turn fades the new row in over `--dur-fade`.
The body tells the app where its own sideways controls sit, so a swipe starting on one stays the body's: a script in its own content world, injected into every frame of the card's page and invisible to the body's scripts, reports the rectangles of sliders, canvases, draggable elements, elements whose `touch-action` keeps sideways panning or whose cursor grabs, and sideways scrollers (`CardClaims`), and the swipe ignores a touch that lands inside one.
Elsewhere on the card the swipe runs alongside its other touch handling, the web view's own and the pull that puts the keyboard away, rather than giving way to it, since on an iPad either otherwise takes a sideways drag first; the card's scroller still waits for the swipe to decide.
With no current card the stage shows the character alone, as the Mac does, and the pager hides.
Shift-Command-[ and Shift-Command-] turn one page per press, as `cards.previous` and `cards.next` do on the Mac, and a sheet keeps them from the stage behind it (INF-1753).
They are UIKit key commands on the window's root view controller with `repeatBehavior` `.nonRepeatable`, because a page turn builds the web view of the card it brings in and can hold the main thread past UIKit's key repeat delay, and SwiftUI's shortcuts repeat even with `buttonRepeatBehavior(.disabled)`.
Before iOS 26 UIKit offers no way to stop that repeat.
The stack follows the Mac's stage rule (`onStage` in `src/shared/cards.ts`): a new card awaiting its author's close-out stays out of the stage, pager and unread count until it is released.
A replied-under card carrying `sentBackAt` keeps its place while its author answers.
A card minimized on any Mac leaves the phone's stack and count, and waits in Tasks, as on the Mac (INF-1517).
A tap on its row there sends `inf:cards:minimize` with `false`, which brings it back on every Mac too, and shows it on Home.
A card is one framed surface that fits the stage: its top bar, one 44-point line, stays at the top (below, for a short stage), its choices stay at its foot where there is room (below), and the rest of its head, the body and attachments scroll between them in one native scroller (INF-6136).
The surface is the Mac's raised card (`PhoneCardSurface`): a solid fill, its thin edge, the light line inside its top and its drop shadows, read from the Mac's `--acrylic-shadow` by `scripts/generate-phone-theme.ts`; the cards beside it in the row are raised the same way.
The body's web view never scrolls, zooms or adds insets of its own; it takes its content's height inside that scroller, so there is only one scroll and nothing runs past the card's rounded frame.
Until the body reports drawn, its web view is a 48-point placeholder that clips the body, so native code keeps the web view one closed accessibility element that takes no taps until it has laid the view out at the body's height.
The page itself never hides the body: on iOS 27.0, a frame hidden from accessibility inside the page stays hidden after it is shown (INF-1651).
Native code reveals the body from the web view's own layout once its bounds hold the drawn height, never from the SwiftUI update that reads it, which runs before that layout; the footer choices enable at the same moment (INF-1574).
A body built behind another tab loads its page only once its web view reaches a window: WebKit suspends a hidden view's process, and a page that began loading there reported drawn about half a minute after its tab showed again.
The page tells the body's bridge that its pictures can arrive late (`latePictures` on `initialize`), so the body reports drawn once the fonts its layout asked for are in.
WebKit's `document.fonts.ready`, which the bridge waits for otherwise, resolves only after the page's load event, and that waits for every picture; a picture waiting for its computer to come back in reach would keep the body's words clipped and out of accessibility (INF-1562).
The choices stay at the foot only while the top bar and they take at most a quarter of the room the stage offers (`PhoneCardPane.pinShare`, the captain's share in INF-6269), so the body keeps three quarters; otherwise, as on an upright iPhone for most cards with a reply field and choices and on an iPhone or an iPad on its side, the choices come after the body in that scroller instead, under the bar that still stays on an upright phone; on an iPhone on its side the bar scrolls with them, so a reply or a note's editor keeps the little room the keyboard leaves.
The rule reads the stage's room, never which device it is, so an upright iPad, whose room is tall, keeps most cards' choices at the foot.
The rule reads the face's own foot, never the blanks the face draws while the thread shows, and reads again whenever the stage, the bar or the foot measures a new height.
The keyboard its reply raises never reshapes the frame (INF-1524), so the card stays inside the room the stage offers (INF-2568): a pinned card taller than that room rises inside it while its reply types, as far as shows its choices without the field's top leaving the room, and the top bar comes back as the keyboard closes.
A reply inside the scroller of a card that scrolls whole keeps its last line in view as it grows.
A text box inside the card's body that takes the keyboard stays in view: the body's web view keeps its page at its top when WebKit would slide it to reveal the box, and the card's scroller brings the box, with 16 points under it, into the room it shows (INF-3427, INF-3468).
A script in its own content world, injected into every frame of the card's page like `CardClaims`, reports the focused box's rectangle (`CardFocus`); where the room is shorter than the box and that margin, the caret's line comes into view with room around it instead.
While a card's reply, on its face or its thread, a text box in its body or a text box in a panel's own card on Home holds the keyboard, on every device, upright or on its side, the pager, the last turn and the message box step aside, the message box keeping its draft and photos, and the card grows down to 8 points above the keyboard (INF-3468, INF-4350); they come back as the keyboard closes.
A panel's own card fits the room the keyboard leaves, its title below the bar, and its page scrolls past that room (`PhonePanelCardPane`).
While the message box holds the keyboard nothing steps aside, except that on an iPhone on its side the pager does, since the keyboard leaves about two lines of room.
A reply typing in a card whose whole frame scrolls comes to rest with the card's choices under it where the field, the choices and the card's foot fit in the room the scroller shows, and otherwise with 16 points between it and the card's foot (`PhoneTyping.margin`); a pinned card's rise keeps the same margin where its choices do not show.
While a card's box types in a card that runs past its scroller, the card's content runs 16 points further, while a card that shows whole keeps still with its head in view, so a box at the card's foot or the body's foot can still rest with that margin under it; the room it counts leaves out the part of the scroller under the top bar.
A person starting to scroll a card or its thread closes the keyboard; the scroller following the caret does not.
While the keyboard is up, a card or thread that fits whole above it bounces under a flick, so that flick closes the keyboard too (INF-2737); with the keyboard down, one that fits does not move.
While the keyboard is up, a pull down that starts anywhere on the card, its head included, closes it, and so does a tap on the head of the card's face or of its thread; the head's own buttons keep their taps (INF-3106).
When the home is on `CARD_SEEN_UPDATE_SINCE` (major 13) or later, or advertises `card-current-update-seen`, every snapshot supplies the owner's exact released-update seen state, which drives unread counts and the chevrons' dots: a dot on ‹ while a new card lies before the shown one, and on › while one lies after it.
A sighting acknowledges the exact released update only after the pane draws while visible, active and connected; reading never hides a note or changes another view's selection.
The session consumes initial state before reporting again on reconnect and never queues offline sightings.
A home without that named change retains the legacy two-argument request and session-local offer marks, with existing card actions unchanged.
Older native readers ignore the optional fields; older desktop readers receive a capability-projected snapshot that their strict card decoder accepts.
Full shared marks require updated owner and views; offline views keep last-known state until delivery resumes.
Project filters stay local to each desktop window, with no new phone filter.
Ordinary arrivals keep the shown card in place; a new `holdsPlace` card comes forward, unless a text box in the shown card holds the keyboard, when it waits as new as on the Mac, and a departure chooses an unread card first, else the card after the one that left, else the one before it, by the Mac's rule (`PhoneCardDeparture`, which `PhoneCardDepartureTests` holds to the Mac's recorded choices).
On Home, unread cards besides the shown one are counted beside the pager in the Mac's badge look ("1 NEW": accent mono capitals on the accent's dim fill, still 44 points tall to press), and a press shows the first of them in the pager's order, so each later press shows the next, passing over the cards earlier presses left or showed while one they have not shown waits, as the Mac's does; the new-card pill shows only on the other tabs, while a reply's pill shows on every tab.
A card's picks, the words in its field and its queued notes are its draft, which survives paging and follows the captain to every other screen through a computer that keeps drafts ("Unsent picks on the phone" below); with a computer that does not, it lives only in the phone's memory.
Native controls own the head, footer choices and reply field; a body cannot draw over or press them.
The head draws the Mac's, in two parts: the top bar holds the kind (Attention in the danger color), Review finding, the task's key in mono and where the task runs, which shortens first on a narrow line, then the size control and the minus, all centred on one line; under it, scrolling with the body, come the model chip and the risk, the title, the revised line and the asked lines; it names no sender.
The task's key opens its record on Tasks, or in the sidebar beside the stage.
A merge card's risk, on a merge card, a past merge card or a self-merge note, is a row of seven dots in the levels' colors, and a press opens a sheet naming each dimension, its level's words and the crewmate's why.
The card has one minimize minus, after Maximize card wherever a side panel shares the window (below), with ⇧⌘M from a keyboard; its label and rest words come from the core’s optional `corner` (`src/shared/cardLeave.ts`).
The head of the card's thread carries the same minus, at the captain's ask that a card showing its thread still offers it, and ⇧⌘M presses the one on the side that shows.
It asks the shared close dispatcher to put a decision away or read a note, never to refuse consent or end a task.
With an older core lacking `corner`, the phone uses the older safe minimize request, not its destructive close.
An answer note carries the host’s Done, and its record carries the same Done after the note was put away.
The task-record sheet reads its Hide minus and rest words from the record row, and Shift-Command-M hides that sheet without ending the task.
Putting a decision away retains its picks and typed words without a warning question.
The corner's hint carries those same rest words.
The words a phone card shows come from the Mac's owners through `PhoneCardWords.generated.swift`, written by `scripts/generate-phone-contract.ts`.
The footer choices are the Mac's row (`PhoneChoiceStyle` in `PhoneChoiceRow`): rounded rectangles with 16-point words, drawn about 37 points tall inside a 44-point touch area, each keeping its own width at the trailing edge and wrapping onto another line when they do not fit.
As on the Mac (`footerGroups`), the default is drawn last, filled with the accent; a danger choice has a red outline and the rest a hairline outline.
The answers line (`answersLine.ts`) sits in mono at the start of the first line, and a hairline sits above the row while the body runs on beneath it.
On a decision whose body is not a preview the answers line is the Mac's stepper through its questions (`docs/keyboard.md`, "Moving between a card's questions"): a tap on it goes to the next question with no answer, and from two questions on a chevron before it goes to the previous question and one after it to the next, each going round past either end.
A step brings the question into the card's view with the revision highlight for a moment and leaves the keyboard where it was; ⌘J and ⇧⌘J from a keyboard step too and give the question focus, so Enter, Shift+Enter and the number keys answer it, and the scroller follows a body's own Enter or Shift+Enter to the question it reached.
WebKit gives a number key or Return no keydown inside the body even while its frame holds that focus, so the body's view hands each one it receives to the body's bridge, which presses it on the focused question's control.
While a required question has no answer the default choice is drawn muted, and a press of it asks for the missing answer; a pressed choice shows a pending mark while its answers are read from the body.
Above the choices sit the host's fact strip, which the body's page splits off as the Mac does and a second read-only web view draws, then the reply field.
The strip is the Mac's status line, drawn from the same markup and styles, with the line on whether the merge closes the task as its last line, above the phone's own buttons.
What happens after the merge leads the body, as on the Mac: the captain's actions under their lead in the warning color, then the crew's steps with their goal, what they wait for and who does them, every one written out, scrolling away with the body.
The reply field reads "anything to add?", takes photos from the library or the camera, and its words also go with a choice, the note's own Done or Got it included, as the `anything_else` answer, as the Mac's field does.
Its photos and queued notes go with a choice or a note's own button too, in the same press, once the computer lists `choice-attachments` (INF-5608's plan, piece 2; `PhoneChoiceCarry`): a line above the choices says what goes with whichever one is pressed, in the Mac's words, the field lets go of them at the tap, and a refusal puts them back.
Against a computer without that change, the choices and the note's button wait while a photo or note waits, with the Mac's words ("Send the notes as a reply first", or for photos alone "Send the file as a reply first"), so nothing is lost.
While the reply holds the keyboard and holds words or a photo, the choices and the note's Done or Got it draw quiet in the same place, and a tap on one only puts the keyboard down, nothing sent or chosen, so the next tap chooses (INF-5448, `PhoneCardPane.replyTyping`); with a hardware keyboard and no software keyboard up they stay lit.
A footer press collects a fresh form reading through the computer’s shared bridge, including question definitions and staged settings, and sends the mounted offer and lifecycle with its own interaction id.
The phone lists `card-answer-skipped` in its hello, and a press or reply leaves each answer's skip mark out when the home's welcome does not list it, so an older home reads a skipped question as its default kept as proposed (`PhoneCards.sendable`).
If the body has already failed, a later deliberate press may use its last observed draft, marked `fallback` with `no-fresh-reading` rather than fresh question evidence.
A timeout on the current press still refuses it; a body that never supplied a reading keeps choices unavailable rather than inventing answers.
The default choice waits for every required question; other choices carry the current answers.
The core still owns refusals, effects and closing; a choice, close or put-aside takes the card off Home at the tap, and a refusal puts it back in its place with the draft (see "Changes show at the tap" below).
Reply admission counts UTF-16 units against `PhoneLimits.reply`, generated from the published request’s text limit.
A shown, drawn card reports seen only while the phone is active and the Mac is in reach.
A reply sends its words, photos and current settings to the card’s author and makes no closing choice.
A card's thread is on its back (INF-1919, the captain's Approve and build): once it has a message, a latest line at the face's foot, above the field, says who wrote last in their color and the newest words on one line, then `working` with a spinner while the author is at work, the author's replies new since the back last showed with a dot on its chevron, or how many messages there are.
A tap on the line, or Command-backslash, turns the card over about its upright axis in `--dur-med` (`PhoneTheme.surfaceMove`), a cut under Reduce Motion; Card at the back's head, or Command-backslash again, turns it back.
The back holds Card, the thread's count and the card's minus, the card's title in one muted line, the messages, and at its foot the same field, with its draft, photos and focus, and the same choices.
A card with a secret's masked fields leaves Save secret off its back, so Save stays with its fields on the face and never sits under the thread's plain field; Don't save there still carries the back's words.
The body's web view stays on the hidden face through the turn, never rebuilt, and the hidden face takes no touches and is out of the accessibility tree.
A reply that lands while the face shows lights the line and never turns the card; a send from either side turns it to show the new line.
A revision never turns the card either (INF-2565, the captain: "i don't think we should auto flip").
A new offer builds the card's pane again to draw its new body, so the stage keeps each card's side, read count and the offer its face last showed (`PhoneCardSide`), and a pane built while its back shows starts on its back.
A revision that came while the back showed puts a dot on Card's chevron, with the value `updated`, until Card turns the card to its face.
The thread shows each message as the Mac's does: who wrote it (you, crew, mate or app) in its color, its time, its words as plain text and a captain's settings folded on one line, then a working line while its author is at work.
The thread's words (the count, `1 new`, Card, `updated`) are the Mac's own, from `src/renderer/src/cards/threadWords.ts`.
A line someone other than the card's answerer wrote carries the same small line as on the Mac, "Revised by …" or "Written by …", and ", after the card closed" on a clarification (`PhoneCardWords.contributor`, generated from `contributorWords`; `docs/card-threads.md`, "Shared cards").
The body's change bars mark the parts the revised line counts, and the body's task keys open their records: every key of a task the phone holds links, the card's own task's included, as on the Mac (`docs/card-authoring.md`, "Task keys").
A card that takes replies takes notes on its body as the Mac's do (INF-3296; `docs/card-threads.md`, "Pointing at a card"), once the home is on major 16 or later or lists `card-annotations`.
Point at, the Mac's outline pointer beside the photos in the reply field, lit in a 32-point circle inside the field's rounded end, steps aside while the reply types and lets a tap pick a whole part of the body, turning off once it has picked one, as on the Mac; words selected in the body add Annotate to the selection's own menu, after Copy, so the menu iOS draws keeps its place.
Either opens the Mac's popover as a note editor inside the card (INF-3746): a raised panel under the part or the words, as wide as the reply field, over the lines below them, with the excerpt, a comment in the app's plain field that may stay empty, Cancel and Queue.
On an iPhone on its side, where the keyboard leaves no room under the part, the editor takes the card's foot instead.
While a note is open the reply field and the card's choices step aside; while its comment holds the keyboard it counts as a text box in the card, so the pager and the message box step aside too, and the card's scroller keeps the part and then the editor, its comment first, in view as the keyboard rises and the comment grows.
Return in the comment queues the note, Command-Return from a keyboard queues it and sends, and Escape closes it while the comment is empty and otherwise says Cancel discards it; only Cancel or Queue closes it, and a text note leaves no selection behind once it is queued.
Queued notes show above the reply field on either side of the card, counted ("2 notes not sent"), each in one row with a bar, what it points at on one line, its comment on at most two, and Edit and Remove in the accent; the phone keeps them with the card's draft while it pages.
The reply's send takes every queued note with its words, as one reply, and a refused send puts them back.
The body's page builds each note from the part's identity with the Mac's own code (`pickedNote` in `src/shared/cardNoteTargets.ts`) and draws the queued highlights; a text note lights only its words.
On the back a sent reply's notes take the same row with a quiet bar, naming what they point at; a press turns the card to its face and scrolls to the part, or says the part is no longer in the card.
A lit part, on the Mac and the phone alike, is a rounded tint reaching 4 points past its words inside the body's own inset, and a queued part's bar sits in that inset left of its words.
A link in the body opens in the device's default browser, and a draft button puts its words at the start of the message box, unsent.
A crewmate's browser on its card is a strip naming Browser, the page's site and who is driving, read from its task's record; its button names the computer.
A request to take over a crewmate's browser stays on Home with its thread while the captain holds its page on a computer, as it stays docked beside the page there (`docs/task-browser.md`, "The request beside the page"): its strip reads you have control, its open-browser choice names the computer and sends nothing, and a reply from its field rides the card's thread, so it shows in the column beside the page and reaches the crewmate with the fact that the captain holds its browser (`browserHeld` on `thread-reply`).
The strip reads its task's record again whenever the board row's turn or last write moves (`PhoneRecord.browserLineRead`), since the computer notes each take and return of the browser on the record while the crewmate's turn stays as it was.
A lone or marked card stays; an ordinary reply with another card declares its departure to the core.
Settings and browser doors name the computer where they must be used and send no action, and so do a Secrets card's own choices, which need the computer's confirmation.
A Secrets use's approval card instead shows the phone's own Allow once and Deny, which the phone signs or sends itself (`docs/secrets.md`, "Remote decisions").
An ask to keep a secret draws one masked field per secret above its buttons (`PhoneSecretAsk`, `PhoneCards.swift`), each under its name with its place and, for a replacement, the version it replaces, then one line saying where the values go, as the Mac draws them: Return moves to the next field and, in the last, saves; Save secret sends the values with its pass in their own request (`inf:secrets:keep`), never as a choice, the values stay only in the card's state and are cleared once kept, and Don't save is sent like any other choice (`docs/secrets.md`, "Asking to keep a secret").
The host’s saved-sign-in choice needs no local browser page and is sent like any other choice.
A card its author ended after the captain had seen it stays on Home as the Mac draws it (INF-3071): its chip reads Ended, its thread carries the computer's app line among the messages by when it ended, and its one button and the minus both read Close, which the computer sends as the note's button and the card's close.
A phone from before ended cards draws the same card as a note whose one button reads Close.
The phone keeps recently closed cards in memory through `inf:cards:past` and also opens a past card the Mac points to with `past_card_shown`.
A past card has its last-seen body, saved answers, inert choices with the chosen one at full contrast and an accent edge, the words sent with that choice, the notes and photos by name that went with it, its thread and Hide; it has no reply or mutation path.
Its ending words are generated from `src/shared/pastCard.ts`, so the captain, first mate and crewmate keep their own attribution, alongside withdrawn, taken-down and duplicate endings.
An evidence actor of `frame` is projected to the card’s typed author for those words; the stored ending stays unchanged.
The same read accepts older past-card ids and opens a closed card from a task record's Cards tab.

`CardWebHost` gives the shown body a nonpersistent WKWebView containing an opaque `sandbox="allow-scripts"` frame.
On a card's face the frame grows to its body's height and never scrolls itself (`scrolling="no"`), so a swipe moves only the card's own scroller, even after a revision in place that WebKit measured while it settled, and a cover's frame fills the cover and scrolls (INF-6865).
The bundled parent uses the actual shared frame bridge, form readers, schemas, stylesheet and typefaces, generated by `node scripts/generate-phone-cards.ts`; no second form implementation exists in Swift.
Each inline body script runs by its hash under `default-src 'none'`, with only local font and picture sources; event handlers, external scripts, fetch, forms, popups and navigation gain no permission.
Native WebKit messages are admitted from the trusted main frame alone, never from the body’s child frame.
The parent checks source identity, document identity, shared message schemas and declared action ids; native code checks effect-free action ids again and stamps every such request as `frame`, never `chrome`.
A body's `inf.data(src)` reaches native code only for a data file the body names; native code checks the minted name again and reads the Mac's copy as text (`inf:cards:data`, `docs/card-authoring.md`, "Data by reference").
A crewmate's open card reads live app data as on the Mac (`docs/ui-plugins.md`, "A card's reads"; INF-5531): the card page answers its body's `inf.subscribe` through the same read catalog and `ReadExecutor` a panel's page runs (`phoneReads.ts`), and the same subscription owner as the Mac's frame controller (`FrameSubscriptions`), granted the reads and views the card declared.
`CardWebHost.liveReads` grants them only to the body of a card that is neither past nor ended, never to a fact strip or a cover, and when the card ends, whether its body is shown or kept loaded beside the shown card, the page ends each subscription and its script hears `read_not_declared`, keeping what it drew.
Each read's ask crosses to native code on a read's channel alone (`PhonePanelRequest.cardReads`, generated from the panels' reads and the record's `sql` read) and goes through `ReadOnlySession.panelAsk`, and the session hands the page the computer's pushes and reloads while it grants any read (`hearReads`).
An app part the body names by reference takes the phone's own copy of the part's code when the parent page builds the body's markup, before it asks native code for the scripts' hashes (`docs/card-authoring.md`, "Parts by reference").
The native footer is the only path to an effect-bearing action.
A native watchdog removes a body that stops answering without removing its native controls, and offers Retry.
The watchdog counts only while the body is on screen, loaded and in front, since WebKit pauses a card behind another tab or in the background, and any answer since its last look counts, however slow.
Its pings go to the body, which can answer only once its frame's bridge says ready; until then the card's page answers each ping for it (`CardWatchdog`).
So a body still loading on a busy device is never counted, while one whose script loops as it loads stops its page answering too, since the frame runs on its page's thread.
It also counts only once the page has run something, the card's mount or an answer, since a loaded page can still wait seconds for WebKit's own processes to start before it runs anything; the mount tells the host before it builds the body, so a body that loops from its first moment is still counted (INF-2076).
A native collection timeout also releases a waiting footer or reply when the web process cannot run its own timer.
A finger held on the body from 0.12 s up acts as a tap there does (INF-1337).
WebKit hands a touch held that long to its press handling, which can send the page no click, more often on a busy card, so a picture opened no viewer and a choice stayed unpicked.
The shared bridge clicks what the finger went down on once its touch ends there, and drops the click WebKit may still send, so each press acts once (`FRAME_PRESS_SCRIPT` in `src/shared/plugins/framePressScript.ts`).
A picture is the exception: the host opens one only inside the press's user activation, and WebKit gives a release none once the press is held about a second.
There the bridge leaves the press to WebKit, which clicks the picture itself with an activation of its own, because both hosts' frames keep a picture the bridge opens from being dragged, having its words selected or showing the system's menu (`phonePressRule` in `ios/Infinitary/CardRuntime/pressRule.ts`).
In Point at, a press on a part picks it on its own release however briefly it is held (INF-6222).
On a busy phone the app can hand WebKit a quick tap's release late, and WebKit, timing the touch from when it arrived, takes the tap as held, while the page's pointer events carry the touch's own times and call it quick.
WebKit's held press clicks only on something that takes clicks of its own, never on plain words, so a paragraph pointed at heard no click and opened no note editor.
So the bridge picks a part pointed at as the finger comes up, clearing words still selected from before as a tap would, and drops WebKit's click if one follows.
Outside Point at, a quicker tap, a press that slid off what it went down on or became a scroll or swipe, one the body's own script took, one on a text field, canvas or other control that takes its own touches, and one on words outside a control, which selects them, stay WebKit's.
A card's or panel's web view never scrolls itself: the app's own scrollers and swipes move the whole view with the finger, so what the finger went down on stays under it, and WebKit cancels neither the page's pointer nor its touch.
So the app watches each finger on those views and tells the page `press-moved` once it moves farther than UIKit lets a press move, and the bridge leaves that press to WebKit (`PressMoveWatch`).
`CardAssets` serves bundled fonts and minted picture, project-font, recording, sound-clip and proof-log names through the pinned connection; it never opens an arbitrary URL or filesystem path.
It asks through `ReadOnlySession.read`, which waits until the computer is in reach and asks again after a reconnect, so a card drawn from the first cards read, before the other first reads answer, still gets its pictures.
A separate script-free, nonpersistent web view shows pictures and GIFs, with no native message handler.
A tap on a picture or a diagram opens it full screen (INF-3107): fitted, with pinch from fitted to eight times fitted, a double-tap to its own size centred where tapped and back, a drag to pan, a refit when the device turns, and Done or a swipe down while fitted to close; a recording keeps its sheet.
WebKit's own double-tap waits for the viewer's to fail, since the page's `touch-action` turns WebKit's off only once the page answers each tap, and a page too busy to answer let both fire, after which the next swipe down never reached the viewer.
The double-tap's zoom back to fitted runs in an animation that allows interaction (`CardMediaZoom.fit`), since the scroll view's own animated zoom ignores every touch that starts during its 0.3 s, and a swipe down begun just after that double-tap never reached the viewer (`CardDiagramZoomTests`); the zoom in keeps the scroll view's own animation, since WebKit puts the page's scale back over a zoom set in code until the page has heard one.
The viewer's page draws its own background in the theme's color, since while zoomed WebKit keeps a copy of the page drawn at the fitted size under the sharp tiles, and a page with no background lets that stretched copy show through as a blurred second edge (`CardDiagramZoomTests`).
The test zooms in code, and until the page has heard a zoom from the web view each frame it commits carries its own scale, which WebKit puts back over a zoom set in code but not over a pinch; so it sets each zoom again until the page itself reads it.
A tap on a proof log's line on a merge card opens the log's text in a sheet of its own (`CardLogView`, INF-3887): the line's words as its title, its size, the text in the mono face and selectable, and Done to close; it reads the log from the computer by its kept name (`inf:cards:log`, `docs/card-authoring.md`, "Proof logs").
A diagram arrives as the SVG picture the bridge wrote out of the card, and native code puts the bundled faces it names inside it, since a picture loads nothing.
A part that opens live, such as the architecture map, opens instead in a cover titled Card diagram with Done (INF-3881).
In the card the map is a fitted picture that takes no drag, so one finger on it scrolls the card, and a tap on it or on its Full screen asks the bridge to open it (`inf.expand`) with where it stands: its place, comparison, chosen box and change step.
The cover is a second, read-only host of the same body, stamped with the part's index and that place, whose frame fills the cover; the map fills it too.
Inside, a drag moves the map, a pinch zooms, a tap chooses a box, a tap on the chosen box or Open goes in, and Fit or turning the device refits it.
The cover's map tells its host each place it reaches, and Done hands the last one back to the card's map, which goes there.
Both web views disable system link previews as well as refusing navigation.
A body's link leaves only on the captain's own press, when the parent's `isSafeCardHref` admits it, and native code checks its scheme again before the system opens it.
MP4 recordings use the native player, whose resource loader serves only bounded bytes read through the pinned connection and writes nothing to disk.
The asset refuses all external references, and the player disables external playback and picture-in-picture.
A card that can still be answered draws its sound clips' Listen buttons, as the Mac's shown card does (`docs/card-authoring.md`, "Sound clips"); a past card and a part's cover draw the caption alone.
A press plays the clip in a native strip under the body (`CardSoundStrip`): the micro label and the caption, then Play, Pause or Replay, a seek slider and the time, at normal speed.
The card's page passes on only a press on a clip its body names, and native code admits only a minted clip's name; the clip's bytes come through the pinned connection into memory, and the system player plays them from there, writing nothing to disk.
One sound plays in the whole app (`CardSound`), so a new press replaces the one before.
The press sets the sound session for playback, so the clip plays with the silent switch on, and the session ends when the clip pauses, ends or stops.
The player and the session are used only on a queue of their own, never the main thread, because starting the sound can wait on the system's sound service (a test simulator held it for minutes); the strip's button stays held until the sound is playing.
Leaving the app pauses the clip, and the strip goes, stopping it, when its card leaves the front: another card shows, it is answered, or it goes.
Assets and drafts are memory-only and are cleared when their owner goes away; a draft is never written to the phone's saved connection file.
An out-of-reach session refuses changes, except a card's draft, which waits in memory and goes on return ("Unsent picks on the phone" below); a lost reply has an unknown result and is never retried or queued across reconnection.
The phone containment review is in `docs/live-prototype-security.md`, “Phone cards”.

### Unsent picks on the phone

The phone reads and writes the same card drafts as every window (`docs/card-authoring.md`, "Unsent picks follow you"; INF-5445): a pick, the words in a card's field or a queued note on the phone shows on every other screen a moment later, and theirs show here.
Its hello lists the `card-drafts` change; a computer whose welcome does not list it keeps nothing, and the phone keeps each card's draft to itself in memory, as before.
`PhoneCardDrafts` holds each card's draft for the session and `PhoneDraftSync` its rules, the Mac's `DraftSync` without its saved revisions (`InfinitaryKit`, `PhoneCardDraftsTests`).

- The session reads every draft (`inf:cards:drafts`) each time the computer comes into reach and whenever its cards hold a card or an opening it did not hold before, and takes each other screen's change from the `inf:cards:draft` live frame.
  The draft's opening is the card's as the computer's cards last said, so a tap still on its way never drops it; a card that leaves, or opens anew under its id, lets the phone's draft of it go.
- A change goes once the captain pauses for `PhoneContract.draftQuietMs` (the Mac's `DRAFT_QUIET_MS`), one request per card at a time with the newest change waiting behind it, so words typed into the field never go key by key.
  Words longer than a reply may hold wait until they fit.
- Another screen's picks reach a body on screen at once through the bridge's `fill` message, which `CardWebHost` sends through the card page's `fill`; a body not yet born starts with them and the answers it already had.
  Every body reads its answers into the draft, a body loaded beside the shown card included, so one closed and drawn again, or retried after it stopped, starts from the draft.
  Another screen's words wait while the card's field holds the keyboard, and show once it lets go only if the captain typed nothing there since they arrived.
- A part changed while the computer is out of reach keeps the revision the phone had then, in memory only, so it goes on return unless another screen changed the same part meanwhile; a draft is never written to the phone's saved connection file, so a phone that quits first loses what it had not sent.
- A change refused as `closed` lets the card's draft go, and one refused as `too-large` goes again only once it changes, as on the Mac.

### Text size

Infinitary's words on the phone follow the device's Text Size, cards and panels included, with no size of its own (the captain's Approve and build on INF-4713).
Native words do it through Dynamic Type (`PhoneFont`, every style relative to a text style); only the tab strip's icons hold their size.
A card's or panel's page draws the Mac's stylesheet, whose type sizes are in CSS pixels, one per point here, so the page draws every Mac size times one factor (`PhoneTextSize`): the device's body size over the Mac's card body of 14.
At iOS's default Text Size a card's body is the phone's own 17 points and its smaller text keeps the Mac's proportion (15.2 for 12.5, 13.4 for 11); at the smallest size it matches the Mac exactly.
The factor grows to iOS's largest standard size, a body of 23 points, and holds there at the accessibility sizes.
The page carries it as a phone-only rule after the card or panel stylesheet (`ios/Infinitary/CardRuntime/textSize.ts`), which sets each `--text-*` token to the Mac's value times `--inf-text-scale` and sets them back to the Mac's values inside a drawing (`svg`), so a drawing's labels keep their size and none grows into its neighbour.
Line heights are unitless, so they follow.
The same rule sets `text-size-adjust: 100%`, since WebKit on iOS otherwise enlarges the words of a wide card on its own: the same card line drew at 19 points in an open Duo's card on its side and 17 in its card like a book (INF-4838).
Native code hands the factor with the page's mount, and a Text Size change while a card or panel shows reaches its frame as the bridge's `text-scale` message, so it redraws in place, keeping its answers, drafts and reading place.
The Mac never sends that message, and its own stylesheet and Size are untouched.
`tests/browser/phone-text-size.test.ts` holds the rule and the message on the card's real stylesheet, and `PhoneTextSizeTests` the factor at real Text Size steps.

## Native shell and component ownership

`PhoneWorkspace` supplies a stage, an optional Tasks view and an optional composer, with no draft or record state of its own.
The composition installs `PhoneCards(session:)`, `PhoneTasks(session:)` and `MessageComposer(session:)` together.
The composer stays mounted once, preserving its own text and photo state across tab and orientation changes; the shell never copies it into a tab or layout branch.
The message box, Tasks and Activity share one centred reading column, `PhoneColumn`, 560 points with its gutters.
The card stage takes its whole width less 16-point gutters on any width, so on an iPad the card is wider than the message box and the card beside it shows the same 8-point edge as on an iPhone.
On an iPhone on its side (compact height) the card gets the height: the bar keeps its one row, and the last turn and the notice wait until it is upright.
There `AnyLayout` puts the removable photo strip beside the message capsule, retaining one field and its complete draft.
The field displays up to two lines there, the controls retain 44-point targets, and warnings remain full-length; portrait and iPad keep the stacked arrangement.
The native journey requires a completely visible card heading and scrolls real body text and an action into full view, not merely a retained draft under the card.
Card and task owners keep their selected records and replies.
`PhoneMessageContext` carries only the shown current or past card, Home's visibility and the open task record into the composer; hidden cards and dismissed records supply no hint.
The top bar is the one-row bar the captain chose (INF-1062): a Settings button at its left, the strip of Home, Tasks, Activity and, while the computer has panels to draw, Panels in its middle and the computer button at its right; there is no bottom tab bar.
The strip, `PhoneTabStrip`, is Apple's segmented control, which iOS 26 draws on glass (INF-1328): a house for Home, a checklist for Tasks, a pulse line for Activity (INF-1334) and three stacked panes for Panels, read by VoiceOver as a tab bar of the tabs' names.
It carries no unread dot; the notice under the bar and the next chevron's dot mark an unread card.
The strip keeps the bar's own size at every type setting, as the system's bars do, so the bar's buttons never move around it.
Where the bar has room, the strip is as wide as makes the lit tab a 40-point circle, 144 points for three tabs and 189 for four (INF-1517, the captain's Round); where it has not, a `ViewThatFits` gives it the control's own fitted width.
Settings and the computer are the system's 44-point circles for a one-icon button, with no wider frame of the app's.
Command-1 to Command-4 switch tabs in the strip's order, Command-Comma opens Settings and Command-I opens it at Your computer.
`PhoneWorkspace` holds the tabs in the system tab controller with its own bar hidden, so each tab keeps its draft, scroll position and search while another is shown, and a tab that is away leaves the view hierarchy: nothing in it is drawn, pressable or read, and a keyboard typing into the message box closes with the tab it leaves.
Home is one column: the stage, then the last turn and the message box under it, in the layout rather than floating over it; Tasks, Activity and Panels run to the foot with nothing over them, so the last row is whole and pressable after scrolling to the end.
No bar height is measured or guessed, and nothing recedes on scroll.
No panel sits behind the message box: the last turn is its rounds of lines over the capsule, which is native glass on iOS 26 and the field's fill and hairline on iOS 18.
The capsule is 48 points tall, with the photo glyph 16 points in, the words 52 points in and send a 32-point filled circle 8 points from its end, each control in a 44-point touch area (INF-1517, following ChatGPT's input).
With an Apple Pencil in hand the message box and its last turn stand at the top of Home's column, under the bar and the reach line, so the writing hand rests on the card below; the stage takes the room under it and the pager stays at the foot (`PhoneLayout.composerOnTop`, `PhonePagesLayout`).
The Pencil itself is the signal, never the kind of device: a Pencil touch or hover anywhere in the window (`PhonePencilWatch`, an observer that never recognizes, cancels or delays a touch), or iPadOS's `isPencilInputExpected` when the app opens or comes back.
At the top the last turn shows only its newest round, card or no card, so a card coming or going never moves the box.
The same view moves, so the draft and photos stay, and the box reserves four lines with photo and send on its bottom row; a card's reply field reserves four lines too while the box is at the top.
Focus that a finger, the trackpad or a hardware key gives the message box or a card's reply puts the box back at the foot; Pencil focus does not.
Nothing moves while a field holds focus or while the Pencil writes on one: a waiting move applies once it lets go (`PhonePencilPlacement`).
An iPad on its side moves the box to the top of the stage column beside the sidebar the same way; a window with a fold and a maximized card keep the box where it was, and an iPhone, which never sees a Pencil, never changes.
The placement is held only while the app runs, never saved or sent to the computer.
Settings is this phone's own sheet, `PhoneSettingsSheet`, opening on Your computer (`PhoneComputerPage`, "Several computers"), then General, Appearance, Projects, Intelligence, Runbooks, Usage, Automation, Integrations and Devices, the desktop's names in the desktop's order.
The names, the sheet's own Settings title and Back are the catalog's messages, never words typed into the sheet (`docs/i18n.md`, "On the phone").
The phone's own sections, Your computer among them (`phoneComputerTitle`), Settings, Done and Back to Settings are the phone's own messages (`PhoneMessages.phoneSettings…`, `phoneCommonSettings`, `phoneCommonDone`); the five pages read from the computer take the computer's own tab names (`PhoneMessages.panelSettings…`).
Back's spoken name on a page under a section is `phoneSettingsBackTo`, and from a page under a page it is the shared `shellTopBarBack`.
On iOS 26 the sheet's top bar draws two matching circles, as Apple's own sheets do: Back is the chevron alone, still speaking where it goes, and the sheet closes with the system's X (`Button(role: .close)`), since each choice saves as it is made; iOS 18 keeps the chevron with the place's name and the word Done.
Each row has its name, one current-state line and a chevron, with no icon, and opens its page inside the same sheet on iPhone and iPad alike.
General holds Infinitary and its version, Appearance holds Theme, Text size, Language and, on a device that folds, Split at the fold, Integrations holds Google on the computer it controls (below), and Devices holds This phone (This iPad on a tablet), what it can do and the existing Approves secret uses switch while the computer offers it.
Projects, Intelligence, Runbooks, Usage and Automation are the computer's own pages ("Settings pages in the computer's words", below).
Back goes one page back, from a page under a section to that section and from a section to the list, Command-[ presses Back, Done closes from any page, and Command-Comma opens the list.
The list starts focused on its first row, Your computer; arrow keys move among the rows and Return or Space opens the focused section, with native keyboard focus on its controls.
The row a key moves to scrolls into view where the list is longer than the sheet.
Sections with nothing to show stay off the list, so Integrations shows once the computer answers its connections and the five computer pages show together once the computer has answered them; Your computer, always the first row, keeps the computer's name, reach, address and Leave or Forget.
Theme is this device's own (`PhoneLook`, `PhoneAppearance`): one group of tiles like the computer's (`PhoneThemeTiles`), Device, Dark, Light and the computer's built-in color themes under their makers' names, each a small window in its own colors, under a line saying it is set on this iPhone only (this iPad on an iPad) and the computer keeps its own.
It starts on Device, which follows iOS's own setting and its Automatic switching; Dark or Light sets the window's interface style, so every screen, sheet, the keyboard, the crew, card bodies and the picture viewer follow it at once.
A built-in color theme sets its base as the window's interface style and its id as the window's color theme, so all of those follow it too (`docs/themes.md`, "On the phone").
A tap applies the pick, and the left and right arrows move it from the group.
The choice is saved in the app's own defaults under the key it always had, a built-in theme by the computer's id for it and an id this build does not know read as Device, never in the connection file, so it survives a relaunch, an update, Leave, Forget, Removed and joining another computer; a reinstall resets it.
It never reaches the computer, and the computer's Theme never reaches the phone; asking the first mate to switch the theme still switches the computer's.
Under Theme, Text size is one line naming where the size of Infinitary's words is set: the device's own Text Size, or Text Size in Control Center for Infinitary alone ("Text size", below); it offers no size of its own.
Under Text size, Language names the language the phone speaks, in that language, and opens Infinitary's page in iOS Settings, where iOS sets it; the line above it says the computer keeps its own language, which the crew writes in (`docs/i18n.md`, "On the phone").
Tab or the down arrow from Theme reaches the row, Return or Space opens it, and the up arrow goes back to Theme.
Under Language, on a device that has shown a fold running down its window (an iPhone Duo open like a book), Split at the fold is this device's own switch (`PhoneFoldSplit`), saved beside Theme and never sent to the computer.
It starts on; off, the layout heeds no fold, so the open Duo lays out as an iPad does: the sidebar at the iPad's share and Home's card centred across the fold (`PhoneLayout.heeded`).
Off, the pages below never show either: a Duo open on its side keeps one column with the strip, and a record opens as a sheet, as on an iPad.
Whether the device has shown such a fold is saved too, so the switch stays while the Duo is closed, and a device that never folds never shows it.
Tab or the down arrow from Language reaches it, Return or Space turns it, and the up arrow goes back to Language.
The join part's Appearance steps drive it by keys on a simulator launched with `INFINITARY_FOLD_SEEN`, which only a simulator build reads beside `INFINITARY_ISOLATED_PHONE_TEST`, to save that a fold was seen.
Under it, on a device that has seen an Apple Pencil, Move the message box for Apple Pencil is this device's own switch (`PhonePencilTop`), saved beside Theme and never sent to the computer or another device, so a phone joined to the same computer keeps its box at the foot.
It starts on; off, the message box stays at the foot whatever the Pencil does ("Native shell and component ownership").
Whether the device has seen a Pencil is saved too, so a device that never met one never shows the switch.
Tab or the down arrow from the row above reaches it, Return or Space turns it, and the up arrow goes back.
The talk-compose part's iPad steps launch a simulator with `INFINITARY_PENCIL_SEEN`, read only by a simulator build beside `INFINITARY_ISOLATED_PHONE_TEST`, which saves that a Pencil was seen and answers that Pencil input is expected.
The launch screen, which iOS draws before the app runs, keeps the device's own appearance.
While Appearance is open the control holds focus and the left and right arrow keys move the choice, with no command of its own; an unseen shortcut under the sheet never hears an unmodified arrow.
`PhoneLookTests` holds the saved choice, and the join-read part chooses Dark on a light simulator, sees it drawn dark before and after a relaunch, and chooses Device again by keyboard.
It sits on the system's glass and opens at full height, since its ten sections do not fit half a screen.
Leave, or Forget while out of reach, is a small button in the hairline outline at the trailing edge of the computer's own row on Your computer; its alert says what leaving costs.
While the computer's Secrets are set up and open, Settings → Devices also shows Secrets approvals: the Approves secret uses switch, the code to compare with the computer's card, or that this device can allow uses, and Set up approvals again in place of the switch for a damaged record.
The phone reads its approvals again at each Secrets change the computer announces and each time it reaches the computer, from the connection itself rather than a view's restart, which SwiftUI skips when several changes arrive in one frame: each change starts a read of its own, and only the newest read's answer is shown.
While the keyboard is open, Done takes Settings' place in the leading slot and the Hide keyboard command (Shift-Command-K) dismisses it without sending or clearing the draft.
A keyboard-will-show notice brings a keyboard only when its keyboard frame has height and the view holding the keyboard's focus takes text, so neither Done nor the message box's keyboard flag follow any other (`phoneKeyboardArrives`, `phoneFocusTakesText`).
When an iPhone Duo turns or its window moves between its displays, iOS posts one with no height, or, once a keyboard has shown in the other pose, with that keyboard's frame while nothing takes text, and no will-hide follows it.
The dismissal command does not belong to the keyboard’s transient accessory view.
Apple's iPhone keyboard has no hide key and no app may add one, so while the software keyboard is up for a card's reply or the message box, a keyboard-down button sits inside that field just before its send circle, on an iPhone and an iPad alike (INF-3106, `PhoneHideKeyboard.swift`).
It is a neutral circle the size of send's, drawn on send itself so the two share one center line however many lines the field holds, and it leaves with the keyboard; it takes no room above the keyboard, so the layout around the field stays as it was.
The tabs read Home, Tasks, Activity and Panels, in that order; Panels shows only as "Panels" below says.
The wide workspace places a sidebar beside the stage, with Tasks, Activity and, when it shows, Panels as a segmented control at its top, opening on Tasks, each scrolling alone, keeps the composer at the stage's foot and shows no strip in the bar.
The window's room decides it, never the kind of device (`PhoneLayout.wide`, INF-1208's direction A): a window regular in width and height and wider than tall, so an iPad on its side and an iPhone Duo open like a book, which is a phone to the code in every pose.
A large iPhone on its side is compact in height and keeps the strip, as do portrait, narrow multitasking and a Duo closed; layout measurement excludes the keyboard.
The phone check's journeys follow the same rule: a step that differs by layout reads the layout the app shows from its window's size classes and shape (`phoneShownLayout`, and `phoneTurnedLayout` before a turn, checked once turned), never the kind of device.
They read the kind of device only for what the iPad itself has: its words, its keyboard's suggestion row and its number-pad popover.
On a foldable with panels shown, Home's column of stage, card, pager and message box keeps to the wider side of a fold that runs down it (`PhoneLayout.keepOff`), so on an open Duo beside the sidebar the card sits right of the fold and the crew scene centres there.
`PhonePagesLayout` works the inset out from the workspace's one reading of Home's room as it places the stage and the message box; no part reads the fold in its own frame and moves itself by it, since such a reading changed with the move by a fraction of a point and the layout never settled after a turn (INF-4838).
Where a fold runs down the window past the sidebar's usual share, the sidebar reaches the fold (`PhoneLayout.sidebarWidth`), so on an open Duo it fills the page left of the fold and Home the page right of it, with no strip of empty stage between them.
The split follows Split at the fold under Settings → Appearance; turning it off keeps the Duo’s unsplit layout.
It reads the window's division regions from iOS 27.1, frames that already hold Apple's margins, including an inactive fold, so nothing moves as the hinge bends, and before iOS 27.1 there is no fold to read.
A window regular both ways and taller than wide with a fold across it, a Duo open on its side, puts the sidebar's panel on the page above the fold and Home with its message box on the page below (`PhoneLayout.pages`, `PhonePagesLayout`, INF-1208's direction C).
Home's one column and the column beside the sidebar keep the stack the layout replaced: a card that cannot shrink to its room grows past the column, which stays centred, so an iPhone, an iPad and the closed Duo place it as before.
Half folded on its side, while the fold is active, the card stays on the upright half and the panel and the message box move to the flat half, where the hands are.
One layout places every pose, so a turn or a fold moves the card, the draft and the panel without drawing them afresh.
Open like a book with Split at the fold on and panels shown, the message box and its last turn sit at the foot of the sidebar's page, so the card has the whole page right of the fold (`PhoneLayout.composerUnderPanel`); every other pose keeps it under the card.
With a card up, a flat Duo with Split at the fold on folds its side panel by default in both poses.
Folded, the card uses its own reading width like a book and the available width on its side, spanning the inactive fold.
An iPad on its side folds the panel only when the stage cannot fit the card, using the Mac's 560-point threshold for a regular or unspecified card and 720 for an explicitly wider one, inside the stage gutters.
On the open Duo, Show panels beside Settings returns to the split layout; Fold panels takes it away again, and Tab and Return operate the same button.
On Home with a card showing, the same app-owned responder as crew browsing lets Tab draw the panel button’s focus ring and Return press it, yielding to text editing and sheets.
Explicitly shown panels stay open when new cards arrive, and the device remembers the choice across cards.
Without a card the panel shows; a new card waits until the panel keyboard closes before folding it automatically.
On the open Duo, when the pager and message box are on the same page, they share a row if they both fit and stack if they do not.
On the open split Duo, touching the card tucks away the last turn; a new reply or a tap in the message box brings it back.
Wherever the sidebar shares the window, an open Duo in either pose or an iPad on its side, each card's head and its thread's head carry Maximize card, outward arrows just before the minus (`PhoneCardSizeButton`), as the Mac's card does.
Maximized, the card takes the window less 16-point gutters, from the top bar to its pager, the sidebar and the message box wait hidden with their state kept, and the control reads Restore card with inward arrows (`PhoneLayout.maximized`).
The choice is saved on the device beside Theme (`PhoneCardMaximized`), so it holds from card to card, through a turn or a fold and after a relaunch; opening a task's record in the panel's place restores the card so the record shows.
It shows only while a card shows, and never on an iPhone, a closed Duo or an upright iPad, which have no sidebar beside the card.
On a foldable's pages a task's record opens in the Tasks panel's place, with a "Tasks" way back that Command-[ also presses, since the card beside it keeps Shift-Command-M for its minus, instead of as a sheet; another task's key in it opens that record there too, and an iPad keeps its sheet.
A card's task key, a panel's pointing and the crew scene's Open task reach it through the sidebar's Tasks list, which then answers them alone: the Tasks tab kept away does not (`phoneTasksTakesPoints`).
A crewmate's summary's Open task opens the record there as well, through the same path as a panel's press (`pointTask`).
On its side, open or half folded, with the keyboard up for the message box, a card's reply or a text box in a panel's own card on Home (`panelCardTyping`), the card keeps the page above the fold while the panel waits under the keyboard (`PhoneLayout.Pages.typing`).
Typing in the message box itself, the message box rides over the keyboard, growing upward with its draft and so under the card's pager where the keyboard fills the lower page.
Wherever the window has a fold, open on its side, half folded or like a book, a card's reply or a text box in a panel's own card steps the pager, the message box and its last turn aside, as on every other device (INF-3468, INF-4350), so the card keeps the room above the keyboard.
While a panel's own field holds the keyboard there, Tasks' search (Shift-Command-F included), the steer box of a record in the panel's place or a text box in one of the captain's panels (`PanelPageView`), the pages swap: the panel takes the page above the fold, and Home's card and message box wait hidden under the keyboard, draft kept and keys at rest, until it closes (`PhoneLayout.Pages.panelTyping`, `phonePanelField`).
With a record in the panel's place, Command-Return sends the steer only while its box holds focus, and the message box gives up the key while a panel's field holds focus, so the key never sends the other box's words.
From iOS 27.1 a foldable puts the bar in a vertical rail beside the content; each tab, each sheet's page through `phoneTitle` and each record page asks for the one-row bar instead (`PhoneOneRowBar`), so Settings, the strip or "Infinitary" and the computer stay in one row above the content.
A window narrow and tall keeps the system's bar, since a Duo's closed screen held upright puts the status bar in that row and leaves too little room for Settings, the strip and the computer.
A rotation moves the sidebar and the stage with its animation, and nothing else enters or leaves the window inside it (INF-1590): views that did at times left one of its animations started and never stopped, and XCTest's wait for the app to settle then never ended.
So a turn into landscape brings Home in just before its animation starts, laid out at once and unanimated, because Home put back after that animation came back short by a keyboard inset it took while out of the window.
Home brought in that way is already laid out at the new size while the window is still upright, so the workspace's fill reaches past its foot and the system's white never shows.
The bar's strip, and on the way back upright the tab Home gives way to, follow the new layout once the animation has ended, or on the main queue's next turn when no rotation runs.
`PhoneActivity` reads the computer's wording and optional task key, shows its kind dot and relative mono age, and orders newest first on both devices.
The task key sits inline before the words at micro size, as on the Mac's feed line.
It exposes the full local timestamp to accessibility.
`PhoneSymbol` supplies native outline template images for the system's tinted chrome.
`PhoneStyle` holds the shared looks: `phoneTitle` draws a sheet's title inline in Space Grotesk and asks for the one-row bar on that sheet's page, so a new sheet titled without it keeps iOS 27.1's rail, the `.phone` field style is the app's field, and `phoneSheetSurface` leaves a sheet on the system's glass on iOS 26 and puts it on the panel color with a hairline at its edge on iOS 18.
The message capsule's glass takes corners concentric with the screen's.
It also holds `SensoryFeedback.phone`, the one soft tap played when the computer accepts a message, a card's answer or reply, or a task's start, continue, interrupt or steer, and when `returns` counts the computer back; a page turn plays none.
Join, Leave and Forget ask in alerts, which keep the cancel choice in view; on iOS 26 a confirmation dialog becomes a popover that hides it, and the Join request has no button to anchor to.

`PhoneCharacter` draws the Mac's character natively with the numbers of the Mac's own character code (`src/renderer/src/character`), so the two move alike.
At rest the tesseract drifts slowly and the eyes blink every few seconds and wander; listening breathes as two counter-rotating hexagons; working speeds up with the Mac's ember, shimmer and halo, with white-hot cores.
It plays the desktop repertoire natively: greet, celebrate, ponder, confused and the five reply reactions, with the roll, yawn, orbit, constellation, Saturn, galaxy, Algol and black-hole fidgets.
The first character a person sees after opening or joining greets once (`CharacterCues.greetOnNextSight`).
A turn that starts mid-greeting lets the greeting play on as the ember eases in, then the character works, as on the Mac.
A character that leaves mid-greeting, such as the empty stage a join shows before its cards arrive, hands the greeting on to the next one shown.
The last-card fidget matches the desktop's (`docs/renderer.md`): when this phone's own choice, Done, Got it, Put aside or Keep takes the last card off Home, `PhoneCards` asks `CharacterCues.fidgetOnNextSight`, and the crew scene shown next plays one fidget from the pool, after any greeting (`CharacterMachine.stageCleared`).
A card that leaves within 15 s of this phone's press on it counts (`CharacterCues.pressed` and `clearedByPress`); a withdrawal, a close on another computer and a reply leave the scene still, and a request not taken within 3 s is dropped, so a card coming up first leaves the next scene still.
A live `firstmate_emote` reaches the characters on screen; reply reactions wait for the turn to finish, with the first request winning as on the desktop.
A reaction replayed while reconnecting is not played, even when a caught-up welcome already says In reach, and a character off screen does not keep one for later.
The wire and halo boosts come from the design skill's tokens through `scripts/generate-phone-theme.ts`, like its colours.
The crew scene draws on its own render thread, never the main thread (INF-2566, the captain's approved direction B): `PhoneSceneRenderer` runs a display link on that thread's run loop, has the painters draw the first mate, the crew, the warp, the supernova's blast and the selection and summary marks through `ScenePen`, and presents each frame on a Metal layer, so a busy main thread no longer drops the scene's frames.
The painters draw through `ScenePen`, which a SwiftUI Canvas also uses through `withCGContext`, so the character elsewhere in the app draws with the same code; the scene's halo is a three-pass box blur standing in for SwiftUI's Gaussian blur.
On the render thread the pen paints no pixels on the processor (INF-3851, the captain's "Our own graphics-chip pen"): it records each fill and stroke into a `PenBatch` of instance records, which `ScenePenGPU` draws on the graphics chip in the painters' order, straight into the layer's drawable.
A record is an exact disc, ellipse or ring (a `Path(ellipseIn:)` read back from its quarter curves, which the shader follows rather than a true circle), a line piece that knows the points before and after it so a translucent line's joints are painted once, or a convex polygon of a flattened curve; dashes are cut on the processor.
Coverage is a pixel's exact area under each edge and colours stay sRGB-encoded and premultiplied, as Core Graphics blends them, with plus lighter as additive blending.
A blurred layer, the busy halo, is drawn into a texture of its own at the resolution the Core Graphics pen chooses, blurred with the same three box passes each way and laid over its rectangle.
The shaders are Metal source (`ScenePenShaders`) compiled once per process on the render thread, so the build needs no Metal toolchain.
`ScenePenAgreementTests` draws fixed frames through both pens, every state, reaction, fidget and warp, the supernova's blast, the busy halo and the crowded scene in Dark and Light, with each built-in color theme's resting and busy first mate and its resting crowd, and requires at least 99.5% of pixels to agree within 4/255.
The main thread only hands the renderer what it shows (the roster, the state, the palette, the pan and the marks) and never waits for a frame.
That display link requests the permitted screen cadence up to 120 frames per second, with the iPhone ProMotion opt-in, and 30 while Low Power Mode is on (`PhoneSceneRate`, INF-3851).
The render thread reads Low Power Mode at each frame and changes the link's range only when the rate changes; iOS still chooses the delivered cadence under power and thermal constraints.
The clock advances by elapsed time, excludes hidden/background time and stops callbacks while hidden, inactive or under Reduce Motion, which shows a settled pose without emotes.
The character's own clock (`CharacterDisplayClock`) ticks with the display its window is on, read from the window's scene, and moves to the other display when an iPhone Duo folds or opens; it never reads the main screen, which on a Duo is the outer display even while the inner one is lit.
`scripts/generate-phone-scene.ts` generates native geometry, targets, timing and reply comparison traces from the desktop owners; the phone gate checks that they are current.
Simulator callback timings measure that run, not physical ProMotion delivery, battery use or thermal behavior.
The DEBUG-only cadence observer identifies its target drawing and records its mode, warmed heat and rotation so another window cannot contaminate a sample.
The same display-tick sample measures the isolated first mate and the production crowded scene with its real task roster, retaining drawing work, interval tails and the delivered display intervals separately.
A main-run-loop observer retains its actual before-sources, before-waiting and after-waiting timestamps for both warmup and sampling, without adding a wait or moving the 60-callback warmup, 240-callback sample or their deadlines.
The warmup and the sample each have 20 seconds on the load clock, read on the main thread that receives the callbacks, never a wall-clock XCTest wait (INF-1506).
A stall of the app itself, such as a busy Mac mini starving the simulator, counts at most two ticks, while a display link that stops delivering as the app runs still fails within the budget, and every wait ends by its wall cap.
Cadence failures name their source, phase, waiter outcome, observed and requested callbacks, elapsed time, longest callback and run-loop gaps, drawn mode counts, first unexpected mode, minimum heat and rotation endpoints.
The callback gap includes the wait's leading and trailing intervals, so a display link that never fires reports the whole wait rather than zero.
Sampling keeps its raw display timestamps and main-run-loop trace as attachments, and prints the diagnostic facts in the ordinary command log too.
A gap identifies missing main-thread progress but does not identify the blocking stack or establish a flake.
Idle cadence samples accept the character's automatic fidget, including the idle sample that requests a salute; working and listening samples gain no automatic-mode exception.
The named source and drawing scope, working heat, rotation advancement, requested-reaction presence, callback counts and budgets remain enforced.
Its accessibility value stays the state the conversation owner supplies; an emote never changes it.
The join stage uses idle; the empty stage follows the Mac's published busy snapshot and numbered busy events, never typing or a crew count.
Homes on `SCENE_OBSERVATIONS_SINCE` (`src/shared/contractFeatures.ts`, major 12) or later, and older homes that advertise `native-scene-observations`, answer `inf:conversation:state` and the public `inf:computers:presence` read/push; the latter contains only each work computer's id, name and reach, never addresses or management facts.
A numbered push supersedes an older pending read; an older home retains event-only busy observation and unknown remote reach without sending unsupported requests.
Joining shows only the first mate until real board facts arrive, and the accessibility value names unknown conversation activity until the home supplies a reading.
`PhoneCrewScene` renders home's formation and every other computer's at the desktop's share of it in a continuous native scroller, with touch panning and arrow keys rather than paging or shrinking the entire scene, and no scroll bars.
The scroller is the stage between the top bar and the message area, and it keeps the touch; the drawing is Home's bottom layer across the whole window (`PhoneSceneBackdrop`, INF-3462, the captain's "never clipped" and "it can sit underneath other elements").
The stage hands its frame and the drawing's inputs up as a preference, and Home draws the scene from them under the top bar, the reach line, the last turn, the message box, the sidebar and the keyboard, so a short stage, as with the keyboard up or a phone on its side, cuts nothing flat.
The first mate still sits in the middle of the stage, so it moves up with the keyboard.
On Home the reach line has no band of its own, the message box's glass blurs the crew that pass behind it, and the captain's bubble in the last turn is solid in the colour it always showed, so the crew behind it are hidden.
With a card up the stage leaves Home, and nothing is drawn.
The phone draws the desktop's orbits at `PhoneSceneRoster.ringScale`, derived so that eight crewmates on the first orbit stay inside the narrowest portrait iPhone (375 points), the captain's ask.
Crew glyphs keep the desktop's size: home's crowded glyph (`PLANES_GLYPH_PX`), and in another computer's cluster the smaller glyph `CLUSTER_LAYOUT` names, smaller again once that cluster holds more than its `crowdedCrew` (INF-1854).
Crew sit on the desktop's growing two-orbit ring (`docs/crew-orbits.md`): the first orbit widens with each crewmate up to its seats, the next arrival opens the second orbit inside it, and no third orbit opens.
`PhoneSceneRoster.SeatBook` remembers each crewmate's orbit and seat across board reads as the desktop's orbit does, logical membership counting every running part for allocation and growth, and each computer's area follows its first orbit's size.
`PhoneSceneMotion` keeps separate drawing seat books: only visible main-orbit occupants take angular seats, including program rings but excluding program parts and circling crew (INF-1375, approved A).
`PhoneSceneCompanions` reads published wait/review facts and reproduces the desktop's eligibility, three-companion limit, perpendicular 64-scene-pixel circles, 24°/second travel and the circle's full radius wherever its blocker sits, past the scene's edge or over another computer's column (`PhoneSceneCompanions.radius`, INF-5726), at the phone/computer scale.
Returning crew open a seat among visible survivors on the same logical orbit; a fallback crew member takes part in main-orbit spacing.
A re-spaced or resized orbit glides its crew around it, and neither orbits nor another computer's center are outlined.
A crewmate the Tasks list shows under Pinned, a program's parts on their rings left out, hangs as a fixed star (INF-3634, `docs/crew-orbits.md`, "Fixed stars"): `PhoneFixedStars` places the desktop's constellation from the desktop's own numbers, each computer's group over its own orbits at its share, and the group's area grows to hold it.
A star gives up its drawing seat but keeps its orbit, eases there and back at the desktop's rates, neither circles nor is circled, rides no warp, and wears the desktop's glint, joined to its corner's neighbours by a hairline under the crew; a settled frame holds it still.
The crew summary shows a filled pin beside a pinned task's key.
`PhoneOrbitSeatsTests` replays the desktop's own seat choices, recorded by `scripts/generate-phone-scene.ts`.
`PhoneFixedStarsTests` replays the desktop's own star places and settled stages, recorded the same way.
`PhoneCardDepartureTests` replays the desktop stack's own choice of the card that comes up after a close, recorded the same way.
Its native Browse crew command, Shift-Command-C, enters app-owned browsing with an accent viewport outline; arrow keys pan it, Tab selects a real crewmate and Space opens that crewmate's preview.
While a crewmate's summary sheet is open, or browsing selects a crewmate, the scene lights that crewmate's project on every computer: every other project's crewmate keeps a quarter of its light, as on the desktop's stage, and nothing moves (INF-6951, `PhoneFocusLight`, a port of the desktop's `focusLight.ts`).
The quarter comes from the desktop's `OUT_OF_FOCUS_LIGHT` through `scripts/generate-phone-scene.ts`, the light eases over the surface move (`PhoneTheme.surfaceSeconds`, `--dur-med`) on the display's clock even while the open summary holds the scene's clock, and it is a cut under Reduce Motion; `PhoneFocusLightTests` replays the desktop's own light for one board.
The phone has no project focus of its own, so closing the summary lights every crewmate again.
While browsing, a scene-owned responder holds first-responder status and offers those unmodified keys as priority key commands, because SwiftUI shortcuts for them lose to the system's focus and text handling.
Each crewmate and program answers touch across its 44-point square, not only the drawn circle.
One UIKit view under the scene (`PhoneSceneTouches`) answers touch and accessibility from the frame the render thread last drew, read only when a touch or an accessibility query arrives, rather than a SwiftUI button laid out for each crewmate on every frame.
A tap opens the crewmate the frame on screen at touch-down drew under the finger, from the last half second of drawn frames, because the crew keep moving on the render thread before the tap is recognized as the finger lifts.
The touch-down is the one the tap recognizer receives as the finger lands, never the view's own: the scroller holds a touch back from the view, so a quick tap would be recognized before the view heard it land, and a drag the scroller takes over would leave its own landing for the next tap.
Where two squares overlap, each point belongs to the nearer center (`PhoneTouchCell`), so a tap on a crewmate's own center always reaches it.
Selection has an accent outline and an accessibility value; Tab brings it into view without relying on SwiftUI's platform-focus reporting.
Escape, editing, a preview, a task record, leaving Home or backgrounding stops browsing and releases that responder, so the unmodified commands do not take over other controls.
Each crewmate retains the published tier, work posture, computer and review identity; programs draw only their live parts, circling each program's mark on the desktop's tilted moon rings, with the gem inside the mark wired by the whole program's share finished.
A crewmate whose task is in the phone's Waiting on you group wears the desktop's beacon, the ring that breathes round it, from the same generated numbers (`captain`), and holds it whole at mid light on a still frame (`docs/crew-orbits.md`, INF-1543).
A crewmate's summary opens in the system's standard sheet (INF-1926): it is the desktop's crew summary in its words, order and marks at 14 points, the board row at once and then the task record's own read, polled each second while it is open.
Like the desktop's, it stays short (INF-2528): the status keeps its short reason, Blocked by names keys only, and the footer is one row, the model with its intelligence badge, then the change with its checks as one state and its time (`#813 running for 11m`); a long model name gives way first, down to its label's width, then a long branch name, each ending in an ellipsis inside the row, and a review takes a second row.
What it leaves out is on the native task record's Info, as the Mac's record shows it: each task it waits on, the reasoning level with its note, and the checks with their counts and any reason they could not all be read.
`PhoneTaskFacts` in the shared package ports the desktop's facts (`taskFactsOf`, its status, checks and plan), and `PhoneTaskFactsTests` replays the desktop's own readings, recorded by `scripts/generate-phone-scene.ts`.
The native task facts and crew scene decode the host's `maintainers` flag and show the same localized maintainer-wait reason while the contribution is idle.
The sheet closes the standard way, by a tap beside it, a swipe down or Escape, with no close mark; while it is open the scene stands still where it is, and the crewmate it describes wears the desktop's corner brackets.
A running part, a blocker, the task a review checks or a part's program shows its own summary in the same sheet, and Open task swaps the sheet for the existing native task record, or on a foldable's pages closes it and opens the record in the Tasks panel's place.
The computer preview names the computer's work and its state.
More than ten running parts take the desktop's second ring, turning the other way, keeping the desktop's spacing without shrinking the parts, and a part's report flies to its program's mark.
A program seen running keeps its ring on each observed computer between stages, without finished, unstarted or remote-placeholder dots.
Its summary counts finished, running and waiting work, shows their shares and names each running part and where it runs.
The panned extent stays stable while work departs, and cross-computer flights reach the first mate with the desktop's distance-based timing.
`PhoneSceneViewport` alone owns placement: it centers home on entry or reconnection and preserves the viewed world point as the roster or viewport changes; the scroller's resize anchor does not add another adjustment.
Initial rosters and reconnects settle in place; an unreachable computer freezes its unknown activity, and hidden scenes discard transient report, steer, failure and usage effects.
Seats and program rings are prepared with the roster, outside the display callback; only the drawing subtree reads the clock.
No joining time is invented.
Joining still confirms the link's computer address, not a name obtained before authenticating that computer.
The details sheet names the connected view's ability to answer cards, send messages and control tasks, or explains read-only access when the Mac requires an update.

## Panels

The captain's panels show on the phone on a fourth tab, Panels (INF-3830's plan, the captain's answers entry=tab, computer=stay and layout=column): the computer button keeps its place in the bar.
The tab shows while the computer serves panels to a phone, which major 16 or later implies and an older welcome says with `panels-on-the-phone`, and has one its rails would draw; with no panel or with an older computer the bar is as it was, and a tab that loses its last panel gives way to Home.
With panels switched off on the computer the captain's own panels leave, while the app's own it shows stay, as on its rails.
It draws every panel a rail on the computer would draw - present, built and not hidden - one under another in one scrolling column at the reading column's width, in the order the computer's rails hold them read left top, left bottom, right top, right bottom.
The phone keeps no arrangement of its own, so `PhonePanelOrder` reads the desktop's `arrangePanels` over the computer's layout (`inf:shell:preferences`), and `PhonePanelsTests` replays the desktop's own reading of the same layouts, which `scripts/generate-phone-scene.ts` records.
The column also draws the app's own panels the computer shows (INF-6295, `PhoneAppPanelList`; `docs/view.md`, "The app's own panels on the phone"): Knowledge, Automation and a built-in runbook's panel such as Batches, each while its gate on the computer is open, from the desktop's own panel code; the Tasks panel and the Activity panel stay out, since the phone draws them as its Tasks and Activity tabs.
Each panel sits under a header row of its title in capitals, its status mark when the computer has something to say about it, and an added plugin's name as its owner word, none for the captain's own or the app's own, with a chevron that folds it; a fold is kept on the device for that computer, so it stays folded after the app is closed and opened again.
The panel's own header buttons sit in that row beside the chevron, drawn with the system symbol nearest each desktop icon (`PhonePanelHeaderButton.symbols`), as the desktop's rail draws them (INF-3830 piece 3).
A button that names a card puts that card up at the front of Home, whether the panel is folded or not; a button that asks the panel itself shows only while the panel shows its body, and its page hears each press as the desktop's view state counts it.
A content panel is as tall as it draws; a fill panel takes most of the column's height and scrolls inside itself.
A panel whose own code decides whether it shows (`rail.show`) runs out of sight until it says so, and the tab counts it only once it says it shows, so the tab never opens on an empty column; one that later says it does not leaves the column, and the tab with it when it was the last.
The status mark is the desktop's (design skill `Panel.prompt.md`, "The status mark"; `PhonePanelStatusMark.swift`): one small dot on the title's line, open or folded, in the desktop's tone and order, for background work the computer stopped or paused, reads that keep failing (`docs/personal-panels.md`, "Reads that keep failing"), or an integration call waiting on the captain or turned down (`PhonePanel.statusSections`).
VoiceOver reads its most urgent line, and a tap opens the desktop's details as a popover: each section's sentence and its button, Retry, Update panel, Ask the first mate or Ask again, which native code sends once on the desktop's own channel; the panel's page can ask none of them.
A panel whose background work stopped keeps its drawing, and Retry asks the computer to start it again; a panel whose page stops answering, or whose web process iOS ended out of sight, is drawn afresh on its own the first time after each start, as the desktop does, and a second stop before it has answered steadily says so with Retry, which draws it afresh; and a panel whose files could not be used says it could not be opened, and why.

Each panel is one nonpersistent web process (`PanelWebHost`, `PanelWebView.swift`).
Its trusted parent page runs only the bundled `PanelHost.generated.js`, built from `ios/Infinitary/CardRuntime/panelHost.ts` by `scripts/generate-phone-cards.ts`, which builds the panel's document with the desktop's own owners (`buildPanelDocument`, `panelFrameCsp`, the panel stylesheet) and frames it in a sandboxed frame at the panel's own host.
It answers the panel with the desktop's own frame controller and read executor, presented as the desktop window presents them.
Native code serves the frame only the panel's own files (`inf:plugins:files`) and the library they were built for (`inf:plugins:library`), pinned in its import map: the library is checked file by file against the pins the computer names, refused whole when one fails, kept on the device one copy per version and checked again when read back.
One of the app's own panels takes its files from `inf:plugins:app-panel-files` instead, each checked against the pin the computer's build gave it and refused whole when one fails, and kept on the device as the library is, one copy per panel and version, checked again when read back (`PhonePanelFiles.load`); its page calls no integrations, as on the desktop.
The parent page's asks reach the computer only on the channels `PhonePanelRequest` lists, which `scripts/generate-phone-contract.ts` derives from the panel reads and the panel channels a view may ask; an ask that names a panel names this one.
A read waits for the computer to be in reach and asks again after a reconnect, so a panel out of reach keeps what it last drew; a press, a store write, a fetch or an integration call is sent once and never repeated.
Neither realm reaches the network or the app.
The pushes a panel hears (`PhonePanelRequest.pushes`) reach every drawn panel as they land, and a reload of what the phone held runs every panel read again.
A welcome's replayed pushes are held with the catch-up instead (INF-6817 piece 2): once the replay is read, or the connection ends first, each drawn panel hears them all in order in one call (`window.phonePanel.pushes`), so its reads run once for the replay rather than once an update; a live push still reaches it alone.
A panel's own cards show on Home after the computer's cards (`PhonePanelCards`, `PhonePanelCardPane.swift`), held on the phone only, with the desktop's rules from `src/renderer/src/app/stackActions.ts`: a card put up from the captain's own tap comes to the front, one put up otherwise waits behind the card being read and counts as new, an open id is revised in place keeping its kept place, and a panel has at most the desktop's number of cards open.
Each card shows its title, its owner word and a Hide minus (Shift-Command-M) over the panel's own card view (`cards/<view>.mjs`), which the same parent page frames with the card's data, revision and kept place; only the shown card runs a page, and a card's panel leaving the computer's list takes its cards with it.
The shown card's page hears the same pushes and reloads as a drawn panel, so its reads and its panel's store follow the computer while it shows, as a card view does on the desktop.
The computer never hears of these cards: Home names no panel card as the card being read.
A panel that reads the board may point at the phone's own things only from the captain's own tap in its page, read as the card page reads one (the page has focus and the browser's user activation): `openTask` opens the task as a Tasks row's tap does, `openRecord` opens its record, and `showCard` brings one of the computer's cards forward on Home; the phone keeps no pointer rest, aim or project focus, so those answer nothing.
Every panel, whatever it reads, also has the two pointings every desktop panel has, from the captain's own tap in its page or one of its cards: `draft` puts its words, checked by the desktop's rule (`panelDraftSchema`), at the start of Home's message box, unsent, and shows Home, as a card's draft button does; `openSettings` opens the phone's Settings on a section it has, by the desktop's section id, `subscriptions` opening Intelligence (`PhoneSettingsPlace`).
An item opens an automation's own page in Automation or a project's in Projects; any other item, a kept job's included, is ignored and the section opens, as a desktop section ignores an item it does not know; a section the phone's Settings does not have, such as Secrets, Keyboard or a plugin's, opens nothing and answers false.
A section opened this way before Settings has read the computer's pages waits for its answer instead of falling back to the list.
Task moves (`moves`) are not offered to a panel on the phone yet, so its page refuses them as actions it was not given.

## Talk and tasks

The message box keeps the conversation's last two rounds above its native multiline field, by the Mac's rules and in its Chat layout (`docs/composer.md`, "The last turn" and "The conversation"; INF-1517, INF-1771, INF-6337): the captain's words in a grey bubble on the right, each reply beside the first mate's mark on the left, the older round at half strength and only the newest while a card is up or the box stands at the top for Apple Pencil.
A round is a message to the first mate, the captain's press of a card's own button, or a line typed under a card; the strip reads the newest two from the computer's paged conversation (`inf:conversation:thread`, limit 2) on reach, after each message or reply, and when the cards or a card's thread change, and takes each message's reply line from the last turn, which a live reply reaches first (`PhoneConversation.strip` in the kit, its test `PhoneConversationTests`).
A computer from before the conversation refuses that read, and the strip then shows the last turn's two messages as before.
A card round is one row: a card glyph and the card's title, then the button's own words in an outlined bubble or the typed words in the filled one; a line typed under the first mate's own card was also a message and keeps its reply line under the row.
Every tap on a round, the card's title included, opens the conversation at that round, and the card itself opens from its tile there (INF-6623's plan).
The phone sets them as a quiet glance (INF-1846): 15-point rows, one step under the box's 16-point words and one line each, the bubble hugging its words up to three quarters of the column, each reply in the secondary colour on a 24-point row pressable across its width, 4 points within a round and 12 between rounds and above the box.
A line too long for its row ends on the last whole word that fits beside the ellipsis, by the Mac's rule (`WholeWords` in the kit, its test `WholeWordsTests`); on iOS 18 to 25, where the text's own font cannot be read, a line keeps the text's own cut.
While the first mate is busy its line shows the mark turned ember and spinning, beside Working… or the reply, and a newest card round that was no message starts its row with that mark and no words; a message that was only photos reads "A picture".
Once the newest round is complete on screen for 15 seconds (a completed reply, or any card round) the older round fades over 0.7 seconds, an instant under reduced motion, keeping its room so the input never moves; the count runs only while Home is shown, the app is in front, the phone is upright and the first mate is idle.
A tap anywhere else on a round opens the Conversation sheet at that round, with its medium and large sizes, the page size on an iPad, and Done dismissal.
Its Everything view draws every round oldest first with day and time marks, the captain's words whole, the first mate's whole replies, a card's tile before each act on it and the card author's answer under a line typed there; scrolling to the top reads the page before (30 rounds a page).
Its Cards view lists the cards waiting on the captain, newest first and those put aside included, then the cards they answered, each once with their newest act on it.
A tile opens its card on Home: one on the stage comes forward, one put aside comes back first, and an ended one opens as a past card; once Home showed the card and it left, the Conversation comes back on the view and place it was left at.
Reading the Conversation sends nothing; with a computer that refuses the read it shows the last turn's two messages and says only those could be read.
Its component owns messages and photos; the shared shell places it at the foot of Home, or at the top while Apple Pencil is in use on an iPad (the Pencil paragraph under "Native shell").
A send carries the visible entry’s `visibleCardId`, `pastCardId` or `taskId` through the published conversation request as a hint, never as the message’s topic.
The native multiline field uses the keyboard’s own dictation; Infinitary adds no speech model or microphone permission.
Photos uses the system library picker, converts selected images to orientation-correct JPEG thumbnails up to 2,048 pixels, and bounds each attachment and turn by the published limits.
Selected photos appear as removable chips; a send clears the box and its photos at the tap, and a refusal puts them back in front of anything typed since.
The newest message may be taken back for its first minute by the Mac's rules (`docs/composer.md`, "Taking back"; INF-6763's plan), once the computer lists `take-back-message` and while changes are on (`ReadOnlySession.canTakeBack`, `PhoneTakeBack` in the kit).
While it may, a revert icon (`arrow.uturn.backward`, no words of its own; the captain's words on the plan: "don't make the button literally "take back". use a "revert" icon or something like that") stands just left of its bubble in a 44-point touch area, labeled Revert your last message, and a long press on the bubble offers Revert your last message and Edit your last message; both leave when the minute ends, and never stand on a card round or the older round.
Revert sends `inf:conversation:take-back` and the round reads Reverted at the tap, settling on the next last turn, which the phone reads again; a refusal takes it back with the Mac's words.
Edit puts the message's words in the box, in front of anything typed, marked Replaces your last message with a cross that drops the mark and keeps the words, so the next send goes as a new message, as Esc does on the Mac; an emptied box drops the mark too.
A mark already shown stays even if the minute ends while the captain edits, as on the Mac (`docs/task-capture.md`, "Taking back a message"), and goes once that message is no longer the newest or is taken back (`PhoneTakeBack.replaces`).
The send carries `replaces`, so the computer takes the old message back as it keeps the new one, and the strip shows both at the tap.
A message taken back reads Reverted before its faint bubble, its words struck, on the strip and in the Conversation, and a replacement folds the words it replaced under Edited in the Conversation; a reply withdrawn before any turn read the message reads Reverted before your first mate read it.
Command-Return sends from either message field; native controls retain hardware-keyboard focus, VoiceOver and Dynamic Type.

The Tasks tab is the Mac's Tasks panel in a phone's hands (INF-2928, the captain's direction A): its groups, order, rows, search and tap are the Mac's (`src/panels/now/rows.ts`), ported in `PhoneTaskList`.
Its five groups come from `src/shared/nowPanel.ts`, generated as a finite native lookup with seven inputs, so the phone does not own another grouping rule.
The phone keeps a working parent and its live parts together, hides dropped rows and closed ordinary operations from the groups, and keeps them searchable.
Only the groups with tasks show.
Pinned comes first, never folds, and holds every task the captain pinned, whatever its state or age, in the order it was pinned, newest last, as on the Mac (INF-3127); a pinned task's parts list under it there and nowhere else, each still unpinned (INF-3512), except a finished part not pinned itself, which stays in Done.
Waiting on you, Working and Queued always show their rows, under a micro uppercase label with no count; Backlog and Done fold, start folded and show their count, and Backlog adds "· N could not start" and "· N new".
On a home on major 16 or later, or one that lists `board-without-closed`, the phone's first board read leaves out the week's closed rows (`docs/task-retention.md`, "A view's first board read"); Done counts the rows left out, and opening Done, a search or a task the light board lacks reads the whole board once (`ReadOnlySession.readClosedRows`).
Rows follow the Mac's order: priority, then oldest first, with Done newest closed first and a part indented under its parent in the same group, up to three levels.
Each row shows the Mac's status mark (`PhoneTaskMark`), the key, the title and the Mac's one dim word: starting, could not start, checks, waiting, blocked, held or found on another task.
A title takes up to two lines on an iPhone, which has no pointer to show the rest, and one on an iPad, as on the Mac.
After the title a row names neither its project nor where the task runs, as on the Mac; only when that computer cannot take work does it end with out of reach, takes no new work or connecting, kept whole beside a long title, while its spoken label still names the project and the computer.
Only a Queued row shows the home’s dated `queueWait` line below its title, without rewording it or deciding readiness on the phone.
The row words come from `src/panels/now/words.ts` through the generated `PhoneTaskRowWords`, and `PhoneTaskListTests` replays the desktop panel's own reading of one board, recorded by `scripts/generate-phone-scene.ts`.
A card put aside on the Mac lists its task under Waiting on you by the Mac's `presentTask` rule, which `PhoneBoard.presenting` follows; a card with no task gets its own row titled by the card.
A tap follows the Mac's order (`openTask`), which `PhoneBoard.opening` holds: a row whose task has cards put aside first brings them all back on every Mac.
Then it shows on Home the first of these: the decision the task waits on; the card of a required step put off, which the Mac's `show-card` move puts up again; the newest card the task owns or waits on that is on the stack and not ended, a note or a card replied under included.
A row with none of these opens the task's record.
While the phone cannot make changes, it brings nothing back and shows again no step put off, so a row shows only a card already on the stack.
A first mate question is the one exception: its card shows no task key and the phone's cards have no Info tab, so its row opens its record, where Decline is.
A search keeps the groups, opens every one, matches the title or the key as the Mac's does, and adds Earlier with the Mac's older closed matches, newest closed first.
Under the field sits the Mac's tag row while the only project with tags that is not archived has them, since the phone keeps no project focus (`docs/task-tags.md`): All tags, each of its tags with how many open tasks pressing it would list, then No tag (`PhoneTaskList.tagChips`, the Mac's `tagChipsOf`).
One chip is pressed at a time; it narrows every group, Pinned and Earlier included, opens the folded ones as words do, and keeps the search shown; closing the search, or the project losing that tag, lets go of it.
`PhoneTaskListTests` replays the Mac panel's own readings of the tag row and of a pressed tag.
The search waits above the list until the list is pulled down from its top, as the Mac's waits behind its icon.
Find a task (Shift-Command-F, the Mac's key) opens it with the caret in the field; Close search, or Escape on an empty field, puts it away.
VoiceOver cannot pull past the top of a list, so the search is always shown while it runs.
A long press on a row stands in for resting the pointer on the Mac's row (INF-2928 piece 3, the captain's pick): it shows the task's crew summary with the row's moves under it.
The summary keeps the width the Mac gives it there (`CREW_HOVER.maxWidthPx`), never wider than the list, and shrinks whole when an iPad gives it less room beside the menu.
The moves are the Mac's task board menu for that row (`boardMenuOf`, `src/panels/now/boardMoves.ts`) with every control the Mac's Tasks panel shows on that row while the pointer rests on it (`rowControlsOf`, `src/panels/now/rows.ts`), so a long press offers at least what resting the pointer there does.
In order: Open record, Show the card while a decision waits, Continue on interrupted work, Queue it or Back to backlog on open work, then Start on a Backlog row and Start now on a Queued one, Back to backlog on started work, Pin or Unpin, then Drop task last.
A Backlog row's Start, a pinned task's too when it would list in Backlog, is the Mac row's own (`rowStartOf`) in the board's Start now's place: Start, or Try again after a start that failed, whose line says it runs at once as the board's moves say theirs, or dim with the record's reason when it cannot start.
Each move names what it does, or stays dim with the Mac's reason it cannot run, and the computer checks it again when it runs.
As on the Mac, Pin, Unpin, Back to backlog and a Backlog row's Start run at once, Queue it runs at once or asks once when the task could start at once, and Start now and Drop task ask once.
A never-started task's Drop task asks in the record's words, from the effects its record lists when it is pressed; Start, Start now and Continue show the task starting at the tap, as the record's Start does.
A row the Mac's board has no menu for, Done and Dropped among them, offers Open record, then Pin or Unpin, as the Mac's row does whatever the task's state.
A refused move says why in the change notice, or on the list's own line on an iPhone on its side.
A swipe toward the leading edge on a Backlog row shows the Mac's row Start (`rowStartOf`) at the trailing edge: Start, or Try again after a start that failed.
One press starts the task with no ask, as on the Mac, and the row shows Starting at the tap; a Start that cannot run stays dim and the Mac's reason shows under the row.
A tap on a row held open closes its Start instead of opening the task.
`PhoneRowMoves` in the shared package ports these rules, their words come from their Mac owners through the generated `PhoneRowMoveWords`, and `PhoneRowMovesTests` replays the Mac board's and the Mac row's own readings, recorded by `scripts/generate-phone-scene.ts`, and fails when the Mac's row shows a kind of control the long press does not know.
The task record follows the Mac's record card (INF-2928 piece 2, the captain's direction A) and opens as a sheet, as before, except on a foldable's pages, where it opens in the Tasks panel's place.
Its top row is the Mac's status pill, with the Tasks list's mark and word, then the pill's reason in its tone and the key; the title sits under it.
While a start is in flight the record says Starting with no wait line under it, as the Mac's host leaves the start wait out.
Its tabs are the Mac's: Info, Cards with its count, Activity and Crewmate, each shown only when the Mac shows it; a task with only Info shows none.
Info follows the Mac's order: what needs attention, a charted filing's Why, how a closed task closed, then Part of, Waits on, Holds up and Parts, each key opening that task's record in the same sheet, or in the panel's place on a foldable's pages.
The goal follows with the captain's words folded under it, then Project, Tags, Now and Progress, the row of facts (Model, Reasoning, the pull request with its checks, Review, Delivery and Runs on) and a closed More with the crewmate, the branch and the task's policies.
Cards lists every card the task showed, newest first: an open card shows on Home, one put aside comes back first, and a closed one shows as a past card.
Activity takes the old timeline's place: the task's activity oldest first, the last eight with Show earlier for the rest, each row with its age, its words, the task it came from and the events folded under it.
Info, Cards and Activity end with the Mac's record bar (`recordBarOf`): Drop task, or Decline for a first mate question, at the leading edge, and Start, Try again, Starting, Start again, Continue, Show the card or Done at the trailing edge.
A start that could not begin says Could not start and its reason above the bar's buttons, where the Mac says it between Drop task and Try again, and never beside the pill; both read it, and the pill's reason while a start is in flight, from the Mac's `recordStartOf` (`src/shared/recordStart.ts`).
Drop task asks once in the Mac's words before it drops, naming the tasks still waiting on the work and the ones already working, and says why instead when the record changed or a part is still open.
Show the card asks the Mac to show it again, then takes the captain to Home with that card.
The Crewmate tab reads the redacted session and live words from their Mac owners and ends with the Mac's status line: Working with how long the turn has run and Stop, Paused while the captain holds its browser, Waiting on you or Idle.
The message box sits under that line; a closed task shows its session as it ran, with no message box.
As on the Mac, the tab opens at its end and follows it while the captain reads there, keeping the newest line in sight as the keyboard shortens it, and stays where the captain scrolled otherwise.
`PhoneRecord` in the shared package ports the record's rules, its words come from their Mac owners through the generated `PhoneRecordWords`, and `PhoneRecordRulesTests` replays the Mac record's own readings, recorded by `scripts/generate-phone-scene.ts`.
The open record refreshes once a second, as the desktop transcript does, and no hidden record polls.
Start, Try again, Continue and Start again use the Mac's own moves; Stop and Steer use the existing captain-owned task channels, never a phone worker.
Stop ends a running turn and keeps its task steerable; Continue is offered only when the Mac marks a task Interrupted, such as after recovery.
Unlike the Mac's, the record stays open after Start, Start again, Drop task and Stop, since it already shows their result.
Tool results open on demand through their published read.
Tags shows the tags the task carries, or No tags, once its project has tags or it carries one, as the Mac's record does; the phone offers no Edit tags.
Browser pages, Move to a computer, Knowledge used, Why this model and rich transcript pictures remain outside this piece.

A mutation requires both **In reach** and the welcome’s `full` access.
The phone connects as a view, and its hello says its build's view floor (`viewFloor`, generated from the published contract), so it keeps changing things across majors that kept views, in both directions (`docs/contract.md`, "The version rule").
Outside that window the line under the message box names the older side (`PhoneUpdate`): "Update Infinitary on this phone to make changes." when the computer is newer, and "Update Infinitary on your computer to make changes." when it is older.
A computer on major 16 or later, or one whose welcome lists `messages-while-reading`, still hears the phone's plain words outside the window (`messagesWhileReading`): the message box stays on, photos stay off, a message goes as one plain string, and the line instead says "Your first mate still hears your messages.
Buttons come back once Infinitary on your computer is updated."
(or "on this phone").
Card buttons, replies and task controls stay off.
Every request has one connection-bound response and a bounded wait; a disconnect, timeout or unreadable mutation response leaves its outcome unconfirmed.
The phone never queues or retries a mutation after reconnecting.

### Updating the computer

The phone sees and starts the computer's own update through the same requests as a Mac that controls it (`docs/view.md`, "Updating the first mate's computer"), where the computer's welcome lists `home-update` or speaks a later major (`homeUpdates`).
Settings → General shows Infinitary on the computer under the phone's own version, with where its update stands and Update or Update later (`PhoneHomeUpdateControls`, `PhoneHomeUpdateViews.swift`).
The line under the message box shows the same while the versions differ, an update moves or the last one failed: "Mac mini has 0.7.2-alpha.590 ready." with Update Mac mini, then Saving work on Mac mini with Update later, Restarting, and Resuming work (`PhoneHomeUpdate`, `PhoneHomeUpdate.swift`).
Update asks first in a confirmation naming the running work that finishes before the restart, how many background jobs stop, and that it cannot be undone from the phone if the new version does not start.
While it moves the phone reads again every few seconds; a computer silent for a few minutes after it began restarting says someone needs to check it at the computer.
A refused or unconfirmed press says so on the line and is never repeated on its own.

### Changes show at the tap

Every change the captain makes on the phone shows at once and settles on the computer's own evidence (INF-2553, the captain's direction B).
The session (`ReadOnlySession`) keeps the computer's last snapshots untouched and a ledger of pending intents (`PhoneIntents.swift`), and every screen reads the snapshots with the intents drawn over them in the order they were sent.
A close or a choice takes the card off Home and the next card is up; putting a card aside moves it to its task row, and bringing cards back puts them on Home with the first one up.
A reply joins the card's thread marked Sending… where its time will be, and the draft and photos clear.
A message clears the box and stands as the last turn, marked Sending… until the computer has it.
Taking a message back, by the revert icon or a replacement's send, reads it Reverted at once, and settles on the last turn that marks it taken back; a last turn without that message voids it.
Start and Continue read Starting on the record and its row, Stop reads Stopping, and a steer shows in the transcript marked Sending… as its draft clears.
A shown, drawn card's sighting reads at once, so it leaves the new count and the chevrons' dots and N new walks on to the next card before the computer's seen mark comes back; a sighting the computer did not take leaves the card new, with no notice (INF-4541).
An explicit Done or Decline shows its selected ending on the record and row at the tap, and settles only when the home's task reading carries the matching status and reason.
Putting any card aside predicts its minimized state, and a note's own Got it, in its pinned row under the hairline, predicts its acknowledgement (INF-2794); neither predicts a task ending.
With an older computer whose note corner still reads, the minus predicts that acknowledgement as before.
A snapshot that holds the change retires its intent with nothing moving.
A reply or a steer is held once the thread or transcript has more of the captain's messages than it showed at the tap, and a message once the last turn follows the one shown at the tap, since the computer writes the words its own way (trimmed, with a line for each picture).
A snapshot whose card or task changed under the intent, such as a revised offer or a closed task, voids it quietly.
A refusal takes the change back: the card returns to its place in the stack, the draft returns, and a short notice where the captain is says the computer's words, a pill at the top of the tab or a line at the record's foot, leaving after eight seconds or on a tap.
An iPhone on its side has no room for the pill, so the same words stay on the place's own line until that place's next change or the upright pill shows them, as a refusal's did before: a card's line, whether or not it is the card up, the Tasks list's line for a card put aside again, and the composer's line for a message.
An accepted change waits up to 15 seconds for the snapshot that shows it, then goes quietly, even when the phone reconnected meanwhile.
A change whose answer was lost to a disconnect stays shown until the first snapshot after reconnecting, which retires it or takes it back with "Could not confirm the change.
Check your computer before sending it again."
A push the welcome replays can predate the change, so it only retires; the snapshots that can take a change back are the reads after the welcome and the pushes newer than it.
A replayed push never stands in for the reads sent at the welcome, so those reads still settle a lost change.
A reply, message or steer the computer refused or never took stops counting toward the later ones in its place, so each still settles on its own entry.
Nothing is queued or sent again.
The computer sends a choice's or close's cards to every view before it answers, so a view settles without waiting out the stack's coalescing.
The intent table (`src/shared/intents.ts`) names each kind's prediction and evidence for every view, and its fixture (`InfinitaryKit/Tests/InfinitaryKitTests/Fixtures/PhoneIntents.json`) is replayed by the phone's tests and the shared ones, so a view that takes the table predicts and settles a tap as the phone does.
A native draft, last turn, task and transcript are never written to the phone’s saved connection file.

A new card or an answered reply raises an in-app notice while the app is open, after reading the Mac’s Notifications switch.
The notice is a pill at the top of every tab, interactive glass on iOS 26, a New card or Reply label and the card's title; a tap opens that card on Home, and a swipe dismisses it.
It sits under the top bar, over the stage beside the landscape sidebar, and waits while an iPhone is on its side.
A reply notice leaves after five seconds unless VoiceOver is running; a new-card notice stays until its card is read or the pill is swiped, and no pill points at the card already on the stage.
The first snapshot and a reload seed the notice history without announcing old cards; a body-only revision is not new news.
The end of the app's background time stops the connection and clears the notice.
While Infinitary is closed, the same moments reach the phone as notifications, below.

## Card pushes

The phone shows a notification for each new card and each answered reply while Infinitary is closed there (INF-4774's approved plan, INF-4794).
The computer seals each one for this phone alone and posts it to Infinitary's relay, which wakes the phone through Apple; the computer's half, the shapes and what the relay receives are `docs/phone-push.md`.
`PhonePushes` (`InfinitaryKit/Sources/InfinitaryKit/PhonePush.swift`) holds the phone's half, and `PhoneAppDelegate` (`InfinitaryApp/PhonePushApp.swift`) hands it what iOS gives the app.

Once after joining a computer whose welcome lists `phone-push`, the phone asks in one sentence whether to get a notification for each card, saying the computer seals each one for this device and the relay cannot read it.
Turn on goes on to iOS's own question; Not now is kept, so the phone does not ask again, and Settings → Devices → Notifications offers Turn on later.
That row says whether notifications are on, or off in the device's own Settings with Change in Settings opening Infinitary's page there; a computer without the change is named for an update, as the Google row does.

The phone keeps one record in a push keychain group it shares with its notification part (`PhonePushStore`), apart from the app's own group, so the part reaches no other key the phone keeps, on this device only and readable after the first unlock: a sealing key for each kept computer with its pin and name, its push address and service, the relay's grant and when it last asked for one.
One push address and grant serve every kept computer, and each computer gets its own sealing key, handed at its welcome, so no computer can open another's pushes (INF-5265).
A phone that kept one computer's key before keeps that key for that computer, once; every computer added after gets a new key, never one another computer held, and the phone hands a computer only its own key (the captain's pick on INF-5265's review, "Keep keys separate; do not support notifications after downgrading").
The record's own `key` field, which an older build reads, then holds a key no computer seals with, so an older build opened after it shows no card's words in its notifications.
The record learns the kept computers only once the phone has read them after the first unlock, and a list read as empty drops no key: only forgetting the last computer does.
The grant and address reach a computer directly only at its own welcome; a kept computer that is not shown learns a new grant or address from the letter the phone leaves it at the relay (below), and reads it within a day, or at once when the relay refuses its old grant.
It asks the relay's `POST /v1/register` only when it holds no unexpired grant for its current address and service, when its grant has three days left, or when its computer answers `{ "kept": false }`, and at most once an hour, since each ask costs one of Apple's few background pushes.
The grant arrives as a background push (`UIBackgroundModes` `remote-notification`), and the phone keeps it and hands it on.
Its service is read from the build's provisioning profile: a development build names `development`, and a TestFlight or App Store build, which carries none, is `production`.

On each welcome, and each time Infinitary opens, the phone hands its computer `inf:devices:push`: its registration while notifications are on and it holds a grant, or null while they are off in the device's Settings, so its computer forgets the address and sends nothing (the captain's pick on INF-4792's review, "Phone tells its computer to stop sending when notifications are off").

The notification part (`InfinitaryNotifications`, a notification service extension) opens each push with each kept computer's key from the push keychain group in turn, and shows its title and body as the computer wrote them: in bold what the card asks and its project, then the work's name and, on the next line, what it does (`docs/phone-push.md`, "What is sealed").
It links only `InfinitaryPush`, the small library that opens a push (`PhonePushSeal`), so it stays well inside iOS's memory limit for the part.
With more than one computer kept, it names the computer whose key opened the push as the notification's subtitle, and keeps that computer's pin beside the card it names.
A push it cannot open keeps the relay's own words, "A card is ready", and opens no card.
While Infinitary is in front and in reach of its computer, a push shows nothing and the in-app notice shows the card instead; away from its computer, where the in-app notice cannot show it, the push shows (`PhonePush.showsInFront`, the captain's pick on INF-4794's review, "Show the notification when open but out of reach"), and so does a push from a kept computer that is not shown.
Forgetting the last computer the phone keeps tries to stop its notifications (the captain's answer on INF-4794's review, "if i forget a computer, then the phone app should stop showing any push notifications from that home"): the phone gives up its push address, makes a new key and drops its grant, and removes that computer's notifications (`PhonePushes.forgot`).
A push from that computer then opens to no card, so it shows nothing while Infinitary is in front.
A forgotten computer may still show notifications while Infinitary is closed, each reading only the relay's "A card is ready" and opening no card (the captain's pick on INF-4794's review, "Say plainly that a forgotten computer may still show these").
The relay cannot cancel a grant, which is a signed expiry date, and iOS does not promise a new address when the phone asks again, so the phone leaves the forgotten computer a stop letter (below), which it reads within a day and then sends nothing more; a computer that never reads it, such as one switched off, keeps reaching the phone for up to 30 days whenever iOS hands back the same address.
When iOS gives a new address, Apple stops delivering to the old one, the relay answers that computer `410` and it forgets the address.
Hiding these too would take Apple's notification filtering entitlement, which Apple grants only on request.
The next computer the phone joins after that gets a new grant and key, and a new address when iOS gives one.
Forgetting or leaving one computer while others stay kept drops only that computer's key and removes only its notifications; the push address and grant stay for the others, so that computer, which keeps the address, reaches the phone only with pushes no kept key opens.
A tap opens Infinitary on that card on Home, as the notice's tap does, from the stack or from Past once it left the stage, waiting for the computer's cards when Infinitary was closed; a card from a kept computer that is not shown shows that computer first, and a tap waits while a join is under way, the list is unread or the connection is still the one before, opening the card only on its own computer's connection, never on another.
A notification whose computer is no longer kept, or that names none and has no computer kept then, opens nothing.
Once the cards are read, that computer's notifications for cards no longer on its stage, or whose newest version was seen anywhere (`ReadOnlySession.hasSeen`), are removed, and again whenever a card's seen mark changes while in reach (`PhonePushes.clear`); no other computer's are.
A notification names the computer it came from; one shown before the phone kept a key per computer names none and belongs to the computer kept then (`PhonePushHeld.untagged`), which forgetting that computer removes; its tap, its clearing and whether it shows in front all take that owner (`PhonePushes.owner`), and one whose owner is unknown or no longer kept opens nothing and shows nothing in front (`PhoneModel.keptOwner`).
One that opened no card names no computer, so it is removed on reach only while the phone keeps one computer.
The push record learns the kept computers only once the phone has read them after the first unlock, so a wake before that drops no computer's key.
The list read is the phone's own: a computer missing from it was forgotten, even if Infinitary stopped before it let go of that computer's key, so its key goes then, and an empty list lets go of the push address as forgetting the last computer does; a computer that removed the phone while it was the last kept lets go of them at once.
Each list handed also removes every notification for a card whose computer is not kept, and every one while none is kept, so a removal cut short is finished by the next; who is kept is read once iOS answered, so a pass never removes a notification of a computer joined meanwhile.
The list is handed on each open, whether a computer is connected or not, and the phone asks iOS for the push address on an open only while it keeps a computer, so an open after the last forget does not take back the address it gave up.
The push record changes only once the Keychain confirmed the write (`PhonePushStore.save`), so the phone never hands a computer a key the notification part cannot read, nor keeps using a forgotten computer's key; the next list, read on each open and before each welcome's handover, tries a refused write again.
A push record the Keychain cannot read now, such as before the first unlock, is never taken for none: the phone makes and saves nothing over it, and reads it again next time (`PhonePushStore.read`).
Forgetting a computer that is not shown leaves the push handover with the one shown.
A computer whose welcome lists `phone-push-withdraw` hears in the registration that this phone takes withdrawals: once a card it pushed was seen, answered or closed, it sends a silent sealed withdrawal through the relay, and `PhoneAppDelegate` removes the notifications it names while Infinitary is in the background, without opening it (`PhonePushes.withdrawArrived`; `docs/phone-push.md`, "Withdrawals").
The phone opens a withdrawal with each kept computer's key in turn, and the key that opens it names the one computer whose notifications it may remove.
This is best effort: Apple does not promise to deliver a silent push, delivers none to an app the person swiped away, and the computer sends a phone at most one withdrawal every 20 minutes after the first, so a notification may stay until a later withdrawal or until Infinitary opens, which removes the notifications for cards no longer on the stage or already seen.
A withdrawal names which pushes of each card it withdraws, by the name each push carries, which the notification part keeps with the notification and the app reads back (`PhonePushSeal.userInfo`, `PhonePushSeal.shown`), so another push of the same card, such as its author's reply, keeps its notification even when Apple delivers it before the slower withdrawal.
A simulator refuses a background push, so a TestFlight build on a real phone shows a withdrawal end to end.

The phone leaves each kept computer a sealed letter at the relay, so a computer it does not reach still learns a new grant or address, or that it was forgotten (INF-5275's plan, piece 2; `docs/phone-push.md`, "Letters").
Each letter waits in a box named from that computer's own key and is sealed under another key derived from it (`PhonePush.letterBox`, `PhonePush.sealLetter`), so the relay cannot read it or tell whose box it is.
Once a new grant arrives, and on each open, the phone writes a renew letter with its push address, service and grant to each kept computer whose last letter it wrote under an older grant (`PhonePushComputer.lettered`), while notifications are on and the grant has more than a minute left.
Forgetting a computer, the last one included, or reading a list without it writes that computer a stop letter before the phone lets go of its key; the letter is kept in the push record (`PhonePushHeld.stops`) until the relay answers it, and is written again on the next open meanwhile.
A busy box gets the same newest letter again after a second, three tries at most; a refused grant drops it and asks the relay for a new one, and a relay without letters ends the pass until the next open.

An isolated phone check asks for no pushes, so no system question covers its journeys, unless it sets `INFINITARY_TEST_PUSH`; the push part then names its test home's stand-in relay with `INFINITARY_TEST_PUSH_RELAY` and a push address with `INFINITARY_TEST_PUSH_ADDRESS`, both read only in a simulator build; its letters go to the stand-in's letter request beside it.
The address stands in for iOS's own, since a simulator on a check's Mac never reaches Apple's push service and gets none; `simctl push` delivers to the app whatever address the relay was told.
The push part (`PhoneJourney+Push.swift`) asks once, allows iOS's question, waits for the test home to keep the registration, and waits for the app to reach the background, since iOS asks an app still leaving the front whether to show a push and Infinitary stays quiet in front while in reach; the test home's real phone sender seals a new card for the phone and posts it to the stand-in relay (`tests/helpers/phonePushRelay.ts`), which hands it to the simulator with `simctl push`; the notification arrives and its tap brings Infinitary back.
The part then has the test home let go of the registration and opens Infinitary again: its welcome hands the grant it holds, with no second ask of the relay and no second question.
A simulated push runs no notification part (a known limit of Xcode's simulator), so that notification keeps the relay's words; `PhonePushTests` owns opening the sealed card, its title and line, the card it names and where a tap finds that card, and a TestFlight build on a real phone shows them end to end.
A simulator refuses a background push, so the stand-in relay answers the phone's ask with its grant instead, and the simulator build takes that answer as the relay's push.
`PhonePushTests` covers opening each kept computer's sealed pushes and withdrawals under its own key and naming it (two keys in the fixture), a key for each kept computer, clearing, withdrawing and forgetting by computer, notifications from before a key per computer, a list read after a forget cut short, a cleanup cut short, a computer joined while a cleanup waited, no address asked for with no computer kept, a write the Keychain refuses, a record the Keychain cannot read now, forgetting a computer not shown, a refused grant while a key was kept, opening the computer's sealed pushes and withdrawals (`Fixtures/PhonePush.json`, sealed by `sealCardPush` and `sealWithdrawal`), removing only the notifications of the pushes a withdrawal names and keeping another push of the same card, what the notification part keeps on a notification being what the app reads back, saying it takes withdrawals only to a computer that lists them, where a tap finds its card (after In reach, on the stack or in Past), when a push shows in front, forgetting a computer, when the phone asks the relay, the handover on each welcome and open, null while notifications are off, the one ask, and removing notifications for cards that left the stage or were seen.

## Google in Settings

Settings → Integrations has a Google row for the computer the phone controls, showing who is signed in, with Sign in and Sign out (INF-3454's phone part, the captain's choices where=settings and how=catch); the list's Integrations line names the signed-in account or says Not signed in.
The sign-in runs on that computer and its keys stay there; the phone asks for it (`inf:integrations:sign-in`), shows its page and passes back what the browser brings, as a computer that controls a first mate does (`docs/view.md`, "A sign-in that returns to the first mate's computer").
Sign in shows Google's notice first, in the words the computer's Settings shows, generated from their owner (`PhoneGoogleWords`), and nothing is asked of the computer until Accept.
The phone lists `sign-in-return` in its hello, and shows the row's Sign in only when the computer is on major 16 or later or its welcome lists it too; otherwise the row says to update that computer.
The sign-in's answer comes only once the browser is back, so the phone does not count it as a computer that stopped answering (`request(_:waits:)`).
Only a sign-in this phone asked for opens its page here: on `inf:app:sign-in-page` the phone listens on the same port of its own loopback address (`PhoneSignInReturnListener`), then shows the page in the system's browser view inside the app, since Google refuses its sign-in in an app's own web view and the app must stay open to catch the return.
The listener passes only GET, as its path, to `inf:integrations:sign-in-return`, and answers the browser with the page the computer said.
When the phone cannot listen on that port, or the computer refused what it passed on, the row asks for the address the browser ended on and sends it; a refused address is named under the field (`RETURN_PASTE_WORDS`).
`inf:app:sign-in-ended` ends the wait, live or replayed after a reconnect, and the row reads the computer's connections again.
Sign out asks once, then removes the connection on the computer (`inf:integrations:remove`).
The row reads the computer's facts on the person's own Google client (`client` on its row or addable entry) and says what the computer's row says, in the same order (`PhoneGoogleClientState`, after `googleClientState`): a client Google refused, and the date a client outside Personal mode stops, each offering Set up again.
With no client of the person's kept, or one Google refused, Sign in is Set up (INF-6342, the captain's choice setup-on-phone): the setup sheet, in the computer's Settings words, opens Google's page in the browser and takes the client file Google gives, chosen from Files or pasted, and hands it whole to the computer (`inf:integrations:client`), which keeps its secret in Secrets; kept, the same sheet shows Google's notice.
A computer from before that change sends no `client`, so the row offers its sign-in as before and never asks it to keep a client.
The phone check's computer names no client of its own, as a released build, so its google part sets up the stand-in's own client by pasting its file (`tests/helpers/phoneGoogle.ts`).
The isolated phone check opens no browser: the simulator shares its computer's loopback address, where the sign-in itself listens, so its google part pastes the address the stand-in Google sends the browser to (`tests/helpers/phoneGoogle.ts`), and `PhoneSignInReturnTests` drives the real listener with a real request.

## Settings pages in the computer's words

Projects, Intelligence, Runbooks, Usage and Automation in the phone's Settings are the computer's own pages, read from the computer the phone controls and said in that computer's words (INF-3563).
Each row's line is the page's state: how many projects, how many accounts and how many need a sign-in, how many runbooks are on and off, the period's tokens, and how many automations are active and paused.
The phone asks what the computer's own Settings asks, over channels a paired view may ask (`PhoneRequest`'s Settings entries, `scripts/generate-phone-contract.ts`), and hands the answers as they came to one script, `SettingsWords.generated.js`.
`node scripts/generate-phone-settings.ts` bundles that script from `src/renderer/src/settings/phonePages.ts`, whose pure functions build each page's rows from the computer's own row rules and word owners: `rowView`, `accountsSummary` and `awayNote` (`accountRows.ts`), `quotaMicroMeterLook`, and the automation, usage, project and runbook words.
The app runs it in JavaScriptCore (`PhoneSettingsWords`) with no page, network or timer, and draws the rows it answers, so no allowance rule, verdict or sentence is written a second time in Swift; `src/shared/quotaSignals.ts` stays the one home of quota math.
A sentence the computer's own Settings says too has one owner both read, and the pages' own sentences are catalog messages (`settingsPhone…` in `docs/i18n.md`'s catalog); the phone sets the script's language to its own as it loads it, so the pages speak the phone's language, as the rest of the phone does.
`pnpm check` refuses a script that is not current (`generate-phone-settings.ts --check`), so a change to a rule or a word on the computer reaches the phone in the same pull request.
Where the computer's sentence says this computer, the phone's names the computer, as a computer that controls a first mate does (`docs/view.md`, "Settings on a view").
`PhoneSettings` holds the pages: Settings reads all five as it opens, a page the computer refuses stays off the list, and out of reach each keeps its last reading.
The open page reads again when the computer comes into reach and once the computer's words about accounts, allowance, projects or runbooks settle (`ReadOnlySession.settingsRevision`); Intelligence also reads every ten seconds and Automation every thirty.
On a phone the computer lets only read, every page shows with its switches and buttons off.
Signing in, and making, changing or deleting, stay on the computer, and each page's last line says where.

Intelligence only shows.
It lists every account in the computer's order, under the computer it is on where other computers run work, each with its status dot, provider, plan and identity, the marks for the crew's preferred account and the first mate's, every allowance window as the computer's micro meter (what is left, the reset clock's tick, when it resets) and the row's one verdict.
A reading the computer could not refresh is drawn dim, and a computer out of reach keeps its last reading under its out-of-reach note.
A row that waits for a sign-in says where to sign in, by the computer's name; the phone starts no sign-in and offers no pause, rename or remove.

Automation lists each rule with its name and two lines: its schedule, then its next run in the rule's own time zone (`automationNextWords`) beside its term, or its state where it has none (Paused, Draft, Done).
A row's one button is what the phone may do to it: Pause, Resume, or Turn on… on a draft; Pause all asks once and names how many it pauses.
Pause, Resume and Pause all are the computer's own actions (`inf:automation:state`, `inf:automation:pause-all`).
A row opens the rule: its name, state, schedule, what an event rule waits for (Only if), project, its next run while it is on, the prompt as the first mate gets it, and its runs, each with what it led to and the prompt as sent.
A look that sent nothing because every event was kept from the first mate reads Skipped and names the events it skipped in place of a prompt, by the rules the computer's history reads (`runStateWords`, `runPromptTitle`; `docs/automation.md`, "The event screen").
A rule that runs once fills its prompt with that one time, whether it is still to come or has passed, so a finished rule shows no placeholder.
Turn on… opens the computer's review of the draft (`reviewFacts`): when it runs, what an event rule waits for, where, its next runs one a line, the prompt and what it sends.
A page under a section leads with its own name (`PhonePageName`) and the top bar names only where Back goes, because the bar would cut a long name short.
Turn on saves the draft through `inf:automation:save` with the save the review showed, and Back leaves it a draft.

Usage only shows: the period's total in tokens or estimated dollars, the tasks finished and the milestone, a bar a day, each model's share and where it went, for all work.
Its period and unit are its only controls and change nothing on the computer; recent tasks and each model's detail stay in the computer's Usage.

Projects lists each project with how it differs from a new one, in the computer's row words, and opens it to its four standing choices: where changes go, whether merging asks first, its rigor and its cost limit.
The personal workspace sits in a list of its own under the projects, since the Settings row's count leaves it out: the count reads as the first list's rows.
Each saves through the computer's project settings (`inf:repos:configure`) as it is chosen and reads back what the computer kept; a choice the project's setup fixes shows as fixed, with the computer's reason.
Choosing an amount of its own for the cost limit uncovers the amount at the page's foot, and the page brings it into view, since a sheet shorter than the page, as an iPad's is, would uncover it out of sight.
An iPhone types the amount on the decimal pad and an iPad on its full keyboard's numbers, since an iPad shows a decimal pad as a popover beside the field and a tap outside a popover only closes it: the first tap on Save would save nothing.
Adding or removing a project, its folder and where it runs stay on the computer.

Runbooks lists the built-in runbooks and the person's own, each with the computer's switch (`inf:settings:runbooks:set`).
Writing a runbook and opening its folder stay on the computer.

Every row and control on these pages is a keyboard stop (`PhoneStopsPage`): the up and down arrows and Tab walk them and keep the one under the ring in view, Return or Space presses it, the left and right arrows step a choice, and Esc or Command-[ goes back one page.
`tests/phone-settings-pages.test.ts` builds every page from a stand-in computer's answers, read as a paired phone reads them, with the committed script; `phonePages.test.ts` owns the grouping by computer; and the settings-pages part of the phone check drives the pages on a home that holds accounts, rules, usage, projects and runbooks (`tests/helpers/phoneSettings.ts`).

## Installing on a phone

The captain installs Infinitary through TestFlight, not Xcode.
Once a build is in internal testing, Apple emails each tester in the app's internal group an invitation.
On the phone, the tester opens Apple's TestFlight app with the Apple Account in that group, accepts the invitation and installs Infinitary; automatic distribution offers each later build there too.
The phone and Mac need a network route to one another and a Mac build that accepts `system: "ios"`.
Open **A phone** in the Mac app's Devices settings, scan or paste its link in the phone app, and confirm that Mac.
The phone should show Home, Tasks and Activity in its top bar, its cards on Home, and the Mac's name with In reach on Settings' Your computer page.
Type a message or use keyboard dictation, attach a library photo, and confirm the last turn on the Mac.
Open a task’s record to start or continue it, and its Crewmate tab to steer or stop its running turn.
A tester outside the team joins an external group instead, by the captain's email invitation or the group's public link; each build reaches that group once Beta App Review approves it ("External testing" below).
TestFlight installation, camera scanning and the real Local Network prompt are the captain's checks on a physical phone.
Someone working on the phone app can still run it on their own iPhone or iPad from `ios/Infinitary/Infinitary.xcodeproj` with the Infinitary scheme and their own development sign-in.
Release signing runs only in the separately dispatched TestFlight workflow below.

## TestFlight releases

`.github/workflows/ios-release.yml` is dispatched from merged `main` with a numeric phone `version`, such as `0.1.0`.
A branch dispatch is refused before Apple is contacted.
Every job checks out the same full source commit recorded by the dispatch; the phone version is independent of the Mac's version and does not edit a version file or create a desktop release tag.
The build number is the workflow run number plus the archived run offset, followed by `.1`, such as `42.1`.
The original project uses an offset of zero; after cutover the offset is the archived workflow’s last run number, and a sum above 9999 is refused rather than exceeding Apple’s four-digit first component.
The Mac job refuses release-job reruns immediately after Node setup, before dependency installation or signing; the upload command checks again before Xcode runs.
GitHub can preserve an earlier resolve job's outputs while advancing another job's attempt, and an unclear upload must not be renumbered or resubmitted.
A status-only request remains safe to rerun because it never uploads.
A fresh dispatch creates another build, not a retry of a prior upload.

The Linux preflight reads App Store Connect with the Infinitary Labs team's `COMPANY_APP_STORE_CONNECT_KEY_ID`, `COMPANY_APP_STORE_CONNECT_ISSUER_ID` and base64-encoded `COMPANY_APP_STORE_CONNECT_API_KEY` secrets.
It requires exactly the app record named **Infinitary** for `com.getinfinitary.app`, the registered bundle identifier, and an internal TestFlight group with automatic distribution and a configured, non-revoked tester.
Apple's identifier filters can return prefix matches; the preflight selects exact identifiers before requiring one match.
Apple sends the TestFlight invitation only after a build is available, so `NOT_INVITED` and `INVITED` are valid preflight states, not proof of installation ([Apple's internal-testing instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)).
These preflight reads use GET only; they create no app record or tester and change no account permissions.
It signs short-lived requests in memory, refuses redirects or pagination to another host, and prints neither credentials nor tester identities.
A successful read proves app access, not permission to manage signing; Xcode checks that authority during the archive.
A configured tester somewhere in the group is not proof that the captain accepted an invitation or installed the app.

The captain's one-time Apple setup is:

1. In Apple Developer → Certificates, Identifiers & Profiles → Identifiers, register the explicit identifier `com.getinfinitary.app` for team `Y44V95NP6K` if it does not exist.
2. In App Store Connect → Apps → + → New App, choose iOS, name **Infinitary**, a primary language, the registered identifier, a stable SKU such as `infinitary-ios` and Full Access.
   An existing record must have that name and identifier, and the API key must have access to it.
3. In that app's TestFlight tab, press + beside Internal Testing to create a group, or select one, enable automatic distribution, and add the captain with Invite Testers.
   Accept its TestFlight invitation once the first build is available; that acceptance is not an upload prerequisite.
   A missing eligible tester is managed through App Store Connect → Users and Access, not by this workflow.
4. On `infinitary-apps`, put a team key authorized for the app and Xcode automatic signing in the `ios-release` environment's three `COMPANY_` secrets, not in repository-wide secrets.
   Configure the environment to allow deployments only from the `main` branch, with no tag rule.
   Apple readiness, upload, availability and external testing read their credentials from that environment.
   The private-key secret contains base64 of the downloaded `.p8` file, never a value pasted into a task or a command argument.
5. For card pushes, the app identifier needs the Push Notifications capability, and the notification part its own identifier, `com.getinfinitary.app.notifications`.
   Xcode's automatic signing registers both with the team key during the archive when the key may; otherwise register the second identifier and turn on Push Notifications for the first in the same Identifiers page.

After preflight, `ios-release.yml` calls the same-source reusable `phone.yml` with the resolved `source_commit`.
That unsigned job runs each device's parts through the required `MAC_QUEUES.phone` queue, without affected-part filtering or edited-part repeats, as one call per device so the iPad and the iPhone each take one phone Mac at once (INF-2582).
"Which parts run on which device" says which parts each device runs.
It receives only contents-read and actions-read permissions, for checkout and the Export phone pictures job's download, because GitHub starts no job of a called workflow that asks for more than its caller grants; no signing secrets or release environment pass to the guest.
Both devices run even if one fails; any failure, cancellation or skipped phone job prevents the host signing job from starting.
The host signing job then uses the `testflight` kind's queue (`docs/testing.md`, "Each Mac job's kind and size"), otherwise `REAL_MAC_RUNNER`, then `MAC_RUNNER`, falling back only to `mini-mac`.
Xcode signs the upload with the Infinitary Labs team's certificates, so that job asks for the real Mac, never a virtual one.
It waits in its own `ios-testflight` line, apart from phone checks, and retains its 225-minute job allowance.
Install-time checks use a scratch HOME and an empty local-signing directory, as in `phone.yml`.

`scripts/release-phone.sh` uses ordinary Xcode automatic signing on the existing Mac runner with the same Apple team and App Store Connect API key as other apps on that team.
It signs the app and its notification part, each with the identifier its target names, and refuses an archive whose notification part does not carry that identifier and the app's version and build.
This CI path is captain-approved; it is not permission for a crewmate to sign locally or inspect the person's keychains.
There are no explicit `security`, Keychain or `codesign` commands; Xcode may reuse an existing development certificate rather than create one.
After a confirmed upload, `scripts/phone-certificates.ts` lists safe cleanup candidates inside the release command.
Only a runner named `mini-mac` or starting `mini-mac-` may select candidates, and an archive without a signing fingerprint selects nothing.
It protects every SHA-1 signing identity printed by archive and export, including nested targets, rather than just the last identity.
It reads all certificate pages through the existing host-checked App Store Connect reader, with a ten-page bound; malformed or incomplete listings fail closed.
A candidate must be a `DEVELOPMENT` certificate whose X.509 subject common name is exactly `Apple Development: Created via API (<this release key ID>)`, whose fingerprint is not protected, and whose X.509 `notBefore` is strictly more than 24 hours old.
The key ID in that naming convention is an inference from INF-259, not an Apple creator field; an unrecognised name is always kept.
Apple supplies no certificate creation date, so cleanup never sorts on `createdDate` or expiration.
The release entry point is list-only with no revocation input or environment switch: the first real candidate list appears in the job log and summary for the captain to read.
Revocation stays off until the captain reviews that list and a separate reviewed code change wires the revocation callback.
A listing failure leaves the accepted upload receipt intact and never retries upload.
This changes only Infinitary; other apps on the same Apple team keep their own cleanup.
The key is written with mode 0600 inside this invocation's owned mode-0700 temporary folder and supplied to Xcode by file path.
The uploader receives that exact file through `--p8-file-path`, bypassing its earlier working-directory and HOME search locations rather than relying on the last-searched `API_PRIVATE_KEYS_DIR`.
Archive, derived data, export and key cleanup run on exit, with an `always()` cleanup for the known invocation path; local verification uses only unsigned simulator runs and unsigned packaging rehearsals.
A force-killed job can interrupt cleanup, so the final cleanup and runner's temporary-directory lifecycle both matter.
The archive gate reads the built app's name, bundle identifier, version, build, iOS platform, compiled icon, all four iPad orientations and encryption declaration before export.
`ios/ExportOptions.plist` selects automatic App Store Connect export and disables automatic version/build renumbering.
Exactly one exported IPA is accepted for a single upload attempt; no upload is automatically retried.

The `phone-release-<version>-<build>` artifact keeps a non-secret upload receipt, not keys, signed archives or unredacted signing logs.
The reusable phone workflow keeps native results, logs and pictures in its ordinary artifacts.
An `attempted` receipt means the outcome is unknown; `accepted` means the uploader accepted it for processing, not that it reached a phone.
The final Linux job reads the exact marketing-version/build pair until Apple reports it in internal beta testing, for up to 60 readings separated by 30 seconds.
Rejected, expired or unknown states fail explicitly, and export-compliance holds name Apple's required action rather than uploading again.
A processing timeout or uncertain upload is checked by dispatching the same workflow with `version` and `check_build` set to the existing build number.
That mode runs no Mac job and never uploads; once Apple confirms the build, it runs the external testing job below, which adds only what Apple does not hold yet.
Apple's internal-testing state means testers can install the build, not that a phone has; a tester's installation through TestFlight is that check, and no Xcode installation is required of the captain.

### External testing

An external TestFlight group receives no build by itself, and Apple's Beta App Review must pass a build before outside testers can install it, so the workflow's last job, `external`, adds and submits each build (INF-1784).
It starts once the availability job has passed, in a release and in a `check_build` request, with the same `ios-release` environment key, and nothing waits on it: the alpha's phone order reads the availability job alone, also while this job still runs (`docs/alpha.md`, "The phone goes first"), so a failure here never takes back the build's place on TestFlight.
`node scripts/phone-release.ts external` reads the app's beta groups and, for each group Apple marks as not internal, the newest build in it.
A group that already holds this build is left as it is; one that holds a newer build, by Apple's upload date, keeps that build, so a `check_build` request for an old build never hands testers an older one.
Every other external group receives the build with `POST /v1/betaGroups/{id}/relationships/builds`.
The job then reads the build's external state, waiting up to ten minutes while Apple reports `PROCESSING`, and submits it with `POST /v1/betaAppReviewSubmissions` when Apple reports `READY_FOR_BETA_SUBMISSION`; Apple may approve a later build of an approved version without a full review.
The run's summary names each group, whether the build was added, already there or left out, and its review state in words: waiting for review, in review, approved, ready for testing or in testing.
A rejected build or a state Apple has not documented fails the job; an app with no external group passes with a line saying the build went to internal testers only.
These two POSTs are the release's only App Store Connect writes, and the writer refuses any other path.
A refusal names Apple's error codes, such as `ENTITY_UNPROCESSABLE.BETA_CONTRACT_MISSING`, without Apple's prose, says what Apple already took, and is never retried; a lost connection leaves the outcome unknown, and a `check_build` request reads what Apple holds and adds only what is missing.
The key needs a role that may add builds to external groups and submit them for review.
The captain's one-time setup for outside testers is in App Store Connect: the app's Test Information (beta description, feedback email, contact and review notes, including the transport-security reason in "Joining and trust"), an external group under External Testing, and its testers or public link.
Groups, testers and Test Information belong to one App Store Connect record, so the personal team's old record keeps its own: the Infinitary Labs record needs that setup of its own, and its testers are invited to it again.

## Disposable verification

`pnpm test:phone --evidence <absolute-folder-outside-the-project>` runs the foundation's native gate directly on a Mac with the pinned Xcode and its own iOS simulator.
On a computer in CI mode (`infinitary.checks = ci`, `docs/testing.md` "Where the heavy checks run") it refuses before starting the gate and names `phone.yml` on request instead.
The default uses an iPhone 16; `--device ipad` uses the iPad Pro 11-inch (M4) and `--device duo` the iPhone Duo, and `--ipad` is the same as `--device ipad`.
`scripts/phone-pin.json` names the one Xcode every Mac's phone check uses and, for each device, its simulator device type and the iOS simulator runtime it runs on, by version and build (INF-1645): the same pin in the phone guests for ordinary checks and unsigned TestFlight checks.
No one runtime serves every device: Apple's iOS 27.1 simulator runs only the iPhone Duo, and its iOS 27.0 runs every device but the Duo, so the iPhone 16 and the iPad stay on iOS 27.0 and the Duo takes iOS 27.1 (INF-4241 piece 8, the captain's "the iPhone 16 and iPad stay on iOS 27.0"), and a Mac that runs the check holds both runtimes.
The gate refuses any other Xcode before it builds, and `scripts/phone-simulator.ts` refuses a Mac without a device's runtime, or one whose runtime does not support the device, naming the download that fixes it; it never takes a newer or older runtime in its place.
Moving a device to a new runtime is one pull request that edits the pin, after the virtual Mac image and every Mac that runs the check hold it; the image's build and its provisioning download every runtime the pin names (`scripts/virtual-mac/image.sh`, `scripts/virtual-mac/provision.sh`).
Name `--device` more than once, or add `--every-device` for every device `PHONE_PARTS` names, to run the checks and build once and then the devices side by side; `--both` names the iPhone and the iPad.
The evidence folder then holds the shared logs and a folder for each device, such as `iphone`, `ipad` and `duo`.

### Which parts run on which device

Every part runs on the iPhone, and the iPad and the iPhone Duo run only the parts about each (INF-4241's direction B, the captain's "a full iPhone pass, a short Duo pass at its four sizes and a short iPad pass").
`PHONE_PARTS` in `scripts/phone-test-plan.ts` is the one list: each part's `devices` names the devices beyond the iPhone it runs on, its `why` names what that device alone shows, and a part the Duo runs names the hinge, `closed` or `open`, the Duo starts it with (`partHinge`).
A part names the iPad only when it checks something no iPhone shows: the wide layout's sidebar when the iPad turns on its side, the iPad's own keyboard and pop-up number pad, its photo picker, or the words written for the iPad, such as This iPad.
A part names the Duo only when it checks something only a fold shows; the `fold` part checks the layout in the Duo's flat poses, below.
`phonePasses` and `phoneJobs` run a part only on the devices its row names, at a phone release and on a request alike, the chooser's `ipad_parts` and `duo_parts` keep only the parts that name each, and `phone.yml` and `ios-release.yml` check the devices the list names (`tests/phone-ci.test.ts` holds both workflows to it).
An edited part runs three times on the iPhone and once on each other device that lists it.
A device's list is also its short pass: a branch request whose change edits a hand-written Swift file in the app's own folder runs every part on the iPad's and the Duo's lists, once, beside the parts the change reaches on the iPhone (INF-4241 piece 9; `docs/testing.md`, "The phone check on request").

### The Duo's hinge

Apple gives no command that opens the simulated iPhone Duo's hinge, so the phone check keeps a small helper of its own, `scripts/phone-hinge.m` (INF-4241 piece 8, the captain's "Keep a small helper of our own in the project that opens the hinge through the undocumented interface; it can break when Xcode changes").
The gate builds it once for the iOS simulator, signed ad hoc as any simulator program is, when a Duo part runs (`buildPhoneHinge` in `scripts/phone-hinge.ts`), and runs it inside the Duo with `simctl spawn`.
`phone-hinge sweep` posts the vendor-defined HID event Xcode's own hinge slider posts, through the angles between, since the iOS 27.1 simulator stops switching screens after a jump straight from closed to open; `phone-hinge angle` reads the angle back from CoreMotion.
Before each Duo part the gate moves the hinge to the one its row names, once, then reads the pose back until the angle and the lit screen, read from `devicectl device info displays`, show it within `PHONE_HINGE_SETTLE_MS` (`setPhoneHinge`).
A Duo that does not show it fails the part before its tests, naming the hinge and what the Duo showed instead, and nothing moves the hinge a second time.
Turning a closed Duo, or any phone with no hinge, stays the journey's own step.
The simulated Duo ignores XCUIDevice's turns while it is open, so `phone-hinge turn` posts the event Xcode's own orientation picker posts, which turns the open Duo's inner screen; the gate turns it once and reads the inner screen back until it shows wide like a book or tall on its side (`turnPhone`), and fails the part naming the turn otherwise.
A Duo whose hinge is not open is refused before anything turns it.
`phone-hinge orientation` reads the turn back from SpringBoard, which decides it: on a connection of its own it asks which interface orientation SpringBoard holds for the main screen, the inner one while the Duo is open, and a landscape one shows the inner screen wide.
The gate never reads a turn from `devicectl device info displays` (INF-6069): that answer comes from a cache the simulator's display information daemon refreshes only when a display or orientation notification arrives, keeping its last values when its time-boxed read of the orientation runs out, and no notification follows the one a turn sends, so a refresh that missed the turn showed the screen as it stood before for as long as the gate read it.
That turn outlasts the hinge closing and leaves the outer screen on its side, so a journey turns the open Duo back like a book before it closes it.
After a hinge move the simulated Duo's SpringBoard can leave its screen transition unfinished until the next pose event it hears, and a turn that is that event can be dropped: the Duo takes the event and its inner screen stays as it was (INF-5183).
So before each turn the gate reads the hinge's angle and states it once more where it stands, which moves nothing and is that event instead of the turn.
XCTest's `typeKey` gives its key a keyboard bound to one display, and while the Duo is open the simulator's event router finds that key no destination, so the app never receives it (INF-5183).
`phone-hinge key` posts the keyboard event an attached keyboard sends, which names no display and goes to the app that holds keyboard focus.
The gate presses the key once, with a keyboard attached for the press alone as XCTest's own is, and reads backboardd's line for that press until it names where the key went (`pressPhoneKey`); nothing presses the key a second time.
It reads that line from its own log subscription and from the simulator's kept log, and the first source that names a key for the press answers (`PhoneKeyEvents`): the subscription can drop a line the kept log holds, and a busy simulator's kept log can take longer than the window to read.
The two are never added together, since one line read from both would count as two presses.
Each read of the simulator's kept log ends when the press's own ten-second window does, so a key neither source names is answered as unknown while the journey's request still waits.
Inside a part the journey asks its test home to move the hinge (`POST hinge-open`, `POST hinge-closed`, `GET hinge`), turn the open Duo (`POST turn-book`, `POST turn-side-left`, `POST turn-side-right`) or press a key on it (`POST key-tab`, `POST key-return`, `POST key-escape`), which does it the same way; a device with no hinge answers none.
The `fold` part (`testLayoutFollowsTheFold`) checks INF-4210's promises: closed, the one column under the tab strip, upright and on its side alike, since the closed Duo's outer screen keeps the app upright as it turns, and open like a book the sidebar beside the stage reaching the fold with the card beside it.
With panels shown, the open Duo turns onto its side and back like a book four times, each side twice, and Home's card comes back to the place and width it had like a book each time (INF-4539): TestFlight 0.16.0 narrowed the card from 338 to 239 points on each turn back, since the column kept a fold inset read in the middle of the turn.
The message box under the sidebar keeps its place and width through the same turns (INF-4838), where it had shrunk to about half the sidebar after each turn back.
Before the turns the test home shows a long card (`POST long-text-card`), a short line beside a long paragraph, and on the first turn the card on its side is wider than like a book while its short line, one line in both, keeps the width it had like a book, so its words draw at one size in both (INF-4838).
Split at the fold shows in Settings → Appearance once the Duo has opened, turned off it narrows the sidebar to the iPad's share, and Settings stays Settings as the Duo closes under it.
On the iPhone the same part checks the column and the strip and that Split at the fold never shows.
Half-folded poses stay with pictures taken for a change.
The card-first layout's two narrow cases, which no device's screen reaches at the default text size, are app-hosted checks in the rest part (`PhoneNarrowLayoutTests`): the shipped workspace in a window narrowed as an iPad's can be, where the sidebar folds for the card and the message box stays and types, and the open Duo's folded Home at a width where the pager stacks over the message box, where the pager still moves to another card and the message box types.
A gate whose named parts none of its devices runs refuses to start, rather than passing having checked nothing.
A part added to the journey runs on the iPhone alone until its row names another device.
The native journey is tests in `PhoneJourney`, one per part (`scripts/phone-test-plan.ts`): three join parts (`join-read`, `join-activity`, `join-away`), three talk parts (`talk-compose`, `talk-tasks`, `talk-drafts`), three cards parts (`cards-merge`, `cards-form`, `cards-media`), `address` (join by its address), `pick` (a card pager pick across a workspace redraw), `cards-revise` (a revision while the thread shows, then the thread's minus), `cards-notes` (notes on a card's parts and selected words, queued and sent as one reply, INF-3296), `cards-diagram` (a card's map opened live in its cover, and a finger on the map in the card scrolling the card, INF-3881), `cards-drafts` (a card's picks and words shared with another screen through the test home's real core, one change per typing pause, and a pick made out of reach sent on return, INF-5445), `cards-reads` (a crewmate's card reading the record live through the test home's real core, refused an undeclared read and view, kept as drawn once ended on screen or beside the shown card, and showing its author's words as a past card, INF-5531), four keyboard parts (`keyboard-pinned`, `keyboard-scrolling`: the message box and a card's reply with the keyboard up, INF-2568; `keyboard-ways-out`: each way out of that keyboard, INF-3106; `body-field`: a text box inside a card's body with the keyboard up, INF-3427), `card-questions` (the answers line's stepper through a decision's questions, by tap and by key), `google` (Google's row in Settings, INF-3454), `settings-pages` (Settings' Projects, Intelligence, Runbooks, Usage and Automation, INF-3563), `panels` (the Panels tab from a fixture panel on the test home's real core, then that panel's title-row buttons, its cards on Home and its taps that open a task, INF-3830, and a text box in one of its cards typed in with the keyboard up, INF-4350), `push` (the one ask, the grant and registration, and a card push that arrives with Infinitary in the background, keeping the relay's words since a simulated push runs no notification part, and whose tap brings Infinitary back, INF-4794), `weak-link` (the `PhoneWeakLinkTests` class alone, on the Mac), and `rest`, which runs the character and past choices with the other app-hosted tests and any test no other part names, except the tests of the phone check's own tools (`PHONE_TOOL_TESTS`).
The weak link checks wait out real slow links, outages and silences, about five minutes a device, so they take a part of their own rather than doubling the rest part, and a change to the other app-hosted tests does not repeat them (INF-2989).
They drive no screen, so the part runs on the Mac itself beside the simulated devices, on the real timers (INF-4326): the class is the phone package's own `PhoneWeakLinkTests` test target, which a plain `swift test` of the package skips, and the gate's child for the part (`--mac`) starts its own disposable home and runs that target with `swift test` from the build the package tests made.
The test phone's identity is a throwaway key and certificate made once for the process and read with `kSecImportToMemoryOnly`, so it is kept in memory and never in the Mac's keychain.
Its key never starts with a zero byte: the Mac's own openssl writes such a key into the bundle a byte short, and the import then drops it while still reporting success.
Each part's test, with the steps only it takes, is in a file of its own beside `InfinitaryUITests/PhoneJourney.swift`, named for the part (`PhoneJourney+JoinRead.swift` for `join-read`, `PhoneJourney+Rest.swift` for `rest`).
`PhoneJourney.swift` keeps the class and the steps two or more parts share.
INF-2125 (the captain's "Shared fixes, then short parts") split the join, talk and cards parts into these short ones, so a check of only the parts a change reaches can run the closest alone; every check stays, in the part it belongs to.
A journey that launches the app fresh takes a part of its own, since the rest part's simulator already holds the character journey's join (INF-2095).
The gate runs each device's parts on lanes: a lane is one simulator the gate starts once and runs parts on one after the other, and each part is its own gate with its own test home and a clean app (INF-1438, the captain's "Start each simulated device once per phone check, not once per part").
`--simulators` sets how many places the Mac has for simulators, and its default is as many as the Mac holds: one for each 4 processor cores and each 4 GiB of memory, whichever gives fewer, and always one (`phoneLanes` in `scripts/phone-test-plan.ts`, INF-4241 piece 3).
An iPhone or an iPad takes one place and an iPhone Duo two, so on a Mac of two places the Duo runs alone (`PHONE_DEVICE_PLACES`, INF-6407).
On the 10-core, 9 GiB compute Mac VMs, a Duo beside another simulated device slowed both 1.8 to 3.6 times: its fold part's test took 257 to 275 seconds against 145 alone, and the iPad's panels part ran past its three-minute allowance beside the Duo's start and beside its fold part, while an iPad beside an iPhone ran within 1.25 times its time alone.
That rule rests on INF-4308's measurement on a compute Mac VM of 10 cores and 9 GiB, where two simulated devices at once passed every part and three ran out of memory and processors; INF-2101's one at a time rested on 4-core VMs.
Every device gets one lane, and each further lane goes to the device with the most recorded work per lane, never more lanes than it has parts; with fewer places than devices the devices run one after another, the device with the most work per lane first, so the iPhone's long pass never waits behind the short Duo and iPad passes (`phoneLanePlan`).
A device whose lane takes every place, the Duo on a Mac of two, starts only after the other devices' lanes end, and the others share the places among themselves.
A device with one lane runs its parts in the order `scripts/phone-test-plan.ts` lists them.
A device with several shares them longest first by the recorded part times in `scripts/phone-part-times.json`, a full gate's `part-times.json` copied whole, so its lanes end close together: a free lane takes the device's next part, a part with no recorded time starts first, and a later pass of an edited part starts only after every ordinary one.
Replace that file with a newer full gate's `part-times.json` when the parts' times move.
A local gate asks its computer's load line for 4 processors and 8 GiB with one simulator, and 4 processors and 4 GiB more for each further one (`phoneRunNeeds` in `scripts/heavy-run-place.ts`).
Before every part the gate uninstalls the previous part's app and UI test runner, resets the simulator's Keychain and permission answers, sets light appearance and the default type size, detaches the hardware keyboard, checks the app is gone, and starts the simulator's Face ID interface when it is not running; a simulator Xcode shut down after a failed part boots again.
The parent owns each simulator from create to delete, and passes it to the part's own process with `--simulator` beside `--xctestrun`; a lane whose simulator cannot start leaves its parts to the device's other lanes, or unstarted when it has none, and the gate names them.
A boot, the first or a boot again, has `PHONE_BOOT_BUDGET_MS` on the load clock to finish (`phoneSimulatorBooted` in `scripts/phone-simulator.ts`, INF-3689); a boot still running then is stopped, and its lane or part fails, naming the simulator and the last step `simctl bootstatus` printed, instead of waiting for the job's own time limit.
After every boot, the first or a boot again, no part starts on the simulator until its wallpaper prewarm has finished (`phonePrewarmFinished` in `scripts/phone-simulator.ts`, INF-6058).
Minutes after each boot of the iPhone, the iPad and the Duo, the simulator's background-task scheduler runs SpringBoard's one-time task `com.apple.springboard.posterboardupdate.prewarm`, which starts some thirty wallpaper extensions at once; run inside the take-over part, it kept the Face ID prompt from starting within its five seconds, and the part waited on an alert that never came.
The wait reads SpringBoard's own line for the task's end from the simulator's log since the boot began, and has `PHONE_PREWARM_BUDGET_MS` on the load clock once the boot finished.
A prewarm not finished by then fails the lane or the part, naming the simulator, and keeps SpringBoard's wallpaper lines and the scheduler's lines about the task since boot with the command logs.
No part starts on a simulator until iOS's Face ID interface, `com.apple.LocalAuthenticationUIService`, runs there (`phoneFaceIdStarted` in `scripts/phone-simulator.ts`, INF-7013).
A Face ID or passcode request has five seconds to show its prompt, and a request that finds the interface not running starts it inside those five seconds; on a busy phone Mac that start took up to ten, and the Secrets approval journey failed with LocalAuthentication's error -1000.
When the simulator's `launchctl list` shows the interface with no process, the gate runs the Face ID helper `scripts/phone-face-id.m`, built once for the simulator, inside it with `simctl spawn`; the helper's request starts the interface as an app's request does.
Once the interface logs that it finished launching, the gate stops the helper with SIGTERM, which cancels its request and takes its prompt away; the interface stays running, suspended between prompts, and the part's requests use it.
`simctl launch` would start the interface with a screen of its own, which the iPad's SpringBoard ends within seconds.
The start has `PHONE_FACE_ID_BUDGET_MS` on the load clock; an interface not started by then fails the part before its tests, naming the simulator and how the helper's request was answered, and keeps the interface's lines and SpringBoard's and RunningBoard's lines about it since the wait began with the command logs.
Every other command the gate runs has a deadline on the same load clock too (`scripts/phone-deadlines.ts`, INF-5387's plan, piece 1), clean-up on a frozen simulator included.
A part has twice its time in `scripts/phone-part-times.json`, and at least three minutes (`phonePartBudget`); a part with no recorded time counts as the median part.
The part's `xcodebuild` has that and one command deadline more, and the gate gives the part's own process one more again for its clean-up.
A deadline longer than the load clock's ten-minute wall cap, as the part's own process's always is, runs its whole length on the wall clock and ends there, so its failure names the minutes it ran (`waitCap`).
The build has `PHONE_BUILD_BUDGET_MS`, the package tests `PHONE_PACKAGE_TESTS_BUDGET_MS`, and every other command, each `simctl` call, log read and diagnostic's close among them, `PHONE_COMMAND_BUDGET_MS`; each rests on recorded times (`scripts/limits.ts`).
A command past its deadline is ended with every process under it, and the gate keeps what it waited on in `hung-<command>-<time>.txt` beside its log: its processes, a sample of each and its simulator's state.
It fails naming the command and its minutes, and nothing is retried; a failed part then stops the others at the first failure as any failed part does.
A diagnostic whose close passes its deadline is left and the rest of the clean-up goes on; the gate ends every process it still holds at its end, and the job still uploads its evidence.
A simulator whose delete fails or passes its deadline is not tried again at the gate's end: the next gate on that Mac removes it, as below.
So a screenshot that freezes a simulator, as one did for 3 hours 50 minutes in run 44682920550 when the test program could not start again, fails its check in minutes.
A run that is killed, by a task stop or a restart, never reaches its own cleanup, so before its checks each gate removes what earlier runs left (`scripts/phone-leftovers.ts`, INF-1596).
It deletes each simulator named `Infinitary isolated test`, shut down or booted, and each `infinitary-native-` scratch folder in its temporary folder that came into being before the earliest phone check process still running began.
A gate makes both only after its process starts, so a running check's simulator and folder are never touched, nor a person's own simulator or another prefix's folder; the reading needs no record or age, so leftovers of runs before the sweep go the same way.
It reads the process list itself, never through the command log the evidence keeps, and a removal that fails is reported while the gate goes on.
Before its first simulator starts, each gate removes the pinned runtime's folder under `/Library/Developer/CoreSimulator/Caches/dyld/<Mac build>/` when that folder holds no cache (`removeEmptyPhoneSharedCache` in `scripts/phone-simulator.ts`, INF-2445).
On the phone check's virtual Mac, which runs macOS 26.6, an obsolete cache build left that folder holding only its warning that the runtime ships its own cache.
CoreSimulator still names such a folder as the simulator's cache folder: the simulator's processes fall back to the runtime's own cache, but its log never stores that cache's words.
The kept log then writes `<compose failure [shared UUID]>` for every message whose words live in the shared cache, SpringBoard's appearance line, the text-size lines and UIKit's lines among them, so no recovery from the kept log can read them.
Without the folder the simulator uses the runtime's own cache and stores its words within a minute of starting.
`xcrun simctl runtime dyld_shared_cache remove` takes the folder away without administrator rights; a folder that holds a cache stays, and a Mac with no such folder runs nothing.
A removal that fails, or leaves the folder, is printed while the gate goes on, and the observers then have only their live logs and the unreadable-record rule below.
A part's results are in its own folder, inside the device's folder in a gate of several devices, and `--part` runs only the named parts; a device with several lanes keeps each lane's Photos wait in a `lane-<number>` folder beside them.
A gate of every part, on one device or several, writes each part's minutes on each of its devices to `part-times.json` in the evidence folder once every part that runs on each device (its row of `PHONE_PARTS`) has run to its end (`endPhoneGate` in `scripts/phone-test-plan.ts`); no workflow reads it since INF-2539 removed the pull request's part budget, and a copy of one is the gate's own recorded part times.
Every gate also counts each pass's work, never its seconds (INF-4326): its screen reads, each top-level find, existence check, element count or snapshot in XCTest's own activity lines, and its app launches (`phoneWork`).
Each part prints its counts and keeps them as `work.json` in its folder, a full gate keeps them all as `part-work.json` beside `part-times.json`, and the gate names in a warning every pass whose work grew past the part's recorded amount on its device in `scripts/phone-work.json`, or that has none recorded (`phoneWorkPast`).
A change that makes a part do more on purpose raises its recorded amount in the same pull request, from a full gate's `part-work.json`, and says why.
The build is `xcodebuild build-for-testing` for any simulator, and each part runs `test-without-building` from a copy of the built test plan that names its own test home and selects its tests.
In a dealt request, a job's gate may take that build from the check's first job instead of building it (`--shared-build`, `scripts/phone-build.ts`), only when it was made from the same commit with the same Xcode, simulator SDK and chip (`docs/testing.md`, "Native phone checks").
That copy sits beside the built plan and is named for the part's device, the part and its simulator, so two lanes running passes of one part at once never share a copy or a test home (`partPlanPath` in `scripts/phone-test-plan.ts`).
The simulators of the first lanes start, and wait for their wallpaper prewarm, while that build runs, so the first parts begin as it ends, or as a lane's prewarm finishes when that comes later; a lane past `--simulators`' places starts its own when its places free, and no later lane starts before it (INF-2125).
The Swift package tests and the build share one folder of fetched package repositories, so the build fetches nothing the package tests already did.
It is `INFINITARY_PHONE_PACKAGE_CACHE` when set, otherwise inside the gate's scratch folder.
`phone.yml` sets it outside that folder and restores it from the newest save of `main`, matched on both package lockfiles; only a run of `main` with no exact match saves it, since a pull request reads its base branch's saves and never another pull request's.
Any part failing fails the gate.
Local runs stop at their first failed part by default, so a failed repeat ends after cleanup and returns its load-line place rather than running the remaining parts (INF-2014).
With this default or `--stop-early`, which `phone.yml` sets through `INFINITARY_PHONE_STOP_EARLY=1` for a complete branch selection and for any request with edited-part passes (INF-2811), the first failed part ends the parts still running on the other lanes, as an interrupted part does, and starts no other; every started simulator is still deleted, and the gate names the failed, stopped and unstarted parts and writes no `part-times.json`.
Set `INFINITARY_PHONE_STOP_EARLY=0` for deliberate full-discovery local runs; CI defaults to full discovery, and any other workflow run on request sets `0` explicitly to run every part to its end.
Every explicit native observation goes through `InfinitaryUITests/PhoneWaits.swift`: element presence and absence, predicate reads and the disposable home's control requests.
`PhoneJourney.appearances` observes screenshot pixels before attaching each light/dark pair and before returning from its light restoration (INF-1537).
These fixtures have broad near-white or near-black surfaces: every screen quadrant's mean sRGB brightness must be on the requested side of the black/white midpoint, so an idle app or a dark card alone cannot stand in for a drawn dark screen.
It reads them only once a still part of the screen has redrawn and settled (`waitForRedraw`), since XCTest no longer waits out the native transition; after the first matching frame it observes again and attaches that exact screenshot, not a later unchecked capture.
A missing appearance fails with the last frame named `unconfirmed` and its quadrant readings in the log.
This checks the journey's fixtures, not the appearance of arbitrary pictures or other apps.
Its load clock, `PhoneWaitDeadline`, lives in `PhoneLoadClock/`, which both test targets compile, so the app-hosted display samples read the same clock.
On ordinary runs it samples the same load clock as journeys, with 25 ms ticks, at most two ticks counted across a stall, and a share reduced by one-minute load per active processor above 1.
Each wait ends by 20 times its budget on the monotonic wall clock, at most ten minutes or its own budget where that is longer; direct predicate evaluation preserves INF-975's short-window fix.
The phone launcher starts the Node load clock for its failure timers too, and the disposable control server keeps idle connections for a finite capped interval so a queued POST survives a frozen home.
A graded run keeps each original wall-clock budget, and the launcher writes that reading into every test target's own test plan.
XCTest timeouts are enabled in both modes: an ordinary test's default and maximum allowance is its part's deadline (`phonePartBudget`, below), while graded tests use Xcode's own allowances.
`PhoneWaitsTests` observes a real delayed file across a stalled reader, fails a missing file, expires a stalled clock at its wall cap and checks direct short-window observation.
Its delayed file is written by a thread of its own, never a Swift task, and the reader's stall ends only after that write, so busy shared task threads cannot hold the write past the wall cap (INF-1396).
Message-box, card-reply and address-sheet typing share `focusForPhoneTyping`: one tap, dismissal of iOS's first-use typing guide if shown, then observation of the field's actual keyboard focus before typing.
The address journey dismisses the iPad number-pad popover on the sheet's title and observes the keyboard leaving before focusing the address; it never retries the field tap or types a priming character.
A choice after paging waits for the restored native form reading as well as its enabled action.
The gate starts `simulator-live.log` before XCTest starts, so a failed test that tears down the simulator domain cannot erase the earlier app, WebKit and system log.
CI keeps each part's `simulator-live.log` in an artifact of its own, `phone-simulator-logs`, under `<device>/<part>`, never in `phone-logs`.
On failure it also prints the native wait's budget and cap, and the app's own WebContent launch requests and WebKit-measured startup durations, with their timestamps and app PIDs (`tests/helpers/phoneWebContent.ts`, INF-1888).
It reads both the live stream and the same simulator's kept log, deduplicates their witnesses, and keeps them in `webcontent-startup.log` beside the original test failure.
The post-failure app and system log queries stream both output pipes to their numbered command files with backpressure, never accumulate the whole log in a string, and join their children and file writers before cleanup (`scripts/phone-failure-logs.ts`, INF-1885).
The app log's startup witnesses are read back one line at a time.
A collection or read failure is reported without hiding the next log, the live-reader join, or the original test failure.
A missing launch completion stays unknown, and an earlier launch does not establish the cause of a later card failure; these readings identify startup delays without claiming CPU load, concurrent simulators or a runtime defect caused them.
No diagnostic changes the failed status, retries an action or extends a wait.
The startup investigation also samples the owned simulator's app, RunningBoard and its `launchd_sim` parent once when a WebKit launch has neither a captured PID reply nor a running-state reading after ten seconds, and once on an actual rendering-backend unresponsive message (INF-1936).
RunningBoard's calculated state and SpringBoard's received state cancel pending launch captures, including when the state arrives before its request.
On a rendering fault the probe also samples the named WebContent process and GPU processes whose native launch or running-state readings identify the same app.
It verifies their simulator parent, executable, birth time relative to the native reading and stable host identity; an absent, replaced or unowned child is recorded and excluded without preventing the other samples.
These are diagnostic observation points, not readiness conditions: a missing reply may be a dropped log, and no sample establishes a cause without inspecting its stacks.
The probe discovers the simulator's manager and launcher before the journey, accepting the host's bare `launchd_sim` name as well as its full path (INF-1941).
At capture time it reads only host process metadata, checking saved process identities and the app's parent and simulator path, so the lookup cannot queue a command behind the stalled simulator launch.
It retains separate receipt, trigger, ownership-lookup and sample times, never elevates access, records sampling failures without retrying, and joins the samples before deleting the simulator.
For an explicitly requested launch investigation, `phone.yml`'s `guest_observer` input replaces each cards part's ordinary fault probe with `scripts/phone-guest-observer.ts`, a separate guest process started before XCTest; it changes no product or test code.
The observer verifies the existing simulator owner and uses the verified launcher's open descriptors to identify its actual writable regular log file.
It accepts a file within that simulator's recorded log directory or directly within the observed `com.apple.CoreSimulator.SimDevice.<owned UUID>` directory; it never guesses or searches for a filename.
The canonical directory must retain the owned directory's name and contain the canonical file path.
Before XCTest it opens that file without following a symlink and verifies its device and inode; missing, ambiguous, changed or unreadable evidence stops the investigation before the journey, without elevated access.
It preserves the owned log through the native result or the existing capture allowance, whichever comes first; observed rotation, replacement or truncation is recorded as incomplete evidence, not followed into another file.
It also attaches both RunningBoard and its verified `launchd_sim` parent before the journey, and waits for both samplers to report readiness before XCTest may start.
Its narrow native stream runs independently of the high-volume log reader and includes the verified launcher's own log records if the simulator stream supplies them; absent records do not establish a healthy launcher.
Both samplers use the existing ordinary XCTest allowance and 100 ms interval, without extending a test wait or resolving a new process at fault time.
The observer retains request, creation and PID-response readings by app and request identity, even when creation or response arrives before its request.
Neither creation nor a delayed response stops the prestarted samples; they remain open for later delays until the native result or their unchanged existing allowance.
A missing response remains unknown; the native cards result stops the observer before xcodebuild's later diagnostic collection, with runner cleanup and the existing sample duration as backstops.
The first owned WebContent request starts one host-only lookup, with wall and monotonic readings for the spawn call and return, spawn event, first output, exit, close, and asynchronous command-log write start and end.
Each helper's output lines also carry receipt times, separating sampling messages from later symbol processing.
If that same owned lookup child still has no output after the existing ten-second diagnostic threshold, the observer records the stalled lookup's PID once, without another process lookup or retry.
It does not sample that child: macOS's `ps` is setuid, so an unprivileged sampler cannot inspect it.
The proposed guest-wide kernel capture would cover the stalled lookup too; that capture is not implemented or authorized, and there is no separate elevated lookup sampler.
Any output, exit, spawn failure or native-result shutdown cancels an unspent lookup observation; cleanup joins an already-started observation.
`guest-observer/events.log` keeps those readings and each matched launch beside the narrow native log and sample reports; successful commands with empty call graphs remain missing evidence.
Both reports aggregate their observed intervals, so their stacks must be compared with the request, creation, response and sampling times rather than attributed to one call without that comparison.
The owned launcher-file reader also delivers complete appended lines, never its initial historical snapshot, to the proxy-child diagnostic.
A direct-file watch and a directory watch notify the same serialized, identity-checked reader; neither follows a replacement or starts another reader.
Each nonempty read records its notification source, byte range and delivered-line counts, distinguishing live deliveries from the final read during shutdown.
The close record keeps both watches' notification counts and total versus live line deliveries, so a complete saved file alone is never proof of live recording.
A WebContent or GPU spawn record identifies its app, request UUID and child PID; after the existing ten-second threshold without a terminal record, the observer attempts one five-second sample at 100 ms intervals for that child.
Host process metadata must confirm the owned app, manager, launcher, child parent, native spawn second and executable, then confirm their identities again before sampling.
The child may still be `xpcproxy_sim` or may already have executed its intended WebContent/GPU target while the launcher has not reported running; the recorded executable distinguishes those cases.
Missing, replaced or changed identities produce an evidence gap without a retry, and a terminal record arriving during the lookup cancels an unspent sample.
The native result, a file-capture error or the original observation allowance cancels pending proxy captures; shutdown and the allowance also interrupt started proxy samples, and cleanup joins the lookups and samplers.
The observer is opt-in, starts no retry, changes no test allowance or assertion, and joins its children and evidence writers before simulator deletion.
A failure while finishing diagnostics is reported without replacing the native result or its output, and remaining diagnostics still finish.
Required observer setup still fails when observation cannot start, and simulator, fixture and runner teardown retain their own failure handling.
In a talk part, the first actual UIKit keyboard-queue timeout triggers a one-second stack sample after the runner confirms that PID still belongs to its own simulator's app.
It retains `keyboard-timeout-stack.log` and the capture outcome, joins the sampler before deleting the simulator, and never retries a capture or changes the photo-selection, tap or focus assertions.
A run without that fault records that no reproduction or stack capture is claimed.
In every part, the first time XCTest reports that the app's main run loop never went idle, or the app's simulator log says an XCTest query found its main thread busy for 30 seconds, the runner takes one three-second stack sample of the app and of the simulator processes a turn with the keyboard up waits on: SpringBoard, backboardd, InputUI and kbd.
The busy report arrives 30 seconds into a freeze, a minute or more before XCTest fails the query as a UI query timeout.
It finds them as the simulator launcher's children from host process metadata alone, because a simulator command issued then can queue behind the stuck app, and confirms the app belongs to its own simulator before sampling.
It retains `idle-timeout-<process>-<PID>.log` for each sample and the capture outcome in `idle-timeout-capture.log`, names a process it did not find or could not sample, joins the samplers before deleting the simulator, and never retries a capture or changes a test.
The Cards journey keeps both its accessibility tree and the disposable home's card-state calls when a choice does not dismiss its card.
A request to `phone.yml` can name `parts`, `starve` and `perf`; the load controller stops each part's owned process tree with twelve-second long stalls and a 60-minute experiment limit.
The `waits` input (or `--waits`) selects only `PhoneWaitsTests` on both devices, so `perf: true, waits: true` proves the native deadline rule without also grading unrelated UI recovery latency.
The `tools` input (or `--tools`) selects every test of the phone check's own tools on both devices, in the rest part's place: `PhoneWaitsTests`, `PhoneTargetPixelsTests`, the crew reveal's geometry and the scene evidence recorder's diagnostics (`PHONE_TOOL_TESTS` in `scripts/phone-test-plan.ts`).
The rest part skips them, so no ordinary run or release runs them; a change to one of those tools requests `tools: true` once at its final version.
An affected request still runs a tool test whose own code changed: every pass of the rest part, its iPad round and its three iPhone rounds, runs that test by name beside the part's own tests, even when the same change repeats the whole rest part (`toolTests` in `scripts/affected-phone.ts`).
Because xcodebuild runs no test a `-skip-testing` names, that pass stops skipping the whole tool class the test is in, so the class's other tests run with it.
This proof-only selection writes no whole-gate timing sample; an ordinary gate still runs every selected product journey and native test.
Selected parts, starvation, grading and proof-only selection use the normal or placed runner route; the fixed virtual-Mac switch refuses those options rather than silently dropping them.
A part that chooses a library photo (`talk` and `rest`) starts its tests only after the simulator's Photos says it has opened its shared-with-you library, because Photos hands over no chosen photo before then.
With simulators booting side by side that took up to six minutes after boot, and the gate waits for it once per device, from the device's start beside its first part: the wait reads what Photos logged since boot, so a library Photos opened during boot counts, and it fails if Photos has not opened it twenty minutes after boot, or fifteen on a graded run.
Photos can also fail to open that library, as with error 46110, or wait on a call that the simulator's background-task scheduler never takes up, and then its message never comes.
The wait reads both in Photos' own log and tells them from a slow start.
When Photos says it failed, the wait restarts Photos once and opens the Photos app so Photos opens its libraries again, and it ends the part at once if Photos fails again.
When the scheduler has not taken up a call 30 seconds on the load clock after Photos made it, the wait restarts the scheduler once for that call, and the restarted scheduler takes the call up.
Neither changes the ceiling.
The gate adds the library photo once Photos has opened the library, once per device, so a restart of Photos never cuts the photo's import short.
Minutes after boot Photos runs a background migration of its library whose actions wait on services the simulator lacks, until the simulator's scheduler ends the migration ten to sixteen minutes later, and a photo added meanwhile waits as long (INF-1438).
A photo the migration holds also holds the next app install on that simulator, which cost the first part on each device 1 to 13 minutes when the photo went in beside it (INF-2052).
So the parts that choose a photo run last on each device, and the gate adds the photo just before the device's first of them, so a held photo holds no part before it.
Photos can still hold that photo: for 9 minutes on the iPhone in a full check with the Mac mini to itself, and for 5 and 10 minutes beside a second full check (INF-2052).
So when Photos has not taken the photo 30 seconds on the load clock after the gate added it, the gate restarts Photos once, adds the photo again, and lets the part start once Photos has opened its shared-with-you library again, within two minutes.
On a busy virtual Mac the load clock stretches those 30 seconds toward its ten-minute wall cap, so the restart may not come before Photos takes the photo (INF-2052).
The gate keeps that wait's own log output, with Photos' calls and the scheduler's take-ups, in the device's `photos-stream.log`, and when the wait fails it also keeps the simulator's app and Photos log since boot with its command logs; a failed wait fails every part on that device that chooses a photo, and the device's other parts still run.
The phone workflow's `evidence_run` request exports native-scene attachments from an existing run that kept `phone-results`, a failed or recording one, on the Xcode host, without building or starting a simulator.
Request the export before that artifact's three-day retention expires (`docs/testing.md`, "Actions artifact retention").
It keeps the selected images, timing readings and scene recordings in a small artifact separately from the complete result bundles.
Add `--demo`, with FFmpeg installed, to keep real-speed reconnect, reopen, card, character, scene-panning and task-start recordings with their posters beside the test results.
A manual phone workflow request with `recording` enabled passes `--raw-demo` through `PHONE_RECORDING=1`, including the virtual-Mac route; ordinary checks do not record.
That mode keeps the simulator’s original silent H.264 capture as `*-raw.mp4` and needs no encoder on the test Mac.
Requested raw clips, encoded clips and posters are deliverables, not optional diagnostics: a finalization error fails a part whose native test passed.
If the native test already failed, its failure and output take precedence, and the runner reports any recording finalization error without replacing them.
Diagnostic shutdown and recording-log failures still do not prevent the recording finalizer from running.
Convert those captures to the card’s bounded H.264 format and inspect their posters on the evidence reader’s computer before publication; `--demo` still performs that conversion where FFmpeg is installed.
The reconnect and reopen recordings crop the top of the phone view around the connection state and card; the card recordings keep the full native view.
An encoded demo retains real speed and holds the final frame for five seconds, within a fifteen-second cap; a raw capture preserves the complete recorded interaction.
The runner creates and deletes its own simulator, scratch HOME, real-core home, mock provider, data and keys, never borrows or erases a person's simulator, and saves logs and the result bundle outside the working copy.
The test home uses the real stores, dispatcher, pairing and TLS connection, with sample cards, feed lines and a task; its control interface listens only on loopback behind a fresh per-run token.
It attaches each connection it starts to the core, as the app does, so the core's phone door answers the address part's link only once that connection listens for it.
The simulator never ends an app's background time, so the journey sets `INFINITARY_TEST_BACKGROUND_TIME` to the seconds after which the app ends it itself, standing in for iOS; a phone always waits for iOS.
The simulator-only `INFINITARY_ISOLATED_PHONE_TEST` environment value disables real Bonjour browsing and the network sweep, so an offline fixture never causes attempts against a person's discovered Macs; physical discovery remains a captain check.
In that mode `INFINITARY_TEST_NEARBY_SSH` (`name|host|port`) names the one stand-in computer Join by its address lists, and `INFINITARY_TEST_SWEEP` (`host:port`, comma-separated) the only addresses its sweep tries.
`INFINITARY_TEST_SOUND_CLOCK` (`1`) keeps a played clip's time on a clock in place of the sound output, because the phone check's simulators run on machines with no sound device, where starting any sound waits minutes on the system's sound service; the clip is still fetched and read for its kind and length by the system player, which is never prepared for the output, and the cards-media part sets it.
`INFINITARY_TEST_RETRIED_CARD_LAG` (seconds) holds a retried card body's drawn height that long before its web view takes it, standing in for a loaded computer; every cards part sets it, so the stalled-answer check taps a body that has drawn but not yet grown.
`INFINITARY_TEST_MENU_TAP_REDRAW` (`1`) has the app redraw its workspace 10 ms into each touch on a menu item, clearing a reply notice when one shows, and count each menu the card pager sets between that redraw and the pick under `menu-tap-probe`; the pick part's `testMenuPickSurvivesAWorkspaceRedraw` sets it (INF-2095, INF-4536).
It first verifies the independent published-contract client can join and read the sample card.
The join parts cover a wrong Mac pin, joining, cards and feed (`join-read`); Activity scrolled to its last whole row, out-of-reach state and catch-up after a home restart (`join-activity`); and a short trip to the background that keeps its connection, background/foreground replay after the background time ends, Leave, local Forget and Removed (`join-away`).
The address part starts the Mac's own `sshd` beside its home (`tests/helpers/sshServer.ts`), run as the test's user with a scratch home folder and every session handed the home's data folder; it checks the home's sshd listed as the stand-in computer, the sweep asked first and reading that sshd's real banner, a tap filling the address and port under the account, Not this one, the fingerprint asked again for a typed address, the key refused, a wrong password's words, then adds the key the phone shows and joins.
That `sshd` can check no password, so the password that lets the key in is checked by the package tests against an SSH server of their own (`SSHJoinTests`).
Every other part first joins its own home, and reaches the state its checks read: `join-activity` reads and closes the review finding, `talk-compose` puts the hero card on the stage and relaunches the app, and the cards parts each put their own cards on the stage.
`talk-tasks` and `talk-drafts` reach a restored last turn (`launchWithLastTurn`): the hero card on the stage, the on-request harbour task and a sent captain ask.
`talk-tasks` runs one dark and light relaunch pair, which guards INF-1735's fix: after each relaunch it waits for the requested appearance drawn on the whole screen, then lights Tasks with its list after a single press (`repeatDiscarded: false`).
The cards parts drive forms, staged settings across paging, footer and body choices, the saved answer on the real home, close, threads and replies, pictures, a picture card drawn while the phone is still reaching after a reconnect, completed recording playback, a sound clip played, paused and stopped by leaving the app, seen, past cards, Mac-only doors and out-of-reach refusal without replay.
They check both immediate script stalls and a stall during answer collection, and capture both appearances and the largest standard Dynamic Type size.
The Secrets approval journey enrolls the simulator's software approval key from Settings, compares its code with the computer's card, confirms on the computer, allows one brokered read with the simulator's Face ID and denies another; the runner enrolls the simulator's Face ID and gives its match signal while the face stays in view.
The journey observes the card's refusal beside the optional permission alert and the eventual card closure, so a system confirmation that never starts cannot become a wait for successful approval.
A refusal fails the journey after checking that the same use still waits and nothing was delivered; Allow is never retried, and the simulator face is taken away before any completion assertion can abort the journey.
Only with `INFINITARY_ISOLATED_PHONE_TEST=1` on a simulator, an authentication refusal includes the original LocalAuthentication error's domain, code and localized description, so the journey's existing failure reaches the job log without a full artifact download.
Ordinary simulator use and physical devices keep the plain refusal; no arbitrary error metadata, approval reason or signed bytes are added.
A damaged approval record and the computer stopping approvals are the package tests' and the app-hosted `ApprovalKeyTests`', not the journey's (INF-4241); `INFINITARY_DAMAGED_APPROVAL`, which only a simulator build reads beside `INFINITARY_ISOLATED_PHONE_TEST`, still cuts the kept approval record short in place for a check by hand.
A scripted card attempts network access, parent access, direct native messages, injected scripts and a footer effect; the test home records whether any forbidden request reaches it.
The runner keeps the card interaction recording separately from the reconnect recording when `--demo` is selected.

It also photographs join, Home, Activity, the empty stage, details and Settings in both appearances, checks the largest standard Dynamic Type size, opens details and Settings by keyboard, checks the bar's order of Settings, strip and computer, and checks the iPad's landscape sidebar, its Tasks and Activity pair opening on Tasks and return to portrait.
Every native journey launch goes through `launchPhoneApp`, which renews the owned simulator's keyboard log subscription and waits for its startup before launching the app.
A live subscription is not proof that it still supplies registrations after relaunch; the new subscription starts with no cached witnesses and observes both launch and the home's keyboard attachment.
The runner joins the old output streams before appending the new subscription's gzip member, keeping all registrations in order.
Hardware chords go through `pressPhoneKey`, which asks the test home for backboardd's acknowledgement of that chord's registration for the current app process, then sends the chord once.
The scene's Command-Shift-C entry command keeps that exact-chord/current-process acknowledgement.
For its unmodified arrows, Tab and Space, the captain-approved contract instead observes app-owned browsing before one actual keypress and verifies the result on screen; BackBoard excludes these commands from its routable registrations.
There is no native-focus wait, priming input or retry.
Its touch drags read the target's and the viewport's current frames for each drag's direction and distance, at most eight drags, and a program opens from a tap near its square's corner.
A drag moves the first mate together with its orbiting crew, and the first mate's 280-point square hides a crewmate's square from XCTest's hit test for most of its orbit, so an orbiting crewmate wholly in view is never dragged: it waits for its orbit to carry it out from under that square, or out of view (INF-3631).
An orbiting crewmate's frame is read for a drag only once the crew ride their orbits at pace, as a tap on one waits (below), since in a warp it moves far in the second or so a drag takes.
The scene journey proves rightward panning, leftward return to the same world point, a visible real crewmate selected by Tab and that crewmate's matching summary opened by Space, retaining pictures and an optional keyboard recording.
It photographs the summaries of an idle, a working, a waiting, a blocked, a remote and a program crewmate and compares each one's words with the desktop's for the same task, which its fixture projects from the same records (`tests/helpers/phoneScene.ts`).
Its fixture's crew reach the phone one push at a time, and on the iPad the home's ring fits the screen, so only the other computer's formation gives Right somewhere to pan.
The journey therefore presses its first key only once the scene has drawn that formation's crewmate and the reviewer, the fixture's last crewmate (INF-1477).
The registration parser still reads empty modifier groups and normalizes BackBoard's arrow and Tab spellings without treating rejected commands as acknowledgements.
UIKit publishes an app's key commands to backboardd only while a hardware keyboard is attached when its deferred update runs after the next Core Animation commit, so for that wait the home attaches one to its owned simulator by setting the simulator-wide attached state `UIDevice` reads, the value backboardd itself writes when a keyboard connects, and detaches it again however the wait ends.
XCTest's virtual keyboard connects and disconnects within a millisecond of each key press, so a priming press only races that publication, and once a press has detached it no app process launched afterwards publishes at launch.
The native runner observes only its own simulator, and the isolated test home returns the acknowledgement to the key driver.
Subscription renewal happens only at the explicit launch boundary, never as a timeout retry or a second key press.
An evidence-writer failure stops the observer, rejects readiness and waits for both output streams before simulator cleanup.
An app-side command list is not that acknowledgement; a missing witness fails before sending the chord, without a delay, another priming attempt or a repeated chord.
For Return, the driver checks the router's carriage-return registration but supplies newline to XCTest: Xcode 26.4 emits the physical Return key for newline and no key for its Return constant.
A key that puts the caret in a text field can lose it again on a starved simulator: the field's keyboard comes up slowly, the app's connection to the system's keyboard arbiter fails, and UIKit resigns the field while XCTest still waits for the app to go idle after the key (INF-6074).
The phone puts an empty task search away when its caret goes, so `talk-tasks` then finds no search after Find a task.
Only when the app's own log proves that does the part open the search again by pulling the list down and put the caret back with one tap (the captain's choice "Check only"); anything else fails the part, and the key is never pressed a second time.
The proof is the test home's `caret-outcome`: UIKit's keyboard scene line for a text field becoming the responder after the key, then the arbiter's failed connection and its order to resign, with no text field taking the caret after them.
It reads them from the same subscription and, when that holds no proof, from the kept log by `phoneTouchDeadline`.
Every tap a native journey sends, on an element or a point, goes through `tapOnPhone`, the one way a journey sends a tap again besides the photo pick below (INF-1477, the captain's "Allow a proven second tap").
The tap check (`scripts/phone-taps.ts`, in `pnpm check`) refuses a plain XCTest `.tap()` anywhere in the UI tests but inside `tapOnPhone` itself (INF-2485).
A swipe, a drag or a key is sent once, as before.
SpringBoard decides whether each touch is a system gesture before the app's own gestures may act on it, and XCTest takes its virtual touch screen away about a tenth of a second after the lift; a touch SpringBoard has not handed over by then is cancelled for the app, so a plain swipe, a fifth of a second long, can do nothing on a busy simulator.
The talk-tasks part therefore opens a task row's actions with a slow drag that rests before the lift, which is still touching when SpringBoard decides and opens the row by its distance (INF-6073).
A list's pull counts only from SpringBoard's decision, so even a handed-over swipe can leave Tasks too little of its 200 points to pass the 48 that open search; the talk-tasks and fold parts pull Tasks down to its search with `pullDownOnPhone`, a slow drag across 40% of the list that rests before the lift (INF-6231).
On the open Duo the fold part's Tab, Return and Escape go through the test home instead ("The Duo's hinge"), and each must come back with backboardd naming Infinitary's process as its keyboard-focus destination before the journey reads what the app did with it.
A key-command registration, typed text or a key with no destination does not prove delivery.
As for crew browsing's unmodified keys, BackBoard publishes no registration to wait for, so the journey reads Show panels' own selection before each press that expects a command and its result on screen after.
XCTest gives each synthesized tap a virtual touch screen of its own, and on a starved simulator backboardd can fail to read that screen's properties in time.
It then attaches the screen as an accessory, or as a bad usage pair when it read no usage page, and ignores its touches, and XCTest confirms the tap after five seconds with no error.
The same backboardd subscription also carries touch screen attachments, touching contacts that name their screen, ignored touches, duplicate-service and unknown-digitizer warnings, and disappearance snapshots, and the test home answers what happened to the first touch screen attached after the tap began.
The tap stays synchronous for its callers: the helper asks the test home off the main actor and turns the run loop until the answer arrives, so each tap also waits for its backboardd line to reach the test home.
If the live stream has no witness for the completed tap, the home reads the owned simulator's kept log once, through the same witness reader, alongside the live subscription (INF-1917).
That read starts inside the original outcome wait rather than after its deadline, adds no time or tap, and is cancelled when the outcome settles or the observer closes.
The witness also answers by the runner's request cap less one minute for the way there and back (`phoneTouchDeadline`), so on a host too starved for its load-clock budget to end first, the runner still reads the unknown before its own request ends (INF-2076).
A failed read or an accessory screen without a contact or ignored-touch line remains unknown, never permission for another tap.
It applies the complete recovered batch before deciding: an initializer cannot hide a later warning or unfinished contact, and a failed read, expired request or stopped observer supplies no new permission.
A built-in touch screen was delivered, and so was a screen whose own contact backboardd reports touching, since iOS 27.0 attaches every XCTest screen as an accessory and still delivers its touches, naming the screen on each contact line.
A duplicate-service or unknown-digitizer warning for that sender suspends this delivery verdict: duplicate registration can lose the lift, and an initial screen or touching contact alone does not prove the tap finished.
A complete disappearance snapshot for that same sender, after its attachment, proves an unfinished tap only when its contacts still include a touching contact.
An empty disappearance after a completed tap, a partial snapshot, another sender's cancellation and a registration warning alone never prove an unfinished tap.
Only ignored touches or affirmative unfinished-contact proof send one more tap through the existing discarded outcome, and two discarded taps fail the part.
A single-press check passes `repeatDiscarded: false` to the same owner; a proven discarded tap then fails at once instead of sending another (INF-1735's post-relaunch Tasks check).
Any other screen alone, a missing line or a stopped observer is unknown and sends nothing more; a warning without terminal proof reaches the existing failure deadline rather than a new delay.
Once a part has recorded a failure, XCTest synthesizes no more events, so a later tap attaches no touch screen; `tapOnPhone` then sends the tap without waiting for its target or reading its outcome (`PhoneFailures`).
A warning is not a failure: after UIKit's runtime warning about a reparented view, XCTest goes on sending events, so every later tap still waits for its target and reads its outcome.
A touch the app received but SpringBoard's gesture arbitration swallowed leaves no such proof, so it is not tapped again, with one exception: the photo pick.
On a busy iPhone the photo's lift can reach the photo picker late enough that the picker reads the tap as a press-and-hold and opens the photo's preview, choosing nothing.
The picker logs `performAllAnimations for animator: <_UIContextMenuAnimator` as it opens that preview, and the test home answers whether that line followed the tap (`PhonePickerPreviews`).
The existing broad simulator log also feeds its `onLine` readings into that same preview validator, because it can retain a Photos response the narrow stream dropped (INF-2305).
Its compact header uses the runner's local time zone and is normalized to an explicit timestamp before validation.
When neither live source has supplied that witness, the same observer reads the owned simulator's kept log once inside its original wait, as the touch observer does.
A kept log that cannot spell out messages whose words live in the simulator's shared cache, UIKit's among them, writes `<compose failure [shared UUID]>` in their place, with the process, subsystem, category and time intact (INF-2444); the gate removes the empty cache folder that caused this on the phone check's virtual Mac (INF-2445), and the rule below stays for any Mac where that removal fails.
So the observer also selects the picker's records in UIKit's context-menu category (`com.apple.UIKit`, `UICMILifecycle`), and counts the first such unreadable record after the press as that line: the category logs only while a context menu animates, and none is open as the press begins.
A readable record of that category counts only when it is the line itself.
All sources require the same Photos process, context-menu line or its unreadable record, and timestamp after the press began; a stopped observer, failed read or missing witness authorizes no touch.
A live witness or the original deadline cancels the kept-log read, and a late result cannot change the answer.
The iPad logged the same line and still chose the photo, so the line alone is not proof: the photo pick taps once more only after the photo holds still with no photo chosen and that line read (INF-1477, the captain's "Allow one more photo tap"), and a second press-and-hold fails the part.
The preview stays open after the lift and hides the photo from the accessibility tree, so when UIKit's element labeled `Preview` is on screen after that line, one tap on the dimmed screen below it closes it before the photo is tapped again (the captain's "Allow the closing tap").
After that positive picker proof, the optional wait observes selection, a visible preview or a photo whose on-screen frame and readable pixels match twice (`PhonePhotoObservation`, INF-1832).
Selection and preview outrank a settled photo; missing targets or pixels reset steadiness, and unresolved observations fail at the existing deadline.
Recovery rechecks selection and preview before authorizing the additional photo tap, so a delayed preview still takes the one closing path.
The readiness log names the outcome and elapsed wait independently of the whole talk journey.
Before and after each action XCTest waits for the app's main run loop to idle and for a reply from inside the app saying its animations finished (INF-1541, the captain's "The test code skips Apple's animation wait and checks each target itself").
On a busy Mac that reply can stop coming, as it did after a rotation in INF-1538, and XCTest then waits 60 seconds before every later action.
Every journey replaces XCTest's private `-[XCUIApplicationProcess waitForQuiescenceIncludingAnimationsIdle:usingActivity:isPreEvent:]`, which every one of those waits reaches in Xcode 26.4, with one that keeps the run loop wait and never asks for the animation reply, as WebDriverAgent does (`PhoneAnimationWait.swift`).
A tap checks its own target instead: `tapOnPhone` waits until the target's frame, and the screen's own pixels inside it, read the same twice in a row on the load clock (`waitForSteadyTarget`), except a crewmate orbiting in the scene, which never holds still.
XCTest's screen picture can alternate between two pictures while the screen holds still: on the iPad each picture of the Automation page's Pause all question drew its glass popover's tinted rim one colour level apart from the picture before, the same two in turn, while the screen recording drew no change, so its confirmation never read the same twice (INF-4886).
So a target whose frame reads the same while its pixels repeat the same two pictures twice in a row holds still too (`PhoneSteadyTarget`); an arrival draws a new picture on each reading and still waits.
The shared sampler (`readPhoneTarget`) reads the current application frame and target snapshot once, then crops a full-display screenshot for pixel-aligned, fully visible targets (`phoneTargetPixels`), avoiding the element screenshot's repeated target queries.
That frame is the app under test's while it is in front and SpringBoard's while it is away, as for a notification's tap after Home: reading the app away also read its card body's web process while WebKit suspended it, and XCTest waited about 40 seconds on each read until the notification had left (INF-6067).
The crop uses the screenshot's declared scale and converts the target to native coordinates before cropping the raw backing and applying its orientation.
The iPhone's backing can omit the display's last pixel, so dividing pixel width by the application's point width or cropping upright first would read the wrong region.
The iOS 27 capture callback truncates each scaled extent to test parity: an odd integer supplies integer-minus-one, while an even integer retains the original floating extent; UIKit allocates from that value converted to `Float`, rounded to nearest with ties away from zero.
Before taking a display picture, the sampler uses the same crop owner to check containment and pixel alignment at the screen's scale in every unmirrored orientation; unsupported target geometry goes straight to the native screenshot.
This conservative check avoids capturing the display first for clipped or genuinely subpixel targets, without guessing the picture's orientation.
The captured picture still supplies its own scale, orientation and backing dimensions for the actual crop; unsupported capture metadata retains XCTest's native screenshot rather than approximating its rendering.
An origin within floating-point representation error of the pixel grid takes the integer crop.
An unreadable supported crop is a missing observation, never a steady blank target; an off-screen target still supplies no pixels.
`PhoneTargetPixelsTests` checks recorded native allocation and geometry and compares crops with XCTest's own element pictures on real native controls in portrait, both landscapes and a sheet on both devices.
It runs in the `tools` selection, beside the clock-only `PhoneWaitsTests`, and not in the rest part.
A crewmate orbiting in the scene waits instead until every orbiting crewmate rides its own orbit no faster than that orbit's pace (`PhoneOrbitPace`, INF-2039), since the first mate's warp fidget speeds the crew up until a neighbour reaches the tapped point before the touch lands.
It is then tapped at its own center, through a coordinate read as the touch is synthesized, since overlapping squares give a touch to the nearer center (`PhoneTouchCell`) while XCTest's element tap aims wherever accessibility's own hit test finds the element, which can be a corner nearer a neighbour (INF-4447).
The wait for pace cannot see a warp that begins after it, because a warp moves nothing for its first 0.18 s, so the rest part runs the crew scene inside the character journey's real held turn: the first mate plays its idle fidgets only while idle, and the journey checks it still reads working before and after the orbiting taps.
Through that turn the scene draws the first mate at work above the crew summary sheet, so the tap above the sheet that closes it waits for the sheet to hold still, not the whole window (`tapOnPhone`'s `steady`).
The frame alone is not enough: UIKit gives a sheet or an alert its final frame as it starts to slide or fade in, and drops a touch until it has arrived.
The app's own UIKit log names that drop: it evaluates the touch with `ignoreInteractionEvents: 1` and sends it to no view, while backboardd still reports the contact touching, so the touch outcome reads delivered and only the wait before the tap prevents it (INF-2485).
A check that a control can be pressed waits the same way before it asks XCTest, since right after the iPad's last card closed, XCTest found no tap point for the reply line when the check asked at once.
Any other such check waits on the load clock until XCTest finds the control's tap point (`waitForPhonePress`), since on a busy iPad the sidebar's first group read none right after it appeared.
A typed field waits for keyboard focus after its tap (`focusForPhoneTyping`), so a dropped tap fails where it happened rather than at the typing.
A steady reading says only that the target holds still now: a card shows before its body draws, and the body then grows from its 48-point placeholder and carries the reply row under it down.
So a step that presses a card's reply row right after showing the card first waits for the shown body's reveal (`waitForShownBodyRevealed`), since a tap whose point XCTest read before that move lands where the field was and focuses nothing (INF-4820).
A long press that selects a card's words holds a fixed 1.2 seconds, and WebKit starts the selection only once the app's main thread is free.
The first long press in a card body sets up UIKit's keyboard tracking and opens its keyboard connection, once per launch, on the main thread, which can take over half a second on a busy runner; a tap does neither.
Paid inside the press a part checks, that setup starts the selection after the press has ended, and the selection's menu never shows.
So a part whose checked press would be the first long press in a body first long-presses words on another card and taps beside them to clear the selection, and XCTest's run loop wait orders the checked press after that setup (INF-6042).
A task row's long press opens the row's menu only once UIKit's long-press timer runs on the app's main thread, and a lift that reaches the app before then reads as a tap, which opens the row's record.
XCTest lifts at a fixed time whatever the app is doing, so on a busy runner a main thread that stops from just after touch-down until past the lift turns the press into that tap; the talk-tasks part therefore holds each task row's long press 3 seconds, which still opens the menu when the thread stops for over two seconds (INF-6075).
A drag scrolls a card only as far as the finger moves after the app's main thread reads it, and a thread stopped that way read a one-second drag on the card's map only after its lift, so the card never moved; the cards-diagram part therefore drags the map at 50 points a second and rests a second before the lift, so a thread stopped for over two seconds still reads more than the 80 points the part checks (INF-6501).
A display change, such as dark appearance or the largest type, waits until a still part of the screen draws differently than before the change and settles (`waitForRedraw`), and its pictures are taken after that.
It settles only on one picture read twice in a row, never on two in turn, since the one picture read before the change cannot tell a redraw from the capture's own other picture.
The runner confirms each display change from the simulator's own log before it answers the journey (INF-1785, the captain's "Confirm each change from the simulator's log, and set it once more only when the log proves the phone missed it").
SpringBoard logs `Arbiter changing style from` as it applies an appearance, the simulator's bridge logs `Saved CategoryName` as it saves a text size, and the app logs `Read CategoryName` as it reads one (`PhoneDisplayChanges`).
The app's read of the new size applies the change, even when it is logged in the save's own millisecond.
A read of the old size after the save proves the app missed it, and only that proof sets the size once more; two proven misses fail the part.
A missing line or a stopped observer is unknown and sets nothing more.
A live log stream can drop a line the simulator's kept log holds, so before a witness answers unknown the runner reads the kept log since the change for it (INF-1799).
All three lines come from the simulator's shared libraries, so that read spells them out only when the simulator stored its shared cache's words, which the gate's removal of an empty cache folder ensures (INF-2445).
Every witness of one display request stops waiting at the journey's request cap less two minutes, one for that read and one for the request's way there and back (`phoneDisplayDeadline`), so the journey always hears the unknown before its own request ends.
An appearance SpringBoard misses leaves no line, and the simulator writes nothing when asked for the appearance it already has, so the runner sets each appearance once and prints one it could not confirm.
A text size the part already asked for changes nothing for the app to read, so the runner sets it again and answers unchanged without a witness (INF-2052).
On a freshly started iPad no line of such a save reached the runner, and its witness waited nine minutes of the part for one.
SpringBoard can apply an appearance minutes late, as it applied light 250 seconds after the request in run 40792658138, so the appearance witness waits for its line until `phoneDisplayDeadline` alone, with no shorter load-clock budget (INF-1786, the captain's "Wait for SpringBoard's own line, up to the request's 8-minute limit").
The journey's display requests carry a budget as long as their 10-minute cap (`displayBudget`, `PHONE_DISPLAY_REQUEST_BUDGET_MS`), so a request's load clock never ends it before the runner answers.
A turn of the device waits until a target the turn carries elsewhere has left its old frame and holds still in its new place (`turnPhone`), since until the app turns that target holds still where it was.
A check that read a dialog's button, a gliding row or a web page's answer right after an action waits for it on the load clock instead.
If Xcode stops offering that method, or changes what it takes, the journey fails naming it; the gate fails a part whose log never printed "Phone animation wait skipped", and prints how many animation waits XCTest still ran out in each part.
`talk-drafts` checks that Command-Return restores the field's observed empty value and writes exactly one captain message to the real home.
`talk-drafts` exercises details, keyboard dismissal, both card-paging shortcuts and Send as first chords after relaunch, retaining the original button and draft assertions.
The composed journey verifies keyboard dismissal and computer details after relaunch without changing its retained-text and retained-photo assertions.
It also checks that Tasks starts and ends where the message box does, the reading column, and that the card starts and ends one gutter inside its stage.
The fixture's display controls only change the launcher-owned simulator, never a developer's device or this Mac's appearance.
App-hosted shell tests render each native character's still pose, play the greeting, every held reply and every fidget through the character's machine, and read Activity from the real test home; the native journey also verifies the computer-authored task key.
The empty-stage character consumes the Mac's `firstmate_state.busy` event, the same conversation-state owner as the desktop, and the journey holds and completes a real first-mate turn through the mock provider to verify working and idle.
A stopped or lost connection clears the busy reading; a home on major 12 or later, or one advertising `native-scene-observations`, supplies an initial busy snapshot, while an older home stays unobserved until a busy event arrives.
Native keyboard dictation exposes no listening signal: the phone never infers listening from focus or typing, and the listening drawing is not a live conversation state.
Native hero pictures use the same crop in both themes from the simulator's full-resolution attachments; the desktop-only `heroShot` cannot capture a SwiftUI view.

`talk-compose` chooses a project-owned picture from the disposable photo library, types a message, and checks the real Mac’s captain actor, image bytes and last turn.
`talk-tasks` pulls the task search down, closes it, opens it again by Find a task's key, then searches and starts an on-request task, checks that the real Mac ran it, and interrupts its turn.
Before that it pins the harbour task from its long press, checks that it lists under Pinned above every group and takes the `tasks-pinned` picture, then unpins it back under its state (INF-3127).
It also presses the Start in the harbour task's long press, which sends the Mac's start with no ask, and pins and unpins a Done task from its long press, which keeps Open record.
The fixture then gives that real task’s saved workspace and session the Interrupted state used by recovery; the phone continues it and sends a steer that the held mock-provider turn actually reads.
The fixture uses Pi with the mock provider’s Anthropic message format, matching its held-turn script; no Claude client or provider account is involved.
It also checks that the foreground notice sits under the top bar and over the iPad's landscape stage, waits on an iPhone on its side while the strip stays in the bar, and opens its own card on Home, retained offline drafts, an unconfirmed response with no automatic repeat, and a future-major home that allows reading but refuses changes.
The home records read and connection counts across streaming, pushed card revisions and an idle period longer than both pairing deadlines.
The journey also checks Control Center and removal while away with an owned endpoint that stalls TLS between authenticated refusals.
It pulls Control Center down in under a tenth of a second: a starved SpringBoard can stall on the pull's first touch while the system keeps only its first ~180 ms of touches, so a default-speed pull loses its lift and Control Center never finishes opening.
The home counts the TCP connections to its own port, the refusals pairing gives and the stalled handshakes since the removal, and the journey expects exactly two refusals and one stall after every attempt at the home but the last.
A starved simulator can outlast the phone's own handshake deadline at the home too, which sends no request and adds a round through the stalled address, so the count follows the phone's address order rather than the clock.
The launcher truncates the actual saved Mac only inside its owned simulator's app container; the same journey captures the damaged-record explanation and joins again with a fresh confirmed link.
Each part starts from its own fresh home and a clean app on its device's one simulator; the Xcode scheme's `PHONE_TEST_HOME` setting names that home's private control interface.
Native package tests exercise the Mac-produced link and certificate fixture and certificate/public-key compatibility without using a Mac Keychain.
They check the Secrets approval key's storage through a stand-in that answers with the Keychain's own statuses.
With a stand-in home that answers as `SecretsSettings` does, they check that turning on Approves secret uses keeps a kept key the phone could not read before and replaces only a record it refuses.
They check that several Secrets changes that arrive together end at the home's last answer, even when the earlier reads answer after it.
They check that a damaged record is refused by loading, by turning on Approves secret uses and by a new key, that a locked phone never offers to set up again, and that only Set up approvals again replaces it, leaving it on a failed read, an unsupported device, a changed record or a failed write.
App-hosted tests repair a missing certificate in the disposable simulator's own Keychain and inject protected-data read failures to check retry and the joining explanation.
An app-hosted test replaces the approval key in that Keychain and reads the new key under the same device name.
Its cleanup deletes the approval record only in a simulator build, because XCTest still calls teardown after setup refuses, and a test shows that teardown asked as a device leaves the record in place.
Another damages the kept record in that Keychain the way the phone check does, verifies the actual record was truncated, and checks that loading and a new key refuse it and only its replacement writes a new key, under a new device name.
That test and its record reader compile only for the iOS simulator, matching the damage helper's boundary so unsigned device-target test builds never reference it.
They refuse to run on a physical device, and the iOS identity API itself refuses creation on macOS.

Unsigned simulator tests need an application identifier to use the simulator's own Keychain.
`SimulatorTests.xcconfig` disables signing and injects `Simulator.entitlements` into the app's simulator-only `__TEXT,__entitlements` section through the linker.
This is simulator metadata, not a signature: no `security` or `codesign` command, signing identity, profile, certificate lookup or keychain search-list change is involved.
Normal device builds use Xcode's own signing settings and do not include this test configuration.
The runner waits for simulator boot completion before launching tests and uses one test worker per simulator.

For interactive local development, `node scripts/phone-test-home.ts <output-json-outside-the-project>` keeps the same disposable real-core home open until interrupted.
The output names its control address and scratch root, and is private to that run.
`phone.yml` runs this same gate in each job a request's passes were dealt into, for changes touching `ios/` or the phone-card or phone-contract generator and the contract shape guard.
A pull request no longer starts it (INF-2139): a crewmate whose change selects it requests it on its branch with `affected: "true"`.
INF-2539 removed its pull request selection; the phone release (`ios-release.yml`) runs every part, and main runs no phone check (INF-2492).
The gate's own setup also selects it: `phone.yml`, the launcher `scripts/test-phone.ts`, the test home `tests/helpers/phoneHome.ts` and every module the launcher loads short of the app's own code and the test home's fixtures, such as `tests/helpers/phoneKeyboard.ts`, the Photos wait `tests/helpers/phonePhotos.ts`, its activity writer `scripts/phone-activity.ts`, its leftover sweep `scripts/phone-leftovers.ts`, the build a check's first job shares `scripts/phone-build.ts`, its check runner `scripts/phone-checks.ts` and its test plan helper `scripts/phone-test-plan.ts`, and the files the launcher reads (`docs/testing.md`, "Native phone checks").
Setup the gate never runs does not: `scripts/affected-phone.ts`, `scripts/phone-test-home.ts`, and the virtual Mac scripts `scripts/virtual-mac/phone.sh`, `phone-job.sh` and `vm.sh`.
The phone release (`ios-release.yml`) runs every part on both devices, while a crewmate's request with `affected: "true"` runs only touched parts and falls back to every part when scope is uncertain; a part it only reaches runs on the iPhone, and a change to a hand-written Swift file in the app's own folder adds the iPad's and the Duo's short passes, every part their rows name (INF-2582 as INF-4241 amends it; `docs/testing.md`, "The phone check on request").
Shared modules, connection/device code, general packages and the lockfile alone do not select it; a changed generated Swift file does, unless it changes only its `public static let version` line, which includes a new first number: the phone and the computer come from the same pull request, so they always agree on it, and `docs/contract.json` alone never selects the gate.
Every pull request still checks on Linux that the generated file is current, through `pnpm check` (`node scripts/generate-phone-contract.ts --check`).
A request's Linux `request` job runs the chooser, `scripts/affected-phone.ts`, before any phone Mac is taken; an unreadable comparison runs the gate, and a change it selects no gate for starts no job on a phone Mac.
The chooser deals the request's passes into jobs of at most 20 recorded minutes, each device past a job's first counted as 3, each on its own phone Mac, side by side (`docs/testing.md`, "Native phone checks").
A default run on request (`workflow_dispatch`) runs every part on every device, dealt the same way, and starts no release step (`docs/testing.md`, "The phone check on request"); the phone release's one job of every device keeps each part's minutes as `part-times.json` in `phone-logs`.
On a branch it needs `task` and `reason` inputs, and the workflow refuses it without them (`docs/testing.md`, "What a task branch requests").
Inside a gate, a failed Swift package test is reported and the simulator tests still run (`scripts/phone-checks.ts`).
The gate does not check the generated Swift files: `pnpm check` does on every pull request, on Linux.
The native job requires the `phone` kind's queue (`docs/testing.md`, "Each Mac job's kind and size"), with no runner override or fallback, and retains result bundles, logs and connection readings as `phone-results` when the job fails or a run on request records; a passing check uploads none of its result bundles, about 530 MB.
It also uploads command logs separately as `phone-logs`, so an Xcode failure can be read without downloading screenshot-heavy result bundles.
Each part's live simulator log goes to `phone-simulator-logs` instead, on every run: one part's log can pass 100 MB, and a full gate's would take `phone-logs` past the app's 64 MiB artifact download (INF-2053).
A third artifact, `phone-pictures`, holds only the pictures the journeys took, exported from the result bundles under `<device>/<part>`, so a crewmate reads them within the app's artifact limit, which `phone-results` has outgrown.
A failed part adds to its command logs what the app, its card pages and Photos logged on its simulator, and names its failing lines in the job log.
It also keeps, in a log of its own, what the simulator's system logged from the part's first test: SpringBoard, backboardd, the accessibility server, the keyboard and the test runner, which answer XCUITest's check for interrupting elements.
Its package install also uses a scratch HOME and an empty local-signing directory, so the install-time signature check never reads this Mac's signing material.
`phone.yml`'s run-level group never makes a run wait behind another: a newer request on the same task branch with the same selection cancels the older run, and `main`, a rerun and each of the phone release's calls keep a group of their own (INF-3380; `docs/testing.md`, "What a task branch requests").
Each run and attempt waits only for a free phone guest, and a device gate that started finishes and deletes the simulator it started for each device.
Every native phone job takes a per-run, per-attempt concurrency group, with `queue: max` and cancellation disabled.
Phone checks run side by side, one per free place serving the phone queue ("A phone check the placement service puts in a virtual Mac").
Desktop jobs from different pull requests have no common job-level concurrency group, so they can run side by side.
Desktop journeys and native device gates run directly, without a command lease, so real and virtual Mac checks can overlap.
The `test:phone` package script checks the configured execution mode before running `scripts/test-phone.ts` directly; the gate owns a scratch HOME and disposable simulators.
A local gate first waits for its place in this computer's load line where its shell has one, and starts at once where it has none (`docs/testing.md`, "A local heavy run's place").
Before the gate starts any phone work, `scripts/phone-activity.ts` publishes a private, atomic activity record for its supervisor in `IDLE_REBOOT_PHONE_ACTIVITY_DIR`, or the invoking account's real `Library/Caches/infinitary-ci/phone-activity` folder, never the disposable HOME.
Each invocation owns one uniquely named JSON file containing only `schemaVersion: 1`, its `pid` and `processStartedAt`, the normalized `LC_ALL=C TZ=UTC /bin/ps -o lstart=` reading for that PID.
The supervisor stays alive through teardown and removes only its own file after cleanup; this is activity reporting, with no lock, admission wait, heartbeat or age expiry.
The paired reader is dotfiles-private's `hosts/PHONE_ACTIVITY.md` contract and idle-reboot watchdog; producer and reader must merge together before the lock removals are complete.
A dealt job's gate step is stopped at 30 minutes, inside the job's 34, or 46 for the first job of a check dealt into several jobs, which builds and uploads the app before its gate, so an over-long gate fails the job and still keeps its results; the phone release's gate step keeps 90 minutes.
Both sequential and parallel device lanes must finish within that same limit.
Two full checks at once, one on each of the Mac mini's virtual Macs, starve each other: their parts ran past XCTest's 20-minute allowance, and one check ran past the 90 minutes too (INF-2052).
Xcode collects no diagnostics after a failed test (`-collect-test-diagnostics never`), since its collection held each failed part for ten minutes and the gate keeps its own failure logs (INF-2052).
The phone release's job keeps its limit of 165 minutes for setup, the ordinary pass, cleanup and evidence upload, plus 90 for each of two further passes, without command-admission waits.
Neither device's failure is ignored: both devices run every selected part, whether their lanes run side by side or sequentially, and any failing fails the gate; on a pull request the first failed part stops the rest.
This pull-request lane neither signs a physical-device build nor publishes one; `ios-release.yml` runs the same native gates before its separately dispatched TestFlight upload.
Mac-side checks remain the project's normal gate and affected Devices journeys.

### The phone check in a virtual Mac

Request `phone.yml` for phone verification, including a crewmate's affected-part proof; do not borrow a Mac mini VM or use `scripts/virtual-mac/phone.sh run` for phone proof.
The legacy `phone.sh` lifecycle remains available for existing callers and cleanup, but no current workflow calls it.
`PHONE_VIRTUAL_MAC` no longer selects a route, and `phone.yml` accepts no `mac_runner` input.
A running job keeps the workflow and runner request it started with; changing these files or the fleet does not migrate it, and rollout must not interrupt it.
A rerun of an old workflow still uses its old routing, so use the current workflow for new phone proof.

### A phone check the placement service puts in a virtual Mac

The `phone` kind in `MAC_QUEUES` keeps the exact label `mini-mac-phone` (INF-2202, DOP-246).
The fleet serves that label from every Mac place the placement service runs, the two rented vBoxx places and the compute Macs alike, never the captain's Mac mini VM; which places serve it is the fleet's setup, not this project's.
The one native job, `native-phone`, requires that mapping with no per-run override, fixed-clone switch or generic-Mac fallback.
An absent, empty or malformed mapping supplies no runnable destination instead of redirecting to the mini.
The other nine queue mappings and the generic Mac labels remain unchanged for non-phone jobs.
Each guest runs `scripts/test-phone.ts` directly, with as many simulators as the guest holds, two on a compute Mac VM of 10 cores and 9 GiB, where an iPhone Duo runs alone, and one on a rented VM of 5 cores (INF-4241 piece 3).
A request runs each dealt job's passes with `--plan`, and only its first job runs the phone's Swift package tests (INF-5387's plan, piece 2).
The unsigned TestFlight call names no device: one job, matrix device `every`, whose gate runs `--every-device`, so every device's lanes run from one build on one guest and write one `part-times.json` (INF-4241 piece 8, the plan's "a phone release runs the full check"); a request of every part on every device is dealt into jobs instead.
The ordinary request and the unsigned TestFlight call use the same gate and failure behavior.
Those places also take other kinds of Mac work, such as the merge batch's Mac lanes, so a phone check and a batch lane wait for the same free places (INF-3726); a phone retry after a failure therefore runs only what failed: a rerun of the failed jobs runs only the parts that did not pass, and a retry at a repaired version names only the failing part and device (`docs/testing.md`, "A retry after a failed phone request").
`tests/phone-pool-isolation.test.ts` evaluates the workflows with configured queues and both release modes, allowing only the native phone job there and refusing secret reads.
Other workflows' operator-controlled overrides must never point at the phone queue.
The disposable guests have no captain signing material; the ordinary GitHub job token permits checkout and result uploads.
Every run and attempt has its own concurrency group, so the places may check independently without a shared one-at-a-time line.

## Generated and bundled assets

The phone's `Assets.xcassets/AppIcon.appiconset` contains a flat, opaque 1024-pixel render of the existing design asset `.claude/skills/infinitary-design/assets/app-icon.svg`.
Unlike the desktop package icon, it has no inset or baked-in corner mask; iOS supplies its own shape.
`scripts/render-phone-icon.mjs` renders that source through a hidden Electron window and writes an RGB PNG with no alpha channel, as Apple requires.
To regenerate it, create an empty temporary folder outside the project, set `HOME`, `CFFIXED_USER_HOME` and `INFINITARY_ICON_HOME` to that folder, set `INFINITARY_LOCAL_CODESIGN_DIR` to an empty child of it, then run `node_modules/.bin/electron scripts/render-phone-icon.mjs`.
The renderer never launches the product or reads its saved data.
The app bundles BoringSSL as a dependency of `swift-certificates`, which builds the phone's self-signed sign-in certificate using a CryptoKit P-256 key.
Connections use iOS `URLSession` TLS in `PinnedTransport`; bundled BoringSSL does not provide the app's TLS transport.
`ITSAppUsesNonExemptEncryption` remains false for this sign-in and secure-connection use; revisit the declaration whenever the cryptography or its uses change.
The release-tool tests exercise version validation, Apple readiness and processing reads, the workflow's actual conditions, and archive/export/upload through disposable stand-in commands.
They run in the existing Linux PR cohorts; no secret or signing access is needed.
Set `INFINITARY_PHONE_RELEASE_EVIDENCE` to a folder outside the project to retain their non-secret command transcripts; the stand-in uploader's success is never proof of a real Apple upload.

`node scripts/generate-phone-theme.ts` copies light/dark values, spacing and radii from the design skill into adaptive native colors and lengths, and writes each built-in color theme's palette as the computer works it out (`workOutTheme`), so the phone keeps no second copy of that math.
It also writes the void into the `LaunchBackground` color asset that `Info.plist`'s launch screen names, because the system draws that screen before any Swift runs.
The native TTF fonts are format-only conversions of the skill's Latin Space Grotesk and JetBrains Mono WOFF2 assets, retaining their original names and outlines.
To regenerate them with FontTools and Brotli installed in a disposable Python environment, load each WOFF2 with `fontTools.ttLib.TTFont`, set `flavor = None`, and save it to the matching file under `InfinitaryApp/Fonts/`.
The app includes their SIL Open Font License notice and the Apple packages' license and notice files.
Swift package versions and revisions are pinned in the package and Xcode workspace lockfiles.
