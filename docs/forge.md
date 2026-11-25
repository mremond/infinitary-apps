# The forge seam: where a project lives

Git integration PR 1.1 and PR 1.2 (captain verdicts of 2026-09-24: direction C, GitHub only for now, a plain host's proposed change is sent up, the app's own GitHub sign-in with the device flow, ignore any other GitHub sign-in on the Mac).
GitHub Enterprise and GitLab share the host layer (the captain's "Shape the host layer for both" on FI3-1446).
GitLab signs in through the browser or with a key on gitlab.com or a self-hosted server, lists, finds and clones projects, delivers through merge requests whose pipelines read as checks, gives crewmates its job logs, artifacts archives and API, and lists the person's open merge requests.
This is the one home of what the seam is in the code.

## What it is

`src/core/forge/` answers every question the app asks of the place a project lives, without the rest of the core knowing which host answers:

| Call | GitHub | GitLab | Bitbucket | Plain Git host | Kept on this Mac |
|---|---|---|---|---|---|
| `changeFor(branch)` | the open pull request for the branch and its selected source project | the open merge request from the project's own branch or its selected contribution fork | the open pull request from the project's own branch or the person's selected contribution fork | the branch, if it has been sent up | never one |
| `checks(change)` | every page of the check runs (a cancelled run superseded by a later run of its workflow set aside) and commit statuses on the head; a suite past the ten pages read keeps a pending item, so it never reads green | the pipelines for the head and each one's jobs ("GitLab merge requests" below) | the build statuses on the head, up to five pages ("Bitbucket pull requests" below) | none: green with zero checks | none |
| `holdsCommit(sha)` | whether the Git database holds that exact full commit id (`git/commits`), since the commit reads `checks` uses resolve a longer id by its first 40 characters; a 404 counts only once the repository reads | whether `repository/commits` answers that exact full id, once the project reads | whether the commit read answers that exact full id, once the repository reads | absent | absent |
| `branchesAt(sha)` | the branches whose head is that version (`branches-where-head`), where a pushed or dispatched run can still start | the branches `repository/commits/:sha/refs` says hold it whose own head it is; a full page is unknown | absent | absent | absent |
| `pull(number)` | the pull request by its number, open or not, merged or not, with its readiness (`mergeable_state`: clean, conflict, behind, blocked by the branch's rules, computing, draft) | the merge request by its number, with its readiness from `detailed_merge_status` | the pull request by its number, with its readiness from Bitbucket's mergeability checks | absent | absent |
| `putIn(change, headSha, way)` | merge the way the project allows, read just before (`way`), only at the checked head, taken only when GitHub answers `merged` | merge with or without squash as the project allows, read just before (`way`), only at the checked head (`sha`), taken only when GitLab reads it merged | merge by a strategy the main branch allows, read just before (`way`): a squash, a rebase merge or a merge commit, after reading the branch still at the checked head, since the merge takes no version; the answer names the version merged, and a branch with Bitbucket's merge queue answers queued | fast-forward the default branch onto the checked head and send it up, never forced | not through the seam: the local land (`WorkspaceService.landTaskWork`) through the local-only posture |
| `close(change)` | close without merging | close without merging | decline it | take the sent-up branch back | nothing to close |
| `openChange` | open a pull request onto the default branch | open a merge request onto the default branch | open a pull request onto the main branch | send the branch up | refused as `unsupported` |
| `label(change)` / `url(change)` | `#N` and its page | `!N` and its page | `#N` and its page | the branch, no page | the branch, no page |
| `listProjects()` | the person's repositories, newest first, every page up to 1,000 (`listProjectsPaged` also says whether that was all; `findProject` reads one exact owner/name) | the person's projects, newest first, up to 1,000 (`findProject` reads one exact nested path) | every workspace's repositories, newest first, under ten pages (`findProject` reads one exact workspace/name) | none | none |
| `hasChecks` | yes: the app watches them (below) | yes | yes | no: nothing is watched, and the crewmate is told so | no |
| `workflows` | read-only Actions runs, jobs, logs and artifact downloads, whole or in parts | read-only pipelines, jobs, logs and artifacts archives | read-only pipelines, their steps and a step's log; no artifact download | unsupported | unsupported |
| `api` | the gateway's raw REST call under GitHub's policy | the gateway's raw REST call under GitLab's policy | the gateway's raw REST call under Bitbucket's policy | unsupported | unsupported |

A `Forge` is per repository.
`createForgeResolver` in `src/core/forge/index.ts` picks it from the repository's `host`, which the registry stamps from its `origin` through `forgeOf` (`src/shared/forge.ts`) at insert and migration 40 backfilled for older rows (logged in `forge_backfill`).
The composition root binds an implementation per kind (`ForgeBindings`); a kind with none is a plain host.
GitHub, GitLab and Bitbucket are bound; they are the kinds with change requests (`hasChangeRequests`, `src/shared/forge.ts`), which the merge path, the kept merge approval and the settle words read instead of naming GitHub.
Bitbucket is Bitbucket Cloud at bitbucket.org ("Bitbucket sign-in and projects" and "Bitbucket pull requests" below), and Bitbucket Data Center 8.19 or newer at any other address ("Bitbucket Data Center" below).

## Contributing through an owned fork

On GitHub, GitLab, Bitbucket Cloud and Bitbucket Data Center, `ProjectContributions` reads the sign-in's project access and the host's fork relationship through `Forge.contributions` for pull-request delivery, never to prepare a local-only change.
The project retains a successful direct-project inspection so later publications do not repeat account and project discovery.
GitLab resolves absent or lower listed roles through effective membership, including inherited and shared-group membership; a membership 404 confirms a non-member, while other read failures remain failures.
Bitbucket reads the person's effective permission on the repository (`/user/workspaces/<workspace>/permissions/repositories`): `admin` or `write` may push, `admin` owns it, and a workspace that lists none, or refuses the read, means no access (`providers/bitbucket/contributions.ts`).
Bitbucket names a repository by a UUID, never a number, so its project identity's number is the UUID's first 52 bits (`bitbucketRepositoryNumber`).
Bitbucket Data Center reads whether the server lists the repository among those the person may write to (`/rest/api/latest/repos?permission=REPO_WRITE`), and a fork's owner among those they administer (`REPO_ADMIN`); a list longer than ten pages reads as not known (`providers/bitbucket/dataCenterContributions.ts`).
Its fork is a repository forked from the project in the person's own project, found by that personal project's owner, since its key `~<user slug>` differs from `~<name>` for a name such as `jane@example.com`; a new fork goes there (`POST` to the repository with no project named).
Its project identity names the repository by its HTTPS clone address, `scm/<key>/<slug>`, so only a project read over HTTPS is offered a fork.
Its fork is a repository whose parent is the project, in a workspace the person administers (`/forks?role=admin`); a new fork goes to the person's own workspace, or the only one they administer, and with several to choose from nothing is sent and the refusal asks the person to make the fork on Bitbucket.
A project the sign-in cannot push to uses an existing verified owned fork, or asks on an app-authored project-change card before creating one.
The project keeps the confirmed fork and reuses it; its route stores host project identities, not credentials.
A create request is marked attempted before sending, so a lost response is reconciled by reading for the fork and is never automatically repeated.
A definite refusal clears that attempt and permits another explicit consent-button attempt.
A fork that the person adds as a project asks once whether changes should contribute to its original project or stay in the fork.
Settings → Projects exposes that choice as Target project, with Original project and My fork.
The first destination choice works for an imported project with prepared working copies; those tasks keep their previous push and publication targets.
A later destination change waits until the project's current code working copies finish.
Equivalent origins retain their existing Git transport, while Settings address changes and project removal clear only contribution-managed push addresses.

Contributing fetches the original project's default branch and pushes task branches through the fork using a task-owned native Git remote.
It never updates the fork's own default branch, so a stale fork does not determine a task's base.
Target writes serialize, and a new task waits for an in-flight target choice before reading its route.
A task with a prepared branch keeps its selected route, publication origin and credential-free preferred push transport on its delivery record.
Each app-owned task branch uses its own named remote for default fetch and push, without enabling worktree-specific configuration or pinning person-owned linked copies.
Copies of private Git route values keep native configuration owner-only, never putting credentials in process arguments or task delivery metadata.
Task retirement removes that remote and its tracking refs; a newly acquired pooled copy receives its new task's route.
A temporary folder-level fork override retains the person's original push settings privately in native Git configuration and restores them when the override ends.
Work-computer tasks with a separate push address use independent named remotes rather than changing the shared clone; ordinary tasks retain their existing origin and dispatch behavior.
Preparation and moves carry the prepared fetch and push addresses together, including moves back home and replay of a received pack.
A computer that runs the task receives the separate push address only after it advertises `fork-contributions`; an older computer must be updated before preparation or moving work.
GitHub opens the upstream pull request with the fork's owner and repository as its head.
GitLab opens the merge request in the source fork with the upstream target project id.
Bitbucket opens the pull request on the original repository with the fork as its source repository (`source.repository.full_name`), and reads a fork's commits in the fork.
GitHub and Bitbucket compare a fork's owner and name without case (`contributionOriginMatches`, the kind's `foldsNames`).
Branch-head and open-change reads retain that source identity rather than confusing an identically named upstream branch.

The contributor's published story is a note without merge actions, not a merge offer.
Card bindings explicitly advertise support for contribution notes; the home still checks each task's saved route.
The host refuses both direct and reviewed merges on that contribution.
The existing change watcher keeps reading the upstream request, records its open, merged or closed state, and steers the crewmate when the host reports new activity; while a runbook asks for the comment wake and the crewmate's conversation holds that guidance, only a change of state steers it, and new comments reach it as that wake ("Comments on a pull request").
The crewmate reads maintainer comments through the existing host reads and pushes requested fixes to the same fork branch.
Its waiting state says Waiting for the maintainers, and its story note's existing status line follows the confirmed external outcome.
Once its latest story is confirmed published on that same open pull request at the current version, a quiet contribution counts as idle rather than working.
A running turn, job, settlement, actionable author guidance, pending batch or actual check/run watch retains its normal posture; watching the contribution and delivering its wakes are unchanged.
A confirmed external merge can close a completed contribution whose saved-story note named that exact request and head, without sending another merge.
Checks that require upstream write access are named as not run in the story; the contributor does not attempt to start the maintainers' checks or queue.

A contribution destination may declare `media: card-only` before publication.
That is the explicit text-story fallback when fork-upload visibility has not been established: the upstream description receives text, and the inspected pictures stay on the card.
It is not recovery from a failed or uncertain native upload, and ordinary story uploads retain their existing destination, permission and send-once checks.
`githubStoryDestination` and `gitlabStoryDestination` separate reading the upstream description's identity from requesting upload permission; only the contribution's text route uses the description reading.
The provider tests, `projectContributions.test.ts`, and the `fork-contribution.spec.ts` journey own these boundaries.

## The kinds

- `github`: `providers/github/githubForge.ts` (its signed workflow downloads in `downloads.ts`, release-file uploads in `releaseUploads.ts`, failure reading in `failures.ts`), GitHub's REST API with the app's own GitHub sign-in as a bearer token (git integration PR 1.2; below), on github.com and on each GitHub Enterprise host at that host's own API (`githubApiBaseFor`).
  `INFINITARY_GITHUB_API_URL` (github.com) and `INFINITARY_GITHUB_ENTERPRISE_API_URL` (every enterprise host) are honoured only in an unpackaged app.
  The home's forge wiring (`src/core/forge/homeForges.ts`) binds every GitHub project to it; no other program's GitHub sign-in is ever read, and the app no longer runs any GitHub tool of the Mac's.
- `gitlab`: `providers/gitlab/gitlabForge.ts`, GitLab's REST API (`/api/v4`) with the app’s own sign-in, on gitlab.com and on each self-hosted server ("GitLab merge requests" below).
- `bitbucket`: `providers/bitbucket/bitbucketForge.ts`, Bitbucket Cloud's REST API (`/2.0`) with the app's own API token sign-in, at bitbucket.org ("Bitbucket pull requests" below); at any other address, `providers/bitbucket/dataCenterForge.ts`, a Bitbucket Data Center server's REST API (`/rest/api/latest`) with the person's HTTP access token ("Bitbucket Data Center" below).
- `git`: `providers/plainGit.ts`, git against the repository's own `origin` with prompts off.
- `none`: `providers/noHost.ts`.
  There is nowhere to send a change.

### What each kind of host owns

Code outside a provider's own folder never compares a kind to GitLab.
It reads a fact from the shared table in `src/shared/forgeKinds.ts`, which holds one row for each kind whose changes are numbered requests: GitHub, GitLab and Bitbucket.
A row names the kind's public host, its word for a change and its handle, the `#N` or `!N` before a number, its change and compare pages and how the compare page names its two branches (`compareRange`), whether owner and name ignore case, a draft's title marker, whether a description runs quick actions, whether a refused fetch waits only on a known host, its key page and sample address, its server integration and whether it takes batches.
A fact only one part of the core uses, such as a REST path the gateway or the write guard reads, sits in that file as a record keyed by kind, so a missing kind fails the typecheck there.
A new kind of host is a new row and a new entry in each of those records, never another comparison to GitLab in shared code.
Every kind the app signs in to is one of those rows (`SIGN_IN_HOSTS`), which also names the account its key page belongs to and the scopes its key form names where that page cannot tick them (Bitbucket's).
Some shared code still tests whether a kind is GitHub for a GitHub-only behavior, such as a story's attachment forms, merging past branch rules, the gateway's sent comments and workflow dispatches, and a placed copy's sign-in words; a new kind reads those as not GitHub until that fact moves into the table or a record.

## The app's own sign-in (PR 1.2)

The owner's verdicts: an OAuth App with the device flow; ignore any GitHub sign-in already on the Mac; and nothing ever makes a host look required.
The OAuth App is Infinitary, owned by the infinitary-labs organization, with `https://getinfinitary.com/` as its homepage; renaming it and moving it there kept its client id, which every released version sends (INF-875).
GitHub, each GitLab host and each GitHub Enterprise host are shown in Settings -> Integrations (`docs/integrations.md`); Projects keeps the pointer and other computers' own GitHub sign-ins.

- **The flow** (`providers/github/oauth.ts`): `POST /login/device/code` with the registered client id `GITHUB_OAUTH_CLIENT_ID` (public; there is no secret) and the scopes `repo workflow read:org`, then `POST /login/oauth/access_token` every `interval` seconds - `authorization_pending` waits, `slow_down` adds five seconds (or takes GitHub's new interval), `expired_token` ends as "The code expired." with a fresh code on request, `access_denied` ends quietly.
  The Settings aside shows the current code with a keyboard-accessible "Copy code" button; a polite live status confirms clipboard success or honestly reports failure, resetting for each code/sign-in attempt.
  Only our renderer has the write-only clipboard permission; clipboard reads and foreign documents remain denied.
  Copying never changes the sign-in flow, and "Open GitHub" still hands the page to the system browser.
  `INFINITARY_GITHUB_OAUTH_URL` points the flow at a stub in dev and e2e only.
- **The store** (`signIns.ts`, `ForgeSignInStore`): `userData/forges/<host>/sign-in.json`, a 0700 directory and a 0600 one-line file `{ token, scopes, login, createdAt }` - plus `refreshToken`, `expiresAt` and `refreshExpiresAt` for a short-lived sign-in (below) - one per host.
  It is a sibling of the account vault, never a `PROVIDER_CATALOG` row and never visible to routing.
  Signing out deletes the directory; an OAuth App with no secret cannot revoke from the app, so the person revokes on GitHub's own page (github.com/settings/applications).
  Observe's redaction covers every GitHub sign-in shape (`gho_`, `ghu_`, `ghs_`, `ghr_`, `ghp_`, `github_pat_`), and the sign-in never rides an environment variable, an argument, a log line, a timeline event, a card, or anything the window reads.
- **Health** (`ForgeSignIns`, the five rules of `src/core/accounts/credentialHealth.ts`) on the supervisor's 60s tick and once at boot: `GET /user` 200 is `ok` and refreshes the login; a 401 is `needs_reauth` only on proof - a sign-in with no refresh token, a renewal GitHub refused, or a 401 that survived a real renewal (the account credentials' rule, `docs/quota.md`); a 401 whose renewal could not reach GitHub is `unavailable`; a 403 on a spent allowance, a 5xx and no network are `unavailable`, retried, never a sign-out; an unreadable store is `unknown`.
  A forge request GitHub refuses with 401 asks for a health read at once (`onSignInRejected`) rather than trusting one refusal.
  With nothing signed in nothing is read.
  Every change of health, every completed sign-in and every sign-out is one dated line in `userData/forges/health.log` (0600, beside the hosts' folders so it outlives a sign-out, newest 64 KiB kept) and on the console: `<ISO time> github.com sign-in ok -> needs_reauth (answered 401)` - the states and GitHub's HTTP status, or why it could not be asked, never the sign-in.
  Once anyone has signed in here, the app's start and quit add one line each - `app start: signed in since <createdAt>` / `app quit: ..., last read ok` or `not signed in` - so a sign-in that dies while the app is closed is bracketed by the quit that last saw it and the start after.
  A packaged app's console reaches no file, and the owner's first real sign-in (revoked on GitHub while the app was closed, 2026-09-24/25) left no local trace of when GitHub began refusing it; the log is that trace, and the `signed in` lines count the sign-ins this install made.
  The view rides `inf:forges` (read `inf:forges:list`; `inf:forges:sign-in|cancel|sign-out`).
- **Short-lived sign-ins** (the owner's first real sign-in, 2026-09-24/25): GitHub gives every OAuth App registered since its 2026-08-14 change eight-hour sign-ins by default, in the device flow too (changelog "Multiple redirect URIs and token refresh for OAuth apps"; docs "Authorizing OAuth apps" -> expiring access tokens).
  The answer then carries `expires_in`, a `refresh_token` (six months without use) and `refresh_token_expires_in`.
  The app once kept only the access token, so the owner's sign-in died eight hours in, while the app was closed, with no revoke in the captain's security log.
  Now `pollForToken` keeps all three, and `ForgeSignIns` renews with `refreshSignIn` (`POST /login/oauth/access_token`, `grant_type=refresh_token` and the client id; a device-flow sign-in needs no secret): ahead of the end by `RENEW_LEAD_MS` (10 minutes) on the tick and before handing a forge request its sign-in, at the first read after a start when it ran out while the app was closed, and once when GitHub answers 401.
  A refresh token works once and retires the access token it came with, so renewals run one at a time per host, and a renewal never writes over a sign-out or a new sign-in made while GitHub answered.
  A refused refresh token is dropped from the file.
  A renewal fires `onRenewed`, which takes down a card a git refusal raised and dispatches the work held behind `forge-sign-in:<host>`.
  The health log dates each renewal (`sign-in renewed, short-lived until <ISO>`) and each refusal.
  A sign-in GitHub issues without a refresh token behaves as before.
- **The one host card**: `card-forge-<host>`, "Sign in to GitHub again", raised only on `needs_reauth`, naming how many proposed changes wait on it; its one action is `open projects` with `signIn`, which lands on Settings -> Integrations, where the host sign-ins live, with the code already on screen (`openedSection`, `docs/integrations.md`).
  It takes itself down when GitHub answers again.
  An unreachable GitHub is one feed line ("Could not reach GitHub - trying again."), written only while a project lives on that host, so a sign-in no project uses writes none (`src/core/forge/healthNote.ts`); a 403 on opening a change is one feed line asking for write access.
  No card for either.
- **Not signed in, as a refusal with ways** (`signInRefusal.ts`): `locate_project` (when nothing was found on this Mac), the setup card's answer to the first mate (a clone the captain's Add project could not make from a host whose sign-in the app lacks, through the shared action dispatcher; `docs/fleet.md` "Asking the first mate to add a project") and a settle's put-in answer "Not signed in to GitHub (github.com)" with two typed ways: an `open` effect `{ target: "projects", signIn: "github.com" }` ("Sign in to GitHub") and `app_change project-settings` with `changes.delivery: local-only` ("Keep it on this computer", where there is a project to keep).
  The shared dispatcher carries the clone's typed refusal in `SignInRequiredError`; `app_change` renders its ways for the first mate, while Settings keeps its tab-specific sign-in sentence.
  A clone offers only the sign-in way because no project exists yet.
  Other clone failures keep their original error.
  The first mate turns them into one decision card under one prompt rule (contract v4.8); the host raises no card of its own for it.
  A crewmate's `open_change` and `check_change` answer the same fact as its blocker to report - it never signs in.
  The crewmate is told that once, in its prompt (`tests/crewmate-fixed-context.test.ts`); the tools do not repeat it.
- **Git that never prompts** (`src/core/hostEnv.ts`): every child the core starts - host git, a crewmate's shell, Claude's client - carries `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS` naming the shipped helper `resources/git-askpass` (extraResources, executable, outside the archive; the release contract and `scripts/verify-app.sh` pin it) and `INFINITARY_GIT_SIGNIN_DIR`.
  The helper answers the stored sign-in for an `https://` host with a sign-in here, with the user name its file names (`gitUser`) or `x-access-token`, and nothing for any other.
  `GIT_CONFIG_PARAMETERS` empties the credential helpers for `https://github.com` and each host on the person's own server with a sign-in here, read at each spawn - so neither the keychain's helper nor another program's GitHub sign-in ever answers for them under the app, while a plain host keeps the person's own helpers - and an SSH origin is the person's own agent, untouched.
  The username `x-access-token` is the plan's choice; the helper's answer is proven against a local HTTPS host (`hostEnv.gitSignIn.test.ts`), and it is NOT yet verified against a private repository on github.com with a real sign-in (the plan's open item; no real sign-in exists on the machines that built this).
- **Dispatch-time sign-in refusal** (`src/core/workspace/forgeAuth.ts`): before a task starts, a failed `origin` fetch on an HTTPS remote of a host the app signs in to - github.com, or a known host on the person's own server - is held only when Git reports the askpass username prompt could not be answered or explicitly reports authentication failure (`ForgeAuthRequiredError`, carrying the host and its name).
  The worktree is not created and the task returns to the queue behind `forge-sign-in:<host>`; a host card opens Integrations with that host's sign-in started.
  When the host's existing sign-in reports `ok`, the gate is cleared and the task is dispatched again, re-fetching its base.
  DNS, connection, SSH, other-host and unstructured text failures continue through the ordinary stale-ref fallback; they never trigger GitHub sign-in.
- **The crewmate's pair** (`src/core/pi/forgeTools.ts`): `open_change` offers the pushed branch, on the task's own project or another project the app manages (`repository`, a project it does not manage refused; "A change in another project" below) and onto the branch it names (`base`; the default branch otherwise); `check_change` names the task's change (`change`) and reads raw check and mergeability facts and records evidence-backed declarations without deciding readiness or repair settlement.
  A base other than the default branch is a stacked change's; the app retargets nothing when that branch merges, and the host's own behavior decides where the change then points, which each reading records (`TaskDelivery.prBase`).
  Existing diagnosis, repair and rerun fields remain readable; conflictRepair and captainGuidance retain the captain's approval boundary.
  Handed to every crewmate whose task ships a change, never on the personal workspace or an answer task.
- **The personal panels' read**: `forge.changes` (`inf:forges:changes`) - the captain's open pull requests on every GitHub, GitLab and Bitbucket host the captain signed in to, newest first across them, each with its checks and the host's own name for it (`label`: `#12`, `!4`).
  GitHub's come from one GraphQL request per host with each one's check rollup (`providers/github/changes.ts`); GitLab's from `GET /merge_requests?scope=created_by_me&state=opened`, 20 at most, then each merge request's own read for its head pipeline, five at a time (`providers/gitlab/changes.ts`): a passed or skipped pipeline is passed, a failed or cancelled one failed, any other pending, and none is none.
  Bitbucket Data Center's come from the server's dashboard (`GET /rest/api/latest/dashboard/pull-requests?state=OPEN&role=AUTHOR`), 20 at most, then the build statuses on each one's head, five at a time (`providers/bitbucket/dataCenterChanges.ts`): any failed or cancelled status is failed, all successful is passed, any other pending, and none is none.
  A host that cannot be read makes the read unreachable this time, never a guessed row; a GitLab 401 counts as a sign-in only once GitLab no longer answers for the key.
  The `github-prs` authoring skill teaches it; no panel shells out for it.
  `tests/gitlabStub.test.ts` reads GitLab's rows on both kinds of host, and `tests/e2e/ui-kit-panel.spec.ts` shows a GitLab merge request as `!1` beside GitHub's pull requests in the panel that skill teaches.
- **Where it shows**: all this computer's host sign-ins in Settings -> Integrations (`src/renderer/src/settings/IntegrationsTab.tsx`; design skill `components/integrations/IntegrationRow`), one row per host.
  Each other computer's own GitHub, GitHub Enterprise and GitLab sign-ins are rows there too ("A computer's own sign-in" below), and Projects holds no sign-in; with no integrations and no such row, the tab shows its quiet line and connect chips.
  The first launch never shows it.

## Hosts on your own server

GitHub Enterprise - GitHub Enterprise Server, or GitHub Enterprise Cloud on its own `<name>.ghe.com` - is GitHub on the person's own server.
The app's OAuth App lives on github.com alone and does not exist there, so such a host signs in with a key the person makes on it, the way a custom API connection takes a key (FI3-1446 mapped the GitHub assumptions this layer removes).

- **Which hosts it knows** (`KnownForgeHost`, `src/shared/forge.ts`): a host and the kind it runs.
  `forgeOf(origin, known)` reads a public host by its name, a `<name>.ghe.com` host as GitHub by its name alone, and any other host as the kind `known` names, else a plain Git host.
  `ForgeSignIns.knownHosts()` is every host with a key sign-in on file (its file names its kind) and every host the person's projects are stamped with, for a kind the app offers a sign-in to.
  Nothing is guessed from a host's name beyond `.ghe.com`, and nothing asks a host what it runs: a GitHub Enterprise Server is known once the person signs in to it.
- **Its projects** (`RepoRegistry`): a new project on a known host is stamped that kind at setup, and `stampKnownHosts` stamps the ones already there - at a key sign-in, and at each start (a `.ghe.com` project an earlier run stamped a plain host, or an unstamped row).
  Nothing is stamped back: after a sign-out the host stays GitHub, as a github.com project does, and asks for its sign-in the same way.
- **The kinds of server** (`ForgeServer`, `forgeSignInServers` in `src/core/forge/index.ts`): what it is called ("GitHub Enterprise"), the user name git gives it (`x-access-token`), and one host's sign-in check (`createGitHubServer`, `providers/github/oauth.ts`: `GET /user` at the host's API).
  The view lists them as `servers`, one chip each.
- **The key sign-in** (`ForgeSignIns.signInWithKey`, `inf:forges:sign-in-key`): Settings hands the kind, the address as typed (the host's name, a page on it, or a project's address there; `hostOfAddress`) and the key to the core once.
  The core refuses what it can tell alone - no host, github.com (which signs in with its own button), another public host, a kind it does not offer, a key that is not letters, digits, `_`, `-` and `.` - then asks the host who the key is and keeps only a key it answers for.
  A 401 or 403 is `refused`, no answer or a 5xx is `unreachable`, anything else is `not-server`; the answer names the problem and the host, and Settings says it in `forgeKeyProblemText`'s words.
  The key is kept in the same 0600 file with `kind` and `gitUser`; the health log dates it (`signed in with a key, answered 200`) and never holds it, and nothing the window reads carries it.
- **Its health and cards**: the same five rules on the same tick, with nothing to renew, so the host's 401 is `needs_reauth` at once and raises `card-forge-<host>`, "Sign in to github.example.com again", whose open effect lands on the key form for that host.
- **Its name**: the host's own address ("github.example.com") everywhere a host is named (`forgePlace`; `serverHostName` falls back to "GitHub Enterprise" for an address too long for a row).
  The first mate's `lives` fact reads `github (signed in as mona)` for it like github.com's.
- **Its API** (`githubApiBaseFor`): `api.<name>.ghe.com` for GitHub Enterprise Cloud, `https://<host>/api/v3` (GraphQL at `/api/graphql`, `githubGraphqlUrl`) for a server.
  Every GitHub read and write - the listing and lookup, pull requests, checks, merges, workflow logs and artifacts, the open-changes panel and the gateway - goes there with that host's sign-in; the gateway's `nextPath` stays under the API's own path.
- **Its git**: the helper answers the host's name from the file (`resources/git-askpass` reads `gitUser`, else `x-access-token`), and the credential helpers are emptied for each such host with a sign-in on file, read at each spawn (`ForgeSignIns.gitHosts`), so only the app's key answers it.
  One the app holds no key for keeps the person's own helpers, as before the app knew it.
- **A refused fetch** waits for that host's sign-in (`forgeAuthRequired`, below), keyed `forge-sign-in:<host>`.
- **Settings -> Integrations** (`IntegrationsTab.tsx`, with forms in `ForgeSection.tsx`, design skill `components/integrations/IntegrationRow`): "+ GitHub Enterprise" opens the key form; a known host's chip, its row's "Sign in again" and a card's sign-in open it filled in for that host.
  The row reads "github.example.com" over "GitHub Enterprise · as mona · 2 actions".
- **How GitLab fits**: a self-hosted GitLab is one more `ForgeServer` (kind `gitlab`, git user `oauth2`, its own `whoAmI`), one more binding for `gitlab`, and its kind in `forgeAuthRequired`'s list; the known hosts, the stamping, the key form, the store's `kind`/`gitUser`, the helper and the host-keyed waits are already its.
- **On a computer that runs work**: the same key form signs that computer in to a GitHub Enterprise server with a key of its own ("A computer's own sign-in" below).
- **Not yet**: a host whose certificate comes from a company's own authority is not trusted by the app's requests; a workflow artifact a server keeps on storage other than its own host or GitHub's is refused as an unsafe download; and only the captain's own words sign the first mate out of github.com, not another host.

## GitHub CLI's sign-in

Some organizations do not approve third-party OAuth apps such as Infinitary, and GitHub then hides their private repositories from the app's own sign-in.
GitHub lists GitHub CLI among the GitHub-owned apps a person may authorize even where an organization owner restricted OAuth app access ("Privileged OAuth apps"), so a person who already set up GitHub CLI can let the app use its sign-in instead (INF-1774, the captain: "provide an alternative way for them to connect infinitary with their github, which is through gh cli").
It is a third way inside the one sign-in store, so everything above `ForgeSignIns.token` - the forges, the gateway, the workflow tools, the panels, the crew's tools and the first mate's facts - is unchanged.

- **Finding it** (`githubCli.ts`): GitHub CLI on the search path the app captured (`findOnPath` over `hostEnv()`), never installed or updated by the app.
  `INFINITARY_GITHUB_CLI` stands in for it in dev and e2e only - a program's path, or `none` - and the e2e launcher sets `none`, so no test finds the one installed on the Mac it runs on.
- **Choosing it** (`ForgeSignIns.signInWithCli`, `inf:forges:sign-in-cli`): one line under the GitHub code aside, and under the GitHub Enterprise key form, shown only while GitHub CLI is found (`ForgesView.githubCli`); nothing asks GitHub CLI until the click.
  The core asks `gh auth token --hostname <host>` and the host who that is (`GET /user`), and keeps only a sign-in the host answers for.
  GitHub CLI holding no sign-in is `none`, a missing program `missing`, a 401 or 403 `refused`, no answer `unreachable`; Settings says each in `forgeCliProblemText`'s words.
- **The file**: `{ scopes, login, createdAt, way: "cli", program }`, with `kind` and `gitUser` for a GitHub Enterprise host - never GitHub CLI's token.
  The health log dates it (`signed in through GitHub CLI, answered 200`).
- **The token** (`ForgeSignIns.token`): asked of the program the file names at the moment a sign-in is needed, kept `GITHUB_CLI_KEPT_MS` (a minute) so a burst of requests asks once, and dropped on a refused request.
  GitHub CLI refreshes an expiring token of its own before it prints it, so nothing here renews it.
- **Its git**: the helper reads `way` and runs the named program for the host's token each time git asks (`resources/git-askpass`); the credential helpers stay emptied for the host, so only the app's helper answers it.
- **Its health and card**: the health read asks GitHub CLI afresh, then the host.
  GitHub CLI holding no sign-in, or the host's 401, is `needs_reauth`; a program gone from its path is `unknown`; one that could not be asked is `unavailable`.
  Only the person signs GitHub CLI in again, so the row reads "Sign in to GitHub CLI again, then Check now." with a Check now button, and the host card names GitHub CLI and opens Integrations without starting a code (`forgeCliRefusedText`).
- **Its row** reads "as octo · through GitHub CLI · 2 actions"; "Sign out and remove" deletes the app's file only, and GitHub CLI stays signed in for the person's own use.
- **The owner's earlier verdict**, "ignore any GitHub sign-in already on the Mac", stays the default: GitHub CLI is asked only for a host whose sign-in the person chose to make through it (`tests/e2e/forge-seam.spec.ts` keeps asserting that nothing else asks it).
- **On a computer that runs work**: its own GitHub row offers the same line, and that computer asks its own GitHub CLI ("A computer's own sign-in" below).
- **Not yet**: the row does not say which of the app's three scopes GitHub CLI's sign-in lacks; and the app cannot tell a blocked organization from a missing repository.

## GitLab sign-in and projects

GitLab offers browser sign-in and a key alternative on gitlab.com and on the person's own server.
The GitLab chip opens browser setup with gitlab.com; changing Address selects a self-hosted server.
The browser flow uses GitLab's device authorization grant (generally available in GitLab 17.9), reusing the same code, Copy code, Open and Cancel aside as GitHub.
Older servers keep key sign-in.

### Registering the application

An application belongs to one GitLab host, never every server.
The project carries no shared gitlab.com application, so the app guides a personal registration there as well as on self-hosted servers.
Settings opens `https://<host>/-/user_settings/applications` and explains the host's fields: name Infinitary, Confidential off, scopes `api` and `write_repository`, Device authorization grant on, and Redirect URI `https://<host>/oauth/device` (required by registration, unused by the device grant).
GitLab leaves Device authorization grant off on a new application and refuses its code sign-in as `access_denied` until the person turns it on.
The person supplies the Application ID, never the Secret; if server policy prevents registration, its administrator can supply an ID or the person can use a key.
The Application ID survives a successful sign-in in the same host's file and prefills a later browser setup; signing out forgets it with the sign-in.

### Browser sign-in and renewal

`inf:forges:sign-in-browser` hands the host, kind and public Application ID to `ForgeSignIns.signInWithBrowser`.
`providers/gitlab/oauth.ts` sends `POST /oauth/authorize_device` with `client_id` and `scope=api write_repository`, then polls `POST /oauth/token` at the server's interval with the device grant, device code and client ID.
Pending waits, slow-down adds five seconds, expiry offers a fresh code, denial closes quietly, and Cancel or a replacement ends the attempt, including a delayed start or identity read.
Only the user code and same-origin verification page reach the view; the device code, access token and refresh token never do.
Both endpoints refuse redirects and bound their answers to 16 KiB and each request to 30 seconds; errors never repeat server response text.
A start GitLab refuses throws `ForgeStartError` with a closed `ForgeStartProblem` (`src/shared/forges.ts`) read from the status and OAuth error code alone: `not-allowed` (`access_denied`, `unauthorized_client`), `client` (`invalid_client`), `scope` (`invalid_scope`), `not-found` (a 404 or an answer that is not OAuth JSON), `unreachable` (no answer or a 5xx) or `answer`.
`ForgesView.ended.problem` carries it to browser setup, which says what to change (`forgeStartProblemText`), and the app's forge log line names it with the status and code, never the Application ID.
`INFINITARY_GITLAB_OAUTH_URL` overrides the host only in an unpackaged development/test run.

The host's existing 0600 sign-in file keeps `applicationId`, `kind: gitlab`, `gitUser: oauth2`, the access token, expiry and refresh token when issued.
The existing renewal owner serializes refreshes, renews before expiry and after a 401, and never writes over a sign-out or a new sign-in.
A renewal uses the saved sign-in's Application ID, not a different registration an unfinished attempt supplied.
GitLab refusing a refresh grant is proof; a network failure, 403, rate limit, server error or unreadable answer is not sign-out.
The shared health rules, host-keyed waits and project stamping remain the same.

### Key sign-in

Use a key instead opens the existing masked key form, preserving Address; Use browser sign-in returns without carrying a key.
The Make a key button opens `/-/user_settings/personal_access_tokens` with `api` selected.
`createGitLabServer` supplies the kind `gitlab`, git user `oauth2`, and `GET /api/v4/user` to verify either method and read its health.
`ForgeServer.hosts` names public hosts that accept keys; this exception applies only to the named kind, never GitHub's code sign-in.
A key is never renewed: a refused key needs a new sign-in, and an unreachable host or a 403 is never proof of sign-out.
Observe redacts the standard `glpat-` token shape as well as sensitive token headers.

`gitlabApiBaseFor` uses `https://<host>/api/v4`; `INFINITARY_GITLAB_API_URL` overrides it only in an unpackaged development/test run.
`GitLabClient` sends `Authorization: Bearer` (accepted by GitLab for both keys and browser sign-ins) only to that API, refuses redirects, bounds each response to 256 KiB (a gateway answer past it is held, up to 100 times the cap, only to page it; "Caps", below) and each request to 30 seconds, and asks the existing health service to check a 401.
`GitLabProjects` reads `/projects?membership=true&simple=true&order_by=last_activity_at&sort=desc`, 100 per page up to 1,000, reporting an incomplete listing honestly.
Exact lookup uses `/projects/<encoded full namespace>` so nested groups are preserved.
`locate_project` preserves subgroup paths and recognises GitLab's `/-/` page routes.
Settings' Add project lists the host's projects and clones using the app's own git helper; a self-hosted project's kind is stamped GitLab once the host is known.
An HTTPS authentication refusal on either GitLab kind waits for that host's sign-in through `forgeAuthRequired`; SSH still uses the person's own setup.

A crewmate's job logs, artifacts archives and API calls on a GitLab project are "Workflow logs and artifacts" and "The gateway" below; the open-changes read is "The personal panels' read" above.

A computer that runs work signs in to GitLab with either method, its own sign-in kept there ("A computer's own sign-in" below).

**Not yet:** a server with a private certificate authority is not trusted by the app's API requests.
No shared application is registered on gitlab.com; guided per-host registration works without a secret, and a personal access key remains available.

## Bitbucket sign-in and projects

Bitbucket Cloud signs in with an API token the person makes on their Atlassian account, at bitbucket.org.
The Bitbucket chip in Settings -> Integrations opens the key form at bitbucket.org; another address is a Bitbucket Data Center server ("Bitbucket Data Center" below).
The form says to make the key on the person's Atlassian account, and Make a key names and opens Atlassian's API tokens page at id.atlassian.com (`SignInHost.keyAccount`, `forgeKeyPlace`).
That page cannot tick scopes itself, so the form names them: create the token with scopes, pick Bitbucket as the app, and tick `read:user`, `read:workspace`, `read:repository`, `write:repository`, `read:pullrequest`, `write:pullrequest`, `read:pipeline` and `write:pipeline`, each ending in `:bitbucket`.
Those are the scopes the app reads and writes with for Bitbucket's pull requests and the crew's reach, so one token serves them all.
An Atlassian token is padded with `=`, so the kind checks a key against its own pattern (`ForgeServer.keyPattern`).

`createBitbucketServer` (`providers/bitbucket/signIn.ts`) supplies the kind `bitbucket`, the git user `x-bitbucket-api-token-auth` and `GET /2.0/user` to verify the token and read its health, naming the account by its nickname.
The token is sent as `Authorization: Bearer`, which Bitbucket accepts without the account's email.
`bitbucketApiBaseFor` uses `https://api.bitbucket.org/2.0`; `INFINITARY_BITBUCKET_API_URL` overrides it only in an unpackaged development/test run.
`BitbucketClient` sends the token only to that API, follows a `next` page link only on it, refuses redirects, bounds each answer to 256 KiB and each request to 30 seconds, and asks the existing health service to check a 401; a 403 is a scope the token lacks, never a sign-out.
A token is never renewed: a refused one needs a new sign-in, and its card says the first mate cannot open, check or merge pull requests there, as for every kind.
A new token kept over one that was still ok counts as a renewal (`onRenewed`): a token `/user` accepts can still be refused by git on a project, and the work that refusal held goes again with the new one.
Observe and a signed-in task browser hide the `ATATT` token shape (`src/core/keyFormats.ts`).

`BitbucketProjects` (`providers/bitbucket/projects.ts`) reads `/user/workspaces`, then each workspace's `/repositories/<workspace>?role=member&sort=-updated_on`, 100 per page under one budget of ten pages, newest first across workspaces.
It reads every workspace's first page before any workspace's second, so the budget reaches as many workspaces as it can before any workspace's older projects; with more workspaces than the budget, a cut listing leaves whole workspaces unchecked, newer projects among them.
Each page asks only for the fields the listing reads (`fields=`), which keeps a full page well inside the 256 KiB bound.
A listing cut at the budget says so: Add project shows that not every project was checked and a pasted link adds one that is missing (`inf:forges:projects-listed`'s `complete`), and the first mate's listing says the others were not read and an exact `workspace/name` is still looked up.
Exact lookup reads `/repositories/<workspace>/<name>`; nothing nests.
A project's clone address is `https://bitbucket.org/<workspace>/<name>.git`, since Bitbucket's own clone link names an account.
Settings' Add project offers Bitbucket repo beside GitHub's and GitLab's, and `BitbucketForge` lists through `BitbucketProjects` the way the other kinds list through their own forge (`forgeOnHost`).

Git on this Mac answers bitbucket.org with the app's sign-in alone, as it does gitlab.com, since the pull requests the app opens there are made with that sign-in too; with none on file a push there is refused, and the task waits for the sign-in.
An HTTPS authentication refusal on bitbucket.org waits for its sign-in through `forgeAuthRequired`; SSH still uses the person's own setup.

Integrations lists one Bitbucket row with its sign-in's health and account, and its read and write actions (`docs/integrations.md`, "Bitbucket").

## Bitbucket pull requests

A Bitbucket project's direct-pr task delivers the way a GitHub or GitLab one does: the crewmate pushes its branch and calls `open_change`, the checks gate and `check_change` read the build statuses on its version, the check watch follows them, and the captain's merge, or a kept merge approval, merges the pull request with a squash where the main branch allows one, otherwise a rebase merge, then a merge commit.
Before it sends the merge, the app reads that the branch is still at the checked version and that Bitbucket reports no conflict, draft or blocking rule.
Bitbucket's merge itself holds to no version, so a push in the moment after that read goes in with it, and the app says so rather than promising the checked version alone.
That is the chosen guarantee: the merge stays one click, best effort at the checked version, with this limit said in the release note and on the task, rather than handing the merge to Bitbucket until it can hold a merge to a version.
A Bitbucket project added before the app opened pull requests there delivers this way from its next task, with no setting to change; without a sign-in, `open_change` and the merge answer the same refusal as on GitHub, whose ways are signing in and keeping the project on this Mac.
`BitbucketForge` (`providers/bitbucket/bitbucketForge.ts`) reaches the project at `/repositories/<workspace>/<name>` through `BitbucketClient`, whose writes (`request`, `write`) send JSON with the same token, bounds and refusals as its reads.

- **Its ordinary change** is a pull request from the project's own branch onto the main branch Bitbucket names (`POST /pullrequests`, `source.branch.name`, `destination.branch.name`, `title`, `description`, `draft`), with `close_source_branch` off; a fork's pull request from a branch of the same name is never taken for it.
  A draft becomes ready through the host's own step (`markReady`, `PUT` with `draft: false`).
  It is named `#N` with Bitbucket's page under `pull-requests/`, and recorded on the task as `changeLabel`, `prNumber` and `prUrl`.
  Bitbucket names a pull request's commits by a short id; the forge reads each back as the full id (`GET /commit/<id>?fields=hash`) before the app keeps it, and a branch's head comes from `GET /refs/branches/<name>`.
- **Its story** is the saved story's text in Markdown: Bitbucket keeps no pictures in a description, so every picture stays on the merge card (`media: "card-only"`), and the story's folds are plain `###` sections instead of `<details>`, which Bitbucket would show as text.
  A description is replaced only after the pull request is read again and still holds the version and words the app read (`updateChangeBody`), since Bitbucket's write has no condition of its own; the write sends the title only when the story changes it, so a title a person changed since is kept.
  Its size limit is 32,768 characters (`NATIVE.bitbucket` in `presentation.ts`), an assumed bound: Atlassian publishes none.
  A repository has no number, so the story's place names it by the first 52 bits of its UUID, the same for the same repository each time.
- **Its checks** are the build statuses on the head (`GET /commit/<head>/statuses`), which every check service posts there, Bitbucket Pipelines included: one check per status key, `SUCCESSFUL` success, `FAILED` failure, `STOPPED` cancelled, and `INPROGRESS` pending.
  A reading that stops at its fifth page is marked incomplete; no status yet is an empty reading, which the shared green rule keeps pending.
- **Its readiness** (`pull`) reads Bitbucket's own mergeability checks (`GET /pullrequests/<N>/mergeability/checks`): a draft is a draft; a Git check with `conflicts` is a conflict; a blocking `maximum_commits_behind` rule is behind; any other blocking rule is blocked; a Git check that has not passed, or any check still pending or unknown, is computing; otherwise it is clean.
- **Its merge** (`putIn`) checks the title against the active naming runbook, then reads the branch: Bitbucket's merge takes no version, so a branch that moved past the checked version sends nothing and is refused.
  Before that, every merge reads the pull request's readiness, the captain's own click included (`Forge.mergeNamesNoVersion`): an owner's sign-in may merge past a rule Bitbucket does not enforce, so a conflict, a draft or a blocking rule sends no merge.
  It then asks `POST /pullrequests/<N>/merge` with the merge strategy and the message `<title>`, a blank line and the story's plain summary.
  The strategies the main branch allows are read right before (`mergeWays`, `merge_strategies` on `GET /refs/branches/<main>`): one change goes by `squash` where allowed, otherwise `rebase_merge`, then `merge_commit`, and a batch of several as "Batches of your own" says; the fast-forward strategies are never sent, and a branch read without its strategies sends nothing.
  A 409, a ref that moved during the merge, reads as the base moving.
  The approval's last check and the attempt it records run as the merge request leaves, after the branch read and the sign-in (`putIn`'s `beforeSend`, run from the client's send hook; `atDispatch` in `changeMerge.ts`, for the task's own pull request and one named by its number): an approval that ended during those reads sends nothing, the captain's newer guidance that arrived during them holds the merge as the guidance hold does, and a merge interrupted while it still reads holds no attempt.
  A failure before the request left sent nothing (`ForgeError.beforeSend`), so the merge path treats it as a hiccup before sending, never as a merge whose outcome is unknown.
  GitHub and GitLab hold their merge to the version, so their check runs just before the call, as before.
  Once the request went out, nothing read after it counts as a refusal: a 202 (Bitbucket still merging in the background), a read that fails and an answer that names no merged version are each an outcome the app does not know.
  Such a merge is never sent again: a kept merge approval keeps its attempt and waits on the outcome, and every later reconcile (`keptMerge`'s `reconcileAttempt`, on the tick and after a restart) only reads the pull request, since an open pull request on a host whose merge names no version (`ForgePull.mergeNamesNoVersion`) cannot show that nothing went in; a read showing it merged closes the task once, and one showing it closed ends the approval.
  A 202 names Bitbucket's own reference to the merge it took in its Location (`.../pullrequests/<N>/merge/task-status/<task>`), kept as `<N>/<task>` only when it names this repository and pull request; the error carries it (`ForgeMergeUnconfirmed.mergeTask`), the approval's attempt keeps it (`attempt.task`), for the task's own pull request and one named by its number alike, and while the pull request stays open the reconcile asks Bitbucket how that merge ended (`Forge.mergeTaskRefused`).
  Bitbucket answers that read 400 for a merge that failed or left its queue unmerged, and also for a task that is not this pull request's, and a Location naming this pull request does not prove the task is its own, so a 400 is a refusal, never a confirmed failure.
  A refusal keeps the wait read-only (`ForgePull.mergeTaskRefused`): the reference is dropped so it is asked about once, the task says once that the merge stays unsent until the pull request reads merged or closed on Bitbucket, and nothing is sent again.
  A merge whose outcome is known leaves no attempt: a spent approval drops it, and so does a pull request named by its number that merged at a push made during its merge, whose approval ends because a different version went in (`finishContinued`).
  An unresolved attempt is not undone when its approval ends unmerged (`endedAuthorization` keeps it, as do the ends a guidance or repair declaration and a repair's independent assessment record), and it stays with the approval record by pull request through every approval that replaces it, including another pull request's (`MergeAuthorization.unsettled`, `carryUnsettled`); a later approval of that pull request, the captain's click or autonomy's, takes it as its own attempt and reads it back before sending, so no click sends a second merge while the first one's outcome is unknown.
  The merge card's click hands such an approval to that read-back instead of the merge sender, and a click a quit interrupted after its merge left is not resumed at launch, whether its approval still stands or ended since (`resumePendingSettles`).
  The read-back asks the repository the approval pinned (`MergeAuthorization.target`, carried as `MergeGuard.place`), never another managed project whose pull request has the same number, both the one right after a request whose answer never came and the reconcile later.
  The send itself refuses too: a kept approval's guard sends nothing while any task's approval record, a closed task's included, holds an unresolved send of the same pull request on the same repository, its own earlier attempt or another task's attempt or unsettled entry (`MergeGuard.unresolved`, over `TaskService.unresolvedMergeSends`, whose partial index seeks only those records), and that refusal is a wait on the outcome (`stop: "outcome"`) that keeps the earlier attempt; only the attempt a send recorded itself is cleared by its answer (`afterAttempt`).
  The same pull request is compared as the host reads it (`samePullTarget`): Bitbucket and GitHub fold a project's owner and name, so two saved spellings of one repository hold the same reservation.
  The kind a managed project configured for the host's address decides first, so a self-hosted GitLab, which keeps case apart, keeps two such projects apart; only a host neither a project nor the public table names reads as GitHub's.
  A send no standing approval reads, an ended approval's attempt or an unsettled entry on any task, is read back on the minute pass in the repository its approval pinned (`KeptMerge.reconcileUnsettledSends`), on the outcome wait's backoff: a read showing it merged or closed takes it off the record, a merge found made is said once on its task, and nothing is ever sent from there.
  That read finds the pinned repository among every managed project before it looks at the task's own, so it still settles once the task's project delivers no pull requests or is no longer managed (`pinnedRequestRepo`).
  The repository it reads must name the pinned repository in its origin and the pinned host in its forge, so a project repointed to another host since, whose task still publishes under the old origin, never answers for it.
  Only a state Bitbucket names, in an answer about that pull request, settles a send: an answer with no state, one the app does not know, or one about another pull request reads as unreadable, never closed, and a merge answer about another pull request confirms no merge.
  Its note names where that repository lives and tells the merged version against the version the send was approved at, so a push after the click that went in with it is said.
  A merge under no kept approval, such as the first mate's own merge call, is refused at the send (`atDispatch`'s `guard`), since it could neither see an unresolved merge nor record its own; the app merges from the merge card's approval instead, the captain's click or autonomy's.
  A read showing it closed clears it, since nothing went in; one showing it merged tells the merged version against the version the original send was approved at (`attempt.head`), not a later approval's.
  A reference that does not name the pull request is never asked about, and a pending task, an unknown or expired one (which Bitbucket reads as pending) or an unreadable answer keeps the wait.
  A push that lands between the branch read and the merge is merged with it, since nothing holds the merge to the read version: the answer names the version Bitbucket merged (`MergeAnswer.mergedHead`), the receipt records that version, and the task's merge line in Activity says another version than the approved one merged instead of hiding it.
  The same line and receipt come from one place (`otherMergedFacts`) for a merge confirmed at once, one a reconcile finds made, one found already made, and a pull request named by its number (`check_change pull`), whose reviewed close keeps the line.
- **Its merge queue**: on a main branch with Bitbucket's merge queue, the merge answers 202 and the pull request reads `queued`, or the merge's task reads pending with its place in the queue (`queued_pullrequest`); either is the typed answer `MergeAnswer.queued`, and the pull request's `queued` flag is the queue read (`inHostQueue`, "The host's merge queue").
- **Its comments**: the app's own marked comments are listed (`GET /pullrequests/<N>/comments`, the sign-in's own, top-level, not deleted), replaced (`PUT`) and deleted (`Forge.ownComments`), so a batch's stories past its description follow there; a commit's files come from its diffstat (`Forge.commitFiles`).
- **Its words** name the host: "Merged #4 on Bitbucket." and the host's own words for a conflict.
- **Its allowance** is Bitbucket's hourly request limit; a 429 that names its wait (`Retry-After`) is a spent allowance until then (`ForgeAllowanceSpent`), never a sign-out.

Evidence: `providers/bitbucket/bitbucketForge.test.ts` holds the opening, the status mapping, every readiness, the squash at the version, the moved branch, a push during the merge, the 409, a 202 and an answer naming no version each sent once, a failed branch read sending nothing, the last check run as the request leaves, a 202's task reference kept only for this pull request and its failure read, a description replaced without its title, the main branch's strategies and no merge sent without one, the merge queue's 202 and pending task read as queued, Bitbucket's 400 as its refusal, the crew's own marked comments and a commit's changed files, and the fork's facts, reuse, making and pull request read in the fork; `src/core/workspace/projectContributions.test.ts` holds a Bitbucket fork made only after the consent click; `mergeReviews.test.ts` holds a numbered review's receipt naming the version that merged; and `tests/e2e/bitbucket-delivery.spec.ts` runs the journey on bitbucket.org: a crewmate's pull request, its build statuses as the card's checks and the captain's squash merge at the pushed version, a moved branch, a conflict, a rule wanting an approval, a draft, a failed, running or stopped build each merging nothing, a merge Bitbucket has not finished asked once, and a push during the merge merged and told.

**Not yet:** a manual Pipelines step told apart from a running one, and reviewing someone else's pull request from a fork.

## Bitbucket Data Center

A Bitbucket Data Center server is kind `bitbucket` at its own address, as a GitLab server is kind `gitlab`: any address but bitbucket.org is one.
Its row in `src/shared/forgeKinds.ts` carries the facts that differ on a server (`ServerFacts`, read through `serverFactsAt`): a project's page is `projects/<KEY>/repos/<slug>`, or `users/<user slug>/repos/<slug>` for a person's own project, a branch's compare page is `compare/commits?sourceBranch=refs/heads/<branch>&targetBranch=refs/heads/<base>`, the crew's gateway speaks the server's own REST API (`api: "bitbucket-data-center"`, read through `apiDialectAt`), and the server takes batches.
A project's address over HTTPS is `https://<server>/scm/<key>/<slug>.git`, which the app reads as the owner `scm/<key>`; over SSH the owner is `<key>`; both are the project `<KEY>` (`dataCenterProjectKey`).
A server with a context path or on another port is not offered.

The key form at a server's address says to make an HTTP access token on that server, under Manage account -> HTTP access tokens, and names its permissions: Project read and Repository write (`forgeKeyScopesText`); it never names the Atlassian account.
`createBitbucketServer` asks the server who the token is: `GET /rest/api/latest/application-properties` must name Bitbucket at 8.19 or newer, since the pull request reads and the version-held merge below need it, and an older server or an address that is not Bitbucket's is refused as not that kind of server, in words naming Bitbucket Data Center 8.19 (`forgeKeyProblemText`).
It then reads `GET /rest/api/latest/users?limit=1` with the token and names the person from the answer's `X-AUSERNAME` header, or from `/plugins/servlet/applinks/whoami` when an answer carries none.
That name is the sign-in's git user (`ForgeWhoAmI.gitUser`): git over HTTPS takes the person's own name with the token as the password.
`DataCenterClient` (`providers/bitbucket/dataCenterClient.ts`) sends the token as `Authorization: Bearer` only to that server's `/rest/` paths, refuses redirects, bounds each answer to 256 KiB and each request to 30 seconds, and pages a list by `start` and `nextPageStart`.
Data Center answers 401 both for a token it does not accept and for a permission the token lacks, so a 401 naming an `AuthorisationException` is `permission` and only another 401 asks the health service to check the sign-in.
`bitbucketDataCenterBaseFor` uses `https://<server>`; `INFINITARY_BITBUCKET_DATA_CENTER_URL` overrides it only in an unpackaged development/test run.

`DataCenterProjects` (`providers/bitbucket/dataCenterProjects.ts`) lists `GET /rest/api/latest/repos?permission=REPO_READ`, 100 per page up to ten pages, and says when the listing was cut; an exact `KEY/slug` is looked up directly.
A project's clone address is the server's own HTTPS clone link with the account's name taken out.

`DataCenterForge` (`providers/bitbucket/dataCenterForge.ts`) reaches the repository at `/rest/api/latest/projects/<KEY>/repos/<slug>`:

- **Its ordinary change** is a pull request from the project's own branch onto the default branch (`POST /pull-requests` with `fromRef` and `toRef`, as a draft when asked), named `#N`; its head is the full commit id the server names (`fromRef.latestCommit`), and `changeFor` lists the branch's open outgoing pull requests (`at`, `direction=OUTGOING`).
- **Its story** is the saved story's Markdown with every picture on the merge card (`media: "card-only"`); a description is replaced at the version read (`PUT` with `version`), keeping the reviewers, and the server refuses an older version.
- **Its checks** are the build statuses on the head (`GET /rest/build-status/latest/commits/<id>`), the newest per key; a cancelled build reads cancelled.
- **Its readiness** is the server's own merge check (`GET .../pull-requests/<N>/merge`): a draft, a conflict, any veto such as a missing approval or build, or not known yet.
- **Its merge** is a squash where the repository's merge strategies allow one, otherwise a rebase merge (`rebase-no-ff`), then a merge commit (`no-ff`), read from `GET .../settings/pull-requests`.
  The app reads the pull request, sends nothing when its head is not the checked version, and merges at the version it read (`POST .../merge?version=<N>`): a push in between moves the version, the server refuses the merge with a 409, and nothing goes in.
- **Closing** declines the pull request at its version, and a branch is deleted through `branch-utils`.
- **Its comments** are read from the pull request's activity ("Comments on a pull request"); the app's own marked comments are listed there too, posted (`POST .../comments` with `text`), and replaced or deleted at the version the server names, read just before (`PUT` with `version`, `DELETE ?version=`); a commit's files come from `GET .../commits/<id>/changes`.
- **Its main branch's checks** are the build statuses on the default branch's head ("A main failure's wake").
- **A contribution** opens its pull request from the person's fork (`fromRef.repository` names the fork), reads its branch there, and leaves its merge to the project's maintainers ("Contributing through an owned fork").
- **No runs, logs or release files**: a check on Data Center is a build status another service posts, whose link names where its log is.
  `read_workflow` and `download_artifact` answer that in words naming the server (`Forge.noRunsWords`), and so does a release file sent through `github_write`.

A project on Data Center merges in batches as on Bitbucket Cloud ("Batches of your own"), and the crew reaches the server through the gateway ("On Bitbucket Data Center" under "The gateway").

Evidence: `providers/bitbucket/dataCenterForge.test.ts` holds the sign-in, the projects, the pull request, its checks, merges and description, the Integrations row's actions and a pull request's page; `dataCenterReach.test.ts` holds the comments read from the activity, the app's own comments replaced and deleted at the version read, main's checks, the fork's facts, finding and making it, a contribution's pull request and refused merge, and the open pull requests panel; `dataCenterGateway.test.ts` holds the crewmate tools over a stand-in server; and `tests/e2e/bitbucket-data-center.spec.ts` and `tests/e2e/bitbucket-data-center-batches.spec.ts` run the journeys: a crewmate's pull request merged at its version, and a batch of one squashed, a batch of two held on a failed build, combined again by keys and merged as a rebase merge.

**Not yet on Data Center:** a computer that runs work signing in there before it has this version.

## GitLab merge requests

A GitLab project's direct-pr task delivers the way a GitHub one does: the crewmate pushes its branch and calls `open_change`, the checks gate and `check_change` read the pipelines, the check watch follows them, and the captain's merge, or a kept merge approval (FI3-304), merges the checked version the way the project allows ("A requested merge").
`GitLabForge` (`providers/gitlab/gitlabForge.ts`) reaches the project at `/projects/<encoded group/subgroup/name>`, so nested groups keep their whole path, through the same `GitLabClient` and per-host sign-in.

- **Its ordinary change** is a merge request from the project's own branch onto the default branch (`POST /merge_requests`, `source_branch`, `target_branch`, `title`, `description`); a fork's merge request from a branch of the same name is never taken for it.
  A new merge request's description is its saved story: gitlab.com confirms every selected upload first, while a self-hosted server publishes the text and retains media on the merge card ("Saved change stories" below).
  It is named `!N` with GitLab's page, and recorded on the task as `changeLabel`, `prNumber` and `prUrl` like a pull request; surfaces keep the app's word, pull request.
  Its head is the merge request's `sha`.
  Its head repository, which a merge review requires, is the project's own path when GitLab names the same `source_project_id` and `target_project_id`, and an immutable `gitlab-project:<id>` identity for a fork.
  A missing source or target identity remains unproven and the review refuses it.
- **Its checks** are read for the head and nothing older (`checks()`):
  - every pipeline on the head counts - a branch pipeline, a merge request pipeline (`refs/merge-requests/<N>/head`) - and so does a merged-results or merge-train pipeline (`.../merge`, `.../train`), whose own commit is a merge of the head into the target branch: the app reads that commit's parents and counts it only when the head is one of them;
  - a later pipeline on the same ref for the same head stands for that ref, the way a rerun does on GitHub; pipelines on different refs all count;
  - each counted pipeline is one check and each of its jobs another; pagination limits mark the reading incomplete rather than inventing a pending check;
  - a running, created, pending, scheduled or waiting job or pipeline is `pending`; a failed one is `failure`, a cancelled one `cancelled`, a skipped one `skipped`;
  - a manual job a person must start, and a pipeline GitLab marks `manual`, carries `manual`: it waits to be started, and holds the change as GitLab refuses to merge a blocked pipeline when pipelines must succeed, with nothing running for a wake (INF-4552);
  - a manual job the project marks optional reads `skipped`, because GitLab leaves it out of the pipeline's status;
  - a failed or cancelled job the project allows to fail (`allow_failure`) reads `neutral` and carries `failureAllowed`: it holds nothing, and the checks say it was allowed to fail, because GitLab counts it as passed with warnings and its pipeline succeeds (INF-4557);
  - no matching pipeline yields an empty list, not an expected check inferred from earlier heads or project history; A read GitLab refuses or answers unreadably fails the reading; it is never taken as no checks.
- **Its readiness** (`pull`) reads `detailed_merge_status`: `mergeable` is clean; `conflict` (or `has_conflicts`) is a conflict; `need_rebase` is behind; a draft is a draft; an approval, a discussion, a required pipeline or another rule is blocked; GitLab still checking, or a status the app does not know, is computing.
  A server older than `detailed_merge_status` answers `merge_status`.
- **Its merge** (`putIn`) checks the merge request's title against the active naming runbook, then asks `PUT /merge_requests/<N>/merge` with `sha` (GitLab refuses 409 when the merge request moved on), `squash: true` and the squash commit message `<title>`, a blank line and the description.
  A saved story ("Saved change stories" below) gives its plain summary and the footers the naming runbook names in the description's place.
  A 200 is not a merge on its own: an answer that does not read merged is read back once; a merge request GitLab has locked while it merges is a transient answer the merge path reads back again, and anything else but merged is refused with GitLab's `merge_error`.
  A locked merge request reads open and computing, never closed.
  GitLab's 405, 409 and 422 are `refused`; the kept approval reads the merge request's own readiness for the cause, and the feed recognises 422 "Branch cannot be merged" as a conflict.
- **A 401 is not always a sign-in.**
  GitLab answers 401 when a working key may not accept a merge request; the client then asks `GET /user` with the same key, and a key GitLab still answers for makes the refusal `permission`, while only a key it refuses there is `sign-in` and asks the health service to look again.
- **Its words** name the host: "Merged !4 on GitLab.", "gitlab.example.com holds it for a required review or another rule on the main branch", "the app's GitLab sign-in is needed" - `forgePlace` and the forge's label, never GitHub by default.

Evidence: `tests/gitlabStub.test.ts` drives the real forge against the e2e stand-in on both host kinds (open, find, close, every check rule above, the stale-head, conflict and closed refusals, the squash and its message), `providers/gitlab/gitlabForge.test.ts` holds every readiness status, the merge read back and the 401 rule, `changeMerge.test.ts` ("a merge request on GitLab") and `settleOwners.keptMergeRepairs.test.ts` (a kept GitLab merge approval waiting on GitLab's rules, then merging) hold the delivery path, and `tests/e2e/gitlab-delivery.spec.ts` runs the journey on gitlab.com and a self-hosted server: a crewmate's merge request, its pipeline as the card's checks and the captain's squash merge at the pushed version, and a moved head, a conflict, a failed pipeline, a running job, a manual job nobody started and a failed merged-results pipeline each merging nothing.

## A computer's own sign-in

A computer that runs work (`docs/helper.md`) signs in to GitHub, GitHub Enterprise, GitLab and Bitbucket for its own clones and pushes, and never uses this Mac's sign-in; pull requests are still opened, checked and merged from this Mac, with its own (design skill `components/devices/SignInOnAMac`, "GitHub on another device").

- **The same service, there.**
  The computer keeps a `ForgeSignIns` of its own over `work/forges/` (`startComputerForges`, `src/core/helper/forges.ts`), from the same providers as this Mac (`forgeSignInProviders`, `src/core/forge/index.ts`): the same 0700/0600 files, health log, five health rules and renewal of a short-lived sign-in, on that computer's own minute tick.
  This Mac holds no store for it, so it can neither read nor renew it.
- **The device flow runs there, and is drawn here.**
  Settings -> Integrations asks `inf:devices:forge-sign-in`, which asks the computer `inf:sign-ins:forge` (`DeviceSignIns`, `src/core/devices/deviceSignIns.ts`).
  The computer asks GitHub for the code and sends it here as a step of the sign-in (`inf:work:sign-in`, a `device_code` notice); the captain enters it on GitHub's page here, and the computer asks GitHub until it says yes and keeps the sign-in.
  Each flow's end reaches whoever started it once (`signIn(host, { onEnd })`), so the computer says signed in, "The code expired.", "Could not reach GitHub - try again." or, for a no on GitHub's page or a Cancel, nothing.
  `inf:devices:forge-sign-out` deletes the sign-in there.
  The first mate signs a computer out the same way, with `forge-sign-out` and that computer's `deviceId` (`inf:forges:sign-out`'s last element, `DeviceSignIns.signOutForge`), which refuses a host the computer holds no sign-in to and names the hosts it does.
- **Or GitHub CLI's sign-in there.**
  A computer with GitHub CLI on its own search path says so with its forges (`githubCli`), and its GitHub aside in Integrations then closes with the line "Use GitHub CLI", as this Mac's does ("GitHub CLI's sign-in" below), naming that computer.
  The click asks `inf:devices:forge-sign-in-cli`, which asks the computer `inf:sign-ins:forge-cli` (`DeviceSignIns.forgeWithCli`); the computer asks its own GitHub CLI and GitHub who that is (`ForgeSignIns.signInWithCli`), keeps only the way and the program's path, and answers whether it kept it, so no token crosses or reaches a log.
  Its row then reads "Mac mini · through GitHub CLI · clones and pushes its own work" (`way`), and its git's helper asks that computer's GitHub CLI at each push.
  An older computer that sends no `githubCli` is offered the code alone.
- **Hosts on the person's own server, there.**
  The computer's `ForgeSignIns` also holds the same servers as this Mac (`forgeSignInServers`): GitHub Enterprise and GitLab, on gitlab.com or the person's own server, and Bitbucket, at bitbucket.org or on a Bitbucket Data Center server ("Hosts on your own server", "GitLab sign-in", "Bitbucket sign-in" and "Bitbucket Data Center" above).
  Its forges list them (`servers`), and Settings -> Integrations draws a chip for each under that computer's rows, "GitHub Enterprise on Mac mini" and "GitLab on Mac mini", which opens the same key form, or GitLab's browser setup, naming that computer.
  A key is typed here and sent once with `inf:devices:forge-sign-in-key`, which asks the computer `inf:sign-ins:forge-key` (`DeviceSignIns.forgeWithKey`); the computer asks the server who the key is and keeps it, and answers only whether it kept it, so this Mac keeps nothing of it.
  GitLab's browser code runs there like GitHub's (`inf:devices:forge-sign-in-browser`, `inf:sign-ins:forge-browser`): the computer asks the server for the code with the Application ID the captain entered here, the code shows under the chips, and the computer keeps the sign-in.
  A host it lists before it is signed in is only one of its own public hosts' kinds; a server host joins its rows once it holds that host's sign-in, so an older home never offers a code it cannot draw.
  GitHub CLI's line also names a GitHub Enterprise host there.
  Its git's credential helpers are emptied for github.com and for each other host only once it holds a sign-in for it, read at each spawn (`forgeFiledHosts`), so a GitLab host it has no sign-in for keeps the computer's own git login, even under a home too old to offer GitLab's sign-in; its refused clone of a GitLab or filed server host reads as that host's sign-in being needed (`forgeKnownHosts`), and the home holds the task behind that host's own gate.
  A computer without the `computer-forge-servers` change lists no servers, so it gets no chips and is never sent these orders.
- **What crosses.**
  The computer's sign-ins whole (`inf:work:sign-ins`) carry its `forges`: each host it is signed in to, who GitHub says it is, its health and since when, and each host it offers - never the sign-in.
  The feed says "Mac mini is signed in to GitHub."
  (`device_signed_in`).
- **Its git.**
  Every child the computer starts carries the app's own helper pointed at its `forges/` (`configureComputerGit`; "Git that never prompts" above), so its git answers GitHub with the computer's own sign-in, never prompts, and never reaches another sign-in on that Mac.
  Its clones and pushes themselves are piece 10.
- **Where it shows.**
  Settings -> Integrations lists a row per computer and host under this computer's own connections, in the same box (`settings/DeviceForgeRows.tsx`): "GitHub · octo" over "Mac mini · clones and pushes its own work", or the computer's name over "not signed in to GitHub" with a secondary Sign in, whose code to read shows in the aside under the row, and a signed-in row's menu holds Sign out.
  This computer's own GitHub connection above it is the sign-in that opens, checks and merges pull requests.
  Settings -> Projects holds no sign-in, this computer's or another's.
  A computer older than `FORGE_SIGN_INS_SINCE` says no hosts, so it gets no row.
- **The card, and the typed refusal** (the captain's picks on FI3-1350).
  A project that lives on GitHub, GitHub Enterprise, GitLab or Bitbucket set to run on a computer that offers that host's sign-in from here and holds none raises the host's own card for that computer (`computerForgeHost`, named by `computerForgeName`), "Sign in to GitHub on Mac mini" (`CardService.addDeviceForgeSignInCard`, its words `src/shared/deviceSetup.ts`): "website runs on Mac mini now.
  Mac mini needs its own GitHub sign-in to clone it and push." and "Its next task waits for it.
  This computer's GitHub sign-in is not sent there.", with one button that opens Settings -> Integrations with that computer's sign-in started under its row (`forgeSignInOn` on an effect naming `projects`, which `openedSection` routes to Integrations); the feed says "website's next task waits for Mac mini's own GitHub sign-in." once per project and computer.
  It is raised when Runs on names such a computer (`DeviceSetup.runsOnChanged`), when a task is about to start there (`TaskPlacement.placedWaitFor`, before anything is tried), and when that computer's clone is refused: the computer answers `inf:working-copy:prepare` with `{ refused: "forge-sign-in", host, name }` rather than a failure's words (`workingCopyOrder`, `src/core/helper/workingCopyOrders.ts`, from `forgeAuthRequired`), the home reads it as `ForgeAuthRequiredError` (`PlacedCopies.prepare`), and the task waits behind `forge-sign-in:<host>@<device>`, never this Mac's own card for that host.
  While that computer's setup card is on the stack (`docs/devices.md`, "Finishing its setup"), its own GitHub row asks for github.com instead and no second card goes up; another host's card goes up beside it, since the setup card does not ask for that host.
  The moment the computer reports that host's sign-in, the card comes down and every task held for it starts (`TaskPlacement.resumeDeviceForgeSignInTasks`).
  A computer too old to offer the sign-in from here is tried, and a refusal there holds the task the same way.
  A Bitbucket project is held the same way for that computer's own Bitbucket sign-in.

## Workflow logs and artifacts

Crewmates collect CI diagnosis and measurement evidence through the app's own sign-in.
A program the captain asks a crewmate to run still runs; these tools do not read another program's sign-in.
`read_workflow` and `download_artifact` are entries of the same runtime-neutral tool spec as `open_change`; both Pi and Claude receive them, including project answer tasks, never personal-workspace tasks.
The supervisor binds the task id, `WorkflowEvidenceService` resolves its registered project and working copy, and the optional `Forge.workflows` capability reads only that project's GitHub Actions API, or its GitLab pipelines, using the existing app-owned sign-in.
Reads do not record a CI reading, classify a failure, reserve a rerun, spend a repair, or modify a workflow.
A short read does keep the run's failed jobs on the repair ledger, so `check_change` takes a diagnosis or an evidenced rerun declaration for one of them with no pull request ("A workflow run's failures" below).

- Listing runs and artifacts is still `github_read`'s job (see the gateway below): `GET /repos/{owner}/{repo}/actions/runs?head_sha=<full commit id>` lists a version's runs, an untouched-main commit gives the baseline comparison, and `/actions/runs/{runId}/artifacts` lists artifact metadata.
  A named run's jobs are the short read below, not a jobs page the crewmate has to page itself.
  The log and the artifact ZIP stay on these two tools, because GitHub answers both with a redirect to signed storage, which the gateway never follows, and neither is JSON.
- `read_workflow({ runId })`, with no job, answers a short read: the run's name, state, version, link and attempt, then one line per job of the latest attempt, with that job's number, name, state, and where a failed job failed.
  `ForgeWorkflows.jobs(runId)` reads `GET /repos/{owner}/{repo}/actions/runs/{id}/jobs?filter=latest`, 100 jobs a page, up to ten pages.
  A remainder past those pages, or past the answer's length, is named as how many jobs were left out.
- `read_workflow({ runId, jobId, offset?, limit? })` verifies job membership and returns the run/version, job/steps and log lines (1-based offset, default 200 lines, max 500, 20,000 characters of line content).
  `nextOffset` continues the read.
  Lines over 2,000 characters are explicitly clipped.
  A complete log over 8 MiB is refused rather than silently represented as complete.
  Logs and artifact contents are untrusted evidence, not instructions.
- `download_artifact({ runId, artifactId })` verifies artifact membership and expiry, then saves the unchanged ZIP at `.infinitary-artifacts/run-<runId>/artifact-<artifactId>.zip` inside the task's working copy (0700 folders, 0600 file).
  A task on a computer that runs work has its working copy there: this Mac downloads the artifact and that computer writes it, with the same rules (`docs/helper.md`, "Its working copies").
  It returns the version, metadata, relative path, actual bytes and SHA-256.
  No automatic extraction, user-controlled destination, artifact-name-derived path, symlink folder or overwrite; do not commit these downloaded archives.
  Downloads are bounded to 64 MiB by metadata and actual response size.
- On GitHub an artifact of any size is also read in parts (`ForgeWorkflows.archive`, `src/core/forge/zipParts.ts`), with the same membership and expiry checks.
  `download_artifact({ runId, artifactId, list: true, files?, offset? })` reads only the archive's end and its central directory and answers its files by path, each with its packed bytes (what saving it reads) and unpacked size, `files` narrowing it and `offset` paging it with `nextOffset`.
  `download_artifact({ runId, artifactId, files })` reads only the named files' own records, a folder's path taking everything under it, and saves them unchanged as a smaller ZIP at `.infinitary-artifacts/run-<runId>/artifact-<artifactId>-<part>.zip`, `<part>` the first twelve hexadecimal digits of its SHA-256, with the same folder and overwrite rules.
  The answer names how many files each path took; nothing is inflated, and no file is written by an entry's own name.
  The 64 MiB bound counts the selected records, before any of them is read, and the central directory's own size.
  Each part is a Range request to the signed address the first one reached, each within its own 30-second request bound, and must come back 206 with a `Content-Range` naming the artifact's size; storage that sends the whole archive instead is refused.
  GitLab answers that its host cannot list an artifact's files, and a split archive is refused.
- `download_artifact({ runId, artifactId, file })` on GitHub names exactly one non-folder member and streams it directly into the task's evidence folder, without the buffered ZIP's 64 MiB limit.
  It cannot be combined with `list`, `files` or `offset`; duplicate member names and missing files are refused.
  Stored and deflated members, including ZIP64, are read in 1 MiB ranges, unpacked incrementally, and checked against the declared unpacked size and CRC before publication.
  The host chooses a safe name from the run, artifact and member-name digest, retaining only a simple extension; member paths never become filesystem paths.
  The answer carries the run/version, artifact, original member, absolute evidence path, actual bytes and SHA-256, with `extracted: true`.
  A partial or corrupt local download is removed; an existing destination, a linked evidence folder or a linked destination is never overwritten.
  On another computer, the home stages the verified file in task temporary storage and reuses the bounded source-file transport with `evidence: true`; the receiver verifies size and SHA-256 before publishing in evidence, and the home removes staging even after transfer failure.
  Incomplete receiver pieces stay only in the task's temporary folder until a deliberate resumed transfer or task cleanup; they are never reported as complete evidence.
  A computer on an older contract major takes no work from the home, so this mode never falls back to downloading the whole archive.
  This evidence-only transfer has no total-size cap; other source-file transfers retain their 1 GiB bound, and disk space or an expired signed address can still stop a download.
- Download redirects are followed manually with a 30-second request bound and at most three redirects.
  The app's sign-in is sent only to the initial GitHub API request, never signed storage; production accepts only HTTPS GitHub-owned storage or Azure Blob storage.
  Neither signed URLs nor sign-in material is returned.
  Local development stand-ins may redirect within their API origin.
- Missing sign-in, a 401, permission/rate-limit refusal, missing/expired evidence, unsupported hosts and bounded-download failures are explanatory tool results.
  A 401 asks the existing health service to look again, never signs the person out on its own.
  The crewmate reports a sign-in blocker rather than looking for another account.
  Missing evidence is no attribution proof.

On GitLab (`providers/gitlab/workflows.ts`) a run is a pipeline, a job one of its jobs, and an artifact a job's artifacts archive, named by the job's id:

- Listing pipelines is `github_read`'s job here too: `GET /projects/<url-encoded group/name>/pipelines?sha=<full commit id>` lists a version's pipelines, and a job's artifacts stay on that job.
  A pipeline's jobs are the same short read: `read_workflow({ runId })` with the pipeline id and no job.
  `ForgeWorkflows.jobs` reads `GET .../pipelines/{id}/jobs`, which leaves retried jobs out, 100 a page, up to ten pages, and names a remainder the same way.
- `read_workflow({ runId: <pipeline id>, jobId })` reads the pipeline (`GET .../pipelines/{id}`) and the job (`GET .../jobs/{id}`), refuses a job from another pipeline, then reads `GET .../jobs/{id}/trace` under the same bounds.
  GitLab keeps the terminal's colour codes and its collapsible-section markers in the log it serves; the lines come back without them.
  The job has a `stage` and no steps, and both attempts read 1: a retried job is a new job with its own id.
- `download_artifact({ runId: <pipeline id>, artifactId: <job id> })` refuses a job from another pipeline, a job with no archive (expired once `artifacts_expire_at` has passed) and an archive over 64 MiB by its size, then saves `GET .../jobs/{id}/artifacts` at `.infinitary-artifacts/run-<pipeline id>/artifact-<job id>.zip` with the same rules; `expiresAt` is null for an archive GitLab keeps until someone removes it.
- GitLab sends an archive from object storage through a redirect (`GitLabClient.download`): up to three are followed by hand within the 30-second bound, the key goes only with the first request to the API, and a next address must be the API's own origin or known artifact storage over HTTPS - gitlab.com's `cdn.artifacts.gitlab-static.net` and Google Cloud Storage, and Amazon S3, Azure Blob and Google Cloud Storage for a self-hosted server (`isArtifactStorage`).
  A server that keeps artifacts on other storage, such as its own MinIO, is refused as an unsafe download.
- A 401 asks GitLab who the key is (`GET /user`): only a key it no longer answers for is a sign-in, which asks the health service to look again; otherwise it is a permission refusal.

On Bitbucket (`providers/bitbucket/workflows.ts`) a run is a pipeline, named by its build number, the number Bitbucket shows on its page, and a job is one of its steps, named by its place in the pipeline from 1, since Bitbucket names a step by a UUID alone:

- Listing pipelines is `github_read`'s job here too: `GET /repositories/<workspace>/<repo>/pipelines?sort=-created_on` lists them, newest first, each with its `build_number` and its commit.
- `read_workflow({ runId: <build number> })` reads `GET .../pipelines/<build number>` and refuses an answer that names another number, then lists `GET .../pipelines/<uuid>/steps`, 100 a page, up to ten pages, one line per step numbered by its place.
  A completed pipeline or step reads `completed` with Bitbucket's result: `SUCCESSFUL` success, `FAILED` and `ERROR` failure, `STOPPED` and `EXPIRED` cancelled, `NOT_RUN` skipped; one still going reads its state in lower case (`pending`, `in_progress`) with no conclusion, so the run watch reads it as running.
  The run's attempt is Bitbucket's `run_number`, which a rerun from its page raises.
- `read_workflow({ runId, jobId: <step place> })` reads the step's log, `GET .../pipelines/<uuid>/steps/<step uuid>/log`, under the same bounds, without its colour codes.
  Bitbucket may send the log from storage through a redirect (`BitbucketClient.download`): up to three are followed by hand, the token goes only with the first request, and a next address must be the API's own origin, a bitbucket.org host or Amazon S3 over HTTPS (`isBitbucketLogStorage`).
- `download_artifact` answers that Bitbucket offers no download of a pipeline's artifacts through its API, without a request; the crewmate reads the step's log instead.

Evidence: `src/core/forge/providers/github/workflows.test.ts` drives the actual tool entries through the task service and real HTTP stand-in, lists runs, failed steps and artifacts with `github_read`, checks log continuation, verifies the archive bytes/hash/mode, and exercises authorization, membership, expiry, byte limits, unsafe redirects, linked folders and overwrite refusals.
Its parts tests list and select files from an archive past 64 MiB built from records of a real phone-logs artifact (`tests/fixtures/forge/phone-logs-sample.zip`) and a 64-bit one (`phone-logs-zip64.zip`), unpack the selection with an independent reader, and hold the bytes read under 1 MiB.
`tests/e2e/forge-signin.spec.ts` commissions a crewmate in the hermetic app with the app's sign-in, lists the version's run, jobs and artifacts with `github_read`, reads a failed measurement job, downloads and reads the ZIP's JSON, and separately proves missing sign-in reports a blocker without an Actions request.
`crewmateTaskTools.test.ts` holds the Pi and Claude tools to the same callbacks, descriptions and schemas.
`src/core/forge/providers/bitbucket/workflows.test.ts` reads a pipeline by its build number, its steps by place with the run watch naming the failed one, a step's log as plain lines, a log redirected to storage the token never reaches and one redirected elsewhere refused, a step past the last named, and the artifact answer sent with no request.
`src/core/forge/providers/gitlab/workflows.test.ts` drives the same tool entries over a GitLab stand-in - the version's pipelines and jobs with `github_read`, a log paged without colour codes, the archive saved from signed storage the key never reaches - and every refusal: another pipeline's job, a missing, expired or oversized archive, a 401 by whether GitLab still answers for the key, an unknown redirect, and the bounds; `tests/gitlabStub.test.ts` reads the e2e stand-in's log and archive on both kinds of host, and `tests/e2e/gitlab-delivery.spec.ts` has a crewmate on gitlab.com and on a self-hosted server list a failed pipeline, read its job's log, save and read its archive, and be refused a write to another project.

## The gateway (`github_read`, `github_write`)

The captain's plan (FI3-70, locked 25 Sep): crewmates reach the rest of a project's GitHub REST API through the app's own sign-in.
Use this connection for the crewmate's own GitHub work.
When the captain's own words ask a crewmate to run a program, that rule is in the crewmate prompt.
Two entries of the runtime-neutral tool spec, both Pi and Claude, served by `GithubGatewayService` (`src/core/orchestrator/githubGateway.ts`) over the optional `Forge.api` (`src/core/forge/api.ts`): each host's raw call, its own policy (`route`) and its next page (`nextPath`).
On a GitLab project the same two tools reach GitLab's API (below); they keep their names, because GitLab's paths are not GitHub's and a crewmate names the one where its project lives either way, and a renamed tool would break every crewmate session that already holds them.
`github_read` (GET/HEAD) and `github_write` (POST/PATCH/PUT/DELETE) go to any non-personal task; a task that only answers starts or reruns a run on its own project at once, and every other write it makes asks the captain (below).

- **Reads reach what the sign-in may read; writes go at once only to the task's project.**
  `path` is a relative path checked by `parseApiRequest`; the caller never names a host, token or header.
  A read that passes the shape checks is sent, and the host's own status and answer come back (FI3-1571 piece 3): there is no read list.
  That reaches the person's account, organizations, notifications and members as well as every repository the sign-in can see; the sign-in's own permissions decide.
  A write to `/repos/{owner}/{repo}/...` of the task's registered project, from a task that ships a change, is sent at once; the policy routes it as `own`.
  From a task that only answers, only a start or rerun of a run on its own project is sent at once: a workflow dispatch or a run or job rerun on GitHub, a pipeline start, a pipeline or job retry or a manual job's play on GitLab (INF-729, the captain's way D, so a nightly check starts with no click).
  Such a start may be a release workflow, as a building task's already may.
  Every other write is kept for the captain's click ("A write that asks", below).
  A task with no project, or whose project lives where the app has no JSON API - kept on this computer, or on a plain Git host - reads and asks through the github.com sign-in (`accountForge`).
  No GraphQL (`/graphql` is refused for reads and writes alike, and never becomes an ask).
  A release file is not this JSON body: it goes through `github_write`'s `file` field ("Release files", below).
  Private content from any repository the sign-in sees can reach the crewmate; an organization that has not approved the app still hides its private repositories.
  The captain chose this on FI3-1309 for repositories and on FI3-1571 for everything else the sign-in may read.
  Traversal, encoded separators or dots, empty segments, fragments, repeated query keys and `per_page` over 100 are refused.
- **Merges and the default branch use the merge card.**
  Raw writes that merge a pull request or branch are refused before send, including GitHub's asynchronous merge and merge-upstream calls, with a pointer to `check_change pull` and the merge card.
  A ref update, creation or deletion, branch rename, or file/commit write that moves the default branch is refused too, as is changing which branch is the default.
  The gateway reads the current default branch where the project lives when a write can touch it; an unreadable default branch never grants permission.
  Other branches remain available, including their ref updates and deletion; git pushes remain governed by the task's brief, outside this gateway rule.
  Workflow operations, workflow-file edits on another branch, repository dispatches, other project settings, permissions, secrets, keys and hooks go through the same API.
  The crewmate must still act only within the captain's task.
  A write to account or organization administration (keys, emails, members, settings, billing, `/enterprises/...`) is never the task's own, so it asks like any other.
  This is not a workflow-specific exception or a filename allowlist.
- **Caps.**
  A JSON request body is 256 KiB, one answer 256 KiB (never cut), a JSON call times out at 30 s, and a task may make 200 calls per app run.
  A read whose answer passes 256 KiB is paged rather than refused when its answer is one list: the gateway holds the answer whole up to 100 times the cap, finds the largest page of that list that fits, and reads it again at that `per_page` (`smallerPage`, `src/core/forge/api.ts`).
  The smaller page keeps the asked page's place: its size divides the items before it, so its `page` starts at the same item, and the host's own link names the next page at that size.
  A read that names no `per_page` asked for the host's default page size (`ForgeApi.defaultPerPage`: 30 on GitHub, 20 on GitLab).
  Each try is one of the task's calls, and each smaller try asks for fewer items, so the tries end.
  The answer's note names the `per_page` it was read at, and its `nextPath` goes on at that size.
  An answer no smaller page would shrink is refused with the reason: one object, a list that ignores `per_page`, a first item that alone passes the cap, a page not named by number, or an answer past the hold.
  An answer within the cap that is still longer than a crewmate's model takes whole, 50,000 characters, reaches the crewmate as a file in its task's temporary folder whose path the answer names (`docs/claude-client.md`, "Complete task reads through the tool-result cap").
  A release file has its own 2 GB cap and a 30-minute send ("Release files", below).
  Redirects are never followed.
  The answer carries the status, request id, rate limit or retry-after, and `nextPath` whenever GitHub's next page stays on the API origin and under its own path - including a repository listing's `/repositories/{id}/...` pages (FI3-1546).
  An absolute link in the answer's body loses a `token` or `access_token` query parameter before the crewmate or any saved file sees it; the file's content stays, and the answer says the download tokens were removed.
  A nonempty `temp_clone_token` field, which GitHub puts on a private repository's answer, is left out at any depth the same way, and the answer says the temporary clone tokens were removed; an empty one, as on a public repository, stays.
  Tokens already saved are left where they are.
  A GitHub refusal (422, 404, 403) is a status in the answer; a 401 asks the health service to look again.
  A crewmate's `github_read` bounds the entire callback, including travel to the home computer, to 30 seconds per attempt and one retry (`src/core/session/githubRead.ts`).
  A missing answer or transient transport failure gets that one retry; cancellation stops immediately, and a definite refusal, oversized object or rate-limit response is returned without retrying.
  After both attempts fail, the crewmate hears that the request or answer may have been lost and that the read changed nothing.
  The gateway lets only transient failures escape its crewmate entry point (`readForCrew`); its other entry points retain their own error handling.
  Host-side list paging stays within each attempt, and its continuation path keeps the smaller page size.
  Artifact downloads and release uploads keep their own longer deadlines; the quiet check remains the last resort for other lost app reads.
- **Release files.**
  `github_write` takes an optional `file`: a regular file in the task's working copy, relative to it, never a link anywhere on the way.
  With `file` set, the method is POST and `body` stays out.
  The gateway streams the bytes through `ForgeApi.upload`.
  On GitHub the path is the release's own `upload_url`, or `/repos/{owner}/{repo}/releases/{id}/assets`, and it is accepted only on that host's upload origin: `uploads.github.com`, `uploads.<name>.ghe.com`, or a GitHub Enterprise Server's `/api/uploads`.
  A GitHub Enterprise Server address is accepted only under that `/api/uploads` prefix, which is removed before the path is checked.
  An unpackaged stand-in sends to the API base the test pointed at, never to GitHub.
  The file's type comes from its name, and a file over 2 GB is refused before anything is sent.
  A missing `name` query is filled from the file's name.
  On GitLab the path names the release, `/projects/{id}/releases/{tag}`.
  The bytes go to that project's generic package registry, under the package `release` at that tag, and a link on the release points at that package file.
  A server whose package registry is not available is refused in plain words, and no release link is created.
  The file stays within the same 2 GB cap.
  On Bitbucket the path is the repository's Downloads, `/repositories/{workspace}/{repo}/downloads`, and the file goes there as one multipart upload under the field `files`; a file of the same name already there is replaced, as Bitbucket does.
  Bitbucket Data Center keeps no release files, and the refusal says so (`Forge.noRunsWords`).
  The own-project and ask rules stay: a file for another project is kept, and the click reads the file then, so the ask stores the path and not the bytes.
  A task running on another computer is refused, because the file is in that computer's working copy and the call is sent from here.
- **Reading a project's pull request history.**
  A `/pulls` page carries two repository objects and the whole description of each pull request, so on this project even 15 to a page passes the 256 KiB cap and comes back as a smaller page.
  `/repos/{owner}/{repo}/issues?state=all&sort=created&direction=desc` lists pull requests too, each with `pull_request.merged_at`, and 30 to a page fits here, so it pages in fewer calls.
  GitHub names a repository listing's next page by repository id (`/repositories/{id}/...`); that answer's `nextPath` reads it, so the crewmate pages on without adding `page=N` itself (FI3-1546).
  File-level work belongs in git, not the API: `git fetch origin '+refs/pull/<n>/head:refs/remotes/pr/<n>'` brings a pull request's head into the working copy through the app's own sign-in.
  `refs/pull/*/head` brings them all, into refs that every working copy of the clone shares.
  `git merge-tree --write-tree --merge-base=<base> <head> <other>` then replays a conflict between two of them with no API call, and a squash merge on the default branch carries its pull request's checked title as its subject.
- **Verification workflow requests reuse the gateway.**
  A crewmate calls `github_write` with `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` and GitHub's normal JSON body, such as `{"ref":"<workflow-branch>","inputs":{"suite":"full","ref":"<exact-source-commit>","task":"<task-key>","reason":"<why the Linux sweep is needed>"}}` for `source-journeys.yml`.
  This Linux-only route retains all nine full-suite groups without Mac tests, signing or packaging; `suite: alone` remains the separate fresh-state pass.
  Before requesting work, read existing same-source checks, including running checks, and reuse applicable evidence rather than duplicate it.
  A manual `verify.yml` full-system request uses `{"ref":"<workflow-branch>","inputs":{"full_system":true,"ref":"<exact-source-commit>","task":"<task-key>","reason":"<named exception; why narrower proof cannot suffice>"}}`.
  A Mac-only request, such as a Mac runner's trial, passes `"mac_only":true` in place of `"full_system":true` with the same source, task and reason: the three Mac jobs run and no Linux job does, and the two selections cannot be combined.
  A Linux-only request, a change sent back from its batch (`docs/testing.md`, "What a task branch requests"), passes `"linux_only":true` in its place with the same source, task and reason: every Linux job the swept batch runs runs, on the project's Linux machines, and no Mac job does; it combines with neither other selection.
  Both verification profiles include Linux and Mac; `all_journeys: false` narrows Mac journeys, not the broad Mac job, signing or packaging.
  Without the explicit selection, verification stops before expensive jobs; installer-only/reuse routes remain separate and reject a simultaneous full-system, Mac-only or Linux-only selection.
  Main and release reusable callers need no manual selection, and together keep full-system coverage: main runs every check but the old journey set, and every alpha runs every journey or reuses the swept batch's.
  A Linux-only or Mac-only result cannot satisfy their full-system proof, and a request for all Linux tests does not authorize Mac work.
  The caller chooses the workflow, ref and optional inputs its task needs; the host adds no task-branch or input restrictions.
  The workflows themselves refuse a requested `ref` no branch of the project holds, such as a commit only a pull request holds (`docs/public-ci.md`, "A check requested by hand"): push the branch, then request.
  In this repository, `verify.yml` on request runs only the tests tagged `MAC_ONLY_TAG` on the Mac; a request may pass `"all_journeys":true` to run every journey there, as every alpha does (`docs/testing.md`, "Tests that need a Mac").
  Starting, cancelling, enabling, disabling and rerunning workflows are project operations, not account administration.
  A successful response means GitHub accepted the request, not that checks passed; find its run with `github_read`, confirm `head_sha`, then take a short `read_workflow({ runId })` read to watch that run and end the turn.
  Use `check_change` separately for a pull request's checks.
  Dispatch itself changes no check or repair facts.
  A write whose outcome is uncertain is never retried automatically; read the project's state before deciding what happened.
- **Accepted reruns refresh the checks.**
  `POST .../actions/runs/{id}/rerun`, `.../rerun-failed-jobs` and `.../actions/jobs/{id}/rerun` are available without a gateway reservation veto, like other project operations.
  On acceptance, the gateway dates an existing unspent reservation when this rerun is the one it reserved: a rerun of the workflow run a run-bound reservation names (the route's run, or a rerun job's own `run_id`), otherwise a rerun at the change's current head; it neither invents repair history nor rewrites a previous receipt.
  It then takes the crewmate's check reading up to three times, two seconds apart, until the rerun reads as running, arming the ordinary check watch.
  The crewmate still follows its CI diagnosis and evidenced-flake rerun instructions; those govern its work, not which GitHub endpoints exist.
- **Not built yet:** automatic retry of safe reads.

Operations send their own project’s writes at once, like code changes, but receive no pull request delivery tools.
Outside-project and account writes retain the same consent boundary.

### A write that asks

FI3-1571 piece 4, the captain's answers: the crewmate asks, and the app adds the exact call and the button; a task that only answers asks for every write it makes but a run start or rerun on its own project (INF-729 way D), and so does a side-effect task, whose reply or close on an outside item is the captain's to send (`docs/task-graph.md`, "A side-effect task"); GitLab follows the same rule.
`github_write` keeps, instead of sending, a write outside the task's own project, any other write of a task that only answers - cancelling a run included - and any write through the github.com sign-in.
The merge guard runs first: a merge or default-branch move on the task's own project is refused with its pointer to the merge card, asked or not, and so is deleting a GitLab project or a GraphQL call.
The kept write is a `WriteAsk` on the task's delivery facts - its host, whose sign-in sends it (`project` or `account`), the method, the policy's path, the JSON body, and for a release file the path of that file in the working copy - kept through `TaskService` (`keepWriteAsk`), newest first, at most 8 (`WRITE_ASK_CAP`).
An integration's action that changes or sends is kept in the same list as an ask of kind `integration`, carried by the same `request_write` card and taken once by the same click, which runs it through its integration rather than this gateway (`docs/integrations.md`, "The rules").
A release file's bytes are read when the click sends it, not when the ask is kept.
A `/feedback` draft is kept the same way by its own command, never by `github_write`: `GithubGatewayService.keepFeedback` keeps it through the github.com sign-in even for a task in the destination project, and its strip draws the title and body as readable text (`docs/feedback.md`, "The review card").
The answer names the ask's id and tells the crewmate to put it on a card.
`emit_card` takes an action whose effect is `{ kind: "request_write", ask }`, beside the crewmate's own Not now and its words on why.
The emit refuses an ask that is not the task's or was already taken, two asks on one card, and an ask beside a merge or discard; only a crewmate's card on its own task may carry one.
The host names the button "Send it to GitHub", after the host's own name ("Send it to GitLab", or a server's address), or "Submit feedback" for a `/feedback` draft (`submitFeedbackWords`), and draws the exact call at the end of the body (`.inf-call`, `writeAskStrip`): the method and path, the JSON body as kept, and whether it goes through the github.com sign-in.
A card that asks is never a task's answer: the captain's click on it leaves an answer task open.
Only the captain's click from the card's own controls sends it (`GithubGatewayService.sendAsk`); a script on the card, a reply, the who-merges setting and the first mate never do.
`TaskService.delivery.takeWriteAsk` marks the ask taken in one transaction before anything is sent, so a second click, a restart or a revised card naming it sends nothing again, and the emit refuses it.
The click sends exactly what was kept, through the same sign-in, after the same policy and merge guard; a host that changed since the ask sends nothing.
It spends one of the task's 200 calls only when it is sent.
The outcome is recorded on the ask: the host's status, nothing sent (a refusal or a missing sign-in), or unknown - a call that may have reached the host without an answer - which is never sent again.
The crewmate hears it once (`write-answered`), with the host's answer within the gateway's caps, and the task's timeline keeps one line.
A task's close drops its asks that were never sent.
A crewmate on another computer asks the same way: its write and its card reach the home, which keeps the ask and sends it (protocol 5.0, `docs/contract.md`).
Evidence: `tests/e2e/forge-signin.spec.ts` - a write to another repository, a project kept on this computer creating its GitHub repository through the github.com sign-in, and a task that only answers writing to its own project - each shows the exact call on the card, nothing sent before the captain's key, one request after it, the crewmate hearing the answer, and the same ask on a revised card refused; `tests/e2e/gitlab-delivery.spec.ts` keeps a write to another GitLab project unsent.
The gateway tests (`src/core/forge/providers/github/gateway.test.ts`, `src/core/forge/providers/gitlab/gateway.test.ts`) send a task that only answers' run start and rerun at once, watch the run, and keep its cancel, its other writes, a start elsewhere and a start through the github.com sign-in; the GitHub one keeps a side-effect task's reply and close the same way.

### A reader's writes

An unsafe data reader (`docs/agents-reach.md`, "An unsafe data reader") keeps every write to its own project, run starts included, and never puts one on a card of its own.
`github_write` keeps it as a `WriteAsk` naming its card (`ForgeWriteAsk.card`), and the host lists it there (`IntegrationAsks.askForge`): it joins the task's waiting card, revised in place, or raises `write-ask-<id>`; the reader's kept integration calls join the same card (`docs/integrations.md`, "A reader's integrations").
The card draws one ticked row per call: a write's method and path and the JSON body it sends, or an integration call's place, action, exact input and the reader's reason, with the tally and legend of the integrations' card (`readerApprovalCard`), and offers Only this time and Not now.
A card of writes to one place names it in its title; one that also holds integration calls asks to allow these calls.
The click takes every row it showed before the first is sent: an unticked row and Not now send nothing, Don't file on a Build row holds back that click's writes to the row's issue (`addressesRowIssue`), and Only this time sends the others once each, oldest first, through `GithubGatewayService.sendTaken`, with the same guards as any kept write.
One `write-answered` steer names every outcome, each sent write's answer fenced under its host's label like the reader's reads; the cap and dropped asks work as they do for an integration's asks.
A write outside the project, a release file and a validation effect are refused, and `emit_card` refuses a card naming a reader's ask.
A web page the reader waits to open (`WebReadAsk`, `docs/agents-reach.md`, "Web pages") joins the same card as a row showing `GET` and its whole address, and the card adds a lead about pages, its title naming pages alone, writes on one place and pages, or calls and pages; its click opens the page once through `ReaderWebService.sendTaken`, and the steer carries the page's first part fenced under `web-data`.
A reader's Build row joins the same card but is never sent: the click files it as the captain picked on its row (`docs/agents-reach.md`, "A reader's Build rows").

### A change that answers an issue

A task filed from a reader's Build row, and every task built on it, keeps the outside issue it answers (`WorkShape.issue`) as a fact for the intake round.
The app writes no closing words of its own for it: a published change, a batch's description and its squash message carry only the crewmate's words around the story, the story, and the changes' titles.
An outside action that waits on work, such as closing a work item, is its own task waiting on that work (`docs/task-graph.md`, "A side-effect task"), and a filed Build row's notice names its issue's address for that task's words (`docs/agents-reach.md`, "A reader's Build rows").

### On GitLab

`GitLabForge.api` sends the same requests to `https://<host>/api/v4` with the app’s own sign-in there, under GitLab's own policy (`providers/gitlab/api.ts`), with the caps above.

- **Its paths.**
  A project is `/projects/{id}/...`, `{id}` its number or its URL-encoded path (`group%2Fsubgroup%2Fname`); `%2F` is accepted in any segment, as GitLab's project and group ids, file paths and branch names need, and every piece a segment decodes to is held to the same rules as a segment, so `..`, an empty piece, an encoded dot, backslash, percent sign or null, and a trailing slash are refused.
- **Reads** reach whatever the key may read, as on GitHub: there is no read list (FI3-1571 piece 3).
  That includes the key's own account, a group's members and the instance's administration where the key may read them.
  GitLab returns CI/CD variables' values, a project's or a group's, to a key with a maintainer's role, where GitHub returns only secrets' names; the captain accepted that with one rule on both hosts.
- **Writes** go at once only to `/projects/<the task's own URL-encoded path>/...`; one that names a project by its number, or any other project, the key's account or a group, asks like any other write, and the ask names the path to use when it is the task's own.
  Deleting a project itself is refused, as the app's GitHub sign-in cannot delete a repository (it holds no `delete_repo` scope).
  Raw merge-request merges, default-branch deletion, and file/commit writes on the default branch are refused with the same pointer to the merge card; writes on other branches still reach GitLab.
  On every GitLab host, the task's own merge request is opened, and its saved description replaced, only through `open_change` ("Saved change stories").
- **Reruns**: `POST .../jobs/{id}/retry`, `.../jobs/{id}/play` and `.../pipelines/{id}/retry` are reruns: an accepted one records an existing reservation and arms the check watch as on GitHub.
- **Its answers** carry GitLab's `x-request-id`, its `RateLimit-Remaining` and `RateLimit-Reset`, `Retry-After`, and `nextPath` whenever the next page stays under the server's own `/api/v4`.
  A redirect is refused, and a 401 asks GitLab who the key is before it asks the health service to look again.
  An absolute link in the answer's body loses the same `token` and `access_token` query parameters as a GitHub answer, before it is saved.
  Refusals and the call budget name the host: "Cannot call GitLab", "Cannot call gitlab.example.com".

### On Bitbucket

`BitbucketForge.api` sends the same requests to `https://api.bitbucket.org/2.0` with the app's own API token, under Bitbucket's own policy (`providers/bitbucket/api.ts`), with the caps above.

- **Its paths.**
  A repository is `/repositories/{workspace}/{repo}/...` by its slugs.
  A page's size is `pagelen`, from 1 to 100, and an oversized answer is read again at the largest `pagelen` that fits, as `per_page` is elsewhere (`ForgeApi.pageParam`).
- **Reads** reach whatever the token may read, as on GitHub and GitLab: there is no read list.
- **Writes** go at once only under `/repositories/<the task's workspace>/<the task's repo>/...`, the slugs compared without case; a repository named by its UUID in braces, or any other repository, workspace or the account, asks like any other write, and the ask names the slugs to use when it is the task's own.
  Deleting the repository itself is refused.
  A raw pull request merge (`pullrequests/{id}/merge`), a main branch move or deletion (`refs/branches/<main>`, `mainbranch` in the repository's own write) and a commit through `src` on the main branch are refused with the same pointer to the merge card; writes on other branches still reach Bitbucket.
  The task's own pull request is opened, and its saved description (`description` or `summary`) replaced, only through `open_change` ("Saved change stories").
- **Pipelines**: Bitbucket's API offers no rerun of a pipeline or a step, so nothing is a rerun there.
  A pipeline start, `POST .../pipelines`, is a run start: an accepted one arms the run watch from the answer's `build_number`, and a task that only answers sends it at once on its own project.
- **Its comments**: a comment a crewmate sends (`POST .../pullrequests/{id}/comments`) is kept on the task by its id, so the comment wake never wakes it about its own words.
- **Its answers** carry Bitbucket's `x-request-id`, `Retry-After`, and `nextPath` from the answer's own `next`, whenever that page stays under `/2.0`.
  Bitbucket's allowance is 1,000 requests an hour for the token; a spent one answers 429, and the answer says to retry later.
  A redirect is refused, and a 401 asks the health service to look again.
  Refusals and the call budget name the host: "Cannot call Bitbucket".

### On Bitbucket Data Center

`DataCenterForge.api` sends the same requests to the server with the person's HTTP access token, under the server's own policy (`providers/bitbucket/dataCenterApi.ts`), with the caps above.

- **Its paths** are the part after the server's address and start with `/rest/`, as each of its REST APIs does: `/rest/api/latest/...`, `/rest/build-status/latest/...`, `/rest/branch-utils/latest/...`.
  A repository is `/rest/<api>/<version>/projects/<KEY>/repos/<slug>/...`, or `/users/<user slug>/repos/<slug>/...` for a person's own project, which is the project `~<user slug>`; a user's slug differs from their name for a name such as `jane@example.com`.
  A page's size is `limit`, from 1 to 100, and its place `start`; the answer's `nextPageStart` becomes `nextPath`.
- **Reads** reach whatever the token may read: there is no read list.
- **Writes** go at once only under the task's own repository, the project key and slug compared without case, in any of the server's REST APIs; any other repository, project or the account asks like any other write.
  Deleting the repository itself is refused.
  A raw merge (`pull-requests/<N>/merge`), auto-merge (`pull-requests/<N>/auto-merge`, which merges later at whatever version is there), rebase (`/rest/git/.../pull-requests/<N>/rebase`) or ref sync (`/rest/sync/.../synchronize`, which brings a fork's branch up to date as GitHub's merge-upstream does), a default branch change (`defaultBranch` in the repository's own write, `default-branch`), a write to the main branch through `branch-utils` or `branches`, and a commit through `browse` on the main branch are refused with the same pointer to the merge card.
  The task's own pull request is opened, and its saved description replaced, only through `open_change`.
- **Its comments**: a comment a crewmate sends (`POST .../pull-requests/<N>/comments`) is kept on the task by its id, as on Bitbucket.
- **No runs or release files**: the server runs no checks of its own, so nothing is a rerun or a run start, and a release file is refused in words saying so.
- **Its answers** carry the server's `X-AREQUESTID`; a redirect is refused, and a 401 not naming a lacking permission asks the health service to look again.
  The integration row's read and write actions take the same paths, and Allow for the rest of this task covers one repository, whichever of the server's APIs a path names (`forgeScope`).

Evidence: `src/core/forge/api.test.ts` (the policy) and `src/core/forge/providers/github/gateway.test.ts` (the tool entries over a real HTTP stand-in, including caller-selected refs/inputs, project operations, reads of other repositories, search and the account, a task with no project, GraphQL and account-write refusals, the rerun arming the watch, a private file read that keeps the file and drops GitHub's download token, and a private repository read that drops its temporary clone token), and the journeys in `tests/e2e/forge-signin.spec.ts`: the verification requests (an existing disposable ref with workflow inputs, app-owned sign-in, queued run and cancellation, account-scope refusal and missing sign-in), and a project kept on this computer reading the person's notifications and a repository listing's `/repositories/{id}` next page through the github.com sign-in, with GraphQL never sent.
Bitbucket's are `src/core/forge/providers/bitbucket/gateway.test.ts` (the tool entries over a Bitbucket stand-in: reads with the token and Bitbucket's next page, a `pagelen` out of range, own-repository writes and asks elsewhere, the repository's deletion, raw merges and main branch moves, the task's own description, a pipeline start arming the watch, a release file to Downloads and a redirect).
Bitbucket Data Center's are `src/core/forge/providers/bitbucket/dataCenterGateway.test.ts` (the tool entries over a Data Center stand-in: reads with the token and the server's next page start, a path outside `/rest/`, own-repository writes and asks elsewhere, the repository's deletion, raw merges, auto-merge, rebases, ref sync and main branch moves, the task's own description, a release file refused in words and a redirect, and the integration row's actions).
GitLab's are `src/core/forge/providers/gitlab/api.test.ts` (its policy: encoded paths, reads anywhere, account writes kept out, own-project writes, the project's deletion, reruns and next pages) and `src/core/forge/providers/gitlab/gateway.test.ts` (the tool entries over a GitLab stand-in: reads by encoded path with GitLab's ids, allowance and next page, other projects' reads, refused writes, a 401 by whether GitLab still answers for the key, a job retry arming the watch, redirects, oversize, a missing sign-in and the budget).

## The app's own git (phase 2)

The owner's verdict: git is bundled with the app, the GitHub Desktop model, because most people who use Infinitary have never installed developer tools, and a Mac without them has no git a Dock-launched app can run.

- **What ships**: dugite-native's macOS git, pinned by the `dugite` dependency's own manifest (`script/embedded-git.json`, its archive and checksum per platform).
  `scripts/ensure-bundled-git.ts` (postinstall, macOS only) fetches BOTH architectures, verifies each against that checksum, caches the archive under `~/Library/Caches/infinitary/bundled-git/`, unpacks it once into `trees/` beside it, and clones that tree into `vendor/git/darwin-<arch>/` (gitignored); dugite's own postinstall is off (`pnpm-workspace.yaml`), since it fetches only the machine's architecture.
  In CI, `INFINITARY_BUNDLED_GIT_CACHE` names the archive folder instead, and `.github/actions/electron-download` keeps it in the Actions cache under a key naming dugite's version, so a fresh runner reads both archives there rather than from GitHub's release server.
  The clone (`scripts/clone-or-copy.ts`, macOS's `cp -c`, since Node cannot clone there) lets every working copy on APFS share the tree's blocks; a disk that cannot clone gets a plain copy.
  Git Credential Manager and its .NET runtime are left out - another sign-in that could answer or prompt for a host, which the owner ruled out - and so is git-lfs, which nothing under the app configures.
  The same postinstall builds the launcher a crewmate's shell runs that git through: `scripts/git-launcher.c`, compiled by `scripts/build-git-launcher.ts` with Apple's developer tools for both chips in one file, into gitignored `vendor/git-bin/git`, and rebuilt only when its source changes.
  It is a compiled program, not a `#!` script, because macOS 26 keeps a 1 KB kernel buffer for each script started from inside a script-started tool, and none for a compiled one.
  Only a Mac that builds Infinitary needs those tools; a person who installs the app gets the launcher built, and a checkout on a Mac without them skips it with a note and runs the system git.
  `electron-builder.yml` ships the two trees outside the archive (`extraResources` to `Contents/Resources/git/`), names them in `mac.x64ArchFiles`, and ships `vendor/git-bin/` beside them as `git-bin/`; the launcher already holds both chips, so the universal merge takes it as it is and it needs no line in `mac.x64ArchFiles`.
  `scripts/check-bundled-git.sh` (run by `scripts/verify-app.sh` at every release gate and by `verify.yml`'s package smoke) fails a bundle without either tree, with the wrong architecture in one, or whose launcher is not a program for both chips, and runs the tree for its own architecture through `git-bin` with an empty environment.
- **Who runs it** (`src/core/workspace/bundledGit.ts`, taken once by each composition with `adoptBundledGit`: the app's own and the work mode's, `docs/helper.md` "Running"): every host git (`git.ts`) runs the tree for `process.arch` by path, with the environment dugite's `setupEnvironment` gives it (`GIT_EXEC_PATH`, `GIT_TEMPLATE_DIR`, `GIT_CONFIG_SYSTEM`, which includes the Mac's `/etc/gitconfig`); the person's own `~/.gitconfig` still applies.
  `hostEnv` puts `git-bin/` - holding only the launcher `git`, which runs the tree named by `INFINITARY_GIT_DIR` with the same three variables, or else steps aside once for the next git on the search path - first on every child's search path, so a crewmate's shell, and the shells Claude's client runs, find the app's git first.
  The git sign-in environment above rides every one of those runs unchanged.
- **Without it**: an unpackaged checkout that has not vendored the trees (any platform but macOS), or whose Mac could not build the launcher, runs the git on its search path, as before; `INFINITARY_SYSTEM_GIT=1` asks for that on purpose in dev and e2e, and a packaged app ignores it.
- **A limit**: Apple's git reads its own system config, which names the Mac keychain's credential helper; the app's git does not, and that helper is not part of it.
  A plain host reached over `https://` whose sign-in only that helper held now answers nothing under the app (git fails at once, never prompts).
  GitHub (the app's sign-in), SSH origins (the person's agent) and helpers named in the person's own `~/.gitconfig` with a path are unaffected.

## Check facts and crew judgment

`check_change` reads the newest change through the forge and returns a `facts` JSON object: the change's id and base, the version, whether it moved since the recorded reading, mergeability as the host reports it, and each check's name, state, run, workflow and event where available.
It takes the change's id (`change`) and refuses another task's; a task reads only its own change (INF-1868 piece 2, INF-1873).
A pull request's checks are the runs the host started for it (INF-1891, the captain: "for merge we only care about the PR checks"): on GitHub a check whose run carries an event stays only when that event is `pull_request` or `pull_request_target`, so a run a person or a tool started on the branch by hand, such as a dispatched heavy check, is read through `read_workflow` and never holds or passes the merge (`ownChecksOf` in `src/core/forge/forge.ts`); a check with no event, such as a commit status, stays as read, and a branch's own checks, read with no number, keep every run at their version.
A batch's pull request also keeps the runs its own push started (`push`), because the app itself pushed that branch: a project that checks every pushed branch starts no other run for a batch ("Batches of your own").
When a reading of the task's own pull request finds a check red, the same reading asks the host for the default branch's own checks (`Forge.branchChecks`) and records that branch's newest run of each failed check beside the reading - its version, when, and each check's state there (`TaskDelivery.mainChecks`, `facts.main`, `ChangeChecks.main`; INF-1915 fix 1).
That is evidence about the failure's cause for the crewmate's diagnosis and the merge card, never a merge input: the merge boundary does not read it, a default branch that fails the same check passes nothing, and a selected pull request gets none.
The merge card's checks hold does read it (`docs/delivery-rigor.md`, "Check facts and declarations"): when that branch's newest run of every failed check at the offered version failed too, the card goes up at once, says so under its status line and offers Merge anyway, so the crewmate spends no rerun and asks for no reopening; the merge is still the captain's click.
The evidence is kept while the same checks fail at the same version, read again when the failures change, and cleared by a reading with no failure; a host that cannot read a branch's checks, or a read that fails, records none.
GitHub check runs retain their reported status, conclusion and available run identity.
A check run that finished `neutral`, such as a report or coverage bot's, holds nothing and still reads neutral in the checks cell, since GitHub's required checks pass on success, skipped or neutral (INF-4552).
A check that waits for a person to start it (`manual`) holds the change; the merge card's checks hold then names it as waiting to be started and promises no wake, since the check watch waits only on a check still queued or running.
No observed checks or workflow runs yields an empty list.
A later run of the same workflow and event at the version decides each check of the same name an earlier run left, whatever that earlier check read (`withoutSupersededRuns`), as a rerun's newest attempt decides inside one run.
The captain’s F26 choice made it so for a cancelled duplicate, and INF-4584 for a failure: a requested run that failed, such as one that named a wrong input, no longer holds the merge once a newer request of the same workflow passed at that version.
A check in another workflow or event still counts, and so does the latest run's own failure or cancellation, whatever passed before it.
So a newer request at the version replaces every check it shares a name with: a retry there asks for the same selection again, or reruns the failed job, never a narrower one.
While that later run has not created the check, it reads pending; the reading does not invent a successful check.
The reading identifies incomplete lists rather than inventing a check for a physical read limit.
An empty hosted reading, or one where every check skipped, stays pending and watched until checks run or the crew records positive, exact-version absence evidence through `absentChecks`, with `pull` or, for the task's own pull request, alone (INF-1955: `CheckChangeTool.declareOwnAbsence` matches it to the pull request the task's branch holds, by number, branch and version, and stores it on an owned merge review).
A declaration the record cannot match - no open pull request yet, another version, a host that runs no checks - is refused in words, never dropped; the merge card's checks hold names the declaration when an empty or all-skipped reading holds the card.
While such a reading is watched, `check_change` does not tell the crewmate to end its turn and wait: it names both ways out, waiting if checks are still to start, or else declaring `absentChecks` or reporting that there is no evidence to declare, and the first mate's reading carries the same fact (INF-4215).
A project recorded as running no checks needs no declaration for each version ("A project with no checks" below).
That evidence names an explicit no-CI policy from the trusted default branch and the applicable local gate; elapsed time, history and missing workflow files are not evidence of that policy.
A host that runs no checks, such as a plain Git host, needs no invented hosted check.
An absence declaration never removes registered checks from the reading or marks them passed.
The completion strip, shared task facts, task record Activity and first-mate facts show the reported check facts for their recorded version, never a newer unread version.
A lasting refusal to list workflow runs stays on the partial reading with its reason, so the task says that all checks cannot be read rather than silently appearing complete or endlessly running.
A lasting unreadable reading has no running duration, and the check watch reports it through its unreadable outcome rather than claiming the checks are still running.
A typed transient read failure preserves the existing bounded watch and its retry clock, including on a crewmate’s own read (F25).
A refused default-branch reading also appears on each task waiting on those checks, without sending a non-final default-branch wake.

The crewmate's merge offer itself expresses its judgment that the work is ready.
There is no separate ready/red declaration, current verdict cache or verdict cell.
The offer neither marks failed checks passed nor authorizes a merge: actual check facts still hold it and the captain still gives separate consent.
The crewmate declares only `flake` or `settled` with its version and evidence using `declaration`.
Older ready/red declarations remain history and grant no authority; the old current cache is ignored without rewriting that history.
A settled declaration names a recorded repair and its outcome; raw check reads never settle, void or supersede repairs.
The host places no repair, review-round or rerun count hold.
The delivery judgment is the delivery runbook's (`resources/runbooks/delivery`) and what each care asks is the care runbook's (`resources/runbooks/care`); the crewmate's core prompt carries the consent rule and the facts alone (`docs/runbooks.md`, "Built-ins").

The merge boundary still checks the captain's authorization or standing autonomy, the exact approved change and version, GitHub's rules and mergeability, and the send-once result.
The sign-in, consent and unknown-outcome boundaries are unchanged.

## A project with no checks

A project whose pull requests run no checks is a recorded fact on the project, not something each change declares again (INF-2114).
The record is the project's `noChecks` (`RepoView`, the `no_checks_json` column), and `RepoRegistry` is its only writer.
Settings → Projects shows it as Require pull request checks, on for every project; off is the record.
The switch is offered only where checks can run: a project that ships through pull requests on GitHub, GitLab or Bitbucket (`readsPullRequestChecks` in `src/shared/repos.ts`).
A plain Git host, a project kept on this Mac or one that merges locally reads no pull request checks already, so it needs no record.
`RepoRegistry.checkConfigure` refuses to turn the switch off for such a project, as the patch leaves it, whoever asks (`NO_CHECKS_REFUSAL`); turning it on is always accepted.

Three ways start the record, and the same three end it by hand:

- The crewmate's own absence declaration with `project: true` (`check_change`'s `absentChecks`, for its own change only, never beside `pull`).
  It is kept only once that version's own declaration is stored and no check ran at that version, and it names the task, the version and the evidence (`CheckChangeTool.declareProjectAbsence`).
  A record already there is kept as it was.
- The captain's switch in Settings → Projects (`inf:repos:configure` with `requireChecks`).
- The first mate's `app_change project-settings` with `requireChecks`, on the captain's words, as any project setting; without them, the app's exact-change card shows the switch's state now and after the click.

While the record stands, `ChangeChecks.absenceDeclared` answers true for every change in the project, its own or one a crewmate reviews there, so everything that already reads a declaration follows with no path of its own.
A reading where no check ran is no checks: nothing is watched, so no two-hour wake comes, and `check_change` tells the crewmate so (`PROJECT_NO_CHECKS_WORDS`).
The merge card goes up at once with its usual Merge the pull request, and a click merges with no checks override.
A batch of the captain's own reads each of the project's changes as declared (`declaredAbsent`).
An empty list alone never starts the record, and the app never infers it from missing workflow files.
An empty, undeclared reading names this way to the crewmate, and its two-hour wake does too ("Check facts and crew judgment" above, `emptyWords` in `src/core/orchestrator/changeChecks.ts`).

The first reading where a check ran on any of the project's changes ends the record: a check that is queued, running or finished counts, while a skipped check and the app's own batch check do not (`checksThatRan` in `src/shared/checkSnapshot.ts`).
Every reading of a change's checks ends it: a task's reading and the merge's own (`ChangeChecks.endNoChecks`), and the batch pull request's (`Batches.follow`), where a project whose workflows run only on pull requests runs them.
Its checks then hold the merge again, and one Activity line names the check and the change it ran on (`noChecksSaid`, `RepoRegistry.onNoChecks`).
A pull request that adds a recorded project's first check can merge before that check registers; the record ends at the first reading that sees it.

## A requested merge

The merge card is the one way to ask to merge a pull request (FI3-1543, INF-2744; the captain: "a request is just like calling a tool").
Its `merge` effect says what follows the merge, `after: close` or `after: continue`, and names a stored review with `review` for any pull request but the task's current change.
`check_change` with `pull` stores a review of that number in the task's project and returns its id.
Any open pull request there may be named, whoever opened it: naming it makes it one of the task's changes (INF-2490, [changes](../primitives/changes.md)).
Preparing the review grants no approval and merges nothing.
A contributor's fork is accepted on GitHub and GitLab, with its source repository and immutable host id retained in the review when supplied.
Checks of a selected fork are read by pull request number and head, never by a same-named branch in the project.
GitLab pipeline jobs are read from the pipeline's own project, including a fork's source project.
The card and click reread its source, branch, destination and version; another source or a contributor's later push needs a new review and a new click.
The one later version a fork's approval reaches is the crew's own update on the contributor's branch: once `check_change` `conflictRepair` with impact `none` passed the host's lineage checks and carried the kept approval to it, the click's merge goes ahead at that version (`MergeReviews.carriedTo`).
The crewmate reads contributor code before running it, and declares `asks_first` on the merge effect so the captain decides whether that version merges.
To publish its story, the crewmate checks out the reviewed commit without changing it, calls `prepare_change`, then `open_change` with the presentation revision while that fork is selected.
The saved-story publisher writes and reads back a comment (GitHub issue comment or GitLab merge-request note), with its existing attachment barrier and uncertain-write recovery.
It never changes the contributor's description or title, or opens a replacement request.
When GitHub says the contributor allows edits by maintainers (`ForgePull.maintainerCanModify`, from `maintainer_can_modify`), the review's answer names their branch and its repository, and says the crew may bring it up to date there with an update that leaves the reviewed behavior unchanged, review that update again with `check_change pull` before its merge card, and follow the project's own method for outside pull requests; without that permission the review never pushes to their fork.
The story comment's own section opens with the project's line saying a crewmate wrote it ("Disclosing AI assistance" below), then the crew's title, separate from the contributor's request title.
Both sit inside the story's markers, so the squash summary never carries them.
The active naming runbook owns its wording; fork merging adds no conventional-title requirement.
A merge card's click, for the task's own change or a reviewed pull request, reads the merges the project allows where it lives right before anything is sent (`wayToSend`, `src/core/forge/mergeWays.ts`), and picks one as a batch of one does (`mergeWayFor`): a squash where allowed, otherwise a rebase merge, then a merge commit.
A project that allows none of them holds the merge with nothing sent, and the click's answer names the project's settings to change.
`putIn` has no way of its own to fall back on: every caller passes the way it read, and GitHub and GitLab refuse one that was not read.
The verified story supplies the fork's squash commit title, summary and breaking-change footer, without renaming the contributor's request.
The captain's click merges the reviewed version as its own pull request, under the crew's title, on a batched project too: a pull request named by number joins no batch.
Fork stories carry their pull request number beside their branch in the ledger, so a fork using the task's branch name cannot share its story.
A merge and its attachment receipts read that request's ledger explicitly, even when another change is selected.
Comment reads use the gateway's smaller-page recovery when a long thread exceeds its response limit.
The branch-rule bypass route remains limited to same-project requests.

A review on another branch becomes the task’s current change, its explicit check target (`delivery.checkTarget`), so status, `check_change` and the check watch follow that pull request’s branch and number rather than the task’s own branch (INF-1246).
Opening the task’s own change, selecting its own pull request or naming its own change id returns status to its own branch.
The task's single pull request fields then name its own pull request at its own head, keeping none of the other pull request's number, head or checks; opening it names none until the opened pull request is noted.
Every change id a reading reports is the id of the change it read, so passing it back selects that same change; a change whose review the capped list no longer keeps is read again by its number, never swapped for the current one.
`open_change` with `branch` opens or updates the pull request of an existing pushed branch the captain asked for, without moving its head, and that pull request becomes the current change (INF-2184).
A story `prepare_change` saved for the branch the working copy has checked out goes with the named branch when that branch keeps no story of its own and has no pull request open, the call names the story's newest revision, nothing of the story was sent anywhere, and it was prepared at the very commit the named branch is at where the project lives (INF-3995).
So a takeover that brought its own branch to an existing pushed branch publishes the story it prepared when it opens that branch by name; otherwise the answer names the fact that does not hold, and the story stays where it was prepared.
The merge card still follows the branch the working copy has checked out: the answer, `show_merge_card`'s story stop and the card's refusal say to check out the named branch, or to detach at its commit where another working copy holds its name.
`prepare_change`, `open_change` with no `branch` and the saved-story merge card act on the selected numbered contributor request while a fork review is current, except when `open_change` explicitly names a project or another branch.
For a selected contributor review, `show_merge_card` stops before setup, commit or host reads and directs the crewmate to `prepare_change`, `open_change` with `presentation` and `emit_card` with `presentation` and `asks_first` on its merge effect.
For task-authored changes, those tools and `show_merge_card` act on the branch the working copy has checked out, and the task's own branch only when none is (INF-3717).
`open_change` makes the change it opened or answered current only once it succeeds, so a refused call leaves the current change as it was; the merge card makes the change whose story it shows current, since its merge acts on the current change.
A crewmate on a computer that runs work does the same with a branch it checked out there: the home reads its checkout for the story and brings that branch home to read it (`docs/helper.md`, "Reading its branch here").

### Disclosing AI assistance

What the crew posts to an outside contributor opens with a line saying a crewmate wrote it: today, a fork review's story comment.
The default line is "_Written by an Infinitary crewmate, an AI agent working for this project's maintainer._"
(`DEFAULT_CONTRIBUTOR_DISCLOSURE`, `src/shared/contributorDisclosure.ts`).
Each project keeps its own choice (`RepoView.contributorDisclosure`), set in Settings → Projects' Disclose AI assistance, on any project whose changes go through pull or merge requests, or by the first mate's `project-settings`.
Its switch turns the line off, saved as an empty string, or back on with the default line; its field replaces the line with the project's own, at most 300 characters.
Every publication of the story comment, the first and each republication (a new story revision, the story shown at a newer version, or a merge that finds the pull request past its published story), writes the project's line as it stands then, so a posted comment's line changes when the crew republishes that story.

### A change in another project

`open_change` with `repository` naming another project the app manages opens the change there (INF-2510, the captain's INF-1868 answer: "Only repositories the app manages as projects").
The crewmate pushes a branch to where that project lives and names it with `branch`; the branch needs a name other than the task's own branch, which names the task's own change.
The home reads that branch from the project's host into the project's folder under a private ref (`refs/infinitary/opened/<task>`), beside its default branch, and checks the branch's own commit names there, so a placed task's crewmate needs nothing brought home.
The change opens through that project's host with `body` as its description: it carries no saved story, since `prepare_change` prepares the task's own project's.
The project must be on a host with pull requests (GitHub, GitLab or Bitbucket); a plain Git host is refused in words, and so is a name the app does not manage, with the names it does.
The opened pull request becomes the task's current change through a review that names its project (`MergeReview.repoId`), so `check_change`, the check watch, `check_change pull` of that number, the kept approval, the merge card's merge and the reads by number after a merge all go to that project, and the change record keeps it under that project's id.
When a saved request names a different repository, its number does not identify a request at the project's new address.
It merges as its own pull request at the captain's click, whatever that project's delivery: a pull request a task names by number joins no batch ("Batches of your own").
Discarding the task closes only the task's own change; the change in the other project stays open.
Evidence: `changePublication.test.ts` (INF-2510) opens, reads and merges a change in a second project through that project's host, and refuses a project the app does not manage.
The merge card's `review` names that id.
With autonomy off, only the captain's button authorizes the merge; with it on, the app authorizes it from the card itself once its checks pass, unless the crewmate declared `asksFirst`, a standing direction's reason for the captain to decide this one (`SettleService.mergeRefusal` is the one reader of autonomy).
A task may have several merge cards up at once, one per pull request.
A merge card names one change, and the host writes on it whether its click closes the task (`mergeClosesLine`, `src/shared/cards.ts`): "Merging closes this task" for `after: close`, "The task continues after this merge" for `after: continue`, and for `after: close` too while a question or another pull request on the task is open.
A continuing merge, on the task's own branch or any other, keeps the task and its working copy and wakes the crewmate once.
A closing merge goes through the same gates and closes the task as merged.
The captain's words on INF-2525: "if they both got raised, then we should make sure the merge card doesn't close the task directly".
So every merged close shares one rule: a task closes as merged once its finishing change merged and nothing else on it is open - an open question of its crewmate's or the first mate's (`keepsTaskOpen`, `src/shared/cards.ts`), another of its pull requests that is open or could not be read, or a kept approval of another of its pull requests that has not run yet (`SettleService.stillOpen`).
A reviewed pull request's merge that declared it closes the task passes the task's own close rules too: its crewmate still working, a part it did not leave planned, or a task it waits on keeps it open (`SettleService.closeHeld`).
With one open, the captain's Merge click, the first mate's merge and a kept approval merge without closing the task: the change is recorded as merged, the task, its working copy and its cards stay, and its crewmate hears the merge once with what is still open.
The first mate's close of a change already merged refuses while one is open, and the watch on outside merges wakes the crewmate instead of closing.
What comes next is the crewmate's judgment, never a close the host schedules: the captain's words were "it should become the agent's judgment for what's the appropriate next steps".
A changed head, a failed or unreadable check, or a draft or protected branch sends no merge.
Every merge card click keeps the same head-bound approval, including for another branch's pull request (INF-1246), and an approval the app issued under autonomy is kept the same way.
Its immutable review snapshot lives on `delivery.mergeAuthorization`, independently of the capped review list, and the existing repair declarations, guidance hold, revocation and restart reconciliation apply.
A behavior-preserving repair merges only at the accepted head after checks pass; changed work needs a new offer and click.
Both merges read the change's saved story through one owner (`withPublishedStory`), so a kept approval on a story whose repair the host accepted refreshes the story to the repaired version before either merge goes.
A confirmed continuing merge consumes the approval and wakes the crewmate once without closing its task or removing its working copy.
A host merge result is not new captain guidance about that approval.
Only a pull request GitHub reads as clean at the reviewed head is sent, so a sign-in that could bypass the branch's rules never does.
On GitHub it is sent through the asynchronous merge, which hands it to the branch's own merge queue where there is one ("The host's merge queue").
GitHub answers `mergeable: null` while a check it has just started works out a test merge, often just after the default branch moved, and asks to be read again shortly (INF-457).
At the captain's click, that answer is read again after 1, 2, 3, 5, 8 and 11 seconds (`UNDECIDED_REREAD_MS` in `src/core/orchestrator/changeMerge.ts`), and every read is checked as the first one was.
The merge goes as soon as GitHub reads clean at the reviewed head; a moved head or a closed pull request still sends nothing, and GitHub still undecided after half a minute refuses the attempt, saying how long it asked.
An ordinary click remains kept through that wait, while a closed or replaced pull request ends its approval.
The card's own read before it goes up asks once.
Evidence: `tests/e2e/request-merge.spec.ts` ("... waits while GitHub works out whether it can merge ...") merges an adopted pull request after two undecided answers, and `mergeReviews.test.ts` (INF-457) holds the refusal after the wait and a version that moves during it.
An absence declaration is stored only when it names that exact head, with evidence and a local gate.
It waives only the host's own "checks have not started yet" marker, never a failed, pending or unreadable check.
A confirmed continuing merge wakes the crew once.
Dropping the task does not close another branch's pull request, because the task's own change is still what discard closes.

The first mate's `settle_task merge-pr` merges the task's current change with autonomy on, and is held for the captain with it off; it is for the captain's spoken words, since the merge card already merges under autonomy.
On a host whose merge names no version (Bitbucket) it sends no merge even with autonomy on, since only a merge card's approval records and reads back a merge whose outcome is unknown; it still closes a task whose pull request is already merged there.
When that change is already merged where the project lives, it closes the task as merged and sends nothing, with autonomy on or off, once none of the task's other pull requests reads open (`SettleService.otherOpenChange`, over every change the record keeps); one still open, or one that cannot be read, refuses the close in words and the task stays open.
A first mate merge card on a task with a saved story is bound to the published story (`CrewSupervisor.bindFirstmateOffer`), so its click passes the same story gate as the crewmate's merge card; before the story is published it is refused.
Evidence: `tests/e2e/request-merge.spec.ts` and `tests/e2e/declared-close.spec.ts`.

### A merge past the branch rules

A merge that skips the branch rules (FI3-1571 piece 2) is the same request, prepared with `skipRules`.
The captain's answer: every rule the account may skip, failed checks included.
`check_change` with `pull` and `skipRules` - the version the crewmate read and `squash` - stores a review on GitHub only, including GitHub Enterprise.
It is stored only at that version, when a rule or a failed check holds the pull request, every check has finished, and squash is allowed.
GitHub must also say this sign-in may skip every rule set holding the default branch: `GET .../rules/branches/{branch}`, then each rule set's `current_user_can_bypass` (always, pull requests only or exempt; `GitHubForge.branchRules`).
A conflict, a draft, GitHub still working it out, or a hold outside the rule sets, such as classic branch protection, is refused.
The review names each rule that can hold a merge, in plain words with its rule set (`mergeRuleWords`), and each failed check; rules that only guard creating, deleting or force-pushing the branch are not named.
The host draws them at the end of the card (`.inf-call`, `src/core/orchestrator/requestStrips.ts`) and names the button "Merge, skipping the rules".
Before the card goes up and again on the click, the host reads it fresh: a moved version, a closed pull request, or a rule or failed check the review did not name sends nothing.
Only the captain's click sends it; who merges, `settle_task` and a kept merge approval never do, and an ordinary review never sets `bypass_rules`.
The review is marked sent first, then GitHub's asynchronous merge goes once (`PUT .../merge-async` with `sha`, `squash`, `direct_merge` and `bypass_rules: true`, at API version 2026-03-10), and its result is read by its id as every asynchronous merge's is ("The host's merge queue").
A result the app could not read, or a transport failure, is unknown, and the pull request is read once to see whether it merged.
Nothing is ever sent again for that review: a second click, a restart or a revised card naming it answers from the record.
Its merge card's `after` says whether the task continues or closes.
Every crewmate, whatever its task's delivery, is told never to merge a pull request or push to a default branch from its shell, even when its goal names that merge: the captain's ask for an admin merge is this card, and a task that cannot prepare it, such as an operation, whose `check_change` refuses `skipRules`, reports it for the first mate to route (`buildCrewmateSystemPrompt`).
The first mate is told an operation has no merge card, so it is never a merge nor a merge card to prepare: it steers the crewmate whose task owns the pull request to that card, or starts one of another kind (`spawn_crewmate`'s `constraints`).
Both are served, not enforced: a crewmate's shell can still reach the project's host through the person's own GitHub CLI sign-in, with none of the app's tools between (INF-4362).
A merge the captain writes out as a command still runs from the shell, since a served rule that names a program never overrides the captain's own words.
When GitHub stops a merge under a kept approval for its branch rules (INF-4360), the host reads once whether this sign-in may skip them, with the same reading the review makes (`ChangeMerge.skipState`), and carries the answer on the merge's outcome as a typed fact (`PrOutcome.skip`, `ChangeMerge.withSkip`).
With it, the first mate's words beside the kept approval (`keptNote`) steer the crewmate to prepare `skipRules` at the approved version and put up its merge card, never to ask the captain for an approval, and never to merge another way.
Without it, they say the sign-in cannot skip the rules, in the host's words, after GitHub's own refusal, which is passed on unparsed.
The fact adds no hold and leaves the kept approval as it is: an approval that arrives first merges by itself, and only the captain's click on the skip card sends a merge past the rules.
Evidence: `mergeReviews.test.ts` ("a kept merge GitHub refuses for its branch rules") reads the fact from an always and a never rule set after GitHub's refusal, and `settleService.keptMerge.test.ts` ("a kept merge held by the branch rules") holds the words each one steers to.
GitHub honours `bypass_rules` for the app's own sign-in, its OAuth App ("The app's own sign-in"), on github.com in each skip right a rule set grants: always, pull requests only and exempt (INF-28).
Real merges on a throwaway repository show it, one for each right: a rule set asked for an approval from someone other than the last pusher and for a passing required check, the check failed, and each pull request merged past both with no approval.
Under the always and pull-requests-only rights GitHub holds the pull request (`mergeable_state` `blocked`) and logs the merge as a bypass of the rule set.
The exempt right reads differently, because GitHub does not apply the rule set to an exempt sign-in.
With the required check failed, its pull request reads `unstable`, not `blocked`, which the app reads as clean, and GitHub logs the merge as passing the rules, not as a bypass.
So the skip review is stored there only because a check failed: with every check passed it would be refused ("nothing holds pull request ..."), leaving the ordinary review, and an ordinary merge under the exempt right was not tried.
Its card still says it skips the branch rules and names both rules, though GitHub records no skip.
Not established: GitHub Enterprise Server.
Evidence: `tests/e2e/request-merge.spec.ts` ("a merge that skips the branch rules ...") has a scripted crewmate prepare an adopted release pull request held by a review rule and a failed check, reads the rules and the check off the card, finds nothing sent before the captain's key and one asynchronous merge with `bypass_rules` after it, and refuses the same review on a revised card.
`mergeReviews.test.ts` holds each refusal word for word, the review marked sent before the request, and every outcome of the one send: merged, refused, unknown, a lost answer read back as merged, and a second click that sends nothing.

### The host's merge queue

Every ordinary merge on GitHub goes through GitHub's asynchronous merge, for a pull request and for a batch alike (INF-3759 piece 5; `GitHubForge.putIn`).
The request is `PUT .../merge-async` at API version 2026-03-10 with `sha`, the merge method and the commit words, and it names no `merge_action`, so GitHub chooses: a branch with no merge queue merges the pull request directly.
A branch with a merge queue of its own takes only the version: GitHub answers a request to it that names a merge method or commit words with a result that failed, "Custom merge params are not supported when merging via a merge queue", and sends nothing on.
The app then sends the version alone, `sha` with `merge_action: "merge_queue"`, which GitHub takes into that queue.
The queue is named so that this second request can enter the queue or be refused, and can never merge the pull request GitHub's default way with words the app did not check.
It follows any failed result whose words name a merge queue, since GitHub offers no typed reason; a refusal of it is the refusal the app reports.
GitHub's direct merge (`PUT .../merge`) is refused on a branch that requires a merge queue, so before this the app could not merge there.
The result is read by its id after 0.25, 0.5, 1, 2, 3 and 4 seconds (`ASYNC_MERGE_READ_DELAYS_MS`), a wait a person clicking Merge sits through at most once.
`merged` is the merge, with the commit GitHub names; `enqueued` is the typed answer `MergeAnswer.queued`; `failed` is GitHub's refusal in its own words, read as a conflict, a moved version or a moved main branch the way the direct merge's refusals are.
A result still pending after the last read, or one GitHub no longer keeps, is unknown: the pull request is read before anything else and nothing is sent again.
A 409 on the request that names no moved version says a merge of that pull request is already running, and is read the same way.
A GitHub that does not know the call gets the direct merge instead (`putInDirect`): a 404 on the request, or a 400 that names the API version, either of which comes back before anything is sent on.
A GitHub Enterprise Server without the asynchronous merge is such a GitHub; that fallback is held by scripted answers alone, since no such server was at hand to try it on.
GitLab and a plain Git host merge as before; a GitLab merge train is not used.
Bitbucket Cloud's merge queue takes the ordinary merge request itself, with its strategy and words: Bitbucket answers 202 and the pull request reads `queued` ("Bitbucket pull requests"), which is the same typed answer, read again by the pull request's `queued` flag.
A merge of a Bitbucket pull request the queue took and no flag shows yet, such as a pending task with no place in the queue, is an outcome not known, never queued, and is not sent again.
Bitbucket's queue is offered only on paid plans, so the stand-in journey holds it, not a live run.

A queued answer is no merge.
The kept approval then waits on `host-queue` (`hostQueued`, `src/core/orchestrator/changeMerge.ts`) and records on itself the version GitHub took and when (`MergeAuthorization.handed`), apart from the wait, which any later stop replaces.
Activity says "Waiting for the merge queue" in the kept merge's words (`keptHostQueue`); no card goes up, the first mate takes no turn and the crewmate is not woken, because nothing is needed from any of them.
The app reads the queue again one minute later, then twice as long each time up to five minutes apart (`TIMED_WAITS`, `READ_ONLY_WAITS`, `src/core/orchestrator/mergeAuthorization.ts`), and at every crewmate idle boundary and at start, like any kept approval.
Five minutes bounds how long a task stays open after GitHub merged it; a read sends nothing, so it costs one question to GitHub.
Each read asks GitHub whether the pull request is in its queue (`GitHubForge.inHostQueue`, GraphQL's `isInMergeQueue`, which the REST pull request does not carry) before any gate (`ChangeMerge.handedOver`), since the checks and the branch's rules are the queue's to hold once it took the version.
Still queued, the approval keeps waiting.
Merged, the merge is GitHub's: the approval is spent with the commit GitHub made and the task closes as merged, or continues where its card said so.
Closed without a merge, the approval ends as for any closed pull request.
Out of the queue and still open, GitHub removed it: the approval waits on `host-removed`, Activity says so once, and the first mate is woken once to steer the crewmate to read why on the pull request's page.
The host reads no reason for a removal; GitHub's API names none.
A merge that keeps no approval is one attempt here too: a first mate's merge card, its `settle_task`, or an offer with no known version (`approvableOffer`).
Its answer says GitHub took the pull request into the queue, Activity reads "Cannot merge: waiting for the merge queue", the first mate hears the whole answer, and nothing reads the queue for it.
GitHub's merge is then read as any merge made outside the app is (`SettleService.reconcileExternalMerge`).

Nothing sends a removed version again on its own.
It goes to the queue again in three ways.
A new version the crewmate declares with `conflictRepair` carries the approval as any repair does, and is sent once its own checks pass.
With nothing left to change, the crewmate answers the removal with `check_change`'s `answered` verdict at that version, recorded only while the approval holds a removal of it (`hostRemoved`, `src/core/orchestrator/checkRepair.ts`); an answer declared after the removal was read sends that version once more, and a later removal needs a new answer (`removalAnswer`, `src/shared/checkRepair.ts`).
The captain's own click on a merge card of that pull request sends it too.
A version the captain's approval still covers gets no second merge card ("No second card for an approved version", `docs/delivery-rigor.md`), which is why the answer exists.

A merge queue merges every pull request its own way and writes the commit words from the project's own settings, and GitHub refuses a request to it that names either.
So the merge method and the checked title the app sends reach only a direct merge; the pull request's title is still checked before anything is sent.
A batch is sent the same way.
A queued batch keeps the version GitHub took (`OpenBatch.queued`), each pass reads the queue instead of sending, GitHub's merge gives every change its receipt, and a removal holds the batch with the reason `merge-way` and GitHub named in its words (`BATCH_WORDS.removed`), never sent again at that version ("A held batch").
A merge queue set by a rule set names its one merge way (`merge_method` of the `merge_queue` rule), which narrows the merges the project allows (`GitHubForge.branchRules`): a queue that squashes leaves a batch of several no way to keep one commit for each change, so it holds before anything is sent.
A merge queue set by classic branch protection is not in the rule sets and its way is not read.

Evidence: `providers/github/merge.test.ts` (each answer of the asynchronous merge, the queue's refusal of a merge method and the version sent alone, the fallback, the queue read), `changeMerge.test.ts` and `settleOwners.keptMergeRepairs.test.ts` (the wait, GitHub's merge, a removal, the answer and the captain's click), `src/core/batches/batches.test.ts` and `providers/github/batches.test.ts` (a queued batch, a removed one, the queue's merge way), and the journey `tests/e2e/settle-effects.spec.ts` ("a merge click on a branch with GitHub's merge queue ...").

## Batches of your own

A project on batched pull requests merges each person's approved changes in batches of their own (INF-3759; `src/core/batches/`).
Batched pull requests is off by default, and a project chooses it in Settings → Projects or through the first mate's project settings.
The choice exists only while the Batched pull requests runbook is on, which starts off: until it is turned on in Settings → Runbooks, Settings does not list or mention the choice, and choosing it is refused with `BATCHES_OFF_REFUSAL` (`docs/runbooks.md`, "Built-ins").
A project already on batched pull requests keeps the choice and keeps the runbook on.
A person reads it as "batched pull requests" in Settings and "Batched pull request" on a task (`PROJECT_DELIVERY_WORDS`, `POLICY_DELIVERY_WORDS`).
The app combines the approved changes at home into one batch pull request per project, one commit for each change, and merges it once its checks pass.
Nothing is written into the project for it: no workflow, status, label or issue.
The typed fact that chooses it is the batched delivery on a host that takes a batch pull request (`ownsBatches`, `hostTakesBatches`, `src/shared/repos.ts`).
A project whose host takes none is refused the choice with its reason (`BATCH_HOST_REFUSAL`).
It works wherever the forge seam has a host with pull requests and checks: GitHub, GitHub on a team's own server, gitlab.com, GitLab on a team's own server, Bitbucket Cloud and Bitbucket Data Center.
This repository merges this way itself: what its batch runs, and how each pushed task branch is checked, is `docs/testing.md`'s ("The swept batch", "A pushed branch").

A change is a pushed branch with its saved story and no pull request of its own.
`open_change` confirms the story on the pushed branch and opens nothing (`BATCH_OPEN_WORDS`, `ChangePublication`).
`show_merge_card` does the same through `open_change`'s own step and takes the pushed branch as the change, so it goes on to the checks and the card (`MERGE_CARD_WORDS`, `MergeCardSteps`).
A pull request the task selected by its number, such as the held batch's own that its repair reads with `check_change pull`, joins no batch but leaves the task's own branch a batched change: `open_change` confirms that branch's story all the same and makes it the current change again, as opening a pull request of its own does, so its checks, merge card and approval act on the branch (`mergesInOwnBatch`'s `own`, INF-6910).
A story revised at a version already in line or in a batch keeps its change in its place: the entry takes the story's title and commit words (`Batches.revise`, `reworded`), and the batch's pull request is described again from the story as it reads now.
A batch whose member's title or commit words changed is combined again on the same pull request, with the same changes in the same order, so that commit says them and the batch's checks run again; a revision that changes neither leaves the batch at its version, with any hold it carries.
While the host may still be running the batch's merge, the batch moves to a new pull request instead, as below for a merge the host still reads as running.
A story confirmed at another version takes the earlier version out of the line and the batch, as an approval that ends does.
`check_change` reads the checks the project runs on that branch by its commit, with no pull request to name (`ChangeContext.pushedBranch`, `Forge.branchHead`; on GitLab, the commit's pipelines alone), and the merge card goes up on green as any other.
The change's page is its branch's compare page against the default branch where the project lives (`Forge.branchPage`, `branchComparePage`: GitHub's `compare/<base>...<branch>`, GitLab's `-/compare/<base>...<branch>`, Bitbucket Data Center's `compare/commits?sourceBranch=...&targetBranch=...`), read once and kept on the record as the change's page, so the branch's name links it on the merge card's strip and the task's Info tab (INF-4196).
A change read before its page was kept gains it at its next checks reading (`ChangeChecks.noteChange`); a plain Git host has no such page, and its branch stays unlinked.
The words served to a crewmate that name a pull request's page read it only where the change has a number, so a compare page is never called a pull request.
The merge reads Merge in the next batch, since its click puts the change in line.
A branch whose project runs no checks on it is declared with `check_change`'s `absentChecks`, as for a pull request, and a project recorded as running none needs no declaration ("A project with no checks").
The merge click keeps the captain's approval at that version and puts the change in line (`ChangeMerge.mergeInBatch`): it reads the branch's checks, range, title, review and story as any merge does, takes the last look a merge request takes right before it goes in line (`docs/delivery-rigor.md`, "Batches of your own"), and sends nothing to merge.
The captain's own words recorded as passing asking first (`docs/delivery-rigor.md`, "The override") approve the same way: the first mate's merge, while the merge card is up at the task's current version, keeps the captain's approval from that card's offer, takes the card down unanswered (it reads as taken down by the app, not as a click), and puts the change in line (`SettleService.mergeOnCaptainWords`, INF-6091's audit, finding 2), unless the `decisions` hold refuses it as it does every first mate merge, then or at any later run before the change goes in line; with no such card at that version it is refused with `BATCH_MERGE_WORDS.needsCard`.
A repair the app accepted under the kept approval, one its crewmate declared to leave the approved work as it was, moves the branch past its confirmed story; once the branch's checks pass, the kept merge confirms that story again at the repaired version, words and approved content unchanged, and puts that version in line with no wake (`ChangePresentations.confirmRepairedBranch`).
The confirmation is a new revision naming the one its author confirmed (`refreshOf`); a newer revision its author prepared and never confirmed stays theirs, and the merge is refused until they confirm it.
While the approval waits in line or in a batch, its task is not stalled: the idle ladder raises no nudge, wake or stuck card for it, and tells its crewmate once, when the nudge would have come, that nothing is needed (`mergeInLine`, `docs/report-sort.md`); a change waiting in the host's own merge queue reads the same way.
A change that still has a pull request of its own joins the same way, and that pull request is closed with a note linking the batch once the batch merges (`Forge.closeWithNote`); one stacked on another branch joins only once that branch's work is already in.
The kept approval then waits on `queue`, and each later run reads the change's place from the app's own record: in line, in a batch, left out, the only change of a failed batch, or merged.
The merge card's Batch check state and the check reading say that place in words (`BatchStatus`, `BATCH_STATUS_WORDS`); no status where the project lives carries it.
The reading carries the place as one more check, named `infinitary/queue` (`BATCH_CHECK`), which the app adds itself and writes nowhere (`ChangeChecks`, `src/core/orchestrator/changeChecks.ts`).
A merge card shows it apart from the change's own checks (INF-3208): its Checks state counts only the change's own checks, and its Batch check state says the place in one word, linked to the batch's pull request (`batchCheck`, `src/core/orchestrator/settleCardFacts.ts`).
A batch that failed or is held says its own words in the open under the status line.
Merge anyway never stands beside a failed batch check, since no checks override passes a batch.

`Batches` (`src/core/batches/batches.ts`) is the one writer of a project's line and its one open batch, kept on the project's row (`RepoRegistry.recordBatch`) and shown as `batch` on the project's view.
`line.ts` holds the rules as pure steps over that record, and `combine.ts` the git work.
A batch forms when the line holds a change, no batch of this home's is open and the project's batch gap has passed (`forms`, "The batch gap"), and takes the whole line in approval order.
The order is the approvals' own: each change stands in line at the time its kept approval was given (`MergeGuard.approvedAt`), never at the time its merge run reached the line.
A change reaches the line only once its merge run has read its branch where the project lives, and a batch forms from the changes that have reached it.
So with no batch open, a change approved a few seconds after another can reach the line first, form a batch alone and merge ahead of it, and where the two clash the earlier-approved one is then the one left out.
The combine fetches the default branch and each change's pushed branch into the project's folder and writes one commit per change on top with git's plumbing alone (`merge-tree --write-tree`, `commit-tree`), so no file and no branch of the folder moves.
Each commit carries the change's checked title as its subject and, as its body, its story's What changed with the footers the active naming runbook has a commit carry (`presentationCommitMessage`), under the name the change's own last commit carries.
That is the person's own name wherever the computer that ran the task has one saved, and Infinitary otherwise, since each crewmate session's shell carries that name in `GIT_AUTHOR_*` and `GIT_COMMITTER_*`, which outrank a name a command passes with `-c` or saves; only a command's own `--author` or its own variables outrank it (`src/core/workspace/commitName.ts`).
The scratch commits the combine writes only to compute a change's own difference, which never reach the batch branch, carry the app's own identity (`APP_GIT_IDENTITY`, docs/infinitary-rename.md).
A change built on another task's approved version that has not merged (docs/task-graph.md, "A part that starts at approval") names that task as `after` and its branch as `base` when its approval puts it in line (`ChangeMerge.mergeInBatch`).
It waits in line, with no left-out note, until that task's change is carried ahead of it, then goes right behind it in the same batch or in a later one, whatever order the approvals came in (`carried`, `inTurn`).
Once that task has merged, which spends its approval, it goes as a change of its own, checked against the approved version that merged; when that task leaves the open batch or is left out of a combine, it goes back in line with it (`withdraw`, `Combined.waiting`).
When that task closes without merging, a change whose branch still carries the version it was built on, or the newest version that task's approval covered, is left out in words telling its crewmate to rebuild without that work, and one rebuilt without it goes as a change of its own (`LEFT_OUT_WORDS.baseClosed`).
A change whose branch does not hold the version carried ahead of it or merged is left out in words, since it was built on an earlier approved version (`LEFT_OUT_WORDS.behindBase`).
Its merge card at such a version is refused in the same words before it reaches the captain, and its crewmate is told once when the task under it is approved at a newer version (docs/task-graph.md, "Following the part under it").
Its commit carries only its own difference, since the batch combines it on top of the version that already holds its base's work.
A change is left out with its reason, and the rest go on, when its branch is no longer at the approved version, it no longer combines, it changes nothing, or it builds on a branch whose work is not in (`LEFT_OUT_WORDS`); its crewmate is told and shows a new version.
A branch with no common history with the current default branch is left out, for example when a project has moved and the old branch must be rebuilt.
When the approved address changes, the app retires the former open batch locally without a merge receipt or remote cleanup.
Its changes stay with their tasks for fresh approval, and eligible approvals can form a new batch at the new address.
Waiting approvals also stay at the address they named and require fresh approval before joining a batch at the new address.
The app retires open tasks' active story ledgers that name the former destination, so a crewmate can prepare revision 1 with a new Before base after rebuilding its branch there.
For an ordinary remote story left behind by an earlier build, preparing against the approved destination starts a new ledger when the old story names another address; this does not relax the same-address base or project identity checks.
A story pinned to an unchanged publication address keeps its ledger.
A story at the new address needs a new merge card and approval, even for a plain Git branch at the same commit and story revision.
Returning to a former address does not restore a retired offer.
Preparing, confirming or merging a plain Git story requires the checkout and story to agree with its approved address.
For a managed origin, the range check compares the home project folder’s cached default branch to the tip advertised by the approved address, fetching when the cached ref is missing or differs.
It never follows a different checkout address.
A task pinned to an unchanged publication address reads that address’s default branch and keeps its fetched ref apart from the moved project’s tracking refs.
Plain Git writes also refuse a separate push address that differs from the approved read route.
A declared repair is reset with the former batch: its declaration, the versions that held and its verified base are dropped, so its whole branch goes as an ordinary change once approved again at the new address.
A move noticed after a combine's reads or during its push leaves its result unsaved, and nothing is pushed to the former address once the move is seen.
A change that no longer combines is told whether it clashes with the default branch as it is now, which bringing it up to date answers, or only with an approved change ahead of it in the batch, which the combine names (`ahead` on its left-out entry).
Either way, while the batch stays open its crewmate is told to rebuild the change on that batch's version now ("A change rebuilt on an open batch").
With no batch left open, the second case says nothing can be done yet, since the default branch does not hold that change: its task hears so (`BATCH_WORDS.leftOutAhead`), its kept approval waits quietly on `queue`, and no one is woken to bring it up to date.
The clash ends once (`clashesEnded`): when the change ahead merges with its batch, the entry turns into a clash with the default branch and the change's merge runs again, so its crewmate is steered to bring it up to date at once, unless the rebuild it was told on that batch stands; when the change ahead leaves the batch and the line, the entry goes and the change's merge runs again, which puts the same approved version back in line.
Each fetch and the push wait at most `REMOTE_TIMEOUT_MS` on the place the project lives, because every writer of the project's batch waits behind them.
A call that limit ends fails the pass, so the next one reads again, and a change is never left out for a branch that could not be read in time.
The combined version is pushed with a lease to a branch the app owns, `infinitary-batch/<id>` (`BATCH_BRANCH_PREFIX`), and opened as one pull request with the captain's sign-in.
A batch of one carries its change's own title and story, so it reads as that change's pull request would.
A batch of several is titled in the app's plain words, `merge N approved changes`, in the form the active naming runbook gives a name the app writes itself (`batchTitle`; `chore: merge N approved changes` under the built-in runbook), and its description holds each change's story under its title (`ChangePresentations.batchRegion`).
Where the project lives a description has a limit, 65,536 characters on GitHub, 1,048,576 on GitLab and 32,768 on Bitbucket (`presentationBodyLimit`), and a large batch's stories can pass it together though each fits alone (`batchDescription`, `src/core/batches/description.ts`).
Then the description keeps the list of changes, says how many stories follow below it, and holds the stories that fit, in order.
The rest follow in order in the app's own comments on the pull request, each within the host's limit on one comment (`presentationCommentLimit`) and opening with `BATCH_STORIES_MARKER`.
Each time the description is written, the app reads its own marked comments back and keeps them in step: a changed one is rewritten, a missing one posted and one left over deleted (`Batches.continueIn`, `Forge.ownComments`).
So no comment carries a story the batch no longer holds, a restart writes nothing again, and a comment whose answer was lost is never posted twice.
A comment the host refuses is tried again on a later pass, and the batch goes on.
A story too long for a comment of its own is never cut: it is a missing story, as below.
When its members change, the same pull request takes the new version, and its title and description are rewritten at the version just read.
Each host refuses a rewrite of a pull request that moved since that read, Bitbucket by the app reading it again first, so a refused one is sent again on the next pass (`Batches.describe`).
A story that cannot be written into the description or a comment, such as one whose picture could not be sent, never keeps the batch from opening: the pull request opens or is rewritten without it, Activity names the missing story once for that version of its change (`BATCH_WORDS.noStory`), and each pass writes the description again until every story is in it.

The host's own reading decides what happens next, on each pass of the tick and after each change of the line (`Batches.follow`).
A project's record has one writer at a time: a pass keeps the record it read through its work where the project lives, so an approval, a withdrawal and a declared fix each take their turn behind the pass at work, and none is saved over (`Batches.write`).
Checks all passed or skipped, with the host reading the pull request as mergeable, merge it; a reading where no check ran, none at all or only skipped ones, counts as passed only where every member's version was declared to run none.
On GitHub the batch's checks are the runs its pull request and the push of its own branch started, so a project can check a batch by either, telling it by the branch's `infinitary-batch/` prefix (`ownChecksOf`).
A pull request the host reads as behind or conflicting is combined again onto the default branch as it is now.
The merge keeps one commit per change (`mergeWayFor`, `src/shared/batches.ts`).
A batch of one merges as that change's pull request does, by squash, where the project allows it.
A batch of several takes a rebase merge where allowed and a merge commit otherwise; on GitLab that is a merge without squash, which keeps every commit under each of its merge methods.
The merges a project allows are read where it lives (`Forge.mergeWays`): GitHub's merge buttons narrowed by the default branch's rules, the one way of a merge queue among them (`waysUnderRules`, `src/core/forge/mergeWays.ts`), GitLab's squash setting, the merge strategies Bitbucket's main branch allows, and those a Bitbucket Data Center repository enables.
On Bitbucket a rebase merge rebases the batch's commits onto main and ends in a merge commit, so each change's rewritten commit is read under that merge commit's second parent; Bitbucket Data Center's `rebase-no-ff` does the same.
Bitbucket Data Center holds its merge to the version read and has no merge queue, so a batch there merges as on GitHub without one.
A batch merge on a host whose merge names no version (Bitbucket's) whose outcome the host did not confirm is kept as unconfirmed at that version with the host's reference to it (`OpenBatch.unconfirmed`): later passes read the pull request and the queue, and never send it again.
Merged, it finishes as any batch; queued, it waits in the queue; a reference the host reads as refused, or none at all, holds the batch with the reason `merge-way` (`BATCH_WORDS.notMerged`, `BATCH_WORDS.unconfirmed`), so Try again combines a new version rather than resending it.
The Activity feed calls the merge refused only on the host's own word (`BATCH_WORDS.refused`); a merge the host never answered gets its own line saying so (`BATCH_WORDS.unanswered`).
A merge the host still reads as running waits, with no hold and no time limit, since Bitbucket reads an unknown or expired reference as pending too and the app cannot tell a slow merge from one that never ends.
The first pass that reads it so keeps when (`OpenBatch.unconfirmed.pending`), says it once on the Activity feed (`BATCH_WORDS.mergeRunning`), and from then Settings → Projects shows the wait under "Where changes go", with its pull request and Try again (`mergeWait`, `BatchWaitPanel`), so a merge that never ends cannot hold the project's line in silence.
Try again first reads the pull request as a pass does, so a merge that finished or was queued meanwhile is followed as it is, and one the host says failed meanwhile holds the batch at that version, which Try again then combines again on the same pull request as on any hold.
A merge still read as running may yet finish, and a host whose merge names no version merges whatever its branch holds then, so Try again never puts a new version on that pull request: it closes it (Bitbucket declines it), reads it again, keeps it as closed among the batches that ended, deletes its branch and combines its changes with the line on a new branch and pull request (`replaceWaited`).
The Activity feed then says only that the new pull request formed, never that the closed one's checks run again.
A close the host refused or did not take keeps the wait, and Settings says the merge may still finish (`BATCH_WORDS.stillOpen`); a merge that finished as the close was asked is recorded as merged; the first merge is never sent again.
No pass puts a new version on that pull request either.
While a merge sent at the batch's version is unconfirmed, each pass reads how it ended before anything goes on the batch's branch (`settleUnconfirmed`), whether the branch moved, a change was withdrawn, a member's words changed or every member left.
A change withdrawn or reworded, or every member leaving, while the host still reads the merge as running moves the batch the way Try again does, with no feed line of its own: the pull request is closed and read again, kept as closed among the batches that ended, its branch deleted, and the changes that remain combine with the line on a new branch and pull request, whose own line on the feed says it formed.
A close the host did not take keeps the wait, with nothing sent, and the next pass tries the close again; once the host says the merge failed, the batch holds and then combines again on the same pull request, as any held batch whose changes changed.
On a default branch with a merge queue of GitHub's own, the merge hands the batch's pull request to that queue and the batch waits there ("The host's merge queue").
A project that allows only squash merges is not offered batched pull requests: the choice is refused with its reason, and Settings says it under "Where changes go" (`SQUASH_ONLY_WORDS`).
After the merge the app deletes the batch branch and reads each member's own commit on the default branch (`landedCommits`): the commits as written where the merge kept them, or the rewritten ones matched by title after a rebase merge, under the merge commit's second parent when the rebase ended in one.
Each member gets a receipt, its task's kept merge reads it and the task closes as merged, naming its own commit; a commit that could not be read stays absent, never guessed.
The batch gives the app a turn between members' settlements so the window can still respond during a large batch's closes.

Only approved work merges.
An approval that ends takes its change out of the line and the open batch, which is combined again without it (`Batches.withdraw`), and each pass and the last look before a merge drop a member whose approval no longer stands at its version.
A batch whose every member left takes the line's changes on the same pull request, or with an empty line is closed and its branch deleted.
While the host may still be running the batch's merge, nothing new goes on that pull request: it is closed first, and the changes that remain or wait in line combine on a new one, as above for a merge still read as running.
The batch branch is the app's own.
A pull request can trail its pushed branch for a moment, so a pass that reads the pull request at an older version reads the branch itself, and waits while the branch is where the app pushed it.
A branch at a version the record never kept, such as a push whose record was lost in a crash or a commit someone else pushed there, is combined over with a lease on the version just read, so nothing but an approved change merges through it, less the one generated commit the project's own checks may push on it ("A generated commit").
The record is local to this home: a batch waits while the app is closed, and nothing merges it meanwhile.
The first pass after a start reconciles each open batch from the host: a pull request merged meanwhile is recorded with its receipts, one closed without a merge puts its changes back in line, and a branch pushed with no pull request yet is read before one is opened.
Another person's pull request is untouched: one the captain reviews merges as its own pull request through the merge review ("A requested merge").
It merges at the captain's click and joins no batch, and so does a contribution through a fork (`ChangeContext.ownBatch`).

Evidence: `src/core/batches/line.test.ts`, `combine.test.ts` and `combine.held.test.ts` (real git against a bare repository) and `batches.test.ts`, `batches.held.test.ts` and `batches.trial.test.ts` (a held batch's early run with its fix); `src/shared/batches.test.ts`; `batches.unconfirmed.test.ts`; `src/core/forge/providers/github/batches.test.ts`, `gitlab/batches.test.ts`, `bitbucket/bitbucketForge.test.ts` and `mergeWays.test.ts`; `src/core/orchestrator/ownBatchChange.test.ts`, `ownBatchChange.held.test.ts`, `ownBatches.test.ts` and `mergeReviews.test.ts` (a pull request named by number); and the journeys `tests/e2e/own-batches.spec.ts` on GitHub, `tests/e2e/gitlab-own-batches.spec.ts` on GitLab and `tests/e2e/bitbucket-own-batches.spec.ts` on Bitbucket, whose last batch goes through Bitbucket's merge queue.

### A generated commit

Changes combined in one batch can leave a file a generator writes out of step with the sources they changed together, since each change ran its generators from its own base.
A project's own checks may then add one commit on top of the batch's version that changes only such files, and the app takes it as the batch's version, so the batch's checks run on it rather than fail on the stale file (`Batches.takeGenerated`, `generatedOnTop` in `combine.ts`).
A file counts as generated when the `.gitattributes` of the batch's version, never the pushed commit's own, marks it `linguist-generated`; the app reads that through a temporary index, so no file of the project's folder moves.
When a pass finds the batch branch at a version the record never kept, it takes that version only when it has exactly one parent, the batch's own version, and every file it changes is so marked.
It writes that commit again with the same files, author and words on the version it holds, pushes it with a lease on the version just read and records it as both `head` and `generated` on the open batch, so the checks the project runs on the app's own push read it.
Its checks then decide the batch as any version's do, and a failed one holds it.
A commit that changes any other file, builds on another version, or comes while the batch is held is combined over as any other push, and a batch takes one generated commit per combine.
After a rebase merge the receipts skip it by its subject, and a squash of a batch of one carries it in that change's commit (`landedCommits`).
This repository's batch runs the phone's generators and the app parts list's this way (`docs/testing.md`, "The swept batch").

### A change rebuilt on an open batch

A change that clashes with the open batch is answered while that batch is checked, rather than after it merges, so a large change is brought up to date once instead of on every batch that leaves it out.
Two moments find the clash: the combine leaves a change out for a clash (`clash` on its left-out entry), and each pass tries every ordinary change waiting in line once against the open batch's version with `merge-tree`, which writes no ref anyone sees (`clashesWithBatch`, `src/core/batches/combine.ts`; `Batches.tryLine`).
A fix, a later part built on another part's version, a stacked change and a change already rebuilt keep their own place and are not tried.
The app keeps what it told on the project's batch record (`BatchRebuild`, `toldRebuild`, `src/core/batches/line.ts`): the change's version, the batch's branch and version, and the changes that version carries, in order.
Its crewmate hears it once for each version of its change and set of changes in the batch: a batch combined again with the same changes tells nothing new, and one that lost or gained a change tells once more, with its new version.
The `batch-rebuild` wake names the batch's pull request, branch and version, the changes it carries with their tasks, and asks the crewmate to bring only its own commits onto that version, run its validation again and declare the push with `conflictRepair`, giving the batch's version as `newBase` (`deliveryWakes.ts`).
It is sent only while the captain's merge approval is kept; otherwise the task's line and its merge card say what follows.
A left-out change that was told reads `rebuild` in its place while that batch is open, so its merge waits quietly on `queue` and names the version to build on.

A version in line whose branch builds on the version its crewmate was told to rebuild on, or on the open batch's version, is marked as built on it on the next pass (`onBatch`, `builtOnBatch`, `Batches.markRebuilt`), read from git's history whatever repair was declared, so one whose repair came back to the captain on a new merge card goes the same way (`batchVersionIn`).
A held batch's version is not offered: a version built on it is that batch's fix, carried from the held version, and declaring a fix drops any such mark (`markFix`).
It goes right behind the changes that version carries: first in the next batch once the batch merges, behind its changes when they go back in line, behind the declared fixes when the line joins a held batch, and right behind them when the open batch is combined again with them still in it (`carried`).
The combine carries it as its own difference from that version, as a held batch's fix is carried, so it goes onto the default branch after a rebase merge or onto the batch combined again (`combine`).
It is left out again, with its reason, when a change that version carried is neither ahead of it at the same version nor merged at it, when its branch no longer holds that version, or when its own difference no longer combines.
While the batch stays open, a version waiting behind it whose batch version carried a change that left the batch is told once to rebuild on the open batch as it is now (`LEFT_OUT_WORDS.batchChanged`).
When the batch merges carrying each change its crewmate was told about, at those versions, the rebuild stands (`merged` on the told entry, `rebuildStands`): the clashing version stays out of every later batch and reads as left out, in its merge and in the Batches panel, even when it was told while waiting in line, saying it clashed with a batch that merged and waits for its version rebuilt on that batch (`LEFT_OUT_WORDS.batchMerged`, `standingRebuild`); its merge keeps waiting on `queue` with the version to rebuild on, nothing tells it again, and the version rebuilt on that batch goes first in the next batch once it arrives.
It waits so until a new version takes its place or the task closes, with no steer to bring it up to date with the default branch meanwhile.
Once the batch ends otherwise, closed unmerged, with every change withdrawn, or merged without a change it was told about, each told left-out change's merge runs again: its entry no longer reads `rebuild`, and a clash with the default branch is steered as any other.
Closing the task drops what it was told.

Evidence: `src/core/batches/combine.test.ts` ("a change rebuilt on an open batch's version", real git), `line.test.ts` ("a change rebuilt on an open batch"), `batches.rebuild.test.ts` (a change left out for a clash with the open batch, the line tried against it, a rebuilt version told again when a change of its batch left, a told change read again when its batch closed unmerged, and the first rebuild standing when its batch merged first), `src/core/orchestrator/ownBatchChange.test.ts` (the merge naming the version to rebuild on) and `wakes.words.batches.test.ts` (the `batch-rebuild` wake's words).

### A held batch

A batch holds when one of its checks fails, when the project allows no merge that keeps its commits, or when the host refuses the merge (`BatchHold`, reasons `checks` and `merge-way`).
It also holds, with the reason `rules`, when its checks passed and the host still reads its pull request as blocked by a rule of the default branch, such as a required review or signed commits.
The app sends no merge against that reading, says so once in the feed, on each change's merge card and in Settings, and wakes no repair; the hold ends by itself on the pass that reads the pull request as mergeable.
The commits the app combines carry no signature, so under a rule that requires signed commits every batch holds, of one or of several, until that rule is lifted; choosing batched pull requests does not read that rule, so such a project is one to leave on pull requests.
Nothing in it merges, and changes approved meanwhile wait in line behind it.
The app runs no check again and files no issue, label or claim.
A batch of one that fails wakes its own crewmate through the failed-check wake like any failed check, and its merge reads that the checks of its batch failed.
At a version the captain's approval still covers, that wake and a merge card's refusal give the repair's route alone, a new version declared with `conflictRepair` (`coveredNextStep`, `docs/delivery-rigor.md` "No second card for an approved version").
A batch of several reaches the first mate once for each held version, as the `batch-held` wake (`BATCH_HELD_OPENING`, `src/core/orchestrator/noticeWakes.ts`).
The first mate starts one repair task with the `batch-repair` skill and no card, unless a task already repairs that batch (`resources/runbooks/batches/skills/batch-repair`).
It marks that task with `repairs_batch` in `spawn_crewmate`'s shape, and the app records it as the hold's repair (`OpenBatch.repair`, `Batches.markRepair`); a task whose `batch` declaration answers the hold is recorded the same way, which covers a missed mark (`repaired`, `src/core/batches/line.ts`).
The app never guesses a repair from a title or from which task watches the batch's checks.
A held batch of one is repaired by that change's own crewmate (`batchRepairOf`, `src/shared/batches.ts`).
The repair stays recorded through every combine of the same batch and is dropped once its task closes (`pruned`); a later hold of the batch names it in its `batch-held` wake, so the first mate steers it instead of starting another.
The first mate's own close of that task waits while the batch is held for its checks and no answer to the hold is recorded, and names the answers that end it; once one is recorded, or the hold has ended, the task closes as done, and the batch's pull request never counts as its own (`docs/task-record.md`, "One close as done").
The repair accounts for every failed test against every change in the batch, then answers once with `check_change`'s `batch`.
Once it has found the cause, it fixes forward by default and chooses by what the fix touches, not by which change caused the failure.
It fixes forward when the code under test, the code that makes the project do what a change says, is right and the fix is small: changes that meet badly, or one change that left tests, test data, a generated file, a check list, a pinned version or a comment out of date.
It sends a change back only when that change's code under test must change, the fix needs a decision, or the fix is not small; one declaration can do both.
`sendBack` names each change at fault by its task key, with the reason its crewmate reads, and the rest combine again with the changes that waited in line ("A change sent back").
`fix` declares the repair's own change the batch's fix: approved on its own merge card, it joins the held batch and ends the hold, and every change waiting in line joins behind it (`carried`, `src/core/batches/line.ts`), unless the held version passed first (below).
The order of approval and declaration does not matter: a change already approved and waiting in line is marked the fix as it is declared and joins on the pass the declaration starts, and one approved later is marked as it goes in line (`Batches.declareFix`, `Batches.enqueue`).
An approval of the same version again keeps its place.
A declaration also keeps the exact commit its task has committed as it declares: the one that task's own branch has checked out in its working copy, on this computer or the one it runs on, with nothing left to commit there, untracked files included (`BatchRecord.fixHeads`, `ChangeContext.ownCommit`).
Either computer answers the branch, the commit and what is left to commit in one reading that asks for untracked files itself (`checkoutOf`, `src/core/workspace/git.ts`); a computer that cannot answer that way binds no commit.
A declaration made again keeps the commit the task has then, and none when none can be read that way: the commit kept before is bound no more (`declared`).
A fix declared alone is refused once the batch holds at another version than the one its task read, as a send-back there is (`Batches.declareFix`).
Another task's change approved at that exact commit, as when that task took the repair's delivery over, carries the same declaration (`declarationOf`, `src/core/batches/line.ts`): it joins the held batch as the fix, is measured and carried from the version that repair was verified on, ends the wait of a batch held for that repair's fix, and answers the declaration once a batch merges with it.
No other commit carries a declaration for another task, whatever its title, its content or the versions the repair's branch had before, and the commit alone puts nothing in line: only the delivered version's own approval does.
A change that carries more than one declaration, as when the task that delivers a repair's commit declared the fix itself too, is carried as the fix its batch waits for first, then as its own task's (`declarationOf`); it ends that wait, and a batch that merges with it answers every declaration it carries (`declarationsOf`).
The held version an approval verified a declared fix on stays with the approved version in line (`BatchChange.heldBase`, `enqueue`), so a change that carried another task's declaration is still carried as its own difference from that version, never whole, once that declaration is gone.
It is that exact version's alone: the combine and the commit-name check read it first for that version, with a declaration verified elsewhere or with none left, and never for another version of the same task (`carried`, `ChangeContext.checkRange`).
A combine that carries the version leaves a repair already verified on another held version that one (`withBases`).
A declared fix stays declared through every combine of the batch, its own joining included, and through Try again, a batch closed and put back in line, a batch that merged or ended without it, a new version of the fix approved in its place, and a restart; it is forgotten once a batch merges with it or its task closes (`unfixed`, `pruned`).
A fix can change lines a change in the batch added or changed: the repair builds it on the batch's branch at a version that held.
The record keeps every version that held, the one a declaration answered included, for as long as a declared fix is outstanding, and otherwise until a batch merges or ends (`BatchRecord.held`, `declared`).
The combine applies only the fix's own difference from the newest held version its branch builds on, as a cherry-pick does (`combine`'s `held`, `src/core/batches/combine.ts`).
Once an approval or a combine verified that version for the fix (`heldBase`), whether the fix then joined or was left out because its difference did not apply, the record keeps it with the repair, so a version of the fix approved in its place is carried from it too, until a batch merges with the fix or its task closes (`BatchRecord.fixBases`).
It is saved as soon as the combine verified it, before the batch is pushed, with the hold and the batch's version unchanged, so a push that never comes back still leaves the repair its base (`withBases`).
The record saved once the push came back keeps that base as it was saved then: by then the batch no longer says which fix it waited for, so the base `combined` works out again there is not the one saved (`Batches.recombine`).
An approval that measured the fix from it keeps it with the repair in the same write that puts the fix in line (`enqueue`), so a version approved in its place before any combine is carried from it too.
A fix left out or refused for its version stays measured from it: the repair builds it again on that version, or a new repair starts from the batch's current version.
A left-out version never joins again, even once an unreadable version can be read: the repair pushes a new version on it and has that approved, while a publication or approval refused only because the version could not be read can simply be asked again.
A record that holds only a declared fix and its versions, with no line, batch or receipts, is still saved (`RepoRegistry.recordBatch`).
Every later version of the fix is carried from it, a new version approved in its place included, and is left out, never carried whole, when its branch no longer builds on it, as when the repair rewrote the history it inherited.
One resolver answers where a fix is carried from (`fixBase`, `src/core/batches/combine.ts`): a held version it builds on; its verified version when it no longer builds on it or that version can no longer be read, which leaves it out with that reason; or the default branch, for a fix that builds on no version that held.
Before a version is verified, a held version this computer cannot read is passed over, since it can be no ancestor of a branch it holds.
Confirming the declared fix's story on its own task's branch, on a project whose batch carries it as its own difference, and approving it into the batch check the commit names from the same version through the same resolver, so the members' commits it carries are not read as its own, and refuse a fix whose version is lost.
Any other route, such as a pull request of its own, one against a branch it names or a draft for its validation, merges the branch whole, so it and every other change name every commit past the default branch (`ChangeContext.validateRange`).
A publication chooses its route first and checks the commit names once, from that route's base, so a route that merges the branch whole is never refused for a lost held version.
The combine re-makes every member's commit, so a fix merged the ordinary way would meet the members' work as new and clash with it.
A fix built on the default branch combines the ordinary way, and a fix whose difference no longer combines with the batch is left out with that reason.
One declaration can give `sendBack` and `fix` together: the named changes go back as for a send-back, and the batch stays held at its version for that task's change (`OpenBatch.awaits`) until it is approved; then it is combined once, with the fix and every change waiting in line (`Batches.answer`'s `fix`, `Batches.follow`).
While it waits, each pass still reads the batch's pull request and its comments, so a pull request merged or closed where the project lives is followed as usual, but it combines nothing, reads no checks and merges nothing, even when its checks pass on a rerun or every member has left.
Try again ends the wait.
Every combine of an open batch, the one that takes the awaited fix, Try again and a send-back included, reads the batch branch where the project lives first, so a push whose record was lost is combined over instead of refused every time (`Batches.moved`).
When the awaited repair's task closes first, the batch stays held with no repair to wait for, and the feed says so once (`BATCH_WORDS.fixClosed`): another repair's approved fix, or Try again, ends the hold.
For a flake, the repair runs the failed checks again where the project lives, and checks that run again end the hold by the host's own reading; the flaky test still gets an owner.
A declared fix's checks run with the batch before it is approved (the captain's plan for a held batch's fix).
Once the fix's story is confirmed on its own branch at a version that builds on the newest held version, the app combines the held members, less any sent back, with the fix's own difference from that version and pushes it to the batch's branch and pull request, which run the batch's checks there (`startTrial`, `src/core/batches/trial.ts`).
It is kept as the batch's early run (`OpenBatch.trial`): the batch's version, its members and its hold stay as they were, the fix is no member, and nothing waiting in line joins.
It starts only while the batch is held for its checks at its version, with no rerun declared passed and nothing queued or unconfirmed, the fix declared and its task open, the awaited fix after a send-back, and that version not approved yet; otherwise nothing is pushed.
A new version of the fix, or its story confirmed in new words, starts a new run in place of the earlier one; the same story confirmed again starts nothing.
Each pass reads the run's checks at its commit (`followTrial`), and the batch's pull request description, the Batches panel and the batch's box in Settings say its checks run with the fix before approval.
A generated commit the project's checks add on the run is written again and stands as the run's commit, as on any batch.
A run that fails keeps the hold at the batch's version, its fix's version stands failed on the fix's batch check, and the fix's crewmate and the batch's repair, where another task, each hear it once in the `batch-trial-failed` wake; an approval of that version leaves the batch held and puts the fix in line at the next pass, or at Try again or a send-back when either comes first, so the combine takes it (`approvedFixInLine`).
Checks at the run's commit that then read otherwise end the failure, as they end a held version's hold.
A run that passes waits for the fix's approval and merges nothing.
Approved at the run's version and words once it passed, the run's commit becomes the batch's version, described again without the run's words, and merges as it is, after the same last look as any batch, and changes waiting in line stay there for the next batch (`promoted`, `src/core/batches/line.ts`).
Approved while the run still runs, at another version or in other words, or with the pull request behind or conflicting with the default branch, the batch combines with the fix and the line as above.
A member that left or was reworded, a hold that ended, a declared rerun that passed, another fix approved, or a batch branch moved by someone else drops the run (`trialStands`).
A dropped run whose commit is still on the batch's branch puts the held version back there, so the batch goes on held where it was; a reworded member then combines the batch again, as without a run.
When the fix's task closes, the run is left as it is and the batch stays held.
A pull request merged by hand at the run's commit settles the fix with the members.
A batch held for its checks reads them before an approved fix joins: a version whose checks pass on a rerun merges as it is, and the fix waits in line for the next batch, still declared, with the version it was built on.
Its checks failing again take the approved fix at once, without waking a repair again.
A repair may also judge that a rerun already passed the held version, such as a step of the batch's own run that runs the failed tests again while the host still reads the first attempt's jobs failed, and declare it with `check_change`'s `batch.passed`, naming that version (`Batches.declarePassed`, `OpenBatch.passed`).
At that version the failed checks the hold named read as passed, any other check still counts, one that fails later included, and the batch merges once the rest passed.
A fix declared beside it, or approved meanwhile, goes to the next batch, so the flaky test stays on the default branch until then (the captain's pick in the daily velocity review: "Merge a held batch once its version passes, even on a rerun, and send a test-only fix declared meanwhile to the next batch").
The declaration is refused for another version, for a batch held for something other than its checks, and beside a send-back or while the batch waits for a fix after one, since its version still carries the changes sent back.
A combine at a new version drops it.
Each held batch says who has its next step, in one rule the Batches panel and Settings share (`batchHoldState`, `src/shared/batches.ts`; the panel keeps a copy, `holdState` in its `words.ts`, since a panel imports only its own files, and `src/shared/batches.test.ts` holds the two equal):

- the crew, while its repair works on it, fixes it, waits for its fix after a send-back, or declared that a rerun passed;
- the captain, while the repair's task waits on a card of theirs (a fix waiting for approval when that card merges), or while a setting where the project lives refuses the merge;
- a rule where the project lives, such as a required review;
- no one, while no repair is recorded or the recorded one closed.

Only the captain's and no one's ask anything of the captain.
Settings → Projects shows a held batch in the Changes group of the repository's settings on its project's page (`BatchHoldPanel`, `src/renderer/src/settings/`): a title and a sentence saying who has it, naming the repair by key, the repair's latest report line while it works (`outcomeSummary`), a line naming the declared fix its checks run with before approval while that early run has not failed, why it holds and since when, a button that opens the repair's task, one that opens the pull request, Try again, and Send back with a reason for the chosen changes, every control reached by keys.
Try again and Send back lead only while a setting refuses the merge or no repair is working on it; otherwise they fold under Answer it yourself, and the box takes the plain background of the other boxes while the crew has the hold, and a warning tint otherwise.
Try again combines the batch again at a new version with every change waiting in line, so its checks run again.
If the same work combines to the branch's current or a held version, the combine advances the last commit's committer date until the version is new, without changing the work or adding a commit.
A batch waiting on a merge its host still reads as running shows in the same place (`BatchWaitPanel`): since when, a button that opens its pull request, and Try again, which closes that pull request and combines its changes on a new one, with nothing to send back since nothing failed.
The first mate sends the same answers through `app_change`'s `project-batch-answer`: Try again on its own judgment, and a send-back only on the captain's own words; it reads held batches only, so a merge still running is answered in Settings.
Its line on the feed names the answer that was asked (`ACTIONS["project-batch-answer"].done`).
Every answer names the held or waiting version it answers (`BatchAnswer`, `inf:repos:batch-answer`), so one for a hold or a wait that already ended is refused in words and changes nothing.
A merge the host refused is never sent again at that version: Try again makes a new one.
A batch GitHub removed from its own merge queue holds the same way, with GitHub's removal as its reason ("The host's merge queue").

### A change sent back

A send-back, from a repair, Settings or the first mate, keeps the captain's approval, as a failed batch of one does (INF-5097, the captain's answer Keep).
The version sent back stands as `sent-back` (`standing`, `src/core/batches/line.ts`): its merge waits on the checks, its batch check reads failed with the reason, and no Merge anyway is offered.
Its crewmate repairs it in a new version and declares that with `conflictRepair`: impact none goes in line once the branch's own checks pass, with no new card; changed-work ends the approval and comes back to the captain on a new merge card.
Either way, the checks its project's rules name for a sent-back change finish at the repaired version before the declaration, or before the new card.
Where no approval covers that version, the crewmate shows a new merge card.
The app keeps every send-back of an open task's change on the project's batch record (`BatchSendBack`, `sentBack`): the version, the reason, the batch's pull request, the batch's failed checks, and the checks that never ran to an end there - cancelled, skipped or unfinished, as the hold last read them (`BatchHold.notRun`).
The hold reads those from the host's own facts: a manual job nobody started and a job allowed to fail that was cancelled count, while one allowed to fail that failed ran, and GitHub's row for a whole unfinished workflow run names no check.
Where no such list was kept - the host could read the checks only in part, or the batch was held for something other than its checks, such as a refused merge - the hold and the send-back carry none, and the wake and the merge card say which checks never ran is not known, without naming why.
Closing the task drops them.
A send-back made before the project moved to a new address still stands at its version there: the change comes back in a new version, approved at the new address.
A change that leaves the line because its approval or its batch belongs to the project's former address is not sent back: its approval ends, no send-back is kept, and its crewmate hears it needs fresh approval (`addressMoved`).
The app judges nothing from them and counts nothing: it carries them to the agents who judge.
The crewmate's `batch-sent-back` wake names the reason, every earlier send-back or that this is the first, the failed checks and the checks that never ran, and asks for the checks its project's rules name for a change sent back from its batch, finished at the repaired version before the repair is declared with `conflictRepair` or shown on a new merge card, since a repair declared with impact none rejoins with no card (`deliveryWakes.ts`).
The `batch-held` wake lists each member's earlier send-backs, so the repair's brief carries them.
The change's merge card says in its Batch check state how many times it was sent back, with each batch, reason and never-run checks in a list under the status line, also on a repaired version that is not in line yet (`BatchCheckFact.sentBack`, `settleCardFacts.ts`).

### The batch gap

A project can wait between batches, so more approved changes go up together and the batch's checks run less often.
Settings → Projects shows When a batch starts on every batched project's page, in its Changes group under Where changes go and its notes, and the first mate sets it through its project settings (`batchGap` on `app_change project-settings` and `inf:repos:configure`).
Everyone's default is As soon as a change is approved, which forms a batch as soon as the line holds a change and none is open.
Settings offers at most every 1, 2, 3, 4 or 6 hours (`BATCH_GAP_CHOICES`); the first mate may set any whole number of minutes, and Settings then offers that too (`BATCH_GAP_WORDS`).
The gap is the project's `batchGap` in minutes (`RepoView`, the `batch_gap_minutes` column), and `RepoRegistry` is its only writer.

The gap counts from when the project's last batch formed from the line, kept as the record's `formed` (`BatchRecord`, set by `combined`).
A batch still takes the whole line, so every change approved during the gap goes up in the next batch together.
The pass on the tick forms it on its first run once the gap has passed (`forms`, `nextBatchAt`), and the first change after a quiet stretch longer than the gap forms one at once.
A held batch's repair never waits for the gap: a declared fix, Try again and a send-back each combine the open batch again with every change waiting in line, which forms no new batch and moves no `formed`.
A held batch that merges as its early run with its fix leaves every change waiting in line there, and they form the next batch once the gap has passed since the held batch formed ("A held batch").
While a change waits in line under a gap, its batch check says when the next batch starts (`BATCH_STATUS_WORDS.waitingUntil`, `Batches.status`).

Evidence: `src/core/batches/line.test.ts` and `batches.test.ts` ("the batch gap"), and the journey `tests/e2e/batch-gap.spec.ts`, which sets it by keys.

### The Batches panel

The Batched pull requests runbook carries a panel of its own, Batches, in its folder `resources/runbooks/batches/panel/` (`"panels": ["panel"]` in its `runbook.json`), shown on the right rail while the runbook is on ("Built-in panels" in `docs/runbooks.md`).
It only points: nothing in it merges, answers or moves a change.
It reads `batches.list` and `tasks.board`, and shows only the focused project's repositories while the project focus is on one (`docs/project-focus.md`).

`batches.list` (`batchesView`, `src/core/batches/view.ts`) answers each project repository on batched pull requests, or whose record still holds something, from the app's own record alone: its line with why each change waits, its open batch with its state, hold, members, declared fixes, the fix its early run carries and checks, the changes left out and why, and the batches that ended in the last day.
Nothing in it asks where the project lives.
The open batch's checks are the reading the batch pass already made at its version, kept in memory (`Batches.checksReading`) and pushed with its own `batch_checks` event only when the counts change; a batch that ends, or a restart, drops it, and the panel then says the checks are not read yet.
The record keeps each batch that merged or closed as `BatchRecord.finished` - its number, link, members, when it formed and ended, its outcome and how many times it held (`finishedWith`, `src/core/batches/line.ts`) - and the view lists only those that ended in the last day (`FINISHED_BATCH_KEPT_MS`, `finishedWithin`).
An older entry stays saved until the next batch ends, which drops it.
`batches.list` is read again on each change to a batch record (`repo_batch`), each new checks reading (`batch_checks`), a project set up, configured or removed, and once a minute, so a batch leaves Last day a day after it ended.

Collapsed, the panel's header says the open batch's state and how long it has held it ("checking 49m"; for a hold, who has it: "repairing 5m", "rerun passed", "needs you 5m" or "held 5m") and how many changes wait and are left out.
Its first words are bright unless the crew has the hold, as every panel marks what needs the captain.
Open, it shows:

- the open batch: a dot for its state, its number and size, its state and how long beside them (for a hold, only how long, since the line below says who has it), for a hold a sentence saying who has it ("A held batch") with the repair's key as a button and its latest report line, its checks as a bar with how many passed, the failed checks by name on one line that shows the name's end, a line naming the declared fix the checks run with before approval while that early run has not failed (`checkingFix`), the declared fix's key unless the sentence names it, its members as task chips (six, then "+N more"), and Open in Settings while Settings holds the captain's next step: a setting, a rule or no repair;
- one row for the changes waiting, and why;
- a row for each change left out, with why;
- Last day, closed until opened, with each batch that ended.

A chip and the repair's key open their task, and Open in Settings opens the held batch in Settings → Projects with focus on it; the details card offers Open in Settings for every hold.
Its rows and chips are one Tab stop, inside which the arrows, Home and End move; the Last day toggle is a second Tab stop, and F6 reaches the panel as any panel.
Its header button and the command Show your batches put up its wide details card (`cards/details.tsx`), the same groups in full words - the state with its time, the checks counts and when they were read, each change and why it waits or was left out - and a table of the last day's batches: batch, changes, formed, ended, how long it took and times held.
The panel has no link to the batch's pull request, since a panel's frame opens no links; Open in Settings reaches the button that opens it.

Evidence: `src/core/batches/view.test.ts`, `line.test.ts` ("a batch that ended"), `batches.test.ts` ("the open batch's checks reading"), and the journey `tests/e2e/batch-panel.spec.ts`, which walks the panel and its details card by keys on a disposable GitHub.

## A project that still carries the team queue's files

Earlier versions of Infinitary shipped a team queue: a workflow the project carried, which tested approved pull requests together and answered a commit status named `infinitary/queue`.
The app ships and reads no such queue now, and nothing in it writes that status where a project lives.
A batched project that still carries those files gets batches of the person's own like any other, from the first start of this version.
A status of that name a host still carries on a version is left out of every reading of the change's checks, since it says nothing about the change now (`hostChecks`, `src/core/orchestrator/changeChecks.ts`).
A card an earlier version put up while a batched choice waited for a queue workflow comes down with its reason (`queueSetupCardId`, `QUEUE_SETUP_WITHDRAWN`).

The app looks once in each project whose host could run that queue, at start and after a merge in the project (`TeamQueueLeft`, `src/core/orchestrator/teamQueueLeft.ts`).
The look reads the default branch for the files the queue kept there, by the names it shipped them under (`Forge.teamQueueLeftovers`; `TEAM_QUEUE_FILES` in each host's part).
Where it finds one, it also reads whether a rule of the default branch still requires the status, and names that rule as the host does: a rule set by its name, or the branch protection rule of that branch.
A rule that cannot be read, such as one the sign-in may not see, names nothing.
A read that fails marks nothing, so a later look reads again; a read that answers is kept on the project's row and never made again (`RepoRegistry.recordTeamQueueLooked`).
A project with no such file is told to nobody.

A project with such files reaches the first mate once, as the `team-queue-left` wake (`TEAM_QUEUE_LEFT_OPENING`, `src/core/orchestrator/noticeWakes.ts`).
The wake names the files and the rule, and the first mate offers once, on one decision card, a task in that project that removes them with a pull request: the files, any line of the project's own CI that includes or runs them, and the queue's labels and key where the project lives.
A required status nothing writes holds every pull request there, so the card and the task's brief name the rule and say that someone who may change the project's rules has to drop the requirement.
Not now leaves the files where they are; the app tells each project's files once.
Evidence: `teamQueueLeft.test.ts`, `githubForge.test.ts` and `gitlabForge.test.ts` ("the team queue's files a project still carries"), and `changeChecks.test.ts` ("leaves out the status the team queue left on a version ...").

## The check watch

The host reads a change's checks for the crewmate while they run, with plain forge calls and no model turn (`src/core/orchestrator/checkWatch.ts`).
It wakes the crewmate once when the first check fails and others are still running, and once more when the checks finish.
Before it, a crewmate re-read `check_change` until its checks settled - up to 40 full-context model turns on one task.
The design follows the firstmate repo's PR poll: a watcher that is not a model, bound to the change and its head, never doubled.

- **Armed** by a reading that finds a check still queued or running (`ChangeChecks.record`), on a forge whose `hasChecks` is true: the crewmate's `check_change` or the merge card's CI gate.
  A reading that is only held back by a check waiting for a person to start it arms nothing: nothing is left to finish.
  A plain Git host or a project kept on this Mac has no checks, so nothing is watched and `check_change` says no wake will come; a new forge kind with checks implements `checks()`, sets `hasChecks`, and is watched with no change here.
  A project recorded as running no checks arms nothing for a reading where no check ran, and `check_change` says no wake will come ("A project with no checks").
- **Durable**: the watch is a delivery fact on the task, `ciWatch { head, since, nextAt, tries, failureSeen }`, so it outlives a restart and ends with the task.
  A reading at the head already watched keeps its start.
  `failureSeen` means the early wake for that head already went, or the crewmate already read a red check, so that wake is not sent again.
- **Read** on the shared 60 s tick (`CrewWatch.pollCheckWatches`, through `ChangeChecks.readWatched`): every minute for 10 minutes, then every 2, up to the two-hour bound.
  Every successful reading updates the saved reading time, even when running checks keep the same status and head, so the reading time shown on rest stays current.
  A reading - the watch's, the quiet refresh's or `check_change`'s - records a `ci` event only when it changes the check state: the status, the head, or the repair ledger (a failure first seen there or a crew declaration).
  A reading that changes none of them adds no CI event; it advances the reading time and retains observation-forwarding bookkeeping (`changesCheckState`).
  Raw readings retain named failure history without settling repairs or counting attempts.
- **Quiet refresh** continues every five minutes (`CHECK_REFRESH_MS`) for live tasks with a recorded open pull request, even after a watch ends, using the same reading and delivery facts.
  It also reads on the first tick after the crewmate's turn ends (`idleSince` later than the last reading), since that turn may have pushed a new version from its shell, which tells the app nothing (INF-3092); a standing watch reads then too.
  It runs on the shared tick after a restart too and backs off unreadable checks.
  It counts from the saved reading time, whichever pass recorded that reading; only a read that recorded nothing (a failed read, a spent allowance or a merge confirmation alone) backs off from when it ran.
  Changed raw readings retain a durable `ciObservation` identity until a crew tool response or the existing inbox forwards them.
  The quiet reader forwards changed observations once, including across a restart; only the crew's declaration changes readiness.
  Unchanged readings start no model turn.
  The same tick reads each live task's recorded pull request by number, independently of check completion, dependencies or a captain gate.
  A confirmed external merge immediately records `ci: merged`, but PR ownership alone never closes its task.
  The crewmate's open merge card for that pull request declares with `after: close` that its merge finishes all the task's work, at the version the card was shown for (INF-2744); the card is the one writer of that declaration.
  Only that matching declaration, an idle task with no running jobs or pending/in-flight instructions, and the existing child and dependency close checks allow `SettleService` to close the task as merged without a discard or another approval.
  Otherwise the task, instructions, cards and working copy stay intact, and one durable wake per merged version tells the crewmate the merge happened so it can continue or declare completion without asking again.
  When the declaration already holds and something else keeps the task open, the wake names what declared it, the open merge card or the captain's kept approval, and asks for no merge card (INF-3799).
  When nothing declared it and that pull request's merge card would be refused, the wake gives the refusal `check_change` gives and asks for the merge's report instead (`ChangeMerge.mergedStory`).
  An automatic close records the closed state synchronously before awaiting idle runtime shutdown, so new guidance cannot be accepted and then purged during that wait.
  This monitor survives a plain-reply “I'll merge the PR” choice without interpreting the button's words; it follows the task's recorded pull request, not unrelated pull requests reviewed by that task.
  A missing, unreadable or closed-but-unmerged pull request never closes the task, and its named read continues on later ticks.
  A named pull request needs only the project's saved host identity, not a reachable working copy or local project folder.
  A working copy on an unreachable computer remains recorded as present until `PlacedSessions` and `PlacedCopies` save its unmerged work and retire it on reconnection; the task itself is already done.
  It skips a task idle behind another task, the work posture the Tasks dot shows as blocked by another task (`CheckWatcherHost.idleBehindOtherWork`): the host does not read that task's checks while it waits, and its crewmate reads them itself on resuming.
  A settled result or same-head rerun updates displays without a diagnosis wake; a new head whose checks are running arms the ordinary bounded watch.
- **A branch-only change** (INF-6241), the pushed branch of a project that merges in batches of its own, once a reading has named its version (`readsBranch`), has no quiet refresh: it is read on the first tick after the crewmate's turn ends, when a run watch starts on it, and every minute while its merge card waits under a captain's reply or is held for its new version (`versionAwaited`).
  A merge card held for the read after the turn starts it at once (`CheckWatcher.readAfterTurn`), and a failed read counts as done (`afterTurnReadOwed`).
  A read that starts while the crewmate's turn or one of its background jobs runs (`working`) can miss a push that work still makes, so the read after that work ends is owed again.
  A reading at a new version arms a watch only when a check there is running or queued: none started, or only checks a person starts, arms none.
- **Bound to the head**: a new head where the project lives re-arms the watch for it, and only the head it last saw is woken about.
  A reading the crewmate takes itself that finds the checks finished ends the watch (it already knows); the merge card gate's does not, so the crewmate still hears.
- **Two wakes at most** for one head, each a `checks-settled` steer on the crewmate's own lane, the supervisor's, through the ordinary steer path (it resumes an idle task).
  The first is `first-failure`, naming each red check, while others are still running.
  A read that first sees a failure and also sees the checks finished sends only the end wake.
  At a version the captain's standing approval covers, a finish with every check passed sends no wake and runs the approval instead, and any other wake carries the approval's line (INF-4018, `docs/delivery-rigor.md` "No second card for an approved version").
  A `gone` wake after the pull request read merged outside the app carries no approval line, since nothing is left for the approval to merge or repair (INF-4161).
  The end wake carries the finished check states without a passing verdict; `timed-out`, still running after `CHECK_WATCH_BOUND_MS` (two hours), or with no check started in that time (`noneStarted`), when it names the absence declaration instead; `gone` (no open change for the branch); `unreadable` (a sign-in, permission or other refusal; a transient failure reads again inside the bound).
  A spent hourly allowance is not a refusal: the watch keeps standing, wakes nobody, and reads again at the reset GitHub named (`ForgeAllowanceSpent.resetAt`, INF-2149); the quiet refresh and the merge read wait the same.
  Each wake is named by the watch and the event (`check-watch:<head>:<since>:failure` or `:end`), and the inbox records the name with the row it queues (`InboxStore.enqueueSteerOnce`), so a restart between the wake and the clear never sends it again.
  A wake recorded before the early wake existed, named `check-watch:<head>:<since>`, still counts as the end wake.
  The watch relays failure states without deciding readiness; the fact reader retains any explicit allowed-to-fail metadata.
  The early wake spends no repair round and does not change how a pull request goes green.
- **The idle ladder** reads a standing watch as the task moving (`Witnesses.checksWatched`, `docs/report-sort.md`): the crewmate that ends its turn to wait is neither nudged nor reported stuck, and its report wakes nobody until the checks finish.
  The early wake does not clear the watch, so the task still reads Waiting for checks.

## Comments on a pull request

While an enabled runbook asks for the `pull-request-comments` wake (`docs/runbooks.md`, "Built-ins"; Pull request comments starts off), the host reads new comments on a followed pull request and wakes its crewmate, with plain forge calls and no model turn (`src/core/orchestrator/pullComments.ts`).

- **Which pull requests**: each live task's current change, when its crewmate's conversation was served guidance that asks for the wake, read on the quiet refresh (`CheckWatcher`'s `readComments`, after the merge read): its own pull request, or one it was pointed at with `check_change` `pull` (`currentChange`).
  The host records which wakes that guidance asks for when the conversation opens, and when a policy notice adds guidance (`servedWakes`, `Runbooks.crew`), so a crewmate whose conversation opened while the runbook was off is never woken about guidance it does not hold.
  Each pass of a batch of your own reads the batch's pull request (`Batches.follow`), for the changes whose crewmates were served it.
  A merged or closed pull request is not read.
- **Only when it moved**: the reading is a delivery fact, `commentCursor { number, updatedAt, seen }`; while the pull request's last-changed time equals the cursor's, nothing is asked for, and otherwise GitHub's lists are asked only for what changed since it (`readPullComments`, `src/core/forge/providers/github/comments.ts`): conversation comments, line comments and submitted reviews.
  On Bitbucket the one comment list is read, 100 a page up to ten pages, and only comments changed since are kept (`readBitbucketPullComments`, `src/core/forge/providers/bitbucket/comments.ts`): a comment with `inline` is a line comment and `parent` names the one it answers; a deleted or draft comment is left out, and an approval carries no words, so it is no comment.
  Bitbucket's pull request keeps its `updated_on` when someone comments, so its reading names no last-changed time (`BitbucketForge.pull`), nor does Data Center's: every reading there reads the comment list, and the cursor's `seen` keeps each comment to one wake.
  On Bitbucket Data Center the pull request's activity is read, 100 a page up to ten pages (`readDataCenterPullComments`, `src/core/forge/providers/bitbucket/dataCenterComments.ts`): each comment activity carries the comment and its replies, the newest reading of an edited comment is kept, a comment on a line names its file and line in the activity's anchor, and a deleted or draft (`PENDING`) comment is left out.
  The forge is handed `seen` too, so a comment already read asks for no account or permission again, and a reading with nothing new costs the comment list alone.
  The first reading of a pull request reads every comment already on it.
  For a crewmate told of the wake, a pull request's last-changed time alone no longer sends the contribution-updated wake; a state change still does, and an untold crewmate still hears every activity.
- **Whose comments**: the crewmate's own replies are left out by id, since they share the captain's sign-in: the gateway keeps the id of each comment, line comment or review a crewmate's `github_write` sent, on whichever project it went to (`sentComments`), and a line comment inside such a review is left out by its review.
  The kept ids are read after GitHub answers the reading, so a reply sent during it is the crewmate's own too.
  The app's story comment and its comments that carry a batch's stories, by the story marker in them, and a review with no words are left out too.
  Every other comment wakes, the captain's own included.
- **The wake** names each new comment's id, kind, author, the author's relation and its file and line, never its words, which the crewmate reads itself with `github_read` as outside data.
  The relation comes from GitHub's facts: `bot` for a bot account, `you` for the signed-in person, `can-write` for an owner, or for a member or collaborator whose permission on the project GitHub names as admin or write, which folds every role, a custom one included (`GET /collaborators/{login}/permission`, once per author per reading), `cannot-write` for anyone else.
  When GitHub refuses that lookup, a member or collaborator counts as `can-write`.
  On Bitbucket an `app_user` is `bot`, the token's own account is `you`, and an author whose repository permission Bitbucket names as write or admin is `can-write` (`GET .../permissions-config/users/{account}`, once per author per reading); only a repository admin may read that, so when Bitbucket refuses it the author counts as `cannot-write`.
  On Bitbucket Data Center a `SERVICE` account is `bot`, the token's own user is `you`, and an author the repository's or its project's user permissions name with write or admin is `can-write` (`GET .../permissions/users?filter=<name>`), with the same refusal rule.
  One wake per reading, named by the comments it carries (`pull-comments:<number>:<digest>`), so a restart between the wake and the saved reading never sends it again (`InboxStore.enqueueSteerOnce`).
- **A batch's comments** go to the changes they are about: a line comment to each change whose commit changes its file (`Forge.commitFiles`), any other comment, or one whose file no commit changed, to every change; the wake names the change's commit and how many changes the batch carries.
  The batch's cursor is kept on each of its changes' tasks.
- Every judgment about a comment - fix it, ask the captain, answer or let it be - is the runbook's crew section, never the host's.

## A main failure's wake

A pull request held because a check also fails on the default branch hears that branch's own finished checks, without waiting for the named task to close (INF-833 Fix 4), and its crewmate judges whether they clear the wait.
The standing baseline diagnoses name the checks, and so does the recorded default-branch run of each check that fails at the change's current version while a merge card stands at that version (`TaskDelivery.mainChecks` and `completionOffers`; `standingBaselineChecks` in `src/core/tasks/dependencyWaits.ts`), so a merge card that says a check fails on main too is watched without a diagnosis, and a crewmate still driving its checks hears no wake about main.
On the check watch's tick, one read per project asks the forge for the default branch's checks (`Forge.branchChecks`, `ChangeChecks.readDefaultBranchChecks`).
A reading wakes nobody until it is final: an incomplete reading, a read problem, no checks or any pending check sends nothing (`MainCheckWatcher`, `src/core/orchestrator/mainCheckWake.ts`).
Each waiting task then hears one `main-check-observed` steer per commit, through the ordinary steer path, naming the commit and each check's state; the host declares no readiness, and the crewmate judges whether the reading clears its wait.
The inbox records `main-check-finished:<sha>`, so a restart does not send that commit's wake twice, and a later commit's finished reading does.
The named task's close still resumes the crewmate.
On Bitbucket and Bitbucket Data Center the reading is the build statuses on the main branch's head.
A host without `branchChecks` — a plain Git host, and GitLab until it can read a branch's checks apart from a merge request — keeps that close as the only resume.
A failed read waits out the check watch's slow pause and wakes nobody; on a spent hourly allowance it waits until the reset GitHub named, when that is later.
The same branch reading answers a crewmate's own failed check at once: a reading of the task's pull request that finds a check red records the default branch's newest run of it as evidence ("Check facts and crew judgment", INF-1915 fix 1), so the diagnosis a `baseline-blocked` classification needs starts from a typed fact rather than a second read.

## The checks cell's time

Wherever the app shows a task's checks - the fact strip on the crew summary and the task record, and the merge card's Checks state - it says how long they have been running, or how long they took, counted by the host's own times (INF-587).
`checks()` keeps each check's start and finish where the host gives them (`ForgeCheck.startedAt`, `finishedAt`): a GitHub check run's `started_at` and `completed_at`, a commit status's `created_at` and, once settled, its `updated_at`, a workflow run not yet listed as a check by its `run_started_at`, and a GitLab job's `started_at` and `finished_at`.
Every reading writes `ciStartedAt` and `ciFinishedAt` on the task's delivery facts (`checksTimes` in `src/shared/checksSpan.ts`): the first check's start; once green the last check's finish; once red the first failure's finish.
A merge card's Checks state on a reading that carries the batch check shows no duration, since that reading's times span the change's place in its batch ("Batches of your own" above).
A reading with no start clears both, so a new version starts the count again, and a rerun that the host lists as the newer check counts from its own start.
The task record's cell reads `running for 15m`, `passed in 14m · 5m ago` or `failed after 9m · 5m ago`, in whole minutes redrawn each minute (`src/shared/checksSpan.ts`); on rest it shows when the first check started and when the app last read them.
The merge card's Checks state says `running for 15m`, `passed · 5m ago` or `failed · 5m ago` in the open, and keeps the counts, how long the checks took and both times for rest (`checksRestWords`, INF-3709's plan).
The crew summary says the checks as one state with that time beside the pull request, with no counts and no `ago` (`running for 11m`, `checkSnapshotState`, INF-2528).
A reading of an earlier version of the change says `not read for this version` there, as the task record does, never that version's result (`currentCheckState`, INF-2538).
Checks that have not started, not read yet or merged outside the app show no time.
The first mate's own facts keep the reading's age (`ciFact.ts`), because it judges a reading's freshness by it; Activity and the Now line keep each reading's own time.

A task with no change yet shows the run it started by hand instead, when the app watches one (INF-594, "The run watch" below).
The run reader keeps the host's times (`WorkflowRun.startedAt`, `finishedAt`): a GitHub run's `run_started_at`, the latest attempt's start, and once completed its `updated_at`, because a run has no `completed_at`; a GitLab pipeline's `started_at` and `finished_at`.
Every reading of a watched run - the crewmate's short read and the minute reader's - writes `runChecks` on the delivery facts (`runChecksOf` in `src/core/orchestrator/runWatch.ts`): the run, its state (running, passed, failed or cancelled), its times and the reading's time.
It stays after the watch ends, so a finished run says `passed in 3h 26m · 5m ago`.
A reading of another run replaces it only when that run started at or after it, so the newest run shows.
The run is read by its number, never by its commit, which may carry other checks; a task with a change shows the change's checks.

A merge card shows each requested run the app watches for the version on offer in a state of its own on its status line, because the Checks state counts only the pull request's own checks (INF-3220).
Every reading of a run still going keeps on its watch the run's version, its page, whether it is queued or running, since when the app's readings have seen that state, and when it read (`RunWatch.reading`, `watchReadingOf` in `src/core/orchestrator/runWatch.ts`).
A run reads as queued while none of its jobs has a machine, so a run whose first jobs finished while the rest wait for one reads as queued too.
The state is named by the run, such as `phone`, and reads `queued for 1h 27m` or `running for 5m`, linked to the run's page; on rest it names the run's number and version and when the app read it.
A run read at another version shows no state, and the state goes when the watch ends (`watchedRuns` in `src/core/orchestrator/settleCardFacts.ts`).

## The run watch

A crewmate's short `read_workflow({ runId })` of a run still going saves a watch in the task's `runWatches` delivery facts (`WorkflowEvidenceService`, `RunWatcher`).
The short read says the app is watching and tells the crewmate to end its turn, never sleep or loop on reads.
The run and its latest jobs are read on the supervisor's shared 60-second tick, through the project's forge and app-owned sign-in, with no model turn and outside the gateway's 200-call budget.
Each task watches up to five runs, each for three hours from its first read; another read preserves that start, and an over-cap read explicitly says no wake will come for that run.
A latest-attempt reading follows a GitHub rerun without starting another three-hour bound or adding wakes.
GitLab has no attempt counter: its pipeline stays the same number, and its jobs list omits retried jobs.

The watch queues at most two typed `run-watch` steers on the crewmate's own durable lane: the first failed job while the run still goes, then the run's end.
Each names the run and attempt, and failures name job numbers, names and the failed step or reason when the host supplies one.
If the first failure reading also sees the run ended, only the end wake goes.
GitLab jobs marked `allow_failure` do not send an early wake; GitHub exposes no such flag in its jobs API, and a continue-on-error job reported successful is not a failure.
The watch never guesses allowed failure from a job's name.
The end names passed, failed or cancelled; a run still going at three hours, a gone run or an unreadable run sends an end wake too.
A typed transient host failure reads again within the bound, and a spent hourly allowance reads again at its reset, also within the bound; a sign-in or other permission refusal ends the watch immediately.
An incomplete jobs list is named on a failure wake rather than claiming every failed job was seen.
A run of the open batch's branch, read by a task that is not one of the batch's changes, carries the batch on its failure and end wakes (`runBatchFacts`, `src/core/orchestrator/ownBatches.ts`; INF-4574).
For a batch of several the wake says the app holds the batch and the first mate starts one repair that owns the failure, so the crewmate finds that repair by the batch's pull request and names or waits on it, unless its own task is the repair; for a batch of one it names the change's own task as the owner.
A run of an earlier version of the batch that ended cancelled says the app replaced it with a newer version, naming the batch's pull request and current version, so the crewmate watches that run instead.

Wakes use `run-watch:<runId>:<since>:failure|end`, recorded by the durable inbox's ordinary once mechanism.
A restart preserves each watch and each sent name, so neither wake goes twice.
A closed task receives no wake; an overlapping crewmate read or close supersedes an outstanding poll.
A crewmate's own short read of failures suppresses the early wake it already knows, and its short read of an ended run clears the watch without a wake.
Starting and ending a watch each writes one task timeline line.
While a watch stands, `checksWatched` keeps the idle ladder from nudging or reporting the task stuck, and its existing posture reads Waiting for checks.
Each reading also keeps the run's state and host times for the checks cell ("The checks cell's time").
An ordinary reading saves that checks cell with its own time, any newly failed jobs and the watch's next read in one write; a reading that wakes the crewmate saves its checks cell and failed jobs before the wake goes out (INF-2220).

The run watch never writes pull request check readings, diagnoses, repair counts or merge permission; like the short read, it keeps the run's failed jobs on the repair ledger ("A workflow run's failures" below).
`check_change` remains the pull request fact reader and declaration seam; `github_read`, job log reads and downloads keep their existing contracts.
An accepted own-project `github_write` dispatch with `workflow_run_id` arms the run watch immediately and says so.
The crewmate sends `"return_run_details": true` itself; the app never adds it, because older GitHub Enterprise servers may refuse it.
A GitHub dispatch that does not send `"return_run_details": true` gets no run number back, so the app lists that workflow's dispatched runs before sending it and again after, up to three times while GitHub queues the run (one budgeted call each, `GithubGatewayService.dispatchBaseline`, INF-1428).
The one new dispatched run on the dispatch's ref is its run, and the answer names it beside the watch's own words.
Two new runs are someone else's race and the app never guesses between them; then, as when the listing cannot be read, the answer says to find the run through `github_read` and take the short `read_workflow` read.
Never repeat an accepted write to obtain its number.
Accepted GitHub run reruns use the route's run number, and job reruns read the job's `run_id` through the gateway (one budgeted call).
GitLab pipeline starts use the returned pipeline `id`, pipeline retries use the route's number, and job retries or plays use the returned `pipeline.id`.
The watch is armed before reading the run, so a rerun still being queued cannot clear it through a stale ended-run reading.
An existing watch keeps its original bound and sent wakes; a rerun after that watch ended starts a new watch.
A write kept for the captain arms no watch until the captain's click sends it successfully, and writes outside the task's project never arm one.
The five-run limit still applies; a full watch list or an unavailable run number explicitly says to take a short read later.
Reruns of a task's pull request still record its existing rerun reservation and read its checks separately; a non-PR rerun makes no pull request reading.

### A workflow run's failures

A run a task reads needs no pull request for its diagnosis or an evidenced rerun declaration (INF-688).
Every short `read_workflow({ runId })` and every reading of the run watch records the run's failed jobs on the task's repair ledger (`observeRunFailures` in `src/core/orchestrator/checkRepair.ts`, `recordRunFailures` in `runWatch.ts`).
Each failed job's name joins `ciRepair.failures` at the run's version, so `check_change` accepts a diagnosis keyed to that version and job name, as it does a failed pull request check.
`ciRepair.runs` keeps each run's newest reading: its version, its attempt and that attempt's failed jobs.
A newer reading replaces it, so a job that passed on a rerun is no longer listed; an incomplete job list never drops a job the same attempt already showed failed.
A reading with no failed job is recorded only for a run already on the ledger.

A workflow reading retains its exact version, attempt and failed job names.
Diagnoses and evidenced rerun decisions are declarations, not requests for a host allowance.
A baseline-blocked diagnosis still names a separately owned dependency, whose closure and default-branch check observations can wake its crewmate.
Repair settlement always comes from the crew's explicit declaration, including before a pull request opens or after it moves to a newer version.

## Conditional reads

Every GitHub read the app makes goes through one store of the answers GitHub tagged (`conditionalGets` in `src/core/forge/providers/github/conditionalGets.ts`, INF-2149): the forge's own reads, the workflow reads, the gateway's `github_read` and the sign-in's health read.
The store keeps each signed-in JSON GET's `ETag` and answer, sends the tag as `If-None-Match` on the next read of the same address by the same sign-in, and replays the kept answer as a 200 when GitHub answers 304, with the 304's own headers, so the allowance left is the current one.
GitHub does not count a signed-in 304 against the hourly allowance, so a watch that finds nothing changed spends nothing, and how often anything is read does not change.
The key is the address, the `Accept` and API version headers, and a hash of the sign-in, so one sign-in never reads another's answer.
It keeps nothing for a write, a ranged or unsigned read, a redirect, or an answer that is not JSON, and forgets the oldest answer past its byte bound (`KEPT_ANSWERS_MAX_BYTES`).
The app builds a new client for each call, so the store lives in the home's forge wiring (`homeForges.ts`), one for the run.

## Failures are typed

A forge throws `ForgeError` with a `failure`: `transient` (any 5xx or the host unreachable - `ChangeMerge.merge` retries these quietly), `sign-in` (a 401), `permission` (a 403, never retried; a spent hourly allowance, a 403 or 429 with no calls left, is a `ForgeAllowanceSpent` carrying the reset time, which the timed reads wait for), `not-found`, `refused` (a stale head, a default branch that moved on, branch protection), `unsupported`.
GitHub's 405 "Base branch was modified" to a merge request is a `ForgeBaseMoved`, still `refused`: the default branch moved while GitHub merged, which says nothing about the change.
A merge that meets it is sent again with the same short backoff, each try reading the pull request until GitHub decides (`UNDECIDED_REREAD_MS`) and sending only when it reads clean at the approved head, the captain's own click included; a conflict or another stop it reads then stops the merge as it would any other time.
Still refused after the last try, a kept approval waits on `computing`, which the host reads again on its own and which wakes no one.
The raw words stay on the error for the record and `plainProblem`; the kind is what code decides on.

## Who reads it

`ChangeChecks` (`src/core/orchestrator/changeChecks.ts`, read by the crewmate's `check_change` and the completion-card gate) asks the seam and records what it answers on the task's delivery facts: `changeLabel` from `label()`, `prNumber`/`prUrl` only where the host has them, `prBase` where the host names the branch the change targets, and each check reading stamped with the number of the pull request it was read of (`CheckSnapshot.prNumber`), which the change record binds it by (`docs/task-record.md`, "A task's change").
When the branch has no open change but the task names a pull request, the reading asks for it by its number with `pull`: merged outside the app, it records `ci: merged`, and the strip reads "merged outside the app" until the shared watcher can close a task whose crewmate declared that merge finishes its work.
The crewmate declares it with a merge card for that pull request with after close, which its answer asks for; when the captain's kept merge approval already says that merge closes the task, the answer asks for no card instead, since the shared watcher reads the same approval (`approvalClosesOn`, `src/core/orchestrator/mergeAuthorization.ts`).
When that pull request's merge card would be refused ("The one call to the merge card"), the answer says why and asks the crewmate to report the merge instead, from the same verdict the merge card reads (`mergedStoryOf`, `src/core/orchestrator/mergedStory.ts`).
When the pull request that merged is the one the captain's kept approval would merge, the answer leaves out the approval's line, which would otherwise ask for a repair or a guidance declaration on a merge already made (INF-4161).
A put-in made before that tick also answers the merge already made and closes the task without sending anything.
The settle card's fact strip (`SettleFacts.strip` in `settleCardFacts.ts`) and the record card read that label and link - never parse a number back out of a URL.
The record card still names where the change goes from the repository's `host` ("goes in on GitHub", "goes in on git.example.com").
Settings → Projects names no place on a project's line in the list, which says only how a project differs from a new one; the Where it lives field in the repository's Details on the project's page shows the address, and stays empty on a project kept on this Mac: the captain's constraint is that a forge is never required.

The first mate reads the same facts (git integration PR 1.3).
Its context block's `lives` fact is the host's kind from the origin, and - only where the project's changes go there - the app's sign-in on it, from `ForgeSignIns.signInOn`: `github (signed in as octo)`, `github (not signed in)`, `github (GitHub no longer accepts the sign-in)`, `github (signed in as octo; not reachable just now)`; a plain host names its address (`git (git.example.com)`), and a project kept on this Mac is `none` or, when it has a host but its work goes straight in, the bare kind with no sign-in at all.
`crew_status` names where each task's proposed change goes as `goesIn` using `forgePlace`, and omits it wherever the work goes straight in.
Every other string the host writes about a change names the project's own host, never GitHub by default.

## The fence

Everything outside `src/core/forge/` imports `src/core/forge/index.ts`.
The provider files under `src/core/forge/providers/` are fenced by Biome `noRestrictedImports`: only `src/core/forge/` itself may import one, the seam and the home's forge wiring among it, the way Pi is reached only through `src/core/pi/`.

## Evidence

`src/core/forge/providers/*.test.ts` (the REST forge, the device flow and the open-changes read against a local HTTP stub, and a GitHub Enterprise host's API addresses and its pull request under `/api/v3`; the plain host against real repositories and a bare remote), `src/core/forge/signIns.test.ts` (the store's modes, the five health rules, the health log across a restart and a sign-out, a short-lived sign-in against a scripted GitHub - renewed at the next start after it ran out while closed, ahead of its end, on an early 401 and before a forge request, one renewal at a time, `needs_reauth` only on a refused renewal, `unavailable` when the renewal cannot be asked, never over a sign-out - every way a code ends, the git helper over the store's own file, and a key sign-in to a host on the person's own server - kept with its kind and git user name, refused, unreachable or not that kind of server with nothing kept, known from a project or by its `.ghe.com` name, its health and sign-out), `src/shared/forge.test.ts` (known hosts and typed addresses), `src/core/workspace/repoRegistry.test.ts` (stamping a known host's projects, never back), `src/core/workspace/forgeAuth.test.ts` (the refusal keyed by a known host), `src/core/hostEnv.gitSignIn.test.ts` (real git - the search path's and, on a Mac, the app's own - against a local HTTPS host: the helper answers with the app's sign-in and a helper in the person's own git config never does, and a host signed in since the helper was named answers with its own git user name), `src/core/workspace/git.test.ts` (the app's git resolved, run by the host and first in a crewmate's shell, the system git without it), `tests/e2e/app-git.spec.ts` (a crewmate's `git status` on a launch whose search path holds no git at all), `tests/e2e/run-work.spec.ts` ("a Mac with no git of its own": the work mode's join, clone, crewmate's shell and work brought home on a search path with no git), `src/core/orchestrator/changeChecks.test.ts` and `changePublication.test.ts` (the change delivery over a fake forge, `open_change` and `check_change` included), `src/core/orchestrator/changeChecks.watch.test.ts` (the check watch's arming and read, a finished reading recorded once until its state changes), `src/core/orchestrator/checkWatch.test.ts` (the watch's minute-then-two-minute reads, its bound, a hiccup and a refusal, a change gone, a newer reading or a close while a read is out), `src/core/orchestrator/mainCheckWake.test.ts` (a standing baseline wait given changed default-branch observations without a host readiness judgment), `src/core/orchestrator/crewWatch.git.test.ts` ("the host's check watch": pending then green or red is one finish wake and no model turn between, a failed check while others run is one early wake, a new push re-arms for the new head, a host without checks is never watched, a restart mid-watch still wakes once, a task idle behind another task neither read nor recorded until that work closes), `tests/e2e/forge-seam.spec.ts` (a plain host), and `tests/e2e/forge-signin.spec.ts` (the sign-in in Settings -> Integrations against a local GitHub stub - code shown, cancelled, refused, expired, approved; the first mate's listing; a crewmate's `open_change` and the captain's put-in; GitHub refusing the sign-in, the one card and signing in again; a project kept on this Mac naming no host; signing out, the health log's dated lines for all of it, a real quit and start bracketing the sign-in on file, and a short-lived sign-in renewing itself when GitHub ends it - one code exchanged once, no card, git's helper answering with the renewed sign-in; and a GitHub Enterprise host the app has never seen, signed in by keys alone with a key it first refuses, its projects then GitHub projects in the first mate's facts, listed through its `/api/v3`, git's helper answering it with the key, and a crewmate's pull request opened, read and merged there).
The stub hands a code's sign-in over once and spends a refresh token once, as GitHub does.
The direct-pr specs (`rigor-standard`, `rigor-reviewed`, `autonomy`, `settle-effects`, `honest-settles`) run on the same stub (`tests/e2e/githubStub.ts`).
A computer's own sign-in is `src/core/helper/signIns.test.ts` (GitHub's device flow on the computer against a stand-in GitHub, its store, its git's environment, its health and a sign-out from here, a stopped or expired code; a GitHub Enterprise key and a GitLab browser code on a stand-in server), `src/core/placed/placedSignIns.test.ts` (a GitLab project's task held for that computer's own sign-in) and `tests/e2e/device-sign-ins.spec.ts` (Settings -> Integrations against this stub, Settings -> Projects holding no sign-in, a GitHub Enterprise key typed by keys, with the computer in the test's own process and git's helper answering with its sign-in).

## Notes moved from AGENTS.md

Moved verbatim from `AGENTS.md` on 2026-09-24; `docs/README.md` lists this page.

- The forge seam (git integration PRs 1.1-1.3; `docs/forge.md` is the one home): everything the app asks of where a project lives - a branch's open change, its checks, put it in, close it, what it is called - goes through `src/core/forge/index.ts`; the provider files under `src/core/forge/providers/` are Biome-fenced to `src/core/forge/`, the seam and its home wiring (`homeForges.ts`).
  A repo's `host` (`RepoView.host`, migration 40) is stamped from its `origin` by `forgeOf`.
  GitHub is the REST `GitHubForge` with the app's OWN GitHub sign-in (PR 1.2: OAuth device flow, `userData/forges/<host>/` 0700/0600 beside - never inside - the account vault, health on the supervisor's tick where GitHub's 401 is the proof, one `card-forge-<host>` card; the app's own code never runs `gh` or reads another program's sign-in; a crewmate the captain asks to run a program runs it), and GitLab the REST `GitLabForge` with the person's browser or key sign-in; every "Not signed in" answer is a refusal whose ways are the sign-in and keeping the project on this Mac, and crewmates open and check changes with `open_change`/`check_change`; Bitbucket the REST `BitbucketForge` with its key sign-in; a plain host has the working copy sent up as a branch, reads green with zero checks, and is put in by a never-forced fast-forward push; a project kept on this Mac has no host.
  Surfaces name a change by the recorded `changeLabel`, never by parsing a URL, and name a host only on a project whose changes go there - a forge is never required.
  The first mate reads the same (PR 1.3): the context's `lives` fact carries the app's sign-in only where a project's changes go to that host, and `crew_status` names it as `goesIn`.

### Names on changes and save points

The app checks new save-point subjects and change titles against the active naming runbook's rule before opening and putting in a change (`docs/runbooks.md`, Commit and PR naming); it holds no form of its own.
The built-in Commit and PR naming runbook asks for `type(scope): summary` or `type: summary`: the scope is optional and open-ended, the types are `feat`, `fix`, `chore`, `test`, `refactor`, `docs` and `perf`, and a breaking change uses `!` and the `BREAKING CHANGE` footer in its description.
A runbook that replaces it decides all of this instead, and with no naming runbook on no name is checked.
An existing change's current title on GitHub, GitLab or Bitbucket is checked again when it is put in; GitHub receives an explicit merge request naming the way the project allows, with that title and description (a rebase merge writes no commit of its own), GitLab a squash or merge commit whose message is the title, a blank line and the description, and Bitbucket a squash, a rebase merge or a merge commit, as its main branch allows, whose commit message is the title, a blank line and the description.
The app does not rewrite older commits; incoming commits are checked relative to the common base.
For a change it opens or puts in, that base is measured from the fetched `origin/<default>` when it exists, so a local default branch this Mac has not pulled never makes merged commits look like the branch's own.
Merge commits are skipped: git names them, and they bring in no work of the branch's own.
Plain Git and local-only delivery validate incoming commits before fast-forwarding, including reviewer work.
The app cannot intercept a raw push from a terminal; this is not a hosted required check.

## Saved change stories

Every new branch-based change and its merge card read one immutable `ChangePresentation` revision (`src/shared/changePresentation.ts`), including GitHub Enterprise, self-hosted GitLab, plain Git and local-only delivery.
`prepare_change` validates the crewmate's publishable prose and selected inspected files without displaying a card, uploading bytes or opening a PR.
A hosted story is read by everyone who can see the project, and by anyone when the project is public, so the crewmate writes it for a stranger (INF-2142).
`PUBLIC_WRITING` (`src/core/prompts/publicWriting.ts`) is that rule's one home in the crewmate core, served once on Pi and on Claude, and covers everything sent where the project lives: stories, descriptions, commit messages, comments and releases.
It keeps out the captain's own setup by name, keys and what they reach, addresses, paths, clock times, time zones, other projects, task keys and the captain's words; a local-only project's story, shown only on its merge card, is exempt.
`publishable: true` is the author's declaration that it read the story once as that stranger, and the prepare answer names the destination's visibility it read (`storyAudience`, `src/core/orchestrator/changePublication.ts`).
When the project's visibility changed since its newest revision was saved, the next revision is prepared at the visibility read now, so the author declares it publishable again for that audience; the host, project identity, full name, format, media and Before base must still match (`sameProjectAnyAudience`, `src/shared/presentationDestination.ts`).
Every publication check still compares the audience: a saved revision is never published, confirmed or shown at a visibility other than its own.
The one exception is a change already approved on its pushed branch whose project only became readable by more people: its batch's pull request carries its story at the audience read now, and an accepted repair confirms it again there, since its words were already written for a stranger (`widenedAudience`).
A first revision's Before base must be a commit in the project that its version descends from, looked up in the project's folder beside the version (`ChangePublication.startingCommit`); a later revision keeps the first base.
A saved base is the one exception when it names no commit there, such as a full id mistyped from a short one: the next revision may name a base its version descends from instead (INF-6536).
Each refusal says which differs, the Before base or the project; where the version itself has not reached that folder, nothing is looked up.
The saved story is a soft hold (`story`): when the captain's recorded override passes it, a new pull request takes `body` instead.
The same override passes the story at the merge, ordinary or past the branch rules, at the version it covers (INF-1365): the merge goes without a current published story, while its checks, review, approval, version and the host's rules still hold.
It marks no story published, uploads, refreshes and rewrites nothing, and is read after the merge's last wait, so an override taken back before the send holds the merge.
A merge card that names a story revision still needs its destination's current readiness: a hosted description published and read back, a pushed plain branch confirmed, or local committed work checked.
New stories use version 2: the same title on the card and pull request, named by the naming runbook, up to two short Why sentences, five change bullets, one Before and After sentence, and six typed `checked` facts (`check`, `result`).
The story's words ask for less than those counts allow: one Why sentence, change bullets of one clause naming what a person gains, and a Before and After carrying any measured number; commands, file names and counts go in folded verification.
Aim for 150 open words on the card and 250 on the pull request.
The zod schema carries the captain’s selected item counts and refuses past them; the author owns sentence length and word targets, with no invented per-sentence character refusal.
The `story` parameter's own description (`PREPARE_CHANGE_STORY_DESCRIPTION`, `src/core/pi/forgeTools.ts`) says the item counts, that `base`, `head` and every `captureHead` are full commit ids, that a later revision keeps the first base, which version Before and After media name, when `layout` adjacent applies, what a view's `map` is ("A map view" below), what each After picture's `faults` answer is, what `whatChangedPart` is ("A free-form part" below), and who reads the story and what `publishable` declares, because no served schema carries those relationships or counts: the served `story` leaves its lengths and item counts to the parse (`zodParameter`, `docs/orchestrator-contract.md`).
Every After picture or poster carries `faults`: the crewmate's answer, for that final take, to what a person using the view would call wrong, `[]` when nothing (INF-3814's direction B).
Each fault names its cause: `change`, `before-change` (there before the change, filed by the follow-up rule when it is a real defect) or `chosen` (what the captain's words or an approved plan chose).
Preparation refuses the story while any fault's cause is `change`, so the crewmate fixes it, takes the picture again and answers for the new take; the host judges no picture and reads only the declared cause.
The answer stays with the `prepare_change` call on the task's record: the saved story keeps no `faults`, so the merge card and the pull request show the fixed pictures with no list, and the work order to the home is unchanged.
When a live validation record exists, the author supplies `validationRows`: one public scenario and evidence account per scenario id, exactly once.
Preparation fills the recorded order, results and live counts from `liveValidationSummary`, never from those public words, and refuses missing, repeated or unknown scenario ids.
The open Live validation table starts Checked on both the merge card and the Markdown description, with Scenario, Result and Evidence columns; live is part of Result.
Checked facts cover only checks and review outside those scenarios.
A merge card's Evidence cell opens the retained pictures in the picture viewer, and names each retained transcript by one line, its name and size, that opens it in the log reader over the card (`validationCard`, `src/core/forge/presentationValidation.ts`; `docs/card-authoring.md`, "Proof logs"): a transcript's text never rides the card.
The public description contains only the author's evidence sentence and uploads none of those files.
Preparing a story and completing its merge card both measure the card as the window will receive it (`cardSizeRefusal`, `docs/card-authoring.md`, "The size check"), and a card past the window's limit is refused to the author with its size, the limit and each part's size, before anything is saved or shown.
Awaiting live validation and No running surface show their line without a table; no-surface includes the reviewer's reason.
A story prepared before acceptance must be prepared again before its merge card can show, while older-format stories and changes with no record keep their existing presentation.
`verification` keeps commands, file names and counts behind How it was checked on both surfaces; nonempty unfinished work folds under Not done.
The card keeps its risk radar; the pull request gives one line naming dimensions above low and folds the seven-row assessment.
Empty required-action and unfinished sections, a frozen checks status and story/version stamps are absent.
Authors never put code versions, hashes or revision numbers in prose, captions, alt text, verification or project text, even folded; this is instruction only, with no prose refusal or redaction.
Capture versions and applicability remain retained data, never rendered on new stories.
Before media name the story's base and After media its head; a picture truly captured on another version keeps that version as its `captureHead` with an applicability declaration saying why it still shows that state, so an older Before picture keeps its true source while the base stays the original comparison, and nothing is relabelled (INF-2660).
Version-1 saved stories keep their rendering; already published descriptions are not rewritten automatically.
Changed views have Before and After media; new views have only After; an invisible change has no views and an explicit no-picture reason.
Under Before and after, each changed view pairs its Before pictures with its After pictures, with one caption per view.
On the card, each view's caption sits above its own boxed table: a changed view's header reads Before and After over its two columns, and each row holds the matching pictures, the first beside the first; no label sits under a picture.
A new view carries After evidence only; on the card its own table is headed by the New tag, two pictures to a row for an adjacent view and one otherwise, and in the pull request its heading reads New.
A recording sits in the card's table as its poster and Play button.
In the pull request a view containing a recording stacks, because GitHub's and GitLab's native players ignore the requested width and overflow a two-column table.
Version-1 stories retain the author's optional adjacent grouping within each state.
The author judges relevance, safe publication and continued applicability; the host checks the typed relationships and byte identity, never natural-language intent.
Meaningful drawn figures need inspected raster exports; arbitrary card HTML, interactive controls, host chrome and private threads are not exported.
Public project-template text and issue references are supplied as `projectText` outside the generated region on the first publication; after it, `around` changes those words (below).
A saved story's squash commit message is its plain `whatChanged` summary, followed by each footer the naming runbook's `footer` pattern finds in the current surrounding project text; the built-in's finds a `BREAKING CHANGE:` (or `BREAKING-CHANGE:`) footer and its continuation lines.
That text begins as `projectText`; the merge preserves a footer the person later adds outside the verified story region too.
Both ordinary and rules-skipping merges use that summary, never the rendered story's markers, escapes, tables, evidence URLs or risk chart; legacy descriptions keep their existing delivery.
A merge the override passes squashes under the description's own words around this task's story region instead, any footer included, since the story may describe an older version.

### A map view

A story may carry one map view: the change view of the Advanced architecture runbook's map part (`docs/runbooks.md`), which its skill has a crewmate in a mapped project add when its change moves something on the map.
The view's `map` names a JSON file in the working copy or the evidence folder holding the part's filled data block, with at least one comparison; preparation reads it, refuses a file that is not such a block, such as a single map file, and saves it packed, deflated raw and in base64, as the part reads a packed block.
The packed map counts toward the story's 60,000-character limit.
A map view is kind changed with no Before and one After picture, the drawing as a page with the app's colors photographed (`parts/map-page.html`), and it stands beside the story's other views, or beside its no-picture reason, since it draws the project's parts rather than a screen.
On the merge card the host fills the part the runbook ships with the packed block under the view's caption, so the captain goes in and out of each part, turns the comparison on and off, steps through each change with the arrows under the drawing and opens the map full screen, live on the picture viewer's surface at the place, comparison and choice the card shows, which the card takes back when it closes; the runbook's switch does not matter, and a card whose part cannot be read shows the picture.
In the pull request, which cannot run the part, the view's heading is its caption and its picture follows it.

### A free-form part

A story may carry a free-form part: the crewmate's own account of what changed, as HTML, which the merge card draws under What changed in place of the `whatChanged` bullets.
It follows the card rules' picture-first default: a figure or picture of each change, one sentence beside each, and the rest folded in `<details>`.
`whatChangedPart` names its file, in the task's card body folder or by an absolute path in its evidence folder; preparation reads it as emit_card reads a `body_file` and checks it as a card body, with the figure-type and escaped-markup checks.
It refuses a part with a question, field or button, since the merge card's only answer is the app's merge action, and a part that loads a font.
Each picture or recording the part names by its path is checked and kept as a card body's are, saved among the story's media and named in the part by the story's own copy; the merge card names the card's copies instead.
The saved part counts toward the story's 60,000-character limit, and a changed part is a new story revision.
The pull request and the squash message keep the `whatChanged` bullets, because a description cannot run the part and the commit needs words; the part's pictures are never uploaded.
A crewmate that wants a drawing in the pull request adds a picture of it as a view.

### No-mistakes' attestation

A passed independent review with live proof it accepted counts as no-mistakes (INF-1793, the captain: "it's my intended design to have infinitary's careful rigor be counted as no-mistakes in those PR enforcements"), whatever the care's name (INF-1876).
A github.com story whose records cover its version ends its own region with no-mistakes' signature line and v1 pipeline attestation (`src/core/forge/pipelineAttestation.ts`), the markers byte for byte as no-mistakes writes them, so its `require-no-mistakes` check passes the pull request.
For a story prepared with accepted live validation, the stamp also carries `live_validation {verdict, live, total}`: live counts only passed live observations without unproven claims, and total includes supplementary scenarios.
The attestation names the story's version, which is the pull request's commit, and marks review, test and document completed, with a `producer` field the check ignores, then one line naming Infinitary's independent review and the live validation it accepted.
The host writes it only when the records cover that version, read when the region is written (`attestsAt`, `src/core/orchestrator/changeContext.ts`): a review that passed there gives review and document, since the reviewer's brief also judges the documents, and live validation a review there accepted gives test, including an earlier run that review confirmed its version's difference does not reach (INF-2672); Careful's guidance is what asks for both, and the host holds nothing on them.
A captain's override completes neither step, and a story with no such records, GitLab and older descriptions carry neither line.
A push moves the pull request past the attested version, so the check fails until the story is published again at the new version once a review of the update passed; the refresh before a kept merge of an accepted repair reads the records the same way.
Every live attestation prefix outside the region, in project text or a person's words, is made inert the way no-mistakes does, so the check reads only the app's.

`stageChangePresentation` reuses the card media reader and retains exact validated files in the task's card-media folder, outside its working copy and temporary folder.
A recording keeps its inspected local poster and must be a playable silent H.264 MP4 below 10,000,000 bytes; it is never silently replaced by a still or GIF.
The existing image, total-size, duration and resolution limits still apply, and no conversion happens silently.
`TaskService` owns the revisions, attachment states, branch/local completion binding and last complete hosted publication in `TaskDelivery.presentation`.
Only the newest revision and the last complete revision remain (or the unresolved opening revision while its outcome is unknown); replacing them removes their otherwise unreferenced copied media, while receipts remain reusable.
Each receipt is scoped to the host, numeric project identity, full project name, visibility, content digest and media type.
The paired computer transfers retained pictures and recordings through the existing picture and chunked-media routes before asking the home to prepare the story.
`CHANGE_PRESENTATIONS_SINCE` gates that tool on work computers; an older computer must be updated before opening a new github.com pull request or gitlab.com merge request, rather than bypassing the publication barrier.
A computer that restarts on a contract that speaks it is given the tool on the conversations the home reopens, without the home restarting.
The home opens the PR using its own sign-in; no sign-in moves to the work computer.
The work computer discards its staging copies after transfer; the home retains the newest and last published story copies.
A refused preparation discards unretained staging copies even before host or legacy-PR validation, or when another story operation is running; it never removes that active operation's files.
Merge cards receive independently named copies of the validated media in the task's `cards/` folder, so later story pruning leaves shown cards and their history intact.
A staging refusal removes every newly minted picture and recording, and a refused merge card removes its new copies unless the card was already persisted.
When the stored copy a saved story names is gone, the home keeps it again from another file in the same task's folder with the same extension, size and SHA-256, such as an earlier card's or revision's copy (`restoreKeptCopy`).
With no identical copy left, the refusal names the view and side the picture showed and asks for the story to be prepared again from the picture's original file, whose bytes still pass the kept Before comparison.

`open_change` takes the prepared `presentation` revision instead of `body` for a new pull request, merge request or plain branch; local-only work skips that call.

#### The one call to the merge card

`show_merge_card` (`src/core/pi/forgeTools.ts`, INF-3717) takes a crewmate from its committed work to the saved-story merge card in one call, walking fixed steps in order (`src/core/orchestrator/mergeCardSteps.ts`): work committed, story words, branch pushed at that version, review and live proof at this version, pull request open, story published and read back, checks passed, no open waits, card shown.
Its optional story refers to the full shape served on `prepare_change`, and both calls validate it through the same story parser before staging.
It resolves the change once, on the branch the working copy has checked out.
It does the app's own steps itself: it prepares the story it was given at the committed version, prepares the same words again once live proof was accepted since the story with the same scenarios, opens the pull request with the story or publishes it on the open one, and reads it back.
A change that joins a batch of the person's own opens no pull request: the call confirms its story on the pushed branch and reads that branch as the change, as the card call and `check_change` do ("Batches of your own").
It stops at the first step someone else supplies, and its answer names what it did, the missing step and who supplies it: the crewmate, the reviewer through the first mate, the first mate, the captain or the checks.
The live proof step is the soft hold `proof` (`docs/delivery-rigor.md`, "The holds"): the captain's recorded override that passes `proof` at this version passes it, and the card then opens from the story with its validation table as the record reads, awaiting proof included (INF-3883).
A pull request that carried the story and closed without merging stops it; it neither reopens nor replaces that pull request.
One that merged outside the app shows its merge card with the story it merged with, as below.
A failed read of the pull request stops the call before the story step, and the answer says the story words it was given were not saved, so the crewmate passes them again: words saved while a merged pull request cannot be read would be a newer revision than the one it merged with.
Called again it repeats nothing: the same words at the same version add no revision (`prepare`'s `reuseSame`), and a story published at the shown revision is not sent again.
The card is today's saved-story merge card with the one merge action the call builds itself, under the id the crewmate gave, revising its open card there; once the captain answered a card under that id, it goes up under the id with a numbered suffix (`CrewmateCards.showMergeCard`).
A crewmate on a computer that runs work is served the call as one here is (`docs/helper.md`).
The native GitHub attachment capability checks destination identity, public/private/internal visibility and write/maintain/admin permission before each upload.
It sends raw bytes once to `https://uploads.github.com/user-attachments/assets`, with the short names `recording.mp4` or `picture.<format>` and the app's own sign-in; it refuses redirects, unsupported credentials and non-native returned URLs.
In unpackaged tests, the existing API-base override also routes attachment uploads to the local GitHub stand-in, which retains and serves the actual bytes; packaged builds keep the native upload origin.
GitHub shows an upload's name above its player, so the name is readable and never contains a source path or content hash.
The digest still owns receipt identity; changing the display name never resends a confirmed attachment, whose original hosted name stays unchanged.
Recordings always use bare attachment-URL paragraphs, not HTML video elements, so GitHub supplies its native player and rewrites private media to signed, temporary links.
An HTML `video src` would stay unsigned in a private project and require a signed-in viewer with access; the renderer does not emit that form.
Internal projects use the same sign-in-gated native media as private projects; the exact visibility remains in receipt identity, so a story at a new audience uploads its files again under receipts for that audience.
Saved receipts keep canonical GitHub attachment URLs, never the temporary links GitHub renders.
On a native-media host, every selected file must have a confirmed receipt before the PR opens, including a draft, or an existing story is replaced.
Before uploading, the complete rendered description must fit the host's limit - GitHub's 65,536-character body, GitLab's 1,048,576-character description - including escaped prose, attachment links, project text and preserved human words.
Sizing uses an address of each native receipt's own length without treating it as a receipt or publishing it.
The publication barrier rereads the committed and pushed head, destination and retained hashes after uploading, and rechecks the final body size in case a person added text during the uploads.
Raw JSON gateway writes cannot create an own-project PR or replace this task's saved description around that barrier, including percent-encoded paths, trailing slashes and the issues alias.
No setting, repeated publication approval, evidence commit, public-storage fallback or Infinitary-hosted fallback exists.
An access or validation failure before sending is a failed upload, not an uncertain write.
An upload's 401 is a sign-in only when the host also refuses the key itself (GitHub's `GET /user`, GitLab's own 401 check); a key it still answers for makes the refusal a permission.
A refused or uncertain upload reaches the crewmate in its own words, never as a reminder to push the branch; a permission refusal keeps the write-access note and its blocker words.
A write whose response is lost stays uncertain across restart and is never automatically replayed.
A matching PR body can resolve a lost publication response even after a later push; that confirmation retains the earlier demonstrated version and cannot qualify the new version for completion.
GitHub offers no supported attachment lookup by digest for a lost receipt; the tool names the uncertain digest and discloses a possible orphan rather than inventing a URL or claiming absence proves failure.
The crewmate shows that disclosure on a card, and only after the captain chooses another attempt sends that digest in `recovery.retryUploads`; the receipt retains the possible-orphan fact.
An uncertain opening is read first, then an explicit `recovery.retryOpening` can resend when no open PR exists, relying on GitHub's one-open-PR-per-head-and-base constraint.
That deliberate retry also permits preparing a newer version while retaining the prior opening receipt, so a late first response or duplicate-opening refusal is reconciled rather than mistaken for a legacy PR.
If an uncertain replacement left the exact last published region in place, the host restores that confirmed state and a deliberate later `open_change` retries its idempotent replacement.
A closed PR stops publication without opening another; the captain may finish the task or deliberately reopen that same PR where the project lives.
A PR that merged outside the app carrying its published story takes no new story either: its merge card shows the story it merged with, at the version that merged, and `show_merge_card`, or `emit_card` with that revision, puts it up without preparing, pushing or publishing anything (`mergedStory`, `src/core/orchestrator/mergedStory.ts`, INF-3799).
Its click sends nothing and closes the task as merged, as the shared watcher does once the card is up and nothing else is open.
A PR that merged at a version its published story never reached, or after a newer story revision was prepared and never published, has no merge card: the refusal says so, and the crewmate reports the merge for the first mate to close the task.
A working copy at a later commit than the merged version is told to check that version out, since later commits need a change of their own.
Each refusal on the way to the merge card names the one thing missing (INF-3717): an older story revision names the branch read and its newest revision, a merge card with no open pull request names the checked-out branch, a saved-story merge card names each field it refused, and live proof that is not accepted names which part fails and who supplies it - no run of the current scenarios, no review at this version, code not cleared, coverage incomplete, or a review verdict that differs from the run's.
Only proof accepted after the story was prepared asks for the story to be prepared again.
A task whose pull request was opened before saved stories and has since closed forgets it: its next `prepare_change` and `open_change` start a saved story like any new task, and only a pull request still open for the branch is refused as predating them.
One that merged outside the app stops there like a merged published story: nothing more is opened for it.
Hosted files can outlive a failed or abandoned opening, and local cleanup never deletes them.

New stories print no publication-time checks status; the host's live checks strip remains authoritative.
If checked facts change after publication, the author updates them and verification in a new story revision and deliberately republishes it before offering completion.
A push alone is not such a change: when a pull request moves past its published story, the host republishes that story at the pushed version itself (INF-2509, the captain's answer 5 on INF-1868: "The host republishes the declared story at the new head itself and refuses nothing; the merge still carries the story you saw").
The republication is a new revision with the same words, the same confirmed attachments and the content hash the merge card binds; it records the revision its author published as `refreshOf`, and After media without an applicability declaration gets one saying it was captured on an earlier version.
A merge card names the author's revision or the republished one; the card offers, and the merge click checks, the republished one (`ChangePresentations.atPushedVersion`).
The author vouches for the story at the code they committed, so the merge card first needs the committed code to be the pushed version; the refusal says to push and show the card again.
A merge reads the pushed branch alone and republishes a story a push left behind before it sends (`republishMoved`), except where a kept approval covers another version.
Only the newest story is republished: a newer revision its author prepared and never published is theirs to publish, and the merge card and the merge are refused until they do.
Those refusals, the refusal of an ordinary body on a saved-story task's merge card, the refusal of a merge card with neither body nor `presentation`, and the `presentation` rule itself each name the way out (INF-961).
The completion refusal names the revision and the versions from the ledger; the merge path's refusal reaches the captain, so it keeps its own words and names no tool.
A local-only story and a plain branch's story keep no description to republish, so a later commit there still needs a newly prepared revision.
Evidence: `changePublication.stories.test.ts` ("republishes the published story when a push follows its publication", "republishes a story a push left behind before a merge with no kept approval"), `changePresentations.test.ts` ("republishes the published story at a pushed version with its words unchanged"), `cardTool.test.ts` and `crewmateCards.completion.test.ts` (the two card refusals and the republished offer).
A replacement keeps the original Before base and evidence; After needs fresh captures or an explicit applicability declaration for the current committed version.
Confirmed receipts are reused after restart without another upload, while an open PR keeps its last complete story until the replacement is ready.
The generated region carries stable markers and a last-published hash; replacement normalizes CRLF to LF, preserves the surrounding words, and refuses edits inside it.
The refusal returns the edited region as data: the crewmate shows it beside the saved story on a card, then passes that exact region as `recovery.replaceRegion` only after a republish choice.
Missing or duplicated markers make the whole current description the review text, including an empty description.
After that exact-text-bound choice, the host removes only this story's marker comments, preserves all existing prose (including the old unmarked story) and appends one restored generated section.
A newer edit refuses the earlier choice; no ordinary raw body write through either `pulls/{number}` or `issues/{number}` bypasses this boundary.
Neither GitHub nor GitLab supplies an atomic conditional description write, so the adapter rereads before and after writing; a simultaneous human edit can still race those reads.
The read after a write compares only the generated region, the one text the app owns, so words a person adds around it, or template lines the host removes, do not make a confirmed write uncertain.
An ambiguous PR write is reconciled by branch, PR number when known, and exact generated region before any further write; a later push does not prevent confirming the earlier write.

A replacement keeps a version-2 story's title as the change's title too, the one its squash merge uses (INF-717).
When the change still carries the title the app last left there, the story's new title goes in the same conditional write as the description, and on GitLab a draft keeps its `Draft: ` marker before it; the answer names the new title.
When a person renamed the change, nothing is sent, checked before any upload and again just before the write, and the answer quotes the change's title, the story's and the one the app last left.
The crewmate then prepares the story with that title, or asks the captain on a card before setting the title alone with `github_write` and publishing again.
A rename that races the write is answered once the story is confirmed, as the words around it are, and the next publication treats it as a person's.
Each publication records the title it leaves; one recorded before that counts only its own version-2 story's title as the app's, and answers any other as a title the app has no record of setting, as on a pull request whose earlier republication kept its opening title.
A version-1 story never renames its change.
Evidence: `tests/githubStub.test.ts` ("a saved story's title through the real GitHub forge and the stand-in"), `tests/gitlabStub.test.ts` (a draft renamed and squashed under the new title), `changePresentations.words.test.ts` ("the title of a republished story": the races and older records), both forges' tests (the write itself) and `changePublication.stories.test.ts` (its answers).

`open_change`'s `around` changes one passage of the words around a published story on its open pull or merge request, such as an outdated summary or a `BREAKING CHANGE:` footer the squash reads, while the story stays as published.
`from` is the passage exactly as the description shows it, found once above or below the story, and `to` replaces it in place; an empty `from` adds words only where nothing surrounds the story.
With the published revision, the host sends that published region, its content hash and its receipts byte for byte and uploads nothing; with a newer revision, the newer story is published in the same write.
A passage that is not there, because someone changed it since the crewmate read it, or that appears more than once sends nothing, and the answer quotes the words as they read now; an edit inside the story keeps the refusal above.
On GitLab, a line of the new words that starts with a quick action escapes its slash like the author's prose, because only the captain's click merges.
The read after the write confirms the story by its region as before; when the words around it differ from those sent, the answer says so rather than claiming them.
Before the first publication there is no description to change, so the words go in `projectText`, and a pull request without a saved story takes `body` instead.
A home before `STORY_AROUND_SINCE` (10.1.0) would drop `around` and answer as if nothing was asked, so a work computer refuses the call to it and sends nothing.
Evidence: `presentation.test.ts` and `changePresentations.words.test.ts` ("the words around a published story"), `changePublication.stories.test.ts` (open_change's answers) and `sessionHost.test.ts` (the older home).

Missing or mismatched evidence holds the merge card and the final own-task merge boundary independently of checks and merge authority.
The completion call gives `emit_card presentation` and one merge action, or omits actions for a note when the task merges on its own, without a second body, risk declaration or required-action list.
The shared Pi and Claude tool forwards either shape; the supervisor checks the task's autonomy before accepting a note (INF-968).
CardService still owns cards, the risk chart, requirements and merge controls; checks, independent review, autonomy and the captain's merge click retain their existing owners.
A first-mate merge card on a task with a saved story carries that story once it is published at its newest revision (INF-2490): `CrewSupervisor.bindFirstmateOffer` records the card's offer with the published revision and content hash, so its click passes the same story gate as a crewmate's merge card and the merge reads the same story.
Before that publication CardService refuses the card before creating or revising it, and the refusal points the first mate to steer the crewmate to publish its story or emit its own merge card.
Every merge offer, the crewmate's or the first mate's, names the change it was shown for (`shownFor`); once another change is current its click refuses, so an offer shown for one pull request never merges another.
The first mate's offer names no head, so its click approves nothing kept and is one attempt.
Only a crewmate-authored merge card counts as a replacement for a kept merge approval, including at the final merge boundary; a first-mate card restored from an older run does not end that approval.

### Description hosts, plain branches and local work

`Forge.storyDestination` reads description identity independently of `Forge.attachments`; destination comparison preserves older public-host records without the optional explicit format.
GitHub Enterprise, self-hosted GitLab and Bitbucket publish the same prose, risk assessment, checks and view descriptions, using their own description dialect and size limit; Bitbucket's dialect is Markdown with no HTML ("Bitbucket pull requests" above).
Pictures and recordings remain on the merge card; the hosted text says so and includes their captions and alt text, never local file paths or invented remote media URLs.
Native-media support is still only github.com and gitlab.com: a missing capability, failed upload or uncertain upload on either host never becomes a text-only fallback.
Text publication uses the same serial writer, committed and pushed heads, audience checks, owned-region protection, human-edit recovery, read-back and squash summary as native publication.
Raw description writes cannot bypass it on Enterprise or self-hosted GitLab either.

A plain branch records its origin as its destination and confirms the pushed head through `open_change`, without opening a request or inventing a number, description, upload or receipt.
If the branch is not yet on the host, the existing plain forge sends it from the home computer after the story, retained files and publication permission pass; an already-pushed branch needs no write.
Local-only routing reads the task's delivery policy even when the project has an origin; `prepare_change` verifies the committed head and retained files without locating a forge or requiring its sign-in.
Both keep a completion binding of revision, head and content hash, separate from a hosted publication.
Their cards use the same story renderer, radar, facts, required actions and merge line; self-merging notes use the same story and stay off the stack until their merge, then show once saying it merged (`docs/card-authoring.md`).
A newer revision or moved head invalidates the prior completion.
The offer and final merge boundary bind the story's version, never its words (INF-3623): a story revised at the clicked version lands as the newest one, and only another commit stops the click; the local land checks its retained files and committed head before dispatch.
A branch or local attempt waiting for its turn keeps the binding on its existing pending-settle record, so a restart never takes a later commit as the approved one.
A plain branch still fast-forwards the remote default branch without force; local-only still merges locally, without a remote push.
Neither acquires a hosted request number or the kept-approval repair lineage that requires one.
Evidence: `changePresentations.test.ts` and `tests/e2e/story-destinations.spec.ts` drive the four destinations through preparation, publication or local readiness, cards and their existing merge owners.

### On gitlab.com

A gitlab.com project's forge offers the story through GitLab's own project uploads (`providers/gitlab/attachments.ts`); a self-hosted server has no native-upload capability and publishes the text as described above.
Its destination is read from `GET /projects/<encoded group/subgroup/name>`: the numeric `id`, `path_with_namespace` (nested groups kept whole), `visibility`, and the key's role where GitLab lists it.
A role GitLab lists below Developer is refused before sending; an inherited role it does not list leaves the decision to GitLab's own answer.
Each upload rereads that project and sends the exact retained bytes once as multipart `file` to `POST /projects/<numeric id>/uploads`, the number the read confirmed, with the names `recording.mp4` or `picture.<format>`, the app's own sign-in and redirects refused.
A private or internal project's upload is refused, with nothing sent, unless that read says `enforce_auth_checks_on_uploads` is exactly `true` ("Require authentication to view media files"); absent, null or false never passes, because GitLab otherwise serves the file to anyone with its link.
The app never changes that setting; the refusal names it for a maintainer to turn on, and a story with no media publishes whatever the setting reads.
A confirmed receipt is GitLab's project-relative `url`, `/uploads/<32 hex>/<name>`, checked against the name sent; its `full_path` must name the same file in the same project, as `/-/project/<id>/uploads/...` or the project's own path, or the answer is uncertain.
Returned `markdown` is never used, and receipts keep only that reference, which GitLab resolves inside the merge request's project.
Pictures are Markdown images and adjacent pictures use the same table as GitHub; a recording is an image link to its MP4, which GitLab renders in its own player with its alt text, never a bare reference.
The merge request's description is replaced with `PUT /merge_requests/<N>` only after a fresh read still shows it open at the story's head with the words the publication read, and with the title it read when the story renames it in the same request; `GET /repository/branches/<branch>` confirms the pushed version.
Opening and replacing tell a refusal GitLab answered (a 4xx) from a lost connection, a redirect, a 5xx or an unreadable success, which stay uncertain and are read back, never replayed.
An uncertain opening relies on GitLab permitting only one open merge request for a source and target branch.
GitLab offers no lookup of an upload by digest either, so a lost upload receipt is disclosed as a possible orphan exactly as on GitHub.
Raw gateway writes cannot open the task's own merge request (`POST .../merge_requests`) or replace its saved description (`PUT .../merge_requests/<N>` with `description` in the body or the query string, which GitLab also reads), however the path is encoded; its other fields and other merge requests stay writable.
GitLab runs a description line that starts with a quick action (`/merge`, `/close`) when it saves the text, so every line of the author's prose and captions escapes its leading slash (`\/` reads as `/` on both hosts).
A project template's own quick actions in `projectText` are the project's choice and run; GitLab removes their lines, which the region-only read-back allows.
The squash is `<title>`, a blank line and the story's plain summary with any breaking-change footer, never the rendered description ("GitLab merge requests" above).

Evidence: `providers/gitlab/attachments.test.ts` (the multipart upload, media protection, identity, role and returned-reference rules), `providers/gitlab/gitlabForge.test.ts` ("saved-story writes"), `presentation.test.ts` ("the layout GitLab can actually display"), `providers/gitlab/gateway.test.ts` (the raw-write refusals), `tests/gitlabStub.test.ts` ("a saved story through the real GitLab forge and the stand-in": a refused private upload, uploads before the opening read back byte for byte, a lost upload answer, a restart with a person's words and the squash), and `tests/e2e/gitlab-delivery.spec.ts`, whose public and self-hosted journeys open the story and squash its summary.

Existing PRs are not rewritten into this format.
An open pull or merge request that predates saved stories takes `body` again on a later `open_change` (INF-291), on every host, and `prepare_change` points there.
The forge rereads it, replaces the whole description only while it is still open at the version and words just read, and `ChangePublication` reads it back, so the answer says what the host now shows rather than only that the change exists.
An identical body sends nothing, no body leaves the description unchanged, and the title is never renamed; each answer says which.
A refused or uncertain write, or a read-back with different words, is answered as that, and nothing is sent again on its own.
A plain Git host keeps no description for a pushed branch, and its answer says the body was not published.
Answer cards, in-place personal work and release-note hero pictures keep their existing delivery.

Preparation and ordinary publication reject tracked uncommitted changes, not untracked downloads such as `.infinitary-artifacts` archives.
The merge card reads its committed version and retained files; a hosted merge compares the remote request head with the published head, not a work computer's dirty copy or availability.
A local-only merge checks its committed branch and retained story again, without a forge read.
An accepted repair, one its crewmate declared to leave the approved work as it was, republishes the unchanged story automatically at the repaired version after checks pass, without another upload or merge card.
Approval follows the code, never the story's words (INF-3623, the captain: all non-code changes to the pull request keep the approval).
A story the crewmate revised at the approved version keeps the captain's click, a click on a card whose story was revised since merges with the newest story, and a person's edit inside the story on the host no longer holds the merge: their words stay, and the squash summary is the saved story's.
An app-owned merge waits for the newest story to be published at the merging version.
A change in line or in a batch takes a revised story's title and commit words in its place ("Batches of your own").
The steps for the captain and the follow-up tasks stay the clicked card's until a new merge card shows others.
The story's saved title, risk and required actions win on `emit_card presentation`; its title field is supplied, and body, body_file, risk and required_actions are omitted.

### Declared validation writes

A Careful builder names `github_write.validationEffect` when the write is a shared validation effect, rather than ordinary delivery.
The effect request's `forgeWrite` binds the host, method, path and SHA-256 digest of the exact JSON body bytes (absent only for a bodyless call).
A validation effect cannot accompany a release `file`: JSON-bound permission does not authorize those file bytes, so the gateway refuses without sending or consuming it.
The write gateway checks those facts at execution, also when sending a kept write, and marks its result unknown before sending so it cannot be repeated after a lost answer.
A changed call needs fresh review and consent; a refused validation check sends nothing and returns its reason.
A new request identity cannot repeat the same host, method, path and body while an earlier declared write on that task is started or unknown; the builder reconciles that outcome first.
Code clearance and the captain's action-specific approval must both be current; ordinary forge permissions remain separate.
An approved prerequisite publication names the task's own project and branch and uses a draft pull request or merge request where supported.
On a saved-story host it uses the existing publisher and attachment barrier, carrying the draft flag through the same opening rather than bypassing the story.
The publisher rechecks and consumes that authority after its preflight and before any upload; a failed preflight leaves the permission unused.
Ordinary Careful publication likewise rechecks the current proof and code clearance after that asynchronous preflight.
Once current proof and independent review pass, the host-owned `markReady` operation uses GitHub GraphQL, removes GitLab's `Draft: ` prefix or sends Bitbucket's `draft: false`; the agent-facing REST-only gateway never gains GraphQL access.
The host persists an unknown readiness outcome before sending and reconciles a later ready reading without another write.
A later still-draft reading settles that readiness attempt as not applied and permits another idempotent request, never concurrently with an outstanding attempt.
Readiness failures remain on the task record and in tool feedback without preventing check readings.
Once readiness is recorded as applied for a change number and head, a later return to draft is a person's hold: check, watch and open readings never mark that same version ready again.
Later commits on the published branch require fresh proof and review, not another prerequisite-publication permission.
These permissions do not satisfy final live proof or grant a merge (`docs/delivery-rigor.md`, "Careful live validation").
