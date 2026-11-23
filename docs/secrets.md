# Secrets

The [Secrets primitive](../primitives/secrets.md) defines shared credential custody and exact-operation authority.
The code provides the protected owner, `ProtectedSecrets` in [`../src/core/secrets/protected.ts`](../src/core/secrets/protected.ts), behind the request coordinator and the optional AXI command seam.
It also provides native custody and fresh system authentication for macOS, Linux and Windows in `src/main/host/`.
The app supplies that custody and confirmation as its Secrets host capability on the person's own data folder on macOS, Linux and Windows ("In the app"), so the core builds the protected owner, Settings → Secrets and the task command.
A run on an isolated or chosen data folder, and every other platform, gets no capability and offers no Secrets.
The explicit host seam lets disposable checks exercise the real controller, trusted cards, secure entry and sealed files without opening a native credential store.
The Google integration's sign-in and the keys of MCP servers a person adds in Integrations are the consumers migrated so far ("App services"); every other consumer in the register keeps its own store.

## Threat model and the accepted boundary

Ordinary shells remain unrestricted.
Task and project context can organize discovery, requests and history, but cannot authenticate a requester or widen secret authority.
Possession of another task's same-user channel file does not confer permission to use its secret grants: task-specific grants are not part of this design.
One protected owner must independently validate the exact recipient and operation against fresh human approval or protected saved rules.
Protect custody and the authority-producing state, not just an encrypted file.
The approved recipient receives a value and is trusted with it; this is not arbitrary-program containment or protection against every same-user malicious program, a compromised OS or an administrator.
Direct and encoded output must not flow to the requesting agent merely because a masking pass found no familiar string.
The default result is state and exit status; any typed projection or artifact needs its own reviewed rule.
Secret permission remains separate from consent for an external action.

`ProtectedSecrets` refuses whenever custody, protected rules, the recipient's checked inputs or the durable journal is unavailable; there is no plaintext, environment or unprotected fallback.
It never accepts an agent-written rules file or a script digest supplied by the requester as proof of approval.
The disposable adapters under `tests/helpers/` are fixtures, not a fallback for real credentials.

## Current command seam

`infinitary-secrets-axi` is shipped through the shared launcher and isolated command process.
It runs only where the host explicitly supplies a Secrets capability; the supervisor then grants its closed facade to local tasks and to a task on a computer that runs work whose app takes such uses, and the catalog alone to a task on any other computer.
The app supplies one on macOS, Linux and Windows ("In the app"), an isolated run supplies none, and a computer that runs work receives a use grant only when its app lists the change that takes such uses ("On a computer that runs work").
Discovery is global: every task's command lists the same secrets the captain added, whatever its project or computer, and the task's name selects nothing.
Bare invocation and `list` return that metadata and current receipts; `show <reference>` describes one entry.
A listed secret carries its environment label when it has one, as context beside its name, never as a filter.
Listing or naming a reference grants no access: each use still needs that entry to be agent-visible and an exact approval or Allow rule.
A task on another computer lists and shows the same catalog: its command there asks the home over the authenticated work route (`inf:work:secrets`), whose answer holds each secret's reference, name, version and environment label and nothing else.
On a computer whose app lists the contract change `secret-uses-elsewhere`, the same command also checks and asks for uses ("On a computer that runs work").
One that also lists `secret-asks-elsewhere` asks the home to keep a secret too, and its crewmate reads the same line as one here; one without it reads `CREWMATE_SECRETS_THERE_LINE`: the same words without the ask to keep a secret, which that command does not offer.
On an older one, `inject`, `status` and `cancel` answer `unavailable` with a fixed explanation, no value, receipt, approval or custody reaches it, and its crewmate reads `CREWMATE_SECRETS_CATALOG_LINE`.
`inject --env '{"SERVICE_TOKEN":"s1"}' --reason 'Check staging' --id staging-check -- /bin/sh ./scripts/check-staging.sh` submits references and an explicit argument vector.
The example neither approves that script nor reads a secret.
The channel adds the calling shell's working folder as the request's working directory, which the recipient binds like any other fact and which never grants authority.
`status <request>` reads a receipt and never executes again; `cancel <request>` withdraws unused authority.
`check --env '<references>' -- <program> [args...]` is the crew's pre-check (see "The crew's pre-check").
Help and version use the ordinary runtime; unknown flags and unsupported commands refuse.
`ask` asks the captain to keep a secret by name, place and reason ("Asking to keep a secret").
There is no `get`, `approve`, raw-output mode or session-wide environment export.
The command has no brokered-operation, private-file or private-input-stream delivery yet.
No command may turn a reference into an agent-readable value.

## The crew's pre-check

Every request is checked before its card, and the crew can run the same checks itself first, so the person fills in nothing (INF-1690's plan, piece 3).
`check` takes the run `inject` would take, from the same shell folder, without a reason or an intent, and `ProtectedSecrets.check` makes the checks `prepare` makes: every named secret is one the crew can use, the working folder exists, no variable is one a recipient keeps from the host, the program is a file from the working folder or on the search path, and a script's `#!` line names an interpreter that resolves.
It answers the first failed check as a typed `problem` (`secret`, `folder`, `variable`, `program`, `interpreter` or `unavailable`, `UseCheckProblem` in `requests.ts`), or the checked run: the program and interpreter by real path, each file argument, the working folder, and the saved decision the exact run meets (`never`, `ask` or `allow`).
An unknown and a hidden secret answer alike, and an answer names no value.
It journals, approves, keeps and runs nothing, and removes the private copies it made while checking.
The channel adds the host's words for the answer (`SECRETS_CHECK_WORDS`, `commandWords.ts`): what failed and what to change, or whether asking raises a card, runs at once under a saved decision, or is refused under a saved Never.
An `inject` that failed its checks still raises no card and answers `unavailable`, now with words that say so and point to `check`; its intent stays spent, so the next request takes a new `--id`.
The older `inf:secrets:rehearse` request evaluates the same way for Settings, which no longer calls it; it goes with the contract's next major.

## Native custody

Custody holds only what the owner cannot protect on its own: a 32-byte random root key, the head of the protected rules record, and the selected directory of a recovered home.
Values never live in custody.
An existing home keeps its two native items unchanged.
A recovered home carries its root, authority head and directory identifier together inside the native root item, so their activation is one native write rather than a file-controlled pointer or a multi-item transaction.
Each app flavor uses its own custody name, so the local dev bundle and an isolated run from source never read the release root.
`pnpm dev` on the person's own data folder is the release flavor for its folders and reads the release root, as the installed app does (`docs/saved-data-compatibility.md`, "A run from source").
On a Mac every Electron signed with the local development identity shares one designated requirement, so an Always Allow the person gives `pnpm dev` on the release root lets every such build on that Mac read it.
Every adapter reports what the platform answered (`value`, `absent`, `locked` or `unavailable`) and never falls back to a file, an environment variable or another store.

On macOS, [`../src/main/host/darwinSecretCustody.ts`](../src/main/host/darwinSecretCustody.ts) keeps each slot as a generic password item in one keychain file it opens by its path, through Security.framework in the app's own process.
The app aims it at the account's own login keychain, and a check at a scratch keychain file it made.
An item the app creates trusts only the program that created it, so another program asking for it meets the Keychain's own dialog.
That is the operating system's program identity, not a promise that a reusable development runtime distinguishes every script it can load.
Production custody proof must use the packaged, integrity-checked app with its code-loading and debugging fuses, not infer that boundary from a scratch runtime's successful Keychain calls.
Every read and write is silent unless the caller asks for interaction: a locked keychain answers `locked`, never a dialog the person did not ask for.

On Linux, [`../src/main/host/linuxSecretCustody.ts`](../src/main/host/linuxSecretCustody.ts) keeps each slot as an item of the schema `app.infinitary.Secrets`, creating it in the default collection through libsecret on the session bus and replacing an existing item in its original collection.
It refuses libsecret's file backend.
Reads search for unlocked and locked paths separately: a locked match returns `locked`, without calling Unlock or Prompt.
Writes check the collection before creating an item, never run a returned creation prompt, and replace existing items through SetSecret, which cannot request an unlock.
Only the explicit `LinuxSecretCustody.unlock()` capability may invoke the service's unlock flow; it checks the resulting lock state rather than treating a dismissed prompt as success.
Potentially blocking service calls run in Koffi's native worker pool; local memory allocation, decoding and release do not make service calls.
Each operation owns a fresh service proxy, rather than keeping a process-wide encrypted session whose daemon may have restarted.
The fake-store tests cover locked reads and writes, racing locks, explicit and refused unlocks, native-item replacement and buffer lifetime; a separate native-thread test checks worker identity without opening a credential store.
Live locked-store verification requires the prepared disposable Linux desktop, a private session bus and a scratch keyring; it never uses the person's store.
The [Secret Service specification](https://specifications.freedesktop.org/secret-service/latest/ch10.html) does not require per-program access control; implementations may add it, and its [unlocking contract](https://specifications.freedesktop.org/secret-service/latest/unlocking.html) allows either per-client or shared unlocking.
The GNOME Keyring backend used by the Linux proof trusts the user's session: while the collection is unlocked, another same-user program can read these items, an agent's ordinary shell included.
With the root and the sealed files, such a program can read every value and bypass Infinitary's approval path.
Other providers differ: KeePassXC's Secret Service integration offers selected-group exposure and optional access-confirmation dialogs, but this adapter does not establish a portable app-bound custody guarantee from them.
Linux custody therefore protects the sealed files and mediates requests through Infinitary, without promising to stop an unrestricted same-user program that directly reaches an unlocked GNOME Keyring.
A stronger boundary needs a separately proven custody design; a sandboxed app's per-application Secret portal alone does not isolate Infinitary's unrestricted crew shells.
The app composes Linux custody with this boundary ("In the app").

On Windows, [`../src/main/host/windowsSecretCustody.ts`](../src/main/host/windowsSecretCustody.ts) keeps each slot as a generic credential in Windows Credential Manager, named for the flavor's custody name and the slot (`Infinitary Secrets/root`, `Infinitary Secrets/authority-head`), through advapi32 in the app's own process.
Each is kept for this person on this PC alone (`CRED_PERSIST_LOCAL_MACHINE`), so a roaming profile never carries the root to another PC.
Credential Manager opens with the person's Windows session and has no lock of its own: it never asks the person anything, and there is no Unlock gesture.
A credential that is not there reads `absent`; any other refusal, such as a run outside a signed-in session where Windows keeps no credentials, reads `unavailable`, never `lost`.
Credential Manager trusts the person's session as GNOME Keyring does: any program running as this Windows user can read these credentials, an agent's ordinary shell included, and with the root and the sealed files read every value and bypass Infinitary's approval path.
Windows custody therefore protects the sealed files and mediates requests through Infinitary, as Linux custody does, without promising to stop an unrestricted same-user program.

The root opens once per owner start and is read again at every use, so a locked or replaced root stops a use that was already approved.
Only the trusted controller's first Add creates a root, and only where nothing was ever sealed.
A missing root beside sealed records is `lost`, never silently replaced; only a restore, the captain's Start over ("Starting over") or a copy's sealed values a first mate takes on a new home replace it ("Sealed for each computer that keeps a copy").

### In the app

[`../src/main/host/nativeSecrets.ts`](../src/main/host/nativeSecrets.ts) composes the capability the app hands its core (`startApp`, `src/main/app.ts`).
Only a run on the person's own data folder gets it: a run on an isolated folder (`INFINITARY_USER_DATA_DIR`) or a folder Chromium was given (`--user-data-dir`) gets none, so no check opens a native store unless it injects its own capability.
The custody name is one per flavor (`SECRETS_CUSTODY_NAMES`): `Infinitary Secrets` for the release and for `pnpm dev` on the person's own data, and `Infinitary Secrets (development)` for the local dev bundle and every isolated run from source.
Renaming one loses every secret that flavor kept, because its sealed files then sit beside no root.
On macOS the app composes the Keychain custody on the account's own login keychain, LocalAuthentication and an Unlock gesture in two parts.
First a silent Keychain process reads that file's lock, and when it is locked, or its lock cannot be read, a fresh one unlocks that same file by its path with macOS's own dialog: the app's own process touched the store silently first, so it can never show that dialog itself ([architecture](architecture.md), "The latch").
Unlock never searches for the store holding an item, so it opens the file custody uses even when another keychain holds an item of the same name.
Then one read of each slot in the app's own process, with the Keychain's dialog allowed, lets the person trust the app with an item again, a dialog the latch does not cover; that read waits on the app's main thread until the person answers.
The Keychain trusts the app that created an item by its signature, so a release signed by another team reads the items as locked until that gesture.
The login keychain's lock is kept per session, so the store is unlocked only for a run in the account's logged-in session, where the log in unlocked it.
`start-at-boot` starts the run there, as a login agent, at boot too once the Mac logs the account in automatically ([run](run.md), "Starting at boot").
Where an installed Mac app's window starts that same run through that agent and opens beside it ([run](run.md), "The window starts it"), Secrets, their confirmations and the Unlock dialog come from the run, in the logged-in session; where the window runs its first mate itself, as when the command cannot start or after Start it here, they come from the window's own process.
A run outside that session, such as one typed over a remote connection or a system job an earlier version set up, reads Secrets as locked, never lost, even after the account logs in at the Mac.
Unlock cannot help it: the window opened beside it asks the run's own process, which cannot show either dialog ([run](run.md), "The window opened beside it").
On Linux it composes the Secret Service custody, polkit and the custody's own unlock.
On Windows it composes the Credential Manager custody and Windows Hello with the password behind it ("Trusted approvals"), with no Unlock, the confirmation's dialog belonging to the app's focused window (`confirmationWindow`, `src/main/windows.ts`) or standing on its own in a run with no window.
Where the platform's native store cannot load (no Security framework, no libsecret, or no Credential Manager), the app supplies no capability rather than a tab that cannot open.
The custody opens the login keychain by its path under the home folder the account's user record names, never the default keychain, because a run outside the logged-in session, such as a system job, can get the Mac's System Keychain as its default.
That path ignores `HOME`, so a check that injects this composition reaches the account's real login keychain even under a throwaway home folder; only the data-folder rule above keeps end-to-end launches off it, and a check names a scratch keychain file instead.
A data folder removed while its flavor's custody items remain opens as `tampered`, the same reading as a rolled-back rules record, and offers a restore from recovery files or Start over ("Starting over").

## The vault

Each value is a record under the selected Secrets home's `values/` directory, sealed with AES-256-GCM under a key derived from the root (HKDF-SHA256) and bound to its own metadata.
The existing home is `<userData>/secrets`; a recovered home is `<userData>/secrets/recovered/<generation>`, selected only by its native custody item.
Each record's metadata carries a check under a separate derived key, so a relabelled or re-versioned file is left out rather than shown or repaired.
Adding or replacing a value writes a private temporary file, syncs it, renames it over the old record and syncs the folder, and raises the version.
There is no reveal: the owner opens a value only to deliver it to an approved recipient.
The protected owner serializes replacements and compares both the displayed version and an opaque revision derived from the exact sealed record before writing.
The Settings form and a Forget offer carry that revision, so removing and re-adding the same reference cannot make an old form or offer apply to its replacement.
The revision is derived when metadata is read, without changing existing records' authenticated encoding.
Metadata includes an environment label, which grants no authority.
A record an earlier version sealed with project/computer discovery links keeps them inside its authenticated bytes: it still opens, its revision is unchanged, and the links are never read as metadata or written again.
Replacing such a value writes the record without them.
Removing or replacing a value invalidates prepared uses, including a reference removed and added again under the same displayed version.
Prepared uses compare the sealed-record revision before consumption and after opening each value; an authentic record substituted at the same version cannot change an already reviewed use.
A prepared use keeps each secret's name, environment label, reference and version from the record it read, so a later replacement never renames what its approval shows.
This binds an edit or use to its record; it does not turn the value files into a rollback-proof store.

## Protected rules

The authority record (`<userData>/secrets/authority.json`) holds the rules, the enrolled approval devices and the home they bind to, under a revision number.
Its check is keyed by the root, and its head (revision and digest) lives in custody, so an agent-written, edited or older valid record is refused.
A refused record makes the rules `tampered`, and every use answers unavailable until the captain restores a recovery backup or starts over ("Starting over"), each under fresh authentication.
Saving needs a fresh local confirmation of that exact revision; it writes the next record, moves the head in custody, then renames, so an interruption leaves one record that matches the head.
A rejected native write keeps its pending record and retires the live owner; reopening reconciles a matching head without repeating the write.
An old or absent head beside a pending record remains unavailable while the process that attempted its native write is still running, even after reopening the owner.
A fresh process first reads custody: a matching pending head finishes the save, a readable old head keeps the last committed authority and discards the unconfirmed candidate, and an absent first head discards that candidate and initializes empty authority.
Locked or unreadable custody discards nothing.
Restart recovery never retries the discarded proposal, needs no backup and permits a new freshly authenticated save.
Rules apply to every required secret together: Never precedes Ask, then Allow, and no match asks.
An Allow rule always names one operation key; there is no wildcard Allow.
The crew's `check` evaluates a run against the rules without journaling, approving or running anything (see "The crew's pre-check").
A person calls a rule a saved decision, and makes one only on a use's approval card (see "Saved decisions").

## Trusted controller

`SecretsSettings` in `src/core/secrets/settings.ts` is the app's Settings/controller interface, constructed without access when the host supplies no Secrets capability.
The core dispatcher composes its routes from `src/core/secrets/handlers.ts`, retaining request validation and authority checks in the dispatcher before calling the controller.
Home-only channels serve its metadata and captain controls; the native export dialog writes metadata history through the private-file owner.
Settings → Secrets is built around keeping a secret; deciding a use happens on the exact-use card.
The Protected secrets section counts the secrets when storage is available, and a badge appears only when storage is locked, unavailable or needs recovery.
Where storage needs recovery, the notice says Infinitary can no longer read what this computer keeps and offers Recovery options, which opens Backup and restore, and Start over ("Starting over").
A line under its buttons says what Start over clears and that it cannot be undone, because a platform's own confirmation may not say: Linux's polkit shows only the installed policy's message.
A waiting request shows as one line naming its secrets, with Review request, which opens the exact-use card.
Searchable rows lead with each secret's name and its place (the optional environment) in quiet text, and say which task last asked for it and when, or that it is waiting, in use or not used yet.
The view's `lastTask` carries that task's title: the controller reads it from the task its own coordinator saw, or from the task a crewmate's intent names in the history (`taskIntent`), so it survives a restart; a request no task made, or by a task the home no longer knows, names only when.
A reference appears only when another secret has the same name and place.
Opening a row offers Replace, Forget and that secret's saved decisions; a temporary read shows on the row as Reading until a time, beside End access.
A hidden entry's row (the view's `kept`, "App sign-ins") instead says Infinitary keeps it for a sign-in made in Integrations and offers Manage in Integrations; the controller refuses Replace and Forget on it.
A server's key (the view's `kept` with `forProgram`, "Programs that keep running") says Infinitary keeps it for a server added in Integrations and gives it to the server each time it starts, without asking, and offers Manage in Integrations with no saved decisions; the controller refuses Replace and Forget on it too.
Secure entry asks for a name, the masked value and an optional place, never a reference: the controller makes one from the name when saving.
Both places that take a value, secure entry and an ask's fields, draw it in `SecretField` (`src/renderer/src/design/core/SecretField.tsx`): a password input that holds the value itself, so a pasted key or certificate keeps its line breaks, which a plain password input drops, while the value stays as hidden from accessibility as any password field.
The form locates the returned entry through the controller's `saved` receipt; replacements keep their existing reference and exact-record checks.
The Access, history & recovery footer opens a page with Saved decisions and Approving devices under Access, and Use history and Backup and restore under History and recovery.
Back returns to the footer or Recovery options without clearing the search.
The main page ends with Signed-in sites in every storage state (`docs/task-browser.md`, "Signed-in sites"): they keep their own storage, outside the protected owner, and the section says so (the consumer register's Remembered websites row).
Saved decisions are the existing Never, Ask and Allow rules, each as one plain sentence with Remove, which proposes the rules without it and asks on that decision's row ("Asking in place"); the page has no rule editor and no rehearsal form: the crew checks a run before asking.
A decision is saved only from an approval card: Always allow this run saves an Allow for that exact run, and Don't allow saves nothing.
A Never or Ask an earlier version saved keeps applying and is listed with Remove, but nothing makes a new one.
The exact-use card's title names the secrets and, in quotes, the task that asked; its body is labelled rows, one fact each, at one width of at most 44rem (`secretApprovalBody` in `approvalCard.ts`, words in `SECRET_APPROVAL_CARD_WORDS`).
The rows are Secret (each secret's name and the variable it goes in as), Runs (the command as a shell reads it, in single quotes and never with backslashes) and In folder for a program, or Sends to and Request for a service, then Its reason in quotes with who wrote it.
On a narrow card, 480 pixels and under, each label sits above its value.
Every checked fact, reference and version folds under one disclosure, what is not checked among them.
Last, one line beside each allow button's name says what that button covers, followed by the standing sentences: what receives a secret can keep it, allowing approves no separate action, and each allow asks for confirmation first.
A failed or unavailable confirmation's status stays the body's first line.
That disclosure, Everything that was checked, says each check in words, one line each (`checkedFacts` in `approvalCard.ts`, words in `SECRET_CHECKED_WORDS`): the program, its interpreter and each file argument by path, whether each runs from a private copy or where nothing the person runs can change it, and the first characters of its fingerprint; the arguments as a shell reads them; the working folder; which variable gets which secret; that output stays private; and what is not checked.
A service's request lists where it goes, what it asks, its result, whether it only reads, and its fingerprint.
The card names each secret among every saved one exactly as Settings does (`secretNames.secretName`): its place when another secret shares its name, and its reference only when name and place both repeat.
A program run starts with the checked program's own path, never the requester's word for it, so a look-alike script shows where it is.
Use history offers export, explicit deletion and storage use.
Adding a secret needs no reference: the controller makes a stable one from its name, never one an existing entry, a saved rule or the history names, and answers with it.
A replacement names its reference; one without a reference is refused.
The command-search entry focuses the Secrets heading in every availability state, and the forms and their actions use the ordinary keyboard controls.
Enabled controls carry no disabled-reason label; unavailable actions keep their current explanation.
Secure entry passes a value directly to the protected owner and returns metadata, never the value, its prefix or an encoded substitute.
It raises app-authored cards for exact uses, and asks in place for forgetting, removing a saved decision, stopping a device's approvals and history deletion ("Asking in place").
A card's private offers are spent once through host chrome; a saved card from a previous process is inert, and an agent-written card cannot mint one.
An Allow click still requires fresh system authentication; a failed or unavailable confirmation leaves the request waiting and reopens its card.
Remove only proposes a change, and native confirmation covers the exact proposed revision.

### Asking in place

Forget on a secret's row, Remove on a saved decision, Stop approvals on an approving device and Delete history ask on the row they are about, never on a card, so the window stays on Settings.
The row's buttons turn into the question: its title, its sentences, Keep and the danger answer, as Remove project asks in Settings → Projects (`SecretQuestion.tsx`).
Keep takes focus once the answers are ready, even if a change notification shows the question before the request finishes, so Enter never confirms by default.
The controller still makes a one-time pass for each answer, as it does for a card, and carries the open question on the view (`question`, `secretQuestionSchema`): what it is about, its words and both passes.
The page answers with the `answer` action on the home-only `inf:secrets:action`, naming the pass; the controller spends it once and runs that answer, checking the secret's exact version and revision, or the authority revision, as the card did.
A pass the controller did not make, one already spent, one from before a restore, Start over or restart, and a card's offer sent as an answer do nothing; a question's pass sent as card chrome does nothing either.
One question is open at a time: starting another Secrets action drops it and its passes, and so does closing its row or area or leaving Settings, which answers Keep.
Remove and Stop approvals still ask the system to confirm after the answer and save nothing when it is cancelled or fails; Forget and Delete history never asked it.
Keep returns focus to the button that asked; after Forget, focus moves to the next secret, or Add secret when none is left.
A paired phone never sees these questions: only this computer's window reads the Secrets view.

### Asking to keep a secret

An agent that needs a secret the captain has not kept asks for it by name, place and reason, never a value, and Infinitary draws its own masked field for the captain to type it (INF-4239, the captain's direction A).
A crewmate runs `infinitary-secrets-axi ask --name '<name>' [--place '<place>'] [--how '<HTML>'] --reason '<why>' --id <ask>`; `--replace <reference>` names a kept secret that stopped working, and `--secrets '<JSON list>'` asks for several on one card.
The name is short, and a place is only a label that tells two secrets of one name apart, such as staging, never where to get it.
When the captain must make or find the secret, `--how` says how ("How to get it" below).
A crewmate on a computer that runs work asks the same way (INF-4239's piece 2): its command sends the ask, or the withdrawal of a waiting one, to the home with one work request, `inf:work:secret-ask`, which carries names, places, references, a reason, the ask's id and its how-to, and never a value (`placedSecretAskInputSchema`, `workSecrets.ts`).
The home must take such asks (`takesSecretAsks`: the computer takes uses and lists `secret-asks-elsewhere`), and the task's spec then carries `secretAsks`; `SecretsSettings.askElsewhere` answers it as the same ask as one here, for the task the work route names, never the request's words, so the card goes up on the home, the captain types the value there or wherever the card is answered, and the task hears the outcome once through its inbox.
A home that does not list the contract change `secret-ask-how` gets the ask without its how-to (`offerAsks`, `secretUses.ts`), and the ask's answer says so (`without: "how"`), so the crewmate puts the steps in its report.
A computer without the change keeps its `ask` answering `unavailable` with words telling it to name the secret and its place in its report, so the first mate can ask with `ask_secret`.
The first mate asks the same way with its `ask_secret` tool, whose `how` is the same how-to.
`SecretsSettings.askToKeep` answers at once: `waiting` while the card asks, `kept` with each reference when every secret it names is already kept under that name and place, so no card goes up, or `unavailable` with words where Secrets is not offered or the secret it replaces cannot be read.
Asking again with a waiting ask's id raises nothing new, and `cancel <ask>` (or `ask_secret` with `cancel`) withdraws it.
A waiting ask is kept in `<userData>/secret-asks.json`, which holds names, places, reasons, how-tos and references and never a value (`SecretAskBook`, `asks.ts`); after a restart each comes back with new passes, and a closed task's ask ends.
`SecretsSettings` answers each ask through `SecretAsks` (`askToKeep.ts`), which raises the ask's card and spends its Save with the controller's own passes and protected owner.

The card is Infinitary's own (`askCard.ts`, INF-5516's plan), one column at one measure.
Its title names one or two secrets short, or counts more, and says Replace when every secret on it replaces a saved one.
Its body is the asker's reason in quotes with who wrote it, then, when the asker gave one, the "How to get it" part.
Its answers are Don't save, an ordinary one-time pass, and Save secret (Save secrets for several), a host effect `secrets-keep` whose argument names the fields (`SecretKeepOffer`) and whose id is a pass only `keep` spends.
The window draws one masked field per secret below the body, at the body's measure and left edge (`SecretAskFields.tsx`), outside the card's frame, so the body's own script never reads it.
Each field's name sits above it, with its place and, for a replacement, the version it replaces, and one line under the fields says where the values go.
Tab reaches each field, Enter moves to the next, and Enter in the last saves.
Save sends the values with the pass in their own request, `inf:secrets:keep`, never as a card choice, so a value never reaches a card answer, its thread, the task record or a log; a Save sent as a card choice does nothing.
The controller spends the pass before it writes, puts each value straight into the protected owner as Add secret does, zero-fills its copy and records nothing of it.
A missing value, a spent or stale pass, or a closed task's ask keeps nothing.
A Save that cannot finish leaves the card up with new passes, and the window or phone that pressed it says why once, outside the card's body (a window above the body, the phone beside the card's buttons, kept through the card's new passes), while a card a restore changed says why above its rows: locked storage adds Unlock, storage that needs recovery points to Settings, and a replaced secret that changed since the card asked names its current version.
What was kept stays kept, and the card asks again only for the rest.
When the ask ends, its asker hears once, through its inbox (`secrets-ask-ended`), each kept secret's name, place, reference and version, that the captain chose Don't save, or that it was withdrawn; never a value.

#### How to get it

When the captain must make or find a secret themselves, the asker says how in an HTML fragment it designs for that case (the captain's write-in on INF-5516's plan: freeform, guided by instructions, never one form for every case).
Numbered steps suit a sign-in and a few presses, a grid of exact names in `<code>` suits scopes to tick, a table suits several places, and `<details>` folds what most people need not read; the command's help and `ask_secret`'s `how` parameter say so.
`secretAskHow` (`askHow.ts`) checks closed facts about it and draws it again from its parsed elements, never the asker's own string: only text, headings, paragraphs, lists, tables, details, figures, code, kbd, mark and links; a class only from the frame's layout classes (`inf-mono`, `inf-muted`, `inf-row`, `inf-grid`, `inf-panel`); no script, style, field, picture, id, `data-` or `on` attribute; and every link a safe address (`isSafeCardHref`) holding only text, which is that address with or without its `https://`, so the captain sees where a link goes before signing in there; and no list `start`, since the card numbers each list's steps from one.
A refused how-to asks nothing, and the asker hears why in words it can act on.
The card draws it under the heading How to get it, with steps numbered in circles, and a line under it says who wrote it and to check each address.
The masked fields stay outside the frame, so nothing in the how-to can read them.

Another Mac's window and the phone answer the same card: each lists the contract change `secrets-ask` in its hello and sends Save through the same request over the connection.
A view that does not list it gets the card without Keep in Secrets (`frameWithoutUnreadActions`, `taskAllow.ts`) and shows the card's line saying where to answer it, which a view that draws the fields hides (`data-inf-secret-elsewhere`); its Don't save still works.
The card lint refuses an agent's own card that holds a password field and points the agent to the ask (`PASSWORD_FIELD_REFUSAL`, `cardLint.ts`).

### Bringing secrets from another tool

A captain who keeps secrets in another tool, such as Automic Vault, a `.env` file or the macOS Keychain, brings them into Secrets without any agent holding a value (INF-4718's plan): the reverse of `inject`.
A crewmate runs `infinitary-secrets-axi bring --from '<JSON>' --reason '<why>' --id <bring>`, where `--from` names the tool in its own word, the source, how its output holds secrets and the names it wants (`SecretBringRequest`, `bring.ts`).
The source is a program to run, `{"run": [argv], "folder"?}`, or a file to read, `{"file": "<absolute path>"}`.
`reads` says how the output holds them: `value` is one secret (exactly one named), `lines` is `NAME=value` lines as a `.env` file writes them, and `env0` is entries ended by a zero byte, as `/usr/bin/env -0` prints; `trim: "newline"` drops one line end from a `value`.
`json` reads exact, case-sensitive field names in one top-level object; it never discovers names from the output, follows paths or coerces non-string fields.
A missing field is `not-found`, a non-string field is `not-text`, and malformed JSON or a repeated requested field keeps nothing.
Each named secret may take another name (`as`) and a place, or replace a kept secret by its reference; `lines` may leave the names out, and Infinitary then reads the source first and lists every name it found before anything is kept.
A shape with any other field is refused, and the command answers at once: `waiting` while the card asks, or `unavailable` with words, and `status` and `cancel` take the bring's id.

The command binds its source before the card goes up (`bindSource`, `bringSource.ts`): a program by its real path and digest, found from the folder (the shell's own when none is named) or on the search path, the interpreter its `#!` line names by path and digest, and the folder by its real path; a file by its real path and digest.
Without `uses`, unlike `inject`, the program runs where it is installed, never from a private copy, because a tool often works only from its own place and a system program such as `/usr/bin/env` will not start from a copy at all.
Just before it runs, the press checks every digest again; a program, interpreter, folder or file that changed ends the bring `changed` with nothing run or kept.

The card is Infinitary's own (`bringCard.ts`): its title names how many secrets and the tool, and its body the tool in the asker's word, the exact command line or file, the folder, the asker's reason in quotes, and what the press does and never does.
The window draws one tick box per secret between the body and the buttons (`SecretBringPicks.tsx`), from the Bring into Secrets button's host effect `secrets-bring`, whose argument names the rows (`SecretBringOffer`) and never a value.
A name Secrets already keeps under that place arrives unticked and says which version it would replace; a value the source holds as empty, larger than 1 MiB or not UTF-8 text arrives unticked and cannot be ticked.
Tab reaches the rows, the arrows move between them, Space ticks and Enter brings.
Bring into Secrets sends the pass and the ids of the ticked rows in their own request, `inf:secrets:bring`, never as a card choice; Don't bring, and Read it for a `lines` source with no names, are ordinary one-time passes (`secrets-decision`).

On the press the controller spends the pass, journals the bring, and runs the program with only the recipient's base variables and none of Infinitary's secrets by default; it discards error output and reads standard output through a pipe into this process's memory, never a file (`readSource`).
For a trusted command that needs an unlock key, `uses` maps environment variable names to discoverable kept references, for example `{"VAULT_SESSION":"vault-session"}`.
This requires explicit names to keep; it is not allowed on a file source or for commands with file arguments.
The card names each reference, version and receiving variable, and the system separately confirms delivery for this run only.
The same protected recipient checks, snapshots, version checks and saved Never decisions as `inject` apply; a saved Allow does not skip confirmation, and a bring never creates a saved rule.
Only the named command receives the supplied keys; it is not sandboxed and must be trusted to handle them.
The key-use journal names the approved program and the input references, not values.
A source that prints more than 8 MiB is stopped and keeps nothing, and one that ends with an error ends the bring `failed` with only its exit code or signal.
The readers (`bringReaders.ts`) parse the output's bytes, and each ticked value goes straight into the protected owner as Add secret does, checking a replaced secret's exact version.
Every Infinitary buffer that held output or a value is filled with zeros once the press ends; a read held for the captain's picks is filled with zeros on Don't bring, at expiry or when the bring ends any other way, and nothing is held across a restart.
A waiting bring is kept in `<userData>/secret-brings.json`, which holds the bound source, names, places and the reason and never a value, so a restart ends it `expired` and tells its asker.
A bring waits the request lifetime from its card, and again after a read.

When the bring ends, its asker hears once through its inbox (`secrets-bring-ended`): each secret's name, place and outcome (kept with its reference and version, skipped, not-found, empty, too-large, not-text or changed), or that it was not brought, failed with its exit code, changed, expired or withdrawn; never a value.
The journal records each run or read of a bring's source, Read it included, as a use whose `requested` line names the tool (`brought`) and the references it would keep, and Settings → Secrets → Use history shows it as brought from that tool.
Bring is offered only on the computer that keeps Secrets: a task on a computer that runs work gets words telling it to name the tool and secrets in its report.
Another Mac's window lists the contract change `secrets-bring` to draw the rows and send Bring; a view that does not, the phone among them, gets the card without Bring into Secrets, and with a line, hidden in the card's body until the host leaves the button out for that view, saying to pick in Infinitary's window on the first mate's computer.

#### How a move starts

A move starts from the captain's words to the first mate, or from Settings → Secrets' Move from another tool, beside Add secret, and the command of the same name (`secrets.move`), which go home and start the ask in the message box for the captain to name the tool (`startSecretsMove`, `src/renderer/src/settings/secretsMove.ts`; INF-4718's plan, piece 2).
The drafted ask asks for one crewmate on the first mate's own computer, so the captain's words place the move where Secrets lives and a bring is offered.
The first mate's `ask_secret` description says, in one sentence, that secrets already in another tool are never asked for: a crewmate moves them with the `bring-secrets` skill.
That skill is the built-in runbook Moving secrets in (`resources/runbooks/bring-secrets/`), which holds the skill and nothing else, so no session is served any of its guidance: every crewmate's skill list carries its name and one-sentence description, and a crewmate opens it only when its task is a move.
The skill holds the rules - never run a command that prints a value, never open a secrets file, names only, one bring per source, the source left untouched - and each tool's recipe is its own file beside it, read only for the tool being moved: Automic Vault (`av list --json` for names, then one `av inject +NAME ... -- /usr/bin/env -0` read as `env0` for the value used everywhere and one per project folder with the project's name as the place), a `.env` file (read as `lines`, its names listed on the card first) and the macOS Keychain (`security find-generic-password ... -w` read as a `value`).

### Saved decisions

The approval card's answers are Allow once, Always allow this (Allow for 10 minutes for an eligible read instead) and Don't allow, drawn as Don't allow, the second allow, then Allow once, so the refusal stands apart from the two allows.
Always allow this asks the system once for two proofs (`LocalApprovals.confirmEach`): one for the shown use and one for the next authority revision with an Allow rule naming that use's operation key for each of its secrets.
The use starts first, because any saved revision ends a use still waiting on the older one; the rule is saved as soon as the program has started (`approve` with `until: "launched"`), while the confirmation is fresh, so a run of any length keeps its decision.
Because Never outranks Ask and Ask outranks Allow, every Ask rule on one of those secrets that covers the run is dropped: one naming the same operation, and one with no operation, which covered every run of that secret.
If the decisions changed in between, the run stands and the rule is not saved, and Settings says so.
The rule's note holds the run in words (`runWords`), and the page and its cards say a decision in one sentence (`decisionWords`), such as "Always give Website deployment to /bin/sh deploy.sh --staging."
Don't allow denies the use without a confirmation and raises no other card; it saves nothing, so the next run asks again.
Removing a decision from Settings asks on its row, naming it in the same sentence, and saves the remaining rules under fresh confirmation; a question asked against an older revision saves nothing.
Settings can only remove: a `save-rules` request that adds or changes a rule, or removes more than one, asks nothing and saves nothing.
The command facade exposes the agent-visible entries' metadata, injection, status and cancellation, not this controller or a broker result reader.
It namespaces command intent IDs by task to prevent accidental collisions; the namespace is not an authenticated identity or an access grant.
A requester that received a waiting or executing receipt hears the terminal metadata through its task's existing durable inbox, once, after cleanup and journaling settle.
Terminal requests invalidate their private offers and withdraw any obsolete approval card.
The caller receives its own cancellation directly, while other waiting requesters still hear the result.
Pending approval and notification registrations remain process-local; after a restart, the requester reads the durable receipt before continuing, never repeats an unknown effect and never reuses an old card.

## Brokered uses and bounded reads

Trusted consumer code registers a `SecretBroker` through `SecretsSettings.registerBroker`; a command, saved record or general request cannot register an adapter.
Registration reaches an owner already open or its next lazy open, and a registered identifier cannot be replaced by another adapter.
A broker binds its checked destination, operation, input digest, secret references and result handling before approval, then uses the same custody, protected rules and journal as a process recipient.
`httpSecretBroker` supplies bearer/header and form delivery without adding a token reader or another protocol owner; its consumer retains transport policy and renewal.
It refuses redirects and omits ambient HTTP credentials.
A raw response remains private for that trusted consumer to take once; neither the command facade, the Settings view nor history receives it.
A completed brokered operation reports completion without inventing a process exit code.

Only an adapter-declared supported read without an explicit Ask or Never rule offers the optional bounded permission.
It covers the exact checked operation and sealed-record revisions for 600 seconds or 20 uses, whichever ends first, including the approving read.
Consumption reserves one count synchronously.
After awaited custody and entry checks, the owner rechecks material and authority revisions, End access and expiration synchronously at the broker handoff, with no intervening await.
It never covers a program launch, renewal or write, and disappears on restart, secret replacement, a protected rule change or End access.
End access stops unused authority, not an already-sent request or a copy a recipient kept.

## App services

An app service keeps its own keys here as hidden entries, through `SecretsSettings` (`keepHidden`, `forgetHidden`, `reference`, `programKeys` and `use`, the `IntegrationKeys` interface in `src/core/integrations/secrets.ts`).
A hidden entry is written with `discoverable: false`: Settings → Secrets lists it by its label, while the crew's catalog, a task's request and a program launch never reach it.
`keepHidden` writes under a reference the service names, or a fresh one no entry, rule or history names; it never replaces an entry the captain added, and it zero-fills the value it was handed.
With `forProgram` it marks a key the service hands a program it starts ("Programs that keep running"), and `programKeys` lists those references, so the service can forget one no saved setting names.
It forgets one only after reading every saved setting whole: a damaged file, or one a newer build wrote, names nothing the service can see, so it forgets nothing.
`forgetHidden` forgets only a hidden entry.
`use` runs through the service's own registered broker and waits for the use to end with the broker's private result.
The Google integration's sign-in and MCP servers' keys are such services today ([Integrations](integrations.md#keys)).

### App sign-ins

A sign-in the person makes in the app itself is their consent to the app's own use of it, so that use asks nothing.
A broker declares it with `signIn` (`SecretBroker`, `httpSecretBroker`): its adapter spends a sign-in made in the app, sent only to an address its own code names.
`prepareBrokered` allows a use with no card, no system confirmation and no saved decision only when the adapter declares `signIn` and every secret it names is a hidden entry not marked `forProgram`; the journal records the method `sign-in`, and history marks the use `signIn` with no approval ("Your sign-in" in Use history).
Anything else is evaluated as before: an undeclared broker, a declaring broker that names a crew-visible secret, and every crewmate run.
Signing out where the sign-in was made withdraws the consent: the service forgets its hidden entry.
A saved decision naming a sign-in's hidden entry no longer applies and is not listed, and the next decision the captain confirms leaves it out of the record (`withoutKept` in `settings.ts`), since every authority write needs a fresh confirmation and none is made silently.
Settings → Secrets keeps listing a sign-in's hidden entry, with no Replace, Forget or decisions: it is replaced by signing in again and removed by signing out, in Settings → Integrations.

### Programs that keep running

A protected launch owns a program's whole run, so it cannot start a program its consumer keeps talking to, such as an MCP server over its pipes.
`programSecretBroker` (`src/core/secrets/programBroker.ts`) serves that consumer instead.
Its facts bind the program and the interpreter its `#!` line names by real path and digest, each argument naming a regular file by its real path, the arguments, the folder, and which variable gets which secret; the operation key a rule names is the digest of those facts.
A file argument is bound by its path alone, because a server's own data file changes while it runs.
Right before the start every path and digest is checked again, and a change answers `changed` and starts nothing.
The consumer's own transport starts the program with the values in its environment, and the broker deletes them from the environment it handed over once the start returns.
The program's handle goes privately to that consumer, and a failed start's words come back with every value replaced.
The keys are hidden entries marked `forProgram` in the vault, the view and the recovery archive.
The person gave them with the program, such as the values on an MCP server's Runs line, and that is the consent to every start of it, as signing in is to a sign-in's use ("App sign-ins").
The broker declares it with `givenWithProgram`, and `prepareBrokered` allows a use with no card, no system confirmation and no saved decision only when every secret it names is a hidden entry marked `forProgram`; a crew-visible entry or a sign-in named for a program asks like any other use, and so does a program's key that a `signIn` adapter would spend.
The journal marks the use's request `given` and writes no approval line, and history marks the use `given` with no approval ("Added with the program" in Use history).
A saved decision naming such a key no longer applies and is not listed, as with a sign-in's (`withoutKept`).
Unlike the recipient, the program runs in place rather than from a private copy, with its consumer's environment rather than the recipient's short list, and its output goes to the consumer, which keeps talking to it.
The rest of its environment, what its files hold, other files it reads, programs it starts and what it does with the secrets are not checked.
No card or record tells the person so at each start: adding the program with its keys trusts it as added, and Use history lists each start by its secrets, its reason and its program, marked "Added with the program", with nothing about what was or was not checked.
An interpreter its `#!` line names in a form the recipient refuses (more than one argument, or a name the search path does not resolve) is not bound, and the program still starts.
The MCP transport may start the program a second time while connecting, to learn which protocol it speaks; both starts belong to the one use.

## The recipient

[`../src/core/secrets/recipient.ts`](../src/core/secrets/recipient.ts) binds the program, its interpreter and every argument naming a regular file by digest.
A file this user could change, by writing it or any folder above it, is copied into the use's private folder and runs from there; one it cannot change runs in place and is hashed again right before it starts.
A script's interpreter is started directly with the script's copy, so neither its `#!` line nor the search path is read again at launch.
A `#!` line needs an absolute interpreter and at most one argument; `#!/usr/bin/env NAME` resolves NAME on the search path when the use is prepared, and any other form is refused.
The working directory is bound by its real path.
The recipient's environment is a short list of base variables from the host environment plus the approved values; a mapping onto a base variable is refused.
Its output stays private and is removed with its folder when the use ends; removal is not secure erasure.
Opening private output files and rechecking the bound recipient finish before the owner's final synchronous authorization check, with no await between that check and process spawn.
The operation key a rule names is the digest of these facts.
Sibling files a script reads while it runs and programs the recipient starts are not bound, a recipient's own children may outlive it, and a program that cannot run from a copy cannot be served this way.

On Windows the same rules hold, with four differences.
A program (`.exe` or `.com`) runs where it is, because it needs the libraries beside it: it is bound by digest and hashed again right before it starts, and the card says so ("runs where it is and is checked again right before it starts") wherever it is read, by its path's drive letter, rather than claiming nothing the person runs can change it.
Windows starts only a program directly, so anything else needs a `#!` line, and a batch file, which only a shell runs, is refused.
A name is found as that name with `.exe` or `.com`, looked up in Git Bash's own order: the Git for Windows the app uses (its `mingw64\bin`, then its `usr\bin`) before Windows' search path, so a typed `bash` or `#!/usr/bin/env bash` is Git's bash, never WSL's `bash.exe` in System32.
The program starts with that same order as its `PATH`, so a script finds `cat`, `grep` or `sed` as it would in Git Bash.
A `#!` line's POSIX interpreter names Git Bash's own program in that Git (`/bin/sh` and `/usr/bin/bash` are its `usr\bin\sh.exe` and `usr\bin\bash.exe`), so a script written for Git Bash runs as it would there.
The base variables add what a Windows program needs to start and find its folders (`WINDOWS_RECIPIENT_VARIABLES`: `SystemRoot`, `PATHEXT`, `USERPROFILE`, `APPDATA`, `TEMP` and the rest), read from the host in any case, and a mapping onto one of them in any case is refused, since Windows reads a variable's name in any case.

## On a computer that runs work

A crewmate on a computer that runs work asks for a use as one here does, and Secrets on the home decides it (INF-4207's plan, piece 6).
The home must take such uses (`takesSecretUses`: the computer takes secrets and lists `secret-uses-elsewhere`), and the task's spec then carries `secretUses`, which grants that computer's command `SecretUsesThere` (`src/core/helper/secretUses.ts`).
It binds the recipient there, where the program runs, in a private folder of that computer's app (`secret-runs`), and sends the bound facts to the home with `inf:work:secret-use`: `check`, `inject`, `status`, `cancel` and how a run `ended`.
The home answers through `SecretsSettings.elsewhere`, for the task and computer the work route names, never the request's words.
`ProtectedSecrets.prepareElsewhere` makes the same checks, journal lines, card, saved decisions and history as a use here, and the card and history name the computer ("On computer", `computer` on a history use).
A saved decision's operation is `elsewhereOperation`: the digest of the computer and the bound facts, so a decision saved for one computer never covers the same program on another, and the intent is named by computer too.
Once the use starts, the home's last authorization check hands its values to `SecretHandoffs`, and the computer takes them once with `inf:work:secret-take`: the take checks the saved decisions again at that moment, answers the values once, and answers `taken` to any other call after that.
The work route asks a call cut off by a dropped connection again under the same call id, so that one call receives the same values again until the use ends or its lifetime passes.
That computer checks its bound files again, starts the program with the values in its environment from its private copies, fills the value buffers with zeros, and reports the exit code or signal with `ended`.
A change before the start ends the use `invalidated`, values never taken within the request's lifetime end it `unavailable`, and a start that failed or was lost after the take ends it `unknown`.
A program keeps running when its task closes, and a report of how it ended counts only until the home hears that its conversation there is gone, so a program that outlives its task almost always records `unknown`; once the home hears that computer closed the task's conversation for good, or that computer restarted, a use whose values were taken and that has not reported ends `unknown`, one started but not taken ends `unavailable`, one still waiting is cancelled, and a take still waiting from before answers `unavailable`.
The values cross only the authenticated work route, as base64 strings that JavaScript cannot fill with zeros, and the ledger of work requests keeps neither channel.
The home must be in reach to start a new use: a take that cannot reach the home starts nothing, and the home ends the use when no take arrives.

## Journal and reconciliation

The journal (`<userData>/secrets/history.jsonl`) records each use's request, approval, consumption and end, one line per event, synced before the call returns.
Each line carries a check chained to the line before it, so a forged or edited line ends what is read.
Consumption is written before the recipient starts; a journal that cannot be written refuses the launch.
At the next start, a use consumed with no recorded end is `unknown`, because its effect may have happened, and a use still waiting is `invalidated`.
The same intent ID then answers its earlier receipt instead of running again, so a restart never replays a use.
Private folders a previous process left are removed at start.
Truncating the journal's last lines is not detected.

## Trusted approvals

A human Allow needs the operating system to confirm the person now, for that one use.
On macOS, [`../src/main/host/darwinFreshAuthentication.ts`](../src/main/host/darwinFreshAuthentication.ts) asks LocalAuthentication's device-owner policy (Touch ID, a paired watch or the login password) through a new context every time.
On Linux, [`../src/main/host/linuxFreshAuthentication.ts`](../src/main/host/linuxFreshAuthentication.ts) asks polkit for the action `app.infinitary.secrets.approve`, whose policy is meant to keep no confirmation (`auth_self`).
Only `pkcheck`'s exit 0 confirms, and `pkcheck` and `pkaction` run only from a root-owned system folder with an environment of their own, so a program on the person's search path cannot answer in polkit's place.
The trusted app card names the exact use; the native dialog uses the installed policy's fixed message because polkit refuses request details from an ordinary app process.
The app does not acquire root privileges or grant itself action-owner authority to supply those details.
The [Linux packages](linux-packages.md#secrets-confirmation) carry the polkit policy, whose active-session default is `auth_self`, with inactive and other sessions refused.
Where that action or a desktop authentication agent is unavailable, a human Allow cannot obtain fresh confirmation; the app offers no fallback.
An AppImage cannot install system policy, and a Nix user-profile install alone does not register an action with the system's polkit.
On Windows, [`../src/main/host/windowsFreshAuthentication.ts`](../src/main/host/windowsFreshAuthentication.ts) asks Windows Hello (a PIN, a fingerprint or a face) through `UserConsentVerifier` every time, its dialog belonging to the app's window through `IUserConsentVerifierInterop`, or standing on its own in a run with no window.
Where Hello is not set up, is turned off by policy, or has no device, it asks for the person's Windows password in Windows' own credential dialog, offering only this Windows user; Windows itself checks the password (`LogonUserW`), and only a password of this same user confirms, compared by security identifier.
A Hello the person dismissed, failed or that is busy confirms nothing and never falls back to the password.
The password stays in a buffer filled with zeros once Windows checked it, and the dialog's own answer is filled with zeros before Windows frees it.
A confirmation becomes an in-process proof bound to one use's digest and expiry, spent once and never saved, so no approval survives a restart.
A request expires after 300 seconds.
A computer that cannot confirm the person, such as a headless start, refuses local approval and waits; it still serves saved rules and remote decisions.

## Remote decisions

A device approves from elsewhere only with a P-256 key enrolled for this purpose, never its paired-view identity, and each re-enrollment raises its generation.
Each waiting use gets one random nonce, and a decision passes only when the device, at its current generation, signed the home, request, digest, nonce, expiry and decision.
Racing decisions spend the nonce once, and challenges live in memory only.

The signed bytes are `decisionMessage` in `src/core/secrets/approvals.ts`: the format line, one `binding:value` line per entry of `DECISION_BINDINGS` in order, then `decision:allow`, joined by newlines.
The signature is ECDSA P-256 over SHA-256, DER, base64, checked by `verifyDecision`.
The phone builds the same bytes from `PhoneDecision`, which `scripts/generate-phone-contract.ts` writes from those constants, and InfinitaryKit's `Fixtures/secrets.json` holds a real challenge the phone signed, which `approvals.test.ts` checks with the home's verifier.
A refusal is never signed: any paired view that may change things can deny a waiting use.

A paired view reaches this through three channels, each answered in `SecretsSettings`:

- `inf:secrets:approvals` reads one device's enrollment and the uses waiting now, described as their approval cards describe them; a use's challenge goes only to an enrolled device.
  Each requested secret comes with its name, environment label, reference and version as the use prepared them, never its value, so two secrets with the same name stay apart.
- `inf:secrets:enroll` offers a device's key.
  It raises a host card only while Secrets is set up and open and the key is a P-256 key the home does not already hold for that device, or the key it holds offered from a paired phone it has not linked that key to.
- `inf:secrets:decide` carries one signed Allow or one Deny.

A computer that controls a first mate asks these three, and `inf:secrets:keep`, which carries the values typed on an ask's card with its one-time pass ("Asking to keep a secret"), and no other Secrets request (the other Secrets channels' `reach` is `home`, `docs/view.md`, "What the window asks").
Secrets settings, entry, rehearsal, history, permissions and recovery stay on the home, and its Secrets tab and command are not offered there.

Enrollment is the captain's on this computer.
It is set up where the phone is listed: Settings → Devices shows a switch, Approves secret uses, on each paired phone's row while Secrets are set up and open (`PhoneApprovals.tsx`).
Turning it on (`ask-phone`) asks that phone, and only that one, to offer its key: its next `inf:secrets:approvals` answers `asked`, and the phone offers its key by itself.
The row then says it waits for the phone, then that the phone offered its key, with Compare codes, which shows the card.
Turning it off before the card is confirmed (`cancel-phone`) stops asking and takes the card down; turning it off once the phone approves asks Stop approvals under the switch ("Asking in place").
The asking is process-local, like the cards it leads to, and enrolls nothing by itself.
The home records the paired device whose request offered the key (`paired` on the enrolled device, named by the connection through `askingView`), so the switch reads on for that phone's row; it is a name, never authority.
The same key offered again from a paired phone the home has not linked it to, such as a key enrolled before the home recorded which phone it came from, raises the same card, and confirming it links the key at the next generation.
The card shows eight digits from SHA-256 of the offered key (`approvalCode`), which the phone computes from its own key and shows in its Settings; the captain compares them, and only Confirm and allow on this computer, with this computer's fresh confirmation, saves the device into the authority file at its next generation.
The phone's own copy of that card says to do it on the computer.
Settings → Secrets → Access, history & recovery → Approving devices also lists each enrolled device with its code and Stop approvals, which asks the same question on its row and the same system confirmation.
A change of devices moves the authority revision, so a use already waiting under the earlier authority is invalidated rather than run.
A restore from a recovery backup keeps no enrolled device ("Recovery boundary"), so each phone sets up approvals again.

On the phone (`ApprovalKey.swift`, `PhoneSecrets.swift`), the key lives in the Secure Enclave with `.privateKeyUsage` and `.userPresence`, on a device with a passcode, and never syncs or leaves it.
A device refuses a software key, whether kept or loaded, and signs with none; without a Secure Enclave it keeps no key rather than falling back to one.
A new key keeps the phone's device name and replaces the kept record in one write, so the earlier key stays when that write fails.
A Keychain the phone cannot read now stops the replacement, rather than counting as no key.
The phone's Settings shows the same switch, Approves secret uses, which turning on offers its key as the computer's asking does; while it approves the switch stays on and says to turn it off in Settings → Devices on the computer, which confirms that too.
Offering the key (`setUp`) reads the kept key again before it makes a new one, so a key the phone could not read while it was locked keeps its enrollment; only a record the phone refuses, a software key on a device (`PhoneError.unusableApproval`), is replaced.
A record the Keychain gives back whole but the phone cannot decode is damaged (`PhoneError.damagedApproval`), never a read that failed: loading, offering the key and a new key all refuse it and write nothing.
Settings then says the phone's approval setup is damaged and offers Set up approvals again, the only choice that replaces it.
It reads the record again, and only while it is still the same damaged bytes does it make the supported key and replace the record in one write.
A failed read, a device that cannot keep a key, a changed record or a failed write leaves those bytes as they were; nothing deletes the record first or falls back to a software key on a device.
The damaged record's device name cannot be read back, so the new key takes a new one, which the computer enrolls only after the ordinary code comparison and its own confirmation.
An enrollment the computer holds under the earlier name stays until the captain stops it in Settings → Devices or Settings → Secrets; nothing it allowed carries over.
Each Allow evaluates a fresh `LAContext` with no reuse, naming exactly what it gives, before the key signs; a failed confirmation sends nothing.
A use's approval card on the phone shows every choice the computer's card carries, in its footer order, and reads which answer each gives from the start of its pass (`allow-once:<id>`, `SECRET_USE_ANSWERS`).
Allow once confirms and signs on an enrolled phone holding the use's challenge; on a phone that is not enrolled it stays drawn, sends nothing, and its press says to turn on Approves secret uses or allow on the computer, as the note above the choices does.
A saved decision or a short read allowance is made only on the computer: Always allow this and Allow for 10 minutes stay drawn on the phone, send nothing, and their press says to do it on the computer, as the phone's other computer-only choices do.
Don't allow refuses from any phone.
Only an executing or completed Allow, or a denied Don't allow, marks the phone's choice accepted; waiting, refusal and uncertain outcomes retain their explanation instead.
A later successful key read clears an earlier locked-store problem without replacing the key.
The computer's card title names one or two secrets as "the X secret" or "the X and Y secrets" and the task that asked.
The phone names each secret by the `name` the computer sends with it, the one its card uses, so the title, the foot and the confirmation agree; from an older computer it names a secret from its label and environment.
When the title holds that exact phrase, the foot above the choices names no secret again, so the choices stay pinned in the card's frame on an iPhone beside a title that runs to three lines.
Otherwise, with three or more secrets or an older computer's title, the foot names each requested secret, one line each: its name, then its environment label, and its reference only when another secret of the use shares its name and environment.
The system's confirmation names the same secrets and the task (`task`), or the recipient when no task is named.
The shared approval body names each secret the same way, describes confirmation without assigning it to a particular device, and labels temporary read access as available only on the computer.
Like every card's choices, these take a press only once the card's body is revealed at its drawn height (`docs/ios.md`, INF-1574).
The simulator has no Secure Enclave, so there the key is a software key behind the simulator's own Face ID.

A Mac that views the first mate's computer approves the same way (`MacApprover`, `src/main/view/macApprover.ts`), set up once on the home like a phone.
Settings → Devices shows Approves secret uses on a paired Mac's row too (`approvesSecretUses`); turning it on asks that Mac, which makes a P-256 key and offers it from its window.
Its key lives in that Mac's login Keychain under its own name (`SECRET_APPROVER_NAMES`, apart from that Mac's own Secrets), only on the person's own data folder, and its public half is all that leaves.
The home's enrollment card shows in that Mac's window with the code that Mac computes from its own key added beneath, and the captain confirms on the home.
Each use card's action passes name their answer (`allow-once:`, `deny:`, `allow-short:`, `allow-always:`, `secretUseAnswerOf`), a fact the home declares, so the Mac knows which press is an Allow.
An Allow once pressed in that Mac's window never reaches the home as a press: the Mac reads the use's challenge, asks its own LocalAuthentication (Touch ID or its password), signs, and sends `inf:secrets:decide`.
A Mac never set up, or one whose key the home does not hold, refuses with where to set it up; a lasting allowance is refused with words that send the captain to the home, and Don't allow goes to the home as pressed.
The home leaves any Allow pass a paired view presses unspent (`askingView`), so its own confirmation never rises for a press made elsewhere.
The phone check's `testSecretsApprovals` enrolls the simulator, allows one brokered read with its Face ID and denies another, against the real controller with disposable custody.
Before it allows, it reads the shared body's prepared environment and computer-only temporary scope, scrolling to that scope while the choices stay pinned.

## History

History is the journal read as metadata: what was asked, which secrets, the bound program, the requester's reason shown as theirs, how it was approved and how it ended.
It never holds a value, an environment or a full request body.
It stays until the captain deletes it, and the owner reports its storage use and exports it; deleting it refuses while a use is running.
It is local evidence, not an immutable audit log.

## Not yet proven

These remain unproven in the app:

- Saved decisions, phone approvals, history export and storage use, and End access against native custody, beyond the journeys' disposable custody.
- An Allow from a real iPhone or iPad, whose Secure Enclave key and Face ID, Touch ID or passcode only a device has.
- An Allow from a second Mac's real Touch ID and Keychain, and a program run on a real computer that runs work over its work route.
- An Allow on a real Windows PC through Windows Hello or the Windows password, which only a person at the PC can answer.
- Each consumer migration in the register below.

No real keychain or signing access occurs in a check without the captain's separate consent.

## Saved product settings

Rollout is staged: finish each migrated owner together with all readers and tests before the next cutover.
Existing lock behavior stays unchanged; an approval request becomes a card waiting for the captain to return.
The first protected rollout covers macOS and Linux together; Windows follows with the same owner.
History stays until the captain deletes it, with export and a clear storage-use display, never an arbitrary record-count cutoff.
History records metadata, not values or full request bodies, and is not immutable audit evidence.
Shell support includes exact one-off commands/scripts and reusable reviewed scripts, never implicit evaluation of an arbitrary command string.
New secret policy is Ask; Never overrides Ask, then Allow, with all required secrets evaluated conjunctively.
Fresh human authentication, 300-second request expiry and one-use program approval remain required.
The optional 600-second/20-use permission applies only to supported brokered reads through the protected owner, not unrestricted commands or renewal.
Settings → Secrets exposes searchable metadata with each secret's last use, saved decisions, phone approvals, history and recovery, trusted Add/Replace, End access and export/storage display through the host seam, which the app fills on macOS, Linux and Windows.
Without that capability, Settings offers no Secrets tab and command search no Open Secrets: nothing a person can open and not use.
The window asks `inf:secrets:shown` once, which answers from the host seam without opening storage.
Asked to show a page of Manage, the first mate's `secrets-page` offers a card whose Open Secrets opens Settings → Secrets on that page (`item` `decisions`, `phone`, `history` or `copy`); every act there stays the captain's, and no value reaches the first mate.
No reveal, partial-value display or clipboard export is planned, and an agent never draws a field for a secret: it asks, and Infinitary draws the field ("Asking to keep a secret").

## Consumer register

Every row but Google's sign-in and connected programs remains unmigrated; this is the maintained source-to-owner contract, not an assertion that direct readers are retired.
A migration includes writers, every reader, replacement/renewal, interruption, rollback and old-app compatibility, without permanent dual writes or plaintext backups.
The current owner retains protocol and lifecycle decisions; Secrets supplies custody, scoped use and atomic versioned replacement.
Public certificates, host pins, fingerprints, token counts and non-secret metadata do not become vault values.

| Area | Current entry points | Adapter and required preservation |
| --- | --- | --- |
| Google sign-in (migrated) | `src/core/integrations/secrets.ts`; `providers/google/{googleIntegration,movedKeys,store}.ts` | A hidden entry used through the `google-sign-in` broker ("App services"); the access key stays in memory, one renewer at a time replaces the entry in place, and an earlier version's key file moves once and is removed. |
| Connected programs (migrated) | `src/core/integrations/providers/mcp/{runs,store,mcpIntegration}.ts`; `src/core/secrets/programBroker.ts` | Each `NAME=value` on a server's Runs line but `PATH` is a hidden `forProgram` entry the line names as `NAME={secret:REF}`, handed to the server's program at each start, with no question, through the `mcp-server-keys` broker ("Programs that keep running"); an earlier version's line moves once at launch, and a computer without Secrets keeps the values on the line as before. |
| Pi accounts | `src/core/pi/{accountVault,piAccountBackend,piAuth,modelRuntime}.ts` | Inject a Secrets-backed CredentialStore for account and base auth stores; retain serialized refresh and account lifecycle. |
| Usage, Copilot and models | `src/core/quota/{auth,fetchQuota,http}.ts`; `src/core/pi/copilotMeter.ts`; model/account readers | Use the same account adapter; remove direct-file routes without confusing unavailable with signed out or adding renewal. |
| Custom APIs | `src/core/pi/{customApiAccounts,customApiTransport,customApiPi}.ts` | Keys and secret headers in custody; credential-free Pi configuration and existing destination policy; Settings-approved Custom connection shell token commands retain their renewal and output isolation, outside the protected-recipient boundary. |
| Decision models | `src/core/decisions/jev/jevKeyStore.ts`; `openRouterDecisionModel.ts`; `src/core/pi/decisionModels.ts` | Scoped service access instead of per-model key files; preserve model routing. |
| Claude | `src/core/claude/{claudeAuth,claudeQuota,claudeStoreLease,session}.ts`; `src/main/host/{darwinKeychain,claudeKeychainTool}.ts` | Delegated vendor custody through one access adapter; installed client and renewal remain vendor-owned, with no copied permanent token store. |
| Forge and Git | `src/core/forge/signIns.ts`; `providers/`; `src/core/workspace/forgeAuth.ts`; `resources/git-askpass` | One per-host credential route for APIs, attachments and exact Git use; retire askpass's direct file read. |
| Remembered websites | `src/core/browser/{webSignIns,taskBrowsers,savedSignInGrants}.ts`; `src/core/placed/placedBrowsers.ts`; `src/main/host/taskBrowser.ts` | Each computer's kept browser profile, its explicit grants and per-site rules, with no sign-in copied to a file or between computers. |
| Desktop identity | `src/core/devices/{identity,ownKey,joinedHome,dial,ssh}.ts` | System-only keys/signing/connection adapters, preserving bootstrap and pairing; no agent discovery. |
| Phone card pushes | `src/core/devices/pairing.ts` (`devices/pushes.json`); `src/core/phonePush.ts`; `src/core/homeMove/record.ts` | Each paired phone's sealing key and relay grant, kept in plain text in the record beside its device entry, so a home move and standby copies carry it as they carry the record (`docs/phone-push.md`); a migration keeps `DevicePairing` as the one writer, forgets the entry with its device and on the relay's refusal, never writes over an unreadable file, and keeps both values off logs and the relay's view of the card. |
| iPhone/iPad identity | `PhoneIdentity.swift`; `JoinLink.swift`; `PinnedTransport.swift` | Device-only native custody; separate fresh-authenticated exact-approval capability, not ordinary paired-view authority. |
| Temporary capabilities | `src/core/axi/channel.ts`; `src/core/devices/pairing.ts`; `src/core/browser/connectionGuard.ts`; OAuth state/proof keys | Explicit ephemeral lifetime and recipient, not generic durable vault entries or protected task identity. |
| One-use passwords | `src/core/devices/sshPassword.ts`; remote login and system installer authentication | No persistence; exact recipient or delegated system authentication, not reusable captured passwords. |
| Shell and remote work | `src/core/hostEnv.ts`; `src/core/jobs/jobManager.ts`; `src/core/claude/claudeSessionOptions.ts`; `src/core/helper/` | Audit inherited credentials, separate recipient environments and reference-only task/session specifications. |
| Development evaluations | `scripts/evals/runner.ts`; `scripts/check-account-models.ts`; `scripts/bench/attempt.ts` | Same service/account adapters and live-check consent, no parallel credential reader or renewer. |
| Build, signing and release | `.github/workflows/`; `scripts/phone-{certificates,release}.ts`; local signing/release scripts | Explicit delegated CI/platform custody and short-lived recipients; no copying signing material or organization credentials into a desktop vault. |

## Recovery boundary

The private archive codec in `src/core/secrets/recoveryArchive.ts` encrypts values, their metadata and historical use metadata with AES-256-GCM under an independent random recovery key.
An archive an earlier version wrote with discovery links still opens; its links are dropped after authentication, and a new archive never carries them.
The file header is authenticated, and both authentication and strict schema validation precede any restore staging.
The archive contains no native root, rules, enrolled devices or live approvals.
Its separate key has no reset, and possession of both files permits reading every archived value.
`ProtectedSecrets.backupRecovery` asks for fresh native confirmation and delivers the archive and key only to a trusted native writer callback, never through a general IPC, agent command, card or return value.
It refuses damaged or unreadable entries instead of silently making an incomplete backup, clears its buffers after the writer returns and reports a thrown write as unknown rather than retrying it.
The private native writer in `src/main/host/secretRecoveryFiles.ts` creates the two chosen files exclusively with private permissions, syncs their contents and directories, and never overwrites an existing archive or key.
A partial save leaves its newly created files in place and reports that the pair is incomplete; two destinations cannot commit atomically.
Native file dialogs choose both destinations or source files without sending their paths or contents through renderer, task or general IPC channels.
The reader accepts only regular files and an exact-length recovery key, refuses final symbolic links, and never prints a parse error containing archived data.
Settings → Secrets → Access, history & recovery → Backup and restore explains separate key storage, replacement of values, reset permissions, retained history and incomplete or unknown outcomes.
Cancelling file choice or native confirmation grants nothing and changes no stored values.

`src/core/secrets/recoveryHome.ts` provides the private activation boundary for a durably staged generation with a fresh root and empty authority.
Its caller must finish authenticating and syncing every staged file before activation.
The native root write atomically selects that generation and its authority head; reopening before that write sees the previous home, and reopening after it sees the selected home.
A lost write response is reconciled by reading native custody, not by repeating the write.
An unreadable result stays unknown and its staged files must remain.
A thrown native write also stays unknown when readback still sees the old root: an unchanged observation is not a refusal, and the already-sent write may finish later.
A missing or malformed selected generation refuses instead of falling back to legacy files, and a missing root beside any prior protected records refuses initialization.
Older builds that cannot read the native envelope refuse its non-root-sized item rather than creating a new root.
This boundary does not itself authorize restoring or delete previous history.
`ProtectedSecrets.restoreRecovery` authenticates the archive, obtains fresh native confirmation, then pauses its request coordinator before staging.
The pause refuses an executing effect, drains unfinished preparation and confirmation, invalidates unused approvals and blocks new submissions until it is released.
Undelivered broker results also refuse recovery; already delivered values and external effects cannot be recalled.
`recoveryStage.ts` creates a fresh root and empty authority, re-seals the values, and verifies their reads before syncing the value directory, generation directory, recovered parent and base.
Only then does it attempt native activation, once.
A committed or unknown activation retires the old owner, clears its mutable derived keys and invalidates earlier Settings offers; reopening selects only the native-selected home.
Temporary permissions end before staging, while saved permissions change only on activation.
A failed stage never replaces the selected home, and an unused encrypted stage may remain if cleanup fails.

The journal re-keys authenticated local history with its original timestamps and stores imported archive history separately with authenticated source and recovery-time metadata.
Damaged authority does not discard history that the readable root still authenticates; recovery opens that journal independently of the unusable authority.
Imported request identifiers are namespaced, pending imports become invalidated or unknown, and imported records never become receipts or live approvals.
Earlier history files remain across generations, including records that cannot be authenticated after root loss, until explicit history deletion.
Storage use counts those retained files; deletion removes history across generations but never recovery archives or exported copies.
Deletion shares the journal's append writer and refuses while any request is pending or running, so it cannot erase the identity a later outcome still needs.
If deletion fails partway, new journal writes refuse until deletion completes or the owner reopens, rather than extending an uncertain on-disk chain.
Mutable working buffers are cleared, but immutable JavaScript strings remain subject to garbage collection rather than a claimed secure erase.

### Sealed for each computer that keeps a copy

The same archive also travels with the first mate's copy on another computer, but only sealed to that computer's own lock, which it made once the captain confirmed there (`docs/devices.md`, "Secrets on a computer that keeps a copy").
`ProtectedSecrets.sealForStandbys` makes the archive under a fresh key and hands it, with the home's id, to a callback that seals the key to each lock and keeps only what it returns; it asks no confirmation of its own and clears the archive, the key and the contents once the callback returns.
`ProtectedSecrets.sealedState` says what the values are now without opening one, each record's opaque revision, so the copy is sealed again only when one changed.
`ProtectedSecrets.adoptStandby` is restore's path: the same authentication of the archive, the same pause and the same one native activation of a fresh generation, with no saved decisions and no approving devices.
Where Secrets on that computer hold no value of their own it asks no confirmation of its own, since that computer's lock already holds the captain's confirmation.
The Settings controller replaces values a computer already keeps only when the captain chose the copy's on that computer's card, and then `adoptStandby` asks a fresh confirmation there first, as a restore does; a refusal keeps both sets as they are.

### Starting over

A data folder removed while its flavor's custody items remain opens as `tampered`, the same reading as a rolled-back rules record: the owner cannot tell a removed folder from an agent hiding one, so it never treats leftover items as a fresh start.
A root missing beside sealed records opens as `lost`, and a damaged rules record as `tampered`, with the same way out.
`ProtectedSecrets.startOver` is that way out when no recovery backup exists: Settings → Secrets offers Start over only where storage reads `lost` or `tampered`, and an available, uninitialized, locked or unavailable store is left as it is without asking anything.
An owner that opened without its records keeps that opening's reading, so the Settings controller opens the store again before asking, as Unlock does: a data folder or root item that came back while the app ran is used, never replaced.
It asks for fresh native confirmation with its own reason, then runs restore's path with no archive: the same pause of the request coordinator, a fresh root and empty authority in a new generation, the readable history re-keyed, and one native activation that replaces the leftover custody.
The values the old root sealed stay where they were, unreadable for good; nothing is imported and no history row is marked recovered.
Refused confirmation, running uses or uncollected results change nothing, and a changed or unknown activation is never repeated.
A started or unknown outcome retires the old owner and invalidates earlier Settings offers, exactly as a restore does.

## Migration and recovery

Coordinate each old writer, journal the migration, verify values/versions and switch all readers atomically before retiring the old value.
Test interruptions around each transition, concurrent refresh, replacement, rollback and old-app encounters.
Stop before cutover when native protection or recipient compatibility is unavailable; do not silently remove the feature or mislabel legacy custody.
Preserve account labels, existing explicit grants and sign-in lifecycle without widening access or unnecessary sign-ins.
Google invocation consent, injection/exfiltration safeguards and deletion obligations remain separate from encrypted custody and from INF-958's readiness work.
Recovery uses a separately held recovery key; restore invalidates transient permissions and re-establishes device trust.
Non-exportable keys use their owner's recovery or re-enrollment.
Ending future use, local forgetting and provider revocation are distinct, and backups may retain old records.

### Packaged Mac proof fixture

`tests/fixtures/native-secrets/entry.ts` is a separate, opt-in packaged entry, never the production entry.
After the ordinary build, `node scripts/prepare-secrets-fixture.mjs <output> <runtime-root> <evidence-folder>` prepares an unsigned Apple silicon package configuration in a new output folder without signing, creating a Keychain, launching or uploading.
The configuration keeps the release's hardened runtime, entitlements, fuses and archive integrity; signing remains a separately consented operation.
The runtime and evidence paths are compiled into the fixture, so a signer on another Mac supplies the destination computer's paths.

The runtime folder is disposable, resolves to its exact path and contains a regular `fixture.json` with `{"purpose":"infinitary-native-secrets-fixture"}`.
Before a separately consented launch, its `home/Library/Keychains/secrets-proof.keychain-db` must be a newly created test store, and the evidence folder must exist.
The launcher sets `HOME` and `CFFIXED_USER_HOME` to that `home`, and `PI_OFFLINE=1`; the fixture refuses any other home or an unpackaged launch.
The unrelated sign-in backend returns absent through the desktop Keychain seam, while Secrets uses the actual Keychain custody and LocalAuthentication.
The fixture's `unlockMain.ts` uses the shared private child lifecycle and unlocks only its compiled-in disposable store after checking the runtime marker, private home and unlinked regular file.
It never searches the default Keychain list, reads a saved sign-in or accepts a store path from a control.
Recovery uses two fixed disposable destinations through the real private-file reader and writer, exercising native custody and recovery but not the file-picker UI.

`node scripts/secrets-fixture-control.mjs <runtime-root> <command>` sends one closed command through an owner-only Unix socket, using a relative socket path for Darwin's path-length limit.
The client exits unsuccessfully on an explicit refusal, a connection without a reply or an unreadable reply, and never prints a partial response as a result.
An answered control is not proof of a completed native action: read its durable outcome before another action, and never repeat an uncertain use or recovery write.
The commands inspect metadata, prepare one invented recipient, navigate the app's Secrets controls, capture its own renderer or request a clean quit.
The fixed `decisions`, `phone`, `history` and `copy` controls open those quiet rows of the shown Secrets page; they accept no selector, path or editable value.
There is no evaluation, text-entry, generic click, desktop capture, password input or authentication command.
The fixture refuses controls and captures while native confirmation or an initiated native action is pending; metadata status remains available.
It also refuses a picture when any frame contains a password entry control, without reading that control's value.
Pictures use Electron's own-page capture, not screen-recording or accessibility permission, and never include system authentication dialogs.
A click receipt means only that the app received the click, not that authentication or an effect completed.
Preparation records its attempt exclusively before starting; a restart or lost reply cannot prepare another use, and uncertain outcomes are reconciled rather than replayed.
Native confirmation remains the person's action; the fixture grants no permission to create a test store, use signing material or touch existing data.

## Isolated desktop journey entry

`tests/e2e/secretsHarness.ts` supplies disposable custody and confirmation through the existing host-capability seam.
It imports `out/main/app.js`, the same built app owner the normal main entry imports, from the ordinary `electron.vite.config.ts` build.
Only fixture capabilities are bundled separately; the harness owns no duplicate main aliases, contract defines, frame pins or font modules.
Leak assertions read every saved file through `savedText`, not only encrypted value files.
