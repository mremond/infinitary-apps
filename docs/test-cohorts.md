# Test cohorts

The vitest suite is split by what a test depends on (captain's A1, 2026-09-24).
A test that spawns real work carries a budget sized to that work; an in-memory test keeps vitest's 5 s default.

## The cohorts and projects

`pnpm test` runs every project, and so do `verify.yml`'s Linux test groups (`linux-tests`) together.
The full check's Mac unit stage runs only the reviewed files in `scripts/mac-unit-tests.ts`, through the same runner and cohorts.
Those files contain native Mac cases, Mac-only branches or real Mac readings that Linux cannot cover; mixed files stay whole.
Mock-only macOS tests need no additional Mac full-check coverage.
The captain's INF-2273 exception still requires three total local rounds for every edited unit file, including portable or mock-only files; the native list does not exclude those local rounds.
Linux keeps every file, including every probe, in test groups that name only projects and shards: no unit file moves off Linux or disappears from the full check.
When adding a case that needs macOS, add its file to that list; the scratch Keychain probes retain their existing opt-in gates.
`tests/release-workflows-verification.test.ts` uses real Vitest file discovery to check the Mac selection, its cohort assignments and its inclusion in the complete Linux suite.

Requested runs (`ci.yml`) run the same projects on separate machines, and so does a push to `main`, once, in the full check's Linux test groups (`verify.yml`); PRs omit the full unit, integration and probe sweeps: `unit-tests` runs `pure`, `unit`, `unit-isolated` and `browser`, each `integration-tests` job runs one `--shard` of `integration`, and `probe-tests` runs every file of `probe` ("Probes" below, `docs/testing.md`).
The full check's `linux-tests` job splits them across eight machines with vitest's own `--shard`: `pure`, `unit` and `unit-isolated` in three groups, `integration` in two, `probe` in two and `browser` in one, each a machine of its own (INF-2646).
The three unit groups are balanced by measured time, not by file name: `tests/helpers/timeBalancedSequencer.ts` replaces vitest's path-hash split with a longest-first packing of `tests/helpers/shardTimings.json`, the seconds each unit file took (`scripts/shard-balance.ts`, INF-2674).
A file missing from the record weighs a typical file; a run with no measured file (integration, probe, browser) keeps vitest's own split.
Each Linux test group uploads `vitest-timing-*` with its files' times (`INFINITARY_TEST_TIMING_FILE`); `node scripts/shard-timings.ts <report>...` rebuilds the record from the unit groups' reports, and a pull request that moves or adds many unit files refreshes it.
`node scripts/shard-timings.ts --reach <report>...` rebuilds `tests/helpers/reachTimings.json` from the integration and browser groups' reports: the branch check weighs the parts of a wide change's tests by both records (`docs/testing.md`, "Notes"), while the integration and browser groups keep vitest's own split (INF-5493).
`tests/release-workflows-pr-checks.test.ts` holds both layouts to every project, each in one job or in shards of one count that cover it, and the alpha's proof requires every group's complete set (`scripts/main-alpha-proof.mjs`).

| Project | Files | Rule |
| --- | --- | --- |
| `pure` | `src/shared/**/*.test.ts` | Shared contracts and math. One module cache (`isolate: false`) with per-test guards against mutated globals (`tests/helpers/pureProject.ts`). In memory, like `unit`. |
| `unit` | every other test file not listed as integration | Most files share loaded code (`isolate: false`) with the same process-state leak guard as `pure`; the module-mocking, environment/global-mutating or SDK-loading files run as `unit-isolated` with `isolate: true` (the explicit list in `vitest.config.ts`). Both use vitest's 5 s default. May not start a child process, drive real git or sleep on a real clock. |
| `integration` | the list below | Real git, pnpm, a shell, a stub executable or the installed Claude client. Eight workers on macOS, or the job's size when the Mac mini's placement service names a smaller one, four elsewhere, and no more than the computer's memory holds with the programs each file starts (`integrationWorkers`), in a group that starts after `pure` and `unit` finish, so the suite does not load the host it measures. Each file carries a budget sized to its measured work. |
| `browser` | `tests/browser/**/*.test.{ts,tsx}` | The window drawn in headless Chromium behind the shared fake bridge (`docs/testing.md`, "The browser layer"). One page per file. Its global setup boots one real core in Node for the fresh home's answers, about two seconds per run. |
| `probe` | the files of the list below that `PROBE_FILES` names | Integration files that can fail with no code change ("Probes" below). The same workers and budgets as `integration`, except on Linux: one worker keeps CPU-heavy probe subprocesses from competing with those started by other probe files. This group starts after `integration` finishes. |

`pure`, `unit` and `unit-isolated` each use `Math.max(2, cores - 1)` workers, where cores are the job's size when the placement service names one and the machine's otherwise (`scripts/job-cores.ts`): the two-CPU hosted runner uses both CPUs, and a larger machine still reserves one CPU.
They also start no more workers than the computer's memory holds at 2 GiB each, with one more share for Vitest's own process (`inMemoryWorkers`), and never fewer than one.
An in-memory worker keeps what each file it ran leaves behind, so cores alone are no bound: with ten workers on an 11-core, 9 GB Linux guest with no swap, one died in the middle of a file, and the same files with ten workers peaked at 11.2 GiB on a Mac (INF-5103).
`integration` and non-Linux `probe` runs hold to the same 2 GiB shares, each worker's share holding the programs its file starts as well as the worker: four integration workers on a 2-core, 8 GB Linux place with no swap ran the quick check's programs and the phone's generated-file checks beside Vitest's own 1.4 GiB process with as little as 278 MiB free, and a SIGKILL ended that process, most likely from the kernel's out-of-memory killer (INF-5632), so two run there.
The guard checks environment names and clock/timer identities after each test and after file teardown; it fails rather than silently repairing a leak.
Module mocks, stubbed globals/environment, and the Claude SDK's import-time `NoDefaultCurrentDirectoryInExePath` write belong in `unit-isolated`, never on an environment allowlist.
New unit files default to guarded sharing; add state-mutating files to the isolated list.


`pnpm exec vitest run --project <name> <files>` runs one project's files; use `--project unit --project unit-isolated` for the complete unit cohort; a bare file path finds its project on its own.

## Probes

A probe is an integration file that can fail with no code change, because it leans on what the runner has: SSH and Remote Login stand-ins, dns-sd, release rehearsals, the connection listener, real Playwright runs, the Claude client against a stand-in API, whole-core command-line runs and a Linux Secret Service.
Such a file fails on the runner's state as well as on the code, and catches a real problem mostly when its own subject changes (FI3-1756).
Main's full check and requested runs execute every probe; pull requests omit this job.
`verify.yml`'s Linux test groups, inside every alpha and on demand, also run them all, across two machines.

`scripts/affected-probes.ts` owns the list: `PROBES` groups the probe files by what they reach outside the code, each group with the paths it watches, and `PROBE_FILES` is every file of it.
The local chooser runs a probe when the change edits the probe itself, a path its group names (a directory ending in `/` matches what is under it), or a path of the lane itself (`LANE`: the chooser, `vitest.config.ts`, the packages and the shared test setup), which runs every probe.
A base the chooser cannot read runs every probe, and a group naming a path that no longer exists is refused, so a moved subject cannot silently stop its probes running before the release.
`ci.yml`'s `probe-tests` runs the unfiltered `pnpm test --project probe` on request, and the full check's two probe groups run every probe on main.
Locally, `pnpm test:probes` runs the probes the working copy's commits reach from `origin/main`, and `node scripts/affected-probes.ts` only lists them.

A probe stays on the integration list below, so the unit fence still exempts it, and `vitest.config.ts` refuses a probe that is not on it.
To make a file a probe, add it to a group of `PROBES` (or a new group with the paths it watches); the `integration` project drops it and the `probe` project takes it.

## The fence

Never relabel a test as `unit` just to run it sooner.
Migration and backfill tests use `openInMemoryDatabase()` to run real migrations, never the cloned template.
The database guard (`tests/helpers/database.test.ts`, isolated in `vitest.config.ts`) stays isolated: a warmed template breaks its fixed-clock comparison.

A failed or interrupted run is never a timing sample (`compareWorkloads`).

`tests/lint/unit-cohort.grit` refuses, in every `pure` and `unit` test file, an import of `node:child_process`, `node:timers/promises` or a product module whose one job is to spawn (`workspace/git` and any relative `git` module, `sql/forkChildProcess`, `devices/ssh`, `devices/relay`, `devices/dnsSd`), whether static, dynamic, `require` or `vi.importActual`.
A new module of that kind joins the plugin's pattern.
It also refuses an import of a test helper that drives real git (`tests/helpers/crewHarnessGit.ts`, `placedWorld.ts` and `phoneScene.ts`, and the journeys' `projectSeed.ts`, `knowledgeSeed.ts`, `usage.ts` and `savePoints.ts` under `tests/e2e/`), and a new helper of that kind joins that list.
A unit test seeds a project row with `seedProject` (`src/core/workspace/seedProject.ts`), which saves the row the registry saves and runs no git, never with `RepoRegistry.setup`, which does.
A type-only import is not a dependency and passes, and so does `vi.mock` of any of them (faking a spawn is how a unit test avoids one).
It runs inside `pnpm check` through biome.json's unit-cohort override.
It is a Grit plugin rather than a `noRestrictedImports` override because Biome replaces a rule's options per override instead of merging them: a test-file override of that rule would silently drop the Electron, Pi and Claude fences for every test under `src/core/`.

The fence sees a test file's own imports and the helpers it names.
A unit test that reached a spawn through product code (`WorkspaceService` on a real repository, say) would pass it, and so would a `setTimeout` written inside a test (a few unit tests still yield a macrotask or hold a lock open for a few milliseconds that way, and none of them asserts on elapsed time); the 5 s default is what bounds those, and the answer for a new one is the same: fake the dependency or inject a clock, or list the file as integration.
The crew and first mate harnesses' `tick()` (`tests/helpers/crewHarness.ts`, `tests/helpers/firstmateHarness.ts`) only moves the fake clock and throws on real timers, so a file that ticks fakes its timers (`fakeCrewTimersEachTest`, `fakeClockEachTest`), and a case on real timers waits on the fact it needs with `vi.waitFor`.

## The list

The integration cohort is ONE list: the `!` exclusions of biome.json's unit-cohort override (the override whose `plugins` names `tests/lint/unit-cohort.grit`).
The fence skips those files, and `vitest.config.ts` reads the test-file exclusions as the `integration` project's `include`, so a file cannot be fenced as a unit test and run as an integration test, or the other way round.

A shared process-fixture helper may also be exempted there; it is not itself a test suite.
Its process-driving test callers must still be listed as integration.
The custom CA fixture is shared by the integration trust tests and desktop/packaged probes.
The SSH server fixture (`tests/helpers/sshServer.ts`) is shared by the Remote Login integration test and its e2e journeys.

To add a test that needs a real process: write it, add its path to that override's exclusions, measure it (below), and give it a budget if the rule asks for one.
Never raise a unit test's timeout instead - a raised timeout on an in-memory test hides the dependency this split exists to name.

## Budgets

A budget is sized to measured work.
Measure each limit on the Linux machine that runs the checks.
The rule: take each test's fastest measured run; the budget is **five times the slowest of those, rounded up to a whole 5 s**, and never below vitest's 5 s default.
The investigation measured the ordinary loaded regime on the shared Mac at 1.5 to 3 times a quiet run on sequential spawn chains, so five times leaves headroom above the worst ordinary slowdown without hiding a tenfold regression.
Past about 25 times (the concurrent-suite regime the investigation also recorded) no budget survives, and none is sized for it.
On a Mac the product runs every git below the UI (`taskpolicy -c utility`, `src/core/utilityQos.ts`), where it yields to every busier process, so a long chain of them on a Mac loaded by other runs waits on that load rather than its own work, well past five times.
A file whose cases chain the product's git and are not about that clamp runs them at the run's own priority: its `vi.mock` of `atUtilityQos` goes through `tests/helpers/unclampedQos.ts`, which gives it a host with no `taskpolicy`, and its row below says "at the run's own priority".
`src/core/utilityQos.test.ts` holds the clamp itself, and `src/core/workspace/git.test.ts` keeps running the app's own git under it.

A budget lives in the file, as `vi.setConfig({ testTimeout })` for the whole file, or on the describe or test that carries the work when only part of the file spawns.
A budget holds only on a run that grades budgets, `INFINITARY_PERF_BUDGETS=1` on a quiet host (`verify.yml` with `perf`), as journeys' durations do (captain's B1, and his INF-857 choice to grade durations only on a quiet run).
On every other run a busy Mac can freeze a test's processes for seconds at a time, so a test's and a hook's limit and an `expect.poll` or `vi.waitFor` window run on the load clock, as a journey's waits do (INF-1083, the captain's choice for unit tests: "Yes, as a third piece after these two: today a stuck unit test waits with no clock until GitHub's six-hour limit").
`tests/helpers/waitWindow.ts`, a setup file of every project whose tests run in Node, starts the clock in each worker with `startUnitLoadClock` (`tests/helpers/budgets.ts`, its core in `tests/helpers/loadClock.ts`), before any test can fake the timers, and our patches to `@vitest/runner` and `vitest` read it at each limit and window.
The runner reads it as each limit starts, not when its test or hook registers, so a hook that a setup file listed before `waitWindow.ts` registers, such as `statementCheck.ts`'s and `scratchDirCleanup.ts`'s, runs on the clock too.
A frozen worker's limits stop with it, and each ends by its wall cap, 20 times its budget and at most 10 minutes, so a stuck test fails by its own message; each test step in `ci.yml` ends at 30 minutes, and each `pnpm test` step in `verify.yml` at 60, which each Linux test group finishes well inside on GitHub's hosted two-processor machine.
A worker waiting on a disk sync is not frozen: Node runs the sync on its own threads, so the worker's timer keeps its beat and the one-minute load stays low while a starved disk holds the test.
So on Linux a worker's clock also counts only the share of time in which no work on the computer waited on its disk, which `startUnitLoadClock` reads from the kernel's I/O pressure counter (`/proc/pressure/io`, `linuxDiskWaits` in `tests/helpers/budgets.ts`).
A job machine whose disk other work starves then holds a test's limit instead of failing it, and the limit still ends by its wall cap; where the kernel keeps no such counter, as on a Mac, the clock counts as before, and no other load clock, a journey's or the browser project's, reads it.
The unit clock is not `budgetTimer`'s: a helper's failure timer that a unit test drives with fake timers stays on the time it fakes.
A wait keeps a `timeout` it names, and one that names none waits for its test's budget, not vitest's one second, ending just before it so a stuck wait reports its own mismatch; a graded run gives it what is left of the budget on the wall clock.
A file sets no default window for its polls.
The browser project's page keeps the same clock under the same name, started by its first setup file, `tests/browser/loadClock.ts`.
A browser test runs in two processes, the page and the Node process that answers its commands, such as a seeded home's boot, so the page's clock ticks on a beat both answer: the page's own timer, then a reading from the command process.
A stall of either holds the beat and stops the clock, so a shared runner whose starved disk blocks the command process for longer than a test's limit does not fail the test.
One core boots at a time, so a seeded home waits in line behind the boots other pages asked first; while it waits, the command process answers that page's beat with no share of a processor, and the page's clock counts none of the wait (INF-4644).
Its waits that name no window keep vitest's one second, on that clock.
A user event, such as a click, has a limit of its own, the load time its test has left, which our patch to `@vitest/runner` gives it.
Playwright counts that limit in the command process, which keeps a load clock of its own for it, started by the project's global setup `tests/helpers/browserCommandClock.ts` and read by our patch to `playwright-core`.
`tests/browser/load-clock.test.ts` holds the command process for three times a test's limit and the test still passes, and shows the clock still reaches a deadline by the time it counted rather than by its wall cap.
It also shows a click after a held command process still has the load time its test has left, a click whose command process is held past its own limit still lands, and a seeded home that waits in a held boot line longer than its test's whole limit does not fail the test.
`tests/wait-window.test.ts` runs vitest over `tests/fixtures/frozen-work` and freezes its whole process group: a writer frozen 7 s past its 5 s budget still passes, a missing file fails at its window on a quiet run, by the cap under a frozen run and by the cap on a disk its work waits on throughout, which the load time its poll counted shows as an order of events rather than a wall-clock window, a graded run fails the frozen writer, and a setup file's hook registered before the clock starts still passes when frozen 7 s past its 5 s limit.
Each run's clock reads a disk counter the test gives it (`tests/fixtures/frozen-work/diskPressure.ts`), so other work on the computer's disk never moves its waits.
A journey's waits read the same variable but are never without a clock: they run on the load clock, capped at 20 times their budget (`docs/e2e-contracts.md`, "Waits run on the load clock").
The native phone launcher explicitly starts that same Node load clock for its failure timers, and native observations mirror it in `PhoneLoadClock/PhoneWaitDeadline.swift` (`docs/ios.md`).
The boxed Claude classifier integration opts its own process and scorer child into `tests/helpers/classifierClock.ts` (INF-1614, the captain's test-clock choice).
It drives Node's test-only timeout clock from the existing load clock, including the scorer's `AbortSignal.timeout`, without changing the app's deadlines or the runner's capped outer limit.
Performance runs leave those timers native, and the classifier's controlled-clock unit tests own the production timeout behavior.
A unit test that sends real requests through the product's own request deadlines to a stand-in server, such as the forge's workflow evidence reads in `src/core/forge/providers/github/workflows.test.ts`, counts those deadlines on its worker's clock with `requestDeadlinesOnLoadClock(unitLoadClock())` (`tests/helpers/budgets.ts`), once per test.
Each deadline keeps the length the product gave it, so a runner that stalls the worker past one does not end the request while the test's own limit holds, and a graded run keeps them native.
Such a stand-in server in the worker's own process keeps its idle connections open until the test closes them, with `server.keepAliveTimeout = 0`.
Node's server closes an idle connection by the wall clock, 6 s by default, while Node's `fetch` counts its own idle close in event-loop turns, so after a stall past 6 s the server can close a connection the product has just sent its next request on, and that request fails with a reset.
A budget an author already set above the rule stays as it was, and a test whose time is a fixed product timeout rather than load-scaled work (hostEnv's hanging-shell test waits out a 3 s timeout) keeps the budget sized to that timeout.
A file whose slowest test fits the 5 s default under the rule carries none.

| File | Depends on | Budget |
| --- | --- | --- |
| `src/core/freeze/freezeRecorder.integration.test.ts` | a worker thread watching the test's own main thread on the real clock, which the test holds busy and waiting, once after loading 30 MB of source | 10 s (Mac fastest per case 1.1 s, 1.4 s with the source) |
| `tests/scale-check.test.ts` | a record of the captain's size seeded through the app's writers (3,400 closed tasks, then 13,600), and the first mate, the crew's minute pass and the board read over it | 300 s (Mac fastest 33 s, on a loaded host) |
| `tests/browser-fresh-home.test.ts` | the browser layer's fresh and seeded homes: a real core booted twice on throwaway folders, which asks a login shell for its search path and runs git | 5 s default (Linux check slowest case 0.40 s, Mac fastest per case 0.77 s) |
| `tests/frame-lib.test.ts` | a Vite build of the frame realm's library under `NODE_ENV=development`, as `pnpm dev` starts it | 10 s (Mac fastest 2.0 s) |
| `tests/dev-starter.test.ts` | real git in a throwaway copy that `pnpm dev`'s starter moves forward and back | 5 s default (Mac slowest case 0.15 s) |
| `src/core/update/sourceUpdates.test.ts` | real git: a throwaway project where it lives and a clone of it, at the run's own priority | 5 s default (Mac slowest case 0.32 s) |
| `src/core/placed/loadLine.integration.test.ts` | real native wrappers, command processes, process groups and two-second admission/lifetime cadence | 35 s |
| `src/core/workspace/worktreePool.test.ts` | real git, real pnpm, at the run's own priority | 15 s for the file; the real-pnpm measurement test is 600 s |
| `src/core/orchestrator/changeChecks.test.ts` | real git at the run's own priority | 5 s default (Mac slowest case 0.59 s) |
| `src/core/orchestrator/changeCutover.test.ts` | real Git project setup and isolated forge | 5 s default |
| `src/core/orchestrator/changeMerge.test.ts` | real git at the run's own priority, the put-in's 300 + 900 ms backoff | 10 s (Mac slowest case 1.3 s, the retried put-in) |
| `src/core/orchestrator/changePublication.test.ts` | real git at the run's own priority | 5 s default (Mac slowest case 0.66 s) |
| `src/core/orchestrator/changePublication.stories.test.ts` | real git at the run's own priority | 5 s default (Mac slowest case 0.63 s) |
| `src/core/orchestrator/changePublication.mergedStory.test.ts` | real git at the run's own priority | 5 s default (Mac slowest case 0.32 s) |
| `src/core/orchestrator/mergeReviews.test.ts` | a real `git init` per project, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `tests/gitlabMergeReview.test.ts` | a real `git init` for the task's project, at the run's own priority, and the GitLab stand-in on a local port | 5 s default (Mac fastest of five 0.45 s) |
| `tests/mergeCardWay.test.ts` | a real `git init` for the task's project, at the run's own priority, and the GitHub and GitLab stand-ins on local ports | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/settleService.test.ts` | real git for a pure update and an edited line, at the run's own priority | 15 s |
| `src/core/workspace/naming.test.ts` | real git for incoming commit range, at the run's own priority | 5 s default |
| `tests/catalog-merges.test.ts` | real git and the message compiler in a throwaway project holding the real catalogs: two changes adding messages combined, with and without rebuilding the phone's card and panel hosts, and a change from before the catalog move brought up to date; two cases also hold the code the phone's card generator bundles and run it three times | 20 s (Mac slowest case 3.2 s); each card generator case 105 s (Linux check 20.2 s) |
| `tests/naming-replacement.test.ts` | real git: a project's, the default workspace's and the personal workspace's commits, and a task branch's, at the run's own priority | 5 s default |
| `src/core/workspace/workspaceService.test.ts` | real git, at the run's own priority | 15 s |
| `src/core/folderMove/copy.test.ts` | the system's copier on a scratch data folder, on a Mac whose disks are numbered as on another startup | 5 s default (Mac slowest per-case minimum 0.007 s) |
| `src/core/folderMove/move.test.ts` | real git, the system's copier, SQLite, a vite build and the Electron binary: the one-time move of a scratch data folder | 10 s (Mac slowest per-case minimum 0.588 s) |
| `src/core/folderMove/takeOver.integration.test.ts` | real Node processes holding a scratch older folder by its locks, `ps` on a Mac or `/proc` on Linux, and the ordinary stop and a forced one: taking over from an older copy before the one-time move | 10 s |
| `src/core/tasks/taskTemp.integration.test.ts` | a vite build and the Electron binary: a closed task's temporary folder and leftover files on a scratch work folder | 5 s default (Mac fastest per case 0.12 s, the bundle 0.55 s) |
| `src/core/browser/pageStarts.integration.test.ts` | a page's saved start run through a real shell: a loopback server that answers, a start that exits first, a wait that runs out, and the stop of its process group | 15 s (Mac whole file 4.1 s, 3.5 s of it the wait that proves a stopped start never answers) |
| `src/core/helper/browsers.starts.integration.test.ts` | a page's saved start on a computer that runs work, heard at the home: kept and run there by a real shell, read as starting at the home, stopped by the captain's Stop browser, and a failed start reaching the home's wake with its exit code | 20 s (Mac whole file 0.6 s of tests) |
| `src/core/helper/sourceBuild.integration.test.ts` | the Mac's own tar unpacking a gzipped archive of a stand-in home's tree, built with tar: building the home's source on a computer that runs work, and a failed step leaving its old copy | 5 s default (Mac whole file 39 ms of tests) |
| `src/core/tasks/keptRunning.integration.test.ts` | a kept job's real check and remove commands run through the shell, here and through a computer's answer to the kept-job order: Kept running's Check and Remove | 10 s (Mac whole file under 0.1 s of tests) |
| `src/core/tasks/leftoverPrograms.integration.test.ts` | real detached programs, `lsof` on a Mac or `/proc` on Linux, a registered stop run through the shell: a discarded task's leftover programs, and the programs its close leaves alone | 10 s (Mac slowest case 2.5 s) |
| `src/core/homeMove/homeMove.test.ts` | real git for each project's bundle and clone on both sides of a move, at the run's own priority, and the commit's two-second wait before it asks a computer out of reach again | 10 s for the file; 15 s on the abandon asked again, 30 s on starting the first mate here again, which waits out several asks |
| `src/core/standby/standby.test.ts` | real SQLite logs and files on a scratch home and two scratch work folders, enough writes to pass SQLite's own fold-back threshold, a folder made read-only, the watch's own reports of each write, the stream's two-second wait before it asks a computer again, and a second of saves during that wait | 20 s per case (Mac whole file 7.5 s, slowest case 2.7 s, the lost answer that waits out one ask again) |
| `src/core/helper/workingCopies.test.ts` | real git: a computer's clones, working copies and bundles, at the run's own priority | 10 s |
| `src/core/placed/placedCallbacks.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority, and a forked program process for a program started from the computer | 10 s |
| `src/core/placed/placedReach.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority | 10 s |
| `src/core/placed/placedJobs.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority | 10 s |
| `src/core/placed/placedWorkingCopies.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority | 10 s |
| `src/core/placed/placedLostStarts.test.ts` | real git on both sides of a placed task's working copy and a connection that goes and comes back, at the run's own priority | 10 s |
| `src/core/placed/placedSignIns.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority | 10 s |
| `src/core/placed/placedOutside.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority; a vite build and the forked command process of a computer's task channel | 10 s |
| `src/core/placed/placedRunsOn.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority | 10 s |
| `src/core/placed/placedComputers.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority | 10 s |
| `src/core/placed/placedPersonal.test.ts` | real git on both sides of a placed task's working copy, at the run's own priority: the home's personal set kept on the computer by the app's own triggers | 10 s |
| `src/core/placed/placedAccounts.test.ts` | real git for each side's workspace of a placed task, at the run's own priority | 5 s default |
| `src/core/placed/placedCutOff.test.ts` | real git for each side's workspace of a placed task whose sign-in there is cut off, at the run's own priority | 10 s |
| `src/core/placed/placedUpdateSave.test.ts` | real git for each side's workspace of a placed task saved before its computer's update, at the run's own priority | 10 s |
| `src/core/helper/cleanUp.test.ts` | real git: what a removal takes from a computer's clones and working copies, at the run's own priority; a worker thread holding the route's lock, and that lock's fixed 2 s wait | 30 s |
| `src/core/helper/runForce.test.ts` | stuck Node processes ending themselves on a worker thread at a force stop, and a stop no program acts on held for its 1 s wait; on a Mac or Linux a run of its own starting the command's own reading and helper from the source, a FIFO this account may not open | 15 s |
| `src/main/personWord.integration.test.ts` | real Node processes standing in for the copy of the program that shows a refused launch's word, started through the source: replies said late, malformed or by a crashed copy, a copy that cannot start, a profile that cannot be made, one made and recorded in the data folder and used again, a private folder no record names, a recorded folder others may reach, a macOS access list that lets someone else in, and a file or link at a record's name all left as they are, a word taken away from a copy that ignores its end or whose box holds its main thread, and a requester that dies while its copy's temporary files outlive the next holder's clearing | 10 s |
| `tests/serviceManagerStandIn.test.ts` | the journeys' stand-in service manager running a real job under its detached supervisor, which dies before its run exits (Mac and Linux) | 15 s |
| `src/core/claude/claudeModelProbe.test.ts` | the installed Claude client | 10 s |
| `tests/replay-captain-session.test.ts` | the replay CLI, git | 60 to 240 s |
| `tests/replay-synthetic-recordings.test.ts` | the replay engine's git, over recordings each test writes | 5 s default, 60 s on each card-thread, crewmate-turn and labels-and-surfaces replay |
| `tests/release-contract.test.ts` | node, brew, and on a Mac the Electron binary running the release gates' stand-in app (`tests/fixtures/launch-gate-app`) | 10 s default, 50 s on each gate's run of the stand-in (Mac fastest: launch gate 9.5 s, data-folder check 4.7 s), 180 s on brew style |
| `tests/mac-app-launcher.test.ts` | Apple's compiler, Electron's own app cloned as a stand-in and started, ad-hoc `codesign`, `open` and LaunchServices in the runner's login session (Mac only, a probe) | 15 s on each case that starts the stand-in (Mac fastest 3.0 s, an Electron start), 10 s on making the stand-in (Mac fastest 1.2 s) |
| `tests/release-workflows-*.test.ts` (one file per workflow owner) | node, git, shell stand-ins, and real Vitest file discovery; portable workflow contracts, isolated in the integration cohort and absent from the Mac-only file list | 10 s default, 15 s on file discovery |
| `tests/release-publication.test.ts` | the release workflow's tap and release-asset scripts: real git on a stand-in tap, the publication CLI, a stand-in `gh`, `brew` and `curl` | 50 s |
| `tests/release-notes.test.ts` | the release-notes gate: real git on scratch repositories with commits and tags, the `scripts/release-notes.ts` CLI | 10 s |
| `tests/universal-file-types.test.ts` | the system `file` behind a counting stand-in, over Electron's distribution and darwin prebuilds | 15 s (Mac whole file 2.4 s) |
| `tests/cask-consumers.test.ts` | a scratch clone of the installed Homebrew (macOS only, skipped without it), git, ditto, the publication CLI | 340 s |
| `tests/installed-update-fixtures.test.ts` | real ASAR archives, SQLite, scratch saved-work moves, child-command failures and ZIP ticket-byte comparisons; no signing | 5 s default |
| `tests/installer-packaging.test.ts` | actual packaging commands with a stopping packager stand-in and the executable environment guard; no signing | 5 s default |
| `tests/detach-disk-image.test.ts` | `scripts/detach-disk-image.sh` with stand-in `hdiutil` and `lsof` replaying a busy unmount | 5 s default |
| `tests/apt-install.test.ts` | `scripts/apt-install.sh` with stand-in `sudo` and `apt-get` replaying apt's simulated plans | 5 s default |
| `tests/installer-reuse.test.ts` | scratch git histories and ZIP extraction, recorded forge metadata and streamed artifact-integrity checks; no network or signing | 5 s default |
| `src/core/hostEnv.test.ts` | stub login shells; real git for the variables it lists and a child's answer | 10 s on the hang test |
| `tests/export-tasks.test.ts` | node, pnpm | 60 s |
| `tests/corpus-tools-plain-node.test.ts` | plain Node runs of the corpus and replay commands, three over recorded sessions, and four commands read through a pipe, two of them over a seeded tables dump and a database built with the app's migrations | 5 s default (Mac slowest 0.98 s, the database one) |
| `tests/account-eval.test.ts` | twenty independently owned one-case production sessions (all ten cases on each backend), two 503/no-retry proofs, one ten-case Pi run proving every case opens with its sheet allowance, one Pi case refused on a scripted local endpoint, one Claude case cut mid-answer on one, the complete ten-case no-call sheet, plus the Claude crewmate's client read from the real process table and a mock Claude run stopped when that client ends; local mock provider and boxed Claude client | 30 s kept per case |
| `tests/stall-recovery-eval.test.ts` | real git: the disposable project's committed branch and the working copies started from it, at the run's own priority | 25 s |
| `tests/eval-auth-turn-taking.test.ts` | two processes on a scratch auth file and local fake OAuth server, for two provider ids | 5 s default |
| `tests/module-runner.test.ts` | plain Node core imports and task-export CLI, occupied WebSocket port | 15 s |
| `tests/wait-window.test.ts` | node children frozen with SIGSTOP and let go, against the waits of `tests/helpers/waitWindow.ts`; five nested vitest runs of a fixture config, each process group frozen or its disk stalled, the longest waiting out its 30 s cap | 10 s; 90 s on the nested runs |
| `tests/control-connection.test.ts` | real loopback POSTs across a frozen disposable control server, plus finite idle expiry | 20 s |
| `tests/load-clock.test.ts` | five real Playwright runs of a fixture config, four process groups frozen with SIGSTOP and let go, the longest waiting out its 20 s cap | 60 s |
| `tests/starve-check.test.ts` | the load controller over real detached process trees, children stopped at birth, a parent waiting in vfork on its stopped child, another user's descendant, cancellation and its experiment limit | 25 s |
| `tests/heavy-run-place.test.ts` | the real task channel, command processes and native load wrappers over a disposable line on its two-second cadence; two real Playwright runs of a fixture config through the e2e global setup, one admitted by the line and one from a shell with no line, a client process killed while holding, and a nested run; three Playwright listings of the e2e config alone, which load no spec, so their work does not grow with the suite | 25 s (fastest slowest case 4.4 s on a Mac; a listing 1.2 s cold) |
| `tests/heavy-run-place-phone.test.ts` | the same task channel, command processes and line, with the `test:phone` gate's group stopped while it waits; macOS only, on the Mac lane's list | 25 s (2.6 s on a Mac) |
| `tests/phone-activity.test.ts` | two live phone-activity supervisors, real process-start readings and private atomic files through cleanup | 5 s default |
| `tests/phone-deadlines.test.ts` | a stand-in command that never returns, with a child of its own, ended at its deadline through real `ps` readings and signals, and a stand-in log read the same way (INF-5387's plan, piece 1) | 5 s default |
| `tests/phone-failure-logs.test.ts` | real child pipes, failure diagnostics, and a log exceeding V8's string ceiling, written, read and hashed | 55 s for the large log; 5 s default elsewhere |
| `tests/journey-timing-workflow.test.ts` | real git checkouts and the workflow's Node export command over the captured Linux timing report; no network or signing | 5 s default |
| `tests/mac-check-lock.test.ts` | actual workflow commands and the `test:phone` package script, held Node workloads checking concurrent starts, failure status and cancellation, on macOS/Linux | 5 s default |
| `tests/virtual-mac-phone.test.ts` | Node tool-cache installation, guest-service settings, clean shutdown, runtime import and phone scripts against stand-ins, real git, bash and tar on a scratch working copy | 5 s default |
| `tests/phone-release-process.test.ts` | the dispatched release command, temporary key fixtures and stand-in Xcode/upload commands; no signing or network | 5 s default |
| `tests/run-evidence-playwright.test.ts` | two overlapping Playwright runs of a fixture config through the e2e global setup, its microphone check off; the build guard (node, `ps`) under one held run | 15 s |
| `src/core/orchestrator/captainOverrides.checks.test.ts` | real git in the kept merge fixture's project folder, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/crewBrief.context.test.ts` | real git in scratch projects for the brief's directions and knowledge, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/crewPrograms.test.ts` | real git and each program's own child process, at the run's own priority | 5 s default (Mac slowest case 0.8 s) |
| `src/core/orchestrator/crewmatePrograms.test.ts` | real git and each program's own child process, at the run's own priority | 5 s default (Mac slowest case 1.0 s) |
| `src/core/orchestrator/crewTurns.whoseTurn.test.ts` | real git for a few cases, at the run's own priority, and a local HTTP server whose stream one case cuts for Pi's own retry | 5 s default; 30 s on the cut stream case, kept (Mac slowest case 1.0 s, the cut stream 0.1 s) |
| `src/core/orchestrator/crewTurns.workspace.test.ts` | real git in the personal workspace's folder, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/crewWatch.git.test.ts` | real git and `chmod` for closed tasks' working copies and the check watch, at the run's own priority | 60 s on the working copies describe, kept; 5 s default elsewhere (Mac slowest case 0.6 s) |
| `src/core/orchestrator/idleLadder.waits.test.ts` | real git for one wait case, at the run's own priority | 5 s default (Mac slowest case 0.7 s) |
| `src/core/orchestrator/idleLadder.mergeLine.test.ts` | real git in the kept merge fixture's project folder, at the run's own priority | 5 s default (Mac slowest case 1.0 s) |
| `src/core/orchestrator/ownBatchChange.test.ts` | real git in one case's project folder, for a repair declared after a send-back, at the run's own priority | 5 s default (Mac slowest case 0.3 s) |
| `src/core/orchestrator/inPlaceWork.folders.test.ts` | real git in a project's folder, at the run's own priority | 60 s on each real-git describe, kept above the rule's 10 s (Mac slowest case 1.2 s) |
| `src/core/orchestrator/intake.git.test.ts` | real git for settle facts, delivery overrides, typed results and branch_from, at the run's own priority | 5 s default; 60 s on branch_from, kept (Mac slowest case 0.6 s) |
| `src/core/orchestrator/reviews.tier.test.ts` | real git in scratch projects for the reviewed tier, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/settleOwners.keptMerge.test.ts` | real git in the kept merge fixture's project folder, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/settleOwners.keptMergeRepairs.test.ts` | real git in the kept merge fixture's project folder, at the run's own priority | 5 s default (Mac slowest case 0.8 s) |
| `src/core/orchestrator/settleOwners.keptMergeUnknown.test.ts` | real git in the kept merge fixture's project folder, at the run's own priority | 5 s default |
| `src/core/orchestrator/starts.automatic.test.ts` | real git for a task Automatic places, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/starts.lost.test.ts` | real git in a scratch project for a task placed on a stand-in computer that runs work, at the run's own priority | 5 s default (Mac slowest case 0.4 s) |
| `src/core/orchestrator/taskMoves.computer.test.ts` | real git across two computers' working copies, at the run's own priority | 10 s on the moves to another computer, kept: its slowest case (Mac fastest 4.4 s) mostly waits out a quit's fixed 2 s settle, 1.4 s with that wait shortened; 5 s default elsewhere |
| `src/core/orchestrator/reviews.test.ts` | real git in scratch projects for the review cases, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/reviews.wakes.test.ts` | real git in scratch projects for the review cases, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `src/core/orchestrator/crewBrief.test.ts` | real git in scratch projects for some rigor and picture cases, at the run's own priority | 5 s default (Mac slowest case 0.6 s) |
| `tests/e2e-lanes.test.ts` | playwright --list over every spec, and the real runner over fixture specs | 60 s; 180 s on the listing (Linux fastest 35.7 s; it grows with the suite) |
| `tests/failure-annotations.test.ts` | the real Playwright and Vitest configurations over one failing fixture test each, a generator's check in a scratch tree and the merge batch's stop steps in bash, as a check inside GitHub Actions runs them | 15 s (a Mac fastest 0.6 s a case; not yet measured on Linux) |
| `tests/batch-read.test.ts` | real git: a project served from a folder, fetched by the merge batch's `Read the batch` step in bash as a check inside GitHub Actions runs it | 5 s default (Mac fastest 0.36 s) |
| `tests/journey-groups.test.ts` | node running the journey groups command with a stand-in pnpm, and playwright --list over one spec | 5 s default; 60 s on the listing |
| `tests/checks-mode.test.ts` | git with a scratch home's settings, the `test:phone` and `replay:gate` package scripts, the real Playwright runner over one spec, each refusing before setup | 5 s default, 30 s on the runner |
| `tests/e2e-contract-lint.test.ts` | Biome, with the repository's plugins, over a fixture spec | 5 s default |
| `tests/replay-gate-catches-lock-refusal.test.ts` | the replay CLI, git | 60 s |
| `src/core/claude/claudeRenewProbe.test.ts` | a recording client; the installed Claude client only with `INFINITARY_CLAUDE_RENEW_PROBE=1` on disposable Linux | 5 s default; 240 s on each opt-in leg |
| `tests/run-temp-root.test.ts` | a nested vitest run | 120 s |
| `tests/generate-self-source.test.ts` | node, git archive | 60 s |
| `src/core/sql/sqlService.test.ts` | a forked SQL process, bundled with vite | 5 s default (60 s on the bundling `beforeAll`, kept) |
| `src/core/files/fileReachLocks.integration.test.ts` | the forked process a file is set aside in and a Node process holding a database open, both bundled with vite, and a fresh Node reader | 5 s default (Mac fastest per case 0.43 s; 60 s on the bundling `beforeAll`) |
| `src/core/program/programRunner.test.ts` | a forked program process per program, the entry as it stands | 5 s default |
| `src/core/program/programRunner.crew.test.ts` | a forked program process per program under a crew supervisor, real git for its project | 5 s default (Mac slowest case 0.9 s) |
| `src/core/claude/claudeToolSurface.test.ts` | the Claude client, through the SDK, and boxed on the seat's harness against a local stub API | 180 s on each client run |
| `src/core/claude/claudeFirstmateSession.integration.test.ts` | the SDK's own client, boxed, against a per-case local stub API | 15 s |
| `tests/replay-claude-session.test.ts` | the SDK's own client, boxed, against a local stub API, under the real first mate agent | 15 s |
| `src/core/claude/claudeClassifierSession.integration.test.ts` | the SDK's own client, boxed, against a local stub API; the kind scorer's CLI | 15 s |
| `src/core/claude/claudeCrewAgents.integration.test.ts` | the SDK's own client, boxed, with agent definitions planted around a crewmate, against a local stub API | 10 s (Linux slowest per-case minimum 1.966 s) |
| `src/core/claude/claudeCrewContract.integration.test.ts` | the installed Claude client, else the SDK's own, boxed, reopening a crewmate's conversation across a changed prompt, a changed tool description or a lost tool, against a local stub API | 40 s (Mac fastest 1.285 s per case; four client starts at Linux's 2 s) |
| `src/core/claude/claudeAttribution.integration.test.ts` | the boxed Claude client against a local stub API, a crewmate with a staged skill in a git working copy, with and without the attribution setting | 15 s (Linux slowest per-case 2.919 s) |
| `src/core/claude/claudeCommandTimeLimit.integration.test.ts` | the boxed Claude client against a local stub API, two crewmate turns with and without the command time limit setting | 20 s (Mac slowest per-case 3.12 s, two client starts) |
| `src/core/claude/claudeAutoMemory.integration.test.ts` | the boxed Claude client against a local stub API, with planted personal notes across crewmate, seat and question sessions | 15 s (Linux slowest per-case minimum 2.060 s) |
| `src/core/claude/claudeEntrypoint.integration.test.ts` | the boxed real Claude client and a local stub API: all three role identities, persisted rolling messages, a resumed conversation and an SDK-default control | 10 s (Linux resumed two-launch case 1.984 s) |
| `src/core/claude/claudeToolWait.integration.test.ts` | the SDK's own client, boxed, whose one app tool waits 3 s, against a local stub API | 20 s |
| `src/core/claude/claudeToolNames.integration.test.ts` | the boxed Claude client against a local stub API, a crewmate with a staged skill in a git working copy calling an app tool by its own name | 15 s (Mac fastest 0.418 s; Linux by `claudeAttribution`'s same shape, slowest per-case 2.919 s) |
| `src/core/claude/claudeCrewCard.integration.test.ts` | the SDK's own client, boxed, with a crewmate's own tools, against a local stub API | 5 s default (five times its fastest is 3.3 s) |
| `src/core/claude/claudeProjectResources.integration.test.ts` | the SDK's own client, boxed, with a working copy's instructions, skills and settings and the folders above it planted around a crewmate, against a local stub API | 20 s (Linux staging case's fastest is 3.523 s) |
| `src/core/claude/claudeSession.contract.integration.test.ts` | the SDK's own client, boxed, against a local stub API, under the session contract's suite | 15 s |
| `src/core/claude/claudeSession.integration.test.ts` | the SDK's own client, boxed, against a local stub API, running a background shell sleep; and under a real supervisor, a foreground sleep that a close or a quit cuts | 15 s |
| `src/core/claude/interruptWedge.integration.test.ts` | the SDK's own client, boxed, under the work computer's `SessionHost`, against a local stub API that never answers; the client frozen with SIGSTOP and stopped by the session | 30 s (a case that closes the session waits out the SDK's fixed 7 s from its close to SIGKILL; Mac about 7.8 s for those cases, 0.7 s for the other) |
| `src/core/claude/claudeClientExit.integration.test.ts` | the SDK's own client, boxed, against a per-case local stub API; the client frozen with SIGSTOP while a question is given up on or a crewmate's session is closed | 30 s (each case waits out the SDK's fixed 7 s from its close to SIGKILL; Mac fastest 7.3 s per case) |
| `tests/bench-attempt.test.ts` | the benchmark attempt CLI: the whole core, real git, the e2e mock provider | 95 s |
| `src/core/claude/claudeFirstmateSeat.live.test.ts` | the installed Claude client on the machine's own login (opt-in, `INFINITARY_CLAUDE_SEAT_LIVE=1`) | 180 s opt-in |
| `src/core/core.settings.test.ts` | the whole core: git at the run's own priority, the login shell, the MCP stand-in as a Node child | 60 s on its boot; 20 s on adding three MCP servers (Linux fastest 3.567 s, three child starts) |
| `src/core/core.settingsParity.test.ts` | the whole core: git at the run's own priority, the login shell, a kept job's check as a shell command | 60 s on its boot |
| `src/core/core.projects.test.ts` | the whole core: git at the run's own priority, the login shell | 60 s on its boot |
| `src/core/core.capture.test.ts` | the whole core, real git, the e2e mock provider's Firstmate and crewmate sessions | 120 s on its boot and on each captain turn |
| `src/core/core.boot.test.ts` | the whole core, booted once per case, real git | 60 s default per boot |
| `src/core/core.connection.test.ts` | the whole core and its connection on loopback, the e2e mock provider | 60 to 120 s on its boots |
| `src/core/dispatcher.media.test.ts` | the whole core and a recording read through dispatch | 20 s (Mac slowest 3.594 s) |
| `src/core/dispatcher.placement.test.ts` | the whole core, real git and a project placement change | 30 s (Mac slowest 3.683 s) |
| `src/core/core.contract.test.ts` | the whole core, its connection on loopback, the scripted client as its own process | 60 s on its boot |
| `src/core/core.wiring.test.ts` | the whole core, a loopback GitHub and GitLab stand-in, the e2e mock provider | 120 s on its boot and its one first mate turn |
| `tests/replay-gate-catches-lint.test.ts` | the replay CLI, git | 60 s |
| `src/core/batches/combine.test.ts` | real git against a bare host, at the run's own priority | 10 s (Mac slowest 1.1 s) |
| `src/core/orchestrator/baseFollow.test.ts` | real git in a scratch repository, at the run's own priority | 12 s (Mac slowest 2.4 s) |
| `src/core/forge/providers/plainGit.test.ts` | real git, at the run's own priority | 5 s default (five times its slowest is 2.5 s) |
| `tests/bench-patch-pool.test.ts` | real git, python3's tomllib (benchmark tooling, `scripts/bench/`) | 5 s default |
| `src/core/personal/personalExtensions.test.ts` | real git, at the run's own priority | 5 s default |
| `tests/test-workload.test.ts` | node | 5 s default |
| `src/core/jobs/jobManager.test.ts` | bash jobs, the login shell | 5 s default |
| `src/core/personal/workspace.test.ts` | real git, at the run's own priority | 5 s default |
| `tests/local-codesign.test.ts` | node, a stub `security` | 5 s default |
| `tests/mockClaudeClient.test.ts` | the e2e Claude stub and a recording client, a shell | 5 s default |
| `src/core/personal/sequencesSkill.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/personal/liveWorkspace.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/workspace/git.test.ts` | the app's own git and a stand-in, its launcher built with the C compiler, a shell | 5 s default |
| `src/main/host/linuxSecretCustody.thread.test.ts` | actual native worker identity through libc, with no credential-store access | 5 s default |
| `src/core/utilityQos.test.ts` | taskpolicy children | 5 s default |
| `src/core/orchestrator/firstmateAgent.actions.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.addressWay.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.capture.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.context.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.delivery.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.flagship.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.inbox.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.knowledge.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.lane.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.provenance.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.reply.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.seat.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.tools.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/orchestrator/firstmateAgent.turns.test.ts` | real git, at the run's own priority | 5 s default |
| `tests/ensure-electron-installed.test.ts` | node, a shell, electron-builder's own argument reader and Electron download against a local stand-in for GitHub's release server | 5 s default, 10 s on the package steps (Mac slowest case 1.0 s) |
| `tests/electron-builder-tools.test.ts` | bash, tar, electron-builder's own tool downloader against a loopback stand-in | 5 s default |
| `tests/pnpm-action.test.ts` | bash, tar, and twice the project's own pnpm against a loopback stand-in for npm's registry | 5 s default, 20 s on the case that runs pnpm (Mac fastest 3.3 s) |
| `tests/check-installed-packages.test.ts` | tar, and twice the project's own pnpm against a loopback stand-in for npm's registry, with the check as the project's `postinstall` | 20 s (Mac fastest 3.0 s) |
| `tests/checkout-patience.test.ts` | bash and curl against a loopback stand-in for GitHub's git address | 5 s default |
| `tests/docs-site-publish-workflow.test.ts` | bash and real git, with a scratch bare repository as origin | 5 s default |
| `tests/typecheck.test.ts` | the pinned checker through its real command, a scratch copy of the settings words and incremental imports, missing/failed native executables | 20 s for the eleven-check incremental journey; 5 s default elsewhere |
| `tests/install-clones.test.ts` | `cp -c`, tar, the installed ONNX runtime files, APFS's private size through koffi | 5 s default |
| `src/core/claude/claudeLoginProbe.test.ts` | the installed Claude client | 5 s default |
| `src/core/personal/panelInstructions.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/pi/customApiCertificates.integration.test.ts` | a local HTTPS server and the custom-API certificate review | 5 s default |
| `tests/e2e/scenarios/mergeShell.test.ts` | disposable git commits and rebases through both merge scripts, with inline output or a job receipt and exit | 5 s default |
| `src/core/integrations/providers/mcp/mcpIntegration.test.ts` | a stand-in MCP server in both protocol eras, as a Node child over stdio and on a local HTTP server, through the integrations service | 10 s (Mac slowest per-case minimum 0.643 s, two child starts) |
| `src/core/claude/claudeCli.test.ts` | stub client executables | 5 s default |
| `src/core/hostEnv.gitSignIn.test.ts` | real git, openssl, a local HTTPS host | 5 s default |
| `src/core/workspace/repoRegistry.test.ts` | real git, at the run's own priority | 5 s default |
| `src/core/workspace/projectContributions.test.ts` | disposable upstream and fork repositories, real fetch and branch pushes at the run's own priority | 5 s default |
| `src/core/forge/signIns.test.ts` | the app's git sign-in helper script | 5 s default |
| `src/core/pi/personalizeTool.test.ts` | real git | 5 s default |
| `src/core/plugins/pluginInstaller.test.ts` | real git at the run's own priority, npm pack (a local registry that answers nothing), tar | 10 s on the npm test, 5 s default for the rest |
| `src/main/host/darwinKeychain.scratch.test.ts` | `security` (opt-in, `INFINITARY_SCRATCH_KEYCHAIN_PROBE=1`) | 120 s on the opt-in unlock test, 5 s default for the rest |
| `src/main/host/darwinSecretCustody.scratch.test.ts` | `security` on a scratch keychain file (opt-in, `INFINITARY_SCRATCH_KEYCHAIN_PROBE=1`), Secrets custody through the real Security.framework binding | 5 s default (Mac 0.2 s) |
| `src/main/host/darwinFreshAuthentication.test.ts` | macOS LocalAuthentication with its prompt refused (macOS only) | 5 s default |
| `src/main/host/linuxSecretCustody.test.ts` | a private session bus and gnome-keyring under a scratch HOME, driven from a Node child; on a throwaway GitHub-hosted runner `apt-get` installs them first (Linux only, a probe) | 450 s on the install (Linux hosted runner 90 s); 5 s default for the tests (Linux slowest 0.4 s) |
| `src/main/host/linuxFreshAuthentication.test.ts` | stand-in `pkcheck` and `pkaction` scripts, and the system's polkit where installed (Linux only) | 5 s default |
| `src/core/secrets/protected.test.ts` | `/bin/sh` recipients started from private copies, `mkfifo` | 5 s default |
| `src/main/host/chrome/chromeEngine.integration.test.ts` | the installed Google Chrome, started on its private pipe against a local site and the real connection guard; skipped where Chrome is not installed, or on a Linux computer with no display (a probe) | 15 s (Mac slowest case 3.4 s, the rest about 1.1 s) |
| `src/main/host/keychainProcess.integration.test.ts` | bundled native-reader orchestration in real child processes, with blocked-call stand-ins | 5 s default |
| `src/main/faultSignals.integration.test.ts` | two Node children that load proper-lockfile and stop on a real trap instruction; one that freezes instead is ended at 5 s (not on Windows) | 10 s per case (Mac case about 0.1 s) |
| `src/main/runHandOver.integration.test.ts` | real Node processes holding a scratch older folder by its locks, `ps` on a Mac or `/proc` on Linux, the ordinary stop and a forced one, and the one-time move with the system's copier: a run's hand-over in its terminal | 10 s |
| `src/main/host/claudeKeychainAccess.integration.test.ts` | isolated `security` on a throwaway keychain, and an ad-hoc `codesign` of the large app it builds (darwin only) | 5 s default; 15 s on building the app (Mac fastest 2.4 s) |
| `src/core/devices/remoteLogin.test.ts`, `remoteLoginFound.test.ts`, `remoteLoginUpdate.test.ts`, `remoteLoginPassword.test.ts`, `remoteLoginLink.test.ts`, `remoteLoginUbuntu.test.ts`, `remoteLoginForward.test.ts` | the Mac's own `sshd` on loopback (`tests/helpers/sshServer.ts`, macOS only, skipped without it), ssh, ssh-keygen, tar, curl, openssl, through the home in `tests/helpers/remoteLoginHome.ts` | 15 s (Mac slowest per-case fastest 2.1 s); 30 s on the check-line, proxy and password tests |
| `src/core/devices/remoteLoginDownload.test.ts` | the same, and a release of its own on loopback for the Mac's download (macOS only) | 30 s on the whole describe (Mac slowest per-case fastest 5.7 s) |
| `src/core/devices/relay.test.ts` | a stand-in relay on Node, and on macOS `/usr/bin/nc`, carrying the real connection on loopback | 5 s default |
| `src/core/devices/dnsSd.test.ts` | a stand-in for macOS's dns-sd, a shell script per run (`tests/helpers/dnsSdStandIn.ts`); the held run (`runDnsSdHeld`) waits out a one-second `-t`, 1.4 s the slowest | 5 s default |
| `src/core/helper/fromHome.test.ts` | a folder held by a live process, waited for on the real clock | 5 s default |
| `src/core/devices/computerUpdate.test.ts` | real TLS on loopback and the Mac's own tar, a computer's run started again on the real clock; on a Mac, a download from a local HTTPS release with curl, shasum, ditto and a stand-in codesign; an update's watcher in the system's shell with a stand-in launchctl | 10 s |
| `src/core/devices/farSystems.test.ts` | `/bin/sh` running the look, the removal and the controller a home sends, with the system's own tools the look asks | 30 s |
| `src/core/devices/phoneDoor.test.ts` | each login shell this computer has (sh, bash, zsh, dash, tcsh, csh) running the phone's fixed commands, with the system's curl reaching the door on loopback | 5 s default (Mac slowest 0.1 s) |

Measure with the project's own worker count and no ceiling, several times, and take each test's fastest run.
Noise only ever adds time:

```sh
pnpm exec vitest run --project integration --testTimeout=180000 --reporter=json --outputFile=run.json
```


## Notes moved from AGENTS.md

Moved verbatim from `AGENTS.md` on 2026-09-24; `docs/README.md` lists this page.

- Test cohorts (captain's A1, 2026-09-24; `docs/test-cohorts.md` is the one home): vitest runs three cohorts in five projects - `pure` (`src/shared`, one shared module cache), `unit`/`unit-isolated` (in memory, vitest's 5 s default) and `integration` (real git, pnpm and child processes: eight workers on Mac, four elsewhere, no more than memory holds, after the other two, each file stating a budget sized to its measured work), whose probes run as `probe` after it.
  The integration list is ONE list, the exclusions of biome.json's unit-cohort override: that override runs `tests/lint/unit-cohort.grit` (no `child_process` or `timers/promises` import in a unit test, and none of the product's spawn-only modules, `workspace/git`, `sql/forkChildProcess`, `devices/ssh`, `devices/relay` and `devices/dnsSd`; type-only imports pass) and `vitest.config.ts` reads the same list.
  A new test that spawns fails `pnpm check` until it is listed there with a measured budget; never raise a unit test's timeout instead.
  `pnpm exec vitest run --project <name> <files>` runs one cohort's files.
